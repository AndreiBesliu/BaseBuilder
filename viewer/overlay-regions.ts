/**
 * Overlay de regiuni si de reachability.
 *
 * Exista din exact motivul pe care research-ul il numeste drept capcana:
 *
 *   „Adminul vizual al simularii ca punct orb. Sistemele astea — regiuni,
 *    rezervari, job selection — sunt INVIZIBILE: typecheck verde, teste verzi,
 *    joc rupt. Semnalul: nu ai un debug overlay pentru regiuni. Construieste
 *    overlay-urile in aceeasi zi cu sistemele, nu dupa."
 *
 * Si nu e teorie. Sistemul de regiuni a scos la iveala, in ziua in care a fost
 * scris, un defect pe care nicio suita de teste nu-l putea prinde: promovarea
 * schimba materialul a 25% din celulele de suprafata. L-a gasit pentru ca a pus
 * o intrebare noua, nu pentru ca cineva se uita. Overlay-ul e ca sa se poata si
 * UITA cineva la urmatorul.
 *
 * Ce arata:
 *   - fiecare celula pe care se poate sta, colorata dupa COMPONENTA ei conexa
 *   - doua zone cu aceeasi culoare sunt, dupa graf, mutual accesibile
 *   - doua culori diferite inseamna ca NU exista drum intre ele
 *
 * Deci un zid care inchide o camera se vede instantaneu ca o pata de alta
 * culoare, si nu trebuie sa ai incredere in nimic ca sa verifici.
 */

import * as THREE from 'three'
import type { Rules } from '../src/sim/content.ts'
import {
  BLOCK_CELLS,
  ensureArea,
  find,
  NO_REGION,
  REGION_SIZE,
} from '../src/sim/regions.ts'
import type { RegionStore } from '../src/sim/regions.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'

/** Cate blocuri in jurul privirii se deseneaza. Overlay-ul e unealta, nu joc. */
const OVERLAY_RADIUS_BLOCKS = 3
/** Cate niveluri sub sol se acopera, pentru camerele sapate. */
const OVERLAY_DEPTH_BELOW = 6
/** Cat de sus fata de podea sta patratul, ca sa nu se bata cu terenul pe z. */
const LIFT = 0.06

/**
 * Culoarea unei componente.
 *
 * Se deriva dintr-un hash al id-ului, nu dintr-o paleta cu N intrari: numarul de
 * componente nu e cunoscut dinainte si se schimba la fiecare sapatura. Saturatia
 * si luminozitatea raman fixe ca doua componente vecine sa se distinga si cand
 * nimeresc nuante apropiate.
 */
function componentColor(root: number, out: THREE.Color): THREE.Color {
  let h = (root * 2654435761) >>> 0
  h ^= h >>> 15
  const hue = (h % 3600) / 3600
  return out.setHSL(hue, 0.72, 0.55)
}

export interface RegionOverlay {
  readonly group: THREE.Group
  visible: boolean
  /** Cate celule s-au desenat la ultima reconstructie. Intra in HUD. */
  cells: number
  /** Cate componente distincte s-au vazut. Cifra care conteaza pentru joc. */
  components: number
}

export function createRegionOverlay(): RegionOverlay {
  const group = new THREE.Group()
  group.visible = false
  return { group, visible: false, cells: 0, components: 0 }
}

/**
 * Reconstruieste overlay-ul in jurul unei celule.
 *
 * Se cheama doar cand e vizibil si cand ceva s-a schimbat — desenarea nu are voie
 * sa fie in calea de masurare a gate-ului. Geometria e UNA singura, cu culoare per
 * varf: 5.000 de patrate ar fi 5.000 de draw calls, adica exact proba negativa A
 * din bench/GATE.md, pornita din greseala.
 */
export function rebuildRegionOverlay(
  overlay: RegionOverlay,
  t: Terrain,
  s: RegionStore,
  wx: number,
  wy: number,
  z: number,
  rules: Rules,
): void {
  for (const child of [...overlay.group.children]) {
    overlay.group.remove(child)
    const mesh = child as THREE.Mesh
    mesh.geometry.dispose()
  }
  overlay.cells = 0
  overlay.components = 0
  if (!overlay.visible) return

  // Adancimea sub sol prinde si camerele sapate — altfel overlay-ul ar arata
  // doar suprafata si ar rata exact cazul in care reachability-ul conteaza.
  ensureArea(t, s, wx, wy, z, OVERLAY_RADIUS_BLOCKS, rules, OVERLAY_DEPTH_BELOW)

  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const color = new THREE.Color()
  const componente = new Set<number>()

  for (const key of s.keys) {
    const cells = s.cells.get(key)
    if (!cells) continue
    const zBloc = (key % 1024) - 512
    const flat = Math.floor(key / 1024)
    const worldBlocks = 16384 / REGION_SIZE
    const bx = flat % worldBlocks
    const by = Math.floor(flat / worldBlocks)

    // Numai vecinatatea privirii: overlay-ul peste tot discul rezident ar fi
    // sute de mii de patrate si ar masca exact ce vrei sa vezi.
    if (Math.abs(bx * REGION_SIZE - wx) > (OVERLAY_RADIUS_BLOCKS + 1) * REGION_SIZE) continue
    if (Math.abs(by * REGION_SIZE - wy) > (OVERLAY_RADIUS_BLOCKS + 1) * REGION_SIZE) continue

    for (let i = 0; i < BLOCK_CELLS; i++) {
      const r = cells[i]!
      if (r === NO_REGION) continue
      const root = find(s, r)
      componente.add(root)
      componentColor(root, color)

      const cx = bx * REGION_SIZE + (i % REGION_SIZE)
      const cy = by * REGION_SIZE + Math.floor(i / REGION_SIZE)
      const y = zBloc + LIFT
      const base = positions.length / 3

      // Patratul acopera celula, usor retras ca sa se vada grila intre celule.
      const m = 0.08
      positions.push(cx + m, y, cy + m, cx + 1 - m, y, cy + m, cx + 1 - m, y, cy + 1 - m, cx + m, y, cy + 1 - m)
      for (let v = 0; v < 4; v++) colors.push(color.r, color.g, color.b)
      indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
      overlay.cells++
    }
  }

  overlay.components = componente.size
  if (positions.length === 0) return

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
  geo.setIndex(indices)
  const mat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
  overlay.group.add(new THREE.Mesh(geo, mat))
}
