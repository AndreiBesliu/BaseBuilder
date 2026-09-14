/**
 * Spike de aspect — cum ar putea arăta Kinstead la luna 8.
 *
 * NU e jocul. Nu citește starea de simulare, nu atinge mesher-ul, nu intră în
 * nicio măsurătoare de gate. E o machetă de aspect, făcută ca să răspundă la o
 * întrebare pe care argumentele n-o pot închide: **arată bine direcția asta?**
 *
 * Aspectul nu se decide discutând, se decide uitându-te. Iar dacă direcția se
 * dovedește greșită, e mult mai ieftin să afli acum, pe o machetă care se aruncă,
 * decât la luna 8, pe un joc întreg.
 *
 * ## Ce demonstrează, punct cu punct
 *
 * 1. **Clădirile nu stau pe axe.** Fiecare are unghiul ei, iar amprenta nu e un
 *    dreptunghi aliniat la grilă. Asta e ce face Ostriv și Foundation să arate
 *    organic — nu netezimea terenului, ci libertatea de așezare.
 * 2. **Zidurile sunt piese, nu cuburi.** O piatră are dimensiunea, rotația și
 *    nuanța ei. Grila de 1 m poate exista dedesubt fără să se vadă niciun metru.
 * 3. **Terenul e o suprafață, nu o scară.** Aceeași lume, alt strat de prezentare.
 * 4. **Lumina face jumătate din treabă.** Soare cald cu umbre moi, cer rece,
 *    ceață care dă adâncime. Fără ele, orice geometrie arată ca un machetă.
 *
 * Tot ce e aici e geometrie **procedurală** — zero fișiere de model, zero
 * texturi, zero dependențe în plus. Asta nu e o limitare asumată din lene: e
 * exact D16, „low-poly stilizat cu iluminare și atmosferă puternică, NU realist".
 * Dacă direcția asta funcționează fără un artist, funcționează.
 */

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { nextInt, stream } from '../src/sim/rng.ts'
import type { RngState } from '../src/sim/rng.ts'

const SEED = 20260914

// --- paletă -----------------------------------------------------------------
//
// Aceeași disciplină ca în joc: culorile sunt date, nu magie împrăștiată prin cod.

const PALETA = {
  cer: 0xa8c4d4,
  ceata: 0xb9cbd6,
  soare: 0xfff2d8,
  umbra: 0x5a6b7a,
  iarba: [0x6f8449, 0x647940, 0x7b8c52, 0x5e7342],
  pamant: 0x7a6248,
  drum: 0x8f7c61,
  piatra: [0x9a958c, 0x8d887f, 0xa8a49b, 0x827d75],
  lemn: [0x6b5238, 0x7a5f42, 0x5c462f],
  tencuiala: 0xd9cfb8,
  paie: [0xb39a63, 0xa68d58, 0xc0a870],
  frunza: [0x4e6b3a, 0x577440, 0x445f33],
  trunchi: 0x53412c,
}

function alege<T>(rng: RngState, din: readonly T[]): T {
  return din[nextInt(rng, din.length)]!
}

/** Număr real în [min, max), din fluxul întreg. Prezentare, nu simulare. */
function intre(rng: RngState, min: number, max: number): number {
  return min + (nextInt(rng, 10000) / 10000) * (max - min)
}

// --- materiale ---------------------------------------------------------------

const materiale = new Map<number, THREE.MeshLambertMaterial>()
function mat(culoare: number): THREE.MeshLambertMaterial {
  let m = materiale.get(culoare)
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: culoare })
    materiale.set(culoare, m)
  }
  return m
}

// --- teren --------------------------------------------------------------------

/**
 * Terenul, ca suprafață continuă.
 *
 * Aceeași idee ca în joc — o grilă de vârfuri cu înălțimi — dar la rezoluție mai
 * fină și cu normale netede. Ce se vede nu e „grila de 1 m", ci un deal.
 */
function teren(rng: RngState, latura: number, pasi: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(latura, latura, pasi, pasi)
  geo.rotateX(-Math.PI / 2)
  const poz = geo.attributes.position as THREE.BufferAttribute
  const culori = new Float32Array(poz.count * 3)
  const c = new THREE.Color()

  for (let i = 0; i < poz.count; i++) {
    const x = poz.getX(i)
    const z = poz.getZ(i)
    // Trei octave, ca relieful să aibă și formă mare, și denivelări mici.
    const h =
      Math.sin(x * 0.035) * Math.cos(z * 0.028) * 3.2 +
      Math.sin(x * 0.11 + 1.7) * Math.cos(z * 0.09) * 0.9 +
      Math.sin(x * 0.31) * Math.cos(z * 0.27 + 0.4) * 0.22
    poz.setY(i, h)

    // Culoarea variază per vârf: iarba nu e o vopsea, e un amestec.
    c.set(alege(rng, PALETA.iarba))
    const lumina = 0.88 + h * 0.03
    culori[i * 3] = c.r * lumina
    culori[i * 3 + 1] = c.g * lumina
    culori[i * 3 + 2] = c.b * lumina
  }
  geo.setAttribute('color', new THREE.BufferAttribute(culori, 3))
  geo.computeVertexNormals()

  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
  m.receiveShadow = true
  return m
}

/** Înălțimea terenului, aceeași funcție ca la generare. */
function inaltime(x: number, z: number): number {
  return (
    Math.sin(x * 0.035) * Math.cos(z * 0.028) * 3.2 +
    Math.sin(x * 0.11 + 1.7) * Math.cos(z * 0.09) * 0.9 +
    Math.sin(x * 0.31) * Math.cos(z * 0.27 + 0.4) * 0.22
  )
}

// --- piese -------------------------------------------------------------------

/**
 * O piatră de zid.
 *
 * Aici se câștigă sau se pierde tot: o piatră are dimensiunea, rotația și nuanța
 * ei. Zece cuburi identice arată a grilă; zece pietre cu variație arată a zid.
 */
function piatra(rng: RngState, lung: number, inalt: number, gros: number): THREE.Mesh {
  const g = new THREE.BoxGeometry(
    lung * intre(rng, 0.88, 1.0),
    inalt * intre(rng, 0.85, 1.0),
    gros * intre(rng, 0.9, 1.05),
  )
  const m = new THREE.Mesh(g, mat(alege(rng, PALETA.piatra)))
  m.rotation.set(intre(rng, -0.04, 0.04), intre(rng, -0.08, 0.08), intre(rng, -0.03, 0.03))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** Un zid care urmează un traseu oarecare, nu o axă. */
function zid(rng: RngState, traseu: readonly [number, number][], inalt: number): THREE.Group {
  const g = new THREE.Group()
  for (let i = 0; i < traseu.length - 1; i++) {
    const [x1, z1] = traseu[i]!
    const [x2, z2] = traseu[i + 1]!
    const dx = x2 - x1
    const dz = z2 - z1
    const lung = Math.hypot(dx, dz)
    const unghi = Math.atan2(dz, dx)
    const pasi = Math.max(1, Math.round(lung / 0.75))

    for (let s = 0; s < pasi; s++) {
      const t = (s + 0.5) / pasi
      const x = x1 + dx * t
      const z = z1 + dz * t
      const y = inaltime(x, z)
      const randuri = Math.round(inalt / 0.42)
      for (let r = 0; r < randuri; r++) {
        // Rândurile se decalează alternativ, ca într-o zidărie adevărată.
        const decalaj = r % 2 === 0 ? 0 : 0.34
        const p = piatra(rng, 0.78, 0.4, 0.55)
        p.position.set(
          x + Math.cos(unghi) * decalaj * 0.5,
          y + 0.2 + r * 0.4,
          z + Math.sin(unghi) * decalaj * 0.5,
        )
        p.rotation.y += unghi
        g.add(p)
      }
    }
  }
  return g
}

/**
 * O casă: soclu de piatră, etaj de lemn cu tencuială, acoperiș în două ape.
 *
 * Rotită liber. Amprenta nu e aliniată la nimic — asta e întrebarea la care
 * răspunde macheta.
 */
function casa(rng: RngState, x: number, z: number, latime: number, adanc: number, unghi: number): THREE.Group {
  const g = new THREE.Group()
  const y = inaltime(x, z)

  const hSoclu = intre(rng, 1.1, 1.6)
  const hEtaj = intre(rng, 2.2, 2.8)

  // Soclu din pietre individuale, pe tot perimetrul.
  for (const [dx, dz, lung, rot] of [
    [0, -adanc / 2, latime, 0],
    [0, adanc / 2, latime, 0],
    [-latime / 2, 0, adanc, Math.PI / 2],
    [latime / 2, 0, adanc, Math.PI / 2],
  ] as const) {
    const pasi = Math.max(1, Math.round(lung / 0.8))
    for (let s = 0; s < pasi; s++) {
      const t = (s + 0.5) / pasi - 0.5
      const randuri = Math.round(hSoclu / 0.4)
      for (let r = 0; r < randuri; r++) {
        const p = piatra(rng, 0.8, 0.38, 0.5)
        const lx = rot === 0 ? t * lung : dx
        const lz = rot === 0 ? dz : t * lung
        p.position.set(lx, 0.19 + r * 0.38, lz)
        p.rotation.y += rot
        g.add(p)
      }
    }
  }

  // Etajul: tencuială între grinzi de lemn.
  const corp = new THREE.Mesh(new THREE.BoxGeometry(latime * 0.96, hEtaj, adanc * 0.96), mat(PALETA.tencuiala))
  corp.position.y = hSoclu + hEtaj / 2
  corp.castShadow = true
  corp.receiveShadow = true
  g.add(corp)

  // Grinzi verticale, la intervale neregulate.
  let p = -latime / 2 + 0.3
  while (p < latime / 2 - 0.2) {
    for (const zz of [-adanc / 2 + 0.02, adanc / 2 - 0.02]) {
      const grinda = new THREE.Mesh(new THREE.BoxGeometry(0.16, hEtaj, 0.12), mat(alege(rng, PALETA.lemn)))
      grinda.position.set(p, hSoclu + hEtaj / 2, zz)
      grinda.castShadow = true
      g.add(grinda)
    }
    p += intre(rng, 0.7, 1.3)
  }

  // Acoperiș în două ape, din „șindrile" care se suprapun.
  const hAcop = intre(rng, 1.6, 2.2)
  const streasina = 0.45
  const panta = Math.atan2(hAcop, adanc / 2 + streasina)
  for (const semn of [-1, 1] as const) {
    const lungPanta = Math.hypot(hAcop, adanc / 2 + streasina)
    const randuri = Math.round(lungPanta / 0.38)
    for (let r = 0; r < randuri; r++) {
      const t = (r + 0.5) / randuri
      const sindrila = new THREE.Mesh(
        new THREE.BoxGeometry(latime + streasina * 2, 0.1, 0.44),
        mat(alege(rng, PALETA.paie)),
      )
      sindrila.position.set(
        0,
        hSoclu + hEtaj + hAcop * (1 - t),
        semn * (adanc / 2 + streasina) * t,
      )
      sindrila.rotation.x = -semn * (Math.PI / 2 - panta)
      sindrila.castShadow = true
      sindrila.receiveShadow = true
      g.add(sindrila)
    }
  }

  g.position.set(x, y, z)
  g.rotation.y = unghi
  return g
}

/** Un copac low-poly: trunchi plus două-trei conuri de frunziș. */
function copac(rng: RngState, x: number, z: number): THREE.Group {
  const g = new THREE.Group()
  const h = intre(rng, 3.4, 6.2)
  const trunchi = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h * 0.55, 5), mat(PALETA.trunchi))
  trunchi.position.y = h * 0.275
  trunchi.castShadow = true
  g.add(trunchi)

  const nivele = 2 + nextInt(rng, 2)
  for (let i = 0; i < nivele; i++) {
    const t = i / nivele
    const con = new THREE.Mesh(
      new THREE.ConeGeometry(intre(rng, 1.3, 2.0) * (1 - t * 0.35), h * 0.42, 6),
      mat(alege(rng, PALETA.frunza)),
    )
    con.position.y = h * (0.5 + t * 0.26)
    con.rotation.y = intre(rng, 0, Math.PI)
    con.castShadow = true
    g.add(con)
  }
  g.position.set(x, inaltime(x, z), z)
  g.rotation.y = intre(rng, 0, Math.PI * 2)
  return g
}

/** Un bolovan. Aceeași idee ca la piatra de zid: variație, nu repetiție. */
function bolovan(rng: RngState, x: number, z: number): THREE.Mesh {
  const r = intre(rng, 0.3, 1.1)
  const g = new THREE.IcosahedronGeometry(r, 0)
  const poz = g.attributes.position as THREE.BufferAttribute
  for (let i = 0; i < poz.count; i++) {
    poz.setXYZ(
      i,
      poz.getX(i) * intre(rng, 0.7, 1.3),
      poz.getY(i) * intre(rng, 0.5, 0.9),
      poz.getZ(i) * intre(rng, 0.7, 1.3),
    )
  }
  g.computeVertexNormals()
  const m = new THREE.Mesh(g, mat(alege(rng, PALETA.piatra)))
  m.position.set(x, inaltime(x, z) + r * 0.3, z)
  m.rotation.set(intre(rng, 0, 3), intre(rng, 0, 3), intre(rng, 0, 3))
  m.castShadow = true
  m.receiveShadow = true
  return m
}

// --- scena --------------------------------------------------------------------

export function construiesteSpike(): THREE.Group {
  const rng = stream(SEED, 'worldgen')
  const scena = new THREE.Group()

  scena.add(teren(rng, 140, 180))

  // Patru case, fiecare cu unghiul ei. Niciuna aliniată la ceva.
  const case_: readonly [number, number, number, number, number][] = [
    [-8, -6, 7.5, 5.5, 0.37],
    [6, -12, 6.0, 5.0, -0.82],
    [12, 3, 8.5, 6.0, 1.94],
    [-14, 9, 5.5, 4.5, 2.61],
  ]
  for (const [x, z, w, d, a] of case_) scena.add(casa(rng, x, z, w, d, a))

  // Un zid de incintă care ȘERPUIEȘTE. Dacă ar fi drept, ar arăta tot a grilă.
  const traseu: [number, number][] = []
  for (let i = 0; i <= 26; i++) {
    const t = i / 26
    const unghi = -0.6 + t * 3.4
    const raza = 24 + Math.sin(t * 7.1) * 3.4
    traseu.push([Math.cos(unghi) * raza, Math.sin(unghi) * raza])
  }
  scena.add(zid(rng, traseu, 2.1))

  for (let i = 0; i < 46; i++) {
    const a = intre(rng, 0, Math.PI * 2)
    const r = intre(rng, 30, 66)
    scena.add(copac(rng, Math.cos(a) * r, Math.sin(a) * r))
  }
  for (let i = 0; i < 60; i++) {
    scena.add(bolovan(rng, intre(rng, -62, 62), intre(rng, -62, 62)))
  }

  return scena
}

// --- pornire ------------------------------------------------------------------

const scene = new THREE.Scene()
scene.background = new THREE.Color(PALETA.cer)
scene.fog = new THREE.Fog(PALETA.ceata, 55, 165)

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.3, 600)
camera.position.set(34, 20, 38)

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
document.body.appendChild(renderer.domElement)

// Lumina face jumătate din treabă, si e cea mai ieftina jumatate.
scene.add(new THREE.HemisphereLight(PALETA.cer, PALETA.umbra, 1.15))
const soare = new THREE.DirectionalLight(PALETA.soare, 2.0)
soare.position.set(38, 46, 18)
soare.castShadow = true
soare.shadow.mapSize.set(2048, 2048)
soare.shadow.camera.left = -70
soare.shadow.camera.right = 70
soare.shadow.camera.top = 70
soare.shadow.camera.bottom = -70
soare.shadow.camera.far = 160
soare.shadow.bias = -0.0008
scene.add(soare)

scene.add(construiesteSpike())

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.maxPolarAngle = Math.PI * 0.48
controls.target.set(0, 2, 0)
controls.update()

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
})

const hud = document.getElementById('hud')
function tick(): void {
  requestAnimationFrame(tick)
  controls.update()
  renderer.render(scene, camera)
}
requestAnimationFrame(tick)

if (hud) {
  hud.textContent =
    `${renderer.info.render.calls} draw calls · ${renderer.info.render.triangles.toLocaleString('ro-RO')} triunghiuri`
}
