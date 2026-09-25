/**
 * Hash-ul de referinta al scenariului standard, verificat LOCAL, inainte de push.
 *
 * CI-ul are pasul „hash de referinta" de la S1-2. `npm run check` nu-l avea — deci
 * o schimbare de comportament in `src/sim/` trecea poarta locala verde si pica abia
 * pe runner. Pe 25.09.2026 exact asta s-a intamplat: reconcilierea la moartea
 * tintei a mutat hash-ul (6ff16b2a -> 79035d35) si nimeni n-a vazut pana la push,
 * fiindca in aceeasi rulare picase intai alt pas si l-a mascat pe asta.
 *
 * Adevarul e UNUL SINGUR: valoarea `EXPECTED=` din `.github/workflows/ci.yml`. Se
 * citeste de acolo, nu se copiaza aici — doua copii se desincronizeaza.
 *
 * Costa ~9 s (100.000 de tickuri, 40 de agenti). Daca hash-ul s-a schimbat
 * INTENTIONAT, se actualizeaza EXPECTED in ci.yml si se scrie in DEVLOG ce anume
 * l-a mutat — aceeasi regula ca in CI.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const yml = readFileSync('.github/workflows/ci.yml', 'utf8')
const m = yml.match(/EXPECTED=([0-9a-f]{8})/)
if (!m) {
  console.error('ci.yml: nu gasesc `EXPECTED=<hash>` in pasul „hash de referinta"')
  process.exit(2)
}
const asteptat = m[1]

const out = execFileSync(process.execPath, ['src/harness/cli.ts', '--seed', '12345', '--ticks', '100000', '--agents', '40'], {
  encoding: 'utf8',
})
const hash = out.match(/^hash\s+([0-9a-f]{8})/m)?.[1]
const vii = out.match(/^agenti vii\s+(\d+)/m)?.[1]
if (!hash) {
  console.error('CLI-ul nu a scos nicio linie `hash`:\n' + out)
  process.exit(2)
}

if (hash !== asteptat) {
  console.error(`hash-ul de referinta s-a schimbat: ${hash} (asteptat ${asteptat}, din ci.yml) · agenti vii ${vii}`)
  console.error('Daca schimbarea e intentionata, actualizeaza EXPECTED in .github/workflows/ci.yml')
  console.error('si scrie in DEVLOG ce anume a mutat-o. Altfel, e o regresie de determinism.')
  process.exit(1)
}
console.log(`hash de referinta ${hash} = ci.yml · agenti vii ${vii}`)
