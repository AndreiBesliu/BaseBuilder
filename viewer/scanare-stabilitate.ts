/**
 * Scanarea overlay-ului de stabilitate, FELIATA pe cadre. Fara THREE, ca sa se
 * poata testa in node.
 *
 * ## De ce feliata
 *
 * Masurat la grinda (S20-23 t.4): o trecere a overlay-ului — `stareSapat` pe fiecare
 * celula pe care prefiltrul n-o poate declara SIGURA — costa ~26 ms intr-o sala de
 * 23×23 fara grinzi, dar 3,2 s in aceeasi sala cu 4 grinzi si 5,6 s sub un tavan
 * 21×21 numai din grinzi: langa o grinda, o sapatura ipotetica re-verifica discul de
 * raza 9 al grinzii, cu un BFS `s1` pe fiecare celula. Iar viewer-ul reface overlay-ul
 * la fiecare 30 de cadre: cu trecerea intr-un singur cadru, fereastra ar ingheta
 * secunde intregi, din nou, cat timp jucatorul se uita la o sala cu grinzi.
 *
 * Asa, un cadru plateste bugetul lui PLUS celula din curs, iar trecerea se termina peste
 * cateva sute de cadre. Celula nu e ieftina langa grinzi: 4–20 ms (sala 23×23 cu 4 grinzi:
 * p50 4 ms; sub un tavan numai din grinzi: p50 10 ms — masurat de verificatorul COST-4, minimul
 * din trei rulari), deci cat tine trecerea (3–6 s), cadrele au 8–25 ms de lucru: sacadare, nu
 * 4 ms. O trecere terminata nu se mai reporneste cat timp terenul nu se schimba. Desenul
 * vechi ramane pe ecran pana la capatul trecerii. Leacul adevarat e calculul pe campuri, in
 * registru: exact doar pe un nivel, 16–20 ms pentru CADE plus 13–27 ms pentru ULTIMA (~30–47
 * ms, masurat de panou), cazul general — cu z+1 si cascada — nemasurat.
 *
 * Terenul se poate schimba intre felii (pionii sapa). Celulele deja judecate raman
 * judecate pe terenul de atunci; e un ajutor vizual, iar urmatoarea trecere le
 * reface. Prefiltrul se calculeaza o data, la pornire.
 */

import type { World } from '../src/sim/state.ts'
import type { Rules } from '../src/sim/content.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { Prefiltru, prefiltruStabilitate, StareSapat, stareSapat } from '../src/sim/stabilitate.ts'

export interface Scanare {
  readonly zActiv: number
  readonly cx: number
  readonly cy: number
  readonly raza: number
  /** Terenul si EPOCA lui (`Terrain.editari`) la pornire: trecerea e o functie de ele si de fereastra. */
  readonly teren: Terrain
  readonly editari: number
  readonly filtru: Uint8Array
  /** Urmatoarea celula din `filtru` de judecat. */
  cursor: number
  sigur: number
  ultima: number
  cade: number
  /** Cate celule au ajuns la judecata SCUMPA (`stareSapat`). */
  scanate: number
  /** Celulele de desenat, ca triplete (wx, wy, stare), in ordinea scanarii. */
  readonly marcate: number[]
  /** Timpul de lucru cumulat, in unitatile ceasului dat — fara pauzele dintre felii. */
  lucru: number
  /** Pe cate apeluri s-a intins trecerea. */
  felii: number
}

export function pornesteScanare(w: World, rules: Rules, zActiv: number, cx: number, cy: number, raza: number): Scanare {
  const lat = 2 * raza + 1
  return {
    zActiv, cx, cy, raza,
    teren: w.terrain,
    editari: w.terrain.editari,
    filtru: prefiltruStabilitate(w.terrain, rules, cx - raza, cy - raza, lat, zActiv),
    cursor: 0,
    sigur: 0, ultima: 0, cade: 0, scanate: 0,
    marcate: [],
    lucru: 0,
    felii: 0,
  }
}

/** Aceeasi trecere? Cea din curs nu se reporneste — altfel, pornita la 30 de cadre, n-ar ajunge niciodata la capat. */
export function aceeasiScanare(s: Scanare, zActiv: number, cx: number, cy: number, raza: number): boolean {
  return s.zActiv === zActiv && s.cx === cx && s.cy === cy && s.raza === raza
}

/** Ce face overlay-ul cu trecerea la o cerere noua (la S, la Q/E, si la fiecare 30 de cadre). */
export const Trecere = {
  /** Trecerea din curs raspunde deja la intrebare: continua. */
  CONTINUA: 0,
  /** Trecerea terminata raspunde, iar terenul n-a mai fost editat de cand a pornit: nimic de facut. */
  GATA: 1,
  /** Se porneste una noua; desenul vechi raspunde la aceeasi intrebare, deci ramane pana la capat. */
  PORNESTE: 2,
  /** Se porneste una noua, iar desenul vechi e al ALTEI intrebari: se sterge pe loc. */
  UITA_SI_PORNESTE: 3,
} as const

/**
 * Decizia, fara THREE, ca sa aiba test (recenzia din 26.09: garda „trecerea din curs nu se
 * reporneste" statea in overlay, fara niciun test — scoasa, totul ramanea verde, iar langa
 * grinzi trecerea nu se mai termina niciodata).
 *
 * - Trecerea DIN CURS nu se reporneste pentru aceeasi intrebare: ceruta la fiecare 30 de
 *   cadre, o trecere de cateva sute de cadre n-ar ajunge niciodata la capat.
 * - Nici una TERMINATA, daca terenul n-a mai fost editat de cand a pornit: trecerea e o
 *   functie de teren si fereastra. Repornita la 30 de cadre, platea iar si iar cea mai
 *   scumpa celula — baza unui stalp cu 8 etaje, un cadru de 43–49 ms la fiecare jumatate de
 *   secunda, cu terenul neatins (masurat de verificatorul COST-4). Epoca e globala: o editare
 *   oriunde reporneste trecerea — conservator, nu gresit.
 */
export function ceFacCuTrecerea(inCurs: Scanare | null, ultima: Scanare | null, teren: Terrain, zActiv: number, cx: number, cy: number, raza: number): number {
  if (inCurs !== null && aceeasiScanare(inCurs, zActiv, cx, cy, raza)) return Trecere.CONTINUA
  if (inCurs === null && ultima !== null && aceeasiScanare(ultima, zActiv, cx, cy, raza) && ultima.teren === teren && ultima.editari === teren.editari) return Trecere.GATA
  return ultima !== null && !aceeasiScanare(ultima, zActiv, cx, cy, raza) ? Trecere.UITA_SI_PORNESTE : Trecere.PORNESTE
}

/**
 * Avanseaza trecerea pana cand `ceas()` a trecut de `buget` fata de inceputul apelului.
 * Bugetul se verifica DUPA fiecare celula scumpa, deci un apel judeca cel putin una —
 * trecerea nu poate sta pe loc, oricat de mic e bugetul. Intoarce `true` cand s-a
 * terminat.
 */
export function avanseazaScanare(s: Scanare, w: World, rules: Rules, ceas: () => number, buget: number): boolean {
  const t0 = ceas()
  s.felii++
  const lat = 2 * s.raza + 1
  const x0 = s.cx - s.raza
  const y0 = s.cy - s.raza
  const n = s.filtru.length
  while (s.cursor < n) {
    const k = s.cursor++
    const f = s.filtru[k]!
    if (f === Prefiltru.NIMIC) continue
    if (f === Prefiltru.SIGUR) { s.sigur++; continue }
    const wx = x0 + Math.floor(k / lat)
    const wy = y0 + (k % lat)
    s.scanate++
    const stare = stareSapat(w.terrain, rules, wx, wy, s.zActiv)
    if (stare === StareSapat.SIGUR || stare === StareSapat.NIMIC) s.sigur++
    else {
      if (stare === StareSapat.ULTIMA_CELULA) s.ultima++
      else s.cade++
      s.marcate.push(wx, wy, stare)
    }
    if (ceas() - t0 >= buget) break
  }
  s.lucru += ceas() - t0
  return s.cursor >= n
}
