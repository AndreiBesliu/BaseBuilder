/**
 * O singura paleta pentru toata lumea.
 *
 * Pana acum erau DOUA, fara nicio relatie intre ele: `BIOME_COLOR` in heightfield
 * si `MATERIAL_COLOR` in viewer. CAMPIE era [0,45 0,52 0,30], IARBA era
 * [0,36 0,44 0,25]. La cusatura K16 sarea culoarea, sarea modelul de iluminare SI
 * sarea geometria — trei discontinuitati unde e nevoie de una singura.
 *
 * A doua treaba a modulului: culoarea unui quad depinde de DIRECTIA fetei, nu doar
 * de material. Masurat pe fixtura M10 (`node tools/mesh-composition.mjs`):
 *
 *   114.586 quaduri, din care 64.462 (56,3%) sunt pereti laterali de EXACT 1 m
 *   — adica exact peretii treptelor — si 39.483 dintre ei (34,5% din TOT) sunt IARBA.
 *
 * Treptele nu se vad pentru ca sunt trepte. Se vad pentru ca peretele treptei si
 * fata ei de sus erau acelasi verde. Iarba e un strat subtire deasupra: lateral,
 * un bloc de iarba e pamant. Cu asta, o treime din geometria vizibila se separa
 * perceptual fara sa se mute un singur varf.
 *
 * Modulul e pur si nu importa nimic de motor — ca tot ce sta in `src/render/`.
 */

import { Material } from '../sim/terrain/chunk.ts'
import type { MaterialId } from '../sim/terrain/chunk.ts'
import { Biome } from '../sim/terrain/macro.ts'
import type { BiomeId } from '../sim/terrain/macro.ts'
import { Face } from './mesher.ts'

export type Rgb = readonly [number, number, number]

function rgb(hex: number): Rgb {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]
}

/** Culoarea de baza a fiecarui material. Sursa unica. */
export const MATERIAL_COLOR: Record<number, Rgb> = {
  [Material.ROCA]: rgb(0x6b6a66),
  [Material.PAMANT]: rgb(0x6a5a45),
  [Material.IARBA]: rgb(0x5c7040),
  [Material.APA]: rgb(0x35566f),
  [Material.LEMN_CONSTRUIT]: rgb(0x8a6a42),
  [Material.PIATRA_CONSTRUITA]: rgb(0x8d8b84),
  // Mai deschis si mai rece decat roca: molozul trebuie sa se citeasca de la
  // distanta ca „aici s-a intamplat ceva", nu ca inca un perete.
  [Material.MOLOZ]: rgb(0x9a958c),
}

const IMPLICIT: Rgb = rgb(0x999999)

/**
 * Culoarea unui quad: material PLUS directia fetei.
 *
 * Singura regula speciala e iarba, si e cea care conteaza: lateral, un bloc de
 * iarba arata a pamant. Restul materialelor sunt omogene si nu au nevoie de asta.
 */
export function quadColor(material: number, face: number): Rgb {
  if (material === Material.IARBA && face !== Face.Z_POS) {
    return MATERIAL_COLOR[Material.PAMANT]!
  }
  return MATERIAL_COLOR[material] ?? IMPLICIT
}

/**
 * Culoarea terenului ne-promovat, derivata din ACELEASI materiale.
 *
 * Un chunk ne-promovat e suprafata privita de sus, deci primeste culoarea de sus
 * a materialului care l-ar acoperi daca ar fi promovat. Asta e ce face cusatura
 * sa fie doar geometrica: de-o parte si de alta a ei, aceeasi culoare.
 */
export function biomeColor(biome: BiomeId): Rgb {
  switch (biome) {
    case Biome.APA:
      return MATERIAL_COLOR[Material.APA]!
    case Biome.MUNTE:
      return MATERIAL_COLOR[Material.ROCA]!
    case Biome.DEAL:
      return MATERIAL_COLOR[Material.PAMANT]!
    case Biome.PADURE:
      // Padurea e iarba mai inchisa: acelasi material, mai putina lumina reflectata.
      return scale(MATERIAL_COLOR[Material.IARBA]!, 0.78)
    default:
      return MATERIAL_COLOR[Material.IARBA]!
  }
}

export function scale(c: Rgb, k: number): Rgb {
  return [c[0] * k, c[1] * k, c[2] * k]
}

/** Materialul cu care se acopera un biom. Folosit de generarea suprafetei si de paleta. */
export function biomeMaterial(biome: BiomeId): MaterialId {
  switch (biome) {
    case Biome.APA:
      return Material.APA
    case Biome.MUNTE:
      return Material.ROCA
    case Biome.DEAL:
      return Material.PAMANT
    default:
      return Material.IARBA
  }
}
