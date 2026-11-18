// PAN-JALU — server utama (API REST + realtime Socket.io + aplikasi web).
const http = require('node:http');
const path = require('node:path');
const express = require('express');
const { Server } = require('socket.io');
const { ensureSeeded, ensureAdmin } = require('./seed');
const { authenticate, errorHandler } = require('./http');
const { verifyJwt } = require('./security');
const { get } = require('./db');
const services = require('./services');

const campus = require('./campus');
campus.ensureUniversities(); // daftar perguruan tinggi nasional
campus.ensurePanjaluUni(); // akun Konselor PAN-JALU independen
campus.migrateCampus(); // data lama → kampus UNP Kediri (sekali saja)
require('./instrument').apply(); // pengaturan instrumen dari menu Psikometrik (norma, kalimat interpretasi)
ensureSeeded({ demo: process.env.MC_DEMO !== '0' });
ensureAdmin();

const app = express();
app.set('trust proxy', process.env.MC_TRUST_PROXY === '1');
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/embed/')) return next(); // header khusus untuk blok embed (lihat di bawah)
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data: https:; media-src 'self' https:; frame-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; connect-src 'self' ws: wss:; frame-ancestors 'none'");
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.json({ limit: '1mb' }));

// Blok embed halaman utama (kode tempelan admin / video YouTube). Disajikan dengan CSP "sandbox" sehingga berjalan
// di asal terisolasi: skrip di dalamnya tidak dapat mengakses cookie, penyimpanan, atau API PAN-JALU.
app.get('/embed/:id', (req, res) => {
  const { getConfig } = require('./db');
  const b = (getConfig('home', {}).blok || []).find((x) => x.id === req.params.id && x.tampil !== false);
  const m = b?.media || getConfig('home', {}).hero_media;
  const media = b ? m : req.params.id === 'hero' ? m : null;
  if (!media || !['kode', 'youtube'].includes(media.tipe)) return res.status(404).send('Tidak ditemukan');
  let body = media.kode || '';
  if (media.tipe === 'youtube') {
    const id = (media.url.match(/(?:v=|embed\/|shorts\/|youtu\.be\/)([\w-]{6,})/) || [])[1];
    if (!id) return res.status(404).send('Tidak ditemukan');
    body = `<iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Video" style="position:fixed;inset:0;width:100%;height:100%;border:0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
  }
  const doc = /<html[\s>]/i.test(body) ? body : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:transparent;font-family:system-ui,sans-serif}</style></head><body>${body}</body></html>`;
  res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms; frame-ancestors 'self'");
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(doc);
});

const auth = require('./routes/auth');
const content = require('./routes/content');
app.use('/api', auth.router); // memuat rute publik, lalu autentikasi untuk rute berikutnya
app.use('/api', authenticate, require('./routes/selfhelp'));
app.use('/api', authenticate, content.router);
app.use('/api', authenticate, require('./routes/counseling').router);
app.use('/api', authenticate, require('./routes/staff'));
app.use('/api', authenticate, require('./routes/admin'));
app.use('/api', authenticate, require('./routes/coord'));
app.use('/api', authenticate, require('./routes/klaim'));
app.use('/api', authenticate, require('./routes/panjalu'));
app.use('/api', authenticate, require('./routes/psikometri'));
app.use('/api', authenticate, require('./routes/monitoring'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Endpoint tidak ditemukan.' }));
app.use('/media', express.static(content.UPLOAD_DIR, { maxAge: '7d', fallthrough: false }));
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));
app.use(errorHandler);

const server = http.createServer(app);
const io = new Server(server, { serveClient: true });
io.use((socket, next) => {
  const p = verifyJwt(socket.handshake.auth?.token);
  const u = p && get('SELECT id, role, token_version, aktif FROM users WHERE id = ?', p.sub);
  if (!u || !u.aktif || u.token_version !== p.tv) return next(new Error('unauthenticated'));
  socket.data.user = u; next();
});
io.on('connection', (socket) => {
  const uid = socket.data.user.id;
  socket.join(`user:${uid}`);
  services.markOnline(uid, 1);
  socket.on('disconnect', () => services.markOnline(uid, -1));
});
services.setIo(io);

setInterval(() => { try { services.runScheduler(); } catch (e) { console.error('[penjadwal]', e); } }, 60000).unref();
setTimeout(() => services.runScheduler(), 3000).unref();

const PORT = Number(process.env.PORT || 3000);
if (require.main === module) server.listen(PORT, () => console.log(`PAN-JALU berjalan di http://localhost:${PORT}`));

module.exports = { app, server };
