use super::*;

pub(super) async fn list_applications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApplicationsResponse>, ApiError> {
    let (applicant_id, _) = authorized_applicant(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, ApplicationSummary>(
        "SELECT applications.public_id AS id, applications.job_id, applications.target_department_id, applications.target_bureau_id, COALESCE(job_postings.title, direct_bureaus.name, direct_departments.name) AS job_title, COALESCE(job_postings.target_level, CASE WHEN applications.target_bureau_id IS NULL THEN 'department' ELSE 'bureau' END) AS target_level, COALESCE(job_postings.division, direct_divisions.name, '') AS division, COALESCE(job_postings.department, direct_departments.name, '') AS department, COALESCE(job_postings.unit, CASE WHEN direct_bureaus.id IS NOT NULL THEN CONCAT(CASE direct_bureaus.unit_type WHEN 'bengkel' THEN 'Bengkel' ELSE 'Biro' END, ' — ', direct_bureaus.name) ELSE '' END, '') AS unit, applications.position_description, applications.status, applications.created_at::text AS created_at, COALESCE((SELECT json_agg(json_build_object('status', status_history.status, 'created_at', status_history.changed_at::text) ORDER BY status_history.changed_at, status_history.sequence) FROM (SELECT 'submitted'::text AS status, applications.created_at AS changed_at, 0::bigint AS sequence UNION ALL SELECT notifications.new_status, notifications.created_at, notifications.id FROM application_status_notifications AS notifications WHERE notifications.application_id = applications.id) AS status_history), '[]'::json) AS status_history FROM applications LEFT JOIN job_postings ON job_postings.id = applications.job_id LEFT JOIN departments AS direct_departments ON direct_departments.id = applications.target_department_id LEFT JOIN divisions AS direct_divisions ON direct_divisions.id = direct_departments.division_id LEFT JOIN bureaus AS direct_bureaus ON direct_bureaus.id = applications.target_bureau_id WHERE applications.applicant_id = $1 ORDER BY applications.created_at DESC",
    )
    .bind(applicant_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(ApplicationsResponse { data }))
}

pub(super) async fn list_applicant_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApplicantNotificationsResponse>, ApiError> {
    let (applicant_id, _) = authorized_applicant(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, ApplicantStatusNotification>(
        "SELECT notifications.id, applications.public_id AS application_id, applications.job_id, COALESCE(job_postings.title, direct_bureaus.name, direct_departments.name) AS job_title, CASE WHEN job_postings.id IS NOT NULL THEN CONCAT_WS(' / ', job_postings.division, job_postings.department, NULLIF(job_postings.unit, '')) ELSE CONCAT_WS(' / ', direct_divisions.name, direct_departments.name, CASE WHEN direct_bureaus.id IS NOT NULL THEN CONCAT(CASE direct_bureaus.unit_type WHEN 'bengkel' THEN 'Bengkel' ELSE 'Biro' END, ' — ', direct_bureaus.name) END) END AS target_label, COALESCE(job_postings.target_level, CASE WHEN applications.target_bureau_id IS NULL THEN 'department' ELSE 'bureau' END) AS target_level, notifications.previous_status, notifications.new_status, notifications.reason, notifications.created_at::text AS created_at, notifications.read_at::text AS read_at FROM application_status_notifications AS notifications JOIN applications ON applications.id = notifications.application_id LEFT JOIN job_postings ON job_postings.id = applications.job_id LEFT JOIN departments AS direct_departments ON direct_departments.id = applications.target_department_id LEFT JOIN divisions AS direct_divisions ON direct_divisions.id = direct_departments.division_id LEFT JOIN bureaus AS direct_bureaus ON direct_bureaus.id = applications.target_bureau_id WHERE notifications.applicant_id = $1 ORDER BY notifications.created_at DESC, notifications.id DESC LIMIT 50",
    )
    .bind(applicant_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let unread_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM application_status_notifications WHERE applicant_id = $1 AND read_at IS NULL",
    )
    .bind(applicant_id)
    .fetch_one(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(ApplicantNotificationsResponse { data, unread_count }))
}

pub(crate) fn validate_application_status_reason(
    status: &str,
    reason: Option<&str>,
    is_status_change: bool,
) -> Result<Option<String>, &'static str> {
    let reason = reason
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned);

    if reason
        .as_ref()
        .is_some_and(|value| value.chars().count() > MAX_APPLICATION_STATUS_REASON_CHARS)
    {
        return Err("Alasan perubahan status maksimal 1000 karakter.");
    }

    if is_status_change && status == "rejected" && reason.is_none() {
        return Err("Alasan wajib diisi saat status lamaran menjadi Ditolak.");
    }

    Ok(reason)
}

pub(super) async fn mark_applicant_notification_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let (applicant_id, _) = authorized_applicant(&state.pool, &headers).await?;
    let result = sqlx::query(
        "UPDATE application_status_notifications SET read_at = COALESCE(read_at, NOW()) WHERE id = $1 AND applicant_id = $2",
    )
    .bind(id)
    .bind(applicant_id)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Notifikasi tidak ditemukan."));
    }
    Ok(Json(
        json!({ "message": "Notifikasi ditandai sudah dibaca." }),
    ))
}

async fn parse_application_submission(
    mut multipart: Multipart,
) -> Result<
    (
        ApplicationSubmissionFields,
        Vec<UploadedApplicationDocument>,
    ),
    ApiError,
> {
    let mut job_id = None;
    let mut target_department_id = None;
    let mut target_bureau_id = None;
    let mut employee_number = None;
    let mut applicant_full_name = None;
    let mut origin_division = None;
    let mut origin_unit = None;
    let mut education_level = None;
    let mut study_field = None;
    let mut motivation = None;
    let mut documents: Vec<UploadedApplicationDocument> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Formulir lamaran tidak dapat dibaca."))?
    {
        let name = field
            .name()
            .ok_or(ApiError::BadRequest("Formulir lamaran tidak lengkap."))?
            .to_owned();
        match name.as_str() {
            "job_id" => set_application_text(&mut job_id, field).await?,
            "target_department_id" => {
                set_application_text(&mut target_department_id, field).await?
            }
            "target_bureau_id" => set_application_text(&mut target_bureau_id, field).await?,
            "employee_number" => set_application_text(&mut employee_number, field).await?,
            "applicant_full_name" => set_application_text(&mut applicant_full_name, field).await?,
            "origin_division" => set_application_text(&mut origin_division, field).await?,
            "origin_unit" => set_application_text(&mut origin_unit, field).await?,
            "education_level" => set_application_text(&mut education_level, field).await?,
            "study_field" => set_application_text(&mut study_field, field).await?,
            "motivation" => set_application_text(&mut motivation, field).await?,
            "supporting_document" | "cv" | "cover_letter" | "certificate" => {
                let document_type = match name.as_str() {
                    "supporting_document" => "supporting_document",
                    "cv" => "cv",
                    "cover_letter" => "cover_letter",
                    "certificate" => "certificate",
                    _ => unreachable!(),
                };
                if documents.len() >= MAX_APPLICATION_DOCUMENTS {
                    return Err(ApiError::BadRequest(
                        "Maksimal 5 berkas pendukung dapat diunggah.",
                    ));
                }
                if document_type != "supporting_document"
                    && documents
                        .iter()
                        .any(|document| document.document_type == document_type)
                {
                    return Err(ApiError::BadRequest(
                        "Setiap jenis dokumen hanya dapat diunggah satu kali.",
                    ));
                }
                let file_name = field.file_name().unwrap_or_default().to_owned();
                let content_type = field.content_type().unwrap_or_default().to_owned();
                let content = field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::BadRequest("Dokumen tidak dapat dibaca."))?;
                let file_name = validate_application_pdf(&file_name, &content_type, &content)?;
                documents.push(UploadedApplicationDocument {
                    document_type,
                    file_name,
                    content: content.to_vec(),
                });
            }
            _ => {
                return Err(ApiError::BadRequest(
                    "Formulir berisi kolom yang tidak dikenal.",
                ))
            }
        }
    }

    let job_id = job_id
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    if job_id.as_ref().is_some_and(|value| value.len() > 64) {
        return Err(ApiError::BadRequest("Kode lowongan tidak valid."));
    }
    let target_department_id = parse_optional_application_id(target_department_id)?;
    let target_bureau_id = parse_optional_application_id(target_bureau_id)?;
    let is_job_application = job_id.is_some();
    if is_job_application == target_department_id.is_some()
        || (is_job_application && target_bureau_id.is_some())
        || target_bureau_id.is_some() && target_department_id.is_none()
    {
        return Err(ApiError::BadRequest(
            "Pilih satu lowongan atau satu unit tujuan secara valid.",
        ));
    }
    let fields = ApplicationSubmissionFields {
        job_id,
        target_department_id,
        target_bureau_id,
        employee_number: employee_number.unwrap_or_default().trim().to_owned(),
        applicant_full_name: applicant_full_name.unwrap_or_default().trim().to_owned(),
        origin_division: origin_division.unwrap_or_default().trim().to_owned(),
        origin_unit: origin_unit.unwrap_or_default().trim().to_owned(),
        education_level: education_level.unwrap_or_default().trim().to_owned(),
        study_field: study_field.unwrap_or_default().trim().to_owned(),
        motivation: motivation.unwrap_or_default().trim().to_owned(),
    };
    if fields.employee_number.is_empty()
        || fields.employee_number.len() > 40
        || fields.employee_number.chars().any(char::is_control)
    {
        return Err(ApiError::BadRequest(
            "NIP wajib diisi dan maksimal 40 karakter.",
        ));
    }
    if fields.applicant_full_name.is_empty() || fields.applicant_full_name.len() > 200 {
        return Err(ApiError::BadRequest(
            "Nama sesuai ID wajib diisi dan maksimal 200 karakter.",
        ));
    }
    if fields.origin_division.is_empty() || fields.origin_division.len() > 160 {
        return Err(ApiError::BadRequest(
            "Divisi asal wajib diisi dan maksimal 160 karakter.",
        ));
    }
    if fields.origin_unit.is_empty() || fields.origin_unit.len() > 160 {
        return Err(ApiError::BadRequest(
            "Departemen atau unit asal wajib diisi dan maksimal 160 karakter.",
        ));
    }
    if !matches!(
        fields.education_level.as_str(),
        "SMA/SMK" | "D1" | "D2" | "D3" | "D4/S1" | "S2" | "S3" | "Lainnya"
    ) {
        return Err(ApiError::BadRequest("Jenjang pendidikan wajib dipilih."));
    }
    if fields.study_field.is_empty() || fields.study_field.len() > 160 {
        return Err(ApiError::BadRequest(
            "Jurusan atau bidang studi wajib diisi dan maksimal 160 karakter.",
        ));
    }
    if fields.motivation.is_empty() || fields.motivation.len() > 3000 {
        return Err(ApiError::BadRequest(
            "Alasan melamar wajib diisi dan maksimal 3000 karakter.",
        ));
    }
    if fields.job_id.is_none()
        && !documents
            .iter()
            .any(|document| document.document_type == "cv")
    {
        return Err(ApiError::BadRequest(
            "CV wajib diunggah untuk lamaran langsung.",
        ));
    }
    if documents.is_empty() {
        return Err(ApiError::BadRequest(
            "Setidaknya satu berkas PDF pendukung wajib diunggah.",
        ));
    }

    Ok((fields, documents))
}

fn parse_optional_application_id(value: Option<String>) -> Result<Option<i64>, ApiError> {
    value
        .map(|value| {
            let value = value.trim();
            value
                .parse::<i64>()
                .ok()
                .filter(|id| *id > 0)
                .ok_or(ApiError::BadRequest("Unit tujuan tidak valid."))
        })
        .transpose()
}

async fn set_application_text(
    target: &mut Option<String>,
    field: axum::extract::multipart::Field<'_>,
) -> Result<(), ApiError> {
    if target.is_some() {
        return Err(ApiError::BadRequest(
            "Kolom formulir lamaran tidak boleh dikirim berulang.",
        ));
    }
    *target = Some(
        field
            .text()
            .await
            .map_err(|_| ApiError::BadRequest("Formulir lamaran tidak dapat dibaca."))?,
    );
    Ok(())
}

pub(super) fn validate_application_pdf(
    file_name: &str,
    content_type: &str,
    content: &[u8],
) -> Result<String, ApiError> {
    if content.is_empty() || content.len() > MAX_APPLICATION_FILE_BYTES {
        return Err(ApiError::BadRequest(
            "Setiap dokumen harus berukuran maksimal 5 MB.",
        ));
    }
    if !content_type.is_empty()
        && !content_type.eq_ignore_ascii_case("application/pdf")
        && !content_type.eq_ignore_ascii_case("application/octet-stream")
    {
        return Err(ApiError::BadRequest("Dokumen harus berformat PDF."));
    }
    if !content.starts_with(b"%PDF-") {
        return Err(ApiError::BadRequest(
            "Isi dokumen bukan berkas PDF yang valid.",
        ));
    }
    let file_name = file_name
        .rsplit(|character| character == '/' || character == '\\')
        .next()
        .unwrap_or_default()
        .trim();
    if file_name.is_empty()
        || file_name.len() > 255
        || file_name.chars().any(char::is_control)
        || !file_name.to_ascii_lowercase().ends_with(".pdf")
    {
        return Err(ApiError::BadRequest("Nama berkas PDF tidak valid."));
    }
    Ok(file_name.to_owned())
}

pub(super) async fn create_application(
    State(state): State<AppState>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Json<serde_json::Value>, ApiError> {
    let (applicant_id, _) = authorized_applicant(&state.pool, &headers).await?;
    let (fields, documents) = parse_application_submission(multipart).await?;

    let position_description = if let Some(job_id) = &fields.job_id {
        let is_open: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM job_postings WHERE id = $1 AND status = 'open')",
        )
        .bind(job_id)
        .fetch_one(&state.pool)
        .await
        .map_err(internal_error)?;
        if !is_open {
            return Err(ApiError::NotFound(
                "Lowongan tidak ditemukan atau sudah ditutup.",
            ));
        }
        None
    } else {
        let description = sqlx::query_scalar::<_, Option<String>>(
            "SELECT CASE WHEN $2::BIGINT IS NULL THEN departments.description ELSE bureaus.description END FROM departments LEFT JOIN bureaus ON bureaus.id = $2 AND bureaus.department_id = departments.id WHERE departments.id = $1 AND ($2::BIGINT IS NULL OR bureaus.id IS NOT NULL)",
        )
        .bind(fields.target_department_id)
        .bind(fields.target_bureau_id)
        .fetch_optional(&state.pool)
        .await
        .map_err(internal_error)?
        .ok_or(ApiError::BadRequest("Unit tujuan tidak ditemukan."))?;
        description.and_then(|description| {
            let description = description.trim();
            (!description.is_empty()).then(|| description.to_owned())
        })
    };

    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let max_applications = sqlx::query_scalar::<_, i32>(
        "SELECT max_applications FROM applicant_application_limit WHERE id = 1",
    )
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?;
    if let Some(max_applications) = max_applications {
        sqlx::query("SELECT pg_advisory_xact_lock($1)")
            .bind(applicant_id)
            .execute(&mut *transaction)
            .await
            .map_err(internal_error)?;
        let application_count = sqlx::query_scalar::<_, i64>(
            "SELECT COUNT(*) FROM applications WHERE applicant_id = $1",
        )
        .bind(applicant_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(internal_error)?;
        if application_count >= i64::from(max_applications) {
            return Err(ApiError::Conflict(
                "Anda telah mencapai batas maksimal lamaran yang diizinkan.",
            ));
        }
    }
    let public_id = Ulid::new().to_string();
    let application = sqlx::query_as::<_, (i64, String, String)>(
        "INSERT INTO applications (applicant_id, job_id, target_department_id, target_bureau_id, position_description, public_id, employee_number, applicant_full_name, origin_division, origin_unit, education_level, study_field, motivation) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT DO NOTHING RETURNING id, public_id, created_at::text",
    )
    .bind(applicant_id)
    .bind(&fields.job_id)
    .bind(fields.target_department_id)
    .bind(fields.target_bureau_id)
    .bind(position_description)
    .bind(&public_id)
    .bind(fields.employee_number)
    .bind(fields.applicant_full_name)
    .bind(fields.origin_division)
    .bind(fields.origin_unit)
    .bind(fields.education_level)
    .bind(fields.study_field)
    .bind(fields.motivation)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?;
    let Some((application_id, public_id, created_at)) = application else {
        return Err(ApiError::Conflict("Anda sudah melamar posisi ini."));
    };

    for document in documents {
        let file_size = i32::try_from(document.content.len()).map_err(internal_error)?;
        sqlx::query(
            "INSERT INTO application_documents (application_id, document_type, file_name, content_type, file_size, content) VALUES ($1, $2, $3, 'application/pdf', $4, $5)",
        )
        .bind(application_id)
        .bind(document.document_type)
        .bind(document.file_name)
        .bind(file_size)
        .bind(document.content)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    }

    sqlx::query(
        "INSERT INTO admin_application_notifications (admin_id, application_id) SELECT admins.id, $1 FROM admins LEFT JOIN job_postings AS target_job ON target_job.id = $2 LEFT JOIN departments AS target_department ON target_department.id = $3 WHERE admins.is_active = TRUE AND (admins.admin_role IN ('super_admin', 'admin') OR (admins.admin_role = 'division_head' AND admins.division_id = COALESCE(target_job.division_id, target_department.division_id)) OR (admins.admin_role = 'department_head' AND admins.department_id = COALESCE(target_job.department_id, $3))) ON CONFLICT (admin_id, application_id, notification_type) DO NOTHING",
    )
    .bind(application_id)
    .bind(&fields.job_id)
    .bind(fields.target_department_id)
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;

    transaction.commit().await.map_err(internal_error)?;
    dispatch_admin_application_push(
        state.pool.clone(),
        state.push_service.clone(),
        application_id,
    );
    Ok(Json(json!({
        "message": "Lamaran berhasil dikirim.",
        "application_id": public_id,
        "job_id": fields.job_id,
        "target_department_id": fields.target_department_id,
        "target_bureau_id": fields.target_bureau_id,
        "target_level": if fields.target_bureau_id.is_some() { "bureau" } else if fields.job_id.is_none() { "department" } else { "" },
        "status": "submitted",
        "created_at": created_at,
    })))
}
