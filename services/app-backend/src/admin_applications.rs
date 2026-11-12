use super::*;

const APPLICATION_TARGET_JOINS: &str = "LEFT JOIN job_postings AS target_job ON target_job.id = applications.job_id LEFT JOIN departments AS target_department ON target_department.id = applications.target_department_id LEFT JOIN divisions AS target_division ON target_division.id = target_department.division_id LEFT JOIN bureaus AS target_bureau ON target_bureau.id = applications.target_bureau_id";
const APPLICATION_TARGET_FIELDS: &str = "applications.job_id, COALESCE(target_job.title, target_bureau.name, target_department.name) AS job_title, CASE WHEN target_job.id IS NOT NULL THEN CONCAT('job:', target_job.id) ELSE CONCAT('direct:', applications.target_department_id, ':', COALESCE(applications.target_bureau_id::text, '')) END AS target_key, COALESCE(target_job.target_level, CASE WHEN applications.target_bureau_id IS NULL THEN 'department' ELSE 'bureau' END) AS target_level, CASE WHEN target_job.id IS NOT NULL THEN CONCAT_WS(' / ', target_job.division, target_job.department, NULLIF(target_job.unit, '')) ELSE CONCAT_WS(' / ', target_division.name, target_department.name, CASE WHEN target_bureau.id IS NOT NULL THEN CONCAT(CASE target_bureau.unit_type WHEN 'bengkel' THEN 'Bengkel' ELSE 'Biro' END, ' - ', target_bureau.name) END) END AS target_label, applications.position_description";

#[derive(Deserialize)]
pub(super) struct ApplicationLimitRequest {
    max_applications: i32,
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

pub(super) async fn admin_get_application_limit(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    let max_applications = sqlx::query_scalar::<_, i32>(
        "SELECT max_applications FROM applicant_application_limit WHERE id = 1",
    )
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(json!({ "max_applications": max_applications })))
}

pub(super) async fn admin_create_application_limit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ApplicationLimitRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_super_admin(&state.pool, &headers).await?;
    let max_applications = validate_application_limit(request.max_applications)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query(
        "INSERT INTO applicant_application_limit (max_applications, updated_by) VALUES ($1, $2)",
    )
    .bind(max_applications)
    .bind(admin.id)
    .execute(&mut *transaction)
    .await;
    if let Err(error) = result {
        return if is_unique_violation(&error) {
            Err(ApiError::Conflict("Batas maksimal lamaran sudah dibuat."))
        } else {
            Err(internal_error(error))
        };
    }
    record_admin_audit(
        &mut transaction,
        admin.id,
        "create",
        "application_limit",
        "1",
        json!({ "max_applications": max_applications }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "max_applications": max_applications })))
}

pub(super) async fn admin_update_application_limit(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ApplicationLimitRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_super_admin(&state.pool, &headers).await?;
    let max_applications = validate_application_limit(request.max_applications)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let previous = sqlx::query_scalar::<_, i32>(
        "SELECT max_applications FROM applicant_application_limit WHERE id = 1 FOR UPDATE",
    )
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::NotFound("Batas maksimal lamaran belum dibuat."))?;
    let result = sqlx::query(
        "UPDATE applicant_application_limit SET max_applications = $1, updated_by = $2, updated_at = NOW() WHERE id = 1",
    )
    .bind(max_applications)
    .bind(admin.id)
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Batas maksimal lamaran belum dibuat."));
    }
    record_admin_audit(
        &mut transaction,
        admin.id,
        "update",
        "application_limit",
        "1",
        json!({ "previous_max_applications": previous, "max_applications": max_applications }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "max_applications": max_applications })))
}

pub(super) async fn admin_delete_application_limit(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_super_admin(&state.pool, &headers).await?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let previous = sqlx::query_scalar::<_, i32>(
        "SELECT max_applications FROM applicant_application_limit WHERE id = 1 FOR UPDATE",
    )
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::NotFound("Batas maksimal lamaran belum dibuat."))?;
    let result = sqlx::query("DELETE FROM applicant_application_limit WHERE id = 1")
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Batas maksimal lamaran belum dibuat."));
    }
    record_admin_audit(
        &mut transaction,
        admin.id,
        "delete",
        "application_limit",
        "1",
        json!({ "max_applications": previous }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Batas maksimal lamaran berhasil dihapus." }),
    ))
}

pub(super) async fn admin_list_notifications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AdminNotificationsResponse>, ApiError> {
    let admin = authorized_admin_context(&state.pool, &headers).await?;
    admin.require_permission(APPLICATIONS_VIEW)?;
    let scope_filter = "($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND COALESCE(target_job.division_id, target_division.id) = $3) OR ($2 = 'department_head' AND COALESCE(target_job.department_id, applications.target_department_id) = $4))";
    let data = sqlx::query_as::<_, AdminApplicationNotification>(&format!(
        "SELECT notifications.id, applications.public_id AS application_id, applications.job_id, COALESCE(target_job.title, target_bureau.name, target_department.name) AS job_title, CASE WHEN target_job.id IS NOT NULL THEN CONCAT_WS(' / ', target_job.division, target_job.department, NULLIF(target_job.unit, '')) ELSE CONCAT_WS(' / ', target_division.name, target_department.name, CASE WHEN target_bureau.id IS NOT NULL THEN CONCAT(CASE target_bureau.unit_type WHEN 'bengkel' THEN 'Bengkel' ELSE 'Biro' END, ' - ', target_bureau.name) END) END AS target_label, COALESCE(applications.applicant_full_name, applicants.name) AS applicant_name, COALESCE(target_job.target_level, CASE WHEN applications.target_bureau_id IS NULL THEN 'department' ELSE 'bureau' END) AS target_level, notifications.created_at::text AS created_at, notifications.read_at::text AS read_at FROM admin_application_notifications AS notifications JOIN applications ON applications.id = notifications.application_id JOIN applicants ON applicants.id = applications.applicant_id {APPLICATION_TARGET_JOINS} WHERE notifications.admin_id = $1 AND {scope_filter} ORDER BY notifications.created_at DESC, notifications.id DESC LIMIT 50"
    ))
    .bind(admin.id)
    .bind(&admin.admin_role)
    .bind(admin.division_id)
    .bind(admin.department_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let unread_count = sqlx::query_scalar::<_, i64>(&format!(
        "SELECT COUNT(*) FROM admin_application_notifications AS notifications JOIN applications ON applications.id = notifications.application_id {APPLICATION_TARGET_JOINS} WHERE notifications.admin_id = $1 AND notifications.read_at IS NULL AND {scope_filter}"
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
    let result = sqlx::query(&format!(
        "UPDATE admin_application_notifications AS notifications SET read_at = COALESCE(notifications.read_at, NOW()) FROM applications {APPLICATION_TARGET_JOINS} WHERE notifications.id = $1 AND notifications.admin_id = $2 AND notifications.application_id = applications.id AND ($3 IN ('super_admin', 'admin') OR ($3 = 'division_head' AND COALESCE(target_job.division_id, target_division.id) = $4) OR ($3 = 'department_head' AND COALESCE(target_job.department_id, applications.target_department_id) = $5))"
    ))
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
    let scope_filter = "($1 IN ('super_admin', 'admin') OR ($1 = 'division_head' AND COALESCE(target_job.division_id, target_division.id) = $2) OR ($1 = 'department_head' AND COALESCE(target_job.department_id, applications.target_department_id) = $3))";
    let data = sqlx::query_as::<_, AdminApplication>(
        &format!("SELECT applications.public_id AS id, COALESCE(applications.applicant_full_name, applicants.name) AS applicant_name, COALESCE(applicants.email, '') AS applicant_email, {APPLICATION_TARGET_FIELDS}, applications.employee_number, applications.origin_division, applications.origin_unit, applications.education_level, applications.study_field, applications.current_position, applications.current_unit, applications.motivation, applications.status, (SELECT COUNT(*) FROM application_documents WHERE application_id = applications.id) AS documents_count, applications.created_at::text AS created_at FROM applications JOIN applicants ON applicants.id = applications.applicant_id {APPLICATION_TARGET_JOINS} WHERE {scope_filter} ORDER BY applications.created_at DESC"),
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
    let scope_filter = "($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND COALESCE(target_job.division_id, target_division.id) = $3) OR ($2 = 'department_head' AND COALESCE(target_job.department_id, applications.target_department_id) = $4))";
    let internal_id = sqlx::query_scalar::<_, i64>(
        &format!("SELECT applications.id FROM applications {APPLICATION_TARGET_JOINS} WHERE applications.public_id = $1 AND {scope_filter}"),
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
        &format!("SELECT applications.public_id AS id, COALESCE(applications.applicant_full_name, applicants.name) AS applicant_name, COALESCE(applicants.email, '') AS applicant_email, {APPLICATION_TARGET_FIELDS}, applications.employee_number, applications.origin_division, applications.origin_unit, applications.education_level, applications.study_field, applications.current_position, applications.current_unit, applications.motivation, applications.status, (SELECT COUNT(*) FROM application_documents WHERE application_id = applications.id) AS documents_count, applications.created_at::text AS created_at FROM applications JOIN applicants ON applicants.id = applications.applicant_id {APPLICATION_TARGET_JOINS} WHERE applications.id = $1"),
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
    let scope_filter = "($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND COALESCE(target_job.division_id, target_division.id) = $3) OR ($2 = 'department_head' AND COALESCE(target_job.department_id, applications.target_department_id) = $4))";
    let application_id = sqlx::query_scalar::<_, i64>(
        &format!("SELECT applications.id FROM applications {APPLICATION_TARGET_JOINS} WHERE applications.public_id = $1 AND {scope_filter}"),
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
    let scope_filter = "($2 IN ('super_admin', 'admin') OR ($2 = 'division_head' AND COALESCE(target_job.division_id, target_division.id) = $3) OR ($2 = 'department_head' AND COALESCE(target_job.department_id, applications.target_department_id) = $4))";
    let current = sqlx::query_as::<_, (i64, i64, String)>(
        &format!("SELECT applications.id, applications.applicant_id, applications.status FROM applications {APPLICATION_TARGET_JOINS} WHERE applications.public_id = $1 AND {scope_filter} FOR UPDATE OF applications"),
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
        // Optimistic concurrency: the admin decided looking at `expected_status`; if someone else moved
        // the application on in the meantime, ask them to review the new state first.
        if let Some(expected) = request.expected_status.as_deref() {
            if expected.trim().to_ascii_lowercase() != previous_status {
                return Err(ApiError::Conflict(
                    "Status lamaran sudah diubah admin lain. Muat ulang lalu periksa kembali.",
                ));
            }
        }
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
                | ("submitted", "rejected")
                | ("screening", "interview")
                | ("screening", "rejected")
                | ("interview", "accepted" | "rejected")
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn application_limit_accepts_positive_values_up_to_the_supported_maximum() {
        assert_eq!(validate_application_limit(1).unwrap(), 1);
        assert_eq!(validate_application_limit(10_000).unwrap(), 10_000);
        assert!(matches!(
            validate_application_limit(0),
            Err(ApiError::BadRequest(_))
        ));
        assert!(matches!(
            validate_application_limit(10_001),
            Err(ApiError::BadRequest(_))
        ));
    }

    #[test]
    fn application_status_transitions_follow_the_selection_stages() {
        assert!(is_valid_application_status_transition(
            "submitted",
            "screening"
        ));
        assert!(is_valid_application_status_transition(
            "submitted",
            "rejected"
        ));
        assert!(is_valid_application_status_transition(
            "screening",
            "interview"
        ));
        assert!(is_valid_application_status_transition(
            "screening",
            "rejected"
        ));
        assert!(is_valid_application_status_transition(
            "interview",
            "accepted"
        ));
        assert!(is_valid_application_status_transition(
            "interview",
            "rejected"
        ));
        assert!(is_valid_application_status_transition(
            "accepted", "accepted"
        ));
        assert!(is_valid_application_status_transition(
            "rejected", "rejected"
        ));

        assert!(!is_valid_application_status_transition(
            "submitted",
            "interview"
        ));
        assert!(!is_valid_application_status_transition(
            "submitted",
            "accepted"
        ));
        assert!(!is_valid_application_status_transition(
            "screening",
            "accepted"
        ));
        assert!(!is_valid_application_status_transition(
            "accepted", "rejected"
        ));
        assert!(!is_valid_application_status_transition(
            "rejected",
            "screening"
        ));
    }
}
