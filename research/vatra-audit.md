# vatra-audit — Audit tehnic al prototipului Vatra 0.2 (TypeScript + three.js + Tauri) ca fundație pentru un colony sim / base-builder de tip Going Medieval + Sapiens

## Rezumat

Vatra 0.2 NU este un prototip de ~1300 de linii, ci două jocuri într-un singur arbore: jocul real (Vatra, kingdom builder) are 335 de linii TS, iar 772 de linii (59% din src) sunt un prototip naval abandonat ("Last Across" — bărci, covenants, maree) complet inaccesibil din `src/main.ts`. Am rulat efectiv suita: `npx tsx --test tests/*.test.ts` dă 44 pass / 0 fail în ~1.0s, iar `npx tsc --noEmit` iese cu cod 0 — deci revendicarea "44 de teste trecute" este ADEVĂRATĂ literal, dar doar 18 dintre ele ating Vatra (11 în tests/vatra.test.ts + 7 în tests/logistics.test.ts); restul de 26 testează jocul naval mort. Contrar premisei sarcinii, documentele NU mint: README.md și outputs/plan/PROGRES.md declară explicit împărțirea "18 pentru Vatra și 26 istorice", marchează R02/R08/R11/R12 ca PARȚIAL și țin un registru de riscuri K01–K08; AGENTS.md interzice explicit declararea unei funcționalități drept completă doar fiindcă compilează. Toate cele 14 revendicări F01–F14 sunt susținute de cod; 13 au și test automat, iar F14 (stabilitatea formularelor) are doar o gardă de focus în `main.ts:39` și zero test. Am verificat independent conservarea resurselor pe 2000 de tick-uri: derivă zero — diferențele de lemn/piatră se explică exact prin costurile de construcție plus un lot de rețetă în tranzit. Arhitectural, simularea e curat separată de randare într-un singur sens (sim n-are THREE/DOM și e deterministă, fără RNG în tick), dar lipsește complet stratul de comenzi pe care prototipul naval îl avea: UI-ul mută starea direct, deci nu există replay de acțiuni, undo sau drum spre multiplayer. Limitele structurale sunt fatale pentru genul țintit: harta e 44×32 constantă la nivel de modul, `Tile` n-are câmp de înălțime (deci zero z-levels, zero săpat — pilonul central din Going Medieval), fiecare clădire ocupă exact un tile, o curte are o singură activitate, iar `Person` are doar hp/oboseală/rații — fără somn, dispoziție, temperatură, skill-uri, trăsături sau relații. Peretele de performanță e pathfinding-ul: Dijkstra cu extragere liniară a minimului și `open.includes()`, fără cache, 0.227 ms pe apel, chemat o dată per clădire candidată în `closest()`; am măsurat 0.13 ms/tick la 16 oameni, 1.86 ms/tick la 60 și 1.25 ms/tick la 122 de clădiri cu doar 12 oameni — superliniar pe ambele axe. Nu există `.git` nicăieri în Vatra și nici în sus până la MyWork, iar `src-tauri/target` a dispărut, așa că cele 5 teste Rust NU au putut fi rulate de mine. În `outputs/` există două executabile dev nesemnate, Vatra.exe și Vatra-0.2.exe, ~12.74 MB fiecare.

## Constatări (24)

### Arborele conține DOUĂ jocuri, iar 59% din sursele TS sunt cod mort dintr-un prototip naval abandonat

- **Detaliu:** `src/main.ts` are o singură linie: `import './vatra/main'`. Graful de import pornit de acolo atinge doar 8 fișiere (335 linii). Rămân 772 de linii — src/sim/engine.ts (220), ui/app.ts (123), gen/procedural.ts (96), render/scene.ts (95), platform/* (60), sim/world.ts (46), content/rules.ts (40), sim/covenant.ts (35), sim/types.ts (31), ui/icons.ts (20), sim/rng.ts (6) — care implementează un cu totul alt joc: bărci ('reed'/'lantern'), covenants cu clauze, maree, rezervor remorcat, cuter inamic. Tree-shaking le ține în afara bundle-ului (am căutat 'Bracken Quay', 'Three Bells', 'covenant', 'Juniper' în dist/assets/index-BTXdA3AM.js: 0 apariții), dar ele intră în `tsc --noEmit` și în suita de teste.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\main.ts:1 (+ graful de import din src/) · încredere: ridicat
- **Implicație:** Nu porni de la acest arbore. Orice sesiune viitoare va plăti taxa de a distinge `src/sim/engine.ts` (mort) de `src/sim/vatra.ts` (viu), iar headline-ul 'suita trece' va rămâne permanent înșelător. Dacă totuși refolosești ceva, primul commit din proiectul nou șterge toate cele 11 fișiere.

### Revendicarea '44 de teste trecute' este literal adevărată — am rulat-o

- **Detaliu:** `npx tsx --test tests/*.test.ts` din directorul Vatra: `tests 44 / pass 44 / fail 0 / duration_ms 1005.5`. Distribuție reală: tests/sim.test.ts 24, tests/vatra.test.ts 11, tests/logistics.test.ts 7, tests/generation.test.ts 1, tests/platform.test.ts 1.
- **Sursă:** rulare `npx tsx --test tests/*.test.ts` în C:\Users\besli\Desktop\MyWork\Apps\games\Vatra · încredere: ridicat
- **Implicație:** Numărul poate fi citat fără rezerve, dar NU ca măsură a acoperirii Vatra. Nu-l refolosi ca bază de comparație pentru proiectul nou.

### Doar 18 din cele 44 de teste ating jocul Vatra; 26 testează jocul mort — iar documentația spune deja asta corect

- **Detaliu:** tests/vatra.test.ts (11) și tests/logistics.test.ts (7) importă din `src/sim/vatra` și `src/vatra/save`. tests/sim.test.ts (24) importă `createGame`/`command`/`covenantSchema` — jocul naval. tests/generation.test.ts testează `island()` din gen/procedural.ts, tests/platform.test.ts testează `autosaveDue()` — un helper pe care `src/vatra/main.ts` nici nu-l folosește (are propriul `autosave()` la linia 69). O singură excepție utilă: linting-ul de puritate din tests/sim.test.ts:14 face `readdirSync('src/sim')` și acoperă deci și vatra.ts.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\tests\sim.test.ts:5-10 vs tests\vatra.test.ts:3-4; README.md secțiunea 'Verificare 0.2' · încredere: ridicat
- **Implicație:** README.md scrie textual '44 teste TypeScript (18 pentru Vatra și 26 istorice)', iar PROGRES.md are riscul K05 'Testele istorice umflă percepția acoperirii Vatra — DOCUMENTAT'. Autorul documentelor a fost onest. Tratează documentele ca sursă de încredere, nu ca marketing.

### `npx tsc --noEmit` trece curat, pe tot arborele, în strict mode

- **Detaliu:** Exit code 0, zero erori. tsconfig.json are `strict: true`, `noUnusedLocals: true`, `noUnusedParameters: true` și include atât `src` cât și `tests`. Deci și cele 772 de linii moarte sunt type-safe.
- **Sursă:** rulare `npx tsc --noEmit`; C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\tsconfig.json · încredere: ridicat
- **Implicație:** Configurația TS este strictă și corectă — copiaz-o verbatim în proiectul nou. Este singurul fișier de configurare din Vatra pe care l-aș refolosi fără modificări.

### Simularea este cu adevărat deterministă, dar prin absența oricărui RNG în tick, nu prin gestionarea lui

- **Detaliu:** `create()` folosește un LCG (`Math.imul(rng,1664525)+1013904223`) DOAR pentru generarea hărții. Funcția `tick()` nu conține niciun apel de random, ceas sau I/O. Determinismul e verificat de tests/vatra.test.ts:16 ('mid-transport save resumes the exact deterministic evolution', `assert.deepEqual` după 200 de pași) și tests/logistics.test.ts:15. Ordonările folosesc tie-break explicit pe `id` în `closest()`, iar restul se bazează pe stabilitatea `Array.prototype.sort`.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra.ts:19 (LCG), :151-163 (tick fără random), :72 (tie-break pe id) · încredere: ridicat
- **Implicație:** Determinismul e real dar fragil: în clipa în care adaugi evenimente stocastice (vreme, accidente, animale, spawn de raid variabil) ai nevoie de un stream RNG serializat în save. Prototipul naval avea unul corect (`rng:{value,cursor}` în state, src/sim/types.ts:16) — ia ACEL tipar, nu absența din Vatra.

### Lipsește complet stratul de comenzi — UI-ul mută starea direct, deci nu există replay, undo sau drum spre multiplayer

- **Detaliu:** `src/vatra/main.ts` ține `let state=create()` la nivel de modul și cheamă `tick(state)` mutând în loc. Handler-ele apelează direct `settle/place/configure/draft/scout/demolish/configureStorage`, iar la linia 66 UI-ul scrie direct în model: `p.assigned=Number(input.value); if(p.job?.kind==='produce')p.job=null;`. Prototipul naval mort avea exact ce lipsește: un `Command` union, `refusal(state,c)` pentru validare și `command(state,c)` care returnează `{state,error}`.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\vatra\main.ts:66 vs src\sim\types.ts:24-30 și src\sim\engine.ts:35,83 · încredere: ridicat
- **Implicație:** Pentru un colony sim serios, stratul de comenzi este obligatoriu de la prima linie: îl vrei pentru undo, pentru repetarea bug-urilor din save-urile jucătorilor și pentru un eventual co-op. Ironia auditului: tiparul corect EXISTĂ în repo, dar în jumătatea care se aruncă.

### F01–F13 sunt susținute de cod ȘI de test automat; doar F14 nu are test

- **Detaliu:** F01 explorare: `reveal()` vatra.ts:17, `scout()` :61, gardă `seen` în `place()` :34 — test vatra.test.ts:19. F02 șantiere aprovizionate fizic: `assign()` :96 — test :9. F03 demolare cu 50%: :59 — teste :10,:11. F04 curți configurabile: `configure()` :39 — test :13. F05 drumuri: cost .4 în `path()` :67, prag .65 în `move()` :118 — test :12. F06 populație comună: `draft()` :60, `fight()` :134, `if(p.role==='soldier')continue` :156 — test :14. F07 hrană purtată: job 'eat' :89,:129 — test :15. F08 raiduri: :140-150 — test :18. F09 salvări: save.ts integral + main.rs:24 — teste :16,:17. F10–F13: `configureStorage()` :42, `room()` :56, migrare build 1 prin zod `.default()` save.ts:12 — teste logistics.test.ts:9-14. F14: singura protecție este garda de focus din main.ts:39, fără test.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra.ts + tests\vatra.test.ts + tests\logistics.test.ts · încredere: ridicat
- **Implicație:** Registrul F01–F14 din PROGRES.md poate fi luat drept exact. Niciuna dintre cele 14 revendicări nu este falsă sau parțială în sensul de 'lipsește din cod'. Singurul gol real este F14, exact acolo unde documentul spune 'editări observate în preview', nu 'testat'.

### Am verificat independent conservarea resurselor: derivă ZERO pe 2000 de tick-uri

- **Detaliu:** Scenariu propriu (4 curți: lemn/piatră/hrană/unelte, raiduri dezactivate, 2000 tick-uri). Lemn: așteptat 284, real 250, diferență −34 = 4 curți × 8 lemn + 2 lemn dintr-un lot de rețetă în tranzit. Piatră: −9 = 4 × 2 + 1 în tranzit. Unelte: diferență exact 0. Bunurile nu apar și nu dispar; input-ul de rețetă e reținut la START-ul jobului (vatra.ts:105), nu la final, deci nu poate fi dublat.
- **Sursă:** rulare proprie pe C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra.ts; mecanica la :105, :124-128 · încredere: ridicat
- **Implicație:** Aceasta este cea mai valoroasă proprietate a prototipului și singura care se transferă ca principiu, nu ca cod. Scrie invariantul de conservare ca test de proprietate în proiectul nou ÎNAINTE de prima rețetă.

### Rețeta `tools` — singura rețetă cu input, adică singurul lanț real de producție — nu este exercitată de niciun test

- **Detaliu:** RECIPES: wood/stone/food au `input: stock()` (gol); doar tools cere 2 lemn + 1 piatră. În toate rulările de test `stats.produced.tools` este 0 (output-ul suitei arată `produced: {wood:66, stone:42, food:201, tools:0}`). Testul de mobilizare consumă unelte, dar din stocul inițial de 12 al vetrei, nu din producție. Am verificat separat că rețeta funcționează: 193 de unelte în 2000 de tick-uri.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\content\vatra.ts:4; output suită tests\vatra.test.ts:13 · încredere: ridicat
- **Implicație:** Întregul 'lanț de producție' al jocului este o singură rețetă cu două input-uri, netestată. Orice colony sim serios are 20–50 de rețete cu lanțuri de 3–4 nivele. Aici nu există fundație de reutilizat — există o demonstrație.

### Harta 44×32 nu e doar un număr de tuning: e o constantă de modul încastrată în tipuri, în schema de salvare și în toate funcțiile de coordonate

- **Detaliu:** `export const W=44,H=32,VERSION=1` la vatra.ts:6. `xy()`, `dist()`, `neighbors()`, `walkable()` citesc W/H din closure. Schema zod validează `z.array(...).length(W*H)` (save.ts:11) și `tile=int.max(W*H-1)` (:6), iar `version:z.literal(VERSION)`. Nu există chunking, streaming sau hartă pe regiuni.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra.ts:6-13 și src\vatra\save.ts:6,11 · încredere: ridicat
- **Implicație:** Mărirea hărții invalidează toate salvările și nu există mecanism de migrare în afara `.default()` din zod. Pentru 'open world' ai nevoie de chunks din prima zi — asta înseamnă rescrierea `State`, a schemei și a pathfinding-ului simultan. Nu e o modificare incrementală.

### Zero z-levels, zero săpat, zero modificare de teren — pilonul central din Going Medieval lipsește la nivel de tip de date

- **Detaliu:** `Tile = {terrain:'grass'|'forest'|'rock'|'water'; amount:number; seen:boolean}`. Nu există câmp de înălțime, de strat, de pantă sau de acoperiș. Nu există nicio funcție care să schimbe `terrain` în afara generării inițiale. 'Agricultura' este o curte cu `activity:'food'` pe pajiște — nu există parcele, nu există sol modificat.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra-types.ts:6 · încredere: ridicat
- **Implicație:** Dacă referința ta e Going Medieval, cea mai definitorie mecanică a ei nu doar că lipsește — structura de date o exclude. Adăugarea z-levels schimbă Tile, State, pathfinding, save schema, randare și pick-ul cu mouse-ul. Adică tot.

### Fiecare clădire ocupă exact un tile și găzduiește o singură activitate; nu există multi-tile, rotație, camere sau module

- **Detaliu:** `Building = {id, tile:number, kind, built, progress, stock, activity:Activity, workers, priority, target, accept, reserve}`. Un singur `tile:number`, un singur `activity`. `at(s,t)` caută prin `find(b=>b.tile===t)`. Randarea desenează un cub pe celulă (view.ts:37-38). R04 din ROADMAP ('structuri extensibile și activități combinate') este exact recunoașterea acestei limite.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra-types.ts:7; src\sim\vatra.ts:11,39 · încredere: ridicat
- **Implicație:** Construcția flexibilă pe care o promite VATRA-design.md secțiunea 4 (structură + capacitate + module) cere rescrierea completă a `Building`, a schemei de salvare, a UI-ului panoului și a adiacenței în pathfinding. Zero cod refolosibil de aici.

### Modelul de pion nu are nevoi de colony sim: doar hp, oboseală și rații

- **Detaliu:** `Person = {id, name, tile, travel, job, cargo, role, drafted, equipped, hp, fatigue, assigned, scout, rations}`. Nu există somn, dispoziție/mood, temperatură, skill-uri sau progres de skill, trăsături, relații, vârstă, sau răni pe zone de corp. Sănătatea e un singur număr care scade cu 0.5 la 10 tick-uri când rațiile sunt sub 0.2 (vatra.ts:155).
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra-types.ts:9; src\sim\vatra.ts:155 · încredere: ridicat
- **Implicație:** Sursa de poveste dintr-un colony sim (pionul cu nume care obosește, se îmbolnăvește, se ceartă, devine expert) nu există. `Person` trebuie rescris integral — și este tipul în jurul căruia se organizează tot restul simulării.

### Pathfinding-ul este peretele structural de performanță: Dijkstra naiv, fără cache, chemat o dată per clădire candidată

- **Detaliu:** `path()` folosește extragerea minimului prin scanare liniară (`for(let i=1;i<open.length;i++)`) și testul de apartenență `open.includes(n)` — ambele O(n) pe frontieră. Fără cache, fără A*, fără flow-field, fără regiuni. Am măsurat 0.227 ms per apel pe 44×32. `closest()` (:72) face `.find(b=>path(s,t,b.tile)!==null)` — un Dijkstra complet per clădire candidată, iar `haul()` mai cheamă `path()` încă o dată după.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra.ts:63-68, :72, :78-80 · încredere: ridicat
- **Implicație:** Aceasta este prima piesă de rescris, indiferent de decizia finală. Într-un colony sim cu 100+ pioni și 300+ clădiri, arhitectura asta nu e optimizabilă — trebuie înlocuită cu regiuni + flow-field sau A* cu cache de rute per pereche de regiuni.

### Costul pe tick crește superliniar pe DOUĂ axe independente: număr de oameni și număr de clădiri

- **Detaliu:** Benchmark propriu. Pe axa oamenilor (16 clădiri constant): 16 oameni → 0.13 ms/tick; 24 → 0.31; 32 → 0.58; 41 → 0.89; 60 (plafonul jocului) → 1.86 ms/tick. Pe axa clădirilor (12 oameni constant): 6 clădiri → 0.11 ms/tick; 22 → 0.23; 62 → 0.70; 122 → 1.25 ms/tick. Cauza secundară: `reserved()` și `inbound()` scanează TOȚI oamenii la fiecare apel, iar `assign()` le cheamă în bucle imbricate per clădire × per bun.
- **Sursă:** benchmark propriu pe C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra.ts; cod la :69-71, :93-115 · încredere: ridicat
- **Implicație:** Plafoanele actuale (60 de oameni în vatra.ts:161, 16-20 clădiri tipic) nu sunt alegeri de design — sunt ceea ce face arhitectura suportabilă. Un colony sim vrea 100-200 de pioni și sute de structuri; asta e ~10-30× peste ce suportă modelul actual.

### Randarea rescanează liniar lista de clădiri de 2816 ori pe redesenare și reconstruiește toate mesh-urile la orice schimbare de clădire

- **Detaliu:** În `view.ts:35`, bucla peste toate cele 1408 celule cheamă `at(s,i)` de două ori per celulă, iar `at()` este `s.buildings.find(b=>b.tile===t)` — scanare liniară. La :37, o semnătură string `id:kind:built:activity` per clădire: dacă se schimbă un singur caracter, TOATE grupurile de structuri sunt scoase, geometriile și materialele dispose-uite, și totul reconstruit de la zero.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\vatra\view.ts:35,37; src\sim\vatra.ts:11 · încredere: ridicat
- **Implicație:** InstancedMesh pentru teren/oameni/copaci este alegerea corectă și merită păstrată ca idee. Restul (indexare liniară, invalidare totală prin semnătură string) trebuie înlocuit cu o hartă tile→building și invalidare pe chunk.

### NU există control de versiune: zero `.git` în Vatra și în niciun director părinte până la MyWork

- **Detaliu:** `git rev-parse --show-toplevel` din Vatra: 'fatal: not a git repository (or any of the parent directories)'. Am verificat explicit Vatra, games, Apps și MyWork — niciunul nu conține `.git`. Există `.gitignore` (node_modules/, dist/, src-tauri/target/, .toolchain-path), deci intenția a existat, dar repo-ul nu a fost inițializat niciodată.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\.gitignore există, dar .git lipsește în Vatra, games, Apps, MyWork · încredere: ridicat
- **Implicație:** Tot designul (VATRA-design.md 12 KB, outputs/plan/ ~58 KB) și prototipul funcțional stau pe un singur disc, fără istoric și fără backup. Primul lucru de făcut, înainte de orice decizie de arhitectură: `git init` + commit. Costă un minut și e singura acțiune din acest audit care e pur câștig.

### În `outputs/` există două executabile dev nesemnate, dar build-ul Rust nu mai poate fi reprodus fără recompilare completă

- **Detaliu:** outputs/Vatra.exe (12.743.168 octeți, 8 sep) și outputs/Vatra-0.2.exe (12.744.704 octeți, 9 sep). tauri.conf.json are `bundle.active:false` și `icon:[]` — deci nu există installer, doar exe direct. `src-tauri/target` NU există (cache-ul de compilare a fost șters), `cargo` și `rustc` nu sunt pe PATH. `.toolchain-path` indică `C:\Users\besli\Documents\Codex\2026-09-06\files-pasted-by-the-user-you\work\toolchain` — directorul EXISTĂ, iar `scripts/tauri.mjs` hardcodează VS 2019 BuildTools 14.29.30133, care de asemenea există.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\outputs\ + src-tauri\tauri.conf.json + scripts\tauri.mjs:14 · încredere: ridicat
- **Implicație:** Executabilele sunt reale și rulabile, dar orice rebuild cere recompilarea întregului arbore Tauri și depinde de un folder dintr-o sesiune Codex veche. Riscul K06 din PROGRES.md este confirmat. NU am putut rula cele 5 teste Rust — le raportez ca NEVERIFICATE de mine.

### Stratul Rust de salvare este singura piesă de calitate de producție din tot proiectul

- **Detaliu:** `atomic_write()` folosește NamedTempFile + `sync_all()` + `persist()` (primitiva OS de înlocuire), deci fișierul vechi supraviețuiește oricărui eșec înainte de commit. `slot_path()` respinge traversarea de cale. `protected()` refuză suprascrierea salvărilor din build-uri mai noi. Un `Mutex` serializează comenzile. CSP-ul din tauri.conf.json este restrictiv corect (`object-src 'none'`, `frame-src 'none'`). Există 5 teste `#[test]`, inclusiv unul pentru traversare de cale și unul care verifică că un temp needit nu alterează salvarea.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src-tauri\src\main.rs:17-42, :85-93; src-tauri\tauri.conf.json · încredere: mediu
- **Implicație:** Portează acest fișier aproape verbatim în proiectul nou — este cea mai mare valoare per linie din tot repo-ul. 'Mediu' doar fiindcă nu am putut rula cele 5 teste (lipsește cargo și target/); codul l-am citit integral și e corect.

### Stilul de cod ultra-compact este o taxă reală, nu o chestiune de gust

- **Detaliu:** Linii maxime măsurate: src/vatra/main.ts 2817 caractere, src/sim/vatra.ts 1027, src/vatra/view.ts 719, src/vatra/style.css 8032 (CSS-ul de 8,5 KB are 3 linii în total). Funcția `assign()` (logica centrală de alocare a muncii) e ~25 de linii care fac muncă de ~200. În tot src/sim/vatra.ts există 2 comentarii.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\vatra\main.ts:7 (2817 car.), src\sim\vatra.ts:67,124; src\vatra\style.css · încredere: ridicat
- **Implicație:** Consecințe concrete: orice diff atinge o linie întreagă, deci `git diff` devine inutil; code review-ul e imposibil; iar o editare prin string-matching (cum lucrez eu) are risc mare de a lovi ținta greșită într-o linie de 2800 de caractere. Într-un proiect care va crește 20×, acesta este un cost recurent pe fiecare sesiune.

### UI-ul are zero teste și este construit dintr-un singur template innerHTML, re-randat integral la fiecare refresh

- **Detaliu:** `main.ts:7` construiește tot DOM-ul într-un singur `root.innerHTML=...`. `render()` la :39 reface panoul prin `panel.innerHTML=...`, iar singura protecție împotriva pierderii input-ului în timpul editării este garda `if(!panel.contains(document.activeElement)||...)`. Nu există niciun test care să pornească main.ts sau view.ts.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\vatra\main.ts:7,:39 · încredere: ridicat
- **Implicație:** Aceasta este exact capcana 'adminul e punct orb la randare' din experiența Presto: teste verzi și typecheck verde cu UI-ul căzut. Proiectul nou are nevoie fie de un framework cu stare, fie de cel puțin un smoke test headless care montează UI-ul.

### Totalurile din HUD exclud marfa aflată la jefuitori, deci resursele scad brusc fără explicație contabilă

- **Detaliu:** `totals()` însumează doar `s.buildings[].stock` și `s.people[].cargo`. Loot-ul din `s.raiders[].loot` nu apare nicăieri. Am observat direct: la tick 497 uneltele au trecut 53→41, la 499 de la 41→17 (−36 = 3 jefuitori × 12 per bun, conform vatra.ts:144). Bunurile nu se pierd — ajung în `stats.stolen` la evadare — dar între timp sunt invizibile.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra.ts:15 (totals) vs :144 (furt) · încredere: ridicat
- **Implicație:** Confirmă riscul K03 ('automatizarea produce sarcini greu de explicat'). În proiectul nou, orice bun trebuie să aibă exact un proprietar contabilizat, iar HUD-ul trebuie să arate 'în tranzit' și 'pierdut' ca linii separate, nu ca scădere tăcută.

### Logistica hranei consumă permanent 33-50% din forța de muncă

- **Detaliu:** Măsurat pe 2000 de tick-uri cu 12 oameni și o curte de hrană: între 4 și 6 oameni au job-ul 'eat' în orice moment. Sănătatea rămâne 100 și stocul de hrană e stabil la ~300, deci economia funcționează — dar jumătate din populație e permanent în drum spre mâncare, fiindcă `rations` maxim util e mic (se mănâncă 2 unități, se consumă 0.2 la 10 tick-uri).
- **Sursă:** măsurătoare proprie; mecanica la C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\src\sim\vatra.ts:89,:129,:155 · încredere: ridicat
- **Implicație:** Confirmă K01 din PROGRES.md. Modelul 'mergi fizic după mâncare' este corect conceptual (asta face un colony sim), dar constantele îl fac să domine. În proiectul nou, separă mâncatul de muncă printr-un ciclu zi/noapte, nu printr-un job care concurează cu producția.

### Documentele de planificare sunt cel mai valoros artefact din proiect și sunt onest scrise

- **Detaliu:** outputs/plan/ conține SCOP.md (13 KB), ROADMAP.md (18,5 KB, R00-R12 cu criterii de acceptare), PROGRES.md (11,5 KB, registrul F01-F14 + riscuri K01-K08 + FIX-01/FIX-02/OBS-01), DECIZII.md (D01-D09 cu 'stare/motiv/consecință/reevaluare'), SABLOANE.md. PROGRES.md scrie explicit 'Sesiunea de organizare a planului nu a relansat testele jocului; o actualizare de documentație nu este o nouă dovadă de testare'. AGENTS.md scrie 'Do not call a feature complete solely because code exists or compiles'.
- **Sursă:** C:\Users\besli\Desktop\MyWork\Apps\games\Vatra\outputs\plan\PROGRES.md și AGENTS.md · încredere: ridicat
- **Implicație:** Premisa sarcinii — că documentele revendică mai mult decât există — este greșită. Ele sunt mai conservatoare decât codul. Copiază AGENTS.md și structura outputs/plan/ în proiectul nou înainte de a scrie prima linie de cod; disciplina asta valorează mai mult decât cele 335 de linii de joc.

## Implicații de design

- Vatra dovedește o singură teză, dar o dovedește solid: bunurile fizice, cu sursă, transportator și destinație, produc gameplay lizibil și se pot păstra conservate exact. Aceasta e fundația conceptuală pe care construiești; codul care o implementează nu e.
- Cele patru limite structurale — hartă 44×32 constantă, o clădire = un tile, o activitate pe curte, fără z-levels — nu sunt parametri de tuning, ci decizii încastrate în tipuri, în schema zod de salvare și în pathfinding. Toate patru contrazic direct genul țintit, deci niciuna nu se ridică incremental.
- Pathfinding-ul trebuie proiectat înainte de economie, nu după. În Vatra `closest()` cheamă un Dijkstra complet per clădire candidată, iar asta impune tăcut plafonul de 60 de oameni. În proiectul nou, alegerea (regiuni + flow-field, sau A* cu cache pe perechi de regiuni) determină câți pioni poți avea, deci determină ce fel de joc faci.
- Stratul de comenzi lipsește în Vatra dar există corect implementat în jumătatea moartă a repo-ului (`Command` union + `refusal()` + `command()`). Preia ACEL tipar din prima zi: îți dă undo, replay din save-urile jucătorilor și o cale spre co-op, lucruri care nu se adaugă retroactiv.
- `reason(s, building)` — șirul care explică de ce o clădire nu lucrează — este cea mai bună idee de UX din tot codul și e ascunsă ca o funcție de o linie. Într-un colony sim, 'de ce nu se întâmplă nimic' este întrebarea principală a jucătorului; ridic-o la rang de sistem de prim ordin, cu cauze tipizate, nu șiruri de text.
- Modelul de pion din Vatra (hp + oboseală + rații) e prea sărac pentru a genera poveste. Sapiens și Going Medieval trăiesc din pioni care au nevoi în conflict; `Person` trebuie proiectat de la zero, iar el e tipul în jurul căruia se organizează restul simulării.
- Rețeta `tools` (2 lemn + 1 piatră) este singurul lanț de producție existent și nu e atinsă de niciun test. Nu extrapola din Vatra nimic despre cum se comportă un arbore de rețete pe 3-4 nivele — acel teren nu a fost călcat.
- Determinismul actual vine din absența RNG-ului în tick, nu din controlul lui. Prima mecanică stocastică (vreme, boală, animale, raid variabil) cere un stream RNG serializat în save — proiectează-l acum, altfel spargi reluarea determinismă exact când adaugi ce face jocul viu.
- Stilul ultra-compact (linii de 1000-2800 de caractere) nu e o preferință estetică, ci un cost recurent: face `git diff` inutil, code review-ul imposibil și editarea prin string-matching riscantă. Într-un proiect care va crește 20×, această taxă se plătește la fiecare sesiune.
- Disciplina de verificare din outputs/plan/ și AGENTS.md (registru F cu dovadă și limită, registru K de riscuri, FIX-uri cu lecția păstrată, separarea 'testat' de 'observat în preview') este mai valoroasă decât prototipul. Ea se portează integral și gratuit.

## Riscuri

- Cel mai mare risc imediat: nu există `.git` nicăieri în Vatra și nici în vreun director părinte până la MyWork. Tot designul (~70 KB de documente gândite) și prototipul funcțional stau fără istoric și fără backup. Semnal de alarmă: o ștergere accidentală, un subagent care poluează arborele (s-a mai întâmplat) sau un disc defect pierd totul, ireversibil.
- Riscul de a confunda 'trece suita' cu 'Vatra e testat'. 26 din 44 de teste țin în viață un joc care nu se mai construiește. Semnal de alarmă: dacă cineva citează '44 de teste' ca măsură de maturitate a base-builderului, sau dacă un refactor al jocului nou lasă suita verde fiindcă testele verzi sunt cele naval.
- Riscul de a construi PESTE Vatra fiindcă pare gata. Executabilul pornește, economia funcționează, testele trec — dar cele patru cerințe de bază ale genului (hartă mare, z-levels, clădiri multi-tile, pioni cu nevoi) sunt excluse de structura de date. Semnal de alarmă: prima sarcină care sună 'mărește harta' sau 'clădiri de 2×3' și se transformă în rescrierea `State` + schema de salvare + pathfinding.
- Peretele de performanță se atinge tăcut, prin plafoane care par decizii de design. `s.people.length<60` (vatra.ts:161) nu e o alegere narativă, e ce suportă un Dijkstra fără cache. Semnal de alarmă: tick-ul depășește ~5 ms la viteza 6× și jucătorul vede sacadare fără niciun mesaj de eroare — nu există telemetrie de performanță în joc.
- Riscul de reproductibilitate a build-ului: `src-tauri/target` a dispărut, `cargo` nu e pe PATH, iar `.toolchain-path` indică `Documents\Codex\2026-09-06\files-pasted-by-the-user-you\work\toolchain` — un folder dintr-o sesiune veche care astăzi există, dar care nu are niciun motiv structural să existe mâine. Semnal de alarmă: `npm run tauri build` eșuează cu 'linker not found' sau 'cargo not found' și nimeni nu mai știe ce versiuni erau.
- Cele 5 teste Rust NU au fost rulate de mine și nu pot fi rulate fără o recompilare completă a arborelui Tauri. Sunt raportate ca 'cod citit, corect, neverificat prin execuție'. Semnal de alarmă: orice document care le numără alături de cele 44 TS ca 'verificate în această sesiune'.
- UI-ul este un punct orb complet: zero teste, un singur innerHTML de 2817 caractere, re-randare totală la fiecare refresh. Exact tiparul din Presto unde typecheck + teste + build erau verzi cu interfața căzută. Semnal de alarmă: o schimbare de simulare care trece toate testele și sparge panoul, fără ca nimic automat să o prindă.
- Riscul de a pierde partea bună odată cu codul: dacă arunci arborele Vatra fără să portezi întâi `src-tauri/src/main.rs`, tiparul de envelope+validare din `save.ts`, scenariile de test (drumuri A/B, două organizări economice, reluare deterministă din mijlocul transportului) și întregul `outputs/plan/`, arunci exact singurele lucruri care au valoare durabilă.

## Întrebări deschise

- Rămâi pe TypeScript + three.js + Tauri, sau reevaluezi stack-ul acum că știi că peretele e la ~60 de pioni și ~120 de clădiri? Un colony sim cu 150+ pioni, z-levels și hărți mari este un profil pentru care un limbaj cu control asupra memoriei (Rust + wgpu, sau C# + un engine) merită cântărit explicit, o singură dată, la început.
- Care dintre cele două referințe conduce? Going Medieval înseamnă z-levels, săpat și camere — adică o structură de date verticală din prima zi. Sapiens înseamnă hartă imensă, generații și transmiterea cunoașterii — adică chunking, streaming și timp lung. Cele două cer arhitecturi diferite; alegerea nu poate fi amânată până după prototip.
- Câți pioni trebuie să suporte jocul la nivelul cel mai mare de așezare? Cifra asta determină direct alegerea de pathfinding și modelul de stocare a entităților, iar Vatra nu oferă niciun indiciu util fiindcă plafonul ei de 60 a fost dictat de implementare.
- Vrei să păstrezi pilonii conceptuali din VATRA-design.md (memoria instituțională, identitatea scrisă și dovedită, conținutul autorului fără putere numerică), sau au fost o punte de la Warlord pe care o lași în urmă odată cu prototipul naval? Niciunul dintre ei nu e implementat în codul viu.
- Cele 5 teste Rust trec și astăzi? Nu am putut rula `cargo test` (target/ șters, cargo nu e pe PATH, ar fi însemnat recompilarea întregului arbore Tauri și scrierea în arbore, ceea ce mi-ai interzis). Codul l-am citit integral și e corect, dar execuția rămâne neconfirmată.
- Executabilele Vatra.exe și Vatra-0.2.exe se păstrează ca referință jucabilă, sau directorul outputs/ se curăță? Ocupă ~25 MB și sunt build-uri dev nesemnate, fără installer — dar sunt singura dovadă rulabilă a ce s-a construit.
- `.toolchain-path` indică un folder dintr-o sesiune Codex din 6 septembrie. Vrei ca toolchain-ul Rust să fie mutat într-o locație stabilă și documentată înainte de proiectul nou, sau desktop-ul Tauri devine oricum o decizie deschisă în noul stack?

## Recomandări

- VERDICT: PROIECT NOU, cu port selectiv — nu construi PESTE Vatra, dar nici nu porni de la zero ignorând-o. Argumentul în trei cifre: jocul viu are 335 de linii (nu există cost de rescriere care să depășească costul dezlipirii lui din cele 772 de linii moarte); cele patru cerințe de bază ale genului sunt excluse de structura de date, nu doar neimplementate; iar valoarea reală a repo-ului stă în documente și în stratul Rust, care se portează fără să aduci nicio linie de TypeScript de joc.
- ÎNAINTE de orice altceva, azi, în 60 de secunde: `git init` în Vatra și un commit inițial. Nu ca să continui acolo, ci fiindcă ~70 KB de design gândit stau fără backup. Toate celelalte recomandări presupun că această a fost făcută.
- PORTEAZĂ VERBATIM (valoare mare, cost zero): `src-tauri/src/main.rs` — scriere atomică prin NamedTempFile+sync_all+persist, gardă de traversare de cale, protecția salvărilor din build-uri mai noi, Mutex pe comenzi, plus cele 5 teste `#[test]`; `src-tauri/tauri.conf.json` pentru CSP-ul restrictiv; `tsconfig.json` integral (strict + noUnusedLocals + noUnusedParameters); `AGENTS.md` și structura `outputs/plan/` (SCOP / ROADMAP cu criterii de acceptare / PROGRES cu registru F + registru K de riscuri / DECIZII cu 'stare-motiv-consecință-reevaluare').
- PORTEAZĂ CA IDEE, NU CA LINII DE COD: tiparul de envelope din `src/vatra/save.ts:19` (game+schema+build, refuz explicit al versiunilor mai noi) plus validarea structurală post-parse de la :22-26 (id-uri unice, clădiri nesuprapuse, traseu contiguu și pe uscat) — dar NU schema zod în sine, care e legată de `W*H` prin `.length()` și `.max()`. Și `reason(s, building)` de la vatra.ts:165, promovat din șir de text în sistem tipizat de cauze.
- REFOLOSEȘTE SCENARIILE DE TEST, REscrie implementarea: cele 6 scenarii care contează sunt măsurarea A/B a drumurilor (30 vs 48 tick-uri pentru aceeași livrare), două organizări economice viabile pe aceeași hartă, reluarea deterministă dintr-un save luat în mijlocul unui transport, mobilizarea care scade măsurabil producția, filtrul schimbat care rerutează marfa fără s-o șteargă, și destinația plină care nu poate depăși capacitatea. Adaugă invariantul pe care l-am verificat eu manual și care nu are test: conservarea totală a bunurilor ca test de proprietate.
- ARUNCĂ FĂRĂ REGRET, integral: `src/sim/engine.ts`, `types.ts`, `world.ts`, `covenant.ts`, `rng.ts`, `src/content/rules.ts`, `src/render/scene.ts`, `src/gen/procedural.ts`, `src/ui/app.ts`, `src/ui/icons.ts`, `src/platform/*`, `src/vatra/sim.ts` (shim de 2 linii), plus `tests/sim.test.ts`, `tests/generation.test.ts`, `tests/platform.test.ts`. 772 de linii și 26 de teste. Singura piesă pe care aș extrage-o înainte: tiparul `Command` union + `refusal()` + `command()` din engine.ts:24-30,35,83 — conceptul, nu conținutul naval.
- RESCRIE COMPLET, în această ordine: (1) pathfinding pe regiuni cu flow-field sau A* cu cache, ales și măsurat ÎNAINTE de economie, fiindcă el fixează plafonul de pioni; (2) `State` cu hartă pe chunks și `Tile` cu înălțime/strat din prima versiune a tipului — z-levels nu se adaugă retroactiv; (3) `Building` cu footprint multi-tile, rotație și sloturi de module; (4) `Person` cu nevoi în conflict (somn, hrană, temperatură, dispoziție, skill-uri) — el e tipul în jurul căruia se organizează restul; (5) stratul de comenzi peste toate, de la prima linie.
- Nu porni cu three.js prin reflex doar fiindcă Vatra o folosea. Ideea bună din `view.ts` (InstancedMesh pentru teren, oameni, copaci, cu un singur material) se păstrează, dar indexarea liniară `at(s,i)` de 2816 ori per redesenare și invalidarea totală prin semnătură-string trebuie înlocuite cu hartă tile→building și invalidare pe chunk. Cu z-levels și hărți mari, alegerea de rendering merită reevaluată explicit, nu moștenită.
- Instrumentează performanța din prima zi: un contor de ms/tick vizibil în joc și un benchmark reproductibil cu hardware declarat. În Vatra plafoanele (60 de oameni, hartă mică) au ascuns costul real până când l-am măsurat eu — 0.13 ms/tick la 16 oameni versus 1.86 ms/tick la 60, superliniar pe două axe. Riscul K04 din PROGRES.md este marcat 'NEMĂSURAT' de acum patru zile; nu repeta asta.
- Dacă vrei totuși o punte scurtă înainte de proiectul nou: rulează NEXT-01 din PROGRES.md — deschide `outputs/Vatra-0.2.exe`, încarcă o salvare 0.1, schimbă o rezervă, salvează și reîncarcă. Este singura verificare care îți spune dacă lecțiile de design ale prototipului sunt validate de mână, nu doar de teste, și costă zece minute. Este și singura verificare pe care nu o pot face eu.

