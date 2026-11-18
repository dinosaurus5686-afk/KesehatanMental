// Logika domain bersama: asesmen IKDKM-M & rekomendasi, jadwal asesmen, protokol krisis, notifikasi, kewenangan akses.
const { all, get, insert, update, tx, getConfig, nowIso } = require('./db');
const { enc, dec } = require('./security');
const { scoreAssessment, interpret, buildInterpretation, counselorClaims } = require('./scoring');
const { DIMENSIONS, ITEMS, QUADRANTS, NORMS, SUPPORT, SUBCOMPONENTS, kwLabel, plainReason } = require('./reference');

let io = null;
const online = new Map(); // userId -> jumlah koneksi socket aktif
const setIo = (x) => { io = x; };
const isOnline = (uid) => (online.get(uid) || 0) > 0;
const markOnline = (uid, delta) => { online.set(uid, Math.max(0, (online.get(uid) || 0) + delta)); if (io) io.emit('presence', { user_id: uid, online: isOnline(uid) }); };
const emit = (uid, event, payload) => { if (io) io.to(`user:${uid}`).emit(event, payload); };

function notify(userId, { tipe, judul, isi = null, tautan = null, prioritas = 'normal' }) {
  const n = { user_id: userId, tipe, judul, isi, tautan, prioritas, dibuat_pada: nowIso() };
  n.id = insert('notifications', n);
  emit(userId, 'notification', n);
  return n;
}

// ---------- Rekomendasi otomatis berbasis keyword-tagging butir ----------
// Tahap Developmental: maksimal 3 konten psikoedukasi paling urgen, dari butir pemicu (unfavorable SS/S atau favorable TS/STS).
const norm = (s) => String(s || '').toLowerCase().trim();
// Konten yang terlihat oleh mahasiswa sebuah kampus: buatan konselor kampus itu, atau pustaka admin yang dipakai konselor kampus itu
const VISIBLE_CONTENT = `status = 'published' AND ((sumber = 'konselor' AND university_id = ?) OR (sumber = 'admin' AND EXISTS (SELECT 1 FROM content_adoptions ca WHERE ca.content_id = content_items.id AND ca.university_id = ? AND ca.status = 'published')))`;
const visibleContent = (universityId) => ({ where: VISIBLE_CONTENT, params: [universityId, universityId] });
function contentRecommendations(hasil, limit = 3, universityId = null) {
  const weights = new Map(); // kata kunci -> bobot urgensi
  const dimWeight = {};
  for (const b of hasil.butir_pemicu || []) {
    const it = ITEMS.find((x) => x.no === b.no);
    for (const kw of it.kata_kunci) weights.set(norm(kw), (weights.get(norm(kw)) || 0) + b.bobot);
    dimWeight[it.dimensi] = (dimWeight[it.dimensi] || 0) + b.bobot;
  }
  if (!weights.size) return [];
  const items = all(`SELECT id, judul, kategori, kata_kunci FROM content_items WHERE ${VISIBLE_CONTENT}`, universityId, universityId);
  return items.map((c) => {
    const kws = JSON.parse(c.kata_kunci || '[]');
    const hit = kws.filter((k) => weights.has(norm(k)));
    const score = hit.reduce((s, k) => s + weights.get(norm(k)), 0) + (dimWeight[c.kategori] || 0) * 0.2;
    return { c, hit, score };
  }).filter((x) => x.hit.length).sort((a, b) => b.score - a.score).slice(0, limit)
    .map(({ c, hit }, i) => ({ jenis: 'konten', target_id: c.id, judul: c.judul, alasan: `Prioritas ${i + 1} · cocok dengan: ${hit.slice(0, 3).map(kwLabel).join(', ')}. Setelah mempelajarinya, isi Refleksi GURU di halaman konten.` }));
}

// Alur intervensi: Kuratif (darurat) → Reflektif → Kolaboratif, sesuai profil & kesiapan Bagian 3
function serviceRecommendations(h) {
  const recs = [];
  const siap = (k) => h.dukungan.find((x) => x.kode === k)?.siap;
  const lemah = (k) => h.pelemahan.includes(k);
  const add = (jenis, judul, alasan, target_id = null) => { if (!recs.some((r) => r.jenis === jenis && r.target_id === target_id)) recs.push({ jenis, judul, alasan, target_id }); };
  if (h.penanda.butuh_bantuan_segera) add('konseling', 'Hubungi konselor sekarang', 'Kondisimu saat ini membutuhkan pendampingan segera. Daftar konseling agar konselor kampus dapat mendampingimu.');
  if (h.perlu_kuratif) add('konseling', 'Reservasi konseling profesional (Reality Therapy)', h.kategori_total === 'Krisis' ? 'Indeks kekuatan mentalmu berada pada kategori krisis.' : siap('kuratif') ? 'Kamu ingin berbicara dengan konselor.' : 'Ada tanda kelelahan emosi atau fisik yang berat.');
  if (siap('reflektif') || h.kategori_total !== 'Tangguh' || lemah('V6') || lemah('V5')) add('relaksasi', 'Ruang Mindfulness: latihan penguat mental harian', 'Kebiasaan positif: latihan menenangkan tubuh dan pikiran setiap hari tanpa mengkritik diri.');
  if (siap('kolaboratif') || lemah('V2') || h.kategori_total !== 'Tangguh') {
    add('komunitas', 'Gabung grup diskusi sebaya', lemah('V2') ? 'Kebutuhan relasionalmu sedang melemah; praktikkan 7 Caring Habits bersama teman.' : 'Kamu butuh dukungan teman sebaya.');
    add('peer', 'Ngobrol dengan konselor sebaya terlatih', 'Teman sebaya terlatih dapat menjadi langkah awal yang nyaman.');
  }
  return recs;
}

function storeAssessment(userId, data, at = nowIso()) {
  const h = scoreAssessment(data);
  const svc = serviceRecommendations(h); const kontens = contentRecommendations(h, 3, get('SELECT university_id FROM users WHERE id = ?', userId)?.university_id);
  // Konseling (bila darurat) selalu di urutan teratas, lalu 3 konten paling urgen, lalu layanan lain
  const recs = [...svc.filter((r) => r.jenis === 'konseling'), ...kontens, ...svc.filter((r) => r.jenis !== 'konseling')];
  const id = tx(() => {
    const aid = insert('assessments', {
      user_id: userId, diisi_pada: at, created_at: at, skor_total: h.skor_total, kategori_total: h.kategori_total, skor_fondasi: h.skor_fondasi, kategori_fondasi: h.kategori_fondasi,
      skor_otot: h.skor_otot, kategori_otot: h.kategori_otot, kuadran: h.kuadran, risk_alert: h.risk_alert, fokus_dimensi: h.fokus_dimensi,
      hasil_json: JSON.stringify(h), jawaban_enc: enc(JSON.stringify(data)), izin_ai: data.persetujuan?.b ? 1 : 0, izin_dihubungi: data.persetujuan?.c ? 1 : 0,
    });
    recs.forEach((r, i) => insert('assessment_recommendations', { assessment_id: aid, student_id: userId, sumber: 'otomatis', urutan: i, created_at: at, ...r }));
    return aid;
  });
  return { id, ...h };
}

function recommendationsFor(assessmentId) {
  return all('SELECT r.*, u.nama AS oleh FROM assessment_recommendations r LEFT JOIN users u ON u.id = r.dibuat_oleh WHERE r.assessment_id = ? ORDER BY r.sumber DESC, r.urutan, r.created_at', assessmentId)
    .map((r) => {
      const link = { konten: `#/s/psikoedukasi/konten/${r.target_id}`, konseling: '#/s/konseling', komunitas: r.target_id ? `#/s/komunitas/${r.target_id}` : '#/s/komunitas', peer: '#/s/komunitas', workbook: r.target_id ? `#/s/psikoedukasi/kategori/${r.target_id}` : '#/s/workbook', relaksasi: '#/s/relaksasi', lainnya: null }[r.jenis];
      return { id: r.id, sumber: r.sumber, jenis: r.jenis, target_id: r.target_id, judul: r.judul, alasan: plainReason(r.alasan), oleh: r.oleh, tautan: link, created_at: r.created_at };
    });
}

const SUMMARY_COLS = ['skor_total', 'kategori_total', 'skor_fondasi', 'kategori_fondasi', 'skor_otot', 'kategori_otot', 'kuadran'];
function assessmentDetail(a, { withRecs = true, konselor = false } = {}) {
  if (!a) return null;
  const h = JSON.parse(a.hasil_json);
  return {
    id: a.id, user_id: a.user_id, diisi_pada: a.diisi_pada, ...Object.fromEntries(SUMMARY_COLS.map((k) => [k, a[k]])), tahap_layanan: NORMS.total.batas.find((b) => b[1] === a.kategori_total)?.[3] || h.tahap_layanan, // nama tahap selalu mengikuti istilah terbaru (data lama ikut)
    risk_alert: a.risk_alert, fokus_dimensi: a.fokus_dimensi, izin_ai: !!a.izin_ai, izin_dihubungi: !!a.izin_dihubungi,
    dimensi: h.dimensi.map((d) => { const r = DIMENSIONS.find((x) => x.kode === d.kode); return { ...d, nama: r.nama, label: r.label }; }), subkomponen: h.subkomponen.map((x) => ({ ...x, nama: SUBCOMPONENTS.find((y) => y.kode === x.kode)?.nama || x.nama })), dukungan: h.dukungan.map((x) => ({ ...x, nama: SUPPORT.find((y) => y.kode === x.kode)?.nama || x.nama })), siap_dukungan: h.siap_dukungan, pelemahan: h.pelemahan, kekuatan: h.kekuatan,
    penanda: h.penanda, perlu_kuratif: h.perlu_kuratif, butir_pemicu: h.butir_pemicu,
    interpretasi: interpret(h), penjelasan: buildInterpretation(h), klaim: konselor ? counselorClaims(h) : undefined, rekomendasi: withRecs ? recommendationsFor(a.id) : undefined,
  };
}
const latestAssessment = (sid, opts) => assessmentDetail(get('SELECT * FROM assessments WHERE user_id = ? ORDER BY diisi_pada DESC LIMIT 1', sid), opts);
const decodeAnswers = (a) => JSON.parse(dec(a.jawaban_enc));

// ---------- Jadwal pengisian asesmen (diatur konselor) ----------
const SPECIFICITY = { individu: 5, prodi: 4, angkatan: 3, fakultas: 2, semua: 1 };
function effectiveSchedule(studentId) {
  const s = get('SELECT u.id, u.prodi_id, u.angkatan, u.university_id, p.fakultas_kode FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.id = ?', studentId);
  if (!s) return null;
  const rows = all('SELECT * FROM assessment_schedules WHERE aktif = 1 AND university_id IS ?', s.university_id).filter((r) =>
    r.cakupan === 'semua' || (r.cakupan === 'fakultas' && r.target === s.fakultas_kode) || (r.cakupan === 'prodi' && r.target === s.prodi_id)
    || (r.cakupan === 'angkatan' && String(r.target) === String(s.angkatan)) || (r.cakupan === 'individu' && r.target === s.id));
  rows.sort((a, b) => (SPECIFICITY[b.cakupan] - SPECIFICITY[a.cakupan]) || b.created_at.localeCompare(a.created_at));
  const r = rows[0];
  const last = get('SELECT diisi_pada FROM assessments WHERE user_id = ? ORDER BY diisi_pada DESC LIMIT 1', studentId);
  if (!r) return { interval_hari: null, pesan: null, cakupan: null, terakhir: last?.diisi_pada || null, jatuh_tempo: null, status: last ? 'sudah' : 'belum' };
  const due = last ? new Date(new Date(last.diisi_pada).getTime() + r.interval_hari * 86400000).toISOString() : nowIso();
  return { schedule_id: r.id, interval_hari: r.interval_hari, pesan: r.pesan, cakupan: r.cakupan, terakhir: last?.diisi_pada || null, jatuh_tempo: due, status: !last ? 'belum' : due <= nowIso() ? 'jatuh_tempo' : 'sudah' };
}

// ---------- Akses & identitas ----------
// Semua daftar penerima dibatasi per kampus (universityId); admin bersifat lintas kampus
const counselorsOnDuty = (uni) => all("SELECT u.id FROM counselors c JOIN users u ON u.id = c.user_id WHERE c.status_jaga = 1 AND u.status = 'aktif' AND u.university_id IS ?", uni).map((r) => r.id);
const allCounselors = (uni) => all("SELECT id FROM users WHERE role = 'konselor' AND status = 'aktif' AND university_id IS ?", uni).map((r) => r.id);
const admins = () => all("SELECT id FROM users WHERE role = 'admin' AND status = 'aktif'").map((r) => r.id);
// Koordinator Layanan BK kampus: akun koordinator, ditambah konselor yang klaim rangkap koordinatornya disetujui admin
const COORD_WHERE = "status = 'aktif' AND university_id IS ? AND (role = 'koordinator' OR (role = 'konselor' AND id IN (SELECT user_id FROM coordinator_claims WHERE status = 'disetujui')))";
const coordinatorUsers = (uni) => all(`SELECT id, email, nama, role FROM users WHERE ${COORD_WHERE}`, uni);
const coordinators = (uni) => coordinatorUsers(uni).map((r) => r.id);
const dualCoordinator = (userId) => !!get("SELECT 1 AS x FROM coordinator_claims WHERE user_id = ? AND status = 'disetujui'", userId);
const universityOf = (userId) => get('SELECT university_id FROM users WHERE id = ?', userId)?.university_id ?? null;
// Kode kasus anonim untuk Koordinator (tanpa nama/NIM): turunan tetap dari id peringatan
const caseCode = (alertId) => `KD-${alertId.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
const facultyOf = (studentId) => get('SELECT p.fakultas_kode FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.id = ?', studentId)?.fakultas_kode || '-';

// Protokol krisis: penanda butuh bantuan segera IKDKM-M → semua konselor jaga, tercatat sebagai intervensi krisis.
function handleRisk(student, assessmentId, level, { sumber = 'asesmen', izinDihubungi = true } = {}) {
  if (level !== 'red') return null;
  const alertId = insert('risk_alerts', { student_id: student.id, assessment_id: assessmentId, level, sumber, izin_dihubungi: izinDihubungi ? 1 : 0 });
  const nama = student.identitas_disamarkan ? `Mahasiswa (identitas disamarkan, NIM …${student.nim_nip.slice(-4)})` : student.nama;
  insert('interventions', { student_id: student.id, deskripsi: `Butuh bantuan segera (IKDKM-M: indeks krisis/gejala emosional-fisiologis berat) dari ${sumber}${izinDihubungi ? '' : ' — mahasiswa memilih tidak dihubungi otomatis; tindak lanjuti sesuai SOP krisis'}.`, prioritas: 'krisis' });
  const uni = student.university_id ?? universityOf(student.id);
  const onDuty = counselorsOnDuty(uni);
  let targets = onDuty;
  if (!targets.length) targets = allCounselors(uni);
  if (!targets.length) targets = admins(); // kampus belum punya konselor aktif
  for (const uid of targets) {
    notify(uid, { tipe: 'krisis', prioritas: 'krisis', judul: 'BUTUH BANTUAN SEGERA — perlu tindak lanjut', isi: `${nama}: hasil IKDKM-M menunjukkan kebutuhan didampingi konselor segera.${izinDihubungi ? '' : ' Mahasiswa memilih tidak dihubungi otomatis.'}`, tautan: `#/c/mahasiswa/${student.id}` });
    emit(uid, 'crisis', { alert_id: alertId, student_id: student.id });
  }
  // Koordinator hanya menerima informasi agregat/anonim untuk memastikan ada konselor yang menangani
  for (const uid of coordinators(uni)) notify(uid, { tipe: 'krisis', prioritas: 'krisis', judul: `Kasus darurat baru ${caseCode(alertId)} (${facultyOf(student.id)})`, isi: onDuty.length ? 'Konselor jaga sudah diberi tahu. Pantau tindak lanjutnya atau tugaskan konselor.' : 'Tidak ada konselor berstatus jaga. Segera tugaskan konselor.', tautan: '#/k/darurat' });
  return alertId;
}

// Ringkasan konteks kerja konselor untuk label dashboard (fakultas + nama prodi)
function counselorScope(uid) {
  const c = get('SELECT lingkup_fakultas, lingkup_prodi FROM counselors WHERE user_id = ?', uid);
  if (!c) return [];
  const pro = JSON.parse(c.lingkup_prodi || '[]');
  return [...JSON.parse(c.lingkup_fakultas || '[]'), ...(pro.length ? all(`SELECT nama_prodi FROM prodi WHERE id IN (${pro.map(() => '?').join(',')})`, ...pro).map((x) => x.nama_prodi) : [])];
}

// Kewenangan konselor (hanya mahasiswa sekampus): mahasiswa binaan (memilih konselor ini), klien sendiri,
// mahasiswa yang belum memilih konselor dan berada dalam konteks kerjanya, kasus krisis terbuka saat jaga, atau penugasan koordinator.
function canAccessStudent(user, studentId) {
  const s = get("SELECT u.id, u.university_id, u.prodi_id, p.fakultas_kode FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.id = ? AND u.role = 'mahasiswa'", studentId);
  if (!s) return { ok: false, reason: 'not_found' };
  if (user.role === 'mahasiswa') return { ok: user.id === studentId, reason: 'self' };
  if (user.role !== 'konselor') return { ok: false, reason: 'role' };
  if (s.university_id !== user.university_id) return { ok: false, reason: 'di_luar_kampus' };
  if (get('SELECT 1 AS x FROM student_counselors WHERE student_id = ? AND counselor_id = ?', studentId, user.id)) return { ok: true, reason: 'binaan' };
  if (get('SELECT 1 AS x FROM appointments WHERE student_id = ? AND counselor_id = ?', studentId, user.id)) return { ok: true, reason: 'klien' };
  if (!get('SELECT 1 AS x FROM student_counselors WHERE student_id = ?', studentId)) {
    const c = get('SELECT lingkup_fakultas, lingkup_prodi FROM counselors WHERE user_id = ?', user.id);
    const fak = JSON.parse(c?.lingkup_fakultas || '[]'); const pro = JSON.parse(c?.lingkup_prodi || '[]');
    if ((!fak.length && !pro.length) || pro.includes(s.prodi_id) || fak.includes(s.fakultas_kode)) return { ok: true, reason: 'konteks_kerja' };
  }
  const duty = get('SELECT status_jaga FROM counselors WHERE user_id = ?', user.id);
  if (duty?.status_jaga && get("SELECT 1 AS x FROM risk_alerts WHERE student_id = ? AND level = 'red' AND ditindaklanjuti_pada IS NULL", studentId)) return { ok: true, reason: 'krisis_terbuka' };
  if (get("SELECT 1 AS x FROM risk_alerts WHERE student_id = ? AND ditugaskan_ke = ? AND ditindaklanjuti_pada IS NULL", studentId, user.id)) return { ok: true, reason: 'penugasan_koordinator' };
  return { ok: false, reason: 'di_luar_kewenangan' };
}

function scopedStudentIds(user) {
  if (user.role !== 'konselor') return [];
  return all("SELECT id FROM users WHERE role = 'mahasiswa' AND status = 'aktif' AND university_id IS ?", user.university_id).map((r) => r.id).filter((id) => canAccessStudent(user, id).ok);
}

function displayName(student, viewer) {
  if (student.identitas_disamarkan && viewer?.role !== 'mahasiswa') return `${student.nama.split(' ').map((w) => w[0] + '.').join(' ')} (disamarkan)`;
  return student.nama;
}

const activePeer = (uid) => get('SELECT * FROM peer_counselors WHERE user_id = ? AND aktif = 1', uid);

// ---------- Penjadwal latar ----------
function runScheduler() {
  const sla = Number(getConfig('sla_menit', 30));
  const cutoff = new Date(Date.now() - sla * 60000).toISOString();
  for (const a of all("SELECT r.*, u.nama, u.nim_nip, u.university_id FROM risk_alerts r JOIN users u ON u.id = r.student_id WHERE r.level = 'red' AND r.ditindaklanjuti_pada IS NULL AND r.dieskalasi_pada IS NULL AND r.created_at < ?", cutoff)) {
    update('risk_alerts', a.id, { dieskalasi_pada: nowIso() });
    // Admin (lintas kampus) hanya menerima eskalasi bila kampus itu belum punya Koordinator Layanan BK aktif
    if (!coordinators(a.university_id).length) for (const uid of admins()) notify(uid, { tipe: 'eskalasi', prioritas: 'krisis', judul: `Eskalasi SLA: kasus ${caseCode(a.id)} belum ditindaklanjuti > ${sla} menit`, isi: `Kampus ${get('SELECT nama FROM universities WHERE id = ?', a.university_id)?.nama || '-'} belum memiliki Koordinator Layanan BK aktif.` });
    for (const uid of allCounselors(a.university_id)) notify(uid, { tipe: 'eskalasi', prioritas: 'krisis', judul: 'Pengingat: kasus butuh bantuan segera melewati SLA', isi: 'Kasus telah diteruskan ke penanggung jawab layanan.', tautan: '#/c/dashboard' });
    for (const uid of coordinators(a.university_id)) notify(uid, { tipe: 'eskalasi', prioritas: 'krisis', judul: `Eskalasi SLA: kasus ${caseCode(a.id)} belum ditindaklanjuti > ${sla} menit`, isi: `Fakultas ${facultyOf(a.student_id)}. Tugaskan konselor untuk menindaklanjuti.`, tautan: '#/k/darurat' });
  }
  for (const t of all('SELECT * FROM scheduled_tasks WHERE terkirim = 0 AND jatuh_tempo <= ?', nowIso())) {
    update('scheduled_tasks', t.id, { terkirim: 1 });
    notify(t.owner_id, { tipe: 'tugas', judul: `Pengingat monitoring: ${t.judul}`, tautan: t.student_id ? `#/c/mahasiswa/${t.student_id}` : '#/c/dashboard' });
  }
  // Pengingat asesmen sesuai jadwal konselor: satu kali per jatuh tempo
  for (const s of all("SELECT id FROM users WHERE role = 'mahasiswa' AND status = 'aktif'")) {
    const e = effectiveSchedule(s.id);
    if (!e?.interval_hari || e.status === 'sudah') continue;
    const since = e.terakhir || new Date(Date.now() - e.interval_hari * 86400000).toISOString();
    if (get("SELECT 1 AS x FROM assessment_reminders WHERE user_id = ? AND jenis = 'jadwal' AND dikirim_pada > ?", s.id, since)) continue;
    insert('assessment_reminders', { user_id: s.id, jenis: 'jadwal', schedule_id: e.schedule_id, dikirim_pada: nowIso() });
    notify(s.id, { tipe: 'pengingat', judul: 'Saatnya mengisi asesmen IKDKM-M', isi: e.pesan || `Konselor menganjurkan pengisian asesmen setiap ${e.interval_hari} hari.`, tautan: '#/s/asesmen' });
  }
}

const dimLabel = (kode) => DIMENSIONS.find((d) => d.kode === kode)?.label || kode;

module.exports = {
  setIo, emit, notify, markOnline, isOnline, storeAssessment, contentRecommendations, serviceRecommendations, recommendationsFor, decodeAnswers,
  handleRisk, counselorScope, canAccessStudent, scopedStudentIds, assessmentDetail, latestAssessment, effectiveSchedule, displayName,
  runScheduler, counselorsOnDuty, allCounselors, activePeer, dimLabel, QUADRANTS, coordinators, coordinatorUsers, dualCoordinator, admins, caseCode, facultyOf, universityOf, visibleContent,
};
