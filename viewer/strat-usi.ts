/**
 * Usile zidite, pe ecran: cate un `InstancedMesh` pe orientare (panou in perete pe x, pe y, chepeng),
 * doar TRANSLATATE — fara rotatie, normala unei lovituri e deja in lume (verificatorul JUC-4: pe un
 * panou rotit, `face.normal` ramane in spatiul geometriei si clicul nimerea celula de alaturi).
 *
 * Se reface cand se schimba terenul (`editari`), nu pe cadru, si doar pe chunk-urile din jurnal
 * (`actualizeazaUsiPeChunk`, recenzia pe ecran, ECR-11). Planul de taiere al slice-ului e global
 * (`renderer.clippingPlanes`), deci usile de deasupra nivelului activ se taie ca zidurile.
 */

import * as THREE from 'three'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { MATERIAL_COLOR } from '../src/render/palette.ts'
import type { Impact } from './tinta.ts'
import { actualizeazaUsiPeChunk, GROSIME_USA, impactPeUsa, ORIENTARI, toateUsile, usiPeChunkNoi } from './usi.ts'
import type { Orientare, UsaDesenata, UsiPeChunk } from './usi.ts'

export interface StratUsi {
  readonly group: THREE.Group
  readonly plase: Record<Orientare, THREE.InstancedMesh>
  /** Instanta → usa, pe orientare. */
  readonly celule: Record<Orientare, UsaDesenata[]>
  /** Usile pe chunk, la zi din jurnalul terenului. */
  readonly usi: UsiPeChunk
  /** Cate usi (celule) s-au desenat la ultima reconstructie. */
  desenate: number
  /** Cate chunk-uri a scanat ultima reconstructie. */
  scanate: number
}

const CAPACITATE_INITIALA = 32

function geometrie(o: Orientare): THREE.BufferGeometry {
  const g = GROSIME_USA
  // Panourile verticale au inaltimea celulei: doua usi suprapuse (golul de 2 m) se citesc ca o usa.
  const geo = o === 'subtireY' ? new THREE.BoxGeometry(0.98, 1, g) : o === 'subtireX' ? new THREE.BoxGeometry(g, 1, 0.98) : new THREE.BoxGeometry(0.98, g, 0.98)
  const c = MATERIAL_COLOR[Material.USA]!
  const n = geo.getAttribute('position').count
  const culori = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    culori[i * 3] = c[0]
    culori[i * 3 + 1] = c[1]
    culori[i * 3 + 2] = c[2]
  }
  geo.setAttribute('color', new THREE.BufferAttribute(culori, 3))
  return geo
}

export function creeazaStratUsi(scene: THREE.Scene): StratUsi {
  const group = new THREE.Group()
  scene.add(group)
  // Aceeasi lege de lumina ca terenul (culoare pe varf, paleta sRGB direct).
  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  const plase = {} as Record<Orientare, THREE.InstancedMesh>
  const celule = {} as Record<Orientare, UsaDesenata[]>
  for (const o of ORIENTARI) {
    const im = new THREE.InstancedMesh(geometrie(o), material, CAPACITATE_INITIALA)
    im.count = 0
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    im.name = `usi-${o}`
    im.userData.orientare = o
    group.add(im)
    plase[o] = im
    celule[o] = []
  }
  return { group, plase, celule, usi: usiPeChunkNoi(), desenate: 0, scanate: 0 }
}

const m4 = new THREE.Matrix4()

/** Reface panourile, daca terenul s-a schimbat de la ultima data. */
export function actualizeazaStratUsi(s: StratUsi, t: Terrain): void {
  const scanate = actualizeazaUsiPeChunk(s.usi, t)
  if (scanate === null) return
  s.scanate = scanate
  const usi = toateUsile(s.usi)
  for (const o of ORIENTARI) s.celule[o] = []
  for (const u of usi) s.celule[u.o].push(u)
  for (const o of ORIENTARI) {
    const l = s.celule[o]
    let im = s.plase[o]
    if (l.length > im.instanceMatrix.count) {
      let cap = im.instanceMatrix.count
      while (cap < l.length) cap *= 2
      const nou = new THREE.InstancedMesh(im.geometry, im.material, cap)
      nou.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      nou.name = im.name
      nou.userData.orientare = o
      s.group.remove(im)
      im.dispose()
      s.group.add(nou)
      s.plase[o] = nou
      im = nou
    }
    for (let k = 0; k < l.length; k++) {
      const u = l[k]!
      // Scena: x = wx, y = cota, z = wy. Chepengul sta la fata de sus a celulei (in planul placii).
      const y = o === 'orizontala' ? u.z + 1 - GROSIME_USA / 2 : u.z + 0.5
      m4.makeTranslation(u.x + 0.5, y, u.y + 0.5)
      im.setMatrixAt(k, m4)
    }
    im.count = l.length
    im.instanceMatrix.needsUpdate = true
    // Sfera de incadrare la ZI: altfel o usa adaugata dupa primul raycast e ratata (JUC-4, verificatorul).
    im.computeBoundingSphere()
  }
  s.desenate = usi.length
}

/** Mesh-urile de intersectat (raycast-ul clicului, ocluzia pionilor). */
export function plaseUsi(s: StratUsi): THREE.Object3D[] {
  return ORIENTARI.map((o) => s.plase[o]).filter((m) => m.count > 0)
}

/** Impacturile pe usi ale razei, traduse pentru `alegeTinta` (vezi `impactPeUsa`). */
export function impacturiUsi(s: StratUsi, raycaster: THREE.Raycaster): Impact[] {
  const out: Impact[] = []
  const d = raycaster.ray.direction
  for (const h of raycaster.intersectObjects(plaseUsi(s), false)) {
    const o = h.object.userData.orientare as Orientare | undefined
    if (o === undefined || h.instanceId === undefined) continue
    const u = s.celule[o][h.instanceId]
    if (!u) continue
    out.push(impactPeUsa(h.distance, { x: h.point.x, y: h.point.y, z: h.point.z }, u, { x: d.x, y: d.y, z: d.z }))
  }
  return out
}
