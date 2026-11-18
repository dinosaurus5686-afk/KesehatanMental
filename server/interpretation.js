// Interpretasi hasil IKDKM-M untuk mahasiswa — disusun dari aturan & pustaka kalimat tetap (bukan AI, bukan diagnosis).
// Setiap bagian punya kalimat untuk 3 status (Kuat / Rentan / Lemah) dan kaitan dengan 5 sisi kehidupan.
const { DIMENSIONS } = require('./reference');

const AREAS = [
  { kode: 'sosial', nama: 'Sosial', ikon: '👥' },
  { kode: 'akademik', nama: 'Akademik', ikon: '📚' },
  { kode: 'karier', nama: 'Karier', ikon: '💼' },
  { kode: 'teknologi', nama: 'Teknologi & AI', ikon: '🤖' },
  { kode: 'pribadi', nama: 'Individu/Pribadi', ikon: '🌱' },
];

const STATUS = {
  Kuat: { label: 'Kuat', ikon: '🟢', nada: 'ok' },
  Rentan: { label: 'Mulai melemah', ikon: '🟡', nada: 'warn' },
  Lemah: { label: 'Sedang lemah', ikon: '🔴', nada: 'crit' },
};

// Pustaka kalimat per bagian: makna per status, saran, dan kaitan kehidupan (kuat / perlu dikuatkan)
const LIB = {
  V1: {
    ikon: '🛡️', warna: 'amber',
    makna: {
      Kuat: 'Kebutuhan dasar tubuhmu (makan, istirahat, kesehatan) cukup terjaga dan kamu merasa aman. Ini modal energi untuk menjalani hari.',
      Rentan: 'Kebutuhan dasar tubuhmu mulai terabaikan: kurang tidur, makan tidak teratur, atau rasa cemas dan tidak aman mulai muncul.',
      Lemah: 'Tubuhmu sedang sangat lelah dan rasa tidak aman cukup sering muncul. Makan, istirahat, dan kesehatanmu butuh perhatian segera.',
    },
    coba: { kuat: 'Pertahankan jam tidur yang teratur, walau sedang banyak tugas.', lemah: 'Mulai dari satu hal: tidur sebelum pukul 23.00 tiga malam minggu ini, dan jangan lewatkan makan siang.' },
    hidup: {
      sosial: ['Kamu punya cukup energi untuk hadir bersama teman.', 'Saat lelah, kamu bisa jadi mudah tersinggung atau menarik diri dari teman.'],
      akademik: ['Fokus belajarmu terbantu karena badan cukup istirahat.', 'Kurang tidur membuat konsentrasi dan daya ingat saat kuliah menurun.'],
      karier: ['Kebiasaan menjaga energi adalah bekal penting di dunia kerja kelak.', 'Pola begadang yang dibiasakan sekarang bisa terbawa sampai dunia kerja.'],
      teknologi: ['Kamu cukup mampu membatasi layar sebelum tidur.', 'Main HP sampai larut malam bisa membuat tidurmu makin berantakan.'],
      pribadi: ['Kamu cukup peduli pada tubuhmu sendiri.', 'Rasa cemas dan lelah membuat hari terasa berat. Wajar, dan bisa dipulihkan.'],
    },
  },
  V2: {
    ikon: '❤️', warna: 'pink',
    makna: {
      Kuat: 'Kamu merasa dicintai, punya orang-orang yang peduli, dan diterima oleh keluarga, teman, atau kelompok di kampus.',
      Rentan: 'Hubunganmu dengan orang sekitar mulai terasa renggang atau melelahkan.',
      Lemah: 'Kamu sedang sering merasa sendirian, atau lelah karena masalah dengan orang terdekat.',
    },
    coba: { kuat: 'Jaga hubungan baikmu: sapa satu teman atau anggota keluarga minggu ini.', lemah: 'Hubungi satu orang yang kamu percaya, atau gabung grup diskusi di menu Komunitas.' },
    hidup: {
      sosial: ['Kamu cukup mudah merasa menjadi bagian dari kelompok.', 'Rasa kesepian bisa membuatmu enggan ikut kegiatan kampus.'],
      akademik: ['Teman belajar dan dukungan keluarga membuat kuliahmu lebih ringan.', 'Tanpa teman berbagi, tugas kelompok dan kuliah bisa terasa lebih berat.'],
      karier: ['Kemampuan menjalin hubungan adalah modal jejaring karier.', 'Membangun relasi sejak kuliah membantu peluang karier kelak. Bisa dimulai pelan-pelan.'],
      teknologi: ['Kamu memakai media sosial untuk tetap terhubung, bukan sekadar membandingkan diri.', 'Bercerita hanya kepada chatbot AI atau media sosial tidak bisa menggantikan kehangatan teman nyata.'],
      pribadi: ['Kamu merasa dihargai dan diterima.', 'Merasa tidak dimengerti itu berat. Kamu tidak harus menanggungnya sendirian.'],
    },
  },
  V3: {
    ikon: '🏆', warna: 'violet',
    makna: {
      Kuat: 'Kamu merasa berharga dan mampu, yakin bisa berprestasi, dan merasa usahamu dihargai orang lain.',
      Rentan: 'Rasa mampu dan berhargamu mulai goyah, misalnya saat nilai turun atau melihat teman lebih unggul.',
      Lemah: 'Kamu sedang sering merasa gagal atau tidak sanggup. Perasaan ini bisa berubah lewat langkah-langkah kecil.',
    },
    coba: { kuat: 'Bagikan semangatmu: bantu teman yang sedang kesulitan belajar.', lemah: 'Pecah tugas besar jadi 3 langkah kecil, selesaikan satu, lalu beri dirimu apresiasi.' },
    hidup: {
      sosial: ['Kamu berani berkontribusi di kelompok.', 'Membandingkan diri dengan teman bisa membuatmu minder di pergaulan.'],
      akademik: ['Kamu tidak mudah menyerah pada materi yang sulit.', 'Saat merasa tidak mampu, menunda tugas jadi lebih mudah terjadi.'],
      karier: ['Keyakinan diri membuatmu berani mencoba magang, lomba, atau organisasi.', 'Rasa minder bisa membuatmu ragu mendaftar magang atau mencoba kesempatan baru.'],
      teknologi: ['Kamu memakai AI sebagai alat bantu dan tetap yakin pada kemampuanmu sendiri.', 'Melihat pencapaian orang di media sosial, atau terlalu bergantung pada AI, bisa membuatmu merasa kurang mampu.'],
      pribadi: ['Kamu menghargai usahamu sendiri.', 'Kamu lebih dari sekadar nilai. Setiap kemajuan kecil tetap berarti.'],
    },
  },
  V4: {
    ikon: '🕊️', warna: 'teal',
    makna: {
      Kuat: 'Kamu cukup mandiri: bisa membuat pilihan sendiri dan berani menjadi dirimu tanpa tekanan berlebihan.',
      Rentan: 'Kamu mulai merasa banyak hal diatur orang lain, atau terjebak rutinitas.',
      Lemah: 'Kamu sedang merasa kuliah dan hidupmu banyak ditentukan orang lain, dan hampir tidak punya ruang untuk diri sendiri.',
    },
    coba: { kuat: 'Gunakan kebebasanmu dengan bijak: tetapkan satu tujuan pribadi semester ini.', lemah: 'Sisihkan 30 menit sehari untuk dirimu, dan latih menyampaikan pendapat dengan sopan.' },
    hidup: {
      sosial: ['Kamu berani berpendapat tanpa takut dinilai.', 'Kamu mungkin sering mengikuti kemauan orang lain agar diterima.'],
      akademik: ['Kamu bisa memilih cara belajar yang cocok untukmu.', 'Rutinitas kuliah yang padat bisa terasa seperti penjara.'],
      karier: ['Kamu cukup jelas memilih arah yang kamu mau.', 'Pilihan jurusan atau karier yang terasa "dipilihkan" bisa mengurangi semangat. Bicarakan pelan-pelan dengan keluarga atau konselor.'],
      teknologi: ['Kamu yang mengatur HP dan aplikasi, bukan sebaliknya.', 'Notifikasi dan tuntutan untuk selalu online bisa membuatmu merasa tidak punya waktu sendiri.'],
      pribadi: ['Kamu merasa memegang kendali atas hidupmu.', 'Kamu berhak punya ruang untuk dirimu sendiri.'],
    },
  },
  V5: {
    ikon: '🎉', warna: 'green',
    makna: {
      Kuat: 'Kamu masih bisa menikmati belajar, bermain, dan tertawa, serta mengisi ulang energi lewat hal yang menyenangkan.',
      Rentan: 'Rasa senangmu mulai berkurang, atau kamu mudah lari ke HP dan game saat lelah.',
      Lemah: 'Banyak hal terasa hambar, atau kamu sering lari ke HP dan game sampai lupa waktu.',
    },
    coba: { kuat: 'Pertahankan hobi sehatmu sebagai cara mengisi energi.', lemah: 'Ganti 30 menit scrolling dengan satu kegiatan menyenangkan: jalan sore, olahraga ringan, musik, atau menggambar.' },
    hidup: {
      sosial: ['Kamu bisa tertawa dan bersenang-senang bersama teman.', 'Saat semua terasa hambar, kamu mungkin jadi jarang ikut kegiatan bersama teman.'],
      akademik: ['Belajar masih terasa menarik bagimu.', 'Belajar terasa membosankan, dan tugas jadi mudah tertunda.'],
      karier: ['Hobi dan minatmu bisa menjadi petunjuk arah karier.', 'Kehilangan minat bisa membuatmu sulit melihat apa yang sebenarnya kamu sukai untuk masa depan.'],
      teknologi: ['Kamu memakai gawai untuk hiburan secukupnya.', 'Scrolling atau game berlebihan memberi senang sesaat, tetapi membuatmu makin lelah.'],
      pribadi: ['Kamu tahu cara menyenangkan dirimu dengan sehat.', 'Wajar merasa jenuh. Kegembiraan bisa dibangun lagi sedikit demi sedikit.'],
    },
  },
  V6: {
    ikon: '🧠', warna: 'blue',
    makna: {
      Kuat: 'Kamu tahu tujuanmu, bertanggung jawab atas pilihanmu, dan punya kebiasaan baik.',
      Rentan: 'Kendali dirimu mulai goyah: kadang bingung arah, menyalahkan keadaan, atau menunda-nunda.',
      Lemah: 'Kamu sedang kesulitan mengendalikan diri: bingung tujuan, banyak menunda dan overthinking, bahkan tubuh ikut terasa tidak enak.',
    },
    coba: { kuat: 'Pertahankan satu kebiasaan baik setiap hari, lalu tanyakan tiap malam: "Apa yang hari ini menguatkanku?"', lemah: 'Setiap malam, tanyakan pada dirimu: "Apa yang kulakukan hari ini menguatkan atau melemahkanku?" Lalu pilih satu langkah kecil untuk besok.' },
    hidup: {
      sosial: ['Kamu bisa mengakui kesalahan tanpa menyalahkan orang lain.', 'Saat tertekan, menyalahkan orang lain atau diri sendiri bisa merusak hubungan.'],
      akademik: ['Kamu tahu untuk apa kuliah dan bisa mengatur waktu belajar.', 'Menunda dan overthinking membuat tugas makin menumpuk.'],
      karier: ['Tujuan yang jelas memudahkanmu menyusun rencana karier.', 'Bingung tujuan kuliah membuat rencana masa depan terasa kabur. Konselor bisa membantu memetakannya.'],
      teknologi: ['Kamu memakai teknologi dan AI secara sadar untuk tujuanmu.', 'HP dan AI bisa jadi tempat lari dari tugas. Pakai sebagai alat bantu, bukan pelarian.'],
      pribadi: ['Kamu merasa menjadi "pengemudi" hidupmu sendiri.', 'Kamu tetap bisa mengambil alih kemudi hidupmu, mulai dari satu pilihan kecil hari ini.'],
    },
  },
};

const SUMMARY = {
  Tangguh: { ikon: '🌟', judul: 'Mentalmu sedang tangguh', pesan: 'Sebagian besar bagian dirimu sedang kuat. Pertahankan dengan kebiasaan baik dan terus belajar hal baru.' },
  Rentan: { ikon: '🌤️', judul: 'Mentalmu sedang butuh perawatan', pesan: 'Ada beberapa bagian yang mulai melemah. Dengan latihan rutin dan dukungan teman, kamu bisa menguat kembali.' },
  Krisis: { ikon: '🫂', judul: 'Kamu sedang sangat terbebani', pesan: 'Banyak bagian dirimu sedang lemah. Kamu tidak perlu menghadapinya sendiri. Bicarakan dengan konselor.' },
};
const SUPPORT_TEXT = {
  developmental: { ikon: '📖', teks: 'Bacaan & video tentang menjaga kesehatan mental' },
  reflektif: { ikon: '🧘', teks: 'Latihan menenangkan diri & merenung' },
  kolaboratif: { ikon: '👥', teks: 'Teman sebaya atau kelompok diskusi' },
  kuratif: { ikon: '💬', teks: 'Berbicara dengan konselor' },
};
const RANK = { Lemah: 0, Rentan: 1, Kuat: 2 };

// Interpretasi untuk mahasiswa berfokus pada 5 kebutuhan dasar Glasser (V1–V5: Survival, Love & Belonging,
// Power/Achievement, Freedom, Fun). Otot inti (V6) tetap dihitung dalam indeks, tetapi tidak ditafsirkan terpisah.
function buildInterpretation(h) {
  const dims = h.dimensi.filter((d) => d.bagian === 1).map((d) => {
    const ref = DIMENSIONS.find((x) => x.kode === d.kode); const lib = LIB[d.kode];
    const kuat = d.kategori === 'Kuat';
    return { kode: d.kode, nama: ref.mudah, ikon: lib.ikon, warna: lib.warna, skor: d.skor, max: d.max, status: d.kategori, status_label: STATUS[d.kategori].label, status_ikon: STATUS[d.kategori].ikon, nada: STATUS[d.kategori].nada, makna: lib.makna[d.kategori], coba: kuat ? lib.coba.kuat : lib.coba.lemah };
  });
  const weak = dims.filter((d) => d.status !== 'Kuat').sort((a, b) => (RANK[a.status] - RANK[b.status]) || (a.skor / a.max - b.skor / b.max));
  const strong = dims.filter((d) => d.status === 'Kuat').sort((a, b) => b.skor / b.max - a.skor / a.max);
  const s = SUMMARY[h.kategori_total];
  const langkah = [];
  if (h.perlu_kuratif) langkah.push({ ikon: '💬', teks: 'Daftar konseling dan ceritakan kondisimu kepada konselor.', tautan: '#/s/konseling' });
  langkah.push({ ikon: '📖', teks: 'Pelajari konten psikoedukasi yang disarankan, lalu tulis Refleksi GURU-nya.', tautan: '#/s/psikoedukasi' });
  if (h.kategori_total !== 'Tangguh' || h.dukungan.find((x) => x.kode === 'reflektif')?.siap) langkah.push({ ikon: '🧘', teks: 'Luangkan 5–10 menit setiap hari di Ruang Mindfulness.', tautan: '#/s/relaksasi' });
  if (h.pelemahan.includes('V2') || h.dukungan.find((x) => x.kode === 'kolaboratif')?.siap) langkah.push({ ikon: '👥', teks: 'Gabung grup diskusi atau ngobrol dengan konselor sebaya.', tautan: '#/s/komunitas' });
  return {
    ringkasan: { ikon: s.ikon, judul: s.judul, pesan: s.pesan, kategori: h.kategori_total, skor: h.skor_total },
    kekuatan: strong.map((d) => ({ ikon: d.ikon, nama: d.nama })),
    perlu: weak.map((d) => ({ ikon: d.ikon, nama: d.nama })),
    bagian: dims, langkah,
    // Data diagram radar 5 kebutuhan (skor 4–16; Kuat ≥ 13, Rentan 8–12, Lemah ≤ 7)
    radar: dims.map((d) => ({ kode: d.kode, nama: DIMENSIONS.find((x) => x.kode === d.kode).nama, label: d.nama, skor: d.skor, min: 4, max: d.max, status: d.status })),
    dukungan: h.dukungan.filter((x) => x.siap).map((x) => SUPPORT_TEXT[x.kode]),
    segera: !!h.penanda?.butuh_bantuan_segera,
    catatan: 'Penjelasan ini disusun otomatis dari aturan tetap aplikasi PAN-JALU berdasarkan jawabanmu, bukan dibuat oleh AI dan bukan diagnosis. Konselor tetap tempat terbaik untuk berdiskusi lebih dalam.',
  };
}

// Versi teks polos (tanpa simbol) untuk PDF, ringkasan konselor, dan riwayat
function textInterpretation(iv) {
  const out = [`${iv.ringkasan.judul} (Indeks ${iv.ringkasan.skor}/112, ${iv.ringkasan.kategori}). ${iv.ringkasan.pesan}`];
  if (iv.kekuatan.length) out.push(`Bagian yang sedang kuat: ${iv.kekuatan.map((k) => k.nama).join(', ')}.`);
  for (const b of iv.bagian) out.push(`${b.nama} (${b.status_label}, ${b.skor}/${b.max}): ${b.makna} Coba: ${b.coba}`);
  out.push(iv.catatan);
  return out;
}

module.exports = { buildInterpretation, textInterpretation, AREAS, LIB, SUMMARY };
