use std::{env, net::SocketAddr, path::Path as FsPath};

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{
    extract::{Json, Path, State},
    http::{header::AUTHORIZATION, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, patch, post, put},
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

#[derive(Serialize)]
struct Applicant {
    name: String,
    email: String,
}

#[derive(Serialize)]
struct AuthResponse {
    token: String,
    applicant: Applicant,
}

#[derive(Serialize)]
struct Admin {
    name: String,
    email: String,
}

#[derive(Serialize)]
struct AdminAuthResponse {
    token: String,
    admin: Admin,
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

#[derive(Deserialize)]
struct ApplyRequest {
    job_id: String,
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

#[derive(Deserialize)]
struct AdminJobFields {
    title: String,
    division: String,
    department: String,
    unit: String,
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
    status: String,
    created_at: String,
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
            "/api/admin/jobs",
            get(admin_list_jobs).post(admin_create_job),
        )
        .route("/api/admin/jobs/{id}", put(admin_update_job))
        .route("/api/admin/jobs/{id}/status", patch(admin_set_job_status))
        .route("/api/admin/applications", get(admin_list_applications))
        .route("/api/admin/applications/{id}", get(admin_get_application))
        .route(
            "/api/admin/applications/{id}/status",
            patch(admin_set_application_status),
        )
        .route(
            "/api/applications",
            get(list_applications).post(create_application),
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
        applicant: Applicant {
            name: applicant.name,
            email: applicant.email,
        },
    }))
}

async fn login(
    State(state): State<AppState>,
    Json(credentials): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let email = credentials.email.trim().to_ascii_lowercase();
    if !is_valid_email(&email) || credentials.password.is_empty() {
        return Err(ApiError::BadRequest("Email dan kata sandi tidak sesuai."));
    }

    let applicant = sqlx::query_as::<_, ApplicantRecord>(
        "SELECT id, name, email, password_hash FROM applicants WHERE email = $1",
    )
    .bind(&email)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;

    let Some(applicant) = applicant else {
        return Err(ApiError::BadRequest("Email atau kata sandi tidak sesuai."));
    };
    let password_hash = PasswordHash::new(&applicant.password_hash).map_err(internal_error)?;
    if Argon2::default()
        .verify_password(credentials.password.as_bytes(), &password_hash)
        .is_err()
    {
        return Err(ApiError::BadRequest("Email atau kata sandi tidak sesuai."));
    }

    let (token, token_hash) = create_token();
    sqlx::query(
        "INSERT INTO applicant_tokens (token_hash, applicant_id, expires_at) VALUES ($1, $2, NOW() + INTERVAL '24 hours')",
    )
    .bind(token_hash)
    .bind(applicant.id)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;

    Ok(Json(AuthResponse {
        token,
        applicant: Applicant {
            name: applicant.name,
            email: applicant.email,
        },
    }))
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
        "SELECT id, name, email, password_hash FROM admins WHERE email = $1",
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
        admin: Admin {
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
        "SELECT id, title, division, department, unit, location, quota, posted, job_type, summary, skills, responsibilities, is_open FROM job_postings WHERE is_open = TRUE ORDER BY id",
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
        "SELECT id, title, division, department, unit, location, quota, posted, job_type, summary, skills, responsibilities, is_open FROM job_postings ORDER BY id",
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
    validate_admin_job(id, &request.fields)?;
    let fields = request.fields;
    let result = sqlx::query(
        "INSERT INTO job_postings (id, title, division, department, unit, location, quota, posted, job_type, summary, skills, responsibilities, is_open) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)",
    )
    .bind(id)
    .bind(fields.title.trim())
    .bind(fields.division.trim())
    .bind(fields.department.trim())
    .bind(fields.unit.trim())
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
    let result = sqlx::query(
        "UPDATE job_postings SET title = $2, division = $3, department = $4, unit = $5, location = $6, quota = $7, posted = $8, job_type = $9, summary = $10, skills = $11, responsibilities = $12, is_open = $13 WHERE id = $1",
    )
    .bind(&id)
    .bind(fields.title.trim())
    .bind(fields.division.trim())
    .bind(fields.department.trim())
    .bind(fields.unit.trim())
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

async fn admin_list_applications(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<Json<AdminApplicationsResponse>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let data = sqlx::query_as::<_, AdminApplication>(
        "SELECT applications.id, applicants.name AS applicant_name, applicants.email AS applicant_email, job_postings.id AS job_id, job_postings.title AS job_title, applications.status, applications.created_at::text AS created_at FROM applications JOIN applicants ON applicants.id = applications.applicant_id JOIN job_postings ON job_postings.id = applications.job_id ORDER BY applications.created_at DESC",
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
) -> Result<Json<AdminApplication>, ApiError> {
    authorized_admin(&state.pool, &headers).await?;
    let application = sqlx::query_as::<_, AdminApplication>(
        "SELECT applications.id, applicants.name AS applicant_name, applicants.email AS applicant_email, job_postings.id AS job_id, job_postings.title AS job_title, applications.status, applications.created_at::text AS created_at FROM applications JOIN applicants ON applicants.id = applications.applicant_id JOIN job_postings ON job_postings.id = applications.job_id WHERE applications.id = $1",
    )
    .bind(id)
    .fetch_optional(&state.pool)
    .await
    .map_err(internal_error)?;
    application
        .ok_or(ApiError::NotFound("Lamaran tidak ditemukan."))
        .map(Json)
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

fn validate_admin_job(id: &str, fields: &AdminJobFields) -> Result<(), ApiError> {
    if id.trim().is_empty() || id.len() > 64 {
        return Err(ApiError::BadRequest(
            "Kode posisi wajib diisi dan maksimal 64 karakter.",
        ));
    }
    if [
        fields.title.trim(),
        fields.division.trim(),
        fields.department.trim(),
        fields.unit.trim(),
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
    Ok(())
}

async fn monitor_positions(
    State(state): State<AppState>,
) -> Result<Json<PositionMappingsResponse>, ApiError> {
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
) -> Result<Json<ApplicationAggregatesResponse>, ApiError> {
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

async fn create_application(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(request): Json<ApplyRequest>,
) -> Result<Json<serde_json::Value>, ApiError> {
    let (applicant_id, _) = authorized_applicant(&state.pool, &headers).await?;
    let job_id = request.job_id.trim();
    if job_id.is_empty() {
        return Err(ApiError::BadRequest("Lowongan wajib dipilih."));
    }

    let is_open: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM job_postings WHERE id = $1 AND is_open = TRUE)",
    )
    .bind(job_id)
    .fetch_one(&state.pool)
    .await
    .map_err(internal_error)?;
    if !is_open {
        return Err(ApiError::NotFound(
            "Lowongan tidak ditemukan atau sudah ditutup.",
        ));
    }

    let inserted = sqlx::query(
        "INSERT INTO applications (applicant_id, job_id) VALUES ($1, $2) ON CONFLICT (applicant_id, job_id) DO NOTHING",
    )
    .bind(applicant_id)
    .bind(job_id)
    .execute(&state.pool)
    .await
    .map_err(internal_error)?;
    if inserted.rows_affected() == 0 {
        return Err(ApiError::Conflict("Anda sudah melamar posisi ini."));
    }

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
        "SELECT applicant_id FROM applicant_tokens WHERE token_hash = $1 AND expires_at > NOW()",
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
        "SELECT admin_id FROM admin_tokens WHERE token_hash = $1 AND expires_at > NOW()",
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

fn is_unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|database_error| database_error.code())
        .as_deref()
        == Some("23505")
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
            location: "Test location".to_owned(),
            quota: 1,
            posted: "Hari ini".to_owned(),
            job_type: "Full-time".to_owned(),
            summary: "Test summary".to_owned(),
            skills: SqlJson(vec!["Skill".to_owned()]),
            responsibilities: SqlJson(vec!["Task".to_owned()]),
            is_open: true,
        };

        let response = serde_json::to_value(job).expect("job should serialize");
        assert_eq!(response["skills"], json!(["Skill"]));
        assert_eq!(response["responsibilities"], json!(["Task"]));
        assert_eq!(response["type"], "Full-time");
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
}
