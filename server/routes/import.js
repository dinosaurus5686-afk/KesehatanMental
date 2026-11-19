// Pendaftaran mahasiswa secara kolektif oleh konselor (unggah Excel dengan templat tertentu).
// Akun dibuat berstatus "menunggu aktivasi"; mahasiswa menerima email untuk membuat kata sandi dan menyetujui kebijakan
// privasi. Konselor pengunggah otomatis menjadi konselor pendamping (binaan) mahasiswa tersebut.
const express = require('express');
const crypto = require('node:crypto');
const ExcelJS = require('exceljs');
const { all, get, run, insert, update, tx, audit, getConfig, nowIso } = require('../db');
const { fail, requireRole, str, rateLimit } = require('../http');
const { hashPassword, sha256, randomToken, enc } = require('../security');
const { mails } = require('../mailer');
const { notify } = require('../services');
const campus = require('../campus');

const r = express.Router();
const konselor = requireRole('konselor');
const MAX_ROWS = 500;
const INVITE_DAYS = 14;
const COLS = [
  ['nim', 'NIM*', 16, ['nim', 'npm', 'nomor induk']], ['nama', 'Nama lengkap*', 30, ['nama']], ['email', 'Email aktif*', 30, ['email', 'surel']],
  ['prodi', 'Program studi', 30, ['program studi', 'prodi', 'jurusan']], ['angkatan', 'Angkatan*', 10, ['angkatan', 'tahun masuk']], ['kelas', 'Kelas', 8, ['kelas']],
  ['gender', 'Jenis kelamin (L/P)', 18, ['jenis kelamin', 'gender', 'l/p']], ['telepon', 'No. telepon/WhatsApp', 20, ['telepon', 'hp', 'whatsapp', 'wa']],
];
const ownCampus = (req) => {
  const uni = req.user.university_id;
  if (!uni || uni === campus.PANJALU_UNI) fail(403, 'Pendaftaran kolektif hanya untuk konselor yang terdaftar pada perguruan tinggi.');
  return uni;
};

// ---- Templat Excel ----
r.get('/counselor/import/template', konselor, async (req, res) => {
  const uni = ownCampus(req);
  const wb = new ExcelJS.Workbook(); wb.creator = 'PAN-JALU';
  const ws = wb.addWorksheet('Mahasiswa');
  ws.columns = COLS.map(([key, header, width]) => ({ key, header, width }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }; ws.getRow(1).eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F55D4' } }; });
  ws.addRow({ nim: '2413020001', nama: 'Contoh Nama Mahasiswa', email: 'contoh@mhs.kampus.ac.id', prodi: campus.campusProdi(uni)[0]?.nama || 'Pendidikan Matematika', angkatan: new Date().getFullYear(), kelas: 'A', gender: 'P', telepon: '081234567890' }).font = { italic: true, color: { argb: 'FF8A94B8' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.getColumn('nim').numFmt = '@'; ws.getColumn('telepon').numFmt = '@';
  const pr = wb.addWorksheet('Daftar Prodi');
  pr.columns = [{ header: 'Program studi', key: 'nama', width: 40 }, { header: 'Fakultas', key: 'fakultas', width: 40 }, { header: 'Jenjang', key: 'jenjang', width: 10 }];
  pr.getRow(1).font = { bold: true }; pr.addRows(campus.campusProdi(uni));
  const pt = wb.addWorksheet('Petunjuk');
  [['Petunjuk pengisian'], ['1. Isi lembar "Mahasiswa" mulai baris 2 (baris contoh boleh ditimpa atau dihapus). Kolom bertanda * wajib.'], ['2. Program studi ditulis sesuai lembar "Daftar Prodi". Prodi yang belum ada akan dicatat sebagai usulan untuk dirapikan koordinator.'],
    ['3. Email harus aktif: mahasiswa menerima tautan aktivasi untuk membuat kata sandi dan menyetujui kebijakan privasi.'], [`4. Maksimal ${MAX_ROWS} mahasiswa per unggahan. NIM/email yang sudah terdaftar dilewati.`], ['5. Anda otomatis menjadi konselor pendamping mahasiswa yang didaftarkan.']]
    .forEach((x, i) => { const row = pt.addRow(x); if (!i) row.font = { bold: true, size: 13 }; });
  pt.getColumn(1).width = 110;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="templat-daftar-mahasiswa-pan-jalu.xlsx"');
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});

// ---- Membaca & memvalidasi berkas ----
const cellText = (v) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') { if (v.text) return String(v.text?.richText ? v.text.richText.map((t) => t.text).join('') : v.text); if (v.richText) return v.richText.map((t) => t.text).join(''); if (v.result !== undefined) return String(v.result); if (v instanceof Date) return String(v.getFullYear()); return ''; }
  return String(v);
};
async function parse(b64) {
  const buf = Buffer.from(String(b64 || ''), 'base64');
  if (buf.length < 100 || buf.subarray(0, 2).toString() !== 'PK') fail(400, 'Berkas harus berformat Excel (.xlsx). Gunakan templat yang disediakan.');
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch { fail(400, 'Berkas Excel tidak dapat dibaca. Simpan ulang sebagai .xlsx.'); }
  const ws = wb.getWorksheet('Mahasiswa') || wb.worksheets[0]; if (!ws) fail(400, 'Lembar data tidak ditemukan.');
  let headerRow = 0; let map = null;
  for (let i = 1; i <= Math.min(10, ws.rowCount); i++) {
    const vals = ws.getRow(i).values.map((v) => cellText(v).toLowerCase().trim());
    const m = {}; for (const [key, , , aliases] of COLS) { const j = vals.findIndex((v) => v && aliases.some((a) => v.startsWith(a))); if (j > 0) m[key] = j; }
    if (m.nim && m.nama && m.email) { headerRow = i; map = m; break; }
  }
  if (!map) fail(400, 'Kolom NIM, Nama lengkap, dan Email tidak ditemukan. Gunakan templat yang disediakan.');
  const rows = [];
  for (let i = headerRow + 1; i <= ws.rowCount; i++) {
    const row = ws.getRow(i); const o = { baris: i };
    for (const [key] of COLS) o[key] = map[key] ? cellText(row.getCell(map[key]).value).trim().replace(/\s+/g, ' ') : '';
    if (!o.nim && !o.nama && !o.email) continue;
    rows.push(o);
  }
  return rows;
}
function validate(rows, uni) {
  if (rows.length > MAX_ROWS) fail(400, `Maksimal ${MAX_ROWS} mahasiswa per unggahan (berkas berisi ${rows.length}). Bagi menjadi beberapa berkas.`);
  const domains = getConfig('domain_email', { mahasiswa: [] }).mahasiswa || [];
  const prodi = campus.campusProdi(uni, { semua: true });
  const findProdi = (n) => prodi.find((p) => p.nama.toLowerCase() === n.toLowerCase()) || prodi.find((p) => `${p.nama} (${p.jenjang})`.toLowerCase() === n.toLowerCase());
  const seenNim = new Set(); const seenEmail = new Set(); const y = new Date().getFullYear();
  return rows.map((o) => {
    const err = []; const email = o.email.toLowerCase(); o.email = email; o.gender = /^(l|laki)/i.test(o.gender) ? 'L' : /^(p|perempuan|w)/i.test(o.gender) ? 'P' : '';
    o.nim = o.nim.replace(/\.0$/, '');
    if (!/^[A-Za-z0-9.\-]{4,30}$/.test(o.nim)) err.push('NIM tidak valid');
    if (o.nama.length < 3) err.push('Nama kosong');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) err.push('Email tidak valid');
    else if (domains.length && !domains.some((d) => email.endsWith('@' + d) || email.endsWith('.' + d))) err.push(`Domain email harus ${domains.join(' / ')}`);
    const ang = Number(String(o.angkatan).slice(0, 4)); if (!(ang >= y - 10 && ang <= y)) err.push('Angkatan tidak valid'); else o.angkatan = ang;
    if (seenNim.has(o.nim)) err.push('NIM ganda di berkas'); if (seenEmail.has(email)) err.push('Email ganda di berkas');
    seenNim.add(o.nim); seenEmail.add(email);
    let status = err.length ? 'galat' : 'siap';
    if (!err.length) { const ex = get('SELECT nim_nip, email, university_id FROM users WHERE nim_nip = ? OR email = ?', o.nim, email); if (ex) { status = 'terdaftar'; err.push(ex.nim_nip === o.nim ? 'NIM sudah terdaftar' : 'Email sudah terdaftar'); } }
    const p = o.prodi ? findProdi(o.prodi) : null;
    return { ...o, status, keterangan: err.join('; ') || (o.prodi && !p ? 'Prodi baru → dicatat sebagai usulan' : ''), prodi_id: p?.id || null, prodi_baru: !!o.prodi && !p };
  });
}

async function sendInvite(user, counselorName, kampus) {
  run("UPDATE email_tokens SET used_at = ? WHERE user_id = ? AND tujuan = 'reset' AND used_at IS NULL", nowIso(), user.id);
  const token = randomToken();
  insert('email_tokens', { user_id: user.id, tujuan: 'reset', kode_hash: null, tautan_hash: sha256(token), expires_at: new Date(Date.now() + INVITE_DAYS * 86400000).toISOString() });
  run('UPDATE student_invites SET terkirim_pada = ?, jumlah_kirim = jumlah_kirim + 1 WHERE user_id = ?', nowIso(), user.id);
  await mails.undanganMahasiswa(user.email, user.nama, counselorName, kampus, token);
}

const importLimiter = rateLimit({ windowMs: 3600000, max: 20, key: (req) => req.user.id, message: 'Terlalu banyak unggahan. Coba lagi nanti.' });
r.post('/counselor/import', konselor, importLimiter, async (req, res) => {
  const uni = ownCampus(req);
  const rows = validate(await parse(req.body?.file), uni);
  const siap = rows.filter((x) => x.status === 'siap');
  const ringkas = { total: rows.length, siap: siap.length, galat: rows.filter((x) => x.status === 'galat').length, terdaftar: rows.filter((x) => x.status === 'terdaftar').length };
  if (!req.body?.simpan) return res.json({ ringkas, baris: rows });
  if (!siap.length) fail(400, 'Tidak ada baris yang siap didaftarkan.');
  const kampus = campus.universityName(uni) || '-';
  const created = tx(() => siap.map((o) => {
    let prodiId = o.prodi_id;
    if (o.prodi_baru) prodiId = get('SELECT id FROM prodi WHERE university_id = ? AND lower(nama_prodi) = lower(?)', uni, o.prodi)?.id
      || insert('prodi', { university_id: uni, nama_prodi: o.prodi, fakultas: 'Belum ditentukan', fakultas_kode: 'BD', jenjang: 'S1', status: 'usulan' });
    const id = insert('users', { role: 'mahasiswa', nim_nip: o.nim, nama: o.nama, email: o.email, password_hash: hashPassword(crypto.randomBytes(24).toString('hex')), status: 'menunggu_verifikasi', aktif: 0,
      university_id: uni, prodi_id: prodiId, angkatan: o.angkatan, kelas: o.kelas.slice(0, 5) || null, gender: o.gender || null, telepon: o.telepon ? enc(o.telepon.slice(0, 40)) : null, pilih_konselor_pada: nowIso() });
    insert('student_counselors', { student_id: id, counselor_id: req.user.id, jenis: 'kampus' });
    insert('student_invites', { user_id: id, counselor_id: req.user.id, university_id: uni });
    return get('SELECT * FROM users WHERE id = ?', id);
  }));
  audit({ actor: req.user, aksi: 'daftar_mahasiswa_kolektif', entitas: 'users', alasan: `${created.length} mahasiswa (${kampus})`, ip: req.ip });
  let terkirim = 0;
  for (const u of created) { try { await sendInvite(u, req.user.nama, kampus); terkirim++; } catch (e) { console.error('[email]', e.message); } }
  res.json({ ringkas: { ...ringkas, didaftarkan: created.length, email_terkirim: terkirim } });
});

// ---- Daftar undangan & kirim ulang ----
r.get('/counselor/invites', konselor, (req, res) => {
  const rows = all(`SELECT i.*, u.nama, u.nim_nip, u.email, u.status, p.nama_prodi FROM student_invites i JOIN users u ON u.id = i.user_id LEFT JOIN prodi p ON p.id = u.prodi_id
    WHERE i.counselor_id = ? ORDER BY i.aktif_pada IS NOT NULL, i.created_at DESC LIMIT 1000`, req.user.id);
  res.json({ jumlah: rows.length, aktif: rows.filter((x) => x.aktif_pada).length, items: rows.map((x) => ({ id: x.user_id, nama: x.nama, nim: x.nim_nip, email: x.email, prodi: x.nama_prodi, aktif: !!x.aktif_pada, aktif_pada: x.aktif_pada, terkirim_pada: x.terkirim_pada, jumlah_kirim: x.jumlah_kirim })) });
});
r.post('/counselor/invites/:id/resend', konselor, importLimiter, async (req, res) => {
  const i = get('SELECT * FROM student_invites WHERE user_id = ? AND counselor_id = ?', req.params.id, req.user.id); if (!i) fail(404, 'Undangan tidak ditemukan.');
  if (i.aktif_pada) fail(409, 'Mahasiswa sudah mengaktifkan akunnya.');
  const u = get('SELECT * FROM users WHERE id = ?', i.user_id);
  await sendInvite(u, req.user.nama, campus.universityName(u.university_id) || '-');
  res.json({ ok: true });
});

module.exports = r;
module.exports.activateInvite = (u, actor) => {
  const i = get('SELECT * FROM student_invites WHERE user_id = ?', u.id); if (!i) return;
  update('student_invites', i.id, { aktif_pada: nowIso() });
  notify(i.counselor_id, { tipe: 'konseling', judul: 'Mahasiswa mengaktifkan akun', isi: `${actor.nama} sudah mengaktifkan akun PAN-JALU yang Anda daftarkan.`, tautan: `#/c/mahasiswa/${u.id}` });
};
