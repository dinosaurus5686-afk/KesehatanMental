// Penyaring data asesmen lintas kampus untuk admin (menu Asesmen & Psikometrik):
// wilayah (provinsi, kota, universitas, fakultas, prodi), demografi (jenis kelamin, umur, tingkat/tahun kuliah, jenjang, angkatan) dan periode.
const { all } = require('./db');
const { str } = require('./http');

const WIB = 7 * 3600000;
// Umur saat mengisi asesmen (tahun penuh) dari tanggal lahir
function ageAt(tgl, iso) {
  if (!tgl || !/^\d{4}-\d{2}-\d{2}/.test(tgl)) return null;
  const b = new Date(tgl + 'T00:00:00Z'); const d = new Date(Date.parse(iso) + WIB);
  let a = d.getUTCFullYear() - b.getUTCFullYear(); if (d.getUTCMonth() < b.getUTCMonth() || (d.getUTCMonth() === b.getUTCMonth() && d.getUTCDate() < b.getUTCDate())) a--;
  return a > 10 && a < 90 ? a : null;
}
const AGE_GROUPS = [['≤19', 0, 19], ['20–21', 20, 21], ['22–23', 22, 23], ['24–29', 24, 29], ['≥30', 30, 200]];
const ageGroup = (a) => (a === null ? 'Tidak diketahui' : AGE_GROUPS.find(([, lo, hi]) => a >= lo && a <= hi)[0]);
// Tingkat (tahun kuliah ke-): tahun akademik dimulai Agustus
function levelAt(angkatan, iso) {
  if (!angkatan) return null;
  const d = new Date(Date.parse(iso) + WIB); const t = d.getUTCFullYear() - Number(angkatan) + (d.getUTCMonth() >= 7 ? 1 : 0);
  return t >= 1 && t <= 10 ? t : null;
}
const levelLabel = (t) => (t === null ? 'Tidak diketahui' : t >= 5 ? 'Tahun ke-5 ke atas' : `Tahun ke-${t}`);
const GENDER = { L: 'Laki-laki', P: 'Perempuan' };
const genderLabel = (g) => GENDER[g] || 'Tidak diketahui';

function filtersOf(q) {
  const s = (k, n = 60) => str(q[k], n) || null;
  return {
    provinsi: s('provinsi', 80), kota: s('kota', 80), universitas: s('universitas', 12), fakultas: s('fakultas', 12), prodi: s('prodi', 40),
    gender: ['L', 'P'].includes(q.gender) ? q.gender : null, umur: AGE_GROUPS.some(([k]) => k === q.umur) ? q.umur : null,
    tingkat: /^[1-5]$/.test(q.tingkat || '') ? Number(q.tingkat) : null, jenjang: s('jenjang', 10), angkatan: /^\d{4}$/.test(q.angkatan || '') ? Number(q.angkatan) : null,
    dari: /^\d{4}-\d{2}-\d{2}$/.test(q.dari || '') ? q.dari : null, sampai: /^\d{4}-\d{2}-\d{2}$/.test(q.sampai || '') ? q.sampai : null,
    mode: q.mode === 'semua' ? 'semua' : 'terbaru',
  };
}

// Baris asesmen + data demografis (tanpa identitas). Filter umur & tingkat dihitung pada saat asesmen diisi.
function loadRows(f, { withHasil = true } = {}) {
  const w = ["u.role = 'mahasiswa'"]; const p = [];
  if (f.provinsi) { w.push('un.provinsi = ?'); p.push(f.provinsi); }
  if (f.kota) { w.push('un.kota = ?'); p.push(f.kota); }
  if (f.universitas) { w.push('u.university_id = ?'); p.push(f.universitas); }
  if (f.fakultas) { w.push('pr.fakultas_kode = ?'); p.push(f.fakultas); }
  if (f.prodi) { w.push('u.prodi_id = ?'); p.push(f.prodi); }
  if (f.gender) { w.push('u.gender = ?'); p.push(f.gender); }
  if (f.jenjang) { w.push('pr.jenjang = ?'); p.push(f.jenjang); }
  if (f.angkatan) { w.push('u.angkatan = ?'); p.push(f.angkatan); }
  if (f.dari) { w.push('a.diisi_pada >= ?'); p.push(new Date(Date.parse(f.dari + 'T00:00:00Z') - WIB).toISOString()); }
  if (f.sampai) { w.push('a.diisi_pada < ?'); p.push(new Date(Date.parse(f.sampai + 'T00:00:00Z') - WIB + 86400000).toISOString()); }
  if (f.mode === 'terbaru') w.push('a.diisi_pada = (SELECT MAX(x.diisi_pada) FROM assessments x WHERE x.user_id = a.user_id)');
  return all(`SELECT a.id, a.user_id, a.diisi_pada, a.skor_total, a.kategori_total, a.skor_fondasi, a.kategori_fondasi, a.skor_otot, a.kategori_otot, a.risk_alert, ${withHasil ? 'a.hasil_json,' : ''} a.jawaban_enc,
      u.university_id, u.prodi_id, u.angkatan, u.gender, u.tanggal_lahir, pr.nama_prodi, pr.fakultas, pr.fakultas_kode, pr.jenjang, un.nama AS universitas, un.provinsi, un.kota
    FROM assessments a JOIN users u ON u.id = a.user_id LEFT JOIN prodi pr ON pr.id = u.prodi_id LEFT JOIN universities un ON un.id = u.university_id
    WHERE ${w.join(' AND ')} ORDER BY a.diisi_pada`, ...p)
    .map((a) => { const umur = ageAt(a.tanggal_lahir, a.diisi_pada); const tingkat = levelAt(a.angkatan, a.diisi_pada); return { ...a, umur, kelompok_umur: ageGroup(umur), tingkat, tingkat_label: levelLabel(tingkat), gender_label: genderLabel(a.gender), tanggal_lahir: undefined }; })
    .filter((a) => (!f.umur || a.kelompok_umur === f.umur) && (!f.tingkat || (f.tingkat === 5 ? a.tingkat >= 5 : a.tingkat === f.tingkat)));
}

// Pilihan untuk menu saring, bertingkat: provinsi → kota → universitas → fakultas → prodi
function filterOptions(f) {
  const base = "FROM assessments a JOIN users u ON u.id = a.user_id JOIN universities un ON un.id = u.university_id WHERE u.role = 'mahasiswa'";
  const opt = {
    provinsi: all(`SELECT un.provinsi AS nilai, COUNT(DISTINCT a.user_id) AS n ${base} AND un.provinsi IS NOT NULL GROUP BY un.provinsi ORDER BY un.provinsi`),
    kota: all(`SELECT un.kota AS nilai, COUNT(DISTINCT a.user_id) AS n ${base} AND un.kota IS NOT NULL ${f.provinsi ? 'AND un.provinsi = ?' : ''} GROUP BY un.kota ORDER BY un.kota`, ...(f.provinsi ? [f.provinsi] : [])),
    universitas: all(`SELECT un.id, un.nama, COUNT(DISTINCT a.user_id) AS n ${base} ${f.provinsi ? 'AND un.provinsi = ?' : ''} ${f.kota ? 'AND un.kota = ?' : ''} GROUP BY un.id ORDER BY n DESC, un.nama`, ...[f.provinsi, f.kota].filter(Boolean)),
    jenjang: all(`SELECT DISTINCT pr.jenjang AS nilai FROM assessments a JOIN users u ON u.id = a.user_id JOIN prodi pr ON pr.id = u.prodi_id WHERE pr.jenjang IS NOT NULL ORDER BY pr.jenjang`).map((x) => x.nilai),
    angkatan: all("SELECT DISTINCT u.angkatan AS nilai FROM assessments a JOIN users u ON u.id = a.user_id WHERE u.angkatan IS NOT NULL ORDER BY u.angkatan DESC").map((x) => x.nilai),
    umur: AGE_GROUPS.map(([k]) => k), tingkat: [1, 2, 3, 4, 5].map((t) => ({ nilai: t, label: levelLabel(t) })), gender: Object.entries(GENDER).map(([nilai, label]) => ({ nilai, label })),
  };
  if (f.universitas) {
    const campus = require('./campus');
    opt.fakultas = campus.campusFaculties(f.universitas); opt.prodi = campus.campusProdi(f.universitas);
  }
  return opt;
}

const filterLabel = (f) => [f.provinsi, f.kota, f.universitas && all('SELECT nama FROM universities WHERE id = ?', f.universitas)[0]?.nama, f.gender && GENDER[f.gender], f.umur && `umur ${f.umur}`, f.tingkat && levelLabel(f.tingkat), f.jenjang, f.angkatan && `angkatan ${f.angkatan}`, f.dari && `sejak ${f.dari}`, f.sampai && `s.d. ${f.sampai}`].filter(Boolean).join(' · ') || 'Seluruh Indonesia';

module.exports = { filtersOf, loadRows, filterOptions, filterLabel, ageAt, ageGroup, levelAt, levelLabel, genderLabel, AGE_GROUPS, GENDER };
