// Konselor PAN-JALU: konselor yang disetujui admin untuk melayani mahasiswa lintas kampus, terutama mahasiswa
// yang kampusnya belum memiliki konselor. Mahasiswa memilih sendiri satu Konselor PAN-JALU (dengan persetujuan akses
// data asesmen & perkembangan) dan dapat menggantinya kapan saja; kewenangan akses berpindah bersama pilihan itu.
const express = require('express');
const { all, get, run, insert, update, tx, nowIso, audit, getConfig } = require('../db');
const { fail, requireRole, str } = require('../http');
const { notify, admins, isOnline, panjaluOf, isPanjalu, panjaluClientIds, campusHasCounselor } = require('../services');
const campus = require('../campus');
const { mails } = require('../mailer');

const r = express.Router();
const mahasiswa = requireRole('mahasiswa');
const konselor = requireRole('konselor');
const admin = requireRole('admin');
const PERAN = 'Konselor PAN-JALU';

const rowOf = (userId) => get('SELECT * FROM panjalu_counselors WHERE user_id = ?', userId);
const clientCount = (userId) => panjaluClientIds(userId).length;
const asal = (u) => (u.university_id === campus.PANJALU_UNI ? 'Konselor independen' : campus.universityName(u.university_id) || '-');

// Konselor kehilangan status PAN-JALU: konselinya dilepas dan diminta memilih konselor baru
function releaseClients(counselorId, alasan) {
  const ids = panjaluClientIds(counselorId);
  tx(() => {
    run("DELETE FROM student_counselors WHERE counselor_id = ? AND jenis = 'panjalu'", counselorId);
    for (const sid of ids) {
      run('UPDATE users SET pilih_konselor_pada = NULL WHERE id = ?', sid);
      notify(sid, { tipe: 'konseling', judul: 'Konselor PAN-JALU-mu tidak lagi aktif', isi: `${alasan} Akses konselor tersebut ke data asesmenmu sudah dicabut. Pilih konselor pendamping baru di menu Profil.`, tautan: '#/s/profil' });
    }
  });
  return ids.length;
}

// ---------- Mahasiswa: memilih / mengganti Konselor PAN-JALU ----------
r.get('/panjalu-counselors', mahasiswa, (req, res) => {
  const saya = panjaluOf(req.user.id);
  const rows = all(`SELECT u.id, u.nama, u.university_id, c.gelar, c.spesialisasi, c.status_jaga, p.kapasitas FROM panjalu_counselors p JOIN users u ON u.id = p.user_id
    JOIN counselors c ON c.user_id = u.id WHERE p.status = 'aktif' AND u.status = 'aktif' ORDER BY u.nama`);
  res.json({
    saya,
    kampus_punya_konselor: campusHasCounselor(req.user.university_id),
    items: rows.map((c) => { const n = clientCount(c.id); return { id: c.id, nama: c.nama, gelar: c.gelar, spesialisasi: c.spesialisasi, asal: asal(c), sekampus: c.university_id === req.user.university_id,
      status_jaga: !!c.status_jaga, online: isOnline(c.id), konseli: n, kapasitas: c.kapasitas, penuh: n >= c.kapasitas && c.id !== saya }; }),
  });
});
r.put('/users/me/panjalu-counselor', mahasiswa, (req, res) => {
  const cid = str(req.body?.counselor_id, 40) || null;
  const lama = panjaluOf(req.user.id);
  if (cid === lama) return res.json({ saya: lama });
  if (cid) {
    if (!req.body?.setuju) fail(400, 'Centang persetujuan bahwa Konselor PAN-JALU yang kamu pilih dapat mengakses data asesmen dan perkembanganmu.');
    if (!isPanjalu(cid)) fail(404, 'Konselor PAN-JALU tidak ditemukan atau tidak aktif.');
    if (clientCount(cid) >= rowOf(cid).kapasitas) fail(409, 'Konselor ini sudah mencapai batas jumlah konseli. Pilih konselor lain.');
  }
  tx(() => {
    run("DELETE FROM student_counselors WHERE student_id = ? AND jenis = 'panjalu'", req.user.id);
    if (cid) {
      run("DELETE FROM student_counselors WHERE student_id = ? AND counselor_id = ?", req.user.id, cid); // bila sebelumnya dipilih sebagai konselor kampus
      insert('student_counselors', { student_id: req.user.id, counselor_id: cid, jenis: 'panjalu' });
      insert('consents', { user_id: req.user.id, jenis_consent: 'akses_konselor_panjalu', disetujui_pada: nowIso(), versi_kebijakan: getConfig('versi_kebijakan', 'v1'), alamat_ip: req.ip });
    }
    run('UPDATE users SET pilih_konselor_pada = ? WHERE id = ?', nowIso(), req.user.id);
  });
  const nama = req.user.identitas_disamarkan ? 'Seorang mahasiswa' : req.user.nama;
  const kampus = campus.universityName(req.user.university_id) || '-';
  if (lama) notify(lama, { tipe: 'konseling', judul: 'Konseli PAN-JALU berpindah konselor', isi: `${nama} (${kampus}) mengganti Konselor PAN-JALU-nya. Akses Anda ke datanya telah berakhir.`, tautan: '#/c/mahasiswa' });
  if (cid) notify(cid, { tipe: 'konseling', judul: 'Konseli PAN-JALU baru', isi: `${nama} (${kampus}) memilih Anda sebagai Konselor PAN-JALU dan menyetujui akses data asesmen & perkembangannya.`, tautan: `#/c/mahasiswa/${req.user.id}` });
  audit({ actor: req.user, aksi: cid ? (lama ? 'ganti_konselor_panjalu' : 'pilih_konselor_panjalu') : 'lepas_konselor_panjalu', entitas: 'student_counselors', entitas_id: cid || lama, student_id: req.user.id, ip: req.ip });
  res.json({ saya: cid });
});
// "Nanti saja" pada ajakan memilih konselor saat masuk pertama kali
r.post('/users/me/pilih-konselor-nanti', mahasiswa, (req, res) => {
  run('UPDATE users SET pilih_konselor_pada = COALESCE(pilih_konselor_pada, ?) WHERE id = ?', nowIso(), req.user.id);
  res.json({ ok: true });
});

// ---------- Konselor: mengajukan / melepas status Konselor PAN-JALU ----------
r.get('/panjalu/me', konselor, (req, res) => {
  const p = rowOf(req.user.id);
  res.json({ pengajuan: p ? { status: p.status, alasan: p.alasan, catatan: p.catatan, kapasitas: p.kapasitas, independen: !!p.independen, diajukan_pada: p.diajukan_pada || p.created_at, ditinjau_pada: p.ditinjau_pada } : null,
    konseli: clientCount(req.user.id), bisa_mengajukan: !p || ['ditolak', 'dicabut', 'dilepas'].includes(p.status) });
});
r.post('/panjalu/apply', konselor, (req, res) => {
  const p = rowOf(req.user.id);
  if (p && ['menunggu', 'aktif'].includes(p.status)) fail(409, p.status === 'aktif' ? 'Anda sudah menjadi Konselor PAN-JALU.' : 'Pengajuan Anda sedang menunggu persetujuan admin.');
  const alasan = str(req.body?.alasan, 1000); if (alasan.length < 10) fail(400, 'Tuliskan alasan/pengalaman Anda (minimal 10 karakter).');
  const f = { alasan, status: 'menunggu', diajukan_pada: nowIso(), ditinjau_oleh: null, ditinjau_pada: null, catatan: null };
  const id = p ? (update('panjalu_counselors', p.id, f), p.id) : insert('panjalu_counselors', { user_id: req.user.id, ...f });
  notifyAdmins(req.user);
  audit({ actor: req.user, aksi: 'konselor_panjalu_diajukan', entitas: 'panjalu_counselors', entitas_id: id, ip: req.ip });
  res.status(201).json({ id });
});
function notifyAdmins(u) {
  const kampus = asal(u);
  for (const a of all("SELECT id, email FROM users WHERE role = 'admin' AND status = 'aktif'")) {
    notify(a.id, { tipe: 'pendaftar', judul: 'Pengajuan Konselor PAN-JALU', isi: `${u.nama} (${kampus}) mengajukan diri sebagai Konselor PAN-JALU.`, tautan: '#/a/panjalu' });
    mails.pendaftarBaru(a.email, u.nama, PERAN, '#/a/panjalu').catch((e) => console.error('[email]', e.message));
  }
}
r.delete('/panjalu/me', konselor, (req, res) => {
  const p = rowOf(req.user.id);
  if (!p || !['menunggu', 'aktif'].includes(p.status)) fail(404, 'Tidak ada pengajuan atau status Konselor PAN-JALU yang aktif.');
  if (p.independen && p.status === 'aktif') fail(409, 'Akun Anda terdaftar sebagai Konselor PAN-JALU independen. Hubungi admin untuk menonaktifkan akun.');
  update('panjalu_counselors', p.id, { status: 'dilepas', ditinjau_pada: nowIso() });
  const n = p.status === 'aktif' ? releaseClients(req.user.id, `${req.user.nama} tidak lagi bertugas sebagai Konselor PAN-JALU.`) : 0;
  if (p.status === 'aktif') for (const uid of admins()) notify(uid, { tipe: 'pendaftar', judul: 'Konselor PAN-JALU melepas statusnya', isi: `${req.user.nama} melepas status Konselor PAN-JALU (${n} konseli diminta memilih konselor baru).`, tautan: '#/a/panjalu' });
  audit({ actor: req.user, aksi: 'konselor_panjalu_dilepas', entitas: 'panjalu_counselors', entitas_id: p.id, alasan: `${n} konseli`, ip: req.ip });
  res.json({ ok: true, konseli_dilepas: n });
});

// ---------- Admin: mengelola Konselor PAN-JALU ----------
r.get('/admin/panjalu', admin, (req, res) => {
  const st = ['menunggu', 'aktif', 'ditolak', 'dicabut', 'dilepas'].includes(req.query.status) ? req.query.status : null;
  const rows = all(`SELECT p.*, u.nama, u.email, u.nim_nip, u.status AS status_akun, u.university_id, u.last_login_at, c.spesialisasi, c.gelar, c.status_jaga, v.nama AS peninjau
    FROM panjalu_counselors p JOIN users u ON u.id = p.user_id LEFT JOIN counselors c ON c.user_id = u.id LEFT JOIN users v ON v.id = p.ditinjau_oleh
    ${st ? 'WHERE p.status = ?' : ''} ORDER BY CASE p.status WHEN 'menunggu' THEN 0 WHEN 'aktif' THEN 1 ELSE 2 END, COALESCE(p.diajukan_pada, p.created_at) DESC LIMIT 500`, ...(st ? [st] : []));
  const jumlah = Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM panjalu_counselors GROUP BY status').map((x) => [x.status, x.n]));
  const n = (sql, ...p) => get(sql, ...p).n;
  res.json({
    jumlah,
    ringkasan: {
      konseli_panjalu: n("SELECT COUNT(*) AS n FROM student_counselors sc JOIN users u ON u.id = sc.student_id WHERE sc.jenis = 'panjalu' AND u.status = 'aktif'"),
      mahasiswa_tanpa_konselor: n("SELECT COUNT(*) AS n FROM users u WHERE u.role = 'mahasiswa' AND u.status = 'aktif' AND NOT EXISTS (SELECT 1 FROM student_counselors sc WHERE sc.student_id = u.id)"),
      // mahasiswa aktif di kampus yang belum punya konselor dan belum memilih Konselor PAN-JALU (paling membutuhkan)
      tanpa_layanan: n(`SELECT COUNT(*) AS n FROM users u WHERE u.role = 'mahasiswa' AND u.status = 'aktif' AND NOT EXISTS (SELECT 1 FROM student_counselors sc WHERE sc.student_id = u.id)
        AND NOT EXISTS (SELECT 1 FROM users k WHERE k.role = 'konselor' AND k.status = 'aktif' AND k.university_id = u.university_id)`),
      kampus_tanpa_konselor: n(`SELECT COUNT(DISTINCT u.university_id) AS n FROM users u WHERE u.role = 'mahasiswa' AND u.status = 'aktif'
        AND NOT EXISTS (SELECT 1 FROM users k WHERE k.role = 'konselor' AND k.status = 'aktif' AND k.university_id = u.university_id)`),
      krisis_terbuka: n(`SELECT COUNT(*) AS n FROM risk_alerts r JOIN users u ON u.id = r.student_id WHERE r.level = 'red' AND r.ditindaklanjuti_pada IS NULL
        AND (EXISTS (SELECT 1 FROM student_counselors sc WHERE sc.student_id = u.id AND sc.jenis = 'panjalu') OR NOT EXISTS (SELECT 1 FROM users k WHERE k.role = 'konselor' AND k.status = 'aktif' AND k.university_id = u.university_id))`),
    },
    items: rows.map((p) => ({ id: p.id, user_id: p.user_id, nama: p.nama, email: p.email, nip: p.nim_nip, asal: asal(p), independen: !!p.independen, status: p.status, status_akun: p.status_akun,
      spesialisasi: p.spesialisasi, gelar: p.gelar, alasan: p.alasan, catatan: p.catatan, kapasitas: p.kapasitas, konseli: clientCount(p.user_id), status_jaga: !!p.status_jaga, online: isOnline(p.user_id),
      diajukan_pada: p.diajukan_pada || p.created_at, ditinjau_pada: p.ditinjau_pada, peninjau: p.peninjau, terakhir_masuk: p.last_login_at })),
  });
});
const appOr404 = (id, ...status) => { const p = get('SELECT * FROM panjalu_counselors WHERE id = ?', id); if (!p || (status.length && !status.includes(p.status))) fail(404, 'Data tidak ditemukan atau sudah diproses.'); return p; };
const kapasitasOf = (v, def) => { const k = Number(v ?? def); if (!Number.isInteger(k) || k < 1 || k > 500) fail(400, 'Kapasitas konseli harus 1–500.'); return k; };
function inform(u, judul, isi) { notify(u.id, { tipe: 'pendaftar', judul, isi: isi || null, tautan: '#/c/dashboard' }); }

r.post('/admin/panjalu/:id/approve', admin, (req, res) => {
  const p = appOr404(req.params.id, 'menunggu');
  const u = get('SELECT * FROM users WHERE id = ?', p.user_id);
  if (u.status === 'menunggu_verifikasi') fail(409, 'Konselor belum memverifikasi emailnya.');
  if (!p.independen && u.status !== 'aktif') fail(409, 'Akun konselor belum disetujui Koordinator Layanan BK kampusnya atau tidak aktif.');
  if (p.independen && !['aktif', 'menunggu_persetujuan'].includes(u.status)) fail(409, 'Akun konselor tidak aktif.');
  const kapasitas = kapasitasOf(req.body?.kapasitas, p.kapasitas);
  tx(() => {
    update('panjalu_counselors', p.id, { status: 'aktif', kapasitas, ditinjau_oleh: req.user.id, ditinjau_pada: nowIso(), catatan: str(req.body?.catatan, 500) || null });
    if (u.status === 'menunggu_persetujuan') update('users', u.id, { status: 'aktif', aktif: 1, disetujui_oleh: req.user.id, disetujui_pada: nowIso(), alasan_penolakan: null });
  });
  inform(u, 'Anda kini Konselor PAN-JALU', 'Mahasiswa dari kampus mana pun dapat memilih Anda sebagai konselor pendamping.');
  mails.konselorDisetujui(u.email, u.nama, PERAN).catch((e) => console.error('[email]', e.message));
  audit({ actor: req.user, aksi: 'konselor_panjalu_disetujui', entitas: 'panjalu_counselors', entitas_id: p.id, alasan: `kapasitas ${kapasitas}`, ip: req.ip });
  res.json({ ok: true });
});
r.post('/admin/panjalu/:id/reject', admin, (req, res) => {
  const p = appOr404(req.params.id, 'menunggu');
  const catatan = str(req.body?.catatan, 500); if (catatan.length < 5) fail(400, 'Tuliskan alasan penolakan.');
  const u = get('SELECT * FROM users WHERE id = ?', p.user_id);
  tx(() => {
    update('panjalu_counselors', p.id, { status: 'ditolak', ditinjau_oleh: req.user.id, ditinjau_pada: nowIso(), catatan });
    if (p.independen && u.status === 'menunggu_persetujuan') update('users', u.id, { status: 'ditolak', aktif: 0, alasan_penolakan: catatan });
  });
  inform(u, 'Pengajuan Konselor PAN-JALU belum disetujui', catatan);
  mails.konselorDitolak(u.email, u.nama, catatan, PERAN).catch((e) => console.error('[email]', e.message));
  audit({ actor: req.user, aksi: 'konselor_panjalu_ditolak', entitas: 'panjalu_counselors', entitas_id: p.id, alasan: catatan, ip: req.ip });
  res.json({ ok: true });
});
r.post('/admin/panjalu/:id/revoke', admin, (req, res) => {
  const p = appOr404(req.params.id, 'aktif');
  const catatan = str(req.body?.catatan, 500); if (catatan.length < 5) fail(400, 'Tuliskan alasan pencabutan.');
  const u = get('SELECT * FROM users WHERE id = ?', p.user_id);
  update('panjalu_counselors', p.id, { status: 'dicabut', ditinjau_oleh: req.user.id, ditinjau_pada: nowIso(), catatan });
  // Konselor independen hanya bertugas sebagai Konselor PAN-JALU: akunnya ikut dinonaktifkan
  if (p.independen) update('users', u.id, { status: 'nonaktif', aktif: 0, token_version: (u.token_version || 0) + 1 });
  const n = releaseClients(u.id, 'Status Konselor PAN-JALU konselormu telah berakhir.');
  inform(u, 'Status Konselor PAN-JALU dicabut admin', catatan);
  audit({ actor: req.user, aksi: 'konselor_panjalu_dicabut', entitas: 'panjalu_counselors', entitas_id: p.id, alasan: `${catatan} (${n} konseli dilepas)`, ip: req.ip });
  res.json({ ok: true, konseli_dilepas: n });
});
r.patch('/admin/panjalu/:id', admin, (req, res) => {
  const p = appOr404(req.params.id);
  const kapasitas = kapasitasOf(req.body?.kapasitas, p.kapasitas);
  update('panjalu_counselors', p.id, { kapasitas });
  audit({ actor: req.user, aksi: 'konselor_panjalu_kapasitas', entitas: 'panjalu_counselors', entitas_id: p.id, alasan: String(kapasitas), ip: req.ip });
  res.json({ ok: true });
});

module.exports = r;
