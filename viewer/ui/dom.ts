/**
 * Ajutoare de DOM, fara framework. `h` construieste, `text`/`attr` scriu DOAR cand valoarea s-a
 * schimbat: panourile se reimprospateaza de 4 ori pe secunda, iar o scriere identica in
 * `textContent` tot invalideaza layout-ul.
 */

type Copil = Node | string | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, atrib: Record<string, string | number | boolean | null | undefined> = {}, ...copii: Copil[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(atrib)) {
    if (v === null || v === undefined || v === false) continue
    if (k === 'class') e.className = String(v)
    else if (k === 'html') e.innerHTML = String(v)
    else e.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of copii) {
    if (c === null || c === undefined || c === false) continue
    e.append(typeof c === 'string' ? document.createTextNode(c) : c)
  }
  return e
}

const TEXT = new WeakMap<Node, string>()

/** Scrie `textContent` doar daca s-a schimbat. */
export function text(e: HTMLElement, s: string): void {
  if (TEXT.get(e) === s) return
  TEXT.set(e, s)
  e.textContent = s
}

/** Scrie un atribut doar daca s-a schimbat; `null` il sterge. */
export function attr(e: Element, nume: string, v: string | null): void {
  const acum = e.getAttribute(nume)
  if (acum === v) return
  if (v === null) e.removeAttribute(nume)
  else e.setAttribute(nume, v)
}

/** Clasa `c` pusa sau scoasa, fara scriere cand nu se schimba. */
export function clasa(e: Element, c: string, pus: boolean): void {
  if (e.classList.contains(c) !== pus) e.classList.toggle(c, pus)
}

export function ascuns(e: HTMLElement, da: boolean): void {
  if (e.hidden !== da) e.hidden = da
}

/** Un element de formular are focusul: tastele de joc nu au voie sa-l fure (seed-ul, numele salvarii). */
export function tastareInCamp(ev: KeyboardEvent): boolean {
  const t = ev.target as HTMLElement | null
  if (!t) return false
  const tag = t.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable
}
