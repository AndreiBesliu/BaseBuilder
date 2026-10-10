/**
 * Plasa pe SURSĂ a punctului unic de sincronizare (S24-27 t.2b §2, panoul IDX-5): un test AST după NUME.
 *
 * Indexul încăperilor, cache-ul de fețe și graful incremental se țin la zi DOAR prin `sincronizeazaLumea`
 * (temperatura.ts): orice altă cale de sincronizare pierde proveniența temperaturii. Plasa refuză, în `src/`,
 * `viewer/`, `bench/` și `tools/` (minus `tools/mutatii`, care ține tiparele probelor ca DATE), orice `Identifier`,
 * `StringLiteral` sau șablon fără substituții cu unul din numele de mai jos, în ORICE poziție (import, re-export,
 * destructurare, acces pe element, șir pentru un `import()` dinamic), în afara modulelor permise; în modulele
 * permise, numele apare doar ca definiție (declarația funcției), ca apel direct sau într-un import FĂRĂ alias — nu
 * exportat sub alt nume, nu atribuit, nu importat ca `{ x as y }` (recenzia PAS-3: un alias la import într-un modul permis,
 * reexportat, era o ușă fără niciun nume interzis în tot arborele). A doua plasă e invariantul la rulare (ștampila
 * temperaturii, temperatura.ts).
 *
 * Ce nu poartă niciun nume (PAS-3): în `src/` și `viewer/`, în afara modulelor sincronizării (camere, fete, termic,
 * temperatura), modulele acestea nu se folosesc ca spațiu de nume (`import * as`), nu se reexportă cu `export *`, nu se
 * încarcă prin `import()` sau `require`, iar un `import()` / `require` cu calea CALCULATĂ se refuză cu totul (`Object.values`,
 * `C['sincronizeaza' + 'Camere']` și șabloanele cu substituții nu mai au pe unde intra). `bench/` și `tools/` rămân doar sub
 * regula numelor: acolo se încarcă module după cale (tools/check-mutatii.mjs, harnașamentul paginii din bench/ui-fum.mjs).
 *
 * Umblarea citește TOATE extensiile de cod (`.ts .mts .cts .tsx .js .mjs .cjs .jsx`) și sare doar `node_modules` și `.git`
 * (înainte: doar `.ts .mjs .js`, plus orice dosar cu punct — PAS-3). NU sare fișierele `__*` (umblarea IDX-5 din
 * fixture.test.ts le sare — cursa cu probele temporare ale testului de disciplină): un fișier dispărut între listare și
 * citire se ignoră, nu se ocolește un nume. Proba negativă e un arbore temporar, în afara repo-ului, cu fișiere FĂRĂ
 * prefixul `__` (și unul cu el), cu aliasul la import, spațiile de nume și fiecare extensie.
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

/** Modulele sincronizării: în afara lor (în `src/` și `viewer/`) nu se folosesc ca spațiu de nume, dinamic sau cu `require`. */
const MODULE_SINC = /(^|\/)(camere|fete|termic|temperatura)(\.(ts|mts|cts|js|mjs|cjs))?$/
const IN_MODULELE_SINC = new Set(['src/sim/camere.ts', 'src/sim/fete.ts', 'src/sim/termic.ts', 'src/sim/temperatura.ts'])
/** Extensiile de cod umblate (toate cele pe care le încarcă Node sau Vite). */
const COD = /\.(ts|mts|cts|tsx|js|mjs|cjs|jsx)$/

interface Rezultat {
  /** `fisier:linie nume (cum)` pentru fiecare apariție nepermisă. */
  readonly incalcari: string[]
  /** Aparițiile PERMISE, pe nume (controlul pozitiv: plasa chiar vede numele în modulele lor). */
  readonly permise: Map<string, number>
  fisiere: number
}

function verificaFisier(rel: string, text: string, r: Rezultat): void {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true)
  const linieDe = (n: import('typescript').Node): number => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1
  // Regula spațiilor de nume (PAS-3): în src/ și viewer/, în afara modulelor sincronizării.
  const faraSpatii = /^(src|viewer)\//.test(rel) && !IN_MODULELE_SINC.has(rel)
  const viz = (n: import('typescript').Node): void => {
    let nume: string | null = null
    if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) nume = n.text
    const unde = nume === null ? undefined : PERMISE.get(nume)
    if (nume !== null && unde !== undefined) {
      const linie = linieDe(n)
      const p = n.parent
      const eDefinitie = ts.isIdentifier(n) && ts.isFunctionDeclaration(p) && p.name === n
      const eApel = ts.isIdentifier(n) && ts.isCallExpression(p) && p.expression === n
      // Importul FĂRĂ alias: `import { x }`, nu `import { x as y }` (PAS-3).
      const eImport = ts.isIdentifier(n) && ts.isImportSpecifier(p) && p.propertyName === undefined
      if (!unde.includes(rel)) r.incalcari.push(`${rel}:${linie} ${nume}`)
      else if (!eDefinitie && !eApel && !eImport) r.incalcari.push(`${rel}:${linie} ${nume} (in modulul permis, dar nu ca definitie, apel sau import fara alias)`)
      else r.permise.set(nume, (r.permise.get(nume) ?? 0) + 1)
    }
    if (faraSpatii) {
      const spec = (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier !== undefined && ts.isStringLiteral(n.moduleSpecifier) ? n.moduleSpecifier.text : null
      if (spec !== null && MODULE_SINC.test(spec)) {
        const b = ts.isImportDeclaration(n) ? n.importClause?.namedBindings : undefined
        if (b !== undefined && ts.isNamespaceImport(b)) r.incalcari.push(`${rel}:${linieDe(n)} import * din ${spec}`)
        if (ts.isExportDeclaration(n) && (n.exportClause === undefined || ts.isNamespaceExport(n.exportClause))) r.incalcari.push(`${rel}:${linieDe(n)} export * din ${spec}`)
      }
      if (ts.isCallExpression(n) && (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
        const a = n.arguments[0]
        if (a === undefined || !ts.isStringLiteralLike(a)) r.incalcari.push(`${rel}:${linieDe(n)} import() / require cu calea calculata`)
        else if (MODULE_SINC.test(a.text)) r.incalcari.push(`${rel}:${linieDe(n)} import() / require din ${a.text}`)
      }
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
      if (n === 'node_modules' || n === '.git' || `${rel}${n}` === 'tools/mutatii') continue
      const cale = join(dir, n)
      let text: string
      try {
        if (statSync(cale).isDirectory()) {
          umbla(cale, `${rel}${n}/`)
          continue
        }
        if (!COD.test(n)) continue
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

test('PLASA punctului unic (§2, IDX-5): in src/, viewer/, bench/ si tools/ numele sincronizarii apar doar in modulele permise, doar ca definitie, apel sau import fara alias; in src/ si viewer/ modulele sincronizarii nu se folosesc ca spatiu de nume, dinamic sau cu require (PAS-3)', () => {
  const r = scaneaza(RADACINA)
  assert.deepEqual(r.incalcari, [])
  // Controlul pozitiv: plasa vede fiecare nume acolo unde are voie (altfel o umblare goală ar ieși verde).
  for (const nume of PERMISE.keys()) assert.ok((r.permise.get(nume) ?? 0) > 0, `${nume}: nicio aparitie permisa vazuta`)
  assert.ok(r.fisiere > 80, `doar ${r.fisiere} fisiere umblate`)
})

test('PLASA punctului unic, proba negativa: un arbore temporar cu ocoliri (import, alias la import si la export, re-export, destructurare, element, import dinamic, spatiu de nume, export *, require, cale calculata, fisier __*, dosar cu punct, fiecare extensie de cod) — fiecare prinsa; folosirea permisa trece', () => {
  const rad = mkdtempSync(join(tmpdir(), 'kinstead-plasa-'))
  try {
    const scrie = (rel: string, text: string): void => {
      mkdirSync(join(rad, rel, '..'), { recursive: true })
      writeFileSync(join(rad, rel), text)
    }
    // Controlul: folosirea permisă (world.ts cheamă indexCamere; temperatura.ts importă și cheamă, și ține fete.ts ca spațiu
    // de nume — între modulele sincronizării e voie); un `import()` cu cale literală spre alt modul (main.ts → panouri.ts) și
    // un `import()` cu cale calculată în tools/ (check-mutatii.mjs încarcă suitele după cale).
    scrie('src/sim/world.ts', "import { indexCamere } from './camere.ts'\nexport const x = indexCamere(null)\n")
    scrie('src/sim/temperatura.ts', "import * as F from './fete.ts'\nimport { sincronizeazaCamere } from './camere.ts'\nexport function f(w: any): void { sincronizeazaCamere(w.camere, w.terrain); void F }\n")
    scrie('viewer/main.ts', "export const ui = () => import('./ui/panouri.ts')\n")
    scrie('tools/incarca.mjs', 'export const incarca = (cale) => import(cale)\n')
    const control = scaneaza(rad)
    assert.deepEqual(control.incalcari, [], 'controlul: folosirea permisa nu e o incalcare')
    assert.equal(control.fisiere, 4, 'controlul: toate fisierele umblate')
    // Ocolirile, fiecare într-un fișier FĂRĂ prefixul `__`.
    scrie('src/harness/ocol-import.ts', "import { sincronizeazaCamere } from '../sim/camere.ts'\nexport function f(w: any): void { sincronizeazaCamere(w.camere, w.terrain) }\n")
    scrie('src/harness/ocol-alias.ts', "import { reconstruiesteCamere as r } from '../sim/camere.ts'\nexport const f = r\n")
    scrie('src/harness/ocol-reexport.ts', "export { construiesteCamere as c } from '../sim/camere.ts'\n")
    scrie('viewer/ocol-destructurare.ts', "import * as C from '../src/sim/fete.ts'\nconst { actualizeazaFete: a } = C\nexport { a }\n")
    scrie('bench/ocol-element.mjs', "import * as F from '../src/sim/fete.ts'\nexport const f = F['reconstruiesteFete']\n")
    scrie('tools/ocol-dinamic.mjs', "export const f = (m) => m[`indexCamere`]\n")
    scrie('src/sim/__ocol.ts', "import { actualizeazaGraful } from './termic.ts'\nexport const g = actualizeazaGraful\n")
    // În modulul permis, un alias exportat (ar face din fete.ts o ușă pentru oricine).
    scrie('src/sim/fete.ts', 'export function actualizeazaFete(): void {}\nexport { actualizeazaFete as af }\n')
    // În modulul permis, un alias LA IMPORT, reexportat: niciun nume interzis nu mai apare în consumator (PAS-3, recenzia:
    // trecea, cu zero apariții interzise în tot arborele).
    scrie('src/sim/temperatura.ts', "import { sincronizeazaCamere as sc } from './camere.ts'\nexport { sc }\nexport function f(w: any): void { sc(w.camere, w.terrain) }\n")
    scrie('src/sim/world.ts', "import { indexCamere as ic } from './camere.ts'\nexport const indexNou = ic\n")
    // Fără niciun nume (PAS-3): spațiul de nume, export *, import() și require ale modulelor sincronizării, calea calculată.
    scrie('src/harness/spatiu.ts', "import * as C from '../sim/camere.ts'\nexport const f = Object.values(C).find((v: any) => typeof v === 'function' && v.length === 2)\n")
    scrie('viewer/compus.ts', "import * as C from '../src/sim/camere.ts'\nexport const f = (C as any)['sincronizeaza' + 'Camere']\n")
    scrie('viewer/totul.ts', "export * from '../src/sim/temperatura.ts'\n")
    scrie('viewer/numit.ts', "export * as T from '../src/sim/termic.ts'\n")
    scrie('viewer/dinamic.ts', "export const m = () => import('../src/sim/fete.ts')\n")
    scrie('src/harness/calculat.ts', "export const m = (k: string) => import('../sim/' + k + '.ts')\n")
    scrie('viewer/cere.cjs', "module.exports = require('../src/sim/camere')\n")
    // Fiecare extensie de cod și un dosar cu punct (înainte nu se citeau deloc).
    scrie('viewer/ocol.mts', "import { sincronizeazaCamere } from '../src/sim/camere.ts'\nexport const f = sincronizeazaCamere\n")
    scrie('src/harness/ocol.tsx', "import { reconstruiesteCamere } from '../sim/camere.ts'\nexport const f = reconstruiesteCamere\n")
    scrie('src/harness/ocol.cts', "import { construiesteCamere } from '../sim/camere.ts'\nexport const f = construiesteCamere\n")
    scrie('viewer/ocol.jsx', "import { actualizeazaGraful } from '../src/sim/termic.ts'\nexport const f = actualizeazaGraful\n")
    scrie('tools/ocol.cjs', "module.exports = require('../src/sim/camere.ts').sincronizeazaCamere\n")
    scrie('src/.ascuns/ocol.ts', "import { sincronizeazaCamere } from '../sim/camere.ts'\nexport const f = sincronizeazaCamere\n")
    // tools/mutatii ține tiparele ca date: nu se umblă.
    scrie('tools/mutatii/tipar.mjs', "export const a = 'sincronizeazaCamere(w.camere, w.terrain)'\n")
    const r = scaneaza(rad)
    const fisiere = [...new Set(r.incalcari.map((l) => l.slice(0, l.indexOf(':'))))].sort()
    assert.deepEqual(fisiere, [
      'bench/ocol-element.mjs',
      'src/.ascuns/ocol.ts',
      'src/harness/calculat.ts',
      'src/harness/ocol-alias.ts',
      'src/harness/ocol-import.ts',
      'src/harness/ocol-reexport.ts',
      'src/harness/ocol.cts',
      'src/harness/ocol.tsx',
      'src/harness/spatiu.ts',
      'src/sim/__ocol.ts',
      'src/sim/fete.ts',
      'src/sim/temperatura.ts',
      'src/sim/world.ts',
      'tools/ocol-dinamic.mjs',
      'tools/ocol.cjs',
      'viewer/cere.cjs',
      'viewer/compus.ts',
      'viewer/dinamic.ts',
      'viewer/numit.ts',
      'viewer/ocol-destructurare.ts',
      'viewer/ocol.jsx',
      'viewer/ocol.mts',
      'viewer/totul.ts',
    ])
    assert.ok(r.incalcari.some((l) => l.startsWith('src/sim/fete.ts:2 actualizeazaFete (in modulul permis')), r.incalcari.join('\n'))
    assert.ok(r.incalcari.some((l) => l.startsWith('src/sim/temperatura.ts:1 sincronizeazaCamere (in modulul permis')), 'aliasul la import, in modulul permis')
    assert.ok(r.incalcari.some((l) => l.startsWith('src/sim/world.ts:1 indexCamere (in modulul permis')), 'aliasul la import, in world.ts')
    assert.ok(r.incalcari.some((l) => l.startsWith('src/harness/ocol-import.ts:2 sincronizeazaCamere')), 'apelul, nu doar importul')
    assert.ok(r.incalcari.some((l) => l.startsWith('viewer/compus.ts:1 import * din')), 'spatiul de nume fara niciun nume interzis')
  } finally {
    rmSync(rad, { recursive: true, force: true })
  }
})
