// Penskoran IKDKM-M (BAB VI naskah instrumen). Hanya dijalankan di server; deterministik, tanpa AI.
const { DIMENSIONS, SUBCOMPONENTS, SUPPORT, ITEMS, SCALE, NORMS, WEAKNESS, QUADRANTS } = require('./reference');

const CODES = SCALE.map(([c]) => c);
const FAV = { SS: 4, S: 3, TS: 2, STS: 1 };
const UNFAV = { SS: 1, S: 2, TS: 3, STS: 4 };
// 6.1 Pembobotan: favorable SS=4…STS=1; unfavorable dibalik SS=1…STS=4
const itemScore = (it, ans) => (ans ? (it.arah === '+' ? FAV : UNFAV)[ans] : null);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const r2 = (x) => Math.round(x * 100) / 100;
// Butir yang dinonaktifkan admin tidak ditanyakan; skor dimensinya disetarakan (prorata) dari butir aktif agar rentang & norma tetap sama
const instrument = () => require('./instrument');
const prorate = (items, s) => { const v = items.map(s).filter((x) => x !== null); return v.length ? Math.round((sum(v) * items.length) / v.length) : 0; };

// 6.2 Norma: kategori dari batas bawah tiap rentang
function categoryOf(norm, skor) {
  if (skor === null || skor === undefined) return null;
  const row = NORMS[norm].batas.find(([min]) => skor >= min);
  return row ? row[1] : null;
}
const categoryRow = (norm, kategori) => NORMS[norm].batas.find((b) => b[1] === kategori);

function normalize(raw) {
  const A = {};
  const off = instrument().disabledItems();
  for (const it of ITEMS) { const v = raw?.A?.[it.no] ?? raw?.A?.[String(it.no)]; A[it.no] = !off.includes(it.no) && CODES.includes(v) ? v : null; }
  const c = raw?.persetujuan || {};
  return { A, persetujuan: { a: c.a === true, b: c.b === true, c: c.c === true } };
}

function validateAnswers(raw) {
  const n = normalize(raw);
  const missing = instrument().activeItems().filter((it) => !n.A[it.no]).map((it) => it.no);
  if (missing.length) return { error: `Lengkapi jawaban untuk butir: ${missing.join(', ')}.` };
  if (!n.persetujuan.a) return { error: 'Centang pernyataan bahwa kamu telah membaca penjelasan penggunaan data.' };
  return { data: n };
}

const isAgree = (a) => a === 'SS' || a === 'S';

function scoreAssessment(raw) {
  const { A } = normalize(raw);
  const s = (it) => itemScore(it, A[it.no]);
  const dimensi = DIMENSIONS.map((d) => {
    const items = ITEMS.filter((it) => it.dimensi === d.kode);
    const skor = prorate(items, s);
    const norm = d.bagian === 2 ? 'otot' : 'dimensi';
    return { kode: d.kode, nama: d.nama, label: d.label, bagian: d.bagian, skor, min: NORMS[norm].min, max: NORMS[norm].max, kategori: categoryOf(norm, skor), melemah: skor <= WEAKNESS[d.kode].ambang };
  });
  const subkomponen = SUBCOMPONENTS.map((sc) => {
    const items = ITEMS.filter((it) => it.sub === sc.kode);
    const skor = prorate(items, s);
    return { kode: sc.kode, nama: sc.nama, skor, min: items.length, max: items.length * 4, rerata: r2(skor / items.length) };
  });
  const fondasi = sum(dimensi.filter((d) => d.bagian === 1).map((d) => d.skor));
  const otot = dimensi.find((d) => d.kode === 'V6').skor;
  const total = fondasi + otot;
  const kategoriTotal = categoryOf('total', total);

  // Bagian 3: kesiapan dukungan (SS/S = siap)
  const dukungan = SUPPORT.map((x) => ({ kode: x.kode, no: x.no, nama: x.nama, layanan: x.layanan, mudah: x.mudah, jawaban: A[x.no], skor: s(ITEMS.find((it) => it.no === x.no)), siap: isAgree(A[x.no]) }));
  const siapDukungan = dukungan.filter((x) => x.siap).length;

  // Butir pemicu keyword-tagging (Bagian 1–2): unfavorable SS/S, atau favorable TS/STS (skor rendah)
  const butirPemicu = ITEMS.filter((it) => it.bagian < 3 && s(it) !== null && s(it) <= 2).map((it) => {
    const d = dimensi.find((x) => x.kode === it.dimensi);
    const bobot = (s(it) === 1 ? 3 : 2) + (d.kategori === 'Lemah' ? 2 : d.melemah ? 1 : 0);
    return { no: it.no, arah: it.arah, jawaban: A[it.no], skor: s(it), bobot };
  });

  const pelemahan = dimensi.filter((d) => d.melemah).map((d) => d.kode);
  const kekuatan = dimensi.filter((d) => d.kategori === 'Kuat').map((d) => d.kode);
  // Dimensi fokus: persentase skor terendah; bila sama, pemicu terbanyak
  const fokus = dimensi.map((d) => ({ kode: d.kode, p: (d.skor - d.min) / (d.max - d.min), n: butirPemicu.filter((b) => ITEMS.find((it) => it.no === b.no).dimensi === d.kode).length }))
    .sort((a, b) => (a.p - b.p) || (b.n - a.n))[0].kode;

  const kuadran = kategoriTotal === 'Tangguh' ? (siapDukungan >= 2 ? 'tangguh_bertumbuh' : 'tangguh_mandiri') : (siapDukungan >= 2 ? 'siap_dibantu' : 'rentan_tersembunyi');

  // Penanda kebutuhan dukungan kuratif (operasionalisasi PAN-JALU; perlu divalidasi tim konselor)
  const gejalaBerat = A[28] === 'SS';
  const gejala = isAgree(A[28]);
  const inginKonselor = isAgree(A[32]);
  const segera = (kategoriTotal === 'Krisis' && gejala) || (gejalaBerat && inginKonselor);
  const penanda = { krisis_total: kategoriTotal === 'Krisis', gejala_emosional_fisiologis: gejala, gejala_berat: gejalaBerat, ingin_konselor: inginKonselor, butuh_bantuan_segera: segera };
  const perluKuratif = segera || kategoriTotal === 'Krisis' || inginKonselor;
  const risk = segera ? 'red' : (kategoriTotal === 'Krisis' || gejala || A[32] === 'SS') ? 'yellow' : 'none';

  return {
    skor_total: total, kategori_total: kategoriTotal, tahap_layanan: categoryRow('total', kategoriTotal)?.[3] || null,
    skor_fondasi: fondasi, kategori_fondasi: categoryOf('fondasi', fondasi), skor_otot: otot, kategori_otot: categoryOf('otot', otot),
    dimensi, subkomponen, dukungan, siap_dukungan: siapDukungan, kuadran, pelemahan, kekuatan, fokus_dimensi: fokus,
    butir_pemicu: butirPemicu, penanda, perlu_kuratif: perluKuratif, risk_alert: risk,
    butir_nonaktif: instrument().disabledItems(), // jejak versi instrumen saat diisi
  };
}

// Interpretasi untuk konseli: kartu visual + versi teks, dari pustaka kalimat tetap (lihat interpretation.js; bukan AI)
const { buildInterpretation, textInterpretation } = require('./interpretation');
const interpret = (h) => textInterpretation(buildInterpretation(h));

// Klaim interpretasi berbasis Glasser untuk konselor (matriks 6.3)
const counselorClaims = (h) => h.pelemahan.map((k) => ({ dimensi: k, nama: WEAKNESS[k].nama, klaim: WEAKNESS[k].klaim }));

module.exports = { scoreAssessment, validateAnswers, normalize, categoryOf, itemScore, interpret, buildInterpretation, counselorClaims, QUADRANTS, NORMS };
