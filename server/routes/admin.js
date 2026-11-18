// Admin: memutuskan pendaftar koordinator & konselor, mengelola web Home / profil institusi.
// Koordinator Layanan BK: ikut memverifikasi & mengelola konselor (rute /admin/counselors).
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { all, get, run, insert, update, audit, getConfig, setConfig, nowIso } = require('../db');
const { dec } = require('../security');
const { fail, requireRole, str } = require('../http');
const { mails, mailMode } = require('../mailer');
const { notify } = require('../services');
const { DEFAULT_HOME } = require('../home');
const { UPLOAD_DIR } = require('./content');

const r = express.Router();
const admin = requireRole('admin');
const reviewer = requireRole('admin', 'koordinator'); // peninjau pendaftar konselor
const campus = require('../campus');
// Koordinator hanya mengelola kampusnya sendiri; admin lintas kampus (filter opsional ?universitas=)
const scopeUni = (req) => (req.user.role === 'koordinator' ? req.user.university_id : str(req.query.universitas, 12) || null);
// Lingkup konselor: kode fakultas & id prodi yang benar-benar ada di kampus konselor
function cleanScope(uni, fak, pro) {
  const prodi = campus.campusProdi(uni);
  const fk = new Set(prodi.map((p) => p.fakultas_kode)); const pk = new Set(prodi.map((p) => p.id));
  return { lingkup_fakultas: JSON.stringify((Array.isArray(fak) ? fak : []).filter((f) => fk.has(f))), lingkup_prodi: JSON.stringify((Array.isArray(pro) ? pro : []).filter((x) => pk.has(x))) };
}

// ---------- Pendaftar & konselor ----------
r.get('/admin/counselors', reviewer, (req, res) => {
  const uni = scopeUni(req); const w = uni ? 'AND u.university_id = ?' : ''; const p = uni ? [uni] : [];
  const rows = all(`SELECT u.id, u.nim_nip, u.nama, u.email, u.status, u.email_verified_at, u.created_at, u.alasan_penolakan, u.disetujui_pada, u.last_login_at, u.telepon, u.university_id,
    c.spesialisasi, c.gelar, c.lingkup_fakultas, c.lingkup_prodi, c.layanan_terbuka, c.status_jaga, (SELECT nama FROM users x WHERE x.id = u.disetujui_oleh) AS disetujui_oleh, un.nama AS universitas
    FROM users u LEFT JOIN counselors c ON c.user_id = u.id LEFT JOIN universities un ON un.id = u.university_id WHERE u.role = 'konselor' ${w} ORDER BY CASE u.status WHEN 'menunggu_persetujuan' THEN 0 WHEN 'menunggu_verifikasi' THEN 1 WHEN 'aktif' THEN 2 ELSE 3 END, u.created_at DESC`, ...p);
  const count = (extra, ...q) => get(`SELECT COUNT(*) AS n FROM users WHERE role = 'mahasiswa' ${extra} ${uni ? 'AND university_id = ?' : ''}`, ...q, ...p).n;
  res.json({
    items: rows.map((x) => ({ ...x, telepon: dec(x.telepon), konteks: campus.counselorContext(x), lingkup_fakultas: JSON.parse(x.lingkup_fakultas || '[]'), lingkup_prodi: JSON.parse(x.lingkup_prodi || '[]'), layanan_terbuka: !!x.layanan_terbuka, status_jaga: !!x.status_jaga })),
    ringkasan: {
      mahasiswa_aktif: count("AND status = 'aktif'"),
      mahasiswa_belum_verifikasi: count("AND status = 'menunggu_verifikasi'"),
      pendaftar_mahasiswa_7hari: count('AND created_at >= ?', new Date(Date.now() - 7 * 86400000).toISOString()),
    },
    fakultas: uni ? campus.campusFaculties(uni) : [], prodi: uni ? campus.campusProdi(uni) : [],
    mail_mode: mailMode(),
    domain_email: req.user.role === 'admin' ? getConfig('domain_email', { mahasiswa: [], konselor: [] }) : null,
  });
});

function counselorOr404(id, req) {
  const u = get("SELECT * FROM users WHERE id = ? AND role = 'konselor'", id);
  if (!u || (req.user.role === 'koordinator' && u.university_id !== req.user.university_id)) fail(404, 'Konselor tidak ditemukan di kampus Anda.');
  return u;
}

r.post('/admin/counselors/:id/approve', reviewer, (req, res) => {
  const u = counselorOr404(req.params.id, req);
  if (!['menunggu_persetujuan', 'ditolak'].includes(u.status)) fail(400, u.status === 'menunggu_verifikasi' ? 'Pendaftar belum memverifikasi email.' : 'Akun ini tidak sedang menunggu persetujuan.');
  const sc = cleanScope(u.university_id, req.body?.lingkup_fakultas, req.body?.lingkup_prodi);
  update('users', u.id, { status: 'aktif', aktif: 1, disetujui_oleh: req.user.id, disetujui_pada: nowIso(), alasan_penolakan: null });
  const c = get('SELECT id FROM counselors WHERE user_id = ?', u.id);
  if (c && (sc.lingkup_fakultas !== '[]' || sc.lingkup_prodi !== '[]')) update('counselors', c.id, sc);
  audit({ actor: req.user, aksi: 'setujui_konselor', entitas: 'users', entitas_id: u.id, alasan: `lingkup: ${sc.lingkup_fakultas} ${sc.lingkup_prodi}`, ip: req.ip });
  mails.konselorDisetujui(u.email, u.nama).catch((e) => console.error('[email]', e.message));
  res.json({ ok: true });
});

r.post('/admin/counselors/:id/reject', reviewer, (req, res) => {
  const u = counselorOr404(req.params.id, req);
  const alasan = str(req.body?.alasan, 500);
  if (alasan.length < 5) fail(400, 'Tuliskan alasan penolakan agar pendaftar memahami keputusan Anda.');
  if (u.status === 'aktif') fail(400, 'Akun aktif tidak dapat ditolak; gunakan Nonaktifkan.');
  update('users', u.id, { status: 'ditolak', aktif: 0, alasan_penolakan: alasan, token_version: u.token_version + 1 });
  audit({ actor: req.user, aksi: 'tolak_konselor', entitas: 'users', entitas_id: u.id, alasan, ip: req.ip });
  mails.konselorDitolak(u.email, u.nama, alasan).catch((e) => console.error('[email]', e.message));
  res.json({ ok: true });
});

r.patch('/admin/counselors/:id', reviewer, (req, res) => {
  const u = counselorOr404(req.params.id, req);
  const b = req.body || {};
  if ('aktif' in b) {
    if (!['aktif', 'nonaktif'].includes(u.status)) fail(400, 'Hanya akun yang sudah disetujui yang dapat diaktifkan/dinonaktifkan.');
    update('users', u.id, { status: b.aktif ? 'aktif' : 'nonaktif', aktif: b.aktif ? 1 : 0, token_version: u.token_version + 1 });
    if (!b.aktif) run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', u.id);
    audit({ actor: req.user, aksi: b.aktif ? 'aktifkan_konselor' : 'nonaktifkan_konselor', entitas: 'users', entitas_id: u.id, ip: req.ip });
  }
  if (Array.isArray(b.lingkup_fakultas) || Array.isArray(b.lingkup_prodi)) {
    const c = get('SELECT * FROM counselors WHERE user_id = ?', u.id);
    const sc = cleanScope(u.university_id, b.lingkup_fakultas ?? JSON.parse(c.lingkup_fakultas || '[]'), b.lingkup_prodi ?? JSON.parse(c.lingkup_prodi || '[]'));
    update('counselors', c.id, sc);
    const ring = campus.counselorContext(sc).ringkas;
    audit({ actor: req.user, aksi: 'ubah_lingkup_konselor', entitas: 'counselors', entitas_id: c.id, alasan: ring, ip: req.ip });
    notify(u.id, { tipe: 'akun', judul: 'Konteks kerja Anda diperbarui koordinator', isi: ring, tautan: '#/c/konseling' });
  }
  res.json({ ok: true });
});

// ---------- Pendaftar & Koordinator Layanan BK (hanya Admin) ----------
r.get('/admin/coordinators', admin, (_req, res) => {
  const rows = all(`SELECT u.id, u.nim_nip, u.nama, u.email, u.status, u.email_verified_at, u.created_at, u.alasan_penolakan, u.disetujui_pada, u.last_login_at, u.telepon, k.jabatan, k.unit,
    (SELECT nama FROM users x WHERE x.id = u.disetujui_oleh) AS disetujui_oleh
    , (SELECT nama FROM universities x WHERE x.id = u.university_id) AS universitas
    FROM users u LEFT JOIN coordinators k ON k.user_id = u.id WHERE u.role = 'koordinator' ORDER BY CASE u.status WHEN 'menunggu_persetujuan' THEN 0 WHEN 'menunggu_verifikasi' THEN 1 WHEN 'aktif' THEN 2 ELSE 3 END, u.created_at DESC`);
  res.json({ items: rows.map((x) => ({ ...x, telepon: dec(x.telepon) })), mail_mode: mailMode() });
});
function coordinatorOr404(id) {
  const u = get("SELECT * FROM users WHERE id = ? AND role = 'koordinator'", id);
  if (!u) fail(404, 'Koordinator tidak ditemukan.');
  return u;
}
const PERAN_K = 'koordinator layanan BK';
r.post('/admin/coordinators/:id/approve', admin, (req, res) => {
  const u = coordinatorOr404(req.params.id);
  if (!['menunggu_persetujuan', 'ditolak'].includes(u.status)) fail(400, u.status === 'menunggu_verifikasi' ? 'Pendaftar belum memverifikasi email.' : 'Akun ini tidak sedang menunggu persetujuan.');
  update('users', u.id, { status: 'aktif', aktif: 1, disetujui_oleh: req.user.id, disetujui_pada: nowIso(), alasan_penolakan: null });
  audit({ actor: req.user, aksi: 'setujui_koordinator', entitas: 'users', entitas_id: u.id, ip: req.ip });
  mails.konselorDisetujui(u.email, u.nama, PERAN_K).catch((e) => console.error('[email]', e.message));
  res.json({ ok: true });
});
r.post('/admin/coordinators/:id/reject', admin, (req, res) => {
  const u = coordinatorOr404(req.params.id);
  const alasan = str(req.body?.alasan, 500);
  if (alasan.length < 5) fail(400, 'Tuliskan alasan penolakan agar pendaftar memahami keputusan Anda.');
  if (u.status === 'aktif') fail(400, 'Akun aktif tidak dapat ditolak; gunakan Nonaktifkan.');
  update('users', u.id, { status: 'ditolak', aktif: 0, alasan_penolakan: alasan, token_version: u.token_version + 1 });
  audit({ actor: req.user, aksi: 'tolak_koordinator', entitas: 'users', entitas_id: u.id, alasan, ip: req.ip });
  mails.konselorDitolak(u.email, u.nama, alasan, PERAN_K).catch((e) => console.error('[email]', e.message));
  res.json({ ok: true });
});
r.patch('/admin/coordinators/:id', admin, (req, res) => {
  const u = coordinatorOr404(req.params.id);
  if (!('aktif' in (req.body || {}))) fail(400, 'Tidak ada perubahan.');
  if (!['aktif', 'nonaktif'].includes(u.status)) fail(400, 'Hanya akun yang sudah disetujui yang dapat diaktifkan/dinonaktifkan.');
  const on = !!req.body.aktif;
  update('users', u.id, { status: on ? 'aktif' : 'nonaktif', aktif: on ? 1 : 0, token_version: u.token_version + 1 });
  if (!on) run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', u.id);
  audit({ actor: req.user, aksi: on ? 'aktifkan_koordinator' : 'nonaktifkan_koordinator', entitas: 'users', entitas_id: u.id, ip: req.ip });
  res.json({ ok: true });
});

// ---------- Web Home & profil ----------
r.get('/admin/home', admin, (_req, res) => res.json({ ...DEFAULT_HOME, ...getConfig('home', {}) }));

const textList = (v, max = 12) => (Array.isArray(v) ? v : []).map((x) => str(x, 400)).filter(Boolean).slice(0, max);
const pairList = (v, a, bKey, max = 12) => (Array.isArray(v) ? v : []).map((x) => ({ [a]: str(x?.[a], 160), [bKey]: str(x?.[bKey], 600) })).filter((x) => x[a]).slice(0, max);

// ---- Pembangun halaman utama: blok tambahan bermedia di antara bagian bawaan ----
// Kode tempelan (HTML/CSS/JS, embed Canva/Lottie/dll.) tidak pernah disisipkan langsung ke halaman: ia disajikan
// lewat /embed/<id> di dalam iframe sandbox (asal terisolasi) sehingga tidak dapat membaca sesi/login pengguna.
const SECTIONS = ['hero', 'statistik', 'tentang', 'fitur', 'alur', 'konselor', 'faq', 'kontak', 'darurat'];
const POSISI = ['awal', ...SECTIONS.map((x) => `setelah_${x}`)];
const MEDIA = ['tidak', 'gambar', 'video', 'youtube', 'kode'];
const mediaUrl = (u) => { const v = str(u, 500); if (v && !/^(https:\/\/|\/media\/)/.test(v)) fail(400, 'Tautan media harus diawali https:// atau berasal dari unggahan.'); return v; };
function mediaFields(m) {
  const tipe = MEDIA.includes(m.tipe) ? m.tipe : 'tidak';
  const f = { tipe, url: tipe === 'kode' || tipe === 'tidak' ? '' : mediaUrl(m.url), kode: tipe === 'kode' ? String(m.kode || '').slice(0, 60000) : '', tinggi: Math.min(1400, Math.max(120, Number(m.tinggi) || 420)), alt: str(m.alt, 200) };
  if (tipe === 'youtube' && f.url && !/(youtube\.com\/(watch\?v=|embed\/|shorts\/)|youtu\.be\/)/.test(f.url)) fail(400, 'Tautan YouTube tidak dikenali.');
  if (tipe !== 'tidak' && tipe !== 'kode' && !f.url) fail(400, 'Isi tautan atau unggah media untuk blok.');
  if (tipe === 'kode' && !f.kode.trim()) fail(400, 'Tempel kode embed untuk blok.');
  return f;
}
function blockFields(x) {
  return { id: /^[a-z0-9-]{6,40}$/.test(x?.id || '') ? x.id : crypto.randomUUID(), posisi: POSISI.includes(x?.posisi) ? x.posisi : 'setelah_tentang', judul: str(x?.judul, 160), teks: str(x?.teks, 3000),
    media: mediaFields(x?.media || {}), tata_letak: ['kiri', 'kanan', 'penuh'].includes(x?.tata_letak) ? x.tata_letak : 'penuh', latar: /^#[0-9a-fA-F]{6}$/.test(x?.latar || '') ? x.latar : '',
    tombol_teks: str(x?.tombol_teks, 60), tombol_url: (() => { const u = str(x?.tombol_url, 300); return !u || /^(https:\/\/|#\/)/.test(u) ? u : ''; })(), tampil: x?.tampil !== false };
}

r.put('/admin/home', admin, (req, res) => {
  const b = req.body || {};
  const cur = { ...DEFAULT_HOME, ...getConfig('home', {}) };
  const next = { ...cur };
  for (const k of ['nama_singkat', 'kepanjangan', 'institusi', 'hero_eyebrow', 'hero_judul', 'hero_deskripsi', 'tentang_judul', 'tentang', 'visi', 'konselor_judul', 'konselor_deskripsi', 'kontak_alamat', 'kontak_email', 'kontak_telepon', 'kontak_jam', 'footer']) {
    if (k in b) next[k] = str(b[k], k === 'tentang' || k.endsWith('deskripsi') ? 3000 : 300);
  }
  if ('logo_url' in b) { const u = str(b.logo_url, 300); if (u && !/^\/(media\/|logo\.png$)/.test(u)) fail(400, 'Logo harus berasal dari unggahan.'); next.logo_url = u || '/logo.png'; }
  if ('tampilkan_statistik' in b) next.tampilkan_statistik = !!b.tampilkan_statistik;
  if ('misi' in b) next.misi = textList(b.misi);
  if ('pilar' in b) next.pilar = (Array.isArray(b.pilar) ? b.pilar : []).map((x) => ({ huruf: str(x?.huruf, 8), judul: str(x?.judul, 80), deskripsi: str(x?.deskripsi, 300) })).filter((x) => x.judul).slice(0, 6);
  if ('fitur' in b) next.fitur = pairList(b.fitur, 'judul', 'deskripsi');
  if ('alur' in b) next.alur = pairList(b.alur, 'judul', 'deskripsi', 8);
  if ('faq' in b) next.faq = pairList(b.faq, 'tanya', 'jawab', 15);
  if ('blok' in b) next.blok = (Array.isArray(b.blok) ? b.blok : []).slice(0, 30).map(blockFields);
  if ('sembunyikan' in b) next.sembunyikan = (Array.isArray(b.sembunyikan) ? b.sembunyikan : []).filter((k) => SECTIONS.includes(k));
  if ('hero_media' in b) next.hero_media = mediaFields(b.hero_media || {});
  if (!next.hero_judul || !next.nama_singkat) fail(400, 'Nama aplikasi dan judul utama tidak boleh kosong.');
  setConfig('home', next);
  audit({ actor: req.user, aksi: 'ubah_web_home', entitas: 'institution_config', alasan: Object.keys(b).join(', '), ip: req.ip });
  res.json(next);
});

r.post('/admin/home/reset', admin, (req, res) => { setConfig('home', DEFAULT_HOME); audit({ actor: req.user, aksi: 'reset_web_home', entitas: 'institution_config', ip: req.ip }); res.json(DEFAULT_HOME); });

const IMG = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };
r.post('/admin/uploads', admin, express.raw({ type: Object.keys(IMG), limit: '5mb' }), (req, res) => {
  const mime = (req.headers['content-type'] || '').split(';')[0];
  if (!IMG[mime] || !Buffer.isBuffer(req.body) || !req.body.length) fail(400, 'Gunakan gambar PNG, JPG, atau WEBP (maks. 5 MB).');
  const id = crypto.randomUUID(); const file = id + IMG[mime];
  fs.writeFileSync(path.join(UPLOAD_DIR, file), req.body);
  insert('uploads', { id, nama_berkas: str(decodeURIComponent(req.headers['x-filename'] || 'gambar'), 200), mime, ukuran: req.body.length, path: file, diunggah_oleh: req.user.id });
  res.status(201).json({ url: `/media/${file}` });
});

// ---------- Pengaturan layanan (domain email pendaftaran, SLA, AI) ----------
r.get('/admin/config', admin, (_req, res) => res.json({ sla_menit: getConfig('sla_menit', 30), ai_enabled: getConfig('ai_enabled', true), ai_mode: require('../ai').aiMode(), versi_kebijakan: getConfig('versi_kebijakan', 'v1'), domain_email: getConfig('domain_email', { mahasiswa: [], konselor: [] }), mail_mode: mailMode() }));
r.put('/admin/config', admin, (req, res) => {
  const b = req.body || {};
  if ('sla_menit' in b) { const n = Number(b.sla_menit); if (!(n >= 5 && n <= 240)) fail(400, 'SLA harus antara 5 dan 240 menit.'); setConfig('sla_menit', n); }
  if ('ai_enabled' in b) setConfig('ai_enabled', !!b.ai_enabled);
  if ('versi_kebijakan' in b) setConfig('versi_kebijakan', str(b.versi_kebijakan, 40));
  if (b.domain_email) {
    const clean = (v) => (Array.isArray(v) ? v : String(v || '').split(/[\s,]+/)).map((d) => String(d).trim().toLowerCase().replace(/^@/, '')).filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)).slice(0, 10);
    setConfig('domain_email', { mahasiswa: clean(b.domain_email.mahasiswa), konselor: clean(b.domain_email.konselor) });
  }
  audit({ actor: req.user, aksi: 'ubah_pengaturan_layanan', entitas: 'institution_config', alasan: Object.keys(b).join(', '), ip: req.ip });
  res.json({ ok: true });
});

module.exports = r;
