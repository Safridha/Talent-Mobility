"""Tes alur batch periode dari ujung ke ujung terhadap staging (HTTP + DB staging).

Jalankan lewat `scripts/staging-test.ps1 flow`: skrip itu membuat tumpukan tes terisolasi (DB kosong, port 8011),
menjalankan file ini, lalu menghapusnya. Tes ini TIDAK PERNAH dijalankan pada salinan data produksi di staging.
"""
import http.cookiejar
import json
import os
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
# Tumpukan tes terisolasi (diatur oleh scripts/staging-test.ps1): proyek, port, dan DB sendiri; tidak ada tunnel.
PROJECT = os.environ.get('STAGING_PROJECT', '')
COMPOSE = ['docker', 'compose'] + (['-p', PROJECT] if PROJECT else []) + ['-f', str(ROOT / 'compose.staging.yaml'), '--env-file', str(ROOT / '.env.staging')]
DUMMY_TURNSTILE_TOKEN = 'XXXX.DUMMY.TOKEN.XXXX'  # diterima oleh secret uji Cloudflare


def read_env():
    values = {}
    for line in (ROOT / '.env.staging').read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            values[key.strip()] = value.strip()
    return values


ENV = read_env()
BASE = f"http://127.0.0.1:{os.environ.get('STAGING_PORT') or ENV.get('STAGING_PORT', '8010')}"
ADMIN = (ENV['ADMIN_EMAIL'], ENV['ADMIN_PASSWORD'])
APPLICANT_PASSWORD = ENV['DEFAULT_APPLICANT_PASSWORD']
TURNSTILE_ON = bool(ENV.get('TURNSTILE_SECRET_KEY'))
results = []


def sql(query):
    out = subprocess.run(COMPOSE + ['exec', '-T', 'db', 'psql', '-U', 'staging', '-d', 'staging', '-t', '-A', '-c', query],
                         capture_output=True, text=True)
    if out.returncode != 0:
        raise RuntimeError(out.stderr)
    text = out.stdout.strip()
    return text.splitlines()[0] if text else ''


class Client:
    def __init__(self):
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, method, path, body=None, raw=None, headers=None):
        data, hdrs = None, {'Origin': BASE, 'Accept': 'application/json'}
        if body is not None:
            data = json.dumps(body).encode()
            hdrs['Content-Type'] = 'application/json'
        if raw is not None:
            data, content_type = raw
            hdrs['Content-Type'] = content_type
        hdrs.update(headers or {})
        request = urllib.request.Request(BASE + path, data=data, method=method, headers=hdrs)
        try:
            with self.opener.open(request, timeout=30) as response:
                text = response.read().decode()
                return response.status, (json.loads(text) if text else {})
        except urllib.error.HTTPError as error:
            text = error.read().decode()
            try:
                return error.code, json.loads(text)
            except ValueError:
                return error.code, {'raw': text}

    def login(self, identifier, password, token=DUMMY_TURNSTILE_TOKEN):
        body = {'identifier': identifier, 'password': password}
        if token:
            body['turnstile_token'] = token
        return self.call('POST', '/api/login', body)


def multipart(fields, files):
    boundary = '----staging' + uuid.uuid4().hex
    parts = []
    for name, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name, filename in files.items():
        parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="{filename}"\r\n'
                      'Content-Type: application/pdf\r\n\r\n').encode()
                     + b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n' + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    return b''.join(parts), f'multipart/form-data; boundary={boundary}'


def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS' if ok else 'FAIL'), '-', name, ('| ' + str(detail)) if detail and not ok else '')


def expect(name, response, status, contains=None):
    code, body = response
    message = body.get('message', '') if isinstance(body, dict) else ''
    ok = code == status and (contains is None or contains.lower() in message.lower())
    check(name, ok, f'got {code} {message!r}, wanted {status} {contains or ""}')
    return body


def wait_for_app():
    for _ in range(60):
        try:
            urllib.request.urlopen(BASE + '/', timeout=2)
            return True
        except Exception:
            time.sleep(1)
    return False


if not wait_for_app():
    sys.exit('Aplikasi tes tidak merespons. Jalankan: scripts/staging-test.ps1 flow')
if int(sql('SELECT count(*) FROM applications')) != 0 or sql("SELECT count(*) FROM divisions WHERE name = 'Divisi Uji'") != '0':
    sys.exit('DB ini sudah berisi data. Tes alur hanya boleh berjalan pada DB kosong: gunakan scripts/staging-test.ps1 flow.')

admin = Client()
print('== Login admin ==')
expect('admin login', admin.login(*ADMIN), 200)

# ---------- struktur organisasi + pelamar uji ----------
div = int(sql("INSERT INTO divisions (name) VALUES ('Divisi Uji') RETURNING id"))
dept_a = int(sql(f"INSERT INTO departments (division_id, name) VALUES ({div}, 'Dept A (buka)') RETURNING id"))
dept_b = int(sql(f"INSERT INTO departments (division_id, name) VALUES ({div}, 'Dept B (tutup)') RETURNING id"))
dept_c = int(sql(f"INSERT INTO departments (division_id, name) VALUES ({div}, 'Dept C (punya biro)') RETURNING id"))
bur1 = int(sql(f"INSERT INTO bureaus (department_id, name, unit_type) VALUES ({dept_c}, 'Biro Satu', 'biro') RETURNING id"))
bur2 = int(sql(f"INSERT INTO bureaus (department_id, name, unit_type) VALUES ({dept_c}, 'Bengkel Dua', 'bengkel') RETURNING id"))

applicants = {}
for index in range(1, 5):
    nip = f'9000{index}'
    status, body = admin.call('POST', '/api/admin/accounts', {'name': f'Pelamar Uji {index}', 'employee_number': nip})
    assert status in (200, 201), (status, body)
    sql(f"UPDATE applicants SET must_change_password = FALSE WHERE employee_number = '{nip}'")
    client = Client()
    expect(f'applicant {index} login', client.login(nip, APPLICANT_PASSWORD), 200)
    applicants[index] = (client, nip)


def apply(index, dept, bureau=None):
    client, nip = applicants[index]
    fields = {'target_department_id': dept, 'employee_number': nip, 'applicant_full_name': f'Pelamar Uji {index}',
              'origin_division': 'Divisi Asal', 'origin_unit': 'Unit Asal', 'education_level': 'D4/S1',
              'study_field': 'Teknik', 'motivation': 'Ingin berkontribusi.'}
    if bureau:
        fields['target_bureau_id'] = bureau
    return client.call('POST', '/api/applications', raw=multipart(fields, {'cv': 'cv.pdf'}),
                       headers={'Idempotency-Key': uuid.uuid4().hex})


def batches():
    return admin.call('GET', '/api/admin/batches')[1]['data']


def payload(name, rs, re_, is_, ie, **extra):
    base = {'name': name, 'registration_start': rs, 'registration_end': re_, 'interview_start': is_, 'interview_end': ie,
            'all_units': True, 'max_applications': None, 'department_ids': [], 'bureau_ids': []}
    base.update(extra)
    return base


print('\n== A. batch bawaan & fase publik ==')
seed = batches()[0]
check('migrasi membuat Batch 2026 untuk semua unit', seed['all_units'] and seed['name'] == 'Batch 2026', seed)
phase = Client().call('GET', '/api/batches/current')[1]
check('fase publik hari ini = registration', phase.get('phase') == 'registration', phase.get('phase'))

print('\n== B. membuat / memvalidasi batch (API admin) ==')
expect('bentrok dengan batch bawaan ditolak', admin.call('POST', '/api/admin/batches', payload('Bentrok', '2026-11-15', '2026-11-25', '2026-11-26', '2026-12-05')), 409, 'bentrok')
expect('akhir pendaftaran sebelum mulai ditolak', admin.call('POST', '/api/admin/batches', payload('Salah 1', '2027-03-10', '2027-03-01', '2027-03-11', '2027-03-20')), 422)
expect('wawancara harus setelah pendaftaran', admin.call('POST', '/api/admin/batches', payload('Salah 2', '2027-03-01', '2027-03-10', '2027-03-10', '2027-03-20')), 422, 'setelah pendaftaran')
expect('pilihan manual tidak boleh kosong', admin.call('POST', '/api/admin/batches', payload('Kosong', '2027-03-01', '2027-03-10', '2027-03-11', '2027-03-20', all_units=False)), 422, 'minimal satu')
expect('id departemen palsu ditolak', admin.call('POST', '/api/admin/batches', payload('Dept Ngawur', '2027-03-01', '2027-03-10', '2027-03-11', '2027-03-20', all_units=False, department_ids=[999999])), 422)
expect('id biro/bengkel palsu ditolak', admin.call('POST', '/api/admin/batches', payload('Biro Ngawur', '2027-03-01', '2027-03-10', '2027-03-11', '2027-03-20', all_units=False, bureau_ids=[999999])), 422)
expect('batas lamaran tidak valid ditolak', admin.call('POST', '/api/admin/batches', payload('Limit', '2027-03-01', '2027-03-10', '2027-03-11', '2027-03-20', max_applications=0)), 422)
expect('nama ganda (tanpa peduli huruf besar) ditolak', admin.call('POST', '/api/admin/batches', payload('  batch 2026 ', '2028-01-01', '2028-01-10', '2028-01-11', '2028-01-20')), 409, 'nama')
future = expect('buat batch mendatang dengan satu biro dibuka', admin.call('POST', '/api/admin/batches', payload('Batch Masa Depan', '2027-03-01', '2027-03-10', '2027-03-11', '2027-03-20', all_units=False, bureau_ids=[bur1])), 200)
future_id = future.get('id')
row = next((b for b in batches() if b['id'] == future_id), {})
check('bureau_ids tersimpan', row.get('bureau_ids') == [bur1] and row.get('department_ids') == [], row)
expect('ubah batch mendatang (nama + departemen utuh + biro)', admin.call('PUT', f'/api/admin/batches/{future_id}', payload('Batch Masa Depan 2', '2027-03-01', '2027-03-10', '2027-03-11', '2027-03-20', all_units=False, department_ids=[dept_a], bureau_ids=[bur2], max_applications=5)), 200)
row = next((b for b in batches() if b['id'] == future_id), {})
check('perubahan tersimpan (nama, departemen, biro, batas)', row.get('name') == 'Batch Masa Depan 2' and row.get('department_ids') == [dept_a] and row.get('bureau_ids') == [bur2] and row.get('max_applications') == 5, row)
expect('mengubah dengan tanggal sendiri tidak dianggap bentrok', admin.call('PUT', f'/api/admin/batches/{future_id}', payload('Batch Masa Depan 2', '2027-03-01', '2027-03-10', '2027-03-11', '2027-03-20')), 200)
row = next((b for b in batches() if b['id'] == future_id), {})
check('beralih ke semua unit menghapus pilihan manual', row.get('all_units') and row.get('department_ids') == [] and row.get('bureau_ids') == [], row)
expect('ubah yang menabrak batch lain ditolak', admin.call('PUT', f'/api/admin/batches/{future_id}', payload('Batch Masa Depan 2', '2026-12-20', '2027-03-10', '2027-03-11', '2027-03-20')), 409)
expect('hapus batch mendatang yang kosong', admin.call('DELETE', f'/api/admin/batches/{future_id}'), 200)
past = expect('buat batch lampau', admin.call('POST', '/api/admin/batches', payload('Batch Lampau', '2025-03-01', '2025-03-10', '2025-03-11', '2025-03-20')), 200)
expect('batch SELESAI tidak bisa diubah (penjaga API)', admin.call('PUT', f"/api/admin/batches/{past.get('id')}", payload('Batch Lampau Baru', '2025-03-01', '2025-03-10', '2025-03-11', '2025-03-20')), 409, 'selesai')
expect('batch tidak ada -> 404 saat diubah', admin.call('PUT', '/api/admin/batches/987654', payload('Hantu', '2029-01-01', '2029-01-10', '2029-01-11', '2029-01-20')), 404)
expect('hapus batch lampau yang kosong', admin.call('DELETE', f"/api/admin/batches/{past.get('id')}"), 200)
code, _ = applicants[1][0].call('GET', '/api/admin/batches')
check('pelamar tidak bisa membuka daftar batch admin', code in (401, 403), code)

print('\n== C. pendaftaran pelamar vs unit yang dibuka ==')
seed_id = seed['id']
expect('batch semua-unit: Dept A boleh', apply(1, dept_a), 200)
expect('target yang sama dua kali diblokir', apply(1, dept_a), 409)
expect('atur batch manual: Dept A utuh + Biro Satu saja', admin.call('PUT', f'/api/admin/batches/{seed_id}', payload('Batch 2026', '2026-11-10', '2026-11-30', '2026-12-01', '2026-12-31', all_units=False, department_ids=[dept_a], bureau_ids=[bur1], max_applications=3)), 200)
expect('Dept A (dibuka utuh) boleh untuk pelamar lain', apply(2, dept_a), 200)
expect('Dept B (tidak dibuka) diblokir', apply(2, dept_b), 409, 'tidak dibuka')
expect('Dept C utuh (hanya satu biro dibuka) diblokir', apply(2, dept_c), 409, 'tidak dibuka')
expect('Biro Satu (dibuka sendiri) boleh', apply(2, dept_c, bur1), 200)
expect('Bengkel Dua (saudara, tidak dibuka) diblokir', apply(3, dept_c, bur2), 409, 'tidak dibuka')
expect('buka Dept C utuh lewat ubah batch', admin.call('PUT', f'/api/admin/batches/{seed_id}', payload('Batch 2026', '2026-11-10', '2026-11-30', '2026-12-01', '2026-12-31', all_units=False, department_ids=[dept_a, dept_c], max_applications=3)), 200)
expect('Bengkel Dua boleh setelah Dept C utuh dibuka', apply(3, dept_c, bur2), 200)
expect('batas 2 lamaran diterapkan lewat ubah batch', admin.call('PUT', f'/api/admin/batches/{seed_id}', payload('Batch 2026', '2026-11-10', '2026-11-30', '2026-12-01', '2026-12-31', max_applications=2)), 200)
expect('pelamar 2 sudah punya 2 lamaran -> batas memblokir yang ke-3', apply(2, dept_c), 409)
check('lamaran terhubung ke batch', sql(f"SELECT count(*) FROM applications WHERE batch_id = {seed_id}") == sql('SELECT count(*) FROM applications'), sql('SELECT count(*), count(batch_id) FROM applications'))
expect('batch yang punya lamaran tidak bisa dihapus', admin.call('DELETE', f'/api/admin/batches/{seed_id}'), 409)

print('\n== D. fase publik dari waktu ke waktu (tanggal digeser di DB staging) ==')
def set_dates(rs, re_, is_, ie):
    sql(f"UPDATE application_batches SET registration_start = CURRENT_DATE + {rs}, registration_end = CURRENT_DATE + {re_}, interview_start = CURRENT_DATE + {is_}, interview_end = CURRENT_DATE + {ie} WHERE id = {seed_id}")
def phase_now():
    return Client().call('GET', '/api/batches/current')[1].get('phase')
set_dates(-2, 5, 6, 30); check('jendela pendaftaran -> registration', phase_now() == 'registration', phase_now())
set_dates(-10, -1, 0, 20); check('setelah pendaftaran -> selection', phase_now() == 'selection', phase_now())
expect('melamar saat pendaftaran tutup diblokir', apply(4, dept_a), 409, 'pendaftaran')
set_dates(3, 9, 10, 30); check('sebelum pendaftaran -> upcoming', phase_now() == 'upcoming', phase_now())
expect('melamar sebelum pendaftaran dibuka diblokir', apply(4, dept_a), 409, 'pendaftaran')
set_dates(-60, -40, -39, -1); check('setelah periode wawancara -> closed', phase_now() == 'closed', phase_now())

print('\n== E. penolakan otomatis lamaran yang belum diputuskan ==')
ids = sql("SELECT string_agg(id::text, ',' ORDER BY id) FROM applications").split(',')
check('ada 4 lamaran untuk diuji', len(ids) >= 4, ids)
for app_id, status in zip(ids, ['submitted', 'interview', 'accepted', 'screening']):
    sql(f"UPDATE applications SET status = '{status}' WHERE id = {app_id}")
subprocess.run(COMPOSE + ['restart', 'app'], capture_output=True)
wait_for_app()
time.sleep(4)
after = sql("SELECT string_agg(status, ',' ORDER BY id) FROM applications").split(',')
check('submitted/interview/screening -> rejected, accepted tetap accepted', after[:4] == ['rejected', 'rejected', 'accepted', 'rejected'], after)
reason_sql = "SELECT count(*) FROM application_status_notifications WHERE new_status = 'rejected' AND reason LIKE 'Periode seleksi%'"
check('3 pelamar diberi tahu beserta alasannya', int(sql(reason_sql)) == 3, sql(reason_sql))
subprocess.run(COMPOSE + ['restart', 'app'], capture_output=True)
wait_for_app()
time.sleep(4)
check('menjalankan ulang tidak mengirim notifikasi ganda', int(sql(reason_sql)) == 3, sql(reason_sql))
admin = Client()
admin.login(*ADMIN)
expect('batch yang sudah berakhir terkunci untuk diubah', admin.call('PUT', f'/api/admin/batches/{seed_id}', payload('Batch 2026', '2026-11-10', '2026-11-30', '2026-12-01', '2026-12-31')), 409, 'selesai')
kept = [x for x in batches() if x['id'] == seed_id][0]
check('batch terkunci tetap utuh', kept['max_applications'] == 2, kept)

print('\n== F. Cloudflare Turnstile ==')
if TURNSTILE_ON:
    expect('login tanpa token ditolak', Client().login(ADMIN[0], ADMIN[1], token=None), 422, 'verifikasi keamanan')
    expect('login dengan token uji lolos verifikasi lalu diperiksa sandinya', Client().login(ADMIN[0], 'sandi-salah'), 422, 'tidak sesuai')
    expect('login benar dengan token uji berhasil', Client().login(*ADMIN), 200)
    expect('endpoint admin login tanpa token ditolak', Client().call('POST', '/api/admin/login', {'identifier': ADMIN[0], 'password': ADMIN[1]}), 422, 'verifikasi keamanan')
else:
    print('SKIP - Turnstile dimatikan di staging (TURNSTILE_SECRET_KEY kosong di .env.staging)')

failed = [r for r in results if not r[1]]
print(f'\nTOTAL {len(results)} pemeriksaan, {len(failed)} gagal')
for name, _, detail in failed:
    print('  GAGAL:', name, '->', detail)
sys.exit(1 if failed else 0)
