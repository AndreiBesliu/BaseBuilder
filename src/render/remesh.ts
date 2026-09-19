/**
 * Ce chunk-uri trebuie remeshate după o editare de teren.
 *
 * Stă aici, și nu în `viewer/main.ts`, din același motiv pentru care a ieșit și
 * generatorul lui S-DIG: era o funcție pură îngropată într-un modul de browser,
 * deci nu putea fi rulată de `npm test`. Consecința s-a văzut: cifrele de remesh
 * din `bench/GATE.md` — 1,24 remesh-uri pe săpătură, rafala de 9 — s-au măsurat
 * rescriind logica asta într-un script, adică pe o COPIE a ei. O copie e adevărată
 * până la prima divergență, și nimic n-ar fi semnalat divergența.
 *
 * ## Trei cazuri, și de ce sunt trei
 *
 * 1. **Chunk-ul editat.** Mereu.
 * 2. **Chunk-urile pe care editarea le-a PROMOVAT.** Promovarea vine cu apron de 1,
 *    deci o săpătură pe teren nepromovat poate cere primul mesh pentru până la 9
 *    chunk-uri deodată. Asta e ramura scumpă, și e singura care nu se vede dintr-o
 *    editare obișnuită.
 * 3. **Cusătura.** `meshChunk(chunk, vecini)` taie fețele acoperite de vecin, deci
 *    o editare pe marginea unui chunk schimbă ce vede vecinul. Numai laturile chiar
 *    atinse, nu toate patru: o celulă din mijloc n-are cusătură.
 *
 * ## Existența se cere peste tot
 *
 * Varianta din viewer o cerea la cazul 2 și NU la cazul 3, iar bucla de desenare o
 * recupera cu un `if (c)`. Randarea ieșea corectă, dar MULȚIMEA conținea chei
 * fantomă — iar mulțimea asta e cea numărată când se scrie „remesh-uri pe săpătură"
 * într-un document de gate. O măsurătoare făcută pe ea raporta muncă pe care nimeni
 * n-o făcea.
 */

import { CHUNK_CELLS } from '../sim/terrain/chunk.ts'
import { chunkKey } from '../sim/terrain/terrain.ts'

/**
 * Cheile chunk-urilor de remeshat după o editare la celula lumii `(wx, wy)`.
 *
 * `exista` și `eraPromovat` sunt funcții, nu structuri: modulul nu are voie să
 * cunoască nici `Terrain`, nici motorul, ca să poată fi probat headless — și ca
 * proba să folosească ACEASTA, nu o rescriere a ei.
 *
 * `out` se poate reutiliza între apeluri: se golește la intrare.
 */
export function chunkuriDeRefacut(
  wx: number,
  wy: number,
  exista: (key: number) => boolean,
  eraPromovat: (key: number) => boolean,
  out: Set<number> = new Set<number>(),
): Set<number> {
  out.clear()
  const cx = Math.floor(wx / CHUNK_CELLS)
  const cy = Math.floor(wy / CHUNK_CELLS)
  const lx = wx - cx * CHUNK_CELLS
  const ly = wy - cy * CHUNK_CELLS

  out.add(chunkKey(cx, cy))

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const key = chunkKey(cx + dx, cy + dy)
      if (exista(key) && !eraPromovat(key)) out.add(key)
    }
  }

  const cusatura = (kcx: number, kcy: number): void => {
    const key = chunkKey(kcx, kcy)
    if (exista(key)) out.add(key)
  }
  if (lx === 0) cusatura(cx - 1, cy)
  if (lx === CHUNK_CELLS - 1) cusatura(cx + 1, cy)
  if (ly === 0) cusatura(cx, cy - 1)
  if (ly === CHUNK_CELLS - 1) cusatura(cx, cy + 1)

  return out
}
