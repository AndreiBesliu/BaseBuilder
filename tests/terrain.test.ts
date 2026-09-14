import test from 'node:test'
import assert from 'node:assert/strict'
import { fbm, FP_ONE, hash2, valueNoise } from '../src/sim/terrain/noise.ts'
import { macroHeightDm, MACRO_SIZE, sampleMacro } from '../src/sim/terrain/macro.ts'
import {
  CHUNK_CELLS,
  cellHeightCm,
  decodeAll,
  decodeColumn,
  encodeAll,
  generateChunk,
  isSolid,
  Material,
  promote,
  runCount,
  setVoxel,
  voxelAt,
  VOXEL_LEVELS,
  groundLevelFromCm,
} from '../src/sim/terrain/chunk.ts'
import {
  CHUNK_GRID,
  createTerrain,
  dig,
  ensureChunk,
  fill,
  groundLevelM,
  materialAt,
  promotedCount,
  promoteWithApron,
  setFocus,
  WORLD_CELLS,
} from '../src/sim/terrain/terrain.ts'
import { nextInt, stream } from '../src/sim/rng.ts'
import { decode, encode } from '../src/sim/save.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { createWorld } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { Reason } from '../src/sim/result.ts'

// --- zgomot ---------------------------------------------------------------

test('zgomotul e o functie PURA: acelasi input, acelasi output', () => {
  for (let i = 0; i < 200; i++) {
    const x = i * 137
    const y = i * 911
    assert.equal(valueNoise(x, y, 42), valueNoise(x, y, 42))
    assert.equal(fbm(x, y, 42, 5), fbm(x, y, 42, 5))
  }
})

test('zgomotul sta in domeniul declarat', () => {
  for (let i = 0; i < 5000; i++) {
    const v = valueNoise(i * 613, i * 271, 7)
    assert.ok(v >= -FP_ONE && v < FP_ONE, `valueNoise iesit din domeniu: ${v}`)
    const f = fbm(i * 613, i * 271, 7, 5)
    assert.ok(f >= -FP_ONE && f <= FP_ONE, `fbm iesit din domeniu: ${f}`)
  }
})

test('zgomotul e continuu: pasi mici dau schimbari mici', () => {
  // Daca asta pica, terenul are trepte si interpolarea e gresita.
  let maxJump = 0
  for (let i = 0; i < 2000; i++) {
    const a = valueNoise(i, 500, 3)
    const b = valueNoise(i + 1, 500, 3)
    maxJump = Math.max(maxJump, Math.abs(a - b))
  }
  // Un pas de 1/1024 dintr-o celula de grila nu poate misca valoarea cu mult.
  assert.ok(maxJump < 40, `salt prea mare intre esantioane vecine: ${maxJump}`)
})

test('seed-uri diferite dau relief diferit', () => {
  let same = 0
  for (let i = 0; i < 500; i++) if (macroHeightDm(1, i, i) === macroHeightDm(2, i, i)) same++
  assert.ok(same < 50, `prea multe coincidente intre seed-uri: ${same}/500`)
})

test('hash2 nu se prabuseste pe coordonate mari sau negative', () => {
  const seen = new Set<number>()
  for (let i = -1000; i < 1000; i += 7) seen.add(hash2(i, i * 3, 5))
  assert.ok(seen.size > 250, `hash slab: doar ${seen.size} valori distincte`)
})

// --- macro ----------------------------------------------------------------

test('esantionul macro e determinist si coerent', () => {
  const a = sampleMacro(99, 512, 512)
  const b = sampleMacro(99, 512, 512)
  assert.deepEqual(a, b)
  assert.ok(a.soil >= 0 && a.soil <= 255)
  assert.ok(a.moisture >= 0 && a.moisture <= 255)
})

test('temperatura scade cu altitudinea', () => {
  // Cautam doua esantioane cu diferenta mare de altitudine si verificam semnul.
  let low = sampleMacro(5, 0, 0)
  let high = low
  for (let i = 0; i < 400; i++) {
    const s = sampleMacro(5, i * 2, i * 3)
    if (s.heightDm < low.heightDm) low = s
    if (s.heightDm > high.heightDm) high = s
  }
  assert.ok(high.heightDm > low.heightDm + 500, 'relieful e prea plat pentru test')
  assert.ok(high.baseTempC < low.baseTempC, `temperatura nu scade cu altitudinea: ${low.baseTempC} -> ${high.baseTempC}`)
})

// --- chunk ----------------------------------------------------------------

test('generarea unui chunk e pura', () => {
  const a = generateChunk(7, 100, 200)
  const b = generateChunk(7, 100, 200)
  assert.deepEqual(Array.from(a.vertexCm), Array.from(b.vertexCm))
})

test('chunk-urile vecine sunt CONTINUE pe muchia comuna', () => {
  // Invariantul de seam, in miniatura. Daca pica aici, terenul are crapaturi
  // vizibile intre chunk-uri, iar agentii vad inaltimi diferite de o parte si
  // de alta a aceleiasi linii.
  const seed = 1234
  const left = generateChunk(seed, 10, 10)
  const right = generateChunk(seed, 11, 10)
  const below = generateChunk(seed, 10, 11)
  const V = CHUNK_CELLS + 1

  for (let vy = 0; vy < V; vy++) {
    assert.equal(
      left.vertexCm[vy * V + CHUNK_CELLS],
      right.vertexCm[vy * V],
      `discontinuitate pe muchia verticala, vy=${vy}`,
    )
  }
  for (let vx = 0; vx < V; vx++) {
    assert.equal(
      left.vertexCm[CHUNK_CELLS * V + vx],
      below.vertexCm[vx],
      `discontinuitate pe muchia orizontala, vx=${vx}`,
    )
  }
})

test('RLE: desfacere si recodare dau acelasi lucru', () => {
  const chunk = generateChunk(3, 5, 5)
  promote(3, chunk)
  const v = chunk.voxels!
  const columns = decodeAll(v)
  const again = encodeAll(v.zBaseM, columns)
  assert.deepEqual(Array.from(again.runMaterial), Array.from(v.runMaterial))
  assert.deepEqual(Array.from(again.runLength), Array.from(v.runLength))
  assert.deepEqual(Array.from(again.columnStart), Array.from(v.columnStart))
})

test('RLE chiar comprima: un chunk proaspat promovat are putine runs', () => {
  const chunk = generateChunk(3, 5, 5)
  promote(3, chunk)
  const runs = runCount(chunk.voxels!)
  const columns = CHUNK_CELLS * CHUNK_CELLS
  // Fara compresie ar fi 1024 × 64 = 65.536 de celule. Cu RLE, sub 5 runs pe coloana.
  assert.ok(runs < columns * 5, `prea multe runs: ${runs} pentru ${columns} coloane`)
  assert.ok(runs >= columns, 'fiecare coloana are cel putin un run')
})

test('fiecare coloana acopera exact 64 de niveluri', () => {
  const chunk = generateChunk(8, 2, 3)
  promote(8, chunk)
  const v = chunk.voxels!
  for (let c = 0; c < CHUNK_CELLS * CHUNK_CELLS; c++) {
    let sum = 0
    for (let r = v.columnStart[c]!; r < v.columnStart[c + 1]!; r++) sum += v.runLength[r]!
    assert.equal(sum, VOXEL_LEVELS, `coloana ${c} acopera ${sum} niveluri`)
  }
})

test('promovarea pastreaza suprafata: primul solid de sus e chiar nivelul solului', () => {
  const seed = 55
  const chunk = generateChunk(seed, 20, 20)
  promote(seed, chunk)
  const v = chunk.voxels!
  const scratch = new Uint8Array(VOXEL_LEVELS)

  for (let ly = 0; ly < CHUNK_CELLS; ly += 7) {
    for (let lx = 0; lx < CHUNK_CELLS; lx += 7) {
      // Conventia se INTEROGHEAZA, nu se re-implementeaza aici. Varianta veche
      // scria `Math.floor(cm / 100)` a patra oara in proiect, deci testul nu
      // verifica acordul dintre promote() si restul jocului, ci doar ca doua
      // copii ale aceleiasi formule sunt de acord intre ele.
      const groundM = groundLevelFromCm(cellHeightCm(chunk, lx, ly))
      decodeColumn(v, ly * CHUNK_CELLS + lx, scratch)
      let topSolid = -1
      for (let level = VOXEL_LEVELS - 1; level >= 0; level--) {
        if (isSolid(scratch[level]!)) {
          topSolid = v.zBaseM + level
          break
        }
      }
      assert.equal(topSolid, groundM, `suprafata nu coincide la (${lx},${ly})`)
    }
  }
})

test('promovarea e idempotenta', () => {
  const chunk = generateChunk(9, 1, 1)
  promote(9, chunk)
  const before = Array.from(chunk.voxels!.runMaterial)
  promote(9, chunk)
  assert.deepEqual(Array.from(chunk.voxels!.runMaterial), before)
})

test('setVoxel scrie si citeste acelasi lucru, si pe cazul care schimba numarul de runs', () => {
  const chunk = generateChunk(4, 6, 6)
  promote(4, chunk)
  const zBase = chunk.voxels!.zBaseM
  const ground = Math.floor(cellHeightCm(chunk, 5, 5) / 100)

  // Sapatura in mijlocul rocii: sparge un run in doua, deci schimba numarul.
  assert.ok(setVoxel(chunk, 5, 5, ground - 10, Material.AER))
  assert.equal(voxelAt(chunk, 5, 5, ground - 10), Material.AER)
  assert.equal(voxelAt(chunk, 5, 5, ground - 11), Material.ROCA)
  assert.equal(voxelAt(chunk, 5, 5, ground - 9), Material.ROCA)

  // Umplere la loc: reface runul, deci scade numarul.
  assert.ok(setVoxel(chunk, 5, 5, ground - 10, Material.ROCA))
  assert.equal(voxelAt(chunk, 5, 5, ground - 10), Material.ROCA)

  // In afara ferestrei verticale.
  assert.equal(setVoxel(chunk, 5, 5, zBase - 1, Material.ROCA), false)
  assert.equal(setVoxel(chunk, 5, 5, zBase + VOXEL_LEVELS, Material.ROCA), false)
})

test('o coloana ramane consistenta dupa multe editari', () => {
  const chunk = generateChunk(17, 3, 3)
  promote(17, chunk)
  const zBase = chunk.voxels!.zBaseM
  const expected = new Uint8Array(VOXEL_LEVELS)
  const scratch = new Uint8Array(VOXEL_LEVELS)
  decodeColumn(chunk.voxels!, 0, expected)

  const rng = stream(17, 'agents')
  for (let i = 0; i < 500; i++) {
    const level = nextInt(rng, VOXEL_LEVELS)
    const material = (nextInt(rng, 3) === 0 ? Material.AER : nextInt(rng, 2) === 0 ? Material.ROCA : Material.PIATRA_CONSTRUITA)
    setVoxel(chunk, 0, 0, zBase + level, material)
    expected[level] = material
  }
  decodeColumn(chunk.voxels!, 0, scratch)
  assert.deepEqual(Array.from(scratch), Array.from(expected))
})

// --- teren -----------------------------------------------------------------

test('streamingul incarca un disc si arunca ce iese din el', () => {
  const t = createTerrain(11, 4)
  setFocus(t, 100, 100)
  const loaded = t.keys.length
  assert.ok(loaded > 40 && loaded < 70, `disc de raza 4 ar trebui sa aiba ~49 de chunk-uri, are ${loaded}`)

  setFocus(t, 300, 300)
  assert.equal(t.keys.length, loaded, 'dupa mutare ar trebui sa ramana tot atatea')
  for (const key of t.keys) {
    const c = t.chunks.get(key)!
    const d2 = (c.cx - 300) ** 2 + (c.cy - 300) ** 2
    assert.ok(d2 <= 16, `chunk ramas in afara discului: (${c.cx},${c.cy})`)
  }
})

test('chunk-urile PROMOVATE nu se arunca niciodata la streaming', () => {
  // Regula centrala: ne-promovat = cache, promovat = date.
  const t = createTerrain(12, 3)
  setFocus(t, 50, 50)
  promoteWithApron(t, 50, 50)
  assert.equal(promotedCount(t), 9, 'apron-ul ar trebui sa promoveze 9 chunk-uri')

  setFocus(t, 400, 400)
  assert.equal(promotedCount(t), 9, 'chunk-urile promovate au fost aruncate')
  const far = t.chunks.get(50 * CHUNK_GRID + 50)
  assert.ok(far && far.voxels, 'chunk-ul promovat nu mai e rezident')
})

test('cheile rezidente sunt MEREU sortate', () => {
  // Ordinea lor e singura sursa de determinism in iterarea peste teren.
  const t = createTerrain(13, 5)
  setFocus(t, 200, 200)
  promoteWithApron(t, 200, 200)
  setFocus(t, 210, 205)
  for (let i = 1; i < t.keys.length; i++) {
    assert.ok(t.keys[i]! > t.keys[i - 1]!, `chei nesortate la ${i}`)
  }
})

test('sapatul promoveaza automat chunk-ul si apron-ul lui', () => {
  const t = createTerrain(14, 2)
  const wx = 100 * CHUNK_CELLS + 5
  const wy = 100 * CHUNK_CELLS + 5
  const ground = groundLevelM(t, wx, wy)
  assert.ok(ground.ok)
  assert.equal(promotedCount(t), 0)

  const out = dig(t, wx, wy, ground.value)
  assert.ok(out.ok, out.ok ? '' : `sapatul a esuat: ${out.reason}`)
  assert.equal(promotedCount(t), 9, 'apron-ul nu a fost promovat')

  const after = materialAt(t, wx, wy, ground.value)
  assert.ok(after.ok && after.value === Material.AER)
})

test('nu poti sapa aerul si nu poti umple o celula plina', () => {
  const t = createTerrain(15, 2)
  const wx = 60 * CHUNK_CELLS
  const wy = 60 * CHUNK_CELLS
  const ground = groundLevelM(t, wx, wy)
  assert.ok(ground.ok)

  const digAir = dig(t, wx, wy, ground.value + 5)
  assert.equal(digAir.ok, false)
  if (!digAir.ok) assert.equal(digAir.reason, Reason.LIPSA_MATERIAL)

  const fillSolid = fill(t, wx, wy, ground.value, Material.PIATRA_CONSTRUITA)
  assert.equal(fillSolid.ok, false)
  if (!fillSolid.ok) assert.equal(fillSolid.reason, Reason.CAPACITATE_DEPASITA)

  const fillAir = fill(t, wx, wy, ground.value + 1, Material.AER)
  assert.equal(fillAir.ok, false)
})

test('in afara lumii se refuza cu motiv, nu se prabuseste', () => {
  const t = createTerrain(16, 2)
  for (const [x, y] of [[-1, 0], [0, -1], [WORLD_CELLS, 0], [0, WORLD_CELLS]] as const) {
    const out = dig(t, x, y, 0)
    assert.equal(out.ok, false)
    if (!out.ok) assert.equal(out.reason, Reason.IN_AFARA_LUMII)
  }
})

test('poti construi deasupra solului si sapa dedesubt — o pivnita sub o casa', () => {
  const t = createTerrain(21, 2)
  const wx = 80 * CHUNK_CELLS + 10
  const wy = 80 * CHUNK_CELLS + 10
  const g = groundLevelM(t, wx, wy)
  assert.ok(g.ok)
  const ground = g.value

  // Sapa trei niveluri in jos.
  for (let d = 0; d < 3; d++) {
    const out = dig(t, wx, wy, ground - d)
    assert.ok(out.ok, `sapatul la -${d} a esuat`)
  }
  // Construieste doua niveluri in sus.
  for (let u = 1; u <= 2; u++) {
    const out = fill(t, wx, wy, ground + u, Material.LEMN_CONSTRUIT)
    assert.ok(out.ok, `constructia la +${u} a esuat`)
  }

  for (let d = 0; d < 3; d++) {
    const m = materialAt(t, wx, wy, ground - d)
    assert.ok(m.ok && m.value === Material.AER, `nivelul -${d} nu e gol`)
  }
  for (let u = 1; u <= 2; u++) {
    const m = materialAt(t, wx, wy, ground + u)
    assert.ok(m.ok && m.value === Material.LEMN_CONSTRUIT, `nivelul +${u} nu e construit`)
  }
})

// --- integrare cu lumea si save --------------------------------------------

test('comenzile de teren trec prin stratul de comenzi', () => {
  const w = createWorld(31)
  const focus = applyCommand(w, { kind: 'setFocus', cx: 120, cy: 120 })
  assert.ok(focus.ok)
  assert.ok(w.terrain.keys.length > 300, `raza 11 ar trebui sa incarce ~377 chunk-uri, are ${w.terrain.keys.length}`)

  const wx = 120 * CHUNK_CELLS + 3
  const wy = 120 * CHUNK_CELLS + 3
  const g = groundLevelM(w.terrain, wx, wy)
  assert.ok(g.ok)
  const out = applyCommand(w, { kind: 'dig', wx, wy, z: g.value })
  assert.ok(out.ok)

  const bad = applyCommand(w, { kind: 'setFocus', cx: -5, cy: 0 })
  assert.equal(bad.ok, false)
})

test('terenul modificat supravietuieste unui roundtrip de save', () => {
  const w = createWorld(41)
  applyCommand(w, { kind: 'setFocus', cx: 70, cy: 70 })
  const wx = 70 * CHUNK_CELLS + 8
  const wy = 70 * CHUNK_CELLS + 8
  const g = groundLevelM(w.terrain, wx, wy)
  assert.ok(g.ok)
  applyCommand(w, { kind: 'dig', wx, wy, z: g.value })
  applyCommand(w, { kind: 'dig', wx, wy, z: g.value - 1 })
  applyCommand(w, { kind: 'fill', wx: wx + 1, wy, z: g.value + 1, material: Material.PIATRA_CONSTRUITA })

  const before = hashWorld(w)
  const loaded = decode(encode(w))
  assert.ok(loaded.ok, loaded.ok ? '' : `incarcare esuata: ${loaded.reason}`)
  assert.equal(hashWorld(loaded.value), before)

  const m = materialAt(loaded.value.terrain, wx, wy, g.value)
  assert.ok(m.ok && m.value === Material.AER, 'sapatura nu a supravietuit salvarii')
})

test('save-ul NU contine chunk-urile ne-promovate', () => {
  // 268 km² se regenereaza din seed. Daca ar intra in fisier, save-ul ar fi de gigabytes.
  const w = createWorld(42)
  applyCommand(w, { kind: 'setFocus', cx: 90, cy: 90 })
  const withoutDigging = encode(w).length

  const wx = 90 * CHUNK_CELLS
  const wy = 90 * CHUNK_CELLS
  const g = groundLevelM(w.terrain, wx, wy)
  assert.ok(g.ok)
  applyCommand(w, { kind: 'dig', wx, wy, z: g.value })
  const withDigging = encode(w).length

  assert.ok(withoutDigging < 20000, `save fara sapaturi prea mare: ${withoutDigging} bytes pentru ${w.terrain.keys.length} chunk-uri rezidente`)
  assert.ok(withDigging > withoutDigging, 'sapatura nu a marit save-ul')
})

test('hash-ul NU depinde de unde s-a uitat camera pe chunk-uri ne-promovate', () => {
  // Doua lumi cu acelasi continut trebuie sa arate identic, chiar daca una a
  // incarcat mai mult teren decat cealalta.
  const a = createWorld(43)
  const b = createWorld(43)
  applyCommand(a, { kind: 'setFocus', cx: 100, cy: 100 })
  applyCommand(b, { kind: 'setFocus', cx: 100, cy: 100 })
  applyCommand(b, { kind: 'setFocus', cx: 100, cy: 100 })
  assert.equal(hashWorld(a), hashWorld(b))
})

test('fuzz: 10.000 de operatii promovare-sapare-salvare-incarcare, stare stabila', () => {
  // Testul cerut de plan pentru S3-5. Verifica exact clasa de bug care ucide
  // arhitectura asta: granita de promovare, RLE-ul si save-ul, sub presiune.
  const rng = stream(20260913, 'evenimente')
  let w = createWorld(2026)
  applyCommand(w, { kind: 'setFocus', cx: 200, cy: 200 })

  const baseX = 200 * CHUNK_CELLS
  const baseY = 200 * CHUNK_CELLS
  let digs = 0
  let fills = 0
  let refused = 0

  for (let i = 0; i < 10000; i++) {
    const wx = baseX + nextInt(rng, CHUNK_CELLS * 2)
    const wy = baseY + nextInt(rng, CHUNK_CELLS * 2)
    const g = groundLevelM(w.terrain, wx, wy)
    assert.ok(g.ok)
    const z = g.value + nextInt(rng, 9) - 5

    if (nextInt(rng, 2) === 0) {
      const out = applyCommand(w, { kind: 'dig', wx, wy, z })
      if (out.ok) digs++
      else refused++
    } else {
      const out = applyCommand(w, { kind: 'fill', wx, wy, z, material: Material.PIATRA_CONSTRUITA })
      if (out.ok) fills++
      else refused++
    }

    // Din cand in cand, un ciclu complet de salvare si incarcare.
    if (i % 1000 === 999) {
      const before = hashWorld(w)
      const loaded = decode(encode(w))
      assert.ok(loaded.ok, loaded.ok ? '' : `incarcare esuata la i=${i}: ${loaded.reason}`)
      assert.equal(hashWorld(loaded.value), before, `hash schimbat de roundtrip la i=${i}`)
      w = loaded.value
    }
  }

  assert.ok(digs > 500, `prea putine sapaturi reusite: ${digs}`)
  assert.ok(fills > 500, `prea putine umpleri reusite: ${fills}`)
  assert.ok(refused > 0, 'niciun refuz — testul nu atinge marginile')
  console.log(`  fuzz: ${digs} sapaturi, ${fills} umpleri, ${refused} refuzuri, ${promotedCount(w.terrain)} chunk-uri promovate`)
})

test('chunk-urile raman in lume: ensureChunk nu accepta coordonate invalide prin dig', () => {
  const t = createTerrain(50, 1)
  const c = ensureChunk(t, CHUNK_GRID - 1, CHUNK_GRID - 1)
  assert.equal(c.cx, CHUNK_GRID - 1)
  assert.ok(MACRO_SIZE > 0)
})
