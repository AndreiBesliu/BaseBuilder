/**
 * Alterarea hranei: pasul de 1 Hz (S24-27 t.3, research/hrana-t3.md §2–§4, commit-ul B). Primul EFECT al temperaturii:
 * hrana se strica peste prag, treptat, cu o rata care creste convex cu T; la prag si sub el, nimic.
 *
 * ## Modelul (§1)
 *
 * Proportional, fara varsta pe unitate: la fiecare pas, `S += q·λ(T)` pe fiecare morman PERISABIL (`rules.perisabil`), iar
 * unitatile intregi strinse (`k = min(q, floor(S/ONE))`) pleaca prin `scadeStricate` — cu EXACT `k·ONE` din S, nu cu regula
 * de despartire (STARE-4). Mana unui om nu se strica (decizia 4): pasul nu atinge mainile.
 *
 * ## Unde si cat de des (§2)
 *
 * - **La 1 Hz, dupa `pasTermic`**, pe o linie proprie in `tick` (world.ts): T-ul folosit e cel de DUPA pas, sub cer
 *   T_afara la tickul pasului. Faza e globala, ca a pasului termic (o lume incarcata paseste la aceleasi tickuri).
 * - **T-ul locului**: `loculCelulei` (temperatura.ts) — componenta → T-ul ei din stare; tocul unei usi → partea mai calda
 *   (`tTocului`); altfel T_afara. **Rata se evalueaza O DATA pe componenta si trecere** (J-3), o data pentru cer, si pe
 *   fiecare morman din toc. Componenta fara T (sau stampila nevalida) → mormanul SARE pasul, numarat (`faraT`, STARE-12).
 * - **Doua faze**: (1) pierderile TUTUROR mormanelor, pe cantitatea de la inceputul pasului — nimic din lume nu se schimba
 *   in faza asta, deci ordinea slotului nu conteaza; (2) `scadeStricate` pe lista strinsa, cu id-ul (nu slotul: o moarte
 *   reconciliata poate muta marfa), iar moartea → `reconciliazaTintaMoarta` (cine tinea mormanul isi incheie jobul ACUM).
 * - **La λ = 0 cu S ≥ ONE se realizeaza** (P14, STARE-7): un morman unit din doua parti calde si dus in pivnita nu tine
 *   unitati stricate de tot; pasul ruleaza oricum la fiecare secunda, rata 0 doar nu mai adauga nimic.
 *
 * ## Curba (§3)
 *
 * Tabelul din content (`rules.alterare`), cu λ-ul DERIVAT o data pe obiectul de reguli (`curbaReguli`) si interpolat pe λ
 * (`lambdaPeCurba`, content.ts — aceeasi functie ca validarea benzii moarte de la parsare).
 *
 * ## Costul (K05, pe contoare)
 *
 * `statAlterare`: la fiecare pas, mormanele evaluate == mormanele perisabile vii, iar evaluarile de rata == componentele
 * distincte + cerul + tocurile. Indexul de zone se murdareste doar cand s-ar schimba (`scadereaSchimbaIndexul`, zone.ts).
 */

import type { CurbaAlterare, Rules } from './content.ts'
import { curbaAlterarii, lambdaPeCurba } from './content.ts'
import type { World } from './state.ts'
import { ONE_ALTERARE } from './state.ts'
import { tAfara } from './clima.ts'
import { LOC_CER, LOC_TOC, loculCelulei, tDinStare, tTocului, verificaStampila } from './temperatura.ts'
import { scadeStricate, slotItem } from './iteme.ts'
import { lastJobReport, reconciliazaTintaMoarta } from './joburi.ts'

/** Contoarele pasului (TRANSIENT, in `w.ratiune`): nu intra in hash, nu se salveaza. */
export interface StatAlterare {
  /** Pasi de alterare rulati. */
  pasi: number
  /** Mormane perisabile vii evaluate, cumulat. */
  mormane: number
  /** Idem, in ultimul pas (K05: == mormanele perisabile vii). */
  mormaneUltimulPas: number
  /** Evaluari ale ratei (o data pe componenta si trecere, o data pentru cer, una pe morman din toc), cumulat. */
  evaluariRata: number
  /** Idem, in ultimul pas. */
  evaluariUltimulPas: number
  /** Mormane care au sarit pasul: componenta lor (sau un vecin al tocului) n-avea T. */
  faraT: number
  /** Unitati stricate de pas, cumulat (totalul salvat e `w.hranaStricata`). */
  stricate: number
  /** Mormane omorate de pas (stricate pana la ultima unitate). */
  morti: number
  /** Unitati stricate la λ = 0 (S ≥ ONE adus de o unire). */
  realizariFaraRata: number
}

const CURBE = new WeakMap<Rules, CurbaAlterare>()

/** λ-ul curbei pentru un obiect de reguli, derivat o data (tabelul, `ticksPerSecond`, `ziTicks`). */
export function curbaReguli(rules: Rules): CurbaAlterare {
  let c = CURBE.get(rules)
  if (c === undefined) {
    c = curbaAlterarii(rules.alterare.pierderePeMilionZilnic, rules.ticksPerSecond, rules.calendar.ziTicks)
    CURBE.set(rules, c)
  }
  return c
}

/** λ(T): cat se strica pe pasul de 1 Hz dintr-o unitate la T (Q16 °C), in 1/ONE. */
export function lambdaAlterare(rules: Rules, tQ16: number): number {
  return lambdaPeCurba(curbaReguli(rules), tQ16)
}

/** Contoarele pasului de alterare ale lumii. */
export function statAlterare(w: World): StatAlterare {
  return w.ratiune.statAlterare
}

/** Pasul de alterare de 1 Hz (vezi antetul). Il cheama doar `tick` (world.ts), dupa `pasTermic`. */
export function pasAlterare(w: World, rules: Rules): void {
  const it = w.iteme
  const st = w.ratiune.statAlterare
  st.pasi++
  st.mormaneUltimulPas = 0
  st.evaluariUltimulPas = 0
  const curba = curbaReguli(rules)
  const stampilaOk = verificaStampila(w).ok
  let tA = 0
  let areTA = false
  let lambdaCer = -1
  /**
   * Rata pe componenta, in trecerea asta; null = componenta fara T. Null, nu un λ negativ ca santinela: o curba stricata
   * care ar da λ < 0 sub prag s-ar fi citit „fara T" si ar fi sarit tacut (proba „pragul mutat cu −0,1 °C" iesea RATATA).
   */
  const peComponenta = new Map<number, number | null>()
  const ids: number[] = []
  const kuri: number[] = []
  const faraRata: boolean[] = []

  // Faza 1: pierderile tuturor mormanelor perisabile, pe cantitatea de la inceputul pasului.
  for (let i = 0; i < it.count; i++) {
    if (it.alive[i] !== 1 || rules.perisabil[it.kind[i]!] !== true) continue
    st.mormane++
    st.mormaneUltimulPas++
    const x = it.wx[i]!
    const y = it.wy[i]!
    const z = it.z[i]!
    const loc = loculCelulei(w, x, y, z)
    let lambda: number
    if (loc === LOC_CER || loc === LOC_TOC) {
      if (!areTA) { tA = tAfara(w.seed, w.tick, rules); areTA = true }
      if (loc === LOC_CER) {
        if (lambdaCer < 0) {
          lambdaCer = lambdaPeCurba(curba, tA)
          st.evaluariRata++
          st.evaluariUltimulPas++
        }
        lambda = lambdaCer
      } else {
        const t = tTocului(w, x, y, z, tA, stampilaOk)
        st.evaluariRata++
        st.evaluariUltimulPas++
        if (t === null) { st.faraT++; continue }
        lambda = lambdaPeCurba(curba, t)
      }
    } else {
      let l = peComponenta.get(loc)
      if (l === undefined) {
        const t = stampilaOk ? tDinStare(w, loc) : null
        l = t === null ? null : lambdaPeCurba(curba, t)
        peComponenta.set(loc, l)
        st.evaluariRata++
        st.evaluariUltimulPas++
      }
      if (l === null) { st.faraT++; continue }
      lambda = l
    }
    const q = it.cantitate[i]!
    const dS = q * lambda
    it.alterare[i] = it.alterare[i]! + dS
    w.ratiune.alterareAcumulata += dS
    const k = Math.min(q, Math.floor(it.alterare[i]! / ONE_ALTERARE))
    if (k > 0) {
      ids.push(it.id[i]!)
      kuri.push(k)
      faraRata.push(lambda === 0)
    }
  }

  // Faza 2: unitatile intregi strinse pleaca; moartea se reconciliaza acum.
  const raport = lastJobReport()
  for (let j = 0; j < ids.length; j++) {
    const id = ids[j]!
    const slot = slotItem(it, id)
    if (slot === -1) continue
    const inainte = it.cantitate[slot]!
    const ramas = scadeStricate(w, rules, slot, kuri[j]!)
    const n = inainte - ramas
    st.stricate += n
    raport.unitatiStricate += n
    if (faraRata[j]) st.realizariFaraRata += n
    if (ramas === 0) {
      st.morti++
      reconciliazaTintaMoarta(w, rules, id)
    }
  }
}
