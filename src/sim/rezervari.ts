/**
 * Rezervarile — S16-19.
 *
 * Inima corectitudinii unui job system, si locul unde mor proiectele. Research-ul
 * (research/job-system.md) e neechivoc, si cele trei dimensiuni de mai jos exista
 * TOATE din prima versiune, fiindca adaugate mai tarziu cer rescrierea fiecarui
 * driver de job:
 *
 *   `(claimant, jobId, targetId, layer, count, maxClaimants)`
 *
 *   - `layer`        — scheme INDEPENDENTE de rezervare pe acelasi obiect: un pat
 *                      rezervat „ca sa dorm" nu blocheaza „ca sa-l repar".
 *   - `maxClaimants` — cati pioni DISTINCTI pot tine aceeasi tinta deodata: trei
 *                      constructori pe acelasi zid, un singur sapator pe un voxel.
 *   - `count`        — cat din tinta ia fiecare: doi carausi din acelasi morman de
 *                      200 de pietre, fara ca al doilea sa ajunga la un morman gol.
 *
 * Primul `isBeingWorkedOn: boolean` pe o entitate e semnalul de oprire (K02).
 *
 * ## Clasificare: DERIVED din joburi
 *
 * Fiecare rezervare e creata de un start de job si eliberata de un sfarsit de job,
 * iar cererile unui job sunt o functie determinista de (fel, tinta). Deci multimea
 * rezervarilor e o FUNCTIE a joburilor in curs, si joburile sunt PERSISTED pe
 * agenti. La incarcare, rezervarile se reconstruiesc in ordinea slotului; ce nu se
 * poate reconstrui inseamna un save inconsistent, si jobul ala se anuleaza CU
 * RAPORT — nu ramane un obiect „ocupat" pe veci, tacut.
 *
 * ## Atomicitate pe un singur fir (D12)
 *
 * Defectul RimThreaded #789: cu mai multe fire, `CanReserve` si `Reserve` nu mai
 * sunt atomice, iar patru pioni ajung intr-un lant circular de asteptare care nu
 * se mai deblocheaza. Aici totul e pe un fir, deci „verifica TOATE, apoi scrie
 * TOATE" E tranzactia: la orice refuz nu se scrie nimic. Nu exista rollback
 * fiindca nu exista scriere partiala.
 *
 * ## Eliberarea e pe PERECHE, nu pe claimant
 *
 * `elibereaza(claimant, jobId)`, niciodata `elibereaza(claimant)`. Azi un agent
 * are cel mult un job, deci diferenta nu se vede. Cand va exista o coada de
 * joburi per pion, eliberarea pe pion ar fura rezervarile jobului urmator din
 * coada, iar defectul ar aparea la EXECUTIE, nu la planificare. API-ul se scrie
 * o singura data.
 */

import type { Outcome } from './result.ts'
import { accept, refuse, Reason } from './result.ts'
import type { AgentStore } from './state.ts'

/**
 * Straturile. LUCRU e singurul folosit azi; CARAT e rezervat pentru taietura 2
 * (un morman rezervat „ca sa-l car" nu blocheaza „ca sa lucrez langa el").
 * Dimensiunea exista din prima zi tocmai ca al doilea strat sa nu ceara nimic.
 */
export const Strat = {
  LUCRU: 0,
  CARAT: 1,
} as const
export type StratId = (typeof Strat)[keyof typeof Strat]
/** Cate straturi sunt. Structura, nu numar de gameplay. */
export const STRATURI = 2

/** Ce cere un job de la o tinta, INAINTE de a porni. */
export interface Cerere {
  readonly targetId: number
  readonly layer: StratId
  /** Cat ia din tinta. */
  readonly count: number
  /** Cat are tinta in total, pe stratul asta. Suma `count` a tuturor nu-l depaseste. */
  readonly maxCount: number
  /** Cati claimanti distincti incap deodata. */
  readonly maxClaimants: number
}

/** Tuplul complet. Imutabil odata scris. */
export interface Rezervare {
  readonly claimant: number
  readonly jobId: number
  readonly targetId: number
  readonly layer: StratId
  readonly count: number
  readonly maxCount: number
  readonly maxClaimants: number
}

export interface ReservationStore {
  /**
   * DERIVED. Cheia e `targetId * STRATURI + layer`. Listele sunt scurte (cel mult
   * `maxClaimants` intrari), deci parcurgerea lor e ieftina.
   */
  readonly peTinta: Map<number, Rezervare[]>
  /** Cate rezervari exista in total. Pentru rapoarte, in O(1). */
  total: number
  /**
   * TRANSIENT. Cate joburi s-au anulat la incarcare fiindca rezervarea lor nu s-a
   * putut reconstrui. Zero intr-un save consistent. Nu intra in hash: e un
   * diagnostic, nu stare.
   */
  anulateLaIncarcare: number
}

export function createReservations(): ReservationStore {
  return { peTinta: new Map(), total: 0, anulateLaIncarcare: 0 }
}

export function cheieRezervare(targetId: number, layer: number): number {
  return targetId * STRATURI + layer
}

/** Rezervarile de pe o tinta, pe un strat. Lista goala daca nu e niciuna. */
export function rezervariPentru(s: ReservationStore, targetId: number, layer: StratId): readonly Rezervare[] {
  return s.peTinta.get(cheieRezervare(targetId, layer)) ?? []
}

/**
 * Poate `claimant` sa obtina cererea, tinand cont si de ce ar fi luat deja in
 * aceeasi tranzactie (`pendingCount`, `pendingSelf`)?
 *
 * Refuzul poarta cine tine tinta: „Rezervat de Ana (job #4711)" iese direct de
 * aici, fara al doilea scan.
 */
function verificaUna(
  s: ReservationStore,
  claimant: number,
  c: Cerere,
  pendingCount: number,
  pendingSelf: boolean,
): Outcome<void> {
  const lista = s.peTinta.get(cheieRezervare(c.targetId, c.layer))
  let altii = 0
  let primulAltul: Rezervare | null = null
  let suma = pendingCount
  let euDeja = pendingSelf
  if (lista) {
    for (const r of lista) {
      suma += r.count
      if (r.claimant === claimant) euDeja = true
      else {
        altii++
        if (!primulAltul) primulAltul = r
      }
    }
  }
  // Un claimant nou ocupa un loc; unul care e deja acolo nu ocupa inca unul.
  const locuri = altii + (euDeja ? 0 : 1)
  if (locuri > c.maxClaimants) {
    return refuse(Reason.REZERVAT, {
      targetId: c.targetId,
      layer: c.layer,
      de: primulAltul ? primulAltul.claimant : claimant,
      job: primulAltul ? primulAltul.jobId : -1,
      maxClaimants: c.maxClaimants,
    })
  }
  if (suma + c.count > c.maxCount) {
    return refuse(Reason.CAPACITATE_DEPASITA, {
      targetId: c.targetId,
      layer: c.layer,
      cerut: c.count,
      ocupat: suma,
      maxim: c.maxCount,
    })
  }
  return accept()
}

/** O singura cerere, fara sa scrie nimic. Pentru scanner. */
export function poateRezerva(s: ReservationStore, claimant: number, c: Cerere): Outcome<void> {
  return verificaUna(s, claimant, c, 0, false)
}

/**
 * Tranzactia: TOATE cererile sau niciuna.
 *
 * Doua cereri din aceeasi lista pot cadea pe aceeasi (tinta, strat) — de exemplu
 * un job de carat care ia din acelasi morman de doua ori. Verificarea tine cont
 * de ce s-ar fi acumulat deja in tranzactie, altfel a doua cerere ar fi
 * verificata contra unui store care nu stie inca de prima.
 */
export function rezervaToate(s: ReservationStore, claimant: number, jobId: number, cereri: readonly Cerere[]): Outcome<void> {
  // 1. Verifica tot, cu acumularea din tranzactie.
  const pending = new Map<number, number>()
  for (const c of cereri) {
    const k = cheieRezervare(c.targetId, c.layer)
    const deja = pending.get(k) ?? 0
    const out = verificaUna(s, claimant, c, deja, deja > 0)
    if (!out.ok) return out
    pending.set(k, deja + c.count)
  }
  // 2. Abia acum scrie. Nicio cale de iesire intre cele doua pasi.
  for (const c of cereri) {
    const k = cheieRezervare(c.targetId, c.layer)
    let lista = s.peTinta.get(k)
    if (!lista) {
      lista = []
      s.peTinta.set(k, lista)
    }
    lista.push({
      claimant,
      jobId,
      targetId: c.targetId,
      layer: c.layer,
      count: c.count,
      maxCount: c.maxCount,
      maxClaimants: c.maxClaimants,
    })
    s.total++
  }
  return accept()
}

/**
 * Elibereaza tot ce tine perechea (claimant, jobId). Intoarce cate a eliberat.
 *
 * Parcurge tot storeul: cu zeci de agenti si liste scurte, e ieftin. Un index pe
 * claimant se adauga cand masuratoarea o cere, nu inainte.
 */
export function elibereaza(s: ReservationStore, claimant: number, jobId: number): number {
  let eliberate = 0
  // determinism-ok: rezultatul nu depinde de ordinea parcurgerii — se sterg
  // intrari dupa (claimant, jobId), o multime, nu o secventa.
  for (const [k, lista] of s.peTinta) {
    const ramase = lista.filter((r) => !(r.claimant === claimant && r.jobId === jobId))
    if (ramase.length === lista.length) continue
    eliberate += lista.length - ramase.length
    if (ramase.length === 0) s.peTinta.delete(k)
    else s.peTinta.set(k, ramase)
  }
  s.total -= eliberate
  return eliberate
}

/**
 * Tinta a disparut: tot ce o tinea, pe orice strat, se sterge. Intoarce
 * claimantii afectati, SORTATI si fara duplicate, ca apelantul sa le poata
 * incheia joburile intr-o ordine fixa.
 */
export function elibereazaTinta(s: ReservationStore, targetId: number): number[] {
  const afectati = new Set<number>()
  for (let layer = 0; layer < STRATURI; layer++) {
    const k = cheieRezervare(targetId, layer)
    const lista = s.peTinta.get(k)
    if (!lista) continue
    for (const r of lista) afectati.add(r.claimant)
    s.total -= lista.length
    s.peTinta.delete(k)
  }
  return [...afectati].sort((a, b) => a - b)
}

/**
 * Invariantul, verificabil oricand (research: „build de debug, o data pe secunda").
 *
 *   1. fiecare rezervare are un claimant VIU, al carui job CURENT e cel din tuplu;
 *   2. pe fiecare (tinta, strat), claimantii distincti ≤ maxClaimants;
 *   3. pe fiecare (tinta, strat), suma `count` ≤ maxCount;
 *   4. `total` numara corect.
 *
 * Primul esec iese ca refuz, cu tot ce trebuie ca sa-l gasesti. Ruleaza in teste
 * si in acceptanta; NU in tickul de simulare.
 */
export function verificaRezervari(s: ReservationStore, agents: AgentStore): Outcome<void> {
  let numarate = 0
  const chei = [...s.peTinta.keys()].sort((a, b) => a - b)
  for (const k of chei) {
    const lista = s.peTinta.get(k)!
    const claimanti = new Set<number>()
    let suma = 0
    let maxClaimants = Infinity
    let maxCount = Infinity
    for (const r of lista) {
      numarate++
      claimanti.add(r.claimant)
      suma += r.count
      if (r.maxClaimants < maxClaimants) maxClaimants = r.maxClaimants
      if (r.maxCount < maxCount) maxCount = r.maxCount

      let slot = -1
      for (let i = 0; i < agents.count; i++) {
        if (agents.id[i] === r.claimant && agents.alive[i] === 1) { slot = i; break }
      }
      if (slot === -1) {
        return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'claimant mort sau inexistent', claimant: r.claimant, job: r.jobId, targetId: r.targetId })
      }
      if (agents.jobKind[slot] === 0 || agents.jobId[slot] !== r.jobId) {
        return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'claimantul nu mai are jobul asta', claimant: r.claimant, job: r.jobId, jobCurent: agents.jobId[slot]!, targetId: r.targetId })
      }
    }
    if (claimanti.size > maxClaimants) {
      return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'prea multi claimanti', cheie: k, claimanti: claimanti.size, maxClaimants })
    }
    if (suma > maxCount) {
      return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'count peste capacitate', cheie: k, suma, maxCount })
    }
  }
  if (numarate !== s.total) {
    return refuse(Reason.INVARIANT_INCALCAT, { motiv: 'total gresit', total: s.total, numarate })
  }
  return accept()
}

/** Forma canonica a storeului, pentru comparatii in teste (continuu vs. incarcat). */
export function dumpRezervari(s: ReservationStore): string {
  const chei = [...s.peTinta.keys()].sort((a, b) => a - b)
  const linii: string[] = []
  for (const k of chei) {
    const lista = [...s.peTinta.get(k)!].sort((a, b) => a.claimant - b.claimant || a.jobId - b.jobId)
    for (const r of lista) linii.push(`${r.targetId}/${r.layer}:${r.claimant}#${r.jobId}x${r.count}/${r.maxCount}@${r.maxClaimants}`)
  }
  return linii.join('\n')
}
