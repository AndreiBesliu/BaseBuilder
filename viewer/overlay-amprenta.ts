/**
 * Overlay pentru D20: clădirea așezată liber, și celulele pe care le ocupă.
 *
 * D20 e o decizie **vizuală**, iar din PLAN.md ea iese ca un tabel de cifre.
 * Cifrele spun că o hală de 12×7 m blochează de 1,24–1,33× aria ei reală și că un
 * zid subțire costă între 1,13 și 2,38 celule pe metru. Sunt adevărate și sunt
 * inutile pentru cine trebuie să răspundă la „asta voiai?". Diferența dintre
 * conturul desenat și celulele blocate **se vede sau nu se vede**, și numai
 * owner-ul poate spune care.
 *
 * Deci aici se desenează amândouă, suprapuse:
 *   - conturul alb = dreptunghiul rotit ADEVĂRAT, ce s-ar desena în joc
 *   - pătratele = celulele pe care le vede SIMULAREA
 *
 * Verde unde celula e sub clădire oricum. **Chihlimbar unde amprenta e mai grasă
 * decât clădirea** — adică exact celulele pe care nu poți păși deși pe ecran e loc.
 * Aia e taxa, și ea e întrebarea.
 *
 * Roșu e regula CENTRU, arătată doar ca să se vadă capcana: pare mult mai fidelă
 * conturului, și **curge**. Un zid de 0,2 m așezat pe o graniță de celulă nu
 * blochează nimic sub regula aia — arată ca un zid, nu oprește pe nimeni.
 */

import * as THREE from 'three'
import { Acoperire, amprenta, atingeCelula, centruInauntru, DIR_ONE } from '../src/sim/amprenta.ts'
import type { Poza } from '../src/sim/amprenta.ts'
import { MM_PER_CELL } from '../src/sim/state.ts'

/** Cât de sus față de podea stau pătratele, ca să nu se bată cu terenul pe z. */
const LIFT = 0.08

/** Formele de probă. Aceleași ca în măsurătoarea din PLAN.md, ca să se lege. */
export const FORME = [
  { nume: 'hala 12 x 7 m', halfW: 6000, halfH: 3500 },
  { nume: 'coliba 4 x 3 m', halfW: 2000, halfH: 1500 },
  { nume: 'zid 0,2 x 8 m', halfW: 100, halfH: 4000 },
] as const

export interface AmprentaOverlay {
  readonly group: THREE.Group
  visible: boolean
  /** Indexul formei curente din `FORME`. */
  forma: number
  /** Orientarea, în grade întregi. Se convertește în vector Q14 la desenare. */
  grade: number
  /** Se ancorează axa subțire pe centrul celulei? Vezi consecința de design din D20. */
  ancorat: boolean
  /** Ultimele cifre, pentru HUD. */
  celule: number
  celuleCentru: number
  grasime: number
}

export function createAmprentaOverlay(): AmprentaOverlay {
  const group = new THREE.Group()
  group.visible = false
  return { group, visible: false, forma: 0, grade: 0, ancorat: true, celule: 0, celuleCentru: 0, grasime: 0 }
}

function goleste(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child)
    const m = child as THREE.Mesh | THREE.LineSegments
    m.geometry.dispose()
  }
}

/**
 * Vectorul de orientare din grade.
 *
 * Trigonometria stă AICI, în prezentare, și niciodată în simulare: `Math.cos` nu e
 * garantat bit-exact între motoare JS. Ce trece granița spre `sim/` sunt doi
 * întregi — exact cum ar face-o și interfața de construcție a jocului.
 */
function dir(grade: number): { dirX: number; dirY: number } {
  const r = (grade * Math.PI) / 180
  return { dirX: Math.round(Math.cos(r) * DIR_ONE), dirY: Math.round(Math.sin(r) * DIR_ONE) }
}

const VERDE = new THREE.Color(0x5b8f4e)
const CHIHLIMBAR = new THREE.Color(0xd9a441)
const ROSU = new THREE.Color(0xb1553f)

/** Reconstruiește overlay-ul cu clădirea centrată pe celula (wx, wy), la cota z. */
export function rebuildAmprentaOverlay(o: AmprentaOverlay, wx: number, wy: number, z: number): void {
  goleste(o.group)
  o.celule = 0
  o.celuleCentru = 0
  o.grasime = 0
  if (!o.visible) return

  const forma = FORME[o.forma]!
  const d = dir(o.grade)
  // Ancorarea: axa subțire cade pe CENTRUL celulei, nu pe graniță. Din măsurătoare,
  // asta înjumătățește amprenta unui zid subțire — 20 de celule devin 10.
  const offset = o.ancorat ? MM_PER_CELL / 2 : 0
  const p: Poza = {
    x: wx * MM_PER_CELL + offset,
    y: wy * MM_PER_CELL + offset,
    halfW: forma.halfW,
    halfH: forma.halfH,
    ...d,
  }

  const celule = amprenta(p, Acoperire.ORICE)
  o.celule = celule.length / 2
  o.celuleCentru = amprenta(p, Acoperire.CENTRU).length / 2
  const ariaReala = (2 * p.halfW * 2 * p.halfH) / (MM_PER_CELL * MM_PER_CELL)
  o.grasime = ariaReala > 0 ? o.celule / ariaReala : 0

  // --- pătratele ---
  const positions: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const m = 0.04 // o margine, ca să se vadă grila dintre celule
  for (let i = 0; i < celule.length; i += 2) {
    const cx = celule[i]!
    const cy = celule[i + 1]!
    // Celula e „grasă" dacă e blocată deși centrul ei NU e sub clădire.
    const subCladire = centruInauntru(p, cx, cy)
    const c = subCladire ? VERDE : CHIHLIMBAR
    const base = positions.length / 3
    const y = z + LIFT
    positions.push(cx + m, y, cy + m, cx + 1 - m, y, cy + m, cx + 1 - m, y, cy + 1 - m, cx + m, y, cy + 1 - m)
    for (let v = 0; v < 4; v++) colors.push(c.r, c.g, c.b)
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2)
  }
  if (positions.length > 0) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
    geo.setIndex(indices)
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.55 })
    o.group.add(new THREE.Mesh(geo, mat))
  }

  // --- conturul adevărat al clădirii ---
  // Cele patru colțuri, în metri, din aceeași aritmetică pe care o face simularea.
  const ux = p.dirX / DIR_ONE
  const uy = p.dirY / DIR_ONE
  const hw = p.halfW / MM_PER_CELL
  const hh = p.halfH / MM_PER_CELL
  const cx0 = p.x / MM_PER_CELL
  const cy0 = p.y / MM_PER_CELL
  const colt = (sw: number, sh: number): [number, number] => [
    cx0 + ux * hw * sw - uy * hh * sh,
    cy0 + uy * hw * sw + ux * hh * sh,
  ]
  const c4 = [colt(1, 1), colt(1, -1), colt(-1, -1), colt(-1, 1)]
  const lin: number[] = []
  for (let i = 0; i < 4; i++) {
    const a = c4[i]!
    const b = c4[(i + 1) % 4]!
    lin.push(a[0], z + LIFT + 0.02, a[1], b[0], z + LIFT + 0.02, b[1])
  }
  const geoL = new THREE.BufferGeometry()
  geoL.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lin), 3))
  o.group.add(new THREE.LineSegments(geoL, new THREE.LineBasicMaterial({ color: 0xf2efe6 })))

  // --- conturul a ce ar bloca regula CENTRU, ca să se vadă unde curge ---
  const linC: number[] = []
  const cutieRaza = Math.ceil((Math.abs(p.halfW) + Math.abs(p.halfH)) / MM_PER_CELL) + 2
  const bx = Math.floor(p.x / MM_PER_CELL)
  const by = Math.floor(p.y / MM_PER_CELL)
  for (let cy = by - cutieRaza; cy <= by + cutieRaza; cy++) {
    for (let cx = bx - cutieRaza; cx <= bx + cutieRaza; cx++) {
      if (!centruInauntru(p, cx, cy)) continue
      // Marginile pe care regula CENTRU le lasă deschise: vecinul e atins de
      // clădire, dar centrul lui nu e înăuntru, deci CENTRU nu-l blochează.
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (centruInauntru(p, cx + dx, cy + dy)) continue
        if (!atingeCelula(p, cx + dx, cy + dy)) continue
        const y = z + LIFT + 0.04
        const x0 = cx + (dx > 0 ? 1 : 0)
        const y0 = cy + (dy > 0 ? 1 : 0)
        if (dx !== 0) linC.push(x0, y, cy, x0, y, cy + 1)
        else linC.push(cx, y, y0, cx + 1, y, y0)
      }
    }
  }
  if (linC.length > 0) {
    const geoC = new THREE.BufferGeometry()
    geoC.setAttribute('position', new THREE.BufferAttribute(new Float32Array(linC), 3))
    o.group.add(new THREE.LineSegments(geoC, new THREE.LineBasicMaterial({ color: ROSU })))
  }
}
