/**
 * Tastele — PUR: o singura sursa de ACTIUNI pe tasta, pentru tot viewer-ul.
 *
 * Inainte, main.ts avea un ascultator mare care comuta overlay-uri pe litere fara nicio garda:
 * Ctrl+S comuta stabilitatea, iar „Kinstead" tastat intr-un camp pornea traversarea camerei la
 * 40 m/s (panoul de design al UI-ului, I6 / T6 / JN-8). Acum fiecare keydown trece intai pe aici.
 *
 * Garzile, in ordine:
 *  1. focusul intr-un camp editabil sau o compunere IME in curs ⇒ nimic (nici preventDefault);
 *  2. o fereastra modala deschisa ⇒ doar Esc, F1, F3;
 *  3. Ctrl / Meta / Alt ⇒ doar Ctrl+S (si Meta+S); literele vechi merg DOAR fara ei;
 *  4. fara UI (rularile de gate) ⇒ doar tastele de azi, niciuna noua.
 *
 * Ascultatorii de stare TINUTA (Z/X pentru zone, modificatorii fantomei) raman separati: ei nu fac
 * actiuni, tin minte ce e apasat.
 */

export type Actiune =
  // ale viewer-ului de azi
  | 'amprenta' | 'amprentaStanga' | 'amprentaDreapta' | 'amprentaForma' | 'amprentaAncora'
  | 'piesa' | 'pauza' | 'ciclulH' | 'overlayG' | 'overlayJ' | 'overlayS' | 'overlayI'
  | 'traversare' | 'traversareSens' | 'ceas' | 'nivelJos' | 'nivelSus' | 'nivelOprit'
  // ale UI-ului de joc
  | 'selecteaza' | 'sapa' | 'construieste' | 'anuleaza' | 'zona' | 'oameni'
  | 'viteza1' | 'viteza2' | 'viteza3' | 'salveaza' | 'ajutor' | 'diagnostic' | 'esc'
  | 'cameraVest' | 'cameraEst' | 'cameraNord' | 'cameraSud'

export interface IntrareTasta {
  readonly key: string
  readonly ctrl: boolean
  readonly shift: boolean
  readonly alt: boolean
  readonly meta: boolean
  /** Tinta evenimentului e un INPUT / TEXTAREA / SELECT / contenteditable. */
  readonly editabil: boolean
  /** `KeyboardEvent.isComposing`: o compunere IME in curs. */
  readonly compunere: boolean
  /** O fereastra modala a UI-ului e deschisa. */
  readonly modal: boolean
  /** 'faraUI' = rulare de gate; 'verificare' = OWNER_VERIFY 12/13; 'joc' = restul. */
  readonly mod: 'faraUI' | 'verificare' | 'joc'
  /** Amprenta (B) e aprinsa: abia atunci , . N M au inteles. */
  readonly amprenta: boolean
}

export interface IesireTasta {
  readonly actiune: Actiune | null
  /** Se cheama `preventDefault` (Spatiu, F1, F3, Ctrl+S, sagetile, PageUp/Down). */
  readonly consuma: boolean
}

const NIMIC: IesireTasta = { actiune: null, consuma: false }
const fa = (actiune: Actiune, consuma = false): IesireTasta => ({ actiune, consuma })

export function actiuneTasta(t: IntrareTasta): IesireTasta {
  if (t.editabil || t.compunere) return NIMIC
  const cuUI = t.mod !== 'faraUI'
  const k = t.key.length === 1 ? t.key.toLowerCase() : t.key

  if (cuUI) {
    if (k === 'Escape') return fa('esc', true)
    if (k === 'F1') return fa('ajutor', true)
    if (k === 'F3') return fa('diagnostic', true)
  }
  if (t.modal) return NIMIC
  if (t.ctrl || t.meta) return cuUI && k === 's' && !t.alt ? fa('salveaza', true) : NIMIC
  if (t.alt) return NIMIC

  if (t.amprenta) {
    if (k === ',' || k === '<') return fa('amprentaStanga')
    if (k === '.' || k === '>') return fa('amprentaDreapta')
    if (k === 'n') return fa('amprentaForma')
    if (k === 'm') return fa('amprentaAncora')
  }
  switch (k) {
    case 'b': return fa('amprenta')
    case 'p': return fa('piesa')
    case ' ': return fa('pauza', true)
    case 'h': return fa(cuUI && t.mod === 'joc' ? 'ajutor' : 'ciclulH')
    case 'g': return fa('overlayG')
    case 'j': return fa('overlayJ')
    case 's': return fa('overlayS')
    // I = Încăperi. C era deja Construiește (panoul camerelor, JUC-10).
    case 'i': return fa('overlayI')
    case 't': return fa(t.shift ? 'traversareSens' : 'traversare')
    case 'f': return fa('ceas')
    case 'q': return fa('nivelJos')
    case 'e': return fa('nivelSus')
    case 'r': return fa('nivelOprit')
  }
  if (!cuUI) return NIMIC
  switch (k) {
    case 'PageDown': return fa('nivelJos', true)
    case 'PageUp': return fa('nivelSus', true)
    case 'v': return fa('selecteaza')
    case 'd': return fa('sapa')
    case 'c': return fa('construieste')
    case 'a': return fa('anuleaza')
    case 'k': return fa('zona')
    case 'o': return fa('oameni')
    case '1': return fa('viteza1')
    case '2': return fa('viteza2')
    case '3': return fa('viteza3')
    case 'ArrowLeft': return fa('cameraVest', true)
    case 'ArrowRight': return fa('cameraEst', true)
    case 'ArrowUp': return fa('cameraNord', true)
    case 'ArrowDown': return fa('cameraSud', true)
  }
  return NIMIC
}

/** Tinta unui eveniment e editabila? (fara DOM in tipuri: primeste ce trebuie din element). */
export function tintaEditabila(tag: string | undefined, contentEditable: boolean): boolean {
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || contentEditable
}
