// Distributia inaltimilor din harta macro. Ruleaza inainte de a calibra nivelul apei
// sau pragurile de biom — ca sa nu aleg un numar din intuitie.
import { macroHeightDm, MACRO_SIZE } from '../src/sim/terrain/macro.ts'

const SEED = Number(process.argv[2] ?? 20260913)
const samples = []
for (let y = 0; y < MACRO_SIZE; y += 4) {
  for (let x = 0; x < MACRO_SIZE; x += 4) samples.push(macroHeightDm(SEED, x, y))
}
samples.sort((a, b) => a - b)
const pct = (p) => samples[Math.floor(samples.length * p)]

console.log(`seed ${SEED}, ${samples.length} esantioane`)
console.log(`min ${(samples[0] / 10).toFixed(0)} m   max ${(samples[samples.length - 1] / 10).toFixed(0)} m`)
for (const p of [0.05, 0.1, 0.2, 0.25, 0.3, 0.5, 0.7, 0.9, 0.95]) {
  console.log(`  p${String(Math.round(p * 100)).padStart(2)} = ${(pct(p) / 10).toFixed(1).padStart(7)} m  (${pct(p)} dm)`)
}
console.log('\nfractiunea de uscat pentru diferite niveluri de apa:')
for (const wl of [-900, -800, -700, -600, -500, -400, -300, -60]) {
  const land = samples.filter((h) => h >= wl).length / samples.length
  console.log(`  apa la ${(wl / 10).toFixed(0).padStart(4)} m  =>  uscat ${(land * 100).toFixed(1)}%`)
}
