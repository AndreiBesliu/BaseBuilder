/**
 * Stabilitatea — S20-23, taietura 1.
 *
 * DESIGN §5.2 da regula intr-o propozitie: **4 la sprijin, −1 pe pas, 0 =
 * imposibil**. PLAN §0.5 da testul literal: pivnita 7×7 se prabuseste, 5×5 nu.
 * Cele doua impreuna fixeaza constanta UNIC: o camera W×W cade iff ⌈W/2⌉ ≥
 * `suportMax`, iar perechea (5 tine, 7 cade) da exact 4.
 *
 * ## Definitie, nu recurenta
 *
 * Un voxel solid e **asezat** daca sub el e solid sau daca e la cota de ancora.
 * Pentru restul:
 *
 *     suport(c) = max(0, suportMax − d(c))
 *
 * unde `d(c)` e numarul MINIM de pasi laterali prin voxeli SOLIZI de la aceeasi
 * cota pana la cel mai apropiat voxel ASEZAT.
 *
 * Scrisa ca recurenta („suport = max(suport al vecinilor) − 1"), regula depinde
 * de ordinea de parcurgere: panoul de design a rulat-o in trei ordini pe acelasi
 * teren si a obtinut trei harti, niciuna corecta — 10 din 25 de celule gresite,
 * si 1 voxel prabusit in loc de 9. Ca definitie peste multimea surselor are
 * punct fix unic si se implementeaza ca BFS.
 *
 * **Nicio functie de aici nu citeste suportul altui voxel.** E singura formulare
 * in care lumea continua si cea incarcata dau acelasi rezultat.
 *
 * ## Fara harta
 *
 * Suportul nu se memoreaza nicaieri. Varianta „harta DERIVED sub steag murdar",
 * care parea evidenta fiindca e tiparul regiunilor si al indexului de zone, a
 * fost masurata de panou: reconstructia in bloc da 237.408 intrari si 144,6 ms
 * pentru cele 9 chunk-uri pe care le promoveaza O SINGURA sapatura, si 1.332.035
 * intrari / 1297 ms la 49 — iar numarul de chunk-uri promovate nu scade
 * NICIODATA. Cost care creste cu vechimea coloniei: definitia lui K05.
 *
 * O interogare costa, masurat, 0,058 µs pe un voxel asezat (o citire) si 4,345 µs
 * pe unul atarnat (BFS marginit). Iar voxelii atarnati sunt rari: 12 in tot
 * scenariul standard.
 */

import type { Rules } from './content.ts'
import { cellKey, decodeCell } from './path.ts'
import { materialFast } from './regions.ts'
import { bazaVoxeli, WORLD_CELLS } from './terrain/terrain.ts'
import type { Terrain } from './terrain/terrain.ts'
import { isSolid, VOXEL_LEVELS } from './terrain/chunk.ts'

/** Ce e la o celula, din perspectiva stabilitatii. */
export const Sol = {
  AER: 0,
  SOLID: 1,
  /**
   * Stanca de sub fereastra de voxeli a coloanei, sau marginea lumii. Nu s-a
   * sapat niciodata acolo si nu se poate: e sprijin absolut.
   */
  ANCORA: 2,
} as const

/**
 * Ce e la (wx, wy, z) pentru stabilitate, tratand celulele din `cazute` ca aer.
 *
 * ## De ce nu se poate folosi direct `materialAt`
 *
 * `materialAt` intoarce AER pentru orice cota sub baza ferestrei de voxeli, si o
 * face DELIBERAT (terrain.ts, comentariul de la calea derivata): calea
 * ne-promovata trebuie sa raspunda exact ce ar raspunde una promovata.
 *
 * Pentru stabilitate, raspunsul ala e o minciuna cu doua fete, si panoul le-a
 * masurat pe amandoua:
 *
 *   - **talpa.** Aplicand regula peste `materialAt`, un chunk NEATINS are 841
 *     din 1024 de voxeli de pe nivelul de baza cu suport 0. Prima sapatura
 *     promoveaza 9 chunk-uri, deci ~7.500 de voxeli ar cadea fara ca jucatorul
 *     sa fi sapat acolo.
 *   - **cusatura.** `zBaseM` e per-chunk si difera pe 86,8% dintre perechile de
 *     chunk-uri vecine (medie 3,67 m, maxim 18 m). Un vecin lateral aflat sub
 *     baza chunk-ului LUI ar raspunde AER, deci aceeasi camera 7×7 pierde 1
 *     voxel in interiorul unui chunk si 4 daca marginea ei atinge o granita
 *     invizibila de 32 m. Asta E K16.
 *
 * Deasupra ferestrei raspunsul AER e adevarat, nu o minciuna: acolo chiar nu
 * exista voxel si `setVoxel` refuza. Ce NU e adevarat e plafonul diferit intre
 * coloane vecine cu acelasi sol — vezi OWNER_VERIFY.
 */
export function solLa(t: Terrain, wx: number, wy: number, z: number, cazute: Set<number> | null = null): number {
  if (wx < 0 || wy < 0 || wx >= WORLD_CELLS || wy >= WORLD_CELLS) return Sol.ANCORA
  const baza = bazaVoxeli(t, wx, wy)
  if (z < baza) return Sol.ANCORA
  if (z >= baza + VOXEL_LEVELS) return Sol.AER
  if (cazute !== null && cazute.has(cellKey(wx, wy, z))) return Sol.AER
  return isSolid(materialFast(t, wx, wy, z)) ? Sol.SOLID : Sol.AER
}

/** Se sprijina voxelul direct pe ceva? Ancora si solidul de dedesubt conteaza la fel. */
export function esteAsezat(t: Terrain, wx: number, wy: number, z: number, cazute: Set<number> | null = null): boolean {
  if (solLa(t, wx, wy, z, cazute) !== Sol.SOLID) return false
  const sub = solLa(t, wx, wy, z - 1, cazute)
  return sub === Sol.SOLID || sub === Sol.ANCORA
}

// Tampoane reusite intre apeluri. BFS-ul atinge cel mult discul Manhattan de
// raza `suportMax` (41 de celule la raza 4), deci nu au nevoie sa creasca.
const coadaX: number[] = []
const coadaY: number[] = []
const coadaD: number[] = []
const vazute = new Set<number>()
const DIRECTII: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]]

/**
 * Suportul unui voxel: `max(0, suportMax − d)`.
 *
 * 0 pentru ce nu e solid — nu e nimic de sustinut. `suportMax` pentru un voxel
 * asezat, dintr-o singura citire. Pentru restul, BFS lateral prin SOLID pana la
 * primul asezat, marginit la `suportMax` pasi: peste atat raspunsul e 0 oricum.
 *
 * Ordinea de explorare e fixa, dar rezultatul nu depinde de ea — BFS-ul da
 * distanta minima, care e o proprietate a terenului.
 */
export function suportLa(t: Terrain, rules: Rules, wx: number, wy: number, z: number, cazute: Set<number> | null = null): number {
  if (solLa(t, wx, wy, z, cazute) !== Sol.SOLID) return 0
  if (esteAsezat(t, wx, wy, z, cazute)) return rules.suportMax

  vazute.clear()
  coadaX.length = 0
  coadaY.length = 0
  coadaD.length = 0
  coadaX.push(wx)
  coadaY.push(wy)
  coadaD.push(0)
  vazute.add(cellKey(wx, wy, z))

  for (let cap = 0; cap < coadaX.length; cap++) {
    const x = coadaX[cap]!
    const y = coadaY[cap]!
    const d = coadaD[cap]!
    if (d >= rules.suportMax) continue
    for (const [dx, dy] of DIRECTII) {
      const nx = x + dx
      const ny = y + dy
      if (solLa(t, nx, ny, z, cazute) !== Sol.SOLID) continue
      const cheie = cellKey(nx, ny, z)
      if (vazute.has(cheie)) continue
      vazute.add(cheie)
      // Primul asezat gasit e la distanta minima: BFS pe muchii de cost 1.
      if (esteAsezat(t, nx, ny, z, cazute)) return rules.suportMax - (d + 1)
      coadaX.push(nx)
      coadaY.push(ny)
      coadaD.push(d + 1)
    }
  }
  return 0
}

/**
 * Celulele al caror suport se poate schimba dupa o editare la (wx, wy, z).
 *
 * DOUA discuri Manhattan de raza `suportMax − 1`, la cotele z SI z+1 — 50 de
 * celule la raza 3, nu 25.
 *
 * Cota z+1 nu e un amanunt. Editarea la z schimba statutul de „asezat" al
 * voxelului de la (x, y, z+1), iar de acolo schimbarea se propaga lateral exact
 * ca la cota z. Prima versiune a designului avea „discul de la z plus UN voxel
 * deasupra", iar panoul a masurat ce rateaza: pe scenariul stalpului scos, 13
 * celule se schimba la z+1 si NOUA ajung la suport 0; multimea aia prinde una.
 * Restul ar fi ramas in picioare in lumea continua si ar fi cazut in cea
 * incarcata — M5 rosu, dintr-o cauza pe care niciun test de unitate n-o vede.
 */
export function celuleAtinse(rules: Rules, wx: number, wy: number, z: number, out: number[]): void {
  const raza = rules.suportMax - 1
  for (const dz of [0, 1]) {
    for (let dx = -raza; dx <= raza; dx++) {
      const rest = raza - Math.abs(dx)
      for (let dy = -rest; dy <= rest; dy++) out.push(cellKey(wx + dx, wy + dy, z + dz))
    }
  }
}

/**
 * Multimea voxelilor care cad dupa o editare la (wx, wy, z), ca punct fix.
 *
 * Multimea NU depinde de ordinea in care se descopera: suportul unui voxel e
 * distanta pana la un voxel ASEZAT, iar „asezat" e o proprietate a terenului de
 * dedesubt. A scoate un voxel poate doar sa SCADA suportul altuia, niciodata
 * sa-l creasca — deci procesul e monoton si are un singur punct fix.
 *
 * Ordinea din tabloul intors e (z crescator, apoi wx, apoi wy). z crescator
 * fiindca fundul trebuie sa cada inaintea a ce sta pe el; iar ordinea conteaza
 * la APLICARE, nu la calcul: panoul a masurat ca doua depuneri identice in
 * ordine diferita dau hash diferit (fb48760e vs 8ff179be), fiindca `creeazaItem`
 * ia primul slot liber si hash-ul parcurge itemele in ordinea slotului.
 */
export function multimeaCareCade(t: Terrain, rules: Rules, wx: number, wy: number, z: number): number[] {
  const cazute = new Set<number>()
  const deVerificat: number[] = []
  celuleAtinse(rules, wx, wy, z, deVerificat)

  for (let i = 0; i < deVerificat.length; i++) {
    const cheie = deVerificat[i]!
    if (cazute.has(cheie)) continue
    const c = decodeCell(cheie)
    if (solLa(t, c.wx, c.wy, c.z, cazute) !== Sol.SOLID) continue
    if (suportLa(t, rules, c.wx, c.wy, c.z, cazute) > 0) continue
    cazute.add(cheie)
    // Ce cade poate lua cu el ce se sprijinea pe el: se re-verifica vecinatatea.
    celuleAtinse(rules, c.wx, c.wy, c.z, deVerificat)
  }

  const chei = [...cazute]
  chei.sort((a, b) => {
    const ca = decodeCell(a)
    const cb = decodeCell(b)
    return ca.z - cb.z || ca.wx - cb.wx || ca.wy - cb.wy
  })
  return chei
}

/**
 * Cota pe care se aseaza ce a cazut din (wx, wy, zDeLa): coboara pana gaseste
 * ceva solid dedesubt.
 *
 * Nu e acelasi lucru cu `maxStepM`. Ala e un plafon de PAS — cat poate urca sau
 * cobori un pion mergand — si panoul a masurat ce iese daca e refolosit ca
 * plafon de CADERE: la o prabusire de 2+ niveluri, carligul de podea al
 * mormanelor pierde 100% din marfa, iar `dezgroapa` lasa pionul in aer pe veci.
 */
export function cotaDeAsezare(t: Terrain, wx: number, wy: number, zDeLa: number, cazute: Set<number> | null = null): number {
  let z = zDeLa
  const baza = bazaVoxeli(t, wx, wy)
  while (z > baza && solLa(t, wx, wy, z - 1, cazute) === Sol.AER) z--
  return z
}

