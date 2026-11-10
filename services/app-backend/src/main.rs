use std::{env, net::SocketAddr, path::Path as FsPath};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Json, Multipart, Path, State},
    http::{
        header::{AUTHORIZATION, CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_TYPE},
        HeaderMap, HeaderValue, Request, StatusCode,
    },
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, patch, post, put},
    Router,
};
use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
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
mod admin_permissions;
mod applications;
mod auth;
mod employee_directory;
mod jobs;

use admin_accounts::*;
use admin_applications::*;
use admin_permissions::*;
use applications::*;
use auth::*;
use employee_directory::*;
use jobs::*;

#[derive(Clone)]
struct AppState {
    pool: PgPool,
}

const MAX_APPLICATION_FILE_BYTES: usize = 5 * 1024 * 1024;
const MAX_APPLICATION_DOCUMENTS: usize = 5;
const MAX_APPLICATION_BODY_BYTES: usize = 32 * 1024 * 1024;
const MAX_APPLICATION_STATUS_REASON_CHARS: usize = 1000;
const MAX_PROFILE_PHOTO_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug)]
enum ApiError {
    BadRequest(&'static str),
    Unauthorized,
    Forbidden,
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
            Self::Forbidden => (StatusCode::FORBIDDEN, "Akses tidak diizinkan."),
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
    let mut response = next.run(request).await;
    set_api_no_store(&mut response);
    response
}

#[derive(Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct AdminLoginRequest {
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct RegisterRequest {
    name: String,
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct ProfileUpdateRequest {
    name: String,
}

#[derive(Deserialize)]
struct ChangePasswordRequest {
    current_password: String,
    new_password: String,
}

#[derive(Deserialize)]
struct ForgotPasswordRequest {
    email: String,
}

#[derive(Deserialize)]
struct ResetPasswordRequest {
    token: String,
    new_password: String,
}

#[derive(Serialize)]
struct AccountProfileResponse {
    role: String,
    name: String,
    email: String,
}

struct AccountIdentity {
    id: i64,
    role: &'static str,
    token_hash: String,
}

struct MailSettings {
    host: String,
    port: u16,
    username: String,
    password: String,
    from: String,
    public_url: String,
}

#[derive(Deserialize)]
struct AdminApplicantCreateRequest {
    name: String,
    email: String,
    password: String,
}

#[derive(Deserialize)]
struct AdminApplicantUpdateRequest {
    name: String,
    email: String,
    password: Option<String>,
}

#[derive(Deserialize)]
struct ApplicantAccountStatusRequest {
    is_active: bool,
}

#[derive(Deserialize)]
struct AdminAccountCreateRequest {
    name: String,
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
}

#[derive(Serialize)]
struct AuthResponse {
    token: String,
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
    token: String,
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
    password_hash: String,
}

#[derive(FromRow)]
struct AdminRecord {
    id: i64,
    name: String,
    email: String,
    password_hash: String,
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

    fn require_any_permission(&self, permissions: &[&str]) -> Result<(), ApiError> {
        if permissions
            .iter()
            .any(|permission| self.has_permission(permission))
        {
            Ok(())
        } else {
            Err(ApiError::Forbidden)
        }
    }
}

struct ApplicationSubmissionFields {
    job_id: String,
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
    job_id: String,
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
    job_id: String,
    job_title: String,
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
    created_at: String,
    applications_count: i64,
    is_active: bool,
}

#[derive(FromRow, Serialize)]
struct ManagedAdminAccount {
    id: i64,
    name: String,
    email: String,
    created_at: String,
    is_active: bool,
    admin_role: String,
    division_id: Option<i64>,
    department_id: Option<i64>,
    bureau_id: Option<i64>,
    scope_label: String,
    permissions: Vec<String>,
}

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

#[derive(FromRow, Serialize)]
struct JobTypeRecord {
    id: i64,
    name: String,
    job_count: i64,
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
}

#[derive(FromRow, Serialize)]
struct PublicBureauRecord {
    id: i64,
    department_id: i64,
    name: String,
    unit_type: String,
}

#[derive(Serialize)]
struct PublicOrganizationResponse {
    divisions: Vec<PublicDivisionRecord>,
    departments: Vec<PublicDepartmentRecord>,
    bureaus: Vec<PublicBureauRecord>,
}

#[derive(Deserialize)]
struct CreateAdminJobRequest {
    id: String,
    #[serde(flatten)]
    fields: AdminJobFields,
}

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
    job_id: String,
    job_title: String,
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
    job_id: String,
    job_title: String,
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
    positions_total: i64,
    positions_draft: i64,
    positions_open: i64,
    positions_closed: i64,
    applications_total: i64,
    applications_submitted: i64,
    applications_screening: i64,
    applications_interview: i64,
    applications_accepted: i64,
    applications_rejected: i64,
}

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
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .connect(&database_url)
        .await?;
    sqlx::migrate!("./migrations").run(&pool).await?;
    ensure_application_public_ids(&pool).await?;
    seed_admin(&pool).await?;

    let app = Router::new()
        .route("/api/register", post(register))
        .route("/api/login", post(login))
        .route("/api/logout", post(logout))
        .route("/api/password/forgot", post(forgot_password))
        .route("/api/password/reset", post(reset_password))
        .route(
            "/api/account/profile",
            get(get_account_profile).patch(update_account_profile),
        )
        .route(
            "/api/account/avatar",
            get(download_account_avatar)
                .post(upload_account_avatar)
                .delete(delete_account_avatar)
                .layer(DefaultBodyLimit::max(MAX_PROFILE_PHOTO_BYTES + 64 * 1024)),
        )
        .route("/api/account/password", post(change_account_password))
        .route("/api/jobs", get(list_jobs))
        .route("/api/organization", get(public_list_organization))
        .route("/api/admin/login", post(admin_login))
        .route("/api/admin/logout", post(admin_logout))
        .route("/api/admin/dashboard", get(admin_dashboard))
        .route(
            "/api/admin/accounts",
            get(admin_list_accounts).post(admin_create_account),
        )
        .route(
            "/api/admin/accounts/{id}",
            put(admin_update_account).delete(admin_deactivate_account),
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
        .route(
            "/api/admin/employees",
            get(admin_list_employees).post(admin_create_employee),
        )
        .route("/api/admin/employees/{id}", put(admin_update_employee))
        .route(
            "/api/admin/employees/{id}/status",
            patch(admin_set_employee_status),
        )
        .route(
            "/api/admin/job-types",
            get(admin_list_job_types).post(admin_create_job_type),
        )
        .route(
            "/api/admin/job-types/{id}",
            put(admin_update_job_type).delete(admin_delete_job_type),
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
        .route(
            "/api/admin/jobs",
            get(admin_list_jobs).post(admin_create_job),
        )
        .route(
            "/api/admin/jobs/{id}",
            put(admin_update_job).delete(admin_delete_job),
        )
        .route("/api/admin/jobs/{id}/status", patch(admin_set_job_status))
        .route("/api/admin/applications", get(admin_list_applications))
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
        .route("/api/notifications", get(list_applicant_notifications))
        .route(
            "/api/notifications/{id}/read",
            patch(mark_applicant_notification_read),
        )
        .route_layer(middleware::from_fn(prevent_api_caching))
        .fallback_service(ServeDir::new("public").fallback(ServeFile::new("public/spa/index.html")))
        .layer(TraceLayer::new_for_http())
        .with_state(AppState { pool });

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
    let bearer = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or(ApiError::Unauthorized)?;
    let token_hash = hash_token(bearer);
    let applicant_id: Option<i64> = sqlx::query_scalar(
        "SELECT applicant_tokens.applicant_id FROM applicant_tokens JOIN applicants ON applicants.id = applicant_tokens.applicant_id WHERE applicant_tokens.token_hash = $1 AND applicant_tokens.expires_at > NOW() AND applicants.is_active = TRUE",
    )
    .bind(&token_hash)
    .fetch_optional(pool)
    .await
    .map_err(internal_error)?;
    applicant_id
        .map(|applicant_id| (applicant_id, token_hash))
        .ok_or(ApiError::Unauthorized)
}

async fn authorized_admin_context(
    pool: &PgPool,
    headers: &HeaderMap,
) -> Result<AdminContext, ApiError> {
    let bearer = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or(ApiError::Unauthorized)?;
    let token_hash = hash_token(bearer);
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
    let bearer = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or(ApiError::Unauthorized)?;
    let token_hash = hash_token(bearer);
    let identity = sqlx::query_as::<_, (String, i64)>(
        "SELECT account_type, account_id FROM (SELECT 'applicant'::text AS account_type, applicants.id AS account_id FROM applicant_tokens JOIN applicants ON applicants.id = applicant_tokens.applicant_id WHERE applicant_tokens.token_hash = $1 AND applicant_tokens.expires_at > NOW() AND applicants.is_active = TRUE UNION ALL SELECT 'admin'::text AS account_type, admins.id AS account_id FROM admin_tokens JOIN admins ON admins.id = admin_tokens.admin_id WHERE admin_tokens.token_hash = $1 AND admin_tokens.expires_at > NOW() AND admins.is_active = TRUE) AS accounts LIMIT 1",
    )
    .bind(&token_hash)
    .fetch_optional(pool)
    .await
    .map_err(internal_error)?;
    let Some((role, id)) = identity else {
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

fn validate_applicant_account(name: &str, email: &str, password: &str) -> Result<(), ApiError> {
    validate_applicant_name_and_email(name, email)?;
    validate_applicant_password(password)
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
        || !password
            .chars()
            .any(|character| "._!@#$%^&*()-+=?".contains(character))
    {
        return Err(ApiError::BadRequest(
            "Kata sandi harus memuat huruf besar, huruf kecil, angka, dan simbol (contoh: . atau !).",
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
    error
        .as_database_error()
        .and_then(|database_error| database_error.code())
        .as_deref()
        == Some("23503")
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
    sqlx::query(
        "INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash",
    )
    .bind(name.trim())
    .bind(email)
    .bind(password_hash)
    .execute(pool)
    .await?;
    tracing::info!("Admin account created or refreshed from ADMIN_* configuration.");
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
        assert!(is_valid_application_status_transition(
            "submitted",
            "interview"
        ));
        assert!(is_valid_application_status_transition(
            "screening",
            "interview"
        ));
        assert!(is_valid_application_status_transition(
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
            "submitted",
            "accepted"
        ));
        assert!(!is_valid_application_status_transition(
            "submitted",
            "rejected"
        ));
        assert!(!is_valid_application_status_transition(
            "interview",
            "screening"
        ));
        assert!(!is_valid_application_status_transition(
            "accepted", "rejected"
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
    fn account_password_length_matches_role() {
        assert!(validate_account_password("applicant", "Abcdef1!").is_ok());
        assert!(validate_account_password("applicant", "Abcd1!").is_err());
        assert!(validate_account_password("admin", "Abcdef1!").is_ok());
        assert!(validate_account_password("admin", "abcdef1!").is_err());
        assert!(validate_account_password("admin", "ABCDEF1!").is_err());
        assert!(validate_account_password("admin", "Abcdefg!").is_err());
        assert!(validate_account_password("admin", "Abcdefg1").is_err());
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
