use super::*;

pub(super) async fn admin_list_accounts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_operational_admin(&state.pool, &headers)
        .await?
        .require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let data = sqlx::query_as::<_, AdminApplicantAccount>(
        "SELECT applicants.id, applicants.name, COALESCE(applicants.email, '') AS email, applicants.employee_number, applicants.division_id, applicants.department_id, employee_divisions.name AS division_name, employee_departments.name AS department_name, applicants.bureau_id, employee_bureaus.name AS bureau_name, applicants.position_title, applicants.last_education, applicants.created_at::text AS created_at, COUNT(applications.id)::BIGINT AS applications_count, applicants.is_active, applicants.must_change_password FROM applicants LEFT JOIN applications ON applications.applicant_id = applicants.id LEFT JOIN employee_divisions ON employee_divisions.id = applicants.division_id LEFT JOIN employee_departments ON employee_departments.id = applicants.department_id LEFT JOIN employee_bureaus ON employee_bureaus.id = applicants.bureau_id GROUP BY applicants.id, employee_divisions.id, employee_departments.id, employee_bureaus.id ORDER BY applicants.created_at DESC, applicants.id DESC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(json!({ "data": data })))
}

pub(super) async fn admin_create_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(account): Json<AdminApplicantCreateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let name = account.name.trim();
    let email = normalize_optional_email(account.email.as_deref())?;
    if name.is_empty() || name.len() > 200 {
        return Err(ApiError::BadRequest(
            "Nama wajib diisi dan maksimal 200 karakter.",
        ));
    }

    let profile = resolve_applicant_profile(&state.pool, &account.profile).await?;
    if profile.employee_number.is_none() {
        return Err(ApiError::BadRequest("NIP wajib diisi."));
    }
    let password_hash = hash_password(DEFAULT_APPLICANT_PASSWORD)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let id = match sqlx::query_scalar::<_, i64>(
        "INSERT INTO applicants (name, email, password_hash, must_change_password, employee_number, division_id, department_id, position_title, last_education, bureau_id) VALUES ($1, $2, $3, TRUE, $4, $5, $6, $7, $8, $9) RETURNING id",
    )
    .bind(name)
    .bind(&email)
    .bind(password_hash)
    .bind(&profile.employee_number)
    .bind(profile.division_id)
    .bind(profile.department_id)
    .bind(&profile.position_title)
    .bind(&profile.last_education)
    .bind(profile.bureau_id)
    .fetch_one(&mut *transaction)
    .await
    {
        Ok(id) => id,
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Email atau NIP sudah terdaftar."));
        }
        Err(error) => return Err(internal_error(error)),
    };
    record_admin_audit(
        &mut transaction,
        admin.id,
        "create",
        "applicant_account",
        &id.to_string(),
        json!({ "name": name, "email": email, "employee_number": profile.employee_number }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Akun berhasil ditambahkan. Kata sandi awal: pal@123 (wajib diganti saat masuk pertama)." })))
}

pub(super) async fn admin_import_accounts(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ApplicantImportRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    if request.rows.is_empty() {
        return Err(ApiError::BadRequest("File tidak berisi data karyawan."));
    }
    if request.rows.len() > 5000 {
        return Err(ApiError::BadRequest("Maksimal 5000 baris per impor."));
    }
    // One shared initial password for the batch: hash once (Argon2 is deliberately slow).
    let password_hash = hash_password(DEFAULT_APPLICANT_PASSWORD)?;
    let mut cache = load_import_org_cache(&state.pool).await?;

    let mut created = 0_i64;
    let mut skipped = 0_i64;
    let mut invalid: Vec<serde_json::Value> = Vec::new();
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    for (index, row) in request.rows.iter().enumerate() {
        let line = index + 2; // header is line 1
        let name = row.name.trim();
        let prepared = (|| -> Result<_, ApiError> {
            let employee_number = clean_profile_text(&Some(row.employee_number.clone()), 40)?
                .ok_or(ApiError::BadRequest("NIP kosong."))?;
            if name.is_empty() || name.len() > 200 {
                return Err(ApiError::BadRequest("Nama kosong atau terlalu panjang."));
            }
            Ok((
                employee_number,
                clean_profile_text(&row.division_name, 200)?,
                clean_profile_text(&row.department_name, 200)?,
                clean_profile_text(&row.position_title, 200)?,
                clean_profile_text(&row.last_education, 80)?,
            ))
        })();
        let (employee_number, division, department, position_title, last_education) =
            match prepared {
                Ok(value) => value,
                Err(error) => {
                    let message = match error {
                        ApiError::BadRequest(message) => message,
                        _ => "Baris tidak valid.",
                    };
                    invalid.push(json!({ "line": line, "message": message }));
                    continue;
                }
            };
        // A department only makes sense inside a division; without one it is dropped.
        let (division_id, department_id) = ensure_import_org(
            &mut transaction,
            &mut cache,
            division.as_deref(),
            department.as_deref(),
        )
        .await?;
        let inserted = sqlx::query_scalar::<_, i64>(
            "INSERT INTO applicants (name, email, password_hash, must_change_password, employee_number, division_id, department_id, position_title, last_education) SELECT $1::TEXT, $2::TEXT, $3::TEXT, TRUE, $4::TEXT, $5::BIGINT, $6::BIGINT, $7::TEXT, $8::TEXT WHERE NOT EXISTS (SELECT 1 FROM admins WHERE employee_number = $4) ON CONFLICT DO NOTHING RETURNING id",
        )
        .bind(name)
        .bind(Option::<String>::None)
        .bind(&password_hash)
        .bind(&employee_number)
        .bind(division_id)
        .bind(department_id)
        .bind(&position_title)
        .bind(&last_education)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(internal_error)?;
        if inserted.is_some() {
            created += 1;
        } else {
            skipped += 1;
        }
    }
    let invalid_count = invalid.len();
    record_admin_audit(
        &mut transaction,
        admin.id,
        "create",
        "applicant_account",
        "import",
        json!({ "source": "excel_import", "created": created, "skipped": skipped, "invalid": invalid_count, "new_divisions": cache.created_divisions, "new_departments": cache.created_departments }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    invalid.truncate(50);
    Ok(Json(json!({
        "created": created,
        "skipped": skipped,
        "new_divisions": cache.created_divisions,
        "new_departments": cache.created_departments,
        "invalid_count": invalid_count,
        "invalid": invalid,
        "message": format!("{created} akun dibuat, {skipped} dilewati (NIP/email sudah terdaftar), {invalid_count} baris tidak valid. Master data bertambah {} divisi dan {} departemen.", cache.created_divisions, cache.created_departments),
    })))
}

pub(super) async fn admin_reset_account_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let password_hash = hash_password(DEFAULT_APPLICANT_PASSWORD)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query(
        "UPDATE applicants SET password_hash = $1, must_change_password = TRUE, failed_login_attempts = 0, locked_until = NULL WHERE id = $2",
    )
    .bind(password_hash)
    .bind(id)
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Akun tidak ditemukan."));
    }
    sqlx::query("DELETE FROM applicant_tokens WHERE applicant_id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    record_admin_audit(
        &mut transaction,
        admin.id,
        "update",
        "applicant_account",
        &id.to_string(),
        json!({ "password_reset_to_default": true }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({
        "message": "Kata sandi direset ke pal@123. Pelamar wajib menggantinya saat masuk berikutnya."
    })))
}

pub(super) async fn admin_update_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(account): Json<AdminApplicantUpdateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let name = account.name.trim();
    let email = normalize_optional_email(account.email.as_deref())?;
    if name.is_empty() || name.len() > 200 {
        return Err(ApiError::BadRequest(
            "Nama wajib diisi dan maksimal 200 karakter.",
        ));
    }
    let profile = resolve_applicant_profile(&state.pool, &account.profile).await?;
    if profile.employee_number.is_none() {
        return Err(ApiError::BadRequest("NIP wajib diisi."));
    }
    if let Some(password) = account.password.as_deref() {
        validate_applicant_password(password)?;
    }

    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let previous = sqlx::query_as::<_, (String, String)>(
        "SELECT name, COALESCE(email, '') FROM applicants WHERE id = $1 FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::NotFound("Akun tidak ditemukan."))?;
    let new_password = match account.password.as_deref() {
        Some(password) => Some(password),
        None if account.reset_password => Some(DEFAULT_APPLICANT_PASSWORD),
        None => None,
    };
    let result = if let Some(password) = new_password {
        let password_hash = hash_password(password)?;
        sqlx::query("UPDATE applicants SET name = $1, email = $2, password_hash = $3, must_change_password = TRUE, failed_login_attempts = 0, locked_until = NULL, employee_number = $5, division_id = $6, department_id = $7, position_title = $8, last_education = $9, bureau_id = $10 WHERE id = $4")
            .bind(name)
            .bind(&email)
            .bind(password_hash)
            .bind(id)
            .bind(&profile.employee_number)
            .bind(profile.division_id)
            .bind(profile.department_id)
            .bind(&profile.position_title)
            .bind(&profile.last_education)
            .bind(profile.bureau_id)
            .execute(&mut *transaction)
            .await
    } else {
        sqlx::query("UPDATE applicants SET name = $1, email = $2, employee_number = $4, division_id = $5, department_id = $6, position_title = $7, last_education = $8, bureau_id = $9 WHERE id = $3")
            .bind(name)
            .bind(&email)
            .bind(id)
            .bind(&profile.employee_number)
            .bind(profile.division_id)
            .bind(profile.department_id)
            .bind(&profile.position_title)
            .bind(&profile.last_education)
            .bind(profile.bureau_id)
            .execute(&mut *transaction)
            .await
    };
    let result = match result {
        Ok(result) => result,
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Email atau NIP sudah digunakan akun lain."));
        }
        Err(error) => return Err(internal_error(error)),
    };
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Akun tidak ditemukan."));
    }

    sqlx::query("DELETE FROM applicant_tokens WHERE applicant_id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    record_admin_audit(
        &mut transaction,
        admin.id,
        "update",
        "applicant_account",
        &id.to_string(),
        json!({
            "before": { "name": previous.0, "email": previous.1 },
            "after": { "name": name, "email": email },
            "password_changed": account.password.is_some(),
        }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Akun berhasil diperbarui. Sesi aktif akun tersebut telah diakhiri." }),
    ))
}

pub(super) async fn admin_deactivate_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    set_applicant_account_status(&state.pool, &headers, id, false).await?;
    Ok(Json(
        json!({ "message": "Akun dinonaktifkan; riwayat lamaran dan dokumen tetap tersimpan." }),
    ))
}

pub(super) async fn admin_set_account_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<ApplicantAccountStatusRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    set_applicant_account_status(&state.pool, &headers, id, request.is_active).await?;
    let message = if request.is_active {
        "Akun berhasil diaktifkan kembali."
    } else {
        "Akun dinonaktifkan; riwayat lamaran dan dokumen tetap tersimpan."
    };
    Ok(Json(json!({ "message": message })))
}

async fn set_applicant_account_status(
    pool: &PgPool,
    headers: &HeaderMap,
    id: i64,
    is_active: bool,
) -> Result<(), ApiError> {
    let admin = authorized_operational_admin(pool, headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let mut transaction = pool.begin().await.map_err(internal_error)?;
    let previous =
        sqlx::query_scalar::<_, bool>("SELECT is_active FROM applicants WHERE id = $1 FOR UPDATE")
            .bind(id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(internal_error)?
            .ok_or(ApiError::NotFound("Akun tidak ditemukan."))?;
    let result = sqlx::query("UPDATE applicants SET is_active = $1 WHERE id = $2")
        .bind(is_active)
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Akun tidak ditemukan."));
    }
    if !is_active {
        sqlx::query("DELETE FROM applicant_tokens WHERE applicant_id = $1")
            .bind(id)
            .execute(&mut *transaction)
            .await
            .map_err(internal_error)?;
    }
    if previous != is_active {
        record_admin_audit(
            &mut transaction,
            admin.id,
            if is_active { "activate" } else { "deactivate" },
            "applicant_account",
            &id.to_string(),
            json!({ "is_active": is_active }),
        )
        .await
        .map_err(internal_error)?;
    }
    transaction.commit().await.map_err(internal_error)?;
    Ok(())
}

pub(super) async fn admin_list_admin_accounts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_super_admin(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, ManagedAdminAccount>(
        "SELECT admins.id, admins.name, admins.email, admins.employee_number, admins.created_at::text AS created_at, admins.is_active, admins.admin_role, admins.division_id, admins.department_id, admins.bureau_id, CASE admins.admin_role WHEN 'super_admin' THEN 'Super Admin' WHEN 'admin' THEN 'Admin Operasional' WHEN 'division_head' THEN divisions.name WHEN 'department_head' THEN admin_departments.name END AS scope_label, COALESCE((SELECT array_agg(admin_permissions.permission_key ORDER BY admin_permissions.permission_key) FROM admin_permissions WHERE admin_permissions.admin_id = admins.id), ARRAY[]::TEXT[]) AS permissions FROM admins LEFT JOIN divisions ON divisions.id = admins.division_id LEFT JOIN departments AS admin_departments ON admin_departments.id = admins.department_id ORDER BY admins.created_at DESC, admins.id DESC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(json!({ "data": data })))
}

pub(super) async fn admin_create_admin_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(account): Json<AdminAccountCreateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let actor = authorized_super_admin(&state.pool, &headers).await?;
    if account.admin_role == "super_admin" {
        return Err(ApiError::BadRequest(
            "Super Admin tidak dapat dibuat melalui Kelola Akun.",
        ));
    }
    let name = account.name.trim();
    let email = account.email.trim().to_ascii_lowercase();
    validate_admin_account(name, &email, &account.password)?;
    let employee_number = clean_profile_text(&account.employee_number, 40)?;
    validate_admin_scope(
        &state.pool,
        &account.admin_role,
        account.division_id,
        account.department_id,
        account.bureau_id,
    )
    .await?;
    let permissions = account
        .permissions
        .unwrap_or_else(|| default_permissions(&account.admin_role));
    validate_admin_permissions(&account.admin_role, &permissions)?;
    let password_hash = hash_password(&account.password)?;

    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let admin_id = match sqlx::query_scalar::<_, i64>("INSERT INTO admins (name, email, password_hash, admin_role, division_id, department_id, bureau_id, employee_number) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id")
        .bind(name)
        .bind(email)
        .bind(password_hash)
        .bind(&account.admin_role)
        .bind(account.division_id)
        .bind(account.department_id)
        .bind(account.bureau_id)
        .bind(&employee_number)
        .fetch_one(&mut *transaction)
        .await
    {
        Ok(id) => id,
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Email atau NIP sudah terdaftar."));
        }
        Err(error) => return Err(internal_error(error)),
    };
    sqlx::query(
        "INSERT INTO admin_permissions (admin_id, permission_key) SELECT $1, unnest($2::TEXT[])",
    )
    .bind(admin_id)
    .bind(&permissions)
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;
    record_admin_audit(
        &mut transaction,
        actor.id,
        "create",
        "admin_account",
        &admin_id.to_string(),
        json!({
            "name": name,
            "email": account.email.trim().to_ascii_lowercase(),
            "employee_number": employee_number,
            "admin_role": account.admin_role,
            "division_id": account.division_id,
            "department_id": account.department_id,
            "permissions": permissions,
        }),
    )
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Akun admin berhasil ditambahkan." }),
    ))
}

pub(super) async fn admin_update_admin_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(account): Json<AdminAccountUpdateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let current_admin = authorized_super_admin(&state.pool, &headers).await?;
    if current_admin.id == id {
        return Err(ApiError::Conflict(
            "Akun admin yang sedang digunakan tidak dapat diubah dari halaman ini.",
        ));
    }
    let name = account.name.trim();
    let email = account.email.trim().to_ascii_lowercase();
    validate_applicant_name_and_email(name, &email)?;
    validate_admin_scope(
        &state.pool,
        &account.admin_role,
        account.division_id,
        account.department_id,
        account.bureau_id,
    )
    .await?;
    if let Some(password) = account.password.as_deref() {
        validate_admin_password(password)?;
    }

    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let active_super_admins = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM admins WHERE admin_role = 'super_admin' AND is_active = TRUE ORDER BY id FOR UPDATE",
    )
    .fetch_all(&mut *transaction)
    .await
    .map_err(internal_error)?;
    let previous = sqlx::query_as::<_, (String, String, String, Option<i64>, Option<i64>, Option<i64>)>(
        "SELECT name, email, admin_role, division_id, department_id, bureau_id FROM admins WHERE id = $1 FOR UPDATE",
    )
            .bind(id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(internal_error)?
            .ok_or(ApiError::NotFound("Akun admin tidak ditemukan."))?;
    let current_role = previous.2.clone();
    if account.admin_role == "super_admin" && current_role != "super_admin" {
        return Err(ApiError::BadRequest(
            "Super Admin tidak dapat dibuat melalui Kelola Akun.",
        ));
    }
    let previous_permissions = sqlx::query_scalar::<_, Vec<String>>(
        "SELECT COALESCE(array_agg(permission_key ORDER BY permission_key), ARRAY[]::TEXT[]) FROM admin_permissions WHERE admin_id = $1",
    )
    .bind(id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(internal_error)?;
    let permissions = match account.permissions {
        Some(permissions) => permissions,
        None if current_role == account.admin_role => {
            sqlx::query_scalar::<_, Vec<String>>(
                "SELECT COALESCE(array_agg(permission_key ORDER BY permission_key), ARRAY[]::TEXT[]) FROM admin_permissions WHERE admin_id = $1",
            )
            .bind(id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(internal_error)?
        }
        None => default_permissions(&account.admin_role),
    };
    validate_admin_permissions(&account.admin_role, &permissions)?;
    if current_role == "super_admin"
        && account.admin_role != "super_admin"
        && active_super_admins.len() <= 1
    {
        return Err(ApiError::Conflict(
            "Super Admin aktif terakhir tidak dapat diubah menjadi admin unit.",
        ));
    }
    let employee_number = clean_profile_text(&account.employee_number, 40)?;
    let result = if let Some(password) = account.password.as_deref() {
        let password_hash = hash_password(password)?;
        sqlx::query("UPDATE admins SET name = $1, email = $2, password_hash = $3, failed_login_attempts = 0, locked_until = NULL, admin_role = $4, division_id = $5, department_id = $6, bureau_id = $7, employee_number = $9 WHERE id = $8")
            .bind(name)
            .bind(&email)
            .bind(password_hash)
            .bind(&account.admin_role)
            .bind(account.division_id)
            .bind(account.department_id)
            .bind(account.bureau_id)
            .bind(id)
            .bind(&employee_number)
            .execute(&mut *transaction)
            .await
    } else {
        sqlx::query("UPDATE admins SET name = $1, email = $2, admin_role = $3, division_id = $4, department_id = $5, bureau_id = $6, employee_number = $8 WHERE id = $7")
            .bind(name)
            .bind(&email)
            .bind(&account.admin_role)
            .bind(account.division_id)
            .bind(account.department_id)
            .bind(account.bureau_id)
            .bind(id)
            .bind(&employee_number)
            .execute(&mut *transaction)
            .await
    };
    let result = match result {
        Ok(result) => result,
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Email atau NIP sudah digunakan akun lain."));
        }
        Err(error) => return Err(internal_error(error)),
    };
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Akun admin tidak ditemukan."));
    }
    sqlx::query("DELETE FROM admin_permissions WHERE admin_id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    sqlx::query(
        "INSERT INTO admin_permissions (admin_id, permission_key) SELECT $1, unnest($2::TEXT[])",
    )
    .bind(id)
    .bind(&permissions)
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;
    record_admin_audit(
        &mut transaction,
        current_admin.id,
        "update",
        "admin_account",
        &id.to_string(),
        json!({
            "before": {
                "name": previous.0,
                "email": previous.1,
                "admin_role": previous.2,
                "division_id": previous.3,
                "department_id": previous.4,
                "bureau_id": previous.5,
                "permissions": previous_permissions,
            },
            "after": {
                "name": name,
                "email": email,
                "admin_role": account.admin_role,
                "division_id": account.division_id,
                "department_id": account.department_id,
                "bureau_id": account.bureau_id,
                "permissions": permissions,
            },
            "password_changed": account.password.is_some(),
        }),
    )
    .await
    .map_err(internal_error)?;
    sqlx::query("DELETE FROM admin_tokens WHERE admin_id = $1")
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Akun admin diperbarui dan semua sesi aktifnya diakhiri." }),
    ))
}

pub(super) async fn admin_deactivate_admin_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    set_admin_account_status(&state.pool, &headers, id, false).await?;
    Ok(Json(
        json!({ "message": "Akun admin dinonaktifkan dan seluruh sesinya diakhiri." }),
    ))
}

pub(super) async fn admin_set_admin_account_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<AdminAccountStatusRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    set_admin_account_status(&state.pool, &headers, id, request.is_active).await?;
    let message = if request.is_active {
        "Akun admin berhasil diaktifkan kembali."
    } else {
        "Akun admin dinonaktifkan dan seluruh sesinya diakhiri."
    };
    Ok(Json(json!({ "message": message })))
}

async fn set_admin_account_status(
    pool: &PgPool,
    headers: &HeaderMap,
    id: i64,
    is_active: bool,
) -> Result<(), ApiError> {
    let current_admin = authorized_super_admin(pool, headers).await?;
    if !is_active && current_admin.id == id {
        return Err(ApiError::Conflict(
            "Anda tidak dapat menonaktifkan akun admin yang sedang digunakan.",
        ));
    }
    let mut transaction = pool.begin().await.map_err(internal_error)?;
    let active_admin_ids = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM admins WHERE admin_role = 'super_admin' AND is_active = TRUE ORDER BY id FOR UPDATE",
    )
    .fetch_all(&mut *transaction)
    .await
    .map_err(internal_error)?;
    let previous_active =
        sqlx::query_scalar::<_, bool>("SELECT is_active FROM admins WHERE id = $1 FOR UPDATE")
            .bind(id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(internal_error)?
            .ok_or(ApiError::NotFound("Akun admin tidak ditemukan."))?;
    if !is_active && active_admin_ids.contains(&id) && active_admin_ids.len() <= 1 {
        return Err(ApiError::Conflict(
            "Super Admin aktif terakhir tidak dapat dinonaktifkan.",
        ));
    }
    sqlx::query("UPDATE admins SET is_active = $1 WHERE id = $2")
        .bind(is_active)
        .bind(id)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    if !is_active {
        sqlx::query("DELETE FROM admin_tokens WHERE admin_id = $1")
            .bind(id)
            .execute(&mut *transaction)
            .await
            .map_err(internal_error)?;
    }
    if previous_active != is_active {
        record_admin_audit(
            &mut transaction,
            current_admin.id,
            if is_active { "activate" } else { "deactivate" },
            "admin_account",
            &id.to_string(),
            json!({ "is_active": is_active }),
        )
        .await
        .map_err(internal_error)?;
    }
    transaction.commit().await.map_err(internal_error)?;
    Ok(())
}

async fn validate_admin_scope(
    pool: &PgPool,
    role: &str,
    division_id: Option<i64>,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
) -> Result<(), ApiError> {
    if !is_valid_admin_scope_shape(role, division_id, department_id, bureau_id) {
        return Err(ApiError::BadRequest(
            "Peran admin dan lingkup organisasinya tidak sesuai.",
        ));
    }
    let exists = match role {
        "super_admin" | "admin" => true,
        "division_head" => {
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM divisions WHERE id = $1)")
                .bind(division_id)
                .fetch_one(pool)
                .await
                .map_err(internal_error)?
        }
        "department_head" => {
            sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM departments WHERE id = $1)")
                .bind(department_id)
                .fetch_one(pool)
                .await
                .map_err(internal_error)?
        }
        _ => false,
    };
    if !exists {
        return Err(ApiError::BadRequest(
            "Unit organisasi yang dipilih tidak ditemukan.",
        ));
    }
    Ok(())
}

pub(super) fn is_valid_admin_scope_shape(
    role: &str,
    division_id: Option<i64>,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
) -> bool {
    match role {
        "super_admin" | "admin" => {
            division_id.is_none() && department_id.is_none() && bureau_id.is_none()
        }
        "division_head" => division_id.is_some() && department_id.is_none() && bureau_id.is_none(),
        "department_head" => {
            division_id.is_none() && department_id.is_some() && bureau_id.is_none()
        }
        _ => false,
    }
}
