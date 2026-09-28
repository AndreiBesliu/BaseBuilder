/**
 * Usile, in viewer — partea PURA (fara THREE), ca sa se testeze in node: unde pune unealta Usa o usa,
 * cum se orienteaza panoul unei usi zidite, si cum devine o lovitura in panou un impact pe care
 * `viewer/tinta.ts` il intelege.
 *
 * Mesher-ul nu deseneaza usa ca bloc (`seDeseneazaCaBloc`): e un panou subtire, desenat de
 * `strat-usi.ts`. Panoul nu e in mesh-urile terenului, deci raycast-ul nu-l vedea: 0 din 500 de clicuri
 * pe panou ajungeau la usa (panoul pe design, JUC-4) — Sapa si Inspecteaza nimereau pragul, stalpul sau
 * podeaua din spate. `impactPeUsa` traduce lovitura intr-un impact pe FATA celulei usii dinspre camera,
 * cu normala axiala si punctul strans in celula: tinta ramane regula ei.
 */

import type { Rules } from '../src/sim/content.ts'
import { celuleUsii } from '../src/sim/camere-explica.ts'
import type { Celula, LumeGol } from '../src/sim/camere-explica.ts'
import { Desemnare, desemnareLaCelula, seSapaLa } from '../src/sim/desemnari.ts'
import type { World } from '../src/sim/state.ts'
import { CHUNK_CELLS, ePodea, isSolid, Material, VOXEL_LEVELS } from '../src/sim/terrain/chunk.ts'
import type { Terrain } from '../src/sim/terrain/terrain.ts'
import { materialAt } from '../src/sim/terrain/terrain.ts'
import { primulVizibil } from './tinta.ts'
import type { Impact, Raza, V3 } from './tinta.ts'

/**
 * Lumea PLANULUI pentru unealta Usa: terenul plus desemnarile. Un jucator isi deseneaza de obicei
 * toata casa, cu golul usii, inainte sa se zideasca ceva — pe terenul gol, golul n-ar fi un gol. O usa
 * (zidita sau desemnata) conteaza ca aer: un al doilea clic pe un gol pe jumatate desemnat il completeaza.
 * La fel o celula solida desemnata la SAPAT: golul unei pivnite desenate, dar nesapate, e un gol (EXP-8,
 * ECR-9). (`podea` ramane a terenului si a pieselor: golDeUsa o intreaba sub coloana de aer a golului,
 * iar o celula desemnata la sapat intra in coloana.)
 */
export function lumePlan(w: World, rules: Rules): LumeGol {
  const mat = (x: number, y: number, z: number): number => {
    const m = materialAt(w.terrain, x, y, z)
    return m.ok ? m.value : Material.ROCA
  }
  const piesa = (x: number, y: number, z: number): number | null => {
    const s = desemnareLaCelula(w.desemnari, x, y, z)
    if (s === -1 || w.desemnari.kind[s] !== Desemnare.CONSTRUIESTE) return null
    return rules.piese[w.desemnari.piesa[s]!]!.material
  }
  const sapat = (x: number, y: number, z: number): boolean => isSolid(mat(x, y, z)) && seSapaLa(w.desemnari, x, y, z)
  return {
    aer: (x, y, z) => {
      const m = mat(x, y, z)
      if (m !== Material.AER && m !== Material.USA) return sapat(x, y, z)
      const p = piesa(x, y, z)
      return p === null || p === Material.USA
    },
    podea: (x, y, z) => {
      if (ePodea(mat(x, y, z))) return true
      const p = piesa(x, y, z)
      return p !== null && ePodea(p)
    },
  }
}

/** Celulele unei usi pentru un clic pe (x, y, z), in lumea planului; null = nu e un gol de usa acolo. */
export function celuleUsiiPlan(w: World, rules: Rules, x: number, y: number, z: number): readonly Celula[] | null {
  return celuleUsii(lumePlan(w, rules), x, y, z)
}

/**
 * Aceeasi intrebare ca `celuleUsiiPlan`, cu lumea planului construita O DATA: parcurgerea razei si
 * dreptunghiul intreaba sute de celule la rand.
 */
export function celuleUsiiInPlan(w: World, rules: Rules): (x: number, y: number, z: number) => readonly Celula[] | null {
  const lume = lumePlan(w, rules)
  return (x, y, z) => celuleUsii(lume, x, y, z)
}

export const MESAJ_FARA_GOL = 'O ușă se pune într-un gol de perete (lat de 1–2 m, înalt de 1–3 m) sau într-o gaură de podea.'

// ---------------------------------------------------------------------------------------------
// golul tintit de unealta Usa: ce se vede PRIN gol nu e tinta (recenzia pe ecran, ECR-1)
// ---------------------------------------------------------------------------------------------

export interface IntrebareGol {
  readonly raza: Raza
  /** Impacturile pe teren si pe panourile usilor, sortate dupa `t` — toate, si cele taiate de slice. */
  readonly impacturi: readonly Impact[]
  /** Cota planului de taiere (nivelul activ = slice − 1), sau null. */
  readonly slice: number | null
  /** Pana unde se cauta cand raza nu atinge nimic vizibil (m). */
  readonly departeMax: number
  /** Tinta generica a piesei (`alegeTinta`, modul `piesa`), sau null cand n-are (cer, crapatura). */
  readonly tinta: { readonly wx: number; readonly wy: number; readonly z: number } | null
  /** Celulele golului care contine celula, in lumea planului; null = nu e un gol de usa acolo. */
  readonly celuleUsii: (x: number, y: number, z: number) => readonly Celula[] | null
}

/** Plafonul parcurgerii: `departeMax` = 150 m pe diagonala trece prin cel mult ~3 × 150 celule. */
const PASI_MAX_RAZA = 1024

/**
 * Golul de usa pe care il tinteste raza, pentru unealta Usa.
 *
 * Tinta generica a piesei e aerul din FATA primei fete atinse. Pe un gol neumplut raza trece prin gol si
 * atinge podeaua camerei sau zidul din spate: celula tintita e in camera, nu in gol, si clicul pe
 * mijlocul golului era refuzat — 45–83 % din pixelii golului, privit din fata; pe un gol doar planificat
 * se accepta 27 % (recenzia pe ecran, ECR-1). Acum: tinta generica, daca e intr-un gol; altfel prima
 * celula de pe raza (Amanatides–Woo, celula cu celula, de la camera) care e intr-un gol, pana la primul
 * impact VIZIBIL. Si cand raza nu atinge nimic (o crapatura intre podea si zid, cerul prin gol): atunci
 * pana la `departeMax` (completarea verificatorului: 553 din 72.001 de pixeli ramaneau refuzati fara ea).
 *
 * Cu nivelul pornit, doar celulele de la nivelul activ in jos: deasupra planului de taiere nu se vede nimic.
 * Pura: impacturile vin de la apelant (acelasi raycast ca tinta), golul il spune `celuleUsii`.
 */
export function golulTintit(q: IntrebareGol): readonly Celula[] | null {
  if (q.tinta !== null) {
    const u = q.celuleUsii(q.tinta.wx, q.tinta.wy, q.tinta.z)
    if (u !== null) return u
  }
  const { o, d } = q.raza
  const lung = Math.hypot(d.x, d.y, d.z)
  if (lung === 0) return null
  const zMax = q.slice === null ? Infinity : q.slice - 1
  const v = primulVizibil(q.impacturi, q.slice)
  const tMax = v !== null ? v.t : q.departeMax / lung
  // Grila scenei: celula (floor x, floor y, floor z) = (wx, cota, wy).
  let x = Math.floor(o.x)
  let y = Math.floor(o.y)
  let z = Math.floor(o.z)
  const sx = Math.sign(d.x), sy = Math.sign(d.y), sz = Math.sign(d.z)
  const primul = (p: number, s: number, dd: number): number => (dd === 0 ? Infinity : (s > 0 ? Math.floor(p) + 1 - p : p - Math.floor(p)) / Math.abs(dd))
  let tx = primul(o.x, sx, d.x)
  let ty = primul(o.y, sy, d.y)
  let tz = primul(o.z, sz, d.z)
  const px = d.x === 0 ? Infinity : 1 / Math.abs(d.x)
  const py = d.y === 0 ? Infinity : 1 / Math.abs(d.y)
  const pz = d.z === 0 ? Infinity : 1 / Math.abs(d.z)
  let t = 0
  for (let n = 0; t <= tMax && n < PASI_MAX_RAZA; n++) {
    if (y <= zMax) {
      const u = q.celuleUsii(x, z, y)
      if (u !== null) return u
    }
    if (tx <= ty && tx <= tz) { t = tx; x += sx; tx += px } else if (ty <= tz) { t = ty; y += sy; ty += py } else { t = tz; z += sz; tz += pz }
  }
  return null
}

const VECINI_6: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]

/**
 * Usa din care face parte celula (x, y, z): grupul 6-conex de celule pentru care `esteUsa` spune da,
 * sortat. „Anulează" pe un cub al usii retragea doar cubul acela: ramanea o jumatate de usa, iar incaperea
 * ramanea deschisa (recenzia pe ecran, ECR-6; designul v2 §8 cere undo comun). Grupul, nu golul din lumea
 * planului: golul se poate strica intre timp (un stalp sapat) si ar lasa iar jumatatea.
 */
export function grupUsa(esteUsa: (x: number, y: number, z: number) => boolean, x: number, y: number, z: number): Celula[] {
  if (!esteUsa(x, y, z)) return []
  const out: Celula[] = [{ x, y, z }]
  const vazut = new Set<string>([`${x},${y},${z}`])
  for (let i = 0; i < out.length; i++) {
    const c = out[i]!
    for (const [dx, dy, dz] of VECINI_6) {
      const nx = c.x + dx, ny = c.y + dy, nz = c.z + dz
      const k = `${nx},${ny},${nz}`
      if (vazut.has(k)) continue
      vazut.add(k)
      if (esteUsa(nx, ny, nz)) out.push({ x: nx, y: ny, z: nz })
    }
  }
  return out.sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x)
}

/**
 * Cum sta panoul unei usi zidite:
 *  - `subtireY`: panou in planul wy = const (zidul merge pe x; se trece pe y);
 *  - `subtireX`: panou in planul wx = const;
 *  - `orizontala`: chepeng, la fata de sus a celulei (gaura unei placi).
 */
export type Orientare = 'subtireX' | 'subtireY' | 'orizontala'

export const ORIENTARI: readonly Orientare[] = ['subtireX', 'subtireY', 'orizontala']

export function orientareUsa(t: Terrain, x: number, y: number, z: number): Orientare {
  const m = (a: number, b: number, c: number): number => {
    const r = materialAt(t, a, b, c)
    return r.ok ? r.value : Material.ROCA
  }
  const vertical = m(x, y, z + 1) === Material.USA || m(x, y, z - 1) === Material.USA
  // Intr-un zid, nu intr-o placa: vecinii opusi pe o axa sunt zid (plin care continua in jos — sau
  // cealalta coloana a unei usi late de 2), iar pe axa cealalta e aer de ambele parti (se trece prin el).
  // Jumatatea de sus zidita singura, fara buiandrug, iesea chepeng: o lespede la capatul golului, cat timp
  // cea de jos nu era zidita — sau pentru totdeauna, dupa o jumatate retrasa (recenzia pe ecran, ECR-8).
  // Aerul pe axa cealalta pastreaza chepengul peste un coridor de 1 (vecinii lui sunt placa), iar zidul
  // care continua in jos, pe cel dintr-o pasarela lata de 1 (sub placa e aer).
  const zid = (a: number, b: number): boolean => isSolid(m(a, b, z)) && (isSolid(m(a, b, z - 1)) || m(a, b, z) === Material.USA)
  const inZid = (ax: number, ay: number): boolean => zid(x + ax, y + ay) && zid(x - ax, y - ay)
    && !isSolid(m(x + ay, y + ax, z)) && !isSolid(m(x - ay, y - ax, z))
  if (!vertical && inZid(1, 0)) return 'subtireY'
  if (!vertical && inZid(0, 1)) return 'subtireX'
  if (!vertical && m(x, y, z + 1) === Material.AER) {
    // Chepeng: macar doua vecine laterale sunt placa (plin cu aer deasupra), nu zid.
    let placa = 0
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (isSolid(m(x + dx, y + dy, z)) && m(x + dx, y + dy, z + 1) === Material.AER) placa++
    }
    if (placa >= 2) return 'orizontala'
  }
  if (isSolid(m(x - 1, y, z)) && isSolid(m(x + 1, y, z))) return 'subtireY'
  if (isSolid(m(x, y - 1, z)) && isSolid(m(x, y + 1, z))) return 'subtireX'
  return 'subtireY'
}

export interface UsaDesenata extends Celula {
  readonly o: Orientare
}

/** Usile zidite din chunk-urile promovate (numai acolo exista voxeli zidite), cu orientarea lor. */
export function usiDinTeren(t: Terrain): UsaDesenata[] {
  const out: UsaDesenata[] = []
  for (const k of t.keys) {
    const ch = t.chunks.get(k)!
    const v = ch.voxels
    if (!v) continue
    for (let col = 0; col < CHUNK_CELLS * CHUNK_CELLS; col++) {
      let z = 0
      const end = v.columnStart[col + 1]!
      for (let run = v.columnStart[col]!; run < end && z < VOXEL_LEVELS; run++) {
        const len = v.runLength[run]!
        if (v.runMaterial[run] === Material.USA) {
          const x = ch.cx * CHUNK_CELLS + (col % CHUNK_CELLS)
          const y = ch.cy * CHUNK_CELLS + ((col / CHUNK_CELLS) | 0)
          for (let i = 0; i < len; i++) {
            const zz = v.zBaseM + z + i
            out.push({ x, y, z: zz, o: orientareUsa(t, x, y, zz) })
          }
        }
        z += len
      }
    }
  }
  return out
}

/** Grosimea panoului desenat (m). */
export const GROSIME_USA = 0.16

const strange = (v: number, lo: number): number => Math.min(lo + 0.98, Math.max(lo + 0.02, v))

/**
 * Impactul pe care `viewer/tinta.ts` il primeste pentru o lovitura in panoul usii `u`: pe fata celulei
 * usii dinspre raza, cu normala axiala, punctul strans in celula. `celulaLangaFata(i, -1)` e atunci
 * celula usii (sapa, inspecteaza, retrage), `celulaLangaFata(i, +1)` aerul din fata ei (piesa).
 * Coordonatele scenei: x = wx, y = cota, z = wy.
 */
export function impactPeUsa(t: number, punct: V3, u: Celula & { o: Orientare }, directie: V3): Impact {
  const px = strange(punct.x, u.x)
  const py = strange(punct.y, u.z)
  const pz = strange(punct.z, u.y)
  if (u.o === 'subtireY') {
    const spre = directie.z > 0 ? -1 : 1
    return { t, p: { x: px, y: py, z: spre < 0 ? u.y : u.y + 1 }, n: { x: 0, y: 0, z: spre } }
  }
  if (u.o === 'subtireX') {
    const spre = directie.x > 0 ? -1 : 1
    return { t, p: { x: spre < 0 ? u.x : u.x + 1, y: py, z: pz }, n: { x: spre, y: 0, z: 0 } }
  }
  const spre = directie.y > 0 ? -1 : 1
  return { t, p: { x: px, y: spre < 0 ? u.z : u.z + 1, z: pz }, n: { x: 0, y: spre, z: 0 } }
}
