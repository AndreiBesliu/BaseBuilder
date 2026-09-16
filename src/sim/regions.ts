/**
 * Regiuni si reachability — S9-11.
 *
 * De ce ASTA inainte de agenti, si nu un A* pe grila: research-ul pe Going
 * Medieval e neechivoc. Pathfinding-ul 3D multi-agent a fost rescris de patru ori
 * in cinci ani intr-un studio de zece oameni si e declarat si azi, dupa 1.0,
 * problema numarul unu. Semnalul de alarma citat: **FPS-ul scade cand construiesti
 * un zid, nu cand adaugi pioni** — adica 15 pioni cauta simultan un drum inexistent.
 * Un A* care ESUEAZA e cel mai scump lucru din joc, si singurul leac e sa nu-l
 * pornesti: intrebi intai graful de regiuni daca exista vreo sansa.
 *
 * Trei invarianti, toti din research si toti verificati de teste:
 *
 * 1. **O regiune nu traverseaza niciodata un bloc de 16×16.** Blocul e o
 *    subdiviziune fixa a chunk-ului (32 / 16 = 2×2 blocuri per chunk), deci
 *    granita unei regiuni e mereu cunoscuta dinainte si recalcularea e locala.
 *
 * 2. **O regiune e plata.** Sta pe UN singur nivel z. Legaturile verticale sunt
 *    muchii in graf, nu celule in regiune — altfel un pas de scara ar fuziona
 *    doua etaje intr-o singura componenta si reachability-ul ar minti in sus.
 *
 * 3. **Reachability e SEPARAT de cost.** Raspunde „exista vreun drum?" in O(1)
 *    prin union-find, nu „care e cel mai scurt". Cele doua intrebari au clienti
 *    diferiti: prima decide daca pornesti un A*, a doua e A*-ul.
 *
 * ## Falsul pozitiv, acceptat DELIBERAT
 *
 * La granularitatea de regiune, „sunt in aceeasi componenta" inseamna **poate
 * exista un drum**, nu **exista**. Doua regiuni unite pot fi despartite de o usa
 * incuiata sau de o celula ocupata de un ostil (D7). Deci:
 *
 *   `areConnected` fals  ⇒ NU exista drum. Definitiv. Nu porni A*.
 *   `areConnected` adevarat ⇒ poate exista. Porneste A*; daca esueaza, ala e
 *                             raspunsul autoritar, si job-ul raporteaza INACCESIBIL.
 *
 * Alegerea e intentionata: partea ieftina trebuie sa fie cea care taie cazurile
 * imposibile, nu cea care confirma cazurile posibile.
 */

import type { Rules } from './content.ts'
import { CHUNK_CELLS, isSolid, Material } from './terrain/chunk.ts'
import type { Terrain } from './terrain/terrain.ts'
import { groundLevelM, materialAt, WORLD_CELLS } from './terrain/terrain.ts'

/** Latura unui bloc de regiune, in celule. 32 / 16 = 2×2 blocuri per chunk. */
export const REGION_SIZE = 16
/** Cate blocuri are un chunk pe o axa. */
export const BLOCKS_PER_CHUNK = CHUNK_CELLS / REGION_SIZE
/** Cate celule are un bloc. */
export const BLOCK_CELLS = REGION_SIZE * REGION_SIZE
/** Latimea lumii in blocuri. */
export const WORLD_BLOCKS = WORLD_CELLS / REGION_SIZE

/** Valoarea pentru „celula asta nu apartine niciunei regiuni". */
export const NO_REGION = -1

// --- walkability ------------------------------------------------------------

/**
 * Materialul dintr-o celula, pe calea fierbinte.
 *
 * `materialAt` intoarce `Outcome`, adica aloca un obiect la fiecare apel — corect
 * la granita sistemului, gresit intr-un flood fill care atinge mii de celule.
 * In afara lumii intoarce ROCA: marginea lumii e perete, nu prapastie, si asta
 * scuteste fiecare apelant de o verificare de limite.
 */
export function materialFast(t: Terrain, wx: number, wy: number, z: number): number {
  if (wx < 0 || wy < 0 || wx >= WORLD_CELLS || wy >= WORLD_CELLS) return Material.ROCA
  const out = materialAt(t, wx, wy, z)
  return out.ok ? out.value : Material.ROCA
}

/**
 * Se poate sta in picioare in celula (wx, wy, z)?
 *
 * Trei conditii, in ordinea in care se resping cel mai ieftin: celula libera,
 * podea solida dedesubt, si spatiu liber pentru cap. Apa NU e walkable — daca
 * vreodata se inoata, devine alt mod de traversare, nu o exceptie aici.
 */
export function isWalkable(t: Terrain, wx: number, wy: number, z: number, rules: Rules): boolean {
  const here = materialFast(t, wx, wy, z)
  if (isSolid(here) || here === Material.APA) return false
  if (!isSolid(materialFast(t, wx, wy, z - 1))) return false
  for (let h = 1; h < rules.agentHeadroomM; h++) {
    if (isSolid(materialFast(t, wx, wy, z + h))) return false
  }
  return true
}

/**
 * Se poate pasi din (wx, wy, z) in vecinul (nx, ny, nz)?
 *
 * Ambele trebuie sa fie walkable, iar diferenta de nivel trebuie sa incapa in
 * `maxStepM`. Pasul pe diagonala nu exista deliberat: la o grila cu constructie
 * verticala, diagonala cere verificarea ambelor colturi si e prima sursa de
 * „pionul a trecut prin coltul zidului".
 */
export function canStep(t: Terrain, wx: number, wy: number, z: number, nx: number, ny: number, nz: number, rules: Rules): boolean {
  if (Math.abs(nz - z) > rules.maxStepM) return false
  if (Math.abs(nx - wx) + Math.abs(ny - wy) !== 1) return false
  return isWalkable(t, wx, wy, z, rules) && isWalkable(t, nx, ny, nz, rules)
}

// --- identitatea blocurilor si a regiunilor ---------------------------------

/**
 * Cheia unui bloc: (bx, by, z) impachetate intr-un intreg.
 *
 * `z` e deplasat cu `Z_OFFSET` fiindca poate fi negativ — se sapa in jos, si asta
 * e tot rostul jocului. Ordinea numerica a cheilor e ordinea de iterare, si e
 * singura sursa de determinism din modul.
 */
const Z_OFFSET = 512
const Z_SPAN = 1024

export function blockKey(bx: number, by: number, z: number): number {
  return (by * WORLD_BLOCKS + bx) * Z_SPAN + (z + Z_OFFSET)
}

export function blockOfCell(wx: number, wy: number): { bx: number; by: number } {
  return { bx: Math.floor(wx / REGION_SIZE), by: Math.floor(wy / REGION_SIZE) }
}

// --- starea ----------------------------------------------------------------

export interface RegionStore {
  /**
   * Pentru fiecare bloc calculat, id-ul de regiune al fiecarei celule.
   * `NO_REGION` unde nu se poate sta. DERIVED: se reconstruieste din teren.
   */
  readonly cells: Map<number, Int32Array>
  /** Cheile calculate, MEREU sortate. Singura sursa de ordine la iterare. */
  readonly keys: number[]
  /**
   * Graful de regiuni: cine e la un pas de cine. Muchiile sunt SIMETRICE si se
   * adauga din ambele capete, ca stergerea unui bloc sa nu lase cioturi.
   *
   * A inlocuit un union-find, si nu din eleganta: o unire NU se poate desface,
   * deci o sapatura care RUPE o legatura obliga la reconstructie totala. Cu graf
   * explicit, componentele se re-eticheteaza printr-o parcurgere peste intregi —
   * ieftina — in timp ce celulele, care sunt partea scumpa, raman pe loc.
   */
  readonly adj: Map<number, Set<number>>
  /**
   * In ce bloc traieste fiecare regiune.
   *
   * Doua meserii, si a doua a fost surpriza placuta. Pathfinding-ul are nevoie de
   * ea ca sa stie unde e o regiune in lume (euristica de A* peste graf). Dar tot
   * ea e si INDEXUL DE REGIUNI VII: cheile lui sunt exact regiunile care exista.
   *
   * Asta inchide limita pe care o scrisesem in `rebuildDirty`: `relabel` parcurgea
   * toate celulele rezidente doar ca sa afle ce regiuni traiesc, si aia scala cu
   * rezidenta. Acum le stie direct.
   */
  readonly regionBlock: Map<number, number>
  /** Componenta conexa a fiecarei regiuni. Indexat cu id-ul de regiune. */
  component: Int32Array
  /**
   * Urmatorul id de regiune liber. MONOTON: id-urile nu se recicleaza niciodata.
   *
   * Cu reciclare, un bloc nemodificat ar putea ajunge sa arate spre un id care
   * intre timp inseamna altceva — si ar arata ca un bug de reachability, nu ca
   * unul de contabilitate. Id-urile eliberate se pierd; la cateva zeci de mii de
   * sapaturi pe sesiune, e o risipa de cativa kilobytes.
   */
  nextId: number
  /** Blocuri care trebuie recalculate inainte de urmatoarea interogare. */
  /**
   * Blocurile ale caror MUCHII sunt deja derivate. DERIVED, ca tot storeul.
   *
   * Fara asta, `ensureArea` nu era idempotenta: a cere o zona deja calculata
   * costa exact cat prima oara. Blocurile se reciclau din `cells`, dar fiecare
   * muchie se re-derivа de la zero — 256 de celule x 4 directii x nivelurile din
   * pas, adica mii de interogari de teren per bloc, pentru zero munca utila.
   * Profilerul a pus `ensureArea` la 88,5% din tick, din care `linkBlock` 80,2%,
   * in timp ce `computeBlock` era la 3,1%: nu se calcula nimic nou, se relega
   * acelasi lucru la nesfarsit.
   *
   * E sigur sa se memoizeze fiindca `linkBlock` isi creeaza SINGUR blocurile
   * vecine de care are nevoie (`ensureBlock` inainte de `connect`), deci muchiile
   * unui bloc sunt complete in momentul legarii. Ce apare mai tarziu si chiar
   * conteaza trece printr-o schimbare de teren, iar aia trece prin `rebuildDirty`,
   * care sterge de aici tot ce a dezlegat.
   */
  /**
   * Pentru fiecare regiune, o ANCORA stabila: `blockKey * 256 + indiceCelulaMinima`.
   *
   * Id-urile de regiuni vin dintr-un contor global, deci depind de ORDINEA in
   * care s-au calculat blocurile — adica de istorie. Cat timp cautarea peste
   * regiuni departaja pe id si isi sorta vecinii pe id, doua lumi cu acelasi
   * continut dar istorii diferite gaseau coridoare diferite. Ancora depinde numai
   * de GEOMETRIE: ce bloc, si care e prima celula a componentei in ordinea fixa
   * de parcurgere a blocului. E aceeasi in orice ordine ar fi fost calculate
   * blocurile.
   */
  /** Se incrementeaza la fiecare reconstructie. Cheie de cache pentru cine acopera. */
  epoca: number
  readonly ancora: Map<number, number>
  readonly legate: Set<number>
  readonly dirty: Set<number>
}

/**
 * Reconstruieste un store din EXTINDEREA lui, salvata.
 *
 * CARE blocuri sunt calculate e istorie — depinde de pe unde au umblat agentii —
 * iar CONTINUTUL lor e o functie pura de teren. Extinderea e deci PERSISTED si
 * continutul DERIVED. Cat timp extinderea nu se salva, o lume reincarcata avea un
 * graf mai sarac decat cea continua, si de acolo alte coridoare si alte drumuri.
 *
 * Id-urile de regiuni ies in ALTA ordine decat in lumea continua, fiindca aici
 * blocurile se calculeaza sortat. Nu conteaza: cautarea peste regiuni departajeaza
 * pe ANCORA geometrica, nu pe id.
 */
export function restoreRegions(
  t: Terrain,
  blocuri: readonly number[],
  legate: readonly number[],
  rules: Rules,
): RegionStore {
  const s = createRegions()
  for (const key of [...blocuri].sort((a, b) => a - b)) {
    const { bx, by, z } = decodeBlockKey(key)
    ensureBlock(t, s, bx, by, z, rules)
  }
  for (const key of [...legate].sort((a, b) => a - b)) {
    const { bx, by, z } = decodeBlockKey(key)
    linkBlock(t, s, bx, by, z, rules)
  }
  relabel(s)
  return s
}

export function createRegions(): RegionStore {
  return {
    cells: new Map(),
    keys: [],
    adj: new Map(),
    regionBlock: new Map(),
    component: new Int32Array(0),
    nextId: 0,
    epoca: 0,
    ancora: new Map(),
    legate: new Set(),
    dirty: new Set(),
  }
}

function insertKey(s: RegionStore, key: number): void {
  let lo = 0
  let hi = s.keys.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (s.keys[mid]! < key) lo = mid + 1
    else hi = mid
  }
  if (s.keys[lo] === key) return
  s.keys.splice(lo, 0, key)
}

function ensureComponentCapacity(s: RegionStore, needed: number): void {
  if (needed <= s.component.length) return
  const grown = new Int32Array(Math.max(needed, s.component.length * 2, 64)).fill(NO_REGION)
  grown.set(s.component)
  s.component = grown
}

/** Componenta conexa a unei regiuni. O citire, fara parcurgere. */
export function find(s: RegionStore, a: number): number {
  return a >= 0 && a < s.component.length ? s.component[a]! : NO_REGION
}

/** Adauga muchia in AMBELE sensuri. Idempotent — `Set`, nu lista. */
function connect(s: RegionStore, a: number, b: number): void {
  if (a === b) return
  let sa = s.adj.get(a)
  if (!sa) {
    sa = new Set()
    s.adj.set(a, sa)
  }
  sa.add(b)
  let sb = s.adj.get(b)
  if (!sb) {
    sb = new Set()
    s.adj.set(b, sb)
  }
  sb.add(a)
}

/**
 * Re-eticheteaza componentele, prin parcurgere in latime peste graf.
 *
 * Ordinea e data de id-ul de regiune crescator, si vecinii se parcurg sortati:
 * doua lumi identice ca CONTINUT primesc aceleasi etichete, indiferent de ordinea
 * in care au fost sapate. Fara asta, un save reincarcat ar putea da alte numere
 * de componenta pentru aceeasi harta.
 *
 * Costa O(regiuni + muchii) si lucreaza numai cu intregi — adica e ieftina.
 * Partea scumpa a fost mereu recalcularea CELULELOR, si aia nu se mai face decat
 * pentru blocurile murdare.
 */
function relabel(s: RegionStore): void {
  ensureComponentCapacity(s, s.nextId)
  s.component.fill(NO_REGION, 0, s.nextId)

  // Regiunile vii se CITESC din index, nu se cauta prin celule. Diferenta e intre
  // O(regiuni) si O(celule rezidente) — la discul complet, intre mii si milioane.
  // Sortarea e pe ANCORA, nu pe id: id-urile vin dintr-un contor global, deci din
  // ordinea istorica a calculului. Ordinea asta decide ce eticheta primeste
  // fiecare componenta, iar doua lumi cu acelasi continut trebuie sa primeasca
  // aceleasi etichete, nu doar o partitie izomorfa.
  const vii = [...s.regionBlock.keys()].sort((x, y) => (s.ancora.get(x) ?? x) - (s.ancora.get(y) ?? y))
  for (const r of vii) s.component[r] = -2 // exista, inca ne-etichetat

  const coada: number[] = []
  let urmatoarea = 0
  for (const start of vii) {
    if (s.component[start] !== -2) continue
    const eticheta = urmatoarea++
    s.component[start] = eticheta
    coada.length = 0
    coada.push(start)
    while (coada.length > 0) {
      const cur = coada.pop()!
      const vecini = s.adj.get(cur)
      if (!vecini) continue
      for (const v of [...vecini].sort((a, b) => a - b)) {
        if (s.component[v] === -2) {
          s.component[v] = eticheta
          coada.push(v)
        }
      }
    }
  }
}

// --- calculul unui bloc -----------------------------------------------------

/** Buffer de lucru pentru flood fill. Prealocat: zero alocari per bloc. */
const queue = new Int32Array(BLOCK_CELLS)

/**
 * Imparte un bloc de 16×16 la nivelul z in componente conexe.
 *
 * Flood fill cu patru vecini, oprit la marginea blocului — invariantul 1. Ce se
 * intampla peste granita se rezolva la legare (`linkBlocks`), nu aici.
 */
function computeBlock(t: Terrain, s: RegionStore, key: number, bx: number, by: number, z: number, rules: Rules): void {
  const cells = new Int32Array(BLOCK_CELLS).fill(NO_REGION)
  const originX = bx * REGION_SIZE
  const originY = by * REGION_SIZE

  const walk = new Uint8Array(BLOCK_CELLS)
  for (let ly = 0; ly < REGION_SIZE; ly++) {
    for (let lx = 0; lx < REGION_SIZE; lx++) {
      walk[ly * REGION_SIZE + lx] = isWalkable(t, originX + lx, originY + ly, z, rules) ? 1 : 0
    }
  }

  for (let i = 0; i < BLOCK_CELLS; i++) {
    if (walk[i] === 0 || cells[i] !== NO_REGION) continue
    const id = s.nextId++
    s.regionBlock.set(id, key)
    // `i` e prima celula a componentei in ordinea de parcurgere a blocului, deci
    // cea mai mica din ea: o ancora stabila, independenta de ordinea istorica.
    s.ancora.set(id, key * 256 + i)

    let head = 0
    let tail = 0
    queue[tail++] = i
    cells[i] = id
    while (head < tail) {
      const cur = queue[head++]!
      const cx = cur % REGION_SIZE
      const cy = (cur / REGION_SIZE) | 0
      if (cx > 0) tail = push(cells, walk, queue, tail, cur - 1, id)
      if (cx < REGION_SIZE - 1) tail = push(cells, walk, queue, tail, cur + 1, id)
      if (cy > 0) tail = push(cells, walk, queue, tail, cur - REGION_SIZE, id)
      if (cy < REGION_SIZE - 1) tail = push(cells, walk, queue, tail, cur + REGION_SIZE, id)
    }
  }

  s.cells.set(key, cells)
  insertKey(s, key)
}

function push(cells: Int32Array, walk: Uint8Array, q: Int32Array, tail: number, idx: number, id: number): number {
  if (walk[idx] === 0 || cells[idx] !== NO_REGION) return tail
  cells[idx] = id
  q[tail] = idx
  return tail + 1
}

/** Id-ul de regiune al unei celule, sau `NO_REGION`. Blocul trebuie sa fie calculat. */
export function regionAt(s: RegionStore, wx: number, wy: number, z: number): number {
  const { bx, by } = blockOfCell(wx, wy)
  const cells = s.cells.get(blockKey(bx, by, z))
  if (!cells) return NO_REGION
  const lx = wx - bx * REGION_SIZE
  const ly = wy - by * REGION_SIZE
  return cells[ly * REGION_SIZE + lx]!
}

// --- legarea blocurilor -----------------------------------------------------

/** Calculeaza blocul daca lipseste. Nu leaga nimic — legarea e pasul urmator. */
export function ensureBlock(t: Terrain, s: RegionStore, bx: number, by: number, z: number, rules: Rules): number {
  const key = blockKey(bx, by, z)
  if (!s.cells.has(key)) {
    computeBlock(t, s, key, bx, by, z, rules)
    statistici.blocuriCalculate++
  }
  return key
}

/**
 * Uneste regiunile blocului cu tot ce e la un pas de ele.
 *
 * Se uita la vecinii orizontali pe TREI niveluri (z-1, z, z+1, filtrate prin
 * `maxStepM`), nu doar pe al lui. Pasul in sus si in jos e exact ce face
 * verticalitatea sa existe: o camera sapata sub sol e legata de suprafata printr-o
 * treapta, nu printr-o celula comuna. Daca ar fi tratata ca celula comuna, doua
 * etaje ar fuziona intr-o componenta si reachability-ul ar minti in sus —
 * invariantul 2.
 *
 * Legarea e idempotenta: union-find nu se supara daca aceeasi pereche vine de
 * doua ori, si fiecare muchie e vazuta din ambele capete.
 */
/**
 * Cate blocuri s-au calculat si s-au legat de la pornire.
 *
 * Nu e decor si nu e doar pentru teste: „memoizarea a incetat sa scurtcircuiteze"
 * e o regresie de 21x care nu schimba niciun rezultat, deci nu poate fi prinsa
 * decat masurand MUNCA. Un test care se uita la marimea structurilor trece si cu
 * memoizarea scoasa, fiindca a doua rulare reconstruieste exact aceleasi blocuri.
 */
export const statistici = { blocuriCalculate: 0, blocuriLegate: 0 }

export function linkBlock(t: Terrain, s: RegionStore, bx: number, by: number, z: number, rules: Rules): void {
  const key = blockKey(bx, by, z)
  // Deja legat: muchiile lui exista si nu s-a schimbat nimic de atunci. Vezi
  // `legate` pentru de ce e sigur.
  if (s.legate.has(key)) return
  ensureBlock(t, s, bx, by, z, rules)
  s.legate.add(key)
  statistici.blocuriLegate++
  const cells = s.cells.get(key)!
  const originX = bx * REGION_SIZE
  const originY = by * REGION_SIZE
  const step = clampStep(rules)

  for (let ly = 0; ly < REGION_SIZE; ly++) {
    for (let lx = 0; lx < REGION_SIZE; lx++) {
      const mine = cells[ly * REGION_SIZE + lx]!
      if (mine === NO_REGION) continue
      const wx = originX + lx
      const wy = originY + ly

      for (let d = 0; d < 4; d++) {
        const nx = wx + (d === 0 ? 1 : d === 1 ? -1 : 0)
        const ny = wy + (d === 2 ? 1 : d === 3 ? -1 : 0)
        for (let dz = -step; dz <= step; dz++) {
          const nz = z + dz
          if (!isWalkable(t, nx, ny, nz, rules)) continue
          const nb = blockOfCell(nx, ny)
          ensureBlock(t, s, nb.bx, nb.by, nz, rules)
          const other = regionAt(s, nx, ny, nz)
          if (other !== NO_REGION) connect(s, mine, other)
        }
      }
    }
  }
}

function clampStep(rules: Rules): number {
  return Math.max(0, Math.min(4, rules.maxStepM))
}

/**
 * Intervalul de niveluri in care poate exista teren pe care se merge, intr-un bloc.
 *
 * Se citeste din relief, nu se presupune. Un bloc de pe o coasta poate avea 12 m
 * diferenta intre colturi, si toate nivelurile alea au celule pe care se sta.
 */
function groundSpan(t: Terrain, bx: number, by: number): { lo: number; hi: number } {
  let lo = Infinity
  let hi = -Infinity
  const originX = bx * REGION_SIZE
  const originY = by * REGION_SIZE
  // Patru colturi si centrul: relieful e neted la rezolutia asta, iar o sondare
  // completa de 256 de celule per bloc ar costa de 50 de ori mai mult degeaba.
  const probes = [
    [0, 0],
    [REGION_SIZE - 1, 0],
    [0, REGION_SIZE - 1],
    [REGION_SIZE - 1, REGION_SIZE - 1],
    [REGION_SIZE >> 1, REGION_SIZE >> 1],
  ] as const
  for (const [dx, dy] of probes) {
    const g = groundLevelM(t, originX + dx, originY + dy)
    if (!g.ok) continue
    if (g.value < lo) lo = g.value
    if (g.value > hi) hi = g.value
  }
  if (lo === Infinity) return { lo: 0, hi: 0 }
  return { lo, hi }
}

/**
 * Pregateste o zona: calculeaza si leaga blocurile dintr-o raza in jurul unei celule.
 *
 * `radiusBlocks` e in BLOCURI, nu in celule — cine intreaba despre reachability
 * intreaba despre o vecinatate, iar unitatea naturala a sistemului e blocul.
 *
 * Pe verticala NU se acopera o banda fixa in jurul lui `z`, ci **suprafata**:
 * pentru fiecare bloc se citeste intervalul lui de cote si se acopera de acolo.
 * Prima versiune acoperea `z ± maxStepM`, si pe o coasta prindea doar celulele al
 * caror sol nimerea exact acele trei niveluri — adica o banda subtire de contur.
 * S-a vazut instantaneu in overlay si nu s-ar fi vazut deloc intr-un test.
 *
 * `depthBelow` coboara sub sol pentru camerele sapate. Zero inseamna „doar
 * suprafata", si e alegerea corecta cand nu te intereseaza interioarele.
 */
export function ensureArea(
  t: Terrain,
  s: RegionStore,
  wx: number,
  wy: number,
  z: number,
  radiusBlocks: number,
  rules: Rules,
  depthBelow = 0,
): void {
  const { bx, by } = blockOfCell(wx, wy)
  const step = clampStep(rules)
  const legateInainte = s.legate.size
  for (let dy = -radiusBlocks; dy <= radiusBlocks; dy++) {
    for (let dx = -radiusBlocks; dx <= radiusBlocks; dx++) {
      const nbx = bx + dx
      const nby = by + dy
      if (nbx < 0 || nby < 0 || nbx >= WORLD_BLOCKS || nby >= WORLD_BLOCKS) continue
      const span = groundSpan(t, nbx, nby)
      // Solul e la `g`, deci se sta la `g + 1`. Marginea de sus adauga un pas, cea
      // de jos coboara cat s-a cerut plus un pas, ca sa prinda si legaturile.
      const lo = Math.min(span.lo, z) - depthBelow - step
      const hi = Math.max(span.hi, z) + 1 + step
      for (let zz = lo; zz <= hi; zz++) linkBlock(t, s, nbx, nby, zz, rules)
    }
  }
  // Re-etichetarea costa O(regiuni + muchii) si e inutila daca n-a aparut nicio
  // muchie noua. `connect` se apeleaza doar din `linkBlock`, iar `linkBlock` face
  // treaba doar cand adauga in `legate` — deci marimea aia e semnalul exact.
  if (s.legate.size !== legateInainte) relabel(s)
}

// --- interogarea ------------------------------------------------------------

/**
 * Exista vreo sansa de drum intre doua celule?
 *
 * Raspunsul NEGATIV e definitiv: nu porni A*. Raspunsul POZITIV inseamna „poate",
 * si A*-ul ramane autoritatea. Vezi nota despre falsul pozitiv din antetul
 * modulului — e o decizie, nu o scapare.
 *
 * Daca vreuna dintre celule nu e intr-o regiune calculata, raspunsul e „nu":
 * un bloc necalculat nu e o promisiune, e o necunoscuta, iar necunoscuta nu are
 * voie sa porneasca un A*.
 */
export function areConnected(
  s: RegionStore,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
): boolean {
  const ra = regionAt(s, ax, ay, az)
  if (ra === NO_REGION) return false
  const rb = regionAt(s, bx, by, bz)
  if (rb === NO_REGION) return false
  const ca = find(s, ra)
  return ca !== NO_REGION && ca === find(s, rb)
}

/** Cate regiuni distincte sunt calculate. Pentru overlay-ul de debug si pentru teste. */
export function regionCount(s: RegionStore): number {
  const seen = new Set<number>()
  for (const key of s.keys) {
    const cells = s.cells.get(key)!
    for (let i = 0; i < BLOCK_CELLS; i++) {
      const r = cells[i]!
      if (r !== NO_REGION) seen.add(r)
    }
  }
  return seen.size
}

/** Cate componente conexe distincte. Asta e cifra care conteaza pentru joc. */
export function componentCount(s: RegionStore): number {
  const seen = new Set<number>()
  for (const key of s.keys) {
    const cells = s.cells.get(key)!
    for (let i = 0; i < BLOCK_CELLS; i++) {
      const r = cells[i]!
      if (r !== NO_REGION) seen.add(find(s, r))
    }
  }
  return seen.size
}

// --- invalidare -------------------------------------------------------------

/**
 * O editare de teren la (wx, wy, z) murdareste ce blocuri?
 *
 * Mai multe decat pare, si fiecare are un motiv:
 *  - nivelurile de la z-1-step pana la z+headroom+step, fiindca walkability
 *    citeste podeaua de dedesubt si spatiul de deasupra, iar legaturile
 *    verticale ajung inca `maxStepM` in fiecare directie;
 *  - blocurile VECINE, daca celula sta pe marginea unui bloc — o celula noua la
 *    granita poate uni doua regiuni care erau separate.
 *
 * Supra-murdarirea costa timp. Sub-murdarirea da un graf care minte, si minte
 * TACUT: pionul pleaca spre ceva ce nu poate atinge, iar cauza se vede peste trei
 * luni. Aleg supra-murdarirea, explicit.
 */
export function markDirty(s: RegionStore, wx: number, wy: number, z: number, rules: Rules): void {
  const step = clampStep(rules)
  const zLow = z - 1 - step
  const zHigh = z + rules.agentHeadroomM + step

  const { bx, by } = blockOfCell(wx, wy)
  const lx = wx - bx * REGION_SIZE
  const ly = wy - by * REGION_SIZE

  for (let zz = zLow; zz <= zHigh; zz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        // Numai blocurile chiar atinse: centrul mereu, vecinii doar daca celula
        // e pe latura dinspre ei.
        if (dx === -1 && lx !== 0) continue
        if (dx === 1 && lx !== REGION_SIZE - 1) continue
        if (dy === -1 && ly !== 0) continue
        if (dy === 1 && ly !== REGION_SIZE - 1) continue
        const nbx = bx + dx
        const nby = by + dy
        if (nbx < 0 || nby < 0 || nbx >= WORLD_BLOCKS || nby >= WORLD_BLOCKS) continue
        s.dirty.add(blockKey(nbx, nby, zz))
      }
    }
  }
}

/** Coordonatele unui bloc, din cheia lui. */
/** Inversa lui `blockKey`. Exportata ca `decodeBlockKey` pentru oracolul din teste. */
export function decodeBlockKey(key: number): { bx: number; by: number; z: number } {
  const z = (key % Z_SPAN) - Z_OFFSET
  const flat = Math.floor(key / Z_SPAN)
  return { bx: flat % WORLD_BLOCKS, by: Math.floor(flat / WORLD_BLOCKS), z }
}

/**
 * Recalculeaza ce s-a murdarit. INCREMENTAL.
 *
 * Varianta dinainte arunca TOATE celulele rezidente si le recalcula, fiindca
 * union-find-ul nu poate desface o unire. Masurat atunci: ~25/30/34 ms la
 * 44/94/171 de blocuri, fata de un buget de sub 1 ms pe sapatura.
 *
 * Acum se recalculeaza numai blocurile murdare. Trucul e ca partea SCUMPA sunt
 * celulele — `isWalkable` peste 256 de celule × niveluri — iar partea ieftina e
 * eticheta de componenta, care e o parcurgere peste intregi. Deci celulele stau,
 * si se re-eticheteaza totul.
 *
 * **Masurat dupa** (`node tools/bench-regions.mjs`): 3,3 / 2,9 / **2,8 ms** la
 * 85 / 264 / 600 de blocuri rezidente. Ce conteaza nu e cifra, e FORMA: inainte
 * costul crestea cu rezidenta, acum nu mai creste deloc. Aia e definitia lui
 * „incremental" — costa cat s-a schimbat, nu cat exista.
 *
 * Nu e insa „gata": 2,8 ms e tot peste bugetul de sub 1 ms al unei sapaturi, deci
 * ramane in afara caii interactive pana cand exista un motiv masurat sa fie in ea.
 * Si mai e o limita, scrisa aici ca sa nu fie descoperita la luna 12: `relabel`
 * parcurge TOATE celulele rezidente ca sa afle ce regiuni traiesc, deci partea
 * aia inca scaleaza cu rezidenta. La 600 de blocuri nu se vede; la discul complet
 * ar fi milioane de celule. Leacul, cand va fi nevoie, e un index de regiuni vii
 * intretinut la scriere, nu o parcurgere la citire.
 *
 * ## De ce se ating si vecinii
 *
 * O muchie exista numai intre blocuri ORIZONTAL vecine, in limita `maxStepM` pe
 * verticala. Deci orice regiune care are o muchie catre un bloc murdar traieste
 * intr-un bloc vecin cu el — nicaieri altundeva. Se sterg muchiile regiunilor din
 * blocurile murdare SI din vecinii lor, apoi se releaga amandoua categoriile:
 * asa nu ramane niciun ciot catre un id care intre timp a disparut.
 *
 * Un ciot ar fi cel mai prost fel de defect posibil: `areConnected` ar raspunde
 * „da" pe o legatura care nu mai exista, adica exact falsul pozitiv pe care
 * antetul modulului il declara inacceptabil in directia aia.
 */
export function rebuildDirty(t: Terrain, s: RegionStore, rules: Rules): number {
  if (s.dirty.size === 0) return 0

  // determinism-ok: se sorteaza explicit inainte de iterare, tocmai fiindca
  // `Set` pastreaza ordinea de inserare, iar aia depinde de ordinea comenzilor.
  const murdare = [...s.dirty].sort((a, b) => a - b).filter((k) => s.cells.has(k))
  s.dirty.clear()
  if (murdare.length === 0) return 0

  const step = clampStep(rules)

  // Blocurile ale caror muchii pot atinge un bloc murdar: ele insele plus vecinii
  // orizontali, pe fiecare nivel din raza pasului.
  const atinse = new Set<number>()
  for (const key of murdare) {
    atinse.add(key)
    const { bx, by, z } = decodeBlockKey(key)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nbx = bx + dx
      const nby = by + dy
      if (nbx < 0 || nby < 0 || nbx >= WORLD_BLOCKS || nby >= WORLD_BLOCKS) continue
      for (let dz = -step; dz <= step; dz++) {
        const k = blockKey(nbx, nby, z + dz)
        if (s.cells.has(k)) atinse.add(k)
      }
    }
  }

  // Muchiile regiunilor atinse dispar. Cele din capatul celalalt dispar si ele,
  // fiindca `connect` le-a scris simetric.
  for (const key of atinse) {
    // Muchiile lui dispar, deci nu mai e legat.
    s.legate.delete(key)
    const cells = s.cells.get(key)!
    for (let i = 0; i < BLOCK_CELLS; i++) {
      const r = cells[i]!
      if (r === NO_REGION) continue
      const vecini = s.adj.get(r)
      if (!vecini) continue
      for (const v of vecini) s.adj.get(v)?.delete(r)
      s.adj.delete(r)
    }
  }

  // Numai blocurile MURDARE isi pierd celulele. Vecinii si le pastreaza — asta e
  // toata diferenta fata de varianta dinainte.
  for (const key of murdare) {
    const cells = s.cells.get(key)!
    for (let i = 0; i < BLOCK_CELLS; i++) {
      const r = cells[i]!
      if (r !== NO_REGION) { s.regionBlock.delete(r); s.ancora.delete(r) }
    }
    s.cells.delete(key)
    s.legate.delete(key)
    const pos = s.keys.indexOf(key)
    if (pos >= 0) s.keys.splice(pos, 1)
  }

  const ordonate = [...atinse].sort((a, b) => a - b)
  for (const key of ordonate) {
    const { bx, by, z } = decodeBlockKey(key)
    ensureBlock(t, s, bx, by, z, rules)
  }
  for (const key of ordonate) {
    const { bx, by, z } = decodeBlockKey(key)
    linkBlock(t, s, bx, by, z, rules)
  }

  relabel(s)
  s.epoca++
  return murdare.length
}
