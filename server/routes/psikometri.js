// Admin · Psikometrik: pemantauan kehandalan instrumen IKDKM-M lintas kampus sampai tingkat butir.
// Pengaturan butir aktif & interpretasi (kuantitatif/kualitatif), analisis deskriptif, validitas butir (korelasi butir-total
// terkoreksi), reliabilitas (Cronbach's alpha & belah dua Spearman-Brown), analisis demografis (ANOVA) dan model Rasch.
// Identitas responden disamarkan (kode R-…) sesuai UU PDP.
const express = require('express');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const { get, audit } = require('../db');
const { fail, requireRole, str } = require('../http');
const { decodeAnswers } = require('../services');
const { itemScore } = require('../scoring');
const { ITEMS, DIMENSIONS, SCALE } = require('../reference');
const S = require('../stats');
const cohort = require('../cohort');
const instrument = require('../instrument');
const RA = require('../rasch');
const { fitCFA, fitVerdict } = require('../cfa');
const REP = require('../psi-report');

const r = express.Router();
const admin = requireRole('admin');
const CODES = SCALE.map(([c]) => c);
const { round, mean, variance, alpha, rTable, alphaLabel } = S;
const respCode = (uid) => 'R-' + crypto.createHash('sha256').update('panjalu:' + uid).digest('hex').slice(0, 8).toUpperCase();
const idx = (no) => ITEMS.findIndex((it) => it.no === no);
const dimName = (k) => DIMENSIONS.find((d) => d.kode === k)?.mudah || k;

// ---------- data ----------
function loadResponses(f) {
  return cohort.loadRows(f).map((a) => {
    let raw = {}; try { raw = decodeAnswers(a).A || {}; } catch { /* jawaban tidak terbaca: dilewati */ }
    const jawaban = ITEMS.map((it) => { const v = raw[it.no] ?? raw[String(it.no)]; return CODES.includes(v) ? v : null; });
    let h = {}; try { h = JSON.parse(a.hasil_json); } catch { /* */ }
    return { a, h, jawaban, skor: ITEMS.map((it, i) => itemScore(it, jawaban[i])) };
  });
}
// Skala yang dianalisis; hanya butir yang sedang aktif
function scales() {
  const on = (it) => instrument.isActive(it.no);
  return [
    ...DIMENSIONS.map((d) => ({ kode: d.kode, nama: `${d.kode} · ${d.mudah || d.nama}`, butir: ITEMS.filter((it) => it.dimensi === d.kode && on(it)).map((it) => it.no) })),
    { kode: 'FONDASI', nama: '5 Kebutuhan Dasar (V1–V5)', butir: ITEMS.filter((it) => it.bagian === 1 && on(it)).map((it) => it.no) },
    { kode: 'TOTAL', nama: 'Indeks Kekuatan Mental (V1–V6)', butir: ITEMS.filter((it) => it.bagian < 3 && on(it)).map((it) => it.no) },
    { kode: 'S', nama: 'Kesiapan dibantu (Bagian 3)', butir: ITEMS.filter((it) => it.bagian === 3 && on(it)).map((it) => it.no) },
  ];
}
// Matriks lengkap (responden yang menjawab semua butir skala)
const matrix = (resp, nos) => resp.map((x) => nos.map((no) => x.skor[idx(no)])).filter((row) => row.every((v) => v !== null));

// ---------- validitas & reliabilitas ----------
function analyze(resp) {
  const SC = scales(); const total = SC.find((s) => s.kode === 'TOTAL');
  const active = instrument.activeItems().map((it) => it.no);
  const complete = resp.filter((x) => active.every((no) => x.skor[idx(no)] !== null));
  const n = complete.length; const rt = rTable(n);
  const reliab = SC.map((sc) => {
    const m = matrix(complete, sc.butir); const a = alpha(m);
    return { kode: sc.kode, nama: sc.nama, jumlah_butir: sc.butir.length, n: m.length, alpha: round(a), kategori: alphaLabel(a), ...S.spearmanBrown(m) };
  });
  const scaleOf = (it) => SC.find((sc) => sc.kode === it.dimensi) || SC.find((sc) => sc.kode === 'S');
  const butir = ITEMS.map((it, i) => {
    const aktif = active.includes(it.no);
    const pool = aktif ? complete : resp.filter((x) => x.skor[i] !== null);
    const xs = pool.map((x) => x.skor[i]);
    const dist = Object.fromEntries(CODES.map((c) => [c, pool.filter((x) => x.jawaban[i] === c).length]));
    const base = { no: it.no, dimensi: it.dimensi, arah: it.arah, indikator: it.indikator, teks: it.teks, aktif, n: pool.length, rerata: xs.length ? round(mean(xs), 2) : null, sd: xs.length ? round(Math.sqrt(variance(xs)), 2) : null, distribusi: dist };
    if (!aktif) return { ...base, r_butir_dimensi: null, r_butir_total: null, alpha_jika_dihapus: null, alpha_dimensi: null, status: 'Nonaktif' };
    const sc = scaleOf(it); const others = sc.butir.filter((no) => no !== it.no);
    const restDim = complete.map((x) => others.reduce((s, no) => s + x.skor[idx(no)], 0));
    const inTotal = total.butir.includes(it.no);
    const restTot = inTotal ? complete.map((x) => total.butir.filter((no) => no !== it.no).reduce((s, no) => s + x.skor[idx(no)], 0)) : null;
    const rDim = n ? S.pearson(xs, restDim) : null; const rTot = restTot ? S.pearson(xs, restTot) : null;
    const aDel = n && others.length > 1 ? alpha(complete.map((x) => others.map((no) => x.skor[idx(no)]))) : null;
    return { ...base, r_butir_dimensi: round(rDim), r_butir_total: round(rTot), alpha_jika_dihapus: round(aDel), alpha_dimensi: reliab.find((x) => x.kode === sc.kode).alpha,
      status: rDim === null ? 'Data kurang' : rDim >= Math.max(0.3, rt || 0) ? 'Valid' : rDim >= 0.2 ? 'Perlu ditinjau' : 'Tidak valid' };
  });
  return { n, r_tabel: round(rt), kriteria: 'Butir valid bila korelasi butir dengan dimensinya (terkoreksi) ≥ 0,30 dan ≥ r tabel (α = 0,05, dua sisi). Skala andal bila α Cronbach atau koefisien Spearman-Brown ≥ 0,70.', reliabilitas: reliab, butir };
}

// ---------- deskriptif ----------
const KAT_DIM = ['Kuat', 'Rentan', 'Lemah']; const KAT_TOTAL = ['Tangguh', 'Rentan', 'Krisis'];
function freq(values, cats) { const n = values.length; return cats.map((c) => { const f = values.filter((v) => v === c).length; return { kategori: c, frekuensi: f, persen: n ? round((f / n) * 100, 1) : 0 }; }); }
function descriptive(resp) {
  const butir = ITEMS.map((it, i) => {
    const pool = resp.filter((x) => x.jawaban[i] !== null); const xs = pool.map((x) => x.skor[i]);
    return { no: it.no, dimensi: it.dimensi, arah: it.arah, indikator: it.indikator, aktif: instrument.isActive(it.no), ...S.describe(xs),
      jawaban: CODES.map((c) => { const f = pool.filter((x) => x.jawaban[i] === c).length; return { kode: c, frekuensi: f, persen: pool.length ? round((f / pool.length) * 100, 1) : 0 }; }) };
  });
  const dimScore = (x, k) => x.h.dimensi?.find((d) => d.kode === k);
  const skala = [
    ...DIMENSIONS.map((d) => { const v = resp.map((x) => dimScore(x, d.kode)).filter(Boolean); return { kode: d.kode, nama: dimName(d.kode), bagian: d.bagian, rentang: d.bagian === 2 ? '8–32' : '4–16', ...S.describe(v.map((x) => x.skor)), kategori: freq(v.map((x) => x.kategori), KAT_DIM) }; }),
    { kode: 'FONDASI', nama: '5 Kebutuhan Dasar', rentang: '20–80', ...S.describe(resp.map((x) => x.a.skor_fondasi)), kategori: freq(resp.map((x) => x.a.kategori_fondasi), KAT_DIM) },
    { kode: 'TOTAL', nama: 'Indeks Kekuatan Mental', rentang: '28–112', ...S.describe(resp.map((x) => x.a.skor_total)), kategori: freq(resp.map((x) => x.a.kategori_total), KAT_TOTAL) },
  ];
  return { n: resp.length, butir, skala };
}

// ---------- demografis ----------
const GROUPERS = {
  gender: ['Jenis kelamin', (a) => a.gender_label],
  umur: ['Kelompok umur', (a) => a.kelompok_umur],
  tingkat: ['Tingkat (tahun kuliah)', (a) => a.tingkat_label],
  jenjang: ['Jenjang', (a) => a.jenjang || 'Tidak diketahui'],
  provinsi: ['Provinsi', (a) => a.provinsi || 'Tidak diketahui'],
  universitas: ['Universitas', (a) => a.universitas || 'Tidak diketahui'],
};
const MEASURES = [['TOTAL', 'Indeks', (x) => x.a.skor_total], ['FONDASI', '5 Kebutuhan', (x) => x.a.skor_fondasi],
  ...DIMENSIONS.map((d) => [d.kode, d.kode, (x) => x.h.dimensi?.find((y) => y.kode === d.kode)?.skor ?? null])];
function demographic(resp) {
  return Object.entries(GROUPERS).map(([kode, [nama, fn]]) => {
    const m = new Map(); for (const x of resp) { const k = fn(x.a); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    const groups = [...m.entries()].sort((p, q) => q[1].length - p[1].length);
    const rows = groups.map(([label, xs]) => ({ label, n: xs.length, persen: round((xs.length / (resp.length || 1)) * 100, 1),
      ...Object.fromEntries(MEASURES.map(([k, , g]) => { const v = xs.map(g).filter((y) => y !== null); return [k, { mean: round(mean(v), 1), sd: round(Math.sqrt(variance(v)), 1) }]; })),
      tangguh: xs.filter((x) => x.a.kategori_total === 'Tangguh').length, krisis: xs.filter((x) => x.a.kategori_total === 'Krisis').length }));
    const known = groups.filter(([label]) => label !== 'Tidak diketahui');
    const uji = Object.fromEntries(MEASURES.map(([k, , g]) => [k, S.anova(known.map(([, xs]) => xs.map(g).filter((y) => y !== null)))]));
    return { kode, nama, kelompok: rows, uji };
  });
}

// ---------- Rasch ----------
const RASCH_SCALES = () => [
  { kode: 'FONDASI', nama: '5 Kebutuhan Dasar (V1–V5)', butir: ITEMS.filter((it) => it.bagian === 1 && instrument.isActive(it.no)) },
  ...DIMENSIONS.map((d) => ({ kode: d.kode, nama: `${d.kode} · ${dimName(d.kode)}`, butir: ITEMS.filter((it) => it.dimensi === d.kode && instrument.isActive(it.no)) })),
  { kode: 'TOTAL', nama: 'Indeks Kekuatan Mental (V1–V6)', butir: ITEMS.filter((it) => it.bagian < 3 && instrument.isActive(it.no)) },
];
function raschOf(resp, kode) {
  const list = RASCH_SCALES(); const sc = list.find((s) => s.kode === kode) || list[0];
  const tersedia = list.map(({ kode: k, nama }) => ({ kode: k, nama }));
  const X = matrix(resp, sc.butir.map((it) => it.no)).map((row) => row.map((v) => v - 1)); // skor 1–4 → kategori 0–3
  const res = S.rasch(X);
  if (!res || res.error) return { skala: sc.kode, nama: sc.nama, skala_tersedia: tersedia, error: res?.error || 'Data belum cukup untuk analisis Rasch.' };
  const fitLabel = (b) => (b.infit >= 0.5 && b.infit <= 1.5 && b.outfit >= 0.5 && b.outfit <= 1.5 ? 'Cocok' : b.infit > 2 || b.outfit > 2 ? 'Tidak cocok' : 'Perlu ditinjau');
  return {
    skala: sc.kode, nama: sc.nama, skala_tersedia: tersedia, ...res,
    butir: res.butir.map((b) => { const it = sc.butir[b.index]; return { ...b, no: it.no, dimensi: it.dimensi, arah: it.arah, indikator: it.indikator, kecocokan: fitLabel(b) }; }).sort((p, q) => q.measure - p.measure),
    peta_wright: res.peta_wright.map((w) => ({ ...w, butir: w.butir.map((i) => sc.butir[i].no) })),
    kriteria: 'Kecocokan butir: infit & outfit MNSQ 0,5–1,5 (produktif untuk pengukuran) dan korelasi titik-ukuran positif. Reliabilitas orang ≥ 0,80 dan separasi ≥ 2 berarti instrumen mampu membedakan tingkat kekuatan mental. Ambang kategori jawaban harus berurutan naik.',
  };
}

// ---------- Rasch lengkap (tabel ala Winsteps) ----------
const RGROUPS = { ...GROUPERS, angkatan: ['Angkatan', (a) => (a.angkatan ? String(a.angkatan) : 'Tidak diketahui')] };
function raschFull(resp, kode) {
  const list = RASCH_SCALES(); const sc = list.find((x) => x.kode === kode) || list[0];
  const tersedia = list.map(({ kode: k, nama }) => ({ kode: k, nama }));
  const nos = sc.butir.map((it) => it.no);
  const rows = resp.filter((x) => nos.every((no) => x.skor[idx(no)] !== null));
  const X = rows.map((x) => nos.map((no) => x.skor[idx(no)] - 1));
  const personGroups = Object.fromEntries(Object.entries(RGROUPS).map(([k, [nama, fn]]) => [k, { nama, of: (i) => fn(rows[i].a) }]));
  const res = RA.analyze(X, { personLabels: rows.map((x) => respCode(x.a.user_id)), itemLabels: nos.map((no) => `B${no}`), personGroups });
  if (!res || res.error) return { skala: sc.kode, nama: sc.nama, skala_tersedia: tersedia, error: res?.error || 'Data belum cukup untuk analisis Rasch.' };
  const info = Object.fromEntries(sc.butir.map((it) => [`B${it.no}`, { no: it.no, dimensi: it.dimensi, arah: it.arah, indikator: it.indikator }]));
  return { skala: sc.kode, nama: sc.nama, skala_tersedia: tersedia, butir_info: info, ...RA.rounded(res),
    kriteria: { fit: 'Butir/orang cocok bila Infit & Outfit MNSQ 0,5–1,5 (produktif untuk pengukuran); ZSTD −2 s.d. +2 dapat diterima; korelasi titik-ukuran (PTMEA) positif.', reliabilitas: 'Reliabilitas orang ≥ 0,80 dan separasi ≥ 2 menandakan instrumen mampu membedakan tingkat kekuatan mental; reliabilitas butir ≥ 0,90 dan separasi ≥ 3 menandakan hierarki butir stabil.',
      unidimensi: 'Unidimensional bila varians yang dijelaskan ukuran ≥ 40% (≥ 50% sangat baik) dan nilai eigen kontras pertama < 2,0 (atau < 3,0 untuk skala panjang).', rating: 'Skala rating berfungsi bila tiap kategori ≥ 10 observasi, rata-rata teramati & ambang Andrich naik berurutan, jarak ambang 1,4–5 logit (ideal), dan Outfit kategori < 2,0.',
      dif: 'DIF bermakna bila |kontras DIF| ≥ 0,5 logit dan p < 0,05. Klasifikasi ETS: A < 0,43 (dapat diabaikan), B 0,43–0,64 (sedang), C ≥ 0,64 (besar).' } };
}

// ---------- CFA ----------
const CFA_MODELS = {
  M6: 'Model 6 faktor berkorelasi (V1–V6)',
  M5: 'Model 5 faktor kebutuhan dasar (V1–V5)',
  M1: 'Model 1 faktor umum (pembanding)',
};
function cfaOf(resp, model = 'M6') {
  const dims = model === 'M5' ? DIMENSIONS.filter((d) => d.bagian === 1) : DIMENSIONS;
  const its = ITEMS.filter((it) => it.bagian < 3 && instrument.isActive(it.no) && dims.some((d) => d.kode === it.dimensi));
  const nos = its.map((it) => it.no);
  const X = resp.filter((x) => nos.every((no) => x.skor[idx(no)] !== null)).map((x) => nos.map((no) => x.skor[idx(no)]));
  const factorsFor = (mk) => (mk === 'M1' ? [{ kode: 'G', nama: 'Kekuatan mental (umum)', items: its.map((_, i) => i) }]
    : dims.map((d) => ({ kode: d.kode, nama: `${d.kode} · ${dimName(d.kode)}`, items: its.map((it, i) => (it.dimensi === d.kode ? i : -1)).filter((i) => i >= 0) })).filter((f) => f.items.length >= 2));
  if (X.length < nos.length + 5) return { model, nama: CFA_MODELS[model], model_tersedia: CFA_MODELS, error: `Data belum cukup untuk CFA: ${X.length} responden lengkap untuk ${nos.length} butir (disarankan ≥ 200).` };
  const res = fitCFA(X, factorsFor(model));
  if (res.error) return { model, nama: CFA_MODELS[model], model_tersedia: CFA_MODELS, error: res.error };
  const banding = Object.keys(CFA_MODELS).map((mk) => {
    if (mk === model) return { model: mk, nama: CFA_MODELS[mk], ...res.fit };
    const xs = mk === 'M5' ? null : X; // M5 memakai butir V1–V5 saja
    if (mk === 'M5' && model !== 'M5') { const sub = its.map((it, i) => (it.bagian === 1 ? i : -1)).filter((i) => i >= 0); const r2 = fitCFA(X.map((r) => sub.map((i) => r[i])), DIMENSIONS.filter((d) => d.bagian === 1).map((d) => ({ kode: d.kode, nama: d.kode, items: sub.map((i, k) => (its[i].dimensi === d.kode ? k : -1)).filter((k) => k >= 0) }))); return { model: mk, nama: CFA_MODELS[mk], ...(r2.fit || {}) }; }
    if (model === 'M5' && mk !== 'M5') return { model: mk, nama: CFA_MODELS[mk], catatan: 'Dihitung pada model 28 butir (pilih model tersebut).' };
    const r2 = fitCFA(xs, factorsFor(mk)); return { model: mk, nama: CFA_MODELS[mk], ...(r2.fit || {}) };
  });
  const lab = (i) => `B${its[i].no}`;
  return RA.rounded({
    model, nama: CFA_MODELS[model], model_tersedia: CFA_MODELS, estimator: 'Maximum Likelihood (matriks kovarians Pearson skor butir 1–4)',
    n: res.n, butir: res.butir, faktor: res.faktor, parameter: res.parameter, konvergen: res.konvergen, iterasi: res.iterasi,
    fit: res.fit, penilaian_fit: fitVerdict(res.fit), perbandingan: banding,
    muatan: res.muatan.map((m) => ({ ...m, label: lab(m.item), no: its[m.item].no, indikator: its[m.item].indikator, status: m.std >= 0.7 ? 'Kuat' : m.std >= 0.5 ? 'Memadai' : m.std >= 0.4 ? 'Lemah' : 'Perlu ditinjau' })),
    korelasi: res.korelasi, per_faktor: res.per_faktor.map((f) => ({ ...f, akar_ave: Math.sqrt(f.ave) })), htmt: res.htmt,
    residu_terbesar: res.residu_terbesar.map((r) => ({ a: lab(r.a), b: lab(r.b), r: r.r })),
    kriteria: 'Kecocokan model: CFI & TLI ≥ 0,90 (≥ 0,95 baik), RMSEA ≤ 0,08 (≤ 0,06 baik), SRMR ≤ 0,08, χ²/df ≤ 3. Muatan faktor baku ≥ 0,50 (ideal ≥ 0,70). Reliabilitas komposit (CR) ≥ 0,70; AVE ≥ 0,50 (validitas konvergen). Validitas diskriminan: √AVE > korelasi antarfaktor (Fornell-Larcker) dan HTMT < 0,85 (atau < 0,90).',
  }, 3);
}

// ---------- laporan unduhan ----------
const pct = (v) => (v === null || v === undefined ? null : Math.round(v * 10) / 10);
function reportOf(jenis, f, q, user) {
  const label = cohort.filterLabel(f);
  const info = [`Diunduh: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB oleh ${user.nama}`, `Filter data: ${label} · ${f.mode === 'semua' ? 'semua pengisian' : 'asesmen terbaru tiap mahasiswa'}`, 'Instrumen: IKDKM-M (Inventori Kebutuhan Dukungan Kekuatan Mental Mahasiswa). Identitas responden disamarkan (kode R-…).'];
  if (jenis === 'butir') {
    const v = instrument.view();
    return { judul: 'Butir & Interpretasi IKDKM-M', info: info.slice(0, 1).concat(info[2]), bagian: [
      { judul: 'Butir asesmen', catatan: 'Arah + = pernyataan positif (SS=4 … STS=1); − = negatif (dibalik).', kolom: ['No', 'Bagian', 'Dimensi', 'Arah', 'Indikator', 'Pernyataan', 'Aktif', 'Redaksi diubah', 'Pernyataan bawaan'], baris: v.butir.map((b) => [b.no, b.bagian, b.dimensi, b.arah, b.indikator, b.teks, b.aktif ? 'ya' : 'tidak', b.diubah ? 'ya' : '', b.diubah ? b.bawaan.teks : '']) },
      ...Object.entries(v.norms).map(([k, n]) => ({ judul: `Norma ${k}`, sheet: `Norma ${k}`, kolom: ['Kategori', 'Skor mulai', 'Keterangan', ...(k === 'total' ? ['Dukungan'] : [])], baris: n.batas.map((b) => [b[1], b[0], b[2], ...(k === 'total' ? [b[3]] : [])]) })),
      { judul: 'Ambang melemah per dimensi', kolom: ['Dimensi', 'Ambang (≤)'], baris: Object.entries(v.ambang).map(([k, a]) => [k, a]) },
      { judul: 'Kalimat interpretasi', kolom: ['Dimensi', 'Kuat', 'Mulai melemah', 'Sedang lemah', 'Saran bila kuat', 'Saran bila lemah'], baris: Object.entries(v.makna).map(([k, m]) => [k, m.Kuat, m.Rentan, m.Lemah, m.coba_kuat, m.coba_lemah]) },
      { judul: 'Riwayat perubahan instrumen', kolom: ['Waktu', 'Oleh', 'Perubahan'], baris: v.riwayat.map((h) => [h.pada, h.oleh, h.perubahan]) },
    ] };
  }
  const resp = loadResponses(f);
  if (jenis === 'deskriptif') {
    const d = descriptive(resp);
    return { judul: 'Analisis Deskriptif IKDKM-M', info: [...info, `n = ${d.n} respons`], bagian: [
      { judul: 'Statistik skala', kolom: ['Skala', 'Rentang', 'n', 'Mean', 'Median', 'Modus', 'SD', 'Min', 'Maks', 'Frekuensi kategori'], baris: d.skala.map((x) => [x.nama, x.rentang, x.n, x.mean, x.median, (x.modus || []).join(' / '), x.sd, x.min, x.max, x.kategori.map((c) => `${c.kategori}: ${c.frekuensi} (${c.persen}%)`).join('; ')]) },
      { judul: 'Statistik butir', catatan: 'Skor 1–4 (negatif sudah dibalik); f/% = frekuensi & persentase jawaban.', kolom: ['Butir', 'Dimensi', 'Indikator', 'Aktif', 'n', ...CODES.flatMap((c) => [`f ${c}`, `% ${c}`]), 'Mean', 'Median', 'Modus', 'SD'], baris: d.butir.map((b) => [b.no, b.dimensi, b.indikator, b.aktif ? 'ya' : 'tidak', b.n, ...b.jawaban.flatMap((j) => [j.frekuensi, j.persen]), b.mean, b.median, (b.modus || []).join('/'), b.sd]) },
    ] };
  }
  if (jenis === 'validitas') {
    const an = analyze(resp);
    return { judul: 'Validitas & Reliabilitas IKDKM-M', info: [...info, `n lengkap = ${an.n}; r tabel = ${an.r_tabel}`, an.kriteria], bagian: [
      { judul: 'Reliabilitas', kolom: ['Skala', 'Butir', 'n', "Cronbach's α", 'r belahan', 'Spearman-Brown', 'Kategori'], baris: an.reliabilitas.map((x) => [x.nama, x.jumlah_butir, x.n, x.alpha, x.r_belahan, x.spearman_brown, x.kategori]) },
      { judul: 'Validitas butir', kolom: ['Butir', 'Dimensi', 'Arah', 'Pernyataan', 'Rerata', 'SD', 'r butir-dimensi', 'r butir-total', 'α jika dihapus', 'α dimensi', 'Status'], baris: an.butir.map((b) => [b.no, b.dimensi, b.arah, b.teks, b.rerata, b.sd, b.r_butir_dimensi, b.r_butir_total, b.alpha_jika_dihapus, b.alpha_dimensi, b.status]) },
    ] };
  }
  if (jenis === 'demografis') {
    const an = demographic(resp); const cols = MEASURES.map(([k, l]) => [k, l]);
    return { judul: 'Analisis Demografis IKDKM-M', info: [...info, `n = ${resp.length}`, 'Rerata (SD) per kelompok dan uji ANOVA satu arah (kelompok "Tidak diketahui" tidak diikutkan).'], bagian: an.map((a) => ({ judul: a.nama,
      kolom: ['Kelompok', 'n', '%', ...cols.flatMap(([, l]) => [`${l} mean`, `${l} SD`]), 'Tangguh', 'Krisis'],
      baris: [...a.kelompok.map((g) => [g.label, g.n, g.persen, ...cols.flatMap(([k]) => [g[k].mean, g[k].sd]), g.tangguh, g.krisis]),
        ['ANOVA: F', null, null, ...cols.flatMap(([k]) => [a.uji[k].F, null]), null, null], ['ANOVA: p', null, null, ...cols.flatMap(([k]) => [a.uji[k].p, null]), null, null], ['ANOVA: η²', null, null, ...cols.flatMap(([k]) => [a.uji[k].eta2, null]), null, null]] })) };
  }
  if (jenis === 'rasch') {
    const d = raschFull(resp, str(q.skala, 10) || 'FONDASI');
    if (d.error) return { judul: `Analisis Rasch — ${d.nama}`, info: [...info, d.error], bagian: [] };
    const pr = (r) => [r.label, r.skor, r.jumlah, r.ukuran, r.se, r.infit, r.infit_z, r.outfit, r.outfit_z, r.ptmea, r.ptmea_exp, pct(r.obs_match), pct(r.exp_match)];
    const prCols = ['Skor', 'Jumlah', 'Ukuran', 'Model S.E.', 'Infit MNSQ', 'Infit ZSTD', 'Outfit MNSQ', 'Outfit ZSTD', 'PTMEA Korr.', 'PTMEA Harapan', 'Exact match Obs%', 'Exact match Exp%'];
    const ind = (l) => d.butir_info[l]?.indikator || '';
    const sumRows = (o) => [['Rata-rata', ...['skor', 'jumlah', 'ukuran', 'se', 'infit', 'infit_z', 'outfit', 'outfit_z'].map((k) => o.stat[k].mean)], ['S.E. rerata', ...['skor', 'jumlah', 'ukuran', 'se', 'infit', 'infit_z', 'outfit', 'outfit_z'].map((k) => o.stat[k].sem)], ['P.SD', ...['skor', 'jumlah', 'ukuran', 'se', 'infit', 'infit_z', 'outfit', 'outfit_z'].map((k) => o.stat[k].psd)], ['S.SD', ...['skor', 'jumlah', 'ukuran', 'se', 'infit', 'infit_z', 'outfit', 'outfit_z'].map((k) => o.stat[k].ssd)], ['Maks', ...['skor', 'jumlah', 'ukuran', 'se', 'infit', 'infit_z', 'outfit', 'outfit_z'].map((k) => o.stat[k].max)], ['Min', ...['skor', 'jumlah', 'ukuran', 'se', 'infit', 'infit_z', 'outfit', 'outfit_z'].map((k) => o.stat[k].min)]];
    const sepRows = (o) => [['REAL', o.real.rmse, o.real.true_sd, o.real.separasi, o.real.reliabilitas], ['MODEL', o.model.rmse, o.model.true_sd, o.model.separasi, o.model.reliabilitas]];
    const t3 = d.tabel3_1; const sumCols = ['Statistik', 'Skor total', 'Jumlah', 'Ukuran', 'Model S.E.', 'Infit MNSQ', 'Infit ZSTD', 'Outfit MNSQ', 'Outfit ZSTD'];
    const bag = [
      { judul: 'TABEL 3.1 Ringkasan Statistik — Orang', sheet: 'T3.1 Orang', catatan: [`${t3.orang.n} orang terukur (tidak ekstrem); ${t3.orang.ekstrem} ekstrem. Cronbach α (KR-20) skor mentah orang = ${t3.orang.alpha}. Korelasi skor mentah–ukuran = ${t3.orang.korelasi_skor_ukuran}.`], kolom: sumCols, baris: sumRows(t3.orang) },
      { judul: 'TABEL 3.1 Separasi & Reliabilitas — Orang', sheet: 'T3.1 Orang rel', kolom: ['Jenis', 'RMSE', 'True SD', 'Separasi', 'Reliabilitas'], baris: sepRows(t3.orang) },
      { judul: 'TABEL 3.1 Ringkasan Statistik — Butir', sheet: 'T3.1 Butir', catatan: [`${t3.butir.n} butir terukur; ${t3.butir.ekstrem} ekstrem.`], kolom: sumCols, baris: sumRows(t3.butir) },
      { judul: 'TABEL 3.1 Separasi & Reliabilitas — Butir', sheet: 'T3.1 Butir rel', kolom: ['Jenis', 'RMSE', 'True SD', 'Separasi', 'Reliabilitas'], baris: sepRows(t3.butir) },
      { judul: 'TABEL 3.2 Diagnosis Skala Rating', sheet: 'T3.2 Skala rating', catatan: [d.kriteria.rating, `Ambang Andrich berurutan: ${d.ambang_berurutan ? 'ya' : 'tidak'}; rata-rata teramati berurutan: ${d.rata_berurutan ? 'ya' : 'tidak'}.`], kolom: ['Kategori (skor)', 'Jumlah obs.', '%', 'Rata-rata teramati', 'Rata-rata harapan', 'Infit MNSQ', 'Outfit MNSQ', 'Ambang Andrich', 'S.E. ambang', 'Ukuran kategori'], baris: d.tabel3_2.map((c) => [c.skor, c.jumlah, c.persen, c.rata_teramati, c.rata_harapan, c.infit, c.outfit, c.ambang, c.ambang_se, c.ukuran_kategori]) },
      { judul: 'TABEL 6.1 Urutan Kecocokan Orang (Person Fit Order)', sheet: 'T6.1 Person fit', catatan: d.kriteria.fit, kolom: ['Kode', ...prCols, 'Kecocokan'], baris: d.tabel6_1.map((r) => [...pr(r), r.kecocokan]) },
      { judul: 'TABEL 10.1 Urutan Misfit Butir', sheet: 'T10.1 Misfit butir', catatan: d.kriteria.fit, kolom: ['Butir', 'Indikator', ...prCols, 'Kecocokan'], baris: d.tabel10_1.map((r) => [r.label, ind(r.label), ...pr(r).slice(1), r.kecocokan]) },
      { judul: 'TABEL 12.2 Peta Wright Butir (Item Map)', sheet: 'T12.2 Peta Wright', catatan: `M = rata-rata, S = 1 SD, T = 2 SD. Orang: rata-rata ${d.tabel12_2.orang.mean}, SD ${d.tabel12_2.orang.sd}; butir: rata-rata ${d.tabel12_2.butir.mean}, SD ${d.tabel12_2.butir.sd}.`, pre: d.tabel12_2.teks },
      { judul: 'TABEL 12.2 Peta Wright — data per pita logit', sheet: 'T12.2 Pita', kolom: ['Batas atas (logit)', 'Jumlah orang', 'Tanda orang', 'Tanda butir', 'Butir'], baris: d.tabel12_2.pita.map((b) => [b.batas, b.orang, b.tanda_orang, b.tanda_butir, b.butir.join(' ')]) },
      { judul: 'TABEL 13.1 Ukuran Butir (Item Measure Order)', sheet: 'T13.1 Ukuran butir', kolom: ['Butir', 'Indikator', ...prCols, 'Kecocokan'], baris: d.tabel13_1.map((r) => [r.label, ind(r.label), ...pr(r).slice(1), r.kecocokan]) },
      { judul: 'TABEL 17.1 Ukuran Orang (Person Measure Order)', sheet: 'T17.1 Ukuran orang', kolom: ['Kode', ...prCols, 'Kecocokan', 'Ekstrem'], baris: d.tabel17_1.map((r) => [...pr(r), r.kecocokan, r.ekstrem || '']) },
      { judul: 'TABEL 23.0 Dimensionalitas (PCA residu terstandar)', sheet: 'T23.0 Unidimensi', catatan: [d.kriteria.unidimensi, `Varians dijelaskan bila data cocok sempurna dengan model: ${d.tabel23.model_dijelaskan_persen}%.`], kolom: ['Komponen varians', 'Nilai eigen', '% total', '% tak dijelaskan'],
        baris: [['Total varians mentah observasi', d.tabel23.total.eigen, 100, null], ['Varians dijelaskan ukuran', d.tabel23.dijelaskan.eigen, d.tabel23.dijelaskan.persen, null], ['  · dijelaskan orang', d.tabel23.dijelaskan_orang.eigen, d.tabel23.dijelaskan_orang.persen, null], ['  · dijelaskan butir', d.tabel23.dijelaskan_butir.eigen, d.tabel23.dijelaskan_butir.persen, null], ['Varians tak dijelaskan', d.tabel23.tak_dijelaskan.eigen, d.tabel23.tak_dijelaskan.persen, 100], ...d.tabel23.kontras.map((k) => [`  Kontras ke-${k.ke}`, k.eigen, k.persen_total, k.persen_tak_dijelaskan])] },
      { judul: 'TABEL 23.2 Muatan butir pada kontras pertama', sheet: 'T23.2 Muatan kontras', kolom: ['Butir', 'Indikator', 'Muatan', 'Ukuran', 'Infit', 'Outfit'], baris: d.tabel23.muatan_kontras1.map((m) => [m.label, ind(m.label), m.muatan, m.ukuran, m.infit, m.outfit]) },
      ...d.tabel28.flatMap((g) => [
        { judul: `TABEL 28.1 Subtotal Orang — ${g.nama}`, sheet: `T28.1 ${g.nama}`, kolom: ['Kelompok', 'n', 'Rata-rata ukuran', 'S.E. rerata', 'P.SD', 'Median', 'Min', 'Maks', 'Separasi', 'Reliabilitas'], baris: g.kelompok.map((k) => [k.label, k.n, k.mean, k.se_mean, k.psd, k.median, k.min, k.max, k.separasi, k.reliabilitas]) },
        ...(g.perbandingan.length ? [{ judul: `TABEL 28.1 Uji beda antarkelompok (Welch) — ${g.nama}`, sheet: `T28.1 uji ${g.nama}`, kolom: ['Kelompok A', 'Kelompok B', 'Selisih (A−B)', 'S.E. gabungan', 't', 'df', 'p'], baris: g.perbandingan.map((x) => [x.a, x.b, x.kontras, x.se, x.t, x.df, x.p]) }] : []),
      ]),
      ...d.tabel30.flatMap((g) => [
        { judul: `TABEL 30.1 DIF Butir — ${g.nama}`, sheet: `T30.1 ${g.nama}`, catatan: d.kriteria.dif, kolom: ['Butir', 'Kelompok A', 'Ukuran DIF A', 'S.E. A', 'Kelompok B', 'Ukuran DIF B', 'S.E. B', 'Kontras DIF (A−B)', 'S.E. gabungan', 't', 'df', 'p', 'Kategori ETS', 'Bermakna'], baris: g.kontras.map((x) => [x.butir, x.a, x.ukuran_a, x.se_a, x.b, x.ukuran_b, x.se_b, x.kontras, x.se, x.t, x.df, x.p, x.kategori, x.bermakna ? 'ya' : '']) },
      ]),
    ];
    return { judul: `Analisis Rasch — ${d.nama}`, info: [...info, `Model Rasch Rating Scale (Andrich), estimasi JMLE · ${d.n_orang} orang terukur (+${d.orang_ekstrem} ekstrem), ${d.n_butir} butir · ${d.iterasi} iterasi${d.konvergen ? '' : ' (belum konvergen)'}.`, 'Kategori 0–3 = skor butir 1–4 setelah pernyataan negatif dibalik. Ukuran butir positif = lebih sulit disetujui.', d.kriteria.reliabilitas], bagian: bag };
  }
  if (jenis === 'cfa') {
    const d = cfaOf(resp, str(q.model, 4) || 'M6');
    if (d.error) return { judul: `CFA — ${d.nama}`, info: [...info, d.error], bagian: [] };
    const F = d.fit;
    return { judul: `Analisis Faktor Konfirmatori (CFA) — ${d.nama}`, info: [...info, `Estimator: ${d.estimator}. n = ${d.n}; ${d.butir} butir; ${d.faktor} faktor; ${d.parameter} parameter bebas; ${d.konvergen ? 'konvergen' : 'belum konvergen'}.`, d.kriteria], bagian: [
      { judul: 'Indeks kecocokan model', kolom: ['Indeks', 'Nilai'], baris: [['χ²', F.chi2], ['df', F.df], ['p', F.p], ['χ²/df', F.chi2_df], ['CFI', F.cfi], ['TLI', F.tli], ['RMSEA', F.rmsea], ['RMSEA 90% CI bawah', F.rmsea_lo], ['RMSEA 90% CI atas', F.rmsea_hi], ['p-close (RMSEA ≤ 0,05)', F.p_close], ['SRMR', F.srmr], ['AIC', F.aic], ['BIC', F.bic], ['χ² model dasar (baseline)', F.chi2_baseline], ['df baseline', F.df_baseline]] },
      { judul: 'Penilaian kecocokan', kolom: ['Indeks', 'Nilai', 'Status'], baris: d.penilaian_fit.map((x) => [x.indeks, x.nilai, x.status]) },
      { judul: 'Perbandingan model', kolom: ['Model', 'χ²', 'df', 'CFI', 'TLI', 'RMSEA', 'SRMR', 'AIC', 'BIC', 'Catatan'], baris: d.perbandingan.map((m) => [m.nama, m.chi2, m.df, m.cfi, m.tli, m.rmsea, m.srmr, m.aic, m.bic, m.catatan || '']) },
      { judul: 'Muatan faktor', kolom: ['Butir', 'Faktor', 'Indikator', 'λ (tak baku)', 'S.E.', 'z', 'p', 'λ baku', 'R²', 'Varians galat', 'Status'], baris: d.muatan.map((m) => [m.label, m.faktor, m.indikator, m.lambda, m.se, m.z, m.p, m.std, m.r2, m.galat, m.status]) },
      ...(d.korelasi.length ? [{ judul: 'Korelasi antarfaktor', kolom: ['Faktor A', 'Faktor B', 'r', 'S.E.', 'z', 'p'], baris: d.korelasi.map((k) => [k.a, k.b, k.r, k.se, k.z, k.p]) }] : []),
      { judul: 'Reliabilitas komposit & validitas konvergen', kolom: ['Faktor', 'Nama', 'Butir', 'CR', 'AVE', '√AVE', 'Muatan min', 'Muatan maks'], baris: d.per_faktor.map((f) => [f.kode, f.nama, f.butir, f.cr, f.ave, f.akar_ave, f.muatan_min, f.muatan_maks]) },
      ...(d.htmt.length ? [{ judul: 'Validitas diskriminan (HTMT)', kolom: ['Faktor A', 'Faktor B', 'HTMT', 'Status'], baris: d.htmt.map((h) => [h.a, h.b, h.htmt, h.htmt < 0.85 ? 'Baik (< 0,85)' : h.htmt < 0.9 ? 'Dapat diterima (< 0,90)' : 'Perlu ditinjau']) }] : []),
      { judul: 'Korelasi residu terbesar', catatan: 'Residu |r| > 0,10 menunjukkan pasangan butir yang hubungannya belum dijelaskan model.', kolom: ['Butir A', 'Butir B', 'Residu korelasi'], baris: d.residu_terbesar.map((r) => [r.a, r.b, r.r]) },
    ] };
  }
  return null;
}

// ---------- rute ----------
const parse = (req) => cohort.filtersOf(req.query);
r.get('/admin/cohort/options', admin, (req, res) => res.json(cohort.filterOptions(parse(req))));

r.get('/admin/psikometri/instrumen', admin, (_req, res) => res.json(instrument.view()));
r.put('/admin/psikometri/butir/:no', admin, (req, res) => {
  const out = instrument.setItemActive(req.params.no, !!req.body?.aktif, req.user);
  if (out.error) fail(400, out.error);
  audit({ actor: req.user, aksi: req.body?.aktif ? 'butir_diaktifkan' : 'butir_dinonaktifkan', entitas: 'instrumen', alasan: `butir ${req.params.no}`, ip: req.ip });
  res.json(instrument.view());
});
r.put('/admin/psikometri/butir/:no/teks', admin, (req, res) => {
  const out = instrument.setItemText(req.params.no, { indikator: req.body?.indikator, teks: req.body?.teks }, req.user);
  if (out.error) fail(400, out.error);
  if (out.berubah) audit({ actor: req.user, aksi: 'redaksi_butir_diubah', entitas: 'instrumen', alasan: `butir ${req.params.no}: "${out.sebelum.teks}" → "${out.sesudah.teks}"`.slice(0, 900), ip: req.ip });
  res.json(instrument.view());
});
r.put('/admin/psikometri/interpretasi', admin, (req, res) => {
  const out = instrument.saveInterpretation(req.body || {}, req.user);
  if (out.error) fail(400, out.error);
  audit({ actor: req.user, aksi: 'interpretasi_diubah', entitas: 'instrumen', alasan: Object.keys(req.body || {}).join(', '), ip: req.ip });
  res.json(instrument.view());
});

r.get('/admin/psikometri/deskriptif', admin, (req, res) => { const f = parse(req); res.json({ filter: f, label: cohort.filterLabel(f), ...descriptive(loadResponses(f)) }); });
r.get('/admin/psikometri/validitas', admin, (req, res) => { const f = parse(req); res.json({ filter: f, label: cohort.filterLabel(f), ...analyze(loadResponses(f)) }); });
r.get('/admin/psikometri/demografis', admin, (req, res) => { const f = parse(req); const resp = loadResponses(f); res.json({ filter: f, label: cohort.filterLabel(f), n: resp.length, analisis: demographic(resp) }); });
r.get('/admin/psikometri/rasch', admin, (req, res) => { const f = parse(req); res.json({ filter: f, label: cohort.filterLabel(f), ...raschOf(loadResponses(f), str(req.query.skala, 10) || 'FONDASI') }); });
r.get('/admin/psikometri/rasch-lengkap', admin, (req, res) => { const f = parse(req); res.json({ filter: f, label: cohort.filterLabel(f), ...raschFull(loadResponses(f), str(req.query.skala, 10) || 'FONDASI') }); });
r.get('/admin/psikometri/cfa', admin, (req, res) => { const f = parse(req); res.json({ filter: f, label: cohort.filterLabel(f), ...cfaOf(loadResponses(f), str(req.query.model, 4) || 'M6') }); });
r.get('/admin/psikometri/unduh/:jenis', admin, async (req, res) => {
  const jenis = req.params.jenis; const format = req.query.format === 'docx' ? 'docx' : 'xlsx';
  if (!['butir', 'deskriptif', 'validitas', 'demografis', 'rasch', 'cfa'].includes(jenis)) fail(404, 'Jenis analisis tidak dikenal.');
  const f = parse(req); const rep = reportOf(jenis, f, req.query, req.user);
  audit({ actor: req.user, aksi: 'unduh_analisis_psikometri', entitas: 'instrumen', alasan: `${jenis} (${format}) · ${cohort.filterLabel(f)}`, ip: req.ip });
  const buf = format === 'docx' ? await REP.toDocx(rep) : await REP.toXlsx(rep);
  res.setHeader('Content-Type', format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="psikometri-${jenis}${req.query.skala ? '-' + str(req.query.skala, 10) : ''}${req.query.model ? '-' + str(req.query.model, 4) : ''}-${new Date().toISOString().slice(0, 10)}.${format}"`);
  res.send(Buffer.from(buf));
});

r.get('/admin/assessments/respondents', admin, (req, res) => {
  const resp = cohort.loadRows(parse(req), { withHasil: false });
  const q = str(req.query.q, 20).toUpperCase();
  const rows = resp.map((a) => ({ id: a.id, kode: respCode(a.user_id), universitas: a.universitas, provinsi: a.provinsi, fakultas: a.fakultas, prodi: a.nama_prodi, angkatan: a.angkatan, gender: a.gender, umur: a.umur, tingkat: a.tingkat_label, diisi_pada: a.diisi_pada,
    skor_total: a.skor_total, kategori_total: a.kategori_total, skor_fondasi: a.skor_fondasi, skor_otot: a.skor_otot }))
    .filter((x) => !q || x.kode.includes(q)).reverse();
  res.json({ total: rows.length, items: rows.slice(0, 500) });
});
r.get('/admin/assessments/respondents/:id', admin, (req, res) => {
  const a = get(`SELECT a.*, u.university_id, u.angkatan, u.gender, pr.nama_prodi, pr.fakultas, un.nama AS universitas FROM assessments a JOIN users u ON u.id = a.user_id
    LEFT JOIN prodi pr ON pr.id = u.prodi_id LEFT JOIN universities un ON un.id = u.university_id WHERE a.id = ?`, req.params.id);
  if (!a) fail(404, 'Data asesmen tidak ditemukan.');
  const raw = decodeAnswers(a).A || {};
  audit({ actor: req.user, aksi: 'baca_butir_asesmen', entitas: 'assessments', entitas_id: a.id, alasan: 'uji kelayakan instrumen', ip: req.ip });
  const h = JSON.parse(a.hasil_json);
  res.json({ kode: respCode(a.user_id), universitas: a.universitas, fakultas: a.fakultas, prodi: a.nama_prodi, angkatan: a.angkatan, gender: a.gender, diisi_pada: a.diisi_pada,
    skor_total: a.skor_total, kategori_total: a.kategori_total, skor_fondasi: a.skor_fondasi, skor_otot: a.skor_otot,
    dimensi: h.dimensi.map((d) => ({ kode: d.kode, skor: d.skor, kategori: d.kategori })),
    butir: ITEMS.map((it) => { const j = raw[it.no] ?? raw[String(it.no)] ?? null; return { no: it.no, dimensi: it.dimensi, arah: it.arah, teks: it.teks, jawaban: j, skor: itemScore(it, j) }; }) });
});

r.get('/admin/assessments/export', admin, async (req, res) => {
  const f = parse(req); const resp = loadResponses(f); const an = analyze(resp); const de = descriptive(resp);
  audit({ actor: req.user, aksi: 'ekspor_data_butir_asesmen', entitas: 'assessments', alasan: `${resp.length} respons · ${cohort.filterLabel(f)}`, ip: req.ip });
  const wb = new ExcelJS.Workbook(); wb.creator = 'PAN-JALU';
  const bold = (ws) => { ws.getRow(1).font = { bold: true }; };
  const info = wb.addWorksheet('Keterangan');
  info.addRows([['Data butir IKDKM-M — PAN-JALU'], [`Diunduh: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB oleh ${req.user.nama}`], [`Filter: ${cohort.filterLabel(f)} · ${f.mode === 'semua' ? 'semua pengisian' : 'asesmen terbaru tiap mahasiswa'}`],
    [`Jumlah respons: ${resp.length}`], [`Butir nonaktif saat ini: ${instrument.disabledItems().join(', ') || 'tidak ada'}`], [],
    ['Skor butir: pernyataan positif SS=4, S=3, TS=2, STS=1; pernyataan negatif dibalik (SS=1 … STS=4). Kolom B1–B32 berisi skor; kolom J1–J32 berisi jawaban mentah (kosong = butir tidak ditanyakan).'],
    ['Identitas responden disamarkan (kode R-…). Kode tetap sama untuk mahasiswa yang sama sehingga data tes-ulang dapat dipasangkan.'], [an.kriteria]]);
  info.getRow(1).font = { bold: true, size: 14 }; info.getColumn(1).width = 120;
  const d = wb.addWorksheet('Data Butir');
  d.columns = [{ header: 'Kode', key: 'kode', width: 12 }, { header: 'Provinsi', key: 'provinsi', width: 20 }, { header: 'Kota', key: 'kota', width: 20 }, { header: 'Universitas', key: 'universitas', width: 34 }, { header: 'Fakultas', key: 'fakultas', width: 26 }, { header: 'Prodi', key: 'prodi', width: 28 }, { header: 'Jenjang', key: 'jenjang', width: 8 },
    { header: 'Angkatan', key: 'angkatan', width: 9 }, { header: 'Tingkat', key: 'tingkat', width: 9 }, { header: 'Gender', key: 'gender', width: 8 }, { header: 'Umur', key: 'umur', width: 6 }, { header: 'Tanggal', key: 'tanggal', width: 20 },
    ...ITEMS.map((it) => ({ header: `B${it.no}`, key: `B${it.no}`, width: 5 })), { header: '5 Kebutuhan Dasar', key: 'fondasi', width: 9 }, { header: 'Kendali Diri', key: 'otot', width: 7 }, { header: 'Indeks', key: 'indeks', width: 8 }, { header: 'Kategori', key: 'kategori', width: 10 },
    ...ITEMS.map((it) => ({ header: `J${it.no}`, key: `J${it.no}`, width: 5 }))];
  d.addRows(resp.map(({ a, skor, jawaban }) => ({ kode: respCode(a.user_id), provinsi: a.provinsi, kota: a.kota, universitas: a.universitas, fakultas: a.fakultas, prodi: a.nama_prodi, jenjang: a.jenjang, angkatan: a.angkatan, tingkat: a.tingkat, gender: a.gender, umur: a.umur, tanggal: a.diisi_pada,
    ...Object.fromEntries(ITEMS.map((it, i) => [`B${it.no}`, skor[i]])), fondasi: a.skor_fondasi, otot: a.skor_otot, indeks: a.skor_total, kategori: a.kategori_total,
    ...Object.fromEntries(ITEMS.map((it, i) => [`J${it.no}`, jawaban[i]])) })));
  bold(d); d.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  const ds = wb.addWorksheet('Deskriptif Butir');
  ds.columns = [{ header: 'Butir', key: 'no', width: 6 }, { header: 'Dimensi', key: 'dimensi', width: 8 }, { header: 'Aktif', key: 'aktif', width: 6 }, { header: 'n', key: 'n', width: 6 }, { header: 'Mean', key: 'mean', width: 7 }, { header: 'Median', key: 'median', width: 7 }, { header: 'Modus', key: 'modus', width: 7 }, { header: 'SD', key: 'sd', width: 7 },
    ...CODES.flatMap((c) => [{ header: `f ${c}`, key: `f_${c}`, width: 6 }, { header: `% ${c}`, key: `p_${c}`, width: 7 }])];
  ds.addRows(de.butir.map((b) => ({ ...b, aktif: b.aktif ? 'ya' : 'tidak', modus: b.modus.join('/'), ...Object.fromEntries(b.jawaban.flatMap((j) => [[`f_${j.kode}`, j.frekuensi], [`p_${j.kode}`, j.persen]])) }))); bold(ds);
  const s = wb.addWorksheet('Validitas Butir');
  s.columns = [{ header: 'Butir', key: 'no', width: 6 }, { header: 'Dimensi', key: 'dimensi', width: 8 }, { header: 'Arah', key: 'arah', width: 6 }, { header: 'Pernyataan', key: 'teks', width: 60 },
    { header: 'Rerata', key: 'rerata', width: 8 }, { header: 'SD', key: 'sd', width: 7 }, { header: 'r butir-dimensi (terkoreksi)', key: 'r_butir_dimensi', width: 14 }, { header: 'r butir-total (terkoreksi)', key: 'r_butir_total', width: 14 }, { header: 'α dimensi', key: 'alpha_dimensi', width: 10 }, { header: 'α jika butir dihapus', key: 'alpha_jika_dihapus', width: 12 }, { header: 'Status', key: 'status', width: 14 }];
  s.addRows(an.butir); s.addRow([]); s.addRow([`r tabel (n = ${an.n}, α = 0,05 dua sisi)`, an.r_tabel]); bold(s);
  const rel = wb.addWorksheet('Reliabilitas');
  rel.columns = [{ header: 'Skala', key: 'nama', width: 46 }, { header: 'Jumlah butir', key: 'jumlah_butir', width: 12 }, { header: 'n', key: 'n', width: 8 }, { header: "Cronbach's α", key: 'alpha', width: 12 }, { header: 'Kategori', key: 'kategori', width: 22 }, { header: 'r belahan ganjil-genap', key: 'r_belahan', width: 14 }, { header: 'Spearman-Brown', key: 'spearman_brown', width: 14 }];
  rel.addRows(an.reliabilitas); bold(rel);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="data-butir-ikdkm-${new Date().toISOString().slice(0, 10)}.xlsx"`);
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});

module.exports = r;
module.exports.analyze = analyze; // untuk pengujian
module.exports.alpha = alpha;
module.exports.rTable = rTable;
