CREATE TEMP TABLE seed_divisions (
    name TEXT,
    description TEXT,
    secretariat_name TEXT,
    secretariat_description TEXT
) ON COMMIT DROP;

INSERT INTO seed_divisions VALUES (
    'Divisi Kapal Permukaan',
    '1. Menjabarkan, menyusun strategi pelaksanaan kebijakan perusahaan beserta program kerja di bidang pembangunan kapal baru jenis kapal niaga, kapal perang, kapal cepat dan kapal-kapal jenis lain berdasarkan IPP yang telah ditetapkan Direksi secara berdaya guna dan berhasil guna dengan memperhatikan QCDHSE (Quality, cost, delivery time, health, safety, environment) sehingga mendapatkan nilai tambah dan keuntungan yang optimal.
2. Menyusun strategi pelaksanaan, mengkoordinasikan dan melaksanakan pengawasan sumber daya untuk pembangunan kapal baru jenis kapal niaga, kapal perang, kapal cepat, dan kapal-kapal jenis lain.',
    'Sekretariat Divisi Kapal Permukaan',
    'Melakukan kegiatan kesekretariatan yang meliputi ketatausahaan, kerumahtanggaan dan keuangan di lingkungan Divisi Kapal Permukaan.'
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
    'Divisi Kapal Permukaan',
    'Departemen Perencanaan dan Pengendalian',
    '1. Menjabarkan, menyusun strategi pelaksanaan kebijakan Divisi Kapal Permukaan beserta program kerjanya dalam bidang perencanaan dan pengendalian proses produksi pada proyek pembangunan kapal.
2. Merencanakan, mengkoordinasikan dan mengendalikan sumber daya dalam hal perencanaan dan pengendalian proses produksi pada proyek pembangunan kapal.'
),
(
    'Divisi Kapal Permukaan',
    'Departemen Konstruksi 1',
    'Menjabarkan dan melaksanakan program kerja Divisi Kapal Permukaan dalam bidang perencanaan, pelaksanaan, pengkoordinasian dan pengendalian pekerjaan yang berkaitan dengan seluruh pekerjaan konstruksi lambung, fabrikasi, sub assembly, assembly dan block blasting & painting.'
),
(
    'Divisi Kapal Permukaan',
    'Departemen Konstruksi 2',
    'Menjabarkan dan melaksanakan program kerja Divisi Kapal Permukaan dalam bidang perencanaan, pelaksanaan, pengkoordinasian dan pengendalian pekerjaan yang berkaitan dengan fabrikasi, sub assembly, assembly dan blasting serta painting (shop priming, block & outfitiing painting serta onboard painting).'
),
(
    'Divisi Kapal Permukaan',
    'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
    'Menjabarkan dan melaksanakan program kerja Divisi Kapal Permukaan dalam bidang kegiatan operasional yang mencakup perencanaan, persiapan pelaksanaan, pengkoordinasian dan pengendalian pekerjaan yang berkaitan dengan seluruh pekerjaan fabrikasi dan instalasi outfitting lambung dan outfitting akomodasi sampai dengan pelaksanaan testing dan commissioning (HAT & SAT) serta bertindak sebagai operator sistem dalam kapal (sementara) sampai dengan serah terima kepada pemilik kapal.'
),
(
    'Divisi Kapal Permukaan',
    'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 2',
    'Menjabarkan dan melaksanakan program kerja Divisi Kapal Permukaan dalam bidang kegiatan operasional yang mencakup perencanaan, persiapan pelaksanaan, pengkoordinasian dan pengendalian pekerjaan yang berkaitan dengan seluruh pekerjaan fabrikasi dan instalasi outfitting lambung dan outfitting akomodasi sampai dengan pelaksanaan testing dan commissioning (HAT & SAT) serta bertindak sebagai operator sistem dalam kapal (sementara) sampai dengan serah terima kepada pemilik kapal.'
),
(
    'Divisi Kapal Permukaan',
    'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
    'Mengelola, melaksanakan dan mengevaluasi program kerja Divisi Kapal Permukaan atas kegiatan operasional yang mencakup perencanaan, persiapan pelaksanaan, pengkoordinasian dan pengendalian pekerjaan yang berkaitan dengan seluruh pekerjaan fabrikasi perpipaan, instalasi pipa E/R, instalasi outfitting permesinan dan welding beserta kelistrikan maupun elektronik termasuk sistem kontrol sampai dengan pelaksanaan testing dan commissioning (HAT & SAT) serta bertindak sebagai operator sistem dalam kapal (sementara) sampai dengan serah terima kepada pemilik kapal.'
),
(
    'Divisi Kapal Permukaan',
    'Departemen Erection',
    'Menjabarkan dan melaksanakan program kerja Divisi Kapal Permukaan atas kegiatan operasional yang mencakup perencanaan, persiapan pelaksanaan, pengkoordinasian dan pengendalian pekerjaan yang berkaitan dengan seluruh pekerjaan erection, grand assembly, welding, supporting perancah serta tank test sampai dengan diterima Biro Klasifikasi dan Pemilik Kapal sesuai dengan standar yang berlaku.'
),
(
    'Divisi Kapal Permukaan',
    'Departemen Dukungan Produksi',
    '1. Menjabarkan, menyusun strategi pelaksanaan kebijakan Divisi Kapal Permukaan beserta program kerjanya dalam bidang pemberian dukungan, baik terhadap kegiatan produksi dan proses administrasinya dalam lingkup Divisi Kapal Permukaan.
2. Merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dalam bidang pemberian dukungan terhadap kegiatan produksi dan proses administratif.'
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
    'Divisi Kapal Permukaan', 'Departemen Perencanaan dan Pengendalian',
    'Biro Perencanaan', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Perencanaan dan Pengendalian dalam bidang Perencanaan Hull Outfitting & Accomodation Outfitting untuk mendukung proses produksi.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Perencanaan dan Pengendalian',
    'Biro Pengendalian', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Perencanaan dan Pengendalian dalam bidang Pengendalian Produksi terkait dengan kinerja produksi untuk mendukung proses produksi.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Perencanaan dan Pengendalian',
    'Biro Rekayasa Produksi 1', 'biro',
    'Merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan di bidang perencanaan dan penyusunan prosedur produksi serta pengendalian akurasi sesuai dengan program kerja Departemen terutama.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Perencanaan dan Pengendalian',
    'Biro Rekayasa Produksi 2', 'biro',
    'Merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan di bidang perencanaan dan penyusunan prosedur produksi serta pengendalian akurasi sesuai dengan program kerja Departemen.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Perencanaan dan Pengendalian',
    'Biro Konstruksi', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Perencanaan dan Pengendalian dalam bidang Konstruksi untuk mendukung proses produksi.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Perencanaan dan Pengendalian',
    'Biro Outfitting', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Perencanaan dan Pengendalian dalam bidang Machinery Outfitting & Electric/Electronic (MO/EO) untuk mendukung proses produksi.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Perencanaan dan Pengendalian',
    'Biro Administrasi', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Perencanaan dan pengendalian dalam bidang pengelolaan dan pengendalian keuangan, termasuk perencanaan RKAP divisi dan pencatatan realisasi serta evaluasinya.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Perencanaan dan Pengendalian',
    'Biro Paletisasi Produksi', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam rangka merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan di bidang pendistribusian dan penyusunan / pengelompokan material sesuai paket pekerjaan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Konstruksi 1',
    'Bengkel Fabrikasi dan SSH', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Konstruksi 1 dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan penerimaan raw material (plate & profile) dari gudang, shot blasting dan shop priming serta assorting raw material, penandaan, pemotongan, pembentukan, penggerindaan dan assorting beserta pengiriman komponen hasil produksi, serta penerimaan material plat dari gudang pusat, pemetaan material plat sesuai dimensinya, pemetaan material plat sesuai kebutuhan per blok.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Konstruksi 1',
    'Bengkel Assembly MPL', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Konstruksi 1 dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan pekerjaan assembly block di main panel line, penyetelan dan pengelasan komponen serta pemeriksaan akurasi kontrol dan kualitas hasil produksi.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Konstruksi 1',
    'Bengkel Assembly CBL', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Konstruksi 1 dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan block assembly di curve block line, penyetelan dan pengelasan komponen serta pemeriksaan akurasi kontrol dan kualitas hasil produksi.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Konstruksi 1',
    'Bengkel Block Blasting (BBS)', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Konstruksi 1 dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan steel work preparation, blasting dan painting pada hasil produksi fabrikasi, sub assembly dan assembly termasuk hasil fabrikasi outfitting berukuran besar.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Konstruksi 1',
    'Bengkel Sub Assembly', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Konstruksi 1 dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan perakitan panel blok, pengelasan panel blok maupun blok berukuran kecil, persiapan akurasi kontrol dan kualitas blok pada proyek pembangunan kapal.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Konstruksi 2',
    'Bengkel Fabrikasi', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Konstruksi 2 dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan penerimaan raw material (plate & profile) dari gudang pusat, pemetaan raw material sesuai dimensinya, pemetaan raw material sesuai kebutuhan per blok, marking, cutting, pembentukan, penggerindaan, assorting dan pengiriman komponen hasil fabrikasi.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Konstruksi 2',
    'Bengkel Assembly', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Konstruksi 2 dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan pekerjaan sub assembly dan assembly block, penyetelan serta pengecekan akurasi dan kualitas hasil produksi.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Konstruksi 2',
    'Bengkel Block Blasting (BBS) & Painting', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Konstruksi 2 dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan steel work preparation, blasting dan painting pada hasil produksi assembly maupun outfitting serta pelaksanaan painting onboard.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Konstruksi 2',
    'Bengkel Aluminium', 'bengkel',
    'Merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan di bidang perencanaan, pelaksanaan dan pengendalian pembuatan komponen dan perakitan konstruksi kapal aluminium di dalam atau di luar ruangan hangar.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Konstruksi 2',
    'Bengkel Las Konstruksi', 'bengkel',
    'Merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan dibidang pengelasan dan pengendalian kegiatan pengelasan komponen sub assembly, assembly block, ring block sampai menjadi modul kapal.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
    'Bengkel Sistem Hull Outfitting 1', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 1 dalam perencanaan, pelaksanaan dan pengendalian pekerjaan kelengkapan (accessories) HO, install pipa & support, press test & flushing, deck machinery mulai loading equipment HO sampai dengan test & commissioning (HAT & SAT).'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
    'Bengkel Las HO & AO 1', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 1 dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan produksi yang terkait pekerjaan welding HO & AO.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
    'Bengkel Interior 1', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 1 dalam perencanaan, pelaksanaan dan pengendalian pekerjaan fabrikasi & install furniture, install interior, fabrikasi steel joist, live saving, insulation, install lining/ceiling, install lavatory dan install inventory.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
    'Bengkel Sistem Accommodation Outfitting', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 1 dalam perencanaan, pelaksanaan dan pengendalian pekerjaan install pipa & support AO, test fungsi sistem pipa AO, tes fungsi equipment maupun system AO (HAT & SAT).'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
    'Bengkel Cat Hull Outfitting', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 1 dalam perencanaan, pelaksanaan dan pengendalian kegiatan pekerjaan blasting & painting Hull Outfitting (painting & blasting area outside shell, cargo, deck, bottom shell, dan tanki-tanki), water jet, dan repair painting meliputi tahapan pekerjaan painting joint block sampai dengan kapal maupun non kapal diserahkan ke owner.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
    'Bengkel Cat Accommodation Outfitting & Engine Room', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 1 dalam perencanaan, pelaksanaan, dan pengendalian kegiatan pekerjaan di workshop (galvanizing, pickling, blasting, painting raw material maupun hasil fabrication steel work & pipe) dan pekerjaan surface preparation serta painting lingkup inside ship (Accommodation Outfitting & Engine Room), repair painting, dan painting equipment system pada proyek kapal maupun non kapal sampai dengan diserahkan kepada owner.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
    'Bengkel FOBS HO & AO', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 1 dalam perencanaan, pelaksanaan dan pengendalian pekerjaan install steel work di luar area Engine Room (Shell, Main Deck, Fore Castle, WBT, Cargo space, Steering Gear Room, Bow Thruster Room dan Accommodation dll.) serta install supporting equipment system, test fungsi, sampai dengan commissioning (HAT & SAT) diterima Class maupun Owner.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 1',
    'Bengkel Fabrikasi Plat Tipis', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 1 dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan fabrikasi komponen perlengkapan lambung (Hull Outfitting Fabrication).'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 2',
    'Bengkel Sistem Hull Outfitting 2', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 2 dalam perencanaan, pelaksanaan dan pengendalian pekerjaan Perpipaan baik fabrikasi maupun install dilingkup MO, HO & AO yang meliputi install pipa & support, press test & flushing sampai dengan test & commissioning (HAT & SAT).'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 2',
    'Bengkel Las HO & AO 2', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 2 dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan produksi yang terkait pekerjaan welding MO, HO, & AO.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 2',
    'Bengkel Interior 2', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 2 dalam perencanaan, pelaksanaan dan pengendalian pekerjaan fabrikasi & install furniture, install interior, fabrikasi steel joist, live saving, insulation, install lining/ceiling, install lavatory dan install inventory.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Hull Outfitting & Accomodation Oufitting (HO&AO) 2',
    'Bengkel Steel Work', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen HO & AO 2 dalam Merencanakan, mengkoordinasikan dan melaksanakan pangawasan sumber daya dan pekerjaan di bidang pelaksanaan dan pengendalian kegiatan fabrikasi dan install pintu, jendela, fondasi peralatan kapal meliputi paralatan di dek, akomodasi dan kamar mesin, pemasangan galley, life boat, deck crane sesuai dengan program kerja.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
    'Bengkel Pipa', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen MO & EO dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan perpipaan baik fabrikasi di lingkup MO, HO, & AO maupun install pipa & support, press test & flushing dilingkup Engine Room sampai dengan test & commissioning (HAT & SAT).'
),
(
    'Divisi Kapal Permukaan', 'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
    'Bengkel Las MO & EO', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen MO & EO dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan produksi yang berkaitan pekerjaan Welding dilingkup MO & EO.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
    'Bengkel Steel Work Engine Room', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen MO & EO dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan pekerjaan instalasi steel work di area engine room dan dan fungsi pengawasan material perpipaan serta pengawasan instalasi peralatan di E/R.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
    'Bengkel Mesin 1', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen MO & EO dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan produksi lingkup pekerjaan permesinan (machining).'
),
(
    'Divisi Kapal Permukaan', 'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
    'Bengkel Mesin 2', 'bengkel',
    'Merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan di bidang pelaksanaan dan pengendalian kegiatan loading dan pemasangan equipment (mesin pokok, mesin bantu, propulsi, pompa-pompa, dan deck machinery) serta kelengkapannya, pemasangan sistem heating ventilating dan air conditioning sampai dengan function test untuk pembangunan kapal maupun non kapal.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
    'Bengkel Machinery Outfitting', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen MO & EO dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan produksi instalasi machinery outfitting, accessories dan flushing piping system sampai dengan pelaksanaan testing & commisioning (HAT & SAT) sampai dengan kapal diserah terimakan kepada Owner.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
    'Bengkel Electric Outfitting 1', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen MO & EO dalam bidang perencanaan, pelaksanaan dan pengendalian kegiatan produksi fabrikasi dan main & sub cable way beserta penetration coaming, instalasi kelistrikan dan elektronik sampai dengan pelaksanaan testing & commisioning (HAT & SAT) sampai dengan kapal diserah terimakan kepada Owner.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
    'Bengkel Electric Outfitting 2', 'bengkel',
    'Merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pelaksanaan pekerjaan serta pengendalian kegiatan pemasangan cable tray, cable coaming, cable wiring, electric panel, lighting, MSB dan generator serta connection, line check sampai dengan comissioning, function test, HAT dan SAT pada pembangunan kapal sesuai dengan program kerja departemen.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Machinery Outfitting & Electric Outfitting (MO & EO)',
    'Bengkel Electronic & Control System Outfitting', 'bengkel',
    'Merancanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pelaksanaan pekerjaan serta pengendalian kegiatan pemasangan peralatan electronic & navigation, communication, electronic panel, electronic & navigation communication, wiring, connection, line check sampai dengan commissioning, function test, HAT dan SAT pada pembangunan kapal.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Erection',
    'Bengkel Grand Assembly', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Erection dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan adjusting grand block, fit-up joint block beserta komponen konstruksi didalamnya dan melaksanakan pengelolaan keakuratan dimensi dan pemeriksaan zero margin bersama-sama dengan Tim Akurasi Kontrol terutama di area Grand Assembly.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Erection',
    'Bengkel Erection 1', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Erection dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan erection joint yang meliputi penataan keel block, loading block, adjusting block dan fit-up joint serta pemeriksaan keakuratan dimensi, pemeriksaan zero margin dan keel deflection bersama-sama dengan Tim Akurasi Kontrol di building berth yang telah direncanakan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Erection',
    'Bengkel Erection 2', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Erection dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan erection joint yang meliputi penataan keel block, loading block, adjusting block dan fit-up joint serta pemeriksaan keakuratan dimensi, pemeriksaan zero margin dan keel deflection bersama-sama dengan Tim Akurasi Kontrol di building berth yang telah direncanakan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Erection',
    'Bengkel Erection 3', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Erection dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan erection joint yang meliputi penataan keel block, loading block, adjusting block dan fit-up joint serta pemeriksaan keakuratan dimensi, pemeriksaan zero margin dan keel deflection bersama-sama dengan Tim Akurasi Kontrol di building berth yang telah direncanakan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Erection',
    'Bengkel Las 1', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Erection dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan pengelasan konstruksi kapal di workshop maupun di lokasi konstruksi yang ditentukan terutama joint grand block maupun joint erection beserta konstruksi penyerta di dalamnya sampai dengan hasil kualitas pengelasan diterima Biro Klasifikasi dan atau Pemilik Kapal berdasar prosedur dan standar yang berlaku.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Erection',
    'Bengkel Las 2', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Erection dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan pengelasan konstruksi kapal di workshop maupun di lokasi konstruksi yang ditentukan terutama joint grand block maupun joint erection beserta konstruksi penyerta di dalamnya sampai dengan hasil kualitas pengelasan diterima Biro Klasifikasi dan atau Pemilik Kapal berdasar prosedur dan standar yang berlaku.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Erection',
    'Bengkel Perancah & Tank Test', 'bengkel',
    'Menjabarkan dan melaksanakan program kerja Departemen Erection dalam bidang perencanaan, pelaksanaan dan pengendalian pekerjaan pemasangan, pembongkaran, penyimpanan dan perawatan perancah sesuai kebutuhan proses produksi serta mengelola dan melaksanakan tank test sesuai standar keberterimaan yang berlaku.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Dukungan Produksi',
    'Biro Pemeliharaan & Perbaikan Fasilitas', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam bidang pemeliharaan dan perbaikan mesin-mesin, sarana dan fasilitas kerja di Divisi Kapal Permukaan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Dukungan Produksi',
    'Biro Pemeliharaan & Perbaikan Aset', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam rangka merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan dalam bidang pemeliharaan dan perbaikan mesin-mesin, sarana dan fasilitas kerja di Divisi Kapal Permukaan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Dukungan Produksi',
    'Biro Alat Angkat & Alat Angkut', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam bidang pelayanan dan pengoperasian fasilitas alat angkat dan alat angkut produksi di Divisi Kapal Permukaan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Dukungan Produksi',
    'Biro Dock & Launching', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam bidang penyiapan dan pengoperasian fasilitas dermaga, ship lift, dock dan launching di Divisi Kapal Permukaan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Dukungan Produksi',
    'Biro Transportasi', 'biro',
    'Menyusun strategi pelaksanaan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan dalam bidang penyiapan fasilitas transportasi di Divisi Kapal Permukaan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Dukungan Produksi',
    'Biro Administrasi & SDM', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam bidang penyusunan pelaksanaan program kerja yang berkaitan dengan perencanaan fasilitas produksi, analisa dan evaluasi kesiapan fasilitas dan sarana produksi, serta administrasi & SDM Divisi Kapal Permukaan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Dukungan Produksi',
    'Biro Utilitas & Pendukung', 'biro',
    'Menjabarkan dan melaksanakan program kerja Departemen Dukungan Produksi dalam bidang utilitas dan pendukungnya di Divisi Kapal Permukaan.'
),
(
    'Divisi Kapal Permukaan', 'Departemen Dukungan Produksi',
    'Biro Logistik & Pengembangan Produksi', 'biro',
    'Menyusun strategi, merencanakan, mengkoordinasikan dan melaksanakan pengawasan sumber daya dan pekerjaan di bidang penyusunan pelaksanaan program kerja yang berkaitan dengan kebutuhan Logistik & Pengembangan Produksi di Divisi Kapal Permukaan.'
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
