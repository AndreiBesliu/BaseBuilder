/**
 * Binary greedy meshing.
 *
 * Transforma un chunk promovat intr-un mesh. Doua etape:
 *
 * 1. **Vizibilitatea, pe biti.** O linie de 32 de voxeli pe axa X incape exact
 *    intr-un `Uint32`. Fetele de pe axa X ies dintr-o singura operatie pe toata
 *    linia: `solid & ~(solid >>> 1)`. Asta e motivul pentru care chunk-ul e lat
 *    de 32 si nu de 64 — JavaScript n-are typed array pe 64 de biti, iar un chunk
 *    de 64 ar cere doua cuvinte pe linie si ar pierde exact trucul.
 *
 * 2. **Unirea in dreptunghiuri.** Fetele vecine de acelasi material se unesc
 *    lacom intr-un singur quad. Un perete de 20 × 8 devine UN quad, nu 160.
 *
 * Modulul e pur: citeste starea de simulare, nu o atinge. Nu importa nimic de
 * motor, ca sa poata fi masurat headless si portat odata cu nucleul.
 *
 * Limita cunoscuta de la S6-8 — fetele de granita emise mereu — e INCHISA:
 * `meshChunk(chunk, neighbours)` taie fetele acoperite de chunk-ul vecin.
 * Masurat pe fixtura M10: 674.582 din 779.888 de fete de granita erau ascunse
 * (86,5%), iar dupa unirea lacoma raman **−5,3% quaduri**. Fara `neighbours`,
 * comportamentul e IDENTIC cu cel dinainte, si asta e testat.
 *
 * Pretul nu e in cod, e in invalidare: o sapatura pe marginea unui chunk trebuie
 * sa re-meshuiasca si vecinul, altfel ramane o gaura prin care se vede fundalul.
 */

import type { Chunk } from '../sim/terrain/chunk.ts'
import { cellHeightCm, CHUNK_CELLS, decodeColumn, groundLevelFromCm, isSolid, VERTS, VOXEL_LEVELS } from '../sim/terrain/chunk.ts'

const SX = CHUNK_CELLS
const SY = CHUNK_CELLS
const SZ = VOXEL_LEVELS
const ROWS = SY * SZ

/** Directiile de fata, in ordinea folosita peste tot in modul. */
export const Face = {
  X_POS: 0,
  X_NEG: 1,
  Y_POS: 2,
  Y_NEG: 3,
  Z_POS: 4,
  Z_NEG: 5,
} as const

export interface ChunkMesh {
  quadCount: number
  /**
   * 4 varfuri × 3 componente per quad, in coordonate locale de chunk, in
   * **CENTIMETRI**.
   *
   * Erau metri. Au devenit centimetri fiindca suprafata NEATINSA a unui chunk
   * promovat se deseneaza la cota ei reala, iar aia are precizie de centimetru
   * (`vertexCm`) — pasul zgomotului e de 18 cm, deci decimetrii ar reintroduce
   * terase, doar de zece ori mai mici.
   *
   * Alternativa — un al doilea tablou, doar pentru inaltimile netezite — ar fi
   * insemnat doua surse de adevar pentru aceeasi pozitie. Int16 ajunge: 3200 cm pe
   * X si Y, 6400 pe Z.
   */
  positions: Int16Array
  /** Materialul fiecarui quad. */
  materials: Uint8Array
  /** Directia fetei fiecarui quad, 0-5. */
  faces: Uint8Array
  /**
   * Ocluzia ambientala, 4 varfuri per quad, valori 0-3 (0 = cel mai inchis).
   * Aceeasi ordine ca varfurile din `positions`.
   */
  ao: Uint8Array
}

// Buffere de lucru, reutilizate intre chunk-uri. Zero alocari in bucla fierbinte.
const dense = new Uint8Array(SX * SY * SZ)
const solid = new Uint32Array(ROWS)
const vis: Uint32Array[] = [
  new Uint32Array(ROWS),
  new Uint32Array(ROWS),
  new Uint32Array(ROWS),
  new Uint32Array(ROWS),
  new Uint32Array(ROWS),
  new Uint32Array(ROWS),
]
/**
 * Cheia de unire: `material | (tiparAO << 8)`.
 *
 * AO intra in CHEIE, nu intr-un atribut separat, si asta e tot designul: `greedy`
 * ramane neatins si uneste doar celule cu acelasi material SI acelasi tipar.
 * Regula iese si corecta, nu doar comoda — o dunga lunga cu ocluzie uniforma
 * TREBUIE sa fie un singur quad, iar una in care ocluzia variaza de-a lungul ei
 * are tipare diferite si nu se uneste oricum.
 *
 * Pretul, masurat pe fixtura M10 inainte de a scrie codul: 90.932 -> 200.216 de
 * dreptunghiuri, +120%. Cuantizarea la doua niveluri ar scadea doar la +107% —
 * ce rupe unirea e ORICE variatie, nu numarul de niveluri.
 */
const grid = new Uint16Array(Math.max(SY * SZ, SX * SZ, SX * SY))
const column = new Uint8Array(SZ)

const denseIndex = (lx: number, ly: number, level: number): number => level * SX * SY + ly * SX + lx

/**
 * Ocuparea, cu un APRON de o celula pe X si Y.
 *
 * AO citeste trei vecini in jurul fiecarui colt, deci pentru o celula de pe
 * marginea chunk-ului citeste in afara lui. Fara apron, fiecare chunk si-ar
 * calcula singur colturile ca neocluzate, iar vecinul la fel — adica o cusatura
 * de ILUMINARE pe toata granita, exact clasa de defect pe care K16 a inchis-o
 * pentru culoare si geometrie.
 *
 * Apronul are nevoie si de DIAGONALE: coltul (-1,-1) al chunk-ului nu vine de la
 * niciunul dintre cei patru vecini de latura. Fara ele ar ramane patru coloane
 * de colt gresite per chunk — adica tot o cusatura, doar mai rara.
 *
 * Pe Z nu exista apron: in afara ferestrei de voxeli se considera AER, exact ca
 * in `computeVisibility`. Consecventa cu vizibilitatea conteaza mai mult decat
 * fidelitatea fizica — altfel AO ar intuneca o fata care nici nu se emite.
 */
const OX = SX + 2
const OY = SY + 2
const occ = new Uint8Array(OX * OY * SZ)
const occIndex = (x: number, y: number, level: number): number => level * OX * OY + (y + 1) * OX + (x + 1)

/**
 * Nivelul pe care generatorul l-ar da suprafetei fiecarei coloane, cu apron.
 *
 * `-32768` inseamna „nu stiu" (vecin lipsa), si atunci nu se netezeste nimic la
 * granita aia — aceeasi presupunere sigura ca peste tot in modul.
 *
 * Cheia intregului mecanism: o fata de sus se netezeste DACA SI NUMAI DACA nivelul
 * ei e cel de aici. Daca cineva a sapat, nivelul nu se potriveste si fata ramane
 * plata — adica groapa arata ca o groapa, nu ca o adancitura in panta. Nu e nevoie
 * de niciun camp nou de stare: „atins de jucator" se citeste din diferenta dintre
 * ce e si ce ar fi fost.
 */
const NECUNOSCUT = -32768
const natLevel = new Int32Array(OX * OY)
/**
 * „Coloana asta are suprafata exact unde ar fi pus-o generatorul?", per coloana.
 *
 * Se calculeaza O DATA, in `umpleNatLevel`, nu la fiecare intrebare: e citita de
 * `treaptaNaturala` in buclele de fete laterale SI de patru ori per fata netezita
 * in `pushFusta`. Masurat inainte de cache, pe fixtura M10: fusta costa +22,9% din
 * timpul de meshing pentru +1,1% quaduri — disproportia era aici, nu in geometrie.
 */
const natSuprafata = new Uint8Array(OX * OY)
const natIndex = (x: number, y: number): number => (y + 1) * OX + (x + 1)

function natAt(x: number, y: number): number {
  if (x < -1 || y < -1 || x > SX || y > SY) return NECUNOSCUT
  return natLevel[natIndex(x, y)]!
}

/** Cotele celor patru varfuri ale unei celule, in cm LOCALI (fata de zBase). */
function varfuriCm(chunk: Chunk, lx: number, ly: number, out: Int32Array): void {
  const v = chunk.vertexCm
  const z0 = chunk.voxels!.zBaseM * 100
  out[0] = v[ly * VERTS + lx]! - z0
  out[1] = v[ly * VERTS + lx + 1]! - z0
  out[2] = v[(ly + 1) * VERTS + lx + 1]! - z0
  out[3] = v[(ly + 1) * VERTS + lx]! - z0
}

const varfBuf = new Int32Array(4)

function umpleNatLevel(chunk: Chunk, n: ChunkNeighbours | undefined): void {
  natLevel.fill(NECUNOSCUT)
  natSuprafata.fill(0)
  const z0 = chunk.voxels!.zBaseM
  for (let ly = 0; ly < SY; ly++) {
    for (let lx = 0; lx < SX; lx++) {
      natLevel[natIndex(lx, ly)] = groundLevelFromCm(cellHeightCm(chunk, lx, ly)) - z0
    }
  }
  if (!n) { calculeazaNatSuprafata(); return }
  // Apronul: nivelul vecinului, adus in sistemul de niveluri al chunk-ului ASTA.
  const lat = (vec: Chunk | null | undefined, nLx: number, nLy: number, x: number, y: number): void => {
    if (!vec?.voxels) return
    natLevel[natIndex(x, y)] = groundLevelFromCm(cellHeightCm(vec, nLx, nLy)) - z0
  }
  for (let ly = 0; ly < SY; ly++) {
    lat(n.xNeg, SX - 1, ly, -1, ly)
    lat(n.xPos, 0, ly, SX, ly)
  }
  for (let lx = 0; lx < SX; lx++) {
    lat(n.yNeg, lx, SY - 1, lx, -1)
    lat(n.yPos, lx, 0, lx, SY)
  }
  calculeazaNatSuprafata()
}

/** Derivat din `natLevel` si `occ`, deci DUPA ce amandoua sunt complete. */
function calculeazaNatSuprafata(): void {
  for (let y = -1; y <= SY; y++) {
    for (let x = -1; x <= SX; x++) {
      const nv = natLevel[natIndex(x, y)]!
      if (nv === NECUNOSCUT) continue
      if (occAt(x, y, nv) === 1 && occAt(x, y, nv + 1) === 0) natSuprafata[natIndex(x, y)] = 1
    }
  }
}

/**
 * E fata asta un perete de treapta intre doua coloane NEATINSE?
 *
 * Conditia e exact intervalul in care peretele exista DOAR din cauza cuantizarii:
 * nivelul e in pamantul natural al coloanei mele si deasupra celui al vecinei. Cu
 * fetele de sus inclinate, cele doua suprafete se intalnesc pe muchia comuna — au
 * literalmente aceleasi varfuri din `vertexCm` — deci peretele nu mai acopera nimic.
 *
 * Daca cineva a sapat in vecina, nivelul ei natural nu se schimba (e o proprietate a
 * GENERATORULUI), iar peretele gropii e sub el — deci nu se suprima. Groapa ramane
 * groapa.
 *
 * Fara netezire, `natLevel` e plin de `NECUNOSCUT` si functia raspunde mereu `false`.
 */
/**
 * Are coloana asta suprafata EXACT unde ar fi pus-o generatorul?
 *
 * Adica: solid la nivelul natural, aer deasupra. Daca cineva a sapat, nu.
 * Conteaza fiindca doar o suprafata naturala primeste fata de sus NETEZITA — iar
 * peretele dintre doua coloane se poate suprima numai daca AMANDOUA sunt netezite,
 * altfel raman doua tavane la cote diferite si o gaura intre ele.
 */
function suprafataNaturala(x: number, y: number): boolean {
  if (x < -1 || y < -1 || x > SX || y > SY) return false
  return natSuprafata[natIndex(x, y)] === 1
}

function treaptaNaturala(x: number, y: number, nx: number, ny: number, level: number): boolean {
  if (!suprafataNaturala(x, y) || !suprafataNaturala(nx, ny)) return false
  return level <= natAt(x, y) && level > natAt(nx, ny)
}

function occAt(x: number, y: number, level: number): number {
  if (level < 0 || level >= SZ) return 0
  if (x < -1 || y < -1 || x > SX || y > SY) return 0
  return occ[occIndex(x, y, level)]!
}

/** Desface chunk-ul in materiale dense si in masti de solid pe linii de 32. */
function expand(chunk: Chunk): void {
  const v = chunk.voxels
  if (!v) throw new Error('mesh pe un chunk ne-promovat')
  solid.fill(0)
  occ.fill(0)

  for (let ly = 0; ly < SY; ly++) {
    for (let lx = 0; lx < SX; lx++) {
      decodeColumn(v, ly * SX + lx, column)
      const bit = 1 << lx
      for (let level = 0; level < SZ; level++) {
        const m = column[level]!
        dense[denseIndex(lx, ly, level)] = m
        if (isSolid(m)) {
          solid[level * SY + ly]! |= bit
          occ[occIndex(lx, ly, level)] = 1
        }
      }
    }
  }
}

/** O coloana din vecin in apron, cu decalajul de stiva aplicat. */
function apronColumn(own: Chunk, neighbour: Chunk | null | undefined, nLx: number, nLy: number, x: number, y: number): void {
  const nv = neighbour?.voxels
  if (!nv) return
  const dz = own.voxels!.zBaseM - nv.zBaseM
  decodeColumn(nv, nLy * SX + nLx, column)
  for (let level = 0; level < SZ; level++) {
    const nl = level + dz
    if (nl < 0 || nl >= SZ) continue
    if (isSolid(column[nl]!)) occ[occIndex(x, y, level)] = 1
  }
}

/**
 * Umple apronul din vecini. Un vecin lipsa lasa apronul pe zero, adica „dincolo
 * e aer" — aceeasi presupunere sigura ca la taierea fetelor de granita.
 */
function expandApron(chunk: Chunk, n: ChunkNeighbours): void {
  for (let ly = 0; ly < SY; ly++) {
    apronColumn(chunk, n.xNeg, SX - 1, ly, -1, ly)
    apronColumn(chunk, n.xPos, 0, ly, SX, ly)
  }
  for (let lx = 0; lx < SX; lx++) {
    apronColumn(chunk, n.yNeg, lx, SY - 1, lx, -1)
    apronColumn(chunk, n.yPos, lx, 0, lx, SY)
  }
  apronColumn(chunk, n.xNegYNeg, SX - 1, SY - 1, -1, -1)
  apronColumn(chunk, n.xPosYNeg, 0, SY - 1, SX, -1)
  apronColumn(chunk, n.xNegYPos, SX - 1, 0, -1, SY)
  apronColumn(chunk, n.xPosYPos, 0, 0, SX, SY)
}

/**
 * Axele fiecarei fete: normala, apoi cele doua tangente (u, v), in ORDINEA in
 * care `meshChunk` le foloseste la emiterea quadului. Ordinea conteaza: coltul 0
 * al tiparului trebuie sa fie varful 0 al quadului.
 */
const AO_AXE: readonly (readonly number[])[] = [
  [1, 0, 0, 0, 1, 0, 0, 0, 1], // X_POS: n=+X, u=Y, v=Z
  [-1, 0, 0, 0, 1, 0, 0, 0, 1], // X_NEG
  [0, 1, 0, 1, 0, 0, 0, 0, 1], // Y_POS: n=+Y, u=X, v=Z
  [0, -1, 0, 1, 0, 0, 0, 0, 1], // Y_NEG
  [0, 0, 1, 1, 0, 0, 0, 1, 0], // Z_POS: n=+Z, u=X, v=Y
  [0, 0, -1, 1, 0, 0, 0, 1, 0], // Z_NEG
]

/** Semnele celor patru colturi, in ordinea varfurilor: (u,v), (u+,v), (u+,v+), (u,v+). */
const AO_COLTURI: readonly (readonly number[])[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]

/**
 * Tiparul de AO al unei fete: patru colturi × doua biti, 0 = cel mai inchis.
 *
 * Regula clasica: doua laturi ocupate inchid coltul complet, altfel se scade
 * fiecare vecin ocupat. Nu e o aproximare a unei integrale de lumina, e o regula
 * de LIZIBILITATE: face ca o imbinare concava sa se vada ca imbinare.
 */
function aoPattern(face: number, lx: number, ly: number, level: number): number {
  const a = AO_AXE[face]!
  const px = lx + a[0]!
  const py = ly + a[1]!
  const pz = level + a[2]!
  let tipar = 0
  for (let c = 0; c < 4; c++) {
    const su = AO_COLTURI[c]![0]!
    const sv = AO_COLTURI[c]![1]!
    const ux = su * a[3]!, uy = su * a[4]!, uz = su * a[5]!
    const vx = sv * a[6]!, vy = sv * a[7]!, vz = sv * a[8]!
    const s1 = occAt(px + ux, py + uy, pz + uz)
    const s2 = occAt(px + vx, py + vy, pz + vz)
    const colt = occAt(px + ux + vx, py + uy + vy, pz + uz + vz)
    const ao = s1 !== 0 && s2 !== 0 ? 0 : 3 - (s1 + s2 + colt)
    tipar |= ao << (c * 2)
  }
  return tipar
}

/** Mastile de vizibilitate, toate sase, din operatii pe cuvinte intregi. */
function computeVisibility(): void {
  for (let level = 0; level < SZ; level++) {
    for (let ly = 0; ly < SY; ly++) {
      const i = level * SY + ly
      const s = solid[i]!

      // Axa X: vecinul e in acelasi cuvant, la un bit distanta.
      vis[Face.X_POS]![i] = s & ~(s >>> 1)
      vis[Face.X_NEG]![i] = s & ~(s << 1)

      // Axa Y: vecinul e linia urmatoare din aceeasi felie.
      const yNext = ly + 1 < SY ? solid[i + 1]! : 0
      const yPrev = ly > 0 ? solid[i - 1]! : 0
      vis[Face.Y_POS]![i] = s & ~yNext
      vis[Face.Y_NEG]![i] = s & ~yPrev

      // Axa Z: vecinul e aceeasi linie din felia urmatoare.
      const zNext = level + 1 < SZ ? solid[i + SY]! : 0
      const zPrev = level > 0 ? solid[i - SY]! : 0
      vis[Face.Z_POS]![i] = s & ~zNext
      vis[Face.Z_NEG]![i] = s & ~zPrev
    }
  }
}

/** Buffere de iesire, crescute la nevoie si reutilizate. */
let outPositions = new Int16Array(4 * 3 * 4096)
let outMaterials = new Uint8Array(4096)
let outFaces = new Uint8Array(4096)
let outAo = new Uint8Array(4 * 4096)
let quadCount = 0

function ensureCapacity(needed: number): void {
  if (needed <= outMaterials.length) return
  let cap = outMaterials.length
  while (cap < needed) cap *= 2
  const p = new Int16Array(4 * 3 * cap)
  p.set(outPositions)
  outPositions = p
  const m = new Uint8Array(cap)
  m.set(outMaterials)
  outMaterials = m
  const f = new Uint8Array(cap)
  f.set(outFaces)
  outFaces = f
  const a = new Uint8Array(4 * cap)
  a.set(outAo)
  outAo = a
}

/**
 * Despacheteaza tiparul de AO in cele patru varfuri ale quadului curent.
 *
 * Era scris de doua ori, in `pushQuad` si in `pushFataNetezita`, si de data asta
 * cele doua copii chiar spuneau acelasi lucru — ambele cai emit varfurile in
 * ordinea (u,v), (u+,v), (u+,v+), (u,v+), deci si colturile tiparului merg la fel.
 * S-au unit dupa ce suita de mutatii a raportat TIPAR AMBIGUU: un tipar care se
 * potriveste in doua locuri ar fi editat alt loc decat cel gandit.
 */
function scrieAo(cheie: number): void {
  const tipar = cheie >>> 8
  const a = quadCount * 4
  outAo[a] = tipar & 3
  outAo[a + 1] = (tipar >>> 2) & 3
  outAo[a + 2] = (tipar >>> 4) & 3
  outAo[a + 3] = (tipar >>> 6) & 3
}

/** Metri de grila → centimetri. Un singur loc care stie factorul. */
const CM = 100

/**
 * O fata de sus NETEZITA: colturile ei stau la cotele reale ale terenului.
 *
 * Se emite 1×1 si in afara unirii lacome, fiindca patru colturi la cote diferite
 * nu se pot uni cu nimic — si nici n-ar trebui: unirea exista ca sa reduca fete
 * IDENTICE, iar astea nu mai sunt.
 */
/** Scrie un quad direct in CENTIMETRI. Singura cale prin care ies pozitii. */
function pushQuadCm(
  face: number,
  cheie: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
): void {
  ensureCapacity(quadCount + 1)
  const o = quadCount * 12
  outPositions[o] = ax; outPositions[o + 1] = ay; outPositions[o + 2] = az
  outPositions[o + 3] = bx; outPositions[o + 4] = by; outPositions[o + 5] = bz
  outPositions[o + 6] = cx; outPositions[o + 7] = cy; outPositions[o + 8] = cz
  outPositions[o + 9] = dx; outPositions[o + 10] = dy; outPositions[o + 11] = dz
  outMaterials[quadCount] = cheie & 0xff
  outFaces[quadCount] = face
  scrieAo(cheie)
  quadCount++
}

function pushFataNetezita(cheie: number, lx: number, ly: number, cm: Int32Array): void {
  const x0 = lx * CM, x1 = (lx + 1) * CM, y0 = ly * CM, y1 = (ly + 1) * CM
  pushQuadCm(Face.Z_POS, cheie, x0, y0, cm[0]!, x1, y0, cm[1]!, x1, y1, cm[2]!, x0, y1, cm[3]!)
}

/**
 * FUSTA: banda dintre cota NETEZITA a unei muchii si varful PLAT al voxelului.
 *
 * Netezirea muta varfurile fetei de sus la cotele reale, care se abat de la
 * `(nivel+1)*100` cu pana la ±77 cm. Cand vecina de dincolo de muchie NU e
 * netezita — apa, o groapa, o coloana zidita — tavanul ei ramane plat, iar intre
 * cele doua cote nu emite nimeni geometrie. Peretele de voxel, cand exista,
 * acopera exact un metru; restul e gaura prin care se vede fundalul.
 *
 * Masurat inainte de reparatie, pe 12 chunkuri VIRGINE (fara nicio sapatura):
 * 26 de gauri, 5,44 m². Exemplu: cote 2616 si 2500 cm, deci 116 cm diferenta din
 * care peretele acopera 100 — 16 cm de fundal. Apar pe linia de mal, fiindca apa
 * nu e solida, deci coloana ei nu are suprafata naturala si nu se netezeste.
 *
 * Nu se emite spre o vecina NETEZITA: acolo cele doua fete impart aceleasi varfuri
 * din `vertexCm` si se ating exact.
 */
function pushFusta(cheie: number, lx: number, ly: number, cm: Int32Array, plat: number): void {
  const x0 = lx * CM, x1 = (lx + 1) * CM, y0 = ly * CM, y1 = (ly + 1) * CM
  // Perechile de colturi ale fiecarei muchii, in ordinea varfurilor fetei de sus:
  // 0=(x0,y0) 1=(x1,y0) 2=(x1,y1) 3=(x0,y1).
  if (!suprafataNaturala(lx + 1, ly)) pushFustaLatura(Face.X_POS, cheie, x1, y0, x1, y1, cm[1]!, cm[2]!, plat)
  if (!suprafataNaturala(lx - 1, ly)) pushFustaLatura(Face.X_NEG, cheie, x0, y0, x0, y1, cm[0]!, cm[3]!, plat)
  if (!suprafataNaturala(lx, ly + 1)) pushFustaLatura(Face.Y_POS, cheie, x0, y1, x1, y1, cm[3]!, cm[2]!, plat)
  if (!suprafataNaturala(lx, ly - 1)) pushFustaLatura(Face.Y_NEG, cheie, x0, y0, x1, y0, cm[0]!, cm[1]!, plat)
}

/**
 * O latura de fusta, TAIATA la cota `plat`.
 *
 * Fusta umple golul dintre muchia netezita — care merge de la `za` la `zb` — si
 * cota plata a vecinului nenetezit. Prima varianta emitea un singur quad,
 * `(a,plat) (b,plat) (b,zb) (a,za)`, si e corect cat timp AMANDOUA cotele sunt de
 * aceeasi parte a lui `plat`.
 *
 * Cand una e dedesubt si alta deasupra, muchia (b,zb)->(a,za) TAIE muchia
 * (a,plat)->(b,plat): quadul se auto-intersecteaza, iese „papion", iar cele doua
 * triunghiuri ale lui au infasurari OPUSE. Unul din ele ajunge dorsal si culling-ul
 * il sterge — adica exact o gaura, in geometria pusa acolo ca sa inchida gauri.
 * Masurat pe chunk-ul fixturii: **15 triunghiuri dorsale, 0,680 m²**.
 *
 * Cota netezita poate depasi varful voxelului cu pana la cativa centimetri, fiindca
 * `vertexCm` e cota reala a terenului in colt, iar nivelul voxelului e podeaua ei.
 * Partea de DEASUPRA lui `plat` nu are nevoie de fusta: acolo suprafata netezita e
 * mai sus decat varful voxelului, iar vecinul mai inalt isi emite singur geometria.
 * Deci se taie la intersectie si se pastreaza doar partea de dedesubt.
 */
function pushFustaLatura(
  face: number, cheie: number,
  ax: number, ay: number, bx: number, by: number,
  za: number, zb: number, plat: number,
): void {
  if (za === plat && zb === plat) return

  // Triunghi, emis ca quad cu ULTIMELE doua varfuri suprapuse. Ordinea conteaza:
  // `quadFlipped` citeste doar PRIMUL triunghi ca sa afle infasurarea, iar daca ala e
  // cel degenerat nu poate afla nimic si rastoarna tot quadul. Prima reparatie punea
  // suprapunerea pe pozitiile 1 si 2 si a taiat dorsalele doar de la 15 la 7; a doua
  // a uitat cazul in care un capat cade EXACT pe `plat`, si au mai ramas 2.
  const tri = (
    p1x: number, p1y: number, p1z: number,
    p2x: number, p2y: number, p2z: number,
    p3x: number, p3y: number, p3z: number,
  ): void => {
    pushQuadCm(face, cheie, p1x, p1y, p1z, p2x, p2y, p2z, p3x, p3y, p3z, p3x, p3y, p3z)
  }

  // Infasurarea, aceeasi pentru fiecare bucata: pe marginea de SUS de la a la b, jos
  // la b, inapoi pe marginea de JOS de la b la a, sus la a.
  if (za <= plat && zb <= plat) {
    if (zb === plat) tri(ax, ay, plat, bx, by, plat, ax, ay, za)
    else if (za === plat) tri(ax, ay, plat, bx, by, plat, bx, by, zb)
    else pushQuadCm(face, cheie, ax, ay, plat, bx, by, plat, bx, by, zb, ax, ay, za)
    return
  }
  if (za >= plat && zb >= plat) {
    // Cazul EXISTA: `vertexCm` e cota reala a terenului in colt, iar nivelul voxelului
    // e podeaua ei, deci netezirea poate urca cativa centimetri peste varful voxelului.
    if (zb === plat) tri(ax, ay, za, bx, by, plat, ax, ay, plat)
    else if (za === plat) tri(ax, ay, plat, bx, by, zb, bx, by, plat)
    else pushQuadCm(face, cheie, ax, ay, za, bx, by, zb, bx, by, plat, ax, ay, plat)
    return
  }

  // Muchia STRABATE `plat` — strict, fiindca egalitatile au fost luate mai sus. Un
  // singur quad ar fi „papion": latura (b,zb)->(a,za) taie latura (a,plat)->(b,plat),
  // cele doua triunghiuri ies cu infasurari OPUSE, si culling-ul sterge unul din ele.
  // O gaura, in geometria pusa acolo ca sa inchida gauri: masurat, 15 triunghiuri
  // dorsale si 0,680 m² pe chunk-ul fixturii.
  //
  // Se taie la intersectie, si fiecare bucata isi ia orientarea ei. AMANDOUA se
  // pastreaza: partea de deasupra chiar acoperea ceva — era doar dorsala, deci
  // invizibila. Aruncarea ei a inrosit testul de etanseitate.
  const t = (plat - za) / (zb - za)
  const cx = Math.round(ax + (bx - ax) * t)
  const cy = Math.round(ay + (by - ay) * t)
  if (za < plat) {
    tri(ax, ay, plat, cx, cy, plat, ax, ay, za)
    tri(cx, cy, plat, bx, by, zb, bx, by, plat)
  } else {
    tri(ax, ay, za, cx, cy, plat, ax, ay, plat)
    tri(cx, cy, plat, bx, by, plat, bx, by, zb)
  }
}



function pushQuad(
  face: number,
  cheie: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
  dx: number, dy: number, dz: number,
): void {
  pushQuadCm(
    face, cheie,
    ax * CM, ay * CM, az * CM,
    bx * CM, by * CM, bz * CM,
    cx * CM, cy * CM, cz * CM,
    dx * CM, dy * CM, dz * CM,
  )
}

/**
 * Randurile care au macar o fata. Fara asta, unirea scaneaza celula cu celula
 * toate cele 128 de felii, inclusiv cele complet goale — iar intr-un chunk de
 * teren obisnuit majoritatea sunt goale. Ablatia a aratat 61% din timp aici.
 */
const rowUsed = new Uint8Array(Math.max(SZ, SY))

/**
 * Unirea lacoma in dreptunghiuri. Consuma `grid` (o goleste pe masura ce uneste).
 * `emit` primeste dreptunghiul in coordonatele (u, v) ale feliei.
 */
function greedy(w: number, h: number, emit: (u: number, v: number, du: number, dv: number, cheie: number) => void): void {
  for (let v = 0; v < h; v++) {
    if (rowUsed[v] === 0) continue
    let u = 0
    while (u < w) {
      const m = grid[v * w + u]!
      if (m === 0) {
        u++
        continue
      }
      let du = 1
      while (u + du < w && grid[v * w + u + du] === m) du++

      let dv = 1
      grow: while (v + dv < h) {
        for (let k = 0; k < du; k++) {
          if (grid[(v + dv) * w + u + k] !== m) break grow
        }
        dv++
      }

      for (let b = 0; b < dv; b++) {
        const row = (v + b) * w + u
        for (let a = 0; a < du; a++) grid[row + a] = 0
      }

      emit(u, v, du, dv, m)
      u += du
    }
  }
}

/** Construieste mesh-ul unui chunk promovat. */

// ---------------------------------------------------------------------------
// taierea fetelor de la granita de chunk
// ---------------------------------------------------------------------------

/**
 * Vecinii unui chunk, pe cele patru laturi. `null` inseamna „nu stiu ce e acolo",
 * si atunci se pastreaza comportamentul vechi: fata se emite.
 *
 * Presupunerea sigura la granita e „dincolo e aer", fiindca o fata emisa in plus
 * e risipa, iar una taiata gresit e o gaura prin care se vede fundalul.
 */
export interface ChunkNeighbours {
  readonly xNeg?: Chunk | null
  readonly xPos?: Chunk | null
  readonly yNeg?: Chunk | null
  readonly yPos?: Chunk | null
  /**
   * Diagonalele. NU sunt folosite la taierea fetelor — o fata de granita e
   * acoperita doar de vecinul de LATURA. Exista pentru AO, al carui colt
   * (-1,-1) nu vine de la niciunul dintre cei patru.
   */
  readonly xNegYNeg?: Chunk | null
  readonly xPosYNeg?: Chunk | null
  readonly xNegYPos?: Chunk | null
  readonly xPosYPos?: Chunk | null
}

/** Masca de solid a unei linii de granita din vecin, per nivel. */
const borderMask = new Uint32Array(SZ)

/**
 * Nivelurile NU se aliniaza intre chunk-uri: fiecare stiva incepe la propriul
 * `zBaseM`. Decalajul se aplica la citire, iar ce cade in afara stivei vecinului
 * se considera AER — adica fata ramane emisa.
 */
function neighbourSolidAt(column_: Uint8Array, level: number, dz: number): boolean {
  const nl = level + dz
  if (nl < 0 || nl >= SZ) return false
  return isSolid(column_[nl]!)
}

/** Taie fetele de pe axa X care sunt acoperite de chunk-ul vecin. */
function cullX(own: Chunk, neighbour: Chunk, face: number, ownBit: number, neighbourLx: number): void {
  const nv = neighbour.voxels
  if (!nv) return
  const dz = own.voxels!.zBaseM - nv.zBaseM
  const mask = vis[face]!
  for (let ly = 0; ly < SY; ly++) {
    decodeColumn(nv, ly * SX + neighbourLx, column)
    for (let level = 0; level < SZ; level++) {
      if (neighbourSolidAt(column, level, dz)) mask[level * SY + ly]! &= ~ownBit
    }
  }
}

/** Taie fetele de pe axa Y care sunt acoperite de chunk-ul vecin. */
function cullY(own: Chunk, neighbour: Chunk, face: number, ownLy: number, neighbourLy: number): void {
  const nv = neighbour.voxels
  if (!nv) return
  const dz = own.voxels!.zBaseM - nv.zBaseM

  borderMask.fill(0)
  for (let lx = 0; lx < SX; lx++) {
    decodeColumn(nv, neighbourLy * SX + lx, column)
    const bit = 1 << lx
    for (let level = 0; level < SZ; level++) {
      if (neighbourSolidAt(column, level, dz)) borderMask[level]! |= bit
    }
  }

  const mask = vis[face]!
  for (let level = 0; level < SZ; level++) mask[level * SY + ownLy]! &= ~borderMask[level]!
}

/**
 * Limita cunoscuta a mesher-ului, inchisa.
 *
 * Pana acum fetele de la marginea chunk-ului se emiteau MEREU, fiindca nu se
 * consulta vecinul. Masurat pe fixtura M10 (`node tools/border-faces.mjs`):
 * 779.888 de fete de granita, din care **674.582 (86,5%) ascunse** de un vecin
 * promovat.
 *
 * Se face DUPA `computeVisibility`, pe mastile deja calculate, si numai pe cele
 * patru linii de granita. Nu atinge trucul bitwise pe care sta tot modulul:
 * o linie de 32 de voxeli ramane un `Uint32`.
 */
function cullChunkBorders(chunk: Chunk, n: ChunkNeighbours): void {
  if (n.xNeg) cullX(chunk, n.xNeg, Face.X_NEG, 1, SX - 1)
  if (n.xPos) cullX(chunk, n.xPos, Face.X_POS, 1 << (SX - 1), 0)
  if (n.yNeg) cullY(chunk, n.yNeg, Face.Y_NEG, 0, SY - 1)
  if (n.yPos) cullY(chunk, n.yPos, Face.Y_POS, SY - 1, 0)
}

/**
 * Netezirea suprafetei NEATINSE.
 *
 * E optionala, si asta nu e prudenta: fara ea, mesher-ul e o enumerare FIDELA a
 * fetelor voxelilor, iar invariantul central („unirea lacoma acopera exact
 * aceleasi fete ca numararea naiva") se poate proba. Cu ea, mesher-ul devine o
 * REDARE — sterge pereti care exista in date si muta varfuri sub cota lor. Cele
 * doua intrebari sunt diferite si amandoua merita raspuns, deci amandoua moduri
 * raman.
 *
 * Ce repara: terenul promovat e cuantizat la 1 m, deci o panta lina devine scara —
 * si se intampla pe TOT chunk-ul, nu doar unde ai sapat. Masurat: abaterea
 * cuantizarii e 0,25 m in medie si 0,5 m maxim, pura rotunjire.
 *
 * Pretul, masurat inainte de a fi scris: 199.840 → ~327.000 de quaduri (+64%).
 * Fetele de sus nu se mai pot uni (74.150 → 303.775), dar peretii de treapta de
 * 1 m dispar cu totul (−102.053).
 */
export function meshChunk(chunk: Chunk, neighbours?: ChunkNeighbours, netezire = false): ChunkMesh {
  expand(chunk)
  // Apronul INAINTE de orice citire de AO. Fara vecini ramane zero, adica
  // „dincolo e aer" — comportamentul de dinainte, si tot el e cel testat.
  if (neighbours) expandApron(chunk, neighbours)
  if (netezire) umpleNatLevel(chunk, neighbours)
  else { natLevel.fill(NECUNOSCUT); natSuprafata.fill(0) }
  computeVisibility()
  if (neighbours) cullChunkBorders(chunk, neighbours)
  quadCount = 0

  // --- fetele de pe axa X: felii la x = const, grila (ly, level) ---
  for (const face of [Face.X_POS, Face.X_NEG] as const) {
    const plane = face === Face.X_POS ? 1 : 0
    const mask = vis[face]!

    // O singura trecere peste masti spune care felii au macar o fata.
    // Bitul lx din `orAll` inseamna „exista cel putin o fata pe felia lx".
    let orAll = 0
    for (let i = 0; i < ROWS; i++) orAll |= mask[i]!
    if (orAll === 0) continue

    for (let lx = 0; lx < SX; lx++) {
      const bit = 1 << lx
      if ((orAll & bit) === 0) continue
      // Coloana vecina, dincolo de fata: acolo se uita `treaptaNaturala`.
      const nLx = face === Face.X_POS ? lx + 1 : lx - 1
      let any = false
      for (let level = 0; level < SZ; level++) {
        let used = 0
        const base = level * SY
        for (let ly = 0; ly < SY; ly++) {
          const m = (mask[base + ly]! & bit) !== 0 && !treaptaNaturala(lx, ly, nLx, ly, level)
            ? dense[denseIndex(lx, ly, level)]! | (aoPattern(face, lx, ly, level) << 8)
            : 0
          grid[base + ly] = m
          used |= m
        }
        rowUsed[level] = used !== 0 ? 1 : 0
        if (used !== 0) any = true
      }
      if (!any) continue
      const x = lx + plane
      greedy(SY, SZ, (u, v, du, dv, m) => {
        pushQuad(face, m, x, u, v, x, u + du, v, x, u + du, v + dv, x, u, v + dv)
      })
    }
  }

  // --- fetele de pe axa Y: felii la y = const, grila (lx, level) ---
  for (const face of [Face.Y_POS, Face.Y_NEG] as const) {
    const plane = face === Face.Y_POS ? 1 : 0
    const mask = vis[face]!
    for (let ly = 0; ly < SY; ly++) {
      const nLy = face === Face.Y_POS ? ly + 1 : ly - 1
      // Felia e goala daca toate randurile ei sunt zero — un test pe cuvant,
      // nu pe celula.
      let sliceOr = 0
      for (let level = 0; level < SZ; level++) sliceOr |= mask[level * SY + ly]!
      if (sliceOr === 0) continue

      for (let level = 0; level < SZ; level++) {
        const row = mask[level * SY + ly]!
        const base = level * SX
        if (row === 0) {
          rowUsed[level] = 0
          // Golirea e obligatorie: extinderea pe verticala din `greedy` citeste
          // randurile de dedesubt fara sa verifice rowUsed, deci date ramase
          // de la felia anterioara ar fi unite ca si cum ar fi fete reale.
          grid.fill(0, base, base + SX)
          continue
        }
        rowUsed[level] = 1
        for (let lx = 0; lx < SX; lx++) {
          grid[base + lx] = (row & (1 << lx)) !== 0 && !treaptaNaturala(lx, ly, lx, nLy, level)
            ? dense[denseIndex(lx, ly, level)]! | (aoPattern(face, lx, ly, level) << 8)
            : 0
        }
      }
      const y = ly + plane
      greedy(SX, SZ, (u, v, du, dv, m) => {
        pushQuad(face, m, u, y, v, u + du, y, v, u + du, y, v + dv, u, y, v + dv)
      })
    }
  }

  // --- fetele de pe axa Z: felii la level = const, grila (lx, ly) ---
  for (const face of [Face.Z_POS, Face.Z_NEG] as const) {
    const plane = face === Face.Z_POS ? 1 : 0
    const mask = vis[face]!
    for (let level = 0; level < SZ; level++) {
      const base = level * SY
      let sliceOr = 0
      for (let ly = 0; ly < SY; ly++) sliceOr |= mask[base + ly]!
      if (sliceOr === 0) continue

      for (let ly = 0; ly < SY; ly++) {
        const row = mask[base + ly]!
        const gbase = ly * SX
        if (row === 0) {
          rowUsed[ly] = 0
          grid.fill(0, gbase, gbase + SX)
          continue
        }
        rowUsed[ly] = 1
        for (let lx = 0; lx < SX; lx++) {
          if ((row & (1 << lx)) === 0) { grid[gbase + lx] = 0; continue }
          const cheie = dense[denseIndex(lx, ly, level)]! | (aoPattern(face, lx, ly, level) << 8)
          // Suprafata NEATINSA se emite pe loc, cu colturile la cotele reale, si
          // iese din unirea lacoma. Restul — podele sapate, tavane — raman plate.
          if (face === Face.Z_POS && natAt(lx, ly) === level) {
            varfuriCm(chunk, lx, ly, varfBuf)
            pushFataNetezita(cheie, lx, ly, varfBuf)
            pushFusta(cheie, lx, ly, varfBuf, (level + 1) * CM)
            grid[gbase + lx] = 0
            continue
          }
          grid[gbase + lx] = cheie
        }
      }
      const z = level + plane
      greedy(SX, SY, (u, v, du, dv, m) => {
        pushQuad(face, m, u, v, z, u + du, v, z, u + du, v + dv, z, u, v + dv, z)
      })
    }
  }

  return {
    quadCount,
    positions: outPositions.slice(0, quadCount * 12),
    materials: outMaterials.slice(0, quadCount),
    faces: outFaces.slice(0, quadCount),
    ao: outAo.slice(0, quadCount * 4),
  }
}

/**
 * Mesher naiv, pentru comparatie: o fata per voxel vizibil, fara unire.
 * Exista ca sa pot MASURA castigul unirii lacome pe datele mele, nu pe cifra
 * citata de altcineva.
 */
export function countNaiveFaces(chunk: Chunk): number {
  expand(chunk)
  computeVisibility()
  let faces = 0
  for (let d = 0; d < 6; d++) {
    const mask = vis[d]!
    for (let i = 0; i < ROWS; i++) {
      let bits = mask[i]!
      while (bits !== 0) {
        bits &= bits - 1
        faces++
      }
    }
  }
  return faces
}
