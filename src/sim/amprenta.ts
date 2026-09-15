/**
 * Amprenta pe grila a unei cladiri asezate LIBER.
 *
 * ## De ce exista, si ce NU schimba
 *
 * Cererea era „nu-mi place ca totul e construit din patrate, as fi vrut suprafete
 * mai flexibile". D19 e insa inchisa si unanima: grila de 1 m e universala **ca
 * sistem de coordonate SI DE COLIZIUNE**, iar organicul traieste **exclusiv in
 * prezentare**. Asa ca nu mut coliziunea de pe grila. Mut POZA.
 *
 * O cladire primeste o pozitie in milimetri si o orientare libera. Ce se deseneaza
 * e dreptunghiul rotit, adevarat. Ce se simuleaza sunt CELULELE pe care le acopera.
 * Modulul asta e traducerea dintre cele doua, si e singurul loc unde se intampla.
 *
 * ## Orientarea nu e un unghi
 *
 * E un vector unitate in virgula fixa, `(dirX, dirY)` in Q14. Motivul e
 * determinismul: `Math.cos` nu e garantat bit-exact intre motoare JS, deci un
 * unghi ar insemna ca aceeasi lume da amprente diferite pe masini diferite. Cine
 * cheama poate calcula vectorul din unghiul mouse-ului cu ce vrea — pana ajunge
 * in simulare e doi intregi, iar simularea nu atinge niciodata trigonometrie.
 *
 * ## Regula de acoperire e o ALEGERE, si costa
 *
 * `ORICE` — celula intra in amprenta daca dreptunghiul o atinge cat de putin.
 * Amprenta iese mai grasa decat arata cladirea.
 *
 * `CENTRU` — celula intra daca centrul ei cade inauntru. Amprenta seamana mult mai
 * bine cu desenul.
 *
 * `CENTRU` pare alegerea evidenta si e o capcana: un zid subtire asezat pe
 * diagonala **curge**. Rasterizat asa, ramane cu goluri prin care un agent trece,
 * desi pe ecran zidul e continuu. Vezi testele — nu e o banuiala, e demonstrat, si
 * de aia `ORICE` e implicitul pentru orice e menit sa opreasca pe cineva.
 *
 * Tot integer, tot fara `Math.sqrt`: comparatiile se fac pe patrate si pe produse
 * scalate cu FP_ONE.
 */

import type { Outcome } from './result.ts'
import { accept, refuse, Reason } from './result.ts'
import { MM_PER_CELL } from './state.ts'

/** Scara virgulei fixe pentru orientare. Aceeasi ca la zgomotul de teren. */
export const DIR_ONE = 16384

/** Jumatate de celula, in milimetri. Raza unei celule pe fiecare axa. */
const RAZA_CELULA = MM_PER_CELL / 2

/** Cat de mult are voie sa devieze un vector de orientare de la lungimea 1. */
const TOLERANTA_LUNGIME = 64

export const Acoperire = {
  /** Celula intra daca e atinsa cat de putin. Conservator: nu curge. */
  ORICE: 0,
  /** Celula intra daca centrul ei e inauntru. Seamana cu desenul, dar CURGE. */
  CENTRU: 1,
} as const

export type AcoperireId = (typeof Acoperire)[keyof typeof Acoperire]

/**
 * Poza unei cladiri. Toate campurile sunt PERSISTED si intregi.
 *
 * `x`/`y` sunt CENTRUL, in milimetri — nu coltul. Un dreptunghi rotit in jurul
 * coltului isi muta centrul, deci coltul nu e o ancora stabila cand te razgandesti
 * asupra orientarii.
 */
export interface Poza {
  /** PERSISTED — centrul, milimetri */ x: number
  /** PERSISTED — centrul, milimetri */ y: number
  /** PERSISTED — jumatate din latime, pe axa proprie, milimetri */ halfW: number
  /** PERSISTED — jumatate din lungime, pe axa proprie, milimetri */ halfH: number
  /** PERSISTED — orientarea, vector unitate Q14 */ dirX: number
  /** PERSISTED — orientarea, vector unitate Q14 */ dirY: number
}

/**
 * Orientarea e valida?
 *
 * Un refuz, nu un boolean: daca cineva trimite un vector nenormalizat, amprenta
 * ar iesi la alta scara decat cladirea, iar defectul s-ar vedea abia ca „zidul
 * blocheaza mai mult decat arata". Contractul din CLAUDE.md cere ca un „nu" sa
 * poarte cu el motivul.
 */
export function verificaOrientare(dirX: number, dirY: number): Outcome<number> {
  if (!Number.isInteger(dirX) || !Number.isInteger(dirY)) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'dir', dirX, dirY })
  }
  const lung2 = dirX * dirX + dirY * dirY
  const tinta = DIR_ONE * DIR_ONE
  // Banda de toleranta pe PATRAT, ca sa nu existe radacina patrata nicaieri.
  const jos = (DIR_ONE - TOLERANTA_LUNGIME) * (DIR_ONE - TOLERANTA_LUNGIME)
  const sus = (DIR_ONE + TOLERANTA_LUNGIME) * (DIR_ONE + TOLERANTA_LUNGIME)
  if (lung2 < jos || lung2 > sus) {
    return refuse(Reason.VALOARE_INVALIDA, { camp: 'dir', lungimePatrat: lung2, asteptat: tinta })
  }
  return accept(lung2)
}

/** Cutia de celule care poate contine amprenta. Larga cu o celula, deliberat. */
export function cutiaAmprentei(p: Poza): { x0: number; y0: number; x1: number; y1: number } {
  // Raza dreptunghiului rotit pe fiecare axa a lumii, in milimetri.
  const ax = Math.abs(p.dirX)
  const ay = Math.abs(p.dirY)
  const razaX = Math.ceil((p.halfW * ax + p.halfH * ay) / DIR_ONE)
  const razaY = Math.ceil((p.halfW * ay + p.halfH * ax) / DIR_ONE)
  return {
    x0: Math.floor((p.x - razaX) / MM_PER_CELL) - 1,
    y0: Math.floor((p.y - razaY) / MM_PER_CELL) - 1,
    x1: Math.floor((p.x + razaX) / MM_PER_CELL) + 1,
    y1: Math.floor((p.y + razaY) / MM_PER_CELL) + 1,
  }
}

/**
 * Atinge dreptunghiul rotit celula (cx, cy)?
 *
 * Teorema axei separatoare, pe patru axe: cele doua ale lumii si cele doua ale
 * dreptunghiului. Totul scalat cu DIR_ONE ca sa ramana in intregi. Marimile:
 * distanta pana la ~1e5 mm inmultita cu 16384 da ~1,6e9, mult sub 2^53, deci
 * exact in virgula mobila dubla — dar se face cu inmultiri normale, NU cu
 * operatori pe biti, care ar trunchia la 32 de biti.
 */
export function atingeCelula(p: Poza, cx: number, cy: number): boolean {
  const centruX = cx * MM_PER_CELL + RAZA_CELULA
  const centruY = cy * MM_PER_CELL + RAZA_CELULA
  const dx = centruX - p.x
  const dy = centruY - p.y
  const ax = Math.abs(p.dirX)
  const ay = Math.abs(p.dirY)

  // Axele lumii.
  if (Math.abs(dx) * DIR_ONE > RAZA_CELULA * DIR_ONE + p.halfW * ax + p.halfH * ay) return false
  if (Math.abs(dy) * DIR_ONE > RAZA_CELULA * DIR_ONE + p.halfW * ay + p.halfH * ax) return false

  // Axele dreptunghiului. Raza celulei pe o axa oblica e proiectia patratului ei.
  const razaCelulaOblic = RAZA_CELULA * (ax + ay)
  if (Math.abs(dx * p.dirX + dy * p.dirY) > p.halfW * DIR_ONE + razaCelulaOblic) return false
  if (Math.abs(-dx * p.dirY + dy * p.dirX) > p.halfH * DIR_ONE + razaCelulaOblic) return false

  return true
}

/** E centrul celulei (cx, cy) inauntrul dreptunghiului rotit? */
export function centruInauntru(p: Poza, cx: number, cy: number): boolean {
  const dx = cx * MM_PER_CELL + RAZA_CELULA - p.x
  const dy = cy * MM_PER_CELL + RAZA_CELULA - p.y
  if (Math.abs(dx * p.dirX + dy * p.dirY) > p.halfW * DIR_ONE) return false
  if (Math.abs(-dx * p.dirY + dy * p.dirX) > p.halfH * DIR_ONE) return false
  return true
}

/**
 * Celulele acoperite de o poza, in ordine FIXA (y crescator, apoi x).
 *
 * Ordinea conteaza: amprenta ajunge in teren si in hash, iar doua lumi identice ca
 * continut trebuie sa dea aceeasi secventa de scrieri.
 *
 * Intoarce perechi plate `[x0, y0, x1, y1, ...]` ca sa nu aloce un obiect per
 * celula — un zid lung are sute.
 */
export function amprenta(p: Poza, regula: AcoperireId = Acoperire.ORICE): Int32Array {
  const cutie = cutiaAmprentei(p)
  const out: number[] = []
  for (let cy = cutie.y0; cy <= cutie.y1; cy++) {
    for (let cx = cutie.x0; cx <= cutie.x1; cx++) {
      const inauntru = regula === Acoperire.ORICE ? atingeCelula(p, cx, cy) : centruInauntru(p, cx, cy)
      if (inauntru) out.push(cx, cy)
    }
  }
  return Int32Array.from(out)
}
