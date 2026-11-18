// Uji kendali akses lintas peran (Bab 10.5) terhadap API sungguhan dengan basis data sementara.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-test-'));
process.env.MC_DATA_DIR = dir;
process.env.MC_EMAIL_MX_CHECK = '0';
process.env.MC_LOGIN_RATE = '100';
const { server } = require('../server/index');

let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}/api`; r(); })));
test.after(() => { server.close(); server.closeAllConnections?.(); fs.rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 50).unref(); });

async function login(id) {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: id, password: 'mindcampus123' }) });
  const d = await r.json(); return { token: d.access_token, user: d.user };
}
const get = (t, p, h = {}) => fetch(base + p, { headers: { Authorization: 'Bearer ' + t, ...h } });

test('tanpa token → 401', async () => { assert.equal((await fetch(base + '/users/me')).status, 401); });

test('kata sandi salah → 401', async () => {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: 'K001', password: 'salah' }) });
  assert.equal(r.status, 401);
});

test('mahasiswa tidak dapat membaca asesmen mahasiswa lain', async () => {
  const budi = await login('2313020001'); const siti = await login('2214010012');
  const list = await (await get(siti.token, '/assessments/me')).json();
  assert.equal((await get(budi.token, `/assessments/${list[0].id}`)).status, 403);
  assert.equal((await get(budi.token, '/students')).status, 403);
  assert.equal((await get(budi.token, '/reports/aggregate')).status, 403);
});

test('konselor A tidak dapat membuka mahasiswa di luar kewenangannya', async () => {
  const guruh = await login('K001'); // FTIK, FEB
  const { get: dbGet } = require('../server/db');
  const siti = dbGet("SELECT id FROM users WHERE nim_nip = '2214010012'"); // PGSD (FKIP)
  const dimas = dbGet("SELECT id FROM users WHERE nim_nip = '2413020044'"); // Teknik Mesin (FTIK)
  assert.equal((await get(guruh.token, `/students/${siti.id}/profile`)).status, 403);
  assert.equal((await get(guruh.token, `/students/${dimas.id}/profile`)).status, 200);
});

test('admin tidak dapat mengakses data klinis mahasiswa', async () => {
  const admin = await login('admin');
  assert.equal((await get(admin.token, '/students')).status, 403);
  assert.equal((await get(admin.token, '/reports/aggregate')).status, 403);
  assert.equal((await get(admin.token, '/admin/counselors')).status, 200);
});

const post = (p, body, t) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: JSON.stringify(body) });
const outboxCode = (email) => {
  const dirO = path.join(dir, 'outbox');
  const f = fs.readdirSync(dirO).filter((x) => x.includes(email)).sort().pop();
  const t = fs.readFileSync(path.join(dirO, f), 'utf8');
  return t.match(/: (\d{6})/)[1];
};

test('mahasiswa: daftar → tidak bisa masuk sebelum verifikasi → verifikasi kode → aktif', async () => {
  const email = 'uji.mhs@gmail.com';
  const reg = await post('/auth/register', { role: 'mahasiswa', nama: 'Uji Mahasiswa', nim_nip: '2599000001', email, password: 'abcd1234', prodi_id: 'P01', university_id: '071072', angkatan: new Date().getFullYear(), persetujuan: true });
  assert.equal(reg.status, 201);
  const l1 = await post('/auth/login', { identifier: email, password: 'abcd1234' });
  assert.equal(l1.status, 403); assert.equal((await l1.json()).code, 'EMAIL_UNVERIFIED');
  assert.equal((await post('/auth/verify', { email, kode: '000000' })).status, 400);
  const v = await post('/auth/verify', { email, kode: outboxCode(email) });
  assert.equal((await v.json()).status, 'aktif');
  assert.equal((await post('/auth/login', { identifier: email, password: 'abcd1234' })).status, 200);
});

test('konselor: verifikasi email → menunggu persetujuan → disetujui koordinator kampus → bisa masuk', async () => {
  const email = 'uji.konselor@outlook.com';
  assert.equal((await post('/auth/register', { role: 'konselor', nama: 'Uji Konselor', nim_nip: 'NIP99001', email, password: 'abcd1234', spesialisasi: 'Akademik', university_id: '071072', persetujuan: true })).status, 201);
  assert.equal((await (await post('/auth/verify', { email, kode: outboxCode(email) })).json()).status, 'menunggu_persetujuan');
  const l1 = await post('/auth/login', { identifier: email, password: 'abcd1234' });
  assert.equal((await l1.json()).code, 'PENDING_APPROVAL');
  const koord = await login('KBK01');
  const list = await (await get(koord.token, '/admin/counselors')).json();
  const c = list.items.find((x) => x.email === email);
  assert.ok(list.items.every((x) => x.university_id === '071072')); // koordinator hanya melihat konselor kampusnya
  assert.equal((await post(`/admin/counselors/${c.id}/approve`, { lingkup_fakultas: ['FTIK'] }, koord.token)).status, 200);
  assert.equal((await post('/auth/login', { identifier: email, password: 'abcd1234' })).status, 200);
});

test('email sekali-pakai, format salah, dan kata sandi lemah ditolak', async () => {
  const base0 = { role: 'mahasiswa', nama: 'Tes', prodi_id: 'P01', university_id: '071072', angkatan: new Date().getFullYear(), persetujuan: true };
  assert.equal((await post('/auth/register', { ...base0, nim_nip: '2599000010', email: 'x@mailinator.com', password: 'abcd1234' })).status, 400);
  assert.equal((await post('/auth/register', { ...base0, nim_nip: '2599000011', email: 'bukan-email', password: 'abcd1234' })).status, 400);
  assert.equal((await post('/auth/register', { ...base0, nim_nip: '2599000012', email: 'ok@gmail.com', password: 'pendek' })).status, 400);
});

test('konselor tidak dapat mengakses manajemen pengguna', async () => {
  const g = await login('K001');
  assert.equal((await get(g.token, '/admin/counselors')).status, 403);
});

test('isi jurnal tersimpan terenkripsi di basis data', async () => {
  const budi = await login('2313020001');
  const secret = 'rahasia-jurnal-' + Date.now();
  await fetch(base + '/journal-entries', { method: 'POST', headers: { Authorization: 'Bearer ' + budi.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ mood: 'biasa', isi_teks: secret }) });
  const raw = fs.readFileSync(path.join(dir, 'panjalu.db')).toString('latin1') + (fs.existsSync(path.join(dir, 'panjalu.db-wal')) ? fs.readFileSync(path.join(dir, 'panjalu.db-wal')).toString('latin1') : '');
  assert.equal(raw.includes(secret), false);
  const list = await (await get(budi.token, '/journal-entries')).json();
  assert.equal(list[0].isi_teks, secret);
});

test('audit log tidak dapat diubah atau dihapus', () => {
  const { auditDb } = require('../server/db');
  assert.throws(() => auditDb.exec('DELETE FROM audit_logs'), /tidak dapat dihapus/);
  assert.throws(() => auditDb.exec("UPDATE audit_logs SET aksi = 'x'"), /tidak dapat diubah/);
});
