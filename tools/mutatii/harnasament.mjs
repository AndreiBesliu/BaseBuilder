/**
 * Harnasamentul de testare prin MUTATIE.
 *
 * Metoda, pe scurt: strica intentionat o singura garantie din cod, ruleaza
 * testele, si verifica daca a picat CHIAR testul scris pentru ea. Un test care
 * ramane verde cand garantia lui dispare nu probeaza nimic — si asta nu se vede
 * altfel. In proiectul asta a prins, pana acum: doua fixturi devenite vide fara
 * ca ceva sa se inroseasca, o bucla infinita, doua mecanisme redundante, si un
 * plafon care nu lega.
 *
 * ## Trei lucruri pe care harnasamentul le face pentru ca s-au STRICAT o data
 *
 * 1. **Restaurarea e `git checkout --`, nu o rescriere proprie.** Tiparul
 *    „capturez octetii la pornire, ii scriu inapoi la final, apoi verific" a
 *    esuat de trei ori intr-o singura sesiune, si de fiecare data oracolul lui a
 *    raportat curat: compara cu ce a capturat EL, deci o restaurare ratata si o
 *    captura gresita arata la fel. Un script nu se poate verifica singur.
 *
 * 2. **Refuza sa porneasca daca arborele e murdar.** Restaurarea arunca orice
 *    modificare necomisa a fisierelor atinse. Ordinea e: commit, mutatii,
 *    reparatii, commit.
 *
 * 3. **Tiparele se adapteaza la terminatorul FISIERULUI.** Cu
 *    `core.autocrlf=true`, orice fisier atins de git are CRLF, iar un tipar
 *    scris cu `\n` nu se mai potriveste. `TIPAR LIPSA` se raporteaza ca ESEC,
 *    nu se inghite: un tipar invechit trece drept „prinsa" si minte.
 *
 * NU face parte din `npm run check`: modifica fisiere sursa, iar `check` se
 * ruleaza tocmai cu modificari necomise in arbore. Ruleaza in CI, in jobul
 * `mutatii`, la fiecare push.
 *
 * ## Fiecare proba ruleaza DOAR testul numit
 *
 * Verdictul e „a picat testul scris pentru garda?", deci restul fisierului nu intra
 * in el. Pana la 25.09 se rula fisierul intreg la fiecare proba, si costul crestea
 * cu produsul (probe × durata fisierului), nu cu munca: `saveload.test.ts` dura 39 s
 * si il re-rulau 11 probe (~7 min, 42% din suita), iar pe runner jobul ajunsese la
 * 23 min 34 s. Cand testul numit NU pica, se ruleaza fisierul intreg si el decide —
 * exact verdictul de dinainte, plus lista „si:" care a pus diagnosticul la mai
 * multe probe ratate (ce ALTE teste au picat).
 *
 * Ce nu mai acopera: un test care pica SINGUR pe cod curat (dependenta de ordine
 * intre testele unui fisier) ar da un PRINSA fals. Controlul e
 * `ruleaza.mjs --izolare`, care ruleaza fiecare test numit singur, pe cod nemutat.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync, spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * Radacina repo-ului, DEDUSA din locul fisierului asta (tools/mutatii/ → doua
 * niveluri in sus). Nu scrisa absolut: o cale de pe masina mea intr-un repo
 * public e o garantie ca nu merge la nimeni altcineva.
 */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

/** Semnul cu care `node --test` marcheaza un test picat. */
const X = '✖'

/**
 * Un nume de test ca PREFIX literal, pentru `--test-name-pattern` (care e o expresie
 * regulata). Numele din suite au paranteze, puncte, `?`, `+`, `/` si `|`: nescapat,
 * „De ce nu? deosebeste" nu se mai potriveste cu el insusi.
 */
export function tiparDeNume(prefix) {
  const literal = prefix.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return '^' + literal
}

/**
 * Ruleaza un fisier de teste — tot, sau doar testele al caror nume incepe cu
 * `prefix` — si intoarce numele celor PICATE si cate teste NUMITE au rulat.
 *
 * Fara shell (`spawnSync` pe `process.execPath`): numele au ghilimele romanesti,
 * backtick-uri si `|`, pe care `cmd.exe` le-ar citi ca sintaxa.
 *
 * `rulate` se numara pe rezultatele al caror nume incepe cu prefixul, NU din
 * `ℹ tests`: cand filtrul nu prinde niciun test, `node --test` raporteaza
 * `tests 1` — fisierul insusi, ca test (masurat pe Node 26). Un harnasament care
 * ar fi numarat de acolo ar fi crezut ca a rulat testul si ar fi dat RATATA pe
 * fiecare proba, adica exact semnalul care trimite dupa un test inexistent.
 * Filtrul care nu prinde nimic e o EROARE a harnasamentului, nu un verdict.
 */
export function ruleazaTeste(fisierDeTest, prefix) {
  // Reporterul `spec` cerut EXPLICIT, si mediul fara `NODE_TEST_CONTEXT`: pornit din
  // interiorul unui test (proba negativa din `tests/mutatii.test.ts`), un `node --test`
  // mosteneste variabila si isi trimite rezultatele serializate catre parinte, nu ca
  // text — iar harnasamentul n-ar mai vedea niciun `✔`.
  const args = ['--test', '--test-reporter=spec', ...(prefix === undefined ? [] : ['--test-name-pattern', tiparDeNume(prefix)]), fisierDeTest]
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const r = spawnSync(process.execPath, args, { cwd: REPO, encoding: 'utf8', timeout: 900000, env })
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const rezultate = [...out.matchAll(/^([✔✖]) (.+?) \(\d/gm)]
  const picate = new Set(rezultate.filter((x) => x[1] === X).map((x) => x[2]))
  const toate = rezultate.length
  if (prefix === undefined) return { picate, rulate: toate, toate, eroare: null }
  const rulate = new Set(rezultate.map((x) => x[2]).filter((n) => n.startsWith(prefix))).size
  return { picate, rulate, toate, eroare: rulate < 1 ? `filtrul de nume nu prinde niciun test din ${fisierDeTest}` : null }
}

/** Numele testelor PICATE dintr-un fisier de teste, rulat intreg. */
export function testePicate(fisierDeTest) {
  return ruleazaTeste(fisierDeTest).picate
}

/**
 * Scrie o mutatie. Intoarce `false` daca tiparul nu s-a potrivit — adica un
 * control INVALID, nu o mutatie trecuta.
 */
/**
 * Tiparul, adaptat la terminatorul de rand al FISIERULUI.
 *
 * Cu `core.autocrlf=true`, orice fisier atins de git are CRLF, iar un tipar scris
 * cu `\n` nu se mai potriveste. A saptea oara cand asta muscă.
 */
export function potrivit(continut, tipar) {
  return continut.includes('\r\n') ? tipar.replace(/\n/g, '\r\n') : tipar
}

/**
 * Aplica o editare. Intoarce `ok`, sau motivul pentru care controlul e INVALID.
 *
 * ## De ce se numara aparitiile, nu doar se cauta una
 *
 * `String.replace` cu tipar-sir inlocuieste PRIMA aparitie. Un tipar care se
 * potriveste in doua locuri editeaza deci alt loc decat cel gandit, apoi ruleaza
 * testele locului gandit — si iese `RATATA`. Adica exact semnalul care spune
 * „garda asta nu e probata" cand adevarul e „instrumentul a editat altundeva".
 * Mai rau decat o ratare oarecare: te trimite sa scrii un test pentru o garda
 * care era deja probata.
 *
 * Masurat: pasul 6b al taieturii 2 a dublat trei forme de cod in `joburi.ts`
 * (`refaTinta` in doua drivere, retragerea celulelor de zona la sapat si la
 * zidit, `terminaJob` + `stergeDesemnare`). Doua probe de CARAT, verzi de la
 * taietura 2, au inceput sa mute codul de construit — si au ramas verzi, fiindca
 * nimeni nu le mai masura tinta. A treia a iesit `RATATA` si m-a trimis dupa un
 * test care exista deja.
 *
 * Un tipar ambiguu nu se „rezolva" alegand a doua aparitie: care dintre ele e cea
 * gandita e o intrebare la care doar autorul probei poate raspunde. Deci se
 * refuza, ca `TIPAR LIPSA`.
 */
export function aplica(f, a, b) {
  const cale = resolve(REPO, f)
  const orig = readFileSync(cale, 'utf8')
  const aa = potrivit(orig, a)
  const bb = potrivit(orig, b)
  const aparitii = orig.split(aa).length - 1
  if (aparitii === 0) return 'lipsa'
  if (aparitii > 1) return `ambiguu:${aparitii}`
  const dupa = orig.replace(aa, bb)
  // O editare care nu schimba nimic e tot un control invalid: testele ruleaza pe
  // cod NEMUTAT, si orice ar spune ele nu e despre garda.
  if (dupa === orig) return 'nula'
  writeFileSync(cale, dupa, 'utf8')
  return 'ok'
}

/**
 * Restaureaza fisierele prin git si spune daca au ramas curate.
 *
 * ## De ce se verifica cu `git status`, nu cu `git diff`, si de ce se reincearca
 *
 * De DOUA ori intr-o sesiune, suita a raportat `restaurat: da` pe toate probele
 * si a lasat totusi o mutatie aplicata in arbore — o data in `zone.ts`, o data in
 * `joburi.ts`. A doua oara s-a si reprodus, si tot intermitent.
 *
 * Mecanismul: `git commit` porneste `git gc --auto` in FUNDAL, iar aia tine
 * lock-ul pe repo o vreme dupa ce comanda mea a iesit. Un `git checkout --` care
 * cade peste el poate sa nu faca nimic. Verificarea de dupa nu prindea asta,
 * fiindca `git diff --quiet -- <fisier>` compara arborele de lucru cu INDEXUL, nu
 * cu HEAD — iar cursa putea lasa indexul intr-o stare in care diferenta nu se
 * vede. `git status --porcelain` compara cu HEAD si include si ce e staged.
 *
 * Si se REINCEARCA o data: daca a fost o cursa, a doua incercare o castiga.
 *
 * Un instrument care se raporteaza singur ca reusit cand n-a reusit e mai rau
 * decat niciun instrument — vezi si nota despre oracolul propriu din antetul
 * fisierului. Asta e a doua fata a aceleiasi lectii.
 */
function restaureaza(editari) {
  const fisiere = [...new Set(editari.map((e) => e.f))]
  for (const incercare of [1, 2, 3]) {
    for (const f of fisiere) {
      try {
        // `HEAD --`, nu doar `--`: al doilea copiaza din INDEX, iar indexul e
        // exact ce poate fi stricat de cursa descrisa mai sus.
        execSync(`git checkout HEAD -- ${f}`, { cwd: REPO, stdio: 'pipe' })
      } catch {
        // Se reincearca; daca si a treia pica, se striga.
      }
    }
    // VERIFICAREA E PE CONTINUT: fiecare tipar cautat trebuie sa fie iar acolo.
    // Nu se intreaba git — el e chiar partea care poate minti.
    const rele = editari.filter((e) => {
      const continut = readFileSync(resolve(REPO, e.f), 'utf8')
      return !continut.includes(potrivit(continut, e.a))
    })
    if (rele.length === 0) return true
    if (incercare === 3) {
      console.log(`  !! RESTAURARE ESUATA dupa trei incercari: ${[...new Set(rele.map((e) => e.f))].join(', ')}`)
      return false
    }
  }
  return false
}

/**
 * Ce e MODIFICAT si necomis, daca e ceva. Prima mutatie ar arunca tot.
 *
 * Fisierele NEURMARITE (`??`) nu se numara: `git checkout -- <fisier>` nu le
 * atinge niciodata, deci n-au ce pierde. Refuzul pe ele ar fi blocat rularea
 * pentru o ciorna lasata alaturi, fara sa apere nimic.
 */
export function arboreCurat() {
  const out = execSync('git status --porcelain', { cwd: REPO, encoding: 'utf8' })
  const linii = out.split(/\r?\n/).filter((l) => l.trim() !== '' && !l.startsWith('??'))
  return linii.join(String.fromCharCode(10))
}

/**
 * Ruleaza o suita. `baza` e o hartă fisierDeTest → testele care picau DEJA,
 * ca sa nu se puna in seama mutatiei un test rosu dinainte.
 */
/** Numele omenesc al motivului pentru care un control e invalid. */
function ETICHETA(stare) {
  if (stare === 'lipsa') return 'TIPAR LIPSA'
  if (stare === 'nula') return 'MUTATIE NULA (editarea nu schimba nimic)'
  const n = stare.split(':')[1]
  return `TIPAR AMBIGUU (se potriveste in ${n} locuri — ar edita altul decat cel gandit)`
}

export function ruleazaSuita(nume, mutatii, baza, filtru) {
  const alese = filtru ? mutatii.filter((m) => filtru.some((d) => m.n.includes(d))) : mutatii
  let prinse = 0
  let valide = 0
  const ratate = []
  const invalide = []

  for (const m of alese) {
    const editari = [{ f: m.f, a: m.a, b: m.b }, ...(m.e2 ?? [])]
    let ok = true
    // Se retin doar editarile care CHIAR s-au aplicat: restaurarea se verifica pe
    // continut, cerand tiparul `a` inapoi, iar un tipar care n-a fost gasit
    // niciodata n-are cum sa reapara. Fara distinctia asta, un TIPAR LIPSA
    // producea si un fals „RESTAURARE ESUATA" — instrumentul se acuza singur de
    // ceva ce nu facuse.
    const aplicate = []
    for (const e of editari) {
      const stare = aplica(e.f, e.a, e.b)
      if (stare !== 'ok') {
        ok = false
        console.log(`  ?? ${m.n}: ${ETICHETA(stare)} in ${e.f} — control invalid`)
        invalide.push(m.n)
        break
      }
      aplicate.push(e)
    }
    if (!ok) {
      restaureaza(aplicate)
      continue
    }

    // Intai DOAR testul numit (vezi antetul). Un filtru care nu prinde niciun test e
    // o eroare a harnasamentului — control invalid, nu RATATA.
    const singur = ruleazaTeste(m.t, m.e)
    if (singur.eroare !== null) {
      const curat = restaureaza(aplicate)
      console.log(`  ?? ${m.n}: ${singur.eroare} — control invalid; restaurat: ${curat ? 'da' : 'NU'}`)
      invalide.push(m.n)
      continue
    }
    let picate = singur.picate
    for (const p of baza.get(m.t) ?? []) picate.delete(p)
    let picat = [...picate].some((p) => p.startsWith(m.e))
    let unde = 'testul numit'
    if (!picat) {
      // RATATA pe testul singur: fisierul intreg decide, ca inainte — si arata ce
      // ALTE teste au picat, lista care a pus diagnosticul la mai multe ratari.
      picate = testePicate(m.t)
      for (const p of baza.get(m.t) ?? []) picate.delete(p)
      picat = [...picate].some((p) => p.startsWith(m.e))
      unde = 'fisierul intreg'
      // Picat in fisier, dar nu singur: testul depinde de ce ruleaza INAINTEA lui.
      // Verdictul e al fisierului (ca inainte), dar se striga.
      if (picat) console.log(`  !! DEPENDENTA DE ORDINE: „${m.e.slice(0, 50)}" pica in \`${m.t}\` doar rulat cu celelalte`)
    }
    const curat = restaureaza(aplicate)

    valide++
    if (picat) prinse++
    else ratate.push(m.n)
    const altele = [...picate].filter((p) => !p.startsWith(m.e)).map((p) => p.slice(0, 36))
    const detalii = `${unde}: ${picate.size} teste picate${altele.length ? '; si: ' + altele.join(' | ') : ''}; restaurat: ${curat ? 'da' : 'NU'}`
    console.log(`  ${picat ? 'PRINSA' : '!! RATATA'}  ${m.n}  [${detalii}]`)
  }

  return { nume, prinse, valide, ratate, invalide, alese: alese.length }
}
