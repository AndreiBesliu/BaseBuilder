/**
 * Cat costa limita cunoscuta a mesher-ului.
 *
 *   node tools/border-faces.mjs
 *
 * Mesher-ul emite MEREU fetele de la marginea chunk-ului, fiindca nu consulta
 * vecinul — deci presupune ca dincolo de granita e aer. Intrebarea nu e daca e o
 * risipa, ci CAT, pe geometrie reala de asezare.
 *
 * Se numara pe CELULE, nu pe quaduri. Un quad unit lacom acopera un dreptunghi
 * intreg si ar fi „complet ascuns" doar daca toate celulele din spate sunt
 * solide — o masura mult prea optimista. Consultarea vecinului ar taia fetele
 * DINAINTE de unire, deci unitatea corecta e fata de celula.
 */

import { CHUNK_CELLS, isSolid, VOXEL_LEVELS, voxelAt } from '../src/sim/terrain/chunk.ts'
import { meshChunk } from '../src/render/mesher.ts'
import { makeM10 } from '../src/harness/fixture-m10.ts'

const { terrain } = makeM10(20260913, 300, 300, 11)

let feteDeGranita = 0
let feteAscunse = 0
let chunkuriCuVecinPromovat = 0
let quaduriTotale = 0

for (const key of terrain.keys) {
  const c = terrain.chunks.get(key)
  if (!c.voxels) continue
  quaduriTotale += meshChunk(c).quadCount

  const zBase = c.voxels.zBaseM
  const laturi = [
    { dx: -1, dy: 0, lx: 0, nx: CHUNK_CELLS - 1 },
    { dx: 1, dy: 0, lx: CHUNK_CELLS - 1, nx: 0 },
    { dx: 0, dy: -1, ly: 0, ny: CHUNK_CELLS - 1 },
    { dx: 0, dy: 1, ly: CHUNK_CELLS - 1, ny: 0 },
  ]

  for (const l of laturi) {
    const vecin = terrain.chunks.get((c.cy + l.dy) * 512 + (c.cx + l.dx))
    const vecinPromovat = Boolean(vecin && vecin.voxels)
    if (vecinPromovat) chunkuriCuVecinPromovat++

    for (let i = 0; i < CHUNK_CELLS; i++) {
      for (let z = zBase; z < zBase + VOXEL_LEVELS; z++) {
        const lx = l.dx !== 0 ? l.lx : i
        const ly = l.dy !== 0 ? l.ly : i
        if (!isSolid(voxelAt(c, lx, ly, z))) continue
        // Fata catre exteriorul chunk-ului: azi se emite MEREU.
        feteDeGranita++
        if (!vecinPromovat) continue
        const nx = l.dx !== 0 ? l.nx : i
        const ny = l.dy !== 0 ? l.ny : i
        if (isSolid(voxelAt(vecin, nx, ny, z))) feteAscunse++
      }
    }
  }
}

console.log(`quaduri totale (dupa unire)            ${quaduriTotale.toLocaleString('ro-RO')}`)
console.log(`fete emise pe granite de chunk         ${feteDeGranita.toLocaleString('ro-RO')}`)
console.log(`  din care ASCUNSE de vecin            ${feteAscunse.toLocaleString('ro-RO')}  (${((feteAscunse / feteDeGranita) * 100).toFixed(1)}% din cele de granita)`)
console.log(`laturi cu vecin promovat               ${chunkuriCuVecinPromovat}`)
