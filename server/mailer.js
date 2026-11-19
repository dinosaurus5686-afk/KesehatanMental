// Pengiriman email (verifikasi, reset kata sandi, keputusan pendaftaran konselor).
// Produksi: isi MC_SMTP_HOST dkk. Tanpa SMTP, email ditulis ke data/outbox dan dicetak di konsol (mode pengembangan).
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns').promises;
const nodemailer = require('nodemailer');
const { DATA_DIR } = require('./security');

const APP_NAME = 'PAN-JALU';
const FROM = process.env.MC_MAIL_FROM || `${APP_NAME} <no-reply@panjalu.local>`;
const OUTBOX = path.join(DATA_DIR, 'outbox');
const transport = process.env.MC_SMTP_HOST ? nodemailer.createTransport({
  host: process.env.MC_SMTP_HOST,
  port: Number(process.env.MC_SMTP_PORT || 587),
  secure: process.env.MC_SMTP_SECURE === '1',
  auth: process.env.MC_SMTP_USER ? { user: process.env.MC_SMTP_USER, pass: process.env.MC_SMTP_PASS } : undefined,
}) : null;

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const appUrl = () => (process.env.MC_APP_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const mailMode = () => (transport ? 'smtp' : 'outbox');

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#eef2fb;font-family:Segoe UI,Arial,sans-serif;color:#14204a">
  <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #d7def0">
  <div style="background:#1d3a9e;color:#fff;padding:18px 24px"><b style="font-size:18px">PAN-JALU</b><br><span style="font-size:12px;opacity:.85">Psikoedukasi, Asesmen, dan Navigasi Menuju Jiwa Luhur</span></div>
  <div style="padding:24px"><h2 style="margin:0 0 12px;font-size:18px">${title}</h2>${bodyHtml}</div>
  <div style="padding:14px 24px;font-size:11px;color:#6a7598;border-top:1px solid #e3e8f4">Email ini dikirim otomatis oleh PAN-JALU. Jika Anda tidak merasa mendaftar, abaikan email ini.</div></div></body></html>`;
}

async function send(to, subject, html, text) {
  if (transport) {
    await transport.sendMail({ from: FROM, to, subject, html, text });
    return;
  }
  fs.mkdirSync(OUTBOX, { recursive: true });
  const file = path.join(OUTBOX, `${Date.now()}-${to.replace(/[^a-z0-9@.]/gi, '_')}.txt`);
  fs.writeFileSync(file, `To: ${to}\nSubject: ${subject}\n\n${text}\n`);
  console.log(`[email:outbox] ${to} — ${subject}\n${text}\n`);
}

const btn = (href, label) => `<p style="margin:20px 0"><a href="${href}" style="background:#1d3a9e;color:#fff;text-decoration:none;padding:11px 20px;border-radius:999px;font-weight:600">${label}</a></p>`;

const mails = {
  verifikasi: (to, nama, kode, token) => {
    const link = `${appUrl()}/api/auth/verify-link/${token}`;
    return send(to, 'Kode verifikasi email PAN-JALU', layout('Verifikasi email Anda', `<p>Halo ${esc(nama)},</p><p>Masukkan kode berikut di halaman verifikasi PAN-JALU:</p><p style="font-size:30px;font-weight:700;letter-spacing:6px;font-family:monospace">${kode}</p><p>Atau klik tombol di bawah ini:</p>${btn(link, 'Verifikasi email')}<p style="font-size:13px;color:#6a7598">Kode dan tautan berlaku 30 menit.</p>`),
      `Halo ${nama},\n\nKode verifikasi PAN-JALU: ${kode}\nAtau buka tautan: ${link}\n\nBerlaku 30 menit.`);
  },
  // Akun mahasiswa didaftarkan kolektif oleh konselor: mahasiswa membuat kata sandi & menyetujui kebijakan privasi
  undanganMahasiswa: (to, nama, konselor, kampus, token) => {
    const link = `${appUrl()}/#/aktivasi/${token}`;
    return send(to, 'Aktifkan akun PAN-JALU Anda', layout('Akun PAN-JALU Anda sudah disiapkan', `<p>Halo ${esc(nama)},</p><p>${esc(konselor)}, konselor di ${esc(kampus)}, telah mendaftarkan Anda di <b>PAN-JALU</b> — layanan kesehatan mental mahasiswa (asesmen kekuatan mental, psikoedukasi, jurnal, mindfulness, dan konseling).</p><p>Aktifkan akun dengan membuat kata sandi dan membaca kebijakan privasi:</p>${btn(link, 'Aktifkan akun')}<p style="font-size:13px;color:#6a7598">Tautan berlaku 14 hari. Masuk menggunakan NIM atau email ini. Abaikan email ini bila Anda tidak mengenal pendaftaran tersebut.</p>`),
      `Halo ${nama},\n\n${konselor} (${kampus}) telah mendaftarkan Anda di PAN-JALU.\nAktifkan akun: ${link}\nBerlaku 14 hari.`);
  },
  reset: (to, nama, token) => {
    const link = `${appUrl()}/#/reset/${token}`;
    return send(to, 'Atur ulang kata sandi PAN-JALU', layout('Atur ulang kata sandi', `<p>Halo ${esc(nama)},</p><p>Kami menerima permintaan untuk mengatur ulang kata sandi akun Anda.</p>${btn(link, 'Buat kata sandi baru')}<p style="font-size:13px;color:#6a7598">Tautan berlaku 30 menit. Abaikan email ini bila Anda tidak memintanya.</p>`),
      `Halo ${nama},\n\nBuat kata sandi baru: ${link}\nBerlaku 30 menit.`);
  },
  // peran: label akun yang ditinjau ('konselor' | 'koordinator layanan BK'); peninjau: siapa yang menyetujui
  konselorMenunggu: (to, nama, peran = 'konselor', peninjau = 'admin') => send(to, `Pendaftaran ${peran} PAN-JALU sedang ditinjau`, layout('Email terverifikasi', `<p>Halo ${esc(nama)},</p><p>Email Anda sudah terverifikasi. Pendaftaran Anda sebagai ${esc(peran)} sedang ditinjau ${esc(peninjau)}. Kami akan mengirim email saat akun Anda disetujui.</p>`),
    `Halo ${nama},\n\nEmail Anda terverifikasi. Pendaftaran ${peran} sedang ditinjau ${peninjau}.`),
  konselorDisetujui: (to, nama, peran = 'konselor') => send(to, `Akun ${peran} PAN-JALU disetujui`, layout('Akun Anda aktif', `<p>Halo ${esc(nama)},</p><p>Pendaftaran Anda sebagai ${esc(peran)} telah disetujui. Silakan masuk ke PAN-JALU.</p>${btn(`${appUrl()}/#/masuk`, 'Masuk ke PAN-JALU')}`),
    `Halo ${nama},\n\nAkun ${peran} Anda disetujui. Masuk: ${appUrl()}/#/masuk`),
  konselorDitolak: (to, nama, alasan, peran = 'konselor') => send(to, `Pendaftaran ${peran} PAN-JALU belum dapat disetujui`, layout('Pendaftaran belum disetujui', `<p>Halo ${esc(nama)},</p><p>Mohon maaf, pendaftaran Anda sebagai ${esc(peran)} belum dapat disetujui.</p><p><b>Alasan:</b> ${esc(alasan)}</p><p>Silakan hubungi Unit Layanan Konseling untuk informasi lebih lanjut.</p>`),
    `Halo ${nama},\n\nPendaftaran ${peran} belum dapat disetujui.\nAlasan: ${alasan}`),
  klaimKoordinator: (to, nama, kampus) => send(to, 'Pengajuan rangkap Koordinator Layanan BK', layout('Pengajuan Koordinator Layanan BK', `<p>${esc(nama)}, konselor di ${esc(kampus)}, mengajukan diri untuk merangkap sebagai Koordinator Layanan BK karena kampusnya belum memiliki koordinator.</p><p>Tinjau dan putuskan pengajuan ini di menu Pendaftar Koordinator.</p>${btn(`${appUrl()}/#/a/koordinator`, 'Tinjau pengajuan')}`),
    `${nama} (${kampus}) mengajukan diri merangkap Koordinator Layanan BK. Tinjau: ${appUrl()}/#/a/koordinator`),
  pendaftarBaru: (to, nama, peran = 'konselor', tautan = '#/a/pendaftar') => send(to, `Pendaftar ${peran} baru menunggu persetujuan`, layout(`Pendaftar ${peran} baru`, `<p>${esc(nama)} telah memverifikasi email dan menunggu persetujuan Anda.</p>${btn(`${appUrl()}/${tautan}`, 'Tinjau pendaftar')}`),
    `${nama} menunggu persetujuan sebagai ${peran}: ${appUrl()}/${tautan}`),
};

// Validasi "email sah": format, domain sekali-pakai, dan domain memiliki server email (MX).
const DISPOSABLE = new Set(['mailinator.com', 'yopmail.com', 'guerrillamail.com', '10minutemail.com', 'tempmail.com', 'temp-mail.org', 'trashmail.com', 'sharklasers.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com', 'fakeinbox.com', 'mohmal.com', 'emailondeck.com']);
async function validateEmail(email, allowedDomains = []) {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(e) || e.length > 120) return { ok: false, message: 'Format email tidak valid.' };
  const domain = e.split('@')[1];
  if (DISPOSABLE.has(domain)) return { ok: false, message: 'Email sementara/sekali-pakai tidak dapat digunakan. Gunakan email resmi Anda.' };
  if (allowedDomains.length && !allowedDomains.some((d) => domain === d || domain.endsWith('.' + d))) return { ok: false, message: `Gunakan email dengan domain: ${allowedDomains.join(', ')}.` };
  if (process.env.MC_EMAIL_MX_CHECK !== '0') {
    try {
      const mx = await Promise.race([dns.resolveMx(domain), new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 4000))]);
      if (!mx.length) return { ok: false, message: 'Domain email tidak dapat menerima email.' };
    } catch (err) {
      if (['ENOTFOUND', 'ENODATA', 'ENOTIMP'].includes(err.code)) return { ok: false, message: 'Domain email tidak ditemukan atau tidak dapat menerima email.' };
      console.warn('[email] pemeriksaan MX dilewati:', err.code || err.message); // gangguan DNS: jangan blokir pendaftar
    }
  }
  return { ok: true, email: e };
}

module.exports = { mails, validateEmail, mailMode, appUrl, OUTBOX };
