/**
 * Overlay-ul de stabilitate (tasta S) — S20-23, taietura 1.
 *
 * DESIGN §5.2 cere vizualizatorul „in aceeasi sarcina cu regula", si spune de ce:
 * la Foxy Voxel absenta lui a fost reclamata ani intregi — sistemul arata doar un
 * mesaj de eroare la esec.
 *
 * ## Doua lucruri pe care panoul le-a masurat, si care schimba ce se deseneaza
 *
 * **Cifra nu e a celulei active.** Prima versiune a designului desena suportul
 * voxelului de pe nivelul activ. Masurat pe o baza realista: **0%** dintre
 * voxelii nivelului activ au alta cifra decat 4 — in roca netulburata fiecare are
 * solid dedesubt. Cifrele care conteaza sunt pe TAVAN, adica pe nivelul de
 * deasupra, pe care slice view-ul il taie. Vizualizatorul s-ar fi livrat aratand
 * nimic. Aici se deseneaza `suportDacaSap`: ce ar avea tavanul DACA sapi celula.
 *
 * **Culoarea e ACTIUNE, nu masura.** Overlay-ul de joburi, livrat tot ca raspuns
 * la K13, nu arata cifre — arata stari cu verbul in ele. O masura fara verb („1",
 * portocaliu) nu spune nici cat mai poti sapa, nici unde sa lasi roca. Si DESIGN
 * §9 regula 9 interzice explicit gradientul rosu→verde ca singur canal.
 *
 * Trei stari, si atat: **SIGUR** · **ULTIMA CELULA** (lasa roca aici sau pune
 * stalp) · **CADE**. Plus conturul a ce s-a prabusit, cu celula care a declansat
 * marcata — fara legatura „am sapat AICI → a cazut ACOLO", regula ramane
 * nelizibila oricat de simpla ar fi propozitia care o descrie.
 */

import * as THREE from 'three'
import type { World } from '../src/sim/state.ts'
import { DEFAULT_RULES } from '../src/sim/content.ts'
import { decodeCell } from '../src/sim/path.ts'
import { Sol, solLa, StareSapat, stareSapat } from '../src/sim/stabilitate.ts'
import { prabusireaPrevizualizata } from '../src/sim/joburi.ts'

export interface StabilityOverlay {
  readonly group: THREE.Group
  visible: boolean
  /** Cate celule de pe nivelul activ sunt in fiecare stare. Pentru HUD. */
  sigur: number
  ultima: number
  cade: number
  /** Cati voxeli ar cadea daca s-ar sapa TOATE desemnarile vii. */
  previzualizate: number
}

export function createStabilityOverlay(): StabilityOverlay {
  const group = new THREE.Group()
  group.visible = false
  return { group, visible: false, sigur: 0, ultima: 0, cade: 0, previzualizate: 0 }
}

function goleste(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child)
    const m = child as THREE.Mesh | THREE.LineSegments
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
  }
}

// Luminozitatea poarta valoarea, nuanta poarta ACTIUNEA. Vezi DESIGN §9 regula 9.
const CULOARE: Record<number, number> = {
  [StareSapat.ULTIMA_CELULA]: 0xe0c060,
  [StareSapat.CADE]: 0xd05040,
}
const CULOARE_PREVIZ = 0xff8030

/**
 * Se deseneaza doar ce e ACTIONABIL: „sigur" ramane nedesenat.
 *
 * Daca s-ar desena si el, in roca netulburata ecranul ar fi acoperit uniform, iar
 * cele cateva celule care conteaza ar disparea in el — aceeasi greseala ca
 * desenarea cifrei pe nivelul activ, cu alta fata.
 */
export function rebuildStabilityOverlay(o: StabilityOverlay, w: World, zActiv: number, cx: number, cy: number, raza: number): void {
  goleste(o.group)
  o.sigur = 0
  o.ultima = 0
  o.cade = 0
  if (!o.visible) return

  const rules = DEFAULT_RULES
  const pozitii: number[] = []
  const culori: number[] = []

  for (let wx = cx - raza; wx <= cx + raza; wx++) {
    for (let wy = cy - raza; wy <= cy + raza; wy++) {
      if (solLa(w.terrain, wx, wy, zActiv) !== Sol.SOLID) continue
      const stare = stareSapat(w.terrain, rules, wx, wy, zActiv)
      if (stare === StareSapat.SIGUR) { o.sigur++; continue }
      if (stare === StareSapat.NIMIC) continue
      if (stare === StareSapat.ULTIMA_CELULA) o.ultima++
      else o.cade++
      patrat(pozitii, culori, wx, wy, zActiv + 1.02, CULOARE[stare]!)
    }
  }

  // Si ce s-ar prabusi daca s-ar sapa tot ce a cerut jucatorul. Se calculeaza pe
  // MULTIMEA desemnarilor, nu pe fiecare in parte: o pivnita de 7x7 e 49 de
  // comenzi, si niciuna dintre ele, luata singura, nu doboara nimic.
  const previz = prabusireaPrevizualizata(w, rules)
  o.previzualizate = previz.length
  for (const cheie of previz) {
    const c = decodeCell(cheie)
    if (Math.abs(c.wx - cx) > raza || Math.abs(c.wy - cy) > raza) continue
    patrat(pozitii, culori, c.wx, c.wy, c.z + 0.02, CULOARE_PREVIZ)
  }

  if (pozitii.length === 0) return
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pozitii), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(culori), 3))
  o.group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false })))
}

/** Conturul unei celule, ca patru segmente. Coordonatele viewerului sunt (x, z, y). */
function patrat(pozitii: number[], culori: number[], wx: number, wy: number, z: number, hex: number): void {
  const r = ((hex >> 16) & 255) / 255
  const g = ((hex >> 8) & 255) / 255
  const b = (hex & 255) / 255
  const colturi: readonly (readonly [number, number])[] = [[0.08, 0.08], [0.92, 0.08], [0.92, 0.92], [0.08, 0.92]]
  for (let i = 0; i < 4; i++) {
    const a = colturi[i]!
    const c = colturi[(i + 1) % 4]!
    pozitii.push(wx + a[0], z, wy + a[1], wx + c[0], z, wy + c[1])
    culori.push(r, g, b, r, g, b)
  }
}
