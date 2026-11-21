use super::*;

const JAKARTA_TODAY: &str = "(NOW() AT TIME ZONE 'Asia/Jakarta')::date";
const BATCH_SELECT: &str = "SELECT b.id, b.name, b.registration_start::text AS registration_start, b.registration_end::text AS registration_end, b.interview_start::text AS interview_start, b.interview_end::text AS interview_end, b.all_units, b.max_applications, ARRAY(SELECT d.department_id FROM application_batch_departments d WHERE d.batch_id = b.id ORDER BY d.department_id) AS department_ids, ARRAY(SELECT bu.bureau_id FROM application_batch_bureaus bu WHERE bu.batch_id = b.id ORDER BY bu.bureau_id) AS bureau_ids, (SELECT COUNT(*) FROM applications a WHERE a.batch_id = b.id) AS application_count FROM application_batches b";
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
    max_applications: Option<i32>,
    department_ids: Vec<i64>,
    bureau_ids: Vec<i64>,
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
    max_applications: Option<i32>,
    department_ids: Vec<i64>,
    bureau_ids: Vec<i64>,
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
            max_applications: batch.max_applications,
            department_ids: batch.department_ids.clone(),
            bureau_ids: batch.bureau_ids.clone(),
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
    max_applications: Option<i32>,
    #[serde(default)]
    department_ids: Vec<i64>,
    #[serde(default)]
    bureau_ids: Vec<i64>,
}

struct ValidBatch {
    name: String,
    registration_start: String,
    registration_end: String,
    interview_start: String,
    interview_end: String,
    all_units: bool,
    max_applications: Option<i32>,
    department_ids: Vec<i64>,
    bureau_ids: Vec<i64>,
}

fn validate_application_limit(value: i32) -> Result<i32, ApiError> {
    if (1..=10_000).contains(&value) {
        Ok(value)
    } else {
        Err(ApiError::BadRequest(
            "Batas maksimal lamaran harus berupa bilangan bulat antara 1 dan 10000.",
        ))
    }
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
    let max_applications = request
        .max_applications
        .map(validate_application_limit)
        .transpose()?;
    let mut department_ids = request.department_ids;
    department_ids.sort_unstable();
    department_ids.dedup();
    let mut bureau_ids = request.bureau_ids;
    bureau_ids.sort_unstable();
    bureau_ids.dedup();
    if !request.all_units && department_ids.is_empty() && bureau_ids.is_empty() {
        return Err(ApiError::BadRequest(
            "Pilih minimal satu unit kerja atau aktifkan semua unit kerja.",
        ));
    }
    if request.all_units {
        department_ids.clear();
        bureau_ids.clear();
    }
    Ok(ValidBatch {
        name,
        registration_start,
        registration_end,
        interview_start,
        interview_end,
        all_units: request.all_units,
        max_applications,
        department_ids,
        bureau_ids,
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

async fn ensure_bureaus_exist(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    bureau_ids: &[i64],
) -> Result<(), ApiError> {
    if bureau_ids.is_empty() {
        return Ok(());
    }
    let found: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM bureaus WHERE id = ANY($1)")
        .bind(bureau_ids)
        .fetch_one(&mut **transaction)
        .await
        .map_err(internal_error)?;
    if usize::try_from(found).ok() != Some(bureau_ids.len()) {
        return Err(ApiError::BadRequest("Ada unit kerja yang tidak ditemukan."));
    }
    Ok(())
}

async fn replace_batch_bureaus(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    batch_id: i64,
    bureau_ids: &[i64],
) -> Result<(), ApiError> {
    sqlx::query("DELETE FROM application_batch_bureaus WHERE batch_id = $1")
        .bind(batch_id)
        .execute(&mut **transaction)
        .await
        .map_err(internal_error)?;
    if !bureau_ids.is_empty() {
        sqlx::query(
            "INSERT INTO application_batch_bureaus (batch_id, bureau_id) SELECT $1, UNNEST($2::BIGINT[])",
        )
        .bind(batch_id)
        .bind(bureau_ids)
        .execute(&mut **transaction)
        .await
        .map_err(internal_error)?;
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
    ensure_bureaus_exist(&mut transaction, &batch.bureau_ids).await?;
    let result = sqlx::query_scalar::<_, i64>(
        "INSERT INTO application_batches (name, registration_start, registration_end, interview_start, interview_end, all_units, max_applications, created_by, updated_by) VALUES ($1, $2::date, $3::date, $4::date, $5::date, $6, $7, $8, $8) RETURNING id",
    )
    .bind(&batch.name)
    .bind(&batch.registration_start)
    .bind(&batch.registration_end)
    .bind(&batch.interview_start)
    .bind(&batch.interview_end)
    .bind(batch.all_units)
    .bind(batch.max_applications)
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
    replace_batch_bureaus(&mut transaction, batch_id, &batch.bureau_ids).await?;
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
            "max_applications": batch.max_applications,
            "department_ids": batch.department_ids,
            "bureau_ids": batch.bureau_ids,
        }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(
        json!({ "id": batch_id, "message": "Batch berhasil dibuat." }),
    ))
}

/// A batch whose selection and interview period is over is history: it can no longer be edited.
/// Locks the row so the check and the update below cannot race.
async fn ensure_batch_editable(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    batch_id: i64,
) -> Result<(), ApiError> {
    let finished: bool = sqlx::query_scalar(&format!(
        "SELECT interview_end < {JAKARTA_TODAY} FROM application_batches WHERE id = $1 FOR UPDATE"
    ))
    .bind(batch_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::NotFound("Batch tidak ditemukan."))?;
    if finished {
        return Err(ApiError::Conflict(
            "Batch yang sudah selesai tidak dapat diubah.",
        ));
    }
    Ok(())
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
    ensure_batch_editable(&mut transaction, batch_id).await?;
    ensure_no_overlap(&mut transaction, &batch, Some(batch_id)).await?;
    ensure_departments_exist(&mut transaction, &batch.department_ids).await?;
    ensure_bureaus_exist(&mut transaction, &batch.bureau_ids).await?;
    let result = sqlx::query(
        "UPDATE application_batches SET name = $2, registration_start = $3::date, registration_end = $4::date, interview_start = $5::date, interview_end = $6::date, all_units = $7, max_applications = $8, updated_by = $9, updated_at = NOW() WHERE id = $1",
    )
    .bind(batch_id)
    .bind(&batch.name)
    .bind(&batch.registration_start)
    .bind(&batch.registration_end)
    .bind(&batch.interview_start)
    .bind(&batch.interview_end)
    .bind(batch.all_units)
    .bind(batch.max_applications)
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
    replace_batch_bureaus(&mut transaction, batch_id, &batch.bureau_ids).await?;
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
            "max_applications": batch.max_applications,
            "department_ids": batch.department_ids,
            "bureau_ids": batch.bureau_ids,
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

/// The batch accepting applications today (id and per-applicant limit), if the target may apply in it.
/// A target is open when its department was opened as a whole, or its own biro / bengkel was opened.
/// Jobs without a department can only apply while the batch covers every unit.
pub(super) async fn registration_batch_for_department(
    pool: &PgPool,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
) -> Result<(i64, Option<i32>), ApiError> {
    let (batch_id, all_units, max_applications) = sqlx::query_as::<_, (i64, bool, Option<i32>)>(
        &format!(
            "SELECT id, all_units, max_applications FROM application_batches WHERE {JAKARTA_TODAY} BETWEEN registration_start AND registration_end"
        ),
    )
    .fetch_optional(pool)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::Conflict(
        "Pendaftaran belum dibuka atau sudah ditutup.",
    ))?;
    if !all_units {
        let allowed: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM application_batch_departments WHERE batch_id = $1 AND department_id = $2) OR EXISTS(SELECT 1 FROM application_batch_bureaus WHERE batch_id = $1 AND bureau_id = $3)",
        )
        .bind(batch_id)
        .bind(department_id)
        .bind(bureau_id)
        .fetch_one(pool)
        .await
        .map_err(internal_error)?;
        if !allowed {
            return Err(ApiError::Conflict(
                "Unit tujuan tidak dibuka pada batch yang sedang berlangsung.",
            ));
        }
    }
    Ok((batch_id, max_applications))
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

#[cfg(test)]
mod tests {
    use super::*;

    fn record(name: &str, rs: &str, re: &str, is: &str, ie: &str) -> BatchRecord {
        BatchRecord {
            id: 1,
            name: name.to_owned(),
            registration_start: rs.to_owned(),
            registration_end: re.to_owned(),
            interview_start: is.to_owned(),
            interview_end: ie.to_owned(),
            all_units: true,
            max_applications: None,
            department_ids: Vec::new(),
            bureau_ids: Vec::new(),
            application_count: 0,
        }
    }

    fn request(rs: &str, re: &str, is: &str, ie: &str) -> BatchRequest {
        BatchRequest {
            name: "Batch Uji".to_owned(),
            registration_start: rs.to_owned(),
            registration_end: re.to_owned(),
            interview_start: is.to_owned(),
            interview_end: ie.to_owned(),
            all_units: true,
            max_applications: None,
            department_ids: Vec::new(),
            bureau_ids: Vec::new(),
        }
    }

    #[test]
    fn units_can_be_chosen_by_department_or_bureau() {
        let mut only_bureaus = request("2027-01-01", "2027-01-31", "2027-02-01", "2027-02-28");
        only_bureaus.all_units = false;
        only_bureaus.bureau_ids = vec![9, 3, 9];
        let valid = validate_batch(only_bureaus).unwrap();
        assert_eq!(valid.bureau_ids, vec![3, 9]);
        assert!(valid.department_ids.is_empty());

        let mut nothing = request("2027-01-01", "2027-01-31", "2027-02-01", "2027-02-28");
        nothing.all_units = false;
        assert!(validate_batch(nothing).is_err());

        let mut everything = request("2027-01-01", "2027-01-31", "2027-02-01", "2027-02-28");
        everything.department_ids = vec![1];
        everything.bureau_ids = vec![2];
        let valid = validate_batch(everything).unwrap();
        assert!(valid.department_ids.is_empty() && valid.bureau_ids.is_empty());
    }

    #[test]
    fn dates_must_be_real_calendar_days() {
        assert!(parse_date("2026-11-10").is_ok());
        assert!(parse_date("2028-02-29").is_ok());
        for invalid in [
            "2026-02-29",
            "2026-13-01",
            "2026-00-10",
            "2026-11-31",
            "10-11-2026",
            "2026/11/10",
            "1999-01-01",
            "",
        ] {
            assert!(parse_date(invalid).is_err(), "{invalid} should be rejected");
        }
    }

    #[test]
    fn batch_dates_and_limits_are_validated() {
        assert!(validate_batch(request(
            "2027-01-01",
            "2027-01-31",
            "2027-02-01",
            "2027-02-28"
        ))
        .is_ok());
        // Registration may not end before it starts; interviews must start after registration closes.
        assert!(validate_batch(request(
            "2027-01-31",
            "2027-01-01",
            "2027-02-01",
            "2027-02-28"
        ))
        .is_err());
        assert!(validate_batch(request(
            "2027-01-01",
            "2027-01-31",
            "2027-01-31",
            "2027-02-28"
        ))
        .is_err());
        assert!(validate_batch(request(
            "2027-01-01",
            "2027-01-31",
            "2027-02-10",
            "2027-02-01"
        ))
        .is_err());
        let base = || request("2027-01-01", "2027-01-31", "2027-02-01", "2027-02-28");
        let mut unnamed = base();
        unnamed.name = "   ".to_owned();
        assert!(validate_batch(unnamed).is_err());
        let mut zero_limit = base();
        zero_limit.max_applications = Some(0);
        assert!(validate_batch(zero_limit).is_err());
        let mut max_limit = base();
        max_limit.max_applications = Some(10_000);
        assert_eq!(
            validate_batch(max_limit).unwrap().max_applications,
            Some(10_000)
        );
        // Picking specific units without choosing any is an error; "all units" ignores stale picks.
        let mut empty_selection = base();
        empty_selection.all_units = false;
        assert!(validate_batch(empty_selection).is_err());
        let mut stale = base();
        stale.department_ids = vec![3, 3, 1];
        assert!(validate_batch(stale).unwrap().department_ids.is_empty());
        let mut picked = base();
        picked.all_units = false;
        picked.department_ids = vec![3, 3, 1];
        assert_eq!(validate_batch(picked).unwrap().department_ids, vec![1, 3]);
    }

    #[test]
    fn phase_follows_registration_selection_and_idle_periods() {
        let first = record(
            "Batch 2026",
            "2026-11-10",
            "2026-11-30",
            "2026-12-01",
            "2026-12-31",
        );
        let second = record(
            "Batch 2027",
            "2027-02-01",
            "2027-02-28",
            "2027-03-01",
            "2027-03-31",
        );
        let batches = vec![first, second];
        let phase = |today: &str| resolve_phase(today, &batches).0;
        assert_eq!(phase("2026-11-09"), "upcoming");
        assert_eq!(phase("2026-11-10"), "registration");
        assert_eq!(phase("2026-11-30"), "registration");
        assert_eq!(phase("2026-12-01"), "selection");
        assert_eq!(phase("2026-12-31"), "selection");
        assert_eq!(phase("2027-01-01"), "upcoming");
        assert_eq!(phase("2027-02-01"), "registration");
        let (final_phase, current, previous, next) = resolve_phase("2027-04-01", &batches);
        assert_eq!(final_phase, "closed");
        assert!(current.is_none() && next.is_none());
        assert_eq!(previous.unwrap().name, "Batch 2027");
        assert_eq!(resolve_phase("2026-01-01", &[]).0, "closed");
    }

    #[cfg(feature = "postgres-migration-tests")]
    mod database {
        use super::*;

        // Moves a batch relative to today's date in Jakarta so tests do not depend on the calendar.
        async fn place_batch(pool: &PgPool, batch_id: i64, offsets: [i32; 4]) {
            sqlx::query(&format!(
                "UPDATE application_batches SET registration_start = {JAKARTA_TODAY} + $2::int, registration_end = {JAKARTA_TODAY} + $3::int, interview_start = {JAKARTA_TODAY} + $4::int, interview_end = {JAKARTA_TODAY} + $5::int WHERE id = $1"
            ))
            .bind(batch_id)
            .bind(offsets[0])
            .bind(offsets[1])
            .bind(offsets[2])
            .bind(offsets[3])
            .execute(pool)
            .await
            .unwrap();
        }

        async fn seeded_batch_id(pool: &PgPool) -> i64 {
            sqlx::query_scalar("SELECT id FROM application_batches WHERE name = 'Batch 2026'")
                .fetch_one(pool)
                .await
                .unwrap()
        }

        async fn department(pool: &PgPool, name: &str) -> i64 {
            let division_id: i64 =
                sqlx::query_scalar("INSERT INTO divisions (name) VALUES ($1) RETURNING id")
                    .bind(format!("Divisi {name}"))
                    .fetch_one(pool)
                    .await
                    .unwrap();
            sqlx::query_scalar(
                "INSERT INTO departments (division_id, name) VALUES ($1, $2) RETURNING id",
            )
            .bind(division_id)
            .bind(name)
            .fetch_one(pool)
            .await
            .unwrap()
        }

        async fn applicant(pool: &PgPool, email: &str) -> i64 {
            sqlx::query_scalar(
                "INSERT INTO applicants (name, email, password_hash) VALUES ('Pelamar', $1, 'hash') RETURNING id",
            )
            .bind(email)
            .fetch_one(pool)
            .await
            .unwrap()
        }

        async fn application(
            pool: &PgPool,
            applicant_id: i64,
            department_id: i64,
            batch_id: i64,
            status: &str,
        ) -> i64 {
            sqlx::query_scalar(
                "INSERT INTO applications (applicant_id, job_id, target_department_id, position_description, public_id, status, batch_id) VALUES ($1, NULL, $2, 'Uji', $3, $4, $5) RETURNING id",
            )
            .bind(applicant_id)
            .bind(department_id)
            .bind(Ulid::new().to_string())
            .bind(status)
            .bind(batch_id)
            .fetch_one(pool)
            .await
            .unwrap()
        }

        fn valid(rs: &str, re: &str, is: &str, ie: &str) -> ValidBatch {
            validate_batch(request(rs, re, is, ie)).unwrap()
        }

        #[sqlx::test(migrations = "./migrations")]
        async fn overlapping_batches_are_rejected(pool: PgPool) {
            // The seeded batch spans 2026-11-10 .. 2026-12-31.
            let cases = [
                ("2026-11-01", "2026-11-12", "2026-11-13", "2026-11-20", true),
                ("2026-12-31", "2027-01-05", "2027-01-06", "2027-01-10", true),
                ("2026-10-01", "2026-10-31", "2027-01-01", "2027-01-31", true),
                ("2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", true),
                (
                    "2026-10-01",
                    "2026-10-15",
                    "2026-10-16",
                    "2026-11-09",
                    false,
                ),
                (
                    "2027-01-01",
                    "2027-01-31",
                    "2027-02-01",
                    "2027-02-28",
                    false,
                ),
            ];
            for (rs, re, is, ie, overlaps) in cases {
                let mut transaction = pool.begin().await.unwrap();
                let result =
                    ensure_no_overlap(&mut transaction, &valid(rs, re, is, ie), None).await;
                assert_eq!(
                    matches!(result, Err(ApiError::Conflict(_))),
                    overlaps,
                    "{rs}..{ie} overlap expectation"
                );
            }
            // A batch never conflicts with itself when it is edited.
            let mut transaction = pool.begin().await.unwrap();
            let seeded = seeded_batch_id(&pool).await;
            assert!(ensure_no_overlap(
                &mut transaction,
                &valid("2026-11-12", "2026-11-28", "2026-12-02", "2026-12-30"),
                Some(seeded)
            )
            .await
            .is_ok());
        }

        #[sqlx::test(migrations = "./migrations")]
        async fn applications_are_only_accepted_in_the_registration_window_for_active_units(
            pool: PgPool,
        ) {
            let batch_id = seeded_batch_id(&pool).await;
            let open_unit = department(&pool, "Dept Buka").await;
            let closed_unit = department(&pool, "Dept Tutup").await;

            place_batch(&pool, batch_id, [-2, 5, 6, 30]).await;
            sqlx::query("UPDATE application_batches SET max_applications = 3 WHERE id = $1")
                .bind(batch_id)
                .execute(&pool)
                .await
                .unwrap();
            let (found, limit) = registration_batch_for_department(&pool, Some(open_unit), None)
                .await
                .unwrap();
            assert_eq!((found, limit), (batch_id, Some(3)));
            // Jobs without a department are fine while every unit is open.
            assert!(registration_batch_for_department(&pool, None, None).await.is_ok());

            sqlx::query("UPDATE application_batches SET all_units = FALSE WHERE id = $1")
                .bind(batch_id)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query(
                "INSERT INTO application_batch_departments (batch_id, department_id) VALUES ($1, $2)",
            )
            .bind(batch_id)
            .bind(open_unit)
            .execute(&pool)
            .await
            .unwrap();
            assert!(registration_batch_for_department(&pool, Some(open_unit), None)
                .await
                .is_ok());
            assert!(matches!(
                registration_batch_for_department(&pool, Some(closed_unit), None).await,
                Err(ApiError::Conflict(_))
            ));
            assert!(matches!(
                registration_batch_for_department(&pool, None, None).await,
                Err(ApiError::Conflict(_))
            ));

            // Registration closed (selection period) and not yet open: nothing can be submitted.
            place_batch(&pool, batch_id, [-10, -1, 0, 20]).await;
            assert!(matches!(
                registration_batch_for_department(&pool, Some(open_unit), None).await,
                Err(ApiError::Conflict(_))
            ));
            place_batch(&pool, batch_id, [1, 5, 6, 20]).await;
            assert!(matches!(
                registration_batch_for_department(&pool, Some(open_unit), None).await,
                Err(ApiError::Conflict(_))
            ));
            // The last registration day still counts as open.
            place_batch(&pool, batch_id, [-5, 0, 1, 20]).await;
            assert!(registration_batch_for_department(&pool, Some(open_unit), None)
                .await
                .is_ok());
        }

        #[sqlx::test(migrations = "./migrations")]
        async fn a_single_biro_can_be_opened_without_opening_its_whole_department(pool: PgPool) {
            let batch_id = seeded_batch_id(&pool).await;
            place_batch(&pool, batch_id, [-2, 5, 6, 30]).await;
            let unit = department(&pool, "Dept Biro").await;
            let open_bureau: i64 = sqlx::query_scalar(
                "INSERT INTO bureaus (department_id, name) VALUES ($1, 'Biro Buka') RETURNING id",
            )
            .bind(unit)
            .fetch_one(&pool)
            .await
            .unwrap();
            let closed_bureau: i64 = sqlx::query_scalar(
                "INSERT INTO bureaus (department_id, name) VALUES ($1, 'Biro Tutup') RETURNING id",
            )
            .bind(unit)
            .fetch_one(&pool)
            .await
            .unwrap();
            sqlx::query("UPDATE application_batches SET all_units = FALSE WHERE id = $1")
                .bind(batch_id)
                .execute(&pool)
                .await
                .unwrap();
            sqlx::query("INSERT INTO application_batch_bureaus (batch_id, bureau_id) VALUES ($1, $2)")
                .bind(batch_id)
                .bind(open_bureau)
                .execute(&pool)
                .await
                .unwrap();

            // Only the chosen biro is open; the department itself and its other biro are not.
            assert!(
                registration_batch_for_department(&pool, Some(unit), Some(open_bureau))
                    .await
                    .is_ok()
            );
            assert!(matches!(
                registration_batch_for_department(&pool, Some(unit), Some(closed_bureau)).await,
                Err(ApiError::Conflict(_))
            ));
            assert!(matches!(
                registration_batch_for_department(&pool, Some(unit), None).await,
                Err(ApiError::Conflict(_))
            ));

            // Opening the whole department opens every biro under it.
            sqlx::query("INSERT INTO application_batch_departments (batch_id, department_id) VALUES ($1, $2)")
                .bind(batch_id)
                .bind(unit)
                .execute(&pool)
                .await
                .unwrap();
            assert!(
                registration_batch_for_department(&pool, Some(unit), Some(closed_bureau))
                    .await
                    .is_ok()
            );
        }

        #[sqlx::test(migrations = "./migrations")]
        async fn a_finished_batch_can_no_longer_be_edited(pool: PgPool) {
            let batch_id = seeded_batch_id(&pool).await;

            // Still running (interview period ends today): editable.
            place_batch(&pool, batch_id, [-60, -40, -39, 0]).await;
            let mut transaction = pool.begin().await.unwrap();
            assert!(ensure_batch_editable(&mut transaction, batch_id).await.is_ok());
            transaction.rollback().await.unwrap();

            // The day after the interview period ended: locked.
            place_batch(&pool, batch_id, [-60, -40, -39, -1]).await;
            let mut transaction = pool.begin().await.unwrap();
            assert!(matches!(
                ensure_batch_editable(&mut transaction, batch_id).await,
                Err(ApiError::Conflict(_))
            ));
            transaction.rollback().await.unwrap();

            // Unknown batch.
            let mut transaction = pool.begin().await.unwrap();
            assert!(matches!(
                ensure_batch_editable(&mut transaction, batch_id + 999).await,
                Err(ApiError::NotFound(_))
            ));
        }

        #[sqlx::test(migrations = "./migrations")]
        async fn undecided_applications_are_rejected_once_the_interview_period_ends(pool: PgPool) {
            let ended = seeded_batch_id(&pool).await;
            place_batch(&pool, ended, [-60, -40, -39, -1]).await;
            let running: i64 = sqlx::query_scalar(&format!(
                "INSERT INTO application_batches (name, registration_start, registration_end, interview_start, interview_end) VALUES ('Batch Berjalan', {JAKARTA_TODAY}, {JAKARTA_TODAY} + 5, {JAKARTA_TODAY} + 6, {JAKARTA_TODAY} + 30) RETURNING id"
            ))
            .fetch_one(&pool)
            .await
            .unwrap();
            let unit = department(&pool, "Dept Sweeper").await;
            let mut ids = Vec::new();
            for (index, status) in [
                "submitted",
                "screening",
                "interview",
                "accepted",
                "rejected",
            ]
            .iter()
            .enumerate()
            {
                let who = applicant(&pool, &format!("ended{index}@example.test")).await;
                ids.push(application(&pool, who, unit, ended, status).await);
            }
            let current = applicant(&pool, "running@example.test").await;
            let running_application = application(&pool, current, unit, running, "submitted").await;

            reject_expired_applications(&pool, None).await;

            async fn status_of(pool: &PgPool, id: i64) -> String {
                sqlx::query_scalar::<_, String>("SELECT status FROM applications WHERE id = $1")
                    .bind(id)
                    .fetch_one(pool)
                    .await
                    .unwrap()
            }
            let expected = ["rejected", "rejected", "rejected", "accepted", "rejected"];
            for (id, expected) in ids.iter().zip(expected) {
                assert_eq!(status_of(&pool, *id).await, expected);
            }
            assert_eq!(status_of(&pool, running_application).await, "submitted");

            // Each applicant that was undecided is told why, with the previous status preserved.
            let notifications: Vec<(String, String, Option<String>)> = sqlx::query_as(
                "SELECT previous_status, new_status, reason FROM application_status_notifications ORDER BY previous_status",
            )
            .fetch_all(&pool)
            .await
            .unwrap();
            assert_eq!(notifications.len(), 3);
            assert_eq!(
                notifications
                    .iter()
                    .map(|row| row.0.as_str())
                    .collect::<Vec<_>>(),
                ["interview", "screening", "submitted"]
            );
            for (_, new_status, reason) in &notifications {
                assert_eq!(new_status, "rejected");
                assert!(reason.as_deref().unwrap().contains("Batch 2026"));
            }

            // Running it again must not notify anyone twice.
            reject_expired_applications(&pool, None).await;
            let total: i64 =
                sqlx::query_scalar("SELECT COUNT(*) FROM application_status_notifications")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
            assert_eq!(total, 3);

            // The interview period includes its final day: nothing is rejected until the day after.
            place_batch(&pool, ended, [-60, -40, -39, 0]).await;
            let late = applicant(&pool, "last-day@example.test").await;
            let late_application = application(&pool, late, unit, ended, "interview").await;
            reject_expired_applications(&pool, None).await;
            assert_eq!(status_of(&pool, late_application).await, "interview");
        }
    }
}
