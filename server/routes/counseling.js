// Konseling profesional: jadwal ketersediaan & kuota, informed consent konselor, formulir pendaftaran (PDF),
// Meja Konseling 3 tahap dengan catatan profesional (rahasia) terpisah dari ringkasan untuk konseli, riwayat layanan.
const express = require('express');
const crypto = require('node:crypto');
const { all, get, run, insert, update, tx, nowIso, audit } = require('../db');
const { enc, dec, sha256 } = require('../security');
const { fail, requireRole, str } = require('../http');
const { notify, emit, isOnline, latestAssessment, canAccessStudent, displayName, dimLabel } = require('../services');
const { COUNSELING_TOPICS, DIMENSIONS } = require('../reference');
const pdf = require('../pdf');
const campus = require('../campus');

const r = express.Router();
const konselor = requireRole('konselor');
const FOLLOW_UPS = ['Jadwalkan Sesi Lanjutan', 'Observasi Mandiri', 'Rujuk ke Psikiater-RSUD', 'Terminasi'];
const MONITORING = { 'Cek jurnal H+3': 3, 'Follow-up chat H+7': 7, 'Ajak isi ulang asesmen H+14': 14, 'Cek kehadiran grup dukungan H+10': 10 };
const PROGRESS = ['Membaik', 'Stabil', 'Menurun', 'Belum terlihat'];
const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const SERVICES = ['Konseling Individu', 'Konseling Kelompok', 'Konseling Krisis', 'Konsultasi Akademik'];
const fmtWIB = (d) => new Date(d).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

// ---------- Informed consent konselor ----------
const DEFAULT_CONSENT = {
  ketentuan_layanan: 'Konseling adalah layanan profesional untuk membantu Anda memahami dan mengatasi masalah pribadi, sosial, akademik, atau karier. Satu sesi berlangsung sekitar 45–60 menit. Konselor tidak memberikan diagnosis medis atau resep obat; bila diperlukan, Anda dapat dirujuk ke layanan lain.',
  kerahasiaan: 'Semua yang Anda sampaikan dijaga kerahasiaannya dan disimpan terenkripsi. Kerahasiaan dapat dibuka hanya bila (1) ada risiko serius terhadap keselamatan Anda atau orang lain, (2) diwajibkan oleh hukum, atau (3) atas persetujuan tertulis Anda. Catatan profesional konselor tidak dibagikan kepada pihak lain.',
  hak_kewajiban: 'Anda berhak dihormati, mendapat informasi tentang proses konseling, menolak atau menghentikan layanan, dan mengakses ringkasan sesi yang telah disetujui konselor. Anda diharapkan hadir tepat waktu, terbuka dan jujur, serta menjalankan kesepakatan tindak lanjut.',
  pembatalan: 'Pembatalan atau perubahan jadwal dilakukan paling lambat 12 jam sebelum sesi melalui menu Konseling atau pesan kepada konselor. Ketidakhadiran tanpa kabar dua kali berturut-turut dapat membuat jadwal berikutnya diprioritaskan untuk konseli lain.',
  tambahan: '',
};
const CONSENT_SECTIONS = [['ketentuan_layanan', 'Ketentuan layanan'], ['kerahasiaan', 'Kerahasiaan dan batasannya'], ['hak_kewajiban', 'Hak dan kewajiban konseli'], ['pembatalan', 'Prosedur pembatalan atau perubahan jadwal'], ['tambahan', 'Ketentuan tambahan dari konselor']];
function consentOf(counselorId) {
  const c = get('SELECT * FROM counselor_consents WHERE counselor_id = ?', counselorId);
  const v = c || { versi: 1, ...DEFAULT_CONSENT };
  return { versi: v.versi, bagian: CONSENT_SECTIONS.filter(([k]) => v[k]).map(([k, judul]) => ({ kunci: k, judul, isi: v[k] })), updated_at: c?.updated_at || null };
}
r.get('/counselors/:id/consent', (req, res) => res.json(consentOf(req.params.id)));
r.get('/counselor-consent/me', konselor, (req, res) => { const c = get('SELECT * FROM counselor_consents WHERE counselor_id = ?', req.user.id); res.json({ ...(c || { versi: 0, ...DEFAULT_CONSENT }), sections: CONSENT_SECTIONS }); });
r.put('/counselor-consent/me', konselor, (req, res) => {
  const b = req.body || {};
  const f = Object.fromEntries(CONSENT_SECTIONS.map(([k]) => [k, str(b[k], 4000)]));
  for (const [k, l] of CONSENT_SECTIONS.slice(0, 4)) if (f[k].length < 20) fail(400, `Bagian "${l}" wajib diisi (min. 20 karakter).`);
  const cur = get('SELECT * FROM counselor_consents WHERE counselor_id = ?', req.user.id);
  if (cur) update('counselor_consents', cur.id, { ...f, versi: cur.versi + 1 }); else insert('counselor_consents', { counselor_id: req.user.id, versi: 1, ...f });
  audit({ actor: req.user, aksi: 'ubah_informed_consent', entitas: 'counselor_consents', ip: req.ip });
  res.json(consentOf(req.user.id));
});

// ---------- Jadwal ketersediaan & kuota ----------
const slotView = (s) => ({ id: s.id, hari: s.hari, hari_nama: HARI[s.hari], jam_mulai: s.jam_mulai, jam_selesai: s.jam_selesai, jenis_layanan: s.jenis_layanan, mode: s.mode, kuota: s.kuota, lokasi: s.lokasi, aktif: !!s.aktif });
r.get('/counselor-slots/me', konselor, (req, res) => res.json({ slots: all('SELECT * FROM counselor_slots WHERE counselor_id = ? ORDER BY hari, jam_mulai', req.user.id).map(slotView), layanan: SERVICES }));
function slotFields(b) {
  const f = {};
  if ('hari' in b) { const h = Number(b.hari); if (!(h >= 1 && h <= 7)) fail(400, 'Pilih hari.'); f.hari = h; }
  for (const k of ['jam_mulai', 'jam_selesai']) if (k in b) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b[k])) fail(400, 'Format jam HH:MM.'); f[k] = b[k]; }
  if ('jenis_layanan' in b) { f.jenis_layanan = str(b.jenis_layanan, 60); if (!f.jenis_layanan) fail(400, 'Pilih jenis layanan.'); }
  if ('mode' in b) { if (!['online', 'offline', 'keduanya'].includes(b.mode)) fail(400, 'Mode tidak valid.'); f.mode = b.mode; }
  if ('kuota' in b) { const q = Number(b.kuota); if (!(q >= 1 && q <= 20)) fail(400, 'Kuota 1–20 konseli per sesi.'); f.kuota = q; }
  if ('lokasi' in b) f.lokasi = str(b.lokasi, 160);
  if ('aktif' in b) f.aktif = b.aktif ? 1 : 0;
  if (f.jam_mulai && f.jam_selesai && f.jam_selesai <= f.jam_mulai) fail(400, 'Jam selesai harus setelah jam mulai.');
  return f;
}
r.post('/counselor-slots', konselor, (req, res) => {
  const f = slotFields({ mode: 'keduanya', kuota: 1, ...req.body });
  if (!f.hari || !f.jam_mulai || !f.jam_selesai || !f.jenis_layanan) fail(400, 'Lengkapi hari, jam, dan jenis layanan.');
  res.status(201).json({ id: insert('counselor_slots', { counselor_id: req.user.id, ...f }) });
});
r.patch('/counselor-slots/:id', konselor, (req, res) => {
  const s = get('SELECT * FROM counselor_slots WHERE id = ? AND counselor_id = ?', req.params.id, req.user.id); if (!s) fail(404, 'Slot tidak ditemukan.');
  update('counselor_slots', s.id, slotFields(req.body || {})); res.json({ ok: true });
});
r.delete('/counselor-slots/:id', konselor, (req, res) => { run('UPDATE counselor_slots SET aktif = 0 WHERE id = ? AND counselor_id = ?', req.params.id, req.user.id); res.json({ ok: true }); });

// Koordinator Layanan BK mengatur jadwal konselor mana pun; konselor tetap bisa mengatur jadwalnya sendiri.
const koordinator = requireRole('koordinator');
function counselorFor(req) {
  const c = get("SELECT id, nama FROM users WHERE id = ? AND role = 'konselor' AND status IN ('aktif','nonaktif') AND university_id = ?", req.params.cid, req.user.university_id);
  if (!c) fail(404, 'Konselor tidak ditemukan di kampus Anda.');
  return c;
}
function informSchedule(req, c, aksi, detail) {
  audit({ actor: req.user, aksi, entitas: 'counselor_slots', entitas_id: c.id, alasan: detail, ip: req.ip });
  notify(c.id, { tipe: 'jadwal', judul: 'Jadwal layanan Anda diperbarui oleh Koordinator Layanan BK', isi: `${req.user.nama}: ${detail}`, tautan: '#/c/pengaturan' });
}
const slotText = (f) => [f.hari && HARI[f.hari], f.jam_mulai && f.jam_selesai && `${f.jam_mulai}–${f.jam_selesai}`, f.jenis_layanan].filter(Boolean).join(' ');
r.get('/coord/counselors/:cid/slots', koordinator, (req, res) => {
  const c = counselorFor(req);
  res.json({ konselor: c, slots: all('SELECT * FROM counselor_slots WHERE counselor_id = ? ORDER BY hari, jam_mulai', c.id).map(slotView), layanan: SERVICES });
});
r.post('/coord/counselors/:cid/slots', koordinator, (req, res) => {
  const c = counselorFor(req);
  const f = slotFields({ mode: 'keduanya', kuota: 1, ...req.body });
  if (!f.hari || !f.jam_mulai || !f.jam_selesai || !f.jenis_layanan) fail(400, 'Lengkapi hari, jam, dan jenis layanan.');
  const id = insert('counselor_slots', { counselor_id: c.id, ...f });
  informSchedule(req, c, 'koordinator_tambah_slot', `slot baru ${slotText(f)}`);
  res.status(201).json({ id });
});
r.patch('/coord/counselors/:cid/slots/:id', koordinator, (req, res) => {
  const c = counselorFor(req);
  const s = get('SELECT * FROM counselor_slots WHERE id = ? AND counselor_id = ?', req.params.id, c.id); if (!s) fail(404, 'Slot tidak ditemukan.');
  const f = slotFields(req.body || {});
  update('counselor_slots', s.id, f);
  informSchedule(req, c, 'koordinator_ubah_slot', `${'aktif' in f && Object.keys(f).length === 1 ? (f.aktif ? 'mengaktifkan' : 'menonaktifkan') : 'mengubah'} slot ${slotText({ ...s, ...f })}`);
  res.json({ ok: true });
});
r.delete('/coord/counselors/:cid/slots/:id', koordinator, (req, res) => {
  const c = counselorFor(req);
  const s = get('SELECT * FROM counselor_slots WHERE id = ? AND counselor_id = ?', req.params.id, c.id); if (!s) fail(404, 'Slot tidak ditemukan.');
  run('UPDATE counselor_slots SET aktif = 0 WHERE id = ?', s.id);
  informSchedule(req, c, 'koordinator_nonaktifkan_slot', `menonaktifkan slot ${slotText(s)}`);
  res.json({ ok: true });
});

// Kemunculan slot (WIB) untuk 4 minggu ke depan, dengan sisa kuota
function occurrences(counselorId, days = 28) {
  const slots = all('SELECT * FROM counselor_slots WHERE counselor_id = ? AND aktif = 1', counselorId);
  const out = [];
  const nowMs = Date.now();
  for (let i = 0; i < days; i++) {
    const wib = new Date(nowMs + 7 * 3600000 + i * 86400000);
    const ymd = wib.toISOString().slice(0, 10);
    const dow = wib.getUTCDay() || 7;
    for (const s of slots.filter((x) => x.hari === dow)) {
      const jadwal = new Date(`${ymd}T${s.jam_mulai}:00+07:00`).toISOString();
      if (new Date(jadwal).getTime() < nowMs + 2 * 3600000) continue; // minimal 2 jam sebelum sesi
      const terpakai = get("SELECT COUNT(*) AS n FROM appointments WHERE slot_id = ? AND jadwal = ? AND status IN ('pending','confirmed')", s.id, jadwal).n;
      out.push({ slot_id: s.id, tanggal: ymd, hari_nama: HARI[s.hari], jam_mulai: s.jam_mulai, jam_selesai: s.jam_selesai, jadwal, jenis_layanan: s.jenis_layanan, mode: s.mode, lokasi: s.lokasi, kuota: s.kuota, sisa: Math.max(0, s.kuota - terpakai) });
    }
  }
  return out.sort((a, b) => a.jadwal.localeCompare(b.jadwal));
}

function counselorView(c) {
  const slots = all('SELECT * FROM counselor_slots WHERE counselor_id = ? AND aktif = 1 ORDER BY hari, jam_mulai', c.user_id);
  return {
    user_id: c.user_id, nama: c.nama, gelar: c.gelar, spesialisasi: c.spesialisasi, status_jaga: !!c.status_jaga, online: isOnline(c.user_id),
    jadwal_ringkas: slots.map((s) => `${HARI[s.hari]} ${s.jam_mulai}–${s.jam_selesai} · ${s.jenis_layanan}`),
    jenis_layanan_aktif: [...new Set(slots.map((s) => s.jenis_layanan))], slot_tersedia: occurrences(c.user_id, 14).filter((o) => o.sisa > 0).length,
    consent_versi: consentOf(c.user_id).versi,
  };
}
// Konselor yang dapat dipilih mahasiswa untuk konseling: sekampus, dan konselor membuka layanan untuk seluruh mahasiswa
// kampus ATAU mahasiswa ini termasuk binaannya (memilih konselor tersebut).
const counselorPool = (user) => all(`SELECT c.*, u.nama FROM counselors c JOIN users u ON u.id = c.user_id WHERE u.status = 'aktif' AND u.university_id IS ?
  ${user.role === 'mahasiswa' ? 'AND (c.layanan_terbuka = 1 OR EXISTS (SELECT 1 FROM student_counselors sc WHERE sc.counselor_id = c.user_id AND sc.student_id = ?))' : ''} ORDER BY u.nama`, ...(user.role === 'mahasiswa' ? [user.university_id, user.id] : [user.university_id]));
const counselorAllowed = (user, cid) => counselorPool(user).some((c) => c.user_id === cid);
r.get('/counselors', (req, res) => {
  const mine = req.user.role === 'mahasiswa' ? new Set(all('SELECT counselor_id FROM student_counselors WHERE student_id = ?', req.user.id).map((x) => x.counselor_id)) : new Set();
  res.json(counselorPool(req.user).map((c) => ({ ...counselorView(c), binaan_saya: mine.has(c.user_id), layanan_terbuka: !!c.layanan_terbuka })).sort((a, b) => b.binaan_saya - a.binaan_saya));
});
r.get('/counselors/:id/availability', (req, res) => {
  if (!counselorAllowed(req.user, req.params.id)) fail(404, 'Konselor tidak tersedia untuk Anda.');
  res.json(occurrences(req.params.id));
});
r.get('/counselor-profile/me', konselor, (req, res) => {
  const c = get('SELECT c.*, u.nama FROM counselors c JOIN users u ON u.id = c.user_id WHERE c.user_id = ?', req.user.id);
  const uni = req.user.university_id;
  res.json({ ...counselorView(c), lingkup_fakultas: JSON.parse(c.lingkup_fakultas), lingkup_prodi: JSON.parse(c.lingkup_prodi || '[]'), layanan_terbuka: !!c.layanan_terbuka,
    konteks: campus.counselorContext(c), universitas: campus.universityName(uni), fakultas_kampus: campus.campusFaculties(uni), prodi_kampus: campus.campusProdi(uni),
    binaan: get('SELECT COUNT(*) AS n FROM student_counselors sc JOIN users u ON u.id = sc.student_id WHERE sc.counselor_id = ? AND u.status = \'aktif\'', req.user.id).n });
});
r.patch('/counselor-profile/me', konselor, (req, res) => {
  const c = get('SELECT * FROM counselors WHERE user_id = ?', req.user.id);
  const b = req.body || {}; const f = {};
  if ('status_jaga' in b) f.status_jaga = b.status_jaga ? 1 : 0;
  if ('spesialisasi' in b) f.spesialisasi = str(b.spesialisasi, 120);
  // Layanan konseling: terbuka untuk seluruh mahasiswa kampus, atau hanya mahasiswa binaan
  if ('layanan_terbuka' in b) f.layanan_terbuka = b.layanan_terbuka ? 1 : 0;
  // Konteks kerja: fakultas & prodi kampus yang menjadi tanggung jawab konselor
  if ('lingkup_fakultas' in b || 'lingkup_prodi' in b) {
    const prodi = campus.campusProdi(req.user.university_id);
    const fk = new Set(prodi.map((p) => p.fakultas_kode)); const pk = new Set(prodi.map((p) => p.id));
    if ('lingkup_fakultas' in b) f.lingkup_fakultas = JSON.stringify((Array.isArray(b.lingkup_fakultas) ? b.lingkup_fakultas : []).filter((x) => fk.has(x)));
    if ('lingkup_prodi' in b) f.lingkup_prodi = JSON.stringify((Array.isArray(b.lingkup_prodi) ? b.lingkup_prodi : []).filter((x) => pk.has(x)));
    audit({ actor: req.user, aksi: 'ubah_konteks_kerja', entitas: 'counselors', entitas_id: c.id, alasan: campus.counselorContext({ ...c, ...f }).ringkas, ip: req.ip });
  }
  update('counselors', c.id, f);
  res.json({ ok: true });
});

// ---------- Janji temu ----------
function apptView(a, viewer) {
  const s = get('SELECT * FROM users WHERE id = ?', a.student_id);
  const c = get('SELECT nama FROM users WHERE id = ?', a.counselor_id);
  const fb = get('SELECT rating, refleksi_mahasiswa FROM counseling_feedback WHERE appointment_id = ?', a.id);
  const sum = get('SELECT status FROM counseling_summaries WHERE appointment_id = ?', a.id);
  return {
    id: a.id, nomor: a.nomor, jadwal: a.jadwal, topik: a.topik, topik_lainnya: a.topik_lainnya, jenis: a.jenis, jenis_layanan: a.jenis_layanan, status: a.status, tautan_rapat: a.tautan_rapat, lokasi: a.lokasi,
    tindak_lanjut: a.tindak_lanjut, keluhan: dec(a.keluhan), created_at: a.created_at, counselor: { id: a.counselor_id, nama: c?.nama },
    student: { id: s.id, nama: displayName(s, viewer), prodi: get('SELECT nama_prodi FROM prodi WHERE id = ?', s.prodi_id)?.nama_prodi, angkatan: s.angkatan },
    feedback: fb ? { rating: fb.rating, refleksi_mahasiswa: dec(fb.refleksi_mahasiswa) } : null,
    ringkasan_tersedia: sum?.status === 'disetujui',
  };
}

r.post('/appointments', requireRole('mahasiswa'), (req, res) => {
  const b = req.body || {};
  const c = get("SELECT c.*, u.nama FROM counselors c JOIN users u ON u.id = c.user_id WHERE c.user_id = ? AND u.status = 'aktif'", b.counselor_id);
  if (!c || !counselorAllowed(req.user, c.user_id)) fail(400, 'Pilih konselor yang tersedia untuk Anda.');
  const occ = occurrences(c.user_id).find((o) => o.slot_id === b.slot_id && o.jadwal === b.jadwal);
  if (!occ) fail(400, 'Jadwal yang dipilih tidak tersedia. Pilih jadwal lain.');
  if (occ.sisa <= 0) fail(409, 'Kuota jadwal ini sudah penuh. Pilih jadwal lain.');
  const mode = occ.mode === 'keduanya' ? b.mode : occ.mode;
  if (!['online', 'offline'].includes(mode)) fail(400, 'Pilih mode sesi (daring/luring).');
  const topikOk = COUNSELING_TOPICS.map(([t]) => t);
  if (!topikOk.includes(b.topik)) fail(400, 'Pilih topik masalah.');
  const topikLain = b.topik === 'Lainnya' ? str(b.topik_lainnya, 160) : null;
  if (b.topik === 'Lainnya' && !topikLain) fail(400, 'Tuliskan topik masalah lainnya.');
  const consent = consentOf(c.user_id);
  if (!b.consent_dibaca || !b.consent_setuju) fail(400, 'Baca seluruh informed consent dan berikan persetujuan untuk mengirim pendaftaran.', 'CONSENT_REQUIRED');
  if (Number(b.consent_versi) !== consent.versi) fail(409, 'Informed consent konselor baru saja diperbarui. Baca ulang lalu setujui versi terbaru.', 'CONSENT_CHANGED');
  const s = get('SELECT u.*, p.nama_prodi FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.id = ?', req.user.id);
  const now = nowIso();
  const nomor = `PJ-${now.slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  const consentText = consent.bagian.map((x) => `${x.judul}\n${x.isi}`).join('\n\n');
  const form = {
    nomor, nama: s.nama, nim: s.nim_nip, prodi: s.nama_prodi, email: s.email, telepon: dec(s.telepon), konselor: c.nama, jadwal: occ.jadwal, jenis_layanan: occ.jenis_layanan, mode,
    lokasi: mode === 'offline' ? occ.lokasi : null, topik: topikLain ? `Lainnya: ${topikLain}` : b.topik, keluhan: str(b.keluhan, 3000), consent_versi: consent.versi,
    consent: consent.bagian.map((x) => [x.judul, x.isi]), disetujui_pada: now, diajukan_pada: now,
  };
  const dim = COUNSELING_TOPICS.find(([t]) => t === b.topik)?.[1] || null;
  const id = tx(() => {
    const aid = insert('appointments', { student_id: s.id, counselor_id: c.user_id, jadwal: occ.jadwal, slot_id: occ.slot_id, topik: b.topik, topik_lainnya: topikLain, domain_id: dim,
      jenis: mode, jenis_layanan: occ.jenis_layanan, lokasi: form.lokasi, keluhan: enc(form.keluhan), consent_versi: consent.versi, consent_teks: enc(consentText), formulir_json: enc(JSON.stringify(form)), nomor });
    insert('consents', { user_id: s.id, jenis_consent: 'konseling', disetujui_pada: now, versi_kebijakan: `konselor-v${consent.versi}`, alamat_ip: req.ip, appointment_id: aid, teks_hash: sha256(consentText) });
    return aid;
  });
  notify(c.user_id, { tipe: 'reservasi', judul: 'Pendaftaran konseling baru', isi: `${displayName(req.user, { role: 'konselor' })} — ${form.topik}, ${fmtWIB(occ.jadwal)} WIB`, tautan: '#/c/meja' });
  res.status(201).json({ id, nomor });
});

r.get('/appointments/me', requireRole('mahasiswa'), (req, res) => res.json(all('SELECT * FROM appointments WHERE student_id = ? ORDER BY jadwal DESC', req.user.id).map((a) => apptView(a, req.user))));
r.get('/appointments', konselor, (req, res) => res.json(all('SELECT * FROM appointments WHERE counselor_id = ? ORDER BY jadwal', req.user.id).map((a) => apptView(a, req.user))));

function ownAppt(req, roles = ['konselor']) {
  const a = get('SELECT * FROM appointments WHERE id = ?', req.params.id);
  if (!a) fail(404, 'Janji temu tidak ditemukan.');
  if (req.user.role === 'konselor' && roles.includes('konselor') && a.counselor_id === req.user.id) return a;
  if (req.user.role === 'mahasiswa' && roles.includes('mahasiswa') && a.student_id === req.user.id) return a;
  fail(403, 'Anda tidak berwenang atas janji temu ini.');
}
const formOf = (a) => ({ ...JSON.parse(dec(a.formulir_json)), status: { pending: 'Menunggu konfirmasi', confirmed: 'Terkonfirmasi', selesai: 'Selesai', batal: 'Dibatalkan' }[a.status] });

// Formulir pendaftaran (hasil isian) + PDF
r.get('/appointments/:id/form', (req, res) => { const a = ownAppt(req, ['konselor', 'mahasiswa']); if (!a.formulir_json) fail(404, 'Formulir tidak tersedia.'); res.json(formOf(a)); });
r.get('/appointments/:id/form/pdf', (req, res) => {
  const a = ownAppt(req, ['konselor', 'mahasiswa']); if (!a.formulir_json) fail(404, 'Formulir tidak tersedia.');
  pdf.registrationForm(res, { form: formOf(a) });
});

// Detail riwayat untuk konseli: formulir, jadwal, ringkasan yang disetujui konselor, tindak lanjut, penilaian
r.get('/appointments/:id/detail', requireRole('mahasiswa'), (req, res) => {
  const a = ownAppt(req, ['mahasiswa']);
  const sum = get("SELECT * FROM counseling_summaries WHERE appointment_id = ? AND status = 'disetujui'", a.id);
  res.json({ appointment: apptView(a, req.user), form: a.formulir_json ? formOf(a) : null,
    ringkasan: sum ? { ringkasan: dec(sum.ringkasan), tindak_lanjut_konseli: dec(sum.tindak_lanjut_konseli), disetujui_pada: sum.disetujui_pada } : null });
});

r.patch('/appointments/:id', (req, res) => {
  const a = ownAppt(req, ['konselor', 'mahasiswa']);
  const b = req.body || {}; const f = {};
  if (req.user.role === 'mahasiswa') {
    if (b.status !== 'batal' || !['pending', 'confirmed'].includes(a.status)) fail(400, 'Mahasiswa hanya dapat membatalkan janji yang belum berlangsung.');
    update('appointments', a.id, { status: 'batal' });
    notify(a.counselor_id, { tipe: 'reservasi', judul: 'Pendaftaran konseling dibatalkan konseli', isi: `${a.nomor || ''} · ${fmtWIB(a.jadwal)} WIB`, tautan: '#/c/meja' });
    return res.json({ ok: true });
  }
  if (b.status) { if (!['pending', 'confirmed', 'batal'].includes(b.status)) fail(400, 'Status tidak valid.'); f.status = b.status; }
  if (b.jadwal) { const d = new Date(b.jadwal); if (isNaN(d)) fail(400, 'Jadwal tidak valid.'); f.jadwal = d.toISOString(); }
  if ('tautan_rapat' in b) { const u = str(b.tautan_rapat, 300); if (u && !/^https:\/\//.test(u)) fail(400, 'Tautan rapat harus diawali https://'); f.tautan_rapat = u || null; }
  if ('lokasi' in b) f.lokasi = str(b.lokasi, 200);
  update('appointments', a.id, f);
  const when = fmtWIB(f.jadwal || a.jadwal);
  if (f.status === 'confirmed') notify(a.student_id, { tipe: 'reservasi', judul: 'Pendaftaran konseling dikonfirmasi', isi: `Jadwal: ${when} WIB${f.tautan_rapat || a.tautan_rapat ? ' · tautan rapat tersedia di Riwayat Konseling' : ''}`, tautan: `#/s/konseling/riwayat/${a.id}` });
  else if (f.jadwal) notify(a.student_id, { tipe: 'reservasi', judul: 'Jadwal konseling diubah', isi: `Jadwal baru: ${when} WIB`, tautan: `#/s/konseling/riwayat/${a.id}` });
  else if (f.status === 'batal') notify(a.student_id, { tipe: 'reservasi', judul: 'Pendaftaran konseling dibatalkan konselor', isi: 'Silakan daftar ulang pada jadwal lain atau kirim pesan ke konselor.', tautan: '#/s/konseling' });
  res.json({ ok: true });
});

// ---------- Meja Konseling ----------
r.get('/appointments/:id/desk', konselor, (req, res) => {
  const a = ownAppt(req);
  const s = get('SELECT * FROM users WHERE id = ?', a.student_id);
  audit({ actor: req.user, aksi: 'buka_meja_konseling', entitas: 'appointments', entitas_id: a.id, student_id: s.id, ip: req.ip });
  const sess = get('SELECT * FROM counseling_sessions WHERE appointment_id = ?', a.id);
  const ev = sess ? get('SELECT * FROM counseling_evaluations WHERE session_id = ?', sess.id) : null;
  const sum = get('SELECT * FROM counseling_summaries WHERE appointment_id = ?', a.id);
  const consent = get("SELECT id, disetujui_pada, versi_kebijakan FROM consents WHERE user_id = ? AND jenis_consent = 'konseling' AND appointment_id = ? ORDER BY disetujui_pada DESC LIMIT 1", s.id, a.id);
  const D = (x) => (x ? dec(x) : '');
  res.json({
    appointment: apptView(a, req.user),
    form: a.formulir_json ? formOf(a) : null,
    student: { id: s.id, nama: displayName(s, req.user), nim: s.nim_nip, angkatan: s.angkatan, kelas: s.kelas, prodi: get('SELECT nama_prodi FROM prodi WHERE id = ?', s.prodi_id)?.nama_prodi },
    asesmen_terakhir: latestAssessment(s.id, { konselor: true }),
    riwayat_asesmen: all('SELECT diisi_pada, skor_total, kategori_total, risk_alert FROM assessments WHERE user_id = ? ORDER BY diisi_pada', s.id),
    sesi_sebelumnya: all("SELECT a.jadwal, a.topik, a.tindak_lanjut FROM appointments a WHERE a.student_id = ? AND a.status = 'selesai' AND a.id != ? ORDER BY a.jadwal DESC", s.id, a.id),
    consent,
    session: sess ? { diagnosis_domain_id: sess.diagnosis_domain_id, tingkat_keparahan: sess.tingkat_keparahan, catatan_rapport: D(sess.catatan_rapport), catatan_eksplorasi: D(sess.catatan_eksplorasi), tujuan_smart: D(sess.tujuan_smart), catatan_teknik: D(sess.catatan_teknik), catatan_penutup: D(sess.catatan_penutup) } : null,
    evaluation: ev ? { refleksi_konselor: D(ev.refleksi_konselor), rencana_monitoring: JSON.parse(ev.rencana_monitoring), rekomendasi_lanjutan: ev.rekomendasi_lanjutan, perkembangan: ev.perkembangan } : null,
    summary: sum ? { ringkasan: D(sum.ringkasan), tindak_lanjut_konseli: D(sum.tindak_lanjut_konseli), status: sum.status, disetujui_pada: sum.disetujui_pada } : null,
    pilihan: { tindak_lanjut: FOLLOW_UPS, monitoring: Object.keys(MONITORING), perkembangan: PROGRESS, topik: COUNSELING_TOPICS.map(([t]) => t), dimensi: DIMENSIONS.map((d) => ({ kode: d.kode, label: d.label })) },
  });
});

r.put('/appointments/:id/session', konselor, (req, res) => {
  const a = ownAppt(req);
  if (a.status === 'selesai') fail(400, 'Sesi sudah ditutup.');
  if (a.status !== 'confirmed') fail(400, 'Konfirmasi janji temu sebelum memulai sesi.');
  const b = req.body || {};
  if (b.diagnosis_domain_id && !COUNSELING_TOPICS.some(([t]) => t === b.diagnosis_domain_id)) fail(400, 'Kategori masalah tidak valid.');
  if (b.tingkat_keparahan && !['Ringan', 'Sedang', 'Berat'].includes(b.tingkat_keparahan)) fail(400, 'Tingkat keparahan tidak valid.');
  const f = { diagnosis_domain_id: b.diagnosis_domain_id || null, tingkat_keparahan: b.tingkat_keparahan || null };
  for (const k of ['catatan_rapport', 'catatan_eksplorasi', 'tujuan_smart', 'catatan_teknik', 'catatan_penutup']) f[k] = enc(str(b[k], 20000));
  const existing = get('SELECT id FROM counseling_sessions WHERE appointment_id = ?', a.id);
  if (existing) update('counseling_sessions', existing.id, f); else insert('counseling_sessions', { appointment_id: a.id, ...f });
  res.json({ ok: true });
});

// Ringkasan untuk konseli — terpisah dari catatan profesional; tampil ke konseli hanya setelah disetujui konselor
r.put('/appointments/:id/summary', konselor, (req, res) => {
  const a = ownAppt(req);
  const ringkasan = str(req.body?.ringkasan, 6000); if (ringkasan.length < 10) fail(400, 'Tulis ringkasan konseling untuk konseli (min. 10 karakter).');
  const f = { ringkasan: enc(ringkasan), tindak_lanjut_konseli: enc(str(req.body?.tindak_lanjut_konseli, 3000)), status: req.body?.setujui ? 'disetujui' : 'draf', disetujui_pada: req.body?.setujui ? nowIso() : null };
  const ex = get('SELECT * FROM counseling_summaries WHERE appointment_id = ?', a.id);
  if (ex) update('counseling_summaries', ex.id, f); else insert('counseling_summaries', { appointment_id: a.id, ...f });
  if (f.status === 'disetujui' && ex?.status !== 'disetujui') notify(a.student_id, { tipe: 'konseling', judul: 'Ringkasan sesi konseling tersedia', isi: 'Buka Riwayat Konseling untuk membaca ringkasan dan tindak lanjut dari konselor.', tautan: `#/s/konseling/riwayat/${a.id}` });
  audit({ actor: req.user, aksi: f.status === 'disetujui' ? 'setujui_ringkasan_konseli' : 'simpan_draf_ringkasan', entitas: 'appointments', entitas_id: a.id, student_id: a.student_id, ip: req.ip });
  res.json({ ok: true, status: f.status });
});

r.put('/appointments/:id/evaluation', konselor, (req, res) => {
  const a = ownAppt(req);
  if (a.status === 'selesai') fail(400, 'Sesi sudah ditutup.');
  const sess = get('SELECT id FROM counseling_sessions WHERE appointment_id = ?', a.id);
  if (!sess) fail(400, 'Simpan catatan Tahap Pelaksanaan terlebih dahulu.');
  const b = req.body || {};
  if (!FOLLOW_UPS.includes(b.rekomendasi_lanjutan)) fail(400, 'Pilih rekomendasi tindak lanjut.');
  if (b.perkembangan && !PROGRESS.includes(b.perkembangan)) fail(400, 'Pilihan perkembangan tidak valid.');
  const monitoring = (Array.isArray(b.rencana_monitoring) ? b.rencana_monitoring : []).filter((m) => m in MONITORING);
  tx(() => {
    insert('counseling_evaluations', { session_id: sess.id, refleksi_konselor: enc(str(b.refleksi_konselor, 20000)), rencana_monitoring: JSON.stringify(monitoring), rekomendasi_lanjutan: b.rekomendasi_lanjutan, perkembangan: b.perkembangan || null });
    update('appointments', a.id, { status: 'selesai', tindak_lanjut: b.rekomendasi_lanjutan });
    for (const m of monitoring) insert('scheduled_tasks', { owner_id: req.user.id, student_id: a.student_id, judul: m, jatuh_tempo: new Date(Date.now() + MONITORING[m] * 86400000).toISOString() });
    if (b.rekomendasi_lanjutan === 'Rujuk ke Psikiater-RSUD') insert('interventions', { student_id: a.student_id, deskripsi: `Rujukan ke Psikiater/RSUD — ${str(b.catatan_rujukan, 500) || 'lengkapi surat rujukan dan konfirmasi kedatangan.'}`, dibuat_oleh: req.user.id, prioritas: 'tinggi' });
    if (b.rekomendasi_lanjutan === 'Jadwalkan Sesi Lanjutan') insert('scheduled_tasks', { owner_id: req.user.id, student_id: a.student_id, judul: 'Jadwalkan sesi lanjutan dengan mahasiswa', jatuh_tempo: new Date(Date.now() + 86400000).toISOString() });
  });
  audit({ actor: req.user, aksi: 'tutup_sesi', entitas: 'appointments', entitas_id: a.id, student_id: a.student_id, ip: req.ip });
  notify(a.student_id, { tipe: 'konseling', judul: 'Sesi konseling selesai', isi: 'Bagikan refleksi dan penilaianmu tentang sesi ini.', tautan: `#/s/konseling/riwayat/${a.id}` });
  res.json({ ok: true });
});

r.post('/appointments/:id/feedback', requireRole('mahasiswa'), (req, res) => {
  const a = ownAppt(req, ['mahasiswa']);
  if (a.status !== 'selesai') fail(400, 'Penilaian dapat diberikan setelah sesi selesai.');
  const rating = Number(req.body?.rating);
  if (!(rating >= 1 && rating <= 5)) fail(400, 'Pilih rating 1–5.');
  if (get('SELECT 1 AS x FROM counseling_feedback WHERE appointment_id = ?', a.id)) fail(400, 'Penilaian untuk sesi ini sudah dikirim.');
  insert('counseling_feedback', { appointment_id: a.id, rating, refleksi_mahasiswa: enc(str(req.body.refleksi_mahasiswa, 5000)) });
  res.status(201).json({ ok: true });
});

// ---------- Pemantauan riwayat layanan konseling ----------
r.get('/counseling/history', konselor, (req, res) => {
  const studentIds = all('SELECT DISTINCT student_id FROM appointments WHERE counselor_id = ?', req.user.id).map((x) => x.student_id);
  res.json(studentIds.map((sid) => {
    const s = get('SELECT u.*, p.nama_prodi FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.id = ?', sid);
    const appts = all('SELECT * FROM appointments WHERE student_id = ? AND counselor_id = ? ORDER BY jadwal', sid, req.user.id);
    const done = appts.filter((a) => a.status === 'selesai');
    const evals = done.map((a) => { const se = get('SELECT * FROM counseling_sessions WHERE appointment_id = ?', a.id); const ev = se && get('SELECT * FROM counseling_evaluations WHERE session_id = ?', se.id); return { jadwal: a.jadwal, topik: a.topik_lainnya ? `Lainnya: ${a.topik_lainnya}` : a.topik, keparahan: se?.tingkat_keparahan, perkembangan: ev?.perkembangan, tindak_lanjut: a.tindak_lanjut, ringkasan: get('SELECT status FROM counseling_summaries WHERE appointment_id = ?', a.id)?.status || null }; });
    const asm = all('SELECT diisi_pada, skor_total, kategori_total FROM assessments WHERE user_id = ? ORDER BY diisi_pada', sid);
    return {
      student: { id: s.id, nama: displayName(s, req.user), nim: s.nim_nip, prodi: s.nama_prodi },
      jumlah_pertemuan: done.length, terjadwal: appts.filter((a) => ['pending', 'confirmed'].includes(a.status)).length, dibatalkan: appts.filter((a) => a.status === 'batal').length,
      terakhir: done.at(-1)?.jadwal || null, perkembangan_terakhir: evals.filter((e) => e.perkembangan).at(-1)?.perkembangan || null, sesi: evals,
      asesmen: asm.length ? { awal: asm[0], akhir: asm.at(-1), jumlah: asm.length } : null,
      tugas_monitoring: all('SELECT judul, jatuh_tempo, selesai FROM scheduled_tasks WHERE owner_id = ? AND student_id = ? ORDER BY jatuh_tempo DESC', req.user.id, sid),
      intervensi_aktif: all("SELECT deskripsi, prioritas FROM interventions WHERE student_id = ? AND status = 'aktif'", sid),
    };
  }).sort((a, b) => (b.terakhir || '').localeCompare(a.terakhir || '')));
});

// ---- Pesan ----
function canMessage(user, otherId) {
  const o = get("SELECT id, role, university_id FROM users WHERE id = ? AND status = 'aktif'", otherId);
  if (!o) return false;
  if (user.role === 'mahasiswa') return o.role === 'konselor' && o.university_id === user.university_id;
  if (user.role === 'konselor') return (o.role === 'konselor' && o.university_id === user.university_id) || (o.role === 'mahasiswa' && canAccessStudent(user, o.id).ok);
  return false;
}
r.get('/messages/threads', requireRole('mahasiswa', 'konselor'), (req, res) => {
  const rows = all('SELECT * FROM messages WHERE sender_id = ? OR receiver_id = ? ORDER BY dikirim_pada DESC', req.user.id, req.user.id);
  const threads = new Map();
  for (const m of rows) {
    const other = m.sender_id === req.user.id ? m.receiver_id : m.sender_id;
    const t = threads.get(other) || { user_id: other, terakhir: m.dikirim_pada, cuplikan: dec(m.isi_teks).slice(0, 80), belum_dibaca: 0 };
    if (m.receiver_id === req.user.id && !m.dibaca) t.belum_dibaca++;
    threads.set(other, t);
  }
  res.json([...threads.values()].map((t) => { const u = get('SELECT * FROM users WHERE id = ?', t.user_id); return { ...t, nama: u.role === 'mahasiswa' ? displayName(u, req.user) : u.nama, role: u.role, online: isOnline(u.id) }; }));
});
r.get('/messages/with/:userId', requireRole('mahasiswa', 'konselor'), (req, res) => {
  if (!canMessage(req.user, req.params.userId)) fail(403, 'Anda tidak dapat membuka percakapan ini.');
  run('UPDATE messages SET dibaca = 1 WHERE sender_id = ? AND receiver_id = ?', req.params.userId, req.user.id);
  res.json(all('SELECT id, sender_id, receiver_id, isi_teks, dikirim_pada, dibaca FROM messages WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?) ORDER BY dikirim_pada', req.user.id, req.params.userId, req.params.userId, req.user.id).map((m) => ({ ...m, isi_teks: dec(m.isi_teks), saya: m.sender_id === req.user.id })));
});
r.post('/messages', requireRole('mahasiswa', 'konselor'), (req, res) => {
  const to = str(req.body?.receiver_id, 60); const isi = str(req.body?.isi_teks, 4000);
  if (!isi) fail(400, 'Pesan kosong.');
  if (!canMessage(req.user, to)) fail(403, 'Anda tidak dapat mengirim pesan ke pengguna ini.');
  const m = { sender_id: req.user.id, receiver_id: to, isi_teks: enc(isi), dikirim_pada: nowIso() };
  m.id = insert('messages', m);
  emit(to, 'message', { id: m.id, sender_id: req.user.id, isi_teks: isi, dikirim_pada: m.dikirim_pada });
  res.status(201).json({ id: m.id, dikirim_pada: m.dikirim_pada });
});

// ---- Notifikasi ----
r.get('/notifications', (req, res) => res.json(all('SELECT * FROM notifications WHERE user_id = ? ORDER BY dibuat_pada DESC LIMIT 60', req.user.id).map((n) => ({ ...n, dibaca: !!n.dibaca }))));
r.post('/notifications/read-all', (req, res) => { run('UPDATE notifications SET dibaca = 1 WHERE user_id = ?', req.user.id); res.json({ ok: true }); });
r.post('/notifications/:id/read', (req, res) => { run('UPDATE notifications SET dibaca = 1 WHERE id = ? AND user_id = ?', req.params.id, req.user.id); res.json({ ok: true }); });

module.exports = { router: r, consentOf, DEFAULT_CONSENT, occurrences, dimLabel };
