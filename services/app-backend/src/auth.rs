use super::*;

pub(super) async fn login(
    State(state): State<AppState>,
    Json(credentials): Json<LoginRequest>,
) -> Result<(HeaderMap, Json<LoginResponse>), ApiError> {
    let identifier = credentials.email.trim().to_owned();
    let email = identifier.to_ascii_lowercase();
    if identifier.is_empty()
        || identifier.len() > 254
        || identifier.chars().any(char::is_whitespace)
        || credentials.password.is_empty()
    {
        return Err(ApiError::BadRequest(
            "NIP dan kata sandi tidak sesuai.",
        ));
    }

    let applicant = sqlx::query_as::<_, ApplicantRecord>(
        "SELECT id, name, COALESCE(email, '') AS email, COALESCE(employee_number, '') AS employee_number, password_hash, must_change_password, COALESCE(locked_until > NOW(), FALSE) AS login_locked FROM applicants WHERE employee_number = $1 AND is_active = TRUE",
    )
    .bind(&identifier)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;

    if let Some(applicant) = applicant {
        if applicant.login_locked {
            return Err(ApiError::AccountSuspended);
        }
        let password_hash = PasswordHash::new(&applicant.password_hash).map_err(internal_error)?;
        if Argon2::default()
            .verify_password(credentials.password.as_bytes(), &password_hash)
            .is_ok()
        {
            ensure_applicant_login_unlocked(&state.pool, applicant.id).await?;
            let (token, token_hash) = create_token();
            sqlx::query(
                "INSERT INTO applicant_tokens (token_hash, applicant_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
            )
            .bind(token_hash)
            .bind(applicant.id)
            .execute(&state.pool)
            .await
            .map_err(internal_error)?;

            let mut headers = HeaderMap::new();
            headers.insert(SET_COOKIE, session_cookie(Some(&token))?);
            return Ok((
                headers,
                Json(LoginResponse::Applicant(AuthResponse {
                    role: "applicant".to_owned(),
                    applicant: Applicant {
                        name: applicant.name,
                        email: applicant.email,
                        employee_number: applicant.employee_number,
                        must_change_password: applicant.must_change_password,
                    },
                })),
            ));
        }
        if record_applicant_login_failure(&state.pool, applicant.id).await? {
            return Err(ApiError::AccountSuspended);
        }
    }

    let admin = sqlx::query_as::<_, AdminRecord>(
        "SELECT admins.id, admins.name, admins.email, admins.password_hash, COALESCE(admins.locked_until > NOW(), FALSE) AS login_locked, admins.admin_role, admins.division_id, admins.department_id, admins.bureau_id, COALESCE((SELECT array_agg(admin_permissions.permission_key ORDER BY admin_permissions.permission_key) FROM admin_permissions WHERE admin_permissions.admin_id = admins.id), ARRAY[]::TEXT[]) AS permissions FROM admins WHERE admins.email = $1 AND admins.is_active = TRUE",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;
    let Some(admin) = admin else {
        return Err(ApiError::BadRequest("NIP atau kata sandi tidak sesuai."));
    };
    if admin.login_locked {
        return Err(ApiError::AccountSuspended);
    }
    let password_hash = PasswordHash::new(&admin.password_hash).map_err(internal_error)?;
    if Argon2::default()
        .verify_password(credentials.password.as_bytes(), &password_hash)
        .is_err()
    {
        if record_admin_login_failure(&state.pool, admin.id).await? {
            return Err(ApiError::AccountSuspended);
        }
        return Err(ApiError::BadRequest("Email atau kata sandi tidak sesuai."));
    }

    ensure_admin_login_unlocked(&state.pool, admin.id).await?;
    let (token, token_hash) = create_token();
    sqlx::query(
        "INSERT INTO admin_tokens (token_hash, admin_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
    )
    .bind(token_hash)
    .bind(admin.id)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;

    let mut headers = HeaderMap::new();
    headers.insert(SET_COOKIE, session_cookie(Some(&token))?);
    Ok((
        headers,
        Json(LoginResponse::Admin(AdminAuthResponse {
            role: "admin".to_owned(),
            admin: Admin {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                admin_role: admin.admin_role,
                division_id: admin.division_id,
                department_id: admin.department_id,
                bureau_id: admin.bureau_id,
                permissions: admin.permissions,
            },
        })),
    ))
}

pub(super) async fn admin_login(
    State(state): State<AppState>,
    Json(credentials): Json<AdminLoginRequest>,
) -> Result<(HeaderMap, Json<AdminAuthResponse>), ApiError> {
    let email = credentials.email.trim().to_ascii_lowercase();
    if !is_valid_email(&email) || credentials.password.is_empty() {
        return Err(ApiError::BadRequest(
            "Email admin dan kata sandi tidak sesuai.",
        ));
    }

    let admin = sqlx::query_as::<_, AdminRecord>(
        "SELECT admins.id, admins.name, admins.email, admins.password_hash, COALESCE(admins.locked_until > NOW(), FALSE) AS login_locked, admins.admin_role, admins.division_id, admins.department_id, admins.bureau_id, COALESCE((SELECT array_agg(admin_permissions.permission_key ORDER BY admin_permissions.permission_key) FROM admin_permissions WHERE admin_permissions.admin_id = admins.id), ARRAY[]::TEXT[]) AS permissions FROM admins WHERE admins.email = $1 AND admins.is_active = TRUE",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;
    let Some(admin) = admin else {
        return Err(ApiError::BadRequest(
            "Email atau kata sandi admin tidak sesuai.",
        ));
    };
    if admin.login_locked {
        return Err(ApiError::AccountSuspended);
    }
    let password_hash = PasswordHash::new(&admin.password_hash).map_err(internal_error)?;
    if Argon2::default()
        .verify_password(credentials.password.as_bytes(), &password_hash)
        .is_err()
    {
        if record_admin_login_failure(&state.pool, admin.id).await? {
            return Err(ApiError::AccountSuspended);
        }
        return Err(ApiError::BadRequest(
            "Email atau kata sandi admin tidak sesuai.",
        ));
    }

    ensure_admin_login_unlocked(&state.pool, admin.id).await?;
    let (token, token_hash) = create_token();
    sqlx::query(
        "INSERT INTO admin_tokens (token_hash, admin_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '30 days')",
    )
    .bind(token_hash)
    .bind(admin.id)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;

    let mut headers = HeaderMap::new();
    headers.insert(SET_COOKIE, session_cookie(Some(&token))?);
    Ok((
        headers,
        Json(AdminAuthResponse {
            role: "admin".to_owned(),
            admin: Admin {
                id: admin.id,
                name: admin.name,
                email: admin.email,
                admin_role: admin.admin_role,
                division_id: admin.division_id,
                department_id: admin.department_id,
                bureau_id: admin.bureau_id,
                permissions: admin.permissions,
            },
        }),
    ))
}

async fn record_applicant_login_failure(
    pool: &PgPool,
    applicant_id: i64,
) -> Result<bool, ApiError> {
    sqlx::query_scalar(
        "UPDATE applicants SET failed_login_attempts = CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1 ELSE failed_login_attempts + 1 END, locked_until = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1 ELSE failed_login_attempts + 1 END) >= $2 THEN NOW() + make_interval(mins => $3) ELSE NULL END WHERE id = $1 AND (locked_until IS NULL OR locked_until <= NOW()) RETURNING COALESCE(locked_until > NOW(), FALSE)",
    )
    .bind(applicant_id)
    .bind(MAX_LOGIN_FAILURES)
    .bind(LOGIN_LOCKOUT_MINUTES)
    .fetch_optional(pool)
    .await
    .map_err(internal_error)
    .map(|locked| locked.unwrap_or(true))
}

async fn record_admin_login_failure(pool: &PgPool, admin_id: i64) -> Result<bool, ApiError> {
    sqlx::query_scalar(
        "UPDATE admins SET failed_login_attempts = CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1 ELSE failed_login_attempts + 1 END, locked_until = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= NOW() THEN 1 ELSE failed_login_attempts + 1 END) >= $2 THEN NOW() + make_interval(mins => $3) ELSE NULL END WHERE id = $1 AND (locked_until IS NULL OR locked_until <= NOW()) RETURNING COALESCE(locked_until > NOW(), FALSE)",
    )
    .bind(admin_id)
    .bind(MAX_LOGIN_FAILURES)
    .bind(LOGIN_LOCKOUT_MINUTES)
    .fetch_optional(pool)
    .await
    .map_err(internal_error)
    .map(|locked| locked.unwrap_or(true))
}

async fn ensure_applicant_login_unlocked(pool: &PgPool, applicant_id: i64) -> Result<(), ApiError> {
    let updated = sqlx::query(
        "UPDATE applicants SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1 AND (locked_until IS NULL OR locked_until <= NOW())",
    )
    .bind(applicant_id)
    .execute(pool)
    .await
    .map_err(internal_error)?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::AccountSuspended);
    }
    Ok(())
}

async fn ensure_admin_login_unlocked(pool: &PgPool, admin_id: i64) -> Result<(), ApiError> {
    let updated = sqlx::query(
        "UPDATE admins SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1 AND (locked_until IS NULL OR locked_until <= NOW())",
    )
    .bind(admin_id)
    .execute(pool)
    .await
    .map_err(internal_error)?;
    if updated.rows_affected() == 0 {
        return Err(ApiError::AccountSuspended);
    }
    Ok(())
}

pub(super) async fn current_session(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<LoginResponse>, ApiError> {
    let account = authorized_account_identity(&state.pool, &headers).await?;
    if account.role == "applicant" {
        let applicant = sqlx::query_as::<_, (String, String, String)>(
            "SELECT name, COALESCE(email, ''), COALESCE(employee_number, '') FROM applicants WHERE id = $1 AND is_active = TRUE",
        )
        .bind(account.id)
        .fetch_optional(&state.pool)
        .await
        .map_err(internal_error)?
        .ok_or(ApiError::Unauthorized)?;
        return Ok(Json(LoginResponse::Applicant(AuthResponse {
            role: "applicant".to_owned(),
            applicant: Applicant {
                name: applicant.0,
                email: applicant.1,
                employee_number: applicant.2,
                must_change_password: account.must_change_password,
            },
        })));
    }

    let admin = sqlx::query_as::<_, AdminRecord>(
        "SELECT admins.id, admins.name, admins.email, admins.password_hash, COALESCE(admins.locked_until > NOW(), FALSE) AS login_locked, admins.admin_role, admins.division_id, admins.department_id, admins.bureau_id, COALESCE((SELECT array_agg(admin_permissions.permission_key ORDER BY admin_permissions.permission_key) FROM admin_permissions WHERE admin_permissions.admin_id = admins.id), ARRAY[]::TEXT[]) AS permissions FROM admins WHERE admins.id = $1 AND admins.is_active = TRUE",
    )
    .bind(account.id)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::Unauthorized)?;
    Ok(Json(LoginResponse::Admin(AdminAuthResponse {
        role: "admin".to_owned(),
        admin: Admin {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            admin_role: admin.admin_role,
            division_id: admin.division_id,
            department_id: admin.department_id,
            bureau_id: admin.bureau_id,
            permissions: admin.permissions,
        },
    })))
}

pub(super) async fn admin_logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(HeaderMap, Json<serde_json::Value>), ApiError> {
    let (_, token_hash) = authorized_admin(&state.pool, &headers).await?;
    sqlx::query("DELETE FROM admin_tokens WHERE token_hash = $1")
        .bind(token_hash)
        .execute(&state.pool)
        .await
        .map_err(internal_error)?;
    let mut response_headers = HeaderMap::new();
    response_headers.insert(SET_COOKIE, session_cookie(None)?);
    Ok((
        response_headers,
        Json(json!({ "message": "Berhasil keluar dari dashboard admin." })),
    ))
}

pub(super) async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<(HeaderMap, Json<serde_json::Value>), ApiError> {
    let account = authorized_account_identity(&state.pool, &headers).await?;
    if account.role != "applicant" {
        return Err(ApiError::Unauthorized);
    }
    sqlx::query("DELETE FROM applicant_tokens WHERE token_hash = $1")
        .bind(account.token_hash)
        .execute(&state.pool)
        .await
        .map_err(internal_error)?;
    let mut response_headers = HeaderMap::new();
    response_headers.insert(SET_COOKIE, session_cookie(None)?);
    Ok((
        response_headers,
        Json(json!({ "message": "Berhasil keluar." })),
    ))
}

pub(super) async fn get_account_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AccountProfileResponse>, ApiError> {
    let account = authorized_account(&state.pool, &headers).await?;
    let profile = if account.role == "applicant" {
        sqlx::query_as::<_, (String, String, String)>("SELECT name, COALESCE(email, ''), COALESCE(employee_number, '') FROM applicants WHERE id = $1")
            .bind(account.id)
            .fetch_optional(&state.pool)
            .await
            .map_err(internal_error)?
    } else {
        sqlx::query_as::<_, (String, String, String)>("SELECT name, email, ''::TEXT FROM admins WHERE id = $1")
            .bind(account.id)
            .fetch_optional(&state.pool)
            .await
            .map_err(internal_error)?
    }
    .ok_or(ApiError::Unauthorized)?;

    Ok(Json(AccountProfileResponse {
        role: account.role.to_owned(),
        name: profile.0,
        email: profile.1,
        employee_number: profile.2,
    }))
}

pub(super) async fn update_account_profile(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ProfileUpdateRequest>,
) -> Result<Json<AccountProfileResponse>, ApiError> {
    let account = authorized_account(&state.pool, &headers).await?;
    let name = request.name.trim();
    if name.is_empty() || name.len() > 200 {
        return Err(ApiError::BadRequest(
            "Nama wajib diisi dan maksimal 200 karakter.",
        ));
    }
    let profile = if account.role == "applicant" {
        sqlx::query_as::<_, (String, String, String)>(
            "UPDATE applicants SET name = $1 WHERE id = $2 RETURNING name, COALESCE(email, ''), COALESCE(employee_number, '')",
        )
        .bind(name)
        .bind(account.id)
        .fetch_optional(&state.pool)
        .await
        .map_err(internal_error)?
    } else {
        let mut transaction = state.pool.begin().await.map_err(internal_error)?;
        let previous_name =
            sqlx::query_scalar::<_, String>("SELECT name FROM admins WHERE id = $1 FOR UPDATE")
                .bind(account.id)
                .fetch_optional(&mut *transaction)
                .await
                .map_err(internal_error)?
                .ok_or(ApiError::Unauthorized)?;
        let profile = sqlx::query_as::<_, (String, String, String)>(
            "UPDATE admins SET name = $1 WHERE id = $2 RETURNING name, email, ''::TEXT",
        )
        .bind(name)
        .bind(account.id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(internal_error)?
        .ok_or(ApiError::Unauthorized)?;
        record_admin_audit(
            &mut transaction,
            account.id,
            "update",
            "admin_account",
            &account.id.to_string(),
            json!({
                "before": { "name": previous_name },
                "after": { "name": name },
                "source": "self_service",
            }),
        )
        .await
        .map_err(internal_error)?;
        transaction.commit().await.map_err(internal_error)?;
        Some(profile)
    }
    .ok_or(ApiError::Unauthorized)?;

    Ok(Json(AccountProfileResponse {
        role: account.role.to_owned(),
        name: profile.0,
        email: profile.1,
        employee_number: profile.2,
    }))
}

pub(super) async fn download_account_avatar(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let account = authorized_account(&state.pool, &headers).await?;
    let avatar = if account.role == "applicant" {
        sqlx::query_as::<_, (Option<String>, Option<Vec<u8>>)>(
            "SELECT profile_photo_content_type, profile_photo FROM applicants WHERE id = $1",
        )
        .bind(account.id)
        .fetch_optional(&state.pool)
        .await
        .map_err(internal_error)?
    } else {
        sqlx::query_as::<_, (Option<String>, Option<Vec<u8>>)>(
            "SELECT profile_photo_content_type, profile_photo FROM admins WHERE id = $1",
        )
        .bind(account.id)
        .fetch_optional(&state.pool)
        .await
        .map_err(internal_error)?
    }
    .ok_or(ApiError::Unauthorized)?;
    let (Some(content_type), Some(content)) = avatar else {
        return Err(ApiError::NotFound("Foto profil belum dipasang."));
    };

    Response::builder()
        .status(StatusCode::OK)
        .header(CACHE_CONTROL, "private, no-store")
        .header(CONTENT_TYPE, content_type)
        .header("x-content-type-options", "nosniff")
        .body(Body::from(content))
        .map_err(internal_error)
}

pub(super) async fn upload_account_avatar(
    State(state): State<AppState>,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, ApiError> {
    let account = authorized_account(&state.pool, &headers).await?;
    let field = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Foto profil tidak dapat dibaca."))?
        .ok_or(ApiError::BadRequest("Pilih foto profil terlebih dahulu."))?;
    if field.name() != Some("photo") {
        return Err(ApiError::BadRequest("Kolom foto profil tidak valid."));
    }
    let content_type = field.content_type().unwrap_or_default().to_owned();
    let content = field
        .bytes()
        .await
        .map_err(|_| ApiError::BadRequest("Foto profil tidak dapat dibaca."))?;
    let content_type = validate_profile_photo(&content_type, &content)?;
    if multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Foto profil tidak dapat dibaca."))?
        .is_some()
    {
        return Err(ApiError::BadRequest(
            "Unggah satu foto profil dalam satu waktu.",
        ));
    }

    let query = if account.role == "applicant" {
        "UPDATE applicants SET profile_photo = $1, profile_photo_content_type = $2 WHERE id = $3"
    } else {
        "UPDATE admins SET profile_photo = $1, profile_photo_content_type = $2 WHERE id = $3"
    };
    sqlx::query(query)
        .bind(content.to_vec())
        .bind(content_type)
        .bind(account.id)
        .execute(&state.pool)
        .await
        .map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Foto profil berhasil diperbarui." }),
    ))
}

pub(super) async fn delete_account_avatar(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let account = authorized_account(&state.pool, &headers).await?;
    let query = if account.role == "applicant" {
        "UPDATE applicants SET profile_photo = NULL, profile_photo_content_type = NULL WHERE id = $1"
    } else {
        "UPDATE admins SET profile_photo = NULL, profile_photo_content_type = NULL WHERE id = $1"
    };
    sqlx::query(query)
        .bind(account.id)
        .execute(&state.pool)
        .await
        .map_err(internal_error)?;
    Ok(Json(json!({ "message": "Foto profil berhasil dihapus." })))
}

pub(super) async fn change_account_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ChangePasswordRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let account = authorized_account_identity(&state.pool, &headers).await?;
    let password_hash = if account.role == "applicant" {
        sqlx::query_scalar::<_, String>("SELECT password_hash FROM applicants WHERE id = $1")
            .bind(account.id)
            .fetch_optional(&state.pool)
            .await
            .map_err(internal_error)?
    } else {
        sqlx::query_scalar::<_, String>("SELECT password_hash FROM admins WHERE id = $1")
            .bind(account.id)
            .fetch_optional(&state.pool)
            .await
            .map_err(internal_error)?
    }
    .ok_or(ApiError::Unauthorized)?;
    let parsed_hash = PasswordHash::new(&password_hash).map_err(internal_error)?;
    if Argon2::default()
        .verify_password(request.current_password.as_bytes(), &parsed_hash)
        .is_err()
    {
        return Err(ApiError::BadRequest("Kata sandi saat ini tidak sesuai."));
    }
    if account.must_change_password && request.current_password == request.new_password {
        return Err(ApiError::BadRequest(
            "Kata sandi baru harus berbeda dari kata sandi awal.",
        ));
    }
    validate_account_password(account.role, &request.new_password)?;
    let new_hash = hash_password(&request.new_password)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    if account.role == "applicant" {
        sqlx::query(
            "UPDATE applicants SET password_hash = $1, must_change_password = FALSE, failed_login_attempts = 0, locked_until = NULL WHERE id = $2",
        )
        .bind(new_hash)
        .bind(account.id)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
        sqlx::query("DELETE FROM applicant_tokens WHERE applicant_id = $1 AND token_hash <> $2")
            .bind(account.id)
            .bind(&account.token_hash)
            .execute(&mut *transaction)
            .await
            .map_err(internal_error)?;
    } else {
        sqlx::query("UPDATE admins SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL WHERE id = $2")
            .bind(new_hash)
            .bind(account.id)
            .execute(&mut *transaction)
            .await
            .map_err(internal_error)?;
        sqlx::query("DELETE FROM admin_tokens WHERE admin_id = $1 AND token_hash <> $2")
            .bind(account.id)
            .bind(&account.token_hash)
            .execute(&mut *transaction)
            .await
            .map_err(internal_error)?;
        record_admin_audit(
            &mut transaction,
            account.id,
            "update",
            "admin_account",
            &account.id.to_string(),
            json!({ "password_changed": true }),
        )
        .await
        .map_err(internal_error)?;
    }
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Kata sandi berhasil diubah." })))
}
