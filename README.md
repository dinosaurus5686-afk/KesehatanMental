# PAN-JALU — Psikoedukasi, Asesmen, dan Navigasi Menuju Jiwa Luhur

Ini layanan kesehatan mental mahasiswa untuk banyak perguruan tinggi sekaligus (multi-kampus). Daftar perguruan tinggi diambil dari referensi Kemendikdasmen (`server/data/perguruan-tinggi.json`); setiap kampus memiliki Koordinator Layanan BK, konselor, dan mahasiswanya sendiri, dan data antarkampus terpisah. Aplikasinya terdiri dari lima bagian yang berbagi satu backend dan satu basis data:

- **Web Home publik.** Profil aplikasi, visi-misi, overview fitur, alur layanan, FAQ, dan kontak. Admin dapat menyisipkan **blok bermedia** di antara bagian halaman (gambar/GIF, video, YouTube, animasi, atau kode embed seperti Canva/Lottie/Google Slides) dan menyembunyikan bagian bawaan. Kode embed dijalankan di bingkai terisolasi (`/embed/<id>`, CSP sandbox) sehingga tidak dapat membaca sesi pengguna.
- **Aplikasi Mahasiswa.** Mendaftar dengan memilih **perguruan tinggi**, program studi kampus itu (atau mengusulkan prodi bila belum ada), dan **satu atau lebih konselor pendamping** beserta konteks kerjanya. Isinya asesmen IKDKM-M dengan laporan PDF, psikoedukasi dengan Refleksi GURU di setiap konten, jurnal & goals, Ruang Mindfulness, komunitas, dan konseling. Seluruh konten yang dipublikasikan konselor kampus dapat diakses, sedangkan rekomendasi tetap mengikuti hasil asesmen masing-masing.
- **Aplikasi Konselor.** Dashboard, Asesmen IKDKM-M, **Psikoedukasi** (sub-menu *Konten hasil review* dari pustaka admin — tinjau, beri bintang & ulasan, pakai untuk kampus — dan *Konten buatan sendiri*), Profil Mahasiswa, menu **Konseling** (Meja Konseling, Pesan, serta Pengaturan: jadwal, informed consent, **konteks kerja** fakultas/prodi, dan pilihan melayani **seluruh mahasiswa kampus** atau **hanya mahasiswa binaan**), Laporan Komunal, Komunitas (grup untuk **binaan saja** atau **seluruh kampus**), serta Evaluasi & Kinerja. Data mahasiswa yang tampil hanya mahasiswa binaan (yang memilih konselor itu), kliennya, mahasiswa yang belum memilih konselor dan berada dalam konteks kerjanya, kasus krisis saat berstatus jaga, dan penugasan koordinator.
- **Koordinator Layanan BK (per kampus).** Mendaftar sendiri lalu disetujui Admin. Memverifikasi & mengelola konselor kampusnya, mengatur jadwal layanan konselor, mengelola **daftar fakultas & prodi** kampus (termasuk merapikan usulan prodi dari mahasiswa dan menempel daftar dari Excel), memantau kasus darurat tanpa identitas mahasiswa lalu menugaskan konselor, dan melihat laporan komunal agregat kampusnya.
- **Admin (lintas kampus).** Menu **Asesmen**: seluruh data asesmen dari semua kampus, dapat difilter per universitas, fakultas, prodi, angkatan, dan sampai jawaban per butir tiap responden (identitas disamarkan), lengkap dengan uji kelayakan instrumen — korelasi butir-total terkoreksi, r tabel, Cronbach's alpha per dimensi/skala, alpha jika butir dihapus — serta ekspor Excel data butir. Menu **Konten Psikoedukasi**: rekomendasi kebutuhan konten dari hasil asesmen seluruh mahasiswa (per butir pemicu) dengan checklist selesai, dan pustaka konten admin. Menu **Pendaftar Koordinator** dan **Web Home & Profil**. Admin tidak memverifikasi konselor (tugas koordinator kampus) dan tidak memiliki akses ke data klinis mahasiswa.

## Pendaftaran mandiri dengan email terverifikasi

| Langkah | Mahasiswa | Konselor |
|---|---|---|
| 1. Isi formulir di `Daftar` | NIM, prodi, angkatan, email, kata sandi | NIP/NIDN, profesi/lisensi, spesialisasi, fakultas yang ingin didampingi |
| 2. Pemeriksaan email | Format, bukan email sekali-pakai, domainnya punya server email (MX), dan sesuai domain wajib bila admin menetapkannya | sama |
| 3. Verifikasi | Kode 6 digit **atau** tautan di email (berlaku 30 menit, maksimal 5 kali salah, kirim ulang tiap 1 menit) | sama |
| 4. Aktivasi | **Langsung aktif otomatis** | Masuk antrean **Pendaftar Konselor**. Admin mendapat notifikasi dan email, lalu menyetujui (sambil menetapkan lingkup fakultas) atau menolak dengan alasan. Hasilnya dikirim ke email pendaftar. |

Sebelum verifikasi selesai, akun tidak bisa dipakai masuk. Fitur **Lupa kata sandi** mengirim tautan reset ke email yang sudah terverifikasi.

## Menjalankan

Kebutuhan: Node.js 22.5 atau lebih baru.

```bash
npm install
npm start            # http://localhost:3000
npm run seed         # (opsional) isi ulang data demo
npm test             # 25 uji: skoring, kendali akses, alur pendaftaran & verifikasi, enkripsi, audit log, migrasi data v4→v6, rumus psikometri
```

**Pengiriman email.** Isi `MC_SMTP_HOST`, `MC_SMTP_USER`, `MC_SMTP_PASS`, `MC_MAIL_FROM`, dan `MC_APP_URL` (lihat `.env.example`). Selama SMTP belum diisi, email **tidak benar-benar terkirim**. Isinya (termasuk kode verifikasi) dicetak di konsol server dan disimpan di `data/outbox/`, supaya Anda tetap bisa mencoba alur pendaftaran secara lokal.

Saat pengujian di jaringan tanpa DNS, jalankan dengan `MC_EMAIL_MX_CHECK=0`. Di produksi biarkan bernilai `1`.

### Akun demo

Kata sandi semua akun demo adalah `mindcampus123`.

| Peran | Login |
|---|---|
| Mahasiswa | `2313020001` (Budi Santoso, peer counselor), `2414010071` (Intan, belum pernah asesmen) |
| Mahasiswa kampus tanpa konselor | `MB001` (Dewi Lestari, baru — diajak memilih konselor saat masuk), `MB002` (Rizky Pratama, sudah memilih Konselor PAN-JALU K002) |
| Konselor | `K001` (Guruh, M.Pd.), `K002` (Dr. Ratna Wulandari, juga Konselor PAN-JALU), `K003` (Andi Prasetyo, pengajuan Konselor PAN-JALU menunggu) |
| Koordinator Layanan BK | `KBK01` (Dra. Sri Lestari, M.Pd.) |
| Admin | `admin` |

Data demo juga berisi satu pendaftar konselor yang menunggu persetujuan (Lestari Handayani) dan satu konselor independen yang menunggu persetujuan admin sebagai Konselor PAN-JALU (`KP001`, Maya Anggraini).

Untuk produksi, jalankan `MC_DEMO=0` dan isi `MC_ADMIN_EMAIL` + `MC_ADMIN_PASSWORD` (min. 10 karakter). Akun admin pertama dibuat otomatis saat server pertama kali berjalan; setelah itu ganti kata sandinya di menu Profil.

> **Penting — pembaruan ke versi IKDKM-M:** skema basis data berubah (instrumen 32 butir, Refleksi GURU per konten). **Hapus folder `data/` lama** sebelum menjalankan versi ini; server akan menolak berjalan bila menemukan data versi lama.

### Docker

```bash
cp .env.example .env    # isi MC_DATA_KEY, MC_JWT_SECRET, dan SMTP
docker compose up -d --build
```

## Yang masih perlu disiapkan institusi

1. Akun SMTP resmi kampus (misalnya alamat no-reply di domain unpkediri.ac.id).
2. Nomor hotline kampus. Saat ini masih placeholder; ganti di **Web Home & Profil → Kontak darurat & layanan**.
3. Domain email wajib, bila diinginkan (misalnya `student.unpkediri.ac.id` untuk mahasiswa), di menu **Pendaftar Konselor → Aturan email pendaftaran**.
4. Validasi isi yang disusun sebagai draf awal: pertanyaan Refleksi GURU, aturan penanda butuh bantuan segera, definisi kuadran, teks informed consent bawaan, rekomendasi layanan per dimensi, serta 16 konten demo dan thumbnail bawaan (`public/thumbs/`).
5. Verifikasi daftar prodi dengan BAAK, SOP krisis (termasuk tindak lanjut penanda butuh bantuan segera), dan uji penetrasi sebelum peluncuran.

## Catatan IKDKM-M (BAB V–VI naskah instrumen)

- 32 butir, Likert 4 titik (SS, S, TS, STS), keadaan 2 minggu terakhir: 20 butir Fondasi 5 kebutuhan dasar William Glasser (Bertahan Hidup/Survival, Cinta & Rasa Memiliki/Love and Belonging, Kekuasaan/Power–Achievement, Kebebasan/Freedom, Kesenangan/Fun), 8 butir Otot inti (Quality World, Internal Control, Total Behavior & Positive Addiction), 4 butir Kesiapan dukungan.
- Favorable: SS=4, S=3, TS=2, STS=1. Unfavorable dibalik: SS=1 … STS=4.
- Norma: dimensi 4–16 (Kuat 13–16, Rentan 8–12, Lemah 4–7); fondasi 20–80 (61/40/20); otot inti 8–32 (25/16/8); Indeks total 28–112 (Tangguh 85–112, Rentan 56–84, Krisis 28–55). Bagian 3 tidak masuk indeks.
- Pelemahan (klaim interpretasi Glasser untuk konselor): dimensi kebutuhan ≤ 12, otot inti ≤ 24.
- Rekomendasi psikoedukasi: maksimal **3 konten paling urgen**, dari keyword-tagging butir pemicu (unfavorable SS/S atau favorable TS/STS), dibobot tingkat pelemahan. Bila darurat (lihat di bawah), **konseling profesional** selalu di urutan pertama.
- Ketentuan tambahan PAN-JALU (bukan dari naskah, perlu divalidasi tim):
  - **Butuh bantuan segera** (peringatan merah ke konselor jaga, SLA): Indeks Krisis + butir 28 SS/S, atau butir 28 SS + butir 32 SS/S.
  - **Analisis kuadran**: Indeks Tangguh/belum × kesiapan dukungan (≥ 2 butir Bagian 3 SS/S) → Tangguh & Mandiri, Tangguh & Ingin Bertumbuh, Rentan Tersembunyi, Rentan & Siap Dibantu.
- Refleksi GURU diisi di setiap halaman konten psikoedukasi: Ground = kondisi dasar (terisi otomatis dari hasil asesmen terakhir), Understand = konten menambah pemahaman tentang apa, Revise = apa yang perlu direvisi dari keadaan sekarang, Use = rencana tindakan & komitmen. Menu Refleksi GURU menampilkan portofolionya.
- Konselor: refleksi kinerja model GURU (jenis layanan diketik bebas, rating diri 1–5 bintang) dan unduhan **raport diri** PDF/Word/Excel per kegiatan, mingguan, bulanan, semesteran, atau tahunan. Unggahan konten psikoedukasi hingga 150 MB.
- Interpretasi untuk mahasiswa disusun dari pustaka kalimat tetap di `server/interpretation.js` (6 bagian × 3 status, dikaitkan dengan 5 sisi kehidupan: sosial, akademik, karier, teknologi & AI, pribadi) dan ditampilkan sebagai kartu berwarna. Kalimatnya dapat diedit tim konselor di berkas tersebut.
- Skoring dan interpretasi deterministik, tanpa AI. Soundscape disintesis di peramban (WebAudio).

## Struktur

```
server/  index.js · db.js · security.js · mailer.js (email & validasi) · home.js (isi bawaan Home)
         scoring.js · services.js · ai.js · reference.js · seed.js
         routes/ auth (daftar, verifikasi, reset) · selfhelp · content · counseling · staff · admin
public/  index.html · styles.css · logo.png · js/ (public, app, student, staff, core, icons)
server/  pdf.js (laporan asesmen & formulir pendaftaran)
public/thumbs/ thumbnail bawaan per kategori
test/    scoring.test.js · access.test.js
```
