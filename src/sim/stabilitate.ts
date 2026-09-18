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
import type { Outcome } from './result.ts'
import { accept, refuse, Reason } from './result.ts'
import { cellKey, decodeCell, decodeCellIn } from './path.ts'
import type { Celula } from './path.ts'
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
  return caveazaSpreAsezat(t, rules, wx, wy, z, cazute)
}

/**
 * BFS-ul lateral propriu-zis, fara nicio presupunere despre celula de PLECARE.
 *
 * Sta separat fiindca are DOI apelanti care difera exact prin celula aia:
 * `suportLa` intreaba despre un voxel care exista, `suportDacaZidesc` despre unul
 * care inca nu. Scris de doua ori, s-ar desincroniza la prima schimbare de
 * regula — si regula asta s-a schimbat deja o data, la recenzie.
 */
function caveazaSpreAsezat(t: Terrain, rules: Rules, wx: number, wy: number, z: number, cazute: Set<number> | null): number {
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
      //
      // `max(0, ...)` nu e de prisos, desi plafonul de mai sus pare sa-l faca
      // imposibil de atins: cele doua sunt aceeasi garantie scrisa de doua ori,
      // si exact UNA dintre ele tine raspunsul pozitiv la un moment dat. Fara
      // niciuna, un tavan la 5 pasi da −1 — care nu e nici 0, nici 1, deci
      // `stareSapat` raspunde SIGUR exact acolo unde e cel mai periculos.
      if (esteAsezat(t, nx, ny, z, cazute)) return Math.max(0, rules.suportMax - (d + 1))
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
 * singurul loc in care se poate taia e inainte de ea. BFS-ul din `suportLa` e
 * deja in siguranta: intreaba `solLa(nx, ny, z)` INAINTE sa construiasca cheia.
 */
export function celuleAtinse(rules: Rules, wx: number, wy: number, z: number, out: number[]): void {
  const raza = rules.suportMax - 1
  for (const dz of [0, 1]) {
    for (let dx = -raza; dx <= raza; dx++) {
      const nx = wx + dx
      if (nx < 0 || nx >= WORLD_CELLS) continue
      const rest = raza - Math.abs(dx)
      for (let dy = -rest; dy <= rest; dy++) {
        const ny = wy + dy
        if (ny < 0 || ny >= WORLD_CELLS) continue
        out.push(cellKey(nx, ny, z + dz))
      }
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
function propaga(t: Terrain, rules: Rules, sapate: readonly number[]): { cazute: Set<number>; minim: number } {
  const cazute = new Set<number>(sapate)
  const deVerificat: number[] = []
  // UN obiect de decodare per apel, nu unul per iteratie.
  const c: Celula = { wx: 0, wy: 0, z: 0 }

  // Seeding-ul initial se DEDUPLICA, cascada nu.
  //
  // Discurile a doua celule vecine se suprapun aproape complet, iar
  // previzualizarea cheama functia asta peste TOATE desemnarile deodata: la o
  // pivnita de 7x7 sunt 49 de discuri a cate 50 de celule, adica 2450 de intrari
  // peste ~200 de celule distincte. Fiecare duplicat costa un BFS.
  //
  // Deduplicarea e sigura exact cat e si raza de invalidare: daca o celula isi
  // schimba suportul mai tarziu, o face fiindca a cazut ceva la cel mult
  // `suportMax − 1` pasi de ea — iar aia o re-pune in coada prin cascada. Deci
  // cascada NU se deduplica: acolo re-verificarea e scopul.
  const semanate = new Set<number>()
  const dinDisc: number[] = []
  for (const cheie of sapate) {
    decodeCellIn(cheie, c)
    dinDisc.length = 0
    celuleAtinse(rules, c.wx, c.wy, c.z, dinDisc)
    for (const k of dinDisc) {
      if (semanate.has(k)) continue
      semanate.add(k)
      deVerificat.push(k)
    }
  }

  let minim = rules.suportMax
  for (let i = 0; i < deVerificat.length; i++) {
    const cheie = deVerificat[i]!
    if (cazute.has(cheie)) continue
    decodeCellIn(cheie, c)
    if (solLa(t, c.wx, c.wy, c.z, cazute) !== Sol.SOLID) continue
    const suport = suportLa(t, rules, c.wx, c.wy, c.z, cazute)
    if (suport > 0) {
      if (suport < minim) minim = suport
      continue
    }
    cazute.add(cheie)
    // Ce cade poate lua cu el ce se sprijinea pe el: se re-verifica vecinatatea.
    celuleAtinse(rules, c.wx, c.wy, c.z, deVerificat)
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
 * acolo, deci intrebarea e despre ce EXISTA.
 */
export function suportDacaZidesc(t: Terrain, rules: Rules, wx: number, wy: number, z: number): number {
  if (solLa(t, wx, wy, z) === Sol.SOLID) return suportLa(t, rules, wx, wy, z)
  const sub = solLa(t, wx, wy, z - 1)
  if (sub === Sol.SOLID || sub === Sol.ANCORA) return rules.suportMax
  return caveazaSpreAsezat(t, rules, wx, wy, z, null)
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
export function poateSustine(t: Terrain, rules: Rules, wx: number, wy: number, z: number): Outcome<void> {
  const suport = suportDacaZidesc(t, rules, wx, wy, z)
  if (suport > 0) return accept()
  return refuse(Reason.FARA_SPRIJIN, {
    wx,
    wy,
    z,
    raza: rules.suportMax,
    motiv: 'nimic asezat la mai putin de suportMax pasi: piesa ar cadea in acelasi tick',
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
  const { cazute, minim } = propaga(t, rules, [cellKey(wx, wy, z)])
  // `cazute` contine mereu celula insasi; orice peste ea chiar s-a prabusit.
  if (cazute.size > 1) return StareSapat.CADE
  return minim <= 1 ? StareSapat.ULTIMA_CELULA : StareSapat.SIGUR
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

