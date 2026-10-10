/**
 * Pasul de 1 Hz — S24-27 t.2b, commit-ul 4 (research/temperatura-t2b.md §5, §9 „Numericul").
 *
 * - PUNCTUL FIX: cu rezervoarele înghețate (același tick), pasul rămâne la ±2 Q16 de regimul permanent pe scenele obișnuite
 *   și la ±2^7 pe hotelul de camere interioare (ponderile rotunjite pe pas și banda fluxului pe muchie, B3 §4) [NUM-4].
 * - EXACTITATEA: Number == BigInt bit cu bit (comutatorul `pragBigInt = 0` trece TOATE nodurile și muchiile pe BigInt)
 *   [NUM-5]; ΔΣH == ΣF_r + ΣP la fiecare pas (muchiile se anulează); orientarea inversată pe jumătate din muchii →
 *   identic (rs impară) [SAV-3]; referința independentă pe BigInt (tests/fixturi-pas.ts) fixează T* [NUM-7].
 * - GARDA `6·g_max < 1`: celula-cruce la c_aer 460 rămâne între vecini; la 200 (refuzată de content) diverge [NUM-8].
 * - OAMENII pe hârtie: W întregi pe nod, o singură conversie; în tocul ușii sau afară, nimic; căldura merge în componenta
 *   de DUPĂ lotul tickului (B4 F5).
 * - SCENARIUL STANDARD (K05): 0 componente în fiecare tick, contoarele pasului 0 [B4].
 * - CALIBRAREA pe pasul real: τ la o perturbație == τ_loc = C/ΣG.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { maseTermice, parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { componentaLa } from '../src/sim/camere.ts'
import { runScenario, standardScenario } from '../src/harness/scenario.ts'
import { buildM10PeLume } from '../src/harness/fixture-m10.ts'
import { Faction } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { fill, groundLevelM } from '../src/sim/terrain/terrain.ts'
import { regimPermanent } from '../src/sim/termic.ts'
import { MOTIV_TAIERE, pasTermic, PRAG_NUMBER, statTermic, T_SIGURANTA } from '../src/sim/temperatura.ts'
import { createWorld, tick } from '../src/sim/world.ts'
import { casaTermica, compLa, modelFloat, tauLoc } from './fixturi-temperatura.ts'
import { avanseazaTermic, bun, cruce, energia, faraInvarianti, grafLumii, hotel, laEchilibru, mina192, pasReferinta, tPeAncora } from './fixturi-pas.ts'
import { R } from './fixturi.ts'

const Q = 65536
const TPS = R.ticksPerSecond

/** Max |T_pas − T_regim| (Q16) după `pasi` pași la tickul fix `tk`, pornit din echilibru. */
function abatereaPunctuluiFix(w: World, tk: number, pasi: number): number {
  laEchilibru(w, tk)
  const reg = bun(regimPermanent(w, R, tk), 'regim')
  for (let p = 0; p < pasi; p++) pasTermic(w, R)
  let max = 0
  for (let i = 0; i < reg.graf.n; i++) max = Math.max(max, Math.abs(w.temperatura.slot.t[reg.graf.comp[i]!]! - reg.t[i]!))
  faraInvarianti(w, `tickul ${tk}`)
  return max
}

/** Un pion în casă (celula de referință), fără să mai pășească: pasul îl citește la fiecare pas. */
function pionInCasa(s: ReturnType<typeof casaTermica>, cheie = 'casa'): void {
  const [x, y, z] = s.rep[cheie]!
  assert.ok(applyCommand(s.w, { kind: 'spawnAgent', x: x * 1000 + 500, y: y * 1000 + 500, z, faction: Faction.ASEZARE }, R).ok)
}

test('PAS punctul fix: rezervoarele inghetate (acelasi tick), 20.000 de pasi din echilibru — T ramane la ±2 Q16 de regimul permanent pe casa, etaj, pivnita, golul usii; hotelul 10x10x4 (camere interioare) la ±2^7', () => {
  // Măsurat (tickurile 0, 200.000, 400.000): 0–1 Q16 pe toate casele; hotelul: vezi mai jos. Fără inerție, fără oameni,
  // punctul fix al pasului e regimul permanent (B3 §4), cu banda rotunjirii pe muchie.
  for (const o of [{}, { etaj: true }, { k: 1 }, { k: 1, etaj: true }, { gol: true }]) {
    for (const tk of [0, 200000, 400000]) {
      const d = abatereaPunctuluiFix(casaTermica(o).w, tk, 20000)
      assert.ok(d <= 2, `${JSON.stringify(o)} la tickul ${tk}: ${d} Q16`)
    }
  }
  const dh = abatereaPunctuluiFix(hotel(10, 4), 400000, 20000)
  assert.ok(dh <= 128, `hotelul: ${dh} Q16`)
})

test('PAS Number == BigInt (comutatorul pragBigInt = 0: toate nodurile si muchiile pe BigInt) — casa cu etaj si pivnita (un pion in casa) un an, M10 o zi — bit cu bit; ΔΣH == ΣF_r + ΣP la fiecare pas', () => {
  // Casa cu etaj și pivniță (3 noduri), un an de joc (32.256 de pași), cu un pion în casă.
  const sa = casaTermica({ k: 1, etaj: true })
  const sb = casaTermica({ k: 1, etaj: true })
  pionInCasa(sa)
  pionInCasa(sb)
  const a = laEchilibru(sa.w, 0)
  const b = laEchilibru(sb.w, 0)
  b.temperatura.pragBigInt = 0
  let abateri = 0
  let cuOameni = 0
  for (let tk = 0; tk < 32256 * TPS; tk += TPS) {
    a.tick = tk
    b.tick = tk
    const h0 = energia(a)
    const r = pasTermic(a, R)!
    const rb = pasTermic(b, R)!
    if (energia(a) - h0 !== BigInt(r.sumaFr + r.sumaP)) abateri++
    if (tk === 0) assert.ok(rb.muchiiBigInt > 0 && rb.noduriBigInt === 3, `comutatorul trece si muchiile pe BigInt: ${JSON.stringify(rb)}`)
    if (r.sumaP > 0) cuOameni++
    if (tk % (2016 * TPS) === 0) assert.deepEqual(tPeAncora(a), tPeAncora(b), `tickul ${tk}`)
  }
  assert.deepEqual(tPeAncora(a), tPeAncora(b), 'la capatul anului')
  assert.equal(abateri, 0, 'energia: ΔΣH == ΣF_r + ΣP')
  assert.equal(cuOameni, 32256, 'fixtura: pionul incalzeste la fiecare pas')
  assert.equal(statTermic(b).pasiBigInt, 32256, 'comutatorul: toti pasii pe BigInt')
  assert.equal(statTermic(a).pasiBigInt, 0, 'casa sta pe Number')
  // M10 (677 de noduri), o zi, din aceeași stare: Number, apoi totul pe BigInt.
  const m = createWorld(20260913)
  assert.ok(applyCommand(m, { kind: 'setFocus', cx: 300, cy: 300 }).ok)
  buildM10PeLume(m, R, 300, 300)
  const sl = m.temperatura.slot
  const init = [Float64Array.from(sl.t), Float64Array.from(sl.rest)] as const
  const rez: string[][] = []
  for (const prag of [PRAG_NUMBER, 0]) {
    sl.t.set(init[0])
    sl.rest.set(init[1])
    m.temperatura.pragBigInt = prag
    for (let k = 0; k < 2016; k++) {
      m.tick = 300000 + k * TPS
      const h0 = energia(m)
      const r = pasTermic(m, R)!
      assert.equal(energia(m) - h0, BigInt(r.sumaFr + r.sumaP), `M10, pasul ${k}`)
    }
    // PAS-6: cu pragul 2^53 − 2^17, hub-ul M10 (S·M ≈ 1,39·2^52) merge pe Number — comparația cu BigInt de mai jos e deci
    // chiar pe calea Number a hub-ului (cu 2^52 era pe BigInt la fiecare pas, iar comparația îl compara cu el însuși).
    if (prag === PRAG_NUMBER) assert.equal(statTermic(m).noduriBigInt, 0, 'M10: hub-ul pe Number (PAS-6)')
    rez.push(tPeAncora(m))
  }
  assert.deepEqual(rez[1], rez[0], 'M10: dupa o zi, Number == BigInt')
  faraInvarianti(m, 'M10')
})

test('PAS marginea dinamica (§5.3, NUM-5): mina 192x192x3 (un nod, Σg ≈ 2^34) trece singura pe BigInt la pas — pasiBigInt > 0 — si da acelasi rezultat ca totul pe BigInt; o casa la 30.000 °C, la fel', () => {
  const a = laEchilibru(mina192(), 0)
  const b = laEchilibru(mina192(), 0)
  b.temperatura.pragBigInt = 0
  for (let k = 0; k < 2016; k++) {
    a.tick = k * TPS
    b.tick = k * TPS
    pasTermic(a, R)
    pasTermic(b, R)
  }
  assert.ok(statTermic(a).pasiBigInt > 0, `mina trebuie sa treaca singura pe BigInt: ${JSON.stringify(statTermic(a))}`)
  assert.deepEqual(tPeAncora(a), tPeAncora(b))
  // Marginea e pe |T*|, nu pe M (oamenii pot duce T peste marginea climei, B1 §2.8): o casă la 30.000 °C trece singură pe
  // BigInt. Măsurat (recenzia PAS-5): S = 4.847.393 (2^22,2), deci S·(M + |T*|) = 2^53,1 — nu 2^57, cum scria aici. Cu
  // marginea STATICĂ (S·M) nodul ar merge pe Number, iar rezultatul ar fi totuși IDENTIC bit cu bit (până la 140.000 °C,
  // |X| ≤ 2^55,3: eroarea lui X pe double dispare în rs(X, 2^16)) — marginea dinamică apără doar dincolo de rezerva de 2× a
  // pragului. Contractul pe care testul îl prinde e deci RUTAREA (nodul pe BigInt, numărat); sumele fluxurilor trebuie să
  // fie ale BigInt-ului total. Plasa de siguranță (PROV-1 b) taie apoi T-ul la 1000 °C, după calcul.
  const ca = laEchilibru(casaTermica().w, 0)
  const cb = laEchilibru(casaTermica().w, 0)
  cb.temperatura.pragBigInt = 0
  for (const w of [ca, cb]) for (const c of w.camere.comp.values()) w.temperatura.slot.t[c.id] = 30000 * Q + 12345
  const ra = pasTermic(ca, R)!
  const rb = pasTermic(cb, R)!
  assert.equal(ra.noduriBigInt, 1, 'casa fierbinte: nodul pe BigInt')
  assert.deepEqual([ra.sumaFr, ra.sumaP], [rb.sumaFr, rb.sumaP], 'fluxurile, inainte de plasa')
  assert.deepEqual([ra.taieri, rb.taieri], [1, 1], 'plasa de siguranta a taiat casa la 1000 °C')
  assert.deepEqual(tPeAncora(ca), tPeAncora(cb))
})

test('PAS pragul Number / BigInt (§5.3, PAS-6): 2^53 − 2^17 — un nod cu S·(M + |T*|) = cel mai mare multiplu de S sub prag sta pe Number, cu un Q16 mai mult trece pe BigInt; in ambele cazuri fluxurile == totul pe BigInt', () => {
  // S = Σ g pe pas spre rezervoare, calculat ca în referința independentă (fixturi-pas.ts: rs(G·num/den) pe BigInt), M =
  // marginea grafului; casa singură, fără oameni și fără muchii, deci T* = T (restul < C'). |T| = ⌊(prag − 1)/S⌋ − M pune
  // S·(M + |T|) ≤ prag − 1, iar |T| + 1 îl duce la ≥ prag. Pragul se ia de pe HÂRTIE (2^53 − 2^17), nu din PRAG_NUMBER: testul
  // fixează VALOAREA pragului prin rutare (un prag mai mic trece nodul de jos pe BigInt, unul mai mare îl lasă pe cel de sus pe
  // Number), nu doar faptul că rutarea urmează constanta — într-o fereastră de ±S în jurul lui (S ≈ 2^22 pe casă; cel mai mic S
  // al unui nod real e ~2^19,5, deci 2^53 însuși, aproape echivalent — exact până la colțul S = 0 —, nu se distinge).
  const PRAG = 9_007_199_254_609_920n
  const A = BigInt(R.ticksPerSecond * 86400 * R.termic.mase.aer)
  const B = BigInt(R.calendar.ziTicks * R.termic.cAerJPeK)
  const pentru = (sus: boolean, semn: 1 | -1): { r: NonNullable<ReturnType<typeof pasTermic>>; rb: NonNullable<ReturnType<typeof pasTermic>>; produs: bigint } => {
    const ca = laEchilibru(casaTermica().w, 0)
    const cb = laEchilibru(casaTermica().w, 0)
    cb.temperatura.pragBigInt = 0
    const g = grafLumii(ca)
    assert.equal(g.noduri.size, 1, 'fixtura: casa e un singur nod')
    const nod = [...g.noduri.values()][0]!
    let S = 0n
    for (const G of nod.bin.values()) S += (2n * BigInt(G) * A + B) / (2n * B)
    const M = BigInt(g.margineT)
    const t = (PRAG - 1n) / S - M + (sus ? 1n : 0n)
    for (const w of [ca, cb]) for (const c of w.camere.comp.values()) {
      w.temperatura.slot.t[c.id] = semn * Number(t)
      w.temperatura.slot.rest[c.id] = 0
    }
    return { r: pasTermic(ca, R)!, rb: pasTermic(cb, R)!, produs: S * (M + t) }
  }
  for (const semn of [1, -1] as const) {
    const jos = pentru(false, semn)
    const sus = pentru(true, semn)
    assert.ok(jos.produs < PRAG && sus.produs >= PRAG, `fixtura: ${jos.produs} < prag <= ${sus.produs}`)
    assert.equal(jos.r.noduriBigInt, 0, `semn ${semn}: sub prag, nodul pe Number`)
    assert.equal(sus.r.noduriBigInt, 1, `semn ${semn}: la prag, nodul pe BigInt`)
    for (const x of [jos, sus]) assert.deepEqual([x.r.sumaFr, x.r.sumaP], [x.rb.sumaFr, x.rb.sumaP], `semn ${semn}: fluxurile == totul pe BigInt`)
  }
})

test('PAS orientarea (§5.2, SAV-3): fluxul calculat din capatul b pe jumatate din muchii (alese pseudo-aleator) — identic bit cu bit pe M10, o zi (rs e impara)', () => {
  const m = createWorld(20260913)
  assert.ok(applyCommand(m, { kind: 'setFocus', cx: 300, cy: 300 }).ok)
  buildM10PeLume(m, R, 300, 300)
  const sl = m.temperatura.slot
  const init = [Float64Array.from(sl.t), Float64Array.from(sl.rest)] as const
  const jumatate = (a: number, b: number): boolean => ((Math.imul(a * 7919 + b, 2654435761) >>> 16) & 1) === 1
  const rez: string[][] = []
  for (const inverseaza of [undefined, jumatate]) {
    sl.t.set(init[0])
    sl.rest.set(init[1])
    for (let k = 0; k < 2016; k++) {
      m.tick = 300000 + k * TPS
      pasTermic(m, R, inverseaza === undefined ? {} : { inverseaza })
    }
    rez.push(tPeAncora(m))
  }
  assert.deepEqual(rez[1], rez[0])
})

test('PAS T* (§5.2, NUM-7): pasul == referinta independenta (BigInt, din nodurile grafului, T* = T dupa muchii si oameni) bit cu bit — casa cu etaj si pivnita, un pion in casa, 2.000 de pasi, cu o groapa sapata la jumatate', () => {
  const s = casaTermica({ k: 1, etaj: true })
  const r = casaTermica({ k: 1, etaj: true })
  pionInCasa(s)
  pionInCasa(r)
  laEchilibru(s.w, 300000)
  laEchilibru(r.w, 300000)
  const [cx, cy, cz] = s.rep.casa!
  for (let k = 0; k < 2000; k++) {
    s.w.tick = r.w.tick = 300000 + k * TPS
    // La jumătate, un lot (o comandă): graful se schimbă, iar pasul trebuie să-l vadă (modelul memorat al pasului se reface).
    if (k === 1000) for (const w of [s.w, r.w]) assert.ok(applyCommand(w, { kind: 'dig', wx: cx + 1, wy: cy + 1, z: cz - 1 }, R).ok)
    pasTermic(s.w, R)
    pasReferinta(r.w)
    if (k % 100 === 0 || k === 1000) assert.deepEqual(tPeAncora(s.w), tPeAncora(r.w), `pasul ${k}`)
  }
  assert.deepEqual(tPeAncora(s.w), tPeAncora(r.w))
  faraInvarianti(s.w, 'pasul')
})

test('PAS modelul memorat (PAS-2): un lot care nu atinge graful (o sapatura departe de orice incapere) nu reface modelul pasului; un lot care il atinge il reface o data — pasii == lumea geamana fara loturile departe, bit cu bit', () => {
  // Recenzia PAS-2: modelul era cheiat pe ștampila grafului, care se schimbă la ORICE lot cu editări — refăcut la 148/150 de
  // pași pe lărgire20, iar pe M10 cu un lot departe între pași pasul costa 346–367 µs p50 în loc de ~85. Cheia e acum
  // numărul de delte ale grafului (`GrafIncremental.delte`).
  // A: cu loturile departe; B: geamăna fără ele; C: geamăna pășită cu referința independentă (fără model), ca un model
  // rămas vechi după lotul din casă să se vadă pe VALORI, nu doar pe contor.
  const sa = casaTermica({ k: 1, etaj: true })
  const sb = casaTermica({ k: 1, etaj: true })
  const sc = casaTermica({ k: 1, etaj: true })
  pionInCasa(sa)
  pionInCasa(sb)
  pionInCasa(sc)
  const a = laEchilibru(sa.w, 300000)
  const b = laEchilibru(sb.w, 300000)
  const c = laEchilibru(sc.w, 300000)
  const [cx, cy, cz] = sa.rep.casa!
  const departe = (k: number): [number, number, number] => {
    const x = cx + 60 + (k % 10)
    const y = cy + 60 + Math.floor(k / 10)
    return [x, y, bun(groundLevelM(a.terrain, x, y), 'cota')]
  }
  const delte0 = grafLumii(a).delte
  for (let k = 0; k < 120; k++) {
    a.tick = b.tick = c.tick = 300000 + k * TPS
    if (k % 2 === 1) {
      const [x, y, z] = departe(k)
      const e0 = a.terrain.editari
      assert.ok(applyCommand(a, { kind: 'dig', wx: x, wy: y, z }, R).ok, `sapatura departe ${k}`)
      assert.ok(a.terrain.editari > e0, 'fixtura: lotul departe e un lot cu editari')
    }
    // La 100, un lot care ATINGE graful, în ambele lumi, fără să schimbe numărul de componente (altfel îl prinde și garda
    // `n == comp.size`, iar proba „delta nenumărată" ieșea RATATĂ cu groapa din podea, care unește casa cu pivnița): o
    // piatră pusă în casă — C' și fețele casei se schimbă, componentele rămân.
    if (k === 100) for (const w of [a, b, c]) {
      const n0 = w.camere.comp.size
      assert.ok(applyCommand(w, { kind: 'fill', wx: cx + 1, wy: cy + 1, z: cz, material: Material.PIATRA_CONSTRUITA }, R).ok, 'piatra in casa')
      assert.equal(w.camere.comp.size, n0, 'fixtura: aceleasi componente')
      assert.ok(grafLumii(w).delte > delte0, 'fixtura: lotul a atins graful (o delta)')
    }
    pasTermic(a, R)
    pasTermic(b, R)
    pasReferinta(c)
    assert.deepEqual(tPeAncora(a), tPeAncora(b), `pasul ${k}`)
    assert.deepEqual(tPeAncora(a), tPeAncora(c), `pasul ${k}: == referinta independenta`)
    if (k === 99) {
      assert.equal(grafLumii(a).delte, delte0, 'fixtura: cele 50 de loturi departe n-au atins graful')
      assert.deepEqual([statTermic(a).modeleRefacute, statTermic(b).modeleRefacute], [1, 1], 'modelul: construit o data, nerefacut de loturile departe')
    }
  }
  assert.deepEqual([statTermic(a).modeleRefacute, statTermic(b).modeleRefacute], [2, 2], 'lotul din casa reface modelul o data')
  faraInvarianti(a, 'cu loturile departe')
  faraInvarianti(b, 'geamana')
})

/** Regulile cu c_aer dat și fără masă pe fețe (C' = V): celula-cruce stă atunci exact la marginea gărzii. */
function faraMasa(cAer: number): Rules {
  const t = { ...R.termic, cAerJPeK: cAer, cConstrJPeK: 0, cSolJPeK: 0 }
  return { ...R, termic: { ...t, mase: maseTermice(cAer, 0, 0) } }
}

test('PAS garda 6·g_max < 1 (NUM-8): celula-cruce fara masa pe fete, +10 °C — la c_aer 460 (garda trece) ramane intre rezervoare si vecini; la 200 (garda refuza) oscileaza si diverge pana la plasa de siguranta (±1000 °C), care o taie la fiecare pas, numarat', () => {
  assert.ok(parseRules(faraMasa(460)).ok, 'c_aer 460: garda trece')
  assert.ok(!parseRules(faraMasa(200)).ok, 'c_aer 200: garda refuza')
  for (const [cAer, stabil] of [[460, true], [200, false]] as const) {
    const rules = faraMasa(cAer)
    const { w, c } = cruce(rules)
    laEchilibru(w, 300000, rules)
    const id = componentaLa(w.camere, ...c)!.id
    const t0 = w.temperatura.slot.t[id]!
    w.temperatura.slot.t[id] = t0 + 10 * Q
    let semne = 0
    let prec = 10 * Q
    let max = 0
    for (let k = 0; k < 2000 && statTermic(w).invarianti === 0; k++) {
      pasTermic(w, rules)
      const d = w.temperatura.slot.t[id]! - t0
      // O schimbare de semn peste banda rotunjirii (±4 Q16 în jurul echilibrului e zgomotul întregilor, nu o oscilație).
      if (Math.abs(d) > 4) {
        if (Math.sign(d) !== Math.sign(prec)) semne++
        prec = d
      }
      max = Math.max(max, Math.abs(d))
    }
    if (stabil) {
      faraInvarianti(w, `c_aer ${cAer}`)
      assert.equal(semne, 0, `c_aer ${cAer}: ${semne} schimbari de semn`)
      assert.ok(max <= 10 * Q, `c_aer ${cAer}: |ΔT| a crescut la ${max / Q} °C`)
    } else {
      // Divergența: oscilație cu amplitudine crescătoare (măsurat: 11 schimbări de semn de la +10 la ±1000 °C), până la plasa
      // de siguranță (PROV-1 b), care taie T-ul la ±1000 °C după pas — numărat, nu aruncă din tick. Înainte de plasă, T
      // ajungea până la ieșirea din întregii siguri, unde pasul se refuza (garda aceea are acum testul ei, mai jos).
      assert.ok(semne >= 8 && max > 990 * Q, `c_aer ${cAer}: ${semne} schimbari de semn, max ${max / Q} °C — garda refuza un pas instabil`)
      assert.equal(statTermic(w).ultimulInvariant, MOTIV_TAIERE)
      const t0Taieri = statTermic(w).taieri
      assert.ok(t0Taieri >= 1)
      for (let k = 0; k < 200; k++) {
        assert.doesNotThrow(() => pasTermic(w, rules))
        assert.ok(Math.abs(w.temperatura.slot.t[id]!) <= T_SIGURANTA, `pasul ${k}: T ${w.temperatura.slot.t[id]! / Q} °C peste plasa`)
      }
      assert.ok(statTermic(w).taieri > t0Taieri, 'plasa taie la fiecare pas cat timp diverge')
      assert.doesNotThrow(() => tick(w, rules))
    }
  }
})

test('PAS T in afara intregilor siguri (§5.3): o stare stricata (T = 2^60 pe casa, peste orice pas) — pasul se refuza intreg, nu scrie nimic (nici taierea plasei), numarat, si nu arunca din tick', () => {
  // Plasa de siguranță (±1000 °C) taie un T fizic divergent înainte să iasă din întregii siguri; garda asta rămâne pentru o
  // stare stricată (o salvare veche, o scriere greșită): un T nesigur nu se poate calcula exact, deci pasul nu scrie nimic.
  const s = casaTermica()
  const w = laEchilibru(s.w, 0)
  const c = componentaLa(w.camere, ...s.rep.casa!)!.id
  w.temperatura.slot.t[c] = 2 ** 60
  w.temperatura.slot.rest[c] = 0
  assert.equal(pasTermic(w, R), null)
  assert.equal(statTermic(w).ultimulInvariant, 'T iese din intregii siguri')
  assert.equal(statTermic(w).taieri, 0, 'nimic scris, nimic taiat')
  assert.equal(w.temperatura.slot.t[c], 2 ** 60, 'starea neatinsa')
  assert.doesNotThrow(() => tick(w, R))
})

test('PAS oamenii pe hartie (§5.1, B4): un pion in casa da ΣP = rs(100·2^16·tps·86.400·16 / (ziTicks·c_aer)) pe pas; doi pioni, o conversie pe 200 W; in tocul usii sau afara, nimic', () => {
  const caldura = (W: number): number => Number((2n * BigInt(W) * 65536n * BigInt(TPS * 86400 * 16) + BigInt(R.calendar.ziTicks * R.termic.cAerJPeK)) / (2n * BigInt(R.calendar.ziTicks * R.termic.cAerJPeK)))
  const s = casaTermica()
  laEchilibru(s.w, 0)
  const [x, y, z] = s.rep.casa!
  const pion = (px: number, py: number, pz: number): void => {
    assert.ok(applyCommand(s.w, { kind: 'spawnAgent', x: px * 1000 + 500, y: py * 1000 + 500, z: pz, faction: Faction.ASEZARE }, R).ok)
  }
  assert.equal(pasTermic(s.w, R)!.sumaP, 0, 'fara pioni')
  // În tocul ușii (USA, la mijlocul peretelui de sud): nu e aer acoperit, deci nicio componentă.
  pion(s.x0 + 3, s.y0, z)
  assert.equal(componentaLa(s.w.camere, s.x0 + 3, s.y0, z), null, 'fixtura: tocul usii nu e aer acoperit')
  // Afară, pe sol.
  pion(s.x0 - 1, s.y0 - 1, s.g + 1)
  assert.equal(pasTermic(s.w, R)!.sumaP, 0, 'in tocul usii si afara: nimic')
  pion(x, y, z)
  assert.equal(pasTermic(s.w, R)!.sumaP, caldura(100), 'un pion')
  pion(x + 1, y, z)
  assert.equal(pasTermic(s.w, R)!.sumaP, caldura(200), 'doi pioni: o conversie pe nod')
  assert.notEqual(caldura(200), 2 * caldura(100), 'fixtura: rotunjirea pe pion ar da altceva')
  assert.equal(statTermic(s.w).adunariOameni, 2)
  faraInvarianti(s.w, 'oamenii')
})

test('PAS oamenii dupa lot (B4 F5): un zid ridicat in tickul pasului desparte camera pionului — caldura intra in jumatatea lui, cealalta nu primeste nimic; pasul vede indexul de dupa lot', () => {
  // Două lumi identice, una fără pion: diferența de T e doar căldura omului.
  const lumi = [casaTermica({ L: 7 }), casaTermica({ L: 7 })]
  const [x, y, z] = lumi[0]!.rep.casa!
  assert.ok(applyCommand(lumi[0]!.w, { kind: 'spawnAgent', x: (x - 2) * 1000 + 500, y: y * 1000 + 500, z, faction: Faction.ASEZARE }, R).ok)
  for (const s of lumi) {
    laEchilibru(s.w, 100 * TPS)
    // Zidul (pe x, prin toată casa) intră în lotul tickului care pășește (w.tick % tps === 0): ca o editare a unui pion
    // din `stepAgents`, sincronizată la capătul tickului, înaintea pasului.
    for (let dy = 1; dy <= 7; dy++) for (const zz of [z, z + 1]) assert.ok(fill(s.w.terrain, x, s.y0 + dy, zz, Material.PIATRA_CONSTRUITA).ok)
    tick(s.w, R)
    assert.equal(statTermic(s.w).pasi, 1, 'fixtura: tickul lotului e un tick de pas')
    faraInvarianti(s.w, 'zidul')
  }
  const [cu, fara] = lumi.map((s) => s.w)
  const ap = componentaLa(cu!.camere, cellOf(cu!.agents.x[0]!), cellOf(cu!.agents.y[0]!), cu!.agents.z[0]!)
  assert.ok(ap !== null && ap.ancora === componentaLa(cu!.camere, x - 2, y, z)!.ancora, 'fixtura: pionul a ramas in jumatatea de vest')
  const est = componentaLa(cu!.camere, x + 2, y, z)!
  const tVest = (w: World): number => w.temperatura.slot.t[componentaLa(w.camere, x - 2, y, z)!.id]! * 1e6 + w.temperatura.slot.rest[componentaLa(w.camere, x - 2, y, z)!.id]!
  assert.ok(tVest(cu!) > tVest(fara!), 'jumatatea pionului s-a incalzit')
  const tEst = (w: World): string => `${w.temperatura.slot.t[componentaLa(w.camere, x + 2, y, z)!.id]}:${w.temperatura.slot.rest[componentaLa(w.camere, x + 2, y, z)!.id]}`
  assert.equal(tEst(cu!), tEst(fara!), 'cealalta jumatate n-a primit nimic')
  assert.notEqual(est.id, ap.id)
})

test('PAS scenariul standard (K05, B4): 100.000 de tickuri, 40 de pioni — 0 componente in FIECARE tick, iar pasul nu face nimic (contoarele 0, nici rezervoarele citite)', () => {
  const s = standardScenario(12345, 100000, 40)
  const w = createWorld(s.seed)
  const cmd = [...(s.commands ?? [])].map((c, i) => ({ c, i })).sort((a, b) => a.c.tick - b.c.tick || a.i - b.i).map((e) => e.c)
  let next = 0
  let cuComponente = 0
  for (let t = 0; t < s.ticks; t++) {
    while (next < cmd.length && cmd[next]!.tick === w.tick) applyCommand(w, cmd[next++]!.cmd, R)
    tick(w, R)
    if (w.camere.comp.size !== 0) cuComponente++
  }
  assert.equal(cuComponente, 0, 'tickuri cu cel putin o componenta')
  const st = statTermic(w)
  assert.deepEqual([st.pasi, st.pasiBigInt, st.oameniCautati, st.adunariOameni, st.rezervoareCitite, st.loturi, st.invarianti], [0, 0, 0, 0, 0, 0, 0])
  assert.ok(w.terrain.editari > 100, 'fixtura: scenariul sapa (119 editari)')
  assert.equal(runScenario(standardScenario(12345, 2000, 40)).world.camere.comp.size, 0)
})

test('PAS calibrarea pe pasul real (§4): τ la o perturbatie de +10 °C (rezervoarele inghetate) == τ_loc = C/ΣG — casa, golul usii, pivnitele ±2%, etajul (vecinul liber) ±5%', () => {
  // Măsurat: casa 3,583 h (τ_loc 3,576), golul 0,929 (0,917), etajul 4,167 (4,026), pivnița sub casă cu 1 m 1,497 z (1,485),
  // pivnița fără casă cu 3 m 1,234 z (1,233).
  const dt = (TPS * 86400) / R.calendar.ziTicks
  for (const [o, cheie, tol] of [[{}, 'casa', 0.02], [{ gol: true }, 'casa', 0.02], [{ etaj: true }, 'etaj', 0.05], [{ k: 1 }, 'pivnita', 0.02], [{ k: 3, faraCasa: true }, 'pivnita', 0.02]] as const) {
    const s = casaTermica(o)
    laEchilibru(s.w, 300000)
    for (let p = 0; p < 5000; p++) pasTermic(s.w, R)
    const c = compLa(s, cheie)
    const t0 = s.w.temperatura.slot.t[c]!
    s.w.temperatura.slot.t[c] = t0 + 10 * Q
    let pasi = 0
    while (s.w.temperatura.slot.t[c]! - t0 > (10 * Q) / Math.E && pasi < 100000) {
      pasTermic(s.w, R)
      pasi++
    }
    const tau = pasi * dt
    const loc = tauLoc(modelFloat(s.w, R), c)
    assert.ok(Math.abs(tau / loc - 1) <= tol, `${JSON.stringify(o)}: τ pe pas ${(tau / 3600).toFixed(3)} h, τ_loc ${(loc / 3600).toFixed(3)} h`)
    if (cheie === 'casa' && !('gol' in o)) assert.ok(tau >= 3 * 3600 && tau <= 8 * 3600, `casa: ${tau / 3600} h`)
  }
})

test('PAS avansul termic: o lume fara pioni si fara editari, avansata doar termic, e la fel ca avansata cu tick', () => {
  const a = laEchilibru(casaTermica({ k: 1 }).w, 0)
  const b = laEchilibru(casaTermica({ k: 1 }).w, 0)
  assert.equal(avanseazaTermic(a, 2000), 100)
  for (let k = 0; k < 2000; k++) tick(b, R)
  assert.deepEqual(tPeAncora(a), tPeAncora(b))
})

function cellOf(mm: number): number {
  return Math.floor(mm / 1000)
}
