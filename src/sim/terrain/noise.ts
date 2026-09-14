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

/**
 * Unitatea de virgula fixa. 16384 = 1,0.
 *
 * A fost 1024 (Q10) si asta punea un PLAFON pe rezolutia verticala a lumii:
 * amplitudinea de 1800 dm impartita la 1024 de trepte = **17,6 cm** pe treapta.
 * Cu esantioane macro din 16 in 16 m, doua vecine ieseau des pe aceeasi treapta,
 * deci terenul era o scara de terase plate de 16 m — vizibil ca benzi de contur.
 *
 * Nu se vedea, fiindca `meshHeightfield` punea in coltul retelei media celor
 * patru varfuri din jur, adica un blur 2×2 care netezea exact artefactul asta.
 * Doua defecte care se anulau reciproc: reparat unul, a iesit celalalt la iveala.
 *
 * La Q14 treapta devine 1800/16384 = **1,1 cm**, de 16 ori mai fina.
 *
 * Marginile de overflow, verificate pe rand, fiindca aici nu e loc de aproximari:
 *   smooth: t ≤ 2^14 ⇒ t*t ≤ 2,7e8 < 2^31 ✓
 *   lerp:   |b-a| ≤ 2^15, × t ≤ 2^14 ⇒ 5,4e8 < 2^31 ✓
 *   fbm:    sum ≤ ~2^15, × FP_ONE ⇒ 5,4e8 < 2^31 ✓
 */
export const FP_ONE = 16384
export const FP_SHIFT = 14

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

/** Valoarea din nodul de grila, in [-FP_ONE, FP_ONE). Masca are 2×FP_ONE valori. */
function nodeValue(x: number, y: number, seed: number): number {
  return (hash2(x, y, seed) & (2 * FP_ONE - 1)) - FP_ONE
}

/**
 * Netezire cubica, in virgula fixa: 3t² − 2t³, cu t in [0, FP_ONE].
 * Fara ea, zgomotul valoric arata a romburi.
 */
function smooth(t: number): number {
  // Marginile sunt verificate in comentariul lui FP_ONE. Ordinea operatiilor
  // conteaza: `(t*t) >> FP_SHIFT` inainte de a inmulti din nou.
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
