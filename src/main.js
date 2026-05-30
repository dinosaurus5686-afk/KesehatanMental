const moodOptions = [
  { label: 'Tenang', emoji: '😌', color: '#74c69d' },
  { label: 'Lelah', emoji: '😴', color: '#90a4ae' },
  { label: 'Cemas', emoji: '😟', color: '#f4a261' },
  { label: 'Sedih', emoji: '😢', color: '#5e8ac7' },
  { label: 'Bersemangat', emoji: '✨', color: '#ffca3a' },
];

const supportActions = [
  'Minum segelas air dan makan sesuatu yang ringan.',
  'Kirim pesan singkat ke orang yang kamu percaya.',
  'Berjalan pelan selama 5 menit atau regangkan bahu.',
  'Tulis satu hal kecil yang bisa kamu selesaikan hari ini.',
];

const prompts = [
  'Apa satu hal yang kamu butuhkan dari dirimu hari ini?',
  'Momen kecil apa yang membuatmu merasa sedikit lebih aman?',
  'Jika pikiranmu bisa beristirahat 10 menit, apa yang akan kamu lakukan?',
  'Batasan sehat apa yang ingin kamu jaga minggu ini?',
];

const state = {
  selectedMood: moodOptions[0],
  stressLevel: 4,
  breathing: false,
};

const elements = {
  breathCircle: document.querySelector('#breath-circle'),
  breathLabel: document.querySelector('#breath-label'),
  breathToggle: document.querySelector('#breath-toggle'),
  calmMeter: document.querySelector('#calm-meter'),
  carePlanText: document.querySelector('#care-plan-text'),
  dailyPrompt: document.querySelector('#daily-prompt'),
  heroEmoji: document.querySelector('#hero-emoji'),
  journal: document.querySelector('#journal'),
  moodList: document.querySelector('#mood-list'),
  selectedMood: document.querySelector('#selected-mood'),
  stressLevel: document.querySelector('#stress-level'),
  stressMeter: document.querySelector('#stress-meter'),
  stressSummary: document.querySelector('#stress-summary'),
  stressValue: document.querySelector('#stress-value'),
  supportActions: document.querySelector('#support-actions'),
  wordCount: document.querySelector('#word-count'),
};

function getCarePlan(stressLevel) {
  if (stressLevel >= 8) {
    return 'Prioritaskan keamanan dan dukungan langsung. Hubungi orang tepercaya atau layanan darurat setempat bila kamu merasa tidak aman.';
  }

  if (stressLevel >= 5) {
    return 'Ambil jeda 10 menit, kurangi stimulasi, dan pilih satu aktivitas menenangkan sebelum melanjutkan hari.';
  }

  return 'Pertahankan ritme yang sudah membantu: tidur cukup, makan teratur, dan rayakan kemajuan kecil.';
}

function renderMoodButtons() {
  elements.moodList.innerHTML = '';

  moodOptions.forEach((mood) => {
    const button = document.createElement('button');
    button.className = `mood-card${state.selectedMood.label === mood.label ? ' is-active' : ''}`;
    button.type = 'button';
    button.innerHTML = `<span aria-hidden="true">${mood.emoji}</span>${mood.label}`;
    button.addEventListener('click', () => {
      state.selectedMood = mood;
      render();
    });
    elements.moodList.appendChild(button);
  });
}

function renderSupportActions() {
  elements.supportActions.innerHTML = supportActions
    .map((action) => `<div class="support-card">${action}</div>`)
    .join('');
}

function render() {
  elements.heroEmoji.textContent = state.selectedMood.emoji;
  elements.selectedMood.textContent = state.selectedMood.label;
  elements.calmMeter.style.setProperty('--meter-color', state.selectedMood.color);
  elements.stressMeter.style.width = `${state.stressLevel * 10}%`;
  elements.stressSummary.textContent = `Tingkat beban: ${state.stressLevel}/10`;
  elements.stressValue.textContent = `${state.stressLevel}/10`;
  elements.carePlanText.textContent = getCarePlan(state.stressLevel);
  renderMoodButtons();
}

function initializeApp() {
  elements.dailyPrompt.textContent = prompts[new Date().getDay() % prompts.length];
  renderSupportActions();
  render();

  elements.stressLevel.addEventListener('input', (event) => {
    state.stressLevel = Number(event.target.value);
    render();
  });

  elements.journal.addEventListener('input', (event) => {
    const text = event.target.value.trim();
    const count = text ? text.split(/\s+/).length : 0;
    elements.wordCount.textContent = `${count} kata tertulis`;
  });

  elements.breathToggle.addEventListener('click', () => {
    state.breathing = !state.breathing;
    elements.breathCircle.classList.toggle('is-breathing', state.breathing);
    elements.breathLabel.textContent = state.breathing ? 'Tarik • Tahan • Hembus' : 'Siap';
    elements.breathToggle.textContent = state.breathing ? 'Berhenti' : 'Mulai latihan';
  });
}

initializeApp();
