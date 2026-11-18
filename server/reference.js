// Data referensi tunggal — instrumen IKDKM-M dan data master PAN-JALU.

// Instrumen: Inventori Kebutuhan Dukungan Kekuatan Mental Mahasiswa (IKDKM-M) — sintesis konsep Kekuatan Mental William Glasser
// (Positive Addiction 1976; Choice Theory 1998; Reality Therapy 1965/2001; Warning: Psychiatry Can Be Hazardous… 2003).
// Kode V1–V6 dipakai juga sebagai kategori konten psikoedukasi.
// Nama bagian dalam bahasa sehari-hari (tampilan mahasiswa)
const PARTS = {
  fondasi: { nama: 'Pemenuhan 5 Kebutuhan Dasar', istilah: 'Pemenuhan 5 kebutuhan dasar', penjelasan: 'Seberapa terpenuhi lima kebutuhan dasarmu (menurut William Glasser): bertahan hidup, cinta & rasa memiliki, kekuasaan & prestasi, kebebasan, dan kesenangan. Makin terpenuhi, makin kuat mentalmu.' },
  otot: { nama: 'Kendali Diri & Kebiasaan Baik', istilah: 'Kendali diri & kebiasaan baik', penjelasan: 'Kemampuan mengemudikan diri sendiri: tahu tujuan, bertanggung jawab atas pilihan, dan punya kebiasaan baik. Bisa dilatih seperti otot.' },
  total: { nama: 'Indeks Kekuatan Mental', istilah: 'Indeks total', penjelasan: 'Gabungan pemenuhan 5 kebutuhan dasar dan kendali diri (28–112). Makin tinggi, makin tangguh.' },
};
const INSTRUMENT = { kode: 'IKDKM-M', nama: 'Inventori Kebutuhan Dukungan Kekuatan Mental Mahasiswa', periode: '2 minggu terakhir', durasi: '5–7 menit' };
const DIMENSIONS = [
  { kode: 'V1', bagian: 1, nama: 'Survival', mudah: 'Bertahan Hidup (Survival)', penjelasan: 'Kebutuhan fisiologis dan biologis dasar untuk menjaga kelangsungan hidup fisik, seperti makanan, air, udara, kesehatan, keamanan fisik, dan reproduksi.', label: 'Kebutuhan untuk Bertahan Hidup (Survival)', kebutuhan: 'Survival', definisi: 'Kebutuhan fisiologis dan biologis dasar untuk menjaga kelangsungan hidup fisik, seperti makanan, air, udara, kesehatan, keamanan fisik, dan reproduksi.' },
  { kode: 'V2', bagian: 1, nama: 'Love & Belonging', mudah: 'Cinta & Rasa Memiliki (Love and Belonging)', penjelasan: 'Kebutuhan psikologis untuk terhubung dengan orang lain, mencintai dan dicintai, menjalin relasi sosial, serta merasa diterima oleh keluarga, teman, atau kelompok.', label: 'Kebutuhan akan Cinta dan Rasa Memiliki (Love and Belonging)', kebutuhan: 'Love & Belonging', definisi: 'Kebutuhan psikologis untuk terhubung dengan orang lain, mencintai dan dicintai, menjalin relasi sosial, serta merasa diterima oleh keluarga, teman, atau kelompok.' },
  { kode: 'V3', bagian: 1, nama: 'Power', mudah: 'Kekuasaan & Prestasi (Power / Achievement)', penjelasan: 'Kebutuhan untuk merasa berharga, kompeten, berprestasi, memiliki kendali atas hidup sendiri, serta diakui atas kemampuan atau kontribusi yang diberikan.', label: 'Kebutuhan akan Kekuasaan (Power / Achievement)', kebutuhan: 'Power', definisi: 'Kebutuhan untuk merasa berharga, kompeten, berprestasi, memiliki kendali atas hidup sendiri, serta diakui atas kemampuan atau kontribusi yang diberikan.' },
  { kode: 'V4', bagian: 1, nama: 'Freedom', mudah: 'Kebebasan (Freedom)', penjelasan: 'Kebutuhan untuk memiliki otonomi, kemandirian, kebebasan dalam membuat pilihan sendiri, serta bergerak tanpa tekanan atau kontrol berlebihan dari pihak lain.', label: 'Kebutuhan akan Kebebasan (Freedom)', kebutuhan: 'Freedom', definisi: 'Kebutuhan untuk memiliki otonomi, kemandirian, kebebasan dalam membuat pilihan sendiri, serta bergerak tanpa tekanan atau kontrol berlebihan dari pihak lain.' },
  { kode: 'V5', bagian: 1, nama: 'Fun', mudah: 'Kesenangan (Fun)', penjelasan: 'Kebutuhan untuk belajar, bermain, tertawa, dan mencari kegembiraan atau kepuasan dalam hidup sebagai bagian dari pertumbuhan mental.', label: 'Kebutuhan akan Kesenangan (Fun)', kebutuhan: 'Fun', definisi: 'Kebutuhan untuk belajar, bermain, tertawa, dan mencari kegembiraan atau kepuasan dalam hidup sebagai bagian dari pertumbuhan mental.' },
  { kode: 'V6', bagian: 2, nama: 'Kendali Diri', mudah: 'Kendali Diri & Kebiasaan Baik', penjelasan: 'Kemampuan "mengemudikan" dirimu sendiri: tahu tujuan kuliah, bertanggung jawab atas pilihanmu tanpa menyalahkan keadaan, dan punya kebiasaan baik sehingga tidak terjebak menunda-nunda atau overthinking. Ini seperti otot: makin sering dilatih, makin kuat.', label: 'Kendali Diri & Kebiasaan Baik', kebutuhan: 'Quality World, Internal Control & Positive Addiction', definisi: 'Keteguhan visi hidup (Quality World), tanggung jawab kendali internal, kebiasaan positif penguat mental (Positive Addiction), dan penguasaan Total Behavior.' },
];
// Subkomponen Bagian 2 (otot inti)
const SUBCOMPONENTS = [
  { kode: 'QW', nama: 'Tahu tujuan kuliah & hidup', istilah: 'Kejelasan Visi Dunia Kualitas (Quality World)', mudah: 'Tahu tujuan kuliah & hidup' },
  { kode: 'IC', nama: 'Bertanggung jawab atas pilihan sendiri', istilah: 'Kekuatan Kendali Internal (Internal Control)', mudah: 'Bertanggung jawab atas pilihan sendiri' },
  { kode: 'TB', nama: 'Punya kebiasaan baik, tidak mudah menunda', istilah: 'Ketangguhan Perilaku Total & Positive Addiction', mudah: 'Punya kebiasaan baik, tidak terjebak menunda' },
];
// Bagian 3 — kesiapan dukungan penguatan mental (alur intervensi aplikasi)
const SUPPORT = [
  { kode: 'developmental', no: 29, nama: 'Belajar mandiri', mudah: 'Materi bacaan & video tentang menjaga kesehatan mental', layanan: 'Psikoedukasi', tautan: '#/s/psikoedukasi' },
  { kode: 'reflektif', no: 30, nama: 'Refleksi diri', mudah: 'Latihan menenangkan diri & merenung (jurnal, refleksi, relaksasi)', layanan: 'Jurnal Harian, Refleksi GURU & Ruang Mindfulness', tautan: '#/s/relaksasi' },
  { kode: 'kolaboratif', no: 31, nama: 'Dukungan teman', mudah: 'Teman sebaya atau kelompok diskusi', layanan: 'Konselor Sebaya & Grup Diskusi', tautan: '#/s/komunitas' },
  { kode: 'kuratif', no: 32, nama: 'Konseling profesional', mudah: 'Berbicara dengan konselor profesional', layanan: 'Konseling bersama konselor profesional', tautan: '#/s/konseling' },
];

// 32 butir: [no, dimensi (V1–V6 / S = Bagian 3), subkomponen, arah (+/-), indikator, pernyataan, keyword-tagging]
const ITEMS = [
  [1, 'V1', null, '+', 'Mengatur tidur, makan & istirahat', 'Saya bisa mengatur waktu tidur, makan, dan istirahat dengan baik, meskipun jadwal kuliah padat.', ['kekuatan-survival', 'ketahanan-fisik', 'self-care', 'energi-mental']],
  [2, 'V1', null, '+', 'Merasa tenang & aman', 'Dalam keseharian di kampus, saya merasa tenang dan aman.', ['kekuatan-survival', 'rasa-aman', 'ketenangan-mental']],
  [3, 'V1', null, '-', 'Badan & pikiran sangat lelah', 'Saya sering merasa sangat lelah, baik badan maupun pikiran, karena kurang istirahat akibat tugas yang menumpuk.', ['defisit-survival', 'kelelahan-mental', 'insomnia', 'fisik-drop']],
  [4, 'V1', null, '-', 'Sering panik atau merasa tidak aman', 'Akhir-akhir ini, saya sering merasa panik atau tidak aman saat menjalani kuliah.', ['defisit-survival', 'kerapuhan-mental', 'panik', 'krisis-keamanan']],
  [5, 'V2', null, '+', 'Punya hubungan yang hangat', 'Saya punya keluarga atau sahabat yang peduli dan bisa saya andalkan.', ['kekuatan-relasional', 'love-belonging', 'caring-habits', 'support-system']],
  [6, 'V2', null, '+', 'Merasa diterima di komunitas kampus', 'Saya merasa diterima dan dihargai oleh teman-teman di kampus.', ['kekuatan-relasional', 'belongingness', 'keterhubungan-kampus']],
  [7, 'V2', null, '-', 'Merasa kesepian & terasing', 'Saya sering merasa kesepian, seolah tidak ada orang yang benar-benar mengerti saya.', ['defisit-relasional', 'kesepian', 'isolasi-sosial', 'mental-rapuh']],
  [8, 'V2', null, '-', 'Lelah karena konflik dengan orang terdekat', 'Saat ini, masalah dengan orang terdekat (keluarga, pacar, atau teman) membuat saya sangat lelah secara emosi.', ['defisit-relasional', 'konflik-interpersonal', 'terkuras-emosi']],
  [9, 'V3', null, '+', 'Yakin pada kemampuan diri', 'Saya yakin bisa memahami materi kuliah dan menyelesaikan tugas yang sulit.', ['kekuatan-power', 'inner-strength', 'kompetensi-akademik', 'daya-juang']],
  [10, 'V3', null, '+', 'Merasa berharga & bisa berkontribusi', 'Saya merasa usaha saya berguna bagi orang-orang di sekitar saya di kampus.', ['kekuatan-power', 'kebermaknaan-diri', 'self-worth', 'apresiasi']],
  [11, 'V3', null, '-', 'Merasa tidak berdaya & ingin menyerah', 'Saya merasa gagal dan tidak sanggup menghadapi tuntutan kuliah.', ['defisit-power', 'ketidakberdayaan', 'mental-down', 'rasa-gagal']],
  [12, 'V3', null, '-', 'Minder karena membandingkan diri', 'Saya jadi minder saat melihat teman-teman lain lebih berprestasi.', ['defisit-power', 'minder', 'perbandingan-sosial', 'mental-goyah']],
  [13, 'V4', null, '+', 'Berani memilih sendiri', 'Saya bisa mengambil keputusan sendiri tentang kuliah dan hidup saya, sesuai dengan hal yang saya anggap penting.', ['kekuatan-freedom', 'otonomi-mental', 'kemandirian-pilihan']],
  [14, 'V4', null, '+', 'Bebas menjadi diri sendiri', 'Saya berani menyampaikan pendapat dan menjadi diri sendiri, tanpa terlalu takut dinilai orang lain.', ['kekuatan-freedom', 'asertivitas', 'keautentikan-mental']],
  [15, 'V4', null, '-', 'Merasa dipaksa atau ditekan pihak lain', 'Saya merasa kuliah dan hidup saya lebih banyak diatur oleh orang lain daripada oleh diri saya sendiri.', ['defisit-freedom', 'tekanan-koersif', 'kehilangan-kendali-hidup']],
  [16, 'V4', null, '-', 'Merasa terjebak rutinitas (jenuh)', 'Saya merasa terjebak dalam rutinitas kuliah dan tidak punya waktu atau ruang untuk diri sendiri.', ['defisit-freedom', 'burnout-rutinitas', 'mental-terkekang']],
  [17, 'V5', null, '+', 'Bisa pulih lewat hal yang menggembirakan', 'Saya masih bisa menemukan hal yang menyenangkan saat belajar di kampus.', ['kekuatan-fun', 'joyful-learning', 'resiliensi-humor']],
  [18, 'V5', null, '+', 'Seimbang antara kuliah & rekreasi', 'Saya sengaja meluangkan waktu untuk hobi atau hiburan yang sehat setelah lelah belajar.', ['kekuatan-fun', 'rekreasi-sehat', 'pengisian-energi-mental']],
  [19, 'V5', null, '-', 'Hilang minat, hal menyenangkan terasa hambar', 'Saya tidak lagi menikmati hal-hal yang dulu membuat saya senang.', ['defisit-fun', 'anhedonia', 'kejenuhan-mental-akut']],
  [20, 'V5', null, '-', 'Lari ke pelarian berlebihan (HP/game)', 'Saat lelah atau stres, saya sering kabur ke HP (scrolling media sosial atau main game) sampai lupa waktu dan menunda tugas.', ['defisit-fun', 'negative-addiction', 'escapism', 'pelarian-impulsif']],
  [21, 'V6', 'QW', '+', 'Punya tujuan hidup yang jelas', 'Saya tahu dengan jelas apa tujuan saya kuliah dan apa yang ingin saya capai.', ['kekuatan-quality-world', 'kejelasan-visi', 'jangkar-mental']],
  [22, 'V6', 'QW', '-', 'Bingung arah & tujuan', 'Saya bingung sebenarnya untuk apa saya kuliah.', ['defisit-quality-world', 'krisis-tujuan', 'disorientasi-mental']],
  [23, 'V6', 'IC', '+', 'Bertanggung jawab atas pilihan sendiri', 'Saya bertanggung jawab atas pilihan dan tindakan saya sendiri, tanpa menyalahkan keadaan.', ['internal-control', 'tanggung-jawab-mental', 'choice-theory']],
  [24, 'V6', 'IC', '-', 'Merasa jadi korban keadaan', 'Saat gagal atau tertekan, saya merasa semua itu terjadi karena orang lain atau keadaan yang tidak adil.', ['external-control', 'victim-mentality', 'kelemahan-agensi-diri']],
  [25, 'V6', 'IC', '-', 'Mudah marah, menyalahkan & mengkritik diri', 'Saat tertekan, saya cenderung menyalahkan diri sendiri secara berlebihan, banyak mengeluh, atau menjauh dari orang lain.', ['self-criticism', '7-deadly-habits', 'pelemahan-mental-internal']],
  [26, 'V6', 'TB', '+', 'Bisa menilai diri & punya kebiasaan baik', 'Saya punya kebiasaan baik setiap hari (misalnya olahraga, merenung, atau berkarya) yang membantu saya tetap kuat.', ['positive-addiction', 'self-evaluation', 'WDEP', 'otot-mental']],
  [27, 'V6', 'TB', '-', 'Sering menunda & terlalu banyak berpikir', 'Saat tugas kuliah menumpuk, saya sering menunda-nunda dan malah terus memikirkan hal-hal negatif.', ['ineffective-total-behavior', 'prokrastinasi', 'overthinking', 'lumpuh-tindakan']],
  [28, 'V6', 'TB', '-', 'Emosi runtuh & badan ikut sakit', 'Masalah yang saya hadapi sekarang membuat saya sangat sedih, putus asa, panik, atau sering sakit badan tanpa sebab yang jelas.', ['runtuh-kekuatan-mental', 'depressing', 'panik', 'psikosomatis']],
  [29, 'S', 'developmental', '+', 'Butuh materi untuk menjaga kesehatan mental', 'Saya butuh informasi atau materi praktis tentang cara menjaga kesehatan mental saya sendiri.', ['dukungan-developmental', 'rekomendasi-psikoedukasi', 'literasi-kekuatan-mental']],
  [30, 'S', 'reflektif', '+', 'Butuh latihan menenangkan diri & refleksi', 'Saya butuh sarana untuk berlatih menenangkan diri dan merenung, seperti jurnal harian atau latihan relaksasi.', ['dukungan-reflektif', 'jurnal-harian', 'refleksi-GURU', 'ruang-mindfulness']],
  [31, 'S', 'kolaboratif', '+', 'Butuh dukungan teman sebaya', 'Saya butuh teman sebaya atau kelompok diskusi yang bisa mendukung saya saat sedang lelah.', ['dukungan-kolaboratif', 'konselor-sebaya', 'grup-diskusi', 'penguatan-sosial']],
  [32, 'S', 'kuratif', '+', 'Butuh konseling dengan konselor profesional', 'Masalah saya terasa terlalu berat untuk saya hadapi sendiri, dan saya ingin berbicara dengan konselor.', ['dukungan-kuratif', 'reservasi-konseling', 'bantuan-ahli', 'reality-therapy']],
];
const itemObj = ([no, dimensi, sub, arah, indikator, teks, kata_kunci]) => ({ no, bagian: dimensi === 'S' ? 3 : dimensi === 'V6' ? 2 : 1, dimensi, sub, arah, indikator, teks, kata_kunci });
const ITEM_LIST = ITEMS.map(itemObj);

// Skala Likert 4 titik (BAB V–VI). Favorable: SS=4…STS=1; Unfavorable dibalik: SS=1…STS=4.
const SCALE = [['SS', 'Sangat Sesuai'], ['S', 'Sesuai'], ['TS', 'Tidak Sesuai'], ['STS', 'Sangat Tidak Sesuai']];
const INSTRUCTIONS = {
  petunjuk: 'Bacalah setiap pernyataan, lalu pilih jawaban yang paling sesuai dengan keadaanmu dalam 2 minggu terakhir: SS (Sangat Sesuai), S (Sesuai), TS (Tidak Sesuai), atau STS (Sangat Tidak Sesuai). Tidak ada jawaban benar atau salah. Jawablah sesuai yang benar-benar kamu rasakan, bukan yang menurutmu seharusnya. Jawabanmu dijaga kerahasiaannya dan hanya dipakai untuk memberi saran dukungan yang cocok untukmu.',
  krisis: 'Jika saat ini kamu merasa sangat tertekan atau terpikir untuk menyakiti diri sendiri, jangan menunggu hasil inventori ini. Segera hubungi konselor kampus melalui menu Konseling.',
};
// Persetujuan penggunaan data (bukan butir instrumen)
const CONSENT = {
  a: 'Saya telah membaca penjelasan tentang data apa yang dikumpulkan aplikasi dan bagaimana data itu digunakan.',
  b: 'Saya bersedia jawaban saya dipakai sebagai konteks oleh fitur bantu AI konselor (selalu ditinjau konselor).',
  c: 'Jika saya membutuhkan bantuan segera, saya setuju dihubungi konselor.',
};

// 6.2 Norma kategorisasi
const NORMS = {
  dimensi: { min: 4, max: 16, batas: [[13, 'Kuat', 'Terpenuhi dengan baik'], [8, 'Rentan', 'Mulai melemah / naik-turun'], [4, 'Lemah', 'Sedang sangat kurang terpenuhi']] },
  fondasi: { min: 20, max: 80, batas: [[61, 'Kuat', 'Kebutuhan dasar terpenuhi dengan baik'], [40, 'Rentan', 'Sebagian kebutuhan dasar belum terpenuhi'], [20, 'Lemah', 'Banyak kebutuhan dasar belum terpenuhi']] },
  otot: { min: 8, max: 32, batas: [[25, 'Kuat', 'Kendali diri & kebiasaan baik sudah kuat'], [16, 'Rentan', 'Kendali diri masih mudah goyah'], [8, 'Lemah', 'Mudah terbawa keadaan & sulit memulai']] },
  total: { min: 28, max: 112, batas: [[85, 'Tangguh', 'Mental Tangguh', 'Cukup belajar mandiri (psikoedukasi)'], [56, 'Rentan', 'Mental Rentan', 'Latihan refleksi diri & dukungan teman'], [28, 'Krisis', 'Mental Krisis', 'Didampingi konselor secara intensif']] },
};
// 6.3 Ambang pelemahan & klaim interpretasi berbasis Glasser
const WEAKNESS = {
  V1: { ambang: 12, nama: 'Energi dasar terkuras', klaim: 'Kekuatan mental mahasiswa melemah karena tubuh kelelahan (kurang tidur/makan teratur) atau rasa cemas dan tidak aman yang menguras energi dasarnya.' },
  V2: { ambang: 12, nama: 'Hubungan dengan orang lain merenggang', klaim: 'Kekuatan mental mahasiswa menurun karena kurang hubungan yang hangat (kesepian, merasa terasing) atau sering terlibat konflik dengan cara saling menyalahkan, mengkritik, atau mengancam (Glasser, 2003).' },
  V3: { ambang: 12, nama: 'Rasa mampu & daya juang menurun', klaim: 'Mahasiswa merasa tidak berdaya dan kurang mampu, minder karena membandingkan diri dengan orang lain, dan mulai kehilangan keyakinan pada kemampuannya.' },
  V4: { ambang: 12, nama: 'Merasa kurang bebas memilih', klaim: 'Kekuatan mental mahasiswa terkikis karena merasa diatur atau dipaksa pihak lain, atau terjebak rutinitas kuliah sehingga merasa tidak punya pilihan sendiri.' },
  V5: { ambang: 12, nama: 'Kurang kegembiraan & mudah lari ke pelarian', klaim: 'Mahasiswa kehilangan rasa senang (hal yang dulu menyenangkan terasa hambar) atau energinya terkuras oleh pelarian yang berlebihan, misalnya media sosial atau game.' },
  V6: { ambang: 24, nama: 'Kendali diri sedang goyah', klaim: 'Mahasiswa sedang sulit mengendalikan diri: merasa jadi korban keadaan, terlalu keras mengkritik diri, sering menunda, sampai muncul keluhan fisik karena tekanan pikiran.' },
};
// Bahasa ramah konseli untuk pelemahan yang sama
const WEAKNESS_STUDENT = {
  V1: 'Energi dasarmu sedang terkuras — bisa karena kurang tidur/istirahat atau rasa cemas dan tidak aman.',
  V2: 'Kebutuhanmu akan koneksi yang hangat sedang belum terpenuhi — bisa karena merasa kesepian atau lelah oleh konflik dengan orang terdekat.',
  V3: 'Keyakinan pada kemampuan dirimu sedang goyah — misalnya merasa gagal atau minder dibandingkan teman.',
  V4: 'Rasa memegang kendali atas pilihan hidupmu sedang berkurang — misalnya merasa diatur orang lain atau terjebak rutinitas.',
  V5: 'Daya pulihmu lewat kegembiraan sedang menurun — misalnya hal-hal yang dulu menyenangkan terasa hambar, atau mudah lari ke HP/game.',
  V6: 'Kemudi internalmu sedang goyah — misalnya bingung arah, menyalahkan diri/keadaan, menunda-nunda, atau tubuh ikut terasa tidak enak.',
};
// Analisis kuadran: Indeks Kekuatan Mental (Tangguh vs belum) × Kesiapan Dukungan Bagian 3 (≥ 2 butir SS/S)
const QUADRANTS = {
  tangguh_mandiri: { nama: 'Tangguh & Mandiri', makna: 'Mental tangguh dan belum merasa butuh dukungan. Pertahankan lewat psikoedukasi dan kebiasaan positif.' },
  tangguh_bertumbuh: { nama: 'Tangguh & Ingin Bertumbuh', makna: 'Mental tangguh dan terbuka pada dukungan untuk tumbuh lebih jauh.' },
  rentan_tersembunyi: { nama: 'Rentan Tersembunyi', makna: 'Kekuatan mental belum tangguh, tetapi belum merasa butuh dukungan. Perlu sapaan proaktif konselor.' },
  siap_dibantu: { nama: 'Rentan & Siap Dibantu', makna: 'Kekuatan mental belum tangguh dan siap menerima dukungan. Prioritaskan layanan.' },
};

// Daftar keyword-tagging (dari butir) untuk menandai konten psikoedukasi
const KEYWORDS = [...new Map(ITEM_LIST.flatMap((i) => i.kata_kunci).map((k) => [k.toLowerCase(), k])).values()].sort((a, b) => a.localeCompare(b, 'id'));

// Refleksi GURU (Reflektif / Positive Addiction) — terintegrasi pada setiap konten psikoedukasi
const GURU_STAGES = [
  { kode: 'ground', nama: 'Ground', makna: 'Kondisi dasarmu menurut hasil asesmen', tanya: 'Bagaimana kondisi dasarmu saat ini? Kolom ini sudah diisi otomatis dari hasil asesmen terakhirmu; tambahkan atau ubah bila perlu.' },
  { kode: 'understand', nama: 'Understand', makna: 'Pemahaman dari konten yang kamu akses', tanya: 'Konten yang kamu akses ini menambah pemahamanmu tentang apa?' },
  { kode: 'revise', nama: 'Revise', makna: 'Hal yang perlu direvisi dari keadaanmu sekarang', tanya: 'Apa yang mesti kamu revisi (ubah) dari keadaanmu sekarang?' },
  { kode: 'use', nama: 'Use', makna: 'Rencana tindakan & komitmen', tanya: 'Apa rencana tindakanmu dan komitmen apa yang kamu buat?' },
];
// Refleksi kinerja konselor (model GURU)
const COUNSELOR_GURU = [
  { kode: 'ground', nama: 'Ground', tanya: 'Keadaan apa yang dirasa perlu diperbaiki?' },
  { kode: 'understand', nama: 'Understand', tanya: 'Bagaimana pemahaman Anda dan upaya untuk memahami lebih lanjut keadaan pada tahap Ground?' },
  { kode: 'revise', nama: 'Revise', tanya: 'Apa saja yang perlu diubah dari kinerja Anda dalam memberikan layanan kepada mahasiswa?' },
  { kode: 'use', nama: 'Use', tanya: 'Apa rencana ke depan dan komitmen Anda?' },
];
const GURU = {
  V1: { judul: 'Menguatkan Kebutuhan Bertahan Hidup', contoh: 'Contoh: tidur sebelum pukul 23.00 lima malam minggu ini dan makan siang tepat waktu.' },
  V2: { judul: 'Menguatkan Cinta & Rasa Memiliki', contoh: 'Contoh: menyapa satu teman dan mendengarkan tanpa mengkritik atau menyalahkan.' },
  V3: { judul: 'Menguatkan Rasa Mampu & Berprestasi', contoh: 'Contoh: memecah tugas besar jadi 3 langkah dan merayakan langkah pertama.' },
  V4: { judul: 'Menguatkan Kebebasan Memilih', contoh: 'Contoh: menyampaikan pendapatku dengan sopan di kelompok dan menyisihkan 30 menit untuk diriku sendiri.' },
  V5: { judul: 'Menguatkan Kesenangan & Kegembiraan', contoh: 'Contoh: ganti scrolling malam dengan 20 menit hobi yang sehat.' },
  V6: { judul: 'Menguatkan Kemudi Internal', contoh: 'Contoh: setiap malam bertanya "Apa yang kulakukan hari ini menguatkan atau melemahkanku?" (WDEP).' },
  UMUM: { judul: 'Menguatkan Kekuatan Mental', contoh: 'Contoh: memilih satu kebiasaan positif kecil dan melakukannya setiap hari selama seminggu.' },
};

// Topik masalah konseling (+ "Lainnya" diisi sendiri), terhubung ke dimensi untuk saran intervensi
const COUNSELING_TOPICS = [
  ['Kelelahan, tidur & rasa aman', 'V1'], ['Kesepian & penyesuaian di kampus', 'V2'], ['Relasi, keluarga & pertemanan', 'V2'],
  ['Akademik, rasa gagal & percaya diri', 'V3'], ['Tekanan, kemandirian & pilihan studi', 'V4'], ['Kejenuhan, hobi & kecanduan gawai/game', 'V5'],
  ['Tujuan kuliah & arah hidup', 'V6'], ['Prokrastinasi, overthinking & mengkritik diri', 'V6'],
  ['Keselamatan diri / krisis', null], ['Lainnya', null],
];

// Format & kategori konten psikoedukasi
const CONTENT_TYPES = { artikel: 'Artikel singkat', video: 'Video', podcast: 'Podcast', infografis: 'Infografis/poster', slide: 'Slide presentasi', bibliokonseling: 'Cerita penyembuhan/bibliokonseling' };
const CONTENT_CATEGORIES = [...DIMENSIONS.map((d) => ({ kode: d.kode, label: d.mudah })), { kode: 'UMUM', label: 'Layanan & Bantuan' }];

const PRODI = [
  ['FKIP', 'Fakultas Keguruan dan Ilmu Pendidikan', [['Bimbingan dan Konseling', 'S1'], ['Pendidikan Sejarah', 'S1'], ['PPKn', 'S1'], ['Pendidikan Bahasa dan Sastra Indonesia', 'S1'], ['Pendidikan Bahasa Inggris', 'S1'], ['PGSD', 'S1'], ['PGPAUD', 'S1'], ['Pendidikan Matematika', 'S1'], ['Pendidikan Biologi', 'S1'], ['Pendidikan Ekonomi', 'S1'], ['Pendidikan Jasmani, Kesehatan & Rekreasi', 'S1']]],
  ['FEB', 'Fakultas Ekonomi dan Bisnis', [['Manajemen', 'S1'], ['Akuntansi', 'S1']]],
  ['FTIK', 'Fakultas Teknik dan Ilmu Komputer', [['Teknik Mesin', 'S1'], ['Teknik Informatika', 'S1'], ['Sistem Informasi', 'S1'], ['Teknik Industri', 'D3'], ['Teknik Elektro/Elektronika', 'D3']]],
  ['FIKS', 'Fakultas Ilmu Kesehatan dan Sains', [['Peternakan', 'S1'], ['Keperawatan', 'D3'], ['Kebidanan', 'D3']]],
  ['PASCA', 'Pascasarjana & Profesi', [['Keguruan Olahraga', 'S2'], ['Pendidikan Ekonomi', 'S2'], ['Pendidikan Profesi Guru (PPG)', 'Profesi']]],
];

// Latihan napas terpandu (berbasis literatur). fase: [label, detik, target ukuran 0–1 (opsional)] — rasio ditulis Tarik-Tahan-Hembus-Tahan
const BREATHING = {
  '4-7-8': { nama: 'Napas 4-7-8', tujuan: 'Bantu tidur & redakan cemas', rasio: '4 – 7 – 8 – 0', fokus: 'Menghilangkan insomnia dan kecemasan menjelang tidur malam.', sumber: 'Vierra et al., 2022', siklus: 4,
    fase: [['Tarik napas', 4], ['Tahan', 7], ['Hembuskan', 8]] },
  box: { nama: 'Box Breathing', tujuan: 'Atasi panik & stabilkan emosi', rasio: '4 – 4 – 4 – 4', fokus: 'Mengatasi kepanikan akut dan menjaga kestabilan emosi di situasi penuh tekanan.', sumber: 'Russo et al., 2017', siklus: 4,
    fase: [['Tarik napas', 4], ['Tahan', 4], ['Hembuskan', 4], ['Tahan', 4]] },
  resonant: { nama: 'Resonant Breathing', tujuan: 'Turunkan stres kronis', rasio: '5 – 0 – 5 – 0', fokus: 'Memperbaiki vagal tone jangka panjang dan menurunkan stres kronis (± 6 napas per menit).', sumber: 'McCraty & Zayas, 2014; Zaccaro et al., 2018', siklus: 12,
    fase: [['Tarik napas', 5], ['Hembuskan', 5]] },
  cyclic: { nama: 'Cyclic Sighing', tujuan: 'Reset instan saat berdebar', rasio: 'Tarik penuh + tarik singkat – hembus panjang', fokus: 'Tombol reset instan untuk menurunkan detak jantung yang berdebar kencang saat cemas.', sumber: 'Balban et al., 2023', siklus: 6,
    fase: [['Tarik napas penuh (hidung)', 3, 0.8], ['Tarik singkat lagi (hidung)', 1, 1], ['Hembuskan panjang (mulut)', 6, 0]] },
};

// Rekomendasi program layanan kampus per dimensi yang melemah (laporan komunal)
const SERVICE_RECS = {
  V1: [['Workshop', 'Manajemen energi: tidur, nutrisi, istirahat & rasa aman di tengah jadwal padat']],
  V2: [['Kelompok', 'Grup dukungan sebaya & latihan 7 Caring Habits untuk mengatasi kesepian']],
  V3: [['Webinar', 'Membangun inner strength: dari rasa gagal & minder menuju daya juang']],
  V4: [['Workshop', 'Otonomi & asertivitas: memilih jalan belajar dan berekspresi secara autentik']],
  V5: [['Pelatihan', 'Kebiasaan positif vs kecanduan negatif: hobi sehat & detoks HP/game']],
  V6: [['Pelatihan', 'Kendali internal (Choice Theory & WDEP): mengatasi prokrastinasi, overthinking & kritik diri']],
};

// Label bahasa sehari-hari untuk tag kata kunci konten (nilai asli tetap dipakai untuk pencocokan)
const KW_WORD = {
  survival: 'bertahan hidup', relasional: 'hubungan dengan orang lain', power: 'rasa mampu', freedom: 'kebebasan', fun: 'kesenangan', 'quality-world': 'tujuan hidup',
  developmental: 'materi belajar mandiri', reflektif: 'latihan refleksi diri', kolaboratif: 'dukungan teman', kuratif: 'konseling profesional',
};
const KW_LABEL = {
  '7-deadly-habits': 'kebiasaan yang merusak hubungan', anhedonia: 'hilang rasa senang', belongingness: 'rasa diterima', 'burnout-rutinitas': 'jenuh rutinitas', 'caring-habits': 'kebiasaan saling peduli',
  'choice-theory': 'teori pilihan (Glasser)', depressing: 'murung berkepanjangan', 'disorientasi-mental': 'bingung arah', escapism: 'lari dari masalah', 'external-control': 'mudah dikendalikan keadaan',
  'fisik-drop': 'fisik menurun', 'ineffective-total-behavior': 'cara bertindak kurang efektif', 'inner-strength': 'kekuatan dari dalam diri', 'internal-control': 'kendali diri', 'joyful-learning': 'belajar yang menyenangkan',
  'love-belonging': 'cinta & rasa memiliki', 'negative-addiction': 'kecanduan negatif (HP/game)', 'otot-mental': 'kekuatan mental', 'positive-addiction': 'kebiasaan positif', 'reality-therapy': 'konseling realitas',
  'self-care': 'merawat diri', 'self-criticism': 'terlalu keras pada diri', 'self-evaluation': 'menilai diri sendiri', 'self-worth': 'harga diri', 'support-system': 'orang-orang pendukung', 'victim-mentality': 'merasa jadi korban',
  WDEP: 'langkah WDEP (keinginan, tindakan, evaluasi, rencana)', 'kelemahan-agensi-diri': 'kurang kendali atas diri', 'tekanan-koersif': 'tekanan/paksaan dari luar', overthinking: 'terlalu banyak berpikir', prokrastinasi: 'menunda-nunda',
  psikosomatis: 'keluhan fisik karena stres', 'resiliensi-humor': 'bangkit lewat humor', 'pelarian-impulsif': 'pelarian sesaat', 'refleksi-GURU': 'refleksi GURU', 'literasi-kekuatan-mental': 'pengetahuan kekuatan mental',
  'pelemahan-mental-internal': 'pelemahan dari dalam diri', 'runtuh-kekuatan-mental': 'kekuatan mental runtuh', 'lumpuh-tindakan': 'sulit mulai bertindak', 'terkuras-emosi': 'emosi terkuras',
};
function kwLabel(k) {
  if (KW_LABEL[k]) return KW_LABEL[k];
  const m = /^(defisit|kekuatan|dukungan)-(.+)$/.exec(k);
  if (m && KW_WORD[m[2]]) return { defisit: `kurang ${KW_WORD[m[2]]}`, kekuatan: `${KW_WORD[m[2]]} kuat`, dukungan: `butuh ${KW_WORD[m[2]]}` }[m[1]];
  return String(k).replace(/-/g, ' ');
}

// Ganti tag mentah di teks alasan ("cocok dengan: a, b") dengan label sehari-hari
const plainReason = (t) => String(t || '').replace(/cocok dengan: ([^.]+)\./, (_, l) => `cocok dengan: ${l.split(/,\s*/).map(kwLabel).join(', ')}.`);

module.exports = { kwLabel, plainReason, COUNSELOR_GURU, PARTS, INSTRUMENT, DIMENSIONS, SUBCOMPONENTS, SUPPORT, ITEMS: ITEM_LIST, SCALE, INSTRUCTIONS, CONSENT, NORMS, WEAKNESS, WEAKNESS_STUDENT, QUADRANTS, KEYWORDS, GURU, GURU_STAGES, COUNSELING_TOPICS, CONTENT_TYPES, CONTENT_CATEGORIES, PRODI, BREATHING, SERVICE_RECS };
