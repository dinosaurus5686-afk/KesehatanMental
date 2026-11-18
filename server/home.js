// Isi bawaan web Home PAN-JALU. Admin dapat mengubah semuanya dari menu "Web Home & Profil".
const DARURAT_FAQ = 'Segera daftar konseling melalui aplikasi PAN-JALU. Bila hasil asesmenmu menunjukkan butuh bantuan segera, konselor jaga kampus otomatis diberi tahu dan akan menghubungimu.';
const DEFAULT_HOME = {
  nama_singkat: 'PAN-JALU',
  kepanjangan: 'Psikoedukasi, Asesmen, dan Navigasi Menuju Jiwa Luhur',
  institusi: 'Universitas Nusantara PGRI Kediri',
  logo_url: '/logo.png',
  hero_eyebrow: 'Layanan kesehatan mental mahasiswa UNP Kediri',
  hero_judul: 'Kenali dirimu, rawat jiwamu, melangkah menuju jiwa yang luhur.',
  hero_deskripsi: 'PAN-JALU membantu mahasiswa mengenali dan melatih kekuatan mentalnya lewat asesmen mandiri, psikoedukasi, dan refleksi GURU, lalu terhubung dengan teman sebaya dan konselor profesional saat butuh bantuan.',
  pilar: [
    { huruf: 'P', judul: 'Psikoedukasi', deskripsi: 'Artikel, video, podcast, dan bibliokonseling yang disesuaikan dengan kebutuhanmu.' },
    { huruf: 'A', judul: 'Asesmen', deskripsi: 'Inventori IKDKM-M: 32 pernyataan tentang kekuatan mental dan kebutuhan dukunganmu, berbasis teori William Glasser.' },
    { huruf: 'N', judul: 'Navigasi', deskripsi: 'Arah layanan berjenjang: bantuan mandiri, dukungan sebaya, hingga konseling profesional.' },
    { huruf: 'JALU', judul: 'Jiwa Luhur', deskripsi: 'Tujuan bersama: mahasiswa yang tangguh, sehat jiwa, dan berkarakter luhur.' },
  ],
  tentang_judul: 'Tentang PAN-JALU',
  tentang: 'PAN-JALU adalah layanan kesehatan mental digital yang dikembangkan untuk mahasiswa Universitas Nusantara PGRI Kediri. Aplikasi ini menghubungkan mahasiswa dengan konselor kampus dalam satu sistem yang aman: hasil asesmen, jurnal, dan workbook mahasiswa dapat dipahami konselor yang berwenang tanpa proses manual, sehingga pendampingan menjadi lebih cepat dan tepat sasaran.',
  visi: 'Menjadi layanan kesehatan mental kampus yang mudah dijangkau, aman, dan berbasis data untuk mewujudkan mahasiswa berjiwa luhur.',
  misi: [
    'Menyediakan skrining kesehatan mental yang mudah diakses setiap mahasiswa.',
    'Membekali mahasiswa dengan keterampilan mengelola emosi, stres, dan relasi.',
    'Menghubungkan mahasiswa dengan dukungan sebaya dan konselor profesional.',
    'Menjaga kerahasiaan data pribadi sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.',
  ],
  fitur: [
    { judul: 'Asesmen IKDKM-M', deskripsi: 'Kenali Indeks Kekuatan Mental, fondasi 5 kebutuhan dasar, dan otot inti kekuatan mentalmu; laporan dapat diunduh dalam PDF.' },
    { judul: 'Refleksi GURU', deskripsi: 'Di setiap konten psikoedukasi: Ground, Understand, Revise, Use — dari memahami menjadi tindakan.' },
    { judul: 'Jurnal & Goals', deskripsi: 'Catat suasana hati harian dan komitmen kecil setiap minggu.' },
    { judul: 'Ruang Relaksasi', deskripsi: 'Check-in emosi, latihan napas terpandu, dan soundscape alam.' },
    { judul: 'Ruang Psikoedukasi', deskripsi: 'Konten pilihan yang disarankan sesuai hasil asesmenmu.' },
    { judul: 'Komunitas Sebaya', deskripsi: 'Grup dukungan dan peer counselor terlatih.' },
    { judul: 'Konseling Profesional', deskripsi: 'Buat janji dengan konselor kampus, daring maupun tatap muka.' },
  ],
  alur: [
    { judul: 'Daftar dengan email', deskripsi: 'Buat akun dan verifikasi email kampusmu.' },
    { judul: 'Isi asesmen', deskripsi: 'Kenali kekuatan dan kebutuhan dukunganmu dalam 10–15 menit.' },
    { judul: 'Ikuti rekomendasi', deskripsi: 'Psikoedukasi, refleksi GURU, mindfulness, komunitas, atau konseling sesuai kebutuhan.' },
    { judul: 'Terhubung dengan konselor', deskripsi: 'Saat butuh, konselor siap mendampingi.' },
  ],
  konselor_judul: 'Untuk konselor dan psikolog kampus',
  konselor_deskripsi: 'Daftarkan diri sebagai konselor dengan email resmi. Setelah email terverifikasi, admin meninjau pendaftaran Anda. Konselor yang disetujui dapat memantau mahasiswa dalam lingkup kewenangannya, menjalankan Meja Konseling 3 tahap, dan menyusun laporan komunal.',
  tampilkan_statistik: true,
  blok: [], // blok tambahan bermedia (gambar, video, YouTube, kode embed) yang disusun admin
  sembunyikan: [], // bagian bawaan yang disembunyikan
  hero_media: { tipe: 'tidak', url: '', kode: '', tinggi: 420, alt: '' },
  faq: [
    { tanya: 'Apakah hasil asesmen saya bisa dilihat orang lain?', jawab: 'Hanya kamu dan konselor yang berwenang. Data dienkripsi dan setiap akses konselor tercatat.' },
    { tanya: 'Apakah asesmen ini sama dengan diagnosis?', jawab: 'Bukan. IKDKM-M membantu mengenali kekuatan mental dan kebutuhan dukunganmu agar aplikasi dapat menyarankan konten dan bantuan yang pas. Ini bukan tes diagnosis.' },
    { tanya: 'Email apa yang harus saya gunakan untuk mendaftar?', jawab: 'Gunakan email aktif yang dapat menerima kode verifikasi. Bila kampus menetapkan domain tertentu, formulir akan memberitahumu.' },
    { tanya: 'Bagaimana jika saya dalam keadaan darurat?', jawab: DARURAT_FAQ },
  ],
  kontak_alamat: 'Jl. K.H. Ahmad Dahlan No. 76, Mojoroto, Kota Kediri, Jawa Timur',
  kontak_email: 'konseling@unpkediri.ac.id',
  kontak_telepon: '0354-000000',
  kontak_jam: 'Senin–Jumat, 08.00–16.00 WIB',
  footer: '© PAN-JALU · Unit Layanan Konseling Universitas Nusantara PGRI Kediri',
};

module.exports = { DEFAULT_HOME, DARURAT_FAQ };
