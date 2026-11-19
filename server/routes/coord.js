// Koordinator Layanan BK Universitas: dashboard layanan, pemantauan & penugasan kasus darurat (anonim).
// Koordinator tidak membuka data individual mahasiswa: kasus ditampilkan dengan kode kasus dan fakultas saja.
const express = require('express');
const { all, get, run, insert, update, tx, audit, getConfig, nowIso } = require('../db');
const { fail, requireRole, str } = require('../http');
const campus = require('../campus');
const { notify, caseCode, facultyOf, isOnline } = require('../services');

const r = express.Router();
const coord = requireRole('koordinator');
const DAY = 86400000;
const since = (days) => new Date(Date.now() - days * DAY).toISOString();
const minutes = (a, b) => Math.round((new Date(b) - new Date(a)) / 60000);

function caseView(a, sla) {
  const selesai = !!a.ditindaklanjuti_pada;
  const umur = minutes(a.created_at, selesai ? a.ditindaklanjuti_pada : nowIso());
  return {
    id: a.id, kode: caseCode(a.id), fakultas: facultyOf(a.student_id), sumber: a.sumber, dibuat: a.created_at,
    status: selesai ? 'ditindaklanjuti' : a.ditugaskan_ke ? 'ditugaskan' : 'terbuka',
    menit: umur, lewat_sla: !selesai && umur > sla, dieskalasi: a.dieskalasi_pada,
    ditugaskan: a.ditugaskan_ke ? { id: a.ditugaskan_ke, nama: a.ditugaskan_nama, pada: a.ditugaskan_pada, oleh: a.penugas_nama } : null,
    ditindaklanjuti: selesai ? { nama: a.penangan_nama, pada: a.ditindaklanjuti_pada, waktu_respons_menit: umur } : null,
  };
}
// Semua data koordinator dibatasi pada kampusnya (u.university_id = kampus koordinator)
const CASE_SQL = `SELECT r.*, t.nama AS ditugaskan_nama, p.nama AS penugas_nama, h.nama AS penangan_nama FROM risk_alerts r
  JOIN users s ON s.id = r.student_id
  LEFT JOIN users t ON t.id = r.ditugaskan_ke LEFT JOIN users p ON p.id = r.ditugaskan_oleh LEFT JOIN users h ON h.id = r.ditindaklanjuti_oleh
  WHERE r.level = 'red' AND s.university_id = ?`;

const counselorList = (uni) => all(`SELECT u.id, u.nama, c.status_jaga, c.lingkup_fakultas, c.lingkup_prodi, c.layanan_terbuka, c.spesialisasi FROM users u JOIN counselors c ON c.user_id = u.id
  WHERE u.role = 'konselor' AND u.status = 'aktif' AND u.university_id = ? ORDER BY c.status_jaga DESC, u.nama`, uni)
  .map((c) => ({ id: c.id, nama: c.nama, status_jaga: !!c.status_jaga, online: isOnline(c.id), lingkup_fakultas: JSON.parse(c.lingkup_fakultas || '[]'), konteks: campus.counselorContext(c).ringkas, layanan_terbuka: !!c.layanan_terbuka, spesialisasi: c.spesialisasi,
    binaan: get('SELECT COUNT(*) AS n FROM student_counselors WHERE counselor_id = ?', c.id).n,
    kasus_aktif: get('SELECT COUNT(*) AS n FROM risk_alerts WHERE ditugaskan_ke = ? AND ditindaklanjuti_pada IS NULL', c.id).n }));

r.get('/coord/dashboard', coord, (req, res) => {
  const sla = Number(getConfig('sla_menit', 30)); const uni = req.user.university_id;
  const open = all(`${CASE_SQL} AND r.ditindaklanjuti_pada IS NULL ORDER BY r.created_at`, uni).map((a) => caseView(a, sla));
  const done30 = all(`${CASE_SQL} AND r.ditindaklanjuti_pada IS NOT NULL AND r.created_at >= ?`, uni, since(30)).map((a) => caseView(a, sla));
  const counselors = counselorList(uni);
  const n = (sql, ...p) => get(sql, ...p).n;
  const respons = done30.map((x) => x.ditindaklanjuti.waktu_respons_menit);
  res.json({
    kpi: {
      kasus_terbuka: open.length, lewat_sla: open.filter((x) => x.lewat_sla).length, belum_ditugaskan: open.filter((x) => x.status === 'terbuka').length,
      kasus_selesai_30hari: done30.length, rata_respons_menit: respons.length ? Math.round(respons.reduce((a, b) => a + b, 0) / respons.length) : null,
      konselor_aktif: counselors.length, konselor_jaga: counselors.filter((c) => c.status_jaga).length,
      pendaftar_konselor: n("SELECT COUNT(*) AS n FROM users WHERE role = 'konselor' AND status = 'menunggu_persetujuan' AND university_id = ?", uni),
      mahasiswa_aktif: n("SELECT COUNT(*) AS n FROM users WHERE role = 'mahasiswa' AND status = 'aktif' AND university_id = ?", uni),
      asesmen_30hari: n('SELECT COUNT(*) AS n FROM assessments a JOIN users u ON u.id = a.user_id WHERE a.diisi_pada >= ? AND u.university_id = ?', since(30), uni),
      sesi_selesai_30hari: n("SELECT COUNT(*) AS n FROM appointments a JOIN users u ON u.id = a.student_id WHERE a.status = 'selesai' AND a.jadwal >= ? AND u.university_id = ?", since(30), uni),
      reservasi_menunggu: n("SELECT COUNT(*) AS n FROM appointments a JOIN users u ON u.id = a.student_id WHERE a.status = 'pending' AND u.university_id = ?", uni),
      prodi_usulan: n("SELECT COUNT(*) AS n FROM prodi WHERE university_id = ? AND status = 'usulan'", uni),
      mahasiswa_tanpa_konselor: n("SELECT COUNT(*) AS n FROM users u WHERE u.role = 'mahasiswa' AND u.status = 'aktif' AND u.university_id = ? AND NOT EXISTS (SELECT 1 FROM student_counselors sc WHERE sc.student_id = u.id)", uni),
    },
    universitas: campus.universityName(uni), sla_menit: sla,
    kasus_terbuka: open.slice(0, 6),
    konselor: counselors.map((c) => ({ ...c, slot_aktif: get('SELECT COUNT(*) AS n FROM counselor_slots WHERE counselor_id = ? AND aktif = 1', c.id).n })),
  });
});

r.get('/coord/alerts', coord, (req, res) => {
  const sla = Number(getConfig('sla_menit', 30));
  const days = [7, 30, 90, 365].includes(Number(req.query.hari)) ? Number(req.query.hari) : 30;
  const rows = all(`${CASE_SQL} AND (r.ditindaklanjuti_pada IS NULL OR r.created_at >= ?) ORDER BY (r.ditindaklanjuti_pada IS NULL) DESC, r.created_at DESC`, req.user.university_id, since(days)).map((a) => caseView(a, sla));
  const perFak = new Map();
  for (const x of rows) { const g = perFak.get(x.fakultas) || { fakultas: x.fakultas, jumlah: 0, terbuka: 0 }; g.jumlah++; if (x.status !== 'ditindaklanjuti') g.terbuka++; perFak.set(x.fakultas, g); }
  res.json({ hari: days, sla_menit: sla, kasus: rows, per_fakultas: [...perFak.values()].sort((a, b) => b.jumlah - a.jumlah), konselor: counselorList(req.user.university_id) });
});

r.post('/coord/alerts/:id/assign', coord, (req, res) => {
  const a = get("SELECT r.* FROM risk_alerts r JOIN users s ON s.id = r.student_id WHERE r.id = ? AND r.level = 'red' AND s.university_id = ?", req.params.id, req.user.university_id);
  if (!a) fail(404, 'Kasus tidak ditemukan di kampus Anda.');
  if (a.ditindaklanjuti_pada) fail(409, 'Kasus ini sudah ditindaklanjuti.');
  const c = get("SELECT id, nama FROM users WHERE id = ? AND role = 'konselor' AND status = 'aktif' AND university_id = ?", req.body?.counselor_id, req.user.university_id);
  if (!c) fail(400, 'Pilih konselor aktif di kampus Anda yang akan menangani kasus ini.');
  const prev = a.ditugaskan_ke;
  update('risk_alerts', a.id, { ditugaskan_ke: c.id, ditugaskan_oleh: req.user.id, ditugaskan_pada: nowIso() });
  audit({ actor: req.user, aksi: prev ? 'alihkan_kasus_darurat' : 'tugaskan_kasus_darurat', entitas: 'risk_alerts', entitas_id: a.id, alasan: `kepada ${c.nama}`, ip: req.ip });
  notify(c.id, { tipe: 'krisis', prioritas: 'krisis', judul: `Anda ditugaskan menangani kasus darurat ${caseCode(a.id)}`, isi: `Ditugaskan oleh ${req.user.nama} (Koordinator Layanan BK). Segera tindak lanjuti sesuai SOP krisis.`, tautan: `#/c/mahasiswa/${a.student_id}` });
  if (prev && prev !== c.id) notify(prev, { tipe: 'krisis', judul: `Kasus ${caseCode(a.id)} dialihkan ke ${c.nama}`, isi: `Dialihkan oleh ${req.user.nama}.`, tautan: '#/c/dashboard' });
  res.json({ ok: true });
});

// ---------- Fakultas & program studi kampus (dikelola koordinator) ----------
const prodiWithCount = (uni) => all(`SELECT p.*, (SELECT COUNT(*) FROM users u WHERE u.prodi_id = p.id AND u.role = 'mahasiswa') AS mahasiswa FROM prodi p WHERE p.university_id = ?
  ORDER BY p.status = 'usulan' DESC, p.fakultas, p.nama_prodi`, uni).map((p) => ({ ...campus.prodiView(p), mahasiswa: p.mahasiswa }));
const JENJANG = ['D1', 'D2', 'D3', 'D4', 'S1', 'S2', 'S3', 'Profesi', 'Spesialis']; // saran; jenjang lain boleh diketik sendiri
function prodiFields(b) {
  const f = {};
  if ('nama' in b) { f.nama_prodi = str(b.nama, 120); if (f.nama_prodi.length < 3) fail(400, 'Isi nama program studi.'); }
  if ('fakultas' in b) { f.fakultas = str(b.fakultas, 120); if (f.fakultas.length < 3) fail(400, 'Isi nama fakultas.'); }
  if ('fakultas_kode' in b || f.fakultas) f.fakultas_kode = (str(b.fakultas_kode, 12) || campus.facultyCode(f.fakultas)).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if ('jenjang' in b) { f.jenjang = str(b.jenjang, 20); if (!f.jenjang) fail(400, 'Isi jenjang (mis. S1, D3, Profesi).'); }
  if ('status' in b) { if (!['aktif', 'nonaktif'].includes(b.status)) fail(400, 'Status tidak valid.'); f.status = b.status; }
  return f;
}
const prodiOf = (req) => { const p = get('SELECT * FROM prodi WHERE id = ? AND university_id = ?', req.params.id, req.user.university_id); if (!p) fail(404, 'Program studi tidak ditemukan.'); return p; };
r.get('/coord/prodi', coord, (req, res) => res.json({ universitas: campus.universityName(req.user.university_id), items: prodiWithCount(req.user.university_id), jenjang: JENJANG }));
r.post('/coord/prodi', coord, (req, res) => {
  const f = prodiFields({ jenjang: 'S1', ...req.body });
  if (!f.nama_prodi || !f.fakultas) fail(400, 'Isi nama fakultas dan program studi.');
  if (get('SELECT 1 AS x FROM prodi WHERE university_id = ? AND lower(nama_prodi) = lower(?) AND jenjang = ?', req.user.university_id, f.nama_prodi, f.jenjang)) fail(409, 'Program studi itu sudah ada.');
  const id = insert('prodi', { ...f, university_id: req.user.university_id, status: 'aktif' });
  audit({ actor: req.user, aksi: 'tambah_prodi', entitas: 'prodi', entitas_id: id, alasan: f.nama_prodi, ip: req.ip });
  res.status(201).json({ id });
});
// Tempel banyak baris sekaligus: "Fakultas | Kode | Program studi | Jenjang" (kode & jenjang boleh kosong)
r.post('/coord/prodi/bulk', coord, (req, res) => {
  const lines = String(req.body?.teks || '').split('\n').map((l) => l.split(/\t|\|/).map((x) => x.trim())).filter((x) => x.length >= 2 && x.join('').length > 4).slice(0, 400);
  let added = 0; let skipped = 0;
  tx(() => {
    for (const parts of lines) {
      const [fakultas, a, b, c] = parts;
      const [kode, nama, jenjang] = parts.length >= 3 ? [a, b, c] : ['', a, ''];
      const f = prodiFields({ fakultas, fakultas_kode: kode || '', nama, jenjang: str(jenjang, 20) || 'S1' });
      if (get('SELECT 1 AS x FROM prodi WHERE university_id = ? AND lower(nama_prodi) = lower(?) AND jenjang = ?', req.user.university_id, f.nama_prodi, f.jenjang)) { skipped++; continue; }
      insert('prodi', { ...f, university_id: req.user.university_id, status: 'aktif' }); added++;
    }
  });
  audit({ actor: req.user, aksi: 'impor_prodi', entitas: 'prodi', alasan: `${added} ditambahkan, ${skipped} sudah ada`, ip: req.ip });
  res.json({ ditambahkan: added, dilewati: skipped });
});
r.patch('/coord/prodi/:id', coord, (req, res) => {
  const p = prodiOf(req);
  const f = prodiFields(req.body || {});
  if (p.status === 'usulan' && !('status' in f)) f.status = 'aktif'; // menyimpan usulan = menyetujuinya
  update('prodi', p.id, f);
  audit({ actor: req.user, aksi: 'ubah_prodi', entitas: 'prodi', entitas_id: p.id, alasan: JSON.stringify(f), ip: req.ip });
  res.json({ ok: true });
});
// Gabungkan prodi usulan/ganda ke prodi resmi: mahasiswa dipindahkan, lalu entri lama dihapus
r.post('/coord/prodi/:id/merge', coord, (req, res) => {
  const p = prodiOf(req);
  const target = get("SELECT * FROM prodi WHERE id = ? AND university_id = ? AND status = 'aktif'", req.body?.ke, req.user.university_id);
  if (!target || target.id === p.id) fail(400, 'Pilih program studi tujuan yang aktif.');
  const moved = tx(() => {
    const n = run('UPDATE users SET prodi_id = ? WHERE prodi_id = ?', target.id, p.id).changes;
    run("UPDATE assessment_schedules SET target = ? WHERE cakupan = 'prodi' AND target = ?", target.id, p.id);
    for (const c of all('SELECT id, lingkup_prodi FROM counselors WHERE lingkup_prodi LIKE ?', `%${p.id}%`)) update('counselors', c.id, { lingkup_prodi: JSON.stringify([...new Set(JSON.parse(c.lingkup_prodi).map((x) => (x === p.id ? target.id : x)))]) });
    run('DELETE FROM prodi WHERE id = ?', p.id);
    return n;
  });
  audit({ actor: req.user, aksi: 'gabung_prodi', entitas: 'prodi', entitas_id: target.id, alasan: `${p.nama_prodi} → ${target.nama_prodi} (${moved} mahasiswa)`, ip: req.ip });
  res.json({ dipindahkan: moved });
});

// ---- Kop dokumen kampus (dipakai di seluruh PDF/Word koordinator, konselor, dan mahasiswa kampus ini) ----
const branding = require('../branding');
r.get('/coord/kop', coord, (req, res) => res.json(branding.kopView(req.user.university_id)));
r.put('/coord/kop', coord, (req, res) => {
  const out = branding.saveKop(req.user.university_id, req.body || {}, req.user); if (out.error) fail(400, out.error);
  audit({ actor: req.user, aksi: 'kop_dokumen_diubah', entitas: 'universities', entitas_id: req.user.university_id, alasan: str(req.body?.nama, 160), ip: req.ip });
  res.json(branding.kopView(req.user.university_id));
});
r.delete('/coord/kop', coord, (req, res) => {
  branding.resetKop(req.user.university_id);
  audit({ actor: req.user, aksi: 'kop_dokumen_bawaan', entitas: 'universities', entitas_id: req.user.university_id, ip: req.ip });
  res.json(branding.kopView(req.user.university_id));
});
// Contoh PDF untuk memeriksa tampilan kop
r.get('/coord/kop/contoh.pdf', coord, (req, res) => {
  const pdfx = require('../pdf'); const doc = pdfx.start(res, 'contoh-kop-dokumen.pdf');
  pdfx.kop(doc, 'CONTOH KOP DOKUMEN', 'Tampilan ini dipakai pada laporan, formulir, dan raport PDF kampus Anda', branding.brandFor(req.user.university_id));
  pdfx.kv(doc, [['Nama', 'Nama Mahasiswa'], ['NIM', '0000000000'], ['Perguruan tinggi', campus.universityName(req.user.university_id) || '-'], ['Program studi', 'Program Studi Contoh']]);
  pdfx.footer(doc, 'Contoh · PAN-JALU'); doc.end();
});

module.exports = r;
