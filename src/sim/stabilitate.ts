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
 *
 * ## Grinda: surse STRATIFICATE (taietura 4)
 *
 * DESIGN §5.2: „grinda reintroduce un punct de sprijin cu raza 10". Tot ca
 * definitie, pe doua niveluri, fara nicio recurenta:
 *
 *     s0(c) = max(0, suportMax − d0(c))           (neschimbat)
 *     grinda ACTIVA  ⇔  material GRINDA si s0 > 0 (nu se tin una pe alta)
 *     s1(c) = max(0, suportRazaGrinda − d1(c))    d1 = pasi prin SOLID pana la o grinda activa
 *     suport(c) = max(s0(c), s1(c))
 *
 * `s0` depinde doar de teren, activitatea doar de `s0`, `s1` doar de activitate: punct
 * fix unic, verificat de panoul grinzii cu un oracol pe 300 de multimi × 4 ordini, 0
 * diferente. Monotona: a adauga un voxel poate doar scadea `d0`/`d1` si activa grinzi,
 * deci inchiderea de constructie ramane unica. Cele trei variante nestratificate le-a
 * masurat panoul taieturii 2 (o grinda aruncata in cer tinea o fortareata; alta pierdea
 * punctul fix unic).
 *
 * **Raza e a GRINZII, nu a rezolvatorului.** Prima amanare a grinzii (taietura 2) a
 * venit din costul razei globale: cu o singura grinda pe harta, oricat de departe,
 * previzualizarea 9×9 urca de la 9,4 la 404,8 ms. Aici `s1` se cauta doar printre
 * grinzile din index la cel mult `suportRazaGrinda − 1` de celula; fara niciuna,
 * interogarea costa cat inainte plus cateva `Map.get`.
 */

import type { Rules } from './content.ts'
import type { Outcome } from './result.ts'
import { accept, refuse, Reason } from './result.ts'
import { cellKey, decodeCell, decodeCellIn } from './path.ts'
import type { Celula } from './path.ts'
import { materialFast } from './regions.ts'
import { adaugaGrinda, bazaVoxeli, grinziInRaza, WORLD_CELLS } from './terrain/terrain.ts'
import type { IndexGrinzi, Terrain } from './terrain/terrain.ts'
import { isSolid, Material, VOXEL_LEVELS } from './terrain/chunk.ts'

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
export function solLa(
  t: Terrain,
  wx: number,
  wy: number,
  z: number,
  cazute: ReadonlySet<number> | null = null,
  zidite: ReadonlySet<number> | null = null,
): number {
  if (wx < 0 || wy < 0 || wx >= WORLD_CELLS || wy >= WORLD_CELLS) return Sol.ANCORA
  const baza = bazaVoxeli(t, wx, wy)
  if (z < baza) return Sol.ANCORA
  if (z >= baza + VOXEL_LEVELS) return Sol.AER
  if (cazute !== null && cazute.has(cellKey(wx, wy, z))) return Sol.AER
  // Canalul IPOTETIC, oglinda lui `cazute`: celule pe care intrebarea le trateaza
  // ca zidite desi terenul le are goale. Se citeste DUPA fereastra de voxeli si
  // dupa `cazute` — o piesa planificata in afara ferestrei nu devine posibila
  // fiindca a planificat-o cineva.
  if (zidite !== null && zidite.has(cellKey(wx, wy, z))) return Sol.SOLID
  return isSolid(materialFast(t, wx, wy, z)) ? Sol.SOLID : Sol.AER
}

/** Se sprijina voxelul direct pe ceva? Ancora si solidul de dedesubt conteaza la fel. */
export function esteAsezat(
  t: Terrain,
  wx: number,
  wy: number,
  z: number,
  cazute: ReadonlySet<number> | null = null,
  zidite: ReadonlySet<number> | null = null,
): boolean {
  if (solLa(t, wx, wy, z, cazute, zidite) !== Sol.SOLID) return false
  const sub = solLa(t, wx, wy, z - 1, cazute, zidite)
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
 * Suportul unui voxel, EXACT: `max(s0, s1)` — vezi antetul.
 *
 * 0 pentru ce nu e solid — nu e nimic de sustinut. `s0 = suportMax` pentru un voxel
 * asezat, dintr-o singura citire; pentru restul, BFS lateral prin SOLID pana la primul
 * asezat, marginit la `suportMax` pasi. Iar `s1` din grinzile active din raza.
 *
 * Ordinea de explorare e fixa, dar rezultatul nu depinde de ea — BFS-ul da distanta
 * minima, care e o proprietate a terenului.
 *
 * Valoarea e cea din definitie, nu o scurtatura: panoul a semnalat ca o varianta care
 * se oprea la `s0 > 0` dadea alta cifra decat definitia langa grinzi — capcana in care
 * `stareSapat` a mintit o data, la taietura 1. Cine are nevoie doar de „cade?" sau de
 * „e ultima?" foloseste `suportPanaLa`, cu plafon.
 */
export function suportLa(t: Terrain, rules: Rules, wx: number, wy: number, z: number, cazute: Set<number> | null = null): number {
  return suportPanaLa(t, rules, wx, wy, z, cazute === null ? FARA_IPOTEZA : { ...FARA_IPOTEZA, cazute }, Infinity)
}

/**
 * BFS-ul lateral propriu-zis, fara nicio presupunere despre celula de PLECARE.
 *
 * Sta separat fiindca are DOI apelanti care difera exact prin celula aia:
 * `suportLa` intreaba despre un voxel care exista, `suportDacaZidesc` despre unul
 * care inca nu. Scris de doua ori, s-ar desincroniza la prima schimbare de
 * regula — si regula asta s-a schimbat deja o data, la recenzie.
 */
function caveazaSpreAsezat(
  t: Terrain,
  rules: Rules,
  wx: number,
  wy: number,
  z: number,
  cazute: ReadonlySet<number> | null,
  zidite: ReadonlySet<number> | null = null,
): number {
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
      if (solLa(t, nx, ny, z, cazute, zidite) !== Sol.SOLID) continue
      const cheie = cellKey(nx, ny, z)
      if (vazute.has(cheie)) continue
      vazute.add(cheie)
      // Primul asezat gasit e la distanta minima: BFS pe muchii de cost 1.
      //
      // `max(0, ...)` nu e de prisos, desi plafonul de mai sus pare sa-l faca
      // imposibil de atins: cele doua sunt aceeasi garantie scrisa de doua ori,
      // si exact UNA dintre ele tine raspunsul pozitiv la un moment dat. Fara
      // niciuna, un tavan la 5 pasi da −1 — care nu e nici 0, nici 1, deci
      // `stareSapat` raspunde SIGUR exact acolo unde e cel mai periculos.
      if (esteAsezat(t, nx, ny, z, cazute, zidite)) return Math.max(0, rules.suportMax - (d + 1))
      coadaX.push(nx)
      coadaY.push(ny)
      coadaD.push(d + 1)
    }
  }
  return 0
}

// ---------------------------------------------------------------------------
// grinda — surse stratificate
// ---------------------------------------------------------------------------

/**
 * Ipoteza unei intrebari despre stabilitate: ce se trateaza ca AER (`cazute`), ce ca
 * ZIDIT (`zidite`), care dintre cele zidite sunt GRINZI planificate (`grinziPlan`), si
 * memoria activitatii grinzilor (`activ`).
 */
interface Ipoteza {
  readonly cazute: ReadonlySet<number> | null
  readonly zidite: ReadonlySet<number> | null
  readonly grinziPlan: IndexGrinzi | null
  /**
   * TRANSIENT, cat tine o intrebare: cellKey(grinda) → activa, si „activa" si „inactiva".
   * O tine si o invalideaza cine o creeaza, la fiecare schimbare a ipotezei, pentru
   * grinzile la cel mult `suportMax − 1` de celula schimbata, la z si z+1 — singurele a
   * caror activitate se poate schimba: `propaga` la fiecare cadere, `constructiaPosibila`
   * la fiecare zidire.
   *
   * Masurat de panou de ce trebuie: fara ea, activitatea se calcula cu cate un BFS
   * pentru fiecare grinda candidata, la fiecare interogare — sub un tavan 21×21 numai
   * din grinzi, 160 de candidati pe interogare si 215–246 ms pe o singura sapatura.
   */
  readonly activ: Map<number, boolean> | null
}

const FARA_IPOTEZA: Ipoteza = { cazute: null, zidite: null, grinziPlan: null, activ: null }

/**
 * TRANSIENT: ce a costat stabilitatea, pentru bugetele din teste si din DEVLOG. Nu
 * intra in hash si nu decide nimic.
 */
export const contoareStabilitate = {
  /** Interogari `s1` care au avut macar o grinda candidata in raza. */
  interogariS1: 0,
  /** Calcule de activitate (BFS `s0` pe o grinda), fara cele luate din memorie. */
  activitati: 0,
  /** Celule verificate de `propaga`. */
  verificari: 0,
}

export function reseteazaContoareStabilitate(): void {
  contoareStabilitate.interogariS1 = 0
  contoareStabilitate.activitati = 0
  contoareStabilitate.verificari = 0
}

/**
 * E GRINDA IN PICIOARE la (x, y, z), in ipoteza? Solida si de material GRINDA — nu
 * doar solida: o intrare veche din index ar fi devenit altfel grinda-fantoma, adica
 * fizica diferita intre lumea continua si cea incarcata (masurat de panou: 9 celule
 * zidite peste limita, si 9 plutitori intr-o singura lume). Una PLANIFICATA e grinda
 * doar dupa ce ipoteza a zidit-o.
 */
function grindaInPicioare(t: Terrain, x: number, y: number, z: number, ip: Ipoteza, dinPlan: boolean): boolean {
  if (solLa(t, x, y, z, ip.cazute, ip.zidite) !== Sol.SOLID) return false
  if (dinPlan) return ip.zidite !== null && ip.zidite.has(cellKey(x, y, z))
  return materialFast(t, x, y, z) === Material.GRINDA
}

/** `s0 > 0` pentru celula solida (x, y, z), in ipoteza — fara memorie. */
function s0Pozitiv(t: Terrain, rules: Rules, x: number, y: number, z: number, ip: Ipoteza): boolean {
  contoareStabilitate.activitati++
  if (esteAsezat(t, x, y, z, ip.cazute, ip.zidite)) return true
  return caveazaSpreAsezat(t, rules, x, y, z, ip.cazute, ip.zidite) > 0
}

/** Grinda (x, y, z), deja stiuta IN PICIOARE, e activa? Prin memoria ipotezei, daca are. */
function activa(t: Terrain, rules: Rules, x: number, y: number, z: number, ip: Ipoteza): boolean {
  const k = cellKey(x, y, z)
  const m = ip.activ?.get(k)
  if (m !== undefined) return m
  const a = s0Pozitiv(t, rules, x, y, z, ip)
  if (ip.activ !== null) ip.activ.set(k, a)
  return a
}

// Tampoane reusite. `candidati` tine perechi (x, y); `inPicioare` sunt candidatii care
// chiar stau acum, in ipoteza (din teren sau din plan — o celula poate fi in ambele).
// BFS-ul lui `s1` are coada lui, separata de a lui `caveazaSpreAsezat`, pe care o
// foloseste activitatea — cele doua se intercaleaza, deci nu pot imparti tampoane.
const candidati: number[] = []
const inPicioare = new Set<number>()
const coada1X: number[] = []
const coada1Y: number[] = []
const coada1D: number[] = []
const vazute1 = new Set<number>()

/** Celula `k` = (x, y, z) e o grinda candidata IN PICIOARE si ACTIVA? Activitatea, doar la nevoie. */
function candidatActiv(t: Terrain, rules: Rules, x: number, y: number, z: number, k: number, ip: Ipoteza): boolean {
  return inPicioare.has(k) && activa(t, rules, x, y, z, ip)
}

/**
 * `s1(c)`: `suportRazaGrinda − d1`, cu `d1` pasii prin SOLID (la cota lui c) pana la
 * cea mai apropiata grinda ACTIVA; 0 daca nu e niciuna in raza.
 *
 * Candidatii vin din index (si din grinzile planificate ale ipotezei), la distanta
 * Manhattan cel mult `suportRazaGrinda − 1` — o margine inferioara a drumului, deci
 * niciun candidat pierdut. Fara candidati, raspunsul e 0 fara niciun BFS.
 *
 * ## Activitatea, LENES
 *
 * Doar pentru grinzile pe care le ATINGE BFS-ul, in ordinea lui, pana la prima activa.
 * Acelasi raspuns ca „activitatea tuturor candidatilor, apoi BFS": BFS-ul e acelasi (nu
 * depinde de activitate decat prin oprire), viziteaza in ordinea distantei, si orice
 * celula vizitata e la Manhattan ≤ `suportRazaGrinda − 1`, deci e candidata daca e
 * grinda. Prima vizitata activa e deci cea de la `d1` minim, in ambele forme.
 *
 * Masurat de lentila de cost (recenzia taieturii 4): o grinda departe de zid e inactiva,
 * iar varianta cu toti candidatii ii calcula activitatea pentru fiecare santier din raza
 * ei — si pentru cele fara niciun vecin solid, la care BFS-ul nu pleaca nicaieri. Pe o
 * podea din grinzi cu centrul imposibil, 70–180 de BFS-uri `s0` per santier refuzat.
 */
function suportDinGrinzi(t: Terrain, rules: Rules, wx: number, wy: number, z: number, ip: Ipoteza): number {
  const R = rules.suportRazaGrinda
  candidati.length = 0
  grinziInRaza(t.grinzi, wx, wy, z, R - 1, candidati)
  const dinTeren = candidati.length
  if (ip.grinziPlan !== null) grinziInRaza(ip.grinziPlan, wx, wy, z, R - 1, candidati)
  if (candidati.length === 0) return 0
  contoareStabilitate.interogariS1++
  // Iesirea timpurie a formei de dinainte, pastrata: daca nicio candidata nu STA, sau
  // toate cele care stau sunt deja stiute inactive, raspunsul e 0 fara BFS. Fara ea, forma
  // lenesa facea BFS-ul de raza 9 si cand nu avea ce gasi (masurat de verificatorul COST-2:
  // pe o grila de grinzi planificate la 5, 0 -> 1.226 de BFS-uri pe apel).
  inPicioare.clear()
  let deIncercat = false
  for (let i = 0; i < candidati.length; i += 2) {
    const x = candidati[i]!
    const y = candidati[i + 1]!
    if (!grindaInPicioare(t, x, y, z, ip, i >= dinTeren)) continue
    const k = cellKey(x, y, z)
    inPicioare.add(k)
    if (ip.activ?.get(k) !== false) deIncercat = true
  }
  if (!deIncercat) return 0
  const k0 = cellKey(wx, wy, z)
  if (candidatActiv(t, rules, wx, wy, z, k0, ip)) return R

  vazute1.clear()
  coada1X.length = 0
  coada1Y.length = 0
  coada1D.length = 0
  coada1X.push(wx)
  coada1Y.push(wy)
  coada1D.push(0)
  vazute1.add(k0)
  for (let cap = 0; cap < coada1X.length; cap++) {
    const x = coada1X[cap]!
    const y = coada1Y[cap]!
    const d = coada1D[cap]!
    if (d >= R - 1) continue
    for (const [dx, dy] of DIRECTII) {
      const nx = x + dx
      const ny = y + dy
      if (solLa(t, nx, ny, z, ip.cazute, ip.zidite) !== Sol.SOLID) continue
      const cheie = cellKey(nx, ny, z)
      if (vazute1.has(cheie)) continue
      vazute1.add(cheie)
      if (candidatActiv(t, rules, nx, ny, z, cheie, ip)) return R - (d + 1)
      coada1X.push(nx)
      coada1Y.push(ny)
      coada1D.push(d + 1)
    }
  }
  return 0
}

/**
 * `min(suport, plafon)`, cu scurtaturile pe care le permite plafonul: daca `s0` il
 * atinge deja, `s1` nu se mai calculeaza. `propaga` cere plafonul 2 — pentru „cade?"
 * si pentru „e ultima celula?" conteaza doar 0, 1 si „cel putin 2".
 */
function suportPanaLa(t: Terrain, rules: Rules, wx: number, wy: number, z: number, ip: Ipoteza, plafon: number): number {
  if (solLa(t, wx, wy, z, ip.cazute, ip.zidite) !== Sol.SOLID) return 0
  const s0 = esteAsezat(t, wx, wy, z, ip.cazute, ip.zidite)
    ? rules.suportMax
    : caveazaSpreAsezat(t, rules, wx, wy, z, ip.cazute, ip.zidite)
  if (s0 >= plafon) return plafon
  return Math.min(plafon, Math.max(s0, suportDinGrinzi(t, rules, wx, wy, z, ip)))
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
 *
 * ## Garda de margine se pune AICI, si nicaieri mai jos
 *
 * `cellKey` e pozitional pe baza `WORLD_CELLS` si NU e injectiv in afara lumii:
 * `cellKey(-1, y, z)` e bit cu bit acelasi numar cu `cellKey(WORLD_CELLS - 1,
 * y - 1, z)`. Fara garda, discul de la marginea de vest emite chei care
 * DECODEAZA in celule perfect valide de la marginea de est, iar `cadeDaca` le
 * evalueaza si le poate prabusi. Masurat: o sapatura la (0, 624, 25) sterge o
 * roca de la (16383, 623, 25) — 16 km — si muta hash-ul lumii (48d4c8fa →
 * 3dae6bd4). 18 din cele 50 de chei erau gresite.
 *
 * Garda din `solLa` era corecta si nu ajuta cu nimic: nimeni n-o intreba.
 * Dupa `cellKey`, informatia „era in afara lumii" nu mai exista in cheie — deci
 * singurul loc in care se poate taia e inainte de ea: in `disc`, UNA pentru toate
 * discurile, si ale grinzii. BFS-ul din `suportLa` e deja in siguranta: intreaba
 * `solLa(nx, ny, z)` INAINTE sa construiasca cheia.
 *
 * Discurile GRINZII (raza `suportRazaGrinda − 1`) le emite `propaga`, fiindca au
 * nevoie de terenul, de indexul si de ipoteza de DINAINTEA editarii — vezi acolo.
 */
export function celuleAtinse(rules: Rules, wx: number, wy: number, z: number, out: number[]): void {
  const raza = rules.suportMax - 1
  for (const dz of [0, 1]) disc(wx, wy, z + dz, raza, out)
}

/** Discul Manhattan de raza `raza` in jurul lui (wx, wy), la cota z, TAIAT la lume. */
function disc(wx: number, wy: number, z: number, raza: number, out: number[]): void {
  for (let dx = -raza; dx <= raza; dx++) {
    const nx = wx + dx
    if (nx < 0 || nx >= WORLD_CELLS) continue
    const rest = raza - Math.abs(dx)
    for (let dy = -rest; dy <= rest; dy++) {
      const ny = wy + dy
      if (ny < 0 || ny >= WORLD_CELLS) continue
      out.push(cellKey(nx, ny, z))
    }
  }
}

/**
 * Multimea voxelilor care cad dupa o editare la (wx, wy, z), ca punct fix.
 *
 * Multimea NU depinde de ordinea in care se descopera (nici de ordinea SEMINTELOR, la
 * `cadeDaca` cu mai multe — pentru asta, starea „de dinainte" a unei samante se ia mereu
 * din terenul neatins, vezi `emiteGrinzi`): suportul unui voxel e
 * distanta pana la un voxel ASEZAT, iar „asezat" e o proprietate a terenului de
 * dedesubt. A scoate un voxel poate doar sa SCADA suportul altuia, niciodata
 * sa-l creasca — deci procesul e monoton si are un singur punct fix.
 *
 * Ordinea din tabloul intors e (z crescator, apoi wx, apoi wy). z crescator
 * fiindca fundul trebuie sa cada inaintea a ce sta pe el; iar ordinea conteaza
 * la APLICARE, nu la calcul: panoul a masurat ca doua depuneri identice in
 * ordine diferita dau hash diferit (fb48760e vs 8ff179be), fiindca `creeazaItem`
 * ia primul slot liber si hash-ul parcurge itemele in ordinea slotului.
 *
 * Sortarea face garantia EXPLICITA, nu o creeaza: ordinea de descoperire e deja
 * crescatoare pe z, fiindca o celula de la z+2 nu e niciodata in multimea
 * initiala — `celuleAtinse` acopera doar z si z+1 — deci ajunge acolo doar prin
 * cascada, adica dupa ce a cazut ceva de la z+1. Masurat: scoasa sortarea, hash
 * identic pe patru fixturi. Ramane fiindca proprietatea aia e un accident al
 * cascadei, si accidentele se strica tacut.
 */
export function multimeaCareCade(t: Terrain, rules: Rules, wx: number, wy: number, z: number): number[] {
  return cadeDaca(t, rules, [cellKey(wx, wy, z)], false)
}

/**
 * Ce s-ar prabusi daca ar disparea TOATE celulele din `sapate`.
 *
 * Asta e forma de care are nevoie PREVIZUALIZAREA, si e motivul pentru care nu
 * se poate calcula pe o singura comanda. `desemneaza` e per celula: la o pivnita
 * de 7×7 sunt 49 de comenzi, fiecare evaluata pe lumea neatinsa, in care nicio
 * celula sapata singura nu doboara nimic. Panoul a masurat: **0 din 49** arata
 * vreun avertisment, iar tavanul crapa la sapatura 46 din 49 — a unui pion pe
 * care jucatorul nu-l urmarea. K07 in forma pura.
 *
 * `include` spune daca celulele sapate intra si ele in raspuns (la previzualizare
 * nu ne intereseaza: ele dispar oricum, prin sapat).
 */
/**
 * Nucleul comun: ce cade daca dispar `sapate`, SI cat de aproape de 0 ajunge ce
 * NU cade.
 *
 * Cele doua raspunsuri ies din aceeasi parcurgere fiindca sunt acelasi calcul:
 * `cadeDaca` are nevoie doar de primul, `stareSapat` de amandoua. Scrise separat,
 * s-ar desincroniza — si tocmai asta s-a intamplat in prima versiune, in care
 * `stareSapat` isi raspundea singur, uitandu-se doar la voxelul de deasupra.
 */
function propaga(t: Terrain, rules: Rules, sapate: readonly number[], laPrimaCadere = false): { cazute: Set<number>; minim: number } {
  const cazute = new Set<number>(sapate)
  const deVerificat: number[] = []
  // DEDUPLICAREA COZII, pe „in asteptare": o celula deja in coada si inca neverificata
  // nu se mai adauga. Sigur, fiindca va fi verificata oricum cu `cazute` la zi, dupa
  // orice cadere care ar fi re-adaugat-o; iar dupa ce e verificata, o cadere
  // ulterioara o poate re-adauga — re-verificarea ramane scopul cascadei. Punctul fix
  // nu se schimba (e unic), nici `minim` (ultima verificare a fiecarei celule vine
  // dupa ultima cadere care o atinge). Masurat de panou pe doi stalpi cu cate 5 etaje
  // si 40 de grinzi, cu o parte din structura ramasa in picioare: 12.971 de verificari
  // si ~650 ms fara ea, 1961 si ~60 ms cu ea.
  const inAsteptare = new Set<number>()
  const activ = new Map<number, boolean>()
  const ip: Ipoteza = { cazute, zidite: null, grinziPlan: null, activ }
  // UN obiect de decodare per apel, nu unul per iteratie.
  const c: Celula = { wx: 0, wy: 0, z: 0 }
  const cg: Celula = { wx: 0, wy: 0, z: 0 }
  const dinDisc: number[] = []
  const lista: number[] = []
  const R = rules.suportRazaGrinda
  const pune = (k: number): void => {
    if (inAsteptare.has(k)) return
    inAsteptare.add(k)
    deVerificat.push(k)
  }
  const discGrinda = (x: number, y: number, z: number): void => {
    dinDisc.length = 0
    disc(x, y, z, R - 1, dinDisc)
    for (const k of dinDisc) pune(k)
  }

  // Activitatea grinzilor de langa samante INAINTE de sapaturi — pe terenul neatins,
  // fara nicio ipoteza. Discul unei grinzi se emite doar daca activitatea ei CHIAR se
  // schimba: `s1` depinde doar de care grinzi sunt active, nu de cat `s0` au.
  const inainte = new Map<number, boolean>()
  for (const e of sapate) {
    decodeCellIn(e, cg)
    for (const dz of [0, 1]) {
      lista.length = 0
      grinziInRaza(t.grinzi, cg.wx, cg.wy, cg.z + dz, rules.suportMax - 1, lista)
      for (let i = 0; i < lista.length; i += 2) {
        const k = cellKey(lista[i]!, lista[i + 1]!, cg.z + dz)
        if (inainte.has(k) || !grindaInPicioare(t, lista[i]!, lista[i + 1]!, cg.z + dz, FARA_IPOTEZA, false)) continue
        inainte.set(k, s0Pozitiv(t, rules, lista[i]!, lista[i + 1]!, cg.z + dz, FARA_IPOTEZA))
      }
    }
  }

  /**
   * Ce trebuie re-verificat din cauza GRINZILOR cand dispare celula `k` (sapata sau
   * cazuta chiar acum). Trei cazuri, fiecare necesar (fara al doilea, 9 din 105
   * prabusiri de grinda gresite; fara al treilea, 39 din 105 — masurat de panou):
   *
   *  (a) `k` era ea insasi GRINDA: toate celulele tinute prin ea, discul ei. O data —
   *      o grinda cazuta mai devreme nu mai emite nimic;
   *  (b) grinzile IN PICIOARE la cel mult `suportMax − 1` de `k`, la z si z+1 — doar
   *      ale lor isi pot schimba activitatea — si doar daca activitatea CHIAR se schimba;
   *  (c) un drum spre o grinda activa putea trece prin `k`: discul lui `k`, daca exista
   *      o grinda activa in raza.
   *
   * Totul pe terenul DINAINTEA editarii: `k` e AER doar in ipoteza, materialul lui e
   * inca in teren, grinda e inca in index. Asta e contractul: a citi indexul DUPA
   * editare pierdea exact grinda sapata (defectul CRITIC al panoului, gasit de doua
   * lentile: 58 de voxeli ramasi in aer langa un stalp, cu previzualizarea spunand CADE).
   */
  const emiteGrinzi = (k: number, samanta: boolean): void => {
    decodeCellIn(k, cg)
    const x = cg.wx
    const y = cg.wy
    const z = cg.z
    if (materialFast(t, x, y, z) === Material.GRINDA) discGrinda(x, y, z)
    for (const dz of [0, 1]) {
      lista.length = 0
      grinziInRaza(t.grinzi, x, y, z + dz, rules.suportMax - 1, lista)
      for (let i = 0; i < lista.length; i += 2) {
        const bx = lista[i]!
        const by = lista[i + 1]!
        const bz = z + dz
        if (!grindaInPicioare(t, bx, by, bz, ip, false)) continue
        const kb = cellKey(bx, by, bz)
        // Starea de DINAINTE. Pentru o samanta, MEREU din `inainte`, nu din memorie: la
        // insamantare toate semintele sunt deja in `cazute`, deci memoria — umpluta, de
        // pilda, de discul (c) al unei seminte anterioare — are starea de DUPA; citita drept
        // „inainte", ascundea dezactivarea. Masurat de recenzie (26.09): previzualizarea pe
        // mai multe sapaturi depindea de ordinea desemnarilor, 34 din 21.278 de previzualizari
        // cu cadere gresite, pana la 14 celule lipsa — doar lipsuri, niciodata in plus.
        let anterior = samanta ? (inainte.get(kb) ?? false) : activ.get(kb)
        if (anterior === undefined) {
          // Starea dinaintea caderii lui `k`: `k` scos din ipoteza, o clipa.
          cazute.delete(k)
          anterior = s0Pozitiv(t, rules, bx, by, bz, ip)
          cazute.add(k)
        }
        // La insamantare `cazute` nu se schimba de la o samanta la alta, deci memoria ramane
        // valabila; se goleste doar dupa o CADERE. Golita la fiecare samanta, sub un tavan
        // dens de grinzi o pivnita desemnata de 21×21×2 facea 10.310 BFS-uri pentru 441 de
        // grinzi (acum 882).
        if (!samanta) activ.delete(kb)
        if (activa(t, rules, bx, by, bz, ip) !== anterior) discGrinda(bx, by, bz)
        // Discul (b) o singura data pe grinda la insamantare: samanta urmatoare de langa ea
        // vede starea de acum ca „inainte". Fara asta, fiecare samanta la <= 3 de o grinda
        // dezactivata re-emitea discul de 181 de celule (225 -> 5.625 de discuri, +25–45 ms).
        if (samanta) inainte.set(kb, activa(t, rules, bx, by, bz, ip))
      }
    }
    lista.length = 0
    grinziInRaza(t.grinzi, x, y, z, R - 1, lista)
    for (let i = 0; i < lista.length; i += 2) {
      if (!grindaInPicioare(t, lista[i]!, lista[i + 1]!, z, ip, false)) continue
      if (!activa(t, rules, lista[i]!, lista[i + 1]!, z, ip)) continue
      discGrinda(x, y, z)
      break
    }
  }

  // Seeding-ul: discul de suport al fiecarei samante, plus discurile grinzii. Discurile
  // a doua celule vecine se suprapun aproape complet (la o pivnita de 7x7, 49 de
  // discuri a cate 50 de celule peste ~200 distincte); coada deduplicata le strange.
  for (const cheie of sapate) {
    emiteGrinzi(cheie, true)
    decodeCellIn(cheie, c)
    dinDisc.length = 0
    celuleAtinse(rules, c.wx, c.wy, c.z, dinDisc)
    for (const k of dinDisc) pune(k)
  }

  let minim = rules.suportMax
  for (let i = 0; i < deVerificat.length; i++) {
    const cheie = deVerificat[i]!
    inAsteptare.delete(cheie)
    if (cazute.has(cheie)) continue
    decodeCellIn(cheie, c)
    if (solLa(t, c.wx, c.wy, c.z, cazute) !== Sol.SOLID) continue
    contoareStabilitate.verificari++
    const suport = suportPanaLa(t, rules, c.wx, c.wy, c.z, ip, 2)
    if (suport > 0) {
      if (suport < minim) minim = suport
      continue
    }
    cazute.add(cheie)
    // Cine intreaba doar „cade ceva?" (`stareSapat`) are raspunsul la prima cadere: `cazute`
    // doar creste, deci e CADE oricum ar continua cascada. Masurat de verificatorul COST-4:
    // baza unui stalp cu 8 etaje de placi tinute de grinzi, 43–49 ms -> sub 0,2 ms pe celula
    // de overlay; aceleasi raspunsuri pe 5.765 de celule din 6 fixturi.
    if (laPrimaCadere) return { cazute, minim }
    emiteGrinzi(cheie, false)
    // Ce cade poate lua cu el ce se sprijinea pe el: se re-verifica vecinatatea.
    dinDisc.length = 0
    celuleAtinse(rules, c.wx, c.wy, c.z, dinDisc)
    for (const k of dinDisc) pune(k)
  }
  return { cazute, minim }
}

export function cadeDaca(t: Terrain, rules: Rules, sapate: readonly number[], include = false): number[] {
  const { cazute } = propaga(t, rules, sapate)
  const sapateSet = include ? null : new Set(sapate)
  const chei = [...cazute].filter((k) => sapateSet === null || !sapateSet.has(k))
  chei.sort((a, b) => {
    const ca = decodeCell(a)
    const cb = decodeCell(b)
    return ca.z - cb.z || ca.wx - cb.wx || ca.wy - cb.wy
  })
  return chei
}

/**
 * Ce suport ar avea TAVANUL celulei (wx, wy, z) daca s-ar sapa celula.
 *
 * Asta e cifra pe care o vrea jucatorul, si nu e cea pe care o avea designul.
 * Overlay-ul desena suportul celulei ACTIVE: masurat pe o baza realista, **0%**
 * dintre voxelii nivelului activ au alta cifra decat 4, fiindca in roca
 * netulburata fiecare are solid dedesubt. Cifrele care conteaza sunt pe tavan,
 * adica pe nivelul pe care slice view-ul il taie. Vizualizatorul cerut de
 * DESIGN §5.2 s-ar fi livrat aratand nimic.
 */
/**
 * Ce suport ar avea celula (wx, wy, z) DACA s-ar zidi acolo. Oglinda lui
 * `suportDacaSap`.
 *
 * Nu e nevoie de un canal „ipotetic solid" ca `cazute`: BFS-ul lateral nu se uita
 * niciodata la celula de plecare, doar la vecinii ei. Singurul lucru care tine de
 * celula insasi e daca e ASEZATA — si aia se citeste direct, dintr-o citire.
 *
 * Pe o celula deja solida raspunde ce raspunde `suportLa`: nu se zideste nimic
 * acolo, deci intrebarea e despre ce EXISTA — inclusiv 0, daca blocul de acolo
 * chiar atarna in aer. Scurtcircuitul „nu se plaseaza nimic, deci nu intreba" sta
 * in POARTA, nu aici: o masuratoare care minte ca sa fie comoda nu mai e o
 * masuratoare.
 */
export function suportDacaZidesc(
  t: Terrain,
  rules: Rules,
  wx: number,
  wy: number,
  z: number,
  zidite: ReadonlySet<number> | null = null,
): number {
  // Intrebarea „e DEJA solida?" se pune TERENULUI, nu ipotezei. Cu `zidite` in ea,
  // o celula care tocmai a fost presupusa zidita intra pe ramura asta si apoi
  // pierde ipoteza — deci raspunde 0 pentru ceva ce tocmai am spus ca exista.
  // Inchiderea nu vede niciodata cazul (celula testata nu e inca in multime), dar
  // orice alt apelant il vede, si l-a vazut: prima versiune a testului de
  // supra-promisiune raporta 0 din 393.
  if (solLa(t, wx, wy, z) === Sol.SOLID) return suportLa(t, rules, wx, wy, z)
  return suportNouPanaLa(t, rules, wx, wy, z, { ...FARA_IPOTEZA, zidite }, Infinity)
}

/**
 * Suportul unei celule INCA NEZIDITE, daca s-ar zidi, cu plafon. Celula de plecare nu
 * conteaza pentru BFS-uri (se uita doar la vecini); singurul lucru care tine de ea
 * insasi e daca e ASEZATA.
 */
function suportNouPanaLa(t: Terrain, rules: Rules, wx: number, wy: number, z: number, ip: Ipoteza, plafon: number): number {
  const sub = solLa(t, wx, wy, z - 1, null, ip.zidite)
  const s0 = sub === Sol.SOLID || sub === Sol.ANCORA
    ? rules.suportMax
    : caveazaSpreAsezat(t, rules, wx, wy, z, null, ip.zidite)
  if (s0 >= plafon) return plafon
  return Math.min(plafon, Math.max(s0, suportDinGrinzi(t, rules, wx, wy, z, ip)))
}

/**
 * Poarta de PLASARE: se poate zidi ceva la (wx, wy, z)?
 *
 * Pana la ea, `fill` nu trecea deloc prin regula de stabilitate — deci se putea
 * zidi un bloc in aer curat, cu suport 0, care nu cadea niciodata. Adica
 * `suport(c) > 0` era un invariant FALS pe starea salvata, iar momentul in care
 * o piesa cade ajungea sa depinda de istoria editarilor, nu de teren.
 *
 * DESIGN §5.2 o numeste „verificare O(1) la plasare". Nu e O(1) si n-a fost
 * niciodata: e o citire pe calea asezata si un BFS de cel mult `suportMax` pasi
 * altfel. Masurat: 0,137 µs pe sol, 5,767 µs pe un refuz in centrul unei podele
 * de 9x9. Marginit, nu constant — propozitia din DESIGN s-a schimbat, nu regula.
 */
/**
 * Ce se poate construi din multimea `celule`, si ce nu — ORICUM ai lua-o.
 *
 * Fratele lui `cadeDaca`, si la fel ca el trebuie sa fie: un PUNCT FIX peste
 * multime, nu o verificare pe fiecare celula in parte. Panoul de design a masurat
 * de ce, in ambele feluri:
 *
 *  - **pe celula, la desenare:** o casa de 9x9 cu trei etaje si podea are 177 de
 *    celule, dintre care validatorul per-celula ar refuza **145 (82%)**, fiindca
 *    piesele care inca nu exista nu se sprijina reciproc. Cu adevarat imposibila e
 *    UNA. Jucatorul ar desena o casa si ar primi un ecran rosu;
 *  - **pe planul TERMINAT, dintr-o singura trecere:** pe 200 de planuri aleatoare,
 *    „suport > 0 daca umplu tot" a promis 85,8 celule din 112 in medie, dar
 *    incremental se puteau construi 64,5 — supra-promisiune in **200 din 200** de
 *    cazuri, cu un excedent maxim de 57 de celule.
 *
 * ## De ce raspunsul nu depinde de ordine
 *
 * Regula e MONOTONA: a adauga un voxel nu poate decat sa SCADA distantele pana la
 * un sprijin, niciodata sa le creasca. Deci „ce se poate construi" e o inchidere,
 * si inchiderea e unica. Asta nu e o presupunere comoda — e o garantie, si are
 * testul ei de proprietate: aceeasi multime, patru ordini diferite, acelasi
 * raspuns.
 *
 * Costul, masurat: 0,22 ms la 177 de piese, 3,97 ms la 2043. Se cheama la
 * mouse-up, nu la mouse-move.
 */
export function constructiaPosibila(
  t: Terrain,
  rules: Rules,
  celule: readonly number[],
  grinzi: readonly number[] = [],
): { construibile: number[]; imposibile: number[] } {
  const zidite = new Set<number>()
  // Grinzile PLANIFICATE ale multimii, ca index spatial — acelasi tip si aceeasi
  // cautare ca indexul din teren. Construit o data pe apel: ca multime plata, fiecare
  // interogare `s1` parcurgea toate grinzile planificate din lume (masurat de panou:
  // 400 de grinzi planificate intr-o alta cladire urcau inchiderea de la 15 la 20 ms,
  // 2000 la 35, cu acelasi raspuns).
  const plan: IndexGrinzi = new Map()
  const cg: Celula = { wx: 0, wy: 0, z: 0 }
  for (const k of grinzi) {
    decodeCellIn(k, cg)
    adaugaGrinda(plan, cg.wx, cg.wy, cg.z)
  }
  // Memoria activitatii tine si „activa" si „inactiva". O zidire nu dezactiveaza nicio
  // grinda, dar poate ACTIVA una: numai pe cele de la cel mult `suportMax − 1` de celula
  // zidita, la cota ei (drumul spre asezat trece prin ea) si la cota de deasupra (celula
  // de deasupra ei devine asezata). Acolo se sterg intrarile „inactiva", din ambele
  // indexuri. Demonstrat de verificatorul COST-2 si masurat: 900 de planuri contra
  // constructiei reale, 0 diferente, 0 raspunsuri invechite din 80.803 re-verificate.
  //
  // Fara memoria negativa, o grinda zidita dar inactiva (una din crucea sau randurile de
  // grinzi pe care le deseneaza un jucator care nu stie ca grinzile nu se tin una pe alta)
  // isi recalcula activitatea la fiecare interogare `s1`, la fiecare trecere: o podea de
  // 25×25 cu o cruce de grinzi, 126 ms la fiecare click; 41×41 pe trei etaje, secunde.
  const activ = new Map<number, boolean>()
  const ip: Ipoteza = { cazute: null, zidite, grinziPlan: grinzi.length > 0 ? plan : null, activ }
  const lista: number[] = []
  const cz: Celula = { wx: 0, wy: 0, z: 0 }
  const invalideaza = (k: number): void => {
    decodeCellIn(k, cz)
    for (const dz of [0, 1]) {
      for (const index of [t.grinzi, ip.grinziPlan]) {
        if (index === null) continue
        lista.length = 0
        grinziInRaza(index, cz.wx, cz.wy, cz.z + dz, rules.suportMax - 1, lista)
        for (let i = 0; i < lista.length; i += 2) {
          const kb = cellKey(lista[i]!, lista[i + 1]!, cz.z + dz)
          if (activ.get(kb) === false) activ.delete(kb)
        }
      }
    }
  }
  const ramase = new Set<number>(celule)
  // Celulele deja solide nu sunt „de construit": ies din multime de la inceput,
  // ca sa nu fie numarate nici construibile, nici imposibile.
  for (const cheie of ramase) {
    const c = decodeCell(cheie)
    if (solLa(t, c.wx, c.wy, c.z) === Sol.SOLID) ramase.delete(cheie)
  }

  // Punct fix: cat timp o trecere mai adauga ceva, se mai face una. Fiecare
  // trecere e O(ramase); numarul de treceri e marginit de cate „straturi" are
  // planul — masurat, 4 pe o casa de trei etaje.
  let adaugat = true
  while (adaugat) {
    adaugat = false
    // Se itereaza peste o COPIE (se sterge din multime in bucla), dar NU se
    // sorteaza: ordinea unei treceri nu poate schimba punctul fix — aia e chiar
    // garantia de monotonie — iar rezultatul se sorteaza oricum la iesire. Cu
    // sortare la fiecare trecere, o casa de 177 de piese costa 1,44 ms in loc de
    // 0,59 — masurat, nu estimat.
    for (const cheie of [...ramase]) {
      const c = decodeCell(cheie)
      if (suportNouPanaLa(t, rules, c.wx, c.wy, c.z, ip, 1) === 0) continue
      zidite.add(cheie)
      invalideaza(cheie)
      ramase.delete(cheie)
      adaugat = true
    }
  }

  // determinism-ok: amandoua se sorteaza explicit inainte de a fi intoarse.
  return {
    construibile: [...zidite].sort((a, b) => a - b),
    imposibile: [...ramase].sort((a, b) => a - b),
  }
}

/**
 * Raspunsul portii de sprijin, FARA „De ce nu?": `poateSustine(...).ok`, calculat de
 * aceeasi functie (poarta il foloseste pe el), deci nu se pot desincroniza.
 *
 * Exista pentru trecerea ieftina a scanerului, care arunca motivul („NICIO cauza", vezi
 * `cautaJob`) si intreaba sute de santiere pe ACELASI teren; „De ce nu?" ramane al
 * portii, pentru comanda si pentru UI. `activ` e memoria activitatii grinzilor pe care o
 * da apelantul pentru o serie de intrebari intre care terenul NU se schimba — si numai
 * atunci: tine si „activa" si „inactiva", iar orice editare o poate intoarce pe oricare
 * (o zidire activeaza, o sapatura dezactiveaza). `null` = fara memorie.
 */
export function sustinutAcum(t: Terrain, rules: Rules, wx: number, wy: number, z: number, activ: Map<number, boolean> | null): boolean {
  // Pe o celula deja solida nu se PLASEAZA nimic, deci intrebarea despre sprijin
  // nu se pune: refuzul util vine de la teren, cu `CELULA_PLINA`. Fara
  // scurtcircuitul asta, un bloc deja plutitor — pe care comanda nu-l mai poate
  // crea, dar un save de dinaintea taieturii poate sa-l contina — ar raspunde
  // „n-are sprijin": adevarat, si inutil.
  if (solLa(t, wx, wy, z) === Sol.SOLID) return true
  const ip = activ === null ? FARA_IPOTEZA : { ...FARA_IPOTEZA, activ }
  return suportNouPanaLa(t, rules, wx, wy, z, ip, 1) > 0
}

/**
 * TRANSIENT: raspunsurile lui `sustinutAcum` pe celula, si memoria activitatii grinzilor,
 * pe o EPOCA a terenului (`Terrain.editari`). Orice scriere de voxel, oriunde, le goleste
 * pe amandoua — invalidare globala, deci exacta fara nicio raza de tinut minte. Cheia
 * contine si terenul si regulile: aceeasi memorie intrebata despre alt teren sau cu alte
 * reguli porneste de la zero. Nu decide nimic ce n-ar decide calculul, nu intra in hash
 * si nu se salveaza.
 */
export interface MemorieSprijin {
  teren: Terrain | null
  rules: Rules | null
  editari: number
  readonly ok: Map<number, boolean>
  readonly activ: Map<number, boolean>
}

export function memorieSprijin(): MemorieSprijin {
  return { teren: null, rules: null, editari: -1, ok: new Map(), activ: new Map() }
}

/**
 * `sustinutAcum`, prin memorie. Masurat de lentila de cost (recenzia taieturii 4): o sala
 * cu centrul podelei de grinzi imposibil ramane cu santierele desemnate pe veci, iar
 * scanerul le re-intreaba la fiecare scanare a fiecarui pion — fara memorie, costul in
 * repaus creste cu santierele imposibile, nu cu munca (K05).
 */
export function sustinutAcumMemorat(t: Terrain, rules: Rules, wx: number, wy: number, z: number, m: MemorieSprijin): boolean {
  if (m.teren !== t || m.rules !== rules || m.editari !== t.editari) {
    m.ok.clear()
    m.activ.clear()
    m.teren = t
    m.rules = rules
    m.editari = t.editari
  }
  const k = cellKey(wx, wy, z)
  const stiut = m.ok.get(k)
  if (stiut !== undefined) return stiut
  const r = sustinutAcum(t, rules, wx, wy, z, m.activ)
  m.ok.set(k, r)
  return r
}

/**
 * Poarta de PLASARE cu „De ce nu?": `sustinutAcum`, iar la refuz diagnosticul.
 *
 * Doar comanda si zidirea o cheama; scanerul de joburi intreaba `sustinutAcumMemorat` si
 * arunca motivul, deci diagnosticul nu scumpeste nicio trecere a lui (masurat de
 * verificatorul V4: in poarta scanerului ar fi urcat trecerea de 4,5 ori pe o podea).
 */
export function poateSustine(t: Terrain, rules: Rules, wx: number, wy: number, z: number): Outcome<void> {
  if (sustinutAcum(t, rules, wx, wy, z, null)) return accept()
  return deCeNuSprijin(t, rules, wx, wy, z)
}

/** Cazurile lui „De ce nu?" pentru FARA_SPRIJIN — `params.caz`. */
export const CazSprijin = {
  /** Celula nu atinge nimic solid la cota ei si nu sta pe nimic: n-are de ce sa se prinda. */
  NU_ATINGE: 'NU_ATINGE',
  /** O grinda LEGATA prin solid la cel mult R−1 pasi — deci ar tine —, dar INACTIVA. */
  GRINDA_INACTIVA: 'GRINDA_INACTIVA',
  /** Cea mai apropiata grinda ACTIVA, pe drumul prin solid, e la ≥ R pasi. */
  GRINDA_PREA_DEPARTE: 'GRINDA_PREA_DEPARTE',
  /** O grinda la ≤ R−1 pe Manhattan, dar fara drum prin solid (in plafonul cautarii). */
  GRINDA_NELEGATA: 'GRINDA_NELEGATA',
  /** Nicio grinda legata prin solid in plafonul cautarii, si niciuna in raza. */
  NICIO_GRINDA: 'NICIO_GRINDA',
} as const

// Tampoane PROPRII ale diagnosticului: activitatea unei grinzi foloseste `caveazaSpreAsezat`,
// deci coada lui nu se poate imprumuta.
const coadaDX: number[] = []
const coadaDY: number[] = []
const coadaDD: number[] = []
const vazuteD = new Map<number, number>()
const grinziD = new Set<number>()
const listaD: number[] = []

/**
 * „De ce nu?" pentru o celula pe care `sustinutAcum` a refuzat-o. Doar prezentare: nu
 * schimba lumea si nu atinge contoarele.
 *
 * Recenzia (26.09, V4 si V5): forma de dinainte cauta grinzi doar la Manhattan <= R−1 si
 * alegea cea mai apropiata pe Manhattan. Pe cazul-vitrina — a 13-a celula a fasiei, cu
 * grinda activa la 10 pasi — raspundea „nicio grinda in raza", cu razaGrinda=10 in chiar
 * parametrii lui; pe o podea plina, toata frontiera primea acelasi raspuns fals. Unei celule
 * fara niciun vecin solid ii spunea „drumul e prea lung", iar intre doua fasii paralele
 * numea grinda NELEGATA de alaturi si o ascundea pe cea care conta. Oracolul verificatorului:
 * 0 diferente pe 7.270 de celule refuzate, toate cele cinci cazuri prezente.
 *
 * Distantele sunt cele ale REGULII — pasi prin SOLID la cota celulei —, nu Manhattan: un
 * BFS din celula, cu plafonul `2 · suportRazaGrinda` (dincolo de el, „grinda e la 25 de
 * pasi" nu mai spune jucatorului nimic in plus fata de „nicio grinda"). Pe drum se
 * noteaza primul voxel asezat (`sprijinD`, ≥ suportMax prin refuz), prima grinda (orice
 * grinda la ≤ R−1 e INACTIVA prin refuz, deci nu se mai verifica) si prima grinda activa
 * (la ≥ R, tot prin refuz). Ordinea BFS e fixa: raspunsul e determinist.
 */
function deCeNuSprijin(t: Terrain, rules: Rules, wx: number, wy: number, z: number): Outcome<void> {
  const R = rules.suportRazaGrinda
  const M = rules.suportMax
  const C = 2 * R
  const baza: Record<string, number | string> = { wx, wy, z, raza: M, razaGrinda: R, cautare: C }

  let atinge = false
  for (const [dx, dy] of DIRECTII) if (solLa(t, wx + dx, wy + dy, z) === Sol.SOLID) atinge = true
  if (!atinge) {
    return refuse(Reason.FARA_SPRIJIN, {
      ...baza, caz: CazSprijin.NU_ATINGE,
      motiv: 'piesa nu sta pe nimic si nu atinge nimic solid la cota ei: n-are de ce sa se prinda',
    })
  }

  // Grinzile IN PICIOARE din plafon, din index — aceeasi sursa de candidati ca regula.
  listaD.length = 0
  grinziInRaza(t.grinzi, wx, wy, z, C, listaD)
  grinziD.clear()
  for (let i = 0; i < listaD.length; i += 2) {
    if (grindaInPicioare(t, listaD[i]!, listaD[i + 1]!, z, FARA_IPOTEZA, false)) grinziD.add(cellKey(listaD[i]!, listaD[i + 1]!, z))
  }

  let sprijinD = -1
  let inX = 0, inY = 0, inD = -1 // prima grinda (inactiva) la ≤ R−1
  let acX = 0, acY = 0, acD = -1 // prima grinda activa
  vazuteD.clear()
  coadaDX.length = 0
  coadaDY.length = 0
  coadaDD.length = 0
  coadaDX.push(wx)
  coadaDY.push(wy)
  coadaDD.push(0)
  vazuteD.set(cellKey(wx, wy, z), 0)
  for (let cap = 0; cap < coadaDX.length; cap++) {
    const x = coadaDX[cap]!
    const y = coadaDY[cap]!
    const d = coadaDD[cap]!
    // Totul s-a aflat: nimic mai departe nu schimba raspunsul.
    if (sprijinD !== -1 && acD !== -1) break
    if (d >= C) continue
    for (const [dx, dy] of DIRECTII) {
      const nx = x + dx
      const ny = y + dy
      if (solLa(t, nx, ny, z) !== Sol.SOLID) continue
      const cheie = cellKey(nx, ny, z)
      if (vazuteD.has(cheie)) continue
      vazuteD.set(cheie, d + 1)
      if (sprijinD === -1 && esteAsezat(t, nx, ny, z)) sprijinD = d + 1
      if (grinziD.has(cheie)) {
        if (d + 1 <= R - 1) {
          if (inD === -1) { inX = nx; inY = ny; inD = d + 1 }
        } else if (acD === -1 && (esteAsezat(t, nx, ny, z) || caveazaSpreAsezat(t, rules, nx, ny, z, null) > 0)) {
          acX = nx; acY = ny; acD = d + 1
        }
      }
      coadaDX.push(nx)
      coadaDY.push(ny)
      coadaDD.push(d + 1)
    }
  }
  if (sprijinD !== -1) baza.sprijinD = sprijinD

  if (inD !== -1) {
    return refuse(Reason.FARA_SPRIJIN, {
      ...baza, caz: CazSprijin.GRINDA_INACTIVA, grindaX: inX, grindaY: inY, grindaD: inD, grindaActiva: 0,
      motiv: 'grinda de la grindaD pasi ar tine piesa, dar ea nu tine nimic: nu e prinsa de nimic asezat la cel mult suportMax - 1 pasi',
    })
  }
  if (acD !== -1) {
    return refuse(Reason.FARA_SPRIJIN, {
      ...baza, caz: CazSprijin.GRINDA_PREA_DEPARTE, grindaX: acX, grindaY: acY, grindaD: acD, grindaActiva: 1,
      motiv: 'cea mai apropiata grinda activa e la grindaD pasi prin solid; tine cel mult suportRazaGrinda - 1',
    })
  }
  // O grinda in raza la care nu duce niciun drum prin solid: cea mai apropiata pe
  // Manhattan, cu departajare pe ordinea indexului (cota, rand, coloana).
  let nX = 0, nY = 0, nM = -1
  for (let i = 0; i < listaD.length; i += 2) {
    const x = listaD[i]!, y = listaD[i + 1]!
    const m = Math.abs(x - wx) + Math.abs(y - wy)
    if (m > R - 1 || !grinziD.has(cellKey(x, y, z)) || vazuteD.has(cellKey(x, y, z))) continue
    if (nM !== -1 && m >= nM) continue
    nX = x; nY = y; nM = m
  }
  if (nM !== -1) {
    return refuse(Reason.FARA_SPRIJIN, {
      ...baza, caz: CazSprijin.GRINDA_NELEGATA, grindaX: nX, grindaY: nY,
      motiv: 'grinda din raza nu e legata de piesa prin solid la cota ei (niciun drum de cel mult cautare pasi)',
    })
  }
  return refuse(Reason.FARA_SPRIJIN, {
    ...baza, caz: CazSprijin.NICIO_GRINDA,
    motiv: 'nimic asezat la mai putin de suportMax pasi, si nicio grinda legata prin solid pe cel mult cautare pasi',
  })
}

export function suportDacaSap(t: Terrain, rules: Rules, wx: number, wy: number, z: number): number {
  if (solLa(t, wx, wy, z) !== Sol.SOLID) return suportLa(t, rules, wx, wy, z + 1)
  const ipotetic = new Set<number>([cellKey(wx, wy, z)])
  return suportLa(t, rules, wx, wy, z + 1, ipotetic)
}

/**
 * Ce sa faca jucatorul cu celula asta. Trei stari cu VERB, nu un gradient.
 *
 * Overlay-ul de joburi, livrat tot ca raspuns la K13, nu arata cifre — arata
 * stari cu actiunea in ele. O masura fara verb („1", portocaliu) nu spune nici
 * cat mai poti sapa, nici unde sa lasi roca. Si DESIGN §9 regula 9 interzice
 * explicit gradientul rosu→verde ca singur canal.
 *
 * ## Prima versiune raspundea la alta intrebare
 *
 * Se uita la `suportDacaSap`, adica la suportul UNUI voxel — cel direct deasupra
 * celulei. Dar ce cade cand sapi nu e, in general, voxelul de deasupra: sapatul
 * rupe si conectivitatea LATERALA, iar un voxel atarnat de la trei celule
 * distanta isi poate pierde drumul spre sprijin. Voxelul de deasupra, in schimb,
 * e prin constructie la un pas de un vecin asezat imediat ce sapi la marginea
 * unei camere, deci primeste suport 3 si raspunsul iesea SIGUR.
 *
 * Masurat, dupa ce recenzia a semnalat-o: intr-o camera de 6x7 toate cele 168 de
 * celule solide din rama spuneau SIGUR, si DOUA dintre ele chiar prabuseau ceva.
 * La 6x9, sase. La 6x13, paisprezece. Overlay-ul desena zero patrate intr-o
 * camera care se prabusea — adica exact esecul pentru care exista.
 *
 * Acum intreaba ce trebuie: **ce se intampla daca sap AICI**, prin aceeasi
 * propagare pe care o foloseste prabusirea reala. Nu mai exista nici ramura
 * „tavan deschis → SIGUR": in teren deschis propagarea raspunde singura si
 * ieftin, fiindca vecinii de la cota z raman asezati si ies din prima citire.
 */
export const StareSapat = {
  /** Se poate sapa, si ramane loc de inca o sapatura langa. */
  SIGUR: 0,
  /** Se poate sapa, dar e ULTIMA: inca una langa si tavanul cade. */
  ULTIMA_CELULA: 1,
  /** Daca sapi aici, cade ceva. */
  CADE: 2,
  /** Nu e nimic de sapat. */
  NIMIC: 3,
} as const

export function stareSapat(t: Terrain, rules: Rules, wx: number, wy: number, z: number): number {
  if (solLa(t, wx, wy, z) !== Sol.SOLID) return StareSapat.NIMIC
  const { cazute, minim } = propaga(t, rules, [cellKey(wx, wy, z)], true)
  // `cazute` contine mereu celula insasi; orice peste ea chiar s-a prabusit.
  if (cazute.size > 1) return StareSapat.CADE
  return minim <= 1 ? StareSapat.ULTIMA_CELULA : StareSapat.SIGUR
}

/** Ce face overlay-ul de stabilitate cu o celula din fereastra lui. */
export const Prefiltru = {
  /** Nu e solid la nivelul activ: nimic de judecat. */
  NIMIC: 0,
  /** Solid si SIGUR fara nicio scanare: nicio sursa de pericol in raza. */
  SIGUR: 1,
  /** Solid, cu o sursa de pericol in raza: merita scanarea scumpa (`stareSapat`). */
  DE_SCANAT: 2,
} as const

/**
 * Prefiltrul overlay-ului de stabilitate, pe fereastra `lat × lat` cu coltul la
 * (x0, y0), la nivelul activ `zA`. Intoarce un `Prefiltru` per celula, rand pe
 * rand (`i * lat + j` = celula (x0 + i, y0 + j)).
 *
 * `stareSapat` costa ~19 µs pe celula, deci fereastra intreaga ar fi un cadru
 * pierdut; dar o celula departe de orice SURSA DE PERICOL nu poate fi nici CADE,
 * nici ULTIMA CELULA — discul care i-ar schimba suportul are raza `suportMax`.
 * Deci se calculeaza intai distanta Manhattan pana la cea mai apropiata sursa
 * (doua treceri, O(celule)), si abia apoi se plateste scump acolo unde poate conta.
 *
 * ## Sursele de pericol, si cea care lipsea
 *
 * Aerul la `zA` sau la `zA + 1` — si **solidul NEASEZAT de la `zA`** (cu aer
 * dedesubt). Prima versiune, scrisa in viewer, avea doar aerul. Pe tavanul unei
 * pivnite, privit de pe nivelul lui, `zA` si `zA + 1` sunt roca plina, deci
 * prefiltrul declara SIGUR tot, fara sa intrebe: masurat de panoul grinzii
 * (25.09), la o pivnita de 6×7 ascundea 48 din 48 de celule periculoase, dintre
 * care 6 CADE. Adica exact esecul pentru care exista overlay-ul — zero patrate
 * peste un tavan care cade. Tavanul atarna, iar celulele atarnate sunt chiar
 * cele pe care o sapatura alaturi le poate dobori.
 *
 * Marginea ferestrei nu se presupune: sursele se cauta pe fereastra largita cu raza, vezi
 * mai jos de ce.
 */
export function prefiltruStabilitate(t: Terrain, rules: Rules, x0: number, y0: number, lat: number, zA: number): Uint8Array {
  const MARE = 1 << 20
  const n = lat * lat
  // Cu o grinda in preajma, o sapatura schimba suportul pana la `suportRazaGrinda − 1`
  // pasi, nu `suportMax − 1`: raza prefiltrului creste. Grinda se cauta pe fereastra
  // largita cu raza ei — una aflata chiar in afara ferestrei tine celule din ea, prin
  // drumuri care trec prin fereastra.
  //
  // DOAR la zA. O celula la mai mult de `suportMax` de orice sursa are in jur, pana la
  // `suportMax`, solid asezat la zA si solid la zA+1. Deci o grinda de la zA+1 aflata
  // la cel mult `suportMax − 1` de ea are cel putin un vecin asezat si dupa sapatura —
  // ramane activa — iar drumurile `s1` de la zA+1 trec prin solid, asezat sau nu.
  // Efectele cu raza grinzii sunt toate la zA: celula sapata era grinda, sau un drum
  // spre o grinda activa trecea prin ea. (Fixtura panoului, o podea de doua straturi
  // tinuta de o grinda — 19 din 123 de celule periculoase ascunse — o prinde acum
  // sursa „solid neasezat"; cea care cere raza e o grinda ingropata in roca.)
  const jum = lat >> 1
  const aproape: number[] = []
  grinziInRaza(t.grinzi, x0 + jum, y0 + jum, zA, 2 * jum + rules.suportRazaGrinda, aproape)
  const raza = aproape.length > 0 ? Math.max(rules.suportMax, rules.suportRazaGrinda) : rules.suportMax
  // Harta surselor se face pe fereastra LARGITA cu `raza` pe fiecare latura, si abia apoi se
  // decupeaza: o celula din fereastra vede orice sursa aflata la cel mult `raza` de ea, oriunde
  // ar fi. Forma de dinainte presupunea ceva despre ce e dincolo de margine — „poate fi sursa",
  // la distanta `raza` — ceea ce e sigur cand drumurile se opresc la primul voxel asezat (s0),
  // dar nu cand trec prin solid asezat (s1, spre o grinda): masurat de recenzie (26.09), o
  // grinda la 1–5 pasi de margine care tine tavanul unei pivnite de DINCOLO iesea SIGUR fara
  // scanare, cu tot drumul ei; si, fara grinzi, o celula ULTIMA dupa un sant de langa margine.
  // Largita, prefiltrul e si mai ieftin la scanare: rama nu mai e DE_SCANAT din oficiu
  // (-10,6% scanari scumpe cu grinzi, -44% fara), iar harta de 53² costa sub o milisecunda.
  const m = raza
  const L = lat + 2 * m
  const dist = new Int32Array(L * L).fill(MARE)
  for (let i = 0; i < L; i++) {
    for (let j = 0; j < L; j++) {
      const x = x0 - m + i
      const y = y0 - m + j
      if (solLa(t, x, y, zA) !== Sol.SOLID || solLa(t, x, y, zA + 1) !== Sol.SOLID || !esteAsezat(t, x, y, zA)) dist[i * L + j] = 0
    }
  }
  for (let i = 0; i < L; i++) {
    for (let j = 0; j < L; j++) {
      const k = i * L + j
      if (i > 0 && dist[k - L]! + 1 < dist[k]!) dist[k] = dist[k - L]! + 1
      if (j > 0 && dist[k - 1]! + 1 < dist[k]!) dist[k] = dist[k - 1]! + 1
    }
  }
  for (let i = L - 1; i >= 0; i--) {
    for (let j = L - 1; j >= 0; j--) {
      const k = i * L + j
      if (i < L - 1 && dist[k + L]! + 1 < dist[k]!) dist[k] = dist[k + L]! + 1
      if (j < L - 1 && dist[k + 1]! + 1 < dist[k]!) dist[k] = dist[k + 1]! + 1
    }
  }
  const out = new Uint8Array(n)
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lat; j++) {
      if (solLa(t, x0 + i, y0 + j, zA) !== Sol.SOLID) continue
      out[i * lat + j] = dist[(i + m) * L + (j + m)]! <= raza ? Prefiltru.DE_SCANAT : Prefiltru.SIGUR
    }
  }
  return out
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

