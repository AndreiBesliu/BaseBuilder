/**
 * Accesul vertical — COBORAREA DE URGENTA (recenzia din 27.09).
 *
 * Regula de acces pazeste ZIDIREA. Deconstructia, prabusirea si sapatul n-aveau nicio garda: cu
 * atingerea +2, pionii desfac un zid stand pe el sau sub o punte, iar prabusirea ii urca pe creste
 * de moloz; la demolarea etajului casei, molozul acoperisului astupa golul scarii. Masurat de
 * recenzie: zidul de 5 m desfacut de la randul 2, 12 din 12 rulari cu pioni blocati; etajul, 2–3
 * pioni sus pe fiecare rulare. Toti plecau apoi din asezare, de foame, fara niciun semnal.
 *
 * Coborarea: un pion FARA TREABA (scanarea n-a gasit nimic) ramas intr-o PUNGA a lui W coboara de
 * pe cea mai apropiata margine pe prima podea de dedesubt, daca e cel mult `coborareUrgentaM` mai
 * jos si intr-o componenta deschisa. Fara treaba, nu imediat: pionul prins isi termina intai ce
 * poate face din punga.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { cititor, componenta, iesireDeUrgenta, memorieAcces, nodW } from '../src/sim/acces.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { DEFAULT_RULES, parseRules } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { slotDesemnare } from '../src/sim/desemnari.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { stergeItem } from '../src/sim/iteme.ts'
import { Faction, Item, Nevoie, NEVOI } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import type { MaterialId } from '../src/sim/terrain/chunk.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { fill, materialAt } from '../src/sim/terrain/terrain.ts'
import { advance } from '../src/sim/world.ts'
import { lasaItem, R, sitPlat } from './fixturi.ts'

function cuCoborare(m: number): Rules {
  const out = parseRules({ ...DEFAULT_RULES, coborareUrgentaM: m })
  assert.ok(out.ok, JSON.stringify(out))
  return out.ok ? out.value : R
}
function umple(w: World, x: number, y: number, z: number, material: MaterialId = Material.PIATRA_CONSTRUITA): void {
  const o = applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material }, R)
  assert.ok(o.ok, `fixtura: fill ${x},${y},${z}: ${JSON.stringify(o)}`)
}
function pion(w: World, x: number, y: number, z: number): number {
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: x * 1000 + 500, y: y * 1000 + 500, z, faction: Faction.ASEZARE }, R).ok)
  return w.agents.count - 1
}
function unde(w: World, i: number): [number, number, number] {
  return [cellOf(w.agents.x[i]!), cellOf(w.agents.y[i]!), w.agents.z[i]!]
}
function blocat(w: World, i: number): boolean {
  const nod = nodW(w.terrain, null, R)
  const [x, y, z] = unde(w, i)
  return !nod.calcabila(x, y, z) || !componenta(nod, R, x, y, z).deschisa
}
function curataMormane(w: World): void {
  const it = w.iteme
  for (let k = 0; k < it.count; k++) if (it.alive[k] === 1) stergeItem(it, k)
}

/**
 * Un stalp de 2 m si, lipita de el, o treapta de 1 m: din sol (g+1) pe treapta (g+2), de pe
 * treapta pe stalp (g+3). Pionul sta pe stalp. Sapata treapta, stalpul e o punga de o celula:
 * pana jos sunt 2 m, peste pasul de 1.
 */
function stalp(material: MaterialId, rules: Rules): { w: World; i: number; x0: number; y0: number; g: number } {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const x0 = wx + 5, y0 = wy + 5
  umple(w, x0, y0, g + 1)
  umple(w, x0, y0, g + 2)
  umple(w, x0 + 1, y0, g + 1, material)
  const i = pion(w, x0, y0, g + 3)
  // Hrana, ca pionul sa nu aiba alt motiv sa plece.
  for (let k = 0; k < 3; k++) lasaItem(w, Item.HRANA, 75, wx + 12, wy + k)
  assert.ok(!blocat(w, i), 'fixtura: pe stalp se urca pe treapta')
  const o = applyCommand(w, { kind: 'dig', wx: x0 + 1, wy: y0, z: g + 1 }, rules)
  assert.ok(o.ok, JSON.stringify(o))
  curataMormane(w)
  return { w, i, x0, y0, g }
}

test('COBORAREA: pionul fara treaba de pe stalpul ramas dupa desfacerea treptei coboara pe sol', () => {
  const { w, i, x0, y0, g } = stalp(Material.PIATRA_CONSTRUITA, R)
  assert.ok(blocat(w, i), 'fixtura: dupa sapatura, stalpul e punga')
  advance(w, 2 * R.jobRescanTicks, R)
  assert.equal(blocat(w, i), false, `pionul a ramas in punga, la ${JSON.stringify(unde(w, i))}`)
  // Controlul: fara coborare, ramane sus.
  const fara = stalp(Material.PIATRA_CONSTRUITA, cuCoborare(0))
  advance(fara.w, 2 * R.jobRescanTicks, cuCoborare(0))
  assert.deepEqual(unde(fara.w, fara.i), [fara.x0, fara.y0, fara.g + 3], 'fixtura: fara coborare pionul trebuia sa ramana pe stalp')
  void x0; void y0; void g
})

test('COBORAREA si dupa sapatul NATURII: treapta de moloz sapata lasa aceeasi punga', () => {
  const { w, i } = stalp(Material.MOLOZ, R)
  advance(w, 2 * R.jobRescanTicks, R)
  assert.equal(blocat(w, i), false)
})

test('COBORAREA asteapta cat pionul are treaba in punga: desface intai piesa de langa el', () => {
  // Doi stalpi lipiti (2 m), pe al doilea o piesa zidita la nivelul pionului, desemnata pentru
  // deconstructie; treapta spre sol sapata. Punga: capul primului stalp. Pionul o desface de acolo
  // (acelasi nivel), apoi, fara treaba, coboara. Coborarea imediata l-ar fi smuls de la ea.
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const x0 = wx + 5, y0 = wy + 5
  for (const dx of [0, 1]) for (const z of [g + 1, g + 2]) umple(w, x0 + dx, y0, z)
  umple(w, x0 + 1, y0, g + 3)
  const i = pion(w, x0, y0, g + 3)
  for (let k = 0; k < 3; k++) lasaItem(w, Item.HRANA, 75, wx + 12, wy + k)
  const piesa = applyCommand(w, { kind: 'desemneaza', wx: x0 + 1, wy: y0, z: g + 3 }, R)
  assert.ok(piesa.ok, JSON.stringify(piesa))
  assert.ok(blocat(w, i), 'fixtura: capul stalpului e punga')
  let jos = -1
  for (let t = 0; t < 3000 && jos < 0; t++) {
    advance(w, 1, R)
    if (!blocat(w, i)) jos = t
  }
  assert.ok(jos >= 0, 'pionul n-a coborat')
  assert.equal(slotDesemnare(w.desemnari, piesa.ok ? piesa.value : -1), -1, 'pionul a coborat inainte sa desfaca piesa din punga lui')
  const m = materialAt(w.terrain, x0 + 1, y0, g + 3)
  assert.ok(m.ok && m.value === Material.AER)
})

/**
 * Un platou natural de 3×3, inalt de 3 m (pionul pe el, la g+4). Iesirea: cea mai apropiata
 * margine de pe care caderea e de cel mult `coborareUrgentaM` pe o podea deschisa.
 */
test('COBORAREA: marginea cea mai apropiata, caderea de cel mult coborareUrgentaM, pe o podea DESCHISA', () => {
  const { w, wx, wy, g } = sitPlat(4242, 16)
  const x0 = wx + 6, y0 = wy + 6
  for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) for (let z = g + 1; z <= g + 3; z++) umple(w, x0 + dx, y0 + dy, z, Material.ROCA)
  const t = w.terrain
  const stat = memorieAcces().stat
  const nod = nodW(t, null, R)
  assert.ok(nod.calcabila(x0 + 1, y0 + 1, g + 4) && !componenta(nod, R, x0 + 1, y0 + 1, g + 4).deschisa, 'fixtura: platoul trebuia sa fie punga')
  // De pe mijloc, cele patru margini sunt la fel de aproape: prima in ordinea BFS e estul (+x).
  assert.deepEqual(iesireDeUrgenta(t, R, x0 + 1, y0 + 1, g + 4, cititor(t), null, stat), [x0 + 3, y0 + 1, g + 1])
  // De pe coltul de vest, marginea de vest e mai aproape.
  assert.deepEqual(iesireDeUrgenta(t, R, x0, y0 + 1, g + 4, cititor(t), null, stat), [x0 - 1, y0 + 1, g + 1])
  // Cu 2 m de coborare, nu se poate sari de pe platoul de 3; cu 3, da.
  assert.equal(iesireDeUrgenta(t, cuCoborare(2), x0 + 1, y0 + 1, g + 4, cititor(t), null, stat), null)
  assert.notEqual(iesireDeUrgenta(t, cuCoborare(3), x0 + 1, y0 + 1, g + 4, cititor(t), null, stat), null)
  // Un pion de pe sol nu e in punga: nicio coborare.
  assert.equal(iesireDeUrgenta(t, R, x0 - 2, y0, g + 1, cititor(t), null, stat), null)
  assert.ok(stat.coborari > 0 && stat.celuleCoborare > 0, 'coborarea nu se numara in poarta de cost')
})

test('COBORAREA: o margine care da tot intr-o punga nu e o iesire, iar o grinda la inaltimea capului nu se trece', () => {
  // Platoul de 3 m (2×3) are la vest o curte inchisa de ziduri de 3 m (tot o punga) si la est
  // solul — dar pe marginea de est, in dreptul capului pionului, o grinda in aer.
  const { w, wx, wy, g } = sitPlat(4242, 16)
  const x0 = wx + 8, y0 = wy + 6
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 3; dy++) for (let z = g + 1; z <= g + 3; z++) umple(w, x0 + dx, y0 + dy, z, Material.ROCA)
  for (let z = g + 1; z <= g + 3; z++) {
    for (let dy = -1; dy <= 3; dy++) umple(w, x0 - 4, y0 + dy, z)
    for (let dx = -3; dx <= -1; dx++) { umple(w, x0 + dx, y0 - 1, z); umple(w, x0 + dx, y0 + 3, z) }
  }
  const t = w.terrain
  // Grinda, direct in teren (o piesa in aer nu s-ar desena): la g+5, deasupra marginii de est a
  // celulei (x0+1, y0+1) — capul unui pion care ar trece de acolo.
  assert.ok(fill(t, x0 + 2, y0 + 1, g + 5, Material.GRINDA).ok)
  const nod = nodW(t, null, R)
  assert.ok(!componenta(nod, R, x0 - 2, y0 + 1, g + 1).deschisa, 'fixtura: curtea trebuia sa fie punga')
  // In ordinea BFS din coltul de vest: (x0, y0+1) da la vest in curte — punga; (x0+1, y0+1) da la
  // est sub grinda — nu se trece; (x0, y0+2) da la sud, pe solul de afara: iesirea.
  const tinta = iesireDeUrgenta(t, R, x0, y0 + 1, g + 4, cititor(t), null, memorieAcces().stat)
  assert.notDeepEqual(tinta, [x0 - 1, y0 + 1, g + 1], 'pionul a sarit in curtea inchisa')
  assert.notDeepEqual(tinta, [x0 + 2, y0 + 1, g + 1], 'pionul a trecut pe sub grinda de la inaltimea capului')
  assert.deepEqual(tinta, [x0, y0 + 3, g + 1])
})

/**
 * Doi stalpi lipiti de 2 m, cu cate un pion pe fiecare, si langa al doilea o piatra la inaltimea
 * lor, desemnata pentru sapat — lucrabila DOAR de pe al doilea stalp. Unul sapa; celalalt, fara
 * treaba (tinta e rezervata), ramane: in punga mai e de lucru. Doar daca ii e foame (hrana e jos,
 * deci nu si-a gasit-o) coboara oricum.
 */
/** Sapatul de 8 ori mai lent: cat lucreaza primul, al doilea sigur scaneaza de cateva ori. */
function lent(): Rules {
  const out = parseRules({ ...DEFAULT_RULES, digWorkUnits: DEFAULT_RULES.digWorkUnits * 8 })
  assert.ok(out.ok, JSON.stringify(out))
  return out.ok ? out.value : R
}

function doiStalpi(flamand: boolean, rules: Rules): { w: World; b: number; tinta: number; x0: number; y0: number; g: number } {
  const { w, wx, wy, g } = sitPlat(12345, 13)
  const x0 = wx + 5, y0 = wy + 5
  for (const dx of [0, 1, 2]) for (const z of [g + 1, g + 2]) umple(w, x0 + dx, y0, z)
  assert.ok(fill(w.terrain, x0 + 2, y0, g + 3, Material.ROCA).ok)
  for (let k = 0; k < 3; k++) lasaItem(w, Item.HRANA, 75, wx + 12, wy + k)
  const a = pion(w, x0 + 1, y0, g + 3)
  const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + 2, wy: y0, z: g + 3 }, R)
  assert.ok(o.ok, JSON.stringify(o))
  // Al doilea pion apare abia dupa ce primul a luat tinta: altfel oricare o poate lua.
  for (let t = 0; t < 200 && w.agents.jobKind[a] === 0; t++) advance(w, 1, rules)
  assert.notEqual(w.agents.jobKind[a], 0, 'fixtura: primul pion n-a luat tinta')
  const b = pion(w, x0, y0, g + 3)
  if (flamand) w.agents.nevoi[b * NEVOI + Nevoie.FOAME] = R.nevoi[Nevoie.FOAME]!.prag - 100
  return { w, b, tinta: o.ok ? o.value : -1, x0, y0, g }
}

test('COBORAREA: un pion fara treaba ramane cat altul lucreaza in punga; flamand, coboara oricum', () => {
  const rules = lent()
  for (const flamand of [false, true]) {
    const { w, b, tinta } = doiStalpi(flamand, rules)
    assert.ok(blocat(w, b), 'fixtura: capetele stalpilor sunt o punga')
    let plecatInainte = false
    let t = 0
    for (; t < 8000 && slotDesemnare(w.desemnari, tinta) !== -1; t++) {
      advance(w, 1, rules)
      if (!blocat(w, b)) plecatInainte = true
    }
    assert.equal(slotDesemnare(w.desemnari, tinta), -1, `fixtura [flamand ${flamand}]: piatra nu s-a sapat`)
    assert.equal(plecatInainte, flamand, flamand ? 'pionul flamand a ramas in punga fara hrana' : 'pionul a coborat cat mai era de lucru in punga')
  }
})
