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
 * NU se ruleaza in CI si NU face parte din `npm run check`: modifica fisiere
 * sursa, si toate suitele impreuna trec de o jumatate de ora.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
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

/** Numele testelor PICATE dintr-un fisier de teste. */
export function testePicate(fisierDeTest) {
  let out = ''
  try {
    out = execSync(`node --test ${fisierDeTest}`, { cwd: REPO, encoding: 'utf8', stdio: 'pipe', timeout: 900000 })
  } catch (e) {
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`
  }
  const re = new RegExp(`^${X} (.+?) \\(\\d`, 'gm')
  return new Set([...out.matchAll(re)].map((x) => x[1]))
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
function potrivit(continut, tipar) {
  return continut.includes('\r\n') ? tipar.replace(/\n/g, '\r\n') : tipar
}

export function aplica(f, a, b) {
  const cale = resolve(REPO, f)
  const orig = readFileSync(cale, 'utf8')
  const aa = potrivit(orig, a)
  const bb = potrivit(orig, b)
  if (!orig.includes(aa)) return false
  writeFileSync(cale, orig.replace(aa, bb), 'utf8')
  return readFileSync(cale, 'utf8') !== orig
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
      if (!aplica(e.f, e.a, e.b)) {
        ok = false
        console.log(`  ?? ${m.n}: TIPAR LIPSA in ${e.f} — control invalid`)
        invalide.push(m.n)
        break
      }
      aplicate.push(e)
    }
    if (!ok) {
      restaureaza(aplicate)
      continue
    }

    const picate = testePicate(m.t)
    for (const p of baza.get(m.t) ?? []) picate.delete(p)
    const picat = [...picate].some((p) => p.startsWith(m.e))
    const curat = restaureaza(aplicate)

    valide++
    if (picat) prinse++
    else ratate.push(m.n)
    const altele = [...picate].filter((p) => !p.startsWith(m.e)).map((p) => p.slice(0, 36))
    const detalii = `${picate.size} teste picate${altele.length ? '; si: ' + altele.join(' | ') : ''}; restaurat: ${curat ? 'da' : 'NU'}`
    console.log(`  ${picat ? 'PRINSA' : '!! RATATA'}  ${m.n}  [${detalii}]`)
  }

  return { nume, prinse, valide, ratate, invalide, alese: alese.length }
}
