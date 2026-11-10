CREATE TEMP TABLE seed_divisions (
    name TEXT,
    description TEXT,
    secretariat_name TEXT,
    secretariat_description TEXT
) ON COMMIT DROP;

INSERT INTO seed_divisions VALUES (
    'Divisi Kapal Selam',
    'Mengelola penyelesaian proyek di Divisi Kapal Selam sesuai kontrak melalui pengendalian jadwal, biaya dan kualitas proyek dan mengkaji risiko dan segala dampak perubahan terhadap scope pekerjaan, waktu/jadwal, biaya pada kontrak serta melakukan mitigasinya, mendetilkan scope of work proyek yang akan dikerjakan di dalam atau di luar PT PAL Indonesia.',
    'Sekretariat Divisi Kapal Selam',
    'Melakukan kegiatan kesekretariatan yang meliputi administrasi umum, administrasi personil, kerumahtanggaan, pengelolaan dan penyimpanan dokumen-dokumen Divisi Kapal Selam.'
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
    'Divisi Kapal Selam',
    'Departemen Dukungan Material',
    '1. Mengkoordinasikan dan melaksanakan pengambilan, pengelompokan dan tatakelola material (Palletizing, perawatan dan distribusi) sesuai dengan proses produksi untuk mencapai kualitas, biaya dan jadwal proyek Divisi Kapal Selam.
2. Mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan sesuai program kerja Divisi Kapal Selam.
3. Melaksanakan fungsi dukungan administrasi dan keuangan untuk mendukung RKAP Divisi Kapal Selam.'
),
(
    'Divisi Kapal Selam',
    'Departemen Lambung',
    'Menjabarkan dan melaksanakan program kerja Divisi Kapal Selam atas kegiatan operasional yang mencakup perencanaan, persiapan pelaksanaan, pengkoordinasian dan pengendalian pekerjaan yang berkaitan dengan seluruh pekerjaan assembly badan tekan, assembly non badan tekan, installation penetration, installation poundation, erection, welding, tank test, serta painting.'
),
(
    'Divisi Kapal Selam',
    'Departemen Perlengkapan',
    'Menyusun Strategi Produksi, memonitor dan mengkoordinasikan aspek-aspek produksi yang berkaitan dengan piping & GRP part, machinery part, steel outfitting part, serta ECW part yang meliputi proses fabrikasi, assembly, instalasi dan membantu kegiatan proses pengujian dan pengetesan.'
),
(
    'Divisi Kapal Selam',
    'Departemen Dukungan Produksi',
    'Menjabarkan dan melaksanakan program kerja Divisi Kapal Selam dalam bidang pemberian dukungan, baik terhadap kegiatan produksi maupun operasional dalam lingkup Divisi Kapal Selam.'
),
(
    'Divisi Kapal Selam',
    'Departemen Perencanaan dan Pengendalian',
    'Menjabarkan dan melaksanakan program kerja Divisi Kapal Selam dalam bidang Perencanaan dan Pengendalian Produksi yang meliputi: perencanaan, strategi, dan biaya di bidang pembangunan, overhaul dan warranty Kapal Selam untuk mencapai kualitas, biaya dan jadwal sesuai program kerja yang telah ditetapkan dalam lingkup Divisi Kapal Selam.'
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
    'Divisi Kapal Selam', 'Departemen Dukungan Material',
    'Biro Painting, GRP, Hull Material', 'biro',
    '1. Mengkoordinasikan dan melaksanakan pengambilan, pengelompokan dan tatakelola material (perawatan dan distribusi) sesuai dengan proses produksi untuk mencapai kualitas, biaya dan jadwal proyek Divisi Kapal Selam.
2. Mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan sesuai program kerja Divisi Kapal Selam.'
),
(
    'Divisi Kapal Selam', 'Departemen Dukungan Material',
    'Biro Piping & Machinery Material', 'biro',
    '1. Mengkoordinasikan dan melaksanakan pengambilan, pengelompokan dan tatakelola material (perawatan dan distribusi) sesuai dengan proses produksi untuk mencapai kualitas, biaya dan jadwal proyek Divisi Kapal Selam.
2. Mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan sesuai program kerja Divisi Kapal Selam.'
),
(
    'Divisi Kapal Selam', 'Departemen Dukungan Material',
    'Biro Steel Outfitting & ECW Material', 'biro',
    '1. Mengkoordinasikan dan melaksanakan pengambilan, pengelompokan dan tatakelola material (perawatan dan distribusi) sesuai dengan proses produksi untuk mencapai kualitas, biaya dan jadwal proyek Divisi Kapal Selam.
2. Mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan sesuai program kerja Divisi Kapal Selam.'
),
(
    'Divisi Kapal Selam', 'Departemen Dukungan Material',
    'Biro Dukungan Administrasi', 'biro',
    'Melaksanakan fungsi dukungan administrasi dan keuangan untuk mendukung RKAP Divisi Kapal Selam.'
),
(
    'Divisi Kapal Selam', 'Departemen Lambung',
    'Bengkel Assembly PHPL', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Lambung dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan pekerjaan fabrikasi badan tekan di assembly PHPL, penyetelan dan pengelasan komponen serta pengecekan akurasi dan kualitas hasil produksi.'
),
(
    'Divisi Kapal Selam', 'Departemen Lambung',
    'Bengkel Assembly Non PH', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Lambung dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan pekerjaan fabrikasi non pressure hull, penyetelan dan pengelasan komponen serta pengecekan akurasi dan kualitas hasil produksi.'
),
(
    'Divisi Kapal Selam', 'Departemen Lambung',
    'Bengkel Erection & Panting', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Lambung dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan installation, erection dan tank test serta pekerjaan, blasting dan pengecatan pada hasil produksi fabrikasi dan assembly.'
),
(
    'Divisi Kapal Selam', 'Departemen Perlengkapan',
    'Bengkel Pipa & GRP', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Perlengkapan Kapal dalam bidang pelaksanaan dan pengendalian kegiatan produksi meliputi fabrikasi dan instalasi pipa dan Fitting, Pressure Test dan Flushing serta kegiatan Insulation, cover dan casing GRP.'
),
(
    'Divisi Kapal Selam', 'Departemen Perlengkapan',
    'Bengkel Steel Outfitting', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Perlengkapan Kapal dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan produksi meliputi fabrikasi dan instalasi steel outfitting.'
),
(
    'Divisi Kapal Selam', 'Departemen Perlengkapan',
    'Bengkel Machinery Outfitting', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Perlengkapan Kapal dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan machining dan instalasi.'
),
(
    'Divisi Kapal Selam', 'Departemen Perlengkapan',
    'Bengkel ECW (Electric, Communication, Weapon)', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Perlengkapan Kapal dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan fabrikasi dan instalasi electric, communication dan weapon.'
),
(
    'Divisi Kapal Selam', 'Departemen Dukungan Produksi',
    'Biro Pemeliharaan', 'biro',
    'Menyusun Strategi, mengkoordinir, melaksanakan dan mengevalusi kegiatan serta melakukan pemeliharaan terhadap sumber daya fasilitas produksi dengan segala aspeknya untuk menunjang kegiatan produksi.'
),
(
    'Divisi Kapal Selam', 'Departemen Dukungan Produksi',
    'Biro Alat Angkat dan Alat Angkut', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam bidang penyiapan dan pengoperasian alat angkat, alat angkut untuk mendukung proses produksi di Divisi Kapal Selam.'
),
(
    'Divisi Kapal Selam', 'Departemen Dukungan Produksi',
    'Biro Utilitas', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam bidang Utilitas untuk mendukung proses produksi di Divisi Kapal Selam.'
),
(
    'Divisi Kapal Selam', 'Departemen Perencanaan dan Pengendalian',
    'Biro Rekayasa Produksi', 'biro',
    'Melaksanakan perencanaan, pengelolaan, dan pengendalian seluruh proses pembangunan kapal, mulai dari tahap perancangan hingga uji coba dan pemeliharaan, guna memastikan efisiensi, kualitas, serta ketepatan waktu dalam pelaksanaan proyek, serta merencanakan program pelatihan dan Transfer of Technology (ToT).'
),
(
    'Divisi Kapal Selam', 'Departemen Perencanaan dan Pengendalian',
    'Biro Perencanaan Pekerjaan', 'biro',
    'Melaksanakan perencanaan, pengelolaan, dan pengendalian proses produksi kapal dengan menyusun Work Breakdown Structure (WBS), perencanaan jadwal, pengadaan sumber daya dan anggaran guna memastikan kelancaran, efisiensi, dan efektivitas produksi sesuai dengan standar yang ditetapkan.'
),
(
    'Divisi Kapal Selam', 'Departemen Perencanaan dan Pengendalian',
    'Biro Pengendalian Produksi', 'biro',
    'Melaksanakan pengelolaan dan pengendalian proses produksi serta pemeliharaan kapal melalui identifikasi dan analisis risiko, pemantauan kinerja produksi, evaluasi efektivitas tenaga kerja, pengendalian anggaran proyek, serta koordinasi dengan unit kerja terkait guna memastikan kelancaran, efisiensi, dan keberlanjutan proyek sesuai dengan standar dan perencanaan yang telah ditetapkan.'
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
