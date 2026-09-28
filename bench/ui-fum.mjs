/**
 * Proba de fum a UI-ului de joc — pe ecran, cu input REAL, repetabila.
 *
 * Panoul de design al UI-ului (T12): verificarea „pe ecran" din design nu se putea repeta — un panou
 * de browser ascuns opreste `requestAnimationFrame` (masurat in sesiune: ~1,3 cadre pe secunda), iar
 * `stepFrame` nu grabeste timpul. Asta e un Electron cu fereastra OFFSCREEN (randeaza fara sa fie
 * vazuta, la 30 de cadre pe secunda), care trimite taste si mouse prin `sendInputEvent` si citeste
 * lumea din `__kinstead`. Fiecare pas e o bifa cu cifra ei; `--proba-negativa` strica una
 * intentionat, iar rularea TREBUIE sa iasa rosie (un instrument care nu poate produce rosu n-are
 * dreptul sa produca verde).
 *
 *   npm run viewer            (in alt terminal; sau `npm run viewer:preview` pe build)
 *   node_modules/electron/dist/electron.exe bench/ui-fum.mjs http://localhost:5175/ [--proba-negativa] [--poze=<dosar>]
 *
 * NU e o masuratoare de cadre si nu intra in gate: offscreen + fara throttling e exact ce protocolul
 * de gate interzice (bench/GATE.md §5b). E o proba de COMPORTAMENT.
 */
import { app, BrowserWindow, session } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(process.defaultApp ? 2 : 1)
const BAZA = (argv.find((a) => /^https?:\/\//.test(a)) ?? 'http://localhost:5175/').replace(/\/?$/, '/')
const NEGATIVA = argv.includes('--proba-negativa')
const POZE = argv.find((a) => a.startsWith('--poze='))?.slice('--poze='.length) ?? null
const W = 1280
const H = 720
const astepta = (ms) => new Promise((r) => setTimeout(r, ms))

const bife = []
function bifa(ok, ce, cifra = '') {
  bife.push({ ok, ce })
  console.log(`${ok ? 'OK  ' : 'ROSU'} ${ce}${cifra !== '' ? ` — ${cifra}` : ''}`)
}

app.setPath('userData', join(tmpdir(), 'kin-ui-fum'))
app.whenReady().then(async () => {
  let cod = 0
  try {
    session.defaultSession.on('will-download', (_e, item) => item.cancel())
    await ruleaza()
  } catch (e) {
    console.log('EXCEPTIE ' + (e?.stack ?? e))
    cod = 2
  }
  const rosii = bife.filter((b) => !b.ok).length
  console.log(`\n${bife.length - rosii}/${bife.length} bife verzi${NEGATIVA ? ' (proba negativa: TREBUIE sa fie macar una rosie)' : ''}`)
  if (cod === 0) cod = NEGATIVA ? (rosii > 0 ? 0 : 1) : (rosii > 0 ? 1 : 0)
  app.exit(cod)
})

/**
 * O SINGURA fereastra pentru toate paginile: dupa `destroy()` pe o fereastra offscreen, urmatorul
 * `loadURL` intr-o fereastra noua cade imediat cu ERR_FAILED (-2), si tot ce urmeaza atarna (masurat,
 * `diag-load2.mjs`). Navigarea in aceeasi fereastra nu are problema.
 */
let fereastra = null
const erori = []
async function pagina(cautare) {
  if (fereastra === null) {
    fereastra = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { backgroundThrottling: false, offscreen: true } })
    fereastra.webContents.setFrameRate(30)
    fereastra.webContents.on('console-message', (ev) => {
      const m = ev.message ?? ''
      if (ev.level === 'error' || /TypeError|ReferenceError|SyntaxError/.test(m)) erori.push(m.slice(0, 300))
    })
  }
  const win = fereastra
  erori.length = 0
  await win.loadURL(BAZA + cautare)
  const js = (s) => win.webContents.executeJavaScript(s)
  for (let i = 0; i < 200; i++) {
    await astepta(250)
    if (await js(`!!globalThis.__kinstead && !document.getElementById('busy')`).catch(() => false)) break
  }
  await astepta(800)
  // Ajutoare in pagina: proiectia unei celule pe ecran, fara THREE (matricele camerei, pe coloane).
  await js(`globalThis.__f = {
    K: globalThis.__kinstead,
    proj(x, y, z) {
      const c = this.K.camera; c.updateMatrixWorld(); c.matrixWorldInverse.copy(c.matrixWorld).invert()
      const m = (e, v) => [e[0]*v[0]+e[4]*v[1]+e[8]*v[2]+e[12]*v[3], e[1]*v[0]+e[5]*v[1]+e[9]*v[2]+e[13]*v[3], e[2]*v[0]+e[6]*v[1]+e[10]*v[2]+e[14]*v[3], e[3]*v[0]+e[7]*v[1]+e[11]*v[2]+e[15]*v[3]]
      const p = m(c.projectionMatrix.elements, m(c.matrixWorldInverse.elements, [x, y, z, 1]))
      return { x: (p[0] / p[3] + 1) / 2 * innerWidth, y: (1 - p[1] / p[3]) / 2 * innerHeight }
    },
    des() { const d = this.K.world.desemnari; const o = []; for (let i = 0; i < d.count; i++) if (d.alive[i]) o.push({ id: d.id[i], wx: d.wx[i], wy: d.wy[i], z: d.z[i], piesa: d.piesa[i] }); return o },
    zone() { return this.K.world.zone.celule.vii },
    pioni() { const a = this.K.world.agents; let c = 0, j = 0; for (let i = 0; i < a.count; i++) if (a.alive[i]) { if (a.faction[i] === 0) c++; else if (a.faction[i] === 2) j++ } return { c, j } },
    marfa(fel) { const it = this.K.world.iteme; let s = 0; for (let i = 0; i < it.count; i++) if (it.alive[i] && it.kind[i] === fel) s += it.cantitate[i]; return s },
    // Pixelul pe care clicul (unealta de acum) chiar tinteste celula (wx, wy): pe teren netezit, centrul
    // proiectat al celulei poate cadea pe vecina. Doar pixeli pe canvas, nu pe un panou.
    pixel(wx, wy, y) {
      // Fata de sus REALA a coloanei (pe o panta, cota de la centru muta proiectia pe alta coloana).
      const s = this.K.suprafata(wx, wy)
      const p0 = this.proj(wx + 0.5, s === null ? y : s + 1, wy + 0.5)
      for (let r = 0; r <= 20; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        // Pixeli INTREGI: sendInputEvent rotunjeste, iar la marginea celulei pixelul rotunjit e al vecinei.
        const x = Math.round(p0.x) + dx, yy = Math.round(p0.y) + dy
        if (document.elementFromPoint(x, yy) !== this.K.renderer.domElement) continue
        const t = this.K.tintaLa(x, yy, { ctrl: false, shift: false, alt: false })
        if (t.ok && t.wx === wx && t.wy === wy) return { x, y: yy }
      }
      return null
    },
    centreaza(x, y, z) { const K = this.K; K.controls.target.set(x, z, y); K.camera.position.set(x - 12, z + 18, y + 12); K.controls.update(); return true },
  }; true`)
  const tasta = async (k, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers })
    if (k.length === 1) win.webContents.sendInputEvent({ type: 'char', keyCode: k, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers })
    await astepta(80)
  }
  const muta = async (x, y, modifiers = [], buton) => { win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y), modifiers, ...(buton ? { button: buton } : {}) }); await astepta(70) }
  const apasa = async (x, y, modifiers = []) => { win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, modifiers }); await astepta(60) }
  const elibereaza = async (x, y, modifiers = []) => { win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, modifiers }); await astepta(250) }
  const click = async (x, y, modifiers = []) => { await muta(x, y, modifiers); await apasa(x, y, modifiers); await elibereaza(x, y, modifiers) }
  /** Trage de la celula A la celula B (pixelii pe care clicul chiar ii tinteste; camera centrata intre ele). */
  const trage = async (a, b, y, modifiers = [], inainteDeEliberare = null) => {
    await js(`__f.centreaza(${(a[0] + b[0]) / 2 + 0.5}, ${(a[1] + b[1]) / 2 + 0.5}, ${y})`)
    await astepta(250)
    const pa = await js(`__f.pixel(${a[0]}, ${a[1]}, ${y})`)
    const pb = await js(`__f.pixel(${b[0]}, ${b[1]}, ${y})`)
    if (pa === null || pb === null) throw new Error(`nu gasesc pixelul celulei ${pa === null ? a : b}`)
    await muta(pa.x, pa.y, modifiers)
    await apasa(pa.x, pa.y, modifiers)
    for (let i = 1; i <= 8; i++) await muta(pa.x + (pb.x - pa.x) * i / 8, pa.y + (pb.y - pa.y) * i / 8, modifiers, 'left')
    if (inainteDeEliberare) await inainteDeEliberare()
    await elibereaza(pb.x, pb.y, modifiers)
    await astepta(400)
  }
  const poza = async (nume) => {
    if (!POZE) return
    mkdirSync(POZE, { recursive: true })
    writeFileSync(join(POZE, nume), (await win.webContents.capturePage()).toPNG())
  }
  return { win, js, tasta, muta, click, trage, poza, erori }
}

async function ruleaza() {
  // --- 1. gate-ul: fara UI, fara stil ---
  {
    const p = await pagina('?scenario=dig&ballast=1&warmup=0&frames=1000000')
    const r = await p.js(`({ ui: !!document.querySelector('[data-ui]'), stil: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((x) => x.cssText.includes('ui-sus')) } catch { return false } }), hud: !document.getElementById('hud').hidden, mormane: __kinstead.stratResurse !== null })`)
    bifa(!r.ui && !r.stil && r.hud && !r.mormane, 'pagina de gate: niciun [data-ui], niciun stil al UI-ului, niciun strat de mormane, HUD-ul vizibil', JSON.stringify(r))
  }
  // --- 2. ecranul de titlu ---
  {
    const p = await pagina('')
    const r = await p.js(`({ titlu: !!document.querySelector('.ui-titlu'), butoane: document.querySelectorAll('.ui-titlu button').length, hud: document.getElementById('hud').hidden, mod: __kinstead.mod })`)
    bifa(r.titlu && r.butoane === 4 && r.hud, 'fara parametri: ecranul de titlu cu 4 butoane, HUD-ul ascuns', JSON.stringify(r))
    await p.poza('1-titlu.png')
  }
  // --- 3. jocul nou ---
  const p = await pagina('?joc=nou&seed=7&oameni=6&piatra=400&hrana=1380')
  {
    const r = await p.js(`({ pioni: __f.pioni(), piatra: __f.marfa(0), hrana: __f.marfa(3), pasi: !document.querySelector('.ui-pasi').hidden, planul: __kinstead.jobOverlay.visible, mod: __kinstead.mod })`)
    bifa(r.pioni.c === 6 && r.pioni.j === 0, 'joc nou: 6 colonisti, 0 jefuitori', JSON.stringify(r.pioni))
    bifa(r.piatra === 400 && r.hrana === 1380, 'joc nou: 400 de piatra si 1380 de hrana in mormane', `${r.piatra} / ${r.hrana}`)
    bifa(r.pasi && r.planul, 'joc nou: Primii pasi vizibili, Planul (J) aprins', JSON.stringify({ pasi: r.pasi, planul: r.planul }))
    // Mormanele din Blender: 400 de piatra = 5×75 + 25, 1380 de hrana = 18×75 + 30 ⇒ 25 de mormane pe ecran.
    await astepta(1500)
    const m = await p.js(`({ plase: __kinstead.stratResurse?.plase?.size ?? 0, desenate: __kinstead.stratResurse?.desenate ?? -1, eroare: __kinstead.stratResurse?.eroare ?? null, icoane: [...document.querySelectorAll('.ui-res img')].filter((i) => i.naturalWidth === 128).length })`)
    bifa(m.plase === 12 && m.desenate === 25 && m.eroare === null && m.icoane === 4, 'joc nou: cele 12 plase din Blender incarcate, 25 de mormane desenate, 4 iconite in bara de sus', JSON.stringify(m))
    await p.poza('2-joc-nou.png')
  }
  // Pauza (Spatiu): pionii nu apuca sa termine sapaturi intre tragere si numarare.
  await p.tasta(' ')
  bifa(await p.js('__kinstead.ui.modalDeschis() === false && document.querySelector(".ui-sus button[aria-pressed=true]") !== null'), 'Spatiu pune pauza (butonul de pauza apasat)')
  // Un patrat plat langa oameni: locul ales de `locJocNou` are o fereastra 7×7 plata in centru.
  const loc = await p.js(`(() => { const a = __kinstead.world.agents; const x = Math.floor(a.x[0] / 1000), y = Math.floor(a.y[0] / 1000); return { x, y, z: a.z[0] } })()`)
  const sol = loc.z - 1
  // Camera sus, aproape, ca celulele sa fie mari pe ecran.
  await p.js(`(() => { const K = __kinstead; K.controls.target.set(${loc.x + 0.5}, ${sol + 1}, ${loc.y + 0.5}); K.camera.position.set(${loc.x + 0.5 - 14}, ${sol + 22}, ${loc.y + 0.5 + 14}); K.controls.update(); return true })()`)
  await astepta(300)
  // --- 4. dreptunghiul de sapat, 5×5, cu nivelul oprit: solul fiecarei coloane ---
  {
    await p.tasta('d')
    const inainte = await p.js('__f.des().length')
    const x0 = loc.x + 10, y0 = loc.y - 14
    await p.trage([x0, y0], [x0 + 4, y0 + 4], sol + 1)
    const noi = (await p.js('__f.des()')).filter((d) => d.piesa === 0 && d.wx >= x0 && d.wx <= x0 + 4 && d.wy >= y0 && d.wy <= y0 + 4)
    const astept = NEGATIVA ? 26 : 25
    const afara = (await p.js('__f.des()')).filter((d) => !(d.wx >= x0 && d.wx <= x0 + 4 && d.wy >= y0 && d.wy <= y0 + 4))
    bifa(noi.length === astept && afara.length === inainte, `Sapa, dreptunghi 5×5 tras cu mouse-ul: ${astept} de sapaturi, nimic in afara lui`, `${noi.length}; in afara: ${JSON.stringify(afara.slice(0, 8))}; toast: ${await p.js(`document.querySelector('.ui-toast')?.textContent ?? ''`)}`)
    await p.poza('3-sapa.png')
  }
  // --- 5. Esc in timpul tragerii: nimic aplicat ---
  {
    const inainte = await p.js('__f.des().length')
    await p.trage([loc.x - 14, loc.y - 14], [loc.x - 10, loc.y - 10], sol + 1, [], async () => { await p.tasta('Escape') })
    const dupa = await p.js('__f.des().length')
    bifa(dupa === inainte, 'Esc in timpul tragerii renunta: nicio desemnare noua', `${inainte} → ${dupa}`)
  }
  // --- 6. conturul de perete 7×7 ---
  {
    await p.tasta('c')
    const x0 = loc.x + 10, y0 = loc.y + 10
    await p.trage([x0, y0], [x0 + 6, y0 + 6], sol + 1)
    const pereti = (await p.js('__f.des()')).filter((d) => d.piesa === 1 && d.wx >= x0 && d.wx <= x0 + 6 && d.wy >= y0 && d.wy <= y0 + 6)
    const interior = pereti.filter((d) => d.wx > x0 && d.wx < x0 + 6 && d.wy > y0 && d.wy < y0 + 6)
    bifa(pereti.length === 24 && interior.length === 0, 'Construieste perete, dreptunghi 7×7: 24 de piese, doar pe contur', `${pereti.length}, ${interior.length} in interior; toast: ${await p.js(`document.querySelector('.ui-toast')?.textContent ?? ''`)}`)
    await p.poza('4-perete.png')
  }
  // --- 7. depozitul 4×4 ---
  {
    await p.tasta('k')
    const inainte = await p.js('__f.zone()')
    await p.trage([loc.x - 14, loc.y + 10], [loc.x - 11, loc.y + 13], sol + 1)
    const dupa = await p.js('__f.zone()')
    bifa(dupa - inainte === 16, 'Zone ▸ Depozit, dreptunghi 4×4: 16 celule de zona', `${inainte} → ${dupa}; toast: ${await p.js(`document.querySelector('.ui-toast')?.textContent ?? ''`)}; unealta ${await p.js('__kinstead.ui.unealta')}`)
  }
  // --- 8. Selecteaza un om: inspectorul are numele lui ---
  {
    await p.tasta('v')
    const pion = await p.js(`(() => { const L = __kinstead.agentLayer; const m = L.mesh; const e = new Float32Array(16); m.instanceMatrix.array.slice(0, 16).forEach((v, i) => { e[i] = v }); const a = __kinstead.world.agents; return { x: e[12], y: e[13] + 0.7, z: e[14], id: a.id[L.sloturi[0]] } })()`)
    const s = await p.js(`__f.proj(${pion.x}, ${pion.y}, ${pion.z})`)
    await p.click(s.x, s.y)
    await astepta(400)
    const r = await p.js(`({ h2: document.querySelector('.ui-inspector h2')?.textContent ?? null, sel: __kinstead.ui.pionSelectat() })`)
    bifa(r.sel === pion.id && typeof r.h2 === 'string' && r.h2.length > 3, 'Selecteaza + clic pe un om: inspectorul lui, cu numele', JSON.stringify(r))
    await p.poza('5-inspector.png')
  }
  // --- 9. Ctrl+S nu comuta stabilitatea; salvarea se reincarca in aceeasi lume ---
  let salvare = null
  {
    const s0 = await p.js('__kinstead.stabOverlay.visible')
    await p.tasta('s', ['control'])
    await astepta(1200)
    const s1 = await p.js('__kinstead.stabOverlay.visible')
    salvare = await p.js(`(async () => { const r = indexedDB.open('kinstead', 1); const db = await new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) }); const t = db.transaction('salvari'); const q = t.objectStore('salvari').getAll(); const toate = await new Promise((ok) => { q.onsuccess = () => ok(q.result) }); db.close(); const s = toate.filter((x) => !x.id.startsWith('auto')).sort((a, b) => (a.salvatLa < b.salvatLa ? 1 : -1))[0]; return s ? { id: s.id, tick: s.tick, des: JSON.parse(s.lume).data.designations?.count ?? null } : null })()`)
    bifa(s0 === s1 && salvare !== null, 'Ctrl+S salveaza si nu comuta stabilitatea', JSON.stringify({ s0, s1, salvare: salvare?.id ?? null }))
  }
  const desInainte = await p.js('__f.des().length')
  const pioniInainte = await p.js('__f.pioni()')
  if (salvare !== null) {
    const q = await pagina(`?incarca=${encodeURIComponent(salvare.id)}`)
    const r = await q.js(`({ mod: __kinstead.mod, tick: __kinstead.world.tick, des: __f.des().length, pioni: __f.pioni() })`)
    bifa(r.mod === 'incarca' && r.tick >= salvare.tick && r.pioni.c === pioniInainte.c, 'incarcarea: aceeasi lume (tick, oameni)', JSON.stringify({ r, salvat: salvare.tick, pioniInainte }))
    bifa(r.des === desInainte, 'incarcarea: aceleasi desemnari (jocul era in pauza la salvare)', `${desInainte} → ${r.des}`)
    // --- 10. tastele tastate intr-un camp nu comanda nimic ---
    await q.tasta('Escape')
    const deschis = await q.js(`!!document.querySelector('.ui-fereastra')`)
    await q.js(`[...document.querySelectorAll('.ui-fereastra button')].find((b) => b.textContent.startsWith('Joc nou'))?.click(); true`)
    await astepta(200)
    await q.js(`document.querySelector('.ui-fereastra input[name=seed]').focus(); true`)
    const ov0 = await q.js(`[__kinstead.stabOverlay.visible, __kinstead.jobOverlay.visible, document.getElementById('slice').textContent]`)
    for (const k of ['s', 'j', 'q', 't', ' ']) await q.tasta(k)
    const ov1 = await q.js(`[__kinstead.stabOverlay.visible, __kinstead.jobOverlay.visible, document.getElementById('slice').textContent]`)
    bifa(deschis && JSON.stringify(ov0) === JSON.stringify(ov1), 'literele tastate in campul „Sămânța lumii" nu comuta nimic', JSON.stringify({ deschis, ov0, ov1 }))
    await q.poza('6-joc-nou-dialog.png')
    if (q.erori.length) bifa(false, 'fara erori in consola (pagina incarcata)', q.erori.join(' | '))
  }
  if (p.erori.length) bifa(false, 'fara erori in consola (jocul nou)', p.erori.join(' | '))
}
