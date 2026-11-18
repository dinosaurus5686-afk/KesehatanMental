# Panduan Online-kan PAN-JALU

PAN-JALU butuh server yang **menyala terus** dan punya **penyimpanan permanen**: basis data SQLite, berkas unggahan, dan kunci enkripsi ada di folder `data`. Hosting gratis tanpa disk permanen akan menghapus data setiap kali restart, jadi tidak cocok.

## Pilihan tempat

| Pilihan | Cocok untuk | Perkiraan biaya |
|---|---|---|
| **Server kampus (UPT TIK UNP Kediri)** | Produksi. Data kesehatan mental tetap di institusi (UU PDP No. 27/2022). | Gratis/internal |
| **VPS** (Biznet Gio, IDCloudHost, Niagahoster VPS, DigitalOcean, dll.) | Produksi bila server kampus belum tersedia | ± Rp60–150 rb/bulan (1–2 vCPU, 2 GB RAM, 20 GB disk) |
| **Cloudflare Tunnel dari laptop** | Uji coba singkat / demo | Gratis, tapi mati bila laptop mati |

## Hostinger (VPS + template Docker) — paling ringkas

1. hPanel → **VPS** → pilih server → **OS & Panel / Operating System** → pasang template **Ubuntu with Docker**.
2. hPanel → **Domains** → domain Anda → **DNS / Nameservers** → buat record **A**: nama `@` → IP VPS, dan `www` → IP VPS (contoh domain: pan-jalu.com; panduan lengkap: PASANG-HOSTINGER.md).
3. Dari PowerShell Windows: `scp panjalu.zip root@IP_VPS:/opt/` lalu masuk server: `ssh root@IP_VPS`.
4. Di server: `apt update && apt install -y unzip && cd /opt && unzip panjalu.zip && cd panjalu && bash deploy/hostinger-setup.sh`
5. Isi pertanyaan skrip (domain, email & kata sandi admin, SMTP). Email Hostinger: `smtp.hostinger.com`, port `465`, SSL `1`.
6. Buka `https://pan-jalu.com`. Jangan memakai karakter `$` di kata sandi yang diisikan ke `.env`.

## A. VPS / server kampus dengan Docker (manual)

1. **Siapkan server** Ubuntu 22.04/24.04, lalu buka port 80 dan 443.
2. **Arahkan domain**: buat DNS record `A` dari domain (misalnya `panjalu.unpkediri.ac.id`) ke IP server. Minta ke pengelola DNS kampus bila memakai subdomain kampus.
3. **Instal Docker** (di server):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
4. **Unggah proyek** ke server (misalnya pakai WinSCP/FileZilla ke `/opt/panjalu`, atau `scp panjalu.zip user@IP:/opt/` lalu `unzip`). Jangan ikut sertakan folder `node_modules` dan `data`.
5. **Buat file `.env`**:
   ```bash
   cd /opt/panjalu
   cp .env.example .env
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # atau: openssl rand -hex 32
   nano .env
   ```
   Isi minimal:
   - `DOMAIN` dan `MC_APP_URL=https://domain-anda`
   - `MC_DATA_KEY` dan `MC_JWT_SECRET` (masing-masing 64 karakter hex dari perintah di atas). **Simpan salinannya di tempat aman**; kalau `MC_DATA_KEY` hilang, data terenkripsi tidak bisa dibuka.
   - `MC_DEMO=0`, `MC_ADMIN_EMAIL`, `MC_ADMIN_PASSWORD` (min. 10 karakter)
   - `MC_SMTP_*` dan `MC_MAIL_FROM` (lihat bagian C)
6. **Jalankan**:
   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   docker compose -f docker-compose.prod.yml logs -f app   # cek "Akun admin dibuat" dan "PAN-JALU berjalan"
   ```
   Caddy mengurus sertifikat HTTPS otomatis. Buka `https://pan-jalu.com`.
7. **Setelah online**: login admin → ganti kata sandi di Profil → isi Web Home, nomor hotline SOS, dan aturan domain email di menu admin. Lalu minta para konselor mendaftar dan setujui mereka.

**Memperbarui aplikasi:** timpa folder `server` dan `public`, lalu `docker compose -f docker-compose.prod.yml up -d --build`. Data di volume tetap aman.

## B. Cadangan (backup) data

Jalankan rutin (misalnya harian lewat cron):
```bash
docker run --rm -v panjalu_panjalu-data:/data -v /opt/backup:/backup alpine \
  tar czf /backup/panjalu-$(date +%F).tgz -C /data .
```
Simpan juga salinan `.env` (berisi kunci enkripsi) di tempat terpisah yang aman.

## C. Email verifikasi (SMTP)

Tanpa SMTP, mahasiswa dan konselor tidak menerima kode verifikasi. Pilihan:
- **Email kampus** (Google Workspace/Microsoft 365 UNP Kediri): minta akun `no-reply@unpkediri.ac.id` ke UPT TIK. Untuk Google: `MC_SMTP_HOST=smtp.gmail.com`, port `587`, user = alamat email, pass = *App Password*.
- **Layanan email transaksional** (Brevo, Mailgun, SendGrid, dll.), memakai host/user/pass dari layanan tersebut.

## D. Uji coba cepat dari laptop (sementara)

1. Jalankan aplikasi di laptop (`npm start`).
2. Instal `cloudflared` (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
3. Jalankan `cloudflared tunnel --url http://localhost:3000` → muncul alamat `https://xxxx.trycloudflare.com` yang bisa dibuka siapa saja.
4. Set `MC_APP_URL` ke alamat tersebut supaya tautan email benar. Alamat berubah setiap kali dijalankan, dan aplikasi hanya online selama laptop menyala.

## Daftar periksa sebelum dibuka untuk semua mahasiswa

- [ ] HTTPS aktif dan `MC_APP_URL` benar
- [ ] `MC_DEMO=0`, admin dibuat, kata sandi admin diganti
- [ ] `MC_DATA_KEY` & `MC_JWT_SECRET` diisi dan dicadangkan
- [ ] SMTP diuji: daftar akun mahasiswa uji, kode verifikasi masuk ke email
- [ ] Nomor hotline kampus diisi di menu Web Home & Profil
- [ ] Minimal satu konselor aktif dengan status jaga, slot jadwal, dan informed consent
- [ ] Backup harian berjalan
- [ ] Persetujuan pimpinan/etik, SOP krisis, dan pemberitahuan privasi sudah disiapkan
