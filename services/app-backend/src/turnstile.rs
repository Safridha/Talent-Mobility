use super::*;

const SITEVERIFY_URL: &str = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const MAX_TOKEN_CHARS: usize = 2048;
const VERIFY_TIMEOUT_SECONDS: u64 = 8;

const MISSING_TOKEN_MESSAGE: &str =
    "Verifikasi keamanan belum selesai. Selesaikan verifikasi lalu coba lagi.";
const FAILED_MESSAGE: &str =
    "Verifikasi keamanan gagal atau kedaluwarsa. Muat ulang verifikasi lalu coba lagi.";
const UNAVAILABLE_MESSAGE: &str =
    "Layanan verifikasi keamanan sedang tidak dapat dihubungi. Coba lagi beberapa saat lagi.";

/// The secret key, when Turnstile is switched on. Without `TURNSTILE_SECRET_KEY` the check is skipped
/// so local development and tests keep working without a Cloudflare account.
fn secret_key() -> Option<String> {
    std::env::var("TURNSTILE_SECRET_KEY")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn siteverify_body(secret: &str, token: &str) -> String {
    url::form_urlencoded::Serializer::new(String::new())
        .append_pair("secret", secret)
        .append_pair("response", token)
        .finish()
}

fn is_success(response_body: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(response_body)
        .ok()
        .and_then(|value| value.get("success").and_then(serde_json::Value::as_bool))
        .unwrap_or(false)
}

/// Verifies the Cloudflare Turnstile token sent with a login. Runs before the password is checked so
/// bots are stopped without ever counting as failed password attempts against a real account.
pub(super) async fn verify_turnstile(token: Option<&str>) -> Result<(), ApiError> {
    let Some(secret) = secret_key() else {
        return Ok(());
    };
    let token = token.map(str::trim).unwrap_or_default();
    if token.is_empty() {
        return Err(ApiError::BadRequest(MISSING_TOKEN_MESSAGE));
    }
    if token.chars().count() > MAX_TOKEN_CHARS {
        return Err(ApiError::BadRequest(FAILED_MESSAGE));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(VERIFY_TIMEOUT_SECONDS))
        .build()
        .map_err(internal_error)?;
    let response = client
        .post(SITEVERIFY_URL)
        .header("content-type", "application/x-www-form-urlencoded")
        .body(siteverify_body(&secret, token))
        .send()
        .await
        .map_err(|error| {
            tracing::warn!(%error, "Turnstile siteverify request failed");
            ApiError::Unavailable(UNAVAILABLE_MESSAGE)
        })?;
    let body = response.text().await.map_err(|error| {
        tracing::warn!(%error, "Turnstile siteverify response could not be read");
        ApiError::Unavailable(UNAVAILABLE_MESSAGE)
    })?;
    if is_success(&body) {
        Ok(())
    } else {
        Err(ApiError::BadRequest(FAILED_MESSAGE))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn siteverify_body_is_form_encoded() {
        assert_eq!(
            siteverify_body("s&cret", "tok en=1"),
            "secret=s%26cret&response=tok+en%3D1"
        );
    }

    #[test]
    fn only_an_explicit_success_passes() {
        assert!(is_success(r#"{"success":true,"challenge_ts":"x"}"#));
        assert!(!is_success(r#"{"success":false,"error-codes":["invalid-input-response"]}"#));
        assert!(!is_success(r#"{"error-codes":[]}"#));
        assert!(!is_success("not json"));
        assert!(!is_success(""));
    }
}
