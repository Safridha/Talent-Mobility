use super::*;

/// Shown when a foreign key fails because the master data (division, department, biro) changed while
/// the request was being processed.
pub(super) const MASTER_DATA_CHANGED: &str =
    "Data master berubah saat diproses. Muat ulang halaman lalu coba lagi.";

pub(super) enum Claim {
    /// First time this key is seen: do the work.
    Fresh,
    /// The same request already completed: return its stored response.
    Replay(serde_json::Value),
}

/// Reads the optional `Idempotency-Key` header (8-128 chars of letters, digits and `-_.:`).
pub(super) fn read_idempotency_key(headers: &HeaderMap) -> Result<Option<String>, ApiError> {
    let Some(value) = headers.get("idempotency-key") else {
        return Ok(None);
    };
    let key = value
        .to_str()
        .map_err(|_| ApiError::BadRequest("Idempotency-Key tidak valid."))?
        .trim();
    let is_valid = (8..=128).contains(&key.len())
        && key
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'));
    if !is_valid {
        return Err(ApiError::BadRequest(
            "Idempotency-Key harus 8-128 karakter (huruf, angka, - _ . :).",
        ));
    }
    Ok(Some(key.to_owned()))
}

/// Length-prefixed SHA-256 over the parts, so ("ab", "c") and ("a", "bc") differ.
pub(super) fn request_fingerprint(parts: &[&[u8]]) -> String {
    let mut hasher = Sha256::new();
    for part in parts {
        hasher.update((part.len() as u64).to_be_bytes());
        hasher.update(part);
    }
    hex::encode(hasher.finalize())
}

/// Claims `(scope, key)` inside the caller's transaction.
///
/// The INSERT is the synchronisation point: a concurrent request with the same key blocks on the
/// primary-key index until the first transaction commits (then it replays the stored response) or
/// rolls back (then it proceeds). So there is never an "in progress" state to poll.
pub(super) async fn claim_idempotency_key(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    scope: &str,
    key: &str,
    fingerprint: &str,
) -> Result<Claim, ApiError> {
    let inserted = sqlx::query(
        "INSERT INTO idempotency_keys (scope, key, fingerprint) VALUES ($1, $2, $3) ON CONFLICT (scope, key) DO NOTHING",
    )
    .bind(scope)
    .bind(key)
    .bind(fingerprint)
    .execute(&mut **transaction)
    .await
    .map_err(internal_error)?
    .rows_affected()
        == 1;
    if inserted {
        return Ok(Claim::Fresh);
    }
    let (stored_fingerprint, response) = sqlx::query_as::<_, (String, Option<serde_json::Value>)>(
        "SELECT fingerprint, response FROM idempotency_keys WHERE scope = $1 AND key = $2",
    )
    .bind(scope)
    .bind(key)
    .fetch_one(&mut **transaction)
    .await
    .map_err(internal_error)?;
    if stored_fingerprint != fingerprint {
        return Err(ApiError::BadRequest(
            "Idempotency-Key sudah dipakai untuk permintaan yang berbeda.",
        ));
    }
    match response {
        Some(response) => Ok(Claim::Replay(response)),
        None => Err(ApiError::Conflict(
            "Permintaan dengan kunci yang sama masih diproses. Coba lagi sebentar.",
        )),
    }
}

/// Stores the response next to the work, in the same transaction.
pub(super) async fn complete_idempotency_key(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    scope: &str,
    key: &str,
    response: &serde_json::Value,
) -> Result<(), ApiError> {
    sqlx::query("UPDATE idempotency_keys SET response = $3 WHERE scope = $1 AND key = $2")
        .bind(scope)
        .bind(key)
        .bind(response)
        .execute(&mut **transaction)
        .await
        .map_err(internal_error)?;
    Ok(())
}

pub(super) fn replayed_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert("idempotent-replayed", HeaderValue::from_static("true"));
    headers
}

/// Keys only need to outlive client retries; drop them after two days.
pub(super) async fn purge_expired_idempotency_keys(pool: &PgPool) {
    if let Err(error) = sqlx::query(
        "DELETE FROM idempotency_keys WHERE created_at < NOW() - INTERVAL '48 hours'",
    )
    .execute(pool)
    .await
    {
        tracing::warn!(?error, "Could not purge expired idempotency keys");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn headers_with(key: &str) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert("idempotency-key", HeaderValue::from_str(key).unwrap());
        headers
    }

    #[test]
    fn idempotency_key_is_optional_and_validated() {
        assert_eq!(read_idempotency_key(&HeaderMap::new()).unwrap(), None);
        assert_eq!(
            read_idempotency_key(&headers_with("0b2f6d1e-5c1a-4a52-9d2e-7f3b8c1d2e3f")).unwrap().as_deref(),
            Some("0b2f6d1e-5c1a-4a52-9d2e-7f3b8c1d2e3f")
        );
        assert!(read_idempotency_key(&headers_with("short")).is_err());
        assert!(read_idempotency_key(&headers_with(&"a".repeat(129))).is_err());
        assert!(read_idempotency_key(&headers_with("has space in the key")).is_err());
        assert!(read_idempotency_key(&headers_with("semi;colon-in-key-123")).is_err());
    }

    #[test]
    fn fingerprint_distinguishes_requests_and_part_boundaries() {
        let a = request_fingerprint(&[b"ab", b"c"]);
        let b = request_fingerprint(&[b"a", b"bc"]);
        let c = request_fingerprint(&[b"ab", b"c"]);
        assert_ne!(a, b);
        assert_eq!(a, c);
        assert_eq!(a.len(), 64);
    }
}
