// Uji rumus menu Psikometrik: deskriptif, Spearman-Brown, ANOVA (nilai p), dan pemulihan parameter model Rasch.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../server/stats');

test('deskriptif: mean, median, modus, SD', () => {
  const d = S.describe([1, 2, 2, 3, 4]);
  assert.equal(d.mean, 2.4); assert.equal(d.median, 2); assert.deepEqual(d.modus, [2]); assert.equal(d.sd, 1.14);
  assert.deepEqual(S.mode([1, 1, 2, 2, 3]), [1, 2]);
  assert.equal(S.median([1, 2, 3, 4]), 2.5);
});

test('Spearman-Brown belah dua: r_SB = 2r / (1 + r)', () => {
  // belahan ganjil & genap identik → r = 1 → SB = 1
  assert.equal(S.spearmanBrown([[1, 1], [2, 2], [3, 3], [4, 4]]).spearman_brown, 1);
  const sb = S.spearmanBrown([[3, 4, 3, 4], [2, 2, 3, 2], [4, 4, 4, 3], [1, 2, 1, 1], [3, 3, 2, 3]]);
  assert.ok(Math.abs(sb.spearman_brown - (2 * sb.r_belahan) / (1 + sb.r_belahan)) < 0.002);
});

test('ANOVA satu arah & nilai p distribusi F sesuai tabel', () => {
  assert.ok(Math.abs(S.fPValue(3.5, 2, 12) - 0.0635) < 0.001);
  assert.ok(Math.abs(S.fPValue(4.0, 1, 30) - 0.0546) < 0.001);
  const a = S.anova([[1, 2, 3, 4, 5], [2, 3, 4, 5, 6], [5, 6, 7, 8, 9]]);
  assert.equal(a.df1, 2); assert.equal(a.df2, 12); assert.ok(Math.abs(a.F - 8.667) < 0.01); assert.ok(a.p < 0.01);
});

test('Rasch Rating Scale: memulihkan urutan kesulitan butir & ambang dari data simulasi', () => {
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const N = 250; const L = 12; const tau = [0, -1, 0, 1];
  const th = Array.from({ length: N }, () => (rnd() + rnd() + rnd() - 1.5) * 2);
  const de = Array.from({ length: L }, (_, i) => -1.5 + (3 * i) / (L - 1));
  const X = th.map((t) => de.map((d) => { const num = [1]; let acc = 0; for (let k = 1; k <= 3; k++) { acc += t - d - tau[k]; num.push(Math.exp(acc)); } let u = rnd() * num.reduce((x, y) => x + y); let k = 0; while (u > num[k]) { u -= num[k]; k++; } return k; }));
  const r = S.rasch(X);
  assert.ok(r.konvergen);
  const est = [...r.butir].sort((a, b) => a.index - b.index).map((b) => b.measure);
  const corr = S.pearson(est, de); assert.ok(corr > 0.97, `korelasi kesulitan ${corr}`);
  assert.ok(r.ambang_berurutan);
  assert.ok(r.orang.reliabilitas > 0.7);
  assert.ok(r.butir.every((b) => b.infit > 0.6 && b.infit < 1.5), 'data sesuai model → infit mendekati 1');
});
