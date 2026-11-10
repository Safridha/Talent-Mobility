use serde::Deserialize;
use sqlx::PgPool;

const MASTER_DATA_SNAPSHOT: &str = include_str!("../dev-seed/master-data.json");
const MASTER_DATA_SEED_NAME: &str = "current-master-data";

#[derive(Deserialize)]
struct MasterDataSnapshot {
    divisions: Vec<DivisionSeed>,
    departments: Vec<DepartmentSeed>,
    bureaus: Vec<BureauSeed>,
    job_types: Vec<String>,
}

#[derive(Deserialize)]
struct DivisionSeed {
    name: String,
    description: String,
    secretariat_name: String,
    secretariat_description: String,
}

#[derive(Deserialize)]
struct DepartmentSeed {
    division: String,
    name: String,
    description: String,
}

#[derive(Deserialize)]
struct BureauSeed {
    division: String,
    department: String,
    name: String,
    unit_type: String,
    description: String,
}

pub(super) async fn seed_dev_master_data(pool: &PgPool) -> Result<(), Box<dyn std::error::Error>> {
    let snapshot: MasterDataSnapshot = serde_json::from_str(MASTER_DATA_SNAPSHOT)?;
    let mut transaction = pool.begin().await?;
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS dev_master_seed_state (seed_name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
    )
    .execute(&mut *transaction)
    .await?;

    let already_seeded: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM dev_master_seed_state WHERE seed_name = $1)",
    )
    .bind(MASTER_DATA_SEED_NAME)
    .fetch_one(&mut *transaction)
    .await?;
    if already_seeded {
        transaction.commit().await?;
        return Ok(());
    }

    let contains_user_data: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM admins) OR EXISTS(SELECT 1 FROM applicants) OR EXISTS(SELECT 1 FROM applications) OR EXISTS(SELECT 1 FROM job_postings) OR EXISTS(SELECT 1 FROM employee_directory)",
    )
    .fetch_one(&mut *transaction)
    .await?;
    if contains_user_data {
        return Err(
            "Refusing to apply the development master snapshot when accounts, applications, job postings, or employee records exist.".into(),
        );
    }

    sqlx::query("DELETE FROM bureaus")
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM departments")
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM divisions")
        .execute(&mut *transaction)
        .await?;
    sqlx::query("DELETE FROM job_types")
        .execute(&mut *transaction)
        .await?;

    for division in snapshot.divisions {
        sqlx::query(
            "INSERT INTO divisions (name, description, secretariat_name, secretariat_description) VALUES ($1, $2, $3, $4)",
        )
        .bind(division.name)
        .bind(division.description)
        .bind(division.secretariat_name)
        .bind(division.secretariat_description)
        .execute(&mut *transaction)
        .await?;
    }
    for department in snapshot.departments {
        let inserted = sqlx::query(
            "INSERT INTO departments (division_id, name, description) SELECT id, $2, $3 FROM divisions WHERE name = $1",
        )
        .bind(&department.division)
        .bind(department.name)
        .bind(department.description)
        .execute(&mut *transaction)
        .await?;
        if inserted.rows_affected() != 1 {
            return Err(format!(
                "Development snapshot references unknown division '{}'.",
                department.division
            )
            .into());
        }
    }
    for bureau in snapshot.bureaus {
        let inserted = sqlx::query(
            "INSERT INTO bureaus (department_id, name, unit_type, description) SELECT departments.id, $3, $4, $5 FROM departments JOIN divisions ON divisions.id = departments.division_id WHERE divisions.name = $1 AND departments.name = $2",
        )
        .bind(&bureau.division)
        .bind(&bureau.department)
        .bind(bureau.name)
        .bind(bureau.unit_type)
        .bind(bureau.description)
        .execute(&mut *transaction)
        .await?;
        if inserted.rows_affected() != 1 {
            return Err(format!(
                "Development snapshot references an unknown department in division '{}'.",
                bureau.division
            )
            .into());
        }
    }
    for job_type in snapshot.job_types {
        sqlx::query("INSERT INTO job_types (name) VALUES ($1)")
            .bind(job_type)
            .execute(&mut *transaction)
            .await?;
    }

    sqlx::query("INSERT INTO dev_master_seed_state (seed_name) VALUES ($1)")
        .bind(MASTER_DATA_SEED_NAME)
        .execute(&mut *transaction)
        .await?;
    transaction.commit().await?;
    Ok(())
}

#[cfg(all(test, feature = "postgres-migration-tests"))]
mod tests {
    use super::*;

    #[sqlx::test(migrations = "./migrations")]
    async fn development_master_snapshot_seeds_only_master_tables_once(pool: PgPool) {
        let expected: MasterDataSnapshot =
            serde_json::from_str(MASTER_DATA_SNAPSHOT).expect("snapshot should be valid JSON");
        let expected_counts = (
            expected.divisions.len() as i64,
            expected.departments.len() as i64,
            expected.bureaus.len() as i64,
            expected.job_types.len() as i64,
        );

        seed_dev_master_data(&pool)
            .await
            .expect("snapshot should be imported into an empty development database");
        seed_dev_master_data(&pool)
            .await
            .expect("restarting should not reseed or duplicate master data");

        let actual_counts = (
            sqlx::query_scalar("SELECT COUNT(*) FROM divisions")
                .fetch_one(&pool)
                .await
                .unwrap(),
            sqlx::query_scalar("SELECT COUNT(*) FROM departments")
                .fetch_one(&pool)
                .await
                .unwrap(),
            sqlx::query_scalar("SELECT COUNT(*) FROM bureaus")
                .fetch_one(&pool)
                .await
                .unwrap(),
            sqlx::query_scalar("SELECT COUNT(*) FROM job_types")
                .fetch_one(&pool)
                .await
                .unwrap(),
        );
        assert_eq!(actual_counts, expected_counts);
        let operational_row_count: i64 = sqlx::query_scalar(
            "SELECT (SELECT COUNT(*) FROM admins) + (SELECT COUNT(*) FROM applicants) + (SELECT COUNT(*) FROM applications) + (SELECT COUNT(*) FROM job_postings) + (SELECT COUNT(*) FROM employee_directory)",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(operational_row_count, 0);
    }

    #[sqlx::test(migrations = "./migrations")]
    async fn development_master_snapshot_preserves_database_with_existing_admins(pool: PgPool) {
        sqlx::query("INSERT INTO admins (name, email, password_hash) VALUES ($1, $2, $3)")
            .bind("Existing Admin")
            .bind("existing-admin@example.test")
            .bind("not-a-real-password-hash")
            .execute(&pool)
            .await
            .unwrap();
        let divisions_before: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM divisions")
            .fetch_one(&pool)
            .await
            .unwrap();

        assert!(seed_dev_master_data(&pool).await.is_err());

        let divisions_after: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM divisions")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(divisions_after, divisions_before);
        assert_eq!(
            sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM admins")
                .fetch_one(&pool)
                .await
                .unwrap(),
            1
        );
    }
}
