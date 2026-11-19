// Pencetak laporan analisis psikometrik ke Excel (.xlsx) dan Word (.docx).
// Laporan: { judul, info: [baris teks], bagian: [{ judul, catatan?, kolom?: [..], baris?: [[..]], pre?: 'teks monospace' }] }
const ExcelJS = require('exceljs');
const docx = require('docx');

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const idNum = (v, d = 3) => (isNum(v) ? (Number.isInteger(v) ? String(v) : v.toFixed(d).replace(/\.?0+$/, '').replace('.', ',').replace(/^-0$/, '0')) : v === null || v === undefined ? '—' : String(v));

async function toXlsx(rep) {
  const wb = new ExcelJS.Workbook(); wb.creator = 'PAN-JALU'; wb.created = new Date();
  const info = wb.addWorksheet('Keterangan');
  info.addRow([rep.judul]).font = { bold: true, size: 14 };
  for (const l of rep.info || []) info.addRow([l]);
  info.addRow([]); info.addRow(['Isi berkas:']).font = { bold: true };
  const used = new Set(['Keterangan']);
  const sheetName = (t) => { let n = String(t).replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Tabel'; let k = 2; const base = n.slice(0, 28); while (used.has(n)) n = `${base} ${k++}`; used.add(n); return n; };
  rep.bagian.forEach((b, i) => {
    const name = sheetName(b.sheet || b.judul); info.addRow([`${i + 1}. ${b.judul}  →  lembar "${name}"`]);
    const ws = wb.addWorksheet(name);
    ws.addRow([b.judul]).font = { bold: true, size: 12 };
    if (b.catatan) for (const l of [].concat(b.catatan)) ws.addRow([l]).font = { italic: true, color: { argb: 'FF5B6482' } };
    if (b.pre) { ws.addRow([]); for (const l of b.pre.split('\n')) ws.addRow([l]).font = { name: 'Consolas', size: 10 }; ws.getColumn(1).width = 110; }
    if (b.kolom) {
      ws.addRow([]); const h = ws.addRow(b.kolom); h.font = { bold: true, color: { argb: 'FFFFFFFF' } }; h.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F55D4' } }; c.alignment = { wrapText: true, vertical: 'middle' }; });
      for (const r of b.baris || []) ws.addRow(r.map((v) => (v === null || v === undefined ? '' : v)));
      b.kolom.forEach((k, j) => { const lens = [String(k).length, ...(b.baris || []).slice(0, 300).map((r) => String(r[j] ?? '').length)]; ws.getColumn(j + 1).width = Math.min(60, Math.max(8, Math.max(...lens) + 2)); });
      ws.views = [{ state: 'frozen', ySplit: ws.rowCount - (b.baris || []).length }];
    }
  });
  info.getColumn(1).width = 120;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function toDocx(rep, { maxRows = 1500 } = {}) {
  const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, ShadingType, PageOrientation } = docx;
  const cell = (t, head = false, size = 16) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(t), bold: head, size, color: head ? 'FFFFFF' : undefined })] })], shading: head ? { type: ShadingType.CLEAR, color: 'auto', fill: '2F55D4' } : undefined, margins: { top: 30, bottom: 30, left: 60, right: 60 } });
  const children = [new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: rep.judul, bold: true })] })];
  for (const l of rep.info || []) children.push(new Paragraph({ children: [new TextRun({ text: l, size: 19, color: '5B6482' })] }));
  for (const b of rep.bagian) {
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 280 }, children: [new TextRun(b.judul)] }));
    for (const l of [].concat(b.catatan || [])) children.push(new Paragraph({ children: [new TextRun({ text: l, italics: true, size: 18, color: '5B6482' })] }));
    if (b.pre) for (const l of b.pre.split('\n')) children.push(new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: l || ' ', font: 'Consolas', size: 14 })] }));
    if (b.kolom) {
      const rows = (b.baris || []).slice(0, maxRows); const size = b.kolom.length > 10 ? 13 : b.kolom.length > 7 ? 15 : 17;
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ tableHeader: true, children: b.kolom.map((k) => cell(k, true, size)) }), ...rows.map((r) => new TableRow({ children: r.map((v) => cell(idNum(v), false, size)) }))] }));
      if ((b.baris || []).length > maxRows) children.push(new Paragraph({ children: [new TextRun({ text: `Menampilkan ${maxRows} dari ${b.baris.length} baris; data lengkap tersedia pada unduhan Excel.`, italics: true, size: 16 })] }));
    }
  }
  const doc = new Document({ creator: 'PAN-JALU', title: rep.judul, styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{ properties: { page: { size: { orientation: PageOrientation.LANDSCAPE }, margin: { top: 720, bottom: 720, left: 720, right: 720 } } }, children }] });
  return Packer.toBuffer(doc);
}

module.exports = { toXlsx, toDocx, idNum };
