CREATE TEMP TABLE seed_divisions (
    name TEXT,
    description TEXT,
    secretariat_name TEXT,
    secretariat_description TEXT
) ON COMMIT DROP;

INSERT INTO seed_divisions VALUES (
    'Divisi Pemeliharaan & Perbaikan (Harkan)',
    'Merencanakan, mengkoordinasikan dan melaksanakan Strategi Eksekusi Perusahaan dalam bidang pemeliharaan dan perbaikan kapal, non kapal dan alat apung lain untuk mencapai Target Perusahaan sesuai dengan aturan dan kebijakan yang berlaku.',
    'Sekretariat Divisi Harkan',
    'Menyelenggarakan kesekretariatan Divisi Harkan yang meliputi administrasi umum, administrasi personil, kerumahtanggaan dan keuangan di lingkungan Divisi Harkan.'
);

INSERT INTO divisions (name, description, secretariat_name, secretariat_description)
SELECT name, description, secretariat_name, secretariat_description
FROM seed_divisions
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    secretariat_name = EXCLUDED.secretariat_name,
    secretariat_description = EXCLUDED.secretariat_description;

CREATE TEMP TABLE seed_departments (
    division_name TEXT,
    name TEXT,
    description TEXT
) ON COMMIT DROP;

INSERT INTO seed_departments VALUES
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)',
    'Departemen Perencanaan & Pengendalian',
    '1. Menjabarkan, menyusun strategi pelaksanaan kebijakan Divisi Pemeliharaan & Perbaikan (Harkan) beserta program kerjanya dalam bidang perencanaan & pengendalian dan rekayasa.
2. Merencanakan, mengkoordinir & melaksanakan, mengevalusi serta melakukan perbaikan terhadap kegiatan bidang perencanaan & pengendalian dan rekayasa untuk pemeliharaan dan perbaikan kapal, non kapal dan alat apung lainnya.
3. Mengkoordinir penyusunan & atau evaluasi KPI (Key Performance Indicator) Divisi Harkan beserta pelaporan realisasi implementasinya.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)',
    'Departemen Produksi',
    '1. Menjabarkan, menyusun strategi pelaksanaan kebijakan Divisi Pemeliharaan & Perbaikan (Harkan) beserta program kerjanya untuk mengkoordinir pekerjaan produksi utama dalam bidang Konstruksi, Sistem Poros & Kemudi, Sistem Bantu & Katup, Mesin Perkakas, Permesinan, Listrik dan Kontrol dan Blasting, Pengecatan dan Scaffolding.
2. Mengkoordinir pekerjaan produksi meliputi tahap perencanaan, pelaksanaan, pengendalian dan mengevalusi terhadap kegiatan perbaikan bidang Konstruksi, Sistem Poros & Kemudi, Sistem Bantu & Katup, Mesin Perkakas, Permesinan, Listrik dan Kontrol dan Blasting, Pengecatan dan Scaffolding untuk pemeliharaan dan perbaikan kapal, non kapal dan alat apung lainnya.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)',
    'Departemen Dukungan Produksi',
    '1. Menjabarkan, menyusun strategi pelaksanaan kebijakan Divisi Pemeliharaan & Perbaikan (Harkan) beserta program kerjanya dalam bidang perencanaan dan pemeliharaan fasilitas untuk mendukung berjalannya proses produksi.
2. Merencanakan, mengkoordinir & melaksanakan, mengevalusi serta melakukan perbaikan terhadap kegiatan pengelolaan fasilitas & sumber daya lainnya yaitu berupa pengelolaan fasilitas alat apung, alat kerja dan fasilitas lainnya untuk mendukung berjalannya proses produksi.
3. Menjabarkan, menyusun strategi pelaksanaan kebijakan Divisi Pemeliharaan & Perbaikan (Harkan) beserta program kerjanya dalam bidang utilisasi bengkel Maintenance, Dok Gali maupun Dok Apung.
4. Merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dalam bidang utilisasi bengkel Maintenance, Dok Gali maupun Dok Apung.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)',
    'Departemen Dok Gali',
    '1. Menjabarkan, menyusun strategi pelaksanaan kebijakan Divisi Pemeliharaan & Perbaikan (Harkan) beserta program kerjanya dalam bidang klarifikasi teknik, negosiasi spesifikasi, volume dan waktu penyelesaian pekerjaan, koordinasi serta penyelesaian administrasi teknik pelaksanaan pekerjaan kapal dengan owner yang meliputi: Berita Acara Docking/Undocking, Satisfaction Note, Docking Report, Berita Acara Penyelesaian Pekerjaan, Berita Acara Sea Trial dan lain-lain yang terkait dengan penyelesaian pekerjaan.
2. Mengkoordinir, mengevalusi serta mengendalikan progress proyek dan melakukan perbaikan terhadap kegiatan bidang pekerjaan proyek pemeliharaan dan perbaikan kapal, non kapal dan alat apung lainnya.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)',
    'Departemen Dok Apung',
    '1. Menjabarkan, menyusun strategi pelaksanaan kebijakan Divisi Pemeliharaan & Perbaikan (Harkan) beserta program kerjanya dalam bidang klarifikasi teknik, spesifikasi, volume dan waktu penyelesaian pekerjaan, koordinasi serta penyelesaian administrasi teknik pelaksanaan pekerjaan kapal dengan owner yang meliputi: Berita Acara Docking/Undocking, Satisfaction Note, Docking Report, Berita Acara Penyelesaian Pekerjaan, Berita Acara Sea Trial dan lain-lain yang terkait dengan penyelesaian pekerjaan.
2. Mengkoordinir, mengevaluasi serta mengendalikan progress proyek dan melakukan perbaikan terhadap kegiatan bidang pekerjaan proyek pemeliharaan dan perbaikan kapal, non kapal dan alat apung lainnya.'
);

INSERT INTO departments (division_id, name, description)
SELECT divisions.id, seed_departments.name, seed_departments.description
FROM seed_departments
JOIN divisions ON divisions.name = seed_departments.division_name
ON CONFLICT (division_id, name) DO UPDATE SET
    description = EXCLUDED.description;

CREATE TEMP TABLE seed_units (
    division_name TEXT,
    department_name TEXT,
    name TEXT,
    unit_type TEXT,
    description TEXT
) ON COMMIT DROP;

INSERT INTO seed_units VALUES
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Perencanaan & Pengendalian',
    'Biro Perencana', 'biro',
    'Merencanakan, mengkoordinasikan dan melaksanakan serta melakukan perbaikan terhadap pekerjaan di bidang implementasi Sistem Informasi Manajemen berkaitan dengan Rendal pekerjaan dan pengelolaan dan pengendalian keuangan, termasuk perencanaan (RKAP) untuk proyek Harkan kapal dan Harkan non kapal.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Perencanaan & Pengendalian',
    'Biro Rekayasa', 'biro',
    'Merencanakan, mengkoordinasikan dan melaksanakan, mengevaluasi serta melakukan perbaikan terhadap pekerjaan di bidang pekerjaan analisa dan evaluasi teknis yang berkaitan dengan permasalahan rekayasa (engineering) Harkan kapal, Harkan non kapal dan lainnya.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Perencanaan & Pengendalian',
    'Biro Analisa, Evaluasi, SDM dan Transformasi Teknologi', 'biro',
    '1. Merencanakan, mengkoordinasikan dan melaksanakan Analisa & Evaluasi project di lingkup Divisi Pemeliharaan & Perbaikan (Harkan).
2. Pengelolaan, pengembangan serta pengawasan SDM di lingkup Divisi Pemeliharaan & Perbaikan (Harkan).
3. Pengelolaan dan pengendalian keuangan, termasuk perencanaan (RKAP) untuk proyek Harkan kapal, Harkan non kapal.
4. Mengawal proses transformasi teknologi terkait implementasi Sistem Informasi Manajemen berkaitan dengan pekerjaan untuk proyek Harkan kapal, Harkan non kapal.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Produksi',
    'Biro Koordinasi Pekerjaan', 'biro',
    'Merencanakan dan mengendalikan penyiapan sumber daya (manusia, peralatan dan dokumen kerja) beserta dukungan rekayasa (engineering) untuk pelaksanaan pekerjaan / kegiatan yang diterima berdasarkan Job Card (JC) dan schedule pekerjaan.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Produksi',
    'Bengkel Konstruksi', 'bengkel',
    'Merencanakan, mengkoordinir, melaksanakan evaluasi dan melakukan perbaikan di bidang pelaksanaan dan pengendalian kegiatan konstruksi meliputi: marking, cutting, bending/fairing, perakitan dan pengelasan.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Produksi',
    'Bengkel Sistem Poros & Kemudi', 'bengkel',
    'Merencanakan, mengkoordinir, melaksanakan evaluasi dan melakukan perbaikan di bidang sistem poros & kemudi.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Produksi',
    'Bengkel Sistem Bantu dan Katup', 'bengkel',
    'Merencanakan, mengkoordinir, melaksanakan evaluasi dan melakukan perbaikan di bidang sistem bantu yang mencakup sistem pipa (air laut, air tawar, bahan bakar, oli, udara & hidrolik), sistem katup, lier jangkar, sistem pompa, kompresor, dan pesawat-pesawat bantu yang lain.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Produksi',
    'Bengkel Mesin Perkakas', 'bengkel',
    'Merencanakan, mengkoordinir, melaksanakan evaluasi dan melakukan perbaikan di bidang pekerjaan mesin perkakas atau machining meliputi bubut, frais, kolter, sekrap, bor, surface contact, balancing, pekerjaan kerja bangku.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Produksi',
    'Bengkel Permesinan', 'bengkel',
    'Merencanakan, mengkoordinir, melaksanakan evaluasi dan melakukan perbaikan di bidang permesinan yang meliputi: overhaul mesin-mesin 1000 PK dan testbench, aligment mesin, aligment gear box.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Produksi',
    'Bengkel Listrik dan Kontrol', 'bengkel',
    'Merencanakan, mengkoordinir, melaksanakan evaluasi dan melakukan perbaikan di bidang power listrik, instrumentasi listrik dan Kontrol sistem, instalasi, elmot, fire alarm, akomodasi pendukung.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Produksi',
    'Bengkel Blasting, Pengecatan dan Scaffolding', 'bengkel',
    'Merencanakan, mengkoordinir, melaksanakan evaluasi dan melakukan perbaikan di bidang Blasting, Pengecatan dan Scaffolding.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Dukungan Produksi',
    'Biro Perencanaan & Persiapan Fasilitas Produksi', 'biro',
    'Merencanakan, mengkoordinir & melaksanakan, mengevalusi serta melakukan perbaikan terhadap sumber daya dan pekerjaan dukungan pelayanan sarana apung yang meliputi: alat angkat & angkut apung dan kapal tunda serta segala aspeknya untuk menunjang kegiatan produksi.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Dukungan Produksi',
    'Bengkel Maintenance', 'bengkel',
    'Merencanakan, mengkoordinir & melaksanakan, mengevalusi serta melakukan perbaikan terhadap sumber daya pemeliharaan fasilitas produksi dengan segala aspeknya untuk menunjang kegiatan produksi.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Dukungan Produksi',
    'Bengkel Dok Gali', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam bidang pelayanan dan pengelolaan pengedokan (docking/undocking) Dok Gali.'
),
(
    'Divisi Pemeliharaan & Perbaikan (Harkan)', 'Departemen Dukungan Produksi',
    'Bengkel Dok Apung', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam bidang pelayanan dan pengelolaan pengedokan (docking/undocking) Dok Apung.'
);

INSERT INTO bureaus (department_id, name, unit_type, description)
SELECT departments.id, seed_units.name, seed_units.unit_type, seed_units.description
FROM seed_units
JOIN divisions ON divisions.name = seed_units.division_name
JOIN departments
    ON departments.division_id = divisions.id
   AND departments.name = seed_units.department_name
ON CONFLICT (department_id, name) DO UPDATE SET
    unit_type = EXCLUDED.unit_type,
    description = EXCLUDED.description;
