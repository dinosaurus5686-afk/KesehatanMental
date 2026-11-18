// Uji Konselor PAN-JALU: pengajuan & persetujuan admin, pemilihan oleh mahasiswa kampus tanpa konselor (dengan persetujuan akses),
// perpindahan kewenangan saat konselor diganti/dicabut, alur krisis, dan pendaftaran mahasiswa dari kampus yang belum ada di daftar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-pj-'));
process.env.MC_DATA_DIR = dir;
process.env.MC_EMAIL_MX_CHECK = '0';
process.env.MC_LOGIN_RATE = '100';
const { server } = require('../server/index');
const { get, insert } = require('../server/db');
const { hashPassword } = require('../server/security');
const { handleRisk } = require('../server/services');

let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}/api`; r(); })));
test.after(() => { server.close(); server.closeAllConnections?.(); fs.rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 50).unref(); });

async function login(id, pw = 'mindcampus123') {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: id, password: pw }) });
  return (await r.json()).access_token;
}
const call = (t, p, { method = 'GET', body } = {}) => fetch(base + p, { method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const json = async (t, p, o) => (await call(t, p, o)).json();

test('Konselor PAN-JALU: ajukan → setujui → dipilih mahasiswa lintas kampus → ganti/cabut memindahkan akses', async () => {
  // k2 = pelamar (K001, belum Konselor PAN-JALU di data demo); k1 = konselor lain tanpa kewenangan (K003)
  const adm = await login('admin'); const k2 = await login('K001'); const k1 = await login('K003');
  const k2id = get("SELECT id FROM users WHERE nim_nip = 'K001'").id;
  // Mahasiswa dari kampus yang belum punya konselor
  const uni = get("SELECT id FROM universities WHERE id NOT IN (SELECT DISTINCT university_id FROM users WHERE university_id IS NOT NULL) AND status != 'LAYANAN' LIMIT 1").id;
  const sid = insert('users', { role: 'mahasiswa', nim_nip: 'X9990001', nama: 'Mahasiswa Luar', email: 'luar@x.id', password_hash: hashPassword('Rahasia123'), status: 'aktif', aktif: 1, university_id: uni, angkatan: 2024 });
  const s = await login('X9990001', 'Rahasia123');
  assert.equal((await json(s, '/users/me')).perlu_pilih_konselor, true);
  assert.ok(!(await json(s, '/panjalu-counselors')).items.some((c) => c.id === k2id));

  // Pengajuan konselor kampus → admin menyetujui dengan kapasitas
  assert.equal((await call(k2, '/panjalu/apply', { method: 'POST', body: { alasan: 'pendek' } })).status, 400);
  assert.equal((await call(k2, '/panjalu/apply', { method: 'POST', body: { alasan: 'Psikolog klinis, 8 tahun mendampingi mahasiswa.' } })).status, 201);
  assert.equal((await call(k2, '/panjalu/apply', { method: 'POST', body: { alasan: 'Psikolog klinis, 8 tahun mendampingi mahasiswa.' } })).status, 409);
  assert.equal((await call(k2, '/admin/panjalu')).status, 403);
  const list = await json(adm, '/admin/panjalu?status=menunggu');
  assert.ok(list.ringkasan.tanpa_layanan >= 1);
  const appId = list.items.find((x) => x.user_id === k2id).id;
  assert.equal((await call(adm, `/admin/panjalu/${appId}/approve`, { method: 'POST', body: { kapasitas: 0 } })).status, 400);
  assert.equal((await call(adm, `/admin/panjalu/${appId}/approve`, { method: 'POST', body: { kapasitas: 20 } })).status, 200);

  // Sebelum dipilih: konselor PAN-JALU belum berwenang atas mahasiswa kampus lain
  assert.equal((await call(k2, `/students/${sid}/profile`)).status, 403);
  const pj = await json(s, '/panjalu-counselors');
  assert.equal(pj.kampus_punya_konselor, false);
  assert.ok(pj.items.some((c) => c.id === k2id));
  assert.equal((await call(s, '/users/me/panjalu-counselor', { method: 'PUT', body: { counselor_id: k2id } })).status, 400); // tanpa persetujuan akses
  assert.equal((await call(s, '/users/me/panjalu-counselor', { method: 'PUT', body: { counselor_id: k2id, setuju: true } })).status, 200);
  assert.equal((await json(s, '/users/me')).perlu_pilih_konselor, false);
  assert.ok(get("SELECT 1 AS x FROM consents WHERE user_id = ? AND jenis_consent = 'akses_konselor_panjalu'", sid));

  // Akses berpindah ke Konselor PAN-JALU; konselor lain tetap tidak berwenang
  assert.equal((await call(k2, `/students/${sid}/profile`)).status, 200);
  assert.equal((await call(k1, `/students/${sid}/profile`)).status, 403);
  const roster = await json(k2, '/students');
  const row = (roster.items || roster).find((x) => x.id === sid);
  assert.ok(row && row.kampus_lain);
  // Mahasiswa dapat mendaftar konseling/pesan ke Konselor PAN-JALU-nya
  const cs = await json(s, '/counselors');
  assert.ok(cs.find((c) => c.user_id === k2id && c.konselor_panjalu));
  assert.equal((await call(s, `/messages/with/${k2id}`)).status, 200);
  assert.equal((await call(s, `/counselors/${k2id}/availability`)).status, 200);

  // Krisis: kampus tanpa konselor → Konselor PAN-JALU pilihan mahasiswa & admin diberi tahu
  const before = get("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND tipe = 'krisis'", k2id).n;
  handleRisk(get('SELECT * FROM users WHERE id = ?', sid), null, 'red');
  assert.equal(get("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND tipe = 'krisis'", k2id).n, before + 1);
  const dash = await json(k2, '/dashboard/counselor');
  assert.ok(dash.alerts.some((a) => a.student_id === sid));
  const alertId = dash.alerts.find((a) => a.student_id === sid).id;
  assert.equal((await call(k1, `/alerts/${alertId}/ack`, { method: 'POST', body: { catatan: 'Bukan kewenangan saya.' } })).status, 404);
  assert.equal((await call(k2, `/alerts/${alertId}/ack`, { method: 'POST', body: { catatan: 'Menelepon mahasiswa, kondisi aman, janji temu besok.' } })).status, 200);

  // Mahasiswa melepas konselor → akses berakhir
  assert.equal((await call(s, '/users/me/panjalu-counselor', { method: 'PUT', body: { counselor_id: null } })).status, 200);
  assert.equal((await call(k2, `/students/${sid}/profile`)).status, 403);
  assert.equal((await call(s, `/messages/with/${k2id}`)).status, 403);

  // Pilih lagi, lalu admin mencabut status → konseli dilepas & diminta memilih ulang
  await call(s, '/users/me/panjalu-counselor', { method: 'PUT', body: { counselor_id: k2id, setuju: true } });
  const rv = await json(adm, `/admin/panjalu/${appId}/revoke`, { method: 'POST', body: { catatan: 'Masa tugas berakhir.' } });
  assert.equal(rv.konseli_dilepas, 1);
  assert.equal((await call(k2, `/students/${sid}/profile`)).status, 403);
  assert.equal((await json(s, '/users/me')).perlu_pilih_konselor, true);
  assert.ok(!(await json(s, '/panjalu-counselors')).items.some((c) => c.id === k2id));
  // Konselor kampus tetap aktif sebagai konselor kampus
  assert.equal(get("SELECT status FROM users WHERE id = ?", k2id).status, 'aktif');
});

test('pendaftaran mahasiswa dari kampus yang belum ada di daftar & konselor independen', async () => {
  const reg = (body) => fetch(`${base}/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'Rahasia123', persetujuan: true, ...body }) });
  let r = await reg({ role: 'mahasiswa', nama: 'Mhs Kampus Baru', nim_nip: 'NB000001', email: 'nb1@kampusbaru.id', angkatan: new Date().getFullYear(), kampus_baru: { nama: 'Sekolah Tinggi Contoh Nusantara', kota: 'Kediri' }, prodi_baru: { nama: 'Psikologi' } });
  assert.equal(r.status, 201);
  const u = get("SELECT u.university_id, v.status, v.nama FROM users u JOIN universities v ON v.id = u.university_id WHERE u.nim_nip = 'NB000001'");
  assert.equal(u.status, 'USULAN');
  r = await reg({ role: 'mahasiswa', nama: 'Mhs Kampus Baru 2', nim_nip: 'NB000002', email: 'nb2@kampusbaru.id', angkatan: new Date().getFullYear(), kampus_baru: { nama: 'sekolah tinggi contoh nusantara' }, prodi_baru: { nama: 'Psikologi' } });
  assert.equal(r.status, 201);
  assert.equal(get("SELECT university_id FROM users WHERE nim_nip = 'NB000002'").university_id, u.university_id); // kampus usulan dipakai bersama
  // Konselor independen tanpa kampus → menunggu persetujuan admin sebagai Konselor PAN-JALU
  r = await reg({ role: 'konselor', nama: 'Psikolog Mandiri', nim_nip: 'IND00001', email: 'ind@psikolog.id', spesialisasi: 'Kecemasan', independen: true, alasan_panjalu: 'Psikolog klinis berlisensi SIPP, praktik mandiri.' });
  assert.equal(r.status, 201);
  const c = get("SELECT u.university_id, p.status, p.independen FROM users u JOIN panjalu_counselors p ON p.user_id = u.id WHERE u.nim_nip = 'IND00001'");
  assert.deepEqual([c.university_id, c.status, c.independen], ['PANJALU', 'menunggu', 1]);
  const found = await (await fetch(`${base}/public/universities?q=PAN-JALU`)).json();
  assert.ok(!found.some((x) => x.id === 'PANJALU'));
});
