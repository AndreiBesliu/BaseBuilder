/**
 * Fixturi comune testelor de joburi si de carat: un sit pe uscat, pioni unul
 * langa altul, desemnari, rulari cu raport insumat. Aceleasi ca in
 * joburi.test.ts, scoase aici ca a doua felie sa nu le copieze.
 */

import assert from 'node:assert/strict'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import type { Rules } from '../src/sim/content.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { createWorld, tick } from '../src/sim/world.ts'
import { Faction, Item, NEVOI, Nevoie, Piesa } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'
import { isSolid } from '../src/sim/terrain/chunk.ts'
import { groundLevelM, materialAt, WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { lastJobReport } from '../src/sim/joburi.ts'
import type { JobTickReport } from '../src/sim/joburi.ts'
import { lastAgentReport } from '../src/sim/agents.ts'
import { cellKey } from '../src/sim/path.ts'

export const R = DEFAULT_RULES

/** Cota solului SOLID la (wx, wy), sau null (apa, in afara lumii). */
export function solid(w: World, wx: number, wy: number): number | null {
  const g = groundLevelM(w.terrain, wx, wy)
  if (!g.ok) return null
  const m = materialAt(w.terrain, wx, wy, g.value)
  return m.ok && isSolid(m.value) ? g.value : null
}

export interface Sit { readonly wx: number; readonly wy: number; readonly g: number }

/**
 * Un sit pe uscat: `latura` celule pe fiecare directie in jurul lui sunt sol
 * solid. Cauta determinist din seed.
 */
export function gasesteSit(w: World, seed: number, deLa = -2, panaLa = 8): Sit {
  for (let k = 1; k <= 8000; k++) {
    const wx = (k * 1237 + seed) % WORLD_CELLS
    const wy = (k * 7919 + seed * 31) % WORLD_CELLS
    const g = solid(w, wx, wy)
    if (g === null) continue
    let uscat = true
    for (let dx = deLa; dx <= panaLa && uscat; dx++) for (let dy = deLa; dy <= panaLa; dy++) if (solid(w, wx + dx, wy + dy) === null) { uscat = false; break }
    if (uscat) return { wx, wy, g }
  }
  assert.fail('niciun sit pe uscat')
}

/**
 * Agenti pe ACELASI sit, unul langa altul — forma in care apar joburile: o
 * asezare, nu 40 de oameni imprastiati pe 16 km. Fiecare se naste pe cota
 * celulei LUI (pe panta vecinii au alt sol).
 */
export function laSit(seed: number, cati: number, factiuni: readonly number[] = [], rules: Rules = R): { w: World; sit: Sit } {
  const w = createWorld(seed, rules)
  const sit = gasesteSit(w, seed)
  let pusi = 0
  for (let i = 0; i < cati; i++) {
    const cx = sit.wx + (i % 6)
    const cy = sit.wy + Math.floor(i / 6)
    const g = solid(w, cx, cy)
    if (g === null) continue
    const out = applyCommand(w, { kind: 'spawnAgent', x: cx * 1000 + 500, y: cy * 1000 + 500, z: g + 1, faction: (factiuni[i] ?? Faction.ASEZARE) as 0 | 1 | 2 }, rules)
    if (out.ok) pusi++
  }
  assert.equal(pusi, cati, `doar ${pusi} din ${cati} agenti asezati la sit`)
  return { w, sit }
}

/**
 * Un patrat PLAT de `latura` celule cu coltul la (x0, y0): toate celulele au
 * aceeasi cota de sol solid. Cauta in jurul sitului, in ordine fixa.
 */
export function patratPlat(w: World, sit: Sit, latura: number, dMin: number, dMax: number): { x0: number; y0: number; g: number } | null {
  for (let d = dMin; d <= dMax; d++) {
    for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const x0 = sit.wx + ux * d
      const y0 = sit.wy + uy * d
      if (x0 < 0 || y0 < 0) continue
      const g = solid(w, x0, y0)
      if (g === null) continue
      let plat = true
      for (let dx = 0; dx < latura && plat; dx++) for (let dy = 0; dy < latura; dy++) if (solid(w, x0 + dx, y0 + dy) !== g) { plat = false; break }
      if (plat) return { x0, y0, g }
    }
  }
  return null
}

/**
 * O celula de sol solid pe una din cele patru directii, la o distanta Manhattan
 * (cu tot cu cota) intre `dMin` si `dMax` de (cx, cy, cz).
 */
export function solidLaDistanta(w: World, cx: number, cy: number, cz: number, dMin: number, dMax: number): { wx: number; wy: number; g: number } {
  for (const [ux, uy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
    for (let k = dMin; k <= dMax; k++) {
      const wx = cx + ux * k
      const wy = cy + uy * k
      if (wx < 0 || wy < 0) continue
      const g = solid(w, wx, wy)
      if (g === null) continue
      const d = k + Math.abs(g - cz)
      if (d >= dMin && d <= dMax) return { wx, wy, g }
    }
  }
  assert.fail(`niciun sol solid intre ${dMin} si ${dMax} in jurul lui ${cx},${cy},${cz}`)
}

/** Desemneaza celula de sol de la (wx, wy). Pica testul daca nu se poate. */
export function desemneaza(w: World, wx: number, wy: number, prioritate?: number, rules: Rules = R): { id: number; z: number } {
  const g = solid(w, wx, wy)
  assert.notEqual(g, null, `nu e sol solid la ${wx},${wy}`)
  const out = applyCommand(w, { kind: 'desemneaza', wx, wy, z: g!, prioritate }, rules)
  assert.ok(out.ok, `desemnarea la ${wx},${wy},${g} refuzata: ${JSON.stringify(out)}`)
  return { id: out.ok ? out.value : -1, z: g! }
}

/** Pune un morman pe celula de deasupra solului de la (wx, wy). Pica testul daca nu se poate. */
export function lasaItem(w: World, fel: number, cantitate: number, wx: number, wy: number, rules: Rules = R): number {
  const g = solid(w, wx, wy)
  assert.notEqual(g, null, `nu e sol solid la ${wx},${wy}`)
  const out = applyCommand(w, { kind: 'lasaItem', fel, cantitate, wx, wy, z: g! + 1 }, rules)
  assert.ok(out.ok, `lasaItem la ${wx},${wy} refuzat: ${JSON.stringify(out)}`)
  return out.ok ? out.value : -1
}

/** Picteaza o zona patrata cu coltul la (x0, y0) pe cota solului + 1. `fel` lipsa = DEPOZIT. Intoarce id-ul zonei. */
export function picteaza(w: World, x0: number, y0: number, latura: number, prioritate?: number, rules: Rules = R, fel?: number): number {
  const g = solid(w, x0, y0)
  assert.notEqual(g, null, `nu e sol solid la ${x0},${y0}`)
  const out = applyCommand(w, { kind: 'picteazaZona', x0, y0, x1: x0 + latura - 1, y1: y0 + latura - 1, z: g! + 1, prioritate, fel }, rules)
  assert.ok(out.ok, `picteazaZona la ${x0},${y0} refuzat: ${JSON.stringify(out)}`)
  return out.ok ? out.value : -1
}

export interface Totaluri extends JobTickReport { refuzuriAgenti: number; maxScanariPeTick: number }

/** Ruleaza N tickuri si aduna raportul de joburi. */
export function ruleaza(w: World, ticks: number, rules: Rules = R, laFiecareTick?: (w: World) => void): Totaluri {
  // Pornirea de la zero e STRUCTURALA, nu enumerata pe camp: un contor nou in
  // raport ar ramane `undefined`, iar adunarea ar da NaN — la fel de tacut ca
  // resetarea pe camp din productie, care a lasat trei contoare sa se adune la
  // infinit si a raportat 44 de milioane de unitati mancate intr-o lume cu 900.
  //
  // determinism-ok: toate cheile primesc aceeasi valoare, deci ordinea nu conteaza.
  const t = { refuzuriAgenti: 0, maxScanariPeTick: 0 } as Totaluri
  for (const k of (Object.keys(lastJobReport()) as (keyof JobTickReport)[]).sort()) t[k] = 0
  for (let i = 0; i < ticks; i++) {
    tick(w, rules)
    const r = lastJobReport()
    for (const k of Object.keys(r) as (keyof JobTickReport)[]) t[k] += r[k]
    t.refuzuriAgenti += lastAgentReport().refuzuri
    if (r.scanari > t.maxScanariPeTick) t.maxScanariPeTick = r.scanari
    if (laFiecareTick) laFiecareTick(w)
  }
  return t
}

/** Ruleaza pana cand conditia e adevarata, cel mult `max` tickuri. Intoarce tickurile rulate sau -1. */
export function panaCand(w: World, max: number, cond: (w: World) => boolean, rules: Rules = R): number {
  for (let i = 0; i < max; i++) {
    if (cond(w)) return i
    tick(w, rules)
  }
  return cond(w) ? max : -1
}

export function cuJob(w: World): number[] {
  const out: number[] = []
  for (let i = 0; i < w.agents.count; i++) if (w.agents.alive[i] === 1 && w.agents.jobKind[i] !== 0) out.push(i)
  return out
}

/** Suma cantitatilor tuturor itemelor vii, plus ce e in mainile pionilor. */
export function marfaTotala(w: World): number {
  let s = 0
  for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1) s += w.iteme.cantitate[i]!
  for (let i = 0; i < w.agents.count; i++) if (w.agents.alive[i] === 1) s += w.agents.caraCantitate[i]!
  return s
}

/** Cate iteme vii zac intr-o zona anume. */
export function itemeInZona(w: World, zonaId: number): { iteme: number; cantitate: number } {
  const c = w.zone.celule
  let iteme = 0
  let cantitate = 0
  for (let i = 0; i < w.iteme.count; i++) {
    if (w.iteme.alive[i] === 0) continue
    const cs = c.laCelula.get(cellKey(w.iteme.wx[i]!, w.iteme.wy[i]!, w.iteme.z[i]!))
    if (cs === undefined || c.zonaId[cs] !== zonaId) continue
    iteme++
    cantitate += w.iteme.cantitate[i]!
  }
  return { iteme, cantitate }
}

/**
 * O lume in care chiar se intampla ceva.
 *
 * `populated` de mai sus a fost reparata odata — agentii se nasteau la `z = 0`,
 * deci nu se miscau deloc — si a murit a doua oara, altfel: se misca, dar in 2000
 * de tickuri singurul fel de job pe care il iau vreodata e DOARME. Zero desemnari,
 * zero iteme, zero zone, `jobConsumat` si `caraCantitate` mereu nule.
 *
 * Adica orice camp PERSISTED al taieturilor 2 si 3 putea fi scos din `encode` si
 * M5 ramanea verde. Unul CHIAR era: `jobConsumat` se hashuia, `decode` il citea,
 * dar `encode` nu-l scria niciodata. A stat asa pana la recenzia din 19.09.
 *
 * Fixtura asta pune ce lipsea: sapaturi, marfa, un depozit, hrana si santiere.
 * Contoarele de viata din test sunt partea care conteaza — fara ele, moartea a
 * treia oara ar arata exact ca vietile de pana acum.
 */
export function lumeBogata(seed: number): World {
  const { w, sit } = laSit(seed, 6)
  for (let i = 0; i < 4; i++) {
    const t = solidLaDistanta(w, sit.wx, sit.wy, sit.g, 3 + i, 8)
    desemneaza(w, t.wx, t.wy)
  }
  picteaza(w, sit.wx + 2, sit.wy + 3, 3)
  for (let i = 0; i < 3; i++) lasaItem(w, Item.PIATRA, 20, sit.wx + 5 + i, sit.wy + 6)
  lasaItem(w, Item.HRANA, 75, sit.wx + 1, sit.wy + 1)
  // Foamea se pune direct: altfel masa vine dupa mii de tickuri, si testul ar
  // masura rabdarea, nu roundtrip-ul.
  for (let i = 0; i < w.agents.count; i++) w.agents.nevoi[i * NEVOI + Nevoie.FOAME] = 200
  for (let i = 0; i < 2; i++) {
    const g = solid(w, sit.wx + 4 + i, sit.wy + 1)
    if (g !== null) applyCommand(w, { kind: 'desemneaza', wx: sit.wx + 4 + i, wy: sit.wy + 1, z: g + 1, piesa: Piesa.PERETE }, R)
  }
  return w
}

/**
 * `lumeBogata` plus ce cere logistica constructiei: un morman MARE de piatra (75,
 * din care incap trei pereti — mai multi claimanti pe acelasi morman), patru
 * mormane MICI de cate 10 la o celula de sit (sursa partiala, doua ridicari), si
 * inca doi pereti. Fixtura proprie, nu `lumeBogata` largita: aia e baza a sase
 * suite de mutatii si a contoarelor de viata din M5 — o schimbare acolo muta tot.
 */
export function lumeFragmentata(seed: number): World {
  const w = lumeBogata(seed)
  const sit = gasesteSit(w, seed)
  // Materialul intreg din lumeBogata (3 x 20 + acest 75) ajunge pentru ~6 pereti;
  // cu 8 pereti, cel putin doi se aduna din mormanele mici — asa ajung sursele
  // partiale in fereastra testelor per tick, nu doar in coada rularii.
  const pune = (fel: number, cant: number, wx: number, wy: number): void => { if (solid(w, wx, wy) !== null) lasaItem(w, fel, cant, wx, wy) }
  pune(Item.PIATRA, 75, sit.wx + 8, sit.wy + 4)
  for (let i = 0; i < 8; i++) pune(Item.PIATRA, 10, sit.wx + 1 + (i % 4), sit.wy + 7 + Math.floor(i / 4))
  for (let i = 0; i < 6; i++) {
    const wx = sit.wx + 6 + (i % 3)
    const wy = sit.wy + 9 + Math.floor(i / 3)
    const g = solid(w, wx, wy)
    if (g !== null) applyCommand(w, { kind: 'desemneaza', wx, wy, z: g + 1, piesa: Piesa.PERETE }, R)
  }
  return w
}
