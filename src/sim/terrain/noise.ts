/**
 * Zgomot determinist, in aritmetica INTREAGA.
 *
 * De ce intregi si nu float: lumea e o functie pura de (pozitie, seed), iar save-ul
 * retine doar diferentele fata de acea functie. Daca functia da alt rezultat pe alta
 * masina — si float-ul poate face exact asta, fiindca `Math` nu e garantat
 * bit-identic intre motoare — atunci un save mutat pe alt calculator se aplica peste
 * un teren diferit si totul se dezaliniaza tacut. Cu intregi, functia e aceeasi
 * oriunde.
 *
 * Nu consuma din fluxurile de RNG: e o functie PURA de coordonate. Doua chunkuri
 * generate in orice ordine dau acelasi rezultat, ceea ce e conditia ca streamingul
 * sa fie corect.
 */

/** Unitatea de virgula fixa. 1024 = 1,0. */
export const FP_ONE = 1024
export const FP_SHIFT = 10

/** Hash pe doua coordonate + seed. Imprastie bine si e stabil intre runtime-uri. */
export function hash2(x: number, y: number, seed: number): number {
  let h = (seed ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d) >>> 0
  h = (h ^ (h >>> 15)) >>> 0
  h = Math.imul(h ^ (y | 0), 0x165667b1) >>> 0
  h = (h ^ (h >>> 13)) >>> 0
  h = Math.imul(h, 0x9e3779b1) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/** Valoarea din nodul de grila, in [-FP_ONE, FP_ONE). */
function nodeValue(x: number, y: number, seed: number): number {
  return (hash2(x, y, seed) & 0x7ff) - FP_ONE
}

/**
 * Netezire cubica, in virgula fixa: 3t² − 2t³, cu t in [0, FP_ONE].
 * Fara ea, zgomotul valoric arata a romburi.
 */
function smooth(t: number): number {
  // t*t incape in 2^20; inmultit cu (3*FP - 2*t) <= 3*FP incape in ~2^31. Marginea e stransa,
  // deci pastram ordinea operatiilor exact asa.
  const tt = (t * t) >> FP_SHIFT
  const ttt = (tt * t) >> FP_SHIFT
  return 3 * tt - 2 * ttt
}

function lerp(a: number, b: number, t: number): number {
  return a + (((b - a) * t) >> FP_SHIFT)
}

/**
 * Zgomot valoric bilinear. `px`, `py` sunt in unitati de virgula fixa,
 * unde FP_ONE = un pas de grila. Intoarce [-FP_ONE, FP_ONE).
 */
export function valueNoise(px: number, py: number, seed: number): number {
  const ix = px >> FP_SHIFT
  const iy = py >> FP_SHIFT
  const fx = smooth(px & (FP_ONE - 1))
  const fy = smooth(py & (FP_ONE - 1))

  const v00 = nodeValue(ix, iy, seed)
  const v10 = nodeValue(ix + 1, iy, seed)
  const v01 = nodeValue(ix, iy + 1, seed)
  const v11 = nodeValue(ix + 1, iy + 1, seed)

  return lerp(lerp(v00, v10, fx), lerp(v01, v11, fx), fy)
}

/**
 * Zgomot fractal: octave cu frecventa dubla si amplitudine injumatatita.
 * Rezultatul e normalizat inapoi in [-FP_ONE, FP_ONE) prin suma amplitudinilor.
 */
export function fbm(px: number, py: number, seed: number, octaves: number): number {
  let sum = 0
  let amplitude = FP_ONE
  let totalAmplitude = 0
  let x = px
  let y = py

  for (let o = 0; o < octaves; o++) {
    // Fiecare octava are propriul seed derivat, ca sa nu se repete acelasi tipar.
    sum += (valueNoise(x, y, (seed + o * 0x9e37) >>> 0) * amplitude) >> FP_SHIFT
    totalAmplitude += amplitude
    amplitude >>= 1
    if (amplitude === 0) break
    x <<= 1
    y <<= 1
  }

  if (totalAmplitude === 0) return 0
  return Math.trunc((sum * FP_ONE) / totalAmplitude)
}
