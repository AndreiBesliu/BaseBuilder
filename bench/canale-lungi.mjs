/**
 * Cele mai lungi texte de descompunere („42% aer de afară prin pereți (1 m piatră, ~16 °C) · …") pe componente REALE, pentru
 * bifa `latime-inspector` din bench/ui-fum.mjs (recenzia t.2b, E6): rândurile fixe ale inspectorului se măsoară pe ecran,
 * în sertarul real, cu textele pe care jocul chiar le scrie, nu cu unele inventate.
 *
 * Sursele: M10 după 1.680 de tickuri (84 de pași termici), casele fixturilor termice (cu etaj, cu gol, două case, casa în L,
 * casa simplă — câte 1.680 de tickuri) și mina de 192×192×3. Întoarce primele `n` texte DISTINCTE, de la cel mai lung (la
 * lungime egală, în ordinea textului): o funcție pură de cod — aceleași module, aceleași texte, fără zar și fără ceas.
 *
 * NU e o fixtură comisă: ui-fum o cheamă la fiecare rulare (procesul principal Electron importă `.ts`, ca Node), deci
 * textele sunt mereu ale codului de acum — o schimbare în `textCanale` sau în geometria canalelor nu lasă bifa să măsoare
 * texte vechi. Durata: ~2,4 s (10.10.2026, două rulări, aceleași 40 de texte). Pentru o privire:
 *
 *   node bench/canale-lungi.mjs          cele 40 de texte, cu lungimea și sursa
 */
import { fileURLToPath } from 'node:url'
import { canaleAcum } from '../src/sim/temperatura.ts'
import { geometriaCanalelor } from '../src/sim/termic.ts'
import { textCanale } from '../viewer/ui/texte.ts'
import { createWorld, tick } from '../src/sim/world.ts'
import { applyCommand } from '../src/sim/commands.ts'
import { buildM10PeLume } from '../src/harness/fixture-m10.ts'
import { casaTermica } from '../tests/fixturi-temperatura.ts'
import { mina192 } from '../tests/fixturi-pas.ts'
import { R } from '../tests/fixturi.ts'

const TICKURI = 1680

/** Cele `n` texte de descompunere distincte cele mai lungi, cu sursa fiecaruia; `componente` = cate texte s-au scris in total. */
export function canaleLungi(n = 40) {
  const toate = []
  const colecteaza = (nume, w) => {
    for (const c of w.camere.comp.values()) {
      const g = geometriaCanalelor(w.camere, R, c.id)
      if (!g.ok) continue
      const k = canaleAcum(w, R, g.value)
      if (k.ok) toate.push({ sursa: `${nume}#${c.id}`, text: textCanale(k.value) })
    }
  }
  const w = createWorld(20260913)
  applyCommand(w, { kind: 'setFocus', cx: 300, cy: 300 })
  buildM10PeLume(w, R, 300, 300)
  for (let i = 0; i < TICKURI; i++) tick(w, R)
  colecteaza('M10', w)
  for (const o of [{ etaj: true, k: 1 }, { gol: true, k: 1 }, { k: 2, faraCasa: true }, { L: 7 }, {}]) {
    const s = casaTermica(o)
    for (let i = 0; i < TICKURI; i++) tick(s.w, R)
    colecteaza('casa' + JSON.stringify(o), s.w)
  }
  colecteaza('mina', mina192(R))
  toate.sort((a, b) => b.text.length - a.text.length || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
  const unice = []
  const vazute = new Set()
  for (const t of toate) {
    if (vazute.has(t.text)) continue
    vazute.add(t.text)
    unice.push(t)
  }
  return { componente: toate.length, texte: unice.slice(0, n) }
}

if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  const t0 = performance.now()
  const { componente, texte } = canaleLungi()
  for (const t of texte) console.log(`${String(t.text.length).padStart(4)}  ${t.sursa.padEnd(28)} ${t.text}`)
  console.log(`${componente} componente; cele ${texte.length} de texte distincte cele mai lungi: ${texte[0].text.length}…${texte[texte.length - 1].text.length} caractere (${Math.round(performance.now() - t0)} ms)`)
}
