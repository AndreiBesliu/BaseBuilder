/**
 * Hash-ul starii — singura dovada mecanica de determinism pe care o avem.
 *
 * Se foloseste in trei locuri, toate din saptamana 1:
 *  - golden replay: acelasi seed + acelasi log de input => acelasi hash dupa N tickuri
 *  - roundtrip de save: 1000 tickuri + salvare + incarcare + 1000 == 2000 tickuri
 *  - regresie in CI: un save de referinta produce acelasi hash la fiecare commit
 *
 * FNV-1a pe 32 de biti. Nu e criptografic si nu trebuie sa fie — trebuie doar sa
 * fie STABIL intre rulari si sensibil la orice bit din stare.
 */

import type { World } from './state.ts'
import { CATEGORII, RNG_STREAMS } from './state.ts'
import { runCount } from './terrain/chunk.ts'

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

export class Hasher {
  private h = FNV_OFFSET

  u32(v: number): this {
    let x = v >>> 0
    for (let i = 0; i < 4; i++) {
      this.h ^= x & 0xff
      this.h = Math.imul(this.h, FNV_PRIME)
      x >>>= 8
    }
    return this
  }

  i32(v: number): this {
    return this.u32(v | 0)
  }

  bytes(view: Uint8Array, length: number): this {
    for (let i = 0; i < length; i++) {
      this.h ^= view[i]!
      this.h = Math.imul(this.h, FNV_PRIME)
    }
    return this
  }

  ints(view: Int32Array, length: number): this {
    for (let i = 0; i < length; i++) this.u32(view[i]!)
    return this
  }

  text(s: string): this {
    for (let i = 0; i < s.length; i++) {
      this.h ^= s.charCodeAt(i) & 0xff
      this.h = Math.imul(this.h, FNV_PRIME)
    }
    return this
  }

  value(): number {
    return this.h >>> 0
  }

  hex(): string {
    return (this.h >>> 0).toString(16).padStart(8, '0')
  }
}

/**
 * Hash-ul intregii stari PERSISTED.
 *
 * Ordinea de parcurgere e FIXA si explicita. Nicio iterare peste chei de obiect
 * fara sortare — exact tiparul care introduce nedeterminism tacut si care se
 * reproduce „o data din cinci".
 */
export function hashWorld(w: World): string {
  const h = new Hasher()
  h.u32(w.schema).u32(w.seed).u32(w.tick).u32(w.nextId)
  // `bounds` nu se mai amesteca: e o constanta, deci n-ar putea distinge doua lumi.

  // RNG_STREAMS e o lista ordonata, nu Object.keys(w.rng).
  for (const name of RNG_STREAMS) {
    const st = w.rng[name]
    h.text(name).u32(st.s0).u32(st.s1).u32(st.s2).u32(st.s3).u32(st.draws)
  }

  const a = w.agents
  h.u32(a.count)
  h.ints(a.id, a.count)
  h.ints(a.x, a.count)
  h.ints(a.y, a.count)
  h.ints(a.z, a.count)
  h.bytes(a.faction, a.count)
  h.bytes(a.alive, a.count)
  // Tintele sunt PERSISTED, deci intra in hash. Si DRUMURILE, de cand s-a
  // dovedit ca nu sunt derivate: un A* nu are raspuns unic, deci doua lumi cu
  // aceeasi pozitie si aceeasi tinta pot merge legitim pe rute diferite. Daca
  // drumul n-ar intra in hash, divergenta aia ar sta ascunsa pana se vede in
  // pozitii, adica dupa cateva tickuri si fara sa se stie de unde a venit.
  h.ints(a.goalX, a.count)
  h.ints(a.goalY, a.count)
  h.ints(a.goalZ, a.count)
  h.bytes(a.hasGoal, a.count)
  h.ints(a.progresMm, a.count)
  // Jobul curent si prioritatile personale: PERSISTED, deci in hash. Rezervarile
  // NU: sunt derivate din joburi, si doua lumi cu aceleasi joburi le au identice.
  h.bytes(a.jobKind, a.count)
  h.ints(a.jobId, a.count)
  h.ints(a.jobTarget, a.count)
  h.bytes(a.jobStep, a.count)
  h.ints(a.jobProgres, a.count)
  h.ints(a.jobWorkX, a.count)
  h.ints(a.jobWorkY, a.count)
  h.ints(a.jobWorkZ, a.count)
  h.bytes(a.jobIncercari, a.count)
  h.ints(a.tintaRefuzata, a.count)
  h.ints(a.refuzPanaLa, a.count)
  h.bytes(a.prioPersonala, a.count * CATEGORII)

  // Desemnarile, in ordinea slotului. `ultimulMotiv` e TRANSIENT si nu intra.
  const d = w.desemnari
  h.u32(d.count)
  h.ints(d.id, d.count)
  h.bytes(d.kind, d.count)
  h.ints(d.wx, d.count)
  h.ints(d.wy, d.count)
  h.ints(d.z, d.count)
  h.bytes(d.prioritate, d.count)
  h.bytes(d.alive, d.count)
  h.ints(d.reincercaLaTick, d.count)

  // Drumurile: numai coada ramasa a fiecarui agent viu, in ordinea slotului.
  const p = w.paths
  for (let i = 0; i < a.count; i++) {
    const len = p.len[i]!
    const cur = p.cursor[i]!
    const ramase = a.alive[i] === 0 || cur >= len ? 0 : len - cur
    h.u32(ramase).u32(p.nextReplanTick[i]! >>> 0)
    const baza = i * p.maxCells * 3
    for (let c = 0; c < ramase * 3; c++) h.u32(p.cells[baza + cur * 3 + c]! >>> 0)
  }

  // Terenul: NUMAI chunk-urile promovate. Cele ne-promovate sunt DERIVED — se
  // regenereaza identic din seed, deci n-au ce cauta in hash. Daca ar intra,
  // hash-ul ar depinde de unde s-a uitat camera, iar doua lumi identice ca
  // CONTINUT ar parea diferite.
  const t = w.terrain
  h.i32(t.focusCx).i32(t.focusCy)
  let promoted = 0
  for (const key of t.keys) if (t.chunks.get(key)!.voxels !== null) promoted++
  h.u32(promoted)

  // `t.keys` e mentinut sortat tocmai pentru randul asta.
  for (const key of t.keys) {
    const chunk = t.chunks.get(key)!
    const v = chunk.voxels
    if (!v) continue
    const runs = runCount(v)
    h.u32(key).i32(v.zBaseM).u32(runs)
    h.bytes(v.runMaterial, runs)
    h.bytes(v.runLength, runs)
  }

  return h.hex()
}
