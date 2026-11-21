use super::*;

const JAKARTA_TODAY: &str = "(NOW() AT TIME ZONE 'Asia/Jakarta')::date";
const BATCH_SELECT: &str = "SELECT b.id, b.name, b.registration_start::text AS registration_start, b.registration_end::text AS registration_end, b.interview_start::text AS interview_start, b.interview_end::text AS interview_end, b.all_units, ARRAY(SELECT d.department_id FROM application_batch_departments d WHERE d.batch_id = b.id ORDER BY d.department_id) AS department_ids, (SELECT COUNT(*) FROM applications a WHERE a.batch_id = b.id) AS application_count FROM application_batches b";
const OVERLAP_MESSAGE: &str =
    "Tanggal batch bentrok dengan batch lain. Pilih rentang tanggal yang tidak tumpang tindih.";

#[derive(Clone, FromRow, Serialize)]
pub(super) struct BatchRecord {
    id: i64,
    name: String,
    registration_start: String,
    registration_end: String,
    interview_start: String,
    interview_end: String,
    all_units: bool,
    department_ids: Vec<i64>,
    application_count: i64,
}

#[derive(Clone, Serialize)]
struct PublicBatch {
    id: i64,
    name: String,
    registration_start: String,
    registration_end: String,
    interview_start: String,
    interview_end: String,
    all_units: bool,
    department_ids: Vec<i64>,
}

impl From<&BatchRecord> for PublicBatch {
    fn from(batch: &BatchRecord) -> Self {
        Self {
            id: batch.id,
            name: batch.name.clone(),
            registration_start: batch.registration_start.clone(),
            registration_end: batch.registration_end.clone(),
            interview_start: batch.interview_start.clone(),
            interview_end: batch.interview_end.clone(),
            all_units: batch.all_units,
            department_ids: batch.department_ids.clone(),
        }
    }
}

#[derive(Deserialize)]
pub(super) struct BatchRequest {
    name: String,
    registration_start: String,
    registration_end: String,
    interview_start: String,
    interview_end: String,
    all_units: bool,
    #[serde(default)]
    department_ids: Vec<i64>,
}

struct ValidBatch {
    name: String,
    registration_start: String,
    registration_end: String,
    interview_start: String,
    interview_end: String,
    all_units: bool,
    department_ids: Vec<i64>,
}

fn parse_date(value: &str) -> Result<String, ApiError> {
    const INVALID: ApiError =
        ApiError::BadRequest("Tanggal harus berformat TTTT-BB-HH yang valid.");
    let value = value.trim();
    let bytes = value.as_bytes();
    if bytes.len() != 10
        || bytes[4] != b'-'
        || bytes[7] != b'-'
        || !bytes
            .iter()
            .enumerate()
            .all(|(index, byte)| index == 4 || index == 7 || byte.is_ascii_digit())
    {
        return Err(INVALID);
    }
    let year: i32 = value[0..4].parse().map_err(|_| INVALID)?;
    let month: u32 = value[5..7].parse().map_err(|_| INVALID)?;
    let day: u32 = value[8..10].parse().map_err(|_| INVALID)?;
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return Err(INVALID),
    };
    if !(2000..=2100).contains(&year) || day == 0 || day > days_in_month {
        return Err(INVALID);
    }
    Ok(value.to_owned())
}

fn validate_batch(request: BatchRequest) -> Result<ValidBatch, ApiError> {
    let name = request.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(ApiError::BadRequest(
            "Nama batch wajib diisi dan maksimal 80 karakter.",
        ));
    }
    let registration_start = parse_date(&request.registration_start)?;
    let registration_end = parse_date(&request.registration_end)?;
    let interview_start = parse_date(&request.interview_start)?;
    let interview_end = parse_date(&request.interview_end)?;
    // ISO dates compare correctly as strings.
    if registration_start > registration_end {
        return Err(ApiError::BadRequest(
            "Tanggal akhir pendaftaran tidak boleh sebelum tanggal mulai.",
        ));
    }
    if interview_start <= registration_end {
        return Err(ApiError::BadRequest(
            "Seleksi dan wawancara harus dimulai setelah pendaftaran ditutup.",
        ));
    }
    if interview_start > interview_end {
        return Err(ApiError::BadRequest(
            "Tanggal akhir wawancara tidak boleh sebelum tanggal mulai.",
        ));
    }
    let mut department_ids = request.department_ids;
    department_ids.sort_unstable();
    department_ids.dedup();
    if !request.all_units && department_ids.is_empty() {
        return Err(ApiError::BadRequest(
            "Pilih minimal satu unit kerja atau aktifkan semua unit kerja.",
        ));
    }
    if request.all_units {
        department_ids.clear();
    }
    Ok(ValidBatch {
        name,
        registration_start,
        registration_end,
        interview_start,
        interview_end,
        all_units: request.all_units,
        department_ids,
    })
}

async fn ensure_no_overlap(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    batch: &ValidBatch,
    excluding_id: Option<i64>,
) -> Result<(), ApiError> {
    sqlx::query("SELECT pg_advisory_xact_lock(4401)")
        .execute(&mut **transaction)
        .await
        .map_err(internal_error)?;
    let overlaps: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM application_batches WHERE ($1::BIGINT IS NULL OR id <> $1) AND registration_start <= $3::date AND interview_end >= $2::date)",
    )
    .bind(excluding_id)
    .bind(&batch.registration_start)
    .bind(&batch.interview_end)
    .fetch_one(&mut **transaction)
    .await
    .map_err(internal_error)?;
    if overlaps {
        return Err(ApiError::Conflict(OVERLAP_MESSAGE));
    }
    Ok(())
}

async fn ensure_departments_exist(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    department_ids: &[i64],
) -> Result<(), ApiError> {
    if department_ids.is_empty() {
        return Ok(());
    }
    let found: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM departments WHERE id = ANY($1)")
        .bind(department_ids)
        .fetch_one(&mut **transaction)
        .await
        .map_err(internal_error)?;
    if usize::try_from(found).ok() != Some(department_ids.len()) {
        return Err(ApiError::BadRequest("Ada unit kerja yang tidak ditemukan."));
    }
    Ok(())
}

async fn replace_batch_departments(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    batch_id: i64,
    department_ids: &[i64],
) -> Result<(), ApiError> {
    sqlx::query("DELETE FROM application_batch_departments WHERE batch_id = $1")
        .bind(batch_id)
        .execute(&mut **transaction)
        .await
        .map_err(internal_error)?;
    if !department_ids.is_empty() {
        sqlx::query(
            "INSERT INTO application_batch_departments (batch_id, department_id) SELECT $1, UNNEST($2::BIGINT[])",
        )
        .bind(batch_id)
        .bind(department_ids)
        .execute(&mut **transaction)
        .await
        .map_err(internal_error)?;
    }
    Ok(())
}

async fn fetch_batches(pool: &PgPool) -> Result<Vec<BatchRecord>, ApiError> {
    sqlx::query_as::<_, BatchRecord>(&format!(
        "{BATCH_SELECT} ORDER BY b.registration_start, b.id"
    ))
    .fetch_all(pool)
    .await
    .map_err(internal_error)
}

async fn jakarta_today(pool: &PgPool) -> Result<String, ApiError> {
    sqlx::query_scalar::<_, String>(&format!("SELECT {JAKARTA_TODAY}::text"))
        .fetch_one(pool)
        .await
        .map_err(internal_error)
}

pub(super) async fn admin_list_batches(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    let data = fetch_batches(&state.pool).await?;
    let today = jakarta_today(&state.pool).await?;
    Ok(Json(json!({ "data": data, "today": today })))
}

pub(super) async fn admin_create_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<BatchRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_super_admin(&state.pool, &headers).await?;
    let batch = validate_batch(request)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    ensure_no_overlap(&mut transaction, &batch, None).await?;
    ensure_departments_exist(&mut transaction, &batch.department_ids).await?;
    let result = sqlx::query_scalar::<_, i64>(
        "INSERT INTO application_batches (name, registration_start, registration_end, interview_start, interview_end, all_units, created_by, updated_by) VALUES ($1, $2::date, $3::date, $4::date, $5::date, $6, $7, $7) RETURNING id",
    )
    .bind(&batch.name)
    .bind(&batch.registration_start)
    .bind(&batch.registration_end)
    .bind(&batch.interview_start)
    .bind(&batch.interview_end)
    .bind(batch.all_units)
    .bind(admin.id)
    .fetch_one(&mut *transaction)
    .await;
    let batch_id = match result {
        Ok(id) => id,
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Nama batch sudah digunakan."));
        }
        Err(error) => return Err(internal_error(error)),
    };
    replace_batch_departments(&mut transaction, batch_id, &batch.department_ids).await?;
    record_admin_audit(
        &mut transaction,
        admin.id,
        "create",
        "application_batch",
        &batch_id.to_string(),
        json!({
            "name": batch.name,
            "registration": [batch.registration_start, batch.registration_end],
            "interview": [batch.interview_start, batch.interview_end],
            "all_units": batch.all_units,
            "department_ids": batch.department_ids,
        }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(
        json!({ "id": batch_id, "message": "Batch berhasil dibuat." }),
    ))
}

pub(super) async fn admin_update_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(batch_id): Path<i64>,
    Json(request): Json<BatchRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_super_admin(&state.pool, &headers).await?;
    let batch = validate_batch(request)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    ensure_no_overlap(&mut transaction, &batch, Some(batch_id)).await?;
    ensure_departments_exist(&mut transaction, &batch.department_ids).await?;
    let result = sqlx::query(
        "UPDATE application_batches SET name = $2, registration_start = $3::date, registration_end = $4::date, interview_start = $5::date, interview_end = $6::date, all_units = $7, updated_by = $8, updated_at = NOW() WHERE id = $1",
    )
    .bind(batch_id)
    .bind(&batch.name)
    .bind(&batch.registration_start)
    .bind(&batch.registration_end)
    .bind(&batch.interview_start)
    .bind(&batch.interview_end)
    .bind(batch.all_units)
    .bind(admin.id)
    .execute(&mut *transaction)
    .await;
    match result {
        Ok(done) if done.rows_affected() == 0 => {
            return Err(ApiError::NotFound("Batch tidak ditemukan."));
        }
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Nama batch sudah digunakan."));
        }
        Err(error) => return Err(internal_error(error)),
    }
    replace_batch_departments(&mut transaction, batch_id, &batch.department_ids).await?;
    record_admin_audit(
        &mut transaction,
        admin.id,
        "update",
        "application_batch",
        &batch_id.to_string(),
        json!({
            "name": batch.name,
            "registration": [batch.registration_start, batch.registration_end],
            "interview": [batch.interview_start, batch.interview_end],
            "all_units": batch.all_units,
            "department_ids": batch.department_ids,
        }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Batch berhasil diperbarui." })))
}

pub(super) async fn admin_delete_batch(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(batch_id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_super_admin(&state.pool, &headers).await?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let name = sqlx::query_scalar::<_, String>(
        "SELECT name FROM application_batches WHERE id = $1 FOR UPDATE",
    )
    .bind(batch_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::NotFound("Batch tidak ditemukan."))?;
    let application_count: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM applications WHERE batch_id = $1")
            .bind(batch_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(internal_error)?;
    if application_count > 0 {
        return Err(ApiError::Conflict(
            "Batch sudah memiliki lamaran sehingga tidak dapat dihapus.",
        ));
    }
    sqlx::query("DELETE FROM application_batches WHERE id = $1")
        .bind(batch_id)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    record_admin_audit(
        &mut transaction,
        admin.id,
        "delete",
        "application_batch",
        &batch_id.to_string(),
        json!({ "name": name }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Batch berhasil dihapus." })))
}

/// Phase of the recruitment cycle on a given day:
/// `registration` (a batch accepts applications), `selection` (registration closed, selection and
/// interviews still running), `upcoming` (idle, a later batch is scheduled) or `closed` (idle).
fn resolve_phase<'a>(
    today: &str,
    batches: &'a [BatchRecord],
) -> (
    &'static str,
    Option<&'a BatchRecord>,
    Option<&'a BatchRecord>,
    Option<&'a BatchRecord>,
) {
    if let Some(batch) = batches.iter().find(|batch| {
        batch.registration_start.as_str() <= today && today <= batch.registration_end.as_str()
    }) {
        return ("registration", Some(batch), None, None);
    }
    if let Some(batch) = batches.iter().find(|batch| {
        batch.registration_end.as_str() < today && today <= batch.interview_end.as_str()
    }) {
        return ("selection", Some(batch), None, None);
    }
    let previous = batches
        .iter()
        .filter(|batch| batch.interview_end.as_str() < today)
        .max_by(|a, b| a.interview_end.cmp(&b.interview_end));
    let next = batches
        .iter()
        .filter(|batch| batch.registration_start.as_str() > today)
        .min_by(|a, b| a.registration_start.cmp(&b.registration_start));
    (
        if next.is_some() { "upcoming" } else { "closed" },
        None,
        previous,
        next,
    )
}

pub(super) async fn public_current_batch(
    State(state): State<AppState>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let batches = fetch_batches(&state.pool).await?;
    let today = jakarta_today(&state.pool).await?;
    let (phase, current, previous, next) = resolve_phase(&today, &batches);
    Ok(Json(json!({
        "phase": phase,
        "today": today,
        "batch": current.map(PublicBatch::from),
        "previous_batch": previous.map(PublicBatch::from),
        "next_batch": next.map(PublicBatch::from),
    })))
}

/// The batch accepting applications today, if any, and whether `department_id` may apply in it.
pub(super) async fn registration_batch_for_department(
    pool: &PgPool,
    department_id: i64,
) -> Result<i64, ApiError> {
    let batch = sqlx::query_as::<_, (i64, bool)>(&format!(
        "SELECT id, all_units FROM application_batches WHERE {JAKARTA_TODAY} BETWEEN registration_start AND registration_end"
    ))
    .fetch_optional(pool)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::Conflict(
        "Pendaftaran belum dibuka atau sudah ditutup.",
    ))?;
    let (batch_id, all_units) = batch;
    if !all_units {
        let allowed: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM application_batch_departments WHERE batch_id = $1 AND department_id = $2)",
        )
        .bind(batch_id)
        .bind(department_id)
        .fetch_one(pool)
        .await
        .map_err(internal_error)?;
        if !allowed {
            return Err(ApiError::Conflict(
                "Unit tujuan tidak dibuka pada batch yang sedang berlangsung.",
            ));
        }
    }
    Ok(batch_id)
}

/// Applications still undecided when their batch's selection and interview period ends count as
/// rejected. The applicant gets the usual status notification with the reason.
pub(super) async fn reject_expired_applications(
    pool: &PgPool,
    push_service: Option<Arc<PushService>>,
) {
    let result = sqlx::query_scalar::<_, i64>(&format!(
        "WITH expired AS (SELECT applications.id, applications.applicant_id, applications.status AS previous_status, application_batches.name AS batch_name FROM applications JOIN application_batches ON application_batches.id = applications.batch_id WHERE applications.status IN ('submitted', 'screening', 'interview') AND application_batches.interview_end < {JAKARTA_TODAY} FOR UPDATE OF applications), updated AS (UPDATE applications SET status = 'rejected' FROM expired WHERE applications.id = expired.id RETURNING applications.id) INSERT INTO application_status_notifications (application_id, applicant_id, previous_status, new_status, reason) SELECT expired.id, expired.applicant_id, expired.previous_status, 'rejected', 'Periode seleksi dan wawancara ' || expired.batch_name || ' telah berakhir tanpa tindak lanjut.' FROM expired JOIN updated ON updated.id = expired.id RETURNING applicant_id"
    ))
    .fetch_all(pool)
    .await;
    match result {
        Ok(mut applicant_ids) => {
            if !applicant_ids.is_empty() {
                tracing::info!(
                    count = applicant_ids.len(),
                    "Rejected applications after batch period ended"
                );
            }
            applicant_ids.sort_unstable();
            applicant_ids.dedup();
            for applicant_id in applicant_ids {
                dispatch_applicant_push(pool.clone(), push_service.clone(), applicant_id);
            }
        }
        Err(error) => tracing::warn!(?error, "Could not reject applications of ended batches"),
    }
}
