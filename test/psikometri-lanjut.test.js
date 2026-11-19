// Uji Psikometrik lanjutan: Rasch lengkap (tabel ala Winsteps), CFA, redaksi butir yang dapat diubah, dan unduhan analisis.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const RA = require('../server/rasch');
const { fitCFA } = require('../server/cfa');

let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const nrm = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());

test('Rasch: memulihkan ukuran butir & ambang, fit ≈ 1, unidimensional, dan mendeteksi DIF yang disisipkan', () => {
  const d = [-1.5, -1, -0.5, 0, 0.3, 0.8, 1.2, 1.6]; const tau = [0, -1, 0, 1]; const X = []; const g = [];
  for (let n = 0; n < 400; n++) { const th = nrm(); g.push(n % 2 ? 'L' : 'P'); X.push(d.map((di, i) => { const dd = i === 7 && n % 2 ? di - 1 : di; const num = [1]; let acc = 0; for (let k = 1; k <= 3; k++) { acc += th - dd - tau[k]; num[k] = Math.exp(acc); } let u = rnd() * num.reduce((a, b) => a + b); for (let k = 0; k <= 3; k++) { u -= num[k]; if (u <= 0) return k; } return 3; })); }
  const r = RA.analyze(X, { itemLabels: d.map((_, i) => `B${i + 1}`), personGroups: { gender: { nama: 'Gender', of: (i) => g[i] } } });
  const byLabel = Object.fromEntries(r.tabel13_1.map((x) => [x.label, x]));
  for (let i = 0; i < 7; i++) assert.ok(Math.abs(byLabel[`B${i + 1}`].ukuran - d[i]) < 0.35, `ukuran B${i + 1}`);
  assert.ok(r.tabel13_1.every((x) => x.infit > 0.8 && x.infit < 1.2), 'infit butir ≈ 1');
  assert.ok(r.tabel3_2.every((c) => c.infit === null || (c.infit > 0.85 && c.infit < 1.15)), 'infit kategori ≈ 1');
  assert.ok(r.ambang_berurutan && r.rata_berurutan);
  assert.ok(Math.abs(r.tabel3_2[1].ambang + 1) < 0.25 && Math.abs(r.tabel3_2[3].ambang - 1) < 0.25, 'ambang Andrich');
  assert.ok(r.tabel23.kontras[0].eigen < 2, 'kontras pertama < 2');
  assert.ok(r.tabel3_1.orang.real.reliabilitas > 0.6 && r.tabel3_1.butir.real.reliabilitas > 0.9);
  const top = r.tabel30[0].kontras[0];
  assert.equal(top.butir, 'B8'); assert.ok(top.bermakna && Math.abs(top.kontras) > 0.6);
  assert.equal(r.tabel28[0].kelompok.length, 2);
  assert.equal(r.tabel17_1.length, 400); // termasuk skor ekstrem
  assert.ok(r.tabel12_2.teks.includes('|'));
});

test('CFA: memulihkan muatan & korelasi faktor; model salah ditandai tidak cocok', () => {
  const lam = [0.8, 0.7, 0.6, 0.75, 0.65, 0.7, 0.8, 0.55]; const rho = 0.4; const X = [];
  for (let n = 0; n < 600; n++) { const f1 = nrm(); const f2 = rho * f1 + Math.sqrt(1 - rho * rho) * nrm(); X.push(lam.map((l, i) => l * (i < 4 ? f1 : f2) + Math.sqrt(1 - l * l) * nrm())); }
  const r = fitCFA(X, [{ kode: 'F1', nama: 'F1', items: [0, 1, 2, 3] }, { kode: 'F2', nama: 'F2', items: [4, 5, 6, 7] }]);
  assert.ok(r.konvergen);
  r.muatan.forEach((m, i) => assert.ok(Math.abs(m.std - lam[i]) < 0.1, `muatan ${i}`));
  assert.ok(Math.abs(r.korelasi[0].r - rho) < 0.1);
  assert.equal(r.fit.df, 19);
  assert.ok(r.fit.cfi > 0.97 && r.fit.rmsea < 0.05 && r.fit.srmr < 0.05);
  const one = fitCFA(X, [{ kode: 'G', nama: 'G', items: [0, 1, 2, 3, 4, 5, 6, 7] }]);
  assert.ok(one.fit.cfi < 0.9 && one.fit.rmsea > 0.1);
});

test('API: redaksi butir dapat diubah (sinkron ke asesmen mahasiswa) dan semua analisis dapat diunduh', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-psi-'));
  process.env.MC_DATA_DIR = dir; process.env.MC_EMAIL_MX_CHECK = '0'; process.env.MC_LOGIN_RATE = '100';
  const { server } = require('../server/index');
  await new Promise((r) => server.listen(0, r)); const base = `http://127.0.0.1:${server.address().port}/api`;
  try {
    const login = async (id) => (await (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: id, password: 'mindcampus123' }) })).json()).access_token;
    const call = (t, p, o = {}) => fetch(base + p, { method: o.method || 'GET', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: o.body ? JSON.stringify(o.body) : undefined });
    const adm = await login('admin'); const mhs = await login('2414010071'); const kons = await login('K001');
    const baru = 'Saya mampu mengatur waktu tidur, makan, dan istirahat walaupun jadwal kuliah padat.';
    assert.equal((await call(kons, '/admin/psikometri/butir/1/teks', { method: 'PUT', body: { teks: baru } })).status, 403);
    assert.equal((await call(adm, '/admin/psikometri/butir/1/teks', { method: 'PUT', body: { teks: 'pendek' } })).status, 400);
    const v = await (await call(adm, '/admin/psikometri/butir/1/teks', { method: 'PUT', body: { indikator: 'Mengatur tidur, makan & istirahat', teks: baru } })).json();
    assert.equal(v.butir[0].teks, baru); assert.ok(v.butir[0].diubah); assert.ok(v.riwayat[0].perubahan.includes('Butir 1'));
    const ref = await (await call(mhs, '/reference')).json();
    assert.equal(ref.items.find((it) => it.no === 1).teks, baru); // formulir asesmen mahasiswa memakai redaksi baru
    const back = await (await call(adm, '/admin/psikometri/butir/1/teks', { method: 'PUT', body: { indikator: '', teks: '' } })).json();
    assert.equal(back.butir[0].diubah, false); assert.equal(back.butir[0].teks, back.butir[0].bawaan.teks);
    // analisis lengkap
    const rs = await (await call(adm, '/admin/psikometri/rasch-lengkap?skala=TOTAL&mode=semua')).json();
    assert.ok(rs.tabel3_1 && rs.tabel3_2 && rs.tabel6_1 && rs.tabel10_1 && rs.tabel12_2 && rs.tabel13_1 && rs.tabel17_1 && rs.tabel23 && rs.tabel28 && rs.tabel30);
    assert.ok(rs.tabel28.length >= 6 && rs.tabel30.length >= 6, 'semua aspek demografis');
    const cfa = await (await call(adm, '/admin/psikometri/cfa?model=M6&mode=semua')).json();
    assert.ok(cfa.fit || cfa.error);
    assert.equal((await call(kons, '/admin/psikometri/unduh/rasch?format=xlsx')).status, 403);
    for (const j of ['butir', 'deskriptif', 'validitas', 'demografis', 'rasch', 'cfa']) for (const f of ['xlsx', 'docx']) {
      const r = await call(adm, `/admin/psikometri/unduh/${j}?format=${f}&skala=TOTAL&mode=semua`);
      assert.equal(r.status, 200, `${j}.${f}`);
      const buf = Buffer.from(await r.arrayBuffer()); assert.equal(buf.subarray(0, 2).toString(), 'PK', `${j}.${f} berupa berkas Office (zip)`);
      assert.ok(r.headers.get('content-disposition').includes(`.${f}`));
    }
  } finally { server.close(); server.closeAllConnections?.(); fs.rmSync(dir, { recursive: true, force: true }); setTimeout(() => process.exit(0), 50).unref(); }
});
