// Kop dokumen (PDF & Word): diatur Koordinator Layanan BK per kampus (logo, nama perguruan tinggi, nama unit layanan BK,
// alamat & kontak). Kampus yang belum mengatur kop — termasuk Konselor PAN-JALU independen dan mahasiswa dari kampus yang
// belum terdaftar — memakai kop PAN-JALU (logo, kepanjangan, alamat & kontak dari pengaturan Web Home admin).
const fs = require('node:fs');
const path = require('node:path');
const { get, getConfig, setConfig } = require('./db');
const { DATA_DIR } = require('./security');
const { DEFAULT_HOME } = require('./home');

const PANJALU_LOGO = path.join(__dirname, '..', 'public', 'logo.png');
const KOP_DIR = path.join(DATA_DIR, 'uploads', 'kop'); fs.mkdirSync(KOP_DIR, { recursive: true });
const MAX_LOGO = 600 * 1024;

const home = () => ({ ...DEFAULT_HOME, ...getConfig('home', {}) });
const kontakLine = (o) => [o.telepon && `Telp. ${o.telepon}`, o.email, o.situs].filter(Boolean).join(' · ');

function panjaluBrand() {
  const h = home();
  return { jenis: 'panjalu', nama: h.nama_singkat || 'PAN-JALU', unit: h.kepanjangan || 'Psikoedukasi, Asesmen, dan Navigasi Menuju Jiwa Luhur', sub: 'Layanan Kesehatan Mental Mahasiswa',
    alamat: h.kontak_alamat || '', kontak: kontakLine({ telepon: h.kontak_telepon, email: h.kontak_email, situs: 'pan-jalu.com' }), logo: fs.existsSync(PANJALU_LOGO) ? PANJALU_LOGO : null };
}
const kopOf = (uni) => (uni ? getConfig(`kop:${uni}`, null) : null);
const logoPath = (k) => (k?.logo && fs.existsSync(path.join(KOP_DIR, k.logo)) ? path.join(KOP_DIR, k.logo) : null);
// Kop untuk kampus tertentu; null/belum diatur → kop PAN-JALU
function brandFor(uni) {
  const k = kopOf(uni); if (!k?.nama) return panjaluBrand();
  return { jenis: 'kampus', nama: k.nama, unit: k.unit || 'Unit Layanan Bimbingan dan Konseling', sub: 'PAN-JALU — Psikoedukasi, Asesmen, dan Navigasi Menuju Jiwa Luhur',
    alamat: k.alamat || '', kontak: kontakLine(k), logo: logoPath(k) || (fs.existsSync(PANJALU_LOGO) ? PANJALU_LOGO : null) };
}
const brandForUser = (userId) => brandFor(get('SELECT university_id FROM users WHERE id = ?', userId)?.university_id);

// Tampilan pengaturan untuk koordinator (logo dikirim sebagai data URL agar bisa dipratinjau)
function kopView(uni) {
  const k = kopOf(uni) || {}; const lp = logoPath(k);
  const uniName = get('SELECT nama FROM universities WHERE id = ?', uni)?.nama || '';
  return { diatur: !!k.nama, nama: k.nama || uniName, unit: k.unit || '', alamat: k.alamat || '', telepon: k.telepon || '', email: k.email || '', situs: k.situs || '',
    logo: lp ? `data:image/${lp.endsWith('.png') ? 'png' : 'jpeg'};base64,${fs.readFileSync(lp).toString('base64')}` : null, bawaan: panjaluBrand(), diubah_pada: k.diubah_pada || null, diubah_oleh: k.diubah_oleh || null };
}
// Simpan kop; logo: data URL PNG/JPEG (≤ 600 KB), null = tidak diubah, '' = hapus logo
function saveKop(uni, b, actor) {
  const s = (v, n) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, n);
  const next = { ...(kopOf(uni) || {}), nama: s(b.nama, 160), unit: s(b.unit, 160), alamat: s(b.alamat, 300), telepon: s(b.telepon, 40), email: s(b.email, 120), situs: s(b.situs, 120), diubah_pada: new Date().toISOString(), diubah_oleh: actor?.nama || '-' };
  if (next.nama.length < 5) return { error: 'Isi nama perguruan tinggi (minimal 5 karakter).' };
  if (next.unit.length < 3) return { error: 'Isi nama unit layanan BK.' };
  if (b.logo === '') { if (next.logo) fs.rmSync(path.join(KOP_DIR, next.logo), { force: true }); delete next.logo; }
  else if (b.logo) {
    const m = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=]+)$/.exec(String(b.logo)); if (!m) return { error: 'Logo harus berkas PNG atau JPG.' };
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > MAX_LOGO) return { error: 'Ukuran logo maksimal 600 KB.' };
    const isPng = buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])); const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
    if (!isPng && !isJpg) return { error: 'Berkas logo tidak dikenali sebagai PNG/JPG.' };
    if (next.logo) fs.rmSync(path.join(KOP_DIR, next.logo), { force: true });
    next.logo = `${String(uni).replace(/[^A-Za-z0-9]/g, '')}-${Date.now()}.${isPng ? 'png' : 'jpg'}`; fs.writeFileSync(path.join(KOP_DIR, next.logo), buf);
  }
  setConfig(`kop:${uni}`, next); return { ok: true };
}
function resetKop(uni) { const k = kopOf(uni); if (k?.logo) fs.rmSync(path.join(KOP_DIR, k.logo), { force: true }); setConfig(`kop:${uni}`, null); }

// Migrasi sekali: kampus asal PAN-JALU (UNP Kediri) tetap memakai kop seperti sebelumnya
function migrate(UNP) {
  if (getConfig('kop_migrated', false)) return;
  if (!kopOf(UNP) && get('SELECT 1 AS x FROM universities WHERE id = ?', UNP)) {
    const h = home();
    setConfig(`kop:${UNP}`, { nama: 'Universitas Nusantara PGRI Kediri', unit: 'Unit Layanan Konseling — PAN-JALU', alamat: h.kontak_alamat || '', telepon: h.kontak_telepon || '', email: h.kontak_email || '', diubah_pada: new Date().toISOString(), diubah_oleh: 'migrasi' });
  }
  setConfig('kop_migrated', true);
}

// Kop untuk dokumen Word (paket docx): logo + teks rata tengah
function docxKop(docx, b) {
  const { Paragraph, TextRun, ImageRun, AlignmentType } = docx; b = b || panjaluBrand();
  const out = [];
  if (b.logo) { try { const buf = fs.readFileSync(b.logo); out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: buf, type: b.logo.endsWith('.png') ? 'png' : 'jpg', transformation: { width: 64, height: 64 } })] })); } catch { /* */ } }
  out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(b.nama).toUpperCase(), bold: true, size: 26 })] }));
  out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: b.unit, size: 20 })] }));
  for (const t of [b.sub, b.alamat, b.kontak].filter(Boolean)) out.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: t, size: 16, color: '555555' })] }));
  out.push(new Paragraph({ border: { bottom: { style: 'single', size: 12, color: '1D3A9E', space: 1 } }, children: [] }));
  return out;
}

module.exports = { docxKop, brandFor, brandForUser, panjaluBrand, kopView, saveKop, resetKop, migrate, KOP_DIR };
