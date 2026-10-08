/**
 * Mutatii: temperatura ca stare — S24-27 t.2b, valul 1 (research/temperatura-t2b.md).
 *
 * Commit-ul 1, capacitatea (§4): masele pe clasa derivate la parsare (src/sim/content.ts), clasa de masa a unei
 * fete si contoarele pe bucata (src/sim/fete.ts), dSolMasivM luat din content (world.ts, save.ts), calibrarea
 * (τ pe scenele numite, valul de frig pe benzi). Contoarele ținute la zi le prinde oracolul fetelor (forma
 * canonica le poarta); clasificarea, fiind aceeasi in ambele parti ale oracolului, o prind testele pe HARTIE si
 * numaratoarea independenta (materialAt + groundLevelM + bazaVoxeli).
 */

const TC = 'tests/capacitate.test.ts'
const TCT = 'tests/content.test.ts'
const F = 'src/sim/fete.ts'
const K = 'src/sim/content.ts'

export const MUTATII = [
  // --- content (§1, §4)
  {
    n: 't.2b §1: masele pe clasa rotunjite in jos, nu la cel mai apropiat (3.966 μ in loc de 3.967 pentru sol)',
    f: K,
    a: '  return Math.floor((2 * MASA_AER_MU * c + cAer) / (2 * cAer))',
    b: '  return Math.floor((2 * MASA_AER_MU * c) / (2 * cAer))',
    t: TC, e: 'CAPACITATE content: masele pe clasa sunt intregi DERIVATI',
  },
  {
    n: 't.2b §4: masa solului derivata din cConstr (pivnitele pierd inertia: τ sub o zi)',
    f: K,
    a: '  return { aer: MASA_AER_MU, constr: masaInMu(cConstrJPeK, cAerJPeK), sol: masaInMu(cSolJPeK, cAerJPeK) }',
    b: '  return { aer: MASA_AER_MU, constr: masaInMu(cConstrJPeK, cAerJPeK), sol: masaInMu(cConstrJPeK, cAerJPeK) }',
    t: TC, e: 'CALIBRARE τ: pivnitele',
  },
  {
    n: 't.2b §4: masa constructiei 0 (casa ramane doar cu aerul: τ sub o ora)',
    f: K,
    a: '  return { aer: MASA_AER_MU, constr: masaInMu(cConstrJPeK, cAerJPeK), sol: masaInMu(cSolJPeK, cAerJPeK) }',
    b: '  return { aer: MASA_AER_MU, constr: masaInMu(0, cAerJPeK), sol: masaInMu(cSolJPeK, cAerJPeK) }',
    t: TC, e: 'CALIBRARE τ: casa de piatra 5x5x2 cu usa',
  },
  {
    n: 't.2b §4: masele scrise in fisier sunt crezute (nu se compara cu cele derivate)',
    f: K,
    a: '  if (scrise !== undefined) {',
    b: '  if (scrise === null) {',
    t: TCT, e: 'termic t.2b: cConstrJPeK, cSolJPeK, dSolMasivM si omW',
  },
  {
    n: 't.2b §4: plaja lui dSolMasivM trece de capatul tabelelor pe adancime (65 acceptat)',
    f: K,
    a: '  dSolMasivM: { min: 0, max: 64 },',
    b: '  dSolMasivM: { min: 0, max: 65 },',
    t: TCT, e: 'termic t.2b: cConstrJPeK, cSolJPeK, dSolMasivM si omW',
  },
  // --- clasa de masa a fetei si contoarele (§4)
  {
    n: 't.2b §4: solul masiv incepe sub dSolMasivM, nu de la el (peretii pivnitei la d 1 au masa constructiei)',
    f: F,
    a: '  if (eSolNatural(m)) return d >= dSolMasiv ? ClasaMasei.SOL_MASIV : ClasaMasei.SOL_SUPRAFATA',
    b: '  if (eSolNatural(m)) return d > dSolMasiv ? ClasaMasei.SOL_MASIV : ClasaMasei.SOL_SUPRAFATA',
    t: TC, e: 'CAPACITATE pe hartie: pivnita 5x5x2 sub IARBA',
  },
  {
    n: 't.2b §4: stratul de suprafata (d 0) are masa solului masiv (casa de pamant zidit cantareste altfel decat cea de piatra)',
    f: F,
    a: '  if (eSolNatural(m)) return d >= dSolMasiv ? ClasaMasei.SOL_MASIV : ClasaMasei.SOL_SUPRAFATA',
    b: '  if (eSolNatural(m)) return d >= dSolMasiv || d === 0 ? ClasaMasei.SOL_MASIV : ClasaMasei.SOL_SUPRAFATA',
    t: TC, e: 'CALIBRARE casa din pamant zidit',
  },
  {
    n: 't.2b §4: apa numarata ca sol masiv (nApa ramane 0 sub iaz)',
    f: F,
    a: '  if (m === Material.APA) return ClasaMasei.APA',
    b: '  if (m === Material.APA) return ClasaMasei.SOL_MASIV',
    t: TC, e: 'CAPACITATE pe hartie: pivnita 3x3x2 sapata direct sub apa',
  },
  {
    n: 't.2b §4: aerul celulei nu intra in capacitate',
    f: F,
    a: '  acc.nAer++\n  for (let d = 0; d < 6; d++) adunaClasa(acc, clasaFetei(',
    b: '  for (let d = 0; d < 6; d++) adunaClasa(acc, clasaFetei(',
    t: TC, e: 'CAPACITATE pe hartie: casa de piatra 5x5x2 cu usa',
  },
  {
    n: 't.2b §4: fetele de sus si de jos nu intra in capacitate (casa pierde acoperisul si podeaua: valul o duce sub banda)',
    f: F,
    a: '  for (let d = 0; d < 6; d++) adunaClasa(acc, clasaFetei(',
    b: '  for (let d = 0; d < 4; d++) adunaClasa(acc, clasaFetei(',
    t: TC, e: 'VALUL DE FRIG pe benzi',
  },
  {
    n: 't.2b §4: sub baza ferestrei e aer pentru masa (convenția lui materialAt): podeaua camerei de la baza n-are masa',
    f: F,
    a: '  let m = materialIn(col, nz)\n',
    b: '  let m = nz < col.base && !col.afara ? Material.AER : materialIn(col, nz)\n',
    t: TC, e: 'CAPACITATE pe hartie: convenția camerelor',
  },
  {
    n: 't.2b §4, IDX-1: contoarele se scriu doar pe felia refacuta intreaga (bucatile marcate de D+ raman cu 0)',
    f: F,
    a: '    capacitateCelulei(r, x, y, z, c.dSolMasiv, null, cap.get(b)!)',
    b: '    if (doar === null) capacitateCelulei(r, x, y, z, c.dSolMasiv, null, cap.get(b)!)',
    t: TC, e: 'CAPACITATE oracol: contoarele tinute la zi == recalculul',
  },
  {
    n: 't.2b §4, IDX-1: forma canonica a fetelor fara contoare (oracolul existent e orb la ele)',
    f: F,
    a: '`${idx.bAncora[b]}|a${e.nAer} c${e.nConstr} s${e.nSolMasiv} w${e.nApa}|${',
    b: '`${idx.bAncora[b]}|${',
    t: TC, e: 'CAPACITATE pe hartie: pivnita 5x5x2 sub IARBA',
  },
  // --- dSolMasivM in index, ca K (§4, SAV-6)
  {
    n: 't.2b §4: createWorld construieste indexul cu dSolMasivM implicit, nu cu cel din reguli',
    f: 'src/sim/world.ts',
    a: '    camere: indexCamere(terrain, rules.termic.kCelule, rules.termic.dSolMasivM),',
    b: '    camere: indexCamere(terrain, rules.termic.kCelule),',
    t: TC, e: 'CAPACITATE dSolMasivM vine din content',
  },
  {
    n: 't.2b §4: decode construieste indexul cu dSolMasivM implicit (lumea incarcata cantareste altfel)',
    f: 'src/sim/save.ts',
    a: '    camere: construiesteCamere(terrain, rules.termic.kCelule, rules.termic.dSolMasivM),',
    b: '    camere: construiesteCamere(terrain, rules.termic.kCelule),',
    t: TC, e: 'CAPACITATE dSolMasivM vine din content',
  },
]
