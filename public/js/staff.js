// Aplikasi Konselor & Admin.
import { state, api, download, esc, actions, forms, changeHandlers, inputHandlers, openModal, closeModal, toast, fmtDate, fmtDT, ago, lineChart, bars, dimBars, indexTrend, interpretView, quadrantMap, toneCat, normDesc, scaleLabel, riskChip, domainName, domainLabel, empty, toLocalInput, confirmBox, kwLabel, radarChart } from './core.js';
import { I } from './icons.js';
import { rerender } from './app.js';
import { messagesView, profileView, scrollBubbles, groupDiscussion, peerBadge } from './student.js';
import { adminMonitoring, adminPsikometrik, contentAnalytics } from './admin.js';

const K = ['konselor']; const ALL = ['konselor', 'admin', 'koordinator']; const A = ['admin']; const KO = ['koordinator'];
export function staffNav(role) {
  const items = {
    konselor: [['#/c/dashboard', 'Dashboard', I.grid], ['#/c/asesmen', 'Asesmen IKDKM-M', I.clip], ['#/c/konten', 'Psikoedukasi', I.folder], ['#/c/mahasiswa', 'Profil Mahasiswa', I.user], ['#/c/konseling', 'Konseling', I.desk, ['#/c/meja', '#/c/pesan', '#/c/pengaturan']], ['#/c/laporan', 'Laporan Komunal', I.chart], ['#/c/komunitas', 'Komunitas', I.people], ['#/c/kinerja', 'Evaluasi & Kinerja', I.star]],
    admin: [['#/a/asesmen', 'Asesmen', I.clip], ['#/a/psikometrik', 'Psikometrik', I.chart], ['#/a/konten', 'Konten Psikoedukasi', I.folder], ['#/a/koordinator', 'Pendaftar Koordinator', I.people], ['#/a/panjalu', 'Konselor PAN-JALU', I.shield], ['#/a/home', 'Web Home & Profil', I.home]],
    koordinator: [['#/k/dashboard', 'Dashboard', I.grid], ['#/k/konselor', 'Verifikasi Konselor', I.shield], ['#/k/jadwal', 'Jadwal Konselor', I.calendar], ['#/k/prodi', 'Fakultas & Prodi', I.book], ['#/k/darurat', 'Kasus Darurat', I.alert], ['#/k/laporan', 'Laporan Komunal', I.chart]],
  }[role];
  return items.map(([href, label, ico, alt]) => ({ href, label, ico, alt }));
}
const studentLink = (id, nama) => `<a href="#/c/mahasiswa/${id}">${esc(nama)}</a>`;
const short = (d) => new Date(d).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', timeZone: 'Asia/Jakarta' });
const kdChips = (x) => (x?.skor_total != null ? `<span class="chip ${toneCat(x.kategori_total)}" title="Indeks Kekuatan Mental (28–112)">Indeks ${x.skor_total} · ${esc(x.kategori_total)}</span>` : '<span class="muted">Belum asesmen</span>');
const kdTrend = (rows, height = 150) => indexTrend(rows, { height });
const typeLabel = (t) => state.ref.content_types[t] || t;
const catLabel = (k) => state.ref.content_categories.find((c) => c.kode === k)?.label || k;
const segeraChip = (x) => (x ? '<span class="chip crit">Butuh bantuan segera</span>' : '');

// ================= Dashboard konselor =================
// Kartu klaim rangkap Koordinator Layanan BK (kampus belum memiliki koordinator; wajib disetujui admin)
function claimCard(cl) {
  if (!cl) return '';
  const c = cl.klaim;
  if (c?.status === 'disetujui') return `<section class="card claim-card ok"><div class="claim-ico" aria-hidden="true">🏛️</div><div><h3>Anda merangkap Koordinator Layanan BK</h3><p class="small">Disetujui admin ${c.ditinjau_pada ? fmtDate(c.ditinjau_pada) : ''}. Gunakan pengalih <b>Konselor | Koordinator BK</b> di menu samping untuk membuka menu koordinator (verifikasi konselor, jadwal, fakultas & prodi, kasus darurat, laporan kampus).</p>
    <div class="row wrap"><button class="btn primary sm" data-act="switchMode" data-m="koordinator">Buka mode Koordinator</button><button class="btn ghost sm" data-act="claimCancel" data-k="lepas">Lepas peran koordinator</button></div></div></section>`;
  if (c?.status === 'menunggu') return `<section class="card claim-card warn"><div class="claim-ico" aria-hidden="true">⏳</div><div><h3>Pengajuan Koordinator Layanan BK menunggu persetujuan admin</h3><p class="small">Diajukan ${fmtDT(c.diajukan_pada)}. Alasan: “${esc(c.alasan || '')}”. Anda akan menerima notifikasi dan email setelah admin memutuskan.</p>
    <button class="btn ghost sm" data-act="claimCancel" data-k="batal">Batalkan pengajuan</button></div></section>`;
  if (!cl.bisa_mengajukan) return '';
  const prev = c && ['ditolak', 'dicabut'].includes(c.status) ? `<div class="notice warn small">Pengajuan sebelumnya ${c.status === 'ditolak' ? 'ditolak' : 'dicabut'} admin${c.catatan ? `: “${esc(c.catatan)}”` : '.'} Anda dapat mengajukan kembali.</div>` : '';
  return `<section class="card claim-card"><div class="claim-ico" aria-hidden="true">🏛️</div><div><h3>Kampus Anda belum memiliki Koordinator Layanan BK</h3>
    <p class="small">Anda dapat mengajukan diri untuk <b>merangkap</b> sebagai Koordinator Layanan BK ${esc(cl.kampus || '')} tanpa kehilangan peran konselor. Pengajuan <b>wajib disetujui admin</b>. Koordinator memverifikasi konselor baru, mengatur jadwal layanan, mengelola fakultas & prodi, memastikan kasus darurat tertangani, dan membaca laporan komunal kampus (data agregat tanpa identitas mahasiswa).</p>${prev}
    <form data-form="claimSubmit" class="stack"><label>Alasan pengajuan<textarea name="alasan" rows="2" required minlength="10" maxlength="1000" placeholder="Contoh: saya ketua unit layanan konseling dan bersedia mengoordinasikan layanan BK kampus."></textarea></label>
    <div class="row end"><button class="btn primary" type="submit">Ajukan ke admin</button></div></form></div></section>`;
}
forms.claimSubmit = async (d) => { await api('/coord-claim', { method: 'POST', body: d }); toast('Pengajuan dikirim ke admin. Anda akan diberi tahu setelah diputuskan.'); rerender(); };
actions.claimCancel = async (el) => {
  const lepas = el.dataset.k === 'lepas';
  if (!(await confirmBox(lepas ? 'Lepas peran Koordinator Layanan BK? Menu koordinator tidak lagi tersedia untuk akun Anda; kampus dapat mengajukan koordinator baru.' : 'Batalkan pengajuan Koordinator Layanan BK?', { ok: lepas ? 'Lepas peran' : 'Batalkan pengajuan' }))) return;
  await api('/coord-claim/me', { method: 'DELETE' });
  if (lepas) { try { localStorage.setItem('pj_mode', 'konselor'); } catch { /* */ } location.reload(); return; }
  toast('Pengajuan dibatalkan.'); rerender();
};

// Kartu Konselor PAN-JALU (melayani mahasiswa lintas kampus; wajib disetujui admin)
function pjCard(pj) {
  if (!pj) return '';
  const p = pj.pengajuan;
  if (p?.status === 'aktif') return `<section class="card claim-card ok"><div class="claim-ico" aria-hidden="true">🌐</div><div><h3>Anda Konselor PAN-JALU</h3><p class="small">Mahasiswa dari kampus mana pun dapat memilih Anda. Saat ini <b>${pj.konseli}</b> dari kapasitas <b>${p.kapasitas}</b> konseli PAN-JALU; mereka tampil di menu <a href="#/c/mahasiswa">Profil Mahasiswa</a> dengan label kampus asal. Kasus darurat konseli Anda — dan kasus darurat dari kampus tanpa konselor saat Anda berstatus jaga — dikirim ke Anda.</p>
    ${p.independen ? '' : '<button class="btn ghost sm" data-act="pjLeave" data-k="lepas">Lepas status Konselor PAN-JALU</button>'}</div></section>`;
  if (p?.status === 'menunggu') return `<section class="card claim-card warn"><div class="claim-ico" aria-hidden="true">⏳</div><div><h3>Pengajuan Konselor PAN-JALU menunggu persetujuan admin</h3><p class="small">Diajukan ${fmtDT(p.diajukan_pada)}.</p><button class="btn ghost sm" data-act="pjLeave" data-k="batal">Batalkan pengajuan</button></div></section>`;
  if (!pj.bisa_mengajukan) return '';
  const prev = p && ['ditolak', 'dicabut'].includes(p.status) ? `<div class="notice warn small">Status/pengajuan sebelumnya ${p.status} admin${p.catatan ? `: “${esc(p.catatan)}”` : '.'}</div>` : '';
  return `<details class="card claim-card"><summary class="claim-sum"><span class="claim-ico" aria-hidden="true">🌐</span><span><b>Jadi Konselor PAN-JALU</b><small class="muted"> — dampingi mahasiswa dari kampus yang belum memiliki konselor</small></span></summary><div>
    <p class="small">Konselor PAN-JALU dapat dipilih langsung oleh mahasiswa dari kampus mana pun. Mahasiswa yang memilih Anda memberikan persetujuan akses data asesmen & perkembangannya, dan dapat mengganti konselornya kapan saja. Peran konselor kampus Anda tetap berjalan. Pengajuan <b>wajib disetujui admin</b>.</p>${prev}
    <form data-form="pjApply" class="stack"><label>Alasan & pengalaman pendampingan<textarea name="alasan" rows="2" required minlength="10" maxlength="1000"></textarea></label><div class="row end"><button class="btn primary" type="submit">Ajukan ke admin</button></div></form></div></details>`;
}
forms.pjApply = async (d) => { await api('/panjalu/apply', { method: 'POST', body: d }); toast('Pengajuan Konselor PAN-JALU dikirim ke admin.'); rerender(); };
actions.pjLeave = async (el) => {
  const lepas = el.dataset.k === 'lepas';
  if (!(await confirmBox(lepas ? 'Lepas status Konselor PAN-JALU? Seluruh konseli PAN-JALU Anda akan diminta memilih konselor baru dan akses Anda ke data mereka berakhir.' : 'Batalkan pengajuan Konselor PAN-JALU?', { ok: lepas ? 'Lepas status' : 'Batalkan' }))) return;
  const r = await api('/panjalu/me', { method: 'DELETE' }); toast(lepas ? `Status dilepas; ${r.konseli_dilepas} konseli diberi tahu.` : 'Pengajuan dibatalkan.'); rerender();
};

async function dashboard() {
  const [d, me, cl, pj] = await Promise.all([api('/dashboard/counselor'), api('/counselor-profile/me'), api('/coord-claim/me').catch(() => null), api('/panjalu/me').catch(() => null)]);
  const k = d.kpi;
  const kpi = (label, val, tone, href) => `<a class="kpi ${tone}" href="${href}"><span>${label}</span><b>${val}</b></a>`;
  return `<div class="row between wrap"><div><span class="eyebrow">Lingkup kewenangan: ${d.lingkup.join(', ') || 'klien sendiri'}</span><h1>Halo, ${esc(state.user.nama)}</h1></div>
    <label class="switch"><input type="checkbox" data-change="dutyToggle" ${me.status_jaga ? 'checked' : ''}><span></span>Status jaga ${me.status_jaga ? 'aktif' : 'nonaktif'}</label></div>
  ${claimCard(cl)}${pjCard(pj)}
  <div class="kpis">${kpi('Butuh bantuan segera', k.risiko_tinggi_aktif, k.risiko_tinggi_aktif ? 'crit' : 'ok', '#/c/dashboard')}${kpi('Reservasi baru', k.reservasi_baru, k.reservasi_baru ? 'warn' : '', '#/c/meja')}${kpi('Entri jurnal (7 hari)', k.entri_jurnal_7hari, '', '#/c/mahasiswa')}${kpi('Workbook aktif (30 hari)', k.workbook_aktif, '', '#/c/mahasiswa')}</div>
  ${d.alerts.length ? `<section class="card alert-panel"><h3>Konseli yang menyatakan butuh bantuan segera</h3><p class="small">SLA institusi: ${d.sla_menit} menit. Hubungi mahasiswa, pastikan keamanannya, lalu tandai ditindaklanjuti dengan catatan tindakan.</p>
    ${d.alerts.map((a) => { const mins = Math.round((Date.now() - new Date(a.dibuat)) / 60000); const over = mins > d.sla_menit; return `<div class="alert-row ${over ? 'over' : ''}"><div><b>${studentLink(a.student_id, a.nama)}</b>${a.ditugaskan ? ` <span class="chip ${a.ditugaskan.saya ? 'crit' : ''}">Ditugaskan koordinator ke ${a.ditugaskan.saya ? 'Anda' : esc(a.ditugaskan.nama)}</span>` : ''}<span class="small">Terdeteksi ${ago(a.dibuat)} dari ${esc(a.sumber)} ${over ? `· <b>melewati SLA${a.dieskalasi ? ', sudah dieskalasi ke penanggung jawab layanan' : ''}</b>` : `· sisa ${d.sla_menit - mins} menit`}</span></div>
      <button class="btn crit sm" data-act="ackAlert" data-id="${a.id}">Tandai ditindaklanjuti</button></div>`; }).join('')}</section>` : ''}
  <div class="grid-2 wide-left">
    <section class="card"><h3>Aktivitas mahasiswa terkini</h3>${d.aktivitas.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Mahasiswa</th><th>Aktivitas</th><th>Detail</th><th>Waktu</th></tr></thead><tbody>${d.aktivitas.map((a) => `<tr><td>${studentLink(a.student_id, a.nama)}</td><td>${esc(a.aktivitas)}</td><td>${esc(a.detail)} ${riskChip(a.risk)}</td><td class="muted small">${ago(a.waktu)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Belum ada aktivitas 7 hari terakhir.</p>'}</section>
    <div class="stack">
      <section class="card"><h3>Jadwal hari ini</h3>${d.jadwal_hari_ini.length ? d.jadwal_hari_ini.map((a) => `<a class="mini-row" href="#/c/meja/${a.id}"><b class="mono">${new Date(a.jadwal).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })}</b><span>${esc(a.nama)} · ${esc(a.topik)}</span></a>`).join('') : '<p class="muted small">Tidak ada sesi terkonfirmasi hari ini.</p>'}</section>
      <section class="card"><div class="row between"><h3>Pesan masuk</h3><a class="small" href="#/c/pesan">Buka</a></div>${d.pesan_masuk.length ? d.pesan_masuk.slice(0, 5).map((m) => `<a class="mini-row" href="#/c/pesan" data-act="openThread" data-id="${m.sender_id}"><b>${esc(m.nama)}</b><span>${esc(m.cuplikan)}</span><small class="muted">${ago(m.waktu)}</small></a>`).join('') : '<p class="muted small">Tidak ada pesan belum dibaca.</p>'}</section>
      <section class="card"><h3>Tugas monitoring</h3>${d.tugas.length ? d.tugas.map((t) => `<div class="mini-row"><span><b>${esc(t.judul)}</b>${t.nama ? ` · ${esc(t.nama)}` : ''}<small class="muted"> jatuh tempo ${fmtDate(t.jatuh_tempo)}</small></span><button class="btn ghost sm" data-act="taskDone" data-id="${t.id}">Selesai</button></div>`).join('') : '<p class="muted small">Tidak ada tugas terbuka.</p>'}</section>
      ${d.risiko_kuning.length ? `<section class="card"><h3>Perlu dipantau</h3>${d.risiko_kuning.map((y) => `<div class="mini-row">${studentLink(y.student_id, y.nama)}<small class="muted">${ago(y.created_at)}</small></div>`).join('')}</section>` : ''}
    </div>
  </div>`;
}
changeHandlers.dutyToggle = async (el) => { await api('/counselor-profile/me', { method: 'PATCH', body: { status_jaga: el.checked } }); toast(el.checked ? 'Status jaga aktif — Anda akan menerima eskalasi krisis.' : 'Status jaga nonaktif.'); rerender(); };
actions.ackAlert = (el) => openModal(`<h3>Catat tindak lanjut krisis</h3><form data-form="ackAlert" data-id="${el.dataset.id}" class="stack"><label>Tindakan yang sudah dilakukan<textarea id="ack_note" name="catatan" rows="4" required placeholder="Contoh: Menelepon mahasiswa pukul 10.20, kondisi aman bersama keluarga, janji temu besok 09.00, safety plan disusun."></textarea></label><div class="row end"><button class="btn crit" type="submit">Simpan & tandai ditindaklanjuti</button></div></form>`);
forms.ackAlert = async (d, f) => { await api(`/alerts/${f.dataset.id}/ack`, { method: 'POST', body: d }); closeModal(); toast('Tindak lanjut tercatat.'); rerender(); };
actions.taskDone = async (el) => { await api(`/tasks/${el.dataset.id}/done`, { method: 'POST' }); rerender(); };
actions.openThread = (el) => { MSGW.with = el.dataset.id; location.hash = '#/c/pesan'; };
const MSGW = { with: null };

// ================= Daftar & Profil Mahasiswa =================
let studentQ = ''; let dF = '';
async function students() {
  const d = await api('/students');
  const list = d.items.filter((s) => (!studentQ || `${s.nama} ${s.nim} ${s.prodi}`.toLowerCase().includes(studentQ.toLowerCase()))
    && (!dF || (dF === 'segera' ? s.risk_alert === 'red' : dF === 'none' ? s.skor_total == null : s.kategori_total === dF)));
  return `<div class="row between wrap"><div><span class="eyebrow">Lingkup: ${d.lingkup.join(', ')} + klien Anda + kasus krisis terbuka saat jaga</span><h1>Profil Mahasiswa</h1></div>
    <form data-form="studentFilter" class="row wrap"><input id="st_q" name="q" type="search" placeholder="Cari nama, NIM, prodi" value="${esc(studentQ)}"><select id="st_d" name="d"><option value="">Semua</option><option value="segera" ${dF === 'segera' ? 'selected' : ''}>Butuh bantuan segera</option>${['Krisis', 'Rentan', 'Tangguh'].map((k) => `<option value="${k}" ${dF === k ? 'selected' : ''}>Indeks: ${k}</option>`).join('')}<option value="none" ${dF === 'none' ? 'selected' : ''}>Belum asesmen</option></select><button class="btn ghost" type="submit">Terapkan</button></form></div>
  <section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Mahasiswa</th><th>Prodi</th><th>Angkatan</th><th>Hasil IKDKM-M terakhir</th><th>Dimensi melemah</th><th>Asesmen terakhir</th></tr></thead><tbody>
  ${list.map((s) => `<tr><td>${studentLink(s.id, s.nama)}${s.disamarkan ? ' <span class="chip">disamarkan</span>' : ''}${s.kampus_lain ? ' <span class="chip info" title="Konseli PAN-JALU dari kampus lain">PAN-JALU</span>' : ''}<br><small class="mono muted">${esc(s.nim || '')}</small></td><td>${esc(s.prodi || '')}${s.kampus_lain ? `<br><small class="muted">${esc(s.kampus_lain)}</small>` : ''}</td><td>${s.angkatan || ''}${s.kelas ? '-' + esc(s.kelas) : ''}</td><td>${kdChips(s)} ${segeraChip(s.risk_alert === 'red')}</td><td class="num">${s.pelemahan ?? '—'}</td><td class="small muted">${s.terakhir_asesmen ? ago(s.terakhir_asesmen) : '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Tidak ada mahasiswa yang cocok.</td></tr>'}
  </tbody></table></div></section>`;
}
forms.studentFilter = (d) => { studentQ = d.q || ''; dF = d.d || ''; rerender(); };

let pTab = 'ringkasan';
async function profile({ id }) {
  const p = await api(`/students/${id}/profile`);
  const s = p.student; const a = p.asesmen_terakhir; const j = p.jadwal_asesmen;
  const tabs = [['ringkasan', 'Ringkasan & Asesmen'], ['jurnal', 'Refleksi GURU, Konten & Jurnal'], ['relaksasi', 'Aktivitas Relaksasi'], ['catatan', 'Catatan Konseling'], ['pribadi', 'Data Pribadi']];
  let body = '';
  if (pTab === 'ringkasan') body = `<div class="grid-2">
    <section class="card"><div class="row between"><h3>Ringkasan profil</h3>${p.ai_tersedia && a ? `<button class="btn sm" data-act="aiProfile" data-id="${s.id}">Analisis lanjut via AI</button>` : ''}</div>
      <div id="aiDraft"></div>
      ${p.ringkasan ? `<p class="pre">${esc(p.ringkasan.ringkasan)}</p><p class="small muted">${p.ringkasan.sumber === 'ai_ditinjau' ? 'Draf AI yang telah ditinjau & disetujui' : 'Ditulis'} oleh ${esc(p.ringkasan.penulis || '')} · ${fmtDT(p.ringkasan.created_at)}</p>` : '<p class="muted">Belum ada ringkasan naratif.</p>'}
      <details><summary class="small">Tulis ringkasan manual</summary><form data-form="summary" data-id="${s.id}" class="stack"><textarea id="sum_text" name="ringkasan" rows="4" required></textarea><button class="btn sm" type="submit">Simpan ringkasan</button></form></details>
      ${a ? `<h4>Profil pelemahan (Glasser)</h4>${a.klaim?.length ? `<ul class="plain small">${a.klaim.map((k) => `<li><b>${esc(k.nama)}.</b> ${esc(k.klaim)}</li>`).join('')}</ul>` : '<p class="muted small">Tidak ada dimensi yang melemah.</p>'}<p class="small"><b>Posisi:</b> ${esc(state.ref.quadrants[a.kuadran]?.nama || '-')} · <b>Siap dukungan:</b> ${a.dukungan.filter((x) => x.siap).map((x) => esc(x.nama)).join(', ') || 'belum ada'}</p>` : ''}
      ${j?.interval_hari ? `<p class="small">Jadwal pengisian: setiap <b>${j.interval_hari} hari</b> · <span class="chip ${j.status === 'sudah' ? 'ok' : j.status === 'jatuh_tempo' ? 'warn' : ''}">${{ sudah: 'Sudah mengisi', jatuh_tempo: 'Jatuh tempo', belum: 'Belum pernah' }[j.status]}</span>${j.jatuh_tempo ? ` · berikutnya ${fmtDate(j.jatuh_tempo)}` : ''}</p>` : ''}</section>
    <section class="card">${a ? `<div class="row between wrap"><div>${kdChips(a)} ${segeraChip(a.penanda.butuh_bantuan_segera)}<p class="small muted">Asesmen ${fmtDT(a.diisi_pada)}</p></div><a class="btn sm" href="#/c/asesmen/${a.id}">Detail & rekomendasi</a></div>
      ${dimBars(a.dimensi)}
      ${p.riwayat.length > 1 ? `<h4>Perkembangan indeks</h4>${kdTrend(p.riwayat, 140)}` : ''}` : empty('Belum ada asesmen')}</section></div>
    ${p.alerts.length ? `<section class="card"><h3>Riwayat penanda butuh bantuan segera</h3><ul class="plain">${p.alerts.map((x) => `<li>${riskChip(x.level)} ${fmtDT(x.created_at)} · ${x.ditindaklanjuti_pada ? `ditindaklanjuti ${fmtDT(x.ditindaklanjuti_pada)}` : '<b>belum ditindaklanjuti</b>'}</li>`).join('')}</ul></section>` : ''}`;
  if (pTab === 'jurnal') body = `<div class="grid-2"><section class="card"><h3>Refleksi GURU per konten</h3>${p.workbook.map((w) => `<details class="entry"><summary><span class="chip">${esc(domainLabel(w.domain_id))}</span> <b>${esc(w.konten?.[0] || w.tahap)}</b>${w.keluaran ? ` · ${esc(w.keluaran)}` : ' · belum lengkap'} <span class="muted small">${fmtDT(w.tanggal)}</span></summary>${w.konten?.length ? `<p class="small">Berdasarkan konten: ${w.konten.map(esc).join(', ')}</p>` : ''}<pre class="pre">${esc(w.isi_teks)}</pre></details>`).join('') || '<p class="muted">Belum ada entri.</p>'}
      <h4>Konten psikoedukasi yang diakses</h4>${p.konten_diakses.length ? `<ul class="plain">${p.konten_diakses.map((c) => `<li><b>${esc(c.judul)}</b> <small class="muted">${esc(typeLabel(c.tipe))} · ${c.kali}× · terakhir ${ago(c.terakhir)}</small></li>`).join('')}</ul>` : '<p class="muted small">Belum ada.</p>'}</section>
    <section class="card"><h3>Jurnal harian (ringkasan)</h3><p class="small muted">Hanya mood dan cuplikan singkat yang ditampilkan untuk menjaga privasi mahasiswa.</p>${p.jurnal.map((x) => `<div class="mini-row"><span class="mood-dot ${x.mood}"></span><span><b>${fmtDate(x.tanggal)}</b> ${esc(x.cuplikan)}</span></div>`).join('') || '<p class="muted">Belum ada jurnal.</p>'}
      <h4>Goals</h4><ul class="checklist">${p.goals.map((g) => `<li class="${g.selesai ? 'done' : ''}"><span>${g.selesai ? '✓' : '○'}</span><span>${esc(g.isi_teks)} <small class="muted mono">${esc(g.minggu_ke)}</small></span></li>`).join('') || '<li class="muted">Belum ada.</li>'}</ul></section></div>`;
  if (pTab === 'relaksasi') body = `<div class="kpis"><div class="kpi"><span>Total sesi</span><b>${p.mindfulness.total_sesi}</b></div><div class="kpi"><span>Total menit</span><b>${p.mindfulness.total_menit}</b></div><div class="kpi"><span>Check-in emosi</span><b>${p.mood.length}</b></div></div>
    <div class="grid-2"><section class="card"><h3>Riwayat aktivitas</h3><table class="table"><thead><tr><th>Aktivitas</th><th>Durasi</th><th>Waktu</th></tr></thead><tbody>${p.mindfulness.riwayat.map((l) => `<tr><td>${esc(l.jenis_aktivitas)}</td><td class="num">${Math.round(l.durasi_detik / 60)} mnt</td><td class="small muted">${fmtDT(l.waktu)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada.</td></tr>'}</tbody></table></section>
    <section class="card"><h3>Mood check-in</h3>${lineChart([...p.mood].reverse().map((m) => ({ label: fmtDT(m.waktu), short: short(m.waktu), value: m.mood })), { min: 1, max: 5, unit: '' })}</section></div>`;
  if (pTab === 'catatan') body = `<div class="grid-2"><section class="card"><h3>Catatan profesional konselor <span class="chip">rahasia</span></h3><form data-form="note" data-id="${s.id}" class="stack"><textarea id="note_text" name="catatan" rows="8">${esc(p.catatan?.catatan || '')}</textarea><div class="row between"><small class="muted">${p.catatan ? `Diperbarui ${fmtDT(p.catatan.diperbarui_pada)}` : 'Belum ada catatan'} · terenkripsi, tidak tampil ke konseli</small><button class="btn sm" type="submit">Simpan catatan</button></div></form></section>
    <section class="card"><h3>Rencana intervensi</h3>${p.intervensi.map((i) => `<div class="mini-row"><span><span class="chip ${i.prioritas === 'krisis' ? 'crit' : i.prioritas === 'tinggi' ? 'warn' : ''}">${esc(i.prioritas)}</span> ${esc(i.deskripsi)}<small class="muted"> · ${esc(i.oleh || 'sistem')} · ${fmtDate(i.created_at)}</small></span><select data-change="intvStatus" data-id="${i.id}" aria-label="Status intervensi">${['aktif', 'selesai', 'dibatalkan'].map((x) => `<option ${x === i.status ? 'selected' : ''}>${x}</option>`).join('')}</select></div>`).join('') || '<p class="muted">Belum ada.</p>'}
      <form data-form="intvAdd" data-id="${s.id}" class="row wrap"><input id="intv_text" name="deskripsi" placeholder="Rencana intervensi baru" required><select id="intv_pri" name="prioritas"><option>normal</option><option>tinggi</option><option>krisis</option></select><button class="btn sm" type="submit">Tambah</button></form>
      <h4>Riwayat pertemuan</h4><table class="table"><tbody>${p.pertemuan.map((m) => `<tr><td>${fmtDT(m.jadwal)}</td><td>${esc(m.topik)}</td><td>${esc(m.konselor)}</td><td><span class="chip">${esc(m.status)}</span>${m.tindak_lanjut ? ` <small>${esc(m.tindak_lanjut)}</small>` : ''}</td></tr>`).join('') || '<tr><td class="muted">Belum ada.</td></tr>'}</tbody></table></section></div>`;
  if (pTab === 'pribadi') body = `<section class="card"><dl class="kv"><dt>Nama</dt><dd>${esc(s.nama)}</dd><dt>NIM</dt><dd class="mono">${esc(s.nim)}</dd><dt>Program studi</dt><dd>${esc(s.prodi || '')}</dd><dt>Fakultas</dt><dd>${esc(s.fakultas_nama || '')}</dd><dt>Angkatan / kelas</dt><dd>${s.angkatan || ''} / ${esc(s.kelas || '')}</dd><dt>Jenis kelamin</dt><dd>${s.gender === 'P' ? 'Perempuan' : s.gender === 'L' ? 'Laki-laki' : '—'}</dd><dt>Tanggal lahir</dt><dd>${fmtDate(s.tanggal_lahir)}</dd><dt>Email</dt><dd>${esc(s.email || '')}</dd><dt>Telepon</dt><dd class="mono">${esc(s.telepon || '')}</dd><dt>Alamat</dt><dd>${esc(s.alamat || '')}</dd></dl></section>`;
  return `<a class="small" href="#/c/mahasiswa">← Daftar mahasiswa</a>
  <div class="row between wrap"><div><h1>${esc(s.nama)} ${s.disamarkan ? '<span class="chip">identitas disamarkan</span>' : ''}</h1><p class="muted">${esc(s.prodi || '')} · ${s.angkatan || ''} · <span class="mono">${esc(s.nim)}</span></p></div><span class="chip">Dasar akses: ${esc(p.dasar_akses.replace(/_/g, ' '))}</span></div>
  <div class="tabs">${tabs.map(([k, l]) => `<a href="#" class="${pTab === k ? 'on' : ''}" data-act="pTab" data-k="${k}">${l}</a>`).join('')}</div>${body}`;
}
actions.pTab = (el) => { pTab = el.dataset.k; rerender(); };
forms.note = async (d, f) => { await api(`/students/${f.dataset.id}/notes`, { method: 'PUT', body: d }); toast('Catatan disimpan.'); };
forms.summary = async (d, f) => { await api(`/students/${f.dataset.id}/summary`, { method: 'PUT', body: d }); toast('Ringkasan disimpan.'); rerender(); };
forms.intvAdd = async (d, f) => { await api(`/students/${f.dataset.id}/interventions`, { method: 'POST', body: d }); rerender(); };
changeHandlers.intvStatus = async (el) => { await api(`/interventions/${el.dataset.id}`, { method: 'PATCH', body: { status: el.value } }); toast('Status intervensi diperbarui.'); };

function aiDraftBox(r, target) {
  return `<div class="ai-draft"><div class="row between"><span class="chip warn">Draf — Belum Ditinjau</span><small class="muted">${r.mode === 'model' ? 'Dihasilkan model bahasa' : 'Dihasilkan generator berbasis aturan (kunci API AI belum diset)'}</small></div>
    <textarea id="ai_text" rows="8">${esc(r.hasil)}</textarea><p class="small muted">Periksa dan sunting sebelum menyetujui. Keluaran AI bukan diagnosis dan tidak boleh menjadi dasar keputusan rujukan atau krisis tanpa penilaian Anda.</p>
    <div class="row end"><button class="btn ghost sm" data-act="aiReview" data-id="${r.id}" data-a="reject" data-t="${target}">Tolak</button><button class="btn primary sm" data-act="aiReview" data-id="${r.id}" data-a="approve" data-t="${target}">Setujui & Simpan</button></div></div>`;
}
actions.aiProfile = async (el) => { el.disabled = true; const r = await api('/ai/profile-summary', { method: 'POST', body: { student_id: el.dataset.id } }).finally(() => { el.disabled = false; }); document.getElementById('aiDraft').innerHTML = aiDraftBox(r, 'profile'); };
actions.aiReview = async (el) => {
  const teks = document.getElementById('ai_text').value;
  const r = await api(`/ai/requests/${el.dataset.id}/review`, { method: 'POST', body: { action: el.dataset.a, teks } });
  if (el.dataset.t === 'desk' && el.dataset.a === 'approve') { const t = document.getElementById('ds_teknik'); if (t) t.value = (t.value ? t.value + '\n\n' : '') + r.teks; document.getElementById('aiDraft').innerHTML = '<p class="small ok-text">Saran disetujui dan ditambahkan ke catatan Penyelesaian Masalah. Simpan catatan sesi untuk merekamnya.</p>'; return; }
  toast(el.dataset.a === 'approve' ? 'Draf disetujui dan tersimpan.' : 'Draf ditolak.');
  if (el.dataset.t === 'profile') rerender(); else document.getElementById('aiDraft').innerHTML = '';
};

// ================= Asesmen IKDKM-M: monitoring, jadwal, hasil & rekomendasi =================
const FAKS = () => (state.campus?.fakultas || []).map((f) => f.kode); // kode fakultas kampus pengguna
const YEARS = [2021, 2022, 2023, 2024, 2025, 2026];
const CAKUPAN = [['semua', 'Seluruh konseli'], ['fakultas', 'Fakultas'], ['prodi', 'Program studi'], ['angkatan', 'Angkatan'], ['individu', 'Individu']];
const ASTAT = { sudah: ['Sudah mengisi', 'ok'], jatuh_tempo: ['Jatuh tempo', 'warn'], belum: ['Belum pernah', 'crit'] };
const intervalLabel = (n) => (n === 7 ? 'Mingguan (7 hari)' : n === 14 ? 'Dua mingguan (14 hari)' : n === 30 ? 'Bulanan (30 hari)' : `Setiap ${n} hari`);
const AF = { tab: 'status', fakultas: '', prodi: '', angkatan: '', status: '', q: '' };
let MONITOR = [];
function targetField(cakupan, prefix, cur = '') {
  if (cakupan === 'semua') return '<p class="small muted">Berlaku untuk seluruh konseli dalam kewenangan Anda.</p>';
  const opts = {
    fakultas: (state.campus?.fakultas || []).map((f) => [f.kode, f.nama]),
    prodi: state.pub.prodi.map((p) => [p.id, `${p.nama} (${p.jenjang})`]),
    angkatan: YEARS.map((y) => [String(y), String(y)]),
    individu: MONITOR.map((s) => [s.id, `${s.nama} · ${s.nim}`]),
  }[cakupan];
  return `<label>Target<select id="${prefix}_target" name="target" required><option value="">Pilih…</option>${opts.map(([v, l]) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
}
changeHandlers.cakupanPick = (el) => { document.getElementById(`${el.dataset.p}_tgt`).innerHTML = targetField(el.value, el.dataset.p); };
changeHandlers.intervalPick = (el) => { const c = document.getElementById(`${el.dataset.p}_custom`); c.hidden = el.value !== 'custom'; c.querySelector('input').required = el.value === 'custom'; };

async function assessAdmin() {
  const qs = new URLSearchParams({ ...(AF.fakultas && { fakultas: AF.fakultas }), ...(AF.prodi && { prodi: AF.prodi }), ...(AF.angkatan && { angkatan: AF.angkatan }) });
  const [m, sch] = await Promise.all([api(`/assessment-monitor?${qs}`), api('/assessment-schedules')]);
  if (!AF.fakultas && !AF.prodi && !AF.angkatan) MONITOR = m.items;
  const tabs = `<div class="tabs">${[['status', 'Status pengisian'], ['jadwal', 'Jadwal & pengingat']].map(([k, l]) => `<a href="#" class="${AF.tab === k ? 'on' : ''}" data-act="afTab" data-k="${k}">${l}</a>`).join('')}</div>`;
  const r = m.ringkasan;
  let body = '';
  if (AF.tab === 'status') {
    const list = m.items.filter((s) => (!AF.status || s.status === AF.status) && (!AF.q || `${s.nama} ${s.nim}`.toLowerCase().includes(AF.q.toLowerCase())));
    body = `<div class="kpis"><div class="kpi"><span>Konseli terpantau</span><b>${r.total}</b></div><a href="#" class="kpi ok" data-act="afStatus" data-s="sudah"><span>Sudah mengisi (sesuai jadwal)</span><b>${r.sudah}</b></a><a href="#" class="kpi warn" data-act="afStatus" data-s="jatuh_tempo"><span>Jatuh tempo</span><b>${r.jatuh_tempo}</b></a><a href="#" class="kpi ${r.belum ? 'crit' : ''}" data-act="afStatus" data-s="belum"><span>Belum pernah mengisi</span><b>${r.belum}</b></a></div>
    <form data-form="afFilter" class="filters row wrap"><input id="af_q" name="q" type="search" placeholder="Cari nama/NIM" value="${esc(AF.q)}">
      <select id="af_fak" name="fakultas"><option value="">Semua fakultas</option>${FAKS().map((f) => `<option ${AF.fakultas === f ? 'selected' : ''}>${f}</option>`).join('')}</select>
      <select id="af_prodi" name="prodi"><option value="">Semua prodi</option>${state.pub.prodi.map((p) => `<option value="${p.id}" ${AF.prodi === p.id ? 'selected' : ''}>${esc(p.nama)}</option>`).join('')}</select>
      <select id="af_angk" name="angkatan"><option value="">Semua angkatan</option>${YEARS.map((y) => `<option ${String(y) === AF.angkatan ? 'selected' : ''}>${y}</option>`).join('')}</select>
      <select id="af_st" name="status"><option value="">Semua status</option>${Object.entries(ASTAT).map(([k, [l]]) => `<option value="${k}" ${AF.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <button class="btn ghost" type="submit">Terapkan</button><span class="spacer"></span><button type="button" class="btn" data-act="remindMany" ${list.some((s) => s.status !== 'sudah') ? '' : 'disabled'}>Ingatkan yang belum mengisi (${list.filter((s) => s.status !== 'sudah').length})</button></form>
    <section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Konseli</th><th>Prodi · angkatan</th><th>Jadwal</th><th>Status</th><th>Riwayat</th><th>Hasil terakhir</th><th></th></tr></thead><tbody>
    ${list.map((s) => `<tr><td>${studentLink(s.id, s.nama)}<br><small class="mono muted">${esc(s.nim)}</small></td><td>${esc(s.prodi || '')} · ${s.angkatan || ''}</td><td class="small">${s.interval_hari ? intervalLabel(s.interval_hari) : '<span class="muted">Tidak dijadwalkan</span>'}${s.jatuh_tempo ? `<br><span class="muted">tenggat ${fmtDate(s.jatuh_tempo)}</span>` : ''}</td>
      <td><span class="chip ${ASTAT[s.status][1]}">${ASTAT[s.status][0]}</span></td><td class="small">${s.jumlah}× ${s.terakhir ? `<br><span class="muted">terakhir ${ago(s.terakhir)}</span>` : ''}</td>
      <td>${s.asesmen_terakhir ? `${kdChips(s.asesmen_terakhir)} ${segeraChip(s.asesmen_terakhir.segera)}` : '—'}</td>
      <td class="row">${s.asesmen_terakhir ? `<a class="btn ghost sm" href="#/c/asesmen/${s.asesmen_terakhir.id}">Hasil</a>` : ''}${s.status !== 'sudah' ? `<button class="btn ghost sm" data-act="remindOne" data-id="${s.id}">Ingatkan</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Tidak ada konseli yang cocok.</td></tr>'}
    </tbody></table></div></section>`;
  }
  if (AF.tab === 'jadwal') body = `<div class="grid-2 wide-left">
    <section class="card"><h3>Jadwal pengisian aktif</h3><p class="small muted">Jika ada beberapa jadwal, yang paling spesifik berlaku (individu → prodi → angkatan → fakultas → seluruh konseli). Konseli menerima notifikasi saat jatuh tempo.</p>
      ${sch.length ? sch.map((x) => `<div class="mini-row sched ${x.aktif ? '' : 'faded'}"><span><b>${esc(x.target_label)}</b> · ${intervalLabel(x.interval_hari)} <small class="muted">${x.jumlah_konseli} konseli · oleh ${esc(x.oleh)} · ${fmtDate(x.created_at)}</small>${x.pesan ? `<br><small>“${esc(x.pesan)}”</small>` : ''}</span>
        <span class="row"><button class="btn ghost sm" data-act="schEdit" data-id="${x.id}" data-n="${x.interval_hari}" data-pesan="${esc(x.pesan || '')}">Ubah</button><button class="btn ghost sm" data-act="schToggle" data-id="${x.id}" data-a="${x.aktif ? 0 : 1}">${x.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button></span></div>`).join('') : '<p class="muted">Belum ada jadwal.</p>'}</section>
    <div class="stack">
      <form data-form="schNew" class="card stack"><h3>Atur jadwal baru</h3>
        <label>Cakupan<select id="sn_cak" name="cakupan" data-change="cakupanPick" data-p="sn">${CAKUPAN.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <div id="sn_tgt">${targetField('semua', 'sn')}</div>
        <label>Rentang pengisian<select id="sn_int" name="interval" data-change="intervalPick" data-p="sn"><option value="7">Mingguan (7 hari)</option><option value="14">Dua mingguan (14 hari)</option><option value="30" selected>Bulanan (30 hari)</option><option value="custom">Lainnya (atur sendiri)</option></select></label>
        <label id="sn_custom" hidden>Setiap berapa hari?<input id="sn_days" name="interval_custom" type="number" min="1" max="365" placeholder="mis. 21"></label>
        <label>Pesan untuk konseli (opsional)<textarea id="sn_msg" name="pesan" rows="2" placeholder="Isi IKDKM-M agar perkembanganmu terpantau."></textarea></label>
        <label class="check"><input type="checkbox" name="kirim_sekarang" value="1" checked> Kirim notifikasi rekomendasi pengisian sekarang</label>
        <button class="btn primary" type="submit">Simpan jadwal</button></form>
      <form data-form="broadcast" class="card stack"><h3>Kirim pengingat sekali</h3>
        <label>Cakupan<select id="bc_cak" name="cakupan" data-change="cakupanPick" data-p="bc">${CAKUPAN.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <div id="bc_tgt">${targetField('semua', 'bc')}</div>
        <label>Pesan<textarea id="bc_msg" name="pesan" rows="2" required>Konselor merekomendasikan kamu mengisi asesmen IKDKM-M sekarang.</textarea></label>
        <button class="btn" type="submit">Kirim notifikasi</button></form>
    </div></div>`;
  return `<div class="row between wrap"><div><span class="eyebrow">Inventori Kebutuhan Dukungan Kekuatan Mental Mahasiswa</span><h1>Asesmen IKDKM-M</h1></div></div>${tabs}${body}`;
}
actions.afTab = (el) => { AF.tab = el.dataset.k; rerender(); };
actions.afStatus = (el) => { AF.status = AF.status === el.dataset.s ? '' : el.dataset.s; rerender(); };
forms.afFilter = (d) => { Object.assign(AF, { q: d.q || '', fakultas: d.fakultas || '', prodi: d.prodi || '', angkatan: d.angkatan || '', status: d.status || '' }); rerender(); };
const sendReminder = async (cakupan, target, pesan) => { const r = await api('/assessment-reminders/broadcast', { method: 'POST', body: { cakupan, target, pesan } }); toast(`Notifikasi terkirim ke ${r.terkirim} konseli.`); return r; };
actions.remindOne = async (el) => { el.disabled = true; await sendReminder('individu', el.dataset.id, 'Konselor merekomendasikan kamu mengisi asesmen IKDKM-M sekarang.'); };
actions.remindMany = async (el) => {
  const ids = MONITOR.filter((s) => s.status !== 'sudah' && (!AF.status || s.status === AF.status)).map((s) => s.id);
  const rows = [...document.querySelectorAll('[data-act=remindOne]')].map((b) => b.dataset.id).filter((id) => ids.includes(id));
  if (!(await confirmBox(`Kirim notifikasi pengisian ke ${rows.length} konseli?`, { ok: 'Kirim' }))) return;
  el.disabled = true; let n = 0;
  for (const id of rows) n += (await api('/assessment-reminders/broadcast', { method: 'POST', body: { cakupan: 'individu', target: id, pesan: 'Konselor merekomendasikan kamu mengisi asesmen IKDKM-M sekarang.' } })).terkirim;
  toast(`Notifikasi terkirim ke ${n} konseli.`);
};
const intervalOf = (d) => Number(d.interval === 'custom' ? d.interval_custom : d.interval);
forms.schNew = async (d) => {
  const r = await api('/assessment-schedules', { method: 'POST', body: { cakupan: d.cakupan, target: d.target, interval_hari: intervalOf(d), pesan: d.pesan, kirim_sekarang: !!d.kirim_sekarang } });
  toast(`Jadwal tersimpan${d.kirim_sekarang ? ` · notifikasi terkirim ke ${r.terkirim} konseli` : ''}.`); rerender();
};
forms.broadcast = async (d, f) => { await sendReminder(d.cakupan, d.target, d.pesan); f.reset(); };
actions.schToggle = async (el) => { await api(`/assessment-schedules/${el.dataset.id}`, { method: 'PATCH', body: { aktif: el.dataset.a === '1' } }); rerender(); };
actions.schEdit = (el) => openModal(`<h3>Ubah jadwal</h3><form data-form="schEdit" data-id="${el.dataset.id}" class="stack"><label>Setiap berapa hari?<input id="se_n" name="interval_hari" type="number" min="1" max="365" value="${el.dataset.n}" required></label><label>Pesan<textarea id="se_msg" name="pesan" rows="2">${esc(el.dataset.pesan)}</textarea></label><div class="row end"><button class="btn primary" type="submit">Simpan</button></div></form>`);
forms.schEdit = async (d, f) => { await api(`/assessment-schedules/${f.dataset.id}`, { method: 'PATCH', body: { interval_hari: Number(d.interval_hari), pesan: d.pesan } }); closeModal(); toast('Jadwal diperbarui.'); rerender(); };

// --- Detail hasil asesmen (konselor) ---
const REC_JENIS = { konten: 'Konten psikoedukasi', konseling: 'Konseling profesional', komunitas: 'Grup diskusi', workbook: 'Konten & Refleksi GURU (per dimensi)', relaksasi: 'Ruang Mindfulness', peer: 'Konselor sebaya', lainnya: 'Saran lain (tulis sendiri)' };
let RT = null;
async function assessDetail({ id }) {
  const [a, targets] = await Promise.all([api(`/assessments/${id}`), RT ? Promise.resolve(RT) : api('/recommendation-targets')]);
  RT = targets;
  const p = a.penanda; const hist = a.riwayat || [];
  const trig = new Set((a.butir_pemicu || []).map((b) => b.no));
  const PART = { 1: 'Bagian 1 · Pemenuhan 5 kebutuhan dasar', 2: 'Bagian 2 · Kendali diri & kebiasaan baik', 3: 'Bagian 3 · Kesiapan dukungan' };
  const score = (it, v) => (v ? (it.arah === '+' ? { SS: 4, S: 3, TS: 2, STS: 1 } : { SS: 1, S: 2, TS: 3, STS: 4 })[v] : null);
  return `<div class="row between wrap"><a class="small" href="#/c/mahasiswa/${a.user_id}">← Profil mahasiswa</a><div class="row"><span class="muted small">Diisi ${fmtDT(a.diisi_pada)}</span><button class="btn sm" data-act="assessPdfC" data-id="${a.id}">Unduh laporan PDF</button></div></div>
  ${p.butuh_bantuan_segera ? '<div class="notice crit"><b>Penanda butuh bantuan segera aktif</b> (indeks krisis/gejala emosional-fisiologis berat). Pastikan sudah ditindaklanjuti dari Dashboard.</div>' : a.perlu_kuratif ? '<div class="notice warn"><b>Perlu didampingi konselor:</b> sarankan reservasi konseling profesional (Reality Therapy).</div>' : ''}
  <section class="card result-hero"><div><span class="eyebrow">Hasil IKDKM-M · ${esc(a.tahap_layanan || '')}</span><h1>${esc(a.nama || 'Konseli')}</h1><p class="muted">${esc(a.prodi || '')} · ${a.angkatan || ''} · <span class="mono">${esc(a.nim || '')}</span></p></div>
    <div class="kd-pair three"><div class="kd ${toneCat(a.kategori_total)}"><small>Indeks Kekuatan Mental</small><b>${a.skor_total}<i>/112</i></b><span>${esc(a.kategori_total)} · ${esc(normDesc('total', a.kategori_total))}</span></div><div class="kd ${toneCat(a.kategori_fondasi)}"><small>5 Kebutuhan Dasar</small><b>${a.skor_fondasi}<i>/80</i></b><span>${esc(a.kategori_fondasi)} · ${esc(normDesc('fondasi', a.kategori_fondasi))}</span></div><div class="kd ${toneCat(a.kategori_otot)}"><small>Kendali diri & kebiasaan baik</small><b>${a.skor_otot}<i>/32</i></b><span>${esc(a.kategori_otot)} · ${esc(normDesc('otot', a.kategori_otot))}</span></div></div></section>
  <div class="grid-2">
    <section class="card"><h3>Skor per dimensi</h3>${dimBars(a.dimensi)}
      <h4>Rincian kendali diri & kebiasaan baik</h4>${a.subkomponen.map((x) => `<div class="mini-row"><span>${esc(x.nama)}</span><b class="mono">${x.skor}/${x.max} · rerata ${x.rerata.toFixed(2)}</b></div>`).join('')}</section>
    <section class="card"><h3>Profil pelemahan & klaim interpretasi</h3>${a.klaim?.length ? a.klaim.map((k) => `<div class="claim"><b>${esc(k.nama)}</b><p class="small">${esc(k.klaim)}</p></div>`).join('') : '<p class="muted">Tidak ada dimensi yang melemah.</p>'}
      <h4>Kesiapan dukungan (Bagian 3)</h4>${a.dukungan.map((x) => `<div class="mini-row"><span>${x.no}. ${esc(x.nama)} — <small>${esc(x.layanan)}</small></span><span class="chip ${x.siap ? 'accent' : ''}">${esc(x.jawaban)}</span></div>`).join('')}
      <div class="chips">${p.gejala_emosional_fisiologis ? '<span class="chip warn">Butir 28: gejala emosional-fisiologis</span>' : ''}${p.ingin_konselor ? '<span class="chip warn">Butir 32: ingin bicara dengan konselor</span>' : ''}${a.fokus_dimensi ? `<span class="chip accent">Fokus: ${esc(domainLabel(a.fokus_dimensi))}</span>` : ''}</div></section></div>
  <section class="card"><h3>Peta kekuatan mental & kesiapan dibantu</h3>${quadrantMap(a.kuadran)}</section>
  <section class="card"><details class="explain"><summary>Lihat penjelasan visual yang ditampilkan kepada konseli</summary>${interpretView(a.penjelasan, { konselor: true })}</details></section>
  ${hist.length > 1 ? `<section class="card"><h3>Perkembangan (${hist.length} kali asesmen)</h3>${kdTrend(hist)}<div class="table-wrap"><table class="table"><thead><tr><th>Tanggal</th><th>Indeks</th><th>5 Kebutuhan Dasar</th><th>Kendali diri</th><th></th></tr></thead><tbody>${[...hist].reverse().map((h) => `<tr class="${h.id === a.id ? 'on' : ''}"><td>${fmtDT(h.diisi_pada)}</td><td><span class="chip ${toneCat(h.kategori_total)}">${h.skor_total} ${esc(h.kategori_total)}</span></td><td class="num">${h.skor_fondasi}</td><td class="num">${h.skor_otot}</td><td>${h.id === a.id ? '<small class="muted">sedang dilihat</small>' : `<a href="#/c/asesmen/${h.id}">Lihat</a>`}</td></tr>`).join('')}</tbody></table></div></section>` : ''}
  <section class="card"><div class="row between wrap"><h3>Rekomendasi untuk konseli</h3><small class="muted">Otomatis: konseling (bila darurat) + 3 konten paling urgen dari keyword-tagging butir pemicu + layanan sesuai kesiapan. Ditambah rekomendasi manual konselor.</small></div>
    <div class="rec-admin">${a.rekomendasi.map((r) => `<div class="rec-item ${r.sumber}"><span class="chip ${r.sumber === 'konselor' ? 'accent' : ''}">${r.sumber === 'konselor' ? `Konselor${r.oleh ? ' · ' + esc(r.oleh) : ''}` : 'Otomatis'}</span> <span class="chip">${esc(REC_JENIS[r.jenis] || r.jenis)}</span><b>${esc(r.judul)}</b>${r.alasan ? `<small>${esc(r.alasan)}</small>` : ''}<span class="row"><small class="muted mono">${esc(r.tautan || '')}</small><button class="link small" data-act="recDel" data-id="${r.id}">Hapus</button></span></div>`).join('') || '<p class="muted">Belum ada rekomendasi.</p>'}</div>
    <form data-form="recAdd" data-id="${a.id}" class="form-grid rec-form"><h4 class="full">Tambah rekomendasi manual</h4>
      <label>Jenis<select id="ra_jenis" name="jenis" data-change="recJenis">${Object.entries(REC_JENIS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
      <div id="ra_tgt">${recTarget('konten')}</div>
      <label class="full">Judul (opsional untuk konten/komunitas/dimensi)<input id="ra_judul" name="judul" maxlength="200"></label>
      <label class="full">Alasan / pesan untuk konseli<textarea id="ra_alasan" name="alasan" rows="2" placeholder="Mengapa rekomendasi ini cocok untuknya"></textarea></label>
      <div class="row end full"><button class="btn primary" type="submit">Tambahkan & beri tahu konseli</button></div></form></section>
  <section class="card"><details ${trig.size ? 'open' : ''}><summary><b>Jawaban ${state.ref.items.length} butir</b> <small class="muted">· baris berwarna = jawaban yang menunjukkan kebutuhan sedang melemah</small></summary>
    <div class="table-wrap"><table class="table small"><thead><tr><th>No</th><th>Butir & indikator</th><th>Jenis pernyataan</th><th>Jawaban</th><th>Skor</th></tr></thead><tbody>${[1, 2, 3].map((b) => `<tr class="group-row"><td colspan="5"><b>${PART[b]}</b></td></tr>${state.ref.items.filter((it) => it.bagian === b).map((it) => { const v = a.jawaban?.A?.[it.no]; return `<tr class="${trig.has(it.no) ? 'trig' : ''}"><td class="num">${it.no}</td><td>${esc(it.teks)}<br><small class="muted">${esc(it.dimensi === 'S' ? 'Kesiapan dukungan' : domainLabel(it.dimensi))} · ${esc(it.indikator)}</small></td><td>${it.arah === '+' ? 'Positif' : 'Negatif'}</td><td>${esc(v || '—')}</td><td class="num">${score(it, v) ?? '—'}</td></tr>`; }).join('')}`).join('')}</tbody></table></div></details></section>`;
}
function recTarget(jenis) {
  const sel = (rows) => `<label>Pilih<select id="ra_target" name="target_id" required>${rows.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>`;
  if (jenis === 'konten') return sel(RT.konten.map((c) => [c.id, `${c.judul} · ${typeLabel(c.tipe)}`]));
  if (jenis === 'komunitas') return sel(RT.komunitas.map((g) => [g.id, g.nama]));
  if (jenis === 'workbook') return sel(RT.workbook.map((w) => [w.id, w.nama]));
  return '';
}
changeHandlers.recJenis = (el) => { document.getElementById('ra_tgt').innerHTML = recTarget(el.value); document.getElementById('ra_judul').required = el.value === 'lainnya'; };
forms.recAdd = async (d, f) => { await api(`/assessments/${f.dataset.id}/recommendations`, { method: 'POST', body: d }); toast('Rekomendasi ditambahkan; konseli mendapat notifikasi.'); rerender(); };
actions.recDel = async (el) => { if (!(await confirmBox('Hapus rekomendasi ini dari hasil konseli?', { ok: 'Hapus' }))) return; await api(`/assessment-recommendations/${el.dataset.id}`, { method: 'DELETE' }); rerender(); };
actions.assessPdfC = (el) => download(`/assessments/${el.dataset.id}/pdf`, 'laporan-ikdkm.pdf');

// ================= Meja Konseling =================
const MODE = { online: 'Daring', offline: 'Luring', keduanya: 'Daring/Luring' };
const topikOf = (a) => (a.topik === 'Lainnya' && a.topik_lainnya ? `Lainnya: ${a.topik_lainnya}` : a.topik);
let deskTab = 'reservasi';
// Menu "Konseling" menyatukan Meja Konseling, Pesan, dan Pengaturan Konseling
const counselHub = (active) => `<h1>Konseling</h1><div class="tabs hub">${[['#/c/meja', 'Meja Konseling'], ['#/c/pesan', 'Pesan'], ['#/c/pengaturan', 'Pengaturan & konteks kerja']].map(([h, l]) => `<a href="${h}" class="${active === h ? 'on' : ''}">${l}</a>`).join('')}</div>`;
async function deskList() {
  const tabs = `<div class="tabs">${[['reservasi', 'Reservasi & sesi'], ['riwayat', 'Riwayat layanan']].map(([k, l]) => `<a href="#" class="${deskTab === k ? 'on' : ''}" data-act="deskTab" data-k="${k}">${l}</a>`).join('')}</div>`;
  if (deskTab === 'riwayat') return `${counselHub('#/c/meja')}${tabs}${await serviceHistory()}`;
  const list = await api('/appointments');
  const group = (s) => list.filter((a) => a.status === s);
  const row = (a) => `<div class="appt-row"><div><b>${esc(a.student.nama)}</b> <span class="muted small">${esc(a.student.prodi || '')}</span> ${a.nomor ? `<span class="chip mono">${esc(a.nomor)}</span>` : ''}<p class="small">${fmtDT(a.jadwal)} · ${esc(a.jenis_layanan || 'Konseling')} · ${MODE[a.jenis] || a.jenis} · ${esc(topikOf(a))}</p>${a.keluhan ? `<p class="small muted">“${esc(a.keluhan)}”</p>` : ''}</div>
    <div class="row wrap">${a.nomor ? `<button class="btn ghost sm" data-act="apptForm" data-id="${a.id}">Formulir</button>` : ''}
    ${a.status === 'pending' ? `<button class="btn primary sm" data-act="apptConfirm" data-id="${a.id}" data-j="${a.jenis}" data-loc="${esc(a.lokasi || '')}">Konfirmasi</button><button class="btn ghost sm" data-act="apptResched" data-id="${a.id}" data-when="${a.jadwal}">Jadwal ulang</button><button class="btn ghost sm" data-act="apptReject" data-id="${a.id}">Tolak</button>` : ''}
    ${a.status === 'confirmed' ? `<a class="btn primary sm" href="#/c/meja/${a.id}">Buka Meja Konseling</a><button class="btn ghost sm" data-act="apptResched" data-id="${a.id}" data-when="${a.jadwal}">Jadwal ulang</button>` : ''}
    ${a.status === 'selesai' ? `<a class="btn ghost sm" href="#/c/meja/${a.id}">Catatan & ringkasan</a>${a.ringkasan_tersedia ? '<span class="chip ok">Ringkasan dibagikan</span>' : '<span class="chip warn">Ringkasan belum disetujui</span>'}${a.feedback ? `<span class="stars small">${'★'.repeat(a.feedback.rating)}</span>` : ''}` : ''}</div></div>`;
  return `${counselHub('#/c/meja')}${tabs}
  <section class="card"><h3>Reservasi baru (${group('pending').length})</h3>${group('pending').map(row).join('') || '<p class="muted">Tidak ada reservasi menunggu.</p>'}</section>
  <section class="card"><h3>Terjadwal (${group('confirmed').length})</h3>${group('confirmed').map(row).join('') || '<p class="muted">Belum ada sesi terjadwal.</p>'}</section>
  <section class="card"><details><summary><b>Selesai (${group('selesai').length})</b></summary>${group('selesai').reverse().map(row).join('')}</details></section>`;
}
actions.deskTab = (el) => { deskTab = el.dataset.k; rerender(); };
async function serviceHistory() {
  const h = await api('/counseling/history');
  if (!h.length) return empty('Belum ada riwayat layanan', 'Riwayat muncul setelah ada reservasi konseling.');
  const delta = (a, b) => { const x = b - a; if (!x) return '<small class="muted">tetap</small>'; const good = x > 0; return `<small class="${good ? 'ok-text' : 'warn-text'}">${x > 0 ? '+' : ''}${x}</small>`; };
  return `<p class="small muted">Pemantauan layanan per konseli: jumlah pertemuan, perkembangan, perubahan Indeks Kekuatan Mental, dan tindak lanjut yang masih terbuka.</p>
  ${h.map((x) => { const a = x.asesmen; return `<section class="card hist-card"><div class="row between wrap"><div><b>${studentLink(x.student.id, x.student.nama)}</b> <span class="muted small">${esc(x.student.prodi || '')} · <span class="mono">${esc(x.student.nim)}</span></span></div>
    <div class="chips"><span class="chip">${x.jumlah_pertemuan} pertemuan selesai</span>${x.terjadwal ? `<span class="chip info">${x.terjadwal} terjadwal</span>` : ''}${x.dibatalkan ? `<span class="chip">${x.dibatalkan} batal</span>` : ''}${x.perkembangan_terakhir ? `<span class="chip ${x.perkembangan_terakhir === 'Membaik' ? 'ok' : x.perkembangan_terakhir === 'Memburuk' ? 'crit' : ''}">Perkembangan: ${esc(x.perkembangan_terakhir)}</span>` : ''}</div></div>
    ${a?.jumlah ? `<p class="small">IKDKM-M (${a.jumlah}×): Indeks ${a.awal.skor_total} (${esc(a.awal.kategori_total)}) → <b>${a.akhir.skor_total} (${esc(a.akhir.kategori_total)})</b> ${delta(a.awal.skor_total, a.akhir.skor_total)} <span class="muted">(${fmtDate(a.awal.diisi_pada)} – ${fmtDate(a.akhir.diisi_pada)})</span></p>` : '<p class="small muted">Belum ada asesmen.</p>'}
    ${x.sesi.length ? `<div class="table-wrap"><table class="table small"><thead><tr><th>Tanggal</th><th>Topik</th><th>Keparahan</th><th>Perkembangan</th><th>Tindak lanjut</th><th>Ringkasan konseli</th></tr></thead><tbody>${x.sesi.map((s) => `<tr><td>${fmtDate(s.jadwal)}</td><td>${esc(s.topik || '')}</td><td>${esc(s.keparahan || '—')}</td><td>${esc(s.perkembangan || '—')}</td><td>${esc(s.tindak_lanjut || '—')}</td><td><span class="chip ${s.ringkasan === 'disetujui' ? 'ok' : s.ringkasan === 'draf' ? 'warn' : ''}">${s.ringkasan || 'belum ada'}</span></td></tr>`).join('')}</tbody></table></div>` : ''}
    ${x.tugas_monitoring.some((t) => !t.selesai) || x.intervensi_aktif.length ? `<p class="small"><b>Tindak lanjut terbuka:</b> ${[...x.tugas_monitoring.filter((t) => !t.selesai).map((t) => `${esc(t.judul)} (${fmtDate(t.jatuh_tempo)})`), ...x.intervensi_aktif.map((i) => esc(i.deskripsi))].join(' · ')}</p>` : ''}</section>`; }).join('')}`;
}
actions.apptForm = async (el) => {
  const f = await api(`/appointments/${el.dataset.id}/form`);
  openModal(`<h3>Formulir pendaftaran ${esc(f.nomor)}</h3><dl class="kv"><dt>Nama</dt><dd>${esc(f.nama)} · <span class="mono">${esc(f.nim)}</span></dd><dt>Prodi</dt><dd>${esc(f.prodi || '')}</dd><dt>Kontak</dt><dd>${esc(f.email || '')} · ${esc(f.telepon || '')}</dd><dt>Jadwal</dt><dd>${fmtDT(f.jadwal)} WIB · ${esc(f.jenis_layanan)} · ${MODE[f.mode] || f.mode}</dd><dt>Topik</dt><dd>${esc(f.topik)}</dd><dt>Keluhan</dt><dd class="pre">${esc(f.keluhan || '-')}</dd><dt>Informed consent</dt><dd>Versi ${f.consent_versi} · disetujui ${fmtDT(f.disetujui_pada)}</dd></dl><div class="row end"><button class="btn" data-act="apptFormPdf" data-id="${el.dataset.id}">Unduh PDF</button></div>`, { wide: true });
};
actions.apptFormPdf = (el) => download(`/appointments/${el.dataset.id}/form/pdf`, 'formulir-konseling.pdf');
actions.apptConfirm = (el) => openModal(`<h3>Konfirmasi janji temu</h3><form data-form="apptConfirm" data-id="${el.dataset.id}" class="stack">${el.dataset.j === 'online' ? '<label>Tautan rapat video (Google Meet/Zoom)<input id="ap_link" name="tautan_rapat" type="url" placeholder="https://meet.google.com/…" required></label>' : `<label>Lokasi<input id="ap_loc" name="lokasi" value="${esc(el.dataset.loc || 'Ruang Konseling Gedung A')}" required></label>`}<div class="row end"><button class="btn primary" type="submit">Konfirmasi</button></div></form>`);
forms.apptConfirm = async (d, f) => { await api(`/appointments/${f.dataset.id}`, { method: 'PATCH', body: { status: 'confirmed', ...d } }); closeModal(); toast('Janji dikonfirmasi; mahasiswa mendapat notifikasi.'); rerender(); };
actions.apptResched = (el) => openModal(`<h3>Jadwal ulang</h3><form data-form="apptResched" data-id="${el.dataset.id}" class="stack"><label>Jadwal baru<input id="ap_when" type="datetime-local" name="jadwal" value="${toLocalInput(el.dataset.when)}" required></label><p class="small muted">Konseli diberi tahu otomatis. Ikuti ketentuan pembatalan & penjadwalan ulang pada informed consent Anda.</p><div class="row end"><button class="btn primary" type="submit">Simpan jadwal</button></div></form>`);
forms.apptResched = async (d, f) => { await api(`/appointments/${f.dataset.id}`, { method: 'PATCH', body: { jadwal: new Date(d.jadwal).toISOString() } }); closeModal(); toast('Jadwal diperbarui.'); rerender(); };
actions.apptReject = async (el) => { if (!(await confirmBox('Tolak reservasi ini? Mahasiswa akan diberi tahu untuk membuat reservasi ulang.', { ok: 'Tolak reservasi' }))) return; await api(`/appointments/${el.dataset.id}`, { method: 'PATCH', body: { status: 'batal' } }); rerender(); };

let deskStage = 1; let deskId = null;
async function desk({ id }) {
  if (deskId !== id) { deskId = id; deskStage = 1; }
  const d = await api(`/appointments/${id}/desk`);
  const ap = d.appointment; const s = d.session || {}; const ev = d.evaluation; const sm = d.summary; const closed = ap.status === 'selesai';
  if (closed && deskStage === 1 && ev) deskStage = 3;
  const a = d.asesmen_terakhir; const f = d.form;
  const stages = ['Perencanaan', 'Pelaksanaan', 'Evaluasi', 'Ringkasan untuk konseli'];
  const curTopic = s.diagnosis_domain_id || (d.pilihan.topik.includes(ap.topik) ? ap.topik : '');
  let body = '';
  if (deskStage === 1) body = `<div class="grid-2"><section class="card"><h3>Profil konseli</h3><dl class="kv"><dt>Nama</dt><dd>${studentLink(d.student.id, d.student.nama)}</dd><dt>Prodi</dt><dd>${esc(d.student.prodi || '')} · ${d.student.angkatan || ''}</dd></dl>
      ${a ? `<div class="row between wrap">${kdChips(a)}<a class="small" href="#/c/asesmen/${a.id}">Detail IKDKM-M</a></div><p class="small muted">${fmtDate(a.diisi_pada)}${a.pelemahan.length ? ` · melemah: ${a.pelemahan.map(domainLabel).map(esc).join(', ')}` : ''}</p>${d.riwayat_asesmen.length > 1 ? kdTrend(d.riwayat_asesmen, 120) : ''}` : '<p class="muted">Belum mengisi asesmen.</p>'}
      ${d.sesi_sebelumnya.length ? `<h4>Sesi sebelumnya</h4><ul class="plain">${d.sesi_sebelumnya.map((x) => `<li>${fmtDate(x.jadwal)} · ${esc(x.topik)} → ${esc(x.tindak_lanjut || '-')}</li>`).join('')}</ul>` : ''}</section>
    <section class="card"><div class="row between"><h3>Formulir pendaftaran</h3>${f ? `<button class="btn ghost sm" data-act="apptFormPdf" data-id="${ap.id}">PDF</button>` : ''}</div><dl class="kv">${f ? `<dt>Nomor</dt><dd class="mono">${esc(f.nomor)}</dd>` : ''}<dt>Waktu</dt><dd>${fmtDT(ap.jadwal)}</dd><dt>Layanan</dt><dd>${esc(ap.jenis_layanan || '')} · ${MODE[ap.jenis] || ap.jenis}</dd><dt>Topik</dt><dd>${esc(topikOf(ap))}</dd>${ap.tautan_rapat ? `<dt>Tautan</dt><dd><a href="${esc(ap.tautan_rapat)}" target="_blank" rel="noopener">${esc(ap.tautan_rapat)}</a></dd>` : ''}${ap.lokasi ? `<dt>Lokasi</dt><dd>${esc(ap.lokasi)}</dd>` : ''}<dt>Keluhan</dt><dd>${esc(ap.keluhan || '-')}</dd></dl>
      <h3>Informed consent</h3>${d.consent ? `<p><span class="chip ok">Dibaca & disetujui</span> ${fmtDT(d.consent.disetujui_pada)} · <span class="mono">${esc(d.consent.versi_kebijakan)}</span></p>${f?.consent ? `<details><summary class="small">Lihat isi yang disetujui</summary>${f.consent.map(([j, t]) => `<p class="small"><b>${esc(j)}</b><br>${esc(t)}</p>`).join('')}</details>` : ''}<button class="btn ghost sm" data-act="consentPdf" data-id="${d.consent.id}">Unduh bukti (PDF)</button>` : '<p><span class="chip warn">Belum ada persetujuan tercatat</span></p>'}
      ${closed ? '' : '<div class="row end"><button class="btn primary" data-act="deskStage" data-s="2">Mulai sesi →</button></div>'}</section></div>`;
  if (deskStage === 2) body = `<form data-form="deskSession" data-id="${id}" class="card stack"><div class="notice small">Catatan profesional bersifat <b>rahasia</b>, terenkripsi, dan tidak pernah ditampilkan ke konseli. Untuk konseli, tulis <b>Ringkasan untuk konseli</b> di tahap 4.</div>
      <div class="form-grid"><label>Kategori masalah<select id="ds_dom" name="diagnosis_domain_id" ${closed ? 'disabled' : ''}><option value="">Pilih…</option>${d.pilihan.topik.map((t) => `<option ${curTopic === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <label>Tingkat keparahan<select id="ds_sev" name="tingkat_keparahan" ${closed ? 'disabled' : ''}>${['Ringan', 'Sedang', 'Berat'].map((x) => `<option ${s.tingkat_keparahan === x ? 'selected' : ''}>${x}</option>`).join('')}</select></label></div>
      ${closed ? '' : '<div class="row"><button type="button" class="btn sm" data-act="aiIntervention">Minta saran intervensi (AI)</button><small class="muted">2 pertanyaan eksploratif + 1 teknik, wajib ditinjau.</small></div><div id="aiDraft"></div>'}
      ${[['catatan_rapport', '1. Rapport / membangun hubungan', 'ds_rapport'], ['catatan_eksplorasi', '2. Eksplorasi masalah', 'ds_eksplor'], ['tujuan_smart', '3. Penentuan tujuan (SMART)', 'ds_smart'], ['catatan_teknik', '4. Penyelesaian masalah & aplikasi teknik', 'ds_teknik'], ['catatan_penutup', '5. Penutup', 'ds_tutup']]
        .map(([k, l, i]) => `<label>${l}<textarea id="${i}" name="${k}" rows="${k === 'tujuan_smart' ? 2 : 3}" ${closed ? 'readonly' : ''} ${k === 'tujuan_smart' ? 'placeholder="Spesifik, terukur, dapat dicapai, relevan, berbatas waktu"' : ''}>${esc(s[k] || '')}</textarea></label>`).join('')}
      <div class="row between"><button type="button" class="btn ghost" data-act="deskStage" data-s="1">← Perencanaan</button>${closed ? '<button type="button" class="btn" data-act="deskStage" data-s="3">Evaluasi →</button>' : '<button class="btn primary" type="submit">Simpan & lanjut ke Evaluasi</button>'}</div></form>`;
  if (deskStage === 3) body = closed && ev ? `<section class="card"><h3>Evaluasi sesi <span class="chip">rahasia</span></h3><dl class="kv"><dt>Refleksi konselor</dt><dd class="pre">${esc(ev.refleksi_konselor || '-')}</dd><dt>Perkembangan konseli</dt><dd>${esc(ev.perkembangan || '-')}</dd><dt>Rencana monitoring</dt><dd>${ev.rencana_monitoring.map(esc).join(', ') || '-'}</dd><dt>Tindak lanjut</dt><dd><b>${esc(ev.rekomendasi_lanjutan)}</b></dd></dl>${ap.feedback ? `<h4>Umpan balik mahasiswa</h4><p><span class="stars">${'★'.repeat(ap.feedback.rating)}${'☆'.repeat(5 - ap.feedback.rating)}</span> ${esc(ap.feedback.refleksi_mahasiswa || '')}</p>` : '<p class="muted small">Mahasiswa belum memberi penilaian.</p>'}<div class="row between wrap"><button class="btn ghost" data-act="deskStage" data-s="2">Lihat catatan sesi</button><button class="btn primary" data-act="deskStage" data-s="4">Ringkasan untuk konseli →</button></div></section>`
    : `<form data-form="deskEval" data-id="${id}" class="card stack"><label>Refleksi konselor pasca-sesi<textarea id="ev_ref" name="refleksi_konselor" rows="4" placeholder="Apa yang berjalan baik? Apa yang perlu diperbaiki?"></textarea></label>
      <fieldset><legend>Perkembangan konseli dibanding sesi/asesmen sebelumnya</legend><div class="chips">${d.pilihan.perkembangan.map((p) => `<label class="check"><input type="radio" name="perkembangan" value="${esc(p)}" required> ${esc(p)}</label>`).join('')}</div></fieldset>
      <fieldset><legend>Rencana monitoring (membuat pengingat otomatis)</legend>${d.pilihan.monitoring.map((m, i) => `<label class="check"><input type="checkbox" name="mon_${i}" value="${esc(m)}"> ${esc(m)}</label>`).join('')}</fieldset>
      <fieldset><legend>Rekomendasi tindak lanjut</legend>${d.pilihan.tindak_lanjut.map((t) => `<label class="check"><input type="radio" name="rekomendasi_lanjutan" value="${esc(t)}" required data-change="evalFollow"> ${esc(t)}</label>`).join('')}</fieldset>
      <label id="ev_ref_wrap" hidden>Catatan rujukan (fasilitas, alasan)<input id="ev_rujuk" name="catatan_rujukan" placeholder="Contoh: Poli Jiwa RSUD Gambiran, gejala depresi berat"></label>
      <div class="row between"><button type="button" class="btn ghost" data-act="deskStage" data-s="2">← Pelaksanaan</button><button class="btn primary" type="submit">Tutup sesi & tulis ringkasan</button></div></form>`;
  if (deskStage === 4) body = `<form id="sumForm" class="card stack" onsubmit="return false"><div class="row between wrap"><h3>Ringkasan untuk konseli</h3>${sm ? `<span class="chip ${sm.status === 'disetujui' ? 'ok' : 'warn'}">${sm.status === 'disetujui' ? `Disetujui & tampil ke konseli · ${fmtDT(sm.disetujui_pada)}` : 'Draf — belum tampil ke konseli'}</span>` : '<span class="chip">Belum ada</span>'}</div>
      <p class="small muted">Terpisah dari catatan profesional. Gunakan bahasa yang mudah dipahami konseli. Konseli dapat membacanya di <b>Riwayat Konseling</b> hanya setelah Anda menyetujuinya.</p>
      <label>Ringkasan sesi<textarea id="sm_text" name="ringkasan" rows="6" placeholder="Hal-hal yang kita bahas hari ini…">${esc(sm?.ringkasan || '')}</textarea></label>
      <label>Tindak lanjut untuk konseli<textarea id="sm_follow" name="tindak_lanjut_konseli" rows="4" placeholder="1) … 2) …">${esc(sm?.tindak_lanjut_konseli || '')}</textarea></label>
      <div class="row between wrap"><button type="button" class="btn ghost" data-act="deskStage" data-s="${ev ? 3 : 2}">← Kembali</button><div class="row"><button type="button" class="btn" data-act="sumSave" data-id="${id}" data-ok="0">Simpan draf</button><button type="button" class="btn primary" data-act="sumSave" data-id="${id}" data-ok="1">Setujui & bagikan ke konseli</button></div></div></form>`;
  return `<a class="small" href="#/c/meja">← Meja Konseling</a><div class="row between wrap"><h1>Sesi: ${esc(d.student.nama)}</h1><span class="chip ${closed ? 'info' : 'ok'}">${closed ? 'Selesai' : 'Terkonfirmasi'}</span></div>
  <ol class="flow">${stages.map((x, i) => `<li class="${i + 1 === deskStage ? 'on' : i + 1 < deskStage ? 'done' : ''}"><button class="link" data-act="deskStage" data-s="${i + 1}" ${i + 1 > 1 && !d.session && !closed ? 'disabled' : ''}><span>${i + 1}</span>${x}</button></li>`).join('')}</ol>${body}`;
}
actions.deskStage = (el) => { deskStage = Number(el.dataset.s); rerender(); };
actions.consentPdf = (el) => download(`/consents/${el.dataset.id}/pdf`, 'bukti-consent.pdf');
actions.aiIntervention = async (el) => {
  const topik = document.getElementById('ds_dom').value; if (!topik) return toast('Pilih kategori masalah terlebih dahulu.', 'warn');
  el.disabled = true;
  const r = await api('/ai/intervention-suggestion', { method: 'POST', body: { appointment_id: deskId, domain: topik, severity: document.getElementById('ds_sev').value } }).finally(() => { el.disabled = false; });
  document.getElementById('aiDraft').innerHTML = aiDraftBox(r, 'desk');
};
forms.deskSession = async (d, f) => { if (!d.diagnosis_domain_id) return toast('Pilih kategori masalah.', 'warn'); await api(`/appointments/${f.dataset.id}/session`, { method: 'PUT', body: d }); toast('Catatan sesi tersimpan.'); deskStage = 3; rerender(); };
changeHandlers.evalFollow = (el) => { document.getElementById('ev_ref_wrap').hidden = el.value !== 'Rujuk ke Psikiater-RSUD'; };
forms.deskEval = async (d, f) => {
  const rencana = Object.entries(d).filter(([k]) => k.startsWith('mon_')).map(([, v]) => v);
  await api(`/appointments/${f.dataset.id}/evaluation`, { method: 'PUT', body: { refleksi_konselor: d.refleksi_konselor, perkembangan: d.perkembangan, rencana_monitoring: rencana, rekomendasi_lanjutan: d.rekomendasi_lanjutan, catatan_rujukan: d.catatan_rujukan } });
  toast('Sesi ditutup. Pengingat monitoring dijadwalkan.'); deskStage = 4; rerender();
};
actions.sumSave = async (el) => {
  const ringkasan = document.getElementById('sm_text').value; const tl = document.getElementById('sm_follow').value; const ok = el.dataset.ok === '1';
  if (ok && !(await confirmBox('Setujui ringkasan ini? Konseli akan diberi tahu dan dapat membacanya di Riwayat Konseling.', { ok: 'Setujui & bagikan' }))) return;
  await api(`/appointments/${el.dataset.id}/summary`, { method: 'PUT', body: { ringkasan, tindak_lanjut_konseli: tl, setujui: ok } });
  toast(ok ? 'Ringkasan disetujui dan dibagikan ke konseli.' : 'Draf ringkasan tersimpan.'); rerender();
};

// ================= Pengaturan Konseling: jadwal ketersediaan & informed consent =================
const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
let SVC = [];
function slotForm(s = {}, id = '', form = 'slotSave') {
  return `<form data-form="${form}" data-id="${id}" class="form-grid">
    <label>Hari<select id="sl_day" name="hari">${HARI.slice(1).map((h, i) => `<option value="${i + 1}" ${s.hari === i + 1 ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
    <label>Jenis layanan<select id="sl_svc" name="jenis_layanan">${SVC.map((x) => `<option ${s.jenis_layanan === x ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>
    <label>Jam mulai<input id="sl_start" name="jam_mulai" type="time" value="${s.jam_mulai || '09:00'}" required></label>
    <label>Jam selesai<input id="sl_end" name="jam_selesai" type="time" value="${s.jam_selesai || '10:00'}" required></label>
    <label>Mode<select id="sl_mode" name="mode">${Object.entries(MODE).map(([k, l]) => `<option value="${k}" ${(s.mode || 'keduanya') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Kuota konseli per sesi<input id="sl_quota" name="kuota" type="number" min="1" max="20" value="${s.kuota || 1}" required></label>
    <label class="full">Lokasi (untuk luring)<input id="sl_loc" name="lokasi" value="${esc(s.lokasi || '')}" placeholder="Ruang Konseling Gedung A, Lt. 2"></label>
    <div class="row end full"><button class="btn primary" type="submit">${id ? 'Simpan perubahan' : 'Tambah slot'}</button></div></form>`;
}
let SLOTS = [];
// ---- Pendaftaran mahasiswa kolektif (unggah Excel) ----
let IMP = null; // { file, hasil }
function importCard(inv, me) {
  if (!me.universitas || me.universitas.startsWith('PAN-JALU (')) return '';
  const r = IMP?.hasil; const st = { siap: ['Siap', 'ok'], galat: ['Perlu diperbaiki', 'crit'], terdaftar: ['Sudah terdaftar', ''] };
  return `<section class="card stack imp-card"><div class="row between wrap"><h3>Daftarkan mahasiswa secara kolektif</h3><span class="chip">${inv.jumlah} didaftarkan · ${inv.aktif} aktif</span></div>
    <p class="small muted">Daftarkan banyak mahasiswa sekaligus dengan berkas Excel. Setiap mahasiswa menerima email aktivasi untuk membuat kata sandi dan menyetujui kebijakan privasi; Anda otomatis menjadi konselor pendampingnya.</p>
    <ol class="imp-steps"><li><b>Unduh templat</b> <button type="button" class="btn ghost sm" data-act="impTemplate">⬇ Templat Excel</button><small>Kolom: NIM*, Nama lengkap*, Email aktif*, Program studi, Angkatan*, Kelas, Jenis kelamin (L/P), No. telepon.</small></li>
      <li><b>Isi data mahasiswa</b><small>Maksimal 500 baris per berkas. Nama prodi mengikuti lembar "Daftar Prodi".</small></li>
      <li><b>Unggah & periksa</b> <label class="btn ghost sm file-btn">📄 Pilih berkas .xlsx<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-change="impFile" hidden></label><small>Hasil pemeriksaan tampil sebelum ada data yang disimpan.</small></li></ol>
    ${r ? `<div class="imp-sum"><span class="chip">${r.ringkas.total} baris</span><span class="chip ok">${r.ringkas.siap} siap</span>${r.ringkas.galat ? `<span class="chip crit">${r.ringkas.galat} perlu diperbaiki</span>` : ''}${r.ringkas.terdaftar ? `<span class="chip">${r.ringkas.terdaftar} sudah terdaftar</span>` : ''}</div>
      <div class="table-wrap imp-table"><table class="table"><thead><tr><th>Baris</th><th>NIM</th><th>Nama</th><th>Email</th><th>Prodi</th><th>Angkatan</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>${r.baris.map((x) => `<tr class="${x.status === 'galat' ? 'imp-err' : x.status === 'terdaftar' ? 'faded' : ''}"><td class="mono">${x.baris}</td><td class="mono">${esc(x.nim)}</td><td>${esc(x.nama)}</td><td class="small">${esc(x.email)}</td><td class="small">${esc(x.prodi || '—')}</td><td>${esc(String(x.angkatan || ''))}</td><td><span class="chip ${st[x.status][1]}">${st[x.status][0]}</span></td><td class="small">${esc(x.keterangan || '')}</td></tr>`).join('')}</tbody></table></div>
      <div class="row end wrap"><button type="button" class="btn ghost" data-act="impReset">Batal</button><button type="button" class="btn primary" data-act="impCommit" ${r.ringkas.siap ? '' : 'disabled'}>Daftarkan ${r.ringkas.siap} mahasiswa & kirim email aktivasi</button></div>` : ''}
    ${inv.items.length ? `<details ${inv.items.some((x) => !x.aktif) ? '' : ''}><summary class="small"><b>Mahasiswa yang Anda daftarkan</b> (${inv.items.filter((x) => !x.aktif).length} belum aktif)</summary><div class="table-wrap"><table class="table"><thead><tr><th>Nama</th><th>NIM</th><th>Email</th><th>Status</th><th></th></tr></thead><tbody>${inv.items.map((x) => `<tr><td>${esc(x.nama)}</td><td class="mono">${esc(x.nim)}</td><td class="small">${esc(x.email)}</td><td>${x.aktif ? `<span class="chip ok">Aktif ${fmtDate(x.aktif_pada)}</span>` : `<span class="chip warn">Menunggu aktivasi</span><br><small class="muted">email ${x.jumlah_kirim}× · ${x.terkirim_pada ? fmtDT(x.terkirim_pada) : '—'}</small>`}</td><td>${x.aktif ? '' : `<button class="btn ghost sm" data-act="impResend" data-id="${x.id}">Kirim ulang</button>`}</td></tr>`).join('')}</tbody></table></div></details>` : ''}</section>`;
}
actions.impTemplate = () => download('/counselor/import/template', 'templat-daftar-mahasiswa-pan-jalu.xlsx');
changeHandlers.impFile = (el) => {
  const f = el.files?.[0]; el.value = ''; if (!f) return;
  if (f.size > 700 * 1024) return toast('Berkas terlalu besar (maks. 700 KB). Bagi menjadi beberapa berkas.', 'warn');
  const rd = new FileReader();
  rd.onload = async () => { const file = String(rd.result).split(',')[1]; try { const hasil = await api('/counselor/import', { method: 'POST', body: { file } }); IMP = { file, hasil }; rerender(); } catch (e) { toast(e.message, 'warn'); } };
  rd.readAsDataURL(f);
};
actions.impReset = () => { IMP = null; rerender(); };
actions.impCommit = async (el) => {
  if (!(await confirmBox(`Daftarkan ${IMP.hasil.ringkas.siap} mahasiswa dan kirim email aktivasi kepada mereka?`, { ok: 'Daftarkan', tone: 'primary' }))) return;
  el.disabled = true;
  try { const r = await api('/counselor/import', { method: 'POST', body: { file: IMP.file, simpan: true } }); IMP = null; toast(`${r.ringkas.didaftarkan} mahasiswa didaftarkan; ${r.ringkas.email_terkirim} email aktivasi terkirim.`); rerender(); } catch (e) { el.disabled = false; throw e; }
};
actions.impResend = async (el) => { el.disabled = true; await api(`/counselor/invites/${el.dataset.id}/resend`, { method: 'POST', body: {} }); toast('Email aktivasi dikirim ulang.'); el.textContent = 'Terkirim'; };

async function counselSettings() {
  const [sl, c, me, inv] = await Promise.all([api('/counselor-slots/me'), api('/counselor-consent/me'), api('/counselor-profile/me'), api('/counselor/invites')]);
  SVC = sl.layanan; SLOTS = sl.slots;
  const active = sl.slots.filter((s) => s.aktif);
  const byFak = me.fakultas_kampus.map((f) => ({ ...f, prodi: me.prodi_kampus.filter((p) => p.fakultas_kode === f.kode) }));
  return `${counselHub('#/c/pengaturan')}
  ${importCard(inv, me)}
  <form data-form="contextSave" class="card stack"><div class="row between wrap"><h3>Konteks kerja & layanan</h3><span class="chip">${esc(me.universitas || '')}</span></div>
    <p class="small muted">Konteks kerja tampil kepada mahasiswa saat mendaftar dan memilih konselor. Data di Dashboard, Asesmen, Profil Mahasiswa, Laporan Komunal, dan Evaluasi hanya memuat <b>mahasiswa binaan Anda</b> (yang memilih Anda; saat ini ${me.binaan} mahasiswa) serta mahasiswa yang belum memilih konselor dan berada dalam konteks kerja ini.</p>
    ${byFak.length ? `<div class="ctx-grid">${byFak.map((f) => `<fieldset class="ctx-fak"><legend><label class="check"><input type="checkbox" name="fak_${esc(f.kode)}" value="1" ${me.lingkup_fakultas.includes(f.kode) ? 'checked' : ''}> <b>${esc(f.nama)}</b> <small class="muted">(seluruh prodi)</small></label></legend>
      ${f.prodi.map((p) => `<label class="check small"><input type="checkbox" name="pro_${p.id}" value="1" ${me.lingkup_prodi.includes(p.id) ? 'checked' : ''}> ${esc(p.nama)} (${esc(p.jenjang)})</label>`).join('')}</fieldset>`).join('')}</div>`
      : '<div class="notice warn small">Daftar fakultas & prodi kampus Anda belum diisi Koordinator Layanan BK.</div>'}
    <fieldset><legend>Siapa yang dapat mendaftar konseling kepada Anda?</legend>
      <label class="check"><input type="radio" name="layanan" value="terbuka" ${me.layanan_terbuka ? 'checked' : ''}> <b>Seluruh mahasiswa kampus</b> — mahasiswa mana pun di kampus Anda dapat memilih Anda di menu Konseling</label>
      <label class="check"><input type="radio" name="layanan" value="binaan" ${me.layanan_terbuka ? '' : 'checked'}> <b>Hanya mahasiswa binaan</b> — hanya mahasiswa yang memilih Anda sebagai konselornya</label></fieldset>
    <div class="row end"><button class="btn primary" type="submit">Simpan konteks & layanan</button></div></form>
  <section class="card"><div class="row between wrap"><h3>Jadwal ketersediaan</h3><button class="btn primary sm" data-act="slotNew">Tambah slot</button></div>
    <p class="small muted">Slot aktif otomatis tampil di menu <b>Daftar dan Pilih Konselor</b> mahasiswa untuk 4 minggu ke depan (minimal 2 jam sebelum mulai). Kuota berkurang otomatis setiap ada reservasi.</p>
    <div class="slot-days">${[1, 2, 3, 4, 5, 6, 7].map((h) => { const xs = active.filter((s) => s.hari === h); return `<div class="slot-day ${xs.length ? '' : 'off'}"><b>${HARI[h]}</b>${xs.map((s) => `<span class="slot-pill">${s.jam_mulai}–${s.jam_selesai}<small>${esc(s.jenis_layanan)} · ${MODE[s.mode]} · kuota ${s.kuota}</small></span>`).join('') || '<small class="muted">Tutup</small>'}</div>`; }).join('')}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Hari</th><th>Jam</th><th>Layanan</th><th>Mode</th><th>Kuota</th><th>Lokasi</th><th>Status</th><th></th></tr></thead><tbody>
    ${sl.slots.map((s) => `<tr class="${s.aktif ? '' : 'faded'}"><td>${s.hari_nama}</td><td class="mono">${s.jam_mulai}–${s.jam_selesai}</td><td>${esc(s.jenis_layanan)}</td><td>${MODE[s.mode]}</td><td class="num">${s.kuota}</td><td class="small">${esc(s.lokasi || '—')}</td><td><span class="chip ${s.aktif ? 'ok' : ''}">${s.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
      <td class="row"><button class="btn ghost sm" data-act="slotEdit" data-id="${s.id}">Ubah</button>${s.aktif ? `<button class="btn ghost sm" data-act="slotOff" data-id="${s.id}">Nonaktifkan</button>` : `<button class="btn ghost sm" data-act="slotOn" data-id="${s.id}">Aktifkan</button>`}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Belum ada slot. Tambahkan agar mahasiswa dapat mendaftar.</td></tr>'}</tbody></table></div></section>
  <form data-form="consentSave" class="card stack"><div class="row between wrap"><h3>Informed consent konseling</h3><span class="chip">Versi ${c.versi || 'bawaan'}${c.updated_at ? ` · ${fmtDT(c.updated_at)}` : ''}</span></div>
    <p class="small muted">Tampil otomatis saat mahasiswa mendaftar ke Anda. Tombol kirim baru aktif setelah mahasiswa menggulir sampai akhir dan mencentang persetujuan. Setiap penyimpanan membuat versi baru; formulir yang sudah dikirim tetap menyimpan versi yang disetujui saat itu.</p>
    ${c.sections.map(([k, l], i) => `<label>${esc(l)}${i < 4 ? ' <span class="muted small">(wajib)</span>' : ' <span class="muted small">(opsional)</span>'}<textarea id="cc_${k}" name="${k}" rows="${i < 4 ? 4 : 2}" ${i < 4 ? 'required minlength="20"' : ''}>${esc(c[k] || '')}</textarea></label>`).join('')}
    <div class="row between wrap"><button type="button" class="btn ghost" data-act="consentPreview">Pratinjau tampilan mahasiswa</button><button class="btn primary" type="submit">Simpan sebagai versi baru</button></div></form>`;
}
actions.slotNew = () => openModal(`<h3>Slot ketersediaan baru</h3>${slotForm()}`, { wide: true });
actions.slotEdit = (el) => openModal(`<h3>Ubah slot</h3>${slotForm(SLOTS.find((s) => s.id === el.dataset.id), el.dataset.id)}`, { wide: true });
forms.slotSave = async (d, f) => { const id = f.dataset.id; await api(id ? `/counselor-slots/${id}` : '/counselor-slots', { method: id ? 'PATCH' : 'POST', body: { ...d, hari: Number(d.hari), kuota: Number(d.kuota) } }); closeModal(); toast('Jadwal ketersediaan disimpan.'); rerender(); };
actions.slotOff = async (el) => { await api(`/counselor-slots/${el.dataset.id}`, { method: 'DELETE' }); toast('Slot dinonaktifkan; tidak lagi tampil ke mahasiswa.'); rerender(); };
actions.slotOn = async (el) => { await api(`/counselor-slots/${el.dataset.id}`, { method: 'PATCH', body: { aktif: true } }); rerender(); };
forms.contextSave = async (d) => {
  const keys = Object.keys(d);
  await api('/counselor-profile/me', { method: 'PATCH', body: { lingkup_fakultas: keys.filter((k) => k.startsWith('fak_')).map((k) => k.slice(4)), lingkup_prodi: keys.filter((k) => k.startsWith('pro_')).map((k) => k.slice(4)), layanan_terbuka: d.layanan !== 'binaan' } });
  toast('Konteks kerja & pengaturan layanan disimpan.'); rerender();
};
forms.consentSave = async (d) => { const r = await api('/counselor-consent/me', { method: 'PUT', body: d }); toast(`Informed consent versi ${r.versi} tersimpan.`); rerender(); };
actions.consentPreview = () => {
  const secs = [...document.querySelectorAll('[id^=cc_]')].map((t) => [t.closest('label').firstChild.textContent.trim(), t.value]).filter(([, v]) => v.trim());
  openModal(`<h3>Pratinjau informed consent</h3><div class="consent-box">${secs.map(([j, v]) => `<h4>${esc(j)}</h4><p class="pre">${esc(v)}</p>`).join('')}</div><label class="check"><input type="checkbox" disabled> Saya telah membaca dan menyetujui informed consent ini.</label>`, { wide: true });
};

// ================= Pesan konselor =================
async function counselorMessages() {
  const st = await api('/students');
  const { MSG } = await import('./student.js');
  if (MSGW.with) { MSG.with = MSGW.with; MSGW.with = null; }
  return counselHub('#/c/pesan') + await messagesView('', { peopleLabel: 'Mahasiswa dalam kewenangan', people: st.items.map((s) => ({ id: s.id, nama: s.nama, online: false })) });
}

// ================= Laporan komunal =================
const RF = { prodi: '', angkatan: '', anon: false };
async function report() {
  const qs = new URLSearchParams({ ...(RF.prodi && { prodi: RF.prodi }), ...(RF.angkatan && { angkatan: RF.angkatan }), ...(RF.anon && { anon: '1' }) });
  const d = await api(`/reports/aggregate?${qs}`);
  const n = d.jumlah_mahasiswa || 0; const pct = (x) => (n ? (x / n) * 100 : 0);
  const worst = (rows, label) => rows[0] ? `<div class="worst"><small>${label} dengan 5 kebutuhan dasar terendah</small><b>${esc(rows[0].kelompok)}</b><span>5 kebutuhan ${rows[0].rata_fondasi}/80 · indeks ${rows[0].rata_total} · ${rows[0].jumlah} mhs${rows[0].krisis ? ` · ${rows[0].krisis} krisis` : ''}</span></div>` : '';
  const NC = ['V1', 'V2', 'V3', 'V4', 'V5'];
  const catN = (v) => (v >= 13 ? 'Kuat' : v >= 8 ? 'Rentan' : 'Lemah'); const catK = (v) => (v >= 25 ? 'Kuat' : v >= 16 ? 'Rentan' : 'Lemah');
  const heatN = (v, k) => (v == null ? '' : `heat-${toneCat(k === 'V6' ? catK(v) : catN(v))}`);
  const stack = (x) => { const t = (x.kuat + x.rentan + x.lemah) || 1; const p = (v) => Math.round((v / t) * 1000) / 10; return `<div class="stack3" role="img" aria-label="Kuat ${p(x.kuat)}%, mulai melemah ${p(x.rentan)}%, lemah ${p(x.lemah)}%"><span class="s-ok" style="width:${p(x.kuat)}%"></span><span class="s-warn" style="width:${p(x.rentan)}%"></span><span class="s-crit" style="width:${p(x.lemah)}%"></span></div><div class="mon-legend"><span class="ok-text">Kuat ${x.kuat}</span><span class="warn-text">Mulai melemah ${x.rentan}</span><span class="crit-text">Lemah ${x.lemah}</span></div>`; };
  const ref = (k) => state.ref.dimensions.find((x) => x.kode === k) || {};
  const LIBI = { V1: ['🛡️', 'amber'], V2: ['❤️', 'pink'], V3: ['🏆', 'violet'], V4: ['🕊️', 'teal'], V5: ['🎉', 'green'], V6: ['🧠', 'blue'] };
  const needCard = (x, rank) => `<article class="mon-need c-${LIBI[x.kode][1]}"><div class="mon-need-top"><span class="pg-ibadge" aria-hidden="true">${LIBI[x.kode][0]}</span><span><b>${esc((ref(x.kode).mudah || x.label).replace(/ \(.*\)$/, ''))}</b><small>${esc(x.nama)}${rank ? ` · urutan melemah #${rank}` : ''}</small></span></div>
    <div class="pg-ival"><b>${x.rata ?? '—'}</b><small>/${x.max} rata-rata · ${x.melemah} mhs melemah</small></div>${stack(x)}</article>`;
  const groupTable = (rows, label) => `<div class="table-wrap"><table class="table"><thead><tr><th>${label}</th><th>Jumlah</th><th>5 kebutuhan<br><small class="muted">20–80</small></th>${NC.map((k) => `<th title="${esc(ref(k).mudah || k)}">${k}</th>`).join('')}<th class="v6-col">Kendali diri</th><th>Indeks</th><th>Krisis</th><th>Butuh segera</th></tr></thead><tbody>${rows.map((g) => `<tr><td>${esc(g.kelompok)}</td><td class="num">${g.jumlah}</td><td class="num"><b>${g.rata_fondasi}</b></td>${NC.map((k) => `<td class="num ${heatN(g[k], k)}">${g[k] ?? '—'}</td>`).join('')}<td class="num v6-col ${heatN(g.rata_otot, 'V6')}">${g.rata_otot}</td><td class="num">${g.rata_total}</td><td class="num">${g.krisis}</td><td class="num">${g.butuh_segera}</td></tr>`).join('') || '<tr><td colspan="11" class="muted">Tidak ada data.</td></tr>'}</tbody></table></div>`;
  const dist = (rows) => bars(rows.map((x) => ({ label: x.kategori, value: pct(x.jumlah), tone: toneCat(x.kategori), note: String(x.jumlah) })));
  return `<h1>Laporan Komunal IKDKM-M</h1>
  <form data-form="reportFilter" class="filters row wrap"><select id="rf_prodi" name="prodi"><option value="">Semua prodi</option>${state.pub.prodi.map((p) => `<option value="${p.id}" ${RF.prodi === p.id ? 'selected' : ''}>${esc(p.nama)} (${p.jenjang})</option>`).join('')}</select>
    <select id="rf_angk" name="angkatan"><option value="">Semua angkatan</option>${YEARS.map((y) => `<option ${String(y) === RF.angkatan ? 'selected' : ''}>${y}</option>`).join('')}</select>
    ${state.user.role === 'koordinator' ? '<span class="chip">Hanya data agregat (tanpa identitas mahasiswa)</span>' : `<label class="check"><input type="checkbox" name="anon" value="1" ${RF.anon ? 'checked' : ''}> Anonimkan ekspor</label>`}
    <button class="btn ghost" type="submit">Terapkan filter</button>
    <span class="spacer"></span><button type="button" class="btn" data-act="exportReport" data-f="xlsx">Ekspor Excel</button><button type="button" class="btn" data-act="exportReport" data-f="pdf">Ekspor PDF resmi</button></form>
  <div class="kpis"><div class="kpi"><span>Mahasiswa terdata</span><b>${n}</b></div><div class="kpi info"><span>Rata-rata 5 Kebutuhan Dasar (20–80)</span><b>${d.rata_fondasi ?? '—'}</b><small>analisis utama</small></div><div class="kpi"><span>Rata-rata Kendali Diri & Kebiasaan Baik (8–32)</span><b>${d.rata_otot ?? '—'}</b></div><div class="kpi"><span>Rata-rata Indeks (28–112)</span><b>${d.rata_total ?? '—'}</b></div><div class="kpi ${d.penanda.butuh_bantuan_segera ? 'crit' : ''}"><span>Butuh bantuan segera</span><b>${d.penanda.butuh_bantuan_segera}</b><small>${d.penanda.perlu_kuratif} perlu didampingi konselor</small></div></div>
  <div class="worst-grid">${worst(d.per_prodi, 'Prodi')}${worst(d.per_angkatan, 'Angkatan')}${worst(d.per_kelas, 'Kelas')}</div>
  <section class="card"><div class="row between wrap"><h3>Analisis utama: 5 Kebutuhan Dasar</h3><span class="muted small">diurutkan dari yang paling banyak melemah</span></div>
    ${n ? `<div class="mon-profile"><div class="mon-radar">${radarChart([...d.kebutuhan].sort((p, q) => p.kode.localeCompare(q.kode)).map((x) => ({ kode: x.kode, nama: x.nama, skor: x.rata ?? 4, max: 16, status: catN(x.rata ?? 4) })), { size: 320 })}<p class="small muted center">Rata-rata skor tiap kebutuhan (4–16)</p></div>
      <div class="mon-needs">${d.kebutuhan.map((x, i) => needCard(x, i + 1)).join('')}</div></div>
      <h4>Kategori 5 Kebutuhan Dasar (gabungan 20–80)</h4>${dist(d.distribusi_fondasi)}` : '<p class="muted">Belum ada data asesmen.</p>'}</section>
  <section class="card"><h3>Kendali Diri & Kebiasaan Baik</h3><p class="small muted">Dimensi pendukung yang dibaca sesudah 5 kebutuhan dasar: tahu tujuan, bertanggung jawab atas pilihan, dan punya kebiasaan baik.</p>
    ${n ? `<div class="mon-needs one">${needCard(d.kendali)}<div>${dist(d.distribusi_otot)}</div></div>` : ''}</section>
  <section class="card"><h3>Distribusi Indeks Kekuatan Mental</h3>${dist(d.distribusi_total)}</section>
  <div class="grid-2"><section class="card"><h3>Peta kekuatan mental & kesiapan dibantu</h3>${quadrantMap(null, Object.fromEntries(d.kuadran.map((x) => [x.kode, x.jumlah])))}<p class="small muted">Kelompok <b>Rentan Tersembunyi</b> perlu sapaan proaktif: kekuatan mental belum tangguh tetapi belum merasa butuh dukungan.</p></section>
    <section class="card"><h3>Kesiapan dukungan (Bagian 3)</h3>${bars(d.dukungan.map((x) => ({ label: `${x.nama} — ${x.layanan}`, value: pct(x.siap), tone: x.kode === 'kuratif' ? 'warn' : 'info', note: `${x.siap} mhs` })))}
      <h3>Rekomendasi program layanan</h3>${d.rekomendasi_layanan.length ? `<ul class="plain">${d.rekomendasi_layanan.map((r) => `<li><span class="chip accent">${esc(r.jenis)}</span> ${esc(r.judul)} <small class="muted">· ${esc(r.dimensi)} (${r.jumlah} mhs melemah)</small></li>`).join('')}</ul>` : '<p class="muted">Belum ada dimensi yang melemah.</p>'}</section></div>
  <section class="card"><h3>Per prodi</h3>${groupTable(d.per_prodi, 'Prodi')}</section>
  <div class="grid-2"><section class="card"><h3>Per angkatan</h3>${groupTable(d.per_angkatan, 'Angkatan')}</section><section class="card"><h3>Per kelas</h3>${groupTable(d.per_kelas, 'Kelas')}</section></div>`;
}
forms.reportFilter = (d) => { RF.prodi = d.prodi || ''; RF.angkatan = d.angkatan || ''; RF.anon = !!d.anon; rerender(); };
actions.exportReport = async (el) => {
  const qs = new URLSearchParams({ format: el.dataset.f, ...(RF.prodi && { prodi: RF.prodi }), ...(RF.angkatan && { angkatan: RF.angkatan }), ...(RF.anon && { anon: '1' }) });
  el.disabled = true; await download(`/reports/export?${qs}`, `laporan.${el.dataset.f}`).finally(() => { el.disabled = false; }); toast('Laporan diunduh.');
};

// ================= Manajemen Konten Psikoedukasi =================
const CSTAT = { draft: ['Draft', ''], published: ['Terbit', 'ok'], nonaktif: ['Nonaktif', 'warn'] };
const KF = { type: '', kategori: '', status: '', q: '' };
let contentTab = 'pustaka';
async function contentAdmin() {
  const isAdmin = state.user.role === 'admin';
  if (isAdmin) return adminContent();
  const st = await api('/content-stats');
  const tabs = `<div class="tabs">${[['pustaka', `Konten hasil review (pustaka admin)${st.pustaka_baru ? ` · ${st.pustaka_baru} baru` : ''}`], ['sendiri', 'Konten buatan sendiri']].map(([k, l]) => `<a href="#" class="${contentTab === k ? 'on' : ''}" data-act="contentTab" data-k="${k}">${l}</a>`).join('')}</div>`;
  if (contentTab === 'pustaka') return `<h1>Psikoedukasi</h1>${tabs}${await libraryView()}`;
  return `<h1>Psikoedukasi</h1>${tabs}${await contentTable(st)}`;
}
actions.contentTab = (el) => { contentTab = el.dataset.k; rerender(); };
async function contentTable(st = null) {
  const qs = new URLSearchParams({ ...(KF.type && { type: KF.type }), ...(KF.kategori && { kategori: KF.kategori }), ...(KF.status && { status: KF.status }), ...(KF.q && { q: KF.q }) });
  const c = await api(`/content?${qs}`);
  const isAdmin = state.user.role === 'admin';
  return `<div class="row between wrap"><p class="muted">${isAdmin ? 'Konten yang diterbitkan masuk ke pustaka dan dapat ditinjau, dinilai, lalu dipilih konselor untuk dipublikasikan ke mahasiswa kampusnya.' : 'Konten yang Anda terbitkan langsung dapat diakses seluruh mahasiswa kampus Anda; rekomendasi untuk tiap mahasiswa tetap mengikuti hasil asesmennya.'}</p><button class="btn primary" data-act="contentEdit">Tambah konten</button></div>
  ${st ? `<div class="grid-3">` : ''}
    ${st ? `<section class="card"><h3>Kebutuhan konten dari asesmen</h3><p class="small muted">Topik yang paling banyak muncul dari jawaban asesmen terakhir ${st.total_mahasiswa} mahasiswa (pernyataan yang menunjukkan kebutuhan melemah), dibandingkan dengan jumlah konten yang sudah terbit.</p>${st.kebutuhan_kata_kunci.slice(0, 8).map((r) => `<div class="mini-row"><span><b title="${esc(r.kata_kunci)}">${esc(kwLabel(r.kata_kunci))}</b><small class="muted"> · ${r.mahasiswa} mhs · ${r.konten_tersedia} konten</small></span>${r.konten_tersedia < 2 ? `<button class="btn ghost sm" data-act="contentEdit" data-kw="${esc(r.kata_kunci)}">Buat</button>` : ''}</div>`).join('') || '<p class="muted small">Belum ada data asesmen.</p>'}</section>
    <section class="card"><h3>Paling banyak dibuka</h3><ol class="topics">${st.paling_ditonton.map((x) => `<li>${esc(x.judul)} <small class="muted mono">${x.jumlah_tayang}×</small></li>`).join('')}</ol></section>
    <section class="card"><h3>Topik paling dicari</h3>${st.paling_dicari.length ? `<ul class="plain">${st.paling_dicari.map((x) => `<li>“${esc(x.kata_kunci)}” <small class="muted">${x.n}×</small></li>`).join('')}</ul>` : '<p class="muted small">Belum ada pencarian tercatat.</p>'}</section></div>` : ''}
  <form data-form="contentFilter" class="filters row wrap"><input id="kf_q" name="q" type="search" placeholder="Cari judul/kata kunci" value="${esc(KF.q)}"><select name="kategori" id="kf_cat"><option value="">Semua kategori</option>${state.ref.content_categories.map((x) => `<option value="${x.kode}" ${KF.kategori === x.kode ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select><select name="type" id="kf_type"><option value="">Semua format</option>${Object.entries(state.ref.content_types).map(([k, l]) => `<option value="${k}" ${KF.type === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><select name="status" id="kf_status"><option value="">Semua status</option>${Object.entries(CSTAT).map(([k, [l]]) => `<option value="${k}" ${KF.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn ghost" type="submit">Terapkan</button></form>
  <section class="card"><div class="table-wrap"><table class="table"><thead><tr><th></th><th>Judul</th><th>Kategori · format</th><th>Kata kunci</th><th>${isAdmin ? 'Dipakai' : 'Dibuka'}</th><th>Status</th><th></th></tr></thead><tbody>
  ${c.items.map((x) => `<tr><td><img class="thumb-sm" src="${esc(x.thumbnail_url || `/thumbs/${x.kategori}.svg`)}" alt=""></td><td><b>${esc(x.judul)}</b><br><small class="muted">${esc(x.ringkasan || 'Belum ada deskripsi singkat')}</small>${x.pembuat ? `<br><small class="muted">oleh ${esc(x.pembuat)}</small>` : ''}</td><td class="small">${esc(catLabel(x.kategori))}<br>${esc(typeLabel(x.tipe))}${x.durasi_atau_halaman ? ` · ${esc(x.durasi_atau_halaman)}` : ''}</td>
    <td><div class="kw">${x.kata_kunci.map((k) => `<span title="${esc(k)}">${esc(kwLabel(k))}</span>`).join('') || '<small class="warn-text">Belum ada</small>'}</div></td><td class="num">${isAdmin && x.pemakaian ? `${x.pemakaian.dipakai_konselor} konselor<br><small class="muted">${x.pemakaian.dipakai_kampus} kampus${x.pemakaian.rating_rata ? ` · ★ ${x.pemakaian.rating_rata}` : ''}</small>` : x.jumlah_tayang}</td>
    <td><select data-change="contentStatus" data-id="${x.id}" aria-label="Status konten" class="st-${x.status}">${Object.entries(CSTAT).map(([k, [l]]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
    <td class="row"><button class="btn ghost sm" data-act="contentEdit" data-id="${x.id}">Ubah</button><button class="btn ghost sm" data-act="contentDel" data-id="${x.id}">Hapus</button></td></tr>`).join('') || '<tr><td colspan="7" class="muted">Tidak ada konten.</td></tr>'}</tbody></table></div></section>`;
}
forms.contentFilter = (d) => { Object.assign(KF, { type: d.type, kategori: d.kategori, status: d.status, q: d.q || '' }); rerender(); };
changeHandlers.contentStatus = async (el) => {
  try { await api(`/content/${el.dataset.id}`, { method: 'PATCH', body: { status: el.value } }); toast(el.value === 'published' ? 'Konten diterbitkan.' : el.value === 'nonaktif' ? 'Konten dinonaktifkan; tidak tampil ke mahasiswa.' : 'Konten dijadikan draft.'); }
  finally { rerender(); }
};
actions.contentDel = async (el) => { if (!(await confirmBox('Hapus konten ini secara permanen? Untuk menyembunyikan sementara, gunakan status Nonaktif.', { ok: 'Hapus' }))) return; await api(`/content/${el.dataset.id}`, { method: 'DELETE' }); toast('Konten dihapus.'); rerender(); };
const KWSEL = new Set();
const kwChips = (q = '') => state.ref.keywords.filter((k) => !q || k.toLowerCase().includes(q.toLowerCase())).map((k) => `<label class="kw-opt ${KWSEL.has(k) ? 'on' : ''}"><input type="checkbox" data-change="kwPick" value="${esc(k)}" ${KWSEL.has(k) ? 'checked' : ''}>${esc(kwLabel(k))}</label>`).join('');
const kwHint = (k) => state.ref.items.filter((it) => it.kata_kunci.includes(k)).map((it) => `butir ${it.no}`).join(', ');
const kwSelected = () => `${[...KWSEL].map((k) => `<span class="chip accent" title="${esc(kwHint(k))}">${esc(kwLabel(k))} <button type="button" class="link" data-act="kwDrop" data-k="${esc(k)}" aria-label="Hapus ${esc(kwLabel(k))}">×</button></span>`).join('') || '<small class="muted">Belum ada kata kunci dipilih (wajib minimal 1 untuk terbit).</small>'}`;
actions.contentEdit = async (el) => {
  const c = el.dataset.id ? await api(`/content/${el.dataset.id}`) : { judul: el.dataset.title || '', tipe: 'artikel', kategori: el.dataset.cat || 'UMUM', status: 'draft', kata_kunci: el.dataset.kws ? el.dataset.kws.split('|') : el.dataset.kw ? [el.dataset.kw] : [] };
  KWSEL.clear(); c.kata_kunci.forEach((k) => KWSEL.add(k));
  const thumb = c.thumbnail_url || '';
  openModal(`<h3>${el.dataset.id ? 'Ubah konten' : 'Konten baru'}</h3><form data-form="contentSave" data-id="${el.dataset.id || ''}" class="form-grid">
    <div class="full thumb-edit"><img id="ce_thumb_prev" src="${esc(thumb || `/thumbs/${c.kategori}.svg`)}" alt="Thumbnail"><div class="stack"><label>Thumbnail (wajib; PNG/JPG/WEBP)<input id="ce_thumb_file" type="file" accept="image/png,image/jpeg,image/webp" data-change="thumbUpload"></label><input type="hidden" id="ce_thumb" name="thumbnail_url" value="${esc(thumb)}"><button type="button" class="btn ghost sm" data-act="thumbDefault">Pakai thumbnail bawaan kategori</button></div></div>
    <label class="full">Judul<input id="ce_title" name="judul" value="${esc(c.judul)}" required maxlength="200"></label>
    <label>Kategori<select id="ce_cat" name="kategori" data-change="thumbCat">${state.ref.content_categories.map((x) => `<option value="${x.kode}" ${c.kategori === x.kode ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
    <label>Format<select id="ce_type" name="tipe">${Object.entries(state.ref.content_types).map(([k, l]) => `<option value="${k}" ${c.tipe === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
    <label>Durasi / estimasi baca / halaman<input id="ce_dur" name="durasi_atau_halaman" value="${esc(c.durasi_atau_halaman || '')}" placeholder="5 menit baca"></label>
    <label>Status<select id="ce_status" name="status">${Object.entries(CSTAT).map(([k, [l]]) => `<option value="${k}" ${c.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="full">Deskripsi singkat (wajib, maks. 400 karakter)<textarea id="ce_sum" name="ringkasan" rows="2" maxlength="400">${esc(c.ringkasan || '')}</textarea></label>
    <fieldset class="full kw-field"><legend>Keyword-tagging (dari butir IKDKM-M) — dipakai untuk rekomendasi otomatis</legend><div id="kwSel" class="chips">${kwSelected()}</div>
      <input id="ce_kwq" type="search" placeholder="Cari kata kunci…" data-input="kwSearch"><div id="kwList" class="kw-opts">${kwChips()}</div></fieldset>
    <label class="full">Isi / naskah<textarea id="ce_body" name="isi" rows="6">${esc(c.isi || '')}</textarea></label>
    <label class="full">Media (tautan https:// atau unggah berkas)<input id="ce_url" name="url_media" value="${esc(c.url_media || '')}" placeholder="https://…"></label>
    <label class="full">Unggah berkas (PDF, PPTX, MP3, MP4, gambar; maks. 150 MB)<input id="ce_file" type="file" accept=".pdf,.pptx,.mp3,.ogg,.mp4,.webm,.png,.jpg,.jpeg,.webp,.gif" data-change="contentUpload"></label>
    <div class="row end full"><button class="btn primary" type="submit">Simpan</button></div></form>`, { wide: true });
};
changeHandlers.kwPick = (el) => { if (el.checked) KWSEL.add(el.value); else KWSEL.delete(el.value); el.closest('.kw-opt').classList.toggle('on', el.checked); document.getElementById('kwSel').innerHTML = kwSelected(); };
actions.kwDrop = (el) => { KWSEL.delete(el.dataset.k); document.getElementById('kwSel').innerHTML = kwSelected(); document.getElementById('kwList').innerHTML = kwChips(document.getElementById('ce_kwq').value); };
inputHandlers.kwSearch = (el) => { document.getElementById('kwList').innerHTML = kwChips(el.value); };
const upload = (f) => api('/uploads', { method: 'POST', body: f, headers: { 'Content-Type': f.type, 'X-Filename': encodeURIComponent(f.name) } });
changeHandlers.thumbUpload = async (el) => { const f = el.files[0]; if (!f) return; const r = await upload(f); document.getElementById('ce_thumb').value = r.url; document.getElementById('ce_thumb_prev').src = r.url; toast('Thumbnail terunggah.'); };
actions.thumbDefault = () => { const k = document.getElementById('ce_cat').value; document.getElementById('ce_thumb').value = `/thumbs/${k}.svg`; document.getElementById('ce_thumb_prev').src = `/thumbs/${k}.svg`; };
changeHandlers.thumbCat = (el) => { const t = document.getElementById('ce_thumb'); if (!t.value || t.value.startsWith('/thumbs/')) { if (t.value) t.value = `/thumbs/${el.value}.svg`; document.getElementById('ce_thumb_prev').src = t.value || `/thumbs/${el.value}.svg`; } };
changeHandlers.contentUpload = async (el) => { const f = el.files[0]; if (!f) return; if (f.size > 150 * 1024 * 1024) { el.value = ''; return toast('Ukuran berkas maksimal 150 MB.', 'warn'); } toast('Mengunggah…', 'info'); const r = await upload(f); document.getElementById('ce_url').value = r.url; toast('Berkas terunggah.'); };
forms.contentSave = async (d, f) => {
  const id = f.dataset.id;
  const body = { ...d, kata_kunci: [...KWSEL] };
  if (body.status === 'published' && !body.thumbnail_url) body.thumbnail_url = `/thumbs/${body.kategori}.svg`;
  await api(id ? `/content/${id}` : '/content', { method: id ? 'PATCH' : 'POST', body }); closeModal(); toast('Konten disimpan.'); rerender();
};

// ================= Komunitas: grup, peer counselor, moderasi =================
let comTab = 'grup';
async function communityAdmin() {
  const [g, reports, peers] = await Promise.all([api('/community-groups'), api('/moderation/reports'), api('/peer-counselors')]);
  const baru = reports.filter((r) => r.status === 'baru').length;
  const tabs = `<div class="tabs">${[['grup', `Grup komunitas (${g.length})`], ['peer', `Peer counselor (${peers.filter((p) => p.aktif).length} aktif)`], ['laporan', `Laporan moderasi${baru ? ` (${baru} baru)` : ''}`]].map(([k, l]) => `<a href="#" class="${comTab === k ? 'on' : ''}" data-act="comTab" data-k="${k}">${l}</a>`).join('')}</div>`;
  let body = '';
  if (comTab === 'grup') body = `<div class="row end"><button class="btn primary" data-act="groupEdit">Buat komunitas</button></div>
    <div class="group-admin">${g.map((x) => `<section class="card ${x.status === 'aktif' ? '' : 'faded'}"><div class="row between wrap"><div><span class="eyebrow">${esc(x.topik)}</span><h3>${esc(x.nama)}</h3></div><span class="row wrap"><span class="chip ${x.cakupan === 'binaan' ? 'accent' : ''}" title="Dibuat ${esc(x.pembuat || '')}">${x.cakupan === 'binaan' ? `Binaan ${x.milik_saya ? 'saya' : esc(x.pembuat || '')}` : 'Seluruh kampus'}</span><span class="chip ${x.status === 'aktif' ? 'ok' : ''}">${x.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span></span></div>
      <p class="small">${esc(x.deskripsi || '')}</p>${x.jadwal ? `<p class="small muted">Pertemuan: ${esc(x.jadwal)}</p>` : ''}
      ${x.topik_diskusi.length ? `<div class="kw">${x.topik_diskusi.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}
      <p class="small">${x.jumlah_anggota} anggota · ${x.jumlah_diskusi} diskusi${x.laporan_baru ? ` · <b class="warn-text">${x.laporan_baru} laporan baru</b>` : ''}</p>
      <div class="row wrap"><a class="btn sm" href="#/c/komunitas/${x.id}">Moderasi diskusi</a><button class="btn ghost sm" data-act="groupMembers" data-id="${x.id}" data-n="${esc(x.nama)}">Anggota</button><button class="btn ghost sm" data-act="groupEdit" data-id="${x.id}">Ubah</button><button class="btn ghost sm" data-act="groupStatus" data-id="${x.id}" data-s="${x.status === 'aktif' ? 'nonaktif' : 'aktif'}">${x.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}</button><button class="btn ghost sm" data-act="groupDel" data-id="${x.id}">Hapus</button></div></section>`).join('') || empty('Belum ada komunitas')}</div>`;
  if (comTab === 'peer') body = `<div class="grid-2 wide-left"><section class="card"><h3>Peer counselor</h3><p class="small muted">Hanya mahasiswa yang ditetapkan di sini yang tampil di direktori peer counselor dan memperoleh badge. Menonaktifkan status langsung mencabut badge dan tampilan direktori.</p>
      ${peers.map((p) => `<div class="peer-admin ${p.aktif ? '' : 'faded'}"><div class="row between wrap"><div><b>${esc(p.nama)}</b> ${p.aktif ? peerBadge : '<span class="chip">Nonaktif</span>'}<br><small class="muted">${esc(p.nama_prodi || '')} · ${p.angkatan || ''} · <span class="mono">${esc(p.nim || '')}</span></small></div>${p.aktif ? `<span class="chip ${p.status === 'online' ? 'ok' : p.status === 'sibuk' ? 'warn' : ''}">${esc(p.status)}</span>` : ''}</div>
        <dl class="kv small"><dt>Pelatihan</dt><dd>${esc(p.pelatihan || '—')}${p.tanggal_sertifikasi ? ` · ${fmtDate(p.tanggal_sertifikasi)}` : ''}</dd><dt>Keahlian</dt><dd>${esc(p.keahlian || '—')}</dd><dt>Ditetapkan oleh</dt><dd>${esc(p.ditetapkan_oleh || '—')}</dd>${p.aktif ? '' : `<dt>Dinonaktifkan</dt><dd>${fmtDate(p.dinonaktifkan_pada)} · ${esc(p.alasan_nonaktif || '')}</dd>`}</dl>
        ${p.pendampingan?.length ? `<details><summary class="small">Riwayat supervisi (${p.pendampingan.length})</summary><ul class="plain small">${p.pendampingan.map((s) => `<li><b>${fmtDate(s.tanggal)}</b> · ${esc(s.oleh)}: ${esc(s.catatan)}</li>`).join('')}</ul></details>` : '<p class="small warn-text">Belum ada catatan supervisi.</p>'}
        <div class="row wrap"><button class="btn ghost sm" data-act="peerSup" data-id="${p.id}">Catat supervisi</button><button class="btn ghost sm" data-act="peerEdit" data-id="${p.id}" data-k="${esc(p.keahlian || '')}" data-t="${esc(p.pelatihan || '')}" data-c="${esc(p.kontak_terverifikasi || '')}">Ubah</button>${p.aktif ? `<button class="btn ghost sm" data-act="peerOff" data-id="${p.id}">Nonaktifkan</button>` : `<button class="btn ghost sm" data-act="peerOn" data-id="${p.id}">Aktifkan kembali</button>`}</div></div>`).join('') || '<p class="muted">Belum ada peer counselor.</p>'}</section>
    <form data-form="peerAdd" class="card stack"><h3>Tetapkan peer counselor</h3><p class="small muted">Untuk mahasiswa yang telah mengikuti pelatihan dan dinyatakan memenuhi syarat.</p>
      <label>Cari mahasiswa<input id="pa_q" type="search" placeholder="Nama atau NIM" data-input="peerSearch"></label>
      <label>Mahasiswa<select id="pa_user" name="user_id" required><option value="">Ketik untuk mencari…</option></select></label>
      <label>Pelatihan yang diikuti<input id="pa_train" name="pelatihan" required placeholder="Pelatihan Peer Counselor Angkatan 4"></label>
      <label>Tanggal sertifikasi<input id="pa_date" name="tanggal_sertifikasi" type="date"></label>
      <label>Keahlian / fokus pendampingan<input id="pa_skill" name="keahlian" placeholder="Stres akademik, adaptasi mahasiswa baru"></label>
      <label>Kontak terverifikasi<input id="pa_contact" name="kontak" placeholder="08…"></label>
      <label class="check"><input type="checkbox" name="memenuhi_syarat" value="1" required> Mahasiswa telah menyelesaikan pelatihan dan dinyatakan memenuhi syarat sebagai peer counselor</label>
      <button class="btn primary" type="submit">Tetapkan & beri badge</button></form></div>`;
  if (comTab === 'laporan') body = `<section class="card"><h3>Laporan dari anggota</h3>${reports.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Grup</th><th>Pesan dilaporkan</th><th>Alasan</th><th>Waktu</th><th>Status</th><th></th></tr></thead><tbody>${reports.map((r) => `<tr class="${r.status === 'baru' ? '' : 'faded'}"><td><a href="#/c/komunitas/${r.group_id}">${esc(r.grup)}</a></td><td class="small">${esc(r.isi)}${r.post_status === 'disembunyikan' ? ' <span class="chip">disembunyikan</span>' : ''}</td><td class="small">${esc(r.alasan)}</td><td class="small muted">${ago(r.created_at)}</td><td><span class="chip ${r.status === 'baru' ? 'warn' : ''}">${esc(r.status)}</span></td>
      <td class="row">${r.status === 'baru' ? `${r.post_status === 'tampil' ? `<button class="btn ghost sm" data-act="modHide" data-id="${r.post_id}">Sembunyikan pesan</button>` : ''}<button class="btn ghost sm" data-act="reportIgnore" data-id="${r.id}">Abaikan</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Tidak ada laporan.</p>'}</section>`;
  return `<h1>Komunitas</h1>${tabs}${body}`;
}
actions.comTab = (el) => { comTab = el.dataset.k; rerender(); };
actions.groupEdit = async (el) => {
  const x = el.dataset.id ? (await api('/community-groups')).find((g) => g.id === el.dataset.id) : { nama: '', topik: '', deskripsi: '', jadwal: '', topik_diskusi: [], status: 'aktif', cakupan: 'universitas' };
  openModal(`<h3>${el.dataset.id ? 'Ubah komunitas' : 'Komunitas baru'}</h3><form data-form="groupSave" data-id="${el.dataset.id || ''}" class="form-grid">
    <label>Nama komunitas<input id="gs_name" name="nama" value="${esc(x.nama)}" required></label><label>Topik utama<input id="gs_topic" name="topik" value="${esc(x.topik)}" required></label>
    <label class="full">Deskripsi<textarea id="gs_desc" name="deskripsi" rows="2">${esc(x.deskripsi || '')}</textarea></label>
    <label>Jadwal pertemuan<input id="gs_sched" name="jadwal" value="${esc(x.jadwal || '')}" placeholder="Kamis 16.00 (daring)"></label>
    <label>Status<select id="gs_status" name="status"><option value="aktif" ${x.status === 'aktif' ? 'selected' : ''}>Aktif</option><option value="nonaktif" ${x.status === 'nonaktif' ? 'selected' : ''}>Nonaktif</option></select></label>
    <fieldset class="full"><legend>Siapa yang dapat melihat & bergabung?</legend>
      <label class="check"><input type="radio" name="cakupan" value="universitas" ${x.cakupan !== 'binaan' ? 'checked' : ''}> Seluruh mahasiswa kampus</label>
      <label class="check"><input type="radio" name="cakupan" value="binaan" ${x.cakupan === 'binaan' ? 'checked' : ''}> Hanya mahasiswa binaan saya (yang memilih saya sebagai konselor)</label></fieldset>
    <label class="full">Topik diskusi (satu per baris)<textarea id="gs_topics" name="topik_diskusi" rows="4">${esc(x.topik_diskusi.join('\n'))}</textarea></label>
    <div class="row end full"><button class="btn primary" type="submit">Simpan</button></div></form>`, { wide: true });
};
forms.groupSave = async (d, f) => { const id = f.dataset.id; await api(id ? `/community-groups/${id}` : '/community-groups', { method: id ? 'PATCH' : 'POST', body: d }); closeModal(); toast('Komunitas disimpan.'); rerender(); };
actions.groupStatus = async (el) => { await api(`/community-groups/${el.dataset.id}`, { method: 'PATCH', body: { status: el.dataset.s } }); toast(el.dataset.s === 'aktif' ? 'Komunitas diaktifkan.' : 'Komunitas dinonaktifkan; tidak tampil ke mahasiswa.'); rerender(); };
actions.groupDel = async (el) => { if (!(await confirmBox('Hapus komunitas ini beserta keanggotaan dan diskusinya?', { ok: 'Hapus' }))) return; await api(`/community-groups/${el.dataset.id}`, { method: 'DELETE' }); rerender(); };
actions.groupMembers = async (el) => {
  const m = await api(`/community-groups/${el.dataset.id}/members`);
  openModal(`<h3>Anggota ${esc(el.dataset.n)} (${m.length})</h3>${m.length ? `<table class="table"><tbody>${m.map((x) => `<tr><td><b>${esc(x.nama)}</b> ${x.peer ? peerBadge : ''}<br><small class="muted">${esc(x.nama_prodi || '')} · bergabung ${fmtDate(x.bergabung_pada)}</small></td><td><button class="btn ghost sm" data-act="memberKick" data-g="${el.dataset.id}" data-id="${x.id}">Keluarkan</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted">Belum ada anggota.</p>'}`);
};
actions.memberKick = async (el) => { if (!(await confirmBox('Keluarkan anggota ini dari komunitas?', { ok: 'Keluarkan' }))) return; await api(`/community-groups/${el.dataset.g}/members/${el.dataset.id}`, { method: 'DELETE' }); closeModal(); toast('Anggota dikeluarkan.'); rerender(); };
actions.modHide = (el) => openModal(`<h3>Sembunyikan pesan</h3><form data-form="modHide" data-id="${el.dataset.id}" class="stack"><label>Alasan (dikirim ke penulis)<input id="mh_reason" name="alasan" value="Tidak sesuai pedoman komunitas" required></label><div class="row end"><button class="btn crit" type="submit">Sembunyikan</button></div></form>`);
forms.modHide = async (d, f) => { await api(`/posts/${f.dataset.id}`, { method: 'PATCH', body: { status: 'disembunyikan', alasan: d.alasan } }); closeModal(); toast('Pesan disembunyikan.'); rerender(); };
actions.modShow = async (el) => { await api(`/posts/${el.dataset.id}`, { method: 'PATCH', body: { status: 'tampil' } }); toast('Pesan ditampilkan kembali.'); rerender(); };
actions.reportIgnore = async (el) => { await api(`/moderation/reports/${el.dataset.id}`, { method: 'PATCH', body: { status: 'diabaikan' } }); rerender(); };
let peerT;
inputHandlers.peerSearch = (el) => {
  clearTimeout(peerT);
  peerT = setTimeout(async () => { const r = await api(`/peer-candidates?q=${encodeURIComponent(el.value)}`); const s = document.getElementById('pa_user'); if (s) s.innerHTML = r.length ? r.map((u) => `<option value="${u.id}">${esc(u.nama)} · ${esc(u.nim_nip)} · ${esc(u.nama_prodi || '')}</option>`).join('') : '<option value="">Tidak ditemukan</option>'; }, 250);
};
forms.peerAdd = async (d) => { await api('/peer-counselors', { method: 'POST', body: { ...d, memenuhi_syarat: !!d.memenuhi_syarat } }); toast('Peer counselor ditetapkan; badge tampil di akun mahasiswa.'); rerender(); };
actions.peerOff = (el) => openModal(`<h3>Nonaktifkan peer counselor</h3><form data-form="peerOff" data-id="${el.dataset.id}" class="stack"><label>Alasan (dikirim ke mahasiswa)<textarea id="po_reason" name="alasan" rows="2" required placeholder="Contoh: Belum mengikuti supervisi wajib semester ini."></textarea></label><p class="small muted">Badge dan tampilan di direktori peer counselor langsung dicabut.</p><div class="row end"><button class="btn crit" type="submit">Nonaktifkan</button></div></form>`);
forms.peerOff = async (d, f) => { await api(`/peer-counselors/${f.dataset.id}`, { method: 'PATCH', body: { aktif: false, alasan: d.alasan } }); closeModal(); toast('Status peer counselor dinonaktifkan.'); rerender(); };
actions.peerOn = async (el) => { await api(`/peer-counselors/${el.dataset.id}`, { method: 'PATCH', body: { aktif: true } }); toast('Status peer counselor diaktifkan kembali.'); rerender(); };
actions.peerEdit = (el) => openModal(`<h3>Ubah data peer counselor</h3><form data-form="peerEdit" data-id="${el.dataset.id}" class="stack"><label>Pelatihan<input id="pe_train" name="pelatihan" value="${esc(el.dataset.t)}"></label><label>Keahlian<input id="pe_skill" name="keahlian" value="${esc(el.dataset.k)}"></label><label>Kontak terverifikasi<input id="pe_contact" name="kontak" value="${esc(el.dataset.c)}"></label><div class="row end"><button class="btn primary" type="submit">Simpan</button></div></form>`);
forms.peerEdit = async (d, f) => { await api(`/peer-counselors/${f.dataset.id}`, { method: 'PATCH', body: d }); closeModal(); rerender(); };
actions.peerSup = (el) => openModal(`<h3>Catatan supervisi</h3><form data-form="peerSup" data-id="${el.dataset.id}" class="stack"><label>Tanggal<input id="ps_date" name="tanggal" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Catatan pendampingan<textarea id="ps_note" name="catatan" rows="4" required placeholder="Refleksi kasus, batas peran, kapan merujuk ke konselor…"></textarea></label><div class="row end"><button class="btn primary" type="submit">Simpan</button></div></form>`);
forms.peerSup = async (d, f) => { await api(`/peer-counselors/${f.dataset.id}/supervision`, { method: 'POST', body: d }); closeModal(); toast('Catatan supervisi tersimpan.'); rerender(); };

// ================= Evaluasi & Kinerja =================
let perfPeriod = 'bulan';
async function performance() {
  const [p, refl, me] = await Promise.all([api(`/performance/me?period=${perfPeriod}`), api('/reflections'), api('/counselor-profile/me')]);
  const G = state.ref.counselor_guru;
  const PER = [['minggu', 'Mingguan'], ['bulan', 'Bulanan'], ['semester', 'Semesteran'], ['tahun', 'Tahunan']];
  const starsOf = (n) => `<span class="stars-view" aria-label="${n || 0} dari 5 bintang">${[1, 2, 3, 4, 5].map((i) => `<span class="${i <= (n || 0) ? 'on' : ''}">★</span>`).join('')}</span>`;
  const dlBtns = (period, id = '') => ['pdf', 'docx', 'xlsx'].map((f) => `<button type="button" class="btn ghost sm" data-act="raport" data-p="${period}" data-id="${id}" data-f="${f}">${{ pdf: 'PDF', docx: 'Word', xlsx: 'Excel' }[f]}</button>`).join('');
  return `<h1>Evaluasi & Kinerja</h1>
  <div class="row between wrap"><h3>Raport kinerja</h3><div class="seg-tabs">${PER.map(([k, l]) => `<button class="${perfPeriod === k ? 'on' : ''}" data-act="perfPeriod" data-p="${k}">${l}</button>`).join('')}</div></div>
  <div class="kpis"><div class="kpi"><span>Sesi selesai</span><b>${p.sesi_selesai}</b></div><div class="kpi"><span>Klien unik</span><b>${p.klien_unik}</b></div><div class="kpi"><span>Rating dari mahasiswa</span><b>${p.rating_rata ?? '—'}</b><small>${p.jumlah_rating} penilaian</small></div><div class="kpi"><span>Rating diri (rata-rata)</span><b>${p.rating_diri_rata ?? '—'}</b><small>${p.jumlah_kegiatan} kegiatan direfleksikan</small></div><div class="kpi ${p.kepatuhan_sla != null && p.kepatuhan_sla < 100 ? 'warn' : ''}"><span>Kepatuhan SLA krisis (${p.sla_menit} mnt)</span><b>${p.kepatuhan_sla != null ? p.kepatuhan_sla + '%' : '—'}</b><small>${p.krisis_ditangani} kasus</small></div><div class="kpi"><span>Rata-rata respons reservasi</span><b>${p.rata_respons_reservasi_jam != null ? p.rata_respons_reservasi_jam + ' jam' : '—'}</b></div></div>
  <section class="card"><div class="row between wrap"><h3>Unduh raport diri</h3><small class="muted">Berisi indikator kinerja, refleksi GURU, rating diri, dan catatan supervisor.</small></div>
    <div class="raport-grid">${PER.map(([k, l]) => `<div class="raport-row"><b>${l}</b><span class="row wrap">${dlBtns(k)}</span></div>`).join('')}</div>
    <p class="small muted">Raport per kegiatan dapat diunduh dari setiap entri di portofolio refleksi di bawah.</p></section>
  <section class="card"><h3>Catatan kualitatif supervisor</h3>${p.catatan_supervisor.map((n) => `<div class="mini-row"><span><b>${esc(n.periode)}</b><br>Kekuatan utama: ${esc(n.kekuatan)}<br>Area pengembangan: ${esc(n.area_pengembangan)}</span></div>`).join('') || '<p class="muted">Belum ada catatan supervisor.</p>'}</section>
  <div class="grid-2 wide-left"><section class="card"><h3>Refleksi kinerja (model GURU)</h3><form data-form="reflection" class="stack">
      <div class="form-grid"><label>Jenis layanan / kegiatan<input id="rf_srv" name="jenis_layanan" required maxlength="120" placeholder="Ketik, mis. Konseling individu mahasiswa tingkat akhir"></label>
      <label>Tanggal kegiatan<input id="rf_date" name="tanggal_kegiatan" type="date" value="${new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)}" required></label></div>
      ${G.map((g) => `<label><span><b>${esc(g.nama)}</b> — ${esc(g.tanya)}</span><textarea id="rf_${g.kode}" name="${g.kode}" rows="3"></textarea></label>`).join('')}
      <fieldset class="star-input"><legend>Rating kinerja pada kegiatan ini</legend><div class="stars-pick">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="rf_star${n}" name="rating" value="${n}" ${n === 1 ? 'required' : ''}><label for="rf_star${n}" title="${n} bintang">★</label>`).join('')}</div><small class="muted">1 = perlu banyak perbaikan · 5 = sangat baik</small></fieldset>
      <button class="btn primary" type="submit">Simpan refleksi</button></form></section>
  <section class="card"><h3>Profil layanan</h3><form data-form="serviceSettings" class="stack"><label>Spesialisasi<input id="ss_spec" name="spesialisasi" value="${esc(me.spesialisasi || '')}"></label><button class="btn" type="submit">Simpan</button></form>
    <h4>Jadwal ketersediaan</h4>${me.jadwal_ringkas.length ? `<ul class="plain small">${me.jadwal_ringkas.map((j) => `<li>${esc(j)}</li>`).join('')}</ul>` : '<p class="muted small">Belum ada slot aktif.</p>'}
    <p class="small muted">Informed consent versi ${me.consent_versi || 'bawaan'} · ${me.slot_tersedia} slot tersedia 2 minggu ke depan.</p><a class="btn ghost sm" href="#/c/pengaturan">Atur jadwal & informed consent</a></section></div>
  <section class="card"><h3>Portofolio refleksi (${refl.length})</h3>${refl.length ? refl.map((r) => `<details class="entry"><summary><span><b>${esc(r.jenis_layanan)}</b><br><small class="muted">${fmtDate(r.tanggal_kegiatan)}</small></span> ${starsOf(r.rating)}</summary>
      <dl class="kv stacked">${G.map((g) => `<dt>${esc(g.nama)} — ${esc(g.tanya)}</dt><dd class="pre">${esc(r[g.kode] || '—')}</dd>`).join('')}</dl>
      <div class="row wrap between"><span class="row wrap"><small class="muted">Unduh raport kegiatan:</small> ${dlBtns('kegiatan', r.id)}</span><button class="link small" data-act="reflDel" data-id="${r.id}">Hapus</button></div></details>`).join('') : '<p class="muted">Belum ada refleksi.</p>'}</section>`;
}
actions.perfPeriod = (el) => { perfPeriod = el.dataset.p; rerender(); };
forms.reflection = async (d, f) => { if (!d.rating) return toast('Beri rating bintang untuk kinerja kegiatan ini.', 'warn'); await api('/reflections', { method: 'POST', body: { ...d, rating: Number(d.rating) } }); f.reset(); toast('Refleksi tersimpan di portofolio.'); rerender(); };
actions.reflDel = async (el) => { if (!(await confirmBox('Hapus refleksi ini dari portofolio?', { ok: 'Hapus' }))) return; await api(`/reflections/${el.dataset.id}`, { method: 'DELETE' }); rerender(); };
actions.raport = async (el) => {
  const qs = new URLSearchParams({ period: el.dataset.p, format: el.dataset.f, ...(el.dataset.id && { id: el.dataset.id }) });
  el.disabled = true;
  await download(`/performance/report?${qs}`, `raport-diri-${el.dataset.p}.${el.dataset.f}`).finally(() => { el.disabled = false; });
  toast('Raport diri diunduh.');
};
forms.serviceSettings = async (d) => { await api('/counselor-profile/me', { method: 'PATCH', body: { spesialisasi: d.spesialisasi } }); toast('Profil layanan disimpan.'); };

// ================= Admin: pendaftar konselor =================
const ST = { menunggu_persetujuan: ['Menunggu persetujuan', 'warn'], menunggu_verifikasi: ['Belum verifikasi email', ''], aktif: ['Aktif', 'ok'], ditolak: ['Ditolak', 'crit'], nonaktif: ['Nonaktif', ''] };
let regFilter = 'menunggu_persetujuan';
async function registrants() {
  const d = await api('/admin/counselors'); const isAdmin = state.user.role === 'admin';
  REG_CAMPUS = { fakultas: d.fakultas, prodi: d.prodi }; REG_ITEMS = d.items;
  const count = (s) => d.items.filter((x) => x.status === s).length;
  const list = d.items.filter((x) => regFilter === 'semua' || x.status === regFilter);
  const card = (c) => `<section class="card reg-card"><div class="row between wrap"><div><b>${esc(c.nama)}</b> <span class="chip ${ST[c.status][1]}">${ST[c.status][0]}</span><p class="small muted">${esc(c.email)} · <span class="mono">${esc(c.nim_nip)}</span>${c.telepon ? ` · ${esc(c.telepon)}` : ''}</p></div><small class="muted">Daftar ${fmtDT(c.created_at)}</small></div>
    <dl class="kv"><dt>Profesi / lisensi</dt><dd>${esc(c.gelar || '—')}</dd><dt>Spesialisasi</dt><dd>${esc(c.spesialisasi || '—')}</dd><dt>Email</dt><dd>${c.email_verified_at ? `<span class="chip ok">Terverifikasi</span> ${fmtDT(c.email_verified_at)}` : '<span class="chip">Belum diverifikasi</span>'}</dd><dt>Konteks kerja</dt><dd>${esc(c.konteks?.ringkas || '—')}</dd><dt>Layanan konseling</dt><dd>${c.layanan_terbuka ? 'Seluruh mahasiswa kampus' : 'Hanya mahasiswa binaan'}</dd>${isAdmin ? `<dt>Kampus</dt><dd>${esc(c.universitas || '—')}</dd>` : ''}
      ${c.status === 'aktif' || c.status === 'nonaktif' ? `<dt>Disetujui</dt><dd>${esc(c.disetujui_oleh || '')} ${c.disetujui_pada ? fmtDT(c.disetujui_pada) : ''}</dd><dt>Login terakhir</dt><dd>${c.last_login_at ? ago(c.last_login_at) : '—'}</dd>` : ''}
      ${c.status === 'ditolak' ? `<dt>Alasan penolakan</dt><dd>${esc(c.alasan_penolakan || '')}</dd>` : ''}</dl>
    <div class="row wrap end">
      ${c.status === 'menunggu_persetujuan' || c.status === 'ditolak' ? `<button class="btn primary sm" data-act="regApprove" data-id="${c.id}">Setujui</button>` : ''}
      ${c.status === 'menunggu_persetujuan' ? `<button class="btn ghost sm" data-act="regReject" data-id="${c.id}">Tolak</button>` : ''}
      ${c.status === 'aktif' ? `<button class="btn ghost sm" data-act="regScope" data-id="${c.id}">Ubah konteks kerja</button><button class="btn ghost sm" data-act="regActive" data-id="${c.id}" data-a="0">Nonaktifkan</button>` : ''}
      ${c.status === 'nonaktif' ? `<button class="btn ghost sm" data-act="regActive" data-id="${c.id}" data-a="1">Aktifkan kembali</button>` : ''}
    </div></section>`;
  return `<h1>${isAdmin ? 'Pendaftar Konselor' : 'Verifikasi Konselor'}</h1>
  <p class="muted">${isAdmin ? 'Konselor juga dapat diverifikasi oleh Koordinator Layanan BK.' : 'Setujui atau tolak pendaftar konselor, atur lingkup fakultas, serta aktifkan/nonaktifkan konselor. Admin juga dapat melakukan hal yang sama.'}</p>
  <div class="kpis"><div class="kpi ${count('menunggu_persetujuan') ? 'warn' : ''}"><span>Menunggu persetujuan</span><b>${count('menunggu_persetujuan')}</b></div><div class="kpi ok"><span>Konselor aktif</span><b>${count('aktif')}</b></div><div class="kpi"><span>Mahasiswa aktif</span><b>${d.ringkasan.mahasiswa_aktif}</b><small>${d.ringkasan.pendaftar_mahasiswa_7hari} pendaftar 7 hari terakhir</small></div><div class="kpi"><span>Mahasiswa belum verifikasi</span><b>${d.ringkasan.mahasiswa_belum_verifikasi}</b></div></div>
  ${d.mail_mode === 'outbox' ? '<div class="notice warn">SMTP belum diatur. Email verifikasi dan keputusan belum benar-benar terkirim; isinya disimpan di folder <span class="mono">data/outbox</span> server. Isi variabel <span class="mono">MC_SMTP_*</span> untuk produksi.</div>' : ''}
  <div class="chips">${[['menunggu_persetujuan', 'Menunggu'], ['aktif', 'Aktif'], ['menunggu_verifikasi', 'Belum verifikasi'], ['ditolak', 'Ditolak'], ['nonaktif', 'Nonaktif'], ['semua', 'Semua']].map(([k, l]) => `<button class="chip-btn ${regFilter === k ? 'on' : ''}" data-act="regFilter" data-k="${k}">${l} (${k === 'semua' ? d.items.length : count(k)})</button>`).join('')}</div>
  ${list.map(card).join('') || empty('Tidak ada data', regFilter === 'menunggu_persetujuan' ? 'Belum ada pendaftar konselor yang menunggu persetujuan.' : '')}
  ${isAdmin && d.domain_email ? `<form data-form="domainCfg" class="card stack"><h3>Aturan email pendaftaran</h3><p class="small muted">Kosongkan untuk menerima semua domain email yang valid. Domain sekali-pakai selalu ditolak, dan domain harus memiliki server email (MX).</p>
    <div class="form-grid"><label>Domain email mahasiswa<input id="de_m" name="mahasiswa" value="${esc(d.domain_email.mahasiswa.join(', '))}" placeholder="student.unpkediri.ac.id"></label><label>Domain email konselor & koordinator<input id="de_k" name="konselor" value="${esc(d.domain_email.konselor.join(', '))}" placeholder="unpkediri.ac.id"></label></div>
    <div class="row end"><button class="btn" type="submit">Simpan aturan</button></div></form>` : ''}`;
}
actions.regFilter = (el) => { regFilter = el.dataset.k; rerender(); };
let REG_CAMPUS = { fakultas: [], prodi: [] }; let REG_ITEMS = [];
const scopeForm = (id, form, label) => {
  const c = REG_ITEMS.find((x) => x.id === id) || { lingkup_fakultas: [], lingkup_prodi: [] };
  const groups = REG_CAMPUS.fakultas.map((f) => ({ ...f, prodi: REG_CAMPUS.prodi.filter((p) => p.fakultas_kode === f.kode) }));
  return `<form data-form="${form}" data-id="${id}" class="stack"><p class="small muted">Konteks kerja awal konselor (dapat diubah konselor sendiri di menu Konseling). Konselor selalu dapat melihat mahasiswa binaannya, kliennya, dan kasus krisis terbuka saat berstatus jaga.</p>
    ${groups.length ? `<div class="ctx-grid">${groups.map((f) => `<fieldset class="ctx-fak"><legend><label class="check"><input type="checkbox" name="f_${esc(f.kode)}" value="1" ${c.lingkup_fakultas.includes(f.kode) ? 'checked' : ''}> <b>${esc(f.nama)}</b></label></legend>${f.prodi.map((p) => `<label class="check small"><input type="checkbox" name="p_${p.id}" value="1" ${c.lingkup_prodi.includes(p.id) ? 'checked' : ''}> ${esc(p.nama)}</label>`).join('')}</fieldset>`).join('')}</div>` : '<div class="notice warn small">Isi daftar fakultas & prodi kampus di menu <a href="#/k/prodi">Fakultas & Prodi</a> agar konteks kerja dapat dipilih.</div>'}
    <div class="row end"><button class="btn primary" type="submit">${label}</button></div></form>`;
};
const scopeBody = (d) => ({ lingkup_fakultas: Object.keys(d).filter((k) => k.startsWith('f_')).map((k) => k.slice(2)), lingkup_prodi: Object.keys(d).filter((k) => k.startsWith('p_')).map((k) => k.slice(2)) });
actions.regApprove = (el) => openModal(`<h3>Setujui pendaftar konselor</h3>${scopeForm(el.dataset.id, 'regApprove', 'Setujui & kirim email')}`, { wide: true });
forms.regApprove = async (d, f) => { await api(`/admin/counselors/${f.dataset.id}/approve`, { method: 'POST', body: scopeBody(d) }); closeModal(); toast('Konselor disetujui; email pemberitahuan dikirim.'); rerender(); };
actions.regScope = (el) => openModal(`<h3>Ubah konteks kerja konselor</h3>${scopeForm(el.dataset.id, 'regScope', 'Simpan')}`, { wide: true });
forms.regScope = async (d, f) => { await api(`/admin/counselors/${f.dataset.id}`, { method: 'PATCH', body: scopeBody(d) }); closeModal(); toast('Konteks kerja diperbarui; konselor diberi tahu.'); rerender(); };
actions.regReject = (el) => openModal(`<h3>Tolak pendaftaran</h3><form data-form="regReject" data-id="${el.dataset.id}" class="stack"><label>Alasan (dikirim ke email pendaftar)<textarea id="rj_reason" name="alasan" rows="3" required minlength="5" placeholder="Contoh: Dokumen lisensi praktik belum dapat diverifikasi. Silakan hubungi Unit Layanan Konseling."></textarea></label><div class="row end"><button class="btn crit" type="submit">Tolak pendaftaran</button></div></form>`);
forms.regReject = async (d, f) => { await api(`/admin/counselors/${f.dataset.id}/reject`, { method: 'POST', body: d }); closeModal(); toast('Pendaftaran ditolak; email pemberitahuan dikirim.'); rerender(); };
actions.regActive = async (el) => {
  if (el.dataset.a === '0' && !(await confirmBox('Nonaktifkan konselor ini? Konselor akan keluar dari semua perangkat dan tidak bisa masuk.', { ok: 'Nonaktifkan' }))) return;
  await api(`/admin/counselors/${el.dataset.id}`, { method: 'PATCH', body: { aktif: el.dataset.a === '1' } }); rerender();
};
forms.domainCfg = async (d) => { await api('/admin/config', { method: 'PUT', body: { domain_email: d } }); toast('Aturan email pendaftaran disimpan.'); rerender(); };

// ================= Admin: web Home & profil =================
let homeTab = 'utama';
const pairsToText = (arr, a, b) => arr.map((x) => `${x[a]} | ${x[b]}`).join('\n');
const textToPairs = (t, a, b) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { const i = l.indexOf('|'); return i < 0 ? { [a]: l, [b]: '' } : { [a]: l.slice(0, i).trim(), [b]: l.slice(i + 1).trim() }; });
async function homeEditor() {
  const [h, cfg] = await Promise.all([api('/admin/home'), api('/admin/config')]);
  const tabs = [['utama', 'Identitas & hero'], ['blok', 'Blok & media'], ['profil', 'Profil, visi & misi'], ['overview', 'Overview & alur'], ['faq', 'FAQ & kontak'], ['layanan', 'Pengaturan layanan']];
  HOMEB = (h.blok || []).map((b) => ({ ...b })); HOMEH = h;
  const f = (name, label, val, opts = {}) => opts.area ? `<label class="${opts.full ? 'full' : ''}">${label}<textarea id="h_${name}" name="${name}" rows="${opts.rows || 3}">${esc(val)}</textarea>${opts.hint ? `<small class="muted">${opts.hint}</small>` : ''}</label>` : `<label class="${opts.full ? 'full' : ''}">${label}<input id="h_${name}" name="${name}" value="${esc(val)}"></label>`;
  let body = '';
  if (homeTab === 'utama') body = `<form data-form="homeSave" class="card form-grid">
      <div class="full logo-edit"><img src="${esc(h.logo_url)}" alt="Logo" id="logoPreview"><div class="stack"><label>Ganti logo (PNG/JPG/WEBP, maks. 5 MB; disarankan latar transparan)<input type="file" id="logo_file" accept="image/png,image/jpeg,image/webp" data-change="logoUpload"></label><input type="hidden" name="logo_url" id="h_logo_url" value="${esc(h.logo_url)}"><button type="button" class="btn ghost sm" data-act="logoDefault">Kembalikan logo bawaan</button></div></div>
      ${f('nama_singkat', 'Nama aplikasi', h.nama_singkat)}${f('institusi', 'Institusi', h.institusi)}${f('kepanjangan', 'Kepanjangan nama', h.kepanjangan, { full: true })}
      ${f('hero_eyebrow', 'Label kecil di atas judul', h.hero_eyebrow, { full: true })}${f('hero_judul', 'Judul utama', h.hero_judul, { full: true, area: true, rows: 2 })}${f('hero_deskripsi', 'Deskripsi utama', h.hero_deskripsi, { full: true, area: true })}
      ${f('pilar', 'Pilar nama (satu per baris: Huruf | Judul | Deskripsi)', h.pilar.map((p) => `${p.huruf} | ${p.judul} | ${p.deskripsi}`).join('\n'), { full: true, area: true, rows: 4 })}
      <label class="check full"><input type="checkbox" name="tampilkan_statistik" value="1" ${h.tampilkan_statistik ? 'checked' : ''}> Tampilkan statistik langsung (jumlah mahasiswa, konselor, konten, sesi)</label>
      <div class="row end full"><button class="btn primary" type="submit">Simpan</button></div></form>`;
  if (homeTab === 'profil') body = `<form data-form="homeSave" class="card form-grid">${f('tentang_judul', 'Judul bagian profil', h.tentang_judul, { full: true })}${f('tentang', 'Profil aplikasi', h.tentang, { full: true, area: true, rows: 6 })}${f('visi', 'Visi', h.visi, { full: true, area: true, rows: 2 })}${f('misi', 'Misi (satu per baris)', h.misi.join('\n'), { full: true, area: true, rows: 5 })}
      ${f('konselor_judul', 'Judul bagian konselor', h.konselor_judul, { full: true })}${f('konselor_deskripsi', 'Deskripsi bagian konselor', h.konselor_deskripsi, { full: true, area: true })}<div class="row end full"><button class="btn primary" type="submit">Simpan</button></div></form>`;
  if (homeTab === 'overview') body = `<form data-form="homeSave" class="card form-grid">${f('fitur', 'Fitur aplikasi (satu per baris: Judul | Deskripsi)', pairsToText(h.fitur, 'judul', 'deskripsi'), { full: true, area: true, rows: 9 })}${f('alur', 'Alur layanan (satu per baris: Judul | Deskripsi)', pairsToText(h.alur, 'judul', 'deskripsi'), { full: true, area: true, rows: 5 })}<div class="row end full"><button class="btn primary" type="submit">Simpan</button></div></form>`;
  if (homeTab === 'faq') body = `<form data-form="homeSave" class="card form-grid">${f('faq', 'FAQ (satu per baris: Pertanyaan | Jawaban)', pairsToText(h.faq, 'tanya', 'jawab'), { full: true, area: true, rows: 7 })}
      ${f('kontak_alamat', 'Alamat', h.kontak_alamat, { full: true })}${f('kontak_email', 'Email', h.kontak_email)}${f('kontak_telepon', 'Telepon', h.kontak_telepon)}${f('kontak_jam', 'Jam layanan', h.kontak_jam)}${f('footer', 'Teks footer', h.footer)}<div class="row end full"><button class="btn primary" type="submit">Simpan</button></div></form>`;
  if (homeTab === 'blok') {
    const hm = h.hero_media || { tipe: 'tidak' };
    body = `<section class="card"><div class="row between wrap"><div><h3>Blok tambahan halaman utama</h3><p class="small muted">Sisipkan gambar, video, video YouTube, animasi, atau kode embed (Canva, Lottie, Google Slides, widget) di antara bagian halaman. Kode tempelan dijalankan di bingkai terisolasi sehingga aman untuk data login pengguna.</p></div><button class="btn primary" data-act="blokEdit">Tambah blok</button></div>
      ${HOMEB.length ? `<div class="blok-list">${HOMEB.map((b, i) => `<div class="blok-row ${b.tampil ? '' : 'faded'}"><div><b>${esc(b.judul || '(tanpa judul)')}</b><br><small class="muted">${esc(POS_LABEL[b.posisi] || b.posisi)} · ${esc(MEDIA_LABEL[b.media?.tipe] || 'Tanpa media')} · ${b.tata_letak === 'penuh' ? 'lebar penuh' : `media di ${b.tata_letak}`}${b.tampil ? '' : ' · disembunyikan'}</small></div>
        <div class="row wrap"><button class="btn ghost sm" data-act="blokMove" data-i="${i}" data-d="-1" ${i ? '' : 'disabled'} aria-label="Naik">↑</button><button class="btn ghost sm" data-act="blokMove" data-i="${i}" data-d="1" ${i < HOMEB.length - 1 ? '' : 'disabled'} aria-label="Turun">↓</button><button class="btn ghost sm" data-act="blokEdit" data-i="${i}">Ubah</button><button class="btn ghost sm" data-act="blokToggle" data-i="${i}">${b.tampil ? 'Sembunyikan' : 'Tampilkan'}</button><button class="btn ghost sm" data-act="blokDel" data-i="${i}">Hapus</button></div></div>`).join('')}</div>` : '<p class="muted">Belum ada blok tambahan.</p>'}</section>
    <form data-form="heroMedia" class="card form-grid"><h3 class="full">Media di samping judul utama (hero)</h3><p class="small muted full">Mengganti logo besar di bagian atas dengan gambar, video, animasi, atau embed.</p>${mediaFields(hm, 'hm')}<div class="row end full"><button class="btn primary" type="submit">Simpan media hero</button></div></form>
    <form data-form="hideSections" class="card stack"><h3>Tampilkan / sembunyikan bagian bawaan</h3><div class="check-grid">${Object.entries(SEC_LABEL).map(([k, l]) => `<label class="check"><input type="checkbox" name="s_${k}" value="1" ${(h.sembunyikan || []).includes(k) ? '' : 'checked'}> ${l}</label>`).join('')}</div><div class="row end"><button class="btn primary" type="submit">Simpan</button></div></form>`;
  }
  if (homeTab === 'layanan') { body = `<form data-form="cfgService" class="card form-grid"><h3 class="full">Layanan</h3><label>SLA tindak lanjut risiko merah (menit)<input id="cfg_sla" name="sla_menit" type="number" min="5" max="240" value="${cfg.sla_menit}"></label><label>Versi kebijakan privasi<input id="cfg_ver" name="versi_kebijakan" value="${esc(cfg.versi_kebijakan)}"></label>
      <label class="check full"><input type="checkbox" name="ai_enabled" value="1" ${cfg.ai_enabled ? 'checked' : ''}> Aktifkan saran AI untuk konselor (mode: ${cfg.ai_mode === 'model' ? 'model bahasa' : 'generator berbasis aturan'})</label>
      <div class="row end full"><button class="btn primary" type="submit">Simpan</button></div></form>`; }
  return `<div class="row between wrap"><h1>Web Home & Profil</h1><div class="row wrap"><a class="btn ghost" href="#/" target="_blank" rel="noopener">Pratinjau Home</a><button class="btn ghost" data-act="homeReset">Kembalikan isi bawaan</button></div></div>
  <div class="tabs">${tabs.map(([k, l]) => `<a href="#" class="${homeTab === k ? 'on' : ''}" data-act="homeTab" data-k="${k}">${l}</a>`).join('')}</div>${body}`;
}
actions.homeTab = (el) => { homeTab = el.dataset.k; rerender(); };
forms.homeSave = async (d) => {
  const body = { ...d };
  if ('pilar' in d) body.pilar = d.pilar.split('\n').map((l) => l.split('|').map((x) => x.trim())).filter((x) => x[0]).map(([huruf, judul, deskripsi]) => ({ huruf, judul: judul || '', deskripsi: deskripsi || '' }));
  if ('misi' in d) body.misi = d.misi.split('\n').map((x) => x.trim()).filter(Boolean);
  if ('fitur' in d) body.fitur = textToPairs(d.fitur, 'judul', 'deskripsi');
  if ('alur' in d) body.alur = textToPairs(d.alur, 'judul', 'deskripsi');
  if ('faq' in d) body.faq = textToPairs(d.faq, 'tanya', 'jawab');
  if (homeTab === 'utama') body.tampilkan_statistik = !!d.tampilkan_statistik;
  await api('/admin/home', { method: 'PUT', body });
  state.pub = await api('/public/config');
  toast('Web Home diperbarui.'); rerender();
};
forms.cfgService = async (d) => {
  await api('/admin/config', { method: 'PUT', body: { sla_menit: Number(d.sla_menit), versi_kebijakan: d.versi_kebijakan, ai_enabled: !!d.ai_enabled } }); toast('Pengaturan layanan disimpan.');
};
changeHandlers.logoUpload = async (el) => {
  const file = el.files[0]; if (!file) return;
  const r = await api('/admin/uploads', { method: 'POST', body: file, headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name) } });
  document.getElementById('h_logo_url').value = r.url; document.getElementById('logoPreview').src = r.url; toast('Logo terunggah. Klik Simpan untuk menerapkan.');
};
actions.logoDefault = () => { document.getElementById('h_logo_url').value = '/logo.png'; document.getElementById('logoPreview').src = '/logo.png'; };
actions.homeReset = async () => { if (!(await confirmBox('Kembalikan seluruh isi web Home ke teks bawaan?', { ok: 'Kembalikan' }))) return; await api('/admin/home/reset', { method: 'POST' }); state.pub = await api('/public/config'); toast('Isi bawaan dipulihkan.'); rerender(); };

// ================= Admin: pendaftar Koordinator Layanan BK =================
let coordFilter = 'menunggu_persetujuan';
// ================= Admin: Konselor PAN-JALU =================
let pjFilter = 'menunggu';
const PJ_ST = { menunggu: ['Menunggu persetujuan', 'warn'], aktif: ['Aktif', 'ok'], ditolak: ['Ditolak', 'crit'], dicabut: ['Dicabut admin', ''], dilepas: ['Dilepas konselor', ''] };
async function adminPanjalu() {
  const d = await api(`/admin/panjalu${pjFilter !== 'semua' ? `?status=${pjFilter}` : ''}`);
  const r = d.ringkasan;
  const card = (c) => `<section class="card reg-card"><div class="row between wrap"><div><b>${esc(c.nama)}</b> <span class="chip ${PJ_ST[c.status][1]}">${PJ_ST[c.status][0]}</span> ${c.independen ? '<span class="chip">Independen</span>' : ''} ${c.status === 'aktif' ? `<span class="chip ${c.status_jaga ? 'ok' : ''}">${c.status_jaga ? 'Jaga' : 'Tidak jaga'}</span>` : ''}
      <p class="small muted">${esc(c.email)} · <span class="mono">${esc(c.nip || '')}</span></p></div><small class="muted">Diajukan ${fmtDT(c.diajukan_pada)}</small></div>
    <dl class="kv"><dt>Asal</dt><dd>${esc(c.asal)}</dd><dt>Profesi / spesialisasi</dt><dd>${esc([c.gelar, c.spesialisasi].filter(Boolean).join(' · ') || '—')}</dd><dt>Alasan & pengalaman</dt><dd>${esc(c.alasan || '—')}</dd>
      <dt>Akun</dt><dd>${esc(c.status_akun.replace(/_/g, ' '))}${c.terakhir_masuk ? ` · terakhir masuk ${ago(c.terakhir_masuk)}` : ''}</dd>
      ${c.status === 'aktif' ? `<dt>Konseli PAN-JALU</dt><dd><b>${c.konseli}</b> / kapasitas ${c.kapasitas}</dd>` : ''}
      ${c.peninjau ? `<dt>Ditinjau</dt><dd>${esc(c.peninjau)} · ${c.ditinjau_pada ? fmtDT(c.ditinjau_pada) : ''}</dd>` : ''}${c.catatan ? `<dt>Catatan</dt><dd>${esc(c.catatan)}</dd>` : ''}</dl>
    <div class="row wrap end">${c.status === 'menunggu' ? `<button class="btn primary sm" data-act="pjAdm" data-id="${c.id}" data-k="approve" data-cap="${c.kapasitas}">Setujui</button><button class="btn ghost sm" data-act="pjAdm" data-id="${c.id}" data-k="reject">Tolak</button>` : ''}
      ${c.status === 'aktif' ? `<button class="btn ghost sm" data-act="pjAdm" data-id="${c.id}" data-k="cap" data-cap="${c.kapasitas}">Ubah kapasitas</button><button class="btn ghost sm" data-act="pjAdm" data-id="${c.id}" data-k="revoke">Cabut status</button>` : ''}</div></section>`;
  return `<h1>Konselor PAN-JALU</h1>
  <p class="muted">Konselor PAN-JALU melayani mahasiswa lintas kampus — terutama mahasiswa yang kampusnya belum memiliki konselor. Mahasiswa memilih sendiri Konselor PAN-JALU-nya dengan persetujuan akses data, dan dapat menggantinya kapan saja. Admin menyetujui, mengatur kapasitas konseli, dan mencabut status. Admin tidak melihat identitas konseli.</p>
  <div class="kpis"><div class="kpi ${d.jumlah.menunggu ? 'warn' : ''}"><span>Pengajuan menunggu</span><b>${d.jumlah.menunggu || 0}</b></div><div class="kpi ok"><span>Konselor PAN-JALU aktif</span><b>${d.jumlah.aktif || 0}</b></div>
    <div class="kpi"><span>Konseli PAN-JALU</span><b>${r.konseli_panjalu}</b></div><div class="kpi ${r.tanpa_layanan ? 'warn' : ''}"><span>Mahasiswa tanpa konselor di kampus tanpa konselor</span><b>${r.tanpa_layanan}</b><small>${r.kampus_tanpa_konselor} kampus</small></div>
    <div class="kpi ${r.krisis_terbuka ? 'crit' : ''}"><span>Kasus darurat terbuka (ranah PAN-JALU)</span><b>${r.krisis_terbuka}</b></div></div>
  <div class="chips">${[['menunggu', 'Menunggu'], ['aktif', 'Aktif'], ['ditolak', 'Ditolak'], ['dicabut', 'Dicabut'], ['dilepas', 'Dilepas'], ['semua', 'Semua']].map(([k, l]) => `<button class="chip-btn ${pjFilter === k ? 'on' : ''}" data-act="pjFilter" data-k="${k}">${l}</button>`).join('')}</div>
  ${d.items.map(card).join('') || empty('Tidak ada data', pjFilter === 'menunggu' ? 'Belum ada pengajuan Konselor PAN-JALU yang menunggu.' : '')}`;
}
actions.pjFilter = (el) => { pjFilter = el.dataset.k; rerender(); };
actions.pjAdm = (el) => {
  const { id, k, cap } = el.dataset;
  const T = { approve: ['Setujui Konselor PAN-JALU', 'Setujui', 'primary'], reject: ['Tolak pengajuan Konselor PAN-JALU', 'Tolak', 'crit'], revoke: ['Cabut status Konselor PAN-JALU', 'Cabut status', 'crit'], cap: ['Ubah kapasitas konseli', 'Simpan', 'primary'] }[k];
  openModal(`<h3>${T[0]}</h3><form data-form="pjAdm" data-id="${id}" data-k="${k}" class="stack">
    ${['approve', 'cap'].includes(k) ? `<label>Kapasitas konseli PAN-JALU<input name="kapasitas" type="number" min="1" max="500" value="${esc(cap || '50')}" required></label>` : ''}
    ${k === 'revoke' ? '<p class="small">Seluruh konseli PAN-JALU konselor ini akan diberi tahu dan diminta memilih konselor baru; akses konselor ke data mereka berakhir. Konselor independen juga dinonaktifkan akunnya.</p>' : ''}
    ${['reject', 'revoke'].includes(k) ? '<label>Alasan (dikirim ke konselor)<textarea name="catatan" rows="3" required minlength="5" maxlength="500"></textarea></label>' : ''}
    ${k === 'approve' ? '<label>Catatan (opsional)<input name="catatan" maxlength="500"></label>' : ''}
    <div class="row end"><button class="btn ${T[2]}" type="submit">${T[1]}</button></div></form>`);
};
forms.pjAdm = async (d, f) => {
  const { id, k } = f.dataset; const body = { ...d, ...(d.kapasitas ? { kapasitas: Number(d.kapasitas) } : {}) };
  const r = await (k === 'cap' ? api(`/admin/panjalu/${id}`, { method: 'PATCH', body }) : api(`/admin/panjalu/${id}/${k}`, { method: 'POST', body }));
  closeModal(); toast({ approve: 'Konselor PAN-JALU disetujui.', reject: 'Pengajuan ditolak.', revoke: `Status dicabut; ${r.konseli_dilepas ?? 0} konseli diberi tahu.`, cap: 'Kapasitas diperbarui.' }[k]); rerender();
};

let coordTab = 'akun'; let claimFilter = 'menunggu';
const CLAIM_ST = { menunggu: ['Menunggu persetujuan', 'warn'], disetujui: ['Disetujui · merangkap', 'ok'], ditolak: ['Ditolak', 'crit'], dibatalkan: ['Dibatalkan konselor', ''], dilepas: ['Dilepas konselor', ''], dicabut: ['Dicabut admin', ''] };
async function coordRegistrants() {
  const [d, cl] = await Promise.all([api('/admin/coordinators'), api(`/admin/coord-claims${claimFilter !== 'semua' ? `?status=${claimFilter}` : ''}`)]);
  const nWait = cl.jumlah.menunggu || 0;
  const tabs = `<div class="tabs">${[['akun', 'Pendaftar akun koordinator'], ['klaim', `Klaim konselor (rangkap)${nWait ? ` · ${nWait} menunggu` : ''}`]].map(([k, l]) => `<a href="#" class="${coordTab === k ? 'on' : ''}" data-act="coordTab" data-k="${k}">${l}</a>`).join('')}</div>`;
  if (coordTab === 'klaim') {
    const card = (c) => `<section class="card reg-card"><div class="row between wrap"><div><b>${esc(c.nama)}</b> <span class="chip ${CLAIM_ST[c.status][1]}">${CLAIM_ST[c.status][0]}</span><p class="small muted">${esc(c.email)} · <span class="mono">${esc(c.nip || '')}</span></p></div><small class="muted">Diajukan ${fmtDT(c.diajukan_pada)}</small></div>
      <dl class="kv"><dt>Perguruan tinggi</dt><dd>${esc(c.universitas || '—')}</dd><dt>Spesialisasi</dt><dd>${esc(c.spesialisasi || '—')}</dd><dt>Alasan</dt><dd>${esc(c.alasan || '—')}</dd>
      ${c.koordinator_lain?.length ? `<dt>Perhatian</dt><dd><span class="chip warn">Kampus kini sudah punya koordinator: ${esc(c.koordinator_lain.join(', '))}</span></dd>` : ''}
      ${c.peninjau ? `<dt>Ditinjau</dt><dd>${esc(c.peninjau)} · ${c.ditinjau_pada ? fmtDT(c.ditinjau_pada) : ''}</dd>` : ''}${c.catatan ? `<dt>Catatan</dt><dd>${esc(c.catatan)}</dd>` : ''}</dl>
      <div class="row wrap end">${c.status === 'menunggu' ? `<button class="btn primary sm" data-act="claimApprove" data-id="${c.id}">Setujui</button><button class="btn ghost sm" data-act="claimDecide" data-id="${c.id}" data-k="reject">Tolak</button>` : ''}
      ${c.status === 'disetujui' ? `<button class="btn ghost sm" data-act="claimDecide" data-id="${c.id}" data-k="revoke">Cabut peran rangkap</button>` : ''}</div></section>`;
    return `<h1>Pendaftar Koordinator Layanan BK</h1>${tabs}
    <p class="muted">Konselor aktif dapat mengajukan diri merangkap Koordinator Layanan BK bila kampusnya belum memiliki koordinator. Setelah disetujui, konselor memakai satu akun dengan pengalih <b>Konselor | Koordinator BK</b>. Admin dapat mencabut peran rangkap kapan saja.</p>
    <div class="kpis"><div class="kpi ${nWait ? 'warn' : ''}"><span>Menunggu persetujuan</span><b>${nWait}</b></div><div class="kpi ok"><span>Konselor merangkap koordinator</span><b>${cl.jumlah.disetujui || 0}</b></div></div>
    <div class="chips">${[['menunggu', 'Menunggu'], ['disetujui', 'Disetujui'], ['ditolak', 'Ditolak'], ['dicabut', 'Dicabut'], ['semua', 'Semua']].map(([k, l]) => `<button class="chip-btn ${claimFilter === k ? 'on' : ''}" data-act="claimFilter" data-k="${k}">${l}</button>`).join('')}</div>
    ${cl.items.map(card).join('') || empty('Tidak ada data', claimFilter === 'menunggu' ? 'Belum ada pengajuan konselor yang menunggu persetujuan.' : '')}`;
  }
  const count = (s) => d.items.filter((x) => x.status === s).length;
  const list = d.items.filter((x) => coordFilter === 'semua' || x.status === coordFilter);
  const card = (c) => `<section class="card reg-card"><div class="row between wrap"><div><b>${esc(c.nama)}</b> <span class="chip ${ST[c.status][1]}">${ST[c.status][0]}</span><p class="small muted">${esc(c.email)} · <span class="mono">${esc(c.nim_nip)}</span>${c.telepon ? ` · ${esc(c.telepon)}` : ''}</p></div><small class="muted">Daftar ${fmtDT(c.created_at)}</small></div>
    <dl class="kv"><dt>Jabatan</dt><dd>${esc(c.jabatan || '—')}</dd><dt>Unit kerja</dt><dd>${esc(c.unit || '—')}</dd><dt>Email</dt><dd>${c.email_verified_at ? `<span class="chip ok">Terverifikasi</span> ${fmtDT(c.email_verified_at)}` : '<span class="chip">Belum diverifikasi</span>'}</dd>
      ${c.status === 'aktif' || c.status === 'nonaktif' ? `<dt>Disetujui</dt><dd>${esc(c.disetujui_oleh || '')} ${c.disetujui_pada ? fmtDT(c.disetujui_pada) : ''}</dd><dt>Login terakhir</dt><dd>${c.last_login_at ? ago(c.last_login_at) : '—'}</dd>` : ''}
      ${c.status === 'ditolak' ? `<dt>Alasan penolakan</dt><dd>${esc(c.alasan_penolakan || '')}</dd>` : ''}</dl>
    <div class="row wrap end">
      ${c.status === 'menunggu_persetujuan' || c.status === 'ditolak' ? `<button class="btn primary sm" data-act="coordApprove" data-id="${c.id}">Setujui</button>` : ''}
      ${c.status === 'menunggu_persetujuan' ? `<button class="btn ghost sm" data-act="coordReject" data-id="${c.id}">Tolak</button>` : ''}
      ${c.status === 'aktif' ? `<button class="btn ghost sm" data-act="coordActive" data-id="${c.id}" data-a="0">Nonaktifkan</button>` : ''}
      ${c.status === 'nonaktif' ? `<button class="btn ghost sm" data-act="coordActive" data-id="${c.id}" data-a="1">Aktifkan kembali</button>` : ''}
    </div></section>`;
  return `<h1>Pendaftar Koordinator Layanan BK</h1>${tabs}
  <p class="muted">Koordinator dapat memverifikasi & mengelola konselor, mengatur jadwal layanan konselor, memantau kasus darurat tanpa identitas mahasiswa, dan melihat laporan komunal agregat.</p>
  <div class="kpis"><div class="kpi ${count('menunggu_persetujuan') ? 'warn' : ''}"><span>Menunggu persetujuan</span><b>${count('menunggu_persetujuan')}</b></div><div class="kpi ok"><span>Koordinator aktif</span><b>${count('aktif')}</b></div></div>
  <div class="chips">${[['menunggu_persetujuan', 'Menunggu'], ['aktif', 'Aktif'], ['menunggu_verifikasi', 'Belum verifikasi'], ['ditolak', 'Ditolak'], ['nonaktif', 'Nonaktif'], ['semua', 'Semua']].map(([k, l]) => `<button class="chip-btn ${coordFilter === k ? 'on' : ''}" data-act="coordFilter" data-k="${k}">${l} (${k === 'semua' ? d.items.length : count(k)})</button>`).join('')}</div>
  ${list.map(card).join('') || empty('Tidak ada data', coordFilter === 'menunggu_persetujuan' ? 'Belum ada pendaftar koordinator yang menunggu persetujuan.' : '')}`;
}
actions.coordFilter = (el) => { coordFilter = el.dataset.k; rerender(); };
actions.coordTab = (el) => { coordTab = el.dataset.k; rerender(); };
actions.claimFilter = (el) => { claimFilter = el.dataset.k; rerender(); };
actions.claimApprove = async (el) => { if (!(await confirmBox('Setujui konselor ini merangkap Koordinator Layanan BK di kampusnya? Ia akan menerima notifikasi dan email.', { ok: 'Setujui', tone: 'primary' }))) return; await api(`/admin/coord-claims/${el.dataset.id}/approve`, { method: 'POST', body: {} }); toast('Pengajuan disetujui.'); rerender(); };
actions.claimDecide = (el) => openModal(`<h3>${el.dataset.k === 'reject' ? 'Tolak pengajuan koordinator' : 'Cabut peran rangkap koordinator'}</h3><form data-form="claimDecide" data-id="${el.dataset.id}" data-k="${el.dataset.k}" class="stack"><label>Alasan (dikirim ke konselor)<textarea name="catatan" rows="3" required minlength="5" maxlength="500"></textarea></label><div class="row end"><button class="btn ${el.dataset.k === 'reject' ? 'crit' : 'primary'}" type="submit">${el.dataset.k === 'reject' ? 'Tolak' : 'Cabut'}</button></div></form>`);
forms.claimDecide = async (d, f) => { await api(`/admin/coord-claims/${f.dataset.id}/${f.dataset.k}`, { method: 'POST', body: d }); closeModal(); toast(f.dataset.k === 'reject' ? 'Pengajuan ditolak.' : 'Peran rangkap dicabut.'); rerender(); };
actions.coordApprove = async (el) => { if (!(await confirmBox('Setujui akun Koordinator Layanan BK ini? Pendaftar akan menerima email pemberitahuan.', { ok: 'Setujui' }))) return; await api(`/admin/coordinators/${el.dataset.id}/approve`, { method: 'POST' }); toast('Koordinator disetujui; email pemberitahuan dikirim.'); rerender(); };
actions.coordReject = (el) => openModal(`<h3>Tolak pendaftaran koordinator</h3><form data-form="coordReject" data-id="${el.dataset.id}" class="stack"><label>Alasan (dikirim ke email pendaftar)<textarea id="cr_reason" name="alasan" rows="3" required minlength="5"></textarea></label><div class="row end"><button class="btn crit" type="submit">Tolak pendaftaran</button></div></form>`);
forms.coordReject = async (d, f) => { await api(`/admin/coordinators/${f.dataset.id}/reject`, { method: 'POST', body: d }); closeModal(); toast('Pendaftaran ditolak; email pemberitahuan dikirim.'); rerender(); };
actions.coordActive = async (el) => {
  if (el.dataset.a === '0' && !(await confirmBox('Nonaktifkan koordinator ini? Ia akan keluar dari semua perangkat dan tidak bisa masuk.', { ok: 'Nonaktifkan' }))) return;
  await api(`/admin/coordinators/${el.dataset.id}`, { method: 'PATCH', body: { aktif: el.dataset.a === '1' } }); rerender();
};

// ================= Koordinator Layanan BK =================
const CASE_ST = { terbuka: ['Belum ditangani', 'crit'], ditugaskan: ['Ditugaskan', 'warn'], ditindaklanjuti: ['Ditindaklanjuti', 'ok'] };
const durasi = (m) => (m < 60 ? `${m} menit` : m < 1440 ? `${Math.floor(m / 60)} jam ${m % 60} menit` : `${Math.floor(m / 1440)} hari`);
const caseRow = (x, opts = {}) => `<div class="alert-row ${x.lewat_sla ? 'over' : ''}"><div><span class="case-head"><b class="mono">${esc(x.kode)}</b> <span class="chip ${CASE_ST[x.status][1]}">${CASE_ST[x.status][0]}</span> <span class="chip">Fakultas ${esc(x.fakultas)}</span></span>
    <span class="small">Terdeteksi ${fmtDT(x.dibuat)} dari ${esc(x.sumber)} · ${x.status === 'ditindaklanjuti' ? `ditindaklanjuti ${esc(x.ditindaklanjuti.nama || '')} dalam ${durasi(x.ditindaklanjuti.waktu_respons_menit)}` : `${durasi(x.menit)} berlalu${x.lewat_sla ? ' · <b>melewati SLA</b>' : ''}`}${x.ditugaskan && x.status !== 'ditindaklanjuti' ? ` · ditugaskan ke <b>${esc(x.ditugaskan.nama)}</b>` : ''}</span></div>
    ${x.status !== 'ditindaklanjuti' && opts.assign !== false ? `<button class="btn ${x.ditugaskan ? 'ghost' : 'crit'} sm" data-act="caseAssign" data-id="${x.id}" data-kode="${esc(x.kode)}" data-cur="${x.ditugaskan?.id || ''}">${x.ditugaskan ? 'Alihkan' : 'Tugaskan konselor'}</button>` : ''}</div>`;
let CASE_COUNSELORS = [];

async function coordDashboard() {
  const d = await api('/coord/dashboard'); const k = d.kpi; CASE_COUNSELORS = d.konselor;
  const kpi = (label, val, tone, href, note) => `<a class="kpi ${tone}" href="${href}"><span>${label}</span><b>${val}</b>${note ? `<small>${note}</small>` : ''}</a>`;
  return `<div class="row between wrap"><div><span class="eyebrow">Koordinator Layanan BK Universitas</span><h1>Halo, ${esc(state.user.nama)}</h1></div></div>
  <div class="kpis">${kpi('Kasus darurat terbuka', k.kasus_terbuka, k.kasus_terbuka ? 'crit' : 'ok', '#/k/darurat', `${k.belum_ditugaskan} belum ditugaskan · ${k.lewat_sla} lewat SLA`)}${kpi('Rata-rata waktu respons', k.rata_respons_menit != null ? durasi(k.rata_respons_menit) : '—', '', '#/k/darurat', `${k.kasus_selesai_30hari} kasus selesai (30 hari)`)}${kpi('Konselor aktif', k.konselor_aktif, '', '#/k/jadwal', `${k.konselor_jaga} berstatus jaga`)}${kpi('Pendaftar konselor', k.pendaftar_konselor, k.pendaftar_konselor ? 'warn' : '', '#/k/konselor', 'menunggu verifikasi')}</div>
  <div class="kpis">${kpi('Mahasiswa aktif', k.mahasiswa_aktif, '', '#/k/laporan')}${kpi('Asesmen (30 hari)', k.asesmen_30hari, '', '#/k/laporan')}${kpi('Sesi konseling selesai (30 hari)', k.sesi_selesai_30hari, '', '#/k/jadwal', `${k.reservasi_menunggu} reservasi menunggu konfirmasi`)}</div>
  ${d.kasus_terbuka.length ? `<section class="card alert-panel"><div class="row between wrap"><h3>Kasus darurat yang perlu dipastikan penanganannya</h3><a class="btn ghost sm" href="#/k/darurat">Lihat semua</a></div><p class="small">SLA institusi ${d.sla_menit} menit. Identitas mahasiswa tidak ditampilkan; konselor yang ditugaskan dapat membuka profil mahasiswa.</p>${d.kasus_terbuka.map((x) => caseRow(x)).join('')}</section>` : '<div class="notice ok">Tidak ada kasus darurat yang terbuka.</div>'}
  <section class="card"><div class="row between wrap"><h3>Konselor</h3><a class="btn ghost sm" href="#/k/jadwal">Atur jadwal</a></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Nama</th><th>Lingkup</th><th>Status jaga</th><th>Slot jadwal aktif</th><th>Kasus darurat aktif</th></tr></thead><tbody>
    ${d.konselor.map((c) => `<tr><td><b>${esc(c.nama)}</b><br><small class="muted">${esc(c.spesialisasi || '')}</small></td><td>${esc(c.lingkup_fakultas.join(', ') || 'Klien sendiri')}</td><td><span class="chip ${c.status_jaga ? 'ok' : ''}">${c.status_jaga ? 'Jaga' : 'Tidak jaga'}</span>${c.online ? ' <span class="chip ok">Online</span>' : ''}</td><td class="num"><a href="#/k/jadwal" data-act="coordPick" data-id="${c.id}">${c.slot_aktif}</a></td><td class="num">${c.kasus_aktif || '—'}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Belum ada konselor aktif.</td></tr>'}</tbody></table></div></section>`;
}

let caseDays = 30;
async function coordCases() {
  const d = await api(`/coord/alerts?hari=${caseDays}`); CASE_COUNSELORS = d.konselor;
  const open = d.kasus.filter((x) => x.status !== 'ditindaklanjuti'); const done = d.kasus.filter((x) => x.status === 'ditindaklanjuti');
  return `<h1>Kasus Darurat</h1>
  <div class="notice info small">Data ditampilkan <b>tanpa identitas mahasiswa</b> (kode kasus & fakultas saja), sesuai prinsip kerahasiaan konseling dan UU PDP. Tugaskan konselor aktif untuk menindaklanjuti; konselor tersebut otomatis mendapat akses ke profil mahasiswa terkait dan notifikasi prioritas.</div>
  <div class="chips">${[7, 30, 90, 365].map((n) => `<button class="chip-btn ${caseDays === n ? 'on' : ''}" data-act="caseDays" data-n="${n}">${n === 365 ? '1 tahun' : `${n} hari`}</button>`).join('')}</div>
  <div class="kpis"><div class="kpi ${open.length ? 'crit' : 'ok'}"><span>Terbuka</span><b>${open.length}</b><small>${open.filter((x) => x.lewat_sla).length} melewati SLA ${d.sla_menit} menit</small></div><div class="kpi"><span>Ditindaklanjuti (${caseDays === 365 ? '1 tahun' : `${caseDays} hari`})</span><b>${done.length}</b></div>
    ${d.per_fakultas.slice(0, 3).map((g) => `<div class="kpi"><span>Fakultas ${esc(g.fakultas)}</span><b>${g.jumlah}</b><small>${g.terbuka} masih terbuka</small></div>`).join('')}</div>
  <section class="card ${open.length ? 'alert-panel' : ''}"><h3>Perlu penanganan</h3>${open.map((x) => caseRow(x)).join('') || '<p class="muted">Tidak ada kasus terbuka.</p>'}</section>
  <section class="card"><h3>Riwayat</h3>${done.map((x) => caseRow(x, { assign: false })).join('') || '<p class="muted">Belum ada kasus yang ditindaklanjuti pada periode ini.</p>'}</section>`;
}
actions.caseDays = (el) => { caseDays = Number(el.dataset.n); rerender(); };
actions.caseAssign = (el) => openModal(`<h3>${el.dataset.cur ? 'Alihkan' : 'Tugaskan'} kasus ${esc(el.dataset.kode)}</h3>
  <form data-form="caseAssign" data-id="${el.dataset.id}" class="stack"><p class="small muted">Konselor terpilih menerima notifikasi prioritas dan akses ke profil mahasiswa untuk kasus ini.</p>
  <label>Konselor<select id="ca_c" name="counselor_id" required>${CASE_COUNSELORS.map((c) => `<option value="${c.id}" ${c.id === el.dataset.cur ? 'selected' : ''}>${esc(c.nama)} — ${c.status_jaga ? 'jaga' : 'tidak jaga'}${c.online ? ', online' : ''} · lingkup ${esc(c.lingkup_fakultas.join(', ') || 'klien sendiri')} · ${c.kasus_aktif} kasus aktif</option>`).join('')}</select></label>
  <div class="row end"><button class="btn crit" type="submit">${el.dataset.cur ? 'Alihkan' : 'Tugaskan'}</button></div></form>`);
forms.caseAssign = async (d, f) => { await api(`/coord/alerts/${f.dataset.id}/assign`, { method: 'POST', body: d }); closeModal(); toast('Konselor ditugaskan dan sudah diberi tahu.'); rerender(); };

let COORD_CID = '';
async function coordSchedule() {
  const d = await api('/coord/dashboard'); const list = d.konselor;
  if (!list.find((c) => c.id === COORD_CID)) COORD_CID = list[0]?.id || '';
  if (!COORD_CID) return `<h1>Jadwal Konselor</h1>${empty('Belum ada konselor aktif', 'Setujui pendaftar konselor terlebih dahulu di menu Verifikasi Konselor.')}`;
  const sl = await api(`/coord/counselors/${COORD_CID}/slots`);
  SVC = sl.layanan; SLOTS = sl.slots;
  const active = sl.slots.filter((s) => s.aktif);
  return `<h1>Jadwal Konselor</h1>
  <p class="muted">Atur jadwal layanan konseling setiap konselor. Konselor tetap dapat mengatur jadwalnya sendiri; setiap perubahan dari koordinator dikirim sebagai notifikasi kepada konselor terkait.</p>
  <div class="chips">${list.map((c) => `<button class="chip-btn ${c.id === COORD_CID ? 'on' : ''}" data-act="coordPick" data-id="${c.id}">${esc(c.nama)} (${c.slot_aktif})</button>`).join('')}</div>
  <section class="card"><div class="row between wrap"><h3>Jadwal ${esc(sl.konselor.nama)}</h3><button class="btn primary sm" data-act="coordSlotNew">Tambah slot</button></div>
    <div class="slot-days">${[1, 2, 3, 4, 5, 6, 7].map((h) => { const xs = active.filter((s) => s.hari === h); return `<div class="slot-day ${xs.length ? '' : 'off'}"><b>${HARI[h]}</b>${xs.map((s) => `<span class="slot-pill">${s.jam_mulai}–${s.jam_selesai}<small>${esc(s.jenis_layanan)} · ${MODE[s.mode]} · kuota ${s.kuota}</small></span>`).join('') || '<small class="muted">Tutup</small>'}</div>`; }).join('')}</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Hari</th><th>Jam</th><th>Layanan</th><th>Mode</th><th>Kuota</th><th>Lokasi</th><th>Status</th><th></th></tr></thead><tbody>
    ${sl.slots.map((s) => `<tr class="${s.aktif ? '' : 'faded'}"><td>${s.hari_nama}</td><td class="mono">${s.jam_mulai}–${s.jam_selesai}</td><td>${esc(s.jenis_layanan)}</td><td>${MODE[s.mode]}</td><td class="num">${s.kuota}</td><td class="small">${esc(s.lokasi || '—')}</td><td><span class="chip ${s.aktif ? 'ok' : ''}">${s.aktif ? 'Aktif' : 'Nonaktif'}</span></td>
      <td class="row"><button class="btn ghost sm" data-act="coordSlotEdit" data-id="${s.id}">Ubah</button>${s.aktif ? `<button class="btn ghost sm" data-act="coordSlotOff" data-id="${s.id}">Nonaktifkan</button>` : `<button class="btn ghost sm" data-act="coordSlotOn" data-id="${s.id}">Aktifkan</button>`}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Belum ada slot untuk konselor ini.</td></tr>'}</tbody></table></div></section>`;
}
actions.coordPick = (el) => { COORD_CID = el.dataset.id; if (location.hash !== '#/k/jadwal') location.hash = '#/k/jadwal'; else rerender(); };
actions.coordSlotNew = () => openModal(`<h3>Slot ketersediaan baru</h3>${slotForm({}, '', 'coordSlotSave')}`, { wide: true });
actions.coordSlotEdit = (el) => openModal(`<h3>Ubah slot</h3>${slotForm(SLOTS.find((s) => s.id === el.dataset.id), el.dataset.id, 'coordSlotSave')}`, { wide: true });
forms.coordSlotSave = async (d, f) => { const id = f.dataset.id; await api(`/coord/counselors/${COORD_CID}/slots${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: { ...d, hari: Number(d.hari), kuota: Number(d.kuota) } }); closeModal(); toast('Jadwal disimpan; konselor diberi tahu.'); rerender(); };
actions.coordSlotOff = async (el) => { await api(`/coord/counselors/${COORD_CID}/slots/${el.dataset.id}`, { method: 'DELETE' }); toast('Slot dinonaktifkan; konselor diberi tahu.'); rerender(); };
actions.coordSlotOn = async (el) => { await api(`/coord/counselors/${COORD_CID}/slots/${el.dataset.id}`, { method: 'PATCH', body: { aktif: true } }); toast('Slot diaktifkan; konselor diberi tahu.'); rerender(); };


// ---- Konselor: pustaka konten admin (tinjau, nilai, gunakan untuk kampus) ----
let LIBF = { q: '', filter: 'semua' };
async function libraryView() {
  const c = await api('/content?sumber=admin');
  const items = c.items.filter((x) => (!LIBF.q || `${x.judul} ${x.ringkasan} ${x.kata_kunci.join(' ')}`.toLowerCase().includes(LIBF.q.toLowerCase()))
    && (LIBF.filter === 'semua' || (LIBF.filter === 'dipakai' ? x.pemakaian.dipakai_kampus_saya : !x.pemakaian.pemakaian_saya)));
  const stars = (n) => (n ? '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n)) : '');
  return `<p class="muted">Konten produksi admin. Tinjau isinya, beri penilaian, lalu pilih <b>Gunakan untuk kampus saya</b> agar konten dapat diakses seluruh mahasiswa kampus Anda. Rekomendasi konten untuk tiap mahasiswa tetap disesuaikan dengan hasil asesmennya.</p>
  <form data-form="libFilter" class="filters row wrap"><input name="q" type="search" placeholder="Cari judul/kata kunci" value="${esc(LIBF.q)}"><select name="filter"><option value="semua">Semua konten</option><option value="dipakai" ${LIBF.filter === 'dipakai' ? 'selected' : ''}>Sudah dipakai di kampus saya</option><option value="baru" ${LIBF.filter === 'baru' ? 'selected' : ''}>Belum saya tinjau</option></select><button class="btn ghost" type="submit">Terapkan</button></form>
  <div class="lib-grid">${items.map((x) => { const p = x.pemakaian; return `<section class="card lib-card ${p.dipakai_kampus_saya ? 'used' : ''}"><img class="lib-thumb" src="${esc(x.thumbnail_url || `/thumbs/${x.kategori}.svg`)}" alt="">
    <div class="stack"><div class="row wrap"><span class="chip">${esc(catLabel(x.kategori))}</span><span class="chip">${esc(typeLabel(x.tipe))}</span>${p.pemakaian_saya?.status === 'published' ? '<span class="chip ok">Saya pakai</span>' : p.dipakai_kampus_saya ? '<span class="chip ok">Sudah dipakai konselor lain di kampus ini</span>' : ''}${!p.pemakaian_saya ? '<span class="chip accent">Belum saya tinjau</span>' : ''}</div>
    <b>${esc(x.judul)}</b><small class="muted">${esc(x.ringkasan || '')}</small>
    <small class="muted">${p.dipakai_kampus} kampus memakai${p.rating_rata ? ` · <span class="stars-view">${stars(p.rating_rata)}</span> ${p.rating_rata} (${p.jumlah_ulasan} ulasan)` : ''}</small>
    <div class="row wrap"><button class="btn ghost sm" data-act="libReview" data-id="${x.id}">Tinjau & nilai</button>${p.pemakaian_saya?.status === 'published' ? `<button class="btn ghost sm" data-act="libUse" data-id="${x.id}" data-s="nonaktif">Berhenti memakai</button>` : `<button class="btn primary sm" data-act="libUse" data-id="${x.id}" data-s="published">${p.dipakai_kampus_saya ? 'Ikut gunakan' : 'Gunakan untuk kampus saya'}</button>`}</div></div></section>`; }).join('') || empty('Belum ada konten', 'Konten pustaka admin yang sudah terbit akan muncul di sini.')}</div>`;
}
forms.libFilter = (d) => { LIBF = { q: d.q || '', filter: d.filter || 'semua' }; rerender(); };
actions.libUse = async (el) => { await api(`/content/${el.dataset.id}/adopt`, { method: 'PUT', body: { status: el.dataset.s } }); toast(el.dataset.s === 'published' ? 'Konten dipublikasikan ke mahasiswa kampus Anda.' : 'Konten tidak lagi Anda pakai.'); closeModal(); rerender(); };
actions.libReview = async (el) => {
  const c = await api(`/content/${el.dataset.id}`); const p = c.pemakaian; const mine = p.pemakaian_saya || {};
  openModal(`<div class="row between wrap"><h3>${esc(c.judul)}</h3><span class="chip">${esc(typeLabel(c.tipe))}${c.durasi_atau_halaman ? ` · ${esc(c.durasi_atau_halaman)}` : ''}</span></div>
    <img class="lib-thumb lg" src="${esc(c.thumbnail_url || `/thumbs/${c.kategori}.svg`)}" alt=""><p>${esc(c.ringkasan || '')}</p>
    ${c.url_media ? `<p><a class="btn ghost sm" href="${esc(c.url_media)}" target="_blank" rel="noopener">Buka media</a></p>` : ''}
    <div class="consent-box"><p class="pre">${esc(c.isi || '')}</p></div>
    <div class="kw">${c.kata_kunci.map((k) => `<span title="${esc(k)}">${esc(kwLabel(k))}</span>`).join('')}</div>
    ${p.ulasan.length ? `<h4>Ulasan konselor lain</h4><ul class="plain">${p.ulasan.map((u) => `<li><b>${esc(u.nama)}</b> <small class="muted">${esc(u.kampus || '')}</small> ${u.rating ? `<span class="stars-view">${'★'.repeat(u.rating)}</span>` : ''}<br><small>${esc(u.ulasan)}</small></li>`).join('')}</ul>` : ''}
    <form data-form="libReviewSave" data-id="${c.id}" class="stack"><h4>Penilaian Anda</h4>
      <div class="stars-pick" role="radiogroup" aria-label="Penilaian">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="lr${n}" name="rating" value="${n}" ${mine.rating === n ? 'checked' : ''}><label for="lr${n}" title="${n} bintang">★</label>`).join('')}</div>
      <label>Ulasan untuk admin & konselor lain (opsional)<textarea name="ulasan" rows="2" placeholder="Kesesuaian dengan kebutuhan mahasiswa, bahasa, akurasi…">${esc(mine.ulasan || '')}</textarea></label>
      <label class="check"><input type="checkbox" name="pakai" value="1" ${mine.status === 'published' ? 'checked' : ''}> Gunakan & publikasikan ke mahasiswa kampus saya</label>
      <div class="row end"><button class="btn primary" type="submit">Simpan</button></div></form>`, { wide: true });
};
forms.libReviewSave = async (d, f) => { await api(`/content/${f.dataset.id}/adopt`, { method: 'PUT', body: { rating: d.rating ? Number(d.rating) : null, ulasan: d.ulasan || '', status: d.pakai ? 'published' : 'nonaktif' } }); closeModal(); toast('Tinjauan disimpan.'); rerender(); };

// ---- Admin: kelola konten psikoedukasi berdasarkan kebutuhan seluruh mahasiswa ----
let adminContentTab = 'analisis'; let NEEDU = '';
async function adminContent() {
  const tabs = `<div class="tabs">${[['analisis', 'Analisis konten'], ['kebutuhan', 'Semua kebutuhan konten'], ['pustaka', 'Pustaka konten admin']].map(([k, l]) => `<a href="#" class="${adminContentTab === k ? 'on' : ''}" data-act="adminContentTab" data-k="${k}">${l}</a>`).join('')}</div>`;
  if (adminContentTab === 'pustaka') return `<h1>Konten Psikoedukasi</h1>${tabs}${await contentTable()}`;
  if (adminContentTab === 'analisis') return `<h1>Konten Psikoedukasi</h1>${tabs}${await contentAnalytics()}`;
  const [n, ov] = await Promise.all([api(`/admin/content-needs${NEEDU ? `?universitas=${NEEDU}` : ''}`), api('/admin/cohort/options')]);
  const done = n.kebutuhan.filter((x) => x.selesai).length;
  const pct = (x) => `${x.persen}%`;
  return `<h1>Konten Psikoedukasi</h1>${tabs}
  <p class="muted">Kebutuhan dihitung dari butir pemicu pada hasil asesmen terakhir <b>${n.jumlah_mahasiswa}</b> mahasiswa terdaftar${n.universitas ? ` di ${esc(n.universitas)}` : ' di seluruh kampus'}. Buat konten untuk butir yang paling banyak dialami, lalu centang <b>selesai</b> setelah kontennya terbit di pustaka.</p>
  <form data-form="needFilter" class="filters row wrap"><select name="universitas"><option value="">Seluruh kampus</option>${ov.universitas.map((u) => `<option value="${u.id}" ${NEEDU === u.id ? 'selected' : ''}>${esc(u.nama)} (${u.n})</option>`).join('')}</select><button class="btn ghost" type="submit">Terapkan</button><span class="spacer"></span><span class="chip ok">${done}/${n.kebutuhan.length} selesai</span></form>
  <section class="card"><h3>Dimensi yang paling melemah</h3>${bars(n.dimensi.map((d) => ({ label: `${d.kode} ${d.nama}`, value: d.persen, tone: d.persen >= 40 ? 'crit' : d.persen >= 20 ? 'warn' : 'ok', note: `${d.melemah} mhs` })))}</section>
  <section class="card"><div class="table-wrap"><table class="table"><thead><tr><th>Selesai</th><th>Butir & kebutuhan</th><th>Mahasiswa</th><th>Kata kunci</th><th>Konten pustaka yang cocok</th><th></th></tr></thead><tbody>
  ${n.kebutuhan.map((x) => `<tr class="${x.selesai ? 'faded' : ''}"><td><label class="check"><input type="checkbox" data-change="needDone" data-k="${x.kunci}" ${x.selesai ? 'checked' : ''} aria-label="Tandai selesai"></label></td>
    <td><b>Butir ${x.no} · ${esc(x.dimensi)} ${esc(x.dimensi_nama || '')}</b><br><small>${esc(x.aspek || '')}</small><br><small class="muted">“${esc(x.pernyataan)}”</small>${x.selesai ? `<br><small class="ok-text">Selesai${x.ditandai_oleh ? ` · ${esc(x.ditandai_oleh)}` : ''} ${x.ditandai_pada ? fmtDate(x.ditandai_pada) : ''}</small>` : ''}</td>
    <td class="num"><b>${x.mahasiswa}</b><br><small class="muted">${pct(x)}</small></td>
    <td><div class="kw">${x.kata_kunci.slice(0, 5).map((k) => `<span title="${esc(k)}">${esc(kwLabel(k))}</span>`).join('')}</div></td>
    <td class="small">${x.konten_cocok.length ? x.konten_cocok.slice(0, 3).map((c) => `${esc(c.judul)} <span class="chip ${c.status === 'published' ? 'ok' : ''}">${c.status === 'published' ? 'Terbit' : 'Draft'}</span>`).join('<br>') : '<span class="warn-text">Belum ada</span>'}</td>
    <td><button class="btn ${x.konten_cocok.length ? 'ghost' : 'primary'} sm" data-act="contentEdit" data-kws="${esc(x.kata_kunci.join('|'))}" data-cat="${x.dimensi}" data-title="${esc(x.aspek || '')}">Buat konten</button></td></tr>`).join('')}</tbody></table></div></section>`;
}
actions.adminContentTab = (el) => { adminContentTab = el.dataset.k; rerender(); };
forms.needFilter = (d) => { NEEDU = d.universitas || ''; rerender(); };
changeHandlers.needDone = async (el) => { await api(`/admin/content-needs/${encodeURIComponent(el.dataset.k)}`, { method: 'PUT', body: { selesai: el.checked } }); toast(el.checked ? 'Kebutuhan ditandai selesai.' : 'Tanda selesai dibatalkan.'); rerender(); };

// ---- Koordinator: fakultas & program studi kampus ----
// ---- Kop dokumen kampus (logo, nama PT, unit layanan BK, alamat) ----
let KOP = null; let kopLogo = null;
const kopPreview = (k) => `<div class="kop-prev"><div class="kop-logo">${k.logo ? `<img src="${k.logo}" alt="Logo">` : '<img src="/logo.png" alt="Logo PAN-JALU">'}</div><div><b>${esc((k.nama || '').toUpperCase())}</b><span>${esc(k.unit || 'Nama unit layanan BK')}</span><small>PAN-JALU — Psikoedukasi, Asesmen, dan Navigasi Menuju Jiwa Luhur</small>${k.alamat ? `<small>${esc(k.alamat)}</small>` : ''}${[k.telepon && `Telp. ${k.telepon}`, k.email, k.situs].filter(Boolean).length ? `<small>${esc([k.telepon && `Telp. ${k.telepon}`, k.email, k.situs].filter(Boolean).join(' · '))}</small>` : ''}</div></div>`;
function kopCard(k) {
  KOP = k; kopLogo = null;
  return `<section class="card kop-card"><div class="row between wrap"><h3>Kop dokumen kampus</h3>${k.diatur ? `<span class="chip ok">Kop kampus aktif</span>` : '<span class="chip">Memakai kop PAN-JALU</span>'}</div>
    <p class="small muted">Logo, nama perguruan tinggi, nama unit layanan BK, dan alamat ini tampil di <b>semua dokumen PDF/Word</b> koordinator, konselor, dan mahasiswa kampus Anda (laporan asesmen, catatan perkembangan, formulir konseling, bukti persetujuan, laporan komunal, raport konselor). Bila belum diatur, dokumen memakai kop PAN-JALU dan nama kampus tampil di bagian identitas mahasiswa.</p>
    <div class="kop-grid"><form data-form="kopSave" class="form-grid inner" data-change-form="kop">
      <label class="full">Logo kampus (PNG/JPG, maks. 600 KB)<input type="file" accept="image/png,image/jpeg" data-change="kopLogo"></label>
      <label class="full">Nama perguruan tinggi<input name="nama" value="${esc(k.nama)}" required minlength="5" maxlength="160" data-input="kopLive"></label>
      <label class="full">Nama unit layanan BK<input name="unit" value="${esc(k.unit)}" required minlength="3" maxlength="160" placeholder="mis. UPT Layanan Bimbingan dan Konseling" data-input="kopLive"></label>
      <label class="full">Alamat<input name="alamat" value="${esc(k.alamat)}" maxlength="300" placeholder="Jalan, kota, provinsi, kode pos" data-input="kopLive"></label>
      <label>Telepon<input name="telepon" value="${esc(k.telepon)}" maxlength="40" data-input="kopLive"></label>
      <label>Email<input name="email" type="email" value="${esc(k.email)}" maxlength="120" data-input="kopLive"></label>
      <label class="full">Situs web (opsional)<input name="situs" value="${esc(k.situs)}" maxlength="120" data-input="kopLive"></label>
      <div class="row end wrap full">${k.diatur ? '<button type="button" class="btn ghost" data-act="kopReset">Pakai kop PAN-JALU</button>' : ''}${k.logo ? '<button type="button" class="btn ghost" data-act="kopNoLogo">Hapus logo</button>' : ''}<button type="button" class="btn ghost" data-act="kopSample">Unduh contoh PDF</button><button class="btn primary" type="submit">Simpan kop</button></div></form>
      <div><small class="muted">Pratinjau kop</small><div id="kopPrev">${kopPreview(k)}</div>${k.diubah_pada ? `<p class="small muted">Diubah ${fmtDT(k.diubah_pada)} oleh ${esc(k.diubah_oleh || '-')}.</p>` : ''}</div></div></section>`;
}
const kopForm = () => Object.fromEntries(new FormData(document.querySelector('form[data-form=kopSave]')).entries());
inputHandlers.kopLive = () => { const d = kopForm(); document.getElementById('kopPrev').innerHTML = kopPreview({ ...KOP, ...d, logo: kopLogo ?? KOP.logo }); };
changeHandlers.kopLogo = (el) => {
  const f = el.files?.[0]; if (!f) return;
  if (!/^image\/(png|jpe?g)$/.test(f.type)) { el.value = ''; return toast('Logo harus berkas PNG atau JPG.', 'warn'); }
  if (f.size > 600 * 1024) { el.value = ''; return toast('Ukuran logo maksimal 600 KB.', 'warn'); }
  const rd = new FileReader(); rd.onload = () => { kopLogo = rd.result; inputHandlers.kopLive(); }; rd.readAsDataURL(f);
};
forms.kopSave = async (d) => { delete d[''];
  await api('/coord/kop', { method: 'PUT', body: { nama: d.nama, unit: d.unit, alamat: d.alamat, telepon: d.telepon, email: d.email, situs: d.situs, logo: kopLogo || null } }); toast('Kop dokumen disimpan. Dokumen PDF berikutnya memakai kop ini.'); rerender(); };
actions.kopNoLogo = async () => { if (!(await confirmBox('Hapus logo kampus? Dokumen akan memakai logo PAN-JALU.', { ok: 'Hapus logo' }))) return; const d = kopForm(); await api('/coord/kop', { method: 'PUT', body: { ...d, logo: '' } }); toast('Logo dihapus.'); rerender(); };
actions.kopReset = async () => { if (!(await confirmBox('Kembali memakai kop PAN-JALU untuk semua dokumen kampus ini?', { ok: 'Pakai kop PAN-JALU' }))) return; await api('/coord/kop', { method: 'DELETE' }); toast('Dokumen kembali memakai kop PAN-JALU.'); rerender(); };
actions.kopSample = () => download('/coord/kop/contoh.pdf', 'contoh-kop-dokumen.pdf');

async function coordProdi() {
  const [d, kop] = await Promise.all([api('/coord/prodi'), api('/coord/kop')]);
  const usulan = d.items.filter((p) => p.status === 'usulan'); const resmi = d.items.filter((p) => p.status !== 'usulan');
  const aktif = resmi.filter((p) => p.status === 'aktif');
  const fak = [...new Map(resmi.map((p) => [p.fakultas_kode, p.fakultas])).entries()];
  PRODI_LIST = d.items; JENJANG = d.jenjang;
  return `<h1>Fakultas & Prodi</h1><p class="muted">Identitas kampus untuk dokumen, serta daftar fakultas dan program studi <b>${esc(d.universitas || '')}</b>. Fakultas dan prodi diisi bebas sesuai kampus Anda; daftar ini dipakai mahasiswa saat mendaftar, konselor saat mengatur konteks kerjanya, dan untuk filter laporan.</p>
  ${kopCard(kop)}
  ${usulan.length ? `<section class="card alert-panel"><h3>Usulan dari mahasiswa (${usulan.length})</h3><p class="small">Prodi berikut diketik mahasiswa karena belum ada di daftar. Rapikan lalu setujui, atau gabungkan ke prodi yang sudah ada.</p>
    ${usulan.map((p) => `<div class="alert-row"><div><b>${esc(p.nama)}</b> <span class="chip">${esc(p.fakultas)}</span> <small class="muted">${p.mahasiswa} mahasiswa</small></div><div class="row wrap"><button class="btn primary sm" data-act="prodiEdit" data-id="${p.id}">Rapikan & setujui</button>${aktif.length ? `<button class="btn ghost sm" data-act="prodiMerge" data-id="${p.id}">Gabungkan</button>` : ''}</div></div>`).join('')}</section>` : ''}
  <div class="row between wrap"><span class="muted small">${fak.length} fakultas · ${aktif.length} prodi aktif</span><div class="row wrap"><button class="btn ghost" data-act="prodiBulk">Tempel dari Excel</button><button class="btn primary" data-act="prodiEdit">Tambah prodi</button></div></div>
  ${fak.map(([kode, nama]) => `<section class="card"><h3>${esc(nama)} <span class="chip mono">${esc(kode)}</span></h3><div class="table-wrap"><table class="table"><thead><tr><th>Program studi</th><th>Jenjang</th><th>Mahasiswa</th><th>Status</th><th></th></tr></thead><tbody>
    ${resmi.filter((p) => p.fakultas_kode === kode).map((p) => `<tr class="${p.status === 'aktif' ? '' : 'faded'}"><td>${esc(p.nama)}</td><td>${esc(p.jenjang)}</td><td class="num">${p.mahasiswa}</td><td><span class="chip ${p.status === 'aktif' ? 'ok' : ''}">${p.status === 'aktif' ? 'Aktif' : 'Nonaktif'}</span></td>
    <td class="row"><button class="btn ghost sm" data-act="prodiEdit" data-id="${p.id}">Ubah</button><button class="btn ghost sm" data-act="prodiToggle" data-id="${p.id}" data-s="${p.status === 'aktif' ? 'nonaktif' : 'aktif'}">${p.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}</button></td></tr>`).join('')}</tbody></table></div></section>`).join('') || empty('Belum ada program studi', 'Tambahkan satu per satu atau tempel daftar dari Excel.')}`;
}
let PRODI_LIST = []; let JENJANG = [];
actions.prodiEdit = (el) => {
  const p = PRODI_LIST.find((x) => x.id === el.dataset.id) || { nama: '', fakultas: '', fakultas_kode: '', jenjang: 'S1' };
  const fakNames = [...new Set(PRODI_LIST.filter((x) => x.status !== 'usulan').map((x) => x.fakultas))];
  openModal(`<h3>${el.dataset.id ? (p.status === 'usulan' ? 'Rapikan & setujui prodi' : 'Ubah prodi') : 'Tambah prodi'}</h3><form data-form="prodiSave" data-id="${el.dataset.id || ''}" class="form-grid">
    <label class="full">Nama program studi<input name="nama" value="${esc(p.nama)}" required minlength="3"></label>
    <label class="full">Fakultas (ketik bebas)<input name="fakultas" id="pf_fak" value="${esc(p.fakultas === 'Belum ditentukan' ? '' : p.fakultas)}" required minlength="3" maxlength="120" autocomplete="off" placeholder="mis. Fakultas Keguruan dan Ilmu Pendidikan"></label>
    ${fakNames.length ? `<div class="full pick-chips"><small class="muted">Fakultas yang sudah ada (klik untuk memakai):</small>${fakNames.map((f) => `<button type="button" class="chip-btn sm" data-act="prodiFill" data-t="pf_fak" data-v="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}
    <label>Kode fakultas (opsional)<input name="fakultas_kode" value="${esc(p.status === 'usulan' ? '' : p.fakultas_kode)}" maxlength="12" placeholder="otomatis dari inisial"></label>
    <label>Jenjang (ketik bebas)<input name="jenjang" id="pf_jj" value="${esc(p.jenjang || 'S1')}" required maxlength="20" autocomplete="off"></label>
    <div class="full pick-chips"><small class="muted">Jenjang umum:</small>${JENJANG.map((j) => `<button type="button" class="chip-btn sm" data-act="prodiFill" data-t="pf_jj" data-v="${esc(j)}">${esc(j)}</button>`).join('')}</div>
    <div class="row end full"><button class="btn primary" type="submit">Simpan</button></div></form>`);
};
actions.prodiFill = (el) => { const t = document.getElementById(el.dataset.t); t.value = el.dataset.v; t.focus(); };
forms.prodiSave = async (d, f) => { const id = f.dataset.id; await api(id ? `/coord/prodi/${id}` : '/coord/prodi', { method: id ? 'PATCH' : 'POST', body: d }); closeModal(); toast('Program studi disimpan.'); rerender(); };
actions.prodiToggle = async (el) => { await api(`/coord/prodi/${el.dataset.id}`, { method: 'PATCH', body: { status: el.dataset.s } }); rerender(); };
actions.prodiMerge = (el) => { const p = PRODI_LIST.find((x) => x.id === el.dataset.id); openModal(`<h3>Gabungkan “${esc(p.nama)}”</h3><form data-form="prodiMerge" data-id="${p.id}" class="stack"><p class="small muted">${p.mahasiswa} mahasiswa dipindahkan ke prodi tujuan, lalu entri usulan ini dihapus.</p><label>Prodi tujuan<select name="ke" required>${PRODI_LIST.filter((x) => x.status === 'aktif').map((x) => `<option value="${x.id}">${esc(x.nama)} (${esc(x.jenjang)}) · ${esc(x.fakultas)}</option>`).join('')}</select></label><div class="row end"><button class="btn primary" type="submit">Gabungkan</button></div></form>`); };
forms.prodiMerge = async (d, f) => { const r = await api(`/coord/prodi/${f.dataset.id}/merge`, { method: 'POST', body: d }); closeModal(); toast(`${r.dipindahkan} mahasiswa dipindahkan.`); rerender(); };
actions.prodiBulk = () => openModal(`<h3>Tempel daftar prodi</h3><form data-form="prodiBulk" class="stack"><p class="small muted">Salin dari Excel (kolom: <b>Fakultas | Kode fakultas | Program studi | Jenjang</b>) atau ketik satu baris per prodi dengan pemisah <span class="mono">|</span>. Kode fakultas dan jenjang boleh dikosongkan.</p>
  <textarea name="teks" rows="10" placeholder="Fakultas Keguruan dan Ilmu Pendidikan | FKIP | Pendidikan Matematika | S1&#10;Fakultas Ekonomi dan Bisnis | FEB | Manajemen | S1"></textarea><div class="row end"><button class="btn primary" type="submit">Tambahkan</button></div></form>`, { wide: true });
forms.prodiBulk = async (d) => { const r = await api('/coord/prodi/bulk', { method: 'POST', body: d }); closeModal(); toast(`${r.ditambahkan} prodi ditambahkan${r.dilewati ? `, ${r.dilewati} sudah ada` : ''}.`); rerender(); };

// ---- Pembangun halaman utama: blok bermedia ----
let HOMEB = []; let HOMEH = {};
const SEC_LABEL = { hero: 'Judul utama & pilar', statistik: 'Statistik', tentang: 'Profil, visi & misi', fitur: 'Overview fitur', alur: 'Alur layanan', konselor: 'Ajakan untuk konselor', faq: 'FAQ', kontak: 'Kontak', darurat: 'Butuh pendampingan segera' };
const POS_LABEL = { awal: 'Paling atas', ...Object.fromEntries(Object.entries(SEC_LABEL).map(([k, l]) => [`setelah_${k}`, `Setelah: ${l}`])) };
const MEDIA_LABEL = { tidak: 'Tanpa media', gambar: 'Gambar / GIF', video: 'Video (berkas MP4/WEBM)', youtube: 'Video YouTube', kode: 'Kode embed / animasi' };
const mediaFields = (m, p) => `<fieldset class="full"><legend>Jenis media</legend><div class="row wrap">${Object.entries(MEDIA_LABEL).map(([k, l]) => `<label class="check"><input type="radio" name="${p}_tipe" value="${k}" data-change="mediaType" data-p="${p}" ${(m.tipe || 'tidak') === k ? 'checked' : ''}> ${l}</label>`).join('')}</div></fieldset>
  <div class="full media-opts" id="${p}_opts" data-tipe="${esc(m.tipe || 'tidak')}">
    <div class="mo mo-url"><label>Tautan (https://…) atau hasil unggahan<input name="${p}_url" id="${p}_url" value="${esc(m.url || '')}" placeholder="https://"></label>
      <label class="mo-up">Unggah berkas (gambar/GIF/MP4/WEBM, maks. 150 MB)<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" data-change="mediaUpload" data-p="${p}"></label>
      <label>Teks alternatif gambar<input name="${p}_alt" value="${esc(m.alt || '')}" placeholder="Deskripsi singkat untuk pembaca layar"></label></div>
    <div class="mo mo-kode"><label>Kode embed (HTML, CSS, JavaScript, atau &lt;iframe&gt; dari Canva, Lottie, Google Slides, dsb.)<textarea name="${p}_kode" rows="8" class="mono" placeholder="&lt;iframe src=&quot;https://…&quot;&gt;&lt;/iframe&gt;">${esc(m.kode || '')}</textarea></label></div>
    <div class="mo mo-tinggi"><label>Tinggi bingkai (piksel)<input type="number" name="${p}_tinggi" min="120" max="1400" value="${Number(m.tinggi) || 420}"></label></div>
  </div>`;
const readMedia = (d, p) => ({ tipe: d[`${p}_tipe`] || 'tidak', url: d[`${p}_url`] || '', kode: d[`${p}_kode`] || '', tinggi: Number(d[`${p}_tinggi`]) || 420, alt: d[`${p}_alt`] || '' });
changeHandlers.mediaType = (el) => { document.getElementById(`${el.dataset.p}_opts`).dataset.tipe = el.value; };
changeHandlers.mediaUpload = async (el) => {
  const file = el.files[0]; if (!file) return;
  if (file.size > 150 * 1024 * 1024) return toast('Ukuran berkas maksimal 150 MB.', 'warn');
  toast('Mengunggah…', 'info');
  const r = await api('/uploads', { method: 'POST', body: file, headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name) } });
  document.getElementById(`${el.dataset.p}_url`).value = r.url; toast('Berkas terunggah.');
};
async function saveBlocks(msg) { const r = await api('/admin/home', { method: 'PUT', body: { blok: HOMEB } }); HOMEB = r.blok; toast(msg); rerender(); }
actions.blokEdit = (el) => {
  const i = el.dataset.i !== undefined ? Number(el.dataset.i) : -1;
  const b = i >= 0 ? HOMEB[i] : { posisi: 'setelah_hero', judul: '', teks: '', tata_letak: 'kanan', latar: '', media: { tipe: 'gambar' }, tampil: true };
  openModal(`<h3>${i >= 0 ? 'Ubah blok' : 'Blok baru'}</h3><form data-form="blokSave" data-i="${i}" class="form-grid">
    <label>Posisi<select name="posisi">${Object.entries(POS_LABEL).map(([k, l]) => `<option value="${k}" ${b.posisi === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label>Tata letak<select name="tata_letak"><option value="kanan" ${b.tata_letak === 'kanan' ? 'selected' : ''}>Teks kiri, media kanan</option><option value="kiri" ${b.tata_letak === 'kiri' ? 'selected' : ''}>Media kiri, teks kanan</option><option value="penuh" ${b.tata_letak === 'penuh' ? 'selected' : ''}>Teks di atas, media lebar penuh</option></select></label>
    <label class="full">Judul (opsional)<input name="judul" value="${esc(b.judul || '')}" maxlength="160"></label>
    <label class="full">Teks (opsional)<textarea name="teks" rows="3" maxlength="3000">${esc(b.teks || '')}</textarea></label>
    <label>Teks tombol (opsional)<input name="tombol_teks" value="${esc(b.tombol_teks || '')}" placeholder="Daftar sekarang"></label><label>Tautan tombol<input name="tombol_url" value="${esc(b.tombol_url || '')}" placeholder="#/daftar atau https://…"></label>
    <label>Warna latar (opsional)<input type="color" name="latar" value="${esc(b.latar || '#ffffff')}"></label><label class="check"><input type="checkbox" name="latar_off" value="1" ${b.latar ? '' : 'checked'}> Tanpa warna latar khusus</label>
    ${mediaFields(b.media || {}, 'bm')}
    <label class="check full"><input type="checkbox" name="tampil" value="1" ${b.tampil !== false ? 'checked' : ''}> Tampilkan di halaman utama</label>
    <div class="row end full"><button class="btn primary" type="submit">Simpan blok</button></div></form>`, { wide: true });
};
forms.blokSave = async (d, f) => {
  const i = Number(f.dataset.i);
  const b = { ...(i >= 0 ? HOMEB[i] : {}), posisi: d.posisi, tata_letak: d.tata_letak, judul: d.judul, teks: d.teks, tombol_teks: d.tombol_teks, tombol_url: d.tombol_url, latar: d.latar_off ? '' : d.latar, media: readMedia(d, 'bm'), tampil: !!d.tampil };
  if (i >= 0) HOMEB[i] = b; else HOMEB.push(b);
  closeModal(); await saveBlocks('Blok disimpan. Buka Pratinjau Home untuk melihat hasilnya.');
};
actions.blokMove = async (el) => { const i = Number(el.dataset.i); const j = i + Number(el.dataset.d); [HOMEB[i], HOMEB[j]] = [HOMEB[j], HOMEB[i]]; await saveBlocks('Urutan blok diperbarui.'); };
actions.blokToggle = async (el) => { const b = HOMEB[Number(el.dataset.i)]; b.tampil = !b.tampil; await saveBlocks(b.tampil ? 'Blok ditampilkan.' : 'Blok disembunyikan.'); };
actions.blokDel = async (el) => { if (!(await confirmBox('Hapus blok ini dari halaman utama?', { ok: 'Hapus' }))) return; HOMEB.splice(Number(el.dataset.i), 1); await saveBlocks('Blok dihapus.'); };
forms.heroMedia = async (d) => { await api('/admin/home', { method: 'PUT', body: { hero_media: readMedia(d, 'hm') } }); toast('Media hero disimpan.'); rerender(); };
forms.hideSections = async (d) => { await api('/admin/home', { method: 'PUT', body: { sembunyikan: Object.keys(SEC_LABEL).filter((k) => !d[`s_${k}`]) } }); toast('Tampilan bagian halaman disimpan.'); rerender(); };

export const staffViews = {
  'c/dashboard': { title: 'Dashboard', roles: K, render: dashboard },
  'c/asesmen': { title: 'Asesmen IKDKM-M', roles: K, render: assessAdmin },
  'c/asesmen/:id': { title: 'Hasil Asesmen', roles: K, render: assessDetail },
  'c/mahasiswa': { title: 'Profil Mahasiswa', roles: K, render: students },
  'c/mahasiswa/:id': { title: 'Profil Mahasiswa 360°', roles: K, render: profile },
  'c/konseling': { title: 'Konseling', roles: K, render: deskList },
  'c/meja': { title: 'Konseling', roles: K, render: deskList },
  'c/meja/:id': { title: 'Meja Konseling', roles: K, render: desk },
  'c/pengaturan': { title: 'Konseling', roles: K, render: counselSettings },
  'c/pesan': { title: 'Konseling', roles: K, render: counselorMessages, after: scrollBubbles },
  'c/laporan': { title: 'Laporan Komunal', roles: K, render: report },
  'c/konten': { title: 'Psikoedukasi', roles: K, render: contentAdmin },
  'c/komunitas': { title: 'Komunitas', roles: K, render: communityAdmin },
  'c/komunitas/:id': { title: 'Moderasi Diskusi', roles: K, render: (p) => groupDiscussion(p, { mod: true, back: '#/c/komunitas' }) },
  'c/kinerja': { title: 'Evaluasi & Kinerja', roles: K, render: performance },
  'c/profil': { title: 'Profil', roles: ALL, render: profileView },
  'a/asesmen': { title: 'Monitoring Asesmen', roles: A, render: adminMonitoring },
  'a/psikometrik': { title: 'Psikometrik', roles: A, render: adminPsikometrik },
  'a/konten': { title: 'Konten Psikoedukasi', roles: A, render: adminContent },
  'a/home': { title: 'Web Home & Profil', roles: A, render: homeEditor },
  'a/koordinator': { title: 'Pendaftar Koordinator', roles: A, render: coordRegistrants },
  'a/panjalu': { title: 'Konselor PAN-JALU', roles: A, render: adminPanjalu },
  'k/dashboard': { title: 'Dashboard Koordinator', roles: KO, render: coordDashboard },
  'k/konselor': { title: 'Verifikasi Konselor', roles: KO, render: registrants },
  'k/jadwal': { title: 'Jadwal Konselor', roles: KO, render: coordSchedule },
  'k/prodi': { title: 'Fakultas & Prodi', roles: KO, render: coordProdi },
  'k/darurat': { title: 'Kasus Darurat', roles: KO, render: coordCases },
  'k/laporan': { title: 'Laporan Komunal', roles: KO, render: report },
};
