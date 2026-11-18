// Boot aplikasi: halaman publik (Home, masuk, daftar), kerangka tata letak per peran, router, notifikasi realtime.
import { state, api, tryRefresh, esc, actions, openModal, closeModal, toast, ago, showError, loading } from './core.js';
import { studentViews, studentNav } from './student.js';
import { staffViews, staffNav } from './staff.js';
import { publicViews } from './public.js';

const ROLE_LABEL = { mahasiswa: 'Mahasiswa', konselor: 'Konselor', admin: 'Admin', koordinator: 'Koordinator BK' };
export const HOME = { mahasiswa: '#/s/home', konselor: '#/c/dashboard', admin: '#/a/asesmen', koordinator: '#/k/dashboard' };
const views = { ...studentViews, ...staffViews };
const app = document.getElementById('app');

function navFor(role) { return role === 'mahasiswa' ? studentNav : staffNav(role); }
const logo = () => esc(state.pub?.brand?.logo_url || '/logo.png');
// "Universitas Nusantara PGRI Kediri" → "UN PGRI Kediri" agar muat di sidebar
const shortUni = (n) => (n.length > 26 ? n.replace(/^Universitas\b/, 'Univ.').replace(/^Institut\b/, 'Inst.').replace(/^Sekolah Tinggi\b/, 'ST') : n);

function shell() {
  const u = state.user; const nav = navFor(u.role);
  app.innerHTML = `
  <div class="layout ${u.role === 'mahasiswa' ? 'is-student' : 'is-staff'}">
    <aside class="side">
      <a class="brand" href="${HOME[u.role]}"><span class="brand-logo"><img src="${logo()}" alt="PAN-JALU"></span><span class="brand-text"><b>PAN-JALU</b><small>${ROLE_LABEL[u.role]}${u.universitas ? ` · ${esc(shortUni(u.universitas.nama))}` : ''}</small></span></a>
      <nav class="nav" aria-label="Menu utama">${nav.map((n) => `<a href="${n.href}" data-route="${[n.href, ...(n.alt || [])].join(' ')}"><span class="nav-ico" aria-hidden="true">${n.ico}</span>${esc(n.label)}</a>`).join('')}</nav>
      <div class="side-foot">
        <a href="#/" class="side-link">Lihat web Home</a>
        <a href="${u.role === 'mahasiswa' ? '#/s/profil' : '#/c/profil'}" class="me"><span class="avatar">${esc(u.nama.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span><span><b>${esc(u.nama)}</b>${u.peer ? '<span class="badge-peer sm">Peer Counselor</span>' : `<small>${esc(u.email || u.nim_nip)}</small>`}</span></a>
        <button class="btn ghost sm" data-act="logout">Keluar</button>
      </div>
    </aside>
    <div class="content">
      <header class="topbar">
        <div class="crumb" id="crumb"></div>
        <div class="top-actions">
          <button class="icon-btn" data-act="openNotifs" aria-label="Notifikasi"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.5L4.5 15v1h15v-1L18 12.5V9a6 6 0 0 0-6-6Zm-2 15a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg><span class="badge" id="notifBadge" hidden></span></button>
        </div>
      </header>
      <main id="main" tabindex="-1"></main>
    </div>
  </div>`;
}

async function refreshBadge() {
  try { const n = await api('/notifications'); state.unread = n.filter((x) => !x.dibaca).length; const b = document.getElementById('notifBadge'); if (b) { b.hidden = !state.unread; b.textContent = state.unread > 9 ? '9+' : state.unread; } } catch { /* abaikan */ }
}

actions.openNotifs = async () => {
  const list = await api('/notifications');
  openModal(`<div class="row between"><h3>Notifikasi</h3>${list.some((n) => !n.dibaca) ? '<button class="btn ghost sm" data-act="readAll">Tandai semua dibaca</button>' : ''}</div>
  <div class="notif-list">${list.length ? list.map((n) => `<a class="notif ${n.dibaca ? '' : 'unread'} ${n.prioritas}" href="${esc(n.tautan || '#')}" data-act="openNotif" data-id="${n.id}" data-href="${esc(n.tautan || '')}">
    <b>${esc(n.judul)}</b>${n.isi ? `<span>${esc(n.isi)}</span>` : ''}<small>${ago(n.dibuat_pada)}</small></a>`).join('') : '<p class="muted">Belum ada notifikasi.</p>'}</div>`);
};
actions.openNotif = async (el) => { await api(`/notifications/${el.dataset.id}/read`, { method: 'POST' }); closeModal(); if (el.dataset.href) location.hash = el.dataset.href; refreshBadge(); };
actions.readAll = async () => { await api('/notifications/read-all', { method: 'POST' }); closeModal(); refreshBadge(); };

actions.logout = async () => {
  await api('/auth/logout', { method: 'POST' }).catch(() => {});
  state.socket?.disconnect(); state.token = null; state.user = null; location.hash = '#/'; render();
};

export async function afterLogin(r) {
  if (r) { state.token = r.access_token; state.user = r.user; }
  state.ref = state.ref || await api('/reference');
  // Data kampus pengguna (prodi, fakultas); state.pub.prodi dipakai filter & formulir yang sudah ada
  state.campus = await api('/campus').catch(() => null);
  if (state.pub) state.pub.prodi = state.campus?.prodi || [];
  connectSocket(); refreshBadge();
  clearInterval(state.tokenTimer);
  state.tokenTimer = setInterval(() => tryRefresh().then(() => { if (state.socket) state.socket.auth = { token: state.token }; }).catch(() => {}), 12 * 60000);
}

function connectSocket() {
  if (!window.io) return;
  state.socket?.disconnect();
  const s = window.io({ auth: { token: state.token }, transports: ['websocket', 'polling'] });
  s.on('connect_error', async () => { try { await tryRefresh(); s.auth = { token: state.token }; } catch { /* abaikan */ } });
  s.on('notification', (n) => { toast(n.judul, n.prioritas === 'krisis' ? 'crit' : 'info'); refreshBadge(); if (/dashboard|pendaftar|darurat|k\/konselor|a\/koordinator/.test(location.hash)) render(); });
  s.on('crisis', () => { if (state.user.role === 'konselor') openModal(`<div class="crisis"><h3>Kasus risiko merah baru</h3><p>Seorang mahasiswa baru saja menunjukkan indikasi risiko keselamatan diri. Buka Dashboard untuk melihat detail dan menindaklanjuti sesuai SOP krisis.</p><div class="row end"><a class="btn crit" href="#/c/dashboard" data-act="closeModal">Buka Dashboard</a></div></div>`); });
  s.on('message', (m) => { state.onMessage?.(m); toast('Pesan baru masuk', 'info'); });
  s.on('presence', (p) => state.onPresence?.(p));
  state.socket = s;
}

// ---- Router ----
function match(table, hash) {
  const parts = hash.replace(/^#\/?/, '').split('/');
  for (const key of Object.keys(table)) {
    const kp = key.split('/');
    if (kp.length !== parts.length) continue;
    const params = {}; let ok = true;
    kp.forEach((p, i) => { if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(parts[i]); else if (p !== parts[i]) ok = false; });
    if (ok) return { key, params };
  }
  return null;
}

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const hash = location.hash || '#/';
  // Halaman publik: Home, masuk, daftar, verifikasi, lupa/reset sandi
  const pm = match(publicViews, hash);
  if (pm) {
    if (pm.key !== '' && state.user && publicViews[pm.key].guestOnly) { location.hash = HOME[state.user.role]; return; }
    document.body.classList.add('public');
    const v = publicViews[pm.key];
    document.title = v.title ? `${v.title} · PAN-JALU` : 'PAN-JALU — Psikoedukasi, Asesmen, dan Navigasi Menuju Jiwa Luhur';
    try { const html = await v.render(pm.params); if (seq !== renderSeq) return; app.innerHTML = html; v.after?.(pm.params); window.scrollTo({ top: 0 }); } catch (e) { showError(e); }
    return;
  }
  document.body.classList.remove('public');
  if (!state.user) { location.hash = '#/masuk'; return; }
  if (!document.getElementById('main')) shell();
  const m = match(views, hash);
  const allowed = m && (views[m.key].roles || []).includes(state.user.role);
  if (!allowed) { location.hash = HOME[state.user.role]; return; }
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route.split(' ').some((r) => location.hash.startsWith(r))));
  const main = document.getElementById('main');
  main.innerHTML = loading();
  state.onMessage = null; state.onPresence = null;
  try {
    const v = views[m.key];
    document.getElementById('crumb').textContent = v.title;
    document.title = `${v.title} · PAN-JALU`;
    const html = await v.render(m.params);
    if (seq !== renderSeq) return;
    main.innerHTML = html;
    v.after?.(m.params);
    main.focus({ preventScroll: true });
  } catch (e) {
    if (seq !== renderSeq) return;
    main.innerHTML = `<div class="card"><h3>Halaman tidak dapat dimuat</h3><p>${esc(e.message)}</p><button class="btn" data-act="reload">Coba lagi</button></div>`;
    if (e.status !== 401) console.error(e);
  }
}
actions.reload = () => render();
export const rerender = render;
window.addEventListener('hashchange', render);

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

(async function boot() {
  try { state.pub = await api('/public/config'); } catch (e) { showError(e); }
  try { await tryRefresh(); await afterLogin(); } catch { state.user = null; }
  render();
})();
