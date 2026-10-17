// M2: jocul nou al viewer-ului, replicat in node (createWorld, setFocus, spawnNear, lasaMormane prin comenzi), rulat zi cu
// zi pana dupa valul de frig. Cati pioni traiesc la inceputul iernii si in ziua valului; unde stau (sub cer / in tocul usii /
// in componenta); ce temperatura au la picioare (temperaturaCelulei, ca pasul de alterare). Argumente: seed oameni hrana zile.
const K = '../../'
const { createWorld, tick } = await import(K + 'src/sim/world.ts')
const { applyCommand } = await import(K + 'src/sim/commands.ts')
const { DEFAULT_RULES } = await import(K + 'src/sim/content.ts')
const { groundLevelM, materialAt } = await import(K + 'src/sim/terrain/terrain.ts')
const { isSolid } = await import(K + 'src/sim/terrain/chunk.ts')
const { Faction, Item, MM_PER_CELL, NEVOI, Nevoie } = await import(K + 'src/sim/state.ts')
const { locJocNou } = await import(K + 'viewer/ui/loc.ts')
const { temperaturaCelulei, loculCelulei, LOC_CER, LOC_TOC } = await import(K + 'src/sim/temperatura.ts')
const { tAfara, GRAD_Q16 } = await import(K + 'src/sim/clima.ts')
const { momentul, tickuriPeOra } = await import(K + 'src/sim/calendar.ts')


const [seed = 20260913, oameni = 12, hrana = 2760, zile = 7] = process.argv.slice(2).map(Number)
const R = DEFAULT_RULES
const loc = locJocNou(seed)
const w = createWorld(seed)
applyCommand(w, { kind: 'setFocus', cx: Math.floor(loc.wx / 32), cy: Math.floor(loc.wy / 32) })
let pusi = 0
for (let r = 0; r <= 4 && pusi < oameni; r++) {
  for (let d = -r; d <= r && pusi < oameni; d++) {
    for (const [cx, cy] of [[loc.wx + d, loc.wy - r], [loc.wx + d, loc.wy + r], [loc.wx - r, loc.wy + d], [loc.wx + r, loc.wy + d]]) {
      if (pusi >= oameni) break
      const g = groundLevelM(w.terrain, cx, cy)
      if (!g.ok) continue
      const sus = materialAt(w.terrain, cx, cy, g.value)
      if (!sus.ok || !isSolid(sus.value)) continue
      const out = applyCommand(w, { kind: 'spawnAgent', x: cx * MM_PER_CELL + MM_PER_CELL / 2, y: cy * MM_PER_CELL + MM_PER_CELL / 2, z: g.value + 1, faction: Faction.ASEZARE })
      if (out.ok) pusi++
    }
  }
}
function lasa(fel: number, total: number): number {
  let cerut = 0
  for (let r = 6; r <= 36 && cerut < total; r++) for (let dy = -r; dy <= r && cerut < total; dy++) for (let dx = -r; dx <= r && cerut < total; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
    const g = groundLevelM(w.terrain, loc.wx + dx, loc.wy + dy)
    if (!g.ok) continue
    const c = Math.min(R.itemStackMax, total - cerut)
    if (applyCommand(w, { kind: 'lasaItem', fel, cantitate: c, wx: loc.wx + dx, wy: loc.wy + dy, z: g.value + 1 }).ok) cerut += c
  }
  return cerut
}
lasa(Item.PIATRA, 1000)
lasa(Item.HRANA, hrana)
console.log(`seed ${seed}, ${pusi} oameni, hrana ${hrana}`)
const ora = tickuriPeOra(R)
const cel = (mm: number) => Math.floor(mm / MM_PER_CELL)
const a = w.agents
function hranaInLume(): number { let s = 0; for (let i = 0; i < w.iteme.count; i++) if (w.iteme.alive[i] === 1 && w.iteme.kind[i] === Item.HRANA) s += w.iteme.cantitate[i]!; for (let i = 0; i < a.count; i++) if (a.alive[i] === 1 && a.caraKind[i] === Item.HRANA) s += a.caraCantitate[i]!; return s }
let oreSub8 = 0, oreOm = 0, oreCer = 0
const t0 = Date.now()
for (let h = 0; h < zile * 24; h++) {
  for (let k = 0; k < ora; k++) tick(w, R)
  const tA = tAfara(w.seed, w.tick, R)
  let vii = 0, cer = 0, toc = 0, comp = 0, sub8 = 0, minT = Infinity, sumaDisp = 0
  for (let i = 0; i < a.count; i++) {
    if (a.alive[i] !== 1 || a.faction[i] !== Faction.ASEZARE) continue
    vii++
    const x = cel(a.x[i]!), y = cel(a.y[i]!), z = a.z[i]!
    const l = loculCelulei(w, x, y, z)
    if (l === LOC_CER) cer++; else if (l === LOC_TOC) toc++; else comp++
    const T = temperaturaCelulei(w, x, y, z, tA)
    if (T !== null) { minT = Math.min(minT, T / GRAD_Q16); if (T / GRAD_Q16 < -8) sub8++ }
    sumaDisp += a.dispozitie[i]!
  }
  oreOm += vii; oreCer += cer; oreSub8 += sub8
  const m = momentul(w.tick, R)
  if (h % 6 === 5 || sub8 > 0) console.log(`z${(w.tick / R.calendar.ziTicks).toFixed(2)} ${['prim', 'vara', 'toamna', 'iarna'][m.anotimp]} z${m.zi} ${String(m.ora).padStart(2)}h  afara ${(tA / GRAD_Q16).toFixed(1)}  vii ${vii} (cer ${cer}, toc ${toc}, comp ${comp})  sub −8: ${sub8}  dispozitie medie ${vii ? Math.round(sumaDisp / vii) : '-'}  hrana ${hranaInLume()}  plecati ${w.plecatiTotal}`)
}
console.log(`ore-om ${oreOm}, sub cer ${oreCer} (${(100 * oreCer / Math.max(1, oreOm)).toFixed(1)}%), ore-om sub −8 °C: ${oreSub8}; ${((Date.now() - t0) / 1000).toFixed(1)} s`)
