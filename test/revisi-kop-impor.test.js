// Uji revisi: kop dokumen per kampus, prodi/jenjang bebas, pendaftaran mahasiswa kolektif via Excel + aktivasi akun.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ExcelJS = require('exceljs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-kop-'));
process.env.MC_DATA_DIR = dir; process.env.MC_EMAIL_MX_CHECK = '0'; process.env.MC_LOGIN_RATE = '100';
const { server } = require('../server/index');
const { get } = require('../server/db');
const branding = require('../server/branding');

let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}/api`; r(); })));
test.after(() => { server.close(); server.closeAllConnections?.(); fs.rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 50).unref(); });
const login = async (id, pw = 'mindcampus123') => (await (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: id, password: pw }) })).json()).access_token;
const call = (t, p, o = {}) => fetch(base + p, { method: o.method || 'GET', headers: { ...(t ? { Authorization: 'Bearer ' + t } : {}), 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined });
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('kop dokumen: koordinator mengatur kop kampus; kampus tanpa kop memakai kop PAN-JALU', async () => {
  const ko = await login('KBK01'); const k1 = await login('K001');
  const uni = get("SELECT university_id FROM users WHERE nim_nip = 'KBK01'").university_id;
  assert.equal((await call(k1, '/coord/kop', { method: 'PUT', body: { nama: 'X' } })).status, 403);
  assert.equal((await call(ko, '/coord/kop', { method: 'PUT', body: { nama: 'Univ', unit: 'UPT BK' } })).status, 400);
  assert.equal((await call(ko, '/coord/kop', { method: 'PUT', body: { nama: 'Universitas Contoh Nusantara', unit: 'UPT BK', logo: 'data:image/png;base64,AAAA' } })).status, 400);
  const v = await (await call(ko, '/coord/kop', { method: 'PUT', body: { nama: 'Universitas Contoh Nusantara', unit: 'UPT Layanan BK', alamat: 'Jl. Merdeka 1, Kediri', telepon: '0354-1', email: 'bk@contoh.ac.id', logo: PNG } })).json();
  assert.equal(v.diatur, true); assert.ok(v.logo.startsWith('data:image/png'));
  const b = branding.brandFor(uni); assert.equal(b.jenis, 'kampus'); assert.equal(b.nama, 'Universitas Contoh Nusantara'); assert.ok(fs.existsSync(b.logo));
  const pdf = await call(ko, '/coord/kop/contoh.pdf'); assert.equal(pdf.status, 200); assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
  // dokumen mahasiswa kampus ini memakai kop kampus
  const mhs = await login('2313020001'); const list = await (await call(mhs, '/assessments/me')).json();
  const ap = await call(mhs, `/assessments/${list[0].id}/pdf`); assert.equal(ap.status, 200);
  // kampus lain (tanpa kop) → kop PAN-JALU
  assert.equal(branding.brandFor('PANJALU').jenis, 'panjalu');
  assert.equal(branding.brandFor(null).jenis, 'panjalu');
  const r2 = await (await call(ko, '/coord/kop', { method: 'DELETE' })).json(); assert.equal(r2.diatur, false);
  assert.equal(branding.brandFor(uni).jenis, 'panjalu');
});

test('prodi: fakultas & jenjang dapat diketik bebas', async () => {
  const ko = await login('KBK01');
  const r = await call(ko, '/coord/prodi', { method: 'POST', body: { nama: 'Teknologi Rekayasa Pangan', fakultas: 'Fakultas Vokasi dan Teknologi Terapan', jenjang: 'D4 Terapan' } });
  assert.ok([200, 201].includes(r.status));
  const d = await (await call(ko, '/coord/prodi')).json();
  const p = d.items.find((x) => x.nama === 'Teknologi Rekayasa Pangan'); assert.equal(p.jenjang, 'D4 Terapan'); assert.equal(p.fakultas, 'Fakultas Vokasi dan Teknologi Terapan');
});

test('konselor mendaftarkan mahasiswa via Excel → mahasiswa mengaktifkan akun lewat email', async () => {
  const k1 = await login('K001'); const k1id = get("SELECT id FROM users WHERE nim_nip = 'K001'").id;
  const tpl = await call(k1, '/counselor/import/template'); assert.equal(tpl.status, 200);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(Buffer.from(await tpl.arrayBuffer()));
  const ws = wb.getWorksheet('Mahasiswa'); ws.spliceRows(2, 1);
  ws.addRow(['IMP0001', 'Mahasiswa Impor Satu', 'imp1@mhs.contoh.ac.id', 'Pendidikan Matematika', 2025, 'A', 'P', '0812']);
  ws.addRow(['IMP0002', 'Mahasiswa Impor Dua', 'imp2@mhs.contoh.ac.id', 'Prodi Baru Sekali', 2024, 'B', 'L', '']);
  ws.addRow(['IMP0002', 'Duplikat', 'imp3@mhs.contoh.ac.id', '', 2024, '', '', '']);
  ws.addRow(['2313020001', 'Sudah Ada', 'lain@mhs.contoh.ac.id', '', 2023, '', '', '']);
  ws.addRow(['IMP0005', 'Email Salah', 'bukan-email', '', 1990, '', '', '']);
  const file = Buffer.from(await wb.xlsx.writeBuffer()).toString('base64');
  const pre = await (await call(k1, '/counselor/import', { method: 'POST', body: { file } })).json();
  assert.deepEqual([pre.ringkas.siap, pre.ringkas.galat, pre.ringkas.terdaftar], [2, 2, 1]);
  assert.equal(get("SELECT COUNT(*) AS n FROM users WHERE nim_nip LIKE 'IMP%'").n, 0, 'pratinjau tidak menyimpan data');
  const done = await (await call(k1, '/counselor/import', { method: 'POST', body: { file, simpan: true } })).json();
  assert.equal(done.ringkas.didaftarkan, 2);
  const u = get("SELECT * FROM users WHERE nim_nip = 'IMP0001'"); assert.equal(u.status, 'menunggu_verifikasi');
  assert.ok(get("SELECT 1 AS x FROM student_counselors WHERE student_id = ? AND counselor_id = ?", u.id, k1id));
  assert.equal(get("SELECT status FROM prodi WHERE nama_prodi = 'Prodi Baru Sekali'").status, 'usulan');
  assert.equal((await call(null, '/auth/login', { method: 'POST', body: { identifier: 'IMP0001', password: 'Rahasia123' } })).status >= 400, true);
  // tautan aktivasi dari email (mode outbox)
  const ob = path.join(dir, 'outbox'); const f = fs.readdirSync(ob).filter((x) => x.includes('imp1')).sort().pop();
  const token = fs.readFileSync(path.join(ob, f), 'utf8').match(/#\/aktivasi\/([A-Za-z0-9_-]+)/)[1];
  const info = await (await call(null, `/auth/activate/${token}`)).json(); assert.equal(info.nim, 'IMP0001'); assert.ok(info.konselor.includes('Guruh'));
  assert.equal((await call(null, '/auth/activate', { method: 'POST', body: { token, password: 'Rahasia123' } })).status, 400); // tanpa persetujuan
  assert.equal((await call(null, '/auth/activate', { method: 'POST', body: { token, password: 'Rahasia123', persetujuan: true } })).status, 200);
  assert.equal((await call(null, '/auth/activate', { method: 'POST', body: { token, password: 'Rahasia123', persetujuan: true } })).status, 400); // sekali pakai
  const s = await login('IMP0001', 'Rahasia123'); assert.ok(s);
  assert.ok(get("SELECT 1 AS x FROM consents WHERE user_id = ? AND jenis_consent = 'akses_konselor_pendamping'", u.id));
  assert.equal((await call(k1, `/students/${u.id}/profile`)).status, 200);
  const inv = await (await call(k1, '/counselor/invites')).json(); assert.equal(inv.jumlah, 2); assert.equal(inv.aktif, 1);
  const u2 = get("SELECT id FROM users WHERE nim_nip = 'IMP0002'").id;
  assert.equal((await call(k1, `/counselor/invites/${u2}/resend`, { method: 'POST', body: {} })).status, 200);
  assert.equal((await call(k1, `/counselor/invites/${u.id}/resend`, { method: 'POST', body: {} })).status, 409);
});
