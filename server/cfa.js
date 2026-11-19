// Analisis Faktor Konfirmatori (CFA) dengan estimasi Maximum Likelihood pada matriks kovarians skor butir.
// Model: tiap butir memuat satu faktor; varians faktor = 1 (faktor terstandar), korelasi antarfaktor bebas.
// F_ML = ln|Σ| + tr(SΣ⁻¹) − ln|S| − p, Σ = ΛΦΛ' + Θ. Optimasi BFGS dengan gradien analitik; SE dari Hessian numerik.
const S = require('./stats');
const { round, mean, sum, zeros, cholesky, cholInverse, logDetChol, invert, chi2PValue, ncChi2Cdf, normP2, covMatrix, pearson } = S;

// factors: [{ kode, nama, items: [indeks kolom] }]
function fitCFA(X, factors, { maxIter = 3000 } = {}) {
  const N = X.length; const p = X[0].length; const m = factors.length;
  if (N < p + 5) return { error: `Data belum cukup untuk CFA: perlu lebih banyak responden lengkap (n = ${N}, butir = ${p}).` };
  const Sm = covMatrix(X); const LS = cholesky(Sm);
  if (!LS) return { error: 'Matriks kovarians butir tidak definit positif (ada butir tanpa variasi atau saling identik).' };
  const logDetS = logDetChol(LS);
  const fac = Array(p).fill(-1); factors.forEach((f, j) => f.items.forEach((i) => { fac[i] = j; }));
  const pairs = []; for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) pairs.push([a, b]);
  // vektor parameter: λ (p), θ (p, skala log saat optimasi), φ (pasangan)
  const nPar = 2 * p + pairs.length;
  const unpack = (v, logTheta = true) => {
    const lam = v.slice(0, p); const th = v.slice(p, 2 * p).map((t) => (logTheta ? Math.exp(t) : t));
    const Phi = zeros(m); for (let a = 0; a < m; a++) Phi[a][a] = 1; pairs.forEach(([a, b], k) => { Phi[a][b] = Phi[b][a] = v[2 * p + k]; });
    return { lam, th, Phi };
  };
  const sigmaOf = ({ lam, th, Phi }) => { const Sg = zeros(p); for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) { const v = lam[i] * lam[j] * Phi[fac[i]][fac[j]] + (i === j ? th[i] : 0); Sg[i][j] = Sg[j][i] = v; } return Sg; };
  const evalF = (v, logTheta = true, withGrad = true) => {
    const par = unpack(v, logTheta); const Sg = sigmaOf(par); const L = cholesky(Sg); if (!L) return { f: Infinity };
    const Si = cholInverse(L); let tr = 0; for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) tr += Sm[i][j] * Si[j][i];
    const f = logDetChol(L) + tr - logDetS - p; if (!withGrad) return { f };
    // Ω = Σ⁻¹ − Σ⁻¹SΣ⁻¹
    const SiS = zeros(p); for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) { let s2 = 0; for (let k = 0; k < p; k++) s2 += Si[i][k] * Sm[k][j]; SiS[i][j] = s2; }
    const Om = zeros(p); for (let i = 0; i < p; i++) for (let j = 0; j < p; j++) { let s2 = 0; for (let k = 0; k < p; k++) s2 += SiS[i][k] * Si[k][j]; Om[i][j] = Si[i][j] - s2; }
    const g = Array(nPar).fill(0);
    // ∂F/∂λ_i = 2 (ΩΛΦ)_{i,f(i)}
    const LP = Array.from({ length: p }, (_, k) => Array.from({ length: m }, (_, b) => par.lam[k] * par.Phi[fac[k]][b])); // (ΛΦ)_{k,b}
    for (let i = 0; i < p; i++) { let s2 = 0; for (let k = 0; k < p; k++) s2 += Om[i][k] * LP[k][fac[i]]; g[i] = 2 * s2; }
    for (let i = 0; i < p; i++) g[p + i] = Om[i][i] * (logTheta ? par.th[i] : 1);
    pairs.forEach(([a, b], k) => { let s2 = 0; for (let i = 0; i < p; i++) if (fac[i] === a) for (let j = 0; j < p; j++) if (fac[j] === b) s2 += par.lam[i] * Om[i][j] * par.lam[j]; g[2 * p + k] = 2 * s2; });
    return { f, g };
  };
  // nilai awal: λ dari korelasi butir dengan rerata faktornya
  const v0 = Array(nPar).fill(0);
  for (let i = 0; i < p; i++) { const sdv = Math.sqrt(Sm[i][i]); v0[i] = 0.6 * sdv; v0[p + i] = Math.log(Math.max(0.05, Sm[i][i] * 0.64)); }
  pairs.forEach((_, k) => { v0[2 * p + k] = 0.3; });
  // BFGS dengan pencarian garis Armijo
  let v = v0; let cur = evalF(v); let H = zeros(nPar); for (let i = 0; i < nPar; i++) H[i][i] = 1;
  let it = 0; let konvergen = false;
  for (; it < maxIter; it++) {
    const gn = Math.sqrt(sum(cur.g.map((x) => x * x))); if (gn < 1e-7) { konvergen = true; break; }
    let d = H.map((r) => -sum(r.map((h, j) => h * cur.g[j]))); let slope = sum(d.map((di, i) => di * cur.g[i]));
    if (!(slope < 0)) { H = zeros(nPar); for (let i = 0; i < nPar; i++) H[i][i] = 1; d = cur.g.map((x) => -x); slope = -gn * gn; }
    let step = 1; let next = null;
    for (let ls = 0; ls < 50; ls++) { const vn = v.map((x, i) => x + step * d[i]); const e = evalF(vn); if (Number.isFinite(e.f) && e.f <= cur.f + 1e-4 * step * slope) { next = { v: vn, ...e }; break; } step *= 0.5; }
    if (!next) break;
    const s2 = next.v.map((x, i) => x - v[i]); const y = next.g.map((x, i) => x - cur.g[i]); const sy = sum(s2.map((x, i) => x * y[i]));
    if (sy > 1e-12) { const Hy = H.map((r) => sum(r.map((h, j) => h * y[j]))); const yHy = sum(y.map((x, i) => x * Hy[i])); for (let i = 0; i < nPar; i++) for (let j = 0; j < nPar; j++) H[i][j] += ((sy + yHy) * s2[i] * s2[j]) / (sy * sy) - (Hy[i] * s2[j] + s2[i] * Hy[j]) / sy; }
    if (Math.abs(cur.f - next.f) < 1e-12 && step < 1e-6) { v = next.v; cur = next; konvergen = true; break; }
    v = next.v; cur = next;
  }
  // parameter alami (θ bukan log) untuk Hessian & SE
  const nat = [...v.slice(0, p), ...v.slice(p, 2 * p).map(Math.exp), ...v.slice(2 * p)];
  const Fmin = cur.f; const par = unpack(nat, false); const Sg = sigmaOf(par);
  const h = 1e-5; const Hs = zeros(nPar);
  for (let k = 0; k < nPar; k++) { const a = [...nat]; const b = [...nat]; a[k] += h; b[k] -= h; const ga = evalF(a, false).g; const gb = evalF(b, false).g; if (!ga || !gb) continue; for (let j = 0; j < nPar; j++) Hs[k][j] = (ga[j] - gb[j]) / (2 * h); }
  for (let i = 0; i < nPar; i++) for (let j = 0; j < i; j++) Hs[i][j] = Hs[j][i] = (Hs[i][j] + Hs[j][i]) / 2;
  const Hinv = invert(Hs); const seOf = (k) => (Hinv && Hinv[k][k] > 0 ? Math.sqrt((2 / (N - 1)) * Hinv[k][k]) : null);

  // ---- indeks kecocokan ----
  const df = (p * (p + 1)) / 2 - nPar; const chi2 = (N - 1) * Fmin;
  const diag = Sm.map((r, i) => r[i]); const Fb = sum(diag.map(Math.log)) - logDetS; const chi2b = (N - 1) * Fb; const dfb = (p * (p - 1)) / 2;
  const cfi = 1 - Math.max(chi2 - df, 0) / Math.max(chi2b - dfb, chi2 - df, 1e-12);
  const tli = (chi2b / dfb - chi2 / df) / (chi2b / dfb - 1);
  const rmsea = Math.sqrt(Math.max(chi2 - df, 0) / (df * (N - 1)));
  const lamFor = (target) => { if (ncChi2Cdf(chi2, df, 0) < target) return 0; let lo = 0; let hi = Math.max(10, chi2 * 3); for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (ncChi2Cdf(chi2, df, mid) > target) lo = mid; else hi = mid; } return (lo + hi) / 2; };
  const ciLo = Math.sqrt(lamFor(0.95) / (df * (N - 1))); const ciHi = Math.sqrt(lamFor(0.05) / (df * (N - 1)));
  const pClose = 1 - ncChi2Cdf(chi2, df, 0.0025 * df * (N - 1));
  let srs = 0; let cnt = 0; for (let i = 0; i < p; i++) for (let j = 0; j <= i; j++) { srs += ((Sm[i][j] - Sg[i][j]) / Math.sqrt(Sm[i][i] * Sm[j][j])) ** 2; cnt++; }
  const srmr = Math.sqrt(srs / cnt);
  const logLik = -((N - 1) / 2) * (logDetS + Fmin + p + p * Math.log(2 * Math.PI)) ; // log-likelihood (konstanta Wishart)
  const aic = -2 * logLik + 2 * nPar; const bic = -2 * logLik + Math.log(N) * nPar;

  // ---- muatan faktor ----
  const muatan = Array.from({ length: p }, (_, i) => {
    const lam = par.lam[i]; const se = seOf(i); const vi = Sg[i][i]; const std = lam / Math.sqrt(vi);
    return { item: i, faktor: factors[fac[i]].kode, lambda: lam, se, z: se ? lam / se : null, p: se ? normP2(lam / se) : null, std, r2: std * std, galat: par.th[i], galat_se: seOf(p + i) };
  });
  const korelasi = pairs.map(([a, b], k) => { const r = par.Phi[a][b]; const se = seOf(2 * p + k); return { a: factors[a].kode, b: factors[b].kode, r, se, z: se ? r / se : null, p: se ? normP2(r / se) : null }; });
  // reliabilitas komposit, AVE, validitas diskriminan (Fornell-Larcker & HTMT)
  const R = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => (i === j ? 1 : Sm[i][j] / Math.sqrt(Sm[i][i] * Sm[j][j]))));
  const perFaktor = factors.map((f, j) => {
    const ls = muatan.filter((x) => fac[x.item] === j).map((x) => x.std); const sl = sum(ls); const se2 = sum(ls.map((l) => 1 - l * l));
    return { kode: f.kode, nama: f.nama, butir: f.items.length, cr: (sl * sl) / (sl * sl + se2), ave: mean(ls.map((l) => l * l)), muatan_min: Math.min(...ls), muatan_maks: Math.max(...ls) };
  });
  const mono = (j) => { const its = factors[j].items; const v2 = []; for (let a = 0; a < its.length; a++) for (let b = a + 1; b < its.length; b++) v2.push(R[its[a]][its[b]]); return mean(v2); };
  const htmt = pairs.map(([a, b]) => { const v2 = []; for (const i of factors[a].items) for (const j of factors[b].items) v2.push(R[i][j]); return { a: factors[a].kode, b: factors[b].kode, htmt: mean(v2) / Math.sqrt(Math.abs(mono(a) * mono(b))) }; });
  // korelasi residu terbesar (petunjuk sumber ketidakcocokan)
  const residu = []; for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) residu.push({ a: i, b: j, r: (Sm[i][j] - Sg[i][j]) / Math.sqrt(Sm[i][i] * Sm[j][j]) });
  residu.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

  return {
    n: N, butir: p, faktor: m, parameter: nPar, iterasi: it, konvergen,
    fit: { chi2, df, p: chi2PValue(chi2, df), chi2_df: chi2 / df, cfi, tli, rmsea, rmsea_lo: ciLo, rmsea_hi: ciHi, p_close: pClose, srmr, aic, bic, chi2_baseline: chi2b, df_baseline: dfb },
    muatan, korelasi, per_faktor: perFaktor, htmt, residu_terbesar: residu.slice(0, 10),
  };
}

// Interpretasi indeks kecocokan (Hu & Bentler, 1999; Browne & Cudeck, 1993)
function fitVerdict(fit) {
  const c = [];
  c.push(['CFI', fit.cfi, fit.cfi >= 0.95 ? 'Baik' : fit.cfi >= 0.9 ? 'Dapat diterima' : 'Kurang']);
  c.push(['TLI', fit.tli, fit.tli >= 0.95 ? 'Baik' : fit.tli >= 0.9 ? 'Dapat diterima' : 'Kurang']);
  c.push(['RMSEA', fit.rmsea, fit.rmsea <= 0.06 ? 'Baik' : fit.rmsea <= 0.08 ? 'Dapat diterima' : fit.rmsea <= 0.1 ? 'Marginal' : 'Kurang']);
  c.push(['SRMR', fit.srmr, fit.srmr <= 0.08 ? 'Baik' : fit.srmr <= 0.1 ? 'Dapat diterima' : 'Kurang']);
  c.push(['χ²/df', fit.chi2_df, fit.chi2_df <= 3 ? 'Baik' : fit.chi2_df <= 5 ? 'Dapat diterima' : 'Kurang']);
  return c.map(([indeks, nilai, status]) => ({ indeks, nilai, status }));
}

module.exports = { fitCFA, fitVerdict, pearson };
