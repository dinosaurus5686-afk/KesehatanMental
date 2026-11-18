// Uji migrasi basis data v4 → v6 (peran Koordinator Layanan BK, multi-kampus): akun & relasi lama harus utuh.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const T = `id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

function makeV4(dir) {
  const db = new DatabaseSync(path.join(dir, 'panjalu.db'));
  db.exec(`
    CREATE TABLE institution_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
    CREATE TABLE prodi (${T}, nama_prodi TEXT NOT NULL, fakultas TEXT NOT NULL, fakultas_kode TEXT NOT NULL, jenjang TEXT NOT NULL);
    CREATE TABLE users (${T}, role TEXT NOT NULL CHECK (role IN ('mahasiswa','konselor','admin')),
      nim_nip TEXT UNIQUE NOT NULL, nama TEXT NOT NULL, email TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('menunggu_verifikasi','menunggu_persetujuan','aktif','ditolak','nonaktif')),
      email_verified_at TEXT, alasan_penolakan TEXT, disetujui_oleh TEXT, disetujui_pada TEXT,
      prodi_id TEXT REFERENCES prodi(id), angkatan INTEGER, kelas TEXT, gender TEXT, tanggal_lahir TEXT, alamat TEXT, telepon TEXT,
      identitas_disamarkan INTEGER NOT NULL DEFAULT 0, aktif INTEGER NOT NULL DEFAULT 1, token_version INTEGER NOT NULL DEFAULT 0, last_login_at TEXT);
    CREATE TABLE sessions (${T}, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL,
      expires_at TEXT NOT NULL, user_agent TEXT, ip TEXT, revoked INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE risk_alerts (${T}, student_id TEXT NOT NULL REFERENCES users(id), assessment_id TEXT, level TEXT NOT NULL,
      sumber TEXT NOT NULL DEFAULT 'asesmen', izin_dihubungi INTEGER NOT NULL DEFAULT 1, ditindaklanjuti_oleh TEXT REFERENCES users(id), ditindaklanjuti_pada TEXT, catatan_tindak_lanjut TEXT, dieskalasi_pada TEXT);
  `);
  db.prepare("INSERT INTO institution_config (key, value) VALUES ('schema_version', '4')").run();
  const add = db.prepare('INSERT INTO users (id, role, nim_nip, nama, email, password_hash, telepon) VALUES (?,?,?,?,?,?,?)');
  add.run('u-admin', 'admin', 'admin', 'Admin', 'admin@x.id', 'hash-a', null);
  add.run('u-k1', 'konselor', 'K001', 'Konselor Satu', 'k1@x.id', 'hash-k', 'enc:telp');
  for (let i = 0; i < 25; i++) add.run(`u-m${i}`, 'mahasiswa', `23130${String(i).padStart(5, '0')}`, `Mahasiswa ${i}`, `m${i}@x.id`, `hash-${i}`, null);
  db.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ('s1', 'u-m3', 'tok', '2099-01-01')").run();
  db.prepare("INSERT INTO risk_alerts (id, student_id, level) VALUES ('r1', 'u-m7', 'red')").run();
  const snapshot = JSON.stringify(db.prepare('SELECT * FROM users ORDER BY id').all());
  db.close();
  return snapshot;
}

// Sama seperti saat server menyala: skema (db.js), lalu daftar PT & pemindahan data lama ke kampus UNP (campus.js)
const boot = (dir) => execFileSync(process.execPath, ['--disable-warning=ExperimentalWarning', '-e', "require('./server/db'); const c = require('./server/campus'); c.ensureUniversities(); c.migrateCampus();"], {
  cwd: ROOT, env: { ...process.env, MC_DATA_DIR: dir, MC_DB_FILE: path.join(dir, 'panjalu.db'), MC_AUDIT_FILE: path.join(dir, 'audit.db'), MC_DATA_KEY: 'a'.repeat(64), MC_JWT_SECRET: 'b'.repeat(64) }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
});

test('migrasi v4 → v6: seluruh akun lama utuh, peran koordinator tersedia, data pindah ke kampus UNP, relasi tetap valid', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panjalu-mig-'));
  try {
    const before = makeV4(dir);
    const out = boot(dir);
    assert.match(out, /Migrasi v5 selesai: 27 akun dipertahankan/);
    const db = new DatabaseSync(path.join(dir, 'panjalu.db'));
    db.exec('PRAGMA foreign_keys = ON');
    assert.match(out, /Migrasi v6: 26 akun dipindahkan ke kampus Universitas Nusantara PGRI Kediri/);
    // Baris akun identik byte-per-byte (termasuk hash kata sandi & data terenkripsi), selain kolom kampus yang baru
    const rows = db.prepare('SELECT * FROM users ORDER BY id').all();
    assert.equal(JSON.stringify(rows.map(({ university_id, ...r }) => r)), before);
    assert.ok(rows.filter((r) => r.role !== 'admin').every((r) => r.university_id === '071072'));
    assert.equal(rows.find((r) => r.role === 'admin').university_id, null);
    assert.equal(db.prepare("SELECT value FROM institution_config WHERE key = 'schema_version'").get().value, '6');
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal(db.prepare("SELECT user_id FROM sessions WHERE id = 's1'").get().user_id, 'u-m3');
    // Peran baru diterima, peran asing tetap ditolak, FK tetap ditegakkan
    db.prepare("INSERT INTO users (id, role, nim_nip, nama, email, password_hash) VALUES ('u-kbk', 'koordinator', 'KBK01', 'Koordinator', 'kbk@x.id', 'h')").run();
    assert.throws(() => db.prepare("INSERT INTO users (id, role, nim_nip, nama, email, password_hash) VALUES ('u-x', 'superuser', 'X1', 'X', 'x@x.id', 'h')").run(), /CHECK/);
    assert.throws(() => db.prepare("INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ('s2', 'tidak-ada', 't2', 'z')").run(), /FOREIGN KEY/);
    // Kolom penugasan kasus darurat ditambahkan tanpa menghapus kasus lama
    const cols = db.prepare('PRAGMA table_info(risk_alerts)').all().map((c) => c.name);
    assert.ok(['ditugaskan_ke', 'ditugaskan_oleh', 'ditugaskan_pada'].every((c) => cols.includes(c)));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM risk_alerts').get().n, 1);
    db.close();
    // Menyalakan ulang tidak memigrasi dua kali
    assert.doesNotMatch(boot(dir), /Migrasi v[56]/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
