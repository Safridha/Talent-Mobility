#![cfg(feature = "postgres-migration-tests")]

use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
async fn all_migrations_apply_to_a_fresh_postgres_database(pool: PgPool) {
    let expected_migrations = sqlx::migrate!("./migrations").iter().count() as i64;
    let applied_migrations: i64 =
        sqlx::query_scalar("SELECT COUNT(*) FROM _sqlx_migrations WHERE success")
            .fetch_one(&pool)
            .await
            .expect("migration history should be queryable");

    assert_eq!(applied_migrations, expected_migrations);

    let final_schema_is_present: bool = sqlx::query_scalar(
        "SELECT to_regclass('public.admin_permissions') IS NOT NULL
            AND to_regclass('public.applications') IS NOT NULL
            AND to_regclass('public.job_postings') IS NOT NULL",
    )
    .fetch_one(&pool)
    .await
    .expect("final schema tables should be queryable");

    assert!(final_schema_is_present);
}

#[sqlx::test(migrations = "./migrations")]
async fn organization_migrations_seed_all_four_divisions_and_units(pool: PgPool) {
    let (division_count, department_count, unit_count, invalid_unit_type_count, secretariat_count): (
        i64,
        i64,
        i64,
        i64,
        i64,
    ) = sqlx::query_as(
        "SELECT
            (SELECT COUNT(*) FROM divisions
             WHERE name = ANY(ARRAY[
                'Divisi Kapal Permukaan',
                'Divisi Rekayasa Umum',
                'Divisi Kapal Selam',
                'Divisi Pemeliharaan & Perbaikan (Harkan)'
             ])),
            (SELECT COUNT(*) FROM departments
             JOIN divisions ON divisions.id = departments.division_id
             WHERE divisions.name = ANY(ARRAY[
                'Divisi Kapal Permukaan',
                'Divisi Rekayasa Umum',
                'Divisi Kapal Selam',
                'Divisi Pemeliharaan & Perbaikan (Harkan)'
             ])
             AND departments.name = ANY(ARRAY[
                'Departemen Perencanaan dan Pengendalian',
                'Departemen Konstruksi 1',
                'Departemen Konstruksi 2',
                'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
                'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 2',
                'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
                'Departemen Erection',
                'Departemen Dukungan Produksi',
                'Departemen Perencanaan & Pengendalian',
                'Departemen Permesinan & Perakitan',
                'Departemen Fabrikasi & Konstruksi',
                'Departemen Dukungan Material',
                'Departemen Lambung',
                'Departemen Perlengkapan',
                'Departemen Perencanaan dan Pengendalian',
                'Departemen Produksi',
                'Departemen Dukungan Produksi',
                'Departemen Dok Gali',
                'Departemen Dok Apung'
             ])),
            (SELECT COUNT(*) FROM bureaus
             JOIN departments ON departments.id = bureaus.department_id
             JOIN divisions ON divisions.id = departments.division_id
             WHERE divisions.name = ANY(ARRAY[
                'Divisi Kapal Permukaan',
                'Divisi Rekayasa Umum',
                'Divisi Kapal Selam',
                'Divisi Pemeliharaan & Perbaikan (Harkan)'
             ])
             AND departments.name = ANY(ARRAY[
                'Departemen Perencanaan dan Pengendalian',
                'Departemen Konstruksi 1',
                'Departemen Konstruksi 2',
                'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
                'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 2',
                'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
                'Departemen Erection',
                'Departemen Dukungan Produksi',
                'Departemen Perencanaan & Pengendalian',
                'Departemen Permesinan & Perakitan',
                'Departemen Fabrikasi & Konstruksi',
                'Departemen Dukungan Material',
                'Departemen Lambung',
                'Departemen Perlengkapan',
                'Departemen Perencanaan dan Pengendalian',
                'Departemen Produksi',
                'Departemen Dukungan Produksi',
                'Departemen Dok Gali',
                'Departemen Dok Apung'
             ])),
            (SELECT COUNT(*) FROM bureaus
             WHERE unit_type NOT IN ('biro', 'bengkel')),
            (SELECT COUNT(*) FROM divisions
             WHERE name = ANY(ARRAY[
                'Divisi Kapal Permukaan',
                'Divisi Rekayasa Umum',
                'Divisi Kapal Selam',
                'Divisi Pemeliharaan & Perbaikan (Harkan)'
             ])
             AND btrim(secretariat_name) <> '')",
    )
    .fetch_one(&pool)
    .await
    .expect("seeded organization data should be queryable");

    assert_eq!(division_count, 4, "all supplied divisions should be seeded");
    assert_eq!(
        department_count, 21,
        "all supplied departments should be seeded"
    );
    assert_eq!(
        unit_count, 99,
        "all supplied bureaus and workshops should be seeded"
    );
    assert_eq!(
        invalid_unit_type_count, 0,
        "all units should have valid types"
    );
    assert_eq!(
        secretariat_count, 4,
        "all supplied secretariats should be represented"
    );

    let (all_divisions, all_departments, all_units): (i64, i64, i64) = sqlx::query_as(
        "SELECT
            (SELECT COUNT(*) FROM divisions),
            (SELECT COUNT(*) FROM departments),
            (SELECT COUNT(*) FROM bureaus)",
    )
    .fetch_one(&pool)
    .await
    .expect("complete organization master counts should be queryable");
    assert_eq!(
        all_divisions, 4,
        "only the four official divisions should remain"
    );
    assert_eq!(
        all_departments, 21,
        "only official departments should remain"
    );
    assert_eq!(
        all_units, 99,
        "only official bureaus and workshops should remain"
    );

    let remaining_demo_data: i64 = sqlx::query_scalar(
        "SELECT
            (SELECT COUNT(*) FROM job_postings
             WHERE id IN (
                'POS-2026-001', 'POS-2026-002', 'POS-2026-003',
                'POS-2026-004', 'POS-2026-005', 'POS-2026-006'
             ))
            + (SELECT COUNT(*) FROM divisions
               WHERE name IN ('Divisi Kapal Niaga', 'Divisi Desain & Rekayasa', 'Divisi Kapal Perang'))
            + (SELECT COUNT(*) FROM departments
               JOIN divisions ON divisions.id = departments.division_id
               WHERE (divisions.name, departments.name) IN (
                  ('Divisi Kapal Niaga', 'Departemen Dukungan Produksi'),
                  ('Divisi Desain & Rekayasa', 'Departemen Desain Konstruksi Lambung'),
                  ('Divisi Kapal Niaga', 'Departemen Fabrikasi & Konstruksi'),
                  ('Divisi Kapal Perang', 'Departemen Penjaminan Mutu (QA/QC)'),
                  ('Divisi Rekayasa Umum', 'Departemen Fabrikasi Non-Kapal'),
                  ('Divisi Rekayasa Umum', 'Departemen Permesinan & Peralatan')
               ))",
    )
    .fetch_one(&pool)
    .await
    .expect("legacy demonstration data should be queryable");

    assert_eq!(
        remaining_demo_data, 0,
        "fresh databases should contain only the official master and no demo vacancies"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn job_listing_queries_join_organization_units_without_ambiguous_columns(pool: PgPool) {
    let public_jobs = sqlx::query(
        "SELECT job_postings.id, title, division, department, unit, CASE WHEN target_level = 'bureau' THEN bureaus.unit_type ELSE target_level END AS unit_type, target_level, job_postings.division_id, job_postings.department_id, job_postings.bureau_id, location, quota, posted, job_types.name AS job_type, summary, skills, responsibilities, status, NULL::BOOLEAN AS has_applications FROM job_postings JOIN job_types ON job_types.id = job_postings.job_type_id LEFT JOIN bureaus ON bureaus.id = job_postings.bureau_id WHERE status = 'open' ORDER BY job_postings.id",
    )
    .fetch_all(&pool)
    .await
    .expect("public job listing query should run");

    let admin_jobs = sqlx::query(
        "SELECT job_postings.id, title, division, department, unit, CASE WHEN target_level = 'bureau' THEN bureaus.unit_type ELSE target_level END AS unit_type, target_level, job_postings.division_id, job_postings.department_id, job_postings.bureau_id, location, quota, posted, job_types.name AS job_type, summary, skills, responsibilities, status, EXISTS(SELECT 1 FROM applications WHERE applications.job_id = job_postings.id) AS has_applications FROM job_postings JOIN job_types ON job_types.id = job_postings.job_type_id LEFT JOIN bureaus ON bureaus.id = job_postings.bureau_id WHERE ($1 IN ('super_admin', 'admin') OR ($1 = 'division_head' AND job_postings.division_id = $2) OR ($1 = 'department_head' AND job_postings.target_level <> 'division' AND job_postings.department_id = $3)) ORDER BY job_postings.id",
    )
    .bind("super_admin")
    .bind(None::<i64>)
    .bind(None::<i64>)
    .fetch_all(&pool)
    .await
    .expect("admin job listing query should run");

    assert!(
        public_jobs.is_empty(),
        "fresh databases should have no demo vacancies"
    );
    assert!(
        admin_jobs.is_empty(),
        "fresh databases should have no demo vacancies"
    );
}

#[sqlx::test(migrations = "./migrations")]
async fn secretariat_removal_detects_existing_directory_records(pool: PgPool) {
    let division_id =
        sqlx::query_scalar::<_, i64>("SELECT id FROM divisions WHERE name = 'Divisi Kapal Selam'")
            .fetch_one(&pool)
            .await
            .expect("seeded submarine division should exist");

    sqlx::query(
        "INSERT INTO employee_directory (employee_number, name, position_title, target_level, division_id) VALUES ('TEST-NIP-SECRETARIAT', 'Pegawai Uji', 'Jabatan Uji', 'secretariat', $1)",
    )
    .bind(division_id)
    .execute(&pool)
    .await
    .expect("secretariat employee should be insertable");

    let secretariat_is_in_use: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM job_postings WHERE division_id = $1 AND target_level = 'secretariat' UNION ALL SELECT 1 FROM employee_directory WHERE division_id = $1 AND target_level = 'secretariat')",
    )
    .bind(division_id)
    .fetch_one(&pool)
    .await
    .expect("secretariat references should be queryable");

    assert!(secretariat_is_in_use);
}
