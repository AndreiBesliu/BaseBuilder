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
 *
 * ## Feliat pe cadre, de la grinda
 *
 * Langa o grinda, o trecere intreaga costa secunde (masurat: 3,2 s intr-o sala 23×23
 * cu 4 grinzi, 5,6 s sub un tavan numai din grinzi, fata de ~26 ms fara ele), iar
 * viewer-ul o reface la fiecare 30 de cadre. Scanarea sta acum in
 * `scanare-stabilitate.ts`, fara THREE si cu test: `pornesteStabilitate` cere o
 * trecere, `avanseazaStabilitate` o avanseaza cu un buget pe cadru, iar la capat
 * `redeseneazaStabilitate` o deseneaza. Pana atunci ramane desenul vechi.
 */

import * as THREE from 'three'
import type { World } from '../src/sim/state.ts'
import type { Rules } from '../src/sim/content.ts'
import { decodeCell } from '../src/sim/path.ts'
import { StareSapat } from '../src/sim/stabilitate.ts'
import { constructiaPrevizualizata, prabusireaPrevizualizata } from '../src/sim/joburi.ts'
import { avanseazaScanare, ceFacCuTrecerea, pornesteScanare, Trecere } from './scanare-stabilitate.ts'
import type { Scanare } from './scanare-stabilitate.ts'

export interface StabilityOverlay {
  readonly group: THREE.Group
  visible: boolean
  /** Cate celule de pe nivelul activ sunt in fiecare stare, la ultima trecere TERMINATA. Pentru HUD. */
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
  /** Trecerea in curs, feliata pe cadre; `null` = nicio trecere. */
  scanare: Scanare | null
  /** Ultima trecere TERMINATA: ea se deseneaza. */
  ultimaScanare: Scanare | null
}

export function createStabilityOverlay(): StabilityOverlay {
  const group = new THREE.Group()
  group.visible = false
  return {
    group, visible: false, sigur: 0, ultima: 0, cade: 0, previzualizate: 0, imposibile: 0, scanate: 0, piedica: '',
    scanare: null, ultimaScanare: null,
  }
}

function goleste(group: THREE.Group): void {
  for (const child of [...group.children]) {
    group.remove(child)
    const m = child as THREE.Mesh | THREE.LineSegments
    m.geometry.dispose()
    ;(m.material as THREE.Material).dispose()
  }
}

/** Sterge desenul si cifrele: nimic judecat pentru intrebarea de acum. */
function uita(o: StabilityOverlay): void {
  goleste(o.group)
  o.ultimaScanare = null
  o.sigur = 0
  o.ultima = 0
  o.cade = 0
  o.previzualizate = 0
  o.imposibile = 0
  o.scanate = 0
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
 * Cere o trecere pentru nivelul activ. Scanarea o face `avanseazaStabilitate`, cate
 * putin pe cadru; pana termina, ramane pe ecran desenul trecerii anterioare — daca
 * intreba acelasi lucru. Altfel (alt nivel, alt focus) se sterge pe loc: patrate de
 * la alta cota ar sta, taiate sau nu, peste teren care nu mai e cel judecat.
 *
 * Trecerea DIN CURS nu se reporneste pentru aceeasi intrebare: pornita la fiecare 30
 * de cadre, o trecere de cateva sute de cadre n-ar ajunge niciodata la capat.
 *
 * `zActiv` e cota pe care se JUDECA (ultimul nivel vizibil intreg), sau `null`
 * cand slice view-ul e oprit si nu exista un nivel activ de judecat.
 */
export function pornesteStabilitate(
  o: StabilityOverlay,
  w: World,
  rules: Rules,
  zActiv: number | null,
  cx: number,
  cy: number,
  raza: number,
): void {
  if (!o.visible) {
    o.scanare = null
    uita(o)
    return
  }
  if (zActiv === null) {
    o.scanare = null
    uita(o)
    o.piedica = 'stabilitatea cere slice view (Q/E/R)'
    return
  }
  o.piedica = ''
  const d = ceFacCuTrecerea(o.scanare, o.ultimaScanare, w.terrain, zActiv, cx, cy, raza)
  if (d === Trecere.CONTINUA || d === Trecere.GATA) return
  if (d === Trecere.UITA_SI_PORNESTE) uita(o)
  o.scanare = pornesteScanare(w, rules, zActiv, cx, cy, raza)
  // Fara desen vechi pentru intrebarea asta, previzualizarile ieftine (violet si portocaliu)
  // se deseneaza ACUM, nu la capatul trecerii scumpe (recenzia, V2: ~450 de cadre fara ele
  // langa grinzi, cu HUD-ul aratand „ultima-celula 0 cade 0").
  if (o.ultimaScanare === null) redeseneazaStabilitate(o, w, rules)
}

/** Avanseaza trecerea din curs cu cel mult `bugetMs` de lucru (plus celula din curs); la capat, o deseneaza. */
export function avanseazaStabilitate(o: StabilityOverlay, w: World, rules: Rules, bugetMs: number): void {
  if (!o.visible || o.scanare === null) return
  if (!avanseazaScanare(o.scanare, w, rules, () => performance.now(), bugetMs)) return
  o.ultimaScanare = o.scanare
  o.scanare = null
  redeseneazaStabilitate(o, w, rules)
}

/** Cat din trecerea in curs s-a facut, 0..1; `null` fara trecere. Pentru HUD. */
export function progresStabilitate(o: StabilityOverlay): number | null {
  return o.scanare === null ? null : o.scanare.cursor / o.scanare.filtru.length
}

/**
 * Deseneaza ultima trecere TERMINATA, plus cele doua previzualizari pe desemnarile de
 * ACUM. Fara `stareSapat`, deci ieftin: se cheama si cand s-au schimbat doar
 * desemnarile — o piesa desenata isi vede pe loc eticheta de „imposibil". Fara o trecere
 * terminata se deseneaza doar previzualizarile, pentru intrebarea trecerii din curs;
 * patratele de stare vin la capatul ei.
 */
export function redeseneazaStabilitate(o: StabilityOverlay, w: World, rules: Rules): void {
  const s = o.ultimaScanare
  // Cand exista amandoua, sunt aceeasi intrebare: `pornesteStabilitate` o uita pe cea veche altfel.
  const q = s ?? o.scanare
  if (!o.visible || q === null) return
  goleste(o.group)
  const { zActiv, cx, cy, raza } = q
  const pozitii: number[] = []
  const culori: number[] = []

  if (s !== null) {
    o.sigur = s.sigur
    o.ultima = s.ultima
    o.cade = s.cade
    o.scanate = s.scanate
    for (let i = 0; i < s.marcate.length; i += 3) {
      patrat(pozitii, culori, s.marcate[i]!, s.marcate[i + 1]!, zActiv + 0.96, INSET_STARE, CULOARE[s.marcate[i + 2]!]!)
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
