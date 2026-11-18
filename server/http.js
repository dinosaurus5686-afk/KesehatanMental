// Middleware HTTP: autentikasi JWT, otorisasi peran, rate limit, utilitas respons.
const { get } = require('./db');
const { verifyJwt } = require('./security');

class HttpError extends Error { constructor(status, message, code) { super(message); this.status = status; this.code = code; } }
const fail = (status, message, code) => { throw new HttpError(status, message, code); };

function authenticate(req, _res, next) {
  const h = req.headers.authorization || '';
  const payload = h.startsWith('Bearer ') ? verifyJwt(h.slice(7)) : null;
  if (!payload) return next(new HttpError(401, 'Sesi tidak valid atau sudah berakhir. Silakan masuk kembali.', 'UNAUTHENTICATED'));
  const user = get('SELECT * FROM users WHERE id = ?', payload.sub);
  if (!user || !user.aktif || user.token_version !== payload.tv) return next(new HttpError(401, 'Sesi telah dicabut. Silakan masuk kembali.', 'UNAUTHENTICATED'));
  // Konselor yang klaim rangkap Koordinator Layanan BK-nya disetujui admin dapat bertindak sebagai koordinator
  // dengan header "X-Peran: koordinator" (dipilih lewat pengalih mode di aplikasi). Status klaim diperiksa ulang setiap permintaan.
  if (req.headers['x-peran'] === 'koordinator' && user.role === 'konselor' && get("SELECT 1 AS x FROM coordinator_claims WHERE user_id = ? AND status = 'disetujui'", user.id)) {
    req.user = { ...user, role: 'koordinator', peran_asli: 'konselor', rangkap: true };
  } else req.user = user;
  next();
}

const requireRole = (...roles) => (req, _res, next) => (roles.includes(req.user.role) ? next() : next(new HttpError(403, 'Anda tidak memiliki akses ke fitur ini.', 'FORBIDDEN')));

// Rate limiter in-memory (pada produksi multi-instans: Redis).
function rateLimit({ windowMs, max, key = (req) => req.ip, message = 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.' }) {
  const hits = new Map();
  return (req, _res, next) => {
    const k = key(req); const now = Date.now();
    const arr = (hits.get(k) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) return next(new HttpError(429, message, 'RATE_LIMITED'));
    arr.push(now); hits.set(k, arr); next();
  };
}

const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res, next); if (r && typeof r.catch === 'function') r.catch(next); } catch (e) { next(e); } };

function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, code: err.code });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Format data tidak valid.' });
  console.error(err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
}

const str = (v, max = 5000) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

module.exports = { HttpError, fail, authenticate, requireRole, rateLimit, wrap, errorHandler, str };
