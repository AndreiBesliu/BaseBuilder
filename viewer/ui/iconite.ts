/**
 * Iconitele UI-ului: SVG inline, 20×20, desenate cu linie (`currentColor`), ca sa ia culoarea
 * butonului in orice stare. Fara fisiere, fara font de iconite: jocul merge offline.
 */

const svg = (corp: string): string =>
  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${corp}</svg>`

export const ICON = {
  meniu: svg('<path d="M3 5h14M3 10h14M3 15h14"/>'),
  selecteaza: svg('<path d="M5 3l10 6-4.2 1.3L13 16l-2 1-2.3-5.6L5 14z"/>'),
  sapa: svg('<path d="M4 7c3-3.5 9-4 12-1"/><path d="M10 5.2L7.5 16.5"/><path d="M6.5 15.5l2 1.5"/>'),
  construieste: svg('<rect x="2.5" y="4" width="15" height="12" rx="1"/><path d="M2.5 8h15M2.5 12h15M8 4v4M13 8v4M8 12v4"/>'),
  perete: svg('<rect x="4" y="3" width="12" height="14" rx="1"/><path d="M4 7.7h12M4 12.3h12M10 3v4.7M7 7.7v4.6M13 7.7v4.6M10 12.3V17"/>'),
  podea: svg('<path d="M2.5 12l7.5-4 7.5 4-7.5 4z"/><path d="M2.5 12v2l7.5 4 7.5-4v-2"/>'),
  scara: svg('<path d="M3 17h4v-4h4V9h4V5h2"/><path d="M3 17h14"/>'),
  grinda: svg('<path d="M3 6h14M3 14h14M10 6v8"/><path d="M5 6v0M15 6v0"/>'),
  usa: svg('<path d="M3 17h14"/><path d="M5 17V4h10v13"/><rect x="7.5" y="6.5" width="5" height="10.5"/><path d="M11 12v.01"/>'),
  incaperi: svg('<path d="M3 16V5h14v11z"/><path d="M10 5v11M3 10.5h7"/><path d="M13 16v-3h2v3"/>'),
  temperatura: svg('<path d="M8 12.2V4.5a2 2 0 014 0v7.7a3.5 3.5 0 11-4 0z"/><path d="M10 8v6"/><path d="M14.5 5.5h2M14.5 8.5h2"/>'),
  anuleaza: svg('<circle cx="10" cy="10" r="7"/><path d="M7 7l6 6M13 7l-6 6"/>'),
  zona: svg('<rect x="3" y="3" width="14" height="14" rx="1" stroke-dasharray="2.5 2"/>'),
  depozit: svg('<path d="M3 7l7-3.5L17 7v8.5H3z"/><path d="M3 7h14M7 10.5h6"/>'),
  dormit: svg('<path d="M3 15V6M3 11h14v4M17 11V9a2 2 0 00-2-2H9v4"/><circle cx="6" cy="8.5" r="1.5"/>'),
  stergeZona: svg('<rect x="3" y="3" width="14" height="14" rx="1" stroke-dasharray="2.5 2"/><path d="M7 10h6"/>'),
  pauza: svg('<path d="M7 5v10M13 5v10"/>'),
  play: svg('<path d="M7 5l8 5-8 5z"/>'),
  sus: svg('<path d="M5 12l5-5 5 5"/>'),
  jos: svg('<path d="M5 8l5 5 5-5"/>'),
  toate: svg('<path d="M3 6h14M3 10h14M3 14h14"/>'),
  joburi: svg('<rect x="4" y="3" width="12" height="15" rx="1.5"/><path d="M7 3v2h6V3M7 9h6M7 12h6M7 15h3"/>'),
  stabilitate: svg('<path d="M3 17h14M5 17V9M15 17V9M3 9l7-5 7 5"/><path d="M10 17v-5"/>'),
  regiuni: svg('<circle cx="5" cy="6" r="2"/><circle cx="15" cy="6" r="2"/><circle cx="10" cy="15" r="2"/><path d="M6.8 7l2.4 6.2M13.2 7l-2.4 6.2M7 6h6"/>'),
  oameni: svg('<circle cx="7" cy="7" r="2.5"/><circle cx="14" cy="8" r="2"/><path d="M2.5 16c.5-3 2.4-4.5 4.5-4.5s4 1.5 4.5 4.5M11.5 12.3c.8-.5 1.6-.8 2.5-.8 1.8 0 3.3 1.3 3.7 4"/>'),
  atentie: svg('<path d="M10 3l8 14H2z"/><path d="M10 8v4M10 14.5v.01"/>'),
  critic: svg('<path d="M7 2.5h6L17.5 7v6L13 17.5H7L2.5 13V7z"/><path d="M10 6.5v4.5M10 13.5v.01"/>'),
  eveniment: svg('<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6.5v.01"/>'),
  urmareste: svg('<circle cx="10" cy="10" r="3"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3"/>'),
  nivel: svg('<path d="M3 7l7-3.5L17 7l-7 3.5z"/><path d="M3 11l7 3.5 7-3.5"/>'),
  inchide: svg('<path d="M5 5l10 10M15 5L5 15"/>'),
  ajutor: svg('<circle cx="10" cy="10" r="7"/><path d="M8 8a2 2 0 113 1.7c-.7.4-1 .8-1 1.6M10 14v.01"/>'),
} as const
