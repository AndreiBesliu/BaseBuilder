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
 * Asa, un cadru plateste cel mult bugetul lui (plus celula scumpa din curs), iar
 * trecerea se termina peste cateva sute de cadre. Desenul vechi ramane pe ecran
 * pana atunci. Leacul adevarat — calculul pe campuri, pe un singur nivel, 16–20 ms
 * masurat de panou — e in registru, cu cifrele astea.
 *
 * Terenul se poate schimba intre felii (pionii sapa). Celulele deja judecate raman
 * judecate pe terenul de atunci; e un ajutor vizual, iar urmatoarea trecere le
 * reface. Prefiltrul se calculeaza o data, la pornire.
 */

import type { World } from '../src/sim/state.ts'
import type { Rules } from '../src/sim/content.ts'
import { Prefiltru, prefiltruStabilitate, StareSapat, stareSapat } from '../src/sim/stabilitate.ts'

export interface Scanare {
  readonly zActiv: number
  readonly cx: number
  readonly cy: number
  readonly raza: number
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
