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
  // NU exista proba pentru `max(0, ...)` si nici pentru plafonul din BFS, si asta
  // se scrie aici in loc sa se fabrice una.
  //
  // Cele doua sunt aceeasi garantie de doua ori si se acopera una pe alta, deci
  // scoasa oricare SINGURA nu schimba niciun bit. Pana la rescrierea lui
  // `stareSapat` se puteau proba impreuna, prin `e2`: fara amandoua, un tavan la 5
  // pasi dadea −1, care nu e nici 0 nici 1, si raspunsul iesea SIGUR. Acum
  // `stareSapat` nu mai citeste numarul brut — intreaba propagarea, care trateaza
  // orice `suport <= 0` drept cadere — deci nici perechea nu mai are umbra in
  // comportament. Clema ramane fiindca face functia sa respecte definitia scrisa in
  // antetul ei, nu fiindca ar apara un caz observabil azi.

  // --- marginea lumii ---
  //
  // Garda din `solLa` era corecta si nu apara nimic: `celuleAtinse` construia cheia
  // INAINTE s-o intrebe pe ea. Dupa `cellKey`, informatia „era in afara lumii" nu
  // mai exista, iar cheia decodeaza intr-o celula reala de la capatul opus al
  // hartii. Doua probe, cate una pe fiecare axa.
  {
    n: 'celuleAtinse emite chei cu wx din AFARA lumii (aliaseaza la est)',
    f: 'src/sim/stabilitate.ts',
    a: '      if (nx < 0 || nx >= WORLD_CELLS) continue',
    b: '      if (nx < -99999) continue',
    t: 'tests/stabilitate.test.ts', e: 'marginea lumii nu ALIASEAZA',
  },
  {
    n: 'celuleAtinse emite chei cu wy din AFARA lumii (aliaseaza pe cota vecina)',
    f: 'src/sim/stabilitate.ts',
    a: '        if (ny < 0 || ny >= WORLD_CELLS) continue',
    b: '        if (ny < -99999) continue',
    t: 'tests/stabilitate.test.ts', e: 'marginea lumii nu ALIASEAZA',
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

  {
    n: 'ordinea multimii care cade e inversata (varful cade primul)',
    f: 'src/sim/stabilitate.ts',
    a: '    return ca.z - cb.z || ca.wx - cb.wx || ca.wy - cb.wy',
    b: '    return cb.z - ca.z || ca.wx - cb.wx || ca.wy - cb.wy',
    t: 'tests/stabilitate.test.ts', e: 'ordinea prabusirii e (z crescator)',
  },
  {
    n: 'multimea care cade nu se sorteaza deloc',
    f: 'src/sim/stabilitate.ts',
    a: '    return ca.z - cb.z || ca.wx - cb.wx || ca.wy - cb.wy',
    b: '    void ca\n    void cb\n    return 0',
    t: 'tests/stabilitate.test.ts', e: 'ordinea prabusirii e (z crescator)',
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
    a: '      const puneMoloz = fill(w.terrain, c.wx, c.wy, jos, Material.MOLOZ)\n      if (puneMoloz.ok) {\n        markDirty(w.regions, c.wx, c.wy, jos, rules)\n        noteaza(c.wx, c.wy, jos)\n      }',
    b: '      noteaza(c.wx, c.wy, jos)',
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
    a: '      const nou = cotaDeRefugiu(w.terrain, wx2, wy2, a.z[i]!)',
    b: '      const nou = a.z[i]! - 1',
    t: 'tests/stabilitate.test.ts', e: 'un pion ramas fara podea CADE pe ea',
  },

  // --- cota de aterizare ---
  {
    n: 'cota in care aterizeaza molozul nu se curata (pion zidit, morman ingropat)',
    f: 'src/sim/joburi.ts',
    a: '        noteaza(c.wx, c.wy, jos)',
    b: '        void jos',
    t: 'tests/stabilitate.test.ts', e: 'molozul nu zideste ce gaseste',
  },
  {
    n: 'refugiul doar COBOARA: un pion zidit primeste chiar cota lui',
    f: 'src/sim/joburi.ts',
    a: '  while (solLa(t, wx, wy, z) === Sol.SOLID) z++',
    b: '  void solLa',
    t: 'tests/stabilitate.test.ts', e: 'molozul nu zideste ce gaseste',
  },
  {
    n: 'carligele se aplica doar pe VARFUL coloanei, nu pe fiecare cota atinsa',
    f: 'src/sim/joburi.ts',
    a: '    const cote = [...new Set(afectate.get(cheieColoana)!)].sort((p, q) => p - q)',
    b: '    const cote = [Math.max(...afectate.get(cheieColoana)!)]',
    t: 'tests/stabilitate.test.ts', e: 'molozul nu zideste ce gaseste',
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
    a: '  return minim <= 1 ? StareSapat.ULTIMA_CELULA : StareSapat.SIGUR',
    b: '  return StareSapat.SIGUR',
    t: 'tests/stabilitate.test.ts', e: 'starea are VERB',
  },
  {
    n: 'minimul nu se urmareste in propagare (ULTIMA_CELULA nu se poate atinge)',
    f: 'src/sim/stabilitate.ts',
    a: '      if (suport < minim) minim = suport',
    b: '      if (suport < -1) minim = suport',
    t: 'tests/stabilitate.test.ts', e: 'starea are VERB',
  },
  {
    n: 'CADE nu se raporteaza niciodata',
    f: 'src/sim/stabilitate.ts',
    a: '  if (cazute.size > 1) return StareSapat.CADE',
    b: '  if (cazute.size > 99) return StareSapat.CADE',
    t: 'tests/stabilitate.test.ts', e: 'stareSapat nu minte',
  },
  // Proba centrala a rescrierii: versiunea veche, care se uita doar la tavanul de
  // deasupra celulei. Testul dreptunghiular trebuie s-o prinda; cele patrate nu o
  // prindeau, fiindca acolo ce cade CHIAR e voxelul de deasupra.
  {
    n: 'stareSapat se uita doar la tavanul de deasupra (versiunea dinainte de recenzie)',
    f: 'src/sim/stabilitate.ts',
    a: '  const { cazute, minim } = propaga(t, rules, [cellKey(wx, wy, z)])',
    b: '  const { cazute, minim } = propaga(t, rules, [cellKey(wx, wy, z)])\n  void cazute\n  void minim\n  const dupa = suportDacaSap(t, rules, wx, wy, z)\n  if (solLa(t, wx, wy, z + 1) !== Sol.SOLID) return StareSapat.SIGUR\n  if (dupa === 0) return StareSapat.CADE\n  if (dupa === 1) return StareSapat.ULTIMA_CELULA\n  return StareSapat.SIGUR',
    t: 'tests/stabilitate.test.ts', e: 'stareSapat nu minte',
  },
]
