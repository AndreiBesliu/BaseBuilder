/**
 * Mutatii: graful termic incremental (ii) — S24-27 t.2b, valul 1, commit-ul 3 (research/temperatura-t2b.md §6;
 * src/sim/termic.ts, bucatile lotului din src/sim/camere.ts).
 *
 * Oracolul (graful incremental == graful integral al unui index nou, dupa fiecare lot) prinde tot ce strica SUMELE: o
 * contributie refolosita gresit (feliile de dincolo, inregistrarea, cursorul), indexul invers, scaderea, nodurile golite.
 * Oracolul NU vede regula de mostenire — ea schimba doar etichetele si costul (harta B5, panoul IDX); pe ea o prind testele
 * pe HARTIE (cine pastreaza nodul la unire, la despartire, la egalitate) si K05 (contoarele egale pe 7x7 si 13x13; o bucla
 * care nu trece prin contoare o prinde timpul deltei in lockstep, GRAF-3). C' pe
 * nod se compara cu `contoareComponentei` (o suma in afara grafului): integralul are acelasi cod de adunare, deci un C'
 * gresit in ambele trece pe langa „incremental == integral". SINE se vede doar fata de graful t.2a (alt cod).
 */

const T = 'tests/graf-incremental.test.ts'
const TK = 'tests/graf-k05.test.ts'
const F = 'src/sim/termic.ts'
const CAM = 'src/sim/camere.ts'

export const MUTATII = [
  // --- contributia memorata (B5 §2.3)
  {
    n: 'B5 §2.3: contributia memorata fara validarea feliilor de dincolo (perechea ramane pe bucata unei felii refacute)',
    f: F,
    a: '  for (const f of c.felii) if (idx.felii.get(f.cheie) !== f) return false',
    b: '  for (const f of c.felii) if (false) return false',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  {
    n: 'contributia memorata fara identitatea inregistrarii (randurile rescrise de D+ raman cele vechi)',
    f: F,
    a: '  if (c.inreg !== e) return false',
    b: '  if (false) return false',
    t: T, e: 'GRAF doar fete: pamant pe acoperisul casei',
  },
  {
    n: 'cursorul celulelor de dincolo nu se goleste la lot (felia memorata e obiectul de la lotul trecut)',
    f: F,
    a: '  g.cursor.ultimaCheie = -1\n',
    b: '',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  // --- indexul invers
  {
    n: 'B5: fara indexul invers (vecinii unei bucati moarte sau mutate isi pastreaza perechea veche)',
    f: F,
    a: '    iv.add(b)\n',
    b: '',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  {
    n: 'indexul invers nu intra in S (nici la moarte, nici la mutare)',
    f: F,
    a: '  if (iv !== undefined) for (const x of iv) S.add(x)',
    b: '  if (false) for (const x of iv) S.add(x)',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  {
    n: 'indexul invers al bucatilor MOARTE nu intra in S',
    f: F,
    a: '    S.add(b)\n    adaugaInversul(g, b, S)\n',
    b: '    S.add(b)\n',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  {
    n: 'indexul invers al bucatilor MUTATE nu intra in S (pivnita mare pastreaza muchia spre nodul sters al celei mici)',
    f: F,
    a: '      st.mutate++\n      adaugaInversul(g, b, S)\n',
    b: '      st.mutate++\n',
    t: T, e: 'GRAF mostenirea pe hartie',
  },
  // --- sumele pe nod
  {
    n: "C' neactualizat la adunare (contoarele constructiei lipsesc din nod — si din integral: le prinde suma din fete.ts)",
    f: F,
    a: '  n.nConstr += e.nConstr\n',
    b: '',
    t: T, e: "GRAF doar fete: C' pe nod urmeaza contoarele",
  },
  {
    n: "C' nescazut (bucatile moarte si mutate isi lasa contoarele constructiei pe nod)",
    f: F,
    a: '  n.nConstr -= c.inreg.nConstr\n',
    b: '',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  {
    n: 'SINE adunat ca muchie (o pereche spre propriul nod intra in Σg — graful t.2a o sare)',
    f: F,
    a: '    if (nd !== s) adaugaLa(n.vec, nd, c.perechi[p + 1]!) // pe același nod: SINE',
    b: '    adaugaLa(n.vec, nd, c.perechi[p + 1]!) // pe același nod: SINE',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  // --- delta
  {
    n: 'bucatile rescrise de D+ nu intra in S (pamantul pe acoperis nu schimba graful)',
    f: F,
    a: '  for (const b of sch.bucatiRescrise) S.add(b)\n',
    b: '',
    t: T, e: 'GRAF doar fete: pamant pe acoperisul casei',
  },
  {
    n: 'nodurile golite nu dispar (raman cu o componenta moarta)',
    f: F,
    a: '    g.noduri.delete(s)\n',
    b: '',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  {
    n: 'componentele moarte raman in nodComp',
    f: F,
    a: '  for (const id of sch.moarte) g.nodComp.delete(id)\n',
    b: '',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  // --- mostenirea (§6, IDX-8)
  {
    n: 'K05: fara mostenire (fiecare componenta atinsa primeste nod nou — „nod = id"; |S| creste cu asezarea)',
    f: F,
    a: '  for (const k of cand) {',
    b: '  for (const k of cand.slice(0, 0)) {',
    t: TK, e: 'GRAF K05',
  },
  {
    // GRAF-3: aceleași contoare, același graf — doar costul. Pasul (6) pe TOATE nodurile e O(așezare) pe lot: contoarele
    // K05 trec, timpul în lockstep nu (raportul p50 13×13 / 7×7: 1,57–1,87 față de 1,04–1,10).
    n: 'GRAF-3: pasul (6) al deltei parcurge TOATE nodurile, nu doar cele golite (cost O(asezare) pe lot, necontorizat)',
    f: F,
    a: '  for (const s of [...golite].sort((a, b) => a - b)) {',
    b: '  for (const s of [...g.noduri.keys()].sort((a, b) => a - b)) {',
    t: TK, e: 'GRAF K05',
  },
  {
    n: 'mostenirea inversata: sursa cu cele MAI PUTINE celule ia nodul',
    f: F,
    a: '  cand.sort((a, b) => b.n - a.n || a.ac - b.ac || a.an - b.an)',
    b: '  cand.sort((a, b) => a.n - b.n || a.ac - b.ac || a.an - b.an)',
    t: T, e: 'GRAF mostenirea pe hartie',
  },
  {
    n: 'IDX-8: egalitatea dintre surse rupta pe ETICHETA nodului, nu pe ancora sursei',
    f: F,
    a: '  cand.sort((a, b) => b.n - a.n || a.ac - b.ac || a.an - b.an)',
    b: '  cand.sort((a, b) => b.n - a.n || a.ac - b.ac || a.nod - b.nod)',
    t: T, e: 'GRAF egalitatile se rup GEOMETRIC',
  },
  {
    n: 'IDX-8: egalitatea dintre componentele noi rupta pe ancora MAI MARE',
    f: F,
    a: '  cand.sort((a, b) => b.n - a.n || a.ac - b.ac || a.an - b.an)',
    b: '  cand.sort((a, b) => b.n - a.n || b.ac - a.ac || a.an - b.an)',
    t: T, e: 'GRAF egalitatile se rup GEOMETRIC',
  },
  {
    n: 'IDX-8: SOL, CER si NEC concureaza la mostenire (o sursa negativa n-are nod: refacere de urgenta)',
    f: F,
    a: '      if (s < 0) continue // SOL, CER, NEC: nu sunt componente vechi\n',
    b: '',
    t: T, e: 'GRAF mostenirea: o componenta fara sursa veche',
  },
  {
    // Doar costul: bucățile mutate sunt aceleași (cele născute merg pe nod oricum), dar se parcurg membrii nodului-sursă —
    // pe o desprindere din hub, ~1.200 în loc de câteva. Lărgire20 n-are o asemenea desprindere (K05 a ieșit RATATĂ pe ea,
    // 08.10): o prinde contorul `parcurseMostenire` pe hârtie.
    n: 'o componenta cu nod nou parcurge membrii surselor, nu bucatile ei (costul: tot nodul-sursa la fiecare desprindere)',
    f: F,
    a: '    if (!surse.includes(s)) {',
    b: '    if (false) {',
    t: T, e: 'GRAF mostenirea pe hartie',
  },
  // --- stampila, citirea, compararea
  {
    n: 'stampila: un lot nevazut de graf nu se observa (delta aplicata pe un graf vechi)',
    f: F,
    a: '  if (s.vazute !== a.vazute || s.epoca !== a.epoca || s.epocaFete !== a.epocaFete) return refaIntegral(idx, rules, e, true)',
    b: '  if (false) return refaIntegral(idx, rules, e, true)',
    t: T, e: 'GRAF stampila',
  },
  {
    n: 'stampila: grafulIncremental da un graf care nu e la zi cu indexul',
    f: F,
    a: '  if (s.vazute !== idx.vazute || s.epoca !== idx.epoca || s.epocaFete !== idx.epocaFete) {',
    b: '  if (false) {',
    t: T, e: 'GRAF stampila',
  },
  {
    n: 'simetria nu se verifica la citire (o muchie cu alta suma intr-un capat se citeste)',
    f: F,
    a: '      if (inv !== G) return refuse(',
    b: '      if (false) return refuse(',
    t: T, e: 'GRAF simetria la citire',
  },
  {
    n: 'IDX-4: compararea cu integralul nu inlocuieste graful gresit',
    f: F,
    a: '  e.stat.refaceriDeUrgenta++\n  e.inc = nou.value\n',
    b: '  e.stat.refaceriDeUrgenta++\n',
    t: T, e: 'GRAF compararea cu integralul',
  },
  {
    n: 'IDX-4: compararea cu integralul nu numara inlocuirea',
    f: F,
    a: '  e.stat.refaceriDeUrgenta++\n  e.inc = nou.value\n',
    b: '  e.inc = nou.value\n',
    t: T, e: 'GRAF compararea cu integralul',
  },
  // --- bucatile lotului (camere.ts)
  {
    n: 'sincronizarea nu intoarce bucatile moarte (feliile vechi)',
    f: CAM,
    a: '  for (const fv of vechi) if (fv !== undefined) for (const b of fv.bucati) bucatiMoarte.push(b)\n',
    b: '',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  {
    n: 'sincronizarea nu intoarce bucatile rescrise de D+ cand s-au refacut si felii',
    f: CAM,
    a: '  for (const b of rf.marcate) if (!nascute.has(b)) bucatiRescrise.push(b)',
    b: '  for (const b of rf.marcate) if (false) bucatiRescrise.push(b)',
    t: T, e: 'GRAF oracol: fuzz de despartiri si uniri',
  },
  {
    n: 'iesirea devreme (doar fete) nu intoarce bucatile rescrise',
    f: CAM,
    a: 'inainte, bucatiMoarte: [], bucatiNascute: [], bucatiRescrise: rescrise }',
    b: 'inainte, bucatiMoarte: [], bucatiNascute: [], bucatiRescrise: [] }',
    t: T, e: 'GRAF doar fete: pamant pe acoperisul casei',
  },
  {
    n: 'stampila de dinainte a lotului luata gresit (fiecare lot ar parea nevazut: refacere de urgenta)',
    f: CAM,
    a: '  const inainte = stampilaIndexului(idx)\n  if (n < 0 || n > JURNAL_CAP)',
    b: '  const inainte = { vazute: -1, epoca: idx.epoca, epocaFete: idx.epocaFete }\n  if (n < 0 || n > JURNAL_CAP)',
    t: T, e: 'GRAF mostenirea pe hartie',
  },
]
