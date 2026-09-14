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
import { materialAt, WORLD_CELLS } from './terrain/terrain.ts'

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
function materialFast(t: Terrain, wx: number, wy: number, z: number): number {
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
  /** Union-find peste id-urile de regiune. */
  parent: Int32Array
  /** Urmatorul id de regiune liber. */
  nextId: number
  /** Blocuri care trebuie recalculate inainte de urmatoarea interogare. */
  readonly dirty: Set<number>
}

export function createRegions(): RegionStore {
  return { cells: new Map(), keys: [], parent: new Int32Array(0), nextId: 0, dirty: new Set() }
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

function ensureParentCapacity(s: RegionStore, needed: number): void {
  if (needed <= s.parent.length) return
  const grown = new Int32Array(Math.max(needed, s.parent.length * 2, 64))
  grown.set(s.parent)
  for (let i = s.parent.length; i < grown.length; i++) grown[i] = i
  s.parent = grown
}

export function find(s: RegionStore, a: number): number {
  let r = a
  while (s.parent[r]! !== r) r = s.parent[r]!
  // Compresie de cale: iterativa, ca sa nu existe recursie in nucleu.
  let cur = a
  while (s.parent[cur]! !== cur) {
    const next = s.parent[cur]!
    s.parent[cur] = r
    cur = next
  }
  return r
}

function union(s: RegionStore, a: number, b: number): void {
  const ra = find(s, a)
  const rb = find(s, b)
  if (ra === rb) return
  // Legatura mereu spre id-ul mai MIC: face rezultatul independent de ordinea
  // in care au venit unirile, deci reproductibil.
  if (ra < rb) s.parent[rb] = ra
  else s.parent[ra] = rb
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
    ensureParentCapacity(s, s.nextId)
    s.parent[id] = id

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
  if (!s.cells.has(key)) computeBlock(t, s, key, bx, by, z, rules)
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
export function linkBlock(t: Terrain, s: RegionStore, bx: number, by: number, z: number, rules: Rules): void {
  const key = ensureBlock(t, s, bx, by, z, rules)
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
          if (other !== NO_REGION) union(s, mine, other)
        }
      }
    }
  }
}

function clampStep(rules: Rules): number {
  return Math.max(0, Math.min(4, rules.maxStepM))
}

/**
 * Pregateste o zona: calculeaza si leaga blocurile dintr-o raza in jurul unei celule.
 *
 * `radiusBlocks` e in BLOCURI, nu in celule — cine intreaba despre reachability
 * intreaba despre o vecinatate, iar unitatea naturala a sistemului e blocul.
 */
export function ensureArea(
  t: Terrain,
  s: RegionStore,
  wx: number,
  wy: number,
  z: number,
  radiusBlocks: number,
  rules: Rules,
): void {
  const { bx, by } = blockOfCell(wx, wy)
  const step = clampStep(rules)
  for (let dz = -step; dz <= step; dz++) {
    for (let dy = -radiusBlocks; dy <= radiusBlocks; dy++) {
      for (let dx = -radiusBlocks; dx <= radiusBlocks; dx++) {
        const nbx = bx + dx
        const nby = by + dy
        if (nbx < 0 || nby < 0 || nbx >= WORLD_BLOCKS || nby >= WORLD_BLOCKS) continue
        linkBlock(t, s, nbx, nby, z + dz, rules)
      }
    }
  }
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
  return find(s, ra) === find(s, rb)
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
function decodeKey(key: number): { bx: number; by: number; z: number } {
  const z = (key % Z_SPAN) - Z_OFFSET
  const flat = Math.floor(key / Z_SPAN)
  return { bx: flat % WORLD_BLOCKS, by: Math.floor(flat / WORLD_BLOCKS), z }
}

/**
 * Recalculeaza ce s-a murdarit si reface legaturile.
 *
 * Union-find-ul se reconstruieste de la ZERO peste toate blocurile rezidente, si
 * asta e o limita cunoscuta, nu o scapare: o unire nu se poate desface, deci dupa
 * o sapatura care RUPE o legatura, singurul rezultat corect e reconstructia.
 *
 * **Si costa prea mult. Masurat** (`node tools/bench-regions.mjs`, 14.09.2026):
 *
 *   44 blocuri rezidente  → ~25 ms
 *   94 blocuri            → ~30 ms
 *   171 blocuri           → ~34 ms
 *
 * Bugetul unei sapaturi e sub 1 ms — deci reconstructia e cu **peste 30× peste**
 * si nu are ce cauta sincron in cadrul in care jucatorul a dat click. Merge acum
 * fiindca nu exista inca agenti care sa intrebe, si e scris aici cu cifra tocmai
 * ca sa nu treaca drept „destul de rapid" la S12-15.
 *
 * Inlocuitorul, cand va fi nevoie: etichetare incrementala — se recalculeaza doar
 * componentele atinse, prin re-flood din regiunile murdare, in loc de tot.
 * Pragul la care devine obligatoriu: primul agent care cere un drum.
 */
export function rebuildDirty(t: Terrain, s: RegionStore, rules: Rules): number {
  if (s.dirty.size === 0) return 0

  // determinism-ok: se sorteaza explicit inainte de iterare, tocmai fiindca
  // `Set` pastreaza ordinea de inserare, iar aia depinde de ordinea comenzilor.
  const murdare = [...s.dirty].sort((a, b) => a - b)
  s.dirty.clear()

  const deRefacut = new Set<number>()
  for (const key of s.keys) deRefacut.add(key)
  let reciclate = 0
  for (const key of murdare) {
    if (deRefacut.has(key)) reciclate++
    deRefacut.add(key)
  }

  s.cells.clear()
  s.keys.length = 0
  s.nextId = 0
  s.parent = new Int32Array(0)

  const ordonate = [...deRefacut].sort((a, b) => a - b)
  for (const key of ordonate) {
    const { bx, by, z } = decodeKey(key)
    ensureBlock(t, s, bx, by, z, rules)
  }
  for (const key of ordonate) {
    const { bx, by, z } = decodeKey(key)
    linkBlock(t, s, bx, by, z, rules)
  }
  return reciclate
}
