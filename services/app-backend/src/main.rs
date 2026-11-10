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
        HeaderMap, StatusCode,
    },
    response::{IntoResponse, Response},
    routing::{delete, get, patch, post, put},
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

#[derive(Clone)]
struct AppState {
    pool: PgPool,
}

const MAX_APPLICATION_FILE_BYTES: usize = 5 * 1024 * 1024;
const MAX_APPLICATION_DOCUMENTS: usize = 5;
const MAX_APPLICATION_BODY_BYTES: usize = 32 * 1024 * 1024;

#[derive(Debug)]
enum ApiError {
    BadRequest(&'static str),
    Unauthorized,
    Conflict(&'static str),
    NotFound(&'static str),
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
            Self::Conflict(message) => (StatusCode::CONFLICT, message),
            Self::NotFound(message) => (StatusCode::NOT_FOUND, message),
            Self::Internal => (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Terjadi kesalahan pada server.",
            ),
        };
        (status, Json(json!({ "message": message }))).into_response()
    }
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
}

#[derive(Deserialize)]
struct AdminAccountUpdateRequest {
    name: String,
    email: String,
    password: Option<String>,
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
    job_id: String,
    status: String,
}

#[derive(Serialize)]
struct ApplicationsResponse {
    data: Vec<ApplicationSummary>,
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
}

#[derive(Deserialize)]
struct AdminJobFields {
    title: String,
    bureau_id: i64,
    location: String,
    quota: i16,
    posted: String,
    job_type: String,
    summary: String,
    skills: Vec<String>,
    responsibilities: Vec<String>,
    is_open: bool,
}

#[derive(Deserialize)]
struct OrganizationNameRequest {
    name: String,
}

#[derive(Deserialize)]
struct CreateDepartmentRequest {
    division_id: i64,
    name: String,
}

#[derive(Deserialize)]
struct CreateBureauRequest {
    department_id: i64,
    name: String,
}

#[derive(FromRow, Serialize)]
struct DivisionRecord {
    id: i64,
    name: String,
}

#[derive(FromRow, Serialize)]
struct DepartmentRecord {
    id: i64,
    division_id: i64,
    name: String,
}

#[derive(FromRow, Serialize)]
struct BureauRecord {
    id: i64,
    department_id: i64,
    name: String,
}

#[derive(Serialize)]
struct OrganizationResponse {
    divisions: Vec<DivisionRecord>,
    departments: Vec<DepartmentRecord>,
    bureaus: Vec<BureauRecord>,
}

#[derive(FromRow)]
struct BureauPath {
    division: String,
    department: String,
    unit: String,
}

#[derive(Deserialize)]
struct CreateAdminJobRequest {
    id: String,
    #[serde(flatten)]
    fields: AdminJobFields,
}

#[derive(Deserialize)]
struct JobOpenRequest {
    is_open: bool,
}

#[derive(Deserialize)]
struct ApplicationStatusRequest {
    status: String,
}

#[derive(FromRow, Serialize)]
struct AdminApplication {
    id: i64,
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
struct AdminDashboardMetrics {
    positions_total: i64,
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
struct PositionMapping {
    id: String,
    title: String,
    division: String,
    department: String,
    unit: String,
    quota: i16,
    is_open: bool,
}

#[derive(Serialize)]
struct PositionMappingsResponse {
    data: Vec<PositionMapping>,
}

#[derive(FromRow, Serialize)]
struct ApplicationAggregate {
    job_id: String,
    job_title: String,
    division: String,
    department: String,
    unit: String,
    application_count: i64,
    is_open: bool,
}

#[derive(Serialize)]
struct ApplicationAggregatesResponse {
    data: Vec<ApplicationAggregate>,
    total_applications: i64,
}

#[derive(FromRow, Serialize)]
struct Job {
    id: String,
    title: String,
    division: String,
    department: String,
    unit: String,
    bureau_id: i64,
    location: String,
    quota: i16,
    posted: String,
    #[serde(rename = "type")]
    job_type: String,
    summary: String,
    skills: SqlJson<Vec<String>>,
    responsibilities: SqlJson<Vec<String>>,
    is_open: bool,
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
    seed_admin(&pool).await?;

    let app = Router::new()
        .route("/api/register", post(register))
        .route("/api/login", post(login))
        .route("/api/logout", post(logout))
        .route("/api/jobs", get(list_jobs))
        .route("/api/monitoring/positions", get(monitor_positions))
        .route("/api/monitoring/applications", get(monitor_applications))
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
        .route("/api/admin/jobs/{id}", put(admin_update_job))
        .route("/api/admin/jobs/{id}/status", patch(admin_set_job_status))
        .route("/api/admin/applications", get(admin_list_applications))
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

async fn register(
    State(state): State<AppState>,
    Json(credentials): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let name = credentials.name.trim();
    let email = credentials.email.trim().to_ascii_lowercase();
    if name.is_empty() || name.len() > 200 {
        return Err(ApiError::BadRequest(
            "Nama wajib diisi dan maksimal 200 karakter.",
        ));
    }
    if !is_valid_email(&email) {
        return Err(ApiError::BadRequest("Format email tidak valid."));
    }
    if !(8..=128).contains(&credentials.password.len()) {
        return Err(ApiError::BadRequest(
            "Kata sandi harus terdiri dari 8 sampai 128 karakter.",
        ));
    }

    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(credentials.password.as_bytes(), &salt)
        .map_err(internal_error)?
        .to_string();
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let applicant = match sqlx::query_as::<_, ApplicantRecord>(
        "INSERT INTO applicants (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, password_hash",
    )
    .bind(name)
    .bind(&email)
    .bind(password_hash)
    .fetch_one(&mut *transaction)
    .await
    {
        Ok(applicant) => applicant,
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Email sudah terdaftar."));
        }
        Err(error) => return Err(internal_error(error)),
    };

    let (token, token_hash) = create_token();
    sqlx::query(
        "INSERT INTO applicant_tokens (token_hash, applicant_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')",
    )
    .bind(token_hash)
    .bind(applicant.id)
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;

    Ok(Json(AuthResponse {
        token,
        role: "applicant".to_owned(),
        applicant: Applicant {
            name: applicant.name,
            email: applicant.email,
        },
    }))
}

async fn login(
    State(state): State<AppState>,
    Json(credentials): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, ApiError> {
    let email = credentials.email.trim().to_ascii_lowercase();
    if !is_valid_email(&email) || credentials.password.is_empty() {
        return Err(ApiError::BadRequest("Email dan kata sandi tidak sesuai."));
    }

    let applicant = sqlx::query_as::<_, ApplicantRecord>(
        "SELECT id, name, email, password_hash FROM applicants WHERE email = $1 AND is_active = TRUE",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;

    if let Some(applicant) = applicant {
        let password_hash = PasswordHash::new(&applicant.password_hash).map_err(internal_error)?;
        if Argon2::default()
            .verify_password(credentials.password.as_bytes(), &password_hash)
            .is_ok()
        {
            let (token, token_hash) = create_token();
            sqlx::query(
                "INSERT INTO applicant_tokens (token_hash, applicant_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')",
            )
            .bind(token_hash)
            .bind(applicant.id)
            .execute(&state.pool)
            .await
            .map_err(internal_error)?;

            return Ok(Json(LoginResponse::Applicant(AuthResponse {
                token,
                role: "applicant".to_owned(),
                applicant: Applicant {
                    name: applicant.name,
                    email: applicant.email,
                },
            })));
        }
    }

    let admin = sqlx::query_as::<_, AdminRecord>(
        "SELECT id, name, email, password_hash FROM admins WHERE email = $1 AND is_active = TRUE",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;
    let Some(admin) = admin else {
        return Err(ApiError::BadRequest("Email atau kata sandi tidak sesuai."));
    };
    let password_hash = PasswordHash::new(&admin.password_hash).map_err(internal_error)?;
    if Argon2::default()
        .verify_password(credentials.password.as_bytes(), &password_hash)
        .is_err()
    {
        return Err(ApiError::BadRequest("Email atau kata sandi tidak sesuai."));
    }

    let (token, token_hash) = create_token();
    sqlx::query(
        "INSERT INTO admin_tokens (token_hash, admin_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '8 hours')",
    )
    .bind(token_hash)
    .bind(admin.id)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;

    Ok(Json(LoginResponse::Admin(AdminAuthResponse {
        token,
        role: "admin".to_owned(),
        admin: Admin {
            id: admin.id,
            name: admin.name,
            email: admin.email,
        },
    })))
}

async fn admin_login(
    State(state): State<AppState>,
    Json(credentials): Json<AdminLoginRequest>,
) -> Result<Json<AdminAuthResponse>, ApiError> {
    let email = credentials.email.trim().to_ascii_lowercase();
    if !is_valid_email(&email) || credentials.password.is_empty() {
        return Err(ApiError::BadRequest(
            "Email admin dan kata sandi tidak sesuai.",
        ));
    }

    let admin = sqlx::query_as::<_, AdminRecord>(
        "SELECT id, name, email, password_hash FROM admins WHERE email = $1 AND is_active = TRUE",
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
    let password_hash = PasswordHash::new(&admin.password_hash).map_err(internal_error)?;
    if Argon2::default()
        .verify_password(credentials.password.as_bytes(), &password_hash)
        .is_err()
    {
        return Err(ApiError::BadRequest(
            "Email atau kata sandi admin tidak sesuai.",
        ));
    }

    let (token, token_hash) = create_token();
    sqlx::query(
        "INSERT INTO admin_tokens (token_hash, admin_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '8 hours')",
    )
    .bind(token_hash)
    .bind(admin.id)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;

    Ok(Json(AdminAuthResponse {
        token,
        role: "admin".to_owned(),
        admin: Admin {
            id: admin.id,
            name: admin.name,
            email: admin.email,
        },
    }))
}

async fn admin_logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let (_, token_hash) = authorized_admin(&state.pool, &headers).await?;
    sqlx::query("DELETE FROM admin_tokens WHERE token_hash = $1")
        .bind(token_hash)
        .execute(&state.pool)
        .await
        .map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Berhasil keluar dari dashboard admin." }),
    ))
}

async fn logout(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let (_, token_hash) = authorized_applicant(&state.pool, &headers).await?;
    sqlx::query("DELETE FROM applicant_tokens WHERE token_hash = $1")
        .bind(token_hash)
        .execute(&state.pool)
        .await
        .map_err(internal_error)?;
    Ok(Json(json!({ "message": "Berhasil keluar." })))
}

async fn list_jobs(State(state): State<AppState>) -> Result<Json<JobsResponse>, ApiError> {
    let data = sqlx::query_as::<_, Job>(
        "SELECT id, title, division, department, unit, bureau_id, location, quota, posted, job_type, summary, skills, responsibilities, is_open FROM job_postings WHERE is_open = TRUE ORDER BY id",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(JobsResponse { data }))
}

async fn admin_list_jobs(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<JobsResponse>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, Job>(
        "SELECT id, title, division, department, unit, bureau_id, location, quota, posted, job_type, summary, skills, responsibilities, is_open FROM job_postings ORDER BY id",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(JobsResponse { data }))
}

async fn admin_create_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateAdminJobRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let id = request.id.trim();
    let fields = request.fields;
    validate_admin_job(id, &fields)?;
    let organization = resolve_bureau_path(&state.pool, fields.bureau_id).await?;
    let result = sqlx::query(
        "INSERT INTO job_postings (id, title, division, department, unit, bureau_id, location, quota, posted, job_type, summary, skills, responsibilities, is_open) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)",
    )
    .bind(id)
    .bind(fields.title.trim())
    .bind(organization.division)
    .bind(organization.department)
    .bind(organization.unit)
    .bind(fields.bureau_id)
    .bind(fields.location.trim())
    .bind(fields.quota)
    .bind(fields.posted.trim())
    .bind(fields.job_type.trim())
    .bind(fields.summary.trim())
    .bind(SqlJson(fields.skills))
    .bind(SqlJson(fields.responsibilities))
    .bind(fields.is_open)
    .execute(&state.pool)
    .await;

    match result {
        Ok(_) => Ok(Json(json!({ "message": "Lowongan berhasil dibuat." }))),
        Err(error) if is_unique_violation(&error) => {
            Err(ApiError::Conflict("Kode posisi sudah digunakan."))
        }
        Err(error) => Err(internal_error(error)),
    }
}

async fn admin_update_job(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(fields): Json<AdminJobFields>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    validate_admin_job(&id, &fields)?;
    let organization = resolve_bureau_path(&state.pool, fields.bureau_id).await?;
    let result = sqlx::query(
        "UPDATE job_postings SET title = $2, division = $3, department = $4, unit = $5, bureau_id = $6, location = $7, quota = $8, posted = $9, job_type = $10, summary = $11, skills = $12, responsibilities = $13, is_open = $14 WHERE id = $1",
    )
    .bind(&id)
    .bind(fields.title.trim())
    .bind(organization.division)
    .bind(organization.department)
    .bind(organization.unit)
    .bind(fields.bureau_id)
    .bind(fields.location.trim())
    .bind(fields.quota)
    .bind(fields.posted.trim())
    .bind(fields.job_type.trim())
    .bind(fields.summary.trim())
    .bind(SqlJson(fields.skills))
    .bind(SqlJson(fields.responsibilities))
    .bind(fields.is_open)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Lowongan tidak ditemukan."));
    }
    Ok(Json(json!({ "message": "Lowongan berhasil diperbarui." })))
}

async fn admin_set_job_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
    Json(request): Json<JobOpenRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let result = sqlx::query("UPDATE job_postings SET is_open = $2 WHERE id = $1")
        .bind(id)
        .bind(request.is_open)
        .execute(&state.pool)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Lowongan tidak ditemukan."));
    }
    Ok(Json(
        json!({ "message": "Status lowongan berhasil diperbarui." }),
    ))
}

async fn admin_dashboard(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AdminDashboardMetrics>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let metrics = sqlx::query_as::<_, AdminDashboardMetrics>(
        "SELECT (SELECT COUNT(*) FROM job_postings) AS positions_total, (SELECT COUNT(*) FROM job_postings WHERE is_open = TRUE) AS positions_open, (SELECT COUNT(*) FROM job_postings WHERE is_open = FALSE) AS positions_closed, (SELECT COUNT(*) FROM applications) AS applications_total, (SELECT COUNT(*) FROM applications WHERE status = 'submitted') AS applications_submitted, (SELECT COUNT(*) FROM applications WHERE status = 'screening') AS applications_screening, (SELECT COUNT(*) FROM applications WHERE status = 'interview') AS applications_interview, (SELECT COUNT(*) FROM applications WHERE status = 'accepted') AS applications_accepted, (SELECT COUNT(*) FROM applications WHERE status = 'rejected') AS applications_rejected",
    )
    .fetch_one(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(metrics))
}

async fn admin_list_accounts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, AdminApplicantAccount>(
        "SELECT applicants.id, applicants.name, applicants.email, applicants.created_at::text AS created_at, COUNT(applications.id)::BIGINT AS applications_count, applicants.is_active FROM applicants LEFT JOIN applications ON applications.applicant_id = applicants.id GROUP BY applicants.id ORDER BY applicants.created_at DESC, applicants.id DESC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(json!({ "data": data })))
}

async fn admin_create_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(account): Json<AdminApplicantCreateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let name = account.name.trim();
    let email = account.email.trim().to_ascii_lowercase();
    validate_applicant_account(name, &email, &account.password)?;

    let password_hash = hash_password(&account.password)?;
    match sqlx::query("INSERT INTO applicants (name, email, password_hash) VALUES ($1, $2, $3)")
        .bind(name)
        .bind(email)
        .bind(password_hash)
        .execute(&state.pool)
        .await
    {
        Ok(_) => Ok(Json(json!({ "message": "Akun berhasil ditambahkan." }))),
        Err(error) if is_unique_violation(&error) => {
            Err(ApiError::Conflict("Email sudah terdaftar."))
        }
        Err(error) => Err(internal_error(error)),
    }
}

async fn admin_update_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(account): Json<AdminApplicantUpdateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let name = account.name.trim();
    let email = account.email.trim().to_ascii_lowercase();
    validate_applicant_name_and_email(name, &email)?;
    if let Some(password) = account.password.as_deref() {
        validate_applicant_password(password)?;
    }

    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = if let Some(password) = account.password.as_deref() {
        let password_hash = hash_password(password)?;
        sqlx::query("UPDATE applicants SET name = $1, email = $2, password_hash = $3 WHERE id = $4")
            .bind(name)
            .bind(email)
            .bind(password_hash)
            .bind(id)
            .execute(&mut *transaction)
            .await
    } else {
        sqlx::query("UPDATE applicants SET name = $1, email = $2 WHERE id = $3")
            .bind(name)
            .bind(email)
            .bind(id)
            .execute(&mut *transaction)
            .await
    };
    let result = match result {
        Ok(result) => result,
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Email sudah digunakan akun lain."));
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
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Akun berhasil diperbarui. Sesi aktif akun tersebut telah diakhiri." }),
    ))
}

async fn admin_deactivate_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    set_applicant_account_status(&state.pool, &headers, id, false).await?;
    Ok(Json(
        json!({ "message": "Akun dinonaktifkan; riwayat lamaran dan dokumen tetap tersimpan." }),
    ))
}

async fn admin_set_account_status(
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
    authorized_admin(pool, headers).await?;
    let mut transaction = pool.begin().await.map_err(internal_error)?;
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
    transaction.commit().await.map_err(internal_error)?;
    Ok(())
}

async fn admin_list_admin_accounts(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, ManagedAdminAccount>(
        "SELECT id, name, email, created_at::text AS created_at, is_active FROM admins ORDER BY created_at DESC, id DESC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(json!({ "data": data })))
}

async fn admin_create_admin_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(account): Json<AdminAccountCreateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let name = account.name.trim();
    let email = account.email.trim().to_ascii_lowercase();
    validate_admin_account(name, &email, &account.password)?;
    let password_hash = hash_password(&account.password)?;

    match sqlx::query("INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)")
        .bind(name)
        .bind(email)
        .bind(password_hash)
        .execute(&state.pool)
        .await
    {
        Ok(_) => Ok(Json(
            json!({ "message": "Akun admin berhasil ditambahkan." }),
        )),
        Err(error) if is_unique_violation(&error) => {
            Err(ApiError::Conflict("Email sudah terdaftar."))
        }
        Err(error) => Err(internal_error(error)),
    }
}

async fn admin_update_admin_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(account): Json<AdminAccountUpdateRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let (current_admin_id, _) = authorized_admin(&state.pool, &headers).await?;
    if current_admin_id == id {
        return Err(ApiError::Conflict(
            "Akun admin yang sedang digunakan tidak dapat diubah dari halaman ini.",
        ));
    }
    let name = account.name.trim();
    let email = account.email.trim().to_ascii_lowercase();
    validate_applicant_name_and_email(name, &email)?;
    if let Some(password) = account.password.as_deref() {
        validate_admin_password(password)?;
    }

    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = if let Some(password) = account.password.as_deref() {
        let password_hash = hash_password(password)?;
        sqlx::query("UPDATE admins SET name = $1, email = $2, password_hash = $3 WHERE id = $4")
            .bind(name)
            .bind(email)
            .bind(password_hash)
            .bind(id)
            .execute(&mut *transaction)
            .await
    } else {
        sqlx::query("UPDATE admins SET name = $1, email = $2 WHERE id = $3")
            .bind(name)
            .bind(email)
            .bind(id)
            .execute(&mut *transaction)
            .await
    };
    let result = match result {
        Ok(result) => result,
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Email sudah digunakan akun lain."));
        }
        Err(error) => return Err(internal_error(error)),
    };
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Akun admin tidak ditemukan."));
    }
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

async fn admin_deactivate_admin_account(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    set_admin_account_status(&state.pool, &headers, id, false).await?;
    Ok(Json(
        json!({ "message": "Akun admin dinonaktifkan dan seluruh sesinya diakhiri." }),
    ))
}

async fn admin_set_admin_account_status(
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
    let (current_admin_id, _) = authorized_admin(pool, headers).await?;
    if !is_active && current_admin_id == id {
        return Err(ApiError::Conflict(
            "Anda tidak dapat menonaktifkan akun admin yang sedang digunakan.",
        ));
    }
    let mut transaction = pool.begin().await.map_err(internal_error)?;
    let active_admin_ids = sqlx::query_scalar::<_, i64>(
        "SELECT id FROM admins WHERE is_active = TRUE ORDER BY id FOR UPDATE",
    )
    .fetch_all(&mut *transaction)
    .await
    .map_err(internal_error)?;
    let account_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM admins WHERE id = $1)")
            .bind(id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(internal_error)?;
    if !account_exists {
        return Err(ApiError::NotFound("Akun admin tidak ditemukan."));
    }
    if !is_active && active_admin_ids.contains(&id) && active_admin_ids.len() <= 1 {
        return Err(ApiError::Conflict(
            "Admin aktif terakhir tidak dapat dinonaktifkan.",
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
    transaction.commit().await.map_err(internal_error)?;
    Ok(())
}

async fn admin_list_applications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AdminApplicationsResponse>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, AdminApplication>(
        "SELECT applications.id, COALESCE(applications.applicant_full_name, applicants.name) AS applicant_name, applicants.email AS applicant_email, job_postings.id AS job_id, job_postings.title AS job_title, applications.employee_number, applications.origin_division, applications.origin_unit, applications.education_level, applications.study_field, applications.phone_number, applications.current_position, applications.current_unit, applications.motivation, applications.status, applications.created_at::text AS created_at FROM applications JOIN applicants ON applicants.id = applications.applicant_id JOIN job_postings ON job_postings.id = applications.job_id ORDER BY applications.created_at DESC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(AdminApplicationsResponse { data }))
}

async fn admin_get_application(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<AdminApplicationDetail>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let application = sqlx::query_as::<_, AdminApplication>(
        "SELECT applications.id, COALESCE(applications.applicant_full_name, applicants.name) AS applicant_name, applicants.email AS applicant_email, job_postings.id AS job_id, job_postings.title AS job_title, applications.employee_number, applications.origin_division, applications.origin_unit, applications.education_level, applications.study_field, applications.phone_number, applications.current_position, applications.current_unit, applications.motivation, applications.status, applications.created_at::text AS created_at FROM applications JOIN applicants ON applicants.id = applications.applicant_id JOIN job_postings ON job_postings.id = applications.job_id WHERE applications.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;
    let Some(application) = application else {
        return Err(ApiError::NotFound("Lamaran tidak ditemukan."));
    };
    let documents = sqlx::query_as::<_, ApplicationDocumentSummary>(
        "SELECT id, document_type, file_name, file_size FROM application_documents WHERE application_id = $1 ORDER BY created_at, id",
    )
    .bind(id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(AdminApplicationDetail {
        application,
        documents,
    }))
}

async fn admin_download_application_document(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((application_id, document_id)): Path<(i64, i64)>,
) -> Result<Response, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
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
            format!("attachment; filename=\"application-{application_id}-{document_label}.pdf\""),
        )
        .header("x-content-type-options", "nosniff")
        .body(Body::from(document.content))
        .map_err(internal_error)
}

async fn admin_set_application_status(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<ApplicationStatusRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let status = request.status.trim().to_ascii_lowercase();
    if !matches!(
        status.as_str(),
        "submitted" | "screening" | "interview" | "accepted" | "rejected"
    ) {
        return Err(ApiError::BadRequest("Status lamaran tidak valid."));
    }
    let result = sqlx::query("UPDATE applications SET status = $2 WHERE id = $1")
        .bind(id)
        .bind(status)
        .execute(&state.pool)
        .await
        .map_err(internal_error)?;
    if result.rows_affected() == 0 {
        return Err(ApiError::NotFound("Lamaran tidak ditemukan."));
    }
    Ok(Json(
        json!({ "message": "Status lamaran berhasil diperbarui." }),
    ))
}

async fn admin_list_organization(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<OrganizationResponse>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let divisions =
        sqlx::query_as::<_, DivisionRecord>("SELECT id, name FROM divisions ORDER BY name")
            .fetch_all(&state.pool)
            .await
            .map_err(internal_error)?;
    let departments = sqlx::query_as::<_, DepartmentRecord>(
        "SELECT id, division_id, name FROM departments ORDER BY name",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let bureaus = sqlx::query_as::<_, BureauRecord>(
        "SELECT id, department_id, name FROM bureaus ORDER BY name",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(OrganizationResponse {
        divisions,
        departments,
        bureaus,
    }))
}

async fn admin_create_division(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<OrganizationNameRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    match sqlx::query("INSERT INTO divisions (name) VALUES ($1)")
        .bind(name)
        .execute(&state.pool)
        .await
    {
        Ok(_) => Ok(Json(json!({ "message": "Divisi berhasil ditambahkan." }))),
        Err(error) if is_unique_violation(&error) => {
            Err(ApiError::Conflict("Nama divisi sudah digunakan."))
        }
        Err(error) => Err(internal_error(error)),
    }
}

async fn admin_update_division(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<OrganizationNameRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query("UPDATE divisions SET name = $2 WHERE id = $1")
        .bind(id)
        .bind(&name)
        .execute(&mut *transaction)
        .await;
    match result {
        Ok(result) if result.rows_affected() == 0 => {
            return Err(ApiError::NotFound("Divisi tidak ditemukan."));
        }
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Nama divisi sudah digunakan."));
        }
        Err(error) => return Err(internal_error(error)),
    }
    sqlx::query(
        "UPDATE job_postings SET division = $2 WHERE bureau_id IN (SELECT bureaus.id FROM bureaus JOIN departments ON departments.id = bureaus.department_id WHERE departments.division_id = $1)",
    )
    .bind(id)
    .bind(name)
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Divisi berhasil diperbarui." })))
}

async fn admin_delete_division(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    match sqlx::query("DELETE FROM divisions WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
    {
        Ok(result) if result.rows_affected() == 0 => {
            Err(ApiError::NotFound("Divisi tidak ditemukan."))
        }
        Ok(_) => Ok(Json(json!({ "message": "Divisi berhasil dihapus." }))),
        Err(error) if is_foreign_key_violation(&error) => Err(ApiError::Conflict(
            "Divisi masih memiliki departemen. Hapus departemen terkait terlebih dahulu.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

async fn admin_create_department(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateDepartmentRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let division_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM divisions WHERE id = $1)")
            .bind(request.division_id)
            .fetch_one(&state.pool)
            .await
            .map_err(internal_error)?;
    if !division_exists {
        return Err(ApiError::BadRequest("Divisi yang dipilih tidak ditemukan."));
    }
    match sqlx::query("INSERT INTO departments (division_id, name) VALUES ($1, $2)")
        .bind(request.division_id)
        .bind(name)
        .execute(&state.pool)
        .await
    {
        Ok(_) => Ok(Json(
            json!({ "message": "Departemen berhasil ditambahkan." }),
        )),
        Err(error) if is_unique_violation(&error) => Err(ApiError::Conflict(
            "Nama departemen sudah ada di divisi ini.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

async fn admin_update_department(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<OrganizationNameRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query("UPDATE departments SET name = $2 WHERE id = $1")
        .bind(id)
        .bind(&name)
        .execute(&mut *transaction)
        .await;
    match result {
        Ok(result) if result.rows_affected() == 0 => {
            return Err(ApiError::NotFound("Departemen tidak ditemukan."));
        }
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict(
                "Nama departemen sudah ada di divisi ini.",
            ));
        }
        Err(error) => return Err(internal_error(error)),
    }
    sqlx::query(
        "UPDATE job_postings SET department = $2 WHERE bureau_id IN (SELECT id FROM bureaus WHERE department_id = $1)",
    )
    .bind(id)
    .bind(name)
    .execute(&mut *transaction)
    .await
    .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(
        json!({ "message": "Departemen berhasil diperbarui." }),
    ))
}

async fn admin_delete_department(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    match sqlx::query("DELETE FROM departments WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
    {
        Ok(result) if result.rows_affected() == 0 => {
            Err(ApiError::NotFound("Departemen tidak ditemukan."))
        }
        Ok(_) => Ok(Json(json!({ "message": "Departemen berhasil dihapus." }))),
        Err(error) if is_foreign_key_violation(&error) => Err(ApiError::Conflict(
            "Departemen masih memiliki biro. Hapus biro terkait terlebih dahulu.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

async fn admin_create_bureau(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<CreateBureauRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let department_exists: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM departments WHERE id = $1)")
            .bind(request.department_id)
            .fetch_one(&state.pool)
            .await
            .map_err(internal_error)?;
    if !department_exists {
        return Err(ApiError::BadRequest(
            "Departemen yang dipilih tidak ditemukan.",
        ));
    }
    match sqlx::query("INSERT INTO bureaus (department_id, name) VALUES ($1, $2)")
        .bind(request.department_id)
        .bind(name)
        .execute(&state.pool)
        .await
    {
        Ok(_) => Ok(Json(json!({ "message": "Biro berhasil ditambahkan." }))),
        Err(error) if is_unique_violation(&error) => {
            Err(ApiError::Conflict("Nama biro sudah ada di departemen ini."))
        }
        Err(error) => Err(internal_error(error)),
    }
}

async fn admin_update_bureau(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
    Json(request): Json<OrganizationNameRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let name = validate_organization_name(&request.name)?;
    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let result = sqlx::query("UPDATE bureaus SET name = $2 WHERE id = $1")
        .bind(id)
        .bind(&name)
        .execute(&mut *transaction)
        .await;
    match result {
        Ok(result) if result.rows_affected() == 0 => {
            return Err(ApiError::NotFound("Biro tidak ditemukan."));
        }
        Ok(_) => {}
        Err(error) if is_unique_violation(&error) => {
            return Err(ApiError::Conflict("Nama biro sudah ada di departemen ini."));
        }
        Err(error) => return Err(internal_error(error)),
    }
    sqlx::query("UPDATE job_postings SET unit = $2 WHERE bureau_id = $1")
        .bind(id)
        .bind(name)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Biro berhasil diperbarui." })))
}

async fn admin_delete_bureau(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<i64>,
) -> Result<Json<serde_json::Value>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    match sqlx::query("DELETE FROM bureaus WHERE id = $1")
        .bind(id)
        .execute(&state.pool)
        .await
    {
        Ok(result) if result.rows_affected() == 0 => {
            Err(ApiError::NotFound("Biro tidak ditemukan."))
        }
        Ok(_) => Ok(Json(json!({ "message": "Biro berhasil dihapus." }))),
        Err(error) if is_foreign_key_violation(&error) => Err(ApiError::Conflict(
            "Biro masih digunakan oleh lowongan. Ubah biro pada lowongan terkait terlebih dahulu.",
        )),
        Err(error) => Err(internal_error(error)),
    }
}

async fn resolve_bureau_path(pool: &PgPool, bureau_id: i64) -> Result<BureauPath, ApiError> {
    sqlx::query_as::<_, BureauPath>(
        "SELECT divisions.name AS division, departments.name AS department, bureaus.name AS unit FROM bureaus JOIN departments ON departments.id = bureaus.department_id JOIN divisions ON divisions.id = departments.division_id WHERE bureaus.id = $1",
    )
    .bind(bureau_id)
    .fetch_optional(pool)
    .await
    .map_err(internal_error)?
    .ok_or(ApiError::BadRequest("Biro yang dipilih tidak ditemukan."))
}

fn validate_organization_name(name: &str) -> Result<String, ApiError> {
    let name = name.trim();
    if name.is_empty() || name.len() > 160 {
        return Err(ApiError::BadRequest(
            "Nama wajib diisi dan maksimal 160 karakter.",
        ));
    }
    Ok(name.to_owned())
}

fn validate_admin_job(id: &str, fields: &AdminJobFields) -> Result<(), ApiError> {
    if id.trim().is_empty() || id.len() > 64 {
        return Err(ApiError::BadRequest(
            "Kode posisi wajib diisi dan maksimal 64 karakter.",
        ));
    }
    if [
        fields.title.trim(),
        fields.location.trim(),
        fields.posted.trim(),
        fields.job_type.trim(),
        fields.summary.trim(),
    ]
    .iter()
    .any(|value| value.is_empty())
    {
        return Err(ApiError::BadRequest("Semua detail lowongan wajib diisi."));
    }
    if fields.quota < 0 {
        return Err(ApiError::BadRequest("Kuota tidak boleh negatif."));
    }
    if fields.skills.is_empty()
        || fields
            .skills
            .iter()
            .any(|specification| specification.trim().is_empty())
    {
        return Err(ApiError::BadRequest(
            "Setidaknya satu spesifikasi internal wajib diisi.",
        ));
    }
    if fields.responsibilities.is_empty()
        || fields
            .responsibilities
            .iter()
            .any(|responsibility| responsibility.trim().is_empty())
    {
        return Err(ApiError::BadRequest(
            "Setidaknya satu deskripsi tugas wajib diisi.",
        ));
    }
    if fields.bureau_id <= 0 {
        return Err(ApiError::BadRequest("Biro wajib dipilih."));
    }
    Ok(())
}

async fn monitor_positions(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<PositionMappingsResponse>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, PositionMapping>(
        "SELECT id, title, division, department, unit, quota, is_open FROM job_postings ORDER BY id",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(PositionMappingsResponse { data }))
}

async fn monitor_applications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApplicationAggregatesResponse>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, ApplicationAggregate>(
        "SELECT job_postings.id AS job_id, job_postings.title AS job_title, job_postings.division, job_postings.department, job_postings.unit, COUNT(applications.id) AS application_count, job_postings.is_open FROM job_postings LEFT JOIN applications ON applications.job_id = job_postings.id GROUP BY job_postings.id, job_postings.title, job_postings.division, job_postings.department, job_postings.unit, job_postings.is_open ORDER BY job_postings.id",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    let total_applications = data.iter().map(|row| row.application_count).sum();
    Ok(Json(ApplicationAggregatesResponse {
        data,
        total_applications,
    }))
}

async fn list_applications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<ApplicationsResponse>, ApiError> {
    let (applicant_id, _) = authorized_applicant(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, ApplicationSummary>(
        "SELECT job_id, status FROM applications WHERE applicant_id = $1 ORDER BY created_at DESC",
    )
    .bind(applicant_id)
    .fetch_all(&state.pool)
    .await
    .map_err(internal_error)?;
    Ok(Json(ApplicationsResponse { data }))
}

async fn parse_application_submission(
    mut multipart: Multipart,
) -> Result<
    (
        ApplicationSubmissionFields,
        Vec<UploadedApplicationDocument>,
    ),
    ApiError,
> {
    let mut job_id = None;
    let mut employee_number = None;
    let mut applicant_full_name = None;
    let mut origin_division = None;
    let mut origin_unit = None;
    let mut education_level = None;
    let mut study_field = None;
    let mut motivation = None;
    let mut documents: Vec<UploadedApplicationDocument> = Vec::new();

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| ApiError::BadRequest("Formulir lamaran tidak dapat dibaca."))?
    {
        let name = field
            .name()
            .ok_or(ApiError::BadRequest("Formulir lamaran tidak lengkap."))?
            .to_owned();
        match name.as_str() {
            "job_id" => set_application_text(&mut job_id, field).await?,
            "employee_number" => set_application_text(&mut employee_number, field).await?,
            "applicant_full_name" => set_application_text(&mut applicant_full_name, field).await?,
            "origin_division" => set_application_text(&mut origin_division, field).await?,
            "origin_unit" => set_application_text(&mut origin_unit, field).await?,
            "education_level" => set_application_text(&mut education_level, field).await?,
            "study_field" => set_application_text(&mut study_field, field).await?,
            "motivation" => set_application_text(&mut motivation, field).await?,
            "supporting_document" | "cv" | "cover_letter" | "certificate" => {
                let document_type = match name.as_str() {
                    "supporting_document" => "supporting_document",
                    "cv" => "cv",
                    "cover_letter" => "cover_letter",
                    "certificate" => "certificate",
                    _ => unreachable!(),
                };
                if documents.len() >= MAX_APPLICATION_DOCUMENTS {
                    return Err(ApiError::BadRequest(
                        "Maksimal 5 berkas pendukung dapat diunggah.",
                    ));
                }
                if document_type != "supporting_document"
                    && documents
                        .iter()
                        .any(|document| document.document_type == document_type)
                {
                    return Err(ApiError::BadRequest(
                        "Setiap jenis dokumen hanya dapat diunggah satu kali.",
                    ));
                }
                let file_name = field.file_name().unwrap_or_default().to_owned();
                let content_type = field.content_type().unwrap_or_default().to_owned();
                let content = field
                    .bytes()
                    .await
                    .map_err(|_| ApiError::BadRequest("Dokumen tidak dapat dibaca."))?;
                let file_name = validate_application_pdf(&file_name, &content_type, &content)?;
                documents.push(UploadedApplicationDocument {
                    document_type,
                    file_name,
                    content: content.to_vec(),
                });
            }
            _ => {
                return Err(ApiError::BadRequest(
                    "Formulir berisi kolom yang tidak dikenal.",
                ))
            }
        }
    }

    let fields = ApplicationSubmissionFields {
        job_id: job_id.unwrap_or_default().trim().to_owned(),
        employee_number: employee_number.unwrap_or_default().trim().to_owned(),
        applicant_full_name: applicant_full_name.unwrap_or_default().trim().to_owned(),
        origin_division: origin_division.unwrap_or_default().trim().to_owned(),
        origin_unit: origin_unit.unwrap_or_default().trim().to_owned(),
        education_level: education_level.unwrap_or_default().trim().to_owned(),
        study_field: study_field.unwrap_or_default().trim().to_owned(),
        motivation: motivation.unwrap_or_default().trim().to_owned(),
    };
    if fields.job_id.is_empty() || fields.job_id.len() > 64 {
        return Err(ApiError::BadRequest("Lowongan wajib dipilih."));
    }
    if fields.employee_number.is_empty()
        || fields.employee_number.len() > 40
        || fields.employee_number.chars().any(char::is_control)
    {
        return Err(ApiError::BadRequest(
            "NIP wajib diisi dan maksimal 40 karakter.",
        ));
    }
    if fields.applicant_full_name.is_empty() || fields.applicant_full_name.len() > 200 {
        return Err(ApiError::BadRequest(
            "Nama sesuai ID wajib diisi dan maksimal 200 karakter.",
        ));
    }
    if fields.origin_division.is_empty() || fields.origin_division.len() > 160 {
        return Err(ApiError::BadRequest(
            "Divisi asal wajib diisi dan maksimal 160 karakter.",
        ));
    }
    if fields.origin_unit.is_empty() || fields.origin_unit.len() > 160 {
        return Err(ApiError::BadRequest(
            "Departemen atau unit asal wajib diisi dan maksimal 160 karakter.",
        ));
    }
    if !matches!(
        fields.education_level.as_str(),
        "SMA/SMK" | "D1" | "D2" | "D3" | "D4/S1" | "S2" | "S3" | "Lainnya"
    ) {
        return Err(ApiError::BadRequest("Jenjang pendidikan wajib dipilih."));
    }
    if fields.study_field.is_empty() || fields.study_field.len() > 160 {
        return Err(ApiError::BadRequest(
            "Jurusan atau bidang studi wajib diisi dan maksimal 160 karakter.",
        ));
    }
    if fields.motivation.is_empty() || fields.motivation.len() > 3000 {
        return Err(ApiError::BadRequest(
            "Alasan melamar wajib diisi dan maksimal 3000 karakter.",
        ));
    }
    if documents.is_empty() {
        return Err(ApiError::BadRequest(
            "Setidaknya satu berkas PDF pendukung wajib diunggah.",
        ));
    }

    Ok((fields, documents))
}

async fn set_application_text(
    target: &mut Option<String>,
    field: axum::extract::multipart::Field<'_>,
) -> Result<(), ApiError> {
    if target.is_some() {
        return Err(ApiError::BadRequest(
            "Kolom formulir lamaran tidak boleh dikirim berulang.",
        ));
    }
    *target = Some(
        field
            .text()
            .await
            .map_err(|_| ApiError::BadRequest("Formulir lamaran tidak dapat dibaca."))?,
    );
    Ok(())
}

fn validate_application_pdf(
    file_name: &str,
    content_type: &str,
    content: &[u8],
) -> Result<String, ApiError> {
    if content.is_empty() || content.len() > MAX_APPLICATION_FILE_BYTES {
        return Err(ApiError::BadRequest(
            "Setiap dokumen harus berukuran maksimal 5 MB.",
        ));
    }
    if !content_type.is_empty()
        && !content_type.eq_ignore_ascii_case("application/pdf")
        && !content_type.eq_ignore_ascii_case("application/octet-stream")
    {
        return Err(ApiError::BadRequest("Dokumen harus berformat PDF."));
    }
    if !content.starts_with(b"%PDF-") {
        return Err(ApiError::BadRequest(
            "Isi dokumen bukan berkas PDF yang valid.",
        ));
    }
    let file_name = file_name
        .rsplit(|character| character == '/' || character == '\\')
        .next()
        .unwrap_or_default()
        .trim();
    if file_name.is_empty()
        || file_name.len() > 255
        || file_name.chars().any(char::is_control)
        || !file_name.to_ascii_lowercase().ends_with(".pdf")
    {
        return Err(ApiError::BadRequest("Nama berkas PDF tidak valid."));
    }
    Ok(file_name.to_owned())
}

async fn create_application(
    State(state): State<AppState>,
    headers: HeaderMap,
    multipart: Multipart,
) -> Result<Json<serde_json::Value>, ApiError> {
    let (applicant_id, _) = authorized_applicant(&state.pool, &headers).await?;
    let (fields, documents) = parse_application_submission(multipart).await?;

    let is_open: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM job_postings WHERE id = $1 AND is_open = TRUE)",
    )
    .bind(&fields.job_id)
    .fetch_one(&state.pool)
    .await
    .map_err(internal_error)?;
    if !is_open {
        return Err(ApiError::NotFound(
            "Lowongan tidak ditemukan atau sudah ditutup.",
        ));
    }

    let mut transaction = state.pool.begin().await.map_err(internal_error)?;
    let application_id = sqlx::query_scalar::<_, i64>(
        "INSERT INTO applications (applicant_id, job_id, employee_number, applicant_full_name, origin_division, origin_unit, education_level, study_field, motivation) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (applicant_id, job_id) DO NOTHING RETURNING id",
    )
    .bind(applicant_id)
    .bind(&fields.job_id)
    .bind(fields.employee_number)
    .bind(fields.applicant_full_name)
    .bind(fields.origin_division)
    .bind(fields.origin_unit)
    .bind(fields.education_level)
    .bind(fields.study_field)
    .bind(fields.motivation)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(internal_error)?;
    let Some(application_id) = application_id else {
        return Err(ApiError::Conflict("Anda sudah melamar posisi ini."));
    };

    for document in documents {
        let file_size = i32::try_from(document.content.len()).map_err(internal_error)?;
        sqlx::query(
            "INSERT INTO application_documents (application_id, document_type, file_name, content_type, file_size, content) VALUES ($1, $2, $3, 'application/pdf', $4, $5)",
        )
        .bind(application_id)
        .bind(document.document_type)
        .bind(document.file_name)
        .bind(file_size)
        .bind(document.content)
        .execute(&mut *transaction)
        .await
        .map_err(internal_error)?;
    }

    transaction.commit().await.map_err(internal_error)?;
    Ok(Json(json!({ "message": "Lamaran berhasil dikirim." })))
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

async fn authorized_admin(pool: &PgPool, headers: &HeaderMap) -> Result<(i64, String), ApiError> {
    let bearer = headers
        .get(AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.is_empty())
        .ok_or(ApiError::Unauthorized)?;
    let token_hash = hash_token(bearer);
    let admin_id: Option<i64> = sqlx::query_scalar(
        "SELECT admin_tokens.admin_id FROM admin_tokens JOIN admins ON admins.id = admin_tokens.admin_id WHERE admin_tokens.token_hash = $1 AND admin_tokens.expires_at > NOW() AND admins.is_active = TRUE",
    )
    .bind(&token_hash)
    .fetch_optional(pool)
    .await
    .map_err(internal_error)?;
    admin_id
        .map(|admin_id| (admin_id, token_hash))
        .ok_or(ApiError::Unauthorized)
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
    if !(8..=128).contains(&password.len()) {
        return Err(ApiError::BadRequest(
            "Kata sandi harus terdiri dari 8 sampai 128 karakter.",
        ));
    }
    Ok(())
}

fn validate_admin_account(name: &str, email: &str, password: &str) -> Result<(), ApiError> {
    validate_applicant_name_and_email(name, email)?;
    validate_admin_password(password)
}

fn validate_admin_password(password: &str) -> Result<(), ApiError> {
    if !(12..=128).contains(&password.len()) {
        return Err(ApiError::BadRequest(
            "Kata sandi admin harus terdiri dari 12 sampai 128 karakter.",
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
    if name.trim().len() > 200 || !is_valid_email(&email) || !(12..=128).contains(&password.len()) {
        return Err(
            "Admin bootstrap settings have an invalid name, email, or password length".into(),
        );
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
    use super::*;

    #[test]
    fn job_json_fields_are_returned_as_arrays() {
        let job = Job {
            id: "POS-2026-001".to_owned(),
            title: "Test role".to_owned(),
            division: "Test division".to_owned(),
            department: "Test department".to_owned(),
            unit: "Test unit".to_owned(),
            bureau_id: 1,
            location: "Test location".to_owned(),
            quota: 1,
            posted: "Hari ini".to_owned(),
            job_type: "Full-time".to_owned(),
            summary: "Test summary".to_owned(),
            skills: SqlJson(vec!["Test specification".to_owned()]),
            responsibilities: SqlJson(vec!["Task".to_owned()]),
            is_open: true,
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
            bureau_id: 1,
            location: "Test location".to_owned(),
            quota: 1,
            posted: "Hari ini".to_owned(),
            job_type: "Full-time".to_owned(),
            summary: "Test summary".to_owned(),
            skills: vec!["Internal experience".to_owned()],
            responsibilities: vec!["Test task".to_owned()],
            is_open: true,
        };
        assert!(validate_admin_job("POS-2026-001", &fields).is_ok());

        fields.skills = vec!["  ".to_owned()];
        assert!(validate_admin_job("POS-2026-001", &fields).is_err());

        fields.skills = vec!["Internal experience".to_owned()];
        fields.responsibilities.clear();
        assert!(validate_admin_job("POS-2026-001", &fields).is_err());
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
}
