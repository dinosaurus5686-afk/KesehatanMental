// Catatan Perkembangan Kekuatan Mental: rangkuman bulanan seluruh hasil analisis & rekam jejak mahasiswa
// (asesmen IKDKM-M, check-in emosi, jurnal, goals, latihan napas & audio, konten, Refleksi GURU, komunitas, konseling).
// Semua dihitung dengan aturan tetap (tanpa AI). Tanggal mengikuti WIB.
const { all, get } = require('./db');
const { DIMENSIONS } = require('./reference');
const { LIB } = require('./interpretation');

const WIB = 7 * 3600000;
const ymd = (iso) => new Date(Date.parse(iso) + WIB).toISOString().slice(0, 10);
const monthOf = (iso) => ymd(iso).slice(0, 7);
const daysIn = (bulan) => { const [y, m] = bulan.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const labelBulan = (b) => `${NAMA_BULAN[Number(b.slice(5)) - 1]} ${b.slice(0, 4)}`;
const round1 = (x) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);

// Kebiasaan harian yang terekam aplikasi (satu tanda per hari bila ada aktivitasnya)
const HABITS = [ // tujuh fitur utama aplikasi
  ['asesmen', '📋', 'Asesmen IKDKM-M', ["SELECT diisi_pada AS t FROM assessments WHERE user_id = ?"]],
  ['konten', '📖', 'Akses konten psikoedukasi', ["SELECT waktu AS t FROM content_views WHERE user_id = ?"]],
  ['guru', '🧭', 'Refleksi GURU', ["SELECT tanggal AS t FROM workbook_entries WHERE user_id = ?"]],
  ['jurnal', '📝', 'Jurnal & goals', ["SELECT tanggal AS t FROM journal_entries WHERE user_id = ?", "SELECT updated_at AS t FROM goals WHERE user_id = ? AND selesai = 1"]],
  ['mindfulness', '🧘', 'Ruang Mindfulness', ["SELECT waktu AS t FROM mood_checkins WHERE user_id = ?", "SELECT waktu AS t FROM mindfulness_logs WHERE user_id = ?"]],
  ['komunitas', '👥', 'Komunitas', ["SELECT created_at AS t FROM group_posts WHERE user_id = ?", "SELECT bergabung_pada AS t FROM group_members WHERE user_id = ?"]],
  ['konseling', '💬', 'Konseling', ["SELECT jadwal AS t FROM appointments WHERE student_id = ? AND status IN ('confirmed','selesai')"]],
];
const MOOD_LABEL = { 5: 'Sangat baik', 4: 'Baik', 3: 'Biasa saja', 2: 'Cemas', 1: 'Sedih' };
const JOURNAL_MOOD = { senang: 4, biasa: 3, sedih: 2 };
const NEED_SHORT = { V1: 'Survival', V2: 'Love & Belonging', V3: 'Power / Achievement', V4: 'Freedom', V5: 'Fun' };

function progressReport(userId, bulanReq) {
  const now = new Date().toISOString(); const thisMonth = monthOf(now);
  // Bulan yang tersedia: dari aktivitas paling awal sampai bulan ini
  const first = HABITS.flatMap(([, , , sqls]) => sqls.map((sql) => get(sql.replace(/^SELECT (\w+) AS t/, 'SELECT MIN($1) AS t'), userId)?.t)).filter(Boolean).sort()[0];
  const months = [];
  for (let m = first ? monthOf(first) : thisMonth; m <= thisMonth;) { months.push(m); const [y, mm] = m.split('-').map(Number); m = mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, '0')}`; }
  const bulan = months.includes(bulanReq) ? bulanReq : thisMonth;
  const nDays = daysIn(bulan); const today = bulan === thisMonth ? Number(ymd(now).slice(8)) : nDays;
  const inMonth = (t) => t && monthOf(t) === bulan;

  // ---- Pelacak kebiasaan harian ----
  const kebiasaan = HABITS.map(([kode, ikon, nama, sqls]) => {
    const rows = sqls.flatMap((sql) => all(sql, userId).map((x) => x.t)).filter(inMonth);
    const hari = Array.from({ length: nDays }, () => 0);
    for (const t of rows) hari[Number(ymd(t).slice(8)) - 1]++;
    const aktif = hari.filter(Boolean).length;
    return { kode, ikon, nama, hari: hari.map((n) => (n ? 1 : 0)), jumlah: rows.length, hari_aktif: aktif, persen: Math.round((aktif / today) * 100) };
  });

  // ---- Suasana hati harian (check-in 1–5; jurnal sebagai pelengkap) ----
  const checkins = all('SELECT waktu, mood FROM mood_checkins WHERE user_id = ? ORDER BY waktu', userId).filter((x) => inMonth(x.waktu));
  const journals = all('SELECT tanggal, mood FROM journal_entries WHERE user_id = ? ORDER BY tanggal', userId).filter((x) => inMonth(x.tanggal));
  const moodDay = Array.from({ length: nDays }, () => []);
  for (const c of checkins) moodDay[Number(ymd(c.waktu).slice(8)) - 1].push(c.mood);
  for (const j of journals) if (JOURNAL_MOOD[j.mood]) moodDay[Number(ymd(j.tanggal).slice(8)) - 1].push(JOURNAL_MOOD[j.mood]);
  const menitDay = Array.from({ length: nDays }, () => 0);
  for (const m of all('SELECT waktu, durasi_detik FROM mindfulness_logs WHERE user_id = ?', userId).filter((x) => inMonth(x.waktu))) menitDay[Number(ymd(m.waktu).slice(8)) - 1] += m.durasi_detik / 60;
  const suasana = {
    harian: moodDay.map((v, i) => ({ hari: i + 1, mood: round1(avg(v)), menit_tenang: Math.round(menitDay[i]) })),
    sebaran: [5, 4, 3, 2, 1].map((v) => ({ nilai: v, label: MOOD_LABEL[v], jumlah: checkins.filter((c) => c.mood === v).length })),
    rata: round1(avg(checkins.map((c) => c.mood))), jumlah_checkin: checkins.length,
  };

  // ---- Riwayat asesmen: indikator & radar 5 kebutuhan ----
  const asesmen = all('SELECT * FROM assessments WHERE user_id = ? ORDER BY diisi_pada', userId).map((a) => ({ a, h: JSON.parse(a.hasil_json) }));
  const upto = asesmen.filter((x) => monthOf(x.a.diisi_pada) <= bulan);
  const last = upto[upto.length - 1] || null; const prev = upto[upto.length - 2] || null; const base = upto[0] || null;
  const dimOf = (x, k) => x?.h.dimensi.find((d) => d.kode === k);
  const needs = DIMENSIONS.filter((d) => d.bagian === 1);
  const radar = last ? needs.map((d) => ({ kode: d.kode, nama: d.nama, label: d.mudah, skor: dimOf(last, d.kode).skor, min: 4, max: 16, status: dimOf(last, d.kode).kategori, awal: base && base !== last ? dimOf(base, d.kode).skor : null })) : [];
  const ind = (nama, ket, now_, before, min, max, kat, ikon, warna) => ({ nama, keterangan: ket, skor: now_, sebelumnya: before, perubahan: before === null || now_ === null ? null : now_ - before, min, max, kategori: kat, ikon, warna });
  const indikator = last ? [
    ind('Indeks Kekuatan Mental', 'Gabungan seluruh bagian', last.a.skor_total, prev?.a.skor_total ?? null, 28, 112, last.a.kategori_total, '🌟', 'blue'),
    ind('Pemenuhan 5 kebutuhan dasar', 'Survival · Love · Power · Freedom · Fun', last.a.skor_fondasi, prev?.a.skor_fondasi ?? null, 20, 80, last.a.kategori_fondasi, '🧩', 'indigo'),
    ...needs.map((d) => ind(d.mudah.replace(/ \(.*\)$/, ''), d.nama, dimOf(last, d.kode).skor, prev ? dimOf(prev, d.kode).skor : null, 4, 16, dimOf(last, d.kode).kategori, LIB[d.kode].ikon, LIB[d.kode].warna)),
    ind('Kendali diri & kebiasaan baik', 'Tujuan, tanggung jawab, kebiasaan', last.a.skor_otot, prev?.a.skor_otot ?? null, 8, 32, last.a.kategori_otot, LIB.V6.ikon, 'sky'),
  ] : [];
  // ---- Konten psikoedukasi yang harus diakses (rekomendasi asesmen terakhir) & progresnya ----
  const wajib = last ? all("SELECT r.target_id, r.judul, r.alasan, r.sumber, c.judul AS judul_konten, c.kategori FROM assessment_recommendations r LEFT JOIN content_items c ON c.id = r.target_id WHERE r.assessment_id = ? AND r.jenis = 'konten' ORDER BY r.sumber DESC, r.urutan, r.created_at", last.a.id)
    .filter((r, i, arr) => r.target_id && arr.findIndex((x) => x.target_id === r.target_id) === i).map((r) => {
      const v = get('SELECT COUNT(*) AS n, MAX(waktu) AS t FROM content_views WHERE user_id = ? AND content_id = ?', userId, r.target_id);
      const g = get("SELECT COUNT(*) AS n FROM workbook_entries WHERE user_id = ? AND content_id = ? AND tahap = 'guru'", userId, r.target_id).n;
      return { id: r.target_id, judul: r.judul_konten || r.judul, alasan: r.sumber === 'konselor' ? 'Disarankan konselor' : String(r.alasan || '').split('. Setelah')[0], dibuka: v.n > 0, terakhir_dibuka: v.t, refleksi: g > 0 };
    }) : [];
  const kontenWajib = { item: wajib, dibuka: wajib.filter((x) => x.dibuka).length, refleksi: wajib.filter((x) => x.refleksi).length, total: wajib.length, asesmen_pada: last?.a.diisi_pada || null };

  // ---- Dibanding bulan lalu: hari aktif tiap fitur & rata-rata suasana hati ----
  const [py, pm] = bulan.split('-').map(Number); const prevMonth = pm === 1 ? `${py - 1}-12` : `${py}-${String(pm - 1).padStart(2, '0')}`;
  const daysActive = (sqls, mo) => new Set(sqls.flatMap((sql) => all(sql, userId).map((x) => x.t)).filter((t) => t && monthOf(t) === mo).map(ymd)).size;
  const moodPrev = all('SELECT waktu, mood FROM mood_checkins WHERE user_id = ?', userId).filter((x) => monthOf(x.waktu) === prevMonth).map((x) => x.mood);
  const banding = {
    bulan_lalu: labelBulan(prevMonth), singkat_lalu: `${NAMA_BULAN[Number(prevMonth.slice(5)) - 1].slice(0, 3)}`, singkat_ini: `${NAMA_BULAN[Number(bulan.slice(5)) - 1].slice(0, 3)}`,
    fitur: HABITS.map(([kode, ikon, nama, sqls]) => ({ kode, ikon, nama, sekarang: kebiasaan.find((k) => k.kode === kode).hari_aktif, lalu: daysActive(sqls, prevMonth) })),
    mood: { sekarang: round1(avg(checkins.map((c) => c.mood))), lalu: round1(avg(moodPrev)) },
  };

  // ---- Goals SMART bulan ini ----
  const goals = all('SELECT isi_teks, selesai, minggu_ke, updated_at, created_at FROM goals WHERE user_id = ? ORDER BY minggu_ke, created_at', userId).filter((g) => inMonth(g.created_at) || (g.selesai && inMonth(g.updated_at)));

  // ---- Hasil bulanan ----
  const count = (sql) => all(sql, userId).filter((x) => inMonth(x.t)).length;
  const asesmenBulan = asesmen.filter((x) => inMonth(x.a.diisi_pada));
  const hasil = {
    asesmen: asesmenBulan.length,
    indeks_akhir: last?.a.skor_total ?? null, kategori_akhir: last?.a.kategori_total ?? null,
    perubahan_indeks: last && prev ? last.a.skor_total - prev.a.skor_total : null,
    menit_tenang: Math.round(menitDay.reduce((s, x) => s + x, 0)),
    konten_dibuka: count('SELECT waktu AS t FROM content_views WHERE user_id = ?'),
    refleksi_guru: count('SELECT tanggal AS t FROM workbook_entries WHERE user_id = ?'),
    jurnal: journals.length, checkin: checkins.length,
    goals_selesai: goals.filter((g) => g.selesai).length, goals_total: goals.length,
    sesi_konseling: count("SELECT jadwal AS t FROM appointments WHERE student_id = ? AND status = 'selesai'"),
    diskusi: count('SELECT created_at AS t FROM group_posts WHERE user_id = ?'),
  };

  // ---- Refleksi bulanan otomatis (aturan tetap) ----
  const rutin = kebiasaan.filter((k) => !['asesmen', 'konseling'].includes(k.kode));
  const terbaik = [...rutin].sort((p, q) => q.persen - p.persen)[0];
  const kurang = [...rutin].filter((k) => k.persen < 30).sort((p, q) => p.persen - q.persen)[0];
  const kuat = radar.filter((d) => d.status === 'Kuat').map((d) => NEED_SHORT[d.kode]);
  const lemah = [...radar].sort((p, q) => p.skor - q.skor).filter((d) => d.status !== 'Kuat')[0];
  const refleksi = [
    ['Kebiasaan paling konsisten', terbaik && terbaik.hari_aktif ? `${terbaik.nama} (${terbaik.hari_aktif} hari, ${terbaik.persen}%).` : 'Belum ada kebiasaan yang tercatat bulan ini. Mulai dari satu check-in emosi setiap hari.'],
    ['Kekuatan utamamu', kuat.length ? `Kebutuhan ${kuat.join(', ')} sedang terpenuhi dengan baik.` : last ? 'Belum ada kebutuhan dasar yang berada di kategori kuat; ini wajar dan bisa dilatih pelan-pelan.' : 'Isi asesmen IKDKM-M agar kekuatanmu terlihat.'],
    ['Pertahankan', terbaik && terbaik.persen >= 30 ? `Lanjutkan ${terbaik.nama.toLowerCase()} seperti bulan ini.` : 'Pilih satu kebiasaan kecil dan lakukan di jam yang sama setiap hari.'],
    ['Fokus bulan depan', lemah ? `Kuatkan kebutuhan ${NEED_SHORT[lemah.kode]} (skor ${lemah.skor}/16)${kurang ? ` dan tambah frekuensi ${kurang.nama.toLowerCase()}` : ''}.` : kurang ? `Tambah frekuensi ${kurang.nama.toLowerCase()}.` : 'Jaga ritme yang sudah baik.'],
  ];

  return {
    bulan, label: labelBulan(bulan), bulan_tersedia: months.map((m) => ({ kode: m, label: labelBulan(m) })).reverse(), jumlah_hari: nDays, hari_berjalan: today,
    kebiasaan, suasana, indikator, radar, konten_wajib: kontenWajib, banding, goals, hasil, refleksi,
    ringkasan: [
      { kode: 'asesmen', judul: 'Asesmen', nilai: last ? `${last.a.skor_total}/112` : '—', ket: last ? last.a.kategori_total : 'Belum ada' },
      { kode: 'psikoedukasi', judul: 'Psikoedukasi', nilai: String(hasil.konten_dibuka), ket: 'konten dibuka' },
      { kode: 'refleksi', judul: 'Refleksi', nilai: String(hasil.refleksi_guru + hasil.jurnal), ket: 'GURU & jurnal' },
      { kode: 'kesejahteraan', judul: 'Kesejahteraan', nilai: suasana.rata !== null ? `${suasana.rata}/5` : '—', ket: 'rata-rata suasana hati' },
    ],
  };
}

module.exports = { progressReport };
