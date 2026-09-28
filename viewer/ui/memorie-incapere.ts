/**
 * Memoria inspectorului pentru „De ce nu e încăpere?" — PURĂ: fără DOM, fără three; ceasul e injectat.
 *
 * Explicația inundă până la scurgere și propune ușile verificându-le cu încă până la 4 inundări: pe o
 * mină mare deschisă, 0,1–1,6 s pe apel. Inspectorul se reîmprospătează la 4 Hz, iar memoria veche era
 * cheiată pe `terrain.editari` — un contor GLOBAL: orice săpătură, oriunde, o invalida, și inspectorul
 * deschis pe o mină bloca pagina 43% din timp (recenzia încăperilor, EXP-4; ECR-3 pe o sală de 15,5k m³).
 *
 * ## Cheia: celula + amprenta pe jurnal
 *
 * Ce citește explicația stă lângă componenta întrebată: inundarea vizitează doar aerul ei acoperit, iar
 * scurgerea, golurile de ușă și coloanele vecine gurii (cota găurii) sunt la cel mult 2 celule de ea. O
 * celulă își schimbă aerul sau acoperirea doar printr-o editare în coloana ei (lema din camere.ts), deci
 * memoria e bună cât timp nicio editare din `terrain.jurnal` de după calcul nu cade în blocurile de 16
 * ale componentei (și al celulei selectate), lărgite cu un bloc. Peste `JURNAL_CAP` editări nevăzute,
 * jurnalul nu mai spune ce s-a schimbat: se reface.
 *
 * Verificatorul EXP-4 a pus amprenta PESTE cheia (epoca, celula) și a măsurat-o cu 0 răspunsuri
 * învechite. Epoca e însă globală: o săpătură sub acoperiș în ALTĂ componentă o mută, iar inspectorul
 * deschis pe o sală refăcea explicația la 4 Hz cât sapă pionii altundeva (ECR-3: 13,9 ms mediana, 37 ms
 * vârful, pe fiecare reîmprospătare). Fără epocă, pe fuzz-ul de aici (editări aproape și într-o a doua
 * hală acoperită, la 45 m): 45.123–45.519 reutilizări, 0 învechite, față de 3.122–3.341 cu epoca; fără
 * marginea de un bloc, 18 învechite (fuzz-ul are dinți). Doar epoca nu ajungea nici ea: zidirea unui bloc
 * pe sol lângă gura unui puț schimbă cota găurii fără să atingă aer acoperit (verificatorul, gaura.ts).
 *
 * ## Frâna
 *
 * Când minerii lucrează CHIAR în mina întrebată, fiecare editare invalidează memoria: 40 de recalculări
 * în 10 s, 17 s blocați la 101k m³. Explicația nu se reface mai des de max(250 ms, 20 × costul ultimului
 * calcul) — cel mult 5% din timp —, iar până atunci inspectorul arată răspunsul de dinainte. Un clic al
 * jucătorului (selecție nouă, „Pune ușa", orice buton din inspector) sare frâna, ca înainte.
 */

import { Piesa } from '../../src/sim/state.ts'
import type { World } from '../../src/sim/state.ts'
import { Desemnare, desemnareLaCelula } from '../../src/sim/desemnari.ts'
import { componentaLa, decodeazaFelie, FELIE } from '../../src/sim/camere.ts'
import type { Celula } from '../../src/sim/camere-explica.ts'
import { JURNAL_CAP } from '../../src/sim/terrain/terrain.ts'
import { incaperea } from './model.ts'
import type { IncapereLa, NormalaFetei } from './model.ts'

/** Cel mai des cât se reface explicația, fără un clic: o dată la 250 ms (reîmprospătarea inspectorului). */
export const FRANA_MIN_MS = 250
/** ...sau o dată la de atâtea ori costul ultimului calcul: explicația ia cel mult 1/20 din timp. */
export const FRANA_COSTURI = 20

/** Ce știe memoria despre lumea în care a calculat. `editari` înaintează cât rămâne valabilă. */
export interface AmprentaIncaperii {
  editari: number
  /** Celula selectată și normala feței atinse (alt aer întrebat pe altă față: EXP-6). */
  readonly x: number
  readonly y: number
  readonly z: number
  readonly n: NormalaFetei | null
  /** Blocurile (de FELIE celule) din care o editare o invalidează, cu margini cu tot. */
  readonly bx0: number
  readonly bx1: number
  readonly by0: number
  readonly by1: number
}

/**
 * Amprenta unui calcul pentru celula selectată (x, y, z), al cărui răspuns e `inc`: blocurile componentei
 * întrebate (celula explicată e deasupra sau dedesubtul celei selectate) și blocul celulei selectate,
 * plus un bloc de jur împrejur.
 */
export function amprentaIncaperii(w: World, x: number, y: number, z: number, inc: IncapereLa | null, n: NormalaFetei | null = null): AmprentaIncaperii {
  let bx0 = Math.floor(x / FELIE)
  let bx1 = bx0
  let by0 = Math.floor(y / FELIE)
  let by1 = by0
  const c = inc === null ? null : componentaLa(w.camere, inc.celula.x, inc.celula.y, inc.celula.z)
  if (c !== null) {
    for (const b of c.bucati) {
      const f = decodeazaFelie(w.camere.bFelie[b]!)
      if (f.bx < bx0) bx0 = f.bx
      if (f.bx > bx1) bx1 = f.bx
      if (f.by < by0) by0 = f.by
      if (f.by > by1) by1 = f.by
    }
  }
  return { editari: w.terrain.editari, x, y, z, n, bx0: bx0 - 1, bx1: bx1 + 1, by0: by0 - 1, by1: by1 + 1 }
}

/**
 * E încă bun răspunsul calculat sub amprenta `a`? Nicio editare nouă în blocurile ei.
 * Când e bun, `a.editari` înaintează: editările citite nu se mai citesc o dată.
 */
export function amprentaValabila(w: World, a: AmprentaIncaperii): boolean {
  const t = w.terrain
  if (t.editari - a.editari > JURNAL_CAP || t.editari < a.editari) return false
  for (let i = a.editari; i < t.editari; i++) {
    const j = (i % JURNAL_CAP) * 3
    const bx = Math.floor(t.jurnal[j]! / FELIE)
    const by = Math.floor(t.jurnal[j + 1]! / FELIE)
    if (bx >= a.bx0 && bx <= a.bx1 && by >= a.by0 && by <= a.by1) return false
  }
  a.editari = t.editari
  return true
}

/** Ușile propuse de explicație, față de desemnările de acum. */
export interface UsilePropuse {
  /** Celulele fără nicio desemnare: ce pune „Pune ușa". */
  readonly lipsa: readonly Celula[]
  /** Toate celulele propuse au deja desemnarea de USĂ: se zidesc, nu mai e nimic de pus. */
  readonly desemnata: boolean
}

/**
 * Starea ușilor propuse. Butonul „Pune ușa" rămânea după clic, cu același text, iar al doilea clic nu
 * făcea nimic și nu spunea nimic (recenzia încăperilor, ECR-12).
 */
export function usilePropuse(w: World, inc: IncapereLa | null): UsilePropuse {
  if (inc === null || inc.e.fel !== 'DESCHISA' || inc.e.usiPropuse.length === 0) return { lipsa: [], desemnata: false }
  const d = w.desemnari
  const lipsa: Celula[] = []
  let usa = 0
  for (const u of inc.e.usiPropuse) {
    const ds = desemnareLaCelula(d, u.x, u.y, u.z)
    if (ds === -1) lipsa.push(u)
    else if (d.kind[ds] === Desemnare.CONSTRUIESTE && d.piesa[ds] === Piesa.USA) usa++
  }
  return { lipsa, desemnata: usa === inc.e.usiPropuse.length }
}

function aceeasiNormala(a: NormalaFetei | null, b: NormalaFetei | null): boolean {
  return a === null || b === null ? a === b : a.x === b.x && a.y === b.y && a.z === b.z
}

export interface MemorieIncapere {
  /** Încăperea pentru celula selectată (fața atinsă: `n`); `clic` = o acțiune a jucătorului, care sare frâna. */
  ia(w: World, x: number, y: number, z: number, clic: boolean, n?: NormalaFetei | null): IncapereLa | null
  /** Câte calcule s-au făcut (testele; Diagnosticul). */
  calcule(): number
  /** Se schimbă la fiecare calcul: cheia de redesenare a inspectorului. */
  versiune(): number
}

/**
 * `ceas` în ms (performance.now în pagină, un ceas fals în teste); `calculeaza` e `incaperea` din
 * model.ts — injectabil ca testele frânei să aleagă costul.
 */
export function creeazaMemorieIncapere(
  ceas: () => number,
  calculeaza: (w: World, x: number, y: number, z: number, n: NormalaFetei | null) => IncapereLa | null = incaperea,
): MemorieIncapere {
  let amprenta: AmprentaIncaperii | null = null
  let raspuns: IncapereLa | null = null
  let urmatorLa = Number.NEGATIVE_INFINITY
  let calcule = 0
  return {
    ia(w, x, y, z, clic, n = null) {
      const aceeasi = amprenta !== null && amprenta.x === x && amprenta.y === y && amprenta.z === z && aceeasiNormala(amprenta.n, n)
      if (aceeasi && amprentaValabila(w, amprenta!)) return raspuns
      const acum = ceas()
      if (aceeasi && !clic && acum < urmatorLa) return raspuns
      raspuns = calculeaza(w, x, y, z, n)
      const cost = ceas() - acum
      amprenta = amprentaIncaperii(w, x, y, z, raspuns, n)
      urmatorLa = acum + Math.max(FRANA_MIN_MS, FRANA_COSTURI * cost)
      calcule++
      return raspuns
    },
    calcule: () => calcule,
    versiune: () => calcule,
  }
}
