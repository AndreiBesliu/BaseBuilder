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
 * 26; pauza: Spatiu nu se apasa; salvare: Ctrl+S nu se apasa; desen: casa zidita din JS nu primeste
 * clipa fara pauza in care se redeseneaza — „casa-desenata" rosie; exceptie: pasul „joc-nou" arunca —
 * bifa pasului rosie SI rularea ajunge la „depozit"), iar rularea iese cu 0 DOAR daca exact bifa aceea
 * e rosie. Inainte, orice rosu trecea proba — si o bifa care nu putea iesi rosie (pauza) nu se vedea
 * (recenzia UI-ului, T-02).
 *
 * Fiecare pas ruleaza in `pas()`: o exceptie e o bifa ROSIE cu numele pasului, nu sfarsitul rularii
 * (recenzia incaperilor, ECR-10).
 *
 * Profilul (IndexedDB) e NOU la fiecare rulare: pe un profil refolosit, salvarea din rularea trecuta
 * facea bifele Ctrl+S si incarcarea verzi si cu salvarea stricata (recenzia UI-ului, T-01).
 *
 *   npm run viewer            (in alt terminal; sau `npm run viewer:preview` pe build)
 *   node_modules/electron/dist/electron.exe bench/ui-fum.mjs http://localhost:5175/ [--proba-negativa[=sapa|pauza|salvare|desen|exceptie]] [--poze=<dosar>]
 *
 * NU e o masuratoare de cadre si nu intra in gate: offscreen + fara throttling e exact ce protocolul
 * de gate interzice (bench/GATE.md §5b). E o proba de COMPORTAMENT.
 */
import { app, BrowserWindow, session } from 'electron'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(process.defaultApp ? 2 : 1)
/** Radacina repo-ului, pentru importurile din pagina (serverul Vite le da pe `/@fs/`). */
const REPO = fileURLToPath(new URL('..', import.meta.url)).replaceAll('\\', '/').replace(/\/$/, '')
const BAZA = (argv.find((a) => /^https?:\/\//.test(a)) ?? 'http://localhost:5175/').replace(/\/?$/, '/')
const NEG = argv.find((a) => a.startsWith('--proba-negativa'))
const NEGATIVA = NEG === undefined ? null : NEG.includes('=') ? NEG.slice(NEG.indexOf('=') + 1) : 'sapa'
if (NEGATIVA !== null && !['sapa', 'pauza', 'salvare', 'desen', 'exceptie'].includes(NEGATIVA)) { console.log(`proba negativa necunoscuta: ${NEGATIVA}`); process.exit(2) }
const POZE = argv.find((a) => a.startsWith('--poze='))?.slice('--poze='.length) ?? null
const W = 1280
const H = 720
const astepta = (ms) => new Promise((r) => setTimeout(r, ms))

const bife = []
function bifa(id, ok, ce, cifra = '') {
  bife.push({ id, ok, ce })
  console.log(`${ok ? 'OK  ' : 'ROSU'} [${id}] ${ce}${cifra !== '' ? ` — ${cifra}` : ''}`)
}

/**
 * Un pas al probei, cu bifele lui. O exceptie intr-un pas e o bifa ROSIE cu numele pasului, iar proba merge
 * mai departe: pe un server cu radacina gresita, „mormane-pe-sol" arunca si 31 de bife nu mai rulau,
 * printre ele cele noi ale feliei (recenzia incaperilor, ECR-10). Bifele date inainte de exceptie raman.
 */
async function pas(id, f) {
  try {
    await f()
  } catch (e) {
    bifa(id, false, 'EXCEPTIE — pasul s-a oprit aici, proba merge mai departe', String(e?.stack ?? e?.message ?? e).split('\n').slice(0, 4).join(' | '))
  }
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
      // „exceptie": bifa pasului e rosie SI rularea a mers mai departe (a ajuns la „depozit").
      const id = NEGATIVA === 'exceptie' ? 'joc-nou' : NEGATIVA === 'desen' ? 'casa-desenata' : NEGATIVA
      const tinta = rosii.some((b) => b.id === id) && (NEGATIVA !== 'exceptie' || bife.some((b) => b.id === 'depozit'))
      console.log(`proba negativa „${NEGATIVA}": bifa ei (${id}) ${tinta ? 'E rosie (instrumentul poate produce rosu acolo)' : 'NU e rosie — instrumentul e orb acolo'}; rosii: ${rosii.map((b) => b.id).join(', ') || 'niciuna'}`)
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
  await pas('gate', async () => {
    const p = await pagina('?scenario=dig&ballast=1&warmup=0&frames=1000000')
    const r = await p.js(`({ ui: !!document.querySelector('[data-ui]'), stil: [...document.styleSheets].some((s) => { try { return [...s.cssRules].some((x) => x.cssText.includes('ui-sus')) } catch { return false } }), hud: !document.getElementById('hud').hidden, mormane: __kinstead.stratResurse !== null })`)
    bifa('gate', !r.ui && !r.stil && r.hud && !r.mormane, 'pagina de gate: niciun [data-ui], niciun stil al UI-ului, niciun strat de mormane, HUD-ul vizibil', JSON.stringify(r))
  })
  // --- 2. ecranul de titlu; demo-ul de sub el nu scrie salvarea automata (INT-1) ---
  await pas('titlu', async () => {
    const p = await pagina('')
    const r = await p.js(`({ titlu: !!document.querySelector('.ui-titlu'), butoane: document.querySelectorAll('.ui-titlu button').length, hud: document.getElementById('hud').hidden, mod: __kinstead.mod })`)
    bifa('titlu', r.titlu && r.butoane === 4 && r.hud, 'fara parametri: ecranul de titlu cu 4 butoane, HUD-ul ascuns', JSON.stringify(r))
    await p.poza('1-titlu.png')
    // Ajutorul deschis de pe titlu: „Înapoi" si Esc duc la titlu, nu in demo (ECR-8).
    await p.js(`[...document.querySelectorAll('.ui-titlu button')].find((b) => b.textContent === 'Ajutor')?.click(); true`)
    await astepta(200)
    const inapoi = await p.js(`(() => { const b = [...document.querySelectorAll('.ui-fereastra button')].find((x) => x.textContent === 'Înapoi'); b?.click(); return !!b })()`)
    await astepta(200)
    const dupaInapoi = await p.js(`!!document.querySelector('.ui-titlu')`)
    await p.js(`[...document.querySelectorAll('.ui-titlu button')].find((b) => b.textContent === 'Ajutor')?.click(); true`)
    await astepta(200)
    await p.tasta('Escape')
    const dupaEsc = await p.js(`!!document.querySelector('.ui-titlu')`)
    bifa('ajutor-titlu', inapoi && dupaInapoi && dupaEsc, 'Ajutorul deschis de pe titlu: „Înapoi" si Esc duc la titlu', JSON.stringify({ inapoi, dupaInapoi, dupaEsc }))
    // Peste intervalul salvarii automate si peste minutul de asteptare: la 5 + 1 minute de joc, demo-ul
    // scria „auto" peste jocul jucatorului. Timpul se sare (`tick`), nu se asteapta 6 minute.
    await p.js('__kinstead.world.tick += 20 * 60 * 7; true')
    await astepta(1500)
    const auto = (await p.js('__f.salvari()')).filter((s) => s.id.startsWith('auto'))
    bifa('titlu-fara-automata', auto.length === 0, 'demo-ul de sub ecranul de titlu nu scrie nicio salvare automata', JSON.stringify(auto))
  })
  // --- 3. jocul nou ---
  const p = await pagina('?joc=nou&seed=7&oameni=6&piatra=400&hrana=1380')
  await pas('joc-nou', async () => {
    const r = await p.js(`({ pioni: __f.pioni(), piatra: __f.marfa(0), hrana: __f.marfa(3), pasi: !document.querySelector('.ui-pasi').hidden, planul: __kinstead.jobOverlay.visible, mod: __kinstead.mod })`)
    bifa('joc-nou-oameni', r.pioni.c === 6 && r.pioni.j === 0, 'joc nou: 6 colonisti, 0 jefuitori', JSON.stringify(r.pioni))
    bifa('joc-nou-marfa', r.piatra === 400 && r.hrana === 1380, 'joc nou: 400 de piatra si 1380 de hrana in mormane', `${r.piatra} / ${r.hrana}`)
    bifa('joc-nou-pasi', r.pasi && r.planul, 'joc nou: Primii pasi vizibili, Planul (J) aprins', JSON.stringify({ pasi: r.pasi, planul: r.planul }))
    if (NEGATIVA === 'exceptie') throw new Error('proba negativa: o exceptie in pasul „joc-nou"')
    // Mormanele din Blender: 400 de piatra = 5×75 + 25, 1380 de hrana = 18×75 + 30 ⇒ 25 de mormane pe ecran.
    await astepta(1500)
    const m = await p.js(`({ plase: __kinstead.stratResurse?.plase?.size ?? 0, desenate: __kinstead.stratResurse?.desenate ?? -1, eroare: __kinstead.stratResurse?.eroare ?? null, icoane: [...document.querySelectorAll('.ui-res img')].filter((i) => i.naturalWidth === 128).length })`)
    bifa('mormane', m.plase === 12 && m.desenate === 25 && m.eroare === null && m.icoane === 4, 'joc nou: cele 12 plase din Blender incarcate, 25 de mormane desenate, 4 iconite in bara de sus', JSON.stringify(m))
    // Baza fiecarui morman pe fata DESENATA a terenului: o raza verticala pe mesh-urile de teren (three
    // din pagina), comparata cu cota instantei — oracolul nu trece prin functia testata (ECR-1).
    const sol = await p.js(`(async () => {
      const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => /deps\\/three\\.js/.test(n))
      if (!url) return { n: -1, url: null }
      const T = await import(url)
      const K = __kinstead
      const teren = [...K.meshes.values()]
      const rc = new T.Raycaster(), jos = new T.Vector3(0, -1, 0), mat = new T.Matrix4(), v = new T.Vector3()
      let n = 0, maxim = 0
      const rele = []
      for (const im of K.stratResurse.plase.values()) for (let k = 0; k < im.count; k++) {
        im.getMatrixAt(k, mat); v.setFromMatrixPosition(mat)
        rc.set(new T.Vector3(v.x, v.y + 6, v.z), jos); rc.far = 30
        const h = rc.intersectObjects(teren, false)[0]
        if (!h) continue
        n++
        const d = Math.abs(h.point.y - v.y)
        if (d > maxim) maxim = d
        if (d > 0.02) rele.push([Math.floor(v.x), Math.floor(v.z), +(h.point.y - v.y).toFixed(3)])
      }
      return { n, maxim: +maxim.toFixed(4), rele: rele.slice(0, 6) }
    })()`)
    if (sol.n === -1) console.log('(fara bifa „mormane-pe-sol": three nu se poate importa separat pe un build de productie)')
    else bifa('mormane-pe-sol', sol.n === 25 && sol.rele.length === 0, 'joc nou: fiecare morman sta pe fata desenata a terenului (cel mult 2 cm)', JSON.stringify(sol))
    await p.poza('2-joc-nou.png')
  })
  // Pauza (Spatiu): pionii nu apuca sa termine sapaturi intre tragere si numarare. Bifa se uita la LUME
  // (tickul sta pe loc) si la butonul de pauza, nu la „vreun buton apasat" — J era deja apasat (T-02).
  await pas('pauza', async () => {
    if (NEGATIVA !== 'pauza') await p.tasta(' ')
    const t0 = await p.js('__kinstead.world.tick')
    await astepta(1500)
    const r = await p.js(`({ t: __kinstead.world.tick, buton: document.querySelector('.ui-sus button[title^="Pornește"]') !== null, modal: __kinstead.ui.modalDeschis() })`)
    bifa('pauza', r.t === t0 && r.buton && !r.modal, 'Spatiu pune pauza: tickul sta pe loc 1,5 s, butonul spune „Pornește"', `${t0} → ${r.t}; ${JSON.stringify(r)}`)
    if (NEGATIVA === 'pauza') await p.tasta(' ')
  })
  // Bara de sus (design temperatura v2, §6; panoul, L5-4): la latimea minima a UI-ului (LATIME_UI = 1.100 px)
  // si cu doua insigne, nimic nu iese din bara. Inainte, cu marca KINSTEAD si timpul total, grupul Pauza ajungea
  // la x = 1.142 (masurat de panou), iar calendarul din v1 ar fi depasit cu 255 px. Se masoara si cel mai lat text
  // pe care il poate scrie calendarul in fiecare anotimp (extremele climei, pe seed-ul lumii), nu doar cel de
  // acum: tickul probei e mereu toamna. Insignele se pun in DOM si se scot la loc; lumea nu se atinge.
  await pas('bara-sus', async () => {
    p.win.setContentSize(1100, H)
    await astepta(700)
    const r = await p.js(`(async () => {
      const sus = document.querySelector('.ui-sus')
      const cal = sus.querySelector('.ui-calendar') ?? sus.querySelector('.ui-timp')
      const ins = sus.querySelector('.ui-res[title^="Oamenii"] > span:last-child')
      const inainte = [...ins.childNodes]
      ins.replaceChildren(...[['atentie', '3 flămânzi'], ['atentie', '2 obosiți']].map(([c, t]) => { const e = document.createElement('span'); e.className = 'ui-insigna ' + c; e.textContent = t; return e }))
      const vechi = cal.textContent
      const texte = [vechi]
      let variante = 'niciuna'
      let asteptat = null
      try {
        const T = await import('/@fs/${REPO}/viewer/ui/texte.ts')
        const Cl = await import('/@fs/${REPO}/src/sim/clima.ts')
        const Ca = await import('/@fs/${REPO}/src/sim/calendar.ts')
        const R = __kinstead.rules ?? (await import('/@fs/${REPO}/src/sim/content.ts')).DEFAULT_RULES
        const seed = __kinstead.world.seed
        const ext = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]]
        for (let t = 0; t < Ca.tickuriPeAn(R); t += 28) {
          const a = Ca.momentul(t, R).anotimp, v = Cl.tAfara(seed, t, R)
          ext[a][0] = Math.min(ext[a][0], v); ext[a][1] = Math.max(ext[a][1], v)
        }
        for (let a = 0; a < 4; a++) for (const v of ext[a]) for (const d of [-65536, 0, 65536]) {
          texte.push(T.textCalendar({ anotimp: a, zi: R.calendar.zilePeAnotimp, ora: 23, minut: 59 }, R.calendar.zilePeAnotimp, v, d))
        }
        variante = ext.map(([mn, mx]) => Math.round(mn / 65536) + '..' + Math.round(mx / 65536)).join(' | ')
        // Ce TREBUIE sa scrie bara acum: aceeasi compunere ca panouri.ts (baraDeSus), la tickul si seed-ul lumii.
        asteptat = { tick: __kinstead.world.tick, ...T.baraDeSus(__kinstead.world.tick, seed, R, __kinstead.stare().viteza) }
      } catch (e) { variante = 'fara calendar: ' + String(e?.message ?? e).slice(0, 80) }
      const masuri = []
      for (const t of texte) {
        cal.textContent = t
        const c = cal.getBoundingClientRect()
        const ultim = sus.lastElementChild.getBoundingClientRect()
        const spatiu = sus.querySelector('.spatiu')?.getBoundingClientRect().width ?? 0
        masuri.push({ t, sw: sus.scrollWidth, cw: sus.clientWidth, lat: +c.width.toFixed(1), inalt: Math.round(c.height), dreapta: Math.round(ultim.right), rezerva: Math.round(spatiu) })
      }
      cal.textContent = vechi
      ins.replaceChildren(...inainte)
      const lat = masuri.reduce((a, m) => (m.lat > a.lat ? m : a), masuri[0])
      const ingust = masuri.reduce((a, m) => (m.lat < a.lat ? m : a), masuri[0])
      const rele = masuri.filter((m) => !(m.sw <= m.cw && m.dreapta <= m.cw && m.inalt <= 20))
      return { latime: innerWidth, marca: !!sus.querySelector('.ui-marca'), cate: masuri.length, variante, acum: masuri[0], celMaiLat: lat, celMaiIngust: ingust, rele: rele.slice(0, 4), titlu: cal.title, text: vechi, asteptat }
    })()`)
    p.win.setContentSize(W, H)
    await astepta(700)
    // Si bara nu se misca atunci cand se schimba textul: calendarul are aceeasi latime pentru oricare din ele.
    bifa('bara-sus', r.latime === 1100 && !r.marca && r.cate >= 25 && r.rele.length === 0 && r.celMaiLat.lat - r.celMaiIngust.lat <= 1,
      'bara de sus la 1.100 px, cu 2 insigne si cu cel mai lat calendar al fiecarui anotimp: nimic nu iese din bara, calendarul e pe un rand, de aceeasi latime pentru orice text, fara marca KINSTEAD',
      JSON.stringify({ latime: r.latime, marca: r.marca, cate: r.cate, variante: r.variante, acum: r.acum, celMaiLat: r.celMaiLat, celMaiIngust: r.celMaiIngust, rele: r.rele }))
    // EXACT ce scrie baraDeSus la tickul lumii (recenzia t.2a, L2-3), nu doar formatul: regexul de dinainte accepta prin
    // constructie o sageata inversata, tooltip-ul din iarna socotit pana la urmatoarea iarna si clima altei lumi.
    bifa('bara-sus-calendar', r.asteptat !== null && r.text === r.asteptat.text && r.titlu === r.asteptat.titlu
      && /^(Primăvară|Vară|Toamnă|Iarnă) \d+\/\d+ · \d\d:\d\d · −?\d+° [↗↘→]$/.test(r.text) && /^Iarna (în|într-o|se termină) .+ \(≈ .+ la [123]×\) · timp de joc \d+:\d\d:\d\d$/.test(r.titlu),
      'calendarul din bara si tooltip-ul lui sunt EXACT baraDeSus(tickul lumii, seed-ul ei, viteza) („Toamnă 1/4 · 08:00 · 15° ↗" / „Iarna în 3 zile (≈ 2 h 03 min la 1×) · timp de joc 0:00:02")', JSON.stringify({ text: r.text, titlu: r.titlu, asteptat: r.asteptat }))
  })
  // Primul Q porneste nivelul la solul de sub camera (ECR-5), nu in varful ferestrei.
  await pas('primul-q', async () => {
    await p.tasta('r')
    await p.tasta('q')
    await astepta(400)
    const rel = await p.js(`document.querySelector('.ui-nivel .rel')?.textContent ?? ''`)
    await p.tasta('r')
    bifa('primul-q', /^(la sol|sol \+1)$/.test(rel), 'primul Q: nivelul la solul de sub camera', rel)
    // La 1280×720, marimile 125% si 150% nu incap: nu se pot alege (ECR-3).
    await p.tasta('Escape')
    const marimi = await p.js(`[...document.querySelectorAll('.ui-fereastra button')].filter((b) => /^\\d+%$/.test(b.textContent)).map((b) => ({ t: b.textContent, off: b.disabled, ales: b.getAttribute('aria-pressed') }))`)
    await p.tasta('Escape')
    bifa('marimi', marimi.length === 3 && !marimi[0].off && marimi[0].ales === 'true' && marimi[1].off && marimi[2].off, 'la 1280×720: 100% ales, 125% si 150% dezactivate (nu incap)', JSON.stringify(marimi))
  })
  // Un patrat plat langa oameni: locul ales de `locJocNou` are o fereastra 7×7 plata in centru.
  const loc = await p.js(`(() => { const a = __kinstead.world.agents; const x = Math.floor(a.x[0] / 1000), y = Math.floor(a.y[0] / 1000); return { x, y, z: a.z[0] } })()`)
  const sol = loc.z - 1
  // Camera sus, aproape, ca celulele sa fie mari pe ecran.
  await p.js(`(() => { const K = __kinstead; K.controls.target.set(${loc.x + 0.5}, ${sol + 1}, ${loc.y + 0.5}); K.camera.position.set(${loc.x + 0.5 - 14}, ${sol + 22}, ${loc.y + 0.5 + 14}); K.controls.update(); return true })()`)
  await astepta(300)
  // --- tintirea, cu un oracol INDEPENDENT: centrul fetei de sus a celulelor plate, proiectat, fara
  // `tintaLa` in alegerea pixelului (T-11). O tinta decalata uniform ar fi compensata de `__f.pixel`.
  await pas('tintire', async () => {
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
  })
  // --- 4. dreptunghiul de sapat, 5×5, cu nivelul oprit: solul fiecarei coloane ---
  await pas('sapa', async () => {
    await p.tasta('d')
    const inainte = await p.js('__f.des().length')
    const x0 = loc.x + 10, y0 = loc.y - 14
    await p.trage([x0, y0], [x0 + 4, y0 + 4], sol + 1)
    const noi = (await p.js('__f.des()')).filter((d) => d.piesa === 0 && d.wx >= x0 && d.wx <= x0 + 4 && d.wy >= y0 && d.wy <= y0 + 4)
    const astept = NEGATIVA === 'sapa' ? 26 : 25
    const afara = (await p.js('__f.des()')).filter((d) => !(d.wx >= x0 && d.wx <= x0 + 4 && d.wy >= y0 && d.wy <= y0 + 4))
    bifa('sapa', noi.length === astept && afara.length === inainte, `Sapa, dreptunghi 5×5 tras cu mouse-ul: ${astept} de sapaturi, nimic in afara lui`, `${noi.length}; in afara: ${JSON.stringify(afara.slice(0, 8))}; toast: ${await p.js('__f.toast()')}`)
    await p.poza('3-sapa.png')
  })
  // --- 5. Esc in timpul tragerii: nimic aplicat ---
  await pas('esc', async () => {
    const inainte = await p.js('__f.des().length')
    await p.trage([loc.x - 14, loc.y - 14], [loc.x - 10, loc.y - 10], sol + 1, [], async () => { await p.tasta('Escape') })
    const dupa = await p.js('__f.des().length')
    bifa('esc', dupa === inainte, 'Esc in timpul tragerii renunta: nicio desemnare noua', `${inainte} → ${dupa}`)
  })
  // --- 5b. clic-dreapta in timpul tragerii, CU stangul tinut (acordul de butoane al unui mouse real) ---
  await pas('dreapta', async () => {
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
  })
  // --- 5c. o tragere pornita pe CER, sau o panoramare cu Shift eliberat primul, nu lasa o lucrare (INT-3) ---
  await pas('clic-scapat', async () => {
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
  })
  // --- 6. conturul de perete 7×7 ---
  await pas('perete', async () => {
    await p.tasta('c')
    const x0 = loc.x + 10, y0 = loc.y + 10
    await p.trage([x0, y0], [x0 + 6, y0 + 6], sol + 1)
    const pereti = (await p.js('__f.des()')).filter((d) => d.piesa === 1 && d.wx >= x0 && d.wx <= x0 + 6 && d.wy >= y0 && d.wy <= y0 + 6)
    const interior = pereti.filter((d) => d.wx > x0 && d.wx < x0 + 6 && d.wy > y0 && d.wy < y0 + 6)
    bifa('perete', pereti.length === 24 && interior.length === 0, 'Construieste perete, dreptunghi 7×7: 24 de piese, doar pe contur', `${pereti.length}, ${interior.length} in interior; toast: ${await p.js('__f.toast()')}`)
    await p.poza('4-perete.png')
    // Anulează cu Planul stins: gestul aprinde Planul, nu retrage lucrarile nevazute (ECR-12).
    await p.tasta('a')
    if (await p.js('__kinstead.jobOverlay.visible')) await p.tasta('j')
    const inainte = await p.js('__f.des().length')
    await p.trage([x0, y0], [x0 + 6, y0 + 6], sol + 1)
    const r = await p.js(`({ n: __f.des().length, j: __kinstead.jobOverlay.visible })`)
    bifa('anuleaza-plan-stins', r.n === inainte && r.j, 'Anulează cu Planul stins: aprinde Planul, nu retrage nimic nevazut', `${inainte} → ${r.n}; J ${r.j}`)

    // --- 6a. usa pe un zid DOAR planificat: Anulează o piesa din conturul 7×7, apoi unealta Usa in gol ---
    await p.tasta('r')
    // Golul: o piesa a conturului ai carei vecini de pe latura sunt la aceeasi cota, cota solului ei + 1
    // (conturul 7×7 sta pe doua niveluri de relief).
    const alegere = await p.js(`(() => {
      const d = __f.des(), la = (x, y) => d.find((e) => e.wx === x && e.wy === y && e.piesa === 1)
      for (const [x, y] of [[${x0} + 3, ${y0}], [${x0} + 2, ${y0}], [${x0} + 4, ${y0}], [${x0} + 3, ${y0} + 6], [${x0}, ${y0} + 3], [${x0} + 6, ${y0} + 3]]) {
        const e = la(x, y); if (!e) continue
        const ax = x === ${x0} || x === ${x0} + 6
        const a = ax ? la(x, y - 1) : la(x - 1, y), b = ax ? la(x, y + 1) : la(x + 1, y)
        if (a && b && a.z === e.z && b.z === e.z && __kinstead.suprafata(x, y) + 1 === e.z) return { x, y, z: e.z }
      }
      return null
    })()`)
    const gx = alegere?.x ?? x0 + 3, gy = alegere?.y ?? y0, gz = alegere?.z ?? sol + 1
    await p.js(`__f.centreaza(${gx + 0.5}, ${gy + 0.5}, ${gz}, 10)`)
    await astepta(250)
    const pAn = await p.js(`__f.pixel(${gx}, ${gy}, ${gz})`)
    if (pAn !== null) await p.click(pAn.x, pAn.y)
    const faraPiesa = (await p.js('__f.des()')).every((d) => !(d.wx === gx && d.wy === gy))
    await p.tasta('c')
    const bUsa = await p.js(`(() => { const b = document.querySelector('button[title^="Ușă de piatră"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    if (bUsa) await p.click(bUsa.x, bUsa.y)
    const unealta = await p.js(`({ u: __kinstead.ui.unealta, piesa: __kinstead.ui.piesa })`)
    const pUsa = await p.js(`__f.pixel(${gx}, ${gy}, ${gz})`)
    const tUsa = pUsa === null ? null : await p.js(`__kinstead.tintaLa(${pUsa.x}, ${pUsa.y}, { ctrl: false, shift: false, alt: false })`)
    if (pUsa !== null) await p.click(pUsa.x, pUsa.y)
    const usi = (await p.js('__f.des()')).filter((d) => d.piesa === 5)
    const inGol = (await p.js('__f.des()')).filter((d) => d.wx === gx && d.wy === gy)
    bifa('usa-unealta', alegere !== null && faraPiesa && usi.length === 1 && usi[0].wx === gx && usi[0].wy === gy && usi[0].z === gz,
      'Construiește ▸ Ușă, clic pe golul unui zid DOAR planificat: usa se pune in gol (lumea planului)', JSON.stringify({ alegere, faraPiesa, bUsa, unealta, pUsa, tUsa, usi, inGol, toast: await p.js(`[...document.querySelectorAll('.ui-toast')].map((t) => t.textContent).join(' | ')`) }))
    // Un clic pe teren deschis: refuz cu motiv, nicio usa.
    await p.js(`document.querySelectorAll('.ui-toast').forEach((t) => t.remove()); true`)
    const pDeschis = await p.js(`__f.pixel(${gx + (gy === y0 ? 0 : 4)}, ${gy === y0 ? gy - 4 : gy}, ${gz})`)
    if (pDeschis !== null) await p.click(pDeschis.x, pDeschis.y)
    const usi2 = (await p.js('__f.des()')).filter((d) => d.piesa === 5).length
    const toasturiUsa = await p.js(`[...document.querySelectorAll('.ui-toast')].map((t) => t.textContent).join(' | ')`)
    bifa('usa-fara-gol', usi2 === usi.length && /gol de perete/.test(toasturiUsa), 'Ușă pe teren deschis: refuzata, cu motivul (un gol de perete sau o gaura de podea)', `${usi.length} → ${usi2}; toasturi: ${toasturiUsa}; pixel ${JSON.stringify(pDeschis)}`)
  })
  // --- 6c. incaperile: o casa zidita cu usa (prin comenzile simularii), overlay-ul I, inspectorul, panoul usii ---
  /** Casa de la 6c, pentru ocluzia de la 6d. */
  let casaI = null
  await pas('incaperi', async () => {
    const casa = await p.js(`(async () => {
      const K = __kinstead, w = K.world
      const C = await import('/@fs/${REPO}/src/sim/commands.ts')
      const tx = ${loc.x}, ty = ${loc.y}
      const ocupat = (x0, y0) => {
        const it = w.iteme; for (let i = 0; i < it.count; i++) if (it.alive[i] && it.wx[i] >= x0 - 2 && it.wx[i] <= x0 + 7 && it.wy[i] >= y0 - 2 && it.wy[i] <= y0 + 7) return true
        const a = w.agents; for (let i = 0; i < a.count; i++) if (a.alive[i]) { const x = Math.floor(a.x[i] / 1000), y = Math.floor(a.y[i] / 1000); if (x >= x0 - 2 && x <= x0 + 7 && y >= y0 - 2 && y <= y0 + 7) return true }
        const d = w.desemnari; for (let i = 0; i < d.count; i++) if (d.alive[i] && d.wx[i] >= x0 - 1 && d.wx[i] <= x0 + 6 && d.wy[i] >= y0 - 1 && d.wy[i] <= y0 + 6) return true
        return false
      }
      for (let r = 8; r < 60; r++) for (let dx = -r; dx <= r; dx++) for (const dy of [-r, r]) {
        const x0 = tx + dx, y0 = ty + dy, s = K.suprafata(x0, y0)
        if (s === null || ocupat(x0, y0)) continue
        let plat = true
        for (let a = -1; a <= 5 && plat; a++) for (let b = -1; b <= 5; b++) if (K.suprafata(x0 + a, y0 + b) !== s) { plat = false; break }
        if (!plat) continue
        const fill = (x, y, z, m) => C.applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: m }).ok
        let ok = true
        for (let z = s + 1; z <= s + 2; z++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
          if (a !== 0 && a !== 4 && b !== 0 && b !== 4) continue
          ok = fill(x0 + a, y0 + b, z, a === 2 && b === 0 ? 9 : 6) && ok
        }
        for (let inel = 0; inel < 3; inel++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) if (Math.min(a, b, 4 - a, 4 - b) === inel) ok = fill(x0 + a, y0 + b, s + 3, 6) && ok
        return { x0, y0, s, ok }
      }
      return null
    })()`)
    if (casa === null || !casa.ok) bifa('incaperi', false, 'casa de proba pentru incaperi', JSON.stringify(casa))
    else {
      const { x0: hx, y0: hy, s: hs } = casa
      casaI = casa
      // Casa e zidita din JS, in pauza, iar `remeshDinJurnal` ruleaza doar cand jocul merge: zidurile nu
      // erau desenate, deci ocluzia lor nu se proba (recenzia incaperilor, ECR-7). O clipa fara pauza.
      if (NEGATIVA !== 'desen') { await p.tasta(' '); await astepta(500); await p.tasta(' '); await astepta(300) }
      await p.js(`__f.centreaza(${hx + 2.5}, ${hy + 2.5}, ${hs + 1}, 9)`)
      await astepta(250)
      const acoperis = await p.js(`(() => { const q = __f.proj(${hx + 2.5}, ${hs + 4}, ${hy + 2.5}); const t = __kinstead.tintaLa(Math.round(q.x), Math.round(q.y), { ctrl: false, shift: false, alt: true }); return { t, pauza: __kinstead.stare().pauza } })()`)
      bifa('casa-desenata', acoperis.t.ok && acoperis.t.wx === hx + 2 && acoperis.t.wy === hy + 2 && acoperis.t.z === hs + 3 && acoperis.pauza, 'casa zidita din JS e si DESENATA (o clipa fara pauza): clicul pe mijlocul acoperisului tinteste acoperisul, nu podeaua', JSON.stringify(acoperis))
      await p.tasta('v')
      await p.js(`__f.centreaza(${hx + 2.5}, ${hy + 2.5}, ${hs + 1}, 9)`)
      await astepta(250)
      // Nivelul: aerul casei (sol +1 fata de solul de sub camera). Dupa fiecare tasta se ASTEAPTA eticheta
      // noua: citita la 80 ms, sub incarcare, era cea veche, bucla apasa tasta gresita si se oprea la
      // „sol −1" — bifa „incaperi" pica 1 din 3 rulari si pe codul de baza (agentul D1 al remedierii).
      const eticheta = () => p.js(`document.querySelector('.ui-nivel .rel')?.textContent ?? ''`)
      const tastaNivel = async (k) => {
        const inainte = await eticheta()
        await p.tasta(k)
        for (let j = 0; j < 30 && (await eticheta()) === inainte; j++) await astepta(50)
      }
      await tastaNivel('q')
      for (let i = 0; i < 8; i++) {
        const rel = await eticheta()
        if (rel === 'sol +1') break
        await tastaNivel(/sol \+[2-9]/.test(rel) ? 'q' : 'e')
      }
      await p.tasta('i')
      await astepta(400)
      const cifre = await p.js(`document.querySelector('.ui-legenda .cifre')?.textContent ?? ''`)
      // Podeaua de sub nivel, proiectata direct: `__f.pixel` porneste de la varful coloanei (acoperisul),
      // cu 3 m mai sus decat ce se vede sub planul de taiere.
      const pPodea = await p.js(`(() => {
        const K = __kinstead, q = __f.proj(${hx + 2.5}, ${hs + 1}, ${hy + 2.5})
        for (let r = 0; r <= 20; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = Math.round(q.x) + dx, y = Math.round(q.y) + dy
          if (document.elementFromPoint(x, y) !== K.renderer.domElement) continue
          const t = K.tintaLa(x, y, { ctrl: false, shift: false, alt: false })
          if (t.ok && t.wx === ${hx + 2} && t.wy === ${hy + 2}) return { x, y, z: t.z }
        }
        return null
      })()`)
      if (pPodea !== null) await p.click(pPodea.x, pPodea.y)
      await astepta(400)
      const insp = await p.js(`document.querySelector('.ui-incapere')?.textContent ?? ''`)
      const titlu = await p.js(`document.querySelector('.ui-sertar h2')?.textContent ?? ''`)
      bifa('incaperi', /1 încăpere/.test(cifre) && /Încăpere · 18 m³/.test(insp) && /1 ușă/.test(insp),
        'o casa 5×5 cu usa: overlay-ul I numara 1 incapere, inspectorul spune „Încăpere · 18 m³ … 1 ușă"', JSON.stringify({ cifre, insp, titlu, pPodea, casa }))
      // Tenta chiar e in scena: bifa de mai sus citeste doar cifrele (lentila ECR-7, mutatia a: 39/39 verzi).
      const tenta = await p.js(`(() => { const g = __kinstead.scene.getObjectByName('overlay-camere'); if (!g) return null; return { vizibil: g.visible, plase: g.children.map((c) => ({ tip: c.type, varfuri: c.geometry?.getAttribute('position')?.count ?? 0, culori: !!c.geometry?.getAttribute('color') })) } })()`)
      bifa('incaperi-tenta', tenta !== null && tenta.vizibil && tenta.plase.some((c) => c.tip === 'Mesh' && c.culori && c.varfuri > 0), 'overlay-ul I: tenta incaperii e in scena (o plasa cu culori pe varf si varfuri > 0)', JSON.stringify(tenta))
      await p.poza('5-incaperi.png')
      // Panoul usii, fara nivel: clicul pe el inspecteaza USA, nu pragul sau zidul din spate (JUC-4).
      await p.tasta('r')
      await p.js(`(() => { const K = __kinstead; K.controls.target.set(${hx + 2.5}, ${hs + 2}, ${hy + 0.5}); K.camera.position.set(${hx + 3.5}, ${hs + 6}, ${hy - 9}); K.controls.update(); return true })()`)
      await astepta(300)
      const pUsa = await p.js(`(() => {
        const K = __kinstead, q = __f.proj(${hx + 2.5}, ${hs + 1.5}, ${hy + 0.4})
        for (let r = 0; r <= 12; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = Math.round(q.x) + dx, y = Math.round(q.y) + dy
          if (document.elementFromPoint(x, y) !== K.renderer.domElement) continue
          const t = K.tintaLa(x, y, { ctrl: false, shift: false, alt: false })
          if (t.ok && t.wx === ${hx + 2} && t.wy === ${hy} && (t.z === ${hs + 1} || t.z === ${hs + 2})) return { x, y }
        }
        return null
      })()`)
      if (pUsa !== null) await p.click(pUsa.x, pUsa.y)
      await astepta(400)
      const h2 = await p.js(`document.querySelector('.ui-sertar h2')?.textContent ?? ''`)
      bifa('usa-tintita', pUsa !== null && h2 === 'Ușă', 'clic pe panoul unei usi zidite: inspectorul spune „Ușă"', JSON.stringify({ pUsa, h2 }))
      // --- 6d. (recenzia pe ecran a incaperilor: EXP-6, ECR-1, ECR-6) inspectorul pe panoul usii; unealta Usa
      // prin mijlocul unui gol acoperit; usa desemnata se anuleaza intreaga, din toast si cu unealta Anulează ---
      {
        const incUsa = await p.js(`document.querySelector('.ui-incapere')?.textContent ?? ''`)
        bifa('usa-inspector-incapere', h2 === 'Ușă' && /Încăpere · 18 m³/.test(incUsa), 'clic pe panoul usii: inspectorul spune si incaperea din spatele lui („Încăpere · 18 m³")', JSON.stringify({ h2, incUsa }))
        // Casa cu golul DESCHIS (1×2, sub acoperis), zidita prin comenzile simularii, departe de cea de mai sus.
        const cg = await p.js(`(async () => {
          const K = __kinstead, w = K.world
          const C = await import('/@fs/${REPO}/src/sim/commands.ts')
          const liber = (x0, y0) => {
            const a = w.agents; for (let i = 0; i < a.count; i++) if (a.alive[i]) { const x = Math.floor(a.x[i] / 1000), y = Math.floor(a.y[i] / 1000); if (x >= x0 - 3 && x <= x0 + 7 && y >= y0 - 6 && y <= y0 + 7) return false }
            const it = w.iteme; for (let i = 0; i < it.count; i++) if (it.alive[i] && it.wx[i] >= x0 - 3 && it.wx[i] <= x0 + 7 && it.wy[i] >= y0 - 6 && it.wy[i] <= y0 + 7) return false
            const d = w.desemnari; for (let i = 0; i < d.count; i++) if (d.alive[i] && d.wx[i] >= x0 - 3 && d.wx[i] <= x0 + 7 && d.wy[i] >= y0 - 6 && d.wy[i] <= y0 + 7) return false
            return true
          }
          for (let r = 10; r < 90; r++) for (let dx = -r; dx <= r; dx++) for (const dy of [-r, r]) {
            const x0 = ${hx} + dx, y0 = ${hy} + dy, s = K.suprafata(x0, y0)
            if (s === null || !liber(x0, y0)) continue
            let plat = true
            for (let a = -1; a <= 5 && plat; a++) for (let b = -5; b <= 5; b++) if (K.suprafata(x0 + a, y0 + b) !== s) { plat = false; break }
            if (!plat) continue
            const fill = (x, y, z, m) => C.applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: m }).ok
            let ok = true
            for (let z = s + 1; z <= s + 2; z++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
              if ((a !== 0 && a !== 4 && b !== 0 && b !== 4) || (a === 2 && b === 0)) continue
              ok = fill(x0 + a, y0 + b, z, 6) && ok
            }
            for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) ok = fill(x0 + a, y0 + b, s + 3, 6) && ok
            return { x0, y0, s, ok }
          }
          return null
        })()`)
        if (cg === null || !cg.ok) bifa('usa-gol-mijloc', false, 'casa cu golul deschis', JSON.stringify(cg))
        else {
          const { x0: gx0, y0: gy0, s: gs } = cg
          // Mesh-urile se refac din jurnal doar cu simularea pornita: cateva cadre fara pauza, apoi iar pauza.
          if (await p.js('__kinstead.stare().pauza')) { await p.tasta(' '); await astepta(700); await p.tasta(' '); await astepta(300) }
          await p.tasta('c')
          const bU = await p.js(`(() => { const b = document.querySelector('button[title^="Ușă de piatră"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
          if (bU) await p.click(bU.x, bU.y)
          await p.js(`document.querySelectorAll('.ui-toast').forEach((t) => t.remove()); true`)
          // Din fata, la 35° si 12 m: centrul proiectat al golului (raza trece prin gol pe podeaua camerei).
          await p.js(`(() => { const K = __kinstead, e = 35 * Math.PI / 180; K.controls.target.set(${gx0 + 2.5}, ${gs + 2}, ${gy0}); K.camera.position.set(${gx0 + 2.5}, ${gs + 2} + 12 * Math.sin(e), ${gy0} - 12 * Math.cos(e)); K.controls.update(); return true })()`)
          await astepta(300)
          const usiGol = async () => (await p.js('__f.des()')).filter((d) => d.piesa === 5 && d.wx === gx0 + 2 && d.wy === gy0).map((d) => d.z - gs).sort()
          const c = await p.js(`(() => { const q = __f.proj(${gx0 + 2.5}, ${gs + 2}, ${gy0}); const x = Math.round(q.x), y = Math.round(q.y); return { x, y, canvas: document.elementFromPoint(x, y) === __kinstead.renderer.domElement } })()`)
          await p.muta(c.x - 3, c.y); await p.muta(c.x, c.y); await astepta(250)
          const fant = await p.js(`({ vis: __kinstead.fantoma.visible, scale: __kinstead.fantoma.scale.toArray() })`)
          if (c.canvas) await p.click(c.x, c.y)
          const dupaClic = await usiGol()
          const toastUsa = await p.js(`[...document.querySelectorAll('.ui-toast')].map((t) => t.textContent).join(' | ')`)
          bifa('usa-gol-mijloc', c.canvas && JSON.stringify(dupaClic) === '[1,2]', 'Construiește ▸ Ușă, clic pe MIJLOCUL unui gol acoperit (vazut prin el: podeaua camerei): usa intreaga, 2 desemnari', JSON.stringify({ c, fant, dupaClic, toastUsa, casa: cg }))
          // „Anulează" din toastul clicului retrage toata usa.
          const bAn = await p.js(`(() => { const t = [...document.querySelectorAll('.ui-toast')].find((e) => /Ușă/.test(e.textContent) && e.querySelector('button')); if (!t) return null; const r = t.querySelector('button').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
          if (bAn) await p.click(bAn.x, bAn.y)
          const dupaToast = await usiGol()
          bifa('usa-toast-anuleaza', dupaClic.length === 2 && bAn !== null && dupaToast.length === 0, 'clicul Usa are „Anulează" in toast, ca dreptunghiul: retrage toate celulele usii', JSON.stringify({ dupaClic, bAn, dupaToast, toastUsa }))
          // Unealta Anulează pe cubul de SUS al usii (desemnata prin comenzi): nu ramane o jumatate de usa.
          await p.js(`(async () => {
            const C = await import('/@fs/${REPO}/src/sim/commands.ts')
            for (const z of [${gs + 1}, ${gs + 2}]) C.applyCommand(__kinstead.world, { kind: 'desemneaza', wx: ${gx0 + 2}, wy: ${gy0}, z, piesa: 5 })
            return true
          })()`)
          await p.js(`document.querySelectorAll('.ui-toast').forEach((t) => t.remove()); true`)
          const inainteAn = await usiGol()
          await p.tasta('a')
          const sus = await p.js(`(() => {
            const K = __kinstead, q = __f.proj(${gx0 + 2.5}, ${gs + 2.5}, ${gy0 + 0.5})
            for (let r = 0; r <= 24; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
              if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
              const x = Math.round(q.x) + dx, y = Math.round(q.y) + dy
              if (document.elementFromPoint(x, y) !== K.renderer.domElement) continue
              const t = K.tintaLa(x, y, { ctrl: true, shift: false, alt: false })
              if (t.ok && t.wx === ${gx0 + 2} && t.wy === ${gy0} && t.z === ${gs + 2}) return { x, y }
            }
            return null
          })()`)
          if (sus !== null) await p.click(sus.x, sus.y)
          const dupaAn = await usiGol()
          bifa('usa-anuleaza-sus', inainteAn.length === 2 && sus !== null && dupaAn.length === 0, 'Anulează pe cubul de sus al usii: 0 desemnari USA (nu o jumatate de usa)', JSON.stringify({ inainteAn, sus, dupaAn }))
          await p.tasta('v')
        }
      }
      await p.tasta('i')
    }
  })
  // --- 6d. ocluzia: usa din SPATELE unui zid nu e tintita (recenzia incaperilor, ECR-7; scena s9 a lentilei) ---
  await pas('usa-din-spate', async () => {
    if (casaI === null) { bifa('usa-din-spate', false, 'fara casa de proba (6c)'); return }
    const { x0: hx, y0: hy, s: hs } = casaI
    await p.tasta('r')
    await p.tasta('v')
    // Camera la sud, usa in zidul de nord: pixelii fetei de sud a casei — oracolul e patrulaterul ei
    // proiectat, cu 2 px de margine (dreptunghiul care il cuprinde prindea si pixeli de langa casa, care vad
    // coltul zidului de nord: 3 din 6.223, citite drept „usa" de un oracol pe `wy`).
    const o = await p.js(`(() => {
      const K = __kinstead
      K.controls.target.set(${hx + 2.5}, ${hs + 1.5}, ${hy + 2}); K.camera.position.set(${hx + 2.5}, ${hs + 3.5}, ${hy + 14}); K.controls.update(); K.camera.updateMatrixWorld()
      const P = [[0, 1], [5, 1], [5, 3], [0, 3]].map(([dx, dz]) => __f.proj(${hx} + dx, ${hs} + dz, ${hy + 5}))
      const inPatrulater = (x, y) => { let semn = 0; for (let i = 0; i < 4; i++) { const a = P[i], b = P[(i + 1) % 4], c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); if (c === 0) return false; if (semn === 0) semn = Math.sign(c); else if (Math.sign(c) !== semn) return false } return true }
      const peFata = (x, y) => inPatrulater(x - 2, y - 2) && inPatrulater(x + 2, y - 2) && inPatrulater(x - 2, y + 2) && inPatrulater(x + 2, y + 2)
      const minx = Math.min(...P.map((q) => q.x)), maxx = Math.max(...P.map((q) => q.x)), miny = Math.min(...P.map((q) => q.y)), maxy = Math.max(...P.map((q) => q.y))
      let zid = 0, peZid = 0, peUsa = 0
      for (let y = Math.ceil(miny); y < maxy; y += 3) for (let x = Math.ceil(minx); x < maxx; x += 3) {
        if (!peFata(x, y) || document.elementFromPoint(x, y) !== K.renderer.domElement) continue
        zid++
        const t = K.tintaLa(x, y, { ctrl: false, shift: false, alt: true })
        if (t.ok && t.wy === ${hy + 4}) peZid++
        if (t.ok && t.wx === ${hx + 2} && t.wy === ${hy}) peUsa++
      }
      return { zid, peZid, peUsa }
    })()`)
    bifa('usa-din-spate', o.zid >= 500 && o.peUsa === 0 && o.peZid >= o.zid * 0.99, 'usa din zidul de nord, privita prin zidul de sud al casei desenate: pixelii zidului de sud tintesc zidul, niciunul usa', JSON.stringify(o))
  })
  // --- 6e. un gol de usa ACOPERIT, nezidit: Contur/Plin, fantoma, „Pune ușa" din inspector (ECR-7, ECR-12) ---
  await pas('usa-gol', async () => {
    const casa = await p.js(`(async () => {
      const K = __kinstead, w = K.world
      const C = await import('/@fs/${REPO}/src/sim/commands.ts')
      const tx = ${loc.x}, ty = ${loc.y}
      const ocupat = (x0, y0) => {
        const it = w.iteme; for (let i = 0; i < it.count; i++) if (it.alive[i] && it.wx[i] >= x0 - 2 && it.wx[i] <= x0 + 7 && it.wy[i] >= y0 - 2 && it.wy[i] <= y0 + 7) return true
        const a = w.agents; for (let i = 0; i < a.count; i++) if (a.alive[i]) { const x = Math.floor(a.x[i] / 1000), y = Math.floor(a.y[i] / 1000); if (x >= x0 - 2 && x <= x0 + 7 && y >= y0 - 2 && y <= y0 + 7) return true }
        const d = w.desemnari; for (let i = 0; i < d.count; i++) if (d.alive[i] && d.wx[i] >= x0 - 1 && d.wx[i] <= x0 + 6 && d.wy[i] >= y0 - 1 && d.wy[i] <= y0 + 6) return true
        return false
      }
      for (let r = 8; r < 90; r++) for (let dx = -r; dx <= r; dx++) for (const dy of [-r, r]) {
        const x0 = tx + dx, y0 = ty + dy, s = K.suprafata(x0, y0)
        if (s === null || ocupat(x0, y0)) continue
        let plat = true
        for (let a = -1; a <= 5 && plat; a++) for (let b = -1; b <= 5; b++) if (K.suprafata(x0 + a, y0 + b) !== s) { plat = false; break }
        // In fata golului (unde sta camera), nimic mai sus decat solul casei.
        for (let a = 0; a <= 4 && plat; a++) for (let b = -8; b <= -2; b++) { const q = K.suprafata(x0 + a, y0 + b); if (q === null || q > s) { plat = false; break } }
        if (!plat) continue
        const fill = (x, y, z, m) => C.applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: m }).ok
        let ok = true
        for (let z = s + 1; z <= s + 2; z++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) {
          if ((a !== 0 && a !== 4 && b !== 0 && b !== 4) || (a === 2 && b === 0)) continue
          ok = fill(x0 + a, y0 + b, z, 6) && ok
        }
        for (let inel = 0; inel < 3; inel++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) if (Math.min(a, b, 4 - a, 4 - b) === inel) ok = fill(x0 + a, y0 + b, s + 3, 6) && ok
        return { x0, y0, s, ok }
      }
      return null
    })()`)
    if (casa === null || !casa.ok) { bifa('usa-gol', false, 'casa cu golul deschis', JSON.stringify(casa)); return }
    const gx = casa.x0 + 2, gy = casa.y0, gs = casa.s
    // O clipa fara pauza: casa desenata (vezi „casa-desenata").
    await p.tasta(' '); await astepta(500); await p.tasta(' '); await astepta(300)
    await p.tasta('r')
    await p.tasta('c')
    // Contur/Plin: la Perete se vede (controlul), la Usa nu; indiciul Usii nu spune „(plin)".
    const clicPiesa = async (titlu) => {
      const b = await p.js(`(() => { const b = document.querySelector('button[title^="${titlu}"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
      if (b) await p.click(b.x, b.y)
      return b !== null
    }
    const contur = () => p.js(`({ butoane: [...document.querySelectorAll('.ui-sub button')].filter((b) => /^(Contur|Plin)$/.test(b.textContent) && b.offsetParent !== null).length, indiciu: document.querySelector('.ui-indiciu')?.textContent ?? '' })`)
    await clicPiesa('Perete:')
    const laPerete = await contur()
    await clicPiesa('Ușă de piatră')
    const laUsa = await contur()
    bifa('usa-fara-contur', laPerete.butoane === 1 && laUsa.butoane === 0 && !/\((plin|contur)\)/.test(laUsa.indiciu) && /gol/.test(laUsa.indiciu), 'Construiește ▸ Ușă: fara Contur/Plin (planul usii il ignora), indiciul spune ce fac clicul si dreptunghiul; la Perete, Contur e acolo', JSON.stringify({ laPerete, laUsa }))
    // Fantoma: cursorul pe pragul golului (fata de sus a pragului, vazuta prin gol) — ea cuprinde tot golul.
    await p.js(`(() => { const K = __kinstead; K.controls.target.set(${gx + 0.5}, ${gs + 1.5}, ${gy + 0.5}); K.camera.position.set(${gx + 0.5}, ${gs + 5}, ${gy - 7}); K.controls.update(); return true })()`)
    await astepta(300)
    const prag = await p.js(`(() => {
      const K = __kinstead, q = __f.proj(${gx + 0.5}, ${gs + 1}, ${gy + 0.3})
      for (let r = 0; r <= 25; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = Math.round(q.x) + dx, y = Math.round(q.y) + dy
        if (document.elementFromPoint(x, y) !== K.renderer.domElement) continue
        const t = K.tintaLa(x, y, { ctrl: false, shift: false, alt: false })
        if (t.ok && t.wx === ${gx} && t.wy === ${gy} && t.z === ${gs + 1}) return { x, y }
      }
      return null
    })()`)
    if (prag !== null) { await p.muta(prag.x, prag.y); await astepta(250) }
    const f = await p.js(`(() => { const F = __kinstead.fantoma; return { vizibila: F.visible, poz: F.position.toArray(), scara: F.scale.toArray() } })()`)
    bifa('fantoma-gol', prag !== null && f.vizibila && f.scara.join() === '1,2,1' && f.poz.join() === [gx, gs + 1, gy].join(), 'Ușă, cursorul pe pragul unui gol acoperit de 2 m: fantoma cuprinde tot golul (scale 1,2,1)', JSON.stringify({ prag, f }))
    // „Pune ușa" din inspector: cu prioritatea barei de jos (5, nu cea implicita), apoi „Ușa e desemnată".
    const b5 = await p.js(`(() => { const b = [...document.querySelectorAll('.ui-sub button')].find((x) => x.textContent === '5'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    if (b5) await p.click(b5.x, b5.y)
    await p.tasta('v')
    await p.js(`__kinstead.ui.inspecteazaCelula(${gx}, ${gy + 2}, ${gs}); true`)
    await astepta(400)
    const inainte = await p.js(`document.querySelector('.ui-incapere')?.textContent ?? ''`)
    const bPune = await p.js(`(() => { const b = [...document.querySelectorAll('.ui-incapere button')].find((x) => /Pune ușa/.test(x.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    if (bPune) await p.click(bPune.x, bPune.y)
    await astepta(400)
    const usi = await p.js(`(() => { const d = __kinstead.world.desemnari; const o = []; for (let i = 0; i < d.count; i++) if (d.alive[i] && d.piesa[i] === 5 && d.wx[i] === ${gx} && d.wy[i] === ${gy}) o.push({ z: d.z[i] - ${gs}, prioritate: d.prioritate[i] }); return o })()`)
    const dupa = await p.js(`({ text: document.querySelector('.ui-incapere')?.textContent ?? '', pune: [...document.querySelectorAll('.ui-incapere button')].some((x) => /Pune ușa/.test(x.textContent)), arataUsa: [...document.querySelectorAll('.ui-incapere button')].some((x) => /Arată ușa/.test(x.textContent)) })`)
    bifa('pune-usa', b5 !== null && bPune !== null && usi.length === 2 && usi.every((u) => u.prioritate === 5) && /Ușa e desemnată — o zidesc oamenii/.test(dupa.text) && !dupa.pune && dupa.arataUsa,
      'inspectorul pe o casa cu golul deschis: „Pune ușa" pune usa intreaga cu prioritatea barei (5), apoi spune „Ușa e desemnată", fara buton', JSON.stringify({ inainte, usi, dupa }))
  })
  // --- 6g. temperatura (design temperatura v2, §6; panoul, L5-2 / L5-3): overlay-ul U din tasta si din butonul din
  // „Hărți", tenta si cifra pe casa de proba; inspectorul pe podeaua ei arata echilibrul si descompunerea; textul
  // temperaturii se schimba FARA clic, iar butonul „Arată nivelul" ramane acelasi nod (scris pe loc, nu redesenat).
  await pas('temperatura', async () => {
    if (casaI === null) { bifa('temperatura-tasta', false, 'fara casa de proba (6c)'); return }
    const { x0: hx, y0: hy, s: hs } = casaI
    if (!(await p.js('__kinstead.stare().pauza'))) await p.tasta(' ')
    await p.tasta('r')
    await p.tasta('v')
    if (await p.js(`document.querySelector('button[title^="Încăperile închise"]')?.getAttribute('aria-pressed') === 'true'`)) await p.tasta('i')
    await p.js(`__f.centreaza(${hx + 2.5}, ${hy + 2.5}, ${hs + 1}, 9)`)
    await astepta(250)
    // Nivelul: aerul casei (sol +1), ca la 6c — dupa fiecare tasta se ASTEAPTA eticheta noua.
    const eticheta = () => p.js(`document.querySelector('.ui-nivel .rel')?.textContent ?? ''`)
    const tastaNivel = async (k) => {
      const inainte = await eticheta()
      await p.tasta(k)
      for (let j = 0; j < 30 && (await eticheta()) === inainte; j++) await astepta(50)
    }
    await tastaNivel('q')
    for (let i = 0; i < 8; i++) {
      const rel = await eticheta()
      if (rel === 'sol +1') break
      await tastaNivel(/sol \+[2-9]/.test(rel) ? 'q' : 'e')
    }
    const stare = () => p.js(`(() => {
      const K = __kinstead, o = K.tempOverlay, s = K.etichete ? K.etichete() : null
      if (!o) return { lipsa: true }
      const g = K.scene.getObjectByName('overlay-temperatura')
      const casa = o.ancore.filter((a) => a.x >= ${hx + 1} && a.x <= ${hx + 3} && a.y >= ${hy + 1} && a.y <= ${hy + 3})
      const spanuri = s ? s.spanuri.map((e) => ({ vizibil: !e.hidden && !s.radacina.hidden, text: e.textContent })) : []
      const i = casa.length ? o.ancore.indexOf(casa[0]) : -1
      const leg = document.querySelector('.ui-legenda')
      return {
        vizibil: o.visible, nivel: o.nivel ?? null, grup: g ? g.visible : null,
        plase: g ? g.children.map((c) => ({ tip: c.type, varfuri: c.geometry?.getAttribute('position')?.count ?? 0, culori: !!c.geometry?.getAttribute('color') })) : [],
        ancoreCasa: casa.length, eticheta: i >= 0 && spanuri[i] ? spanuri[i] : null, etichete: spanuri.filter((x) => x.vizibil).length,
        buton: document.querySelector('button[title^="Unde ar ajunge temperatura"]')?.getAttribute('aria-pressed') ?? null,
        legenda: leg && !leg.hidden ? (leg.querySelector('h3 span')?.textContent ?? '') + ' | ' + (leg.querySelector('.cifre')?.textContent ?? '') : '',
      }
    })()`)
    const s0 = await stare()
    await p.tasta('u')
    await astepta(500)
    const s1 = await stare()
    bifa('temperatura-tasta', s0.vizibil === false && s1.vizibil === true && s1.buton === 'true' && s1.nivel === hs + 1, 'tasta U aprinde overlay-ul Temperatura pe nivelul casei (butonul din „Hărți" apasat)', JSON.stringify({ s0: { vizibil: s0.vizibil, buton: s0.buton, lipsa: s0.lipsa }, s1: { vizibil: s1.vizibil, nivel: s1.nivel, buton: s1.buton }, hs }))
    bifa('temperatura-tenta', s1.grup === true && (s1.plase ?? []).some((c) => c.tip === 'Mesh' && c.culori && c.varfuri >= 9 * 6), 'overlay-ul U: tenta e in scena (o plasa cu culori pe varf, cel putin cele 9 celule ale casei)', JSON.stringify(s1.plase))
    bifa('temperatura-etichete', s1.ancoreCasa === 1 && s1.eticheta !== null && s1.eticheta.vizibil && /^−?\d+,\d°$/.test(s1.eticheta.text), 'overlay-ul U: o cifra pe casa de proba, ancorata in interiorul ei si vizibila („4,5°")', JSON.stringify({ ancoreCasa: s1.ancoreCasa, eticheta: s1.eticheta, etichete: s1.etichete }))
    bifa('temperatura-legenda', /^Temperatură \(U\) \| /.test(s1.legenda ?? '') && /°C la echilibru · afară −?\d+ °C$/.test(s1.legenda ?? ''), 'legenda lui U: intervalul de la nivel si aerul de afara', String(s1.legenda))
    await p.poza('7-temperatura-overlay.png')
    // Butonul din „Hărți": U stins din tasta, aprins din buton.
    await p.tasta('u')
    await astepta(300)
    const s2 = await stare()
    const bT = await p.js(`(() => { const b = document.querySelector('button[title^="Unde ar ajunge temperatura"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    if (bT) await p.click(bT.x, bT.y)
    await astepta(400)
    const s3 = await stare()
    bifa('temperatura-buton', s2.vizibil === false && bT !== null && s3.vizibil === true && s3.buton === 'true' && s3.eticheta?.vizibil === true, 'butonul „Temperatură" din „Hărți" aprinde overlay-ul (dupa ce U l-a stins), cu cifra casei', JSON.stringify({ s2: s2.vizibil, bT, s3: { vizibil: s3.vizibil, buton: s3.buton, eticheta: s3.eticheta } }))
    // Inspectorul pe podeaua casei (sub planul de taiere, proiectata direct, ca la 6c).
    const pPodea = await p.js(`(() => {
      const K = __kinstead, q = __f.proj(${hx + 2.5}, ${hs + 1}, ${hy + 2.5})
      for (let r = 0; r <= 20; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
        const x = Math.round(q.x) + dx, y = Math.round(q.y) + dy
        if (document.elementFromPoint(x, y) !== K.renderer.domElement) continue
        const t = K.tintaLa(x, y, { ctrl: false, shift: false, alt: false })
        if (t.ok && t.wx === ${hx + 2} && t.wy === ${hy + 2}) return { x, y, z: t.z }
      }
      return null
    })()`)
    if (pPodea !== null) await p.click(pPodea.x, pPodea.y)
    await astepta(500)
    const insp = await p.js(`({ inc: document.querySelector('.ui-incapere')?.textContent ?? '', linie: document.querySelector('.ui-termic-t')?.textContent ?? '', canale: document.querySelector('.ui-termic-canale')?.textContent ?? '' })`)
    bifa('temperatura-inspector', /Încăpere · 18 m³/.test(insp.inc) && /^~−?\d+,\d °C la echilibru \(afară −?\d+ °C\)$/.test(insp.linie)
      && /^\d+% aer de afară \(pereți \d+%, acoperiș \d+%, ~−?\d+ °C\) · \d+% sol prin podea \(~−?\d+ °C\)/.test(insp.canale) && !/pierde|câștigă/.test(insp.inc),
      'inspectorul pe podeaua casei: „~X °C la echilibru (afară Y °C)" si descompunerea („…% aer de afară (pereți …, acoperiș …) · …% sol prin podea"), fara „pierde/câștigă"', JSON.stringify({ insp, pPodea }))
    await p.poza('8-temperatura-inspector.png')
    // Fara clic: textul temperaturii se schimba cu lumea, iar „Arată nivelul" e ACELASI nod. Lumea sta pe pauza si i se
    // sare tickul (ca la „titlu-fara-automata"): echilibrul e o functie de tick, deci textul se schimba, dar nimeni nu
    // sapa langa casa — o editare acolo ar reface explicatia, deci si corpul inspectorului (legitim, nu ce se masoara
    // aici). Prima varianta lasa jocul sa mearga cu prioritatile pionilor puse pe 0: le ramanea motivul „n-are voie la
    // munca" in sertarul Oameni, iar „sertar-oameni" iesea rosie cand fereastra se lungea (7 px de text in plus).
    if (!(await p.js('__kinstead.stare().pauza'))) await p.tasta(' ')
    const citeste = () => p.js(`(() => {
      const b = [...document.querySelectorAll('.ui-inspector button')].find((x) => /Arată nivelul/.test(x.textContent))
      const l = document.querySelector('.ui-termic-t')
      if (!globalThis.__tempBtn) { globalThis.__tempBtn = b ?? null; globalThis.__tempLinie = l }
      return { buton: !!b, acelasi: b === globalThis.__tempBtn, liniaAceeasi: l === globalThis.__tempLinie, linie: l?.textContent ?? '', editari: __kinstead.world.terrain.editari, tick: __kinstead.world.tick, pauza: __kinstead.stare().pauza }
    })()`)
    await p.js('globalThis.__tempBtn = null; true')
    const inainte = await citeste()
    // O ora de joc: casa urmeaza aerul de afara, deci echilibrul ei se muta cu zecimi de grad.
    await p.js('__kinstead.world.tick += 1680; true')
    let dupa = inainte
    for (let i = 0; i < 20 && dupa.linie === inainte.linie; i++) {
      await astepta(250)
      dupa = await citeste()
    }
    bifa('temperatura-fara-clic', inainte.buton && inainte.linie !== '' && dupa.linie !== inainte.linie && dupa.acelasi && dupa.liniaAceeasi && dupa.pauza && dupa.editari === inainte.editari,
      'fara niciun clic, textul temperaturii din inspector se schimba cu lumea, iar butonul „Arată nivelul" ramane ACELASI nod (scris pe loc, nu redesenat)', JSON.stringify({ inainte, dupa }))
    await p.tasta('u')
    await p.tasta('r')
  })
  // --- 6f. zona moarta a barei de jos: cu trei toasturi, coloana .ui-jos nu prinde clicuri pe teren (ECR-4) ---
  await pas('zona-moarta', async () => {
    await p.tasta('d')
    await p.js(`(() => { const K = __kinstead; K.controls.target.set(${loc.x + 0.5}, ${sol + 1}, ${loc.y + 0.5}); K.camera.position.set(${loc.x + 0.5 - 14}, ${sol + 22}, ${loc.y + 0.5 + 14}); K.controls.update(); return true })()`)
    await p.js(`(() => { document.querySelectorAll('.ui-toast').forEach((t) => t.remove()); const lung = 'Niciun loc SIGUR de lucru: omul ar rămâne sus sau închis când se termină planul. Pune o scară sau o ușă — sau așteaptă piesa de care depinde accesul.'; __kinstead.ui.toast(lung, true); __kinstead.ui.toast('24 desemnate pe 2 niveluri · 3 sărite: nu e un gol de ușă', false, { eticheta: 'Anulează', f: () => {} }); __kinstead.ui.toast('O ușă se pune într-un gol de perete (lat de 1–2 m, înalt de 1–3 m) sau într-o gaură de podea.', true); return true })()`)
    await astepta(400)
    const m = await p.js(`(() => {
      const K = __kinstead, jos = document.querySelector('.ui-jos'), r = jos.getBoundingClientRect()
      const copii = [...jos.querySelectorAll('.ui-toast, .ui-sub, .ui-unelte, .ui-indiciu')].filter((e) => e.offsetParent !== null).map((e) => e.getBoundingClientRect())
      let moarte = 0, puncte = 0, liber = null
      for (let y = Math.ceil(r.top); y < r.bottom; y += 4) for (let x = Math.ceil(r.left); x < r.right; x += 4) {
        puncte++
        const e = document.elementFromPoint(x, y)
        if (e === jos || (e && e.classList.contains('ui-toasturi'))) moarte++
        if (liber === null && !copii.some((q) => x >= q.left - 3 && x <= q.right + 3 && y >= q.top - 3 && y <= q.bottom + 3)) {
          const t = K.tintaLa(x, y, { ctrl: false, shift: false, alt: false })
          if (t.ok && __f.des().every((d) => !(d.wx === t.wx && d.wy === t.wy))) liber = { x, y, t: [t.wx, t.wy, t.z] }
        }
      }
      return { jos: [r.left, r.top, r.right, r.bottom].map(Math.round), puncte, moarte, liber, toasturi: document.querySelectorAll('.ui-toast').length }
    })()`)
    const n0 = (await p.js('__f.des()')).length
    if (m.liber !== null) await p.click(m.liber.x, m.liber.y)
    const n1 = (await p.js('__f.des()')).length
    bifa('zona-moarta', m.toasturi === 3 && m.moarte === 0 && m.liber !== null && n1 === n0 + 1, 'trei toasturi peste bara de jos: coloana .ui-jos nu prinde nimic, iar un clic cu Sapă langa randurile ei sapa terenul de sub ea', `${JSON.stringify(m)}; desemnari ${n0} → ${n1}`)
    await p.js(`document.querySelectorAll('.ui-toast').forEach((t) => t.remove()); true`)
  })
  // --- 6b. doua dreptunghiuri, al doilea eliberat cat primul inca se aplica feliat (INT-4) ---
  await pas('doua-dreptunghiuri', async () => {
    await p.tasta('d')
    // Toasturile de dinainte se stivuiesc jos, peste colturile celui de-al doilea dreptunghi.
    await p.js(`document.querySelectorAll('.ui-toast').forEach((t) => t.remove()); true`)
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
  })
  // --- 7. depozitul 4×4 ---
  await pas('depozit', async () => {
    await p.tasta('k')
    const inainte = await p.js('__f.zone()')
    await p.trage([loc.x - 14, loc.y + 10], [loc.x - 11, loc.y + 13], sol + 1)
    const dupa = await p.js('__f.zone()')
    bifa('depozit', dupa - inainte === 16, 'Zone ▸ Depozit, dreptunghi 4×4: 16 celule de zona', `${inainte} → ${dupa}; toast: ${await p.js('__f.toast()')}; unealta ${await p.js('__kinstead.ui.unealta')}`)
  })
  // --- 7b. Z+trage cu Z eliberat inaintea butonului: tot depozit, ca in previzualizare (INT-11) ---
  await pas('z-eliberat', async () => {
    await p.js('__kinstead.ui.zonaFel = 1; true')
    await p.tasta('v')
    const inainte = (await p.js('__f.zoneFel()')).map((z) => z.id)
    p.win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'z' })
    await astepta(80)
    await p.trage([loc.x - 20, loc.y + 10], [loc.x - 17, loc.y + 13], sol + 1, [], async () => { p.win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'z' }); await astepta(80) })
    const noi = (await p.js('__f.zoneFel()')).filter((z) => !inainte.includes(z.id))
    bifa('z-eliberat', noi.length === 1 && noi[0].fel === 0, 'Z+trage cu Z eliberat primul: un DEPOZIT, cum arata previzualizarea', JSON.stringify(noi))
    await p.js('__kinstead.ui.zonaFel = 0; true')
  })
  // --- 8. Selecteaza un om: inspectorul are numele lui ---
  await pas('inspector', async () => {
    await p.tasta('v')
    const citestePion = () => p.js(`(() => { const L = __kinstead.agentLayer; const m = L.mesh; const e = new Float32Array(16); m.instanceMatrix.array.slice(0, 16).forEach((v, i) => { e[i] = v }); const a = __kinstead.world.agents; return { x: e[12], y: e[13] + 0.7, z: e[14], id: a.id[L.sloturi[0]] } })()`)
    // Camera pe om: pasii dinainte (casele incaperilor, zona moarta) o lasa altundeva, iar omul ajungea
    // sub bara de sus (y = 24 px) — clicul nimerea bara, nu omul.
    const p0 = await citestePion()
    await p.js(`__f.centreaza(${p0.x}, ${p0.z}, ${p0.y - 0.7}, 12)`)
    await astepta(300)
    const pion = await citestePion()
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
    const lat = await p.js(`(() => { const c = document.querySelector('.ui-oameni'); return { sw: c.scrollWidth, cw: c.clientWidth } })()`)
    bifa('sertar-oameni', lat.sw <= lat.cw, 'sertarul Oameni: toate coloanele se vad, fara derulare orizontala', JSON.stringify(lat))
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
  })
  // --- 9. Ctrl+S: EXACT o salvare noua, a lumii de acum; viteza 3× si pauza se regasesc la incarcare ---
  let salvare = null
  await pas('salvare', async () => {
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
  })
  const desInainte = await p.js('__f.des().length')
  const pioniInainte = await p.js('__f.pioni()')
  // --- 9b. plecarea dintr-un joc nesalvat cere confirmare (INT-6): tick-ul inaintat dupa salvare ---
  await pas('plecare', async () => {
    await p.tasta(' ')
    await astepta(800)
    await p.tasta(' ')
    const inainte = plecariOprite
    const t = await pagina('?verificare=1&pauza=1')
    bifa('plecare', plecariOprite === inainte + 1, 'plecarea dintr-un joc cu tickuri nesalvate cere confirmare (beforeunload)', `${inainte} → ${plecariOprite}`)
    void t
  })
  if (salvare !== null) await pas('incarcare', async () => {
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
    // Un camp golit nu porneste o colonie fara piatra (ECR-10).
    const cautare0 = await q.js('location.search')
    await q.js(`(() => { const i = document.querySelector('.ui-fereastra input[name=piatra]'); i.value = ''; [...document.querySelectorAll('.ui-fereastra button')].find((b) => b.textContent === 'Pornește').click(); return true })()`)
    await astepta(400)
    const gol = await q.js(`({ s: location.search, err: document.querySelector('.ui-fereastra .ui-motiv:not([hidden])')?.textContent ?? '' })`)
    bifa('camp-gol', gol.s === cautare0 && /Piatră/.test(gol.err), 'Joc nou cu campul Piatră gol: nu porneste, spune ce lipseste', JSON.stringify(gol))
    await q.poza('6-joc-nou-dialog.png')
    // Esc pana nu mai e nicio fereastra (Esc fara fereastra deschide meniul). Intai focusul iese din
    // campul de text: acolo Esc nu face nimic (garda de camp, taste.ts).
    await q.js('document.activeElement?.blur(); true')
    for (let i = 0; i < 4 && await q.js('__kinstead.ui.modalDeschis()'); i++) await q.tasta('Escape')
    // --- 10a. F1 la 1280×720: fereastra Ajutorului incepe de sus (ECR-9) ---
    await q.tasta('F1')
    await astepta(200)
    const aj = await q.js(`(() => { const f = document.querySelector('.ui-fereastra'); return { sus: f?.scrollTop ?? -1, titlu: f?.querySelector('h2')?.textContent ?? null } })()`)
    for (let i = 0; i < 4 && await q.js('__kinstead.ui.modalDeschis()'); i++) await q.tasta('Escape')
    bifa('ajutor-sus', aj.sus === 0 && aj.titlu === 'Cum se joacă', 'F1: Ajutorul se deschide de sus, cu titlul vizibil', JSON.stringify(aj))
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
  })
  if (p.erori.length) bifa('consola-joc-nou', false, 'fara erori in consola (jocul nou)', p.erori.join(' | '))
}
