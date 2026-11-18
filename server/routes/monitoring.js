// Admin · Asesmen: monitoring profil kekuatan mental mahasiswa seluruh Indonesia, dapat disaring per provinsi, kota,
// universitas, fakultas/prodi, jenis kelamin, umur, tingkat, jenjang, angkatan dan periode. Analisis utama pada 5 kebutuhan
// dasar; Kendali Diri & Kebiasaan Baik ditampilkan sesudahnya. Hanya data agregat (tanpa identitas).
const express = require('express');
const { requireRole } = require('../http');
const { DIMENSIONS } = require('../reference');
const { LIB } = require('../interpretation');
const S = require('../stats');
const cohort = require('../cohort');

const r = express.Router();
const admin = requireRole('admin');
const { round, mean } = S;
const pct = (n, d) => (d ? round((n / d) * 100, 1) : 0);
const NEEDS = DIMENSIONS.filter((d) => d.bagian === 1); const V6 = DIMENSIONS.find((d) => d.bagian === 2);
const dimOf = (h, k) => h.dimensi?.find((d) => d.kode === k);

function profile(rows) {
  const n = rows.length;
  const dim = (d) => {
    const v = rows.map((x) => dimOf(x.h, d.kode)).filter(Boolean);
    const k = (c) => v.filter((x) => x.kategori === c).length;
    return { kode: d.kode, nama: d.mudah.replace(/ \(.*\)$/, ''), istilah: d.nama, ikon: LIB[d.kode]?.ikon, warna: LIB[d.kode]?.warna, min: d.bagian === 2 ? 8 : 4, max: d.bagian === 2 ? 32 : 16,
      rata: round(mean(v.map((x) => x.skor)), 1), sd: round(S.sd(v.map((x) => x.skor)), 1), kuat: pct(k('Kuat'), v.length), rentan: pct(k('Rentan'), v.length), lemah: pct(k('Lemah'), v.length), melemah: v.filter((x) => x.melemah).length };
  };
  const kat = (c) => rows.filter((x) => x.kategori_total === c).length;
  return {
    n,
    indeks: { rata: round(mean(rows.map((x) => x.skor_total)), 1), median: round(S.median(rows.map((x) => x.skor_total)), 1), sd: round(S.sd(rows.map((x) => x.skor_total)), 1),
      tangguh: kat('Tangguh'), rentan: kat('Rentan'), krisis: kat('Krisis'), p_tangguh: pct(kat('Tangguh'), n), p_rentan: pct(kat('Rentan'), n), p_krisis: pct(kat('Krisis'), n) },
    fondasi: { rata: round(mean(rows.map((x) => x.skor_fondasi)), 1), kuat: pct(rows.filter((x) => x.kategori_fondasi === 'Kuat').length, n), lemah: pct(rows.filter((x) => x.kategori_fondasi === 'Lemah').length, n) },
    kebutuhan: NEEDS.map(dim), kendali: dim(V6),
    butuh_segera: rows.filter((x) => x.risk_alert === 'red').length, perlu_perhatian: rows.filter((x) => x.risk_alert === 'yellow').length,
    siap_dibantu: rows.filter((x) => (x.h.siap_dukungan || 0) >= 2).length,
  };
}
// Tabel per kelompok: rata-rata indeks, tiap kebutuhan, kendali diri, dan proporsi kategori
function table(rows, keyFn) {
  const m = new Map(); for (const x of rows) { const k = keyFn(x) || 'Tidak diketahui'; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
  return [...m.entries()].map(([label, xs]) => ({ label, n: xs.length, rata_indeks: round(mean(xs.map((x) => x.skor_total)), 1),
    ...Object.fromEntries([...NEEDS, V6].map((d) => [d.kode, round(mean(xs.map((x) => dimOf(x.h, d.kode)?.skor).filter((v) => v != null)), 1)])),
    p_tangguh: pct(xs.filter((x) => x.kategori_total === 'Tangguh').length, xs.length), p_krisis: pct(xs.filter((x) => x.kategori_total === 'Krisis').length, xs.length) }))
    .sort((a, b) => b.n - a.n);
}
const WIB = 7 * 3600000;
const monthOf = (iso) => new Date(Date.parse(iso) + WIB).toISOString().slice(0, 7);

r.get('/admin/monitoring', admin, (req, res) => {
  const f = cohort.filtersOf(req.query);
  const rows = cohort.loadRows(f).map((a) => { let h = {}; try { h = JSON.parse(a.hasil_json); } catch { /* */ } return { ...a, h, hasil_json: undefined, jawaban_enc: undefined }; });
  // tren bulanan memakai semua pengisian (bukan hanya yang terbaru) agar perubahan dari waktu ke waktu terlihat
  const allRows = f.mode === 'semua' ? rows : cohort.loadRows({ ...f, mode: 'semua' }).map((a) => { let h = {}; try { h = JSON.parse(a.hasil_json); } catch { /* */ } return { ...a, h }; });
  const months = [...new Set(allRows.map((x) => monthOf(x.diisi_pada)))].sort().slice(-12);
  res.json({
    filter: f, label: cohort.filterLabel(f), mahasiswa: new Set(rows.map((x) => x.user_id)).size, pengisian: allRows.length,
    profil: profile(rows),
    wilayah: { provinsi: table(rows, (x) => x.provinsi), kota: table(rows, (x) => x.kota && `${x.kota}${f.provinsi ? '' : ` · ${x.provinsi || ''}`}`), universitas: table(rows, (x) => x.universitas) },
    demografi: { gender: table(rows, (x) => x.gender_label), umur: table(rows, (x) => x.kelompok_umur), tingkat: table(rows, (x) => x.tingkat_label), jenjang: table(rows, (x) => x.jenjang), fakultas: f.universitas ? table(rows, (x) => x.fakultas) : [], prodi: f.universitas ? table(rows, (x) => x.nama_prodi) : [] },
    tren: months.map((m) => { const xs = allRows.filter((x) => monthOf(x.diisi_pada) === m); return { bulan: m, n: xs.length, rata_indeks: round(mean(xs.map((x) => x.skor_total)), 1), ...Object.fromEntries([...NEEDS, V6].map((d) => [d.kode, round(mean(xs.map((x) => dimOf(x.h, d.kode)?.skor).filter((v) => v != null)), 1)])) }; }),
  });
});

module.exports = r;
