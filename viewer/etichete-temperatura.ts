/**
 * Cifrele overlay-ului Temperatură (U), ca etichete DOM ancorate în scenă (design temperatura v2, §6; panoul,
 * L5-3). Infrastructură nouă: viewer-ul nu desenează text în scena 3D (nici CanvasTexture, nici sprite-uri), iar
 * cifre coapte în geometrie s-ar fi refăcut la fiecare valoare nouă.
 *
 * - Un `<span>` pe ancoră (overlay-temperatura.ts: o piesă 4-conexă a componentei la nivel). Span-urile se
 *   creează sau se scot doar când se schimbă ANCORELE (tabloul nou al overlay-ului = amprentă nouă a nivelului).
 * - Textul se rescrie doar când se schimbă valoarea afișată (`text` din ui/dom.ts).
 * - Pe cadru: proiecția fiecărei ancore (`Vector3.project`; 157–192 de ancore costă 2–13 µs, panoul, L5-3), cât
 *   ocupă o celulă acolo, iar `alegeEtichete` ascunde cifrele sub ~10 px pe celulă și pe cele care s-ar călca.
 *   Poziția se scrie doar când se schimbă pixelul.
 * - `pointer-events: none`: stratul nu prinde niciun clic (ținta clicului e pe canvas, `elementFromPoint`).
 */

import * as THREE from 'three'
import { alegeEtichete } from './overlay-temperatura.ts'
import type { AncoraEticheta, OverlayTemperatura, ProiectieEticheta } from './overlay-temperatura.ts'
import { ascuns, text } from './ui/dom.ts'
import { textEticheta } from './ui/texte.ts'

/** Înălțimea unei etichete (px CSS) și lățimea, din numărul de caractere: pentru filtrul de suprapuneri. */
const INALTIME = 16
const latime = (s: string): number => 7 * s.length + 8

export interface StratEtichete {
  readonly radacina: HTMLDivElement
  readonly spanuri: HTMLSpanElement[]
  /** Ancorele pentru care s-au făcut span-urile (identitatea tabloului din overlay). */
  ancore: readonly AncoraEticheta[] | null
  /** Câte etichete se văd acum (Diagnosticul, proba de pe ecran). */
  vizibile: number
}

export function creeazaStratEtichete(parinte: HTMLElement): StratEtichete {
  const r = document.createElement('div')
  r.className = 'etichete-temperatura'
  // Sub panourile UI-ului (z-index 14–20), peste canvas.
  r.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:10;overflow:hidden'
  r.hidden = true
  parinte.append(r)
  return { radacina: r, spanuri: [], ancore: null, vizibile: 0 }
}

const v = new THREE.Vector3()
const POZITIE = new WeakMap<HTMLElement, string>()

function pePixel(camera: THREE.Camera, x: number, y: number, z: number, lat: number, inalt: number): { x: number; y: number; fata: boolean } {
  v.set(x, y, z).project(camera)
  return { x: ((v.x + 1) / 2) * lat, y: ((1 - v.y) / 2) * inalt, fata: v.z > -1 && v.z < 1 }
}

/** Pe cadru, după `controls.update()`: span-urile, textele, pozițiile și ce se vede. */
export function actualizeazaEtichete(s: StratEtichete, o: OverlayTemperatura, camera: THREE.Camera, lat: number, inalt: number): void {
  const z = o.nivel
  const pornit = o.visible && z !== null && z !== undefined
  ascuns(s.radacina, !pornit)
  if (!pornit) {
    s.vizibile = 0
    return
  }
  if (s.ancore !== o.ancore) {
    while (s.spanuri.length < o.ancore.length) {
      const e = document.createElement('span')
      e.className = 'eticheta-temperatura'
      e.style.cssText = 'position:absolute;left:0;top:0;padding:0 4px;border-radius:3px;background:rgba(14,15,17,.72);color:#f3efe6;'
        + 'font:600 11px/16px system-ui,sans-serif;font-variant-numeric:tabular-nums;white-space:nowrap;will-change:transform'
      s.radacina.append(e)
      s.spanuri.push(e)
    }
    while (s.spanuri.length > o.ancore.length) s.spanuri.pop()!.remove()
    s.ancore = o.ancore
  }
  const y = z + 0.05
  const p: ProiectieEticheta[] = []
  const texte: string[] = []
  for (const a of o.ancore) {
    const t = o.valori.get(a.comp)
    const txt = t === undefined ? '' : textEticheta(t)
    texte.push(txt)
    const c = pePixel(camera, a.x + 0.5, y, a.y + 0.5, lat, inalt)
    const ex = pePixel(camera, a.x + 1.5, y, a.y + 0.5, lat, inalt)
    const ey = pePixel(camera, a.x + 0.5, y, a.y + 1.5, lat, inalt)
    const px = Math.max(Math.hypot(ex.x - c.x, ex.y - c.y), Math.hypot(ey.x - c.x, ey.y - c.y))
    const inCadru = c.fata && txt !== '' && c.x >= 0 && c.x <= lat && c.y >= 0 && c.y <= inalt
    p.push({ x: c.x, y: c.y, pxCelula: px, inCadru, latime: latime(txt), inaltime: INALTIME, prioritate: a.celule })
  }
  const vede = alegeEtichete(p)
  let n = 0
  for (let i = 0; i < s.spanuri.length; i++) {
    const e = s.spanuri[i]!
    ascuns(e, !vede[i])
    if (!vede[i]) continue
    n++
    text(e, texte[i]!)
    const poz = `translate(${Math.round(p[i]!.x)}px, ${Math.round(p[i]!.y)}px) translate(-50%, -50%)`
    if (POZITIE.get(e) !== poz) {
      POZITIE.set(e, poz)
      e.style.transform = poz
    }
  }
  s.vizibile = n
}
