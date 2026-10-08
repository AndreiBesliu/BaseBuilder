/**
 * Overlay-ul Temperatură (tasta U; design temperatura v2, §6; t.2b §8; DESIGN §9 regulile 5 și 9): pe NIVELUL ACTIV,
 * fiecare spațiu acoperit — încăpere sau spațiu deschis — tentat după temperatura lui de ACUM (starea simulării,
 * `w.temperatura`, din t.2b), cu valoarea purtată de LUMINOZITATE (închis = rece, deschis = cald; nu roșu→verde), plus o
 * cifră pe fiecare piesă a lui. Separat de Încăperi (I): DESIGN §9.5 le dă câte o tastă, iar hașura e deja a lui I
 * („spațiu acoperit deschis"). NICIO hașură, niciun prag de 5 °C și nicio săgeată aici: pragul vine cu efectul, în t.3
 * (panoul t.2a, L5-5); săgeata ar cere X pentru toate componentele de la nivel (t.2b §8).
 *
 * Partea asta e PURĂ față de DOM (three rulează în node): piesele, ancorele, tenta, alegerea etichetelor de
 * arătat. Stratul DOM al cifrelor e în `etichete-temperatura.ts`.
 *
 * ## Ce se reface și când
 *
 * - **Geometria** (un pătrat pe celulă, culoare pe vârf) și **ancorele** se refac doar când se schimbă nivelul
 *   sau AMPRENTA lui (`amprentaNivel` din overlay-camere.ts: identitatea feliilor de la nivel + tripletul
 *   componentelor de pe bucățile lor) — o săpătură altundeva mută `epoca`, nu și desenul de aici.
 * - **Valorile** se citesc din STARE la fiecare actualizare (un cadru): T-ul fiecărei componente de la nivel, O(1) pe
 *   componentă (0,4–0,6 µs pentru cele 103 de la nivelul hub-ului M10, B6). Nimic nu se rezolvă: nici regimul permanent,
 *   nici graful t.2a.
 * - **Culorile** se rescriu (atributul de culoare, pe loc) doar când s-a SCHIMBAT ceva: o valoare (comparată direct, după
 *   un pas sau o editare), geometria, sau aerul de afară cu o zecime. NU pe o cheie de tick: `floor(tick / tps)` se schimbă
 *   cu un tick ÎNAINTEA pasului (pasul rulează la `tick % tps === 0`, înainte de `tick++`), deci cifrele ar fi rămas cu un
 *   pas în urmă în 92–95% din cadre (panoul t.2b, UI-3). Culoarea se calculează o dată pe componentă, nu pe vârf (B6:
 *   0,14–0,18 ms față de 1,8–2,3 ms pe nivelul hub-ului M10).
 * - O componentă fără T (un invariant încălcat) NU se desenează (alfa 0 pe vârf) și n-are cifră; legenda spune că
 *   temperatura nu se știe, iar alerta vine din monitorul viewer-ului (main.ts). Cu T în stare, o încăpere abia apărută
 *   are valoare din primul cadru (proveniența o dă la sincronizare): mutarea valorilor prin celule a lui t.2a nu mai e
 *   necesară.
 *
 * ## Scara tentei
 *
 * De la cel mai rece la cel mai cald dintre spațiile de la nivel ȘI aerul de afară (`intervalCuAfara`), cel puțin
 * `INTERVAL_MIN_Q16`: tenta spune și „mai rece / mai cald decât afară", nu doar ordinea încăperilor între ele (pe M10,
 * 53 din 53 de niveluri aveau sub 2 °C între încăperi). Prețul: pivnițele dintre ele se deosebesc mai greu, iar culoarea
 * unei încăperi neschimbate se mută cu ziua (afară se mișcă mai mult decât înăuntru). E o decizie de design, cu
 * implicitul ăsta (recenzia t.2a, L4-4).
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
import { tAfara } from '../src/sim/clima.ts'
import { temperaturaAcum } from '../src/sim/temperatura.ts'
import { WORLD_CELLS } from '../src/sim/terrain/terrain.ts'
import { aceeasiAmprenta, amprentaNivel } from './overlay-camere.ts'
import type { AmprentaNivel } from './overlay-camere.ts'
import { TEXT_TEMPERATURA_NECUNOSCUTA, textZecimi } from './ui/texte.ts'

/** Numele grupului în scenă: proba de pe ecran (bench/ui-fum.mjs) îl caută după el. */
export const NUME_GRUP_TEMPERATURA = 'overlay-temperatura'
/** O piesă mai mică primește cifră doar dacă e singura piesă a componentei la nivel. */
export const PIESA_MIN_CELULE = 4
/** Sub atâția pixeli pe celulă, cifrele se ascund și rămâne tenta (panoul, L5-3). */
export const PRAG_PX_CELULA = 10
/** Intervalul tentei e cel puțin atât (Q16 °C): două încăperi la 0,3 °C nu devin „negru și alb". */
export const INTERVAL_MIN_Q16 = 2 * 65536
/** Capetele tentei, în sRGB: fiecare canal crește de la rece la cald, deci și luminozitatea. */
export const CULOARE_RECE: readonly [number, number, number] = [0.1, 0.15, 0.32]
export const CULOARE_CALDA: readonly [number, number, number] = [1, 0.91, 0.72]

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

/** Intervalul tentei la nivel: temperaturile spațiilor [min, max] ȘI aerul de afară (vezi antetul, „Scara tentei"). */
export function intervalCuAfara(min: number, max: number, tAfara: number): { lo: number; hi: number } {
  return intervalTenta(Math.min(min, tAfara), Math.max(max, tAfara))
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
  /** Nivelul desenat; `undefined` = nimic încă (aprinderea forțează o reconstrucție). */
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
  /** T-ul de ACUM al componentelor de la nivel (Q16 °C), citit din stare; lipsește = componenta n-are T. */
  readonly valori: Map<number, number>
  /** Minimul și maximul valorilor de la nivel (legenda). */
  min: number
  max: number
  /** Aerul de afară (Q16 °C) cu care s-a colorat ultima oară: scara și legenda. */
  tAfara: number
  /** Componente de la nivel fără T (un invariant încălcat): nedesenate, fără cifră. */
  faraT: number
  /** Ce spune legenda în locul intervalului; '' = nimic. */
  eroare: string
  readonly material: THREE.MeshBasicMaterial
  /** Contoare: geometrii refăcute, citiri ale stării (una pe actualizare), recolorări (doar la schimbare). */
  reconstructii: number
  citiri: number
  recolorari: number
}

export function createTemperaturaOverlay(): OverlayTemperatura {
  const group = new THREE.Group()
  group.name = NUME_GRUP_TEMPERATURA
  group.visible = false
  group.renderOrder = 6
  // Culoarea pe varf are ALFA (itemSize 4): un patrat fara valoare are alfa 0, iar `alphaTest` il arunca de tot
  // (nici culoare, nici adancime) — nu e un gri care se confunda cu mijlocul rampei (recenzia t.2a, L4-4).
  const material = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.7, alphaTest: 0.01, depthTest: false, side: THREE.DoubleSide })
  return {
    group, visible: false, nivel: undefined, epoca: -1, amprenta: null, ancore: [], comps: [], quadComp: new Int32Array(0), valori: new Map(),
    min: 0, max: 0, tAfara: 0, faraT: 0, eroare: '', material, reconstructii: 0, citiri: 0, recolorari: 0,
  }
}

function goleste(g: THREE.Group): void {
  for (const o of [...g.children]) {
    g.remove(o)
    ;(o as THREE.Mesh).geometry?.dispose()
  }
}

/** Geometria și ancorele nivelului z (sau nimic, la z = null). Valorile se golesc: id-urile sunt ale geometriei noi. */
function reconstruieste(o: OverlayTemperatura, w: World, z: number | null, amprenta: AmprentaNivel | null): void {
  goleste(o.group)
  o.nivel = z
  o.amprenta = amprenta
  o.reconstructii++
  o.ancore = []
  o.comps = []
  o.quadComp = new Int32Array(0)
  o.valori.clear()
  o.faraT = 0
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
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 4), 4))
  const m = new THREE.Mesh(geo, o.material)
  m.renderOrder = 6
  o.group.add(m)
}

/**
 * T-ul componentelor de la nivel, din STARE (`temperaturaAcum`): comparat direct cu ce e desenat. Întoarce true dacă s-a
 * schimbat ceva (o valoare, o componentă rămasă fără T); atunci și minimul, maximul și eroarea legendei.
 */
function citesteValorile(o: OverlayTemperatura, w: World): boolean {
  o.citiri++
  let schimbat = false
  let faraT = 0
  for (const id of o.comps) {
    const t = temperaturaAcum(w, id)
    if (t === null) {
      faraT++
      if (o.valori.delete(id)) schimbat = true
      continue
    }
    if (o.valori.get(id) !== t) {
      o.valori.set(id, t)
      schimbat = true
    }
  }
  if (faraT !== o.faraT) {
    o.faraT = faraT
    schimbat = true
  }
  if (!schimbat) return false
  let min = Infinity
  let max = -Infinity
  for (const t of o.valori.values()) {
    if (t < min) min = t
    if (t > max) max = t
  }
  o.min = Number.isFinite(min) ? min : 0
  o.max = Number.isFinite(max) ? max : 0
  o.eroare = faraT > 0 ? TEXT_TEMPERATURA_NECUNOSCUTA : ''
  return true
}

const c3 = new THREE.Color()

/**
 * Culorile pătratelor din valorile de acum, pe loc (atributul de culoare), fără geometrie nouă: culoarea se calculează O
 * DATĂ pe componentă și se scrie direct pe vârfuri. Scara cuprinde și aerul de afară (`intervalCuAfara`); un pătrat fără
 * valoare are alfa 0 (nu se desenează).
 */
function recoloreaza(o: OverlayTemperatura): void {
  o.recolorari++
  const m = o.group.children[0] as THREE.Mesh | undefined
  if (m === undefined) return
  const atr = m.geometry.getAttribute('color') as THREE.BufferAttribute
  const arr = atr.array as Float32Array
  const { lo, hi } = intervalCuAfara(o.min, o.max, o.tAfara)
  // Culoarea fiecărei componente (liniară; alfa 0 = fără valoare), o dată.
  const culori = new Map<number, readonly [number, number, number, number]>()
  for (const id of o.comps) {
    const t = o.valori.get(id)
    if (t === undefined) {
      culori.set(id, [0, 0, 0, 0])
      continue
    }
    const [r, g, b] = culoareTemperatura(t, lo, hi)
    // Vârfurile sunt în spațiul liniar: culoarea sRGB trece prin THREE.Color, ca la tenta lui I.
    c3.setRGB(r, g, b, THREE.SRGBColorSpace)
    culori.set(id, [c3.r, c3.g, c3.b, 1])
  }
  for (let i = 0; i < o.quadComp.length; i++) {
    const c = culori.get(o.quadComp[i]!)!
    for (let k = 0, j = i * 24; k < 6; k++, j += 4) {
      arr[j] = c[0]
      arr[j + 1] = c[1]
      arr[j + 2] = c[2]
      arr[j + 3] = c[3]
    }
  }
  atr.needsUpdate = true
}

/**
 * Overlay-ul la nivelul `z` (nivelul activ; null = fără nivel: nimic de desenat). Vezi antetul pentru ce se reface și
 * când: geometria la amprentă nouă, valorile din stare la fiecare apel, culorile doar la schimbare.
 */
export function actualizeazaTemperaturaOverlay(o: OverlayTemperatura, w: World, rules: Rules, z: number | null): void {
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
  const citite = citesteValorile(o, w)
  const afara = tAfara(w.seed, w.tick, rules)
  if (geometrie || citite || textZecimi(afara) !== textZecimi(o.tAfara)) {
    o.tAfara = afara
    recoloreaza(o)
  }
}
