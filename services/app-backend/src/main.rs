use std::{env, net::SocketAddr, path::Path as FsPath, sync::Arc};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Json, Multipart, Path, Query, State},
    http::{
        header::{
            CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_TYPE, COOKIE, HOST, ORIGIN, SET_COOKIE,
        },
        HeaderMap, HeaderValue, Request, StatusCode,
    },
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{any, get, patch, post, put},
    Router,
};
use rand_core::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};
use sqlx::{postgres::PgPoolOptions, types::Json as SqlJson, FromRow, PgPool};
use tower_http::{
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use ulid::Ulid;

mod admin_accounts;
mod admin_applications;
mod admin_audit;
mod admin_permissions;
mod applications;
mod employee_master;
mod auth;
mod jobs;
mod push;

use admin_accounts::*;
use admin_applications::*;
use admin_audit::*;
use admin_permissions::*;
use applications::*;
use employee_master::*;
use auth::*;
use jobs::*;
use push::*;

#[derive(Clone)]
struct AppState {
    pool: PgPool,
    push_service: Option<Arc<PushService>>,
}

const MAX_APPLICATION_FILE_BYTES: usize = 5 * 1024 * 1024;
const MAX_APPLICATION_DOCUMENTS: usize = 5;
const MAX_APPLICATION_BODY_BYTES: usize = 32 * 1024 * 1024;
const MAX_APPLICATION_STATUS_REASON_CHARS: usize = 1000;
const MAX_PROFILE_PHOTO_BYTES: usize = 2 * 1024 * 1024;
const MAX_LOGIN_FAILURES: i32 = 5;
const LOGIN_LOCKOUT_MINUTES: i32 = 15;
const SESSION_COOKIE_NAME: &str = "tm_session";

#[derive(Debug)]
enum ApiError {
    BadRequest(&'static str),
    Unauthorized,
    AccountSuspended,
    Forbidden,
    PasswordChangeRequired,
    Conflict(&'static str),
    NotFound(&'static str),
    Unavailable(&'static str),
    Internal,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            Self::BadRequest(message) => (StatusCode::UNPROCESSABLE_ENTITY, message),
            Self::Unauthorized => (
                StatusCode::UNAUTHORIZED,
                "Sesi tidak valid atau telah berakhir.",
            ),
            Self::AccountSuspended => (
                StatusCode::TOO_MANY_REQUESTS,
                "Akun ditangguhkan sementara selama 15 menit karena terlalu banyak percobaan login gagal.",
            ),
            Self::Forbidden => (StatusCode::FORBIDDEN, "Akses tidak diizinkan."),
            Self::PasswordChangeRequired => (
                StatusCode::FORBIDDEN,
                "Ubah kata sandi awal sebelum melanjutkan.",
            ),
            Self::Conflict(message) => (StatusCode::CONFLICT, message),
            Self::NotFound(message) => (StatusCode::NOT_FOUND, message),
            Self::Unavailable(message) => (StatusCode::SERVICE_UNAVAILABLE, message),
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Terjadi kesalahan pada server.",
            ),
        };
        (status, Json(json!({ "message": message }))).into_response()
    }
}

fn set_api_no_store(response: &mut Response) {
    response
        .headers_mut()
        .insert(CACHE_CONTROL, HeaderValue::from_static("no-store"));
}

async fn prevent_api_caching(request: Request<Body>, next: Next) -> Response {
    let is_state_changing = !matches!(
        *request.method(),
        axum::http::Method::GET | axum::http::Method::HEAD | axum::http::Method::OPTIONS
    );
    if is_state_changing && !request_has_same_origin(request.headers()) {
        let mut response = ApiError::Forbidden.into_response();
        set_api_no_store(&mut response);
        return response;
    }

    let mut response = next.run(request).await;
    set_api_no_store(&mut response);
    response
}

fn session_token(headers: &HeaderMap) -> Option<&str> {
    let token = headers
        .get(COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|cookie| {
            let (name, value) = cookie.trim().split_once('=')?;
            (name == SESSION_COOKIE_NAME).then_some(value)
        })?;
    (token.len() == 64 && token.bytes().all(|byte| byte.is_ascii_hexdigit())).then_some(token)
}

fn request_has_same_origin(headers: &HeaderMap) -> bool {
    let Some(origin) = headers
        .get(ORIGIN)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| url::Url::parse(value).ok())
    else {
        return false;
    };
    if !matches!(origin.scheme(), "http" | "https")
        || !origin.username().is_empty()
        || origin.password().is_some()
        || origin.path() != "/"
        || origin.query().is_some()
        || origin.fragment().is_some()
    {
        return false;
    }
    let Some(host) = headers.get(HOST).and_then(|value| value.to_str().ok()) else {
        return false;
    };
    url::Url::parse(&format!("{}://{host}", origin.scheme()))
        .is_ok_and(|request_origin| origin.origin() == request_origin.origin())
}

fn session_cookie(token: Option<&str>) -> Result<HeaderValue, ApiError> {
    let secure = env::var("APP_PUBLIC_URL")
        .ok()
        .and_then(|url| url::Url::parse(&url).ok())
        .is_some_and(|url| url.scheme() == "https");
    let value = match token {
        Some(token) => format!(
            "{SESSION_COOKIE_NAME}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000{}",
            if secure { "; Secure" } else { "" },
        ),
        None => format!(
            "{SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0{}",
            if secure { "; Secure" } else { "" },
        ),
    };
    HeaderValue::from_str(&value).map_err(internal_error)
}

#[derive(Deserialize)]
struct LoginRequest {
    /// NIP (applicants) or email (admins / applicants that have one).
    #[serde(alias = "identifier")]
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct AdminLoginRequest {
    /// NIP, or the account email as a fallback.
    #[serde(alias = "identifier")]
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct ProfileUpdateRequest {
    name: String,
    /// Absent: unchanged. Applicants may clear it with a blank value; admins must keep a valid email.
    #[serde(default)]
    email: Option<String>,
}

#[derive(Deserialize)]
struct ChangePasswordRequest {
    /// Not needed while the account still has its initial password (the user just signed in with it).
    #[serde(default)]
    current_password: Option<String>,
    new_password: String,
}

#[derive(Serialize)]
struct AccountProfileResponse {
    role: String,
    name: String,
    email: String,
    employee_number: String,
    // Applicant roster details (null for admins).
    division_id: Option<i64>,
    department_id: Option<i64>,
    division_name: Option<String>,
    department_name: Option<String>,
    position_title: Option<String>,
    last_education: Option<String>,
}

struct AccountIdentity {
    id: i64,
    role: &'static str,
    token_hash: String,
    must_change_password: bool,
}

#[derive(Deserialize)]
struct AdminApplicantCreateRequest {
    name: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(flatten)]
    profile: ApplicantProfileInput,
}

#[derive(Deserialize, Default)]
struct ApplicantProfileInput {
    #[serde(default)]
    employee_number: Option<String>,
    #[serde(default)]
    division_id: Option<i64>,
    #[serde(default)]
    department_id: Option<i64>,
    #[serde(default)]
    position_title: Option<String>,
    #[serde(default)]
    last_education: Option<String>,
}

#[derive(Deserialize)]
struct ApplicantImportRow {
    employee_number: String,
    name: String,
    #[serde(default)]
    division_name: Option<String>,
    #[serde(default)]
    department_name: Option<String>,
    #[serde(default)]
    position_title: Option<String>,
    #[serde(default)]
    last_education: Option<String>,
}

#[derive(Deserialize)]
struct ApplicantImportRequest {
    rows: Vec<ApplicantImportRow>,
}

#[derive(Deserialize)]
struct AdminApplicantUpdateRequest {
    #[serde(flatten)]
    profile: ApplicantProfileInput,
    name: String,
    #[serde(default)]
    email: Option<String>,
    #[serde(default)]
    reset_password: bool,
    password: Option<String>,
}

#[derive(Deserialize)]
struct ApplicantAccountStatusRequest {
    is_active: bool,
}

#[derive(Deserialize)]
struct AdminAccountCreateRequest {
    name: String,
    #[serde(default)]
    employee_number: Option<String>,
    email: String,
    password: String,
    admin_role: String,
    division_id: Option<i64>,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
    permissions: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct AdminAccountUpdateRequest {
    name: String,
    #[serde(default)]
    employee_number: Option<String>,
    email: String,
    password: Option<String>,
    admin_role: String,
    division_id: Option<i64>,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
    permissions: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct AdminAccountStatusRequest {
    is_active: bool,
}

#[derive(Serialize)]
struct Applicant {
    name: String,
    email: String,
    employee_number: String,
    must_change_password: bool,
}

#[derive(Serialize)]
struct AuthResponse {
    role: String,
    applicant: Applicant,
}

#[derive(Serialize)]
struct Admin {
    id: i64,
    name: String,
    email: String,
    admin_role: String,
    division_id: Option<i64>,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
    permissions: Vec<String>,
}

#[derive(Serialize)]
struct AdminAuthResponse {
    role: String,
    admin: Admin,
}

#[derive(Serialize)]
#[serde(untagged)]
enum LoginResponse {
    Applicant(AuthResponse),
    Admin(AdminAuthResponse),
}

#[derive(FromRow)]
struct ApplicantRecord {
    id: i64,
    name: String,
    email: String,
    employee_number: String,
    password_hash: String,
    must_change_password: bool,
    login_locked: bool,
}

#[derive(FromRow)]
struct AdminRecord {
    id: i64,
    name: String,
    email: String,
    password_hash: String,
    login_locked: bool,
    admin_role: String,
    division_id: Option<i64>,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
    permissions: Vec<String>,
}

#[derive(Clone)]
struct AdminContext {
    id: i64,
    token_hash: String,
    admin_role: String,
    division_id: Option<i64>,
    department_id: Option<i64>,
    permissions: Vec<String>,
}

impl AdminContext {
    fn has_permission(&self, permission: &str) -> bool {
        self.admin_role == "super_admin"
            || self.permissions.iter().any(|granted| granted == permission)
    }

    fn require_permission(&self, permission: &str) -> Result<(), ApiError> {
        if self.has_permission(permission) {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }
}

struct ApplicationSubmissionFields {
    job_id: Option<String>,
    target_department_id: Option<i64>,
    target_bureau_id: Option<i64>,
    employee_number: String,
    applicant_full_name: String,
    origin_division: String,
    origin_unit: String,
    education_level: String,
    study_field: String,
    motivation: String,
}

struct UploadedApplicationDocument {
    document_type: &'static str,
    file_name: String,
    content: Vec<u8>,
}

#[derive(FromRow, Serialize)]
struct ApplicationSummary {
    id: String,
    job_id: Option<String>,
    target_department_id: Option<i64>,
    target_bureau_id: Option<i64>,
    job_title: String,
    target_level: String,
    division: String,
    department: String,
    unit: String,
    position_description: Option<String>,
    status: String,
    created_at: String,
    status_history: SqlJson<Vec<ApplicationStatusHistory>>,
}

#[derive(Deserialize, Serialize)]
struct ApplicationStatusHistory {
    status: String,
    created_at: String,
}

#[derive(Serialize)]
struct ApplicationsResponse {
    data: Vec<ApplicationSummary>,
}

#[derive(FromRow, Serialize)]
struct ApplicantStatusNotification {
    id: i64,
    application_id: String,
    job_id: Option<String>,
    job_title: String,
    target_label: String,
    target_level: String,
    previous_status: String,
    new_status: String,
    reason: Option<String>,
    created_at: String,
    read_at: Option<String>,
}

#[derive(Serialize)]
struct ApplicantNotificationsResponse {
    data: Vec<ApplicantStatusNotification>,
    unread_count: i64,
}

#[derive(FromRow, Serialize)]
struct AdminApplicantAccount {
    id: i64,
    name: String,
    email: String,
    employee_number: Option<String>,
    division_id: Option<i64>,
    department_id: Option<i64>,
    division_name: Option<String>,
    department_name: Option<String>,
    position_title: Option<String>,
    last_education: Option<String>,
    created_at: String,
    applications_count: i64,
    is_active: bool,
    must_change_password: bool,
}

#[derive(FromRow, Serialize)]
struct ManagedAdminAccount {
    id: i64,
    name: String,
    email: String,
    employee_number: Option<String>,
    created_at: String,
    is_active: bool,
    admin_role: String,
    division_id: Option<i64>,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
    scope_label: String,
    permissions: Vec<String>,
}

#[cfg(test)]
#[derive(Deserialize)]
struct AdminJobFields {
    title: String,
    target_level: String,
    division_id: Option<i64>,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
    location: String,
    quota: i16,
    posted: String,
    job_type: String,
    summary: String,
    skills: Vec<String>,
    responsibilities: Vec<String>,
}

#[derive(Deserialize)]
struct OrganizationNameRequest {
    name: String,
    #[serde(default)]
    description: String,
}

#[derive(Deserialize)]
struct DivisionRequest {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default)]
    secretariat_name: String,
    #[serde(default)]
    secretariat_description: String,
}

#[cfg(test)]
#[derive(Deserialize)]
struct JobTypeNameRequest {
    name: String,
}

#[derive(Deserialize)]
struct CreateDepartmentRequest {
    division_id: i64,
    name: String,
    #[serde(default)]
    description: String,
}

#[derive(Deserialize)]
struct CreateBureauRequest {
    department_id: i64,
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default = "default_bureau_unit_type")]
    unit_type: String,
}

#[derive(Deserialize)]
struct BureauUpdateRequest {
    name: String,
    #[serde(default)]
    description: String,
    #[serde(default = "default_bureau_unit_type")]
    unit_type: String,
}

fn default_bureau_unit_type() -> String {
    "biro".to_owned()
}

#[derive(FromRow, Serialize)]
struct DivisionRecord {
    id: i64,
    name: String,
    description: String,
    secretariat_name: String,
    secretariat_description: String,
}

#[derive(FromRow, Serialize)]
struct DepartmentRecord {
    id: i64,
    division_id: i64,
    name: String,
    description: String,
}

#[derive(FromRow, Serialize)]
struct BureauRecord {
    id: i64,
    department_id: i64,
    name: String,
    description: String,
    unit_type: String,
}

#[derive(Serialize)]
struct OrganizationResponse {
    divisions: Vec<DivisionRecord>,
    departments: Vec<DepartmentRecord>,
    bureaus: Vec<BureauRecord>,
}

#[derive(FromRow, Serialize)]
struct PublicDivisionRecord {
    id: i64,
    name: String,
    secretariat_name: String,
}

#[derive(FromRow, Serialize)]
struct PublicDepartmentRecord {
    id: i64,
    division_id: i64,
    name: String,
    description: String,
}

#[derive(FromRow, Serialize)]
struct PublicBureauRecord {
    id: i64,
    department_id: i64,
    name: String,
    description: String,
    unit_type: String,
}

#[derive(Serialize)]
struct PublicOrganizationResponse {
    divisions: Vec<PublicDivisionRecord>,
    departments: Vec<PublicDepartmentRecord>,
    bureaus: Vec<PublicBureauRecord>,
}

#[cfg(test)]
#[derive(Deserialize)]
struct CreateAdminJobRequest {
    id: String,
    #[serde(flatten)]
    fields: AdminJobFields,
}

#[cfg(test)]
#[derive(Deserialize)]
struct JobStatusRequest {
    status: String,
}

#[derive(Deserialize)]
struct ApplicationStatusRequest {
    status: String,
    reason: Option<String>,
}

#[derive(FromRow, Serialize)]
struct AdminApplication {
    id: String,
    applicant_name: String,
    applicant_email: String,
    job_id: Option<String>,
    job_title: String,
    target_key: String,
    target_label: String,
    target_level: String,
    position_description: Option<String>,
    employee_number: Option<String>,
    origin_division: Option<String>,
    origin_unit: Option<String>,
    education_level: Option<String>,
    study_field: Option<String>,
    phone_number: Option<String>,
    current_position: Option<String>,
    current_unit: Option<String>,
    motivation: Option<String>,
    status: String,
    documents_count: i64,
    created_at: String,
}

#[derive(FromRow, Serialize)]
struct ApplicationDocumentSummary {
    id: i64,
    document_type: String,
    file_name: String,
    file_size: i32,
}

#[derive(FromRow)]
struct ApplicationDocumentFile {
    document_type: String,
    content: Vec<u8>,
}

#[derive(Serialize)]
struct AdminApplicationDetail {
    #[serde(flatten)]
    application: AdminApplication,
    documents: Vec<ApplicationDocumentSummary>,
}

#[derive(Serialize)]
struct AdminApplicationsResponse {
    data: Vec<AdminApplication>,
}

#[derive(FromRow, Serialize)]
struct AdminApplicationNotification {
    id: i64,
    application_id: String,
    job_id: Option<String>,
    job_title: String,
    target_label: String,
    applicant_name: String,
    target_level: String,
    created_at: String,
    read_at: Option<String>,
}

#[derive(Serialize)]
struct AdminNotificationsResponse {
    data: Vec<AdminApplicationNotification>,
    unread_count: i64,
}

#[derive(FromRow, Serialize)]
struct AdminDashboardMetrics {
    applications_total: i64,
    applications_submitted: i64,
    applications_screening: i64,
    applications_interview: i64,
    applications_accepted: i64,
    applications_rejected: i64,
}

#[cfg(test)]
#[derive(FromRow, Serialize)]
struct Job {
    id: String,
    title: String,
    division: String,
    department: String,
    unit: String,
    unit_type: String,
    target_level: String,
    division_id: i64,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
    location: String,
    quota: i16,
    posted: String,
    #[serde(rename = "type")]
    job_type: String,
    summary: String,
    skills: SqlJson<Vec<String>>,
    responsibilities: SqlJson<Vec<String>>,
    status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    has_applications: Option<bool>,
}

#[cfg(test)]
#[derive(Serialize)]
struct JobsResponse {
    data: Vec<Job>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let workspace_env = FsPath::new(env!("CARGO_MANIFEST_DIR")).join("../../.env");
    if workspace_env.is_file() {
        dotenvy::from_path(workspace_env)?;
    } else {
        dotenvy::dotenv().ok();
    }
    tracing_subscriber::fmt()
        .with_env_filter(env::var("RUST_LOG").unwrap_or_else(|_| "info,tower_http=info".to_owned()))
        .init();

    let database_url = env::var("DATABASE_URL").map_err(|_| {
        "DATABASE_URL must be set; copy .env.example to .env and configure PostgreSQL"
    })?;
    let app_public_url =
        env::var("APP_PUBLIC_URL").unwrap_or_else(|_| "http://127.0.0.1:8000".to_owned());
    let push_service = PushService::from_env(&app_public_url)?.map(Arc::new);
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    ensure_application_public_ids(&pool).await?;
    seed_admin(&pool).await?;

    let app = Router::new()
        .route("/api/login", post(login))
        .route("/api/session", get(current_session))
        .route("/api/logout", post(logout))
        .route(
            "/api/account/profile",
            get(get_account_profile).patch(update_account_profile),
        )
        .route(
            "/api/account/employee-profile",
            put(update_applicant_employee_profile),
        )
        .route("/api/account/employee-master", get(account_list_employee_master))
        .route(
            "/api/account/avatar",
            get(download_account_avatar)
                .post(upload_account_avatar)
                .delete(delete_account_avatar)
                .layer(DefaultBodyLimit::max(MAX_PROFILE_PHOTO_BYTES + 64 * 1024)),
        )
        .route("/api/account/password", post(change_account_password))
        .route("/api/push/config", get(public_push_config))
        .route(
            "/api/push/subscriptions",
            put(upsert_push_subscription).delete(delete_push_subscription),
        )
        .route("/api/organization", get(public_list_organization))
        .route("/api/admin/login", post(admin_login))
        .route("/api/admin/logout", post(admin_logout))
        .route("/api/admin/session", get(admin_session_check))
        .route("/api/admin/dashboard", get(admin_dashboard))
        .route("/api/admin/audit-log", get(admin_list_audit_events))
        .route(
            "/api/admin/accounts",
            get(admin_list_accounts).post(admin_create_account),
        )
        .route(
            "/api/admin/accounts/import",
            post(admin_import_accounts).layer(DefaultBodyLimit::max(8 * 1024 * 1024)),
        )
        .route("/api/admin/employee-master", get(admin_list_employee_master))
        .route(
            "/api/admin/employee-master/divisions",
            post(admin_create_employee_division),
        )
        .route(
            "/api/admin/employee-master/divisions/{id}",
            put(admin_update_employee_division).delete(admin_delete_employee_division),
        )
        .route(
            "/api/admin/employee-master/departments",
            post(admin_create_employee_department),
        )
        .route(
            "/api/admin/employee-master/departments/{id}",
            put(admin_update_employee_department).delete(admin_delete_employee_department),
        )
        .route(
            "/api/admin/accounts/{id}",
            put(admin_update_account).delete(admin_deactivate_account),
        )
        .route(
            "/api/admin/accounts/{id}/reset-password",
            post(admin_reset_account_password),
        )
        .route(
            "/api/admin/accounts/{id}/status",
            patch(admin_set_account_status),
        )
        .route(
            "/api/admin/admin-accounts",
            get(admin_list_admin_accounts).post(admin_create_admin_account),
        )
        .route(
            "/api/admin/admin-accounts/{id}",
            put(admin_update_admin_account).delete(admin_deactivate_admin_account),
        )
        .route(
            "/api/admin/admin-accounts/{id}/status",
            patch(admin_set_admin_account_status),
        )
        .route("/api/admin/organization", get(admin_list_organization))
        .route("/api/admin/divisions", post(admin_create_division))
        .route(
            "/api/admin/divisions/{id}",
            put(admin_update_division).delete(admin_delete_division),
        )
        .route("/api/admin/departments", post(admin_create_department))
        .route(
            "/api/admin/departments/{id}",
            put(admin_update_department).delete(admin_delete_department),
        )
        .route("/api/admin/bureaus", post(admin_create_bureau))
        .route(
            "/api/admin/bureaus/{id}",
            put(admin_update_bureau).delete(admin_delete_bureau),
        )
        .route("/api/admin/applications", get(admin_list_applications))
        .route(
            "/api/admin/application-limit",
            get(admin_get_application_limit)
                .post(admin_create_application_limit)
                .put(admin_update_application_limit)
                .delete(admin_delete_application_limit),
        )
        .route("/api/admin/notifications", get(admin_list_notifications))
        .route(
            "/api/admin/notifications/{id}/read",
            patch(admin_mark_notification_read),
        )
        .route("/api/admin/applications/{id}", get(admin_get_application))
        .route(
            "/api/admin/applications/{id}/documents/{document_id}",
            get(admin_download_application_document),
        )
        .route(
            "/api/admin/applications/{id}/status",
            patch(admin_set_application_status),
        )
        .route(
            "/api/applications",
            get(list_applications)
                .post(create_application)
                .layer(DefaultBodyLimit::max(MAX_APPLICATION_BODY_BYTES)),
        )
        .route("/api/{*path}", any(api_not_found))
        .route("/api/notifications", get(list_applicant_notifications))
        .route(
            "/api/notifications/{id}/read",
            patch(mark_applicant_notification_read),
        )
        .route_layer(middleware::from_fn(prevent_api_caching))
        .fallback_service(ServeDir::new("public").fallback(ServeFile::new("public/spa/index.html")))
        .layer(TraceLayer::new_for_http())
        .with_state(AppState { pool, push_service });

    let address: SocketAddr = env::var("APP_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8000".to_owned())
        .parse()?;
    let listener = tokio::net::TcpListener::bind(address).await?;
    tracing::info!("Talent Mobility API listening at http://{address}");
    axum::serve(listener, app).await?;
    Ok(())
}

async fn ensure_application_public_ids(pool: &PgPool) -> Result<(), sqlx::Error> {
    let missing_ids = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM applications WHERE public_id IS NULL ORDER BY id",
    )
    .fetch_all(pool)
    .await?;
    for id in missing_ids {
        sqlx::query("UPDATE applications SET public_id = $1 WHERE id = $2 AND public_id IS NULL")
            .bind(Ulid::new().to_string())
            .bind(id)
            .execute(pool)
            .await?;
    }
    sqlx::query("ALTER TABLE applications ALTER COLUMN public_id SET NOT NULL")
        .execute(pool)
        .await?;
    Ok(())
}

async fn authorized_applicant(
    pool: &PgPool,
    headers: &HeaderMap,
) -> Result<(i64, String), ApiError> {
    let account = authorized_account(pool, headers).await?;
    if account.role != "applicant" {
        return Err(ApiError::Unauthorized);
    }
    Ok((account.id, account.token_hash))
}

async fn authorized_admin_context(
    pool: &PgPool,
    headers: &HeaderMap,
) -> Result<AdminContext, ApiError> {
    let token = session_token(headers).ok_or(ApiError::Unauthorized)?;
    let token_hash = hash_token(token);
    let admin = sqlx::query_as::<_, (i64, String, Option<i64>, Option<i64>, Vec<String>)>(
        "SELECT admins.id, admins.admin_role, admins.division_id, admins.department_id, COALESCE((SELECT array_agg(admin_permissions.permission_key ORDER BY admin_permissions.permission_key) FROM admin_permissions WHERE admin_permissions.admin_id = admins.id), ARRAY[]::TEXT[]) FROM admin_tokens JOIN admins ON admins.id = admin_tokens.admin_id WHERE admin_tokens.token_hash = $1 AND admin_tokens.expires_at > NOW() AND admins.is_active = TRUE",
    )
    .bind(&token_hash)
    .fetch_optional(pool)
    .await
    .map_err(internal_error)?;
    let Some((id, admin_role, division_id, department_id, permissions)) = admin else {
        return Err(ApiError::Unauthorized);
    };
    Ok(AdminContext {
        id,
        token_hash,
        admin_role,
        division_id,
        department_id,
        permissions,
    })
}

async fn admin_session_check(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin_context(&state.pool, &headers).await?;
    Ok(Json(json!({ "active": true })))
}

async fn authorized_admin(pool: &PgPool, headers: &HeaderMap) -> Result<(i64, String), ApiError> {
    let admin = authorized_admin_context(pool, headers).await?;
    Ok((admin.id, admin.token_hash))
}

async fn authorized_super_admin(
    pool: &PgPool,
    headers: &HeaderMap,
) -> Result<AdminContext, ApiError> {
    let admin = authorized_admin_context(pool, headers).await?;
    if admin.admin_role != "super_admin" {
        return Err(ApiError::Forbidden);
    }
    Ok(admin)
}

async fn authorized_operational_admin(
    pool: &PgPool,
    headers: &HeaderMap,
) -> Result<AdminContext, ApiError> {
    let admin = authorized_admin_context(pool, headers).await?;
    if !matches!(admin.admin_role.as_str(), "super_admin" | "admin") {
        return Err(ApiError::Forbidden);
    }
    Ok(admin)
}

async fn authorized_account(
    pool: &PgPool,
    headers: &HeaderMap,
) -> Result<AccountIdentity, ApiError> {
    let account = authorized_account_identity(pool, headers).await?;
    if account.role == "applicant" && account.must_change_password {
        return Err(ApiError::PasswordChangeRequired);
    }
    Ok(account)
}

async fn authorized_account_identity(
    pool: &PgPool,
    headers: &HeaderMap,
) -> Result<AccountIdentity, ApiError> {
    let token = session_token(headers).ok_or(ApiError::Unauthorized)?;
    let token_hash = hash_token(token);
    let identity = sqlx::query_as::<_, (String, i64, bool)>(
        "SELECT account_type, account_id, must_change_password FROM (SELECT 'applicant'::text AS account_type, applicants.id AS account_id, applicants.must_change_password FROM applicant_tokens JOIN applicants ON applicants.id = applicant_tokens.applicant_id WHERE applicant_tokens.token_hash = $1 AND applicant_tokens.expires_at > NOW() AND applicants.is_active = TRUE UNION ALL SELECT 'admin'::text AS account_type, admins.id AS account_id, FALSE AS must_change_password FROM admin_tokens JOIN admins ON admins.id = admin_tokens.admin_id WHERE admin_tokens.token_hash = $1 AND admin_tokens.expires_at > NOW() AND admins.is_active = TRUE) AS accounts LIMIT 1",
    )
    .bind(&token_hash)
    .fetch_optional(pool)
    .await
    .map_err(internal_error)?;
    let Some((role, id, must_change_password)) = identity else {
        return Err(ApiError::Unauthorized);
    };
    let role = match role.as_str() {
        "applicant" => "applicant",
        "admin" => "admin",
        _ => return Err(ApiError::Internal),
    };
    Ok(AccountIdentity {
        id,
        role,
        token_hash,
        must_change_password,
    })
}

fn is_valid_email(email: &str) -> bool {
    if email.len() > 254 || !email.is_ascii() || email.chars().any(char::is_whitespace) {
        return false;
    }
    let Some((local, domain)) = email.split_once('@') else {
        return false;
    };
    !local.is_empty()
        && local.len() <= 64
        && !domain.contains('@')
        && domain.contains('.')
        && !domain.starts_with('.')
        && !domain.ends_with('.')
        && local
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "._%+-".contains(character))
        && domain
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || ".-".contains(character))
}

fn validate_profile_photo(content_type: &str, content: &[u8]) -> Result<&'static str, ApiError> {
    if content.is_empty() || content.len() > MAX_PROFILE_PHOTO_BYTES {
        return Err(ApiError::BadRequest("Foto profil maksimal berukuran 2 MB."));
    }
    let content_type = content_type.to_ascii_lowercase();
    let is_valid = match content_type.as_str() {
        "image/jpeg" => content.starts_with(&[0xFF, 0xD8, 0xFF]),
        "image/png" => content.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/webp" => {
            content.len() >= 12 && content.starts_with(b"RIFF") && &content[8..12] == b"WEBP"
        }
        _ => false,
    };
    if !is_valid {
        return Err(ApiError::BadRequest(
            "Foto profil harus berupa JPG, PNG, atau WebP yang valid.",
        ));
    }
    Ok(match content_type.as_str() {
        "image/jpeg" => "image/jpeg",
        "image/png" => "image/png",
        "image/webp" => "image/webp",
        _ => return Err(ApiError::BadRequest("Format foto profil tidak valid.")),
    })
}

fn validate_account_password(role: &str, password: &str) -> Result<(), ApiError> {
    if role == "admin" {
        validate_admin_password(password)
    } else {
        validate_applicant_password(password)
    }
}

fn validate_applicant_name_and_email(name: &str, email: &str) -> Result<(), ApiError> {
    if name.is_empty() || name.len() > 200 {
        return Err(ApiError::BadRequest(
            "Nama wajib diisi dan maksimal 200 karakter.",
        ));
    }
    if !is_valid_email(email) {
        return Err(ApiError::BadRequest("Format email tidak valid."));
    }
    Ok(())
}

struct CleanApplicantProfile {
    employee_number: Option<String>,
    division_id: Option<i64>,
    department_id: Option<i64>,
    position_title: Option<String>,
    last_education: Option<String>,
}

fn clean_profile_text(value: &Option<String>, max: usize) -> Result<Option<String>, ApiError> {
    let text = value.as_deref().unwrap_or("").trim();
    if text.is_empty() || matches!(text, "-" | "\u{2014}" | "\u{2013}") {
        return Ok(None);
    }
    if text.chars().count() > max {
        return Err(ApiError::BadRequest("Salah satu kolom profil terlalu panjang."));
    }
    Ok(Some(text.split_whitespace().collect::<Vec<_>>().join(" ")))
}

/// Validates a manually entered profile: Divisi/Departemen must exist in the employee master data.
async fn resolve_applicant_profile(
    pool: &PgPool,
    input: &ApplicantProfileInput,
) -> Result<CleanApplicantProfile, ApiError> {
    let mut division_id = input.division_id;
    if let Some(department_id) = input.department_id {
        let owner = sqlx::query_scalar::<_, i64>(
            "SELECT division_id FROM employee_departments WHERE id = $1",
        )
        .bind(department_id)
        .fetch_optional(pool)
        .await
        .map_err(internal_error)?
        .ok_or(ApiError::BadRequest("Departemen tidak ditemukan di master data."))?;
        if division_id.is_some_and(|selected| selected != owner) {
            return Err(ApiError::BadRequest(
                "Departemen tidak termasuk divisi yang dipilih.",
            ));
        }
        division_id = Some(owner);
    } else if let Some(id) = division_id {
        let exists = sqlx::query_scalar::<_, i64>("SELECT id FROM employee_divisions WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
            .map_err(internal_error)?;
        if exists.is_none() {
            return Err(ApiError::BadRequest("Divisi tidak ditemukan di master data."));
        }
    }
    Ok(CleanApplicantProfile {
        employee_number: clean_profile_text(&input.employee_number, 40)?,
        division_id,
        department_id: input.department_id,
        position_title: clean_profile_text(&input.position_title, 200)?,
        last_education: clean_profile_text(&input.last_education, 80)?,
    })
}

fn org_name_key(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ").to_lowercase()
}

struct ImportOrgCache {
    divisions: std::collections::HashMap<String, i64>,
    departments: std::collections::HashMap<(i64, String), i64>,
    created_divisions: i64,
    created_departments: i64,
}

async fn load_import_org_cache(pool: &PgPool) -> Result<ImportOrgCache, ApiError> {
    let mut cache = ImportOrgCache {
        divisions: Default::default(),
        departments: Default::default(),
        created_divisions: 0,
        created_departments: 0,
    };
    for (id, name) in sqlx::query_as::<_, (i64, String)>("SELECT id, name FROM employee_divisions")
        .fetch_all(pool)
        .await
        .map_err(internal_error)?
    {
        cache.divisions.insert(org_name_key(&name), id);
    }
    for (id, division_id, name) in sqlx::query_as::<_, (i64, i64, String)>(
        "SELECT id, division_id, name FROM employee_departments",
    )
    .fetch_all(pool)
    .await
    .map_err(internal_error)?
    {
        cache.departments.insert((division_id, org_name_key(&name)), id);
    }
    Ok(cache)
}

/// Finds or creates the Divisi/Departemen master rows named in an imported row.
async fn ensure_import_org(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    cache: &mut ImportOrgCache,
    division: Option<&str>,
    department: Option<&str>,
) -> Result<(Option<i64>, Option<i64>), ApiError> {
    let Some(division) = division else {
        return Ok((None, None));
    };
    let division_key = org_name_key(division);
    let division_id = match cache.divisions.get(&division_key) {
        Some(id) => *id,
        None => {
            let id = sqlx::query_scalar::<_, i64>(
                "INSERT INTO employee_divisions (name) VALUES ($1) RETURNING id",
            )
            .bind(division)
            .fetch_one(&mut **transaction)
            .await
            .map_err(internal_error)?;
            cache.divisions.insert(division_key, id);
            cache.created_divisions += 1;
            id
        }
    };
    let Some(department) = department else {
        return Ok((Some(division_id), None));
    };
    let department_key = (division_id, org_name_key(department));
    let department_id = match cache.departments.get(&department_key) {
        Some(id) => *id,
        None => {
            let id = sqlx::query_scalar::<_, i64>(
                "INSERT INTO employee_departments (division_id, name) VALUES ($1, $2) RETURNING id",
            )
            .bind(division_id)
            .bind(department)
            .fetch_one(&mut **transaction)
            .await
            .map_err(internal_error)?;
            cache.departments.insert(department_key, id);
            cache.created_departments += 1;
            id
        }
    };
    Ok((Some(division_id), Some(department_id)))
}

/// Initial password for accounts created by an admin or imported from Excel.
/// It intentionally does not meet the normal strength policy: it is only usable once,
/// because accounts are created with `must_change_password` and the replacement must pass the policy.
const DEFAULT_APPLICANT_PASSWORD: &str = "pal@123";

fn normalize_optional_email(email: Option<&str>) -> Result<Option<String>, ApiError> {
    let email = email.unwrap_or("").trim().to_ascii_lowercase();
    if email.is_empty() {
        return Ok(None);
    }
    if !is_valid_email(&email) {
        return Err(ApiError::BadRequest("Format email tidak valid."));
    }
    Ok(Some(email))
}

fn validate_applicant_password(password: &str) -> Result<(), ApiError> {
    validate_password_strength(password)
}

fn validate_admin_account(name: &str, email: &str, password: &str) -> Result<(), ApiError> {
    validate_applicant_name_and_email(name, email)?;
    validate_admin_password(password)
}

fn validate_admin_password(password: &str) -> Result<(), ApiError> {
    validate_password_strength(password)
}

fn validate_password_strength(password: &str) -> Result<(), ApiError> {
    if !(8..=128).contains(&password.len()) {
        return Err(ApiError::BadRequest(
            "Kata sandi harus terdiri dari 8 sampai 128 karakter.",
        ));
    }
    if !password
        .bytes()
        .any(|character| character.is_ascii_lowercase())
        || !password
            .bytes()
            .any(|character| character.is_ascii_uppercase())
        || !password.bytes().any(|character| character.is_ascii_digit())
    {
        return Err(ApiError::BadRequest(
            "Kata sandi harus memuat huruf besar, huruf kecil, dan angka.",
        ));
    }
    Ok(())
}

fn hash_password(password: &str) -> Result<String, ApiError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|password_hash| password_hash.to_string())
        .map_err(internal_error)
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|database_error| database_error.code())
        .as_deref()
        == Some("23505")
}

fn is_foreign_key_violation(error: &sqlx::Error) -> bool {
    is_foreign_key_violation_code(
        error
            .as_database_error()
            .and_then(|database_error| database_error.code())
            .as_deref(),
    )
}

fn is_foreign_key_violation_code(code: Option<&str>) -> bool {
    matches!(code, Some("23001") | Some("23503"))
}

fn create_token() -> (String, String) {
    let mut token_bytes = [0_u8; 32];
    OsRng.fill_bytes(&mut token_bytes);
    let token = hex::encode(token_bytes);
    let token_hash = hash_token(&token);
    (token, token_hash)
}

fn hash_token(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

fn internal_error(error: impl std::fmt::Debug) -> ApiError {
    tracing::error!(?error, "API request failed");
    ApiError::Internal
}

async fn api_not_found() -> ApiError {
    ApiError::NotFound("Endpoint API tidak ditemukan.")
}

async fn seed_admin(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let name = env::var("ADMIN_NAME")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let email = env::var("ADMIN_EMAIL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.trim().to_ascii_lowercase());
    let password = env::var("ADMIN_PASSWORD")
        .ok()
        .filter(|value| !value.trim().is_empty());
    let configured = [name.is_some(), email.is_some(), password.is_some()];
    if configured.iter().any(|value| *value) && !configured.iter().all(|value| *value) {
        return Err("ADMIN_NAME, ADMIN_EMAIL, and ADMIN_PASSWORD must be set together".into());
    }
    let (Some(name), Some(email), Some(password)) = (name, email, password) else {
        tracing::warn!("Admin bootstrap skipped because ADMIN_* variables are not configured.");
        return Ok(());
    };
    if name.trim().len() > 200
        || !is_valid_email(&email)
        || validate_admin_password(&password).is_err()
    {
        return Err("Admin bootstrap settings have an invalid name, email, or password".into());
    }

    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|error| std::io::Error::other(error.to_string()))?
        .to_string();
    insert_bootstrap_admin(pool, name.trim(), &email, &password_hash).await?;
    // Optional NIP so the bootstrap admin can sign in like everyone else. Only filled when empty.
    if let Some(nip) = env::var("ADMIN_NIP")
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
    {
        if nip.chars().count() > 40 {
            return Err("ADMIN_NIP must be at most 40 characters".into());
        }
        sqlx::query(
            "UPDATE admins SET employee_number = $1 WHERE email = $2 AND employee_number IS NULL",
        )
        .bind(&nip)
        .bind(&email)
        .execute(pool)
        .await?;
    }
    tracing::info!("Admin bootstrap account was created if it did not already exist.");
    Ok(())
}

async fn insert_bootstrap_admin(
    pool: &PgPool,
    name: &str,
    email: &str,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO admins (name, email, password_hash, admin_role) VALUES ($1, $2, $3, 'super_admin') ON CONFLICT (email) DO NOTHING",
    )
    .bind(name)
    .bind(email)
    .bind(password_hash)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::admin_accounts::is_valid_admin_scope_shape;
    use super::admin_applications::is_valid_application_status_transition;
    use super::applications::{validate_application_pdf, validate_application_status_reason};
    use super::jobs::{
        is_valid_job_status_update, validate_admin_job, validate_job_type_name,
        validate_optional_organization_name, validate_organization_description,
    };
    use super::*;

    #[test]
    fn session_cookie_is_http_only_and_not_accessible_as_a_bearer_header() {
        let token = "a".repeat(64);
        let cookie = session_cookie(Some(&token)).unwrap();
        let cookie = cookie.to_str().unwrap();
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.contains("SameSite=Strict"));
        assert!(cookie.contains("Path=/"));
        assert!(cookie.starts_with(&format!("{SESSION_COOKIE_NAME}={token}")));

        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&format!("{SESSION_COOKIE_NAME}={token}; theme=dark")).unwrap(),
        );
        assert_eq!(session_token(&headers), Some(token.as_str()));

        headers.remove(COOKIE);
        headers.insert(
            axum::http::header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        assert_eq!(session_token(&headers), None);
    }

    #[test]
    fn unsafe_requests_require_an_exact_origin_match() {
        let mut headers = HeaderMap::new();
        headers.insert(HOST, HeaderValue::from_static("app.example.com"));
        headers.insert(ORIGIN, HeaderValue::from_static("https://app.example.com"));
        assert!(request_has_same_origin(&headers));

        headers.insert(ORIGIN, HeaderValue::from_static("https://evil.example.com"));
        assert!(!request_has_same_origin(&headers));

        headers.remove(ORIGIN);
        assert!(!request_has_same_origin(&headers));
    }

    #[cfg(feature = "postgres-migration-tests")]
    #[sqlx::test(migrations = "./migrations")]
    async fn bootstrap_does_not_overwrite_existing_admin_credentials(pool: PgPool) {
        insert_bootstrap_admin(
            &pool,
            "Bootstrap Admin",
            "bootstrap@example.com",
            "initial-hash",
        )
        .await
        .expect("bootstrap account should be inserted");
        insert_bootstrap_admin(&pool, "Updated Admin", "bootstrap@example.com", "new-hash")
            .await
            .expect("repeated bootstrap should not fail");

        let account = sqlx::query_as::<_, (String, String, String)>(
            "SELECT name, password_hash, admin_role FROM admins WHERE email = $1",
        )
        .bind("bootstrap@example.com")
        .fetch_one(&pool)
        .await
        .expect("bootstrap account should exist");

        assert_eq!(account.0, "Bootstrap Admin");
        assert_eq!(account.1, "initial-hash");
        assert_eq!(account.2, "super_admin");
    }

    #[cfg(feature = "postgres-migration-tests")]
    #[sqlx::test(migrations = "./migrations")]
    async fn public_organization_preserves_the_division_department_bureau_hierarchy(pool: PgPool) {
        let state = AppState {
            pool: pool.clone(),
            push_service: None,
        };
        let division_id: i64 = sqlx::query_scalar(
            "INSERT INTO divisions (name, description, secretariat_name, secretariat_description) VALUES ('Hierarchy Test Division', 'Division description', '', '') RETURNING id",
        )
        .fetch_one(&pool)
        .await
        .expect("test division should be created");
        let department_id: i64 = sqlx::query_scalar(
            "INSERT INTO departments (division_id, name, description) VALUES ($1, 'Hierarchy Test Department', 'Department description') RETURNING id",
        )
        .bind(division_id)
        .fetch_one(&pool)
        .await
        .expect("test department should be linked to its division");
        let bureau_id: i64 = sqlx::query_scalar(
            "INSERT INTO bureaus (department_id, name, description, unit_type) VALUES ($1, 'Hierarchy Test Bureau', 'Bureau description', 'biro') RETURNING id",
        )
        .bind(department_id)
        .fetch_one(&pool)
        .await
        .expect("test bureau should be linked to its department");

        let organization = public_list_organization(State(state))
            .await
            .expect("public organization should load")
            .0;
        let department = organization
            .departments
            .iter()
            .find(|item| item.id == department_id)
            .expect("public organization should expose the department");
        let bureau = organization
            .bureaus
            .iter()
            .find(|item| item.id == bureau_id)
            .expect("public organization should expose the bureau");
        assert_eq!(department.division_id, division_id);
        assert_eq!(department.description, "Department description");
        assert_eq!(bureau.department_id, department_id);
        assert_eq!(bureau.description, "Bureau description");
    }

    #[cfg(feature = "postgres-migration-tests")]
    #[sqlx::test(migrations = "./migrations")]
    async fn applicant_and_admin_logins_suspend_after_five_failures_and_reset_after_expiry(
        pool: PgPool,
    ) {
        let state = AppState {
            pool: pool.clone(),
            push_service: None,
        };
        let password_hash = hash_password("Correct!Password123").unwrap();
        sqlx::query("INSERT INTO applicants (name, employee_number, password_hash) VALUES ('Applicant', '5551234', $1)")
            .bind(&password_hash)
            .execute(&pool)
            .await
            .expect("applicant account should be created");

        for attempt in 1..=MAX_LOGIN_FAILURES {
            let result = login(
                State(state.clone()),
                Json(LoginRequest {
                    email: "5551234".to_owned(),
                    password: "wrong-password".to_owned(),
                }),
            )
            .await;
            if attempt == MAX_LOGIN_FAILURES {
                assert!(matches!(result, Err(ApiError::AccountSuspended)));
            } else {
                assert!(matches!(result, Err(ApiError::BadRequest(_))));
            }
        }
        let applicant_is_suspended_for_15_minutes: bool = sqlx::query_scalar(
            "SELECT locked_until > NOW() AND locked_until <= NOW() + INTERVAL '15 minutes' FROM applicants WHERE employee_number = $1",
        )
        .bind("5551234")
        .fetch_one(&pool)
        .await
        .expect("applicant lock expiry should be queryable");
        assert!(applicant_is_suspended_for_15_minutes);
        assert!(matches!(
            login(
                State(state.clone()),
                Json(LoginRequest {
                    email: "5551234".to_owned(),
                    password: "Correct!Password123".to_owned(),
                }),
            )
            .await,
            Err(ApiError::AccountSuspended)
        ));

        sqlx::query(
            "UPDATE applicants SET locked_until = NOW() - INTERVAL '1 second' WHERE employee_number = $1",
        )
        .bind("5551234")
        .execute(&pool)
        .await
        .expect("applicant lock should be expirable for this test");
        assert!(matches!(
            login(
                State(state.clone()),
                Json(LoginRequest {
                    email: "5551234".to_owned(),
                    password: "wrong-password".to_owned(),
                }),
            )
            .await,
            Err(ApiError::BadRequest(_))
        ));
        let (headers, _) = login(
            State(state.clone()),
            Json(LoginRequest {
                email: "5551234".to_owned(),
                password: "Correct!Password123".to_owned(),
            }),
        )
        .await
        .expect("applicant should sign in after the suspension expires");
        assert!(headers.contains_key(SET_COOKIE));
        let applicant_failures: i32 =
            sqlx::query_scalar("SELECT failed_login_attempts FROM applicants WHERE employee_number = $1")
                .bind("5551234")
                .fetch_one(&pool)
                .await
                .expect("applicant failure count should be queryable");
        assert_eq!(applicant_failures, 0);

        sqlx::query("INSERT INTO admins (name, email, password_hash) VALUES ('Admin', 'lockout-admin@example.test', $1)")
            .bind(&password_hash)
            .execute(&pool)
            .await
            .expect("admin account should be created");
        for attempt in 1..=MAX_LOGIN_FAILURES {
            let result = admin_login(
                State(state.clone()),
                Json(AdminLoginRequest {
                    email: "lockout-admin@example.test".to_owned(),
                    password: "wrong-password".to_owned(),
                }),
            )
            .await;
            if attempt == MAX_LOGIN_FAILURES {
                assert!(matches!(result, Err(ApiError::AccountSuspended)));
            } else {
                assert!(matches!(result, Err(ApiError::BadRequest(_))));
            }
        }
        let admin_is_suspended_for_15_minutes: bool = sqlx::query_scalar(
            "SELECT locked_until > NOW() AND locked_until <= NOW() + INTERVAL '15 minutes' FROM admins WHERE email = $1",
        )
        .bind("lockout-admin@example.test")
        .fetch_one(&pool)
        .await
        .expect("admin lock expiry should be queryable");
        assert!(admin_is_suspended_for_15_minutes);
        assert!(matches!(
            admin_login(
                State(state.clone()),
                Json(AdminLoginRequest {
                    email: "lockout-admin@example.test".to_owned(),
                    password: "Correct!Password123".to_owned(),
                }),
            )
            .await,
            Err(ApiError::AccountSuspended)
        ));
        sqlx::query(
            "UPDATE admins SET locked_until = NOW() - INTERVAL '1 second' WHERE email = $1",
        )
        .bind("lockout-admin@example.test")
        .execute(&pool)
        .await
        .expect("admin lock should be expirable for this test");
        let (_, _) = admin_login(
            State(state.clone()),
            Json(AdminLoginRequest {
                email: "lockout-admin@example.test".to_owned(),
                password: "Correct!Password123".to_owned(),
            }),
        )
        .await
        .expect("admin should sign in after the suspension expires");
        let admin_failures: i32 =
            sqlx::query_scalar("SELECT failed_login_attempts FROM admins WHERE email = $1")
                .bind("lockout-admin@example.test")
                .fetch_one(&pool)
                .await
                .expect("admin failure count should be queryable");
        assert_eq!(admin_failures, 0);
    }

    #[cfg(feature = "postgres-migration-tests")]
    #[sqlx::test(migrations = "./migrations")]
    async fn admin_job_application_and_account_workflow(pool: PgPool) {
        fn session_cookie_headers(response_headers: &HeaderMap) -> HeaderMap {
            let mut headers = HeaderMap::new();
            let cookie = response_headers
                .get(SET_COOKIE)
                .unwrap()
                .to_str()
                .unwrap()
                .split(';')
                .next()
                .unwrap();
            headers.insert(COOKIE, HeaderValue::from_str(cookie).unwrap());
            headers
        }

        async fn submit_test_application(
            state: &AppState,
            headers: HeaderMap,
            job_id: &str,
            employee_number: &str,
            boundary: &str,
        ) -> serde_json::Value {
            use axum::extract::FromRequest;

            let body = format!(
                "--{boundary}\r\nContent-Disposition: form-data; name=\"job_id\"\r\n\r\n{job_id}\r\n\
                 --{boundary}\r\nContent-Disposition: form-data; name=\"employee_number\"\r\n\r\n{employee_number}\r\n\
                 --{boundary}\r\nContent-Disposition: form-data; name=\"applicant_full_name\"\r\n\r\nAudit Applicant\r\n\
                 --{boundary}\r\nContent-Disposition: form-data; name=\"origin_division\"\r\n\r\nAudit Division Updated\r\n\
                 --{boundary}\r\nContent-Disposition: form-data; name=\"origin_unit\"\r\n\r\nAudit Department Updated / Audit Bureau Updated\r\n\
                 --{boundary}\r\nContent-Disposition: form-data; name=\"education_level\"\r\n\r\nD4/S1\r\n\
                 --{boundary}\r\nContent-Disposition: form-data; name=\"study_field\"\r\n\r\nTeknik\r\n\
                 --{boundary}\r\nContent-Disposition: form-data; name=\"motivation\"\r\n\r\nPengembangan karier\r\n\
                 --{boundary}\r\nContent-Disposition: form-data; name=\"supporting_document\"; filename=\"cv.pdf\"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\nAudit document\r\n\
                 --{boundary}--\r\n"
            );
            let request = Request::builder()
                .header(
                    CONTENT_TYPE,
                    format!("multipart/form-data; boundary={boundary}"),
                )
                .body(Body::from(body))
                .unwrap();
            let multipart = Multipart::from_request(request, state).await.unwrap();
            create_application(State(state.clone()), headers, multipart)
                .await
                .unwrap()
                .0
        }

        let state = AppState {
            pool,
            push_service: None,
        };
        let super_password = "Admin!Pass123";
        insert_bootstrap_admin(
            &state.pool,
            "Audit Super Admin",
            "super@example.com",
            &hash_password(super_password).unwrap(),
        )
        .await
        .unwrap();
        let (super_login_headers, _) = admin_login(
            State(state.clone()),
            Json(AdminLoginRequest {
                email: "super@example.com".to_owned(),
                password: super_password.to_owned(),
            }),
        )
        .await
        .unwrap();
        let super_headers = session_cookie_headers(&super_login_headers);
        assert!(matches!(
            admin_create_admin_account(
                State(state.clone()),
                super_headers.clone(),
                Json(AdminAccountCreateRequest {
                    name: "Additional Super Admin".to_owned(),
                    email: "additional-super@example.com".to_owned(),
                    password: "Admin!Pass123".to_owned(),
                    admin_role: "super_admin".to_owned(),
                    division_id: None,
                    department_id: None,
                    bureau_id: None,
                    permissions: None,
                }),
            )
            .await,
            Err(ApiError::BadRequest(_))
        ));

        let _ = admin_create_division(
            State(state.clone()),
            super_headers.clone(),
            Json(DivisionRequest {
                name: "Audit Division".to_owned(),
                description: "Audit".to_owned(),
                secretariat_name: "Audit Secretariat".to_owned(),
                secretariat_description: String::new(),
            }),
        )
        .await
        .unwrap();
        let division_id: i64 =
            sqlx::query_scalar("SELECT id FROM divisions WHERE name = 'Audit Division'")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        let _ = admin_create_department(
            State(state.clone()),
            super_headers.clone(),
            Json(CreateDepartmentRequest {
                division_id,
                name: "Audit Department".to_owned(),
                description: String::new(),
            }),
        )
        .await
        .unwrap();
        let department_id: i64 =
            sqlx::query_scalar("SELECT id FROM departments WHERE name = 'Audit Department'")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        let _ = admin_create_bureau(
            State(state.clone()),
            super_headers.clone(),
            Json(CreateBureauRequest {
                department_id,
                name: "Audit Bureau".to_owned(),
                description: String::new(),
                unit_type: "biro".to_owned(),
            }),
        )
        .await
        .unwrap();
        let bureau_id: i64 =
            sqlx::query_scalar("SELECT id FROM bureaus WHERE name = 'Audit Bureau'")
                .fetch_one(&state.pool)
                .await
                .unwrap();

        let _ = admin_create_job_type(
            State(state.clone()),
            super_headers.clone(),
            Json(JobTypeNameRequest {
                name: "Audit Work".to_owned(),
            }),
        )
        .await
        .unwrap();
        let job_type_id: i64 =
            sqlx::query_scalar("SELECT id FROM job_types WHERE name = 'Audit Work'")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        let _ = admin_update_job_type(
            State(state.clone()),
            super_headers.clone(),
            Path(job_type_id),
            Json(JobTypeNameRequest {
                name: "Audit Role".to_owned(),
            }),
        )
        .await
        .unwrap();

        for (name, email, role, division_id, department_id) in [
            (
                "Audit Division Head",
                "kadiv@example.com",
                "division_head",
                Some(division_id),
                None,
            ),
            (
                "Audit Department Head",
                "kadep@example.com",
                "department_head",
                None,
                Some(department_id),
            ),
        ] {
            let _ = admin_create_admin_account(
                State(state.clone()),
                super_headers.clone(),
                Json(AdminAccountCreateRequest {
                    name: name.to_owned(),
                    email: email.to_owned(),
                    password: "Admin!Pass123".to_owned(),
                    admin_role: role.to_owned(),
                    division_id,
                    department_id,
                    bureau_id: None,
                    permissions: Some(vec![
                        APPLICATIONS_VIEW.to_owned(),
                        APPLICATIONS_CHANGE_STATUS.to_owned(),
                        APPLICATIONS_DOWNLOAD_DOCUMENTS.to_owned(),
                        JOBS_VIEW.to_owned(),
                        JOBS_CREATE.to_owned(),
                        JOBS_UPDATE.to_owned(),
                        JOBS_DELETE.to_owned(),
                        JOBS_CHANGE_STATUS.to_owned(),
                    ]),
                }),
            )
            .await
            .unwrap();
        }
        let account_list = admin_list_admin_accounts(State(state.clone()), super_headers.clone())
            .await
            .unwrap()
            .0;
        assert_eq!(account_list["data"].as_array().unwrap().len(), 3);

        let job_fields = || AdminJobFields {
            title: "Audit Position".to_owned(),
            target_level: "bureau".to_owned(),
            division_id: Some(division_id),
            department_id: Some(department_id),
            bureau_id: Some(bureau_id),
            location: "Jakarta".to_owned(),
            quota: 1,
            posted: "Hari ini".to_owned(),
            job_type: "Audit Role".to_owned(),
            summary: "Internal mobility audit".to_owned(),
            skills: vec!["Pengalaman internal".to_owned()],
            responsibilities: vec!["Mengelola pekerjaan".to_owned()],
        };
        let _ = admin_create_job(
            State(state.clone()),
            super_headers.clone(),
            Json(CreateAdminJobRequest {
                id: "AUDIT-JOB-001".to_owned(),
                fields: job_fields(),
            }),
        )
        .await
        .unwrap();
        let _ = admin_set_job_status(
            State(state.clone()),
            super_headers.clone(),
            Path("AUDIT-JOB-001".to_owned()),
            Json(JobStatusRequest {
                status: "open".to_owned(),
            }),
        )
        .await
        .unwrap();
        let _ = admin_update_division(
            State(state.clone()),
            super_headers.clone(),
            Path(division_id),
            Json(DivisionRequest {
                name: "Audit Division Updated".to_owned(),
                description: "Updated".to_owned(),
                secretariat_name: "Audit Secretariat".to_owned(),
                secretariat_description: String::new(),
            }),
        )
        .await
        .unwrap();
        let _ = admin_update_department(
            State(state.clone()),
            super_headers.clone(),
            Path(department_id),
            Json(OrganizationNameRequest {
                name: "Audit Department Updated".to_owned(),
                description: "Updated".to_owned(),
            }),
        )
        .await
        .unwrap();
        let _ = admin_update_bureau(
            State(state.clone()),
            super_headers.clone(),
            Path(bureau_id),
            Json(BureauUpdateRequest {
                name: "Audit Bureau Updated".to_owned(),
                description: "Updated".to_owned(),
                unit_type: "biro".to_owned(),
            }),
        )
        .await
        .unwrap();
        let mut updated_job_fields = job_fields();
        updated_job_fields.title = "Audit Position Updated".to_owned();
        assert!(matches!(
            admin_update_job(
                State(state.clone()),
                super_headers.clone(),
                Path("AUDIT-JOB-001".to_owned()),
                Json(job_fields()),
            )
            .await,
            Err(ApiError::Conflict(_))
        ));
        let _ = admin_set_job_status(
            State(state.clone()),
            super_headers.clone(),
            Path("AUDIT-JOB-001".to_owned()),
            Json(JobStatusRequest {
                status: "closed".to_owned(),
            }),
        )
        .await
        .unwrap();
        let _ = admin_update_job(
            State(state.clone()),
            super_headers.clone(),
            Path("AUDIT-JOB-001".to_owned()),
            Json(updated_job_fields),
        )
        .await
        .unwrap();
        let _ = admin_set_job_status(
            State(state.clone()),
            super_headers.clone(),
            Path("AUDIT-JOB-001".to_owned()),
            Json(JobStatusRequest {
                status: "open".to_owned(),
            }),
        )
        .await
        .unwrap();
        let updated_jobs = admin_list_jobs(State(state.clone()), super_headers.clone())
            .await
            .unwrap()
            .0;
        assert_eq!(updated_jobs.data[0].division, "Audit Division Updated");
        assert_eq!(updated_jobs.data[0].department, "Audit Department Updated");
        assert_eq!(updated_jobs.data[0].unit, "Audit Bureau Updated");
        assert_eq!(updated_jobs.data[0].job_type, "Audit Role");
        let _ = admin_create_job(
            State(state.clone()),
            super_headers.clone(),
            Json(CreateAdminJobRequest {
                id: "AUDIT-JOB-DIV".to_owned(),
                fields: AdminJobFields {
                    title: "Division Position".to_owned(),
                    target_level: "division".to_owned(),
                    department_id: None,
                    bureau_id: None,
                    ..job_fields()
                },
            }),
        )
        .await
        .unwrap();
        let _ = admin_set_job_status(
            State(state.clone()),
            super_headers.clone(),
            Path("AUDIT-JOB-DIV".to_owned()),
            Json(JobStatusRequest {
                status: "open".to_owned(),
            }),
        )
        .await
        .unwrap();
        let other_division_id: i64 = sqlx::query_scalar(
            "INSERT INTO divisions (name) VALUES ('Other Audit Division') RETURNING id",
        )
        .fetch_one(&state.pool)
        .await
        .unwrap();
        let other_department_id: i64 = sqlx::query_scalar(
            "INSERT INTO departments (division_id, name) VALUES ($1, 'Other Audit Department') RETURNING id",
        )
        .bind(other_division_id)
        .fetch_one(&state.pool)
        .await
        .unwrap();
        let other_bureau_id: i64 = sqlx::query_scalar(
            "INSERT INTO bureaus (department_id, name) VALUES ($1, 'Other Audit Bureau') RETURNING id",
        )
        .bind(other_department_id)
        .fetch_one(&state.pool)
        .await
        .unwrap();
        let _ = admin_create_job(
            State(state.clone()),
            super_headers.clone(),
            Json(CreateAdminJobRequest {
                id: "AUDIT-JOB-OTHER".to_owned(),
                fields: AdminJobFields {
                    title: "Other Division Position".to_owned(),
                    division_id: Some(other_division_id),
                    department_id: Some(other_department_id),
                    bureau_id: Some(other_bureau_id),
                    ..job_fields()
                },
            }),
        )
        .await
        .unwrap();
        let _ = admin_create_admin_account(
            State(state.clone()),
            super_headers.clone(),
            Json(AdminAccountCreateRequest {
                name: "Audit Operational Admin".to_owned(),
                email: "operational@example.com".to_owned(),
                password: "Admin!Pass123".to_owned(),
                admin_role: "admin".to_owned(),
                division_id: None,
                department_id: None,
                bureau_id: None,
                permissions: Some(vec![JOBS_VIEW.to_owned()]),
            }),
        )
        .await
        .unwrap();

        let (kadep_login_headers, _) = admin_login(
            State(state.clone()),
            Json(AdminLoginRequest {
                email: "kadep@example.com".to_owned(),
                password: "Admin!Pass123".to_owned(),
            }),
        )
        .await
        .unwrap();
        let kadep_headers = session_cookie_headers(&kadep_login_headers);
        assert_eq!(
            admin_list_jobs(State(state.clone()), kadep_headers.clone())
                .await
                .unwrap()
                .0
                .data
                .len(),
            1
        );
        let (kadiv_login_headers, _) = admin_login(
            State(state.clone()),
            Json(AdminLoginRequest {
                email: "kadiv@example.com".to_owned(),
                password: "Admin!Pass123".to_owned(),
            }),
        )
        .await
        .unwrap();
        let kadiv_headers = session_cookie_headers(&kadiv_login_headers);
        assert_eq!(
            admin_list_jobs(State(state.clone()), kadiv_headers.clone())
                .await
                .unwrap()
                .0
                .data
                .len(),
            2
        );
        let (operational_login_headers, _) = admin_login(
            State(state.clone()),
            Json(AdminLoginRequest {
                email: "operational@example.com".to_owned(),
                password: "Admin!Pass123".to_owned(),
            }),
        )
        .await
        .unwrap();
        assert_eq!(
            admin_list_jobs(
                State(state.clone()),
                session_cookie_headers(&operational_login_headers)
            )
            .await
            .unwrap()
            .0
            .data
            .len(),
            3
        );
        let operational_headers = session_cookie_headers(&operational_login_headers);
        assert!(matches!(
            admin_list_applications(State(state.clone()), operational_headers.clone()).await,
            Err(ApiError::Forbidden)
        ));
        assert!(matches!(
            admin_set_job_status(
                State(state.clone()),
                operational_headers.clone(),
                Path("AUDIT-JOB-001".to_owned()),
                Json(JobStatusRequest {
                    status: "closed".to_owned(),
                }),
            )
            .await,
            Err(ApiError::Forbidden)
        ));
        assert!(matches!(
            admin_create_job(
                State(state.clone()),
                kadep_headers.clone(),
                Json(CreateAdminJobRequest {
                    id: "AUDIT-JOB-OUT-OF-SCOPE".to_owned(),
                    fields: AdminJobFields {
                        target_level: "division".to_owned(),
                        department_id: None,
                        bureau_id: None,
                        ..job_fields()
                    },
                }),
            )
            .await,
            Err(ApiError::Forbidden)
        ));
        let _ = admin_create_job(
            State(state.clone()),
            kadep_headers.clone(),
            Json(CreateAdminJobRequest {
                id: "AUDIT-JOB-KADEP".to_owned(),
                fields: job_fields(),
            }),
        )
        .await
        .unwrap();
        let mut kadep_job_update = job_fields();
        kadep_job_update.title = "Kadep Updated Position".to_owned();
        let _ = admin_update_job(
            State(state.clone()),
            kadep_headers.clone(),
            Path("AUDIT-JOB-KADEP".to_owned()),
            Json(kadep_job_update),
        )
        .await
        .unwrap();
        let _ = admin_delete_job(
            State(state.clone()),
            kadep_headers.clone(),
            Path("AUDIT-JOB-KADEP".to_owned()),
        )
        .await
        .unwrap();
        assert!(matches!(
            admin_create_job(
                State(state.clone()),
                operational_headers.clone(),
                Json(CreateAdminJobRequest {
                    id: "AUDIT-JOB-NO-CREATE-PERMISSION".to_owned(),
                    fields: job_fields(),
                }),
            )
            .await,
            Err(ApiError::Forbidden)
        ));

        let initial_applicant_password = "Applicant!Temp123";
        let _ = admin_create_account(
            State(state.clone()),
            super_headers.clone(),
            Json(AdminApplicantCreateRequest {
                name: "Audit Applicant".to_owned(),
                email: "applicant@example.com".to_owned(),
                password: initial_applicant_password.to_owned(),
            }),
        )
        .await
        .unwrap();
        let (applicant_login_headers, applicant_login_response) = login(
            State(state.clone()),
            Json(LoginRequest {
                email: "applicant@example.com".to_owned(),
                password: initial_applicant_password.to_owned(),
            }),
        )
        .await
        .unwrap();
        let LoginResponse::Applicant(applicant_login_response) = applicant_login_response.0 else {
            panic!("the applicant account should use the applicant login response");
        };
        assert!(applicant_login_response.applicant.must_change_password);
        let applicant_headers = session_cookie_headers(&applicant_login_headers);
        assert!(matches!(
            list_applications(State(state.clone()), applicant_headers.clone()).await,
            Err(ApiError::PasswordChangeRequired)
        ));
        assert!(matches!(
            change_account_password(
                State(state.clone()),
                applicant_headers.clone(),
                Json(ChangePasswordRequest {
                    current_password: initial_applicant_password.to_owned(),
                    new_password: initial_applicant_password.to_owned(),
                }),
            )
            .await,
            Err(ApiError::BadRequest(_))
        ));
        let _ = change_account_password(
            State(state.clone()),
            applicant_headers.clone(),
            Json(ChangePasswordRequest {
                current_password: initial_applicant_password.to_owned(),
                new_password: "Applicant!New123".to_owned(),
            }),
        )
        .await
        .unwrap();
        let restored_applicant_session =
            current_session(State(state.clone()), applicant_headers.clone())
                .await
                .unwrap()
                .0;
        let LoginResponse::Applicant(restored_applicant_session) = restored_applicant_session
        else {
            panic!("the restored session should belong to the applicant");
        };
        assert!(!restored_applicant_session.applicant.must_change_password);
        let submitted = submit_test_application(
            &state,
            applicant_headers.clone(),
            "AUDIT-JOB-001",
            "EMP-001",
            "admin-workflow-audit",
        )
        .await;
        let application_id = submitted["application_id"].as_str().unwrap().to_owned();
        let division_application = submit_test_application(
            &state,
            applicant_headers,
            "AUDIT-JOB-DIV",
            "EMP-002",
            "admin-workflow-audit-division",
        )
        .await;
        let division_application_id = division_application["application_id"]
            .as_str()
            .unwrap()
            .to_owned();
        assert_eq!(
            admin_list_applications(State(state.clone()), kadep_headers.clone())
                .await
                .unwrap()
                .0
                .data
                .len(),
            1
        );
        assert!(matches!(
            admin_get_application(
                State(state.clone()),
                kadep_headers.clone(),
                Path(division_application_id.clone()),
            )
            .await,
            Err(ApiError::NotFound(_))
        ));
        assert_eq!(
            admin_list_notifications(State(state.clone()), kadep_headers.clone())
                .await
                .unwrap()
                .0
                .data
                .len(),
            1
        );
        assert_eq!(
            admin_list_applications(State(state.clone()), kadiv_headers.clone())
                .await
                .unwrap()
                .0
                .data
                .len(),
            2
        );
        assert_eq!(
            admin_list_notifications(State(state.clone()), kadiv_headers.clone())
                .await
                .unwrap()
                .0
                .data
                .len(),
            2
        );

        async fn create_permission_admin(
            state: &AppState,
            super_headers: &HeaderMap,
            email: &str,
            permissions: Vec<String>,
            department_id: i64,
        ) -> HeaderMap {
            let _ = admin_create_admin_account(
                State(state.clone()),
                super_headers.clone(),
                Json(AdminAccountCreateRequest {
                    name: email.to_owned(),
                    email: email.to_owned(),
                    password: "Matrix!Pass123".to_owned(),
                    admin_role: "department_head".to_owned(),
                    division_id: None,
                    department_id: Some(department_id),
                    bureau_id: None,
                    permissions: Some(permissions),
                }),
            )
            .await
            .unwrap();
            let (admin_login_headers, _) = admin_login(
                State(state.clone()),
                Json(AdminLoginRequest {
                    email: email.to_owned(),
                    password: "Matrix!Pass123".to_owned(),
                }),
            )
            .await
            .unwrap();
            session_cookie_headers(&admin_login_headers)
        }

        let view_only_headers = create_permission_admin(
            &state,
            &super_headers,
            "view-only@example.com",
            vec![APPLICATIONS_VIEW.to_owned()],
            department_id,
        )
        .await;
        assert_eq!(
            admin_get_application(
                State(state.clone()),
                view_only_headers.clone(),
                Path(application_id.clone()),
            )
            .await
            .unwrap()
            .0
            .application
            .status,
            "submitted"
        );
        assert!(matches!(
            admin_download_application_document(
                State(state.clone()),
                view_only_headers.clone(),
                Path((application_id.clone(), 1)),
            )
            .await,
            Err(ApiError::Forbidden)
        ));
        assert!(matches!(
            admin_set_application_status(
                State(state.clone()),
                view_only_headers,
                Path(application_id.clone()),
                Json(ApplicationStatusRequest {
                    status: "screening".to_owned(),
                    reason: None,
                }),
            )
            .await,
            Err(ApiError::Forbidden)
        ));

        let document_only_headers = create_permission_admin(
            &state,
            &super_headers,
            "document-only@example.com",
            vec![
                APPLICATIONS_VIEW.to_owned(),
                APPLICATIONS_DOWNLOAD_DOCUMENTS.to_owned(),
            ],
            department_id,
        )
        .await;
        let document = admin_download_application_document(
            State(state.clone()),
            document_only_headers.clone(),
            Path((application_id.clone(), 1)),
        )
        .await
        .unwrap();
        assert_eq!(document.status(), StatusCode::OK);
        assert!(matches!(
            admin_set_application_status(
                State(state.clone()),
                document_only_headers,
                Path(application_id.clone()),
                Json(ApplicationStatusRequest {
                    status: "screening".to_owned(),
                    reason: None,
                }),
            )
            .await,
            Err(ApiError::Forbidden)
        ));

        let status_only_headers = create_permission_admin(
            &state,
            &super_headers,
            "status-only@example.com",
            vec![
                APPLICATIONS_VIEW.to_owned(),
                APPLICATIONS_CHANGE_STATUS.to_owned(),
            ],
            department_id,
        )
        .await;
        assert!(matches!(
            admin_download_application_document(
                State(state.clone()),
                status_only_headers.clone(),
                Path((application_id.clone(), 1)),
            )
            .await,
            Err(ApiError::Forbidden)
        ));
        let _ = admin_set_application_status(
            State(state.clone()),
            status_only_headers,
            Path(application_id.clone()),
            Json(ApplicationStatusRequest {
                status: "screening".to_owned(),
                reason: None,
            }),
        )
        .await
        .unwrap();

        let applications = admin_list_applications(State(state.clone()), super_headers.clone())
            .await
            .unwrap()
            .0;
        assert_eq!(applications.data.len(), 2);
        let detail = admin_get_application(
            State(state.clone()),
            super_headers.clone(),
            Path(application_id.clone()),
        )
        .await
        .unwrap()
        .0;
        assert_eq!(detail.documents.len(), 1);
        let document = admin_download_application_document(
            State(state.clone()),
            super_headers.clone(),
            Path((application_id.clone(), detail.documents[0].id)),
        )
        .await
        .unwrap();
        assert_eq!(
            axum::body::to_bytes(document.into_body(), 1024)
                .await
                .unwrap()
                .as_ref(),
            b"%PDF-1.7\nAudit document"
        );

        let notifications = admin_list_notifications(State(state.clone()), super_headers.clone())
            .await
            .unwrap()
            .0;
        assert_eq!(notifications.unread_count, 2);
        let _ = admin_mark_notification_read(
            State(state.clone()),
            super_headers.clone(),
            Path(notifications.data[0].id),
        )
        .await
        .unwrap();
        let _ = admin_set_application_status(
            State(state.clone()),
            super_headers.clone(),
            Path(application_id.clone()),
            Json(ApplicationStatusRequest {
                status: "screening".to_owned(),
                reason: None,
            }),
        )
        .await
        .unwrap();
        let _ = admin_set_application_status(
            State(state.clone()),
            super_headers.clone(),
            Path(application_id.clone()),
            Json(ApplicationStatusRequest {
                status: "rejected".to_owned(),
                reason: Some("Tidak sesuai kualifikasi".to_owned()),
            }),
        )
        .await
        .unwrap();
        let audit_response = admin_list_audit_events(
            State(state.clone()),
            super_headers.clone(),
            Query(AdminAuditQuery {
                before_id: None,
                limit: Some(50),
            }),
        )
        .await
        .unwrap()
        .0;
        let audit_json = serde_json::to_value(audit_response).unwrap();
        let audit_events = audit_json["data"].as_array().unwrap();
        assert!(audit_events.iter().any(|event| {
            event["entity_type"] == "admin_account"
                && event["action"] == "create"
                && event["actor_email"] == "super@example.com"
        }));
        assert!(audit_events
            .iter()
            .any(|event| event["entity_type"] == "division" && event["action"] == "update"));
        assert!(!audit_json.to_string().contains("Admin!Pass123"));
        let audit_page = admin_list_audit_events(
            State(state.clone()),
            super_headers.clone(),
            Query(AdminAuditQuery {
                before_id: None,
                limit: Some(2),
            }),
        )
        .await
        .unwrap()
        .0;
        let audit_page_json = serde_json::to_value(audit_page).unwrap();
        let first_event_id = audit_page_json["data"][0]["id"].as_i64().unwrap();
        let cursor = audit_page_json["next_before_id"].as_i64().unwrap();
        let older_page = admin_list_audit_events(
            State(state.clone()),
            super_headers.clone(),
            Query(AdminAuditQuery {
                before_id: Some(cursor),
                limit: Some(2),
            }),
        )
        .await
        .unwrap()
        .0;
        let older_page_json = serde_json::to_value(older_page).unwrap();
        let older_event_id = older_page_json["data"][0]["id"].as_i64().unwrap();
        assert!(first_event_id > older_event_id);
        assert!(matches!(
            admin_list_audit_events(
                State(state.clone()),
                kadep_headers.clone(),
                Query(AdminAuditQuery {
                    before_id: None,
                    limit: Some(10),
                }),
            )
            .await,
            Err(ApiError::Forbidden)
        ));
        let status_notifications: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM application_status_notifications WHERE new_status = 'rejected' AND reason = 'Tidak sesuai kualifikasi'",
        )
        .fetch_one(&state.pool)
        .await
        .unwrap();
        assert_eq!(status_notifications, 1);
        assert!(matches!(
            admin_delete_job(
                State(state.clone()),
                super_headers.clone(),
                Path("AUDIT-JOB-001".to_owned()),
            )
            .await,
            Err(ApiError::Conflict(_))
        ));
        assert!(matches!(
            admin_delete_bureau(State(state.clone()), super_headers.clone(), Path(bureau_id),)
                .await,
            Err(ApiError::Conflict(_))
        ));
        let kadep_id: i64 =
            sqlx::query_scalar("SELECT id FROM admins WHERE email = 'kadep@example.com'")
                .fetch_one(&state.pool)
                .await
                .unwrap();
        assert!(matches!(
            admin_update_admin_account(
                State(state.clone()),
                super_headers.clone(),
                Path(kadep_id),
                Json(AdminAccountUpdateRequest {
                    name: "Audit Department Head".to_owned(),
                    email: "kadep@example.com".to_owned(),
                    password: None,
                    admin_role: "super_admin".to_owned(),
                    division_id: None,
                    department_id: None,
                    bureau_id: None,
                    permissions: None,
                }),
            )
            .await,
            Err(ApiError::BadRequest(_))
        ));
        let _ = admin_update_admin_account(
            State(state.clone()),
            super_headers.clone(),
            Path(kadep_id),
            Json(AdminAccountUpdateRequest {
                name: "Updated Audit Department Head".to_owned(),
                email: "kadep@example.com".to_owned(),
                password: None,
                admin_role: "department_head".to_owned(),
                division_id: None,
                department_id: Some(department_id),
                bureau_id: None,
                permissions: None,
            }),
        )
        .await
        .unwrap();
        let _ = admin_deactivate_admin_account(
            State(state.clone()),
            super_headers.clone(),
            Path(kadep_id),
        )
        .await
        .unwrap();
        assert!(matches!(
            admin_list_jobs(State(state.clone()), kadep_headers.clone()).await,
            Err(ApiError::Unauthorized)
        ));

        let _ = update_account_profile(
            State(state.clone()),
            super_headers.clone(),
            Json(ProfileUpdateRequest {
                name: "Updated Audit Admin".to_owned(),
            }),
        )
        .await
        .unwrap();
        let _ = change_account_password(
            State(state.clone()),
            super_headers,
            Json(ChangePasswordRequest {
                current_password: super_password.to_owned(),
                new_password: "Admin!Pass456".to_owned(),
            }),
        )
        .await
        .unwrap();
        let (refreshed_super_login_headers, _) = admin_login(
            State(state.clone()),
            Json(AdminLoginRequest {
                email: "super@example.com".to_owned(),
                password: "Admin!Pass456".to_owned(),
            }),
        )
        .await
        .unwrap();
        let final_audit_response = admin_list_audit_events(
            State(state.clone()),
            session_cookie_headers(&refreshed_super_login_headers),
            Query(AdminAuditQuery {
                before_id: None,
                limit: Some(50),
            }),
        )
        .await
        .unwrap()
        .0;
        let final_audit_json = serde_json::to_value(final_audit_response).unwrap();
        let final_audit_events = final_audit_json["data"].as_array().unwrap();
        assert!(final_audit_events.iter().any(|event| {
            event["entity_type"] == "admin_account"
                && event["action"] == "update"
                && event["details"]["source"] == "self_service"
        }));
        assert!(final_audit_events.iter().any(|event| {
            event["entity_type"] == "admin_account"
                && event["action"] == "update"
                && event["details"]["password_changed"] == true
        }));
        assert!(!final_audit_json.to_string().contains("Admin!Pass456"));
    }

    #[test]
    fn foreign_key_delete_restrictions_are_not_internal_errors() {
        assert!(is_foreign_key_violation_code(Some("23001")));
        assert!(is_foreign_key_violation_code(Some("23503")));
        assert!(!is_foreign_key_violation_code(Some("23505")));
        assert!(!is_foreign_key_violation_code(None));
    }

    #[test]
    fn api_responses_are_not_cacheable() {
        let mut response = Response::new(Body::empty());
        set_api_no_store(&mut response);

        assert_eq!(
            response
                .headers()
                .get(CACHE_CONTROL)
                .and_then(|value| value.to_str().ok()),
            Some("no-store")
        );
    }

    #[test]
    fn job_json_fields_are_returned_as_arrays() {
        let job = Job {
            id: "POS-2026-001".to_owned(),
            title: "Test role".to_owned(),
            division: "Test division".to_owned(),
            department: "Test department".to_owned(),
            unit: "Test unit".to_owned(),
            unit_type: "bengkel".to_owned(),
            target_level: "bureau".to_owned(),
            division_id: 1,
            department_id: Some(2),
            bureau_id: Some(3),
            location: "Test location".to_owned(),
            quota: 1,
            posted: "Hari ini".to_owned(),
            job_type: "Full-time".to_owned(),
            summary: "Test summary".to_owned(),
            skills: SqlJson(vec!["Test specification".to_owned()]),
            responsibilities: SqlJson(vec!["Task".to_owned()]),
            status: "open".to_owned(),
            has_applications: None,
        };

        let response = serde_json::to_value(job).expect("job should serialize");
        assert_eq!(response["skills"], json!(["Test specification"]));
        assert_eq!(response["responsibilities"], json!(["Task"]));
        assert_eq!(response["type"], "Full-time");
    }

    #[test]
    fn admin_jobs_require_tasks_and_internal_specs() {
        let mut fields = AdminJobFields {
            title: "Test role".to_owned(),
            target_level: "bureau".to_owned(),
            division_id: Some(1),
            department_id: Some(2),
            bureau_id: Some(3),
            location: "Test location".to_owned(),
            quota: 1,
            posted: "Hari ini".to_owned(),
            job_type: "Full-time".to_owned(),
            summary: "Test summary".to_owned(),
            skills: vec!["Internal experience".to_owned()],
            responsibilities: vec!["Test task".to_owned()],
        };
        assert!(validate_admin_job("POS-2026-001", &fields).is_ok());

        fields.target_level = "department".to_owned();
        fields.bureau_id = None;
        assert!(validate_admin_job("POS-2026-001", &fields).is_ok());
        fields.target_level = "division".to_owned();
        fields.department_id = None;
        assert!(validate_admin_job("POS-2026-001", &fields).is_ok());
        fields.target_level = "division".to_owned();
        fields.department_id = Some(2);
        assert!(validate_admin_job("POS-2026-001", &fields).is_err());
        fields.target_level = "bureau".to_owned();
        fields.department_id = Some(2);
        fields.bureau_id = Some(3);

        fields.skills = vec!["  ".to_owned()];
        assert!(validate_admin_job("POS-2026-001", &fields).is_err());

        fields.skills = vec!["Internal experience".to_owned()];
        fields.responsibilities.clear();
        assert!(validate_admin_job("POS-2026-001", &fields).is_err());
    }

    #[test]
    fn job_type_names_are_trimmed_and_limited() {
        assert_eq!(
            validate_job_type_name("  Part-time  ").unwrap(),
            "Part-time"
        );
        assert!(validate_job_type_name("  ").is_err());
        assert!(validate_job_type_name(&"x".repeat(81)).is_err());
    }

    #[test]
    fn organization_descriptions_and_secretariat_names_are_validated() {
        assert_eq!(
            validate_organization_description("  Deskripsi unit  ").unwrap(),
            "Deskripsi unit"
        );
        assert!(validate_organization_description(&"x".repeat(4001)).is_err());
        assert_eq!(
            validate_optional_organization_name("  Sekretariat Divisi  ").unwrap(),
            "Sekretariat Divisi"
        );
        assert_eq!(validate_optional_organization_name("  ").unwrap(), "");
        assert!(validate_optional_organization_name(&"x".repeat(161)).is_err());
    }

    #[test]
    fn job_status_toggle_only_allows_open_or_closed() {
        assert!(is_valid_job_status_update("open"));
        assert!(is_valid_job_status_update("closed"));
        assert!(!is_valid_job_status_update("draft"));
        assert!(!is_valid_job_status_update("unknown"));
    }

    #[test]
    fn email_validation_accepts_normalized_applicant_addresses() {
        assert!(is_valid_email("applicant@example.co.id"));
        assert!(is_valid_email("name+jobs@example.com"));
    }

    #[test]
    fn email_validation_rejects_malformed_addresses() {
        assert!(!is_valid_email("not-an-email"));
        assert!(!is_valid_email("name @example.com"));
        assert!(!is_valid_email("name@example"));
    }

    #[test]
    fn application_pdf_validation_accepts_pdf_content_and_sanitizes_path() {
        let file_name =
            validate_application_pdf("../cv.pdf", "application/pdf", b"%PDF-1.7\n").unwrap();
        assert_eq!(file_name, "cv.pdf");
    }

    #[test]
    fn application_pdf_validation_rejects_wrong_content_and_oversized_files() {
        assert!(validate_application_pdf("cv.pdf", "application/pdf", b"not a PDF").is_err());
        assert!(validate_application_pdf("cv.pdf", "text/html", b"%PDF-1.7").is_err());
        assert!(validate_application_pdf(
            "cv.pdf",
            "application/pdf",
            &vec![b'x'; MAX_APPLICATION_FILE_BYTES + 1],
        )
        .is_err());
    }

    #[test]
    fn rejection_status_changes_require_a_reason() {
        assert!(validate_application_status_reason("rejected", None, true).is_err());
        assert!(validate_application_status_reason("rejected", Some("  "), true).is_err());
        assert_eq!(
            validate_application_status_reason(
                "rejected",
                Some("  Tidak sesuai kualifikasi  "),
                true
            )
            .unwrap(),
            Some("Tidak sesuai kualifikasi".to_owned())
        );
    }

    #[test]
    fn application_status_transitions_only_move_forward() {
        assert!(is_valid_application_status_transition(
            "submitted",
            "screening"
        ));
        assert!(!is_valid_application_status_transition(
            "submitted",
            "interview"
        ));
        assert!(!is_valid_application_status_transition(
            "submitted",
            "accepted"
        ));
        assert!(is_valid_application_status_transition(
            "submitted",
            "rejected"
        ));
        assert!(is_valid_application_status_transition(
            "screening",
            "interview"
        ));
        assert!(!is_valid_application_status_transition(
            "screening",
            "accepted"
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
            "submitted",
            "submitted"
        ));
        assert!(!is_valid_application_status_transition(
            "screening",
            "submitted"
        ));
        assert!(!is_valid_application_status_transition(
            "interview",
            "screening"
        ));
        assert!(!is_valid_application_status_transition(
            "accepted", "rejected"
        ));
        assert!(!is_valid_application_status_transition(
            "accepted",
            "interview"
        ));
        assert!(!is_valid_application_status_transition(
            "rejected", "accepted"
        ));
        assert!(!is_valid_application_status_transition(
            "rejected",
            "submitted"
        ));
        assert!(!is_valid_application_status_transition(
            "rejected",
            "screening"
        ));
    }

    #[test]
    fn status_change_reasons_are_optional_but_limited() {
        assert_eq!(
            validate_application_status_reason("screening", None, true).unwrap(),
            None
        );
        assert!(validate_application_status_reason(
            "screening",
            Some(&"x".repeat(MAX_APPLICATION_STATUS_REASON_CHARS + 1)),
            true,
        )
        .is_err());
    }

    #[test]
    fn profile_photo_validation_checks_type_signature_and_size() {
        assert_eq!(
            validate_profile_photo("image/png", b"\x89PNG\r\n\x1a\nimage").unwrap(),
            "image/png"
        );
        assert_eq!(
            validate_profile_photo("image/jpeg", &[0xFF, 0xD8, 0xFF, 0x00]).unwrap(),
            "image/jpeg"
        );
        assert_eq!(
            validate_profile_photo("image/webp", b"RIFF0000WEBPdata").unwrap(),
            "image/webp"
        );
        assert!(validate_profile_photo("image/png", b"not an image").is_err());
        assert!(
            validate_profile_photo("image/png", &vec![0; MAX_PROFILE_PHOTO_BYTES + 1]).is_err()
        );
    }

    #[test]
    fn account_password_rules_match_all_account_roles() {
        assert!(validate_account_password("applicant", "Abcdef1!").is_ok());
        assert!(validate_account_password("applicant", "Abcdefg1").is_ok());
        assert!(validate_account_password("applicant", "Abcd1!").is_err());
        assert!(validate_account_password("admin", "Abcdef1!").is_ok());
        assert!(validate_account_password("admin", "Abcdefg1").is_ok());
        assert!(validate_account_password("admin", "abcdef1!").is_err());
        assert!(validate_account_password("admin", "ABCDEF1!").is_err());
        assert!(validate_account_password("admin", "Abcdefg!").is_err());
        assert!(validate_account_password("admin", "Abcdef").is_err());
    }

    #[test]
    fn admin_account_scopes_match_the_login_roles() {
        assert!(is_valid_admin_scope_shape("super_admin", None, None, None));
        assert!(is_valid_admin_scope_shape("admin", None, None, None));
        assert!(is_valid_admin_scope_shape(
            "division_head",
            Some(1),
            None,
            None
        ));
        assert!(is_valid_admin_scope_shape(
            "department_head",
            None,
            Some(1),
            None
        ));
        assert!(!is_valid_admin_scope_shape(
            "bureau_head",
            None,
            None,
            Some(1)
        ));
        assert!(!is_valid_admin_scope_shape(
            "department_head",
            Some(1),
            Some(2),
            None
        ));
    }

    #[test]
    fn super_admin_bypasses_custom_grants_but_scoped_admins_do_not() {
        let scoped_admin = AdminContext {
            id: 1,
            token_hash: String::new(),
            admin_role: "division_head".to_owned(),
            division_id: Some(10),
            department_id: None,
            permissions: vec![JOBS_VIEW.to_owned()],
        };
        assert!(scoped_admin.has_permission(JOBS_VIEW));
        assert!(!scoped_admin.has_permission(JOBS_DELETE));

        let super_admin = AdminContext {
            id: 2,
            token_hash: String::new(),
            admin_role: "super_admin".to_owned(),
            division_id: None,
            department_id: None,
            permissions: Vec::new(),
        };
        assert!(super_admin.has_permission(APPLICANT_ACCOUNTS_MANAGE));
    }

    #[test]
    fn application_public_ids_are_ulids() {
        let id = Ulid::new();
        let public_id = id.to_string();
        assert_eq!(public_id.len(), 26);
        assert_eq!(Ulid::from_string(&public_id).unwrap(), id);
    }
}
