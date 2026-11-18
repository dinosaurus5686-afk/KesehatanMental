// Raport Catatan Perkembangan Kekuatan Mental (PDF & Word) dari data progressReport()
const docx = require('docx');
const pdfx = require('./pdf');

const fmtD = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '-');
const katLabel = (k) => (k === 'Rentan' ? 'Mulai melemah' : k === 'Lemah' ? 'Sedang lemah' : k || '-');
const sign = (c) => (c === null || c === undefined ? '-' : c > 0 ? `+${c}` : String(c));
const hariAktif = (k) => k.hari.map((v, i) => (v ? i + 1 : null)).filter(Boolean).join(', ') || '-';

// Baris-baris tabel yang dipakai bersama oleh PDF & Word
function rows(d) {
  const h = d.hasil;
  return {
    identitas: [['Nama', d.mahasiswa.nama], ['NIM', d.mahasiswa.nim], ['Program studi', d.mahasiswa.prodi || '-'], ['Perguruan tinggi', d.mahasiswa.kampus || '-'], ['Periode', d.label]],
    kebiasaan: d.kebiasaan.map((k) => [k.nama, `${k.hari_aktif} dari ${d.hari_berjalan} hari`, `${k.persen}%`, hariAktif(k)]),
    indikator: d.indikator.map((x) => [x.nama, `${x.skor}/${x.max}`, sign(x.perubahan), katLabel(x.kategori)]),
    konten: d.konten_wajib.item.map((x) => [x.judul, x.alasan || '-', x.refleksi ? 'Sudah dibuka & direfleksikan (GURU)' : x.dibuka ? 'Sudah dibuka' : 'Belum dibuka']),
    banding: [...d.banding.fitur.map((f) => [f.nama, `${f.lalu} hari`, `${f.sekarang} hari`, sign(f.sekarang - f.lalu)]),
      ['Rata-rata suasana hati', d.banding.mood.lalu ?? '-', d.banding.mood.sekarang ?? '-', d.banding.mood.lalu !== null && d.banding.mood.sekarang !== null ? sign(Math.round((d.banding.mood.sekarang - d.banding.mood.lalu) * 10) / 10) : '-']],
    goals: d.goals.map((g) => [g.isi_teks, g.minggu_ke, g.selesai ? 'Tercapai' : 'Belum']),
    hasil: [['Asesmen diisi', h.asesmen], ['Indeks Kekuatan Mental terakhir', h.indeks_akhir !== null ? `${h.indeks_akhir}/112 (${h.kategori_akhir})` : '-'], ['Perubahan indeks', sign(h.perubahan_indeks)],
      ['Menit menenangkan diri', h.menit_tenang], ['Konten psikoedukasi dibuka', h.konten_dibuka], ['Refleksi GURU', h.refleksi_guru], ['Jurnal', h.jurnal], ['Check-in suasana hati', h.checkin],
      ['Goals tercapai', `${h.goals_selesai}/${h.goals_total}`], ['Sesi konseling selesai', h.sesi_konseling], ['Diskusi komunitas', h.diskusi]],
  };
}
const JUDUL = 'CATATAN PERKEMBANGAN KEKUATAN MENTAL';
const CATATAN = 'Catatan ini membantu memantau diri, bukan pengganti layanan kesehatan mental profesional. Bila merasa sangat terbebani, daftar konseling melalui PAN-JALU.';

// Kisi titik kebiasaan harian (seperti di Beranda)
function habitGrid(doc, d) {
  const x0 = 48; const nameW = 128; const pctW = 34; const n = d.jumlah_hari; const cw = (499 - nameW - pctW) / n; const rh = 15;
  pdfx.ensure(doc, rh * (d.kebiasaan.length + 1) + 10);
  let y = doc.y;
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#111');
  doc.rect(x0, y, 499, rh).fillAndStroke('#e8edf9', '#c9d2ea').fillColor('#111');
  doc.fontSize(7.5).text('Kebiasaan', x0 + 3, y + 4, { width: nameW - 6, lineBreak: false });
  for (let i = 0; i < n; i++) doc.fontSize(6).text(String(i + 1), x0 + nameW + cw * i, y + 4.5, { width: cw, align: 'center', lineBreak: false });
  doc.fontSize(6.5).text('%', x0 + nameW + cw * n, y + 4.5, { width: pctW, align: 'center', lineBreak: false });
  for (const k of d.kebiasaan) {
    y += rh;
    doc.rect(x0, y, 499, rh).strokeColor('#d5dbea').stroke();
    for (let i = 0; i < n; i++) {
      const cx = x0 + nameW + cw * i;
      if (i + 1 > d.hari_berjalan) doc.save().fillOpacity(0.5).rect(cx, y, cw, rh).fill('#eef1f7').restore();
      if (k.hari[i]) doc.circle(cx + cw / 2, y + rh / 2, 2.6).fill('#2f55d4');
      doc.moveTo(cx, y).lineTo(cx, y + rh).lineWidth(0.3).strokeColor('#e1e6f2').stroke();
    }
    doc.font('Helvetica').fontSize(7.5).fillColor('#111').text(k.nama, x0 + 3, y + 4, { width: nameW - 6, lineBreak: false });
    doc.font('Helvetica-Bold').fillColor(k.persen >= 70 ? '#16a34a' : k.persen >= 30 ? '#c2410c' : '#777').text(`${k.persen}%`, x0 + nameW + cw * n, y + 4, { width: pctW, align: 'center', lineBreak: false });
  }
  doc.lineWidth(1).fillColor('#111'); doc.x = x0; doc.y = y + rh + 4;
  doc.font('Helvetica').fontSize(7.5).fillColor('#555').text(`Titik = kebiasaan tercatat di aplikasi pada hari itu. Persentase dari ${d.hari_berjalan} hari ${d.hari_berjalan < d.jumlah_hari ? 'yang sudah berjalan ' : ''}di ${d.label}.`).fillColor('#111');
}

function toPdf(res, d, filename) {
  const doc = pdfx.start(res, filename); const t = rows(d);
  pdfx.kop(doc, JUDUL, `Periode ${d.label}`, d.mahasiswa.kampus || undefined);
  pdfx.table(doc, ['Data', 'Keterangan'], t.identitas, [150, 349]);
  pdfx.h2(doc, `Pelacak Kebiasaan Harian · ${d.label}`); habitGrid(doc, d);
  pdfx.h2(doc, 'Indikator Kekuatan Mental');
  if (d.indikator.length) {
    doc.font('Helvetica').fontSize(8.5).fillColor('#555').text(`Dari asesmen IKDKM-M terakhir (${fmtD(d.konten_wajib.asesmen_pada)}); perubahan dibanding asesmen sebelumnya.`).fillColor('#111');
    if (d.radar.length) pdfx.radarPdf(doc, d.radar, { R: 80 });
    pdfx.table(doc, ['Indikator', 'Skor', 'Perubahan', 'Kategori'], t.indikator, [230, 80, 80, 109]);
  } else doc.text('Belum ada data asesmen. Isi asesmen IKDKM-M untuk melihat indikator kekuatan mental.');
  pdfx.h2(doc, 'Refleksi Bulanan');
  pdfx.table(doc, ['Aspek', 'Catatan'], d.refleksi, [150, 349]);
  pdfx.h2(doc, 'Konten Psikoedukasi yang Harus Diakses');
  if (t.konten.length) pdfx.table(doc, ['Konten', 'Alasan', 'Status'], t.konten, [200, 179, 120]); else doc.text('Belum ada konten yang direkomendasikan dari asesmen terakhir.');
  pdfx.h2(doc, 'Dibanding Bulan Lalu');
  pdfx.table(doc, ['Fitur', d.banding.bulan_lalu, d.label, 'Perubahan'], t.banding, [200, 105, 105, 89]);
  pdfx.h2(doc, 'Goals SMART & Hasilnya');
  if (t.goals.length) pdfx.table(doc, ['Goal / komitmen', 'Minggu', 'Hasil'], t.goals, [320, 90, 89]); else doc.text('Belum ada goal pada bulan ini.');
  pdfx.h2(doc, `Hasil Bulan ${d.label}`);
  const pairs = []; for (let i = 0; i < t.hasil.length; i += 2) pairs.push([...t.hasil[i], ...(t.hasil[i + 1] || ['', ''])]);
  pdfx.table(doc, ['Capaian', 'Jumlah', 'Capaian', 'Jumlah'], pairs, [165, 85, 165, 84]);
  pdfx.ensure(doc, 40);
  doc.moveDown(0.5).font('Helvetica-Oblique').fontSize(8).fillColor('#555').text(`${CATATAN} Disusun otomatis dari rekam jejak di PAN-JALU (bukan AI).`).fillColor('#111');
  pdfx.footer(doc, `Dicetak ${fmtD(new Date())} · PAN-JALU`);
  doc.end();
}

async function toDocx(d) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, ShadingType } = docx;
  const t = rows(d);
  const p = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text: String(text ?? '-'), ...opts })], spacing: { after: 80 } });
  const h2 = (text) => new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 100 }, children: [new TextRun({ text, color: '1D3A9E', bold: true, size: 24 })] });
  const cell = (text, head = false, w = 50) => new TableCell({ width: { size: w, type: WidthType.PERCENTAGE }, shading: head ? { type: ShadingType.CLEAR, fill: 'E8EDF9', color: 'auto' } : undefined,
    children: String(text ?? '-').split('\n').map((x) => new Paragraph({ children: [new TextRun({ text: x, bold: head, size: 19 })] })) });
  const table = (head, body, widths) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: head.map((x, i) => cell(x, true, widths[i])) }), ...body.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, widths[i])) }))] });
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(d.mahasiswa.kampus || 'Universitas Nusantara PGRI Kediri').toUpperCase(), bold: true, size: 26 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Unit Layanan Konseling — PAN-JALU', size: 20 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, spacing: { before: 200 }, children: [new TextRun({ text: JUDUL, bold: true, size: 28, color: '1D3A9E' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: `Periode ${d.label}`, size: 20, color: '555555' })] }),
    table(['Data', 'Keterangan'], t.identitas, [30, 70]),
    h2(`Pelacak Kebiasaan Harian · ${d.label}`),
    table(['Kebiasaan', 'Hari aktif', '% tuntas', 'Tanggal tercatat'], t.kebiasaan, [30, 22, 13, 35]),
    p(`Persentase dihitung dari ${d.hari_berjalan} hari ${d.hari_berjalan < d.jumlah_hari ? 'yang sudah berjalan ' : ''}di ${d.label}.`, { size: 17, color: '666666' }),
    h2('Indikator Kekuatan Mental'),
    ...(d.indikator.length ? [p(`Dari asesmen IKDKM-M terakhir (${fmtD(d.konten_wajib.asesmen_pada)}); perubahan dibanding asesmen sebelumnya.`, { size: 17, color: '666666' }), table(['Indikator', 'Skor', 'Perubahan', 'Kategori'], t.indikator, [46, 16, 16, 22])]
      : [p('Belum ada data asesmen. Isi asesmen IKDKM-M untuk melihat indikator kekuatan mental.')]),
    h2('Refleksi Bulanan'), table(['Aspek', 'Catatan'], d.refleksi, [30, 70]),
    h2('Konten Psikoedukasi yang Harus Diakses'),
    t.konten.length ? table(['Konten', 'Alasan', 'Status'], t.konten, [40, 36, 24]) : p('Belum ada konten yang direkomendasikan dari asesmen terakhir.'),
    h2('Dibanding Bulan Lalu'), table(['Fitur', d.banding.bulan_lalu, d.label, 'Perubahan'], t.banding, [40, 21, 21, 18]),
    h2('Goals SMART & Hasilnya'), t.goals.length ? table(['Goal / komitmen', 'Minggu', 'Hasil'], t.goals, [64, 18, 18]) : p('Belum ada goal pada bulan ini.'),
    h2(`Hasil Bulan ${d.label}`), table(['Capaian', 'Jumlah'], t.hasil, [60, 40]),
    new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: `${CATATAN} Disusun otomatis dari rekam jejak di PAN-JALU (bukan AI).`, italics: true, size: 17, color: '555555' })] }),
    new Paragraph({ children: [new TextRun({ text: `Dicetak ${fmtD(new Date())} · PAN-JALU`, size: 16, color: '777777' })] }),
  ];
  return Packer.toBuffer(new Document({ creator: 'PAN-JALU', title: JUDUL, styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } }, sections: [{ children }] }));
}

module.exports = { toPdf, toDocx };
