# Pasang PAN-JALU di Hostinger — domain pan-jalu.com

## 1. Yang dibeli (hPanel Hostinger)
| Item | Pilihan | Catatan |
|---|---|---|
| **VPS** | **KVM 1** (1 vCPU, 4 GB RAM, 50 GB NVMe) — cukup untuk awal; **KVM 2** bila pengguna aktif ratusan sekaligus / banyak video | Lokasi server: **Asia (Singapura/Indonesia bila ada)**. OS: **Ubuntu 24.04 with Docker**. |
| **Domain pan-jalu.com** | Klaim **domain gratis 1 tahun** yang termasuk paket VPS (bila belum punya). Bila sudah punya di registrar lain: cukup ubah DNS (langkah 2). | |
| **Email no-reply@pan-jalu.com** | **Hostinger Mail Starter** (1 mailbox) | Untuk mengirim email verifikasi akun. |

Tidak perlu membeli: hosting web/WordPress, SSL (HTTPS otomatis gratis), cPanel/Plesk.

## 2. DNS (hPanel → Domain → pan-jalu.com → DNS / Nameserver)
| Tipe | Nama | Isi |
|---|---|---|
| A | `@` | IP VPS |
| A | `www` | IP VPS |
Hapus record A/CNAME bawaan untuk `@` dan `www` yang menunjuk ke parkir domain. Record **MX** biarkan (dibuat otomatis oleh Hostinger Mail).
Tunggu 5–30 menit; cek di PowerShell: `nslookup pan-jalu.com` → harus muncul IP VPS.

## 3. Unggah & pasang (PowerShell Windows)
```
scp panjalu.zip root@IP_VPS:/opt/
ssh root@IP_VPS
```
Di server:
```
apt update && apt install -y unzip
cd /opt && unzip panjalu.zip && cd panjalu
bash deploy/hostinger-setup.sh
```
Jawaban skrip: Domain → Enter (pan-jalu.com) · email & kata sandi admin (min. 10 karakter, tanpa `$`) · SMTP host → Enter (smtp.hostinger.com) · port 465 · SSL 1 · user → Enter (no-reply@pan-jalu.com) · kata sandi mailbox.

## 4. Cek
- Buka https://pan-jalu.com (gembok HTTPS muncul dalam 1–2 menit). https://www.pan-jalu.com otomatis dialihkan.
- Masuk sebagai admin → buat akun konselor → uji daftar mahasiswa (email verifikasi harus masuk).
- **Simpan salinan `/opt/panjalu/.env`** (berisi MC_DATA_KEY; tanpa ini data terenkripsi tidak bisa dibuka).

## 5. Perawatan
- Lihat log: `cd /opt/panjalu && docker compose -f docker-compose.prod.yml logs -f app`
- Perbarui aplikasi: unggah zip baru, ekstrak menimpa folder (`.env` & data aman di volume), lalu `docker compose -f docker-compose.prod.yml up -d --build`
- Backup: aktifkan backup mingguan VPS di hPanel + lihat bagian "Cadangan" di DEPLOY.md.
- Keamanan: jangan bagikan kata sandi root VPS ke siapa pun; aktifkan login SSH key di hPanel bila memungkinkan.
