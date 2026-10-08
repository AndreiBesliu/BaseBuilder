/**
 * UI-ul de joc: panourile DOM peste canvas. Citeste lumea prin `model.ts` (testat in node) si
 * schimba ceva DOAR prin contextul primit de la main.ts, care trece tot prin `applyCommand`.
 *
 * Se incarca DOAR prin `import()` dinamic din main.ts, si DOAR in afara rularilor de gate: pe o
 * pagina de masura nu exista nici modulul asta, nici stilul lui, nici ascultatorii (panoul de
 * design al UI-ului, CG-1). Tastele NU se asculta aici: main.ts are un singur dispecer
 * (`viewer/ui/taste.ts`) si cheama metodele de mai jos.
 *
 * Reimprospatarea e rara si diferentiala: panourile la 4 Hz, alertele la 2 Hz, iar `text`/`attr`
 * scriu in DOM doar ce s-a schimbat.
 */

import './ui.css'
import type { Command } from '../../src/sim/commands.ts'
import type { Rules } from '../../src/sim/content.ts'
import type { World } from '../../src/sim/state.ts'
import { CATEGORII, Faction, Item, Piesa } from '../../src/sim/state.ts'
import { Zona } from '../../src/sim/zone.ts'
import { ascuns, attr, clasa, h, text } from './dom.ts'
import { ICON } from './iconite.ts'
import { cauzaGolirii, creeazaMemorieTermica, creeazaPrevizualizare, golita, inspecteazaCelula, refacePrevizualizarea, inspecteazaPion, prognozaHrana, randuriOameni, rezumatColonie, semnaleAlerte } from './model.ts'
import { cheieInspectorCelula, creeazaMemorieIncapere, usilePropuse } from './memorie-incapere.ts'
import type { UsilePropuse } from './memorie-incapere.ts'
import type { Bara, IncapereLa, InspectieCelula, NormalaFetei, Previz, RandOm } from './model.ts'
import { actualizeaza, creeazaAlerte, eveniment, REGULI_ALERTE, Severitate } from './alerte.ts'
import type { StareAlerta, Tinta } from './alerte.ts'
import { cant, NUME_ITEM, NUME_MATERIAL, NUME_PIESA, NUME_ZONA, textCalendar, textIncapere, textIndiciuUsa, textMinute, textNumar, textPrioritatePersonala, textTimp, textTitluCalendar } from './texte.ts'
import { Anotimp, momentul, panaLaAnotimp, tickuriPeOra } from '../../src/sim/calendar.ts'
import { tAfara } from '../../src/sim/clima.ts'
import { conturImplicit, Unealta } from './dreptunghi.ts'
import type { UnealtaId } from './dreptunghi.ts'
import { eTimpulSalvariiAutomate, idAutomata, salvareAutomataPermisa } from './salvari-plic.ts'
import type { RezumatSalvare } from './salvari-plic.ts'
import { HRANA_PE_OM } from './pornire.ts'
import { FEL_RESURSA } from '../resurse.ts'

export type Overlay = 'J' | 'S' | 'G' | 'I' | 'U'
export type ModJoc = 'titlu' | 'joc-nou' | 'incarca' | 'verificare'

/** Ce ii da main.ts UI-ului. Singura cale prin care UI-ul schimba ceva. */
export interface ContextUI {
  readonly world: World
  readonly rules: Rules
  readonly mod: ModJoc
  /** Mesajul de pornire, daca pornirea n-a mers cum s-a cerut (ex. salvarea nu s-a putut incarca). */
  readonly mesajPornire: string
  /** Bifele „Primii pasi" din salvare, daca s-a incarcat una. */
  readonly primiPasi: readonly boolean[] | null
  pauza(): boolean
  seteazaPauza(p: boolean): void
  viteza(): number
  seteazaViteza(v: number): void
  /** Tickuri rulate pe secunda reala / `ticksPerSecond`, pe ultimele ~2 s; 0 in pauza. */
  vitezaEfectiva(): number
  /** Aplica, cu refuzurile traduse; o singura redesenare a overlay-urilor la final. */
  aplica(cmds: readonly Command[]): { readonly aplicate: number; readonly refuzuri: readonly string[] }
  nivel(): { readonly cota: number | null; readonly lo: number; readonly hi: number; readonly sol: number | null }
  seteazaNivel(cota: number | null): void
  overlayPornit(o: Overlay): boolean
  comutaOverlay(o: Overlay): void
  /** Randul de cifre al overlay-ului, sau '' (ex. „89 fără acces (89 scară, 0 ușă)"). */
  cifreOverlay(o: Overlay): string
  /** Previzualizarile din S sunt mai vechi decat lumea: legenda spune, butonul „Refă" le reface. */
  stabilitateInvechita(): boolean
  refaStabilitatea(): void
  /** Camera la celula; `slice`: cota planului de taiere dorita (null = nu atinge nivelul). */
  duLa(wx: number, wy: number, z: number, slice: number | null): void
  urmareste(id: number | null): void
  distantaLaCamera(wx: number, wy: number, z: number): number
  comutaDiagnostic(): void
  /** Se trage un dreptunghi acum (salvarea automata asteapta). */
  tragere(): boolean
  salveaza(id: string, nume: string, primiPasi: readonly boolean[]): Promise<number>
  descarca(primiPasi: readonly boolean[]): void
  listaSalvari(): Promise<readonly RezumatSalvare[]>
  incarca(id: string): void
  stergeSalvarea(id: string): Promise<unknown>
  /** Un fisier ales de jucator: validat, pus intr-un slot, apoi incarcat. `null` = merge; altfel motivul. */
  incarcaFisier(f: File): Promise<string | null>
  jocNou(p: { seed: number; oameni: number; piatra: number; hrana: number }): void
}

export interface UI {
  unealta: UnealtaId
  piesa: number
  zonaFel: number
  contur: boolean
  unStrat: boolean
  prioritate: number
  cadru(dtMs: number): void
  alegeUnealta(u: UnealtaId): void
  /** P: ciclul de azi (sapa → perete → podea → scara → grinda), cu unealta potrivita. */
  ciclezaPiesa(): void
  /** Numele de azi al piesei alese (randul „piesa" din Diagnostic): o singura functie pentru amandoua. */
  numePiesa(): string
  /** `n` = normala fetei atinse: inspectorul intreaba aerul din fata ei (recenzia explicatiei, EXP-6). */
  inspecteazaCelula(wx: number, wy: number, z: number, n?: NormalaFetei | null): void
  inspecteazaPion(id: number): void
  pionSelectat(): number | null
  toast(mesaj: string, refuz?: boolean, actiune?: { eticheta: string; f: () => void }): void
  /** O fereastra (meniu, titlu, ajutor...) e deschisa: canvasul nu primeste comenzi. */
  modalDeschis(): boolean
  /** Esc, in ordinea din design; `false` = n-a avut ce face (main il trateaza mai departe). */
  esc(): boolean
  comutaOameni(): void
  arataAjutorul(): void
  arataMeniul(): void
  salveazaAcum(): void
  noteaza(fapt: 'depozit' | 'sapa' | 'piesa' | 'pion'): void
  /** Textul liniei de indiciu cat se trage un dreptunghi; null = indiciul uneltei. `rosu` = nu se aplica. */
  indiciuDreptunghi(s: string | null, rosu?: boolean): void
  /** Previzualizarea constructiei, memorata in UI (pentru main.ts: toastul dreptunghiului). */
  previz(): Previz
}

const PIESE_P: readonly number[] = [Piesa.NICIUNA, Piesa.PERETE, Piesa.PODEA, Piesa.SCARA, Piesa.GRINDA, Piesa.USA]
const CULOARE_ITEM: Readonly<Record<number, string>> = {
  [Item.PIATRA]: 'var(--res-piatra)', [Item.HRANA]: 'var(--res-hrana)', [Item.PAMANT]: 'var(--res-pamant)', [Item.LEMN]: 'var(--res-lemn)',
}
/** Pe `Categorie`: SAPA, CARA, CONSTRUIESTE. */
const NUME_CATEGORIE: readonly string[] = ['Sapă', 'Cară', 'Construiește']

/** Legendele overlay-urilor: culoarea + FORMA, niciodata doar culoarea (DESIGN §9 regula 9). */
const LEGENDE: Readonly<Record<Overlay, { titlu: string; randuri: readonly { c: string; diag?: boolean; t: string }[]; fara?: string }>> = {
  J: {
    titlu: 'Planul (J)',
    randuri: [
      { c: '#d9a441', t: 'Cub: lucrare liberă — vine cineva când poate' },
      { c: '#63aec0', t: 'Cub albastru: cineva a luat-o — e pe drum sau lucrează' },
      { c: '#b1553f', t: 'Cub roșu (lucrare): niciun loc de unde să se lucreze' },
      { c: '#3fb8b0', diag: true, t: 'Cub turcoaz CU DIAGONALE: niciun loc SIGUR (scară, ușă, sau așteaptă o piesă)' },
      { c: '#d9708f', t: 'Cub roz: ar închide pe cineva sau ceva înăuntru' },
      { c: '#9b6bb5', t: 'Cub violet: nu se ajunge acolo' },
      { c: '#e08a3c', t: 'Cub portocaliu: un om a renunțat (drum blocat, prea scump)' },
      { c: '#7fa66b', t: 'Pătrate pe sol: depozit — mai luminoase cu cât sunt mai pline' },
      { c: '#d9a441', t: 'Cuburi mici, înalte cât sunt de pline: mormane' },
      { c: '#b1553f', t: 'Morman roșu: n-are depozit unde să fie dus — pictează sau mărește un depozit' },
      { c: '#63aec0', t: 'Morman albastru: vine un cărăuș (sau e luat pentru construit)' },
      { c: '#f2efe6', t: 'Linie: omul merge acolo' },
    ],
  },
  S: {
    titlu: 'Stabilitate (S)',
    randuri: [
      { c: '#e0c060', t: 'Chihlimbar: ultima celulă — încă una scoasă și cade ceva' },
      { c: '#d05040', t: 'Roșu: cade acum' },
      { c: '#ff8030', t: 'Portocaliu, înăuntru: lucrările desenate ar prăbuși asta' },
      { c: '#b060d0', t: 'Violet: piesa n-ar sta în picioare' },
      { c: '#3fb8b0', t: 'Turcoaz: ar sta, dar nu ajunge nimeni la ea (scară / ușă)' },
    ],
    fara: 'Stabilitatea se judecă pe un nivel.',
  },
  I: {
    titlu: 'Încăperi (I)',
    randuri: [
      { c: '#6fb3d9', t: 'Tentă: o încăpere închisă — o culoare pe încăpere' },
      { c: '#e0503c', diag: true, t: 'Hașuri roșii: acoperit, dar aerul iese — nu e încăpere' },
      { c: '#ff6a3d', t: 'Stâlp roșu: pe aici iese aerul (o gaură, un gol fără ușă)' },
    ],
    fara: 'Încăperile se văd pe un nivel.',
  },
  // Temperatura (design temperatura v2, §6): valoarea pe LUMINOZITATE (DESIGN §9 regula 9), cifra pe fiecare
  // piesă a încăperii. Fără hașură și fără prag de 5 °C: pragul vine cu efectul (t.3).
  U: {
    titlu: 'Temperatură (U)',
    randuri: [
      { c: '#ffe8b8', t: 'Deschis: mai cald — cifra e unde ar ajunge temperatura acolo, cu vremea și solul de acum' },
      { c: '#1a2652', t: 'Închis: mai rece (scara merge de la cel mai rece la cel mai cald spațiu de pe nivel)' },
      { c: '#808080', t: 'Gri: abia apărut — valoarea vine într-o secundă' },
    ],
    fara: 'Temperatura se vede pe un nivel.',
  },
  G: {
    titlu: 'Regiuni (G)',
    randuri: [
      { c: '#8fb5cc', t: 'Aceeași culoare = se poate ajunge dintr-un loc în altul' },
      { c: '#cc8f8f', t: 'Culoare diferită = nu există drum între ele' },
    ],
  },
}

const AJUTOR: readonly { sectiune: string; randuri: readonly [string, string][] }[] = [
  {
    sectiune: 'Uneltele',
    randuri: [
      ['V · Esc', 'Selectează: clic pe un om sau pe o celulă — vezi ce face și de ce nu merge'],
      ['D', 'Sapă: clic = o celulă, trage = un dreptunghi'],
      ['C · P', 'Construiește (P ciclează: sapă → perete → podea → scară → grindă)'],
      ['A', 'Anulează lucrări: clic sau dreptunghi (doar ce se vede)'],
      ['K', 'Zone: depozit, loc de dormit; a doua oară, Șterge zona'],
      ['Ctrl+trage · Z+trage · X+trage', 'Anulează · depozit · șterge zonele — peste orice unealtă'],
      ['Esc · clic dreapta', 'Renunță la dreptunghiul tras'],
    ],
  },
  {
    sectiune: 'Nivelul și camera',
    randuri: [
      ['Q · E · R', 'Coboară, urcă, toate nivelurile (și PageDown / PageUp, rotița peste coloana Nivel)'],
      ['trage stânga', 'Rotește camera (cu Selectează); rotița apăsată rotește oricând'],
      ['clic dreapta + trage', 'Mută camera; săgețile la fel'],
      ['rotiță', 'Zoom'],
    ],
  },
  {
    sectiune: 'Jocul',
    randuri: [
      ['Spațiu · 1 2 3', 'Pauză și viteza'],
      ['O', 'Oamenii: ce face fiecare și ce muncă are voie să facă'],
      ['J · S · I · U · G', 'Planul, stabilitatea, încăperile, temperatura, regiunile'],
      ['Ctrl+S', 'Salvează'],
      ['F1 · F3', 'Ajutorul · Diagnosticul (fps și cifrele de măsură)'],
    ],
  },
  {
    sectiune: 'Unelte de test și de măsură',
    randuri: [
      ['Shift+clic · Alt+clic', 'Zidește / sapă PE LOC, fără om'],
      ['B · , . N M', 'Amprenta unei clădiri așezate liber'],
      ['T · Shift+T · F', 'Traversarea camerei și ceasul ei'],
    ],
  },
]

function iconBtn(icon: string, eticheta: string, tasta: string, titlu: string): HTMLButtonElement {
  return h('button', { class: 'ui-btn', type: 'button', title: titlu, 'aria-pressed': 'false', html: `${icon}${eticheta ? `<span>${eticheta}</span>` : ''}${tasta ? `<span class="tasta">${tasta}</span>` : ''}` })
}

function butonText(eticheta: string, f: () => void, titlu = ''): HTMLButtonElement {
  const b = h('button', { class: 'ui-btn', type: 'button', title: titlu }, eticheta)
  b.addEventListener('click', f)
  return b
}

function nouaBara(): HTMLElement {
  return h('div', { class: 'ui-bara' }, h('i'), h('b'), h('u', { hidden: true }))
}

function scrieBara(e: HTMLElement, b: Bara, cuTinta = false): void {
  const [i, semn, tinta] = [e.children[0] as HTMLElement, e.children[1] as HTMLElement, e.children[2] as HTMLElement]
  const pct = (v: number) => Math.max(0, Math.min(100, (100 * v) / b.max))
  attr(i, 'style', `width:${pct(b.valoare).toFixed(1)}%`)
  attr(semn, 'style', `left:${pct(b.prag).toFixed(1)}%`)
  ascuns(tinta, !cuTinta || b.tinta === b.valoare)
  if (cuTinta) attr(tinta, 'style', `left:${pct(b.tinta).toFixed(1)}%`)
  clasa(e, 'atentie', b.stare === 1)
  clasa(e, 'critic', b.stare === 2)
  const t = `${Math.round(pct(b.valoare))} din 100 · prag ${Math.round(pct(b.prag))}${cuTinta && b.tinta !== b.valoare ? ` · se duce spre ${Math.round(pct(b.tinta))}` : ''}`
  attr(e, 'title', t)
}

export function monteazaUI(ctx: ContextUI): UI {
  const w = ctx.world
  const rules = ctx.rules
  const radacina = h('div', { class: 'ui', 'data-ui': '' })
  document.body.append(radacina)
  try { const z = localStorage.getItem('kinstead.ui.marime'); if (z) radacina.style.setProperty('zoom', z) } catch { /* fara stocare: marimea implicita */ }
  /**
   * Cat cere interfata, in pixeli CSS, ca nimic sa nu se suprapuna: bara de sus are ~1.095 px de continut cu 2 insigne,
   * iar la 1280×720 marimea 125% suprapunea deja bara de unelte peste sertar (recenzia UI-ului, ECR-3).
   * O marime care nu incape nu se poate alege, iar la o fereastra mai mica se coboara singura.
   */
  const LATIME_UI = 1100
  const INALTIME_UI = 600
  const marimeaActuala = (): number => Number(radacina.style.getPropertyValue('zoom') || '1')
  const marimeaIncape = (z: number): boolean => window.innerWidth / z >= LATIME_UI && window.innerHeight / z >= INALTIME_UI
  const potrivesteMarimea = (): void => {
    if (marimeaIncape(marimeaActuala())) return
    const z = ['1.25', '1'].find((x) => marimeaIncape(Number(x))) ?? '1'
    radacina.style.setProperty('zoom', z)
  }
  potrivesteMarimea()
  window.addEventListener('resize', potrivesteMarimea)

  const previzualizare = creeazaPrevizualizare(() => performance.now())
  /**
   * Previzualizarea constructiei costa cat planul: 3–6 ms pe o casa, 120–185 ms pe un plan de 64×64
   * (panoul, CG-2). Cheia ei se schimba la fiecare piesa zidita, deci cat pionii lucreaza ar fi
   * recalculata la fiecare citire. Alertele si inspectorul deschis o citesc RAR: cel mult o data pe
   * secunda, sau o data la 10 s cand ultima a costat peste 8 ms. Un click o cere proaspata.
   */
  let previzCache: Previz | null = null
  let previzLa = -Infinity
  let previzPlan = -1
  /**
   * Una SCUMPA (peste 8 ms) nu se mai reface periodic: fiecare piesa zidita ii schimba cheia, deci
   * „o data la 10 s" era un inghet de 43–60 ms la 10 s cat dura constructia unui plan mare (recenzia
   * UI-ului, C2-2). Se reface doar la o actiune a jucatorului (`proaspat`), cand s-a schimbat PLANUL
   * (`editariConstr`: nu si cand se zideste) si in pauza, unde costul nu se vede — ca stabilitatea (S).
   */
  function previzRar(proaspat: boolean): Previz {
    const acum = performance.now()
    if (previzCache === null || refacePrevizualizarea({ proaspat, areMemorie: true, planSchimbat: w.desemnari.editariConstr !== previzPlan, pauza: ctx.pauza(), ultimaMs: previzCache?.ms ?? 0, trecutMs: acum - previzLa })) {
      previzCache = previzualizare.ia(w, rules)
      previzLa = acum
      previzPlan = w.desemnari.editariConstr
    }
    return previzCache
  }
  const pasi = { depozit: false, sapa: false, piesa: false, pion: false }
  if (ctx.primiPasi) [pasi.depozit, pasi.sapa, pasi.piesa, pasi.pion] = [!!ctx.primiPasi[0], !!ctx.primiPasi[1], !!ctx.primiPasi[2], !!ctx.primiPasi[3]]
  const primiPasi = (): boolean[] => [pasi.depozit, pasi.sapa, pasi.piesa, pasi.pion]
  let selectie: { fel: 'celula'; wx: number; wy: number; z: number; n: NormalaFetei | null } | { fel: 'pion'; id: number } | null = null
  let dreptunghi: { text: string; rosu: boolean } | null = null
  let sertar: 'inspector' | 'oameni' = 'inspector'

  const ui: UI = {
    unealta: ctx.mod === 'verificare' ? Unealta.SAPA : Unealta.SELECTEAZA,
    piesa: Piesa.PERETE,
    zonaFel: Zona.DEPOZIT,
    contur: true,
    unStrat: false,
    prioritate: rules.designationPriorityDefault,
    cadru,
    alegeUnealta,
    ciclezaPiesa,
    numePiesa: () => (ui.unealta === Unealta.CONSTRUIESTE ? NUME_PIESA[ui.piesa]!.toLowerCase() : 'sapa (P)'),
    inspecteazaCelula: (wx, wy, z, n = null) => { selectie = { fel: 'celula', wx, wy, z, n }; ctx.urmareste(null); arataSertar('inspector'); scrieInspector(true) },
    inspecteazaPion: (id) => { selectie = { fel: 'pion', id }; noteaza('pion'); arataSertar('inspector'); scrieInspector(true); scrieOameni(true) },
    pionSelectat: () => (selectie?.fel === 'pion' ? selectie.id : null),
    toast,
    modalDeschis: () => !voal.hidden,
    esc,
    comutaOameni: () => arataSertar(sertar === 'oameni' && !panouSertar.hidden ? 'inspector' : 'oameni'),
    arataAjutorul,
    arataMeniul,
    salveazaAcum: () => { void salveazaAcum() },
    noteaza,
    indiciuDreptunghi: (s, rosu = false) => { dreptunghi = s === null ? null : { text: s, rosu }; scrieIndiciu() },
    previz: () => previzRar(true),
  }

  // ---- bara de sus ---------------------------------------------------------------------------
  // Calendarul si aerul de afara in locul timpului total si al marcii KINSTEAD (design temperatura
  // v2, §6; panoul, L5-4): marca ramane pe ecranul de titlu, timpul total in tooltip si in numele
  // salvarilor. Masurat pe bara reala (ui-fum, „bara-sus"), la 1.100 px cu 2 insigne si cu calendarul
  // la latimea celui mai lat text al lui (153 px): raman 5 px. Cu marca si timpul total, depasea cu 46.
  const btnMeniu = iconBtn(ICON.meniu, '', '', 'Meniu (Esc)')
  const calendar = h('span', { class: 'ui-calendar' }, '')
  const resurse = new Map<number, { rad: HTMLElement; val: HTMLElement }>()
  const grupRes = h('div', { class: 'grup' })
  const prognoza = h('span', { class: 'prognoza' })
  for (const fel of [Item.PIATRA, Item.HRANA, Item.PAMANT, Item.LEMN]) {
    const val = h('span', { class: 'val' }, '0')
    // Iconita din Blender (tools/assets/resurse.py); pana se incarca (sau daca lipseste), culoarea resursei.
    const icoana = h('img', { class: 'icoana', alt: '', width: 20, height: 20, src: new URL(`resurse/icoane/${FEL_RESURSA[fel]}.png`, document.baseURI).href, style: `background:${CULOARE_ITEM[fel]}` })
    icoana.addEventListener('load', () => { icoana.style.background = 'none' }, { once: true })
    const rad = h('span', { class: 'ui-res' }, icoana, h('span', {}, NUME_ITEM[fel]!), val, fel === Item.HRANA ? prognoza : null)
    resurse.set(fel, { rad, val })
    grupRes.append(rad)
  }
  const oameniVal = h('span', { class: 'val num' }, '0')
  const insigne = h('span', { style: 'display:inline-flex;gap:4px' })
  const btnOameni = h('button', { class: 'ui-res', type: 'button', title: 'Oamenii (O)', style: 'border:0;background:none;cursor:pointer' },
    h('span', { html: ICON.oameni, style: 'width:18px;height:18px;display:inline-flex' }), h('span', {}, 'Oameni'), oameniVal, insigne)
  const btnPauza = iconBtn(ICON.pauza, '', '', 'Pauză (Spațiu)')
  const btnViteze = [1, 2, 3].map((v) => iconBtn('', `${v}×`, '', `Viteza ${v}× (tasta ${v})`))
  const efectiva = h('span', { class: 'ui-viteza-efectiva', title: 'Viteza reală: simularea nu ține pasul' })
  radacina.append(h('div', { class: 'ui-sus' },
    h('div', { class: 'grup' }, btnMeniu, calendar),
    grupRes,
    h('div', { class: 'grup' }, btnOameni),
    h('div', { class: 'spatiu' }),
    h('div', { class: 'grup' }, btnPauza, ...btnViteze, efectiva),
  ))
  btnMeniu.addEventListener('click', () => arataMeniul())
  btnOameni.addEventListener('click', () => ui.comutaOameni())
  btnPauza.addEventListener('click', () => ctx.seteazaPauza(!ctx.pauza()))
  btnViteze.forEach((b, i) => b.addEventListener('click', () => { ctx.seteazaViteza(i + 1); ctx.seteazaPauza(false) }))

  // ---- stanga: nivelul, hartile, primii pasi -------------------------------------------------
  const cota = h('div', { class: 'cota num' }, '—')
  const rel = h('div', { class: 'rel' }, 'toate nivelurile')
  const btnSus = iconBtn(ICON.sus, '', 'E', 'Urcă un nivel (E, PageUp)')
  const btnJos = iconBtn(ICON.jos, '', 'Q', 'Coboară un nivel (Q, PageDown) — taie lumea deasupra')
  const btnToate = iconBtn(ICON.toate, 'Toate', 'R', 'Toate nivelurile (R)')
  const nivel = h('div', { class: 'ui-insula ui-nivel', title: 'Rotița aici schimbă nivelul' }, h('div', { class: 'eticheta' }, 'Nivel'), btnSus, cota, rel, btnJos, btnToate)
  const urca = () => { const n = ctx.nivel(); if (n.cota !== null) ctx.seteazaNivel(n.cota >= n.hi ? null : n.cota + 1) }
  // Primul „coboară" porneste nivelul la solul de sub camera, nu in varful ferestrei (37 m mai sus:
  // Construiește desena acolo, nevazut — recenzia UI-ului, ECR-5). Ca „Alege nivelul de sub cameră".
  const coboara = () => { const n = ctx.nivel(); ctx.seteazaNivel(n.cota === null ? (n.sol === null ? n.hi : n.sol + 2) : Math.max(n.lo, n.cota - 1)) }
  btnSus.addEventListener('click', urca)
  btnJos.addEventListener('click', coboara)
  btnToate.addEventListener('click', () => ctx.seteazaNivel(null))
  // Rotita PESTE coloana schimba nivelul; pe scena ramane zoom. Fara Ctrl+rotita: se batea cu zoom-ul
  // OrbitControls, cu pinch-ul de pe touchpad si cu Ctrl = retrage (panoul, I8).
  nivel.addEventListener('wheel', (ev) => { ev.preventDefault(); if (ev.deltaY > 0) coboara(); else if (ev.deltaY < 0) urca() }, { passive: false })
  const btnOv: Record<Overlay, HTMLButtonElement> = {
    J: iconBtn(ICON.joburi, 'Planul', 'J', 'Planul: lucrările cerute, cine vine, ce e blocat (J)'),
    S: iconBtn(ICON.stabilitate, 'Stabilitate', 'S', 'Ce ține și ce cade, pe nivelul ales (S)'),
    G: iconBtn(ICON.regiuni, 'Regiuni', 'G', 'Pe unde se poate ajunge (G)'),
    I: iconBtn(ICON.incaperi, 'Încăperi', 'I', 'Încăperile închise și pe unde iese aerul, pe nivelul ales (I)'),
    U: iconBtn(ICON.temperatura, 'Temperatură', 'U', 'Unde ar ajunge temperatura fiecărei încăperi, pe nivelul ales (U)'),
  }
  for (const o of ['J', 'S', 'I', 'U', 'G'] as const) btnOv[o].addEventListener('click', () => ctx.comutaOverlay(o))
  const listaPasi = h('ol')
  const hranaPasi = h('div', { class: 'hrana' })
  const btnInchidePasi = iconBtn(ICON.inchide, '', '', 'Ascunde')
  const cardPasi = h('div', { class: 'ui-insula ui-pasi', hidden: ctx.mod !== 'joc-nou' },
    h('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, h('span', { class: 'eticheta' }, 'Primii pași'), btnInchidePasi), listaPasi, hranaPasi)
  let pasiInchise = ctx.mod !== 'joc-nou'
  btnInchidePasi.addEventListener('click', () => { pasiInchise = true; ascuns(cardPasi, true) })
  radacina.append(h('div', { class: 'ui-stanga' }, nivel, h('div', { class: 'ui-insula ui-overlay' }, h('div', { class: 'eticheta' }, 'Hărți'), btnOv.J, btnOv.S, btnOv.I, btnOv.U, btnOv.G)), cardPasi)
  const legenda = h('div', { class: 'ui-insula ui-legenda', hidden: true })
  radacina.append(legenda)
  let legendaScrisa = ''
  /**
   * Legenda e PLIATA implicit: Planul e aprins tot jocul, iar cele zece randuri ale lui acopereau
   * scena din coltul stang la 1280×720. Pliata arata titlul si cifrele; culorile, la cerere.
   */
  let legendaDeschisa = false
  try { legendaDeschisa = localStorage.getItem('kinstead.ui.legenda') === '1' } catch { /* implicit pliata */ }

  // ---- jos: uneltele ---------------------------------------------------------------------------
  const btnU = new Map<UnealtaId, HTMLButtonElement>([
    [Unealta.SELECTEAZA, iconBtn(ICON.selecteaza, 'Selectează', 'V', 'Selectează: vezi ce e acolo și de ce nu merge (V, Esc)')],
    [Unealta.SAPA, iconBtn(ICON.sapa, 'Sapă', 'D', 'Sapă: clic = o celulă, trage = dreptunghi (D)')],
    [Unealta.CONSTRUIESTE, iconBtn(ICON.construieste, 'Construiește', 'C', 'Construiește: perete, podea, scară, grindă, ușă (C, P)')],
    [Unealta.ANULEAZA, iconBtn(ICON.anuleaza, 'Anulează', 'A', 'Anulează lucrări: clic sau dreptunghi (A)')],
    [Unealta.ZONA, iconBtn(ICON.zona, 'Zone', 'K', 'Zone: depozit, loc de dormit (K)')],
  ])
  const unelte = h('div', { class: 'ui-unelte' }, btnU.get(Unealta.SELECTEAZA)!, h('span', { class: 'ui-sep' }), btnU.get(Unealta.SAPA)!, btnU.get(Unealta.CONSTRUIESTE)!, btnU.get(Unealta.ANULEAZA)!, btnU.get(Unealta.ZONA)!)
  const btnPiesa = new Map<number, HTMLButtonElement>([
    [Piesa.PERETE, iconBtn(ICON.perete, 'Perete', '', `Perete: ${rules.piese[Piesa.PERETE]?.cantitate ?? 20} piatră; dreptunghiul pune doar marginea`)],
    [Piesa.PODEA, iconBtn(ICON.podea, 'Podea', '', `Podea: ${rules.piese[Piesa.PODEA]?.cantitate ?? 20} piatră`)],
    [Piesa.SCARA, iconBtn(ICON.scara, 'Scară', '', `Scară de piatră: ${rules.piese[Piesa.SCARA]?.cantitate ?? 20} piatră — urcă un nivel`)],
    [Piesa.GRINDA, iconBtn(ICON.grinda, 'Grindă', '', `Grindă: ține până la ${rules.suportRazaGrinda - 1} pași în jur, dacă e prinsă de ceva așezat`)],
    [Piesa.USA, iconBtn(ICON.usa, 'Ușă', '', `Ușă de piatră: ${rules.piese[Piesa.USA]?.cantitate ?? 20} piatră pe celulă — clic pe un gol de perete (o pune întreagă) sau pe o gaură de podea; oamenii trec, aerul nu`)],
  ])
  const btnContur = butonText('Contur', () => { ui.contur = !ui.contur; scrieUnelte() }, 'Dreptunghiul pune doar marginea (ziduri) sau tot (podele)')
  const btnStrat = butonText('Înălțime de om', () => { ui.unStrat = !ui.unStrat; scrieUnelte() }, `Cu nivelul pornit: sapă nivelul și ${rules.agentHeadroomM - 1} deasupra, cât să treacă un om — sau doar un strat`)
  const btnPrio = [...Array(rules.designationPriorityLevels).keys()].map((k) => {
    const p = k + 1
    const b = butonText(String(p), () => { ui.prioritate = p; scrieUnelte() }, `Prioritatea lucrărilor noi: ${p} din ${rules.designationPriorityLevels} (mai mare = mai întâi)`)
    b.style.minWidth = '26px'
    return b
  })
  const grupPrio = h('span', { style: 'display:inline-flex;align-items:center;gap:1px' }, h('span', { class: 'eticheta' }, 'Prioritate'), ...btnPrio)
  const subConstr = h('div', { class: 'ui-sub', hidden: true })
  const btnZona = new Map<number, HTMLButtonElement>([
    [Zona.DEPOZIT, iconBtn(ICON.depozit, 'Depozit', '', 'Depozit: aici se duc mormanele')],
    [Zona.DORMIT, iconBtn(ICON.dormit, 'Loc de dormit', '', 'Loc de dormit: cine doarme aici nu doarme pe jos')],
    [-1, iconBtn(ICON.stergeZona, 'Șterge zona', '', 'Șterge zonele atinse — ÎNTREGI (nu se poate șterge o singură celulă)')],
  ])
  const subZona = h('div', { class: 'ui-sub', hidden: true }, ...btnZona.values())
  const indiciu = h('div', { class: 'ui-indiciu' })
  // Toasturile stau in coloana barei de jos, DEASUPRA randurilor de piese: fixate la 132 px de jos,
  // acopereau butoanele Construiește (Perete … Ușă) cat erau pe ecran — clicul pe „Ușă" nimerea
  // toastul „24 desemnate … Anulează" (ui-fum, bifa usa-unealta).
  const toasturi = h('div', { class: 'ui-toasturi' })
  radacina.append(h('div', { class: 'ui-jos' }, toasturi, subConstr, subZona, unelte, indiciu))
  for (const [u, b] of btnU) b.addEventListener('click', () => alegeUnealta(u))
  for (const [p, b] of btnPiesa) b.addEventListener('click', () => { ui.piesa = p; ui.contur = conturImplicit(p); alegeUnealta(Unealta.CONSTRUIESTE) })
  for (const [z, b] of btnZona) b.addEventListener('click', () => { if (z === -1) alegeUnealta(Unealta.STERGE_ZONA); else { ui.zonaFel = z; alegeUnealta(Unealta.ZONA) } })

  function alegeUnealta(u: UnealtaId): void {
    ui.unealta = u
    // Uneltele care dau de lucru aprind Planul, ca desenul sa se vada (research/ux-ui.md, regula 5);
    // nu-l sting la iesire.
    if (u !== Unealta.SELECTEAZA && !ctx.overlayPornit('J')) ctx.comutaOverlay('J')
    scrieUnelte()
  }

  function ciclezaPiesa(): void {
    // Din orice alta unealta decat Construieste, P porneste ca de pe „sapa": primul P = perete, deci
    // P×4 = grinda de oriunde, ca azi (OWNER_VERIFY 12 si 13: „P pana la ...").
    const acum = ui.unealta === Unealta.CONSTRUIESTE ? ui.piesa : Piesa.NICIUNA
    const urm = PIESE_P[(PIESE_P.indexOf(acum) + 1) % PIESE_P.length]!
    if (urm === Piesa.NICIUNA) alegeUnealta(Unealta.SAPA)
    else { ui.piesa = urm; ui.contur = conturImplicit(urm); alegeUnealta(Unealta.CONSTRUIESTE) }
  }

  function scrieUnelte(): void {
    for (const [u, b] of btnU) attr(b, 'aria-pressed', u === ui.unealta || (u === Unealta.ZONA && ui.unealta === Unealta.STERGE_ZONA) ? 'true' : 'false')
    const constr = ui.unealta === Unealta.CONSTRUIESTE
    const sapa = ui.unealta === Unealta.SAPA
    ascuns(subConstr, !constr && !sapa)
    // Planul usii ignora Contur/Plin (un gol se pune intreg): butonul nu se arata pentru ea (ECR-12).
    const cuContur = constr && ui.piesa !== Piesa.USA
    subConstr.replaceChildren(...(constr ? [...btnPiesa.values(), ...(cuContur ? [h('span', { class: 'ui-sep' }), btnContur] : [])] : [btnStrat]), h('span', { class: 'ui-sep' }), grupPrio)
    ascuns(subZona, ui.unealta !== Unealta.ZONA && ui.unealta !== Unealta.STERGE_ZONA)
    for (const [p, b] of btnPiesa) attr(b, 'aria-pressed', constr && ui.piesa === p ? 'true' : 'false')
    for (const [z, b] of btnZona) attr(b, 'aria-pressed', (z === -1 ? ui.unealta === Unealta.STERGE_ZONA : ui.unealta === Unealta.ZONA && ui.zonaFel === z) ? 'true' : 'false')
    attr(btnContur, 'aria-pressed', ui.contur ? 'true' : 'false')
    text(btnContur, ui.contur ? 'Contur' : 'Plin')
    attr(btnStrat, 'aria-pressed', ui.unStrat ? 'false' : 'true')
    text(btnStrat, ui.unStrat ? 'Un strat' : 'Înălțime de om')
    btnPrio.forEach((b, k) => attr(b, 'aria-pressed', ui.prioritate === k + 1 ? 'true' : 'false'))
    scrieIndiciu()
  }

  function scrieIndiciu(): void {
    clasa(indiciu, 'rosu', dreptunghi?.rosu ?? false)
    if (dreptunghi !== null) { indiciu.textContent = dreptunghi.text; return }
    const n = ctx.nivel()
    const unde = n.cota === null ? 'pe suprafață' : `pe nivelul activ (${n.cota - 1} m)`
    const s: Record<number, string> = {
      [Unealta.SELECTEAZA]: '<b>Selectează</b> · clic pe un om sau pe o celulă · trage = rotește camera',
      [Unealta.SAPA]: `<b>Sapă</b> ${unde} · clic = o celulă · trage = dreptunghi · Esc = Selectează`,
      [Unealta.CONSTRUIESTE]: ui.piesa === Piesa.USA ? textIndiciuUsa(n.cota) : `<b>${NUME_PIESA[ui.piesa]}</b> ${unde} · trage = dreptunghi (${ui.contur ? 'contur' : 'plin'}) · P = altă piesă · Esc`,
      [Unealta.ANULEAZA]: '<b>Anulează</b> · clic pe o lucrare sau trage peste ele (doar ce se vede) · Esc',
      [Unealta.ZONA]: `<b>${NUME_ZONA[ui.zonaFel]}</b> ${unde} · clic = o celulă · trage = dreptunghi · Esc`,
      [Unealta.STERGE_ZONA]: '<b>Șterge zona</b> · clic sau dreptunghi: zonele atinse se șterg ÎNTREGI · Esc',
    }
    indiciu.innerHTML = s[ui.unealta] ?? ''
  }

  // ---- dreapta: alerte + sertarul (inspector / oameni) ------------------------------------------
  const listaAlerte = h('div', { class: 'ui-alerte' })
  const btnJurnal = butonText('Jurnal', () => arataJurnalul(), 'Ce s-a întâmplat: alertele care au apărut și au trecut')
  const fileInspector = butonText('Inspector', () => arataSertar('inspector'))
  const fileOameni = butonText('Oameni (O)', () => arataSertar('oameni'))
  const btnInchideSertar = iconBtn(ICON.inchide, '', '', 'Închide')
  const corpInspector = h('div', { class: 'corp ui-inspector' })
  const corpOameni = h('div', { class: 'corp ui-oameni', hidden: true })
  const panouSertar = h('div', { class: 'ui-insula ui-sertar', hidden: true }, h('div', { class: 'ui-file' }, fileInspector, fileOameni, btnInchideSertar), corpInspector, corpOameni)
  btnInchideSertar.addEventListener('click', () => { ascuns(panouSertar, true); selectie = null; ctx.urmareste(null); scrieVizibilitatePasi() })
  radacina.append(h('div', { class: 'ui-dreapta' }, h('div', { class: 'ui-alerte-antet' }, btnJurnal), listaAlerte, panouSertar))

  function arataSertar(s: 'inspector' | 'oameni'): void {
    sertar = s
    ascuns(panouSertar, false)
    ascuns(corpInspector, s !== 'inspector')
    ascuns(corpOameni, s !== 'oameni')
    attr(fileInspector, 'aria-pressed', s === 'inspector' ? 'true' : 'false')
    attr(fileOameni, 'aria-pressed', s === 'oameni' ? 'true' : 'false')
    if (s === 'oameni') scrieOameni(true)
    else scrieInspector(true)
    scrieVizibilitatePasi()
  }

  const alerte = creeazaAlerte(w.tick + rules.jobRescanTicks)
  let plecatiVazuti = w.plecatiTotal
  let alerteAfisate: StareAlerta[] = []

  function duLaTinta(t: Tinta | null): void {
    if (!t) return
    if (t.fel === 'pion') {
      const a = w.agents
      if (a.alive[t.slot] !== 1) return
      const z = a.z[t.slot]!
      ctx.duLa(Math.floor(a.x[t.slot]! / 1000), Math.floor(a.y[t.slot]! / 1000), z, null)
      ui.inspecteazaPion(a.id[t.slot]!)
    } else {
      ctx.duLa(t.wx, t.wy, t.z, null)
      ui.inspecteazaCelula(t.wx, t.wy, t.z)
    }
  }

  function scrieAlerte(): void {
    const cheie = alerteAfisate.map((a) => `${a.id}|${a.semnal.text}`).join('\n')
    if (listaAlerte.dataset.cheie === cheie) return
    listaAlerte.dataset.cheie = cheie
    listaAlerte.replaceChildren(...alerteAfisate.map((a) => {
      const sev = a.severitate === Severitate.CRITIC ? 'critic' : 'atentie'
      const b = h('button', { class: `ui-alerta ${sev}`, type: 'button', title: a.semnal.tinta ? 'Clic: du-mă acolo' : '' },
        h('span', { html: a.severitate === Severitate.CRITIC ? ICON.critic : ICON.atentie }), h('span', {}, a.semnal.text), h('span', {}, a.semnal.tinta ? '›' : ''))
      b.addEventListener('click', () => duLaTinta(a.semnal.tinta))
      return b
    }))
  }

  // ---- inspectorul ---------------------------------------------------------------------------
  let inspectorCheie = ''
  /** Încăperea celulei selectate: memorată pe celulă + amprenta pe jurnal, cu frână (memorie-incapere.ts). */
  const memorieIncapere = creeazaMemorieIncapere(() => performance.now())
  /**
   * Temperatura încăperii (design temperatura v2, §6; panoul, L5-2): elemente făcute O DATĂ și scrise PE LOC, la
   * fiecare reîmprospătare, ÎNAINTEA comparației cheii. Explicația rămâne în memoria ei, neschimbată și fără nimic
   * termic (memoria întoarce același obiect cât nu se editează lângă componentă: temperatura ar fi înghețat); iar
   * în cheie, temperatura ar fi refăcut tot corpul — cu „Arată nivelul" / „Pune ușa" — la fiecare schimbare, și un
   * clic căzut între mousedown și mouseup s-ar fi pierdut. La o redesenare, același element e mutat în corpul nou.
   */
  const memorieTermica = creeazaMemorieTermica()
  const termicLinie = h('div', { class: 'ui-termic-t num' })
  const termicCanale = h('div', { class: 'sub ui-termic-canale' })
  const termicEl = h('div', { class: 'ui-termic', title: 'La echilibru: unde ar ajunge temperatura cu vremea și solul de acum. Încăperea nu e încă acolo — inerția vine mai târziu.' }, termicLinie, termicCanale)
  function scrieTermic(inc: IncapereLa | null): void {
    const t = memorieTermica.ia(w, rules, inc === null ? null : inc.celula)
    ascuns(termicEl, t === null)
    if (t === null) return
    text(termicLinie, t.linie)
    text(termicCanale, t.canale)
    ascuns(termicCanale, t.canale === '')
  }
  function scrieInspector(fortat = false): void {
    if (panouSertar.hidden || sertar !== 'inspector') return
    if (!selectie) {
      if (inspectorCheie !== 'gol') { inspectorCheie = 'gol'; corpInspector.replaceChildren(h('div', { class: 'sub' }, 'Selectează (V), apoi clic pe un om sau pe o celulă.')) }
      return
    }
    if (selectie.fel === 'pion') {
      const p = inspecteazaPion(w, rules, selectie.id)
      if (!p) {
        if (inspectorCheie !== 'plecat') { inspectorCheie = 'plecat'; corpInspector.replaceChildren(h('h2', {}, 'A plecat'), h('div', { class: 'sub' }, 'Omul ăsta nu mai e în așezare.')) }
        return
      }
      const cheie = JSON.stringify(p)
      if (!fortat && cheie === inspectorCheie) return
      inspectorCheie = cheie
      const nev = (nume: string, b: Bara, cuTinta = false) => {
        const e = nouaBara()
        scrieBara(e, b, cuTinta)
        return h('div', { class: 'ui-nevoie' }, h('span', {}, nume), e, h('span', { class: 'num' }, String(Math.round((100 * b.valoare) / b.max))))
      }
      const prio = h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' })
      if (p.factiune === Faction.ASEZARE) {
        for (let c = 0; c < CATEGORII; c++) prio.append(h('span', { style: 'display:inline-flex;gap:4px;align-items:center' }, h('span', { class: 'sub' }, NUME_CATEGORIE[c]!), butonPrioritate(p.id, c, p.prioritati[c]!.nivel, p.prioritati[c]!.activa)))
      }
      const btnUrm = iconBtn(ICON.urmareste, 'Urmărește', '', 'Camera îl urmărește')
      btnUrm.addEventListener('click', () => ctx.urmareste(p.id))
      const btnDu = iconBtn(ICON.nivel, 'Du-mă la el', '', 'Camera și nivelul la el')
      btnDu.addEventListener('click', () => ctx.duLa(p.wx, p.wy, p.z, p.z + 2))
      corpInspector.replaceChildren(
        h('h2', {}, p.nume),
        h('div', { class: 'sub' }, p.factiune === Faction.JEFUITOR ? 'Jefuitor — nu e din așezare' : 'Colonist'),
        h('div', { class: 'ui-actiuni' }, btnUrm, btnDu),
        h('section', {}, h('div', {}, p.activitate), p.mana ? h('div', { class: 'sub' }, `În mână: ${p.mana}`) : null,
          p.faraVoie ? h('div', { class: 'ui-motiv' }, p.faraVoie) : null),
        h('section', {}, nev('Foame', p.foame), nev('Odihnă', p.odihna), nev('Dispoziție', p.dispozitie, true),
          p.ganduri.length ? h('div', { class: 'sub' }, `Gânduri: ${p.ganduri.map((g) => `${g.nume} (${g.valoare > 0 ? '+' : '−'}${Math.abs(g.valoare / 10)})`).join(' · ')}`) : null),
        p.factiune === Faction.ASEZARE ? h('section', {}, h('div', { class: 'eticheta' }, 'Munci — clic schimbă: – niciodată · 1 · 2 preferat · Excl. doar asta'), prio) : h('span'),
      )
      return
    }
    const c = inspecteazaCelula(w, rules, selectie.wx, selectie.wy, selectie.z, previzRar(fortat))
    // Explicația inundă până la scurgere, iar inspectorul se reface de 4 ori pe secundă (panoul camerelor,
    // JUC-8): memoria ei nu se invalidează decât de o editare lângă componentă, iar frâna o ține sub 5%
    // din timp cât minerii lucrează chiar acolo (recenzia încăperilor, EXP-4 / ECR-3). Un clic o sare.
    const inc = memorieIncapere.ia(w, selectie.wx, selectie.wy, selectie.z, fortat, selectie.n)
    const usi = usilePropuse(w, inc)
    // Pe loc, înainte de comparație: se schimbă fără editări (vezi `scrieTermic`).
    scrieTermic(inc)
    const cheie = cheieInspectorCelula(c, memorieIncapere.versiune(), usi)
    if (!fortat && cheie === inspectorCheie) return
    inspectorCheie = cheie
    corpInspector.replaceChildren(...corpCelula(c, inc, usi))
  }

  function butonPrioritate(id: number, c: number, v: number, activa: boolean): HTMLButtonElement {
    const t = textPrioritatePersonala(v, rules.personalPriorityLevels)
    const b = h('button', { class: 'ui-prio', type: 'button', 'data-v': v, title: `${NUME_CATEGORIE[c]}: ${t.titlu}${v > 0 && !activa ? ' — OPRITĂ: altă muncă e pe Exclusiv' : ''} (clic schimbă)` }, t.eticheta)
    clasa(b, 'excl', v >= rules.personalPriorityLevels)
    clasa(b, 'oprita', v > 0 && !activa)
    b.addEventListener('click', (ev) => {
      ev.stopPropagation()
      ctx.aplica([{ kind: 'setPrioritatePersonala', id, categorie: c, nivel: (v + 1) % (rules.personalPriorityLevels + 1) }])
      scrieInspector(true)
      scrieOameni(true)
    })
    return b
  }

  function motivEl(t: { titlu: string; actiune: string }, fel: 'bine' | 'atentie' | 'critic'): HTMLElement {
    return h('div', { class: `ui-motiv${fel === 'atentie' ? '' : ` ${fel}`}` }, h('div', {}, t.titlu), t.actiune ? h('div', { class: 'actiune' }, t.actiune) : null)
  }

  function corpCelula(c: InspectieCelula, inc: IncapereLa | null, usi: UsilePropuse): Node[] {
    const out: Node[] = [
      h('h2', {}, c.material === null ? 'Celulă' : NUME_MATERIAL[c.material] ?? 'Celulă'),
      h('div', { class: 'sub num' }, `${c.wx}, ${c.wy} · ${c.z} m`),
    ]
    const t = inc === null ? null : textIncapere(inc, usi.desemnata)
    if (inc !== null && t !== null && t.titlu !== '') {
      const s = h('section', { class: 'ui-incapere' }, motivEl({ titlu: t.titlu, actiune: t.actiune }, t.bine ? 'bine' : 'atentie'), termicEl)
      const act = h('div', { class: 'ui-actiuni' })
      if (inc.e.fel === 'DESCHISA') {
        const g = inc.e.gaura
        const arata = iconBtn(ICON.nivel, inc.e.directie === 'SUS' ? 'Arată gaura' : 'Arată golul', '', 'Camera și nivelul acolo')
        arata.addEventListener('click', () => ctx.duLa(g.x, g.y, g.z, g.z + 1))
        act.append(arata)
        const propuse = inc.e.usiPropuse
        if (propuse.length > 0) {
          // Ușa propusă poate fi departe de scurgere (e pe drumul aerului): „Arată" duce și la ea (EXP-7).
          const u0 = propuse.reduce((a, b) => (b.z < a.z ? b : a))
          const arataUsa = iconBtn(ICON.usa, 'Arată ușa', '', 'Camera și nivelul la ușa propusă')
          arataUsa.addEventListener('click', () => ctx.duLa(u0.x, u0.y, u0.z, u0.z + 1))
          act.append(arataUsa)
        }
        // Cu toate celulele ușii deja desemnate, textul spune „Ușa e desemnată" și butonul nu mai apare: un
        // al doilea clic nu făcea nimic și nu spunea nimic (ECR-12). Prioritatea e a barei de jos, ca la
        // orice desen.
        if (usi.lipsa.length > 0 && !usi.desemnata) {
          const pune = iconBtn(ICON.usa, 'Pune ușa', '', 'Desemnează ușa în gol (oamenii o zidesc)')
          pune.addEventListener('click', () => {
            ctx.aplica(usi.lipsa.map((u) => ({ kind: 'desemneaza', wx: u.x, wy: u.y, z: u.z, piesa: Piesa.USA, prioritate: ui.prioritate })))
            scrieInspector(true)
          })
          act.append(pune)
        }
      }
      if (act.childNodes.length > 0) s.append(act)
      out.push(s)
    }
    for (const d of c.desemnari) {
      const fel = d.stare.fel === 'lucru' || d.stare.fel === 'libera' ? 'bine' : d.stare.fel === 'imposibila' ? 'critic' : 'atentie'
      const s = h('section', {},
        h('div', { class: 'ui-kv' }, h('span', {}, 'Lucrare'), h('span', {}, `${d.piesa === Piesa.NICIUNA ? 'Sapă' : `Construiește: ${NUME_PIESA[d.piesa]!.toLowerCase()}`} · ${d.z} m${d.z > c.z ? ' (deasupra)' : ''}`)),
        h('div', { class: 'ui-kv' }, h('span', {}, 'Prioritate'), h('span', { class: 'num', title: 'În versiunea asta prioritatea se alege la desenare (bara de jos)' }, `${d.prioritate} din ${rules.designationPriorityLevels}`)),
        motivEl(d.stare.text, fel),
      )
      const anul = iconBtn(ICON.anuleaza, 'Anulează', '', 'Retrage lucrarea')
      anul.addEventListener('click', () => { ctx.aplica([{ kind: 'anuleazaDesemnarea', id: d.id }]); scrieInspector(true) })
      s.append(h('div', { class: 'ui-actiuni' }, anul))
      out.push(s)
    }
    if (c.morman) {
      const m = c.morman
      const s = h('section', {}, h('div', { class: 'ui-kv' }, h('span', {}, 'Morman'), h('span', { class: 'num' }, cant(m.cantitate, NUME_ITEM[m.fel]?.toLowerCase() ?? ''))))
      if (m.rezervat > 0) s.append(h('div', { class: 'ui-kv' }, h('span', {}, 'Promis cuiva'), h('span', { class: 'num' }, String(m.rezervat))))
      s.append(motivEl(m.stare, m.stare.actiune ? 'atentie' : 'bine'))
      out.push(s)
    }
    if (c.zona) {
      const z = c.zona
      const s = h('section', {}, h('div', { class: 'ui-kv' }, h('span', {}, 'Zonă'), h('span', {}, NUME_ZONA[z.fel] ?? 'Zonă')))
      const act = h('div', { class: 'ui-actiuni' })
      if (z.fel === Zona.DEPOZIT) {
        s.append(h('div', { class: 'ui-kv' }, h('span', {}, 'Prioritate'), h('span', { class: 'num' }, `${z.prioritate} din ${rules.zonePriorityLevels}`)))
        const minus = butonText('− prioritate', () => { ctx.aplica([{ kind: 'setPrioritateZona', id: z.id, prioritate: z.prioritate - 1 }]); scrieInspector(true) }, 'Mai puțin preferat')
        const plus = butonText('+ prioritate', () => { ctx.aplica([{ kind: 'setPrioritateZona', id: z.id, prioritate: z.prioritate + 1 }]); scrieInspector(true) }, 'Cărăușii îl umplu întâi')
        minus.disabled = z.prioritate <= 1
        plus.disabled = z.prioritate >= rules.zonePriorityLevels
        act.append(minus, plus)
      } else {
        s.append(h('div', { class: 'sub' }, 'Oamenii aleg cel mai apropiat loc liber.'))
      }
      const sterge = iconBtn(ICON.stergeZona, 'Șterge zona', '', 'Șterge toată zona')
      sterge.addEventListener('click', () => { ctx.aplica([{ kind: 'stergeZona', id: z.id }]); scrieInspector(true) })
      act.append(sterge)
      s.append(act)
      out.push(s)
    }
    if (c.desemnari.length === 0 && !c.morman && !c.zona) out.push(h('section', {}, h('div', { class: 'sub' }, 'Nimic cerut aici. Alege o unealtă de jos ca să dai de lucru.')))
    const du = iconBtn(ICON.nivel, 'Arată nivelul', '', 'Taie lumea la nivelul celulei')
    du.addEventListener('click', () => ctx.duLa(c.wx, c.wy, c.z, c.z + 1))
    out.push(h('div', { class: 'ui-actiuni' }, du))
    return out
  }

  // ---- oamenii -------------------------------------------------------------------------------
  const tbody = h('tbody')
  const thead = h('thead', {}, h('tr', {},
    h('th', { 'data-sort': 'nume' }, 'Nume'), h('th', { 'data-sort': 'act' }, 'Ce face'),
    h('th', { 'data-sort': 'foame', title: 'Foame' }, 'Foa.'), h('th', { 'data-sort': 'odihna', title: 'Odihnă' }, 'Odi.'), h('th', { 'data-sort': 'disp', title: 'Dispoziție' }, 'Disp.'),
    ...NUME_CATEGORIE.map((n, c) => h('th', { 'data-cat': c, title: `${n} — Shift+clic: toți pe 1 la munca asta` }, n === 'Construiește' ? 'Constr.' : n)),
    h('th', { 'data-sort': 'dist', title: 'Distanța până la cameră' }, 'Dist.'),
  ))
  corpOameni.append(h('table', {}, thead, tbody))
  let sortare: { col: string; jos: boolean } = { col: 'nume', jos: false }
  thead.addEventListener('click', (ev) => {
    const th = (ev.target as HTMLElement).closest('th')
    if (!th) return
    const cat = th.getAttribute('data-cat')
    if (cat !== null) {
      if (!ev.shiftKey) return
      const c = Number(cat)
      ctx.aplica(randuriOameni(w, rules).map((r): Command => ({ kind: 'setPrioritatePersonala', id: r.id, categorie: c, nivel: 1 })))
      toast(`Toți au acum ${NUME_CATEGORIE[c]} pe 1.`)
      scrieOameni(true)
      return
    }
    const col = th.getAttribute('data-sort')
    if (!col) return
    sortare = sortare.col === col ? { col, jos: !sortare.jos } : { col, jos: false }
    scrieOameni(true)
  })
  const randuri = new Map<number, { tr: HTMLTableRowElement; nume: HTMLElement; act: HTMLElement; f: HTMLElement; o: HTMLElement; d: HTMLElement; prio: HTMLElement[]; dist: HTMLElement; cheiePrio: string }>()

  function randNou(r: RandOm) {
    const nume = h('td'), act = h('td', { class: 'act' }), dist = h('td', { class: 'num' })
    const f = nouaBara(), o = nouaBara(), d = nouaBara()
    const prio = NUME_CATEGORIE.map(() => h('td'))
    const tr = h('tr', {}, nume, act, h('td', {}, f), h('td', {}, o), h('td', {}, d), ...prio, dist)
    tr.addEventListener('click', () => {
      const a = w.agents
      const slot = r.slot
      ui.inspecteazaPion(r.id)
      if (a.alive[slot] === 1) ctx.duLa(Math.floor(a.x[slot]! / 1000), Math.floor(a.y[slot]! / 1000), a.z[slot]!, null)
    })
    const x = { tr, nume, act, f, o, d, prio, dist, cheiePrio: '' }
    randuri.set(r.id, x)
    return x
  }

  function scrieOameni(fortat = false): void {
    if (panouSertar.hidden || sertar !== 'oameni') return
    void fortat
    const rs = randuriOameni(w, rules)
    const val = (r: RandOm): number | string => {
      switch (sortare.col) {
        case 'act': return r.activitate
        case 'foame': return r.foame.valoare
        case 'odihna': return r.odihna.valoare
        case 'disp': return r.dispozitie.valoare
        case 'dist': return ctx.distantaLaCamera(r.wx, r.wy, r.z)
        default: return r.nume
      }
    }
    rs.sort((a, b) => { const x = val(a), y = val(b); const c = x < y ? -1 : x > y ? 1 : a.id - b.id; return sortare.jos ? -c : c })
    const vii = new Set(rs.map((r) => r.id))
    for (const [id, x] of randuri) if (!vii.has(id)) { x.tr.remove(); randuri.delete(id) }
    const sel = ui.pionSelectat()
    rs.forEach((r, i) => {
      const x = randuri.get(r.id) ?? randNou(r)
      if (tbody.children[i] !== x.tr) tbody.insertBefore(x.tr, tbody.children[i] ?? null)
      text(x.nume, r.nume)
      text(x.act, r.activitate)
      scrieBara(x.f, r.foame); scrieBara(x.o, r.odihna); scrieBara(x.d, r.dispozitie, true)
      const cheiePrio = r.prioritati.map((p) => `${p.nivel}${p.activa ? 'a' : 'o'}`).join(',')
      if (cheiePrio !== x.cheiePrio) {
        x.cheiePrio = cheiePrio
        r.prioritati.forEach((p, c) => x.prio[c]!.replaceChildren(butonPrioritate(r.id, c, p.nivel, p.activa)))
      }
      text(x.dist, `${Math.round(ctx.distantaLaCamera(r.wx, r.wy, r.z))} m`)
      clasa(x.tr, 'ales', r.id === sel)
    })
  }

  // ---- primii pasi ---------------------------------------------------------------------------
  function noteaza(f: keyof typeof pasi): void { if (!pasi[f]) { pasi[f] = true; scriePasi() } }
  function scrieVizibilitatePasi(): void {
    // Un singur panou mare deschis o data (panoul, JN-9): cu Oamenii deschisi, Primii pasi tac.
    ascuns(cardPasi, pasiInchise || (!panouSertar.hidden && sertar === 'oameni'))
  }
  function scriePasi(): void {
    for (let i = 0; i < w.zone.count; i++) if (w.zone.alive[i] === 1 && w.zone.kind[i] === Zona.DEPOZIT) pasi.depozit = true
    if (pasiInchise) return
    const items: [boolean, string][] = [
      [pasi.depozit, 'Pictează un depozit: Zone (K) ▸ Depozit, trage pe sol'],
      [pasi.sapa, 'Sapă: unealta Sapă (D), trage peste câteva celule — piatra e în rocă, sub pământ'],
      [pasi.piesa, 'Construiește un perete: C, trage un dreptunghi'],
      [pasi.pion, 'Selectează un om (V, clic pe el): vezi ce face și de ce'],
    ]
    const cheie = items.map(([a]) => (a ? 1 : 0)).join('')
    if (listaPasi.dataset.cheie !== cheie) {
      listaPasi.dataset.cheie = cheie
      listaPasi.replaceChildren(...items.map(([gata, t]) => h('li', { class: gata ? 'facut' : '' }, t)))
    }
    const hr = prognozaHrana(w, rules)
    text(hranaPasi, hr.puncte <= 0 ? 'Nu mai ai hrană: în versiunea asta nu se poate produce.' : Number.isFinite(hr.minute) ? `Hrana e finită în versiunea asta: ajunge ${textMinute(hr.minute)}.` : '')
    if (items.every(([a]) => a)) { pasiInchise = true; scrieVizibilitatePasi() }
  }

  // ---- toast ---------------------------------------------------------------------------------
  /**
   * Toasturile se STIVUIESC (cel mult `TOASTURI_MAX`, cel mai vechi iese primul): doua dreptunghiuri
   * trase unul dupa altul au fiecare „Anulează"-ul lui. Cu un singur toast, al doilea il stergea pe
   * primul, cu butonul lui cu tot (recenzia UI-ului, INT-4).
   */
  const TOASTURI_MAX = 3
  function toast(mesaj: string, refuz = false, actiune?: { eticheta: string; f: () => void }): void {
    let timer = 0
    const scoate = () => { window.clearTimeout(timer); t.remove() }
    const b = actiune ? butonText(actiune.eticheta, () => { actiune.f(); scoate() }) : null
    const t = h('div', { class: `ui-toast${refuz ? ' refuz' : ''}`, role: 'status' }, h('span', {}, mesaj), b)
    toasturi.append(t)
    while (toasturi.children.length > TOASTURI_MAX) toasturi.firstElementChild?.remove()
    timer = window.setTimeout(scoate, actiune ? 8000 : refuz ? 5000 : 2600)
  }

  // ---- ferestrele ----------------------------------------------------------------------------
  const voal = h('div', { class: 'ui-voal', hidden: true })
  radacina.append(voal)
  /** Ecranul de titlu nu se inchide cu Esc sau cu un clic pe langa: e o alegere. */
  let titluDeschis = false
  voal.addEventListener('mousedown', (ev) => { if (ev.target === voal && !titluDeschis) inchideFereastra() })
  function deschideFereastra(...copii: Node[]): HTMLElement {
    const f = h('div', { class: 'ui-fereastra', role: 'dialog', 'aria-modal': 'true' }, ...copii)
    voal.replaceChildren(f)
    ascuns(voal, false)
    // Fara `preventScroll`, focusul pe „Închide" (ultimul element al Ajutorului) derula fereastra la
    // capat: la 720p, titlul si paragraful de inceput nu se vedeau (recenzia UI-ului, ECR-9).
    f.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true })
    f.scrollTop = 0
    peTitlu = false
    return f
  }
  function inchideFereastra(): void { voal.replaceChildren(); ascuns(voal, true); titluDeschis = false }
  /** Fereastra deschisa E ecranul de titlu (nu una peste el: Ajutor, Încarcă, Joc nou). */
  let peTitlu = false
  const inapoi = () => (titluDeschis ? arataTitlul : arataMeniul)

  function esc(): boolean {
    // Peste titlu, Esc intoarce la titlu; pe titlu insusi nu face nimic (e o alegere). Inainte, o
    // fereastra deschisa din titlu nu se inchidea cu Esc deloc (recenzia UI-ului, ECR-8).
    if (!voal.hidden) { if (!titluDeschis) inchideFereastra(); else if (!peTitlu) arataTitlul(); return true }
    if (ui.unealta !== Unealta.SELECTEAZA) { alegeUnealta(Unealta.SELECTEAZA); return true }
    if (selectie) { selectie = null; ctx.urmareste(null); scrieInspector(true); return true }
    arataMeniul()
    return true
  }

  function arataMeniul(): void {
    // Momentul linistit al salvarii automate: meniul se deschide oricum.
    salvareAutomata(true)
    const marimi: HTMLButtonElement[] = ['1', '1.25', '1.5'].map((z) => {
      const b = butonText(`${Math.round(Number(z) * 100)}%`, () => {
        radacina.style.setProperty('zoom', z)
        try { localStorage.setItem('kinstead.ui.marime', z) } catch { /* fara stocare */ }
        for (const x of marimi) attr(x, 'aria-pressed', x === b ? 'true' : 'false')
      }, 'Mărimea interfeței')
      attr(b, 'aria-pressed', marimeaActuala() === Number(z) ? 'true' : 'false')
      if (!marimeaIncape(Number(z))) { b.disabled = true; b.title = `Nu încape în fereastra de acum (${window.innerWidth} × ${window.innerHeight}): cere ${Math.ceil(LATIME_UI * Number(z))} × ${Math.ceil(INALTIME_UI * Number(z))}` }
      return b
    })
    deschideFereastra(
      h('h2', {}, 'Meniu'),
      h('div', { class: 'ui-meniu' },
        butonText('Continuă', inchideFereastra),
        butonText('Salvează (Ctrl+S)', () => { void salveazaAcum() }),
        butonText('Descarcă salvarea ca fișier', () => ctx.descarca(primiPasi())),
        butonText('Încarcă…', () => { void arataIncarcarea() }),
        butonText('Joc nou…', arataJocNou),
        butonText('Ajutor (F1)', arataAjutorul),
        butonText('Diagnostic (F3)', () => { inchideFereastra(); ctx.comutaDiagnostic() }),
      ),
      h('div', { class: 'ui-actiuni', style: 'align-items:center' }, h('span', { class: 'sub' }, 'Mărimea interfeței'), ...marimi),
    )
  }

  async function salveazaAcum(): Promise<void> {
    const nume = `Kinstead · ${textTimp(w.tick, rules.ticksPerSecond)} de joc`
    try {
      await ctx.salveaza(`s${Date.now().toString(36)}`, nume, primiPasi())
      if (!voal.hidden && !titluDeschis) inchideFereastra()
      toast(`Salvat: ${nume}`)
    } catch (e) {
      toast(`Salvarea n-a mers: ${e instanceof Error ? e.message : String(e)}`, true)
    }
  }

  let tickUltimaAutomata = w.tick
  let encodeMs = 0
  function salvareAutomata(linistit: boolean): void {
    // Demo-ul (ecranul de titlu, „Explorează demo-ul", o incarcare esuata) nu e jocul nimanui: sub
    // titlul lasat deschis 6 minute, el scria salvarea automata peste jocul jucatorului (recenzia
    // UI-ului, INT-1). Ctrl+S il salveaza, daca vrea cineva.
    if (!salvareAutomataPermisa(ctx.mod)) return
    if (!eTimpulSalvariiAutomate({ tick: w.tick, tickUltima: tickUltimaAutomata, ticksPerSecond: rules.ticksPerSecond, encodeMs, linistit, tragere: ctx.tragere(), golita: golita(w) })) return
    tickUltimaAutomata = w.tick
    ctx.salveaza(idAutomata(w.seed), `Salvare automată · ${textTimp(w.tick, rules.ticksPerSecond)} de joc`, primiPasi())
      .then((ms) => { encodeMs = ms })
      .catch((e: unknown) => toast(`Salvarea automată n-a mers: ${e instanceof Error ? e.message : String(e)}`, true))
  }

  async function arataIncarcarea(): Promise<void> {
    const lista = h('div', { class: 'ui-salvari' }, h('div', { class: 'sub' }, 'Se citesc salvările…'))
    const fisier = h('input', { type: 'file', accept: '.json,application/json', hidden: true })
    fisier.addEventListener('change', () => {
      const f = fisier.files?.[0]
      if (!f) return
      void ctx.incarcaFisier(f).then((motiv) => { if (motiv) toast(motiv, true) })
    })
    deschideFereastra(h('h2', {}, 'Încarcă'), lista, h('div', { class: 'ui-actiuni' }, butonText('Din fișier…', () => fisier.click()), fisier, butonText('Înapoi', inapoi())))
    try {
      const s = await ctx.listaSalvari()
      if (s.length === 0) { lista.replaceChildren(h('div', { class: 'sub' }, 'Nicio salvare încă.')); return }
      lista.replaceChildren(...s.map((x) => {
        const del = butonText('Șterge', () => {
          if (!window.confirm(`Ștergi „${x.nume}"? Nu se poate reface.`)) return
          void ctx.stergeSalvarea(x.id).then(() => arataIncarcarea())
        })
        return h('div', { class: 'ui-salvare' },
          h('div', {}, h('div', {}, x.nume), h('div', { class: 'sub' }, `${new Date(x.salvatLa).toLocaleString('ro-RO')} · ${x.oameni} oameni · lumea ${x.seed}`)),
          butonText('Încarcă', () => ctx.incarca(x.id)), del)
      }))
    } catch (e) {
      lista.replaceChildren(h('div', { class: 'ui-motiv' }, `Salvările nu se pot citi: ${e instanceof Error ? e.message : String(e)}`))
    }
  }

  function arataJocNou(): void {
    const camp = (nume: string, v: number, min: number, max: number) => h('input', { name: nume, type: 'number', value: v, min, max, step: 1, inputmode: 'numeric' })
    const seed = camp('seed', Math.floor(Math.random() * 2 ** 31), 0, 2 ** 31 - 1)
    const oameni = camp('oameni', 12, 1, rules.agentCapacity)
    const piatra = camp('piatra', 1000, 0, 100000)
    const hrana = camp('hrana', HRANA_PE_OM * 12, 0, 100000)
    let hranaAtinsa = false
    const cat = h('div', { class: 'sub' })
    const prog = () => {
      const o = Number(oameni.value), hr = Number(hrana.value)
      const consum = o * rules.nevoi[0]!.scurgere * rules.ticksPerSecond * 60 / rules.nevoiTicks
      cat.textContent = o > 0 && hr >= 0 ? `Hrana ajunge ${textMinute((hr * (rules.nutritie[Item.HRANA] ?? 0)) / consum)} de joc. Hrana nu se poate produce încă: după aceea oamenii pleacă.` : ''
    }
    oameni.addEventListener('input', () => { if (!hranaAtinsa) hrana.value = String(HRANA_PE_OM * Math.max(0, Number(oameni.value) || 0)); prog() })
    hrana.addEventListener('input', () => { hranaAtinsa = true; prog() })
    prog()
    const eroare = h('div', { class: 'ui-motiv', hidden: true })
    const campuri = [seed, oameni, piatra, hrana]
    const NUME_CAMP = ['Sămânța lumii', 'Oameni', 'Piatră', 'Hrană']
    const porneste = butonText('Pornește', () => {
      // Un camp gol sau cu litere e `Number('') === 0`, care trecea de verificari: o colonie fara
      // piatra, pornita fara niciun cuvant (recenzia UI-ului, ECR-10).
      const rau = campuri.findIndex((i) => i.value.trim() === '' || !i.validity.valid || !Number.isInteger(Number(i.value)) || Number(i.value) < Number(i.min) || Number(i.value) > Number(i.max))
      if (rau >= 0) { eroare.textContent = `${NUME_CAMP[rau]}: scrie un număr întreg între ${campuri[rau]!.min} și ${campuri[rau]!.max}.`; ascuns(eroare, false); campuri[rau]!.focus(); return }
      const v = campuri.map((i) => Number(i.value))
      ctx.jocNou({ seed: v[0]!, oameni: v[1]!, piatra: v[2]!, hrana: v[3]! })
    })
    for (const c of campuri) c.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); porneste.click() } })
    deschideFereastra(
      h('h2', {}, 'Joc nou'),
      h('div', { class: 'sub' }, 'Aceeași sămânță dă aceeași lume. Locul de start e ales plat.'),
      h('div', { class: 'ui-form' },
        h('label', {}, 'Sămânța lumii', seed), h('label', {}, 'Oameni', oameni),
        h('label', {}, 'Piatră la început', piatra), h('label', {}, 'Hrană la început', hrana)),
      cat, eroare,
      h('div', { class: 'ui-actiuni' }, porneste, butonText('Înapoi', inapoi())),
    )
  }

  function arataAjutorul(): void {
    deschideFereastra(
      h('h2', {}, 'Cum se joacă'),
      h('div', { class: 'ui-ajutor' },
        h('p', {}, 'Nu comanzi oamenii direct: ceri lucrări — săpat, ziduri, depozite —, iar ei le fac când pot. Când nu pot, Selectează ▸ clic pe lucrare spune de ce, și ce poți face.'),
        h('p', { class: 'sub' }, 'Hrana nu se poate produce încă în versiunea asta: ce aduci la început e tot ce au.'),
        ...AJUTOR.flatMap((s) => [h('h3', {}, s.sectiune), h('dl', {}, ...s.randuri.flatMap(([t, d]) => [h('dt', {}, t), h('dd', {}, d)]))])),
      // Deschis de pe titlu, „Închide" lasa jucatorul in demo, fara hrana si cu alerta critica: acolo
      // e „Înapoi", la titlu, ca la Încarcă si Joc nou (recenzia UI-ului, ECR-8).
      h('div', { class: 'ui-actiuni' }, titluDeschis ? butonText('Înapoi', inapoi()) : butonText('Închide', inchideFereastra)),
    )
  }

  function arataJurnalul(): void {
    const intrari = [...alerte.jurnal].reverse()
    deschideFereastra(
      h('h2', {}, 'Jurnal'),
      intrari.length === 0 ? h('div', { class: 'sub' }, 'Nimic încă.') : h('div', { class: 'ui-jurnal' }, ...intrari.map((x) =>
        h('div', {}, h('span', { class: 'num sub' }, textTimp(x.tick, rules.ticksPerSecond)), h('span', {}, `${x.tip === 'dispare' ? 'A trecut: ' : ''}${x.text}`)))),
      h('div', { class: 'ui-actiuni' }, butonText('Închide', inchideFereastra)),
    )
  }

  function arataTitlul(): void {
    titluDeschis = true
    // Cifrele demo-ului din lume, nu scrise de mana („24 de oameni" erau 20 si 4 jefuitori: ECR-13).
    const rd = rezumatColonie(w, rules)
    const oameniDemo = `${cant(rd.colonisti, 'oameni')}${rd.jefuitori > 0 ? ` și ${cant(rd.jefuitori, 'jefuitori', 'un jefuitor')}` : ''}`
    deschideFereastra(
      h('div', { class: 'ui-titlu' },
        h('h1', {}, 'KINSTEAD'),
        h('p', { class: 'motto' }, 'Un popor care sapă adânc, și ale cărui așezări îi supraviețuiesc.'),
        ctx.mesajPornire ? h('div', { class: 'ui-motiv', style: 'margin-bottom:12px' }, ctx.mesajPornire) : null,
        h('div', { class: 'ui-meniu' },
          butonText('Joc nou…', arataJocNou),
          butonText('Încarcă…', () => { void arataIncarcarea() }),
          butonText('Explorează demo-ul', () => { titluDeschis = false; inchideFereastra() }, `Fortăreața de probă: camere săpate, un zid, un turn, ${oameniDemo}`),
          butonText('Ajutor', arataAjutorul))),
    )
    peTitlu = true
  }

  let golitaArataa = false
  function arataGolita(): void {
    golitaArataa = true
    ctx.seteazaPauza(true)
    const cauza = cauzaGolirii(w, rules) === 'hrana' ? 'S-a terminat hrana, iar în versiunea asta ea nu se poate produce.' : 'Au plecat toți.'
    deschideFereastra(
      h('div', { class: 'ui-golita' },
        h('h2', {}, 'Așezarea s-a golit'),
        h('p', {}, `După ${textTimp(w.tick, rules.ticksPerSecond)} de joc au plecat toți cei ${w.plecatiTotal}.`),
        h('p', { class: 'sub' }, cauza)),
      h('div', { class: 'ui-actiuni' }, butonText('Încarcă…', () => { void arataIncarcarea() }), butonText('Joc nou…', arataJocNou), butonText('Privește lumea', inchideFereastra)),
    )
  }

  // ---- bucla ---------------------------------------------------------------------------------
  let acc = 0
  let accAlerte = 0
  function cadru(dtMs: number): void {
    acc += dtMs
    accAlerte += dtMs
    if (accAlerte >= 500) {
      accAlerte = 0
      if (w.plecatiTotal > plecatiVazuti) {
        const n = w.plecatiTotal - plecatiVazuti
        const t = n === 1 ? 'Un om a plecat din așezare.' : `${cant(n, 'oameni')} au plecat din așezare.`
        eveniment(alerte, 'a-plecat', t, w.tick)
        toast(t, true)
        plecatiVazuti = w.plecatiTotal
      }
      if (golita(w)) {
        alerteAfisate = []
        if (!golitaArataa && ctx.mod !== 'verificare') arataGolita()
      } else {
        golitaArataa = false
        const previz = w.desemnari.viiConstruieste > 0 ? previzRar(false) : null
        alerteAfisate = actualizeaza(alerte, REGULI_ALERTE, semnaleAlerte(w, rules, previz), w.tick, rules.ticksPerSecond)
      }
      scrieAlerte()
      text(btnJurnal, alerte.jurnal.length > 0 ? `Jurnal (${alerte.jurnal.length})` : 'Jurnal')
      salvareAutomata(ctx.pauza())
    }
    if (acc < 250) return
    acc = 0
    const r = rezumatColonie(w, rules)
    scrieCalendar()
    for (const [fel, x] of resurse) {
      const m = r.marfa[fel]!
      text(x.val, textNumar(m.total))
      attr(x.rad, 'title', `${NUME_ITEM[fel]}: ${textNumar(m.inDepozit)} în depozit · ${textNumar(m.peJos)} pe jos · ${textNumar(m.inMaini)} în mâini${fel === Item.PAMANT ? ' — nu se folosește încă la nimic; ocupă loc în depozit' : ''}${fel === Item.HRANA ? ' — nu se poate produce încă' : ''}`)
      ascuns(x.rad, fel === Item.LEMN && m.total === 0)
    }
    const min = r.hrana.minute
    // Fara hrana deloc, alerta critica spune tot; „~0 min" langa un 0 nu spune nimic.
    text(prognoza, Number.isFinite(min) && r.hrana.puncte > 0 ? textMinute(min) : '')
    clasa(prognoza, 'atentie', min < 30 && min >= 10)
    clasa(prognoza, 'critic', min < 10)
    text(oameniVal, String(r.colonisti))
    const ins: string[] = []
    if (r.flamanzi) ins.push(`atentie|${cant(r.flamanzi, 'flămânzi')}`)
    if (r.obositi) ins.push(`atentie|${cant(r.obositi, 'obosiți')}`)
    if (r.nefericiti) ins.push(`critic|${r.nefericiti} refuză munca`)
    if (r.plecati) ins.push(`critic|${cant(r.plecati, 'plecați')}`)
    if (r.jefuitori) ins.push(`atentie|${cant(r.jefuitori, 'jefuitori')}`)
    const cheie = ins.join(',')
    if (insigne.dataset.cheie !== cheie) {
      insigne.dataset.cheie = cheie
      insigne.replaceChildren(...ins.map((x) => { const [c, t] = x.split('|'); return h('span', { class: `ui-insigna ${c}` }, t!) }))
    }
    const pauza = ctx.pauza()
    attr(btnPauza, 'aria-pressed', pauza ? 'true' : 'false')
    const iconPauza = pauza ? ICON.play : ICON.pauza
    if (btnPauza.dataset.icon !== iconPauza) { btnPauza.dataset.icon = iconPauza; btnPauza.innerHTML = iconPauza }
    attr(btnPauza, 'title', pauza ? 'Pornește (Spațiu)' : 'Pauză (Spațiu)')
    btnViteze.forEach((b, i) => attr(b, 'aria-pressed', !pauza && ctx.viteza() === i + 1 ? 'true' : 'false'))
    const ef = ctx.vitezaEfectiva()
    // DESIGN §10: „3× e best effort, cu indicator in UI".
    text(efectiva, !pauza && ef > 0 && ef < ctx.viteza() * 0.9 ? `≈${ef.toFixed(1).replace('.', ',')}×` : '')
    const n = ctx.nivel()
    text(cota, n.cota === null ? '—' : `${n.cota - 1} m`)
    text(rel, n.cota === null ? 'toate nivelurile' : n.sol === null ? 'nivel activ' : n.cota - 1 - n.sol === 0 ? 'la sol' : `sol ${n.cota - 1 - n.sol > 0 ? '+' : '−'}${Math.abs(n.cota - 1 - n.sol)}`)
    for (const o of ['J', 'S', 'I', 'U', 'G'] as const) attr(btnOv[o], 'aria-pressed', ctx.overlayPornit(o) ? 'true' : 'false')
    scrieLegenda(n.cota === null)
    scrieInspector()
    scrieOameni()
    scriePasi()
    if (dreptunghi === null) scrieIndiciu()
  }

  /** Bara de sus: „Toamnă 2/4 · 14:20 · 8° ↘"; tendinta e pe ora de joc urmatoare (clima e o functie pura de tick). */
  function scrieCalendar(): void {
    const m = momentul(w.tick, rules)
    const acum = tAfara(w.seed, w.tick, rules)
    const pesteOra = tAfara(w.seed, w.tick + tickuriPeOra(rules), rules)
    text(calendar, textCalendar(m, rules.calendar.zilePeAnotimp, acum, pesteOra - acum))
    attr(calendar, 'title', textTitluCalendar({
      tick: w.tick,
      moment: m,
      panaLaIarna: panaLaAnotimp(w.tick, Anotimp.IARNA, rules),
      panaLaPrimavara: panaLaAnotimp(w.tick, Anotimp.PRIMAVARA, rules),
      ziTicks: rules.calendar.ziTicks,
      ticksPerSecond: rules.ticksPerSecond,
      viteza: ctx.viteza(),
    }))
  }

  function scrieLegenda(faraNivel: boolean): void {
    const pornit = (['S', 'U', 'I', 'J', 'G'] as const).find((o) => ctx.overlayPornit(o)) ?? null
    if (!pornit) { ascuns(legenda, true); legendaScrisa = ''; return }
    ascuns(legenda, false)
    const L = LEGENDE[pornit]
    const cifre = ctx.cifreOverlay(pornit)
    const vechi = pornit === 'S' && ctx.stabilitateInvechita()
    const cheie = `${pornit}|${faraNivel}|${cifre}|${vechi}|${legendaDeschisa}`
    if (cheie === legendaScrisa) return
    legendaScrisa = cheie
    const comuta = butonText(legendaDeschisa ? 'Ascunde culorile' : 'Ce înseamnă culorile', () => {
      legendaDeschisa = !legendaDeschisa
      try { localStorage.setItem('kinstead.ui.legenda', legendaDeschisa ? '1' : '0') } catch { /* doar pe sesiunea asta */ }
      scrieLegenda(faraNivel)
    })
    comuta.style.height = '22px'
    comuta.style.fontSize = '11px'
    const copii: Node[] = [h('h3', {}, h('span', {}, L.titlu), comuta)]
    const peNivel = pornit === 'S' || pornit === 'I' || pornit === 'U'
    if (!legendaDeschisa && !(peNivel && faraNivel)) {
      // pliata: doar cifrele
    } else if (peNivel && faraNivel && L.fara) {
      const b = butonText('Alege nivelul de sub cameră', () => { const n = ctx.nivel(); ctx.seteazaNivel(n.sol === null ? n.hi : n.sol + 2) })
      copii.push(h('div', { class: 'sub' }, L.fara), h('div', { class: 'ui-actiuni' }, b))
    } else {
      copii.push(h('ul', {}, ...L.randuri.map((r) => h('li', {}, h('span', { class: `mostra${r.diag ? ' diag' : ''}`, style: `background-color:${r.c}` }), h('span', {}, r.t)))))
    }
    if (cifre) copii.push(h('div', { class: 'cifre' }, cifre))
    if (vechi) copii.push(h('div', { class: 'ui-actiuni' }, h('span', { class: 'sub' }, 'Previzualizarea e de mai devreme (e scumpă pe planuri mari).'), butonText('Refă', () => ctx.refaStabilitatea())))
    legenda.replaceChildren(...copii)
  }

  scrieUnelte()
  scriePasi()
  scrieVizibilitatePasi()
  if (ctx.mod === 'titlu') arataTitlul()
  else if (ctx.mesajPornire) toast(ctx.mesajPornire, true)
  return ui
}
