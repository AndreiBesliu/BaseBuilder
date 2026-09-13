/**
 * Generator determinist de numere aleatoare, cu fluxuri NUMITE.
 *
 * De ce fluxuri numite si nu un singur RNG global: daca toata simularea consuma
 * dintr-un singur flux, adaugarea unei singure trageri intr-un sistem (sa zicem
 * vremea) muta toate tragerile din alt sistem (sa zicem raidul), iar un replay
 * salvat inainte de schimbare nu se mai reproduce. Cu fluxuri numite, fiecare
 * sistem isi are cursorul lui si sistemele nu se contamineaza reciproc.
 *
 * Algoritm: xoshiro128** (Blackman & Vigna). 32 de biti peste tot, ca sa fie
 * bit-identic in orice runtime JS — fara float, fara BigInt.
 */

/** Starea unui flux. Serializabila ca atare in save. */
export interface RngState {
  s0: number
  s1: number
  s2: number
  s3: number
  /** Cate numere s-au tras din flux. Nu intra in algoritm — e pentru diagnostic si invarianti. */
  draws: number
}

const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0

/** FNV-1a pe 32 de biti. Folosit ca sa derivam un seed din numele fluxului. */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** splitmix32 — imprastie un seed de 32 de biti in cele patru cuvinte de stare. */
function splitmix32(seed: number): () => number {
  let a = seed | 0
  return () => {
    a = (a + 0x9e3779b9) | 0
    let t = a ^ (a >>> 16)
    t = Math.imul(t, 0x21f0aaad)
    t ^= t >>> 15
    t = Math.imul(t, 0x735a2d97)
    t ^= t >>> 15
    return t >>> 0
  }
}

/**
 * Creeaza un flux pornind de la seed-ul lumii si de la un nume.
 * `stream(seed, 'combat')` si `stream(seed, 'vreme')` sunt independente si reproductibile.
 */
export function stream(worldSeed: number, name: string): RngState {
  const next = splitmix32((worldSeed ^ fnv1a32(name)) >>> 0)
  const st: RngState = { s0: next(), s1: next(), s2: next(), s3: next(), draws: 0 }
  // xoshiro nu are voie sa porneasca din starea complet nula.
  if ((st.s0 | st.s1 | st.s2 | st.s3) === 0) st.s0 = 0x9e3779b9
  return st
}

/** Urmatorul intreg fara semn pe 32 de biti. Muta starea. */
export function nextU32(st: RngState): number {
  const result = Math.imul(rotl(Math.imul(st.s1, 5) >>> 0, 7), 9) >>> 0
  const t = (st.s1 << 9) >>> 0
  st.s2 = (st.s2 ^ st.s0) >>> 0
  st.s3 = (st.s3 ^ st.s1) >>> 0
  st.s1 = (st.s1 ^ st.s2) >>> 0
  st.s0 = (st.s0 ^ st.s3) >>> 0
  st.s2 = (st.s2 ^ t) >>> 0
  st.s3 = rotl(st.s3, 11)
  st.draws++
  return result
}

/**
 * Intreg in [0, maxExclusive), FARA bias de modulo.
 * Respingerea tine bucla determinista: acelasi seed da acelasi numar de respingeri.
 */
export function nextInt(st: RngState, maxExclusive: number): number {
  if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
    throw new Error(`nextInt: maxExclusive trebuie sa fie un intreg pozitiv, primit ${maxExclusive}`)
  }
  if (maxExclusive === 1) return 0
  const limit = 0x100000000 - (0x100000000 % maxExclusive)
  let v = nextU32(st)
  while (v >= limit) v = nextU32(st)
  return v % maxExclusive
}

/** Intreg in [min, max], inclusiv la ambele capete. */
export function nextRange(st: RngState, min: number, max: number): number {
  return min + nextInt(st, max - min + 1)
}

/** Copie a starii. Pentru teste si pentru snapshot inainte de un pas speculativ. */
export function cloneRng(st: RngState): RngState {
  return { s0: st.s0, s1: st.s1, s2: st.s2, s3: st.s3, draws: st.draws }
}
