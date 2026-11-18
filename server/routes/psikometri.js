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
