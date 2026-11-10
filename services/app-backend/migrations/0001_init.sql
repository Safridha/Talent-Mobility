CREATE TABLE IF NOT EXISTS employees (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    nip TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_tokens (
    token_hash TEXT PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_postings (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    division TEXT NOT NULL,
    department TEXT NOT NULL,
    unit TEXT NOT NULL,
    location TEXT NOT NULL,
    quota SMALLINT NOT NULL CHECK (quota >= 0),
    posted TEXT NOT NULL,
    job_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    skills JSONB NOT NULL DEFAULT '[]'::jsonb,
    responsibilities JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_open BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO job_postings (id, title, division, department, unit, location, quota, posted, job_type, summary, skills, responsibilities)
VALUES
    ('POS-2026-001', 'Improvement & Maintenance Engineer', 'Divisi Kapal Niaga', 'Departemen Dukungan Produksi', 'Biro Fasilitas & Utilitas Pabrik', 'Surabaya', 2, '2 hari lalu', 'Full-time', 'Bertanggung jawab atas efisiensi operasional utilitas galangan, pemeliharaan crane dock, serta reduksi downtime fasilitas bengkel perakitan.', '["Pemeliharaan fasilitas", "Analisis operasional", "Perbaikan berkelanjutan"]', '["Menjaga efisiensi utilitas galangan dan fasilitas produksi.", "Menyusun jadwal pemeliharaan crane dock dan fasilitas bengkel.", "Menganalisis penyebab downtime dan mengusulkan perbaikan."]'),
    ('POS-2026-002', 'Senior Hull Construction Drafter', 'Divisi Desain & Rekayasa', 'Departemen Desain Konstruksi Lambung', 'Biro Gambar Lambung (Hull Structure)', 'Surabaya', 3, '3 hari lalu', 'Full-time', 'Membuat detail shop drawing struktur konstruksi lambung kapal, nested plate plan, dan data cutting mesin plasma.', '["AutoCAD", "Hull structure", "Shop drawing"]', '["Membuat shop drawing struktur konstruksi lambung kapal.", "Menyiapkan nested plate plan dan data cutting.", "Berkoordinasi dengan tim desain dan produksi."]'),
    ('POS-2026-003', 'Supervisor Fabrikasi & Perakitan Baja', 'Divisi Kapal Niaga', 'Departemen Fabrikasi & Konstruksi', 'Bengkel Fabrikasi Pelat', 'Surabaya', 1, '4 hari lalu', 'Full-time', 'Mengawasi jalannya proses pemotongan (cutting), pembentukan (forming), dan sub-assembly blok lambung kapal di bengkel utama.', '["Fabrikasi baja", "Kepemimpinan tim", "Konstruksi kapal"]', '["Mengawasi proses pemotongan dan pembentukan baja.", "Memastikan mutu dan keselamatan kerja di bengkel.", "Mengatur target dan pembagian kerja tim fabrikasi."]'),
    ('POS-2026-004', 'Piping Quality Control Inspector', 'Divisi Kapal Perang', 'Departemen Penjaminan Mutu (QA/QC)', 'Bengkel Sistem Perpipaan', 'Surabaya', 2, '5 hari lalu', 'Full-time', 'Melakukan inspeksi kelayakan instalasi jalur perpipaan ballast, bahan bakar, dan air tawar pada kapal kombatan.', '["Quality control", "Inspeksi perpipaan", "Dokumentasi teknis"]', '["Memeriksa instalasi sistem perpipaan sesuai spesifikasi.", "Mendokumentasikan hasil inspeksi dan temuan.", "Berkoordinasi dengan tim produksi untuk tindak lanjut."]'),
    ('POS-2026-005', 'Electrical & Instrumentation Planner', 'Divisi Rekayasa Umum', 'Departemen Fabrikasi Non-Kapal', 'Bengkel Elektrikal & Otomasi', 'Surabaya', 1, '1 minggu lalu', 'Full-time', 'Merencanakan kebutuhan kabel, panel distribusi daya, dan otomasi instrumen untuk proyek jembatan baja dan boiler industri.', '["Instrumentasi", "Distribusi daya", "Perencanaan proyek"]', '["Menyusun kebutuhan material dan rencana pekerjaan elektrikal.", "Mengkoordinasikan jadwal dengan tim proyek.", "Meninjau dokumen teknis dan kemajuan pekerjaan."]'),
    ('POS-2026-006', 'Tooling & Machine Maintenance Technician', 'Divisi Rekayasa Umum', 'Departemen Permesinan & Peralatan', 'Bengkel Mesin Perkakas (Machining)', 'Surabaya', 2, '1 minggu lalu', 'Full-time', 'Menjaga keandalan mesin bubut vertikal, milling gantry, dan mesin boring horizontal untuk pengerjaan poros baling-baling kapal.', '["Perawatan mesin", "Machining", "Troubleshooting"]', '["Melakukan perawatan preventif mesin perkakas.", "Mendiagnosis gangguan dan melakukan perbaikan.", "Mencatat riwayat pemeliharaan dan ketersediaan mesin."]')
ON CONFLICT (id) DO NOTHING;
