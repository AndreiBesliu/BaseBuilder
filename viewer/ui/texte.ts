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
import { Anotimp, momentul, panaLaAnotimp, tickuriPeOra } from '../../src/sim/calendar.ts'
import type { Moment } from '../../src/sim/calendar.ts'
import { tAfara } from '../../src/sim/clima.ts'
import type { Rules } from '../../src/sim/content.ts'
import { ClasaDir } from '../../src/sim/fete.ts'
import type { ClasaDirId } from '../../src/sim/fete.ts'
import { Destinatie, PONDERE_TOTALA } from '../../src/sim/termic.ts'
import type { CanalTermic, DestinatieId } from '../../src/sim/termic.ts'
import type { StatTermic } from '../../src/sim/temperatura.ts'

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
  /** Cat de sus zideste un pion fata de celula pe care sta. */
  readonly atingereSusM: number
  /** Cat de departe cauta un pion lucrari. */
  readonly razaLucru: number
  /** Cat de departe cauta un pion mancare sau pat. */
  readonly razaNevoi: number
}

export const CIFRE_IMPLICITE: Cifre = { suportMax: 4, suportRazaGrinda: 10, agentHeadroomM: 2, maxStepM: 1, cantitatePiesa: 20, pragRidicare: 10, atingereSusM: 2, razaLucru: 96, razaNevoi: 96 }

/**
 * Un numar urmat de substantiv, cu „de" unde il cere romana: dupa 20 si peste, cu exceptia celor
 * terminate in 01–19 („101 oameni", dar „120 de oameni", „1.000 de piatră"). Numarul trece prin
 * `textNumar` („2.000"). `unu` e forma de singular, daca difera de „1 + plural".
 */
export function cant(n: number, plural: string, unu?: string): string {
  if (n === 1 && unu !== undefined) return unu
  const r = Math.abs(Math.trunc(n)) % 100
  const de = Math.abs(Math.trunc(n)) >= 20 && (r === 0 || r >= 20)
  return `${textNumar(n)} ${de ? 'de ' : ''}${plural}`
}

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
  [Piesa.USA]: 'Ușă',
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
  [Material.USA]: 'Ușă',
}

/**
 * Unde e `la` față de `de`, în vorbe: „aici", „la 5 m", „cu 2 m mai sus, la 4 m". Coordonatele absolute
 * nu corespund la nimic din ce vede jucătorul (panoul camerelor, JUC-3).
 */
export function textLoc(de: { x: number; y: number; z: number }, la: { x: number; y: number; z: number }): string {
  const d = Math.round(Math.hypot(la.x - de.x, la.y - de.y))
  const dz = la.z - de.z
  const bucati: string[] = []
  if (dz > 0) bucati.push(`cu ${dz} m mai sus`)
  if (dz < 0) bucati.push(`cu ${-dz} m mai jos`)
  if (d > 1) bucati.push(`la ${d} m`)
  return bucati.length === 0 ? 'chiar aici' : bucati.join(', ')
}

/** Podeaua pe niveluri: „9 m² de podea" sau „23 m² jos · 23 m² sus". */
function textPodea(podea: readonly (readonly [number, number])[]): string {
  if (podea.length === 0) return 'fără podea'
  if (podea.length === 1) return `${podea[0]![1]} m² de podea`
  if (podea.length === 2) return `${podea[0]![1]} m² jos · ${podea[1]![1]} m² sus`
  return `podea pe ${podea.length} niveluri, ${podea.reduce((s, p) => s + p[1], 0)} m²`
}

/**
 * Câte goluri (uși) sunt în celulele propuse: grupuri 6-conexe. Explicația întoarce celulele tuturor
 * ușilor la un loc; două goluri a câte două celule erau „o ușă (4 celule)" (recenzia încăperilor, EXP-7).
 */
export function goluriUsi(celule: readonly { x: number; y: number; z: number }[]): number {
  const vazut = new Set<number>()
  let goluri = 0
  for (let i = 0; i < celule.length; i++) {
    if (vazut.has(i)) continue
    goluri++
    const stiva = [i]
    vazut.add(i)
    while (stiva.length > 0) {
      const a = celule[stiva.pop()!]!
      for (let j = 0; j < celule.length; j++) {
        if (vazut.has(j)) continue
        const b = celule[j]!
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) !== 1) continue
        vazut.add(j)
        stiva.push(j)
      }
    }
  }
  return goluri
}

/** „o celulă", „două celule", „4 celule". */
function textCelule(n: number): string {
  return n === 1 ? 'o celulă' : n === 2 ? 'două celule' : cant(n, 'celule')
}

/**
 * Textul încăperii din inspector. În UI conceptul se numește „încăpere": „camera" e deja camera de
 * vedere în nouă texte (panoul, JUC-11).
 *
 * `usaDesemnata`: toate celulele ușilor propuse au deja desemnarea de ușă — inspectorul nu mai cere
 * „Pune ușa" (un al doilea clic nu făcea nimic și nu spunea nimic: recenzia încăperilor, ECR-12).
 *
 * `CER` nu are text: `incaperea()` întoarce null pe aerul de sub cer, deci ramura nu se atingea niciodată
 * (ECR-12); inspectorul arată secțiunea doar când titlul nu e gol.
 */
export function textIncapere(i: { readonly sub: boolean; readonly celula: { x: number; y: number; z: number }; readonly e: import('../../src/sim/camere-explica.ts').Explicatie }, usaDesemnata = false): { titlu: string; actiune: string; bine: boolean } {
  const pre = i.sub ? 'Sub acoperișul ăsta: ' : ''
  const e = i.e
  switch (e.fel) {
    case 'NU_E_AER':
    case 'CER':
      return { titlu: '', actiune: '', bine: true }
    case 'INCAPERE': {
      const usi = e.usi === 0 ? 'fără ușă' : e.usi === 1 ? '1 ușă' : `${e.usi} uși`
      return { titlu: `${pre}Încăpere · ${e.volum} m³ · ${textPodea(e.podea)} · ${usi}.`, actiune: '', bine: true }
    }
    case 'DEPARTE': return { titlu: `${pre}Nu e încăpere: aerul iese undeva departe (acoperit, ${e.volum} m³ legați).`, actiune: 'Împarte spațiul cu pereți și uși.', bine: false }
    case 'DESCHISA': {
      const unde = textLoc(i.celula, e.gaura)
      const cum = e.directie === 'SUS' ? `printr-o gaură în acoperiș, ${unde}` : `printr-un gol în perete, ${unde}`
      let actiune: string
      if (e.volumCuUsi !== null) {
        const n = goluriUsi(e.usiPropuse)
        if (usaDesemnata) actiune = `${n === 1 ? 'Ușa e desemnată — o zidesc oamenii' : 'Ușile sunt desemnate — le zidesc oamenii'}. Apoi devine o încăpere de ${e.volumCuUsi} m³.`
        else actiune = `${n === 1 ? 'Pune o ușă în gol' : `Pune ${n} uși`} (${textCelule(e.usiPropuse.length)}): devine o încăpere de ${e.volumCuUsi} m³.`
      } else {
        actiune = e.directie === 'SUS' ? 'Pune o podea peste gaură.' : 'Închide-l cu un perete sau cu o ușă.'
      }
      return { titlu: `${pre}Nu e încăpere: aerul iese ${cum}.`, actiune, bine: false }
    }
  }
}

/**
 * Indiciul uneltei Ușă. Planul ușii ignoră Contur/Plin (un gol se pune întreg), deci indiciul nu mai
 * spune „(plin)" și butonul nu se arată (ECR-12); spune ce face clicul și ce face dreptunghiul. `cota`
 * = nivelul activ (planul de tăiere), null = toate nivelurile.
 */
export function textIndiciuUsa(cota: number | null): string {
  const unde = cota === null ? '' : ` pe nivelul activ (${cota - 1} m)`
  return `<b>Ușă</b>${unde} · clic pe un gol de perete sau pe o gaură de podea: o pune întreagă · trage = o ușă în fiecare gol din dreptunghi · P = altă piesă · Esc`
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
      if (detaliu === DetaliuMotiv.FARA_LOC_SIGUR) return { titlu: 'Niciun loc SIGUR de lucru: omul ar rămâne sus sau închis când se termină planul.', actiune: 'Pune o scară sau o ușă — sau așteaptă piesa de care depinde accesul.' }
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
    case Reason.CELULA_OCUPATA: return { titlu: 'Cineva stă chiar acolo.', actiune: 'Încearcă din nou după ce pleacă.' }
    case Reason.VALOARE_INVALIDA: return { titlu: 'Valoare nepotrivită.', actiune: '' }
    case Reason.PREA_DEPARTE: return { titlu: 'Prea departe de oameni.', actiune: 'Apropie lucrarea de așezare.' }
    case Reason.DEJA_DESEMNATA: return { titlu: 'Are deja o lucrare.', actiune: 'Anuleaz-o întâi, dacă vrei alta.' }
    case Reason.INVARIANT_INCALCAT: return { titlu: 'Eroare internă (invariant).', actiune: 'Spune-i dezvoltatorului (Diagnostic, F3).' }
    case Reason.FARA_DEPOZIT: return { titlu: 'Marfa nu are unde fi dusă.', actiune: 'Pictează un depozit (Zone ▸ Depozit).' }
    case Reason.FARA_SPRIJIN: return { titlu: `N-ar sta în picioare: nimic așezat la mai puțin de ${cifre.suportMax} pași.`, actiune: 'Zidește mai aproape de ceva, sau pune o grindă prinsă de ceva așezat.' }
    case Reason.CELULA_PLINA: return { titlu: 'E deja ceva solid acolo.', actiune: 'Sapă întâi, sau alege o celulă de aer.' }
    case Reason.AR_INCHIDE: return { titlu: 'Ar închide pe cineva sau ceva înăuntru.', actiune: 'Pune o ușă în locul unui perete, mută mormanul sau șterge zona.' }
  }
}

/**
 * De ce STA un pion, din punctul LUI de vedere. Textul generic e scris pentru o lucrare sau un
 * morman („nu are unde fi dus", „prea departe de oameni") si, lipit dupa „Stă:", facea din om
 * subiectul propozitiei gresite (recenzia UI-ului, MOD-6: „Stă: nu are unde fi dus" 91% din timpul
 * unui incepator fara depozit, fara nicio actiune).
 */
export function textRatiunePion(motiv: ReasonCode, cifre: Cifre = CIFRE_IMPLICITE): string {
  switch (motiv) {
    case Reason.FARA_DEPOZIT: return 'Stă: marfa de cărat n-are unde fi dusă — pictează sau mărește un depozit'
    case Reason.FARA_MUNCITOR: return 'Stă: n-are voie la munca rămasă (prioritate 0, sau Exclusiv pe alta)'
    case Reason.PREA_DEPARTE: return `Stă: lucrările rămase sunt la peste ${cant(cifre.razaLucru, 'celule')} de el`
    case Reason.REZERVAT: return 'Stă: lucrările rămase sunt luate de alții'
    case Reason.LIPSA_MATERIAL: return 'Stă: lipsește materialul pentru construit'
    case Reason.INACCESIBIL: return 'Stă: nu ajunge la nicio lucrare rămasă'
    case Reason.AR_INCHIDE: return 'Stă: lucrarea rămasă ar închide pe cineva sau ceva înăuntru'
    case Reason.FARA_SPRIJIN: return 'Stă: piesele rămase n-ar sta încă în picioare'
    case Reason.BUGET_DEPASIT: return 'Stă: drumul e prea lung acum, reîncearcă'
    case Reason.OCUPAT_DE_OSTIL: return 'Stă: un jefuitor e în drum'
    default: return `Stă: ${textGeneric(motiv, cifre).titlu.replace(/\.$/, '').replace(/^./, (c) => c.toLowerCase())}`
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
      // `ce` vine cu cantitatea si acordul deja facut (`cant`): „50 de piatră".
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

// ---- bara de sus: calendarul si temperatura de afara (design temperatura v2, §6) ----------------

/** Pe `Anotimp`: PRIMAVARA, VARA, TOAMNA, IARNA. */
export const NUME_ANOTIMP: readonly string[] = ['Primăvară', 'Vară', 'Toamnă', 'Iarnă']

/** Sub atat pe ora urmatoare (Q16 °C: un sfert de grad), sageata e „→": la varful zilei si in vale. */
export const PRAG_TENDINTA_Q16 = 16384

/** Grade intregi, cu minusul tipografic: „8°", „−3°", „0°" (si −0,4 °C e „0°", nu „−0°"). */
export function textGrade(q16: number): string {
  const g = Math.round(q16 / 65536)
  return g < 0 ? `−${-g}°` : `${g}°`
}

/** Unde merge aerul in ora de joc urmatoare: „↗", „↘" sau „→". `delta` = T(peste o ora) − T(acum), Q16 °C. */
export function textTendinta(deltaQ16: number): string {
  if (deltaQ16 >= PRAG_TENDINTA_Q16) return '↗'
  if (deltaQ16 <= -PRAG_TENDINTA_Q16) return '↘'
  return '→'
}

/**
 * Bara de sus: „Toamnă 2/4 · 14:20 · 8° ↘". Buget: ≤ 130 px la 12 px (panoul, L5-4: textul v1, „Toamnă ·
 * ziua 2 din 4 · 14:20 · 8 °C ↘", nu incapea la 1.100 px). Ce nu incape aici sta in `textTitluCalendar`.
 */
export function textCalendar(m: Moment, zilePeAnotimp: number, tAfaraQ16: number, deltaOraQ16: number): string {
  const ora = `${String(m.ora).padStart(2, '0')}:${String(m.minut).padStart(2, '0')}`
  return `${NUME_ANOTIMP[m.anotimp]} ${m.zi}/${zilePeAnotimp} · ${ora} · ${textGrade(tAfaraQ16)} ${textTendinta(deltaOraQ16)}`
}

/** O durata de joc in zile, sau in ore sub o zi: „în 3 zile", „într-o zi", „în 5 ore", „într-o oră". */
export function textPesteZile(tickuri: number, ziTicks: number): string {
  const zile = Math.floor(tickuri / ziTicks)
  if (zile >= 2) return `în ${cant(zile, 'zile')}`
  if (zile === 1) return 'într-o zi'
  const ore = Math.ceil((tickuri * 24) / ziTicks)
  return ore >= 2 ? `în ${cant(ore, 'ore')}` : 'într-o oră'
}

/** Minute REALE: „41 min", „2 h 03 min", „< 1 min". */
export function textMinuteReale(min: number): string {
  const m = Math.round(min)
  if (m < 1) return '< 1 min'
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`
}

/**
 * Tooltip-ul calendarului: „Iarna în 3 zile (≈ 41 min la 3×) · timp de joc 1:23:45" — cat mai e pana la
 * presiune, si in timpul REAL la viteza aleasa (panoul, L3-6: ca jucatorul sa vada ritmul). In iarna:
 * „Iarna se termină în 2 zile (…)". Timpul total de joc a iesit din bara; ramane aici si in numele
 * salvarilor.
 */
export function textTitluCalendar(p: {
  readonly tick: number
  readonly moment: Moment
  /** Tickuri pana la urmatorul inceput de iarna, si de primavara (`panaLaAnotimp`). */
  readonly panaLaIarna: number
  readonly panaLaPrimavara: number
  readonly ziTicks: number
  readonly ticksPerSecond: number
  /** Viteza aleasa (1, 2, 3), si in pauza. */
  readonly viteza: number
}): string {
  const iarna = p.moment.anotimp === Anotimp.IARNA
  const t = iarna ? p.panaLaPrimavara : p.panaLaIarna
  const reale = textMinuteReale(t / p.ticksPerSecond / p.viteza / 60)
  const ce = iarna ? `Iarna se termină ${textPesteZile(t, p.ziTicks)}` : `Iarna ${textPesteZile(t, p.ziTicks)}`
  return `${ce} (≈ ${reale} la ${p.viteza}×) · timp de joc ${textTimp(p.tick, p.ticksPerSecond)}`
}

/**
 * Bara de sus la tickul `tick` al lumii `seed`: textul („Toamnă 2/4 · 14:20 · 8° ↘") si tooltip-ul, intr-o SINGURA
 * compunere — `scrieCalendar` (panouri.ts) o scrie, testele si ui-fum („bara-sus-calendar") o compara. Tendinta e pe
 * ora de joc urmatoare: clima e o functie pura de (seed, tick). Inainte, testul copia compunerea din panouri.ts, iar
 * ui-fum verifica doar formatul: o sageata inversata, tooltip-ul din iarna socotit pana la URMATOAREA iarna sau clima
 * altei lumi (seed 0) treceau toate portile (recenzia t.2a, L2-3).
 */
export function baraDeSus(tick: number, seed: number, rules: Rules, viteza: number): { readonly text: string; readonly titlu: string } {
  const m = momentul(tick, rules)
  const acum = tAfara(seed, tick, rules)
  const pesteOra = tAfara(seed, tick + tickuriPeOra(rules), rules)
  return {
    text: textCalendar(m, rules.calendar.zilePeAnotimp, acum, pesteOra - acum),
    titlu: textTitluCalendar({
      tick,
      moment: m,
      panaLaIarna: panaLaAnotimp(tick, Anotimp.IARNA, rules),
      panaLaPrimavara: panaLaAnotimp(tick, Anotimp.PRIMAVARA, rules),
      ziTicks: rules.calendar.ziTicks,
      ticksPerSecond: rules.ticksPerSecond,
      viteza,
    }),
  }
}

/** Minute de joc, rotunjite, pentru prognoze: „~16 min", „~2 h 5 min". */
export function textMinute(min: number): string {
  if (!Number.isFinite(min)) return '—'
  const m = Math.max(0, Math.round(min))
  if (m < 60) return `~${m} min`
  return `~${Math.floor(m / 60)} h ${m % 60} min`
}

// ---- temperatura pe incaperi: inspectorul si overlay-ul U (t.2a §6; t.2b §8: temperatura e stare) ---------

/**
 * Q16 °C cu o zecimala si minusul tipografic: „4,5", „−0,3". Rotunjirea e simetrica (jumatatea departe de
 * zero, ca in regimul permanent), iar ce se rotunjeste la zero e „0,0", nu „−0,0".
 */
export function textZecimi(q16: number): string {
  const z = Math.round((Math.abs(q16) * 10) / 65536)
  const s = `${Math.floor(z / 10)},${z % 10}`
  return q16 < 0 && z > 0 ? `−${s}` : s
}

/** Grade intregi, in propozitii: „12", „−3", „0" (si −0,4 °C e „0"). */
export function textGradeIntregi(q16: number): string {
  const g = Math.round(Math.abs(q16) / 65536)
  return q16 < 0 && g > 0 ? `−${g}` : `${g}`
}

/** Randul 1 al inspectorului (t.2b §8): „6,2 °C · afară 12 °C" — T-ul de ACUM, din stare, si aerul de afara la tickul lumii. */
export function textTemperaturaAcum(tQ16: number, tAfaraQ16: number): string {
  return `${textZecimi(tQ16)} °C · afară ${textGradeIntregi(tAfaraQ16)} °C`
}

/** Randul 1 cand componenta n-are T (un invariant incalcat; §8, UI-6): pe un rand, fara cifre inventate. */
export const TEXT_TEMPERATURA_NECUNOSCUTA = 'Temperatura nu se știe (eroare internă)'

/**
 * Randul 2 (§8, UI-2): „trage spre 4,8 °C ↘", sau „stabil" cand zecimile lui X_tot sunt chiar ale lui T — pragul e
 * TEXTUL, nu o diferenta: „stabil" langa „4,4 °C" inseamna ca si tinta se scrie „4,4". X_tot = X + P/ΣG (oamenii
 * aratati), deci sageata arata incotro merge T si cu oameni inauntru.
 */
export function textTragere(tQ16: number, xTotQ16: number): string {
  const x = textZecimi(xTotQ16)
  if (x === textZecimi(tQ16)) return 'stabil'
  return `trage spre ${x} °C ${xTotQ16 < tQ16 ? '↘' : '↗'}`
}

/** Randul 2 cand linia grafului nu se poate citi (un invariant: graful nu e la zi); scurt, pe un rand. */
export const TEXT_TRAGERE_NECUNOSCUTA = 'trage spre: nu se știe'

/**
 * Randul 3 (§8, JOC-6): CATI oameni sunt inauntru, nu „+X °C" — P/ΣG ar arata efectul ca si cum ar sta acolo permanent,
 * de 2–76 de ori peste cel real (panoul, JOC-6).
 */
export function textOameni(n: number): string {
  return n === 0 ? 'oameni: niciunul' : `oameni: ${n} înăuntru`
}

/** Alerta erorii interne a temperaturii (§5.3, UI-6): textul existent al invariantului, cu locul lui. */
export function textEroareTemperatura(): string {
  const t = textGeneric(Reason.INVARIANT_INCALCAT)
  return `Temperatura: ${t.titlu} ${t.actiune}`
}

/**
 * Alerta unei exceptii din simulare (§5.3, UI-6): jocul se pune pe pauza, randarea si UI-ul merg mai departe. NU mai spune
 * „Spațiu o pornește din nou" (recenzia t.2b, E4): exceptia lasa lumea pe jumatate de tick, deci simularea ramane oprita
 * pe pagina, iar salvarile se refuza — drumul inapoi e ultima salvare.
 */
export function textEroareSimulare(): string {
  return `Simularea s-a oprit: eroare internă. ${textGeneric(Reason.INVARIANT_INCALCAT).actiune} Lumea de acum poate fi pe jumătate de pas, deci nu mai pornește și nu se mai salvează: încarcă ultima salvare (Meniu ▸ Încarcă…).`
}

/** Refuzul unei porniri (Spațiu, 1×–3×) sau al unei salvari cu simularea oprita (recenzia t.2b, E4). */
export function textSimulareOprita(): string {
  return 'Simularea e oprită după o eroare internă: lumea de acum poate fi pe jumătate de pas. Încarcă ultima salvare (Meniu ▸ Încarcă…).'
}

/**
 * Randul „temperatura" din Diagnostic (F3; §5.3, UI-6; recenzia t.2b GRAF-1, SAV-R2): pasii, invariantii (cu motivul
 * ultimului), taierile, echilibrele oprite la plafon, resturile normalizate la incarcare, diferentele grafului la salvare,
 * exceptiile si simularea oprita. Toate contoarele se scriu mereu (0 inclus). `taieri` vine cu reparatiile simularii
 * (ramura t2b-sim): unde lipseste, 0. Rosu (`avertizare`) la un semnal de eroare: invariant, taietura, graf diferit,
 * exceptie, simulare oprita; echilibrele neconvergente si resturile normalizate sunt informatie.
 */
export function randTermicF3(st: StatTermic, exceptii: number, oprita: boolean): { text: string; avertizare: boolean } {
  const taieri = (st as StatTermic & { readonly taieri?: number }).taieri ?? 0
  const text = `pasi ${st.pasi} · invarianti ${st.invarianti}${st.invarianti > 0 ? ` (ultimul: ${st.ultimulInvariant})` : ''}`
    + ` · taieri ${taieri} · neconvergente ${st.echilibreNeconvergente} · rest normalizat ${st.restNormalizat}`
    + ` · graf diferit la salvare ${st.grafDiferitLaSalvare}${exceptii > 0 ? ` · exceptii ${exceptii}` : ''}${oprita ? ' · simularea OPRITA' : ''}`
  return { text, avertizare: st.invarianti > 0 || taieri > 0 || st.grafDiferitLaSalvare > 0 || exceptii > 0 || oprita }
}

/** Cifra unei piese de incapere pe overlay-ul Temperatura: „4,5°". */
export function textEticheta(tQ16: number): string {
  return `${textZecimi(tQ16)}°`
}

/** Materialele de pe drumul unei fete, mici si scurte („3 m rocă+pământ"). Indexat cu `MaterialId`. */
export const NUME_MATERIAL_DRUM: Readonly<Record<number, string>> = {
  [Material.AER]: 'aer',
  [Material.ROCA]: 'rocă',
  [Material.PAMANT]: 'pământ',
  [Material.IARBA]: 'iarbă',
  [Material.APA]: 'apă',
  [Material.LEMN_CONSTRUIT]: 'lemn',
  [Material.PIATRA_CONSTRUITA]: 'piatră',
  [Material.MOLOZ]: 'moloz',
  [Material.GRINDA]: 'grindă',
  [Material.USA]: 'ușă',
}

/** O pondere Q16 (65536 = 100%) ca procent intreg; peste 0, dar sub 0,5%, e „<1%", nu „0%". */
export function textProcent(q16: number): string {
  const p = Math.round((q16 * 100) / PONDERE_TOTALA)
  return p === 0 && q16 > 0 ? '<1%' : `${p}%`
}

/**
 * Drumul unei compozitii (cheia canonica din fete.ts: `material x celule`, unite cu „+"): „3 m rocă+pământ",
 * materialele cu cele mai multe celule intai. '' = drumul gol.
 */
export function textDrum(compozitie: string): string {
  if (compozitie === '') return ''
  const parti = compozitie.split('+').map((p) => p.split('x').map(Number) as [number, number])
  let m = 0
  for (const [, n] of parti) m += n
  parti.sort((a, b) => b[1] - a[1] || a[0] - b[0])
  return `${m} m ${parti.map(([mat]) => NUME_MATERIAL_DRUM[mat] ?? '?').join('+')}`
}

/** Pe `Destinatie`: AFARA, SOL, APA, INCAPERI, ADANC (ADANC nu se scrie asa: vezi `textCanale`). */
const NUME_DESTINATIE_TEXT: readonly string[] = ['aer de afară', 'sol', 'apă', 'încăperi vecine', 'zid gros']

/**
 * Clasa de directie a unui canal, in cuvinte. SUS e „acoperiș" spre cer, altfel „tavan"; o usa in sus sau in jos e
 * chepengul; fetele DESCHISE (golul, ventilatia) sunt „gol deschis", nu „pereți" (recenzia ECRAN, L4-1).
 */
function numeClasa(clasa: ClasaDirId, usa: boolean, deschis: boolean, dest: DestinatieId): string {
  if (deschis) return 'gol deschis'
  if (usa) return clasa === ClasaDir.LAT ? 'ușă' : 'chepeng'
  if (clasa === ClasaDir.LAT) return 'pereți'
  if (clasa === ClasaDir.JOS) return 'podea'
  return dest === Destinatie.AFARA ? 'acoperiș' : 'tavan'
}

/** Un grup de canale cu aceeasi destinatie (`textCanale`). */
function textGrupCanale(dest: DestinatieId, rs: readonly CanalTermic[], pondere: number): string {
  // Temperatura destinatiei, medie pe g (ca in canaleTermice); doar pentru afisare, deci pe Number.
  let g = 0
  let gt = 0
  for (const r of rs) { g += r.gQ16; gt += r.gQ16 * r.tDestQ16 }
  const r0 = rs[0]!
  const t = `~${textGradeIntregi(g > 0 ? gt / g : r0.tDestQ16)} °C`
  const adanc = dest === Destinatie.ADANC
  // O fata ADANC e un zid plin mai gros de K celule: „peste 8 m de piatră", nu „sol adânc" (§5).
  const cap = adanc ? `peste ${r0.grosime} m de ${NUME_MATERIAL_DRUM[r0.material] ?? 'zid'}` : NUME_DESTINATIE_TEXT[dest]!
  if (rs.length > 1) return `${textProcent(pondere)} ${cap} (${rs.map((r) => `${numeClasa(r.clasa, r.usa, r.deschis, dest)} ${textProcent(r.pondereQ16)}`).join(', ')}, ${t})`
  const clasa = numeClasa(r0.clasa, r0.usa, r0.deschis, dest)
  if (adanc) return `${textProcent(pondere)} ${clasa} ${cap} (${t})`
  const prinZid = (dest === Destinatie.AFARA || dest === Destinatie.INCAPERI) && !r0.usa
  // Golul (fata DESCHISA) n-are drum: textDrum('') = '', deci „prin gol deschis (~X °C)".
  const drum = !prinZid ? '' : textDrum(r0.compozitie)
  return `${textProcent(pondere)} ${cap} prin ${clasa} (${drum ? `${drum}, ` : ''}${t})`
}

/**
 * Pe ce sta temperatura de echilibru a unei incaperi (`canaleTermice`, src/sim/termic.ts): randurile cu aceeasi
 * destinatie contopite, in ordinea ponderii in ΣG, plus restul:
 *   „71% aer de afară (pereți 51%, acoperiș 21%, ~14 °C) · 25% sol prin podea (~6 °C) · rest 4%"
 * FARA „pierde"/„câștigă": semnul unui canal se schimba cu ziua si cu anotimpul (panoul, L5-1: acoperisul unei
 * pivnite castiga caldura 63–67% din an), ponderea in ΣG nu (e geometrica, deci textul nu sare intre tickuri).
 */
export function textCanale(c: { readonly randuri: readonly CanalTermic[]; readonly rest: { readonly pondereQ16: number } }): string {
  const grupuri: { dest: DestinatieId; rs: CanalTermic[]; pondere: number }[] = []
  for (const r of c.randuri) {
    let gr = grupuri.find((x) => x.dest === r.destinatie)
    if (gr === undefined) { gr = { dest: r.destinatie, rs: [], pondere: 0 }; grupuri.push(gr) }
    gr.rs.push(r)
    gr.pondere += r.pondereQ16
  }
  // Sortarea e stabila: la ponderi egale ramane ordinea randurilor (cea din canaleTermice).
  grupuri.sort((a, b) => b.pondere - a.pondere)
  const bucati = grupuri.map((gr) => textGrupCanale(gr.dest, gr.rs, gr.pondere))
  if (c.rest.pondereQ16 > 0) bucati.push(`rest ${textProcent(c.rest.pondereQ16)}`)
  return bucati.join(' · ')
}

/** Cifrele legendei overlay-ului Temperatura (U): „−1,2 … 4,5 °C · afară 12 °C" — temperaturile de ACUM (t.2b §8). `n` = componente la nivel. */
export function textIntervalTemperatura(n: number, min: number, max: number, tAfaraQ16: number): string {
  if (n === 0) return `Nimic acoperit pe nivelul ăsta · afară ${textGradeIntregi(tAfaraQ16)} °C`
  const interval = textZecimi(min) === textZecimi(max) ? `~${textZecimi(min)} °C` : `${textZecimi(min)} … ${textZecimi(max)} °C`
  return `${interval} · afară ${textGradeIntregi(tAfaraQ16)} °C`
}
