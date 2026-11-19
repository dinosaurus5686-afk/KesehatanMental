// Admin: Monitoring Asesmen (profil kekuatan mental nasional) & Psikometrik (kehandalan instrumen IKDKM-M).
import { state, api, download, esc, actions, forms, changeHandlers, openModal, closeModal, toast, fmtDT, fmtDate, lineChart, toneCat, radarChart, confirmBox } from './core.js';
import { rerender } from './app.js';

// ---------- penyaring bersama: wilayah, demografi, periode ----------
export const AF = { provinsi: '', kota: '', universitas: '', fakultas: '', prodi: '', gender: '', umur: '', tingkat: '', jenjang: '', angkatan: '', dari: '', sampai: '', mode: 'terbaru' };
const CASCADE = { provinsi: ['kota', 'universitas', 'fakultas', 'prodi'], kota: ['universitas', 'fakultas', 'prodi'], universitas: ['fakultas', 'prodi'], fakultas: ['prodi'] };
export const afQs = (extra = {}) => new URLSearchParams(Object.fromEntries(Object.entries({ ...AF, ...extra }).filter(([, v]) => v !== '' && v != null))).toString();
const activeFilters = () => Object.entries(AF).filter(([k, v]) => v && !(k === 'mode' && v === 'terbaru')).length;
export async function filterBar() {
  const o = await api(`/admin/cohort/options?${afQs()}`);
  const sel = (k, label, opts) => `<label class="af"><span>${label}</span><select data-change="afSet" data-k="${k}"><option value="">Semua</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${String(AF[k]) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  return `<section class="card af-bar"><div class="af-grid">
    ${sel('provinsi', 'Provinsi', o.provinsi.map((x) => [x.nilai, `${x.nilai.replace(/^Prov\. /, '')} (${x.n})`]))}
    ${sel('kota', 'Kota/kabupaten', o.kota.map((x) => [x.nilai, `${x.nilai} (${x.n})`]))}
    ${sel('universitas', 'Universitas', o.universitas.map((x) => [x.id, `${x.nama} (${x.n})`]))}
    ${o.fakultas ? sel('fakultas', 'Fakultas', o.fakultas.map((x) => [x.kode, x.nama])) : ''}
    ${o.prodi ? sel('prodi', 'Program studi', o.prodi.filter((p) => !AF.fakultas || p.fakultas_kode === AF.fakultas).map((x) => [x.id, x.nama])) : ''}
    ${sel('gender', 'Jenis kelamin', o.gender.map((x) => [x.nilai, x.label]))}
    ${sel('umur', 'Umur', o.umur.map((x) => [x, `${x} tahun`]))}
    ${sel('tingkat', 'Tingkat', o.tingkat.map((x) => [x.nilai, x.label]))}
    ${sel('jenjang', 'Jenjang', o.jenjang.map((x) => [x, x]))}
    ${sel('angkatan', 'Angkatan', o.angkatan.map((x) => [x, x]))}
    <label class="af"><span>Dari tanggal</span><input type="date" data-change="afSet" data-k="dari" value="${esc(AF.dari)}"></label>
    <label class="af"><span>Sampai tanggal</span><input type="date" data-change="afSet" data-k="sampai" value="${esc(AF.sampai)}"></label>
    <label class="af"><span>Data</span><select data-change="afSet" data-k="mode"><option value="terbaru">Asesmen terbaru tiap mahasiswa</option><option value="semua" ${AF.mode === 'semua' ? 'selected' : ''}>Semua pengisian</option></select></label>
  </div>${activeFilters() ? `<div class="row between wrap"><small class="muted">${activeFilters()} penyaring aktif</small><button class="btn ghost sm" data-act="afReset">Hapus semua penyaring</button></div>` : ''}</section>`;
}
changeHandlers.afSet = (el) => { const k = el.dataset.k; AF[k] = el.value; for (const c of CASCADE[k] || []) AF[c] = ''; rerender(); };
actions.afReset = () => { Object.assign(AF, { provinsi: '', kota: '', universitas: '', fakultas: '', prodi: '', gender: '', umur: '', tingkat: '', jenjang: '', angkatan: '', dari: '', sampai: '', mode: 'terbaru' }); rerender(); };

const num = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('id-ID', { maximumFractionDigits: d }));
const catOf = (v) => { const b = state.ref?.norms?.dimensi?.batas || [[13, 'Kuat'], [8, 'Rentan'], [4, 'Lemah']]; return (b.find(([m]) => v >= m) || b[b.length - 1])[1]; };
const catOfV6 = (v) => { const b = state.ref?.norms?.otot?.batas || [[25, 'Kuat'], [16, 'Rentan'], [8, 'Lemah']]; return (b.find(([m]) => v >= m) || b[b.length - 1])[1]; };
const heat = (v, kode) => (v === null || v === undefined ? '' : `heat-${toneCat(kode === 'V6' ? catOfV6(v) : catOf(v))}`);
const stack = (k, r, l) => `<div class="stack3" role="img" aria-label="Kuat ${k}%, mulai melemah ${r}%, lemah ${l}%"><span class="s-ok" style="width:${k}%" title="Kuat ${k}%"></span><span class="s-warn" style="width:${r}%" title="Mulai melemah ${r}%"></span><span class="s-crit" style="width:${l}%" title="Sedang lemah ${l}%"></span></div>`;
const NEED_CODES = ['V1', 'V2', 'V3', 'V4', 'V5'];
const needHead = () => NEED_CODES.map((k) => `<th title="${esc(state.ref.dimensions.find((d) => d.kode === k)?.mudah || k)}">${k}</th>`).join('');

// ================= Monitoring Asesmen =================
let monTab = 'wilayah'; let monSub = 'provinsi';
export async function adminMonitoring() {
  const [bar, d] = await Promise.all([filterBar(), api(`/admin/monitoring?${afQs()}`)]);
  const p = d.profil; const ix = p.indeks;
  const needCard = (x) => `<article class="mon-need c-${esc(x.warna || 'blue')}"><div class="mon-need-top"><span class="pg-ibadge" aria-hidden="true">${x.ikon || '•'}</span><span><b>${esc(x.nama)}</b><small>${esc(x.istilah)}</small></span></div>
    <div class="pg-ival"><b>${num(x.rata)}</b><small>/${x.max} rata-rata</small></div>${stack(x.kuat, x.rentan, x.lemah)}
    <div class="mon-legend"><span class="ok-text">Kuat ${num(x.kuat)}%</span><span class="warn-text">Mulai melemah ${num(x.rentan)}%</span><span class="crit-text">Lemah ${num(x.lemah)}%</span></div></article>`;
  const radar = p.n ? radarChart(p.kebutuhan.map((x) => ({ kode: x.kode, nama: x.nama, skor: x.rata ?? 4, max: 16, status: catOf(x.rata ?? 4) })), { size: 320 }) : '';
  const tbl = (rows, label) => `<div class="table-wrap"><table class="table mon-table"><thead><tr><th>${label}</th><th>Mahasiswa</th><th>Indeks</th>${needHead()}<th class="v6-col" title="Kendali Diri & Kebiasaan Baik">Kendali diri</th><th>% Tangguh</th><th>% Krisis</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${esc(r.label)}</td><td class="num">${r.n}</td><td class="num"><b>${num(r.rata_indeks)}</b></td>${NEED_CODES.map((k) => `<td class="num ${heat(r[k], k)}">${num(r[k])}</td>`).join('')}<td class="num v6-col ${heat(r.V6, 'V6')}">${num(r.V6)}</td><td class="num">${num(r.p_tangguh)}</td><td class="num ${r.p_krisis >= 20 ? 'crit-text' : ''}">${num(r.p_krisis)}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">Tidak ada data.</td></tr>'}</tbody></table></div>
    <p class="small muted">Warna sel: hijau = rata-rata kuat, kuning = mulai melemah, merah = lemah. V1 Bertahan hidup · V2 Cinta & rasa memiliki · V3 Kekuasaan & prestasi · V4 Kebebasan · V5 Kesenangan.</p>`;
  const SUBS = { wilayah: [['provinsi', 'Per provinsi'], ['kota', 'Per kota/kabupaten'], ['universitas', 'Per universitas']], demografi: [['gender', 'Jenis kelamin'], ['umur', 'Umur'], ['tingkat', 'Tingkat'], ['jenjang', 'Jenjang'], ...(AF.universitas ? [['fakultas', 'Fakultas'], ['prodi', 'Program studi']] : [])] };
  if (monTab !== 'tren' && !SUBS[monTab].some(([k]) => k === monSub)) monSub = SUBS[monTab][0][0];
  const group = monTab === 'tren' ? null : (d[monTab][monSub] || []);
  const trend = d.tren.length > 1 ? lineChart(d.tren.map((t) => ({ label: `${t.bulan} · ${t.n} pengisian`, short: t.bulan.slice(2).replace('-', '/'), value: t.rata_indeks ?? 0 })), { min: 28, max: 112, unit: '', height: 170 }) : '<p class="muted">Tren muncul setelah ada pengisian di minimal dua bulan.</p>';
  const body = monTab === 'tren'
    ? `<section class="card"><h3>Rata-rata Indeks Kekuatan Mental per bulan</h3>${trend}<div class="table-wrap"><table class="table mon-table"><thead><tr><th>Bulan</th><th>Pengisian</th><th>Indeks</th>${needHead()}<th class="v6-col">Kendali diri</th></tr></thead><tbody>${d.tren.map((t) => `<tr><td>${esc(t.bulan)}</td><td class="num">${t.n}</td><td class="num"><b>${num(t.rata_indeks)}</b></td>${NEED_CODES.map((k) => `<td class="num ${heat(t[k], k)}">${num(t[k])}</td>`).join('')}<td class="num v6-col ${heat(t.V6, 'V6')}">${num(t.V6)}</td></tr>`).join('')}</tbody></table></div></section>`
    : `<section class="card"><div class="chips">${SUBS[monTab].map(([k, l]) => `<button class="chip-btn ${monSub === k ? 'on' : ''}" data-act="monSub" data-k="${k}">${l}</button>`).join('')}</div>${tbl(group, SUBS[monTab].find(([k]) => k === monSub)[1].replace(/^Per /, ''))}</section>`;
  return `<div class="row between wrap"><div><h1>Monitoring Asesmen</h1><p class="muted">Profil kekuatan mental mahasiswa: <b>${esc(d.label)}</b>.</p></div><a class="btn ghost" href="#/a/psikometrik">Buka Psikometrik →</a></div>
  ${bar}
  <div class="kpis">
    <div class="kpi"><span>Mahasiswa</span><b>${num(d.mahasiswa, 0)}</b><small>${num(d.pengisian, 0)} kali pengisian</small></div>
    <div class="kpi ${toneCat(ix.rata >= 85 ? 'Tangguh' : ix.rata >= 56 ? 'Rentan' : 'Krisis')}"><span>Rata-rata Indeks Kekuatan Mental</span><b>${num(ix.rata)}</b><small>median ${num(ix.median)} · SD ${num(ix.sd)} · rentang 28–112</small></div>
    <div class="kpi ok"><span>Tangguh</span><b>${num(ix.p_tangguh)}%</b><small>${ix.tangguh} mahasiswa</small></div>
    <div class="kpi warn"><span>Rentan</span><b>${num(ix.p_rentan)}%</b><small>${ix.rentan} mahasiswa</small></div>
    <div class="kpi crit"><span>Krisis</span><b>${num(ix.p_krisis)}%</b><small>${ix.krisis} mahasiswa · ${p.butuh_segera} butuh bantuan segera</small></div>
  </div>
  ${p.n ? `<section class="card"><div class="row between wrap"><h3>Profil 5 Kebutuhan Dasar</h3><span class="muted small">Rata-rata 5 kebutuhan dasar: <b>${num(p.fondasi.rata)}</b>/80 · ${num(p.fondasi.kuat)}% kuat</span></div>
    <div class="mon-profile"><div class="mon-radar">${radar}<p class="small muted center">Rata-rata skor tiap kebutuhan (4–16)</p></div><div class="mon-needs">${p.kebutuhan.map(needCard).join('')}</div></div></section>
  <section class="card"><h3>Kendali Diri & Kebiasaan Baik</h3><div class="mon-needs one">${needCard(p.kendali)}<div class="small muted mon-note">Dimensi pendukung (8–32) yang melengkapi 5 kebutuhan dasar: tahu tujuan, bertanggung jawab atas pilihan, dan punya kebiasaan baik. <b>${p.kendali.melemah}</b> mahasiswa sedang melemah di dimensi ini.</div></div></section>`
    : '<section class="card"><p class="muted">Belum ada data asesmen untuk penyaring ini.</p></section>'}
  <div class="tabs">${[['wilayah', 'Sebaran wilayah'], ['demografi', 'Sebaran demografi'], ['tren', 'Tren bulanan']].map(([k, l]) => `<a href="#" class="${monTab === k ? 'on' : ''}" data-act="monTab" data-k="${k}">${l}</a>`).join('')}</div>
  ${body}`;
}
actions.monTab = (el) => { monTab = el.dataset.k; rerender(); };
actions.monSub = (el) => { monSub = el.dataset.k; rerender(); };

// ================= Psikometrik =================
let psiTab = 'butir'; let demoKey = 'gender'; let raschScale = 'FONDASI'; let respQ = ''; let raschView = '3.1'; let raschGroup = 'gender'; let cfaModel = 'M6';
const aTone = (a) => (a === null ? '' : a >= 0.8 ? 'ok' : a >= 0.7 ? 'info' : a >= 0.6 ? 'warn' : 'crit');
const pTone = (p) => (p === null ? '' : p < 0.05 ? 'crit-text' : '');
const fitTone = (k) => ({ Cocok: 'ok', 'Perlu ditinjau': 'warn', 'Tidak cocok': 'crit' }[k] || '');
const statusTone = (s) => ({ Valid: 'ok', 'Perlu ditinjau': 'warn', 'Tidak valid': 'crit', Nonaktif: '' }[s] || '');
const KAT_LABEL = { Kuat: 'Kuat', Rentan: 'Mulai melemah', Lemah: 'Sedang lemah', Tangguh: 'Tangguh', Krisis: 'Krisis' };
const NORM_NAMA = { dimensi: 'Tiap kebutuhan dasar (V1–V5, 4–16)', fondasi: '5 Kebutuhan Dasar gabungan (20–80)', otot: 'Kendali Diri & Kebiasaan Baik (8–32)', total: 'Indeks Kekuatan Mental (28–112)' };
let INSTR = null;

export async function adminPsikometrik() {
  const tabs = `<div class="tabs">${[['butir', 'Butir & interpretasi'], ['deskriptif', 'Analisis deskriptif'], ['validitas', 'Validitas & reliabilitas'], ['demografis', 'Analisis demografis'], ['rasch', 'Analisis Rasch'], ['cfa', 'Analisis CFA'], ['responden', 'Data responden']].map(([k, l]) => `<a href="#" class="${psiTab === k ? 'on' : ''}" data-act="psiTab" data-k="${k}">${l}</a>`).join('')}</div>`;
  const head = `<div class="row between wrap"><div><h1>Psikometrik</h1><p class="muted">Pemantauan kehandalan instrumen IKDKM-M: pengaturan butir & interpretasi, serta uji statistik dari jawaban mahasiswa.</p></div><button class="btn" data-act="psiExport">Unduh data & statistik (Excel)</button></div>`;
  if (psiTab === 'butir') return head + tabs + dlBar('butir') + await instrumentTab();
  const bar = await filterBar();
  const extra = psiTab === 'rasch' ? { skala: raschScale } : psiTab === 'cfa' ? { model: cfaModel } : {};
  return head + bar + tabs + (psiTab === 'responden' ? '' : dlBar(psiTab, extra)) + await ({ deskriptif: descTab, validitas: validTab, demografis: demoTab, rasch: raschTab, cfa: cfaTab, responden: respTab }[psiTab])();
}
actions.psiTab = (el) => { psiTab = el.dataset.k; rerender(); };
// Unduh hasil analisis tab aktif (Excel / Word)
const DL_NAMA = { butir: 'butir & interpretasi', deskriptif: 'analisis deskriptif', validitas: 'validitas & reliabilitas', demografis: 'analisis demografis', rasch: 'seluruh tabel Rasch (3.1, 3.2, 6.1, 10.1, 12.2, 13.1, 17.1, 23.0, 28.1, 30.1)', cfa: 'analisis CFA' };
const dlBar = (jenis, extra = {}) => `<div class="dl-bar"><span class="small muted">Unduh ${esc(DL_NAMA[jenis])}:</span><button class="btn ghost sm" data-act="psiDl" data-j="${jenis}" data-f="xlsx" data-x='${esc(JSON.stringify(extra))}'>⬇ Excel (.xlsx)</button><button class="btn ghost sm" data-act="psiDl" data-j="${jenis}" data-f="docx" data-x='${esc(JSON.stringify(extra))}'>⬇ Word (.docx)</button></div>`;
actions.psiDl = async (el) => {
  el.disabled = true; const x = JSON.parse(el.dataset.x || '{}');
  try { await download(`/admin/psikometri/unduh/${el.dataset.j}?${afQs({ ...x, format: el.dataset.f })}`, `psikometri-${el.dataset.j}.${el.dataset.f}`); toast('Berkas diunduh.'); } finally { el.disabled = false; }
};
actions.psiExport = async (el) => { el.disabled = true; try { await download(`/admin/assessments/export?${afQs()}`, 'data-butir-ikdkm.xlsx'); toast('Data & statistik diunduh.'); } finally { el.disabled = false; } };
const smallN = (n) => (n < 30 ? `<div class="notice warn small">Jumlah respons ${n} (di bawah 30). Hasil statistik belum stabil; gunakan sebagai gambaran awal.</div>` : '');

// ---- Butir & interpretasi ----
async function instrumentTab() {
  const v = INSTR = await api('/admin/psikometri/instrumen');
  const dims = state.ref.dimensions; const off = v.butir.filter((b) => !b.aktif).length;
  const groups = [...dims.map((d) => ({ kode: d.kode, nama: `${d.kode} · ${d.mudah}`, butir: v.butir.filter((b) => b.dimensi === d.kode) })), { kode: 'S', nama: 'Bagian 3 · Kesiapan dibantu', butir: v.butir.filter((b) => b.bagian === 3) }];
  const items = `<section class="card"><div class="row between wrap"><h3>Butir asesmen</h3><span class="chip ${off ? 'warn' : 'ok'}">${v.butir.length - off} aktif · ${off} nonaktif</span></div>
    <p class="small muted">Butir yang dinonaktifkan tidak ditanyakan pada asesmen berikutnya. Skor dimensinya disetarakan dari butir yang tersisa (prorata) agar rentang & norma tetap sama. Minimal ${v.min_per_dimensi} butir aktif per dimensi. Butir penanda keselamatan dikunci.</p>
    ${groups.map((g) => `<details class="psi-group" ${g.kode === 'V1' ? 'open' : ''}><summary><b>${esc(g.nama)}</b> <small class="muted">${g.butir.filter((b) => b.aktif).length}/${g.butir.length} aktif</small></summary>
      <div class="table-wrap"><table class="table"><thead><tr><th>Aktif</th><th>No</th><th>Indikator & pernyataan</th><th>Jenis</th><th></th></tr></thead><tbody>${g.butir.map((b) => `<tr class="${b.aktif ? '' : 'faded'}"><td>${b.terkunci ? `<span class="chip" title="${esc(b.terkunci)}">🔒 Terkunci</span>` : `<label class="switch"><input type="checkbox" data-change="psiItem" data-no="${b.no}" ${b.aktif ? 'checked' : ''} aria-label="Butir ${b.no} aktif"><span></span></label>`}</td><td class="mono">${b.no}</td><td><b>${esc(b.indikator)}</b>${b.diubah ? ' <span class="chip info" title="Redaksi berbeda dari bawaan instrumen">diubah</span>' : ''}<br><small class="muted">${esc(b.teks)}</small></td><td><span class="chip">${b.arah === '+' ? 'Positif' : 'Negatif'}</span></td><td><button class="btn ghost sm" data-act="psiEditItem" data-no="${b.no}" aria-label="Ubah redaksi butir ${b.no}">✏️ Ubah</button></td></tr>`).join('')}</tbody></table></div></details>`).join('')}</section>`;
  const normRows = Object.entries(v.norms).map(([k, n]) => `<fieldset class="psi-norm"><legend>${esc(NORM_NAMA[k] || k)}${v.diubah.norms ? '' : ''}</legend><div class="table-wrap"><table class="table"><thead><tr><th>Kategori</th><th>Skor mulai</th><th>Keterangan</th>${k === 'total' ? '<th>Dukungan yang sesuai</th>' : ''}</tr></thead><tbody>
    ${n.batas.map((b, i) => `<tr><td><span class="chip ${toneCat(b[1])}">${esc(KAT_LABEL[b[1]] || b[1])}</span></td><td><input class="num-in" type="number" name="n_${k}_${i}_min" value="${b[0]}" min="${n.min}" max="${n.max}" ${i === n.batas.length - 1 ? 'readonly title="Batas terbawah = skor minimum"' : ''} required></td><td><input name="n_${k}_${i}_desc" value="${esc(b[2])}" required maxlength="120"></td>${k === 'total' ? `<td><input name="n_${k}_${i}_tahap" value="${esc(b[3] || '')}" maxlength="120"></td>` : ''}</tr>`).join('')}</tbody></table></div><small class="muted">Rentang skor ${n.min}–${n.max}. Kategori berlaku dari skor mulai sampai sebelum batas kategori di atasnya.</small></fieldset>`).join('');
  const ambang = `<fieldset class="psi-norm"><legend>Ambang "melemah" per dimensi</legend><p class="small muted">Dimensi dianggap melemah (memicu rekomendasi & klaim untuk konselor) bila skornya ≤ ambang.</p><div class="psi-amb">${Object.entries(v.ambang).map(([k, a]) => `<label>${k} <small>${esc(dims.find((d) => d.kode === k)?.mudah || '')}</small><input class="num-in" type="number" name="amb_${k}" value="${a}" min="${k === 'V6' ? 8 : 4}" max="${k === 'V6' ? 32 : 16}" required></label>`).join('')}</div></fieldset>`;
  const kuant = `<section class="card"><div class="row between wrap"><h3>Interpretasi kuantitatif (norma skor)</h3>${v.diubah.norms || v.diubah.ambang ? '<span class="chip warn">Sudah diubah dari bawaan</span>' : '<span class="chip">Bawaan</span>'}</div>
    <form data-form="psiNorms" class="stack">${normRows}${ambang}<div class="row end wrap"><button type="button" class="btn ghost" data-act="psiReset" data-k="norms,ambang">Kembalikan ke bawaan</button><button class="btn primary" type="submit">Simpan norma</button></div></form>
    <p class="small muted">Perubahan norma berlaku untuk asesmen yang diisi sesudahnya. Hasil asesmen lama tetap memakai kategori saat diisi.</p></section>`;
  const STAT = [['Kuat', 'Saat kuat'], ['Rentan', 'Saat mulai melemah'], ['Lemah', 'Saat sedang lemah'], ['coba_kuat', 'Saran bila kuat'], ['coba_lemah', 'Saran bila perlu dikuatkan']];
  const kual = `<section class="card"><div class="row between wrap"><h3>Interpretasi kualitatif (kalimat untuk mahasiswa)</h3>${v.diubah.makna || v.diubah.ringkasan ? '<span class="chip warn">Sudah diubah dari bawaan</span>' : '<span class="chip">Bawaan</span>'}</div>
    <form data-form="psiQual" class="stack">
    <details open><summary><b>Ringkasan Indeks Kekuatan Mental</b></summary>${Object.entries(v.ringkasan).map(([k, s]) => `<div class="psi-qual"><span class="chip ${toneCat(k)}">${esc(k)}</span><label>Judul<input name="r_${k}_judul" value="${esc(s.judul)}" maxlength="120" required></label><label>Pesan<textarea name="r_${k}_pesan" rows="2" maxlength="600" required>${esc(s.pesan)}</textarea></label></div>`).join('')}</details>
    ${Object.entries(v.makna).map(([k, m]) => `<details><summary><b>${esc(k)} · ${esc(dims.find((d) => d.kode === k)?.mudah || '')}</b>${k === 'V6' ? ' <small class="muted">(ditampilkan setelah 5 kebutuhan dasar)</small>' : ''}</summary>${STAT.map(([s, l]) => `<label>${l}<textarea name="m_${k}_${s}" rows="2" maxlength="600" required>${esc(m[s])}</textarea></label>`).join('')}</details>`).join('')}
    <div class="row end wrap"><button type="button" class="btn ghost" data-act="psiReset" data-k="makna,ringkasan">Kembalikan ke bawaan</button><button class="btn primary" type="submit">Simpan kalimat</button></div></form></section>`;
  const hist = v.riwayat.length ? `<section class="card"><h3>Riwayat perubahan instrumen</h3><ul class="plain small">${v.riwayat.slice(0, 15).map((h) => `<li>${fmtDT(h.pada)} · <b>${esc(h.oleh)}</b> · ${esc(h.perubahan)}</li>`).join('')}</ul></section>` : '';
  return items + kuant + kual + hist;
}
actions.psiEditItem = (el) => {
  const b = INSTR.butir.find((x) => x.no === Number(el.dataset.no));
  openModal(`<h3>Ubah redaksi butir ${b.no}</h3><p class="small muted">${esc(b.dimensi)} · pernyataan ${b.arah === '+' ? '<b>positif</b> (SS = skor 4)' : '<b>negatif</b> (skor dibalik: SS = skor 1)'}. Perubahan langsung dipakai pada formulir asesmen mahasiswa berikutnya dan tercatat di riwayat.</p>
    <form data-form="psiItemText" data-no="${b.no}" class="stack"><label>Indikator<input name="indikator" value="${esc(b.indikator)}" minlength="3" maxlength="120" required></label>
    <label>Pernyataan (dibaca mahasiswa)<textarea name="teks" rows="3" minlength="10" maxlength="300" required>${esc(b.teks)}</textarea></label>
    ${b.diubah ? `<div class="notice small"><b>Redaksi bawaan:</b> ${esc(b.bawaan.indikator)} — “${esc(b.bawaan.teks)}”</div>` : ''}
    <div class="notice warn small">Jaga makna dan <b>arah</b> pernyataan (${b.arah === '+' ? 'positif' : 'negatif'}) agar skor, norma, dan hasil lama tetap sebanding. Ubah redaksi untuk memperjelas bahasa, bukan mengganti isi yang diukur.</div>
    <div class="row end wrap">${b.diubah ? `<button type="button" class="btn ghost" data-act="psiItemReset" data-no="${b.no}">Kembalikan ke bawaan</button>` : ''}<button class="btn primary" type="submit">Simpan redaksi</button></div></form>`);
};
forms.psiItemText = async (d, f) => { await api(`/admin/psikometri/butir/${f.dataset.no}/teks`, { method: 'PUT', body: d }); state.ref = await api('/reference'); closeModal(); toast(`Redaksi butir ${f.dataset.no} disimpan dan dipakai pada asesmen mahasiswa.`); rerender(); };
actions.psiItemReset = async (el) => { await api(`/admin/psikometri/butir/${el.dataset.no}/teks`, { method: 'PUT', body: { indikator: '', teks: '' } }); state.ref = await api('/reference'); closeModal(); toast(`Butir ${el.dataset.no} dikembalikan ke redaksi bawaan.`); rerender(); };
changeHandlers.psiItem = async (el) => {
  try { await api(`/admin/psikometri/butir/${el.dataset.no}`, { method: 'PUT', body: { aktif: el.checked } }); toast(`Butir ${el.dataset.no} ${el.checked ? 'diaktifkan' : 'dinonaktifkan'}.`); state.ref = await api('/reference'); }
  catch (e) { el.checked = !el.checked; toast(e.message, 'warn'); }
  rerender();
};
forms.psiNorms = async (d) => {
  const norms = {}; for (const [k, n] of Object.entries(INSTR.norms)) norms[k] = { batas: n.batas.map((b, i) => [Number(d[`n_${k}_${i}_min`]), b[1], d[`n_${k}_${i}_desc`], ...(k === 'total' ? [d[`n_${k}_${i}_tahap`]] : [])]) };
  const ambang = Object.fromEntries(Object.keys(INSTR.ambang).map((k) => [k, Number(d[`amb_${k}`])]));
  await api('/admin/psikometri/interpretasi', { method: 'PUT', body: { norms, ambang } }); state.ref = await api('/reference'); toast('Norma interpretasi disimpan.'); rerender();
};
forms.psiQual = async (d) => {
  const makna = Object.fromEntries(Object.keys(INSTR.makna).map((k) => [k, Object.fromEntries(['Kuat', 'Rentan', 'Lemah', 'coba_kuat', 'coba_lemah'].map((s) => [s, d[`m_${k}_${s}`]]))]));
  const ringkasan = Object.fromEntries(Object.keys(INSTR.ringkasan).map((k) => [k, { judul: d[`r_${k}_judul`], pesan: d[`r_${k}_pesan`] }]));
  await api('/admin/psikometri/interpretasi', { method: 'PUT', body: { makna, ringkasan } }); toast('Kalimat interpretasi disimpan.'); rerender();
};
actions.psiReset = async (el) => {
  if (!await confirmBox('Kembalikan ke pengaturan bawaan? Pengaturan yang sudah diubah akan diganti nilai bawaan instrumen.', { tone: 'primary' })) return;
  await api('/admin/psikometri/interpretasi', { method: 'PUT', body: { reset: el.dataset.k.split(',') } }); state.ref = await api('/reference'); toast('Dikembalikan ke bawaan.'); rerender();
};

// ---- Deskriptif ----
async function descTab() {
  const d = await api(`/admin/psikometri/deskriptif?${afQs()}`);
  const scaleRow = (s) => `<tr${s.kode === 'V6' ? ' class="v6-row"' : ''}><td><b>${esc(s.nama)}</b> <small class="muted">${s.rentang}</small></td><td class="num">${s.n}</td><td class="num">${num(s.mean, 2)}</td><td class="num">${num(s.median, 1)}</td><td class="num">${s.modus.map((m) => num(m, 0)).join(' / ') || '—'}</td><td class="num">${num(s.sd, 2)}</td><td class="num">${s.min ?? '—'}–${s.max ?? '—'}</td>
    <td class="small">${s.kategori.map((c) => `<span class="chip ${toneCat(c.kategori)}">${esc(KAT_LABEL[c.kategori])}: ${c.frekuensi} (${num(c.persen)}%)</span>`).join(' ')}</td></tr>`;
  const order = ['V1', 'V2', 'V3', 'V4', 'V5', 'FONDASI', 'V6', 'TOTAL'];
  return `${smallN(d.n)}<section class="card"><h3>Statistik skala</h3><p class="small muted">${d.n} responden · ${esc(d.label)}. Frekuensi & persentase kategori, rata-rata (mean), nilai tengah (median), nilai paling sering (modus), dan sebaran (SD).</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Skala</th><th>n</th><th>Mean</th><th>Median</th><th>Modus</th><th>SD</th><th>Min–maks</th><th>Frekuensi kategori</th></tr></thead><tbody>${order.map((k) => d.skala.find((s) => s.kode === k)).filter(Boolean).map(scaleRow).join('')}</tbody></table></div></section>
  <section class="card"><h3>Statistik butir</h3><p class="small muted">Skor butir 1–4 (pernyataan negatif sudah dibalik). Kolom SS/S/TS/STS berisi frekuensi dan persentase jawaban.</p>
    <div class="table-wrap"><table class="table item-table"><thead><tr><th>Butir</th><th>Indikator</th><th>n</th>${['SS', 'S', 'TS', 'STS'].map((c) => `<th>${c}</th>`).join('')}<th>Mean</th><th>Median</th><th>Modus</th><th>SD</th></tr></thead><tbody>
    ${d.butir.map((b) => `<tr class="${b.aktif ? '' : 'faded'}"><td class="mono">${b.no}<br><small class="muted">${b.dimensi}</small></td><td class="small">${esc(b.indikator)}${b.aktif ? '' : ' <span class="chip">nonaktif</span>'}</td><td class="num">${b.n}</td>${b.jawaban.map((j) => `<td class="num small">${j.frekuensi}<br><small class="muted">${num(j.persen)}%</small></td>`).join('')}<td class="num">${num(b.mean, 2)}</td><td class="num">${num(b.median, 1)}</td><td class="num">${b.modus.join(' / ') || '—'}</td><td class="num">${num(b.sd, 2)}</td></tr>`).join('')}</tbody></table></div></section>`;
}

// ---- Validitas & reliabilitas ----
async function validTab() {
  const d = await api(`/admin/psikometri/validitas?${afQs()}`);
  const order = ['V1', 'V2', 'V3', 'V4', 'V5', 'FONDASI', 'V6', 'TOTAL', 'S'];
  const valid = d.butir.filter((b) => b.status === 'Valid').length; const aktif = d.butir.filter((b) => b.aktif).length;
  return `${smallN(d.n)}<div class="kpis"><div class="kpi"><span>Responden lengkap</span><b>${d.n}</b><small>menjawab semua butir aktif</small></div>
    ${['FONDASI', 'V6', 'TOTAL'].map((k) => d.reliabilitas.find((x) => x.kode === k)).map((x) => `<div class="kpi ${aTone(x.alpha)}"><span>${esc(x.nama)}</span><b>α ${num(x.alpha, 3)}</b><small>Spearman-Brown ${num(x.spearman_brown, 3)} · ${esc(x.kategori)}</small></div>`).join('')}
    <div class="kpi ${valid === aktif ? 'ok' : 'warn'}"><span>Butir valid</span><b>${valid}/${aktif}</b><small>batas minimal r ${num(d.r_tabel, 3)}</small></div></div>
  <section class="card"><h3>Reliabilitas (keandalan)</h3><div class="table-wrap"><table class="table"><thead><tr><th>Skala</th><th>Butir</th><th>n</th><th>Cronbach's α</th><th>r belahan ganjil-genap</th><th>Spearman-Brown</th><th>Kategori</th></tr></thead><tbody>
    ${order.map((k) => d.reliabilitas.find((x) => x.kode === k)).filter(Boolean).map((x) => `<tr${x.kode === 'V6' ? ' class="v6-row"' : ''}><td>${esc(x.nama)}</td><td class="num">${x.jumlah_butir}</td><td class="num">${x.n}</td><td class="num"><b>${num(x.alpha, 3)}</b></td><td class="num">${num(x.r_belahan, 3)}</td><td class="num"><b>${num(x.spearman_brown, 3)}</b></td><td><span class="chip ${aTone(x.alpha)}">${esc(x.kategori)}</span></td></tr>`).join('')}</tbody></table></div>
    <p class="small muted"><b>Cronbach's α</b> mengukur konsistensi semua butir dalam satu skala. <b>Spearman-Brown</b> membagi butir menjadi dua belahan (nomor ganjil & genap), mengorelasikannya, lalu mengoreksi ke panjang tes penuh: r<sub>SB</sub> = 2r / (1 + r). Acuan: ≥ 0,90 sangat baik; 0,80–0,89 baik; 0,70–0,79 dapat diterima; 0,60–0,69 perlu ditinjau; &lt; 0,60 rendah.</p></section>
  <section class="card"><h3>Validitas butir</h3><p class="small muted">${esc(d.kriteria)} Bila keandalan jika butir dihapus justru naik (↑), butir perlu ditinjau ulang kalimatnya.</p>
    <div class="table-wrap"><table class="table item-table"><thead><tr><th>Butir</th><th>Pernyataan</th><th>Rata-rata</th><th>SD</th><th>Kecocokan dg. dimensinya (r)</th><th>Kecocokan dg. skor total (r)</th><th>α jika dihapus</th><th>Status</th></tr></thead><tbody>
    ${d.butir.map((b) => `<tr class="${b.aktif ? '' : 'faded'}"><td class="mono">${b.no}<br><small class="muted">${esc(b.dimensi)} ${b.arah === '+' ? 'positif' : 'negatif'}</small></td><td class="small">${esc(b.teks)}</td><td class="num">${num(b.rerata, 2)}</td><td class="num">${num(b.sd, 2)}</td><td class="num">${num(b.r_butir_dimensi, 3)}</td><td class="num">${num(b.r_butir_total, 3)}</td><td class="num">${num(b.alpha_jika_dihapus, 3)}${b.alpha_jika_dihapus !== null && b.alpha_dimensi !== null && b.alpha_jika_dihapus > b.alpha_dimensi ? ' <span class="chip warn" title="Keandalan naik bila butir dihapus">↑</span>' : ''}</td><td><span class="chip ${statusTone(b.status)}">${esc(b.status)}</span></td></tr>`).join('')}</tbody></table></div></section>`;
}

// ---- Demografis ----
async function demoTab() {
  const d = await api(`/admin/psikometri/demografis?${afQs()}`);
  const a = d.analisis.find((x) => x.kode === demoKey) || d.analisis[0];
  const cols = [['TOTAL', 'Indeks'], ['FONDASI', '5 Kebutuhan'], ['V1', 'V1'], ['V2', 'V2'], ['V3', 'V3'], ['V4', 'V4'], ['V5', 'V5'], ['V6', 'Kendali diri']];
  const sig = (u) => (u.p === null ? '<span class="muted">—</span>' : `<b class="${pTone(u.p)}">${u.p < 0.001 ? '< 0,001' : num(u.p, 3)}</b>${u.p < 0.05 ? ' *' : ''}`);
  return `${smallN(d.n)}<section class="card"><div class="chips">${d.analisis.map((x) => `<button class="chip-btn ${a.kode === x.kode ? 'on' : ''}" data-act="psiDemo" data-k="${x.kode}">${esc(x.nama)}</button>`).join('')}</div>
    <div class="table-wrap"><table class="table mon-table"><thead><tr><th>${esc(a.nama)}</th><th>n</th><th>%</th>${cols.map(([k, l]) => `<th class="${k === 'V6' ? 'v6-col' : ''}">${l}<br><small class="muted">mean (SD)</small></th>`).join('')}<th>Tangguh</th><th>Krisis</th></tr></thead><tbody>
    ${a.kelompok.map((g) => `<tr><td>${esc(g.label)}</td><td class="num">${g.n}</td><td class="num">${num(g.persen)}</td>${cols.map(([k]) => `<td class="num ${k === 'V6' ? 'v6-col ' : ''}${['V1', 'V2', 'V3', 'V4', 'V5', 'V6'].includes(k) ? heat(g[k].mean, k) : ''}">${num(g[k].mean)} <small class="muted">(${num(g[k].sd)})</small></td>`).join('')}<td class="num">${g.tangguh}</td><td class="num">${g.krisis}</td></tr>`).join('')}
    <tr class="anova-row"><td colspan="3"><b>Uji beda (ANOVA)</b><br><small class="muted">nilai p</small></td>${cols.map(([k]) => `<td class="num ${k === 'V6' ? 'v6-col' : ''}" title="F(${a.uji[k].df1}, ${a.uji[k].df2}) = ${a.uji[k].F ?? '—'} · η² = ${a.uji[k].eta2 ?? '—'}">${sig(a.uji[k])}<br><small class="muted">F ${num(a.uji[k].F, 2)} · η² ${num(a.uji[k].eta2, 2)}</small></td>`).join('')}<td colspan="2"></td></tr></tbody></table></div>
    <p class="small muted">ANOVA satu arah membandingkan rata-rata antarkelompok (kelompok "Tidak diketahui" tidak diikutkan). <b>p &lt; 0,05 (*)</b> berarti perbedaan antarkelompok signifikan secara statistik. η² (eta kuadrat) menunjukkan besar efek: ≈ 0,01 kecil, 0,06 sedang, ≥ 0,14 besar. Perbedaan skor antarkelompok yang besar perlu dicermati sebagai kemungkinan bias butir (DIF) maupun perbedaan kondisi nyata.</p></section>`;
}
actions.psiDemo = (el) => { demoKey = el.dataset.k; rerender(); };

// ---- Rasch (tabel ala Winsteps) ----
const RV = [['3.1', '3.1 Ringkasan statistik'], ['3.2', '3.2 Diagnosis skala rating'], ['12.2', '12.2 Peta Wright'], ['13.1', '13.1 Ukuran butir'], ['10.1', '10.1 Misfit butir'], ['17.1', '17.1 Ukuran orang'], ['6.1', '6.1 Kecocokan orang'], ['23.0', '23.0 Unidimensionalitas'], ['28.1', '28.1 Subtotal orang'], ['30.1', '30.1 DIF butir']];
const mnsqTone = (v) => (v === null || v === undefined ? '' : v < 0.5 || v > 1.5 ? (v > 2 ? 'crit-text' : 'warn-text') : '');
const zTone = (v) => (v === null || v === undefined ? '' : Math.abs(v) > 2 ? 'warn-text' : '');
const fitCols = '<th>Skor</th><th>Jumlah</th><th>Ukuran</th><th>S.E.</th><th>Infit MNSQ</th><th>Infit ZSTD</th><th>Outfit MNSQ</th><th>Outfit ZSTD</th><th>PTMEA korr.</th><th>PTMEA harapan</th><th>Obs%</th><th>Exp%</th><th>Kecocokan</th>';
const fitTds = (r) => `<td class="num">${num(r.skor, 0)}</td><td class="num">${r.jumlah}</td><td class="num"><b>${num(r.ukuran, 2)}</b></td><td class="num">${num(r.se, 2)}</td><td class="num ${mnsqTone(r.infit)}">${num(r.infit, 2)}</td><td class="num ${zTone(r.infit_z)}">${num(r.infit_z, 1)}</td><td class="num ${mnsqTone(r.outfit)}">${num(r.outfit, 2)}</td><td class="num ${zTone(r.outfit_z)}">${num(r.outfit_z, 1)}</td><td class="num ${r.ptmea !== null && r.ptmea < 0 ? 'crit-text' : ''}">${num(r.ptmea, 2)}</td><td class="num">${num(r.ptmea_exp, 2)}</td><td class="num">${num(r.obs_match, 1)}</td><td class="num">${num(r.exp_match, 1)}</td><td>${r.ekstrem ? `<span class="chip">${esc(r.ekstrem)}</span>` : `<span class="chip ${fitTone(r.kecocokan)}">${esc(r.kecocokan)}</span>`}</td>`;
const limitRows = (rows, n = 300) => ({ rows: rows.slice(0, n), more: rows.length > n ? `<p class="small muted">Menampilkan ${n} dari ${rows.length} baris. Unduh Excel/Word untuk tabel lengkap.</p>` : '' });
async function raschTab() {
  const d = await api(`/admin/psikometri/rasch-lengkap?${afQs({ skala: raschScale })}`);
  const pick = `<label class="af inline"><span>Skala</span><select data-change="psiRasch">${d.skala_tersedia.map((s2) => `<option value="${s2.kode}" ${d.skala === s2.kode ? 'selected' : ''}>${esc(s2.nama)}</option>`).join('')}</select></label>`;
  if (d.error) return `<section class="card">${pick}<p class="muted">${esc(d.error)}</p></section>`;
  const relTone = (r) => (r >= 0.8 ? 'ok' : r >= 0.67 ? 'warn' : 'crit');
  const t3 = d.tabel3_1; const u = d.tabel23; const ind = (l) => d.butir_info[l]?.indikator || '';
  const kpi = `<div class="kpis"><div class="kpi ${relTone(t3.orang.real.reliabilitas)}"><span>Reliabilitas orang (real)</span><b>${num(t3.orang.real.reliabilitas, 2)}</b><small>separasi ${num(t3.orang.real.separasi, 2)} · α ${num(t3.orang.alpha, 2)}</small></div>
    <div class="kpi ${relTone(t3.butir.real.reliabilitas)}"><span>Reliabilitas butir (real)</span><b>${num(t3.butir.real.reliabilitas, 2)}</b><small>separasi ${num(t3.butir.real.separasi, 2)}</small></div>
    <div class="kpi ${u.dijelaskan.persen >= 40 && u.kontras[0].eigen < 2 ? 'ok' : u.dijelaskan.persen >= 30 ? 'warn' : 'crit'}"><span>Varians dijelaskan</span><b>${num(u.dijelaskan.persen, 1)}%</b><small>eigen kontras-1 ${num(u.kontras[0].eigen, 2)}</small></div>
    <div class="kpi ${d.ambang_berurutan ? 'ok' : 'warn'}"><span>Ambang kategori</span><b>${d.ambang_berurutan ? 'Berurutan' : 'Tidak berurutan'}</b><small>${d.tabel10_1.filter((b) => b.kecocokan !== 'Cocok').length} butir perlu ditinjau</small></div></div>`;
  const nav = `<div class="chips rasch-nav">${RV.map(([k, l]) => `<button class="chip-btn ${raschView === k ? 'on' : ''}" data-act="psiRaschView" data-k="${k}">Tabel ${esc(l)}</button>`).join('')}</div>`;
  const grpPick = (list) => `<div class="chips">${list.map((g) => `<button class="chip-btn ${raschGroup === g.kode ? 'on' : ''}" data-act="psiRaschGroup" data-k="${g.kode}">${esc(g.nama)}</button>`).join('')}</div>`;
  const sumTable = (o, judul) => { const V = [['skor', 'Skor total', 1], ['jumlah', 'Jumlah', 1], ['ukuran', 'Ukuran', 2], ['se', 'Model S.E.', 2], ['infit', 'Infit MNSQ', 2], ['infit_z', 'Infit ZSTD', 2], ['outfit', 'Outfit MNSQ', 2], ['outfit_z', 'Outfit ZSTD', 2]];
    return `<h4>${judul}</h4><div class="table-wrap"><table class="table"><thead><tr><th></th>${V.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>${[['mean', 'Rata-rata'], ['sem', 'S.E. rerata'], ['psd', 'P.SD'], ['ssd', 'S.SD'], ['max', 'Maks'], ['min', 'Min']].map(([k, l]) => `<tr><td>${l}</td>${V.map(([v, , dd]) => `<td class="num">${num(o.stat[v][k], dd)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="table-wrap"><table class="table"><thead><tr><th></th><th>RMSE</th><th>True SD</th><th>Separasi</th><th>Reliabilitas</th></tr></thead><tbody>${[['real', 'REAL'], ['model', 'MODEL']].map(([k, l]) => `<tr><td>${l}</td><td class="num">${num(o[k].rmse, 2)}</td><td class="num">${num(o[k].true_sd, 2)}</td><td class="num"><b>${num(o[k].separasi, 2)}</b></td><td class="num"><b>${num(o[k].reliabilitas, 2)}</b></td></tr>`).join('')}</tbody></table></div>`; };
  const V = {
    '3.1': () => `<h3>TABEL 3.1 Ringkasan Statistik</h3>${sumTable(t3.orang, `Orang — ${t3.orang.n} terukur, ${t3.orang.ekstrem} ekstrem`)}<p class="small muted">Cronbach α (KR-20) skor mentah orang = <b>${num(t3.orang.alpha, 2)}</b> · korelasi skor mentah–ukuran = ${num(t3.orang.korelasi_skor_ukuran, 2)}.</p>${sumTable(t3.butir, `Butir — ${t3.butir.n} terukur, ${t3.butir.ekstrem} ekstrem`)}<p class="small muted">${esc(d.kriteria.reliabilitas)} REAL memakai S.E. yang dikoreksi misfit (lebih konservatif); MODEL memakai S.E. model.</p>`,
    '3.2': () => `<h3>TABEL 3.2 Diagnosis Skala Rating</h3><div class="table-wrap"><table class="table"><thead><tr><th>Skor</th><th>Jumlah obs.</th><th>%</th><th>Rata-rata teramati</th><th>Rata-rata harapan</th><th>Infit MNSQ</th><th>Outfit MNSQ</th><th>Ambang Andrich</th><th>S.E.</th><th>Ukuran kategori</th></tr></thead><tbody>${d.tabel3_2.map((c) => `<tr><td class="mono">${c.skor}</td><td class="num">${c.jumlah}</td><td class="num">${num(c.persen, 1)}</td><td class="num">${num(c.rata_teramati, 2)}</td><td class="num">${num(c.rata_harapan, 2)}</td><td class="num ${mnsqTone(c.infit)}">${num(c.infit, 2)}</td><td class="num ${c.outfit > 2 ? 'crit-text' : ''}">${num(c.outfit, 2)}</td><td class="num"><b>${c.ambang === null ? 'NONE' : num(c.ambang, 2)}</b></td><td class="num">${num(c.ambang_se, 2)}</td><td class="num">${num(c.ukuran_kategori, 2)}</td></tr>`).join('')}</tbody></table></div>
      <p class="small"><span class="chip ${d.ambang_berurutan ? 'ok' : 'warn'}">Ambang ${d.ambang_berurutan ? 'berurutan' : 'tidak berurutan'}</span> <span class="chip ${d.rata_berurutan ? 'ok' : 'warn'}">Rata-rata teramati ${d.rata_berurutan ? 'naik berurutan' : 'tidak berurutan'}</span></p><p class="small muted">${esc(d.kriteria.rating)} Skor 1–4 setelah pernyataan negatif dibalik.</p>`,
    '12.2': () => { const maxP = Math.max(1, ...d.tabel12_2.pita.map((w) => w.orang)); return `<h3>TABEL 12.2 Peta Wright Butir</h3><p class="small muted">Kiri: sebaran mahasiswa menurut ukuran kekuatan mental (logit). Kanan: butir menurut tingkat kesulitan disetujui. M = rata-rata, S = 1 SD, T = 2 SD.</p>
      <div class="wright">${d.tabel12_2.pita.map((w) => `<div class="w-row"><span class="w-l mono">${Number.isInteger(w.batas) ? num(w.batas, 0) : ''}</span><span class="w-p"><i style="width:${(w.orang / maxP) * 100}%"></i>${w.orang || ''}</span><span class="w-m mono">${w.tanda_orang || ''}|${w.tanda_butir || ''}</span><span class="w-i">${w.butir.map((b) => `<span class="chip" title="${esc(ind(b))}">${b}</span>`).join('')}</span></div>`).join('')}</div>
      <details><summary class="small">Tampilan teks (format Winsteps)</summary><pre class="wright-pre">${esc(d.tabel12_2.teks)}</pre></details>`; },
    '13.1': () => `<h3>TABEL 13.1 Ukuran Butir (urutan ukuran)</h3><div class="table-wrap"><table class="table item-table"><thead><tr><th>Butir</th><th>Indikator</th>${fitCols}</tr></thead><tbody>${d.tabel13_1.map((r) => `<tr><td class="mono">${r.label}</td><td class="small">${esc(ind(r.label))}</td>${fitTds(r)}</tr>`).join('')}</tbody></table></div><p class="small muted">${esc(d.kriteria.fit)} Ukuran positif = lebih sulit disetujui.</p>`,
    '10.1': () => `<h3>TABEL 10.1 Urutan Misfit Butir</h3><div class="table-wrap"><table class="table item-table"><thead><tr><th>Butir</th><th>Indikator</th>${fitCols}</tr></thead><tbody>${d.tabel10_1.map((r) => `<tr><td class="mono">${r.label}</td><td class="small">${esc(ind(r.label))}</td>${fitTds(r)}</tr>`).join('')}</tbody></table></div><p class="small muted">Diurutkan dari MNSQ terbesar. ${esc(d.kriteria.fit)}</p>`,
    '17.1': () => { const l = limitRows(d.tabel17_1); return `<h3>TABEL 17.1 Ukuran Orang (urutan ukuran)</h3><div class="table-wrap"><table class="table"><thead><tr><th>Kode</th>${fitCols}</tr></thead><tbody>${l.rows.map((r) => `<tr><td class="mono">${esc(r.label)}</td>${fitTds(r)}</tr>`).join('')}</tbody></table></div>${l.more}<p class="small muted">Responden dengan skor ekstrem (semua jawaban terendah/tertinggi) diberi ukuran perkiraan dan tidak memiliki statistik kecocokan.</p>`; },
    '6.1': () => { const l = limitRows(d.tabel6_1); return `<h3>TABEL 6.1 Urutan Kecocokan Orang</h3><div class="table-wrap"><table class="table"><thead><tr><th>Kode</th>${fitCols}</tr></thead><tbody>${l.rows.map((r) => `<tr><td class="mono">${esc(r.label)}</td>${fitTds(r)}</tr>`).join('')}</tbody></table></div>${l.more}<p class="small muted">Diurutkan dari MNSQ terbesar. Outfit > 2 menandakan pola jawaban tidak konsisten (mis. menjawab asal atau salah memahami pernyataan). Kode responden dapat dicari di tab Data responden.</p>`; },
    '23.0': () => `<h3>TABEL 23.0 Dimensionalitas — PCA residu terstandar</h3><div class="table-wrap"><table class="table"><thead><tr><th>Komponen varians</th><th>Nilai eigen</th><th>% total</th><th>% tak dijelaskan</th></tr></thead><tbody>
      <tr><td>Total varians mentah observasi</td><td class="num">${num(u.total.eigen, 2)}</td><td class="num">100</td><td></td></tr><tr><td><b>Varians dijelaskan ukuran</b></td><td class="num">${num(u.dijelaskan.eigen, 2)}</td><td class="num"><b>${num(u.dijelaskan.persen, 1)}%</b></td><td></td></tr>
      <tr><td>&nbsp;&nbsp;· dijelaskan orang</td><td class="num">${num(u.dijelaskan_orang.eigen, 2)}</td><td class="num">${num(u.dijelaskan_orang.persen, 1)}%</td><td></td></tr><tr><td>&nbsp;&nbsp;· dijelaskan butir</td><td class="num">${num(u.dijelaskan_butir.eigen, 2)}</td><td class="num">${num(u.dijelaskan_butir.persen, 1)}%</td><td></td></tr>
      <tr><td><b>Varians tak dijelaskan</b></td><td class="num">${num(u.tak_dijelaskan.eigen, 2)}</td><td class="num">${num(u.tak_dijelaskan.persen, 1)}%</td><td class="num">100</td></tr>
      ${u.kontras.map((k) => `<tr><td>&nbsp;&nbsp;Kontras ke-${k.ke}</td><td class="num ${k.ke === 1 && k.eigen >= 2 ? 'warn-text' : ''}"><b>${num(k.eigen, 2)}</b></td><td class="num">${num(k.persen_total, 1)}%</td><td class="num">${num(k.persen_tak_dijelaskan, 1)}%</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">${esc(d.kriteria.unidimensi)} Varians yang diharapkan dijelaskan bila data cocok sempurna: ${num(u.model_dijelaskan_persen, 1)}%.</p>
      <h4>Muatan butir pada kontras pertama (Tabel 23.2)</h4><p class="small muted">Butir bermuatan positif besar vs negatif besar membentuk dua kelompok yang patut dicek: apakah mewakili subdimensi berbeda.</p>
      <div class="table-wrap"><table class="table item-table"><thead><tr><th>Butir</th><th>Indikator</th><th>Muatan</th><th>Ukuran</th><th>Infit</th><th>Outfit</th></tr></thead><tbody>${u.muatan_kontras1.map((m) => `<tr><td class="mono">${m.label}</td><td class="small">${esc(ind(m.label))}</td><td class="num ${Math.abs(m.muatan) >= 0.4 ? 'warn-text' : ''}"><b>${num(m.muatan, 2)}</b></td><td class="num">${num(m.ukuran, 2)}</td><td class="num">${num(m.infit, 2)}</td><td class="num">${num(m.outfit, 2)}</td></tr>`).join('')}</tbody></table></div>`,
    '28.1': () => { const g = d.tabel28.find((x) => x.kode === raschGroup) || d.tabel28[0]; return `<h3>TABEL 28.1 Subtotal Orang — ${esc(g.nama)}</h3>${grpPick(d.tabel28)}<div class="table-wrap"><table class="table"><thead><tr><th>${esc(g.nama)}</th><th>n</th><th>Rata-rata ukuran</th><th>S.E. rerata</th><th>P.SD</th><th>Median</th><th>Min</th><th>Maks</th><th>Separasi</th><th>Reliabilitas</th></tr></thead><tbody>${g.kelompok.map((k) => `<tr><td>${esc(k.label)}</td><td class="num">${k.n}</td><td class="num"><b>${num(k.mean, 2)}</b></td><td class="num">${num(k.se_mean, 2)}</td><td class="num">${num(k.psd, 2)}</td><td class="num">${num(k.median, 2)}</td><td class="num">${num(k.min, 2)}</td><td class="num">${num(k.max, 2)}</td><td class="num">${num(k.separasi, 2)}</td><td class="num">${num(k.reliabilitas, 2)}</td></tr>`).join('')}</tbody></table></div>
      ${g.perbandingan.length ? `<h4>Uji beda antarkelompok (t Welch)</h4><div class="table-wrap"><table class="table"><thead><tr><th>Kelompok A</th><th>Kelompok B</th><th>Selisih (A−B)</th><th>S.E.</th><th>t</th><th>df</th><th>p</th></tr></thead><tbody>${g.perbandingan.map((x) => `<tr><td>${esc(x.a)}</td><td>${esc(x.b)}</td><td class="num"><b>${num(x.kontras, 2)}</b></td><td class="num">${num(x.se, 2)}</td><td class="num">${num(x.t, 2)}</td><td class="num">${x.df ?? '—'}</td><td class="num ${pTone(x.p)}">${x.p === null ? '—' : x.p < 0.001 ? '< 0,001' : num(x.p, 3)}</td></tr>`).join('')}</tbody></table></div>` : ''}<p class="small muted">Ukuran orang dalam logit (semakin tinggi = kekuatan mental lebih tinggi). Perbandingan memakai uji t Welch untuk 10 kelompok terbesar.</p>`; },
    '30.1': () => { const g = d.tabel30.find((x) => x.kode === raschGroup) || d.tabel30[0]; const l = limitRows(g.kontras, 200); const sig = g.kontras.filter((x) => x.bermakna).length;
      return `<h3>TABEL 30.1 DIF Butir — ${esc(g.nama)}</h3>${grpPick(d.tabel30)}<p class="small">${g.kelompok.length < 2 ? '<span class="muted">Perlu minimal dua kelompok dengan ≥ 5 responden.</span>' : `Kelompok dibandingkan: ${g.kelompok.map((k) => `${esc(k.label)} (n ${k.n})`).join(', ')}. <span class="chip ${sig ? 'warn' : 'ok'}">${sig} kontras DIF bermakna</span>`}</p>
      ${l.rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Butir</th><th>Kelompok A</th><th>Ukuran DIF A</th><th>S.E.</th><th>Kelompok B</th><th>Ukuran DIF B</th><th>S.E.</th><th>Kontras DIF</th><th>S.E. gabungan</th><th>t</th><th>df</th><th>p</th><th>ETS</th></tr></thead><tbody>${l.rows.map((x) => `<tr class="${x.bermakna ? 'dif-sig' : ''}"><td class="mono" title="${esc(ind(x.butir))}">${x.butir}</td><td>${esc(x.a)}</td><td class="num">${num(x.ukuran_a, 2)}</td><td class="num">${num(x.se_a, 2)}</td><td>${esc(x.b)}</td><td class="num">${num(x.ukuran_b, 2)}</td><td class="num">${num(x.se_b, 2)}</td><td class="num"><b>${num(x.kontras, 2)}</b></td><td class="num">${num(x.se, 2)}</td><td class="num">${num(x.t, 2)}</td><td class="num">${x.df ?? '—'}</td><td class="num ${pTone(x.p)}">${x.p === null ? '—' : x.p < 0.001 ? '< 0,001' : num(x.p, 3)}</td><td><span class="chip ${x.kategori.startsWith('C') ? 'crit' : x.kategori.startsWith('B') ? 'warn' : ''}">${esc(x.kategori)}</span></td></tr>`).join('')}</tbody></table></div>${l.more}` : ''}
      <p class="small muted">${esc(d.kriteria.dif)} Ukuran DIF = tingkat kesulitan butir bila diestimasi hanya pada kelompok tersebut (ukuran orang & ambang tetap). Diurutkan dari kontras terbesar.</p>`; },
  };
  return `${smallN(d.n_orang)}<section class="card"><div class="row between wrap">${pick}<small class="muted">${d.n_orang} orang terukur (+${d.orang_ekstrem} ekstrem) · ${d.n_butir} butir · ${d.iterasi} iterasi${d.konvergen ? '' : ' (belum konvergen)'}</small></div>${kpi}
    <p class="small muted">Model Rasch Rating Scale (Andrich), estimasi JMLE; tabel mengikuti penomoran Winsteps. Unduh Excel/Word memuat ke-10 tabel lengkap (termasuk 28.1 & 30.1 untuk semua aspek demografis).</p>${nav}</section>
  <section class="card rasch-view">${V[raschView]()}</section>`;
}
actions.psiRaschView = (el) => { raschView = el.dataset.k; rerender(); };
actions.psiRaschGroup = (el) => { raschGroup = el.dataset.k; rerender(); };

// ---- CFA ----
async function cfaTab() {
  const d = await api(`/admin/psikometri/cfa?${afQs({ model: cfaModel })}`);
  const pick = `<label class="af inline"><span>Model</span><select data-change="psiCfa">${Object.entries(d.model_tersedia).map(([k, l]) => `<option value="${k}" ${d.model === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  if (d.error) return `<section class="card">${pick}<p class="muted">${esc(d.error)}</p></section>`;
  const F = d.fit; const st = (x) => ({ Baik: 'ok', 'Dapat diterima': 'info', Marginal: 'warn', Kurang: 'crit' }[x] || '');
  const ldTone = (v) => (v >= 0.7 ? 'ok' : v >= 0.5 ? '' : 'warn-text');
  const facs = d.per_faktor.map((f) => f.kode);
  const fl = facs.length > 1 ? `<h4>Fornell-Larcker</h4><p class="small muted">Diagonal = √AVE; di bawah diagonal = korelasi antarfaktor. Validitas diskriminan terpenuhi bila √AVE lebih besar dari korelasi pada baris & kolomnya.</p><div class="table-wrap"><table class="table"><thead><tr><th></th>${facs.map((k) => `<th>${k}</th>`).join('')}</tr></thead><tbody>${facs.map((a, i) => `<tr><td><b>${a}</b></td>${facs.map((b, j) => { if (j > i) return '<td></td>'; if (i === j) return `<td class="num"><b>${num(d.per_faktor[i].akar_ave, 3)}</b></td>`; const r = d.korelasi.find((k) => (k.a === a && k.b === b) || (k.a === b && k.b === a)).r; const bad = r >= Math.min(d.per_faktor[i].akar_ave, d.per_faktor[j].akar_ave); return `<td class="num ${bad ? 'crit-text' : ''}">${num(r, 3)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  return `${smallN(d.n)}<section class="card"><div class="row between wrap">${pick}<small class="muted">${d.n} responden lengkap · ${d.butir} butir · ${d.faktor} faktor · ${d.parameter} parameter · ${d.konvergen ? 'konvergen' : 'belum konvergen'}</small></div>
    <div class="kpis">${d.penilaian_fit.map((x) => `<div class="kpi ${st(x.status)}"><span>${esc(x.indeks)}</span><b>${num(x.nilai, 3)}</b><small>${esc(x.status)}</small></div>`).join('')}</div>
    <p class="small">χ²(${F.df}) = ${num(F.chi2, 2)}, p ${F.p < 0.001 ? '< 0,001' : '= ' + num(F.p, 3)} · RMSEA 90% CI [${num(F.rmsea_lo, 3)}; ${num(F.rmsea_hi, 3)}], p-close ${num(F.p_close, 3)} · AIC ${num(F.aic, 1)} · BIC ${num(F.bic, 1)}</p>
    <p class="small muted">${esc(d.kriteria)} Estimator: ${esc(d.estimator)}. Varians faktor ditetapkan 1 (faktor terstandar). Data skala Likert 4 poin: estimator ML dengan korelasi Pearson cenderung sedikit meremehkan muatan; gunakan sebagai uji struktur awal.</p></section>
  <section class="card"><h3>Perbandingan model</h3><div class="table-wrap"><table class="table"><thead><tr><th>Model</th><th>χ²</th><th>df</th><th>CFI</th><th>TLI</th><th>RMSEA</th><th>SRMR</th><th>AIC</th><th>BIC</th></tr></thead><tbody>${d.perbandingan.map((m) => `<tr class="${m.model === d.model ? 'on-row' : ''}"><td>${esc(m.nama)}</td>${m.catatan ? `<td colspan="8" class="small muted">${esc(m.catatan)}</td>` : `<td class="num">${num(m.chi2, 1)}</td><td class="num">${m.df}</td><td class="num">${num(m.cfi, 3)}</td><td class="num">${num(m.tli, 3)}</td><td class="num">${num(m.rmsea, 3)}</td><td class="num">${num(m.srmr, 3)}</td><td class="num">${num(m.aic, 1)}</td><td class="num">${num(m.bic, 1)}</td>`}</tr>`).join('')}</tbody></table></div><p class="small muted">Model dengan AIC/BIC lebih kecil dan CFI lebih besar lebih sesuai dengan data.</p></section>
  <section class="card"><h3>Muatan faktor</h3><div class="table-wrap"><table class="table item-table"><thead><tr><th>Butir</th><th>Faktor</th><th>Indikator</th><th>λ (tak baku)</th><th>S.E.</th><th>z</th><th>p</th><th>λ baku</th><th>R²</th><th>Status</th></tr></thead><tbody>${d.muatan.map((m) => `<tr><td class="mono">${m.label}</td><td>${esc(m.faktor)}</td><td class="small">${esc(m.indikator)}</td><td class="num">${num(m.lambda, 3)}</td><td class="num">${num(m.se, 3)}</td><td class="num">${num(m.z, 2)}</td><td class="num">${m.p === null ? '—' : m.p < 0.001 ? '< 0,001' : num(m.p, 3)}</td><td class="num ${ldTone(m.std)}"><b>${num(m.std, 3)}</b></td><td class="num">${num(m.r2, 3)}</td><td><span class="chip ${m.std >= 0.7 ? 'ok' : m.std >= 0.5 ? '' : 'warn'}">${esc(m.status)}</span></td></tr>`).join('')}</tbody></table></div></section>
  <section class="card"><h3>Reliabilitas komposit & validitas</h3><div class="table-wrap"><table class="table"><thead><tr><th>Faktor</th><th>Butir</th><th>CR</th><th>AVE</th><th>√AVE</th><th>Muatan min–maks</th></tr></thead><tbody>${d.per_faktor.map((f) => `<tr><td><b>${esc(f.nama)}</b></td><td class="num">${f.butir}</td><td class="num ${f.cr >= 0.7 ? '' : 'warn-text'}"><b>${num(f.cr, 3)}</b></td><td class="num ${f.ave >= 0.5 ? '' : 'warn-text'}"><b>${num(f.ave, 3)}</b></td><td class="num">${num(f.akar_ave, 3)}</td><td class="num">${num(f.muatan_min, 2)}–${num(f.muatan_maks, 2)}</td></tr>`).join('')}</tbody></table></div>
    ${fl}${d.htmt.length ? `<h4>HTMT (heterotrait-monotrait)</h4><div class="table-wrap"><table class="table"><thead><tr><th>Pasangan faktor</th><th>HTMT</th><th>Status</th></tr></thead><tbody>${d.htmt.map((h) => `<tr><td>${h.a} – ${h.b}</td><td class="num"><b>${num(h.htmt, 3)}</b></td><td><span class="chip ${h.htmt < 0.85 ? 'ok' : h.htmt < 0.9 ? 'warn' : 'crit'}">${h.htmt < 0.85 ? 'Baik' : h.htmt < 0.9 ? 'Dapat diterima' : 'Perlu ditinjau'}</span></td></tr>`).join('')}</tbody></table></div>` : ''}
    <h4>Korelasi residu terbesar</h4><p class="small muted">Residu |r| > 0,10 menandakan pasangan butir yang hubungannya belum dijelaskan model (mis. redaksi mirip).</p><div class="row wrap">${d.residu_terbesar.map((r) => `<span class="chip ${Math.abs(r.r) > 0.1 ? 'warn' : ''}">${r.a}–${r.b}: ${num(r.r, 3)}</span>`).join('')}</div></section>`;
}
changeHandlers.psiCfa = (el) => { cfaModel = el.value; rerender(); };
changeHandlers.psiRasch = (el) => { raschScale = el.value; rerender(); };

// ---- Data responden ----
async function respTab() {
  const r = await api(`/admin/assessments/respondents?${afQs({ q: respQ })}`);
  return `<section class="card"><form data-form="psiResp" class="row wrap"><input name="q" value="${esc(respQ)}" placeholder="Cari kode responden (R-…)" style="max-width:16rem"><button class="btn ghost" type="submit">Cari</button></form>
    <p class="small muted">${r.total} pengisian. Identitas disamarkan dengan kode responden yang tetap (dapat dipasangkan untuk uji tes-ulang). Klik "Per butir" untuk melihat jawaban.</p>
    <div class="table-wrap"><table class="table"><thead><tr><th>Kode</th><th>Universitas</th><th>Prodi</th><th>Gender</th><th>Umur</th><th>Tingkat</th><th>Tanggal</th><th>Indeks</th><th></th></tr></thead><tbody>
    ${r.items.map((x) => `<tr><td class="mono">${esc(x.kode)}</td><td class="small">${esc(x.universitas || '')}<br><small class="muted">${esc((x.provinsi || '').replace(/^Prov\. /, ''))}</small></td><td class="small">${esc(x.prodi || '')}<br><small class="muted">${esc(x.fakultas || '')}</small></td><td>${esc(x.gender || '—')}</td><td>${x.umur ?? '—'}</td><td class="small">${esc(x.tingkat)}</td><td class="small">${fmtDate(x.diisi_pada)}</td><td><span class="chip ${toneCat(x.kategori_total)}">${x.skor_total} · ${esc(x.kategori_total)}</span></td><td><button class="btn ghost sm" data-act="asmItems" data-id="${x.id}">Per butir</button></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Tidak ada data.</td></tr>'}</tbody></table></div>
    ${r.total > r.items.length ? `<p class="small muted">Menampilkan ${r.items.length} terbaru. Unduh Excel untuk seluruh data.</p>` : ''}</section>`;
}
forms.psiResp = (d) => { respQ = d.q || ''; rerender(); };
actions.asmItems = async (el) => {
  const r = await api(`/admin/assessments/respondents/${el.dataset.id}`);
  openModal(`<h3>Responden ${esc(r.kode)}</h3><p class="small muted">${esc(r.universitas || '')} · ${esc(r.prodi || '')} · angkatan ${r.angkatan || '—'} · ${fmtDT(r.diisi_pada)}</p>
    <div class="row wrap"><span class="chip ${toneCat(r.kategori_total)}">Indeks ${r.skor_total} · ${esc(r.kategori_total)}</span><span class="chip">5 kebutuhan ${r.skor_fondasi}</span><span class="chip">Kendali diri ${r.skor_otot}</span></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>No</th><th>Dimensi</th><th>Pernyataan</th><th>Jawaban</th><th>Skor</th></tr></thead><tbody>${r.butir.map((b) => `<tr class="${b.jawaban ? '' : 'faded'}"><td class="mono">${b.no}</td><td>${esc(b.dimensi)}</td><td class="small">${esc(b.teks)}</td><td class="mono">${esc(b.jawaban || 'tidak ditanyakan')}</td><td class="num">${b.skor ?? '—'}</td></tr>`).join('')}</tbody></table></div>`);
};

// ================= Konten Psikoedukasi · Analisis konten =================
const CA = { universitas: '', sumber: '', dari: '', sampai: '' };
const caQs = () => new URLSearchParams(Object.fromEntries(Object.entries(CA).filter(([, v]) => v))).toString();
const jam = (h) => (h === null || h === undefined ? '—' : h < 1 ? `${Math.round(h * 60)} menit` : h < 48 ? `${num(h, 1)} jam` : `${num(h / 24, 1)} hari`);
const detik = (s) => (s === null || s === undefined ? '—' : s < 60 ? `${Math.round(s)} detik` : `${Math.floor(s / 60)} mnt ${String(Math.round(s % 60)).padStart(2, '0')} dtk`);
const TYPE_ICON = { artikel: '📰', video: '🎬', podcast: '🎧', infografis: '🖼️', slide: '📊', bibliokonseling: '📚' };
const miniBars = (rows, fmt = (x) => x) => { const max = Math.max(1, ...rows.map((r) => r.jumlah)); return `<div class="mini-bars">${rows.map((r) => `<div class="mb-row"><span>${esc(r.label)}</span><span class="mb-track"><i style="width:${(r.jumlah / max) * 100}%"></i></span><b>${fmt(r.jumlah)}</b></div>`).join('')}</div>`; };
export async function contentAnalytics() {
  const [o, d] = await Promise.all([api('/admin/cohort/options'), api(`/admin/content-analytics?${caQs()}`)]);
  const e = d.keterlibatan; const typeLabel = (t) => state.ref.content_types[t] || t;
  const filter = `<section class="card af-bar"><div class="af-grid">
    <label class="af"><span>Universitas</span><select data-change="caSet" data-k="universitas"><option value="">Seluruh kampus</option>${o.universitas.map((u) => `<option value="${u.id}" ${CA.universitas === u.id ? 'selected' : ''}>${esc(u.nama)}</option>`).join('')}</select></label>
    <label class="af"><span>Sumber konten</span><select data-change="caSet" data-k="sumber"><option value="">Semua</option><option value="admin" ${CA.sumber === 'admin' ? 'selected' : ''}>Pustaka admin</option><option value="konselor" ${CA.sumber === 'konselor' ? 'selected' : ''}>Buatan konselor</option></select></label>
    <label class="af"><span>Akses sejak</span><input type="date" data-change="caSet" data-k="dari" value="${esc(CA.dari)}"></label>
    <label class="af"><span>Akses sampai</span><input type="date" data-change="caSet" data-k="sampai" value="${esc(CA.sampai)}"></label></div></section>`;
  const check = (ok, label) => `<span class="ck ${ok ? 'on' : ''}" title="${label}">${ok ? '✔' : '○'} ${label}</span>`;
  const top7 = `<section class="card"><div class="row between wrap"><h3>7 kebutuhan konten paling dibutuhkan</h3><small class="muted">dari asesmen terakhir ${d.jumlah_mahasiswa_asesmen} mahasiswa${d.universitas ? ` · ${esc(d.universitas)}` : ''}</small></div>
    ${d.kebutuhan_top7.length ? `<ol class="need7">${d.kebutuhan_top7.map((x) => `<li class="${x.sudah_terbit ? 'done' : ''}"><div class="n7-main"><b>${esc(x.aspek)}</b><small class="muted">Butir ${x.no} · ${esc(x.dimensi)} ${esc(x.dimensi_nama || '')} — “${esc(x.pernyataan)}”</small>
        <div class="n7-checks">${check(x.sudah_dibuat, 'Sudah dibuat')}${check(x.sudah_terbit, 'Sudah dipublikasikan')}<label class="ck-manual"><input type="checkbox" data-change="needDone" data-k="${x.kunci}" ${x.selesai ? 'checked' : ''}> Tandai tuntas</label></div>
        ${x.konten_cocok.length ? `<small class="muted">Konten: ${x.konten_cocok.slice(0, 3).map((c) => `${esc(c.judul)} (${c.status === 'published' ? 'terbit' : 'draf'})`).join(' · ')}</small>` : ''}</div>
      <div class="n7-side"><b>${x.mahasiswa}</b><small>mahasiswa · ${num(x.persen)}%</small>${x.sudah_terbit ? '' : `<button class="btn ${x.sudah_dibuat ? 'ghost' : 'primary'} sm" data-act="contentEdit" data-kws="${esc(x.kata_kunci.join('|'))}" data-cat="${x.dimensi}" data-title="${esc(x.aspek || '')}">${x.sudah_dibuat ? 'Buat lagi' : 'Buat konten'}</button>`}</div></li>`).join('')}</ol>
      <p class="small muted">✔ Sudah dibuat = ada konten pustaka admin dengan kata kunci yang cocok (draf atau terbit). ✔ Sudah dipublikasikan = konten itu sudah terbit. ${d.kebutuhan_top7.filter((x) => x.sudah_terbit).length}/${d.kebutuhan_top7.length} kebutuhan teratas sudah punya konten terbit.</p>` : '<p class="muted">Belum ada data asesmen.</p>'}</section>`;
  const maxP = Math.max(1, ...d.media.map((m) => m.pembaca));
  const media = `<section class="card"><div class="row between wrap"><h3>Bentuk media yang paling disukai</h3>${d.media_favorit ? `<span class="chip ok">Favorit: ${TYPE_ICON[d.ranking_media[0]] || ''} ${esc(d.media_favorit)}</span>` : ''}</div>
    <div class="mini-bars">${[...d.media].sort((a, b) => b.pembaca - a.pembaca).map((m) => `<div class="mb-row"><span>${TYPE_ICON[m.tipe] || ''} ${esc(m.label)}</span><span class="mb-track"><i style="width:${(m.pembaca / maxP) * 100}%"></i></span><b>${m.pembaca} mhs</b></div>`).join('')}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Jenis</th><th>Konten terbit</th><th>Dibuka</th><th>Pembaca</th><th>Dibuka/konten</th><th>Durasi rata-rata</th><th>Refleksi GURU</th><th>Rating konselor</th></tr></thead><tbody>
    ${d.media.map((m) => `<tr><td>${TYPE_ICON[m.tipe] || ''} ${esc(m.label)}</td><td class="num">${m.konten}</td><td class="num">${m.dilihat}</td><td class="num">${m.pembaca} <small class="muted">(${num(m.persen_pembaca)}%)</small></td><td class="num">${num(m.dilihat_per_konten)}</td><td class="num">${detik(m.durasi_rata)}</td><td class="num">${m.refleksi_guru}${m.tingkat_refleksi !== null ? ` <small class="muted">(${num(m.tingkat_refleksi)}%)</small>` : ''}</td><td class="num">${m.rating_konselor !== null ? `★ ${num(m.rating_konselor)}` : '—'}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Diurutkan menurut jumlah mahasiswa berbeda yang membuka (pembaca). % pembaca = bagian dari seluruh mahasiswa yang pernah membuka konten. Tingkat refleksi = refleksi GURU dibanding pembaca.</p></section>`;
  const pop = `<section class="card"><h3>5 konten terpopuler di setiap jenis</h3><div class="pop-grid">${d.populer.map((g) => `<div class="pop-col"><h4>${TYPE_ICON[g.tipe] || ''} ${esc(g.label)} <small class="muted">${g.jumlah_terbit} terbit</small></h4>
    ${g.konten.length ? `<ol>${g.konten.map((c) => `<li><b>${esc(c.judul)}</b><small class="muted">${c.pembaca} pembaca · ${c.dilihat}× dibuka · ${detik(c.durasi_rata)}${c.refleksi_guru ? ` · ${c.refleksi_guru} refleksi` : ''}${c.sumber === 'konselor' ? ' · buatan konselor' : ''}</small></li>`).join('')}</ol>` : '<p class="small muted">Belum ada yang membuka.</p>'}</div>`).join('')}</div></section>`;
  const r = e.latensi.rekomendasi;
  const eng = `<section class="card"><h3>Monitoring keterlibatan (engagement)</h3>
    <div class="kpis"><div class="kpi"><span>Count · jumlah akses</span><b>${num(e.count.akses, 0)}</b><small>${e.count.pembaca} mahasiswa · ${e.count.konten_dibuka}/${e.count.konten_terbit} konten pernah dibuka</small></div>
      <div class="kpi"><span>Frekuensi per mahasiswa</span><b>${num(e.frekuensi.rata_per_mahasiswa)}×</b><small>median ${num(e.frekuensi.median_per_mahasiswa)}× akses</small></div>
      <div class="kpi"><span>Latensi rekomendasi → dibuka</span><b>${jam(r.median_jam)}</b><small>median · ${num(r.persen_dibuka)}% rekomendasi dibuka · ${num(r.persen_7_hari)}% dalam 7 hari</small></div>
      <div class="kpi"><span>Durasi per akses</span><b>${detik(e.durasi.median_detik)}</b><small>median · rata-rata ${detik(e.durasi.rata_detik)} (${e.durasi.tercatat} akses tercatat)</small></div>
      <div class="kpi"><span>Inter-response time</span><b>${jam(e.jeda.median_jam)}</b><small>median jeda antarakses · rata-rata ${jam(e.jeda.rata_jam)}</small></div></div>
    <div class="grid-2 eng-grid">
      <div><h4>Frekuensi: akses per mahasiswa</h4>${miniBars(e.frekuensi.sebaran, (x) => `${x} mhs`)}
        <h4>Akses per minggu (8 minggu terakhir)</h4>${lineChart(e.frekuensi.mingguan.map((w) => ({ label: `Minggu ${w.minggu}: ${w.pembaca} mahasiswa`, short: w.minggu.slice(5).replace('-', '/'), value: w.dilihat })), { min: 0, max: Math.max(5, ...e.frekuensi.mingguan.map((w) => w.dilihat)), unit: ' akses', height: 140 })}</div>
      <div><h4>Durasi membuka konten</h4>${miniBars(e.durasi.sebaran, (x) => `${x}×`)}
        <h4>Jeda antarakses (inter-response time)</h4>${miniBars(e.jeda.sebaran, (x) => `${x}×`)}
        <h4>Latensi</h4><ul class="plain small"><li>Rekomendasi asesmen → pertama kali dibuka: median <b>${jam(r.median_jam)}</b>, rata-rata ${jam(r.rata_jam)} (${r.dibuka} dari ${r.jumlah} rekomendasi dibuka).</li><li>Konten terbit → dibuka pertama oleh mahasiswa: median <b>${jam(e.latensi.terbit.median_jam)}</b> (${e.latensi.terbit.konten} konten).</li></ul></div></div>
    <p class="small muted"><b>Count</b> = banyaknya akses. <b>Frekuensi</b> = seberapa sering tiap mahasiswa membuka konten. <b>Latensi</b> = waktu tunggu sampai konten dibuka setelah direkomendasikan/terbit (makin pendek makin baik). <b>Durasi</b> = lama halaman konten terbuka dan terlihat. <b>Inter-response time</b> = jeda antara dua akses berurutan oleh mahasiswa yang sama; jeda pendek dan teratur menandakan kebiasaan belajar yang terbentuk.</p></section>`;
  return filter + top7 + media + pop + eng;
}
changeHandlers.caSet = (el) => { CA[el.dataset.k] = el.value; rerender(); };
