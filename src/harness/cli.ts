/**
 * Runner de linie de comanda.
 *
 *   node src/harness/cli.ts --seed 12345 --ticks 100000 --agents 40
 *
 * Scoate hash-ul si timpul masurat. Timpul de perete se masoara AICI, in harness,
 * niciodata in `sim/` — acolo ceasul e interzis, fiindca ar face simularea
 * dependenta de viteza masinii.
 */

import { runScenario, standardScenario } from './scenario.ts'

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = Number(process.argv[i + 1])
  if (!Number.isFinite(v)) {
    console.error(`Valoare invalida pentru --${name}: ${process.argv[i + 1]}`)
    process.exit(2)
  }
  return v
}

const seed = arg('seed', 12345)
const ticks = arg('ticks', 100000)
const agents = arg('agents', 40)

const started = performance.now()
const report = runScenario(standardScenario(seed, ticks, agents))
const elapsed = performance.now() - started

const perTick = (elapsed / ticks) * 1000

console.log(`seed        ${seed}`)
console.log(`tickuri     ${report.ticks}`)
console.log(`agenti vii  ${report.liveAgents}`)
console.log(`hash        ${report.hash}`)
console.log(`timp        ${elapsed.toFixed(1)} ms  (${perTick.toFixed(2)} µs/tick)`)
if (report.refusals.length > 0) {
  console.log(`refuzuri    ${report.refusals.length}`)
  for (const r of report.refusals.slice(0, 10)) console.log(`  ${r}`)
}
