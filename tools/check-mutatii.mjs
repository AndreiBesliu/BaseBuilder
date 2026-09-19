/**
 * Verifica suitele de mutatii FARA sa le ruleze.
 *
 * Exista fiindca doua feluri de stricaciune nu se vedeau decat dupa ~50 de minute,
 * si amandoua s-au intamplat in aceeasi zi:
 *
 * 1. **O suita care nu parseaza.** Un nume de proba continea ghilimele romanesti
 *    inchise intr-un sir cu ghilimele drepte, deci sirul se termina la mijlocul
 *    frazei. `npm run check` a ramas verde — el nu incarca deloc fisierele de
 *    mutatii — iar rularea completa a murit in prima secunda cu SyntaxError.
 *
 * 2. **Un `e` invechit.** Testul pe care proba il astepta fusese redenumit. Mutatia
 *    era prinsa, de testul nou, dar verdictul iesea „RATATA" — adica te trimite sa
 *    scrii un test pentru o garda deja probata.
 *
 * La astea doua se adauga `TIPAR LIPSA` si `TIPAR AMBIGUU`, pe care harnasamentul
 * le raporta corect, dar tot dupa o rulare intreaga. Toate se pot afla din citirea
 * fisierelor, deci se afla acum, in `npm run check`.
 *
 * Ce NU face: nu ruleaza niciun test si nu atinge niciun fisier. Raspunde doar la
 * „proba asta ARE ce sa masoare?", nu la „masoara?" — aia ramane treaba mutatiilor.
 *
 *   node tools/check-mutatii.mjs              registrul intreg
 *   node tools/check-mutatii.mjs <fisier>     doar suita asta (pentru probele negative)
 */

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { potrivit } from './mutatii/harnasament.mjs'

const RADACINA = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Numele testelor dintr-un fisier, si cate declaratii `test(` are — ca sa se vada daca extractorul a ratat vreuna. */
function numeleTestelor(sursa) {
  const nume = []
  let declaratii = 0
  for (const linie of sursa.split(/\r?\n/)) {
    if (!linie.startsWith('test(')) continue
    declaratii++
    const q = linie[5]
    if (q !== "'" && q !== '"' && q !== '`') continue
    let out = ''
    let i = 6
    for (; i < linie.length; i++) {
      const ch = linie[i]
      if (ch === '\\') { i++; out += linie[i] ?? ''; continue }
      if (ch === q) break
      out += ch
    }
    if (i < linie.length) nume.push(out)
  }
  return { nume, declaratii }
}

const erori = []
const cache = new Map()

function fisier(rel) {
  if (!cache.has(rel)) {
    const cale = join(RADACINA, rel)
    cache.set(rel, existsSync(cale) ? readFileSync(cale, 'utf8') : null)
  }
  return cache.get(rel)
}

function verificaSuita(nume, M) {
  if (!Array.isArray(M)) { erori.push(`${nume}: nu exporta un tablou de mutatii`); return }
  if (M.length === 0) erori.push(`${nume}: suita e goala`)
  M.forEach((m, i) => {
    const unde = `${nume}[${i}] ${typeof m?.n === 'string' ? `„${m.n.slice(0, 50)}"` : '(fara nume)'}`
    for (const camp of ['n', 'f', 'a', 't', 'e']) {
      if (typeof m?.[camp] !== 'string' || m[camp] === '') {
        erori.push(`${unde}: campul \`${camp}\` lipseste sau nu e un sir`)
        return
      }
    }
    // `b` are voie sa fie sirul GOL: aia e mutatia care STERGE linia, si sunt 18
    // in suite. Prima varianta a verificatorului le-a raportat pe toate ca lipsa —
    // instrumentul gresea, nu datele.
    if (typeof m.b !== 'string') { erori.push(`${unde}: campul \`b\` nu e un sir`); return }
    // Editarea principala SI cele suplimentare. `e2` era ignorat cu totul de prima
    // versiune: 6 tipare din suite erau invizibile pentru poarta scrisa anume ca sa
    // prinda tipare invechite. Exact esecul pe care verificatorul il muta in
    // `npm run check`, lasat sa treaca prin el.
    const editari = [{ f: m.f, a: m.a, b: m.b, unde: '' }]
    if (m.e2 !== undefined) {
      if (!Array.isArray(m.e2)) { erori.push(`${unde}: \`e2\` exista dar nu e un tablou`); return }
      for (let k = 0; k < m.e2.length; k++) {
        const e = m.e2[k]
        if (typeof e?.f !== 'string' || typeof e?.a !== 'string' || typeof e?.b !== 'string') {
          erori.push(`${unde}: \`e2[${k}]\` n-are f, a si b ca siruri`)
          continue
        }
        editari.push({ f: e.f, a: e.a, b: e.b, unde: ` [e2[${k}]]` })
      }
    }

    for (const e of editari) {
      const loc = `${unde}${e.unde}`
      if (e.a === e.b) erori.push(`${loc}: \`a\` si \`b\` sunt identice — mutatia nu schimba nimic`)
      const sursa = fisier(e.f)
      if (sursa === null) { erori.push(`${loc}: fisierul \`${e.f}\` nu exista`); continue }
      const tipar = potrivit(sursa, e.a)
      const cate = sursa.split(tipar).length - 1
      if (cate === 0) erori.push(`${loc}: TIPAR LIPSA in \`${e.f}\` — codul de sub proba s-a mutat`)
      if (cate > 1) erori.push(`${loc}: TIPAR AMBIGUU in \`${e.f}\` (${cate} potriviri) — \`replace\` ia PRIMA`)
    }

    const testul = fisier(m.t)
    if (testul === null) { erori.push(`${unde}: fisierul de test \`${m.t}\` nu exista`); return }
    const { nume: teste, declaratii } = numeleTestelor(testul)
    if (declaratii === 0) {
      erori.push(`${unde}: \`${m.t}\` n-are niciun \`test(\` la inceput de linie — extractorul nu poate raspunde`)
      return
    }
    if (teste.length !== declaratii) {
      erori.push(`${unde}: in \`${m.t}\` s-au extras ${teste.length} nume din ${declaratii} declaratii — extractorul e stricat, nu proba`)
      return
    }
    if (!teste.some((x) => x.startsWith(m.e))) {
      erori.push(`${unde}: niciun test din \`${m.t}\` nu incepe cu „${m.e}" — verdictul ar iesi RATATA pe cod corect`)
    }
  })
}

const arg = process.argv[2]
let total = 0
try {
  if (arg) {
    const mod = await import(pathToFileURL(resolve(arg)).href)
    verificaSuita(arg, mod.MUTATII)
    total = Array.isArray(mod.MUTATII) ? mod.MUTATII.length : 0
  } else {
    const { SUITE } = await import('./mutatii/suite.mjs')
    const vazute = new Map()
    for (const s of SUITE) {
      verificaSuita(s.nume, s.M)
      total += Array.isArray(s.M) ? s.M.length : 0
      for (const m of s.M ?? []) {
        if (typeof m?.n !== 'string') continue
        if (vazute.has(m.n)) erori.push(`numele „${m.n.slice(0, 50)}" apare si in ${vazute.get(m.n)}, si in ${s.nume}`)
        else vazute.set(m.n, s.nume)
      }
    }
  }
} catch (e) {
  // Aici ajunge si suita care nu parseaza: un SyntaxError la `import` e exact
  // esecul numarul 1 de mai sus, si acum iese in `npm run check`, nu dupa 50 de minute.
  console.error(`mutatii: o suita nu se poate incarca — ${e.message}`)
  process.exit(1)
}

if (erori.length) {
  for (const e of erori) console.error(`  ${e}`)
  console.error(`\nmutatii: ${erori.length} probleme in ${total} probe.`)
  process.exit(1)
}
console.log(`mutatii: ${total} probe, tiparele si numele de teste corespund codului.`)
