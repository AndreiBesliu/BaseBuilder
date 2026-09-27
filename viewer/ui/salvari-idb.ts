/**
 * Salvarile in IndexedDB — doar in browser. Asincron, si are voie: regula „fara async" e a lui
 * `src/sim/`, nu a viewer-ului. Plicul si validarea sunt in salvari-plic.ts (pure, testate).
 */

import { valideazaSalvare } from './salvari-plic.ts'
import type { RezumatSalvare, Salvare } from './salvari-plic.ts'

const DB = 'kinstead'
const STORE = 'salvari'

function deschide(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1)
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }) }
    r.onsuccess = () => res(r.result)
    r.onerror = () => rej(r.error ?? new Error('IndexedDB nu se deschide'))
  })
}

function tranzactie<T>(mod: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return deschide().then((db) => new Promise<T>((res, rej) => {
    const t = db.transaction(STORE, mod)
    const req = f(t.objectStore(STORE))
    t.oncomplete = () => { db.close(); res(req.result) }
    t.onerror = () => { db.close(); rej(t.error ?? req.error ?? new Error('tranzactie esuata')) }
    t.onabort = () => { db.close(); rej(t.error ?? new Error('tranzactie anulata')) }
  }))
}

export function scrieSalvare(s: Salvare): Promise<unknown> {
  return tranzactie('readwrite', (st) => st.put(s))
}

export async function citesteSalvare(id: string): Promise<{ ok: true; value: Salvare } | { ok: false; motiv: string }> {
  const x: unknown = await tranzactie('readonly', (st) => st.get(id))
  if (x === undefined) return { ok: false, motiv: 'Salvarea nu mai există.' }
  return valideazaSalvare(x)
}

export function stergeSalvare(id: string): Promise<unknown> {
  return tranzactie('readwrite', (st) => st.delete(id))
}

/** Toate salvarile valide, cele mai noi primele, fara textul lumii. */
export async function listaSalvari(): Promise<RezumatSalvare[]> {
  const toate: unknown[] = await tranzactie('readonly', (st) => st.getAll())
  const out: RezumatSalvare[] = []
  for (const x of toate) {
    const v = valideazaSalvare(x)
    if (!v.ok) continue
    const { lume: _lume, ...rest } = v.value
    void _lume
    out.push(rest)
  }
  out.sort((a, b) => (a.salvatLa < b.salvatLa ? 1 : a.salvatLa > b.salvatLa ? -1 : 0))
  return out
}
