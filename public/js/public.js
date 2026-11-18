// Halaman publik PAN-JALU: web Home (isi dikelola admin), masuk, daftar, verifikasi email, lupa & reset kata sandi.
import { state, api, esc, actions, forms, changeHandlers, inputHandlers, toast, ApiError } from './core.js';
import { afterLogin, HOME } from './app.js';
import { counselorPick } from './student.js';

const PENDING = 'pj_pending_email';
const setPending = (e) => { try { sessionStorage.setItem(PENDING, e); } catch { /* */ } state.pendingEmail = e; };
const getPending = () => { try { return state.pendingEmail || sessionStorage.getItem(PENDING) || ''; } catch { return state.pendingEmail || ''; } };
let homeCache = null;
async function home() { homeCache = await api('/public/home'); return homeCache; }

function topnav(h, { minimal = false } = {}) {
  const user = state.user;
  return `<header class="pnav"><div class="pnav-in">
    <a href="#/" class="pbrand"><img src="${esc(h?.logo_url || state.pub?.brand?.logo_url || '/logo.png')}" alt="${esc(h?.nama_singkat || 'PAN-JALU')}"><span><b>${esc(h?.nama_singkat || 'PAN-JALU')}</b><small>${esc(h?.institusi || 'Universitas Nusantara PGRI Kediri')}</small></span></a>
    ${minimal ? '' : `<nav class="plinks" aria-label="Navigasi halaman"><a href="#tentang" data-act="scrollTo">Tentang</a><a href="#fitur" data-act="scrollTo">Fitur</a><a href="#alur" data-act="scrollTo">Alur</a><a href="#faq" data-act="scrollTo">FAQ</a><a href="#kontak" data-act="scrollTo">Kontak</a></nav>`}
    <div class="pnav-cta">${user ? `<a class="btn primary" href="${HOME[user.role]}">Buka aplikasi</a>` : '<a class="btn ghost" href="#/masuk">Masuk</a><a class="btn primary" href="#/daftar">Daftar</a>'}</div>
  </div></header>`;
}
actions.scrollTo = (el) => document.getElementById(el.getAttribute('href').slice(1))?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });

const footer = (h) => `<footer class="pfoot"><div class="pfoot-in"><div><img src="${esc(h.logo_url)}" alt="" class="pfoot-logo"><p><b>${esc(h.nama_singkat)}</b> — ${esc(h.kepanjangan)}</p></div><p class="small">${esc(h.footer)}</p></div></footer>`;

// ================= Home =================
// Media blok halaman utama. Kode tempelan & YouTube dimuat dari /embed/<id> di dalam iframe sandbox (asal terisolasi).
const SANDBOX = 'allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms';
function blockMedia(b) {
  const m = b.media || {};
  if (m.tipe === 'gambar') return `<img class="blok-img" src="${esc(m.url)}" alt="${esc(m.alt || b.judul || '')}" loading="lazy">`;
  if (m.tipe === 'video') return `<video class="blok-video" src="${esc(m.url)}" controls playsinline preload="metadata"></video>`;
  if (m.tipe === 'youtube' || m.tipe === 'kode') return `<iframe class="blok-frame" src="/embed/${esc(b.id)}" sandbox="${SANDBOX}" loading="lazy" title="${esc(b.judul || 'Media')}" style="height:${Number(m.tinggi) || 420}px" ${m.tipe === 'youtube' ? 'allowfullscreen' : ''}></iframe>`;
  return '';
}
const blockHtml = (b) => {
  const media = blockMedia(b); const text = b.judul || b.teks || b.tombol_teks;
  const copy = text ? `<div class="blok-copy">${b.judul ? `<h2>${esc(b.judul)}</h2>` : ''}${b.teks ? `<p class="prose-p">${esc(b.teks)}</p>` : ''}${b.tombol_teks && b.tombol_url ? `<a class="btn primary" href="${esc(b.tombol_url)}" ${b.tombol_url.startsWith('https') ? 'target="_blank" rel="noopener"' : ''}>${esc(b.tombol_teks)}</a>` : ''}</div>` : '';
  const layout = media && copy && b.tata_letak !== 'penuh' ? `two ${b.tata_letak === 'kiri' ? 'media-left' : ''}` : 'stack-blok';
  return `<section class="psec blok" ${b.latar ? `style="background:${esc(b.latar)}"` : ''}><div class="sec-in ${layout}">${b.tata_letak === 'kiri' ? media + copy : copy + media}</div></section>`;
};

async function homeView() {
  const h = await home();
  const st = h.stats;
  const user = state.user;
  // Bagian bawaan (dapat disembunyikan admin) + blok tambahan admin yang disisipkan sesuai posisinya
  const parts = {
    hero: `    <section class="hero"><div class="hero-in">
      <div class="hero-copy"><span class="eyebrow">${esc(h.hero_eyebrow)}</span><h1>${esc(h.hero_judul)}</h1><p class="lead">${esc(h.hero_deskripsi)}</p>
        <div class="row wrap">${user ? `<a class="btn primary lg" href="${HOME[user.role]}">Buka aplikasi</a>` : '<a class="btn primary lg" href="#/daftar/mahasiswa">Daftar sebagai mahasiswa</a><a class="btn ghost lg" href="#/masuk">Masuk</a>'}</div>
        <p class="small muted">Pendaftaran gratis dengan email aktif yang terverifikasi.</p></div>
      ${h.hero_media?.tipe && h.hero_media.tipe !== 'tidak' ? `<div class="hero-art media">${blockMedia({ id: 'hero', judul: h.hero_judul, media: h.hero_media })}</div>` : `<div class="hero-art"><div class="halo"></div><img src="${esc(h.logo_url)}" alt="Logo ${esc(h.nama_singkat)}"><p class="acronym">${esc(h.kepanjangan)}</p></div>`}
    </div></section>

    <section class="pillars"><div class="sec-in">${h.pilar.map((p, i) => `<div class="pillar p${i}"><span class="pl-letter">${esc(p.huruf)}</span><b>${esc(p.judul)}</b><p>${esc(p.deskripsi)}</p></div>`).join('')}</div></section>

`,
    statistik: `    ${st ? `<section class="stats"><div class="sec-in">${[['Mahasiswa terdaftar', st.mahasiswa], ['Konselor aktif', st.konselor], ['Konten psikoedukasi', st.konten], ['Sesi konseling selesai', st.sesi]].map(([l, v]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div></section>` : ''}

`,
    tentang: `    <section class="psec" id="tentang"><div class="sec-in two">
      <div><span class="eyebrow">Profil</span><h2>${esc(h.tentang_judul)}</h2><p class="prose-p">${esc(h.tentang)}</p></div>
      <div class="vm"><h3>Visi</h3><p>${esc(h.visi)}</p><h3>Misi</h3><ol>${h.misi.map((m) => `<li>${esc(m)}</li>`).join('')}</ol></div>
    </div></section>

`,
    fitur: `    <section class="psec alt" id="fitur"><div class="sec-in"><span class="eyebrow">Overview aplikasi</span><h2>Semua yang kamu butuhkan dalam satu tempat</h2>
      <div class="feat-grid">${h.fitur.map((f, i) => `<div class="feat"><span class="feat-num mono">${String(i + 1).padStart(2, '0')}</span><b>${esc(f.judul)}</b><p>${esc(f.deskripsi)}</p></div>`).join('')}</div></div></section>

`,
    alur: `    <section class="psec" id="alur"><div class="sec-in"><span class="eyebrow">Alur layanan</span><h2>Mulai dalam empat langkah</h2>
      <ol class="steps">${h.alur.map((a) => `<li><b>${esc(a.judul)}</b><p>${esc(a.deskripsi)}</p></li>`).join('')}</ol></div></section>

`,
    konselor: `    <section class="psec band"><div class="sec-in two">
      <div><span class="eyebrow">Konselor</span><h2>${esc(h.konselor_judul)}</h2><p>${esc(h.konselor_deskripsi)}</p></div>
      <div class="band-cta"><a class="btn light lg" href="#/daftar/konselor">Daftar sebagai konselor</a><a class="btn outline-light" href="#/masuk">Sudah punya akun? Masuk</a></div>
    </div></section>

`,
    faq: `    <section class="psec" id="faq"><div class="sec-in narrow"><span class="eyebrow">FAQ</span><h2>Pertanyaan yang sering diajukan</h2>
      ${h.faq.map((f) => `<details class="faq"><summary>${esc(f.tanya)}</summary><p>${esc(f.jawab)}</p></details>`).join('')}</div></section>

`,
    kontak: `    <section class="psec alt" id="kontak"><div class="sec-in">
      <span class="eyebrow">Kontak</span><h2>Unit Layanan Konseling</h2><dl class="kv"><dt>Alamat</dt><dd>${esc(h.kontak_alamat)}</dd><dt>Email</dt><dd>${esc(h.kontak_email)}</dd><dt>Telepon</dt><dd class="mono">${esc(h.kontak_telepon)}</dd><dt>Jam layanan</dt><dd>${esc(h.kontak_jam)}</dd></dl>
    </div></section>
`,
    darurat: `    <section class="psec" id="darurat"><div class="sec-in narrow">
      <div class="sos-box"><b>Butuh pendampingan segera?</b><p>Jangan memendamnya sendiri. Daftar konseling melalui PAN-JALU agar konselor kampus dapat segera mendampingimu.</p><div class="row wrap center">${user ? `<a class="btn primary" href="${HOME[user.role]}">Buka aplikasi</a>` : '<a class="btn primary" href="#/daftar/mahasiswa">Daftar & ajukan konseling</a><a class="btn ghost" href="#/masuk">Masuk</a>'}</div>${h.kontak_telepon ? `<p class="small">Unit Layanan Konseling: <span class="mono">${esc(h.kontak_telepon)}</span>${h.kontak_jam ? ` · ${esc(h.kontak_jam)}` : ''}</p>` : ''}</div>
    </div></section>
`,
  };
  const hidden = new Set(h.sembunyikan || []);
  const at = (pos) => (h.blok || []).filter((b) => b.posisi === pos).map(blockHtml).join('');
  const body = at('awal') + Object.entries(parts).map(([k, html]) => (hidden.has(k) ? '' : html) + at(`setelah_${k}`)).join('');
  return `${topnav(h)}
  <main class="pmain">
${body}  </main>${footer(h)}`;
}

// ================= Masuk =================
const authShell = (h, title, sub, body) => `${topnav(h, { minimal: true })}<main class="auth"><div class="auth-card"><img src="${esc(h.logo_url)}" alt="" class="auth-logo"><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}${body}</div></main>`;

async function loginView() {
  const h = homeCache || await home();
  const demo = state.pub?.demo;
  return authShell(h, 'Masuk ke PAN-JALU', 'Gunakan email atau NIM/NIP yang sudah terdaftar.', `
    <div id="loginNote"></div>
    <form data-form="login" class="stack" autocomplete="on">
      <label>Email atau NIM/NIP<input id="lg_id" name="identifier" required autocomplete="username"></label>
      <label>Kata sandi<input id="lg_pw" name="password" type="password" required autocomplete="current-password"></label>
      <div class="row between"><a href="#/lupa-sandi" class="small">Lupa kata sandi?</a></div>
      <button class="btn primary block" type="submit">Masuk</button>
    </form>
    <p class="center small">Belum punya akun? <a href="#/daftar">Daftar sekarang</a></p>
    ${demo ? `<details class="demo"><summary class="small">Akun demo (kata sandi <b class="mono">mindcampus123</b>)</summary><div class="demo-grid">${[['2313020001', 'Budi Santoso', 'Mahasiswa'], ['K001', 'Guruh, M.Pd.', 'Konselor'], ['K002', 'Dr. Ratna W.', 'Konselor'], ['KBK01', 'Dra. Sri Lestari', 'Koordinator BK'], ['admin', 'Admin PAN-JALU', 'Admin']]
      .map(([id, n, r]) => `<button class="demo-acc" data-act="fillDemo" data-id="${id}"><b>${n}</b><small>${r} · ${id}</small></button>`).join('')}</div></details>` : ''}`);
}
actions.fillDemo = (el) => { document.getElementById('lg_id').value = el.dataset.id; document.getElementById('lg_pw').value = 'mindcampus123'; document.getElementById('lg_pw').focus(); };
forms.login = async (d) => {
  try {
    const r = await api('/auth/login', { method: 'POST', body: d });
    await afterLogin(r); location.hash = HOME[r.user.role];
  } catch (e) {
    if (e.code === 'EMAIL_UNVERIFIED') { setPending(e.email || d.identifier); toast(e.message, 'warn'); location.hash = '#/verifikasi'; return; }
    if (['PENDING_APPROVAL', 'REJECTED', 'INACTIVE'].includes(e.code)) { document.getElementById('loginNote').innerHTML = `<div class="notice ${e.code === 'PENDING_APPROVAL' ? 'info' : 'warn'}">${esc(e.message)}</div>`; return; }
    throw e;
  }
};

// ================= Daftar =================
async function registerView({ role } = {}) {
  const h = homeCache || await home();
  if (!role) return authShell(h, 'Daftar akun PAN-JALU', 'Pilih jenis akun yang sesuai.', `
    <div class="role-pick"><a class="role-card" href="#/daftar/mahasiswa"><b>Mahasiswa</b><span>Akun langsung aktif setelah email terverifikasi.</span></a>
    <a class="role-card" href="#/daftar/konselor"><b>Konselor / Psikolog</b><span>Setelah email terverifikasi, admin atau koordinator layanan BK meninjau pendaftaran Anda.</span></a>
    <a class="role-card" href="#/daftar/koordinator"><b>Koordinator Layanan BK</b><span>Untuk koordinator layanan BK universitas. Setelah email terverifikasi, admin meninjau pendaftaran Anda.</span></a></div>
    <p class="center small">Sudah punya akun? <a href="#/masuk">Masuk</a></p>`);
  const mhs = role === 'mahasiswa'; const koor = role === 'koordinator';
  const domains = state.pub?.domain_email?.[mhs ? 'mahasiswa' : 'konselor'] || [];
  const y = new Date().getFullYear();
  const [judul, sub] = { mahasiswa: ['Daftar sebagai mahasiswa', 'Akun aktif otomatis setelah email terverifikasi.'], konselor: ['Daftar sebagai konselor', 'Akun aktif setelah email terverifikasi dan disetujui admin atau koordinator layanan BK.'], koordinator: ['Daftar sebagai koordinator layanan BK', 'Akun aktif setelah email terverifikasi dan disetujui admin.'] }[role];
  return authShell(h, judul, sub, `
    <div class="seg-tabs wide">${[['mahasiswa', 'Mahasiswa'], ['konselor', 'Konselor'], ['koordinator', 'Koordinator BK']].map(([k, l]) => `<a href="#/daftar/${k}" class="${role === k ? 'on' : ''}">${l}</a>`).join('')}</div>
    <form data-form="register" data-role="${role}" class="form-grid" autocomplete="on">
      <label class="full">Nama lengkap${mhs ? '' : ' & gelar'}<input id="rg_nama" name="nama" required autocomplete="name"></label>
      <label>${mhs ? 'NIM' : 'NIP / NIDN / No. pegawai'}<input id="rg_nim" name="nim_nip" required pattern="[A-Za-z0-9.\\-]{4,30}"></label>
      <label>Email aktif<input id="rg_email" name="email" type="email" required autocomplete="email" ${domains.length ? `placeholder="nama@${esc(domains[0])}"` : ''}></label>
      ${domains.length ? `<p class="full small muted">Gunakan email dengan domain: <b>${domains.map(esc).join(', ')}</b></p>` : ''}
      <div class="full uni-field"><label>Perguruan tinggi<input id="rg_uni_q" type="search" data-input="uniSearch" placeholder="Ketik nama kampus, singkatan, atau kota…" autocomplete="off" aria-describedby="uniHint"></label>
        <input type="hidden" name="university_id" id="rg_uni"><div id="uniResults" class="uni-results" role="listbox"></div><div id="uniPicked"></div>
        <small class="muted" id="uniHint">Data perguruan tinggi dari referensi Kemendikdasmen.</small></div>
      ${mhs ? `<div class="full" id="rg_campus"></div>
        <label>Angkatan<select id="rg_angk" name="angkatan" required>${Array.from({ length: 8 }, (_, i) => y - i).map((v) => `<option>${v}</option>`).join('')}</select></label>
        <label>Kelas<input id="rg_kelas" name="kelas" maxlength="3" placeholder="A"></label>
        <label>Jenis kelamin<select id="rg_gender" name="gender"><option value="">Tidak ingin menyebutkan</option><option value="L">Laki-laki</option><option value="P">Perempuan</option></select></label>`
      : koor ? `<label>Jabatan<input id="rg_jab" name="jabatan" placeholder="Koordinator Layanan BK Universitas" required></label>
        <label>Unit kerja<input id="rg_unit" name="unit" placeholder="UPT Bimbingan & Konseling"></label>`
      : `<label>Profesi / lisensi<input id="rg_prof" name="profesi" placeholder="Psikolog Klinis (SIPP) / Guru BK"></label>
        <label>Spesialisasi<input id="rg_spec" name="spesialisasi" placeholder="Kecemasan, akademik, keluarga…" required></label>
        <p class="full small muted">Setelah akun disetujui Koordinator Layanan BK kampus Anda, atur fakultas & prodi yang menjadi tanggung jawab Anda di menu <b>Konseling</b>.</p>
        <fieldset class="full pj-box"><legend>Konselor PAN-JALU (lintas kampus)</legend>
          <p class="small muted">Konselor PAN-JALU dapat dipilih langsung oleh mahasiswa dari kampus mana pun, terutama mahasiswa yang kampusnya belum memiliki konselor. Wajib disetujui admin PAN-JALU.</p>
          <label class="check"><input type="checkbox" name="independen" value="1" data-change="pjIndep"> Saya konselor/psikolog independen (tidak terikat kampus) dan mendaftar sebagai Konselor PAN-JALU</label>
          <label class="check"><input type="checkbox" name="ajukan_panjalu" value="1" data-change="pjToggle"> Ajukan juga akun kampus saya sebagai Konselor PAN-JALU</label>
          <label id="pj_alasan" hidden>Alasan & pengalaman pendampingan<textarea name="alasan_panjalu" rows="2" maxlength="1000" placeholder="Contoh: psikolog klinis berlisensi (SIPP …), 5 tahun mendampingi mahasiswa."></textarea></label></fieldset>`}
      <label>Nomor telepon/WhatsApp<input id="rg_tel" name="telepon" inputmode="tel" autocomplete="tel"></label>
      <label>Kata sandi<input id="rg_pw" name="password" type="password" minlength="8" required autocomplete="new-password" data-input="pwHint"></label>
      <label>Ulangi kata sandi<input id="rg_pw2" name="password2" type="password" minlength="8" required autocomplete="new-password"></label>
      <p class="full small muted" id="pwHint">Minimal 8 karakter, memuat huruf dan angka.</p>
      <label class="check full"><input type="checkbox" name="persetujuan" value="1" required> Saya menyetujui kebijakan privasi PAN-JALU (versi ${esc(state.pub?.versi_kebijakan || '')}): data saya diproses untuk layanan kesehatan mental kampus, dilindungi sesuai UU No. 27 Tahun 2022, dan dapat diakses hanya oleh pihak berwenang.</label>
      <button class="btn primary block full" type="submit">Daftar & kirim kode verifikasi</button>
    </form>
    <p class="center small">Sudah punya akun? <a href="#/masuk">Masuk</a></p>`);
}
inputHandlers.pwHint = (el) => { const ok = el.value.length >= 8 && /[a-zA-Z]/.test(el.value) && /\d/.test(el.value); const n = document.getElementById('pwHint'); n.textContent = ok ? 'Kata sandi sudah memenuhi syarat.' : 'Minimal 8 karakter, memuat huruf dan angka.'; n.classList.toggle('ok-text', ok); };
// ---- Pilih perguruan tinggi → prodi kampus → konselor (dengan konteks kerjanya) ----
let uniTimer = null; let UNI = null;
inputHandlers.uniSearch = (el) => {
  clearTimeout(uniTimer);
  const q = el.value.trim(); const box = document.getElementById('uniResults');
  if (q.length < 3) { box.innerHTML = ''; return; }
  uniTimer = setTimeout(async () => {
    const list = await api(`/public/universities?q=${encodeURIComponent(q)}`);
    if (el.value.trim() !== q) return;
    const mhs = document.querySelector('form[data-form=register]')?.dataset.role === 'mahasiswa';
    box.innerHTML = (list.length ? list.map((u) => `<button type="button" class="uni-opt" data-act="uniPick" data-id="${u.id}" role="option"><b>${esc(u.nama)}</b><small>${esc(u.kota || '')}${u.provinsi ? `, ${esc(u.provinsi.replace(/^Prov\. /, ''))}` : ''} · ${esc(u.status === 'USULAN' ? 'diusulkan mahasiswa' : u.status || '')}${u.terdaftar ? ' · <span class="ok-text">sudah memakai PAN-JALU</span>' : ''}</small></button>`).join('') : '<p class="small muted">Tidak ditemukan. Coba kata lain (mis. nama kota).</p>')
      + (mhs ? '<button type="button" class="uni-opt other" data-act="uniOther"><b>Kampus saya tidak ada di daftar</b><small>Tulis nama kampusmu — kamu tetap bisa memakai PAN-JALU dan memilih Konselor PAN-JALU</small></button>' : '');
  }, 250);
};
actions.uniPick = async (el) => {
  UNI = await api(`/public/universities/${el.dataset.id}`);
  document.getElementById('rg_uni').value = UNI.id;
  document.getElementById('uniResults').innerHTML = '';
  document.getElementById('rg_uni_q').value = UNI.nama;
  const role = document.querySelector('form[data-form=register]').dataset.role;
  document.getElementById('uniPicked').innerHTML = `<div class="uni-chosen"><b>${esc(UNI.nama)}</b> <small class="muted">${esc(UNI.kota || '')} · NPSN ${esc(UNI.id)}</small></div>
    ${role !== 'mahasiswa' && !UNI.koordinator_aktif ? `<div class="notice warn small">Kampus ini belum memiliki Koordinator Layanan BK di PAN-JALU. ${role === 'konselor' ? 'Pendaftaran Anda akan ditinjau setelah koordinator kampus aktif.' : 'Anda bisa menjadi koordinator pertama.'}</div>` : ''}`;
  if (role === 'mahasiswa') renderCampus();
};
actions.uniOther = () => {
  const q = document.getElementById('rg_uni_q').value.trim();
  UNI = { id: '', baru: true, nama: q, prodi: [], fakultas: [], konselor: [] };
  document.getElementById('rg_uni').value = '';
  document.getElementById('uniResults').innerHTML = '';
  document.getElementById('uniPicked').innerHTML = `<div class="form-grid inner"><label class="full">Nama perguruan tinggi<input name="kb_nama" required minlength="5" maxlength="160" value="${esc(q)}" placeholder="Universitas …"></label><label class="full">Kota/kabupaten<input name="kb_kota" maxlength="80"></label></div>
    <div class="notice info small">Kampusmu akan dicatat sebagai kampus baru di PAN-JALU. Karena belum ada konselor kampus, kamu dapat memilih <b>Konselor PAN-JALU</b> setelah masuk.</div>`;
  renderCampus();
};
changeHandlers.pjToggle = (el) => { document.getElementById('pj_alasan').hidden = !el.checked && !document.querySelector('input[name=independen]').checked; };
changeHandlers.pjIndep = (el) => {
  const f = el.form; const uni = f.querySelector('.uni-field');
  uni.hidden = el.checked; f.querySelector('#rg_uni_q').required = false;
  const aj = f.querySelector('input[name=ajukan_panjalu]'); aj.disabled = el.checked; if (el.checked) aj.checked = true;
  document.getElementById('pj_alasan').hidden = !el.checked && !aj.checked;
};
function renderCampus(prodiId = '') {
  const box = document.getElementById('rg_campus'); if (!box || !UNI) return;
  const fak = UNI.fakultas.map((f) => ({ ...f, prodi: UNI.prodi.filter((p) => p.fakultas_kode === f.kode) }));
  box.innerHTML = `<div class="form-grid inner"><label class="full">Program studi<select id="rg_prodi" name="prodi_id" data-change="prodiPick"><option value="">${UNI.prodi.length ? 'Pilih program studi' : 'Daftar prodi kampus ini belum tersedia'}</option>
      ${fak.map((f) => `<optgroup label="${esc(f.nama)}">${f.prodi.map((p) => `<option value="${p.id}" ${p.id === prodiId ? 'selected' : ''}>${esc(p.nama)} (${esc(p.jenjang)})</option>`).join('')}</optgroup>`).join('')}
      <option value="__baru" ${prodiId === '__baru' ? 'selected' : ''}>Prodi saya belum ada di daftar…</option></select></label>
    ${prodiId === '__baru' || !UNI.prodi.length ? `<label>Nama program studi<input name="pb_nama" required minlength="3" placeholder="Pendidikan Matematika"></label><label>Fakultas<input name="pb_fak" placeholder="Fakultas Keguruan dan Ilmu Pendidikan"></label>
      <label>Jenjang<select name="pb_jenjang">${['S1', 'D3', 'D4', 'S2', 'S3', 'Profesi'].map((j) => `<option>${j}</option>`).join('')}</select></label><p class="small muted full">Koordinator Layanan BK kampusmu akan merapikan nama prodi ini.</p>` : ''}</div>
    <fieldset class="full"><legend>Konselor pendamping (opsional — boleh dipilih nanti)</legend>
      ${UNI.konselor.length ? `<p class="small muted">Kamu boleh <b>tidak memilih sekarang</b>; saat pertama masuk kamu akan diajak memilih konselor kampus atau Konselor PAN-JALU. Konselor yang kamu pilih dapat melihat hasil asesmenmu untuk mendampingimu. Konselor dengan konteks kerja sesuai prodimu ditandai <span class="ok-text">Sesuai prodimu</span>.</p><div class="pick-list">${UNI.konselor.map((c) => counselorPick(c, false)).join('')}</div>` : '<p class="small muted">Kampus ini belum memiliki konselor aktif di PAN-JALU. Setelah masuk, kamu dapat memilih <b>Konselor PAN-JALU</b> — konselor PAN-JALU yang melayani mahasiswa dari kampus mana pun.</p>'}</fieldset>`;
}
changeHandlers.prodiPick = async (el) => {
  if (el.value && el.value !== '__baru') { const d = await api(`/public/universities/${UNI.id}?prodi=${el.value}`); UNI.konselor = d.konselor; }
  const checked = [...document.querySelectorAll('#rg_campus input[name^=k_]:checked')].map((x) => x.name);
  renderCampus(el.value);
  checked.forEach((n) => { const x = document.querySelector(`#rg_campus input[name="${n}"]`); if (x) x.checked = true; });
};
forms.register = async (d, f) => {
  if (d.password !== d.password2) return toast('Ulangan kata sandi tidak sama.', 'warn');
  const indep = f.dataset.role === 'konselor' && !!d.independen;
  if (!d.university_id && !indep && !(UNI?.baru && d.kb_nama)) return toast('Pilih perguruan tinggi dari daftar pencarian, atau pilih "Kampus saya tidak ada di daftar".', 'warn');
  if ((indep || d.ajukan_panjalu) && (d.alasan_panjalu || '').trim().length < 10) return toast('Tuliskan alasan & pengalaman Anda sebagai Konselor PAN-JALU (minimal 10 karakter).', 'warn');
  const body = { ...d, role: f.dataset.role, persetujuan: !!d.persetujuan, independen: indep, ajukan_panjalu: !!d.ajukan_panjalu || indep,
    ...(UNI?.baru && !d.university_id ? { kampus_baru: { nama: d.kb_nama, kota: d.kb_kota } } : {}), angkatan: Number(d.angkatan), konselor_ids: Object.keys(d).filter((k) => k.startsWith('k_')).map((k) => k.slice(2)) };
  if (body.prodi_id === '__baru' || (f.dataset.role === 'mahasiswa' && !body.prodi_id && d.pb_nama)) { body.prodi_id = ''; body.prodi_baru = { nama: d.pb_nama, fakultas: d.pb_fak, jenjang: d.pb_jenjang }; }
  for (const k of Object.keys(body)) if (/^(k_|pb_|kb_)/.test(k)) delete body[k];
  delete body.password2;
  const r = await api('/auth/register', { method: 'POST', body });
  setPending(r.email); state.mailMode = r.mail_mode;
  location.hash = '#/verifikasi';
};

// ================= Verifikasi email =================
let cooldownUntil = 0;
async function verifyView() {
  const h = homeCache || await home();
  const email = getPending();
  return authShell(h, 'Verifikasi email', email ? `Kami mengirim kode 6 digit ke <b>${esc(email)}</b>. Periksa juga folder spam.` : 'Masukkan email pendaftaran dan kode 6 digit dari email kami.', `
    ${(state.mailMode || state.pub?.mail_mode) === 'outbox' ? '<div class="notice warn small">Mode pengembangan: server belum terhubung ke SMTP, jadi email belum benar-benar terkirim. Kode tercatat di konsol server dan folder <span class="mono">data/outbox</span>.</div>' : ''}
    <form data-form="verify" class="stack">
      <label>Email<input id="vf_email" name="email" type="email" value="${esc(email)}" required></label>
      <label>Kode verifikasi<input id="vf_code" name="kode" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required class="code-input" placeholder="••••••"></label>
      <button class="btn primary block" type="submit">Verifikasi</button>
    </form>
    <p class="center small">Tidak menerima email? <button class="link" data-act="resend" id="resendBtn">Kirim ulang kode</button></p>`);
}
forms.verify = async (d) => {
  const r = await api('/auth/verify', { method: 'POST', body: d });
  setPending(''); location.hash = r.role === 'mahasiswa' ? '#/terverifikasi' : `#/terverifikasi/${r.role}`;
};
actions.resend = async (el) => {
  const email = document.getElementById('vf_email').value.trim();
  if (!email) return toast('Isi email terlebih dahulu.', 'warn');
  if (Date.now() < cooldownUntil) return toast(`Tunggu ${Math.ceil((cooldownUntil - Date.now()) / 1000)} detik.`, 'warn');
  await api('/auth/resend', { method: 'POST', body: { email } });
  setPending(email); cooldownUntil = Date.now() + 60000; toast('Kode baru dikirim bila email terdaftar dan belum terverifikasi.');
  el.disabled = true; setTimeout(() => { if (el.isConnected) el.disabled = false; }, 60000);
};

async function verifiedView({ role } = {}) {
  const h = homeCache || await home();
  const wait = { konselor: 'konselor kini <b>menunggu persetujuan admin atau koordinator layanan BK</b>', koordinator: 'koordinator layanan BK kini <b>menunggu persetujuan admin</b>' }[role];
  return wait
    ? authShell(h, 'Email terverifikasi', '', `<div class="notice info">Terima kasih. Pendaftaran Anda sebagai ${wait}. Kami akan mengirim email begitu akun Anda disetujui.</div><a class="btn ghost block" href="#/">Kembali ke Home</a>`)
    : authShell(h, 'Email terverifikasi', '', '<div class="notice ok">Akun mahasiswamu sudah aktif. Silakan masuk dan mulai dengan asesmen pertamamu.</div><a class="btn primary block" href="#/masuk">Masuk sekarang</a>');
}
async function verifyFailView() {
  const h = homeCache || await home();
  return authShell(h, 'Tautan tidak berlaku', '', '<div class="notice warn">Tautan verifikasi sudah kedaluwarsa, sudah dipakai, atau tidak valid. Masukkan kode dari email terbaru, atau minta kode baru.</div><a class="btn primary block" href="#/verifikasi">Masukkan kode / kirim ulang</a>');
}

// ================= Lupa & reset kata sandi =================
async function forgotView() {
  const h = homeCache || await home();
  return authShell(h, 'Lupa kata sandi', 'Masukkan email akun Anda. Kami akan mengirim tautan untuk membuat kata sandi baru.', `
    <form data-form="forgot" class="stack"><label>Email<input id="fg_email" name="email" type="email" required autocomplete="email"></label><button class="btn primary block" type="submit">Kirim tautan</button></form><div id="fgNote"></div>
    <p class="center small"><a href="#/masuk">Kembali ke halaman masuk</a></p>`);
}
forms.forgot = async (d) => { await api('/auth/forgot', { method: 'POST', body: d }); document.getElementById('fgNote').innerHTML = '<div class="notice info">Jika email tersebut terdaftar dan sudah terverifikasi, tautan atur ulang kata sandi telah dikirim. Tautan berlaku 30 menit.</div>'; };
async function resetView({ token }) {
  const h = homeCache || await home();
  return authShell(h, 'Buat kata sandi baru', '', `<form data-form="reset" data-token="${esc(token)}" class="stack"><label>Kata sandi baru<input id="rs_pw" name="password" type="password" minlength="8" required autocomplete="new-password"></label><label>Ulangi kata sandi<input id="rs_pw2" name="password2" type="password" minlength="8" required autocomplete="new-password"></label><button class="btn primary block" type="submit">Simpan kata sandi</button></form>`);
}
forms.reset = async (d, f) => {
  if (d.password !== d.password2) return toast('Ulangan kata sandi tidak sama.', 'warn');
  await api('/auth/reset', { method: 'POST', body: { token: f.dataset.token, password: d.password } });
  toast('Kata sandi diperbarui. Silakan masuk.'); location.hash = '#/masuk';
};

void changeHandlers; void ApiError;
export const publicViews = {
  '': { render: homeView },
  masuk: { title: 'Masuk', render: loginView, guestOnly: true },
  daftar: { title: 'Daftar', render: registerView, guestOnly: true },
  'daftar/:role': { title: 'Daftar', render: (p) => registerView({ role: ['mahasiswa', 'konselor', 'koordinator'].includes(p.role) ? p.role : undefined }), guestOnly: true },
  verifikasi: { title: 'Verifikasi email', render: verifyView, guestOnly: true },
  terverifikasi: { title: 'Email terverifikasi', render: verifiedView },
  'terverifikasi/:role': { title: 'Email terverifikasi', render: verifiedView },
  'verifikasi-gagal': { title: 'Verifikasi gagal', render: verifyFailView },
  'lupa-sandi': { title: 'Lupa kata sandi', render: forgotView, guestOnly: true },
  'reset/:token': { title: 'Atur ulang kata sandi', render: resetView },
};
