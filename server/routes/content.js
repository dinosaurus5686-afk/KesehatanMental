// Ruang Psikoedukasi (konten bertumbnail + kata kunci butir), Komunitas (grup, diskusi, moderasi) & Peer Counselor.
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { all, get, run, insert, update, audit, nowIso } = require('../db');
const { DATA_DIR } = require('../security');
const { fail, requireRole, str } = require('../http');
const { latestAssessment, isOnline, scopedStudentIds, notify, activePeer, displayName, visibleContent } = require('../services');
const { CONTENT_TYPES, CONTENT_CATEGORIES, KEYWORDS, ITEMS, DIMENSIONS } = require('../reference');
const campus = require('../campus');

const r = express.Router();
const konselor = requireRole('konselor');
const creator = requireRole('konselor', 'admin'); // admin memproduksi pustaka; konselor membuat konten kampusnya
const admin = requireRole('admin');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const CAT_CODES = CONTENT_CATEGORIES.map((c) => c.kode);
const kwLower = new Map(KEYWORDS.map((k) => [k.toLowerCase(), k]));

const contentView = (c, extra = {}) => ({
  id: c.id, judul: c.judul, tipe: c.tipe, kategori: c.kategori, durasi_atau_halaman: c.durasi_atau_halaman, status: c.status, thumbnail_url: c.thumbnail_url,
  url_media: c.url_media, ringkasan: c.ringkasan, kata_kunci: JSON.parse(c.kata_kunci || '[]'), jumlah_tayang: c.jumlah_tayang, updated_at: c.updated_at, sumber: c.sumber, ...extra,
});
// Ringkasan pemakaian konten pustaka admin oleh konselor (lintas kampus) dan status pemakaian oleh konselor yang sedang melihat
function adoptionInfo(c, viewer) {
  const rows = all("SELECT a.*, u.nama, un.nama AS kampus FROM content_adoptions a JOIN users u ON u.id = a.counselor_id LEFT JOIN universities un ON un.id = a.university_id WHERE a.content_id = ? ORDER BY a.updated_at DESC", c.id);
  const rated = rows.filter((x) => x.rating);
  const mine = viewer.role === 'konselor' ? rows.find((x) => x.counselor_id === viewer.id) : null;
  return {
    dipakai_konselor: rows.filter((x) => x.status === 'published').length, dipakai_kampus: new Set(rows.filter((x) => x.status === 'published').map((x) => x.university_id)).size,
    rating_rata: rated.length ? Math.round((rated.reduce((a, x) => a + x.rating, 0) / rated.length) * 10) / 10 : null, jumlah_ulasan: rows.filter((x) => x.ulasan).length,
    ulasan: rows.filter((x) => x.ulasan).slice(0, 6).map((x) => ({ nama: x.nama, kampus: x.kampus, rating: x.rating, ulasan: x.ulasan, pada: x.updated_at })),
    dipakai_kampus_saya: viewer.role === 'konselor' ? !!rows.find((x) => x.university_id === viewer.university_id && x.status === 'published') : undefined,
    pemakaian_saya: mine ? { status: mine.status, rating: mine.rating, ulasan: mine.ulasan } : null,
  };
}
// Hak lihat/ubah per peran: mahasiswa → konten kampusnya yang terbit; konselor → pustaka admin yang terbit + konten konselor kampusnya; admin → pustaka admin
function canSee(user, c) {
  if (user.role === 'mahasiswa') return !!get(`SELECT 1 AS x FROM content_items WHERE id = ? AND ${visibleContent(user.university_id).where}`, c.id, ...visibleContent(user.university_id).params);
  if (user.role === 'konselor') return (c.sumber === 'admin' && c.status === 'published') || (c.sumber === 'konselor' && c.university_id === user.university_id);
  if (user.role === 'admin') return c.sumber === 'admin';
  return false;
}
const canEdit = (user, c) => (user.role === 'admin' ? c.sumber === 'admin' : user.role === 'konselor' && c.sumber === 'konselor' && c.university_id === user.university_id);

// ================= Psikoedukasi =================
r.get('/content', (req, res) => {
  const isStudent = req.user.role === 'mahasiswa';
  const where = []; const p = [];
  if (isStudent) { const v = visibleContent(req.user.university_id); where.push(v.where); p.push(...v.params); }
  else if (req.user.role === 'konselor' && req.query.sumber === 'admin') where.push("sumber = 'admin' AND status = 'published'"); // pustaka admin untuk ditinjau & dipakai
  else if (req.user.role === 'konselor') { where.push("sumber = 'konselor' AND university_id = ?"); p.push(req.user.university_id); } // konten buatan konselor kampus
  else if (req.user.role === 'admin') where.push("sumber = 'admin'");
  else fail(403, 'Anda tidak memiliki akses ke konten.');
  if (!isStudent && req.query.status) { where.push('status = ?'); p.push(req.query.status); }
  if (CONTENT_TYPES[req.query.type]) { where.push('tipe = ?'); p.push(req.query.type); }
  if (CAT_CODES.includes(req.query.kategori)) { where.push('kategori = ?'); p.push(req.query.kategori); }
  const q = str(req.query.q, 80);
  if (q) { where.push('(judul LIKE ? OR ringkasan LIKE ? OR kata_kunci LIKE ?)'); p.push(`%${q}%`, `%${q}%`, `%${q}%`); insert('search_logs', { kata_kunci: q.toLowerCase(), user_role: req.user.role }); }
  const kw = str(req.query.kata_kunci, 80);
  if (kw) { where.push('kata_kunci LIKE ?'); p.push(`%"${kw}"%`); }
  const rows = all(`SELECT * FROM content_items ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`, ...p);
  let saran = new Map();
  if (isStudent) {
    const a = latestAssessment(req.user.id);
    for (const rec of a?.rekomendasi || []) if (rec.jenis === 'konten') saran.set(rec.target_id, rec.sumber === 'konselor' ? 'Disarankan konselor' : rec.alasan);
  }
  const viewed = isStudent ? new Set(all('SELECT DISTINCT content_id FROM content_views WHERE user_id = ?', req.user.id).map((x) => x.content_id)) : new Set();
  const withAdopt = !isStudent && (req.user.role === 'admin' || req.query.sumber === 'admin');
  const out = rows.map((c) => contentView(c, { disarankan: saran.has(c.id), alasan_saran: saran.get(c.id) || null, sudah_dibuka: viewed.has(c.id), ...(withAdopt ? { pemakaian: adoptionInfo(c, req.user) } : {}), pembuat: !isStudent ? get('SELECT nama FROM users WHERE id = ?', c.dibuat_oleh)?.nama : undefined }));
  if (isStudent) out.sort((a, b) => b.disarankan - a.disarankan);
  res.json({ items: out });
});

r.get('/content/:id', (req, res) => {
  const c = get('SELECT * FROM content_items WHERE id = ?', req.params.id);
  if (!c || !canSee(req.user, c)) fail(404, 'Konten tidak ditemukan atau sudah tidak aktif.');
  let viewId = null;
  if (req.user.role === 'mahasiswa') {
    run('UPDATE content_items SET jumlah_tayang = jumlah_tayang + 1 WHERE id = ?', c.id);
    viewId = insert('content_views', { user_id: req.user.id, content_id: c.id, waktu: nowIso() });
  }
  res.json({ ...contentView(c), isi: c.isi, view_id: viewId, ...(req.user.role !== 'mahasiswa' && c.sumber === 'admin' ? { pemakaian: adoptionInfo(c, req.user) } : {}), bisa_diubah: canEdit(req.user, c) });
});

// Durasi membuka konten (detik, dihitung hanya saat halaman terlihat) dikirim berkala oleh aplikasi mahasiswa
r.patch('/content-views/:id', requireRole('mahasiswa'), (req, res) => {
  const d = Math.round(Number(req.body?.detik));
  if (!(d >= 0)) fail(400, 'Durasi tidak valid.');
  run('UPDATE content_views SET durasi_detik = MAX(COALESCE(durasi_detik, 0), ?) WHERE id = ? AND user_id = ?', Math.min(d, 4 * 3600), req.params.id, req.user.id);
  res.json({ ok: true });
});

function contentFields(b, creating) {
  const f = {};
  if ('judul' in b) { f.judul = str(b.judul, 200); if (!f.judul) fail(400, 'Judul wajib diisi.'); }
  if ('tipe' in b) { if (!CONTENT_TYPES[b.tipe]) fail(400, 'Format konten tidak valid.'); f.tipe = b.tipe; }
  if ('kategori' in b) { if (!CAT_CODES.includes(b.kategori)) fail(400, 'Kategori tidak valid.'); f.kategori = b.kategori; }
  if ('durasi_atau_halaman' in b) f.durasi_atau_halaman = str(b.durasi_atau_halaman, 60);
  if ('status' in b) { if (!['draft', 'published', 'nonaktif'].includes(b.status)) fail(400, 'Status tidak valid.'); f.status = b.status; }
  const urlOk = (u) => !u || /^(https:\/\/|\/media\/|\/thumbs\/)/.test(u);
  if ('url_media' in b) { const u = str(b.url_media, 500); if (!urlOk(u)) fail(400, 'Tautan media harus diawali https:// atau berasal dari unggahan.'); f.url_media = u || null; }
  if ('thumbnail_url' in b) { const u = str(b.thumbnail_url, 500); if (!urlOk(u)) fail(400, 'Thumbnail harus berupa unggahan atau tautan https://'); f.thumbnail_url = u || null; }
  if ('ringkasan' in b) f.ringkasan = str(b.ringkasan, 400);
  if ('isi' in b) f.isi = str(b.isi, 50000);
  if ('kata_kunci' in b) {
    const list = (Array.isArray(b.kata_kunci) ? b.kata_kunci : []).map((k) => kwLower.get(String(k).toLowerCase()) || str(k, 60)).filter(Boolean);
    f.kata_kunci = JSON.stringify([...new Set(list)].slice(0, 12));
  }
  const final = { ...creating, ...f };
  const publishing = (final.status || 'draft') === 'published';
  if (publishing) {
    if (!final.thumbnail_url) fail(400, 'Konten yang dipublikasikan wajib memiliki thumbnail.');
    if (!final.ringkasan) fail(400, 'Konten yang dipublikasikan wajib memiliki deskripsi singkat.');
    if (!JSON.parse(final.kata_kunci || '[]').length) fail(400, 'Pilih minimal satu kata kunci (disarikan dari butir asesmen).');
  }
  if (publishing && creating.status !== 'published') f.diterbitkan_pada = nowIso();
  return f;
}

r.post('/content', creator, (req, res) => {
  const f = contentFields({ status: 'draft', kategori: 'UMUM', ...req.body }, {});
  if (!f.judul || !f.tipe) fail(400, 'Judul dan format wajib diisi.');
  const own = req.user.role === 'admin' ? { sumber: 'admin', university_id: null } : { sumber: 'konselor', university_id: req.user.university_id };
  const id = insert('content_items', { ...f, ...own, dibuat_oleh: req.user.id });
  audit({ actor: req.user, aksi: 'konten_dibuat', entitas: 'content_items', entitas_id: id, alasan: own.sumber, ip: req.ip });
  if (own.sumber === 'admin' && f.status === 'published') announceLibrary(id, f.judul);
  if (own.sumber === 'konselor' && f.status === 'published') announceToStudents(id);
  res.status(201).json({ id });
});
// Notifikasi konten baru ke mahasiswa yang dapat melihatnya (sekali per konten per mahasiswa):
// konten konselor → seluruh mahasiswa kampusnya; konten pustaka admin → mahasiswa kampus yang konselornya memakai konten itu.
function announceToStudents(contentId, universityIds = null) {
  const c = get("SELECT * FROM content_items WHERE id = ? AND status = 'published'", contentId); if (!c) return 0;
  const kampus = universityIds || (c.sumber === 'konselor' ? [c.university_id] : all("SELECT DISTINCT university_id FROM content_adoptions WHERE content_id = ? AND status = 'published'", c.id).map((x) => x.university_id));
  const tautan = `#/s/psikoedukasi/konten/${c.id}`;
  const sudah = new Set(all("SELECT user_id FROM notifications WHERE tipe = 'konten_baru' AND tautan = ?", tautan).map((x) => x.user_id));
  const pembuat = c.sumber === 'konselor' ? get('SELECT nama FROM users WHERE id = ?', c.dibuat_oleh)?.nama : null;
  const binaan = pembuat ? new Set(all('SELECT student_id FROM student_counselors WHERE counselor_id = ?', c.dibuat_oleh).map((x) => x.student_id)) : new Set();
  let n = 0;
  for (const u of kampus.filter(Boolean)) {
    for (const s of all("SELECT id FROM users WHERE role = 'mahasiswa' AND status = 'aktif' AND university_id = ?", u)) {
      if (sudah.has(s.id)) continue;
      notify(s.id, { tipe: 'konten_baru', judul: binaan.has(s.id) ? `Konten baru dari konselormu, ${pembuat}` : 'Konten psikoedukasi baru', isi: `${CONTENT_TYPES[c.tipe] || c.tipe}: ${c.judul}`, tautan });
      n++;
    }
  }
  return n;
}
// Konten pustaka admin yang baru terbit diberitahukan ke seluruh konselor untuk ditinjau
function announceLibrary(id, judul) {
  for (const c of all("SELECT id FROM users WHERE role = 'konselor' AND status = 'aktif'")) notify(c.id, { tipe: 'konten', judul: 'Konten psikoedukasi baru dari admin', isi: `${judul} — tinjau dan pilih untuk dipublikasikan ke mahasiswa kampus Anda.`, tautan: '#/c/konten' });
}
r.patch('/content/:id', creator, (req, res) => {
  const cur = get('SELECT * FROM content_items WHERE id = ?', req.params.id);
  if (!cur || !canEdit(req.user, cur)) fail(404, 'Konten tidak ditemukan atau bukan milik Anda.');
  update('content_items', cur.id, contentFields(req.body || {}, cur));
  audit({ actor: req.user, aksi: 'konten_diubah', entitas: 'content_items', entitas_id: cur.id, alasan: req.body?.status ? `status: ${req.body.status}` : null, ip: req.ip });
  if (cur.sumber === 'admin' && cur.status !== 'published' && req.body?.status === 'published') announceLibrary(cur.id, req.body.judul || cur.judul);
  if (cur.sumber === 'konselor' && cur.status !== 'published' && req.body?.status === 'published') announceToStudents(cur.id);
  res.json({ ok: true });
});
r.delete('/content/:id', creator, (req, res) => {
  const cur = get('SELECT * FROM content_items WHERE id = ?', req.params.id);
  if (!cur || !canEdit(req.user, cur)) fail(404, 'Konten tidak ditemukan atau bukan milik Anda.');
  run('DELETE FROM content_items WHERE id = ?', cur.id);
  audit({ actor: req.user, aksi: 'konten_dihapus', entitas: 'content_items', entitas_id: req.params.id, ip: req.ip });
  res.json({ ok: true });
});

r.get('/content-stats', konselor, (req, res) => {
  const ids = scopedStudentIds(req.user);
  // Kebutuhan per kata kunci: dari butir pemicu (unfavorable SS/S, favorable TS/STS) pada asesmen terbaru mahasiswa dalam kewenangan
  const kwNeed = new Map();
  for (const sid of ids) {
    const a = get('SELECT hasil_json FROM assessments WHERE user_id = ? ORDER BY diisi_pada DESC LIMIT 1', sid);
    if (!a) continue;
    const { ITEMS } = require('../reference');
    for (const b of JSON.parse(a.hasil_json).butir_pemicu || []) for (const k of ITEMS.find((x) => x.no === b.no).kata_kunci) kwNeed.set(k, (kwNeed.get(k) || 0) + 1);
  }
  const v = visibleContent(req.user.university_id);
  const published = all(`SELECT kata_kunci FROM content_items WHERE ${v.where}`, ...v.params).flatMap((c) => JSON.parse(c.kata_kunci || '[]').map((k) => k.toLowerCase()));
  const gaps = [...kwNeed].map(([k, n]) => ({ kata_kunci: k, mahasiswa: n, konten_tersedia: published.filter((x) => x === k.toLowerCase()).length })).sort((a, b) => (b.mahasiswa - a.mahasiswa) || (a.konten_tersedia - b.konten_tersedia));
  res.json({
    kebutuhan_kata_kunci: gaps.slice(0, 12),
    paling_ditonton: all(`SELECT id, judul, tipe, jumlah_tayang FROM content_items WHERE ${v.where} ORDER BY jumlah_tayang DESC LIMIT 5`, ...v.params),
    paling_dicari: all('SELECT kata_kunci, COUNT(*) AS n FROM search_logs GROUP BY kata_kunci ORDER BY n DESC LIMIT 8'),
    pustaka_baru: get("SELECT COUNT(*) AS n FROM content_items c WHERE c.sumber = 'admin' AND c.status = 'published' AND NOT EXISTS (SELECT 1 FROM content_adoptions a WHERE a.content_id = c.id AND a.counselor_id = ?)", req.user.id).n,
    total_mahasiswa: ids.length,
  });
});

// Unggah berkas (thumbnail, media) ke penyimpanan objek lokal
const ALLOWED = { 'application/pdf': '.pdf', 'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'video/mp4': '.mp4', 'video/webm': '.webm', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx' };
// Batas 150 MB; berkas dialirkan langsung ke disk (tidak ditampung di memori)
const MAX_UPLOAD = 150 * 1024 * 1024;
r.post('/uploads', creator, (req, res, next) => {
  const mime = (req.headers['content-type'] || '').split(';')[0];
  if (!ALLOWED[mime]) fail(400, 'Jenis berkas tidak didukung. Gunakan gambar (PNG/JPG/WEBP/GIF), PDF, PPTX, MP3, OGG, MP4, atau WEBM.');
  if (Number(req.headers['content-length'] || 0) > MAX_UPLOAD) fail(413, 'Ukuran berkas maksimal 150 MB.');
  const id = crypto.randomUUID(); const file = id + ALLOWED[mime]; const dest = path.join(UPLOAD_DIR, file);
  const out = fs.createWriteStream(dest); let size = 0; let stopped = false;
  const stop = (code, msg) => { if (stopped) return; stopped = true; req.unpipe(out); out.destroy(); fs.rm(dest, { force: true }, () => {}); if (!res.headersSent) res.status(code).json({ error: msg }); req.resume(); };
  req.on('data', (chunk) => { size += chunk.length; if (size > MAX_UPLOAD) stop(413, 'Ukuran berkas maksimal 150 MB.'); });
  req.on('aborted', () => stop(400, 'Unggahan terputus.'));
  out.on('error', (e) => { stop(500, 'Gagal menyimpan berkas.'); next(e); });
  out.on('finish', () => {
    if (stopped) return;
    if (!size) { fs.rm(dest, { force: true }, () => {}); return res.status(400).json({ error: 'Berkas kosong.' }); }
    insert('uploads', { id, nama_berkas: str(decodeURIComponent(req.headers['x-filename'] || 'berkas'), 200), mime, ukuran: size, path: file, diunggah_oleh: req.user.id });
    res.status(201).json({ url: `/media/${file}` });
  });
  req.pipe(out);
});

// ---- Konselor meninjau & memakai konten pustaka admin untuk dipublikasikan ke mahasiswa kampusnya ----
r.put('/content/:id/adopt', konselor, (req, res) => {
  const c = get("SELECT * FROM content_items WHERE id = ? AND sumber = 'admin' AND status = 'published'", req.params.id);
  if (!c) fail(404, 'Konten pustaka tidak ditemukan.');
  const b = req.body || {}; const f = {};
  if ('status' in b) { if (!['published', 'nonaktif'].includes(b.status)) fail(400, 'Status tidak valid.'); f.status = b.status; }
  if ('rating' in b) { const n = Number(b.rating); if (b.rating !== null && !(n >= 1 && n <= 5)) fail(400, 'Rating 1–5 bintang.'); f.rating = b.rating === null ? null : n; }
  if ('ulasan' in b) f.ulasan = str(b.ulasan, 1000) || null;
  const ex = get('SELECT * FROM content_adoptions WHERE content_id = ? AND counselor_id = ?', c.id, req.user.id);
  if (ex) update('content_adoptions', ex.id, f);
  else insert('content_adoptions', { content_id: c.id, counselor_id: req.user.id, university_id: req.user.university_id, status: f.status || 'nonaktif', rating: f.rating ?? null, ulasan: f.ulasan ?? null });
  if (f.status === 'published') announceToStudents(c.id, [req.user.university_id]);
  audit({ actor: req.user, aksi: f.status === 'published' ? 'pakai_konten_pustaka' : f.status === 'nonaktif' ? 'lepas_konten_pustaka' : 'ulas_konten_pustaka', entitas: 'content_items', entitas_id: c.id, ip: req.ip });
  res.json(adoptionInfo(c, req.user));
});

// ---- Admin: kebutuhan konten berdasarkan hasil asesmen seluruh mahasiswa terdaftar (per butir pemicu) ----
function computeNeeds(uni) {
  const latest = all(`SELECT a.hasil_json FROM assessments a JOIN users u ON u.id = a.user_id WHERE u.role = 'mahasiswa' AND u.status = 'aktif' ${uni ? 'AND u.university_id = ?' : ''}
    AND a.diisi_pada = (SELECT MAX(x.diisi_pada) FROM assessments x WHERE x.user_id = a.user_id)`, ...(uni ? [uni] : []));
  const n = latest.length;
  const hit = new Map(); const dimWeak = new Map();
  for (const row of latest) {
    const h = JSON.parse(row.hasil_json);
    for (const b of h.butir_pemicu || []) hit.set(b.no, (hit.get(b.no) || 0) + 1);
    for (const k of h.pelemahan || []) dimWeak.set(k, (dimWeak.get(k) || 0) + 1);
  }
  const lib = all("SELECT id, judul, status, kata_kunci, tipe, sumber FROM content_items WHERE sumber = 'admin'").map((c) => ({ ...c, kk: JSON.parse(c.kata_kunci || '[]').map((k) => k.toLowerCase()) }));
  const status = new Map(all('SELECT * FROM content_needs').map((x) => [x.kunci, x]));
  const items = ITEMS.filter((it) => it.bagian < 3).map((it) => {
    const kws = it.kata_kunci.map((k) => k.toLowerCase());
    const st = status.get(`butir:${it.no}`);
    const cocok = lib.filter((c) => c.kk.some((k) => kws.includes(k)) || c.id === st?.content_id);
    const d = DIMENSIONS.find((x) => x.kode === it.dimensi);
    return { kunci: `butir:${it.no}`, no: it.no, dimensi: it.dimensi, dimensi_nama: d?.mudah || d?.nama, aspek: it.indikator, pernyataan: it.teks, kata_kunci: it.kata_kunci,
      mahasiswa: hit.get(it.no) || 0, persen: n ? Math.round(((hit.get(it.no) || 0) / n) * 1000) / 10 : 0,
      konten_cocok: cocok.map((c) => ({ id: c.id, judul: c.judul, status: c.status, tipe: c.tipe })),
      sudah_dibuat: cocok.length > 0, sudah_terbit: cocok.some((c) => c.status === 'published'),
      selesai: !!st?.selesai, content_id: st?.content_id || null, catatan: st?.catatan || null, ditandai_pada: st?.ditandai_pada || null, ditandai_oleh: st?.ditandai_oleh ? get('SELECT nama FROM users WHERE id = ?', st.ditandai_oleh)?.nama : null };
  });
  return { jumlah_mahasiswa: n, universitas: uni ? campus.universityName(uni) : null, kebutuhan: items,
    dimensi: DIMENSIONS.map((d) => ({ kode: d.kode, nama: d.mudah || d.nama, melemah: dimWeak.get(d.kode) || 0, persen: n ? Math.round(((dimWeak.get(d.kode) || 0) / n) * 1000) / 10 : 0 })) };
}
r.get('/admin/content-needs', admin, (req, res) => {
  const out = computeNeeds(str(req.query.universitas, 12) || null);
  out.kebutuhan.sort((a, b) => (a.selesai - b.selesai) || (b.mahasiswa - a.mahasiswa));
  res.json(out);
});

// ---- Admin: analisis konten psikoedukasi ----
// 7 kebutuhan teratas (+ ceklis dibuat/terbit), 5 konten terpopuler per jenis, jenis media paling disukai, dan keterlibatan
// (count, frekuensi, latensi, durasi, inter-response time) dari rekam akses mahasiswa.
const H = 3600000;
const r1 = (x) => (x === null || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);
const avgOf = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const medOf = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
r.get('/admin/content-analytics', admin, (req, res) => {
  const uni = str(req.query.universitas, 12) || null; const sumber = ['admin', 'konselor'].includes(req.query.sumber) ? req.query.sumber : null;
  const dari = /^\d{4}-\d{2}-\d{2}$/.test(req.query.dari || '') ? req.query.dari : null; const sampai = /^\d{4}-\d{2}-\d{2}$/.test(req.query.sampai || '') ? req.query.sampai : null;
  const w = ["u.role = 'mahasiswa'"]; const p = [];
  if (uni) { w.push('u.university_id = ?'); p.push(uni); }
  if (sumber) { w.push('c.sumber = ?'); p.push(sumber); }
  if (dari) { w.push('v.waktu >= ?'); p.push(new Date(Date.parse(dari + 'T00:00:00Z') - 7 * H).toISOString()); }
  if (sampai) { w.push('v.waktu < ?'); p.push(new Date(Date.parse(sampai + 'T00:00:00Z') - 7 * H + 24 * H).toISOString()); }
  const views = all(`SELECT v.user_id, v.content_id, v.waktu, v.durasi_detik, c.tipe, c.judul, c.sumber, COALESCE(c.diterbitkan_pada, c.created_at) AS terbit
    FROM content_views v JOIN content_items c ON c.id = v.content_id JOIN users u ON u.id = v.user_id WHERE ${w.join(' AND ')} ORDER BY v.waktu`, ...p);
  const contents = all(`SELECT id, judul, tipe, sumber, kategori, thumbnail_url, COALESCE(diterbitkan_pada, created_at) AS terbit FROM content_items WHERE status = 'published' ${sumber ? 'AND sumber = ?' : ''} ${uni ? "AND (sumber = 'admin' OR university_id = ?)" : ''}`, ...[sumber, uni].filter(Boolean));
  const guru = new Map(all(`SELECT content_id, COUNT(*) AS n FROM workbook_entries w JOIN users u ON u.id = w.user_id WHERE w.tahap = 'guru' AND w.content_id IS NOT NULL ${uni ? 'AND u.university_id = ?' : ''} GROUP BY content_id`, ...(uni ? [uni] : [])).map((x) => [x.content_id, x.n]));
  const rating = new Map(all('SELECT content_id, AVG(rating) AS r, COUNT(rating) AS n FROM content_adoptions WHERE rating IS NOT NULL GROUP BY content_id').map((x) => [x.content_id, x]));
  const byContent = new Map(); for (const v of views) { if (!byContent.has(v.content_id)) byContent.set(v.content_id, []); byContent.get(v.content_id).push(v); }
  const stat = (c) => { const vs = byContent.get(c.id) || []; const dur = vs.map((v) => v.durasi_detik).filter((x) => x > 0);
    return { id: c.id, judul: c.judul, tipe: c.tipe, sumber: c.sumber, thumbnail_url: c.thumbnail_url, dilihat: vs.length, pembaca: new Set(vs.map((v) => v.user_id)).size, durasi_rata: r1(avgOf(dur)), refleksi_guru: guru.get(c.id) || 0, rating: rating.get(c.id) ? r1(rating.get(c.id).r) : null }; };
  const all_ = contents.map(stat);
  const types = Object.keys(CONTENT_TYPES);
  const populer = types.map((t) => ({ tipe: t, label: CONTENT_TYPES[t], konten: all_.filter((c) => c.tipe === t && c.dilihat > 0).sort((a, b) => (b.pembaca - a.pembaca) || (b.dilihat - a.dilihat)).slice(0, 5), jumlah_terbit: all_.filter((c) => c.tipe === t).length }));
  const media = types.map((t) => {
    const cs = all_.filter((c) => c.tipe === t); const vs = views.filter((v) => v.tipe === t); const pembaca = new Set(vs.map((v) => v.user_id)).size;
    const dur = vs.map((v) => v.durasi_detik).filter((x) => x > 0); const g = cs.reduce((s, c) => s + c.refleksi_guru, 0); const rt = cs.filter((c) => c.rating !== null);
    return { tipe: t, label: CONTENT_TYPES[t], konten: cs.length, dilihat: vs.length, pembaca, dilihat_per_konten: cs.length ? r1(vs.length / cs.length) : null, durasi_rata: r1(avgOf(dur)), durasi_median: r1(medOf(dur)),
      refleksi_guru: g, tingkat_refleksi: pembaca ? r1((g / pembaca) * 100) : null, rating_konselor: rt.length ? r1(avgOf(rt.map((c) => c.rating))) : null };
  });
  const totalPembaca = new Set(views.map((v) => v.user_id)).size;
  for (const m of media) m.persen_pembaca = totalPembaca ? r1((m.pembaca / totalPembaca) * 100) : 0;
  const ranking = [...media].filter((m) => m.dilihat).sort((a, b) => (b.pembaca - a.pembaca) || (b.dilihat - a.dilihat));
  // ---- keterlibatan ----
  const perUser = new Map(); for (const v of views) { if (!perUser.has(v.user_id)) perUser.set(v.user_id, []); perUser.get(v.user_id).push(v); }
  const counts = [...perUser.values()].map((x) => x.length);
  const irt = []; for (const vs of perUser.values()) for (let i = 1; i < vs.length; i++) irt.push((Date.parse(vs[i].waktu) - Date.parse(vs[i - 1].waktu)) / H);
  const firstSeen = new Map(); for (const v of views) { const k = `${v.user_id}|${v.content_id}`; if (!firstSeen.has(k)) firstSeen.set(k, v.waktu); }
  const latTerbit = [...byContent.entries()].map(([cid, vs]) => (Date.parse(vs[0].waktu) - Date.parse(vs[0].terbit)) / H).filter((x) => x >= 0);
  const recs = all(`SELECT r.student_id, r.target_id, r.created_at FROM assessment_recommendations r JOIN users u ON u.id = r.student_id WHERE r.jenis = 'konten' AND r.target_id IS NOT NULL ${uni ? 'AND u.university_id = ?' : ''}`, ...(uni ? [uni] : []));
  const latRec = []; let recOpened = 0; let recWeek = 0;
  for (const rc of recs) { const f = all('SELECT MIN(waktu) AS t FROM content_views WHERE user_id = ? AND content_id = ? AND waktu >= ?', rc.student_id, rc.target_id, rc.created_at)[0]?.t; if (f) { const h = (Date.parse(f) - Date.parse(rc.created_at)) / H; latRec.push(h); recOpened++; if (h <= 24 * 7) recWeek++; } }
  const dur = views.map((v) => v.durasi_detik).filter((x) => x > 0);
  const weeks = []; const now = Date.now(); for (let i = 7; i >= 0; i--) { const end = now - i * 7 * 24 * H; const start = end - 7 * 24 * H; const vs = views.filter((v) => { const t = Date.parse(v.waktu); return t >= start && t < end; }); weeks.push({ minggu: new Date(start + 7 * H).toISOString().slice(0, 10), dilihat: vs.length, pembaca: new Set(vs.map((v) => v.user_id)).size }); }
  const bucket = (arr, cuts) => cuts.map(([label, lo, hi]) => ({ label, jumlah: arr.filter((x) => x >= lo && x < hi).length }));
  const needs = computeNeeds(uni);
  const top7 = [...needs.kebutuhan].filter((x) => x.mahasiswa > 0).sort((a, b) => b.mahasiswa - a.mahasiswa).slice(0, 7);
  res.json({
    universitas: uni ? campus.universityName(uni) : null, jumlah_mahasiswa_asesmen: needs.jumlah_mahasiswa,
    kebutuhan_top7: top7, populer, media, media_favorit: ranking[0]?.label || null, ranking_media: ranking.map((m) => m.tipe),
    keterlibatan: {
      count: { akses: views.length, pembaca: totalPembaca, konten_dibuka: byContent.size, konten_terbit: contents.length, refleksi_guru: [...guru.values()].reduce((s, x) => s + x, 0) },
      frekuensi: { rata_per_mahasiswa: r1(avgOf(counts)), median_per_mahasiswa: medOf(counts), sebaran: bucket(counts, [['1 kali', 1, 2], ['2–5 kali', 2, 6], ['6–10 kali', 6, 11], ['> 10 kali', 11, Infinity]]), mingguan: weeks },
      latensi: { rekomendasi: { jumlah: recs.length, dibuka: recOpened, persen_dibuka: recs.length ? r1((recOpened / recs.length) * 100) : null, persen_7_hari: recs.length ? r1((recWeek / recs.length) * 100) : null, median_jam: r1(medOf(latRec)), rata_jam: r1(avgOf(latRec)) },
        terbit: { median_jam: r1(medOf(latTerbit)), rata_jam: r1(avgOf(latTerbit)), konten: latTerbit.length } },
      durasi: { tercatat: dur.length, rata_detik: r1(avgOf(dur)), median_detik: r1(medOf(dur)), sebaran: bucket(dur, [['< 30 detik', 0, 30], ['30 detik–2 menit', 30, 120], ['2–5 menit', 120, 300], ['5–15 menit', 300, 900], ['> 15 menit', 900, Infinity]]) },
      jeda: { jumlah: irt.length, median_jam: r1(medOf(irt)), rata_jam: r1(avgOf(irt)), sebaran: bucket(irt, [['< 1 jam', 0, 1], ['1–24 jam', 1, 24], ['1–7 hari', 24, 168], ['1–4 minggu', 168, 672], ['> 4 minggu', 672, Infinity]]) },
    },
  });
});
r.put('/admin/content-needs/:kunci', admin, (req, res) => {
  const kunci = str(req.params.kunci, 40);
  if (!/^butir:\d{1,2}$/.test(kunci)) fail(400, 'Kebutuhan tidak dikenal.');
  const b = req.body || {};
  const contentId = b.content_id ? get("SELECT id FROM content_items WHERE id = ? AND sumber = 'admin'", b.content_id)?.id : null;
  if (b.content_id && !contentId) fail(400, 'Konten tidak ditemukan di pustaka admin.');
  const f = { selesai: b.selesai ? 1 : 0, content_id: contentId, catatan: str(b.catatan, 300) || null, ditandai_oleh: req.user.id, ditandai_pada: nowIso() };
  const ex = get('SELECT id FROM content_needs WHERE kunci = ?', kunci);
  if (ex) update('content_needs', ex.id, f); else insert('content_needs', { kunci, ...f });
  audit({ actor: req.user, aksi: f.selesai ? 'kebutuhan_konten_selesai' : 'kebutuhan_konten_dibuka', entitas: 'content_needs', alasan: kunci, ip: req.ip });
  res.json({ ok: true });
});

// ================= Komunitas =================
const isMember = (gid, uid) => !!get('SELECT 1 AS x FROM group_members WHERE group_id = ? AND user_id = ?', gid, uid);
// Grup "binaan" hanya untuk mahasiswa yang memilih konselor pembuat grup; grup "universitas" untuk seluruh mahasiswa kampus
function groupVisible(user, g) {
  if (g.university_id !== user.university_id) return false;
  if (user.role === 'konselor') return true;
  if (user.role !== 'mahasiswa' || g.status !== 'aktif') return false;
  return g.cakupan !== 'binaan' || !!get('SELECT 1 AS x FROM student_counselors WHERE student_id = ? AND counselor_id = ?', user.id, g.dibuat_oleh);
}
const groupView = (g, uid) => ({
  id: g.id, nama: g.nama, topik: g.topik, deskripsi: g.deskripsi, jadwal: g.jadwal, status: g.status, topik_diskusi: JSON.parse(g.topik_diskusi || '[]'),
  cakupan: g.cakupan || 'universitas', pembuat: get('SELECT nama FROM users WHERE id = ?', g.dibuat_oleh)?.nama, milik_saya: g.dibuat_oleh === uid,
  jumlah_anggota: get('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?', g.id).n,
  jumlah_diskusi: get("SELECT COUNT(*) AS n FROM group_posts WHERE group_id = ? AND parent_id IS NULL AND status = 'tampil'", g.id).n,
  laporan_baru: get("SELECT COUNT(*) AS n FROM post_reports pr JOIN group_posts p ON p.id = pr.post_id WHERE p.group_id = ? AND pr.status = 'baru'", g.id).n,
  anggota: isMember(g.id, uid),
});

r.get('/community-groups', (req, res) => {
  const rows = all('SELECT * FROM community_groups WHERE university_id IS ? ORDER BY status, nama', req.user.university_id).filter((g) => groupVisible(req.user, g));
  res.json(rows.map((g) => groupView(g, req.user.id)));
});

function groupFields(b) {
  const f = {};
  for (const k of ['nama', 'topik']) if (k in b) { f[k] = str(b[k], 100); if (!f[k]) fail(400, 'Nama dan topik grup wajib diisi.'); }
  if ('deskripsi' in b) f.deskripsi = str(b.deskripsi, 800);
  if ('jadwal' in b) f.jadwal = str(b.jadwal, 100);
  if ('topik_diskusi' in b) f.topik_diskusi = JSON.stringify((Array.isArray(b.topik_diskusi) ? b.topik_diskusi : String(b.topik_diskusi || '').split('\n')).map((x) => str(x, 120)).filter(Boolean).slice(0, 12));
  if ('status' in b) { if (!['aktif', 'nonaktif'].includes(b.status)) fail(400, 'Status tidak valid.'); f.status = b.status; }
  if ('cakupan' in b) { if (!['binaan', 'universitas'].includes(b.cakupan)) fail(400, 'Pilih akses grup: mahasiswa binaan atau seluruh mahasiswa kampus.'); f.cakupan = b.cakupan; }
  return f;
}
const campusGroup = (req) => { const g = get('SELECT * FROM community_groups WHERE id = ? AND university_id IS ?', req.params.id, req.user.university_id); if (!g) fail(404, 'Grup tidak ditemukan.'); return g; };
r.post('/community-groups', konselor, (req, res) => {
  const f = groupFields({ cakupan: 'universitas', ...req.body });
  if (!f.nama || !f.topik) fail(400, 'Nama dan topik grup wajib diisi.');
  res.status(201).json({ id: insert('community_groups', { ...f, dibuat_oleh: req.user.id, university_id: req.user.university_id }) });
});
r.patch('/community-groups/:id', konselor, (req, res) => {
  const g = campusGroup(req);
  if (g.cakupan === 'binaan' && g.dibuat_oleh !== req.user.id) fail(403, 'Grup binaan hanya dapat diubah konselor pembuatnya.');
  update('community_groups', req.params.id, groupFields(req.body || {}));
  audit({ actor: req.user, aksi: 'ubah_grup_komunitas', entitas: 'community_groups', entitas_id: req.params.id, ip: req.ip });
  res.json({ ok: true });
});
r.delete('/community-groups/:id', konselor, (req, res) => {
  const g = campusGroup(req);
  if (g.dibuat_oleh !== req.user.id) fail(403, 'Grup hanya dapat dihapus konselor pembuatnya.');
  run('DELETE FROM community_groups WHERE id = ?', g.id); res.json({ ok: true });
});

r.get('/community-groups/:id/members', konselor, (req, res) => {
  campusGroup(req);
  res.json(all("SELECT u.id, u.nama, u.nim_nip, u.identitas_disamarkan, p.nama_prodi, m.bergabung_pada FROM group_members m JOIN users u ON u.id = m.user_id LEFT JOIN prodi p ON p.id = u.prodi_id WHERE m.group_id = ? ORDER BY m.bergabung_pada DESC", req.params.id)
    .map((m) => ({ ...m, nama: displayName(m, req.user), peer: !!activePeer(m.id) })));
});
r.delete('/community-groups/:id/members/:uid', konselor, (req, res) => {
  campusGroup(req);
  run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', req.params.id, req.params.uid);
  audit({ actor: req.user, aksi: 'keluarkan_anggota_grup', entitas: 'community_groups', entitas_id: req.params.id, student_id: req.params.uid, ip: req.ip });
  res.json({ ok: true });
});
r.post('/community-groups/:id/members', requireRole('mahasiswa'), (req, res) => {
  const g = get("SELECT * FROM community_groups WHERE id = ? AND status = 'aktif'", req.params.id);
  if (!g || !groupVisible(req.user, g)) fail(404, 'Grup tidak ditemukan atau sedang tidak aktif.');
  run('INSERT OR IGNORE INTO group_members (id, group_id, user_id, bergabung_pada) VALUES (?,?,?,?)', crypto.randomUUID(), g.id, req.user.id, nowIso());
  res.json({ ok: true });
});
r.delete('/community-groups/:id/members', requireRole('mahasiswa'), (req, res) => { run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', req.params.id, req.user.id); res.json({ ok: true }); });

// ---- Diskusi: hanya anggota (dan konselor) ----
function canReadGroup(req, g) {
  if (!groupVisible(req.user, g)) return false;
  if (req.user.role === 'konselor') return true;
  return isMember(g.id, req.user.id);
}
const authorView = (uid, viewer) => {
  const u = get('SELECT id, nama, role, identitas_disamarkan, nim_nip FROM users WHERE id = ?', uid);
  return { id: u.id, nama: u.role === 'mahasiswa' ? displayName(u, viewer) : u.nama, role: u.role, peer: u.role === 'mahasiswa' && !!activePeer(u.id), saya: u.id === viewer.id };
};
r.get('/community-groups/:id/posts', (req, res) => {
  const g = get('SELECT * FROM community_groups WHERE id = ?', req.params.id);
  if (!g) fail(404, 'Grup tidak ditemukan.');
  if (!canReadGroup(req, g)) fail(403, 'Gabung ke grup ini terlebih dahulu untuk mengakses diskusinya.', 'NOT_MEMBER');
  const mod = req.user.role === 'konselor';
  const rows = all(`SELECT * FROM group_posts WHERE group_id = ? ${mod ? '' : "AND (status = 'tampil' OR user_id = ?)"} ORDER BY created_at`, ...(mod ? [g.id] : [g.id, req.user.id]));
  const view = (p) => ({ id: p.id, parent_id: p.parent_id, topik: p.topik, isi: p.status === 'tampil' || mod || p.user_id === req.user.id ? p.isi : '', status: p.status, alasan_moderasi: p.alasan_moderasi, created_at: p.created_at,
    penulis: authorView(p.user_id, req.user), laporan: mod ? all("SELECT pr.id, pr.alasan, pr.status, pr.created_at FROM post_reports pr WHERE pr.post_id = ?", p.id) : undefined });
  const threads = rows.filter((p) => !p.parent_id).reverse().map((p) => ({ ...view(p), balasan: rows.filter((x) => x.parent_id === p.id).map(view) }));
  res.json({ group: groupView(g, req.user.id), threads });
});
r.post('/community-groups/:id/posts', (req, res) => {
  const g = get('SELECT * FROM community_groups WHERE id = ?', req.params.id);
  if (!g) fail(404, 'Grup tidak ditemukan.');
  if (!canReadGroup(req, g)) fail(403, 'Gabung ke grup ini terlebih dahulu untuk ikut berdiskusi.', 'NOT_MEMBER');
  const isi = str(req.body?.isi, 3000); if (isi.length < 2) fail(400, 'Tulis pesan diskusi terlebih dahulu.');
  let parent = null;
  if (req.body?.parent_id) { parent = get('SELECT * FROM group_posts WHERE id = ? AND group_id = ? AND parent_id IS NULL', req.body.parent_id, g.id); if (!parent) fail(400, 'Diskusi yang dibalas tidak ditemukan.'); }
  const topik = parent ? null : str(req.body?.topik, 120) || null;
  const id = insert('group_posts', { group_id: g.id, user_id: req.user.id, parent_id: parent?.id || null, topik, isi });
  if (parent && parent.user_id !== req.user.id) notify(parent.user_id, { tipe: 'komunitas', judul: `Balasan baru di ${g.nama}`, isi: isi.slice(0, 80), tautan: `#/s/komunitas/${g.id}` });
  res.status(201).json({ id });
});
r.post('/posts/:id/report', requireRole('mahasiswa'), (req, res) => {
  const p = get('SELECT * FROM group_posts WHERE id = ?', req.params.id); if (!p) fail(404, 'Pesan tidak ditemukan.');
  const g = get('SELECT * FROM community_groups WHERE id = ?', p.group_id);
  if (!canReadGroup(req, g)) fail(403, 'Anda bukan anggota grup ini.');
  const alasan = str(req.body?.alasan, 300); if (alasan.length < 3) fail(400, 'Tuliskan alasan laporan.');
  run('INSERT OR IGNORE INTO post_reports (id, post_id, pelapor_id, alasan) VALUES (?,?,?,?)', crypto.randomUUID(), p.id, req.user.id, alasan);
  for (const c of all("SELECT id FROM users WHERE role = 'konselor' AND status = 'aktif' AND university_id IS ?", g.university_id)) notify(c.id, { tipe: 'moderasi', judul: `Laporan konten di grup ${g.nama}`, isi: alasan, tautan: `#/c/komunitas/${g.id}` });
  res.status(201).json({ ok: true });
});
r.patch('/posts/:id', konselor, (req, res) => {
  const p = get('SELECT gp.* FROM group_posts gp JOIN community_groups g ON g.id = gp.group_id WHERE gp.id = ? AND g.university_id IS ?', req.params.id, req.user.university_id); if (!p) fail(404, 'Pesan tidak ditemukan.');
  const status = req.body?.status;
  if (!['tampil', 'disembunyikan'].includes(status)) fail(400, 'Status tidak valid.');
  const alasan = str(req.body?.alasan, 300);
  update('group_posts', p.id, { status, alasan_moderasi: status === 'disembunyikan' ? alasan || 'Tidak sesuai pedoman komunitas' : null, dimoderasi_oleh: req.user.id });
  run(`UPDATE post_reports SET status = ?, ditangani_oleh = ? WHERE post_id = ? AND status = 'baru'`, status === 'disembunyikan' ? 'ditindaklanjuti' : 'diabaikan', req.user.id, p.id);
  if (status === 'disembunyikan') notify(p.user_id, { tipe: 'moderasi', judul: 'Pesanmu di komunitas disembunyikan konselor', isi: alasan || 'Tidak sesuai pedoman komunitas', tautan: `#/s/komunitas/${p.group_id}` });
  audit({ actor: req.user, aksi: `moderasi_${status}`, entitas: 'group_posts', entitas_id: p.id, alasan, ip: req.ip });
  res.json({ ok: true });
});
r.delete('/posts/:id', (req, res) => {
  const p = get('SELECT gp.*, g.university_id FROM group_posts gp JOIN community_groups g ON g.id = gp.group_id WHERE gp.id = ?', req.params.id); if (!p) fail(404, 'Pesan tidak ditemukan.');
  if (!(req.user.role === 'konselor' && p.university_id === req.user.university_id) && p.user_id !== req.user.id) fail(403, 'Anda hanya dapat menghapus pesan sendiri.');
  run('DELETE FROM group_posts WHERE id = ?', p.id);
  res.json({ ok: true });
});
r.get('/moderation/reports', konselor, (req, res) => {
  res.json(all(`SELECT pr.id, pr.alasan, pr.status, pr.created_at, p.id AS post_id, p.isi, p.status AS post_status, g.id AS group_id, g.nama AS grup
    FROM post_reports pr JOIN group_posts p ON p.id = pr.post_id JOIN community_groups g ON g.id = p.group_id WHERE g.university_id IS ? ORDER BY pr.status = 'baru' DESC, pr.created_at DESC LIMIT 100`, req.user.university_id));
});
r.patch('/moderation/reports/:id', konselor, (req, res) => {
  if (!['ditindaklanjuti', 'diabaikan'].includes(req.body?.status)) fail(400, 'Status tidak valid.');
  run('UPDATE post_reports SET status = ?, ditangani_oleh = ? WHERE id = ? AND post_id IN (SELECT p.id FROM group_posts p JOIN community_groups g ON g.id = p.group_id WHERE g.university_id IS ?)', req.body.status, req.user.id, req.params.id, req.user.university_id);
  res.json({ ok: true });
});

// ================= Peer counselor (ditetapkan konselor) =================
const peerView = (x, viewer) => ({
  id: x.id, user_id: x.user_id, nama: x.nama, nama_prodi: x.nama_prodi, angkatan: x.angkatan, keahlian: x.keahlian, kontak_terverifikasi: x.kontak_terverifikasi,
  status: x.status === 'sibuk' ? 'sibuk' : isOnline(x.user_id) || x.status === 'online' ? 'online' : 'offline', saya: x.user_id === viewer.id,
  ...(viewer.role === 'konselor' ? { aktif: !!x.aktif, pelatihan: x.pelatihan, tanggal_sertifikasi: x.tanggal_sertifikasi, ditetapkan_oleh: x.ditetapkan_oleh_nama, dinonaktifkan_pada: x.dinonaktifkan_pada, alasan_nonaktif: x.alasan_nonaktif, nim: x.nim_nip,
    pendampingan: all('SELECT s.tanggal, s.catatan, u.nama AS oleh FROM peer_supervision s JOIN users u ON u.id = s.counselor_id WHERE s.peer_id = ? ORDER BY s.tanggal DESC', x.id) } : {}),
});
const PEER_SQL = `SELECT pc.*, u.nama, u.nim_nip, u.angkatan, p.nama_prodi, k.nama AS ditetapkan_oleh_nama FROM peer_counselors pc JOIN users u ON u.id = pc.user_id
  LEFT JOIN prodi p ON p.id = u.prodi_id LEFT JOIN users k ON k.id = pc.ditetapkan_oleh`;
r.get('/peer-counselors', (req, res) => {
  const rows = req.user.role === 'konselor' ? all(`${PEER_SQL} WHERE u.university_id IS ? ORDER BY pc.aktif DESC, u.nama`, req.user.university_id) : all(`${PEER_SQL} WHERE pc.aktif = 1 AND u.status = 'aktif' AND u.university_id IS ? ORDER BY u.nama`, req.user.university_id);
  res.json(rows.map((x) => peerView(x, req.user)));
});
r.get('/peer-counselors/me', requireRole('mahasiswa'), (req, res) => { const p = activePeer(req.user.id); res.json(p ? { aktif: true, status: p.status, keahlian: p.keahlian, pelatihan: p.pelatihan, tanggal_sertifikasi: p.tanggal_sertifikasi } : { aktif: false }); });
r.patch('/peer-counselors/me', requireRole('mahasiswa'), (req, res) => {
  if (!['online', 'sibuk', 'offline'].includes(req.body?.status)) fail(400, 'Status tidak valid.');
  const pc = activePeer(req.user.id); if (!pc) fail(403, 'Anda belum ditetapkan sebagai peer counselor.');
  update('peer_counselors', pc.id, { status: req.body.status }); res.json({ ok: true });
});
r.get('/peer-candidates', konselor, (req, res) => {
  const q = str(req.query.q, 60);
  res.json(all(`SELECT u.id, u.nama, u.nim_nip, p.nama_prodi, u.angkatan FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.role = 'mahasiswa' AND u.status = 'aktif' AND u.university_id IS ?
    AND (u.nama LIKE ? OR u.nim_nip LIKE ?) ORDER BY u.nama LIMIT 15`, req.user.university_id, `%${q}%`, `%${q}%`));
});
r.post('/peer-counselors', konselor, (req, res) => {
  const b = req.body || {};
  const u = get("SELECT * FROM users WHERE id = ? AND role = 'mahasiswa' AND status = 'aktif' AND university_id IS ?", b.user_id, req.user.university_id);
  if (!u) fail(400, 'Pilih mahasiswa aktif di kampus Anda.');
  const pelatihan = str(b.pelatihan, 200); if (!pelatihan) fail(400, 'Isi nama pelatihan yang telah diikuti.');
  if (!b.memenuhi_syarat) fail(400, 'Konfirmasi bahwa mahasiswa telah dinyatakan memenuhi persyaratan.');
  const f = { aktif: 1, pelatihan, tanggal_sertifikasi: str(b.tanggal_sertifikasi, 10) || nowIso().slice(0, 10), keahlian: str(b.keahlian, 200), kontak_terverifikasi: str(b.kontak, 40), ditetapkan_oleh: req.user.id, dinonaktifkan_pada: null, alasan_nonaktif: null };
  const ex = get('SELECT id FROM peer_counselors WHERE user_id = ?', u.id);
  if (ex) update('peer_counselors', ex.id, f); else insert('peer_counselors', { user_id: u.id, ...f });
  notify(u.id, { tipe: 'peer', judul: 'Selamat! Kamu ditetapkan sebagai Peer Counselor', isi: 'Badge Peer Counselor kini tampil di akunmu. Atur status ketersediaanmu di menu Komunitas.', tautan: '#/s/komunitas' });
  audit({ actor: req.user, aksi: 'tetapkan_peer_counselor', entitas: 'peer_counselors', student_id: u.id, alasan: pelatihan, ip: req.ip });
  res.status(201).json({ ok: true });
});
const campusPeer = (req) => { const pc = get('SELECT pc.* FROM peer_counselors pc JOIN users u ON u.id = pc.user_id WHERE pc.id = ? AND u.university_id IS ?', req.params.id, req.user.university_id); if (!pc) fail(404, 'Peer counselor tidak ditemukan.'); return pc; };
r.patch('/peer-counselors/:id', konselor, (req, res) => {
  const pc = campusPeer(req);
  const b = req.body || {}; const f = {};
  if ('aktif' in b) {
    f.aktif = b.aktif ? 1 : 0;
    f.dinonaktifkan_pada = b.aktif ? null : nowIso(); f.alasan_nonaktif = b.aktif ? null : str(b.alasan, 300) || 'Dinonaktifkan konselor'; if (!b.aktif) f.status = 'offline';
    notify(pc.user_id, { tipe: 'peer', judul: b.aktif ? 'Status Peer Counselor-mu diaktifkan kembali' : 'Status Peer Counselor-mu dinonaktifkan', isi: b.aktif ? 'Badge Peer Counselor tampil kembali.' : f.alasan_nonaktif, tautan: '#/s/komunitas' });
    audit({ actor: req.user, aksi: b.aktif ? 'aktifkan_peer_counselor' : 'nonaktifkan_peer_counselor', entitas: 'peer_counselors', entitas_id: pc.id, student_id: pc.user_id, alasan: f.alasan_nonaktif, ip: req.ip });
  }
  for (const k of ['keahlian', 'pelatihan']) if (k in b) f[k] = str(b[k], 200);
  if ('kontak' in b) f.kontak_terverifikasi = str(b.kontak, 40);
  update('peer_counselors', pc.id, f);
  res.json({ ok: true });
});
r.post('/peer-counselors/:id/supervision', konselor, (req, res) => {
  const pc = campusPeer(req);
  const catatan = str(req.body?.catatan, 2000); if (catatan.length < 5) fail(400, 'Tulis catatan pendampingan.');
  insert('peer_supervision', { peer_id: pc.id, counselor_id: req.user.id, tanggal: str(req.body?.tanggal, 10) || nowIso().slice(0, 10), catatan });
  res.status(201).json({ ok: true });
});

module.exports = { router: r, UPLOAD_DIR };
