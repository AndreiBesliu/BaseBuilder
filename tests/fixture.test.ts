import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { buildM10, buildM10PeLume, makeM10, ROOM_DEPTH, ROOM_INNER, SETTLEMENT_CHUNKS } from '../src/harness/fixture-m10.ts'
import { createTerrain, groundLevelM, materialAt, promotedCount, setFocus } from '../src/sim/terrain/terrain.ts'
import { Material } from '../src/sim/terrain/chunk.ts'
import { hashWorld } from '../src/sim/hash.ts'
import { createWorld } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { esteIncapere, listaComponente } from '../src/sim/camere.ts'

// Fixtura de gate se valideaza pe proprietati STRUCTURALE, nu pe raportul de
// reducere al mesher-ului. Validarea prin raport e auto-referentiala: selecteaza
// fixturi ieftine de meshuit, adica exact fixturile pe care un motor slab le trece.

test('fixtura M10 promoveaza cat bugetul din plan, nu cat viewerul', () => {
  const { stats } = makeM10(20260913, 300, 300, 11)
  // PLAN §2 bugeteaza ~200 de chunk-uri de fortareata. Fortareata din viewer
  // promoveaza 12 — un gate rulat pe ea trece cu orice stiva.
  assert.ok(stats.promotedChunks >= 180, `doar ${stats.promotedChunks} chunk-uri promovate`)
  assert.ok(stats.promotedChunks <= 400, `${stats.promotedChunks} e peste orice asezare plauzibila`)
  assert.ok(stats.rooms > 500, `doar ${stats.rooms} camere`)
  assert.ok(stats.digsAccepted > 150000, `doar ${stats.digsAccepted} sapaturi`)
})

test('fixtura M10 e reproductibila bit cu bit', () => {
  // Daca asta pica, doua rulari de gate masoara doua lumi diferite si orice
  // comparatie intre ele citeste zgomot ca semnal.
  const a = createWorld(4242)
  setFocus(a.terrain, 300, 300)
  buildM10(a.terrain, 300, 300)

  const b = createWorld(4242)
  setFocus(b.terrain, 300, 300)
  buildM10(b.terrain, 300, 300)

  assert.equal(hashWorld(a), hashWorld(b))
})

test('camerele fixturii chiar sunt goale pe dinauntru', () => {
  // Fara asta, o regresie in `dig` ar produce o fixtura solida care meshuieste
  // instant, iar gate-ul ar trece pe o asezare care nu exista.
  const t = createTerrain(20260913, 11)
  setFocus(t, 300, 300)
  const stats = buildM10(t, 300, 300)
  assert.equal(promotedCount(t), stats.promotedChunks)

  const baseX = 300 * 32
  const baseY = 300 * 32
  const margin = 3 // (ROOM_PITCH - ROOM_INNER) / 2, adica offsetul primei camere

  let hollow = 0
  let probed = 0
  for (let room = 0; room < 8; room++) {
    const rx = baseX + margin + room * 16 + (ROOM_INNER >> 1)
    const ry = baseY + margin + room * 16 + (ROOM_INNER >> 1)
    const g = groundLevelM(t, rx, ry)
    if (!g.ok) continue
    for (let d = 1; d <= ROOM_DEPTH; d++) {
      const m = materialAt(t, rx, ry, g.value - d)
      if (!m.ok) continue
      probed++
      if (m.value === Material.AER) hollow++
    }
  }
  assert.ok(probed > 0, 'nicio camera sondata')
  assert.equal(hollow, probed, `${probed - hollow} din ${probed} celule de camera nu sunt goale`)
})

test('asezarea incape in lume', () => {
  const span = SETTLEMENT_CHUNKS * 32
  assert.ok(300 * 32 + span < 512 * 32, 'fixtura iese din lume la coltul ales')
})

test('fixtura contine si constructie deasupra solului, nu doar sapaturi', () => {
  const { stats } = makeM10(20260913, 300, 300, 11)
  assert.ok(stats.fillsAccepted > 1000, `doar ${stats.fillsAccepted} zidiri`)
})

test('M10 pe o LUME (gate-ul viewer-ului, IDX-5): dupa zidirea directa, indexul incaperilor e la zi, iar prima sapatura prin comanda nu reconstruieste fixtura', () => {
  // Recenzia incaperilor, IDX-5: `buildM10` scrie direct in teren. Pe lumea gate-ului, fara punctul de
  // sincronizare de dupa ea, `vazute` ramanea 0 fata de 218.230 de editari, overlay-ul I vedea 0
  // incaperi, iar prima sapatura din S-DIG platea recalculul intregii fixturi (~420 ms).
  const w = createWorld(20260913)
  assert.ok(applyCommand(w, { kind: 'setFocus', cx: 300, cy: 300 }).ok)
  buildM10PeLume(w, 300, 300)
  assert.ok(w.terrain.editari > 150000, `fixtura: doar ${w.terrain.editari} editari`)
  assert.equal(w.camere.vazute, w.terrain.editari, 'invariantul indexului, dupa zidirea directa')
  const incaperi = listaComponente(w.camere).filter(esteIncapere).length
  assert.ok(incaperi > 600, `overlay-ul I ar vedea ${incaperi} incaperi (masurat: 677)`)
  const r0 = w.camere.stat.recalculari
  // Peretele dintre primele doua camere, la un metru sub sol: o sapatura ca ale gate-ului.
  const x = 300 * 32 + 15, y = 300 * 32 + 7
  const g = groundLevelM(w.terrain, x, y)
  assert.ok(g.ok)
  assert.ok(applyCommand(w, { kind: 'dig', wx: x, wy: y, z: g.value - 1 }).ok)
  assert.equal(w.camere.vazute, w.terrain.editari)
  assert.equal(w.camere.stat.recalculari, r0, 'prima sapatura a reconstruit toata fixtura')
})

test('nimeni in afara fixturii nu zideste M10 direct: viewer-ul si harnasamentele trec prin buildM10PeLume sau makeM10 (IDX-5)', () => {
  // Plasa pe SURSA, complementul testului de mai sus: el probeaza functia, asta — ca viewer-ul o
  // cheama. `buildM10` pe terenul unei lumi lasa indexul incaperilor in urma (a treia cale de editare).
  const radacina = new URL('../', import.meta.url)
  const gasite: string[] = []
  const umbla = (dir: URL, rel: string): void => {
    for (const nume of readdirSync(dir).sort()) {
      // tools/mutatii/ tine tiparele probelor ca DATE (proba IDX-5 scrie exact apelul interzis). `__*` sunt
      // probele temporare ale testului de disciplina, create si sterse in src/sim chiar in timp ce umblam:
      // o rulare din sase dadea ENOENT (cursa intre fisierele de test, gasita de recenzia t.2a).
      if (nume === 'node_modules' || nume.startsWith('.') || nume.startsWith('__') || `${rel}${nume}` === 'tools/mutatii') continue
      const u = new URL(nume, dir)
      if (statSync(u).isDirectory()) { umbla(new URL(nume + '/', dir), `${rel}${nume}/`); continue }
      if (!/\.(ts|mjs|js)$/.test(nume) || `${rel}${nume}` === 'src/harness/fixture-m10.ts') continue
      if (/\bbuildM10\(/.test(readFileSync(u, 'utf8'))) gasite.push(`${rel}${nume}`)
    }
  }
  for (const d of ['src', 'viewer', 'bench', 'tools']) umbla(new URL(d + '/', radacina), `${d}/`)
  assert.deepEqual(gasite, [])
  assert.match(readFileSync(new URL('viewer/main.ts', radacina), 'utf8'), /\bbuildM10PeLume\(world, /, 'gate-ul viewer-ului zideste M10 pe lume')
})
