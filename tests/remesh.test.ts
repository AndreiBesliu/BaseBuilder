/**
 * `chunkuriDeRefacut` — ce se remeshează după o editare de teren.
 *
 * A stat până pe 19.09.2026 ca funcție anonimă în `viewer/main.ts`, deci n-avea cum
 * să fie rulată de `npm test`. Consecința s-a văzut în altă parte: cifrele de remesh
 * din `bench/GATE.md` s-au măsurat rescriind logica asta într-un script — adică pe o
 * COPIE. O copie e adevărată până la prima divergență, și nimic n-ar fi semnalat-o.
 *
 * Testele de aici folosesc funcția REALĂ. `exista` și `eraPromovat` sunt funcții, deci
 * fixtura e o mulțime de chei, nu o lume — cazurile se construiesc direct, inclusiv
 * cele pe care o rulare normală nu le atinge.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { CHUNK_CELLS } from '../src/sim/terrain/chunk.ts'
import { chunkKey } from '../src/sim/terrain/terrain.ts'
import { chunkuriDeRefacut } from '../src/render/remesh.ts'

const CX = 40
const CY = 60
/** Celula (lx, ly) din chunk-ul (CX, CY), în coordonate de lume. */
const cel = (lx: number, ly: number): [number, number] => [CX * CHUNK_CELLS + lx, CY * CHUNK_CELLS + ly]

/** Toate cele 9 chei din jurul chunk-ului editat. */
function vecinatatea(): Set<number> {
  const s = new Set<number>()
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s.add(chunkKey(CX + dx, CY + dy))
  return s
}

const TOATE = vecinatatea()
const existaToate = (k: number): boolean => TOATE.has(k)
const promovateToate = (k: number): boolean => TOATE.has(k)

test('o editare in MIJLOCUL unui chunk cere un singur remesh', () => {
  // Cazul obisnuit, si cel care decide costul amortizat din GATE.md: nici cusatura,
  // nici promovare.
  const [wx, wy] = cel(10, 10)
  const out = chunkuriDeRefacut(wx, wy, existaToate, promovateToate)
  assert.deepEqual([...out], [chunkKey(CX, CY)])
})

test('o editare pe o LATURA cere si vecinul de pe latura aia, si numai pe el', () => {
  // `meshChunk(chunk, vecini)` taie fetele acoperite de vecin, deci o editare pe
  // margine schimba ce vede vecinul. Numai laturile chiar atinse: o celula de pe
  // muchia de x=0 nu schimba nimic pentru vecinul de pe y.
  const cazuri: Array<[string, [number, number], number]> = [
    ['x = 0', cel(0, 10), chunkKey(CX - 1, CY)],
    [`x = ${CHUNK_CELLS - 1}`, cel(CHUNK_CELLS - 1, 10), chunkKey(CX + 1, CY)],
    ['y = 0', cel(10, 0), chunkKey(CX, CY - 1)],
    [`y = ${CHUNK_CELLS - 1}`, cel(10, CHUNK_CELLS - 1), chunkKey(CX, CY + 1)],
  ]
  for (const [nume, [wx, wy], vecin] of cazuri) {
    const out = chunkuriDeRefacut(wx, wy, existaToate, promovateToate)
    assert.deepEqual(
      [...out].sort((a, b) => a - b),
      [chunkKey(CX, CY), vecin].sort((a, b) => a - b),
      `latura ${nume}: ${[...out].join(',')}`,
    )
  }
})

test('o editare in COLT cere ambii vecini de latura, dar nu si diagonala', () => {
  // Diagonala nu intra: `meshChunk` taie fete pe cele patru laturi, iar coltul e
  // acoperit de apronul de AO, care se citeste, nu se emite.
  const [wx, wy] = cel(0, 0)
  const out = chunkuriDeRefacut(wx, wy, existaToate, promovateToate)
  assert.deepEqual(
    [...out].sort((a, b) => a - b),
    [chunkKey(CX, CY), chunkKey(CX - 1, CY), chunkKey(CX, CY - 1)].sort((a, b) => a - b),
  )
})

test('o editare care PROMOVEAZA cere toate cele 9, si asta e ramura scumpa', () => {
  // Promovarea vine cu apron de 1 chunk, deci pana la 9 isi cer primul mesh deodata.
  // Masurat pe o rulare de S-DIG: se intampla de 4 ori in 60 de secunde, iar restul
  // sapaturilor cer 1 sau 2. Diferenta dintre cele doua ramuri e tot ce face cifra
  // „remesh-uri pe sapatura" sa nu fie 1.
  const [wx, wy] = cel(10, 10)
  const niciunul = (): boolean => false
  const out = chunkuriDeRefacut(wx, wy, existaToate, niciunul)
  assert.equal(out.size, 9, `${out.size} chunk-uri, asteptat 9`)
  for (const k of TOATE) assert.ok(out.has(k), `lipseste cheia ${k}`)
})

test('un vecin DEJA promovat nu se remesheaza degeaba', () => {
  // Partea cealalta a aceleiasi ramuri: daca editarea n-a promovat nimic nou, cei
  // opt vecini nu au de ce sa fie refacuti. Fara conditia asta, fiecare sapatura ar
  // costa noua remesh-uri in loc de unu.
  const [wx, wy] = cel(10, 10)
  const doarUnulNou = chunkKey(CX + 1, CY + 1)
  const out = chunkuriDeRefacut(wx, wy, existaToate, (k) => k !== doarUnulNou)
  assert.deepEqual(
    [...out].sort((a, b) => a - b),
    [chunkKey(CX, CY), doarUnulNou].sort((a, b) => a - b),
  )
})

test('cusatura nu cere un vecin care NU EXISTA', () => {
  // Varianta din viewer cerea existenta la ramura de promovare si NU la cusatura,
  // iar bucla de desenare recupera cu un `if (c)`. Randarea iesea corecta, dar
  // multimea continea chei fantoma — si tocmai multimea asta e cea NUMARATA cand se
  // scrie „remesh-uri pe sapatura" intr-un document de gate.
  //
  // Masurat pe rularea de S-DIG: zero chei fantoma, fiindca acolo orice vecin al
  // unui chunk sapat exista. Deci garda e defensiva, nu o reparatie — si de-aia are
  // nevoie de testul asta, care ATINGE cazul in loc sa-l astepte.
  const [wx, wy] = cel(0, 10)
  const faraVecinulDinStanga = (k: number): boolean => TOATE.has(k) && k !== chunkKey(CX - 1, CY)
  const out = chunkuriDeRefacut(wx, wy, faraVecinulDinStanga, promovateToate)
  assert.deepEqual([...out], [chunkKey(CX, CY)], 'a cerut remesh pentru un chunk care nu exista')
})

test('multimea data se GOLESTE la intrare, deci se poate reutiliza intre editari', () => {
  // Viewerul o reutilizeaza ca sa nu aloce la fiecare editare. Daca n-ar fi golita,
  // a doua editare ar remesha si chunk-urile primei — o scurgere care creste, si care
  // n-ar produce nicio eroare, doar cifre.
  const reutilizata = new Set<number>()
  const [wx1, wy1] = cel(0, 0)
  chunkuriDeRefacut(wx1, wy1, existaToate, promovateToate, reutilizata)
  assert.equal(reutilizata.size, 3)
  const [wx2, wy2] = cel(10, 10)
  const out = chunkuriDeRefacut(wx2, wy2, existaToate, promovateToate, reutilizata)
  assert.equal(out, reutilizata, 'nu a intors chiar multimea data')
  assert.deepEqual([...reutilizata], [chunkKey(CX, CY)], 'a pastrat chei de la editarea dinainte')
})
