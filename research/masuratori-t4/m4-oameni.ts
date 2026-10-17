// M4: cat incalzesc oamenii un adapost — ΣG al caselor 5x5x2 si 3x3x2 (casaTermica) si al casei + pivnitei (geometria finala),
// deci ΔT la echilibru = P/ΣG pentru 4 si 12 oameni (100 W fiecare), si τ = C/ΣG (cat dureaza sa ajunga acolo).
const K = '../../'
const { DEFAULT_RULES: R } = await import(K + 'src/sim/content.ts')
const { casaTermica, compLa, capacitateaComponentei, jPeKPeMu } = await import(K + 'tests/fixturi-temperatura.ts')
const { geometriaFinala } = await import(K + 'tests/fixturi-pivnita.ts')
const { tragerea } = await import(K + 'src/sim/temperatura.ts')
const { componentaLa } = await import(K + 'src/sim/camere.ts')
const Q = 65536
function rand(nume: string, w: any, id: number): void {
  const t = tragerea(w, R, id)
  if (!t.ok) { console.log(nume, 'refuz', JSON.stringify(t)); return }
  const G = t.value.sumaG / Q
  const C = capacitateaComponentei(w, id, R) * jPeKPeMu(R)
  const tauH = C / G / 3600
  console.log(`${nume.padEnd(28)} ΣG ${G.toFixed(1)} W/K  C ${(C / 1e6).toFixed(2)} MJ/K  τ ${tauH.toFixed(2)} h  ΔT 4 oameni ${(400 / G).toFixed(2)} °C, 12 oameni ${(1200 / G).toFixed(2)} °C`)
}
for (const L of [5, 3]) { const s = casaTermica({ L }); rand(`casa ${L}x${L}x2 singura`, s.w, compLa(s, 'casa')) }
const g = geometriaFinala()
rand('casa 5x5x2 peste pivnita', g.w, componentaLa(g.w.camere, ...g.casa)!.id)
rand('pivnita 3x3x2 sub 1 m', g.w, componentaLa(g.w.camere, ...g.piv)!.id)
