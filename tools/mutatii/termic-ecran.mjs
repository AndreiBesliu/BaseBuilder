/**
 * Mutatii: temperatura pe ecran — S24-27 t.2a, commit-ul 4 (design-temperatura-v2 §6; panoul, L5-1/L5-2/L5-3).
 * Inspectorul (memoria termica, cheia de redesenare, textele pe hartie), overlay-ul Temperatura (U): ancorele pe
 * piese, densitatea, tenta pe luminozitate, ritmul regimului; tasta U.
 *
 * Ce NU e aici: scrisul PE LOC in DOM, inaintea comparatiei cheii (panouri.ts), si stratul DOM al cifrelor
 * (etichete-temperatura.ts) — in node nu exista DOM. Le probeaza ui-fum („temperatura-fara-clic": butonul ramane
 * acelasi nod; „temperatura-etichete"), rulat si pe codul vechi (rosu) si cu temperatura pusa in cheie (rosu).
 */

const T = 'tests/viewer-termic.test.ts'
const M = 'viewer/ui/model.ts'
const X = 'viewer/ui/texte.ts'
const O = 'viewer/overlay-temperatura.ts'
const K = 'viewer/ui/taste.ts'

const E1 = 'TERMIC ECRAN inspectorul: N tickuri fara editari'
const E2 = 'TERMIC ECRAN inspectorul pe hartie: casa 5x5x2 cu usa'
const E3 = 'TERMIC ECRAN inspectorul: fata ADANC in sus'
const E4 = 'TERMIC ECRAN textele: zecimile si gradele'
const E5 = 'TERMIC ECRAN textele: descompunerea contopeste'
const E6 = 'TERMIC ECRAN memoria termica'
const E7 = 'TERMIC ECRAN ancorele pe hartie'
const E8 = 'TERMIC ECRAN ancorele pe M10'
const E10 = 'TERMIC ECRAN densitatea'
const E11 = 'TERMIC ECRAN tenta'
const E12 = 'TERMIC ECRAN overlay-ul U'
const E13 = 'TERMIC ECRAN tasta U'

export const MUTATII = [
  // --- L5-2: inspectorul — temperatura NU sta in memoria explicatiei si nu intra in cheia de redesenare
  {
    n: 'L5-2: memoria termica fara tick in cheie — temperatura ramane cea de la primul clic',
    f: M,
    a: '      if (k !== null && k.tick === w.tick && k.epoca === w.camere.epoca',
    b: '      if (k !== null && k.epoca === w.camere.epoca',
    t: T, e: E1,
  },
  {
    n: 'L5-2: temperatura intra in cheia de redesenare (InspectieCelula poarta tickul): butoanele s-ar recrea',
    f: M,
    a: '  return { wx, wy, z, material: mat.ok ? mat.value : null, materialDeasupra: sus.ok ? sus.value : null, desemnari, morman, zona }',
    b: '  return { wx, wy, z, material: mat.ok ? mat.value : null, materialDeasupra: sus.ok ? sus.value : null, desemnari, morman, zona, tick: w.tick }',
    t: T, e: E1,
  },
  {
    n: 'L5-2: temperatura la tickul 0, nu la tickul lumii',
    f: M,
    a: '  const o = canaleTermice(w, rules, c.id, w.tick)',
    b: '  const o = canaleTermice(w, rules, c.id, 0)',
    t: T, e: E2,
  },
  {
    n: 'memoria termica: fara memorie — un calcul la fiecare reimprospatare, si in pauza',
    f: M,
    a: '      const k = cheie\n',
    b: '      const k = null as typeof cheie\n',
    t: T, e: E6,
  },
  {
    n: 'memoria termica: componenta scoasa din cheie — alta incapere primeste raspunsul celei dinainte',
    f: M,
    a: ' && k.comp === c.id && ',
    b: ' && ',
    t: T, e: E6,
  },
  // --- textele inspectorului (pe hartie)
  {
    n: 'zecimile: trunchiate, nu rotunjite (0,25 °C → „0,2")',
    f: X,
    a: '  const z = Math.round((Math.abs(q16) * 10) / 65536)',
    b: '  const z = Math.floor((Math.abs(q16) * 10) / 65536)',
    t: T, e: E4,
  },
  {
    n: 'zecimile: „−0,0" (minusul si pe ce se rotunjeste la zero)',
    f: X,
    a: '  return q16 < 0 && z > 0 ? `−${s}` : s',
    b: '  return q16 < 0 ? `−${s}` : s',
    t: T, e: E4,
  },
  {
    n: 'gradele: rotunjite pe valoarea cu semn (−0,5 °C → „0", nesimetric)',
    f: X,
    a: '  const g = Math.round(Math.abs(q16) / 65536)\n  return q16 < 0 && g > 0 ? `−${g}` : `${g}`',
    b: '  const g = Math.round(q16 / 65536) + 0\n  return g < 0 ? `−${-g}` : `${g}`',
    t: T, e: E4,
  },
  {
    n: 'procentele: sub 0,5% scris „0%"',
    f: X,
    a: "  return p === 0 && q16 > 0 ? '<1%' : `${p}%`",
    b: '  return `${p}%`',
    t: T, e: E4,
  },
  {
    n: 'drumul: materialele in ordinea id-ului, nu a celulelor',
    f: X,
    a: '  parti.sort((a, b) => b[1] - a[1] || a[0] - b[0])',
    b: '  parti.sort((a, b) => a[0] - b[0])',
    t: T, e: E4,
  },
  {
    n: 'descompunerea: randurile cu aceeasi destinatie nu se contopesc (solul pe doua grupuri)',
    f: X,
    a: '    let gr = grupuri.find((x) => x.dest === r.destinatie)',
    b: '    let gr = grupuri.find((x) => x.dest === r.destinatie && x.rs[0]!.clasa === r.clasa)',
    t: T, e: E5,
  },
  {
    n: 'descompunerea: grupurile in ordinea primului rand, nu a ponderii lor',
    f: X,
    a: '  grupuri.sort((a, b) => b.pondere - a.pondere)\n',
    b: '',
    t: T, e: E5,
  },
  {
    n: 'descompunerea: temperatura grupului medie pe randuri, nu pe g',
    f: X,
    a: '  for (const r of rs) { g += r.gQ16; gt += r.gQ16 * r.tDestQ16 }',
    b: '  for (const r of rs) { g += 1; gt += r.tDestQ16 }',
    t: T, e: E5,
  },
  {
    n: 'descompunerea: drumul scris si pe usa („1 m ușă")',
    f: X,
    a: '  const prinZid = (dest === Destinatie.AFARA || dest === Destinatie.INCAPERI) && !r0.usa',
    b: '  const prinZid = dest === Destinatie.AFARA || dest === Destinatie.INCAPERI',
    t: T, e: E5,
  },
  {
    n: 'descompunerea: restul omis (randurile nu se mai aduna la 100%)',
    f: X,
    a: '  if (c.rest.pondereQ16 > 0) bucati.push(`rest ${textProcent(c.rest.pondereQ16)}`)\n',
    b: '',
    t: T, e: E2,
  },
  {
    n: 'recenzia ECRAN L4-1: descompunerea numeste iar golul (fata DESCHISA) „pereți"',
    f: X,
    a: "  if (deschis) return 'gol deschis'\n",
    b: '',
    t: T, e: 'TERMIC ECRAN inspectorul pe hartie: casa 5x5x2 cu golul usii',
  },
  {
    n: 'descompunerea: SUS e „tavan" si spre cer (nu „acoperiș")',
    f: X,
    a: "  return dest === Destinatie.AFARA ? 'acoperiș' : 'tavan'",
    b: "  return 'tavan'",
    t: T, e: E2,
  },
  {
    n: 'L5-1: fata ADANC in sus numita dupa destinatie („zid gros"), nu „peste 8 m de piatră"',
    f: X,
    a: "  const cap = adanc ? `peste ${r0.grosime} m de ${NUME_MATERIAL_DRUM[r0.material] ?? 'zid'}` : NUME_DESTINATIE_TEXT[dest]!",
    b: '  const cap = NUME_DESTINATIE_TEXT[dest]!',
    t: T, e: E3,
  },
  // --- L5-3: ancorele cifrelor
  {
    n: 'L5-3: ancora pe celula care contine centrul piesei (poate cadea in afara ei)',
    f: O,
    a: '    const a = ancoraPiesei(p.celule)\n',
    b: '    const a = { x: Math.floor(p.celule.reduce((s, k) => s + (k % WORLD_CELLS), 0) / p.celule.length + 0.5), y: Math.floor(p.celule.reduce((s, k) => s + Math.floor(k / WORLD_CELLS), 0) / p.celule.length + 0.5) }\n',
    t: T, e: E8,
  },
  {
    n: 'L5-3: o singura ancora pe componenta (cea mai apropiata de centrul ei), pusa pe toate piesele',
    f: O,
    a: '    const a = ancoraPiesei(p.celule)\n',
    b: '    const a = ancoraPiesei(piese.filter((q) => q.comp === p.comp).flatMap((q) => q.celule))\n',
    t: T, e: E7,
  },
  {
    n: 'L5-3: piesele 8-conexe (doua piese pe diagonala devin una)',
    f: O,
    a: '      const vecini = [x + 1 < WORLD_CELLS ? k + 1 : -1, x > 0 ? k - 1 : -1, k + WORLD_CELLS, k - WORLD_CELLS]',
    b: '      const vecini = [x + 1 < WORLD_CELLS ? k + 1 : -1, x > 0 ? k - 1 : -1, k + WORLD_CELLS, k - WORLD_CELLS, k + WORLD_CELLS + 1, k + WORLD_CELLS - 1, k - WORLD_CELLS + 1, k - WORLD_CELLS - 1]',
    t: T, e: E7,
  },
  {
    n: 'L5-3: pragul piesei de 2 celule (si piesele marunte primesc cifra)',
    f: O,
    a: 'export const PIESA_MIN_CELULE = 4',
    b: 'export const PIESA_MIN_CELULE = 2',
    t: T, e: E7,
  },
  {
    n: 'L5-3: piesa unica a componentei, sub prag, ramane fara cifra',
    f: O,
    a: '    if (p.celule.length < PIESA_MIN_CELULE && nr.get(p.comp)! > 1) continue',
    b: '    if (p.celule.length < PIESA_MIN_CELULE) continue',
    t: T, e: E7,
  },
  {
    n: 'L5-3: la egalitate, ultima celula (nu cheia cea mai mica): ancora depinde de ordinea parcurgerii',
    f: O,
    a: '    if (d < bd || (d === bd && k < best)) {',
    b: '    if (d <= bd) {',
    t: T, e: E7,
  },
  // --- densitatea
  {
    n: 'densitatea: pragul de 10 px pe celula ignorat (cifrele se calca de departe)',
    f: O,
    a: '.filter((i) => p[i]!.inCadru && p[i]!.pxCelula >= prag)',
    b: '.filter((i) => p[i]!.inCadru)',
    t: T, e: E10,
  },
  {
    n: 'densitatea: fara filtrul lacom (cifrele suprapuse raman toate)',
    f: O,
    a: '      if (Math.abs(a.x - b.x) * 2 < a.latime + b.latime && Math.abs(a.y - b.y) * 2 < a.inaltime + b.inaltime) {',
    b: '      if (false) {',
    t: T, e: E10,
  },
  {
    n: 'densitatea: la suprapunere castiga prima in lista, nu piesa mai mare',
    f: O,
    a: '.sort((a, b) => p[b]!.prioritate - p[a]!.prioritate || a - b)',
    b: '.sort((a, b) => a - b)',
    t: T, e: E10,
  },
  // --- tenta (DESIGN §9.9)
  {
    n: 'tenta: capetele inversate (cald = inchis)',
    f: O,
    a: '  return [0, 1, 2].map((i) => CULOARE_RECE[i]! + f * (CULOARE_CALDA[i]! - CULOARE_RECE[i]!)) as [number, number, number]',
    b: '  return [0, 1, 2].map((i) => CULOARE_CALDA[i]! + f * (CULOARE_RECE[i]! - CULOARE_CALDA[i]!)) as [number, number, number]',
    t: T, e: E11,
  },
  {
    n: 'tenta: fara intervalul minim (0,3 °C intre doua incaperi = tot intervalul)',
    f: O,
    a: '  if (max - min >= INTERVAL_MIN_Q16) return { lo: min, hi: max }',
    b: '  return { lo: min, hi: max }',
    t: T, e: E11,
  },
  // --- ritmul overlay-ului
  {
    n: 'overlay: regimul la fiecare cadru cu lume noua (fara secunda)',
    f: O,
    a: '(acumMs - o.regimLa >= PERIOADA_REGIM_MS && cheie !== o.regimCheie)',
    b: '(cheie !== o.regimCheie)',
    t: T, e: E12,
  },
  {
    n: 'overlay: regimul si in pauza (lumea neschimbata)',
    f: O,
    a: '(acumMs - o.regimLa >= PERIOADA_REGIM_MS && cheie !== o.regimCheie)',
    b: '(acumMs - o.regimLa >= PERIOADA_REGIM_MS)',
    t: T, e: E12,
  },
  {
    n: 'overlay: nivel nou fara regim imediat (cifrele vechi pana la secunda urmatoare)',
    f: O,
    a: '  if (nivelNou || o.regimCheie === \'\' || ',
    b: '  if (o.regimCheie === \'\' || ',
    t: T, e: E12,
  },
  {
    n: 'overlay: geometria refacuta la orice epoca noua (amprenta ignorata)',
    f: O,
    a: '    geometrie = o.amprenta === null || !aceeasiAmprenta(o.amprenta, amprenta)',
    b: '    geometrie = true',
    t: T, e: E12,
  },
  {
    n: 'overlay: geometria noua necolorata pana la regimul urmator',
    f: O,
    a: '  else if (geometrie) recoloreaza(o)\n',
    b: '',
    t: T, e: E12,
  },
  // --- tasta
  {
    n: 'tasta U lipsa',
    f: K,
    a: "    case 'u': return fa('overlayU')\n",
    b: '',
    t: T, e: E13,
  },
  {
    n: 'tasta U si pe o pagina de gate (printre tastele de azi)',
    f: K,
    a: "    case 'i': return fa('overlayI')\n",
    b: "    case 'i': return fa('overlayI')\n    case 'u': return fa('overlayU')\n",
    t: T, e: E13,
  },
]
