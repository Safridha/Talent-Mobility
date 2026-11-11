use super::*;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use std::{sync::Arc, time::Duration};
use url::Url;
use web_push_native::{
    jwt_simple::algorithms::ES256KeyPair, p256::PublicKey, Auth, WebPushBuilder,
};

#[derive(Clone)]
pub(super) struct PushService {
    public_key: String,
    vapid_key: Arc<ES256KeyPair>,
    subject: String,
    client: reqwest::Client,
}

enum PushSendError {
    Expired,
    Failed(&'static str),
}

impl PushService {
    pub(super) fn from_env(
        app_public_url: &str,
    ) -> Result<Option<Self>, Box<dyn std::error::Error>> {
        let public_key = env::var("VAPID_PUBLIC_KEY").unwrap_or_default();
        let private_key = env::var("VAPID_PRIVATE_KEY").unwrap_or_default();
        if public_key.trim().is_empty() && private_key.trim().is_empty() {
            tracing::info!("Web Push is disabled because VAPID keys are not configured.");
            return Ok(None);
        }
        if public_key.trim().is_empty() || private_key.trim().is_empty() {
            return Err("Both VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be configured.".into());
        }

        let private_key = private_key.trim().to_owned();
        let public_key = public_key.trim().to_owned();
        let vapid_key = parse_vapid_keys(&public_key, &private_key)?;

        let subject = env::var("VAPID_SUBJECT")
            .ok()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| {
                if app_public_url.starts_with("https://") {
                    app_public_url.to_owned()
                } else {
                    "mailto:admin@example.com".to_owned()
                }
            });
        if !(subject.starts_with("mailto:") || subject.starts_with("https://")) {
            return Err("VAPID_SUBJECT must be a mailto: or https: URL.".into());
        }

        Ok(Some(Self {
            public_key,
            vapid_key: Arc::new(vapid_key),
            subject,
            client: reqwest::Client::builder()
                .timeout(Duration::from_secs(8))
                .build()?,
        }))
    }

    async fn send(
        &self,
        subscription: &StoredPushSubscription,
        payload: &PushPayload,
    ) -> Result<(), PushSendError> {
        let p256dh = URL_SAFE_NO_PAD
            .decode(&subscription.p256dh)
            .map_err(|_| PushSendError::Failed("invalid subscription key"))?;
        let public_key = PublicKey::from_sec1_bytes(&p256dh)
            .map_err(|_| PushSendError::Failed("invalid subscription key"))?;
        let auth = URL_SAFE_NO_PAD
            .decode(&subscription.auth)
            .map_err(|_| PushSendError::Failed("invalid subscription authentication"))?;
        let auth = Auth::clone_from_slice(&auth);
        let endpoint = subscription
            .endpoint
            .parse()
            .map_err(|_: axum::http::uri::InvalidUri| PushSendError::Failed("invalid endpoint"))?;
        let request =
            WebPushBuilder::new(endpoint, public_key, auth)
                .with_valid_duration(Duration::from_secs(3600))
                .with_vapid(&self.vapid_key, &self.subject)
                .build(serde_json::to_vec(payload).map_err(|_| {
                    PushSendError::Failed("could not serialize notification payload")
                })?)
                .map_err(|_| PushSendError::Failed("could not encrypt or sign notification"))?;
        let (parts, body) = request.into_parts();
        let response = self
            .client
            .request(parts.method, parts.uri.to_string())
            .headers(parts.headers)
            .body(body)
            .send()
            .await
            .map_err(|_| PushSendError::Failed("push provider request failed"))?;
        if response.status() == reqwest::StatusCode::NOT_FOUND
            || response.status() == reqwest::StatusCode::GONE
        {
            return Err(PushSendError::Expired);
        }
        if response.status().is_success() {
            Ok(())
        } else {
            Err(PushSendError::Failed(
                "push provider rejected the notification",
            ))
        }
    }
}

/// Memvalidasi pasangan kunci VAPID dan mengembalikan key pair untuk menandatangani push.
///
/// Format yang diharapkan (standar VAPID dan Push API browser):
/// - private key: 32 byte, base64url tanpa padding (43 karakter)
/// - public key: 65 byte tidak terkompresi (diawali 0x04), base64url tanpa padding (87 karakter)
///
/// Kedua public key dibandingkan sebagai titik kurva P-256, bukan sebagai string, karena
/// `ES256KeyPair::public_key().to_bytes()` bisa memakai bentuk terkompresi (33 byte) yang
/// berbeda dari bentuk tidak terkompresi yang dikirim ke browser. Pesan error sengaja tidak
/// memuat nilai kunci.
fn parse_vapid_keys(
    public_key: &str,
    private_key: &str,
) -> Result<ES256KeyPair, Box<dyn std::error::Error>> {
    let private_key_bytes = URL_SAFE_NO_PAD.decode(private_key).map_err(|_| {
        "VAPID_PRIVATE_KEY must be base64url without padding (43 characters)."
    })?;
    let vapid_key = ES256KeyPair::from_bytes(&private_key_bytes).map_err(|_| {
        "VAPID_PRIVATE_KEY is not a valid P-256 private key (expected 32 bytes)."
    })?;

    let configured_bytes = URL_SAFE_NO_PAD.decode(public_key).map_err(|_| {
        "VAPID_PUBLIC_KEY must be base64url without padding (87 characters)."
    })?;
    if configured_bytes.len() != 65 || configured_bytes[0] != 0x04 {
        return Err(
            "VAPID_PUBLIC_KEY must be an uncompressed P-256 public key (65 bytes, 87 characters)."
                .into(),
        );
    }
    let configured = PublicKey::from_sec1_bytes(&configured_bytes)
        .map_err(|_| "VAPID_PUBLIC_KEY is not a valid P-256 public key.")?;
    let derived = PublicKey::from_sec1_bytes(&vapid_key.public_key().to_bytes())
        .map_err(|_| "Could not derive the public key from VAPID_PRIVATE_KEY.")?;
    if configured != derived {
        return Err("VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY.".into());
    }
    Ok(vapid_key)
}

#[derive(Deserialize)]
pub(super) struct PushSubscriptionRequest {
    endpoint: String,
    keys: PushSubscriptionKeys,
}

#[derive(Deserialize)]
struct PushSubscriptionKeys {
    p256dh: String,
    auth: String,
}

#[derive(Deserialize)]
pub(super) struct PushSubscriptionDeleteRequest {
    endpoint: String,
}

#[derive(Serialize)]
pub(super) struct PushConfigResponse {
    enabled: bool,
    public_key: Option<String>,
}

#[derive(FromRow)]
struct StoredPushSubscription {
    id: i64,
    endpoint: String,
    p256dh: String,
    auth: String,
}

#[derive(Serialize)]
struct PushPayload {
    title: String,
    body: String,
    url: String,
    tag: &'static str,
}

pub(super) async fn public_push_config(State(state): State<AppState>) -> Json<PushConfigResponse> {
    Json(PushConfigResponse {
        enabled: state.push_service.is_some(),
        public_key: state
            .push_service
            .as_ref()
            .map(|service| service.public_key.clone()),
    })
}

pub(super) async fn upsert_push_subscription(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PushSubscriptionRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if state.push_service.is_none() {
        return Err(ApiError::Unavailable(
            "Notifikasi push belum dikonfigurasi.",
        ));
    }
    let account = authorized_account(&state.pool, &headers).await?;
    if !is_valid_subscription_endpoint(&request.endpoint)
        || !is_valid_subscription_key(&request.keys.p256dh, 87, 87)
        || !is_valid_subscription_key(&request.keys.auth, 22, 22)
    {
        return Err(ApiError::BadRequest(
            "Data langganan notifikasi push tidak valid.",
        ));
    }
    let (applicant_id, admin_id) = if account.role == "applicant" {
        (Some(account.id), None)
    } else {
        (None, Some(account.id))
    };

    sqlx::query(
        "INSERT INTO web_push_subscriptions (applicant_id, admin_id, endpoint, p256dh, auth) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (endpoint) DO UPDATE SET applicant_id = EXCLUDED.applicant_id, admin_id = EXCLUDED.admin_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = NOW()",
    )
    .bind(applicant_id)
    .bind(admin_id)
    .bind(request.endpoint)
    .bind(request.keys.p256dh)
    .bind(request.keys.auth)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Notifikasi push berhasil diaktifkan." }),
    ))
}

pub(super) async fn delete_push_subscription(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<PushSubscriptionDeleteRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    if request.endpoint.len() > 2048 {
        return Err(ApiError::BadRequest(
            "Data langganan notifikasi push tidak valid.",
        ));
    }
    let account = authorized_account(&state.pool, &headers).await?;
    let result = if account.role == "applicant" {
        sqlx::query("DELETE FROM web_push_subscriptions WHERE endpoint = $1 AND applicant_id = $2")
            .bind(request.endpoint)
            .bind(account.id)
            .execute(&state.pool)
            .await
    } else {
        sqlx::query("DELETE FROM web_push_subscriptions WHERE endpoint = $1 AND admin_id = $2")
            .bind(request.endpoint)
            .bind(account.id)
            .execute(&state.pool)
            .await
    }
    .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound(
            "Langganan notifikasi perangkat ini tidak ditemukan.",
        ));
    }
    Ok(Json(
        json!({ "message": "Notifikasi push berhasil dinonaktifkan." }),
    ))
}

pub(super) fn dispatch_applicant_push(
    pool: PgPool,
    push_service: Option<Arc<PushService>>,
    applicant_id: i64,
) {
    let Some(push_service) = push_service else {
        return;
    };
    tokio::spawn(async move {
        let subscriptions = sqlx::query_as::<_, StoredPushSubscription>(
            "SELECT subscriptions.id, subscriptions.endpoint, subscriptions.p256dh, subscriptions.auth FROM web_push_subscriptions AS subscriptions JOIN applicants ON applicants.id = subscriptions.applicant_id WHERE subscriptions.applicant_id = $1 AND applicants.is_active = TRUE",
        )
        .bind(applicant_id)
        .fetch_all(&pool)
        .await;
        match subscriptions {
            Ok(subscriptions) => {
                deliver_push(
                    &pool,
                    &push_service,
                    subscriptions,
                    PushPayload {
                        title: "Pembaruan lamaran".to_owned(),
                        body:
                            "Ada pembaruan pada proses lamaran Anda. Masuk untuk melihat detailnya."
                                .to_owned(),
                        url: "/#/lamaran".to_owned(),
                        tag: "application-status",
                    },
                )
                .await;
            }
            Err(error) => tracing::warn!(?error, "Could not load applicant push subscriptions."),
        }
    });
}

pub(super) fn dispatch_admin_application_push(
    pool: PgPool,
    push_service: Option<Arc<PushService>>,
    application_id: i64,
) {
    let Some(push_service) = push_service else {
        return;
    };
    tokio::spawn(async move {
        let subscriptions = sqlx::query_as::<_, StoredPushSubscription>(
            "SELECT DISTINCT subscriptions.id, subscriptions.endpoint, subscriptions.p256dh, subscriptions.auth FROM web_push_subscriptions AS subscriptions JOIN admins ON admins.id = subscriptions.admin_id JOIN admin_application_notifications AS notifications ON notifications.admin_id = admins.id JOIN applications ON applications.id = notifications.application_id JOIN job_postings ON job_postings.id = applications.job_id WHERE notifications.application_id = $1 AND admins.is_active = TRUE AND (admins.admin_role = 'super_admin' OR EXISTS (SELECT 1 FROM admin_permissions WHERE admin_permissions.admin_id = admins.id AND admin_permissions.permission_key = 'applications.view')) AND (admins.admin_role IN ('super_admin', 'admin') OR (admins.admin_role = 'division_head' AND admins.division_id = job_postings.division_id) OR (admins.admin_role = 'department_head' AND job_postings.target_level <> 'division' AND admins.department_id = job_postings.department_id))",
        )
        .bind(application_id)
        .fetch_all(&pool)
        .await;
        match subscriptions {
            Ok(subscriptions) => {
                deliver_push(
                    &pool,
                    &push_service,
                    subscriptions,
                    PushPayload {
                        title: "Lamaran baru".to_owned(),
                        body: "Ada lamaran baru untuk lowongan dalam lingkup Anda.".to_owned(),
                        url: "/#/admin/lamaran".to_owned(),
                        tag: "new-application",
                    },
                )
                .await;
            }
            Err(error) => tracing::warn!(?error, "Could not load admin push subscriptions."),
        }
    });
}

async fn deliver_push(
    pool: &PgPool,
    push_service: &PushService,
    subscriptions: Vec<StoredPushSubscription>,
    payload: PushPayload,
) {
    for subscription in subscriptions {
        match tokio::time::timeout(
            Duration::from_secs(8),
            push_service.send(&subscription, &payload),
        )
        .await
        {
            Ok(Ok(())) => {}
            Ok(Err(PushSendError::Expired)) => {
                if let Err(delete_error) =
                    sqlx::query("DELETE FROM web_push_subscriptions WHERE id = $1")
                        .bind(subscription.id)
                        .execute(pool)
                        .await
                {
                    tracing::warn!(
                        subscription_id = subscription.id,
                        ?delete_error,
                        "Could not remove expired push subscription."
                    );
                }
            }
            Ok(Err(PushSendError::Failed(reason))) => tracing::warn!(
                subscription_id = subscription.id,
                reason,
                "Web Push delivery failed."
            ),
            Err(_) => tracing::warn!(
                subscription_id = subscription.id,
                "Web Push delivery timed out."
            ),
        }
    }
}

fn is_valid_subscription_endpoint(endpoint: &str) -> bool {
    if endpoint.len() > 2048 {
        return false;
    }
    let Ok(url) = Url::parse(endpoint) else {
        return false;
    };
    let Some(host) = url.host_str().map(str::to_ascii_lowercase) else {
        return false;
    };
    let allowed_host = host == "fcm.googleapis.com"
        || host == "fcmregistrations.googleapis.com"
        || host == "web.push.apple.com"
        || host.ends_with(".push.services.mozilla.com")
        || host.ends_with(".notify.windows.com");
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && !url.path().is_empty()
        && allowed_host
}

fn is_valid_subscription_key(value: &str, min_length: usize, max_length: usize) -> bool {
    (min_length..=max_length).contains(&value.len())
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

#[cfg(test)]
mod tests {
    use super::{is_valid_subscription_endpoint, is_valid_subscription_key, parse_vapid_keys};
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    use web_push_native::{
        jwt_simple::algorithms::ES256KeyPair,
        p256::{elliptic_curve::sec1::ToEncodedPoint, PublicKey},
    };

    /// Public key dalam format yang dipakai browser dan VAPID: 65 byte tidak terkompresi.
    fn browser_public_key(key: &ES256KeyPair, compress: bool) -> String {
        let point = PublicKey::from_sec1_bytes(&key.public_key().to_bytes())
            .expect("public key derived from a generated key pair is valid")
            .to_encoded_point(compress);
        URL_SAFE_NO_PAD.encode(point.as_bytes())
    }

    fn private_key_string(key: &ES256KeyPair) -> String {
        URL_SAFE_NO_PAD.encode(key.to_bytes())
    }

    #[test]
    fn subscription_endpoints_are_limited_to_known_push_services() {
        assert!(is_valid_subscription_endpoint(
            "https://fcm.googleapis.com/fcm/send/subscription-token"
        ));
        assert!(is_valid_subscription_endpoint(
            "https://updates.push.services.mozilla.com/wpush/v2/subscription-token"
        ));
        assert!(!is_valid_subscription_endpoint(
            "http://fcm.googleapis.com/fcm/send/subscription-token"
        ));
        assert!(!is_valid_subscription_endpoint("https://127.0.0.1/admin"));
        assert!(!is_valid_subscription_endpoint("https://example.com/push"));
    }

    #[test]
    fn subscription_keys_accept_only_base64url_characters_with_expected_lengths() {
        assert!(is_valid_subscription_key(&"a".repeat(87), 87, 87));
        assert!(is_valid_subscription_key(&"a".repeat(22), 22, 22));
        assert!(!is_valid_subscription_key(&"a".repeat(86), 87, 87));
        assert!(!is_valid_subscription_key(
            &format!("{}=", "a".repeat(86)),
            87,
            87
        ));
    }

    #[test]
    fn generated_vapid_pair_is_accepted_in_browser_format() {
        let key = ES256KeyPair::generate();
        let public_key = browser_public_key(&key, false);
        let private_key = private_key_string(&key);

        assert_eq!(public_key.len(), 87);
        assert_eq!(private_key.len(), 43);
        let decoded = URL_SAFE_NO_PAD.decode(&public_key).unwrap();
        assert_eq!(decoded.len(), 65);
        assert_eq!(decoded[0], 0x04);
        assert!(parse_vapid_keys(&public_key, &private_key).is_ok());
    }

    #[test]
    fn mismatched_vapid_pair_is_rejected() {
        let first = ES256KeyPair::generate();
        let second = ES256KeyPair::generate();
        let error = parse_vapid_keys(&browser_public_key(&second, false), &private_key_string(&first))
            .err()
            .expect("a public key from another pair must be rejected");
        assert_eq!(
            error.to_string(),
            "VAPID_PUBLIC_KEY does not match VAPID_PRIVATE_KEY."
        );
    }

    #[test]
    fn compressed_public_key_is_rejected_with_a_clear_message() {
        let key = ES256KeyPair::generate();
        let error = parse_vapid_keys(&browser_public_key(&key, true), &private_key_string(&key))
            .err()
            .expect("a compressed public key must be rejected");
        assert!(error.to_string().contains("uncompressed"));
    }

    #[test]
    fn padded_or_truncated_keys_are_rejected() {
        let key = ES256KeyPair::generate();
        let public_key = browser_public_key(&key, false);
        let private_key = private_key_string(&key);

        assert!(parse_vapid_keys(&format!("{public_key}="), &private_key).is_err());
        assert!(parse_vapid_keys(&public_key[..86], &private_key).is_err());
        assert!(parse_vapid_keys(&public_key, &private_key[..42]).is_err());
        assert!(parse_vapid_keys(&public_key, &format!("{private_key}docker compose")).is_err());
    }
}