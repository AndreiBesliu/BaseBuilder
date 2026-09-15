/**
 * Infasurarea unui quad, dedusa din geometrie.
 *
 * Mesher-ul emite patru colturi si o directie de fata. Cine construieste
 * geometria trebuie sa aleaga ordinea indicilor astfel incat normala triunghiului
 * sa arate in AFARA — altfel fata e dorsala, culling-ul o elimina si se vede
 * prin geometrie.
 *
 * Prima regula era o constanta: „directiile pozitive se inverseaza, cele negative
 * raman", dedusa analitic pentru fata de SUS si aplicata tuturor. Pentru
 * majoritatea quadurilor era corecta. Pentru restul, nu — iar rezultatul se vedea
 * ca petele intunecate imprastiate pe fortareata, prin care se zarea fundalul.
 * Le crezusem variatie de material, pana cand fundalul magenta a trecut prin ele.
 *
 * Regula de aici nu presupune nimic despre ordinea in care mesher-ul emite
 * colturile: ia produsul vectorial al primului triunghi si il compara cu normala
 * AXIALA, care se stie exact din directia fetei. Costa doua scaderi si un produs
 * vectorial per quad, o singura data la construirea geometriei, si e corecta prin
 * constructie oricat s-ar schimba mesher-ul.
 */

import { Face } from './mesher.ts'
import type { ChunkMesh } from './mesher.ts'

/**
 * Trebuie inversata ordinea indicilor pentru quadul `q`?
 *
 * Lucreaza in spatiul lui three, unde Y si Z sunt schimbate fata de mesher
 * (mesher: Z in sus; three: Y in sus). Schimbarea aia OGLINDESTE spatiul, deci
 * infasurarea nu se poate citi din coordonatele mesher-ului fara s-o iei in
 * calcul — motiv in plus sa n-o presupui.
 */
export function quadFlipped(mesh: ChunkMesh, q: number): boolean {
  const b = q * 12
  const p = mesh.positions
  // A, B, C in spatiul lui three: (x, z, y) din spatiul mesher-ului.
  const ax = p[b]!, ay = p[b + 2]!, az = p[b + 1]!
  const ux = p[b + 3]! - ax, uy = p[b + 5]! - ay, uz = p[b + 4]! - az
  const vx = p[b + 6]! - ax, vy = p[b + 8]! - ay, vz = p[b + 7]! - az

  const cx = uy * vz - uz * vy
  const cy = uz * vx - ux * vz
  const cz = ux * vy - uy * vx

  const face = mesh.faces[q]!
  const ex = face === Face.X_POS ? 1 : face === Face.X_NEG ? -1 : 0
  const ey = face === Face.Z_POS ? 1 : face === Face.Z_NEG ? -1 : 0
  const ez = face === Face.Y_POS ? 1 : face === Face.Y_NEG ? -1 : 0

  return cx * ex + cy * ey + cz * ez < 0
}

/** Cei sase indici ai quadului `q`, cu primul varf la `o`, scrisi in `out` la `i`. */
export function writeQuadIndices(mesh: ChunkMesh, q: number, o: number, out: Uint32Array, i: number): void {
  if (quadFlipped(mesh, q)) {
    out[i] = o; out[i + 1] = o + 2; out[i + 2] = o + 1
    out[i + 3] = o; out[i + 4] = o + 3; out[i + 5] = o + 2
  } else {
    out[i] = o; out[i + 1] = o + 1; out[i + 2] = o + 2
    out[i + 3] = o; out[i + 4] = o + 2; out[i + 5] = o + 3
  }
}
