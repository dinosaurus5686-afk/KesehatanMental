// Aplikasi Konselor/Admin: dashboard, profil 360°, laporan komunal, AI, kinerja.
const express = require('express');
const ExcelJS = require('exceljs');
const { all, get, run, insert, update, nowIso, audit, getConfig } = require('../db');
const { enc, dec } = require('../security');
const { fail, requireRole, str, rateLimit } = require('../http');
const { latestAssessment, assessmentDetail, canAccessStudent, scopedStudentIds, displayName, notify, counselorScope, effectiveSchedule, recommendationsFor, dimLabel, coordinators, caseCode, visibleContent, isPanjalu } = require('../services');
const { DIMENSIONS, SUPPORT, SERVICE_RECS, COUNSELING_TOPICS, QUADRANTS, NORMS } = require('../reference');
const ai = require('../ai');
const pdfx = require('../pdf');

const r = express.Router();
const clinical = requireRole('konselor');
const konselor = requireRole('konselor');
const reporter = requireRole('konselor', 'koordinator'); // laporan komunal; koordinator hanya data agregat

function guardStudent(req, studentId) {
  const acc = canAccessStudent(req.user, studentId);
  if (acc.reason === 'not_found') fail(404, 'Mahasiswa tidak ditemukan.');
  if (!acc.ok) fail(403, 'Mahasiswa ini berada di luar lingkup kewenangan Anda.', 'OUT_OF_SCOPE');
  let alasan = null;
  if (acc.needsReason) { alasan = str(req.headers['x-access-reason'], 300); if (alasan.length < 10) fail(428, 'Akses admin ke data klinis individual wajib menyertakan alasan (min. 10 karakter).', 'REASON_REQUIRED'); }
  return { acc, alasan };
}

const fmtStudent = (s, viewer) => {
  const p = get('SELECT nama_prodi, fakultas_kode FROM prodi WHERE id = ?', s.prodi_id);
  const a = latestAssessment(s.id, { withRecs: false });
  return { id: s.id, nama: displayName(s, viewer), nim: s.nim_nip, prodi: p?.nama_prodi, fakultas: p?.fakultas_kode, angkatan: s.angkatan, kelas: s.kelas, disamarkan: !!s.identitas_disamarkan,
    kampus_lain: viewer && s.university_id !== viewer.university_id ? (get('SELECT nama FROM universities WHERE id = ?', s.university_id)?.nama || '-') : null,
    skor_total: a?.skor_total ?? null, kategori_total: a?.kategori_total ?? null, pelemahan: a?.pelemahan?.length ?? null, kuadran: a?.kuadran ?? null, risk_alert: a?.risk_alert ?? null, terakhir_asesmen: a?.diisi_pada ?? null };
};

// ---- Dashboard ----
r.get('/dashboard/counselor', konselor, (req, res) => {
  const ids = new Set(scopedStudentIds(req.user)); const pj = isPanjalu(req.user.id);
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const alerts = all("SELECT r.*, u.nama, u.nim_nip, u.identitas_disamarkan, u.id AS uid, t.nama AS ditugaskan_nama FROM risk_alerts r JOIN users u ON u.id = r.student_id LEFT JOIN users t ON t.id = r.ditugaskan_ke WHERE r.level = 'red' AND r.ditindaklanjuti_pada IS NULL ORDER BY r.created_at")
    // kasus kampus sendiri, ditambah (Konselor PAN-JALU) konseli lintas kampus & kasus kampus tanpa konselor yang menjadi kewenangannya
    .filter((a) => (a.university_id ?? get('SELECT university_id FROM users WHERE id = ?', a.uid).university_id) === req.user.university_id || (pj && canAccessStudent(req.user, a.uid).ok))
    .map((a) => ({ id: a.id, student_id: a.student_id, nama: displayName({ ...a, id: a.uid }, req.user), dibuat: a.created_at, dieskalasi: a.dieskalasi_pada, sumber: a.sumber, ditugaskan: a.ditugaskan_ke ? { nama: a.ditugaskan_nama, saya: a.ditugaskan_ke === req.user.id } : null }));
  const yellow = all("SELECT r.id, r.student_id, r.created_at FROM risk_alerts r WHERE r.level = 'yellow' AND r.ditindaklanjuti_pada IS NULL").filter((x) => ids.has(x.student_id));
  const acts = [];
  for (const a of all('SELECT user_id, diisi_pada AS t, skor_total, kategori_total, risk_alert FROM assessments WHERE diisi_pada >= ? ORDER BY diisi_pada DESC', since)) if (ids.has(a.user_id)) acts.push({ student_id: a.user_id, waktu: a.t, aktivitas: 'Mengisi asesmen IKDKM-M', detail: `Indeks ${a.skor_total} · ${a.kategori_total}`, risk: a.risk_alert });
  for (const j of all('SELECT user_id, tanggal AS t, mood FROM journal_entries WHERE tanggal >= ?', since)) if (ids.has(j.user_id)) acts.push({ student_id: j.user_id, waktu: j.t, aktivitas: 'Menulis jurnal harian', detail: `Mood: ${j.mood}` });
  for (const w of all('SELECT w.user_id, w.tanggal AS t, c.judul FROM workbook_entries w LEFT JOIN content_items c ON c.id = w.content_id WHERE w.tanggal >= ?', since)) if (ids.has(w.user_id)) acts.push({ student_id: w.user_id, waktu: w.t, aktivitas: 'Menulis Refleksi GURU', detail: w.judul || '-' });
  for (const ap of all('SELECT student_id, created_at AS t, topik FROM appointments WHERE counselor_id = ? AND created_at >= ?', req.user.id, since)) acts.push({ student_id: ap.student_id, waktu: ap.t, aktivitas: 'Membuat reservasi konseling', detail: ap.topik });
  acts.sort((a, b) => b.waktu.localeCompare(a.waktu));
  const names = (sid) => displayName(get('SELECT * FROM users WHERE id = ?', sid), req.user);
  const unread = all('SELECT m.sender_id, m.isi_teks, m.dikirim_pada FROM messages m WHERE m.receiver_id = ? AND m.dibaca = 0 ORDER BY m.dikirim_pada DESC', req.user.id);
  res.json({
    kpi: {
      risiko_tinggi_aktif: alerts.length,
      reservasi_baru: get("SELECT COUNT(*) AS n FROM appointments WHERE counselor_id = ? AND status = 'pending'", req.user.id).n,
      entri_jurnal_7hari: all('SELECT user_id FROM journal_entries WHERE tanggal >= ?', since).filter((j) => ids.has(j.user_id)).length,
      workbook_aktif: new Set(all('SELECT user_id FROM workbook_entries WHERE tanggal >= ?', new Date(Date.now() - 30 * 86400000).toISOString()).map((w) => w.user_id).filter((u) => ids.has(u))).size,
    },
    sla_menit: getConfig('sla_menit', 30),
    alerts, risiko_kuning: yellow.map((y) => ({ ...y, nama: names(y.student_id) })),
    aktivitas: acts.slice(0, 15).map((a) => ({ ...a, nama: names(a.student_id) })),
    pesan_masuk: unread.map((m) => ({ sender_id: m.sender_id, nama: names(m.sender_id) || get('SELECT nama FROM users WHERE id = ?', m.sender_id).nama, cuplikan: dec(m.isi_teks).slice(0, 90), waktu: m.dikirim_pada })),
    jadwal_hari_ini: all("SELECT id, jadwal, topik, jenis, student_id FROM appointments WHERE counselor_id = ? AND status = 'confirmed' AND date(jadwal) = date('now') ORDER BY jadwal", req.user.id).map((a) => ({ ...a, nama: names(a.student_id) })),
    tugas: all('SELECT id, judul, jatuh_tempo, student_id FROM scheduled_tasks WHERE owner_id = ? AND selesai = 0 ORDER BY jatuh_tempo LIMIT 8', req.user.id).map((t) => ({ ...t, nama: t.student_id ? names(t.student_id) : null })),
    lingkup: counselorScope(req.user.id),
  });
});

r.post('/alerts/:id/ack', konselor, (req, res) => {
  const a = get('SELECT r.*, u.university_id AS uni FROM risk_alerts r JOIN users u ON u.id = r.student_id WHERE r.id = ?', req.params.id);
  if (!a || (a.uni !== req.user.university_id && !canAccessStudent(req.user, a.student_id).ok)) fail(404, 'Peringatan tidak ditemukan.');
  if (a.ditindaklanjuti_pada) fail(409, 'Kasus ini sudah ditindaklanjuti konselor lain.');
  const catatan = str(req.body?.catatan, 1000);
  if (catatan.length < 5) fail(400, 'Tuliskan tindakan yang sudah dilakukan (mis. "Menelepon mahasiswa, kondisi aman, janji temu besok").');
  update('risk_alerts', a.id, { ditindaklanjuti_oleh: req.user.id, ditindaklanjuti_pada: nowIso(), catatan_tindak_lanjut: enc(catatan) });
  audit({ actor: req.user, aksi: 'tindak_lanjut_krisis', entitas: 'risk_alerts', entitas_id: a.id, student_id: a.student_id, ip: req.ip });
  for (const c of all("SELECT id FROM users WHERE role = 'konselor' AND id != ? AND university_id IS ?", req.user.id, a.uni)) notify(c.id, { tipe: 'krisis', judul: 'Kasus risiko-merah sudah ditindaklanjuti', isi: `Ditangani oleh ${req.user.nama}.`, tautan: '#/c/dashboard' });
  for (const uid of coordinators(a.uni)) notify(uid, { tipe: 'krisis', judul: `Kasus ${caseCode(a.id)} sudah ditindaklanjuti`, isi: `Ditangani oleh ${req.user.nama}.`, tautan: '#/k/darurat' });
  res.json({ ok: true });
});

r.post('/tasks/:id/done', konselor, (req, res) => { const t = get('SELECT * FROM scheduled_tasks WHERE id = ? AND owner_id = ?', req.params.id, req.user.id); if (!t) fail(404, 'Tugas tidak ditemukan.'); update('scheduled_tasks', t.id, { selesai: 1 }); res.json({ ok: true }); });

// ---- Daftar & profil mahasiswa ----
r.get('/students', clinical, (req, res) => {
  const ids = scopedStudentIds(req.user);
  res.json({ lingkup: req.user.role === 'konselor' ? counselorScope(req.user.id) : ['SEMUA'], items: ids.map((id) => fmtStudent(get('SELECT * FROM users WHERE id = ?', id), req.user)).sort((a, b) => (a.indeks ?? 999) - (b.indeks ?? 999)) });
});

r.get('/students/:id/profile', clinical, (req, res) => {
  const { acc, alasan } = guardStudent(req, req.params.id);
  const s = get('SELECT * FROM users WHERE id = ?', req.params.id);
  audit({ actor: req.user, aksi: 'baca_profil_klinis', entitas: 'users', entitas_id: s.id, student_id: s.id, alasan: alasan || `dasar akses: ${acc.reason}`, ip: req.ip });
  const p = get('SELECT * FROM prodi WHERE id = ?', s.prodi_id);
  const history = all('SELECT id, diisi_pada, skor_total, kategori_total, skor_fondasi, skor_otot, risk_alert FROM assessments WHERE user_id = ? ORDER BY diisi_pada', s.id);
  const latest = latestAssessment(s.id, { konselor: true });
  const summary = get('SELECT ringkasan, sumber, created_at, ditulis_oleh FROM profile_summaries WHERE student_id = ? ORDER BY created_at DESC LIMIT 1', s.id);
  const note = req.user.role === 'konselor' ? get('SELECT catatan, diperbarui_pada FROM counselor_notes WHERE student_id = ? AND counselor_id = ?', s.id, req.user.id) : null;
  const logs = all('SELECT jenis_aktivitas, durasi_detik, waktu FROM mindfulness_logs WHERE user_id = ? ORDER BY waktu DESC LIMIT 30', s.id);
  const journals = all('SELECT tanggal, mood, isi_teks, tags FROM journal_entries WHERE user_id = ? ORDER BY tanggal DESC LIMIT 10', s.id);
  res.json({
    student: { ...fmtStudent(s, req.user), email: s.email, gender: s.gender, tanggal_lahir: s.tanggal_lahir, telepon: dec(s.telepon), alamat: dec(s.alamat), fakultas_nama: p?.fakultas, nim: s.nim_nip },
    dasar_akses: acc.reason,
    asesmen_terakhir: latest, riwayat: history,
    ringkasan: summary ? { ...summary, ringkasan: dec(summary.ringkasan), penulis: get('SELECT nama FROM users WHERE id = ?', summary.ditulis_oleh)?.nama } : null,
    workbook: all('SELECT domain_id, tahap, isi_teks, keluaran, konten_json, tanggal FROM workbook_entries WHERE user_id = ? ORDER BY tanggal DESC LIMIT 12', s.id).map((w) => ({ ...w, isi_teks: dec(w.isi_teks), konten: JSON.parse(w.konten_json || '[]').map((id) => get('SELECT judul FROM content_items WHERE id = ?', id)?.judul).filter(Boolean), konten_json: undefined })), // Refleksi GURU per konten
    konten_diakses: all('SELECT c.judul, c.tipe, MAX(v.waktu) AS terakhir, COUNT(*) AS kali FROM content_views v JOIN content_items c ON c.id = v.content_id WHERE v.user_id = ? GROUP BY c.id ORDER BY terakhir DESC LIMIT 12', s.id),
    jadwal_asesmen: effectiveSchedule(s.id),
    // Jurnal: ringkasan saja (mood + cuplikan pendek), bukan isi penuh (Bab 6.4)
    jurnal: journals.map((j) => ({ tanggal: j.tanggal, mood: j.mood, cuplikan: dec(j.isi_teks).slice(0, 90) + (dec(j.isi_teks).length > 90 ? '…' : ''), tags: JSON.parse(j.tags) })),
    goals: all('SELECT isi_teks, selesai, minggu_ke FROM goals WHERE user_id = ? ORDER BY minggu_ke DESC LIMIT 10', s.id),
    mood: all('SELECT waktu, mood FROM mood_checkins WHERE user_id = ? ORDER BY waktu DESC LIMIT 30', s.id),
    mindfulness: { total_sesi: get('SELECT COUNT(*) AS n FROM mindfulness_logs WHERE user_id = ?', s.id).n, total_menit: Math.round((get('SELECT SUM(durasi_detik) AS n FROM mindfulness_logs WHERE user_id = ?', s.id).n || 0) / 60), riwayat: logs },
    catatan: note ? { catatan: dec(note.catatan), diperbarui_pada: note.diperbarui_pada } : null,
    intervensi: all('SELECT i.id, i.deskripsi, i.status, i.prioritas, i.created_at, u.nama AS oleh FROM interventions i LEFT JOIN users u ON u.id = i.dibuat_oleh WHERE i.student_id = ? ORDER BY i.created_at DESC', s.id),
    pertemuan: all('SELECT a.id, a.jadwal, a.topik, a.status, a.jenis, a.tindak_lanjut, u.nama AS konselor FROM appointments a JOIN users u ON u.id = a.counselor_id WHERE a.student_id = ? ORDER BY a.jadwal DESC', s.id),
    alerts: all('SELECT id, level, created_at, ditindaklanjuti_pada, dieskalasi_pada FROM risk_alerts WHERE student_id = ? ORDER BY created_at DESC', s.id),
    ai_tersedia: getConfig('ai_enabled', true), ai_mode: ai.aiMode(),
  });
});

r.put('/students/:id/notes', konselor, (req, res) => {
  guardStudent(req, req.params.id);
  const catatan = str(req.body?.catatan, 20000);
  const ex = get('SELECT id FROM counselor_notes WHERE student_id = ? AND counselor_id = ?', req.params.id, req.user.id);
  if (ex) update('counselor_notes', ex.id, { catatan: enc(catatan), diperbarui_pada: nowIso() });
  else insert('counselor_notes', { student_id: req.params.id, counselor_id: req.user.id, catatan: enc(catatan), diperbarui_pada: nowIso() });
  audit({ actor: req.user, aksi: 'tulis_catatan_konselor', entitas: 'counselor_notes', student_id: req.params.id, ip: req.ip });
  res.json({ ok: true });
});
r.put('/students/:id/summary', konselor, (req, res) => {
  guardStudent(req, req.params.id);
  const t = str(req.body?.ringkasan, 5000); if (!t) fail(400, 'Ringkasan kosong.');
  insert('profile_summaries', { student_id: req.params.id, ringkasan: enc(t), sumber: 'konselor', ditulis_oleh: req.user.id });
  res.json({ ok: true });
});
r.post('/students/:id/interventions', konselor, (req, res) => {
  guardStudent(req, req.params.id);
  const d = str(req.body?.deskripsi, 1000); if (!d) fail(400, 'Tulis rencana intervensi.');
  const prioritas = ['normal', 'tinggi', 'krisis'].includes(req.body.prioritas) ? req.body.prioritas : 'normal';
  res.status(201).json({ id: insert('interventions', { student_id: req.params.id, deskripsi: d, dibuat_oleh: req.user.id, prioritas }) });
});
r.patch('/interventions/:id', konselor, (req, res) => {
  const i = get('SELECT * FROM interventions WHERE id = ?', req.params.id); if (!i) fail(404, 'Intervensi tidak ditemukan.');
  guardStudent(req, i.student_id);
  if (!['aktif', 'selesai', 'dibatalkan'].includes(req.body?.status)) fail(400, 'Status tidak valid.');
  update('interventions', i.id, { status: req.body.status }); res.json({ ok: true });
});

// ---- Laporan komunal IKDKM-M (dihitung di backend) ----
const TOTAL_CATS = NORMS.total.batas.map((b) => b[1]); // Tangguh, Rentan, Krisis
const NEEDS = DIMENSIONS.filter((d) => d.bagian === 1);
function aggregate(user, q) {
  // Koordinator: seluruh mahasiswa aktif, tetapi hanya angka agregat (tanpa baris per mahasiswa)
  const coord = user.role === 'koordinator';
  if (coord) q = { ...q, anon: true };
  const ids = coord ? all("SELECT id FROM users WHERE role = 'mahasiswa' AND status = 'aktif' AND university_id = ?", user.university_id).map((x) => x.id) : scopedStudentIds(user);
  const rows = ids.map((id) => { const s = get('SELECT u.*, p.nama_prodi, p.fakultas_kode FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.id = ?', id); return { s, a: latestAssessment(id, { withRecs: false }) }; })
    .filter(({ s, a }) => a && (!q.prodi || s.prodi_id === q.prodi) && (!q.angkatan || String(s.angkatan) === String(q.angkatan)));
  const avg = (arr) => { const v = arr.filter((x) => Number.isFinite(x)); return v.length ? Math.round((v.reduce((x, y) => x + y, 0) / v.length) * 10) / 10 : null; };
  const group = (keyFn) => {
    const m = new Map();
    for (const x of rows) { const k = keyFn(x); const g = m.get(k) || { kelompok: k, t: [], f: [], o: [], d: {}, krisis: 0, segera: 0 }; g.t.push(x.a.skor_total); g.f.push(x.a.skor_fondasi); g.o.push(x.a.skor_otot); for (const dd of x.a.dimensi) (g.d[dd.kode] ||= []).push(dd.skor); if (x.a.kategori_total === 'Krisis') g.krisis++; if (x.a.risk_alert === 'red') g.segera++; m.set(k, g); }
    // diurutkan dari pemenuhan 5 kebutuhan dasar terendah (analisis utama)
    return [...m.values()].map((g) => ({ kelompok: g.kelompok, jumlah: g.t.length, rata_total: avg(g.t), rata_fondasi: avg(g.f), ...Object.fromEntries(NEEDS.map((d) => [d.kode, avg(g.d[d.kode] || [])])), rata_otot: avg(g.o), krisis: g.krisis, butuh_segera: g.segera })).sort((a, b) => (a.rata_fondasi - b.rata_fondasi) || (a.rata_total - b.rata_total));
  };
  const dimensi = DIMENSIONS.map((d) => {
    const ds = rows.map((x) => x.a.dimensi.find((y) => y.kode === d.kode));
    return { kode: d.kode, nama: d.nama, label: d.label, min: ds[0]?.min ?? (d.bagian === 2 ? 8 : 4), max: ds[0]?.max ?? (d.bagian === 2 ? 32 : 16), rata: avg(ds.map((x) => x.skor)),
      kuat: ds.filter((x) => x.kategori === 'Kuat').length, rentan: ds.filter((x) => x.kategori === 'Rentan').length, lemah: ds.filter((x) => x.kategori === 'Lemah').length, melemah: ds.filter((x) => x.melemah).length };
  });
  // Analisis utama: 5 kebutuhan dasar (diurutkan dari yang paling banyak melemah); Kendali Diri & Kebiasaan Baik selalu sesudahnya
  const severity = (a, b) => (b.melemah - a.melemah) || ((a.rata - a.min) / (a.max - a.min) - (b.rata - b.min) / (b.max - b.min));
  const kebutuhan = dimensi.filter((d) => NEEDS.some((x) => x.kode === d.kode)).sort(severity);
  const kendali = dimensi.find((d) => d.kode === 'V6');
  dimensi.splice(0, dimensi.length, ...kebutuhan, kendali);
  const dukungan = SUPPORT.map((x) => ({ kode: x.kode, nama: x.nama, layanan: x.layanan, siap: rows.filter((r) => r.a.dukungan.find((y) => y.kode === x.kode)?.siap).length }));
  const top = kebutuhan[0];
  const campusName = require('../campus').universityName(user.university_id) || null;
  return {
    kampus: campusName, kebutuhan, kendali,
    filter: q, jumlah_mahasiswa: rows.length, rata_total: avg(rows.map((x) => x.a.skor_total)), rata_fondasi: avg(rows.map((x) => x.a.skor_fondasi)), rata_otot: avg(rows.map((x) => x.a.skor_otot)),
    distribusi_total: TOTAL_CATS.map((k) => ({ kategori: k, jumlah: rows.filter((x) => x.a.kategori_total === k).length })),
    distribusi_fondasi: ['Kuat', 'Rentan', 'Lemah'].map((k) => ({ kategori: k, jumlah: rows.filter((x) => x.a.kategori_fondasi === k).length })),
    distribusi_otot: ['Kuat', 'Rentan', 'Lemah'].map((k) => ({ kategori: k, jumlah: rows.filter((x) => x.a.kategori_otot === k).length })),
    kuadran: Object.entries(QUADRANTS).map(([k, v]) => ({ kode: k, nama: v.nama, jumlah: rows.filter((x) => x.a.kuadran === k).length })),
    penanda: { butuh_bantuan_segera: rows.filter((x) => x.a.penanda.butuh_bantuan_segera).length, perlu_kuratif: rows.filter((x) => x.a.perlu_kuratif).length, gejala_emosional_fisiologis: rows.filter((x) => x.a.penanda.gejala_emosional_fisiologis).length },
    dukungan, per_prodi: group((x) => x.s.nama_prodi), per_angkatan: group((x) => String(x.s.angkatan)), per_kelas: group((x) => `${x.s.nama_prodi} ${x.s.angkatan}-${x.s.kelas}`),
    dimensi, rekomendasi_layanan: [...kebutuhan.filter((d) => d.melemah).slice(0, 3), ...(kendali?.melemah ? [kendali] : [])].flatMap((d) => SERVICE_RECS[d.kode].map(([jenis, judul]) => ({ jenis, judul, dimensi: d.label, jumlah: d.melemah }))),
    baris: coord ? [] : rows.map(({ s, a }) => ({ id: !q.anon ? s.nim_nip : `ANON-${s.id.slice(0, 6).toUpperCase()}`, nama: !q.anon ? displayName(s, user) : null, prodi: s.nama_prodi, angkatan: s.angkatan, kelas: s.kelas,
      skor_total: a.skor_total, kategori_total: a.kategori_total, skor_fondasi: a.skor_fondasi, kategori_fondasi: a.kategori_fondasi, skor_otot: a.skor_otot, kategori_otot: a.kategori_otot,
      kuadran: QUADRANTS[a.kuadran]?.nama, segera: a.penanda.butuh_bantuan_segera ? 'Ya' : 'Tidak', tanggal: a.diisi_pada,
      ...Object.fromEntries(a.dimensi.map((d) => [d.kode, d.skor])), ...Object.fromEntries(a.dukungan.map((d) => [`S_${d.kode}`, d.jawaban])) })),
    top,
  };
}
const reportQuery = (req) => ({ prodi: str(req.query.prodi, 10) || null, angkatan: str(req.query.angkatan, 6) || null, anon: req.query.anon === '1' });

r.get('/reports/aggregate', reporter, (req, res) => { const d = aggregate(req.user, reportQuery(req)); res.json({ ...d, baris: undefined, top: undefined, anonim: d.filter.anon }); });

r.get('/reports/export', reporter, async (req, res) => {
  const d = aggregate(req.user, reportQuery(req)); const q = d.filter;
  const prodiName = q.prodi ? get('SELECT nama_prodi FROM prodi WHERE id = ?', q.prodi)?.nama_prodi : 'Semua prodi';
  const label = `${prodiName} · ${q.angkatan ? 'Angkatan ' + q.angkatan : 'Semua angkatan'}`;
  audit({ actor: req.user, aksi: `ekspor_laporan_${req.query.format}`, entitas: 'reports', alasan: `${label}${q.anon ? ' (anonim)' : ''}`, ip: req.ip });
  const stamp = new Date().toISOString().slice(0, 10);
  if (req.query.format === 'xlsx') {
    const wb = new ExcelJS.Workbook(); wb.creator = 'PAN-JALU UNP Kediri';
    const s1 = wb.addWorksheet('Ringkasan');
    const dimRow = (x) => [`${x.kode} ${x.label}`, x.rata, `${x.min}–${x.max}`, x.kuat, x.rentan, x.lemah, x.melemah];
    s1.addRows([[`Laporan Komunal IKDKM-M — ${d.kampus || 'PAN-JALU'}`], [`Filter: ${label}`], [`Dibuat: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB oleh ${req.user.nama}`], [],
      ['Jumlah mahasiswa', d.jumlah_mahasiswa], ['Rata-rata 5 Kebutuhan Dasar (20–80)', d.rata_fondasi], ['Rata-rata Kendali Diri & Kebiasaan Baik (8–32)', d.rata_otot], ['Rata-rata Indeks Kekuatan Mental (28–112)', d.rata_total],
      ['Butuh bantuan segera', d.penanda.butuh_bantuan_segera], ['Perlu didampingi konselor', d.penanda.perlu_kuratif], [],
      ['ANALISIS UTAMA: 5 KEBUTUHAN DASAR'], ['Kebutuhan', 'Rata-rata skor', 'Rentang', 'Kuat', 'Rentan', 'Lemah', 'Melemah (≤ ambang)'], ...d.kebutuhan.map(dimRow),
      ['Kategori 5 Kebutuhan Dasar (gabungan)', 'Jumlah'], ...d.distribusi_fondasi.map((x) => [x.kategori, x.jumlah]), [],
      ['KENDALI DIRI & KEBIASAAN BAIK'], ['Dimensi', 'Rata-rata skor', 'Rentang', 'Kuat', 'Rentan', 'Lemah', 'Melemah (≤ ambang)'], dimRow(d.kendali), ...d.distribusi_otot.map((x) => [x.kategori, x.jumlah]), [],
      ['Kategori Indeks Kekuatan Mental', 'Jumlah'], ...d.distribusi_total.map((x) => [x.kategori, x.jumlah]), [],
      ['Kesiapan dukungan (Bagian 3)', 'Jumlah SS/S'], ...d.dukungan.map((x) => [`${x.nama} — ${x.layanan}`, x.siap])]);
    s1.getRow(1).font = { bold: true, size: 14 }; s1.getColumn(1).width = 52; [2, 3, 4, 5, 6, 7].forEach((c) => { s1.getColumn(c).width = 16; });
    for (const [name, rows] of [['Per Prodi', d.per_prodi], ['Per Angkatan', d.per_angkatan], ['Per Kelas', d.per_kelas]]) {
      const ws = wb.addWorksheet(name); ws.columns = [{ header: 'Kelompok', key: 'kelompok', width: 40 }, { header: 'Jumlah', key: 'jumlah', width: 10 }, { header: 'Rata 5 kebutuhan dasar', key: 'rata_fondasi', width: 14 }, ...NEEDS.map((x) => ({ header: `${x.kode} ${x.nama}`, key: x.kode, width: 12 })), { header: 'Rata kendali diri', key: 'rata_otot', width: 14 }, { header: 'Rata indeks', key: 'rata_total', width: 14 }, { header: 'Kategori krisis', key: 'krisis', width: 16 }, { header: 'Butuh bantuan segera', key: 'butuh_segera', width: 20 }];
      ws.addRows(rows); ws.getRow(1).font = { bold: true };
    }
    if (req.user.role !== 'koordinator') {
    const ws = wb.addWorksheet('Data Mahasiswa');
    ws.columns = [{ header: q.anon ? 'ID Anonim' : 'NIM', key: 'id', width: 16 }, ...(q.anon ? [] : [{ header: 'Nama', key: 'nama', width: 26 }]), { header: 'Prodi', key: 'prodi', width: 30 }, { header: 'Angkatan', key: 'angkatan', width: 10 }, { header: 'Kelas', key: 'kelas', width: 8 },
      { header: 'Indeks', key: 'skor_total', width: 9 }, { header: 'Kategori indeks', key: 'kategori_total', width: 14 }, { header: '5 Kebutuhan Dasar', key: 'skor_fondasi', width: 9 }, { header: 'Kat. fondasi', key: 'kategori_fondasi', width: 12 }, { header: 'Kendali Diri', key: 'skor_otot', width: 9 }, { header: 'Kat. otot', key: 'kategori_otot', width: 12 },
      ...DIMENSIONS.map((x) => ({ header: `${x.kode} ${x.nama}`, key: x.kode, width: 12 })), ...SUPPORT.map((x) => ({ header: `${x.no} ${x.nama}`, key: `S_${x.kode}`, width: 12 })),
      { header: 'Kuadran', key: 'kuadran', width: 24 }, { header: 'Butuh segera', key: 'segera', width: 12 }, { header: 'Tanggal asesmen', key: 'tanggal', width: 22 }];
    ws.addRows(d.baris); ws.getRow(1).font = { bold: true };
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="laporan-komunal-${stamp}.xlsx"`);
    return res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  }
  if (req.query.format === 'pdf') {
    const doc = pdfx.start(res, `laporan-komunal-${stamp}.pdf`);
    pdfx.kop(doc, 'LAPORAN KOMUNAL IKDKM-M', `Filter: ${label}${q.anon ? ' · identitas dianonimkan' : ''}`, require('../branding').brandFor(req.user.university_id));
    pdfx.kv(doc, [['Jumlah mahasiswa', d.jumlah_mahasiswa], ['Rata-rata 5 Kebutuhan Dasar (20–80)', d.rata_fondasi ?? '-'], ['Rata-rata Kendali Diri & Kebiasaan Baik (8–32)', d.rata_otot ?? '-'], ['Rata-rata Indeks Kekuatan Mental (28–112)', d.rata_total ?? '-'], ['Butuh bantuan segera', d.penanda.butuh_bantuan_segera]]);
    pdfx.h2(doc, 'Analisis utama: 5 Kebutuhan Dasar');
    if (d.jumlah_mahasiswa) pdfx.radarPdf(doc, d.kebutuhan.map((x) => ({ kode: x.kode, nama: x.nama, skor: Math.round(x.rata ?? 4), max: 16, status: (x.rata ?? 0) >= 13 ? 'Kuat' : (x.rata ?? 0) >= 8 ? 'Rentan' : 'Lemah' })).sort((a, b) => a.kode.localeCompare(b.kode)), { R: 78 });
    pdfx.table(doc, ['Kebutuhan (4–16)', 'Rata', 'Kuat', 'Rentan', 'Lemah', 'Melemah'], d.kebutuhan.map((x) => [`${x.kode} ${x.label}`, x.rata, x.kuat, x.rentan, x.lemah, x.melemah]), [219, 56, 56, 56, 56, 56]);
    pdfx.table(doc, ['Kategori 5 Kebutuhan Dasar (gabungan 20–80)', 'Jumlah mahasiswa'], d.distribusi_fondasi.map((x) => [x.kategori, x.jumlah]), [350, 149]);
    pdfx.h2(doc, 'Kendali Diri & Kebiasaan Baik');
    pdfx.table(doc, ['Dimensi (8–32)', 'Rata', 'Kuat', 'Rentan', 'Lemah', 'Melemah'], [[`${d.kendali.kode} ${d.kendali.label}`, d.kendali.rata, d.kendali.kuat, d.kendali.rentan, d.kendali.lemah, d.kendali.melemah]], [219, 56, 56, 56, 56, 56]);
    pdfx.h2(doc, 'Distribusi kategori Indeks Kekuatan Mental');
    pdfx.table(doc, ['Kategori', 'Jumlah mahasiswa'], d.distribusi_total.map((x) => [x.kategori, x.jumlah]), [350, 149]);
    pdfx.h2(doc, 'Peta kekuatan mental & kesiapan dibantu');
    pdfx.table(doc, ['Kuadran', 'Jumlah mahasiswa'], d.kuadran.map((x) => [x.nama, x.jumlah]), [350, 149]);
    pdfx.h2(doc, 'Kesiapan dukungan (Bagian 3)');
    pdfx.table(doc, ['Jenis dukungan', 'Menjawab SS/S'], d.dukungan.map((x) => [`${x.nama} — ${x.layanan}`, x.siap]), [350, 149]);
    pdfx.h2(doc, 'Kelompok dengan pemenuhan 5 kebutuhan dasar terendah');
    pdfx.table(doc, ['Kelompok', 'Jumlah', '5 kebutuhan', 'Kendali diri', 'Indeks', 'Krisis'], [['Prodi', d.per_prodi[0]], ['Angkatan', d.per_angkatan[0]], ['Kelas', d.per_kelas[0]]].filter(([, g]) => g).map(([n, g]) => [`${n}: ${g.kelompok}`, g.jumlah, g.rata_fondasi, g.rata_otot, g.rata_total, g.krisis]), [189, 50, 70, 70, 60, 60]);
    pdfx.h2(doc, 'Rekomendasi program layanan');
    if (!d.rekomendasi_layanan.length) doc.text('Belum ada dimensi yang melemah.');
    d.rekomendasi_layanan.forEach((x) => doc.text(`• [${x.jenis}] ${x.judul} (dimensi ${x.dimensi}; ${x.jumlah} mahasiswa melemah)`));
    pdfx.footer(doc, `Dicetak ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB · PAN-JALU`);
    doc.end(); return;
  }
  fail(400, 'Format ekspor harus xlsx atau pdf.');
});

// Bukti informed consent (PDF dari server)
r.get('/consents/:id/pdf', clinical, (req, res) => {
  const c = get('SELECT * FROM consents WHERE id = ?', req.params.id); if (!c) fail(404, 'Data persetujuan tidak ditemukan.');
  guardStudent(req, c.user_id);
  const s = get('SELECT * FROM users WHERE id = ?', c.user_id);
  audit({ actor: req.user, aksi: 'unduh_bukti_consent', entitas: 'consents', entitas_id: c.id, student_id: s.id, ip: req.ip });
  const doc = pdfx.start(res, `bukti-consent-${c.id.slice(0, 8)}.pdf`);
  pdfx.kop(doc, 'BUKTI PERSETUJUAN (INFORMED CONSENT)', null, require('../branding').brandFor(s.university_id));
  const kampusNama = get('SELECT nama FROM universities WHERE id = ?', s.university_id)?.nama || '-';
  doc.fontSize(10).text(`Nama: ${s.nama}`).text(`NIM: ${s.nim_nip}`).text(`Perguruan tinggi: ${kampusNama}`).text(`Jenis persetujuan: ${c.jenis_consent}`).text(`Disetujui pada: ${new Date(c.disetujui_pada).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`).text(`Versi kebijakan: ${c.versi_kebijakan}`).text(`Alamat IP tercatat: ${c.alamat_ip || '-'}`).text(`ID rekaman: ${c.id}`).moveDown()
    .text('Mahasiswa menyatakan memahami tujuan layanan, batas kerahasiaan (termasuk pengecualian bila ada risiko keselamatan diri atau orang lain), serta haknya untuk mengakses, memperbaiki, dan meminta penghapusan data sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.', { align: 'justify' });
  doc.end();
});

// ---- AI Insight Service (human-in-the-loop) ----
const aiLimiter = rateLimit({ windowMs: 3600000, max: 20, key: (req) => req.user.id, message: 'Batas pemakaian AI tercapai (20 permintaan/jam). Coba lagi nanti.' });
const aiInstLimiter = rateLimit({ windowMs: 86400000, max: 300, key: () => 'institusi', message: 'Kuota AI institusi hari ini sudah habis.' });
function aiContext(studentId) {
  const a = latestAssessment(studentId, { withRecs: false }); if (!a) fail(400, 'Mahasiswa belum memiliki data asesmen.');
  if (!a.izin_ai) fail(403, 'Mahasiswa tidak mengizinkan jawabannya dipakai fitur bantu AI. Susun ringkasan secara manual.');
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const n = (t, col) => get(`SELECT COUNT(*) AS n FROM ${t} WHERE user_id = ? AND ${col} >= ?`, studentId, since).n;
  return { ...a, trend: all('SELECT skor_total FROM assessments WHERE user_id = ? ORDER BY diisi_pada', studentId).map((x) => x.skor_total), aktivitas: `${n('journal_entries', 'tanggal')} jurnal, ${n('workbook_entries', 'tanggal')} refleksi GURU, ${n('mindfulness_logs', 'waktu')} sesi relaksasi, ${n('content_views', 'waktu')} akses konten` };
}
r.post('/ai/profile-summary', konselor, aiLimiter, aiInstLimiter, async (req, res) => {
  if (!getConfig('ai_enabled', true)) fail(503, 'Fitur AI sedang dinonaktifkan oleh institusi.');
  guardStudent(req, req.body?.student_id);
  const out = await ai.generate('profiler', aiContext(req.body.student_id));
  const id = insert('ai_requests', { requested_by: req.user.id, student_id: req.body.student_id, jenis: 'profiler', mode: out.mode, prompt_ringkas: out.prompt.slice(0, 2000), hasil: enc(out.hasil) });
  res.json({ id, mode: out.mode, hasil: out.hasil, status: 'menunggu' });
});
r.post('/ai/intervention-suggestion', konselor, aiLimiter, aiInstLimiter, async (req, res) => {
  if (!getConfig('ai_enabled', true)) fail(503, 'Fitur AI sedang dinonaktifkan oleh institusi.');
  const ap = get('SELECT * FROM appointments WHERE id = ? AND counselor_id = ?', req.body?.appointment_id, req.user.id); if (!ap) fail(404, 'Janji temu tidak ditemukan.');
  if (!COUNSELING_TOPICS.some(([t]) => t === req.body.domain)) fail(400, 'Pilih kategori masalah terlebih dahulu.');
  if (!['Ringan', 'Sedang', 'Berat'].includes(req.body.severity)) fail(400, 'Pilih tingkat keparahan terlebih dahulu.');
  const a = latestAssessment(ap.student_id, { withRecs: false });
  const out = await ai.generate('saran_intervensi', { topik: req.body.domain, dimensi: COUNSELING_TOPICS.find(([t]) => t === req.body.domain)[1], severity: req.body.severity, skor_total: a?.skor_total, kategori_total: a?.kategori_total, pelemahan: (a?.pelemahan || []).map((k) => DIMENSIONS.find((d) => d.kode === k).label) });
  const id = insert('ai_requests', { requested_by: req.user.id, student_id: ap.student_id, appointment_id: ap.id, jenis: 'saran_intervensi', mode: out.mode, prompt_ringkas: out.prompt.slice(0, 2000), hasil: enc(out.hasil) });
  res.json({ id, mode: out.mode, hasil: out.hasil, status: 'menunggu' });
});
r.post('/ai/requests/:id/review', konselor, (req, res) => {
  const q = get('SELECT * FROM ai_requests WHERE id = ? AND requested_by = ?', req.params.id, req.user.id); if (!q) fail(404, 'Draf AI tidak ditemukan.');
  if (q.status_tinjauan !== 'menunggu') fail(409, 'Draf ini sudah ditinjau.');
  const approve = req.body?.action === 'approve';
  const final = str(req.body?.teks, 5000) || dec(q.hasil);
  update('ai_requests', q.id, { status_tinjauan: approve ? 'disetujui' : 'ditolak', ditinjau_oleh: req.user.id, ditinjau_pada: nowIso(), hasil_final: approve ? enc(final) : null });
  if (approve && q.jenis === 'profiler') insert('profile_summaries', { student_id: q.student_id, ringkasan: enc(final), sumber: 'ai_ditinjau', ditulis_oleh: req.user.id });
  audit({ actor: req.user, aksi: approve ? 'setujui_draf_ai' : 'tolak_draf_ai', entitas: 'ai_requests', entitas_id: q.id, student_id: q.student_id, ip: req.ip });
  res.json({ ok: true, teks: approve ? final : null });
});

// ---- Kinerja & refleksi konselor (model GURU + rating bintang) & raport diri ----
const rpt = require('../report');
r.get('/performance/me', konselor, (req, res) => {
  const period = rpt.PERIODS[req.query.period] ? req.query.period : 'bulan';
  const p = rpt.performance(req.user.id, rpt.PERIODS[period][1]);
  res.json({ periode: period, ...p, refleksi: undefined, catatan_supervisor: all('SELECT periode, kekuatan, area_pengembangan, created_at FROM supervisor_notes WHERE counselor_id = ? ORDER BY created_at DESC', req.user.id) });
});
r.get('/reflections', konselor, (req, res) => res.json(all('SELECT * FROM counselor_reflections WHERE counselor_id = ? ORDER BY COALESCE(tanggal_kegiatan, created_at) DESC, created_at DESC', req.user.id)
  .map((x) => ({ id: x.id, created_at: x.created_at, tanggal_kegiatan: x.tanggal_kegiatan || x.created_at.slice(0, 10), jenis_layanan: x.jenis_layanan, rating: x.rating, ground: dec(x.ground), understand: dec(x.understand), revise: dec(x.revise), use: dec(x.use_) }))));
r.post('/reflections', konselor, (req, res) => {
  const b = req.body || {}; const jenis = str(b.jenis_layanan, 120); if (!jenis) fail(400, 'Tulis jenis layanan atau kegiatan.');
  if (![b.ground, b.understand, b.revise, b.use].some((x) => str(x))) fail(400, 'Isi minimal satu tahap refleksi.');
  const rating = Number(b.rating); if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5)) fail(400, 'Beri rating kinerja 1–5 bintang.');
  const tgl = /^\d{4}-\d{2}-\d{2}$/.test(b.tanggal_kegiatan || '') ? b.tanggal_kegiatan : nowIso().slice(0, 10);
  res.status(201).json({ id: insert('counselor_reflections', { counselor_id: req.user.id, jenis_layanan: jenis, tanggal_kegiatan: tgl, rating, ground: enc(str(b.ground, 4000)), understand: enc(str(b.understand, 4000)), revise: enc(str(b.revise, 4000)), use_: enc(str(b.use, 4000)) }) });
});
r.delete('/reflections/:id', konselor, (req, res) => { run('DELETE FROM counselor_reflections WHERE id = ? AND counselor_id = ?', req.params.id, req.user.id); res.json({ ok: true }); });
// Raport diri: period = kegiatan (dengan id) | minggu | bulan | semester | tahun; format = pdf | docx | xlsx
r.get('/performance/report', konselor, async (req, res) => {
  const period = req.query.period === 'kegiatan' ? 'kegiatan' : rpt.PERIODS[req.query.period] ? req.query.period : 'bulan';
  const d = rpt.reportData(req.user, { period, id: str(req.query.id, 60) });
  if (!d) fail(404, 'Refleksi kegiatan tidak ditemukan.');
  d.brand = require('../branding').brandFor(req.user.university_id);
  const name = `raport-diri-${req.user.nim_nip}-${period}-${new Date().toISOString().slice(0, 10)}`;
  audit({ actor: req.user, aksi: `unduh_raport_diri_${req.query.format}`, entitas: 'counselor_reflections', alasan: period, ip: req.ip });
  if (req.query.format === 'pdf') return rpt.toPdf(res, d, `${name}.pdf`);
  if (req.query.format === 'xlsx') { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'); res.setHeader('Content-Disposition', `attachment; filename="${name}.xlsx"`); return res.send(await rpt.toXlsx(d)); }
  if (req.query.format === 'docx') { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); res.setHeader('Content-Disposition', `attachment; filename="${name}.docx"`); return res.send(await rpt.toDocx(d)); }
  fail(400, 'Format harus pdf, docx, atau xlsx.');
});

// ================= Asesmen: jadwal, anjuran, pemantauan status, rekomendasi =================
function studentsMatching(cakupan, target, uni) {
  const rows = all("SELECT u.id, u.prodi_id, u.angkatan, p.fakultas_kode FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.role = 'mahasiswa' AND u.status = 'aktif' AND u.university_id IS ?", uni);
  return rows.filter((s) => cakupan === 'semua' || (cakupan === 'fakultas' && s.fakultas_kode === target) || (cakupan === 'prodi' && s.prodi_id === target)
    || (cakupan === 'angkatan' && String(s.angkatan) === String(target)) || (cakupan === 'individu' && s.id === target)).map((s) => s.id);
}
const CAKUPAN = ['semua', 'fakultas', 'prodi', 'angkatan', 'individu'];
function targetLabel(cakupan, target) {
  if (cakupan === 'semua') return 'Seluruh konseli';
  if (cakupan === 'fakultas') return `Fakultas ${target}`;
  if (cakupan === 'prodi') return `Prodi ${get('SELECT nama_prodi FROM prodi WHERE id = ?', target)?.nama_prodi || target}`;
  if (cakupan === 'angkatan') return `Angkatan ${target}`;
  const u = get('SELECT nama, nim_nip FROM users WHERE id = ?', target); return u ? `${u.nama} (${u.nim_nip})` : 'Individu';
}

r.get('/assessment-monitor', konselor, (req, res) => {
  const ids = scopedStudentIds(req.user);
  const items = ids.map((id) => {
    const s = get('SELECT u.*, p.nama_prodi, p.fakultas_kode FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.id = ?', id);
    const e = effectiveSchedule(id);
    const last = get('SELECT id, skor_total, kategori_total, risk_alert FROM assessments WHERE user_id = ? ORDER BY diisi_pada DESC LIMIT 1', id);
    return { id, nama: displayName(s, req.user), nim: s.nim_nip, prodi: s.nama_prodi, prodi_id: s.prodi_id, fakultas: s.fakultas_kode, angkatan: s.angkatan,
      jumlah: get('SELECT COUNT(*) AS n FROM assessments WHERE user_id = ?', id).n, terakhir: e.terakhir, interval_hari: e.interval_hari, jatuh_tempo: e.jatuh_tempo, status: e.status,
      asesmen_terakhir: last ? { id: last.id, skor_total: last.skor_total, kategori_total: last.kategori_total, segera: last.risk_alert === 'red' } : null };
  }).filter((x) => (!req.query.fakultas || x.fakultas === req.query.fakultas) && (!req.query.prodi || x.prodi_id === req.query.prodi) && (!req.query.angkatan || String(x.angkatan) === String(req.query.angkatan)));
  const count = (st) => items.filter((x) => x.status === st).length;
  res.json({ ringkasan: { total: items.length, sudah: count('sudah'), jatuh_tempo: count('jatuh_tempo'), belum: count('belum') }, items: items.sort((a, b) => ({ belum: 0, jatuh_tempo: 1, sudah: 2 }[a.status] - { belum: 0, jatuh_tempo: 1, sudah: 2 }[b.status]) || a.nama.localeCompare(b.nama)) });
});

r.get('/assessment-schedules', konselor, (req, res) => {
  res.json(all('SELECT s.*, u.nama AS oleh FROM assessment_schedules s LEFT JOIN users u ON u.id = s.dibuat_oleh WHERE s.university_id IS ? ORDER BY s.aktif DESC, s.created_at DESC', req.user.university_id)
    .map((x) => ({ ...x, aktif: !!x.aktif, target_label: targetLabel(x.cakupan, x.target), jumlah_konseli: studentsMatching(x.cakupan, x.target, req.user.university_id).length })));
});
function validTarget(req, cakupan, target) {
  if (!CAKUPAN.includes(cakupan)) fail(400, 'Pilih cakupan: seluruh konseli, fakultas, prodi, angkatan, atau individu.');
  if (cakupan === 'semua') return null;
  const t = str(target, 60); if (!t) fail(400, 'Pilih target cakupan.');
  if (cakupan === 'individu' && !canAccessStudent(req.user, t).ok) fail(403, 'Konseli berada di luar kewenangan Anda.');
  return t;
}
function broadcast(req, cakupan, target, pesan) {
  const scope = new Set(scopedStudentIds(req.user));
  const targets = studentsMatching(cakupan, target, req.user.university_id).filter((id) => scope.has(id));
  for (const id of targets) {
    insert('assessment_reminders', { user_id: id, jenis: 'anjuran', dikirim_pada: nowIso() });
    notify(id, { tipe: 'pengingat', judul: 'Anjuran konselor: isi asesmen IKDKM', isi: pesan || 'Konselor menganjurkanmu mengisi asesmen untuk memantau perkembanganmu.', tautan: '#/s/asesmen' });
  }
  return targets.length;
}
r.post('/assessment-schedules', konselor, (req, res) => {
  const b = req.body || {};
  const target = validTarget(req, b.cakupan, b.target);
  const interval = Number(b.interval_hari); if (!(interval >= 1 && interval <= 365)) fail(400, 'Rentang pengisian 1–365 hari.');
  const pesan = str(b.pesan, 300) || null;
  run('UPDATE assessment_schedules SET aktif = 0 WHERE cakupan = ? AND COALESCE(target, \'\') = ? AND university_id IS ?', b.cakupan, target || '', req.user.university_id); // satu jadwal aktif per target per kampus
  const id = insert('assessment_schedules', { cakupan: b.cakupan, target, interval_hari: interval, pesan, dibuat_oleh: req.user.id, university_id: req.user.university_id });
  const terkirim = b.kirim_sekarang ? broadcast(req, b.cakupan, target, pesan || `Konselor menganjurkan pengisian asesmen setiap ${interval} hari. Isi sekarang untuk memulai.`) : 0;
  audit({ actor: req.user, aksi: 'atur_jadwal_asesmen', entitas: 'assessment_schedules', entitas_id: id, alasan: `${targetLabel(b.cakupan, target)} · ${interval} hari`, ip: req.ip });
  res.status(201).json({ id, terkirim });
});
r.patch('/assessment-schedules/:id', konselor, (req, res) => {
  const x = get('SELECT * FROM assessment_schedules WHERE id = ? AND university_id IS ?', req.params.id, req.user.university_id); if (!x) fail(404, 'Jadwal tidak ditemukan.');
  const f = {};
  if ('aktif' in req.body) f.aktif = req.body.aktif ? 1 : 0;
  if ('interval_hari' in req.body) { const n = Number(req.body.interval_hari); if (!(n >= 1 && n <= 365)) fail(400, 'Rentang pengisian 1–365 hari.'); f.interval_hari = n; }
  if ('pesan' in req.body) f.pesan = str(req.body.pesan, 300) || null;
  update('assessment_schedules', x.id, f); res.json({ ok: true });
});
r.post('/assessment-reminders/broadcast', konselor, (req, res) => {
  const b = req.body || {};
  const target = validTarget(req, b.cakupan, b.target);
  const n = broadcast(req, b.cakupan, target, str(b.pesan, 300));
  audit({ actor: req.user, aksi: 'kirim_anjuran_asesmen', entitas: 'assessment_reminders', alasan: `${targetLabel(b.cakupan, target)} · ${n} konseli`, ip: req.ip });
  res.json({ terkirim: n });
});

r.get('/recommendation-targets', konselor, (req, res) => res.json({
  konten: (() => { const v = visibleContent(req.user.university_id); return all(`SELECT id, judul, tipe, kategori, kata_kunci FROM content_items WHERE ${v.where} ORDER BY judul`, ...v.params).map((c) => ({ ...c, kata_kunci: JSON.parse(c.kata_kunci) })); })(), // konten yang dapat diakses mahasiswa kampus ini
  komunitas: all("SELECT id, nama FROM community_groups WHERE status = 'aktif' AND university_id IS ? ORDER BY nama", req.user.university_id),
  workbook: DIMENSIONS.map((d) => ({ id: d.kode, nama: `Konten & Refleksi GURU: ${d.label}` })),
}));
r.post('/assessments/:id/recommendations', konselor, (req, res) => {
  const a = get('SELECT * FROM assessments WHERE id = ?', req.params.id); if (!a) fail(404, 'Asesmen tidak ditemukan.');
  guardStudent(req, a.user_id);
  const b = req.body || {};
  const jenisOk = ['konten', 'konseling', 'komunitas', 'workbook', 'relaksasi', 'peer', 'lainnya'];
  if (!jenisOk.includes(b.jenis)) fail(400, 'Pilih jenis rekomendasi.');
  let judul = str(b.judul, 200); let target = null;
  if (b.jenis === 'konten') { const v = visibleContent(req.user.university_id); const c = get(`SELECT id, judul FROM content_items WHERE id = ? AND ${v.where}`, b.target_id, ...v.params); if (!c) fail(400, 'Pilih konten yang sudah dipublikasikan untuk kampus Anda.'); target = c.id; judul = judul || c.judul; }
  if (b.jenis === 'komunitas') { const g = get("SELECT id, nama FROM community_groups WHERE id = ? AND status = 'aktif'", b.target_id); if (!g) fail(400, 'Pilih grup komunitas aktif.'); target = g.id; judul = judul || `Gabung grup ${g.nama}`; }
  if (b.jenis === 'workbook') { const d = DIMENSIONS.find((x) => x.kode === b.target_id); if (!d) fail(400, 'Pilih dimensi.'); target = d.kode; judul = judul || `Pelajari konten & tulis Refleksi GURU: ${d.label}`; }
  judul = judul || { konseling: 'Konseling profesional', relaksasi: 'Latihan di Ruang Relaksasi', peer: 'Ngobrol dengan peer counselor', lainnya: '' }[b.jenis];
  if (!judul) fail(400, 'Tulis rekomendasi.');
  insert('assessment_recommendations', { assessment_id: a.id, student_id: a.user_id, sumber: 'konselor', jenis: b.jenis, target_id: target, judul, alasan: str(b.alasan, 600) || null, dibuat_oleh: req.user.id, urutan: -1 });
  notify(a.user_id, { tipe: 'rekomendasi', judul: 'Konselor menambahkan rekomendasi untukmu', isi: judul, tautan: `#/s/asesmen/hasil/${a.id}` });
  audit({ actor: req.user, aksi: 'tambah_rekomendasi_asesmen', entitas: 'assessments', entitas_id: a.id, student_id: a.user_id, ip: req.ip });
  res.status(201).json(recommendationsFor(a.id));
});
r.delete('/assessment-recommendations/:id', konselor, (req, res) => {
  const x = get('SELECT * FROM assessment_recommendations WHERE id = ?', req.params.id); if (!x) fail(404, 'Rekomendasi tidak ditemukan.');
  guardStudent(req, x.student_id);
  run('DELETE FROM assessment_recommendations WHERE id = ?', x.id);
  audit({ actor: req.user, aksi: 'hapus_rekomendasi_asesmen', entitas: 'assessments', entitas_id: x.assessment_id, student_id: x.student_id, alasan: x.judul, ip: req.ip });
  res.json(recommendationsFor(x.assessment_id));
});

module.exports = r;
