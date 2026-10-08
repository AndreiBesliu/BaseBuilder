/**
 * Fixturile temperaturii din t.2b: casele numite ale designului (§4: casa de piatra 5×5×2 cu usa, etajul, golul
 * usii, pivnitele sub casa si fara casa, casa din pamant zidit) si modelul in FLOAT al pasului, pe graful real.
 *
 * Casele sunt cele din verificarile panoului t.2b (verif-NUM-1, verif-NUM-2): interiorul L×L×H, peretii de 1 m,
 * usa 1×2 (sau golul) la mijlocul peretelui de sud, acoperisul la g+H+1; etajul L×L×2 deasupra, cu placa =
 * acoperisul parterului; pivnita 3×3×2 sub mijloc cu k m de pamant deasupra, put si chepeng USA.
 *
 * Modelul in float e un MODEL de calibrare, nu pasul jocului: capacitatea vine din contoarele indexului
 * (C'·μ, in J/K), conductantele din graful real (`grafTermic`), rezervoarele din `temperaturiRezervoare`, iar
 * fiecare pas de 1 Hz e exponentiala EXACTA pe nod (Jacobi pe muchii). Pasul pe intregi (forma ψ, §5.2) vine in
 * commit-ul 4 al valului 1; atunci testele de calibrare se re-ancoreaza pe el (integratorul conteaza la nivelul de
 * 0,004 °C pe valul de frig — verif-NUM-2 —, cu doua ordine de marime sub banda).
 */

import assert from 'node:assert/strict'
import type { Rules } from '../src/sim/content.ts'
import { componentaLa, sincronizeazaCamere } from '../src/sim/camere.ts'
import { capacitateMu, contoareComponentei } from '../src/sim/fete.ts'
import type { GrafTermic } from '../src/sim/termic.ts'
import { grafTermic } from '../src/sim/termic.ts'
import type { World } from '../src/sim/state.ts'
import type { MaterialId } from '../src/sim/terrain/chunk.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill } from '../src/sim/terrain/terrain.ts'
import { sitPlat } from './fixturi.ts'

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

/** Casa, editata direct in teren si sincronizata (indexul la zi). */
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
  sincronizeazaCamere(w.camere, t)
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

/** Un pas de 1 Hz: exponentiala exacta pe nod, cu rezervoarele si vecinii tinuti constanti pe pas. `tR` in Q16. */
export function pasExp(m: ModelFloat, T: Float64Array, tR: ArrayLike<number>): void {
  const g = m.gr
  const nou = new Float64Array(g.n)
  for (let i = 0; i < g.n; i++) {
    let S = 0
    let X = 0
    for (let k = g.rezStart[i]!; k < g.rezStart[i + 1]!; k++) {
      const G = g.rezG[k]! / Q16
      S += G
      X += G * (tR[g.rezBin[k]!]! / Q16)
    }
    for (let k = g.vecStart[i]!; k < g.vecStart[i + 1]!; k++) {
      const G = g.vecG[k]! / Q16
      S += G
      X += G * T[g.vecNod[k]!]!
    }
    const tEq = X / S
    nou[i] = tEq + (T[i]! - tEq) * Math.exp((-S * m.dt) / m.C[i]!)
  }
  T.set(nou)
}
