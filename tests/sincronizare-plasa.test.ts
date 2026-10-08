/**
 * Plasa pe SURSĂ a punctului unic de sincronizare (S24-27 t.2b §2, panoul IDX-5): un test AST după NUME.
 *
 * Indexul încăperilor, cache-ul de fețe și graful incremental se țin la zi DOAR prin `sincronizeazaLumea`
 * (temperatura.ts): orice altă cale de sincronizare pierde proveniența temperaturii. Plasa refuză, în `src/`,
 * `viewer/`, `bench/` și `tools/` (minus `tools/mutatii`, care ține tiparele probelor ca DATE), orice `Identifier`,
 * `StringLiteral` sau șablon fără substituții cu unul din numele de mai jos, în ORICE poziție (import, re-export,
 * destructurare, acces pe element, șir pentru un `import()` dinamic), în afara modulelor permise; în modulele
 * permise, numele apare doar ca definiție (declarația funcției), ca apel direct sau într-un import — nu exportat sub alt
 * nume, nu atribuit. A doua plasă e invariantul la rulare (ștampila temperaturii, temperatura.ts).
 *
 * Umblarea NU sare fișierele `__*` (umblarea IDX-5 din fixture.test.ts le sare — cursa cu probele temporare ale testului
 * de disciplină): un fișier dispărut între listare și citire se ignoră, nu se ocolește un nume. Proba negativă e un
 * arbore temporar, în afara repo-ului, cu fișiere FĂRĂ prefixul `__` (și unul cu el).
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ts = createRequire(import.meta.url)('typescript') as typeof import('typescript')

/** Numele interzise și modulele în care au voie (definiție, apel, import). */
const PERMISE: ReadonlyMap<string, readonly string[]> = new Map([
  ['sincronizeazaCamere', ['src/sim/camere.ts', 'src/sim/temperatura.ts']],
  ['reconstruiesteCamere', ['src/sim/camere.ts', 'src/sim/temperatura.ts']],
  ['construiesteCamere', ['src/sim/camere.ts', 'src/sim/temperatura.ts']],
  ['reconstruiesteFete', ['src/sim/fete.ts', 'src/sim/camere.ts', 'src/sim/temperatura.ts']],
  ['actualizeazaFete', ['src/sim/fete.ts', 'src/sim/camere.ts', 'src/sim/temperatura.ts']],
  ['indexCamere', ['src/sim/camere.ts', 'src/sim/temperatura.ts', 'src/sim/world.ts']],
  ['incarcaTemperaturi', ['src/sim/temperatura.ts', 'src/sim/save.ts']],
  ['temperaturaLaEchilibru', ['src/sim/temperatura.ts', 'src/sim/save.ts', 'src/harness/fixture-m10.ts']],
  // Graful incremental (S2): delta și refacerea de urgență le cheamă doar punctul unic și pasul.
  ['actualizeazaGraful', ['src/sim/termic.ts', 'src/sim/temperatura.ts']],
  ['refaGrafulDeUrgenta', ['src/sim/termic.ts', 'src/sim/temperatura.ts']],
])

interface Rezultat {
  /** `fisier:linie nume (cum)` pentru fiecare apariție nepermisă. */
  readonly incalcari: string[]
  /** Aparițiile PERMISE, pe nume (controlul pozitiv: plasa chiar vede numele în modulele lor). */
  readonly permise: Map<string, number>
  fisiere: number
}

function verificaFisier(rel: string, text: string, r: Rezultat): void {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true)
  const viz = (n: import('typescript').Node): void => {
    let nume: string | null = null
    if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) nume = n.text
    const unde = nume === null ? undefined : PERMISE.get(nume)
    if (nume !== null && unde !== undefined) {
      const linie = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
      const p = n.parent
      const eDefinitie = ts.isIdentifier(n) && ts.isFunctionDeclaration(p) && p.name === n
      const eApel = ts.isIdentifier(n) && ts.isCallExpression(p) && p.expression === n
      const eImport = ts.isIdentifier(n) && ts.isImportSpecifier(p)
      if (!unde.includes(rel)) r.incalcari.push(`${rel}:${linie} ${nume}`)
      else if (!eDefinitie && !eApel && !eImport) r.incalcari.push(`${rel}:${linie} ${nume} (in modulul permis, dar nu ca definitie, apel sau import)`)
      else r.permise.set(nume, (r.permise.get(nume) ?? 0) + 1)
    }
    ts.forEachChild(n, viz)
  }
  viz(sf)
}

/** Umblă `src/`, `viewer/`, `bench/`, `tools/` (minus `tools/mutatii`) sub `radacina`. */
function scaneaza(radacina: string): Rezultat {
  const r: Rezultat = { incalcari: [], permise: new Map(), fisiere: 0 }
  const umbla = (dir: string, rel: string): void => {
    let nume: string[]
    try {
      nume = readdirSync(dir).sort()
    } catch {
      return
    }
    for (const n of nume) {
      if (n === 'node_modules' || n.startsWith('.') || `${rel}${n}` === 'tools/mutatii') continue
      const cale = join(dir, n)
      let text: string
      try {
        if (statSync(cale).isDirectory()) {
          umbla(cale, `${rel}${n}/`)
          continue
        }
        if (!/\.(ts|mjs|js)$/.test(n)) continue
        text = readFileSync(cale, 'utf8')
      } catch (e) {
        // Un fișier șters între listare și citire (probele temporare ale altor teste) nu e un ocol.
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw e
      }
      r.fisiere++
      verificaFisier(`${rel}${n}`, text, r)
    }
  }
  for (const d of ['src', 'viewer', 'bench', 'tools']) umbla(join(radacina, d), `${d}/`)
  return r
}

const RADACINA = fileURLToPath(new URL('../', import.meta.url))

test('PLASA punctului unic (§2, IDX-5): in src/, viewer/, bench/ si tools/ numele sincronizarii apar doar in modulele permise, doar ca definitie, apel sau import', () => {
  const r = scaneaza(RADACINA)
  assert.deepEqual(r.incalcari, [])
  // Controlul pozitiv: plasa vede fiecare nume acolo unde are voie (altfel o umblare goală ar ieși verde).
  for (const nume of PERMISE.keys()) assert.ok((r.permise.get(nume) ?? 0) > 0, `${nume}: nicio aparitie permisa vazuta`)
  assert.ok(r.fisiere > 80, `doar ${r.fisiere} fisiere umblate`)
})

test('PLASA punctului unic, proba negativa: un arbore temporar cu ocoliri (import, alias, re-export, destructurare, element, import dinamic, fisier __*) — fiecare prinsa; folosirea permisa trece', () => {
  const rad = mkdtempSync(join(tmpdir(), 'kinstead-plasa-'))
  try {
    const scrie = (rel: string, text: string): void => {
      mkdirSync(join(rad, rel, '..'), { recursive: true })
      writeFileSync(join(rad, rel), text)
    }
    // Controlul: folosirea permisă (world.ts cheamă indexCamere; temperatura.ts importă și cheamă).
    scrie('src/sim/world.ts', "import { indexCamere } from './camere.ts'\nexport const x = indexCamere(null)\n")
    scrie('src/sim/temperatura.ts', "import { sincronizeazaCamere } from './camere.ts'\nexport function f(w: any): void { sincronizeazaCamere(w.camere, w.terrain) }\n")
    const control = scaneaza(rad)
    assert.deepEqual(control.incalcari, [], 'controlul: folosirea permisa nu e o incalcare')
    // Ocolirile, fiecare într-un fișier FĂRĂ prefixul `__`.
    scrie('src/harness/ocol-import.ts', "import { sincronizeazaCamere } from '../sim/camere.ts'\nexport function f(w: any): void { sincronizeazaCamere(w.camere, w.terrain) }\n")
    scrie('src/harness/ocol-alias.ts', "import { reconstruiesteCamere as r } from '../sim/camere.ts'\nexport const f = r\n")
    scrie('src/harness/ocol-reexport.ts', "export { construiesteCamere as c } from '../sim/camere.ts'\n")
    scrie('viewer/ocol-destructurare.ts', "import * as C from '../src/sim/fete.ts'\nconst { actualizeazaFete: a } = C\nexport { a }\n")
    scrie('bench/ocol-element.mjs', "import * as F from '../src/sim/fete.ts'\nexport const f = F['reconstruiesteFete']\n")
    scrie('tools/ocol-dinamic.mjs', "export const f = (m) => m[`indexCamere`]\n")
    scrie('src/sim/__ocol.ts', "import { actualizeazaGraful } from './termic.ts'\nexport const g = actualizeazaGraful\n")
    // În modulul permis, un alias exportat (ar face din temperatura.ts o ușă pentru oricine).
    scrie('src/sim/temperatura.ts', "import { sincronizeazaCamere } from './camere.ts'\nexport { sincronizeazaCamere as sinc }\nexport function f(w: any): void { sincronizeazaCamere(w.camere, w.terrain) }\n")
    // tools/mutatii ține tiparele ca date: nu se umblă.
    scrie('tools/mutatii/tipar.mjs', "export const a = 'sincronizeazaCamere(w.camere, w.terrain)'\n")
    const r = scaneaza(rad)
    const fisiere = [...new Set(r.incalcari.map((l) => l.slice(0, l.indexOf(':'))))].sort()
    assert.deepEqual(fisiere, [
      'bench/ocol-element.mjs',
      'src/harness/ocol-alias.ts',
      'src/harness/ocol-import.ts',
      'src/harness/ocol-reexport.ts',
      'src/sim/__ocol.ts',
      'src/sim/temperatura.ts',
      'tools/ocol-dinamic.mjs',
      'viewer/ocol-destructurare.ts',
    ])
    assert.ok(r.incalcari.some((l) => l.startsWith('src/sim/temperatura.ts:2 sincronizeazaCamere (in modulul permis')), r.incalcari.join('\n'))
    assert.ok(r.incalcari.some((l) => l.startsWith('src/harness/ocol-import.ts:2 sincronizeazaCamere')), 'apelul, nu doar importul')
  } finally {
    rmSync(rad, { recursive: true, force: true })
  }
})
