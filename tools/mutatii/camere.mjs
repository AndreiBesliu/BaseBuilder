/**
 * Mutatii: incaperile (src/sim/camere.ts) si punctele fixe in care simularea le tine la zi.
 * Oracolul (incremental == recalcul complet) prinde multe; fiecare proba numeste insa testul scris
 * pentru garantia ei — capcanele panoului pe v1 (fantoma dupa umplere, apa, colturile de chunk).
 */

const T = 'tests/camere.test.ts'
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
  // --- explicatia inspectorului (camere-explica.ts)
  {
    n: 'JUC-1: orice scurgere e LATERAL (gaura din acoperis devine „deschidere in perete")',
    f: E,
    a: "  if (!inchisa) return { directie: 'LATERAL', gaura: L }",
    b: "  return { directie: 'LATERAL', gaura: L }",
    t: TE, e: 'explica (JUC-1): o gaura in acoperis iese SUS',
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
