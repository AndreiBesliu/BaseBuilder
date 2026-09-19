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

/**
 * Cat se intuneca un varf pentru fiecare nivel de ocluzie (0 = cel mai inchis).
 *
 * Sta aici, nu in viewer, fiindca e o decizie de PALETA: ocluzia si culoarea se
 * inmultesc, deci scara asta decide cat de mult din gama unui material se
 * cheltuieste pe umbra. Si, ca tot ce e in `src/render/`, supravietuieste
 * schimbarii de motor.
 *
 * Nu e liniara: saltul de la „deloc ocluzat" la „un vecin" trebuie sa se vada,
 * fiindca ala e cazul cel mai des — o treapta de 1 m langa o suprafata plata.
 */
export const AO_FACTOR: readonly number[] = [0.52, 0.70, 0.86, 1.0]

/**
 * Variatia de teren: cat se schimba culoarea in functie de POZITIA in lume.
 *
 * ## Ce repara
 *
 * Terenul promovat e cuantizat la 1 m, deci pe o panta lina contururile devin
 * terase paralele. Masurat pe fixtura M10: peretii de treapta de exact 1 m sunt
 * **22% din toata aria**, iar cele 4,9% dintre ei care au 8 m sau mai mult duc
 * **31,3%** din aria lor — alea sunt „liniile drepte".
 *
 * Problema nu e ca exista trepte: alea sunt reale, se sapa in ele. Problema e ca
 * sunt IDENTICE — acelasi verde pe fiecare tavan, acelasi maro pe fiecare perete,
 * deci ochiul citeste un tipar repetat in loc de un deal. Variatia rupe repetitia
 * fara sa mute un singur varf.
 *
 * ## De ce din pozitia in LUME, si nu din nimic altceva
 *
 * Trebuie sa fie o functie PURA de (x, y), din trei motive care se leaga:
 *
 * - **continuitate**: doua quaduri care se ating in acelasi punct primesc aceeasi
 *   valoare, deci nu apare nicio cusatura intre ele si nici intre chunk-uri;
 * - **stabilitate**: nu depinde de cum s-a intamplat mesher-ul sa uneasca
 *   dreptunghiurile, deci o sapatura care re-meshuieste vecinii nu schimba culoarea
 *   terenului din jur;
 * - **portabilitate**: e aritmetica intreaga, ca tot ce sta in `src/render/`.
 *
 * Pe Z NU variaza deliberat: un perete de treapta ar capata gradient pe verticala,
 * adica exact tiparul regulat pe care il combatem, doar rotit.
 */
const VAR_PERIOADA = 23
const VAR_AMPLITUDINE = 0.085

/** Zgomot valoric pe o grila, cu interpolare neteda. Determinist, fara stare. */
function hash2(x: number, y: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x2545f491)
  h ^= h >>> 13
  return ((h >>> 0) % 4096) / 4095
}

function neted(t: number): number {
  return t * t * (3 - 2 * t)
}

/**
 * Multiplicatorul de culoare al unui punct din lume. In jurul lui 1.
 *
 * Doua octave: una larga, care face pete de dealuri, si una de trei ori mai fina,
 * la un sfert din amplitudine, care rupe marginile petelor. Fara a doua, petele
 * insele devin un tipar — mai mare, dar tot tipar.
 */
export function variatiaLocului(wx: number, wy: number): number {
  let suma = 0
  let greutate = 0
  for (const [perioada, pondere] of [[VAR_PERIOADA, 1], [VAR_PERIOADA / 3, 0.25]] as const) {
    const fx = wx / perioada
    const fy = wy / perioada
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = neted(fx - x0)
    const ty = neted(fy - y0)
    const a = hash2(x0, y0)
    const b = hash2(x0 + 1, y0)
    const c = hash2(x0, y0 + 1)
    const d = hash2(x0 + 1, y0 + 1)
    const sus = a + (b - a) * tx
    const jos = c + (d - c) * tx
    suma += (sus + (jos - sus) * ty) * pondere
    greutate += pondere
  }
  return 1 + (suma / greutate - 0.5) * 2 * VAR_AMPLITUDINE
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
