// M1: clima de afara pe un an, ora cu ora, pe mai multe seminte — cate ore cad in afara benzii −8..34 °C si a benzilor
// alternative; cand vine valul de frig fata de pornirea jocului si fata de sfarsitul hranei din jocul nou.
import { DEFAULT_RULES } from '../../src/sim/content.ts'
import { tAfara, ziuaValului, GRAD_Q16 } from '../../src/sim/clima.ts'
import { momentul, tickuriPeOra, tickuriPeAn, tickDeStart, NUME_ANOTIMPURI } from '../../src/sim/calendar.ts'

const R = DEFAULT_RULES
const ora = tickuriPeOra(R)
const an = tickuriPeAn(R)
const zi = R.calendar.ziTicks
console.log('tps', R.ticksPerSecond, 'ziTicks', zi, 'ora', ora, 'an (tickuri)', an, 'tickDeStart', tickDeStart(R), '= zi', tickDeStart(R) / zi)
const praguri = [-12, -10, -8, -6, -4, -2, 0, 5, 10, 12, 16, 18]
for (const seed of [12345, 7, 20260913, 1, 2, 3]) {
  // anul 0 de la tickul 0 al jocului (toamna z1 08:00), pe un an intreg, pas de 1 minut de joc
  const pas = ora / 60
  let min = Infinity, max = -Infinity
  const sub: Record<number, number> = {}
  for (const p of praguri) sub[p] = 0
  let peste34 = 0
  const peAnotimp: Record<string, { min: number; max: number; sum: number; n: number }> = {}
  for (let t = 0; t < an; t += pas) {
    const T = tAfara(seed, t, R) / GRAD_Q16
    const m = momentul(t, R)
    const k = NUME_ANOTIMPURI[m.anotimp]!
    peAnotimp[k] ??= { min: Infinity, max: -Infinity, sum: 0, n: 0 }
    const s = peAnotimp[k]!
    s.min = Math.min(s.min, T); s.max = Math.max(s.max, T); s.sum += T; s.n++
    min = Math.min(min, T); max = Math.max(max, T)
    for (const p of praguri) if (T < p) sub[p] += 1 / 60
    if (T > 34) peste34 += 1 / 60
  }
  const iarnaStart = (() => { for (let t = 0; t < an; t += ora) if (momentul(t, R).anotimp === 3) return t; return -1 })()
  const zv0 = ziuaValului(seed, 0, R)
  const zv1 = ziuaValului(seed, 1, R)
  const valStart = iarnaStart + (zv0 - 1) * zi
  console.log(`\nseed ${seed}: min ${min.toFixed(2)} max ${max.toFixed(2)}; ore sub prag: ` + praguri.map((p) => `<${p}: ${sub[p]!.toFixed(1)}`).join(', ') + `; peste 34: ${peste34}`)
  for (const [k, s] of Object.entries(peAnotimp).sort()) console.log(`  ${k}: min ${s.min.toFixed(1)} medie ${(s.sum / s.n).toFixed(1)} max ${s.max.toFixed(1)}`)
  console.log(`  iarna incepe la tickul ${iarnaStart} = ${(iarnaStart / zi).toFixed(3)} zile de la pornire; valul anul 0 in ziua ${zv0} a iernii (tick ${valStart} = ${(valStart / zi).toFixed(3)} zile), anul 1 in ziua ${zv1}`)
  // profilul zilei valului: ore sub −8, sub −12
  let o8 = 0, o12 = 0, minV = Infinity
  for (let t = valStart; t < valStart + zi; t += ora / 60) {
    const T = tAfara(seed, t, R) / GRAD_Q16
    if (T < -8) o8 += 1 / 60
    if (T < -12) o12 += 1 / 60
    minV = Math.min(minV, T)
  }
  // si ziua dinainte / de dupa (raman sub −8 dupa miezul noptii?)
  let o8dupa = 0
  for (let t = valStart + zi; t < valStart + 2 * zi; t += ora / 60) if (tAfara(seed, t, R) / GRAD_Q16 < -8) o8dupa += 1 / 60
  console.log(`  ziua valului: ${o8.toFixed(2)} h sub −8 °C, ${o12.toFixed(2)} h sub −12, min ${minV.toFixed(2)}; ziua de dupa: ${o8dupa.toFixed(2)} h sub −8`)
  // ora cu ora in ziua valului
  const profil: string[] = []
  for (let h = 0; h < 24; h += 2) profil.push(`${h}h ${(tAfara(seed, valStart + h * ora, R) / GRAD_Q16).toFixed(1)}`)
  console.log('  ' + profil.join(' | '))
}
