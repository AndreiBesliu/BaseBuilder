/**
 * Usile, in viewer — partea PURA (fara THREE), ca sa se testeze in node: unde pune unealta Usa o usa,
 * cum se orienteaza panoul unei usi zidite, si cum devine o lovitura in panou un impact pe care
 * `viewer/tinta.ts` il intelege.
 *
 * Mesher-ul nu deseneaza usa ca bloc (`seDeseneazaCaBloc`): e un panou subtire, desenat de
 * `strat-usi.ts`. Panoul nu e in mesh-urile terenului, deci raycast-ul nu-l vedea: 0 din 500 de clicuri
 * pe panou ajungeau la usa (panoul pe design, JUC-4) — Sapa si Inspecteaza nimereau pragul, stalpul sau
 * podeaua din spate. `impactPeUsa` traduce lovitura intr-un impact pe FATA celulei usii dinspre camera,
 * cu normala axiala si punctul strans in celula: tinta ramane regula ei.
 */

import type { Rules } from '../src/sim/content.ts'
import { celuleUsii } from '../src/sim/camere-explica.ts'
import type { Celula, LumeGol } from '../src/sim/camere-explica.ts'
import { Desemnare, desemnareLaCelula } from '../src/sim/desemnari.ts'
import type { World } from '../src/sim/state.ts'
import { CHUNK_CELLS, ePodea, isSolid, Material, VOXEL_LEVELS } from '../src/sim/terrain/chunk.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { materialAt } from '../src/sim/terrain/terrain.ts'
import type { Impact, V3 } from './tinta.ts'

/**
 * Lumea PLANULUI pentru unealta Usa: terenul plus piesele desemnate. Un jucator isi deseneaza de obicei
 * toata casa, cu golul usii, inainte sa se zideasca ceva — pe terenul gol, golul n-ar fi un gol. O usa
 * (zidita sau desemnata) conteaza ca aer: un al doilea clic pe un gol pe jumatate desemnat il completeaza.
 */
export function lumePlan(w: World, rules: Rules): LumeGol {
  const mat = (x: number, y: number, z: number): number => {
    const m = materialAt(w.terrain, x, y, z)
    return m.ok ? m.value : Material.ROCA
  }
  const piesa = (x: number, y: number, z: number): number | null => {
    const s = desemnareLaCelula(w.desemnari, x, y, z)
    if (s === -1 || w.desemnari.kind[s] !== Desemnare.CONSTRUIESTE) return null
    return rules.piese[w.desemnari.piesa[s]!]!.material
  }
  return {
    aer: (x, y, z) => {
      const m = mat(x, y, z)
      if (m !== Material.AER && m !== Material.USA) return false
      const p = piesa(x, y, z)
      return p === null || p === Material.USA
    },
    podea: (x, y, z) => {
      if (ePodea(mat(x, y, z))) return true
      const p = piesa(x, y, z)
      return p !== null && ePodea(p)
    },
  }
}

/** Celulele unei usi pentru un clic pe (x, y, z), in lumea planului; null = nu e un gol de usa acolo. */
export function celuleUsiiPlan(w: World, rules: Rules, x: number, y: number, z: number): readonly Celula[] | null {
  return celuleUsii(lumePlan(w, rules), x, y, z)
}

export const MESAJ_FARA_GOL = 'O ușă se pune într-un gol de perete (lat de 1–2 m, înalt de 1–3 m) sau într-o gaură de podea.'

/**
 * Cum sta panoul unei usi zidite:
 *  - `subtireY`: panou in planul wy = const (zidul merge pe x; se trece pe y);
 *  - `subtireX`: panou in planul wx = const;
 *  - `orizontala`: chepeng, la fata de sus a celulei (gaura unei placi).
 */
export type Orientare = 'subtireX' | 'subtireY' | 'orizontala'

export const ORIENTARI: readonly Orientare[] = ['subtireX', 'subtireY', 'orizontala']

export function orientareUsa(t: Terrain, x: number, y: number, z: number): Orientare {
  const m = (a: number, b: number, c: number): number => {
    const r = materialAt(t, a, b, c)
    return r.ok ? r.value : Material.ROCA
  }
  const vertical = m(x, y, z + 1) === Material.USA || m(x, y, z - 1) === Material.USA
  if (!vertical && m(x, y, z + 1) === Material.AER) {
    // Chepeng: macar doua vecine laterale sunt placa (plin cu aer deasupra), nu zid.
    let placa = 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (isSolid(m(x + dx, y + dy, z)) && m(x + dx, y + dy, z + 1) === Material.AER) placa++
    }
    if (placa >= 2) return 'orizontala'
  }
  if (isSolid(m(x - 1, y, z)) && isSolid(m(x + 1, y, z))) return 'subtireY'
  if (isSolid(m(x, y - 1, z)) && isSolid(m(x, y + 1, z))) return 'subtireX'
  return 'subtireY'
}

export interface UsaDesenata extends Celula {
  readonly o: Orientare
}

/** Usile zidite din chunk-urile promovate (numai acolo exista voxeli zidite), cu orientarea lor. */
export function usiDinTeren(t: Terrain): UsaDesenata[] {
  const out: UsaDesenata[] = []
  for (const k of t.keys) {
    const ch = t.chunks.get(k)!
    const v = ch.voxels
    if (!v) continue
    for (let col = 0; col < CHUNK_CELLS * CHUNK_CELLS; col++) {
      let z = 0
      const end = v.columnStart[col + 1]!
      for (let run = v.columnStart[col]!; run < end && z < VOXEL_LEVELS; run++) {
        const len = v.runLength[run]!
        if (v.runMaterial[run] === Material.USA) {
          const x = ch.cx * CHUNK_CELLS + (col % CHUNK_CELLS)
          const y = ch.cy * CHUNK_CELLS + ((col / CHUNK_CELLS) | 0)
          for (let i = 0; i < len; i++) {
            const zz = v.zBaseM + z + i
            out.push({ x, y, z: zz, o: orientareUsa(t, x, y, zz) })
          }
        }
        z += len
      }
    }
  }
  return out
}

/** Grosimea panoului desenat (m). */
export const GROSIME_USA = 0.16

const strange = (v: number, lo: number): number => Math.min(lo + 0.98, Math.max(lo + 0.02, v))

/**
 * Impactul pe care `viewer/tinta.ts` il primeste pentru o lovitura in panoul usii `u`: pe fata celulei
 * usii dinspre raza, cu normala axiala, punctul strans in celula. `celulaLangaFata(i, -1)` e atunci
 * celula usii (sapa, inspecteaza, retrage), `celulaLangaFata(i, +1)` aerul din fata ei (piesa).
 * Coordonatele scenei: x = wx, y = cota, z = wy.
 */
export function impactPeUsa(t: number, punct: V3, u: Celula & { o: Orientare }, directie: V3): Impact {
  const px = strange(punct.x, u.x)
  const py = strange(punct.y, u.z)
  const pz = strange(punct.z, u.y)
  if (u.o === 'subtireY') {
    const spre = directie.z > 0 ? -1 : 1
    return { t, p: { x: px, y: py, z: spre < 0 ? u.y : u.y + 1 }, n: { x: 0, y: 0, z: spre } }
  }
  if (u.o === 'subtireX') {
    const spre = directie.x > 0 ? -1 : 1
    return { t, p: { x: spre < 0 ? u.x : u.x + 1, y: py, z: pz }, n: { x: spre, y: 0, z: 0 } }
  }
  const spre = directie.y > 0 ? -1 : 1
  return { t, p: { x: px, y: spre < 0 ? u.z : u.z + 1, z: pz }, n: { x: 0, y: spre, z: 0 } }
}
