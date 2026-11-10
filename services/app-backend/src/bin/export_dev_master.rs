use std::{env, fs, path::Path};

use serde_json::json;
use sqlx::PgPool;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    if env::args().nth(1).as_deref() != Some("--write") {
        return Err("Usage: cargo run -p app-backend --bin export_dev_master -- --write".into());
    }

    let workspace_env = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../.env");
    if workspace_env.is_file() {
        dotenvy::from_path(workspace_env)?;
    } else {
        dotenvy::dotenv().ok();
    }

    let database_url = env::var("DATABASE_URL")?;
    let pool = PgPool::connect(&database_url).await?;
    let divisions = sqlx::query_as::<_, (String, String, String, String)>(
        "SELECT name, description, secretariat_name, secretariat_description FROM divisions ORDER BY name",
    )
    .fetch_all(&pool)
    .await?;
    let departments = sqlx::query_as::<_, (String, String, String)>(
        "SELECT divisions.name, departments.name, departments.description FROM departments JOIN divisions ON divisions.id = departments.division_id ORDER BY divisions.name, departments.name",
    )
    .fetch_all(&pool)
    .await?;
    let bureaus = sqlx::query_as::<_, (String, String, String, String, String)>(
        "SELECT divisions.name, departments.name, bureaus.name, bureaus.unit_type, bureaus.description FROM bureaus JOIN departments ON departments.id = bureaus.department_id JOIN divisions ON divisions.id = departments.division_id ORDER BY divisions.name, departments.name, bureaus.name",
    )
    .fetch_all(&pool)
    .await?;
    let job_types =
        sqlx::query_as::<_, (String,)>("SELECT name FROM job_types ORDER BY lower(name)")
            .fetch_all(&pool)
            .await?;

    let snapshot = json!({
        "divisions": divisions.into_iter().map(|(name, description, secretariat_name, secretariat_description)| json!({
            "name": name,
            "description": description,
            "secretariat_name": secretariat_name,
            "secretariat_description": secretariat_description,
        })).collect::<Vec<_>>(),
        "departments": departments.into_iter().map(|(division, name, description)| json!({
            "division": division,
            "name": name,
            "description": description,
        })).collect::<Vec<_>>(),
        "bureaus": bureaus.into_iter().map(|(division, department, name, unit_type, description)| json!({
            "division": division,
            "department": department,
            "name": name,
            "unit_type": unit_type,
            "description": description,
        })).collect::<Vec<_>>(),
        "job_types": job_types.into_iter().map(|(name,)| name).collect::<Vec<_>>(),
    });

    let seed_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("dev-seed");
    fs::create_dir_all(&seed_dir)?;
    let output_path = seed_dir.join("master-data.json");
    fs::write(&output_path, serde_json::to_vec_pretty(&snapshot)?)?;
    println!(
        "Exported {} divisions, {} departments, {} bureaus/workshops, and {} job types to {}",
        snapshot["divisions"].as_array().map_or(0, Vec::len),
        snapshot["departments"].as_array().map_or(0, Vec::len),
        snapshot["bureaus"].as_array().map_or(0, Vec::len),
        snapshot["job_types"].as_array().map_or(0, Vec::len),
        output_path.display(),
    );
    pool.close().await;
    Ok(())
}
