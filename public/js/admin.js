// Admin: Monitoring Asesmen (profil kekuatan mental nasional) & Psikometrik (kehandalan instrumen IKDKM-M).
import { state, api, download, esc, actions, forms, changeHandlers, openModal, toast, fmtDT, fmtDate, lineChart, toneCat, radarChart, confirmBox } from './core.js';
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
let psiTab = 'butir'; let demoKey = 'gender'; let raschScale = 'FONDASI'; let respQ = '';
const aTone = (a) => (a === null ? '' : a >= 0.8 ? 'ok' : a >= 0.7 ? 'info' : a >= 0.6 ? 'warn' : 'crit');
const pTone = (p) => (p === null ? '' : p < 0.05 ? 'crit-text' : '');
const fitTone = (k) => ({ Cocok: 'ok', 'Perlu ditinjau': 'warn', 'Tidak cocok': 'crit' }[k] || '');
const statusTone = (s) => ({ Valid: 'ok', 'Perlu ditinjau': 'warn', 'Tidak valid': 'crit', Nonaktif: '' }[s] || '');
const KAT_LABEL = { Kuat: 'Kuat', Rentan: 'Mulai melemah', Lemah: 'Sedang lemah', Tangguh: 'Tangguh', Krisis: 'Krisis' };
const NORM_NAMA = { dimensi: 'Tiap kebutuhan dasar (V1–V5, 4–16)', fondasi: '5 Kebutuhan Dasar gabungan (20–80)', otot: 'Kendali Diri & Kebiasaan Baik (8–32)', total: 'Indeks Kekuatan Mental (28–112)' };
let INSTR = null;

export async function adminPsikometrik() {
  const tabs = `<div class="tabs">${[['butir', 'Butir & interpretasi'], ['deskriptif', 'Analisis deskriptif'], ['validitas', 'Validitas & reliabilitas'], ['demografis', 'Analisis demografis'], ['rasch', 'Analisis Rasch'], ['responden', 'Data responden']].map(([k, l]) => `<a href="#" class="${psiTab === k ? 'on' : ''}" data-act="psiTab" data-k="${k}">${l}</a>`).join('')}</div>`;
  const head = `<div class="row between wrap"><div><h1>Psikometrik</h1><p class="muted">Pemantauan kehandalan instrumen IKDKM-M: pengaturan butir & interpretasi, serta uji statistik dari jawaban mahasiswa.</p></div><button class="btn" data-act="psiExport">Unduh data & statistik (Excel)</button></div>`;
  if (psiTab === 'butir') return head + tabs + await instrumentTab();
  const bar = await filterBar();
  return head + bar + tabs + await ({ deskriptif: descTab, validitas: validTab, demografis: demoTab, rasch: raschTab, responden: respTab }[psiTab])();
}
actions.psiTab = (el) => { psiTab = el.dataset.k; rerender(); };
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
      <div class="table-wrap"><table class="table"><thead><tr><th>Aktif</th><th>No</th><th>Indikator & pernyataan</th><th>Jenis</th></tr></thead><tbody>${g.butir.map((b) => `<tr class="${b.aktif ? '' : 'faded'}"><td>${b.terkunci ? `<span class="chip" title="${esc(b.terkunci)}">🔒 Terkunci</span>` : `<label class="switch"><input type="checkbox" data-change="psiItem" data-no="${b.no}" ${b.aktif ? 'checked' : ''} aria-label="Butir ${b.no} aktif"><span></span></label>`}</td><td class="mono">${b.no}</td><td><b>${esc(b.indikator)}</b><br><small class="muted">${esc(b.teks)}</small></td><td><span class="chip">${b.arah === '+' ? 'Positif' : 'Negatif'}</span></td></tr>`).join('')}</tbody></table></div></details>`).join('')}</section>`;
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

// ---- Rasch ----
async function raschTab() {
  const d = await api(`/admin/psikometri/rasch?${afQs({ skala: raschScale })}`);
  const pick = `<label class="af inline"><span>Skala</span><select data-change="psiRasch">${d.skala_tersedia.map((s) => `<option value="${s.kode}" ${d.skala === s.kode ? 'selected' : ''}>${esc(s.nama)}</option>`).join('')}</select></label>`;
  if (d.error) return `<section class="card">${pick}<p class="muted">${esc(d.error)}</p></section>`;
  const relTone = (r) => (r >= 0.8 ? 'ok' : r >= 0.67 ? 'warn' : 'crit');
  const maxP = Math.max(1, ...d.peta_wright.map((w) => w.orang));
  const wright = `<div class="wright"><div class="w-head"><span>Logit</span><span>Mahasiswa (kemampuan) ←</span><span>→ Butir (tingkat kesulitan)</span></div>${d.peta_wright.map((w) => `<div class="w-row"><span class="w-l mono">${num(w.batas, 1)}</span><span class="w-p"><i style="width:${(w.orang / maxP) * 100}%"></i>${w.orang ? `<small>${w.orang}</small>` : ''}</span><span class="w-i">${w.butir.map((no) => `<b class="chip">${no}</b>`).join('')}</span></div>`).join('')}</div>`;
  return `${smallN(d.n_orang)}<section class="card"><div class="row between wrap">${pick}<small class="muted">${d.n_orang} responden · ${d.n_butir} butir · ${d.iterasi} iterasi${d.konvergen ? '' : ' (belum konvergen)'}${d.orang_ekstrem ? ` · ${d.orang_ekstrem} responden ekstrem dikeluarkan` : ''}</small></div>
    <div class="kpis"><div class="kpi ${relTone(d.orang.reliabilitas)}"><span>Reliabilitas orang</span><b>${num(d.orang.reliabilitas, 2)}</b><small>separasi ${num(d.orang.separasi, 2)}</small></div>
      <div class="kpi ${relTone(d.butir_ringkas.reliabilitas)}"><span>Reliabilitas butir</span><b>${num(d.butir_ringkas.reliabilitas, 2)}</b><small>separasi ${num(d.butir_ringkas.separasi, 2)}</small></div>
      <div class="kpi"><span>Rata-rata ukuran orang</span><b>${num(d.orang.rata, 2)}</b><small>logit · SD ${num(d.orang.sd, 2)}</small></div>
      <div class="kpi ${d.ambang_berurutan ? 'ok' : 'warn'}"><span>Ambang kategori</span><b>${d.ambang_berurutan ? 'Berurutan' : 'Tidak berurutan'}</b><small>${d.orang.misfit} responden tidak cocok (outfit > 2)</small></div></div>
    <p class="small muted">${esc(d.kriteria)} Model: Rasch Rating Scale (Andrich), estimasi JMLE. Ukuran butir positif = lebih sulit disetujui (kebutuhan lebih jarang terpenuhi).</p></section>
  <div class="grid-2"><section class="card"><h3>Peta Wright (orang–butir)</h3>${wright}</section>
    <section class="card"><h3>Struktur kategori jawaban</h3><div class="table-wrap"><table class="table"><thead><tr><th>Skor</th><th>Jumlah</th><th>%</th><th>Rata-rata ukuran</th><th>Ambang Andrich</th></tr></thead><tbody>${d.kategori.map((c) => `<tr><td class="mono">${c.kategori + 1}</td><td class="num">${c.jumlah}</td><td class="num">${num(c.persen)}</td><td class="num">${num(c.rata_ukuran, 2)}</td><td class="num">${c.ambang === null ? '—' : num(c.ambang, 2)}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted">Skor 1–4 setelah pernyataan negatif dibalik. Rata-rata ukuran dan ambang yang naik dari skor 1 ke 4 menandakan pilihan jawaban SS/S/TS/STS dipahami dengan benar oleh responden.</p></section></div>
  <section class="card"><h3>Ukuran & kecocokan butir</h3><div class="table-wrap"><table class="table item-table"><thead><tr><th>Butir</th><th>Indikator</th><th>Ukuran (logit)</th><th>SE</th><th>Infit MNSQ</th><th>Outfit MNSQ</th><th>Korelasi titik-ukuran</th><th>Kecocokan</th></tr></thead><tbody>
    ${d.butir.map((b) => `<tr><td class="mono">${b.no}<br><small class="muted">${esc(b.dimensi)}</small></td><td class="small">${esc(b.indikator)}</td><td class="num"><b>${num(b.measure, 2)}</b></td><td class="num">${num(b.se, 2)}</td><td class="num ${b.infit < 0.5 || b.infit > 1.5 ? 'warn-text' : ''}">${num(b.infit, 2)}</td><td class="num ${b.outfit < 0.5 || b.outfit > 1.5 ? 'warn-text' : ''}">${num(b.outfit, 2)}</td><td class="num ${b.pt_measure !== null && b.pt_measure <= 0 ? 'crit-text' : ''}">${num(b.pt_measure, 2)}</td><td><span class="chip ${fitTone(b.kecocokan)}">${esc(b.kecocokan)}</span></td></tr>`).join('')}</tbody></table></div></section>`;
}
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
