#!/usr/bin/env node
/**
 * Disciplina folderului `sim/`, impusa mecanic.
 *
 * Regulile de determinism sunt usor de scris intr-un document si usor de incalcat
 * la ora doua noaptea. Un `Date.now()` strecurat in simulare produce un bug care
 * se reproduce „o data din cinci" si dispare cand adaugi un log — exact clasa de
 * defect care mananca zile. Asa ca regulile sunt un test, nu o intentie.
 *
 * Iesire 0 = curat. Iesire 1 = incalcari, listate cu fisier:linie.
 *
 * Portita: pune `determinism-ok: <motiv>` pe aceeasi linie sau pe linia dinainte.
 * Nu e o scapare gratuita — te obliga sa scrii DE CE e in regula, iar motivul
 * ramane in cod pentru cine citeste peste un an.
 *
 * ## Textul se citeste prin AST-ul TypeScript, nu cu `indexOf` pe linii (recenzia t.2a, L2-1)
 *
 * Pana la 08.10 comentariile se taiau cu `indexOf('/*')` si `indexOf('//')`, fara sa stie de siruri: un
 * `'src/*'` dintr-un sir „deschidea" un comentariu care ascundea liniile pana la primul `*\/` (mediana 15
 * linii de cod, maximul 346), iar un `'a//b'` restul liniei — si odata cu ele TOATE regulile, Date.now si
 * Math.random inclusiv. Iar `Math.cos` se cauta ca text, deci `Math['cos']`, `const { cos } = Math`,
 * `Math?.cos`, `Math\n.cos` sau un alias treceau. Acum:
 * - comentariile sunt trivia dintre tokenii AST-ului (`typescript` e deja devDependency);
 * - `Math` e permis DOAR ca `Math.<MATH_PERMIS>`, iar `**` / `**=` se citesc din AST — o singura plasa,
 *   fara regexurile vechi pentru transcendente, `**` si `Math.random`;
 * - restul regulilor (Date.now, timere, process.*, Object.keys nesortat) raman regexuri, pe liniile
 *   curatate corect. Politica e cea din tabelul din CLAUDE.md, neschimbata.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ts = createRequire(import.meta.url)('typescript')

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SIM_DIR = join(ROOT, 'src', 'sim')

/**
 * Membrii lui `Math` permisi in sim/: exacti sau corect rotunjiti (IEEE 754 cere `sqrt` corect rotunjit) si
 * constantele. Functiile transcendente sunt APROXIMATE de motor (ECMA-262 nu le cere bit-identice): aceeasi
 * lume ar avea alta clima pe alta masina — clima foloseste tabele pe intregi (clima.ts). FARA `random`:
 * aleatorul vine din fluxuri numite (rng.ts). (Panoul temperaturii, L4-7: inainte, singura interdictie din
 * `Math.*` era `random`.)
 */
const MATH_PERMIS = new Set(['abs', 'floor', 'ceil', 'round', 'trunc', 'sign', 'min', 'max', 'imul', 'clz32', 'fround', 'sqrt',
  'PI', 'E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'SQRT1_2', 'SQRT2'])

/** Interdictii dure: nu exista motiv bun intr-un nucleu de simulare. */
const FORBIDDEN = [
  { re: /\bDate\.now\s*\(/, msg: 'Date.now() — timpul e w.tick, nu ceasul masinii' },
  { re: /\bnew\s+Date\s*\(/, msg: 'new Date() — timpul e w.tick, nu ceasul masinii' },
  { re: /\bperformance\.now\s*\(/, msg: 'performance.now() — masoara in harness, nu in sim' },
  { re: /\basync\s/, msg: 'async — simularea e sincrona, pas cu pas' },
  { re: /\bawait\s/, msg: 'await — simularea e sincrona, pas cu pas' },
  { re: /\bnew\s+Promise\b/, msg: 'Promise — simularea e sincrona, pas cu pas' },
  { re: /\bsetTimeout\s*\(|\bsetInterval\s*\(/, msg: 'timer — simularea nu asteapta ceasul' },
  { re: /\bprocess\.(env|argv|hrtime)\b/, msg: 'process.* — nucleul nu citeste mediul' },
  // `Math.*` (transcendentele, `random`) si `**` se judeca pe AST, in `incalcariAst` — nu aici.
]

/** Suspecte: permise doar cu `.sort(` pe aceeasi linie sau cu justificare. */
const NEEDS_ORDER = [
  { re: /\bObject\.(keys|values|entries)\s*\(/, msg: 'iterare peste chei de obiect fara sortare' },
]

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (name.endsWith('.ts')) out.push(p)
  }
  return out
}

/**
 * Liniile fisierului cu comentariile scoase (inlocuite cu spatii, ca pozitiile si liniile sa ramana).
 *
 * Fara pasul asta, checker-ul isi raporteaza propria documentatie: docblocul care
 * ENUMERA tiparele interzise contine chiar tiparele interzise. Prima versiune a
 * cazut exact asa — instrumentul, nu codul, era gresit.
 *
 * Comentariile sunt trivia dintre tokeni: le citesc la inceputul FIECARUI token frunza (si al EOF), deci si
 * pe cele din `f(/* x *\/)` sau `{ /* x *\/ }`, care nu stau la capatul niciunui nod. Un `'/*'` dintr-un sir,
 * un regex sau un template e un token, nu trivia: nu mai deschide nimic.
 */
function analizeaza(text) {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true)
  const ch = text.split('')
  const sterge = (pos) => {
    for (const r of [...(ts.getLeadingCommentRanges(text, pos) ?? []), ...(ts.getTrailingCommentRanges(text, pos) ?? [])]) {
      for (let i = r.pos; i < r.end; i++) if (ch[i] !== '\n' && ch[i] !== '\r') ch[i] = ' '
    }
  }
  const frunze = (n) => {
    if (ts.isJSDoc(n)) return
    const kids = n.getChildren(sf)
    if (kids.length === 0) { sterge(n.pos); return }
    for (const c of kids) frunze(c)
  }
  frunze(sf)
  sterge(sf.endOfFileToken.pos)
  return { sf, lines: ch.join('').split(/\r?\n/) }
}

/**
 * Interdictiile pe AST, FARA portita: `Math` altfel decat `Math.<MATH_PERMIS>` (alias, destructurare,
 * indexare, `?.`, o transcendenta, `random`) si operatorii `**` / `**=` (semantica lui `Math.pow`).
 * `const { min, max } = Math` e refuzat si el, desi e inofensiv: o singura forma permisa e o regula simpla.
 */
function incalcariAst(sf) {
  const out = []
  const linia = (n) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line
  const viziteaza = (node) => {
    if (ts.isIdentifier(node) && node.text === 'Math') {
      const ref = ts.isPropertyAccessExpression(node.parent) && node.parent.name === node ? node.parent : node // globalThis.Math
      const p = ref.parent
      const tip = ts.isTypeReferenceNode(p) || ts.isTypeQueryNode(p) || ts.isQualifiedName(p)
      const nume = ts.isPropertyAccessExpression(p) && p.expression === ref ? p.name.text : null
      if (!tip && !(nume && MATH_PERMIS.has(nume))) {
        out.push({ line: linia(node), msg: nume === 'random'
          ? 'Math.random — aleatorul vine din fluxuri numite (rng.ts)'
          : 'Math altfel decat Math.<abs|floor|…|sqrt> — transcendentele sunt aproximate de motor, nu bit-identice intre masini: tabele pe intregi (clima.ts)' })
      }
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === 'Math') {
      out.push({ line: linia(node), msg: "['Math'] — acces ocolit la Math" })
    }
    if (ts.isBinaryExpression(node) && (node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken || node.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskEqualsToken)) {
      out.push({ line: linia(node), msg: '** — semantica Math.pow, aproximata de motor: inmultiri intregi' })
    }
    ts.forEachChild(node, viziteaza)
  }
  viziteaza(sf)
  return out
}

let violations = 0
let filesChecked = 0

for (const file of walk(SIM_DIR)) {
  filesChecked++
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const text = readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/)
  const { sf, lines: stripped } = analizeaza(text)

  for (const v of incalcariAst(sf)) {
    console.error(`${rel}:${v.line + 1}  ${v.msg}`)
    console.error(`    ${lines[v.line].trim()}`)
    violations++
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    const code = stripped[i]
    // Justificarea poate sta pe linia de cod sau oriunde in blocul de comentariu
    // care o precede imediat — o justificare buna are adesea doua-trei randuri.
    let exempt = raw.includes('determinism-ok:')
    for (let j = i - 1; !exempt && j >= 0; j--) {
      const t = lines[j].trim()
      if (!t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')) break
      if (t.includes('determinism-ok:')) exempt = true
    }

    for (const rule of FORBIDDEN) {
      if (rule.re.test(code)) {
        console.error(`${rel}:${i + 1}  ${rule.msg}`)
        console.error(`    ${raw.trim()}`)
        violations++
      }
    }

    if (!exempt) {
      for (const rule of NEEDS_ORDER) {
        if (rule.re.test(code) && !code.includes('.sort(')) {
          console.error(`${rel}:${i + 1}  ${rule.msg}`)
          console.error(`    ${raw.trim()}`)
          console.error(`    (adauga .sort() sau justifica cu "determinism-ok: <motiv>")`)
          violations++
        }
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} incalcari in ${filesChecked} fisiere din src/sim/.`)
  process.exit(1)
}

console.log(`disciplina sim/: curat (${filesChecked} fisiere)`)
