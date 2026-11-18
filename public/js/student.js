// Aplikasi Mahasiswa (konseli).
import { state, api, download, esc, actions, forms, changeHandlers, inputHandlers, openModal, closeModal, toast, fmtDate, fmtDT, ago, lineChart, dimBars, indexTrend, interpretView, quadrantMap, toneCat, normDesc, scaleLabel, domainLabel, domainName, empty, confirmBox, radarChart } from './core.js';
import { I } from './icons.js';
import { rerender } from './app.js';

const R = ['mahasiswa'];
// Urutan menu: Psikoedukasi tepat di bawah Asesmen (alur Preventif → Developmental → Reflektif → Kolaboratif → Kuratif)
export const studentNav = [
  { href: '#/s/home', label: 'Beranda', ico: I.home },
  { href: '#/s/asesmen', label: 'Asesmen', ico: I.clip },
  { href: '#/s/psikoedukasi', label: 'Psikoedukasi', ico: I.play },
  { href: '#/s/workbook', label: 'Refleksi GURU', ico: I.book },
  { href: '#/s/jurnal', label: 'Jurnal & Goals', ico: I.pen },
  { href: '#/s/relaksasi', label: 'Ruang Mindfulness', ico: I.leaf },
  { href: '#/s/komunitas', label: 'Komunitas', ico: I.people },
  { href: '#/s/konseling', label: 'Konseling', ico: I.chat },
];
const dayIndex = () => Math.floor((Date.now() + 7 * 3600000) / 86400000);
const firstName = () => state.user.nama.split(' ')[0];
const greet = () => { const h = new Date(Date.now() + 7 * 3600000).getUTCHours(); return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'; };
const short = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
const REC_LABEL = { konten: 'Psikoedukasi', konseling: 'Konseling profesional', komunitas: 'Grup diskusi', peer: 'Konselor sebaya', workbook: 'Konten & Refleksi GURU', relaksasi: 'Ruang Mindfulness', lainnya: 'Saran lain' };
export const peerBadge = '<span class="badge-peer" title="Ditetapkan konselor sebagai peer counselor terlatih">Peer Counselor</span>';

function recCards(recs, limit = 99) {
  if (!recs?.length) return '<p class="muted">Belum ada rekomendasi.</p>';
  return `<div class="rec-list">${recs.slice(0, limit).map((r) => `<a class="rec-item ${r.sumber} ${r.jenis === 'konseling' && r.sumber === 'otomatis' ? 'urgent' : ''}" href="${esc(r.tautan || '#/s/asesmen')}"><span class="chip ${r.sumber === 'konselor' ? 'accent' : r.jenis === 'konseling' ? 'crit' : ''}">${r.sumber === 'konselor' ? 'Dari konselor' : REC_LABEL[r.jenis]}</span><b>${esc(r.judul)}</b>${r.alasan ? `<small>${esc(r.alasan)}</small>` : ''}</a>`).join('')}</div>`;
}
function scheduleNotice(sch) {
  if (!sch?.interval_hari) return '';
  if (sch.status === 'sudah') return `<div class="notice small">Anjuran konselor: isi asesmen setiap <b>${sch.interval_hari} hari</b>. Jadwal berikutnya: <b>${fmtDate(sch.jatuh_tempo)}</b>.</div>`;
  return `<div class="notice info"><b>${sch.status === 'belum' ? 'Kamu belum pernah mengisi asesmen.' : 'Saatnya mengisi asesmen lagi.'}</b> ${esc(sch.pesan || `Konselor menganjurkan pengisian setiap ${sch.interval_hari} hari.`)} <a href="#/s/asesmen">Isi sekarang</a></div>`;
}
const indexCard = (a, extra = '') => `<div class="kd-pair three"><div class="kd ${toneCat(a.kategori_total)}" title="${esc(state.ref.parts.total.penjelasan)}"><small>Indeks Kekuatan Mental</small><b>${a.skor_total}<i>/112</i></b><span>${esc(a.kategori_total)} · ${esc(normDesc('total', a.kategori_total))}</span></div>
  <div class="kd ${toneCat(a.kategori_fondasi)}" title="${esc(state.ref.parts.fondasi.penjelasan)}"><small>5 Kebutuhan Dasar</small><b>${a.skor_fondasi}<i>/80</i></b><span>${esc(a.kategori_fondasi)}</span></div><div class="kd ${toneCat(a.kategori_otot)}" title="${esc(state.ref.parts.otot.penjelasan)}"><small>Kendali diri & kebiasaan baik</small><b>${a.skor_otot}<i>/32</i></b><span>${esc(a.kategori_otot)}</span></div></div>${extra}`;

// ================= Beranda =================
async function home() {
  const [list, goals, appts, sch, peer, prog] = await Promise.all([api('/assessments/me'), api('/goals'), api('/appointments/me'), api('/assessments/schedule/me'), api('/peer-counselors/me'), api(`/progress/me${progressMonth ? `?bulan=${progressMonth}` : ''}`)]);
  progressMonth = prog.bulan;
  const quotes = state.ref.quotes; const q = quotes[dayIndex() % quotes.length] || ['', ''];
  const lastLite = list.at(-1);
  const last = lastLite ? await api(`/assessments/${lastLite.id}`) : null;
  const upcoming = appts.filter((a) => ['pending', 'confirmed'].includes(a.status) && new Date(a.jadwal) > Date.now() - 3600000).sort((a, b) => a.jadwal.localeCompare(b.jadwal))[0];
  const weekGoals = goals.goals.filter((g) => g.minggu_ke === goals.minggu_ini);
  return `
  <section class="hello"><div><span class="eyebrow">${greet()}</span><h1>${esc(firstName())}, bagaimana kabarmu hari ini? ${peer.aktif ? peerBadge : ''}</h1></div>
    <blockquote class="quote">“${esc(q[0])}”<cite>— ${esc(q[1])}</cite></blockquote></section>
  ${state.user.perlu_pilih_konselor ? `<section class="card pj-invite"><div><h3>Pilih konselor pendampingmu</h3><p class="small">Konselor pendamping dapat melihat hasil asesmen dan perkembanganmu agar bisa mendampingimu lebih cepat, termasuk saat kamu butuh bantuan segera. Kamu bisa menggantinya kapan saja.</p></div>
    <div class="row wrap"><button class="btn primary" data-act="pjOpen">Pilih konselor</button><button class="btn ghost sm" data-act="pjLater">Nanti saja</button></div></section>` : ''}
  ${scheduleNotice(sch)}
  ${list.length ? `<section class="card"><h3>Perkembangan Indeks Kekuatan Mental</h3>${list.length > 1 ? indexTrend(list, { height: 120 }) : '<p class="muted">Grafik muncul setelah kamu mengisi asesmen minimal dua kali.</p>'}</section>` : ''}
  ${progressBlock(prog, last)}
  <div class="grid-2">
    <section class="card"><h3>Konten Psikoedukasi yang Harus Diakses</h3>${last ? recCards(last.rekomendasi.filter((r) => r.jenis === 'konten'), 4) : '<p class="muted">Konten psikoedukasi untukmu muncul setelah kamu mengisi asesmen.</p>'}${last ? `<a class="small" href="#/s/asesmen/hasil/${last.id}">Lihat hasil asesmen</a>` : ''}</section>
    <div class="stack">
      <section class="card"><h3>Konseling</h3>
      ${upcoming ? `<div class="appt"><b>${esc(upcoming.counselor.nama)}</b><span>${fmtDT(upcoming.jadwal)} · ${upcoming.jenis === 'online' ? 'Daring' : 'Luring'}</span><span class="chip ${upcoming.status === 'confirmed' ? 'ok' : 'warn'}">${upcoming.status === 'confirmed' ? 'Terkonfirmasi' : 'Menunggu konfirmasi'}</span></div><a class="small" href="#/s/konseling/riwayat/${upcoming.id}">Lihat detail</a>`
        : '<p class="muted">Tidak ada jadwal mendatang. Konselor kampus siap mendengarkan kapan pun kamu butuh.</p><a class="btn ghost sm" href="#/s/konseling">Daftar konseling</a>'}
    </section>
      <section class="card"><div class="row between"><h3>Komitmen minggu ini</h3><a class="small" href="#/s/jurnal">Kelola</a></div>
      ${weekGoals.length ? `<ul class="checklist">${weekGoals.map((g) => `<li class="${g.selesai ? 'done' : ''}"><input type="checkbox" id="hg_${g.id}" data-change="goalToggle" data-id="${g.id}" ${g.selesai ? 'checked' : ''}><label for="hg_${g.id}">${esc(g.isi_teks)}</label></li>`).join('')}</ul>` : '<p class="muted">Belum ada komitmen. Tambahkan satu langkah kecil di menu Jurnal & Goals.</p>'}
    </section>
    </div>
  </div>
  <section class="tiles">${studentNav.slice(1).map((n) => `<a class="tile" href="${n.href}"><span class="tile-ico">${n.ico}</span><b>${esc(n.label)}</b></a>`).join('')}</section>`;
}
changeHandlers.goalToggle = async (el) => { await api(`/goals/${el.dataset.id}`, { method: 'PATCH', body: { selesai: el.checked } }); el.closest('li')?.classList.toggle('done', el.checked); };

// ================= Asesmen IKDKM-M (32 butir, Likert 4 titik) =================
const DRAFT = 'pj_ikdkm_m_draft';
const AITEMS = () => state.ref.items.filter((it) => it.aktif !== false); // butir yang sedang aktif (diatur admin)
const N_ITEMS = () => AITEMS().length;
const blankAns = () => ({ A: {}, persetujuan: { a: false, b: null, c: null } });
const A = { phase: 'intro', idx: 0, ans: blankAns() };
const saveDraft = () => { try { sessionStorage.setItem(DRAFT, JSON.stringify(A)); } catch { /* */ } };
const readDraft = () => { try { const d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); return d && d.phase !== 'intro' ? d : null; } catch { return null; } };
const clearDraft = () => { try { sessionStorage.removeItem(DRAFT); } catch { /* */ } A.phase = 'intro'; A.idx = 0; A.ans = blankAns(); };
const PART_NAME = { 1: 'Bagian 1 · Pemenuhan 5 kebutuhan dasar', 2: 'Bagian 2 · Kendali diri & kebiasaan baik', 3: 'Bagian 3 · Dukungan yang kamu butuhkan' };

async function assessIntro() {
  if (A.phase !== 'intro') return assessScreen();
  const draft = readDraft();
  const [list, sch] = await Promise.all([api('/assessments/me'), api('/assessments/schedule/me')]);
  const ins = state.ref.instructions;
  return `<section class="card prose-card">
    <span class="eyebrow">${esc(state.ref.instrument.nama)} (${esc(state.ref.instrument.kode)})</span>
    <h1>Kenali kekuatan mentalmu dan dukungan yang kamu butuhkan</h1>
    <p>Kekuatan mental bisa dilatih, seperti otot. Inventori ini membantumu melihat bagian mana yang sedang kuat dan bagian mana yang sedang melemah, agar aplikasi bisa menyarankan psikoedukasi, latihan refleksi, teman sebaya, atau konseling yang paling cocok.</p>
    <ul class="parts-list"><li><b>Pemenuhan 5 kebutuhan dasar</b> — ${esc(state.ref.parts.fondasi.penjelasan)}</li><li><b>Kendali diri & kebiasaan baik</b> — ${esc(state.ref.parts.otot.penjelasan)}</li><li><b>Dukungan yang kamu butuhkan</b> — jenis bantuan yang ingin kamu terima: bacaan, latihan menenangkan diri, teman sebaya, atau konselor.</li></ul>
    <div class="notice"><b>Petunjuk pengisian.</b> ${esc(ins.petunjuk)}</div>
    <div class="scale-legend">${state.ref.scale.map(([c, l]) => `<span><b>${c}</b> ${esc(l)}</span>`).join('')}</div>
    ${scheduleNotice(sch)}
    <div class="row wrap">${draft ? `<button class="btn primary" data-act="assessResume">Lanjutkan pengisian (${Object.keys(draft.ans.A).length}/${N_ITEMS()})</button><button class="btn ghost" data-act="assessStart">Mulai dari awal</button>` : '<button class="btn primary" data-act="assessStart">Mulai asesmen</button>'}<span class="muted small">${N_ITEMS()} butir · ±${esc(state.ref.instrument.durasi)}</span></div>
  </section>
  <section class="card"><h3>Riwayat asesmen</h3>${list.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Tanggal</th><th>Indeks</th><th>5 Kebutuhan Dasar</th><th>Kendali diri</th><th></th></tr></thead><tbody>${[...list].reverse().map((a) => `<tr><td>${fmtDT(a.diisi_pada)}</td><td><span class="chip ${toneCat(a.kategori_total)}">${a.skor_total} · ${esc(a.kategori_total)}</span></td><td class="num">${a.skor_fondasi}</td><td class="num">${a.skor_otot}</td><td class="row"><a href="#/s/asesmen/hasil/${a.id}">Lihat</a><button class="link" data-act="assessPdf" data-id="${a.id}">PDF</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Belum ada riwayat.</p>'}</section>`;
}
actions.assessResume = () => { const d = readDraft(); if (d) Object.assign(A, d); drawAssess(); };
actions.assessStart = () => { clearDraft(); A.phase = 'A'; A.idx = 0; saveDraft(); drawAssess(); };
actions.assessPdf = (el) => download(`/assessments/${el.dataset.id}/pdf`, 'laporan-ikdkm-m.pdf');

function assessScreen() {
  const items = AITEMS(); const n = items.length;
  if (A.phase === 'A') {
    const it = items[A.idx]; const v = A.ans.A[it.no];
    const answered = Object.keys(A.ans.A).length;
    return `<section class="card assess"><div class="progress"><div style="width:${(answered / (n + 1)) * 100}%"></div></div>
      <div class="row between"><span class="eyebrow">${PART_NAME[it.bagian]} · Butir ${A.idx + 1} dari ${n}</span><button class="link small" data-act="assessQuit">Simpan & keluar</button></div>
      <p class="small muted">Dalam 2 minggu terakhir…</p>
      <p class="item-big">${esc(it.teks)}</p>
      <div class="likert" role="radiogroup" aria-label="Pilihan jawaban">${state.ref.scale.map(([c, l]) => `<button type="button" class="lk ${v === c ? 'on' : ''}" role="radio" aria-checked="${v === c}" data-act="likert" data-no="${it.no}" data-v="${c}"><b>${c}</b><span>${esc(l)}</span></button>`).join('')}</div>
      <div class="row between"><button class="btn ghost" data-act="assessPrev">${A.idx === 0 ? 'Kembali' : 'Sebelumnya'}</button><button class="btn primary" data-act="assessNext" id="asNext" ${v ? '' : 'disabled'}>${A.idx === n - 1 ? 'Lanjut ke persetujuan' : 'Berikutnya'}</button></div></section>`;
  }
  const P = A.ans.persetujuan; const c = state.ref.consent;
  return `<section class="card assess"><div class="progress"><div style="width:${(n / (n + 1)) * 100}%"></div></div><span class="eyebrow">Persetujuan penggunaan data</span>
    <h3>Hampir selesai</h3><p class="small">Semua ${n} butir sudah terjawab. Sebelum mengirim, baca dan pilih persetujuan berikut.</p>
    <label class="check"><input type="checkbox" name="pa" data-change="consentSet" ${P.a ? 'checked' : ''}> ${esc(c.a)} <b>(wajib)</b></label>
    <div class="yn"><span>${esc(c.c)}</span><label><input type="radio" name="pc" value="1" data-change="consentSet" ${P.c === true ? 'checked' : ''}> Ya</label><label><input type="radio" name="pc" value="0" data-change="consentSet" ${P.c === false ? 'checked' : ''}> Tidak</label></div>
    <div class="yn"><span>${esc(c.b)}</span><label><input type="radio" name="pb" value="1" data-change="consentSet" ${P.b === true ? 'checked' : ''}> Ya</label><label><input type="radio" name="pb" value="0" data-change="consentSet" ${P.b === false ? 'checked' : ''}> Tidak</label></div>
    <details class="small"><summary>Data apa yang dikumpulkan dan bagaimana digunakan?</summary><p>Jawaban IKDKM-M disimpan terenkripsi. Skornya dihitung dengan aturan tetap (tanpa AI) untuk menyusun rekomendasi psikoedukasi dan layanan, dan dapat dilihat konselor yang berwenang. Bila kamu mengizinkan, konselor dapat meminta draf ringkasan berbantuan AI tanpa nama dan NIM; draf selalu ditinjau konselor. Kamu dapat meminta salinan atau penghapusan data sesuai UU No. 27 Tahun 2022.</p></details>
    <div class="row between"><button class="btn ghost" data-act="assessPrev">Sebelumnya</button><button class="btn primary" data-act="assessSubmit" id="asSubmit">Kirim jawaban</button></div></section>`;
}
function drawAssess() { document.getElementById('main').innerHTML = assessScreen(); window.scrollTo({ top: 0 }); }
actions.likert = (el) => {
  A.ans.A[el.dataset.no] = el.dataset.v; saveDraft();
  document.querySelectorAll('.likert .lk').forEach((b) => { const on = b === el; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
  document.getElementById('asNext').disabled = false;
  clearTimeout(A.t); A.t = setTimeout(() => { if (A.phase === 'A' && document.getElementById('asNext')) actions.assessNext(); }, 280); // maju otomatis
};
changeHandlers.consentSet = (el) => {
  const P = A.ans.persetujuan;
  if (el.name === 'pa') P.a = el.checked; else P[el.name[1]] = el.value === '1';
  saveDraft();
};
actions.assessQuit = () => { saveDraft(); A.phase = 'intro'; toast('Jawaban disimpan sementara di perangkat ini. Lanjutkan kapan saja.'); rerender(); };
actions.assessPrev = () => {
  clearTimeout(A.t);
  if (A.phase === 'A') { if (A.idx === 0) { A.phase = 'intro'; clearDraft(); rerender(); return; } A.idx--; } else { A.phase = 'A'; A.idx = N_ITEMS() - 1; }
  saveDraft(); drawAssess();
};
actions.assessNext = () => {
  clearTimeout(A.t);
  const it = AITEMS()[A.idx]; if (!A.ans.A[it.no]) return;
  if (A.idx < N_ITEMS() - 1) A.idx++; else A.phase = 'C';
  saveDraft(); drawAssess();
};
actions.assessSubmit = async (el) => {
  const P = A.ans.persetujuan;
  const miss = AITEMS().filter((it) => !A.ans.A[it.no]).map((it) => it.no);
  if (miss.length) return toast(`Butir ${miss.join(', ')} belum dijawab.`, 'warn');
  if (!P.a) return toast('Centang persetujuan bahwa kamu telah membaca penjelasan penggunaan data.', 'warn');
  if (P.b === null || P.c === null) return toast('Pilih Ya atau Tidak pada kedua pertanyaan persetujuan.', 'warn');
  el.disabled = true;
  const res = await api('/assessments', { method: 'POST', body: { answers: A.ans } }).finally(() => { el.disabled = false; });
  A.lastConnect = P.c; clearDraft();
  location.hash = `#/s/asesmen/hasil/${res.id}`;
  if (res.penanda.butuh_bantuan_segera) setTimeout(() => crisisPanel(true), 300);
};
// Panel perhatian khusus setelah asesmen (butuh bantuan segera): arahkan ke konseling
async function crisisPanel(locked) {
  openModal(`<div class="crisis"><span class="eyebrow">Perhatian khusus</span><h3>Kamu tidak harus menghadapinya sendirian</h3>
    <p>Jawabanmu menunjukkan bahwa kamu sedang sangat terbebani. Ini selalu kami tanggapi serius.</p>
    ${locked ? `<p><b>${A.lastConnect === false ? 'Kamu memilih tidak dihubungi otomatis, tetapi konselor jaga tetap menerima pemberitahuan agar dapat membantumu bila diperlukan.' : 'Konselor jaga kampus sudah menerima pemberitahuan dan akan menghubungimu.'}</b></p>` : ''}
    <p>Segera daftar konseling agar konselor kampus dapat mendampingimu secara langsung.</p>
    <div class="row wrap end"><button class="btn primary" data-act="crisisGo">Daftar konseling</button><button class="btn ghost" data-act="crisisAck">Saya sudah membaca</button></div></div>`, { locked });
}
actions.crisisAck = () => closeModal();
actions.crisisGo = () => { closeModal(); location.hash = '#/s/konseling'; };

async function assessResult({ id }) {
  const a = await api(`/assessments/${id}`);
  const hist = a.riwayat || [];
  const kontens = a.rekomendasi.filter((r) => r.jenis === 'konten');
  return `<div class="row between wrap"><a href="#/s/asesmen" class="small">← Kembali ke asesmen</a><div class="row"><span class="muted small">Diisi ${fmtDT(a.diisi_pada)}</span><button class="btn sm" data-act="assessPdf" data-id="${a.id}">Unduh laporan PDF</button></div></div>
  ${a.penanda.butuh_bantuan_segera ? '<div class="notice crit"><b>Butuh bantuan segera.</b> Konselor jaga telah diberi tahu dan akan menghubungimu. <a class="btn crit sm" href="#/s/konseling">Daftar konseling</a></div>' : a.perlu_kuratif ? '<div class="notice warn"><b>Kami menyarankan kamu berbicara dengan konselor.</b> <a class="btn sm" href="#/s/konseling">Daftar konseling</a></div>' : ''}
  <section class="card result-hero"><div><span class="eyebrow">Laporan hasil IKDKM-M</span><h1>Profil kekuatan mentalmu</h1><p class="muted">Dukungan yang paling sesuai: <b>${esc(a.tahap_layanan)}</b></p></div>${indexCard(a)}</section>
  ${hist.length > 1 ? `<section class="card"><h3>Perkembangan Indeks Kekuatan Mental</h3>${indexTrend(hist)}</section>` : ''}
  <section class="card">${interpretView(a.penjelasan)}</section>
  <div class="grid-2">
    <section class="card"><h3>Skor per bagian</h3>${dimBars(a.dimensi, { mudah: true })}<p class="small muted">Lima bagian pertama bernilai 4–16 (kuat 13–16, rentan 8–12, lemah 4–7). Kendali diri & kebiasaan baik bernilai 8–32 (kuat 25–32, rentan 16–24, lemah 8–15). Garis tipis = batas "perlu dikuatkan".</p>
      <details class="explain"><summary>Apa arti setiap bagian?</summary><dl class="kv stacked">${state.ref.dimensions.map((d) => `<dt>${esc(d.mudah)} <small class="muted">· ${esc(d.label)}</small></dt><dd>${esc(d.penjelasan)}</dd>`).join('')}</dl></details></section>
    <section class="card"><h3>Kendali diri & kebiasaan baik</h3><p class="small muted">${esc(state.ref.parts.otot.penjelasan)}</p>${a.subkomponen.map((x) => `<div class="mini-row"><span>${esc(state.ref.subcomponents.find((s) => s.kode === x.kode)?.mudah || x.nama)}</span><b class="mono">${x.skor}/${x.max}</b></div>`).join('')}
      <h3>Dukungan yang kamu butuhkan</h3>${a.dukungan.map((x) => `<div class="mini-row"><span>${esc(x.mudah || state.ref.support.find((s) => s.kode === x.kode)?.mudah || x.layanan)}</span><span class="chip ${x.siap ? 'accent' : ''}">${esc(scaleLabel(x.jawaban))}</span></div>`).join('')}</section>
  </div>
  <section class="card"><h3>Peta kekuatan mental & kesiapan dibantu</h3>${quadrantMap(a.kuadran)}</section>
  <section class="card"><h3>Konten Psikoedukasi yang Harus Diakses</h3><p class="small muted">Maksimal 3 konten, dipilih dari kata kunci butir yang menunjukkan pelemahan. Setelah mempelajari, tulis Refleksi GURU di halaman konten.</p>${recCards(kontens)}</section>`;
}

// ================= Refleksi GURU (terintegrasi di setiap konten psikoedukasi) =================
async function workbook() {
  const list = await api('/guru-reflections');
  const st = state.ref.guru_stages;
  return `<div class="row between wrap"><div><span class="eyebrow">Latihan refleksi · kebiasaan positif</span><h1>Refleksi GURU</h1><p class="muted">Refleksi GURU ditulis di setiap konten psikoedukasi yang kamu pelajari, untuk memantapkan dan menginternalisasi isi konten menjadi tindakan nyata.</p></div><a class="btn primary" href="#/s/psikoedukasi">Pilih konten untuk direfleksikan</a></div>
  <div class="guru-steps">${st.map((x) => `<div><b>${esc(x.nama[0])}</b><span><b>${esc(x.nama)}</b><small>${esc(x.makna)}</small></span></div>`).join('')}</div>
  <section class="card"><h3>Refleksiku (${list.length})</h3>${list.length ? list.map((e) => `<details class="entry"><summary>${e.konten ? `<img class="thumb-sm" src="${esc(e.konten.thumbnail_url || `/thumbs/${e.konten.kategori}.svg`)}" alt="">` : ''}<span><b>${esc(e.konten?.judul || 'Konten tidak tersedia')}</b><br><small class="muted">${esc(domainLabel(e.dimensi))} · diperbarui ${ago(e.updated_at)}</small></span> <span class="chip ${e.lengkap ? 'ok' : 'warn'}">${e.lengkap ? 'Lengkap' : 'Belum lengkap'}</span></summary>
    <dl class="kv stacked">${st.map((x) => `<dt>${esc(x.nama)} — ${esc(x.makna)}</dt><dd class="pre">${esc(e.jawaban?.[x.kode] || '—')}</dd>`).join('')}</dl>${e.konten ? `<a class="btn ghost sm" href="#/s/psikoedukasi/konten/${e.konten.id}">Buka konten & lanjutkan refleksi</a>` : ''}</details>`).join('') : empty('Belum ada refleksi', 'Buka salah satu konten psikoedukasi, pelajari isinya, lalu isi Refleksi GURU di bagian bawah halaman konten.', '<a class="btn" href="#/s/psikoedukasi">Ke Psikoedukasi</a>')}</section>`;
}

// ================= Jurnal & Goals =================
async function journal() {
  const [entries, goals] = await Promise.all([api('/journal-entries'), api('/goals')]);
  const prompts = state.ref.journal_prompts; const prompt = prompts[dayIndex() % prompts.length] || '';
  const week = goals.goals.filter((g) => g.minggu_ke === goals.minggu_ini);
  const older = goals.goals.filter((g) => g.minggu_ke !== goals.minggu_ini && !g.selesai);
  return `<h1>Jurnal & Goals</h1>
  <div class="grid-2 wide-left">
    <section class="card"><h3>Jurnal hari ini</h3>
      <form data-form="journal" class="stack">
        <fieldset class="moods"><legend>Bagaimana perasaanmu?</legend>${[['senang', 'Senang'], ['biasa', 'Biasa'], ['sedih', 'Sedih']].map(([v, l]) => `<label class="mood ${v}"><input type="radio" name="mood" value="${v}" required><span class="mood-dot"></span>${l}</label>`).join('')}</fieldset>
        <div class="prompt"><small>Pertanyaan renungan hari ini</small><p>${esc(prompt)}</p><input type="hidden" name="prompt" value="${esc(prompt)}"></div>
        <label>Tulisanmu<textarea id="jr_text" name="isi_teks" rows="6" required placeholder="Tulis apa saja yang kamu rasakan atau pikirkan…"></textarea></label>
        <label>Label (pisahkan dengan koma)<input id="jr_tags" name="tags" placeholder="kuliah, keluarga"></label>
        <button class="btn primary" type="submit">Simpan jurnal</button>
        <p class="small muted">Isi jurnal dienkripsi. Konselor hanya melihat ringkasan (mood dan cuplikan singkat) untuk memberi konteks pendampingan.</p>
      </form>
    </section>
    <section class="card"><h3>Komitmen minggu ini <span class="muted small mono">${esc(goals.minggu_ini)}</span></h3>
      <ul class="checklist">${week.map((g) => `<li class="${g.selesai ? 'done' : ''}"><input type="checkbox" id="g_${g.id}" data-change="goalToggle" data-id="${g.id}" ${g.selesai ? 'checked' : ''}><label for="g_${g.id}">${esc(g.isi_teks)}</label><button class="x" data-act="goalDel" data-id="${g.id}" aria-label="Hapus">×</button></li>`).join('') || '<li class="muted">Belum ada komitmen.</li>'}</ul>
      <form data-form="goalAdd" class="row"><input id="goal_new" name="isi_teks" placeholder="Contoh: jalan pagi 15 menit, 3 kali" required><button class="btn" type="submit">Tambah</button></form>
      ${older.length ? `<details><summary class="small">${older.length} komitmen minggu lalu belum selesai</summary><ul class="checklist">${older.map((g) => `<li><span>${esc(g.isi_teks)}</span><button class="btn ghost sm" data-act="goalCarry" data-id="${g.id}">Bawa ke minggu ini</button></li>`).join('')}</ul></details>` : ''}
    </section>
  </div>
  <section class="card"><h3>Entri jurnal (${entries.length})</h3>${entries.length ? entries.map((j) => `<details class="entry"><summary><span class="mood-dot ${j.mood}"></span> <b>${fmtDate(j.tanggal)}</b> <span class="muted">${esc(j.isi_teks.slice(0, 70))}${j.isi_teks.length > 70 ? '…' : ''}</span></summary>${j.prompt ? `<p class="small muted">${esc(j.prompt)}</p>` : ''}<p class="pre">${esc(j.isi_teks)}</p>${j.tags.length ? `<p>${j.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join(' ')}</p>` : ''}</details>`).join('') : empty('Belum ada entri', 'Menulis 5 menit sehari membantu mengenali pola perasaanmu.')}</section>`;
}
forms.journal = async (d, f) => { await api('/journal-entries', { method: 'POST', body: { ...d, tags: (d.tags || '').split(',').map((t) => t.trim()).filter(Boolean) } }); f.reset(); toast('Jurnal tersimpan.'); rerender(); };
forms.goalAdd = async (d) => { await api('/goals', { method: 'POST', body: d }); rerender(); };
actions.goalDel = async (el) => { await api(`/goals/${el.dataset.id}`, { method: 'DELETE' }); rerender(); };
actions.goalCarry = async (el) => { const g = await api('/goals'); await api(`/goals/${el.dataset.id}`, { method: 'PATCH', body: { minggu_ke: g.minggu_ini } }); rerender(); };


// ================= Ruang Relaksasi =================
const MOODS = [[5, 'Sangat baik'], [4, 'Baik'], [3, 'Biasa saja'], [2, 'Cemas'], [1, 'Sedih']];
const SOUNDS = [['hujan', 'Hujan'], ['petir', 'Petir'], ['ombak', 'Ombak'], ['airterjun', 'Air terjun'], ['hutan', 'Hutan'], ['burung', 'Kicau burung'], ['jangkrik', 'Jangkrik'], ['kodok', 'Kodok'], ['tokek', 'Tokek'], ['serigala', 'Lolongan serigala'], ['api', 'Api unggun'], ['piano', 'Piano'], ['white', 'White noise']];
let relaxPeriod = 'daily';
async function relax() {
  const [trend, tracks] = await Promise.all([api(`/mood-checkins?period=${relaxPeriod}`), api('/tracks')]);
  const B = state.ref.breathing;
  const slot = (n) => {
    const t = tracks.find((x) => x.slot === n);
    const playable = t && (t.tipe === 'berkas' || /\.(mp3|ogg|wav|m4a|aac)(\?|$)/i.test(t.url));
    return `<div class="card track"><div class="row between"><b>Lagu ${n}</b>${t ? `<span class="chip">${t.tipe === 'berkas' ? 'MP3' : 'Tautan'}</span>` : '<span class="chip">Kosong</span>'}</div>
      ${t ? `<p class="track-title">${esc(t.judul)}</p>${playable ? `<audio class="pj-track" controls preload="none" src="${esc(t.url)}" data-title="${esc(t.judul)}"></audio>` : `<a class="btn sm" href="${esc(t.url)}" target="_blank" rel="noopener">Putar di tautan</a><p class="small muted">Tautan layanan streaming dibuka di tab baru.</p>`}
        <div class="row"><button class="btn ghost sm" data-act="trackEdit" data-slot="${n}">Ganti</button><button class="btn ghost sm" data-act="trackDel" data-slot="${n}">Hapus</button></div>`
        : `<p class="small muted">Unggah MP3 atau tempel tautan lagu favoritmu.</p><button class="btn sm" data-act="trackEdit" data-slot="${n}">Tambah lagu</button>`}</div>`;
  };
  return `<h1>Ruang Mindfulness</h1><p class="muted">Kebiasaan positif (Glasser, 1976): latihan menenangkan tubuh dan pikiran yang dilakukan rutin setiap hari, tanpa mengkritik diri, akan memperkuat otot mentalmu.</p>
  <div class="grid-2 wide-left">
    <section class="card"><h3>Emotional check-in</h3>
      <form data-form="checkin" class="stack">
        <fieldset class="moods five"><legend>Apa yang kamu rasakan sekarang?</legend>${MOODS.map(([v, l]) => `<label class="mood m${v}"><input type="radio" name="mood" value="${v}" required><span class="mood-dot"></span>${l}</label>`).join('')}</fieldset>
        <label>Sedang melakukan apa?<select id="ci_ctx" name="konteks_aktivitas">${['Kuliah', 'Mengerjakan tugas', 'Istirahat', 'Bersama teman', 'Bersama keluarga', 'Bekerja', 'Sebelum tidur'].map((x) => `<option>${x}</option>`).join('')}</select></label>
        <label>Catatan (opsional)<textarea id="ci_note" name="catatan" rows="2"></textarea></label>
        <label>Kalimat motivasi untuk dirimu<input id="ci_mot" name="motivasi_diri" placeholder="Pelan-pelan saja, yang penting jalan."></label>
        <button class="btn primary" type="submit">Simpan check-in</button>
      </form></section>
    <section class="card"><div class="row between wrap"><h3>Tren emosi</h3><div class="seg-tabs">${[['daily', '7 hari'], ['weekly', '8 minggu'], ['custom', '30 hari']].map(([k, l]) => `<button class="${relaxPeriod === k ? 'on' : ''}" data-act="relaxPeriod" data-p="${k}">${l}</button>`).join('')}</div></div>
      ${lineChart(trend.series.map((s) => ({ label: s.label, short: relaxPeriod === 'weekly' ? s.label.slice(5) : short(s.label), value: s.value })), { min: 1, max: 5, unit: '' })}
      <p class="small muted">Skala 1 (sedih) – 5 (sangat baik), rata-rata per ${relaxPeriod === 'weekly' ? 'minggu' : 'hari'}.</p></section>
  </div>
  <h3 class="section-h">Latihan pernapasan terpandu</h3>
  <div class="rec-grid">${Object.entries(B).map(([k, b]) => `<button class="card rec breathe-card" data-act="breathe" data-k="${k}"><span class="eyebrow">${esc(b.tujuan)}</span><b>${esc(b.nama)}</b><span class="mono">${esc(b.rasio || b.fase.map((f) => f[1]).join(' – '))}${b.rasio && /\d/.test(b.rasio[0]) ? ' detik' : ''}</span><small class="muted">${esc(b.fokus || '')}</small><small class="breath-src">${esc(b.sumber || '')}</small></button>`).join('')}</div>
  <p class="small muted">Rasio ditulis Tarik – Tahan – Hembus – Tahan (detik). Sumber: Vierra et al. (2022); Russo et al. (2017); McCraty &amp; Zayas (2014); Zaccaro et al. (2018); Balban et al. (2023).</p>
  <div class="row between wrap"><h3 class="section-h">Soundscape alam</h3><button class="btn ghost sm" data-act="soundStopAll" id="stopAll" ${Sound.active.size ? '' : 'disabled'}>Hentikan semua</button></div>
  <p class="small muted">Nyalakan beberapa suara sekaligus untuk meraciknya, misalnya kicau burung + air terjun, lalu atur volume masing-masing.</p>
  <div class="sounds">${SOUNDS.map(([k, l]) => { const on = Sound.active.has(k); return `<div class="sound ${on ? 'on' : ''}" data-k="${k}"><button class="sound-btn" data-act="soundToggle" data-k="${k}" aria-pressed="${on}"><span class="wave"></span>${l}</button><input type="range" min="0" max="100" value="${Math.round((Sound.vol[k] ?? 0.6) * 100)}" data-input="soundVol" data-k="${k}" aria-label="Volume ${l}"></div>`; }).join('')}</div>
  <p class="small muted">Hujan, petir, ombak, air terjun, api unggun, kicau burung, jangkrik, kodok, tokek, dan serigala memakai rekaman alam asli (dimuat saat pertama diputar); hutan, piano, dan white noise disintesis langsung di perangkatmu. Durasi pemutaran dicatat ke log relaksasi saat dihentikan.</p>
  <p class="small muted audio-credit">Sumber audio rekaman alam: <a href="https://pixabay.com/" target="_blank" rel="noopener">Pixabay</a> (Pixabay Content License).</p>
  <h3 class="section-h">Musik fungsional <span class="muted small">(fokus, relaksasi, meditasi, tidur)</span></h3>
  ${musicStudio()}
  <h3 class="section-h">Musik pribadiku <span class="muted small">(maksimal 3 lagu, bisa diganti kapan saja)</span></h3>
  <div class="tracks">${[1, 2, 3].map(slot).join('')}</div>`;
}
actions.relaxPeriod = (el) => { relaxPeriod = el.dataset.p; rerender(); };
forms.checkin = async (d) => { await api('/mood-checkins', { method: 'POST', body: { ...d, mood: Number(d.mood) } }); toast('Check-in tersimpan. Terima kasih sudah menyapa dirimu sendiri.'); rerender(); };

// --- Musik pribadi ---
actions.trackEdit = (el) => openModal(`<h3>Lagu ${el.dataset.slot}</h3><div class="seg-tabs wide"><button class="on" data-act="trackMode" data-m="file">Unggah MP3</button><button data-act="trackMode" data-m="link">Tempel tautan</button></div>
  <form data-form="trackFile" data-slot="${el.dataset.slot}" class="stack" id="tfFile"><label>Berkas MP3 (maks. 15 MB)<input id="tr_file" type="file" accept="audio/mpeg,.mp3" required></label><button class="btn primary" type="submit">Unggah</button></form>
  <form data-form="trackLink" data-slot="${el.dataset.slot}" class="stack" id="tfLink" hidden><label>Judul<input id="tr_title" name="judul" placeholder="Lagu favoritku" required></label><label>Tautan (https://)<input id="tr_url" name="url" type="url" placeholder="https://…" required></label><p class="small muted">Tautan langsung ke berkas audio (.mp3/.ogg) dapat diputar di sini; tautan YouTube/Spotify dibuka di tab baru.</p><button class="btn primary" type="submit">Simpan tautan</button></form>`);
actions.trackMode = (el) => { document.querySelectorAll('[data-act=trackMode]').forEach((b) => b.classList.toggle('on', b === el)); document.getElementById('tfFile').hidden = el.dataset.m !== 'file'; document.getElementById('tfLink').hidden = el.dataset.m !== 'link'; };
forms.trackFile = async (_d, f) => {
  const file = document.getElementById('tr_file').files[0]; if (!file) return;
  if (file.size > 15 * 1024 * 1024) return toast('Ukuran MP3 maksimal 15 MB.', 'warn');
  await api(`/tracks/${f.dataset.slot}/file`, { method: 'PUT', body: file, headers: { 'Content-Type': 'audio/mpeg', 'X-Filename': encodeURIComponent(file.name) } });
  closeModal(); toast('Lagu tersimpan.'); rerender();
};
forms.trackLink = async (d, f) => { await api(`/tracks/${f.dataset.slot}/link`, { method: 'PUT', body: d }); closeModal(); toast('Tautan lagu tersimpan.'); rerender(); };
actions.trackDel = async (el) => { if (!(await confirmBox('Hapus lagu dari slot ini?', { ok: 'Hapus' }))) return; await api(`/tracks/${el.dataset.slot}`, { method: 'DELETE' }); rerender(); };
const trackPlay = new WeakMap();
document.addEventListener('play', (e) => { if (e.target.classList?.contains('pj-track')) trackPlay.set(e.target, Date.now()); }, true);
document.addEventListener('pause', (e) => {
  const t = e.target; if (!t.classList?.contains('pj-track') || !trackPlay.get(t)) return;
  const dur = Math.round((Date.now() - trackPlay.get(t)) / 1000); trackPlay.delete(t);
  if (dur >= 10) api('/mindfulness-logs', { method: 'POST', body: { jenis_aktivitas: `Musik: ${t.dataset.title}`, durasi_detik: dur } }).catch(() => {});
}, true);
// --- Pernapasan ---
let breath = null;
actions.breathe = (el) => {
  const b = state.ref.breathing[el.dataset.k];
  const N = b.siklus || 4; const total = b.fase.reduce((s, f) => s + f[1], 0) * N;
  openModal(`<div class="breath"><span class="eyebrow">${esc(b.tujuan)}</span><h3>${esc(b.nama)}</h3><p class="small muted center">${esc(b.fokus || '')}</p>
    <div class="breath-stage solar-stage">${solarParts()}<div class="breath-circle sun" id="bc" style="transform:scale(${BREATH_IDLE})"></div><div class="breath-text"><span id="bn" class="mono pattern">${b.fase.map((f) => f[1]).join('-')}</span><small id="bu">detik</small></div></div>
    <p class="breath-phase" aria-live="polite"><b id="bt">Siap?</b></p>
    <p class="muted small" id="bcyc">${N} siklus · ${total >= 90 ? `${Math.round(total / 60 * 10) / 10} menit` : `${total} detik`}</p>
    <div class="row end"><button class="btn ghost" data-act="breathStop">Selesai</button><button class="btn primary" data-act="breathGo" data-k="${el.dataset.k}" id="bgo">Mulai</button></div></div>`);
};
// Tata surya latihan napas: matahari di tengah mengembang/mengempis mengikuti napas,
// delapan planet mengorbit dengan jarak dan kecepatan berbeda (makin jauh makin lambat)
const PLANETS = [['merkurius', 40, 5], ['venus', 48, 8], ['bumi', 56, 11], ['mars', 64, 15], ['jupiter', 72, 21], ['saturnus', 80, 28], ['uranus', 88, 36], ['neptunus', 96, 46]];
const solarParts = () => `<span class="stars" aria-hidden="true"></span>${PLANETS.map(([n, d, t], i) => `<span class="ring" style="--d:${d}%" aria-hidden="true"></span><span class="po" style="--d:${d}%;--t:${t}s;--start:-${(t * ((i * 0.37) % 1)).toFixed(2)}s" aria-hidden="true"><span class="planet ${n}">${n === 'bumi' ? '<span class="moon-orbit"><span class="moon"></span></span>' : ''}</span></span>`).join('')}`;
// Bola napas di tengah menjadi pusat orbit: bumi mengitari bola, bulan mengitari bumi
const orbitParts = () => '<span class="orbit-ring" aria-hidden="true"></span><span class="orbit earth-orbit" aria-hidden="true"><span class="earth"><span class="orbit moon-orbit"><span class="moon"></span></span></span></span>';
// Satu garis waktu presisi (requestAnimationFrame + jam performa): hitungan detik dan ukuran matahari dihitung dari jam
// yang sama, sehingga ritmenya teratur tanpa selisih. Matahari berubah ukuran sama besar setiap detik (linear):
// mengembang selama "Tarik napas", tetap selama "Tahan", mengempis selama "Hembuskan"; kilau singkat menandai tiap detik.
const BREATH_MIN = 0.55; const BREATH_IDLE = 0.88; const LEAD = 1.5; // ukuran sebelum mulai & lama "Bersiap…" (detik)
actions.breathGo = (el) => {
  const b = state.ref.breathing[el.dataset.k]; el.hidden = true;
  const circle = document.getElementById('bc');
  circle.style.setProperty('transition', 'box-shadow .6s ease', 'important');
  let cur = BREATH_MIN;
  // target ukuran: dari data (0–1, mis. Cyclic Sighing: tarik penuh lalu tarik singkat) atau otomatis menurut jenis fase
  const phases = b.fase.map(([label, sec, frac]) => { const to = frac != null ? BREATH_MIN + (1 - BREATH_MIN) * frac : label.startsWith('Tarik') ? 1 : label.startsWith('Hembus') ? BREATH_MIN : cur; const p = { label, sec, from: cur, to }; cur = to; return p; });
  const cycleLen = phases.reduce((x, p) => x + p.sec, 0); const CYCLES = b.siklus || 4;
  breath = { k: el.dataset.k, start: Date.now(), t0: performance.now() + LEAD * 1000, raf: 0, key: '' };
  const bt = document.getElementById('bt'); const bn = document.getElementById('bn'); const bu = document.getElementById('bu'); const bc = document.getElementById('bcyc');
  bn.classList.remove('pattern');
  const frame = (now) => {
    if (!breath || !document.getElementById('bc')) return;
    const t = (now - breath.t0) / 1000;
    if (t < 0) { // bersiap: matahari mengecil perlahan ke posisi awal tarik napas
      circle.style.transform = `scale(${(BREATH_MIN + (BREATH_IDLE - BREATH_MIN) * (-t / LEAD)).toFixed(4)})`;
      if (breath.key !== 'siap') { breath.key = 'siap'; bt.textContent = 'Bersiap…'; bn.textContent = ''; bu.textContent = ''; }
      breath.raf = requestAnimationFrame(frame); return;
    }
    if (t >= cycleLen * CYCLES) return finishBreath(true);
    const cycle = Math.floor(t / cycleLen); let tc = t - cycle * cycleLen; let i = 0;
    while (tc >= phases[i].sec) { tc -= phases[i].sec; i++; }
    const p = phases[i]; const count = Math.floor(tc) + 1;
    circle.style.transform = `scale(${(p.from + (p.to - p.from) * (tc / p.sec)).toFixed(4)})`;
    circle.style.filter = `brightness(${(1 + 0.12 * Math.max(0, 1 - (tc % 1) * 5)).toFixed(3)})`; // kilau di awal setiap detik
    const key = `${cycle}:${i}:${count}`;
    if (key !== breath.key) {
      breath.key = key; bn.textContent = count; bu.textContent = `dari ${p.sec}`; bt.textContent = p.label;
      bc.textContent = `Siklus ${cycle + 1} dari ${CYCLES}`;
      circle.classList.toggle('inhale', p.to > p.from); circle.classList.toggle('hold', p.to === p.from);
    }
    breath.raf = requestAnimationFrame(frame);
  };
  breath.raf = requestAnimationFrame(frame);
};
async function finishBreath(complete) {
  if (!breath) return; cancelAnimationFrame(breath.raf);
  const dur = Math.round((Date.now() - breath.start) / 1000); const b = state.ref.breathing[breath.k]; breath = null;
  if (dur >= 15) await api('/mindfulness-logs', { method: 'POST', body: { jenis_aktivitas: b.nama, durasi_detik: dur } }).catch(() => {});
  closeModal(); toast(complete ? 'Latihan selesai. Perhatikan bagaimana tubuhmu terasa sekarang.' : 'Latihan dihentikan.');
}
actions.breathStop = () => (breath ? finishBreath(false) : closeModal());


// --- Soundscape campuran (WebAudio): beberapa suara dapat diputar bersamaan ---
const Sound = { ctx: null, master: null, active: new Map(), vol: {}, sessionStart: 0, names: new Set(), buf: {} };
// Rekaman suara alam (public/sounds). "bersambung": diputar terus dengan sambungan halus; "sesekali": muncul dengan jeda acak (detik)
const SAMPLES = {
  hujan: { src: '/sounds/hujan.mp3', pola: 'bersambung' },
  ombak: { src: '/sounds/ombak.mp3', pola: 'bersambung' },
  airterjun: { src: '/sounds/airterjun.mp3', pola: 'bersambung' },
  api: { src: '/sounds/api.mp3', pola: 'bersambung' },
  petir: { src: '/sounds/petir.mp3', pola: 'sesekali', jeda: [15, 40] },
  burung: { src: '/sounds/burung.mp3', pola: 'bersambung' },
  jangkrik: { src: '/sounds/jangkrik.mp3', pola: 'bersambung' },
  kodok: { src: '/sounds/kodok.mp3', pola: 'bersambung' },
  tokek: { src: '/sounds/tokek.mp3', pola: 'sesekali', jeda: [8, 20] },
  serigala: { src: '/sounds/serigala.mp3', pola: 'sesekali', jeda: [12, 26] },
};
const loadSample = (ctx, k) => (Sound.buf[k] ||= fetch(SAMPLES[k].src).then((r) => { if (!r.ok) throw new Error('Suara gagal dimuat'); return r.arrayBuffer(); }).then((b) => ctx.decodeAudioData(b)).catch((e) => { delete Sound.buf[k]; throw e; }));
async function playSample(ctx, k, S) {
  const cfg = SAMPLES[k];
  let buf;
  try { buf = await loadSample(ctx, k); } catch { toast('Suara belum dapat dimuat. Periksa koneksi internetmu.', 'warn'); return; }
  if (Sound.active.get(k) !== S) return; // sudah dihentikan saat memuat
  const once = (when, { fade = 0.04, rate = 1, pan = 0 } = {}) => {
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = ctx.createGain(); const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const len = buf.duration / rate; const end = when + len;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + fade); g.gain.setValueAtTime(1, Math.max(when + fade, end - fade)); g.gain.linearRampToValueAtTime(0, end);
    src.connect(g); if (p) { p.pan.value = pan; g.connect(p); p.connect(S.out); S.nodes.push(p); } else g.connect(S.out);
    src.start(when); src.stop(end + 0.05); S.nodes.push(src, g);
    src.onended = () => { S.nodes = S.nodes.filter((n) => n !== src && n !== g && n !== p); };
    return end;
  };
  if (cfg.pola === 'bersambung') {
    const X = Math.min(3, buf.duration / 4); // panjang sambungan (crossfade) antarputaran
    let next = once(ctx.currentTime + 0.05, { fade: X }) - X;
    S.timers.push(setInterval(() => { if (ctx.currentTime > next - 4) next = once(next, { fade: X }) - X; }, 1000));
  } else {
    const [a, b] = cfg.jeda;
    const schedule = (delay) => { const t = setTimeout(() => { if (Sound.active.get(k) !== S) return; once(ctx.currentTime + 0.05, { rate: 0.94 + Math.random() * 0.12, pan: Math.random() * 1.2 - 0.6 }); schedule((a + Math.random() * (b - a)) * 1000); }, delay); S.timers.push(t); };
    schedule(300);
  }
}
function noiseBuffer(ctx, type) {
  const len = ctx.sampleRate * 3; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
    else if (type === 'pink') { b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048; d[i] = (b0 + b1 + b2 + w * 0.05) * 0.9; }
    else d[i] = w * 0.5;
  }
  return buf;
}
function startSound(k) {
  const ctx = (Sound.ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  ctx.resume();
  if (!Sound.master) { Sound.master = ctx.createGain(); Sound.master.gain.value = 0.8; Sound.master.connect(ctx.destination); }
  const out = ctx.createGain(); out.gain.value = 0; out.gain.linearRampToValueAtTime(Sound.vol[k] ?? 0.6, ctx.currentTime + 1.2); out.connect(Sound.master);
  const S = { out, nodes: [out], timers: [], start: Date.now() };
  const loop = (type, gain = 1, filter) => { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, type); s.loop = true; const g = ctx.createGain(); g.gain.value = gain; let node = s; if (filter) { const f = ctx.createBiquadFilter(); f.type = filter[0]; f.frequency.value = filter[1]; s.connect(f); node = f; S.nodes.push(f); } node.connect(g); g.connect(out); s.start(); S.nodes.push(s, g); return g; };
  const tone = (freq, dur, vol, wave = 'sine', glide) => { const o = ctx.createOscillator(); const g = ctx.createGain(); const t = ctx.currentTime; o.type = wave; o.frequency.setValueAtTime(freq, t); if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(out); o.start(t); o.stop(t + dur + 0.05); };
  const every = (ms, fn) => { fn(); S.timers.push(setInterval(fn, ms)); };
  if (k === 'white') loop('white', 0.5);
  if (k === 'hutan') { loop('pink', 0.22, ['bandpass', 1200]); every(1400, () => { if (Math.random() < 0.35) tone(600 + Math.random() * 300, 0.4, 0.05, 'triangle', 500); }); }
  // Rekaman alam asli: diputar bersambung (crossfade) atau sesekali dengan jeda acak agar tidak terasa berulang
  if (SAMPLES[k]) { playSample(ctx, k, S); if (k === 'serigala') loop('brown', 0.1, ['lowpass', 400]); /* angin malam */ if (k === 'petir') loop('brown', 0.08, ['lowpass', 220]); /* gemuruh jauh */ }
  if (k === 'piano') { const notes = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3]; every(1300, () => tone(notes[Math.floor(Math.random() * notes.length)], 2.6, 0.12, 'triangle')); }
  if (!Sound.active.size) { Sound.sessionStart = Date.now(); Sound.names = new Set(); }
  Sound.names.add(SOUNDS.find((s) => s[0] === k)[1]);
  Sound.active.set(k, S);
}
function stopSound(k) {
  const S = Sound.active.get(k); if (!S) return;
  S.timers.forEach((x) => { clearInterval(x); clearTimeout(x); });
  const t = Sound.ctx.currentTime; S.out.gain.cancelScheduledValues(t); S.out.gain.setValueAtTime(S.out.gain.value, t); S.out.gain.linearRampToValueAtTime(0, t + 0.4);
  setTimeout(() => S.nodes.forEach((n) => { try { n.stop?.(); n.disconnect(); } catch { /* */ } }), 450);
  Sound.active.delete(k);
  if (!Sound.active.size && Sound.sessionStart) {
    const dur = Math.round((Date.now() - Sound.sessionStart) / 1000);
    if (dur >= 10) api('/mindfulness-logs', { method: 'POST', body: { jenis_aktivitas: `Soundscape: ${[...Sound.names].join(' + ')}`, durasi_detik: dur } }).catch(() => {});
    Sound.sessionStart = 0;
  }
}
const syncSoundUI = () => {
  document.querySelectorAll('.sound').forEach((el) => { const on = Sound.active.has(el.dataset.k); el.classList.toggle('on', on); el.querySelector('.sound-btn').setAttribute('aria-pressed', on); });
  const b = document.getElementById('stopAll'); if (b) b.disabled = !Sound.active.size;
};
actions.soundToggle = (el) => { const k = el.dataset.k; if (Sound.active.has(k)) stopSound(k); else startSound(k); syncSoundUI(); };
actions.soundStopAll = () => { [...Sound.active.keys()].forEach(stopSound); syncSoundUI(); };
inputHandlers.soundVol = (el) => { const k = el.dataset.k; Sound.vol[k] = Number(el.value) / 100; const S = Sound.active.get(k); if (S) S.out.gain.setTargetAtTime(Sound.vol[k], Sound.ctx.currentTime, 0.1); };
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/s/relaksasi') && Sound.active.size) [...Sound.active.keys()].forEach(stopSound); });

// ================= Musik fungsional (terinspirasi Brain.fm) =================
// Musik generatif yang disusun langsung di perangkat: pad akor, nada melodi lembut, bas, dan modulasi amplitudo (AM)
// pada laju tertentu per tujuan (fokus ± 16 Hz, relaksasi ± 10 Hz, meditasi ± 6 Hz, tidur ± 3 Hz). Bukan terapi medis.
const MUSIC_MODES = {
  fokus: { nama: 'Fokus', ikon: '🎯', desk: 'Belajar, membaca, menulis, mengerjakan tugas', am: 16, root: 146.83, skala: [0, 2, 3, 5, 7, 9, 10], akor: [[0, 2, 4], [5, 0, 2], [3, 5, 0], [4, 6, 1]], akorDtk: 8, notDtk: 0.45, pola: 'arpeggio', cutoff: 2400, orb: 4 },
  relaks: { nama: 'Relaksasi', ikon: '🌿', desk: 'Rehat, menurunkan ketegangan setelah kuliah', am: 10, root: 174.61, skala: [0, 2, 4, 6, 7, 9, 11], akor: [[0, 2, 4], [1, 3, 5], [4, 6, 1], [3, 5, 0]], akorDtk: 12, notDtk: 1.8, pola: 'acak', cutoff: 1500, orb: 8 },
  meditasi: { nama: 'Meditasi', ikon: '🧘', desk: 'Latihan napas, body scan, hening sejenak', am: 6, root: 130.81, skala: [0, 2, 4, 7, 9], akor: [[0, 2, 3], [0, 1, 3]], akorDtk: 20, notDtk: 8, pola: 'mangkuk', cutoff: 1100, orb: 10 },
  tidur: { nama: 'Tidur', ikon: '🌙', desk: 'Menjelang tidur atau tidur siang singkat', am: 3, root: 110, skala: [0, 3, 5, 7, 10], akor: [[0, 2, 4], [3, 0, 2]], akorDtk: 16, notDtk: 3.6, pola: 'acak', cutoff: 700, orb: 12 },
};
const MUSIC_COLORS = { ambient: 'Ambient', piano: 'Piano lembut', lofi: 'Lo-fi hangat', alam: 'Ambient + angin alam' };
const MUSIC_NEURAL = { rendah: ['Rendah', 0.1], sedang: ['Sedang', 0.22], tinggi: ['Tinggi', 0.36] };
const Music = { mode: 'fokus', warna: 'ambient', efek: 'sedang', menit: 25, vol: 0.55, on: null };
try { Object.assign(Music, JSON.parse(localStorage.getItem('pj_music') || '{}'), { on: null }); } catch { /* setelan lokal tidak tersedia */ }
const saveMusicPrefs = () => { try { localStorage.setItem('pj_music', JSON.stringify({ mode: Music.mode, warna: Music.warna, efek: Music.efek, menit: Music.menit, vol: Music.vol })); } catch { /* */ } };
const hz = (root, semi) => root * 2 ** (semi / 12);

function startMusic() {
  const ctx = (Sound.ctx ||= new (window.AudioContext || window.webkitAudioContext)()); ctx.resume();
  const m = MUSIC_MODES[Music.mode]; const depth = MUSIC_NEURAL[Music.efek][1];
  const P = { nodes: [], timers: [], start: Date.now(), chord: 0, step: 0, voices: [] };
  P.vol = ctx.createGain(); P.vol.gain.value = 0; P.vol.gain.linearRampToValueAtTime(Music.vol, ctx.currentTime + 3); P.vol.connect(ctx.destination);
  // Modulasi amplitudo: gain berayun di antara (1 − 2·kedalaman) dan 1 pada laju m.am
  P.am = ctx.createGain(); P.am.gain.value = 1 - depth; P.am.connect(P.vol);
  const lfo = ctx.createOscillator(); lfo.frequency.value = m.am; const lg = ctx.createGain(); lg.gain.value = depth; lfo.connect(lg); lg.connect(P.am.gain); lfo.start();
  P.bus = ctx.createGain(); P.bus.gain.value = 0.9;
  const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = Music.warna === 'lofi' ? m.cutoff * 0.6 : m.cutoff; tone.Q.value = 0.5;
  P.bus.connect(tone); tone.connect(P.am);
  const flfo = ctx.createOscillator(); flfo.frequency.value = 0.05; const fg = ctx.createGain(); fg.gain.value = tone.frequency.value * 0.25; flfo.connect(fg); fg.connect(tone.frequency); flfo.start();
  P.nodes.push(P.vol, P.am, lfo, lg, P.bus, tone, flfo, fg);
  const noise = (type, gain, f) => { const src = ctx.createBufferSource(); src.buffer = noiseBuffer(ctx, type); src.loop = true; const flt = ctx.createBiquadFilter(); flt.type = f[0]; flt.frequency.value = f[1]; const g = ctx.createGain(); g.gain.value = gain; src.connect(flt); flt.connect(g); g.connect(P.vol); src.start(); P.nodes.push(src, flt, g); return g; };
  if (Music.warna === 'alam') { const w = noise('pink', 0.05, ['lowpass', 900]); const wl = ctx.createOscillator(); wl.frequency.value = 0.07; const wg = ctx.createGain(); wg.gain.value = 0.03; wl.connect(wg); wg.connect(w.gain); wl.start(); P.nodes.push(wl, wg); }
  if (Music.warna === 'lofi') noise('white', 0.006, ['highpass', 3500]); // desis piringan hitam
  if (Music.mode === 'tidur') noise('brown', 0.05, ['lowpass', 300]);
  const degree = (d) => m.skala[((d % m.skala.length) + m.skala.length) % m.skala.length] + 12 * Math.floor(d / m.skala.length);
  // Pad akor: tiap nada dua osilator sedikit detune, berganti akor dengan crossfade
  const pad = () => {
    const t = ctx.currentTime; const ch = m.akor[P.chord % m.akor.length]; P.chord++;
    for (const v of P.voices) { v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0, t + 3); v.o.forEach((o) => o.stop(t + 3.1)); }
    P.voices = ch.map((d) => {
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(Music.warna === 'piano' ? 0.035 : 0.06, t + 3); g.connect(P.bus);
      const o = [-7, 7].map((cents) => { const x = ctx.createOscillator(); x.type = Music.warna === 'piano' ? 'sine' : 'sawtooth'; x.frequency.value = hz(m.root, degree(d)); x.detune.value = cents; x.connect(g); x.start(t); return x; });
      return { g, o };
    });
    if (Music.mode !== 'meditasi') { // bas akar akor
      const b = ctx.createOscillator(); const bg = ctx.createGain(); b.type = 'sine'; b.frequency.value = hz(m.root, degree(ch[0]) - 12);
      bg.gain.setValueAtTime(0, t); bg.gain.linearRampToValueAtTime(0.09, t + 1.5); bg.gain.linearRampToValueAtTime(0, t + m.akorDtk); b.connect(bg); bg.connect(P.bus); b.start(t); b.stop(t + m.akorDtk + 0.1);
    }
  };
  // Nada melodi: lonceng/piano dengan peluruhan; pola berbeda per tujuan
  const note = (freq, len, vol) => {
    const t = ctx.currentTime + 0.02; const g = ctx.createGain(); const o = ctx.createOscillator(); const o2 = ctx.createOscillator();
    o.type = Music.warna === 'piano' ? 'triangle' : 'sine'; o.frequency.value = freq; o2.type = 'sine'; o2.frequency.value = freq * 2; const g2 = ctx.createGain(); g2.gain.value = 0.18;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(P.bus); [o, o2].forEach((x) => { x.start(t); x.stop(t + len + 0.05); });
  };
  const bowl = () => { // mangkuk tibet: parsial non-harmonik dengan peluruhan panjang
    const f = hz(m.root, degree(Math.floor(Math.random() * m.skala.length)) + 12);
    [[1, 0.12], [2.76, 0.05], [5.4, 0.025]].forEach(([r, v]) => { const t = ctx.currentTime + 0.02; const o = ctx.createOscillator(); const g = ctx.createGain(); o.frequency.value = f * r; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 9); o.connect(g); g.connect(P.bus); o.start(t); o.stop(t + 9.1); });
  };
  const melody = () => {
    if (m.pola === 'mangkuk') return bowl();
    const ch = m.akor[(P.chord - 1 + m.akor.length) % m.akor.length];
    if (m.pola === 'arpeggio') { const seq = [0, 1, 2, 1]; const d = ch[seq[P.step++ % seq.length]] + m.skala.length; note(hz(m.root, degree(d)), 1.1, 0.05); return; }
    if (Math.random() < 0.7) note(hz(m.root, degree(Math.floor(Math.random() * m.skala.length) + m.skala.length)), m.notDtk * 2.2, Music.mode === 'tidur' ? 0.035 : 0.05);
  };
  pad(); P.timers.push(setInterval(pad, m.akorDtk * 1000));
  setTimeout(melody, 1200); P.timers.push(setInterval(melody, m.notDtk * 1000));
  if (Music.menit) P.end = Date.now() + Music.menit * 60000;
  P.timers.push(setInterval(() => { syncMusicUI(); if (P.end && Date.now() >= P.end) stopMusic(true); }, 1000));
  P.label = `Musik fungsional: ${m.nama} (${MUSIC_COLORS[Music.warna]})`;
  Music.on = P; syncMusicUI();
}
function stopMusic(selesai = false) {
  const P = Music.on; if (!P) return;
  Music.on = null; P.timers.forEach(clearInterval);
  const t = Sound.ctx.currentTime; P.vol.gain.cancelScheduledValues(t); P.vol.gain.setValueAtTime(P.vol.gain.value, t); P.vol.gain.linearRampToValueAtTime(0, t + 2.5);
  setTimeout(() => { [...P.nodes, ...P.voices.flatMap((v) => [v.g, ...v.o])].forEach((n) => { try { n.stop?.(); n.disconnect(); } catch { /* */ } }); }, 2700);
  const dur = Math.round((Date.now() - P.start) / 1000);
  if (dur >= 10) api('/mindfulness-logs', { method: 'POST', body: { jenis_aktivitas: P.label, durasi_detik: dur } }).catch(() => {});
  if (selesai) toast(`Sesi ${MUSIC_MODES[Music.mode].nama.toLowerCase()} selesai. Rasakan sejenak bagaimana pikiranmu sekarang.`);
  syncMusicUI();
}
const mmss = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, '0')}`;
function syncMusicUI() {
  const root = document.getElementById('musicStudio'); if (!root) return;
  const P = Music.on; root.classList.toggle('playing', !!P);
  root.style.setProperty('--orb-period', `${MUSIC_MODES[Music.mode].orb}s`);
  const btn = document.getElementById('musicPlay'); if (btn) btn.textContent = P ? 'Hentikan' : 'Putar';
  const st = document.getElementById('musicStatus');
  if (st) st.textContent = P ? (P.end ? `Sisa ${mmss(Math.max(0, P.end - Date.now()))}` : `Berjalan ${mmss(Date.now() - P.start)}`) : 'Siap diputar';
}
const musicStudio = () => {
  const m = MUSIC_MODES[Music.mode];
  return `<section class="card music-studio" id="musicStudio" style="--orb-period:${m.orb}s"><div class="music-grid">
    <div class="orbit-stage music-orbit">${orbitParts()}<span class="orb pulse" aria-hidden="true"></span><div class="breath-text"><b>${m.ikon} ${esc(m.nama)}</b><span id="musicStatus" class="mono small">Siap diputar</span></div></div>
    <div class="stack">
      <div class="music-modes" role="radiogroup" aria-label="Tujuan">${Object.entries(MUSIC_MODES).map(([k, x]) => `<button type="button" class="music-mode ${Music.mode === k ? 'on' : ''}" data-act="musicMode" data-k="${k}" role="radio" aria-checked="${Music.mode === k}"><span>${x.ikon}</span><b>${esc(x.nama)}</b><small>${esc(x.desk)}</small></button>`).join('')}</div>
      <div class="form-grid music-set">
        <label>Warna nada<select data-change="musicSet" data-k="warna">${Object.entries(MUSIC_COLORS).map(([k, l]) => `<option value="${k}" ${Music.warna === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Efek neural (kedalaman modulasi)<select data-change="musicSet" data-k="efek">${Object.entries(MUSIC_NEURAL).map(([k, [l]]) => `<option value="${k}" ${Music.efek === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Durasi sesi<select data-change="musicSet" data-k="menit">${[[15, '15 menit'], [25, '25 menit (Pomodoro)'], [45, '45 menit'], [60, '60 menit'], [90, '90 menit'], [0, 'Tanpa batas']].map(([v, l]) => `<option value="${v}" ${Number(Music.menit) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label>Volume musik<input type="range" min="0" max="100" value="${Math.round(Music.vol * 100)}" data-input="musicVol" aria-label="Volume musik"></label>
      </div>
      <div class="row wrap"><button class="btn primary" id="musicPlay" data-act="musicToggle">${Music.on ? 'Hentikan' : 'Putar'}</button><small class="muted">Modulasi ritme ± ${m.am} Hz · paling nyaman dengan earphone/headphone · bisa dipadukan dengan soundscape alam di atas.</small></div>
    </div></div>
    <p class="small muted">Terinspirasi pendekatan musik fungsional seperti Brain.fm: musik instrumental yang tenang, tanpa lirik, dengan modulasi amplitudo pada ritme tertentu sesuai tujuan (fokus lebih cepat, tidur paling lambat) agar mudah didengarkan lama tanpa mengganggu. Musik disusun langsung di perangkatmu. Ini alat bantu suasana, bukan terapi medis.</p>
  </section>`;
};
actions.musicToggle = () => { if (Music.on) stopMusic(); else startMusic(); };
actions.musicMode = (el) => { const was = !!Music.on; if (was) stopMusic(); Music.mode = el.dataset.k; saveMusicPrefs(); document.getElementById('musicStudio').outerHTML = musicStudio(); if (was) startMusic(); syncMusicUI(); };
changeHandlers.musicSet = (el) => { const was = !!Music.on; Music[el.dataset.k] = el.dataset.k === 'menit' ? Number(el.value) : el.value; saveMusicPrefs(); if (was && el.dataset.k !== 'menit') { stopMusic(); startMusic(); } else if (Music.on && el.dataset.k === 'menit') Music.on.end = Music.menit ? Music.on.start + Music.menit * 60000 : null; syncMusicUI(); };
inputHandlers.musicVol = (el) => { Music.vol = Number(el.value) / 100; saveMusicPrefs(); if (Music.on) Music.on.vol.gain.setTargetAtTime(Music.vol, Sound.ctx.currentTime, 0.2); };
window.addEventListener('hashchange', () => { if (!location.hash.startsWith('#/s/relaksasi') && Music.on) stopMusic(); });

// ================= Catatan Perkembangan Kekuatan Mental (di Beranda) =================
// Pelacak kebiasaan harian, indikator kekuatan mental, refleksi bulanan + unduh raport lengkap (PDF / Word).
let progressMonth = '';
const pctTone = (p) => (p >= 70 ? 'ok' : p >= 30 ? 'warn' : 'none');
const arrow = (c) => (c === null ? '<span class="muted">—</span>' : c > 0 ? `<b class="ok-text">▲ ${c}</b>` : c < 0 ? `<b class="crit-text">▼ ${Math.abs(c)}</b>` : '<span class="muted">= 0</span>');
const pgSec = (tone, judul, body, extra = '') => `<section class="pg-sec ${tone}"><header><h3>${judul}</h3>${extra}</header><div class="pg-body">${body}</div></section>`;
function progressBlock(d, last) {
  const habitTable = `<div class="table-wrap pg-habit-wrap"><table class="pg-habits"><thead><tr><th class="hb-name">Kebiasaan</th>${Array.from({ length: d.jumlah_hari }, (_, i) => `<th class="${i + 1 > d.hari_berjalan ? 'future' : ''}">${i + 1}</th>`).join('')}<th class="hb-pct">% tuntas</th></tr></thead><tbody>
    ${d.kebiasaan.map((k) => `<tr><td class="hb-name"><span aria-hidden="true">${k.ikon}</span> ${esc(k.nama)}</td>${k.hari.map((v, i) => `<td class="${i + 1 > d.hari_berjalan ? 'future' : ''}">${v ? '<span class="dot" aria-label="ya">●</span>' : ''}</td>`).join('')}<td class="hb-pct"><span class="pct ${pctTone(k.persen)}">${k.persen}%</span></td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Tanda ● = kebiasaan tercatat di aplikasi pada hari itu. Persentase dihitung dari ${d.hari_berjalan} hari ${d.hari_berjalan < d.jumlah_hari ? 'yang sudah berjalan' : ''} di ${esc(d.label)}.</p>`;
  const indikator = d.indikator.length ? `<div class="pg-ind">${d.radar.length ? `<div>${radarChart(d.radar, { size: 340 })}${d.radar.every((x) => x.awal != null) ? '<p class="small muted center">Garis putus-putus = asesmen pertamamu</p>' : ''}</div>` : ''}
    <div class="pg-dash">${d.indikator.map((x, i) => `<article class="pg-icard c-${esc(x.warna || 'blue')} ${i < 2 ? 'main' : ''}"><div class="pg-icard-top"><span class="pg-ibadge" aria-hidden="true">${x.ikon || '•'}</span><span class="pg-iname"><b>${esc(x.nama)}</b><small>${esc(x.keterangan)}</small></span></div>
      <div class="pg-ival"><b>${x.skor}</b><small>/${x.max}</small><span class="pg-delta">${arrow(x.perubahan)}</span></div>
      <div class="iv-meter" role="img" aria-label="${x.skor} dari ${x.max}"><span style="width:${Math.round(((x.skor - x.min) / (x.max - x.min)) * 100)}%"></span></div>
      ${x.kategori ? `<span class="chip ${toneCat(x.kategori)}">${esc(x.kategori === 'Rentan' ? 'Mulai melemah' : x.kategori === 'Lemah' ? 'Sedang lemah' : x.kategori)}</span>` : ''}</article>`).join('')}</div></div>
    ${last ? `<div class="row wrap"><a class="btn sm" href="#/s/asesmen/hasil/${last.id}">Lihat laporan asesmen lengkap</a><span class="muted small">Asesmen terakhir: ${fmtDate(last.diisi_pada)}</span></div>` : ''}`
    : `<div class="cta-card pg-cta"><span class="eyebrow">Langkah pertama</span><h3>Kenali kekuatan mentalmu</h3><p>Inventori IKDKM-M berisi ${N_ITEMS()} pernyataan singkat tentang keadaanmu dalam 2 minggu terakhir. Pilih SS, S, TS, atau STS. Sekitar 5–7 menit.</p><a class="btn primary" href="#/s/asesmen">Mulai asesmen</a></div>`;
  return `<section class="pg-sheet pg-home" id="catatan-perkembangan">
  <div class="pg-title"><div><h2>Catatan Perkembangan Kekuatan Mental</h2><p class="muted">Pantau kebiasaan, kekuatan mental, dan refleksi bulananmu.</p></div>
    <div class="row wrap"><select data-change="progressMonth" aria-label="Pilih bulan">${d.bulan_tersedia.map((m) => `<option value="${m.kode}" ${m.kode === d.bulan ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}</select>
      <button class="btn ghost sm" data-act="progressReport" data-f="pdf">⬇ Raport PDF</button><button class="btn ghost sm" data-act="progressReport" data-f="docx">⬇ Raport Word</button></div></div>
  ${pgSec('blue', `Pelacak Kebiasaan Harian · ${esc(d.label)}`, habitTable)}
  ${pgSec('green', 'Indikator Kekuatan Mental', indikator, d.indikator.length ? '<small>skor terakhir & perubahan dibanding asesmen sebelumnya</small>' : '')}
  ${pgSec('purple', 'Refleksi Bulanan', `<dl class="pg-refl">${d.refleksi.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl><p class="small muted">Disusun otomatis dari rekam jejakmu (bukan AI). Tuliskan refleksimu sendiri di <a href="#/s/jurnal">Jurnal</a>. Raport PDF/Word juga memuat konten yang harus diakses, perbandingan dengan bulan lalu, goals, dan hasil bulanan.</p>`)}
  </section>`;
}
changeHandlers.progressMonth = async (el) => { progressMonth = el.value; const y = window.scrollY; await rerender(); window.scrollTo(0, y); };
actions.progressReport = async (el) => {
  el.disabled = true;
  try { await download(`/progress/me/report?format=${el.dataset.f}${progressMonth ? `&bulan=${progressMonth}` : ''}`, `catatan-perkembangan.${el.dataset.f}`); } catch (e) { toast(e.message || 'Raport gagal diunduh.', 'warn'); } finally { el.disabled = false; }
};

// ================= Psikoedukasi =================
const CF = { kategori: '', type: '', kw: '', q: '' };
async function content({ kategori } = {}) {
  if (kategori !== undefined) CF.kategori = kategori === 'semua' ? '' : kategori;
  const qs = new URLSearchParams({ ...(CF.kategori && { kategori: CF.kategori }), ...(CF.type && { type: CF.type }), ...(CF.kw && { kata_kunci: CF.kw }), ...(CF.q && { q: CF.q }) });
  const res = await api(`/content?${qs}`);
  const types = state.ref.content_types;
  return `<h1>Ruang Psikoedukasi</h1>
  <div class="chips">${[{ kode: '', label: 'Semua kategori' }, ...state.ref.content_categories].map((c) => `<button class="chip-btn ${CF.kategori === c.kode ? 'on' : ''}" data-act="cfKat" data-k="${c.kode}">${esc(c.label)}</button>`).join('')}</div>
  <form data-form="cfSearch" class="filters row wrap">
    <select id="cf_type" name="type" aria-label="Format"><option value="">Semua format</option>${Object.entries(types).map(([k, l]) => `<option value="${k}" ${CF.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <input id="cf_q" name="q" value="${esc(CF.q)}" placeholder="Cari judul, deskripsi, kata kunci…" type="search"><button class="btn ghost" type="submit">Terapkan</button></form>
  ${res.items.some((c) => c.disarankan) ? '<p class="small muted">Konten berlabel <span class="chip accent">Prioritas</span> adalah 3 konten paling urgen dari kata kunci butir asesmenmu yang menunjukkan pelemahan, atau saran konselor. Setiap konten dilengkapi Refleksi GURU.</p>' : ''}
  <div class="content-grid">${res.items.length ? res.items.map((c) => `<a class="card content-card" href="#/s/psikoedukasi/konten/${c.id}">
    <div class="thumb"><img src="${esc(c.thumbnail_url || `/thumbs/${c.kategori}.svg`)}" alt="" loading="lazy"><span class="chip">${esc(types[c.tipe])}</span>${c.disarankan ? `<span class="chip accent sug">${esc(c.alasan_saran?.match(/^Prioritas \d/)?.[0] || 'Disarankan')}</span>` : ''}</div>
    <div class="cc-body"><b>${esc(c.judul)}</b><span class="muted small">${esc(c.ringkasan || '')}</span>

    <span class="meta"><span>${esc(domainLabel(c.kategori))}</span><span class="mono">${esc(c.durasi_atau_halaman || '')}${c.sudah_dibuka ? ' · ✓ dibuka' : ''}</span></span></div></a>`).join('') : empty('Tidak ada konten', 'Coba ubah filter atau kata kunci.')}</div>`;
}
actions.cfKat = (el) => { CF.kategori = el.dataset.k; rerender(); };
forms.cfSearch = (d) => { CF.type = d.type || ''; CF.kw = d.kw || ''; CF.q = d.q || ''; rerender(); };

// Tahap Ground: kondisi dasar diambil dari hasil asesmen terakhir (bagian yang terkait konten diutamakan)
function groundFromAssessment(a, kategori) {
  if (!a) return '';
  const name = (k) => domainLabel(k);
  const stat = { Kuat: 'kuat', Rentan: 'mulai melemah', Lemah: 'sedang lemah' };
  const rel = a.dimensi.find((d) => d.kode === kategori);
  const lines = [`Hasil asesmen terakhir (${fmtDate(a.diisi_pada)}): Indeks Kekuatan Mental ${a.skor_total}/112, kategori ${a.kategori_total}.`];
  if (rel) lines.push(`Bagian yang terkait konten ini, ${name(rel.kode)}: ${rel.skor}/${rel.max} (${stat[rel.kategori]}).`);
  if (a.pelemahan.length) lines.push(`Yang perlu dikuatkan: ${a.pelemahan.map(name).join(', ')}.`);
  if (a.kekuatan.length) lines.push(`Yang sedang kuat: ${a.kekuatan.map(name).join(', ')}.`);
  return lines.join('\n');
}
// Durasi membuka konten untuk analisis keterlibatan: hanya dihitung saat halaman terlihat; dikirim berkala & saat keluar
const VT = { id: null, cid: null, acc: 0, since: null };
function vtSend(final = false) {
  if (!VT.id) return;
  if (VT.since) { VT.acc += Date.now() - VT.since; VT.since = null; }
  const detik = Math.round(VT.acc / 1000);
  if (detik >= 1) fetch(`/api/content-views/${VT.id}`, { method: 'PATCH', keepalive: true, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) }, body: JSON.stringify({ detik }) }).catch(() => {});
  if (final) VT.id = null; else if (document.visibilityState === 'visible') VT.since = Date.now();
}
function vtStart(viewId, cid) { vtSend(true); if (!viewId) return; Object.assign(VT, { id: viewId, cid, acc: 0, since: document.visibilityState === 'visible' ? Date.now() : null }); }
document.addEventListener('visibilitychange', () => { if (!VT.id) return; if (document.visibilityState === 'hidden') vtSend(); else VT.since = Date.now(); });
window.addEventListener('hashchange', () => { if (VT.id && !location.hash.includes(`/konten/${VT.cid}`)) vtSend(true); });
window.addEventListener('pagehide', () => vtSend(true));
setInterval(() => { if (VT.id && document.visibilityState === 'visible') vtSend(); }, 30000);

async function contentDetail({ id }) {
  const [c, g, mine] = await Promise.all([api(`/content/${id}`), api(`/content/${id}/guru`), api('/assessments/me')]);
  vtStart(c.view_id, id);
  const groundAuto = groundFromAssessment(mine.at(-1), c.kategori);
  const m = c.url_media || '';
  const media = !m ? '' : /\.(mp3|ogg)$/i.test(m) ? `<audio controls src="${esc(m)}"></audio>` : /\.mp4$/i.test(m) ? `<video controls src="${esc(m)}"></video>`
    : /\.(png|jpe?g|webp)$/i.test(m) ? `<img src="${esc(m)}" alt="${esc(c.judul)}" class="media-img">` : `<a class="btn" href="${esc(m)}" target="_blank" rel="noopener">${/\.pdf$/i.test(m) ? 'Buka PDF' : /\.pptx$/i.test(m) ? 'Unduh slide' : 'Buka media'}</a>`;
  const hint = state.ref.guru[c.kategori] || state.ref.guru.UMUM;
  const j = { ...(g?.jawaban || {}) };
  if (!j.ground && groundAuto) j.ground = groundAuto;
  return `<a class="small" href="#/s/psikoedukasi">← Ruang Psikoedukasi</a>
  <article class="card content-page"><img class="hero-thumb" src="${esc(c.thumbnail_url || `/thumbs/${c.kategori}.svg`)}" alt="">
    <span class="eyebrow">${esc(state.ref.content_types[c.tipe])} · ${esc(domainLabel(c.kategori))} · ${esc(c.durasi_atau_halaman || '')}</span>
    <h1>${esc(c.judul)}</h1><p class="lead">${esc(c.ringkasan || '')}</p>

    <div class="prose pre">${esc(c.isi || '')}</div>${media}
  </article>
  <form data-form="guruSave" data-id="${esc(c.id)}" class="card content-page guru-form" id="guru">
    <div class="row between wrap"><div><span class="eyebrow">Refleksi GURU · ${esc(hint.judul)}</span><h2>Internalisasi konten ini</h2></div>${g ? `<span class="chip ${g.lengkap ? 'ok' : 'warn'}">${g.lengkap ? 'Lengkap' : 'Belum lengkap'} · ${ago(g.updated_at)}</span>` : '<span class="chip">Belum diisi</span>'}</div>
    <p class="small muted">Tulis dengan kata-katamu sendiri, tanpa menghakimi diri. Kamu bisa menyimpan sebagian lalu melanjutkannya nanti.</p>
    ${mine.length ? '' : '<div class="notice small">Kamu belum mengisi asesmen, jadi tahap <b>Ground</b> belum bisa terisi otomatis. <a href="#/s/asesmen">Isi asesmen</a> atau tuliskan kondisimu sendiri.</div>'}
    ${state.ref.guru_stages.map((st, i) => `<label class="guru-q"><span class="stepno">${esc(st.nama[0])}</span><span><b>${esc(st.nama)}</b> — ${esc(st.makna)}<small>${esc(st.tanya)}</small></span>
      ${st.kode === 'ground' && groundAuto ? `<div class="ground-auto"><span aria-hidden="true">📊</span><div><b>Dari asesmen terakhirmu</b><p class="pre small">${esc(groundAuto)}</p><button type="button" class="btn ghost sm" data-act="groundUse">Masukkan ke kolom Ground</button></div></div>` : ''}
      <textarea id="guru_${st.kode}" name="${st.kode}" rows="${st.kode === 'ground' ? 4 : 3}" placeholder="${i === 3 ? esc(hint.contoh) : 'Tulis refleksimu…'}">${esc(j[st.kode] || '')}</textarea></label>`).join('')}
    <div class="row between wrap"><a class="small" href="#/s/workbook">Lihat semua Refleksi GURU</a><button class="btn primary" type="submit">Simpan Refleksi GURU</button></div>
  </form>`;
}
actions.groundUse = (el) => { const t = document.getElementById('guru_ground'); const auto = el.closest('.ground-auto').querySelector('p').textContent; t.value = t.value.trim() && !t.value.includes(auto) ? `${auto}\n\n${t.value}` : auto; t.focus(); };
forms.guruSave = async (d, f) => {
  const r = await api(`/content/${f.dataset.id}/guru`, { method: 'PUT', body: d });
  toast(r.lengkap ? 'Refleksi GURU lengkap tersimpan. Saatnya mempraktikkan langkahmu!' : 'Refleksi tersimpan. Lengkapi tahap lainnya kapan saja.');
  rerender();
};

// ================= Komunitas =================
let groupQ = '';
async function community() {
  const [groups, peers, me] = await Promise.all([api('/community-groups'), api('/peer-counselors'), api('/peer-counselors/me')]);
  const shown = groups.filter((g) => !groupQ || (g.nama + g.topik + (g.deskripsi || '')).toLowerCase().includes(groupQ.toLowerCase()));
  const wa = (n) => 'https://wa.me/62' + String(n).replace(/\D/g, '').replace(/^0/, '');
  return `<h1>Komunitas</h1>
  ${me.aktif ? `<section class="card peer-me"><div>${peerBadge}<p>Kamu ditetapkan konselor sebagai <b>peer counselor terlatih</b>${me.pelatihan ? ` (${esc(me.pelatihan)})` : ''}. Teman-temanmu dapat melihatmu di direktori di bawah.</p></div>
    <label class="inline">Status ketersediaan <select id="peer_status" data-change="peerStatus">${['online', 'sibuk', 'offline'].map((s) => `<option ${me.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label></section>` : ''}
  <div class="row between wrap"><h3>Grup dukungan sebaya</h3><input id="grp_q" type="search" placeholder="Cari grup…" value="${esc(groupQ)}" data-input="groupQ"></div>
  <div class="rec-grid">${shown.map((g) => `<div class="card group"><span class="eyebrow">${esc(g.topik)}</span><b>${esc(g.nama)}</b><span class="muted small">${esc(g.deskripsi || '')}</span>
    ${g.topik_diskusi.length ? `<div class="kw">${g.topik_diskusi.slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
    <span class="meta"><span>${g.jumlah_anggota} anggota · ${g.jumlah_diskusi} diskusi</span><span>${esc(g.jadwal || '')}</span></span>
    ${g.anggota ? `<div class="row"><a class="btn primary sm" href="#/s/komunitas/${g.id}">Buka diskusi</a><button class="btn ghost sm" data-act="groupLeave" data-id="${g.id}">Keluar</button></div>` : `<button class="btn sm" data-act="groupJoin" data-id="${g.id}">Gabung</button>`}</div>`).join('') || '<p class="muted">Tidak ada grup yang cocok.</p>'}</div>
  <h3 class="section-h">Peer counselor terlatih</h3><p class="small muted">Daftar ini ditetapkan konselor bagi mahasiswa yang telah mengikuti pelatihan dan memenuhi persyaratan.</p>
  <div class="peer-list">${peers.filter((p) => !p.saya).map((p) => `<div class="card peer"><span class="avatar">${esc(p.nama.split(' ').map((w) => w[0]).slice(0, 2).join(''))}</span><div><b>${esc(p.nama)}</b> ${peerBadge}<span class="small muted">${esc(p.nama_prodi || '')} ${p.angkatan || ''} · ${esc(p.keahlian || '')}</span></div>
    <span class="status ${p.status}">${p.status === 'online' ? 'Online' : p.status === 'sibuk' ? 'Sibuk' : 'Offline'}</span>
    ${p.kontak_terverifikasi ? `<div class="row"><a class="btn sm" href="${wa(p.kontak_terverifikasi)}" target="_blank" rel="noopener">WhatsApp</a><button class="btn ghost sm" data-act="copy" data-text="${esc(p.kontak_terverifikasi)}">Salin nomor</button></div>` : ''}</div>`).join('') || '<p class="muted">Belum ada peer counselor.</p>'}</div>
  <p class="small muted">Peer counselor adalah mahasiswa terlatih, bukan tenaga profesional. Untuk masalah berat, gunakan menu Konseling.</p>`;
}
inputHandlers.groupQ = (el) => { groupQ = el.value; clearTimeout(inputHandlers.t); inputHandlers.t = setTimeout(async () => { await rerender(); const i = document.getElementById('grp_q'); i?.focus(); i?.setSelectionRange(i.value.length, i.value.length); }, 350); };
actions.groupJoin = async (el) => { await api(`/community-groups/${el.dataset.id}/members`, { method: 'POST' }); toast('Kamu bergabung. Selamat berdiskusi!'); location.hash = `#/s/komunitas/${el.dataset.id}`; };
actions.groupLeave = async (el) => { if (!(await confirmBox('Keluar dari grup ini? Kamu tidak bisa lagi membaca diskusinya.', { ok: 'Keluar grup' }))) return; await api(`/community-groups/${el.dataset.id}/members`, { method: 'DELETE' }); toast('Kamu keluar dari grup.'); location.hash = '#/s/komunitas'; };
changeHandlers.peerStatus = async (el) => { await api('/peer-counselors/me', { method: 'PATCH', body: { status: el.value } }); toast('Status diperbarui.'); };

export function postHtml(p, { mod = false, reply = false } = {}) {
  const who = `<b>${esc(p.penulis.nama)}</b>${p.penulis.role === 'konselor' ? ' <span class="chip info">Konselor</span>' : ''}${p.penulis.peer ? ` ${peerBadge}` : ''}`;
  const hidden = p.status === 'disembunyikan';
  return `<div class="post ${reply ? 'reply' : ''} ${hidden ? 'hidden-post' : ''}"><div class="row between wrap"><span>${who} <small class="muted">${ago(p.created_at)}</small></span>
    <span class="row">${mod ? (hidden ? `<button class="link small" data-act="modShow" data-id="${p.id}">Tampilkan</button>` : `<button class="link small" data-act="modHide" data-id="${p.id}">Sembunyikan</button>`) : ''}
    ${p.penulis.saya || mod ? `<button class="link small" data-act="postDel" data-id="${p.id}">Hapus</button>` : `<button class="link small" data-act="postReport" data-id="${p.id}">Laporkan</button>`}</span></div>
    ${!reply && p.topik ? `<span class="chip">${esc(p.topik)}</span>` : ''}
    ${hidden ? `<p class="small muted">Disembunyikan konselor${p.alasan_moderasi ? `: ${esc(p.alasan_moderasi)}` : ''}.</p>${mod || p.penulis.saya ? `<p class="pre faded">${esc(p.isi)}</p>` : ''}` : `<p class="pre">${esc(p.isi)}</p>`}
    ${mod && p.laporan?.length ? `<div class="notice warn small">${p.laporan.length} laporan: ${p.laporan.map((l) => esc(l.alasan)).join('; ')}</div>` : ''}</div>`;
}
export async function groupDiscussion({ id }, { mod = false, back = '#/s/komunitas' } = {}) {
  let d;
  try { d = await api(`/community-groups/${id}/posts`); } catch (e) {
    if (e.code === 'NOT_MEMBER') return `<a class="small" href="${back}">← Komunitas</a><section class="card prose-card"><h2>Gabung untuk mengakses diskusi</h2><p>${esc(e.message)}</p><button class="btn primary" data-act="groupJoin" data-id="${esc(id)}">Gabung grup</button></section>`;
    throw e;
  }
  const g = d.group;
  return `<a class="small" href="${back}">← Komunitas</a>
  <div class="row between wrap"><div><span class="eyebrow">${esc(g.topik)}</span><h1>${esc(g.nama)}</h1><p class="muted">${esc(g.deskripsi || '')}</p></div>${mod ? '' : `<button class="btn ghost sm" data-act="groupLeave" data-id="${g.id}">Keluar grup</button>`}</div>
  ${g.status !== 'aktif' ? '<div class="notice warn">Grup ini sedang nonaktif dan tidak tampil bagi konseli.</div>' : ''}
  <form data-form="postNew" data-id="${g.id}" class="card stack"><b>Mulai diskusi</b>
    <select id="pn_topic" name="topik" aria-label="Topik diskusi"><option value="">Topik umum</option>${g.topik_diskusi.map((t) => `<option>${esc(t)}</option>`).join('')}</select>
    <textarea id="pn_text" name="isi" rows="3" required placeholder="Bagikan cerita, pertanyaan, atau dukunganmu. Jaga privasi diri dan teman."></textarea>
    <div class="row between wrap"><small class="muted">Pedoman: saling menghargai, tanpa promosi, tanpa menyebar data pribadi. Konselor memoderasi diskusi.</small><button class="btn primary" type="submit">Kirim</button></div></form>
  ${d.threads.length ? d.threads.map((t) => `<section class="card thread">${postHtml(t, { mod })}${t.balasan.map((r) => postHtml(r, { mod, reply: true })).join('')}
    <form data-form="postReply" data-id="${g.id}" data-parent="${t.id}" class="row reply-form"><input name="isi" placeholder="Tulis balasan…" required aria-label="Balasan"><button class="btn sm" type="submit">Balas</button></form></section>`).join('') : empty('Belum ada diskusi', 'Jadilah yang pertama memulai percakapan.')}`;
}
forms.postNew = async (d, f) => { await api(`/community-groups/${f.dataset.id}/posts`, { method: 'POST', body: d }); toast('Diskusi terkirim.'); rerender(); };
forms.postReply = async (d, f) => { await api(`/community-groups/${f.dataset.id}/posts`, { method: 'POST', body: { ...d, parent_id: f.dataset.parent } }); rerender(); };
actions.postDel = async (el) => { if (!(await confirmBox('Hapus pesan ini?', { ok: 'Hapus' }))) return; await api(`/posts/${el.dataset.id}`, { method: 'DELETE' }); rerender(); };
actions.postReport = (el) => openModal(`<h3>Laporkan pesan</h3><form data-form="postReport" data-id="${el.dataset.id}" class="stack"><label>Alasan<select id="rp_reason" name="alasan"><option>Promosi/spam</option><option>Ujaran kasar atau merendahkan</option><option>Menyebarkan data pribadi orang lain</option><option>Konten membahayakan atau mengkhawatirkan</option><option>Lainnya</option></select></label><div class="row end"><button class="btn crit" type="submit">Kirim laporan</button></div></form>`);
forms.postReport = async (d, f) => { await api(`/posts/${f.dataset.id}/report`, { method: 'POST', body: d }); closeModal(); toast('Laporan terkirim ke konselor. Terima kasih menjaga komunitas.'); };

// ================= Konseling =================
const CS = { counselor: null, occ: null, mode: '', topik: '', topik_lainnya: '', keluhan: '', consent: null, read: false, agree: false };
const ctabs = (on) => `<div class="tabs">${[['', 'Daftar dan Pilih Konselor'], ['formulir', 'Formulir Pendaftaran'], ['riwayat', 'Riwayat Konseling/Kegiatan'], ['pesan', 'Pesan']].map(([k, l]) => `<a href="#/s/konseling${k ? '/' + k : ''}" class="${on === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
const STATUS = { pending: ['Menunggu konfirmasi', 'warn'], confirmed: ['Terkonfirmasi', 'ok'], selesai: ['Selesai', 'info'], batal: ['Dibatalkan', ''] };
const modeLabel = (m) => ({ online: 'Daring', offline: 'Luring', keduanya: 'Daring/Luring' }[m] || m);

async function counsel() {
  const counselors = await api('/counselors');
  const c = counselors.find((x) => x.user_id === CS.counselor);
  let avail = []; let consent = null;
  if (c) { [avail, consent] = await Promise.all([api(`/counselors/${c.user_id}/availability`), api(`/counselors/${c.user_id}/consent`)]); if (CS.consent?.versi !== consent.versi) { CS.read = false; CS.agree = false; } CS.consent = consent; }
  const byDate = avail.reduce((m, o) => ((m[o.tanggal] ||= []).push(o), m), {});
  const me = state.user;
  return `<h1>Konseling Profesional</h1>${ctabs('')}
  <section class="card"><h3><span class="stepno">1</span> Pilih konselor</h3>
    <div class="rec-grid">${counselors.map((x) => `<div class="card counselor ${CS.counselor === x.user_id ? 'sel' : ''}"><div class="row"><span class="avatar">${esc(x.nama.split(' ').find((w) => /^[A-Z]/.test(w))?.[0] || 'K')}</span><div><b>${esc(x.nama)}</b><span class="small muted">${esc(x.spesialisasi || '')}</span></div></div>
      <ul class="plain small">${x.jadwal_ringkas.map((j) => `<li>${esc(j)}</li>`).join('') || '<li class="muted">Belum membuka jadwal</li>'}</ul>
      <span class="small ${x.slot_tersedia ? 'ok-text' : 'muted'}">${x.slot_tersedia ? `${x.slot_tersedia} jadwal tersedia 2 minggu ke depan` : 'Kuota 2 minggu ke depan penuh/belum dibuka'}</span>
      <button class="btn ${CS.counselor === x.user_id ? 'primary' : ''} sm" data-act="pickCounselor" data-id="${x.user_id}">${CS.counselor === x.user_id ? 'Dipilih' : 'Pilih'}</button></div>`).join('')}</div></section>
  ${c ? `<section class="card"><h3><span class="stepno">2</span> Pilih jadwal (${esc(c.nama)})</h3>
    ${Object.keys(byDate).length ? `<div class="slot-days">${Object.entries(byDate).map(([d, os]) => `<div class="slot-day"><b>${new Date(d + 'T00:00:00+07:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' })}</b>
      ${os.map((o) => `<button class="slot ${CS.occ?.jadwal === o.jadwal && CS.occ?.slot_id === o.slot_id ? 'on' : ''}" data-act="pickSlot" data-slot="${o.slot_id}" data-jadwal="${o.jadwal}" ${o.sisa ? '' : 'disabled'}><span class="mono">${o.jam_mulai}–${o.jam_selesai}</span><small>${esc(o.jenis_layanan)} · ${modeLabel(o.mode)}</small><small>${o.sisa ? `sisa ${o.sisa}/${o.kuota}` : 'penuh'}</small></button>`).join('')}</div>`).join('')}</div>` : '<p class="muted">Konselor ini belum membuka jadwal pada 4 minggu ke depan. Pilih konselor lain atau kirim pesan.</p>'}</section>
  <section class="card"><h3><span class="stepno">3</span> Formulir</h3>
    <div class="form-grid">
      <label>Nama<input value="${esc(me.nama)}" readonly></label><label>NIM<input value="${esc(me.nim_nip)}" readonly></label>
      <label>Program studi<input value="${esc(me.prodi?.nama || '-')}" readonly></label><label>Email<input value="${esc(me.email)}" readonly></label>
      <label>Topik masalah<select id="cs_topik" data-change="csField" data-f="topik"><option value="">Pilih topik</option>${state.ref.topics.map(([t]) => `<option ${CS.topik === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label id="cs_lain_wrap" ${CS.topik === 'Lainnya' ? '' : 'hidden'}>Topik lainnya<input id="cs_lain" value="${esc(CS.topik_lainnya)}" data-input="csInput" data-f="topik_lainnya" placeholder="Tuliskan topik yang ingin dibicarakan"></label>
      ${CS.occ?.mode === 'keduanya' ? `<label>Mode sesi<select id="cs_mode" data-change="csField" data-f="mode"><option value="">Pilih</option><option value="offline" ${CS.mode === 'offline' ? 'selected' : ''}>Luring (tatap muka)</option><option value="online" ${CS.mode === 'online' ? 'selected' : ''}>Daring (video)</option></select></label>` : ''}
      <label class="full">Keluhan / hal yang ingin dibicarakan<textarea id="cs_keluhan" rows="4" data-input="csInput" data-f="keluhan" placeholder="Ceritakan secara singkat.">${esc(CS.keluhan)}</textarea></label>
    </div></section>
  <section class="card"><h3><span class="stepno">4</span> Informed consent konseling <span class="muted small">(disusun ${esc(c.nama)} · versi ${consent.versi})</span></h3>
    <div class="consent-box" id="consentBox" data-scrollread tabindex="0">${consent.bagian.map((b) => `<h4>${esc(b.judul)}</h4><p>${esc(b.isi)}</p>`).join('')}<p class="small muted">— Akhir dokumen —</p></div>
    <p class="small ${CS.read ? 'ok-text' : 'muted'}" id="consentHint">${CS.read ? 'Kamu telah membaca seluruh informed consent.' : 'Gulir sampai akhir dokumen untuk dapat memberikan persetujuan.'}</p>
    <label class="check"><input type="checkbox" id="cs_agree" data-change="csAgree" ${CS.agree ? 'checked' : ''} ${CS.read ? '' : 'disabled'}> Saya telah membaca, memahami, dan menyetujui seluruh ketentuan konseling di atas.</label>
    <div class="row end"><button class="btn primary" id="csSubmit" data-act="csSubmit" disabled>Kirim pendaftaran</button></div></section>` : ''}`;
}
const csReady = () => CS.counselor && CS.occ && CS.topik && (CS.topik !== 'Lainnya' || CS.topik_lainnya.trim()) && (CS.occ.mode !== 'keduanya' || CS.mode) && CS.read && CS.agree;
const csSync = () => { const b = document.getElementById('csSubmit'); if (b) b.disabled = !csReady(); };
actions.pickCounselor = (el) => { if (CS.counselor !== el.dataset.id) { CS.occ = null; CS.read = false; CS.agree = false; } CS.counselor = el.dataset.id; rerender(); };
actions.pickSlot = async (el) => { const avail = await api(`/counselors/${CS.counselor}/availability`); CS.occ = avail.find((o) => o.slot_id === el.dataset.slot && o.jadwal === el.dataset.jadwal); CS.mode = CS.occ?.mode === 'keduanya' ? CS.mode : CS.occ?.mode; await rerender(); document.getElementById('cs_topik')?.scrollIntoView({ block: 'center' }); };
changeHandlers.csField = (el) => { CS[el.dataset.f] = el.value; if (el.dataset.f === 'topik') document.getElementById('cs_lain_wrap').hidden = el.value !== 'Lainnya'; csSync(); };
inputHandlers.csInput = (el) => { CS[el.dataset.f] = el.value; csSync(); };
changeHandlers.csAgree = (el) => { CS.agree = el.checked; csSync(); };
document.addEventListener('scroll', (e) => {
  const box = e.target; if (!(box instanceof HTMLElement) || box.id !== 'consentBox' || CS.read) return;
  if (box.scrollTop + box.clientHeight >= box.scrollHeight - 8) { CS.read = true; document.getElementById('cs_agree').disabled = false; const h = document.getElementById('consentHint'); h.textContent = 'Kamu telah membaca seluruh informed consent.'; h.className = 'small ok-text'; csSync(); }
}, true);
actions.csSubmit = async (el) => {
  if (!csReady()) return;
  el.disabled = true;
  const r = await api('/appointments', { method: 'POST', body: { counselor_id: CS.counselor, slot_id: CS.occ.slot_id, jadwal: CS.occ.jadwal, mode: CS.mode, topik: CS.topik, topik_lainnya: CS.topik_lainnya, keluhan: CS.keluhan, consent_versi: CS.consent.versi, consent_dibaca: CS.read, consent_setuju: CS.agree } })
    .catch((e) => { el.disabled = false; if (e.code === 'CONSENT_CHANGED') { CS.read = false; CS.agree = false; rerender(); } throw e; });
  Object.assign(CS, { counselor: null, occ: null, mode: '', topik: '', topik_lainnya: '', keluhan: '', read: false, agree: false });
  toast(`Pendaftaran terkirim. Nomor: ${r.nomor}`);
  location.hash = `#/s/konseling/formulir/${r.id}`;
};

function formHtml(f) {
  return `<dl class="kv"><dt>Nomor pendaftaran</dt><dd class="mono">${esc(f.nomor)}</dd><dt>Status</dt><dd>${esc(f.status)}</dd><dt>Nama</dt><dd>${esc(f.nama)}</dd><dt>NIM</dt><dd class="mono">${esc(f.nim)}</dd><dt>Program studi</dt><dd>${esc(f.prodi || '-')}</dd><dt>Email</dt><dd>${esc(f.email)}</dd>
    <dt>Konselor</dt><dd>${esc(f.konselor)}</dd><dt>Jadwal</dt><dd>${fmtDT(f.jadwal)} WIB</dd><dt>Jenis layanan</dt><dd>${esc(f.jenis_layanan)}</dd><dt>Mode</dt><dd>${modeLabel(f.mode)}${f.lokasi ? ` · ${esc(f.lokasi)}` : ''}</dd><dt>Topik</dt><dd>${esc(f.topik)}</dd><dt>Keluhan</dt><dd class="pre">${esc(f.keluhan || '-')}</dd>
    <dt>Informed consent</dt><dd>Versi ${f.consent_versi}, disetujui ${fmtDT(f.disetujui_pada)} <details><summary class="small">Lihat isi</summary>${f.consent.map(([j, i]) => `<h4>${esc(j)}</h4><p class="small">${esc(i)}</p>`).join('')}</details></dd></dl>`;
}
async function formPage({ id } = {}) {
  if (!id) {
    const list = (await api('/appointments/me')).filter((a) => a.nomor);
    return `<h1>Konseling Profesional</h1>${ctabs('formulir')}${list.length ? `<section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Nomor</th><th>Konselor</th><th>Jadwal</th><th>Status</th><th></th></tr></thead><tbody>${list.map((a) => `<tr><td class="mono">${esc(a.nomor)}</td><td>${esc(a.counselor.nama)}</td><td>${fmtDT(a.jadwal)}</td><td><span class="chip ${STATUS[a.status][1]}">${STATUS[a.status][0]}</span></td><td class="row"><a href="#/s/konseling/formulir/${a.id}">Lihat</a><button class="link" data-act="formPdf" data-id="${a.id}">PDF</button></td></tr>`).join('')}</tbody></table></div></section>` : empty('Belum ada formulir pendaftaran', 'Formulir muncul setelah kamu mengirim pendaftaran konseling.', '<a class="btn" href="#/s/konseling">Daftar konseling</a>')}`;
  }
  const f = await api(`/appointments/${id}/form`);
  return `<h1>Konseling Profesional</h1>${ctabs('formulir')}<section class="card"><div class="row between wrap"><div><span class="eyebrow">Formulir pendaftaran konseling</span><h2>${esc(f.nomor)}</h2></div><div class="row"><button class="btn primary" data-act="formPdf" data-id="${esc(id)}">Unduh PDF</button><a class="btn ghost" href="#/s/konseling/riwayat/${esc(id)}">Lihat di riwayat</a></div></div>${formHtml(f)}
    <p class="small muted">Konselor akan mengonfirmasi atau menyesuaikan jadwal. Kamu akan menerima notifikasi.</p></section>`;
}
actions.formPdf = (el) => download(`/appointments/${el.dataset.id}/form/pdf`, 'formulir-pendaftaran-konseling.pdf');

async function history() {
  const list = await api('/appointments/me');
  return `<h1>Konseling Profesional</h1>${ctabs('riwayat')}
  ${list.length ? `<section class="card">${list.map((a) => `<a class="appt-row link-row" href="#/s/konseling/riwayat/${a.id}"><div><b>${esc(a.topik_lainnya ? `Lainnya: ${a.topik_lainnya}` : a.topik)}</b> <span class="chip ${STATUS[a.status][1]}">${STATUS[a.status][0]}</span>${a.ringkasan_tersedia ? ' <span class="chip accent">Ringkasan tersedia</span>' : ''}<p class="muted small">${fmtDT(a.jadwal)} · ${esc(a.counselor.nama)} · ${esc(a.jenis_layanan || '')} · ${a.jenis === 'online' ? 'Daring' : 'Luring'}${a.nomor ? ` · <span class="mono">${esc(a.nomor)}</span>` : ''}</p></div><span class="muted">›</span></a>`).join('')}</section>`
    : empty('Belum ada riwayat konseling', 'Pendaftaran pertamamu akan muncul di sini.', '<a class="btn" href="#/s/konseling">Daftar konseling</a>')}`;
}
async function historyDetail({ id }) {
  const d = await api(`/appointments/${id}/detail`);
  const a = d.appointment;
  return `<a class="small" href="#/s/konseling/riwayat">← Riwayat Konseling/Kegiatan</a>
  <section class="card"><div class="row between wrap"><div><span class="eyebrow">${esc(a.jenis_layanan || 'Konseling')}</span><h2>${esc(a.topik_lainnya ? `Lainnya: ${a.topik_lainnya}` : a.topik)}</h2><p class="muted">${fmtDT(a.jadwal)} WIB · ${esc(a.counselor.nama)}</p></div><span class="chip ${STATUS[a.status][1]}">${STATUS[a.status][0]}</span></div>
    ${a.status === 'confirmed' && a.tautan_rapat ? `<p>Tautan rapat: <a href="${esc(a.tautan_rapat)}" target="_blank" rel="noopener">${esc(a.tautan_rapat)}</a></p>` : ''}
    ${a.lokasi && a.status !== 'batal' ? `<p class="small">Lokasi: ${esc(a.lokasi)}</p>` : ''}
    <div class="row wrap">${d.form ? `<button class="btn ghost sm" data-act="formPdf" data-id="${a.id}">Unduh formulir (PDF)</button><a class="btn ghost sm" href="#/s/konseling/formulir/${a.id}">Lihat formulir</a>` : ''}${['pending', 'confirmed'].includes(a.status) ? `<button class="btn ghost sm" data-act="apptCancel" data-id="${a.id}">Batalkan</button>` : ''}</div></section>
  <section class="card"><h3>Catatan konseling dari konselor</h3>
    ${d.ringkasan ? `<p class="pre">${esc(d.ringkasan.ringkasan)}</p>${d.ringkasan.tindak_lanjut_konseli ? `<h4>Tindak lanjut untukmu</h4><p class="pre">${esc(d.ringkasan.tindak_lanjut_konseli)}</p>` : ''}<p class="small muted">Disetujui konselor ${fmtDT(d.ringkasan.disetujui_pada)}. Catatan profesional konselor bersifat rahasia dan tidak ditampilkan.</p>`
      : `<p class="muted">${a.status === 'selesai' ? 'Konselor belum menerbitkan ringkasan sesi ini.' : 'Ringkasan tersedia setelah sesi berlangsung dan disetujui konselor.'}</p>`}</section>
  ${a.status === 'selesai' ? `<section class="card">${a.feedback ? `<h3>Penilaianmu</h3><span class="stars">${'★'.repeat(a.feedback.rating)}${'☆'.repeat(5 - a.feedback.rating)}</span>${a.feedback.refleksi_mahasiswa ? `<p class="small">${esc(a.feedback.refleksi_mahasiswa)}</p>` : ''}`
    : `<form data-form="feedback" data-id="${a.id}" class="stack"><h3>Bagaimana sesimu?</h3><div class="rating" role="radiogroup">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="rating" value="${n}" required><span>★</span><small>${n}</small></label>`).join('')}</div>
      <label>Refleksi diri setelah sesi<textarea id="fb_${a.id}" name="refleksi_mahasiswa" rows="3" placeholder="Apa yang kamu pelajari? Apa langkah berikutnya?"></textarea></label><button class="btn sm" type="submit">Kirim penilaian</button></form>`}</section>` : ''}`;
}
actions.apptCancel = async (el) => { if (!(await confirmBox('Batalkan pendaftaran konseling ini? Perhatikan ketentuan pembatalan pada informed consent.', { ok: 'Batalkan' }))) return; await api(`/appointments/${el.dataset.id}`, { method: 'PATCH', body: { status: 'batal' } }); toast('Pendaftaran dibatalkan.'); rerender(); };
forms.feedback = async (d, f) => { await api(`/appointments/${f.dataset.id}/feedback`, { method: 'POST', body: { rating: Number(d.rating), refleksi_mahasiswa: d.refleksi_mahasiswa } }); toast('Terima kasih atas penilaianmu.'); rerender(); };

export async function messagesView(tabsHtml, { peopleLabel, people }) {
  const threads = await api('/messages/threads');
  const map = new Map(threads.map((t) => [t.user_id, t]));
  for (const p of people) if (!map.has(p.id)) map.set(p.id, { user_id: p.id, nama: p.nama, cuplikan: '', belum_dibaca: 0, online: p.online });
  const all = [...map.values()];
  const sel = MSG.with && map.has(MSG.with) ? MSG.with : all[0]?.user_id;
  MSG.with = sel;
  const conv = sel ? await api(`/messages/with/${sel}`) : [];
  state.onMessage = (m) => { if (m.sender_id === MSG.with) rerender(); };
  return `${tabsHtml}<div class="msg-layout"><aside class="card thread-list"><small class="muted">${esc(peopleLabel)}</small>${all.map((t) => `<button class="thread ${t.user_id === sel ? 'on' : ''}" data-act="msgWith" data-id="${t.user_id}"><span class="status-dot ${t.online ? 'online' : ''}"></span><span><b>${esc(t.nama)}</b><small>${esc(t.cuplikan || 'Mulai percakapan')}</small></span>${t.belum_dibaca ? `<span class="badge">${t.belum_dibaca}</span>` : ''}</button>`).join('') || '<p class="muted">Belum ada kontak.</p>'}</aside>
    <section class="card conv">${sel ? `<div class="bubbles" id="bubbles">${conv.map((m) => `<div class="bubble ${m.saya ? 'me' : ''}"><p>${esc(m.isi_teks)}</p><small>${fmtDT(m.dikirim_pada)}</small></div>`).join('') || '<p class="muted center">Belum ada pesan.</p>'}</div>
      <form data-form="msgSend" class="row"><input id="msg_text" name="isi_teks" placeholder="Tulis pesan…" required autocomplete="off"><button class="btn primary" type="submit">Kirim</button></form>` : '<p class="muted">Pilih kontak.</p>'}</section></div>`;
}
export const MSG = { with: null };
actions.msgWith = (el) => { MSG.with = el.dataset.id; rerender(); };
forms.msgSend = async (d) => { await api('/messages', { method: 'POST', body: { receiver_id: MSG.with, isi_teks: d.isi_teks } }); await rerender(); document.getElementById('msg_text')?.focus(); };
const scrollBubbles = () => { const b = document.getElementById('bubbles'); if (b) b.scrollTop = b.scrollHeight; };

async function studentMessages() {
  const counselors = await api('/counselors');
  return `<h1>Konseling Profesional</h1>` + await messagesView(ctabs('pesan'), { peopleLabel: 'Konselor', people: counselors.map((c) => ({ id: c.user_id, nama: c.nama, online: c.online })) });
}

// ================= Profil =================
export async function profileView() {
  const [me, consents] = await Promise.all([api('/users/me'), api('/consents/me')]);
  const isStudent = me.role === 'mahasiswa';
  const [camp, pj] = isStudent ? await Promise.all([api('/campus'), api('/panjalu-counselors')]) : [null, null];
  return `<h1>Profil & Privasi</h1><div class="grid-2">
  <section class="card"><h3>Data pribadi</h3><dl class="kv"><dt>Nama</dt><dd>${esc(me.nama)}</dd><dt>${isStudent ? 'NIM' : 'NIP/ID'}</dt><dd class="mono">${esc(me.nim_nip)}</dd>${me.universitas ? `<dt>Perguruan tinggi</dt><dd>${esc(me.universitas.nama)}</dd>` : ''}${me.prodi ? `<dt>Prodi</dt><dd>${esc(me.prodi.nama)} (${me.prodi.jenjang})</dd><dt>Fakultas</dt><dd>${esc(me.prodi.fakultas)}</dd><dt>Angkatan / kelas</dt><dd>${me.angkatan || '—'} / ${esc(me.kelas || '—')}</dd>` : ''}${me.koordinator ? `<dt>Jabatan</dt><dd>${esc(me.koordinator.jabatan || '—')}</dd><dt>Unit</dt><dd>${esc(me.koordinator.unit || '—')}</dd>` : ''}</dl>
    <form data-form="profileSave" class="stack"><label>Email (terverifikasi)<input id="pf_email" type="email" value="${esc(me.email || '')}" readonly></label><label>Telepon<input id="pf_tel" name="telepon" value="${esc(me.telepon || '')}"></label><label>Alamat<input id="pf_addr" name="alamat" value="${esc(me.alamat || '')}"></label>
      ${isStudent ? `<label class="check"><input type="checkbox" name="identitas_disamarkan" value="1" ${me.identitas_disamarkan ? 'checked' : ''}> Samarkan nama saya pada tampilan konselor & laporan (hanya inisial yang terlihat)</label>` : ''}
      <button class="btn" type="submit">Simpan perubahan</button></form></section>
  <section class="card"><h3>Ganti kata sandi</h3><form data-form="pwChange" class="stack"><label>Kata sandi lama<input id="pw_old" name="lama" type="password" required autocomplete="current-password"></label><label>Kata sandi baru (min. 8 karakter, huruf & angka)<input id="pw_new" name="baru" type="password" minlength="8" required autocomplete="new-password"></label><button class="btn" type="submit">Ganti kata sandi</button><p class="small muted">Mengganti kata sandi akan mengeluarkan akun dari semua perangkat lain.</p></form>
    ${isStudent ? `<h3>Riwayat persetujuan</h3><ul class="plain">${consents.map((c) => `<li><b>${esc(c.jenis_consent.replace('_', ' '))}</b> · ${fmtDT(c.disetujui_pada)} · <span class="mono small">${esc(c.versi_kebijakan)}</span></li>`).join('') || '<li class="muted">Belum ada.</li>'}</ul>
    <p class="small muted">Sesuai UU PDP kamu berhak meminta salinan, perbaikan, atau penghapusan datamu. Ajukan melalui Unit Layanan Konseling atau pesan ke konselor.</p>` : ''}</section></div>
  ${isStudent ? `<form data-form="myCounselors" class="card stack"><h3>Konselor pilihanku</h3><p class="small muted">Konselor yang kamu pilih menjadi pendamping utamamu: mereka dapat melihat hasil asesmenmu untuk mendampingimu, dan kamu dapat mendaftar konseling kepada mereka. Pilih maksimal 5.</p>
    ${camp.konselor.length ? `<div class="pick-list">${camp.konselor.map((c) => counselorPick(c, camp.konselor_saya.includes(c.id))).join('')}</div>` : '<p class="muted">Kampusmu belum memiliki konselor aktif.</p>'}
    <div class="row end"><button class="btn primary" type="submit">Simpan pilihan</button></div></form>
  <section class="card stack"><h3>Konselor PAN-JALU</h3><p class="small muted">Konselor PAN-JALU melayani mahasiswa dari kampus mana pun${pj.kampus_punya_konselor ? '' : ' — sangat dianjurkan karena kampusmu belum memiliki konselor di PAN-JALU'}. Kamu dapat memilih satu Konselor PAN-JALU dan menggantinya kapan saja; kewenangan akses datamu berpindah ke konselor yang baru.</p>
    ${pjForm(pj, false)}</section>` : ''}`;
}
// ---- Konselor PAN-JALU: dipilih langsung oleh mahasiswa (lintas kampus), dapat diganti kapan saja ----
const PJ_CONSENT = 'Saya setuju Konselor PAN-JALU yang saya pilih dapat mengakses data asesmen IKDKM-M dan perkembangan saya (jurnal, Refleksi GURU, riwayat konseling dengannya) untuk keperluan pendampingan. Bila saya mengganti atau melepas konselor ini, aksesnya berakhir dan berpindah ke konselor baru.';
function pjCards(d) {
  if (!d.items.length) return '<p class="muted">Belum ada Konselor PAN-JALU yang aktif. Kamu tetap dapat memakai seluruh fitur mandiri PAN-JALU; tombol SOS selalu tersedia.</p>';
  return `<div class="pick-list">${d.items.map((c) => `<label class="pick ${c.id === d.saya ? 'match' : ''} ${c.penuh ? 'disabled' : ''}"><input type="radio" name="counselor_id" value="${c.id}" ${c.id === d.saya ? 'checked' : ''} ${c.penuh ? 'disabled' : ''}>
    <span><b>${esc(c.nama)}</b>${c.gelar ? ` <small class="muted">${esc(c.gelar)}</small>` : ''}<small>${esc(c.spesialisasi || '')}</small>
    <small class="muted">${esc(c.asal)}${c.sekampus ? ' · sekampus denganmu' : ''} · ${c.konseli}/${c.kapasitas} konseli</small>
    ${c.id === d.saya ? '<small class="ok-text">Konselor PAN-JALU-mu saat ini</small>' : c.penuh ? '<small class="muted">Kuota konseli penuh</small>' : c.online ? '<small class="ok-text">Sedang daring</small>' : ''}</span></label>`).join('')}</div>`;
}
const pjForm = (d, modal) => `<form data-form="pjChoose" ${modal ? 'data-modal="1"' : ''} class="stack">${pjCards(d)}
  ${d.items.length ? `<label class="check small"><input type="checkbox" name="setuju" value="1" required> ${esc(PJ_CONSENT)}</label>
  <div class="row end wrap">${d.saya && !modal ? '<button type="button" class="btn ghost" data-act="pjRemove">Lepas Konselor PAN-JALU</button>' : ''}<button class="btn primary" type="submit">${d.saya ? 'Simpan pilihan' : 'Pilih konselor ini'}</button></div>` : ''}</form>`;
actions.pjOpen = async () => {
  const [d, camp] = await Promise.all([api('/panjalu-counselors'), api('/campus')]);
  openModal(`<h3>Pilih konselor pendampingmu</h3>
    ${camp.konselor?.length ? `<p class="small">Kampusmu memiliki ${camp.konselor.length} konselor kampus. Kamu dapat memilih konselor kampus di menu <a href="#/s/profil" data-act="closeModal">Profil</a>, atau memilih <b>Konselor PAN-JALU</b> di bawah ini.</p>` : '<p class="small">Kampusmu belum memiliki konselor di PAN-JALU. Pilih <b>Konselor PAN-JALU</b> — konselor yang disetujui PAN-JALU untuk mendampingi mahasiswa dari kampus mana pun.</p>'}
    ${pjForm(d, true)}<div class="row end"><button class="btn ghost sm" data-act="pjLater">Nanti saja</button></div>`);
};
// Ajakan memilih konselor muncul otomatis saat masuk (sekali per sesi) bila belum memilih
function pjAutoPrompt() {
  if (!state.user?.perlu_pilih_konselor) return;
  try { if (sessionStorage.getItem('pj_prompt')) return; sessionStorage.setItem('pj_prompt', '1'); } catch { /* */ }
  actions.pjOpen().catch(() => {});
}
actions.pjLater = async () => { await api('/users/me/pilih-konselor-nanti', { method: 'POST', body: {} }); state.user.perlu_pilih_konselor = false; if (state.realUser) state.realUser.perlu_pilih_konselor = false; closeModal(); toast('Kamu bisa memilih konselor kapan saja di menu Profil.', 'info'); rerender(); };
forms.pjChoose = async (d, f) => {
  if (!d.counselor_id) return toast('Pilih salah satu konselor.', 'warn');
  await api('/users/me/panjalu-counselor', { method: 'PUT', body: { counselor_id: d.counselor_id, setuju: !!d.setuju } });
  state.user.perlu_pilih_konselor = false; if (state.realUser) state.realUser.perlu_pilih_konselor = false;
  if (f.dataset.modal) closeModal();
  toast('Konselor PAN-JALU dipilih. Konselor akan diberi tahu dan dapat mulai mendampingimu.'); rerender();
};
actions.pjRemove = async () => {
  if (!(await confirmBox('Lepas Konselor PAN-JALU? Akses konselor tersebut ke data asesmen dan perkembanganmu akan berakhir.', { ok: 'Lepas konselor' }))) return;
  await api('/users/me/panjalu-counselor', { method: 'PUT', body: { counselor_id: null } }); toast('Konselor PAN-JALU dilepas.'); rerender();
};

// Kartu konselor yang dapat dicentang (dipakai di pendaftaran dan profil)
export const counselorPick = (c, on) => `<label class="pick ${c.cocok ? 'match' : ''}"><input type="checkbox" name="k_${c.id}" value="1" ${on ? 'checked' : ''}><span><b>${esc(c.nama)}</b>${c.gelar ? ` <small class="muted">${esc(c.gelar)}</small>` : ''}
  <small>${esc(c.spesialisasi || '')}</small><small class="muted">Konteks kerja: ${esc(c.konteks.ringkas)}</small>${c.cocok ? '<small class="ok-text">Sesuai prodimu</small>' : ''}${c.layanan_terbuka ? '' : '<small class="muted">Melayani konseling khusus mahasiswa binaan</small>'}</span></label>`;
forms.myCounselors = async (d) => { const r = await api('/users/me/counselors', { method: 'PUT', body: { ids: Object.keys(d).filter((k) => k.startsWith('k_')).map((k) => k.slice(2)) } }); toast(`${r.konselor_saya.length} konselor pilihan disimpan.`); };
forms.profileSave = async (d) => { await api('/users/me', { method: 'PATCH', body: { ...d, identitas_disamarkan: !!d.identitas_disamarkan } }); toast('Profil diperbarui.'); };
forms.pwChange = async (d, f) => { await api('/users/me/password', { method: 'POST', body: d }); f.reset(); toast('Kata sandi diganti. Silakan masuk ulang di perangkat lain.'); };


export const studentViews = {
  's/home': { title: 'Beranda', roles: R, render: home, after: pjAutoPrompt },
  's/asesmen': { title: 'Asesmen IKDKM-M', roles: R, render: assessIntro },
  's/asesmen/hasil/:id': { title: 'Hasil Asesmen', roles: R, render: assessResult },
  's/workbook': { title: 'Refleksi GURU', roles: R, render: workbook },
  's/jurnal': { title: 'Jurnal & Goals', roles: R, render: journal },
  's/perkembangan': { title: 'Beranda', roles: R, render: home }, // tautan lama: kini bagian dari Beranda
  's/relaksasi': { title: 'Ruang Mindfulness', roles: R, render: relax, after: syncMusicUI },
  's/psikoedukasi': { title: 'Psikoedukasi', roles: R, render: content },
  's/psikoedukasi/kategori/:kategori': { title: 'Psikoedukasi', roles: R, render: content },
  's/psikoedukasi/konten/:id': { title: 'Konten Psikoedukasi', roles: R, render: contentDetail },
  's/komunitas': { title: 'Komunitas', roles: R, render: community },
  's/komunitas/:id': { title: 'Diskusi Komunitas', roles: R, render: (p) => groupDiscussion(p, { back: '#/s/komunitas' }) },
  's/konseling': { title: 'Konseling', roles: R, render: counsel },
  's/konseling/formulir': { title: 'Formulir Pendaftaran', roles: R, render: formPage },
  's/konseling/formulir/:id': { title: 'Formulir Pendaftaran', roles: R, render: formPage },
  's/konseling/riwayat': { title: 'Riwayat Konseling', roles: R, render: history },
  's/konseling/riwayat/:id': { title: 'Detail Riwayat', roles: R, render: historyDetail },
  's/konseling/pesan': { title: 'Pesan', roles: R, render: studentMessages, after: scrollBubbles },
  's/profil': { title: 'Profil & Privasi', roles: R, render: profileView },
};
export { scrollBubbles, ago };
