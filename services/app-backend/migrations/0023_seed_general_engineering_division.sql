CREATE TEMP TABLE seed_divisions (
    name TEXT,
    description TEXT,
    secretariat_name TEXT,
    secretariat_description TEXT
) ON COMMIT DROP;

INSERT INTO seed_divisions VALUES (
    'Divisi Rekayasa Umum',
    '1. Menjabarkan, menyusun strategi pelaksanaan strategi perusahaan beserta program kerja di bidang pembangunan proyek-proyek Rekayasa Umum, pengendalian integrasi kegiatan produksi, pengendalian operasional sesuai QCD-HSE dan produktivitas SDM di Divisi Rekayasa Umum sesuai dengan target yang ditetapkan perusahaan.
2. Merencanakan, mengkoordinasikan dan mengendalikan sumber daya untuk pelaksanaan pekerjaan pembangunan proyek-proyek Rekayasa Umum dalam rangka menunjang kegiatan produksi, dan operasional perusahaan dan bertanggungjawab terhadap Quality, Cost & Delivery sesuai yang telah ditetapkan perusahaan.',
    'Sekretariat Divisi Rekayasa Umum',
    'Melakukan kegiatan kesekretariatan yang meliputi administrasi umum, administrasi personil, kerumahtanggaan dan keuangan di lingkungan sekretariat Divisi Rekayasa Umum dan bertanggungjawab terhadap Quality, Cost, Delivery sesuai yang telah ditetapkan perusahaan.

Sedangkan untuk fungsi Koordinator Proyek bertanggungjawab melaksanakan koordinasi jalannya proyek produk-produk rekayasa umum dibawah kendali Divisi Rekayasa Umum, dan bertanggungjawab terhadap pengendalian Quality, Cost, Delivery proyek yang menjadi tanggungjawabnya sesuai yang telah ditetapkan perusahaan.'
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
    'Divisi Rekayasa Umum',
    'Departemen Perencanaan & Pengendalian',
    '1. Merencanakan, mengkoordinasikan dan mengendalikan sumber daya dalam bidang Perencanaan & Pengendalian proses produksi di bidang rekayasa umum.
2. Menjabarkan, Menyusun strategi pelaksanaan kebijakan Divisi Rekayasa Umum beserta program kerjanya dalam bidang perencanaan & pengendalian proses produksi di bidang Rekayasa Umum sesuai ketentuan yang berlaku dan bertanggungjawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.
3. Merencanakan, menyiapkan dan memastikan seluruh sarana & fasilitas produksi dapat digunakan dengan baik untuk proses produksi pembangunan produk-produk rekayasa umum.'
),
(
    'Divisi Rekayasa Umum',
    'Departemen Permesinan & Perakitan',
    'Mengelola, Melaksanakan dan mengevaluasi program kerja Divisi Rekayasa Umum di bidang permesinan dan perakitan dalam lingkup Divisi Rekayasa Umum secara berdaya guna dan berhasil guna, sehingga mendapatkan nilai tambah yang optimal dengan memperhatikan aspek Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum',
    'Departemen Fabrikasi & Konstruksi',
    'Mengelola, Melaksanakan dan mengevaluasi program kerja Divisi Rekayasa Umum dalam bidang fabrikasi dan konstruksi dalam lingkup rekayasa umum secara berdaya guna dan berhasil guna, sehingga mendapatkan nilai tambah yang optimal dengan memperhatikan aspek Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
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
    'Divisi Rekayasa Umum', 'Departemen Perencanaan & Pengendalian',
    'Biro Persiapan Produksi', 'biro',
    'Mengelola dan Melaksanakan program kerja Departemen Perencanaan & Pengendalian dalam bidang persiapan kegiatan produksi di lingkup Departemen Perencanaan & Pengendalian dan bertanggungjawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Perencanaan & Pengendalian',
    'Biro Dukungan Administrasi & SDM', 'biro',
    'Menjabarkan dan melaksanakan program kerja Divisi Kapal Permukaan dalam bidang kegiatan operasional yang mencakup perencanaan, persiapan pelaksanaan, pengkoordinasian dan pengendalian pekerjaan yang berkaitan dengan seluruh pekerjaan fabrikasi dan instalasi outfitting lambung dan outfitting akomodasi sampai dengan pelaksanaan testing dan commissioning (HAT & SAT) serta bertindak sebagai operator sistem dalam kapal (sementara) sampai dengan serah terima kepada pemilik kapal.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Perencanaan & Pengendalian',
    'Biro Sarana & Fasilitas', 'biro',
    'Merencanakan, mengkoordinasikan dan mengendalikan sumber daya dan pekerjaan di bidang Sarana & Fasilitas sesuai dengan ketentuan yang berlaku sesuai dengan program kerja Departemen Perencanaan & Pengendalian dan bertanggungjawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Perencanaan & Pengendalian',
    'Biro Perencana Produksi', 'biro',
    'Merencanakan, mengkoordinasikan dan mengendalikan sumber daya dan pekerjaan di bidang perencanaan produksi sesuai dengan kebijakan dan ketentuan yang berlaku sesuai dengan program kerja Departemen Perencanaan & Pengendalian dan bertanggung jawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan Perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Perencanaan & Pengendalian',
    'Biro Pengendalian Produksi', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Perencanaan & Pengendalian bidang pengendalian produksi terhadap aspek-aspek produksi sesuai dengan program kerja Departemen Perencanaan & Pengendalian terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Permesinan & Perakitan',
    'Bengkel CNC', 'bengkel',
    'Mengelola, Melaksanakan dan mengevaluasi program kerja Departemen Permesinan & Perakitan dalam pelaksanaan pekerjaan permesinan dan bertanggungjawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Permesinan & Perakitan',
    'Bengkel Perakitan', 'bengkel',
    'Mengelola, Melaksanakan dan mengevaluasi program kerja Departemen Permesinan & Perakitan dalam pelaksanaan pekerjaan perakitan komponen-komponen menjadi produk jadi dan melaksanakan uji coba fungsi produk tersebut dan bertanggungjawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Permesinan & Perakitan',
    'Bengkel Listrik dan Instrumen', 'bengkel',
    'Mengelola, Melaksanakan dan mengevaluasi program kerja Departemen Permesinan & Perakitan dalam pelaksanaan pekerjaan listrik dan Instrumen dan bertanggungjawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Fabrikasi & Konstruksi',
    'Bengkel Fabrikasi Plat', 'bengkel',
    'Mengelola, Melaksanakan dan mengevaluasi program kerja Departemen Fabrikasi & Konstruksi dalam pelaksanaan pekerjaan fabrikasi plat dan bertanggungjawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Fabrikasi & Konstruksi',
    'Bengkel Konstruksi Plat I', 'bengkel',
    'Mengelola, Melaksanakan dan mengevaluasi program kerja Departemen Fabrikasi & Konstruksi dalam pelaksanaan pekerjaan konstruksi plat dengan kapasitas maksimum 32 ton dan bertanggungjawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Fabrikasi & Konstruksi',
    'Bengkel Konstruksi Plat II', 'bengkel',
    'Mengelola, Melaksanakan dan mengevaluasi program kerja Departemen Fabrikasi & Konstruksi dalam pelaksanaan pekerjaan konstruksi plat dengan kapasitas maksimum 80 ton dan bertanggungjawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Fabrikasi & Konstruksi',
    'Bengkel Pipa', 'bengkel',
    'Mengelola, Melaksanakan dan mengevaluasi program kerja Departemen Fabrikasi & Konstruksi dalam pelaksanaan pekerjaan konstruksi pipa dan bertanggung jawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
),
(
    'Divisi Rekayasa Umum', 'Departemen Fabrikasi & Konstruksi',
    'Bengkel Blasting, Pengecetan & Pengepakan', 'bengkel',
    'Mengelola, Melaksanakan dan mengevaluasi program kerja Departemen Fabrikasi & Konstruksi dalam pelaksanaan pekerjaan blasting, pengecatan dan pengepakan dan bertanggungjawab terhadap Quality, Cost dan Delivery sesuai yang telah ditetapkan perusahaan.'
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
