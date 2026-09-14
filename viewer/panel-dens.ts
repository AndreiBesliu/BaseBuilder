/**
 * D1b — panoul dens, masurat.
 *
 * Cea mai decisiva afirmatie de UI din tot panoul de motor e NEMASURATA in toate
 * cele trei motoare: avocatul Unity a dat o anecdota de forum, cel Unreal si cel
 * Godot au spus onest „n-am gasit o cifra publicata". PLAN.md D1 declara
 * ergonomia UI-ului dens drept ~70% din UX-ul genului si drept criteriul RAMAS
 * al deciziei de motor. bench/GATE.md §12 il tine ca golul nr. 2: fara el,
 * un PASS de randare inchide D1a, nu D1.
 *
 * Deci: 40 de pioni × 25 de coloane = 1.000 de celule live, actualizate la 20 Hz,
 * plus o lista de 300 de stocuri si un tooltip. Cronometrat in ms de CPU.
 *
 * ## Ce masoara asta si ce NU
 *
 * Masoara **podeaua stivei de UI din browser**: DOM simplu, actualizari tintite,
 * zero framework, zero dependente. Daca podeaua asta nu incape in buget, niciun
 * framework nu o repara — toate construiesc PESTE ea.
 *
 * NU masoara React. Un panou React cu 1.000 de componente la 20 Hz e alt numar,
 * si aproape sigur mai mare. Cifra de aici e o LIMITA INFERIOARA, si se
 * raporteaza ca atare. Partea de Unity ramane nemasurata si blocheaza mai departe
 * inchiderea lui D1 — asta nu se schimba fiindca am masurat jumatate.
 *
 * ## Si nu masoara nici tot costul din browser
 *
 * Cronometrul de aici acopera SCRIEREA in DOM. Recalcularea de stiluri, layout-ul
 * si desenarea se intampla mai tarziu, in faza de randare a browserului, si NU
 * intra in fereastra masurata. E exact aceeasi clasa de eroare ca `CPU_busy`
 * masurat in rAF, care nu vede procesul GPU (bench/GATE.md §1).
 *
 * Deci cifra raportata de `densePanelReport` e costul de SCRIPTING, nu costul
 * panoului. Costul intreg se vede o singura data: in intervalul de PREZENTARE al
 * unei rulari reale, cu si fara `?d1b=1`. Pana atunci, e o limita inferioara a
 * unei limite inferioare, si se scrie asa.
 *
 * ## De ce DOM tintit si nu re-randare
 *
 * Fiindca asta ar scrie un om care se pricepe, iar D1b intreaba „cat costa UI-ul
 * dens in stiva asta", nu „cat costa cea mai naiva implementare posibila". O
 * comparatie cinstita cu Unity UI Toolkit cere ca ambele parti sa fie scrise de
 * cineva care vrea sa treaca.
 */

/** Cati pioni are panoul. 40 e plafonul declarat in PLAN pentru o asezare mare. */
export const PANEL_ROWS = 40
/** Cate coloane live per pion: nevoi, stari, competente. */
export const PANEL_COLS = 25
/** Cate randuri are lista de stocuri de langa el. */
export const STOCK_ROWS = 300
/** Cu ce frecventa se actualizeaza. Acelasi tick ca simularea. */
export const PANEL_HZ = 20

const CELLS = PANEL_ROWS * PANEL_COLS

export interface DensePanel {
  readonly root: HTMLElement
  /** Celulele, in ordine fixa. Se scrie direct in ele, nu se reconstruieste nimic. */
  readonly cells: HTMLElement[]
  readonly stocks: HTMLElement[]
  /** Cate actualizari s-au facut. Pentru raport. */
  updates: number
  /** Suma de ms consumati. Media se calculeaza la raportare, nu pe cadru. */
  totalMs: number
  /** Cel mai scump update. Coada conteaza mai mult decat media. */
  maxMs: number
}

function el(tag: string, cls: string, parent: HTMLElement): HTMLElement {
  const e = document.createElement(tag)
  e.className = cls
  parent.appendChild(e)
  return e
}

export function createDensePanel(): DensePanel {
  const root = document.createElement('div')
  root.id = 'd1b'

  const style = document.createElement('style')
  style.textContent = `
    #d1b { position: fixed; top: 12px; right: 12px; bottom: 12px; width: 720px;
           display: grid; grid-template-rows: auto 1fr auto 200px;
           font: 11px/1.25 "IBM Plex Mono", ui-monospace, Consolas, monospace;
           color: #E9E5DC; background: rgba(23,23,21,.94); border: 1px solid #3a382f;
           padding: 10px; gap: 8px; overflow: hidden; }
    #d1b h2 { margin: 0; font: 600 12px/1.2 "IBM Plex Mono", monospace;
              letter-spacing: .14em; text-transform: uppercase; color: #63AEC0; }
    #d1b .grid { display: grid; grid-template-columns: 90px repeat(${PANEL_COLS}, 1fr);
                 gap: 1px; align-content: start; overflow: hidden; }
    #d1b .name { color: #A49D91; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    #d1b .c { text-align: right; font-variant-numeric: tabular-nums; padding: 0 1px; }
    #d1b .lo { color: #D9764A; }
    #d1b .mid { color: #E9E5DC; }
    #d1b .hi { color: #7FA86B; }
    #d1b .stocks { overflow: hidden; columns: 3; column-gap: 12px; }
    #d1b .s { display: flex; justify-content: space-between; color: #A49D91; }
    #d1b .s b { color: #E9E5DC; font-weight: 400; font-variant-numeric: tabular-nums; }
  `
  root.appendChild(style)

  const title = el('h2', '', root)
  title.textContent = `D1b · ${PANEL_ROWS} pioni × ${PANEL_COLS} coloane · ${STOCK_ROWS} stocuri · ${PANEL_HZ} Hz`

  const grid = el('div', 'grid', root)
  const cells: HTMLElement[] = []
  for (let r = 0; r < PANEL_ROWS; r++) {
    const name = el('div', 'name', grid)
    name.textContent = `pion ${String(r + 1).padStart(2, '0')}`
    for (let c = 0; c < PANEL_COLS; c++) cells.push(el('div', 'c mid', grid))
  }

  const stocksTitle = el('h2', '', root)
  stocksTitle.textContent = 'stocuri'
  const stocksBox = el('div', 'stocks', root)
  const stocks: HTMLElement[] = []
  for (let i = 0; i < STOCK_ROWS; i++) {
    const row = el('div', 's', stocksBox)
    const label = document.createElement('span')
    label.textContent = `resursa ${String(i + 1).padStart(3, '0')}`
    const value = document.createElement('b')
    row.appendChild(label)
    row.appendChild(value)
    stocks.push(value)
  }

  document.body.appendChild(root)
  return { root, cells, stocks, updates: 0, totalMs: 0, maxMs: 0 }
}

/**
 * Un tick de panou: toate cele 1.000 de celule plus stocurile.
 *
 * Scrie doar ce s-a SCHIMBAT — `textContent` pe un nod nemodificat tot costa, si
 * asta e jumatate din diferenta dintre un panou care incape in buget si unul care
 * nu. Restul e ca nu se creeaza si nu se distruge niciun nod: structura e fixa,
 * se schimba numai continutul.
 */
export function tickDensePanel(p: DensePanel, tick: number): void {
  const t0 = performance.now()

  for (let i = 0; i < CELLS; i++) {
    // Valori care se schimba plauzibil: majoritatea lent, cateva rapid — ca in joc.
    const v = (((i * 2654435761) ^ (tick * (1 + (i & 7)))) >>> 24) & 0xff
    const cell = p.cells[i]!
    const text = String(v)
    if (cell.textContent !== text) cell.textContent = text
    const cls = v < 64 ? 'c lo' : v < 192 ? 'c mid' : 'c hi'
    if (cell.className !== cls) cell.className = cls
  }

  for (let i = 0; i < STOCK_ROWS; i++) {
    const v = ((i * 40503 + tick * 7) % 9999) + 1
    const node = p.stocks[i]!
    const text = String(v)
    if (node.textContent !== text) node.textContent = text
  }

  const dt = performance.now() - t0
  p.updates++
  p.totalMs += dt
  if (dt > p.maxMs) p.maxMs = dt
}

export function densePanelReport(p: DensePanel): {
  updates: number
  mediaMs: number
  maxMs: number
  celule: number
} {
  return {
    updates: p.updates,
    mediaMs: p.updates === 0 ? 0 : p.totalMs / p.updates,
    maxMs: p.maxMs,
    celule: CELLS + STOCK_ROWS,
  }
}
