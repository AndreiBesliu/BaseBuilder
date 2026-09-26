/**
 * Accesul vertical — S20-23, taietura 5. ACCEPTANTA cu pioni reali.
 *
 * Faptele de pe HEAD de dinainte (masurate, scratchpad/scari): pe sol plat nu se zidea
 * nimic peste g+2 (zidul de 4: 6/12; camera cu placa: 30/55); un pion ramanea pe creasta
 * unei camere fara usa pe 3 din 3 seminte; casa cu doua etaje se bloca la 53 din 194.
 *
 * „Blocat" se numara GEOMETRIC: un pion viu a carui componenta in lumea de acum e inchisa
 * (sau care nu sta pe o celula calcabila) — nu prin comparatie cu un punct de referinta
 * departe, care dadea fals pozitive pe pionii plecati la plimbare.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { componenta, memorieAcces, nodW } from '../src/sim/acces.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { DetaliuMotiv, slotDesemnare } from '../src/sim/desemnari.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { codMotiv, Reason } from '../src/sim/result.ts'
import { decode, encode } from '../src/sim/save.ts'
import { Faction, FelJob, Item, Nevoie, NEVOI, PasConstruieste, Piesa } from '../src/sim/state.ts'
import type { PiesaId, World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { stergeItem } from '../src/sim/iteme.ts'
import { Zona } from '../src/sim/zone.ts'
import { advance } from '../src/sim/world.ts'
import { lasaItem, panaCand, R, ruleaza, sitPlat } from './fixturi.ts'
import { unitatiDeMunca } from '../src/sim/joburi.ts'

type Piesa_ = readonly [number, number, number, PiesaId]

/** Un santier pentru fiecare piesa, piatra langa casa, hrana si pioni. Planul e relativ la (x0, y0, g). */
function santier(
  seed: number,
  plan: (g: number) => Piesa_[],
  pioni = 4,
  inainte?: (w: World, x0: number, y0: number, g: number) => void,
): { w: World; x0: number; y0: number; g: number; ids: number[]; plan: Piesa_[] } {
  const { w, wx, wy, g } = sitPlat(seed, 18)
  const x0 = wx + 5, y0 = wy + 4
  if (inainte) inainte(w, x0, y0, g)
  const piese = plan(g)
  const ids: number[] = []
  for (const [dx, dy, z, p] of piese) {
    const out = applyCommand(w, { kind: 'desemneaza', wx: x0 + dx, wy: y0 + dy, z, piesa: p }, R)
    assert.ok(out.ok, `fixtura: santierul (${dx},${dy},${z - g}): ${JSON.stringify(out)}`)
    if (out.ok) ids.push(out.value)
  }
  // Piatra: 20 pe piesa, in mormane de 60, pe o fasie la vest de casa.
  let piatra = piese.length * 20
  for (let i = 0; piatra > 0; i++) {
    const c = Math.min(60, piatra)
    lasaItem(w, Item.PIATRA, c, wx - 2 + (i % 5), wy + ((i / 5) | 0))
    piatra -= c
  }
  for (let i = 0; i < 10; i++) lasaItem(w, Item.HRANA, 75, wx + 14 + (i % 3), wy - 1 + ((i / 3) | 0))
  for (let i = 0; i < pioni; i++) {
    assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 3) * 1000 + 500, y: (wy + 12 + i) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
  }
  return { w, x0, y0, g, ids, plan: piese }
}

function ramase(w: World, ids: readonly number[]): number[] {
  return ids.filter((id) => slotDesemnare(w.desemnari, id) !== -1)
}

/** Pionii vii fara drum spre „afara": componenta lor in W e inchisa, sau nu stau pe o celula calcabila. */
function blocati(w: World): string[] {
  const nod = nodW(w.terrain, null, R)
  const out: string[] = []
  for (let i = 0; i < w.agents.count; i++) {
    if (w.agents.alive[i] !== 1) continue
    const x = cellOf(w.agents.x[i]!), y = cellOf(w.agents.y[i]!), z = w.agents.z[i]!
    if (!nod.calcabila(x, y, z)) { out.push(`${x},${y},${z} (necalcabil)`); continue }
    if (!componenta(nod, R, x, y, z).deschisa) out.push(`${x},${y},${z}`)
  }
  return out
}

/** Inelul unui dreptunghi LxL pe nivelurile [z0, z1], fara celulele din `goluri` (dx, dy). */
function pereti(o: Piesa_[], dx0: number, dy0: number, L: number, z0: number, z1: number, goluri: readonly (readonly [number, number])[] = []): void {
  for (let z = z0; z <= z1; z++) {
    for (let dx = 0; dx < L; dx++) {
      for (let dy = 0; dy < L; dy++) {
        if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
        if (goluri.some(([a, b]) => a === dx && b === dy)) continue
        o.push([dx0 + dx, dy0 + dy, z, Piesa.PERETE])
      }
    }
  }
}
function placa(o: Piesa_[], dx0: number, dy0: number, L: number, z: number, goluri: readonly (readonly [number, number])[] = []): void {
  for (let dx = 0; dx < L; dx++) {
    for (let dy = 0; dy < L; dy++) {
      if (goluri.some(([a, b]) => a === dx && b === dy)) continue
      o.push([dx0 + dx, dy0 + dy, z, Piesa.PODEA])
    }
  }
}

/**
 * Casa 7x7 cu doua etaje de 2 m: parter cu usa, placa la g+3, etaj pe g+4..g+5, acoperis la g+6.
 * Cu `scara`: doua trepte pe mijloc (coloana de 1 la (3,4), de 2 la (3,5)) si golurile lor in placa —
 * departe de colturi (panoul: coltul etajului de deasupra golului scarii n-are loc de lucru).
 */
function casaCuEtaj(scara: boolean): (g: number) => Piesa_[] {
  return (g) => {
    const o: Piesa_[] = []
    pereti(o, 0, 0, 7, g + 1, g + 2, [[3, 0]])
    if (scara) o.push([3, 4, g + 1, Piesa.SCARA], [3, 5, g + 1, Piesa.SCARA], [3, 5, g + 2, Piesa.SCARA])
    placa(o, 0, 0, 7, g + 3, scara ? [[3, 4], [3, 5]] : [])
    pereti(o, 0, 0, 7, g + 4, g + 5)
    placa(o, 0, 0, 7, g + 6)
    return o
  }
}

const SEMINTE = [12345, 777, 4242] as const

test('ACCEPTANTA: casa cu doua etaje si scara interioara se ridica INTEGRAL, fara niciun pion blocat', () => {
  // Pe HEAD: 53 din 194 si oprit — singurele celule de pe care placa ar fi continuat erau
  // ele insele santiere. Acum placa se pune de jos (atingerea +2), etajul se urca pe scara,
  // colturile se zidesc de pe diagonala.
  for (const seed of SEMINTE) {
    const { w, ids } = santier(seed, casaCuEtaj(true))
    assert.equal(ids.length, 193, 'fixtura: 46 de pereti la parter, 3 trepte, 47 de placa, 48 la etaj, 49 de acoperis')
    const n = panaCand(w, 90000, () => ramase(w, ids).length === 0)
    assert.ok(n >= 0, `seed ${seed}: raman ${ramase(w, ids).length} santiere dupa 90.000 de tickuri`)
    assert.deepEqual(blocati(w), [], `seed ${seed}: pioni fara drum spre sol`)
  }
})

test('ACCEPTANTA: fara scara, etajul si acoperisul raman — exact ele — si nimeni nu ramane sus', () => {
  const seed = 12345
  const { w, ids, plan, g } = santier(seed, casaCuEtaj(false))
  const deSus = new Set(ids.filter((_, i) => plan[i]![2] >= g + 4))
  assert.equal(deSus.size, 97, 'fixtura: 48 de pereti la etaj + 49 de acoperis')
  const n = panaCand(w, 60000, () => ramase(w, ids).every((id) => deSus.has(id)))
  assert.ok(n >= 0, `raman si de jos: ${ramase(w, ids).filter((id) => !deSus.has(id)).length}`)
  ruleaza(w, 3000)
  assert.equal(ramase(w, ids).length, 97, 's-a zidit ceva la etaj fara scara')
  assert.deepEqual(blocati(w), [])
  // Motivul pe santierele de la etaj: INACCESIBIL, nu altceva (cele fara sprijin inca n-au motiv).
  let inaccesibile = 0
  let faraLocSigur = 0
  for (const id of ramase(w, ids)) {
    const s = slotDesemnare(w.desemnari, id)
    if (w.desemnari.ultimulMotiv[s] === codMotiv(Reason.INACCESIBIL)) {
      inaccesibile++
      if (w.desemnari.ultimulMotivDetaliu[s] === DetaliuMotiv.FARA_LOC_SIGUR) faraLocSigur++
      assert.ok(
        w.desemnari.ultimulMotivDetaliu[s] === DetaliuMotiv.FARA_LOC_SIGUR || w.desemnari.ultimulMotivDetaliu[s] === DetaliuMotiv.FARA_LOC_DE_LUCRU,
        `detaliu ${w.desemnari.ultimulMotivDetaliu[s]}`,
      )
    }
  }
  assert.ok(inaccesibile > 0, 'fixtura: niciun santier de la etaj n-a primit motiv')
  // Peretii de etaj AU vecini pe care se poate sta — placa de deasupra parterului —, dar placa
  // e o punga fara scara: cauza e planul, nu terenul, si „sapa o rampa" ar minti.
  assert.ok(faraLocSigur > 0, 'niciun santier de etaj n-a spus FARA_LOC_SIGUR')
})

test('ACCEPTANTA: camera fara usa — nimeni pe creasta sau inauntru, si dupa editari fara legatura in coada', () => {
  // Pe HEAD, pe 3 din 3 seminte: un pion urca pe randul 1 al unei coloane ca sa zideasca randul 2
  // al vecinului, apoi pe creasta, iar ultimul rand 2 i-l ia de sub picioare. Cu memoria din
  // designul v1, o sapatura sau o desemnare fara legatura in coada construirii il aducea inapoi.
  for (const seed of SEMINTE) {
    const { w, ids, x0, y0, g } = santier(seed, (gg) => { const o: Piesa_[] = []; pereti(o, 0, 0, 5, gg + 1, gg + 2); return o })
    assert.equal(ids.length, 32)
    const n = panaCand(w, 30000, () => ramase(w, ids).length <= 8)
    assert.ok(n >= 0, `seed ${seed}: constructia n-a ajuns la coada`)
    // In coada: o sapatura si un santier departe de casa.
    applyCommand(w, { kind: 'desemneaza', wx: x0 + 14, wy: y0 + 14, z: g, piesa: undefined }, R)
    applyCommand(w, { kind: 'desemneaza', wx: x0 + 15, wy: y0 + 15, z: g + 1, piesa: Piesa.PERETE }, R)
    lasaItem(w, Item.PIATRA, 20, x0 + 13, y0 + 15) // piatra LUI: altfel ia din a camerei
    const m = panaCand(w, 30000, () => ramase(w, ids).length === 0)
    assert.ok(m >= 0, `seed ${seed}: raman ${ramase(w, ids).length} din camera`)
    assert.deepEqual(blocati(w), [], `seed ${seed}`)
  }
})

test('ACCEPTANTA: o camera care se inchide peste un pion care doarme inauntru nu-l zideste acolo', () => {
  // Pionul doarme pe loc, in camera; peretii se ridica in jurul lui. Regula de sigilare tine
  // ultima piesa cat timp e inauntru; nu-l tine pe constructor pe loc cu marfa in mana.
  const { w, ids, x0, y0, g } = santier(12345, (gg) => { const o: Piesa_[] = []; pereti(o, 0, 0, 5, gg + 1, gg + 2); return o })
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (x0 + 2) * 1000 + 500, y: (y0 + 2) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
  const somnoros = w.agents.count - 1
  w.agents.nevoi[somnoros * NEVOI + Nevoie.ODIHNA] = 3
  let refuzuri = 0
  const n = panaCand(w, 40000, (ww) => {
    for (const id of ramase(ww, ids)) {
      const s = slotDesemnare(ww.desemnari, id)
      if (ww.desemnari.ultimulMotiv[s] === codMotiv(Reason.AR_INCHIDE)) refuzuri++
    }
    return ramase(ww, ids).length === 0
  })
  assert.ok(n >= 0, `raman ${ramase(w, ids).length}`)
  assert.deepEqual(blocati(w), [])
  assert.ok(refuzuri > 0, 'fixtura: regula de sigilare n-a refuzat nimic — pionul n-a stat inauntru cand se inchidea')
})

test('ACCEPTANTA: zidul de 4 — randurile 1–3 de pe sol, randul 4 ramane', () => {
  const { w, ids, plan, g } = santier(12345, (gg) => { const o: Piesa_[] = []; for (let z = gg + 1; z <= gg + 4; z++) for (let i = 0; i < 3; i++) o.push([i, 6, z, Piesa.PERETE]); return o })
  ruleaza(w, 20000)
  const ram = new Set(ramase(w, ids))
  for (let i = 0; i < ids.length; i++) {
    const sus = plan[i]![2] === g + 4
    assert.equal(ram.has(ids[i]!), sus, `piesa la dz=${plan[i]![2] - g}: ${ram.has(ids[i]!) ? 'ramasa' : 'zidita'}`)
  }
  assert.deepEqual(blocati(w), [])
})

test('ACCEPTANTA: un etaj nou peste o casa EXISTENTA, cu scara afara, se ridica integral', () => {
  // Designul v1 scotea solul din domeniu cand ramanea doar etajul: 97/97 fara acces, 0 zidite.
  // Casa existenta se face prin COMENZI (fill), ca regiunile sa fie la zi: pereti de 2 cu usa,
  // placa plina (in ordinea randurilor, fiecare celula are un vecin deja pus), o scara lipita
  // de zidul de vest. Etajul are o usa exact unde urca scara.
  const zideste = (w: World, x: number, y: number, z: number): void => {
    const out = applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: Material.PIATRA_CONSTRUITA }, R)
    assert.ok(out.ok, `fixtura: casa existenta la (${x},${y},${z}): ${JSON.stringify(out)}`)
  }
  const { w, ids } = santier(777, (gg) => {
    const o: Piesa_[] = []
    pereti(o, 0, 0, 7, gg + 4, gg + 5, [[0, 3]])
    placa(o, 0, 0, 7, gg + 6)
    return o
  }, 4, (ww, x0, y0, g) => {
    for (let z = g + 1; z <= g + 2; z++) {
      for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) {
        if (dx !== 0 && dx !== 6 && dy !== 0 && dy !== 6) continue
        if (dx === 3 && dy === 0) continue
        zideste(ww, x0 + dx, y0 + dy, z)
      }
    }
    for (let dx = 0; dx < 7; dx++) for (let dy = 0; dy < 7; dy++) zideste(ww, x0 + dx, y0 + dy, g + 3)
    zideste(ww, x0 - 2, y0 + 3, g + 1)
    zideste(ww, x0 - 1, y0 + 3, g + 1)
    zideste(ww, x0 - 1, y0 + 3, g + 2)
  })
  assert.equal(ids.length, 95)
  const n = panaCand(w, 60000, () => ramase(w, ids).length === 0)
  assert.ok(n >= 0, `raman ${ramase(w, ids).length} din ${ids.length}`)
  assert.deepEqual(blocati(w), [])
})

test('ACCEPTANTA: o camera in fundul unei gropi adanci de 4 m, cu rampa, se ridica integral', () => {
  // Designul v1 lega exteriorul de cotele planului: un plan subteran cu iesirea mai sus de
  // zmax + 3 era declarat fara acces in intregime. Aici nu exista domeniu: flood-ul urca rampa.
  // Groapa si rampa se sapa prin COMENZI, de sus in jos, inainte de desemnare.
  const sapa = (w: World, x: number, y: number, z: number): void => {
    const out = applyCommand(w, { kind: 'dig', wx: x, wy: y, z }, R)
    assert.ok(out.ok, `fixtura: groapa la (${x},${y},${z}): ${JSON.stringify(out)}`)
  }
  const { w, ids } = santier(4242, (gg) => { const o: Piesa_[] = []; pereti(o, 1, 1, 5, gg - 3, gg - 2, [[2, 0]]); return o }, 4, (ww, x0, y0, g) => {
    for (let z = g; z >= g - 3; z--) for (let dx = 0; dx < 8; dx++) for (let dy = 0; dy < 8; dy++) sapa(ww, x0 + dx, y0 + dy, z)
    // Rampa pe dy = −1, spre vest: la dx = 4 − k se sapa pana la g − 3 + k + 1, deci trepte de 1 m.
    for (let k = 0; k < 4; k++) for (let z = g; z >= g - 3 + k + 1; z--) sapa(ww, x0 + 4 - k, y0 - 1, z)
    // Sapatul prin comanda lasa piatra pe fundul gropii; ar ocupa celulele santierelor.
    const it = ww.iteme
    for (let i = 0; i < it.count; i++) {
      if (it.alive[i] === 1 && it.wx[i]! >= x0 - 1 && it.wx[i]! <= x0 + 8 && it.wy[i]! >= y0 - 2 && it.wy[i]! <= y0 + 8) stergeItem(it, i)
    }
  })
  assert.equal(ids.length, 30)
  const n = panaCand(w, 60000, () => ramase(w, ids).length === 0)
  assert.ok(n >= 0, `raman ${ramase(w, ids).length} din ${ids.length}`)
  assert.deepEqual(blocati(w), [])
})

test('M5 in coada casei cu doua etaje: o lume incarcata ia aceleasi decizii ca cea continua', () => {
  // Designul v1: 1.087 din 1.200 de save-uri roseau aici — memoria accesului retinea peste o
  // zidire un raspuns pe care recalculul nu-l mai dadea. Acum memoria e o functie pura: o copie
  // incarcata (memorie RECE) si lumea continua (memorie CALDA) trebuie sa evolueze identic.
  const { w, ids, plan, g } = santier(12345, casaCuEtaj(true))
  const parter = ids.filter((_, i) => plan[i]![2] <= g + 3)
  const n = panaCand(w, 60000, () => parter.every((id) => slotDesemnare(w.desemnari, id) === -1))
  assert.ok(n >= 0, 'fixtura: parterul nu s-a terminat')
  const zidite0 = ramase(w, ids).length
  const pasi = [...Array(40).fill(1), ...Array(30).fill(20)] as number[]
  for (const k of pasi) {
    const out = decode(encode(w), R)
    assert.ok(out.ok)
    if (!out.ok) return
    const inc = out.value
    advance(w, k, R)
    advance(inc, k, R)
    assert.equal(hashWorld(inc), hashWorld(w), `tickul ${w.tick}: lumea incarcata a divergat`)
  }
  // Fixtura VIE: in fereastra s-a zidit la etaj, deci memoria chiar a decis ceva.
  assert.ok(ramase(w, ids).length < zidite0, 'fixtura: nimic zidit in fereastra M5')
})

test('perechea „cu memorie / fara memorie" da acelasi hash pe casa cu doua etaje', () => {
  const a = santier(777, casaCuEtaj(true))
  const b = santier(777, casaCuEtaj(true))
  for (let t = 0; t < 12000; t++) {
    advance(a.w, 1, R)
    b.w.acces = memorieAcces()
    advance(b.w, 1, R)
  }
  assert.equal(hashWorld(a.w), hashWorld(b.w))
  assert.ok(ramase(a.w, a.ids).length < a.ids.length - 40, 'fixtura: prea putin s-a construit in fereastra')
})


// ---------------------------------------------------------------------------
// gardurile pasului 5, fiecare cu scena ei
// ---------------------------------------------------------------------------

function zidesteCmd(w: World, x: number, y: number, z: number): void {
  const out = applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: Material.PIATRA_CONSTRUITA }, R)
  assert.ok(out.ok, `fixtura: zidul la (${x},${y},${z}): ${JSON.stringify(out)}`)
}
function sapaCmd(w: World, x: number, y: number, z: number): void {
  const out = applyCommand(w, { kind: 'dig', wx: x, wy: y, z }, R)
  assert.ok(out.ok, `fixtura: sapatura la (${x},${y},${z}): ${JSON.stringify(out)}`)
}
/** Sterge mormanele dintr-un dreptunghi (lasate de sapatul prin comanda). */
function curataMormane(w: World, xa: number, ya: number, xb: number, yb: number): void {
  const it = w.iteme
  for (let i = 0; i < it.count; i++) {
    if (it.alive[i] === 1 && it.wx[i]! >= xa && it.wx[i]! <= xb && it.wy[i]! >= ya && it.wy[i]! <= yb) stergeItem(it, i)
  }
}
/** Camera 5x5 cu pereti de 2 zidita prin comenzi, fara celulele din `goluri`. */
function cameraZidita(w: World, x0: number, y0: number, g: number, goluri: readonly (readonly [number, number])[]): void {
  for (let z = g + 1; z <= g + 2; z++) {
    for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
      if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
      if (goluri.some(([a, b]) => a === dx && b === dy)) continue
      zidesteCmd(w, x0 + dx, y0 + dy, z)
    }
  }
}
function pion(w: World, x: number, y: number, z: number): number {
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: x * 1000 + 500, y: y * 1000 + 500, z, faction: Faction.ASEZARE }, R).ok)
  return w.agents.count - 1
}

test('PRIVIREA INAINTE: un pion prins intr-o groapa isi zideste singur treapta de iesire', () => {
  // Celula pionului e o punga (groapa de 2 m) — nesigura. Fara privirea inainte, nimeni n-ar
  // zidi treapta: cei de afara nu ajung 2 m in jos, cel prins n-are voie din punga. Pe HEAD
  // se salva; designul v2 fara privire inainte il lasa acolo.
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  for (const z of [g, g - 1]) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) sapaCmd(w, x0 + dx, y0 + dy, z)
  curataMormane(w, x0 - 1, y0 - 1, x0 + 3, y0 + 3)
  const prins = pion(w, x0 + 1, y0 + 1, g - 1)
  // Pe fundul gropii: `lasaItem` din fixturi ar pune pe cota heightfield-ului, adica sus.
  assert.ok(applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: 20, wx: x0, wy: y0, z: g - 1 }, R).ok)
  const sant = applyCommand(w, { kind: 'desemneaza', wx: x0 + 1, wy: y0 + 2, z: g - 1, piesa: Piesa.SCARA }, R)
  assert.ok(sant.ok, JSON.stringify(sant))
  assert.equal(blocati(w).length, 1, 'fixtura: pionul trebuia sa fie prins')
  const n = panaCand(w, 4000, () => slotDesemnare(w.desemnari, sant.ok ? sant.value : -1) === -1)
  assert.ok(n >= 0, 'pionul prins n-a zidit treapta care il scoate')
  ruleaza(w, 600)
  assert.deepEqual(blocati(w), [], 'pionul a ramas in groapa si cu treapta zidita')
  void prins
})

test('SIGILAREA la zidire: un pion intrat in camera CAT TIMP se lucra la ultima piesa nu e zidit inauntru', () => {
  // Poarta de la primul tick de munca a trecut (camera era goala); pionul intra dupa. Fara
  // verificarea de dinaintea zidirii, usa se inchide peste el.
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  cameraZidita(w, x0, y0, g, [[2, 0]])
  // Doar BUIANDRUGUL: el singur inchide camera (usa de sub el ramane fara loc de cap). Cu tot
  // golul desemnat, constructorul lucra intai la pragul de jos, care nu inchide nimic, iar scena
  // nu mai proba verificarea de dinaintea zidirii.
  const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + 2, wy: y0, z: g + 2, piesa: Piesa.PERETE }, R)
  assert.ok(o.ok)
  const buiandrug = o.ok ? o.value : -1
  lasaItem(w, Item.PIATRA, 40, x0 + 2, y0 - 3)
  const constructor = pion(w, x0 + 4, y0 - 3, g + 1)
  // Pionul intra la ULTIMUL tick de munca: la tickul urmator se pune piesa, deci singura poarta
  // care il poate vedea e cea de dinaintea zidirii.
  const spec = R.piese[Piesa.PERETE]!
  let intrat = false
  for (let t = 0; t < 6000 && !intrat; t++) {
    advance(w, 1, R)
    const a = w.agents
    if (a.jobKind[constructor] === FelJob.CONSTRUIESTE && a.jobStep[constructor] === PasConstruieste.ZIDESTE && a.jobProgres[constructor]! + unitatiDeMunca(w, R, constructor) >= spec.lucru) {
      pion(w, x0 + 2, y0 + 2, g + 1)
      intrat = true
    }
  }
  assert.ok(intrat, 'fixtura: constructorul n-a ajuns la ultimul tick al buiandrugului')
  advance(w, 1, R)
  assert.notEqual(slotDesemnare(w.desemnari, buiandrug), -1, 'buiandrugul s-a pus cu pionul inauntru')
  ruleaza(w, 300)
  assert.deepEqual(blocati(w), [], 'buiandrugul s-a pus peste pionul intrat')
})

test('SIGILAREA la primul tick: o piesa care ar inchide ceva nu consuma munca', () => {
  // Un morman in camera; constructorul ajunge la usa. Refuzul trebuie sa vina INAINTE de munca
  // — altfel fiecare incercare arde `lucru` tickuri pe o piesa care nu se poate pune. (Un morman,
  // nu un pion care doarme: pionul iese uneori la plimbare inainte sa adoarma, iar scena n-ar mai
  // proba ce spune.)
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  cameraZidita(w, x0, y0, g, [[2, 0]])
  lasaItem(w, Item.HRANA, 30, x0 + 2, y0 + 2)
  // Doua piese in usa. Cea de JOS, singura, nu inchide nimic — peste un prag de 1 m se trece —
  // deci munca pe ea e legitima. Cea de SUS (buiandrugul) inchide: pe ea nu se munceste deloc.
  const usa: number[] = []
  for (const z of [g + 1, g + 2]) {
    const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + 2, wy: y0, z, piesa: Piesa.PERETE }, R)
    assert.ok(o.ok)
    if (o.ok) usa.push(o.value)
  }
  const buiandrug = usa[1]!
  lasaItem(w, Item.PIATRA, 40, x0 + 2, y0 - 3)
  const constructor = pion(w, x0 + 4, y0 - 3, g + 1)
  let munca = 0
  let refuzuri = 0
  for (let t = 0; t < 1500; t++) {
    advance(w, 1, R)
    const a = w.agents
    if (a.jobKind[constructor] === FelJob.CONSTRUIESTE && a.jobDest[constructor] === buiandrug && a.jobStep[constructor] === PasConstruieste.ZIDESTE && a.jobProgres[constructor]! > 0) munca++
    for (let i = 0; i < w.desemnari.count; i++) {
      if (w.desemnari.alive[i] === 1 && w.desemnari.ultimulMotiv[i] === codMotiv(Reason.AR_INCHIDE)) refuzuri++
    }
  }
  assert.ok(refuzuri > 0, 'fixtura: buiandrugul n-a fost refuzat niciodata')
  assert.equal(slotDesemnare(w.desemnari, usa[0]!), -1, 'fixtura: pragul de jos trebuia zidit — el nu inchide nimic')
  assert.equal(munca, 0, `s-au muncit ${munca} tickuri pe un buiandrug care nu se putea pune`)
  assert.deepEqual(blocati(w), [])
})

test('REVALIDAREA: un constructor al carui loc de lucru devine nesigur se opreste', () => {
  // Constructorul lucreaza la o piesa DIN camera, stand inauntru; jucatorul deseneaza usa.
  // Din clipa aia interiorul e o punga in lumea de la final: locul nu mai e sigur, si piesa
  // din camera nu mai are niciun loc sigur (FARA_LOC_SIGUR).
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  cameraZidita(w, x0, y0, g, [[2, 0]])
  const inauntru = applyCommand(w, { kind: 'desemneaza', wx: x0 + 2, wy: y0 + 3, z: g + 1, piesa: Piesa.PODEA }, R)
  assert.ok(inauntru.ok)
  const idInauntru = inauntru.ok ? inauntru.value : -1
  // Piatra si pentru usa: altfel usa o ia pe a piesei din camera, si cauza devine LIPSA_MATERIAL.
  lasaItem(w, Item.PIATRA, 60, x0 + 1, y0 + 1)
  const constructor = pion(w, x0 + 3, y0 + 1, g + 1)
  let desenat = false
  for (let t = 0; t < 4000 && !desenat; t++) {
    advance(w, 1, R)
    const a = w.agents
    if (a.jobKind[constructor] === FelJob.CONSTRUIESTE && a.jobStep[constructor] === PasConstruieste.ZIDESTE && a.jobProgres[constructor]! > 0) {
      for (const z of [g + 1, g + 2]) assert.ok(applyCommand(w, { kind: 'desemneaza', wx: x0 + 2, wy: y0, z, piesa: Piesa.PERETE }, R).ok)
      desenat = true
    }
  }
  assert.ok(desenat, 'fixtura: constructorul n-a inceput piesa din camera')
  // Cauza scrisa CHIAR la oprire, nu doar de scanarea urmatoare: niciun loc SIGUR, nu „niciun loc".
  const oprit = panaCand(w, 200, () => w.agents.jobKind[constructor] === 0)
  assert.ok(oprit >= 0, 'constructorul n-a lasat piesa din camera')
  const s0 = slotDesemnare(w.desemnari, idInauntru)
  assert.notEqual(s0, -1)
  assert.equal(w.desemnari.ultimulMotivDetaliu[s0], DetaliuMotiv.FARA_LOC_SIGUR, 'la oprire, cauza spunea „niciun loc de lucru"')
  ruleaza(w, 1500)
  const s = slotDesemnare(w.desemnari, idInauntru)
  assert.notEqual(s, -1, 'piesa din camera s-a zidit dintr-un loc devenit nesigur')
  assert.equal(w.desemnari.ultimulMotivDetaliu[s], DetaliuMotiv.FARA_LOC_SIGUR)
})

test('SIGILAREA inchide doar ce era DESCHIS: un gard in jurul unei gropi cu un pion deja prins se ridica', () => {
  // Groapa era deja o punga; gardul nu inchide nimic. Prima forma a regulii tinea constructorii
  // pe loc pana murea cel prins (panoul v2: 65.000 de tickuri-pion, un constructor mort).
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x0 = wx + 6, y0 = wy + 6
  for (const z of [g, g - 1]) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) sapaCmd(w, x0 + dx, y0 + dy, z)
  curataMormane(w, x0 - 1, y0 - 1, x0 + 3, y0 + 3)
  pion(w, x0 + 1, y0 + 1, g - 1)
  const ids: number[] = []
  for (let dx = -1; dx <= 3; dx++) for (let dy = -1; dy <= 3; dy++) {
    if (dx !== -1 && dx !== 3 && dy !== -1 && dy !== 3) continue
    const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + dx, wy: y0 + dy, z: g + 1, piesa: Piesa.PERETE }, R)
    assert.ok(o.ok)
    if (o.ok) ids.push(o.value)
  }
  for (let i = 0; i < 6; i++) lasaItem(w, Item.PIATRA, 60, x0 - 4, y0 - 2 + i)
  for (let i = 0; i < 3; i++) pion(w, x0 - 5, y0 + i, g + 1)
  const n = panaCand(w, 20000, () => ramase(w, ids).length === 0)
  assert.ok(n >= 0, `gardul s-a oprit: raman ${ramase(w, ids).length} din ${ids.length}`)
})

test('SIGILAREA: un morman sau o celula de depozit inauntru opresc ultima piesa, cu AR_INCHIDE', () => {
  // Pe designul v2, regula tinea pionii afara si inchidea camera cu toata hrana inauntru: la
  // o incinta de 20, 12 din 12 morti. Marfa si depozitul se protejeaza ca pionii.
  for (const ce of ['morman', 'zona'] as const) {
    const { w, ids, x0, y0, g } = santier(12345, (gg) => { const o: Piesa_[] = []; pereti(o, 0, 0, 5, gg + 1, gg + 2); return o })
    if (ce === 'morman') lasaItem(w, Item.HRANA, 30, x0 + 2, y0 + 2)
    // O zona de DORMIT: in ea nu se cara nimic — cu un depozit, refuzul venea de la mormanul
    // carat inauntru, nu de la zona, si proba zonei iesea RATATA.
    else assert.ok(applyCommand(w, { kind: 'picteazaZona', x0: x0 + 2, y0: y0 + 2, x1: x0 + 2, y1: y0 + 2, z: g + 1, fel: Zona.DORMIT }, R).ok)
    let refuzat = false
    panaCand(w, 25000, (ww) => {
      for (const id of ramase(ww, ids)) {
        const s = slotDesemnare(ww.desemnari, id)
        if (ww.desemnari.ultimulMotiv[s] === codMotiv(Reason.AR_INCHIDE)) refuzat = true
      }
      return false
    })
    assert.ok(ramase(w, ids).length > 0, `${ce}: camera s-a inchis cu ${ce} inauntru`)
    assert.ok(refuzat, `${ce}: piesa ramasa n-a spus AR_INCHIDE`)
    assert.deepEqual(blocati(w), [])
  }
})
