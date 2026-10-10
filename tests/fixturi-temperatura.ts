/**
 * Fixturile temperaturii din t.2b: casele numite ale designului (§4: casa de piatra 5×5×2 cu usa, etajul, golul
 * usii, pivnitele sub casa si fara casa, casa din pamant zidit) si modelul in FLOAT al pasului, pe graful real.
 *
 * Casele sunt cele din verificarile panoului t.2b (verif-NUM-1, verif-NUM-2): interiorul L×L×H, peretii de 1 m,
 * usa 1×2 (sau golul) la mijlocul peretelui de sud, acoperisul la g+H+1; etajul L×L×2 deasupra, cu placa =
 * acoperisul parterului; pivnita 3×3×2 sub mijloc cu k m de pamant deasupra, put si chepeng USA.
 *
 * Modelul in float (`modelFloat`) e un MODEL de calibrare, nu pasul jocului: capacitatea din contoarele indexului (C'·μ,
 * in J/K), conductantele din graful real (`grafTermic`) — pentru τ_loc = C/ΣG, analitic. Valul de frig si τ la o
 * perturbatie ruleaza pe pasul pe intregi (`pasTermic`, forma ψ, §5.2) din commit-ul 4: integratorul (fata de
 * exponentiala exacta pe nod a commit-ului 1) a mutat minimele valului cu +0,004 °C (verif-NUM-2), sub banda.
 */

import assert from 'node:assert/strict'
import type { Rules } from '../src/sim/content.ts'
import { Anotimp, panaLaAnotimp, tickuriPeOra } from '../src/sim/calendar.ts'
import type { Command } from '../src/sim/commands.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { stergeItem } from '../src/sim/iteme.ts'
import { componentaLa } from '../src/sim/camere.ts'
import { capacitateMu, contoareComponentei } from '../src/sim/fete.ts'
import type { GrafTermic } from '../src/sim/termic.ts'
import { grafTermic } from '../src/sim/termic.ts'
import type { World } from '../src/sim/state.ts'
import type { MaterialId } from '../src/sim/terrain/chunk.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill } from '../src/sim/terrain/terrain.ts'
import { R, sitPlat } from './fixturi.ts'
import { sincronizeazaLumea } from '../src/sim/temperatura.ts'

export const Q16 = 65536

export interface OptiuniCasa {
  /** Interiorul L×L (implicit 5). */
  readonly L?: number
  /** Inaltimea interiorului (implicit 2). */
  readonly H?: number
  /** Materialul peretilor (implicit PIATRA_CONSTRUITA). */
  readonly perete?: MaterialId
  /** Materialul acoperisului (implicit al peretilor). */
  readonly acoperis?: MaterialId
  /** Golul usii lasat deschis (fara USA). */
  readonly gol?: boolean
  /** Etajul L×L×2 deasupra. */
  readonly etaj?: boolean
  /** Pivnita 3×3×2 sub mijloc, cu k m de pamant deasupra. */
  readonly k?: number
  /** Fara casa (doar pivnita). */
  readonly faraCasa?: boolean
  readonly seed?: number
}

export interface CasaTermica {
  readonly w: World
  /** Celule de referinta: `casa`, `etaj`, `pivnita` (dupa caz). */
  readonly rep: Readonly<Record<string, readonly [number, number, number]>>
  readonly x0: number
  readonly y0: number
  readonly g: number
}

function ok(o: { ok: boolean }, ce: string): void {
  assert.ok(o.ok, `${ce}: ${JSON.stringify(o)}`)
}

/** Casa, editata direct in teren si sincronizata prin punctul unic (indexul, graful si temperatura la zi). */
export function casaTermica(o: OptiuniCasa = {}): CasaTermica {
  const L = o.L ?? 5
  const H = o.H ?? 2
  const per: MaterialId = o.perete ?? Material.PIATRA_CONSTRUITA
  const acop = o.acoperis ?? per
  const { w, wx, wy, g } = sitPlat(o.seed ?? 12345, L + 8)
  const t = w.terrain
  const x0 = wx + 2
  const y0 = wy + 2
  const Lx = L + 2
  const u = Math.floor(Lx / 2)
  const rep: Record<string, readonly [number, number, number]> = {}
  if (!o.faraCasa) {
    for (let z = g + 1; z <= g + H; z++) for (let dx = 0; dx < Lx; dx++) for (let dy = 0; dy < Lx; dy++) {
      if (dx !== 0 && dx !== Lx - 1 && dy !== 0 && dy !== Lx - 1) continue
      const eUsa = dx === u && dy === 0 && z <= g + 2
      if (eUsa && o.gol) continue
      ok(fill(t, x0 + dx, y0 + dy, z, eUsa ? Material.USA : per), 'perete')
    }
    for (let dx = 0; dx < Lx; dx++) for (let dy = 0; dy < Lx; dy++) ok(fill(t, x0 + dx, y0 + dy, g + H + 1, acop), 'acoperis')
    rep.casa = [x0 + 1 + (L >> 1), y0 + 1 + (L >> 1), g + 1]
    if (o.etaj) {
      const zb = g + H + 1
      for (let z = zb + 1; z <= zb + 2; z++) for (let dx = 0; dx < Lx; dx++) for (let dy = 0; dy < Lx; dy++) {
        if (dx !== 0 && dx !== Lx - 1 && dy !== 0 && dy !== Lx - 1) continue
        ok(fill(t, x0 + dx, y0 + dy, z, acop), 'perete etaj')
      }
      for (let dx = 0; dx < Lx; dx++) for (let dy = 0; dy < Lx; dy++) ok(fill(t, x0 + dx, y0 + dy, zb + 3, acop), 'acoperis etaj')
      rep.etaj = [x0 + 1 + (L >> 1), y0 + 1 + (L >> 1), zb + 1]
    }
  }
  if (o.k !== undefined) {
    const zs = g - o.k
    const zj = zs - 1
    const c = 1 + (L >> 1)
    for (const z of [zj, zs]) for (let dx = c - 1; dx <= c + 1; dx++) for (let dy = c - 1; dy <= c + 1; dy++) ok(dig(t, x0 + dx, y0 + dy, z), 'pivnita')
    for (let z = zs + 1; z <= g - 1; z++) ok(dig(t, x0 + c - 1, y0 + c - 1, z), 'put')
    ok(dig(t, x0 + c - 1, y0 + c - 1, g), 'chepeng dig')
    ok(fill(t, x0 + c - 1, y0 + c - 1, g, Material.USA), 'chepeng')
    rep.pivnita = [x0 + c, y0 + c, zj]
  }
  sincronizeazaLumea(w, R)
  return { w, rep, x0, y0, g }
}

/** Id-ul componentei de la celula de referinta. */
export function compLa(s: CasaTermica, cheie: string): number {
  const [x, y, z] = s.rep[cheie]!
  const c = componentaLa(s.w.camere, x, y, z)
  assert.ok(c, `${cheie}: celula nu e aer acoperit`)
  return c!.id
}

/** C' al componentei, in μ, din contoarele indexului. */
export function capacitateaComponentei(w: World, compId: number, rules: Rules): number {
  const c = w.camere.comp.get(compId)
  assert.ok(c, `componenta ${compId}`)
  const n = contoareComponentei(w.camere, c!)
  assert.ok(n.ok, JSON.stringify(n))
  return capacitateMu(n.value, rules.termic.mase)
}

/** μ in J/K: c_aer / 16. */
export function jPeKPeMu(rules: Rules): number {
  return rules.termic.cAerJPeK / rules.termic.mase.aer
}

export interface ModelFloat {
  readonly gr: GrafTermic
  /** C pe nod, J/K. */
  readonly C: Float64Array
  /** Secunde de joc pe pasul de 1 Hz. */
  readonly dt: number
}

/** Modelul in float pe graful real; `scalaC` inmulteste toate capacitatile (probele negative ale benzilor). */
export function modelFloat(w: World, rules: Rules, scalaC = 1): ModelFloat {
  const g = grafTermic(w.camere, rules)
  assert.ok(g.ok, JSON.stringify(g))
  const gr = g.value
  const C = new Float64Array(gr.n)
  for (let i = 0; i < gr.n; i++) C[i] = capacitateaComponentei(w, gr.comp[i]!, rules) * jPeKPeMu(rules) * scalaC
  return { gr, C, dt: (rules.ticksPerSecond * 86400) / rules.calendar.ziTicks }
}

/** τ_loc = C / ΣG (ΣG cu muchiile), in secunde. */
export function tauLoc(m: ModelFloat, compId: number): number {
  const i = m.gr.nodDupaComp[compId]!
  return m.C[i]! / (m.gr.sumaG[i]! / Q16)
}

// --- pompa incrucisata a regulii C3 (PROV-1): casa, ciclurile, prin COMENZI --------------------------------------------

/** Vara anului 1 (jocul incepe toamna), ziua 2, la ora `h`: 15:00 → T_afara 25,48 °C, T_sol(0) 11,70 °C; 03:00 → 14,95 / 10,81. */
export function oraDeVara(h: number, rules: Rules = R): number {
  return panaLaAnotimp(0, Anotimp.VARA, rules) + rules.calendar.ziTicks + h * tickuriPeOra(rules)
}

/** Casa pompei: `casaTermica()` (5×5×2 de piatra, cu usa, pe IARBA) la `tick`, casa la 20 °C cu restul 0. */
export interface CasaPompei {
  readonly w: World
  /** Celula din centrul podelei (groapa se sapa sub ea, la z1 − 1). */
  readonly cx: number
  readonly cy: number
  readonly z1: number
  /** Celulele de zidit, pe podea: inelul de langa pereti, apoi inelul interior (fara centru), primele K. */
  readonly zid: readonly (readonly [number, number, number])[]
  /** Id-ul componentei casei, acum. */
  id(): number
  /** T-ul casei cu restul, in Q16 (fractionar). */
  tQ(): number
}

export function casaPompei(K: number, tick: number): CasaPompei {
  const s = casaTermica()
  const w = s.w
  w.tick = tick
  const [cx, cy, z1] = s.rep.casa!
  const id = (): number => componentaLa(w.camere, cx, cy, z1)!.id
  w.temperatura.slot.t[id()] = 20 * Q16
  w.temperatura.slot.rest[id()] = 0
  const zid: [number, number, number][] = []
  for (const inel of [1, 2]) for (let dy = 1; dy <= 5; dy++) for (let dx = 1; dx <= 5; dx++) {
    const r = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
    if (r === 3 - inel && zid.length < K) zid.push([s.x0 + dx, s.y0 + dy, z1])
  }
  assert.equal(zid.length, K, `fixtura: K ${K} prea mare`)
  const tQ = (): number => w.temperatura.slot.t[id()]! + w.temperatura.slot.rest[id()]! / capacitateaComponentei(w, id(), R)
  return { w, cx, cy, z1, zid, id, tQ }
}

/** Mormanele sapaturii, carate (un pion le-ar cara; temperatura nu le vede): altfel `fill` pe aceeasi celula refuza. */
export function cara(w: World): void {
  for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1) stergeItem(w.iteme, i)
}

/** O comanda `dig` / `fill` (punctul unic), acceptata; dupa `dig`, mormanul carat. */
export function comanda(w: World, c: Command): void {
  ok(applyCommand(w, c, R), `${c.kind}`)
  if (c.kind === 'dig') cara(w)
}

/** Programul ciclului INCRUCISAT, o comanda pe pas: K pietre zidite → groapa in podea → cele K scoase (FIFO) → groapa astupata cu PAMANT. */
export function cicluIncrucisat(c: CasaPompei): Command[] {
  const P = Material.PIATRA_CONSTRUITA
  return [
    ...c.zid.map(([x, y, z]): Command => ({ kind: 'fill', wx: x, wy: y, z, material: P })),
    { kind: 'dig', wx: c.cx, wy: c.cy, z: c.z1 - 1 },
    ...c.zid.map(([x, y, z]): Command => ({ kind: 'dig', wx: x, wy: y, z })),
    { kind: 'fill', wx: c.cx, wy: c.cy, z: c.z1 - 1, material: Material.PAMANT },
  ]
}
