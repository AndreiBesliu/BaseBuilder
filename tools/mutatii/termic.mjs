/**
 * Mutatii: graful termic si regimul permanent (src/sim/termic.ts) si K-ul fetelor luat din content
 * (src/sim/world.ts, src/sim/save.ts) — S24-27 t.2a, commit-ul 3, design-temperatura-v2 §4.2, §5, §7.
 *
 * Oracolul grafului (graful folosit == graful unui index nou) e autoconsistent pentru tot ce calculeaza aceeasi
 * functie in ambele parti — conductanta, binurile, rotunjirea, canalele. Pe acelea le prind testele pe HARTIE
 * (g-urile din R-urile content-ului, calculate de mana). Pe stampila grafului o prind oracolul (pamant pe
 * acoperis) si contoarele (K05); pe exactitate, nodul sintetic de la jumatate si mina de 192x192x3; pe
 * calibrare, acceptanta pe un an.
 *
 * Recenzia t.2a (FETE, GRAF, ECRAN): ventilatia (fetele DESCHISA) o probeaza casa cu golul usii pe hartie si
 * invariantul fetelor deschise; convergenta, hotelul 10x10x4 (zeci de treceri, la ±3 Q16 de solutia in float);
 * memoriile (contributia pe bucata, regimul pe (graf, tick)), contoarele lor si oracolul pe o epoca noua.
 */

const T = 'tests/termic.test.ts'
const F = 'src/sim/termic.ts'

export const MUTATII = [
  // --- K din content
  {
    n: 'createWorld construieste indexul cu K-ul implicit, nu cu termic.kCelule din reguli',
    f: 'src/sim/world.ts',
    a: '    camere: indexCamere(terrain, rules.termic.kCelule, rules.termic.dSolMasivM),',
    b: '    camere: indexCamere(terrain, undefined, rules.termic.dSolMasivM),',
    t: T, e: 'TERMIC K: indexul unei lumi e construit cu termic.kCelule',
  },
  {
    n: 'decode construieste indexul cu K-ul implicit (lumea incarcata cu K 3 ar avea fetele lui 8)',
    f: 'src/sim/save.ts',
    a: '    camere: construiesteCamere(terrain, rules.termic.kCelule, rules.termic.dSolMasivM),',
    b: '    camere: construiesteCamere(terrain, undefined, rules.termic.dSolMasivM),',
    t: T, e: 'TERMIC K: indexul unei lumi e construit cu termic.kCelule',
  },
  // --- conductanta (§4.2), pe hartie: oracolul calculeaza la fel in ambele parti
  {
    n: 'L1-05: muchia ia R_si al capatului ei de doua ori (chepengul are alt g de jos decat de sus)',
    f: F,
    a: '  if (fel === FelFata.MUCHIE) r2 += 2 * rSi(t, opusa(clasa))',
    b: '  if (fel === FelFata.MUCHIE) r2 += 2 * rSi(t, clasa)',
    t: T, e: 'TERMIC conductanta pe hartie',
  },
  {
    n: 'L1-05: muchia cu formula exteriorului (R_si + R_se), nu R_si(d) + R_si(opus d)',
    f: F,
    a: '  if (fel === FelFata.MUCHIE) r2 += 2 * rSi(t, opusa(clasa))',
    b: '  if (fel === FelFata.MUCHIE) r2 += 2 * t.rSeMiimi',
    t: T, e: 'TERMIC conductanta pe hartie',
  },
  {
    n: 'fata SOL ia R-ul intreg al celulei de sol, nu R(s)/2',
    f: F,
    a: '      sol += c\n      r2 += c * r',
    b: '      sol += c\n      r2 += 2 * c * r',
    t: T, e: 'TERMIC conductanta pe hartie',
  },
  {
    n: 'fata EXT fara R_se',
    f: F,
    a: '  else if (fel === FelFata.EXT) r2 += 2 * t.rSeMiimi',
    b: '  else if (fel === FelFata.EXT) r2 += 0',
    t: T, e: 'TERMIC conductanta pe hartie',
  },
  {
    n: 'fata spre APA ia si R_se (ca aerul de afara)',
    f: F,
    a: '  else if (fel === FelFata.EXT) r2 += 2 * t.rSeMiimi',
    b: '  else if (fel === FelFata.EXT || fel === FelFata.APA) r2 += 2 * t.rSeMiimi',
    t: T, e: 'TERMIC conductanta pe hartie',
  },
  {
    n: 'fata DESCHISA: mW/K luati drept W/K (ventilatia de 1000 de ori mai mare)',
    f: F,
    a: '  if (fel === FelFata.DESCHISA) return Math.floor((t.gDeschisMilliWPeK * GRAD_Q16) / 1000)',
    b: '  if (fel === FelFata.DESCHISA) return Math.floor(t.gDeschisMilliWPeK * GRAD_Q16)',
    t: T, e: 'TERMIC conductanta pe hartie',
  },
  {
    n: 'un rand SOL cu doua celule de sol are conductanta (cache-ul stricat trece tacut)',
    f: F,
    a: '  else if (fel === FelFata.SOL && sol !== 1) return -1\n',
    b: '',
    t: T, e: 'TERMIC conductanta pe hartie',
  },
  {
    n: 'g rotunjit, nu floor(2^16·1000 / R)',
    f: F,
    a: '  return Math.floor(NUMARATOR_G_DUBLU / r2)',
    b: '  return Math.round(NUMARATOR_G_DUBLU / r2)',
    t: T, e: 'TERMIC conductanta pe hartie',
  },
  // --- binurile de rezervor
  {
    n: 'fata ADANC dusa la aerul de afara (donjonul: 8 m de piatra spre cer, nu spre solul de la capat)',
    f: F,
    a: '  return BIN_SOL + x.adancime // SOL, ADANC',
    b: '  return x.fel === FelFata.ADANC ? BIN_AFARA : BIN_SOL + x.adancime',
    t: T, e: 'TERMIC canale: donjonul',
  },
  {
    n: 'solul la adancimea 0 pentru orice fata (pivnita ia temperatura suprafetei, vara peste 5 °C)',
    f: F,
    a: '  return BIN_SOL + x.adancime // SOL, ADANC',
    b: '  return BIN_SOL // SOL, ADANC',
    t: T, e: 'TERMIC acceptanta: pivnita 3x3x2 sub o casa de piatra',
  },
  {
    n: 'fetele EXT duse la sol (casa nu mai simte valul de frig)',
    f: F,
    a: '  if (x.fel === FelFata.DESCHISA || x.fel === FelFata.EXT) return BIN_AFARA',
    b: '  if (x.fel === FelFata.DESCHISA || x.fel === FelFata.EXT) return BIN_SOL',
    t: T, e: 'TERMIC acceptanta: casa de piatra 5x5x2',
  },
  {
    n: 'apa in binul solului (tabloul canonic pierde apa)',
    f: F,
    a: '  if (x.fel === FelFata.APA) return BIN_APA + x.adancime',
    b: '  if (x.fel === FelFata.APA) return BIN_SOL + x.adancime',
    t: T, e: 'TERMIC regimul: apa e rezervor',
  },
  {
    n: 'apa la temperatura aerului de afara, nu a solului de la adancimea ei',
    f: F,
    a: '    out[BIN_APA + d] = v',
    b: '    out[BIN_APA + d] = out[BIN_AFARA]!',
    t: T, e: 'TERMIC regimul: apa e rezervor',
  },
  // --- invariantii grafului
  {
    n: 'L2-4: o muchie spre o celula care nu e aer acoperit se ignora tacut (bComp[-1])',
    f: F,
    a: "      if (vecina < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'celula de dincolo a unei muchii nu e aer acoperit al unei componente'",
    b: "      if (vecina < -1) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'celula de dincolo a unei muchii nu e aer acoperit al unei componente'",
    t: T, e: 'TERMIC invariantul muchiei',
  },
  {
    n: 'recenzia GRAF L3-4: muchia vazuta dintr-un singur capat nu se numara (cuplare fantoma din capatul MIC)',
    f: F,
    a: '  if (verificate !== muchieA.length) return refuse(',
    b: '  if (false) return refuse(',
    t: T, e: 'TERMIC muchia vazuta doar din capatul MIC',
  },
  {
    n: 'recenzia FETE L1-1: graful fara invariantul fetelor DESCHISE (ventilatia clasificata EXT trece tacut)',
    f: F,
    a: '    if (l.deschise !== comps[i]!.deschise) return refuse(',
    b: '    if (false) return refuse(',
    t: T, e: 'TERMIC invariantul fetelor DESCHISE',
  },
  {
    n: 'recenzia GRAF L3-6: nodDupaComp fara fill(-1) (un slot liber primeste temperatura nodului 0)',
    f: F,
    a: 'const nodDupaComp = new Int32Array(idx.cUrmator).fill(-1)',
    b: 'const nodDupaComp = new Int32Array(idx.cUrmator)',
    t: T, e: 'TERMIC slot liber',
  },
  // --- memoria contributiilor pe bucata (recenzia GRAF L3-2)
  {
    n: 'recenzia GRAF L3-2: memoria contributiilor dezactivata (fiecare refacere recalculeaza toate bucatile)',
    f: F,
    a: '  if (cb === undefined || cb.rr !== rr) {',
    b: '  if (true) {',
    t: T, e: 'TERMIC memoria contributiilor: pamant',
  },
  {
    n: 'recenzia GRAF L3-2: memoria contributiilor ignora identitatea randurilor (bucata cu randuri noi pastreaza contributia veche)',
    f: F,
    a: '  if (cb === undefined || cb.rr !== rr) {',
    b: '  if (cb === undefined) {',
    t: T, e: 'TERMIC memoria contributiilor: pamant',
  },
  {
    n: 'recenzia GRAF L3-2: memoria contributiilor tine peste o epoca noua (vecina renumerotata ramane cea veche)',
    f: F,
    a: '  if (e.epocaContributii !== idx.epoca || e.reguliContributii !== rules) {',
    b: '  if (e.reguliContributii !== rules) {',
    t: T, e: 'TERMIC memoria contributiilor tine cat epoca',
  },
  {
    n: 'recenzia GRAF L3-2: memoria contributiilor tine peste alte reguli (conductantele vechi raman)',
    f: F,
    a: '  if (e.epocaContributii !== idx.epoca || e.reguliContributii !== rules) {',
    b: '  if (e.epocaContributii !== idx.epoca) {',
    t: T, e: 'TERMIC K05: graful se reface doar',
  },
  {
    n: 'L1-05: simetria nu se verifica (o muchie cu alte sume in cele doua capete trece)',
    f: F,
    a: "      if (mic !== G) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'muchie asimetrica'",
    b: "      if (mic === undefined) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'muchie asimetrica'",
    t: T, e: 'TERMIC invariantul muchiei',
  },
  {
    n: 'L1-05: muchia scrisa din ambele capete (perechea apare de doua ori)',
    f: F,
    a: '      if (j > i) {\n        muchieA.push(i)',
    b: '      if (j !== i) {\n        muchieA.push(i)',
    t: T, e: 'TERMIC muchia o singura data',
  },
  {
    n: 'numitorul numara muchiile de doua ori (Σg al debaralei dublat fata de numarator)',
    f: F,
    a: '    for (let k = vecStart[i]!; k < vecStart[i + 1]!; k++) s += vecG[k]!',
    b: '    for (let k = vecStart[i]!; k < vecStart[i + 1]!; k++) s += 2 * vecG[k]!',
    t: T, e: 'TERMIC lema: debaraua MUCHIE 24/24',
  },
  {
    n: 'L1-03: garda numitorului lipseste (o incapere fara nicio fata conductiva ar da 0/0)',
    f: F,
    a: "    if (!(s > 0)) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'numitorul regimului e 0",
    b: "    if (s < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'numitorul regimului e 0",
    t: T, e: 'TERMIC lema e o garda',
  },
  // --- stampila grafului (§5, L2-1/L4-1) si K05
  {
    n: 'L2-1: graful cheiat doar pe epoca (pamantul pe acoperis nu-l reface)',
    f: F,
    a: '  if (g !== null && g.epoca === idx.epoca && g.epocaFete === idx.epocaFete && g.reguli === rules) {',
    b: '  if (g !== null && g.epoca === idx.epoca && g.reguli === rules) {',
    t: T, e: 'TERMIC oracol: pamant pe acoperisul unei case',
  },
  {
    n: 'graful nu se reface la alte reguli (conductantele vechi raman)',
    f: F,
    a: '  if (g !== null && g.epoca === idx.epoca && g.epocaFete === idx.epocaFete && g.reguli === rules) {',
    b: '  if (g !== null && g.epoca === idx.epoca && g.epocaFete === idx.epocaFete) {',
    t: T, e: 'TERMIC K05: graful se reface doar',
  },
  {
    n: 'K05: graful se reface la fiecare cerere',
    f: F,
    a: '  if (g !== null && g.epoca === idx.epoca && g.epocaFete === idx.epocaFete && g.reguli === rules) {',
    b: '  if (g !== null && g.epoca === idx.epoca && g.epocaFete === idx.epocaFete && g.reguli === rules && false) {',
    t: T, e: 'TERMIC K05: graful se reface doar',
  },
  // --- Gauss–Seidel: rotunjirea, convergenta, 2^53
  {
    n: 'rotunjirea pe Number: jumatatea spre zero',
    f: F,
    a: '  if (2 * r >= den) q++',
    b: '  if (2 * r > den) q++',
    t: T, e: 'TERMIC rotunjirea e simetrica',
  },
  {
    n: 'rotunjirea pe Number nesimetrica: jumatatea spre +∞ (−0,5 → 0)',
    f: F,
    a: '  if (2 * r >= den) q++',
    b: '  if (num < 0 ? 2 * r > den : 2 * r >= den) q++',
    t: T, e: 'TERMIC rotunjirea e simetrica',
  },
  {
    n: 'rotunjirea pe BigInt: jumatatea spre zero',
    f: F,
    a: '  if (2n * (a - q * den) >= den) q++',
    b: '  if (2n * (a - q * den) > den) q++',
    t: T, e: 'TERMIC rotunjirea e simetrica',
  },
  {
    n: 'Gauss–Seidel se opreste dupa o trecere (debaraua nu e la punctul fix)',
    f: F,
    a: '  while (schimbari > 0 && treceri < plafon) {',
    b: '  while (schimbari > 0 && treceri < 1) {',
    t: T, e: 'TERMIC lema: debaraua MUCHIE 24/24',
  },
  {
    n: 'recenzia GRAF L3-3: plafonul Gauss–Seidel la 10 treceri',
    f: F,
    a: 'export const PLAFON_TRECERI = 1000',
    b: 'export const PLAFON_TRECERI = 10',
    t: T, e: 'TERMIC convergenta: hotelul 10x10x4',
  },
  {
    n: 'recenzia GRAF L3-3: plafonul Gauss–Seidel la 20 de treceri',
    f: F,
    a: 'export const PLAFON_TRECERI = 1000',
    b: 'export const PLAFON_TRECERI = 20',
    t: T, e: 'TERMIC convergenta: hotelul 10x10x4',
  },
  {
    n: 'recenzia GRAF L3-3: regimul neconvergent iese cu cifre (fara refuz la plafon)',
    f: F,
    a: '  if (!s.convergent) o = refuse(',
    b: '  if (false) o = refuse(',
    t: T, e: 'TERMIC convergenta: hotelul 10x10x4',
  },
  // --- un regim pe (graf, tick) (recenzia GRAF L3-2)
  {
    n: 'recenzia GRAF L3-2: regimul nu se memoreaza (inspectorul reface Gauss–Seidel pe toata lumea pentru o camera)',
    f: F,
    a: '  if (m !== null && m.graf === g && m.seed === w.seed',
    b: '  if (false && m !== null && m.graf === g && m.seed === w.seed',
    t: T, e: 'TERMIC un regim pe (graf, tick)',
  },
  {
    n: 'recenzia GRAF L3-2: memoria regimului fara graful in cheie (dupa o editare, regimul vechi)',
    f: F,
    a: 'm !== null && m.graf === g && ',
    b: 'm !== null && ',
    t: T, e: 'TERMIC un regim pe (graf, tick)',
  },
  {
    n: 'recenzia GRAF L3-2: memoria regimului fara tick in cheie (alt tick, aceleasi temperaturi)',
    f: F,
    a: ' && m.tick === tick && ',
    b: ' && ',
    t: T, e: 'TERMIC un regim pe (graf, tick)',
  },
  {
    n: 'recenzia GRAF L3-3: memoria regimului fara plafon in cheie (un refuz la plafon mic ramane si la cel obisnuit)',
    f: F,
    a: ' && m.plafon === plafon) {',
    b: ') {',
    t: T, e: 'TERMIC convergenta: hotelul 10x10x4',
  },
  {
    n: '2^53: rezolvarea ignora marcajul nodului mare (Σ g·T pe Number, rotunjita in sus)',
    f: F,
    a: '    big[i] = totulPeBigInt || g.mare[i] === 1 ? 1 : 0',
    b: '    big[i] = totulPeBigInt ? 1 : 0',
    t: T, e: 'TERMIC 2^53: un nod cu',
  },
  {
    n: '2^53: marginea pe nod nu se calculeaza (niciun nod pe BigInt, nici mina)',
    f: F,
    a: '    mare[i] = s * margineT >= MARGINE_NUMBER ? 1 : 0',
    b: '    mare[i] = 0',
    t: T, e: 'TERMIC 2^53: mina de 192x192x3',
  },
  {
    n: '2^53: marginea temperaturilor uita valul de frig',
    f: F,
    a: ' + abs(c.valFrig.amplitudineMc) + abs(c.deltaAdancMc)) + GRAD_Q16',
    b: ' + abs(c.deltaAdancMc)) + GRAD_Q16',
    t: T, e: 'TERMIC 2^53: marginea temperaturilor',
  },
  {
    n: 'recenzia GRAF L3-5: marginea temperaturilor uita ΔT_adanc (solul adanc iese din margine)',
    f: F,
    a: ' + abs(c.deltaAdancMc)) + GRAD_Q16',
    b: ') + GRAD_Q16',
    t: T, e: 'TERMIC 2^53: fiecare termen al marginii',
  },
  {
    n: 'recenzia GRAF L3-5: marginea temperaturilor uita amplitudinea zilei',
    f: F,
    a: ' + abs(c.amplitudineZiMc)',
    b: '',
    t: T, e: 'TERMIC 2^53: fiecare termen al marginii',
  },
  // --- canalele (§5, §6)
  {
    n: 'canale: usa nu e in cheia grupului (usa se contopeste cu peretii)',
    f: F,
    a: '    const k = ((x.clasa * 8 + dest) * 2 + (usa ? 1 : 0)) * 2 + (deschis ? 1 : 0)',
    b: '    const k = ((x.clasa * 8 + dest) * 2) * 2 + (deschis ? 1 : 0)',
    t: T, e: 'TERMIC canale pe hartie: casa 5x5x2 cu usa',
  },
  {
    n: 'canale: incaperile vecine NU se contopesc (un rand pe vecina)',
    f: F,
    a: '    const k = ((x.clasa * 8 + dest) * 2 + (usa ? 1 : 0)) * 2 + (deschis ? 1 : 0)',
    b: '    const k = ((x.clasa * 8 + dest) * 2 + (usa ? 1 : 0)) * 2 + (deschis ? 1 : 0) + (x.vecina + 1) * 128',
    t: T, e: 'TERMIC canale: o galerie intre alte doua',
  },
  {
    n: 'recenzia ECRAN L4-1: golul (DESCHISA) nu e in cheia grupului (se contopeste cu peretii si se numeste „pereți")',
    f: F,
    a: '    const k = ((x.clasa * 8 + dest) * 2 + (usa ? 1 : 0)) * 2 + (deschis ? 1 : 0)',
    b: '    const k = ((x.clasa * 8 + dest) * 2 + (usa ? 1 : 0)) * 2',
    t: 'tests/viewer-termic.test.ts', e: 'TERMIC ECRAN inspectorul pe hartie: casa 5x5x2 cu golul usii',
  },
  {
    n: 'recenzia FETE L1-1: canalele duc fata DESCHISA pe ramura SOL (golul usii apare „sol" in inspector)',
    f: F,
    a: '    } else if (x.fel === FelFata.DESCHISA || x.fel === FelFata.EXT) {',
    b: '    } else if (x.fel === FelFata.EXT) {',
    t: T, e: 'TERMIC pe hartie: casa 5x5x2 cu golul usii NEINCHIS',
  },
  {
    n: 'recenzia GRAF L3-1: o fata cu g 0 intra intr-un grup (gDeschis 0: temperatura destinatiei imparte la 0n)',
    f: F,
    a: '    if (G === 0) continue\n',
    b: '',
    t: T, e: 'TERMIC canale: un sopron',
  },
  {
    n: 'canale: ordinea dupa cheia grupului, nu dupa pondere',
    f: F,
    a: '  const lista = [...grupuri.entries()].sort((a, b) => b[1].g - a[1].g || a[0] - b[0]).map((e) => e[1])',
    b: '  const lista = [...grupuri.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1])',
    t: T, e: 'TERMIC canale pe hartie: pivnita 5x5x2 sub IARBA',
  },
  {
    n: 'canale: patru randuri in loc de trei',
    f: F,
    a: 'const RANDURI_CANALE = 3',
    b: 'const RANDURI_CANALE = 4',
    t: T, e: 'TERMIC canale pe hartie: casa 5x5x2 cu usa',
  },
  {
    n: 'canale: restul nu se numara (ponderile nu se mai aduna la 100%)',
    f: F,
    a: '    rest: { pondereQ16: PONDERE_TOTALA - prec,',
    b: '    rest: { pondereQ16: 0,',
    t: T, e: 'TERMIC canale pe hartie: casa 5x5x2 cu usa',
  },
  {
    n: 'canale: fata ADANC in sus numita „sol"',
    f: F,
    a: '      dest = x.fel === FelFata.ADANC ? Destinatie.ADANC : Destinatie.SOL',
    b: '      dest = Destinatie.SOL',
    t: T, e: 'TERMIC canale: donjonul',
  },
  {
    n: 'canale: temperatura incaperilor vecine luata de afara, nu din echilibrul lor',
    f: F,
    a: '      tD = r.t[j]!',
    b: '      tD = r.tRez[BIN_AFARA]!',
    t: T, e: 'TERMIC canale: o galerie intre alte doua',
  },
]
