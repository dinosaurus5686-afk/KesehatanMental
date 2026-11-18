// Inti klien: API (dengan refresh token otomatis), router hash, utilitas tampilan, modal, toast, grafik.
export const state = { token: null, user: null, ref: null, pub: null, socket: null, unread: 0 };

// ---------- API ----------
let refreshing = null;
async function refresh() {
  if (!refreshing) refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin' })
    .then(async (r) => { if (!r.ok) throw new Error('expired'); const d = await r.json(); state.token = d.access_token; state.user = d.user; return d; })
    .finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  return refreshing;
}
export async function api(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
  const go = () => fetch('/api' + path, {
    method, credentials: 'same-origin',
    headers: { ...(body !== undefined && !(body instanceof Blob) ? { 'Content-Type': 'application/json' } : {}), ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}), ...headers },
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
  });
  let res = await go();
  if (res.status === 401 && state.token && !path.startsWith('/auth/')) {
    try { await refresh(); res = await go(); } catch { location.hash = '#/masuk'; state.token = null; throw new ApiError('Sesi berakhir. Silakan masuk kembali.', 401); }
  }
  if (raw) { if (!res.ok) throw new ApiError((await res.json().catch(() => ({}))).error || 'Gagal mengunduh.', res.status); return res; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || 'Terjadi kesalahan.', res.status, data.code);
  return data;
}
export class ApiError extends Error { constructor(m, status, code) { super(m); this.status = status; this.code = code; } }
export const tryRefresh = refresh;

export async function download(path, fallbackName) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const name = (res.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)?.[1] || fallbackName;
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- utilitas ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TZ = { timeZone: 'Asia/Jakarta' };
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', ...TZ }) : '—');
export const fmtDT = (d) => (d ? new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', ...TZ }) : '—');
export const fmtTime = (d) => new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', ...TZ });
export const ago = (d) => {
  const m = Math.round((Date.now() - new Date(d)) / 60000);
  if (m < 1) return 'baru saja'; if (m < 60) return `${m} menit lalu`; const h = Math.round(m / 60); if (h < 24) return `${h} jam lalu`; const dd = Math.round(h / 24); return dd < 30 ? `${dd} hari lalu` : fmtDate(d);
};
export const toLocalInput = (d) => { const t = new Date(d); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 16); };
// Nama dimensi dalam bahasa sehari-hari (istilah teknis tersedia lewat domainTech)
export const domainLabel = (k) => state.ref?.dimensions.find((d) => d.kode === k)?.mudah || (k === 'UMUM' ? 'Layanan & Bantuan' : k || '—');
export const domainTech = (k) => state.ref?.dimensions.find((d) => d.kode === k)?.label || k;
export const domainName = (k) => state.ref?.dimensions.find((d) => d.kode === k)?.nama || k;
// Nada warna kategori IKDKM-M: Kuat/Tangguh → hijau, Rentan → kuning, Lemah/Krisis → merah
export const toneCat = (c) => (c === 'Kuat' || c === 'Tangguh' ? 'ok' : c === 'Rentan' ? 'warn' : c ? 'crit' : '');
export const normDesc = (norm, kat) => state.ref?.norms?.[norm]?.batas.find((b) => b[1] === kat)?.[2] || '';
export const scaleLabel = (code) => state.ref?.scale.find(([c]) => c === code)?.[1] || code;
export const catTone = (kategori, risk) => (risk === 'red' || kategori === 'PERLU PERHATIAN SEGERA' ? 'crit' : kategori === 'Baik/Adaptif' ? 'ok' : kategori === 'Cukup (Perlu Penguatan)' ? 'info' : 'warn');
export const pctTone = (p) => (p >= 80 ? 'ok' : p >= 60 ? 'info' : p >= 40 ? 'warn' : 'crit');
export const riskChip = (r) => (r === 'red' ? '<span class="chip crit">Risiko merah</span>' : r === 'yellow' ? '<span class="chip warn">Risiko kuning</span>' : '');
export const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ---------- aksi & form (event delegation) ----------
export const actions = {}; export const forms = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) { e.preventDefault(); Promise.resolve(fn(el, e)).catch(showError); }
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = forms[f.dataset.form];
  if (!fn) return;
  const btn = f.querySelector('[type=submit]'); if (btn) btn.disabled = true;
  Promise.resolve(fn(formData(f), f)).catch(showError).finally(() => { if (btn && btn.isConnected) btn.disabled = false; });
});
export const changeHandlers = {};
document.addEventListener('change', (e) => { const el = e.target.closest('[data-change]'); if (el && changeHandlers[el.dataset.change]) Promise.resolve(changeHandlers[el.dataset.change](el, e)).catch(showError); });
export const inputHandlers = {};
document.addEventListener('input', (e) => { const el = e.target.closest('[data-input]'); if (el && inputHandlers[el.dataset.input]) inputHandlers[el.dataset.input](el, e); });

// ---------- toast & modal ----------
export function toast(msg, tone = 'ok') {
  const t = document.createElement('div'); t.className = `toast ${tone}`; t.setAttribute('role', 'status'); t.textContent = msg;
  document.getElementById('toasts').appendChild(t); setTimeout(() => t.remove(), 4200);
}
export function showError(e) { console.error(e); toast(e?.message || 'Terjadi kesalahan.', 'crit'); }

let modalLocked = false;
export function openModal(html, { locked = false, wide = false } = {}) {
  modalLocked = locked;
  const m = document.getElementById('modal');
  m.innerHTML = `<div class="modal-card ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${locked ? '' : '<button class="modal-x" data-act="closeModal" aria-label="Tutup">×</button>'}${html}</div>`;
  m.hidden = false; document.body.classList.add('noscroll');
  setTimeout(() => m.querySelector('input,textarea,select,button:not(.modal-x)')?.focus(), 30);
}
export function closeModal() { const m = document.getElementById('modal'); m.hidden = true; m.innerHTML = ''; modalLocked = false; document.body.classList.remove('noscroll'); }
actions.closeModal = closeModal;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modalLocked && !document.getElementById('modal').hidden) closeModal(); });
document.addEventListener('mousedown', (e) => { if (e.target.id === 'modal' && !modalLocked) closeModal(); });

export function confirmBox(text, { ok = 'Ya, lanjutkan', tone = 'crit' } = {}) {
  return new Promise((resolve) => {
    openModal(`<h3>Konfirmasi</h3><p>${esc(text)}</p><div class="row end"><button class="btn ghost" data-act="cfNo">Batal</button><button class="btn ${tone}" data-act="cfYes">${esc(ok)}</button></div>`);
    actions.cfYes = () => { closeModal(); resolve(true); }; actions.cfNo = () => { closeModal(); resolve(false); };
  });
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Disalin ke papan klip.'); } catch { toast('Salin manual: ' + text, 'info'); }
}
actions.copy = (el) => copyText(el.dataset.text);

// ---------- grafik SVG ----------
export function lineChart(points, { min = 0, max = 100, height = 160, unit = '%', labels = true } = {}) {
  if (!points.length) return '<p class="muted small">Belum ada data.</p>';
  const W = 560, H = height, pl = 34, pr = 14, pt = 14, pb = labels ? 28 : 10;
  const x = (i) => pl + (points.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (points.length - 1));
  const y = (v) => pt + (1 - (v - min) / (max - min)) * (H - pt - pb);
  const ticks = [min, (min + max) / 2, max];
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${y(min)} L${x(0).toFixed(1)},${y(min)} Z`;
  const step = Math.max(1, Math.ceil(points.length / 7));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik tren">
    ${ticks.map((t) => `<line x1="${pl}" x2="${W - pr}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${pl - 6}" y="${y(t) + 4}" class="axis" text-anchor="end">${Math.round(t)}</text>`).join('')}
    <path d="${area}" class="area"/><path d="${path}" class="line"/>
    ${points.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.value)}" r="${i === points.length - 1 ? 5 : 3}" class="${i === points.length - 1 ? 'dot end' : 'dot'}"><title>${esc(p.label)}: ${p.value}${unit}</title></circle>`).join('')}
    ${labels ? points.map((p, i) => (i % step === 0 || i === points.length - 1 ? `<text x="${x(i)}" y="${H - 8}" class="axis" text-anchor="${points.length > 1 && i === 0 ? 'start' : points.length > 1 && i === points.length - 1 ? 'end' : 'middle'}">${esc(p.short || p.label)}</text>` : '')).join('') : ''}
  </svg>`;
}

export function bars(rows) {
  // rows: [{label, value (0-100), tone, note}]
  return `<div class="bars">${rows.map((r) => `<div class="bar-row"><div class="bar-label">${esc(r.label)}</div><div class="bar-track"><div class="bar-fill ${r.tone || ''}" style="width:${Math.max(2, Math.min(100, r.value))}%"></div></div><div class="bar-val">${esc(r.note ?? r.value + '%')}</div></div>`).join('')}</div>`;
}

export function meter(value, tone) {
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - value / 100);
  return `<div class="meter ${tone}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${r}" class="m-bg"/><circle cx="60" cy="60" r="${r}" class="m-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><div class="m-val"><b>${value}</b><span>%</span></div></div>`;
}

// Skor per dimensi IKDKM-M: batang terhadap rentang (min–maks), garis ambang "melemah", label kategori
export function dimBars(dimensi, { mudah = false } = {}) {
  return `<div class="dimbars">${dimensi.map((d) => {
    const ref = state.ref?.dimensions.find((x) => x.kode === d.kode);
    const pct = ((d.skor - d.min) / (d.max - d.min)) * 100;
    const amb = state.ref?.weakness?.[d.kode]?.ambang; const ap = amb ? ((amb - d.min) / (d.max - d.min)) * 100 : null;
    return `<div class="db-row"><div class="db-label" ${mudah && ref ? `title="${esc(ref.penjelasan)}"` : ''}>${esc(mudah && ref ? ref.mudah : d.label)}${mudah && ref ? (ref.bagian === 2 ? `<small>${esc(ref.label)}</small>` : '') : `<small>${esc(d.nama)}</small>`}</div><div class="db-track">${ap != null ? `<span class="db-amb" style="left:${ap}%" title="Ambang melemah ≤ ${amb}"></span>` : ''}<div class="db-fill ${toneCat(d.kategori)}" style="width:${Math.max(3, pct)}%"></div></div>
      <div class="db-val"><b class="mono">${d.skor}</b><small>/${d.max}</small> <span class="chip ${toneCat(d.kategori)}">${esc(d.kategori)}</span></div></div>`;
  }).join('')}</div>`;
}

// Interpretasi visual untuk konseli (data dari server: aturan & pustaka kalimat tetap, bukan AI)
// Diagram radar 5 kebutuhan dasar (skor 4–16). Pita latar: merah = lemah (4–7), kuning = mulai melemah (8–12), hijau = kuat (13–16).
const RADAR_SHORT = { V1: 'Survival', V2: 'Love & Belonging', V3: 'Power / Achievement', V4: 'Freedom', V5: 'Fun' };
export function radarChart(data, { size = 340 } = {}) {
  const n = data.length; const c = size / 2; const R = size * 0.32;
  const pt = (i, v) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; const r = R * Math.max(0, Math.min(1, (v - 4) / 12)); return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
  const ring = (v) => data.map((_, i) => pt(i, v).map((x) => x.toFixed(1)).join(',')).join(' ');
  const poly = data.map((d, i) => pt(i, d.skor).map((x) => x.toFixed(1)).join(',')).join(' ');
  const tone = { Kuat: '#22b07d', Rentan: '#e2932a', Lemah: '#ef5a6f' };
  const labels = data.map((d, i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; const x = c + (R + 26) * Math.cos(a); const y = c + (R + 26) * Math.sin(a);
    const anchor = Math.abs(Math.cos(a)) < 0.2 ? 'middle' : Math.cos(a) > 0 ? 'start' : 'end';
    return `<text x="${x.toFixed(1)}" y="${(y + (Math.sin(a) > 0.5 ? 8 : Math.sin(a) < -0.5 ? -4 : 4)).toFixed(1)}" text-anchor="${anchor}" class="rd-label">${esc(RADAR_SHORT[d.kode] || d.nama)}</text>
      <text x="${x.toFixed(1)}" y="${(y + (Math.sin(a) > 0.5 ? 24 : Math.sin(a) < -0.5 ? 12 : 20)).toFixed(1)}" text-anchor="${anchor}" class="rd-score" fill="${tone[d.status]}">${d.skor}/${d.max}</text>`;
  }).join('');
  return `<svg class="radar" viewBox="${-64} 0 ${size + 128} ${size}" role="img" aria-label="Diagram radar 5 kebutuhan: ${data.map((d) => `${RADAR_SHORT[d.kode] || d.nama} ${d.skor} dari ${d.max}`).join(', ')}">
    <polygon points="${ring(16)}" fill="#22b07d22" stroke="none"/><polygon points="${ring(12.5)}" fill="#e2932a2a" stroke="none"/><polygon points="${ring(7.5)}" fill="#ef5a6f2a" stroke="none"/>
    ${[8, 12, 16].map((v) => `<polygon points="${ring(v)}" fill="none" stroke="var(--line)" stroke-width="1"/>`).join('')}
    ${data.map((_, i) => { const [x, y] = pt(i, 16); return `<line x1="${c}" y1="${c}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--line)"/>`; }).join('')}
    ${data.every((d) => d.awal != null) ? `<polygon points="${data.map((d, i) => pt(i, d.awal).map((x) => x.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#7a809e" stroke-width="1.8" stroke-dasharray="5 4"/>` : ''}
    <polygon points="${poly}" fill="#2f55d433" stroke="#2f55d4" stroke-width="2.5" stroke-linejoin="round"/>
    ${data.map((d, i) => { const [x, y] = pt(i, d.skor); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="${tone[d.status]}" stroke="#fff" stroke-width="1.5"/>`; }).join('')}
    ${labels}</svg>`;
}

export function interpretView(iv, { konselor = false } = {}) {
  if (!iv) return '';
  const r = iv.ringkasan;
  const tone = { Tangguh: 'ok', Rentan: 'warn', Krisis: 'crit' }[r.kategori] || 'info';
  return `<section class="iv">
    <div class="iv-hero ${tone}"><span class="iv-emoji" aria-hidden="true">${r.ikon}</span><div><span class="eyebrow">${konselor ? 'Penjelasan yang dilihat konseli' : 'Apa artinya hasilmu?'}</span><h2>${esc(r.judul)}</h2><p>${esc(r.pesan)}</p>
      <div class="iv-tags">${iv.kekuatan.length ? `<span class="iv-tag good">💪 Kekuatan: ${iv.kekuatan.map((k) => `${k.ikon} ${esc(k.nama)}`).join(' · ')}</span>` : ''}${iv.perlu.length ? `<span class="iv-tag need">🌱 Perlu dikuatkan: ${iv.perlu.map((k) => `${k.ikon} ${esc(k.nama)}`).join(' · ')}</span>` : ''}</div></div></div>
    ${iv.segera ? `<div class="notice crit"><b>🆘 Kamu tidak sendirian.</b> Konselor jaga sudah diberi tahu dan akan menghubungimu. Kamu juga bisa langsung <a href="#/s/konseling"><b>mendaftar konseling</b></a>.</div>` : ''}
    <h3 class="iv-h"><span aria-hidden="true">🧩</span> Kondisi 5 kebutuhan dasarmu</h3>
    ${iv.radar?.length ? `<div class="iv-radar">${radarChart(iv.radar)}<div class="iv-legend"><span class="lg kuat">Kuat (13–16)</span><span class="lg rentan">Mulai melemah (8–12)</span><span class="lg lemah">Sedang lemah (4–7)</span></div></div>` : ''}
    <div class="iv-grid">${iv.bagian.map((b) => `<article class="iv-card c-${b.warna}" data-ikon="${b.ikon}"><header><span class="iv-ico" aria-hidden="true">${b.ikon}</span><b>${esc(b.nama)}</b><span class="iv-status ${b.nada}">${b.status_ikon} ${esc(b.status_label)}</span></header>
      <div class="iv-meter" role="img" aria-label="${b.skor} dari ${b.max}"><span style="width:${Math.round((b.skor / b.max) * 100)}%"></span></div>
      <p>${esc(b.makna)}</p><p class="iv-tip"><span aria-hidden="true">💡</span> <span><b>Coba:</b> ${esc(b.coba)}</span></p></article>`).join('')}</div>
    <h3 class="iv-h"><span aria-hidden="true">🧭</span> Langkah selanjutnya</h3>
    <div class="iv-steps">${iv.langkah.map((l, i) => `<a class="iv-step" href="${esc(l.tautan)}"><span class="iv-n">${i + 1}</span><span aria-hidden="true" class="iv-ico">${l.ikon}</span><span>${esc(l.teks)}</span></a>`).join('')}</div>
    ${iv.dukungan.length ? `<p class="iv-want"><b>Kamu ingin dibantu dengan:</b> ${iv.dukungan.map((d) => `<span class="iv-tag">${d.ikon} ${esc(d.teks)}</span>`).join(' ')}</p>` : ''}
    <p class="iv-note"><span aria-hidden="true">ℹ️</span> ${esc(iv.catatan)}</p>
  </section>`;
}

// Tren Indeks Kekuatan Mental (28–112) dari waktu ke waktu
export function indexTrend(rows, { height = 160 } = {}) {
  const sh = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
  return lineChart(rows.map((r) => ({ label: `${fmtDate(r.diisi_pada)} · ${r.kategori_total || ''}`, short: sh(r.diisi_pada), value: r.skor_total })), { min: 28, max: 112, unit: '', height });
}

// Analisis kuadran: Indeks Kekuatan Mental (Tangguh vs belum) × kesiapan dukungan Bagian 3
export function quadrantMap(aktif, counts = null) {
  const q = state.ref.quadrants;
  const cell = (key, tone) => `<div class="quad ${tone} ${aktif === key ? 'on' : ''}"><b>${esc(q[key].nama)}</b><small>${esc(q[key].makna)}</small>${counts ? `<span class="q-n">${counts[key] || 0} mhs</span>` : aktif === key ? '<span class="q-here">Posisimu</span>' : ''}</div>`;
  return `<div class="quadmap"><div class="qaxis-y">Kekuatan mental ↑</div><div class="qgrid">${cell('tangguh_mandiri', 'ok')}${cell('tangguh_bertumbuh', 'info')}${cell('rentan_tersembunyi', 'muted')}${cell('siap_dibantu', 'warn')}</div>
    <div class="qaxis-x"><span>Belum merasa butuh dukungan</span><span>Siap menerima dukungan (≥ 2 butir SS/S)</span></div></div>`;
}

export const loading = () => '<div class="loading" aria-busy="true"><span></span><span></span><span></span></div>';
export const empty = (title, body = '', cta = '') => `<div class="empty"><h4>${esc(title)}</h4>${body ? `<p>${body}</p>` : ''}${cta}</div>`;

// Tag kata kunci konten ditampilkan dengan bahasa sehari-hari (kamus dari server; nilai asli tetap dipakai untuk pencocokan)
export const kwLabel = (k) => state.ref?.kw_labels?.[k] || String(k).replace(/-/g, ' ');
