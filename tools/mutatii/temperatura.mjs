/**
 * Mutatii: temperatura ca stare — S24-27 t.2b, valul 1 (research/temperatura-t2b.md).
 *
 * Commit-ul 1, capacitatea (§4): masele pe clasa derivate la parsare (src/sim/content.ts), clasa de masa a unei
 * fete si contoarele pe bucata (src/sim/fete.ts), dSolMasivM luat din content (world.ts, save.ts), calibrarea
 * (τ pe scenele numite, valul de frig pe benzi). Contoarele ținute la zi le prinde oracolul fetelor (forma
 * canonica le poarta). Clasificarea (aceeasi in ambele parti ale oracolului fetelor) o prinde TABELUL pe hartie al
 * clasei, exhaustiv pe 0..MATERIAL_MAX (tests/capacitate.test.ts), iar in context fuzzul de suprafata al provenientei,
 * care umple cu toate materialele construibile. Oracolele nu impart `eSolNatural` cu productia: numaratoarea
 * independenta (materialAt + groundLevelM + bazaVoxeli) si oracolul provenientei isi scriu lista solului natural.
 * Pana la recenzia PROV-2 antetul spunea ca „testele pe hartie si numaratoarea independenta" prind clasificarea:
 * era fals pentru GRINDA, LEMN, MOLOZ si pentru `eSolNatural` insusi (mutantii treceau 1056/1056).
 *
 * Commit-ul 2, proveninta (§3): jurnalul cu materialul vechi (terrain.ts), evidenta C3 a maselor pe lot
 * (fete.ts, camere.ts) si aritmetica (temperatura.ts). Le prinde oracolul pe forta bruta din
 * tests/provenienta.test.ts (evidenta exacta, T, energia), poarta pompei si scenele de rezerva si de recalcul.
 *
 * Poarta pompei probeaza doar ciclurile de UN fel (sapat + astupat): acolo C3 n-are pompa. Ciclurile INCRUCISATE
 * (zidit → sapat → scos → astupat, sau doar piatra pusa si scoasa pe comenzi) POMPEAZA — regula, nu codul (recenzia
 * PROV-1). C3 s-a pastrat (decizia lead-ului, 10.10); testele „POMPA C3" fixeaza cifrele masurate ca verdict, iar
 * probele lor (C4 pe jumatate, regula B cu timpul pornit) arata ca o alta regula le inroseste.
 */

const TC = 'tests/capacitate.test.ts'
const TCT = 'tests/content.test.ts'
const F = 'src/sim/fete.ts'
const K = 'src/sim/content.ts'
const TP = 'tests/provenienta.test.ts'

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
  // PROV-2: clasa fiecarui material construibil sau ramas din joc (GRINDA e piesa de azi, MOLOZ vine din prabusire).
  {
    n: 't.2b §4, PROV-2: GRINDA clasificata sol de suprafata (aceeasi masa, dar intra si iese la T_sol)',
    f: F,
    a: '  return ClasaMasei.CONSTR',
    b: '  return m === Material.GRINDA ? ClasaMasei.SOL_SUPRAFATA : ClasaMasei.CONSTR',
    t: TC, e: 'CAPACITATE pe hartie: clasa de masa a fiecarui material',
  },
  {
    n: 't.2b §4, PROV-2: LEMN clasificat sol de suprafata (aceeasi masa, rutarea C3 la T_sol)',
    f: F,
    a: '  return ClasaMasei.CONSTR',
    b: '  return m === Material.LEMN_CONSTRUIT ? ClasaMasei.SOL_SUPRAFATA : ClasaMasei.CONSTR',
    t: TP, e: 'PROVENIENTA oracol: fuzzul de SUPRAFATA',
  },
  {
    n: 't.2b §4, PROV-2: MOLOZ clasificat sol masiv (masa ×16,7, intrarea la T_sol)',
    f: F,
    a: '  return ClasaMasei.CONSTR',
    b: '  return m === Material.MOLOZ ? ClasaMasei.SOL_MASIV : ClasaMasei.CONSTR',
    t: TP, e: 'PROVENIENTA oracol: fuzzul de SUPRAFATA',
  },
  {
    n: 't.2b §4, PROV-2: eSolNatural extins cu MOLOZ (oracolele care o imparteau cu productia erau oarbe)',
    f: 'src/sim/terrain/chunk.ts',
    a: '  return m === Material.ROCA || m === Material.PAMANT || m === Material.IARBA',
    b: '  return m === Material.ROCA || m === Material.PAMANT || m === Material.IARBA || m === Material.MOLOZ',
    t: TP, e: 'PROVENIENTA oracol: fuzzul de SUPRAFATA',
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
    a: '  const camere = indexCamere(terrain, rules.termic.kCelule, rules.termic.dSolMasivM)',
    b: '  const camere = indexCamere(terrain, rules.termic.kCelule)',
    t: TC, e: 'CAPACITATE dSolMasivM vine din content',
  },
  {
    n: 't.2b §4: decode construieste indexul cu dSolMasivM implicit (lumea incarcata cantareste altfel)',
    f: 'src/sim/temperatura.ts',
    a: '  const camere = construiesteCamere(terrain, rules.termic.kCelule, rules.termic.dSolMasivM)',
    b: '  const camere = construiesteCamere(terrain, rules.termic.kCelule)',
    t: TC, e: 'CAPACITATE dSolMasivM vine din content',
  },
  // --- commit-ul 2: jurnalul cu materialul vechi si proveninta C3 (§3)
  {
    n: 't.2b §3: jurnalul nu tine materialul vechi (fetele vechi ale celulelor editate se evalueaza pe aer)',
    f: 'src/sim/terrain/terrain.ts',
    a: '  t.jurnalMat[t.editari % JURNAL_CAP] = current.value\n',
    b: '',
    t: TP, e: 'JURNAL: materialul VECHI al fiecarei editari',
  },
  {
    n: 't.2b §3: materialul vechi din ULTIMA aparitie a celulei in lot (zidita si sapata la loc pare un zid care dispare)',
    f: 'src/sim/camere.ts',
    a: '    if (!matVechi.has(kc)) matVechi.set(kc, t.jurnalMat[i % JURNAL_CAP]!)',
    b: '    matVechi.set(kc, t.jurnalMat[i % JURNAL_CAP]!)',
    t: TP, e: 'JURNAL: materialul VECHI al fiecarei editari',
  },
  {
    n: 't.2b §3, IDX-2: iesirea devreme nu face evidenta (fill pe apa de sub podea: C\' se schimba, T nu stie)',
    f: 'src/sim/camere.ts',
    a: '    const ev = evidentaMaselor(idx, r, lot, matVechi, capturaGoala(), rf, [])',
    b: '    const ev = { mase: { noi: [], vechi: [], abateri: 0 }, prov: new Map(), feteSchimbate: [] }',
    t: TP, e: 'PROVENIENTA oracol: pe un lot DOAR-FETE',
  },
  {
    n: 't.2b §3: componentele cu fete marcate de D+ nu intra in evidenta (feteSchimbate fara mase)',
    f: F,
    a: '    A.add(c)\n    feteSchimbate.push(c)',
    b: '    feteSchimbate.push(c)',
    t: TP, e: 'PROVENIENTA oracol: pe un lot DOAR-FETE',
  },
  {
    n: 't.2b §3, IDX-3: ponderile bucatilor supravietuitoare citite pe inregistrarea de DINAINTE de actualizeazaFete',
    f: F,
    a: '      const e = idx.fete.inreg[b]\n      if (e === undefined) {\n        L.abateri++\n        continue\n      }\n      tot.nAer += e.nAer',
    b: '      const e = (mk[b]! & 2) !== 0 ? rf.inregVechi.get(b) : idx.fete.inreg[b]\n      if (e === undefined) {\n        L.abateri++\n        continue\n      }\n      tot.nAer += e.nAer',
    t: TP, e: 'PROVENIENTA oracol: pe un lot DOAR-FETE',
  },
  {
    n: 't.2b §3, PROV-3: C\' memorat ignorat (lotul doar-fete aduna iar toata componenta: O(componenta))',
    f: F,
    a: '      const v0 = CAP_COMPONENTA.get(comp)',
    b: '      const v0 = undefined',
    t: TP, e: 'PROVENIENTA K05 al evidentei',
  },
  {
    n: 't.2b §3, PROV-3: memoria lui C\' fara diferenta apei pe sloturile rescrise (C\' ramane cel vechi)',
    f: F,
    a: '          tot.nApa += en.nApa - ev.nApa',
    b: '          tot.nApa += 0',
    t: TP, e: 'PROVENIENTA oracol: pe un lot DOAR-FETE',
  },
  {
    n: 't.2b §3, B2: adancime+1 pe solul care intra (T_sol al celulei de sub fata)',
    f: F,
    a: '      if (eClasaDeSol(kn)) adunaClasa(vec2(L.solIn, yn, FATA_NOUA[d]! >> 3), kn, 1)',
    b: '      if (eClasaDeSol(kn)) adunaClasa(vec2(L.solIn, yn, (FATA_NOUA[d]! >> 3) + 1), kn, 1)',
    t: TP, e: 'PROVENIENTA oracol: casa peste pivnita',
  },
  {
    n: 't.2b §3, B2: SOL↔CER la originea aerului (casa acoperita porneste de la T_sol, scobitura de la T_afara)',
    f: F,
    a: '  if (v === undefined || v === Material.AER) return PROV_CER\n  return PROV_SOL0 - adancimeIn(coloana(r, x, y), z)',
    b: '  if (v === undefined || v === Material.AER) return PROV_SOL0 - adancimeIn(coloana(r, x, y), z)\n  return PROV_CER',
    t: TP, e: 'PROVENIENTA rezerva',
  },
  {
    n: 't.2b §3, verif-JOC-2: ponderile v1 — constructia noua pe o celula veche intra in ponderi la T-ul vechi (pompa cu PODEA)',
    f: F,
    a: '      else adunaClasa(vec(L.apare, yn), kn, 1)',
    b: '      else adunaClasa(sv >= 0 ? vec2(L.P, yn, sv) : vec(L.apare, yn), kn, 1)',
    t: TP, e: 'POARTA POMPEI',
  },
  {
    n: 't.2b §3, JOC-2: regula B — solul iese la T-ul incaperii, nu la T_sol (sapat + astupat pompeaza)',
    f: 'src/sim/temperatura.ts',
    a: '  const ramas = capacitateMu(s.persista, rules.termic.mase) + masaSolului(s.solIese, rules)',
    b: '  const ramas = capacitateMu(s.persista, rules.termic.mase)',
    e2: [{ f: 'src/sim/temperatura.ts', a: '  return adun(peRamas, neg(energiaSolului(s.solIese, tick, rules, c)), c)', b: '  return peRamas' }],
    t: TP, e: 'POARTA POMPEI',
  },
  // PROV-1 (decizia lead-ului: C3 se pastreaza): verdictele pompei incrucisate, pe acelasi tick si cu timpul pornit.
  {
    n: 't.2b §3, PROV-1: C4 pe jumatate — masa aparuta intra la T_afara, nu la T-ul rezultat (verdictul se schimba)',
    f: 'src/sim/temperatura.ts',
    a: '  if (W > 0) return descompune(W === Cy ? h : rs(inm(h, Cy, c), W, c), Cy)',
    b: '  if (W > 0) return descompune(adun(h, inm(capacitateMu(y.aparuta, mase), tAfara(seed, tick, rules), c), c), Cy)',
    t: TP, e: 'POMPA C3 — verdictul pe acelasi tick',
  },
  {
    n: 't.2b §3, PROV-1: regula B cu timpul pornit — solul iese la T-ul incaperii (verdictul limitei se schimba)',
    f: 'src/sim/temperatura.ts',
    a: '  const ramas = capacitateMu(s.persista, rules.termic.mase) + masaSolului(s.solIese, rules)',
    b: '  const ramas = capacitateMu(s.persista, rules.termic.mase)',
    e2: [{ f: 'src/sim/temperatura.ts', a: '  return adun(peRamas, neg(energiaSolului(s.solIese, tick, rules, c)), c)', b: '  return peRamas' }],
    t: TP, e: 'POMPA C3 cu timpul pornit',
  },
  {
    n: 't.2b §3, IDX-7: peLoc pastreaza T (id pastrat luat drept „aceeasi incapere")',
    f: 'src/sim/temperatura.ts',
    a: '  for (const y of sch.mase.noi) {\n    const c: Calcul = { big: totulPeBigInt, promovat: false }',
    b: '  for (const y of sch.mase.noi) {\n    if (sch.peLoc.includes(y.id)) continue\n    const c: Calcul = { big: totulPeBigInt, promovat: false }',
    t: TP, e: 'PROVENIENTA oracol: casa peste pivnita',
  },
  {
    n: 't.2b §3, IDX-10: consumatorul intercalat — scrie valoarea noua pe slot inainte sa fi citit toate sursele',
    f: 'src/sim/temperatura.ts',
    a: '    valori.push({ id: y.id, t: v.t, rest: v.rest })',
    b: '    stare.t[y.id] = v.t\n    stare.rest[y.id] = v.rest\n    stare.are[y.id] = 1\n    valori.push({ id: y.id, t: v.t, rest: v.rest })',
    t: TP, e: 'PROVENIENTA depasirea',
  },
  {
    n: 't.2b §3, B2: id-urile moarte nu se golesc (T ramas pe sloturi moarte)',
    f: 'src/sim/temperatura.ts',
    a: '  for (const s of sch.moarte) {\n    if (s >= n) continue',
    b: '  for (const s of sch.moarte.slice(0, 0)) {\n    if (s >= n) continue',
    t: TP, e: 'PROVENIENTA oracol: usa dintre doua pivnite',
  },
  {
    n: 't.2b §3, NUM-9: produsul peste 2^53 ramane pe Number (rotunjit tacut)',
    f: 'src/sim/temperatura.ts',
    a: '    if (Number.isSafeInteger(p)) return p + 0',
    b: '    return p + 0',
    t: TP, e: 'PROVENIENTA aritmetica',
  },
  {
    n: 't.2b §3, B2: recalculul fara instantaneul indexului vechi (bComp luat dupa golire: nimic nu persista)',
    f: 'src/sim/camere.ts',
    a: 'bComp: idx.bComp, comp: new Map(idx.comp)',
    b: 'bComp: new Int32Array(idx.bComp.length).fill(-1), comp: new Map(idx.comp)',
    t: TP, e: 'PROVENIENTA depasirea',
  },
  {
    n: 't.2b §3, PROV-5: regula NEC inversata (sub solul natural T_afara, deasupra T_sol)',
    f: F,
    a: '    necunoscute.set(kc, sub ? PROV_NEC_SOL0 - adancimeIn(col, z) : PROV_NEC_CER)',
    b: '    necunoscute.set(kc, sub ? PROV_NEC_CER : PROV_NEC_SOL0 - adancimeIn(col, z))',
    t: TP, e: 'PROVENIENTA recalculul NEC',
  },
  {
    n: 't.2b §3, PROV-6: descompunerea pe Number pentru H negativ cu floor(h/d)·d (restul ±1 langa −2^53)',
    f: 'src/sim/temperatura.ts',
    a: '    return r === 0 ? { t: -q + 0, rest: 0 } : { t: -q - 1, rest: d - r }',
    b: '    return { t: Math.floor(h / d), rest: h - Math.floor(h / d) * d }',
    t: TP, e: 'PROVENIENTA aritmetica: descompunerea pe Number',
  },
  {
    n: 't.2b §3: recalculul nu citeste partea valida a inelului (tunelul din ultimele editari iese NEC)',
    f: 'src/sim/camere.ts',
    a: '    for (let i = Math.max(idx.vazute, t.editari - JURNAL_CAP); i < t.editari; i++) {',
    b: '    for (let i = t.editari; i < t.editari; i++) {',
    t: TP, e: 'PROVENIENTA depasirea',
  },
]
