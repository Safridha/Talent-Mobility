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
) -> Result<(HeaderMap, Json<serde_json::Value>), ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let idempotency_key = read_idempotency_key(&headers)?;
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
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    // Idempotency: a double click or retry with the same key replays the first result.
    let idempotency_scope = format!("applicant-account:{}", admin.id);
    if let Some(key) = &idempotency_key {
        let fingerprint = request_fingerprint(&[
            name.as_bytes(),
            email.as_deref().unwrap_or("").as_bytes(),
            profile.employee_number.as_deref().unwrap_or("").as_bytes(),
            profile.division_id.map(|id| id.to_string()).unwrap_or_default().as_bytes(),
            profile.department_id.map(|id| id.to_string()).unwrap_or_default().as_bytes(),
            profile.bureau_id.map(|id| id.to_string()).unwrap_or_default().as_bytes(),
            profile.position_title.as_deref().unwrap_or("").as_bytes(),
            profile.last_education.as_deref().unwrap_or("").as_bytes(),
        ]);
        if let Claim::Replay(response) =
            claim_idempotency_key(&mut transaction, &idempotency_scope, key, &fingerprint).await?
        {
            return Ok((replayed_headers(), Json(response)));
        }
    }
    let password_hash = hash_password(default_applicant_password())?;
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
        Err(error) if is_foreign_key_violation(&error) => {
            return Err(ApiError::Conflict(MASTER_DATA_CHANGED));
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
    let response = json!({ "message": "Akun berhasil ditambahkan. Pelamar masuk dengan NIP dan kata sandi awal, lalu wajib menggantinya saat masuk pertama." });
    if let Some(key) = &idempotency_key {
        complete_idempotency_key(&mut transaction, &idempotency_scope, key, &response).await?;
    }
    transaction.commit().await.map_err(internal_error)?;
    Ok((HeaderMap::new(), Json(response)))
}

type ExistingRosterRow = (
    i64,
    String,
    String,
    Option<i64>,
    Option<i64>,
    Option<i64>,
    Option<String>,
    Option<String>,
);

/// When an Excel row's NIP matches no account (the NIP changed, or was entered differently), look for the
/// same person by name and use the other columns as verifiers: division, department, position and
/// education must agree on at least two of the four, and exactly one account may fit best. Accounts whose
/// NIP appears elsewhere in the file, or that another row already took, are never candidates.
async fn find_roster_match_by_verifiers(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    name: &str,
    division_id: Option<i64>,
    department_id: Option<i64>,
    position: &Option<String>,
    education: &Option<String>,
    file_numbers: &std::collections::HashSet<String>,
    claimed: &std::collections::HashSet<i64>,
) -> Result<Option<ExistingRosterRow>, ApiError> {
    let rows = sqlx::query_as::<_, ExistingRosterRow>(
        "SELECT id, employee_number, name, division_id, department_id, bureau_id, position_title, last_education FROM applicants WHERE employee_number IS NOT NULL AND lower(regexp_replace(btrim(name), '\\s+', ' ', 'g')) = $1 FOR UPDATE",
    )
    .bind(org_name_key(name))
    .fetch_all(&mut **transaction)
    .await
    .map_err(internal_error)?;
    let same_text = |left: &Option<String>, right: &Option<String>| match (left, right) {
        (Some(left), Some(right)) => org_name_key(left) == org_name_key(right),
        _ => false,
    };
    let mut best: Vec<(u8, ExistingRosterRow)> = Vec::new();
    for row in rows {
        if file_numbers.contains(&row.1) || claimed.contains(&row.0) {
            continue;
        }
        let score = u8::from(division_id.is_some() && row.3 == division_id)
            + u8::from(department_id.is_some() && row.4 == department_id)
            + u8::from(same_text(position, &row.6))
            + u8::from(same_text(education, &row.7));
        if score >= 2 {
            best.push((score, row));
        }
    }
    let top = best.iter().map(|(score, _)| *score).max();
    let mut top_rows = best.into_iter().filter(|(score, _)| Some(*score) == top);
    match (top_rows.next(), top_rows.next()) {
        (Some((_, row)), None) => Ok(Some(row)),
        _ => Ok(None),
    }
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
    let dry_run = request.dry_run;
    // One shared initial password for the batch: hash once (Argon2 is deliberately slow).
    let password_hash = hash_password(default_applicant_password())?;

    let mut created = 0_i64;
    let mut updated = 0_i64;
    let mut unchanged = 0_i64;
    let mut skipped = 0_i64;
    let mut zero_restored_count = 0_i64;
    let mut nip_updated = 0_i64;
    let mut bureau_cleared = 0_i64;
    let mut invalid: Vec<serde_json::Value> = Vec::new();
    let mut changes: Vec<serde_json::Value> = Vec::new();
    let mut seen_numbers: Vec<String> = Vec::new();
    let mut verifier_matched = 0_i64;
    let mut claimed: std::collections::HashSet<i64> = std::collections::HashSet::new();
    // Every NIP the file mentions (with and without the dropped zero), so a "match by name" never steals
    // an account that another row of the same file owns.
    let mut file_numbers: std::collections::HashSet<String> = std::collections::HashSet::new();
    for row in &request.rows {
        if let Ok(Some(original)) = clean_profile_text(&Some(row.employee_number.clone()), 40) {
            let restored = restore_roster_nip(&original);
            if let Some(stripped) = strip_roster_nip_zero(&restored) {
                file_numbers.insert(stripped);
            }
            file_numbers.insert(restored);
            file_numbers.insert(original);
        }
    }
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    // Two imports running at once would race on the same NIPs and master rows: run them one at a time
    // (the lock is released when this transaction ends).
    sqlx::query("SELECT pg_advisory_xact_lock(hashtext('employee-roster-import'))")
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    // Read the master data only now that we hold the lock, so an import that waited sees what the
    // one before it created (a cache read before the lock would be stale and collide on insert).
    let mut cache = load_import_org_cache(&state.pool).await?;
    for (index, row) in request.rows.iter().enumerate() {
        let line = index + 2; // header is line 1
        let name = row.name.trim();
        let prepared = (|| -> Result<_, ApiError> {
            let original = clean_profile_text(&Some(row.employee_number.clone()), 40)?
                .ok_or(ApiError::BadRequest("NIP kosong."))?;
            let employee_number = restore_roster_nip(&original);
            let zero_restored = employee_number != original;
            if name.is_empty() || name.len() > 200 {
                return Err(ApiError::BadRequest("Nama kosong atau terlalu panjang."));
            }
            Ok((
                employee_number,
                original,
                zero_restored,
                clean_profile_text(&row.division_name, 200)?,
                clean_profile_text(&row.department_name, 200)?,
                clean_profile_text(&row.position_title, 200)?,
                clean_profile_text(&row.last_education, 80)?,
            ))
        })();
        let (employee_number, original_number, zero_restored, division, department, position_title, last_education) =
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
        if zero_restored {
            zero_restored_count += 1;
        }
        seen_numbers.push(employee_number.clone());
        // A department only makes sense inside a division; without one it is dropped.
        let (division_id, department_id) = ensure_import_org(
            &mut transaction,
            &mut cache,
            division.as_deref(),
            department.as_deref(),
        )
        .await?;

        // Also finds the account saved earlier under the NIP written the other way (with/without the zero).
        let mut lookup = vec![employee_number.clone(), original_number.clone()];
        if let Some(stripped) = strip_roster_nip_zero(&employee_number) {
            lookup.push(stripped);
        }
        let mut existing = sqlx::query_as::<_, ExistingRosterRow>(
            "SELECT id, employee_number, name, division_id, department_id, bureau_id, position_title, last_education FROM applicants WHERE employee_number = ANY($2) ORDER BY (employee_number = $1) DESC LIMIT 1 FOR UPDATE",
        )
        .bind(&employee_number)
        .bind(&lookup)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(internal_error)?;
        let mut matched_by_verifiers = false;
        if existing.is_none() {
            existing = find_roster_match_by_verifiers(
                &mut transaction,
                name,
                division_id,
                department_id,
                &position_title,
                &last_education,
                &file_numbers,
                &claimed,
            )
            .await?;
            if existing.is_some() {
                matched_by_verifiers = true;
            }
        }
        if let Some(row) = &existing {
            claimed.insert(row.0);
        }

        match existing {
            None => {
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
            Some((id, old_number, old_name, old_division, old_department, old_bureau, old_position, old_education)) => {
                // Updated Excel: refresh the roster data of the existing account. Blank cells never erase
                // what the account already has, and email/password/biro are not part of the Excel.
                let (new_division, new_department) = if division_id.is_some() {
                    (division_id, department_id)
                } else {
                    (old_division, old_department)
                };
                let new_position = position_title.clone().or_else(|| old_position.clone());
                let new_education = last_education.clone().or_else(|| old_education.clone());
                // A biro belongs to one department: moving to another department clears it.
                let new_bureau = if new_department == old_department { old_bureau } else { None };

                let mut fields: Vec<&str> = Vec::new();
                let nip_changed = old_number != employee_number;
                if nip_changed {
                    let owned_by_admin = sqlx::query_scalar::<_, bool>(
                        "SELECT EXISTS(SELECT 1 FROM admins WHERE employee_number = $1)",
                    )
                    .bind(&employee_number)
                    .fetch_one(&mut *transaction)
                    .await
                    .map_err(internal_error)?;
                    if owned_by_admin {
                        skipped += 1;
                        continue;
                    }
                    fields.push("NIP");
                    nip_updated += 1;
                    if matched_by_verifiers {
                        verifier_matched += 1;
                    }
                }
                if name != old_name {
                    fields.push("nama");
                }
                if new_division != old_division {
                    fields.push("divisi");
                }
                if new_department != old_department {
                    fields.push("departemen");
                }
                if new_bureau != old_bureau {
                    fields.push("biro dikosongkan");
                    bureau_cleared += 1;
                }
                if new_position != old_position {
                    fields.push("jabatan");
                }
                if new_education != old_education {
                    fields.push("pendidikan");
                }
                if fields.is_empty() {
                    unchanged += 1;
                } else {
                    sqlx::query(
                        "UPDATE applicants SET name = $1, division_id = $2, department_id = $3, bureau_id = $4, position_title = $5, last_education = $6, employee_number = $8 WHERE id = $7",
                    )
                    .bind(name)
                    .bind(new_division)
                    .bind(new_department)
                    .bind(new_bureau)
                    .bind(&new_position)
                    .bind(&new_education)
                    .bind(id)
                    .bind(&employee_number)
                    .execute(&mut *transaction)
                    .await
                    .map_err(internal_error)?;
                    if nip_changed {
                        // Keep the NIP copied onto this applicant's applications in step.
                        sqlx::query("UPDATE applications SET employee_number = $1 WHERE applicant_id = $2 AND employee_number = $3")
                            .bind(&employee_number)
                            .bind(id)
                            .bind(&old_number)
                            .execute(&mut *transaction)
                            .await
                            .map_err(internal_error)?;
                    }
                    updated += 1;
                    if changes.len() < 50 {
                        changes.push(json!({ "employee_number": employee_number, "name": name, "fields": fields, "matched_by_verifiers": matched_by_verifiers, "old_employee_number": old_number }));
                    }
                }
            }
        }
    }
    // Information only: accounts that are not in this file (e.g. no longer employed). Nothing is deactivated.
    let not_in_file = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*)::BIGINT FROM applicants WHERE employee_number IS NOT NULL AND NOT (employee_number = ANY($1))",
    )
    .bind(&seen_numbers)
    .fetch_one(&mut *transaction)
    .await
    .map_err(internal_error)?;
    // Accounts whose NIP is not in the (latest) file even after matching: shown so they can be reviewed.
    let missing_accounts = sqlx::query_as::<_, (String, String, Option<String>, Option<String>)>(
        "SELECT applicants.employee_number, applicants.name, employee_divisions.name, employee_departments.name FROM applicants LEFT JOIN employee_divisions ON employee_divisions.id = applicants.division_id LEFT JOIN employee_departments ON employee_departments.id = applicants.department_id WHERE applicants.employee_number IS NOT NULL AND NOT (applicants.employee_number = ANY($1)) ORDER BY lower(applicants.name) LIMIT 50",
    )
    .bind(&seen_numbers)
    .fetch_all(&mut *transaction)
    .await
    .map_err(internal_error)?;
    let invalid_count = invalid.len();
    if dry_run {
        transaction.rollback().await.map_err(internal_error)?;
    } else {
        record_admin_audit(
            &mut transaction,
            admin.id,
            "create",
            "applicant_account",
            "import",
            json!({ "source": "excel_import", "created": created, "updated": updated, "unchanged": unchanged, "skipped": skipped, "invalid": invalid_count, "new_divisions": cache.created_divisions, "new_departments": cache.created_departments, "nip_zero_restored": zero_restored_count, "nip_updated": nip_updated, "matched_by_verifiers": verifier_matched, "biro_cleared": bureau_cleared, "not_in_file": not_in_file }),
        )
        .await
        .map_err(internal_error)?;
        transaction.commit().await.map_err(internal_error)?;
    }
    invalid.truncate(50);
    let prefix = if dry_run { "Pratinjau: " } else { "" };
    Ok(Json(json!({
        "dry_run": dry_run,
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "skipped": skipped,
        "not_in_file": not_in_file,
        "new_divisions": cache.created_divisions,
        "new_departments": cache.created_departments,
        "nip_zero_restored": zero_restored_count,
        "nip_updated": nip_updated,
        "matched_by_verifiers": verifier_matched,
        "biro_cleared": bureau_cleared,
        "invalid_count": invalid_count,
        "invalid": invalid,
        "changes": changes,
        "not_in_file_accounts": missing_accounts.iter().map(|(number, name, division, department)| json!({ "employee_number": number, "name": name, "division": division, "department": department })).collect::<Vec<_>>(),
        "message": format!("{prefix}{created} akun baru, {updated} diperbarui, {unchanged} tidak berubah, {skipped} dilewati (NIP dipakai admin), {invalid_count} baris tidak valid."),
    })))
}

pub(super) async fn admin_reset_account_password(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let admin = authorized_operational_admin(&state.pool, &headers).await?;
    admin.require_permission(APPLICANT_ACCOUNTS_MANAGE)?;
    let password_hash = hash_password(default_applicant_password())?;
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
        "message": "Kata sandi direset ke kata sandi awal. Pelamar wajib menggantinya saat masuk berikutnya."
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
        None if account.reset_password => Some(default_applicant_password()),
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
        Err(error) if is_foreign_key_violation(&error) => {
            return Err(ApiError::Conflict(MASTER_DATA_CHANGED));
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
