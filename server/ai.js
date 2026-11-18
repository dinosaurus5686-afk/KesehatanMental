// AI Insight Service (Bab 9): satu-satunya jalur ke model bahasa.
// - Kunci API hanya di server (ANTHROPIC_API_KEY); klien tidak pernah memanggil model langsung.
// - Hanya dua template prompt; tidak ada prompt bebas dari pengguna.
// - Data yang dikirim disamarkan (tanpa nama/NIM/kontak).
// - Hasil selalu berstatus draf sampai disetujui konselor.
// - Tanpa kunci API, layanan memakai generator berbasis aturan agar fitur tetap berjalan.
const Anthropic = require('@anthropic-ai/sdk');
const { DIMENSIONS, QUADRANTS } = require('./reference');

const MODEL = process.env.MC_AI_MODEL || 'claude-opus-5-5';
const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

const SYSTEM = `Anda adalah asisten bagi konselor kampus di Indonesia. Tulis dalam Bahasa Indonesia yang suportif dan profesional.
Batasan: jangan membuat diagnosis klinis, jangan memutuskan rujukan, jangan menyebut identitas. Keluaran Anda adalah draf yang akan ditinjau konselor manusia.
Jika ada indikasi risiko keselamatan diri, ingatkan konselor untuk mengikuti SOP krisis institusi.`;

const dname = (k) => DIMENSIONS.find((d) => d.kode === k)?.label || k;
const flags = (h) => [h.penanda.butuh_bantuan_segera && 'butuh bantuan segera', h.penanda.gejala_emosional_fisiologis && 'gejala emosional-fisiologis (butir 28)', h.penanda.ingin_konselor && 'ingin berbicara dengan konselor (butir 32)'].filter(Boolean);

function profilePrompt(ctx) {
  const dims = ctx.dimensi.map((d) => `${d.kode} ${d.label}: ${d.skor}/${d.max} (${d.kategori}${d.melemah ? ', melemah' : ''})`).join('\n');
  return `Buat ringkasan profil (maks. 150 kata, 1–2 paragraf) untuk mahasiswa anonim berdasarkan Inventori Kebutuhan Dukungan Kekuatan Mental Mahasiswa (IKDKM-M; kerangka Choice Theory, Reality Therapy, dan Positive Addiction William Glasser), lalu 3 poin fokus pendampingan.
Indeks total: ${ctx.skor_total}/112 (${ctx.kategori_total}). 5 kebutuhan dasar: ${ctx.skor_fondasi}/80 (${ctx.kategori_fondasi}). Kendali diri & kebiasaan baik: ${ctx.skor_otot}/32 (${ctx.kategori_otot}).
Skor per dimensi:\n${dims}
Kesiapan dukungan: ${ctx.dukungan.filter((x) => x.siap).map((x) => x.nama).join(', ') || 'belum ada'}. Kuadran: ${QUADRANTS[ctx.kuadran]?.nama}.
Penanda: ${flags(ctx).join('; ') || '-'}
Tren indeks (lama→baru): ${ctx.trend.join(' → ')}
Aktivitas 30 hari: ${ctx.aktivitas}`;
}

function interventionPrompt(ctx) {
  return `Untuk sesi konseling Reality Therapy dengan topik "${ctx.topik}"${ctx.dimensi ? ` (dimensi ${dname(ctx.dimensi)})` : ''} dan tingkat keparahan "${ctx.severity}", berikan:
1) Dua pertanyaan eksploratif terbuka berbasis WDEP (Wants, Doing, Evaluation, Plan) yang dapat diajukan konselor.
2) Satu teknik intervensi penguatan mental (Choice Theory/Positive Addiction) yang sesuai, beserta langkah singkat penerapannya.
Konteks anonim: indeks kekuatan mental ${ctx.skor_total ?? '-'} (${ctx.kategori_total ?? '-'}), dimensi melemah: ${(ctx.pelemahan || []).join('; ') || '-'}. Maks. 140 kata.`;
}

async function callModel(prompt) {
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM,
    output_config: { effort: 'low' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
  });
  if (res.stop_reason === 'refusal') throw new Error('Model menolak permintaan ini.');
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

// --- generator berbasis aturan (fallback tanpa kunci API) ---
const RULE_QUESTIONS = {
  V1: ['Apa yang sebenarnya kamu inginkan untuk tubuh dan rasa amanmu dua minggu ke depan?', 'Apa yang kamu lakukan sekarang dengan tidur, makan, dan istirahatmu—apakah itu membantumu mendapatkannya?', 'Rencana kecil yang sederhana, bisa dicapai, terukur, dan segera dilakukan: satu kebiasaan energi harian (mis. tidur ≤ 23.00) dengan catatan pagi di Jurnal Harian.'],
  V2: ['Hubungan seperti apa yang kamu inginkan dengan orang-orang terdekatmu?', 'Saat berselisih, kebiasaan apa yang kamu pakai—mengkritik, menyalahkan, mengeluh, atau mendengarkan dan mendukung?', 'Latihan 7 Caring Habits: pilih satu relasi, ganti satu deadly habit dengan mendengarkan/mendukung, dan gabung satu grup diskusi sebaya minggu ini.'],
  V3: ['Kapan terakhir kamu merasa mampu dan berhasil? Apa yang kamu lakukan saat itu?', 'Apakah membandingkan diri dengan teman membantumu mencapai yang kamu inginkan?', 'Penguatan inner power: pecah tugas jadi langkah kecil, catat keberhasilan harian, dan ganti perbandingan sosial dengan evaluasi diri terhadap target pribadi.'],
  V4: ['Bagian mana dari kuliah atau hidupmu yang ingin kamu pilih sendiri?', 'Apa yang bisa kamu kendalikan dan apa yang tidak dalam situasi ini?', 'Lingkaran kendali + latihan asertif: pisahkan hal yang bisa dipilih, susun satu keputusan mandiri, dan latih menyampaikan pendapat dengan sopan.'],
  V5: ['Apa yang dulu membuatmu gembira, dan apa yang menggantikannya sekarang?', 'Saat lari ke HP/game, apakah itu benar-benar memulihkanmu?', 'Kebiasaan positif: pilih aktivitas sehat 20–40 menit per hari (olahraga ringan, hobi, meditasi) tanpa kritik diri, dan jadwalkan jeda gawai.'],
  V6: ['Apa yang ingin kamu capai dari kuliahmu—seperti apa gambaran hidup yang kamu inginkan?', 'Saat tertekan, apa yang kamu lakukan dan pikirkan—apakah itu menguatkan atau melemahkanmu?', 'Latihan harian: ubah tindakan dan pikiran lebih dulu—mulai 10 menit dari tugas yang tertunda, lalu nilai hasilnya di Refleksi GURU.'],
};

function ruleProfile(ctx) {
  const lemah = ctx.dimensi.filter((d) => d.melemah);
  const kuat = ctx.dimensi.filter((d) => d.kategori === 'Kuat');
  let text = `Indeks Kekuatan Mental ${ctx.skor_total}/112 (${ctx.kategori_total}); 5 kebutuhan dasar ${ctx.skor_fondasi}/80 (${ctx.kategori_fondasi}); kendali diri & kebiasaan baik ${ctx.skor_otot}/32 (${ctx.kategori_otot}). ${kuat.length ? `Kekuatan: ${kuat.map((d) => d.label).join(', ')}. ` : ''}${lemah.length ? `Dimensi melemah: ${lemah.map((d) => `${d.label} (${d.skor}/${d.max})`).join(', ')}. ` : 'Tidak ada dimensi yang melemah. '}Kuadran: ${QUADRANTS[ctx.kuadran]?.nama}. Tren indeks: ${ctx.trend.join(' → ')}. Aktivitas 30 hari terakhir: ${ctx.aktivitas}.`;
  const f = flags(ctx);
  if (f.length) text += ` Penanda: ${f.join('; ')}.`;
  if (ctx.penanda.butuh_bantuan_segera) text += ' Ikuti SOP krisis sebelum langkah lain.';
  const fokus = lemah[0] || ctx.dimensi.find((d) => d.kode === ctx.fokus_dimensi);
  text += `\n\nFokus pendampingan:\n• Jadikan ${kuat[0] ? kuat[0].label.toLowerCase() : 'kekuatan yang ada'} sebagai pijakan.\n• Gunakan WDEP untuk ${fokus.label.toLowerCase()}.\n• Dorong konten psikoedukasi dimensi ini beserta Refleksi GURU dan latihan Positive Addiction harian.`;
  return text;
}

function ruleIntervention(ctx) {
  const [q1, q2, tech] = RULE_QUESTIONS[ctx.dimensi] || ['Apa yang paling kamu inginkan dari pertemuan hari ini?', 'Apa yang sudah kamu lakukan sejauh ini, dan apakah itu membantumu?', 'Susun satu rencana kecil yang sederhana, bisa diukur, dan sepenuhnya dalam kendalimu, lalu sepakati cara menilainya.'];
  const note = ctx.topik === 'Keselamatan diri / krisis' ? '\n\nCatatan: topik krisis — lakukan asesmen risiko dan safety planning sesuai SOP institusi.' : ctx.severity === 'Berat' ? '\n\nCatatan: tingkat keparahan Berat — pertimbangkan konsultasi kasus dengan supervisor/psikolog klinis.' : '';
  return `Pertanyaan eksploratif:\n1. ${q1}\n2. ${q2}\n\nTeknik yang disarankan:\n${tech}${note}`;
}

async function generate(jenis, ctx) {
  const prompt = jenis === 'profiler' ? profilePrompt(ctx) : interventionPrompt(ctx);
  if (client) {
    try { return { mode: 'model', prompt, hasil: await callModel(prompt) }; } catch (e) { console.warn('[ai] gagal memanggil model, beralih ke aturan:', e.message); }
  }
  return { mode: 'aturan', prompt, hasil: jenis === 'profiler' ? ruleProfile(ctx) : ruleIntervention(ctx) };
}

module.exports = { generate, aiMode: () => (client ? 'model' : 'aturan') };
