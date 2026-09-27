/**
 * Accesul vertical — REGULA DE SIGILARE, dupa recenzia din 27.09.
 *
 * Recenzia a gasit un defect viu in bucla semintelor (`componenteInchiseDe`): verdictul
 * „inchisa DE p" il dadea PRIMA samanta a unei componente K' din W ∪ {p}. Cand celula de peste
 * p leaga o punga veche din W (creasta peretilor) de o regiune deschisa in W, iar samanta
 * crestei vine prima, interiorul nu se mai verifica si pionul e zidit inauntru: 6 din 314
 * cazuri de sigilare in fuzz, iar in joc pionul care dormea, pe seed 777. Si ambele limite ale
 * semintelor (pz − H − pas jos, pz + 1 + pas sus) n-aveau nicio scena care sa le ceara.
 *
 * Aici: scenele verificatorului (camera cu podea inaltata; camera adancita; pragul sub
 * buiandrug; camera inaltata sub prag), fiecare si ca intrebare directa, si ca joc cu un pion
 * intrat la ultimul tick de munca; plus oracolul formei pe memorie (aceeasi functie, flood-uri
 * oprite la etichetele deschise) fata de forma pura, cu tot cu ordinea listelor.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { componenta, componenteInchiseDe, componenteInchiseDeMemorat, memorieAcces, nodW, siguraMemorat } from '../src/sim/acces.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { slotDesemnare } from '../src/sim/desemnari.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { cellKey } from '../src/sim/path.ts'
import { Faction, FelJob, Item, Nevoie, NEVOI, PasConstruieste, Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { stergeItem } from '../src/sim/iteme.ts'
import { advance } from '../src/sim/world.ts'
import { unitatiDeMunca } from '../src/sim/joburi.ts'
import { lasaItem, panaCand, R, ruleaza, sitPlat } from './fixturi.ts'

function umple(w: World, x: number, y: number, z: number): void {
  const o = applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: Material.PIATRA_CONSTRUITA }, R)
  assert.ok(o.ok, `fixtura: fill ${x},${y},${z}: ${JSON.stringify(o)}`)
}
function sapa(w: World, x: number, y: number, z: number): void {
  const o = applyCommand(w, { kind: 'dig', wx: x, wy: y, z }, R)
  assert.ok(o.ok, `fixtura: dig ${x},${y},${z}: ${JSON.stringify(o)}`)
}
/** Sapaturile din comanda lasa mormane; o scena de geometrie nu le vrea. */
function curataMormane(w: World, xa: number, ya: number, xb: number, yb: number): void {
  const it = w.iteme
  for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && it.wx[i]! >= xa && it.wx[i]! <= xb && it.wy[i]! >= ya && it.wy[i]! <= yb) stergeItem(it, i)
}
function pion(w: World, x: number, y: number, z: number): number {
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: x * 1000 + 500, y: y * 1000 + 500, z, faction: Faction.ASEZARE }, R).ok)
  return w.agents.count - 1
}
/** Pionii vii fara drum spre „afara" (componenta lor in W e inchisa, sau nu stau pe o celula calcabila). */
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

interface Scena { w: World; x0: number; y0: number; g: number; p: [number, number, number]; interior: [number, number, number] }

/**
 * Scenele, toate cu H = 2 si pas = 1:
 *  - ORDINE: camera 4×4, pereti g+1..g+3, interiorul 2×2 INALTAT (podea zidita la g+1), usa
 *    (1,0) deschisa pe toata inaltimea. Creasta peretilor (g+4) e o punga in W. p = (1,0,g+2):
 *    taie usa, iar celula de PESTE p leaga interiorul de creasta. Samanta crestei (coloana
 *    (2,0), la pz+2) vine inaintea interiorului in ordinea directii × niveluri.
 *  - ADANCITA: camera 5×5, pereti g+1..g+2, interiorul 3×3 sapat la g, buiandrugul p la g+2:
 *    interiorul atinge usa doar de la pz−2 (limita de JOS a semintelor).
 *  - PRAG: pereti g+1..g+3, un prag zidit in usa la g+1, usa calcabila la g+2, buiandrugul p la
 *    g+3; interiorul la g+1 — tot samanta la pz−2.
 *  - INALTATA: pereti g+1..g+3, interiorul 3×3 inaltat (podea la g+1), buiandrugul zidit la g+3,
 *    p = PRAGUL la g+1 in usa: interiorul atinge usa doar de la pz+1 (limita de SUS).
 */
function scena(fel: 'ordine' | 'adancita' | 'prag' | 'inaltata', seed = 12345): Scena {
  const { w, wx, wy, g } = sitPlat(seed, 18)
  const x0 = wx + 6, y0 = wy + 6
  if (fel === 'ordine') {
    for (let z = g + 1; z <= g + 3; z++) {
      for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 4; dy++) {
        if (dx !== 0 && dx !== 3 && dy !== 0 && dy !== 3) continue
        if (dx === 1 && dy === 0) continue
        umple(w, x0 + dx, y0 + dy, z)
      }
    }
    for (let dx = 1; dx <= 2; dx++) for (let dy = 1; dy <= 2; dy++) umple(w, x0 + dx, y0 + dy, g + 1)
    return { w, x0, y0, g, p: [x0 + 1, y0, g + 2], interior: [x0 + 2, y0 + 2, g + 2] }
  }
  const sus = fel === 'adancita' ? g + 2 : g + 3
  for (let z = g + 1; z <= sus; z++) {
    for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
      if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
      if (dx === 2 && dy === 0 && (fel !== 'inaltata' || z <= g + 2)) continue
      umple(w, x0 + dx, y0 + dy, z)
    }
  }
  if (fel === 'adancita') {
    for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) sapa(w, x0 + dx, y0 + dy, g)
    curataMormane(w, x0 - 1, y0 - 1, x0 + 5, y0 + 5)
    return { w, x0, y0, g, p: [x0 + 2, y0, g + 2], interior: [x0 + 2, y0 + 2, g] }
  }
  if (fel === 'prag') {
    umple(w, x0 + 2, y0, g + 1)
    return { w, x0, y0, g, p: [x0 + 2, y0, g + 3], interior: [x0 + 2, y0 + 2, g + 1] }
  }
  for (let dx = 1; dx <= 3; dx++) for (let dy = 1; dy <= 3; dy++) umple(w, x0 + dx, y0 + dy, g + 1)
  return { w, x0, y0, g, p: [x0 + 2, y0, g + 1], interior: [x0 + 2, y0 + 2, g + 2] }
}

const SCENE = ['ordine', 'adancita', 'prag', 'inaltata'] as const

function verificaScena(fel: (typeof SCENE)[number]): void {
  const { w, p, interior } = scena(fel)
  const faraP = nodW(w.terrain, null, R)
  const cuP = nodW(w.terrain, new Set([cellKey(...p)]), R)
  assert.ok(faraP.calcabila(...interior) && componenta(faraP, R, ...interior).deschisa, 'fixtura: interiorul trebuia DESCHIS in W')
  assert.ok(cuP.calcabila(...interior) && !componenta(cuP, R, ...interior).deschisa, 'fixtura: interiorul trebuia INCHIS cu p')
  const inchise = componenteInchiseDe(w.terrain, R, ...p)
  assert.ok(inchise.some((c) => c.includes(cellKey(...interior))), `[${fel}] p inchide interiorul — regula de sigilare n-a vazut`)
}

// Numele sunt scrise de mana: probele de mutatie numesc testul, iar verificarea statica le citeste.
test('SIGILAREA [ordine]: p inchide interiorul, deschis in W — regula il vede', () => verificaScena('ordine'))
test('SIGILAREA [adancita]: p inchide interiorul, deschis in W — regula il vede', () => verificaScena('adancita'))
test('SIGILAREA [prag]: p inchide interiorul, deschis in W — regula il vede', () => verificaScena('prag'))
test('SIGILAREA [inaltata]: p inchide interiorul, deschis in W — regula il vede', () => verificaScena('inaltata'))

test('SIGILAREA [ordine]: fixtura are creasta ca punga in W, legata de interior prin celula de peste p', () => {
  const { w, x0, y0, g, p, interior } = scena('ordine')
  const faraP = nodW(w.terrain, null, R)
  const cuP = nodW(w.terrain, new Set([cellKey(...p)]), R)
  const creasta = [x0 + 2, y0, g + 4] as const
  assert.ok(faraP.calcabila(...creasta) && !componenta(faraP, R, ...creasta).deschisa, 'fixtura: creasta trebuia punga in W')
  assert.ok(componenta(cuP, R, ...interior).celule.includes(cellKey(...creasta)), 'fixtura: cu p, creasta si interiorul trebuiau sa fie aceeasi componenta')
})

/** Constructorul ajunge la ultimul tick de munca pe p; atunci un pion apare inauntru. */
function ultimulTick(fel: (typeof SCENE)[number]): { pus: boolean; blocati: string[] } {
  const { w, x0, y0, g, p, interior } = scena(fel)
  const o = applyCommand(w, { kind: 'desemneaza', wx: p[0], wy: p[1], z: p[2], piesa: Piesa.PERETE }, R)
  assert.ok(o.ok, JSON.stringify(o))
  const piesa = o.ok ? o.value : -1
  lasaItem(w, Item.PIATRA, 40, x0 + 2, y0 - 3)
  const constructor = pion(w, x0 + 4, y0 - 3, g + 1)
  const spec = R.piese[Piesa.PERETE]!
  let intrat = false
  for (let t = 0; t < 6000 && !intrat; t++) {
    advance(w, 1, R)
    const a = w.agents
    if (a.jobKind[constructor] === FelJob.CONSTRUIESTE && a.jobStep[constructor] === PasConstruieste.ZIDESTE && a.jobProgres[constructor]! + unitatiDeMunca(w, R, constructor) >= spec.lucru) {
      pion(w, ...interior)
      intrat = true
    }
  }
  assert.ok(intrat, `[${fel}] fixtura: constructorul n-a ajuns la ultimul tick de munca`)
  advance(w, 1, R)
  const pus = slotDesemnare(w.desemnari, piesa) === -1
  ruleaza(w, 300)
  return { pus, blocati: blocati(w) }
}

function verificaInJoc(fel: (typeof SCENE)[number]): void {
  const r = ultimulTick(fel)
  assert.ok(!r.pus, `[${fel}] piesa s-a pus cu pionul inauntru`)
  assert.deepEqual(r.blocati, [], `[${fel}] pion zidit inauntru`)
}

test('SIGILAREA [ordine] in joc: un pion intrat la ultimul tick de munca nu e zidit inauntru', () => verificaInJoc('ordine'))
test('SIGILAREA [adancita] in joc: un pion intrat la ultimul tick de munca nu e zidit inauntru', () => verificaInJoc('adancita'))
test('SIGILAREA [prag] in joc: un pion intrat la ultimul tick de munca nu e zidit inauntru', () => verificaInJoc('prag'))
test('SIGILAREA [inaltata] in joc: un pion intrat la ultimul tick de munca nu e zidit inauntru', () => verificaInJoc('inaltata'))

/**
 * Acceptanta, fara pion teleportat: camera cu podea inaltata si pereti de 3, usa PLANIFICATA sa
 * fie zidita pe toata inaltimea, un pion care DOARME inauntru (seed 777: pe forma veche, zidit).
 */
for (const seed of [12345, 777, 4242]) {
  test(`SIGILAREA [ordine] acceptanta seed ${seed}: usa zidita a camerei cu podea inaltata nu inchide pionul care doarme`, () => {
    const { w, wx, wy, g } = sitPlat(seed, 18)
    const x0 = wx + 6, y0 = wy + 6
    for (let z = g + 1; z <= g + 3; z++) {
      for (let dx = 0; dx < 4; dx++) for (let dy = 0; dy < 4; dy++) {
        if (dx !== 0 && dx !== 3 && dy !== 0 && dy !== 3) continue
        if (dx === 1 && dy === 0) continue
        umple(w, x0 + dx, y0 + dy, z)
      }
    }
    for (let dx = 1; dx <= 2; dx++) for (let dy = 1; dy <= 2; dy++) umple(w, x0 + dx, y0 + dy, g + 1)
    const ids: number[] = []
    for (let z = g + 1; z <= g + 3; z++) {
      const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + 1, wy: y0, z, piesa: Piesa.PERETE }, R)
      assert.ok(o.ok, JSON.stringify(o))
      if (o.ok) ids.push(o.value)
    }
    lasaItem(w, Item.PIATRA, 60, x0 + 1, y0 - 4)
    for (let i = 0; i < 10; i++) lasaItem(w, Item.HRANA, 75, wx + 14 + (i % 3), wy - 1 + ((i / 3) | 0))
    for (let i = 0; i < 3; i++) pion(w, x0 + 5 + i, y0 - 3, g + 1)
    const somnoros = pion(w, x0 + 2, y0 + 2, g + 2)
    w.agents.nevoi[somnoros * NEVOI + Nevoie.ODIHNA] = 3
    const ramase = (): number => ids.filter((id) => slotDesemnare(w.desemnari, id) !== -1).length
    // Zidirea peste pion e ireversibila, deci „blocat” se numara o data, la capat (floodul
    // pe fiecare tick costa 25 s pe test).
    panaCand(w, 6000, () => ramase() === 0)
    ruleaza(w, 300)
    assert.deepEqual(blocati(w), [], `seed ${seed}: pionul care dormea a fost zidit inauntru`)
  })
}

test('SIGILAREA sare piesa care nu scoate nicio celula calcabila din W (placa, randul de sus): niciun flood', () => {
  const { w, x0, y0, g } = scena('prag')
  const stat = memorieAcces().stat
  // Deasupra buiandrugului planificat al scenei „prag" (g+3): coloana usii n-are nimic calcabil
  // intre g+3 si g+4 — celula de la g+2 e sub p, iar capul ei (g+3) e chiar p.
  assert.deepEqual(componenteInchiseDe(w.terrain, R, x0 + 2, y0, g + 4, undefined, null, stat), [])
  assert.equal(stat.sigilari, 0, `${stat.sigilari} flood-uri pentru o piesa care nu inchide nimic`)
  assert.equal(stat.sigilariSarite, 1)
  // Controlul: buiandrugul insusi scoate usa (g+2) si inunda.
  componenteInchiseDe(w.terrain, R, x0 + 2, y0, g + 3, undefined, null, stat)
  assert.ok(stat.sigilari > 0, 'fixtura: buiandrugul trebuia sa inunde')
})

test('SIGILAREA pe memorie == forma pura, cu tot cu ordinea listelor, pe toate scenele si dupa editari', () => {
  let comparatii = 0
  let neVide = 0
  for (const fel of SCENE) {
    const { w, x0, y0, g } = scena(fel)
    const t = w.terrain
    // Santiere pe inelul camerei si deasupra lui, ca memoria sa aiba un plan C in care p ∈ C.
    const piese: [number, number, number][] = []
    for (let dx = -1; dx <= 5; dx++) {
      for (let dy = -1; dy <= 5; dy++) {
        for (let z = g + 1; z <= g + 4; z++) {
          if (dx !== -1 && dx !== 5 && dy !== -1 && dy !== 5 && (dx !== 2 || dy !== 0)) continue
          const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + dx, wy: y0 + dy, z, piesa: Piesa.PERETE }, R)
          if (o.ok) piese.push([x0 + dx, y0 + dy, z])
        }
      }
    }
    assert.ok(piese.length > 40, `fixtura [${fel}]: doar ${piese.length} santiere`)
    const m = memorieAcces()
    for (let pas = 0; pas < 3; pas++) {
      // Memoria INCALZITA, ca in joc (scanerul intreaba inainte de zidire): fara etichete, oprirea
      // la etichetele deschise n-ar avea la ce sa se opreasca, iar oracolul ar compara doua forme
      // identice.
      for (let x = x0 - 2; x <= x0 + 6; x++) for (let y = y0 - 2; y <= y0 + 6; y++) for (let z = g - 1; z <= g + 5; z++) siguraMemorat(t, w.desemnari, R, m, x, y, z)
      assert.ok(m.eticheta.size > 0, `fixtura [${fel}]: memoria n-are nicio eticheta`)
      for (const p of piese) {
        const a = componenteInchiseDeMemorat(t, w.desemnari, R, m, ...p)
        const b = componenteInchiseDe(t, R, ...p)
        assert.deepEqual(a, b, `[${fel}] pasul ${pas}: memoria si forma pura difera la (${p[0] - x0},${p[1] - y0},${p[2] - g})`)
        comparatii++
        if (b.length > 0) neVide++
      }
      // O editare intre treceri: memoria trebuie sa urmeze (usa se umple, apoi un gol in perete).
      if (pas === 0) umple(w, x0 + 2, y0 - 2, g + 1)
      if (pas === 1) sapa(w, x0 + (fel === 'ordine' ? 3 : 4), y0 + 2, g + 1)
    }
    assert.ok(m.stat.flooduri > 0 || m.stat.sigilari > 0, `fixtura [${fel}]: memoria n-a lucrat`)
  }
  assert.ok(comparatii > 500, `fixtura: doar ${comparatii} comparatii`)
  assert.ok(neVide > 0, 'fixtura: nicio piesa n-a inchis nimic — oracolul n-a comparat liste pline')
})
