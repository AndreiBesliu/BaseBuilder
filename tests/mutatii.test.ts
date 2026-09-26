/**
 * Verificatorul suitelor de mutatii — `tools/check-mutatii.mjs`.
 *
 * El raspunde la „proba asta ARE ce sa masoare?". Testul de aici raspunde la
 * „verificatorul poate spune NU?" — fiindca altfel n-as sti daca e verde pentru ca
 * suitele sunt curate sau pentru ca instrumentul e stricat.
 *
 * Merita spus ca prima lui versiune CHIAR era stricata: raporta 18 probe ca avand
 * campul `b` lipsa, cand de fapt `b: ""` e mutatia care STERGE linia.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RADACINA = join(dirname(fileURLToPath(import.meta.url)), '..')
const PROBA = join(RADACINA, 'tools', 'mutatii', '__proba_check.mjs')

function ruleaza(argument?: string): { status: number | null; iesire: string } {
  const r = spawnSync(process.execPath, ['tools/check-mutatii.mjs', ...(argument ? [argument] : [])], {
    cwd: RADACINA, encoding: 'utf8',
  })
  return { status: r.status, iesire: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

/** O proba VALIDA, pe cod si teste care chiar exista. Controlul pozitiv al fiecarui caz de mai jos. */
const VALIDA = [
  '{',
  "  n: 'proba de control',",
  "  f: 'src/harness/sdig.ts',",
  '  a: "export const SDIG_PAS = 1237",',
  '  b: "export const SDIG_PAS = 1234",',
  "  t: 'tests/sdig.test.ts', e: 'pozitiile acopera patratul EXACT o data',",
  '}',
].join('\n')

function cuProba(corp: string): { status: number | null; iesire: string } {
  writeFileSync(PROBA, `export const MUTATII = [\n${corp}\n]\n`, 'utf8')
  return ruleaza(PROBA)
}

/** Forma lui `ruleazaTeste` din `tools/mutatii/harnasament.mjs` (JS, fara declaratii de tip). */
type Rulare = { picate: Set<string>; rulate: number; toate: number; eroare: string | null }

test('harnasamentul ruleaza DOAR testul numit, si refuza un filtru de nume care nu prinde nimic', async () => {
  // Din 25.09 fiecare proba ruleaza doar testul ei, nu tot fisierul: `saveload.test.ts`
  // dura 39 s si il re-rulau 11 probe. Doua lucruri pot strica modul asta fara ca vreo
  // proba sa se inroseasca — fiecare ar da RATATA pe tot, sau PRINSA pe nimic:
  //  - numele au `?`, paranteze, `+`, iar `--test-name-pattern` e o expresie regulata;
  //  - cand filtrul nu prinde niciun test, `node --test` raporteaza `tests 1`: fisierul
  //    insusi, ca test. Numarat de acolo, un filtru mort ar parea ca a rulat ceva.
  const cale = pathToFileURL(join(RADACINA, 'tools', 'mutatii', 'harnasament.mjs')).href
  const h = (await import(cale)) as { ruleazaTeste: (t: string, prefix?: string) => Rulare }
  const bun = h.ruleazaTeste('tests/constructie.test.ts', 'De ce nu? deosebeste')
  assert.equal(bun.eroare, null, `un nume cu \`?\` nu se potriveste cu propriul filtru: ${bun.eroare}`)
  assert.equal(bun.rulate, 1, 'exact un test incepe cu numele asta')
  assert.equal(bun.toate, 1, `au rulat ${bun.toate} teste: filtrul nu a filtrat`)
  assert.equal(bun.picate.size, 0, 'pe cod nemutat, testul numit trece')
  const mort = h.ruleazaTeste('tests/constructie.test.ts', 'un nume pe care nu-l poarta niciun test')
  assert.equal(mort.rulate, 0)
  assert.notEqual(mort.eroare, null, 'un filtru care nu prinde niciun test trebuie sa fie o EROARE, nu un verdict')
})

test('restaurarea se verifica fata de HEAD, nu doar dupa tipar: un fisier cu tiparul inapoi, dar schimbat in alta parte, NU e restaurat', async () => {
  // A treia oara (26.09.2026), suita a raportat „restaurat: da" si a lasat o mutatie in
  // arbore, pe alta linie decat tiparul verificat. Un depozit git temporar, ca verificarea sa
  // se poata proba fara sa atinga depozitul real.
  const repo = mkdtempSync(join(tmpdir(), 'kin-restaurare-'))
  try {
    const git = (c: string): void => { execSync(`git ${c}`, { cwd: repo, stdio: 'pipe' }) }
    git('init -q')
    git('config user.email proba@kinstead.local')
    git('config user.name proba')
    git('config core.autocrlf false')
    writeFileSync(join(repo, 'f.txt'), 'unu\ndoi\ntrei\n', 'utf8')
    git('add f.txt')
    git('commit -q -m baza')
    const cale = pathToFileURL(join(RADACINA, 'tools', 'mutatii', 'harnasament.mjs')).href
    type Editare = { f: string; a: string; b: string }
    const h = (await import(cale)) as {
      restaurat: (e: Editare, repo: string) => boolean
      restaureaza: (e: Editare[], repo: string) => boolean
      laFelCaHead: (f: string, repo: string) => boolean
    }
    const e: Editare = { f: 'f.txt', a: 'doi', b: 'DOI' }
    assert.equal(h.restaurat(e, repo), true, 'fisierul identic cu HEAD trebuie sa fie restaurat')
    writeFileSync(join(repo, 'f.txt'), 'unu\ndoi\nTREI\n', 'utf8')
    assert.equal(h.restaurat(e, repo), false, 'tiparul e la loc, dar alta linie e mutata: NU e restaurat')
    assert.equal(h.laFelCaHead('f.txt', repo), false)
    writeFileSync(join(repo, 'f.txt'), 'unu\r\ndoi\r\ntrei\r\n', 'utf8')
    assert.equal(h.restaurat(e, repo), true, 'doar terminatorii de linie difera: e acelasi continut')
    writeFileSync(join(repo, 'f.txt'), 'unu\nDOI\ntrei\n', 'utf8')
    assert.equal(h.restaureaza([e], repo), true, 'restaurarea prin git reface fisierul')
    assert.equal(h.laFelCaHead('f.txt', repo), true)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('suitele de mutatii sunt intregi', () => {
  const r = ruleaza()
  assert.equal(r.status, 0, `verificatorul a gasit probleme:\n${r.iesire}`)
})


/** Aceeasi proba, dar cu o editare SUPLIMENTARA — forma pe care 6 probe reale o folosesc. */
const VALIDA_CU_E2 = [
  '{',
  "  n: 'proba de control cu editare secundara',",
  "  f: 'src/harness/sdig.ts',",
  '  a: "export const SDIG_PAS = 1237",',
  '  b: "export const SDIG_PAS = 1234",',
  '  e2: [{ f: "src/harness/sdig.ts", a: "export const SDIG_MAX_INCERCARI = 16", b: "export const SDIG_MAX_INCERCARI = 8" }],',
  "  t: 'tests/sdig.test.ts', e: 'pozitiile acopera patratul EXACT o data',",
  '}',
].join('\n')

test('verificatorul chiar spune NU — probele negative', () => {
  try {
    // Controlul POZITIV, intai: fara el, toate asertiunile de mai jos ar fi
    // satisfacute si de un verificator care iese rosu la orice.
    for (const [ce, corp] of [['fara e2', VALIDA], ['cu e2', VALIDA_CU_E2]] as const) {
      const bun = cuProba(corp)
      assert.equal(bun.status, 0, `o proba valida (${ce}) e respinsa:\n${bun.iesire}`)
    }

    // Fiecare caz isi cere MESAJUL, nu doar codul de iesire. Codul 1 il da si o
    // exceptie neprinsa, deci o asertiune pe el singur nu deosebeste „garda a
    // vorbit" de „verificatorul a crapat" — iar atunci garzile pot fi sterse ca
    // redundante fara ca nimic sa se inroseasca.
    const rele: Array<[string, string, string]> = [
      ['`e` invechit — testul a fost redenumit',
        VALIDA.replace("e: 'pozitiile acopera patratul EXACT o data'", "e: 'un test cu numele asta nu exista'"),
        'nu incepe cu'],
      ['TIPAR LIPSA — codul de sub proba s-a mutat',
        VALIDA.replace('a: "export const SDIG_PAS = 1237"', 'a: "TIPARUL ASTA NU EXISTA NICAIERI"'),
        'TIPAR LIPSA'],
      ['TIPAR AMBIGUU — `replace` ar edita alta aparitie',
        VALIDA.replace('a: "export const SDIG_PAS = 1237"', 'a: "export const "'),
        'TIPAR AMBIGUU'],
      ['mutatia nu schimba nimic (`a` === `b`)',
        VALIDA.replace('b: "export const SDIG_PAS = 1234"', 'b: "export const SDIG_PAS = 1237"'),
        'sunt identice'],
      ['fisierul tintit nu exista',
        VALIDA.replace("f: 'src/harness/sdig.ts'", "f: 'src/nu/exista.ts'"),
        'fisierul `src/nu/exista.ts` nu exista'],
      ['fisierul de test nu exista',
        VALIDA.replace("t: 'tests/sdig.test.ts'", "t: 'tests/nu-exista.test.ts'"),
        'fisierul de test `tests/nu-exista.test.ts` nu exista'],
      ['camp lipsa',
        VALIDA.replace("  n: 'proba de control',", ''),
        'lipseste sau nu e un sir'],
      // `e2` — editarile suplimentare. Prima versiune a verificatorului le ignora cu
      // totul: 6 tipare din suitele reale erau invizibile pentru poarta scrisa anume
      // ca sa prinda tipare invechite.
      ['TIPAR LIPSA intr-o editare SECUNDARA',
        VALIDA_CU_E2.replace('a: "export const SDIG_MAX_INCERCARI = 16"', 'a: "TIPARUL SECUNDAR NU EXISTA"'),
        '[e2[0]]'],
      ['editare secundara fara campuri',
        VALIDA_CU_E2.replace('f: "src/harness/sdig.ts", a: "export const SDIG_MAX_INCERCARI = 16"', 'a: "export const SDIG_MAX_INCERCARI = 16"'),
        'n-are f, a si b'],
      ['`e2` nu e un tablou',
        VALIDA_CU_E2.replace(/e2: \[.*\],/, 'e2: 3,'),
        'nu e un tablou'],
    ]
    for (const [ce, corp, asteptat] of rele) {
      const r = cuProba(corp)
      assert.equal(r.status, 1, `verificatorul NU a prins: ${ce}\n${r.iesire}`)
      assert.ok(r.iesire.includes(asteptat),
        `${ce}: a iesit rosu, dar nu din cauza garzii — lipseste „${asteptat}" din:\n${r.iesire}`)
    }

    // Si esecul care a costat o rulare intreaga: o suita care nu PARSEAZA. `npm run
    // check` nu incarca fisierele de mutatii, deci ramanea verde, iar rularea de 50
    // de minute murea in prima secunda cu SyntaxError.
    writeFileSync(PROBA, 'export const MUTATII = [ { n: "ghilimele „inchise" gresit" } ]\n', 'utf8')
    const stricat = ruleaza(PROBA)
    assert.equal(stricat.status, 1, `o suita care nu parseaza trece:\n${stricat.iesire}`)
    assert.ok(stricat.iesire.includes('nu se poate incarca'),
      `a iesit rosu, dar nu din cauza garzii de incarcare:\n${stricat.iesire}`)
  } finally {
    rmSync(PROBA, { force: true })
  }
})
