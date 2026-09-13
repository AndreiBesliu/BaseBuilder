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
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const SIM_DIR = join(ROOT, 'src', 'sim')

/** Interdictii dure: nu exista motiv bun intr-un nucleu de simulare. */
const FORBIDDEN = [
  { re: /\bDate\.now\s*\(/, msg: 'Date.now() — timpul e w.tick, nu ceasul masinii' },
  { re: /\bnew\s+Date\s*\(/, msg: 'new Date() — timpul e w.tick, nu ceasul masinii' },
  { re: /\bperformance\.now\s*\(/, msg: 'performance.now() — masoara in harness, nu in sim' },
  { re: /\bMath\.random\s*\(/, msg: 'Math.random() — aleatorul vine din fluxuri numite (rng.ts)' },
  { re: /\basync\s/, msg: 'async — simularea e sincrona, pas cu pas' },
  { re: /\bawait\s/, msg: 'await — simularea e sincrona, pas cu pas' },
  { re: /\bnew\s+Promise\b/, msg: 'Promise — simularea e sincrona, pas cu pas' },
  { re: /\bsetTimeout\s*\(|\bsetInterval\s*\(/, msg: 'timer — simularea nu asteapta ceasul' },
  { re: /\bprocess\.(env|argv|hrtime)\b/, msg: 'process.* — nucleul nu citeste mediul' },
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
 * Scoate comentariile, inclusiv blocurile care se intind pe mai multe linii.
 *
 * Fara pasul asta, checker-ul isi raporteaza propria documentatie: docblocul care
 * ENUMERA tiparele interzise contine chiar tiparele interzise. Prima versiune a
 * cazut exact asa — instrumentul, nu codul, era gresit.
 */
function stripCommentLines(lines) {
  let inBlock = false
  return lines.map((line) => {
    let out = ''
    let i = 0
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i)
        if (end === -1) return out
        inBlock = false
        i = end + 2
        continue
      }
      const lineComment = line.indexOf('//', i)
      const blockStart = line.indexOf('/*', i)
      if (lineComment !== -1 && (blockStart === -1 || lineComment < blockStart)) {
        return out + line.slice(i, lineComment)
      }
      if (blockStart !== -1) {
        out += line.slice(i, blockStart)
        inBlock = true
        i = blockStart + 2
        continue
      }
      return out + line.slice(i)
    }
    return out
  })
}

let violations = 0
let filesChecked = 0

for (const file of walk(SIM_DIR)) {
  filesChecked++
  const rel = relative(ROOT, file).replace(/\\/g, '/')
  const lines = readFileSync(file, 'utf8').split(/\r?\n/)
  const stripped = stripCommentLines(lines)

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
