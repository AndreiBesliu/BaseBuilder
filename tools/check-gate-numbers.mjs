/**
 * Verifica faptul ca cifrele scrise in bench/GATE.md sunt inca adevarate.
 *
 * Exista pentru ca protocolul a derapat, si a derapat exact in felul impotriva
 * caruia fusese scris. Un panou care a citit documentul a gasit, in aceeasi zi:
 *
 *   - §3 spunea 105 ms si §5/§9 spuneau 84,5 ms pentru ACEEASI masuratoare,
 *     adica o diferenta de 20,5 ms, PESTE diferenta minima detectabila;
 *   - §3 spunea 2,64 MB unde masuratoarea da 2,34 MB;
 *   - §10(a) — bugetul de streaming — era listat drept optimizare DISPONIBILA,
 *     desi fusese deja implementat. Iar §8.4 acorda fereastra GREY tocmai daca
 *     lista aia acopera golul. Adica documentul putea cumpara o amanare
 *     NEMERITATA, pe baza unei economii deja cheltuite.
 *
 * Ultima e cea grava: nu o cifra invechita, ci un mecanism de auto-indulgenta.
 * De aia verificarea asta ruleaza in `npm run check` si in CI, ca documentul sa
 * nu poata ramane in urma codului fara ca cineva sa afle.
 *
 *   node tools/check-gate-numbers.mjs
 */

import { readFileSync } from 'node:fs'
import { meshChunk } from '../src/render/mesher.ts'
import { runCount } from '../src/sim/terrain/chunk.ts'
import { makeM10 } from '../src/harness/fixture-m10.ts'
import { repeat } from '../src/harness/measure.ts'

const doc = readFileSync('bench/GATE.md', 'utf8')
const { terrain, stats } = makeM10(20260913, 300, 300, 11)
const at = (cx, cy) => terrain.chunks.get(cy * 512 + cx) ?? null
const promovate = [...terrain.keys].map((k) => terrain.chunks.get(k)).filter((c) => c.voxels)

function meshAll() {
  let quads = 0
  for (const c of promovate) {
    quads += meshChunk(c, {
      xNeg: at(c.cx - 1, c.cy),
      xPos: at(c.cx + 1, c.cy),
      yNeg: at(c.cx, c.cy - 1),
      yPos: at(c.cx, c.cy + 1),
    }).quadCount
  }
  return quads
}

const quads = meshAll()
let bytes = 0
for (const key of terrain.keys) {
  const v = terrain.chunks.get(key).voxels
  if (!v) continue
  bytes += runCount(v) * 2 + v.columnStart.length * 4
}
const mb = bytes / 1024 / 1024
const timp = repeat(() => {
  const t = performance.now()
  meshAll()
  return performance.now() - t
})

const esecuri = []

/** O cifra EXACTA: quaduri, triunghiuri, chunk-uri. Nu are voie sa difere deloc. */
function exact(nume, valoare, tipar) {
  const gasite = [...doc.matchAll(tipar)].map((m) => Number(m[1].replace(/\./g, '')))
  if (gasite.length === 0) {
    esecuri.push(`${nume}: nu apare deloc in GATE.md (tipar ${tipar})`)
    return
  }
  const gresite = gasite.filter((g) => g !== valoare)
  if (gresite.length > 0) esecuri.push(`${nume}: GATE.md spune ${gresite.join(', ')}, masurat ${valoare}`)
}

/** O cifra de TIMP: se accepta o abatere, dar toate aparitiile trebuie sa fie de acord intre ele. */
function coerent(nume, tipar) {
  // Tiparul are doua alternative, deci una din grupe e mereu nedefinita.
  const gasite = [...doc.matchAll(tipar)].map((m) => Number((m[1] ?? m[2]).replace(',', '.')))
  if (gasite.length < 2) return
  const min = Math.min(...gasite)
  const max = Math.max(...gasite)
  if (max - min > timp.dmd) {
    esecuri.push(
      `${nume}: GATE.md contine ${gasite.join(' si ')} pentru aceeasi masuratoare — ` +
        `diferenta ${(max - min).toFixed(1)} ms e PESTE diferenta minima detectabila (${timp.dmd.toFixed(1)} ms)`,
    )
  }
}

exact('chunk-uri promovate', stats.promotedChunks, /\*\*(\d[\d.]*)\*\* \(PLAN bugeta/g)
exact('quaduri', quads, /\| Quaduri \/ triunghiuri \| ([\d.]+) \//g)
exact('triunghiuri', quads * 2, /\| Quaduri \/ triunghiuri \| [\d.]+ \/ \*\*([\d.]+)\*\*/g)
coerent('meshing complet', /remesh-ul complet al fixturii e\s*\*\*([\d,]+) ms\*\*|Meshing complet \| \*\*([\d,]+) ms\*\*/g)

// Memoria, cu toleranta: e o cifra rotunjita in text.
const memMatch = doc.match(/Memorie voxeli \(RLE\) \| ([\d,]+) MB/)
if (memMatch) {
  const scris = Number(memMatch[1].replace(',', '.'))
  if (Math.abs(scris - mb) > 0.05) esecuri.push(`memorie RLE: GATE.md spune ${scris} MB, masurat ${mb.toFixed(2)} MB`)
}

// Cea mai importanta verificare: o optimizare deja cheltuita nu are voie sa mai
// figureze ca disponibila, fiindca §8.4 acorda fereastra GREY pe baza listei.
const sectiunea = doc.slice(doc.indexOf('## 10.'))
const disponibile = sectiunea.slice(0, sectiunea.indexOf('**Deja cheltuite'))
const CHELTUITE = [
  { nume: 'buget de streaming pe cadru', tipar: /Buget de streaming/i, dovada: 'BUILD_BUDGET_PER_FRAME in viewer/main.ts' },
  { nume: 'normale analitice de heightfield', tipar: /computeVertexNormals/i, dovada: 'src/render/heightfield.ts' },
  { nume: 'indici de heightfield partajati', tipar: /indici.*partajat|buffer partajat.*indici/i, dovada: 'SHARED_INDICES in src/render/heightfield.ts' },
]
for (const c of CHELTUITE) {
  if (c.tipar.test(disponibile)) {
    esecuri.push(`§10: „${c.nume}" e listata ca DISPONIBILA, dar e implementata (${c.dovada}) — poate cumpara o fereastra GREY nemeritata`)
  }
}

console.log(`fixtura M10: ${stats.promotedChunks} chunk-uri · ${quads.toLocaleString('ro-RO')} quaduri · ${mb.toFixed(2)} MB · meshing ${timp.median.toFixed(1)} ms (±${timp.dmd.toFixed(1)})`)
if (esecuri.length === 0) {
  console.log('bench/GATE.md: cifrele corespund codului.')
} else {
  console.error('')
  for (const e of esecuri) console.error(`  ✖ ${e}`)
  console.error('')
  console.error('GATE.md a ramas in urma codului. Fiecare corectie se face intr-un commit')
  console.error('SEPARAT, cu motivul scris — vezi antetul protocolului.')
  process.exit(1)
}
