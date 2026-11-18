// Kriptografi: hash kata sandi (scrypt), enkripsi kolom sensitif (AES-256-GCM), JWT HS256.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.MC_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function loadSecret(envName, file) {
  if (process.env[envName]) return Buffer.from(process.env[envName], 'hex');
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    console.warn(`[keamanan] ${envName} tidak diset — kunci baru dibuat di ${p}. Untuk produksi, set ${envName} dari secret manager.`);
  }
  return Buffer.from(fs.readFileSync(p, 'utf8').trim(), 'hex');
}

const DATA_KEY = loadSecret('MC_DATA_KEY', '.data_key');
const JWT_SECRET = loadSecret('MC_JWT_SECRET', '.jwt_secret');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(pw, stored) {
  if (!stored) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

// Kolom [Sensitif] disimpan sebagai "enc:v1:<iv>:<tag>:<ciphertext>"
function enc(text) {
  if (text === null || text === undefined || text === '') return text ?? null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', DATA_KEY, iv);
  const ct = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `enc:v1:${iv.toString('base64')}:${c.getAuthTag().toString('base64')}:${ct.toString('base64')}`;
}

function dec(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:v1:')) return value;
  const [, , ivB, tagB, ctB] = value.split(':');
  const d = crypto.createDecipheriv('aes-256-gcm', DATA_KEY, Buffer.from(ivB, 'base64'));
  d.setAuthTag(Buffer.from(tagB, 'base64'));
  return Buffer.concat([d.update(Buffer.from(ctB, 'base64')), d.final()]).toString('utf8');
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function signJwt(payload, ttlSeconds) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(JSON.stringify({ ...payload, iat: now, exp: now + ttlSeconds }));
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2], 'base64url');
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
const uuid = () => crypto.randomUUID();

module.exports = { DATA_DIR, hashPassword, verifyPassword, enc, dec, signJwt, verifyJwt, sha256, randomToken, uuid };
