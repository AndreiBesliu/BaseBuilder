/**
 * Camara (S24-27 t.3 §5, commit-ul C): groapa de moloz — CITIRE PURA, pentru unealta Camara, avertismentul ei si cauza de pe
 * mormanele de moloz (UI-ul care o foloseste vine in valul 2; aici e functia si contractul).
 *
 * ## De ce (verif-J-2)
 *
 * Sapatul pivnitei lasa pamant si PIATRA (la 2 m, 74–82% piatra: 590–690 u) pe podeaua viitoarei camare. Filtrul „doar
 * hrana" le refuza, dar ele raman acolo pana au unde pleca: cu depozitul general plin (hrana de start + piatra), camara
 * pictata la timp tot pierde 12,4–18,0% (fata de 1,4–1,9% cu loc nelimitat). Variabila care decide nu e marimea depozitului,
 * ci LOCUL LIBER din clipa in care se picteaza camara: acelasi 5×5 fara hrana da 6,2–7,6% pictat la t = 0 (piatra de start il
 * umple) si 1,2–1,6% pictat odata cu camara. De aici propunerea, dintr-un clic: un depozit cu filtrul pe felurile refuzate
 * PREZENTE, de ⌈u/itemStackMax⌉ celule plus o margine (`groapaMargineCelule`), pictat odata cu camara — masurat cu 4×4 pentru
 * 800–870 u: 1,2–2,7%; un 3×3, sub moloz, 5,4–8,6%.
 *
 * ## Ce numara
 *
 * - `unitati`: din felurile pe care camara le REFUZA, ce sta pe celulele ei si nu e deja promis unui caraus (cantitatea minus
 *   rezervarile CARAT) — ce a plecat deja nu mai cere loc. Felurile perisabile (hrana) nu sunt moloz: nu intra niciodata
 *   (pe un depozit care refuza hrana, locul ei e camara, nu o groapa — JOC-4).
 * - `loc`: locul pentru ele in CELELALTE depozite vii care le primesc felul — aceeasi idee de celula libera ca indexul
 *   (nerezervata ca destinatie, nu sub un santier viu): o celula goala da `itemStackMax` daca zona ei primeste macar unul
 *   din felurile de moloz, una partiala doar pe felul ei. Orice depozit e strict mai bun decat camara pentru un fel refuzat
 *   (acolo rangul e 0), deci rangul nu conteaza. Celulele goale sunt comune tuturor felurilor (si hranei): `loc` e o margine
 *   SUPERIOARA, deci `lipsa` una inferioara — de aceea groapa se dimensioneaza pe tot molozul, nu pe lipsa.
 * - `lipsa = max(0, unitati − loc)`; propunerea apare doar cand lipseste ceva.
 *
 * Nu scrie nimic in `World` (nici indexul de zone: UI-ul n-are voie sa-l reconstruiasca) si nu citeste indexul.
 */

import type { Rules } from './content.ts'
import type { World } from './state.ts'
import { ITEME } from './state.ts'
import { itemLaCelula } from './iteme.ts'
import { rezervariPentru, Strat, sumaRezervata } from './rezervari.ts'
import { primesteFel, slotZona, subSantier, Zona } from './zone.ts'

export interface GroapaDeMoloz {
  /** Masca felurilor REFUZATE de camara care stau pe celulele ei (bitul k = felul k). 0 = nimic de scos. */
  readonly feluri: number
  /** Unitatile lor nepromise, pe fel (`ITEME` intrari). */
  readonly unitatiPeFel: readonly number[]
  /** Totalul lor. */
  readonly unitati: number
  /** Cate celule ale camarii tin un morman dintr-un fel refuzat. */
  readonly celuleOcupate: number
  /** Locul pentru ele in celelalte depozite (unitati; margine superioara, vezi antetul). */
  readonly loc: number
  /** Cat lipseste: `max(0, unitati − loc)`. */
  readonly lipsa: number
  /** `⌈lipsa / itemStackMax⌉`. */
  readonly lipsaCelule: number
  /** Marimea propusa a gropii, in celule: `⌈unitati / itemStackMax⌉ + groapaMargineCelule` cand lipseste ceva, altfel 0. */
  readonly propusa: number
  /** Latura patratului propus, `⌈√propusa⌉` (0 fara propunere). */
  readonly latura: number
  /** Filtrul propus al gropii, ca masca REFUZATA (`setFiltruZona`): primeste doar `feluri`. */
  readonly refuzate: number
}

/**
 * Groapa de moloz pentru depozitul `zonaId` (o camara: un depozit cu filtru). `null` daca zona nu exista sau nu e un depozit.
 * Un depozit fara filtru nu refuza nimic, deci raspunsul lui e gol (`feluri` 0, fara propunere).
 */
export function groapaDeMoloz(w: World, rules: Rules, zonaId: number): GroapaDeMoloz | null {
  const s = w.zone
  const zc = slotZona(s, zonaId)
  if (zc === -1 || s.kind[zc] !== Zona.DEPOZIT) return null
  const it = w.iteme
  const c = s.celule
  const unitatiPeFel = new Array<number>(ITEME).fill(0)
  let feluri = 0
  let celuleOcupate = 0
  for (let cs = 0; cs < c.count; cs++) {
    if (c.alive[cs] === 0 || c.zonaId[cs] !== zonaId) continue
    const i = itemLaCelula(it, c.wx[cs]!, c.wy[cs]!, c.z[cs]!)
    if (i === -1) continue
    const k = it.kind[i]!
    // Hrana nu e moloz (JOC-4): pe un depozit care o refuza (groapa insasi), locul ei e camara, nu o groapa noua.
    if (primesteFel(s, zc, k) || rules.perisabil[k] === true) continue
    celuleOcupate++
    const liber = Math.max(0, it.cantitate[i]! - sumaRezervata(w.rezervari, it.id[i]!, Strat.CARAT))
    if (liber === 0) continue
    unitatiPeFel[k] = unitatiPeFel[k]! + liber
    feluri |= 1 << k
  }
  let unitati = 0
  for (let k = 0; k < ITEME; k++) unitati += unitatiPeFel[k]!
  let loc = 0
  if (feluri !== 0) {
    for (let cs = 0; cs < c.count; cs++) {
      if (c.alive[cs] === 0 || c.zonaId[cs] === zonaId) continue
      const zs = slotZona(s, c.zonaId[cs]!)
      if (zs === -1 || s.kind[zs] !== Zona.DEPOZIT) continue
      if (rezervariPentru(w.rezervari, c.id[cs]!, Strat.LUCRU).length > 0) continue
      if (subSantier(w, rules, c.wx[cs]!, c.wy[cs]!, c.z[cs]!)) continue
      const i = itemLaCelula(it, c.wx[cs]!, c.wy[cs]!, c.z[cs]!)
      if (i === -1) {
        let primesteMoloz = false
        for (let k = 0; k < ITEME; k++) if (((feluri >> k) & 1) === 1 && primesteFel(s, zs, k)) primesteMoloz = true
        if (primesteMoloz) loc += rules.itemStackMax
        continue
      }
      const k = it.kind[i]!
      if (((feluri >> k) & 1) === 1 && primesteFel(s, zs, k) && it.cantitate[i]! < rules.itemStackMax) loc += rules.itemStackMax - it.cantitate[i]!
    }
  }
  const lipsa = Math.max(0, unitati - loc)
  const propusa = lipsa > 0 ? Math.ceil(unitati / rules.itemStackMax) + rules.groapaMargineCelule : 0
  let latura = 0
  while (latura * latura < propusa) latura++
  return {
    feluri,
    unitatiPeFel,
    unitati,
    celuleOcupate,
    loc,
    lipsa,
    lipsaCelule: Math.ceil(lipsa / rules.itemStackMax),
    propusa,
    latura,
    refuzate: ((1 << ITEME) - 1) & ~feluri,
  }
}
