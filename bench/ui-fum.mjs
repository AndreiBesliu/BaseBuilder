/**
 * Proba de fum a UI-ului de joc — pe ecran, cu input REAL, repetabila.
 *
 * Panoul de design al UI-ului (T12): verificarea „pe ecran" din design nu se putea repeta — un panou
 * de browser ascuns opreste `requestAnimationFrame` (masurat in sesiune: ~1,3 cadre pe secunda), iar
 * `stepFrame` nu grabeste timpul. Asta e un Electron cu fereastra OFFSCREEN (randeaza fara sa fie
 * vazuta, la 30 de cadre pe secunda), care trimite taste si mouse prin `sendInputEvent` si citeste
 * lumea din `__kinstead`. Fiecare pas e o bifa cu NUME si cu cifra ei.
 *
 * Proba negativa: `--proba-negativa[=<proba>]` saboteaza pasul unei bife anume (sapa: oracolul cere
 * 26; pauza: Spatiu nu se apasa; salvare: Ctrl+S nu se apasa; desen: casa zidita din JS nu primeste
 * clipa fara pauza in care se redeseneaza — „casa-desenata" rosie; exceptie: pasul „joc-nou" arunca —
 * bifa pasului rosie SI rularea ajunge la „depozit"; plus cele ale temperaturii si ale sertarului, in
 * `TINTE_NEGATIVE`), iar rularea iese cu 0 DOAR daca bifa aceea e rosie si NICIO alta (t.2b: inainte se
 * cerea doar ca ea sa fie printre cele rosii). Inainte, orice rosu trecea proba — si o bifa care nu putea
 * iesi rosie (pauza) nu se vedea (recenzia UI-ului, T-02).
 *
 * Temperatura (t.2b §8) ruleaza pe PAGINA EI, la final, pe o lume cu contract scris (vezi `paginaTermica`): timpul trece
 * doar prin `__kinstead.avanseaza(n)` (tickuri reale) sau cu jocul pornit, niciodata prin `world.tick +=` — in afara de
 * ultimul pas („exceptie-tick"), care sare ceasul DUPA ce simularea s-a oprit, doar ca sa vina momentul salvarii automate.
 *
 * Hrana (t.3 §8) ruleaza pe doua pagini ale ei, dupa cea termica: `paginaHranei` (jocul nou implicit: bara cu prognoza,
 * alerta, F3, Primii pasi, unealta Camara, dialogul Joc nou) si `paginaAlterarii` (pivnite sapate prin comenzi: inspectorul
 * in cele trei clase, S-ul in timp si in pivnita, harta U cu pragul). Comparatiile alterarii se fac pe S (PERSISTED), nu pe
 * unitati (UI-7), iar timpul trece tot doar prin `__kinstead.avanseaza(n)`.
 *
 * Fiecare pas ruleaza in `pas()`: o exceptie e o bifa ROSIE cu numele pasului, nu sfarsitul rularii
 * (recenzia incaperilor, ECR-10).
 *
 * Profilul (IndexedDB) e NOU la fiecare rulare: pe un profil refolosit, salvarea din rularea trecuta
 * facea bifele Ctrl+S si incarcarea verzi si cu salvarea stricata (recenzia UI-ului, T-01).
 *
 *   npm run viewer            (in alt terminal; sau `npm run viewer:preview` pe build)
 *   node_modules/electron/dist/electron.exe bench/ui-fum.mjs http://localhost:5175/ [--proba-negativa[=<una din TINTE_NEGATIVE>]] [--poze=<dosar>]
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
/**
 * Proba negativa → bifa pe care o face rosie. Ale temperaturii (t.2b §8) si ale sertarului saboteaza GESTUL bifei, nu
 * produsul: se-misca — timpul sarit (`world.tick +=`) in locul avansului real; inertie — gaura din acoperis nu se
 * sapa; temperatura-pauza — a doua apasare pe Spatiu lipseste (jocul merge cele 3 s); incapere-noua — Alt+clic-ul pe bloc
 * lipseste; U-la-3x — cifrele lui U se citesc la 400 ms DUPA starea cu care se compara (o cifra ramasa un pas in urma ar
 * arata asa, UI-3); alerta — invariantul nu se provoaca; incarca-m5 — lumea incarcata avanseaza 1686 de tickuri, nu 1687;
 * sertar — reparatia sertarului (485 px, `scrollbar-gutter`) e anulata in pagina printr-un stil. Recenzia t.2b (E3, E4,
 * E6): filtru-bucla — cat jocul merge, `dupaTick` al filtrului oamenilor e golit in pagina (exact bucla care ar da
 * `simTick` in locul tickului observat); exceptie-tick — exceptia din pas nu se provoaca; latime — CSS-ul randurilor fixe
 * ale inspectorului (`nowrap` pe cele trei randuri, cele 3 randuri minime ale descompunerii) e anulat printr-un stil.
 * Hrana (t.3 §8; UI-7, UI-8): bara-prognoza — textul asteptat e cel FARA alterare; alterare-inspector — fiecare scriere a
 * randului de alterare, la 3×, se compara cu starea de acum 400 ms; alterare-timp — timpul sarit (`world.tick +=`) in locul
 * avansului; pastrare — hrana „din pivnita" pusa la suprafata; alerta-alterare — lista de alerte refacuta FORTAT intre
 * mousedown si mouseup; U-prag — gestul (Q/E, U) pe alt nivel decat al pivnitelor; camara — Zone fara clicul pe „Cămară";
 * groapa — podeaua gropii sapata dupa clic (celulele ei nu mai sunt calcabile: nu ajunge niciun moloz, ca pe un acoperis).
 */
const TINTE_NEGATIVE = {
  sapa: 'sapa', pauza: 'pauza', salvare: 'salvare', desen: 'casa-desenata', exceptie: 'joc-nou',
  'se-misca': 'temperatura-se-misca', inertie: 'temperatura-inertie', 'temperatura-pauza': 'temperatura-pauza',
  'incapere-noua': 'temperatura-incapere-noua', 'U-la-3x': 'temperatura-U-la-3x', alerta: 'alerta-termica',
  'incarca-m5': 'incarca-m5', sertar: 'sertar-oameni-lung',
  'filtru-bucla': 'filtru-bucla', 'exceptie-tick': 'exceptie-tick', latime: 'latime-inspector',
  'bara-prognoza': 'bara-prognoza', 'alterare-inspector': 'alterare-inspector', 'alterare-timp': 'alterare-timp',
  pastrare: 'alterare-pastrata', 'alerta-alterare': 'alerta-alterare', 'U-prag': 'U-prag', camara: 'camara-unealta',
  groapa: 'groapa-clic',
}
if (NEGATIVA !== null && !Object.hasOwn(TINTE_NEGATIVE, NEGATIVA)) { console.log(`proba negativa necunoscuta: ${NEGATIVA} (sunt: ${Object.keys(TINTE_NEGATIVE).join(', ')})`); process.exit(2) }
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
      // „exceptie": bifa pasului e rosie SI rularea a mers mai departe (a ajuns la „depozit"). EXACT ea: o alta bifa rosie
      // inseamna ca sabotajul a stricat si altceva (proba nu mai spune ce masoara bifa) — sau ca rularea are un rosu al ei.
      const id = TINTE_NEGATIVE[NEGATIVA]
      const tinta = rosii.some((b) => b.id === id) && (NEGATIVA !== 'exceptie' || bife.some((b) => b.id === 'depozit'))
      const altele = rosii.filter((b) => b.id !== id)
      console.log(`proba negativa „${NEGATIVA}": bifa ei (${id}) ${tinta ? 'E rosie (instrumentul poate produce rosu acolo)' : 'NU e rosie — instrumentul e orb acolo'}; alte rosii: ${altele.map((b) => b.id).join(', ') || 'niciuna'}`)
      cod = tinta && altele.length === 0 ? 0 : 1
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
  // nimic nu iese din bara. Inainte, cu marca KINSTEAD si timpul total, grupul Pauza ajungea la x = 1.142 (masurat de
  // panou), iar calendarul din v1 ar fi depasit cu 255 px. Se masoara si cel mai lat text pe care il poate scrie
  // calendarul in fiecare anotimp (extremele climei, pe seed-ul lumii), nu doar cel de acum: tickul probei e mereu toamna.
  // Cazul cel mai RAU (recenzia t.2a, L4-6): bifa proba doar 2 insigne scurte, iar a treia scotea 3× din ecran. Acum,
  // fiecare submultime a celor 5 insigne (numere de doua cifre), pliata de `insigneBara` (model.ts) — aceeasi functie
  // ca panouri.ts —, cu cel mai lat text al prognozei hranei si indicatorul „≈1,2×", cu fiecare calendar; la 1.100 si la 1.280 px.
  // Prognoza (t.3 §8, UI-14) e in zile de calendar: cel mai lat text e al lui `textZile` (texte.ts), MASURAT pe toate textele pe
  // care le poate scrie sub plafon (orele unei zile, zecimile pana la 10 zile, zilele intregi pana la un an, „peste un an"),
  // nu literalul de dinainte („~12 h 59 min", minute reale).
  // Insignele, prognoza si indicatorul se pun in DOM si se scot la loc; lumea nu se atinge.
  await pas('bara-sus', async () => {
    const masoara = (latime) => p.js(`(async () => {
      const sus = document.querySelector('.ui-sus')
      const cal = sus.querySelector('.ui-calendar') ?? sus.querySelector('.ui-timp')
      const ins = sus.querySelector('.ui-res[title^="Oamenii"] > span:last-child')
      const prog = sus.querySelector('.prognoza')
      const ef = sus.querySelector('.ui-viteza-efectiva')
      const inainte = { ins: [...ins.childNodes], prog: prog.textContent, ef: ef.textContent }
      const vechi = cal.textContent
      const texte = [vechi]
      let variante = 'niciuna'
      let asteptat = null
      let seturi = []
      let progLat = null
      try {
        const T = await import('/@fs/${REPO}/viewer/ui/texte.ts')
        const Cl = await import('/@fs/${REPO}/src/sim/clima.ts')
        const Ca = await import('/@fs/${REPO}/src/sim/calendar.ts')
        const M = await import('/@fs/${REPO}/viewer/ui/model.ts')
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
        // Textele prognozei: orele (sub o zi), zecimile si zilele pana la plafonul de un an, si „peste un an"; cel mai lat, masurat.
        const zileAn = Ca.tickuriPeAn(R) / R.calendar.ziTicks
        const cand = new Set([T.textZile(zileAn, true)])
        for (let h = 0; h <= 24; h++) cand.add(T.textZile(h / 24, false))
        for (let z = 10; z <= Math.ceil(zileAn * 10); z++) cand.add(T.textZile(z / 10, false))
        for (const c of cand) { prog.textContent = c; const l = prog.getBoundingClientRect().width; if (progLat === null || l > progLat.lat) progLat = { text: c, lat: +l.toFixed(1), candidati: cand.size } }
        prog.textContent = '~12 h 59 min'
        progLat.vechi = +prog.getBoundingClientRect().width.toFixed(1)
        // Ce TREBUIE sa scrie bara acum: aceeasi compunere ca panouri.ts (baraDeSus), la tickul si seed-ul lumii.
        asteptat = { tick: __kinstead.world.tick, ...T.baraDeSus(__kinstead.world.tick, seed, R, __kinstead.stare().viteza) }
        // Toate cele 32 de submultimi ale insignelor, cu 12 pe fiecare, pliate ca in joc la latimea de acum.
        const z = Number(document.querySelector('.ui').style.getPropertyValue('zoom') || '1')
        for (let m = 0; m < 32; m++) {
          const n = (k) => (m & (1 << k) ? 12 : 0)
          seturi.push(M.insigneBara({ flamanzi: n(0), obositi: n(1), nefericiti: n(2), plecati: n(3), jefuitori: n(4) }, innerWidth / z))
        }
      } catch (e) { variante = 'fara calendar: ' + String(e?.message ?? e).slice(0, 80) }
      if (seturi.length === 0) seturi = [[{ clasa: 'atentie', text: '3 flămânzi', titlu: '' }, { clasa: 'atentie', text: '2 obosiți', titlu: '' }]]
      prog.textContent = progLat?.text ?? '~12 h 59 min'
      ef.textContent = '≈1,2×'
      const masuri = []
      for (const set of seturi) {
        ins.replaceChildren(...set.map((x) => { const e = document.createElement('span'); e.className = 'ui-insigna ' + x.clasa; if (x.titlu) e.title = x.titlu; e.textContent = x.text; return e }))
        for (const t of texte) {
          cal.textContent = t
          const c = cal.getBoundingClientRect()
          const ultim = sus.lastElementChild.getBoundingClientRect()
          const spatiu = sus.querySelector('.spatiu')?.getBoundingClientRect().width ?? 0
          masuri.push({ t, ins: set.map((x) => x.text).join(', '), sw: sus.scrollWidth, cw: sus.clientWidth, lat: +c.width.toFixed(1), inalt: Math.round(c.height), dreapta: Math.round(ultim.right), rezerva: Math.round(spatiu) })
        }
      }
      cal.textContent = vechi
      ins.replaceChildren(...inainte.ins)
      prog.textContent = inainte.prog
      ef.textContent = inainte.ef
      const lat = masuri.reduce((a, m) => (m.lat > a.lat ? m : a), masuri[0])
      const ingust = masuri.reduce((a, m) => (m.lat < a.lat ? m : a), masuri[0])
      const stramt = masuri.reduce((a, m) => (m.rezerva < a.rezerva ? m : a), masuri[0])
      const rele = masuri.filter((m) => !(m.sw <= m.cw && m.dreapta <= m.cw && m.inalt <= 20))
      const despliate = Math.max(...seturi.map((s) => (s.length === 1 && / alerte$/.test(s[0].text) ? 0 : s.length)))
      return { latime: innerWidth, ceruta: ${latime}, marca: !!sus.querySelector('.ui-marca'), cate: masuri.length, seturi: seturi.length, despliate, variante, acum: masuri[0], celMaiLat: lat, celMaiIngust: ingust, celMaiStramt: stramt, rele: rele.slice(0, 4), titlu: cal.title, text: vechi, asteptat, progLat }
    })()`)
    p.win.setContentSize(1100, H)
    await astepta(700)
    const r = await masoara(1100)
    p.win.setContentSize(W, H)
    await astepta(700)
    const r2 = await masoara(W)
    const bine = (x, latime) => x.latime === latime && !x.marca && x.seturi === 32 && x.cate >= 32 * 25 && x.rele.length === 0 && x.celMaiLat.lat - x.celMaiIngust.lat <= 1 && x.progLat !== null && x.progLat.candidati >= 100
    // Si bara nu se misca atunci cand se schimba textul: calendarul are aceeasi latime pentru oricare din ele.
    bifa('bara-sus', bine(r, 1100) && bine(r2, W) && r.despliate === 1 && r2.despliate === 3,
      'bara de sus la 1.100 si la 1.280 px, in cazul cel mai rau (oricare din cele 5 insigne, cu 12 pe fiecare, pliate peste una / trei in „N alerte"; cel mai lat text al prognozei hranei, masurat printre toate ale lui textZile; „≈1,2×"; cel mai lat calendar al fiecarui anotimp): nimic nu iese din bara, calendarul e pe un rand, de aceeasi latime pentru orice text, fara marca KINSTEAD',
      JSON.stringify({ l1100: { latime: r.latime, marca: r.marca, cate: r.cate, despliate: r.despliate, variante: r.variante, prognoza: r.progLat, celMaiStramt: r.celMaiStramt, celMaiLat: r.celMaiLat, celMaiIngust: r.celMaiIngust, rele: r.rele }, l1280: { latime: r2.latime, cate: r2.cate, despliate: r2.despliate, prognoza: r2.progLat, celMaiStramt: r2.celMaiStramt, rele: r2.rele } }))
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
  // --- 6g. temperatura: pe pagina ei, la final (`paginaTermica`, t.2b §8). Aici lumea jocului nu avanseaza pentru
  // temperatura: avansul real ar lasa pionii sa lucreze ore intregi, iar bifele de dupa (sertarul, depozitul, salvarea)
  // ar primi alta lume (verif-UI-5).
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
    // Cazul cel mai lat, nu textele de acum (t.2b, verif-UI-5): cu „Stă: lipsește materialul pentru construit" (orice plan
    // mai mare decat piatra din mormane) coloana `td.act` se rupe pe doua linii, apare bara verticala, iar la 470 px tabelul
    // nu mai incapea — bifa de mai sus era verde doar fiindca proba nu lasa pionii fara material. Textul lung se scrie DOAR
    // in DOM, pe fiecare rand, si se pune la loc in aceeasi evaluare (lumea nu se atinge); la 1.280 si la 1.100 px
    // (LATIME_UI). Cu bara verticala de fata (altfel cazul nu e exercitat); la 1.100, sertarul nu acopera nimic din
    // stanga (coloana, legenda, Primii pasi) si nici randurile barei de jos. Toasturile NU intra in conditie: sunt trecatoare
    // si centrate, iar la 1.100 px unul de 278 px intra in sertar cu 84 px (si la 470 px, cu 69) — scrise in cifra bifei.
    if (NEGATIVA === 'sertar') await p.js(`(() => { const st = document.createElement('style'); st.id = 'neg-sertar'; st.textContent = '.ui-oameni { scrollbar-gutter: auto !important } .ui-dreapta:has(.ui-oameni:not([hidden])) { width: 470px !important }'; document.head.appendChild(st); return true })()`)
    const masoaraLung = () => p.js(`(() => {
      const c = document.querySelector('.ui-oameni'), dr = document.querySelector('.ui-dreapta')
      const celule = [...c.querySelectorAll('tbody td.act')]
      const vechi = celule.map((td) => td.textContent)
      celule.forEach((td) => { td.textContent = 'Stă: lipsește materialul pentru construit' })
      const r = dr.getBoundingClientRect()
      // offsetParent e null pentru elementele „position: fixed" (coloana stanga, legenda, Primii pasi): vizibil = are cutie.
      const vizibil = (e) => e !== null && !e.hidden && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden'
      const altele = [['stanga', '.ui-stanga'], ['legenda', '.ui-legenda'], ['pasi', '.ui-pasi'], ['sus', '.ui-sus'], ...[...document.querySelectorAll('.ui-jos > .ui-sub, .ui-jos > .ui-unelte, .ui-jos > .ui-indiciu')].map((e, i) => ['jos' + i, e]), ...[...document.querySelectorAll('.ui-jos .ui-toast')].map((e, i) => ['toast' + i, e])]
        .map(([n, s]) => [n, typeof s === 'string' ? document.querySelector(s) : s]).filter(([, e]) => vizibil(e))
      const peste = altele.map(([n, e]) => { const q = e.getBoundingClientRect(); return { n, cls: e.className, text: e.textContent.slice(0, 40), cutie: [q.left, q.top, q.right, q.bottom].map(Math.round), x: Math.max(0, Math.min(r.right, q.right) - Math.max(r.left, q.left)), y: Math.max(0, Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top)) } }).filter((o) => o.x > 0 && o.y > 0)
      const out = { latime: innerWidth, randuri: celule.length, sw: c.scrollWidth, cw: c.clientWidth, sh: c.scrollHeight, ch: c.clientHeight, sertar: [Math.round(r.left), Math.round(r.right), Math.round(r.bottom)], verificate: altele.map(([n]) => n), peste }
      celule.forEach((td, i) => { td.textContent = vechi[i] })
      return out
    })()`)
    const lung = []
    for (const latime of [W, 1100]) {
      if (latime !== W) { p.win.setContentSize(latime, H); await astepta(700) }
      lung.push(await masoaraLung())
    }
    p.win.setContentSize(W, H)
    await astepta(500)
    await p.js(`document.getElementById('neg-sertar')?.remove(); true`)
    bifa('sertar-oameni-lung', lung.every((m) => m.randuri >= 6 && m.sh > m.ch && m.sw <= m.cw && m.peste.every((o) => o.n.startsWith('toast'))) && lung[1].latime === 1100 && lung.every((m) => m.verificate.includes('stanga') && m.verificate.some((n) => n.startsWith('jos'))),
      'sertarul Oameni cu „Stă: lipsește materialul pentru construit" pe fiecare rand (bara verticala de fata), la 1.280 si 1.100 px: fara derulare orizontala, si nu acopera coloana stanga, legenda, Primii pasi sau bara de jos', JSON.stringify(lung))
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
  // --- 9a. M5 pe ecran (t.2b §8, UI-4): lumea de dupa Ctrl+S merge 1687 de tickuri REALE (nu un multiplu de 20: trece si
  // peste faza pasului termic), iar hash-ul ei se compara cu al lumii incarcate, avansate la fel. Hash-ul schemei 8 cuprinde
  // (ancora, T, rest) ale fiecarei componente (§7), deci vede si mutantii M5 pe care T-ul de la incarcare nu-i vede (restul
  // nescris, faza socotita de la incarcare, resetul lenes — UI-4). DUPA capturile de mai sus: pionii lucreaza in avans, iar
  // „incarca-desemnari" iesea rosie cu avansul inaintea lor (UI-4). Pe o lume fara componente hash-ul n-ar vedea temperatura.
  // Hrana (t.3, UI-8): hash-ul schemei 9 cuprinde S-ul alterarii; preconditia e ca Σ S (mormane + maini) sa fie ≠ 0 la salvare
  // si sa se fi SCHIMBAT in fereastra (orice hrana peste prag il schimba la fiecare pas de 1 Hz) — „s-a stricat o unitate"
  // pica in ~16% din fazele salvarii (mormanele identice pierd sincron), Σ S nu.
  const hashDupaAvans = (k) => `(async () => {
    const H = await import('/@fs/${REPO}/src/sim/hash.ts')
    const K = __kinstead, t0 = K.world.tick, s0 = K.hrana.sumaS(), r = K.avanseaza(${k})
    return { t0, tick: r.tick, rulate: r.rulate, hash: H.hashWorld(K.world), componente: K.world.camere.comp.size, pasi: K.world.temperatura.stat.pasi, simMs: Math.round(r.simMs), s0, s1: K.hrana.sumaS() }
  })()`
  let m5Joc = null
  if (salvare !== null) await pas('incarca-m5', async () => { m5Joc = await p.js(hashDupaAvans(1687)) })
  /** Erorile din consola ale jocului nou: `pagina()` le goleste la fiecare pagina noua, deci se iau INAINTE de plecare. */
  let eroriJoc = null
  // --- 9b. plecarea dintr-un joc nesalvat cere confirmare (INT-6): tick-ul inaintat dupa salvare ---
  await pas('plecare', async () => {
    await p.tasta(' ')
    await astepta(800)
    await p.tasta(' ')
    // Pana acum, „consola-joc-nou" citea la final erorile ULTIMEI pagini (cea incarcata): ale jocului nou se pierdeau aici.
    eroriJoc = [...p.erori]
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
    // M5 (9a): aceleasi 1687 de tickuri reale pe lumea incarcata → acelasi tick, acelasi hash.
    const m5 = await q.js(hashDupaAvans(NEGATIVA === 'incarca-m5' ? 1686 : 1687))
    bifa('incarca-m5', m5Joc !== null && m5.t0 === salvare.tick && m5Joc.t0 === salvare.tick && m5.rulate === m5.tick - m5.t0 && m5.tick === m5Joc.tick && m5.hash === m5Joc.hash && m5.componente >= 1 && m5Joc.pasi > 0 && m5.pasi > 0
      && m5Joc.s0 > 0 && m5Joc.s1 !== m5Joc.s0 && m5.s0 === m5Joc.s0 && m5.s1 === m5Joc.s1,
      'M5 pe ecran: dupa 1687 de tickuri reale, lumea incarcata are acelasi tick si acelasi hash (cu temperaturile componentelor si S-ul alterarii) ca lumea care a mers mai departe dupa Ctrl+S; Σ S ≠ 0 la salvare, incarcat la fel, si schimbat in fereastra (preconditia, UI-8)', JSON.stringify({ joc: m5Joc, incarcat: m5 }))
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
  // Jocul nou: erorile luate la plecare (9b); fara plecare (o exceptie inainte), cele de acum.
  const ej = eroriJoc ?? p.erori
  if (ej.length) bifa('consola-joc-nou', false, 'fara erori in consola (jocul nou)', ej.join(' | '))
  // --- 11. temperatura, pe pagina ei ---
  await paginaTermica()
  // --- 12. hrana (t.3 §8), pe paginile ei ---
  await paginaHranei()
  await paginaAlterarii()
}

/**
 * Temperatura pe ecran (t.2b §8; panoul t.2b: UI-3, UI-4, UI-5, UI-7, UI-8; verif-UI-5), pe PAGINA EI, ultima: ui-fum are
 * o singura fereastra, iar o pagina noua pierde lumea celei vechi, deci pagina termica sta dupa incarcare (verif-UI-5).
 *
 * CONTRACTUL LUMII. `?joc=nou&seed=7&oameni=1&piatra=0&hrana=230`, pusa pe pauza cu Spatiu (`pauza=1` e ignorat pe un joc
 * nou: verif-UI-5). Prin comenzile simularii, in pauza: casa A — 5×5×2 de piatra, SIGILATA (fara usa), acoperita inel cu
 * inel ca la 6c — si casa B, 3×3×2, la 3 celule de ea, cu acoperisul fara celula din mijloc. Pionul TINUT in casa A e pus
 * in mijlocul ei cu `spawnAgent`; MECANISMUL care il tine e incaperea sigilata: fara usa nu iese, iar pionul liber al
 * jocului nou nu intra. (Masurat in node la valul 2 al t.2b, aceeasi casa: pionul e inauntru la fiecare din primele 20
 * de ore, apoi pleaca din colonie intre ora 19 si 20 — de aceea randul oamenilor se citeste PRIMUL, iar asteptarile se
 * fac pe sferturi de ora.) Nicio desemnare, nicio piatra: nimeni n-are
 * de lucru; fiecare avans numara editarile din AMPRENTA caselor (±1), citite din `terrain.jurnal`, iar bifa
 * „temperatura-fara-clic" le cere 0. Timpul trece doar prin `__kinstead.avanseaza(n)` (tickuri reale, aceeasi cale ca
 * `stepSim`) sau cu jocul pornit — niciun `world.tick +=` (sabotajul „se-misca" il foloseste tocmai ca sa iasa rosu; iar
 * „exceptie-tick", ULTIMUL pas, sare ceasul 11 minute DUPA ce simularea s-a oprit, ca sa vina momentul salvarii automate:
 * lumea aceea nu mai e citita de nicio bifa).
 * Conditiile se scriu pe Q16, citite prin `__kinstead` din stare, cu preconditii (|T_afara − T| ≥ 1 °C) asteptate cel mult
 * 12 h de joc (cu pionul inauntru, X_tot sta la ~1,7 °C peste X: ziua, „trage spre" e chiar aerul de afara) si bucle de
 * cel mult 4 h de joc pana la o schimbare, pe CASA: o pivnita si-ar schimba textul o data la ~14 min reale (B6).
 */
async function paginaTermica() {
  let pT = null
  let casa = null
  await pas('pagina-termica', async () => {
    pT = await pagina('?joc=nou&seed=7&oameni=1&piatra=0&hrana=230')
    if (!(await pT.js('__kinstead.stare().pauza'))) await pT.tasta(' ')
    // Ajutoarele paginii termice: modulele simularii (ACELEASI instante ca ale aplicatiei — src/ se serveste pe /@fs/,
    // verificat mai jos pe graful incremental, care sta intr-un WeakMap de modul) si citirile pe Q16.
    await pT.js(`(async () => {
      const imp = (f) => import('/@fs/${REPO}/' + f)
      const [T, S, C, Cl, Te, Cmd, H] = await Promise.all(['viewer/ui/texte.ts', 'src/sim/temperatura.ts', 'src/sim/camere.ts', 'src/sim/clima.ts', 'src/sim/termic.ts', 'src/sim/commands.ts', 'src/sim/hash.ts'].map(imp))
      globalThis.__t = {
        T, S, C, Cl, Te, Cmd, H, casa: null, editariAmprenta: 0,
        comp(x, y, z) { return C.componentaLa(__kinstead.world.camere, x, y, z) },
        compA() { const c = this.casa; return this.comp(c.x0 + 1, c.y0 + 1, c.s + 1) },
        // T, X (fara oameni), X_tot (cu oamenii aratati de filtru, ca inspectorul), afara, oamenii — Q16, din stare.
        termic(id) {
          const K = __kinstead, w = K.world, R = K.rules
          const t = S.temperaturaAcum(w, id), tr = S.tragerea(w, R, id), n = K.filtruOameni.oameni(w, id)
          return { comp: id, t, x: tr.ok ? tr.value.xQ16 : null, xTot: tr.ok ? S.tragereCuOameni(tr.value, n * R.termic.omW) : null, n, afara: Cl.tAfara(w.seed, w.tick, R), tick: w.tick, refuz: tr.ok ? null : String(tr.params?.motiv ?? tr.reason) }
        },
        casaA() { const c = this.compA(); return c === null ? null : { ...this.termic(c.id), volum: c.volum, deschise: c.deschise } },
        // Cifrele lui U: span-ul fiecarei ancore, valoarea overlay-ului, T-ul din stare si textul asteptat din el.
        cifre() {
          const K = __kinstead, o = K.tempOverlay, s = K.etichete ? K.etichete() : null, w = K.world
          if (!s) return null
          return s.spanuri.map((e, i) => {
            const a = o.ancore[i], st = a ? S.temperaturaAcum(w, a.comp) : null
            return { comp: a ? a.comp : null, x: a ? a.x : null, y: a ? a.y : null, vizibil: !e.hidden && !s.radacina.hidden, text: e.textContent, valoare: a ? (o.valori.get(a.comp) ?? null) : null, stare: st, asteptat: st === null ? '' : T.textEticheta(st) }
          })
        },
        cifraLa(x0, y0, x1, y1) { return (this.cifre() ?? []).find((q) => q.x !== null && q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1) ?? null },
        cifraCasei() { const c = this.casa; return this.cifraLa(c.x0 + 1, c.y0 + 1, c.x0 + 3, c.y0 + 3) },
        legenda() {
          const L = document.querySelector('.ui-legenda')
          if (!L || L.hidden) return null
          const b = L.querySelector('h3 button'), r = b ? b.getBoundingClientRect() : null
          const x = r ? r.x + r.width / 2 : null, y = r ? r.y + r.height / 2 : null
          return { titlu: L.querySelector('h3 span')?.textContent ?? '', cifre: L.querySelector('.cifre')?.textContent ?? '', buton: b ? b.textContent : null, x, y, peButon: r ? document.elementFromPoint(x, y)?.closest('button') === b : false }
        },
        // Ce TREBUIE sa scrie legenda: intervalul T-urilor din STARE ale componentelor desenate, aerul de afara la tickul lumii.
        legendaAsteptata() {
          const K = __kinstead, w = K.world
          let n = 0, mn = Infinity, mx = -Infinity
          for (const id of K.tempOverlay.valori.keys()) { const t = S.temperaturaAcum(w, id); if (t === null) continue; n++; mn = Math.min(mn, t); mx = Math.max(mx, t) }
          return T.textIntervalTemperatura(n, mn, mx, Cl.tAfara(w.seed, w.tick, K.rules))
        },
        randuri() {
          const g = (s) => document.querySelector(s)
          return { inc: g('.ui-incapere')?.textContent ?? '', h2: g('.ui-sertar h2')?.textContent ?? '', linie: g('.ui-termic-t')?.textContent ?? '', num: g('.ui-termic-t')?.classList.contains('num') ?? false, tragere: g('.ui-termic-x')?.textContent ?? '', oameni: g('.ui-termic-o')?.textContent ?? '', canale: g('.ui-termic-canale')?.textContent ?? '' }
        },
        // Avansul REAL (sau, doar pentru sabotajul „se-misca", timpul sarit), cu editarile din amprenta caselor A si B.
        avans(n, sari = false) {
          const K = __kinstead, t = K.world.terrain, e0 = t.editari, c = this.casa
          let r
          if (sari) { K.world.tick += n; r = { tick: K.world.tick, rulate: 0, simMs: 0, remeshMs: 0 } } else r = K.avanseaza(n)
          const e1 = t.editari
          let inAmprenta = 0
          for (let m = Math.max(e0, e1 - 65536); m < e1; m++) {
            const j = (m % 65536) * 3, x = t.jurnal[j], y = t.jurnal[j + 1]
            if ((x >= c.x0 - 1 && x <= c.x0 + 5 && y >= c.y0 - 1 && y <= c.y0 + 5) || (x >= c.bx - 1 && x <= c.bx + 3 && y >= c.by - 1 && y <= c.by + 3)) inAmprenta++
          }
          this.editariAmprenta += inAmprenta
          return { tick: r.tick, rulate: r.rulate, simMs: Math.round(r.simMs), editari: e1 - e0, inAmprenta }
        },
        cadre(n) { return new Promise((ok) => { let k = 0; const f = () => { if (++k >= n) ok(k); else requestAnimationFrame(f) }; requestAnimationFrame(f) }) },
        // Pixelul pe care clicul cu modificatorii dati chiar tinteste celula (x, y, z; z null = orice cota), in jurul punctului proiectat.
        pixelPe(x, y, z, px, py, pz, m, raza = 30) {
          const K = __kinstead, q = __f.proj(px, py, pz)
          for (let r = 0; r <= raza; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
            const sx = Math.round(q.x) + dx, sy = Math.round(q.y) + dy
            if (document.elementFromPoint(sx, sy) !== K.renderer.domElement) continue
            const t = K.tintaLa(sx, sy, m)
            if (t.ok && t.wx === x && t.wy === y && (z === null || t.z === z)) return { x: sx, y: sy }
          }
          return null
        },
      }
      return true
    })()`)
    const loc = await pT.js(`(() => { const a = __kinstead.world.agents; return { x: Math.floor(a.x[0] / 1000), y: Math.floor(a.y[0] / 1000), z: a.z[0] } })()`)
    casa = await pT.js(`(() => {
      const K = __kinstead, w = K.world, Cmd = __t.Cmd
      const tx = ${loc.x}, ty = ${loc.y}
      const liber = (x0, y0) => {
        const a = w.agents; for (let i = 0; i < a.count; i++) if (a.alive[i]) { const x = Math.floor(a.x[i] / 1000), y = Math.floor(a.y[i] / 1000); if (x >= x0 - 3 && x <= x0 + 14 && y >= y0 - 3 && y <= y0 + 8) return false }
        const it = w.iteme; for (let i = 0; i < it.count; i++) if (it.alive[i] && it.wx[i] >= x0 - 3 && it.wx[i] <= x0 + 14 && it.wy[i] >= y0 - 3 && it.wy[i] <= y0 + 8) return false
        return w.desemnari.vii === 0
      }
      for (let r = 8; r < 80; r++) for (let dx = -r; dx <= r; dx++) for (const dy of [-r, r]) {
        const x0 = tx + dx, y0 = ty + dy, s = K.suprafata(x0, y0)
        if (s === null || !liber(x0, y0)) continue
        let plat = true
        for (let a = -1; a <= 12 && plat; a++) for (let b = -1; b <= 5; b++) if (K.suprafata(x0 + a, y0 + b) !== s) { plat = false; break }
        if (!plat) continue
        const fill = (x, y, z) => Cmd.applyCommand(w, { kind: 'fill', wx: x, wy: y, z, material: 6 }).ok
        let ok = true
        // Casa A: zidurile FARA usa, apoi acoperisul inel cu inel (ca la 6c).
        for (let z = s + 1; z <= s + 2; z++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) if (a === 0 || a === 4 || b === 0 || b === 4) ok = fill(x0 + a, y0 + b, z) && ok
        for (let inel = 0; inel < 3; inel++) for (let a = 0; a < 5; a++) for (let b = 0; b < 5; b++) if (Math.min(a, b, 4 - a, 4 - b) === inel) ok = fill(x0 + a, y0 + b, s + 3) && ok
        // Casa B, la 3 celule spre est: 3×3×2 de piatra (o celula de aer, cat o camara), acoperisul FARA celula din
        // mijloc — coloana ei e inca cer, deci nu e nicio componenta acolo; „temperatura-incapere-noua" o inchide.
        const bx = x0 + 8, by = y0 + 1
        for (let z = s + 1; z <= s + 2; z++) for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== 1 || b !== 1) ok = fill(bx + a, by + b, z) && ok
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a !== 1 || b !== 1) ok = fill(bx + a, by + b, s + 3) && ok
        // Pionul TINUT: in mijlocul casei sigilate.
        const pion = Cmd.applyCommand(w, { kind: 'spawnAgent', x: (x0 + 2) * 1000 + 500, y: (y0 + 2) * 1000 + 500, z: s + 1, faction: 0 })
        return { x0, y0, s, bx, by, ok, pion: pion.ok }
      }
      return null
    })()`)
    if (casa === null || !casa.ok || !casa.pion) { bifa('pagina-termica', false, 'pagina termica: casele A si B, pionul tinut', JSON.stringify(casa)); casa = null; return }
    await pT.js(`__t.casa = ${JSON.stringify(casa)}; true`)
    // Trei pasi termici (filtrul are 3 esantioane cu pionul inauntru) si casa desenata (remesh din jurnal), tot in pauza.
    const a0 = await pT.js('__t.avans(60)')
    await astepta(300)
    const r = await pT.js(`(() => {
      const K = __kinstead, w = K.world, c = __t.casa, A = __t.compA()
      const oameniA = A === null ? null : (__t.S.oameniPeComponente(w).get(A.id) ?? 0)
      const graf = __t.Te.grafulIncremental(w.camere, K.rules)
      return { pauza: K.stare().pauza, A: A === null ? null : { volum: A.volum, deschise: A.deschise, T: __t.S.temperaturaAcum(w, A.id) }, oameniA, aratati: A === null ? null : K.filtruOameni.oameni(w, A.id),
        casaB: __t.comp(c.bx + 1, c.by + 1, c.s + 1) === null, desemnari: w.desemnari.vii, grafAcelasiModul: graf.ok, invarianti: w.temperatura.stat.invarianti, pasi: w.temperatura.stat.pasi }
    })()`)
    bifa('pagina-termica', r.pauza && r.A !== null && r.A.volum === 18 && r.A.deschise === 0 && r.A.T !== null && r.oameniA === 1 && r.aratati === 1 && r.casaB && r.desemnari === 0 && r.grafAcelasiModul && r.invarianti === 0 && r.pasi >= 3 && a0.inAmprenta === 0,
      'pagina termica (contractul lumii): pauza, casa A sigilata de 18 m³ cu pionul tinut inauntru (si aratat de filtru), casa B inca deschisa spre cer (nicio componenta), nicio desemnare; modulele simularii din proba sunt ale aplicatiei (graful incremental vazut), 0 invarianti', JSON.stringify({ casa, avans: a0, ...r }))
  })
  if (pT === null || casa === null) return
  const { x0: hx, y0: hy, s: hs, bx, by } = casa
  const eticheta = () => pT.js(`document.querySelector('.ui-nivel .rel')?.textContent ?? ''`)
  const tastaNivel = async (k) => {
    const inainte = await eticheta()
    await pT.tasta(k)
    for (let j = 0; j < 30 && (await eticheta()) === inainte; j++) await astepta(50)
  }
  /** Nivelul aerului casei (sol +1), ca la 6c: dupa fiecare tasta se ASTEAPTA eticheta noua. */
  const laNivelulCasei = async () => {
    await pT.js(`__f.centreaza(${hx + 2.5}, ${hy + 2.5}, ${hs + 1}, 9)`)
    await astepta(250)
    await tastaNivel('q')
    for (let i = 0; i < 8; i++) {
      const rel = await eticheta()
      if (rel === 'sol +1') break
      await tastaNivel(/sol \+[2-9]/.test(rel) ? 'q' : 'e')
    }
  }
  const casaA = () => pT.js('__t.casaA()')
  const Q = 65536
  const grade = (q) => (q === null || q === undefined ? null : +(q / Q).toFixed(3))

  // --- 11a. U: tasta, tenta, cifra, legenda ---
  await pas('temperatura', async () => {
    await pT.tasta('v')
    await laNivelulCasei()
    const stare = () => pT.js(`(() => {
      const K = __kinstead, o = K.tempOverlay, g = K.scene.getObjectByName('overlay-temperatura'), leg = __t.legenda()
      return {
        vizibil: o.visible, nivel: o.nivel ?? null, grup: g ? g.visible : null,
        plase: g ? g.children.map((c) => ({ tip: c.type, varfuri: c.geometry?.getAttribute('position')?.count ?? 0, culori: !!c.geometry?.getAttribute('color') })) : [],
        cifra: __t.cifraCasei(), buton: document.querySelector('button[data-harta="U"]')?.getAttribute('aria-pressed') ?? null,
        legenda: leg === null ? null : leg.titlu + ' | ' + leg.cifre, legendaAsteptata: __t.legendaAsteptata(),
      }
    })()`)
    const s0 = await stare()
    await pT.tasta('u')
    await astepta(500)
    const s1 = await stare()
    bifa('temperatura-tasta', s0.vizibil === false && s1.vizibil === true && s1.buton === 'true' && s1.nivel === hs + 1, 'tasta U aprinde overlay-ul Temperatura pe nivelul casei (butonul `data-harta="U"` din „Hărți" apasat)', JSON.stringify({ s0: { vizibil: s0.vizibil, buton: s0.buton }, s1: { vizibil: s1.vizibil, nivel: s1.nivel, buton: s1.buton }, hs }))
    bifa('temperatura-tenta', s1.grup === true && (s1.plase ?? []).some((c) => c.tip === 'Mesh' && c.culori && c.varfuri >= 9 * 6), 'overlay-ul U: tenta e in scena (o plasa cu culori pe varf, cel putin cele 9 celule ale casei)', JSON.stringify(s1.plase))
    bifa('temperatura-etichete', s1.cifra !== null && s1.cifra.vizibil && /^−?\d+,\d°$/.test(s1.cifra.text) && s1.cifra.text === s1.cifra.asteptat && s1.cifra.valoare === s1.cifra.stare,
      'overlay-ul U: o cifra pe casa, ancorata in interiorul ei, vizibila si EGALA cu T-ul ei din stare („13,2°" == textEticheta(T))', JSON.stringify(s1.cifra))
    bifa('temperatura-legenda', /^Temperatură \(U\) \| /.test(s1.legenda ?? '') && /^(~−?\d+,\d|−?\d+,\d … −?\d+,\d) °C · afară −?\d+ °C$/.test((s1.legenda ?? '').split(' | ')[1] ?? '') && (s1.legenda ?? '').endsWith(' | ' + s1.legendaAsteptata),
      'legenda lui U: intervalul T-urilor de la nivel (din stare) si aerul de afara, fara „la echilibru"', JSON.stringify({ legenda: s1.legenda, asteptat: s1.legendaAsteptata }))
    await pT.poza('7-temperatura-overlay.png')
  })

  // --- 11b. inspectorul pe podeaua casei, cu pionul tinut inauntru: cele trei randuri din stare ---
  await pas('temperatura-inspector', async () => {
    // Clicul pe podea, pe celula cea mai departe de pion (un clic la PION_PX de el il selecteaza pe el).
    const tinta = await pT.js(`(() => {
      const K = __kinstead, a = K.world.agents, c = __t.casa
      let pp = null
      for (let i = 0; i < a.count; i++) if (a.alive[i]) { const x = a.x[i] / 1000, y = a.y[i] / 1000; if (x >= c.x0 + 1 && x < c.x0 + 4 && y >= c.y0 + 1 && y < c.y0 + 4) pp = __f.proj(x, a.z[i] + 0.7, y) }
      const celule = []
      for (let x = c.x0 + 1; x <= c.x0 + 3; x++) for (let y = c.y0 + 1; y <= c.y0 + 3; y++) { const q = __f.proj(x + 0.5, c.s + 1, y + 0.5); celule.push({ x, y, d: pp === null ? 0 : Math.hypot(q.x - pp.x, q.y - pp.y) }) }
      celule.sort((u, v) => v.d - u.d)
      for (const e of celule) { const px = __t.pixelPe(e.x, e.y, null, e.x + 0.5, c.s + 1, e.y + 0.5, { ctrl: false, shift: false, alt: false }, 20); if (px !== null && (pp === null || Math.hypot(px.x - pp.x, px.y - pp.y) > 30)) return { ...px, celula: [e.x, e.y], pion: pp } }
      return null
    })()`)
    if (tinta !== null) await pT.click(tinta.x, tinta.y)
    await astepta(600)
    const r = await pT.js(`(() => {
      const A = __t.casaA(), R = __t.randuri()
      return { R, A, linie: A === null || A.t === null ? null : __t.T.textTemperaturaAcum(A.t, A.afara), tragere: A === null || A.xTot === null ? null : __t.T.textTragere(A.t, A.xTot), oameni: A === null ? null : __t.T.textOameni(A.n) }
    })()`)
    const R = r.R
    bifa('temperatura-inspector', tinta !== null && /Încăpere · 18 m³/.test(R.inc)
      && /^−?\d+,\d °C · afară −?\d+ °C$/.test(R.linie) && R.linie === r.linie && R.num
      && /^(trage spre −?\d+,\d °C [↘↗]|stabil)$/.test(R.tragere) && R.tragere === r.tragere
      && R.oameni === 'oameni: 1 înăuntru' && r.oameni === R.oameni && r.A.xTot > r.A.x
      && /^\d+% aer de afară \(pereți \d+%, acoperiș \d+%, ~−?\d+ °C\) · \d+% sol prin podea \(~−?\d+ °C\)/.test(R.canale) && !/pierde|câștigă|la echilibru/.test(R.inc),
      'inspectorul pe podeaua casei cu pionul tinut: „T °C · afară N °C" (din stare), „trage spre X_tot" (linia grafului + omul aratat, X_tot > X), „oameni: 1 înăuntru", descompunerea; fara „la echilibru"',
      JSON.stringify({ tinta, randuri: R, asteptat: { linie: r.linie, tragere: r.tragere, oameni: r.oameni }, T: grade(r.A?.t), X: grade(r.A?.x), Xtot: grade(r.A?.xTot), afara: grade(r.A?.afara) }))
    await pT.poza('8-temperatura-inspector.png')
  })

  // --- 11b'. randurile FIXE ale inspectorului (recenzia t.2b, E6): pe ecran, in sertarul real, cu textele pe care jocul chiar
  // le scrie — cele 40 de descompuneri distincte cele mai lungi de pe componente reale (bench/canale-lungi.mjs, scoase la
  // FIECARE rulare: M10, casele fixturilor, mina) si variantele lor de iarna, plus randurile extreme —, apoi randul REAL fara
  // T: casa A pierde T-ul in pauza (ca la „alerta-termica"), iar panouri.ts scrie „Temperatura nu se știe" fara clasa `num`
  // (in monospatiat nu incape, V1). La 330 px (latimea sertarului) si la 315: butonul de sub descompunere („Arată nivelul")
  // pe ACELASI y pentru toate, iar randurile netaiate. Textele sintetice se scriu in DOM pe rand, intr-o singura evaluare
  // (nicio reimprospatare la mijloc), apoi se pun la loc; T-ul casei se pune la loc la final (in pauza nu ruleaza niciun pas).
  await pas('latime-inspector', async () => {
    const { canaleLungi } = await import('./canale-lungi.mjs')
    const lungi = canaleLungi(40)
    const canale = lungi.texte.map((c) => c.text)
    // Iarna: fiecare „~N °C" negativ, pe doua cifre („~6 °C" → „~−16 °C", „~16 °C" → „~−16 °C") — cazul cel mai lat realist.
    const iarna = canale.map((c) => c.replace(/~([0-9]+) °C/g, (_m, n) => `~−${n.length === 1 ? '1' + n : n} °C`))
    const necunoscut = await pT.js('__t.T.TEXT_TEMPERATURA_NECUNOSCUTA')
    // [T si afara, „trage spre", oamenii] — randuri cu T (randul 1 ramane in monospatiat, ca pe casa A).
    const randuri = [['−16,8 °C · afară −17 °C', 'trage spre −16,8 °C ↘', 'oameni: 12 înăuntru'], ['−199,9 °C · afară −17 °C', 'trage spre: nu se știe', 'oameni: 100 înăuntru'],
      ['4,4 °C · afară 4 °C', 'stabil', 'oameni: niciunul']]
    // Masuratoarea, in pagina: `__t.latime(f)` pune sertarul pe 330 (latimea lui) si pe 315 px si, la fiecare, cheama `f`, care
    // citeste y-ul butonului (`y()`) si randurile taiate (`taiat()`).
    await pT.js(`(() => {
      const q = (s) => document.querySelector(s)
      __t.latime = (f) => {
        const t = q('.ui-termic-t'), x = q('.ui-termic-x'), o = q('.ui-termic-o'), k = q('.ui-termic-canale'), dr = q('.ui-dreapta')
        const b = [...document.querySelectorAll('.ui-inspector button')].find((e) => /Arată nivelul/.test(e.textContent))
        if (!t || !x || !o || !k || !b || !dr) return { lipsa: [!!t, !!x, !!o, !!k, !!b, !!dr] }
        const y = () => Math.round(b.getBoundingClientRect().y * 10) / 10
        const taiat = () => [t, x, o].filter((e) => e.scrollWidth > e.clientWidth).map((e) => e.textContent)
        const out = []
        for (const latime of [null, 315]) {
          dr.style.width = latime === null ? '' : latime + 'px'
          out.push({ latime: Math.round(dr.getBoundingClientRect().width), ...f({ t, x, o, k, y, taiat }) })
        }
        dr.style.width = ''
        return { m: out }
      }
      return true
    })()`)
    if (NEGATIVA === 'latime') await pT.js(`(() => { const s = document.createElement('style'); s.id = 'proba-latime'; s.textContent = '.ui-termic-t, .ui-termic-x, .ui-termic-o { white-space: normal !important; min-height: 0 !important } .ui-termic-canale { min-height: 0 !important }'; document.head.append(s); return true })()`)
    let sint = null, real = null, inapoi = null, fixtura = null
    try {
      fixtura = await pT.js(`({ pauza: __kinstead.stare().pauza, ...__t.randuri() })`)
      sint = await pT.js(`__t.latime(({ t, x, o, k, y, taiat }) => {
        const vechi = [t.textContent, x.textContent, o.textContent, k.textContent]
        const r = { ys: [], taiate: [], hMax: 0 }
        for (const c of [...${JSON.stringify(canale)}, ...${JSON.stringify(iarna)}]) {
          k.textContent = c
          r.ys.push(y())
          r.hMax = Math.max(r.hMax, Math.round(k.getBoundingClientRect().height * 10) / 10)
        }
        k.textContent = vechi[3]
        for (const [a, c, d] of ${JSON.stringify(randuri)}) {
          t.textContent = a; x.textContent = c; o.textContent = d
          r.ys.push(y())
          r.taiate.push(...taiat())
        }
        t.textContent = vechi[0]; x.textContent = vechi[1]; o.textContent = vechi[2]
        r.ys = [...new Set(r.ys)]
        return r
      })`)
      // Randul REAL fara T: slotul casei A fara temperatura (ce face un invariant), apoi reimprospatarea sertarului.
      const id = await pT.js(`(() => { const A = __t.compA(), sl = __kinstead.world.temperatura.slot; if (A === null) return null; __t.areVechi = sl.are[A.id]; sl.are[A.id] = 0; return A.id })()`)
      if (id !== null) {
        try {
          await astepta(600)
          real = await pT.js(`__t.latime(({ t, x, o, k, y, taiat }) => ({ y: y(), taiate: taiat(), linie: t.textContent, num: t.classList.contains('num'), gol: [x.textContent, o.textContent, k.textContent].every((s) => s === '') }))`)
        } finally {
          await pT.js(`(() => { __kinstead.world.temperatura.slot.are[${id}] = __t.areVechi; return true })()`)
        }
        await astepta(600)
        inapoi = await pT.js(`({ T: __t.casaA()?.t ?? null, ...__t.randuri() })`)
      }
    } finally {
      if (NEGATIVA === 'latime') await pT.js(`(() => { document.getElementById('proba-latime')?.remove(); return true })()`)
    }
    const bunSint = (m) => m !== undefined && m.ys.length === 1 && m.taiate.length === 0
    const bunReal = (m, i) => m !== undefined && m.taiate.length === 0 && m.linie === necunoscut && !m.num && m.gol && sint.m[i] !== undefined && m.y === sint.m[i].ys[0]
    const latimi = (r) => r !== null && r.lipsa === undefined && r.m[0].latime === 330 && r.m[1].latime === 315
    bifa('latime-inspector', fixtura !== null && fixtura.pauza && fixtura.num && latimi(sint) && sint.m.every(bunSint) && latimi(real) && real.m.every(bunReal)
      && inapoi !== null && inapoi.T !== null && inapoi.num && inapoi.linie !== necunoscut,
      `rândurile fixe ale inspectorului, pe ecran: ${canale.length} descompuneri reale (${canale[0]?.length}…${canale[canale.length - 1]?.length} caractere, din ${lungi.componente} componente) + ${canale.length} de iarnă + 3 rânduri extreme, apoi rândul REAL fără T (scris de panouri.ts, fără „num"), la 330 și la 315 px — butonul de sub descompunere pe ACELAȘI y, niciun rând tăiat; T-ul casei pus la loc`,
      JSON.stringify({ fixtura, sint, real, inapoi }))
  })

  // --- 11c. avansul real muta T-ul casei (spre „trage spre"), iar cifra lui U urmeaza starea ---
  await pas('temperatura-se-misca', async () => {
    let A = await casaA()
    const pre = []
    for (let k = 0; k < 48 && !(Math.abs(A.afara - A.t) >= Q && Math.abs(A.xTot - A.t) >= Q); k++) { pre.push(await pT.js('__t.avans(420)')); A = await casaA() }
    const c0 = await pT.js('__t.cifraCasei()')
    const pasi = []
    let A1 = A
    let c1 = c0
    for (let h = 0; h < 4; h++) {
      pasi.push(await pT.js(`__t.avans(1680, ${NEGATIVA === 'se-misca'})`))
      await pT.js('__t.cadre(2)')
      A1 = await casaA()
      c1 = await pT.js('__t.cifraCasei()')
      if (c1 !== null && c0 !== null && c1.text !== c0.text) break
    }
    const spre = Math.sign(A.xTot - A.t)
    bifa('temperatura-se-misca', Math.abs(A.afara - A.t) >= Q && pasi[0].rulate === 1680 && A1.t !== A.t && Math.sign(A1.t - A.t) === spre && c0 !== null && c1 !== null && c1.text !== c0.text && c1.text === c1.asteptat && c1.valoare === A1.t,
      'avansul REAL (tickuri, nu timp sarit) muta T-ul casei spre „trage spre" (precondiții: |afară − T| ≥ 1 °C, |X_tot − T| ≥ 1 °C), iar cifra lui U se schimba si e textul T-ului din stare',
      JSON.stringify({ inainte: { T: grade(A.t), Xtot: grade(A.xTot), afara: grade(A.afara), tick: A.tick, cifra: c0?.text }, dupa: { T: grade(A1.t), tick: A1.tick, cifra: c1?.text, asteptat: c1?.asteptat }, preconditie: pre.length, avansuri: pasi }))
  })

  // --- 11d. cifrele lui U la zi cu STAREA, dupa ore de joc reale ---
  await pas('temperatura-etichete-la-zi', async () => {
    const c0 = await pT.js('__t.cifraCasei()')
    const pasi = []
    let toate = null
    for (let k = 0; k < 16; k++) {
      pasi.push(await pT.js('__t.avans(420)'))
      await pT.js('__t.cadre(2)')
      toate = await pT.js(`({ cifre: __t.cifre(), casa: __t.cifraCasei(), pauza: __kinstead.stare().pauza })`)
      if (toate.casa !== null && c0 !== null && toate.casa.text !== c0.text) break
    }
    const vizibile = (toate?.cifre ?? []).filter((x) => x.vizibil)
    const gresite = vizibile.filter((x) => x.text !== x.asteptat || x.valoare !== x.stare)
    bifa('temperatura-etichete-la-zi', toate !== null && toate.pauza && vizibile.length >= 1 && gresite.length === 0 && toate.casa !== null && c0 !== null && toate.casa.text !== c0.text,
      'cifrele lui U urmaresc lumea: dupa avans REAL (sferturi de ora, cel mult 4 h), cifra casei s-a schimbat, iar fiecare cifra vizibila == textEticheta(T-ul din STARE al componentei ei), cu valoarea overlay-ului == starea',
      JSON.stringify({ inainte: c0?.text, dupa: toate?.casa?.text, avansuri: pasi.length, vizibile: vizibile.length, gresite: gresite.slice(0, 4) }))
  })

  // --- 11e. fara clic: randurile inspectorului se schimba cu lumea, nodurile raman ---
  await pas('temperatura-fara-clic', async () => {
    const citeste = () => pT.js(`(() => {
      const b = [...document.querySelectorAll('.ui-inspector button')].find((x) => /Arată nivelul/.test(x.textContent))
      const l = document.querySelector('.ui-termic-t')
      if (!globalThis.__tempBtn) { globalThis.__tempBtn = b ?? null; globalThis.__tempLinie = l }
      return { buton: !!b, acelasi: b === globalThis.__tempBtn, liniaAceeasi: l === globalThis.__tempLinie, randuri: __t.randuri(), editariAmprenta: __t.editariAmprenta, pauza: __kinstead.stare().pauza }
    })()`)
    await pT.js('globalThis.__tempBtn = null; true')
    const inainte = await citeste()
    let dupa = inainte
    const pasi = []
    for (let k = 0; k < 16 && dupa.randuri.linie === inainte.randuri.linie && dupa.randuri.tragere === inainte.randuri.tragere; k++) {
      pasi.push(await pT.js('__t.avans(420)'))
      for (let i = 0; i < 4; i++) { await astepta(150); dupa = await citeste(); if (dupa.randuri.linie !== inainte.randuri.linie || dupa.randuri.tragere !== inainte.randuri.tragere) break }
    }
    await astepta(300)
    dupa = await citeste()
    const asteptat = await pT.js(`(() => { const A = __t.casaA(); return { linie: __t.T.textTemperaturaAcum(A.t, A.afara), tragere: __t.T.textTragere(A.t, A.xTot) } })()`)
    const inCasa = pasi.reduce((s, x) => s + x.inAmprenta, 0)
    bifa('temperatura-fara-clic', inainte.buton && inainte.randuri.linie !== '' && (dupa.randuri.linie !== inainte.randuri.linie || dupa.randuri.tragere !== inainte.randuri.tragere) && dupa.acelasi && dupa.liniaAceeasi && dupa.pauza && inCasa === 0 && dupa.randuri.linie === asteptat.linie && dupa.randuri.tragere === asteptat.tragere,
      'fara niciun clic, randurile temperaturii din inspector se schimba cu lumea (avans real) si raman textele starii, iar butonul „Arată nivelul" e ACELASI nod; 0 editari in amprenta casei (terrain.jurnal)',
      JSON.stringify({ inainte: inainte.randuri, dupa: dupa.randuri, asteptat, acelasi: dupa.acelasi, liniaAceeasi: dupa.liniaAceeasi, editariInAmprenta: inCasa, editari: pasi.reduce((s, x) => s + x.editari, 0), avansuri: pasi.length }))
  })

  // --- 11f. clicul pe legenda nu se pierde cand intervalul ei se schimba intre mousedown si mouseup (L4-3) ---
  await pas('temperatura-legenda-clic', async () => {
    let reusite = 0
    let reimprospatate = 0
    const clicuri = []
    const interval = (l) => (l?.cifre ?? '').split(' · afară')[0]
    for (let k = 0; k < 6; k++) {
      const l0 = await pT.js('__t.legenda()')
      if (l0 === null || !l0.peButon) { clicuri.push({ k, l0 }); continue }
      await pT.muta(l0.x, l0.y)
      await pT.apasa(l0.x, l0.y)
      let l1 = l0
      let avansuri = 0
      for (let j = 0; j < 16 && l1 !== null && interval(l1) === interval(l0); j++) {
        await pT.js('__t.avans(420)')
        avansuri++
        for (let i = 0; i < 6; i++) { await astepta(100); l1 = await pT.js('__t.legenda()'); if (interval(l1) !== interval(l0)) break }
      }
      if (l1 !== null && interval(l1) !== interval(l0)) reimprospatate++
      await pT.elibereaza(l0.x, l0.y)
      await astepta(300)
      const l2 = await pT.js('__t.legenda()')
      if (l2 !== null && l2.buton !== l0.buton) reusite++
      clicuri.push({ k, inainte: l0.buton, dupa: l2?.buton ?? null, cifre: [l0.cifre, l1?.cifre ?? null], avansuri })
    }
    bifa('temperatura-legenda-clic', reusite === 6 && reimprospatate === 6,
      'legenda lui U: 6 din 6 clicuri pe „Ce înseamnă / Ascunde culorile" reusesc, fiecare cu INTERVALUL legendei schimbat (avans real, nu doar „afară") intre mousedown si mouseup', JSON.stringify({ reusite, reimprospatate, clicuri }))
  })

  // --- 11g. I si U se exclud; butonul din „Hărți" (selectorii pe `data-harta`, nu pe titlu) ---
  await pas('temperatura-exclude-I', async () => {
    const iu = () => pT.js(`({ I: document.querySelector('button[data-harta="I"]')?.getAttribute('aria-pressed') ?? null, U: document.querySelector('button[data-harta="U"]')?.getAttribute('aria-pressed') ?? null, tu: __kinstead.tempOverlay.visible })`)
    const iu0 = await iu()
    await pT.tasta('i')
    await astepta(400)
    const iu1 = await iu()
    await pT.tasta('u')
    await astepta(400)
    const iu2 = await iu()
    bifa('temperatura-exclude-I', iu0.U === 'true' && iu0.I === 'false' && iu1.I === 'true' && iu1.U === 'false' && !iu1.tu && iu2.U === 'true' && iu2.I === 'false' && iu2.tu,
      'I si U se exclud in ambele sensuri: cu U aprins, I stinge U; cu I aprins, U stinge I', JSON.stringify({ iu0, iu1, iu2 }))
    await pT.tasta('u')
    await astepta(300)
    const s2 = await pT.js('__kinstead.tempOverlay.visible')
    const bT = await pT.js(`(() => { const b = document.querySelector('button[data-harta="U"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, titlu: b.title } })()`)
    if (bT) await pT.click(bT.x, bT.y)
    await astepta(400)
    const s3 = await pT.js(`({ vizibil: __kinstead.tempOverlay.visible, buton: document.querySelector('button[data-harta="U"]')?.getAttribute('aria-pressed') ?? null, cifra: __t.cifraCasei() })`)
    bifa('temperatura-buton', s2 === false && bT !== null && s3.vizibil === true && s3.buton === 'true' && s3.cifra?.vizibil === true && s3.cifra.text === s3.cifra.asteptat,
      'butonul „Temperatură" din „Hărți" (`data-harta="U"`) aprinde overlay-ul dupa ce U l-a stins, cu cifra casei == T-ul din stare', JSON.stringify({ s2, bT, s3 }))
  })

  // --- 11h. pauza: contoarele SIMULARII nu se misca (0 pasi termici, 0 refaceri de graf), nici ce arata ecranul ---
  await pas('temperatura-pauza', async () => {
    const inst = () => pT.js(`(() => {
      const K = __kinstead, w = K.world, A = __t.compA()
      return { esant: K.filtruOameni.esantioane(), tick: w.tick, pauza: K.stare().pauza, pasi: w.temperatura.stat.pasi, stat: JSON.stringify(w.temperatura.stat), graf: JSON.stringify(__t.Te.statGraf(w.camere)), casa: A === null ? null : JSON.stringify(__t.termic(A.id)),
        ecran: JSON.stringify({ valori: [...K.tempOverlay.valori].sort((a, b) => a[0] - b[0]), recolorari: K.tempOverlay.recolorari, cifre: (__t.cifre() ?? []).map((x) => x.text), randuri: __t.randuri() }) }
    })()`)
    const p0 = await inst()
    // Sabotajul „filtru-bucla": cat jocul merge, filtrul nu mai e hranit (ca o bucla de cadre care da `simTick`, nu tickul observat).
    if (NEGATIVA === 'filtru-bucla') await pT.js(`(() => { const f = __kinstead.filtruOameni; f.__dupaTick = f.dupaTick; f.dupaTick = () => {}; return true })()`)
    // La 1× un pas termic vine la 20 de tickuri (1 s): 1,5 s pornit cuprinde cel putin unul.
    await pT.tasta(' ')
    await astepta(1500)
    const p1 = await inst()
    if (NEGATIVA === 'filtru-bucla') await pT.js(`(() => { const f = __kinstead.filtruOameni; f.dupaTick = f.__dupaTick; delete f.__dupaTick; return true })()`)
    if (NEGATIVA !== 'temperatura-pauza') await pT.tasta(' ')
    await astepta(400)
    const a = await inst()
    await astepta(3000)
    const b = await inst()
    if (NEGATIVA === 'temperatura-pauza') { await pT.tasta(' '); await astepta(300) }
    bifa('temperatura-pauza', p0.pauza && !p1.pauza && p1.pasi > p0.pasi && a.pauza && b.pauza && a.tick === b.tick && a.stat === b.stat && a.graf === b.graf && a.casa === b.casa && a.ecran === b.ecran,
      'pauza (Spatiu): 3 s fara niciun pas termic si fara refacere de graf (contoarele simularii identice), T si X ale casei identice pe Q16, la fel cifrele lui U, recolorarile si randurile inspectorului; cu jocul pornit, pasii cresc (contorul e viu)',
      JSON.stringify({ pornit: { pasi: [p0.pasi, p1.pasi], pauza: [p0.pauza, p1.pauza] }, pauza: { tick: [a.tick, b.tick], pasi: [a.pasi, b.pasi], statEgal: a.stat === b.stat, grafEgal: a.graf === b.graf, casaEgala: a.casa === b.casa, ecranEgal: a.ecran === b.ecran } }))
    // Recenzia t.2b, E3: cu jocul pornit (bucla de cadre, nu avanseaza), filtrul oamenilor ia cate un esantion la FIECARE pas
    // termic — pionul casei e sigilat, deci un filtru nehranit ar arata la fel; aici se numara esantioanele.
    bifa('filtru-bucla', p1.esant - p0.esant >= 1 && p1.esant - p0.esant === p1.pasi - p0.pasi,
      'cu jocul pornit (bucla de cadre), filtrul oamenilor primeste exact cate un esantion pe pas termic', JSON.stringify({ esant: [p0.esant, p1.esant], pasi: [p0.pasi, p1.pasi] }))
  })

  // --- 11i. cu jocul pornit la 3×: fiecare cifra a lui U == T-ul din stare, la fiecare citire (UI-3) ---
  await pas('temperatura-U-la-3x', async () => {
    const citire = () => pT.js(NEGATIVA === 'U-la-3x'
      // Sabotajul: starea se citeste, iar cifrele lui U abia la 400 ms dupa — cum ar arata o cifra ramasa un pas in urma.
      ? `(async () => { const w = __kinstead.world, st = new Map((__t.cifre() ?? []).map((x) => [x.comp, x.stare])), tick = w.tick; await new Promise((r) => setTimeout(r, 400)); return { tick, cifre: (__t.cifre() ?? []).map((x) => ({ ...x, stare: st.get(x.comp) ?? null, asteptat: st.get(x.comp) == null ? '' : __t.T.textEticheta(st.get(x.comp)) })) } })()`
      : `({ tick: __kinstead.world.tick, cifre: __t.cifre() ?? [] })`)
    await pT.tasta('3')
    await astepta(500)
    const esantioane = []
    for (let k = 0; k < 30; k++) { esantioane.push(await citire()); await astepta(170) }
    await pT.tasta(' ')
    await astepta(300)
    const pauza = await pT.js('__kinstead.stare().pauza')
    const casei = esantioane.map((e) => e.cifre.find((x) => x.x !== null && x.x >= hx + 1 && x.x <= hx + 3 && x.y >= hy + 1 && x.y <= hy + 3) ?? null)
    const gresite = esantioane.flatMap((e) => e.cifre.filter((x) => x.vizibil && (x.valoare !== x.stare || x.text !== x.asteptat)).map((x) => ({ tick: e.tick, ...x }))).slice(0, 4)
    const valori = new Set(casei.map((c) => c?.stare ?? null))
    bifa('temperatura-U-la-3x', pauza && esantioane.length === 30 && esantioane[29].tick - esantioane[0].tick >= 150 && casei.every((c) => c !== null && c.vizibil) && valori.size >= 5 && gresite.length === 0,
      'cu jocul pornit la 3×: la fiecare din 30 de citiri, fiecare cifra vizibila a lui U == textEticheta(T din stare) si valoarea overlay-ului == starea (nicio cifra cu un pas in urma); T-ul casei a luat ≥ 5 valori',
      JSON.stringify({ tickuri: [esantioane[0].tick, esantioane[29].tick], valoriCasa: valori.size, gresite }))
  })

  // --- 11j. o incapere noua, in pauza: cifra din cadrul urmator, cu T-ul provenientei ---
  // Casa B se inchide cu ultima celula de acoperis, prin comanda simularii (ca toate casele din ui-fum): planul de taiere
  // al nivelului la care U arata casa ascunde acoperisul, deci un Shift+clic nu-l poate atinge de acolo (`alegeTinta` ia
  // doar fete vazute sub plan) — iar ce se masoara aici e U, din cadrul urmator, fara niciun pas (jocul e pe pauza).
  await pas('temperatura-incapere-noua', async () => {
    await pT.js(`__f.centreaza(${bx + 1.5}, ${by + 1.5}, ${hs + 1}, 9)`)
    await astepta(400)
    const pre = await pT.js(`({ pauza: __kinstead.stare().pauza, nivel: __kinstead.tempOverlay.nivel, comp: __t.comp(${bx + 1}, ${by + 1}, ${hs + 1}) === null, cifra: __t.cifraLa(${bx}, ${by}, ${bx + 2}, ${by + 2}), pasi: __kinstead.world.temperatura.stat.pasi })`)
    const r = await pT.js(`(async () => {
      const K = __kinstead, w = K.world
      const inchisa = ${NEGATIVA === 'incapere-noua' ? 'false' : `__t.Cmd.applyCommand(w, { kind: 'fill', wx: ${bx + 1}, wy: ${by + 1}, z: ${hs + 3}, material: 6 }).ok`}
      const tick = w.tick, tSol0 = __t.Cl.tSol(0, tick, K.rules)
      // Doua cadre: cel in care overlay-ul vede indexul nou, si inca unul (cifrele DOM se scriu dupa overlay, in acelasi cadru).
      await __t.cadre(2)
      const C = __t.comp(${bx + 1}, ${by + 1}, ${hs + 1})
      if (C === null) return { inchisa, comp: null }
      const t = __t.S.temperaturaAcum(w, C.id)
      const cifra = (__t.cifre() ?? []).find((x) => x.comp === C.id) ?? null
      return { inchisa, comp: C.id, volum: C.volum, deschise: C.deschise, t, tSol0, valoare: K.tempOverlay.valori.get(C.id) ?? null, cifra, pauza: K.stare().pauza, pasi: w.temperatura.stat.pasi, tick, tickDupa: w.tick }
    })()`)
    globalThis.__casaB = r.comp
    bifa('temperatura-incapere-noua', pre.pauza && pre.comp && pre.cifra === null && pre.nivel === hs + 1 && r.inchisa && r.comp !== null && r.volum === 2 && r.deschise === 0 && r.pauza && r.pasi === pre.pasi && r.tickDupa === r.tick && r.t === r.tSol0 && r.valoare === r.t && r.cifra !== null && r.cifra.vizibil && r.cifra.text === r.cifra.asteptat,
      'casa B inchisa in pauza (ultima celula de acoperis): fara niciun pas, din cadrul urmator are cifra pe U == T din stare, iar T-ul e al provenientei (C3: singura masa persistenta e solul podelei → T_sol(0) la tickul inchiderii; zidurile, acoperisul si aerul de sub cer apar si iau T-ul rezultat)',
      JSON.stringify({ pre, ...r, T: grade(r.t), tSol0: grade(r.tSol0) }))
  })

  // --- 11k. un invariant provocat: alerta in Jurnal, toast, console.error, F3 ---
  await pas('alerta-termica', async () => {
    const tinta = globalThis.__casaB ?? (await pT.js('__t.compA()?.id ?? null'))
    const inainte = await pT.js(`({ inv: __kinstead.world.temperatura.stat.invarianti, jurnal: document.querySelector('.ui-alerte-antet button')?.textContent ?? '', f3: document.getElementById('termic')?.textContent ?? '' })`)
    const n0 = pT.erori.length
    // Componenta fara T (`are` golit): un invariant pe care pasul urmator il numara si il repara (T-ul ei de la echilibru).
    if (NEGATIVA !== 'alerta') await pT.js(`(() => { __kinstead.world.temperatura.slot.are[${tinta}] = 0; return true })()`)
    await pT.js('__t.cadre(2)')
    const faraT = await pT.js('__kinstead.tempOverlay.faraT')
    const pasul = await pT.js('__t.avans(20)')
    await pT.js('__t.cadre(3)')
    await astepta(700)
    const dupa = await pT.js(`({ inv: __kinstead.world.temperatura.stat.invarianti, ultimul: __kinstead.world.temperatura.stat.ultimulInvariant, jurnal: document.querySelector('.ui-alerte-antet button')?.textContent ?? '', f3: document.getElementById('termic')?.textContent ?? '', f3warn: document.getElementById('termic')?.className === 'warn', toast: [...document.querySelectorAll('.ui-toast')].some((e) => e.textContent === __t.T.textEroareTemperatura()), asteptat: __t.T.textEroareTemperatura(), T: __t.S.temperaturaAcum(__kinstead.world, ${tinta}) })`)
    const noi = pT.erori.slice(n0)
    // Jurnalul, deschis din butonul lui (clic real), apoi inchis.
    const bJ = await pT.js(`(() => { const b = document.querySelector('.ui-alerte-antet button'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    if (bJ) await pT.click(bJ.x, bJ.y)
    await astepta(300)
    const jurnal = await pT.js(`document.querySelector('.ui-jurnal')?.textContent ?? ''`)
    for (let i = 0; i < 3 && await pT.js('__kinstead.ui.modalDeschis()'); i++) await pT.tasta('Escape')
    const nr = (s) => Number(/\((\d+)\)/.exec(s)?.[1] ?? 0)
    bifa('alerta-termica', inainte.inv === 0 && faraT >= 1 && pasul.rulate === 20 && dupa.inv >= 1 && /componenta fara T/.test(dupa.ultimul) && noi.length === 1 && noi[0].startsWith('[temperatura] invariant incalcat')
      && nr(dupa.jurnal) >= nr(inainte.jurnal) + 1 && jurnal.includes(dupa.asteptat) && dupa.toast && dupa.f3warn && /invarianti [1-9]/.test(dupa.f3) && dupa.T !== null
      && / · taieri [0-9]+ · neconvergente [0-9]+ · rest normalizat [0-9]+ · graf diferit la salvare [0-9]+/.test(dupa.f3),
      'un invariant provocat prin __kinstead (componenta fara T): U n-o deseneaza, pasul il numara si il repara, iar ecranul il spune — o intrare in Jurnal cu textul erorii interne, toastul, UN console.error „[temperatura] invariant incalcat", randul F3 rosu (cu taierile, neconvergentele, resturile normalizate si graful diferit la salvare)',
      JSON.stringify({ tinta, faraT, inainte, dupa, consola: noi, jurnal: jurnal.slice(0, 200) }))
    // Erorile ASTEPTATE ies din lista: „consola-termica" de la final vede doar ce n-a provocat proba.
    for (let i = pT.erori.length - 1; i >= n0; i--) if (pT.erori[i].startsWith('[temperatura] invariant incalcat')) pT.erori.splice(i, 1)
  })

  // --- 11l. inertia (ULTIMA: dupa gaura, casa e un spatiu deschis): T nu sare spre X, X se muta; dupa o ora, T e langa X ---
  await pas('temperatura-inertie', async () => {
    let A = await casaA()
    const pre = []
    for (let k = 0; k < 48 && !(Math.abs(A.afara - A.t) >= Q && Math.abs(A.afara - A.xTot) >= Q); k++) { pre.push(await pT.js('__t.avans(420)')); A = await casaA() }
    await pT.tasta('r')
    await pT.js(`__f.centreaza(${hx + 2.5}, ${hy + 2.5}, ${hs + 3}, 9)`)
    await astepta(400)
    const e0 = await pT.js('__kinstead.world.terrain.editari')
    const px = await pT.js(`__t.pixelPe(${hx + 2}, ${hy + 2}, ${hs + 3}, ${hx + 2.5}, ${hs + 4}, ${hy + 2.5}, { ctrl: false, shift: false, alt: true })`)
    if (px !== null && NEGATIVA !== 'inertie') await pT.click(px.x, px.y, ['alt'])
    for (let j = 0; j < 20 && (await pT.js('__kinstead.world.terrain.editari')) === e0; j++) await astepta(50)
    await pT.js('__t.cadre(2)')
    const A1 = await casaA()
    // Pe hartie (C3, §3): gaura scoate 2 celule de aer si fata acoperisului (ies la T-ul casei) si fata podelei de sub ea
    // (solul, d = 0, iese la T_sol(0)); raman 16 celule de aer si 40 de fete de masa cConstr (24 de ziduri, 8 de acoperis, 8
    // de podea). Deci T-ul casei se muta DOAR cu cConstr·(T − T_sol(0)) / (16·cAer + 40·cConstr) — zecimi de grad, nu spre X.
    const h = await pT.js(`(() => { const R = __kinstead.rules.termic; return { cA: R.cAerJPeK, cC: R.cConstrJPeK, ts: __t.Cl.tSol(0, __kinstead.world.tick, __kinstead.rules) } })()`)
    const tHartie = A.t + Math.round(h.cC * (A.t - h.ts) / (16 * h.cA + 40 * h.cC))
    const pasi = await pT.js('__t.avans(1680)')
    const A2 = await casaA()
    const ok = A1 !== null && A2 !== null && A1.t !== null && A1.xTot !== null
      && Math.abs(A1.t - tHartie) <= Q / 200 && Math.abs(A1.t - A.t) < Math.abs(A1.xTot - A.t) / 2
      && Math.abs(A1.xTot - A1.afara) < Math.abs(A.xTot - A.afara) && Math.abs(A1.xTot - A.xTot) >= Q / 2
      && pasi.rulate === 1680 && Math.abs(A2.t - A2.xTot) < Math.abs(A1.t - A1.xTot)
    bifa('temperatura-inertie', Math.abs(A.afara - A.t) >= Q && Math.abs(A.afara - A.xTot) >= Q && px !== null && ok,
      'gaura in acoperis (Alt+clic, in pauza; precondiții |afară − T| ≥ 1 °C si |afară − X| ≥ 1 °C): T-ul casei NU sare spre X — se muta doar cu masa podelei care iese, pe hartie (±0,005 °C) —, „trage spre" se muta spre aerul de afara; dupa o ora de avans real, T e mai aproape de X',
      JSON.stringify({ px, preconditie: pre.length, inainte: { T: grade(A.t), Xtot: grade(A.xTot), afara: grade(A.afara), volum: A.volum }, gaura: { T: grade(A1?.t), hartie: grade(tHartie), Xtot: grade(A1?.xTot), afara: grade(A1?.afara), volum: A1?.volum, deschise: A1?.deschise, tSol0: grade(h.ts) }, oOraDupa: { T: grade(A2?.t), Xtot: grade(A2?.xTot) } }))
  })

  // --- 11m. o exceptie in tick() (ULTIMA: simularea ramane oprita pe pagina; recenzia t.2b, E3 si E4) ---
  // Eroarea de program, simulata TRECATOARE: prima citire a lui `pragBigInt` intr-un tick de pas (tick % 20 == 0) arunca,
  // apoi nu — fara nimic stricat in stare. Exceptia vine dupa `stepAgents`, deci lumea ramane pe jumatate de tick: jocul
  // trece pe pauza, iar Spatiu, 3×, avansul de proba, Ctrl+S si salvarea automata nu mai ating nici lumea, nici salvarile.
  await pas('exceptie-tick', async () => {
    const n0 = pT.erori.length
    const salvari = async () => (await pT.js('__f.salvari()')).map((s) => `${s.id}@${s.tick}`).sort()
    // O salvare automata pornita INAINTEA exceptiei nu e a pasului: pasii de dinainte trec de intervalul ei, iar scrierea in
    // IndexedDB e asincrona. Lista se citeste dupa ce s-a linistit (doua citiri la 1,2 s, egale; jocul e pe pauza, deci
    // salvarea automata scadenta se scrie in prima reimprospatare). Fara asta bifa pica rar si fara legatura cu exceptia:
    // agentul D2, o data din 11 rulari („egale: false" cu acelasi numar de salvari — slotul auto-7 rescris).
    let s0 = await salvari()
    for (let k = 0; k < 5; k++) { await astepta(1200); const s = await salvari(); if (JSON.stringify(s) === JSON.stringify(s0)) break; s0 = s }
    const j0 = await pT.js(`document.querySelector('.ui-alerte-antet button')?.textContent ?? ''`)
    if (NEGATIVA !== 'exceptie-tick') await pT.js(`(() => { const st = __kinstead.world.temperatura, v = st.pragBigInt; let rau = 1; Object.defineProperty(st, 'pragBigInt', { configurable: true, get() { if (rau > 0 && __kinstead.world.tick % 20 === 0) { rau--; throw new Error('proba: eroare in pas') } return v } }); return true })()`)
    if (await pT.js('__kinstead.stare().pauza')) await pT.tasta(' ')
    for (let j = 0; j < 40 && !(await pT.js('__kinstead.stare().pauza')); j++) await astepta(100)
    await astepta(500)
    const stare = () => pT.js(`({ pauza: __kinstead.stare().pauza, tick: __kinstead.world.tick, hash: __t.H.hashWorld(__kinstead.world), f3: document.getElementById('termic')?.textContent ?? '', f3warn: document.getElementById('termic')?.className === 'warn', jurnal: document.querySelector('.ui-alerte-antet button')?.textContent ?? '', toasturi: [...document.querySelectorAll('.ui-toast')].map((e) => e.textContent) })`)
    const a = await stare()
    // Spatiu, apoi 3×: refuzate; avansul de proba: niciun tick.
    await pT.tasta(' ')
    await astepta(1000)
    await pT.tasta('3')
    await astepta(1000)
    const av = await pT.js('__kinstead.avanseaza(20)')
    const b = await stare()
    // Ctrl+S: refuzat, cu mesajul. Salvarea automata: 11 minute de joc sarite pe ceas (ca la 10c), in pauza — momentul ei.
    await pT.tasta('s', ['control'])
    await astepta(800)
    await pT.js('__kinstead.world.tick += 20 * 60 * 11; true')
    await astepta(1500)
    const c = { salvari: await salvari(), toasturi: await pT.js(`[...document.querySelectorAll('.ui-toast')].map((e) => e.textContent)`) }
    const noi = pT.erori.slice(n0)
    const alerta = await pT.js('__t.T.textEroareSimulare()')
    const refuz = await pT.js('__t.T.textSimulareOprita()')
    const nr = (s) => Number(/[(]([0-9]+)[)]/.exec(s)?.[1] ?? 0)
    bifa('exceptie-tick', a.pauza && /exceptii 1/.test(a.f3) && /simularea OPRITA/.test(a.f3) && a.f3warn && nr(a.jurnal) >= nr(j0) + 1 && a.toasturi.includes(alerta)
      && noi.length === 1 && noi[0].startsWith('[simulare] exceptie in tick')
      && b.pauza && b.tick === a.tick && b.hash === a.hash && av.rulate === 0 && b.toasturi.includes(refuz)
      && JSON.stringify(c.salvari) === JSON.stringify(s0) && c.toasturi.includes(`Salvarea n-a mers: ${refuz}`) && !c.toasturi.some((t) => t.startsWith('Salvarea automată')),
      'o exceptie in tick(), cu jocul pornit: pauza, UN console.error „[simulare] exceptie in tick", alerta in Jurnal si toast („încarcă ultima salvare"), F3 „exceptii 1 · simularea OPRITA"; apoi Spatiu si 3× refuzate, avansul de proba 0 tickuri — tickul si hashWorld nu se misca —, Ctrl+S refuzat cu mesajul, salvarea automata suspendata (nicio salvare scrisa)',
      JSON.stringify({ a: { ...a, hash: undefined }, b: { pauza: b.pauza, tick: b.tick, hashEgal: b.hash === a.hash, toasturi: b.toasturi }, avans: av, salvari: { inainte: s0.length, dupa: c.salvari.length, egale: JSON.stringify(c.salvari) === JSON.stringify(s0) }, toasturi: c.toasturi, consola: noi }))
    // Erorile ASTEPTATE ies din lista (vezi „alerta-termica").
    for (let i = pT.erori.length - 1; i >= n0; i--) if (pT.erori[i].startsWith('[simulare] exceptie in tick')) pT.erori.splice(i, 1)
  })
  if (pT.erori.length) bifa('consola-termica', false, 'fara erori in consola (pagina termica)', pT.erori.join(' | '))
}

/**
 * Ajutoarele paginilor hranei (t.3 §8): modulele simularii si ale ecranului — ACELEASI instante ca ale aplicatiei (src/ si
 * viewer/ se servesc pe /@fs/, ca la `paginaTermica`) — si citirile pe care le compara bifele. Nimic de aici nu scrie in
 * lume; lumea se schimba doar prin comenzi (`__h.cmd`) si prin `__kinstead.avanseaza(n)` (tickuri reale).
 */
async function ajutoareHrana(pg) {
  await pg.js(`(async () => {
    const imp = (f) => import('/@fs/${REPO}/' + f)
    const [M, T, Cmd, St, It, Te, Cam, P, CA, Po, Z, Cl] = await Promise.all(['viewer/ui/model.ts', 'viewer/ui/texte.ts', 'src/sim/commands.ts', 'src/sim/state.ts', 'src/sim/iteme.ts', 'src/sim/temperatura.ts', 'src/sim/camere.ts', 'src/sim/prognoza.ts', 'src/sim/camara.ts', 'viewer/ui/pornire.ts', 'src/sim/zone.ts', 'src/sim/clima.ts'].map(imp))
    globalThis.__h = {
      M, T, Cmd, St, It, Te, Cam, P, CA, Po, Z, Cl,
      cmd(c) { return Cmd.applyCommand(__kinstead.world, c) },
      // Mormanele de hrana vii, cu S (PERSISTED) si locul lor; Σ S, stricat, unitatile (mormane + maini): pe ele se fac
      // comparatiile alterarii (UI-7: unitatile nu se misca in ferestrele probelor, S da).
      instantaneu() {
        const K = __kinstead, w = K.world, it = w.iteme, a = w.agents, H = St.Item.HRANA
        const mormane = []
        let unitati = 0
        for (let i = 0; i < it.count; i++) {
          if (it.alive[i] !== 1 || it.kind[i] !== H) continue
          unitati += it.cantitate[i]
          mormane.push({ id: it.id[i], wx: it.wx[i], wy: it.wy[i], z: it.z[i], q: it.cantitate[i], S: it.alterare[i], loc: Te.loculCelulei(w, it.wx[i], it.wy[i], it.z[i]) })
        }
        for (let i = 0; i < a.count; i++) if (a.alive[i] === 1 && a.caraKind[i] === H) unitati += a.caraCantitate[i]
        return { tick: w.tick, pauza: K.stare().pauza, sumaS: K.hrana.sumaS(), stricat: w.hranaStricata, unitati, mormane, tAfara: Cl.tAfara(w.seed, w.tick, K.rules) }
      },
      // Pixelul pe care clicul chiar tinteste celula (x, y, z; z null = orice cota), in jurul punctului proiectat (px, py, pz),
      // la peste 30 px de orice om (un clic la cel mult 14 px de un om il selecteaza pe el).
      pixelCelula(x, y, z, px, py, pz, raza = 40) {
        const K = __kinstead, q = __f.proj(px, py, pz), a = K.world.agents
        const pioni = []
        for (let i = 0; i < a.count; i++) if (a.alive[i] === 1) pioni.push(__f.proj(a.x[i] / 1000, a.z[i] + 0.7, a.y[i] / 1000))
        for (let r = 0; r <= raza; r++) for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const sx = Math.round(q.x) + dx, sy = Math.round(q.y) + dy
          if (document.elementFromPoint(sx, sy) !== K.renderer.domElement) continue
          if (pioni.some((p) => Math.hypot(p.x - sx, p.y - sy) < 30)) continue
          const t = K.tintaLa(sx, sy, { ctrl: false, shift: false, alt: false })
          if (t.ok && t.wx === x && t.wy === y && (z === null || t.z === z)) return { x: sx, y: sy, z: t.z }
        }
        return null
      },
      // O celula de sub cer fara morman, pe suprafata, cat mai aproape de (cx, cy) (dar nu pe ea): pentru un morman nou.
      celulaSubCer(cx, cy) {
        const K = __kinstead, w = K.world
        for (let r = 1; r < 24; r++) for (let dx = -r; dx <= r; dx++) for (const dy of [-r, r]) {
          const x = cx + dx, y = cy + dy, s = K.suprafata(x, y)
          if (s === null || It.itemLaCelula(w.iteme, x, y, s + 1) !== -1) continue
          if (Te.loculCelulei(w, x, y, s + 1) !== Te.LOC_CER) continue
          return { x, y, z: s + 1 }
        }
        return null
      },
      // Ce scrie inspectorul pe mormanul de pe ecran (cantitatea si randul de alterare) si ce ASTEAPTA functia ecranului
      // (__kinstead.hrana.morman) pe celula inspectata (x, y, z): mormanul e pe z + 1.
      mormanDom() {
        const a = document.querySelector('[data-alterare]'), c = document.querySelector('[data-morman-cantitate]')
        return { cant: c && c.isConnected ? c.textContent : null, clasa: a && a.isConnected && !a.hidden ? (a.getAttribute('data-clasa') ?? null) : null, eticheta: a && a.isConnected && !a.hidden ? (a.children[0]?.textContent ?? null) : null, valoare: a && a.isConnected && !a.hidden ? (a.children[1]?.textContent ?? null) : null }
      },
      mormanFunctie(x, y, z) {
        const m = __kinstead.hrana.morman(x, y, z)
        if (m === null) return { cant: null, clasa: null, eticheta: null, valoare: null }
        const a = m.alterare
        return { cant: m.cantitate, clasa: a === null ? null : a.clasa === null ? 'necunoscuta' : String(a.clasa), eticheta: a === null ? null : a.eticheta, valoare: a === null ? null : a.valoare }
      },
      // Motivul din sectiunea mormanului (titlul si actiunea), din DOM.
      motivMorman() {
        const s = document.querySelector('[data-morman-cantitate]')?.closest('section')
        const m = s?.querySelector('.ui-motiv')
        return m ? { titlu: m.children[0]?.textContent ?? '', actiune: m.querySelector('.actiune')?.textContent ?? '' } : null
      },
      // Oamenii nu mananca in fereastra urmatoare: niciunul nu mananca acum si fiecare are FOAMEA cu cel putin 60 peste prag.
      satui() {
        const K = __kinstead, a = K.world.agents, f = St.Nevoie.FOAME, prag = K.rules.nevoi[f].prag
        for (let i = 0; i < a.count; i++) if (a.alive[i] === 1 && a.faction[i] === St.Faction.ASEZARE && (a.jobKind[i] === St.FelJob.MANANCA || a.nevoi[i * St.NEVOI + f] < prag + 60)) return false
        return true
      },
      nivelAfisat() { const t = document.querySelector('.ui-nivel .cota')?.textContent ?? ''; const m = /^(-?[0-9]+) m$/.exec(t.replace('−', '-')); return m ? Number(m[1]) : null },
      dreptunghi(e) { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } },
    }
    return true
  })()`)
}

/** Nivelul afisat („N m" din coloana Nivel, = nivelul overlay-urilor) dus la `z`, cu Q/E reale; dupa fiecare tasta se ASTEAPTA eticheta noua. */
async function laNivel(pg, z) {
  const citeste = () => pg.js('__h.nivelAfisat()')
  if ((await citeste()) === null) {
    await pg.tasta('q')
    for (let j = 0; j < 30 && (await citeste()) === null; j++) await astepta(50)
  }
  for (let i = 0; i < 24; i++) {
    const n = await citeste()
    if (n === z || n === null) break
    const inainte = n
    await pg.tasta(n > z ? 'q' : 'e')
    for (let j = 0; j < 30 && (await citeste()) === inainte; j++) await astepta(50)
  }
  return citeste()
}

/**
 * Hrana pe ecran (t.3 §8), pe PAGINA EI: jocul nou implicit (`?joc=nou&seed=7&oameni=12&piatra=1000&hrana=2760`), pus pe
 * pauza cu Spatiu; toata hrana de start sta sub cer, toamna (alterarea merge). Bifele: bara cu prognoza (UI-1, UI-9; proba
 * negativa: textul FARA alterare), alerta „Hrana se strică" cu clicul care ajunge desi N se schimba intre mousedown si mouseup
 * (UI-4), F3, Primii pasi (pasul camarii, cu prognoza), unealta Camara (presetul, comutatorul scris pe loc, FEL_REFUZAT, groapa
 * dintr-un clic, „Se strică aici; cămara are loc"), dialogul Joc nou (UI-9). Timpul trece doar prin `__kinstead.avanseaza(n)`.
 */
async function paginaHranei() {
  let pH = null
  let loc = null
  await pas('pagina-hranei', async () => {
    pH = await pagina('?joc=nou&seed=7&oameni=12&piatra=1000&hrana=2760')
    if (!(await pH.js('__kinstead.stare().pauza'))) await pH.tasta(' ')
    await ajutoareHrana(pH)
    loc = await pH.js(`(() => { const a = __kinstead.world.agents; return { x: Math.floor(a.x[0] / 1000), y: Math.floor(a.y[0] / 1000), z: a.z[0] } })()`)
    const r = await pH.js(`(() => { const K = __kinstead, i = __h.instantaneu(); return { pauza: i.pauza, pioni: __f.pioni(), unitati: i.unitati, mormane: i.mormane.length, subCer: i.mormane.filter((m) => m.loc === __h.Te.LOC_CER).length, zone: __f.zone(), tick: i.tick } })()`)
    bifa('pagina-hranei', r.pauza && r.pioni.c === 12 && r.unitati === 2760 && r.mormane > 0 && r.subCer === r.mormane && r.zone === 0,
      'pagina hranei (jocul nou implicit, pe pauza): 12 oameni, 2.760 de hrana toata sub cer (toamna: se strica), nicio zona', JSON.stringify(r))
  })
  if (pH === null || loc === null) return
  const sol = loc.z - 1
  const camera = async (x, y, z, d = 14) => { await pH.js(`__f.centreaza(${x + 0.5}, ${y + 0.5}, ${z}, ${d})`); await astepta(250) }

  // --- h0. Primii pasi: pasul camarii INAINTEA depozitului general, cu prognoza (aceeasi `PrognozaHrana` ca bara, UI-9),
  // scrisa PE LOC: dupa ore de tickuri reale, textul e al starii noi, in ACELASI nod (pe codul D1 textul ramanea cel de la
  // prima desenare: cheia listei e doar pe bife — fum-1, reparat in panouri.ts) ---
  await pas('primii-pasi-camara', async () => {
    const citeste = () => pH.js(`(() => {
      const K = __kinstead, M = __h.M, li = [...document.querySelectorAll('.ui-pasi ol li')], hr = document.querySelector('.ui-pasi .hrana'), ec = M.hranaEcran(K.world, K.rules)
      globalThis.__li0 ??= li[0] ?? null
      return { vizibil: !document.querySelector('.ui-pasi').hidden, n: li.length, texte: li.map((e) => e.textContent), facut: li.map((e) => e.classList.contains('facut')), asteptat: M.textPasulCamarii(K.rules, ec.stare.colonisti, __h.Po.HRANA_PE_OM, ec.prognoza), bara: K.hrana.bara(), fara: K.hrana.baraFaraAlterare(), hranaAscunsa: hr ? hr.hidden : null, acelasi: li[0] === globalThis.__li0, tick: K.world.tick }
    })()`)
    await pH.js('delete globalThis.__li0; true')
    await astepta(400)
    const r0 = await citeste()
    // Ore reale (in pauza, prin avanseaza) pana cand prognoza din pas se schimba; cel mult 6.
    let r1 = r0
    let rulate = 0
    for (let k = 0; k < 6 && r1.asteptat === r0.asteptat; k++) { rulate += (await pH.js('__kinstead.avanseaza(1680)')).rulate; await astepta(400); r1 = await citeste() }
    const bun = (r) => {
      const acum = r.bara.endsWith(' zile') ? r.bara.slice(0, -5) : r.bara
      return r.vizibil && r.n === 5 && r.texte[0] === r.asteptat && /^Cămară: Zone \(K\) ▸ Cămară în pivniță \(sub 5 °C\), ~/.test(r.texte[0]) && r.texte[0].endsWith(`hrana ține ${r.fara}, nu ${acum}`)
        && r.texte[1] === 'Depozit pentru piatră: Zone (K) ▸ Depozit' && !r.facut[0] && !r.facut[1] && r.hranaAscunsa === true
    }
    bifa('primii-pasi-camara', bun(r0) && bun(r1) && r1.asteptat !== r0.asteptat && r1.acelasi && rulate >= 1680,
      'Primii pasi: pasul camarii e PRIMUL, inaintea depozitului general („Depozit pentru piatră: Zone (K) ▸ Depozit"), cu prognoza barei („hrana ține ~3,6 zile, nu ~2,9" — fara alterare, apoi cu ea) == functia; dupa ore de tickuri reale, prognoza noua, scrisa PE LOC (acelasi nod); randul „Nu mai ai hrană" ascuns',
      JSON.stringify({ r0: { ...r0, texte: r0.texte.slice(0, 2) }, r1: { ...r1, texte: r1.texte.slice(0, 2) }, rulate }))
  })

  // --- h1. bara cu prognoza (UI-1, UI-9, UI-14): textul == functia ecranului pe starea de acum, in pauza; si dupa o ora REALA ---
  await pas('bara-prognoza', async () => {
    const citeste = () => pH.js(`(() => {
      const K = __kinstead, H = K.hrana, e = document.querySelector('.ui-sus .prognoza'), rad = e?.closest('.ui-res'), ec = H.ecran()
      return { text: e?.textContent ?? null, cls: e ? [...e.classList] : [], titlu: rad?.title ?? '', bara: H.bara(), fara: H.baraFaraAlterare(), zile: ec.prognoza.zile, clasa: __h.M.clasaPrognozei(ec.prognoza), coada: __h.M.tooltipHrana(K.rules, ec) + ' · nu se poate produce încă', tick: K.world.tick, pauza: K.stare().pauza }
    })()`)
    await astepta(400)
    const r = await citeste()
    const av = await pH.js('__kinstead.avanseaza(1680)')
    await astepta(400)
    const r2 = await citeste()
    // Proba negativa: textul asteptat e cel FARA alterare (aceeasi hrana tinuta la rata 0) — diferit, cat timp hrana sta sub cer.
    const asteptat = (x) => (NEGATIVA === 'bara-prognoza' ? x.fara : x.bara)
    const clase = (x) => x.cls.includes('critic') === (x.clasa === 'critic') && x.cls.includes('atentie') === (x.clasa === 'atentie')
    bifa('bara-prognoza', r.pauza && r.bara !== r.fara && /^~[0-9]+,[0-9] zile$/.test(r.bara) && r.text === asteptat(r) && clase(r) && r.titlu.endsWith(r.coada) && r.titlu.includes(`ajunge ${r.bara}`)
      && av.rulate === 1680 && r2.pauza && r2.text === asteptat(r2) && clase(r2) && r2.titlu.endsWith(r2.coada),
      'bara de sus, in pauza: prognoza hranei == functia ecranului pe starea de acum (pe VALOARE, cu alterarea; diferita de cea fara alterare), clasa atentie/critic dupa pragurile in zile, tooltip-ul cu „hrănește cât … · ajunge …" si „nu se poate produce încă"; la fel dupa o ora de tickuri reale',
      JSON.stringify({ r: { ...r, titlu: r.titlu.slice(-120) }, r2: { text: r2.text, bara: r2.bara, fara: r2.fara, tick: r2.tick }, rulate: av.rulate }))
    await pH.poza('h1-bara-prognoza.png')
  })

  // --- h2. alerta „Hrana se strică" (UI-4): textul scris pe loc, cheia listei pe id-uri; clicul real ajunge (camera si
  // inspectorul pe tinta citita LA CLIC) desi N se schimba intre mousedown si mouseup (un morman nou sub cer + 700 ms) ---
  await pas('alerta-alterare', async () => {
    // Intarzierea alertei e de 10 s de joc: semnalul vazut in pauza, apoi 220 de tickuri reale, apoi o reimprospatare (2 Hz).
    const av = await pH.js('__kinstead.avanseaza(220)')
    await astepta(700)
    const a0 = await pH.js(`(() => {
      const b = document.querySelector('button[data-alerta="hrana-se-strica"]'), L = document.querySelector('.ui-alerte'), s = __kinstead.hrana.alerta()
      globalThis.__alertaBtn = b
      if (!b) return { buton: false, semnal: s, cheie: L?.dataset.cheie ?? null }
      const r = b.getBoundingClientRect(), x = r.x + r.width / 2, y = r.y + r.height / 2
      return { buton: true, text: b.children[1]?.textContent ?? '', semnal: s, cheie: L?.dataset.cheie ?? null, x, y, peButon: document.elementFromPoint(x, y)?.closest('button') === b }
    })()`)
    if (!a0.buton) { bifa('alerta-alterare', false, 'alerta „Hrana se strică" nu e pe ecran', JSON.stringify({ av, a0 })); return }
    // Spionul pe `ui.inspecteazaCelula` (pe care il cheama clicul pe alerta, `duLaTinta`): ce celula a cerut clicul.
    await pH.js(`(() => { const U = __kinstead.ui; globalThis.__spion = []; if (!U.__inspecteazaOriginal) U.__inspecteazaOriginal = U.inspecteazaCelula; U.inspecteazaCelula = function (...a) { globalThis.__spion.push(a.slice(0, 3)); return U.__inspecteazaOriginal.apply(this, a) }; return true })()`)
    await pH.muta(a0.x, a0.y)
    await pH.apasa(a0.x, a0.y)
    const nou = await pH.js(`(() => {
      const c = __h.celulaSubCer(${loc.x}, ${loc.y + 9})
      if (c === null) return { ok: false }
      const out = __h.cmd({ kind: 'lasaItem', fel: __h.St.Item.HRANA, cantitate: 75, wx: c.x, wy: c.y, z: c.z })
      return { ok: out.ok, c, pericol: __kinstead.hrana.ecran().pericol }
    })()`)
    // Proba negativa: lista refacuta FORTAT intre mousedown si mouseup (cheia golita: urmatoarea reimprospatare scoate butoanele
    // din DOM si le pune la loc) — Chromium nu mai trimite clicul unui buton scos intre apasare si eliberare.
    if (NEGATIVA === 'alerta-alterare') await pH.js(`(() => { document.querySelector('.ui-alerte').dataset.cheie = ''; return true })()`)
    await astepta(700)
    const a1 = await pH.js(`(() => { const b = document.querySelector('button[data-alerta="hrana-se-strica"]'); return { acelasi: b === globalThis.__alertaBtn, text: b?.children[1]?.textContent ?? '', semnal: __kinstead.hrana.alerta(), cheie: document.querySelector('.ui-alerte')?.dataset.cheie ?? null } })()`)
    await pH.elibereaza(a0.x, a0.y)
    await astepta(500)
    const a2 = await pH.js(`(() => {
      const K = __kinstead, s = K.hrana.alerta(), t = s?.tinta ?? null
      return { spion: globalThis.__spion, tinta: t, camera: [+K.controls.target.x.toFixed(3), +K.controls.target.z.toFixed(3)], dom: __h.mormanDom(), functie: t === null ? null : __h.mormanFunctie(t.wx, t.wy, t.z), sertar: document.querySelector('.ui-sertar h2')?.textContent ?? null }
    })()`)
    await pH.js(`(() => { const U = __kinstead.ui; if (U.__inspecteazaOriginal) { U.inspecteazaCelula = U.__inspecteazaOriginal; delete U.__inspecteazaOriginal } return true })()`)
    const t = a2.tinta
    const ajuns = t !== null && a2.spion.length === 1 && a2.spion[0][0] === t.wx && a2.spion[0][1] === t.wy && a2.spion[0][2] === t.z
      && Math.abs(a2.camera[0] - (t.wx + 0.5)) < 0.01 && Math.abs(a2.camera[1] - (t.wy + 0.5)) < 0.01
      && a2.dom.cant !== null && JSON.stringify(a2.dom) === JSON.stringify(a2.functie) && a2.dom.clasa === '2'
    bifa('alerta-alterare', av.rulate === 220 && a0.text === a0.semnal?.text && /^Hrana se strică: /.test(a0.text) && a0.peButon && nou.ok && a1.text !== a0.text && a1.text === a1.semnal?.text && a1.acelasi && a1.cheie === a0.cheie && ajuns,
      'alerta „Hrana se strică: N mormane" (dupa 220 de tickuri reale): textul == semnalul; intre mousedown si mouseup N se schimba (un morman nou sub cer), textul se rescrie PE LOC in ACELASI buton, cheia listei (id-urile) nu se schimba; clicul ajunge: camera si inspectorul pe tinta citita la clic, cu randul de alterare == functia',
      JSON.stringify({ av: av.rulate, a0: { text: a0.text, cheie: a0.cheie, peButon: a0.peButon }, nou, a1: { text: a1.text, acelasi: a1.acelasi, cheie: a1.cheie }, a2 }))
    await pH.poza('h2-alerta-inspector.png')
  })

  // --- h3. F3: randul „hrana" din Diagnostic == functia ecranului, si dupa o ora reala ---
  await pas('f3-hrana', async () => {
    const hud0 = await pH.js(`!document.getElementById('hud').hidden`)
    await pH.tasta('F3')
    await astepta(600)
    const citeste = () => pH.js(`({ hud: !document.getElementById('hud').hidden, text: document.getElementById('hrana')?.textContent ?? null, f3: __kinstead.hrana.f3(), stricat: __kinstead.world.hranaStricata, tick: __kinstead.world.tick })`)
    const r = await citeste()
    // Randul se VEDE: eticheta si valoarea lui nu sunt acoperite de coloana stanga a UI-ului (hit-test, nu doar textul).
    const vede = await pH.js(`(() => {
      const v = document.getElementById('hrana'), l = v?.previousElementSibling ?? null
      const ok = (e) => { if (!e) return null; const q = e.getBoundingClientRect(); if (q.width === 0) return null; const x = q.x + Math.min(q.width / 2, 12), y = q.y + q.height / 2, t = document.elementFromPoint(x, y); return t === e || e.contains(t) ? 'da' : (t?.className || t?.tagName || 'nimic') }
      return { eticheta: ok(l), valoare: ok(v), textEticheta: l?.textContent ?? null }
    })()`)
    await pH.poza('h3-f3.png')
    // Ore reale pana cand se strica ceva (mormanele identice pierd SINCRON, deci o unitate vine pe toate odata).
    let r2 = r
    const av = { rulate: 0 }
    for (let k = 0; k < 4 && r2.stricat === r.stricat; k++) { av.rulate += (await pH.js('__kinstead.avanseaza(1680)')).rulate; await astepta(600); r2 = await citeste() }
    await pH.tasta('F3')
    await astepta(300)
    const hud2 = await pH.js(`!document.getElementById('hud').hidden`)
    const forma = (s) => /^stricat [0-9.]+ · în pericol [0-9.]+ · [0-9]+,[0-9]%\/zi$/.test(s ?? '')
    bifa('f3-hrana', !hud0 && r.hud && vede.eticheta === 'da' && vede.valoare === 'da' && vede.textEticheta === 'hrana' && r.text === r.f3 && forma(r.text) && av.rulate >= 1680 && av.rulate % 1680 === 0 && r2.text === r2.f3 && r2.text !== r.text && r2.stricat > r.stricat && !hud2,
      'F3: randul „hrana" din Diagnostic („stricat N · în pericol M · R%/zi") se VEDE (eticheta si valoarea, hit-test: nu le acopera coloana stanga) si == functia ecranului; dupa ore de tickuri reale se schimba (stricat creste) si e tot functia; F3 il ascunde la loc',
      JSON.stringify({ hud0, vede, r, r2, hud2, rulate: av.rulate }))
  })

  // --- h5. unealta Camara: presetul (DEPOZIT + filtrul „doar hrană"), indiciul, pictura cu filtrul in ACELASI tick, toast-ul ---
  let camara = null
  await pas('camara-unealta', async () => {
    await pH.tasta('v')
    await pH.tasta('k')
    await astepta(200)
    const bC = await pH.js(`__h.dreptunghi(document.querySelector('.ui-sub button[data-zona="camara"]'))`)
    // Proba negativa: gestul fara clicul pe „Cămară" — unealta ramane Zone ▸ Depozit (un depozit general).
    if (bC !== null && NEGATIVA !== 'camara') await pH.click(bC.x, bC.y)
    await astepta(200)
    const u = await pH.js(`({ filtru: __kinstead.ui.zonaFiltru, fel: __kinstead.ui.zonaFel, unealta: __kinstead.ui.unealta, camara: document.querySelector('.ui-sub button[data-zona="camara"]')?.getAttribute('aria-pressed') ?? null, depozit: document.querySelector('.ui-sub button[data-zona="0"]')?.getAttribute('aria-pressed') ?? null, indiciu: document.querySelector('.ui-indiciu')?.textContent ?? '' })`)
    const inainte = await pH.js(`({ zone: __f.zoneFel().map((z) => z.id), tick: __kinstead.world.tick })`)
    // Peste randul de sus al inelului de mormane (piatra si hrana) si ce e dincolo de el: molozul pentru groapa de moloz.
    await pH.trage([loc.x - 6, loc.y - 9], [loc.x - 3, loc.y - 6], sol + 1)
    await astepta(400)
    const dupa = await pH.js(`(() => {
      const K = __kinstead, w = K.world, s = w.zone, vechi = ${JSON.stringify(inainte.zone)}
      const noi = __f.zoneFel().filter((z) => !vechi.includes(z.id))
      const z = noi[0] ?? null, zs = z === null ? -1 : __h.Z.slotZona(s, z.id)
      let celule = 0
      for (let i = 0; i < s.celule.count; i++) if (s.celule.alive[i] === 1 && z !== null && s.celule.zonaId[i] === z.id) celule++
      const li = [...document.querySelectorAll('.ui-pasi ol li')]
      return { noi: noi.length, id: z?.id ?? null, fel: zs === -1 ? null : s.kind[zs], refuzate: zs === -1 ? null : s.refuzate[zs], celule, tick: w.tick, toast: __f.toast(), pasi: li.map((e) => e.classList.contains('facut')) }
    })()`)
    camara = dupa.id
    bifa('camara-unealta', bC !== null && u.filtru === 7 && u.fel === 0 && u.camara === 'true' && u.depozit === 'false' && u.indiciu.startsWith('Cămară')
      && dupa.noi === 1 && dupa.fel === 0 && dupa.refuzate === 7 && dupa.celule >= 12 && dupa.tick === inainte.tick && dupa.toast.includes(' · cămară: doar hrană') && dupa.pasi[0] === true && dupa.pasi[1] === false,
      'Zone ▸ Cămară (clic real): presetul — un DEPOZIT cu filtrul „doar hrană" (7), butonul apasat, indiciul „Cămară …"; dreptunghiul tras picteaza o zona cu masca 7 in ACELASI tick (pauza: niciun tick intre pictura si filtru), toast „· cămară: doar hrană"; Primii pasi bifeaza pasul camarii, nu pe al depozitului general',
      JSON.stringify({ bC, u, inainte: inainte.tick, dupa }))
    await pH.poza('h4-camara-unealta.png')
  })

  /** Clic real (Selectează) pe celula (x, y) a suprafetei; intoarce celula tintita (x, y, z) sau null. */
  const clicCelula = async (x, y) => {
    await pH.tasta('v')
    await camera(x, y, sol + 1, 12)
    const s = await pH.js(`__kinstead.suprafata(${x}, ${y})`)
    const px = await pH.js(`__h.pixelCelula(${x}, ${y}, null, ${x + 0.5}, ${(s ?? sol) + 1}, ${y + 0.5})`)
    if (px === null) return null
    await pH.click(px.x, px.y)
    await astepta(400)
    return { x, y, z: px.z }
  }
  // --- h6. comutatorul „Primește: Tot · Doar hrană" din inspectorul zonei: clicuri reale, setFiltruZona, scris PE LOC ---
  await pas('camara-comutator', async () => {
    if (camara === null) { bifa('camara-comutator', false, 'fara camara (h5)'); return }
    // O celula a camarii fara morman (inspectorul arata doar zona).
    const c = await pH.js(`(() => { const s = __kinstead.world.zone, it = __kinstead.world.iteme; for (let i = 0; i < s.celule.count; i++) if (s.celule.alive[i] === 1 && s.celule.zonaId[i] === ${camara} && __h.It.itemLaCelula(it, s.celule.wx[i], s.celule.wy[i], s.celule.z[i]) === -1) return { x: s.celule.wx[i], y: s.celule.wy[i], z: s.celule.z[i] }; return null })()`)
    const tinta = c === null ? null : await clicCelula(c.x, c.y)
    const citeste = () => pH.js(`(() => {
      const K = __kinstead, w = K.world, zs = __h.Z.slotZona(w.zone, ${camara}), q = (s) => document.querySelector(s)
      const tot = q('[data-comutator-filtru] button[data-filtru="tot"]'), hr = q('[data-comutator-filtru] button[data-filtru="hrana"]'), prim = q('[data-primeste]'), cap = q('[data-capacitate]')
      globalThis.__comut ??= { tot, hr, prim, cap }
      const n = globalThis.__comut
      const refuzate = w.zone.refuzate[zs]
      return { refuzate, primeste: prim?.textContent ?? null, primesteAsteptat: __h.T.textPrimeste(refuzate, __h.St.ITEME), nume: prim?.closest('section')?.querySelector('.ui-kv span:last-child')?.textContent ?? null,
        tot: tot?.getAttribute('aria-pressed') ?? null, hrana: hr?.getAttribute('aria-pressed') ?? null, cap: cap ? (cap.hidden ? null : cap.textContent) : undefined,
        capAsteptat: __h.M.esteCamara(w, zs) ? __h.T.textCapacitateCamara(__h.M.capacitateCamara(w, K.rules, zs, __h.Po.HRANA_PE_OM)) : null,
        aceleasi: tot === n.tot && hr === n.hr && prim === n.prim && cap === n.cap, xTot: __h.dreptunghi(tot), xHrana: __h.dreptunghi(hr) }
    })()`)
    await pH.js('delete globalThis.__comut; true')
    const r0 = await citeste()
    const pasi = []
    for (const [f, m] of [['xTot', 0], ['xHrana', 7]]) {
      const b = (pasi.length === 0 ? r0 : pasi[pasi.length - 1])[f]
      if (b) await pH.click(b.x, b.y)
      await astepta(400)
      pasi.push({ ...(await citeste()), cerut: m })
    }
    const [r1, r2] = pasi
    const bun = (r, m) => r.refuzate === m && r.primeste === r.primesteAsteptat && r.tot === (m === 0 ? 'true' : 'false') && r.hrana === (m === 7 ? 'true' : 'false') && r.cap === r.capAsteptat && r.aceleasi
    bifa('camara-comutator', tinta !== null && r0.primeste === r0.primesteAsteptat && bun(r1, 0) && r1.primeste === 'tot' && r1.cap === null && bun(r2, 7) && r2.primeste === 'doar hrană' && r2.nume === 'Cămară' && /^Ține hrana a /.test(r2.cap ?? ''),
      'inspectorul camarii (clic real pe o celula a ei): „Primește" si comutatorul; clic pe „Tot" → masca 0 in lume, „tot", butonul apasat, capacitatea ascunsa; clic pe „Doar hrană" → masca 7, „doar hrană", „Cămară", „Ține hrana a N oameni (cât au la început)" == functia — scrise PE LOC (aceleasi noduri)',
      JSON.stringify({ tinta, r0, r1, r2 }))
    await pH.poza('h5-camara-comutator.png')
  })

  // --- h7. FEL_REFUZAT: piatra din camara, cand niciun depozit nu primeste piatra (motivul inspectorului == functia) ---
  await pas('camara-fel-refuzat', async () => {
    const m = await pH.js(`(() => { const w = __kinstead.world, it = w.iteme, s = w.zone; for (let i = 0; i < it.count; i++) { if (it.alive[i] !== 1 || it.kind[i] !== __h.St.Item.PIATRA) continue; const cs = __h.Z.celulaDeZonaLa(s, it.wx[i], it.wy[i], it.z[i]); if (cs !== -1 && s.celule.zonaId[cs] === ${camara ?? -1}) return { x: it.wx[i], y: it.wy[i], z: it.z[i] } } return null })()`)
    const tinta = m === null ? null : await clicCelula(m.x, m.y)
    const r = tinta === null ? null : await pH.js(`(() => { const K = __kinstead, c = __h.M.inspecteazaCelula(K.world, K.rules, ${tinta?.x}, ${tinta?.y}, ${tinta?.z}, null); return { dom: __h.motivMorman(), asteptat: c.morman?.stare ?? null, alterare: document.querySelector('[data-alterare]')?.hidden ?? null } })()`)
    bifa('camara-fel-refuzat', r !== null && r.dom !== null && r.asteptat !== null && r.dom.titlu === r.asteptat.titlu && r.dom.actiune === r.asteptat.actiune && r.dom.titlu.startsWith('Niciun depozit nu primește piatră.') && r.alterare === true,
      'piatra de pe camara (clic real), cand niciun depozit nu primeste piatra: motivul „Niciun depozit nu primește piatră." + „Schimbă filtrul…" (FEL_REFUZAT) == functia inspectorului; fara rand de alterare (piatra nu se strica)',
      JSON.stringify({ m, tinta, r }))
  })

  // --- h8. groapa de moloz dintr-un clic: propunerea (cu cifrele `groapaDeMoloz`), clicul real picteaza L × L la `locGroapa`,
  // cu filtrul gropii; dupa, propunerea dispare ---
  await pas('groapa-clic', async () => {
    const c = await pH.js(`(() => { const s = __kinstead.world.zone, it = __kinstead.world.iteme; for (let i = 0; i < s.celule.count; i++) if (s.celule.alive[i] === 1 && s.celule.zonaId[i] === ${camara ?? -1} && __h.It.itemLaCelula(it, s.celule.wx[i], s.celule.wy[i], s.celule.z[i]) === -1) return { x: s.celule.wx[i], y: s.celule.wy[i] }; return null })()`)
    const tinta = c === null ? null : await clicCelula(c.x, c.y)
    const r0 = await pH.js(`(() => {
      const K = __kinstead, w = K.world, g = __h.CA.groapaDeMoloz(w, K.rules, ${camara ?? -1}), el = document.querySelector('div[data-groapa]'), b = document.querySelector('button[data-groapa]')
      const loc = g === null || g.latura === 0 ? null : __h.M.locGroapa(w, K.rules, ${camara ?? -1}, g.latura)
      return { g, loc, vizibil: !!el && !el.hidden, text: el?.children[0]?.textContent ?? null, asteptat: g === null ? null : __h.T.textGroapa(g), buton: b?.textContent ?? null, x: __h.dreptunghi(b), zone: __f.zoneFel().map((z) => z.id) }
    })()`)
    await pH.poza('h6-groapa-propusa.png')
    if (r0.x) await pH.click(r0.x.x, r0.x.y)
    await astepta(500)
    const r1 = await pH.js(`(() => {
      const K = __kinstead, w = K.world, s = w.zone, vechi = ${JSON.stringify(r0.zone)}, noi = __f.zoneFel().filter((z) => !vechi.includes(z.id))
      const z = noi[0] ?? null, zs = z === null ? -1 : __h.Z.slotZona(s, z.id)
      const celule = []
      for (let i = 0; i < s.celule.count; i++) if (s.celule.alive[i] === 1 && z !== null && s.celule.zonaId[i] === z.id) celule.push([s.celule.wx[i], s.celule.wy[i], s.celule.z[i]])
      const el = document.querySelector('div[data-groapa]'), g = __h.CA.groapaDeMoloz(w, K.rules, ${camara ?? -1})
      return { noi: noi.length, fel: zs === -1 ? null : s.kind[zs], refuzate: zs === -1 ? null : s.refuzate[zs], celule, toast: __f.toast(), propusaDupa: g?.propusa ?? null, vizibilDupa: !!el && !el.hidden }
    })()`)
    const L = r0.g?.latura ?? 0
    const asteptate = r0.loc === null ? [] : Array.from({ length: L * L }, (_, k) => [r0.loc.x0 + (k % L), r0.loc.y0 + Math.floor(k / L), r0.loc.z].join()).sort()
    // Molozul chiar AJUNGE in groapa (JOC-2): o groapa unde nu ajunge niciun caraus (acoperisul casei, JOC-1) dadea si ea
    // „propusa 0" si panoul ascuns. Tickuri reale, cate 120, pana vine marfa noua pe celulele ei (cel mult 1.680 = o ora de
    // joc): doar cat trebuie, ca pasii de dupa sa gaseasca lumea aproape neschimbata. Proba negativa „groapa": podeaua gropii
    // sapata DUPA clic (comanda `dig`, sub fiecare celula) — celulele ei nu mai sunt calcabile, deci nu mai lasa nimeni nimic acolo.
    const molozPe = (celule) => pH.js(`(() => { const it = __kinstead.world.iteme, P = __h.St.Item.PIATRA, PM = __h.St.Item.PAMANT; let m = 0; for (const [x, y, z] of ${JSON.stringify(celule)}) { const i = __h.It.itemLaCelula(it, x, y, z); if (i !== -1 && (it.kind[i] === P || it.kind[i] === PM)) m += it.cantitate[i] } return m })()`)
    const m0 = await molozPe(r1.celule)
    const sapate = NEGATIVA === 'groapa' ? await pH.js(`${JSON.stringify(r1.celule)}.filter(([x, y, z]) => __h.cmd({ kind: 'dig', wx: x, wy: y, z: z - 1 }).ok).length`) : 0
    const av = { rulate: 0, m: m0, pasi: 0 }
    for (; av.pasi < 14 && av.rulate < 1680 && av.m <= m0; av.pasi++) { av.rulate += (await pH.js('__kinstead.avanseaza(120)')).rulate; av.m = await molozPe(r1.celule) }
    bifa('groapa-clic', tinta !== null && r0.g !== null && r0.g.propusa > 0 && r0.vizibil && r0.text === r0.asteptat && r0.buton === `Pictează groapa de moloz (${L} × ${L})` && r0.loc !== null
      && r1.noi === 1 && r1.fel === 0 && r1.refuzate === r0.g.refuzate && JSON.stringify(r1.celule.map((x) => x.join()).sort()) === JSON.stringify(asteptate) && r1.toast.startsWith(`Groapa de moloz: ${L} × ${L}, primește `) && r1.propusaDupa === 0 && !r1.vizibilDupa
      && av.m > m0,
      'inspectorul camarii cu molozul ei: propunerea gropii („Molozul săpat n-are unde pleca…" == textGroapa(groapaDeMoloz)) si butonul „Pictează groapa de moloz (L × L)"; clicul real picteaza L × L celule la locGroapa, cu filtrul gropii (doar felurile molozului), toast „Groapa de moloz: …"; apoi propunerea dispare; si, cu tickuri reale (≤ o ora), molozul AJUNGE pe celulele gropii',
      JSON.stringify({ tinta, r0: { ...r0, x: undefined, zone: undefined }, r1, m0, av, sapate }))
  })

  // --- h9. „Se strică aici; cămara are loc." — hrana dintr-un depozit general cu prioritatea PESTE a camarii ---
  await pas('camara-strica-aici', async () => {
    await pH.tasta('v')
    await pH.tasta('k')
    await astepta(200)
    const bD = await pH.js(`__h.dreptunghi(document.querySelector('.ui-sub button[data-zona="0"]'))`)
    if (bD) await pH.click(bD.x, bD.y)
    const inainte = await pH.js('__f.zoneFel().map((z) => z.id)')
    // Un morman de hrana sub cer cu vecinatatea 3×3 fara nicio zona (pionii au mancat din inel: ales din lume, nu dintr-o harta).
    const ales = await pH.js(`(() => {
      const w = __kinstead.world, it = w.iteme, s = w.zone
      let best = null
      for (let i = 0; i < it.count; i++) {
        if (it.alive[i] !== 1 || it.kind[i] !== __h.St.Item.HRANA || __h.Te.loculCelulei(w, it.wx[i], it.wy[i], it.z[i]) !== __h.Te.LOC_CER) continue
        let liber = true
        for (let dx = -2; dx <= 2 && liber; dx++) for (let dy = -2; dy <= 2 && liber; dy++) for (let dz = -2; dz <= 2; dz++) if (__h.Z.celulaDeZonaLa(s, it.wx[i] + dx, it.wy[i] + dy, it.z[i] + dz) !== -1) { liber = false; break }
        if (!liber) continue
        const d = Math.abs(it.wx[i] - ${loc.x - 6}) + Math.abs(it.wy[i] - ${loc.y})
        if (best === null || d < best.d) best = { x: it.wx[i], y: it.wy[i], d }
      }
      return best
    })()`)
    if (ales !== null) await pH.trage([ales.x - 1, ales.y - 1], [ales.x + 1, ales.y + 1], sol + 1)
    await astepta(400)
    const dep = await pH.js(`(() => { const vechi = ${JSON.stringify(inainte)}; const z = __f.zoneFel().filter((x) => !vechi.includes(x.id))[0] ?? null; if (z === null) return null; const w = __kinstead.world, it = w.iteme, s = w.zone; for (let i = 0; i < it.count; i++) { if (it.alive[i] !== 1 || it.kind[i] !== __h.St.Item.HRANA) continue; const cs = __h.Z.celulaDeZonaLa(s, it.wx[i], it.wy[i], it.z[i]); if (cs !== -1 && s.celule.zonaId[cs] === z.id) return { id: z.id, x: it.wx[i], y: it.wy[i] } } return { id: z.id, x: null } })()`)
    const tinta = dep === null || dep.x === null ? null : await clicCelula(dep.x, dep.y)
    const citeste = () => pH.js(`(() => { const K = __kinstead, c = __h.M.inspecteazaCelula(K.world, K.rules, ${tinta?.x}, ${tinta?.y}, ${tinta?.z}, null); return { dom: __h.motivMorman(), asteptat: c.morman?.stare ?? null, prio: c.zona?.prioritate ?? null, plus: __h.dreptunghi([...document.querySelectorAll('.ui-inspector button')].find((b) => b.textContent === '+ prioritate')) } })()`)
    const r0 = tinta === null ? null : await citeste()
    if (r0?.plus) await pH.click(r0.plus.x, r0.plus.y)
    await astepta(400)
    const r1 = tinta === null ? null : await citeste()
    const asteptat = await pH.js(`__h.T.textStricaCamaraAreLoc(3, 4)`)
    bifa('camara-strica-aici', r0 !== null && r1 !== null && r0.prio === 3 && r0.dom?.titlu === 'În depozit.' && r1.prio === 4 && r1.dom !== null && r1.asteptat !== null && r1.dom.titlu === r1.asteptat.titlu && r1.dom.actiune === r1.asteptat.actiune && r1.dom.titlu === asteptat.titlu && r1.dom.actiune === asteptat.actiune,
      'hrana sub cer intr-un depozit general (Zone ▸ Depozit, tras): la prioritate egala cu camara, „În depozit." (camara o trage oricum, rangul ei e mai mare); dupa „+ prioritate" (clic real, 4 > 3): „Se strică aici; cămara are loc." + „Ridică prioritatea cămării peste a depozitului ăstuia (cămara 3, aici 4)." == functia',
      JSON.stringify({ ales, dep, tinta, r0: r0 && { ...r0, plus: undefined }, r1: r1 && { ...r1, plus: undefined } }))
    await pH.poza('h7-strica-aici.png')
  })

  // --- h10. dialogul Joc nou: textul de sub formular == prognoza jocului nou (sub cer si intr-o camara), si dupa tastare reala ---
  await pas('joc-nou-dialog', async () => {
    await pH.js('document.activeElement?.blur(); true')
    // Esc pana se deschide meniul (Esc renunta intai la unealta, apoi la selectie, apoi deschide meniul).
    for (let i = 0; i < 5 && !(await pH.js('__kinstead.ui.modalDeschis()')); i++) { await pH.tasta('Escape'); await astepta(150) }
    await pH.js(`[...document.querySelectorAll('.ui-fereastra button')].find((b) => b.textContent.startsWith('Joc nou'))?.click(); true`)
    await astepta(300)
    const citeste = () => pH.js(`(() => {
      const f = document.querySelector('.ui-fereastra'), v = (n) => f?.querySelector('input[name=' + n + ']')?.value ?? null
      const cat = [...(f?.querySelectorAll('.sub') ?? [])].find((e) => e.previousElementSibling?.classList.contains('ui-form')) ?? null
      const s = Number(v('seed')), o = Number(v('oameni')), h = Number(v('hrana'))
      return { seed: s, oameni: o, hrana: h, text: cat?.textContent ?? null, asteptat: __kinstead.hrana.jocNou(s, o, h), oameniX: __h.dreptunghi(f?.querySelector('input[name=oameni]')), hranaX: __h.dreptunghi(f?.querySelector('input[name=hrana]')) }
    })()`)
    const r0 = await citeste()
    // Tastare reala in campul Oameni (selectat), „6": hrana se trage dupa oameni (230 pe om) cat n-a fost atinsa.
    if (r0.oameniX) { await pH.click(r0.oameniX.x, r0.oameniX.y); await pH.js(`document.querySelector('.ui-fereastra input[name=oameni]').select(); true`); await pH.tasta('6') }
    await astepta(200)
    const r1 = await citeste()
    // 6 oameni cu 1.380 tin cat 12 cu 2.760 (230 pe om): textul nu se schimba. Hrana tastata (2.760 pentru 6) il schimba.
    if (r1.hranaX) { await pH.click(r1.hranaX.x, r1.hranaX.y); await pH.js(`document.querySelector('.ui-fereastra input[name=hrana]').select(); true`); for (const k of '2760') await pH.tasta(k) }
    await astepta(200)
    const r2 = await citeste()
    await pH.poza('h8-joc-nou-dialog.png')
    await pH.js('document.activeElement?.blur(); true')
    for (let i = 0; i < 4 && await pH.js('__kinstead.ui.modalDeschis()'); i++) await pH.tasta('Escape')
    const forma = (t) => /^Hrana ajunge .+ de joc dacă stă sub cer, .+ într-o cămară\. Hrana nu se poate produce încă: după aceea oamenii pleacă\.$/.test(t ?? '')
    bifa('joc-nou-dialog', r0.text === r0.asteptat && forma(r0.text) && r0.oameni === 12 && r1.oameni === 6 && r1.hrana === 1380 && r1.text === r1.asteptat && r2.oameni === 6 && r2.hrana === 2760 && r2.text === r2.asteptat && forma(r2.text) && r2.text !== r1.text,
      'dialogul Joc nou: textul de sub formular == prognoza jocului nou (aceeasi proiectie: sub cer la tickul 0 si intr-o camara) pentru campurile de acum; dupa „6" tastat real in Oameni (hrana se trage la 1.380) si „2760" tastat in Hrană, textul nou == functia',
      JSON.stringify({ r0: { ...r0, oameniX: undefined, hranaX: undefined }, r1: { ...r1, oameniX: undefined, hranaX: undefined }, r2: { ...r2, oameniX: undefined, hranaX: undefined } }))
  })
  if (pH.erori.length) bifa('consola-hranei', false, 'fara erori in consola (pagina hranei)', pH.erori.join(' | '))
}

/**
 * Alterarea pe ecran (t.3 §8; UI-2, UI-5, UI-6, UI-7, UI-10), pe PAGINA EI: `?joc=nou&seed=7&oameni=1&piatra=0&hrana=230`
 * (adresa paginii termice; 4 mormane sub cer), pe pauza. CONTRACTUL LUMII, facut prin comenzile simularii, in pauza: doua
 * pivnite sapate cu `dig` (A — un strat 3×3 de 1 m la 1 m sub suprafata; B — acelasi strat la 2 m, pe un sit cu suprafata cu 1
 * mai sus: straturile lor sunt pe ACELASI nivel), fiecare cu un put de o celula in mijloc (singura celula calcabila: o hrana
 * are nevoie de doi metri de aer). Ordinea sapatului lasa putul GOL (molozul iese la suprafata), apoi in el se pune hrana
 * (`lasaItem`): 75 in A, 45 in B. Pivnitele se inchid reci (C3: proveninta din solul lor), B ramane sub prag, iar A se
 * incalzeste spre ~5,4 °C: tickuri reale (`avanseaza`, ora cu ora) pana cand A e „aproape" (peste prag, sub 0,1% pe zi) si
 * aerul de afara strica (λ > 0). Masurat in node (agentul D2): A trece pragul la ~14 h, B ramane la ~3 °C.
 */
async function paginaAlterarii() {
  let pA = null
  let sc = null
  await pas('pagina-alterarii', async () => {
    pA = await pagina('?joc=nou&seed=7&oameni=1&piatra=0&hrana=230')
    if (!(await pA.js('__kinstead.stare().pauza'))) await pA.tasta(' ')
    await ajutoareHrana(pA)
    sc = await pA.js(`(() => {
      const K = __kinstead, w = K.world, a = w.agents, lx = Math.floor(a.x[0] / 1000), ly = Math.floor(a.y[0] / 1000)
      const ocupat = (x0, y0) => {
        const it = w.iteme; for (let i = 0; i < it.count; i++) if (it.alive[i] === 1 && it.wx[i] >= x0 - 2 && it.wx[i] <= x0 + 4 && it.wy[i] >= y0 - 2 && it.wy[i] <= y0 + 4) return true
        for (let i = 0; i < a.count; i++) if (a.alive[i] === 1) { const x = Math.floor(a.x[i] / 1000), y = Math.floor(a.y[i] / 1000); if (x >= x0 - 3 && x <= x0 + 5 && y >= y0 - 3 && y <= y0 + 5) return true }
        return false
      }
      const luate = []
      const sit = (s) => {
        for (let r = 10; r < 70; r++) for (let dx = -r; dx <= r; dx++) for (const dy of [-r, r]) {
          const x0 = lx + dx, y0 = ly + dy, s0 = K.suprafata(x0, y0)
          if (s0 === null || (s !== null && s0 !== s) || ocupat(x0, y0)) continue
          if (luate.some((e) => Math.abs(e.x0 - x0) < 8 && Math.abs(e.y0 - y0) < 8)) continue
          let plat = true
          for (let i = -1; i <= 3 && plat; i++) for (let j = -1; j <= 3; j++) if (K.suprafata(x0 + i, y0 + j) !== s0) { plat = false; break }
          if (plat) { luate.push({ x0, y0 }); return { x0, y0, s: s0 } }
        }
        return null
      }
      const pivnita = (st, d, q) => {
        let ok = true
        const dig = (i, j, z) => { ok = __h.cmd({ kind: 'dig', wx: st.x0 + i, wy: st.y0 + j, z }).ok && ok }
        const zS = st.s - d, zP = zS - 1
        dig(1, 1, zP)
        dig(1, 1, zS)
        const lasa = __h.cmd({ kind: 'lasaItem', fel: __h.St.Item.HRANA, cantitate: q, wx: st.x0 + 1, wy: st.y0 + 1, z: zP })
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (i !== 1 || j !== 1) dig(i, j, zS)
        const sl = __h.It.itemLaCelula(w.iteme, st.x0 + 1, st.y0 + 1, zP)
        const c = __h.Cam.componentaLa(w.camere, st.x0 + 1, st.y0 + 1, zP)
        return { ...st, d, zS, zP, ok: ok && lasa.ok, hrana: sl === -1 ? null : w.iteme.id[sl], q: sl === -1 ? null : w.iteme.cantitate[sl], comp: c?.id ?? null, volum: c?.volum ?? null, deschise: c?.deschise ?? null }
      }
      const A = sit(null)
      const B = A === null ? null : sit(A.s + 1)
      if (A === null || B === null) return { A, B }
      const subCer = __h.instantaneu().mormane.filter((m) => m.loc === __h.Te.LOC_CER).map((m) => m.id)
      return { lx, ly, A: pivnita(A, 1, 75), B: pivnita(B, 2, 45), subCer }
    })()`)
    if (sc.A === null || sc.B === null || !sc.A.ok || !sc.B.ok) { bifa('pagina-alterarii', false, 'pagina alterarii: pivnitele A si B', JSON.stringify(sc)); sc = null; return }
    // Ora cu ora (tickuri reale), pana cand A e „aproape" si aerul de afara strica; cel mult 30 h.
    const stare = () => pA.js(`(() => { const K = __kinstead, w = K.world, sc = ${JSON.stringify({ A: sc.A, B: sc.B })}, t = (p) => { const c = __h.Cam.componentaLa(w.camere, p.x0 + 1, p.y0 + 1, p.zP); return c === null ? null : { id: c.id, t: __h.Te.temperaturaAcum(w, c.id) } }; const a = t(sc.A), b = t(sc.B), tA = __h.Cl.tAfara(w.seed, w.tick, K.rules); return { tick: w.tick, A: a, B: b, clasaA: a?.t == null ? null : K.hrana.clasaLaT(a.t), clasaB: b?.t == null ? null : K.hrana.clasaLaT(b.t), afara: tA, lambdaAfara: __h.P.rataZilnica(K.rules, tA) } })()`)
    let st = await stare()
    const ore = []
    const gata = (s) => s.clasaA === 1 && s.A.t >= 344064 && s.clasaB === 0 && s.lambdaAfara > 0
    for (let h = 0; h < 30 && !gata(st); h++) { ore.push((await pA.js('__kinstead.avanseaza(1680)')).rulate); st = await stare() }
    sc.comp = { A: st.A?.id ?? null, B: st.B?.id ?? null }
    bifa('pagina-alterarii', gata(st) && sc.A.volum === 10 && sc.B.volum === 10 && sc.A.deschise === 0 && sc.B.deschise === 0 && sc.A.q === 75 && sc.B.q === 45 && sc.subCer.length === 4 && ore.every((n) => n === 1680),
      'pagina alterarii (contractul lumii): pivnitele A si B sapate prin comenzi in pauza (10 m³ fiecare, inchise), hrana in puturile lor; dupa ore de tickuri reale A e „aproape" (peste prag, ≥ 5,25 °C, sub 0,1% pe zi), B sub prag, iar aerul de afara strica (λ > 0)',
      JSON.stringify({ A: sc.A, B: sc.B, ore: ore.length, stare: { ...st, tA: st.A?.t / 65536, tB: st.B?.t / 65536, afara: st.afara / 65536 } }))
    if (!(st.clasaA === 1 && st.clasaB === 0)) sc = null
  })
  if (pA === null || sc === null) return
  const N = 40
  const ONE = await pA.js('__h.St.ONE_ALTERARE')
  /** Ce s-a acumulat pe un morman intre doua instantanee: S + ONE·(unitatile realizate), adica S-ul care nu mai scade la realizare. */
  const acumulat = (m0, m1) => (m1.S - m0.S) + ONE * (m0.q - m1.q)

  // --- a1. alterare-timp: dupa avanseaza(N ≥ 20) S creste pe fiecare morman de sub cer; in pauza nu se schimba nimic ---
  /** Pana cand nimeni nu mananca (cel mult 30 × 200 de tickuri reale): fereastra de N tickuri nu atinge mormanele prin mancat. */
  const satui = async () => { let n = 0; for (let k = 0; k < 30 && !(await pA.js('__h.satui()')); k++) n += (await pA.js('__kinstead.avanseaza(200)')).rulate; return { satui: await pA.js('__h.satui()'), avans: n } }
  await pas('alterare-timp', async () => {
    const sat = await satui()
    const s0 = await pA.js('__h.instantaneu()')
    await astepta(3000)
    const s1 = await pA.js('__h.instantaneu()')
    // Proba negativa: timpul SARIT (`world.tick +=`) in locul avansului real — S ramane pe loc.
    const av = NEGATIVA === 'alterare-timp' ? await pA.js(`(() => { __kinstead.world.tick += ${N}; return { tick: __kinstead.world.tick, rulate: 0 } })()`) : await pA.js(`__kinstead.avanseaza(${N})`)
    const s2 = await pA.js('__h.instantaneu()')
    const subCer = s1.mormane.filter((m) => m.loc === -1)
    const crestere = subCer.map((m) => { const d = s2.mormane.find((x) => x.id === m.id); return { id: m.id, q: [m.q, d?.q ?? null], dS: d ? acumulat(m, d) : null } })
    const lambda = await pA.js(`__h.P.rataZilnica(__kinstead.rules, ${s1.tAfara})`)
    bifa('alterare-timp', sat.satui && s0.pauza && s1.pauza && JSON.stringify(s0) === JSON.stringify(s1) && lambda > 0 && subCer.length >= 2 && s2.unitati + s2.stricat === s1.unitati + s1.stricat
      && av.rulate === N && crestere.every((c) => c.dS !== null && c.dS > 0) && s2.sumaS + ONE * s2.stricat > s1.sumaS + ONE * s1.stricat,
      `alterarea pe S (UI-7): in pauza, 3 s fara nicio schimbare (tick, S, stricat); dupa avanseaza(${N}) (tickuri REALE, nimeni n-a mancat: unitatile + stricatele conservate), S-ul acumulat (S + ONE·unitatile realizate) creste pe FIECARE morman de sub cer (aerul de afara peste prag)`,
      JSON.stringify({ sat, tick: [s1.tick, s2.tick], rulate: av.rulate, afara: s1.tAfara / 65536, lambdaZi: lambda, crestere, sumaS: [s1.sumaS, s2.sumaS], stricat: [s1.stricat, s2.stricat] }))
  })

  // --- a2. alterare-pastrata: hrana pusa in pivnita B (sub prag) isi pastreaza S si unitatile pe aceleasi N tickuri reale, in timp
  // ce hrana de sub cer se strica (controlul ferestrei) ---
  await pas('alterare-pastrata', async () => {
    const sat = await satui()
    // Proba negativa: hrana pusa la SUPRAFATA (sub cer) in locul pivnitei.
    const pus = await pA.js(`(() => {
      const B = ${JSON.stringify(sc.B)}, c = ${NEGATIVA === 'pastrare' ? `__h.celulaSubCer(${sc.lx}, ${sc.ly + 9})` : 'null'}
      const unde = c ?? { x: B.x0 + 1, y: B.y0 + 1, z: B.zP }
      const out = __h.cmd({ kind: 'lasaItem', fel: __h.St.Item.HRANA, cantitate: 30, wx: unde.x, wy: unde.y, z: unde.z })
      const w = __kinstead.world, sl = __h.It.itemLaCelula(w.iteme, unde.x, unde.y, unde.z)
      return { ok: out.ok, unde, id: sl === -1 ? null : w.iteme.id[sl], loc: __h.Te.loculCelulei(w, unde.x, unde.y, unde.z) }
    })()`)
    const s1 = await pA.js('__h.instantaneu()')
    const t1 = pus.loc >= 0 ? await pA.js(`__h.Te.temperaturaAcum(__kinstead.world, ${pus.loc})`) : null
    const av = await pA.js(`__kinstead.avanseaza(${N})`)
    const s2 = await pA.js('__h.instantaneu()')
    const m1 = s1.mormane.find((m) => m.id === pus.id) ?? null, m2 = s2.mormane.find((m) => m.id === pus.id) ?? null
    const control = s1.mormane.filter((m) => m.loc === -1).map((m) => { const d = s2.mormane.find((x) => x.id === m.id); return d ? acumulat(m, d) : null })
    bifa('alterare-pastrata', sat.satui && pus.ok && m1 !== null && m2 !== null && av.rulate === N && control.length >= 2 && control.every((d) => d !== null && d > 0) && m2.S === m1.S && m2.q === m1.q,
      `hrana pusa in pivnita B (lasaItem in put): pe aceleasi ${N} tickuri reale, S-ul si unitatile ei raman EXACT pe loc, in timp ce S-ul acumulat creste pe fiecare morman de sub cer (controlul ferestrei)`,
      JSON.stringify({ sat, pus, T: t1 === null ? null : t1 / 65536, morman: [m1, m2], control, rulate: av.rulate }))
  })

  // --- a3. inspectorul pe morman, in cele trei clase (clic real pe fiecare): cantitatea si randul de alterare == functia;
  // apoi, cu jocul pornit la 3×, fiecare scriere a randului (MutationObserver) == functia in clipa scrierii, in aceleasi noduri ---
  await pas('alterare-inspector', async () => {
    const tinte = []
    const citesteLa = async (t) => pA.js(`({ dom: __h.mormanDom(), functie: __h.mormanFunctie(${t.x}, ${t.y}, ${t.z}) })`)
    // Sub cer: primul morman de start (cel mai mic id), cu nivelurile oprite.
    const m0 = await pA.js(`(() => { const ids = ${JSON.stringify(sc.subCer)}; const m = __h.instantaneu().mormane.filter((x) => ids.includes(x.id)).sort((a, b) => a.id - b.id)[0]; return m ?? null })()`)
    await pA.tasta('v')
    await pA.tasta('r')
    const clic = async (x, y, z, pz) => {
      await pA.js(`__f.centreaza(${x + 0.5}, ${y + 0.5}, ${pz}, 9)`)
      await astepta(300)
      const px = await pA.js(`__h.pixelCelula(${x}, ${y}, ${z === null ? 'null' : z}, ${x + 0.5}, ${pz}, ${y + 0.5})`)
      if (px === null) return null
      await pA.click(px.x, px.y)
      await astepta(450)
      return { x, y, z: px.z }
    }
    const tCer = m0 === null ? null : await clic(m0.wx, m0.wy, null, m0.z)
    const rCer = tCer === null ? null : await citesteLa(tCer)
    await pA.poza('a1-inspector-se-strica.png')
    // Pivnitele: nivelul stratului lor (zS), apoi clic pe podeaua putului (zP − 1).
    const nivel = await laNivel(pA, sc.A.zS)
    const tA = await clic(sc.A.x0 + 1, sc.A.y0 + 1, sc.A.zP - 1, sc.A.zP)
    const rA = tA === null ? null : await citesteLa(tA)
    await pA.poza('a2-inspector-aproape.png')
    const tB = await clic(sc.B.x0 + 1, sc.B.y0 + 1, sc.B.zP - 1, sc.B.zP)
    const rB = tB === null ? null : await citesteLa(tB)
    await pA.poza('a3-inspector-pastreaza.png')
    tinte.push({ t: tCer, r: rCer }, { t: tA, r: rA }, { t: tB, r: rB })
    const egal = (r) => r !== null && r.dom.cant !== null && JSON.stringify(r.dom) === JSON.stringify(r.functie)
    const clase = tinte.map((x) => x.r?.dom.clasa ?? null)
    // La 3×: din nou mormanul de sub cer; observatorul compara fiecare scriere cu functia in clipa ei (nicio bifa nu se
    // reimprospateaza intre pasul simularii si scriere: aceeasi sarcina de cadru, microtask-ul de dupa ea).
    await pA.tasta('r')
    const tCer2 = m0 === null ? null : await clic(m0.wx, m0.wy, null, m0.z)
    const start = tCer2 === null ? null : await pA.js(`(() => {
      const K = __kinstead, t = ${JSON.stringify(tCer2)}, el = document.querySelector('[data-alterare]'), cant = document.querySelector('[data-morman-cantitate]')
      const g = globalThis.__peLoc = { el, cant, istoric: [], scrieri: [], oprit: false, saboteaza: ${NEGATIVA === 'alterare-inspector'} }
      const f = () => JSON.stringify(__h.mormanFunctie(t.x, t.y, t.z))
      // Istoricul functiei, la fiecare cadru (dupa pasul simularii): sabotajul compara scrierea cu starea de acum 400 ms.
      const cadru = () => { if (g.oprit) return; g.istoric.push({ t: performance.now(), f: f() }); if (g.istoric.length > 900) g.istoric.shift(); requestAnimationFrame(cadru) }
      requestAnimationFrame(cadru)
      g.obs = new MutationObserver(() => {
        const dom = JSON.stringify(__h.mormanDom())
        let asteptat = f()
        if (g.saboteaza) { const lim = performance.now() - 400; let e = null; for (const x of g.istoric) if (x.t <= lim) e = x; asteptat = e === null ? null : e.f }
        g.scrieri.push({ tick: K.world.tick, dom, asteptat })
      })
      for (const e of [el, cant]) g.obs.observe(e, { subtree: true, characterData: true, childList: true, attributes: true })
      return { tick: K.world.tick, dom: JSON.stringify(__h.mormanDom()), functie: f() }
    })()`)
    const citiri = []
    if (start !== null) {
      await pA.tasta('3')
      await astepta(300)
      for (let k = 0; k < 60; k++) {
        const c = await pA.js(`(() => { const g = __peLoc; return { tick: __kinstead.world.tick, aceleasi: document.querySelector('[data-alterare]') === g.el && document.querySelector('[data-morman-cantitate]') === g.cant, scrieri: g.scrieri.length, valori: new Set(g.scrieri.map((s) => s.dom).concat(${JSON.stringify(start?.dom ?? '')})).size } })()`)
        citiri.push(c)
        if (c.valori >= 3) break
        await astepta(170)
      }
      await pA.tasta(' ')
      await astepta(400)
    }
    const fin = start === null ? null : await pA.js(`(() => { const g = __peLoc; g.oprit = true; g.obs.disconnect(); return { pauza: __kinstead.stare().pauza, scrieri: g.scrieri, dom: JSON.stringify(__h.mormanDom()), functie: JSON.stringify(__h.mormanFunctie(${tCer2?.x}, ${tCer2?.y}, ${tCer2?.z})) } })()`)
    const valori = fin === null ? 0 : new Set([start.dom, ...fin.scrieri.map((s) => s.dom)]).size
    const gresite = fin === null ? [] : fin.scrieri.filter((s) => s.dom !== s.asteptat)
    const laTrei = start !== null && fin !== null && citiri.length >= 1 && citiri.length <= 60 && citiri.every((c) => c.aceleasi) && valori >= 2 && gresite.length === 0 && fin.pauza && fin.dom === fin.functie && citiri[citiri.length - 1].tick - start.tick >= 100
    bifa('alterare-inspector', nivel === sc.A.zS && tinte.every((x) => egal(x.r)) && JSON.stringify(clase) === '["2","1","0"]'
      && /^Se strică$/.test(rCer.dom.eticheta) && / azi · acum −?[0-9]+,[0-9] °C$/.test(rCer.dom.valoare) && rA.dom.eticheta === 'Se păstrează aproape' && / · la 5,[0-9] °C$/.test(rA.dom.valoare) && rB.dom.eticheta === 'Se păstrează' && / · cu [0-9]+,[0-9] sub prag$/.test(rB.dom.valoare) && laTrei,
      'inspectorul pe morman, clic real pe fiecare: sub cer „Se strică | ~N azi · acum T °C", in pivnita A „Se păstrează aproape | … · la 5,x °C", in pivnita B „Se păstrează | T °C · cu D sub prag" — cantitatea si randul == functia (clasele 2 / 1 / 0); apoi la 3×, pana la 60 de citiri: fiecare scriere a randului == functia in clipa ei, aceleasi noduri, ≥ 2 valori',
      JSON.stringify({ nivel, tinte, laTrei: { citiri: citiri.length, valori, scrieri: fin?.scrieri.length ?? null, gresite: gresite.slice(0, 3), tick: [start?.tick, citiri[citiri.length - 1]?.tick], pauza: fin?.pauza, final: fin && fin.dom === fin.functie } }))
  })

  // --- a4. U-prag: pe nivelul pivnitelor, clasa fiecarei componente == clasa T-ului ei din stare, alfa punctelor din tabel
  // (1 / 0,45 / 0, pe varfurile plasei `puncte-pastrare`), randurile de prag din legenda si cifrele ei neschimbate ---
  await pas('U-prag', async () => {
    await pA.tasta('v')
    await pA.js(`__f.centreaza(${(sc.A.x0 + sc.B.x0) / 2 + 1.5}, ${(sc.A.y0 + sc.B.y0) / 2 + 1.5}, ${sc.A.zS}, 22)`)
    await astepta(300)
    // Proba negativa: gestul pe ALT nivel (trei mai sus: aerul de deasupra solului, fara pivnite).
    const nivel = await laNivel(pA, NEGATIVA === 'U-prag' ? sc.A.zS + 3 : sc.A.zS)
    if (!(await pA.js('__kinstead.tempOverlay.visible'))) await pA.tasta('u')
    await astepta(600)
    // Legenda DESCHISA: randurile ei (si cele de prag) apar dupa „Ce înseamnă culorile" (clic real).
    const bL = await pA.js(`(() => { const b = document.querySelector('.ui-legenda h3 button'); return b && /Ce înseamnă/.test(b.textContent) ? __h.dreptunghi(b) : null })()`)
    if (bL !== null) { await pA.click(bL.x, bL.y); await astepta(400) }
    const r = await pA.js(`(() => {
      const K = __kinstead, o = K.tempOverlay, w = K.world, H = K.hrana, comp = ${JSON.stringify(sc.comp)}
      const g = K.scene.getObjectByName('overlay-temperatura'), p = g?.getObjectByName('puncte-pastrare') ?? null
      const col = p?.geometry?.getAttribute('color') ?? null, pos = p?.geometry?.getAttribute('position') ?? null
      const ALFA = [1, 0.45, 0]
      const clase = [...o.clase].sort((a, b) => a[0] - b[0])
      const gresiteClase = clase.filter(([id, c]) => c !== H.clasaLaT(w.temperatura.slot.t[id]))
      let gresiteAlfa = 0, quaduri = 0
      if (col !== null) for (let i = 0; i < o.quadComp.length; i++) {
        quaduri++
        const c = o.clase.get(o.quadComp[i]), a = c === undefined ? 0 : ALFA[c]
        for (let k = 0; k < 6; k++) if (Math.abs(col.array[(i * 6 + k) * 4 + 3] - a) > 1e-6) gresiteAlfa++
      }
      const n = [0, 0, 0]
      for (const [, c] of o.clase) n[c]++
      const L = document.querySelector('.ui-legenda'), plin = L?.querySelector('li[data-prag="plin"]'), slab = L?.querySelector('li[data-prag="slab"]'), cifre = L?.querySelector('.cifre')
      const randuri = __h.T.randuriPragU(__h.P.pragAlterare(K.rules), __h.T.textProcent1(__h.M.PRAG_APROAPE_ZI))
      let nT = 0, mn = Infinity, mx = -Infinity
      for (const id of o.valori.keys()) { const t = __h.Te.temperaturaAcum(w, id); if (t === null) continue; nT++; mn = Math.min(mn, t); mx = Math.max(mx, t) }
      return { vizibil: o.visible, nivel: o.nivel, clase, clasaA: o.clase.get(comp.A) ?? null, clasaB: o.clase.get(comp.B) ?? null, gresiteClase, quaduri, varfuri: pos?.count ?? 0, itemSize: col?.itemSize ?? null, gresiteAlfa, puncte: o.puncte, numarate: n,
        plin: plin?.textContent ?? null, slab: slab?.textContent ?? null, randuri: randuri.map((x) => x.t), cifre: cifre?.textContent ?? null, cifreInLi: !!cifre?.closest('li'), cifreAsteptate: __h.T.textIntervalTemperatura(nT, mn, mx, __h.Cl.tAfara(w.seed, w.tick, K.rules)) }
    })()`)
    await pA.poza('a4-harta-U-legenda.png')
    await pA.js(`__f.centreaza(${sc.A.x0 + 1.5}, ${sc.A.y0 + 1.5}, ${sc.A.zS}, 6)`)
    await astepta(400)
    await pA.poza('a5-harta-U-aproape.png')
    await pA.js(`__f.centreaza(${sc.B.x0 + 1.5}, ${sc.B.y0 + 1.5}, ${sc.B.zS}, 6)`)
    await astepta(400)
    await pA.poza('a6-harta-U-pastreaza.png')
    bifa('U-prag', r.vizibil && r.nivel === sc.A.zS && nivel === sc.A.zS && r.clasaA === 1 && r.clasaB === 0 && r.gresiteClase.length === 0 && r.itemSize === 4 && r.quaduri >= 18 && r.varfuri === r.quaduri * 6 && r.gresiteAlfa === 0
      && JSON.stringify(r.puncte) === JSON.stringify(r.numarate) && r.plin === r.randuri[0] && r.slab === r.randuri[1] && r.cifre === r.cifreAsteptate && !r.cifreInLi,
      'harta U pe nivelul pivnitelor (Q/E reale, apoi U): clasa fiecarei componente == clasaLaT(T din stare) — A „aproape", B „se păstrează"; alfa punctelor pe cele 6 varfuri ale fiecarei celule == 1 / 0,45 / 0 dupa clasa; contoarele punctelor; in legenda randurile de prag (li[data-prag] plin / slab) == randuriPragU, iar cifrele (element separat) == intervalul T-urilor din stare',
      JSON.stringify({ nivel, legendaDeschisa: bL !== null, ...r }))
  })
  if (pA.erori.length) bifa('consola-alterarii', false, 'fara erori in consola (pagina alterarii)', pA.erori.join(' | '))
}
