/**
 * „De ce nu e încăpere?" — explicația inspectorului și celulele overlay-ului, ca funcții PURE de
 * (teren, index). Nimic de aici nu scrie în lume și nimic din simulare nu le citește; stau în `sim/`
 * ca să se testeze în node, pe terenul real.
 *
 * Panoul pe designul camerelor (lentila „jucătorul" și verificatorii ei) a măsurat trei lucruri pe
 * care le repară forma de aici:
 * - „SUS" (gaură în acoperiș) nu poate ieși după pasul spre scurgere: nicio față verticală a aerului
 *   acoperit nu dă în cer (demonstrat). Pe 23 de inspecții, direcția după pas era corectă în 9, iar
 *   gaura din acoperiș primea sfatul „pune o ușă" (JUC-1). Aici direcția se află umplând ORIZONTAL
 *   cerul de la cota scurgerii: dacă se închide între ziduri și aer acoperit, e o gaură în acoperiș.
 * - Cazul cel mai des (încăperi legate prin goluri fără ușă, cu intrarea la capătul unui coridor)
 *   primea sfatul „pune o ușă" LA INTRARE, la 94–106 m, adică exact opusul intenției (JUC-2). Aici
 *   golul se caută pe drumul BFS dinspre celula întrebată, iar promisiunea „devine o încăpere de
 *   V m³" se VERIFICĂ rulând aceeași inundare cu golul drept hotar — până la 4 uși.
 * - Inundarea e FIFO (BFS): prima scurgere e cea mai apropiată pe drum (JUC-13).
 */

import type { Terrain } from './terrain/terrain.ts'
import { WORLD_CELLS } from './terrain/terrain.ts'
import { ePodea, Material } from './terrain/chunk.ts'
import { materialAt } from './terrain/terrain.ts'
import type { CititorCamere, Componenta, IndexCamere } from './camere.ts'
import {
  celuleComponentei,
  celuleLaNivel,
  cheieCelula,
  cititorCamere,
  componentaLa,
  varfLa,
  decodeazaCelula,
  esteAcoperita,
  esteAer,
  esteCer,
  esteIncapere,
} from './camere.ts'

export interface Celula {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type Explicatie =
  /** Celula nu e aer (solid, apă, ușă). */
  | { readonly fel: 'NU_E_AER' }
  /** Aer sub cerul liber. */
  | { readonly fel: 'CER' }
  /** Acoperit și deschis, dar scurgerea e dincolo de plafonul inspectorului. */
  | { readonly fel: 'DEPARTE'; readonly volum: number }
  | {
      readonly fel: 'INCAPERE'
      readonly volum: number
      readonly ancora: number
      /** Ușile de pe hotar, numărate pe componente 6-conexe de USA (o ușă de 2 celule = 1). */
      readonly usi: number
      /** Podeaua pe niveluri: [z, celule cu podea dedesubt], crescător pe z. */
      readonly podea: readonly (readonly [number, number])[]
    }
  | {
      readonly fel: 'DESCHISA'
      readonly volum: number
      /** Prima celulă de cer în ordinea BFS: pe aici iese aerul. */
      readonly scurgere: Celula
      /** Ultima celulă acoperită de pe drum (vecina ei). */
      readonly dinainte: Celula
      readonly directie: 'SUS' | 'LATERAL'
      /** Unde e gaura: la SUS, celula din planul acoperișului; la LATERAL, scurgerea. */
      readonly gaura: Celula
      /** Pași pe drumul aerului, de la celula întrebată la scurgere. */
      readonly pasi: number
      /** Ușile care o închid (celulele golurilor), dacă se găsesc cel mult 4 și închid chiar. */
      readonly usiPropuse: readonly Celula[]
      /** Volumul încăperii promise cu ușile propuse; null dacă ușile nu ajung. */
      readonly volumCuUsi: number | null
    }

/** Cât inundă inspectorul, cel mult (siguranță: o mină imensă deschisă nu blochează UI-ul). */
export const EXPLICA_PLAFON = 1 << 18

const LAT = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const D6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const

interface Inundare {
  /** Închisă: n-a atins cerul (și a epuizat componenta). */
  readonly inchisa: boolean
  readonly volum: number
  /** Scurgerea (cer) și celula dinainte, dacă nu e închisă. */
  readonly scurgere: Celula | null
  readonly dinainte: Celula | null
  /** Drumul de la start la `dinainte` (inclusiv), ca chei. */
  readonly drum: number[]
}

/**
 * BFS peste aerul acoperit din (x, y, z), cu `hotar` = celule tratate ca pline (ușile ipotetice).
 * Se oprește la primul cer întâlnit (cea mai apropiată scurgere) sau epuizează componenta.
 */
function inunda(r: CititorCamere, x: number, y: number, z: number, hotar: ReadonlySet<number>): Inundare {
  const start = cheieCelula(x, y, z)
  const parinte = new Map<number, number>([[start, -1]])
  const coada: number[] = [start]
  let cap = 0
  const aerLiber = (a: number, b: number, c: number): boolean => esteAer(r, a, b, c) && !hotar.has(cheieCelula(a, b, c))
  while (cap < coada.length) {
    if (coada.length > EXPLICA_PLAFON) break
    const k = coada[cap++]!
    const { x: cx, y: cy, z: cz } = decodeazaCelula(k)
    for (const [dx, dy, dz] of D6) {
      const nx = cx + dx, ny = cy + dy, nz = cz + dz
      if (!aerLiber(nx, ny, nz)) continue
      const nk = cheieCelula(nx, ny, nz)
      if (parinte.has(nk)) continue
      if (!esteAcoperitaCuHotar(r, nx, ny, nz, hotar)) {
        const drum: number[] = []
        for (let p = k; p !== -1; p = parinte.get(p)!) drum.push(p)
        drum.reverse()
        return { inchisa: false, volum: parinte.size, scurgere: { x: nx, y: ny, z: nz }, dinainte: { x: cx, y: cy, z: cz }, drum }
      }
      parinte.set(nk, k)
      coada.push(nk)
    }
  }
  return { inchisa: cap >= coada.length, volum: parinte.size, scurgere: null, dinainte: null, drum: [] }
}

/** Acoperită, cu ușile ipotetice ca hotar (o ușă pusă peste un gol fără buiandrug acoperă doar ce e sub ea — nimic, e pe podea). */
function esteAcoperitaCuHotar(r: CititorCamere, x: number, y: number, z: number, hotar: ReadonlySet<number>): boolean {
  if (esteAcoperita(r, x, y, z)) return true
  for (let zz = z + 1; zz <= z + 64; zz++) if (hotar.has(cheieCelula(x, y, zz))) return true
  return false
}

/**
 * SUS sau LATERAL, după coloana scurgerii L: se umple ORIZONTAL cerul de la cota lui L (hotar = solid
 * sau aer acoperit). Închis în cel mult 4.096 de celule ⇒ gaură în acoperiș; altfel deschidere în perete.
 * Gaura din acoperiș: celula lui L de la cea mai înaltă cotă la care un vecin orizontal mai e acoperit
 * (planul acoperișului din jur).
 */
function clasifica(r: CititorCamere, L: Celula): { directie: 'SUS' | 'LATERAL'; gaura: Celula } {
  const vazut = new Set<number>([cheieCelula(L.x, L.y, L.z)])
  const coada: Celula[] = [L]
  let inchisa = true
  for (let i = 0; i < coada.length; i++) {
    if (coada.length > 4096) { inchisa = false; break }
    const c = coada[i]!
    for (const [dx, dy] of LAT) {
      const nx = c.x + dx, ny = c.y + dy
      if (!esteCer(r, nx, ny, L.z)) continue
      const k = cheieCelula(nx, ny, L.z)
      if (vazut.has(k)) continue
      vazut.add(k)
      coada.push({ x: nx, y: ny, z: L.z })
    }
  }
  if (!inchisa) return { directie: 'LATERAL', gaura: L }
  // Planul găurii: cel mai înalt vârf al coloanelor vecine cu L (acoperișul din jur, gura unui puț).
  // Căutat printre celulele ACOPERITE ieșea podeaua: hotarul însuși nu e acoperit.
  let h = L.z
  for (const [dx, dy] of LAT) {
    const v = varfLa(r, L.x + dx, L.y + dy)
    if (Number.isFinite(v) && v > h) h = v
  }
  return { directie: 'SUS', gaura: { x: L.x, y: L.y, z: h } }
}

/**
 * Golul de ușă la celula c, pe direcția de trecere (dx, dy): coloana de aer de la podea în sus cât
 * timp ambii vecini perpendiculari sunt pline (zidul), de 1–3 niveluri, lată de 1 sau 2 coloane,
 * cu podea dedesubt. Întoarce celulele golului, sau null.
 */
function golDeUsa(r: CititorCamere, c: Celula, dx: number, dy: number): Celula[] | null {
  if (!esteAer(r, c.x, c.y, c.z)) return null
  const px = dy, py = dx // perpendicular pe trecere
  const plin = (x: number, y: number, z: number): boolean => !esteAer(r, x, y, z)
  // coborî până la podea, cât timp e aer
  let zlo = c.z
  while (esteAer(r, c.x, c.y, zlo - 1) && c.z - zlo < 3) zlo--
  const sub = materialAt(r.t, c.x, c.y, zlo - 1)
  if (!sub.ok || !ePodea(sub.value)) return null
  const coloana = (x: number, y: number, maLatura: number): number => {
    // câte niveluri de la zlo în sus: aer, cu zid pe latura `maLatura` (1 = +perp, -1 = -perp, 0 = ambele)
    let h = 0
    for (let z = zlo; z < zlo + 4; z++) {
      if (!esteAer(r, x, y, z)) break
      const a = plin(x + px, y + py, z)
      const b = plin(x - px, y - py, z)
      if (maLatura === 0 ? !(a && b) : maLatura === 1 ? !a : !b) break
      h++
    }
    return h
  }
  const h1 = coloana(c.x, c.y, 0)
  if (h1 >= 1 && h1 <= 3 && c.z < zlo + h1) {
    const out: Celula[] = []
    for (let z = zlo; z < zlo + h1; z++) out.push({ x: c.x, y: c.y, z })
    return out
  }
  // Lat de 2: c are zid pe o parte, vecinul din cealaltă parte are zid dincolo.
  for (const s of [1, -1] as const) {
    if (!plin(c.x - s * px, c.y - s * py, c.z)) continue
    const vx = c.x + s * px, vy = c.y + s * py
    const ha = coloana(c.x, c.y, -s)
    const hb = coloana(vx, vy, s)
    const h = Math.min(ha, hb)
    if (h >= 1 && h <= 3 && ha === hb && c.z < zlo + h) {
      const out: Celula[] = []
      for (let z = zlo; z < zlo + h; z++) out.push({ x: c.x, y: c.y, z }, { x: vx, y: vy, z })
      return out
    }
  }
  return null
}

/** Câte coloane are un gol (1 sau 2). */
function latimeGol(g: readonly Celula[]): number {
  return new Set(g.map((c) => c.y * WORLD_CELLS + c.x)).size
}

/** Ușile de pe hotarul celulelor date: celule USA vecine, grupate pe componente 6-conexe. */
function numaraUsi(t: Terrain, celule: readonly number[]): number {
  const usi = new Set<number>()
  for (const k of celule) {
    const { x, y, z } = decodeazaCelula(k)
    for (const [dx, dy, dz] of D6) {
      const m = materialAt(t, x + dx, y + dy, z + dz)
      if (m.ok && m.value === Material.USA) usi.add(cheieCelula(x + dx, y + dy, z + dz))
    }
  }
  let grupuri = 0
  const vazut = new Set<number>()
  for (const k of [...usi].sort((a, b) => a - b)) {
    if (vazut.has(k)) continue
    grupuri++
    const stiva = [k]
    vazut.add(k)
    while (stiva.length > 0) {
      const { x, y, z } = decodeazaCelula(stiva.pop()!)
      for (const [dx, dy, dz] of D6) {
        const nk = cheieCelula(x + dx, y + dy, z + dz)
        if (vazut.has(nk)) continue
        const m = materialAt(t, x + dx, y + dy, z + dz)
        if (!m.ok || m.value !== Material.USA) continue
        vazut.add(nk)
        stiva.push(nk)
      }
    }
  }
  return grupuri
}

function podeaPeNiveluri(t: Terrain, celule: readonly number[]): [number, number][] {
  const pe = new Map<number, number>()
  for (const k of celule) {
    const { x, y, z } = decodeazaCelula(k)
    const jos = materialAt(t, x, y, z - 1)
    if (jos.ok && jos.value !== Material.AER) pe.set(z, (pe.get(z) ?? 0) + 1)
  }
  return [...pe.entries()].sort((a, b) => a[0] - b[0])
}

/**
 * Explicația pentru celula de AER (x, y, z): încăpere (cu volum, uși, podea), cer, sau spațiu
 * acoperit deschis — cu scurgerea cea mai apropiată, direcția ei și ușile care l-ar închide.
 */
export function explicaCelula(t: Terrain, idx: IndexCamere, x: number, y: number, z: number): Explicatie {
  const r = cititorCamere(t)
  if (!esteAer(r, x, y, z)) return { fel: 'NU_E_AER' }
  if (!esteAcoperita(r, x, y, z)) return { fel: 'CER' }
  const c = componentaLa(idx, x, y, z)
  if (c && esteIncapere(c)) {
    const celule = celuleComponentei(idx, c)
    return { fel: 'INCAPERE', volum: c.volum, ancora: c.ancora, usi: numaraUsi(t, celule), podea: podeaPeNiveluri(t, celule) }
  }
  const volum = c ? c.volum : 0
  const prima = inunda(r, x, y, z, new Set())
  if (prima.scurgere === null || prima.dinainte === null) {
    // Scurgerea e dincolo de plafonul de siguranță (o mină imensă): se spune doar atât. (Închisă
    // aici, deși indexul zice deschisă, ar însemna un index care nu e la zi — nu se întâmplă în
    // afara tickului.)
    return { fel: 'DEPARTE', volum }
  }
  const { directie, gaura } = clasifica(r, prima.scurgere)
  // Ușile: până la 4 goluri, fiecare pe drumul spre scurgerea de atunci; promisiunea se verifică.
  const hotar = new Set<number>()
  const usi: Celula[] = []
  let curenta = prima
  let volumCuUsi: number | null = null
  const start = cheieCelula(x, y, z)
  // Și când scurgerea e SUS: o pivniță legată de un coridor cu puț are golul ei pe drum înaintea
  // puțului. O gaură în acoperișul încăperii întrebate n-are nicio îngustare pe drum: nicio ușă.
  {
    for (let pas = 0; pas < 4; pas++) {
      if (curenta.scurgere === null || curenta.dinainte === null) break
      // Golul se caută pe drum DINSPRE celula întrebată, nu dinspre scurgere: 16 pivnițe legate de
      // un coridor primeau altfel ușa la intrarea coridorului — o singură încăpere mare, opusul
      // intenției (JUC-2). Și doar o ÎNGUSTARE: celula de dinaintea golului nu e ea însăși într-un
      // gol pe aceeași direcție — altfel o pivniță lată de 2 ar primi uși în mijloc.
      const drum = [...curenta.drum.map((k) => decodeazaCelula(k)), curenta.scurgere]
      let gol: Celula[] | null = null
      for (let i = 1; i < drum.length && gol === null; i++) {
        const a = drum[i - 1]!
        const b = drum[i]!
        if (a.z !== b.z) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const g = golDeUsa(r, b, dx, dy)
        if (!g) continue
        const inainte = golDeUsa(r, a, dx, dy)
        if (inainte !== null && latimeGol(inainte) <= latimeGol(g)) continue
        if (g.some((c) => cheieCelula(c.x, c.y, c.z) === start || hotar.has(cheieCelula(c.x, c.y, c.z)))) continue
        gol = g
      }
      if (!gol) break
      for (const g of gol) {
        hotar.add(cheieCelula(g.x, g.y, g.z))
        usi.push(g)
      }
      const dupa = inunda(r, x, y, z, hotar)
      if (dupa.inchisa) {
        volumCuUsi = dupa.volum
        break
      }
      if (dupa.scurgere === null) break
      curenta = dupa
    }
  }
  return {
    fel: 'DESCHISA',
    volum,
    scurgere: prima.scurgere,
    dinainte: prima.dinainte,
    directie,
    gaura,
    pasi: prima.drum.length,
    usiPropuse: volumCuUsi === null ? [] : usi,
    volumCuUsi,
  }
}

/**
 * Celulele de cer de la nivelul z vecine lateral cu aer acoperit al unei componente NESIGILATE: pe
 * aici iese aerul, la nivelul văzut. Pentru overlay. Ordinea: a celulelor din index, fără dubluri.
 */
export function scurgeriLaNivel(t: Terrain, idx: IndexCamere, z: number): Celula[] {
  const r = cititorCamere(t)
  const vazut = new Set<number>()
  const out: Celula[] = []
  celuleLaNivel(idx, z, (x, y, c: Componenta) => {
    if (esteIncapere(c)) return
    for (const [dx, dy] of LAT) {
      const nx = x + dx, ny = y + dy
      if (nx < 0 || ny < 0 || nx >= WORLD_CELLS || ny >= WORLD_CELLS) continue
      if (!esteCer(r, nx, ny, z)) continue
      const k = cheieCelula(nx, ny, z)
      if (vazut.has(k)) continue
      vazut.add(k)
      out.push({ x: nx, y: ny, z })
    }
  })
  return out
}
