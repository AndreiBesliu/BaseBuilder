/**
 * Mormanele de resurse, pe ecran — partea PURA: ce plasa primeste fiecare morman, cum e rotit, si
 * lista instantelor din lume. Fara three, ca sa aiba test.
 *
 * Plasele sunt generate in Blender de tools/assets/resurse.py (viewer/public/resurse/mormane.glb):
 * patru feluri × trei trepte, numite `<fel>_<treapta>`. Pana acum un morman se vedea doar cu overlay-ul
 * J, ca un cub de sarma; fara J, marfa din lume era invizibila.
 */

import { Item } from '../src/sim/state.ts'
import type { World } from '../src/sim/state.ts'

/** Numele felului in fisier. Indexat cu `Item`. */
export const FEL_RESURSA: Readonly<Record<number, string>> = {
  [Item.PIATRA]: 'piatra',
  [Item.PAMANT]: 'pamant',
  [Item.LEMN]: 'lemn',
  [Item.HRANA]: 'hrana',
}

export const TREPTE = 3

/**
 * Treapta mormanului dupa cantitate: treimi din `itemStackMax` (75 azi: 1–25 mic, 26–50 mediu,
 * 51–75 mare). Un morman plin trebuie sa se vada plin; unul de 5 nu trebuie sa para un depozit.
 */
export function treaptaMormanului(cantitate: number, stackMax: number): number {
  if (cantitate <= stackMax / 3) return 0
  if (cantitate <= (2 * stackMax) / 3) return 1
  return 2
}

/** Numele plasei din fisier: `piatra_2`. */
export function numePlasa(fel: number, treapta: number): string {
  return `${FEL_RESURSA[fel] ?? 'piatra'}_${treapta}`
}

/**
 * Rotatia unui morman, in radiani: functie pura de celula, ca mormanele vecine sa nu fie copii identice
 * si ca acelasi morman sa nu se roteasca de la un cadru la altul (sau dupa o incarcare).
 */
export function rotatiaMormanului(wx: number, wy: number): number {
  let h = Math.imul(wx | 0, 0x27d4eb2d) ^ Math.imul(wy | 0, 0x165667b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return ((h >>> 0) / 0x100000000) * Math.PI * 2
}

/** O instanta: celula (centrul ei se calculeaza la desen) si rotatia. */
export interface InstantaMorman {
  readonly wx: number
  readonly wy: number
  readonly z: number
  readonly rot: number
}

/**
 * Mormanele vii ale lumii, grupate pe plasa. Mormanele din mainile oamenilor nu sunt in `iteme` —
 * nu apar aici.
 */
export function instanteMormane(w: World, stackMax: number): Map<string, InstantaMorman[]> {
  const out = new Map<string, InstantaMorman[]>()
  const it = w.iteme
  for (let i = 0; i < it.count; i++) {
    if (it.alive[i] !== 1) continue
    const cheie = numePlasa(it.kind[i]!, treaptaMormanului(it.cantitate[i]!, stackMax))
    let l = out.get(cheie)
    if (!l) { l = []; out.set(cheie, l) }
    l.push({ wx: it.wx[i]!, wy: it.wy[i]!, z: it.z[i]!, rot: rotatiaMormanului(it.wx[i]!, it.wy[i]!) })
  }
  return out
}

/**
 * O componenta de culoare din fisier (LINIARA, cum cere glTF) in conventia terenului viewer-ului, care
 * pune in varfuri valorile paletei (sRGB) asa cum sunt. Fara conversie, un morman de pamant ar iesi mai
 * inchis decat pamantul pe care sta.
 */
export function liniarInSrgb(c: number): number {
  const x = Math.max(0, Math.min(1, c))
  return x <= 0.0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - 0.055
}
