/**
 * Mutatii: fetele incaperilor (src/sim/fete.ts) si locul lor in sincronizare (src/sim/camere.ts) — S24-27 t.2a,
 * design-temperatura-v2 §4.1, §4.2, §4.4.
 *
 * Oracolul (cache-ul incremental == recalculul complet) e autoconsistent pentru tot ce calculeaza aceeasi
 * clasificare in ambele parti — ordinea felurilor, clamp-ul, compozitia, clasa de directie. Pe acelea le
 * prind testele pe HARTIE (cifrele panoului). Pe D+ si restrictiile (a), (b) le prind oracolul pe scenele
 * care le ating si contoarele (K05).
 */

const T = 'tests/fete.test.ts'
const TC = 'tests/camere.test.ts'
const TK = 'tests/camere-contract.test.ts'
const F = 'src/sim/fete.ts'
const C = 'src/sim/camere.ts'

export const MUTATII = [
  // --- D+ in sincronizare (§4.4)
  {
    n: 'D+ dupa iesirea devreme: un lot fara nicio felie refacuta nu atinge fetele (pamantul pe acoperis ramane EXT)',
    f: C,
    a: '    actualizeazaFete(idx, r, lot, [], [])\n',
    b: '',
    t: T, e: 'FETE D+: pamant pe acoperisul unei case',
  },
  {
    n: 'D+ doar pe loturile care refac felii (aceeasi scapare, in fete.ts): casa de peste pivnita ramane veche',
    f: F,
    a: '  else {\n    c.stat.loturi++\n    dPlus(idx, c, r, lot, marcate)\n  }',
    b: '  else if (felii.length > 0) {\n    c.stat.loturi++\n    dPlus(idx, c, r, lot, marcate)\n  }',
    t: T, e: 'FETE D+: casa ridicata de pioni PESTE o pivnita',
  },
  {
    n: 'L2-4: drumurile D+ au K pasi, nu K+1 (pivnita de sub 8 celule de hotar ramane MUCHIE spre cer)',
    f: F,
    a: '  const pasi = c.k + 1',
    b: '  const pasi = c.k',
    t: T, e: 'FETE D+: casa, pivnita sub ea, acoperisul spart',
  },
  {
    n: 'D+ fara drumurile verticale (o podea pe sol deasupra pivnitei nu se vede)',
    f: F,
    a: '  for (let d = 0; d < 6; d++) {\n    c.stat.drumuri++',
    b: '  for (let d = 0; d < 4; d++) {\n    c.stat.drumuri++',
    t: T, e: 'FETE fuzz de SUPRAFATA',
  },
  {
    n: 'D+ se opreste la primul sol natural (nu strabate peretele de roca spre put)',
    f: F,
    a: '      if (materialIn(col, pz) !== Material.AER) continue',
    b: '      if (materialIn(col, pz) !== Material.AER && !eSolNatural(materialIn(col, pz))) continue',
    t: T, e: 'FETE D+: put sapat in blocul vecin',
  },
  {
    n: 'D+ nu pleaca din rulajul de sub editare (celula acoperita de umplerea de sus ramane cer in fata casei)',
    f: F,
    a: '    for (let zz = z - 1; zz >= jos; zz--) porneste(x, y, zz)',
    b: '    void jos',
    t: T, e: 'FETE D+ (a): doua umpleri in aceeasi coloana',
  },
  {
    n: 'lotul D+ nu primeste rulajul (jos = z): acoperisul spart nu ajunge la pivnita',
    f: C,
    a: '    lot.push(x, y, z, jos)',
    b: '    lot.push(x, y, z, z)',
    t: T, e: 'FETE D+: casa, pivnita sub ea, acoperisul spart',
  },
  // --- restrictiile (a) si (b)
  {
    n: 'L2-5: restrictia (a) naiva — sari rulajul daca e ORICE hotar deasupra (cealalta umplere din coloana)',
    f: F,
    a: '    if (materialIn(col, zz) !== Material.AER && !editate.has(cheieCelula(x, y, zz))) return true',
    b: '    if (materialIn(col, zz) !== Material.AER) return true',
    t: T, e: 'FETE D+ (a): doua umpleri in aceeasi coloana',
  },
  {
    n: 'fara restrictia (a): rulajul de sub editare se strabate mereu (hala de 30 m: 30 de starturi pe lot)',
    f: F,
    a: '    if (hotarNeeditatDeasupra(r, x, y, z, editate)) {',
    b: '    if (hotarNeeditatDeasupra(r, x, y, z, editate) && false) {',
    t: T, e: 'FETE hala de 30 m',
  },
  {
    n: 'fara restrictia (b): feliile refacute cu aceleasi celule se recalculeaza (hala de 30 m: 30 de felii pe lot)',
    f: F,
    a: '    const harta = fv === undefined ? null : potrivire(fv, fn)',
    b: '    const harta = fv === undefined ? null : potrivire(fv, fn) && null',
    t: T, e: 'FETE hala de 30 m',
  },
  {
    n: 'restrictia (b) poarta randurile si peste marcajul D+ (felia de sub planseu ramane cu fetele vechi)',
    f: F,
    a: '      const purtate = marcate.has(bn) ? undefined : vechiRanduri.get(harta.get(bn)!)',
    b: '      const purtate = vechiRanduri.get(harta.get(bn)!)',
    t: T, e: 'FETE hala de 30 m',
  },
  {
    n: 'sloturile bucatilor sterse isi pastreaza randurile (fantoma de randuri pe un slot liber)',
    f: F,
    a: '      c.randuri[b] = undefined\n',
    b: '',
    t: TC, e: 'ORACOL: incremental == recalcul complet, fuzz pe uscat',
  },
  // --- epocaFete si garda
  {
    n: 'epocaFete nu creste cand D+ marcheaza (graful din valul 2 ar ramane vechi)',
    f: F,
    a: '  if (marcate.size > 0) idx.epocaFete++\n',
    b: '',
    t: T, e: 'FETE D+: pamant pe acoperisul unei case',
  },
  {
    n: 'epocaFete creste pe orice lot (graful s-ar reface si fara nicio fata schimbata)',
    f: F,
    a: '  if (marcate.size > 0) idx.epocaFete++\n',
    b: '  idx.epocaFete++\n',
    t: T, e: 'FETE D+: pamant pe acoperisul unei case',
  },
  {
    n: 'garda lipseste: D+ porneste drumuri si pe un index fara felii (scenariul standard plateste)',
    f: F,
    a: '  if (idx.felii.size === 0) c.stat.loturiSarite++',
    b: '  if (idx.felii.size < 0) c.stat.loturiSarite++',
    t: T, e: 'FETE K05: scenariul standard',
  },
  {
    n: 'K01: fiecare lot recalculeaza toate bucatile (acelasi cache, costul O(asezare); oracolul e orb)',
    f: F,
    a: '  for (const [kf, s] of [...peFelie].sort((a, b) => a[0] - b[0])) c.stat.bucatiRecalculate += scrieRanduri(c, r, idx.felii.get(kf)!, s)',
    b: '  for (const kf of idx.chei) c.stat.bucatiRecalculate += scrieRanduri(c, r, idx.felii.get(kf)!, null)',
    t: T, e: 'FETE K05: aceeasi sarcina costa la fel',
  },
  // --- recalculul si contractul
  {
    n: 'recalculul indexului nu reface fetele (decode porneste cu un cache gol)',
    f: C,
    a: '  reconstruiesteFete(idx, t)\n  idx.epoca++',
    b: '  idx.epoca++',
    t: TC, e: 'SALVARE: lumea incarcata are exact indexul',
  },
  {
    n: 'depasirea jurnalului e raportata ca „nimic", nu ca recalcul',
    f: C,
    a: '  if (n < 0 || n > JURNAL_CAP) {\n    reconstruiesteCamere(idx, t)\n    return RECALCUL',
    b: '  if (n < 0 || n > JURNAL_CAP) {\n    reconstruiesteCamere(idx, t)\n    return NIMIC',
    t: TC, e: 'depasirea jurnalului reconstruieste complet',
  },
  {
    n: 'contractul: sincronizarea care reface felii le intoarce goale',
    f: C,
    a: '  return { felii, recalcul: false }',
    b: '  return NIMIC',
    t: TK, e: 'CONTRACT: sincronizeazaCamere intoarce cheile feliilor refacute',
  },
  // --- clasificarea (§4.1, §4.2): pe hartie, fiindca oracolul e autoconsistent aici
  {
    n: 'MUCHIE dupa sol: drumul care trece prin roca spre alta pivnita devine SOL',
    f: F,
    a: '      if (acoperit) return scrie(o, FelFata.MUCHIE, comp, prima, -1, cheieCelula(px, py, pz))',
    b: '      if (acoperit && iSol < 0) return scrie(o, FelFata.MUCHIE, comp, prima, -1, cheieCelula(px, py, pz))',
    t: T, e: 'FETE pe hartie: MUCHIE inaintea solului',
  },
  {
    n: 'adancimea neclampata jos: capatul ADANC de sub 11 m de piatra are d = -11',
    f: F,
    a: '  if (d <= 0) return 0\n',
    b: '  if (d === 0) return 0\n',
    t: T, e: 'FETE pe hartie: donjonul',
  },
  {
    n: 'd_ef ignora aerul de afara de pe drum (peretele natural subtire spre sant ia adancimea plina)',
    f: F,
    a: '      if (iSol >= 0) return scrie(o, FelFata.SOL, compSol, prima, Math.min(dSol, i - iSol - 1), -1)',
    b: '      if (iSol >= 0) return scrie(o, FelFata.SOL, compSol, prima, dSol, -1)',
    t: T, e: 'FETE pe hartie: d_ef',
  },
  {
    n: 'SOL pe ULTIMA celula de sol a drumului, nu pe prima',
    f: F,
    a: '    if (iSol < 0 && eSolNatural(m)) {',
    b: '    if (eSolNatural(m)) {',
    t: T, e: 'FETE pe hartie: pivnita 5x5x2 sub IARBA',
  },
  {
    n: 'IARBA nu e sol natural (tavanul pivnitei de sub iarba da in aer de afara)',
    f: 'src/sim/terrain/chunk.ts',
    a: '  return m === Material.ROCA || m === Material.PAMANT || m === Material.IARBA',
    b: '  return m === Material.ROCA || m === Material.PAMANT',
    t: T, e: 'FETE pe hartie: pivnita 5x5x2 sub IARBA',
  },
  {
    n: 'sub baza ferestrei e AER (conventia lui materialAt): podeaua camerei de la baza dispare',
    f: F,
    a: '  if (l < 0) return Material.ROCA\n',
    b: '  if (l < 0) return Material.AER\n',
    t: T, e: 'FETE pe hartie: camera sapata la baza ferestrei',
  },
  {
    n: 'apa nu e capat de drum: pivnita de sub iaz da in aer de afara prin apa',
    f: F,
    a: '    if (m === Material.APA) {\n      if (iSol >= 0)',
    b: '    if (m === -1) {\n      if (iSol >= 0)',
    t: T, e: 'FETE pe hartie: pivnita 3x3x2 sapata direct sub apa',
  },
  {
    n: 'clasa de directie: SUS si JOS inversate',
    f: F,
    a: 'const CLASA: readonly ClasaDirId[] = [ClasaDir.LAT, ClasaDir.LAT, ClasaDir.LAT, ClasaDir.LAT, ClasaDir.SUS, ClasaDir.JOS]',
    b: 'const CLASA: readonly ClasaDirId[] = [ClasaDir.LAT, ClasaDir.LAT, ClasaDir.LAT, ClasaDir.LAT, ClasaDir.JOS, ClasaDir.SUS]',
    t: T, e: 'FETE pe hartie: pivnita 5x5x2 sub IARBA',
  },
  {
    n: 'compozitia e o multime, nu un multiset (8 m de piatra = 1 m)',
    f: F,
    a: '  num[m] = num[m]! + 1',
    b: '  num[m] = 1',
    t: T, e: 'FETE pe hartie: donjonul',
  },
  {
    n: 'prima celula e ultima de pe drum (pamantul de pe acoperis, nu piatra acoperisului)',
    f: F,
    a: '    if (prima < 0) prima = m',
    b: '    prima = m',
    t: T, e: 'FETE D+: pamant pe acoperisul unei case',
  },
  {
    n: 'fata interioara numarata: vecinul de aer acoperit e o MUCHIE',
    f: F,
    a: '        if (acoperit) return false\n',
    b: '        if (acoperit) return scrie(o, FelFata.MUCHIE, comp, prima, -1, cheieCelula(px, py, pz))\n',
    t: T, e: 'FETE pe hartie: pivnita 5x5x2 sub IARBA',
  },
  // --- agregarea pe componenta (citirea valului 2)
  {
    n: 'SINE nu iese din randuri: drumul prin stalp se intoarce in pivnita ca o muchie',
    f: F,
    a: '        if (vecina === comp.id) {\n          sine += x.fete\n          continue\n        }',
    b: '',
    t: T, e: 'FETE pe hartie: un stalp de 1x1',
  },
  {
    n: 'muchiile spre vecine diferite se contopesc intr-un rand (debaraua vede o singura vecina)',
    f: F,
    a: '      const k2 = x.fel === FelFata.MUCHIE ? vecina : x.adancime',
    b: '      const k2 = x.adancime',
    t: T, e: 'FETE pe hartie: debaraua',
  },
  {
    n: 'L2-4: agregarea nu refuza o muchie spre o celula care nu e aer acoperit (bComp[-1], tacut)',
    f: F,
    a: "        if (bd < 0) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'celula de dincolo a unei muchii nu e aer acoperit'",
    b: "        if (bd < -1) return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'celula de dincolo a unei muchii nu e aer acoperit'",
    t: T, e: 'FETE: agregarea refuza cu INVARIANT_INCALCAT',
  },
]
