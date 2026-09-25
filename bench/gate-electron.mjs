/**
 * Lansatorul de gate sub Electron — a doua jumatate a golului nr. 3 din bench/GATE.md §12.
 *
 * Chrome curat masoara Chromium. Livrarea e Electron cu `--in-process-gpu` (cerut de
 * overlay-ul Steam), care schimba calea de randare: procesul de GPU devine un fir in
 * procesul principal. Scriptul asta deschide ACEEASI pagina de gate, cu ACEIASI parametri,
 * sub Electron cu flagurile de livrare, si salveaza pe disc JSON-ul pe care pagina il
 * descarca singura la final. Nu pornește de unul singur: il lanseaza `ruleaza-gate.cmd`,
 * care intai construieste build-ul de productie si porneste serverul de preview.
 *
 *   electron bench/gate-electron.mjs <url> [--curat] [--iesire=<dir>] [--fum]
 *
 *   --curat    fara `--in-process-gpu`. Ablatia: Chrome vs Electron-curat vs Electron-livrare
 *              separa costul GAZDEI de costul FLAGULUI; GATE.md §12 pune pragul de 5% pe flag.
 *   --iesire   unde se salveaza JSON-ul (implicit: dosarul Downloads, ca la Chrome).
 *   --fum      proba de fum, fara om: fereastra ASCUNSA, deci rularea e invalida prin
 *              protocol si nu ajunge la capat — dar verifica tot restul lantului: Electron
 *              porneste, flagurile ajung pe linia de comanda, pagina se incarca fara erori,
 *              garda de vizibilitate se APRINDE, iar o descarcare pornita din pagina ajunge
 *              pe disc. Ce ramane de neprobat fara un om e exact ce spune GATE.md §5b.
 *
 * Ce nu face, deliberat: nu opreste `backgroundThrottling` si nu forteaza rAF-ul intr-o
 * fereastra ascunsa. Ar face rularea „sa mearga" de una singura — adica ar masura altceva
 * decat ce vede jucatorul, si ar ocoli fix garda pe care protocolul o considera cea mai
 * importanta.
 */
import { app, BrowserWindow, session } from 'electron'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join } from 'node:path'

const argv = process.argv.slice(process.defaultApp ? 2 : 1)
const fum = argv.includes('--fum')
const curat = argv.includes('--curat')
const urlArg = argv.find((a) => /^https?:\/\//.test(a))
const iesireArg = argv.find((a) => a.startsWith('--iesire='))?.slice('--iesire='.length)

if (!urlArg) {
  console.error('lipseste URL-ul paginii de gate (http://localhost:4173/?...)')
  app.exit(2)
}

// Flagurile de MASURA le are si Chrome in `ruleaza-gate.cmd`: fara
// `enable-webgl-developer-extensions`, EXT_disjoint_timer_query_webgl2 lipseste si
// atribuirea CPU/GPU ramane grosiera (GATE.md §12, golul 6). Cele de LIVRARE sunt
// intrebarea insasi.
const FLAGURI_MASURA = ['enable-webgl-developer-extensions']
const FLAGURI_LIVRARE = curat ? [] : ['in-process-gpu']
const FLAGURI = [...FLAGURI_LIVRARE, ...FLAGURI_MASURA]
for (const f of FLAGURI) app.commandLine.appendSwitch(f)

// Profil nou, ca la Chrome: fara cache, fara nimic ramas de la o rulare anterioara.
app.setPath('userData', join(tmpdir(), 'kin-bench-electron'))

// Pagina isi scrie in JSON ce flaguri i-a DECLARAT lansatorul. Nu poate verifica
// singura ca au ajuns pe linia de comanda; UA-ul, in schimb, e al browserului si spune
// „Electron/44.x" fara sa poata fi declarat din URL.
const url = new URL(urlArg ?? 'http://localhost:4173/')
url.searchParams.set('flags', FLAGURI.join(','))

const iesire = iesireArg ?? app.getPath('downloads')
mkdirSync(iesire, { recursive: true })

/** Ca la Chrome: un fisier existent NU se suprascrie, se numeroteaza. */
function caleLibera(dir, nume) {
  const ext = extname(nume)
  const baza = basename(nume, ext)
  let cale = join(dir, nume)
  for (let n = 1; existsSync(cale); n++) cale = join(dir, `${baza} (${n})${ext}`)
  return cale
}

const raportFum = []
function bifa(ok, ce) {
  raportFum.push({ ok, ce })
  console.log(`${ok ? '✓' : '✗'} ${ce}`)
}

app.on('window-all-closed', () => app.quit())

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    useContentSize: true,
    show: !fum,
    title: `Kinstead — gate sub Electron ${FLAGURI_LIVRARE.length ? '(livrare)' : '(curat)'}`,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  })

  const erori = []
  win.webContents.on('console-message', (ev) => {
    if (ev.level === 'error') erori.push(ev.message)
  })

  let descarcat = null
  session.defaultSession.on('will-download', (_ev, item) => {
    const cale = caleLibera(iesire, item.getFilename())
    item.setSavePath(cale)
    item.once('done', (_e, stare) => {
      descarcat = { cale, stare }
      const mesaj = stare === 'completed' ? `salvat: ${cale}` : `descarcarea a esuat: ${stare}`
      console.log(mesaj)
      if (!win.isDestroyed()) win.setTitle(`GATA · ${mesaj}`)
    })
  })

  // A doua garda de vizibilitate, in procesul care chiar STIE. Masurat pe 25.09:
  // o fereastra Electron creata cu show:false raporteaza in pagina
  // `visibilityState = 'visible'`, iar rAF-ul ii curge la ~2,5 Hz (5 cadre in 2 s).
  // Garda paginii (GATE.md §7.1) e oarba exact acolo: rularea ar dura 24 de
  // minute si ar iesi VALIDA, cu intervale de 400 ms. `hide()` si `minimize()`
  // dau `hidden` corect, deci pe alea garda paginii le prinde; asta le prinde
  // si pe ele, dar rostul ei e fereastra care n-a fost aratata niciodata.
  async function invalideaza(motiv) {
    const js = `(() => {
      if (typeof __kinstead !== 'object') return false
      globalThis.__kinsteadGardaElectron = ${JSON.stringify(motiv)}
      __kinstead.probe.invalidate(${JSON.stringify(motiv)})
      return true
    })()`
    for (let i = 0; i < 120; i++) {
      if (win.isDestroyed()) return
      if (await win.webContents.executeJavaScript(js)) { console.log(`INVALID · ${motiv}`); return }
      await new Promise((r) => setTimeout(r, 250))
    }
  }
  win.on('hide', () => { void invalideaza('fereastra a fost ascunsa in timpul rularii (Electron: win.hide)') })
  win.on('minimize', () => { void invalideaza('fereastra a fost minimizata in timpul rularii (Electron: win.minimize)') })

  await win.loadURL(url.href)
  if (!win.isVisible() || win.isMinimized()) {
    await invalideaza('fereastra nu e vizibila la pornire (Electron: win.isVisible() = false) — pagina o crede vizibila, rAF curge la ~2,5 Hz')
  }

  if (!fum) return

  // --- proba de fum ---
  const t0 = Date.now()
  const limita = 90_000
  try {
    // Pagina isi expune obiectele abia dupa ce a generat lumea (sincron, la sfarsitul
    // modulului); `did-finish-load` s-a intamplat deja, dar se asteapta oricum.
    let gata = false
    while (!gata && Date.now() - t0 < limita) {
      gata = (await win.webContents.executeJavaScript('typeof __kinstead')) === 'object'
      if (!gata) await new Promise((r) => setTimeout(r, 250))
    }
    bifa(gata, `pagina s-a incarcat si a generat lumea (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
    if (!gata) throw new Error('pagina nu a ajuns la capat')

    const info = await win.webContents.executeJavaScript(`(async () => {
      const gl = __kinstead.renderer.getContext()
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      return {
        ua: navigator.userAgent,
        vizibil: document.visibilityState,
        gpu: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : null,
        timer: gl.getExtension('EXT_disjoint_timer_query_webgl2') !== null,
        invalid: __kinstead.probe.invalid,
        gardaElectron: globalThis.__kinsteadGardaElectron ?? null,
        rafIn1s: await new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1000) requestAnimationFrame(f); else res(n) }; requestAnimationFrame(f); setTimeout(() => res(-n), 1500) }),
        flags: new URLSearchParams(location.search).get('flags'),
      }
    })()`)

    bifa(/Electron\/\d+/.test(info.ua), `UA-ul e Electron: ${info.ua}`)
    for (const f of FLAGURI) bifa(app.commandLine.hasSwitch(f), `--${f} e pe linia de comanda`)
    bifa(info.flags === FLAGURI.join(','), `pagina a primit lista de flaguri: ${info.flags}`)
    bifa(info.timer, `EXT_disjoint_timer_query_webgl2 e disponibila (atribuirea CPU/GPU fina)`)
    console.log(`  GPU raportat de WebGL: ${info.gpu}`)
    bifa(typeof info.gpu === 'string' && info.gpu.includes('RTX 3060'), `GPU-ul e cel asteptat de garda (RTX 3060), nu iGPU-ul si nu SwiftShader`)
    // Proba NEGATIVA a gardei sub Electron, pe cazul in care garda PAGINII e oarba:
    // fereastra n-a fost aratata, pagina o crede vizibila, rAF-ul curge — si garda
    // din procesul principal TREBUIE sa fi invalidat rularea. Daca n-a facut-o,
    // lansatorul ar produce un JSON valid dintr-o fereastra pe care n-o vede nimeni.
    bifa(info.vizibil === 'visible', `pagina crede ca e vizibila (${info.vizibil}) — asta e orbirea documentata, nu o reparatie`)
    console.log(`  rAF intr-o secunda, fereastra nearatata: ${info.rafIn1s}`)
    bifa(win.isVisible() === false, `procesul principal stie ca fereastra NU e vizibila (win.isVisible() = ${win.isVisible()})`)
    bifa(typeof info.gardaElectron === 'string', `garda din procesul principal s-a APRINS: ${info.gardaElectron}`)
    bifa(typeof info.invalid === 'string' && info.invalid.length > 0, `rularea e marcata INVALIDA in sonda paginii: ${info.invalid}`)
    bifa(erori.length === 0, erori.length === 0 ? 'nicio eroare in consola paginii' : `erori in consola: ${erori.join(' | ')}`)

    // Descarcarea, pe acelasi drum pe care il ia JSON-ul adevarat (blob + <a download>).
    await win.webContents.executeJavaScript(`(() => {
      const blob = new Blob([JSON.stringify({ fum: true, ua: navigator.userAgent })], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = 'gate-fum.json'
      a.click()
    })()`)
    while (!descarcat && Date.now() - t0 < limita) await new Promise((r) => setTimeout(r, 100))
    const continut = descarcat?.stare === 'completed' ? JSON.parse(readFileSync(descarcat.cale, 'utf8')) : null
    bifa(continut?.fum === true, `descarcarea din pagina a ajuns pe disc: ${descarcat?.cale ?? 'NU'}`)
  } catch (e) {
    bifa(false, `exceptie: ${e?.message ?? e}`)
  }

  const picate = raportFum.filter((r) => !r.ok).length
  console.log(picate === 0 ? '\nFUM: tot lantul functioneaza; ramane rularea cu fereastra vizibila, care e a unui om.' : `\nFUM: ${picate} verificari picate.`)
  app.exit(picate === 0 ? 0 : 1)
})
