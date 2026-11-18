#!/usr/bin/env bash
# Instalasi PAN-JALU di VPS Hostinger (template "Ubuntu with Docker").
# Jalankan dari folder proyek:  sudo bash deploy/hostinger-setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f package.json ] || [ ! -f docker-compose.prod.yml ]; then
  echo "Jalankan skrip ini dari folder proyek PAN-JALU (yang berisi package.json)." >&2; exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker belum terpasang. Memasang Docker…"
  curl -fsSL https://get.docker.com | sh
fi
if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

if [ -f .env ]; then
  echo "File .env sudah ada — dipakai apa adanya (hapus .env bila ingin mengulang pengisian)."
else
  echo "=== Pengaturan PAN-JALU ==="
  read -rp "Domain [pan-jalu.com]: " DOMAIN; DOMAIN=${DOMAIN:-pan-jalu.com}
  read -rp "Email admin pertama: " ADMIN_EMAIL
  while :; do read -rsp "Kata sandi admin (min. 10 karakter): " ADMIN_PW; echo; [ ${#ADMIN_PW} -ge 10 ] && break; echo "Terlalu pendek."; done
  echo "--- SMTP untuk email verifikasi (kosongkan host bila belum ada; isi nanti di .env) ---"
  echo "    Email Hostinger: host smtp.hostinger.com, port 465, SSL = 1"
  read -rp "SMTP host [smtp.hostinger.com] (ketik - untuk lewati): " SMTP_HOST; SMTP_HOST=${SMTP_HOST:-smtp.hostinger.com}; [ "$SMTP_HOST" = "-" ] && SMTP_HOST=""
  SMTP_PORT=465; SMTP_SECURE=1; SMTP_USER=""; SMTP_PASS=""; MAIL_FROM=""
  if [ -n "$SMTP_HOST" ]; then
    read -rp "SMTP port [465]: " p; SMTP_PORT=${p:-465}
    read -rp "SSL langsung (1 untuk port 465, 0 untuk 587) [1]: " p; SMTP_SECURE=${p:-1}
    read -rp "SMTP user [no-reply@${DOMAIN}]: " SMTP_USER; SMTP_USER=${SMTP_USER:-no-reply@${DOMAIN}}
    read -rsp "SMTP password: " SMTP_PASS; echo
    MAIL_FROM="PAN-JALU <${SMTP_USER}>"
  fi
  cat > .env <<EOF
DOMAIN=${DOMAIN}
PORT=3000
MC_DATA_KEY=$(openssl rand -hex 32)
MC_JWT_SECRET=$(openssl rand -hex 32)
MC_DATA_DIR=/data
MC_DEMO=0
MC_ADMIN_EMAIL=${ADMIN_EMAIL}
MC_ADMIN_PASSWORD=${ADMIN_PW}
MC_TRUST_PROXY=1
MC_APP_URL=https://${DOMAIN}
MC_SMTP_HOST=${SMTP_HOST}
MC_SMTP_PORT=${SMTP_PORT}
MC_SMTP_SECURE=${SMTP_SECURE}
MC_SMTP_USER=${SMTP_USER}
MC_SMTP_PASS=${SMTP_PASS}
MC_MAIL_FROM=${MAIL_FROM}
MC_EMAIL_MX_CHECK=1
ANTHROPIC_API_KEY=
MC_AI_MODEL=claude-opus-5-5
EOF
  chmod 600 .env
  echo ".env dibuat. SIMPAN SALINAN .env (terutama MC_DATA_KEY) di tempat aman."
fi

echo "Membangun dan menjalankan PAN-JALU…"
$DC -f docker-compose.prod.yml up -d --build
sleep 5
$DC -f docker-compose.prod.yml ps
echo
echo "Log aplikasi (Ctrl+C untuk keluar dari log; aplikasi tetap berjalan):"
$DC -f docker-compose.prod.yml logs --tail=30 app || true
echo
echo "Selesai. Buka https://$(grep ^DOMAIN= .env | cut -d= -f2) — sertifikat HTTPS dibuat otomatis (bisa 1–2 menit)."
