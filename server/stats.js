// Pustaka statistik untuk menu Psikometrik (tanpa dependensi luar).
// Deskriptif, korelasi Pearson, Cronbach's alpha, Spearman-Brown (belah dua ganjil-genap), ANOVA satu arah (nilai p dari
// distribusi F), dan model Rasch Rating Scale (Andrich) dengan estimasi JMLE beserta statistik kecocokan (infit/outfit).

const round = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const mean = (a) => (a.length ? sum(a) / a.length : null);
const variance = (a) => { if (a.length < 2) return 0; const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1); };
const sd = (a) => Math.sqrt(variance(a));
function median(a) { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
// Modus (bila beberapa nilai sama seringnya, semuanya dikembalikan)
function mode(a) {
  if (!a.length) return [];
  const c = new Map(); for (const x of a) c.set(x, (c.get(x) || 0) + 1);
  const max = Math.max(...c.values());
  return [...c.entries()].filter(([, n]) => n === max).map(([v]) => v).sort((x, y) => x - y);
}
function describe(a) {
  return { n: a.length, mean: round(mean(a), 2), median: round(median(a), 2), modus: mode(a), sd: round(sd(a), 2), min: a.length ? Math.min(...a) : null, max: a.length ? Math.max(...a) : null };
}
function pearson(x, y) {
  const n = x.length; if (n < 3) return null;
  const mx = mean(x); const my = mean(y); let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) { const dx = x[i] - mx; const dy = y[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}
// Cronbach's alpha untuk matriks responden × butir
function alpha(rows) {
  const k = rows[0]?.length || 0; if (k < 2 || rows.length < 3) return null;
  const itemVar = sum(Array.from({ length: k }, (_, j) => variance(rows.map((r) => r[j]))));
  const totVar = variance(rows.map((r) => sum(r)));
  return totVar ? (k / (k - 1)) * (1 - itemVar / totVar) : null;
}
// Reliabilitas belah dua: korelasi skor butir ganjil vs genap, dikoreksi Spearman-Brown: r_SB = 2r / (1 + r)
function spearmanBrown(rows) {
  const k = rows[0]?.length || 0; if (k < 2 || rows.length < 3) return { r_belahan: null, spearman_brown: null };
  const odd = rows.map((r) => sum(r.filter((_, j) => j % 2 === 0))); const even = rows.map((r) => sum(r.filter((_, j) => j % 2 === 1)));
  const r = pearson(odd, even);
  return { r_belahan: round(r), spearman_brown: r === null ? null : round((2 * r) / (1 + r)) };
}
// r tabel (uji dua sisi, α = 0,05) dari pendekatan Cornish-Fisher untuk t kritis
function rTable(n) {
  const df = n - 2; if (df < 1) return null;
  const z = 1.959964;
  const t = z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3);
  return t / Math.sqrt(df + t * t);
}
const alphaLabel = (a) => (a === null ? '—' : a >= 0.9 ? 'Sangat baik' : a >= 0.8 ? 'Baik' : a >= 0.7 ? 'Dapat diterima' : a >= 0.6 ? 'Cukup (perlu ditinjau)' : 'Rendah');

// ---- distribusi F: p = I_x(d2/2, d1/2), x = d2 / (d2 + d1·F) ----
function lgamma(z) {
  const g = 7; const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}
function betacf(a, b, x) {
  const MAXIT = 200; const EPS = 3e-12; const FPMIN = 1e-300;
  let qab = a + b; let qap = a + 1; let qam = a - 1; let c = 1; let d = 1 - (qab * x) / qap; if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m; let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
    const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
  }
  qab = qap = qam = null;
  return h;
}
function ibeta(x, a, b) {
  if (x <= 0) return 0; if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (bt * betacf(a, b, x)) / a : 1 - (bt * betacf(b, a, 1 - x)) / b;
}
const fPValue = (F, d1, d2) => (F === null || !(F >= 0) || d1 < 1 || d2 < 1 ? null : ibeta(d2 / (d2 + d1 * F), d2 / 2, d1 / 2));

// ANOVA satu arah: groups = [[nilai...], ...]
function anova(groups) {
  const g = groups.filter((x) => x.length > 0); const all = g.flat(); const k = g.length; const N = all.length;
  if (k < 2 || N - k < 1) return { F: null, df1: k - 1, df2: N - k, p: null, eta2: null };
  const gm = mean(all);
  const ssb = sum(g.map((x) => x.length * (mean(x) - gm) ** 2)); const ssw = sum(g.map((x) => { const m = mean(x); return sum(x.map((v) => (v - m) ** 2)); }));
  const df1 = k - 1; const df2 = N - k; const F = ssw ? (ssb / df1) / (ssw / df2) : null;
  return { F: round(F, 3), df1, df2, p: round(fPValue(F, df1, df2), 4), eta2: round(ssb / (ssb + ssw || 1), 3) };
}

// ---- Model Rasch Rating Scale (Andrich), estimasi JMLE ----
// X: matriks responden × butir berisi kategori 0..M (mis. skor 1–4 dikurangi 1). Responden & butir ekstrem (skor 0 atau maksimal) dikeluarkan.
function rasch(X, { maxIter = 300, tol = 0.0005 } = {}) {
  if (!X.length || !X[0].length) return null;
  const M = Math.max(...X.flat()); const L0 = X[0].length; if (M < 1) return null;
  const P0 = X.map((row, i) => ({ i, row, raw: sum(row) }));
  const persons = P0.filter((p) => p.raw > 0 && p.raw < L0 * M);
  const itemRaw = Array.from({ length: L0 }, (_, j) => sum(persons.map((p) => p.row[j])));
  const items = itemRaw.map((raw, j) => ({ j, raw })).filter((it) => it.raw > 0 && it.raw < persons.length * M);
  if (persons.length < 5 || items.length < 2) return { error: 'Data belum cukup untuk analisis Rasch (minimal 5 responden tidak ekstrem).' };
  const N = persons.length; const L = items.length;
  const x = persons.map((p) => items.map((it) => p.row[it.j]));
  let th = persons.map((p) => { const r = sum(items.map((it) => p.row[it.j])); return Math.log((r + 0.5) / (L * M - r + 0.5)); });
  let de = items.map((it) => Math.log((N * M - it.raw + 0.5) / (it.raw + 0.5)));
  { const m = mean(de); de = de.map((d) => d - m); }
  const tau = Array(M + 1).fill(0);
  const probs = (b) => { const num = [1]; let acc = 0; for (let k = 1; k <= M; k++) { acc += b - tau[k]; num[k] = Math.exp(acc); } const s = sum(num); return num.map((v) => v / s); };
  const moments = (P) => { let E = 0; let E2 = 0; for (let k = 0; k <= M; k++) { E += k * P[k]; E2 += k * k * P[k]; } return [E, E2 - E * E]; };
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  let iter = 0; let change = Infinity;
  for (; iter < maxIter && change > tol; iter++) {
    change = 0;
    // orang
    for (let n = 0; n < N; n++) { let S = 0; let W = 0; for (let i = 0; i < L; i++) { const [E, V] = moments(probs(th[n] - de[i])); S += x[n][i] - E; W += V; } const step = W ? clamp(S / W) : 0; th[n] += step; change = Math.max(change, Math.abs(step)); }
    // butir
    for (let i = 0; i < L; i++) { let S = 0; let W = 0; for (let n = 0; n < N; n++) { const [E, V] = moments(probs(th[n] - de[i])); S += x[n][i] - E; W += V; } const step = W ? clamp(S / W) : 0; de[i] -= step; change = Math.max(change, Math.abs(step)); }
    { const m = mean(de); de = de.map((d) => d - m); }
    // ambang kategori (Andrich thresholds)
    for (let k = 1; k <= M; k++) {
      let obs = 0; let exp = 0; let v = 0;
      for (let n = 0; n < N; n++) for (let i = 0; i < L; i++) { const P = probs(th[n] - de[i]); const pg = sum(P.slice(k)); obs += x[n][i] >= k ? 1 : 0; exp += pg; v += pg * (1 - pg); }
      const step = v ? clamp((obs - exp) / v) : 0; tau[k] -= step; change = Math.max(change, Math.abs(step));
    }
    { const m = mean(tau.slice(1)); for (let k = 1; k <= M; k++) tau[k] -= m; }
  }
  // koreksi bias JMLE untuk ukuran butir
  const bias = (L - 1) / L; const deC = de.map((d) => d * bias);
  // statistik kecocokan
  const iStat = items.map(() => ({ ss: 0, v: 0, z2: 0 })); const pStat = persons.map(() => ({ ss: 0, v: 0, z2: 0 }));
  for (let n = 0; n < N; n++) for (let i = 0; i < L; i++) {
    const [E, V] = moments(probs(th[n] - de[i])); const r2 = (x[n][i] - E) ** 2; const z2 = V ? r2 / V : 0;
    iStat[i].ss += r2; iStat[i].v += V; iStat[i].z2 += z2; pStat[n].ss += r2; pStat[n].v += V; pStat[n].z2 += z2;
  }
  const itemRes = items.map((it, i) => ({
    index: it.j, measure: round(deC[i], 2), se: round(1 / Math.sqrt(iStat[i].v), 2), infit: round(iStat[i].ss / iStat[i].v, 2), outfit: round(iStat[i].z2 / N, 2),
    pt_measure: round(pearson(x.map((r) => r[i]), th), 2), skor_mentah: it.raw,
  }));
  const pSE = pStat.map((s) => 1 / Math.sqrt(s.v));
  const rel = (meas, se) => { const ov = variance(meas); const ms = mean(se.map((s) => s * s)); const r = ov ? Math.max(0, (ov - ms) / ov) : 0; return { reliabilitas: round(r, 2), separasi: round(Math.sqrt(r / (1 - r || 1e-9)), 2) }; };
  const cats = Array.from({ length: M + 1 }, (_, k) => {
    const who = []; let cnt = 0; for (let n = 0; n < N; n++) for (let i = 0; i < L; i++) if (x[n][i] === k) { cnt++; who.push(th[n]); }
    return { kategori: k, jumlah: cnt, persen: round((cnt / (N * L)) * 100, 1), rata_ukuran: round(mean(who), 2), ambang: k === 0 ? null : round(tau[k], 2) };
  });
  const ordered = cats.slice(2).every((c, i) => c.ambang > cats[i + 1].ambang);
  // Peta Wright: sebaran ukuran orang & butir per pita 0,5 logit
  const lo = Math.floor(Math.min(...th, ...deC) * 2) / 2; const hi = Math.ceil(Math.max(...th, ...deC) * 2) / 2;
  const bands = []; for (let b = hi; b > lo - 0.001; b -= 0.5) bands.push({ batas: round(b, 1), orang: th.filter((t) => t <= b && t > b - 0.5).length, butir: itemRes.filter((it) => it.measure <= b && it.measure > b - 0.5).map((it) => it.index) });
  return {
    n_orang: N, n_butir: L, orang_ekstrem: P0.length - N, butir_ekstrem: L0 - L, iterasi: iter, konvergen: change <= tol,
    butir: itemRes, kategori: cats, ambang_berurutan: ordered,
    orang: { rata: round(mean(th), 2), sd: round(sd(th), 2), ...rel(th, pSE), infit_rata: round(mean(pStat.map((s) => s.ss / s.v)), 2), outfit_rata: round(mean(pStat.map((s) => s.z2 / L)), 2), misfit: pStat.filter((s) => s.z2 / L > 2).length },
    butir_ringkas: { rata: 0, sd: round(sd(deC), 2), ...rel(deC, itemRes.map((it) => it.se)) },
    peta_wright: bands,
  };
}

// ---- distribusi lain ----
// p dua sisi uji t: I_{df/(df+t²)}(df/2, 1/2)
const tPValue = (t, df) => (t === null || !Number.isFinite(t) || !(df > 0) ? null : ibeta(df / (df + t * t), df / 2, 0.5));
// gamma tak lengkap teregularisasi bawah P(a, x)
function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) { let ap = a; let del = 1 / a; let s2 = del; for (let n = 0; n < 500; n++) { ap += 1; del *= x / ap; s2 += del; if (Math.abs(del) < Math.abs(s2) * 1e-14) break; } return s2 * Math.exp(-x + a * Math.log(x) - lgamma(a)); }
  let b = x + 1 - a; let c = 1 / 1e-300; let d = 1 / b; let h = d;
  for (let i = 1; i < 500; i++) { const an = -i * (i - a); b += 2; d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300; c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300; d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-14) break; }
  return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
}
const chi2Cdf = (x, df) => (x <= 0 ? 0 : gammaP(df / 2, x / 2));
const chi2PValue = (x, df) => (x === null || !Number.isFinite(x) || df < 1 ? null : 1 - chi2Cdf(x, df));
// khi-kuadrat nonsentral (deret campuran Poisson), untuk selang kepercayaan RMSEA
function ncChi2Cdf(x, df, lam) {
  if (lam <= 0) return chi2Cdf(x, df);
  const h = lam / 2; let total = 0; const j0 = Math.floor(h);
  const pois = (j) => Math.exp(-h + j * Math.log(h) - lgamma(j + 1));
  for (let j = j0; j < j0 + 2000; j++) { const t = pois(j) * chi2Cdf(x, df + 2 * j); total += t; if (t < 1e-12 && j > j0 + 5) break; }
  for (let j = j0 - 1; j >= 0; j--) { const t = pois(j) * chi2Cdf(x, df + 2 * j); total += t; if (t < 1e-12) break; }
  return Math.min(1, total);
}
const normP2 = (z) => (z === null || !Number.isFinite(z) ? null : 2 * (1 - 0.5 * (1 + erf(Math.abs(z) / Math.SQRT2))));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }

// ---- aljabar matriks kecil (array 2D) ----
const zeros = (n, m = n) => Array.from({ length: n }, () => Array(m).fill(0));
function cholesky(A) { const n = A.length; const L = zeros(n); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s2 = A[i][j]; for (let k = 0; k < j; k++) s2 -= L[i][k] * L[j][k]; if (i === j) { if (!(s2 > 1e-12)) return null; L[i][i] = Math.sqrt(s2); } else L[i][j] = s2 / L[j][j]; } return L; }
function cholInverse(L) { const n = L.length; const Li = zeros(n); for (let i = 0; i < n; i++) { Li[i][i] = 1 / L[i][i]; for (let j = 0; j < i; j++) { let s2 = 0; for (let k = j; k < i; k++) s2 -= L[i][k] * Li[k][j]; Li[i][j] = s2 / L[i][i]; } } const inv = zeros(n); for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s2 = 0; for (let k = i; k < n; k++) s2 += Li[k][i] * Li[k][j]; inv[i][j] = inv[j][i] = s2; } return inv; }
const logDetChol = (L) => 2 * L.reduce((s2, r, i) => s2 + Math.log(r[i]), 0);
function invert(A) { // Gauss-Jordan (untuk Hessian)
  const n = A.length; const M = A.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) { let piv = c; for (let r2 = c + 1; r2 < n; r2++) if (Math.abs(M[r2][c]) > Math.abs(M[piv][c])) piv = r2; if (Math.abs(M[piv][c]) < 1e-14) return null; [M[c], M[piv]] = [M[piv], M[c]]; const d = M[c][c]; for (let j = 0; j < 2 * n; j++) M[c][j] /= d; for (let r2 = 0; r2 < n; r2++) if (r2 !== c) { const f = M[r2][c]; if (f) for (let j = 0; j < 2 * n; j++) M[r2][j] -= f * M[c][j]; } }
  return M.map((r) => r.slice(n));
}
// Nilai & vektor eigen matriks simetris (Jacobi), terurut menurun
function eigenSym(A0) {
  const n = A0.length; const A = A0.map((r) => [...r]); const V = zeros(n); for (let i = 0; i < n; i++) V[i][i] = 1;
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] ** 2; if (off < 1e-20) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]); const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)); const c = 1 / Math.sqrt(t * t + 1); const s2 = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p]; const akq = A[k][q]; A[k][p] = c * akp - s2 * akq; A[k][q] = s2 * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k]; const aqk = A[q][k]; A[p][k] = c * apk - s2 * aqk; A[q][k] = s2 * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p]; const vkq = V[k][q]; V[k][p] = c * vkp - s2 * vkq; V[k][q] = s2 * vkp + c * vkq; }
    }
  }
  return Array.from({ length: n }, (_, i) => ({ value: A[i][i], vector: V.map((r) => r[i]) })).sort((a, b) => b.value - a.value);
}
function covMatrix(X) { const n = X.length; const p = X[0].length; const m = Array.from({ length: p }, (_, j) => mean(X.map((r) => r[j]))); const C = zeros(p); for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) { let s2 = 0; for (const r of X) s2 += (r[i] - m[i]) * (r[j] - m[j]); C[i][j] = C[j][i] = s2 / (n - 1); } return C; }
// Uji t Welch dua kelompok dari rerata, SE, dan n
function welch(m1, se1, n1, m2, se2, n2) {
  const se = Math.sqrt(se1 * se1 + se2 * se2); if (!(se > 0)) return { kontras: round(m1 - m2, 2), se: null, t: null, df: null, p: null };
  const t = (m1 - m2) / se; const df = (se1 ** 2 + se2 ** 2) ** 2 / ((n1 > 1 ? se1 ** 4 / (n1 - 1) : 0) + (n2 > 1 ? se2 ** 4 / (n2 - 1) : 0) || 1e-12);
  return { kontras: round(m1 - m2, 2), se: round(se, 2), t: round(t, 2), df: Math.round(Math.min(df, 1e6)), p: round(tPValue(t, df), 4) };
}

module.exports = { round, sum, mean, variance, sd, median, mode, describe, pearson, alpha, spearmanBrown, rTable, alphaLabel, anova, fPValue, rasch,
  ibeta, lgamma, tPValue, gammaP, chi2Cdf, chi2PValue, ncChi2Cdf, normP2, zeros, cholesky, cholInverse, logDetChol, invert, eigenSym, covMatrix, welch };
