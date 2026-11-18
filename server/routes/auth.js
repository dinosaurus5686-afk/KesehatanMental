// Autentikasi, pendaftaran mandiri dengan verifikasi email, lupa kata sandi, data publik (web Home).
const express = require('express');
const crypto = require('node:crypto');
const { get, run, all, insert, update, tx, audit, getConfig, nowIso } = require('../db');
const { verifyPassword, hashPassword, signJwt, sha256, randomToken, dec, enc } = require('../security');
const { fail, authenticate, rateLimit, str } = require('../http');
const { mails, validateEmail, mailMode } = require('../mailer');
const { notify, activePeer, coordinators, coordinatorUsers } = require('../services');
const { DEFAULT_HOME, DARURAT_FAQ } = require('../home');
const campus = require('../campus');

const r = express.Router();
const ACCESS_TTL = 15 * 60;
const REFRESH_DAYS = 7;
const TOKEN_MIN = 30;
const COOKIE = 'mc_refresh';

function readCookie(req, name) {
  const m = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
function setRefreshCookie(req, res, token) {
  const secure = req.secure || req.headers['x-forwarded-proto'] === 'https';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=${REFRESH_DAYS * 86400}${secure ? '; Secure' : ''}`);
}

function publicUser(u) {
  const p = u.prodi_id ? get('SELECT * FROM prodi WHERE id = ?', u.prodi_id) : null;
  const c = u.role === 'konselor' ? get('SELECT * FROM counselors WHERE user_id = ?', u.id) : null;
  const k = u.role === 'koordinator' ? get('SELECT jabatan, unit FROM coordinators WHERE user_id = ?', u.id) : null;
  const uni = u.university_id ? get('SELECT * FROM universities WHERE id = ?', u.university_id) : null;
  return {
    id: u.id, role: u.role, nim_nip: u.nim_nip, nama: u.nama, email: u.email, angkatan: u.angkatan, kelas: u.kelas, gender: u.gender,
    tanggal_lahir: u.tanggal_lahir, alamat: dec(u.alamat), telepon: dec(u.telepon), identitas_disamarkan: !!u.identitas_disamarkan, peer: u.role === 'mahasiswa' && !!activePeer(u.id),
    prodi: p ? { id: p.id, nama: p.nama_prodi, fakultas: p.fakultas, fakultas_kode: p.fakultas_kode, jenjang: p.jenjang } : null,
    universitas: campus.universityView(uni),
    konselor: c ? { spesialisasi: c.spesialisasi, status_jaga: !!c.status_jaga, lingkup_fakultas: JSON.parse(c.lingkup_fakultas), lingkup_prodi: JSON.parse(c.lingkup_prodi || '[]'), layanan_terbuka: !!c.layanan_terbuka } : null,
    koordinator: k ? { jabatan: k.jabatan, unit: k.unit } : null,
    rangkap_koordinator: u.role === 'konselor' ? (get("SELECT status, catatan, created_at, ditinjau_pada FROM coordinator_claims WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", u.id) || null) : null,
  };
}

function issue(req, res, user) {
  const refresh = randomToken();
  insert('sessions', { user_id: user.id, token_hash: sha256(refresh), expires_at: new Date(Date.now() + REFRESH_DAYS * 86400000).toISOString(), user_agent: str(req.headers['user-agent'], 300), ip: req.ip });
  setRefreshCookie(req, res, refresh);
  return { access_token: signJwt({ sub: user.id, role: user.role, tv: user.token_version }, ACCESS_TTL), expires_in: ACCESS_TTL, user: publicUser(user) };
}

const STATUS_MSG = {
  menunggu_verifikasi: ['Email belum diverifikasi. Masukkan kode yang kami kirim ke email Anda.', 'EMAIL_UNVERIFIED'],
  menunggu_persetujuan: ['Email sudah terverifikasi. Akun Anda sedang menunggu persetujuan; kami akan mengabari lewat email.', 'PENDING_APPROVAL'],
  ditolak: ['Pendaftaran Anda belum disetujui. Periksa email Anda untuk alasannya atau hubungi Unit Layanan Konseling.', 'REJECTED'],
  nonaktif: ['Akun dinonaktifkan. Hubungi Unit Layanan Konseling.', 'INACTIVE'],
};

r.post('/auth/login', rateLimit({ windowMs: 60000, max: Number(process.env.MC_LOGIN_RATE || 10), message: 'Terlalu banyak percobaan masuk. Tunggu 1 menit.' }), (req, res) => {
  const id = str(req.body?.identifier, 120); const pw = String(req.body?.password || '');
  const user = get('SELECT * FROM users WHERE nim_nip = ? OR email = ?', id, id.toLowerCase());
  if (!user || !verifyPassword(pw, user.password_hash)) { audit({ aksi: 'login_gagal', entitas: 'users', entitas_id: user?.id, ip: req.ip }); fail(401, 'Email/NIM/NIP atau kata sandi salah.'); }
  if (user.status !== 'aktif') { const [m, code] = STATUS_MSG[user.status]; return res.status(403).json({ error: m, code, email: user.email }); }
  update('users', user.id, { last_login_at: nowIso() });
  audit({ actor: user, aksi: 'login', entitas: 'users', entitas_id: user.id, ip: req.ip });
  res.json(issue(req, res, user));
});

r.post('/auth/refresh', (req, res) => {
  const token = readCookie(req, COOKIE);
  const s = token ? get('SELECT * FROM sessions WHERE token_hash = ? AND revoked = 0', sha256(token)) : null;
  if (!s || s.expires_at < nowIso()) fail(401, 'Sesi berakhir. Silakan masuk kembali.', 'UNAUTHENTICATED');
  const user = get('SELECT * FROM users WHERE id = ?', s.user_id);
  if (!user || user.status !== 'aktif') fail(401, 'Akun tidak aktif.', 'UNAUTHENTICATED');
  update('sessions', s.id, { revoked: 1 }); // rotasi refresh token
  res.json(issue(req, res, user));
});

r.post('/auth/logout', (req, res) => {
  const token = readCookie(req, COOKIE);
  if (token) run('UPDATE sessions SET revoked = 1 WHERE token_hash = ?', sha256(token));
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/api/auth; Max-Age=0`);
  res.json({ ok: true });
});

// ---------- Pendaftaran mandiri ----------
function strongPassword(pw) {
  if (pw.length < 8) return 'Kata sandi minimal 8 karakter.';
  if (!/[a-zA-Z]/.test(pw) || !/\d/.test(pw)) return 'Kata sandi harus memuat huruf dan angka.';
  return null;
}

async function sendToken(user, tujuan) {
  run('UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND tujuan = ? AND used_at IS NULL', nowIso(), user.id, tujuan);
  const token = randomToken();
  const kode = tujuan === 'verifikasi' ? String(crypto.randomInt(0, 1000000)).padStart(6, '0') : null;
  insert('email_tokens', { user_id: user.id, tujuan, kode_hash: kode ? sha256(user.id + kode) : null, tautan_hash: sha256(token), expires_at: new Date(Date.now() + TOKEN_MIN * 60000).toISOString() });
  if (tujuan === 'verifikasi') await mails.verifikasi(user.email, user.nama, kode, token);
  else await mails.reset(user.email, user.nama, token);
}

const registerLimiter = rateLimit({ windowMs: 3600000, max: 10, message: 'Terlalu banyak pendaftaran dari jaringan ini. Coba lagi nanti.' });
r.post('/auth/register', registerLimiter, async (req, res) => {
  const b = req.body || {};
  const role = ['mahasiswa', 'konselor', 'koordinator'].includes(b.role) ? b.role : fail(400, 'Pilih jenis akun: mahasiswa, konselor, atau koordinator layanan BK.');
  const nama = str(b.nama, 120); const nim = str(b.nim_nip, 30); const pw = String(b.password || '');
  if (nama.length < 3) fail(400, 'Isi nama lengkap.');
  if (!/^[A-Za-z0-9.\-]{4,30}$/.test(nim)) fail(400, role === 'mahasiswa' ? 'NIM tidak valid.' : 'NIP/NIDN/nomor pegawai tidak valid.');
  const pwErr = strongPassword(pw); if (pwErr) fail(400, pwErr);
  if (!b.persetujuan) fail(400, 'Centang persetujuan kebijakan privasi untuk melanjutkan.');
  const domains = getConfig('domain_email', { mahasiswa: [], konselor: [] })[role === 'mahasiswa' ? 'mahasiswa' : 'konselor'] || []; // koordinator memakai aturan domain staf
  const v = await validateEmail(b.email, domains);
  if (!v.ok) fail(400, v.message);
  const existing = get('SELECT * FROM users WHERE email = ? OR nim_nip = ?', v.email, nim);
  if (existing) {
    // Pendaftaran ulang untuk akun yang belum diverifikasi: perbarui data & kirim kode baru
    if (existing.status === 'menunggu_verifikasi' && existing.email === v.email && existing.nim_nip === nim && existing.role === role) {
      update('users', existing.id, { nama, password_hash: hashPassword(pw) });
      await sendToken({ ...existing, nama }, 'verifikasi');
      return res.status(201).json({ email: v.email, mail_mode: mailMode() });
    }
    fail(409, existing.email === v.email ? 'Email sudah terdaftar. Silakan masuk atau gunakan "Lupa kata sandi".' : `${role === 'mahasiswa' ? 'NIM' : 'NIP'} sudah terdaftar.`);
  }
  const uni = get('SELECT id FROM universities WHERE id = ?', str(b.university_id, 12));
  if (!uni) fail(400, 'Pilih perguruan tinggi Anda dari daftar.');
  let prodiId = null; let angkatan = null; let prodiBaru = null;
  if (role === 'mahasiswa') {
    prodiId = str(b.prodi_id, 40);
    if (prodiId && !get("SELECT 1 AS x FROM prodi WHERE id = ? AND university_id = ? AND status = 'aktif'", prodiId, uni.id)) fail(400, 'Program studi tidak ditemukan di kampus ini.');
    if (!prodiId) {
      // Kampus belum punya daftar prodi lengkap: mahasiswa mengusulkan prodinya, koordinator kampus merapikannya
      prodiBaru = { nama: str(b.prodi_baru?.nama, 120), fakultas: str(b.prodi_baru?.fakultas, 120) || 'Belum ditentukan', jenjang: str(b.prodi_baru?.jenjang, 10) || 'S1' };
      if (prodiBaru.nama.length < 3) fail(400, 'Pilih program studi, atau tuliskan nama program studi Anda bila belum ada di daftar.');
    }
    angkatan = Number(b.angkatan);
    const y = new Date().getFullYear();
    if (!(angkatan >= y - 10 && angkatan <= y)) fail(400, 'Angkatan tidak valid.');
  }
  const user = tx(() => {
    if (prodiBaru) {
      const ada = get('SELECT id FROM prodi WHERE university_id = ? AND lower(nama_prodi) = lower(?)', uni.id, prodiBaru.nama);
      prodiId = ada?.id || insert('prodi', { university_id: uni.id, nama_prodi: prodiBaru.nama, fakultas: prodiBaru.fakultas, fakultas_kode: campus.facultyCode(prodiBaru.fakultas), jenjang: prodiBaru.jenjang, status: 'usulan' });
    }
    const id = insert('users', {
      role, nim_nip: nim, nama, email: v.email, password_hash: hashPassword(pw), status: 'menunggu_verifikasi', aktif: 0, university_id: uni.id,
      prodi_id: prodiId, angkatan, kelas: str(b.kelas, 5) || null, gender: ['L', 'P'].includes(b.gender) ? b.gender : null, telepon: enc(str(b.telepon, 40)),
    });
    if (role === 'koordinator') insert('coordinators', { user_id: id, jabatan: str(b.jabatan, 120) || 'Koordinator Layanan BK', unit: str(b.unit, 160) });
    if (role === 'konselor') {
      insert('counselors', {
        user_id: id, spesialisasi: str(b.spesialisasi, 120), gelar: str(b.profesi, 120),
        lingkup_fakultas: '[]', // konteks kerja (fakultas/prodi) diisi konselor setelah akun aktif
        jam_operasional: JSON.stringify({ Senin: '08.00–15.00', Selasa: '08.00–15.00', Rabu: '08.00–15.00', Kamis: '08.00–15.00', Jumat: '08.00–11.00', Sabtu: 'Tutup', Minggu: 'Tutup' }),
        jenis_layanan_aktif: JSON.stringify(['Konseling Individu', 'Konseling Daring']),
      });
    }
    insert('consents', { user_id: id, jenis_consent: 'layanan_umum', disetujui_pada: nowIso(), versi_kebijakan: getConfig('versi_kebijakan', 'v1'), alamat_ip: req.ip });
    if (role === 'mahasiswa') campus.setStudentCounselors(id, uni.id, b.konselor_ids);
    return get('SELECT * FROM users WHERE id = ?', id);
  });
  audit({ actor: user, aksi: 'daftar_akun', entitas: 'users', entitas_id: user.id, alasan: role, ip: req.ip });
  await sendToken(user, 'verifikasi');
  res.status(201).json({ email: user.email, mail_mode: mailMode() });
});

// Konselor disetujui Koordinator Layanan BK kampusnya; Koordinator disetujui Admin.
const REVIEW = {
  konselor: { peran: 'konselor', peninjau: 'koordinator layanan BK kampus Anda', pemeriksa: [['koordinator', '#/k/konselor', true]] },
  koordinator: { peran: 'koordinator layanan BK', peninjau: 'admin', pemeriksa: [['admin', '#/a/koordinator', false]] },
};
function completeVerification(user) {
  const rv = REVIEW[user.role];
  const status = rv ? 'menunggu_persetujuan' : 'aktif';
  update('users', user.id, { status, aktif: status === 'aktif' ? 1 : 0, email_verified_at: nowIso() });
  if (rv) {
    mails.konselorMenunggu(user.email, user.nama, rv.peran, rv.peninjau).catch((e) => console.error('[email]', e.message));
    for (const [role, tautan, perKampus] of rv.pemeriksa) {
      const list = role === 'koordinator' && perKampus ? coordinatorUsers(user.university_id) : all(`SELECT id, email FROM users WHERE role = ? AND status = 'aktif' ${perKampus ? 'AND university_id IS ?' : ''}`, ...(perKampus ? [role, user.university_id] : [role]));
      for (const a of list) {
        notify(a.id, { tipe: 'pendaftar', judul: `Pendaftar ${rv.peran} baru`, isi: `${user.nama} menunggu persetujuan.`, tautan });
        mails.pendaftarBaru(a.email, user.nama, rv.peran, tautan).catch((e) => console.error('[email]', e.message));
      }
      // Kampus belum punya koordinator: admin diberi tahu agar mengaktifkan koordinator kampus tersebut
      if (perKampus && !list.length) for (const a of all("SELECT id FROM users WHERE role = 'admin' AND status = 'aktif'")) notify(a.id, { tipe: 'pendaftar', judul: `Pendaftar ${rv.peran} menunggu koordinator kampus`, isi: `${user.nama} (${campus.universityName(user.university_id) || '-'}) menunggu, tetapi kampus ini belum memiliki Koordinator Layanan BK aktif.`, tautan: '#/a/koordinator' });
    }
  }
  audit({ actor: user, aksi: 'email_terverifikasi', entitas: 'users', entitas_id: user.id });
  return status;
}

r.post('/auth/verify', rateLimit({ windowMs: 60000, max: 20 }), (req, res) => {
  const email = str(req.body?.email, 120).toLowerCase(); const kode = str(req.body?.kode, 10);
  const user = get("SELECT * FROM users WHERE email = ? AND status = 'menunggu_verifikasi'", email);
  if (!user) fail(400, 'Akun tidak ditemukan atau email sudah terverifikasi.');
  const t = get("SELECT * FROM email_tokens WHERE user_id = ? AND tujuan = 'verifikasi' AND used_at IS NULL ORDER BY created_at DESC LIMIT 1", user.id);
  if (!t || t.expires_at < nowIso()) fail(400, 'Kode sudah kedaluwarsa. Minta kode baru.', 'CODE_EXPIRED');
  if (t.percobaan >= 5) fail(429, 'Terlalu banyak percobaan. Minta kode baru.', 'CODE_EXPIRED');
  if (t.kode_hash !== sha256(user.id + kode)) { update('email_tokens', t.id, { percobaan: t.percobaan + 1 }); fail(400, `Kode salah. Sisa percobaan: ${4 - t.percobaan}.`); }
  update('email_tokens', t.id, { used_at: nowIso() });
  res.json({ status: completeVerification(user), role: user.role });
});

r.get('/auth/verify-link/:token', (req, res) => {
  const t = get("SELECT * FROM email_tokens WHERE tautan_hash = ? AND tujuan = 'verifikasi'", sha256(req.params.token));
  const user = t && get('SELECT * FROM users WHERE id = ?', t.user_id);
  if (!t || t.used_at || t.expires_at < nowIso() || !user || user.status !== 'menunggu_verifikasi') return res.redirect('/#/verifikasi-gagal');
  update('email_tokens', t.id, { used_at: nowIso() });
  const status = completeVerification(user);
  res.redirect(status === 'aktif' ? '/#/terverifikasi' : `/#/terverifikasi/${user.role}`);
});

const resendLimiter = rateLimit({ windowMs: 60000, max: 1, key: (req) => 'r:' + String(req.body?.email || '').toLowerCase(), message: 'Tunggu 1 menit sebelum meminta kode baru.' });
r.post('/auth/resend', resendLimiter, async (req, res) => {
  const user = get("SELECT * FROM users WHERE email = ? AND status = 'menunggu_verifikasi'", str(req.body?.email, 120).toLowerCase());
  if (user) await sendToken(user, 'verifikasi');
  res.json({ ok: true, mail_mode: mailMode() });
});

r.post('/auth/forgot', rateLimit({ windowMs: 600000, max: 5, message: 'Terlalu banyak permintaan. Coba lagi 10 menit lagi.' }), async (req, res) => {
  const user = get("SELECT * FROM users WHERE email = ? AND email_verified_at IS NOT NULL AND status IN ('aktif','menunggu_persetujuan')", str(req.body?.email, 120).toLowerCase());
  if (user) await sendToken(user, 'reset');
  res.json({ ok: true, mail_mode: mailMode() }); // selalu sama agar tidak membocorkan email terdaftar
});

r.post('/auth/reset', rateLimit({ windowMs: 600000, max: 10 }), (req, res) => {
  const t = get("SELECT * FROM email_tokens WHERE tautan_hash = ? AND tujuan = 'reset'", sha256(str(req.body?.token, 200)));
  if (!t || t.used_at || t.expires_at < nowIso()) fail(400, 'Tautan sudah tidak berlaku. Minta tautan baru dari halaman "Lupa kata sandi".');
  const pw = String(req.body?.password || ''); const err = strongPassword(pw); if (err) fail(400, err);
  const u = get('SELECT * FROM users WHERE id = ?', t.user_id);
  update('users', u.id, { password_hash: hashPassword(pw), token_version: u.token_version + 1 });
  update('email_tokens', t.id, { used_at: nowIso() });
  run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', u.id);
  audit({ actor: u, aksi: 'reset_kata_sandi_email', entitas: 'users', entitas_id: u.id, ip: req.ip });
  res.json({ ok: true });
});

// ---------- Data publik ----------
r.get('/public/config', (_req, res) => {
  res.json({
    versi_kebijakan: getConfig('versi_kebijakan', 'v1'), demo: process.env.MC_DEMO !== '0' && !!get("SELECT 1 AS x FROM users WHERE nim_nip = 'admin'"),
    prodi: [], // daftar prodi per kampus: GET /public/universities/:id (sebelum masuk) atau GET /campus (setelah masuk)
    domain_email: getConfig('domain_email', { mahasiswa: [], konselor: [] }), mail_mode: mailMode(),
    brand: (({ logo_url, nama_singkat, kepanjangan, institusi }) => ({ logo_url, nama_singkat, kepanjangan, institusi }))({ ...DEFAULT_HOME, ...getConfig('home', {}) }),
  });
});

r.get('/public/universities', rateLimit({ windowMs: 60000, max: 120 }), (req, res) => res.json(campus.searchUniversities(str(req.query.q, 80))));
r.get('/public/universities/:id', (req, res) => {
  const u = get('SELECT * FROM universities WHERE id = ?', str(req.params.id, 12));
  if (!u) fail(404, 'Perguruan tinggi tidak ditemukan.');
  res.json({ ...campus.universityView(u), prodi: campus.campusProdi(u.id), fakultas: campus.campusFaculties(u.id),
    konselor: campus.campusCounselors(u.id, str(req.query.prodi, 40) || null), koordinator_aktif: coordinators(u.id).length > 0 });
});

r.get('/public/home', (_req, res) => {
  const home = { ...DEFAULT_HOME, ...getConfig('home', {}) };
  // Jawaban FAQ lama yang masih merujuk nomor darurat 119 diganti dengan arahan ke layanan konseling PAN-JALU
  home.faq = (home.faq || []).map((f) => (/\b119\b|Healing119/i.test(`${f.tanya} ${f.jawab}`) ? { ...f, jawab: DARURAT_FAQ } : f));
  const stats = home.tampilkan_statistik ? {
    mahasiswa: get("SELECT COUNT(*) AS n FROM users WHERE role = 'mahasiswa' AND status = 'aktif'").n,
    konselor: get("SELECT COUNT(*) AS n FROM users WHERE role = 'konselor' AND status = 'aktif'").n,
    konten: get("SELECT COUNT(*) AS n FROM content_items WHERE status = 'published'").n,
    sesi: get("SELECT COUNT(*) AS n FROM appointments WHERE status = 'selesai'").n,
  } : null;
  const lite = (m) => (m ? { ...m, kode: undefined } : m); // kode embed hanya disajikan lewat /embed/<id>
  res.json({ ...home, blok: (home.blok || []).filter((b) => b.tampil !== false).map((b) => ({ ...b, media: lite(b.media) })), hero_media: lite(home.hero_media), stats });
});

r.use(authenticate);

r.get('/users/me', (req, res) => res.json(publicUser(req.user)));

// Data kampus pengguna: prodi, fakultas, dan konselor pilihan (mahasiswa)
r.get('/campus', (req, res) => {
  const uni = req.user.university_id;
  if (!uni) return res.json({ universitas: null, prodi: [], fakultas: [] });
  res.json({ universitas: campus.universityView(get('SELECT * FROM universities WHERE id = ?', uni)), prodi: campus.campusProdi(uni), fakultas: campus.campusFaculties(uni),
    ...(req.user.role === 'mahasiswa' ? { konselor: campus.campusCounselors(uni, req.user.prodi_id), konselor_saya: campus.myCounselorIds(req.user.id) } : {}) });
});
r.put('/users/me/counselors', (req, res) => {
  if (req.user.role !== 'mahasiswa') fail(403, 'Hanya untuk mahasiswa.');
  const ids = campus.setStudentCounselors(req.user.id, req.user.university_id, req.body?.ids);
  audit({ actor: req.user, aksi: 'ubah_konselor_pilihan', entitas: 'student_counselors', student_id: req.user.id, alasan: `${ids.length} konselor`, ip: req.ip });
  res.json({ konselor_saya: ids });
});

r.patch('/users/me', (req, res) => {
  const b = req.body || {};
  const f = {};
  if ('telepon' in b) f.telepon = enc(str(b.telepon, 40));
  if ('alamat' in b) f.alamat = enc(str(b.alamat, 300));
  if ('identitas_disamarkan' in b && req.user.role === 'mahasiswa') f.identitas_disamarkan = b.identitas_disamarkan ? 1 : 0;
  update('users', req.user.id, f);
  res.json(publicUser(get('SELECT * FROM users WHERE id = ?', req.user.id)));
});

r.post('/users/me/password', (req, res) => {
  const { lama, baru } = req.body || {};
  if (!verifyPassword(String(lama || ''), req.user.password_hash)) fail(400, 'Kata sandi lama tidak sesuai.');
  const err = strongPassword(String(baru || '')); if (err) fail(400, err);
  update('users', req.user.id, { password_hash: hashPassword(String(baru)), token_version: req.user.token_version + 1 });
  run('UPDATE sessions SET revoked = 1 WHERE user_id = ?', req.user.id);
  audit({ actor: req.user, aksi: 'ganti_kata_sandi', entitas: 'users', entitas_id: req.user.id, ip: req.ip });
  res.json({ ok: true });
});

r.get('/consents/me', (req, res) => res.json(all('SELECT id, jenis_consent, disetujui_pada, versi_kebijakan, appointment_id FROM consents WHERE user_id = ? ORDER BY disetujui_pada DESC', req.user.id)));

r.post('/consents', (req, res) => {
  const jenis = str(req.body?.jenis_consent, 60);
  if (!['layanan_umum', 'asesmen', 'konseling', 'penelitian'].includes(jenis)) fail(400, 'Jenis persetujuan tidak dikenal.');
  const id = insert('consents', { user_id: req.user.id, jenis_consent: jenis, disetujui_pada: nowIso(), versi_kebijakan: getConfig('versi_kebijakan', 'v1'), alamat_ip: req.ip });
  audit({ actor: req.user, aksi: 'consent_dicatat', entitas: 'consents', entitas_id: id, student_id: req.user.id, ip: req.ip });
  res.status(201).json({ id });
});

module.exports = { router: r, publicUser };
