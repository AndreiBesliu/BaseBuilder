/**
 * Drumurile in curs si aritmetica de celule.
 *
 * Scoase din `agents.ts` ca sa poata fi folosite si de `joburi.ts` fara un ciclu
 * de import: agentii cheama joburile, joburile n-au voie sa cheme agentii.
 *
 * Drumul e PERSISTED — vezi antetul din `agents.ts` pentru de ce nu e derivat
 * (un A* nu are raspuns unic).
 */

import { MM_PER_CELL } from './state.ts'

/** Celula in care sta un agent, din pozitia lui in milimetri. */
export function cellOf(mm: number): number {
  return Math.floor(mm / MM_PER_CELL)
}

/** Centrul unei celule, in milimetri. Tinta spre care merge agentul. */
export function centerMm(cell: number): number {
  return cell * MM_PER_CELL + MM_PER_CELL / 2
}

/**
 * Drumurile. Stocate cu pas FIX per agent, nu ca liste: SoA, zero alocari dupa
 * creare, si un drum prea lung se taie la plafon in loc sa creasca memoria la
 * nesfarsit.
 */
export interface PathStore {
  readonly maxCells: number
  /** (x, y, z) per celula, `maxCells * 3` numere rezervate pentru fiecare agent. */
  readonly cells: Int32Array
  readonly len: Int32Array
  readonly cursor: Int32Array
  /** Tickul de la care agentul mai are voie sa re-planifice. */
  readonly nextReplanTick: Int32Array
}

export function makePathStore(capacity: number, maxCells: number): PathStore {
  return {
    maxCells,
    cells: new Int32Array(capacity * maxCells * 3),
    len: new Int32Array(capacity),
    cursor: new Int32Array(capacity),
    nextReplanTick: new Int32Array(capacity),
  }
}

export function clearPath(p: PathStore, slot: number): void {
  p.len[slot] = 0
  p.cursor[slot] = 0
}
