/**
 * Mutatii: S20-23, taietura 1 — stabilitatea, prabusirea, previzualizarea.
 *
 * Fiecare intrare: `n` numele, `f` fisierul, `a` tiparul cautat, `b` cu ce se
 * inlocuieste, `t` fisierul de teste care trebuie sa se inroseasca, `e` inceputul
 * numelui testului care trebuie sa pice. `e2` adauga editari.
 *
 * `e` se opreste INAINTE de orice caracter non-ASCII: numele testelor contin
 * „§" si „—", iar un prefix care le include depinde de codificarea cu care
 * `node --test` scrie in pipe. Se taie la ultimul cuvant sigur.
 *
 * ## Ce a prins prima rulare: 17 din 21
 *
 * Fiecare dintre cele patru RATATE era un gol real, nu un tipar prost scris:
 *
 *   - **pionul cadea „si asa".** Asertiunea venea dupa 60 de tickuri, iar
 *     `dezgroapa` il coboara oricum, cate un metru pe tick. Mutata INAINTE de
 *     orice tick, masoara ce trebuie: doua niveluri, in tickul prabusirii.
 *   - **desemnarile nu erau verificate.** Testul se baza pe `verificaRezervari`
 *     intr-o lume FARA colonisti — deci fara nicio rezervare de invalidat. Acum
 *     numara desemnarile vii.
 *   - **cascada n-avea fixtura.** `celuleAtinse` acopera z si z+1, deci un voxel
 *     de la z+2 nu e niciodata in multimea initiala; la 9x9 nu apare niciunul.
 *     Masurat: 13x13 e cea mai ieftina latime care chiar produce al doilea nivel.
 *   - **plafonul din BFS n-avea umbra.** Vezi comentariul de la mutatia lui: el si
 *     `max(0, ...)` sunt aceeasi garantie de doua ori. Se probeaza perechea.
 *
 * Si o a cincea, gasita scriind probele: starea ULTIMA_CELULA nu era asertata
 * nicaieri — testul verifica doar capetele, SIGUR si CADE.
 */

export const MUTATII = [
  // --- ancora: regula nu are voie sa distruga lumea inainte sa sape cineva ---
  {
    n: 'marginea lumii raspunde AER, nu ANCORA',
    f: 'src/sim/stabilitate.ts',
    a: '  if (wx < 0 || wy < 0 || wx >= WORLD_CELLS || wy >= WORLD_CELLS) return Sol.ANCORA',
    b: '  if (wx < 0 || wy < 0 || wx >= WORLD_CELLS || wy >= WORLD_CELLS) return Sol.AER',
    t: 'tests/stabilitate.test.ts', e: 'marginea lumii e PERETE',
  },
  {
    n: 'sub fereastra de voxeli e AER (talpa: ~7.500 de voxeli cad singuri)',
    f: 'src/sim/stabilitate.ts',
    a: '  if (z < baza) return Sol.ANCORA',
    b: '  if (z < baza) return Sol.AER',
    t: 'tests/stabilitate.test.ts', e: 'sub fereastra de voxeli e ANCORA',
  },
  {
    n: 'ancora de dedesubt nu conteaza ca sprijin',
    f: 'src/sim/stabilitate.ts',
    a: '  return sub === Sol.SOLID || sub === Sol.ANCORA',
    b: '  return sub === Sol.SOLID',
    t: 'tests/stabilitate.test.ts', e: 'teren NEATINS',
  },

  // --- regula ---
  {
    n: 'suportul nu scade pe pas lateral (fara −1)',
    f: 'src/sim/stabilitate.ts',
    a: '      if (esteAsezat(t, nx, ny, z, cazute)) return Math.max(0, rules.suportMax - (d + 1))',
    b: '      if (esteAsezat(t, nx, ny, z, cazute)) return Math.max(0, rules.suportMax - d)',
    t: 'tests/stabilitate.test.ts', e: 'GRANITA: 6 lat TINE, 7 CADE',
  },
  {
    n: 'distanta nu creste in coada: tot nivelul e la un pas',
    f: 'src/sim/stabilitate.ts',
    a: '      coadaD.push(d + 1)',
    b: '      coadaD.push(d)',
    t: 'tests/stabilitate.test.ts', e: 'suportul scade cu exact 1 pe pas lateral',
  },
  {
    n: 'voxelul asezat nu ia scurtatura la suportMax (off-by-one peste tot)',
    f: 'src/sim/stabilitate.ts',
    a: '  if (esteAsezat(t, wx, wy, z, cazute)) return rules.suportMax',
    b: '  if (esteAsezat(t, wx, wy, z, cazute) && false) return rules.suportMax',
    t: 'tests/stabilitate.test.ts', e: 'suportul scade cu exact 1 pe pas lateral',
  },
  // Plafonul din BFS si `max(0, ...)` sunt aceeasi garantie scrisa de doua ori, si
  // se acopera unul pe altul: scos oricare SINGUR, raspunsul nu se schimba cu
  // niciun bit, si prima versiune a probei a iesit RATATA tocmai de asta. Garantia
  // exista insa, si e serioasa — fara amandoua, un tavan la 5 pasi da −1, care nu
  // e nici 0 nici 1, deci `stareSapat` raspunde SIGUR unde e cel mai periculos.
  // Se probeaza cu DOUA editari, prin `e2`.
  {
    n: 'suportul poate deveni NEGATIV (fara plafon si fara max)',
    f: 'src/sim/stabilitate.ts',
    a: '    if (d >= rules.suportMax) continue',
    b: '    if (d >= rules.suportMax * 4) continue',
    e2: [{
      f: 'src/sim/stabilitate.ts',
      a: '      if (esteAsezat(t, nx, ny, z, cazute)) return Math.max(0, rules.suportMax - (d + 1))',
      b: '      if (esteAsezat(t, nx, ny, z, cazute)) return rules.suportMax - (d + 1)',
    }],
    t: 'tests/stabilitate.test.ts', e: 'starea are VERB',
  },

  // --- multimea atinsa ---
  {
    n: 'celuleAtinse acopera doar cota z, nu si z+1',
    f: 'src/sim/stabilitate.ts',
    a: '  for (const dz of [0, 1]) {',
    b: '  for (const dz of [0]) {',
    t: 'tests/stabilitate.test.ts', e: 'celuleAtinse acopera DOUA cote',
  },
  {
    n: 'discul atins e cu o celula mai mic',
    f: 'src/sim/stabilitate.ts',
    a: '  const raza = rules.suportMax - 1',
    b: '  const raza = rules.suportMax - 2',
    t: 'tests/stabilitate.test.ts', e: 'ACCEPTANTA (PLAN',
  },
  {
    n: 'ce cade nu re-verifica vecinatatea (fara cascada)',
    f: 'src/sim/stabilitate.ts',
    a: '    // Ce cade poate lua cu el ce se sprijinea pe el: se re-verifica vecinatatea.\n    celuleAtinse(rules, c.wx, c.wy, c.z, deVerificat)',
    b: '    // Ce cade poate lua cu el ce se sprijinea pe el: se re-verifica vecinatatea.',
    t: 'tests/stabilitate.test.ts', e: 'cascada: ce cade trage dupa sine',
  },
  {
    n: 'celulele sapate nu intra in multimea „cazute"',
    f: 'src/sim/stabilitate.ts',
    a: '  const cazute = new Set<number>(sapate)',
    b: '  const cazute = new Set<number>()',
    t: 'tests/stabilitate.test.ts', e: 'previzualizarea se face pe MULTIMEA desemnarilor',
  },
  {
    n: 'solLa ignora multimea „cazute" (ipoteticul nu se vede)',
    f: 'src/sim/stabilitate.ts',
    a: '  if (cazute !== null && cazute.has(cellKey(wx, wy, z))) return Sol.AER',
    b: '  if (cazute !== null && cazute.has(cellKey(wx, wy, z)) && false) return Sol.AER',
    t: 'tests/stabilitate.test.ts', e: 'previzualizarea se face pe MULTIMEA desemnarilor',
  },

  // --- asezarea ---
  {
    n: 'ce cade coboara un SINGUR nivel (maxStepM refolosit ca plafon de cadere)',
    f: 'src/sim/stabilitate.ts',
    a: '  while (z > baza && solLa(t, wx, wy, z - 1, cazute) === Sol.AER) z--',
    b: '  if (z > baza && solLa(t, wx, wy, z - 1, cazute) === Sol.AER) z--',
    t: 'tests/stabilitate.test.ts', e: 'ce cade coboara pana la prima podea',
  },
  {
    n: 'voxelul cazut nu lasa MOLOZ (prabusirea devine recompensa)',
    f: 'src/sim/joburi.ts',
    a: '      const puneMoloz = fill(w.terrain, c.wx, c.wy, jos, Material.MOLOZ)\n      if (puneMoloz.ok) markDirty(w.regions, c.wx, c.wy, jos, rules)',
    b: '      void jos',
    t: 'tests/stabilitate.test.ts', e: 'voxelul cazut lasa MOLOZ pe podea',
  },
  {
    n: 'desemnarea de pe voxelul cazut nu se anuleaza (rezervare pe id mort)',
    f: 'src/sim/joburi.ts',
    a: '    const ds = desemnareLaCelula(w.desemnari, c.wx, c.wy, c.z)\n    if (ds !== -1) anuleazaDesemnare(w, rules, ds)',
    b: '    const ds = desemnareLaCelula(w.desemnari, c.wx, c.wy, c.z)\n    void ds',
    t: 'tests/stabilitate.test.ts', e: 'prabusirea nu lasa rezervari pe tinte moarte',
  },
  {
    n: 'pionul ramas fara podea nu e cautat deloc',
    f: 'src/sim/joburi.ts',
    a: '      if (isWalkable(w.terrain, wx2, wy2, a.z[i]!, rules)) continue',
    b: '      if (true) continue',
    t: 'tests/stabilitate.test.ts', e: 'un pion ramas fara podea CADE pe ea',
  },
  {
    n: 'pionul cade cu un singur nivel, apoi ramane in aer pe veci',
    f: 'src/sim/joburi.ts',
    a: '      const nou = cotaDeAsezare(w.terrain, wx2, wy2, a.z[i]!)',
    b: '      const nou = a.z[i]! - 1',
    t: 'tests/stabilitate.test.ts', e: 'un pion ramas fara podea CADE pe ea',
  },

  // --- ce vede jucatorul ---
  {
    n: 'previzualizarea se face pe FIECARE desemnare in parte (K07 in forma pura)',
    f: 'src/sim/joburi.ts',
    a: '  if (celule.length === 0) return []\n  return cadeDaca(w.terrain, rules, celule)',
    b: '  if (celule.length === 0) return []\n  const iesire = []\n  for (const c of celule) for (const k of cadeDaca(w.terrain, rules, [c])) iesire.push(k)\n  return iesire',
    t: 'tests/stabilitate.test.ts', e: 'previzualizarea se face pe MULTIMEA desemnarilor',
  },
  {
    n: 'cifra aratata e a celulei ACTIVE, nu a tavanului (overlay-ul arata 4 peste tot)',
    f: 'src/sim/stabilitate.ts',
    a: '  return suportLa(t, rules, wx, wy, z + 1, ipotetic)',
    b: '  void ipotetic\n  return suportLa(t, rules, wx, wy, z + 1)',
    t: 'tests/stabilitate.test.ts', e: 'cifra aratata e a TAVANULUI',
  },
  {
    n: 'ULTIMA_CELULA se raporteaza ca SIGUR (sfatul dispare)',
    f: 'src/sim/stabilitate.ts',
    a: '  if (dupa === 1) return StareSapat.ULTIMA_CELULA',
    b: '  if (dupa === 1) return StareSapat.SIGUR',
    t: 'tests/stabilitate.test.ts', e: 'starea are VERB',
  },
  {
    n: 'CADE nu se raporteaza niciodata',
    f: 'src/sim/stabilitate.ts',
    a: '  if (dupa === 0) return StareSapat.CADE',
    b: '  if (dupa === -1) return StareSapat.CADE',
    t: 'tests/stabilitate.test.ts', e: 'starea are VERB',
  },
]
