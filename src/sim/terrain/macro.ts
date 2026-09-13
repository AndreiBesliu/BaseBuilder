/**
 * L0 — harta macro. Toata lumea, la rezolutie de 16 m.
 *
 * 1024 × 1024 esantioane = 16.384 m × 16.384 m ≈ 268 km².
 *
 * Nu se materializeaza si nu se salveaza: e o FUNCTIE PURA de (pozitie, seed).
 * Se salveaza doar diferentele fata de ea. Asta e singurul motiv pentru care o
 * lume de 268 km² incape intr-un save de cativa megabytes — si e trucul central
 * imprumutat de la Sapiens, singurul care merita imprumutat de acolo.
 */

import { fbm, FP_ONE, FP_SHIFT } from './noise.ts'

/** Latimea hartii macro, in esantioane. */
export const MACRO_SIZE = 1024
/** Cati metri acopera un esantion macro. */
export const MACRO_METERS = 16
/** Latimea lumii, in milimetri. */
export const WORLD_MM = MACRO_SIZE * MACRO_METERS * 1000

export const Biome = {
  APA: 0,
  CAMPIE: 1,
  PADURE: 2,
  DEAL: 3,
  MUNTE: 4,
} as const
export type BiomeId = (typeof Biome)[keyof typeof Biome]

export interface MacroSample {
  /** Inaltime in decimetri fata de nivelul de referinta. */
  readonly heightDm: number
  readonly biome: BiomeId
  /** Fertilitatea solului, 0-255. */
  readonly soil: number
  /** Umiditatea, 0-255. */
  readonly moisture: number
  /** Temperatura de baza, in grade Celsius. */
  readonly baseTempC: number
}

/** Scara verticala: cat inseamna amplitudinea maxima a zgomotului, in decimetri. */
const HEIGHT_SCALE_DM = 1800
/** Nivelul apei, in decimetri. Sub el e apa. */
export const WATER_LEVEL_DM = -60

/**
 * Inaltimea bruta, in decimetri. Pura, fara stare.
 * `sx`, `sy` sunt coordonate de esantion macro (0..MACRO_SIZE-1).
 */
export function macroHeightDm(seed: number, sx: number, sy: number): number {
  // Frecventa: un ciclu la ~64 de esantioane (~1 km) pe octava de baza.
  const px = (sx << FP_SHIFT) >> 6
  const py = (sy << FP_SHIFT) >> 6
  const n = fbm(px, py, seed, 5)
  return Math.trunc((n * HEIGHT_SCALE_DM) / FP_ONE)
}

function biomeFor(heightDm: number, moisture: number): BiomeId {
  if (heightDm < WATER_LEVEL_DM) return Biome.APA
  if (heightDm > 1100) return Biome.MUNTE
  if (heightDm > 500) return Biome.DEAL
  if (moisture > 150) return Biome.PADURE
  return Biome.CAMPIE
}

/** Un esantion macro complet. Functie pura de (seed, pozitie). */
export function sampleMacro(seed: number, sx: number, sy: number): MacroSample {
  const heightDm = macroHeightDm(seed, sx, sy)

  // Campuri derivate din alte fluxuri de zgomot, cu seed-uri distincte, ca sa nu
  // fie corelate accidental cu relieful.
  const px = (sx << FP_SHIFT) >> 7
  const py = (sy << FP_SHIFT) >> 7
  const moisture = ((fbm(px, py, (seed ^ 0x4d2) >>> 0, 3) + FP_ONE) * 255) >> (FP_SHIFT + 1)
  const soilNoise = ((fbm(px, py, (seed ^ 0x1b39) >>> 0, 3) + FP_ONE) * 255) >> (FP_SHIFT + 1)

  // Solul e mai bun in vale si mai sarac pe munte — corelatie intentionata.
  const altitudePenalty = heightDm > 0 ? Math.min(200, heightDm >> 3) : 0
  const soil = Math.max(0, Math.min(255, soilNoise - altitudePenalty))

  // Temperatura scade cu altitudinea: ~6,5 °C / 1000 m = 0,65 °C / 100 dm.
  const baseTempC = Math.trunc(12 - (heightDm * 65) / 10000)

  return {
    heightDm,
    biome: biomeFor(heightDm, moisture),
    soil,
    moisture: Math.max(0, Math.min(255, moisture)),
    baseTempC,
  }
}

/** Esantionul macro care acopera o pozitie in milimetri. */
export function macroSampleIndexForMm(mm: number): number {
  const idx = Math.floor(mm / (MACRO_METERS * 1000))
  return Math.max(0, Math.min(MACRO_SIZE - 1, idx))
}
