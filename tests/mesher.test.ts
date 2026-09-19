import test from 'node:test'
import assert from 'node:assert/strict'
import { countNaiveFaces, Face, meshChunk } from '../src/render/mesher.ts'
import {
  CHUNK_CELLS,
  cellHeightCm,
  encodeAll,
  decodeColumn,
  generateChunk,
  groundLevelFromCm,
  isSolid,
  Material,
  promote,
  setVoxel,
  VOXEL_LEVELS,
} from '../src/sim/terrain/chunk.ts'
import type { Chunk } from '../src/sim/terrain/chunk.ts'
import { nextInt, stream } from '../src/sim/rng.ts'
import { chunkKey, createTerrain, dig, fill, groundLevelM, setFocus } from '../src/sim/terrain/terrain.ts'
import { writeQuadIndices } from '../src/render/winding.ts'
import { makeM10 } from '../src/harness/fixture-m10.ts'

const COLUMNS = CHUNK_CELLS * CHUNK_CELLS

/** Un chunk sintetic, complet gol, ca sa pot pune exact ce vreau in el. */
function emptyChunk(): Chunk {
  const chunk = generateChunk(1, 0, 0)
  const columns = new Uint8Array(COLUMNS * VOXEL_LEVELS)
  chunk.voxels = encodeAll(0, columns)
  return chunk
}

/**
 * O componenta de pozitie, in METRI.
 *
 * `positions` e in CENTIMETRI de cand suprafata neatinsa se deseneaza la cota ei
 * reala. Testele gandesc in metri de grila, deci conversia sta intr-un loc.
 */
const pm = (mesh: ReturnType<typeof meshChunk>, i: number): number => mesh.positions[i]! / 100

function areaOf(mesh: ReturnType<typeof meshChunk>): number {
  // Aria unui quad se deduce din colturile lui: doua laturi perpendiculare.
  let total = 0
  for (let q = 0; q < mesh.quadCount; q++) {
    const o = q * 12
    const ax = pm(mesh, o), ay = pm(mesh, o + 1), az = pm(mesh, o + 2)
    const bx = pm(mesh, o + 3), by = pm(mesh, o + 4), bz = pm(mesh, o + 5)
    const dx = pm(mesh, o + 9), dy = pm(mesh, o + 10), dz = pm(mesh, o + 11)
    const du = Math.abs(bx - ax) + Math.abs(by - ay) + Math.abs(bz - az)
    const dv = Math.abs(dx - ax) + Math.abs(dy - ay) + Math.abs(dz - az)
    total += du * dv
  }
  return total
}

test('INVARIANTUL CENTRAL: unirea lacoma acopera exact aceleasi fete ca numararea naiva', () => {
  // Daca asta pica, mesh-ul fie pierde fete (gauri in geometrie), fie inventeaza
  // fete (suprapuneri). E singurul test care dovedeste ca unirea e corecta.
  const seed = 77
  for (const [cx, cy] of [[10, 10], [200, 33], [400, 400], [0, 0]] as const) {
    const chunk = generateChunk(seed, cx, cy)
    promote(chunk)
    const naive = countNaiveFaces(chunk)
    const mesh = meshChunk(chunk)
    assert.equal(areaOf(mesh), naive, `aria nu corespunde la chunk (${cx},${cy})`)
  }
})

test('invariantul se tine si dupa sapaturi si constructii', () => {
  const seed = 88
  const chunk = generateChunk(seed, 50, 50)
  promote(chunk)
  const rng = stream(seed, 'agents')
  const zBase = chunk.voxels!.zBaseM

  for (let i = 0; i < 400; i++) {
    const lx = nextInt(rng, CHUNK_CELLS)
    const ly = nextInt(rng, CHUNK_CELLS)
    const level = nextInt(rng, VOXEL_LEVELS)
    const m = nextInt(rng, 2) === 0 ? Material.AER : Material.PIATRA_CONSTRUITA
    setVoxel(chunk, lx, ly, zBase + level, m)
  }

  assert.equal(areaOf(meshChunk(chunk)), countNaiveFaces(chunk))
})

test('un singur voxel solid in gol da exact 6 quaduri de aria 1', () => {
  const chunk = emptyChunk()
  setVoxel(chunk, 10, 10, 20, Material.ROCA)
  const mesh = meshChunk(chunk)
  assert.equal(mesh.quadCount, 6)
  assert.equal(areaOf(mesh), 6)

  const seen = new Set(Array.from(mesh.faces))
  assert.equal(seen.size, 6, 'ar trebui cate o fata pe fiecare directie')
  for (let q = 0; q < mesh.quadCount; q++) assert.equal(mesh.materials[q], Material.ROCA)
})

test('un strat plin pe tot chunk-ul se uneste in 6 quaduri, nu in 6144', () => {
  // Asta e castigul, masurat: un strat de 32 × 32 are 1024 de fete sus, 1024 jos
  // si 128 pe laturi = 2176 de fete, care devin 6 quaduri.
  const chunk = emptyChunk()
  for (let ly = 0; ly < CHUNK_CELLS; ly++) {
    for (let lx = 0; lx < CHUNK_CELLS; lx++) {
      setVoxel(chunk, lx, ly, 30, Material.PIATRA_CONSTRUITA)
    }
  }
  const mesh = meshChunk(chunk)
  const naive = countNaiveFaces(chunk)

  assert.equal(naive, 32 * 32 * 2 + 32 * 4, 'numarul naiv de fete nu e cel asteptat')
  assert.equal(mesh.quadCount, 6, `unirea a produs ${mesh.quadCount} quaduri in loc de 6`)
  assert.equal(areaOf(mesh), naive)
})

test('un perete vertical de 20 × 8 devine un singur quad pe fiecare fata mare', () => {
  const chunk = emptyChunk()
  for (let level = 10; level < 18; level++) {
    for (let lx = 5; lx < 25; lx++) {
      setVoxel(chunk, lx, 16, level, Material.LEMN_CONSTRUIT)
    }
  }
  const mesh = meshChunk(chunk)
  const bigFaces = Array.from({ length: mesh.quadCount }, (_, q) => q).filter((q) => {
    const o = q * 12
    const du = Math.abs(pm(mesh, o + 3) - pm(mesh, o))
    return du === 20
  })
  assert.ok(bigFaces.length >= 2, `peretele ar trebui sa aiba doua fete mari unite, are ${bigFaces.length}`)
  assert.equal(areaOf(mesh), countNaiveFaces(chunk))
})

test('quadurile stau in marginile chunk-ului', () => {
  const seed = 91
  const chunk = generateChunk(seed, 77, 77)
  promote(chunk)
  const mesh = meshChunk(chunk)
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = pm(mesh, i)
    const y = pm(mesh, i + 1)
    const z = pm(mesh, i + 2)
    assert.ok(x >= 0 && x <= CHUNK_CELLS, `x iesit: ${x}`)
    assert.ok(y >= 0 && y <= CHUNK_CELLS, `y iesit: ${y}`)
    assert.ok(z >= 0 && z <= VOXEL_LEVELS, `z iesit: ${z}`)
  }
})

test('mesh-ul e determinist', () => {
  const seed = 5
  const a = generateChunk(seed, 12, 12)
  promote(a)
  const b = generateChunk(seed, 12, 12)
  promote(b)
  const ma = meshChunk(a)
  const mb = meshChunk(b)
  assert.equal(ma.quadCount, mb.quadCount)
  assert.deepEqual(Array.from(ma.positions), Array.from(mb.positions))
  assert.deepEqual(Array.from(ma.materials), Array.from(mb.materials))
})

test('un chunk gol nu produce niciun quad', () => {
  const mesh = meshChunk(emptyChunk())
  assert.equal(mesh.quadCount, 0)
})

test('sapatul produce fete NOI, nu doar mai putine', () => {
  const seed = 61
  const chunk = generateChunk(seed, 30, 30)
  promote(chunk)
  const before = countNaiveFaces(chunk)

  // O galerie in roca: scoate un voxel ingropat, care expune 6 fete interioare noi.
  const ground = Math.floor(cellHeightCm(chunk, 16, 16) / 100)
  setVoxel(chunk, 16, 16, ground - 8, Material.AER)
  const after = countNaiveFaces(chunk)

  assert.equal(after, before + 6, `o galerie in roca ar trebui sa expuna 6 fete, a expus ${after - before}`)
  assert.equal(areaOf(meshChunk(chunk)), after)
})

test('fetele de sus ale unui teren normal se unesc bine', () => {
  const seed = 101
  const chunk = generateChunk(seed, 150, 150)
  promote(chunk)
  const mesh = meshChunk(chunk)
  let topQuads = 0
  let topArea = 0
  for (let q = 0; q < mesh.quadCount; q++) {
    if (mesh.faces[q] !== Face.Z_POS) continue
    topQuads++
    const o = q * 12
    const du = Math.abs(pm(mesh, o + 3) - pm(mesh, o))
    const dv = Math.abs(pm(mesh, o + 10) - pm(mesh, o + 1))
    topArea += du * dv
  }
  // Suprafata de sus acopera fix cele 1024 de celule ale chunk-ului.
  assert.equal(topArea, CHUNK_CELLS * CHUNK_CELLS, 'suprafata de sus nu acopera tot chunk-ul')
  assert.ok(topQuads < 1024, 'unirea nu a facut nimic pe suprafata')
})

// --- infasurarea ------------------------------------------------------------

test('fiecare quad are infasurarea care il face sa arate in AFARA', () => {
  // Defectul pe care il prinde: regula de infasurare din viewer era o CONSTANTA
  // — „directiile pozitive se inverseaza, cele negative raman" — dedusa analitic
  // pentru fata de sus si aplicata tuturor. Pentru majoritatea quadurilor era
  // corecta; pentru restul, nu. Fetele gresite erau dorsale, culling-ul le
  // elimina, si se vedea fundalul prin fortareata.
  //
  // Le crezusem variatie de material in teren. Trei explicatii plauzibile
  // verificate si excluse pe rand (gauri, normale intoarse, culori inchise) —
  // prima dintre ele, „nu sunt gauri", era GRESITA, fiindca testul meu de fundal
  // era stricat. Chiar erau gauri.
  const t = createTerrain(20260404, 3)
  const CX = 389
  const CY = 144
  setFocus(t, CX, CY)
  const bx = CX * CHUNK_CELLS
  const by = CY * CHUNK_CELLS

  // O fortareata in miniatura: camere sapate si zid construit, ca sa existe fete
  // pe toate cele sase directii. Un chunk doar sapat n-ar exercita decat cateva.
  for (let ry = 0; ry < 6; ry++) {
    for (let rx = 0; rx < 6; rx++) {
      const g = groundLevelM(t, bx + 4 + rx, by + 4 + ry)
      if (g.ok) for (let d = 1; d <= 3; d++) dig(t, bx + 4 + rx, by + 4 + ry, g.value - d)
    }
  }
  for (let i = 0; i < 10; i++) {
    const g = groundLevelM(t, bx + 16 + i, by + 16)
    if (g.ok) for (let h = 1; h <= 3; h++) fill(t, bx + 16 + i, by + 16, g.value + h, Material.PIATRA_CONSTRUITA)
  }

  const chunk = t.chunks.get(chunkKey(CX, CY))!
  assert.ok(chunk.voxels, 'chunkul n-a fost promovat — fixtura nu dovedeste nimic')
  const mesh = meshChunk(chunk)
  assert.ok(mesh.quadCount > 100, `doar ${mesh.quadCount} quaduri — fixtura e prea saraca`)

  // Toate cele sase directii trebuie sa apara, altfel testul acopera doar o parte.
  const directii = new Set<number>()
  for (let q = 0; q < mesh.quadCount; q++) directii.add(mesh.faces[q]!)
  assert.equal(directii.size, 6, `doar ${directii.size} directii de fata in fixtura`)

  // Oracolul: normala triunghiului, calculata din indicii pe care ii scrie chiar
  // codul de productie, trebuie sa fie EXACT normala axiala a fetei.
  const idx = new Uint32Array(6)
  const p = mesh.positions
  let verificate = 0
  for (let q = 0; q < mesh.quadCount; q++) {
    writeQuadIndices(mesh, q, 0, idx, 0)
    const varf = (n: number): [number, number, number] => {
      const b = n * 3
      // spatiul lui three: (x, z, y) din spatiul mesher-ului
      return [p[q * 12 + b]!, p[q * 12 + b + 2]!, p[q * 12 + b + 1]!]
    }
    const a = varf(idx[0]!)
    const bb = varf(idx[1]!)
    const c = varf(idx[2]!)
    const u = [bb[0] - a[0], bb[1] - a[1], bb[2] - a[2]]
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    const n = [
      u[1]! * v[2]! - u[2]! * v[1]!,
      u[2]! * v[0]! - u[0]! * v[2]!,
      u[0]! * v[1]! - u[1]! * v[0]!,
    ]
    const face = mesh.faces[q]!
    const asteptat = [
      face === Face.X_POS ? 1 : face === Face.X_NEG ? -1 : 0,
      face === Face.Z_POS ? 1 : face === Face.Z_NEG ? -1 : 0,
      face === Face.Y_POS ? 1 : face === Face.Y_NEG ? -1 : 0,
    ]
    const lung = Math.hypot(n[0]!, n[1]!, n[2]!)
    assert.ok(lung > 0, `quadul ${q} e degenerat`)
    const dot = (n[0]! * asteptat[0]! + n[1]! * asteptat[1]! + n[2]! * asteptat[2]!) / lung
    assert.ok(dot > 0.99, `quadul ${q}, fata ${face}: normala triunghiului nu arata in afara (dot ${dot.toFixed(3)})`)
    verificate++
  }
  assert.equal(verificate, mesh.quadCount)
})

// ---------------------------------------------------------------------------
// ocluzia ambientala
// ---------------------------------------------------------------------------

/** Indicele quadului de fel `face` al carui PRIM varf e exact (x, y, z). */
function indiceFata(m: ReturnType<typeof meshChunk>, face: number, x: number, y: number, z: number): number {
  for (let q = 0; q < m.quadCount; q++) {
    if (m.faces[q] !== face) continue
    const o = q * 12
    if (pm(m, o) === x && pm(m, o + 1) === y && pm(m, o + 2) === z) return q
  }
  return -1
}
test('un cub izolat n-are nicio ocluzie: toate varfurile la maxim', () => {
  // Controlul de jos al scarii. Daca un cub singur primeste ocluzie, regula vede
  // vecini care nu exista, si atunci nimic din ce urmeaza nu inseamna nimic.
  const c = emptyChunk()
  setVoxel(c, 5, 5, 5, Material.ROCA)
  const m = meshChunk(c)
  assert.equal(m.quadCount, 6, 'un cub izolat are exact sase fete')
  for (let i = 0; i < m.ao.length; i++) {
    assert.equal(m.ao[i], 3, `varful ${i} al cubului izolat e ocluzat (${m.ao[i]})`)
  }
})

test('un vecin lateral intuneca exact doua varfuri din patru', () => {
  // Cazul care conteaza cel mai des: o treapta de 1 m langa o suprafata plata.
  // Fata de SUS a cubului de jos are doua varfuri langa peretele vecinului.
  const c = emptyChunk()
  setVoxel(c, 5, 5, 5, Material.ROCA)
  setVoxel(c, 6, 5, 6, Material.ROCA) // treapta, deasupra si lateral
  const m = meshChunk(c)
  const sus = indiceFata(m, Face.Z_POS, 5, 5, 6)
  assert.notEqual(sus, -1, 'fixtura: nu gasesc fata de sus a cubului de jos')
  const ao = [...m.ao.slice(sus * 4, sus * 4 + 4)]

  // Exact, nu „doua din patru": asa leaga si ORDINEA varfurilor. Socotit pe hartie
  // — blocul e la x = 6, deci se intuneca fix cele doua varfuri de pe muchia aia,
  // si fiecare pierde un singur vecin din trei.
  assert.deepEqual(ao, [3, 2, 2, 3], `tiparul de AO: ${ao.join(",")}`)

  // Si ca varfurile intunecate sunt CHIAR cele de langa bloc, nu doua oarecare.
  const o = sus * 12
  for (let v = 0; v < 4; v++) {
    const x = pm(m, o + v * 3)
    const asteptat = x === 6 ? 2 : 3
    assert.equal(m.ao[sus * 4 + v], asteptat, `varful ${v} e la x=${x} si are ao=${m.ao[sus * 4 + v]}`)
  }
})

test('doua laturi ocupate inchid coltul COMPLET, nu partial', () => {
  // Regula clasica, si e cea care face ca un colt interior sa se citeasca drept
  // colt. Fara ea, coltul ar fi doar „putin mai inchis decat o latura".
  const c = emptyChunk()
  setVoxel(c, 5, 5, 5, Material.ROCA)
  setVoxel(c, 6, 5, 6, Material.ROCA)
  setVoxel(c, 5, 6, 6, Material.ROCA)
  const m = meshChunk(c)
  const sus = indiceFata(m, Face.Z_POS, 5, 5, 6)
  assert.notEqual(sus, -1)
  const ao = [...m.ao.slice(sus * 4, sus * 4 + 4)]
  // Varful 2 e coltul (+1,+1), singurul care are AMANDOUA laturile ocupate.
  assert.deepEqual(ao, [3, 2, 0, 2], `tiparul de AO: ${ao.join(',')}`)
})

test('AO se opreste la granita chunk-ului daca nu se dau vecini, si NU daca se dau', () => {
  // Cusatura de iluminare, probata direct. Un perete lipit de marginea chunk-ului
  // vede sau nu vede vecinul, dupa cum i se da sau nu.
  const stanga = emptyChunk()
  const dreapta = emptyChunk()
  // Un bloc pe ultima coloana a chunk-ului din stanga si pe prima a celui din dreapta,
  // plus unul deasupra in dreapta, ca sa ocluzeze peste granita.
  setVoxel(stanga, 31, 5, 5, Material.ROCA)
  setVoxel(dreapta, 0, 5, 6, Material.ROCA)

  const fara = meshChunk(stanga)
  const cu = meshChunk(stanga, { xPos: dreapta })
  const iFara = indiceFata(fara, Face.Z_POS, 31, 5, 6)
  const iCu = indiceFata(cu, Face.Z_POS, 31, 5, 6)
  assert.notEqual(iFara, -1, 'fixtura: fata de sus lipseste fara vecini')
  assert.notEqual(iCu, -1, 'fixtura: fata de sus lipseste cu vecini')

  const aoFara = [...fara.ao.slice(iFara * 4, iFara * 4 + 4)]
  const aoCu = [...cu.ao.slice(iCu * 4, iCu * 4 + 4)]
  assert.deepEqual(aoFara, [3, 3, 3, 3], `fara vecin nu se poate sti nimic: ${aoFara.join(',')}`)
  assert.ok(aoCu.some((v) => v < 3), `cu vecin, blocul de dincolo trebuie sa ocluzeze: ${aoCu.join(',')}`)
})

test('tiparul de AO intra in cheia de unire: doua celule cu ocluzii diferite NU se unesc', () => {
  // Asta e tot designul. Fara AO in cheie, cele doua fete de sus s-ar uni intr-un
  // singur quad si ocluzia s-ar intinde gresit peste amandoua.
  const c = emptyChunk()
  setVoxel(c, 5, 5, 5, Material.ROCA)
  setVoxel(c, 6, 5, 5, Material.ROCA)
  // Un singur vecin deasupra, lipit doar de PRIMA celula.
  setVoxel(c, 4, 5, 6, Material.ROCA)
  const m = meshChunk(c)
  const a = indiceFata(m, Face.Z_POS, 5, 5, 6)
  const b = indiceFata(m, Face.Z_POS, 6, 5, 6)
  assert.notEqual(a, -1, 'fixtura: prima fata de sus lipseste')
  assert.notEqual(b, -1, 'fixtura: a doua fata de sus lipseste')
  assert.notEqual(a, b, 'cele doua fete s-au unit desi au ocluzii diferite')
})

test('coltul chunk-ului are nevoie de vecinul DIAGONAL, nu doar de cele patru laturi', () => {
  // Coltul (-1,-1) al unui chunk nu vine de la niciunul dintre vecinii de latura.
  // Fara diagonale ar ramane patru coloane de colt mai luminoase decat trebuie —
  // tot o cusatura, doar mai rara decat cea de pe toata granita.
  const c = emptyChunk()
  const diag = emptyChunk()
  setVoxel(c, 31, 31, 5, Material.ROCA)
  setVoxel(diag, 0, 0, 6, Material.ROCA)

  const fara = meshChunk(c, { xPos: null, yPos: null })
  const cu = meshChunk(c, { xPosYPos: diag })
  const iF = indiceFata(fara, Face.Z_POS, 31, 31, 6)
  const iC = indiceFata(cu, Face.Z_POS, 31, 31, 6)
  assert.notEqual(iF, -1, 'fixtura: fata de sus lipseste fara diagonala')
  assert.notEqual(iC, -1, 'fixtura: fata de sus lipseste cu diagonala')

  // Varful 2 e coltul (+1,+1), adica exact cel care se sprijina pe diagonala.
  assert.equal(fara.ao[iF * 4 + 2], 3, 'fara diagonala nu se poate sti nimic despre colt')
  assert.equal(cu.ao[iC * 4 + 2], 2, 'cu diagonala, blocul de dincolo de colt trebuie sa ocluzeze')
  // Celelalte trei varfuri nu au ce sa afle de la diagonala.
  for (const v of [0, 1, 3]) {
    assert.equal(cu.ao[iC * 4 + v], 3, `varful ${v} n-avea de ce sa se schimbe`)
  }
})

test('la marginea ferestrei de voxeli, dincolo e AER — ca la vizibilitate', () => {
  // Afirmatia din `occAt`, probata. Fata de JOS a unui cub de la nivelul 0 CHIAR se
  // emite (`computeVisibility` trateaza iesirea din fereastra ca aer), deci n-are
  // voie sa fie intunecata de ceva ce, pentru vizibilitate, nu exista. Consecventa
  // intre cele doua conteaza mai mult decat fidelitatea fizica: sub fereastra chiar
  // e stanca, dar daca AO ar sti-o, ar umbri o fata pe care tot el o arata.
  const c = emptyChunk()
  setVoxel(c, 5, 5, 0, Material.ROCA)
  const m = meshChunk(c)
  assert.equal(m.quadCount, 6, 'fixtura: cubul de la nivelul 0 trebuie sa aiba sase fete, inclusiv cea de jos')
  const jos = indiceFata(m, Face.Z_NEG, 5, 5, 0)
  assert.notEqual(jos, -1, 'fixtura: fata de jos nu se emite, deci testul n-ar proba nimic')
  for (let i = 0; i < m.ao.length; i++) {
    assert.equal(m.ao[i], 3, `varful ${i} al cubului de la nivelul 0 e ocluzat (${m.ao[i]})`)
  }
})

// ---------------------------------------------------------------------------
// netezirea suprafetei neatinse
// ---------------------------------------------------------------------------

/** Un chunk promovat din teren REAL, ca `vertexCm` si voxelii sa se potriveasca. */
function chunkPromovat(): Chunk {
  const t = createTerrain(20260919, 1)
  setFocus(t, 300, 300)
  const c = t.chunks.get(300 * 512 + 300)!
  promote(c)
  return c
}



/** Cate quaduri sunt pereti de treapta — fete laterale de EXACT 1 m inaltime. */
function quaduriDeTreapta(m: ReturnType<typeof meshChunk>): number {
  let n = 0
  for (let q = 0; q < m.quadCount; q++) {
    const f = m.faces[q]!
    if (f === Face.Z_POS || f === Face.Z_NEG) continue
    const o = q * 12
    const dv = Math.abs(pm(m, o + 9) - pm(m, o)) + Math.abs(pm(m, o + 10) - pm(m, o + 1)) + Math.abs(pm(m, o + 11) - pm(m, o + 2))
    if (Math.abs(dv - 1) < 0.001) n++
  }
  return n
}

/** Aria fetelor LATERALE (peretii), in m². */

/**
 * Are coloana suprafata EXACT unde ar fi pus-o generatorul?
 *
 * Selecteaza CE celule se verifica, nu CUM se calculeaza cotele — deci nu repeta
 * implementarea, doar citeste aceleasi date publice. Conteaza fiindca o coloana de
 * APA nu are suprafata solida la nivelul ei natural si corect NU se netezeste; o
 * clasificare dupa cota (prima varianta) le prindea printr-un off-by-one si testul
 * pica pe cod CORECT.
 */
const colBuf = new Uint8Array(VOXEL_LEVELS)
function areSuprafataNaturala(c: Chunk, x: number, y: number, nat: number): boolean {
  decodeColumn(c.voxels!, y * CHUNK_CELLS + x, colBuf)
  if (nat < 0 || nat + 1 >= VOXEL_LEVELS) return false
  return isSolid(colBuf[nat]!) && !isSolid(colBuf[nat + 1]!)
}

/**
 * Indicele fetei de sus de 1×1 a celulei (x, y) cea mai apropiata de `tinta`, sau -1.
 *
 * „Cea mai apropiata", nu „prima": o coloana poate avea mai multe fete de sus — o
 * podea sapata dedesubt, o lespede deasupra — iar prima gasita e la voia ordinii de
 * emitere. Prima varianta a testului lua prima si pica pe cod CORECT.
 */
function fataDeSus(m: ReturnType<typeof meshChunk>, x: number, y: number, tinta: number): number {
  let best = -1
  let bestD = Infinity
  for (let q = 0; q < m.quadCount; q++) {
    if (m.faces[q] !== Face.Z_POS) continue
    const o = q * 12
    if (m.positions[o] !== x * 100 || m.positions[o + 1] !== y * 100) continue
    if (m.positions[o + 3] !== (x + 1) * 100 || m.positions[o + 10] !== (y + 1) * 100) continue
    const d = Math.abs(m.positions[o + 2]! - tinta)
    if (d < bestD) { bestD = d; best = q }
  }
  return best
}

test('netezirea aseaza fetele de sus EXACT pe cotele din vertexCm, in ordinea emiterii', () => {
  // Testul de dinainte numara doar cate cote NU sunt multipli de 100 — un PROXY.
  // Orice permutare a colturilor, orice inversare de axe, si chiar scaderea uitata
  // a bazei stivei raman sub-metrice, deci treceau. Masurat de o recenzie
  // adversariala: patru stricaciuni distincte, toate 391/391 verzi.
  //
  // Ancora e INVARIANTUL: cele patru varfuri sunt exact colturile celulei, in
  // ordinea de emitere (x0,y0), (x1,y0), (x1,y1), (x0,y1), la cotele din `vertexCm`.
  //
  // Prima versiune verifica doar COTA. O a doua recenzie adversariala a masurat ce
  // trece asa: mutand varful 2 de pe y1 pe y0, fiecare fata netezita devine un
  // TRIUNGHI, aria in plan a fetelor de sus cade de la 1024 la 640 m² pe chunk —
  // **37,5% din suprafata dispare** — si suita INTREAGA ramane verde.
  const c = chunkPromovat()
  const zBase = c.voxels!.zBaseM
  const m = meshChunk(c, undefined, true)
  const V = CHUNK_CELLS + 1
  const nat = (x: number, y: number): number => groundLevelFromCm(cellHeightCm(c, x, y)) - zBase

  let verificate = 0
  for (let y = 0; y < CHUNK_CELLS; y++) {
    for (let x = 0; x < CHUNK_CELLS; x++) {
      const q = fataDeSus(m, x, y, (nat(x, y) + 1) * 100)
      if (q === -1) continue
      const o = q * 12
      // Doar coloanele cu suprafata NATURALA se netezesc; apa si gropile raman plate.
      if (!areSuprafataNaturala(c, x, y, nat(x, y))) continue
      const asteptat = [
        c.vertexCm[y * V + x]! - zBase * 100,
        c.vertexCm[y * V + x + 1]! - zBase * 100,
        c.vertexCm[(y + 1) * V + x + 1]! - zBase * 100,
        c.vertexCm[(y + 1) * V + x]! - zBase * 100,
      ]
      const asteptatX = [x * 100, (x + 1) * 100, (x + 1) * 100, x * 100]
      const asteptatY = [y * 100, y * 100, (y + 1) * 100, (y + 1) * 100]
      verificate++
      for (let v = 0; v < 4; v++) {
        assert.equal(
          m.positions[o + v * 3], asteptatX[v],
          `celula (${x},${y}), varful ${v}: x = ${m.positions[o + v * 3]}, asteptat ${asteptatX[v]}`,
        )
        assert.equal(
          m.positions[o + v * 3 + 1], asteptatY[v],
          `celula (${x},${y}), varful ${v}: y = ${m.positions[o + v * 3 + 1]}, asteptat ${asteptatY[v]}`,
        )
        assert.equal(
          m.positions[o + v * 3 + 2], asteptat[v],
          `celula (${x},${y}), varful ${v}: ${m.positions[o + v * 3 + 2]} cm, asteptat ${asteptat[v]}`,
        )
      }
    }
  }
  assert.ok(verificate > 500, `doar ${verificate} fete netezite verificate — fixtura nu atinge cazul`)
})

test('doua fete netezite vecine impart doua varfuri, deci si cotele SI ocluzia lor', () => {
  // Independent de generator: nu cere ca o cota sa fie o anume valoare, ci ca
  // suprafata sa fie CONTINUA. Prinde inversarea axelor, pe care testul de mai sus
  // n-o vede — acolo geometria ramane coerenta cu ea insasi, doar rasucita.
  //
  // Restrans la fetele NETEZITE: peste toate fetele de 1×1 codul corect are
  // „crapaturi" legitime, acolo unde o groapa sapata sta langa suprafata neatinsa.
  const c = chunkPromovat()
  const zBase = c.voxels!.zBaseM
  const m = meshChunk(c, undefined, true)
  const nat = (x: number, y: number): number => groundLevelFromCm(cellHeightCm(c, x, y)) - zBase
  const netezita = (x: number, y: number): number => {
    const q = fataDeSus(m, x, y, (nat(x, y) + 1) * 100)
    if (q === -1) return -1
    return areSuprafataNaturala(c, x, y, nat(x, y)) ? q : -1
  }

  // Un varf comun, exprimat ca (quad, indice) in fiecare din cele doua fete.
  //
  // COTA se compara mereu: varfurile vin din `vertexCm`, care nu stie de niveluri.
  //
  // OCLUZIA doar cand cele doua fete sunt pe ACELASI nivel. AO se calculeaza din
  // ocuparea din jurul coltului la nivelul FETEI, deci doua fete vecine aflate pe
  // niveluri diferite au, in acelasi colt (x,y), vecinatati diferite — si au voie sa
  // difere. Prima varianta a testului cerea egalitate peste tot si a picat pe cod
  // corect, la perechea (1,0)-(2,0): instrumentul era prea tare, nu codul gresit.
  //
  // Restrictia nu slabeste testul acolo unde conteaza: pe fetele de acelasi nivel,
  // coltul e acelasi punct cu aceeasi vecinatate, deci o rotire a tiparului de AO —
  // stricaciunea pe care testul de mai jos n-o vede, fiindca masoara doar PREZENTA —
  // se vede aici.
  let cote = 0
  let ocluzii = 0
  const comun = (a: number, va: number, b: number, vb: number, acelasiNivel: boolean, ce: string): void => {
    cote++
    assert.equal(m.positions[a * 12 + va * 3 + 2], m.positions[b * 12 + vb * 3 + 2], `crapatura: ${ce}`)
    if (!acelasiNivel) return
    ocluzii++
    assert.equal(m.ao[a * 4 + va], m.ao[b * 4 + vb], `ocluzie discontinua: ${ce}`)
  }

  let perechi = 0
  for (let y = 0; y < CHUNK_CELLS - 1; y++) {
    for (let x = 0; x < CHUNK_CELLS - 1; x++) {
      const a = netezita(x, y)
      // Vecinul pe X: varfurile 1,2 ale lui A sunt varfurile 0,3 ale lui B.
      const bx = netezita(x + 1, y)
      if (a !== -1 && bx !== -1) {
        perechi++
        const n1 = nat(x, y) === nat(x + 1, y)
        comun(a, 1, bx, 0, n1, `(${x},${y}) si (${x + 1},${y}), coltul de jos`)
        comun(a, 2, bx, 3, n1, `(${x},${y}) si (${x + 1},${y}), coltul de sus`)
      }
      // Vecinul pe Y: varfurile 3,2 ale lui A sunt varfurile 0,1 ale lui B. Axa asta
      // lipsea, iar fara ea o inversare care pastreaza continuitatea pe X trecea.
      const by = netezita(x, y + 1)
      if (a !== -1 && by !== -1) {
        perechi++
        const n2 = nat(x, y) === nat(x, y + 1)
        comun(a, 3, by, 0, n2, `(${x},${y}) si (${x},${y + 1}), coltul din stanga`)
        comun(a, 2, by, 1, n2, `(${x},${y}) si (${x},${y + 1}), coltul din dreapta`)
      }
    }
  }
  assert.ok(perechi > 800, `doar ${perechi} perechi de fete netezite vecine — fixtura nu atinge cazul`)
  assert.ok(cote > 1600, `doar ${cote} varfuri comune verificate pe cota`)
  // Contorul care conteaza: restrictia la acelasi nivel n-a golit multimea.
  assert.ok(ocluzii > 400, `doar ${ocluzii} varfuri comune pe acelasi nivel — ocluzia nu e probata`)
})

test('fetele NETEZITE primesc ocluzie, nu doar cele unite lacom', () => {
  // Suprafata naturala iese din unirea lacoma si se emite pe alta cale. Toate cele
  // opt teste de AO cheama `meshChunk` FARA al treilea argument, deci `natLevel` e
  // plin de NECUNOSCUT si calea netezita nu se atinge niciodata — desi prin ea ies
  // 768 din 1000 de quaduri ale unui chunk promovat.
  const c = chunkPromovat()
  const m = meshChunk(c, undefined, true)
  const zBase = c.voxels!.zBaseM
  const nat = (x: number, y: number): number => groundLevelFromCm(cellHeightCm(c, x, y)) - zBase

  let netezite = 0
  let ocluzate = 0
  for (let y = 0; y < CHUNK_CELLS; y++) {
    for (let x = 0; x < CHUNK_CELLS; x++) {
      const q = fataDeSus(m, x, y, (nat(x, y) + 1) * 100)
      if (q === -1) continue
      if (!areSuprafataNaturala(c, x, y, nat(x, y))) continue
      netezite++
      for (let v = 0; v < 4; v++) if (m.ao[q * 4 + v]! < 3) { ocluzate++; break }
    }
  }
  assert.ok(netezite > 500, `doar ${netezite} fete netezite — fixtura nu atinge cazul`)
  // Pe teren real, o parte dintre ele au vecini mai inalti. Nici toate, nici niciuna.
  assert.ok(ocluzate > 20, `doar ${ocluzate} din ${netezite} fete netezite au vreo ocluzie — AO nu ajunge pe calea netezita`)
  assert.ok(ocluzate < netezite, `TOATE cele ${netezite} fete netezite sunt ocluzate — suspect de saturatie`)
})

test('netezirea sterge peretii de treapta, si de-aia creste numarul de quaduri', () => {
  const c = chunkPromovat()
  const fara = meshChunk(c)
  const cu = meshChunk(c, undefined, true)

  // Observabilul e numarul de PERETI DE TREAPTA, nu aria laterala totala: aia e
  // dominata de fetele de granita ale unui chunk fara vecini si de podeaua
  // ferestrei de voxeli, care n-au nicio treaba cu netezirea. Masurat: 281 -> 99.
  const t0 = quaduriDeTreapta(fara)
  const t1 = quaduriDeTreapta(cu)
  assert.ok(t0 > 100, `fixtura moarta: doar ${t0} pereti de treapta inainte de netezire`)
  assert.ok(t1 < t0 * 0.5, `peretii de treapta: ${t0} -> ${t1}, asteptam sub jumatate`)
  // Dar fetele de sus nu se mai pot uni, deci per total sunt MAI MULTE quaduri.
  assert.ok(cu.quadCount > fara.quadCount, `quaduri: ${fara.quadCount} -> ${cu.quadCount}`)
})

test('o groapa sapata NU primeste fata netezita', () => {
  // Ce POT proba ieftin: coloana sapata nu e „suprafata naturala", deci tavanul ei
  // ramane la metru intreg. Aia e conditia pe care sta tot mecanismul — „atins de
  // jucator" citit din diferenta dintre ce e si ce ar fi fost, fara niciun camp nou.
  const c = chunkPromovat()
  const zBase = c.voxels!.zBaseM
  const nat = (x: number, y: number): number => groundLevelFromCm(cellHeightCm(c, x, y)) - zBase

  const lx = 16
  const ly = 16
  const nivel = nat(lx, ly)
  let sapate = 0
  for (let k = 0; k < 4; k++) if (setVoxel(c, lx, ly, zBase + nivel - k, Material.AER)) sapate++
  assert.equal(sapate, 4, 'fixtura: n-am putut sapa patru niveluri')

  const m = meshChunk(c, undefined, true)
  // Se sapa PATRU niveluri de la `nivel` in jos, deci varful solid ramas e la
  // dupa z: o fata NETEZITA n-are cota intreaga, deci n-ar fi gasita dupa ea.
  const susLa = (cx: number, cy: number): number => {
    for (let q = 0; q < m.quadCount; q++) {
      if (m.faces[q] !== Face.Z_POS) continue
      const o = q * 12
      if (pm(m, o) === cx && pm(m, o + 1) === cy) return q
    }
    return -1
  }
  const fund = nivel - 3
  const jos = susLa(lx, ly)
  assert.notEqual(jos, -1, 'fundul gropii n-are fata de sus')
  for (let v = 0; v < 4; v++) {
    assert.equal(
      m.positions[jos * 12 + v * 3 + 2], fund * 100,
      `fundul gropii a fost netezit: varful ${v} la ${m.positions[jos * 12 + v * 3 + 2]} cm in loc de ${fund * 100}`,
    )
  }

  // Si, in contrast, o coloana NEATINSA de langa ea chiar e netezita.
  const vecin = susLa(lx + 2, ly)
  assert.notEqual(vecin, -1, 'fixtura: vecinul neatins n-are fata de sus la nivelul lui natural')
  let subMetrice = 0
  for (let v = 0; v < 4; v++) if (m.positions[vecin * 12 + v * 3 + 2]! % 100 !== 0) subMetrice++
  assert.ok(subMetrice > 0, 'vecinul neatins n-a fost netezit, deci contrastul nu proba nimic')
})

// ---------------------------------------------------------------------------
// etanseitatea invelisului netezit
// ---------------------------------------------------------------------------

/**
 * Cota desenata a fetei de sus A CELULEI (x,y), evaluata pe mijlocul muchiei.
 *
 * Fata se cauta dupa CENTRUL celulei, nu dupa mijlocul muchiei: mijlocul apartine
 * AMANDUROR celulelor, iar cautarea dupa el intoarce aceeasi fata pentru ambele
 * parti, deci orice diferenta dispare. Prima varianta a instrumentului facea exact
 * asta si a picat controlul de otrava — o fata coborata cu 50 cm nu producea nicio
 * gaura.
 *
 * `tinta` ancoreaza alegerea pe suprafata NATURALA, nu pe „cea mai de sus fata":
 * o lespede plutitoare sau o streasina sunt forme legale si ar face masuratoarea
 * sa minta.
 */
function cotaPeMuchie(m: ReturnType<typeof meshChunk>, x: number, y: number, dx: number, dy: number, tinta: number): number | null {
  const cxm = (x + 0.5) * 100
  const cym = (y + 0.5) * 100
  const mx = (x + 0.5 + dx * 0.5) * 100
  const my = (y + 0.5 + dy * 0.5) * 100
  let best: number | null = null
  let bestD = Infinity
  for (let q = 0; q < m.quadCount; q++) {
    if (m.faces[q] !== Face.Z_POS) continue
    const o = q * 12
    const xs = [m.positions[o]!, m.positions[o + 3]!, m.positions[o + 6]!, m.positions[o + 9]!]
    const ys = [m.positions[o + 1]!, m.positions[o + 4]!, m.positions[o + 7]!, m.positions[o + 10]!]
    const zs = [m.positions[o + 2]!, m.positions[o + 5]!, m.positions[o + 8]!, m.positions[o + 11]!]
    if (Math.min(...xs) > cxm || Math.max(...xs) < cxm) continue
    if (Math.min(...ys) > cym || Math.max(...ys) < cym) continue
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const tx = x1 > x0 ? (mx - x0) / (x1 - x0) : 0
    const ty = y1 > y0 ? (my - y0) / (y1 - y0) : 0
    const sus = zs[0]! + (zs[1]! - zs[0]!) * tx
    const jos = zs[3]! + (zs[2]! - zs[3]!) * tx
    const z = sus + (jos - sus) * ty
    const dd = Math.abs(z - tinta)
    if (dd < bestD) { bestD = dd; best = z }
  }
  return best
}

/** Cat din intervalul [a,b] de pe planul muchiei e acoperit de fete laterale, in cm. */
function acoperit(m: ReturnType<typeof meshChunk>, x: number, y: number, dx: number, dy: number, a: number, b: number): number {
  const lo = Math.min(a, b), hi = Math.max(a, b)
  const peX = dx !== 0
  const plan = peX ? (dx > 0 ? x + 1 : x) * 100 : (dy > 0 ? y + 1 : y) * 100
  const mid = peX ? (y + 0.5) * 100 : (x + 0.5) * 100
  const intervale: [number, number][] = []
  for (let q = 0; q < m.quadCount; q++) {
    const f = m.faces[q]!
    if (f === Face.Z_POS || f === Face.Z_NEG) continue
    if (peX !== (f === Face.X_POS || f === Face.X_NEG)) continue
    const o = q * 12
    const xs = [m.positions[o]!, m.positions[o + 3]!, m.positions[o + 6]!, m.positions[o + 9]!]
    const ys = [m.positions[o + 1]!, m.positions[o + 4]!, m.positions[o + 7]!, m.positions[o + 10]!]
    const zs = [m.positions[o + 2]!, m.positions[o + 5]!, m.positions[o + 8]!, m.positions[o + 11]!]
    if ((peX ? xs[0]! : ys[0]!) !== plan) continue
    const alt = peX ? ys : xs
    if (Math.min(...alt) > mid || Math.max(...alt) < mid) continue
    intervale.push([Math.min(...zs), Math.max(...zs)])
  }
  intervale.sort((p, q) => p[0] - q[0])
  let acop = 0
  let cursor = lo
  for (const [s0, e0] of intervale) {
    if (e0 <= cursor) continue
    if (s0 >= hi) break
    acop += Math.min(e0, hi) - Math.max(s0, cursor)
    cursor = Math.max(cursor, Math.min(e0, hi))
  }
  return acop
}

/** Cate gauri si cata arie neacoperita are invelisul, pe granitele interioare. */
function gauri(m: ReturnType<typeof meshChunk>, tinta: (x: number, y: number) => number): { n: number; arie: number } {
  let n = 0
  let arie = 0
  for (let y = 0; y < CHUNK_CELLS; y++) {
    for (let x = 0; x < CHUNK_CELLS; x++) {
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        if (x + dx >= CHUNK_CELLS || y + dy >= CHUNK_CELLS) continue
        const a = cotaPeMuchie(m, x, y, dx, dy, tinta(x, y))
        const b = cotaPeMuchie(m, x + dx, y + dy, -dx, -dy, tinta(x + dx, y + dy))
        if (a === null || b === null) continue
        if (Math.abs(a - b) < 0.5) continue
        const lipsa = Math.abs(a - b) - acoperit(m, x, y, dx, dy, a, b)
        if (lipsa > 1) { n++; arie += lipsa / 100 }
      }
    }
  }
  return { n, arie: Math.round(arie * 100) / 100 }
}

test('INVELISUL NETEZIT e ETANS: nicio gaura prin care sa se vada fundalul', () => {
  // Testul care lipsea. Netezirea muta varfurile fetei de sus la cotele reale, si
  // acolo unde vecina NU e netezita — apa, o groapa, o coloana zidita — tavanul ei
  // ramane plat. Intre cele doua cote nu emitea nimeni geometrie: peretele de voxel
  // acopera exact un metru, restul era fundal.
  //
  // Masurat inainte de fusta, pe 12 chunkuri VIRGINE: 26 de gauri, 5,44 m². Apar pe
  // linia de mal, fiindca apa nu e solida, deci coloana ei nu are suprafata
  // naturala si nu se netezeste.
  const c = chunkPromovat()
  const zBase = c.voxels!.zBaseM
  const tinta = (x: number, y: number): number => (groundLevelFromCm(cellHeightCm(c, x, y)) - zBase + 1) * 100

  // CONTROLUL: meshul FIDEL e etans prin constructie. Daca instrumentul raporteaza
  // gauri si aici, el e stricat, nu netezirea.
  const fidel = gauri(meshChunk(c), tinta)
  assert.equal(fidel.n, 0, `instrumentul raporteaza ${fidel.n} gauri pe meshul FIDEL, care e etans prin constructie`)

  const neted = gauri(meshChunk(c, undefined, true), tinta)
  assert.equal(neted.n, 0, `${neted.n} gauri, ${neted.arie} m² de fundal vizibil prin invelisul netezit`)
})

test('fixtura de etanseitate ATINGE cazul: exista muchii intre netezit si nenetezit', () => {
  // Fara asertiunea asta, testul de mai sus ar fi verde pe un chunk fara mal si
  // fara gropi — adica fara nicio muchie pe care fusta sa aiba ce face.
  const c = chunkPromovat()
  const m = meshChunk(c, undefined, true)
  // Fustele sunt singurele fete LATERALE cu vreo cota sub-metrica.
  let fuste = 0
  for (let q = 0; q < m.quadCount; q++) {
    const f = m.faces[q]!
    if (f === Face.Z_POS || f === Face.Z_NEG) continue
    const o = q * 12
    for (let v = 0; v < 4; v++) if (m.positions[o + v * 3 + 2]! % 100 !== 0) { fuste++; break }
  }
  assert.ok(fuste > 10, `doar ${fuste} fuste emise — fixtura n-are mal si n-are gropi, deci etanseitatea nu proba nimic`)
})

/**
 * Cate triunghiuri ies DORSALE dupa triangularea de productie, si ce arie.
 *
 * Deosebirea fata de testul de deasupra: se verifica AMANDOUA triunghiurile fiecarui
 * quad, nu doar primul. Un quad „papion" — care se auto-intersecteaza — are exact
 * asta: primul triunghi corect, al doilea intors pe dos. Testul care se uita doar la
 * primul nu-l poate vedea.
 *
 * Triunghiurile cu aria zero se SAR, si se numara: fusta emite triunghiuri ca quaduri
 * cu ultimele doua varfuri suprapuse, deci degeneratele sunt normale acolo.
 */
function dorsale(m: ReturnType<typeof meshChunk>): { dorsale: number; arieCm2: number; degenerate: number; verificate: number; primul: string } {
  const idx = new Uint32Array(6)
  const p = m.positions
  let nd = 0
  let arie = 0
  let deg = 0
  let ver = 0
  let primul = ''
  for (let q = 0; q < m.quadCount; q++) {
    writeQuadIndices(m, q, 0, idx, 0)
    const face = m.faces[q]!
    const asteptat = [
      face === Face.X_POS ? 1 : face === Face.X_NEG ? -1 : 0,
      face === Face.Z_POS ? 1 : face === Face.Z_NEG ? -1 : 0,
      face === Face.Y_POS ? 1 : face === Face.Y_NEG ? -1 : 0,
    ]
    // spatiul lui three: (x, z, y) din spatiul mesher-ului
    const varf = (k: number): [number, number, number] => {
      const b = q * 12 + k * 3
      return [p[b]!, p[b + 2]!, p[b + 1]!]
    }
    for (let t = 0; t < 2; t++) {
      const a = varf(idx[t * 3]!)
      const b = varf(idx[t * 3 + 1]!)
      const c = varf(idx[t * 3 + 2]!)
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
      const n = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ]
      const lung = Math.hypot(n[0]!, n[1]!, n[2]!)
      if (lung === 0) { deg++; continue }
      ver++
      const dot = (n[0]! * asteptat[0]! + n[1]! * asteptat[1]! + n[2]! * asteptat[2]!) / lung
      if (dot < 0) {
        nd++
        arie += lung / 2
        if (!primul) primul = `q=${q} fata=${face} triunghi=${t + 1} dot=${dot.toFixed(3)}`
      }
    }
  }
  return { dorsale: nd, arieCm2: arie, degenerate: deg, verificate: ver, primul }
}

test('niciun quad NETEZIT nu e „papion": ambele triunghiuri arata in afara', () => {
  // Fusta umple golul dintre muchia netezita si cota plata a vecinului nenetezit.
  // Cand cele doua cote ale muchiei cad de o parte si de alta a cotei plate, un
  // singur quad se auto-intersecteaza: cele doua triunghiuri ies cu infasurari
  // OPUSE, culling-ul il sterge pe cel dorsal, si ramane o gaura — chiar in
  // geometria pusa acolo ca sa inchida gauri.
  //
  // Masurat la gasire: **15 triunghiuri dorsale, 0,680 m²** pe chunk-ul fixturii.
  // Testul de infasurare de deasupra nu putea sa-l vada: se uita doar la PRIMUL
  // triunghi al fiecarui quad, iar la un papion ala e cel corect.
  const c = chunkPromovat()

  // Controlul: pe meshul FIDEL acelasi oracol trece. Fara el, un „0 dorsale" ar
  // putea insemna la fel de bine ca oracolul s-a stricat.
  const fidel = dorsale(meshChunk(c))
  assert.equal(fidel.dorsale, 0, `oracolul e stricat: ${fidel.dorsale} dorsale pe meshul FIDEL`)
  assert.ok(fidel.verificate > 1000, `oracolul a verificat doar ${fidel.verificate} triunghiuri pe meshul fidel`)

  const netezit = dorsale(meshChunk(c, undefined, true))
  assert.equal(netezit.dorsale, 0,
    `${netezit.dorsale} triunghiuri dorsale, ${(netezit.arieCm2 / 10000).toFixed(3)} m² sterse de culling. Primul: ${netezit.primul}`)
  assert.ok(netezit.verificate > 1000, `doar ${netezit.verificate} triunghiuri verificate pe calea netezita`)
  // Fixtura ATINGE cazul: exista chiar triunghiuri emise ca quaduri degenerate, adica
  // fuste taiate la cota plata. Fara ele, testul n-ar proba nimic despre taiere.
  assert.ok(netezit.degenerate > 0, 'fixtura moarta: nicio fusta nu e taiata la cota plata')
})

test('nici in configuratia de PRODUCTIE — vecini SI netezire — nu exista dorsale', () => {
  // Testul de deasupra merge pe un chunk fara vecini. Viewerul cheama
  // `meshChunk(chunk, neighboursOf(chunk), true)`, si vecinii schimba ce fete se
  // emit: o fata acoperita de vecin se taie, iar `natLevel` primeste apron. Un test
  // pe configuratia gresita apara alt cod decat cel care ruleaza.
  const { terrain } = makeM10(20260913, 300, 300, 11)
  const la = (cx: number, cy: number): Chunk | null => terrain.chunks.get(cy * 512 + cx) ?? null
  const promovate = [...terrain.keys].map((k) => terrain.chunks.get(k)!).filter((c) => c.voxels)
  assert.ok(promovate.length > 100, `fixtura: doar ${promovate.length} chunk-uri promovate`)

  let total = 0
  let verificate = 0
  let degenerate = 0
  let primul = ''
  for (const c of promovate) {
    const m = meshChunk(c, {
      xNeg: la(c.cx - 1, c.cy), xPos: la(c.cx + 1, c.cy), yNeg: la(c.cx, c.cy - 1), yPos: la(c.cx, c.cy + 1),
      xNegYNeg: la(c.cx - 1, c.cy - 1), xPosYNeg: la(c.cx + 1, c.cy - 1),
      xNegYPos: la(c.cx - 1, c.cy + 1), xPosYPos: la(c.cx + 1, c.cy + 1),
    }, true)
    const r = dorsale(m)
    total += r.dorsale
    verificate += r.verificate
    degenerate += r.degenerate
    if (!primul && r.primul) primul = `chunk ${c.cx}/${c.cy}: ${r.primul}`
  }
  assert.equal(total, 0, `${total} triunghiuri dorsale pe fixtura intreaga. Primul: ${primul}`)
  assert.ok(verificate > 500_000, `doar ${verificate} triunghiuri verificate`)
  assert.ok(degenerate > 0, 'fixtura moarta: nicio fusta taiata in toata fixtura')
})
