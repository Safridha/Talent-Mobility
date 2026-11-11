use super::*;

pub(super) async fn admin_list_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AdminNotificationsResponse>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(APPLICATIONS_VIEW)?;
    let scope_filter = "($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND job_postings.division_id = $3) OR ($2 = 'department_head' AND job_postings.target_level <> 'division' AND job_postings.department_id = $4))";
    let data = sqlx::query_as::<_, AdminApplicationNotification>(&format!(
        "SELECT notifications.id, applications.public_id AS application_id, job_postings.id AS job_id, job_postings.title AS job_title, COALESCE(applications.applicant_full_name, applicants.name) AS applicant_name, job_postings.target_level, notifications.created_at::text AS created_at, notifications.read_at::text AS read_at FROM admin_application_notifications AS notifications JOIN applications ON applications.id = notifications.application_id JOIN applicants ON applicants.id = applications.applicant_id JOIN job_postings ON job_postings.id = applications.job_id WHERE notifications.admin_id = $1 AND {scope_filter} ORDER BY notifications.created_at DESC, notifications.id DESC LIMIT 50"
    ))
    .bind(admin.id)
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let unread_count = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM admin_application_notifications AS notifications JOIN applications ON applications.id = notifications.application_id JOIN job_postings ON job_postings.id = applications.job_id WHERE notifications.admin_id = $1 AND notifications.read_at IS NULL AND {scope_filter}"
    ))
    .bind(admin.id)
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_one(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(AdminNotificationsResponse { data, unread_count }))
}

pub(super) async fn admin_mark_notification_read(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(APPLICATIONS_VIEW)?;
    let result = sqlx::query(
        "UPDATE admin_application_notifications AS notifications SET read_at = COALESCE(notifications.read_at, NOW()) FROM applications JOIN job_postings ON job_postings.id = applications.job_id WHERE notifications.id = $1 AND notifications.admin_id = $2 AND notifications.application_id = applications.id AND ($3 IN ('super_admin', 'admin') OR ($3 = 'division_head' AND job_postings.division_id = $4) OR ($3 = 'department_head' AND job_postings.target_level <> 'division' AND job_postings.department_id = $5))",
    )
    .bind(id)
    .bind(admin.id)
    .bind(admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
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

pub(super) async fn admin_list_applications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AdminApplicationsResponse>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(APPLICATIONS_VIEW)?;
    let data = sqlx::query_as::<_, AdminApplication>(
        "SELECT applications.public_id AS id, COALESCE(applications.applicant_full_name, applicants.name) AS applicant_name, applicants.email AS applicant_email, job_postings.id AS job_id, job_postings.title AS job_title, applications.employee_number, applications.origin_division, applications.origin_unit, applications.education_level, applications.study_field, applications.phone_number, applications.current_position, applications.current_unit, applications.motivation, applications.status, (SELECT COUNT(*) FROM application_documents WHERE application_id = applications.id) AS documents_count, applications.created_at::text AS created_at FROM applications JOIN applicants ON applicants.id = applications.applicant_id JOIN job_postings ON job_postings.id = applications.job_id WHERE ($1 IN ('super_admin', 'admin') OR ($1 = 'division_head' AND job_postings.division_id = $2) OR ($1 = 'department_head' AND job_postings.target_level <> 'division' AND job_postings.department_id = $3)) ORDER BY applications.created_at DESC",
    )
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(AdminApplicationsResponse { data }))
}

pub(super) async fn admin_get_application(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(public_id): Path<String>,
) -> Result<Json<AdminApplicationDetail>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(APPLICATIONS_VIEW)?;
    let internal_id = sqlx::query_scalar::<_, i64>(
        "SELECT applications.id FROM applications JOIN job_postings ON job_postings.id = applications.job_id WHERE applications.public_id = $1 AND ($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND job_postings.division_id = $3) OR ($2 = 'department_head' AND job_postings.target_level <> 'division' AND job_postings.department_id = $4))",
    )
    .bind(&public_id)
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::NotFound("Lamaran tidak ditemukan."))?;
    let application = sqlx::query_as::<_, AdminApplication>(
        "SELECT applications.public_id AS id, COALESCE(applications.applicant_full_name, applicants.name) AS applicant_name, applicants.email AS applicant_email, job_postings.id AS job_id, job_postings.title AS job_title, applications.employee_number, applications.origin_division, applications.origin_unit, applications.education_level, applications.study_field, applications.phone_number, applications.current_position, applications.current_unit, applications.motivation, applications.status, (SELECT COUNT(*) FROM application_documents WHERE application_id = applications.id) AS documents_count, applications.created_at::text AS created_at FROM applications JOIN applicants ON applicants.id = applications.applicant_id JOIN job_postings ON job_postings.id = applications.job_id WHERE applications.id = $1",
    )
    .bind(internal_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;
    let Some(application) = application else {
        return Err(ApiError::NotFound("Lamaran tidak ditemukan."));
    };
    let documents = sqlx::query_as::<_, ApplicationDocumentSummary>(
        "SELECT id, document_type, file_name, file_size FROM application_documents WHERE application_id = $1 ORDER BY created_at, id",
    )
    .bind(internal_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(AdminApplicationDetail {
        application,
        documents,
    }))
}

pub(super) async fn admin_download_application_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((public_id, document_id)): Path<(String, i64)>,
) -> Result<Response, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(APPLICATIONS_DOWNLOAD_DOCUMENTS)?;
    let application_id = sqlx::query_scalar::<_, i64>(
        "SELECT applications.id FROM applications JOIN job_postings ON job_postings.id = applications.job_id WHERE applications.public_id = $1 AND ($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND job_postings.division_id = $3) OR ($2 = 'department_head' AND job_postings.target_level <> 'division' AND job_postings.department_id = $4))",
    )
    .bind(&public_id)
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::NotFound("Lamaran tidak ditemukan."))?;
    let document = sqlx::query_as::<_, ApplicationDocumentFile>(
        "SELECT document_type, content FROM application_documents WHERE id = $1 AND application_id = $2",
    )
    .bind(document_id)
    .bind(application_id)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::NotFound("Dokumen lamaran tidak ditemukan."))?;
    let document_label = match document.document_type.as_str() {
        "cv" => "cv".to_owned(),
        "cover_letter" => "cover-letter".to_owned(),
        "certificate" => "certificate".to_owned(),
        "supporting_document" => format!("supporting-document-{document_id}"),
        _ => return Err(ApiError::Internal),
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(CACHE_CONTROL, "private, no-store")
        .header(CONTENT_TYPE, "application/pdf")
        .header(
            CONTENT_DISPOSITION,
            format!("attachment; filename=\"application-{public_id}-{document_label}.pdf\""),
        )
        .header("x-content-type-options", "nosniff")
        .body(Body::from(document.content))
        .map_err(internal_error)
}

pub(super) async fn admin_set_application_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(public_id): Path<String>,
    Json(request): Json<ApplicationStatusRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(APPLICATIONS_CHANGE_STATUS)?;
    let status = request.status.trim().to_ascii_lowercase();
    if !matches!(
        status.as_str(),
        "submitted" | "screening" | "interview" | "accepted" | "rejected"
    ) {
        return Err(ApiError::BadRequest("Status lamaran tidak valid."));
    }
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let current = sqlx::query_as::<_, (i64, i64, String)>(
        "SELECT applications.id, applications.applicant_id, applications.status FROM applications JOIN job_postings ON job_postings.id = applications.job_id WHERE applications.public_id = $1 AND ($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND job_postings.division_id = $3) OR ($2 = 'department_head' AND job_postings.target_level <> 'division' AND job_postings.department_id = $4)) FOR UPDATE OF applications",
    )
    .bind(&public_id)
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?;
    let Some((application_id, applicant_id, previous_status)) = current else {
        return Err(ApiError::NotFound("Lamaran tidak ditemukan."));
    };
    let status_changed = previous_status != status;
    if status_changed {
        if !is_valid_application_status_transition(&previous_status, &status) {
            return Err(ApiError::Conflict(
                "Perubahan status tidak sesuai tahapan lamaran.",
            ));
        }
        let reason = validate_application_status_reason(&status, request.reason.as_deref(), true)
            .map_err(ApiError::BadRequest)?;
        sqlx::query("UPDATE applications SET status = $2 WHERE id = $1")
            .bind(application_id)
            .bind(&status)
            .execute(&mut *transaction)
            .await
            .map_err(internal_error)?;
        sqlx::query(
            "INSERT INTO application_status_notifications (application_id, applicant_id, previous_status, new_status, reason) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(application_id)
        .bind(applicant_id)
        .bind(previous_status)
        .bind(&status)
        .bind(reason)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    }
    transaction.commit().await.map_err(internal_error)?;
    if status_changed {
        dispatch_applicant_push(state.pool.clone(), state.push_service.clone(), applicant_id);
    }
    Ok(Json(
        json!({ "message": "Status lamaran berhasil diperbarui." }),
    ))
}

pub(super) fn is_valid_application_status_transition(
    previous_status: &str,
    new_status: &str,
) -> bool {
    previous_status == new_status
        || matches!(
            (previous_status, new_status),
            ("submitted", "screening")
                | ("submitted", "interview")
                | ("submitted", "accepted" | "rejected")
                | ("screening", "interview")
                | ("screening", "accepted" | "rejected")
                | ("interview", "accepted" | "rejected")
        )
}
