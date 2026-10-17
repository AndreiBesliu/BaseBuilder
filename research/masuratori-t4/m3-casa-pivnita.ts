// M3: casa 5x5x2 cu pivnita 3x3x2 sub 1 m (geometria finala a acceptantei pivnitei, seed 12345) si casele 5x5x2 / 3x3x2
// singure (casaTermica), prin iarna anului 0 si 3, pas cu pas pe pasul real: T-ul fiecarei incaperi ora cu ora, minimul,
// orele sub −8 °C si sub alte praguri; si vara (maximul), ca sa se vada daca vreo incapere fara foc trece de 34 °C.
const K = '../../'
const { DEFAULT_RULES: R } = await import(K + 'src/sim/content.ts')
const { geometriaFinala, ZI, AN } = await import(K + 'tests/fixturi-pivnita.ts')
const { casaTermica, compLa } = await import(K + 'tests/fixturi-temperatura.ts')
const { pasTermic, sincronizeazaLumea, temperaturaLaEchilibru } = await import(K + 'src/sim/temperatura.ts')
const { componentaLa } = await import(K + 'src/sim/camere.ts')
const { tAfara, ziuaValului } = await import(K + 'src/sim/clima.ts')
const { momentul, panaLaAnotimp, Anotimp, tickuriPeOra } = await import(K + 'src/sim/calendar.ts')

const TPS = R.ticksPerSecond
const ORA = tickuriPeOra(R)
const Q = 65536
const praguri = [-10, -8, -6, -4, 0, 5]

function ruleaza(nume: string, w: any, comps: [string, number][], an: number, anotimp: number, zile: number): void {
  const start = panaLaAnotimp(0, anotimp, R) + an * AN
  const p0 = Math.ceil((start - 2 * ZI) / TPS) * TPS
  w.tick = p0
  if (!sincronizeazaLumea(w, R).ok) throw new Error('sync')
  if (!temperaturaLaEchilibru(w, R, p0).ok) throw new Error('echilibru')
  const st = new Map<string, { min: number; max: number; ore: Record<number, number> }>()
  for (const [n] of [...comps, ['afara', -1] as [string, number]]) st.set(n, { min: Infinity, max: -Infinity, ore: Object.fromEntries(praguri.map((p) => [p, 0])) })
  const profil: string[] = []
  for (let tk = p0 + TPS; tk <= start + zile * ZI; tk += TPS) {
    w.tick = tk
    pasTermic(w, R)
    if (tk < start) continue
    for (const [n, id] of [...comps, ['afara', -1] as [string, number]]) {
      const T = id === -1 ? tAfara(w.seed, tk, R) / Q : w.temperatura.slot.t[id]! / Q
      const s = st.get(n)!
      s.min = Math.min(s.min, T); s.max = Math.max(s.max, T)
      for (const p of praguri) if (T < p) s.ore[p] += TPS / ORA
    }
    const m = momentul(tk, R)
    if (anotimp === Anotimp.IARNA && m.zi === ziuaValului(w.seed, m.an, R) && m.tickInZi % (3 * ORA) === 0) {
      profil.push(`${String(m.ora).padStart(2)}h ` + [...comps, ['afara', -1] as [string, number]].map(([n, id]) => `${n} ${(id === -1 ? tAfara(w.seed, tk, R) / Q : w.temperatura.slot.t[id]! / Q).toFixed(1)}`).join(' '))
    }
  }
  console.log(`\n${nume} — anul ${an}, ${['primavara', 'vara', 'toamna', 'iarna'][anotimp]} (${zile} zile), valul in ziua ${ziuaValului(w.seed, an, R)}`)
  for (const [n, s] of st) console.log(`  ${n.padEnd(8)} min ${s.min.toFixed(2)} max ${s.max.toFixed(2)}  ore: ` + praguri.map((p) => `<${p} ${s.ore[p]!.toFixed(1)}`).join(' '))
  for (const l of profil) console.log('    ' + l)
}

for (const an of [0, 3]) {
  const g = geometriaFinala()
  const casa = componentaLa(g.w.camere, ...g.casa)!.id
  const piv = componentaLa(g.w.camere, ...g.piv)!.id
  ruleaza('casa 7x7 (5x5x2) + pivnita 3x3x2 sub 1 m', g.w, [['casa', casa], ['pivnita', piv]], an, Anotimp.IARNA, 4)
}
for (const L of [5, 3]) {
  const s = casaTermica({ L })
  ruleaza(`casa ${L}x${L}x2 singura (casaTermica)`, s.w, [['casa', compLa(s, 'casa')]], 0, Anotimp.IARNA, 4)
}
{
  const g = geometriaFinala()
  ruleaza('vara: casa + pivnita', g.w, [['casa', componentaLa(g.w.camere, ...g.casa)!.id], ['pivnita', componentaLa(g.w.camere, ...g.piv)!.id]], 0, Anotimp.VARA, 4)
}
