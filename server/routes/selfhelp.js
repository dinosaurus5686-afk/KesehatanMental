// Aplikasi Mahasiswa: asesmen IKDKM-M, refleksi GURU per konten, jurnal, goals, relaksasi (soundscape & musik pribadi).
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { all, get, run, insert, update, nowIso, getConfig, audit } = require('../db');
const { enc, dec, DATA_DIR } = require('../security');
const { fail, requireRole, str } = require('../http');
const { validateAnswers } = require('../scoring');
const { storeAssessment, handleRisk, assessmentDetail, canAccessStudent, effectiveSchedule, displayName } = require('../services');
const ref = require('../reference');
const pdf = require('../pdf');
const { isoWeek } = require('../seed');

const r = express.Router();
const student = requireRole('mahasiswa');
const TRACK_DIR = path.join(DATA_DIR, 'uploads', 'tracks');
fs.mkdirSync(TRACK_DIR, { recursive: true });

r.get('/reference', (_req, res) => {
  res.json({
    instrument: ref.INSTRUMENT, parts: ref.PARTS, dimensions: ref.DIMENSIONS, subcomponents: ref.SUBCOMPONENTS, support: ref.SUPPORT, items: ref.ITEMS.map((it) => ({ ...it, aktif: require('../instrument').isActive(it.no) })), scale: ref.SCALE,
    instructions: ref.INSTRUCTIONS, consent: ref.CONSENT, norms: ref.NORMS, weakness: ref.WEAKNESS, quadrants: ref.QUADRANTS, kw_labels: Object.fromEntries(ref.KEYWORDS.map((k) => [k, ref.kwLabel(k)])), keywords: ref.KEYWORDS, topics: ref.COUNSELING_TOPICS,
    content_types: ref.CONTENT_TYPES, content_categories: ref.CONTENT_CATEGORIES,
    guru: ref.GURU, guru_stages: ref.GURU_STAGES, counselor_guru: ref.COUNSELOR_GURU, breathing: ref.BREATHING, journal_prompts: getConfig('journal_prompts', []), quotes: getConfig('quotes', []),
  });
});

// ---- Asesmen IKDKM-M ----
r.get('/assessments/schedule/me', student, (req, res) => res.json(effectiveSchedule(req.user.id)));

r.post('/assessments', student, (req, res) => {
  const v = validateAnswers(req.body?.answers);
  if (v.error) fail(400, v.error);
  const result = storeAssessment(req.user.id, v.data);
  if (result.risk_alert === 'red') handleRisk(req.user, result.id, 'red', { izinDihubungi: v.data.persetujuan.c });
  audit({ actor: req.user, aksi: 'asesmen_dikirim', entitas: 'assessments', entitas_id: result.id, student_id: req.user.id, ip: req.ip });
  res.status(201).json(assessmentDetail(get('SELECT * FROM assessments WHERE id = ?', result.id)));
});

r.get('/assessments/me', student, (req, res) => res.json(all('SELECT * FROM assessments WHERE user_id = ? ORDER BY diisi_pada', req.user.id).map((a) => assessmentDetail(a, { withRecs: false }))));

function readableAssessment(req) {
  const a = get('SELECT * FROM assessments WHERE id = ?', req.params.id);
  if (!a) fail(404, 'Asesmen tidak ditemukan.');
  const acc = canAccessStudent(req.user, a.user_id);
  if (!acc.ok) fail(403, 'Anda tidak berwenang melihat asesmen ini.');
  if (req.user.id !== a.user_id) audit({ actor: req.user, aksi: 'baca_asesmen', entitas: 'assessments', entitas_id: a.id, student_id: a.user_id, ip: req.ip });
  return a;
}

r.get('/assessments/:id', (req, res) => {
  const a = readableAssessment(req);
  const d = assessmentDetail(a, { konselor: req.user.role === 'konselor' });
  if (req.user.role === 'konselor') {
    d.jawaban = JSON.parse(dec(a.jawaban_enc));
    const u = get('SELECT u.*, p.nama_prodi FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.id = ?', a.user_id);
    Object.assign(d, { nama: displayName(u, req.user), nim: u.nim_nip, prodi: u.nama_prodi, angkatan: u.angkatan });
  }
  d.riwayat = all('SELECT id, diisi_pada, skor_total, kategori_total, skor_fondasi, skor_otot FROM assessments WHERE user_id = ? ORDER BY diisi_pada', a.user_id);
  res.json(d);
});

r.get('/assessments/:id/pdf', (req, res) => {
  const a = readableAssessment(req);
  const s = get('SELECT u.*, p.nama_prodi FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.id = ?', a.user_id);
  const previous = all('SELECT diisi_pada, skor_total, kategori_total, skor_fondasi, skor_otot FROM assessments WHERE user_id = ? AND diisi_pada <= ? ORDER BY diisi_pada', a.user_id, a.diisi_pada);
  audit({ actor: req.user, aksi: 'unduh_laporan_asesmen', entitas: 'assessments', entitas_id: a.id, student_id: a.user_id, ip: req.ip });
  pdf.assessmentReport(res, { student: s, prodi: s.nama_prodi, a: assessmentDetail(a, { konselor: req.user.role === 'konselor' }), previous });
});

// ---- Refleksi GURU: terintegrasi pada setiap konten psikoedukasi (internalisasi konten melalui refleksi) ----
const GURU_KEYS = ref.GURU_STAGES.map((x) => x.kode);
const guruView = (e) => {
  const c = e.content_id ? get('SELECT id, judul, tipe, kategori, thumbnail_url FROM content_items WHERE id = ?', e.content_id) : null;
  return { id: e.id, content_id: e.content_id, konten: c, dimensi: e.domain_id, jawaban: e.jawaban_json ? JSON.parse(dec(e.jawaban_json)) : null, lengkap: !!e.keluaran, tanggal: e.tanggal, updated_at: e.updated_at };
};
r.get('/guru-reflections', student, (req, res) => {
  res.json(all("SELECT * FROM workbook_entries WHERE user_id = ? AND tahap = 'guru' ORDER BY updated_at DESC", req.user.id).map(guruView));
});
r.get('/content/:id/guru', student, (req, res) => {
  const e = get("SELECT * FROM workbook_entries WHERE user_id = ? AND tahap = 'guru' AND content_id = ?", req.user.id, req.params.id);
  res.json(e ? guruView(e) : null);
});
r.put('/content/:id/guru', student, (req, res) => {
  const c = get("SELECT id, judul, kategori FROM content_items WHERE id = ? AND status = 'published'", req.params.id);
  if (!c) fail(404, 'Konten tidak ditemukan.');
  if (!get('SELECT 1 AS x FROM content_views WHERE user_id = ? AND content_id = ?', req.user.id, c.id)) fail(400, 'Pelajari kontennya terlebih dahulu sebelum menulis refleksi.');
  const j = Object.fromEntries(GURU_KEYS.map((k) => [k, str(req.body?.[k], 4000)]));
  if (!GURU_KEYS.some((k) => j[k])) fail(400, 'Tulis minimal satu tahap refleksi.');
  const lengkap = GURU_KEYS.every((k) => j[k]);
  const isi = ref.GURU_STAGES.map((st) => `${st.nama} — ${st.makna}\n→ ${j[st.kode] || '-'}`).join('\n\n');
  const f = { domain_id: c.kategori, isi_teks: enc(isi), jawaban_json: enc(JSON.stringify(j)), keluaran: lengkap ? 'Refleksi GURU lengkap' : null, konten_json: JSON.stringify([c.id]), tanggal: nowIso() };
  const ex = get("SELECT id FROM workbook_entries WHERE user_id = ? AND tahap = 'guru' AND content_id = ?", req.user.id, c.id);
  if (ex) update('workbook_entries', ex.id, f); else insert('workbook_entries', { user_id: req.user.id, tahap: 'guru', content_id: c.id, ...f });
  res.json({ ok: true, lengkap });
});

// ---- Jurnal & Goals ----
// Catatan Perkembangan Kekuatan Mental (rangkuman bulanan seluruh rekam jejak)
r.get('/progress/me', student, (req, res) => res.json(require('../progress').progressReport(req.user.id, str(req.query.bulan, 7))));
// Raport Catatan Perkembangan: PDF atau Word
r.get('/progress/me/report', student, async (req, res) => {
  const d = require('../progress').progressReport(req.user.id, str(req.query.bulan, 7));
  const s = get('SELECT u.nama, u.nim_nip, p.nama_prodi, v.nama AS kampus FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id LEFT JOIN universities v ON v.id = u.university_id WHERE u.id = ?', req.user.id);
  d.mahasiswa = { nama: s.nama, nim: s.nim_nip, prodi: s.nama_prodi, kampus: s.kampus };
  const rpt = require('../progress-report'); const name = `catatan-perkembangan-${s.nim_nip}-${d.bulan}`;
  audit({ actor: req.user, aksi: `unduh_catatan_perkembangan_${req.query.format}`, entitas: 'users', entitas_id: req.user.id, student_id: req.user.id, alasan: d.bulan, ip: req.ip });
  if (req.query.format === 'docx') { res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'); res.setHeader('Content-Disposition', `attachment; filename="${name}.docx"`); return res.send(await rpt.toDocx(d)); }
  if (req.query.format === 'pdf') return rpt.toPdf(res, d, `${name}.pdf`);
  fail(400, 'Format harus pdf atau docx.');
});
r.get('/journal-entries', student, (req, res) => {
  res.json(all('SELECT id, tanggal, mood, prompt, isi_teks, tags FROM journal_entries WHERE user_id = ? ORDER BY tanggal DESC', req.user.id).map((j) => ({ ...j, isi_teks: dec(j.isi_teks), tags: JSON.parse(j.tags) })));
});
r.post('/journal-entries', student, (req, res) => {
  const mood = str(req.body?.mood, 20); const isi = str(req.body?.isi_teks, 20000);
  if (!['senang', 'biasa', 'sedih'].includes(mood)) fail(400, 'Pilih mood terlebih dahulu.');
  if (!isi) fail(400, 'Tulis isi jurnal terlebih dahulu.');
  const tags = (Array.isArray(req.body.tags) ? req.body.tags : []).map((t) => str(t, 30)).filter(Boolean).slice(0, 8);
  const id = insert('journal_entries', { user_id: req.user.id, tanggal: nowIso(), mood, prompt: str(req.body.prompt, 300), isi_teks: enc(isi), tags: JSON.stringify(tags) });
  res.status(201).json({ id });
});

r.get('/goals', student, (req, res) => res.json({ minggu_ini: isoWeek(new Date()), goals: all('SELECT id, isi_teks, selesai, minggu_ke FROM goals WHERE user_id = ? ORDER BY minggu_ke DESC, created_at', req.user.id) }));
r.post('/goals', student, (req, res) => {
  const t = str(req.body?.isi_teks, 300);
  if (!t) fail(400, 'Tulis komitmen terlebih dahulu.');
  res.status(201).json({ id: insert('goals', { user_id: req.user.id, isi_teks: t, minggu_ke: str(req.body.minggu_ke, 10) || isoWeek(new Date()) }) });
});
const ownGoal = (req) => { const g = get('SELECT * FROM goals WHERE id = ? AND user_id = ?', req.params.id, req.user.id); if (!g) fail(404, 'Goal tidak ditemukan.'); return g; };
r.patch('/goals/:id', student, (req, res) => {
  ownGoal(req);
  const f = {};
  if ('selesai' in req.body) f.selesai = req.body.selesai ? 1 : 0;
  if ('minggu_ke' in req.body) f.minggu_ke = str(req.body.minggu_ke, 10);
  update('goals', req.params.id, f); res.json({ ok: true });
});
r.delete('/goals/:id', student, (req, res) => { ownGoal(req); run('DELETE FROM goals WHERE id = ?', req.params.id); res.json({ ok: true }); });

// ---- Relaksasi ----
r.post('/mood-checkins', student, (req, res) => {
  const mood = Number(req.body?.mood);
  if (!(mood >= 1 && mood <= 5)) fail(400, 'Pilih suasana hati terlebih dahulu.');
  res.status(201).json({ id: insert('mood_checkins', { user_id: req.user.id, waktu: nowIso(), mood, konteks_aktivitas: str(req.body.konteks_aktivitas, 80), catatan: enc(str(req.body.catatan, 2000)), motivasi_diri: enc(str(req.body.motivasi_diri, 300)) }) });
});
r.get('/mood-checkins', student, (req, res) => {
  const period = req.query.period === 'weekly' ? 'weekly' : req.query.period === 'custom' ? 'custom' : 'daily';
  const days = period === 'weekly' ? 56 : period === 'custom' ? Math.min(365, Math.max(1, Number(req.query.days) || 30)) : 7;
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const rows = all('SELECT id, waktu, mood, konteks_aktivitas, catatan, motivasi_diri FROM mood_checkins WHERE user_id = ? AND waktu >= ? ORDER BY waktu', req.user.id, since)
    .map((m) => ({ ...m, catatan: dec(m.catatan), motivasi_diri: dec(m.motivasi_diri) }));
  const buckets = new Map();
  for (const m of rows) {
    const key = period === 'weekly' ? isoWeek(new Date(m.waktu)) : m.waktu.slice(0, 10);
    const b = buckets.get(key) || []; b.push(m.mood); buckets.set(key, b);
  }
  res.json({ period, series: [...buckets].map(([label, v]) => ({ label, value: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10, n: v.length })), entries: rows.slice(-20).reverse() });
});
r.post('/mindfulness-logs', student, (req, res) => {
  const jenis = str(req.body?.jenis_aktivitas, 80); const durasi = Math.round(Number(req.body?.durasi_detik));
  if (!jenis || !(durasi > 0 && durasi < 6 * 3600)) fail(400, 'Data aktivitas tidak valid.');
  res.status(201).json({ id: insert('mindfulness_logs', { user_id: req.user.id, jenis_aktivitas: jenis, durasi_detik: durasi, waktu: nowIso() }) });
});
r.get('/mindfulness-logs', student, (req, res) => res.json(all('SELECT jenis_aktivitas, durasi_detik, waktu FROM mindfulness_logs WHERE user_id = ? ORDER BY waktu DESC LIMIT 50', req.user.id)));


// ---- Musik pribadi di Ruang Relaksasi: maksimal 3 lagu (unggah MP3 atau tempel tautan), dapat diganti ----
const trackView = (t) => ({ id: t.id, slot: t.slot, judul: t.judul, tipe: t.tipe, url: t.url, updated_at: t.updated_at });
r.get('/tracks', student, (req, res) => res.json(all('SELECT * FROM user_tracks WHERE user_id = ? ORDER BY slot', req.user.id).map(trackView)));
function replaceSlot(userId, slot, row) {
  const old = get('SELECT * FROM user_tracks WHERE user_id = ? AND slot = ?', userId, slot);
  if (old?.path) fs.rmSync(path.join(TRACK_DIR, old.path), { force: true });
  if (old) run('DELETE FROM user_tracks WHERE id = ?', old.id);
  return insert('user_tracks', { user_id: userId, slot, ...row });
}
const slotOf = (v) => { const n = Number(v); if (![1, 2, 3].includes(n)) fail(400, 'Pilih slot lagu 1, 2, atau 3.'); return n; };
r.put('/tracks/:slot/link', student, (req, res) => {
  const slot = slotOf(req.params.slot);
  const url = str(req.body?.url, 500); const judul = str(req.body?.judul, 100) || 'Lagu dari tautan';
  if (!/^https:\/\//.test(url)) fail(400, 'Tautan harus diawali https://');
  res.json(trackView(get('SELECT * FROM user_tracks WHERE id = ?', replaceSlot(req.user.id, slot, { judul, tipe: 'tautan', url }))));
});
r.put('/tracks/:slot/file', student, express.raw({ type: ['audio/mpeg', 'audio/mp3'], limit: '15mb' }), (req, res) => {
  const slot = slotOf(req.params.slot);
  if (!Buffer.isBuffer(req.body) || !req.body.length) fail(400, 'Unggah berkas MP3 (maks. 15 MB).');
  const head = req.body.subarray(0, 3).toString('latin1');
  if (!(head === 'ID3' || (req.body[0] === 0xff && (req.body[1] & 0xe0) === 0xe0))) fail(400, 'Berkas bukan MP3 yang valid.');
  const file = crypto.randomUUID() + '.mp3';
  fs.writeFileSync(path.join(TRACK_DIR, file), req.body);
  const judul = str(decodeURIComponent(req.headers['x-filename'] || 'Lagu saya'), 100).replace(/\.mp3$/i, '');
  res.json(trackView(get('SELECT * FROM user_tracks WHERE id = ?', replaceSlot(req.user.id, slot, { judul, tipe: 'berkas', url: `/media/tracks/${file}`, path: file }))));
});
r.delete('/tracks/:slot', student, (req, res) => {
  const t = get('SELECT * FROM user_tracks WHERE user_id = ? AND slot = ?', req.user.id, slotOf(req.params.slot));
  if (t?.path) fs.rmSync(path.join(TRACK_DIR, t.path), { force: true });
  if (t) run('DELETE FROM user_tracks WHERE id = ?', t.id);
  res.json({ ok: true });
});

module.exports = r;
