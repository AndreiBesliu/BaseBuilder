/**
 * Timp INCLUSIV per functie, dintr-un profil `node --cpu-prof`.
 *
 * Numara o functie o singura data pe lantul de apel, deci recursia nu umfla
 * cifrele. Filtrul de la coada tine lista scurta: se dau numele care conteaza.
 *
 *   node --cpu-prof --cpu-prof-dir=.prof src/harness/cli.ts --ticks 400 --agents 40
 *   node tools/prof-inclusiv.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
const f = readdirSync('.prof').find(x => x.endsWith('.cpuprofile'))
const p = JSON.parse(readFileSync('.prof/' + f, 'utf8'))
const byId = new Map(p.nodes.map(n => [n.id, n]))
const parent = new Map()
for (const n of p.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
const self = new Map()
for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) ?? 0) + (p.timeDeltas[i] ?? 0))
const name = id => { const cf = byId.get(id).callFrame; return `${cf.functionName || '(anon)'} ${(cf.url||'').replace(/^.*[\/]/,'')}` }
// timp inclusiv per NUME de functie, fara dubla numarare pe recursie
const incl = new Map()
for (const [id, us] of self) {
  const vazut = new Set()
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const nm = name(cur)
    if (!vazut.has(nm)) { vazut.add(nm); incl.set(nm, (incl.get(nm) ?? 0) + us) }
  }
}
const total = [...self.values()].reduce((a,b)=>a+b,0)
const interes = /stepAgents|findPath|ensureArea|rebuildDirty|alegeTinta|buildOcupare|avanseaza|computeBlock|linkBlock|relabel|coridorDeRegiuni|tick /
console.log(`total ${(total/1000).toFixed(0)} ms\n`)
for (const [k, us] of [...incl].sort((a,b)=>b[1]-a[1])) {
  if (!interes.test(k)) continue
  console.log(`${(us/1000).toFixed(1).padStart(8)} ms  ${((us/total)*100).toFixed(1).padStart(5)}%  ${k}`)
}
