// Raport diri konselor: per kegiatan (satu refleksi) atau per periode (mingguan, bulanan, semesteran, tahunan),
// diekspor ke PDF, DOCX, atau Excel.
const ExcelJS = require('exceljs');
const docx = require('docx');
const { all, get, getConfig } = require('./db');
const { dec } = require('./security');
const pdfx = require('./pdf');
const { COUNSELOR_GURU } = require('./reference');

const PERIODS = { minggu: ['Mingguan', 7], bulan: ['Bulanan', 30], semester: ['Semesteran', 182], tahun: ['Tahunan', 365] };
const fmtD = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '-');
const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '-');
const avg = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);

const reflView = (x) => ({ id: x.id, tanggal: x.tanggal_kegiatan || x.created_at.slice(0, 10), jenis_layanan: x.jenis_layanan, rating: x.rating, ground: dec(x.ground), understand: dec(x.understand), revise: dec(x.revise), use: dec(x.use_), created_at: x.created_at });

// Indikator kinerja untuk rentang waktu tertentu
function performance(uid, days) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const done = all("SELECT id, student_id, jadwal FROM appointments WHERE counselor_id = ? AND status = 'selesai' AND jadwal >= ?", uid, since);
  const ratings = all('SELECT f.rating FROM counseling_feedback f JOIN appointments a ON a.id = f.appointment_id WHERE a.counselor_id = ? AND a.jadwal >= ?', uid, since).map((x) => x.rating);
  const sla = Number(getConfig('sla_menit', 30));
  const acks = all('SELECT created_at, ditindaklanjuti_pada FROM risk_alerts WHERE ditindaklanjuti_oleh = ? AND created_at >= ?', uid, since);
  const within = acks.filter((x) => (new Date(x.ditindaklanjuti_pada) - new Date(x.created_at)) / 60000 <= sla).length;
  const responded = all('SELECT created_at, updated_at FROM appointments WHERE counselor_id = ? AND created_at >= ? AND status != ?', uid, since, 'pending');
  const refl = all('SELECT * FROM counselor_reflections WHERE counselor_id = ? AND COALESCE(tanggal_kegiatan, substr(created_at, 1, 10)) >= ? ORDER BY COALESCE(tanggal_kegiatan, created_at) DESC', uid, since.slice(0, 10)).map(reflView);
  return {
    sejak: since, sesi_selesai: done.length, klien_unik: new Set(done.map((d) => d.student_id)).size,
    rating_rata: avg(ratings), jumlah_rating: ratings.length, krisis_ditangani: acks.length, kepatuhan_sla: acks.length ? Math.round((within / acks.length) * 100) : null, sla_menit: sla,
    rata_respons_reservasi_jam: responded.length ? Math.round(responded.reduce((s, a) => s + (new Date(a.updated_at) - new Date(a.created_at)) / 3600000, 0) / responded.length) : null,
    refleksi: refl, rating_diri_rata: avg(refl.map((r) => r.rating).filter(Boolean)), jumlah_kegiatan: refl.length,
  };
}

function reportData(user, { period, id }) {
  const c = get('SELECT spesialisasi FROM counselors WHERE user_id = ?', user.id);
  const base = { konselor: user.nama, nip: user.nim_nip, spesialisasi: c?.spesialisasi || '-', dicetak: new Date().toISOString() };
  if (period === 'kegiatan') {
    const x = get('SELECT * FROM counselor_reflections WHERE id = ? AND counselor_id = ?', id, user.id);
    if (!x) return null;
    const r = reflView(x);
    return { ...base, jenis: 'kegiatan', judul: 'RAPORT DIRI KONSELOR — PER KEGIATAN', label: `Kegiatan ${fmtD(r.tanggal)} · ${r.jenis_layanan}`, refleksi: [r], kpi: null };
  }
  const [nama, days] = PERIODS[period] || PERIODS.bulan;
  const p = performance(user.id, days);
  return { ...base, jenis: period, judul: `RAPORT DIRI KONSELOR — ${nama.toUpperCase()}`, label: `Periode ${fmtD(p.sejak)} – ${fmtD(base.dicetak)}`, refleksi: p.refleksi, kpi: p,
    supervisor: all('SELECT periode, kekuatan, area_pengembangan, created_at FROM supervisor_notes WHERE counselor_id = ? ORDER BY created_at DESC', user.id) };
}

const kpiRows = (k) => [
  ['Sesi konseling selesai', k.sesi_selesai], ['Klien unik', k.klien_unik],
  ['Rating dari mahasiswa (rata-rata)', k.rating_rata != null ? `${k.rating_rata} / 5 (${k.jumlah_rating} penilaian)` : '-'],
  ['Rating diri (rata-rata refleksi)', k.rating_diri_rata != null ? `${k.rating_diri_rata} / 5 (${k.jumlah_kegiatan} kegiatan)` : '-'],
  ['Kasus krisis ditangani', k.krisis_ditangani], [`Kepatuhan SLA krisis (${k.sla_menit} menit)`, k.kepatuhan_sla != null ? `${k.kepatuhan_sla}%` : '-'],
  ['Rata-rata respons reservasi', k.rata_respons_reservasi_jam != null ? `${k.rata_respons_reservasi_jam} jam` : '-'],
];
const STAGE = Object.fromEntries(COUNSELOR_GURU.map((g) => [g.kode, g]));

function toPdf(res, d, filename) {
  const doc = pdfx.start(res, filename);
  pdfx.kop(doc, d.judul, d.label, d.brand);
  pdfx.kv(doc, [['Nama konselor', d.konselor], ['NIP', d.nip], ['Spesialisasi', d.spesialisasi]]);
  if (d.kpi) { pdfx.h2(doc, 'Indikator kinerja'); pdfx.table(doc, ['Indikator', 'Capaian'], kpiRows(d.kpi), [300, 199]); }
  pdfx.h2(doc, `Refleksi kinerja model GURU (${d.refleksi.length} kegiatan)`);
  if (!d.refleksi.length) doc.text('Belum ada refleksi pada periode ini.');
  for (const r of d.refleksi) {
    doc.moveDown(0.3).font('Helvetica-Bold').fontSize(10).fillColor('#1d3a9e').text(`${fmtD(r.tanggal)} · ${r.jenis_layanan}`).fillColor('#111')
      .font('Helvetica').fontSize(9).text(`Rating diri: ${r.rating ? `${r.rating}/5` : '-'}`);
    pdfx.table(doc, ['Tahap', 'Isi refleksi'], COUNSELOR_GURU.map((g) => [`${g.nama}\n${g.tanya}`, r[g.kode] || '-']), [190, 309]);
  }
  if (d.supervisor?.length) { pdfx.h2(doc, 'Catatan supervisor'); pdfx.table(doc, ['Periode', 'Kekuatan', 'Area pengembangan'], d.supervisor.map((s) => [s.periode, s.kekuatan, s.area_pengembangan]), [100, 200, 199]); }
  pdfx.footer(doc, `Dicetak ${fmtD(d.dicetak)} · PAN-JALU`);
  doc.end();
}

async function toXlsx(d) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'PAN-JALU UNP Kediri';
  const s = wb.addWorksheet('Ringkasan');
  s.addRows([[d.judul], [d.label], [], ['Nama konselor', d.konselor], ['NIP', d.nip], ['Spesialisasi', d.spesialisasi], [], ...(d.kpi ? [['Indikator kinerja', 'Capaian'], ...kpiRows(d.kpi)] : [])]);
  s.getRow(1).font = { bold: true, size: 14 }; s.getColumn(1).width = 40; s.getColumn(2).width = 40;
  const w = wb.addWorksheet('Refleksi GURU');
  w.columns = [{ header: 'Tanggal', key: 'tanggal', width: 14 }, { header: 'Jenis layanan', key: 'jenis_layanan', width: 26 }, { header: 'Rating diri (1–5)', key: 'rating', width: 16 },
    ...COUNSELOR_GURU.map((g) => ({ header: `${g.nama}: ${g.tanya}`, key: g.kode, width: 45 }))];
  w.addRows(d.refleksi); w.getRow(1).font = { bold: true }; w.getRow(1).alignment = { wrapText: true, vertical: 'top' };
  w.eachRow((row, i) => { if (i > 1) row.alignment = { wrapText: true, vertical: 'top' }; });
  if (d.supervisor?.length) { const v = wb.addWorksheet('Catatan Supervisor'); v.columns = [{ header: 'Periode', key: 'periode', width: 16 }, { header: 'Kekuatan', key: 'kekuatan', width: 50 }, { header: 'Area pengembangan', key: 'area_pengembangan', width: 50 }]; v.addRows(d.supervisor); v.getRow(1).font = { bold: true }; }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function toDocx(d) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, ShadingType } = docx;
  const p = (text, opts = {}) => new Paragraph({ children: [new TextRun({ text: String(text ?? '-'), ...opts })], spacing: { after: 80 } });
  const cell = (text, head = false, w = 50) => new TableCell({ width: { size: w, type: WidthType.PERCENTAGE }, shading: head ? { type: ShadingType.CLEAR, fill: 'E8EDF9', color: 'auto' } : undefined,
    children: String(text ?? '-').split('\n').map((t) => new Paragraph({ children: [new TextRun({ text: t, bold: head, size: 19 })] })) });
  const table = (head, rows, widths) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, true, widths[i])) }), ...rows.map((r) => new TableRow({ children: r.map((c, i) => cell(c, false, widths[i])) }))] });
  const children = [
    ...require('./branding').docxKop(docx, d.brand),
    new Paragraph({ alignment: AlignmentType.CENTER, heading: HeadingLevel.HEADING_1, spacing: { before: 200 }, children: [new TextRun({ text: d.judul, bold: true, size: 26, color: '1D3A9E' })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: d.label, size: 20, color: '555555' })] }),
    p(`Nama konselor: ${d.konselor}`), p(`NIP: ${d.nip}`), p(`Spesialisasi: ${d.spesialisasi}`),
  ];
  if (d.kpi) children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun({ text: 'Indikator kinerja', color: '1D3A9E' })] }), table(['Indikator', 'Capaian'], kpiRows(d.kpi), [60, 40]));
  children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun({ text: `Refleksi kinerja model GURU (${d.refleksi.length} kegiatan)`, color: '1D3A9E' })] }));
  if (!d.refleksi.length) children.push(p('Belum ada refleksi pada periode ini.'));
  for (const r of d.refleksi) {
    children.push(new Paragraph({ spacing: { before: 200, after: 60 }, children: [new TextRun({ text: `${fmtD(r.tanggal)} · ${r.jenis_layanan}`, bold: true }), new TextRun({ text: `   Rating diri: ${stars(r.rating)}`, color: 'B7791F' })] }));
    children.push(table(['Tahap', 'Isi refleksi'], COUNSELOR_GURU.map((g) => [`${g.nama}\n${g.tanya}`, r[g.kode] || '-']), [38, 62]));
  }
  if (d.supervisor?.length) children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240 }, children: [new TextRun({ text: 'Catatan supervisor', color: '1D3A9E' })] }), table(['Periode', 'Kekuatan', 'Area pengembangan'], d.supervisor.map((s) => [s.periode, s.kekuatan, s.area_pengembangan]), [20, 40, 40]));
  children.push(new Paragraph({ spacing: { before: 300 }, children: [new TextRun({ text: `Dicetak ${fmtD(d.dicetak)} · PAN-JALU`, size: 16, color: '777777' })] }));
  return Packer.toBuffer(new Document({ creator: 'PAN-JALU', title: d.judul, styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } }, sections: [{ children }] }));
}

module.exports = { performance, reportData, toPdf, toXlsx, toDocx, PERIODS, STAGE };
