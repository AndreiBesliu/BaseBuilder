/**
 * Proba de fum a UI-ului de joc — pe ecran, cu input REAL, repetabila.
 *
 * Panoul de design al UI-ului (T12): verificarea „pe ecran" din design nu se putea repeta — un panou
 * de browser ascuns opreste `requestAnimationFrame` (masurat in sesiune: ~1,3 cadre pe secunda), iar
 * `stepFrame` nu grabeste timpul. Asta e un Electron cu fereastra OFFSCREEN (randeaza fara sa fie
 * vazuta, la 30 de cadre pe secunda), care trimite taste si mouse prin `sendInputEvent` si citeste
 * lumea din `__kinstead`. Fiecare pas e o bifa cu NUME si cu cifra ei.
 *
 * Proba negativa: `--proba-negativa[=<bifa>]` saboteaza pasul unei bife anume (sapa: oracolul cere
 * 26; pauza: Spatiu nu se apasa; salvare: Ctrl+S nu se apasa), iar rularea iese cu 0 DOAR daca exact
 * bifa aceea e rosie. Inainte, orice rosu trecea proba — si o bifa care nu putea iesi rosie (pauza)
 * nu se vedea (recenzia UI-ului, T-02).
 *
 * Profilul (IndexedDB) e NOU la fiecare rulare: pe un profil refolosit, salvarea din rularea trecuta
 * facea bifele Ctrl+S si incarcarea verzi si cu salvarea stricata (recenzia UI-ului, T-01).
 *
 *   npm run viewer            (in alt terminal; sau `npm run viewer:preview` pe build)
 *   node_modules/electron/dist/electron.exe bench/ui-fum.mjs http://localhost:5175/ [--proba-negativa[=sapa|pauza|salvare]] [--poze=<dosar>]
 *
 * NU e o masuratoare de cadre si nu intra in gate: offscreen + fara throttling e exact ce protocolul
 * de gate interzice (bench/GATE.md §5b). E o proba de COMPORTAMENT.
 */
import { app, BrowserWindow, session } from 'electron'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(process.defaultApp ? 2 : 1)
const BAZA = (argv.find((a) => /^https?:\/\//.test(a)) ?? 'http://localhost:5175/').replace(/\/?$/, '/')
const NEG = argv.find((a) => a.startsWith('--proba-negativa'))
const NEGATIVA = NEG === undefined ? null : NEG.includes('=') ? NEG.slice(NEG.indexOf('=') + 1) : 'sapa'
if (NEGATIVA !== null && !['sapa', 'pauza', 'salvare'].includes(NEGATIVA)) { console.log(`proba negativa necunoscuta: ${NEGATIVA}`); process.exit(2) }
const POZE = argv.find((a) => a.startsWith('--poze='))?.slice('--poze='.length) ?? null
const W = 1280
const H = 720
const astepta = (ms) => new Promise((r) => setTimeout(r, ms))

const bife = []
function bifa(id, ok, ce, cifra = '') {
  bife.push({ id, ok, ce })
  console.log(`${ok ? 'OK  ' : 'ROSU'} [${id}] ${ce}${cifra !== '' ? ` — ${cifra}` : ''}`)
}

// Profil nou la fiecare rulare; cele ramase de la rulari vechi se sterg (nu si al rularii de acum,
// pe care Electron il tine deschis).
for (const d of readdirSync(tmpdir())) {
  if (d.startsWith('kin-ui-fum')) try { rmSync(join(tmpdir(), d), { recursive: true, force: true }) } catch { /* tinut de alt proces */ }
}
const PROFIL = mkdtempSync(join(tmpdir(), 'kin-ui-fum-'))
app.setPath('userData', PROFIL)
app.whenReady().then(async () => {
  let cod = 0
  try {
    session.defaultSession.on('will-download', (_e, item) => item.cancel())
    await ruleaza()
  } catch (e) {
    console.log('EXCEPTIE ' + (e?.stack ?? e?.message ?? JSON.stringify(e)))
    cod = 2
  }
  const rosii = bife.filter((b) => !b.ok)
  console.log(`\n${bife.length - rosii.length}/${bife.length} bife verzi`)
  if (cod === 0) {
    if (NEGATIVA === null) cod = rosii.length > 0 ? 1 : 0
    else {
      const tinta = rosii.some((b) => b.id === NEGATIVA)
      console.log(`proba negativa „${NEGATIVA}": bifa ei ${tinta ? 'E rosie (instrumentul poate produce rosu acolo)' : 'NU e rosie — instrumentul e orb acolo'}; rosii: ${rosii.map((b) => b.id).join(', ') || 'niciuna'}`)
      cod = tinta ? 0 : 1
    }
  }
  app.exit(cod)
})

/**
 * O SINGURA fereastra pentru toate paginile: dupa `destroy()` pe o fereastra offscreen, urmatorul
 * `loadURL` intr-o fereastra noua cade imediat cu ERR_FAILED (-2), si tot ce urmeaza atarna (masurat,
 * `diag-load2.mjs`). Navigarea in aceeasi fereastra nu are problema.
 */
let fereastra = null
const erori = []
/** De cate ori a cerut pagina confirmare la plecare (`beforeunload`); proba o accepta mereu. */
let plecariOprite = 0
async function pagina(cautare) {
  if (fereastra === null) {
    fereastra = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, webPreferences: { backgroundThrottling: false, offscreen: true } })
    fereastra.webContents.setFrameRate(30)
    fereastra.webContents.on('console-message', (ev) => {
      const m = ev.message ?? ''
      if (ev.level === 'error' || /TypeError|ReferenceError|SyntaxError/.test(m)) erori.push(m.slice(0, 300))
    })
    // Un joc nesalvat cere confirmare la plecare (INT-6); proba pleaca oricum, dar numara cererea.
    fereastra.webContents.on('will-prevent-unload', (ev) => { plecariOprite++; ev.preventDefault() })
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
    zoneFel() { const s = this.K.world.zone; const o = []; for (let i = 0; i < s.count; i++) if (s.alive[i]) o.push({ id: s.id[i], fel: s.kind[i] }); return o },
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
    centreaza(x, y, z, d = 12) { const K = this.K; K.controls.target.set(x, z, y); K.camera.position.set(x - d, z + d * 1.5, y + d); K.controls.update(); return true },
    // Salvarile din IndexedDB, FARA sa creeze baza: deschiderea cu versiune pe un profil gol facea o baza
    // v1 fara magazia „salvari", iar aplicatia nu mai putea salva in profilul acela (T-01).
    async salvari() {
      // open() CREEAZA baza cand lipseste (si fara versiune): intai lista bazelor.
      if (!(await indexedDB.databases()).some((d) => d.name === 'kinstead')) return []
      const r = indexedDB.open('kinstead')
      const db = await new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error) })
      if (!db.objectStoreNames.contains('salvari')) { db.close(); return [] }
      const q = db.transaction('salvari').objectStore('salvari').getAll()
      const toate = await new Promise((ok) => { q.onsuccess = () => ok(q.result) })
      db.close()
      return toate.map((s) => ({ id: s.id, tick: s.tick, seed: s.seed, des: JSON.parse(s.lume).data.designations?.count ?? null }))
    },
    toast() { const t = [...document.querySelectorAll('.ui-toast')]; return t.length ? t[t.length - 1].textContent : '' },
  }; true`)
  const tasta = async (k, modifiers = []) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers })
    if (k.length === 1) win.webContents.sendInputEvent({ type: 'char', keyCode: k, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers })
    await astepta(80)
  }
  const muta = async (x, y, modifiers = [], buton, ms = 70) => { win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x), y: Math.round(y), modifiers, ...(buton ? { button: buton } : {}) }); if (ms) await astepta(ms) }
  const apasa = async (x, y, modifiers = [], button = 'left', ms = 60) => { win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button, clickCount: 1, modifiers }); if (ms) await astepta(ms) }
  const elibereaza = async (x, y, modifiers = [], button = 'left', ms = 250) => { win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button, clickCount: 1, modifiers }); if (ms) await astepta(ms) }
  const click = async (x, y, modifiers = []) => { await muta(x, y, modifiers); await apasa(x, y, modifiers); await elibereaza(x, y, modifiers) }
  /**
   * Trage de la celula A la celula B (pixelii pe care clicul chiar ii tinteste; camera centrata intre
   * ele). Miscarile poarta `leftButtonDown`: fara el, Chromium nu le vede ca tragere cu butonul tinut, iar
   * un clic-dreapta „in timpul tragerii" ar veni ca `pointerdown` — cazul pe care un mouse real nu-l face.
   */
  const trage = async (a, b, y, modifiers = [], inainteDeEliberare = null, dist = 12) => {
    await js(`__f.centreaza(${(a[0] + b[0]) / 2 + 0.5}, ${(a[1] + b[1]) / 2 + 0.5}, ${y}, ${dist})`)
    await astepta(250)
    const pa = await js(`__f.pixel(${a[0]}, ${a[1]}, ${y})`)
    const pb = await js(`__f.pixel(${b[0]}, ${b[1]}, ${y})`)
    if (pa === null || pb === null) throw new Error(`nu gasesc pixelul celulei ${pa === null ? a : b}`)
    await muta(pa.x, pa.y, modifiers)
    await apasa(pa.x, pa.y, modifiers)
    for (let i = 1; i <= 8; i++) await muta(pa.x + (pb.x - pa.x) * i / 8, pa.y + (pb.y - pa.y) * i / 8, [...modifiers, 'leftButtonDown'], 'left')
    if (inainteDeEliberare) await inainteDeEliberare(pb)
    await elibereaza(pb.x, pb.y, modifiers)
    await astepta(400)
  }
  const poza = async (nume) => {
    if (!POZE) return
    mkdirSync(POZE, { recursive: true })
    writeFileSync(join(POZE, nume), (await win.webContents.capturePage()).toPNG())
  }
  return { win, js, tasta, muta, apasa, elibereaza, click, trage, poza, erori }
}

async function ruleaza() {
  // --- 1. gate-ul: fara UI, fara stil ---
  {
    const p = await pagina('?scenario=dig&ballast=1&warmup=0&frames=1000000')
    const r = await p.js(`({ ui: !!document.querySelector('[data-ui]'), stil: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((x) => x.cssText.includes('ui-sus')) } catch { return false } }), hud: !document.getElementById('hud').hidden, mormane: __kinstead.stratResurse !== null })`)
    bifa('gate', !r.ui && !r.stil && r.hud && !r.mormane, 'pagina de gate: niciun [data-ui], niciun stil al UI-ului, niciun strat de mormane, HUD-ul vizibil', JSON.stringify(r))
  }
  // --- 2. ecranul de titlu; demo-ul de sub el nu scrie salvarea automata (INT-1) ---
  {
    const p = await pagina('')
    const r = await p.js(`({ titlu: !!document.querySelector('.ui-titlu'), butoane: document.querySelectorAll('.ui-titlu button').length, hud: document.getElementById('hud').hidden, mod: __kinstead.mod })`)
    bifa('titlu', r.titlu && r.butoane === 4 && r.hud, 'fara parametri: ecranul de titlu cu 4 butoane, HUD-ul ascuns', JSON.stringify(r))
    await p.poza('1-titlu.png')
    // Peste intervalul salvarii automate si peste minutul de asteptare: la 5 + 1 minute de joc, demo-ul
    // scria „auto" peste jocul jucatorului. Timpul se sare (`tick`), nu se asteapta 6 minute.
    await p.js('__kinstead.world.tick += 20 * 60 * 7; true')
    await astepta(1500)
    const auto = (await p.js('__f.salvari()')).filter((s) => s.id.startsWith('auto'))
    bifa('titlu-fara-automata', auto.length === 0, 'demo-ul de sub ecranul de titlu nu scrie nicio salvare automata', JSON.stringify(auto))
  }
  // --- 3. jocul nou ---
  const p = await pagina('?joc=nou&seed=7&oameni=6&piatra=400&hrana=1380')
  {
    const r = await p.js(`({ pioni: __f.pioni(), piatra: __f.marfa(0), hrana: __f.marfa(3), pasi: !document.querySelector('.ui-pasi').hidden, planul: __kinstead.jobOverlay.visible, mod: __kinstead.mod })`)
    bifa('joc-nou-oameni', r.pioni.c === 6 && r.pioni.j === 0, 'joc nou: 6 colonisti, 0 jefuitori', JSON.stringify(r.pioni))
    bifa('joc-nou-marfa', r.piatra === 400 && r.hrana === 1380, 'joc nou: 400 de piatra si 1380 de hrana in mormane', `${r.piatra} / ${r.hrana}`)
    bifa('joc-nou-pasi', r.pasi && r.planul, 'joc nou: Primii pasi vizibili, Planul (J) aprins', JSON.stringify({ pasi: r.pasi, planul: r.planul }))
    // Mormanele din Blender: 400 de piatra = 5×75 + 25, 1380 de hrana = 18×75 + 30 ⇒ 25 de mormane pe ecran.
    await astepta(1500)
    const m = await p.js(`({ plase: __kinstead.stratResurse?.plase?.size ?? 0, desenate: __kinstead.stratResurse?.desenate ?? -1, eroare: __kinstead.stratResurse?.eroare ?? null, icoane: [...document.querySelectorAll('.ui-res img')].filter((i) => i.naturalWidth === 128).length })`)
    bifa('mormane', m.plase === 12 && m.desenate === 25 && m.eroare === null && m.icoane === 4, 'joc nou: cele 12 plase din Blender incarcate, 25 de mormane desenate, 4 iconite in bara de sus', JSON.stringify(m))
    await p.poza('2-joc-nou.png')
  }
  // Pauza (Spatiu): pionii nu apuca sa termine sapaturi intre tragere si numarare. Bifa se uita la LUME
  // (tickul sta pe loc) si la butonul de pauza, nu la „vreun buton apasat" — J era deja apasat (T-02).
  {
    if (NEGATIVA !== 'pauza') await p.tasta(' ')
    const t0 = await p.js('__kinstead.world.tick')
    await astepta(1500)
    const r = await p.js(`({ t: __kinstead.world.tick, buton: document.querySelector('.ui-sus button[title^="Pornește"]') !== null, modal: __kinstead.ui.modalDeschis() })`)
    bifa('pauza', r.t === t0 && r.buton && !r.modal, 'Spatiu pune pauza: tickul sta pe loc 1,5 s, butonul spune „Pornește"', `${t0} → ${r.t}; ${JSON.stringify(r)}`)
    if (NEGATIVA === 'pauza') await p.tasta(' ')
  }
  // Un patrat plat langa oameni: locul ales de `locJocNou` are o fereastra 7×7 plata in centru.
  const loc = await p.js(`(() => { const a = __kinstead.world.agents; const x = Math.floor(a.x[0] / 1000), y = Math.floor(a.y[0] / 1000); return { x, y, z: a.z[0] } })()`)
  const sol = loc.z - 1
  // Camera sus, aproape, ca celulele sa fie mari pe ecran.
  await p.js(`(() => { const K = __kinstead; K.controls.target.set(${loc.x + 0.5}, ${sol + 1}, ${loc.y + 0.5}); K.camera.position.set(${loc.x + 0.5 - 14}, ${sol + 22}, ${loc.y + 0.5 + 14}); K.controls.update(); return true })()`)
  await astepta(300)
  // --- tintirea, cu un oracol INDEPENDENT: centrul fetei de sus a celulelor plate, proiectat, fara
  // `tintaLa` in alegerea pixelului (T-11). O tinta decalata uniform ar fi compensata de `__f.pixel`.
  {
    const r = await p.js(`(() => {
      const K = __kinstead, cx = ${loc.x}, cy = ${loc.y}
      let bune = 0, total = 0, decalate = 0
      for (let x = cx - 3; x <= cx + 3; x++) for (let y = cy - 3; y <= cy + 3; y++) {
        const s = K.suprafata(x, y)
        let plat = s !== null
        for (let dx = -1; dx <= 1 && plat; dx++) for (let dy = -1; dy <= 1; dy++) if (K.suprafata(x + dx, y + dy) !== s) { plat = false; break }
        if (!plat) continue
        const q = __f.proj(x + 0.5, s + 1, y + 0.5)
        const px = Math.round(q.x), py = Math.round(q.y)
        if (document.elementFromPoint(px, py) !== K.renderer.domElement) continue
        total++
        const t = K.tintaLa(px, py, { ctrl: false, shift: false, alt: false })
        if (t.ok && t.wx === x && t.wy === y) bune++
        if (t.ok && t.wx === x + 1 && t.wy === y) decalate++
      }
      return { bune, total, decalate }
    })()`)
    bifa('tintire', r.total >= 10 && r.bune === r.total && r.decalate === 0, 'tintirea: centrul fiecarei celule plate, proiectat independent, e celula pe care o tinteste clicul', JSON.stringify(r))
  }
  // --- 4. dreptunghiul de sapat, 5×5, cu nivelul oprit: solul fiecarei coloane ---
  {
    await p.tasta('d')
    const inainte = await p.js('__f.des().length')
    const x0 = loc.x + 10, y0 = loc.y - 14
    await p.trage([x0, y0], [x0 + 4, y0 + 4], sol + 1)
    const noi = (await p.js('__f.des()')).filter((d) => d.piesa === 0 && d.wx >= x0 && d.wx <= x0 + 4 && d.wy >= y0 && d.wy <= y0 + 4)
    const astept = NEGATIVA === 'sapa' ? 26 : 25
    const afara = (await p.js('__f.des()')).filter((d) => !(d.wx >= x0 && d.wx <= x0 + 4 && d.wy >= y0 && d.wy <= y0 + 4))
    bifa('sapa', noi.length === astept && afara.length === inainte, `Sapa, dreptunghi 5×5 tras cu mouse-ul: ${astept} de sapaturi, nimic in afara lui`, `${noi.length}; in afara: ${JSON.stringify(afara.slice(0, 8))}; toast: ${await p.js('__f.toast()')}`)
    await p.poza('3-sapa.png')
  }
  // --- 5. Esc in timpul tragerii: nimic aplicat ---
  {
    const inainte = await p.js('__f.des().length')
    await p.trage([loc.x - 14, loc.y - 14], [loc.x - 10, loc.y - 10], sol + 1, [], async () => { await p.tasta('Escape') })
    const dupa = await p.js('__f.des().length')
    bifa('esc', dupa === inainte, 'Esc in timpul tragerii renunta: nicio desemnare noua', `${inainte} → ${dupa}`)
  }
  // --- 5b. clic-dreapta in timpul tragerii, CU stangul tinut (acordul de butoane al unui mouse real) ---
  {
    const inainte = await p.js('__f.des().length')
    await p.trage([loc.x - 14, loc.y - 14], [loc.x - 10, loc.y - 10], sol + 1, [], async (pb) => {
      await p.apasa(pb.x, pb.y, ['leftButtonDown'], 'right')
      await p.elibereaza(pb.x, pb.y, ['leftButtonDown'], 'right', 80)
    })
    const unu = await p.js('__f.des().length')
    // Ordinea inversa: dreapta jos, STANGUL eliberat primul, apoi dreapta.
    await p.trage([loc.x - 14, loc.y - 14], [loc.x - 10, loc.y - 10], sol + 1, [], async (pb) => {
      await p.apasa(pb.x, pb.y, ['leftButtonDown'], 'right')
      await p.elibereaza(pb.x, pb.y, ['rightButtonDown'], 'left', 80)
    })
    await p.elibereaza(0, 0, [], 'right', 200)
    const doi = await p.js('__f.des().length')
    const indiciu = await p.js(`document.querySelector('.ui-indiciu')?.textContent ?? ''`)
    bifa('dreapta', unu === inainte && doi === inainte && !/renunță/.test(indiciu), 'clic-dreapta in timpul tragerii renunta, in ambele ordini: nicio desemnare, niciun dreptunghi agatat', `${inainte} → ${unu} → ${doi}; indiciu: ${indiciu}`)
  }
  // --- 5c. o tragere pornita pe CER, sau o panoramare cu Shift eliberat primul, nu lasa o lucrare (INT-3) ---
  {
    const inainte = await p.js('__f.des().length')
    // O camera joasa, ca sus sa fie cer.
    await p.js(`(() => { const K = __kinstead; K.controls.target.set(${loc.x + 0.5}, ${sol + 1}, ${loc.y + 0.5}); K.camera.position.set(${loc.x + 0.5 - 22}, ${sol + 7}, ${loc.y + 0.5 + 22}); K.controls.update(); return true })()`)
    await astepta(300)
    const tinta = await p.js(`__f.pixel(${loc.x - 2}, ${loc.y - 2}, ${sol + 1})`)
    // Cerul: primul pixel de canvas de sus in jos pe care clicul nu tinteste nimic.
    const cer = await p.js(`(() => { for (let y = 5; y < 200; y += 5) { if (document.elementFromPoint(640, y) !== __kinstead.renderer.domElement) continue; if (!__kinstead.tintaLa(640, y, { ctrl: false, shift: false, alt: false }).ok) return { x: 640, y } } return null })()`)
    if (cer !== null && tinta !== null) {
      await p.muta(cer.x, cer.y)
      await p.apasa(cer.x, cer.y)
      for (let i = 1; i <= 6; i++) await p.muta(cer.x + (tinta.x - cer.x) * i / 6, cer.y + (tinta.y - cer.y) * i / 6, ['leftButtonDown'], 'left')
      await p.elibereaza(tinta.x, tinta.y)
    }
    const dupaCer = await p.js('__f.des().length')
    // Shift+tragere panoreaza camera; Shift se elibereaza INAINTEA butonului.
    await p.muta(tinta.x, tinta.y, ['shift'])
    await p.apasa(tinta.x, tinta.y, ['shift'])
    for (let i = 1; i <= 6; i++) await p.muta(tinta.x + 10 * i, tinta.y, ['shift', 'leftButtonDown'], 'left')
    await p.muta(tinta.x + 60, tinta.y, ['leftButtonDown'], 'left')
    await p.elibereaza(tinta.x + 60, tinta.y)
    const dupaShift = await p.js('__f.des().length')
    bifa('clic-scapat', cer !== null && dupaCer === inainte && dupaShift === inainte, 'apasat pe cer si tras pe teren, sau Shift eliberat primul: nicio lucrare sub cursor', `${inainte} → ${dupaCer} → ${dupaShift}; cer ${JSON.stringify(cer)}`)
    await p.js(`(() => { const K = __kinstead; K.controls.target.set(${loc.x + 0.5}, ${sol + 1}, ${loc.y + 0.5}); K.camera.position.set(${loc.x + 0.5 - 14}, ${sol + 22}, ${loc.y + 0.5 + 14}); K.controls.update(); return true })()`)
  }
  // --- 6. conturul de perete 7×7 ---
  {
    await p.tasta('c')
    const x0 = loc.x + 10, y0 = loc.y + 10
    await p.trage([x0, y0], [x0 + 6, y0 + 6], sol + 1)
    const pereti = (await p.js('__f.des()')).filter((d) => d.piesa === 1 && d.wx >= x0 && d.wx <= x0 + 6 && d.wy >= y0 && d.wy <= y0 + 6)
    const interior = pereti.filter((d) => d.wx > x0 && d.wx < x0 + 6 && d.wy > y0 && d.wy < y0 + 6)
    bifa('perete', pereti.length === 24 && interior.length === 0, 'Construieste perete, dreptunghi 7×7: 24 de piese, doar pe contur', `${pereti.length}, ${interior.length} in interior; toast: ${await p.js('__f.toast()')}`)
    await p.poza('4-perete.png')
  }
  // --- 6b. doua dreptunghiuri, al doilea eliberat cat primul inca se aplica feliat (INT-4) ---
  {
    await p.tasta('d')
    const inainte = await p.js('__f.des().length')
    // 40×40 = 1.600 de comenzi (patru felii de 512), departe de inelul de mormane (6..36 in jurul startului).
    const A = [loc.x + 45, loc.y - 20], B = [loc.x + 84, loc.y + 19]
    const C = [loc.x + 50, loc.y + 23], D = [loc.x + 54, loc.y + 27]
    await p.js(`__f.centreaza(${loc.x + 65}, ${loc.y + 3}, ${sol + 1}, 42)`)
    await astepta(400)
    const px = await p.js(`[${JSON.stringify(A)}, ${JSON.stringify(B)}, ${JSON.stringify(C)}, ${JSON.stringify(D)}].map(([x, y]) => __f.pixel(x, y, ${sol + 1}))`)
    if (px.some((x) => x === null)) bifa('doua-dreptunghiuri', false, 'doua dreptunghiuri la rand: pixelii colturilor', JSON.stringify(px))
    else {
      const [pa, pb, pc, pd] = px
      // Al doilea dreptunghi vine fara pauza: cu codul vechi, eliberarea lui taia felii din primul.
      await p.muta(pa.x, pa.y, [], undefined, 20)
      await p.apasa(pa.x, pa.y, [], 'left', 20)
      for (let i = 1; i <= 4; i++) await p.muta(pa.x + (pb.x - pa.x) * i / 4, pa.y + (pb.y - pa.y) * i / 4, ['leftButtonDown'], 'left', 15)
      await p.elibereaza(pb.x, pb.y, [], 'left', 5)
      await p.muta(pc.x, pc.y, [], undefined, 5)
      await p.apasa(pc.x, pc.y, [], 'left', 5)
      for (let i = 1; i <= 3; i++) await p.muta(pc.x + (pd.x - pc.x) * i / 3, pc.y + (pd.y - pc.y) * i / 3, ['leftButtonDown'], 'left', 5)
      await p.elibereaza(pd.x, pd.y, [], 'left', 1200)
      const toate = await p.js('__f.des()')
      const inA = toate.filter((d) => d.piesa === 0 && d.wx >= A[0] && d.wx <= B[0] && d.wy >= A[1] && d.wy <= B[1]).length
      const inC = toate.filter((d) => d.piesa === 0 && d.wx >= C[0] && d.wx <= D[0] && d.wy >= C[1] && d.wy <= D[1]).length
      const toasturi = await p.js(`[...document.querySelectorAll('.ui-toast')].map((t) => t.textContent)`)
      const cuAnuleaza = toasturi.filter((t) => t.includes('Anulează')).length
      // Pe teren strain pot fi cateva coloane refuzate (apa, margini); o felie taiata inseamna sute.
      bifa('doua-dreptunghiuri', inA >= 1500 && inC >= 20 && cuAnuleaza >= 2, 'doua dreptunghiuri la rand: primul (1.600) nu e taiat de al doilea, iar fiecare isi pastreaza „Anulează"', `${inainte} → +${inA} +${inC}; toasturi: ${JSON.stringify(toasturi)}`)
    }
    await p.js(`(() => { const K = __kinstead; K.controls.target.set(${loc.x + 0.5}, ${sol + 1}, ${loc.y + 0.5}); K.camera.position.set(${loc.x + 0.5 - 14}, ${sol + 22}, ${loc.y + 0.5 + 14}); K.controls.update(); return true })()`)
    await astepta(300)
  }
  // --- 7. depozitul 4×4 ---
  {
    await p.tasta('k')
    const inainte = await p.js('__f.zone()')
    await p.trage([loc.x - 14, loc.y + 10], [loc.x - 11, loc.y + 13], sol + 1)
    const dupa = await p.js('__f.zone()')
    bifa('depozit', dupa - inainte === 16, 'Zone ▸ Depozit, dreptunghi 4×4: 16 celule de zona', `${inainte} → ${dupa}; toast: ${await p.js('__f.toast()')}; unealta ${await p.js('__kinstead.ui.unealta')}`)
  }
  // --- 7b. Z+trage cu Z eliberat inaintea butonului: tot depozit, ca in previzualizare (INT-11) ---
  {
    await p.js('__kinstead.ui.zonaFel = 1; true')
    await p.tasta('v')
    const inainte = (await p.js('__f.zoneFel()')).map((z) => z.id)
    p.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'z' })
    await astepta(80)
    await p.trage([loc.x - 20, loc.y + 10], [loc.x - 17, loc.y + 13], sol + 1, [], async () => { p.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'z' }); await astepta(80) })
    const noi = (await p.js('__f.zoneFel()')).filter((z) => !inainte.includes(z.id))
    bifa('z-eliberat', noi.length === 1 && noi[0].fel === 0, 'Z+trage cu Z eliberat primul: un DEPOZIT, cum arata previzualizarea', JSON.stringify(noi))
    await p.js('__kinstead.ui.zonaFel = 0; true')
  }
  // --- 8. Selecteaza un om: inspectorul are numele lui ---
  {
    await p.tasta('v')
    const pion = await p.js(`(() => { const L = __kinstead.agentLayer; const m = L.mesh; const e = new Float32Array(16); m.instanceMatrix.array.slice(0, 16).forEach((v, i) => { e[i] = v }); const a = __kinstead.world.agents; return { x: e[12], y: e[13] + 0.7, z: e[14], id: a.id[L.sloturi[0]] } })()`)
    const s = await p.js(`__f.proj(${pion.x}, ${pion.y}, ${pion.z})`)
    await p.click(s.x, s.y)
    await astepta(400)
    const r = await p.js(`({ h2: document.querySelector('.ui-inspector h2')?.textContent ?? null, sel: __kinstead.ui.pionSelectat() })`)
    bifa('inspector', r.sel === pion.id && typeof r.h2 === 'string' && r.h2.length > 3, 'Selecteaza + clic pe un om: inspectorul lui, cu numele', JSON.stringify(r))
    await p.poza('5-inspector.png')
    // --- 8b. urmareste-l, apoi randul ALTUI om din Oameni: camera merge la al doilea si ramane (INT-5) ---
    await p.js(`[...document.querySelectorAll('.ui-inspector button')].find((b) => b.title === 'Camera îl urmărește')?.click(); true`)
    await astepta(600)
    await p.tasta('o')
    await astepta(500)
    // Randurile pe rand, pana la primul om care nu e cel urmarit (jocul e in pauza: nimeni nu se misca).
    const bid = await p.js(`(async () => { for (const tr of document.querySelectorAll('.ui-oameni tbody tr')) { tr.click(); await new Promise((r) => setTimeout(r, 60)); const s = __kinstead.ui.pionSelectat(); if (s !== null && s !== ${pion.id}) return s } return null })()`)
    const b = bid === null ? null : await p.js(`(() => { const a = __kinstead.world.agents; for (let i = 0; i < a.count; i++) if (a.alive[i] && a.id[i] === ${bid}) return { id: ${bid}, slot: i }; return null })()`)
    let r2 = null
    if (b !== null) {
      await astepta(2500)
      r2 = await p.js(`(() => { const a = __kinstead.world.agents, K = __kinstead, i = ${b.slot}; return { d: Math.hypot(a.x[i] / 1000 - K.controls.target.x, a.y[i] / 1000 - K.controls.target.z), sel: __kinstead.ui.pionSelectat() } })()`)
    }
    bifa('du-ma', b !== null && r2 !== null && r2.d < 1.5 && r2.sel === b.id, 'cu un om urmarit, clic pe randul altuia: camera ramane la al doilea', JSON.stringify({ b, r2 }))
    await p.tasta('o')
  }
  // --- 9. Ctrl+S: EXACT o salvare noua, a lumii de acum; viteza 3× si pauza se regasesc la incarcare ---
  let salvare = null
  {
    // Viteza 3× (porneste simularea), apoi pauza: salvarea poarta viteza, iar jocul e oprit la salvare.
    await p.tasta('3')
    await p.tasta(' ')
    await astepta(300)
    const s0 = await p.js('__kinstead.stabOverlay.visible')
    const inainte = (await p.js('__f.salvari()')).filter((s) => !s.id.startsWith('auto'))
    const tick = await p.js('__kinstead.world.tick')
    if (NEGATIVA !== 'salvare') await p.tasta('s', ['control'])
    await astepta(1200)
    const s1 = await p.js('__kinstead.stabOverlay.visible')
    const dupa = (await p.js('__f.salvari()')).filter((s) => !s.id.startsWith('auto'))
    const noi = dupa.filter((s) => !inainte.some((x) => x.id === s.id))
    salvare = noi.length === 1 && noi[0].tick === tick ? noi[0] : null
    bifa('salvare', s0 === s1 && salvare !== null, 'Ctrl+S: exact o salvare noua, cu tickul lumii de acum; stabilitatea nu se comuta', JSON.stringify({ s0, s1, inainte: inainte.length, noi, tick }))
  }
  const desInainte = await p.js('__f.des().length')
  const pioniInainte = await p.js('__f.pioni()')
  // --- 9b. plecarea dintr-un joc nesalvat cere confirmare (INT-6): tick-ul inaintat dupa salvare ---
  {
    await p.tasta(' ')
    await astepta(800)
    await p.tasta(' ')
    const inainte = plecariOprite
    const t = await pagina('?verificare=1&pauza=1')
    bifa('plecare', plecariOprite === inainte + 1, 'plecarea dintr-un joc cu tickuri nesalvate cere confirmare (beforeunload)', `${inainte} → ${plecariOprite}`)
    void t
  }
  if (salvare !== null) {
    const q = await pagina(`?incarca=${encodeURIComponent(salvare.id)}`)
    const r = await q.js(`({ mod: __kinstead.mod, tick: __kinstead.world.tick, des: __f.des().length, pioni: __f.pioni() })`)
    bifa('incarca-lumea', r.mod === 'incarca' && r.tick === salvare.tick && r.pioni.c === pioniInainte.c, 'incarcarea: aceeasi lume (tick, oameni)', JSON.stringify({ r, salvat: salvare.tick, pioniInainte }))
    bifa('incarca-desemnari', r.des === desInainte, 'incarcarea: aceleasi desemnari (jocul era in pauza la salvare)', `${desInainte} → ${r.des}`)
    // INT-9: jocul incarcat porneste IN PAUZA, cu viteza salvata (3×).
    await astepta(1000)
    const r2 = await q.js(`({ tick: __kinstead.world.tick, stare: __kinstead.stare ? __kinstead.stare() : null })`)
    bifa('incarca-pauza', r2.stare?.pauza === true && r2.stare?.viteza === 3 && r2.tick === salvare.tick, 'incarcarea porneste in pauza, cu viteza salvata (3×)', JSON.stringify(r2))
    // --- 10. tastele tastate intr-un camp nu comanda nimic ---
    await q.tasta('Escape')
    const deschis = await q.js(`!!document.querySelector('.ui-fereastra')`)
    await q.js(`[...document.querySelectorAll('.ui-fereastra button')].find((b) => b.textContent.startsWith('Joc nou'))?.click(); true`)
    await astepta(200)
    await q.js(`document.querySelector('.ui-fereastra input[name=seed]').focus(); true`)
    const ov0 = await q.js(`[__kinstead.stabOverlay.visible, __kinstead.jobOverlay.visible, document.getElementById('slice').textContent]`)
    for (const k of ['s', 'j', 'q', 't', ' ']) await q.tasta(k)
    const ov1 = await q.js(`[__kinstead.stabOverlay.visible, __kinstead.jobOverlay.visible, document.getElementById('slice').textContent]`)
    bifa('camp-text', deschis && JSON.stringify(ov0) === JSON.stringify(ov1), 'literele tastate in campul „Sămânța lumii" nu comuta nimic', JSON.stringify({ deschis, ov0, ov1 }))
    await q.poza('6-joc-nou-dialog.png')
    // Esc pana nu mai e nicio fereastra (Esc fara fereastra deschide meniul). Intai focusul iese din
    // campul de text: acolo Esc nu face nimic (garda de camp, taste.ts).
    await q.js('document.activeElement?.blur(); true')
    for (let i = 0; i < 4 && await q.js('__kinstead.ui.modalDeschis()'); i++) await q.tasta('Escape')
    // --- 10b. B (amprenta) stinge Planul cat e aprinsa, si il reaprinde la iesire (V4) ---
    const j0 = await q.js('__kinstead.jobOverlay.visible')
    const inainteB = await q.js(`({ modal: __kinstead.ui.modalDeschis(), focus: document.activeElement?.tagName ?? null })`)
    await q.tasta('b')
    const j1 = await q.js('__kinstead.jobOverlay.visible')
    await q.tasta('b')
    const j2 = await q.js('__kinstead.jobOverlay.visible')
    bifa('amprenta-plan', j0 && !j1 && j2, 'B stinge Planul cat e aprinsa amprenta, si il reaprinde la iesire', JSON.stringify({ j: [j0, j1, j2], inainteB }))
    // --- 10c. jocul incarcat se salveaza singur, in slotul LUMII lui (auto-7), nu in „auto" ---
    await q.js('__kinstead.world.tick += 20 * 60 * 7; true')
    await astepta(1500)
    const auto = (await q.js('__f.salvari()')).filter((s) => s.id.startsWith('auto')).map((s) => s.id)
    bifa('automata-pe-lume', auto.length === 1 && auto[0] === 'auto-7', 'salvarea automata a jocului incarcat: slotul lumii lui (auto-7)', JSON.stringify(auto))
    if (q.erori.length) bifa('consola-incarcat', false, 'fara erori in consola (pagina incarcata)', q.erori.join(' | '))
  }
  if (p.erori.length) bifa('consola-joc-nou', false, 'fara erori in consola (jocul nou)', p.erori.join(' | '))
}
