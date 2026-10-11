/**
 * Prognoza hranei si ratele pe morman (S24-27 t.3 §8, commit-ul D; UI-1, UI-2, UI-5, UI-6, UI-9, UI-14) — CITIRE PURA.
 *
 * O SINGURA functie pentru „cat ne mai hraneste" (`proiecteaza`), pentru toti cei patru cititori ai ecranului: bara de sus,
 * „Primii pasi", alerta „hrana-scade" si dialogul „Joc nou" (UI-9: azi trei din patru erau pe alta formula si in alta
 * unitate). Si o singura functie pentru „cat se strica de pe un morman" (`stareaHranei`, `pierdereaOreiSubCer`), pe care
 * le citesc inspectorul, alerta „hrana se strica", harta U si F3. Nimic de aici nu scrie in World si nimic nu intra in
 * starea lumii.
 *
 * ## Modelul (UI-1, verif-UI-1)
 *
 * Doua BAZINE de valoare, in puncte de nutritie EFECTIVA (`nutritieEfectiva`: hrana pe jumatate stricata hraneste pe
 * jumatate — un fapt, o functie):
 * - **sub cer**: rata e a AERULUI VIITOR — `tAfara` e o functie pura de tick —, ora cu ora, cu λ-ul de la mijlocul orei
 *   (verif-UI-1: −0,05 zile la 14 zile de hrana, fata de −0,13 cu λ-ul de la inceputul orei);
 * - **in incaperi** (si tocurile usilor, si mainile oamenilor, care nu se strica): rata de ACUM, ponderata pe cantitate.
 *   Limita, scrisa (verif-UI-1 §3.2): rata unei incaperi e tinuta constanta; o casa de piatra cu hrana dubla greseste cu
 *   −2,05…+2,23 zile. Pivnitele (sub prag) nu au eroare: rata lor e 0.
 * Consumul (oamenii vii ai asezarii, `scurgere / nevoiTicks` puncte pe tick fiecare) se imparte PROPORTIONAL cu valoarea
 * bazinelor. Pas de o ora, plafon de un AN de calendar (`tickuriPeAn`: „peste un an"; fara plafon, 100.000 de hrana cu un
 * om costau 1,4 ms pe apel — verif-UI-1). Cand nimic perisabil nu e sub cer, forma INCHISA: dV/dt = −C − r̄·V ⇒
 * t = ln(1 + r̄·V/C) / r̄, iar la r̄ = 0 exact V/C. Media pe 24 h tinuta constanta (designul v1) gresea cu zile intregi
 * (−29% toamna cu hrana tripla, +25% optimist primavara); „rata de ACUM e 0" ca scurtatura gresea cu pana la 2,95 zile
 * noaptea (verif-UI-1 §3.1) — de aceea conditia e „nimic perisabil sub cer", nu „nimic nu se strica acum".
 *
 * ## Rata pe morman
 *
 * Pierderea de VALOARE pe pasul de 1 Hz e `q·λ/ONE` (`S += q·λ`: proportionala cu UNITATILE, nu cu valoarea) — un morman
 * faramitat in 750 × 1 u pierde ca 750 de unitati, oricat de putin ar mai hrani (masurat la B: 100 u de valoare in 750 de
 * unitati vizibile). Bazinele tin deci, langa valoare, BAZA pierderii (unitatile × nutritia): rata bazinului e
 * baza·λ/valoare — exacta la t = 0 si pentru faramituri.
 *
 * `rataZi` a unui morman (fractie pe zi): in incaperi si in toc, λ-ul T-ului de ACUM pe pasii unei zile (`rataZilnica`, din
 * λ-ul CUANTIZAT al simularii — banda moarta de deasupra pragului inclusa); sub cer, pierderea urmatoarelor 24 h
 * (`fractiaSubCer`, aceeasi functie ca proiectia): T-ul de acum sub cer mintea de 0,03…94 de ori fata de ce se pierde
 * de fapt in ziua care vine (UI-5).
 *
 * ## Aritmetica
 *
 * Float, doar + − × ÷ (rotunjite corect de IEEE-754: aceleasi pe orice motor); ln(1 + x) din `lnUnuPlus`, fara `Math.log`
 * (aproximat de implementare, interzis in src/sim). Ordinea operatiilor e fixa, deci aceeasi lume da aceeasi prognoza.
 */

import type { Rules } from './content.ts'
import { curbaReguli, lambdaAlterare } from './alterare.ts'
import { tAfara } from './clima.ts'
import { tickuriPeAn, tickuriPeOra } from './calendar.ts'
import { nutritieEfectiva } from './iteme.ts'
import type { World } from './state.ts'
import { Faction, Nevoie, ONE_ALTERARE } from './state.ts'
import { LOC_CER, LOC_TOC, loculCelulei, tDinStare, tTocului, verificaStampila } from './temperatura.ts'

/** ln 2, cel mai apropiat double. */
export const LN2 = 0.6931471805599453

/**
 * ln(1 + x) pentru x ≥ 0, doar cu + − × ÷: y = 1 + x = m·2^k cu m in [1, 2) (impartiri la 2, exacte), apoi
 * ln m = 2·atanh((m − 1)/(m + 1)), seria pana cand termenul nu mai schimba suma. Pentru k = 0 se ia direct
 * s = x/(2 + x) — fara 1 + x, care ar pierde cifrele unui x mic. Eroarea fata de `Math.log1p`: cativa ulp (testul).
 * x ≤ 0 (sau NaN) → 0: prognoza nu cere niciodata un logaritm negativ.
 */
export function lnUnuPlus(x: number): number {
  if (!(x > 0)) return 0
  let k = 0
  let y = 1 + x
  while (y >= 2) {
    y /= 2
    k++
  }
  const s = k === 0 ? x / (2 + x) : (y - 1) / (y + 1)
  const s2 = s * s
  let putere = s
  let suma = 0
  for (let n = 1; n < 400; n += 2) {
    const urm = suma + putere / n
    if (urm === suma) break
    suma = urm
    putere *= s2
  }
  return k * LN2 + 2 * suma
}

/** Pasii de alterare (1 Hz) dintr-o zi de calendar. */
export function pasiPeZi(rules: Rules): number {
  return rules.calendar.ziTicks / rules.ticksPerSecond
}

/**
 * Rata ZILNICA a curbei la T (Q16 °C), ca fractie dintr-o unitate: λ-ul CUANTIZAT al simularii (`lambdaAlterare`) pe pasii
 * unei zile — rata „liniarizata" a tabelului din content (`pierderePeMilionZilnic`), cu banda moarta de deasupra pragului.
 * Clasele ecranului („se pastreaza aproape", UI-2) si textele inspectorului se calculeaza DE AICI, nu dintr-o formula a lor.
 */
export function rataZilnica(rules: Rules, tQ16: number): number {
  return (lambdaAlterare(rules, tQ16) * pasiPeZi(rules)) / ONE_ALTERARE
}

/** Pragul curbei (Q16 °C): primul punct al tabelului din content, la el si sub el nu se strica nimic. */
export function pragAlterare(rules: Rules): number {
  return curbaReguli(rules).tQ16[0]!
}

/**
 * Cel mai mare exponent pe care `scadereOra` il da direct aproximantului Padé (eroarea ~a³/12: 1,3·10^-3 aici); peste el,
 * exponentul se injumatateste, iar `proiecteazaPeOre` imparte ora in sub-pasi. Continutul implicit sta sub el: λ-ul unei ore
 * la 45 °C e ~0,115 (ECRAN-3).
 */
export const PRAG_PADE = 0.25

/**
 * e^(−a) pentru a ≥ 0, cu aproximantul Padé (1,1): (1 − a/2)/(1 + a/2) — doar + − × ÷, eroarea ~a³/12 (2·10^-6 pe o ora la
 * 25 °C, a = 0,029). Scaderea unei ore: o rata constanta pe ora, fara Euler (Euler pe ora gresea cu −0,026 zile la 25 °C).
 * Peste `PRAG_PADE`: e^(−a) = (e^(−a/2^k))^(2^k) — Padé singur cadea la 0 EXACT de la a = 2 (si la 0,026 in loc de 0,150 la
 * 1,9), iar fractia de sub cer devenea 0/0 (ECRAN-3). 0 doar de la 10^4 (e^(−10^4) e oricum sub cel mai mic double).
 */
export function scadereOra(a: number): number {
  if (!(a < 1e4)) return 0
  let x = a
  let k = 0
  while (x > PRAG_PADE) {
    x /= 2
    k++
  }
  let e = (1 - x / 2) / (1 + x / 2)
  for (; k > 0; k--) e *= e
  return e
}

/**
 * (1 − e^(−a))/a, cu E = `scadereOra(a)`: cat din consumul unei ore ramane mancat, la rata constanta a. Sub `PRAG_PADE`, exact
 * identitatea aproximantului, 1/(1 + a/2); scazut ca (1 − E)/a pierdea cifrele unui a mic (o fractie de sub cer ajunsa la
 * 10^-17: 0, adica fara consum — un amestec cu pivnita tinea mai mult decat toata hrana fara alterare, ECRAN-3). 1 la a = 0.
 */
export function consumulScaderii(a: number, E: number): number {
  return a > PRAG_PADE ? (1 - E) / a : 1 / (1 + a / 2)
}

/**
 * Cursorul aerului viitor de la `tick`: pentru ora `ora`, cat se strica dintr-O unitate sub cer in ora aceea (exponentul pe
 * ora) — λ-ul aerului de la MIJLOCUL orei (`tAfara`, pura de tick), pe pasii de 1 Hz ai orei. Masurat contra modelului pas cu
 * pas de 1 Hz, pe 16 cazuri (4 anotimpuri × 1/4/12 oameni si un stoc amestecat): mijlocul orei |dif| ≤ 0,0021 zile; Simpson pe
 * capete si mijloc (de doua ori mai scump) nu castiga nimic (≤ 0,0032); inceputul orei greseste cu pana la −0,136 zile (vara,
 * un om).
 */
function cursorCer(seed: number, tick: number, rules: Rules): (ora: number) => number {
  const H = tickuriPeOra(rules)
  const pePas = H / rules.ticksPerSecond / ONE_ALTERARE
  const jum = Math.floor(H / 2)
  return (ora) => lambdaAlterare(rules, tAfara(seed, tick + ora * H + jum, rules)) * pePas
}

/** Exponentul pierderii sub cer in ora `ora` de la `tick` (vezi `cursorCer`): aceeasi functie in proiectie si in inspector. */
export function pierdereaOreiSubCer(seed: number, tick: number, rules: Rules, ora: number): number {
  return cursorCer(seed, tick, rules)(ora)
}

/** Cat se strica dintr-o unitate sub cer in urmatoarele `ore` ore de la `tick`: 1 − Π e^(−p_h), ora cu ora. */
export function fractiaSubCer(seed: number, tick: number, rules: Rules, ore = 24): number {
  const p = cursorCer(seed, tick, rules)
  let ramas = 1
  for (let h = 0; h < ore; h++) ramas *= scadereOra(p(h))
  return 1 - ramas
}

// ---------------------------------------------------------------------------------------------
// proiectia
// ---------------------------------------------------------------------------------------------

/** Intrarea proiectiei: doua bazine de valoare si consumul. Lumea o da `stareaHranei`; dialogul „Joc nou" o scrie el. */
export interface Bazine {
  readonly seed: number
  /** Tickul de la care se proiecteaza (aerul viitor e `tAfara(seed, tick + …)`). */
  readonly tick: number
  /** Valoarea sub cer (puncte) si baza pierderii ei (unitatile perisabile × nutritia). */
  readonly subCer: { readonly valoare: number; readonly baza: number }
  /** Valoarea in incaperi, tocuri si maini (puncte) si cat pierde ACUM pe tick (puncte). */
  readonly incaperi: { readonly valoare: number; readonly pierderePeTick: number }
  /** Puncte mancate pe tick de toata asezarea. */
  readonly consumPeTick: number
}

export interface Prognoza {
  /** Zile de calendar pana se termina hrana; Infinity = nu mananca nimeni; plafonul (un an) cand `plafonat`. */
  readonly zile: number
  /** Ajunge peste plafon (un an de calendar): „peste un an". */
  readonly plafonat: boolean
  /** Forma inchisa (nimic perisabil sub cer) sau pasul orar. */
  readonly formaInchisa: boolean
}

function rezultat(ticuri: number, rules: Rules, formaInchisa: boolean): Prognoza {
  const plafon = tickuriPeAn(rules)
  if (ticuri >= plafon) return { zile: plafon / rules.calendar.ziTicks, plafonat: true, formaInchisa }
  return { zile: ticuri / rules.calendar.ziTicks, plafonat: false, formaInchisa }
}

/** Cei mai multi sub-pasi dintr-o ora (`proiecteazaPeOre`): 1.024 acopera un exponent de 256 pe ora (o baza de ~2.000 de ori valoarea). */
const SUBPASI_MAX = 1024

/**
 * Proiectia cu pasul ORAR (vezi antetul), oricare ar fi bazinele: aici se testeaza si forma inchisa contra ei.
 *
 * Cu consumul impartit PROPORTIONAL, raportul bazinelor nu depinde de consum (fiecare pierde aceeasi fractie mancata), ci doar
 * de rate: fractia sub cer f evolueaza singura, iar valoarea totala urmeaza dV/dt = −C − a(t)·V, cu a = f·a_cer + (1 − f)·a_inc.
 * Pe o ora, cu a constant, solutia e exacta: V₁ = V·e^(−a) − C·H·(1 − e^(−a))/a, iar daca hrana se termina in ora asta,
 * dupa ln(1 + a·V/(C·H))/a ore (`lnUnuPlus`). e^(−a) e `scadereOra`. Fara cer, iteratia da forma inchisa.
 *
 * Cand exponentul unei ore trece de `PRAG_PADE` (faramituri aproape stricate sub cer: baza/valoare mare; o incapere foarte
 * calda), ora se imparte in 2^k sub-pasi egali, fiecare sub prag (ECRAN-3): trapezul pe f presupune ca f se schimba putin in
 * pas, iar intr-o ora in care cerul se goleste el strica si hrana din pivnita (un amestec cu pivnita la rata 0 iesea sub cat
 * tine pivnita singura). Sub prag (continutul implicit) ramane un singur pas, cu aceeasi aritmetica. La plafonul de sub-pasi
 * (`SUBPASI_MAX`), un pas care tot trece de prag goleste cerul INTAI (pierderea lui exacta), apoi merge fara el; cand nu ramane
 * nimic, fractia de sub cer e 0, nu 0/0 (Padé singur cadea la 0 exact de la a = 2, iar f devenea NaN: alterarea disparea).
 */
export function proiecteazaPeOre(b: Bazine, rules: Rules): Prognoza {
  const C = b.consumPeTick
  let V = b.subCer.valoare + b.incaperi.valoare
  if (V <= 0) return rezultat(0, rules, false)
  if (!(C > 0)) return { zile: Infinity, plafonat: false, formaInchisa: false }
  const H = tickuriPeOra(rules)
  const ore = Math.ceil(tickuriPeAn(rules) / H)
  const CH = C * H
  const ks = b.subCer.valoare > 0 ? b.subCer.baza / b.subCer.valoare : 0
  const ai = b.incaperi.valoare > 0 ? (b.incaperi.pierderePeTick / b.incaperi.valoare) * H : 0
  const Ei = scadereOra(ai)
  const cer = ks > 0 ? cursorCer(b.seed, b.tick, rules) : null
  let f = b.subCer.valoare / V
  for (let h = 0; h < ore; h++) {
    const ac = cer !== null && f > 0 ? cer(h) * ks : 0
    let n = 1
    while (n < SUBPASI_MAX && Math.max(ac, ai) / n > PRAG_PADE) n *= 2
    const acn = ac / n
    const ain = ai / n
    const CHn = CH / n
    const Ein = n === 1 ? Ei : scadereOra(ain)
    for (let j = 0; j < n; j++) {
      let acj = acn
      if (acj > PRAG_PADE && f > 0) {
        // Doar la plafonul de sub-pasi (o baza de mii de ori valoarea): cerul se goleste in pas — pierderea lui intai, apoi pasul
        // fara el; trapezul ar fi stricat si pivnita.
        const fc = f * scadereOra(acj)
        const ramas = fc + (1 - f)
        V *= ramas
        f = ramas > 0 ? fc / ramas : 0
        acj = 0
      }
      // Fractia de sub cer la capatul pasului; rata medie a pasului, pe fractia de la mijloc (trapez: f scade in pas).
      let f1 = f
      if (f > 0) {
        const Ec = scadereOra(acj)
        f1 = (f * Ec) / (f * Ec + (1 - f) * Ein)
      }
      const fm = (f + f1) / 2
      const a = fm * acj + (1 - fm) * ain
      const E = scadereOra(a)
      const V1 = V * E - CHn * consumulScaderii(a, E)
      if (V1 <= 0) return rezultat((h + (j + Math.min(1, a > 0 ? lnUnuPlus((a * V) / CHn) / a : V / CHn)) / n) * H, rules, false)
      f = f1
      V = V1
    }
  }
  return rezultat(tickuriPeAn(rules), rules, false)
}


/**
 * Prognoza: cand nimic perisabil nu e sub cer, forma INCHISA (O(1)): t = V·ln(1 + L/C)/L, cu L pierderea pe tick a
 * bazinului (r̄·V), iar la L = 0 exact V/C; altfel pasul orar pe aerul viitor (`proiecteazaPeOre`).
 */
export function proiecteaza(b: Bazine, rules: Rules): Prognoza {
  if (b.subCer.baza > 0) return proiecteazaPeOre(b, rules)
  const V = b.subCer.valoare + b.incaperi.valoare
  const C = b.consumPeTick
  if (V <= 0) return rezultat(0, rules, true)
  if (!(C > 0)) return { zile: Infinity, plafonat: false, formaInchisa: true }
  const L = b.incaperi.pierderePeTick
  return rezultat(L > 0 ? (V * lnUnuPlus(L / C)) / L : V / C, rules, true)
}

// ---------------------------------------------------------------------------------------------
// lumea: bazinele si ratele pe morman
// ---------------------------------------------------------------------------------------------

/** Un morman de hrana (nutritie > 0), cu rata lui. */
export interface MormanHrana {
  readonly slot: number
  readonly id: number
  readonly kind: number
  readonly cantitate: number
  /** Valoarea, puncte de nutritie efectiva (`nutritieEfectiva(q, S, nut)`). */
  readonly valoare: number
  /** Unde sta: id-ul componentei, `LOC_CER` sau `LOC_TOC` (`loculCelulei`). */
  readonly loc: number
  /** T-ul locului ACUM (Q16 °C): componenta din stare, partea calda a tocului, aerul de afara; null = fara T. */
  readonly tQ16: number | null
  /**
   * Fractia pierduta pe zi: in incaperi si in toc `rataZilnica(T de acum)`, sub cer pierderea urmatoarelor 24 h
   * (`fractiaSubCer`); 0 pentru un fel neperisabil si pentru un loc fara T (pasul il sare).
   */
  readonly rataZi: number
}

/** Ce stie ecranul despre hrana, dintr-o singura trecere peste mormane si maini. */
export interface StareHrana {
  readonly seed: number
  readonly tick: number
  /** Mormanele de hrana vii (felurile cu nutritie > 0), in ordinea slotului. */
  readonly mormane: readonly MormanHrana[]
  /** Valoarea totala: mormane + mainile oamenilor asezarii (puncte). */
  readonly valoare: number
  /** Oamenii vii ai asezarii (cei care mananca). */
  readonly colonisti: number
  /** Puncte mancate pe tick de toata asezarea. */
  readonly consumPeTick: number
  readonly subCer: { readonly valoare: number; readonly baza: number }
  readonly incaperi: { readonly valoare: number; readonly pierderePeTick: number }
  /** Pierderea asteptata pe zi a stocului (puncte): Σ q·nut·rataZi. */
  readonly pierderePeZi: number
  /** Ce se strica dintr-o unitate sub cer in urmatoarele 24 h. */
  readonly fractieCer24: number
  /** Aerul de afara acum (Q16 °C). */
  readonly tAfara: number
}

/** Ce se citeste o data pe trecere: aerul de acum, pierderea cerului pe 24 h, stampila, T-ul pe componenta. */
interface Context {
  readonly tA: number
  readonly fCer: number
  readonly stampilaOk: boolean
  readonly peComponenta: Map<number, number | null>
}

function context(w: World, rules: Rules): Context {
  return { tA: tAfara(w.seed, w.tick, rules), fCer: fractiaSubCer(w.seed, w.tick, rules, 24), stampilaOk: verificaStampila(w).ok, peComponenta: new Map() }
}

/** Locul unei celule, cu T-ul lui de ACUM si rata zilnica a unui fel (perisabil sau nu) asezat acolo (vezi `MormanHrana`). */
export interface LocHrana {
  readonly loc: number
  readonly tQ16: number | null
  readonly rataZi: number
}

/**
 * Locul celulei (x, y, z): componenta (T-ul din stare), tocul (partea calda) sau cerul (pierderea urmatoarelor 24 h). O SINGURA
 * evaluare pentru un morman si pentru o celula goala — „cămara are loc" intreaba de locul ei cu aceeasi functie (ECRAN-2).
 */
function evalueazaLocul(w: World, rules: Rules, x: number, y: number, z: number, perisabil: boolean, cx: Context): LocHrana {
  const loc = loculCelulei(w, x, y, z)
  let t: number | null
  let rataZi = 0
  if (loc === LOC_CER) {
    t = cx.tA
    if (perisabil) rataZi = cx.fCer
  } else {
    if (loc === LOC_TOC) t = tTocului(w, x, y, z, cx.tA, cx.stampilaOk)
    else {
      let tc = cx.peComponenta.get(loc)
      if (tc === undefined) {
        tc = cx.stampilaOk ? tDinStare(w, loc) : null
        cx.peComponenta.set(loc, tc)
      }
      t = tc
    }
    if (perisabil && t !== null) rataZi = rataZilnica(rules, t)
  }
  return { loc, tQ16: t, rataZi }
}

/** Mormanul de hrana din slotul `i` (viu, nutritie > 0), cu T-ul si rata locului lui; null altfel. */
function evalueazaMorman(w: World, rules: Rules, i: number, cx: Context): MormanHrana | null {
  const it = w.iteme
  if (it.alive[i] !== 1) return null
  const kind = it.kind[i]!
  const nut = rules.nutritie[kind] ?? 0
  if (nut <= 0) return null
  const q = it.cantitate[i]!
  const { loc, tQ16: t, rataZi } = evalueazaLocul(w, rules, it.wx[i]!, it.wy[i]!, it.z[i]!, rules.perisabil[kind] === true, cx)
  return { slot: i, id: it.id[i]!, kind, cantitate: q, valoare: nutritieEfectiva(q, it.alterare[i]!, nut), loc, tQ16: t, rataZi }
}

/**
 * Locurile unor celule GOALE, ca pentru un fel perisabil asezat acolo (aceeasi evaluare ca un morman, `evalueazaLocul`), cu
 * aerul si stampila citite o data: „cămara are loc" (ECRAN-2) intreaba daca locul ei pastreaza. Citire pura.
 */
export function evaluatorDeLoc(w: World, rules: Rules): (x: number, y: number, z: number) => LocHrana {
  const cx = context(w, rules)
  return (x, y, z) => evalueazaLocul(w, rules, x, y, z, true, cx)
}

/** Un singur morman (inspectorul), cu ACEEASI evaluare ca `stareaHranei`; null daca slotul nu tine hrana vie. */
export function mormanulDeHrana(w: World, rules: Rules, slot: number): MormanHrana | null {
  return evalueazaMorman(w, rules, slot, context(w, rules))
}

/**
 * O trecere peste mormane si mainile oamenilor: valoarea, bazinele, rata fiecarui morman. Rata se evalueaza o data pe
 * componenta (ca pasul, J-3), o data pentru cer (pe 24 h), si pe fiecare morman din toc.
 */
export function stareaHranei(w: World, rules: Rules): StareHrana {
  const it = w.iteme
  const cx = context(w, rules)
  const mormane: MormanHrana[] = []
  let valoare = 0
  let vs = 0
  let bs = 0
  let vr = 0
  let lr = 0
  let pierderePeZi = 0
  for (let i = 0; i < it.count; i++) {
    const m = evalueazaMorman(w, rules, i, cx)
    if (m === null) continue
    const nut = rules.nutritie[m.kind]!
    valoare += m.valoare
    if (m.loc === LOC_CER) {
      vs += m.valoare
      if (rules.perisabil[m.kind] === true) bs += m.cantitate * nut
    } else {
      vr += m.valoare
      // Pierderea pe tick de ACUM: q·nut·λ/(ONE·tps), adica q·nut·rataZi pe tickurile unei zile.
      lr += (m.cantitate * nut * m.rataZi) / rules.calendar.ziTicks
    }
    pierderePeZi += m.cantitate * nut * m.rataZi
    mormane.push(m)
  }
  const a = w.agents
  let colonisti = 0
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] !== 1 || a.faction[i] !== Faction.ASEZARE) continue
    colonisti++
    const q = a.caraCantitate[i]!
    if (q <= 0) continue
    const nut = rules.nutritie[a.caraKind[i]!] ?? 0
    if (nut <= 0) continue
    // Mana nu se strica (decizia 4): bazinul incaperilor, cu pierdere 0.
    const v = nutritieEfectiva(q, a.caraAlterare[i]!, nut)
    valoare += v
    vr += v
  }
  const consumPeTick = (colonisti * rules.nevoi[Nevoie.FOAME]!.scurgere) / rules.nevoiTicks
  return {
    seed: w.seed,
    tick: w.tick,
    mormane,
    valoare,
    colonisti,
    consumPeTick,
    subCer: { valoare: vs, baza: bs },
    incaperi: { valoare: vr, pierderePeTick: lr },
    pierderePeZi,
    fractieCer24: cx.fCer,
    tAfara: cx.tA,
  }
}

/** Prognoza lumii de acum (vezi antetul): bazinele din `stareaHranei`, proiectate cu `proiecteaza`. */
export function prognozaHranei(w: World, rules: Rules, s: StareHrana = stareaHranei(w, rules)): Prognoza {
  return proiecteaza(s, rules)
}

/** Aceeasi hrana, fara alterare (tot stocul la rata 0): V/C — „cat ar tine intr-o camara". Tot prin `proiecteaza`. */
export function prognozaFaraAlterare(s: StareHrana, rules: Rules): Prognoza {
  return proiecteaza({ seed: s.seed, tick: s.tick, subCer: { valoare: 0, baza: 0 }, incaperi: { valoare: s.valoare, pierderePeTick: 0 }, consumPeTick: s.consumPeTick }, rules)
}
