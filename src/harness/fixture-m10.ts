/**
 * Fixtura M10 — asezarea de la luna 10, construita determinist.
 *
 * Exista dintr-un singur motiv: gate-ul de motor (D1) trebuie rulat pe ceea ce
 * jocul va fi, nu pe ce e azi. Fortareata din viewer promoveaza 12 chunk-uri.
 * Un gate rulat pe ea trece cu orice stiva si nu spune nimic.
 *
 * Doua greseli de fixtura, amandoua deja platite o data in proiectul asta:
 *
 *  - SAPAREA ALEATOARE. A mintit in sesiunea 1: mesher-ul parea de 3× mai lent
 *    decat e, fiindca zgomotul e cel mai prost caz posibil pentru greedy meshing
 *    si nu seamana cu nimic din ce construieste un jucator. Aici totul e
 *    structural: camere dreptunghiulare, coridoare drepte, ziduri pe grila.
 *
 *  - VALIDAREA PRIN RAPORTUL DE REDUCERE AL MESHER-ULUI. E auto-referentiala:
 *    selecteaza fixturi IEFTINE de meshuit, nu fixturi realiste. Validarea de
 *    aici (`describeFixture`) numara lucruri independente de mesher — camere,
 *    chunk-uri promovate, celule sapate — si le compara cu bugetul din PLAN §2.
 *
 * Parametrii sunt constante numite, nu numere imprastiate, tocmai ca sa nu poata
 * fi micsorati tacut dupa un esec de gate. Orice modificare a lor e un commit
 * separat si invalideaza seriile de masuratori existente.
 */

import { reconstruiesteCamere } from '../sim/camere.ts'
import type { World } from '../sim/state.ts'
import { CHUNK_CELLS, Material } from '../sim/terrain/chunk.ts'
import type { Terrain } from '../sim/terrain/terrain.ts'
import { createTerrain, dig, fill, groundLevelM, promotedCount, setFocus } from '../sim/terrain/terrain.ts'

/** Latura asezarii, in chunk-uri. 13 × 32 m = 416 m. */
export const SETTLEMENT_CHUNKS = 13
/** Pasul grilei de camere, in metri. */
export const ROOM_PITCH = 16
/** Latura interiorului unei camere, in metri. Restul pana la pas e zid. */
export const ROOM_INNER = 10
/** Cate niveluri in jos are o camera. */
export const ROOM_DEPTH = 3
/** La cate camere se pune un coridor transversal. */
export const CORRIDOR_EVERY = 4
/** Inaltimea zidului de incinta, in metri. */
export const WALL_HEIGHT = 4
/** Latura unui turn, in metri. */
export const TOWER_SIDE = 5
/** Inaltimea unui turn, in metri. */
export const TOWER_HEIGHT = 9

export interface FixtureStats {
  readonly chunkCx: number
  readonly chunkCy: number
  readonly rooms: number
  readonly digsAttempted: number
  readonly digsAccepted: number
  readonly fillsAccepted: number
  readonly promotedChunks: number
  readonly residentChunks: number
}

/**
 * Construieste asezarea in `t`, cu coltul in chunk-ul (cx, cy).
 *
 * Nu foloseste RNG: pozitiile sunt pe grila, adancimile sunt constante, iar
 * singura variabila e relieful — care e o functie pura de seed. Doua rulari pe
 * acelasi seed dau exact acelasi teren, deci aceleasi cifre de gate.
 */
export function buildM10(t: Terrain, cx: number, cy: number): FixtureStats {
  const baseX = cx * CHUNK_CELLS
  const baseY = cy * CHUNK_CELLS
  const span = SETTLEMENT_CHUNKS * CHUNK_CELLS
  const margin = (ROOM_PITCH - ROOM_INNER) >> 1

  let rooms = 0
  let digsAttempted = 0
  let digsAccepted = 0
  let fillsAccepted = 0

  const digAt = (wx: number, wy: number, depth: number): void => {
    const g = groundLevelM(t, wx, wy)
    if (!g.ok) return
    digsAttempted++
    if (dig(t, wx, wy, g.value - depth).ok) digsAccepted++
  }
  const fillAt = (wx: number, wy: number, height: number): void => {
    const g = groundLevelM(t, wx, wy)
    if (!g.ok) return
    if (fill(t, wx, wy, g.value + height, Material.PIATRA_CONSTRUITA).ok) fillsAccepted++
  }

  // Camerele: grila regulata, fiecare sapata pe ROOM_DEPTH niveluri.
  for (let ry = margin; ry + ROOM_INNER <= span; ry += ROOM_PITCH) {
    for (let rx = margin; rx + ROOM_INNER <= span; rx += ROOM_PITCH) {
      rooms++
      for (let d = 1; d <= ROOM_DEPTH; d++) {
        for (let y = 0; y < ROOM_INNER; y++) {
          for (let x = 0; x < ROOM_INNER; x++) digAt(baseX + rx + x, baseY + ry + y, d)
        }
      }
    }
  }

  // Coridoare transversale, la fiecare CORRIDOR_EVERY camere, pe toata latimea.
  for (let ry = 0; ry < span; ry += ROOM_PITCH * CORRIDOR_EVERY) {
    for (let x = 0; x < span; x++) {
      for (let d = 1; d <= 2; d++) digAt(baseX + x, baseY + ry, d)
    }
  }
  for (let rx = 0; rx < span; rx += ROOM_PITCH * CORRIDOR_EVERY) {
    for (let y = 0; y < span; y++) {
      for (let d = 1; d <= 2; d++) digAt(baseX + rx, baseY + y, d)
    }
  }

  // Zidul de incinta: doua laturi, ca sa existe si constructie deasupra solului.
  for (let i = 0; i < span; i++) {
    for (let h = 1; h <= WALL_HEIGHT; h++) {
      fillAt(baseX + i, baseY, h)
      fillAt(baseX, baseY + i, h)
    }
  }

  // Turnuri pe latura de nord, la fiecare doua pasuri de coridor.
  for (let rx = 0; rx + TOWER_SIDE < span; rx += ROOM_PITCH * CORRIDOR_EVERY * 2) {
    for (let y = 0; y < TOWER_SIDE; y++) {
      for (let x = 0; x < TOWER_SIDE; x++) {
        const onEdge = x === 0 || y === 0 || x === TOWER_SIDE - 1 || y === TOWER_SIDE - 1
        if (!onEdge) continue
        for (let h = 1; h <= TOWER_HEIGHT; h++) fillAt(baseX + rx + x, baseY + 2 + y, h)
      }
    }
  }

  return {
    chunkCx: cx,
    chunkCy: cy,
    rooms,
    digsAttempted,
    digsAccepted,
    fillsAccepted,
    promotedChunks: promotedCount(t),
    residentChunks: t.keys.length,
  }
}

/**
 * Asezarea zidita pe o LUME, nu doar pe un teren (gate-ul viewer-ului, `?scenario=…`).
 *
 * `buildM10` scrie direct in teren, in afara tickului si a comenzilor: e o a treia cale de editare,
 * deci trebuie urmata de un punct de sincronizare explicit, ca in `decode`. Fara el (recenzia
 * incaperilor, IDX-5), invariantul `camere.vazute === terrain.editari` cadea (0 fata de 218.230),
 * overlay-ul I si inspectorul vedeau 0 incaperi in loc de 677, iar prima comanda `dig` din S-DIG
 * platea recalculul intregii fixturi (~420 ms), in bucla masurata a gate-ului.
 */
export function buildM10PeLume(w: World, cx: number, cy: number): FixtureStats {
  const stats = buildM10(w.terrain, cx, cy)
  reconstruiesteCamere(w.camere, w.terrain)
  return stats
}

/** Terenul + asezarea, gata de masurat. `radius` e raza discului rezident. */
export function makeM10(seed: number, cx: number, cy: number, radius = 11): { terrain: Terrain; stats: FixtureStats } {
  const terrain = createTerrain(seed, radius)
  setFocus(terrain, cx, cy)
  const stats = buildM10(terrain, cx, cy)
  return { terrain, stats }
}
