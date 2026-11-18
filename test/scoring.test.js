// Uji penskoran IKDKM-M sesuai BAB VI naskah instrumen (pembobotan, norma, ambang pelemahan, pemicu kata kunci, kuadran).
// Basis data sementara khusus file uji ini (menghindari bentrok dengan uji lain yang berjalan paralel)
{ const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path'); const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panjalu-t-'));
  Object.assign(process.env, { MC_DATA_DIR: dir, MC_DB_FILE: path.join(dir, 'panjalu.db'), MC_AUDIT_FILE: path.join(dir, 'audit.db'), MC_DATA_KEY: 'a'.repeat(64), MC_JWT_SECRET: 'b'.repeat(64) });
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true })); }
const test = require('node:test');
const assert = require('node:assert/strict');
const { ITEMS } = require('../server/reference');
const { scoreAssessment, validateAnswers, categoryOf, itemScore, interpret, counselorClaims } = require('../server/scoring');

const OK = { a: true, b: true, c: true };
const fill = (fn, persetujuan = OK) => ({ A: Object.fromEntries(ITEMS.map((it) => [it.no, fn(it)])), persetujuan });
// Jawaban "paling kuat": favorable SS, unfavorable STS
const strongest = (it) => (it.arah === '+' ? 'SS' : 'STS');
const weakest = (it) => (it.arah === '+' ? 'STS' : 'SS');

test('32 butir: 20 fondasi (5 × 4), 8 otot inti, 4 kesiapan dukungan', () => {
  assert.equal(ITEMS.length, 32);
  assert.equal(ITEMS.filter((i) => i.bagian === 1).length, 20);
  assert.equal(ITEMS.filter((i) => i.bagian === 2).length, 8);
  assert.equal(ITEMS.filter((i) => i.bagian === 3).length, 4);
  for (const v of ['V1', 'V2', 'V3', 'V4', 'V5']) assert.equal(ITEMS.filter((i) => i.dimensi === v).length, 4);
});

test('pembobotan 6.1: favorable SS=4…STS=1, unfavorable dibalik', () => {
  const fav = ITEMS.find((i) => i.arah === '+'); const unf = ITEMS.find((i) => i.arah === '-');
  assert.deepEqual(['SS', 'S', 'TS', 'STS'].map((v) => itemScore(fav, v)), [4, 3, 2, 1]);
  assert.deepEqual(['SS', 'S', 'TS', 'STS'].map((v) => itemScore(unf, v)), [1, 2, 3, 4]);
});

test('skor maksimum & minimum: indeks 112/28, fondasi 80/20, otot 32/8', () => {
  const hi = scoreAssessment(fill(strongest));
  assert.equal(hi.skor_total, 112); assert.equal(hi.skor_fondasi, 80); assert.equal(hi.skor_otot, 32);
  assert.equal(hi.kategori_total, 'Tangguh'); assert.equal(hi.kategori_fondasi, 'Kuat'); assert.equal(hi.kategori_otot, 'Kuat');
  hi.dimensi.filter((d) => d.bagian === 1).forEach((d) => { assert.equal(d.skor, 16); assert.equal(d.kategori, 'Kuat'); });
  const lo = scoreAssessment(fill(weakest));
  assert.equal(lo.skor_total, 28); assert.equal(lo.skor_fondasi, 20); assert.equal(lo.skor_otot, 8);
  assert.equal(lo.kategori_total, 'Krisis'); assert.equal(lo.kategori_fondasi, 'Lemah'); assert.equal(lo.kategori_otot, 'Lemah');
});

test('bagian 3 tidak masuk indeks total', () => {
  const a = scoreAssessment(fill((it) => (it.bagian === 3 ? 'SS' : strongest(it))));
  const b = scoreAssessment(fill((it) => (it.bagian === 3 ? 'STS' : strongest(it))));
  assert.equal(a.skor_total, b.skor_total);
  assert.equal(a.siap_dukungan, 4); assert.equal(b.siap_dukungan, 0);
});

test('batas norma 6.2 (dimensi, fondasi, otot, total)', () => {
  assert.equal(categoryOf('dimensi', 13), 'Kuat'); assert.equal(categoryOf('dimensi', 12), 'Rentan'); assert.equal(categoryOf('dimensi', 8), 'Rentan'); assert.equal(categoryOf('dimensi', 7), 'Lemah');
  assert.equal(categoryOf('fondasi', 61), 'Kuat'); assert.equal(categoryOf('fondasi', 60), 'Rentan'); assert.equal(categoryOf('fondasi', 40), 'Rentan'); assert.equal(categoryOf('fondasi', 39), 'Lemah');
  assert.equal(categoryOf('otot', 25), 'Kuat'); assert.equal(categoryOf('otot', 24), 'Rentan'); assert.equal(categoryOf('otot', 16), 'Rentan'); assert.equal(categoryOf('otot', 15), 'Lemah');
  assert.equal(categoryOf('total', 85), 'Tangguh'); assert.equal(categoryOf('total', 84), 'Rentan'); assert.equal(categoryOf('total', 56), 'Rentan'); assert.equal(categoryOf('total', 55), 'Krisis');
});

test('ambang pelemahan 6.3: dimensi ≤ 12, otot inti ≤ 24 → klaim interpretasi', () => {
  // V1 = 12 (tiga butir terkuat + satu butir terlemah), lainnya terkuat
  const r = scoreAssessment(fill((it) => (it.no === 1 ? 'STS' : strongest(it))));
  assert.equal(r.dimensi.find((d) => d.kode === 'V1').skor, 13);
  const r2 = scoreAssessment(fill((it) => ([1, 2].includes(it.no) ? 'TS' : strongest(it))));
  assert.equal(r2.dimensi.find((d) => d.kode === 'V1').skor, 12);
  assert.deepEqual(r2.pelemahan, ['V1']);
  assert.equal(counselorClaims(r2)[0].nama, 'Energi dasar terkuras');
  const r3 = scoreAssessment(fill((it) => (it.no === 27 ? 'SS' : strongest(it))));
  assert.equal(r3.skor_otot, 29); assert.ok(!r3.pelemahan.includes('V6'));
});

test('butir pemicu keyword-tagging: unfavorable SS/S dan favorable TS/STS', () => {
  const r = scoreAssessment(fill((it) => (it.no === 3 ? 'S' : it.no === 1 ? 'TS' : it.no === 4 ? 'TS' : strongest(it))));
  assert.deepEqual(r.butir_pemicu.map((b) => b.no).sort((a, b) => a - b), [1, 3]);
  // bagian 3 tidak menjadi pemicu kata kunci
  const r2 = scoreAssessment(fill((it) => (it.bagian === 3 ? 'SS' : strongest(it))));
  assert.equal(r2.butir_pemicu.length, 0);
});

test('kuadran: indeks Tangguh/belum × kesiapan dukungan (≥ 2 butir bagian 3 SS/S)', () => {
  assert.equal(scoreAssessment(fill(strongest)).kuadran, 'tangguh_bertumbuh'); // butir 29–32 favorable SS
  assert.equal(scoreAssessment(fill((it) => (it.bagian === 3 ? 'TS' : strongest(it)))).kuadran, 'tangguh_mandiri');
  assert.equal(scoreAssessment(fill((it) => (it.bagian === 3 ? 'TS' : weakest(it)))).kuadran, 'rentan_tersembunyi');
  assert.equal(scoreAssessment(fill((it) => (it.bagian === 3 ? 'S' : weakest(it)))).kuadran, 'siap_dibantu');
});

test('penanda kuratif: indeks krisis + butir 28 setuju → butuh bantuan segera (merah)', () => {
  const r = scoreAssessment(fill(weakest)); // butir 28 unfavorable SS
  assert.equal(r.penanda.butuh_bantuan_segera, true); assert.equal(r.risk_alert, 'red'); assert.equal(r.perlu_kuratif, true);
  const r2 = scoreAssessment(fill((it) => (it.no === 28 ? 'SS' : it.no === 32 ? 'S' : strongest(it)))); // indeks tangguh tetapi gejala berat & ingin konselor
  assert.equal(r2.risk_alert, 'red');
  const r3 = scoreAssessment(fill((it) => (it.no === 32 ? 'S' : it.bagian === 3 ? 'TS' : strongest(it))));
  assert.equal(r3.risk_alert, 'none'); assert.equal(r3.perlu_kuratif, true); // ingin konselor → rekomendasi konseling, tanpa alarm
  const r4 = scoreAssessment(fill((it) => (it.bagian === 3 ? 'TS' : strongest(it))));
  assert.equal(r4.perlu_kuratif, false); assert.equal(r4.tahap_layanan, 'Cukup belajar mandiri (psikoedukasi)');
});

test('interpretasi naratif selalu memuat penafian bukan diagnosis', () => {
  const p = interpret(scoreAssessment(fill(strongest)));
  assert.ok(p.some((x) => /bukan dibuat oleh AI dan bukan diagnosis/.test(x)));
  assert.ok(p[0].includes('112'));
});

test('validasi: wajib 32 jawaban SS/S/TS/STS dan persetujuan data', () => {
  assert.match(validateAnswers(fill((it) => (it.no === 5 ? undefined : 'S'))).error, /butir: 5/);
  assert.match(validateAnswers(fill((it) => (it.no === 5 ? 'X' : 'S'))).error, /butir: 5/);
  assert.match(validateAnswers(fill(() => 'S', { a: false })).error, /penggunaan data/);
  assert.ok(validateAnswers(fill(() => 'S')).data);
});
