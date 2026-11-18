// Basis data relasional (SQLite bawaan Node). Skema mengikuti Bab 5 blueprint.
// Untuk produksi skala kampus, skema ini dapat dipindahkan ke PostgreSQL 15+ tanpa perubahan model data.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const { DATA_DIR, uuid } = require('./security');

const db = new DatabaseSync(process.env.MC_DB_FILE || path.join(DATA_DIR, 'panjalu.db'));
// Audit log disimpan di berkas terpisah dan bersifat append-only (Bab 10.4).
const auditDb = new DatabaseSync(process.env.MC_AUDIT_FILE || path.join(DATA_DIR, 'audit.db'));
const SCHEMA_VERSION = 6; // v4: IKDKM-M & Refleksi GURU; v5: Koordinator Layanan BK; v6: multi-kampus, pustaka konten admin, konselor pilihan mahasiswa
const MIGRATABLE = [4, 5]; // versi lama yang dimigrasi otomatis tanpa menghapus data

db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
{
  const hasCfg = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='institution_config'").get();
  const ver = hasCfg && db.prepare("SELECT value FROM institution_config WHERE key = 'schema_version'").get();
  const hasUsers = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (hasUsers && (!ver || (JSON.parse(ver.value) !== SCHEMA_VERSION && !MIGRATABLE.includes(JSON.parse(ver.value))))) {
    console.error(`[basis data] Berkas data berasal dari versi PAN-JALU yang lebih lama. Pindahkan/hapus folder data lalu jalankan ulang, atau set MC_DATA_DIR ke folder baru.`);
    process.exit(1);
  }
}
auditDb.exec('PRAGMA journal_mode = WAL;');

const T = `id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

db.exec(`
CREATE TABLE IF NOT EXISTS universities (id TEXT PRIMARY KEY, nama TEXT NOT NULL, kota TEXT, provinsi TEXT, status TEXT, alamat TEXT);
CREATE TABLE IF NOT EXISTS institution_config (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE IF NOT EXISTS prodi (${T}, nama_prodi TEXT NOT NULL, fakultas TEXT NOT NULL, fakultas_kode TEXT NOT NULL, jenjang TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (${T}, role TEXT NOT NULL CHECK (role IN ('mahasiswa','konselor','admin','koordinator')),
  nim_nip TEXT UNIQUE NOT NULL, nama TEXT NOT NULL, email TEXT UNIQUE NOT NULL COLLATE NOCASE, password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('menunggu_verifikasi','menunggu_persetujuan','aktif','ditolak','nonaktif')),
  email_verified_at TEXT, alasan_penolakan TEXT, disetujui_oleh TEXT, disetujui_pada TEXT,
  prodi_id TEXT REFERENCES prodi(id), angkatan INTEGER, kelas TEXT, gender TEXT, tanggal_lahir TEXT, alamat TEXT, telepon TEXT,
  identitas_disamarkan INTEGER NOT NULL DEFAULT 0, aktif INTEGER NOT NULL DEFAULT 1, token_version INTEGER NOT NULL DEFAULT 0, last_login_at TEXT);
CREATE TABLE IF NOT EXISTS sessions (${T}, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL, user_agent TEXT, ip TEXT, revoked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS email_tokens (${T}, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, tujuan TEXT NOT NULL CHECK (tujuan IN ('verifikasi','reset')),
  kode_hash TEXT, tautan_hash TEXT UNIQUE NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, percobaan INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS consents (${T}, user_id TEXT NOT NULL REFERENCES users(id), jenis_consent TEXT NOT NULL,
  disetujui_pada TEXT NOT NULL, versi_kebijakan TEXT NOT NULL, alamat_ip TEXT, appointment_id TEXT, teks_hash TEXT);

CREATE TABLE IF NOT EXISTS domains (${T}, kode TEXT UNIQUE NOT NULL, nama TEXT NOT NULL, label TEXT NOT NULL);

-- Asesmen IKDKM: jawaban mentah dienkripsi; hasil olahan (skor, kuadran, penanda) disimpan sebagai JSON
CREATE TABLE IF NOT EXISTS assessments (${T}, user_id TEXT NOT NULL REFERENCES users(id), diisi_pada TEXT NOT NULL,
  skor_total INTEGER, kategori_total TEXT, skor_fondasi INTEGER, kategori_fondasi TEXT, skor_otot INTEGER, kategori_otot TEXT, kuadran TEXT, risk_alert TEXT NOT NULL DEFAULT 'none', fokus_dimensi TEXT,
  hasil_json TEXT NOT NULL, jawaban_enc TEXT NOT NULL, izin_ai INTEGER NOT NULL DEFAULT 0, izin_dihubungi INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS assessment_recommendations (${T}, assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE, student_id TEXT NOT NULL REFERENCES users(id),
  sumber TEXT NOT NULL CHECK (sumber IN ('otomatis','konselor')), jenis TEXT NOT NULL CHECK (jenis IN ('konten','konseling','komunitas','workbook','relaksasi','peer','lainnya')),
  target_id TEXT, judul TEXT NOT NULL, alasan TEXT, dibuat_oleh TEXT REFERENCES users(id), urutan INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS assessment_schedules (${T}, cakupan TEXT NOT NULL CHECK (cakupan IN ('semua','fakultas','prodi','angkatan','individu')), target TEXT,
  interval_hari INTEGER NOT NULL, pesan TEXT, aktif INTEGER NOT NULL DEFAULT 1, dibuat_oleh TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS assessment_reminders (${T}, user_id TEXT NOT NULL REFERENCES users(id), jenis TEXT NOT NULL, schedule_id TEXT, dikirim_pada TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS workbook_entries (${T}, user_id TEXT NOT NULL REFERENCES users(id), domain_id TEXT NOT NULL REFERENCES domains(id),
  tahap TEXT NOT NULL CHECK (tahap IN ('ground','understand','revise','use','guru')), isi_teks TEXT NOT NULL, keluaran TEXT, konten_json TEXT NOT NULL DEFAULT '[]', content_id TEXT REFERENCES content_items(id) ON DELETE SET NULL, jawaban_json TEXT, tanggal TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS journal_entries (${T}, user_id TEXT NOT NULL REFERENCES users(id), tanggal TEXT NOT NULL, mood TEXT NOT NULL, prompt TEXT, isi_teks TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]');
CREATE TABLE IF NOT EXISTS goals (${T}, user_id TEXT NOT NULL REFERENCES users(id), isi_teks TEXT NOT NULL, selesai INTEGER NOT NULL DEFAULT 0, minggu_ke TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mindfulness_logs (${T}, user_id TEXT NOT NULL REFERENCES users(id), jenis_aktivitas TEXT NOT NULL, durasi_detik INTEGER NOT NULL, waktu TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS mood_checkins (${T}, user_id TEXT NOT NULL REFERENCES users(id), waktu TEXT NOT NULL, mood INTEGER NOT NULL, konteks_aktivitas TEXT, catatan TEXT, motivasi_diri TEXT);
CREATE TABLE IF NOT EXISTS user_tracks (${T}, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3), judul TEXT NOT NULL,
  tipe TEXT NOT NULL CHECK (tipe IN ('berkas','tautan')), url TEXT NOT NULL, path TEXT, UNIQUE(user_id, slot));

CREATE TABLE IF NOT EXISTS content_items (${T}, judul TEXT NOT NULL, tipe TEXT NOT NULL CHECK (tipe IN ('artikel','video','podcast','infografis','slide','bibliokonseling')),
  kategori TEXT NOT NULL DEFAULT 'UMUM', durasi_atau_halaman TEXT, status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','nonaktif')),
  thumbnail_url TEXT, url_media TEXT, ringkasan TEXT NOT NULL DEFAULT '', kata_kunci TEXT NOT NULL DEFAULT '[]', isi TEXT, jumlah_tayang INTEGER NOT NULL DEFAULT 0, dibuat_oleh TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS content_views (${T}, user_id TEXT NOT NULL REFERENCES users(id), content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE, waktu TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS search_logs (${T}, kata_kunci TEXT NOT NULL, user_role TEXT);
CREATE TABLE IF NOT EXISTS uploads (${T}, nama_berkas TEXT NOT NULL, mime TEXT NOT NULL, ukuran INTEGER NOT NULL, path TEXT NOT NULL, diunggah_oleh TEXT REFERENCES users(id));

CREATE TABLE IF NOT EXISTS community_groups (${T}, nama TEXT NOT NULL, topik TEXT NOT NULL, deskripsi TEXT, jadwal TEXT, topik_diskusi TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','nonaktif')), dibuat_oleh TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS group_members (${T}, group_id TEXT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), bergabung_pada TEXT NOT NULL, UNIQUE(group_id, user_id));
CREATE TABLE IF NOT EXISTS group_posts (${T}, group_id TEXT NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), parent_id TEXT REFERENCES group_posts(id) ON DELETE CASCADE,
  topik TEXT, isi TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'tampil' CHECK (status IN ('tampil','disembunyikan')), alasan_moderasi TEXT, dimoderasi_oleh TEXT);
CREATE TABLE IF NOT EXISTS post_reports (${T}, post_id TEXT NOT NULL REFERENCES group_posts(id) ON DELETE CASCADE, pelapor_id TEXT NOT NULL REFERENCES users(id), alasan TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'baru' CHECK (status IN ('baru','ditindaklanjuti','diabaikan')), ditangani_oleh TEXT, UNIQUE(post_id, pelapor_id));
CREATE TABLE IF NOT EXISTS peer_counselors (${T}, user_id TEXT UNIQUE NOT NULL REFERENCES users(id), aktif INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online','sibuk','offline')), kontak_terverifikasi TEXT, keahlian TEXT,
  pelatihan TEXT, tanggal_sertifikasi TEXT, ditetapkan_oleh TEXT REFERENCES users(id), dinonaktifkan_pada TEXT, alasan_nonaktif TEXT);
CREATE TABLE IF NOT EXISTS peer_supervision (${T}, peer_id TEXT NOT NULL REFERENCES peer_counselors(id) ON DELETE CASCADE, counselor_id TEXT NOT NULL REFERENCES users(id), tanggal TEXT NOT NULL, catatan TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS counselors (${T}, user_id TEXT UNIQUE NOT NULL REFERENCES users(id), spesialisasi TEXT, jam_operasional TEXT NOT NULL DEFAULT '{}',
  jenis_layanan_aktif TEXT NOT NULL DEFAULT '[]', lingkup_fakultas TEXT NOT NULL DEFAULT '[]', status_jaga INTEGER NOT NULL DEFAULT 0, gelar TEXT);
CREATE TABLE IF NOT EXISTS student_counselors (${T}, student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, counselor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, UNIQUE(student_id, counselor_id));
CREATE TABLE IF NOT EXISTS content_adoptions (${T}, content_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE, counselor_id TEXT NOT NULL REFERENCES users(id),
  university_id TEXT, status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','nonaktif')), ulasan TEXT, rating INTEGER, UNIQUE(content_id, counselor_id));
CREATE TABLE IF NOT EXISTS content_needs (${T}, kunci TEXT UNIQUE NOT NULL, selesai INTEGER NOT NULL DEFAULT 0, content_id TEXT REFERENCES content_items(id) ON DELETE SET NULL, catatan TEXT, ditandai_oleh TEXT, ditandai_pada TEXT);
CREATE TABLE IF NOT EXISTS coordinators (${T}, user_id TEXT UNIQUE NOT NULL REFERENCES users(id), jabatan TEXT, unit TEXT);
CREATE TABLE IF NOT EXISTS counselor_slots (${T}, counselor_id TEXT NOT NULL REFERENCES users(id), hari INTEGER NOT NULL CHECK (hari BETWEEN 1 AND 7), jam_mulai TEXT NOT NULL, jam_selesai TEXT NOT NULL,
  jenis_layanan TEXT NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('online','offline','keduanya')), kuota INTEGER NOT NULL DEFAULT 1, lokasi TEXT, aktif INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS counselor_consents (${T}, counselor_id TEXT UNIQUE NOT NULL REFERENCES users(id), versi INTEGER NOT NULL DEFAULT 1,
  ketentuan_layanan TEXT NOT NULL, kerahasiaan TEXT NOT NULL, hak_kewajiban TEXT NOT NULL, pembatalan TEXT NOT NULL, tambahan TEXT);
CREATE TABLE IF NOT EXISTS appointments (${T}, student_id TEXT NOT NULL REFERENCES users(id), counselor_id TEXT NOT NULL REFERENCES users(id), jadwal TEXT NOT NULL, slot_id TEXT,
  topik TEXT NOT NULL, topik_lainnya TEXT, domain_id TEXT, jenis TEXT NOT NULL CHECK (jenis IN ('online','offline')), jenis_layanan TEXT, keluhan TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','selesai','batal')), tautan_rapat TEXT, lokasi TEXT, tindak_lanjut TEXT,
  consent_versi INTEGER, consent_teks TEXT, formulir_json TEXT, nomor TEXT);
CREATE TABLE IF NOT EXISTS counseling_sessions (${T}, appointment_id TEXT UNIQUE NOT NULL REFERENCES appointments(id), diagnosis_domain_id TEXT,
  tingkat_keparahan TEXT, catatan_rapport TEXT, catatan_eksplorasi TEXT, tujuan_smart TEXT, catatan_teknik TEXT, catatan_penutup TEXT);
CREATE TABLE IF NOT EXISTS counseling_summaries (${T}, appointment_id TEXT UNIQUE NOT NULL REFERENCES appointments(id), ringkasan TEXT NOT NULL, tindak_lanjut_konseli TEXT,
  status TEXT NOT NULL DEFAULT 'draf' CHECK (status IN ('draf','disetujui')), disetujui_pada TEXT);
CREATE TABLE IF NOT EXISTS counseling_evaluations (${T}, session_id TEXT UNIQUE NOT NULL REFERENCES counseling_sessions(id), refleksi_konselor TEXT,
  rencana_monitoring TEXT NOT NULL DEFAULT '[]', rekomendasi_lanjutan TEXT, perkembangan TEXT);
CREATE TABLE IF NOT EXISTS counselor_notes (${T}, student_id TEXT NOT NULL REFERENCES users(id), counselor_id TEXT NOT NULL REFERENCES users(id), catatan TEXT, diperbarui_pada TEXT NOT NULL, UNIQUE(student_id, counselor_id));
CREATE TABLE IF NOT EXISTS interventions (${T}, student_id TEXT NOT NULL REFERENCES users(id), deskripsi TEXT NOT NULL, dibuat_oleh TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'aktif' CHECK (status IN ('aktif','selesai','dibatalkan')), prioritas TEXT NOT NULL DEFAULT 'normal' CHECK (prioritas IN ('normal','tinggi','krisis')));
CREATE TABLE IF NOT EXISTS counseling_feedback (${T}, appointment_id TEXT UNIQUE NOT NULL REFERENCES appointments(id), rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), refleksi_mahasiswa TEXT);

CREATE TABLE IF NOT EXISTS risk_alerts (${T}, student_id TEXT NOT NULL REFERENCES users(id), assessment_id TEXT REFERENCES assessments(id), level TEXT NOT NULL,
  sumber TEXT NOT NULL DEFAULT 'asesmen', izin_dihubungi INTEGER NOT NULL DEFAULT 1, ditindaklanjuti_oleh TEXT REFERENCES users(id), ditindaklanjuti_pada TEXT, catatan_tindak_lanjut TEXT, dieskalasi_pada TEXT);
CREATE TABLE IF NOT EXISTS scheduled_tasks (${T}, owner_id TEXT NOT NULL REFERENCES users(id), student_id TEXT REFERENCES users(id), judul TEXT NOT NULL, jatuh_tempo TEXT NOT NULL, terkirim INTEGER NOT NULL DEFAULT 0, selesai INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS sos_events (${T}, aksi TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS messages (${T}, sender_id TEXT NOT NULL REFERENCES users(id), receiver_id TEXT NOT NULL REFERENCES users(id), isi_teks TEXT NOT NULL, dikirim_pada TEXT NOT NULL, dibaca INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS notifications (${T}, user_id TEXT NOT NULL REFERENCES users(id), tipe TEXT NOT NULL, judul TEXT NOT NULL, isi TEXT, tautan TEXT, prioritas TEXT NOT NULL DEFAULT 'normal', dibaca INTEGER NOT NULL DEFAULT 0, dibuat_pada TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_requests (${T}, requested_by TEXT NOT NULL REFERENCES users(id), student_id TEXT REFERENCES users(id), jenis TEXT NOT NULL, mode TEXT NOT NULL,
  prompt_ringkas TEXT, hasil TEXT, hasil_final TEXT, status_tinjauan TEXT NOT NULL DEFAULT 'menunggu' CHECK (status_tinjauan IN ('menunggu','disetujui','ditolak')), ditinjau_oleh TEXT REFERENCES users(id), ditinjau_pada TEXT, appointment_id TEXT);
CREATE TABLE IF NOT EXISTS profile_summaries (${T}, student_id TEXT NOT NULL REFERENCES users(id), ringkasan TEXT NOT NULL, sumber TEXT NOT NULL, ditulis_oleh TEXT REFERENCES users(id));
CREATE TABLE IF NOT EXISTS counselor_reflections (${T}, counselor_id TEXT NOT NULL REFERENCES users(id), jenis_layanan TEXT NOT NULL, ground TEXT, understand TEXT, revise TEXT, use_ TEXT);
CREATE TABLE IF NOT EXISTS supervisor_notes (${T}, counselor_id TEXT NOT NULL REFERENCES users(id), periode TEXT NOT NULL, kekuatan TEXT, area_pengembangan TEXT, ditulis_oleh TEXT REFERENCES users(id));

CREATE INDEX IF NOT EXISTS ix_assess_user ON assessments(user_id, diisi_pada);
CREATE INDEX IF NOT EXISTS ix_rec_assess ON assessment_recommendations(assessment_id);
CREATE INDEX IF NOT EXISTS ix_notif_user ON notifications(user_id, dibaca);
CREATE INDEX IF NOT EXISTS ix_msg_pair ON messages(sender_id, receiver_id);
CREATE INDEX IF NOT EXISTS ix_appt_c ON appointments(counselor_id, status);
CREATE INDEX IF NOT EXISTS ix_appt_s ON appointments(student_id);
CREATE INDEX IF NOT EXISTS ix_posts_group ON group_posts(group_id, created_at);
CREATE INDEX IF NOT EXISTS ix_views_user ON content_views(user_id, waktu);
`);
// Migrasi ringan tanpa menghapus data: kolom tambahan refleksi kinerja konselor (rating bintang & tanggal kegiatan)
{
  const cols = db.prepare('PRAGMA table_info(counselor_reflections)').all().map((c) => c.name);
  if (!cols.includes('rating')) db.exec('ALTER TABLE counselor_reflections ADD COLUMN rating INTEGER');
  if (!cols.includes('tanggal_kegiatan')) db.exec('ALTER TABLE counselor_reflections ADD COLUMN tanggal_kegiatan TEXT');
}
// v6: kolom multi-kampus & pustaka konten (nilai kampus untuk data lama diisi di campus.js setelah daftar PT dimuat)
{
  const add = (table, col, def) => { if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); };
  add('users', 'university_id', 'TEXT');
  add('prodi', 'university_id', 'TEXT');
  add('prodi', 'status', "TEXT NOT NULL DEFAULT 'aktif'");
  add('counselors', 'lingkup_prodi', "TEXT NOT NULL DEFAULT '[]'");
  add('counselors', 'layanan_terbuka', 'INTEGER NOT NULL DEFAULT 1');
  add('content_items', 'sumber', "TEXT NOT NULL DEFAULT 'konselor'");
  add('content_items', 'university_id', 'TEXT');
  add('community_groups', 'cakupan', "TEXT NOT NULL DEFAULT 'universitas'");
  add('community_groups', 'university_id', 'TEXT');
  add('assessment_schedules', 'university_id', 'TEXT');
  add('sos_events', 'university_id', 'TEXT');
  // Analisis keterlibatan konten (admin): durasi membaca/menonton & waktu terbit
  add('content_views', 'durasi_detik', 'INTEGER');
  add('content_items', 'diterbitkan_pada', 'TEXT');
  db.exec('CREATE INDEX IF NOT EXISTS ix_views_content ON content_views(content_id, waktu)');
  db.exec('CREATE INDEX IF NOT EXISTS ix_users_univ ON users(university_id, role); CREATE INDEX IF NOT EXISTS ix_prodi_univ ON prodi(university_id); CREATE INDEX IF NOT EXISTS ix_sc_c ON student_counselors(counselor_id)');
}
// v5: penugasan kasus darurat oleh koordinator
{
  const cols = db.prepare('PRAGMA table_info(risk_alerts)').all().map((c) => c.name);
  for (const c of ['ditugaskan_ke', 'ditugaskan_oleh', 'ditugaskan_pada']) if (!cols.includes(c)) db.exec(`ALTER TABLE risk_alerts ADD COLUMN ${c} TEXT`);
}
// v5: peran 'koordinator' pada tabel users. SQLite tidak bisa mengubah CHECK, jadi tabel dibangun ulang
// dengan menyalin seluruh baris apa adanya (urutan kolom sama), lalu diverifikasi jumlah barisnya.
{
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'users'").get().sql;
  if (!sql.includes("'koordinator'")) {
    const before = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(sql.replace(/^CREATE TABLE "?users"?/, 'CREATE TABLE users_v5').replace("role IN ('mahasiswa','konselor','admin')", "role IN ('mahasiswa','konselor','admin','koordinator')"));
      db.exec('INSERT INTO users_v5 SELECT * FROM users');
      if (db.prepare('SELECT COUNT(*) AS n FROM users_v5').get().n !== before) throw new Error('jumlah akun tidak sama setelah penyalinan');
      db.exec('DROP TABLE users');
      db.exec('ALTER TABLE users_v5 RENAME TO users');
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); db.exec('PRAGMA foreign_keys = ON'); throw e; }
    const broken = db.prepare('PRAGMA foreign_key_check').all();
    db.exec('PRAGMA foreign_keys = ON');
    if (broken.length) throw new Error(`[basis data] migrasi v5: ${broken.length} relasi tidak valid`);
    console.log(`[basis data] Migrasi v5 selesai: ${before} akun dipertahankan, peran Koordinator Layanan BK ditambahkan.`);
  }
}
db.prepare("INSERT INTO institution_config (key, value) VALUES ('schema_version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(JSON.stringify(SCHEMA_VERSION));

auditDb.exec(`
CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, actor_id TEXT, actor_role TEXT, aksi TEXT NOT NULL, entitas TEXT, entitas_id TEXT,
  student_id TEXT, alasan TEXT, waktu TEXT NOT NULL, alamat_ip TEXT);
CREATE INDEX IF NOT EXISTS ix_audit_student ON audit_logs(student_id);
CREATE INDEX IF NOT EXISTS ix_audit_actor ON audit_logs(actor_id);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit log tidak dapat diubah'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_logs BEGIN SELECT RAISE(ABORT, 'audit log tidak dapat dihapus'); END;
`);

const nowIso = () => new Date().toISOString();

const all = (sql, ...p) => db.prepare(sql).all(...p);
const get = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);

function insert(table, row) {
  const data = { id: row.id || uuid(), ...row };
  const cols = Object.keys(data);
  db.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => data[c]));
  return data.id;
}

function update(table, id, fields) {
  const cols = Object.keys(fields);
  if (!cols.length) return;
  db.prepare(`UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...cols.map((c) => fields[c]), nowIso(), id);
}

let txDepth = 0;
function tx(fn) {
  if (txDepth > 0) return fn(); // transaksi bersarang ikut transaksi luar
  db.exec('BEGIN');
  txDepth++;
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } finally { txDepth--; }
}

function audit({ actor, aksi, entitas, entitas_id, student_id, alasan, ip }) {
  auditDb.prepare('INSERT INTO audit_logs (id, actor_id, actor_role, aksi, entitas, entitas_id, student_id, alasan, waktu, alamat_ip) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .run(uuid(), actor?.id || null, actor?.role || null, aksi, entitas || null, entitas_id || null, student_id || null, alasan || null, nowIso(), ip || null);
}

function getConfig(key, fallback) {
  const r = get('SELECT value FROM institution_config WHERE key = ?', key);
  return r ? JSON.parse(r.value) : fallback;
}
function setConfig(key, value) {
  run('INSERT INTO institution_config (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', key, JSON.stringify(value), nowIso());
}

module.exports = { db, auditDb, all, get, run, insert, update, tx, audit, getConfig, setConfig, nowIso };
