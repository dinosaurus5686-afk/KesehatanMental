// Klaim rangkap Koordinator Layanan BK oleh konselor: bila kampus belum memiliki koordinator, seorang konselor aktif dapat
// mengajukan diri; admin menyetujui/menolak. Setelah disetujui, akun konselor itu merangkap koordinator (pengalih mode di aplikasi).
const express = require('express');
const { all, get, insert, update, nowIso, audit } = require('../db');
const { fail, requireRole, str } = require('../http');
const { notify, coordinators, admins } = require('../services');
const campus = require('../campus');
const { mails } = require('../mailer');

const r = express.Router();
const konselor = requireRole('konselor');
const admin = requireRole('admin');
const PERAN = 'Koordinator Layanan BK (rangkap konselor)';

const latestClaim = (userId) => get('SELECT * FROM coordinator_claims WHERE user_id = ? ORDER BY created_at DESC LIMIT 1', userId);
const pendingAtCampus = (uni) => get("SELECT c.*, u.nama FROM coordinator_claims c JOIN users u ON u.id = c.user_id WHERE c.university_id = ? AND c.status = 'menunggu'", uni);
// Status kelayakan konselor untuk mengajukan klaim
function eligibility(user) {
  const mine = latestClaim(user.id);
  if (mine?.status === 'disetujui') return { boleh: false, alasan: 'Anda sudah merangkap Koordinator Layanan BK.' };
  if (mine?.status === 'menunggu') return { boleh: false, alasan: 'Pengajuan Anda sedang menunggu persetujuan admin.' };
  if (!user.university_id) return { boleh: false, alasan: 'Akun Anda belum terhubung ke perguruan tinggi.' };
  if (coordinators(user.university_id).length) return { boleh: false, alasan: 'Kampus Anda sudah memiliki Koordinator Layanan BK.' };
  const lain = pendingAtCampus(user.university_id);
  if (lain) return { boleh: false, alasan: `${lain.nama} sudah mengajukan diri dan sedang menunggu persetujuan admin.` };
  return { boleh: true, alasan: null };
}
const claimView = (c) => (c ? { id: c.id, status: c.status, alasan: c.alasan, catatan: c.catatan, diajukan_pada: c.created_at, ditinjau_pada: c.ditinjau_pada } : null);

// ---- Konselor ----
r.get('/coord-claim/me', konselor, (req, res) => {
  const e = eligibility(req.user);
  res.json({ klaim: claimView(latestClaim(req.user.id)), bisa_mengajukan: e.boleh, alasan_tidak_bisa: e.alasan, kampus: campus.universityName(req.user.university_id) });
});
r.post('/coord-claim', konselor, (req, res) => {
  const e = eligibility(req.user); if (!e.boleh) fail(409, e.alasan);
  const alasan = str(req.body?.alasan, 1000); if (alasan.length < 10) fail(400, 'Tuliskan alasan pengajuan (minimal 10 karakter).');
  const id = insert('coordinator_claims', { user_id: req.user.id, university_id: req.user.university_id, alasan, status: 'menunggu' });
  const kampus = campus.universityName(req.user.university_id) || '-';
  for (const a of all("SELECT id, email FROM users WHERE role = 'admin' AND status = 'aktif'")) {
    notify(a.id, { tipe: 'pendaftar', judul: 'Pengajuan rangkap Koordinator Layanan BK', isi: `${req.user.nama} (${kampus}) mengajukan diri merangkap koordinator.`, tautan: '#/a/koordinator' });
    mails.klaimKoordinator(a.email, req.user.nama, kampus).catch((er) => console.error('[email]', er.message));
  }
  audit({ actor: req.user, aksi: 'klaim_koordinator_diajukan', entitas: 'coordinator_claims', entitas_id: id, alasan: kampus, ip: req.ip });
  res.status(201).json({ id });
});
// Batalkan pengajuan yang menunggu, atau lepas peran koordinator yang sudah disetujui
r.delete('/coord-claim/me', konselor, (req, res) => {
  const c = latestClaim(req.user.id);
  if (!c || !['menunggu', 'disetujui'].includes(c.status)) fail(404, 'Tidak ada pengajuan aktif.');
  const status = c.status === 'menunggu' ? 'dibatalkan' : 'dilepas';
  update('coordinator_claims', c.id, { status, ditinjau_pada: nowIso() });
  if (status === 'dilepas') for (const uid of admins()) notify(uid, { tipe: 'pendaftar', judul: 'Peran rangkap koordinator dilepas', isi: `${req.user.nama} (${campus.universityName(req.user.university_id) || '-'}) melepas peran Koordinator Layanan BK.`, tautan: '#/a/koordinator' });
  audit({ actor: req.user, aksi: `klaim_koordinator_${status}`, entitas: 'coordinator_claims', entitas_id: c.id, ip: req.ip });
  res.json({ ok: true, status });
});

// ---- Admin ----
r.get('/admin/coord-claims', admin, (req, res) => {
  const st = ['menunggu', 'disetujui', 'ditolak', 'dibatalkan', 'dilepas', 'dicabut'].includes(req.query.status) ? req.query.status : null;
  const rows = all(`SELECT c.*, u.nama, u.email, u.nim_nip, u.status AS status_akun, k.spesialisasi, un.nama AS universitas, v.nama AS peninjau
    FROM coordinator_claims c JOIN users u ON u.id = c.user_id LEFT JOIN counselors k ON k.user_id = u.id LEFT JOIN universities un ON un.id = c.university_id LEFT JOIN users v ON v.id = c.ditinjau_oleh
    ${st ? 'WHERE c.status = ?' : ''} ORDER BY CASE c.status WHEN 'menunggu' THEN 0 WHEN 'disetujui' THEN 1 ELSE 2 END, c.created_at DESC LIMIT 300`, ...(st ? [st] : []));
  const count = Object.fromEntries(all('SELECT status, COUNT(*) AS n FROM coordinator_claims GROUP BY status').map((x) => [x.status, x.n]));
  res.json({ jumlah: count, items: rows.map((c) => ({ ...claimView(c), nama: c.nama, email: c.email, nip: c.nim_nip, spesialisasi: c.spesialisasi, universitas: c.universitas, peninjau: c.peninjau,
    koordinator_lain: c.status === 'menunggu' ? all("SELECT nama FROM users WHERE role = 'koordinator' AND status = 'aktif' AND university_id IS ?", c.university_id).map((x) => x.nama) : [] })) });
});
function decide(req, c, status, catatan) {
  update('coordinator_claims', c.id, { status, ditinjau_oleh: req.user.id, ditinjau_pada: nowIso(), catatan: catatan || null });
  const u = get('SELECT id, nama, email FROM users WHERE id = ?', c.user_id);
  const msg = {
    disetujui: ['Anda kini merangkap Koordinator Layanan BK', 'Gunakan pengalih mode di menu samping untuk membuka menu koordinator.'],
    ditolak: ['Pengajuan Koordinator Layanan BK belum disetujui', catatan],
    dicabut: ['Peran rangkap Koordinator Layanan BK dicabut admin', catatan],
  }[status];
  notify(u.id, { tipe: 'pendaftar', judul: msg[0], isi: msg[1] || null, tautan: '#/c/dashboard' });
  if (status === 'disetujui') mails.konselorDisetujui(u.email, u.nama, PERAN).catch((e) => console.error('[email]', e.message));
  if (status === 'ditolak') mails.konselorDitolak(u.email, u.nama, catatan, PERAN).catch((e) => console.error('[email]', e.message));
  audit({ actor: req.user, aksi: `klaim_koordinator_${status}`, entitas: 'coordinator_claims', entitas_id: c.id, student_id: null, alasan: catatan || null, ip: req.ip });
}
const claimOr404 = (id, status) => { const c = get('SELECT * FROM coordinator_claims WHERE id = ?', id); if (!c || (status && c.status !== status)) fail(404, 'Pengajuan tidak ditemukan atau sudah diproses.'); return c; };
r.post('/admin/coord-claims/:id/approve', admin, (req, res) => {
  const c = claimOr404(req.params.id, 'menunggu');
  const u = get('SELECT status, role FROM users WHERE id = ?', c.user_id);
  if (!u || u.role !== 'konselor' || u.status !== 'aktif') fail(409, 'Akun konselor tidak aktif; pengajuan tidak dapat disetujui.');
  decide(req, c, 'disetujui', str(req.body?.catatan, 500));
  res.json({ ok: true });
});
r.post('/admin/coord-claims/:id/reject', admin, (req, res) => {
  const c = claimOr404(req.params.id, 'menunggu');
  const catatan = str(req.body?.catatan, 500); if (catatan.length < 5) fail(400, 'Tuliskan alasan penolakan.');
  decide(req, c, 'ditolak', catatan); res.json({ ok: true });
});
r.post('/admin/coord-claims/:id/revoke', admin, (req, res) => {
  const c = claimOr404(req.params.id, 'disetujui');
  const catatan = str(req.body?.catatan, 500); if (catatan.length < 5) fail(400, 'Tuliskan alasan pencabutan.');
  decide(req, c, 'dicabut', catatan); res.json({ ok: true });
});

module.exports = r;
