/**
 * Mormanele de resurse, pe ecran: plasele din viewer/public/resurse/mormane.glb (generate in Blender
 * de tools/assets/resurse.py), cate un `InstancedMesh` pe plasa — un draw call pe fel si treapta,
 * oricate mormane ar fi.
 *
 * Nu exista in rularile de gate: main.ts nu-l creeaza acolo (o geometrie in plus in bucla masurata ar
 * fi drift de gate). Planul de taiere al slice-ului e global (`renderer.clippingPlanes`), deci mormanele
 * de deasupra nivelului activ se taie ca terenul.
 */

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import type { World } from '../src/sim/state.ts'
import { instanteMormane, liniarInSrgb } from './resurse.ts'

export interface StratResurse {
  readonly group: THREE.Group
  /** `null` pana se incarca fisierul (sau daca nu s-a putut incarca: `eroare`). */
  plase: Map<string, THREE.InstancedMesh> | null
  eroare: string | null
  /** Cate mormane s-au desenat la ultima reconstructie. */
  desenate: number
}

/** Capacitatea initiala pe plasa; creste prin dublare cand o lume are mai multe mormane de acelasi fel. */
const CAPACITATE_INITIALA = 64

export function creeazaStratResurse(scene: THREE.Scene, url: string): StratResurse {
  const group = new THREE.Group()
  scene.add(group)
  const s: StratResurse = { group, plase: null, eroare: null, desenate: 0 }
  // Aceeasi lege de lumina ca terenul si voxelii (MeshLambertMaterial cu culoare pe varf).
  const material = new THREE.MeshLambertMaterial({ vertexColors: true })
  new GLTFLoader().load(url, (gltf) => {
    const plase = new Map<string, THREE.InstancedMesh>()
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const geo = m.geometry
      const col = geo.getAttribute('color') as THREE.BufferAttribute | undefined
      if (col) {
        // Fisierul are culoarea LINIARA (glTF); terenul pune paleta sRGB direct in varfuri. Aceeasi
        // conventie, ca un morman de pamant sa aiba culoarea pamantului pe care sta.
        const a = new Float32Array(col.count * 3)
        for (let i = 0; i < col.count; i++) {
          a[i * 3] = liniarInSrgb(col.getX(i))
          a[i * 3 + 1] = liniarInSrgb(col.getY(i))
          a[i * 3 + 2] = liniarInSrgb(col.getZ(i))
        }
        geo.setAttribute('color', new THREE.BufferAttribute(a, 3))
      }
      const im = new THREE.InstancedMesh(geo, material, CAPACITATE_INITIALA)
      im.count = 0
      im.frustumCulled = false
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      im.name = m.name
      plase.set(m.name, im)
      group.add(im)
    })
    s.plase = plase
  }, undefined, (e) => {
    s.eroare = `mormanele nu s-au incarcat: ${e instanceof Error ? e.message : String(e)}`
    console.warn(s.eroare)
  })
  return s
}

const m4 = new THREE.Matrix4()
const q = new THREE.Quaternion()
const p = new THREE.Vector3()
const unu = new THREE.Vector3(1, 1, 1)
const sus = new THREE.Vector3(0, 1, 0)

/**
 * Reface instantele din lume. O(mormane); se cheama rar (la cateva cadre si dupa comenzi), nu pe cadru.
 * Coordonatele scenei: x = wx, y = cota, z = wy; mormanul sta pe podeaua celulei lui (y = z).
 */
export function actualizeazaStratResurse(s: StratResurse, w: World, stackMax: number): void {
  if (s.plase === null) return
  const inst = instanteMormane(w, stackMax)
  let total = 0
  for (const [nume, im] of s.plase) {
    const l = inst.get(nume) ?? []
    let tinta = im
    if (l.length > im.instanceMatrix.count) {
      // Creste prin dublare: o plasa noua cu capacitate mai mare, aceeasi geometrie si acelasi material.
      let cap = im.instanceMatrix.count
      while (cap < l.length) cap *= 2
      tinta = new THREE.InstancedMesh(im.geometry, im.material, cap)
      tinta.frustumCulled = false
      tinta.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      tinta.name = nume
      s.group.remove(im)
      im.dispose()
      s.group.add(tinta)
      s.plase.set(nume, tinta)
    }
    for (let k = 0; k < l.length; k++) {
      const x = l[k]!
      q.setFromAxisAngle(sus, x.rot)
      p.set(x.wx + 0.5, x.z, x.wy + 0.5)
      m4.compose(p, q, unu)
      tinta.setMatrixAt(k, m4)
    }
    tinta.count = l.length
    tinta.instanceMatrix.needsUpdate = true
    total += l.length
  }
  s.desenate = total
}
