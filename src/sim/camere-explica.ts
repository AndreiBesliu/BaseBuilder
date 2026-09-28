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
  esteAerAcoperit,
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

/**
 * Câte celule vizitează o explicație, cel mult, în TOATE inundările ei: prima și verificările
 * ușilor, împreună (siguranță: o mină imensă deschisă nu blochează UI-ul). Recenzia (EXP-4) a măsurat
 * plafonul vechi, 2^18 celule PE inundare, cu până la 5 inundări: 0,5–1,6 s pe o mină de 140–250k m³,
 * sincron în cadrul inspectorului. Peste buget, prima inundare dă DEPARTE; o verificare de ușă, niciun
 * sfat (ușile propuse se pierd — prețul, măsurat, pe minele de peste ~30k m³).
 */
export const EXPLICA_BUGET = 1 << 16

/** Cât umple clasificarea, cel mult, cerul de la cota scurgerii (EXP-2). */
const CER_PLAFON = 4096

/** Cel mai mic nivel de podea numărat (m²), când încăperea are unul cel puțin atât de mare (EXP-7). */
const PODEA_NIVEL_MIN = 4

/** Ce a costat o explicație: celulele scoase din coadă și inundările, toate. */
export interface CostExplicatie {
  celule: number
  inundari: number
}

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
 * Se oprește la primul cer întâlnit (cea mai apropiată scurgere), epuizează componenta, sau rămâne
 * fără buget — bugetul e al EXPLICAȚIEI, împărțit de toate inundările ei (`cost.celule`).
 */
function inunda(r: CititorCamere, x: number, y: number, z: number, hotar: ReadonlySet<number>, cost: CostExplicatie): Inundare {
  cost.inundari++
  const start = cheieCelula(x, y, z)
  const parinte = new Map<number, number>([[start, -1]])
  const coada: number[] = [start]
  let cap = 0
  const aerLiber = (a: number, b: number, c: number): boolean => esteAer(r, a, b, c) && !hotar.has(cheieCelula(a, b, c))
  while (cap < coada.length) {
    if (cost.celule >= EXPLICA_BUGET) break
    cost.celule++
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
 * SUS sau LATERAL, după VECINII coloanei scurgerii L, la cota ei: e o gaură deasupra dacă L stă în
 * amprenta aerului acoperit (cel puțin doi vecini laterali acoperiți — gaura din acoperișul unei
 * încăperi, DEF-4) sau dacă n-are niciun vecin de cer (un puț: de jur împrejur doar plin și aerul
 * de unde vine). Altfel aerul iese lateral, printr-un gol.
 *
 * Prima formă (a verificatorului JUC-1) umplea orizontal cerul de la cota lui L și numea „gaură în
 * acoperiș" orice cer închis în 4.096 de celule. Pe ecran, o casă cu golul ușii deschis într-o
 * căldare (platoul unui joc nou, închis de dealuri) primea „gaură în acoperiș, cu 2 m mai sus" —
 * cerul de la cota ușii era mărginit de relief. Regula locală rămâne; umplerea se folosește doar
 * după căutarea ușilor, când aceasta n-a găsit niciun gol (`cerInchisDeAcoperis`, EXP-2).
 */
function clasifica(r: CititorCamere, L: Celula, dinainte: Celula): { directie: 'SUS' | 'LATERAL'; gaura: Celula } {
  let acoperite = 0
  let cer = 0
  for (const [dx, dy] of LAT) {
    if (esteAerAcoperit(r, L.x + dx, L.y + dy, L.z)) acoperite++
    else if (esteCer(r, L.x + dx, L.y + dy, L.z)) cer++
  }
  if (acoperite < 2 && cer > 0) return { directie: 'LATERAL', gaura: L }
  return { directie: 'SUS', gaura: gauraSus(r, L, dinainte) }
}

/**
 * Celula găurii de SUS: coloana lui L, în planul acoperișului care acoperea `dinainte` — ultima celulă
 * acoperită de pe drum, vecina laterală a lui L (gura puțului, marginea acoperișului). Căutat printre
 * celulele ACOPERITE ieșea podeaua: hotarul însuși nu e acoperit. Iar cel mai înalt vârf al celor
 * patru coloane vecine (forma dinainte) urca lângă un turn în vârful turnului: „cu 7 m mai sus"
 * pentru o gaură la 2 m (EXP-3).
 */
function gauraSus(r: CititorCamere, L: Celula, dinainte: Celula): Celula {
  const v = varfLa(r, dinainte.x, dinainte.y)
  return { x: L.x, y: L.y, z: Number.isFinite(v) && v > L.z ? v : L.z }
}

/**
 * Cerul de la cota lui L, umplut ORIZONTAL (cel mult `CER_PLAFON` celule): e o gaură în acoperiș dacă
 * se închide și cel puțin un sfert din hotarul lui e aer acoperit — marginea acoperișului. Regula
 * locală a lui `clasifica` vede doar cei patru vecini ai lui L și greșea pe acoperișul neterminat
 * (jumătate de acoperiș, o fâșie lipsă lângă zid: L are un singur vecin acoperit): 11,5% din
 * întrebări pe un acoperiș zidit celulă cu celulă, 45,9% la început (EXP-2). O curte sau o căldare au
 * în hotar doar golul ușii acoperit — sub un sfert. Singură, umplerea greșea însă alte cazuri
 * (verificatorul EXP-2): o casă cu streașină și golul ușii deschis într-o curte închisă ieșea SUS;
 * de aceea se cere doar când pe drum nu e niciun gol de ușă.
 */
function cerInchisDeAcoperis(r: CititorCamere, L: Celula): boolean {
  const vazut = new Set<number>([cheieCelula(L.x, L.y, L.z)])
  const coada: Celula[] = [L]
  let acoperit = 0
  let plin = 0
  for (let i = 0; i < coada.length; i++) {
    if (coada.length > CER_PLAFON) return false
    const c = coada[i]!
    for (const [dx, dy] of LAT) {
      const nx = c.x + dx, ny = c.y + dy
      if (esteCer(r, nx, ny, L.z)) {
        const k = cheieCelula(nx, ny, L.z)
        if (!vazut.has(k)) {
          vazut.add(k)
          coada.push({ x: nx, y: ny, z: L.z })
        }
      } else if (esteAerAcoperit(r, nx, ny, L.z)) acoperit++
      else plin++
    }
  }
  return acoperit * 4 >= acoperit + plin
}

/**
 * Ce stie cautarea unui gol despre lume: ce e aer (unde s-ar pune usa) si pe ce se sta. Pe terenul de
 * acum pentru explicatie; pe „lumea planului" (teren + piesele desemnate) pentru unealta Usa — un
 * jucator isi deseneaza de obicei toata casa, cu golul usii, inainte sa se zideasca ceva.
 */
export interface LumeGol {
  aer(x: number, y: number, z: number): boolean
  podea(x: number, y: number, z: number): boolean
}

/** Lumea golului pe terenul de acum. */
function lumeTeren(r: CititorCamere): LumeGol {
  return {
    aer: (x, y, z) => esteAer(r, x, y, z),
    podea: (x, y, z) => { const m = materialAt(r.t, x, y, z); return m.ok && ePodea(m.value) },
  }
}

/**
 * Golul de ușă la celula c, pe direcția de trecere (dx, dy): coloana de aer de la podea în sus cât
 * timp ambii vecini perpendiculari sunt pline (zidul), de 1–3 niveluri, lată de 1 sau 2 coloane,
 * cu podea dedesubt și aer la podea de o parte și de alta a trecerii. Întoarce celulele golului, sau
 * null.
 */
export function golDeUsa(q: LumeGol, c: Celula, dx: number, dy: number): Celula[] | null {
  return ingustare(q, c, dx, dy, true)
}

/**
 * Forma golului (zid pe ambele laturi, de la podea în sus), cu sau fără cererea de TRECERE. Fără ea
 * răspunde la „c e deja într-o îngustare?" — celula de lângă zidul din fundul unei pivnițe late de 2
 * nu se trece (zidul e în spatele ei), dar e tot în lățimea pivniței.
 */
function ingustare(q: LumeGol, c: Celula, dx: number, dy: number, cuTrecere: boolean): Celula[] | null {
  if (!q.aer(c.x, c.y, c.z)) return null
  const px = dy, py = dx // perpendicular pe trecere
  const plin = (x: number, y: number, z: number): boolean => !q.aer(x, y, z)
  // coborî până la podea, cât timp e aer
  let zlo = c.z
  while (q.aer(c.x, c.y, zlo - 1) && c.z - zlo < 3) zlo--
  if (!q.podea(c.x, c.y, zlo - 1)) return null
  // Un gol se TRECE: aer la podea de o parte și de alta a trecerii (în coloana lui c; la un gol lat de
  // 2, cealaltă coloană poate avea un stâlp în față). O groapă în sol (sau capătul unui șanț, fundul
  // unui puț) are plin pe două laturi opuse și podea dedesubt, dar se trece doar în sus: unealta Ușă
  // punea acolo o „ușă" (EXP-8, ECR-9).
  if (cuTrecere && !(q.aer(c.x + dx, c.y + dy, zlo) && q.aer(c.x - dx, c.y - dy, zlo))) return null
  const coloana = (x: number, y: number, maLatura: number): number => {
    // câte niveluri de la zlo în sus: aer, cu zid pe latura `maLatura` (1 = +perp, -1 = -perp, 0 = ambele)
    let h = 0
    for (let z = zlo; z < zlo + 4; z++) {
      if (!q.aer(x, y, z)) break
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

/**
 * Unde se pune o ușă, pentru un clic pe celula (x, y, z): golul de perete care o conține (toate
 * celulele lui, de la podea în sus: un clic, o ușă întreagă — o jumătate de ușă lasă încăperea
 * deschisă, JUC-6), sau gaura dintr-o placă (chepengul: fiecare celulă a găurii, cel mult 4 —
 * gaura unei scări desparte altfel etajele în aceeași încăpere, JUC-5). Altfel null.
 */
export function celuleUsii(q: LumeGol, x: number, y: number, z: number): Celula[] | null {
  if (!q.aer(x, y, z)) return null
  // Întâi gaura din placă: deasupra ultimei trepte, golDeUsa lua placa drept zid și punea TĂCUT o
  // jumătate de chepeng (o celulă din două), iar etajele rămâneau o încăpere (verificatorul EXP-5).
  const h = gauraDinPlaca(q, x, y, z)
  if (h) return h
  for (const [dx, dy] of [[0, 1], [1, 0]] as const) {
    const g = golDeUsa(q, { x, y, z }, dx, dy)
    if (g) return g
  }
  return null
}

/**
 * Gaura dintr-o placă: aerul de la cota z, închis lateral de plin în cel mult 4 celule, cu aer
 * deasupra găurii și măcar o vecină PLACĂ (plin cu aer deasupra). Un plin fără aer deasupra e un zid
 * care urcă peste placă — la o casă cu etaj, orice gaură de scară lipită de perete sau în colț. Forma
 * dinainte cerea placă pe TOATE laturile și refuza scara de lângă perete (EXP-5).
 */
function gauraDinPlaca(q: LumeGol, x: number, y: number, z: number): Celula[] | null {
  const gaura: Celula[] = [{ x, y, z }]
  const vazut = new Set<number>([cheieCelula(x, y, z)])
  let placa = 0
  for (let i = 0; i < gaura.length; i++) {
    const c = gaura[i]!
    if (!q.aer(c.x, c.y, c.z + 1)) return null
    for (const [dx, dy] of LAT) {
      const nx = c.x + dx, ny = c.y + dy
      if (q.aer(nx, ny, z)) {
        const k = cheieCelula(nx, ny, z)
        if (vazut.has(k)) continue
        vazut.add(k)
        gaura.push({ x: nx, y: ny, z })
        if (gaura.length > 4) return null
      } else if (q.aer(nx, ny, z + 1)) {
        placa++
      }
    }
  }
  if (placa === 0) return null
  return gaura.sort((a, b) => a.y - b.y || a.x - b.x)
}

/**
 * Latura unui gol e ZID: solidul de la cota z, 4-conex în plan, are cel puțin 3 celule. Un stâlp (o
 * grindă) la 1–2 celule de zid face o „îngustare" între el și zid: căutarea ușilor o lua drept gol și
 * propunea uși care închid colțul celulei întrebate — 2–4 m³ în loc de 48, pe 92 din 1200 de întrebări
 * într-o casă 7×7 cu un stâlp (EXP-1). Doar pentru explicație: în unealta Ușă locul îl alege jucătorul.
 */
function zid(q: LumeGol, x: number, y: number, z: number): boolean {
  if (q.aer(x, y, z)) return false
  const vazut = new Set<number>([cheieCelula(x, y, z)])
  const stiva: [number, number][] = [[x, y]]
  while (stiva.length > 0) {
    const [a, b] = stiva.pop()!
    for (const [dx, dy] of LAT) {
      const k = cheieCelula(a + dx, b + dy, z)
      if (vazut.has(k) || q.aer(a + dx, b + dy, z)) continue
      vazut.add(k)
      if (vazut.size >= 3) return true
      stiva.push([a + dx, b + dy])
    }
  }
  return false
}

/**
 * Un montant: solidul mic de la (x, y, z) (sub 3 celule) dintre două goluri ale ACELUIAȘI zid. Dincolo
 * de el, pe direcția zidului (ex, ey), vine un gol de 1–2 celule și apoi zidul care continuă linia —
 * dar nu un zid văzut din capăt (plin în fața și în spatele lui pe direcția trecerii (dx, dy)): acela
 * e peretele lateral al încăperii, iar „montantul" e un stâlp în mijlocul ei. Fără montant, două uși
 * despărțite de o celulă de zid rămâneau fără sfat (verificatorul EXP-1).
 */
function montant(q: LumeGol, x: number, y: number, z: number, ex: number, ey: number, dx: number, dy: number): boolean {
  if (!q.aer(x + ex, y + ey, z)) return false
  for (let i = 2; i <= 3; i++) {
    const ax = x + i * ex, ay = y + i * ey
    if (q.aer(ax, ay, z)) continue
    const dinCap = !q.aer(ax + dx, ay + dy, z) && !q.aer(ax - dx, ay - dy, z)
    return !dinCap && zid(q, ax, ay, z)
  }
  return false
}

/** Laturile golului `g` (trecerea pe (dx, dy)) sunt zid sau montant, la fiecare nivel. */
function golInZid(q: LumeGol, g: readonly Celula[], dx: number, dy: number): boolean {
  const px = dy, py = dx
  const chei = new Set(g.map((c) => cheieCelula(c.x, c.y, c.z)))
  for (const c of g) {
    for (const s of [1, -1] as const) {
      const x = c.x + s * px, y = c.y + s * py
      if (chei.has(cheieCelula(x, y, c.z))) continue
      if (!zid(q, x, y, c.z) && !montant(q, x, y, c.z, s * px, s * py, dx, dy)) return false
    }
  }
  return true
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

/**
 * Podeaua pe niveluri: [z, celule cu PODEA dedesubt (`ePodea`: nu ușa-chepeng, nu apa)], doar pe
 * nivelurile cu cel puțin `PODEA_NIVEL_MIN` celule — sau cu cât are cel mai mare nivel, dacă e mai
 * mic (o încăpere nu rămâne „fără podea" cât are vreuna). O scară e lată de 1–3 celule: aerul de
 * deasupra fiecărei trepte e un „nivel" de 1–3 celule, și o casă cu etaj și două trepte ieșea „podea
 * pe 4 niveluri, 48 m²" în loc de „23 m² jos · 23 m² sus" (JUC-12, EXP-7). Treptele țin de nivelul de
 * dedesubt: sunt scara lui, nu podea nouă, deci nu se adaugă la niciun nivel.
 */
function podeaPeNiveluri(t: Terrain, celule: readonly number[]): [number, number][] {
  const pe = new Map<number, number>()
  for (const k of celule) {
    const { x, y, z } = decodeazaCelula(k)
    const jos = materialAt(t, x, y, z - 1)
    if (jos.ok && ePodea(jos.value)) pe.set(z, (pe.get(z) ?? 0) + 1)
  }
  const niveluri = [...pe.entries()].sort((a, b) => a[0] - b[0])
  const prag = Math.min(PODEA_NIVEL_MIN, niveluri.reduce((m, [, n]) => Math.max(m, n), 0))
  return niveluri.filter(([, n]) => n >= prag)
}

/**
 * Explicația pentru celula de AER (x, y, z): încăpere (cu volum, uși, podea), cer, sau spațiu
 * acoperit deschis — cu scurgerea cea mai apropiată, direcția ei și ușile care l-ar închide.
 * `cost` (opțional) primește ce a costat: celulele tuturor inundărilor, cel mult `EXPLICA_BUGET`.
 */
export function explicaCelula(t: Terrain, idx: IndexCamere, x: number, y: number, z: number, cost: CostExplicatie = { celule: 0, inundari: 0 }): Explicatie {
  cost.celule = 0
  cost.inundari = 0
  const r = cititorCamere(t)
  if (!esteAer(r, x, y, z)) return { fel: 'NU_E_AER' }
  if (!esteAcoperita(r, x, y, z)) return { fel: 'CER' }
  const c = componentaLa(idx, x, y, z)
  if (c && esteIncapere(c)) {
    const celule = celuleComponentei(idx, c)
    return { fel: 'INCAPERE', volum: c.volum, ancora: c.ancora, usi: numaraUsi(t, celule), podea: podeaPeNiveluri(t, celule) }
  }
  const volum = c ? c.volum : 0
  const prima = inunda(r, x, y, z, new Set(), cost)
  if (prima.scurgere === null || prima.dinainte === null) {
    // Scurgerea e dincolo de bugetul de siguranță (o mină imensă): se spune doar atât, cu volumul din
    // index. (Închisă aici, deși indexul zice deschisă, ar însemna un index care nu e la zi — nu se
    // întâmplă în afara tickului.)
    return { fel: 'DEPARTE', volum }
  }
  const L = prima.scurgere
  const dinainte = prima.dinainte
  let { directie, gaura } = clasifica(r, L, dinainte)
  // Ușile: până la 4 goluri, fiecare pe drumul spre scurgerea de atunci; promisiunea se verifică.
  const hotar = new Set<number>()
  const usi: Celula[][] = []
  let curenta = prima
  let volumCuUsi: number | null = null
  const start = cheieCelula(x, y, z)
  const lume = lumeTeren(r)
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
        const g = golDeUsa(lume, b, dx, dy)
        if (!g) continue
        if (!golInZid(lume, g, dx, dy)) continue
        const inainte = ingustare(lume, a, dx, dy, false)
        if (inainte !== null && latimeGol(inainte) <= latimeGol(g)) continue
        if (g.some((c) => cheieCelula(c.x, c.y, c.z) === start || hotar.has(cheieCelula(c.x, c.y, c.z)))) continue
        gol = g
      }
      if (!gol) break
      usi.push(gol)
      for (const g of gol) hotar.add(cheieCelula(g.x, g.y, g.z))
      const dupa = inunda(r, x, y, z, hotar, cost)
      if (dupa.inchisa) {
        volumCuUsi = dupa.volum
        break
      }
      if (dupa.scurgere === null) break
      curenta = dupa
    }
  }
  // Ușile de prisos: un gol de pe drum care nu trebuia închis (trecerea dintre zid și un stâlp aflat
  // în linie cu golul casei arată ca un montant) se scoate, dacă încăperea rămâne închisă și fără el —
  // cu verificare, pe același buget. Ultima ușă e mereu necesară: fără ea aerul ieșea. Pe o casă 7×7
  // cu un stâlp, 8 din 1200 de întrebări primeau altfel o ușă în plus (44 m³ în loc de 48).
  if (volumCuUsi !== null) {
    for (let i = usi.length - 2; i >= 0; i--) {
      const fara = new Set<number>()
      for (let j = 0; j < usi.length; j++) if (j !== i) for (const g of usi[j]!) fara.add(cheieCelula(g.x, g.y, g.z))
      const proba = inunda(r, x, y, z, fara, cost)
      if (!proba.inchisa) continue
      usi.splice(i, 1)
      volumCuUsi = proba.volum
    }
  }
  // LATERAL după regula locală, dar fără niciun gol de ușă pe drum: poate fi un acoperiș neterminat
  // (EXP-2). Decide cerul de la cota lui L, umplut orizontal.
  if (directie === 'LATERAL' && usi.length === 0 && cerInchisDeAcoperis(r, L)) {
    directie = 'SUS'
    gaura = gauraSus(r, L, dinainte)
  }
  return {
    fel: 'DESCHISA',
    volum,
    scurgere: L,
    dinainte,
    directie,
    gaura,
    pasi: prima.drum.length,
    usiPropuse: volumCuUsi === null ? [] : usi.flat(),
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
