/**
 * Textele UI-ului de joc — PUR: fara DOM, fara three, fara stare.
 *
 * DESIGN §9, regula 1: „fiecare «nu» are un motiv vizibil". Contractul `Outcome` din sim poarta
 * CODUL (`Reason`), detaliul si parametrii; aici devin propozitia pe care o citeste jucatorul, cu
 * ACTIUNEA care il deblocheaza. `describe()` din result.ts ramane pentru loguri, teste si
 * Diagnostic: UI-ul traduce codul, nu afiseaza sirul tehnic.
 *
 * Cheia e (SURSA, cod, detaliu, parametri), nu doar codul (panoul de design, T5 / CS-9):
 *  - detaliile desemnarilor (`DetaliuMotiv`) si ale mormanelor (`DetaliuItem`) se suprapun
 *    numeric (1–3), deci se citesc pe enumul SURSEI;
 *  - comenzile si incarcarea refolosesc coduri cu alt sens: `desemneaza` pe aer intoarce
 *    LIPSA_MATERIAL („nu e nimic de sapat"), `decode` intoarce LIPSA_MATERIAL si
 *    CAPACITATE_DEPASITA pentru un fisier strain sau prea nou;
 *  - FARA_SPRIJIN poarta `params.caz` (cinci raspunsuri diferite, cu cifrele lor).
 *
 * Textele au diacritice: sunt pentru jucator. Codul si comentariile raman fara, ca in viewer.
 */

import { Reason } from '../../src/sim/result.ts'
import type { ReasonCode } from '../../src/sim/result.ts'
import { DetaliuMotiv } from '../../src/sim/desemnari.ts'
import { DetaliuItem } from '../../src/sim/iteme.ts'
import { FelJob, Gand, Item, PasCara, PasConstruieste, PasJob, Piesa } from '../../src/sim/state.ts'
import { Material } from '../../src/sim/terrain/chunk.ts'
import { Zona } from '../../src/sim/zone.ts'

/** Un motiv tradus: ce s-a intamplat, si ce poate face jucatorul. `actiune` gol = nimic de facut decat asteptat. */
export interface TextMotiv {
  readonly titlu: string
  readonly actiune: string
}

/** Cifrele din reguli pe care le citeaza textele. Se iau din `Rules` de apelant (`cifreDinReguli`). */
export interface Cifre {
  readonly suportMax: number
  readonly suportRazaGrinda: number
  readonly agentHeadroomM: number
  readonly maxStepM: number
  /** Cate unitati cere o piesa (toate piesele de azi: 20). */
  readonly cantitatePiesa: number
  /** Sub atat, un morman nu se ridica pentru construit. */
  readonly pragRidicare: number
}

export const CIFRE_IMPLICITE: Cifre = { suportMax: 4, suportRazaGrinda: 10, agentHeadroomM: 2, maxStepM: 1, cantitatePiesa: 20, pragRidicare: 10 }

export const NUME_ITEM: Readonly<Record<number, string>> = {
  [Item.PIATRA]: 'Piatră',
  [Item.PAMANT]: 'Pământ',
  [Item.LEMN]: 'Lemn',
  [Item.HRANA]: 'Hrană',
}

/** Numele itemului in propozitie, nearticulat: „20 piatră", „niciun depozit pentru pământ". */
export const NUME_ITEM_MIC: Readonly<Record<number, string>> = {
  [Item.PIATRA]: 'piatră',
  [Item.PAMANT]: 'pământ',
  [Item.LEMN]: 'lemn',
  [Item.HRANA]: 'hrană',
}

export const NUME_PIESA: Readonly<Record<number, string>> = {
  [Piesa.NICIUNA]: 'Sapă',
  [Piesa.PERETE]: 'Perete',
  [Piesa.PODEA]: 'Podea',
  [Piesa.SCARA]: 'Scară',
  [Piesa.GRINDA]: 'Grindă',
}

/** Indexat 0..MATERIAL_MAX; testul trece prin toate. */
export const NUME_MATERIAL: Readonly<Record<number, string>> = {
  [Material.AER]: 'Aer',
  [Material.ROCA]: 'Rocă',
  [Material.PAMANT]: 'Pământ',
  [Material.IARBA]: 'Iarbă',
  [Material.APA]: 'Apă',
  [Material.LEMN_CONSTRUIT]: 'Lemn zidit',
  [Material.PIATRA_CONSTRUITA]: 'Piatră zidită',
  [Material.MOLOZ]: 'Moloz',
  [Material.GRINDA]: 'Grindă',
}

export const NUME_ZONA: Readonly<Record<number, string>> = {
  [Zona.DEPOZIT]: 'Depozit',
  [Zona.DORMIT]: 'Loc de dormit',
}

export const NUME_GAND: Readonly<Record<number, string>> = {
  [Gand.FLAMAND]: 'Flămând',
  [Gand.INFOMETAT]: 'Înfometat',
  [Gand.OBOSIT]: 'Obosit',
  [Gand.EPUIZAT]: 'Epuizat',
  [Gand.DORMIT_PE_JOS]: 'A dormit pe jos',
  [Gand.OPTIMISM_INITIAL]: 'Început plin de speranță',
}

/**
 * Prioritatea personala, in cuvinte. Mai mare = preferat (`maiBun` din joburi.ts), iar nivelul
 * MAXIM e „exclusiv": daca o categorie e acolo, pionul face DOAR categoriile de la maxim
 * (`categoriiActive`). Afisat ca cifra, 3 parea doar o treapta (panoul, CS-1).
 */
export function textPrioritatePersonala(nivel: number, maxim: number): { eticheta: string; titlu: string } {
  if (nivel <= 0) return { eticheta: '–', titlu: 'niciodată' }
  if (nivel >= maxim) return { eticheta: 'Excl.', titlu: 'exclusiv: face DOAR categoriile puse pe Excl.; celelalte sunt oprite' }
  return { eticheta: String(nivel), titlu: nivel === 1 ? 'normal' : `preferat (${nivel})` }
}

// ---------------------------------------------------------------------------------------------
// motivele
// ---------------------------------------------------------------------------------------------

export type SursaMotiv = 'desemnare' | 'morman' | 'comanda' | 'incarcare'

/** Parametrii unui refuz, cum vin din `Refusal.params`. */
export type Parametri = Readonly<Record<string, number | string>>

const nr = (p: Parametri | undefined, k: string): number | null => {
  const v = p?.[k]
  return typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null
}

/**
 * Motivul, tradus. `detaliu` se citeste pe enumul SURSEI (`DetaliuMotiv` pe desemnare,
 * `DetaliuItem` pe morman); `material` e felul de item cerut (LIPSA_MATERIAL), `fel` felul
 * mormanului (FARA_DEPOZIT).
 */
export function textMotiv(
  sursa: SursaMotiv, motiv: ReasonCode, detaliu = 0, params?: Parametri, cifre: Cifre = CIFRE_IMPLICITE, material: number = Item.PIATRA,
): TextMotiv {
  const mat = NUME_ITEM_MIC[material] ?? 'material'
  if (sursa === 'incarcare') return textIncarcare(motiv, params)
  if (sursa === 'desemnare') {
    if (motiv === Reason.INACCESIBIL) {
      if (detaliu === DetaliuMotiv.FARA_LOC_DE_LUCRU) return { titlu: `Niciun loc lângă ea unde să stea un om: îi trebuie podea și ${cifre.agentHeadroomM} m liberi deasupra, la cel mult ${cifre.maxStepM} m diferență.`, actiune: 'Sapă de sus în jos: întâi ce e deasupra ei sau lângă ea.' }
      if (detaliu === DetaliuMotiv.FARA_LOC_SIGUR) return { titlu: 'Niciun loc SIGUR de lucru: omul ar rămâne sus sau închis când se termină planul.', actiune: 'Pune o scară sau lasă o deschidere în perete (o coloană liberă de 2 niveluri) — sau așteaptă piesa de care depinde accesul.' }
      if (detaliu === DetaliuMotiv.COMPONENTE_DIFERITE) return { titlu: 'Nu se ajunge acolo din așezare.', actiune: 'Leagă locurile cu o scară sau un tunel.' }
    }
    if (motiv === Reason.LIPSA_MATERIAL) {
      if (detaliu === DetaliuMotiv.MATERIAL_IMPRASTIAT) return { titlu: `E ${mat} destulă, dar în mormane sub ${cifre.pragRidicare}: nu se ridică pentru construit.`, actiune: `Sapă încă un bloc de rocă (${cifre.cantitatePiesa} de ${mat}) sau adu mormanele în aceeași celulă de depozit.` }
      return { titlu: `Lipsește ${mat} (${cifre.cantitatePiesa} pe piesă).`, actiune: material === Item.PIATRA ? 'Piatra vine din rocă: sapă până la rocă.' : `Sapă ${mat}.` }
    }
  }
  if (sursa === 'morman') {
    if (motiv === Reason.FARA_DEPOZIT) {
      if (detaliu === DetaliuItem.DEPOZITE_PLINE) return { titlu: 'Toate locurile libere din depozite sunt pline sau deja promise unui cărăuș.', actiune: 'Mărește un depozit sau pictează altul.' }
      return { titlu: `Niciun depozit pentru ${NUME_ITEM_MIC[material] ?? 'marfă'}.`, actiune: 'Pictează un depozit (Zone ▸ Depozit).' }
    }
    if (motiv === Reason.INACCESIBIL || detaliu === DetaliuItem.COMPONENTE_DIFERITE) {
      return { titlu: 'Mormanul sau depozitul nu se poate atinge de aici.', actiune: 'Leagă locurile cu o scară sau un tunel.' }
    }
  }
  if (sursa === 'comanda') {
    if (motiv === Reason.LIPSA_MATERIAL && params?.motiv === 'nu e nimic de sapat') return { titlu: 'Aici e aer: nu e nimic de săpat.', actiune: '' }
    if (motiv === Reason.FARA_SPRIJIN) return textSprijin(params, cifre)
    if (motiv === Reason.CELULA_OCUPATA && params?.item !== undefined) return { titlu: 'Un morman stă acolo.', actiune: 'Mută-l: pictează un depozit în altă parte.' }
    if (motiv === Reason.CAPACITATE_DEPASITA) return { titlu: 'S-a atins limita lumii pentru lucrări sau zone.', actiune: 'Anulează din lucrările vechi.' }
  }
  return textGeneric(motiv, cifre)
}

/**
 * FARA_SPRIJIN pe `params.caz` (src/sim/stabilitate.ts, `CazSprijin`). Cu grinzi, textul unic
 * „nimic asezat la mai putin de 4 pasi — pune o grinda" mintea exact unde conta: grinda exista,
 * dar nu tinea (panoul, I7). `raza` = suportMax, `razaGrinda` = suportRazaGrinda.
 */
export function textSprijin(params: Parametri | undefined, cifre: Cifre = CIFRE_IMPLICITE): TextMotiv {
  const raza = nr(params, 'raza') ?? cifre.suportMax
  const razaGrinda = nr(params, 'razaGrinda') ?? cifre.suportRazaGrinda
  const d = nr(params, 'grindaD')
  switch (params?.caz) {
    case 'NU_ATINGE':
      return { titlu: 'Nu atinge nimic solid pe nivelul ei și nu stă pe nimic.', actiune: 'Zidește întâi o celulă lipită de ceva.' }
    case 'GRINDA_INACTIVA':
      return { titlu: `Grinda de la ${d ?? '?'} pași ar ține-o, dar ea nu ține nimic: nu e prinsă de nimic așezat la cel mult ${raza - 1} pași.`, actiune: 'Ancorează grinda: un stâlp sau un zid așezat lângă ea.' }
    case 'GRINDA_PREA_DEPARTE':
      return { titlu: `Cea mai apropiată grindă care ține e la ${d ?? '?'} pași prin zid; o grindă ține cel mult ${razaGrinda - 1}.`, actiune: `Pune un stâlp pe sol la cel mult ${raza - 1} pași de piesă. O grindă nouă ajută doar dacă e ea prinsă de ceva așezat.` }
    case 'GRINDA_NELEGATA':
      return { titlu: `O grindă e aproape (${nr(params, 'grindaX') ?? '?'}, ${nr(params, 'grindaY') ?? '?'}), dar nu e legată de piesă prin zid pe același nivel.`, actiune: 'Leag-o de piesă cu zid pe nivelul ei.' }
    default:
      return { titlu: `N-ar sta în picioare: nimic așezat la mai puțin de ${raza} pași.`, actiune: 'Zidește mai aproape de ceva, sau pune o grindă prinsă de ceva așezat.' }
  }
}

/** Refuzurile lui `decode`, pe `params.camp`. */
function textIncarcare(motiv: ReasonCode, params?: Parametri): TextMotiv {
  const camp = params?.camp
  if (camp === '(json)' || camp === 'game') return { titlu: 'Fișierul nu e o salvare Kinstead.', actiune: '' }
  if (camp === 'build' || camp === 'schema') return { titlu: `Salvarea e dintr-o versiune mai nouă a jocului (${String(camp)} ${String(params?.valoare ?? '?')} > ${String(params?.maxim ?? '?')}).`, actiune: 'Deschide-o cu versiunea în care a fost făcută.' }
  if (camp === 'migrare') return { titlu: `Salvarea e prea veche: lipsește trecerea de la schema ${String(params?.de_la ?? '?')}.`, actiune: '' }
  void motiv
  return { titlu: `Salvarea e stricată${camp !== undefined ? ` (${String(camp)})` : ''}.`, actiune: '' }
}

/** Textul generic al fiecarui cod. Testul cere un text pentru FIECARE valoare din `Reason`. */
export function textGeneric(motiv: ReasonCode, cifre: Cifre = CIFRE_IMPLICITE): TextMotiv {
  switch (motiv) {
    case Reason.LIPSA_MATERIAL: return { titlu: 'Lipsește materialul.', actiune: 'Sapă sau adu materialul cerut.' }
    case Reason.INACCESIBIL: return { titlu: 'Nu se ajunge acolo.', actiune: 'Leagă locul de așezare cu o scară sau un tunel.' }
    case Reason.FARA_MUNCITOR: return { titlu: 'N-are nimeni voie la munca asta (prioritate 0, sau Exclusiv pe alta).', actiune: 'Dă cuiva prioritate: Oameni ▸ coloana muncii.' }
    case Reason.PRIORITATE_JOASA: return { titlu: 'Are prioritate mai mică decât alte lucrări.', actiune: '' }
    case Reason.REZERVAT: return { titlu: 'Altcineva s-a apucat deja de ea.', actiune: '' }
    case Reason.OCUPAT_DE_OSTIL: return { titlu: 'Un jefuitor stă în drum.', actiune: '' }
    case Reason.IN_AFARA_LUMII: return { titlu: 'E în afara lumii (sau sub fereastra de săpat a locului).', actiune: '' }
    case Reason.ENTITATE_INEXISTENTA: return { titlu: 'Nu mai există.', actiune: '' }
    case Reason.COMANDA_NECUNOSCUTA: return { titlu: 'Comandă necunoscută.', actiune: '' }
    case Reason.BUGET_DEPASIT: return { titlu: 'Drumul e prea lung sau prea încâlcit acum.', actiune: 'Se reîncearcă singur; un drum mai scurt ajută.' }
    case Reason.CAPACITATE_DEPASITA: return { titlu: 'S-a atins o limită.', actiune: '' }
    case Reason.LOC_NECALCABIL: return { titlu: 'Acolo nu se poate sta.', actiune: 'Alege o celulă cu podea dedesubt.' }
    case Reason.CELULA_OCUPATA: return { titlu: 'Cineva stă chiar acolo.', actiune: 'Se face după ce pleacă.' }
    case Reason.VALOARE_INVALIDA: return { titlu: 'Valoare nepotrivită.', actiune: '' }
    case Reason.PREA_DEPARTE: return { titlu: 'Prea departe de oameni.', actiune: 'Apropie lucrarea de așezare.' }
    case Reason.DEJA_DESEMNATA: return { titlu: 'Are deja o lucrare.', actiune: 'Anuleaz-o întâi, dacă vrei alta.' }
    case Reason.INVARIANT_INCALCAT: return { titlu: 'Eroare internă (invariant).', actiune: 'Spune-i dezvoltatorului (Diagnostic, F3).' }
    case Reason.FARA_DEPOZIT: return { titlu: 'Nu are unde fi dus.', actiune: 'Pictează un depozit (Zone ▸ Depozit).' }
    case Reason.FARA_SPRIJIN: return { titlu: `N-ar sta în picioare: nimic așezat la mai puțin de ${cifre.suportMax} pași.`, actiune: 'Zidește mai aproape de ceva, sau pune o grindă prinsă de ceva așezat.' }
    case Reason.CELULA_PLINA: return { titlu: 'E deja ceva solid acolo.', actiune: 'Sapă întâi, sau alege o celulă de aer.' }
    case Reason.AR_INCHIDE: return { titlu: 'Ar închide pe cineva sau ceva înăuntru.', actiune: 'Lasă o deschidere în perete (o coloană liberă de 2 niveluri), mută mormanul sau șterge zona.' }
  }
}

// ---------------------------------------------------------------------------------------------
// activitatea, timpul, numerele
// ---------------------------------------------------------------------------------------------

/**
 * Ce face un pion cu job, din felul si pasul lui (campuri PERSISTED — nu din `ratiune`, care e
 * TRANSIENT si ramane in urma). `ce` = marfa sau piesa, cand e cazul.
 */
export function textActivitate(felJob: number, pas: number, ce = ''): string {
  switch (felJob) {
    case FelJob.NICIUNUL: return 'Stă'
    case FelJob.SAPA: return pas === PasJob.LUCREAZA ? 'Sapă' : 'Merge să sape'
    case FelJob.CARA:
      if (pas === PasCara.MERGE_SURSA) return `Merge după ${ce || 'marfă'}`
      if (pas === PasCara.RIDICA) return `Ridică ${ce || 'marfă'}`
      if (pas === PasCara.MERGE_DEST) return `Cară ${ce || 'marfă'} spre depozit`
      return `Lasă ${ce || 'marfa'} în depozit`
    case FelJob.MANANCA: return pas === 0 ? 'Merge să mănânce' : 'Mănâncă'
    case FelJob.DOARME: return pas === 0 ? 'Merge să doarmă' : 'Doarme'
    case FelJob.CONSTRUIESTE:
      if (pas === PasConstruieste.MERGE_SURSA) return 'Merge după piatră'
      if (pas === PasConstruieste.RIDICA) return 'Ridică piatră'
      if (pas === PasConstruieste.MERGE_SANTIER) return `Duce piatră la ${ce || 'șantier'}`
      return `Zidește${ce ? ` ${ce}` : ''}`
    default: return 'Face ceva'
  }
}

/** Timpul de joc ca h:mm:ss, din tickuri. */
export function textTimp(tick: number, ticksPerSecond: number): string {
  const s = Math.floor(tick / ticksPerSecond)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

const FORMAT_RO = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 })

/** Un numar intreg ca in romana („1.240"): acelasi `Intl` si in node, si in Electron. */
export function textNumar(n: number): string {
  return FORMAT_RO.format(Math.trunc(n))
}

/** Minute de joc, rotunjite, pentru prognoze: „~16 min", „~2 h 5 min". */
export function textMinute(min: number): string {
  if (!Number.isFinite(min)) return '—'
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `~${m} min`
  return `~${Math.floor(m / 60)} h ${m % 60} min`
}
