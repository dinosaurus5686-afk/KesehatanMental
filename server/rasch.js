// Analisis Rasch Rating Scale (Andrich) lengkap ala Winsteps: estimasi JMLE, statistik kecocokan (MNSQ & ZSTD),
// Tabel 3.1 (ringkasan), 3.2 (diagnosis skala rating), 6.1 (person fit), 10.1 (misfit butir), 12.2 (peta Wright),
// 13.1 (ukuran butir), 17.1 (ukuran orang), 23.0 (unidimensionalitas: PCA residu terstandar),
// 28.1 (subtotal orang per kelompok demografis) dan 30.1 (DIF butir per kelompok demografis).
const S = require('./stats');
const { round, sum, mean, variance, sd, pearson, welch, tPValue, eigenSym } = S;

const clamp = (v, c = 1) => Math.max(-c, Math.min(c, v));
// Probabilitas kategori 0..M untuk selisih b = θ − δ dan ambang tau[1..M]
function probs(b, tau) { const M = tau.length - 1; const num = [1]; let acc = 0; for (let k = 1; k <= M; k++) { acc += b - tau[k]; num[k] = Math.exp(acc); } const s = sum(num); return num.map((v) => v / s); }
function moments(P) { let E = 0; let E2 = 0; for (let k = 0; k < P.length; k++) { E += k * P[k]; E2 += k * k * P[k]; } const V = E2 - E * E; let C = 0; for (let k = 0; k < P.length; k++) C += (k - E) ** 4 * P[k]; return { E, V, C }; }
// ZSTD (Wilson-Hilferty): t = (MNSQ^(1/3) − 1)(3/q) + q/3
const zstd = (mnsq, q) => (q > 0 && mnsq > 0 ? (Math.cbrt(mnsq) - 1) * (3 / q) + q / 3 : null);
const sep = (meas, ses) => { const ov = variance(meas); const mse = mean(ses.map((s) => s * s)); const trueVar = Math.max(0, ov - mse); const rel = ov ? trueVar / ov : 0; return { rmse: Math.sqrt(mse), true_sd: Math.sqrt(trueVar), separasi: Math.sqrt(trueVar) / Math.sqrt(mse || 1e-12), reliabilitas: rel }; };

// Estimasi ukuran orang/butir untuk skor ekstrem (koreksi 0,3 skor) dengan parameter lain tetap
function measureFor(target, others, tau, sign = 1) {
  let b = 0; for (let it = 0; it < 100; it++) { let E = 0; let V = 0; for (const o of others) { const m = moments(probs(sign * (b - o), tau)); E += m.E; V += m.V; } const step = clamp((target - E) / (V || 1e-9)); b += sign * step; if (Math.abs(step) < 1e-5) break; }
  let V = 0; for (const o of others) V += moments(probs(sign * (b - o), tau)).V;
  return { measure: b, se: 1 / Math.sqrt(V || 1e-9) };
}

// X: matriks responden × butir, kategori 0..M. labels: { persons: [...], items: [...] } untuk pelaporan.
function estimate(X, { maxIter = 500, tol = 0.0001 } = {}) {
  if (!X.length || !X[0].length) return null;
  const M = Math.max(...X.flat()); const L0 = X[0].length; if (M < 1) return null;
  const P0 = X.map((row, i) => ({ i, row, raw: sum(row) }));
  const persons = P0.filter((p) => p.raw > 0 && p.raw < L0 * M);
  const itemRaw = Array.from({ length: L0 }, (_, j) => sum(persons.map((p) => p.row[j])));
  const items = itemRaw.map((raw, j) => ({ j, raw })).filter((it) => it.raw > 0 && it.raw < persons.length * M);
  if (persons.length < 5 || items.length < 2) return { error: 'Data belum cukup untuk analisis Rasch (minimal 5 responden tidak ekstrem).' };
  const N = persons.length; const L = items.length;
  const x = persons.map((p) => items.map((it) => p.row[it.j]));
  const th = persons.map((p) => { const r = sum(items.map((it) => p.row[it.j])); return Math.log((r + 0.5) / (L * M - r + 0.5)); });
  let de = items.map((it) => Math.log((N * M - it.raw + 0.5) / (it.raw + 0.5)));
  { const m = mean(de); de = de.map((d) => d - m); }
  const tau = Array(M + 1).fill(0);
  let iter = 0; let change = Infinity;
  for (; iter < maxIter && change > tol; iter++) {
    change = 0;
    for (let n = 0; n < N; n++) { let s2 = 0; let w = 0; for (let i = 0; i < L; i++) { const m = moments(probs(th[n] - de[i], tau)); s2 += x[n][i] - m.E; w += m.V; } const step = w ? clamp(s2 / w) : 0; th[n] += step; change = Math.max(change, Math.abs(step)); }
    for (let i = 0; i < L; i++) { let s2 = 0; let w = 0; for (let n = 0; n < N; n++) { const m = moments(probs(th[n] - de[i], tau)); s2 += x[n][i] - m.E; w += m.V; } const step = w ? clamp(s2 / w) : 0; de[i] -= step; change = Math.max(change, Math.abs(step)); }
    { const m = mean(de); de = de.map((d) => d - m); }
    for (let k = 1; k <= M; k++) {
      let obs = 0; let exp = 0; let v = 0;
      for (let n = 0; n < N; n++) for (let i = 0; i < L; i++) { const P = probs(th[n] - de[i], tau); const pg = sum(P.slice(k)); obs += x[n][i] >= k ? 1 : 0; exp += pg; v += pg * (1 - pg); }
      const step = v ? clamp((obs - exp) / v) : 0; tau[k] -= step; change = Math.max(change, Math.abs(step));
    }
    { const m = mean(tau.slice(1)); for (let k = 1; k <= M; k++) tau[k] -= m; }
  }
  return { M, N, L, L0, x, th, de, tau, persons, items, P0, iter, konvergen: change <= tol };
}

function analyze(X, { personLabels = [], itemLabels = [], personGroups = {} } = {}) {
  const est = estimate(X); if (!est || est.error) return est || { error: 'Data belum cukup untuk analisis Rasch.' };
  const { M, N, L, x, th, de, tau, persons, items, P0 } = est;
  // ---- residu & statistik per observasi ----
  const obs = []; // [n][i] = {E,V,C,P}
  for (let n = 0; n < N; n++) { obs.push([]); for (let i = 0; i < L; i++) { const P = probs(th[n] - de[i], tau); obs[n].push({ ...moments(P), P }); } }
  const fitOf = (cells) => {
    let ss = 0; let V = 0; let z2 = 0; let qi = 0; let qo = 0; let match = 0; let expMatch = 0;
    for (const { xv, o } of cells) {
      const r2 = (xv - o.E) ** 2; ss += r2; V += o.V; z2 += o.V ? r2 / o.V : 0; qi += o.C - o.V * o.V; qo += o.V ? o.C / (o.V * o.V) : 0;
      const mod = o.P.indexOf(Math.max(...o.P)); match += xv === mod ? 1 : 0; expMatch += o.P[mod];
    }
    const k = cells.length; const infit = V ? ss / V : null; const outfit = k ? z2 / k : null;
    const qIn = V ? Math.sqrt(Math.max(qi, 0)) / V : 0; const qOut = k ? Math.sqrt(Math.max(qo / (k * k) - 1 / k, 0)) : 0;
    return { se: V ? 1 / Math.sqrt(V) : null, infit, infit_z: zstd(infit, qIn), outfit, outfit_z: zstd(outfit, qOut), obs_match: k ? (match / k) * 100 : null, exp_match: k ? (expMatch / k) * 100 : null };
  };
  // korelasi titik-ukuran teramati & harapan: Cov(X, m) dibanding Var(E) + rerata V
  const ptm = (xs, Es, Vs, ms) => {
    const r = pearson(xs, ms); const mm = mean(ms); const me = mean(Es);
    const cov = mean(Es.map((e, k) => (e - me) * (ms[k] - mm))); const ve = variance(Es) * (Es.length - 1) / Es.length + mean(Vs); const vm = variance(ms) * (ms.length - 1) / ms.length;
    return { r, exp: ve > 0 && vm > 0 ? cov / Math.sqrt(ve * vm) : null };
  };
  const itemRows = items.map((it, i) => {
    const cells = x.map((row, n) => ({ xv: row[i], o: obs[n][i] })); const f = fitOf(cells);
    const p = ptm(x.map((r) => r[i]), obs.map((o) => o[i].E), obs.map((o) => o[i].V), th);
    return { index: it.j, label: itemLabels[it.j] ?? `B${it.j + 1}`, skor: it.raw, jumlah: N, ukuran: de[i], ...f, ptmea: p.r, ptmea_exp: p.exp };
  });
  const personRows = persons.map((p, n) => {
    const cells = x[n].map((xv, i) => ({ xv, o: obs[n][i] })); const f = fitOf(cells);
    const pt = ptm(x[n], obs[n].map((o) => o.E), obs[n].map((o) => o.V), de.map((d) => -d));
    return { index: p.i, label: personLabels[p.i] ?? `P${p.i + 1}`, skor: sum(x[n]), jumlah: L, ukuran: th[n], ...f, ptmea: pt.r, ptmea_exp: pt.exp, ekstrem: null };
  });
  // orang dengan skor ekstrem: ukuran diperkirakan dari skor terkoreksi 0,3 (seperti Winsteps)
  const itemIdx = items.map((it) => it.j);
  const extremeP = P0.filter((p) => !(p.raw > 0 && p.raw < P0[0].row.length * M)).map((p) => {
    const raw = sum(itemIdx.map((j) => p.row[j])); const target = raw <= 0 ? 0.3 : L * M - 0.3; const m = measureFor(target, de, tau, 1);
    return { index: p.i, label: personLabels[p.i] ?? `P${p.i + 1}`, skor: raw, jumlah: L, ukuran: m.measure, se: m.se, infit: null, infit_z: null, outfit: null, outfit_z: null, ptmea: null, ptmea_exp: null, obs_match: null, exp_match: null, ekstrem: raw <= 0 ? 'MINIMUM' : 'MAKSIMUM' };
  });
  const allPersons = [...personRows, ...extremeP];

  // ---- Tabel 3.1: ringkasan statistik ----
  const VARS = [['skor', 'Skor total'], ['jumlah', 'Jumlah'], ['ukuran', 'Ukuran (logit)'], ['se', 'Model S.E.'], ['infit', 'Infit MNSQ'], ['infit_z', 'Infit ZSTD'], ['outfit', 'Outfit MNSQ'], ['outfit_z', 'Outfit ZSTD']];
  const summary = (rows) => {
    const stat = Object.fromEntries(VARS.map(([k]) => { const v = rows.map((r) => r[k]).filter((y) => y !== null && Number.isFinite(y)); return [k, { mean: mean(v), sem: v.length > 1 ? sd(v) / Math.sqrt(v.length) : null, psd: Math.sqrt(variance(v) * (v.length - 1) / (v.length || 1)), ssd: sd(v), max: v.length ? Math.max(...v) : null, min: v.length ? Math.min(...v) : null }]; }));
    const meas = rows.map((r) => r.ukuran); const model = sep(meas, rows.map((r) => r.se)); const real = sep(meas, rows.map((r) => r.se * Math.sqrt(Math.max(1, r.infit ?? 1))));
    return { n: rows.length, stat, model, real };
  };
  const kr20 = (() => { const k = L; const tot = x.map((r) => sum(r)); const vt = variance(tot); const vi = sum(Array.from({ length: k }, (_, i) => variance(x.map((r) => r[i])))); return vt ? (k / (k - 1)) * (1 - vi / vt) : null; })();
  const tabel3_1 = {
    orang: { ...summary(personRows), ekstrem: extremeP.length, dengan_ekstrem: summary(allPersons.map((p) => ({ ...p, infit: p.infit ?? 1 }))), alpha: kr20, korelasi_skor_ukuran: pearson(personRows.map((p) => p.skor), personRows.map((p) => p.ukuran)) },
    butir: { ...summary(itemRows), ekstrem: est.L0 - L },
  };

  // ---- Tabel 3.2: diagnosis skala rating ----
  // kecocokan kategori: kuadrat residu teramati pada kategori k dibanding nilai harapannya (≈ 1 bila data cocok)
  const cat = Array.from({ length: M + 1 }, () => ({ n: 0, sumB: 0, expW: 0, expB: 0, ss: 0, ssE: 0, z2: 0, z2E: 0 }));
  for (let n = 0; n < N; n++) for (let i = 0; i < L; i++) {
    const o = obs[n][i]; const b = th[n] - de[i]; const xv = x[n][i]; const c = cat[xv];
    c.n++; c.sumB += b; const r2 = (xv - o.E) ** 2; c.ss += r2; c.z2 += o.V ? r2 / o.V : 0;
    for (let k = 0; k <= M; k++) { const e2 = (k - o.E) ** 2; cat[k].expW += o.P[k]; cat[k].expB += o.P[k] * b; cat[k].ssE += o.P[k] * e2; cat[k].z2E += o.V ? (o.P[k] * e2) / o.V : 0; }
  }
  const catMeasure = (k) => { const target = k === 0 ? 0.25 : k === M ? M - 0.25 : k; let b = 0; for (let it = 0; it < 200; it++) { const m = moments(probs(b, tau)); const step = clamp((target - m.E) / (m.V || 1e-9)); b += step; if (Math.abs(step) < 1e-6) break; } return b; };
  const tauSE = (k) => { let v = 0; for (let n = 0; n < N; n++) for (let i = 0; i < L; i++) { const P = obs[n][i].P; const pg = sum(P.slice(k)); v += pg * (1 - pg); } return v ? 1 / Math.sqrt(v) : null; };
  const tabel3_2 = cat.map((c, k) => ({ kategori: k, skor: k + 1, jumlah: c.n, persen: (c.n / (N * L)) * 100, rata_teramati: c.n ? c.sumB / c.n : null, rata_harapan: c.expW ? c.expB / c.expW : null,
    infit: c.ssE ? c.ss / c.ssE : null, outfit: c.z2E ? c.z2 / c.z2E : null, ambang: k === 0 ? null : tau[k], ambang_se: k === 0 ? null : tauSE(k), ukuran_kategori: catMeasure(k) }));
  const ambangBerurutan = tabel3_2.slice(2).every((c, i) => c.ambang > tabel3_2[i + 1].ambang);
  const rataBerurutan = tabel3_2.slice(1).every((c, i) => c.rata_teramati === null || tabel3_2[i].rata_teramati === null || c.rata_teramati > tabel3_2[i].rata_teramati);

  // ---- Tabel 23.0: unidimensionalitas (PCA residu terstandar) ----
  const m0 = mean(x.flat());
  let expV = 0; let unexpV = 0; let pV = 0; let iV = 0; const dm = mean(de); const tm = mean(th);
  for (let n = 0; n < N; n++) for (let i = 0; i < L; i++) {
    const E = obs[n][i].E; expV += (E - m0) ** 2; unexpV += (x[n][i] - E) ** 2;
    pV += (moments(probs(th[n] - dm, tau)).E - m0) ** 2; iV += (moments(probs(tm - de[i], tau)).E - m0) ** 2;
  }
  const total = expV + unexpV; const eig = (v) => (v / unexpV) * L;
  const Z = x.map((row, n) => row.map((xv, i) => (obs[n][i].V ? (xv - obs[n][i].E) / Math.sqrt(obs[n][i].V) : 0)));
  const R = Array.from({ length: L }, (_, i) => Array.from({ length: L }, (_, j) => (i === j ? 1 : pearson(Z.map((r) => r[i]), Z.map((r) => r[j])) ?? 0)));
  const eigs = eigenSym(R);
  const totalEig = eig(total);
  const tabel23 = {
    total: { eigen: totalEig, persen: 100 }, dijelaskan: { eigen: eig(expV), persen: (expV / total) * 100 },
    dijelaskan_orang: { eigen: eig(expV) * (pV / (pV + iV || 1)), persen: (expV / total) * 100 * (pV / (pV + iV || 1)) },
    dijelaskan_butir: { eigen: eig(expV) * (iV / (pV + iV || 1)), persen: (expV / total) * 100 * (iV / (pV + iV || 1)) },
    tak_dijelaskan: { eigen: L, persen: (unexpV / total) * 100 },
    kontras: eigs.slice(0, 5).map((e, k) => ({ ke: k + 1, eigen: e.value, persen_total: (e.value / totalEig) * 100, persen_tak_dijelaskan: (e.value / L) * 100 })),
    muatan_kontras1: eigs[0].vector.map((v, i) => ({ label: itemRows[i].label, muatan: v * Math.sqrt(Math.max(eigs[0].value, 0)), ukuran: de[i], infit: itemRows[i].infit, outfit: itemRows[i].outfit })).sort((a, b) => b.muatan - a.muatan),
    model_dijelaskan_persen: null,
  };
  // varians yang diharapkan dijelaskan bila data cocok sempurna dengan model
  { let ev = 0; let mv = 0; for (let n = 0; n < N; n++) for (let i = 0; i < L; i++) { const o = obs[n][i]; ev += (o.E - m0) ** 2; mv += o.V; } tabel23.model_dijelaskan_persen = (ev / (ev + mv)) * 100; }

  // ---- Tabel 12.2: peta Wright (pita 0,25 logit) ----
  const allM = [...allPersons.map((p) => p.ukuran), ...itemRows.map((i) => i.ukuran)];
  const step = 0.25; const hi = Math.ceil(Math.max(...allM) / step) * step; const lo = Math.floor(Math.min(...allM) / step) * step;
  const pm = mean(allPersons.map((p) => p.ukuran)); const ps = sd(allPersons.map((p) => p.ukuran)); const im = mean(itemRows.map((i) => i.ukuran)); const is = sd(itemRows.map((i) => i.ukuran));
  const mark = (m, s2, b) => { const inBand = (v) => v <= b + 1e-9 && v > b - step + 1e-9; return inBand(m) ? 'M' : inBand(m + s2) || inBand(m - s2) ? 'S' : inBand(m + 2 * s2) || inBand(m - 2 * s2) ? 'T' : ''; };
  const bands = []; for (let b = hi; b > lo - 1e-9; b -= step) bands.push({ batas: b, orang: allPersons.filter((p) => p.ukuran <= b + 1e-9 && p.ukuran > b - step + 1e-9).length, butir: itemRows.filter((i) => i.ukuran <= b + 1e-9 && i.ukuran > b - step + 1e-9).map((i) => i.label), tanda_orang: mark(pm, ps, b), tanda_butir: mark(im, is, b) });
  const perHash = Math.max(1, Math.ceil(Math.max(...bands.map((b) => b.orang)) / 40));
  const teks = [`MEASURE   ORANG - PETA - BUTIR   (# = ${perHash} orang, . = 1–${perHash - 1 || 1})`, '          <lebih tinggi> | <lebih sulit>'];
  for (const b of bands) { const hashes = '#'.repeat(Math.floor(b.orang / perHash)) + (b.orang % perHash ? '.' : ''); const lab = Number.isInteger(b.batas) ? `${b.batas >= 0 ? ' ' : ''}${b.batas.toFixed(0)}`.padStart(4) : '    '; teks.push(`${lab}  ${hashes.padStart(42)} ${(b.tanda_orang || ' ')}|${(b.tanda_butir || ' ')} ${b.butir.join(' ')}`); }
  teks.push('          <lebih rendah> | <lebih mudah>');
  const tabel12_2 = { pita: bands, per_tanda: perHash, teks: teks.join('\n'), orang: { mean: pm, sd: ps }, butir: { mean: im, sd: is } };

  // ---- Tabel 28.1: subtotal orang per kelompok demografis ----
  const tabel28 = Object.entries(personGroups).map(([kode, { nama, of }]) => {
    const m = new Map(); for (const p of allPersons) { const g = of(p.index) ?? 'Tidak diketahui'; if (!m.has(g)) m.set(g, []); m.get(g).push(p); }
    const groups = [...m.entries()].sort((a, b) => b[1].length - a[1].length).map(([label, ps2]) => {
      const meas = ps2.map((p) => p.ukuran); const sorted = [...meas].sort((a, b) => a - b); const r2 = sep(meas, ps2.map((p) => p.se * Math.sqrt(Math.max(1, p.infit ?? 1))));
      return { label, n: ps2.length, mean: mean(meas), se_mean: ps2.length > 1 ? sd(meas) / Math.sqrt(ps2.length) : null, psd: Math.sqrt(variance(meas) * (meas.length - 1) / meas.length), median: sorted[Math.floor((sorted.length - 1) / 2)], min: sorted[0], max: sorted.at(-1), separasi: ps2.length > 1 ? r2.separasi : null, reliabilitas: ps2.length > 1 ? r2.reliabilitas : null };
    });
    const cmp = groups.filter((g) => g.n >= 2 && g.label !== 'Tidak diketahui').slice(0, 10); const pairs = [];
    for (let a = 0; a < cmp.length; a++) for (let b = a + 1; b < cmp.length; b++) pairs.push({ a: cmp[a].label, b: cmp[b].label, ...welch(cmp[a].mean, cmp[a].se_mean, cmp[a].n, cmp[b].mean, cmp[b].se_mean, cmp[b].n) });
    return { kode, nama, kelompok: groups, perbandingan: pairs };
  });

  // ---- Tabel 30.1: DIF butir per kelompok demografis (ukuran orang & ambang tetap) ----
  const difMeasure = (i, rows) => {
    const xs = rows.map((n) => x[n][i]); const tot = sum(xs); if (!rows.length || tot <= 0 || tot >= rows.length * M) return null;
    let d = de[i]; for (let it = 0; it < 100; it++) { let s2 = 0; let w = 0; for (const n of rows) { const m = moments(probs(th[n] - d, tau)); s2 += x[n][i] - m.E; w += m.V; } const st = clamp(s2 / (w || 1e-9)); d -= st; if (Math.abs(st) < 1e-5) break; }
    let w = 0; for (const n of rows) w += moments(probs(th[n] - d, tau)).V; return { ukuran: d, se: 1 / Math.sqrt(w || 1e-9), n: rows.length };
  };
  const etsClass = (c, p) => (Math.abs(c) < 0.43 || p === null || p >= 0.05 ? 'A (dapat diabaikan)' : Math.abs(c) < 0.64 ? 'B (sedang)' : 'C (besar)');
  const tabel30 = Object.entries(personGroups).map(([kode, { nama, of }]) => {
    const m = new Map(); persons.forEach((p, n) => { const g = of(p.i) ?? 'Tidak diketahui'; if (!m.has(g)) m.set(g, []); m.get(g).push(n); });
    const groups = [...m.entries()].filter(([g, rows]) => g !== 'Tidak diketahui' && rows.length >= 5).sort((a, b) => b[1].length - a[1].length).slice(0, 10);
    const per = itemRows.map((it, i) => ({ label: it.label, ukuran: it.ukuran, kelompok: groups.map(([g, rows]) => { const d = difMeasure(i, rows); return { label: g, n: rows.length, ukuran: d?.ukuran ?? null, se: d?.se ?? null, ukuran_dif: d ? d.ukuran - it.ukuran : null }; }) }));
    const kontras = []; for (const it of per) for (let a = 0; a < it.kelompok.length; a++) for (let b = a + 1; b < it.kelompok.length; b++) {
      const A = it.kelompok[a]; const B = it.kelompok[b]; if (A.ukuran === null || B.ukuran === null) continue;
      const w = welch(A.ukuran, A.se, A.n, B.ukuran, B.se, B.n);
      kontras.push({ butir: it.label, a: A.label, b: B.label, ukuran_a: A.ukuran, se_a: A.se, ukuran_b: B.ukuran, se_b: B.se, ...w, kategori: etsClass(w.kontras, w.p), bermakna: Math.abs(w.kontras) >= 0.5 && w.p !== null && w.p < 0.05 });
    }
    return { kode, nama, kelompok: groups.map(([g, rows]) => ({ label: g, n: rows.length })), butir: per, kontras: kontras.sort((p, q) => Math.abs(q.kontras) - Math.abs(p.kontras)) };
  });

  const fitLabel = (r) => (r.infit === null ? '—' : r.infit >= 0.5 && r.infit <= 1.5 && r.outfit >= 0.5 && r.outfit <= 1.5 ? 'Cocok' : r.infit > 2 || r.outfit > 2 ? 'Tidak cocok' : 'Perlu ditinjau');
  const misfitKey = (r) => Math.max(r.outfit ?? 0, r.infit ?? 0);
  return {
    n_orang: N, n_orang_total: allPersons.length, n_butir: L, orang_ekstrem: extremeP.length, butir_ekstrem: est.L0 - L, iterasi: est.iter, konvergen: est.konvergen,
    tabel3_1, tabel3_2, ambang_berurutan: ambangBerurutan, rata_berurutan: rataBerurutan, tabel23, tabel12_2, tabel28, tabel30,
    tabel13_1: [...itemRows].sort((a, b) => b.ukuran - a.ukuran).map((r) => ({ ...r, kecocokan: fitLabel(r) })),
    tabel10_1: [...itemRows].sort((a, b) => misfitKey(b) - misfitKey(a)).map((r) => ({ ...r, kecocokan: fitLabel(r) })),
    tabel17_1: [...allPersons].sort((a, b) => b.ukuran - a.ukuran).map((r) => ({ ...r, kecocokan: fitLabel(r) })),
    tabel6_1: [...personRows].sort((a, b) => misfitKey(b) - misfitKey(a)).map((r) => ({ ...r, kecocokan: fitLabel(r) })),
  };
}

// pembulatan seluruh angka hasil untuk dikirim ke klien
function rounded(o, d = 2) {
  if (Array.isArray(o)) return o.map((x) => rounded(x, d));
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' ? round(v, ['p'].includes(k) ? 4 : d) : rounded(v, d)]));
  return o;
}

module.exports = { estimate, analyze, rounded, tPValue };
