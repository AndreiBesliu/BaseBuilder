/**
 * Mutatii: incaperile (src/sim/camere.ts) si punctele fixe in care simularea le tine la zi.
 * Oracolul (incremental == recalcul complet) prinde multe; fiecare proba numeste insa testul scris
 * pentru garantia ei — capcanele panoului pe v1 (fantoma dupa umplere, apa, colturile de chunk).
 */

const T = 'tests/camere.test.ts'
const TC = 'tests/camere-contract.test.ts'
const C = 'src/sim/camere.ts'
const TE = 'tests/camere-explica.test.ts'
const E = 'src/sim/camere-explica.ts'

export const MUTATII = [
  {
    n: 'DEF-1: felia celulei editate se reface doar daca celula e acum aer acoperit (fantoma dupa umplere)',
    f: C,
    a: '      if (areFelie(x, y, zz) || esteAerAcoperit(r, x, y, zz)) murdare.add(cheieFelie(bx, by, zz))',
    b: '      if (esteAerAcoperit(r, x, y, zz)) murdare.add(cheieFelie(bx, by, zz))',
    t: T, e: 'umplerea completa a unei incaperi de o celula nu lasa fantoma',
  },
  {
    n: 'felia celulei editate se reface MEREU (cariera deschisa plateste felii)',
    f: C,
    a: '      if (areFelie(x, y, zz) || esteAerAcoperit(r, x, y, zz)) murdare.add(cheieFelie(bx, by, zz))',
    b: '      murdare.add(cheieFelie(bx, by, zz))',
    t: T, e: 'K05: sapatul intr-o cariera deschisa',
  },
  {
    n: 'vecinii laterali din alt bloc se refac si fara bucati (cariera peste granita plateste felii)',
    f: C,
    a: '        if (areFelie(nx, ny, zz)) murdare.add(cheieFelie(nbx, nby, zz))',
    b: '        murdare.add(cheieFelie(nbx, nby, zz))',
    t: T, e: 'K05: sapatul intr-o cariera deschisa',
  },
  {
    n: 'vecinii laterali din alt bloc nu se refac deloc (fetele lor deschise raman vechi)',
    f: C,
    a: '        if (areFelie(nx, ny, zz)) murdare.add(cheieFelie(nbx, nby, zz))',
    b: '        void nbx',
    t: T, e: 'ORACOL: pe coltul a patru chunk-uri',
  },
  {
    n: 'rulajul de aer de sub editare nu se citeste (acoperisul pus peste o sala nu se vede)',
    f: C,
    a: '    while (esteAer(r, x, y, jos - 1)) jos--',
    b: '    void jos',
    t: T, e: 'o casa inchisa de 5x5',
  },
  {
    n: 'DEF-2: apa nu acopera (varful coloanei sare peste APA)',
    f: C,
    a: '    if (mat[l] !== Material.AER) {',
    b: '    if (mat[l] !== Material.AER && mat[l] !== Material.APA) {',
    t: T, e: 'APA acopera (DEF-2)',
  },
  {
    n: 'recalculul complet nu enumera aerul de sub apa (incremental != complet pe iaz)',
    f: C,
    a: '        if (buf[l] !== Material.AER) {',
    b: '        if (buf[l] !== Material.AER && buf[l] !== Material.APA) {',
    t: T, e: 'ORACOL: pe un iaz',
  },
  {
    n: 'muchiile verticale lipsesc (o casa cu ziduri de 2 m iese doua componente)',
    f: C,
    a: '    if (jos && jos.cel[s]! !== -1) leaga(idx, id, jos.cel[s]!)',
    b: '    void jos',
    t: T, e: 'o casa inchisa de 5x5',
  },
  {
    n: 'muchia laterala spre vest, peste marginea blocului, lipseste',
    f: C,
    a: '    if (lx === 0 && vest && vest.cel[s + FELIE - 1]! !== -1) leaga(idx, id, vest.cel[s + FELIE - 1]!)',
    b: '    void vest',
    t: T, e: 'ORACOL: pe coltul a patru chunk-uri',
  },
  {
    n: 'fata deschisa spre sud nu se numara (un gol in peretele de sud nu deschide incaperea)',
    f: C,
    a: '      if (esteCer(r, x, y - 1, z)) deschise++',
    b: '      void 0',
    t: T, e: 'o gaura in acoperis sau un gol in perete',
  },
  {
    n: 'vecinii unei bucati sterse nu se reparcurg (componentele despartite raman una)',
    f: C,
    a: '    atinse.add(q)',
    b: '    void q',
    t: T, e: 'ORACOL: incremental == recalcul complet, fuzz pe uscat',
  },
  {
    n: 'depasirea jurnalului nu reconstruieste (citeste intrari suprascrise)',
    f: C,
    a: '  if (n < 0 || n > JURNAL_CAP) {',
    b: '  if (n < 0 || n > JURNAL_CAP * 2) {',
    t: T, e: 'depasirea jurnalului reconstruieste complet',
  },
  {
    n: 'fiecare sincronizare reconstruieste complet (K05: recalculari in regim)',
    f: C,
    a: '  if (n < 0 || n > JURNAL_CAP) {',
    b: '  if (n < 0 || n > 0) {',
    t: T, e: 'K05: o lume incarcata reconstruieste o data',
  },
  {
    n: 'construiesteCamere nu construieste (decode porneste cu un index gol)',
    f: C,
    a: '  reconstruiesteCamere(idx, t)\n  return idx',
    b: '  return idx',
    t: T, e: 'SALVARE: lumea incarcata are exact indexul',
  },
  {
    n: 'punctul fix de la capatul tickului lipseste',
    f: 'src/sim/world.ts',
    a: '  sincronizeazaCamere(w.camere, w.terrain)\n  w.tick++',
    b: '  w.tick++',
    t: T, e: 'PUNCTELE FIXE',
  },
  {
    n: 'punctul fix de dupa comanda dig lipseste (CONT-1 pentru incaperi)',
    f: 'src/sim/commands.ts',
    a: '      // comanda si tick ar fi scris altfel stare pusa pe ele (panoul camerelor, CTR-2).\n      sincronizeazaCamere(w.camere, w.terrain)',
    b: '      // comanda si tick ar fi scris altfel stare pusa pe ele (panoul camerelor, CTR-2).',
    t: T, e: 'PUNCTELE FIXE',
  },
  {
    n: 'punctul fix de dupa comanda fill lipseste',
    f: 'src/sim/commands.ts',
    a: '      rebuildDirty(w.terrain, w.regions, rules)\n      sincronizeazaCamere(w.camere, w.terrain)\n      return accept(0)',
    b: '      rebuildDirty(w.terrain, w.regions, rules)\n      return accept(0)',
    t: T, e: 'PUNCTELE FIXE',
  },
  // --- recenzia incaperilor: costul (IDX-2, IDX-3 / CTR-5)
  {
    n: 'IDX-2: jurnalul terenului inapoi la 4096 (o prabusire mare reconstruieste lumea in mijlocul comenzii)',
    f: 'src/sim/terrain/terrain.ts',
    a: 'export const JURNAL_CAP = 65536',
    b: 'export const JURNAL_CAP = 4096',
    t: T, e: 'K05 (IDX-2): o prabusire de peste 4096 de editari',
  },
  {
    n: 'K01: sincronizarea reparcurge TOATE bucatile vii (fiecare componenta moare la fiecare editare; oracolul e orb)',
    f: C,
    a: '  const seminte = [...noi, ...[...atinse].sort((a, b) => a - b)]',
    b: '  const seminte = [...noi, ...[...atinse].sort((a, b) => a - b)]\n  for (let b = 0; b < idx.bUrmator; b++) if (idx.bVecini[b] !== undefined) { seminte.push(b); if (idx.bComp[b]! >= 0) moarte.add(idx.bComp[b]!) }',
    t: T, e: 'K05: o sapatura intr-o pivnita izolata dintre 576',
  },
  {
    // Dupa calea rapida (IDX-1), sapaturile la fata galeriei nu mai trec prin BFS: proba musca la
    // taierea galeriei in doua, care il cere.
    n: 'IDX-3: componentele atinse se reparcurg de doua ori pe sincronizare (acelasi index, costul dublu; oracolul e orb)',
    f: C,
    a: '  else componente(idx, seminte, moarte)',
    b: '  else { componente(idx, seminte, moarte); componente(idx, seminte, moarte) }',
    t: T, e: 'K05: o galerie lunga, acoperita si deschisa la gura',
  },
  // --- recenzia incaperilor: calea rapida a sincronizarii (IDX-1) — conditiile de iesire
  {
    n: 'IDX-1: calea rapida nu se ia niciodata (fiecare sapatura la fata minei reparcurge toata mina)',
    f: C,
    a: '  if (moarte.size > 1) return false',
    b: '  if (moarte.size >= 0) return false',
    t: T, e: 'K05 (IDX-1): o sapatura la fata unei mine',
  },
  {
    n: 'IDX-1: calea rapida primeste un lot care atinge DOUA componente (cea golita cu totul ramane in index)',
    f: C,
    a: '  if (moarte.size > 1) return false',
    b: '  if (moarte.size > 2) return false',
    t: T, e: 'IDX-1: un lot care umple o nisa',
  },
  {
    n: 'IDX-1: calea rapida nu vede unirea cu o componenta vecina bucatilor noi (doua pivnite suprapuse raman doua)',
    f: C,
    a: '        else if (cq !== c) return false',
    b: '        else if (cq !== c) void 0',
    t: T, e: 'IDX-1: o gaura intre doua pivnite suprapuse',
  },
  {
    n: 'IDX-1: calea rapida nu vede despartirea (galeria taiata ramane o componenta)',
    f: C,
    a: '    else if (r !== r0) return false',
    b: '    else if (r !== r0) void 0',
    t: T, e: 'K05: o galerie lunga, acoperita si deschisa la gura',
  },
  {
    // Loturile fuzz-ului au cel mult 4 editari, iar tickul cu pioni face una: fara scena prabusirii,
    // o sincronizare care citeste doar coada lotului trecea (recenzia incaperilor, CTR-9).
    n: 'CTR-9: sincronizarea citeste doar ultimele 4 editari ale lotului (prabusirea lasa indexul vechi)',
    f: C,
    a: '  for (let i = idx.vazute; i < t.editari; i++) {',
    b: '  for (let i = Math.max(idx.vazute, t.editari - 4); i < t.editari; i++) {',
    t: T, e: 'PRABUSIRE: placa 5x5 pe un stalp',
  },
  {
    n: 'IDX-4: recalculul reface feliile in ordinea cheii (z intai): coloanele unui bloc se decodeaza din nou la fiecare nivel',
    f: C,
    a: '  for (const cheie of [...felii].sort((a, b) => (a % BB) - (b % BB) || a - b)) {',
    b: '  for (const cheie of [...felii].sort((a, b) => a - b)) {',
    t: T, e: 'K05 (IDX-4): recalculul complet decodeaza fiecare coloana',
  },
  {
    n: 'IDX-4: recalculul pune cheile feliilor in ordinea refacerii (bloc intai), nesortate',
    f: C,
    a: '  for (const k of [...idx.felii.keys()].sort((a, b) => a - b)) idx.chei.push(k)',
    b: '  for (const k of idx.felii.keys()) idx.chei.push(k)',
    t: T, e: 'K05 (IDX-4): recalculul complet decodeaza fiecare coloana',
  },
  // --- recenzia incaperilor: a treia cale de editare, M10 zidita direct pe lumea gate-ului (IDX-5)
  {
    n: 'IDX-5: M10 zidita pe o lume fara punctul de sincronizare (vazute = 0, 0 incaperi, prima sapatura reconstruieste tot)',
    f: 'src/harness/fixture-m10.ts',
    a: '  reconstruiesteCamere(w.camere, w.terrain)\n  return stats',
    b: '  return stats',
    t: 'tests/fixture.test.ts', e: 'M10 pe o LUME (gate-ul viewer-ului, IDX-5)',
  },
  {
    n: 'IDX-5: gate-ul viewer-ului zideste M10 direct pe terenul lumii',
    f: 'viewer/main.ts',
    a: '  buildM10PeLume(world, FOCUS_CX, FOCUS_CY)',
    b: '  buildM10(world.terrain, FOCUS_CX, FOCUS_CY)',
    t: 'tests/fixture.test.ts', e: 'nimeni in afara fixturii nu zideste M10 direct',
  },
  // --- recenzia incaperilor: garda de la salvare (CTR-10)
  {
    n: 'CTR-10: encode nu mai cere indexul incaperilor la zi (o editare care ocoleste punctele fixe se salveaza tacut)',
    f: 'src/sim/save.ts',
    a: '  cerIndexLaZi(w)\n  const a = w.agents',
    b: '  const a = w.agents',
    t: T, e: 'SALVARE (CTR-10): encode refuza',
  },
  {
    n: 'CTR-10: garda de la encode compara doar numarul de editari, nu si terenul indexului',
    f: 'src/sim/save.ts',
    a: '  if (c.teren !== w.terrain || c.vazute !== w.terrain.editari) {',
    b: '  if (c.vazute !== w.terrain.editari) {',
    t: T, e: 'SALVARE (CTR-10): encode refuza',
  },
  // --- recenzia incaperilor: fixtura golden cu incaperi si usi (CTR-8)
  {
    n: 'CTR-8: decode refuza materialul USA ca build-ul de dinainte de usa (o salvare cu usi nu se mai incarca)',
    f: 'src/sim/save.ts',
    a: '      if (!esteMaterialCunoscut(m)) {',
    b: '      if (!esteMaterialCunoscut(m) || m > 8) {',
    t: 'tests/migrare-incaperi.test.ts', e: 'fixtura de schema 7 cu incaperi se incarca',
  },
  // --- recenzia incaperilor: contractul pe hartie (CTR-4). Oracolul incremental == complet e orb la
  // toate: ambele parti calculeaza ancora, fetele, cheile si nivelul cu aceeasi functie.
  {
    n: 'N01: fata deschisa spre vest numarata de doua ori',
    f: C,
    a: '      if (esteCer(r, x - 1, y, z)) deschise++',
    b: '      if (esteCer(r, x - 1, y, z)) deschise += 2',
    t: TC, e: 'CONTRACT: fetele deschise pe hartie',
  },
  {
    n: 'N03: ancora componentei = MAXIMUL ancorelor de bucata',
    f: C,
    a: '      if (idx.bAncora[p]! < ancora) ancora = idx.bAncora[p]!',
    b: '      if (ancora === Number.POSITIVE_INFINITY || idx.bAncora[p]! > ancora) ancora = idx.bAncora[p]!',
    t: TC, e: 'CONTRACT: ancora e cea mai mica celula',
  },
  {
    n: 'M15: ancora bucatii e ultima celula a randului ei, nu prima',
    f: C,
    a: '    idx.bAncora[id] = cheieCelula(x0 + (s % FELIE), y0 + ((s / FELIE) | 0), z)',
    b: '    idx.bAncora[id] = cheieCelula(x0 + (s % FELIE), y0 + ((s / FELIE) | 0), z) + (FELIE - 1)',
    t: TC, e: 'CONTRACT: ancora e cea mai mica celula',
  },
  {
    n: 'N06: cheile feliilor adaugate la coada, nesortate',
    f: C,
    a: '  if (inChei) idx.chei.splice(pozitie(idx.chei, cheie), 0, cheie)',
    b: '  if (inChei) idx.chei.push(cheie)',
    t: TC, e: 'CONTRACT: cheile feliilor sunt MEREU sortate',
  },
  {
    n: 'N07: celuleLaNivel ia si nivelul de deasupra',
    f: C,
    a: '  const hi = pozitie(idx.chei, cheieFelie(0, 0, z + 1))',
    b: '  const hi = pozitie(idx.chei, cheieFelie(0, 0, z + 2))',
    t: TC, e: 'CONTRACT: celuleLaNivel da exact',
  },
  {
    n: 'M09: varful coloanei ignora ultimul nivel al ferestrei (un acoperis acolo nu acopera)',
    f: C,
    a: '  for (let l = VOXEL_LEVELS - 1; l >= 0; l--) {\n    if (mat[l] !== Material.AER) {',
    b: '  for (let l = VOXEL_LEVELS - 2; l >= 0; l--) {\n    if (mat[l] !== Material.AER) {',
    t: TC, e: 'CONTRACT: un acoperis pe ultimul nivel',
  },
  {
    // Acelasi index (oracolul e verde), dar captura din afara — provenienta taieturii 2, un detector pe
    // identitatea feliei — vede celulele NOI in obiectul vechi (recenzia incaperilor, CTR-2).
    n: 'CTR-2: refaFelie refoloseste tabloul `cel` al feliei vechi (obiectul vechi se modifica pe loc)',
    f: C,
    a: '  const cel = new Int32Array(FELIE_CELULE).fill(-1)',
    b: '  const cel = veche ? veche.cel.fill(-1) : new Int32Array(FELIE_CELULE).fill(-1)',
    t: TC, e: 'CONTRACT: o sincronizare nu modifica obiectele Felie vechi',
  },
  {
    // Proba pe FIXTURA, nu pe cod: garda e chiar numaratoarea din test. Cu `comparatii > 50`, un iaz
    // mutat deasupra apei trecea — oracolul devenea o cutie uscata, oarba la DEF-2.
    n: 'CTR-4: cutia fuzz-ului de pe iaz ridicata deasupra apei (oracolul pe iaz devine vid, tacut)',
    f: T,
    a: "  const r = fuzz(w, { x0: x - 3, y0: y - 3, z0: g - 2, X: 7, Y: 7, Z: 6 }, 400, 17, 'iaz', true)",
    b: "  const r = fuzz(w, { x0: x - 3, y0: y - 3, z0: g + 3, X: 7, Y: 7, Z: 6 }, 400, 17, 'iaz', true)",
    t: T, e: 'ORACOL: pe un iaz',
  },
  // --- explicatia inspectorului (camere-explica.ts)
  {
    n: 'JUC-1: orice scurgere e LATERAL (gaura din acoperis devine „deschidere in perete")',
    f: E,
    a: "  if (acoperite < 2 && cer > 0) return { directie: 'LATERAL', gaura: L }",
    b: "  return { directie: 'LATERAL', gaura: L }",
    t: TE, e: 'explica (JUC-1): o gaura in acoperis iese SUS',
  },
  {
    n: 'putul (niciun vecin de cer) iese LATERAL, „gol in perete" la capatul coridorului',
    f: E,
    a: "  if (acoperite < 2 && cer > 0) return { directie: 'LATERAL', gaura: L }",
    b: "  if (acoperite < 2) return { directie: 'LATERAL', gaura: L }",
    t: TE, e: 'explica (JUC-2): pivnitele legate de un coridor',
  },
  {
    n: 'golul unei usi (un singur vecin acoperit) iese SUS, „gaura in acoperis"',
    f: E,
    a: "  if (acoperite < 2 && cer > 0) return { directie: 'LATERAL', gaura: L }",
    b: "  if (acoperite < 1 && cer > 0) return { directie: 'LATERAL', gaura: L }",
    t: TE, e: 'explica: golul unei usi spre o curte inchisa',
  },
  {
    n: 'gaura din acoperis raportata la cota podelei, nu a acoperisului',
    f: E,
    a: '    if (Number.isFinite(v) && v > h) h = v',
    b: '    void v',
    t: TE, e: 'explica (JUC-1): o gaura in acoperis iese SUS',
  },
  {
    n: 'orice gol pe drum e o usa, si fara ingustare (usa in mijlocul unei pivnite late de 2)',
    f: E,
    a: '        if (inainte !== null && latimeGol(inainte) <= latimeGol(g)) continue',
    b: '        void inainte',
    t: TE, e: 'explica: o pivnita lata de 2',
  },
  {
    n: 'promisiunea nu se verifica: „devine incapere" dupa prima usa, desi aerul iese si pe al doilea gol',
    f: E,
    a: '      if (dupa.inchisa) {',
    b: '      if (dupa.inchisa || pas >= 0) {',
    t: TE, e: 'explica: doua goluri',
  },
  {
    n: 'usile se numara pe celule (o usa de doua celule = 2 usi)',
    f: E,
    a: '  return grupuri',
    b: '  return usi.size',
    t: TE, e: 'explica: incaperea cu usa',
  },
]
