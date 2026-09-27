/**
 * Celula-tinta a unui click, aleasa din ce SE VEDE sub cursor. Fara THREE, ca sa se poata
 * testa in node: primeste raza si impacturile ca date.
 *
 * Coordonatele sunt ale scenei viewer-ului: `x` = wx, `y` = cota (in sus), `z` = wy. O celula
 * (wx, wy, z) ocupa cutia [wx, wx+1] × [z, z+1] × [wy, wy+1].
 *
 * ## De ce exista
 *
 * Cu o piesa aleasa si slice-ul pornit, click-ul deseneaza la NIVELUL ACTIV (DESIGN §5.2).
 * Prima versiune lua coloana din intersectia razei cu planul y = zActiv + 1 — un metru DEASUPRA
 * solului pe care il vede jucatorul pe primul nivel de aer. La unghiul de pornire al camerei
 * (24,8°), piesa pleca 1–2 celule spre departe de cursor: 0/7 in celula vazuta pe un loc plat,
 * un zid drept desenat in zigzag, o placa 0/25 (recenzia, `p2-paralaxa.mjs` / `p3-linie.mjs`;
 * maturarea verificatorului pe o grila de pixeli: 2/103 la 24,8°, `v2-tinta.mjs`).
 *
 * ## Regula
 *
 * Coloana LUCRULUI VAZUT sub cursor:
 *
 * 1. **Podeaua nivelului activ facuta din piese nezidite:** CAPACUL unui cub J de pe nivelul de
 *    dedesubt. Asa se stivuieste un rand pe un rand inca nezidit. Cel mai apropiat de camera.
 *    Numai capacul, si numai daca celula de deasupra lui e LIBERA: cuburile J sunt contururi, prin
 *    ele se vede. Un perete desenat, privit din lateral, nu e podea; iar raza spre solul unei
 *    camere, cu doua niveluri mai jos, trece prin lateralul peretelui din fata. Cu tot cubul ca
 *    tinta, o placa peste o camera 7×7 iesea 9/24 la interior, fiindca rand dupa rand se lua
 *    coloana peretelui (proba `m-ov13.mjs`, pasul 2). Iar peste o celula deja desemnata nu se mai
 *    poate desena nimic: capacul ei ar opri raza degeaba.
 *    Nu intra nici cuburile mai adanci — vazute prin sol, sunt deplasate pe orizontala fata de
 *    solul de deasupra lor cu cat sunt de adanci, exact paralaxa de reparat —, nici cele de pe
 *    nivelul activ (celula lor e deja luata; o placa desenata dinspre camera ramanea cu 14 celule
 *    de neatins, `m-placa.mjs`: 35/49), nici patratele S: stau la 0,94 m deasupra podelei, deci
 *    prinse ca tinta ar fi adus inapoi paralaxa — o treapta pusa la loc cu S pornit ajungea in
 *    coloana unui patrat turcoaz proiectat de la etaj, nu in cea tintita (`m-ov13.mjs`, pasul 5).
 * 2. **Primul impact pe teren NETAIAT** de slice. Raycaster-ul nu stie de planul de taiere, deci
 *    un impact cu y > zActiv + 1 e pe geometrie invizibila si se sare. Coloana e a PUNCTULUI,
 *    impins 1 cm in solid: pe o fata de sus sau pe un triunghi de panta e chiar coloana punctului;
 *    pe o fata laterala de voxel, unde punctul sta pe granita dintre doua coloane, e coloana
 *    solidului vazut. (Varianta „-0,5 × normala" pierdea celule pe triunghiurile inclinate:
 *    verificatorul, `v4-f3b.mjs`.)
 *    Cu o exceptie: fata LATERALA a unui solid de PE nivelul activ. Acolo coloana solidului e
 *    plina, deci click-ul ar fi refuzat mereu; tinta e celula de aer din fata fetei — cum era
 *    inainte de nivelul activ, si cum o cer pasii 2 si 5 din OWNER_VERIFY 12 („click pe fata
 *    celulei a doua: grinda se deseneaza in celula de aer din fata ei"; proba `m-ov12.mjs`).
 *    Numai cand celula coloanei, la nivelul activ, chiar e PLINA (`plinaPeNivel`): pe panta de
 *    langa fortareata, fete verticale la cota nivelului activ aveau aer in coloana lor, iar regula
 *    fara verificare a mutat 4 click-uri din 44 din celula tintita intr-un refuz (`m-v5.mjs`).
 * 3. **Altfel** (cer, sau raza a trecut doar prin teren taiat) planul y = zActiv, podeaua nivelului
 *    activ — dar numai pana la `departeMax` de camera. Mai departe, nimic: un click pe cer nu
 *    desemneaza o piesa la un kilometru.
 *
 * Retragerea (Ctrl+click) are regula ei, `cubAtins`: cubul J vazut, oriunde e atins — capac,
 * lateral sau baza — pe orice nivel netaiat.
 */

export interface V3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** O raza: originea si directia (nu neaparat unitara; `t` e in unitatile ei). */
export interface Raza {
  readonly o: V3
  readonly d: V3
}

/** Un impact pe teren, ca de la raycaster: distanta, punctul si normala fetei (in lume). */
export interface Impact {
  readonly t: number
  readonly p: V3
  readonly n: V3
}

/** Celula unei desemnari (un cub J). */
export interface CelulaJ {
  readonly wx: number
  readonly wy: number
  readonly z: number
}

export interface Coloana {
  readonly wx: number
  readonly wy: number
}

/** Toleranta planului de taiere: fata de sus a nivelului activ sta EXACT pe plan, si se vede. */
export const EPS_TAIERE = 1e-3
/** Cat se impinge punctul in solid ca sa hotarasca o granita de coloane. */
export const PATRUNDERE = 0.01

/**
 * Cat e retras cubul J desenat fata de celula lui, pe fiecare parte. Il citeste si
 * overlay-ul de joburi, ca sa deseneze exact cutia pe care o atinge click-ul.
 */
export const MARGINE_CUB_J = 0.1

/** Impactul se vede? Planul de taiere pastreaza y <= slice; `null` = slice-ul oprit. */
export function vizibil(i: Impact, slice: number | null): boolean {
  return slice === null || i.p.y <= slice + EPS_TAIERE
}

/** Primul impact care nu e taiat de slice — ce se vede la pixelul ala. Impacturile vin sortate dupa `t`. */
export function primulVizibil(impacturi: readonly Impact[], slice: number | null): Impact | null {
  for (const i of impacturi) if (vizibil(i, slice)) return i
  return null
}

/** Coloana punctului de impact, impins `PATRUNDERE` in solid (vezi regula 2). */
export function coloanaImpactului(i: Impact): Coloana {
  return { wx: Math.floor(i.p.x - PATRUNDERE * i.n.x), wy: Math.floor(i.p.z - PATRUNDERE * i.n.z) }
}

/**
 * Celula de la o jumatate de celula de fata atinsa: `sens` = +1 e aerul din fata ei (zidit,
 * piesa fara slice), -1 e solidul din spatele ei (sapat). Punctul sta exact pe suprafata, deci
 * rotunjit ar nimeri sistematic celula de deasupra solului.
 */
export function celulaLangaFata(i: Impact, sens: 1 | -1): CelulaJ {
  const k = 0.5 * sens
  return {
    wx: Math.floor(i.p.x + k * i.n.x),
    wy: Math.floor(i.p.z + k * i.n.z),
    z: Math.floor(i.p.y + k * i.n.y),
  }
}

/** `t` la care raza intra in cutia data (sau 0, daca porneste din ea); `null` daca n-o atinge. */
export function intrareInCutie(r: Raza, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number | null {
  let tmin = 0
  let tmax = Infinity
  const axe: readonly (readonly [number, number, number, number])[] = [
    [r.o.x, r.d.x, x0, x1],
    [r.o.y, r.d.y, y0, y1],
    [r.o.z, r.d.z, z0, z1],
  ]
  for (const [o, d, lo, hi] of axe) {
    if (d === 0) {
      if (o < lo || o > hi) return null
      continue
    }
    let a = (lo - o) / d
    let b = (hi - o) / d
    if (a > b) { const s = a; a = b; b = s }
    if (a > tmin) tmin = a
    if (b < tmax) tmax = b
    if (tmin > tmax) return null
  }
  return tmin
}

/**
 * Cel mai apropiat cub J atins de raza, oriunde, dintre cei cu cota in [zMin, zMax]. Cutia e
 * cubul DESENAT, nu celula intreaga: intr-un rand de cuburi, raza spre baza unuia trece exact
 * prin muchia comuna a celulelor vecine, iar cu celula intreaga ar fi luat vecinul din fata.
 */
export function cubAtins(r: Raza, cuburi: readonly CelulaJ[], zMin: number, zMax: number): { readonly c: CelulaJ; readonly t: number } | null {
  const m = MARGINE_CUB_J
  let best: { c: CelulaJ; t: number } | null = null
  for (const c of cuburi) {
    if (c.z < zMin || c.z > zMax) continue
    const t = intrareInCutie(r, c.wx + m, c.z + m, c.wy + m, c.wx + 1 - m, c.z + 1 - m, c.wy + 1 - m)
    if (t !== null && (best === null || t < best.t)) best = { c, t }
  }
  return best
}

/** `t` la care raza atinge planul orizontal y = `y`, in fata camerei; `null` daca nu-l atinge. */
export function razaPlan(r: Raza, y: number): number | null {
  if (r.d.y === 0) return null
  const t = (y - r.o.y) / r.d.y
  return t >= 0 ? t : null
}

/**
 * Cel mai apropiat CAPAC de cub J atins de sus, dintre cuburile de la cota `z` pentru care
 * `acceptat` spune da. Capacul e fata de sus a cubului desenat (y = z + 1 - margine).
 */
export function capacAtins(r: Raza, cuburi: readonly CelulaJ[], z: number, acceptat: (c: CelulaJ) => boolean): { readonly c: CelulaJ; readonly t: number } | null {
  if (r.d.y >= 0) return null
  const m = MARGINE_CUB_J
  const t = razaPlan(r, z + 1 - m)
  if (t === null) return null
  const x = r.o.x + t * r.d.x
  const y = r.o.z + t * r.d.z
  for (const c of cuburi) {
    if (c.z !== z) continue
    if (x < c.wx + m || x > c.wx + 1 - m || y < c.wy + m || y > c.wy + 1 - m) continue
    // Cuburile de la aceeasi cota nu se suprapun: raza atinge planul capacelor intr-un singur punct.
    if (acceptat(c)) return { c, t }
  }
  return null
}

export interface IntrebareColoana {
  readonly raza: Raza
  /** Nivelul activ; planul de taiere e la zActiv + 1. */
  readonly zActiv: number
  /** Impacturile pe teren, sortate dupa `t`, TOATE (si cele taiate). */
  readonly impacturi: readonly Impact[]
  /** Cuburile J desenate (gol cand overlay-ul J e oprit). */
  readonly cuburi: readonly CelulaJ[]
  /** Celula (wx, wy, zActiv) e deja desemnata? Si cu overlay-ul J oprit. */
  readonly desemnataPeNivel: (wx: number, wy: number) => boolean
  /** Celula (wx, wy, zActiv) e solida (teren sau zidit)? */
  readonly plinaPeNivel: (wx: number, wy: number) => boolean
  /** Cat de departe de camera poate cadea planul de rezerva (regula 3). */
  readonly departeMax: number
}

export type SursaColoanei = 'J' | 'teren' | 'fata' | 'plan'

/**
 * Sub cat |n.y| o fata e LATERALA. Normala vine din geometria triunghiului: o fata de voxel are
 * exact 0, iar panta NETEZITA de mesher are si triunghiuri abrupte, care nu sunt pereti.
 */
export const PRAG_LATERAL = 0.01

export type RaspunsColoana =
  | { readonly ok: true; readonly wx: number; readonly wy: number; readonly sursa: SursaColoanei }
  | { readonly ok: false }

/** Coloana de sub cursor pentru o piesa la nivelul activ. Regula e in capul fisierului. */
export function alegeColoana(q: IntrebareColoana): RaspunsColoana {
  const { raza, zActiv } = q
  const j = capacAtins(raza, q.cuburi, zActiv - 1, (c) => !q.desemnataPeNivel(c.wx, c.wy))
  const v = primulVizibil(q.impacturi, zActiv + 1)
  // Capacul castiga si fata de un teren mai apropiat: overlay-ul se deseneaza fara test de adancime.
  if (j !== null) return { ok: true, wx: j.c.wx, wy: j.c.wy, sursa: 'J' }
  if (v !== null) {
    const col = coloanaImpactului(v)
    if (Math.abs(v.n.y) < PRAG_LATERAL && Math.floor(v.p.y) === zActiv && q.plinaPeNivel(col.wx, col.wy)) {
      const c = celulaLangaFata(v, 1)
      return { ok: true, wx: c.wx, wy: c.wy, sursa: 'fata' }
    }
    return { ok: true, ...col, sursa: 'teren' }
  }
  const t = razaPlan(raza, zActiv)
  if (t === null) return { ok: false }
  const x = raza.o.x + t * raza.d.x
  const z = raza.o.z + t * raza.d.z
  const dist = t * Math.hypot(raza.d.x, raza.d.y, raza.d.z)
  if (dist > q.departeMax) return { ok: false }
  return { ok: true, wx: Math.floor(x), wy: Math.floor(z), sursa: 'plan' }
}

// ---------------------------------------------------------------------------------------------
// tinta clicului, pe unealta
// ---------------------------------------------------------------------------------------------

/**
 * Ce fel de tinta cauta clicul. Ramificarea statea in main.ts (`tintaLa`); acum e aici, ca sa aiba
 * test (panoul de design al UI-ului, I5):
 *  - `sapa`      — solidul VAZUT (fata atinsa, spre inauntru): sapatul, Alt+clic;
 *  - `piesa`     — cu nivelul pornit, coloana de la nivelul activ (`alegeColoana`); altfel aerul din
 *                  fata fetei atinse;
 *  - `fata`      — aerul din fata fetei atinse, mereu (Shift+clic: „zideste pe loc", unealta de test);
 *  - `retrage`   — cubul J VAZUT (pe niveluri netaiate), altfel solidul vazut. Varianta veche cadea,
 *                  fara cub sub cursor, pe ramura piesei alese: anularea lovea terenul de DUPA cub;
 *  - `inspecteaza` — cubul J vazut, altfel solidul vazut (pionul il alege apelantul, inainte);
 *  - `zona`      — solidul vazut; zona se picteaza pe celula de deasupra lui (apelantul adauga 1).
 *                  Cu nivelul pornit, celula de la nivelul activ (ca piesa): acolo se sta.
 */
export type ModTinta = 'sapa' | 'piesa' | 'fata' | 'retrage' | 'inspecteaza' | 'zona'

export interface IntrebareTinta {
  readonly mod: ModTinta
  readonly raza: Raza
  readonly impacturi: readonly Impact[]
  /** Cota planului de taiere (nivelul activ = slice − 1), sau null. */
  readonly slice: number | null
  /** Cuburile J desenate (gol cand overlay-ul J e oprit): ce nu se vede nu se tinteste. */
  readonly cuburi: readonly CelulaJ[]
  readonly departeMax: number
  readonly desemnataPeNivel: (wx: number, wy: number) => boolean
  readonly plinaPeNivel: (wx: number, wy: number) => boolean
}

export type RaspunsTinta =
  | { readonly ok: true; readonly wx: number; readonly wy: number; readonly z: number; readonly sursa: SursaColoanei | 'cub' }
  | { readonly ok: false; readonly mesaj: string }

export function alegeTinta(q: IntrebareTinta): RaspunsTinta {
  const zMaxVazut = q.slice === null ? Infinity : q.slice - 1
  if (q.mod === 'retrage' || q.mod === 'inspecteaza') {
    const j = cubAtins(q.raza, q.cuburi, -Infinity, zMaxVazut)
    const v = primulVizibil(q.impacturi, q.slice)
    // Cubul se deseneaza peste tot (fara test de adancime), deci castiga si fata de terenul din fata lui.
    if (j !== null) return { ok: true, ...j.c, sursa: 'cub' }
    if (v === null) return faraTinta(q)
    return { ok: true, ...celulaLangaFata(v, -1), sursa: 'teren' }
  }
  if ((q.mod === 'piesa' || q.mod === 'zona') && q.slice !== null) {
    const zActiv = q.slice - 1
    const c = alegeColoana({
      raza: q.raza, zActiv, impacturi: q.impacturi, cuburi: q.cuburi, departeMax: q.departeMax,
      desemnataPeNivel: q.desemnataPeNivel, plinaPeNivel: q.plinaPeNivel,
    })
    if (!c.ok) return { ok: false, mesaj: 'nimic la nivelul activ sub cursor' }
    // Zona se picteaza pe celula calcabila: la nivelul activ e chiar celula asta, deci apelantul o
    // primeste cu o cota mai jos (el adauga 1, ca pe solidul vazut).
    return { ok: true, wx: c.wx, wy: c.wy, z: q.mod === 'zona' ? zActiv - 1 : zActiv, sursa: c.sursa }
  }
  const v = primulVizibil(q.impacturi, q.slice)
  if (v === null) return faraTinta(q)
  const spreAer = q.mod === 'piesa' || q.mod === 'fata'
  return { ok: true, ...celulaLangaFata(v, spreAer ? 1 : -1), sursa: 'fata' }
}

function faraTinta(q: IntrebareTinta): RaspunsTinta {
  return { ok: false, mesaj: q.slice !== null && q.impacturi.length > 0 ? 'nimic vizibil sub cursor: tot ce atinge raza e taiat de slice' : 'nimic sub cursor' }
}

/**
 * Maparea instanta → slot a stratului de pioni: instantele se dau in ordinea sloturilor VII, deci dupa
 * prima plecare instanta n nu mai e slotul n (panoul, T9). Intoarce cate instante sunt.
 */
export function slotDeInstanta(alive: ArrayLike<number>, count: number, out: Int32Array): number {
  let n = 0
  for (let i = 0; i < count; i++) {
    if (alive[i] === 0) continue
    out[n] = i
    n++
  }
  return n
}
