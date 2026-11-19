// Dokumen PDF resmi PAN-JALU: laporan hasil asesmen IKDKM dan formulir pendaftaran konseling.
const PDFDocument = require('pdfkit');
const path = require('node:path');
const fs = require('node:fs');
const { NORMS, QUADRANTS, ITEMS, SCALE, DIMENSIONS } = require('./reference');

const LOGO = path.join(__dirname, '..', 'public', 'logo.png');
const BLUE = '#1d3a9e';
const fmt = (d) => new Date(d).toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Jakarta' }) + ' WIB';

function start(res, filename) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  const doc = new PDFDocument({ size: 'A4', margin: 48, bufferPages: true, info: { Title: filename, Author: 'PAN-JALU' } });
  doc.pipe(res);
  return doc;
}

// brand: hasil branding.brandFor() — kop kampus (diatur koordinator) atau kop PAN-JALU
function kop(doc, title, subtitle, brand) {
  const b = brand || require('./branding').panjaluBrand();
  const logo = b.logo || (fs.existsSync(LOGO) ? LOGO : null);
  if (logo) { try { doc.image(logo, 48, 38, { fit: [78, 66], align: 'center', valign: 'center' }); } catch { /* logo rusak: dilewati */ } }
  doc.font('Helvetica-Bold').fontSize(b.jenis === 'panjalu' ? 14 : 12).fillColor('#111').text(String(b.nama).toUpperCase(), 140, 40, { width: 407 })
    .font('Helvetica').fontSize(9).fillColor('#333').text(b.unit, 140, doc.y, { width: 407 });
  doc.fontSize(8).fillColor('#555');
  if (b.sub) doc.text(b.sub, 140, doc.y, { width: 407 });
  if (b.alamat) doc.text(b.alamat, 140, doc.y, { width: 407 });
  if (b.kontak) doc.text(b.kontak, 140, doc.y, { width: 407 });
  const lineY = Math.max(108, doc.y + 4);
  doc.moveTo(48, lineY).lineTo(547, lineY).lineWidth(1.5).strokeColor(BLUE).stroke();
  doc.y = lineY + 12; doc.x = 48;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(BLUE).text(title, { align: 'center' });
  if (subtitle) doc.font('Helvetica').fontSize(9).fillColor('#555').text(subtitle, { align: 'center' });
  doc.moveDown(0.8).fillColor('#111');
}

function h2(doc, t) { doc.moveDown(0.6).font('Helvetica-Bold').fontSize(11).fillColor(BLUE).text(t).moveDown(0.2).font('Helvetica').fontSize(9.5).fillColor('#111'); }
function kv(doc, rows) { for (const [k, v] of rows) doc.font('Helvetica-Bold').text(`${k}: `, { continued: true }).font('Helvetica').text(String(v ?? '-')); }
function ensure(doc, h) { if (doc.y + h > doc.page.height - 60) doc.addPage(); }

function table(doc, headers, rows, widths) {
  const x0 = 48; let y = doc.y;
  const draw = (cells, bold) => {
    const hgt = Math.max(...cells.map((c, i) => doc.heightOfString(String(c ?? ''), { width: widths[i] - 6 }))) + 6;
    ensure(doc, hgt); y = doc.y;
    let x = x0;
    cells.forEach((c, i) => {
      if (bold) doc.rect(x, y, widths[i], hgt).fillAndStroke('#e8edf9', '#c9d2ea').fillColor('#111');
      else doc.rect(x, y, widths[i], hgt).strokeColor('#d5dbea').stroke();
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).text(String(c ?? ''), x + 3, y + 3, { width: widths[i] - 6 });
      x += widths[i];
    });
    doc.y = y + hgt; doc.x = x0;
  };
  draw(headers, true); rows.forEach((r) => draw(r, false));
  doc.moveDown(0.4);
}

function footer(doc, note) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Catatan kaki berada di bawah margin bawah; margin dinolkan sementara agar pdfkit tidak membuat halaman kosong baru
    const mb = doc.page.margins.bottom; doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(7).fillColor('#777').text(`${note} · Halaman ${i + 1} dari ${range.count}`, 48, doc.page.height - 40, { width: 499, align: 'center', lineBreak: false });
    doc.page.margins.bottom = mb;
  }
}

// Diagram radar 5 kebutuhan dasar (skor 4–16) dengan pita kategori: lemah (4–7), mulai melemah (8–12), kuat (13–16)
const RADAR_SHORT = { V1: 'Survival', V2: 'Love & Belonging', V3: 'Power / Achievement', V4: 'Freedom', V5: 'Fun' };
function radarPdf(doc, data, { R = 92 } = {}) {
  ensure(doc, 2 * R + 95);
  const top = doc.y + 8; const cx = 297; const cy = top + R + 34; const n = data.length;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; const r = R * Math.max(0, Math.min(1, (v - 4) / 12)); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
  const polygon = (v) => { const ps = data.map((_, i) => pt(i, v)); doc.moveTo(...ps[0]); ps.slice(1).forEach((p) => doc.lineTo(...p)); doc.closePath(); };
  const TONE = { Kuat: '#22b07d', Rentan: '#e2932a', Lemah: '#ef5a6f' };
  doc.save();
  [[16, '#22b07d'], [12.5, '#e2932a'], [7.5, '#ef5a6f']].forEach(([v, c]) => { polygon(v); doc.fillOpacity(0.14).fill(c); });
  doc.fillOpacity(1).lineWidth(0.6).strokeColor('#c9d2ea');
  [8, 12, 16].forEach((v) => { polygon(v); doc.stroke(); });
  data.forEach((_, i) => { doc.moveTo(cx, cy).lineTo(...pt(i, 16)).stroke(); });
  const ps = data.map((d, i) => pt(i, d.skor));
  doc.moveTo(...ps[0]); ps.slice(1).forEach((p) => doc.lineTo(...p)); doc.closePath();
  doc.fillOpacity(0.22).fillAndStroke('#2f55d4', '#2f55d4'); doc.fillOpacity(1).lineWidth(1.8).strokeColor('#2f55d4');
  doc.moveTo(...ps[0]); ps.slice(1).forEach((p) => doc.lineTo(...p)); doc.closePath().stroke();
  data.forEach((d, i) => { doc.circle(...ps[i], 3.4).fillAndStroke(TONE[d.status] || '#2f55d4', '#ffffff'); });
  doc.restore();
  data.forEach((d, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; const x = cx + (R + 16) * Math.cos(a); const y = cy + (R + 16) * Math.sin(a);
    const w = 110; const left = Math.abs(Math.cos(a)) < 0.2 ? x - w / 2 : Math.cos(a) > 0 ? x : x - w;
    const align = Math.abs(Math.cos(a)) < 0.2 ? 'center' : Math.cos(a) > 0 ? 'left' : 'right';
    const ty = Math.sin(a) < -0.5 ? y - 22 : Math.sin(a) > 0.5 ? y - 2 : y - 10;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#111').text(RADAR_SHORT[d.kode] || d.nama, left, ty, { width: w, align });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(TONE[d.status] || '#111').text(`${d.skor}/${d.max}`, left, ty + 10, { width: w, align });
  });
  const ly = cy + R + 34; doc.font('Helvetica').fontSize(7.5);
  [['#22b07d', 'Kuat (13-16)'], ['#e2932a', 'Mulai melemah (8-12)'], ['#ef5a6f', 'Sedang lemah (4-7)']].forEach(([c, t], i) => { const lx = 170 + i * 95; doc.save().fillOpacity(0.5).rect(lx, ly + 1, 8, 8).fill(c).restore(); doc.fillColor('#555').text(t, lx + 11, ly, { width: 85 }); });
  doc.fillColor('#111'); doc.x = 48; doc.y = ly + 18;
}

const normDesc = (norm, kat) => NORMS[norm].batas.find((x) => x[1] === kat)?.[2] || '-';

function assessmentReport(res, { student, prodi, a, previous = [], brand, kampus }) {
  const doc = start(res, `laporan-ikdkm-m-${student.nim_nip}-${a.diisi_pada.slice(0, 10)}.pdf`);
  kop(doc, 'LAPORAN HASIL ASESMEN IKDKM-M', 'Inventori Kebutuhan Dukungan Kekuatan Mental Mahasiswa', brand);
  kv(doc, [['Nama', student.nama], ['NIM', student.nim_nip], ['Perguruan tinggi', kampus || '-'], ['Program studi', prodi || '-'], ['Tanggal pengisian', fmt(a.diisi_pada)], ['Periode yang dinilai', '2 minggu terakhir']]);

  h2(doc, 'Ringkasan skor');
  table(doc, ['Komponen', 'Skor', 'Rentang', 'Kategori', 'Makna'], [
    ['Indeks Total Kekuatan Mental', a.skor_total, '28–112', a.kategori_total, `${normDesc('total', a.kategori_total)} · ${a.tahap_layanan || ''}`],
    ['Pemenuhan 5 kebutuhan dasar', a.skor_fondasi, '20–80', a.kategori_fondasi, normDesc('fondasi', a.kategori_fondasi)],
    ['Kendali diri & kebiasaan baik', a.skor_otot, '8–32', a.kategori_otot, normDesc('otot', a.kategori_otot)],
  ], [150, 40, 50, 60, 199]);

  h2(doc, 'Skor 5 kebutuhan dasar');
  table(doc, ['Kebutuhan', 'Skor', 'Rentang', 'Kategori', 'Status'], a.dimensi.filter((d) => d.bagian === 1).map((d) => [`${DIMENSIONS.find((x) => x.kode === d.kode).mudah} (${d.label})`, d.skor, `${d.min}–${d.max}`, d.kategori, d.melemah ? `Melemah (maks. ${d.bagian === 2 ? 24 : 12})` : 'Tidak melemah']), [210, 40, 55, 60, 134]);

  h2(doc, 'Kesiapan dibantu (Bagian 3) & posisi kekuatan mental');
  table(doc, ['Butir', 'Jenis dukungan', 'Jawaban', 'Siap'], a.dukungan.map((x) => [x.no, `${x.nama} — ${x.layanan}`, x.jawaban, x.siap ? 'Ya' : 'Tidak']), [40, 300, 80, 79]);
  kv(doc, [['Posisi', `${QUADRANTS[a.kuadran]?.nama || '-'} — ${QUADRANTS[a.kuadran]?.makna || ''}`]]);
  if (a.klaim?.length) {
    h2(doc, 'Profil pelemahan (interpretasi berbasis William Glasser)');
    table(doc, ['Pelemahan', 'Klaim interpretasi'], a.klaim.map((k) => [k.nama, k.klaim]), [150, 349]);
    if (a.butir_pemicu?.length) {
      const lbl = Object.fromEntries(SCALE);
      table(doc, ['Butir', 'Pernyataan', 'Jawaban', 'Skor'], a.butir_pemicu.map((b) => { const it = ITEMS.find((x) => x.no === b.no); return [`${b.no} (${it.arah})`, it.teks, lbl[b.jawaban], b.skor]; }), [45, 330, 80, 44]);
    }
  }
  if (a.penanda?.butuh_bantuan_segera) { ensure(doc, 30); doc.font('Helvetica-Bold').fillColor('#b00').text('Penanda butuh bantuan segera: aktif — tindak lanjuti sesuai SOP krisis.').fillColor('#000').font('Helvetica'); }

  if (previous.length > 1) {
    h2(doc, 'Perkembangan dari waktu ke waktu');
    table(doc, ['Tanggal', 'Indeks', 'Kategori', '5 Kebutuhan Dasar', 'Kendali diri'], previous.map((x) => [new Date(x.diisi_pada).toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta' }), x.skor_total, x.kategori_total, x.skor_fondasi, x.skor_otot]), [130, 70, 110, 90, 99]);
  }

  ensure(doc, 120); // judul tidak dibiarkan sendirian di bawah halaman
  h2(doc, 'Apa artinya hasil ini?');
  const iv = a.penjelasan;
  if (iv) {
    const COL = { amber: '#d97706', pink: '#db2777', violet: '#7c3aed', teal: '#0d9488', green: '#16a34a', blue: '#2563eb' };
    const STC = { ok: '#16a34a', warn: '#d97706', crit: '#dc2626' };
    ensure(doc, 60);
    doc.font('Helvetica-Bold').fontSize(12).fillColor(STC[{ Tangguh: 'ok', Rentan: 'warn', Krisis: 'crit' }[iv.ringkasan.kategori]]).text(iv.ringkasan.judul).fillColor('#111');
    doc.font('Helvetica').fontSize(9.5).text(iv.ringkasan.pesan, { align: 'justify' }).moveDown(0.4);
    if (iv.kekuatan.length) doc.font('Helvetica-Bold').text('Sedang kuat: ', { continued: true }).font('Helvetica').text(iv.kekuatan.map((k) => k.nama).join(', '));
    if (iv.perlu.length) doc.font('Helvetica-Bold').text('Perlu dikuatkan: ', { continued: true }).font('Helvetica').text(iv.perlu.map((k) => k.nama).join(', '));
    doc.moveDown(0.5);
    if (iv.radar?.length) radarPdf(doc, iv.radar);
    for (const bg of iv.bagian) {
      const lines = `${bg.makna}\nCoba: ${bg.coba}`;
      ensure(doc, doc.heightOfString(lines, { width: 470 }) + 30);
      const y = doc.y; doc.rect(48, y, 4, 14).fill(COL[bg.warna] || '#2f55d4');
      doc.font('Helvetica-Bold').fontSize(10).fillColor(COL[bg.warna] || '#2f55d4').text(`${bg.nama}  `, 58, y + 1, { continued: true }).fillColor(STC[bg.nada]).fontSize(8.5).text(`${bg.status_label} · ${bg.skor}/${bg.max}`);
      doc.fillColor('#111').font('Helvetica').fontSize(9).text(bg.makna, 58, doc.y + 1, { width: 487 });
      doc.fillColor('#555').text(`Coba: ${bg.coba}`, 58, doc.y, { width: 487 }).fillColor('#111').moveDown(0.5);
      doc.x = 48;
    }
    if (iv.langkah.length) { h2(doc, 'Langkah selanjutnya'); iv.langkah.forEach((l, i) => doc.font('Helvetica').fontSize(9.5).text(`${i + 1}. ${l.teks}`)); }
    doc.moveDown(0.4).fontSize(8.5).fillColor('#555').text(iv.catatan, { align: 'justify' }).fillColor('#111').fontSize(9.5);
  } else for (const t of a.interpretasi) { ensure(doc, 40); doc.text(t, { align: 'justify' }).moveDown(0.3); }

  // Raport mahasiswa hanya memuat konten psikoedukasi (layanan lain tidak ditampilkan); konselor tetap melihat semua
  ensure(doc, 80);
  h2(doc, a.klaim ? 'Rekomendasi' : 'Konten Psikoedukasi yang Harus Diakses');
  const rekom = (a.rekomendasi || []).filter((r) => a.klaim || r.jenis === 'konten');
  if (!rekom.length) doc.text('Belum ada rekomendasi.');
  const label = { konten: 'Konten psikoedukasi', konseling: 'Konseling profesional', komunitas: 'Komunitas', peer: 'Konselor sebaya', workbook: 'Konten & Refleksi GURU', relaksasi: 'Ruang Mindfulness', lainnya: 'Lainnya' };
  table(doc, ['Jenis', 'Rekomendasi', 'Alasan / catatan', 'Sumber'], rekom.map((r) => [label[r.jenis], r.judul, r.alasan || '', r.sumber === 'konselor' ? `Konselor${r.oleh ? ` (${r.oleh})` : ''}` : 'Otomatis']), [90, 150, 184, 75]);

  footer(doc, `Dicetak ${fmt(new Date())} · PAN-JALU`);
  doc.end();
}

function registrationForm(res, { form, brand, kampus }) {
  const doc = start(res, `formulir-pendaftaran-konseling-${form.nomor}.pdf`);
  kop(doc, 'FORMULIR PENDAFTARAN KONSELING', `Nomor pendaftaran: ${form.nomor}`, brand);
  h2(doc, 'Data konseli');
  kv(doc, [['Nama', form.nama], ['NIM', form.nim], ['Perguruan tinggi', kampus || '-'], ['Program studi', form.prodi], ['Email', form.email], ['Telepon', form.telepon || '-']]);
  h2(doc, 'Layanan yang diajukan');
  kv(doc, [['Konselor', form.konselor], ['Jadwal', fmt(form.jadwal)], ['Jenis layanan', form.jenis_layanan], ['Mode', form.mode === 'online' ? 'Daring' : 'Luring'], ['Topik masalah', form.topik], ['Status', form.status]]);
  h2(doc, 'Keluhan / hal yang ingin dibicarakan');
  doc.text(form.keluhan || '-', { align: 'justify' });
  h2(doc, `Persetujuan layanan konseling (informed consent, versi ${form.consent_versi})`);
  for (const [judul, isi] of form.consent) { ensure(doc, 50); doc.font('Helvetica-Bold').text(judul).font('Helvetica').text(isi, { align: 'justify' }).moveDown(0.3); }
  doc.moveDown(0.4).font('Helvetica-Bold').text(`Disetujui secara elektronik oleh konseli pada ${fmt(form.disetujui_pada)}.`);
  footer(doc, `Diajukan ${fmt(form.diajukan_pada)} · PAN-JALU`);
  doc.end();
}

module.exports = { start, kop, h2, kv, table, footer, ensure, radarPdf, assessmentReport, registrationForm };
