/**
 * Unde incepe o lume — PUR, functie de seed.
 *
 * `locDemo` e alegerea de azi a viewer-ului (mutata din main.ts, neschimbata: OWNER_VERIFY 13 are
 * coordonate pe ea): un chunk cu sol bun si putin relief, „o vale in care sa sapi". Pentru un joc
 * NOU, relieful ala e o panta de ~27 m pe 40 m, cu zero ferestre 7×7 plate, iar primul depozit iese
 * o fasie (panoul de design, JN-4). `locJocNou` alege, dintre primii 30 de candidati ai aceluiasi
 * scor, pe cel cu cele mai multe ferestre 7×7 plate (relief ≤ 1 m) in 32×32; oamenii pornesc in
 * centrul ferestrei plate cea mai apropiata de mijlocul chunk-ului. Masurat de panou: 4–16 ms,
 * 501–676 din 676 de ferestre plate, pe 15 seed-uri.
 */

import { Biome, MACRO_METERS, sampleMacro } from '../../src/sim/terrain/macro.ts'
import { CHUNK_CELLS } from '../../src/sim/terrain/chunk.ts'
import { createTerrain, groundLevelM } from '../../src/sim/terrain/terrain.ts'

export interface Candidat {
  readonly cx: number
  readonly cy: number
  readonly scor: number
}

/** Candidatii scorului de azi, cel mai bun primul; la egalitate, primul gasit (ca `score > best`). */
export function candidatiLoc(seed: number): Candidat[] {
  const out: (Candidat & { i: number })[] = []
  for (let cy = 60; cy < 460; cy += 7) {
    for (let cx = 60; cx < 460; cx += 7) {
      const sx = (cx * CHUNK_CELLS) / MACRO_METERS
      const sy = (cy * CHUNK_CELLS) / MACRO_METERS
      const s = sampleMacro(seed, sx, sy)
      if (s.biome === Biome.APA) continue
      if (s.heightDm < 50 || s.heightDm > 700) continue
      const around = [
        sampleMacro(seed, sx + 2, sy).heightDm,
        sampleMacro(seed, sx - 2, sy).heightDm,
        sampleMacro(seed, sx, sy + 2).heightDm,
        sampleMacro(seed, sx, sy - 2).heightDm,
      ]
      // Un pic de relief e bun — o vale in care sa sapi. Prea mult inseamna perete.
      const spread = Math.max(...around) - Math.min(...around)
      out.push({ cx, cy, scor: s.soil + Math.min(spread, 300) / 4 - Math.max(0, spread - 400) / 2, i: out.length })
    }
  }
  out.sort((a, b) => b.scor - a.scor || a.i - b.i)
  return out.map(({ cx, cy, scor }) => ({ cx, cy, scor }))
}

/** Locul demo-ului si al modului de verificare. Fara niciun candidat: 250/250, ca inainte. */
export function locDemo(seed: number): { cx: number; cy: number } {
  const c = candidatiLoc(seed)[0]
  return c ? { cx: c.cx, cy: c.cy } : { cx: 250, cy: 250 }
}

export interface LocJocNou {
  readonly cx: number
  readonly cy: number
  /** Celula din centrul ferestrei plate alese: acolo se nasc oamenii si se uita camera. */
  readonly wx: number
  readonly wy: number
  /** Cate ferestre 7×7 plate are patratul de 32×32 (pentru Diagnostic). */
  readonly plate: number
}

export const CANDIDATI_JOC_NOU = 30
const LATURA = 32
const FEREASTRA = 7

export function locJocNou(seed: number): LocJocNou {
  const cand = candidatiLoc(seed).slice(0, CANDIDATI_JOC_NOU)
  // Un teren de aruncat: chunk-urile generate ca sa se citeasca solul nu intra in lumea jocului.
  const t = createTerrain(seed, 1)
  let best: LocJocNou | null = null
  for (const c of cand) {
    const x0 = c.cx * CHUNK_CELLS + 16 - LATURA / 2
    const y0 = c.cy * CHUNK_CELLS + 16 - LATURA / 2
    const g = new Int32Array(LATURA * LATURA)
    for (let y = 0; y < LATURA; y++) {
      for (let x = 0; x < LATURA; x++) {
        const r = groundLevelM(t, x0 + x, y0 + y)
        g[y * LATURA + x] = r.ok ? r.value : -99999
      }
    }
    let plate = 0
    let centru: { wx: number; wy: number; d: number } | null = null
    for (let y = 0; y + FEREASTRA <= LATURA; y++) {
      for (let x = 0; x + FEREASTRA <= LATURA; x++) {
        let lo = Infinity, hi = -Infinity
        for (let j = 0; j < FEREASTRA; j++) {
          for (let i = 0; i < FEREASTRA; i++) {
            const v = g[(y + j) * LATURA + x + i]!
            if (v < lo) lo = v
            if (v > hi) hi = v
          }
        }
        if (hi - lo > 1) continue
        plate++
        const cx = x + 3, cy = y + 3
        const d = Math.abs(cx - LATURA / 2) + Math.abs(cy - LATURA / 2)
        if (!centru || d < centru.d) centru = { wx: x0 + cx, wy: y0 + cy, d }
      }
    }
    if (!best || plate > best.plate) {
      best = { cx: c.cx, cy: c.cy, wx: centru?.wx ?? c.cx * CHUNK_CELLS + 16, wy: centru?.wy ?? c.cy * CHUNK_CELLS + 16, plate }
    }
  }
  return best ?? { cx: 250, cy: 250, wx: 250 * CHUNK_CELLS + 16, wy: 250 * CHUNK_CELLS + 16, plate: 0 }
}
