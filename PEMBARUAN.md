# Memperbarui PAN-JALU di pan-jalu.com (tanpa menghapus data)

Pembaruan ini menjadikan PAN-JALU **multi-kampus** dan menambahkan peran **Koordinator Layanan BK**, pustaka konten admin, menu Asesmen psikometri untuk admin, serta pembangun halaman utama. Saat aplikasi pertama kali menyala, basis data dimigrasi otomatis dari versi 4 (yang sekarang online) ke versi 6:
- semua akun mahasiswa, konselor, dan admin disalin apa adanya (kata sandi tetap sama); jumlah akun diperiksa sebelum dan sesudah penyalinan, dan bila berbeda migrasi dibatalkan tanpa mengubah data;
- seluruh akun, prodi, konten, grup komunitas, dan jadwal asesmen yang sudah ada dipindahkan ke kampus **Universitas Nusantara PGRI Kediri (NPSN 071072)**;
- hasil asesmen, konseling, jurnal, dan pengaturan tidak disentuh. Dalam uji coba dengan salinan data versi 4, setiap konselor melihat mahasiswa yang persis sama seperti sebelumnya, dan mahasiswa melihat konten, grup, serta daftar konselor yang sama.

**Tambahan pembaruan ini (admin, koordinator, konselor):**
- Admin › **Asesmen** kini menjadi *Monitoring Asesmen*: profil 5 kebutuhan dasar (lalu Kendali Diri) yang dapat disaring per provinsi, kota, universitas, fakultas/prodi, jenis kelamin, umur, tingkat, jenjang, angkatan, dan periode.
- Admin › **Psikometrik** (menu baru): menonaktifkan/mengaktifkan butir, mengatur norma (interpretasi kuantitatif) dan kalimat interpretasi (kualitatif), analisis deskriptif, validitas butir & α Cronbach, Spearman-Brown, analisis demografis (ANOVA), dan analisis Rasch.
- Admin › **Konten Psikoedukasi** › *Analisis konten*: 7 kebutuhan teratas dengan ceklis dibuat/terbit, 5 konten terpopuler per jenis, media paling disukai, serta keterlibatan (count, frekuensi, latensi, durasi, jeda antarakses).
- Mahasiswa menerima **notifikasi konten baru** saat konselor menerbitkan konten atau memakai konten pustaka admin.
- Laporan komunal koordinator & konselor: analisis utama pada 5 kebutuhan dasar; Kendali Diri & Kebiasaan Baik selalu sesudahnya.
- Basis data hanya ditambah kolom baru (durasi membuka konten & waktu terbit konten); tidak ada data yang dihapus. Durasi baca mulai tercatat setelah pembaruan dipasang.

## 1. Backup dulu (di server)
```
ssh root@187.127.115.206
mkdir -p /opt/backup && docker run --rm -v panjalu_panjalu-data:/d -v /opt/backup:/b alpine tar czf /b/data-$(date +%F-%H%M).tgz -C /d .
ls -lh /opt/backup
```
Pastikan muncul file `data-…tgz` berukuran lebih dari 0. Lalu ketik `exit`.

## 2. Unggah versi baru (PowerShell di laptop)
```
cd $HOME\Downloads
scp panjalu.zip root@187.127.115.206:/opt/
```

## 3. Pasang (di server)
```
ssh root@187.127.115.206
cd /opt && unzip -o panjalu.zip && cd panjalu && docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml logs --tail=20 app
```
Di log harus muncul:
- `[basis data] Migrasi v5 selesai: N akun dipertahankan, peran Koordinator Layanan BK ditambahkan.`
- `[basis data] Migrasi v6: N akun dipindahkan ke kampus Universitas Nusantara PGRI Kediri (NPSN 071072).`
- `PAN-JALU berjalan di http://localhost:3000`

Pesan migrasi hanya muncul sekali. Saat aplikasi dinyalakan ulang berikutnya, pesan itu tidak muncul lagi.

## 4. Setelah update
1. Buka https://pan-jalu.com, lalu tekan Ctrl+F5 (di HP: tutup dan buka lagi aplikasinya).
2. **Penting — koordinator kampus UNP:** verifikasi konselor kini dilakukan Koordinator Layanan BK kampus, bukan Admin. Daftarkan akun koordinator UNP Kediri lewat **Daftar → Koordinator Layanan BK** (pilih Universitas Nusantara PGRI Kediri), verifikasi email, lalu setujui di akun Admin → **Pendaftar Koordinator**.
3. Koordinator memeriksa menu **Fakultas & Prodi** (daftar prodi UNP yang lama sudah terbawa).
4. Menu dan tombol SOS sudah ditiadakan di semua akun. Mahasiswa yang hasil asesmennya menunjukkan butuh bantuan segera diarahkan ke menu Konseling, dan konselor jaga tetap menerima pemberitahuan.
5. Konselor yang sudah ada sebaiknya membuka **Konseling → Pengaturan & konteks kerja** untuk memastikan fakultas/prodi tanggung jawabnya dan memilih melayani seluruh mahasiswa kampus atau hanya mahasiswa binaan.
6. Mahasiswa lama belum memiliki "konselor pilihan"; mereka tetap ditangani konselor yang konteks kerjanya cocok, dan dapat memilih konselor kapan saja di menu **Profil**.
7. Teks halaman utama masih menyebut "UNP Kediri". Karena kini multi-kampus, Admin dapat mengubahnya di **Web Home & Profil**.

## Bila ada masalah: kembalikan data dari backup
```
cd /opt/panjalu && docker compose -f docker-compose.prod.yml stop app
docker run --rm -v panjalu_panjalu-data:/d -v /opt/backup:/b alpine sh -c "rm -rf /d/* && tar xzf /b/NAMA-FILE-BACKUP.tgz -C /d"
```
Lalu pasang kembali zip versi sebelumnya dan jalankan `docker compose -f docker-compose.prod.yml up -d --build`. Ganti `NAMA-FILE-BACKUP.tgz` dengan nama file dari langkah 1.

**Jangan pernah** menjalankan `docker compose down -v` atau menghapus file `/opt/panjalu/.env`.
