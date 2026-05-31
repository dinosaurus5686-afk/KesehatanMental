import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { doc, getFirestore, setDoc } from 'firebase/firestore';
import { BarChart2, CheckCircle, ClipboardList, Download, Map, Printer, Search, User } from 'lucide-react';

const runtimeFirebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'iakks-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : '';
const hasFirebaseConfig = Boolean(runtimeFirebaseConfig?.apiKey && runtimeFirebaseConfig?.projectId);
const firebaseApp = hasFirebaseConfig ? initializeApp(runtimeFirebaseConfig) : null;
const auth = firebaseApp ? getAuth(firebaseApp) : null;
const db = firebaseApp ? getFirestore(firebaseApp) : null;

const GOOGLE_SHEETS_WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbxpQgYIT9cSjzLzFG7KA-tuuTB12c22Fm5UdtMagih5QKWDswSkkr_ZSeKMXyOd91QM/exec';

const dimensionsInfo = [
  { id: 1, name: 'Pengenalan Diri', desc: 'Pemahaman minat, bakat, nilai hidup, dan kepribadian.' },
  { id: 2, name: 'Pengetahuan Dunia Kerja & Studi', desc: 'Pemahaman pilihan karir, jurusan, dan persyaratan.' },
  { id: 3, name: 'Keterampilan Pengambilan Keputusan', desc: 'Kemampuan menavigasi proses keputusan karir.' },
  { id: 4, name: 'Self-Efficacy Karir', desc: 'Keyakinan terhadap kemampuan diri untuk berhasil.' },
  { id: 5, name: 'Kesadaran Metakognitif Karir', desc: 'Pengelolaan proses berpikir dan pikiran negatif.' },
  { id: 6, name: 'Kematangan & Kesiapan Karir', desc: 'Kesiapan emosional dan kognitif merencanakan karir.' },
  { id: 7, name: 'Pengalaman Eksplorasi Karir', desc: 'Keterlibatan dalam pengalaman nyata (magang, dll).' },
  { id: 8, name: 'Kemampuan Adaptasi Karir', desc: 'Penyesuaian diri dengan perubahan dan ketidakpastian.' },
  { id: 9, name: 'Konstruksi Identitas Karir', desc: 'Menghubungkan pilihan dengan nilai dan makna hidup.' },
  { id: 10, name: 'Dukungan Sosial & Konflik Eksternal', desc: 'Dukungan lingkungan dan pengelolaan ekspektasi.' },
];

const recommendationMap = {
  1: 'Lakukan tes minat Holland (RIASEC), diskusi reflektif tentang pengalaman sukses, dan journaling karir untuk menemukan jati diri Anda.',
  2: 'Ikuti seminar karir, lakukan kunjungan industri, dan perbanyak membaca informasi tentang jalur pendidikan serta profesi terkini.',
  3: 'Latih siklus CASVE. Buat daftar pro-kontra terstruktur untuk setiap pilihan karir.',
  4: 'Bangun pengalaman keberhasilan kecil, cari mentor atau role model, dan ubah pola pikir keraguan menjadi motivasi belajar.',
  5: 'Latih identifikasi pikiran negatif tentang masa depan. Tantang pikiran tersebut dan ganti dengan pikiran yang realistis.',
  6: 'Perkuat motivasi internal Anda. Sadari bahwa masa depan adalah tanggung jawab Anda sendiri dan mulailah membuat rencana jangka pendek.',
  7: 'Segera cari pengalaman praktis: ikuti magang singkat, kegiatan ekstrakurikuler yang relevan, atau wawancarai profesional.',
  8: 'Latih fleksibilitas kognitif. Pahami bahwa dunia kerja terus berubah, bangun growth mindset agar siap menghadapi ketidakpastian.',
  9: 'Gunakan pendekatan naratif: tuliskan kisah hidup Anda sejauh ini dan temukan benang merah nilai kehidupan dengan arah karir.',
  10: 'Diskusikan harapan karir Anda dengan orang tua secara terbuka namun santun. Cari dukungan dari guru BK atau mentor.',
};

const getCategory = (score) => {
  if (score >= 21) return 'Sangat Tinggi';
  if (score >= 17) return 'Tinggi';
  if (score >= 13) return 'Sedang';
  if (score >= 9) return 'Rendah';
  return 'Sangat Rendah';
};

const generateQuestions = () => {
  const dimLogic = [
    { d: 1, pos: [1, 2, 3, 5], neg: [4, 6] },
    { d: 2, pos: [7, 8, 9, 11], neg: [10, 12] },
    { d: 3, pos: [13, 14, 16, 18], neg: [15, 17] },
    { d: 4, pos: [19, 20, 22, 24], neg: [21, 23] },
    { d: 5, pos: [25, 26, 28, 30], neg: [27, 29] },
    { d: 6, pos: [31, 32, 34, 36], neg: [33, 35] },
    { d: 7, pos: [37, 38, 40, 42], neg: [39, 41] },
    { d: 8, pos: [43, 44, 46, 48], neg: [45, 47] },
    { d: 9, pos: [49, 50, 52, 54], neg: [51, 53] },
    { d: 10, pos: [55, 56, 58, 60], neg: [57, 59] },
  ];

  const texts = {
    1: 'Saya mengetahui dengan jelas bidang kegiatan apa saja yang membuat saya bersemangat.',
    2: 'Saya bisa menyebutkan dengan pasti keterampilan utama yang saya miliki.',
    3: 'Saya memahami nilai-nilai hidup yang paling penting bagi saya dalam memilih pekerjaan.',
    4: 'Saya merasa bingung ketika diminta menjelaskan kelebihan diri saya kepada orang lain.',
    5: 'Saya tahu gaya belajar dan gaya kerja saya.',
    6: 'Saya belum benar-benar memahami apa yang saya inginkan dari pekerjaan ke depan.',
    7: 'Saya mengetahui persyaratan pendidikan untuk memasuki karir yang diminati.',
    8: 'Saya memiliki informasi yang cukup tentang pilihan jurusan kuliah/vokasi.',
    9: 'Saya mengetahui prospek kerja dan peluang karir dari bidang yang diminati.',
    10: 'Saya tidak tahu banyak tentang jenis-jenis pekerjaan spesifik di bidang yang saya sukai.',
    11: 'Saya memahami perbedaan jalur kuliah, vokasi, kursus, dan langsung bekerja.',
    12: 'Informasi tentang karir yang saya miliki terasa sangat terbatas.',
    13: 'Saya tahu langkah-langkah yang harus ditempuh agar bisa memutuskan karir dengan baik.',
    14: 'Saya mampu menimbang berbagai pilihan karir secara sistematis.',
    15: 'Saya sering merasa lumpuh dan tidak tahu harus mulai dari mana memikirkan karir.',
    16: 'Setelah membuat keputusan karir, saya mampu menyusun rencana tindakan konkret.',
    17: 'Saya cenderung menghindari memikirkan pilihan karir karena membingungkan.',
    18: 'Saya bisa membedakan informasi yang relevan saat mengevaluasi pilihan karir.',
    19: 'Saya percaya mampu berhasil di karir yang diminati jika berusaha sungguh-sungguh.',
    20: 'Saya yakin bisa menyelesaikan pendidikan untuk karir pilihan saya.',
    21: 'Saya sering meragukan apakah saya cukup mampu untuk mengejar karir tersebut.',
    22: 'Saya percaya usaha dan kerja keras akan membawa saya ke tujuan karir.',
    23: 'Ketika menghadapi hambatan perencanaan karir, saya merasa tidak berdaya.',
    24: 'Saya yakin latar belakang saya tidak akan menghalangi pencapaian karir.',
    25: 'Saya bisa mengenali ketika pikiran negatif menghalangi keputusan karir.',
    26: 'Saya mampu menantang pikiran yang tidak akurat tentang masa depan karir.',
    27: 'Saya sering terjebak kekhawatiran tentang masa depan tanpa bisa keluar.',
    28: 'Saya menyadari cara berpikir sangat memengaruhi keputusan karir.',
    29: "Pikiran 'Saya tidak akan bisa' sering menghentikan saya.",
    30: 'Saya tahu cara menenangkan diri ketika kecemasan tentang karir muncul.',
    31: 'Saya sudah memikirkan serius langkah konkret setelah lulus.',
    32: 'Saya menganggap perencanaan karir sebagai tanggung jawab saya sendiri.',
    33: 'Saya merasa perencanaan karir masih terlalu jauh dan tidak perlu dipikirkan sekarang.',
    34: 'Saya punya gambaran posisi saya dalam 5 tahun ke depan.',
    35: 'Saya merasa belum siap membuat keputusan besar tentang masa depan.',
    36: 'Saya aktif mencari informasi karir tanpa harus diperintah.',
    37: 'Saya sudah pernah terlibat kegiatan/magang berkaitan dengan minat karir.',
    38: 'Saya memanfaatkan kegiatan sekolah untuk mengeksplorasi minat karir.',
    39: 'Pengetahuan saya tentang profesi hanya dari internet, belum pengalaman langsung.',
    40: 'Saya pernah berdiskusi dengan profesional di bidang yang diminati.',
    41: 'Saya belum pernah mencoba kegiatan di luar sekolah untuk eksplorasi karir.',
    42: 'Pengalaman yang dijalani membantu memahami karir yang cocok untuk saya.',
    43: 'Saya siap jika rencana karir harus berubah akibat kondisi tak terduga.',
    44: 'Saya mencari cara menyesuaikan diri jika profesi berubah drastis.',
    45: 'Ketidakpastian masa depan karir membuat saya cemas dan tidak berdaya.',
    46: 'Saya terbuka mencoba jalur studi/karir yang tak terbayangkan sebelumnya.',
    47: 'Jika rencana pertama gagal, saya tidak tahu apa yang harus dilakukan.',
    48: 'Saya percaya kemampuan belajar hal baru akan selalu membuka peluang.',
    49: 'Saya bisa menjelaskan mengapa karir pilihan saya bermakna secara pribadi.',
    50: 'Saya melihat karir sebagai bagian dari cerita hidup, bukan sekadar uang.',
    51: 'Saya belum menemukan hubungan nilai hidup dengan pilihan jurusan/karir.',
    52: 'Pengalaman penting hidup saya membentuk arah karir yang dituju.',
    53: 'Saya hanya fokus pada gaji/prestise saat memikirkan karir.',
    54: 'Saya punya gambaran kontribusi untuk masyarakat melalui karir saya.',
    55: 'Orang tua/lingkungan mendukung saya mengeksplorasi pilihan karir.',
    56: 'Saya punya akses bimbingan karir yang memadai (guru BK, internet).',
    57: 'Saya terjebak antara keinginan sendiri dan harapan keluarga yang berbeda.',
    58: 'Saya mampu mendiskusikan pilihan karir dengan keluarga secara terbuka.',
    59: 'Kondisi ekonomi membuat saya merasa tidak bebas memilih karir.',
    60: 'Saya tahu ke mana harus meminta bantuan saat bingung merencanakan karir.',
  };

  return Array.from({ length: 60 }, (_, index) => {
    const id = index + 1;
    const dim = dimLogic.find((item) => item.pos.includes(id) || item.neg.includes(id));
    return { id, text: texts[id] || `Pernyataan ${id}`, dim: dim.d, type: dim.pos.includes(id) ? 'pos' : 'neg' };
  });
};

const questions = generateQuestions();

export default function App() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('identitas');
  const [identity, setIdentity] = useState({ nama: '', kelas: '', sekolah: '', tanggal: new Date().toLocaleDateString('id-ID') });
  const [answers, setAnswers] = useState({});
  const [reportData, setReportData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchCode, setSearchCode] = useState('');
  const [searchError, setSearchError] = useState('');
  const [syncStatus, setSyncStatus] = useState('');

  useEffect(() => {
    if (!auth) {
      setUser({ uid: 'local-anonymous' });
      return undefined;
    }

    const initAuth = async () => {
      try {
        if (initialAuthToken) {
          await signInWithCustomToken(auth, initialAuthToken);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error(error);
        setUser({ uid: 'local-anonymous' });
      }
    };

    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  const calculateScores = (ansData) => {
    const dimScores = {};
    dimensionsInfo.forEach((dimension) => {
      dimScores[dimension.id] = { total: 0 };
    });

    questions.forEach((question) => {
      const ansRaw = ansData[question.id];
      if (ansRaw) {
        const finalScore = question.type === 'neg' ? 5 - ansRaw : ansRaw;
        dimScores[question.dim].total += finalScore;
      }
    });

    return dimensionsInfo.map((dimension) => {
      const score = dimScores[dimension.id].total;
      return { ...dimension, score, category: getCategory(score) };
    });
  };

  const getColorHex = (score) => {
    if (score >= 17) return '#10b981';
    if (score >= 13) return '#eab308';
    return '#ef4444';
  };

  const getTailwindColor = (score) => {
    if (score >= 17) return 'bg-emerald-500';
    if (score >= 13) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const handleSubmit = async () => {
    if (!user) return;
    if (Object.keys(answers).length < 60) {
      alert('Mohon lengkapi ke-60 soal instrumen sebelum menyimpan.');
      return;
    }

    setIsLoading(true);
    setSyncStatus('Mensinkronisasi dengan Google Sheets...');

    try {
      const results = calculateScores(answers);
      const totalScore = results.reduce((sum, result) => sum + result.score, 0);
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();

      const payload = {
        identity,
        answers,
        results,
        totalScore,
        createdAt: new Date().toISOString(),
        userId: user.uid,
        kodeUnik: code,
      };

      if (db) {
        await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'iakks_results', code), payload);
      }

      if (GOOGLE_SHEETS_WEBHOOK_URL.trim() !== '') {
        const workspacePayload = {
          tanggal: identity.tanggal,
          kodeUnik: code,
          nama: identity.nama,
          kelas: identity.kelas,
          sekolah: identity.sekolah,
          totalSkor: totalScore,
        };

        results.forEach((result) => {
          workspacePayload[`d${result.id}`] = result.score;
        });

        for (let i = 1; i <= 60; i += 1) {
          workspacePayload[`q${i}`] = answers[i] || 0;
        }

        await fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(workspacePayload),
        });
      }

      setReportData(payload);
      setActiveTab('raport');
    } catch (error) {
      console.error(error);
      alert('Gagal melakukan sinkronisasi otomatis.');
    } finally {
      setIsLoading(false);
      setSyncStatus('');
    }
  };

  const handlePanggilData = async () => {
    if (!searchCode.trim()) return;
    setIsLoading(true);
    setSearchError('');

    try {
      const res = await fetch(`${GOOGLE_SHEETS_WEBHOOK_URL}?kodeUnik=${searchCode.toUpperCase()}`);
      const json = await res.json();

      if (json.status === 'Success' && json.data) {
        const data = json.data;
        const reconstructedResults = dimensionsInfo.map((dimension) => {
          const score = Number(data[`d${dimension.id}`]);
          return { ...dimension, score, category: getCategory(score) };
        });

        setReportData({
          identity: { nama: data.nama, kelas: data.kelas, sekolah: data.sekolah, tanggal: data.tanggal },
          kodeUnik: data.kodeUnik,
          results: reconstructedResults,
          totalScore: data.totalSkor,
        });
        setActiveTab('raport');
      } else {
        setSearchError('Kode tidak ditemukan di sistem Google Sheets.');
      }
    } catch (error) {
      console.error(error);
      setSearchError('Gagal mengambil data dari Google Sheets. Pastikan koneksi dan URL Apps Script benar.');
    } finally {
      setIsLoading(false);
    }
  };

  const exportWord = () => {
    if (!reportData) return;

    const preHtml = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head><meta charset='utf-8'>
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2937; }
      h2 { color: #1e3a8a; text-transform: uppercase; border-bottom: 2px solid #1e3a8a; padding-bottom: 5px; }
      h3 { color: #1e40af; }
      .container { width: 100%; max-width: 800px; margin: 0 auto; }
      .box { background-color: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 15px; margin-bottom: 20px; }
      .identitas-table { width: 100%; font-size: 14px; }
      .identitas-table td { padding: 4px; }
      .chart-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px; }
      .chart-table td { padding: 8px 4px; border-bottom: 1px solid #e5e7eb; }
      .recommendation-box { background-color: #fef2f2; border: 1px solid #fecaca; padding: 15px; margin-bottom: 10px; border-radius: 8px; }
      .recommendation-title { font-weight: bold; color: #991b1b; margin-bottom: 5px; }
    </style>
    </head><body><div class="container">`;

    let content = '<h2 style="text-align:center;">RAPORT KEBUTUHAN KARIR SISWA (IAKKS)</h2>';
    content += `<div class="box">
      <table class="identitas-table">
        <tr><td width="20%"><b>Nama Siswa</b></td><td width="30%">: ${reportData.identity.nama}</td><td width="20%"><b>Tanggal Tes</b></td><td width="30%">: ${reportData.identity.tanggal}</td></tr>
        <tr><td><b>Kelas/Sekolah</b></td><td>: ${reportData.identity.kelas} / ${reportData.identity.sekolah}</td><td><b>Kode Log</b></td><td>: <span style="font-family: monospace; color:#1d4ed8; font-weight:bold;">${reportData.kodeUnik}</span></td></tr>
      </table>
    </div>`;

    content += '<h3>A. Grafik Penilaian Kesiapan Asesmen</h3><table class="chart-table">';
    reportData.results.forEach((result) => {
      const percentage = (result.score / 24) * 100;
      const color = getColorHex(result.score);
      content += `
      <tr>
        <td width="35%"><b>${result.name}</b></td>
        <td width="50%">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #e5e7eb; height: 16px; border-radius: 8px;">
            <tr>
              <td width="${percentage}%" style="background-color: ${color}; text-align: right; color: white; font-size: 10px; padding-right: 4px; border-radius: 8px;"><b>${result.score}/24</b></td>
              <td width="${100 - percentage}%"></td>
            </tr>
          </table>
        </td>
        <td width="15%" style="text-align:right; font-weight:bold; color: #4b5563;">${result.category}</td>
      </tr>`;
    });
    content += '</table>';

    content += '<br/><h3>B. Peta Prioritas & Rekomendasi Tindak Lanjut</h3>';
    const lowDims = reportData.results.filter((result) => result.score <= 16).sort((a, b) => a.score - b.score);
    if (lowDims.length > 0) {
      lowDims.forEach((dimension, index) => {
        content += `<div class="recommendation-box">
          <div class="recommendation-title">#${index + 1} ${dimension.name} (Skor: ${dimension.score} - ${dimension.category})</div>
          <div><b>Saran Aksi Mandiri & Layanan BK:</b><br/> ${recommendationMap[dimension.id]}</div>
        </div>`;
      });
    } else {
      content += `<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 15px; border-radius: 8px;">
        <h4 style="color: #166534; margin: 0 0 5px 0;">Kesiapan Karir Sangat Baik</h4>
        <p style="margin: 0; color: #15803d;">Semua dimensi berada pada kategori Tinggi. Teruskan eksplorasi mandiri dan konsultasikan pilihan spesifik ke Guru BK.</p>
      </div>`;
    }

    const postHtml = '</div></body></html>';
    const blob = new Blob(['\ufeff', preHtml + content + postHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Raport_IAKKS_${reportData.identity.nama.replace(/\s+/g, '_')}.doc`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const navTabClass = (tabName) => `px-2 py-3 md:px-4 cursor-pointer text-sm md:text-base font-bold text-center border-b-4 transition-colors duration-200 ${activeTab === tabName ? 'border-yellow-400 text-yellow-300' : 'border-transparent text-white hover:text-blue-200'}`;

  const lowPriorityResults = reportData?.results.filter((result) => result.score <= 16).sort((a, b) => a.score - b.score) || [];

  return (
    <div className="min-h-screen bg-gray-50 pb-10 text-gray-900">
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-hidden { display: none !important; }
          .printable-area { box-shadow: none !important; border: none !important; background: white !important; margin: 0 !important; max-width: 100% !important; padding: 10px !important; }
          .page-break-before { page-break-before: always; }
          .break-inside-avoid { break-inside: avoid; }
        }
      `,
        }}
      />

      <nav className="print-hidden bg-blue-800 shadow-md">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between px-4 pt-4 md:flex-row">
          <div className="mb-2 flex w-full items-center justify-center gap-2 text-xl font-black text-white md:mb-0 md:w-auto md:justify-start">
            <ClipboardList className="text-yellow-400" /> IAKKS
          </div>
          <div className="no-scrollbar flex w-full justify-between overflow-x-auto md:w-auto md:justify-end md:gap-2">
            <button className={navTabClass('identitas')} onClick={() => setActiveTab('identitas')} type="button">1. Identitas</button>
            <button className={navTabClass('instrumen')} onClick={() => setActiveTab('instrumen')} type="button">2. Instrumen</button>
            <button className={navTabClass('panggil')} onClick={() => setActiveTab('panggil')} type="button">3. Panggil Data</button>
            <button className={navTabClass('raport')} onClick={() => (reportData ? setActiveTab('raport') : alert('Silakan Panggil Data atau Isi Instrumen dahulu.'))} type="button">4. Raport</button>
            <button className={navTabClass('rekomendasi')} onClick={() => (reportData ? setActiveTab('rekomendasi') : alert('Silakan Panggil Data atau Isi Instrumen dahulu.'))} type="button">5. Rekomendasi</button>
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-4 pt-6">
        {activeTab === 'identitas' && (
          <section className="print-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm md:p-10">
            <h2 className="mb-6 flex items-center gap-2 text-2xl font-black text-blue-900"><User /> Data Autentikasi</h2>
            <div className="space-y-4">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-600">Nama Lengkap Siswa</span>
                <input className="w-full rounded-xl border border-gray-300 bg-gray-50 p-4 outline-none focus:ring-2 focus:ring-blue-500" type="text" value={identity.nama} onChange={(event) => setIdentity({ ...identity, nama: event.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-600">Kelas</span>
                <input className="w-full rounded-xl border border-gray-300 bg-gray-50 p-4 outline-none focus:ring-2 focus:ring-blue-500" type="text" value={identity.kelas} onChange={(event) => setIdentity({ ...identity, kelas: event.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-gray-600">Asal Sekolah</span>
                <input className="w-full rounded-xl border border-gray-300 bg-gray-50 p-4 outline-none focus:ring-2 focus:ring-blue-500" type="text" value={identity.sekolah} onChange={(event) => setIdentity({ ...identity, sekolah: event.target.value })} />
              </label>
              <button className="mt-4 w-full rounded-xl bg-blue-600 p-4 font-bold text-white transition-colors hover:bg-blue-700" onClick={() => (identity.nama && identity.kelas && identity.sekolah ? setActiveTab('instrumen') : alert('Mohon lengkapi seluruh data identitas Anda.'))} type="button">Buka Lembar Instrumen</button>
            </div>
          </section>
        )}

        {activeTab === 'instrumen' && (
          <section className="print-hidden">
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-6 text-blue-900 shadow-sm">
              <h3 className="mb-3 flex items-center gap-2 text-lg font-bold"><ClipboardList size={22} /> Petunjuk Pengerjaan</h3>
              <ul className="ml-5 list-disc space-y-2 text-sm md:text-base">
                <li>Instrumen ini bukan tes benar atau salah. <b>Jawablah dengan jujur</b> sesuai kondisi saat ini.</li>
                <li>Pilih: <span className="ml-1 rounded border bg-white px-2 py-0.5 font-bold">SS</span> (Sangat Sesuai), <span className="rounded border bg-white px-2 py-0.5 font-bold">S</span> (Sesuai), <span className="rounded border bg-white px-2 py-0.5 font-bold">TS</span> (Tidak Sesuai), <span className="rounded border bg-white px-2 py-0.5 font-bold">STS</span> (Sangat Tidak Sesuai).</li>
                <li>Jawab semua 60 soal agar bisa dianalisis otomatis.</li>
              </ul>
            </div>

            <div className="sticky top-0 z-10 mb-4 rounded-xl border bg-white p-4 text-center font-black text-blue-800 shadow-sm">
              Progres Terisi: {Object.keys(answers).length} / 60 Soal
            </div>

            <div className="mb-6 overflow-hidden rounded-xl border bg-white shadow-sm">
              {questions.map((question) => (
                <div key={question.id} className="flex flex-col items-start gap-4 border-b p-5 transition hover:bg-gray-50 md:flex-row md:items-center">
                  <p className="flex-1 font-medium text-gray-800"><span className="mr-2 font-bold text-blue-500">{question.id}.</span> {question.text}</p>
                  <div className="grid w-full shrink-0 grid-cols-4 gap-2 md:w-auto">
                    {[4, 3, 2, 1].map((value) => (
                      <button key={value} className={`rounded-lg border px-3 py-3 text-xs transition-colors md:rounded md:py-2 md:text-sm ${answers[question.id] === value ? 'border-blue-600 bg-blue-600 font-bold text-white shadow-md' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`} onClick={() => setAnswers({ ...answers, [question.id]: value })} type="button">
                        {value === 4 ? 'SS' : value === 3 ? 'S' : value === 2 ? 'TS' : 'STS'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <button className="mb-10 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 p-4 font-black text-white shadow-lg transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300" disabled={Object.keys(answers).length < 60 || isLoading} onClick={handleSubmit} type="button">
              {isLoading ? syncStatus : 'Simpan ke Database & Buat Raport'} {!isLoading && <CheckCircle />}
            </button>
          </section>
        )}

        {activeTab === 'panggil' && (
          <section className="print-hidden rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm md:p-12">
            <Search className="mx-auto mb-4 text-blue-300" size={48} />
            <h2 className="mb-2 text-2xl font-black text-blue-900">Panggil Data Server</h2>
            <p className="mx-auto mb-8 max-w-sm text-gray-500">Tarik data asesmen yang telah tersimpan di Google Sheets menggunakan 6 digit Kode Unik Anda.</p>
            <input className="mx-auto mb-4 block w-full max-w-xs rounded-xl border-2 border-gray-200 p-4 text-center font-mono text-2xl uppercase tracking-[0.5em] outline-none focus:border-blue-500" maxLength={6} placeholder="XXXXXX" type="text" value={searchCode} onChange={(event) => setSearchCode(event.target.value.toUpperCase())} />
            <button className="mx-auto block w-full max-w-xs rounded-xl bg-gray-900 p-4 font-bold text-white transition-colors hover:bg-black disabled:bg-gray-400" disabled={isLoading || searchCode.length < 5} onClick={handlePanggilData} type="button">
              {isLoading ? 'Menghubungi Google Sheets...' : 'Tarik Raport'}
            </button>
            {searchError && <p className="mt-4 font-bold text-red-500">{searchError}</p>}
          </section>
        )}

        {(activeTab === 'raport' || activeTab === 'rekomendasi') && reportData && (
          <section className="printable-area">
            <div className="print-hidden mb-6 flex flex-col items-center justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50 p-4 md:flex-row">
              <div className="text-blue-900">
                <span className="flex items-center gap-2 font-black"><CheckCircle className="text-green-600" /> Data Terhubung</span>
                <span className="mt-1 block text-sm">Kode Tarik Data: <b className="rounded border bg-white px-2 font-mono">{reportData.kodeUnik}</b></span>
              </div>
              <div className="flex w-full gap-2 md:w-auto">
                <button className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white p-2 text-sm font-bold text-gray-700 shadow-sm hover:bg-gray-50 md:px-4" onClick={() => window.print()} type="button"><Printer size={16} /> Cetak PDF</button>
                <button className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 p-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 md:px-4" onClick={exportWord} type="button"><Download size={16} /> Unduh Word</button>
              </div>
            </div>

            <div className="mb-6 border-b-2 border-blue-900 pb-4 text-center">
              <h1 className="text-2xl font-black uppercase text-blue-900 md:text-3xl">Raport Kebutuhan Karir (IAKKS)</h1>
            </div>

            <div className="mb-8 grid grid-cols-2 gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm md:grid-cols-4">
              <div><b className="block text-xs uppercase text-gray-500">Nama Siswa</b><span className="text-base font-bold">{reportData.identity.nama}</span></div>
              <div><b className="block text-xs uppercase text-gray-500">Kelas</b><span className="text-base font-bold">{reportData.identity.kelas}</span></div>
              <div><b className="block text-xs uppercase text-gray-500">Sekolah</b><span className="text-base font-bold">{reportData.identity.sekolah}</span></div>
              <div><b className="block text-xs uppercase text-gray-500">Tanggal Tes</b><span className="text-base font-bold">{reportData.identity.tanggal}</span></div>
            </div>

            {activeTab === 'raport' && (
              <div className="mb-6 rounded-2xl border bg-white p-6 shadow-sm md:p-8">
                <h3 className="mb-6 flex items-center gap-2 text-xl font-black text-gray-800"><BarChart2 className="text-blue-600" /> Hasil Penilaian per Dimensi</h3>
                <div className="space-y-4">
                  {reportData.results.map((result) => (
                    <div key={result.id} className="flex flex-col gap-2 md:flex-row md:items-center md:gap-4">
                      <div className="w-full text-sm font-bold text-gray-700 md:w-2/5">{result.name}</div>
                      <div className="flex h-5 flex-1 items-center overflow-hidden rounded-full bg-gray-200 md:h-6">
                        <div className={`flex h-full items-center justify-end pr-2 text-xs font-black text-white transition-all ${getTailwindColor(result.score)}`} style={{ width: `${(result.score / 24) * 100}%` }}>{result.score}/24</div>
                      </div>
                      <div className="w-full text-right text-xs font-black uppercase text-gray-500 md:w-32">{result.category}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className={activeTab === 'rekomendasi' ? 'block' : 'print-hidden hidden print:block page-break-before'}>
              <div className="rounded-2xl border bg-white p-6 shadow-sm md:p-8">
                <h3 className="mb-4 flex items-center gap-2 text-xl font-black text-gray-800"><Map className="text-red-600" /> Peta Prioritas & Tindak Lanjut</h3>
                <p className="mb-6 text-sm text-gray-600">Dimensi di bawah ini perlu segera ditindaklanjuti. Lakukan aksi mandiri atau jadwalkan sesi dengan Guru BK.</p>

                <div className="space-y-4">
                  {lowPriorityResults.map((priority, index) => (
                    <div key={priority.id} className="break-inside-avoid flex flex-col gap-4 rounded-xl border border-red-200 bg-red-50 p-5 md:flex-row md:p-6">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-red-200 text-xl font-black text-red-900 shadow-inner">#{index + 1}</div>
                      <div>
                        <h4 className="mb-1 text-lg font-black text-gray-900">{priority.name} <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-sm font-bold text-red-600">(Skor: {priority.score} - {priority.category})</span></h4>
                        <p className="mt-3 border-l-4 border-red-300 pl-3 text-sm leading-relaxed text-gray-800">
                          <b className="mb-1 block text-red-900">Saran Aksi Mandiri & Layanan BK:</b>
                          {recommendationMap[priority.id]}
                        </p>
                      </div>
                    </div>
                  ))}

                  {lowPriorityResults.length === 0 && (
                    <div className="break-inside-avoid rounded-xl border border-green-200 bg-green-50 p-8 text-center">
                      <CheckCircle className="mx-auto mb-3 text-green-600" size={48} />
                      <h4 className="mb-2 text-xl font-black text-green-900">Kesiapan Karir Luar Biasa</h4>
                      <p className="mx-auto max-w-lg text-base text-green-800">Semua dimensi karir Anda berada pada kategori Tinggi. Teruskan eksplorasi dan konsultasikan pemantapan jurusan spesifik ke Guru BK Anda.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
