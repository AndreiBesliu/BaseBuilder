/**
 * Timp PROPRIU per functie, dintr-un profil `node --cpu-prof`.
 *
 * Raspunde la „unde se arde CPU-ul", si e prima intrebare. A doua e „cine a cerut
 * asta" — pentru aia e `prof-inclusiv.mjs`. Diferenta dintre ele a fost tot: pe
 * timp propriu, tickul de agenti arata ca o multime de interogari de teren, fara
 * niciun vinovat. Pe timp inclusiv, `ensureArea` avea 88,5%.
 *
 *   node --cpu-prof --cpu-prof-dir=.prof src/harness/cli.ts --ticks 400 --agents 40
 *   node tools/prof-propriu.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
const f = readdirSync('.prof').find(x => x.endsWith('.cpuprofile'))
const p = JSON.parse(readFileSync('.prof/' + f, 'utf8'))
const byId = new Map(p.nodes.map(n => [n.id, n]))
const self = new Map()
for (let i = 0; i < p.samples.length; i++) {
  const dt = p.timeDeltas[i] ?? 0
  self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + dt)
}
const agg = new Map()
for (const [id, us] of self) {
  const n = byId.get(id); if (!n) continue
  const cf = n.callFrame
  const file = (cf.url || '').replace(/^.*[\/]/, '')
  const key = `${cf.functionName || '(anon)'}  ${file}:${cf.lineNumber + 1}`
  agg.set(key, (agg.get(key) ?? 0) + us)
}
const total = [...agg.values()].reduce((a, b) => a + b, 0)
const rows = [...agg].sort((a, b) => b[1] - a[1]).slice(0, 22)
console.log(`total esantionat ${(total / 1000).toFixed(0)} ms\n`)
for (const [k, us] of rows) {
  console.log(`${(us / 1000).toFixed(1).padStart(8)} ms  ${((us / total) * 100).toFixed(1).padStart(5)}%  ${k}`)
}
