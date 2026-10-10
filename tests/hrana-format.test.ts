/**
 * Hrana sub 5 °C (S24-27 t.3), commit-ul A: FORMATUL alterarii, neutru (rata e 0 peste tot, nimic nu se strica singur).
 * research/hrana-t3.md §1 (starea si caile), §4 (oracolele), §7 (salvarea), §9 (portile).
 *
 * Cu rata 0, S-ul nu apare din simulare: il SCRIU testele, pe mormane si in maini, iar portile verifica ce fac caile cu
 * el — despartirea, unirea, mana, mutarea, mancatul, pierderea, salvarea. Scenariul standard e orb aici (toata hrana lui
 * are aceeasi varsta, nimic nu cade, nimeni nu moare cu marfa in mana: H1 §3.1), deci fiecare poarta are scena ei, care
 * atinge DEVREME si IN AFARA grilei de 1 Hz caile pe care le pretinde, cu contoare de viata.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { advance, tick } from '../src/sim/world.ts'
import { FelJob, Item, NEVOI, Nevoie, PasCara, Piesa, SCHEMA_VERSION } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { asazaItem, creeazaItem, itemLaCelula, nutritieEfectiva, ONE_ALTERARE, parteDinAlterare, scadeStricate, slotItem, stergeItem, unitatiPentruNutritie } from '../src/sim/iteme.ts'
import { lastJobReport } from '../src/sim/joburi.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { celulaDeZonaLa } from '../src/sim/zone.ts'
import { parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { Reason } from '../src/sim/result.ts'
import { laSit, lasaItem, patratPlat, picteaza, R, sitPlat, solid, solidLaDistanta } from './fixturi.ts'

const ONE = ONE_ALTERARE
const H = Item.HRANA

/** Σ S si Σ unitati de HRANA, pe mormanele vii si in mainile tuturor sloturilor. */
function sume(w: World): { S: number; u: number } {
  let S = 0
  let u = 0
  const it = w.iteme
  for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && it.kind[i] === H) { S += it.alterare[i]!; u += it.cantitate[i]! }
  const a = w.agents
  for (let i = 0; i < a.count; i++) if (a.caraKind[i] === H && a.caraCantitate[i]! > 0) { S += a.caraAlterare[i]!; u += a.caraCantitate[i]! }
  return { S, u }
}

/** Un generator determinist pentru S-urile scrise de teste (fara RNG-ul lumii: testul nu are voie sa-l consume). */
function lcg(seed: number): () => number {
  let x = seed >>> 0
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0
    return x / 4294967296
  }
}

/** Scrie pe morman o alterare in plus: o fractiune din cat permit `cate` unitati noi, fara sa treaca de invariant. Intoarce cat a scris. */
function scrieS(w: World, slot: number, cate: number, frac: number): number {
  const loc = w.iteme.cantitate[slot]! * (ONE - 1) - w.iteme.alterare[slot]!
  const extra = Math.floor(Math.min(loc, cate * (ONE - 1)) * frac)
  w.iteme.alterare[slot] = w.iteme.alterare[slot]! + extra
  return extra
}

// ---------------------------------------------------------------------------
// aritmetica: o functie pe fapt
// ---------------------------------------------------------------------------

test('parteDinAlterare: proprietatea pe 200.000 de trageri, cu BigInt — parte·q ≤ S·k si S·k − parte·q < q; toata la k ≥ q, nimic la k ≤ 0', () => {
  const r = lcg(20261010)
  let peste53 = 0
  for (let n = 0; n < 200000; n++) {
    // q pana la itemStackMax maxim (10^6), S pana la invariantul q·(ONE − 1): produsul S·k trece de 2^53.
    const q = 1 + Math.floor(r() * (n % 4 === 0 ? 1_000_000 : 75))
    const S = Math.floor(r() * q * (ONE - 1))
    const k = Math.floor(r() * (q + 2)) - 1
    const parte = parteDinAlterare(S, q, k)
    if (k >= q) { assert.equal(parte, S); continue }
    if (k <= 0) { assert.equal(parte, 0); continue }
    if (S * k > 2 ** 53) peste53++
    const Sk = BigInt(S) * BigInt(k)
    const pq = BigInt(parte) * BigInt(q)
    assert.ok(Number.isSafeInteger(parte) && parte >= 0, `parte ${parte}`)
    assert.ok(pq <= Sk, `S ${S} q ${q} k ${k}: parte·q ${pq} > S·k ${Sk}`)
    assert.ok(Sk - pq < BigInt(q), `S ${S} q ${q} k ${k}: S·k − parte·q = ${Sk - pq} ≥ q`)
  }
  assert.ok(peste53 > 1000, `doar ${peste53} trageri cu S·k peste 2^53: proba nu atinge depasirea`)
})

test('nutritia pe hartie (verif-P7, recalculat cu ONE = 2^29 si ceil): q = 30, S = 7·2^29 + 7 → 229 apoi 114; q = 1, S = ONE − 1 → 0; control S = 0 → 300 + 150', () => {
  // Pe HARTIE, nu cu formula din cod (nut = 15, portie = 20, deci 20 + 10 unitati):
  //   S = 3.758.096.391 = 7·2^29 + 7; S mod 30 = 21, deci termenul de rest al despartirii conteaza.
  //   imbucatura 1: parte = floor(S·20/30) = 2.505.397.594; parte·15 = 37.580.963.910 = 70·2^29 + 70 ⇒ ceil = 71 ⇒ 300 − 71 = 229
  //   imbucatura 2: S ramas = 1.252.698.797; ·15 = 18.790.481.955 = 35·2^29 + 35 ⇒ ceil = 36 ⇒ 150 − 36 = 114
  //   q = 1, S = 2^29 − 1: (2^29 − 1)·15 = 15·2^29 − 15 ⇒ ceil = 15 ⇒ 15 − 15 = 0 (mancatorul nu castiga restul)
  // Mutantii familiei (verif-P7, recalculati): floor 230/115 si 1; nereduse 300/150 si 15; S-ul intreg 194; S-ul ramas
  // 264/150; partea fara rest 230; trunchierea pe unitate 240/120 — toti difera de 229/114/0.
  // Scurgerea FOAMEI e 0, ca diferenta de FOAME pe tickul imbucaturii sa fie EXACT creditul.
  const fara: Rules = { ...R, nevoi: R.nevoi.map((n, i) => (i === Nevoie.FOAME ? { ...n, scurgere: 0 } : n)) }
  assert.equal(ONE, 536870912, 'ONE nu e 2^29: valorile de pe hartie nu mai sunt valabile')
  function caz(q: number, S: number): { luat: number; dF: number }[] {
    const { w, wx, wy, g } = sitPlat(7, 12)
    const o = applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 2) * 1000 + 500, z: g + 1, faction: 0 }, fara)
    assert.ok(o.ok)
    const F = 0 * NEVOI + Nevoie.FOAME
    w.agents.nevoi[F] = 100
    assert.ok(applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: q, wx: wx + 6, wy: wy + 6, z: g + 1 }, fara).ok)
    const is = itemLaCelula(w.iteme, wx + 6, wy + 6, g + 1)
    w.iteme.alterare[is] = S
    const imb: { luat: number; dF: number }[] = []
    for (let t = 0; t < 6000 && w.iteme.alive[is] === 1; t++) {
      const f0 = w.agents.nevoi[F]!
      const q0 = w.iteme.cantitate[is]!
      tick(w, fara)
      const q1 = w.iteme.alive[is] === 1 ? w.iteme.cantitate[is]! : 0
      if (q1 < q0) imb.push({ luat: q0 - q1, dF: w.agents.nevoi[F]! - f0 })
    }
    return imb
  }
  assert.deepEqual(caz(30, 3758096391), [{ luat: 20, dF: 229 }, { luat: 10, dF: 114 }])
  assert.deepEqual(caz(1, ONE - 1), [{ luat: 1, dF: 0 }])
  assert.deepEqual(caz(30, 0), [{ luat: 20, dF: 300 }, { luat: 10, dF: 150 }])
  // Si functia, pe aceleasi cifre (fara mancator), si la maximele content-ului (portie 10^6, nutritie 10^4), unde produsul
  // naiv parte·nut ar fi 5,4e18: la S = q·(ONE − 1) valoarea e q/ONE, deci creditul e floor(10^10 / 2^29) = 18.
  assert.equal(nutritieEfectiva(20, 2505397594, 15), 229)
  assert.equal(nutritieEfectiva(1_000_000, 1_000_000 * (ONE - 1), 10_000), 18)
})

test('cautaMancare pe VALOARE: q = 75 cu S = 30·ONE si o lipsa de 610 rezerva 68 de unitati (pe hrana proaspata 41)', () => {
  // Pe hartie: k = 68 ⇒ parte = floor(30·ONE·68/75) = 14.602.888.806, ·15 = 219.043.332.090 < 408·2^29 ⇒ ceil 408,
  // 1020 − 408 = 612 ≥ 610; k = 67 ⇒ parte = 14.388.140.441, ·15/2^29 = 401,99… ⇒ 402, 1005 − 402 = 603 < 610.
  // Proaspat: ceil(610/15) = 41. Scurgerea FOAMEI 0, ca lipsa sa fie exact 610 la scanare.
  const fara: Rules = { ...R, nevoi: R.nevoi.map((n, i) => (i === Nevoie.FOAME ? { ...n, scurgere: 0 } : n)) }
  assert.equal(unitatiPentruNutritie(30 * ONE, 75, 15, 610), 68)
  assert.equal(unitatiPentruNutritie(0, 75, 15, 610), 41)
  assert.equal(unitatiPentruNutritie(30 * ONE, 75, 15, 0), 0, 'fara lipsa, nimic (ca formula veche)')
  for (const [S, asteptat] of [[30 * ONE, 68], [0, 41]] as const) {
    const { w, wx, wy, g } = sitPlat(7, 12)
    assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 2) * 1000 + 500, z: g + 1, faction: 0 }, fara).ok)
    w.agents.nevoi[0 * NEVOI + Nevoie.FOAME] = 390
    assert.ok(applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 75, wx: wx + 6, wy: wy + 6, z: g + 1 }, fara).ok)
    w.iteme.alterare[itemLaCelula(w.iteme, wx + 6, wy + 6, g + 1)] = S
    let rezervat = -1
    for (let t = 0; t < 400 && rezervat === -1; t++) {
      tick(w, fara)
      if (w.agents.jobKind[0] === FelJob.MANANCA) rezervat = w.agents.jobCantitate[0]!
    }
    assert.equal(rezervat, asteptat, `S = ${S}`)
  }
})

test('scadeStricate: k unitati pleaca cu EXACT k·ONE din S (nu cu regula despartirii), numarate in hranaStricata; k peste floor(S/ONE) se taie', () => {
  const { w, wx, wy, g } = sitPlat(7, 12)
  assert.ok(applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 10, wx: wx + 3, wy: wy + 3, z: g + 1 }, R).ok)
  const is = itemLaCelula(w.iteme, wx + 3, wy + 3, g + 1)
  w.iteme.alterare[is] = 3 * ONE + 5
  // Regula despartirii ar lua doar floor(S·3/10) = 0,9·ONE si ar lasa S ≥ 2·ONE: alta unitate la pasul urmator (STARE-4).
  assert.equal(scadeStricate(w, R, is, 3), 7)
  assert.deepEqual([w.iteme.cantitate[is], w.iteme.alterare[is], w.hranaStricata], [7, 5, 3])
  // Mai mult decat s-a strans nu se strica: S nu ajunge negativ.
  assert.equal(scadeStricate(w, R, is, 4), 7)
  assert.deepEqual([w.iteme.cantitate[is], w.iteme.alterare[is], w.hranaStricata], [7, 5, 3])
  // Moartea din stricaciune (cu o rata, la commit-ul B): q = 2, S = 2·ONE + 9 ⇒ moare, restul de 9 iese numarat.
  w.iteme.cantitate[is] = 2
  w.iteme.alterare[is] = 2 * ONE + 9
  const disparutInainte = w.ratiune.alterareDisparuta
  assert.equal(scadeStricate(w, R, is, 2), 0)
  assert.equal(w.iteme.alive[is], 0)
  assert.equal(w.iteme.alterare[is], 0)
  assert.equal(w.ratiune.alterareDisparuta - disparutInainte, 9)
  assert.equal(w.hranaStricata, 5)
})

test('stergeItem pune alterarea pe 0: un slot mort nu tine stare, iar creeazaItem scrie starea adusa, nu o aduna', () => {
  const { w, wx, wy, g } = sitPlat(7, 12)
  const o = creeazaItem(w.iteme, w.nextId++, H, wx + 3, wy + 3, g + 1, 10, 4 * ONE)
  assert.ok(o.ok)
  const slot = o.ok ? o.value : -1
  stergeItem(w.iteme, slot)
  assert.equal(w.iteme.alterare[slot], 0)
  const o2 = creeazaItem(w.iteme, w.nextId++, H, wx + 4, wy + 3, g + 1, 5, 7)
  assert.ok(o2.ok && o2.value === slot, 'slotul mort se refoloseste')
  assert.equal(w.iteme.alterare[slot], 7)
})

test('asazaItem: o portiune refuzata pe capacitate nu-si pierde partea — se scade din sursa abia DUPA ce portiunea a intrat', () => {
  // Store-ul plin: celula data e goala, `creeazaItem` refuza (capacitate), iar marfa intra pe vecinul (+1, 0), unde e un
  // morman de HRANA cu loc. Toata alterarea mainii trebuie sa ajunga acolo.
  const mic: Rules = { ...R, itemCapacity: 3 }
  const { w, wx, wy, g } = sitPlat(7, 12)
  for (const [dx, fel, q] of [[1, H, 10], [5, Item.PIATRA, 5], [7, Item.PIATRA, 5]] as const) {
    assert.ok(applyCommand(w, { kind: 'lasaItem', fel, cantitate: q, wx: wx + dx, wy: wy + 3, z: g + 1 }, mic).ok)
  }
  w.iteme.capacity = 3
  assert.equal(w.iteme.vii, 3)
  const vecin = itemLaCelula(w.iteme, wx + 1, wy + 3, g + 1)
  w.iteme.alterare[vecin] = 1000
  const S = 20 * (ONE - 1) - 12345
  const r = asazaItem(w, mic, H, 20, wx, wy + 3, g + 1, 0, S)
  assert.equal(r.pus, 20)
  assert.equal(itemLaCelula(w.iteme, wx, wy + 3, g + 1), -1, 'fixtura: celula data a ramas goala (capacitatea)')
  assert.equal(w.iteme.cantitate[vecin], 30)
  assert.equal(w.iteme.alterare[vecin], 1000 + S)
  assert.equal(w.ratiune.alterarePierduta, 0)
})

// ---------------------------------------------------------------------------
// G1S + G1, la fiecare tick, cu baza la pornire si dupa decode
// ---------------------------------------------------------------------------

interface Evenimente { injectii: number; ucisi: number; abandonuri: number; sapat: number; realizari: number; incarcari: number; nasteri: number; lasari: number; mancateCuS: number; mancate: number }

test('G1S + G1 la FIECARE tick: Σ S scris + acumulat == Σ S + ONE·stricat + mancat + pierdut + disparut, si unitatile pe fel — cu ucideri cu marfa, abandon, sapat sub morman, mormane de 1 u, salvare, toate devreme si in afara grilei de 1 Hz', () => {
  const ev: Evenimente = { injectii: 0, ucisi: 0, abandonuri: 0, sapat: 0, realizari: 0, incarcari: 0, nasteri: 0, lasari: 0, mancateCuS: 0, mancate: 0 }
  for (const seed of [8801, 4242]) {
    const r = lcg(seed)
    const { w: w0, sit } = laSit(seed, 6)
    let w = w0
    let zona = picteaza(w, sit.wx + 2, sit.wy + 3, 3)
    // Registrele testului: ce a PUS (unitati) si ce a SCRIS (S) — singurele intrari in lume, la rata 0.
    let puse = 0
    let scris = 0
    const pune = (fel: number, q: number, wx: number, wy: number, frac: number): number => {
      const g = solid(w, wx, wy)
      if (g === null) return -1
      const o = applyCommand(w, { kind: 'lasaItem', fel, cantitate: q, wx, wy, z: g + 1 }, R)
      if (!o.ok) return -1
      puse += q
      const slot = slotItem(w.iteme, o.value)
      if (slot !== -1) scris += scrieS(w, slot, Math.min(q, w.iteme.cantitate[slot]!), frac)
      return slot
    }
    for (const [d, q] of [[12, 75], [14, 40], [16, 30], [10, 20]] as const) {
      const c = solidLaDistanta(w, sit.wx + (d % 3), sit.wy, sit.g, d, d + 4)
      pune(H, q, c.wx, c.wy, 0.2 + 0.7 * r())
    }
    for (let i = 0; i < w.agents.count; i++) if (i % 2 === 0) w.agents.nevoi[i * NEVOI + Nevoie.FOAME] = 200
    // Baza: tot ce e transient porneste de la zero; S scris e in `scris`.
    let baza = { S: 0, scris: 0, acc: 0, man: 0, pie: 0, dis: 0, str: w.hranaStricata }
    let mancate = 0
    let pierduteVechi = 0
    let ucis = false
    let abandonat = false
    let sapat = 0
    let incarcat = false
    let nascut = false
    for (let t = 0; t < 2600; t++) {
      const off = w.tick % R.ticksPerSecond !== 0
      // Mormane de 1 u cu S aproape de o unitate, in afara grilei: fragmentarea pe care o nutritie fara ceil o lasa gratis.
      if (off && w.tick % 97 === 13 && w.tick < 2200) {
        const c = solidLaDistanta(w, sit.wx + 1 + (ev.injectii % 5), sit.wy + 1, sit.g, 5, 9)
        if (pune(H, 1, c.wx, c.wy, 0.999 + r() * 0.001) !== -1) ev.injectii++
      }
      // Ucidere cu marfa: primul pion cu HRANA si S > 0 in mana care sta INCA pe mormanul din care a ridicat (cu S, in afara
      // oricarei zone — o celula de depozit poate fi rezervata ca destinatie, si atunci `asazaItem` o sare), dupa tickul 150:
      // marfa lasata la picioare se UNESTE cu restul mormanului — `asazaItem` pe calea de unire, cu S pe ambele parti.
      if (off && !ucis && w.tick > 150) {
        const a = w.agents
        for (let s = 0; s < a.count; s++) {
          if (a.alive[s] !== 1 || a.caraKind[s] !== H || a.caraCantitate[s]! === 0 || a.caraAlterare[s]! === 0) continue
          const sub = itemLaCelula(w.iteme, cellOf(a.x[s]!), cellOf(a.y[s]!), a.z[s]!)
          if (sub === -1 || w.iteme.kind[sub] !== H || w.iteme.alterare[sub] === 0) continue
          if (celulaDeZonaLa(w.zone, cellOf(a.x[s]!), cellOf(a.y[s]!), a.z[s]!) !== -1) continue
          assert.ok(applyCommand(w, { kind: 'killAgent', id: a.id[s]! }, R).ok)
          ucis = true
          ev.ucisi++
          break
        }
      }
      // Un nou-nascut in slotul mortului (golesteMana la nastere).
      if (off && ucis && !nascut && w.tick > 400) {
        const g = solid(w, sit.wx, sit.wy)!
        assert.ok(applyCommand(w, { kind: 'spawnAgent', x: sit.wx * 1000 + 500, y: sit.wy * 1000 + 500, z: g + 1, faction: 0 }, R).ok)
        nascut = true
        ev.nasteri++
      }
      // Abandon: depozitul sters sub un caraus cu HRANA in mana spre el; apoi pictat la loc (slotul de zona refolosit).
      if (off && !abandonat && w.tick > 200) {
        const a = w.agents
        for (let s = 0; s < a.count; s++) {
          if (a.alive[s] === 1 && a.jobKind[s] === FelJob.CARA && a.jobStep[s] === PasCara.MERGE_DEST && a.caraKind[s] === H && a.caraAlterare[s]! > 0) {
            assert.ok(applyCommand(w, { kind: 'stergeZona', id: zona }, R).ok)
            zona = picteaza(w, sit.wx + 5, sit.wy + 5, 3)
            abandonat = true
            ev.abandonuri++
            break
          }
        }
      }
      // Sapat sub mormane (mutaItem), in afara oricarei zone.
      if (off && sapat < 2 && w.tick > 300 + 400 * sapat) {
        const it = w.iteme
        for (let i = it.count - 1; i >= 0; i--) {
          if (it.alive[i] !== 1 || it.kind[i] !== H || it.alterare[i] === 0) continue
          if (applyCommand(w, { kind: 'dig', wx: it.wx[i]!, wy: it.wy[i]!, z: it.z[i]! - 1 }, R).ok) { sapat++; ev.sapat++; break }
        }
      }
      // Realizarea scrisa de test: unitatile intregi strinse (S ≥ ONE) se strica prin `scadeStricate` — termenul ONE·stricat.
      if (off && w.tick % 211 === 7) {
        const it = w.iteme
        for (let i = 0; i < it.count; i++) {
          if (it.alive[i] !== 1 || it.kind[i] !== H) continue
          const k = Math.floor(it.alterare[i]! / ONE)
          if (k > 0) { scadeStricate(w, R, i, k); ev.realizari++ }
        }
      }
      // Salvare si incarcare in afara grilei: contoarele TRANSIENT pornesc de la zero, deci o BAZA noua.
      if (!incarcat && w.tick >= 1013 && off) {
        pierduteVechi += w.ratiune.pierdutePeFel[H]!
        const out = decode(encode(w), R)
        assert.ok(out.ok, `incarcarea: ${JSON.stringify(out)}`)
        if (!out.ok) return
        w = out.value
        incarcat = true
        ev.incarcari++
        baza = { S: sume(w).S, scris, acc: 0, man: 0, pie: 0, dis: 0, str: w.hranaStricata }
      }
      const mancatInainte = w.ratiune.alterareMancata
      tick(w, R)
      const rap = lastJobReport()
      mancate += rap.unitatiMancate
      ev.mancate += rap.unitatiMancate
      if (w.ratiune.alterareMancata > mancatInainte) ev.mancateCuS++
      ev.lasari += rap.itemeMutate
      const { S, u } = sume(w)
      const rt = w.ratiune
      // G1S, cu baza: tot ce a intrat in S (scris de test + acumulat de pas) == unde e acum + pe unde a iesit.
      const stanga = (scris - baza.scris) + (rt.alterareAcumulata - baza.acc)
      const dreapta = (S - baza.S) + ONE * (w.hranaStricata - baza.str) + (rt.alterareMancata - baza.man) + (rt.alterarePierduta - baza.pie) + (rt.alterareDisparuta - baza.dis)
      assert.equal(dreapta, stanga, `seed ${seed}, tickul ${w.tick}: G1S — S a aparut sau a disparut nenumarat (Σ S ${S}, baza ${baza.S})`)
      // G1, pe unitati, cu pierdutele PE FEL: pusa == mancata + stricata + ramasa + pierduta.
      assert.equal(mancate + w.hranaStricata + u + pierduteVechi + rt.pierdutePeFel[H]!, puse, `seed ${seed}, tickul ${w.tick}: G1 pe unitati`)
    }
  }
  // Contoarele de viata: fiecare cale pretinsa chiar a rulat.
  assert.ok(ev.ucisi >= 2, `ucideri cu marfa: ${ev.ucisi}`)
  assert.ok(ev.abandonuri >= 2, `abandonuri cu hrana in mana: ${ev.abandonuri}`)
  assert.ok(ev.sapat >= 3, `sapat sub morman: ${ev.sapat}`)
  assert.ok(ev.injectii >= 20, `mormane de 1 u: ${ev.injectii}`)
  assert.ok(ev.realizari >= 3, `realizari scrise de test: ${ev.realizari}`)
  assert.ok(ev.nasteri >= 2 && ev.incarcari >= 2, `nasteri ${ev.nasteri}, incarcari ${ev.incarcari}`)
  assert.ok(ev.lasari >= 4, `LASA in depozit: ${ev.lasari}`)
  assert.ok(ev.mancateCuS >= 4, `imbucaturi cu S: ${ev.mancateCuS} (din ${ev.mancate} unitati mancate)`)
})

// ---------------------------------------------------------------------------
// pompa de prospetime si mana: S scris, rata 0, pionii satui
// ---------------------------------------------------------------------------

/**
 * Doua depozite care isi schimba prioritatea la fiecare 700 de tickuri: hrana se cara dintr-unul in altul si inapoi —
 * despartiri (50 dintr-un morman de 75), uniri pe mormane cu S, lasari, si un sapat sub un morman din depozit. Pionii
 * sunt tinuti satui (nimeni nu mananca), rata e 0: Σ S nu are pe unde sa iasa, deci trebuie sa ramana EXACT.
 */
function scenaPompa(seed: number): { w: World; A: number; B: number; S0: number; u0: number } {
  const { w, sit } = laSit(seed, 4)
  const A = picteaza(w, sit.wx + 2, sit.wy + 3, 3, 1)
  const B = picteaza(w, sit.wx + 5, sit.wy + 6, 3, 5)
  const r = lcg(seed + 1)
  for (const [dx, dy, q] of [[0, 0, 75], [1, 0, 60], [2, 0, 75], [0, 1, 40], [1, 1, 30], [2, 2, 75]] as const) {
    const slot = slotItem(w.iteme, lasaItem(w, H, q, sit.wx + 2 + dx, sit.wy + 3 + dy))
    w.iteme.alterare[slot] = Math.floor(q * (ONE - 1) * (0.1 + 0.85 * r()))
  }
  const { S, u } = sume(w)
  return { w, A, B, S0: S, u0: u }
}

test('poarta pompei de prospetime: S scris, rata 0, pionii satui — Σ S EXACT neschimbat la FIECARE tick, prin despartiri, uniri, lasari si un sapat in depozit', () => {
  let despartiri = 0
  let uniri = 0
  let schimbari = 0
  let sapat = 0
  for (const seed of [12345, 7]) {
    const { w, A, B, S0, u0 } = scenaPompa(seed)
    const prev = new Map<number, { q: number; S: number }>()
    let urmatoareaSchimbare = 700
    let sapatAici = 0
    for (let t = 0; t < 3600; t++) {
      for (let i = 0; i < w.agents.count; i++) w.agents.nevoi[i * NEVOI + Nevoie.FOAME] = R.nevoieMax
      const off = w.tick % R.ticksPerSecond !== 0
      if (off && w.tick >= urmatoareaSchimbare) {
        // Prioritatile inversate: tot ce a ajuns in B pleaca inapoi in A.
        const pA = w.zone.prioritate[w.zone.laId.get(A)!]!
        assert.ok(applyCommand(w, { kind: 'setPrioritateZona', id: A, prioritate: pA === 1 ? 5 : 1 }, R).ok)
        assert.ok(applyCommand(w, { kind: 'setPrioritateZona', id: B, prioritate: pA === 1 ? 1 : 5 }, R).ok)
        schimbari++
        urmatoareaSchimbare += 700
      }
      if (off && sapatAici < 1 && w.tick > 1100) {
        const it = w.iteme
        for (let i = 0; i < it.count; i++) {
          if (it.alive[i] !== 1 || it.kind[i] !== H || it.alterare[i] === 0) continue
          if (applyCommand(w, { kind: 'dig', wx: it.wx[i]!, wy: it.wy[i]!, z: it.z[i]! - 1 }, R).ok) { sapat++; sapatAici++; break }
        }
      }
      tick(w, R)
      const { S, u } = sume(w)
      assert.equal(S, S0, `seed ${seed}, tickul ${w.tick}: Σ S ${S} != ${S0} — o cale a creat sau a sters prospetime`)
      assert.equal(u, u0, `seed ${seed}, tickul ${w.tick}: unitatile`)
      const it = w.iteme
      for (let i = 0; i < it.count; i++) {
        if (it.alive[i] !== 1 || it.kind[i] !== H) continue
        const p = prev.get(it.id[i]!)
        if (p && it.cantitate[i]! < p.q) despartiri++
        if (p && it.alterare[i]! > p.S && it.cantitate[i]! > p.q && p.S > 0) uniri++
        prev.set(it.id[i]!, { q: it.cantitate[i]!, S: it.alterare[i]! })
      }
    }
    // Pe HRANA nimic pierdut (pamantul sapat poate sa nu incapa langa depozit: nu e al portii).
    assert.equal(w.ratiune.alterarePierduta, 0)
    assert.equal(w.ratiune.pierdutePeFel[H], 0)
  }
  assert.ok(despartiri >= 10, `despartiri: ${despartiri}`)
  assert.ok(uniri >= 5, `uniri pe mormane cu S: ${uniri}`)
  assert.ok(schimbari >= 4, `inversari de prioritate: ${schimbari}`)
  assert.ok(sapat >= 2, `sapat sub morman in depozit: ${sapat}`)
})

test('mana nu se strica: intre ridicare si lasare, cu aceeasi cantitate in mana, S-ul mainii ramane EXACT — la fiecare tick', () => {
  let tickuriCuS = 0
  let ridicari = 0
  for (const seed of [12345, 7]) {
    const { w } = scenaPompa(seed)
    const a = w.agents
    const q = new Int32Array(a.capacity)
    const S = new Float64Array(a.capacity)
    for (let t = 0; t < 1500; t++) {
      for (let i = 0; i < a.count; i++) a.nevoi[i * NEVOI + Nevoie.FOAME] = R.nevoieMax
      tick(w, R)
      for (let i = 0; i < a.count; i++) {
        if (a.caraCantitate[i]! > 0 && a.caraCantitate[i] === q[i]) {
          assert.equal(a.caraAlterare[i], S[i], `seed ${seed}, tickul ${w.tick}, pionul ${i}: S-ul mainii s-a schimbat cu aceeasi cantitate`)
          if (S[i]! > 0) tickuriCuS++
        }
        if (a.caraCantitate[i]! > q[i]!) ridicari++
        q[i] = a.caraCantitate[i]!
        S[i] = a.caraAlterare[i]!
      }
    }
  }
  assert.ok(tickuriCuS >= 300, `tickuri-pion cu hrana alterata in mana: ${tickuriCuS}`)
  assert.ok(ridicari >= 6, `ridicari: ${ridicari}`)
})

// ---------------------------------------------------------------------------
// salvarea: M5, hash-ul, refuzurile (fiecare cu cazul ei), migrarea 8 -> 9
// ---------------------------------------------------------------------------

/** Un sit cu un depozit, hrana departe, pioni flamanzi; lumea merge pana cand un pion duce HRANA spre depozit. S scris pe mormane si in maini. */
function lumeCuMana(): { w: World; carausul: number; sit: { wx: number; wy: number; g: number } } {
  const { w, sit } = laSit(8801, 4)
  picteaza(w, sit.wx + 2, sit.wy + 3, 3)
  const a = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 12, 18)
  lasaItem(w, H, 75, a.wx, a.wy)
  for (let i = 0; i < w.agents.count; i++) w.agents.nevoi[i * NEVOI + Nevoie.FOAME] = 200
  let carausul = -1
  for (let t = 0; t < 2000 && carausul === -1; t++) {
    tick(w, R)
    for (let i = 0; i < w.agents.count; i++) if (w.agents.jobKind[i] === FelJob.CARA && w.agents.jobStep[i] === PasCara.MERGE_DEST && w.agents.caraKind[i] === H) carausul = i
  }
  assert.notEqual(carausul, -1, 'fixtura: niciun caraus cu hrana')
  w.agents.caraAlterare[carausul] = Math.floor(w.agents.caraCantitate[carausul]! * (ONE - 1) / 2) + 3
  for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1 && w.iteme.kind[i] === H) w.iteme.alterare[i] = Math.floor(w.iteme.cantitate[i]! * (ONE - 1) / 3) + 1
  return { w, carausul, sit }
}

test('M5 cu alterare: S in maini si pe mormane, masca refuzata si totalul stricat — salvat in afara grilei, 1500 + 1500 == 3000', () => {
  const { w, carausul } = lumeCuMana()
  // Stare in TOATE campurile noi: o masca refuzata pe depozit (n-o citeste nimeni pana la camara), un total stricat.
  w.zone.refuzate[0] = 0b0101
  const it = w.iteme
  let realizat = false
  for (let i = 0; i < it.count && !realizat; i++) if (it.alive[i] === 1 && it.kind[i] === H && it.alterare[i]! >= ONE) { scadeStricate(w, R, i, 1); realizat = true }
  assert.ok(realizat && w.hranaStricata === 1, 'fixtura: totalul stricat')
  while (w.tick % R.ticksPerSecond === 0) tick(w, R)
  assert.ok(w.agents.caraAlterare[carausul]! > 0 && w.agents.caraCantitate[carausul]! > 0, 'fixtura: mana cu S la salvare')
  const text = encode(w)
  advance(w, 1500, R)
  const out = decode(text, R)
  assert.ok(out.ok, JSON.stringify(out))
  if (!out.ok) return
  advance(out.value, 1500, R)
  assert.equal(hashWorld(out.value), hashWorld(w))
})

test('hash-ul vede FIECARE camp PERSISTED nou al t.3 — si pe cuvantul de sus (hi/lo): o diferenta de 2^32 nu se pierde', () => {
  const { w, carausul } = lumeCuMana()
  const baza = hashWorld(w)
  let im = -1
  for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1 && w.iteme.kind[i] === H) im = i
  assert.notEqual(im, -1)
  const perturbari: [string, (w: World) => void, (w: World) => void][] = [
    ['iteme.alterare +1', (w) => { w.iteme.alterare[im] = w.iteme.alterare[im]! + 1 }, (w) => { w.iteme.alterare[im] = w.iteme.alterare[im]! - 1 }],
    ['iteme.alterare +2^32', (w) => { w.iteme.alterare[im] = w.iteme.alterare[im]! + 2 ** 32 }, (w) => { w.iteme.alterare[im] = w.iteme.alterare[im]! - 2 ** 32 }],
    ['agents.caraAlterare +1', (w) => { w.agents.caraAlterare[carausul] = w.agents.caraAlterare[carausul]! + 1 }, (w) => { w.agents.caraAlterare[carausul] = w.agents.caraAlterare[carausul]! - 1 }],
    ['agents.caraAlterare +2^32', (w) => { w.agents.caraAlterare[carausul] = w.agents.caraAlterare[carausul]! + 2 ** 32 }, (w) => { w.agents.caraAlterare[carausul] = w.agents.caraAlterare[carausul]! - 2 ** 32 }],
    ['zone.refuzate', (w) => { w.zone.refuzate[0] = 1 }, (w) => { w.zone.refuzate[0] = 0 }],
    ['hranaStricata +1', (w) => { w.hranaStricata += 1 }, (w) => { w.hranaStricata -= 1 }],
    ['hranaStricata +2^32', (w) => { w.hranaStricata += 2 ** 32 }, (w) => { w.hranaStricata -= 2 ** 32 }],
  ]
  for (const [nume, f, inapoi] of perturbari) {
    f(w)
    assert.notEqual(hashWorld(w), baza, `${nume}: hash-ul nu vede campul`)
    inapoi(w)
    assert.equal(hashWorld(w), baza, `${nume}: perturbarea nu s-a desfacut`)
  }
})

/** Lumea de baza a refuzurilor si JSON-ul ei; `refuz(f)` editeaza o copie a JSON-ului si o incarca. */
function bazaRefuzuri(): { w: World; carausul: number; gol: number; mort: number; sit: { wx: number; wy: number; g: number }; env: { data: Record<string, any> } } {
  const { w, carausul, sit } = lumeCuMana()
  // Un slot de morman MORT, si un pion cu mana GOALA.
  const m = creeazaItem(w.iteme, w.nextId++, H, 3, 3, 3, 2, 0)
  assert.ok(m.ok)
  const mort = m.ok ? m.value : -1
  stergeItem(w.iteme, mort)
  let gol = -1
  for (let i = 0; i < w.agents.count; i++) if (w.agents.alive[i] === 1 && w.agents.caraCantitate[i] === 0) gol = i
  assert.notEqual(gol, -1)
  const env = JSON.parse(encode(w)) as { data: Record<string, any> }
  return { w, carausul, gol, mort, sit, env }
}

function incarca(env: { data: Record<string, any> }, rules: Rules = R) {
  return decode(JSON.stringify(env), rules)
}

function refuzat(out: ReturnType<typeof decode>, camp: string, motiv: string): void {
  assert.ok(!out.ok, `trebuia refuzat (${camp}: ${motiv})`)
  if (out.ok) return
  assert.equal(String(out.params.camp), camp)
  assert.equal(String(out.params.motiv), motiv)
}

function primulViu(w: World): number {
  for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1 && w.iteme.kind[i] === H) return i
  return -1
}

test('refuz: S NEGATIV pe un morman — decode refuza, encode arunca', () => {
  const { w, env } = bazaRefuzuri()
  const i = primulViu(w)
  env.data.iteme.alterare[i] = -1
  refuzat(incarca(env), `iteme.alterare[${i}]`, 'S nu e un intreg sigur nenegativ')
  w.iteme.alterare[i] = -1
  assert.throws(() => encode(w), /iteme\.alterare/)
})

test('refuz: S NESIGUR pe un morman (1,5 si 2^53 + 2) — decode refuza, encode arunca', () => {
  const { w, env } = bazaRefuzuri()
  const i = primulViu(w)
  for (const v of [1.5, 2 ** 53 + 2]) {
    const e = structuredClone(env)
    e.data.iteme.alterare[i] = v
    refuzat(incarca(e), `iteme.alterare[${i}]`, 'S nu e un intreg sigur nenegativ')
    w.iteme.alterare[i] = v
    assert.throws(() => encode(w), /iteme\.alterare/)
  }
})

test('refuz: S peste cantitate·(ONE − 1) pe un morman viu — la limita se incarca, cu 1 peste se refuza (si encode arunca)', () => {
  const { w, env } = bazaRefuzuri()
  const i = primulViu(w)
  const max = w.iteme.cantitate[i]! * (ONE - 1)
  env.data.iteme.alterare[i] = max
  const ok = incarca(env)
  assert.ok(ok.ok, `la limita: ${JSON.stringify(ok)}`)
  env.data.iteme.alterare[i] = max + 1
  refuzat(incarca(env), `iteme.alterare[${i}]`, 'S peste cantitate·(ONE − 1)')
  w.iteme.alterare[i] = max + 1
  assert.throws(() => encode(w), /cantitate·\(ONE − 1\)/)
})

test('refuz: S pe un slot MORT de morman — decode refuza, encode arunca', () => {
  const { w, env, mort } = bazaRefuzuri()
  env.data.iteme.alterare[mort] = 5
  refuzat(incarca(env), `iteme.alterare[${mort}]`, 'S pe un slot mort')
  w.iteme.alterare[mort] = 5
  assert.throws(() => encode(w), /slot mort/)
})

test('refuz: o mana GOALA cu S ≠ 0 — decode refuza, encode arunca', () => {
  const { w, env, gol } = bazaRefuzuri()
  env.data.agents.caraAlterare[gol] = 3
  refuzat(incarca(env), `agents.caraAlterare[${gol}]`, 'mana goala cu S ≠ 0')
  w.agents.caraAlterare[gol] = 3
  assert.throws(() => encode(w), /mana goala/)
})

test('refuz: o mana cu S peste cantitate·(ONE − 1) — la limita se incarca, cu 1 peste se refuza (si encode arunca)', () => {
  const { w, env, carausul } = bazaRefuzuri()
  const max = w.agents.caraCantitate[carausul]! * (ONE - 1)
  env.data.agents.caraAlterare[carausul] = max
  assert.ok(incarca(env).ok)
  env.data.agents.caraAlterare[carausul] = max + 1
  refuzat(incarca(env), `agents.caraAlterare[${carausul}]`, 'S peste cantitate·(ONE − 1)')
  w.agents.caraAlterare[carausul] = max + 1
  assert.throws(() => encode(w), /agents\.caraAlterare/)
})

test('refuz: o mana cu S negativ sau nesigur — decode refuza, encode arunca', () => {
  const { w, env, carausul } = bazaRefuzuri()
  for (const v of [-2, 0.5]) {
    const e = structuredClone(env)
    e.data.agents.caraAlterare[carausul] = v
    refuzat(incarca(e), `agents.caraAlterare[${carausul}]`, 'S nu e un intreg sigur nenegativ')
    w.agents.caraAlterare[carausul] = v
    assert.throws(() => encode(w), /agents\.caraAlterare/)
  }
})

test('refuz: masca refuzata cu biti in afara felurilor — 15 se incarca, 16 se refuza (si encode arunca)', () => {
  const { w, env } = bazaRefuzuri()
  env.data.zone.refuzate[0] = 15
  assert.ok(incarca(env).ok)
  env.data.zone.refuzate[0] = 16
  refuzat(incarca(env), 'zone.refuzate[0]', 'biti in afara felurilor')
  w.zone.refuzate[0] = 16
  assert.throws(() => encode(w), /zone\.refuzate/)
})

test('refuz: o masca refuzata care nu incape intr-un octet (256, 1,5, un sir) — nicio conversie tacuta', () => {
  const { env } = bazaRefuzuri()
  for (const v of [256, 1.5, 'x']) {
    const e = structuredClone(env)
    e.data.zone.refuzate[0] = v
    refuzat(incarca(e), 'zone.refuzate[0]', 'masca nu incape intr-un octet')
  }
})

test('refuz: o alterare care nu e un numar (un sir, null, un boolean) — pe mormane si in maini, nicio conversie tacuta', () => {
  const { w, env, carausul } = bazaRefuzuri()
  const i = primulViu(w)
  for (const v of ['5', null, true]) {
    const e = structuredClone(env)
    e.data.iteme.alterare[i] = v
    refuzat(incarca(e), `iteme.alterare[${i}]`, 'nu e un numar')
    const f = structuredClone(env)
    f.data.agents.caraAlterare[carausul] = v
    refuzat(incarca(f), `agents.caraAlterare[${carausul}]`, 'nu e un numar')
  }
})

test('refuz: totalul stricat negativ sau nesigur se refuza, iar lipsa lui intr-o salvare de schema 9 la fel (encode arunca)', () => {
  const { w, env } = bazaRefuzuri()
  for (const v of [-1, 2.5]) {
    const e = structuredClone(env)
    e.data.hranaStricata = v
    refuzat(incarca(e), 'hranaStricata', 'nu e un intreg sigur nenegativ')
  }
  const fara = structuredClone(env)
  delete fara.data.hranaStricata
  const out = incarca(fara)
  assert.ok(!out.ok && out.reason === Reason.LIPSA_MATERIAL && out.params.camp === 'hranaStricata')
  w.hranaStricata = -1
  assert.throws(() => encode(w), /hranaStricata/)
})

test('un fel NEPERISABIL cu S ≠ 0 nu se refuza: se incarca cu S = 0, numarat (mormane si maini) — si continutul schimbat la fel', () => {
  const { w, env, carausul, sit } = bazaRefuzuri()
  const sp = slotItem(w.iteme, lasaItem(w, Item.PIATRA, 5, sit.wx + 7, sit.wy + 7))
  const e = JSON.parse(encode(w)) as { data: Record<string, any> }
  e.data.iteme.alterare[sp] = 7
  const out = incarca(e)
  assert.ok(out.ok, JSON.stringify(out))
  if (!out.ok) return
  assert.equal(out.value.iteme.alterare[sp], 0)
  assert.equal(out.value.ratiune.alterareNormalizata, 1)
  // Acelasi JSON de baza, cu un content in care hrana NU se strica: fiecare S de hrana (mormane si mana) se pune pe 0.
  const neperisabil: Rules = { ...R, perisabil: [false, false, false, false] }
  let asteptat = 0
  for (const S of env.data.iteme.alterare as number[]) if (S !== 0) asteptat++
  for (const S of env.data.agents.caraAlterare as number[]) if (S !== 0) asteptat++
  assert.ok(asteptat >= 2 && env.data.agents.caraAlterare[carausul] > 0, `fixtura: ${asteptat} sloturi cu S`)
  const out2 = incarca(env, neperisabil)
  assert.ok(out2.ok)
  if (!out2.ok) return
  assert.equal(out2.value.ratiune.alterareNormalizata, asteptat)
  assert.equal(out2.value.agents.caraAlterare[carausul], 0)
  assert.equal(sume(out2.value).S, 0)
})

test('encode arunca pe ACELEASI conditii ca decode: fiecare refuz al formatului, scris in lume, opreste salvarea', () => {
  const cazuri: [string, (b: ReturnType<typeof bazaRefuzuri>) => void][] = [
    ['S negativ', (b) => { b.w.iteme.alterare[primulViu(b.w)] = -1 }],
    ['S nesigur', (b) => { b.w.iteme.alterare[primulViu(b.w)] = 0.5 }],
    ['S peste q·(ONE − 1)', (b) => { const i = primulViu(b.w); b.w.iteme.alterare[i] = b.w.iteme.cantitate[i]! * (ONE - 1) + 1 }],
    ['slot mort', (b) => { b.w.iteme.alterare[b.mort] = 1 }],
    ['mana goala', (b) => { b.w.agents.caraAlterare[b.gol] = 1 }],
    ['mana peste', (b) => { b.w.agents.caraAlterare[b.carausul] = b.w.agents.caraCantitate[b.carausul]! * (ONE - 1) + 1 }],
    ['masca', (b) => { b.w.zone.refuzate[0] = 16 }],
    ['total', (b) => { b.w.hranaStricata = -3 }],
  ]
  for (const [nume, strica] of cazuri) {
    const b = bazaRefuzuri()
    strica(b)
    assert.throws(() => encode(b.w), /alterarea nu se poate salva/, nume)
  }
})

const SCHEMA8 = readFileSync(new URL('./fixtures/save-schema8-hrana.json', import.meta.url), 'utf8')
/**
 * Hash-ul fixturii de schema 8 DUPA migrarea 8 -> 9 (t.3, commit-ul A): schema 9, campurile noi pe zero. La captura
 * (schema 8, iesirea `tools/captura-fixtura-schema8-hrana.mjs`) era 018d58c3; functia de hash de la schema 8, pe lumea
 * migrata cu schema proiectata pe 8, da tot 018d58c3 (masurat la commit) — migrarea n-a schimbat nimic din ce exista.
 */
const HASH_DUPA_MIGRARE_8 = '9b8cdbd4'

test('fixtura de schema 8 cu hrana e chiar de schema 8: doi carausi cu HRANA in mana si un mancator, fara niciun camp al t.3', () => {
  const env = JSON.parse(SCHEMA8) as { schema: number; data: Record<string, any> }
  assert.equal(env.schema, 8)
  assert.equal(env.data.hranaStricata, undefined)
  assert.equal(env.data.iteme.alterare, undefined)
  assert.equal(env.data.agents.caraAlterare, undefined)
  assert.equal(env.data.zone.refuzate, undefined)
  const a = env.data.agents
  let inMana = 0
  let mananca = 0
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] === 1 && a.caraKind[i] === H && a.caraCantitate[i] > 0 && a.jobKind[i] === FelJob.CARA) inMana++
    if (a.alive[i] === 1 && a.jobKind[i] === FelJob.MANANCA && a.jobConsumat[i] > 0) mananca++
  }
  assert.ok(inMana >= 1 && mananca >= 1, `carausi ${inMana}, mancatori ${mananca}`)
})

test('migrarea 8 -> 9: hrana porneste PROASPATA (mormane si maini la 0), fiecare zona primeste tot, nimic stricat; idempotenta; lumea merge', () => {
  const out = decode(SCHEMA8, R)
  assert.ok(out.ok, JSON.stringify(out))
  if (!out.ok) return
  const w = out.value
  assert.equal(w.schema, SCHEMA_VERSION)
  assert.equal(hashWorld(w), HASH_DUPA_MIGRARE_8)
  assert.equal(w.hranaStricata, 0)
  assert.equal(sume(w).S, 0)
  assert.ok(sume(w).u > 0, 'fixtura: hrana pe jos si in maini')
  for (let i = 0; i < w.zone.count; i++) assert.equal(w.zone.refuzate[i], 0)
  // Rescrisa de codul nou (schema 9) si reincarcata: acelasi hash, fara a doua migrare.
  const din9 = decode(encode(w), R)
  assert.ok(din9.ok)
  if (!din9.ok) return
  assert.equal(hashWorld(din9.value), hashWorld(w))
  // Lumea migrata merge: carausii lasa, mancatorul mananca, S ramane 0 (rata 0), nimic pierdut.
  const u0 = sume(w).u
  let mancate = 0
  for (let t = 0; t < 600; t++) { tick(w, R); mancate += lastJobReport().unitatiMancate }
  assert.equal(sume(w).S, 0)
  assert.equal(sume(w).u + mancate, u0)
  assert.equal(w.ratiune.itemePierdute, 0)
})

// ---------------------------------------------------------------------------
// content, zone, nastere, zidire, mortul de la incarcare
// ---------------------------------------------------------------------------

test('content: tabelul `perisabil` e obligatoriu, are fiecare fel, doar true/false, si refuza un fel necunoscut', () => {
  const fisier = JSON.parse(readFileSync(new URL('../content/rules.json', import.meta.url), 'utf8')) as Record<string, any>
  const ok = parseRules(fisier)
  assert.ok(ok.ok && ok.value.perisabil.join() === 'false,false,false,true', 'doar HRANA se strica')
  const fara = { ...fisier }
  delete fara.perisabil
  const f1 = parseRules(fara)
  assert.ok(!f1.ok && f1.params.camp === 'perisabil')
  const f2 = parseRules({ ...fisier, perisabil: { ...fisier.perisabil, HRANA: 1 } })
  assert.ok(!f2.ok && f2.params.camp === 'perisabil.HRANA')
  const lipsa = { ...fisier.perisabil }
  delete lipsa.LEMN
  const f3 = parseRules({ ...fisier, perisabil: lipsa })
  assert.ok(!f3.ok && f3.params.camp === 'perisabil.LEMN')
  const f4 = parseRules({ ...fisier, perisabil: { ...fisier.perisabil, GHEATA: true } })
  assert.ok(!f4.ok && f4.params.camp === 'perisabil.GHEATA')
})

test('slotul de zona REFOLOSIT: o zona noua in slotul unei zone filtrate sterse primeste tot (masca refuzata pe 0)', () => {
  const { w, sit } = laSit(8801, 1)
  const z1 = picteaza(w, sit.wx + 2, sit.wy + 3, 2)
  const slot = w.zone.laId.get(z1)!
  w.zone.refuzate[slot] = 0b0111
  assert.ok(applyCommand(w, { kind: 'stergeZona', id: z1 }, R).ok)
  const z2 = picteaza(w, sit.wx + 5, sit.wy + 5, 2)
  assert.equal(w.zone.laId.get(z2), slot, 'fixtura: slotul s-a refolosit')
  assert.equal(w.zone.refuzate[slot], 0)
})

test('nasterea pe un slot refolosit goleste mana CU alterarea ei (golesteMana)', () => {
  const { w, sit } = laSit(8801, 2)
  const id = w.agents.id[1]!
  assert.ok(applyCommand(w, { kind: 'killAgent', id }, R).ok)
  // Un mort cu marfa in mana e o stare pe care doar o salvare veche o aduce; aici scrisa direct.
  w.agents.caraKind[1] = H
  w.agents.caraCantitate[1] = 5
  w.agents.caraAlterare[1] = 77
  const g = solid(w, sit.wx, sit.wy)!
  const o = applyCommand(w, { kind: 'spawnAgent', x: sit.wx * 1000 + 500, y: sit.wy * 1000 + 500, z: g + 1, faction: 0 }, R)
  assert.ok(o.ok)
  assert.equal(w.agents.id[1], o.ok ? o.value : -1, 'fixtura: slotul s-a refolosit')
  assert.deepEqual([w.agents.caraKind[1], w.agents.caraCantitate[1], w.agents.caraAlterare[1]], [0, 0, 0])
})

test('zidirea unui material PERISABIL: S-ul lui iese din lume numarat (disparut), mana ramane goala cu S 0', () => {
  // Azi niciun fel perisabil nu se zideste; un content in care PIATRA se strica face calea vizibila.
  const piatraPerisabila: Rules = { ...R, perisabil: [true, false, false, true] }
  const { w, sit } = laSit(12345, 1, [], piatraPerisabila)
  const id = lasaItem(w, Item.PIATRA, 20, sit.wx + 1, sit.wy + 1, piatraPerisabila)
  const is = slotItem(w.iteme, id)
  const S = 20 * (ONE - 1) - 999
  w.iteme.alterare[is] = S
  const g = solid(w, sit.wx + 4, sit.wy + 1)!
  assert.ok(applyCommand(w, { kind: 'desemneaza', wx: sit.wx + 4, wy: sit.wy + 1, z: g + 1, piesa: Piesa.PERETE }, piatraPerisabila).ok)
  let gata = false
  for (let t = 0; t < 4000 && !gata; t++) {
    tick(w, piatraPerisabila)
    gata = w.ratiune.unitatiZidite === 20
  }
  assert.ok(gata, 'peretele nu s-a zidit')
  assert.equal(w.ratiune.alterareDisparuta, S)
  assert.deepEqual([w.agents.caraCantitate[0], w.agents.caraAlterare[0]], [0, 0])
})

test('mortul de la incarcare: S-ul din mana lui se numara PIERDUT, pe fel, nu se sterge tacut', () => {
  const { w, carausul } = lumeCuMana()
  const cant = w.agents.caraCantitate[carausul]!
  const S = w.agents.caraAlterare[carausul]!
  assert.ok(S > 0)
  const raw = JSON.parse(encode(w)) as { data: { agents: Record<string, number[]> } }
  raw.data.agents.alive![carausul] = 0
  const out = decode(JSON.stringify(raw), R)
  assert.ok(out.ok, JSON.stringify(out))
  if (!out.ok) return
  assert.equal(out.value.ratiune.alterarePierduta, S)
  assert.equal(out.value.ratiune.pierdutePeFel[H], cant)
  assert.deepEqual([out.value.agents.caraCantitate[carausul], out.value.agents.caraAlterare[carausul]], [0, 0])
})

test('pierderea: ce nu incape nicaieri se numara pe FEL si cu S-ul ei; un lasaItem refuzat nu trage nici zavorul pe fel', () => {
  const { w, sit } = laSit(503, 1)
  const p = patratPlat(w, sit, 5, 3, 40)
  assert.ok(p)
  const cx = p.x0 + 2
  const cy = p.y0 + 2
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]] as const) lasaItem(w, Item.LEMN, R.itemStackMax, cx + dx, cy + dy)
  const S = 7 * (ONE - 1) - 5
  const r = asazaItem(w, R, H, 7, cx, cy, p.g + 1, 0, S)
  assert.equal(r.pus, 0)
  assert.deepEqual([w.ratiune.itemePierdute, w.ratiune.pierdutePeFel[H], w.ratiune.pierdutePeFel[Item.LEMN], w.ratiune.alterarePierduta], [7, 7, 0, S])
  const out = applyCommand(w, { kind: 'lasaItem', fel: H, cantitate: 7, wx: cx, wy: cy, z: p.g + 1 }, R)
  assert.equal(out.ok, false)
  assert.deepEqual([w.ratiune.itemePierdute, w.ratiune.pierdutePeFel[H]], [7, 7], 'un ordin respins nu trage zavorul, nici pe fel')
})
