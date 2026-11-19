// Seed data referensi (Lampiran A–D) + akun & data contoh untuk mode demo.
const { DIMENSIONS, ITEMS, PRODI, KEYWORDS } = require('./reference');
const { db, all, get, run, insert, tx, setConfig, auditDb } = require('./db');
const { hashPassword, enc } = require('./security');
const { storeAssessment } = require('./services');
const { normalize } = require('./scoring');
const { DEFAULT_HOME } = require('./home');
const { DEFAULT_CONSENT } = require('./routes/counseling');
const { UNP } = require('./campus');

const DEMO_PASSWORD = 'mindcampus123';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const daysAgo = (d, h = 10) => { const t = new Date(); t.setDate(t.getDate() - d); t.setHours(h, 0, 0, 0); return t.toISOString(); };
const daysAhead = (d, h = 10) => daysAgo(-d, h);

function seedReference() {
  for (const d of DIMENSIONS) insert('domains', { id: d.kode, kode: d.kode, nama: d.nama, label: d.label });
  insert('domains', { id: 'UMUM', kode: 'UMUM', nama: 'Umum', label: 'Layanan & Bantuan' });
  let n = 1;
  for (const [fk, fakultas, list] of PRODI) {
    for (const [nama, jenjang] of list) insert('prodi', { id: `P${String(n++).padStart(2, '0')}`, nama_prodi: nama, fakultas, fakultas_kode: fk, jenjang, university_id: UNP });
  }
  setConfig('campus_migrated', { pada: new Date().toISOString(), kampus: UNP, sumber: 'seed' });

  setConfig('sla_menit', 30);
  setConfig('home', DEFAULT_HOME);
  setConfig('domain_email', { mahasiswa: [], konselor: [] });
  setConfig('ai_enabled', true);
  setConfig('versi_kebijakan', 'v1.0-2026-10');
  setConfig('retensi', 'Data dianonimkan 2 tahun setelah mahasiswa lulus (draf — tetapkan oleh Penanggung Jawab Pelindungan Data).');
  setConfig('journal_prompts', [
    'Apa satu hal kecil yang membuatmu bersyukur hari ini?',
    'Momen apa yang paling menguras energimu hari ini, dan apa yang kamu butuhkan saat itu?',
    'Jika sahabatmu mengalami harimu, apa yang akan kamu katakan padanya?',
    'Apa yang berhasil kamu lakukan hari ini, sekecil apa pun?',
    'Pikiran apa yang paling sering muncul hari ini? Seberapa benar pikiran itu?',
    'Siapa orang yang membuatmu merasa didukung minggu ini?',
    'Apa satu hal yang ingin kamu lakukan berbeda besok?',
  ]);
  setConfig('quotes', [
    ['Kamu tidak harus melihat seluruh tangga. Cukup ambil langkah pertama.', 'Martin Luther King Jr.'],
    ['Merawat diri bukanlah egois. Kamu tidak bisa menuang dari cangkir yang kosong.', 'Eleanor Brown'],
    ['Tidak apa-apa untuk tidak baik-baik saja, asal kamu tidak menyerah.', 'Pesan untuk mahasiswa'],
    ['Perasaan datang dan pergi seperti awan di langit. Napas sadar adalah jangkarku.', 'Thich Nhat Hanh'],
    ['Kemajuan tetaplah kemajuan, sekecil apa pun.', 'Pesan untuk mahasiswa'],
  ]);
}

// Jawaban IKDKM-M contoh: strength (0–1) = kecenderungan kekuatan mental, need (0–1) = kesiapan dukungan Bagian 3
function makeAnswers(rand, strength, need, extra = {}) {
  const codeOf = (score, arah) => { const sc = Math.max(1, Math.min(4, Math.round(score))); return (arah === '+' ? ['STS', 'TS', 'S', 'SS'] : ['SS', 'S', 'TS', 'STS'])[sc - 1]; };
  const A = {};
  for (const it of ITEMS) {
    if (it.bagian === 3) { A[it.no] = codeOf(1 + 3 * need + (rand() - 0.5) * 1.4, '+'); continue; }
    const bias = (extra.lemah || []).includes(it.dimensi) ? -0.9 : 0;
    A[it.no] = codeOf(1 + 3 * strength + bias + (rand() - 0.5) * 1.4, it.arah);
  }
  if (extra.krisis) { A[28] = 'SS'; A[32] = 'SS'; }
  return normalize({ A, persetujuan: { a: true, b: !extra.tanpaAI, c: true } });
}

function seedDemo() {
  require('./campus').ensureUniversities(); // daftar PT diperlukan untuk responden demo lintas provinsi
  const pw = hashPassword(DEMO_PASSWORD);
  const prodiId = (nama) => get('SELECT id FROM prodi WHERE nama_prodi = ? AND university_id = ?', nama, UNP).id;
  const admin = insert('users', { role: 'admin', nim_nip: 'admin', nama: 'Admin PAN-JALU', email: 'admin@panjalu.local', password_hash: pw });
  const koord = insert('users', { role: 'koordinator', nim_nip: 'KBK01', nama: 'Dra. Sri Lestari, M.Pd.', email: 'kbk01@panjalu.local', password_hash: pw, university_id: UNP, disetujui_oleh: admin, disetujui_pada: new Date().toISOString() });
  insert('coordinators', { user_id: koord, jabatan: 'Koordinator Layanan BK Universitas', unit: 'Unit Layanan Bimbingan & Konseling' });

  // ---- Konselor: profil, jadwal ketersediaan & kuota, informed consent ----
  const counselorDefs = [
    ['K001', 'Guruh, M.Pd.', 'Konseling Akademik & Karier', ['FTIK', 'FEB'], 1, [[1, '09:00', '10:00', 'Konseling Individu', 'keduanya', 2], [3, '09:00', '10:00', 'Konseling Individu', 'keduanya', 2], [4, '13:00', '14:30', 'Konseling Kelompok', 'offline', 6]]],
    ['K002', 'Dr. Ratna Wulandari, M.Psi., Psikolog', 'Psikologi Klinis — Kecemasan & Krisis', ['FKIP', 'FIKS'], 1, [[2, '10:00', '11:00', 'Konseling Individu', 'keduanya', 2], [5, '08:00', '09:00', 'Konseling Krisis', 'keduanya', 1]]],
    ['K003', 'Andi Prasetyo, M.Psi.', 'Relasi, Keluarga & Konseling Kelompok', ['PASCA'], 0, [[3, '13:00', '14:00', 'Konseling Individu', 'online', 2]]],
  ];
  const C = {};
  for (const [nip, nama, spes, scope, jaga, slots] of counselorDefs) {
    const uid = insert('users', { role: 'konselor', nim_nip: nip, nama, email: `${nip.toLowerCase()}@panjalu.local`, password_hash: pw, university_id: UNP, telepon: enc('0812-0000-' + nip.slice(1)) });
    insert('counselors', { user_id: uid, spesialisasi: spes, lingkup_fakultas: JSON.stringify(scope), status_jaga: jaga, layanan_terbuka: nip === 'K003' ? 0 : 1 });
    for (const [hari, jm, js, jenis, mode, kuota] of slots) insert('counselor_slots', { counselor_id: uid, hari, jam_mulai: jm, jam_selesai: js, jenis_layanan: jenis, mode, kuota, lokasi: 'Ruang Konseling Gedung A, Lt. 2' });
    C[nip] = uid;
  }
  insert('counselor_consents', { counselor_id: C.K001, versi: 2, ...DEFAULT_CONSENT, tambahan: 'Sesi daring dilakukan melalui Google Meet dari tempat yang tenang dan privat. Rekaman sesi tidak diperkenankan tanpa persetujuan kedua pihak.' });

  // ---- Konten psikoedukasi (thumbnail, deskripsi, kata kunci butir, kategori) ----
  const contents = [
    ['Tidur Cukup, Mental Kuat: Mengatur Energi di Jadwal Padat', 'artikel', 'V1', '6 menit baca', 'Kebutuhan Survival: cara menjaga tidur, makan, dan istirahat sebagai dasar energi mental.', ['self-care', 'ketahanan-fisik', 'energi-mental', 'kelelahan-mental', 'insomnia', 'fisik-drop']],
    ['Saat Panik Datang di Kampus: Kembali Merasa Aman', 'video', 'V1', '7 menit', 'Latihan grounding dan napas untuk menenangkan tubuh saat panik atau merasa tidak aman.', ['panik', 'rasa-aman', 'ketenangan-mental', 'kerapuhan-mental', 'krisis-keamanan']],
    ['Kesepian di Tengah Keramaian Kampus', 'bibliokonseling', 'V2', '40 halaman', 'Cerita penyembuhan mahasiswa perantau yang belajar membuka diri dan menemukan komunitas.', ['kesepian', 'isolasi-sosial', 'belongingness', 'keterhubungan-kampus', 'mental-rapuh']],
    ['7 Caring Habits: Merawat Relasi Tanpa Menguras Emosi', 'infografis', 'V2', '1 halaman', 'Mengganti kebiasaan mematikan (mengkritik, menyalahkan, mengeluh) dengan kebiasaan peduli (mendengar, mendukung, menghormati).', ['caring-habits', 'konflik-interpersonal', 'terkuras-emosi', 'support-system', 'love-belonging']],
    ['Dari Rasa Gagal ke Daya Juang', 'video', 'V3', '8 menit', 'Kebutuhan Power: membangun inner strength setelah merasa gagal dan tidak sanggup.', ['rasa-gagal', 'ketidakberdayaan', 'daya-juang', 'inner-strength', 'mental-down', 'kompetensi-akademik']],
    ['Berhenti Membandingkan, Mulai Mengukur Diri Sendiri', 'podcast', 'V3', '18 menit', 'Obrolan tentang minder, perbandingan sosial, dan menemukan nilai diri dari kontribusi.', ['minder', 'perbandingan-sosial', 'self-worth', 'mental-goyah', 'kebermaknaan-diri', 'apresiasi']],
    ['Hidupku, Pilihanku: Otonomi dalam Choice Theory', 'artikel', 'V4', '6 menit baca', 'Kebutuhan Freedom: membedakan yang bisa kupilih dan yang tidak, tanpa merasa didikte.', ['otonomi-mental', 'kemandirian-pilihan', 'tekanan-koersif', 'kehilangan-kendali-hidup']],
    ['Berani Berpendapat Tanpa Takut Dinilai', 'slide', 'V4', '12 slide', 'Latihan asertivitas dan menjadi diri sendiri di kelas dan pergaulan.', ['asertivitas', 'keautentikan-mental', 'kekuatan-freedom']],
    ['Keluar dari Jebakan Rutinitas Kuliah', 'video', 'V4', '6 menit', 'Cara menciptakan ruang untuk diri sendiri di tengah rutinitas yang terasa memenjarakan.', ['burnout-rutinitas', 'mental-terkekang', 'defisit-freedom']],
    ['Kebiasaan Positif vs Kecanduan Negatif: Lepas dari Scroll Tanpa Henti', 'infografis', 'V5', '1 halaman', 'Menurut Glasser, kebiasaan positif yang dilakukan tanpa kritik diri menguatkan mental; pelarian impulsif melemahkannya.', ['negative-addiction', 'escapism', 'pelarian-impulsif', 'defisit-fun', 'positive-addiction']],
    ['Menemukan Lagi Kegembiraan Belajar', 'podcast', 'V5', '20 menit', 'Kebutuhan Fun: mengisi ulang energi lewat joyful learning dan hobi sehat saat semuanya terasa hambar.', ['joyful-learning', 'anhedonia', 'kejenuhan-mental-akut', 'rekreasi-sehat', 'pengisian-energi-mental', 'resiliensi-humor']],
    ['Dunia Kualitasku: Menemukan Tujuan Kuliah', 'bibliokonseling', 'V6', '30 halaman', 'Bacaan terpandu untuk memperjelas tujuan hidupmu: apa yang ingin kucapai dan mengapa.', ['kejelasan-visi', 'krisis-tujuan', 'disorientasi-mental', 'jangkar-mental', 'kekuatan-quality-world']],
    ['WDEP: Mengevaluasi Pilihan Tanpa Menghakimi Diri', 'slide', 'V6', '10 slide', 'Reality Therapy untuk diri sendiri: Wants, Doing, Evaluation, Plan — keluar dari mentalitas korban dan kritik diri.', ['self-evaluation', 'WDEP', 'internal-control', 'tanggung-jawab-mental', 'victim-mentality', 'self-criticism', '7-deadly-habits']],
    ['Lawan Prokrastinasi & Overthinking dengan Roda Depan Perilaku', 'video', 'V6', '9 menit', 'Ubah tindakan dan pikiran lebih dulu agar perasaan dan tubuh ikut pulih.', ['prokrastinasi', 'overthinking', 'lumpuh-tindakan', 'ineffective-total-behavior', 'positive-addiction', 'otot-mental']],
    ['Kapan Harus ke Konselor? Alur Layanan Konseling UNP Kediri', 'artikel', 'UMUM', '3 menit baca', 'Tanda kamu butuh bantuan profesional, cara mendaftar konseling, dan jaminan kerahasiaan.', ['reservasi-konseling', 'bantuan-ahli', 'dukungan-kuratif', 'depressing', 'runtuh-kekuatan-mental', 'psikosomatis']],
    ['Draf: Komunikasi Asertif dengan Orang Tua', 'artikel', 'V2', '7 menit baca', 'Draf konten — menunggu tinjauan penasihat klinis.', ['konflik-interpersonal']],
  ];
  const CID = {};
  contents.forEach(([judul, tipe, kategori, durasi, ringkasan, kk], i) => {
    CID[i] = insert('content_items', {
      judul, tipe, kategori, durasi_atau_halaman: durasi, ringkasan, kata_kunci: JSON.stringify(kk.filter((k) => KEYWORDS.includes(k))), thumbnail_url: `/thumbs/${kategori}.svg`,
      created_at: daysAgo(95 - i), diterbitkan_pada: judul.startsWith('Draf') ? null : daysAgo(95 - i),
      isi: `${ringkasan}\n\nKonten lengkap dikelola konselor melalui menu Manajemen Konten. Tautan media (video/podcast) atau berkas unggahan (PDF, slide) dapat ditambahkan pada kolom media.`,
      status: judul.startsWith('Draf') ? 'draft' : 'published', jumlah_tayang: [64, 88, 120, 41, 37, 142, 58, 33, 29, 96, 110, 47, 71, 26, 158, 0][i],
      // Konten 1–10 & draf: produksi admin (pustaka), dipakai K002 untuk kampus UNP; sisanya buatan konselor sendiri
      ...(i < 10 || judul.startsWith('Draf') ? { sumber: 'admin', dibuat_oleh: admin } : { sumber: 'konselor', university_id: UNP, dibuat_oleh: C.K002 }),
    });
    if (i < 10) insert('content_adoptions', { content_id: CID[i], counselor_id: C.K002, university_id: UNP, status: 'published', rating: 5 - (i % 2), ulasan: i === 0 ? 'Bahasa mudah dipahami mahasiswa baru; cocok untuk masa ujian.' : null });
  });
  // Konten pustaka admin yang baru terbit dan belum dipakai konselor mana pun (contoh untuk ditinjau)
  for (const [judul, tipe, kategori, durasi, ringkasan, kk] of [
    ['Mengelola Kecemasan Menjelang Presentasi', 'video', 'V3', '6 menit', 'Langkah praktis menenangkan diri sebelum tampil di depan kelas.', ['ketidakberdayaan', 'daya-juang', 'inner-strength']],
    ['Menyusun Jadwal Harian yang Realistis', 'infografis', 'V6', '1 halaman', 'Satu halaman untuk merencanakan hari tanpa berlebihan, sesuai prinsip WDEP.', ['prokrastinasi', 'WDEP', 'self-evaluation']],
  ]) insert('content_items', { judul, tipe, kategori, durasi_atau_halaman: durasi, ringkasan, kata_kunci: JSON.stringify(kk.filter((k) => KEYWORDS.includes(k))), thumbnail_url: `/thumbs/${kategori}.svg`, isi: ringkasan, status: 'published', sumber: 'admin', dibuat_oleh: admin, created_at: daysAgo(90), diterbitkan_pada: daysAgo(90) });

  // ---- Mahasiswa & riwayat asesmen IKDKM-M ----
  const studentDefs = [
    // nim, nama, prodi, angkatan, kelas, gender, strength, need, extra
    ['2313020001', 'Budi Santoso', 'Teknik Informatika', 2023, 'A', 'L', 0.74, 0.55, { lemah: ['V5', 'V6'] }],
    ['2214010012', 'Siti Rahmawati', 'PGSD', 2022, 'B', 'P', 0.6, 0.7, { lemah: ['V2'] }],
    ['2413020044', 'Dimas Pratama', 'Teknik Mesin', 2024, 'A', 'L', 0.82, 0.3, {}],
    ['2312010031', 'Ayu Lestari', 'Akuntansi', 2023, 'B', 'P', 0.15, 0.9, { lemah: ['V6', 'V2', 'V1'], krisis: true }],
    ['2213020027', 'Rizky Firmansyah', 'Sistem Informasi', 2022, 'A', 'L', 0.62, 0.65, { lemah: ['V6', 'V3'] }],
    ['2414010003', 'Nadia Putri', 'Bimbingan dan Konseling', 2024, 'A', 'P', 0.85, 0.4, {}],
    ['2312010058', 'Fajar Nugroho', 'Manajemen', 2023, 'A', 'L', 0.58, 0.25, { lemah: ['V2', 'V5'] }],
    ['2315030019', 'Laila Kurnia', 'Keperawatan', 2023, 'A', 'P', 0.6, 0.75, { lemah: ['V1', 'V5'] }],
    ['2214010066', 'Yoga Saputra', 'Pendidikan Matematika', 2022, 'C', 'L', 0.8, 0.35, {}],
    ['2414010071', 'Intan Maharani', 'Pendidikan Bahasa Inggris', 2024, 'B', 'P', 0.58, 0.6, { lemah: ['V4'] }],
    ['2413020090', 'Hendra Wijaya', 'Teknik Informatika', 2024, 'B', 'L', 0.55, 0.7, { lemah: ['V3', 'V4'] }],
    ['2215030008', 'Dewi Anggraini', 'Kebidanan', 2022, 'A', 'P', 0.82, 0.45, {}],
  ];
  const S = {};
  studentDefs.forEach(([nim, nama, prodi, angk, kelas, g, strength, need, extra], i) => {
    const uid = insert('users', {
      role: 'mahasiswa', nim_nip: nim, nama, email: `${nim}@student.unpkediri.ac.id`, password_hash: pw, university_id: UNP, prodi_id: prodiId(prodi), angkatan: angk, kelas, gender: g,
      tanggal_lahir: `${angk - 19}-0${(i % 9) + 1}-1${i % 9}`, alamat: enc('Kediri, Jawa Timur'), telepon: enc(`0857-0000-${String(1000 + i)}`), identitas_disamarkan: i === 7 ? 1 : 0,
    });
    S[nim] = uid;
    insert('consents', { user_id: uid, jenis_consent: 'layanan_umum', disetujui_pada: daysAgo(70), versi_kebijakan: 'v1.0-2026-10', alamat_ip: '10.0.0.1' });
    if (nim === '2414010071') return; // contoh konseli yang belum pernah mengisi asesmen
    const rand = mulberry32(i + 11);
    const history = i === 0 ? [62, 33, 9] : i === 4 ? [45] : [38 - (i % 3) * 5, 10 + (i % 6)];
    history.forEach((d, k) => {
      const last = k === history.length - 1;
      const grow = (k - history.length + 1) * 0.07; // perkembangan: kekuatan mental naik dari waktu ke waktu
      const r = storeAssessment(uid, makeAnswers(rand, Math.min(0.95, strength + grow), Math.max(0.05, need - grow), { ...extra, krisis: last && extra.krisis }), daysAgo(d));
      if (last && r.risk_alert === 'red') {
        insert('risk_alerts', { student_id: uid, assessment_id: r.id, level: 'red', created_at: new Date(Date.now() - 45 * 60000).toISOString() });
        insert('interventions', { student_id: uid, deskripsi: 'Butuh bantuan segera (IKDKM-M: indeks krisis + gejala emosional-fisiologis berat) — hubungi mahasiswa dan susun safety plan.', dibuat_oleh: admin, prioritas: 'krisis' });
      }
    });
  });
  // ---- Responden demo lintas provinsi (agregat untuk menu Monitoring & Psikometrik admin; tanpa konselor/aktivitas) ----
  const COHORT = [['001001', 0.62], ['001004', 0.58], ['001005', 0.5], ['001003', 0.55], ['001013', 0.66], ['001034', 0.6]];
  const PRODI_DEMO = [['Fakultas Psikologi', 'FPSI', 'Psikologi', 'S1'], ['Fakultas Hukum', 'FH', 'Ilmu Hukum', 'S1'], ['Fakultas Teknik', 'FT', 'Teknik Sipil', 'S1'], ['Sekolah Vokasi', 'SV', 'Manajemen Perkantoran', 'D3']];
  const NAMA_DEPAN = ['Andi', 'Bayu', 'Citra', 'Dinda', 'Eka', 'Farah', 'Gilang', 'Hana', 'Irfan', 'Jihan', 'Kevin', 'Lina', 'Made', 'Nanda', 'Oki', 'Putu', 'Rani', 'Sari', 'Tegar', 'Wulan'];
  let dn = 0;
  for (const [npsn, base] of COHORT) {
    if (!get('SELECT 1 AS x FROM universities WHERE id = ?', npsn)) continue;
    const pids = PRODI_DEMO.map(([fak, fk, nama, jj], k) => insert('prodi', { id: `D${npsn}${k}`, nama_prodi: nama, fakultas: fak, fakultas_kode: fk, jenjang: jj, university_id: npsn }));
    // satu konselor demo per kampus yang memakai seluruh pustaka admin (agar rekomendasi konten muncul), dengan rating acak
    const kid = insert('users', { role: 'konselor', nim_nip: `KD${npsn}`, nama: `Konselor Demo ${npsn}`, email: `kd${npsn}@demo.panjalu.local`, password_hash: pw, university_id: npsn, status: 'aktif' });
    insert('counselors', { user_id: kid, spesialisasi: 'Konseling umum', lingkup_fakultas: '[]' });
    for (const c of all("SELECT id FROM content_items WHERE status = 'published' AND sumber = 'admin'")) insert('content_adoptions', { content_id: c.id, counselor_id: kid, university_id: npsn, status: 'published', rating: 3 + ((dn + c.id.charCodeAt(0)) % 3) });
    for (let i = 0; i < 28; i++) {
      const rand = mulberry32(1000 + dn); const g = rand() < 0.55 ? 'P' : 'L'; const angk = 2021 + Math.floor(rand() * 5);
      const nim = `DM${npsn}${String(i).padStart(3, '0')}`;
      const uid = insert('users', { role: 'mahasiswa', nim_nip: nim, nama: `${NAMA_DEPAN[dn % NAMA_DEPAN.length]} ${String.fromCharCode(65 + (dn % 26))}.`, email: `${nim.toLowerCase()}@demo.panjalu.local`, password_hash: pw, university_id: npsn, prodi_id: pids[i % pids.length],
        angkatan: angk, kelas: 'A', gender: g, tanggal_lahir: `${angk - 18 - Math.floor(rand() * 3)}-0${1 + Math.floor(rand() * 9)}-1${Math.floor(rand() * 9)}` });
      const strength = Math.max(0.08, Math.min(0.95, base + (rand() - 0.5) * 0.6 + (g === 'P' ? -0.03 : 0.03) + (angk <= 2022 ? -0.05 : 0)));
      const need = Math.max(0.05, Math.min(0.95, 1 - strength + (rand() - 0.5) * 0.3));
      const lemah = ['V1', 'V2', 'V3', 'V4', 'V5', 'V6'].filter(() => rand() < 0.18);
      const times = rand() < 0.5 ? [40 + Math.floor(rand() * 60), 3 + Math.floor(rand() * 30)] : [5 + Math.floor(rand() * 80)];
      times.forEach((d, k) => {
        const res = storeAssessment(uid, makeAnswers(rand, Math.min(0.95, strength + k * 0.05), need, { lemah }), daysAgo(d));
        // sebagian mahasiswa membuka konten rekomendasinya beberapa jam/hari kemudian (data latensi)
        for (const rc of all("SELECT target_id, created_at FROM assessment_recommendations WHERE assessment_id = ? AND jenis = 'konten'", res.id)) {
          if (rand() > 0.55) continue;
          const t = Date.parse(rc.created_at) + Math.round((1 + rand() * rand() * 240) * 3600000); if (t > Date.now()) continue;
          insert('content_views', { user_id: uid, content_id: rc.target_id, waktu: new Date(t).toISOString(), durasi_detik: Math.round(60 + rand() * 600) });
        }
      });
      // akses konten demo (untuk analisis keterlibatan): media visual & video sedikit lebih sering dibuka
      const lib = all("SELECT id, tipe FROM content_items WHERE status = 'published' AND sumber = 'admin'");
      const pref = { video: 3, infografis: 2.5, artikel: 1.6, podcast: 1.2, bibliokonseling: 1, slide: 0.8 };
      const nView = Math.floor(rand() * 7); let tv = Date.now() - (3 + Math.floor(rand() * 50)) * 86400000;
      for (let v = 0; v < nView && lib.length; v++) {
        const pool = lib.flatMap((c) => Array(Math.round((pref[c.tipe] || 1) * 2)).fill(c)); const c = pool[Math.floor(rand() * pool.length)];
        tv += Math.floor((0.2 + rand() * 6) * 86400000 * rand()); if (tv > Date.now()) break;
        const base = { video: 420, podcast: 600, artikel: 240, infografis: 90, bibliokonseling: 900, slide: 150 }[c.tipe] || 200;
        insert('content_views', { user_id: uid, content_id: c.id, waktu: new Date(tv).toISOString(), durasi_detik: Math.max(8, Math.round(base * (0.2 + rand() * 1.3))) });
      }
      dn++;
    }
  }

  const budi = S['2313020001'];
  // Konselor pilihan mahasiswa (pembina). Mahasiswa tanpa pilihan ditangani konselor yang konteks kerjanya cocok.
  for (const [nim, kode] of [['2313020001', 'K001'], ['2313020001', 'K002'], ['2414010003', 'K002'], ['2214010066', 'K003']]) if (S[nim]) insert('student_counselors', { student_id: S[nim], counselor_id: C[kode] });

  // ---- Jadwal pengisian asesmen (diatur konselor) ----
  insert('assessment_schedules', { university_id: UNP, cakupan: 'semua', target: null, interval_hari: 30, pesan: 'Isi IKDKM-M sebulan sekali agar perkembangan kekuatan mentalmu terpantau.', dibuat_oleh: C.K001 });
  insert('assessment_schedules', { university_id: UNP, cakupan: 'prodi', target: prodiId('Teknik Informatika'), interval_hari: 7, pesan: 'Masa UTS: isi IKDKM-M seminggu sekali agar kami bisa mendampingi lebih cepat.', dibuat_oleh: C.K001 });

  const budiLast = get('SELECT id FROM assessments WHERE user_id = ? ORDER BY diisi_pada DESC LIMIT 1', budi).id;
  insert('assessment_recommendations', { assessment_id: budiLast, student_id: budi, sumber: 'konselor', jenis: 'konten', target_id: CID[9], judul: contents[9][0], alasan: 'Sesuai pola lari ke HP yang kita bahas. Pilih satu kebiasaan positif pengganti minggu ini, lalu tulis Refleksi GURU-nya.', dibuat_oleh: C.K001, urutan: -1 });

  // ---- Aktivitas Budi: jurnal, goals, mood, relaksasi, akses konten, Refleksi GURU per konten ----
  [['senang', 'Presentasi kelompok berjalan lancar. Aku sempat gugup, tapi teman-teman membantu.', ['kuliah', 'teman'], 6],
    ['biasa', 'Tugas menumpuk. Aku mulai menyicil satu bagian saja supaya tidak kewalahan.', ['tugas'], 3],
    ['sedih', 'Kangen rumah. Telepon ibu sebentar dan merasa sedikit lebih ringan.', ['keluarga'], 1]]
    .forEach(([mood, isi, tags, d]) => insert('journal_entries', { user_id: budi, tanggal: daysAgo(d, 21), created_at: daysAgo(d, 21), mood, prompt: 'Apa yang berhasil kamu lakukan hari ini, sekecil apa pun?', isi_teks: enc(isi), tags: JSON.stringify(tags) }));
  const week = isoWeek(new Date());
  [['Ponsel di luar kamar setelah jam 22.00', 1], ['Jalan sore 20 menit menggantikan scrolling malam', 0], ['Ikut diskusi grup Teman Cerita', 0]]
    .forEach(([t, st]) => insert('goals', { user_id: budi, isi_teks: t, selesai: st, minggu_ke: week }));
  [5, 3, 4, 2, 3, 4, 4, 3, 5, 4].forEach((m, d) => insert('mood_checkins', { user_id: budi, waktu: daysAgo(d, 8 + (d % 4)), mood: m, konteks_aktivitas: ['Kuliah', 'Mengerjakan tugas', 'Istirahat', 'Bersama teman'][d % 4], catatan: enc('Catatan singkat check-in'), motivasi_diri: enc('Pelan-pelan saja, yang penting jalan.') }));
  [['Box Breathing', 192, 2], ['Soundscape: Hujan + Burung', 900, 3], ['Napas 4-7-8', 228, 5]].forEach(([j, sec, d]) => insert('mindfulness_logs', { user_id: budi, jenis_aktivitas: j, durasi_detik: sec, waktu: daysAgo(d, 22) }));
  [[9, 8], [12, 7], [0, 4]].forEach(([ci, d]) => insert('content_views', { user_id: budi, content_id: CID[ci], waktu: daysAgo(d, 20) }));
  {
    const { GURU_STAGES } = require('./reference');
    const j = { ground: 'Kebutuhan Fun dan Survival-ku terganggu: aku capek dan lari ke HP sampai larut malam.', understand: 'Dari infografis ini aku sadar scrolling adalah negative addiction — terasa melegakan sebentar tapi melemahkanku keesokan harinya.', revise: 'Mengganti 30 menit scrolling malam dengan jalan sore 20 menit (positive addiction).', use: 'Senin–Jumat pukul 16.30 di sekitar kampus; aku menilai dari jam tidur dan rasa segar di pagi hari.' };
    insert('workbook_entries', { user_id: budi, domain_id: 'V5', tahap: 'guru', content_id: CID[9], konten_json: JSON.stringify([CID[9]]), jawaban_json: enc(JSON.stringify(j)), keluaran: 'Refleksi GURU lengkap',
      isi_teks: enc(GURU_STAGES.map((st) => `${st.nama} — ${st.makna}\n→ ${j[st.kode]}`).join('\n\n')), tanggal: daysAgo(7) });
    const j2 = { ground: 'Aku sering menyalahkan dosen saat nilai jelek.', understand: 'WDEP membantuku bertanya: apakah menyalahkan itu membuatku lebih dekat dengan IPK yang kuinginkan? Tidak.', revise: '', use: '' };
    insert('workbook_entries', { user_id: budi, domain_id: 'V6', tahap: 'guru', content_id: CID[12], konten_json: JSON.stringify([CID[12]]), jawaban_json: enc(JSON.stringify(j2)), keluaran: null,
      isi_teks: enc(GURU_STAGES.map((st) => `${st.nama} — ${st.makna}\n→ ${j2[st.kode] || '-'}`).join('\n\n')), tanggal: daysAgo(6) });
  }

  // ---- Komunitas: grup, anggota, diskusi, laporan; peer counselor ditetapkan konselor ----
  const groups = [
    ['Teman Cerita', 'Relasi & kesepian', 'Ruang aman berbagi cerita bagi mahasiswa perantau dan mahasiswa baru.', 'Kamis 16.00', ['Adaptasi di kota baru', 'Cara memulai pertemanan', 'Kangen rumah'], 'aktif'],
    ['Lingkar Skripsi', 'Ketekunan & tugas akhir', 'Saling menguatkan selama menyusun tugas akhir.', 'Selasa 19.00 (daring)', ['Mengatasi buntu menulis', 'Bimbingan dengan dosen', 'Bangkit setelah revisi'], 'aktif'],
    ['Bijak Digital', 'Kendali diri & dunia digital', 'Berbagi strategi mengatur gawai, media sosial, dan AI.', 'Rabu 19.30 (daring)', ['Tantangan 7 hari tanpa scroll malam', 'Memakai AI dengan jujur', 'Menjaga data pribadi'], 'aktif'],
    ['Ruang Tenang', 'Emosi & kecemasan', 'Kelompok dukungan untuk kecemasan, didampingi konselor.', 'Jumat 13.30', ['Teknik menenangkan diri', 'Cerita minggu ini'], 'nonaktif'],
  ];
  const G = groups.map(([nama, topik, deskripsi, jadwal, td, status]) => insert('community_groups', { nama, topik, deskripsi, jadwal, topik_diskusi: JSON.stringify(td), status, dibuat_oleh: C.K001, university_id: UNP, cakupan: nama === 'Lingkar Skripsi' ? 'binaan' : 'universitas' }));
  Object.values(S).forEach((uid, i) => { insert('group_members', { group_id: G[i % 3], user_id: uid, bergabung_pada: daysAgo(20 - i) }); });
  insert('group_members', { group_id: G[2], user_id: budi, bergabung_pada: daysAgo(12) });
  const post = (g, u, isi, topik, parent, d, status = 'tampil') => insert('group_posts', { group_id: g, user_id: u, isi, topik, parent_id: parent, status, created_at: daysAgo(d, 19) });
  const p1 = post(G[2], budi, 'Ada yang mau ikut tantangan 7 hari tanpa scroll setelah jam 10 malam? Aku mulai hari ini.', 'Tantangan 7 hari tanpa scroll malam', null, 4);
  post(G[2], S['2315030019'], 'Ikut! Aku sering kebablasan sampai jam 2 pagi.', null, p1, 4);
  post(G[2], C.K001, 'Ide bagus. Coba letakkan ponsel di luar kamar dan ganti dengan napas 4-7-8 dari Ruang Relaksasi.', null, p1, 3);
  const p2 = post(G[0], S['2413020090'], 'Aku masih susah ngobrol duluan di kelas. Ada tips?', 'Cara memulai pertemanan', null, 2);
  post(G[0], S['2414010003'], 'Mulai dari tanya hal kecil soal tugas. Aku dulu juga begitu, pelan-pelan jadi akrab.', null, p2, 2);
  const spam = post(G[0], S['2312010058'], 'Jual akun premium murah, DM ya!', null, null, 1);
  run("INSERT INTO post_reports (id, post_id, pelapor_id, alasan) VALUES (?,?,?,?)", require('node:crypto').randomUUID(), spam, budi, 'Promosi/jualan, tidak sesuai tujuan grup.');
  [['2313020001', C.K001, 'Pelatihan Peer Counselor UNP Kediri Angkatan 3', 'Stres akademik & kebiasaan digital', 'online'], ['2414010003', C.K002, 'Pelatihan Peer Counselor UNP Kediri Angkatan 3', 'Teman cerita & adaptasi mahasiswa baru', 'sibuk'], ['2214010066', C.K002, 'Pelatihan Psychological First Aid (PFA) dasar', 'Kesepian & relasi', 'offline']]
    .forEach(([nim, by, pel, keahlian, status], i) => {
      const pid = insert('peer_counselors', { user_id: S[nim], aktif: 1, status, pelatihan: pel, tanggal_sertifikasi: daysAgo(60 + i * 10).slice(0, 10), keahlian, kontak_terverifikasi: `0857-0000-${String(1000 + i * 5)}`, ditetapkan_oleh: by });
      insert('peer_supervision', { peer_id: pid, counselor_id: by, tanggal: daysAgo(14).slice(0, 10), catatan: 'Supervisi bulanan: refleksi kasus dan batas peran peer counselor (merujuk ke konselor bila ada risiko).' });
    });
  insert('peer_counselors', { user_id: S['2312010058'], aktif: 0, status: 'offline', pelatihan: 'Pelatihan Peer Counselor Angkatan 2', keahlian: 'Manajemen waktu', ditetapkan_oleh: C.K001, dinonaktifkan_pada: daysAgo(5), alasan_nonaktif: 'Belum mengikuti supervisi wajib semester ini.' });

  // ---- Janji temu, formulir pendaftaran, catatan profesional & ringkasan untuk konseli ----
  const { occurrences, consentOf } = require('./routes/counseling');
  const mkForm = (sid, cid, jadwal, jenis_layanan, mode, topik, keluhan, created) => {
    const s = get('SELECT u.*, p.nama_prodi FROM users u LEFT JOIN prodi p ON p.id = u.prodi_id WHERE u.id = ?', sid);
    const k = get('SELECT nama FROM users WHERE id = ?', cid); const c = consentOf(cid);
    const nomor = `PJ-${created.slice(0, 10).replace(/-/g, '')}-${require('node:crypto').randomBytes(2).toString('hex').toUpperCase()}`;
    return { nomor, form: { nomor, nama: s.nama, nim: s.nim_nip, prodi: s.nama_prodi, email: s.email, telepon: '0857-0000-1000', konselor: k.nama, jadwal, jenis_layanan, mode, lokasi: mode === 'offline' ? 'Ruang Konseling Gedung A, Lt. 2' : null, topik, keluhan, consent_versi: c.versi, consent: c.bagian.map((x) => [x.judul, x.isi]), disetujui_pada: created, diajukan_pada: created }, c };
  };
  const appt = (sid, cid, jadwal, slot, jenis_layanan, mode, topik, keluhan, status, created, extra = {}) => {
    const { nomor, form, c } = mkForm(sid, cid, jadwal, jenis_layanan, mode, topik, keluhan, created);
    const id = insert('appointments', { student_id: sid, counselor_id: cid, jadwal, slot_id: slot, topik, jenis: mode, jenis_layanan, keluhan: enc(keluhan), status, consent_versi: c.versi, consent_teks: enc(c.bagian.map((x) => `${x.judul}\n${x.isi}`).join('\n\n')), formulir_json: enc(JSON.stringify(form)), nomor, lokasi: form.lokasi, created_at: created, ...extra });
    insert('consents', { user_id: sid, jenis_consent: 'konseling', disetujui_pada: created, versi_kebijakan: `konselor-v${c.versi}`, alamat_ip: '10.0.0.1', appointment_id: id });
    return id;
  };
  const a1 = appt(budi, C.K001, daysAgo(20, 2), null, 'Konseling Individu', 'offline', 'Kejenuhan, hobi & kecanduan gawai/game', 'Sulit berhenti scroll sampai larut malam dan tugas jadi tertunda.', 'selesai', daysAgo(23), { tindak_lanjut: 'Jadwalkan Sesi Lanjutan' });
  const s1 = insert('counseling_sessions', { appointment_id: a1, diagnosis_domain_id: 'Kejenuhan, hobi & kecanduan gawai/game', tingkat_keparahan: 'Sedang', catatan_rapport: enc('Kooperatif, sempat malu mengakui kebiasaan lari ke HP.'), catatan_eksplorasi: enc('W: ingin tugas selesai tanpa begadang. D: scrolling saat cemas menjelang deadline. E: konseli menilai pilihan itu melemahkannya. Kebutuhan Fun & Survival terganggu.'), tujuan_smart: enc('Selama 2 minggu: ponsel di luar kamar setelah 22.00 minimal 5 malam; tugas dikerjakan 25 menit tanpa AI sebelum memverifikasi.'), catatan_teknik: enc('Psikoedukasi regulasi diri, strength-spotting (ketekunan), kesepakatan digital.'), catatan_penutup: enc('Konseli menyusun aturan pribadi dan setuju mengisi Workbook GURU V5.') });
  insert('counseling_evaluations', { session_id: s1, refleksi_konselor: enc('Rapport baik. Perlu pantau konsistensi; pertimbangkan grup diskusi Bijak Digital (Kolaboratif).'), rencana_monitoring: JSON.stringify(['Cek jurnal H+3', 'Ajak isi ulang asesmen H+14']), rekomendasi_lanjutan: 'Jadwalkan Sesi Lanjutan', perkembangan: 'Membaik' });
  insert('counseling_summaries', { appointment_id: a1, ringkasan: enc('Kita membahas kebiasaan begadang dengan ponsel saat cemas. Kamu menilai sendiri bahwa pilihan itu melemahkanmu, dan memilih kebiasaan positif penggantinya. Itu langkah kendali internal yang bagus.'), tindak_lanjut_konseli: enc('1) Ponsel di luar kamar setelah 22.00. 2) Jalan sore 20 menit sebagai positive addiction. 3) Pelajari konten WDEP lalu isi Refleksi GURU-nya.'), status: 'disetujui', disetujui_pada: daysAgo(19) });
  insert('counseling_feedback', { appointment_id: a1, rating: 5, refleksi_mahasiswa: enc('Lega bisa cerita tanpa dihakimi.') });
  // Refleksi kinerja konselor (model GURU + rating bintang)
  [[3, 'Konseling individu mahasiswa tingkat akhir', 4, 'Sesi sering molor dari waktu yang dijadwalkan.', 'Saya belum menyepakati batas waktu di awal sesi; konseli banyak bercerita di luar topik.', 'Menyepakati durasi & tujuan sesi sejak awal; memakai ringkasan di menit ke-40.', 'Mulai minggu depan, setiap sesi dibuka dengan kesepakatan waktu; evaluasi di akhir bulan.'],
    [10, 'Psikoedukasi kelas: manajemen stres menjelang UTS', 3, 'Partisipasi mahasiswa rendah; materi terlalu banyak ceramah.', 'Mahasiswa lebih tertarik pada contoh nyata dan latihan langsung.', 'Mengurangi slide, menambah latihan napas dan diskusi kasus kelompok kecil.', 'Sesi berikutnya 50% praktik; meminta umpan balik singkat lewat formulir.']]
    .forEach(([d, jenis, rating, g, u, r, us]) => insert('counselor_reflections', { counselor_id: C.K001, jenis_layanan: jenis, rating, tanggal_kegiatan: daysAgo(d).slice(0, 10), created_at: daysAgo(d), ground: enc(g), understand: enc(u), revise: enc(r), use_: enc(us) }));
  insert('counselor_notes', { student_id: budi, counselor_id: C.K001, catatan: enc('Kekuatan: ketekunan. Fokus: negative addiction (V5) & kendali internal (V6). Pantau skor V5/V6 di asesmen berikutnya.'), diperbarui_pada: daysAgo(19) });
  const k1 = occurrences(C.K001).find((o) => o.jenis_layanan === 'Konseling Individu');
  const k2 = occurrences(C.K002).find((o) => o.jenis_layanan === 'Konseling Individu');
  if (k1) {
    appt(S['2413020090'], C.K001, k1.jadwal, k1.slot_id, k1.jenis_layanan, 'offline', 'Relasi, keluarga & pertemanan', 'Merasa sulit berbaur di kelas.', 'pending', daysAgo(1));
    appt(S['2213020027'], C.K001, k1.jadwal, k1.slot_id, k1.jenis_layanan, 'online', 'Lainnya', 'Bingung memilih topik skripsi dan takut mengecewakan orang tua.', 'confirmed', daysAgo(2), { topik_lainnya: 'Memilih topik skripsi', tautan_rapat: 'https://meet.google.com/' });
  }
  if (k2) appt(S['2214010012'], C.K002, k2.jadwal, k2.slot_id, k2.jenis_layanan, 'offline', 'Kelelahan, tidur & rasa aman', 'Cemas berlebihan menjelang PPL.', 'confirmed', daysAgo(1));

  insert('messages', { sender_id: S['2413020090'], receiver_id: C.K001, isi_teks: enc('Pak, apakah jadwal minggu ini masih bisa?'), dikirim_pada: daysAgo(0, 1) });
  insert('messages', { sender_id: budi, receiver_id: C.K001, isi_teks: enc('Terima kasih Pak, aturan ponsel saya mulai jalan.'), dikirim_pada: daysAgo(10, 12), dibaca: 1 });
  insert('supervisor_notes', { counselor_id: C.K001, periode: 'Semester Ganjil 2026/2027', kekuatan: 'Membangun rapport dengan cepat; dokumentasi sesi rapi.', area_pengembangan: 'Percepat respons terhadap pendaftaran baru (target < 24 jam).', ditulis_oleh: admin });

  // Pendaftar konselor yang sudah verifikasi email dan menunggu persetujuan admin (contoh)
  const pend = insert('users', { role: 'konselor', nim_nip: 'K004', nama: 'Lestari Handayani, M.Psi., Psikolog', email: 'lestari.handayani@panjalu.local', password_hash: pw, university_id: UNP, status: 'menunggu_persetujuan', aktif: 0, telepon: enc('0813-0000-0004') });
  insert('counselors', { user_id: pend, spesialisasi: 'Psikologi Klinis — Trauma & Duka', gelar: 'Psikolog Klinis (SIPP aktif)', lingkup_fakultas: JSON.stringify(['FKIP']) });

  // ---- Konselor PAN-JALU (lintas kampus) & mahasiswa dari kampus yang belum memiliki konselor ----
  const campus = require('./campus');
  campus.ensurePanjaluUni();
  const pjUni = campus.proposeUniversity('Sekolah Tinggi Ilmu Kesehatan Harapan Bangsa', 'Kabupaten Kediri');
  const pjProdi = insert('prodi', { university_id: pjUni, nama_prodi: 'Keperawatan', fakultas: 'Fakultas Ilmu Kesehatan', fakultas_kode: 'FIK', jenjang: 'S1', status: 'usulan' });
  // K002 sudah disetujui sebagai Konselor PAN-JALU; K003 masih menunggu persetujuan admin
  insert('panjalu_counselors', { user_id: C.K002, alasan: 'Psikolog klinis; 8 tahun mendampingi mahasiswa, termasuk penanganan krisis.', status: 'aktif', kapasitas: 50, ditinjau_oleh: admin, ditinjau_pada: daysAgo(3), diajukan_pada: daysAgo(4) });
  insert('panjalu_counselors', { user_id: C.K003, alasan: 'Berpengalaman konseling daring lintas kampus dan konseling kelompok.', status: 'menunggu', kapasitas: 50, diajukan_pada: daysAgo(1) });
  // Konselor independen (tanpa kampus) menunggu persetujuan admin
  const indep = insert('users', { role: 'konselor', nim_nip: 'KP001', nama: 'Maya Anggraini, M.Psi., Psikolog', email: 'kp001@panjalu.local', password_hash: pw, university_id: campus.PANJALU_UNI, status: 'menunggu_persetujuan', aktif: 0 });
  insert('counselors', { user_id: indep, spesialisasi: 'Psikologi Klinis — Depresi & Regulasi Emosi', gelar: 'Psikolog Klinis (SIPP aktif), praktik mandiri', lingkup_fakultas: '[]' });
  insert('panjalu_counselors', { user_id: indep, alasan: 'Psikolog klinis praktik mandiri 6 tahun; bersedia mendampingi mahasiswa dari kampus yang belum memiliki konselor.', independen: 1, status: 'menunggu', kapasitas: 50, diajukan_pada: daysAgo(0, 8) });
  // MB001: mahasiswa baru, belum memilih konselor → diajak memilih saat masuk
  insert('users', { role: 'mahasiswa', nim_nip: 'MB001', nama: 'Dewi Lestari', email: 'mb001@panjalu.local', password_hash: pw, university_id: pjUni, prodi_id: pjProdi, angkatan: new Date().getFullYear(), kelas: 'A', gender: 'P' });
  // MB002: sudah memilih K002 sebagai Konselor PAN-JALU dan sudah dua kali asesmen
  const mb2 = insert('users', { role: 'mahasiswa', nim_nip: 'MB002', nama: 'Rizky Pratama', email: 'mb002@panjalu.local', password_hash: pw, university_id: pjUni, prodi_id: pjProdi, angkatan: new Date().getFullYear() - 1, kelas: 'B', gender: 'L', pilih_konselor_pada: daysAgo(6) });
  insert('student_counselors', { student_id: mb2, counselor_id: C.K002, jenis: 'panjalu' });
  insert('consents', { user_id: mb2, jenis_consent: 'akses_konselor_panjalu', disetujui_pada: daysAgo(6), versi_kebijakan: 'v1' });
  { const rand = mulberry32(777); storeAssessment(mb2, makeAnswers(rand, 0.35, 0.7, {}), daysAgo(5)); storeAssessment(mb2, makeAnswers(rand, 0.45, 0.6, {}), daysAgo(1)); }
  insert('messages', { sender_id: mb2, receiver_id: C.K002, isi_teks: enc('Bu, terima kasih sudah mau mendampingi. Kampus saya belum ada konselornya.'), dikirim_pada: daysAgo(0, 9) });

  run('UPDATE users SET email_verified_at = created_at');
}

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

function ensureSeeded({ demo = true } = {}) {
  if (get('SELECT COUNT(*) AS n FROM domains').n > 0) return false;
  tx(() => { seedReference(); if (demo) seedDemo(); });
  return true;
}

// Admin pertama untuk mode produksi (MC_DEMO=0): dibuat dari MC_ADMIN_EMAIL + MC_ADMIN_PASSWORD bila belum ada admin.
function ensureAdmin() {
  if (get("SELECT 1 AS x FROM users WHERE role = 'admin'")) return false;
  const email = String(process.env.MC_ADMIN_EMAIL || '').trim().toLowerCase(); const pw = String(process.env.MC_ADMIN_PASSWORD || '');
  if (!email || pw.length < 10) { console.warn('[admin] Belum ada akun admin. Set MC_ADMIN_EMAIL dan MC_ADMIN_PASSWORD (min. 10 karakter) lalu jalankan ulang server.'); return false; }
  insert('users', { role: 'admin', nim_nip: 'admin', nama: 'Admin PAN-JALU', email, password_hash: hashPassword(pw), email_verified_at: new Date().toISOString() });
  console.log(`[admin] Akun admin dibuat: ${email} (login dengan email atau "admin"). Segera ganti kata sandi di menu Profil.`);
  return true;
}

function resetAll() {
  const tables = all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map((r) => r.name);
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of tables) db.exec(t === 'institution_config' ? "DELETE FROM institution_config WHERE key <> 'schema_version'" : `DELETE FROM ${t}`); // versi skema dipertahankan
  db.exec('PRAGMA foreign_keys = ON');
  void auditDb; // audit log sengaja tidak dihapus (append-only)
}

if (require.main === module) {
  if (process.argv.includes('--reset')) resetAll();
  const demo = !process.argv.includes('--no-demo');
  console.log(ensureSeeded({ demo }) ? `Seed selesai${demo ? ' (dengan data demo, kata sandi: ' + DEMO_PASSWORD + ')' : ''}.` : 'Basis data sudah berisi data; gunakan --reset untuk mengulang.');
}

module.exports = { ensureSeeded, ensureAdmin, resetAll, isoWeek, DEMO_PASSWORD };
