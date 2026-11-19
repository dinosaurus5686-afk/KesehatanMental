// Pengaturan instrumen IKDKM-M oleh admin (menu Psikometrik): butir aktif/nonaktif, interpretasi kuantitatif (norma)
// dan kualitatif (kalimat interpretasi). Disimpan di institution_config 'instrumen'; nilai bawaan tetap tersimpan
// di kode sehingga bisa dikembalikan kapan saja. Perubahan berlaku untuk asesmen yang diisi setelahnya.
const { getConfig, setConfig, nowIso } = require('./db');
const { ITEMS, DIMENSIONS, NORMS, WEAKNESS } = require('./reference');
const { LIB, SUMMARY } = require('./interpretation');

const clone = (x) => JSON.parse(JSON.stringify(x));
const DEFAULT = {
  norms: clone(NORMS), ambang: Object.fromEntries(Object.entries(WEAKNESS).map(([k, w]) => [k, w.ambang])),
  makna: Object.fromEntries(Object.entries(LIB).map(([k, l]) => [k, { ...l.makna, coba_kuat: l.coba.kuat, coba_lemah: l.coba.lemah }])),
  ringkasan: clone(SUMMARY),
  teks: Object.fromEntries(ITEMS.map((it) => [it.no, { indikator: it.indikator, teks: it.teks }])),
};
// Butir penanda keselamatan tidak boleh dinonaktifkan (dipakai mendeteksi "butuh bantuan segera")
const LOCKED = { 28: 'Penanda gejala emosi & fisik berat (deteksi butuh bantuan segera)', 32: 'Penanda keinginan dibantu konselor (deteksi butuh bantuan segera)' };
const MIN_PER_DIM = 2;

const settings = () => getConfig('instrumen', {}) || {};
const disabledItems = () => (settings().nonaktif || []).map(Number).filter((n) => ITEMS.some((it) => it.no === n));
const isActive = (no) => !disabledItems().includes(Number(no));
const activeItems = () => ITEMS.filter((it) => isActive(it.no));

// Terapkan pengaturan ke objek referensi bersama (dipakai skoring, interpretasi, PDF, dan klien)
function apply() {
  const s = settings();
  // redaksi butir (indikator & pernyataan) yang diubah admin; nomor, dimensi, arah, dan kata kunci tidak berubah
  for (const it of ITEMS) { const o = s.teks?.[it.no] || {}; const d = DEFAULT.teks[it.no]; it.indikator = o.indikator || d.indikator; it.teks = o.teks || d.teks; }
  for (const [k, def] of Object.entries(DEFAULT.norms)) {
    const o = s.norms?.[k];
    NORMS[k].batas = def.batas.map((b, i) => { const x = o?.batas?.[i]; return [x && Number.isFinite(Number(x[0])) ? Number(x[0]) : b[0], b[1], x?.[2] || b[2], ...(b.length > 3 ? [x?.[3] || b[3]] : [])]; });
  }
  for (const k of Object.keys(WEAKNESS)) WEAKNESS[k].ambang = Number.isFinite(Number(s.ambang?.[k])) ? Number(s.ambang[k]) : DEFAULT.ambang[k];
  for (const [k, def] of Object.entries(DEFAULT.makna)) {
    const o = s.makna?.[k] || {};
    for (const st of ['Kuat', 'Rentan', 'Lemah']) LIB[k].makna[st] = o[st] || def[st];
    LIB[k].coba.kuat = o.coba_kuat || def.coba_kuat; LIB[k].coba.lemah = o.coba_lemah || def.coba_lemah;
  }
  for (const [k, def] of Object.entries(DEFAULT.ringkasan)) { const o = s.ringkasan?.[k] || {}; SUMMARY[k].judul = o.judul || def.judul; SUMMARY[k].pesan = o.pesan || def.pesan; }
}

function log(actor, perubahan) {
  const s = settings();
  const riwayat = [{ pada: nowIso(), oleh: actor?.nama || '-', perubahan }, ...(s.riwayat || [])].slice(0, 100);
  return riwayat;
}

function setItemActive(no, aktif, actor) {
  no = Number(no);
  const it = ITEMS.find((x) => x.no === no); if (!it) return { error: 'Butir tidak ditemukan.' };
  const off = new Set(disabledItems());
  if (!aktif) {
    if (LOCKED[no]) return { error: `Butir ${no} tidak bisa dinonaktifkan: ${LOCKED[no]}.` };
    if (it.bagian < 3) {
      const left = ITEMS.filter((x) => x.dimensi === it.dimensi && x.no !== no && !off.has(x.no)).length;
      if (left < MIN_PER_DIM) return { error: `Minimal ${MIN_PER_DIM} butir aktif per dimensi agar skor tetap bermakna.` };
    }
    off.add(no);
  } else off.delete(no);
  const s = settings();
  setConfig('instrumen', { ...s, nonaktif: [...off].sort((a, b) => a - b), riwayat: log(actor, `Butir ${no} ${aktif ? 'diaktifkan' : 'dinonaktifkan'}`) });
  return { ok: true, nonaktif: [...off] };
}

// Ubah redaksi butir. Kosong/sama dengan bawaan = kembali ke bawaan.
function setItemText(no, { indikator, teks } = {}, actor) {
  no = Number(no); const it = ITEMS.find((x) => x.no === no); if (!it) return { error: 'Butir tidak ditemukan.' };
  indikator = String(indikator ?? '').trim().replace(/\s+/g, ' '); teks = String(teks ?? '').trim().replace(/\s+/g, ' ');
  const d = DEFAULT.teks[no];
  if (indikator && (indikator.length < 3 || indikator.length > 120)) return { error: 'Indikator 3–120 karakter.' };
  if (teks && (teks.length < 10 || teks.length > 300)) return { error: 'Pernyataan 10–300 karakter.' };
  const s = settings(); const all = { ...(s.teks || {}) };
  const o = { ...(indikator && indikator !== d.indikator ? { indikator } : {}), ...(teks && teks !== d.teks ? { teks } : {}) };
  const before = { indikator: it.indikator, teks: it.teks };
  if (Object.keys(o).length) all[no] = o; else delete all[no];
  const after = { indikator: o.indikator || d.indikator, teks: o.teks || d.teks };
  const what = [before.indikator !== after.indikator ? 'indikator' : null, before.teks !== after.teks ? 'pernyataan' : null].filter(Boolean);
  if (!what.length) return { ok: true, berubah: false };
  setConfig('instrumen', { ...s, teks: all, riwayat: log(actor, `Butir ${no}: ${what.join(' & ')} diubah${Object.keys(o).length ? '' : ' (kembali ke bawaan)'} — "${after.teks}"`) });
  apply();
  return { ok: true, berubah: true, sebelum: before, sesudah: after };
}

function validateNorms(norms) {
  for (const [k, def] of Object.entries(DEFAULT.norms)) {
    const b = norms?.[k]?.batas; if (!b) continue;
    const mins = b.map((x) => Number(x[0]));
    if (mins.some((m) => !Number.isFinite(m))) return `Batas ${k} harus berupa angka.`;
    if (mins[mins.length - 1] !== def.min) return `Batas terbawah ${k} harus ${def.min}.`;
    for (let i = 0; i < mins.length - 1; i++) if (!(mins[i] > mins[i + 1])) return `Batas ${k} harus berurutan dari kategori tertinggi ke terendah.`;
    if (mins[0] > def.max) return `Batas tertinggi ${k} tidak boleh melebihi ${def.max}.`;
  }
  return null;
}
function saveInterpretation(body, actor) {
  const s = settings(); const next = { ...s };
  const changes = [];
  if (body.norms) { const e = validateNorms(body.norms); if (e) return { error: e }; next.norms = body.norms; changes.push('norma kuantitatif'); }
  if (body.ambang) {
    for (const [k, v] of Object.entries(body.ambang)) { const n = Number(v); const norm = DIMENSIONS.find((d) => d.kode === k)?.bagian === 2 ? NORMS.otot : NORMS.dimensi; if (!Number.isFinite(n) || n < norm.min || n > norm.max) return { error: `Ambang melemah ${k} harus ${norm.min}–${norm.max}.` }; }
    next.ambang = body.ambang; changes.push('ambang melemah');
  }
  if (body.makna) { next.makna = body.makna; changes.push('kalimat interpretasi 5 kebutuhan & kendali diri'); }
  if (body.ringkasan) { next.ringkasan = body.ringkasan; changes.push('kalimat ringkasan indeks'); }
  if (body.reset) { for (const k of ['norms', 'ambang', 'makna', 'ringkasan']) if (body.reset.includes(k)) delete next[k]; changes.push(`kembalikan bawaan: ${body.reset.join(', ')}`); }
  next.riwayat = log(actor, `Interpretasi diubah: ${changes.join('; ') || '-'}`);
  setConfig('instrumen', next); apply();
  return { ok: true };
}

function view() {
  const s = settings(); const off = disabledItems();
  return {
    butir: ITEMS.map((it) => ({ no: it.no, bagian: it.bagian, dimensi: it.dimensi, arah: it.arah, indikator: it.indikator, teks: it.teks, aktif: !off.includes(it.no), terkunci: LOCKED[it.no] || null,
      diubah: !!s.teks?.[it.no], bawaan: DEFAULT.teks[it.no] })),
    norms: NORMS, ambang: Object.fromEntries(Object.entries(WEAKNESS).map(([k, w]) => [k, w.ambang])),
    makna: Object.fromEntries(Object.keys(LIB).map((k) => [k, { ...LIB[k].makna, coba_kuat: LIB[k].coba.kuat, coba_lemah: LIB[k].coba.lemah }])),
    ringkasan: SUMMARY, bawaan: DEFAULT, diubah: { norms: !!s.norms, ambang: !!s.ambang, makna: !!s.makna, ringkasan: !!s.ringkasan },
    riwayat: s.riwayat || [], min_per_dimensi: MIN_PER_DIM,
  };
}

module.exports = { apply, activeItems, isActive, disabledItems, setItemActive, setItemText, saveInterpretation, view, LOCKED, DEFAULT };
