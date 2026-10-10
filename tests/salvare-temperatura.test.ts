/**
 * Salvarea temperaturii — S24-27 t.2b, commit-ul 5 (research/temperatura-t2b.md §7, §9 „M5", „Migrarea").
 *
 * Schema 8: blocul `temperaturi` {ancora, t, rest, amprenta}, pe ANCORA componentei, strict crescător; amprenta = FNV u32
 * peste vectorul C'. M5 (o salvare între doi pași continuă identic cu lumea neîntreruptă) pe:
 * (a) scena S+ — asimetrică, peste o graniță de bloc, cu id-uri care diferă după încărcare, la 20 de faze consecutive;
 * (b) casa pe iaz — o comandă `fill` PIATRA pe apa din podea (masa schimbată cu epoca pe loc), salvarea la faza 15, două
 *     zile de pași; plus pământ pe acoperiș (graful se schimbă, masa nu); controlul fără editare;
 * (c) imediat după comanda `dig` a ușii dintre două pivnițe (și după zidirea ei la loc);
 * (d) la scara minei (nodul pe BigInt);
 * (e) cu alt content la încărcare (c_sol −17%): amprenta diferă → rest 0 pe toate, T rămâne.
 * Plus refuzurile blocului (§7), `encode` care aruncă, compararea grafului cu cel integral la salvare (IDX-4) și
 * literalul dedicat al scenei S+ (CI rulează `npm test`; hash-ul standard e orb la temperatură).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { componentaLa, listaComponente } from '../src/sim/camere.ts'
import { capacitateMu } from '../src/sim/fete.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { decode, encode } from '../src/sim/save.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill, materialAt } from '../src/sim/terrain/terrain.ts'
import { grafulIncremental } from '../src/sim/termic.ts'
import { amprentaCapacitatii, MOTIV_GRAF_LA_SALVARE, sincronizeazaLumea, statTermic } from '../src/sim/temperatura.ts'
import { advance, createWorld, tick } from '../src/sim/world.ts'
import { casaTermica } from './fixturi-temperatura.ts'
import { bun, faraInvarianti, grafLumii, laEchilibru, mina192, tPeAncora } from './fixturi-pas.ts'
import { panaLa, scenaSPlus } from './fixturi-salvare.ts'
import { R, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA
const TPS = R.ticksPerSecond

function incarca(text: string, rules: Rules = R): World {
  return bun(decode(text, rules), 'decode')
}

interface RaportM5 {
  /** Salvări cu cel puțin un rest nenul. */
  cuRest: number
  /** Salvări după care cel puțin o componentă are alt id (slot) în lumea încărcată. */
  cuIdDiferit: number
  /** Adunări de căldură umană în lumile încărcate. */
  oameni: number
}

/**
 * M5 pe ferestre: la `n` tickuri consecutive, lumea continuă se salvează și se încarcă; fiecare copie încărcată merge
 * `lung` tickuri în pas cu lumea continuă (toate copiile vii în paralel), apoi se compară hash-ul (care cuprinde T și restul
 * pe ancoră) și (T, rest) pe ancoră.
 */
function m5Ferestre(w: World, n: number, lung: number, ce: string): RaportM5 {
  const r: RaportM5 = { cuRest: 0, cuIdDiferit: 0, oameni: 0 }
  const copii: { w: World; pana: number; de: number }[] = []
  for (let pas = 0; pas < n + lung; pas++) {
    if (pas < n) {
      const text = encode(w)
      const c = incarca(text)
      if (tPeAncora(w).some((l) => !l.endsWith(':0'))) r.cuRest++
      const idc = new Map(listaComponente(c.camere).map((x) => [x.ancora, x.id]))
      if (listaComponente(w.camere).some((x) => idc.get(x.ancora) !== x.id)) r.cuIdDiferit++
      copii.push({ w: c, pana: w.tick + lung, de: w.tick })
    }
    tick(w, R)
    for (const c of copii) if (c.w.tick < c.pana) tick(c.w, R)
    for (let i = copii.length - 1; i >= 0; i--) {
      const c = copii[i]!
      if (c.w.tick < c.pana) continue
      assert.equal(c.w.tick, w.tick)
      assert.deepEqual(tPeAncora(c.w), tPeAncora(w), `${ce}: salvarea de la tickul ${c.de} (faza ${c.de % TPS}), dupa ${lung} de tickuri`)
      assert.equal(hashWorld(c.w), hashWorld(w), `${ce}: hash-ul salvarii de la tickul ${c.de}`)
      faraInvarianti(c.w, `${ce}: lumea incarcata la ${c.de}`)
      r.oameni += statTermic(c.w).adunariOameni
      copii.splice(i, 1)
    }
  }
  return r
}

// --- scena S+ ---------------------------------------------------------------------------------

test('SALVARE scena S+ (literalul dedicat, §7, SAV-5): hash-ul la tickul 1.600 — cu sursele SOL si CER, o componenta deschisa la final, un lot doar-fete care schimba C\', rest nenul, caldura umana si id-uri care difera dupa decode', () => {
  const s = scenaSPlus()
  const w = s.w
  const st = statTermic(w)
  assert.ok(st.surseSol >= 1 && st.surseCer >= 1, `sursele: ${JSON.stringify(st)}`)
  assert.ok(st.loturiDoarFete >= 1, 'un lot doar-fete')
  assert.ok(st.adunariOameni > 0, 'caldura umana')
  assert.equal(st.invarianti, 0)
  assert.ok(listaComponente(w.camere).some((c) => c.deschise > 0), 'o componenta deschisa (sopronul)')
  assert.notDeepEqual([...w.camere.comp.values()].map((c) => c.ancora), listaComponente(w.camere).map((c) => c.ancora), 'ordinea din index nu e a ancorelor')
  assert.ok(tPeAncora(w).some((l) => !l.endsWith(':0')), 'rest nenul')
  const d = incarca(encode(w))
  const idc = new Map(listaComponente(d.camere).map((x) => [x.ancora, x.id]))
  assert.ok(listaComponente(w.camere).some((x) => idc.get(x.ancora) !== x.id), 'cel putin un id diferit dupa decode')
  // Pionul a rămas în B (căldura lui e în literal).
  assert.equal(componentaLa(w.camere, Math.floor(w.agents.x[0]! / 1000), Math.floor(w.agents.y[0]! / 1000), w.agents.z[0]!)?.id, componentaLa(w.camere, ...s.rep.B)!.id)
  assert.equal(hashWorld(w), '84d14adc')
  assert.equal(hashWorld(d), hashWorld(w))
})

test('SALVARE M5-faze pe S+ (§9 a): 20 de salvari consecutive (toate fazele pasului), fiecare copie incarcata 60 de tickuri (3 pasi) in pas cu lumea continua — hash si (T, rest) pe ancora identice; restul nenul, id-urile diferite, caldura umana in copii', () => {
  const s = scenaSPlus()
  const r = m5Ferestre(s.w, 20, 60, 'S+')
  assert.equal(r.cuRest, 20, 'rest nenul la fiecare salvare')
  assert.equal(r.cuIdDiferit, 20, 'id-uri diferite dupa fiecare decode (cheia pe slot ar fi vizibila)')
  assert.ok(r.oameni > 0, 'caldura umana in copiile incarcate')
  assert.equal(statTermic(s.w).grafDiferitLaSalvare, 0, 'graful incremental == integralul la fiecare salvare')
})

// --- M5 după comenzi (c) ------------------------------------------------------------------------

test('SALVARE M5 imediat dupa comanda dig a usii dintre doua pivnite si dupa zidirea ei la loc (§9 c): salvarea intre comanda si tick continua identic', () => {
  const { w, wx, wy, g } = sitPlat(20261001, 12)
  for (const z of [g - 2, g - 3]) for (let dy = 2; dy <= 4; dy++) {
    for (let dx = 2; dx <= 4; dx++) assert.ok(dig(w.terrain, wx + dx, wy + dy, z).ok)
    for (let dx = 6; dx <= 8; dx++) assert.ok(dig(w.terrain, wx + dx, wy + dy, z).ok)
  }
  bun(sincronizeazaLumea(w, R), 'sincronizare')
  laEchilibru(w, 300000 - 7)
  // Pivnițele pornesc la temperaturi diferite (altfel unirea n-ar muta nimic).
  const a = componentaLa(w.camere, wx + 3, wy + 3, g - 3)!.id
  w.temperatura.slot.t[a] = w.temperatura.slot.t[a]! + 5 * 65536
  for (const cmd of [{ kind: 'dig', wx: wx + 5, wy: wy + 3, z: g - 3 }, { kind: 'fill', wx: wx + 5, wy: wy + 3, z: g - 3, material: P }] as const) {
    assert.ok(applyCommand(w, cmd, R).ok)
    const r = m5Ferestre(w, 1, 60, `dupa ${cmd.kind}`)
    assert.equal(r.cuRest, 1)
    advance(w, 13, R)
  }
})

// --- M5-fețe (b) -----------------------------------------------------------------------------

/** Casa 3×3×2 de piatră zidită pe iazul de la seed 4242 (apa la −40, un strat): podeaua ei e apa. */
function casaPeIaz(): { w: World; x0: number; y0: number } {
  const w = createWorld(4242)
  const t = w.terrain
  const x0 = 244 * 32 + 10, y0 = 244 * 32
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.equal((materialAt(t, x0 + dx, y0 + dy, -40) as { value: number }).value, Material.APA, 'fixtura: apa la -40')
  for (let z = -39; z <= -38; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) if (dx === 0 || dy === 0 || dx === 4 || dy === 4) assert.ok(fill(t, x0 + dx, y0 + dy, z, P).ok)
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(t, x0 + dx, y0 + dy, -37, P).ok)
  bun(sincronizeazaLumea(w, R), 'sincronizare')
  laEchilibru(w, 300000)
  return { w, x0, y0 }
}

/** C' (μ) al casei de pe iaz, din graful incremental. */
function cPrim(w: World, x0: number, y0: number): number {
  const g = grafLumii(w)
  const c = componentaLa(w.camere, x0 + 2, y0 + 2, -39)!
  return capacitateMu(g.noduri.get(g.nodComp.get(c.id)!)!, R.termic.mase)
}

test('SALVARE M5-fete (§9 b, verif-IDX-2, verif-SAV-1): casa pe iaz — O comanda fill PIATRA pe apa din podea (epoca pe loc, epocaFete si C\' schimbate), salvarea la faza 15, doua zile de pasi in ambele lumi: identice; pamant pe acoperis (graful se schimba, masa nu), la fel; controlul fara editare; graful == integralul la fiecare salvare', () => {
  for (const ce of ['fill pe apa', 'pamant pe acoperis', 'control'] as const) {
    const { w, x0, y0 } = casaPeIaz()
    panaLa(w, 300000 + 10)
    const e0 = w.camere.epoca
    const f0 = w.camere.epocaFete
    const c0 = cPrim(w, x0, y0)
    if (ce === 'fill pe apa') assert.ok(applyCommand(w, { kind: 'fill', wx: x0 + 2, wy: y0 + 2, z: -40, material: P }, R).ok)
    if (ce === 'pamant pe acoperis') {
      assert.ok(fill(w.terrain, x0 + 2, y0 + 2, -36, Material.PAMANT).ok)
      tick(w, R)
    }
    panaLa(w, 300000 + 15)
    if (ce !== 'control') {
      assert.equal(w.camere.epoca, e0, `${ce}: epoca pe loc`)
      assert.ok(w.camere.epocaFete > f0, `${ce}: fetele s-au schimbat`)
    }
    assert.equal(cPrim(w, x0, y0) !== c0, ce === 'fill pe apa', `${ce}: C' ${c0} -> ${cPrim(w, x0, y0)}`)
    const c = incarca(encode(w))
    assert.equal(statTermic(w).grafDiferitLaSalvare, 0, `${ce}: graful incremental == integralul la salvare`)
    assert.equal(statTermic(c).restNormalizat, 0)
    advance(w, 2 * 2016 * TPS, R)
    advance(c, 2 * 2016 * TPS, R)
    assert.deepEqual(tPeAncora(c), tPeAncora(w), ce)
    assert.equal(hashWorld(c), hashWorld(w), ce)
    faraInvarianti(w, ce)
    faraInvarianti(c, ce)
  }
})

// --- M5 la scara minei (d) ----------------------------------------------------------------------

test('SALVARE M5 la scara minei (§9 d): mina 192x192x3 (un nod, pe BigInt la pas) — salvarile la fazele 0, 7 si 19 continua identic 60 de tickuri', () => {
  const w = laEchilibru(mina192(), 300000)
  let bigInt = 0
  for (const faza of [0, 7, 19]) {
    panaLa(w, w.tick + ((faza - (w.tick % TPS) + TPS) % TPS))
    m5Ferestre(w, 1, 60, `mina, faza ${faza}`)
    bigInt = statTermic(w).pasiBigInt
  }
  assert.ok(bigInt > 0, 'fixtura: nodul minei e pe BigInt la pas')
})

// --- M5-content (e) -----------------------------------------------------------------------------

/** Regulile cu c_sol × `f`: masele derivate se recalculează la parsare. */
function cuCSol(f: number): Rules {
  const o = parseRules({ ...R, termic: { ...R.termic, cSolJPeK: Math.round(R.termic.cSolJPeK * f), mase: undefined } } as unknown as Rules)
  return bun(o, 'reguli')
}

test('SALVARE M5-content (§9 e, SAV-2): salvata cu content-ul implicit, incarcata cu c_sol −17% — acceptata (amprenta C\' difera: rest 0 pe toate, T ramane, contorul = n), 0 ≤ rest < C\' dupa, doua incarcari dau acelasi hash, o zi de pasi fara invarianti', () => {
  const s = scenaSPlus()
  const text = encode(s.w)
  const B = cuCSol(0.83)
  const a = incarca(text, B)
  const b = incarca(text, B)
  const n = listaComponente(a.camere).length
  assert.equal(statTermic(a).restNormalizat, n)
  for (const c of listaComponente(a.camere)) {
    assert.equal(a.temperatura.slot.rest[c.id], 0)
    assert.equal(a.temperatura.slot.t[c.id], s.w.temperatura.slot.t[listaComponente(s.w.camere).find((x) => x.ancora === c.ancora)!.id], 'T ramane')
  }
  assert.equal(hashWorld(a), hashWorld(b))
  advance(a, 2016 * TPS, B)
  advance(b, 2016 * TPS, B)
  assert.equal(hashWorld(a), hashWorld(b))
  const g = bun(grafulIncremental(a.camere, B), 'graf')
  for (const c of listaComponente(a.camere)) {
    const C = capacitateMu(g.noduri.get(g.nodComp.get(c.id)!)!, B.termic.mase)
    assert.ok(a.temperatura.slot.rest[c.id]! >= 0 && a.temperatura.slot.rest[c.id]! < C)
  }
  faraInvarianti(a, 'content B')
  // Același content: amprenta egală, validare strictă, nimic normalizat.
  assert.equal(statTermic(incarca(text)).restNormalizat, 0)
})

// --- refuzurile și aruncările (§7) ---------------------------------------------------------------

interface Salvare {
  schema: number
  data: { temperaturi?: { ancora: unknown[]; t: unknown[]; rest: unknown[]; amprenta?: unknown } } & Record<string, unknown>
}

test('SALVARE refuzurile blocului (§7, B1, SAV-4): intrare lipsa, ancora fara componenta, ancore nesortate sau duplicate, T fractionar sau peste 2^31, rest negativ sau fractionar, rest ≥ C\' cu aceeasi amprenta, amprenta lipsa, bloc lipsa in schema 8, bloc in schema 7 — fiecare refuzat cu motivul lui; controlul neatins e acceptat', () => {
  const s = scenaSPlus()
  const text = encode(s.w)
  const baza = JSON.parse(text) as Salvare
  const n = baza.data.temperaturi!.ancora.length
  assert.ok(n >= 3, 'fixtura: cel putin trei componente')
  assert.ok(decode(text, R).ok, 'controlul')
  const caz = (ce: string, strica: (b: Salvare) => void, motiv: string): void => {
    const b = JSON.parse(text) as Salvare
    strica(b)
    const o = decode(JSON.stringify(b), R)
    assert.ok(!o.ok, `${ce}: acceptat`)
    assert.equal(o.ok ? '' : o.reason, motiv, `${ce}: ${JSON.stringify(o)}`)
  }
  const T = (b: Salvare): NonNullable<Salvare['data']['temperaturi']> => b.data.temperaturi!
  caz('intrare lipsa', (b) => { T(b).ancora.pop(); T(b).t.pop(); T(b).rest.pop() }, 'LIPSA_MATERIAL')
  caz('ancora fara componenta', (b) => { T(b).ancora[n - 1] = (T(b).ancora[n - 1] as number) + 1 }, 'ENTITATE_INEXISTENTA')
  caz('ancore nesortate', (b) => { const a = T(b).ancora; [a[0], a[1]] = [a[1], a[0]] }, 'VALOARE_INVALIDA')
  caz('ancora duplicata', (b) => { T(b).ancora[1] = T(b).ancora[0] }, 'VALOARE_INVALIDA')
  caz('T fractionar', (b) => { T(b).t[0] = (T(b).t[0] as number) + 0.5 }, 'VALOARE_INVALIDA')
  caz('T peste 2^31', (b) => { T(b).t[0] = 2147483648 }, 'VALOARE_INVALIDA')
  caz('rest negativ', (b) => { T(b).rest[0] = -1 }, 'VALOARE_INVALIDA')
  caz('rest fractionar', (b) => { T(b).rest[0] = 0.5 }, 'VALOARE_INVALIDA')
  caz('rest >= C\' cu aceeasi amprenta', (b) => { T(b).rest[0] = 1e12 }, 'VALOARE_INVALIDA')
  caz('amprenta lipsa', (b) => { delete T(b).amprenta }, 'VALOARE_INVALIDA')
  caz('bloc lipsa in schema 8', (b) => { delete b.data.temperaturi }, 'LIPSA_MATERIAL')
  caz('bloc in schema 7', (b) => { b.schema = 7 }, 'VALOARE_INVALIDA')
  // La margine: T = −2^31 se acceptă.
  const b = JSON.parse(text) as Salvare
  T(b).t[0] = -2147483648
  assert.ok(decode(JSON.stringify(b), R).ok, 'T = -2^31 e in domeniu')
})

test('SALVARE encode arunca (§7, SAV-4) pe o stare pe care decode ar refuza-o: T in afara lui [−2^31, 2^31) sau nesigur, rest ≥ C\' sau negativ', () => {
  const s = casaTermica()
  laEchilibru(s.w, 0)
  const c = componentaLa(s.w.camere, ...s.rep.casa!)!.id
  const sl = s.w.temperatura.slot
  const t0 = sl.t[c]!
  for (const [camp, v] of [['t', 2147483648], ['t', 0.5], ['rest', -1], ['rest', 1e9]] as const) {
    sl[camp][c] = v
    assert.throws(() => encode(s.w), /temperatura nu se poate salva/, `${camp} = ${v}`)
    sl.t[c] = t0
    sl.rest[c] = 0
  }
  assert.doesNotThrow(() => encode(s.w))
})

test('SALVARE compararea cu graful integral la encode (§6, IDX-4): o delta stricata FARA asimetrie (un bin cu +1) — salvarea o vede, integralul il inlocuieste, contorul +1 si prima linie diferita in jurnal; lumea continua si cea incarcata merg apoi identic', () => {
  const s = casaTermica({ k: 1 })
  const w = laEchilibru(s.w, 300000)
  const g = grafLumii(w)
  // determinism-ok: primul nod cu un rezervor.
  for (const n of g.noduri.values()) {
    const bin = n.bin as Map<number, number>
    // determinism-ok: idem.
    const prima = [...bin.keys()][0]
    if (prima === undefined) continue
    bin.set(prima, bin.get(prima)! + 1)
    break
  }
  const text = encode(w)
  assert.equal(statTermic(w).grafDiferitLaSalvare, 1)
  assert.ok(statTermic(w).ultimaDiferentaGraf.startsWith('N '), statTermic(w).ultimaDiferentaGraf)
  // Numărat și ca invariant (GRAF-1, SAV-R2): singurul contor pe care îl citește viewer-ul (alerta din Jurnal, F3).
  assert.deepEqual([statTermic(w).invarianti, statTermic(w).ultimulInvariant], [1, MOTIV_GRAF_LA_SALVARE])
  const c = incarca(text)
  advance(w, 2016 * TPS, R)
  advance(c, 2016 * TPS, R)
  assert.deepEqual(tPeAncora(c), tPeAncora(w))
  encode(w)
  assert.equal(statTermic(w).grafDiferitLaSalvare, 1, 'la salvarea urmatoare graful e bun')
})

test('SALVARE amprenta C\' (§7, verif-SAV-2): FNV peste n si C\' hi/lo, in ordinea ancorelor — alt vector, alta amprenta; nu intra in hash', () => {
  assert.notEqual(amprentaCapacitatii([1, 2, 3]), amprentaCapacitatii([1, 2, 4]))
  assert.notEqual(amprentaCapacitatii([1, 2]), amprentaCapacitatii([2, 1]))
  assert.notEqual(amprentaCapacitatii([2 ** 33]), amprentaCapacitatii([0]))
  assert.notEqual(amprentaCapacitatii([]), amprentaCapacitatii([0]))
  const s = scenaSPlus()
  const b = JSON.parse(encode(s.w)) as Salvare
  const h = hashWorld(incarca(JSON.stringify(b)))
  b.data.temperaturi!.amprenta = ((b.data.temperaturi!.amprenta as number) + 1) >>> 0
  const alt = incarca(JSON.stringify(b))
  assert.equal(statTermic(alt).restNormalizat, b.data.temperaturi!.ancora.length, 'amprenta diferita: normalizare')
  assert.ok(hashWorld(alt) !== h || b.data.temperaturi!.rest.every((r) => r === 0), 'restul pus la 0 se vede in hash')
})

// --- migrarea (§7) ----------------------------------------------------------------------------

test('SALVARE migrarea, reteaua 3x3x3 (B1, L4-4): o salvare de schema 7 a 27 de camere interioare legate (nodul din mijloc fara niciun rezervor) se incarca cu T finit peste tot, la echilibru', () => {
  const s = sitPlat(777, 10)
  const t = s.w.terrain
  const x0 = s.wx + 2, y0 = s.wy + 2, g = s.g
  for (let z = 1; z <= 7; z++) for (let x = 0; x <= 6; x++) for (let y = 0; y <= 6; y++) {
    if (x % 2 === 1 && y % 2 === 1 && z % 2 === 0) continue
    assert.ok(fill(t, x0 + x, y0 + y, g + z, P).ok)
  }
  // Camerele de o celulă, legate prin 1 m de piatră (muchiile rețelei, MUCHIE prin ≤ K celule de hotar).
  bun(sincronizeazaLumea(s.w, R), 'sincronizare')
  laEchilibru(s.w, 200)
  assert.equal(listaComponente(s.w.camere).length, 27)
  const b = JSON.parse(encode(s.w)) as Salvare
  b.schema = 7
  delete b.data.temperaturi
  const w = incarca(JSON.stringify(b))
  assert.equal(statTermic(w).echilibre, 1)
  for (const c of listaComponente(w.camere)) assert.ok(Number.isSafeInteger(w.temperatura.slot.t[c.id]) && w.temperatura.slot.are[c.id] === 1)
  const mijloc = componentaLa(w.camere, x0 + 3, y0 + 3, g + 4)!
  const gr = grafLumii(w)
  assert.equal(gr.noduri.get(gr.nodComp.get(mijloc.id)!)!.bin.size, 0, 'fixtura: camera din mijloc n-are niciun rezervor')
  advance(w, 200, R)
  faraInvarianti(w, 'reteaua')
})
