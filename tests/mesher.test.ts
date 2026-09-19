import test from 'node:test'
import assert from 'node:assert/strict'
import { countNaiveFaces, Face, meshChunk } from '../src/render/mesher.ts'
import {
  CHUNK_CELLS,
  cellHeightCm,
  encodeAll,
  generateChunk,
  groundLevelFromCm,
  Material,
  promote,
  setVoxel,
  VOXEL_LEVELS,
} from '../src/sim/terrain/chunk.ts'
import type { Chunk } from '../src/sim/terrain/chunk.ts'
import { nextInt, stream } from '../src/sim/rng.ts'
import { chunkKey, createTerrain, dig, fill, groundLevelM, setFocus } from '../src/sim/terrain/terrain.ts'
import { writeQuadIndices } from '../src/render/winding.ts'

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
function ariaLaterala(m: ReturnType<typeof meshChunk>): number {
  let a = 0
  for (let q = 0; q < m.quadCount; q++) {
    const f = m.faces[q]!
    if (f === Face.Z_POS || f === Face.Z_NEG) continue
    const o = q * 12
    const du = Math.abs(pm(m, o + 3) - pm(m, o)) + Math.abs(pm(m, o + 4) - pm(m, o + 1)) + Math.abs(pm(m, o + 5) - pm(m, o + 2))
    const dv = Math.abs(pm(m, o + 9) - pm(m, o)) + Math.abs(pm(m, o + 10) - pm(m, o + 1)) + Math.abs(pm(m, o + 11) - pm(m, o + 2))
    a += du * dv
  }
  return a
}

test('netezirea aseaza fetele de sus la cote REALE, nu la metri intregi', () => {
  const c = chunkPromovat()
  const fara = meshChunk(c)
  const cu = meshChunk(c, undefined, true)

  // Fara netezire, ORICE cota e multiplu de 100 cm. Cu netezire, aproape niciuna.
  const subMetru = (m: ReturnType<typeof meshChunk>): number => {
    let n = 0
    for (let q = 0; q < m.quadCount; q++) {
      if (m.faces[q] !== Face.Z_POS) continue
      for (let v = 0; v < 4; v++) if (m.positions[q * 12 + v * 3 + 2]! % 100 !== 0) n++
    }
    return n
  }
  assert.equal(subMetru(fara), 0, 'fara netezire nicio cota n-are voie sa fie sub-metrica')
  assert.ok(subMetru(cu) > 1000, `cu netezire abia ${subMetru(cu)} cote sunt sub-metrice — netezirea nu s-a aplicat`)
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

test('o groapa sapata NU se neteseste, si peretii ei raman toti', () => {
  // Cazul care poate produce o GAURA: coloana sapata nu primeste fata netezita,
  // deci tavanul ei ramane plat si jos. Daca peretele dintre ea si vecina neatinsa
  // s-ar suprima ca „treapta naturala", s-ar vedea fundalul prin el.
  const c = chunkPromovat()
  const inainte = ariaLaterala(meshChunk(c, undefined, true))

  // Se sapa o coloana pana la 4 m sub suprafata ei.
  const lx = 16, ly = 16
  const zBase = c.voxels!.zBaseM
  const nivel = groundLevelFromCm(cellHeightCm(c, lx, ly)) - zBase
  let sapate = 0
  for (let k = 0; k < 4; k++) {
    if (setVoxel(c, lx, ly, zBase + nivel - k, Material.AER)) sapate++
  }
  assert.equal(sapate, 4, 'fixtura: n-am putut sapa patru niveluri')

  const dupa = ariaLaterala(meshChunk(c, undefined, true))
  // Groapa are patru pereti; cu patru niveluri sapate asta inseamna 16 m² noi,
  // minus ce era deja perete din cauza pantei. Cerem cel putin jumatate.
  assert.ok(dupa >= inainte + 8, `aria laterala trebuia sa creasca cu peretii gropii: ${inainte} -> ${dupa} m²`)
})
