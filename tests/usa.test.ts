/**
 * Usa — S24-27, taietura 1. Hotar pentru aer (inchide o incapere), trecere pentru pioni.
 *
 * Scenele vin din panoul pe designul camerelor (lentila USA + verificatorii ei): v1 numea doar
 * liniile de material ale mersului, iar trei locuri tratau usa ca podea sau ca solid — privirea
 * inainte (pionul din groapa isi zidea „scaparea" si ramanea acolo), regula de sigilare (usa de sus
 * a unui gol lua capul celulei de dedesubt) si refugiul de la prabusire (pionul din toc era urcat
 * prin usa, 10 m). Fiecare scena are controlul ei: aceeasi geometrie cu gol de aer sau cu scara.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { componenta, componenteInchiseDe, componenteInchiseDeMemorat, cititor, nodStabil, nodW, siguraMemorat } from '../src/sim/acces.ts'
import { componentaLa, esteIncapere, listaComponente } from '../src/sim/camere.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { DEFAULT_RULES, parseRules } from '../src/sim/content.ts'
import { slotDesemnare } from '../src/sim/desemnari.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { itemLaCelula, stergeItem } from '../src/sim/iteme.ts'
import { arInchideCeva, constructiaPrevizualizata, lastJobReport } from '../src/sim/joburi.ts'
import { canStep, isWalkable } from '../src/sim/regions.ts'
import { cellKey } from '../src/sim/path.ts'
import { decode, encode } from '../src/sim/save.ts'
import { Faction, Item, Piesa } from '../src/sim/state.ts'
import type { PiesaId, World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import type { MaterialId } from '../src/sim/terrain/chunk.ts'
import { fill, materialAt } from '../src/sim/terrain/terrain.ts'
import { celulaDeZonaLa, Zona } from '../src/sim/zone.ts'
import { lasaItem, panaCand, R, ruleaza, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA
type Piesa_ = readonly [number, number, number, PiesaId]

function pereti(o: Piesa_[], L: number, z0: number, z1: number, goluri: readonly (readonly [number, number])[] = []): void {
  for (let z = z0; z <= z1; z++) for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) {
    if (dx !== 0 && dx !== L - 1 && dy !== 0 && dy !== L - 1) continue
    if (goluri.some(([a, b]) => a === dx && b === dy)) continue
    o.push([dx, dy, z, Piesa.PERETE])
  }
}
function placa(o: Piesa_[], L: number, z: number, goluri: readonly (readonly [number, number])[] = []): void {
  for (let dx = 0; dx < L; dx++) for (let dy = 0; dy < L; dy++) if (!goluri.some(([a, b]) => a === dx && b === dy)) o.push([dx, dy, z, Piesa.PODEA])
}

/**
 * Casa 7x7 cu doua etaje din tests/acces-joc.test.ts (`casaCuEtaj(true)`), cu golul (3,0) inchis de
 * doua USI; cu `chepeng`, si golurile scarii din placa primesc cate o usa (chepengul).
 */
function casaCuUsa(chepeng: boolean): (g: number) => Piesa_[] {
  return (g) => {
    const o: Piesa_[] = []
    pereti(o, 7, g + 1, g + 2, [[3, 0]])
    o.push([3, 0, g + 1, Piesa.USA], [3, 0, g + 2, Piesa.USA])
    o.push([3, 4, g + 1, Piesa.SCARA], [3, 5, g + 1, Piesa.SCARA], [3, 5, g + 2, Piesa.SCARA])
    placa(o, 7, g + 3, [[3, 4], [3, 5]])
    if (chepeng) o.push([3, 4, g + 3, Piesa.USA], [3, 5, g + 3, Piesa.USA])
    pereti(o, 7, g + 4, g + 5)
    placa(o, 7, g + 6)
    return o
  }
}

/** `santier` din tests/acces-joc.test.ts: un santier pe piesa, piatra langa casa, hrana, pioni. */
function santier(seed: number, plan: (g: number) => Piesa_[], pioni = 4): { w: World; x0: number; y0: number; g: number; ids: number[]; plan: Piesa_[] } {
  const { w, wx, wy, g } = sitPlat(seed, 18)
  const x0 = wx + 5, y0 = wy + 4
  const piese = plan(g)
  const ids: number[] = []
  for (const [dx, dy, z, p] of piese) {
    const out = applyCommand(w, { kind: 'desemneaza', wx: x0 + dx, wy: y0 + dy, z, piesa: p }, R)
    assert.ok(out.ok, `fixtura: santierul (${dx},${dy},${z - g}): ${JSON.stringify(out)}`)
    if (out.ok) ids.push(out.value)
  }
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

/** Pionii vii fara drum spre „afara" (componenta lor in W e inchisa, sau stau pe o celula necalcabila). */
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

// --- mersul ------------------------------------------------------------------

test('USA: prin usa se trece (celula si capul), pe usa nu se sta', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  const t = w.terrain
  // Un zid de 5 pe x, inalt de 2, cu golul din mijloc inchis de doua usi; fara buiandrug.
  for (let dx = 0; dx < 5; dx++) for (const z of [g + 1, g + 2]) assert.ok(fill(t, wx + dx, wy + 3, z, dx === 2 ? Material.USA : P).ok)
  assert.ok(isWalkable(t, wx + 2, wy + 3, g + 1, R), 'celula de jos a usii e calcabila')
  assert.ok(canStep(t, wx + 2, wy + 2, g + 1, wx + 2, wy + 3, g + 1, R), 'din fata usii in usa')
  assert.ok(canStep(t, wx + 2, wy + 3, g + 1, wx + 2, wy + 4, g + 1, R), 'din usa dincolo')
  assert.ok(!isWalkable(t, wx + 2, wy + 3, g + 3, R), 'deasupra usii: nu e podea')
  assert.ok(!isWalkable(t, wx + 1, wy + 3, g + 1, R), 'zidul de langa ramane zid')
})

test('USA: incaperea cu usa e sigilata, iar pionul dinauntru are drum afara (controlul: zidul plin il inchide)', () => {
  for (const cuUsa of [true, false]) {
    const { w, wx, wy, g } = sitPlat(777, 10)
    const t = w.terrain
    for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
      if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
      const usa = cuUsa && dx === 2 && dy === 0
      assert.ok(fill(t, wx + dx, wy + dy, z, usa ? Material.USA : P).ok)
    }
    for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(t, wx + dx, wy + dy, g + 3, P).ok)
    assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 2) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
    ruleaza(w, 1)
    const c = componentaLa(w.camere, wx + 2, wy + 2, g + 1)
    assert.ok(c && esteIncapere(c) && c.volum === 18, `cu usa=${cuUsa}: o incapere de 18 m3`)
    assert.deepEqual(blocati(w).length, cuUsa ? 0 : 1, `cu usa=${cuUsa}`)
  }
})

test('USA: un santier de usa nu inchide golul in F — interiorul ramane SIGUR pentru scaner (controlul: un perete planificat il inchide)', () => {
  for (const [piesa, sigur] of [[Piesa.USA, true], [Piesa.PERETE, false]] as const) {
    const { w, wx, wy, g } = sitPlat(777, 10)
    const t = w.terrain
    for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
      if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
      if (dx === 2 && dy === 0) continue
      assert.ok(fill(t, wx + dx, wy + dy, z, P).ok)
    }
    for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(t, wx + dx, wy + dy, g + 3, P).ok)
    for (const z of [g + 1, g + 2]) assert.ok(applyCommand(w, { kind: 'desemneaza', wx: wx + 2, wy, z, piesa }, R).ok)
    assert.equal(siguraMemorat(t, w.desemnari, R, w.acces, wx + 2, wy + 2, g + 1), sigur, `piesa ${piesa}`)
  }
})

// --- USA-1: privirea inainte ----------------------------------------------------

/** O groapa 3x3 de 2 m, un pion pe fund, piatra langa el si un santier pe fund (testul PRIVIREA INAINTE). */
function groapa(seed: number, piese: readonly PiesaId[], piatra: number): { w: World; x0: number; y0: number; g: number; ids: number[] } {
  const { w, wx, wy, g } = sitPlat(seed, 18)
  const x0 = wx + 6, y0 = wy + 6
  for (const z of [g, g - 1]) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) applyCommand(w, { kind: 'dig', wx: x0 + dx, wy: y0 + dy, z }, R)
  const it = w.iteme
  for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && it.wx[i]! >= x0 - 1 && it.wx[i]! <= x0 + 3 && it.wy[i]! >= y0 - 1 && it.wy[i]! <= y0 + 3) stergeItem(it, i)
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (x0 + 1) * 1000 + 500, y: (y0 + 1) * 1000 + 500, z: g - 1, faction: Faction.ASEZARE }, R).ok)
  assert.ok(applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: piatra, wx: x0, wy: y0, z: g - 1 }, R).ok)
  const ids: number[] = []
  const locuri = [[1, 2], [2, 1]] as const
  piese.forEach((p, i) => {
    const out = applyCommand(w, { kind: 'desemneaza', wx: x0 + locuri[i]![0], wy: y0 + locuri[i]![1], z: g - 1, piesa: p }, R)
    assert.ok(out.ok, JSON.stringify(out))
    if (out.ok) ids.push(out.value)
  })
  return { w, x0, y0, g, ids }
}

test('USA (USA-1): dintr-o groapa, o usa nu e scapare — nu se promite si nu se zideste (controlul: scara)', () => {
  for (const [piesa, scapare] of [[Piesa.SCARA, true], [Piesa.USA, false]] as const) {
    const { w, x0, y0, g, ids } = groapa(12345, [piesa], 20)
    const prev = constructiaPrevizualizata(w, R)
    assert.equal(prev.construibile.length, scapare ? 1 : 0, `piesa ${piesa}: previzualizarea`)
    assert.equal(prev.faraAcces.length, scapare ? 0 : 1, `piesa ${piesa}: o usa fara acces e in faraAcces, nu invizibila (USA-6)`)
    panaCand(w, 4000, () => slotDesemnare(w.desemnari, ids[0]!) === -1)
    ruleaza(w, 1000)
    const m = materialAt(w.terrain, x0 + 1, y0 + 2, g - 1)
    if (scapare) {
      assert.ok(m.ok && m.value === P, 'scara zidita')
      assert.equal(blocati(w).length, 0, 'pionul a iesit pe scara')
    } else {
      assert.ok(m.ok && m.value === Material.AER, 'usa NU s-a zidit din groapa (piatra nu s-a irosit)')
    }
  }
})

test('USA (USA-1): usa desemnata intai, apoi scara, cu piatra doar pentru una — se zideste scara si pionul iese', () => {
  const { w, x0, y0, g } = groapa(777, [Piesa.USA, Piesa.SCARA], 20)
  ruleaza(w, 4000)
  const scara = materialAt(w.terrain, x0 + 2, y0 + 1, g - 1)
  assert.ok(scara.ok && scara.value === P, 'scara s-a zidit')
  assert.equal(blocati(w).length, 0)
})

test('USA (USA-1): in graful stabil, o usa zidita IPOTETIC (Z) nu e podea; o podea ipotetica este', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  const t = w.terrain
  // O groapa de o celula la g, cu santierul pe fundul ei (g-1 e sol): celula de deasupra piesei
  // (g) e calcabila in W ∪ Z doar daca piesa e podea.
  assert.ok(applyCommand(w, { kind: 'dig', wx: wx + 3, wy: wy + 3, z: g }, R).ok)
  assert.ok(applyCommand(w, { kind: 'dig', wx: wx + 3, wy: wy + 3, z: g - 1 }, R).ok)
  const k = cellKey(wx + 3, wy + 3, g - 1)
  const Z = new Set([k])
  assert.ok(nodStabil({ t, plan: Z, zidite: Z }, R).calcabila(wx + 3, wy + 3, g), 'controlul: o podea ipotetica se calca')
  assert.ok(!nodStabil({ t, plan: new Set(), zidite: Z, faraPodea: Z }, R).calcabila(wx + 3, wy + 3, g), 'o usa ipotetica nu')
})

// --- USA-2: regula de sigilare ------------------------------------------------------

test('USA (USA-2): regula de sigilare nu opreste nicio jumatate a usii, cu un pion si un morman inauntru', () => {
  const { w, wx, wy, g } = sitPlat(4242, 10)
  const t = w.terrain
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    if (dx === 2 && dy === 0) continue
    assert.ok(fill(t, wx + dx, wy + dy, z, P).ok)
  }
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(t, wx + dx, wy + dy, g + 3, P).ok)
  assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 2) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
  lasaItem(w, Item.HRANA, 30, wx + 3, wy + 3)
  for (const z of [g + 1, g + 2]) assert.ok(applyCommand(w, { kind: 'desemneaza', wx: wx + 2, wy, z, piesa: Piesa.USA }, R).ok)
  for (const z of [g + 1, g + 2]) {
    assert.deepEqual(componenteInchiseDe(t, R, wx + 2, wy, z, cititor(t), null, null, Material.USA), [], `forma pura, z=g+${z - g}`)
    assert.deepEqual(componenteInchiseDeMemorat(t, w.desemnari, R, w.acces, wx + 2, wy, z), [], `forma memorata, z=g+${z - g}`)
    assert.ok(arInchideCeva(w, R, wx + 2, wy, z).ok, `arInchideCeva, z=g+${z - g}`)
  }
  // Controlul: un PERETE in acelasi gol inchide pionul — regula nu e vida.
  assert.ok(componenteInchiseDe(t, R, wx + 2, wy, g + 1, cititor(t), null, null, P).length > 0)
})

// --- USA-3: refugiul de la prabusire -------------------------------------------------

/**
 * Scena lentilei: pilonul P (x−3) asezat, zidul W spre usa la g+4.., usa U la (x, g+4..g+5), podeaua
 * de sub ea tinuta DOAR de stalpul T (x+1). Sapata baza lui T, podeaua cade, usa ramane (tinuta de W).
 */
function prabusireSubUsa(cuUsa: boolean, buiandrug: boolean, morman: boolean): { w: World; x: number; y: number; g: number } {
  const { w, wx, wy, g } = sitPlat(12345, 18)
  const x = wx + 9, y = wy + 9
  const zid = (a: number, b: number, z: number, m: MaterialId = P): void => {
    const o = applyCommand(w, { kind: 'fill', wx: a, wy: b, z, material: m }, R)
    assert.ok(o.ok, `fill (${a - x},${b - y},${z - g}): ${JSON.stringify(o)}`)
  }
  const sus = buiandrug ? 6 : 5
  for (let z = g + 1; z <= g + sus; z++) zid(x - 3, y, z)
  for (let z = g + 1; z <= g + 3; z++) zid(x + 1, y, z)
  zid(x, y, g + 3)
  zid(x - 1, y, g + 3)
  for (let z = g + 4; z <= g + sus; z++) { zid(x - 1, y, z); zid(x - 2, y, z) }
  if (cuUsa) { zid(x, y, g + 4, Material.USA); zid(x, y, g + 5, Material.USA) }
  if (buiandrug) zid(x, y, g + 6)
  if (morman) assert.ok(applyCommand(w, { kind: 'lasaItem', fel: Item.PIATRA, cantitate: 20, wx: x, wy: y, z: g + 4 }, R).ok)
  else assert.ok(applyCommand(w, { kind: 'spawnAgent', x: x * 1000 + 500, y: y * 1000 + 500, z: g + 4, faction: Faction.ASEZARE }, R).ok)
  assert.ok(applyCommand(w, { kind: 'dig', wx: x + 1, wy: y, z: g + 1 }, R).ok)
  return { w, x, y, g }
}

test('USA (USA-3): podeaua de sub usa cade — pionul si mormanul din toc ajung pe moloz, ca la golul de aer', () => {
  for (const buiandrug of [false, true]) {
    const aer = prabusireSubUsa(false, buiandrug, false)
    const usa = prabusireSubUsa(true, buiandrug, false)
    const u = materialAt(usa.w.terrain, usa.x, usa.y, usa.g + 4)
    assert.ok(u.ok && u.value === Material.USA, 'usa a ramas (tinuta de zid)')
    assert.equal(usa.w.agents.z[0]! - usa.g, aer.w.agents.z[0]! - aer.g, `buiandrug=${buiandrug}: pionul din toc ajunge unde ar fi ajuns fara usa`)
    assert.ok(usa.w.agents.z[0]! - usa.g <= 3, `buiandrug=${buiandrug}: pionul nu e urcat prin usa (z = g+${usa.w.agents.z[0]! - usa.g})`)
    const ma = prabusireSubUsa(false, buiandrug, true)
    const mu = prabusireSubUsa(true, buiandrug, true)
    const za = ma.w.iteme.z[0]! - ma.g
    const zu = mu.w.iteme.z[0]! - mu.g
    assert.equal(zu, za, `buiandrug=${buiandrug}: mormanul din toc ajunge unde ar fi ajuns fara usa`)
  }
})

// --- casa cu usa, cu pioni reali --------------------------------------------------

test('USA: casa cu etaj, usa in gol si chepeng in gaura scarii — ridicata integral, fara pioni blocati; la capat, doua incaperi (47 + 50 m3)', () => {
  const { w, x0, y0, g, ids, plan } = santier(12345, casaCuUsa(true))
  assert.equal(plan.length, 197)
  const prev = constructiaPrevizualizata(w, R)
  assert.equal(prev.construibile.length, 197, 'previzualizarea: toate construibile')
  assert.equal(prev.faraAcces.length, 0, 'nicio INCINTA falsa pe usile planificate')
  panaCand(w, 30000, () => ids.every((id) => slotDesemnare(w.desemnari, id) === -1))
  assert.deepEqual(ids.filter((id) => slotDesemnare(w.desemnari, id) !== -1), [], 'piese nezidite')
  assert.deepEqual(blocati(w), [])
  const u = materialAt(w.terrain, x0 + 3, y0, g + 1)
  assert.ok(u.ok && u.value === Material.USA)
  const parter = componentaLa(w.camere, x0 + 1, y0 + 1, g + 1)
  const etaj = componentaLa(w.camere, x0 + 1, y0 + 1, g + 4)
  assert.ok(parter && esteIncapere(parter) && etaj && esteIncapere(etaj))
  assert.deepEqual([parter!.volum, etaj!.volum].sort((a, b) => a - b), [47, 50])
  assert.equal(listaComponente(w.camere).filter(esteIncapere).length, 2)
})

test('USA (M5): salvare si incarcare in mijlocul casei cu usa dau aceeasi lume', () => {
  const a = santier(777, casaCuUsa(false))
  ruleaza(a.w, 3000)
  const inc = decode(encode(a.w), R)
  assert.ok(inc.ok)
  const b = inc.value
  ruleaza(a.w, 2500)
  ruleaza(b, 2500)
  assert.equal(hashWorld(b), hashWorld(a.w))
})

// --- recenzia incaperilor, USA-1: o usa nu ingroapa pe nimeni ----------------------------
//
// `celulaLibera` (pion sau morman la picioare SI la cap) se cerea si pentru usa. Pe e063f40 un morman
// in toc — celula usii de jos, adica capul celei de sus — oprea usa de sus pe veci, cu constructorul
// neintreruptibil (piatra in mana) pana pleca din asezare; iar desenarea usii intr-un gol sapat era
// refuzata, fiindca piatra din zid iese in toc. Controlul: aceeasi geometrie cu PERETE.

/** Camera 5x5 cu pereti de 2 m si acoperis; `gol` lasa deschisa coloana (2,0) — locul usii. */
function cameraCuToc(seed: number, gol: boolean): { w: World; wx: number; wy: number; g: number; x0: number; y0: number; pioni: () => void } {
  const { w, wx, wy, g } = sitPlat(seed, 18)
  const x0 = wx + 6, y0 = wy + 6
  for (let z = g + 1; z <= g + 2; z++) for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) {
    if (dx !== 0 && dx !== 4 && dy !== 0 && dy !== 4) continue
    if (gol && dx === 2 && dy === 0) continue
    assert.ok(fill(w.terrain, x0 + dx, y0 + dy, z, P).ok)
  }
  for (let dx = 0; dx < 5; dx++) for (let dy = 0; dy < 5; dy++) assert.ok(fill(w.terrain, x0 + dx, y0 + dy, g + 3, P).ok)
  const pioni = (): void => {
    for (let i = 0; i < 10; i++) lasaItem(w, Item.HRANA, 75, wx + 14 + (i % 3), wy - 1 + ((i / 3) | 0))
    for (let i = 0; i < 3; i++) assert.ok(applyCommand(w, { kind: 'spawnAgent', x: (wx + 2) * 1000 + 500, y: (wy + 12 + i) * 1000 + 500, z: g + 1, faction: Faction.ASEZARE }, R).ok)
  }
  return { w, wx, wy, g, x0, y0, pioni }
}

test('USA toc (USA-1): usa de sus se zideste peste un morman din toc (usa de jos zidita), fara asteptare', () => {
  for (const seed of [12345, 777]) {
    const { w, wx, wy, g, x0, y0, pioni } = cameraCuToc(seed, true)
    assert.ok(applyCommand(w, { kind: 'fill', wx: x0 + 2, wy: y0, z: g + 1, material: Material.USA }, R).ok)
    assert.ok(applyCommand(w, { kind: 'desemneaza', wx: x0 + 2, wy: y0, z: g + 2, piesa: Piesa.USA }, R).ok)
    // Pamant: nu e materialul niciunei piese, deci nimeni nu-l ia din toc ca sursa.
    assert.ok(applyCommand(w, { kind: 'lasaItem', fel: Item.PAMANT, cantitate: 20, wx: x0 + 2, wy: y0, z: g + 1 }, R).ok)
    assert.notEqual(itemLaCelula(w.iteme, x0 + 2, y0, g + 1), -1, 'premisa: mormanul e in toc')
    lasaItem(w, Item.PIATRA, 20, wx + 1, wy + 1)
    pioni()
    let ocupat = 0
    const t = panaCand(w, 2000, (ww) => {
      ocupat += lastJobReport().santierOcupat
      const m = materialAt(ww.terrain, x0 + 2, y0, g + 2)
      return m.ok && m.value === Material.USA
    })
    assert.ok(t !== -1, `seed ${seed}: usa de sus nezidita in 2000 de tickuri (santier ocupat ${ocupat})`)
    assert.equal(ocupat, 0, `seed ${seed}: constructorul a asteptat ${ocupat} tickuri langa usa`)
    assert.notEqual(itemLaCelula(w.iteme, x0 + 2, y0, g + 1), -1, 'mormanul ramane in toc (pe usa)')
  }
})

test('USA toc (USA-1): usa se deseneaza si se zideste intr-un gol sapat, cu piatra din zid ramasa in toc', () => {
  for (const seed of [12345, 777]) {
    const { w, x0, y0, g, pioni } = cameraCuToc(seed, false)
    assert.ok(applyCommand(w, { kind: 'dig', wx: x0 + 2, wy: y0, z: g + 2 }, R).ok)
    assert.ok(applyCommand(w, { kind: 'dig', wx: x0 + 2, wy: y0, z: g + 1 }, R).ok)
    assert.notEqual(itemLaCelula(w.iteme, x0 + 2, y0, g + 1), -1, 'premisa: zidul sapat lasa un morman in toc')
    for (const z of [g + 1, g + 2]) {
      const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + 2, wy: y0, z, piesa: Piesa.USA }, R)
      assert.ok(o.ok, `seed ${seed}, z=g+${z - g}: ${JSON.stringify(o)}`)
    }
    pioni()
    const t = panaCand(w, 2000, (ww) => [g + 1, g + 2].every((z) => { const m = materialAt(ww.terrain, x0 + 2, y0, z); return m.ok && m.value === Material.USA }))
    assert.ok(t !== -1, `seed ${seed}: usile din golul sapat nezidite in 2000 de tickuri`)
  }
})

test('USA toc (USA-1): controlul — un PERETE nu se deseneaza peste un morman si nici deasupra lui (capul)', () => {
  const { w, x0, y0, g } = cameraCuToc(12345, true)
  assert.ok(applyCommand(w, { kind: 'lasaItem', fel: Item.PAMANT, cantitate: 20, wx: x0 + 2, wy: y0, z: g + 1 }, R).ok)
  for (const z of [g + 1, g + 2]) {
    const o = applyCommand(w, { kind: 'desemneaza', wx: x0 + 2, wy: y0, z, piesa: Piesa.PERETE }, R)
    assert.equal(o.ok, false, `z=g+${z - g}`)
    if (!o.ok) assert.equal(o.reason, 'CELULA_OCUPATA')
    // Si pe calea de zidire (comanda `fill`, aceeasi `zidesteVoxel` ca jobul).
    const f = applyCommand(w, { kind: 'fill', wx: x0 + 2, wy: y0, z, material: P }, R)
    assert.equal(f.ok, false, `fill z=g+${z - g}`)
    if (!f.ok) assert.equal(f.reason, 'CELULA_OCUPATA')
  }
})

// --- zone, continut --------------------------------------------------------------------

test('USA: zonele nu se picteaza in golul unei usi', () => {
  const { w, wx, wy, g } = sitPlat(12345, 8)
  for (let dx = 0; dx < 5; dx++) for (const z of [g + 1, g + 2]) assert.ok(fill(w.terrain, wx + dx, wy + 3, z, dx === 2 ? Material.USA : P).ok)
  const out = applyCommand(w, { kind: 'picteazaZona', x0: wx, y0: wy + 2, x1: wx + 4, y1: wy + 4, z: g + 1, fel: Zona.DEPOZIT }, R)
  assert.ok(out.ok, JSON.stringify(out))
  assert.equal(celulaDeZonaLa(w.zone, wx + 2, wy + 3, g + 1), -1, 'golul usii nu e celula de zona')
  assert.notEqual(celulaDeZonaLa(w.zone, wx + 2, wy + 2, g + 1), -1, 'fata usii e')
})

test('USA zona (USA-2): o celula de zona pictata INAINTE de usa iese din golul ei la zidire — cu comanda fill si cu pionii', () => {
  // Ordinea obisnuita a jucatorului: intai depozitul peste camera (si peste intrare), apoi usa. Testul
  // de mai sus probeaza doar ordinea inversa. Pe e063f40 celula din gol supravietuia usii: retragerea
  // intreba doar „e calcabila?", iar golul usii ramane calcabil — marfa carata in prag, paturi in toc.
  for (const cuPioni of [false, true]) {
    const { w, wx, wy, g, x0, y0, pioni } = cameraCuToc(777, true)
    const out = applyCommand(w, { kind: 'picteazaZona', x0: x0 + 1, y0, x1: x0 + 3, y1: y0 + 3, z: g + 1, fel: Zona.DEPOZIT }, R)
    assert.ok(out.ok, JSON.stringify(out))
    assert.notEqual(celulaDeZonaLa(w.zone, x0 + 2, y0, g + 1), -1, 'premisa: golul e celula de zona')
    const zidita = (ww: World): boolean => [g + 1, g + 2].every((z) => { const m = materialAt(ww.terrain, x0 + 2, y0, z); return m.ok && m.value === Material.USA })
    if (!cuPioni) {
      for (const z of [g + 1, g + 2]) assert.ok(applyCommand(w, { kind: 'fill', wx: x0 + 2, wy: y0, z, material: Material.USA }, R).ok)
    } else {
      for (const z of [g + 1, g + 2]) assert.ok(applyCommand(w, { kind: 'desemneaza', wx: x0 + 2, wy: y0, z, piesa: Piesa.USA }, R).ok)
      lasaItem(w, Item.PIATRA, 40, wx + 1, wy + 1)
      for (let i = 0; i < 4; i++) lasaItem(w, Item.PAMANT, 20, wx + 2 + i, wy + 12)
      pioni()
      assert.ok(panaCand(w, 3000, zidita) !== -1, 'usile nezidite de pioni in 3000 de tickuri')
    }
    assert.ok(zidita(w))
    assert.equal(celulaDeZonaLa(w.zone, x0 + 2, y0, g + 1), -1, `cuPioni=${cuPioni}: celula de zona a ramas in golul usii`)
    assert.notEqual(celulaDeZonaLa(w.zone, x0 + 2, y0 + 1, g + 1), -1, 'controlul: interiorul ramane depozit')
    if (cuPioni) {
      // Si nimic nu mai e carat in prag dupa zidire (pamantul de afara merge in depozitul dinauntru).
      const cant = (): number => { const it = itemLaCelula(w.iteme, x0 + 2, y0, g + 1); return it === -1 ? 0 : w.iteme.cantitate[it]! }
      const inainte = cant()
      ruleaza(w, 1500)
      assert.ok(cant() <= inainte, `marfa carata in prag dupa zidire: ${inainte} -> ${cant()}`)
    }
  }
})

test('USA: continutul leaga piesa USA de materialul USA in ambele sensuri (CTR-9)', () => {
  const piese = (inlocuiri: Record<string, unknown>): unknown => {
    const baza = JSON.parse(JSON.stringify({
      PERETE: { material: 'PIATRA_CONSTRUITA', cantitate: 20, lucru: 400 },
      PODEA: { material: 'PIATRA_CONSTRUITA', cantitate: 20, lucru: 300 },
      SCARA: { material: 'PIATRA_CONSTRUITA', cantitate: 20, lucru: 300 },
      GRINDA: { material: 'GRINDA', cantitate: 20, lucru: 500 },
      USA: { material: 'USA', cantitate: 20, lucru: 300 },
    })) as Record<string, unknown>
    return { ...DEFAULT_RULES, piese: { ...baza, ...inlocuiri } }
  }
  assert.ok(parseRules(piese({})).ok, 'controlul: tabelul bun trece')
  const perete = parseRules(piese({ PERETE: { material: 'USA', cantitate: 20, lucru: 400 } }))
  assert.ok(!perete.ok && perete.params.camp === 'piese.PERETE.material', 'un PERETE din USA ar fi un zid prin care se trece')
  const usa = parseRules(piese({ USA: { material: 'PIATRA_CONSTRUITA', cantitate: 20, lucru: 300 } }))
  assert.ok(!usa.ok && usa.params.camp === 'piese.USA.material', 'o USA din piatra ar fi un zid pus de butonul Usa')
})
