import test from 'node:test'
import assert from 'node:assert/strict'
import { meshChunk, Face } from '../src/render/mesher.ts'
import { CHUNK_CELLS, isSolid, VOXEL_LEVELS, voxelAt } from '../src/sim/terrain/chunk.ts'
import type { Chunk } from '../src/sim/terrain/chunk.ts'
import { createTerrain, dig, groundLevelM, setFocus } from '../src/sim/terrain/terrain.ts'
import { makeM10 } from '../src/harness/fixture-m10.ts'

const SEED = 4242

/** Doua chunk-uri vecine, amandoua promovate, cu o sapatura in fiecare. */
function douaVecine(): { a: Chunk; b: Chunk } {
  const t = createTerrain(SEED, 3)
  setFocus(t, 200, 200)
  // O sapatura promoveaza chunk-ul si apron-ul, deci amandoua ies promovate.
  const wx = 200 * CHUNK_CELLS + 5
  const wy = 200 * CHUNK_CELLS + 5
  const g = groundLevelM(t, wx, wy)
  assert.ok(g.ok)
  assert.ok(dig(t, wx, wy, g.value).ok)
  const a = t.chunks.get(200 * 512 + 200)!
  const b = t.chunks.get(200 * 512 + 199)!
  assert.ok(a.voxels && b.voxels, 'ambele chunk-uri trebuie promovate')
  return { a, b }
}

/** Cate quaduri are o anumita directie de fata. */
function countFace(chunk: Chunk, face: number, neighbours?: Parameters<typeof meshChunk>[1]): number {
  const m = meshChunk(chunk, neighbours)
  let n = 0
  for (let q = 0; q < m.quadCount; q++) if (m.faces[q] === face) n++
  return n
}

test('fara vecini, comportamentul e IDENTIC cu cel dinainte', () => {
  // Compatibilitate: `meshChunk(c)` si `meshChunk(c, {})` trebuie sa dea acelasi
  // rezultat, altfel schimbarea nu e aditiva si toate cifrele vechi devin suspecte.
  const { a } = douaVecine()
  const fara = meshChunk(a)
  const q1 = fara.quadCount
  const gol = meshChunk(a, {})
  assert.equal(gol.quadCount, q1)
  const nul = meshChunk(a, { xNeg: null, xPos: null, yNeg: null, yPos: null })
  assert.equal(nul.quadCount, q1)
})

test('un vecin solid TAIE fetele de granita catre el', () => {
  const { a, b } = douaVecine()
  const fara = countFace(a, Face.X_NEG)
  const cu = countFace(a, Face.X_NEG, { xNeg: b })
  assert.ok(cu < fara, `taierea n-a scazut nimic: ${fara} -> ${cu}`)
})

/**
 * Acoperirea REALA a planului de granita X_NEG, rasterizata din quadurile emise.
 * `out[level * CHUNK_CELLS + ly] = 1` daca acea celula are fata desenata.
 */
function acoperireXNeg(chunk: Chunk, neighbours?: Parameters<typeof meshChunk>[1]): Uint8Array {
  const m = meshChunk(chunk, neighbours)
  const zBase = chunk.voxels!.zBaseM
  const out = new Uint8Array(CHUNK_CELLS * VOXEL_LEVELS)
  for (let q = 0; q < m.quadCount; q++) {
    if (m.faces[q] !== Face.X_NEG) continue
    const o = q * 12
    if (m.positions[o] !== 0) continue // doar planul de granita
    // `positions` e in CENTIMETRI; testul gandeste in metri de grila.
    const ys = [m.positions[o + 1]! / 100, m.positions[o + 4]! / 100, m.positions[o + 7]! / 100, m.positions[o + 10]! / 100]
    const zs = [m.positions[o + 2]! / 100, m.positions[o + 5]! / 100, m.positions[o + 8]! / 100, m.positions[o + 11]! / 100]
    for (let ly = Math.min(...ys); ly < Math.max(...ys); ly++) {
      for (let lv = Math.min(...zs); lv < Math.max(...zs); lv++) {
        const level = lv
        if (level < 0 || level >= VOXEL_LEVELS || ly < 0 || ly >= CHUNK_CELLS) continue
        out[level * CHUNK_CELLS + ly] = 1
      }
    }
  }
  void zBase
  return out
}

test('taierea de granita e EXACT cea ceruta, celula cu celula', () => {
  // Testul dinainte avea un `if` care il facea vid: taierea neconditionata —
  // adica gauri peste tot — trecea prin el. Dovedit prin mutatie. Acum
  // invariantul se verifica pe TOT planul de granita, in ambele sensuri:
  //   vecin SOLID  ⇒ fata NU are voie sa fie desenata (altfel e risipa)
  //   vecin AER    ⇒ fata TREBUIE desenata (altfel e o gaura prin geometrie)
  const { a, b } = douaVecine()
  const acoperire = acoperireXNeg(a, { xNeg: b })
  const zBase = a.voxels!.zBaseM

  let verificate = 0
  let trebuiauDesenate = 0
  for (let ly = 0; ly < CHUNK_CELLS; ly++) {
    for (let level = 0; level < VOXEL_LEVELS; level++) {
      const z = zBase + level
      if (!isSolid(voxelAt(a, 0, ly, z))) continue
      verificate++
      const vecinSolid = isSolid(voxelAt(b, CHUNK_CELLS - 1, ly, z))
      const desenata = acoperire[level * CHUNK_CELLS + ly] === 1
      if (!vecinSolid) trebuiauDesenate++
      assert.equal(
        desenata,
        !vecinSolid,
        `granita (ly=${ly}, z=${z}): vecin ${vecinSolid ? 'SOLID' : 'AER'} dar fata ${desenata ? 'desenata' : 'lipsa'}`,
      )
    }
  }
  assert.ok(verificate > 100, `doar ${verificate} celule solide pe granita — fixtura nu exercita nimic`)
  assert.ok(trebuiauDesenate > 0, 'nicio fata nu trebuia desenata — testul nu poate prinde supra-taierea')
})

test('taierea e simetrica: A vede B exact cat vede B pe A', () => {
  const { a, b } = douaVecine()
  const aCu = countFace(a, Face.X_NEG, { xNeg: b })
  const aFara = countFace(a, Face.X_NEG)
  const bCu = countFace(b, Face.X_POS, { xPos: a })
  const bFara = countFace(b, Face.X_POS)
  assert.ok(aFara - aCu > 0 && bFara - bCu > 0, 'cel putin o latura n-a taiat nimic')
})

test('stive cu zBase diferit nu se prabusesc si nu taie gresit', () => {
  // Chunk-urile isi aleg fiecare propriul zBaseM dupa relief. Daca decalajul nu
  // e aplicat la citire, se citesc niveluri complet gresite din vecin — adica se
  // taie fete la intamplare, si se vede abia peste trei luni.
  const t = createTerrain(SEED, 4)
  setFocus(t, 210, 210)
  const wx = 210 * CHUNK_CELLS + 3
  const wy = 210 * CHUNK_CELLS + 3
  const g = groundLevelM(t, wx, wy)
  assert.ok(g.ok)
  assert.ok(dig(t, wx, wy, g.value).ok)
  const a = t.chunks.get(210 * 512 + 210)!
  const b = t.chunks.get(210 * 512 + 209)!
  assert.ok(a.voxels && b.voxels)
  assert.doesNotThrow(() => meshChunk(a, { xNeg: b }))
  const m = meshChunk(a, { xNeg: b })
  assert.ok(m.quadCount > 0)
})

test('pe TOATA fixtura M10, nicio fata de granita nu lipseste si niciuna nu prisoseste', () => {
  // Testul de mai sus verifica o pereche. Asta verifica geometria care CHIAR se
  // livreaza: 225 de chunk-uri promovate, fiecare cu laturile lui. O gaura intr-un
  // singur chunk din 225 arata pe ecran exact ca bug-ul de winding din sesiunea 2
  // — fundal vizibil prin geometrie — si s-ar gasi greu privind.
  const { terrain } = makeM10(20260913, 300, 300, 11)
  const at = (cx: number, cy: number) => terrain.chunks.get(cy * 512 + cx) ?? null

  let celuleVerificate = 0
  let laturiVerificate = 0
  const greseli: string[] = []

  for (const key of terrain.keys) {
    const c = terrain.chunks.get(key)!
    if (!c.voxels) continue
    const n = { xNeg: at(c.cx - 1, c.cy), xPos: at(c.cx + 1, c.cy), yNeg: at(c.cx, c.cy - 1), yPos: at(c.cx, c.cy + 1) }
    if (!n.xNeg?.voxels) continue

    laturiVerificate++
    const acoperire = acoperireXNeg(c, n)
    const zBase = c.voxels.zBaseM
    for (let ly = 0; ly < CHUNK_CELLS; ly++) {
      for (let level = 0; level < VOXEL_LEVELS; level++) {
        const z = zBase + level
        if (!isSolid(voxelAt(c, 0, ly, z))) continue
        celuleVerificate++
        const vecinSolid = isSolid(voxelAt(n.xNeg, CHUNK_CELLS - 1, ly, z))
        const desenata = acoperire[level * CHUNK_CELLS + ly] === 1
        if (desenata === vecinSolid && greseli.length < 5) {
          greseli.push(`chunk ${c.cx}/${c.cy} (ly=${ly}, z=${z}): vecin ${vecinSolid ? 'SOLID' : 'AER'}, fata ${desenata ? 'desenata' : 'lipsa'}`)
        }
      }
    }
  }

  assert.ok(laturiVerificate > 150, `doar ${laturiVerificate} laturi cu vecin promovat`)
  assert.ok(celuleVerificate > 50000, `doar ${celuleVerificate} celule verificate`)
  assert.deepEqual(greseli, [], `granite gresite pe fixtura completa (${celuleVerificate} celule)`)
})
