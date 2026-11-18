// Uji klaim rangkap Koordinator Layanan BK oleh konselor (wajib disetujui admin).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-klaim-'));
process.env.MC_DATA_DIR = dir;
process.env.MC_EMAIL_MX_CHECK = '0';
process.env.MC_LOGIN_RATE = '100';
const { server } = require('../server/index');
const { run, get: dbGet } = require('../server/db');

let base;
test.before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}/api`; r(); })));
test.after(() => { server.close(); server.closeAllConnections?.(); fs.rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 50).unref(); });

async function login(id) {
  const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: id, password: 'mindcampus123' }) });
  return (await r.json()).access_token;
}
const call = (t, p, { method = 'GET', body, h = {} } = {}) => fetch(base + p, { method, headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined });

test('alur klaim: kampus ber-koordinator ditolak, lalu ajukan → setujui → mode koordinator → cabut', async () => {
  const k1 = await login('K001'); const k2 = await login('K002'); const adm = await login('admin');
  // UNP masih punya KBK01 → tidak boleh mengajukan
  let me = await (await call(k1, '/coord-claim/me')).json();
  assert.equal(me.bisa_mengajukan, false);
  assert.equal((await call(k1, '/coord-claim', { method: 'POST', body: { alasan: 'Saya bersedia mengoordinasikan layanan.' } })).status >= 400, true);

  // Koordinator dinonaktifkan → kampus tanpa koordinator
  const kbk = await login('KBK01');
  run("UPDATE users SET status = 'nonaktif' WHERE nim_nip = 'KBK01'");
  me = await (await call(k1, '/coord-claim/me')).json();
  assert.equal(me.bisa_mengajukan, true);
  assert.equal((await call(k1, '/coord-claim', { method: 'POST', body: { alasan: 'pendek' } })).status, 400);
  assert.equal((await call(k1, '/coord-claim', { method: 'POST', body: { alasan: 'Saya ketua unit konseling dan bersedia mengoordinasikan.' } })).status, 201);
  // Sebelum disetujui: header X-Peran diabaikan
  assert.equal((await call(k1, '/admin/coord-claims')).status, 403);
  const coordPath = '/coord/dashboard';
  const before = await call(k1, coordPath, { h: { 'X-Peran': 'koordinator' } });
  assert.equal(before.status, 403);
  // Konselor lain tidak bisa mengajukan bersamaan
  const me2 = await (await call(k2, '/coord-claim/me')).json();
  assert.equal(me2.bisa_mengajukan, false);

  const list = await (await call(adm, '/admin/coord-claims?status=menunggu')).json();
  assert.equal(list.jumlah.menunggu, 1);
  const id = list.items[0].id;
  assert.equal((await call(adm, `/admin/coord-claims/${id}/reject`, { method: 'POST', body: { catatan: 'x' } })).status, 400);
  assert.equal((await call(adm, `/admin/coord-claims/${id}/approve`, { method: 'POST', body: {} })).status, 200);

  // Profil memuat status rangkap; mode koordinator berfungsi lewat header
  const prof = await (await call(k1, '/users/me')).json();
  assert.equal((prof.user || prof).rangkap_koordinator?.status, 'disetujui');
  assert.equal((await call(k1, coordPath)).status, 403);
  assert.equal((await call(k1, coordPath, { h: { 'X-Peran': 'koordinator' } })).status, 200);
  // Konselor lain (tanpa persetujuan) tetap tidak bisa memakai header
  assert.equal((await call(k2, coordPath, { h: { 'X-Peran': 'koordinator' } })).status, 403);
  // Kampus kini dianggap memiliki koordinator
  assert.equal((await (await call(k2, '/coord-claim/me')).json()).bisa_mengajukan, false);

  assert.equal((await call(adm, `/admin/coord-claims/${id}/revoke`, { method: 'POST', body: { catatan: 'Koordinator definitif sudah ditetapkan.' } })).status, 200);
  assert.equal((await call(k1, coordPath, { h: { 'X-Peran': 'koordinator' } })).status, 403);
  assert.equal(dbGet('SELECT status FROM coordinator_claims WHERE id = ?', id).status, 'dicabut');
  assert.ok(kbk);
});
