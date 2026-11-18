// Multi-kampus: daftar perguruan tinggi (sumber: referensi.data.kemendikdasmen.go.id/pendidikan/dikti),
// prodi per kampus (dikelola Koordinator Layanan BK), konselor pilihan mahasiswa, dan pengaturan SOS per kampus.
const fs = require('node:fs');
const path = require('node:path');
const { all, get, run, insert, tx, getConfig, setConfig, nowIso } = require('./db');

const UNP = '071072'; // NPSN Universitas Nusantara PGRI Kediri: kampus asal data PAN-JALU sebelum multi-kampus
const DATA_FILE = path.join(__dirname, 'data', 'perguruan-tinggi.json');

// Muat/menambah daftar PT dari berkas data (idempotent; PT yang sudah ada tidak diubah)
function ensureUniversities() {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { /* berkas tidak ada: minimal UNP */ }
  if (!list.some((x) => x.npsn === UNP)) list.push({ npsn: UNP, nama: 'Universitas Nusantara PGRI Kediri', kota: 'Kota Kediri', provinsi: 'Prov. Jawa Timur', status: 'SWASTA', alamat: 'Jl KH Achmad Dahlan 76 Mojoroto' });
  const have = get('SELECT COUNT(*) AS n FROM universities').n;
  if (have >= list.length) return 0;
  const stmt = require('./db').db.prepare('INSERT OR IGNORE INTO universities (id, nama, kota, provinsi, status, alamat) VALUES (?,?,?,?,?,?)');
  tx(() => { for (const u of list) stmt.run(u.npsn, u.nama, u.kota || null, u.provinsi || null, u.status || null, u.alamat || null); });
  return get('SELECT COUNT(*) AS n FROM universities').n - have;
}

// Data lama (satu kampus) dipindahkan ke UNP Kediri tanpa menghapus apa pun
function migrateCampus() {
  if (getConfig('campus_migrated', false)) return false;
  const n = tx(() => {
    const c = run(`UPDATE users SET university_id = ? WHERE university_id IS NULL AND role IN ('mahasiswa','konselor','koordinator')`, UNP).changes;
    run('UPDATE prodi SET university_id = ? WHERE university_id IS NULL', UNP);
    run("UPDATE content_items SET university_id = ? WHERE university_id IS NULL AND sumber = 'konselor'", UNP);
    run('UPDATE community_groups SET university_id = ? WHERE university_id IS NULL', UNP);
    run('UPDATE assessment_schedules SET university_id = ? WHERE university_id IS NULL', UNP);
    const sos = getConfig('sos', null);
    if (sos && !getConfig(`sos:${UNP}`, null)) setConfig(`sos:${UNP}`, sos);
    if (getConfig('sos_aktif', null) !== null && getConfig(`sos_aktif:${UNP}`, null) === null) setConfig(`sos_aktif:${UNP}`, getConfig('sos_aktif', true));
    setConfig('campus_migrated', { pada: nowIso(), kampus: UNP });
    return c;
  });
  if (n) console.log(`[basis data] Migrasi v6: ${n} akun dipindahkan ke kampus Universitas Nusantara PGRI Kediri (NPSN ${UNP}).`);
  return true;
}

const universityName = (id) => get('SELECT nama FROM universities WHERE id = ?', id)?.nama || null;
const universityView = (u) => (u ? { id: u.id, nama: u.nama, kota: u.kota, provinsi: u.provinsi, status: u.status } : null);
// Singkatan umum diperluas agar "UIN Malang" menemukan "Universitas Islam Negeri … Malang"
const ALIAS = { uin: 'Universitas Islam Negeri', iain: 'Institut Agama Islam Negeri', stain: 'Sekolah Tinggi Agama Islam Negeri', univ: 'Universitas', poltek: 'Politeknik', polinema: 'Politeknik Negeri Malang' };
function searchUniversities(q, limit = 20) {
  const raw = String(q || '').trim();
  const expanded = raw.split(/\s+/).map((w) => ALIAS[w.toLowerCase()] || w).join(' ');
  const words = expanded.split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return [];
  const where = words.map(() => '(nama LIKE ? OR kota LIKE ? OR id = ?)').join(' AND ');
  const p = words.flatMap((w) => [`%${w}%`, `%${w}%`, w]);
  // kampus yang sudah aktif memakai PAN-JALU ditampilkan lebih dulu
  return all(`SELECT u.*, (SELECT COUNT(*) FROM users x WHERE x.university_id = u.id AND x.status = 'aktif') AS pengguna FROM universities u WHERE ${where} AND COALESCE(u.status, '') != 'LAYANAN' ORDER BY pengguna DESC, (nama LIKE 'Universitas%') DESC, nama LIMIT ?`, ...p, limit)
    .map((u) => ({ ...universityView(u), terdaftar: u.pengguna > 0 }));
}

const prodiView = (p) => ({ id: p.id, nama: p.nama_prodi, fakultas: p.fakultas, fakultas_kode: p.fakultas_kode, jenjang: p.jenjang, status: p.status });
const campusProdi = (uid, { semua = false } = {}) => all(`SELECT * FROM prodi WHERE university_id = ? ${semua ? '' : "AND status = 'aktif'"} ORDER BY fakultas, nama_prodi`, uid).map(prodiView);
function campusFaculties(uid) {
  const m = new Map();
  for (const p of campusProdi(uid)) if (!m.has(p.fakultas_kode)) m.set(p.fakultas_kode, { kode: p.fakultas_kode, nama: p.fakultas });
  return [...m.values()];
}
// Kode fakultas otomatis dari inisial bila koordinator tidak mengisinya ("Fakultas Ilmu Pendidikan" → "FIP")
const facultyCode = (nama) => String(nama || '').split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w)).map((w) => w[0].toUpperCase()).join('').slice(0, 8) || 'UMUM';

// Konteks kerja konselor (fakultas & prodi yang menjadi tanggung jawabnya)
function counselorContext(c) {
  const fak = JSON.parse(c.lingkup_fakultas || '[]'); const pro = JSON.parse(c.lingkup_prodi || '[]');
  const names = pro.length ? all(`SELECT nama_prodi FROM prodi WHERE id IN (${pro.map(() => '?').join(',')})`, ...pro).map((x) => x.nama_prodi) : [];
  return { fakultas: fak, prodi: pro, prodi_nama: names, ringkas: [...fak, ...names].join(', ') || 'Seluruh mahasiswa kampus' };
}
// Konselor aktif di kampus, untuk dipilih mahasiswa saat mendaftar (yang konteksnya cocok dengan prodinya di atas)
function campusCounselors(uid, prodiId = null) {
  const p = prodiId ? get('SELECT fakultas_kode FROM prodi WHERE id = ?', prodiId) : null;
  return all("SELECT u.id, u.nama, c.gelar, c.spesialisasi, c.lingkup_fakultas, c.lingkup_prodi, c.layanan_terbuka FROM users u JOIN counselors c ON c.user_id = u.id WHERE u.role = 'konselor' AND u.status = 'aktif' AND u.university_id = ? ORDER BY u.nama", uid)
    .map((c) => { const k = counselorContext(c); const cocok = !!prodiId && (k.prodi.includes(prodiId) || (!!p && k.fakultas.includes(p.fakultas_kode))); return { id: c.id, nama: c.nama, gelar: c.gelar, spesialisasi: c.spesialisasi, konteks: k, layanan_terbuka: !!c.layanan_terbuka, cocok }; })
    .sort((a, b) => b.cocok - a.cocok);
}
const myCounselorIds = (studentId) => all("SELECT counselor_id FROM student_counselors WHERE student_id = ? AND jenis = 'kampus'", studentId).map((x) => x.counselor_id);
// Konselor kampus pilihan mahasiswa (pilihan Konselor PAN-JALU disimpan terpisah, jenis = 'panjalu')
function setStudentCounselors(studentId, uid, ids) {
  const pj = get("SELECT counselor_id FROM student_counselors WHERE student_id = ? AND jenis = 'panjalu'", studentId)?.counselor_id;
  const valid = new Set(campusCounselors(uid).map((c) => c.id));
  const keep = [...new Set((Array.isArray(ids) ? ids : []).filter((x) => valid.has(x) && x !== pj))].slice(0, 5);
  tx(() => {
    run("DELETE FROM student_counselors WHERE student_id = ? AND jenis = 'kampus'", studentId);
    for (const c of keep) insert('student_counselors', { student_id: studentId, counselor_id: c, jenis: 'kampus' });
    if (keep.length) run('UPDATE users SET pilih_konselor_pada = COALESCE(pilih_konselor_pada, ?) WHERE id = ?', nowIso(), studentId);
  });
  return keep;
}
// Kampus yang belum ada di daftar PT: dibuat sebagai "usulan" (dipakai bersama mahasiswa lain dari kampus yang sama)
function proposeUniversity(nama, kota) {
  nama = String(nama || '').trim().replace(/\s+/g, ' ').slice(0, 160); kota = String(kota || '').trim().slice(0, 80) || null;
  if (nama.length < 5) return null;
  const ada = get('SELECT id FROM universities WHERE lower(nama) = lower(?)', nama);
  if (ada) return ada.id;
  let id; do { id = 'U' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0'); } while (get('SELECT 1 AS x FROM universities WHERE id = ?', id));
  insert('universities', { id, nama, kota, provinsi: null, status: 'USULAN', alamat: null });
  return id;
}
// Akun Konselor PAN-JALU independen (tidak terikat kampus) dicatat pada "kampus" virtual ini
const PANJALU_UNI = 'PANJALU';
function ensurePanjaluUni() { if (!get('SELECT 1 AS x FROM universities WHERE id = ?', PANJALU_UNI)) insert('universities', { id: PANJALU_UNI, nama: 'PAN-JALU (Konselor independen)', kota: null, provinsi: null, status: 'LAYANAN', alamat: null }); }

// SOS per kampus (diatur Koordinator Layanan BK kampus)
const sosOf = (uid) => ({ ...(getConfig(`sos:${uid}`, null) || getConfig('sos', {})), aktif: uid ? getConfig(`sos_aktif:${uid}`, true) : true });

module.exports = { UNP, ensureUniversities, migrateCampus, universityName, universityView, searchUniversities, campusProdi, campusFaculties, facultyCode, prodiView, counselorContext, campusCounselors, myCounselorIds, setStudentCounselors, proposeUniversity, PANJALU_UNI, ensurePanjaluUni, sosOf };
