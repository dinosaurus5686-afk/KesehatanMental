// Ikon garis sederhana (SVG inline).
const svg = (d) => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
export const I = {
  home: svg('<path d="M4 11.5 12 5l8 6.5V20h-5.5v-5h-5v5H4z"/>'),
  clip: svg('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>'),
  book: svg('<path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15H7.5A2.5 2.5 0 0 0 5 20.5zM5 20.5A2.5 2.5 0 0 0 7.5 23H19"/>'),
  pen: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  leaf: svg('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19 13 11"/>'),
  play: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>'),
  people: svg('<circle cx="9" cy="9" r="3"/><circle cx="17" cy="10" r="2.5"/><path d="M3.5 19c.5-3 2.8-5 5.5-5s5 2 5.5 5M14.5 15.2c.7-.4 1.6-.7 2.5-.7 2.2 0 3.8 1.6 4 4.5"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  grid: svg('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>'),
  user: svg('<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-3.6 3.6-6 7-6s6.2 2.4 7 6"/>'),
  chart: svg('<path d="M4 20V4M4 20h16"/><path d="m7 15 4-4 3 3 5-6"/>'),
  folder: svg('<path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z"/>'),
  desk: svg('<path d="M3 9h18M5 9v10M19 9v10M9 13h6"/><path d="M8 9V6h8v3"/>'),
  star: svg('<path d="m12 4 2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 19l1-5.4-4-3.8 5.4-.7z"/>'),
  shield: svg('<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>'),
  log: svg('<path d="M6 4h12v16H6z"/><path d="M9 8h6M9 12h6M9 16h3"/>'),
  calendar: svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M8 14h3M13 14h3M8 17h3"/>'),
  alert: svg('<path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5M12 17v.5"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>'),
};
