/**
 * Mutatii: temperatura ca STARE — S24-27 t.2b, valul 1, commit-urile 4 si 5 (research/temperatura-t2b.md §1, §2, §5, §7, §9).
 *
 * Commit-ul 4: punctul unic de sincronizare (src/sim/temperatura.ts, world.ts, commands.ts), invariantii (stampila
 * completa, T in ambele directii, refuzul fara aruncare), pasul de 1 Hz in forma ψ (muchiile din T vechi, oamenii, T*,
 * marginea dinamica, comutatorul BigInt, modelul memorat), echilibrul „lumii fara istorie". Le prind testele pe hartie
 * (tests/pas-termic.test.ts, tests/stare-temperatura.test.ts) si oracolele: referinta independenta a pasului pe BigInt,
 * Number == BigInt, orientarea inversata, punctul fix.
 */

const TP = 'tests/pas-termic.test.ts'
const TS = 'tests/stare-temperatura.test.ts'
const F = 'src/sim/temperatura.ts'

export const MUTATII = [
  // --- punctul unic si invariantii (§2)
  {
    n: 't.2b §2: sincronizeazaLumea nu verifica stampila la intrare (o ocolire a punctului unic trece neobservata)',
    f: F,
    a: '  const intrare = verificaStampila(w)',
    b: '  const intrare = accept()',
    t: TS, e: 'STARE ocolirea punctului unic',
  },
  {
    n: 't.2b §2, IDX-2: stampila doar pe epoca (un lot doar-fete ocolit trece)',
    f: F,
    a: '  if (s.vazute !== idx.vazute || s.epoca !== idx.epoca || s.epocaFete !== idx.epocaFete) {',
    b: '  if (s.epoca !== idx.epoca) {',
    t: TS, e: 'STARE perechea (epoca, epocaFete)',
  },
  {
    n: 't.2b §2, IDX-6: stampila fara identitatea indexului (un index inlocuit cu aceleasi contoare trece)',
    f: F,
    a: '  if (s.idx !== idx) return refuse(',
    b: '  if (s.idx !== idx && false) return refuse(',
    t: TS, e: 'STARE indexul inlocuit',
  },
  {
    n: 't.2b §1, IDX-6: T intr-o singura directie — o componenta vie fara T nu se vede',
    f: F,
    a: '  if (cuT !== idx.comp.size) {',
    b: '  if (false) {',
    t: TS, e: 'STARE T in ambele directii',
  },
  {
    n: 't.2b §1, IDX-6: T intr-o singura directie — un slot mort cu T nu se vede',
    f: F,
    a: '    if (!idx.comp.has(s)) return refuse(',
    b: '    if (false) return refuse(',
    t: TS, e: 'STARE T in ambele directii',
  },
  {
    n: 't.2b §5.3: invariantii nu se numara',
    f: F,
    a: '  st.stat.invarianti++',
    b: '  void 0',
    t: TS, e: 'STARE ocolirea punctului unic',
  },
  {
    n: 't.2b §7: encode nu verifica temperatura (o stare ocolita se salveaza)',
    f: 'src/sim/save.ts',
    a: '  const t = temperaturaLaZi(w)',
    b: '  const t = { ok: true }',
    t: TS, e: 'STARE ocolirea punctului unic',
  },
  {
    n: 't.2b §7: decode fara echilibru (lumea incarcata are componente fara T)',
    f: 'src/sim/save.ts',
    a: '  const echilibru = temperaturaLaEchilibru(w, rules, w.tick)',
    b: '  const echilibru = { ok: true }',
    t: TS, e: 'STARE incarcarea',
  },
  {
    n: 't.2b §7, SAV-11: buildM10PeLume fara echilibru (asezarea ramane pe proveninta NEC a recalculului)',
    f: 'src/harness/fixture-m10.ts',
    a: '  const e = temperaturaLaEchilibru(w, rules, w.tick)',
    b: '  const e = { ok: true }',
    t: 'tests/fixture.test.ts', e: 'M10 pe o LUME (gate-ul viewer-ului, IDX-5)',
  },
  {
    n: 't.2b §2, SAV-7: sincronizeazaLumea nu aplica proveninta (T-ul consumatorului ramane pe sloturile vechi)',
    f: F,
    a: '  if (sch.mase.noi.length > 0 || sch.moarte.length > 0) {',
    b: '  if (false) {',
    t: 'tests/provenienta.test.ts', e: 'PROVENIENTA prin COMENZI',
  },
  // --- locul pasului in tick (§2, B4)
  {
    n: 't.2b §2, B4 F5: pasul inainte de sincronizare (caldura in componenta de dinainte de lot)',
    f: 'src/sim/world.ts',
    a: '  sincronizeazaLumea(w, rules)\n  // Pasul de 1 Hz',
    b: '  if (w.tick % rules.ticksPerSecond === 0) pasTermic(w, rules)\n  sincronizeazaLumea(w, rules)\n  // Pasul de 1 Hz',
    e2: [{ f: 'src/sim/world.ts', a: '  if (w.tick % rules.ticksPerSecond === 0) pasTermic(w, rules)\n  w.tick++', b: '  w.tick++' }],
    t: TP, e: 'PAS oamenii dupa lot',
  },
  {
    n: 't.2b §1, B1: faza pasului alta decat w.tick % tps === 0',
    f: 'src/sim/world.ts',
    a: '  if (w.tick % rules.ticksPerSecond === 0) pasTermic(w, rules)',
    b: '  if (w.tick % rules.ticksPerSecond === 1) pasTermic(w, rules)',
    t: TP, e: 'PAS avansul termic',
  },
  // --- pasul (§5)
  {
    n: 't.2b §5.4, B4: prima linie a pasului lipseste (scenariul standard citeste rezervoarele)',
    f: F,
    a: '  if (w.camere.comp.size === 0) return null\n',
    b: '',
    t: TP, e: 'PAS scenariul standard',
  },
  {
    n: 't.2b §5.3: pasul refuzat de graf nu se reface (urgenta) si nu continua',
    f: F,
    a: '    r = pasPeGraf(w, go.value, rules, o)\n',
    b: '    return null\n',
    t: TS, e: 'STARE pasul nu arunca din tick',
  },
  {
    n: 't.2b §6: simetria muchiei nu se verifica la citire (pasul integreaza pe un graf stricat)',
    f: F,
    a: '      if (inv !== G) return refuse(',
    b: '      if (false) return refuse(',
    t: TS, e: 'STARE pasul nu arunca din tick',
  },
  {
    n: 't.2b §5: modelul pasului memorat fara stampila (dupa un lot, pasul integreaza pe graful vechi)',
    f: F,
    a: '  if (m !== undefined && m.reguli === rules && m.vazute === s.vazute && m.epoca === s.epoca && m.epocaFete === s.epocaFete) return m',
    b: '  if (m !== undefined) return m',
    t: TP, e: 'PAS T*',
  },
  {
    n: 't.2b §5.1, B4: oamenii nu se citesc (W 0)',
    f: F,
    a: '    W[k] = W[k]! + rules.termic.omW',
    b: '    W[k] = W[k]! + 0',
    t: TP, e: 'PAS oamenii pe hartie',
  },
  {
    n: 't.2b §5.1, B4: caldura rotunjita pe pion, nu o conversie pe nod',
    f: F,
    a: '      P = caldura(W[i]!, conv)',
    b: '      P = caldura(rules.termic.omW, conv) * (W[i]! / rules.termic.omW)',
    t: TP, e: 'PAS oamenii pe hartie',
  },
  {
    n: 't.2b §5.2, NUM-7: rezervoarele fata de T VECHI, nu fata de T* (dupa muchii si oameni)',
    f: F,
    a: '      for (let k = m.rStart[i]!; k < m.rStart[i + 1]!; k++) X += m.rG[k]! * (tRez[m.rBin[k]!]! - tStar)',
    b: '      for (let k = m.rStart[i]!; k < m.rStart[i + 1]!; k++) X += m.rG[k]! * (tRez[m.rBin[k]!]! - T[i]!)',
    t: TP, e: 'PAS T*',
  },
  {
    n: 't.2b §5.2, SAV-3: fluxul muchiei rotunjit cu floor (orientarea, deci eticheta, scapa in H)',
    f: F,
    a: '  if ((x < 0 ? -x : x) < prag) return rsN(x, 65536)',
    b: '  if ((x < 0 ? -x : x) < prag) return Math.floor(x / 65536)',
    t: TP, e: 'PAS orientarea',
  },
  {
    n: 't.2b §5.3, B1: marginea statica S·M (fara |T*|): o casa fierbinte ramane pe Number, X rotunjit tacut',
    f: F,
    a: '    if (S * (M + aT) < prag && (C + S) * 65536 < prag) {',
    b: '    if (S * M < prag && (C + S) * 65536 < prag) {',
    t: TP, e: 'PAS marginea dinamica',
  },
  {
    n: 't.2b §5.3, NUM-5: comutatorul nu trece si muchiile pe BigInt (pragul fix 2^52 pe muchie)',
    f: F,
    a: '  if ((x < 0 ? -x : x) < prag) return rsN(x, 65536)',
    b: '  if ((x < 0 ? -x : x) < PRAG_NUMBER) return rsN(x, 65536)',
    t: TP, e: 'PAS Number == BigInt',
  },
  {
    n: 't.2b §5.3: un T in afara intregilor siguri nu refuza pasul (BigInt(±Infinity) arunca din tick)',
    f: F,
    a: '    if (!Number.isSafeInteger(tStar)) return refuse(',
    b: '    if (false) return refuse(',
    t: TP, e: 'PAS garda 6·g_max',
  },
]
