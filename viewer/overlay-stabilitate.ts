/**
 * Overlay-ul de stabilitate (tasta S) — S20-23, taietura 1.
 *
 * DESIGN §5.2 cere vizualizatorul „in aceeasi sarcina cu regula", si spune de ce:
 * la Foxy Voxel absenta lui a fost reclamata ani intregi — sistemul arata doar un
 * mesaj de eroare la esec.
 *
 * ## Ce deseneaza
 *
 * Doar ce e ACTIONABIL: **ULTIMA CELULA** (lasa roca aici sau pune stalp) si
 * **CADE**. *Sigur* ramane deliberat nedesenat — in roca netulburata ar acoperi
 * ecranul uniform si ar ingropa exact cele cateva celule care conteaza. Plus
 * previzualizarea: ce s-ar prabusi daca s-ar sapa TOATE desemnarile vii.
 *
 * Culoarea poarta ACTIUNEA, nu o masura. O cifra fara verb („1", portocaliu) nu
 * spune nici cat mai poti sapa, nici unde sa lasi roca, iar DESIGN §9 regula 9
 * interzice gradientul rosu→verde ca singur canal.
 *
 * ## Trei lucruri pe care recenzia adversariala le-a gasit STRICATE
 *
 * Prima versiune a acestui fisier a fost livrata fara sa fie vazuta vreodata pe
 * ecran, iar recenzia a masurat ca nu desena nimic, din trei motive independente
 * — oricare dintre ele singur ar fi fost de ajuns:
 *
 * 1. **Patratele cadeau PESTE planul de taiere.** Se desenau la `zActiv + 1.02`,
 *    iar planul global pastreaza `y <= sliceLevel`. Erau taiate din shader. Acum
 *    nivelul judecat e `sliceLevel - 1` (ultimul vizibil INTREG, fiindca voxelul
 *    de la nivelul L ocupa `y ∈ [L, L+1]`), iar conturul se aseaza pe fata lui de
 *    sus, la `zActiv + 0.96`, adica sub plan.
 * 2. **Cu slice-ul OPRIT — starea implicita — nivelul se lua din altitudinea
 *    CAMEREI**, care e cu zeci de metri deasupra terenului. Zero patrate, mereu.
 *    Acum overlay-ul spune explicit ca are nevoie de slice view.
 * 3. **Previzualizarea desena la cota ei reala**, care e de obicei `z+1`, adica
 *    tocmai deasupra planului de taiere. Se proiecteaza acum pe nivelul activ,
 *    cu un contur mai stramt, ca sa se vada si cand cade in aceeasi coloana cu un
 *    patrat de stare.
 */

import * as THREE from 'three'
import type { World } from '../src/sim/state.ts'
import type { Rules } from '../src/sim/content.ts'
import { decodeCell } from '../src/sim/path.ts'
import { Sol, solLa, StareSapat, stareSapat } from '../src/sim/stabilitate.ts'
import { constructiaPrevizualizata, prabusireaPrevizualizata } from '../src/sim/joburi.ts'

export interface StabilityOverlay {
  readonly group: THREE.Group
  visible: boolean
  /** Cate celule de pe nivelul activ sunt in fiecare stare. Pentru HUD. */
  sigur: number
  ultima: number
  cade: number
  /** Cati voxeli ar cadea daca s-ar sapa TOATE desemnarile vii. */
  previzualizate: number
  /**
   * Cate piese desenate NU se pot ridica, nici dupa ce se ridica tot restul
   * planului. Calculate pe MULTIMEA desemnarilor, ca punct fix.
   */
  imposibile: number
  /** Cate celule au ajuns la scanarea SCUMPA. Pentru bugetul de cadru. */
  scanate: number
  /** Ce sa scrie in HUD cand overlay-ul nu poate desena nimic. Gol daca poate. */
  piedica: string
}

export function createStabilityOverlay(): StabilityOverlay {
  const group = new THREE.Group()
  group.visible = false
  return { group, visible: false, sigur: 0, ultima: 0, cade: 0, previzualizate: 0, imposibile: 0, scanate: 0, piedica: '' }
}

function goleste(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child)
    const m = child as THREE.Mesh | THREE.LineSegments
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
  }
}

// Luminozitatea poarta valoarea, nuanta poarta ACTIUNEA. Vezi DESIGN §9 regula 9.
const CULOARE: Record<number, number> = {
  [StareSapat.ULTIMA_CELULA]: 0xe0c060,
  [StareSapat.CADE]: 0xd05040,
}
const CULOARE_PREVIZ = 0xff8030
/**
 * Imposibil de zidit. Nuanta e RECE, si deliberat departe de restul paletei:
 * celelalte trei stari sunt despre ce CADE, asta e despre ce nu se poate pune.
 * Actiunea ceruta jucatorului e alta — muta piesa, sau ridica intai ceva sub ea.
 */
const CULOARE_IMPOSIBIL = 0xb060d0

/** Conturul de stare umple celula; cel de previzualizare sta INAUNTRUL lui. */
const INSET_STARE = 0.08
const INSET_PREVIZ = 0.26
/** Intre ele, ca sa se poata citi si cand o celula e si imposibila si previzualizata. */
const INSET_IMPOSIBIL = 0.17

/**
 * Reconstruieste overlay-ul pentru nivelul activ.
 *
 * `zActiv` e cota pe care se JUDECA (ultimul nivel vizibil intreg), sau `null`
 * cand slice view-ul e oprit si nu exista un nivel activ de judecat.
 */
export function rebuildStabilityOverlay(
  o: StabilityOverlay,
  w: World,
  rules: Rules,
  zActiv: number | null,
  cx: number,
  cy: number,
  raza: number,
): void {
  goleste(o.group)
  o.sigur = 0
  o.ultima = 0
  o.cade = 0
  o.previzualizate = 0
  o.imposibile = 0
  o.scanate = 0
  o.piedica = ''
  if (!o.visible) return
  if (zActiv === null) {
    o.piedica = 'stabilitatea cere slice view (Q/E/R)'
    return
  }

  const pozitii: number[] = []
  const culori: number[] = []
  const lat = 2 * raza + 1
  const x0 = cx - raza
  const y0 = cy - raza

  // --- prefiltru: cat de departe e cel mai apropiat AER ---
  //
  // Scanarea scumpa (`stareSapat`) costa ~19 µs pe celula, deci fereastra intreaga
  // ar fi 21 ms la raza 16 — un cadru pierdut. Dar o celula ingropata adanc in
  // roca nu poate fi nici CADE nici ULTIMA CELULA: ca sa conteze, trebuie sa aiba
  // gol la cel mult `suportMax` pasi, fiindca doar atat se intinde discul care i-ar
  // schimba suportul. Deci se calculeaza intai distanta Manhattan pana la primul
  // aer (doua treceri peste fereastra, O(celule)), si abia apoi se plateste scump
  // acolo unde poate conta. In roca netulburata: zero apeluri scumpe.
  const MARE = 9999
  const dist = new Int32Array(lat * lat).fill(MARE)
  const solidAici = new Uint8Array(lat * lat)
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lat; j++) {
      const k = i * lat + j
      const solidJos = solLa(w.terrain, x0 + i, y0 + j, zActiv) === Sol.SOLID
      const solidSus = solLa(w.terrain, x0 + i, y0 + j, zActiv + 1) === Sol.SOLID
      solidAici[k] = solidJos ? 1 : 0
      if (!solidJos || !solidSus) dist[k] = 0
      // Marginea ferestrei nu stie ce e dincolo de ea: se trateaza ca „poate fi
      // aer", ca sa nu ratam o celula periculoasa fiindca am privit prea ingust.
      else if (i === 0 || j === 0 || i === lat - 1 || j === lat - 1) dist[k] = rules.suportMax
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lat; j++) {
      const k = i * lat + j
      if (i > 0 && dist[k - lat]! + 1 < dist[k]!) dist[k] = dist[k - lat]! + 1
      if (j > 0 && dist[k - 1]! + 1 < dist[k]!) dist[k] = dist[k - 1]! + 1
    }
  }
  for (let i = lat - 1; i >= 0; i--) {
    for (let j = lat - 1; j >= 0; j--) {
      const k = i * lat + j
      if (i < lat - 1 && dist[k + lat]! + 1 < dist[k]!) dist[k] = dist[k + lat]! + 1
      if (j < lat - 1 && dist[k + 1]! + 1 < dist[k]!) dist[k] = dist[k + 1]! + 1
    }
  }

  // --- scanarea propriu-zisa, doar unde prefiltrul o cere ---
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lat; j++) {
      const k = i * lat + j
      if (solidAici[k] === 0) continue
      if (dist[k]! > rules.suportMax) { o.sigur++; continue }
      o.scanate++
      const stare = stareSapat(w.terrain, rules, x0 + i, y0 + j, zActiv)
      if (stare === StareSapat.SIGUR || stare === StareSapat.NIMIC) { o.sigur++; continue }
      if (stare === StareSapat.ULTIMA_CELULA) o.ultima++
      else o.cade++
      patrat(pozitii, culori, x0 + i, y0 + j, zActiv + 0.96, INSET_STARE, CULOARE[stare]!)
    }
  }

  // --- ce s-ar prabusi daca s-ar sapa tot ce a cerut jucatorul ---
  //
  // Se calculeaza pe MULTIMEA desemnarilor, nu pe fiecare in parte: o pivnita de
  // 7x7 e 49 de comenzi, si niciuna dintre ele, luata singura, nu doboara nimic.
  const previz = prabusireaPrevizualizata(w, rules)
  o.previzualizate = previz.length
  for (const cheie of previz) {
    const c = decodeCell(cheie)
    if (Math.abs(c.wx - cx) > raza || Math.abs(c.wy - cy) > raza) continue
    // Proiectat pe nivelul activ: voxelul care cade e de obicei la z+1, adica
    // deasupra planului de taiere, deci la cota lui reala ar fi invizibil. Ce
    // conteaza pentru jucator e COLOANA care pierde un voxel.
    patrat(pozitii, culori, c.wx, c.wy, Math.min(c.z, zActiv) + 0.98, INSET_PREVIZ, CULOARE_PREVIZ)
  }

  // --- ce nu se poate zidi, NICIODATA ---
  //
  // Se deseneaza DOAR `imposibile`, nu si `construibile`, din acelasi motiv
  // pentru care „sigur" ramane nedesenat mai sus: o casa de 177 de piese ar
  // acoperi ecranul cu contururi, si ar ingropa exact cele cateva care conteaza.
  // Iar „imposibil" e ACTIONABIL — e singura stare la care jucatorul are ce face.
  //
  // Raspunsul se ia pe MULTIMEA desemnarilor, ca punct fix: o piesa sprijinita de
  // alta piesa desenata e construibila, desi singura n-ar fi. Costul, masurat:
  // 0,19 ms la 177 de piese si 6,3 ms la 1231, iar overlay-ul se reconstruieste o
  // data la 30 de cadre — deci ~0,2 ms amortizat, fara memoizare.
  // CONTORUL e global, DESENUL e in fereastra de +-16 celule din jurul focusului —
  // la fel ca previzualizarea de prabusire de mai sus, si din acelasi motiv. Deci
  // HUD-ul poate spune „6 piese NU se pot zidi" cand se vede una singura. Verificat
  // pe ecran: mutand camera, celelalte cinci apar. Daca vreodata deranjeaza, leacul
  // e sa spuna cate se vad DIN cate, nu sa se taie numarul global.
  const constr = constructiaPrevizualizata(w, rules)
  o.imposibile = constr.imposibile.length
  for (const cheie of constr.imposibile) {
    const c = decodeCell(cheie)
    if (Math.abs(c.wx - cx) > raza || Math.abs(c.wy - cy) > raza) continue
    // Ca la previzualizarea de prabusire: proiectat pe nivelul activ daca piesa e
    // deasupra planului de taiere, altfel n-ar fi vizibila deloc.
    patrat(pozitii, culori, c.wx, c.wy, Math.min(c.z, zActiv) + 0.94, INSET_IMPOSIBIL, CULOARE_IMPOSIBIL)
  }

  if (pozitii.length === 0) return
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pozitii), 3))
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(culori), 3))
  o.group.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, depthTest: false })))
}

/** Conturul unei celule, ca patru segmente. Coordonatele viewerului sunt (x, z, y). */
function patrat(pozitii: number[], culori: number[], wx: number, wy: number, z: number, inset: number, hex: number): void {
  const r = ((hex >> 16) & 255) / 255
  const g = ((hex >> 8) & 255) / 255
  const b = (hex & 255) / 255
  const lo = inset
  const hi = 1 - inset
  const colturi: readonly (readonly [number, number])[] = [[lo, lo], [hi, lo], [hi, hi], [lo, hi]]
  for (let i = 0; i < 4; i++) {
    const a = colturi[i]!
    const c = colturi[(i + 1) % 4]!
    pozitii.push(wx + a[0], z, wy + a[1], wx + c[0], z, wy + c[1])
    culori.push(r, g, b, r, g, b)
  }
}
