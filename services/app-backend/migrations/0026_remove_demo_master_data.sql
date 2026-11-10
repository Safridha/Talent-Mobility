-- Keep seeded positions that already have application history, but make them non-public.
UPDATE job_postings
SET status = 'closed'
WHERE (id, title) IN (
    VALUES
        ('POS-2026-001', 'Improvement & Maintenance Engineer'),
        ('POS-2026-002', 'Senior Hull Construction Drafter'),
        ('POS-2026-003', 'Supervisor Fabrikasi & Perakitan Baja'),
        ('POS-2026-004', 'Piping Quality Control Inspector'),
        ('POS-2026-005', 'Electrical & Instrumentation Planner'),
        ('POS-2026-006', 'Tooling & Machine Maintenance Technician')
)
AND EXISTS (
    SELECT 1
    FROM applications
    WHERE applications.job_id = job_postings.id
);

DELETE FROM job_postings
WHERE (id, title) IN (
    VALUES
        ('POS-2026-001', 'Improvement & Maintenance Engineer'),
        ('POS-2026-002', 'Senior Hull Construction Drafter'),
        ('POS-2026-003', 'Supervisor Fabrikasi & Perakitan Baja'),
        ('POS-2026-004', 'Piping Quality Control Inspector'),
        ('POS-2026-005', 'Electrical & Instrumentation Planner'),
        ('POS-2026-006', 'Tooling & Machine Maintenance Technician')
)
AND NOT EXISTS (
    SELECT 1
    FROM applications
    WHERE applications.job_id = job_postings.id
);

DELETE FROM bureaus
USING departments, divisions
WHERE bureaus.department_id = departments.id
  AND departments.division_id = divisions.id
  AND (divisions.name, departments.name, bureaus.name) IN (
      VALUES
          ('Divisi Kapal Niaga', 'Departemen Dukungan Produksi', 'Biro Fasilitas & Utilitas Pabrik'),
          ('Divisi Desain & Rekayasa', 'Departemen Desain Konstruksi Lambung', 'Biro Gambar Lambung (Hull Structure)'),
          ('Divisi Kapal Niaga', 'Departemen Fabrikasi & Konstruksi', 'Bengkel Fabrikasi Pelat'),
          ('Divisi Kapal Perang', 'Departemen Penjaminan Mutu (QA/QC)', 'Bengkel Sistem Perpipaan'),
          ('Divisi Rekayasa Umum', 'Departemen Fabrikasi Non-Kapal', 'Bengkel Elektrikal & Otomasi'),
          ('Divisi Rekayasa Umum', 'Departemen Permesinan & Peralatan', 'Bengkel Mesin Perkakas (Machining)')
  )
  AND NOT EXISTS (
      SELECT 1 FROM job_postings WHERE job_postings.bureau_id = bureaus.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM employee_directory WHERE employee_directory.bureau_id = bureaus.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM admins WHERE admins.bureau_id = bureaus.id
  );

DELETE FROM departments
USING divisions
WHERE departments.division_id = divisions.id
  AND (divisions.name, departments.name) IN (
      VALUES
          ('Divisi Kapal Niaga', 'Departemen Dukungan Produksi'),
          ('Divisi Desain & Rekayasa', 'Departemen Desain Konstruksi Lambung'),
          ('Divisi Kapal Niaga', 'Departemen Fabrikasi & Konstruksi'),
          ('Divisi Kapal Perang', 'Departemen Penjaminan Mutu (QA/QC)'),
          ('Divisi Rekayasa Umum', 'Departemen Fabrikasi Non-Kapal'),
          ('Divisi Rekayasa Umum', 'Departemen Permesinan & Peralatan')
  )
  AND NOT EXISTS (
      SELECT 1 FROM bureaus WHERE bureaus.department_id = departments.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM job_postings WHERE job_postings.department_id = departments.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM employee_directory WHERE employee_directory.department_id = departments.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM admins WHERE admins.department_id = departments.id
  );

DELETE FROM divisions
WHERE name IN ('Divisi Kapal Niaga', 'Divisi Desain & Rekayasa', 'Divisi Kapal Perang')
  AND NOT EXISTS (
      SELECT 1 FROM departments WHERE departments.division_id = divisions.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM job_postings WHERE job_postings.division_id = divisions.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM employee_directory WHERE employee_directory.division_id = divisions.id
  )
  AND NOT EXISTS (
      SELECT 1 FROM admins WHERE admins.division_id = divisions.id
  );
