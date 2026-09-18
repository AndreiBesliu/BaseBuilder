/**
 * Mutatii: S20-23, taietura 2 — constructia.
 *
 * Pasul 1 (poarta pe felul desemnarii) e singurul livrat deocamdata. Probele lui
 * exista de pe acum dintr-un motiv pe care panoul de design l-a masurat: pana la
 * poarta, `cautaJob` nu citea niciodata `d.kind`, si o desemnare de alt fel era
 * luata ca job de SAPAT si stearsa. Cele 29 de probe ale taieturii 1 n-aveau cum
 * s-o vada — nu exista al doilea fel.
 *
 * E aceeasi lectie ca la recenzia taieturii 1, din partea cealalta: o mutatie
 * probeaza ce ating fixturile. Poarta asta a avut nevoie de un FEL nou ca sa
 * poata fi probata, si de-aia `Desemnare.CONSTRUIESTE` exista in cod inainte sa
 * existe o piesa.
 */

export const MUTATII = [
  {
    n: 'poarta pe fel scoasa: orice desemnare e luata ca job de SAPAT',
    f: 'src/sim/joburi.ts',
    a: '      if (d.kind[s] !== Desemnare.SAPA) continue',
    b: '      if (d.kind[s] === -1) continue',
    t: 'tests/constructie.test.ts', e: 'o desemnare care NU e de sapat',
  },
  {
    n: 'poarta mutata in trecerea SCUMPA (candidatii de alt fel mananca plafonul)',
    f: 'src/sim/joburi.ts',
    a: '      if (d.kind[s] !== Desemnare.SAPA) continue\n      raport.vizite++',
    b: '      raport.vizite++',
    t: 'tests/constructie.test.ts', e: 'o desemnare care NU e de sapat',
  },
  {
    n: '`seSapaLa` nu se uita la fel: orice desemnare blocheaza locul de lucru',
    f: 'src/sim/desemnari.ts',
    a: '  return slot !== undefined && d.kind[slot] === Desemnare.SAPA',
    b: '  return slot !== undefined',
    t: 'tests/constructie.test.ts', e: 'podeaua unei desemnari de CONSTRUIT',
  },

  // --- pasul 2: schema 7 ---
  {
    n: 'felul si piesa nu se verifica la incarcare (santinela devine decorativa)',
    f: 'src/sim/save.ts',
    a: '    if (eConstructie !== (felPiesa !== Piesa.NICIUNA)) {',
    b: '    if (false) {',
    t: 'tests/migrare.test.ts', e: 'felul si piesa trebuie sa se potriveasca',
  },
  {
    n: 'migrarea 6->7 nu scrie santinela (desemnarile vechi raman fara piesa)',
    f: 'src/sim/save.ts',
    a: "    return { ...d, desemnari: { ...des, piesa: des.piesa ?? new Array<number>(n).fill(Piesa.NICIUNA) } }",
    b: '    void n\n    return { ...d, desemnari: { ...des } }',
    t: 'tests/migrare.test.ts', e: 'migrarea 6 -> 7',
  },
  {
    n: 'slotul reutilizat mosteneste piesa desemnarii moarte',
    f: 'src/sim/desemnari.ts',
    a: '  d.piesa[slot] = Piesa.NICIUNA',
    b: '  void Piesa',
    t: 'tests/constructie.test.ts', e: 'slotul reutilizat nu mosten',
  },
  {
    n: '`exclusiv` se calculeaza doar peste sapat si carat',
    f: 'src/sim/joburi.ts',
    a: '  const exclusiv = Math.max(pS, pC, pB) === rules.personalPriorityLevels',
    b: '  void pB\n  const exclusiv = Math.max(pS, pC) === rules.personalPriorityLevels',
    t: 'tests/constructie.test.ts', e: 'un pion pus EXCLUSIV pe construit',
  },

  // --- pasul 3: continutul ---
  {
    n: 'o piesa poate costa altceva decat da inapoi (zidire + sapare tipareste materie)',
    f: 'src/sim/content.ts',
    a: '    if (p.cantitate !== y.cantitate) {',
    b: '    if (false) {',
    t: 'tests/content.test.ts', e: 'o piesa care nu costa cat da inapoi',
  },
  {
    n: 'invariantul de cantitate devine un PLAFON in loc de egalitate',
    f: 'src/sim/content.ts',
    a: '    if (p.cantitate !== y.cantitate) {',
    b: '    if (p.cantitate < y.cantitate) {',
    t: 'tests/content.test.ts', e: 'o piesa care nu costa cat da inapoi',
  },
  {
    n: 'o piesa poate fi mai scumpa decat incape intr-o mana',
    f: 'src/sim/content.ts',
    a: '    if (p.cantitate > r.haulCarryMax) {',
    b: '    if (false) {',
    t: 'tests/content.test.ts', e: 'o piesa care nu incape intr-o mana',
  },
  {
    n: 'grinda poate sprijini mai putin decat solul',
    f: 'src/sim/content.ts',
    a: '  if (r.suportRazaGrinda < r.suportMax) {',
    b: '  if (false) {',
    t: 'tests/content.test.ts', e: 'o grinda nu poate sprijini mai putin',
  },
  {
    n: 'o piesa se poate face din AER',
    f: 'src/sim/content.ts',
    a: '    if (!isSolid(mat[1])) {',
    b: '    if (false) {',
    t: 'tests/content.test.ts', e: 'o piesa din AER sau APA',
  },

  // --- pasul 4: stabilitatea la zidire ---
  {
    n: '`fill` nu mai trece prin regula de stabilitate (se zideste in aer)',
    f: 'src/sim/commands.ts',
    a: '      const sprijin = poateSustine(w.terrain, rules, cmd.wx, cmd.wy, cmd.z)\n      if (!sprijin.ok) return sprijin',
    b: '      void poateSustine',
    t: 'tests/constructie.test.ts', e: 'nu se mai poate zidi in aer',
  },
  {
    n: 'poarta accepta si suportul ZERO',
    f: 'src/sim/stabilitate.ts',
    a: '  if (suport > 0) return accept()',
    b: '  if (suport >= 0) return accept()',
    t: 'tests/constructie.test.ts', e: 'nu se mai poate zidi in aer',
  },
  {
    n: 'suportDacaZidesc crede ca orice celula noua e ASEZATA',
    f: 'src/sim/stabilitate.ts',
    a: '  if (sub === Sol.SOLID || sub === Sol.ANCORA) return rules.suportMax\n  return caveazaSpreAsezat(t, rules, wx, wy, z, null)',
    b: '  void sub\n  return rules.suportMax',
    t: 'tests/constructie.test.ts', e: 'nu se mai poate zidi in aer',
  },
  {
    n: 'suportDacaZidesc nu cauta lateral (doar asezat sau nimic)',
    f: 'src/sim/stabilitate.ts',
    a: '  return caveazaSpreAsezat(t, rules, wx, wy, z, null)',
    b: '  return 0',
    t: 'tests/constructie.test.ts', e: 'consola se intinde exact 3 celule',
  },
  {
    n: 'poarta refuza si pe o celula deja plina (mesajul devine inutil)',
    f: 'src/sim/stabilitate.ts',
    a: '  if (solLa(t, wx, wy, z) === Sol.SOLID) return accept()',
    b: '  if (false) return accept()',
    t: 'tests/constructie.test.ts', e: 'o celula deja plina raspunde CELULA_PLINA',
  },
]
