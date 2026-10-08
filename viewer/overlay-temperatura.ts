/**
 * Overlay-ul Temperatură (tasta U; design temperatura v2, §6; DESIGN §9 regulile 5 și 9): pe NIVELUL ACTIV,
 * fiecare spațiu acoperit — încăpere sau spațiu deschis — tentat după temperatura lui de ECHILIBRU (regimul
 * permanent, src/sim/termic.ts), cu valoarea purtată de LUMINOZITATE (închis = rece, deschis = cald; nu
 * roșu→verde), plus o cifră pe fiecare piesă a lui. Separat de Încăperi (I): DESIGN §9.5 le dă câte o tastă, iar
 * hașura e deja a lui I („spațiu acoperit deschis"). NICIO hașură și niciun prag de 5 °C aici: pragul vine cu
 * efectul, în t.3 (panoul, L5-5).
 *
 * Partea asta e PURĂ față de DOM (three rulează în node): piesele, ancorele, tenta, alegerea etichetelor de
 * arătat. Stratul DOM al cifrelor e în `etichete-temperatura.ts`.
 *
 * ## Ce se reface și când
 *
 * - **Geometria** (un pătrat pe celulă, culoare pe vârf) și **ancorele** se refac doar când se schimbă nivelul
 *   sau AMPRENTA lui (`amprentaNivel` din overlay-camere.ts: identitatea feliilor de la nivel + tripletul
 *   componentelor de pe bucățile lor) — o săpătură altundeva mută `epoca`, nu și desenul de aici.
 * - **Valorile** vin din `regimPermanent`, cel mult o dată pe secundă (§6), și numai dacă lumea s-a schimbat
 *   (tick, `epoca`, `epocaFete`): în pauză, niciun calcul. La un nivel nou sau la aprindere, imediat — e o
 *   acțiune a jucătorului. Culorile se rescriu pe loc (atributul de culoare), fără geometrie nouă.
 * - Între două regimuri, o geometrie nouă (o încăpere care tocmai a apărut) se colorează cu valorile vechi;
 *   ce n-are încă valoare primește gri și nicio cifră, cel mult o secundă.
 *
 * ## Unde stă cifra (panoul, L5-3)
 *
 * O etichetă pe fiecare PIESĂ 4-conexă a componentei la nivel, cu cel puțin `PIESA_MIN_CELULE` celule (o piesă
 * unică o primește oricât de mică ar fi), în celula piesei cea mai apropiată de centrul ei — deci în piesă, prin
 * construcție. Centrul de greutate al componentei cădea în ALTĂ încăpere sau în rocă pe 49 de perechi
 * (componentă, nivel) pe M10 — toate pe hub-ul cu mai multe piese pe nivel — și pe 41 din 72 pe mina de
 * 192×192×3 (banda nivelului e curbă). O etichetă pe fiecare felie 16×16 a unei componente mari ar fi pus până
 * la 37 de cifre identice pe un nivel al minei.
 */

import * as THREE from 'three'
import type { Rules } from '../src/sim/content.ts'
import type { World } from '../src/sim/state.ts'
import { celuleLaNivel } from '../src/sim/camere.ts'
import type { IndexCamere } from '../src/sim/camere.ts'
import { regimPermanent, temperaturaComponentei } from '../src/sim/termic.ts'
import { WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { aceeasiAmprenta, amprentaNivel } from './overlay-camere.ts'
import type { AmprentaNivel } from './overlay-camere.ts'
import { textGeneric } from './ui/texte.ts'

/** Numele grupului în scenă: proba de pe ecran (bench/ui-fum.mjs) îl caută după el. */
export const NUME_GRUP_TEMPERATURA = 'overlay-temperatura'
/** Cel mult atât de des (ms, ceasul viewer-ului) se recalculează regimul permanent (§6). */
export const PERIOADA_REGIM_MS = 1000
/** O piesă mai mică primește cifră doar dacă e singura piesă a componentei la nivel. */
export const PIESA_MIN_CELULE = 4
/** Sub atâția pixeli pe celulă, cifrele se ascund și rămâne tenta (panoul, L5-3). */
export const PRAG_PX_CELULA = 10
/** Intervalul tentei e cel puțin atât (Q16 °C): două încăperi la 0,3 °C nu devin „negru și alb". */
export const INTERVAL_MIN_Q16 = 2 * 65536
/** Capetele tentei, în sRGB: fiecare canal crește de la rece la cald, deci și luminozitatea. */
export const CULOARE_RECE: readonly [number, number, number] = [0.1, 0.15, 0.32]
export const CULOARE_CALDA: readonly [number, number, number] = [1, 0.91, 0.72]
/** O componentă fără valoare încă (geometrie nouă între două regimuri): gri, fără cifră. */
const CULOARE_NECUNOSCUTA: readonly [number, number, number] = [0.5, 0.5, 0.5]

// ---------------------------------------------------------------------------------------------
// piesele și ancorele
// ---------------------------------------------------------------------------------------------

/** O piesă 4-conexă a unei componente la un nivel: celulele ca `y * WORLD_CELLS + x`. */
export interface PiesaNivel {
  readonly comp: number
  readonly celule: readonly number[]
}

/** Piesele 4-conexe ale fiecărei componente la nivelul z, în ordinea primei lor celule (y, apoi x). */
export function pieseLaNivel(idx: IndexCamere, z: number): PiesaNivel[] {
  const compLa = new Map<number, number>()
  celuleLaNivel(idx, z, (x, y, c) => { compLa.set(y * WORLD_CELLS + x, c.id) })
  const chei = [...compLa.keys()].sort((a, b) => a - b)
  const vazut = new Set<number>()
  const out: PiesaNivel[] = []
  for (const k0 of chei) {
    if (vazut.has(k0)) continue
    const comp = compLa.get(k0)!
    const b = [k0]
    vazut.add(k0)
    for (let i = 0; i < b.length; i++) {
      const k = b[i]!
      const x = k % WORLD_CELLS
      const vecini = [x + 1 < WORLD_CELLS ? k + 1 : -1, x > 0 ? k - 1 : -1, k + WORLD_CELLS, k - WORLD_CELLS]
      for (const kk of vecini) {
        if (kk < 0 || vazut.has(kk) || compLa.get(kk) !== comp) continue
        vazut.add(kk)
        b.push(kk)
      }
    }
    out.push({ comp, celule: b })
  }
  return out
}

/**
 * Celula piesei cea mai apropiată de centrul ei; la egalitate, cea cu cheia mai mică. Pe întregi: coordonatele
 * relative la colțul piesei, înmulțite cu n, deci comparația e exactă (|n·dx| ≤ 2^23 pe orice piesă reală).
 */
export function ancoraPiesei(celule: readonly number[]): { x: number; y: number } {
  let x0 = Infinity
  let y0 = Infinity
  for (const k of celule) {
    const x = k % WORLD_CELLS
    const y = (k - x) / WORLD_CELLS
    if (x < x0) x0 = x
    if (y < y0) y0 = y
  }
  let su = 0
  let sv = 0
  for (const k of celule) {
    const x = k % WORLD_CELLS
    su += x - x0
    sv += (k - x) / WORLD_CELLS - y0
  }
  const n = celule.length
  let best = -1
  let bd = Infinity
  for (const k of celule) {
    const x = k % WORLD_CELLS
    const du = n * (x - x0) - su
    const dv = n * ((k - x) / WORLD_CELLS - y0) - sv
    const d = du * du + dv * dv
    if (d < bd || (d === bd && k < best)) {
      bd = d
      best = k
    }
  }
  const bx = best % WORLD_CELLS
  return { x: bx, y: (best - bx) / WORLD_CELLS }
}

/** Unde stă o cifră: celula ancorei, componenta ei și mărimea piesei (prioritatea la suprapuneri). */
export interface AncoraEticheta {
  readonly comp: number
  readonly x: number
  readonly y: number
  readonly celule: number
}

/** O etichetă pe fiecare piesă cu ≥ `PIESA_MIN_CELULE` celule; piesa UNICĂ a unei componente o primește oricum. */
export function ancoreLaNivel(idx: IndexCamere, z: number): AncoraEticheta[] {
  const piese = pieseLaNivel(idx, z)
  const nr = new Map<number, number>()
  for (const p of piese) nr.set(p.comp, (nr.get(p.comp) ?? 0) + 1)
  const out: AncoraEticheta[] = []
  for (const p of piese) {
    if (p.celule.length < PIESA_MIN_CELULE && nr.get(p.comp)! > 1) continue
    const a = ancoraPiesei(p.celule)
    out.push({ comp: p.comp, x: a.x, y: a.y, celule: p.celule.length })
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// ce cifre se văd
// ---------------------------------------------------------------------------------------------

/** O etichetă proiectată pe ecran (px CSS). */
export interface ProiectieEticheta {
  /** Centrul. */
  readonly x: number
  readonly y: number
  /** Cât ocupă pe ecran o celulă la ancoră (latura cea mai lungă). */
  readonly pxCelula: number
  /** În fața camerei, în fereastră și cu o valoare de arătat. */
  readonly inCadru: boolean
  readonly latime: number
  readonly inaltime: number
  /** Celulele piesei: la o suprapunere rămâne piesa mai mare. */
  readonly prioritate: number
}

/**
 * Ce etichete se văd. Sub `prag` pixeli pe celulă, niciuna (rămâne tenta): „−12,4°" are ~43 px, iar sub ~10 px
 * pe celulă cifrele de pe M10 se calcă (panoul, L5-3: 48 de suprapuneri la 8 px). Peste prag, un filtru lacom,
 * piesele mari întâi: două cifre nu se acoperă niciodată.
 */
export function alegeEtichete(p: readonly ProiectieEticheta[], prag = PRAG_PX_CELULA): boolean[] {
  const out = new Array<boolean>(p.length).fill(false)
  const ordine = [...p.keys()].filter((i) => p[i]!.inCadru && p[i]!.pxCelula >= prag).sort((a, b) => p[b]!.prioritate - p[a]!.prioritate || a - b)
  const alese: number[] = []
  for (const i of ordine) {
    const a = p[i]!
    let liber = true
    for (const j of alese) {
      const b = p[j]!
      if (Math.abs(a.x - b.x) * 2 < a.latime + b.latime && Math.abs(a.y - b.y) * 2 < a.inaltime + b.inaltime) {
        liber = false
        break
      }
    }
    if (liber) {
      alese.push(i)
      out[i] = true
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// tenta
// ---------------------------------------------------------------------------------------------

/** Intervalul tentei pentru temperaturile [min, max] de la nivel: cel puțin `INTERVAL_MIN_Q16`, centrat. */
export function intervalTenta(min: number, max: number): { lo: number; hi: number } {
  if (max - min >= INTERVAL_MIN_Q16) return { lo: min, hi: max }
  const mij = (min + max) / 2
  return { lo: mij - INTERVAL_MIN_Q16 / 2, hi: mij + INTERVAL_MIN_Q16 / 2 }
}

/** Culoarea (sRGB, 0..1) unei temperaturi în intervalul [lo, hi]: de la `CULOARE_RECE` la `CULOARE_CALDA`. */
export function culoareTemperatura(t: number, lo: number, hi: number): [number, number, number] {
  const f = hi > lo ? Math.min(1, Math.max(0, (t - lo) / (hi - lo))) : 0.5
  return [0, 1, 2].map((i) => CULOARE_RECE[i]! + f * (CULOARE_CALDA[i]! - CULOARE_RECE[i]!)) as [number, number, number]
}

// ---------------------------------------------------------------------------------------------
// overlay-ul
// ---------------------------------------------------------------------------------------------

export interface OverlayTemperatura {
  readonly group: THREE.Group
  visible: boolean
  /** Nivelul desenat; `undefined` = nimic încă (aprinderea forțează o reconstrucție și un regim). */
  nivel: number | null | undefined
  /** Epoca indexului la ultima verificare a amprentei. */
  epoca: number
  amprenta: AmprentaNivel | null
  /** Etichetele nivelului (refăcute doar la amprentă nouă): tabloul nou e semnalul pentru stratul DOM. */
  ancore: readonly AncoraEticheta[]
  /** Componentele de la nivel (id-uri, crescător). */
  comps: readonly number[]
  /** Componenta fiecărui pătrat al tentei, în ordinea vârfurilor: recolorarea fără geometrie nouă. */
  quadComp: Int32Array
  /** Echilibrul componentelor de la nivel (Q16 °C), din ultimul regim. */
  readonly valori: Map<number, number>
  /** Minimul și maximul valorilor de la nivel (legenda); afară, la tickul regimului. */
  min: number
  max: number
  tAfara: number
  /** Ultimul regim: când (ms) și pe ce lume (`tick|epoca|epocaFete`); '' = niciunul încă. */
  regimLa: number
  regimCheie: string
  /** Refuzul grafului, în cuvinte; '' = nimic. */
  eroare: string
  readonly material: THREE.MeshBasicMaterial
  /** Contoare: geometrii refăcute, regimuri calculate. */
  reconstructii: number
  regimuri: number
}

export function createTemperaturaOverlay(): OverlayTemperatura {
  const group = new THREE.Group()
  group.name = NUME_GRUP_TEMPERATURA
  group.visible = false
  group.renderOrder = 6
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, depthTest: false, side: THREE.DoubleSide })
  return {
    group, visible: false, nivel: undefined, epoca: -1, amprenta: null, ancore: [], comps: [], quadComp: new Int32Array(0), valori: new Map(),
    min: 0, max: 0, tAfara: 0, regimLa: Number.NEGATIVE_INFINITY, regimCheie: '', eroare: '', material, reconstructii: 0, regimuri: 0,
  }
}

function goleste(g: THREE.Group): void {
  for (const o of [...g.children]) {
    g.remove(o)
    ;(o as THREE.Mesh).geometry?.dispose()
  }
}

/** Geometria și ancorele nivelului z (sau nimic, la z = null). */
function reconstruieste(o: OverlayTemperatura, w: World, z: number | null, amprenta: AmprentaNivel | null): void {
  goleste(o.group)
  o.nivel = z
  o.amprenta = amprenta
  o.reconstructii++
  o.ancore = []
  o.comps = []
  o.quadComp = new Int32Array(0)
  if (z === null) return
  const pos: number[] = []
  const comp: number[] = []
  const y0 = z + 0.03
  celuleLaNivel(w.camere, z, (x, y, c) => {
    const a = x + 0.06, b = x + 0.94, p = y + 0.06, q = y + 0.94
    pos.push(a, y0, p, b, y0, p, b, y0, q, a, y0, p, b, y0, q, a, y0, q)
    comp.push(c.id)
  })
  o.quadComp = Int32Array.from(comp)
  o.comps = [...new Set(comp)].sort((a, b) => a - b)
  o.ancore = ancoreLaNivel(w.camere, z)
  if (pos.length === 0) return
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pos.length), 3))
  const m = new THREE.Mesh(geo, o.material)
  m.renderOrder = 6
  o.group.add(m)
}

const c3 = new THREE.Color()

/** Culorile pătratelor din valorile de acum, pe loc (atributul de culoare), fără geometrie nouă. */
function recoloreaza(o: OverlayTemperatura): void {
  const m = o.group.children[0] as THREE.Mesh | undefined
  if (m === undefined) return
  const atr = m.geometry.getAttribute('color') as THREE.BufferAttribute
  const arr = atr.array as Float32Array
  const { lo, hi } = intervalTenta(o.min, o.max)
  for (let i = 0; i < o.quadComp.length; i++) {
    const t = o.valori.get(o.quadComp[i]!)
    const [r, g, b] = t === undefined ? CULOARE_NECUNOSCUTA : culoareTemperatura(t, lo, hi)
    // Vârfurile sunt în spațiul liniar: culoarea sRGB trece prin THREE.Color, ca la tenta lui I.
    c3.setRGB(r, g, b, THREE.SRGBColorSpace)
    for (let k = 0; k < 6; k++) arr.set([c3.r, c3.g, c3.b], (i * 6 + k) * 3)
  }
  atr.needsUpdate = true
}

/** Regimul permanent la tickul lumii: valorile componentelor de la nivel, intervalul, culorile. */
function calculeazaRegim(o: OverlayTemperatura, w: World, rules: Rules, acumMs: number, cheie: string): void {
  o.regimLa = acumMs
  o.regimCheie = cheie
  o.regimuri++
  o.valori.clear()
  const r = regimPermanent(w, rules, w.tick)
  if (!r.ok) {
    o.eroare = `Temperatura nu se poate calcula: ${textGeneric(r.reason).titlu}`
  } else {
    o.eroare = ''
    o.tAfara = r.value.tAfaraQ16
    for (const id of o.comps) {
      const t = temperaturaComponentei(r.value, id)
      if (t !== null) o.valori.set(id, t)
    }
  }
  let min = Infinity
  let max = -Infinity
  for (const t of o.valori.values()) {
    if (t < min) min = t
    if (t > max) max = t
  }
  o.min = Number.isFinite(min) ? min : 0
  o.max = Number.isFinite(max) ? max : 0
  recoloreaza(o)
}

/**
 * Overlay-ul la nivelul `z` (nivelul activ; null = fără nivel: nimic de desenat), la `acumMs` (ceasul viewer-ului,
 * injectat ca testele să-l aleagă). Vezi antetul pentru ce se reface și când. `rules`: MEREU același obiect —
 * identitatea lui e în ștampila grafului termic, iar un obiect nou l-ar reface la fiecare apel.
 */
export function actualizeazaTemperaturaOverlay(o: OverlayTemperatura, w: World, rules: Rules, z: number | null, acumMs: number): void {
  if (!o.visible) return
  const nivelNou = o.nivel !== z
  let amprenta: AmprentaNivel | null = null
  let geometrie = nivelNou
  if (!nivelNou && z !== null && o.epoca !== w.camere.epoca) {
    amprenta = amprentaNivel(w.camere, z)
    geometrie = o.amprenta === null || !aceeasiAmprenta(o.amprenta, amprenta)
  }
  o.epoca = w.camere.epoca
  if (geometrie) reconstruieste(o, w, z, z === null ? null : (amprenta ?? amprentaNivel(w.camere, z)))
  if (z === null) return
  const cheie = `${w.tick}|${w.camere.epoca}|${w.camere.epocaFete}`
  if (nivelNou || o.regimCheie === '' || (acumMs - o.regimLa >= PERIOADA_REGIM_MS && cheie !== o.regimCheie)) calculeazaRegim(o, w, rules, acumMs, cheie)
  else if (geometrie) recoloreaza(o)
}
