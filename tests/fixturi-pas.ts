/**
 * Fixturile pasului de 1 Hz (S24-27 t.2b §5, src/sim/temperatura.ts): energia lumii pe graful incremental, o REFERINȚĂ
 * independentă a pasului (scrisă din nou aici, pe BigInt, din nodurile grafului — nu împarte cod cu pasul), scenele
 * numerice (hotelul de camere interioare, mina 192×192×3, celula-cruce) și avansul „doar termic" al unei lumi fără pioni.
 */

import assert from 'node:assert/strict'
import type { Rules } from '../src/sim/content.ts'
import { capacitateMu } from '../src/sim/fete.ts'
import { componentaLa } from '../src/sim/camere.ts'
import { cellOf } from '../src/sim/drumuri.ts'
import type { World } from '../src/sim/state.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { dig, fill, groundLevelM } from '../src/sim/terrain/terrain.ts'
import type { GrafIncremental } from '../src/sim/termic.ts'
import { grafulIncremental, temperaturiRezervoare } from '../src/sim/termic.ts'
import { pasTermic, sincronizeazaLumea, statTermic, temperaturaLaEchilibru } from '../src/sim/temperatura.ts'
import { R, sitPlat } from './fixturi.ts'

const P = Material.PIATRA_CONSTRUITA

export function bun<T>(o: { ok: boolean; value?: T }, ce: string): T {
  if (!o.ok) assert.fail(`${ce}: ${JSON.stringify(o)}`)
  return (o as { value: T }).value
}

export function grafLumii(w: World, rules: Rules = R): GrafIncremental {
  return bun(grafulIncremental(w.camere, rules), 'grafulIncremental')
}

/** Energia lumii, Σ C'·T + rest pe nodurile grafului incremental (μ·Q16), pe BigInt. */
export function energia(w: World, rules: Rules = R): bigint {
  let e = 0n
  const sl = w.temperatura.slot
  // determinism-ok: sumă exactă pe BigInt.
  for (const n of grafLumii(w, rules).noduri.values()) e += BigInt(capacitateMu(n, rules.termic.mase)) * BigInt(sl.t[n.comp]!) + BigInt(sl.rest[n.comp]!)
  return e
}

/** (T, rest) pe ancoră, pentru comparații între lumi (sloturile pot diferi). */
export function tPeAncora(w: World): string[] {
  const out: string[] = []
  const sl = w.temperatura.slot
  for (const c of [...w.camere.comp.values()].sort((a, b) => a.ancora - b.ancora)) out.push(`${c.ancora}:${sl.t[c.id]}:${sl.rest[c.id]}`)
  return out
}

/** O lume „fără istorie" la `tick`: T de la echilibru (casele editate direct în teren și sincronizate). */
export function laEchilibru(w: World, tick: number, rules: Rules = R): World {
  w.tick = tick
  bun(temperaturaLaEchilibru(w, rules, tick), 'temperaturaLaEchilibru')
  return w
}

/**
 * Avansul DOAR termic al unei lumi fără pioni și fără editări: tickul crește, iar la `tick % tps === 0` rulează pasul
 * (exact ce face `tick` din world.ts când `stepAgents` și lotul n-au nimic de făcut). Întoarce numărul de pași.
 */
export function avanseazaTermic(w: World, pana: number, rules: Rules = R): number {
  let pasi = 0
  for (; w.tick < pana; w.tick++) {
    if (w.tick % rules.ticksPerSecond === 0) {
      pasTermic(w, rules)
      pasi++
    }
  }
  return pasi
}

export function faraInvarianti(w: World, ce: string): void {
  const s = statTermic(w)
  assert.equal(s.invarianti, 0, `${ce}: invariant incalcat — ${s.ultimulInvariant}`)
}

// --- referința independentă a pasului --------------------------------------------------------------

function rsB(n: bigint, d: bigint): bigint {
  const neg = n < 0n
  const a = neg ? -n : n
  let q = a / d
  if (2n * (a - q * d) >= d) q++
  return neg ? -q : q
}

function floorDiv(a: bigint, b: bigint): bigint {
  const q = a / b
  return a % b !== 0n && (a < 0n) !== (b < 0n) ? q - 1n : q
}

/**
 * Pasul ψ al designului (§5.1, §5.2), scris DIN NOU pe BigInt, din nodurile grafului: g pe pas = round(G·tps·86.400·μ_aer /
 * (ziTicks·c_aer)), muchiile o dată pe pereche din T VECHI, oamenii (W pe nod, o conversie), T* = T după muchii și oameni
 * (NUM-7), rezervoarele cu ψ. Scrie în starea lumii, ca pasul. Oracolul „pasul == specificația", independent de forma
 * Number / BigInt și de modelul memorat al pasului.
 */
export function pasReferinta(w: World, rules: Rules = R): void {
  const g = grafLumii(w, rules)
  const sl = w.temperatura.slot
  const A = BigInt(rules.ticksPerSecond * 86400 * rules.termic.mase.aer)
  const B = BigInt(rules.calendar.ziTicks * rules.termic.cAerJPeK)
  const gp = (G: number): bigint => (2n * BigInt(G) * A + B) / (2n * B)
  const Q = 65536n
  const tRez = temperaturiRezervoare(w.seed, w.tick, rules)
  const H = new Map<number, bigint>()
  const C = new Map<number, bigint>()
  // determinism-ok: totul pe BigInt, sume exacte.
  for (const [et, n] of g.noduri) {
    const c = BigInt(capacitateMu(n, rules.termic.mase))
    C.set(et, c)
    H.set(et, c * BigInt(sl.t[n.comp]!) + BigInt(sl.rest[n.comp]!))
  }
  const Tvechi = (et: number): bigint => BigInt(sl.t[g.noduri.get(et)!.comp]!)
  // determinism-ok: idem.
  for (const [a, n] of g.noduri) {
    for (const [b, G] of n.vec) {
      if (a > b) continue
      const F = rsB(gp(G) * (Tvechi(a) - Tvechi(b)), Q)
      H.set(a, H.get(a)! - F)
      H.set(b, H.get(b)! + F)
    }
  }
  const W = new Map<number, number>()
  const ag = w.agents
  for (let s = 0; s < ag.count; s++) {
    if (ag.alive[s] !== 1) continue
    const c = componentaLa(w.camere, cellOf(ag.x[s]!), cellOf(ag.y[s]!), ag.z[s]!)
    if (c === null) continue
    const et = g.nodComp.get(c.id)!
    W.set(et, (W.get(et) ?? 0) + rules.termic.omW)
  }
  // determinism-ok: idem.
  for (const [et, n] of g.noduri) {
    const w0 = W.get(et) ?? 0
    let h = H.get(et)!
    if (w0 > 0) h += (2n * BigInt(w0) * Q * A + B) / (2n * B)
    const c = C.get(et)!
    const tStar = floorDiv(h, c)
    let S = 0n
    let X = 0n
    for (const [bin, G] of n.bin) {
      const v = gp(G)
      S += v
      X += v * (BigInt(tRez[bin]!) - tStar)
    }
    const psi = Q - rsB(Q * S, c * Q + S)
    h += rsB(rsB(X, Q) * psi, Q)
    const t = floorDiv(h, c)
    sl.t[n.comp] = Number(t)
    sl.rest[n.comp] = Number(h - t * c)
  }
}

// --- scenele numerice ------------------------------------------------------------------------------

/**
 * Hotelul recenziei GRAF (L3-3, tests/termic.test.ts): un bloc de piatră (2N+1)² × (2H+1) peste sol, cu o cameră de o
 * celulă la fiecare (impar, impar, par) — N²·H încăperi interioare legate prin 1 m de piatră, multe fără rezervor.
 */
export function hotel(N: number, H: number): World {
  const s = sitPlat(777, 10)
  const t = s.w.terrain
  const x0 = s.wx + 2, y0 = s.wy + 2
  let g = Number.NEGATIVE_INFINITY
  for (let x = 0; x <= 2 * N; x++) for (let y = 0; y <= 2 * N; y++) g = Math.max(g, bun(groundLevelM(t, x0 + x, y0 + y), 'g'))
  for (let x = 0; x <= 2 * N; x++) for (let y = 0; y <= 2 * N; y++) {
    for (let z = bun(groundLevelM(t, x0 + x, y0 + y), 'g') + 1; z <= g; z++) assert.ok(fill(t, x0 + x, y0 + y, z, P).ok)
  }
  for (let z = 1; z <= 2 * H + 1; z++) for (let x = 0; x <= 2 * N; x++) for (let y = 0; y <= 2 * N; y++) {
    if (x % 2 === 1 && y % 2 === 1 && z % 2 === 0) continue
    assert.ok(fill(t, x0 + x, y0 + y, g + z, P).ok)
  }
  bun(sincronizeazaLumea(s.w, R), 'sincronizeazaLumea')
  return s.w
}

/** Mina panoului (tests/termic.test.ts): 192×192 cu stâlpi la 4 m, la 2–4 m sub sol, dintr-un lot; un singur nod, Σg ≈ 2^34. */
export function mina192(rules: Rules = R): World {
  const s = sitPlat(12345, 8)
  const t = s.w.terrain
  const x0 = s.wx + 2, y0 = s.wy + 2
  for (let y = 0; y < 192; y++) for (let x = 0; x < 192; x++) {
    if (x % 4 === 0 && y % 4 === 0) continue
    const gg = bun(groundLevelM(t, x0 + x, y0 + y), 'g')
    for (let d = 2; d <= 4; d++) dig(t, x0 + x, y0 + y, gg - d)
  }
  bun(sincronizeazaLumea(s.w, rules), 'sincronizeazaLumea')
  return s.w
}

/**
 * Celula-cruce (B3, NUM-8): o celulă de aer într-un bloc de piatră, cu o USA pe fiecare din cele 6 fețe și câte o cameră de
 * o celulă dincolo — Σ g_muchii / C' la marginea gărzii `6·g_max < 1`. Întoarce lumea și celula din mijloc.
 */
export function cruce(rules: Rules): { w: World; c: [number, number, number] } {
  const { w, wx, wy, g } = sitPlat(4242, 12)
  const t = w.terrain
  for (let z = g + 1; z <= g + 11; z++) for (let dx = 0; dx < 11; dx++) for (let dy = 0; dy < 11; dy++) assert.ok(fill(t, wx + dx, wy + dy, z, P).ok)
  const c: [number, number, number] = [wx + 5, wy + 5, g + 6]
  assert.ok(dig(t, ...c).ok)
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
    assert.ok(dig(t, c[0] + dx, c[1] + dy, c[2] + dz).ok)
    assert.ok(fill(t, c[0] + dx, c[1] + dy, c[2] + dz, Material.USA).ok)
    assert.ok(dig(t, c[0] + 2 * dx, c[1] + 2 * dy, c[2] + 2 * dz).ok)
  }
  bun(sincronizeazaLumea(w, rules), 'sincronizeazaLumea')
  return { w, c }
}
