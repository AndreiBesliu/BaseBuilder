# Protocolul gate-ului de motor (D1)

**Stare: PRE-ÎNREGISTRAT. Scris și comis înainte de prima cifră de gate.**

Orice modificare a unui prag, a unei condiții de invalidare sau a regulii de decizie de mai jos se
face într-un **commit separat**, cu motivul scris în mesajul de commit. Dacă modificarea vine *după*
ce am văzut date, commit-ul trebuie să spună literal „am schimbat pragul după ce am văzut datele",
iar rezultatul devine **EXPLORATOR** — nu poate semna nicio decizie.

Documentul ăsta e răspunsul la o singură întrebare: *rămân pe TypeScript/three.js/Electron sau
port pe Unity 6.3 + C#?* — și e scris ca să nu pot răspunde cu ce-mi convine.

---

## 0. De ce regula e asimetrică

| | Cost dacă greșesc |
|---|---|
| **Fals PASS** — rămân pe TS, iar stiva chiar nu ține | ~10 luni: descoperi la luna 12, portezi cu tot jocul deasupra |
| **Fals FAIL** — port degeaba | ~2–4 luni: portare + rampă de limbaj |

Raportul e undeva între **2,5 și 5**. Nu e măsurat, și **asta e o gaură reală** — parametrul care
decide cât de conservatoare e regula nu are voie să rămână o estimare făcută de partea care are o
preferință (eu prefer TypeScript). Până la un spike cronometrat de portare, regula folosește marja
**1,5×** pe pragul de STAY și **zero marjă** pe pragul de FAIL. Asimetria e exprimată în marjă, nu
în intenție.

### Mașina pe care se măsoară, exact

Verificată în Task Manager, 13.09.2026 — nu dedusă. Intră în metadatele fiecărei rulări.

| | |
|---|---|
| CPU | AMD Ryzen 9 7950X · 16 nuclee / 32 de thread-uri · bază 4,50 GHz, observat 5,20 GHz |
| Cache | L1 1 MB · L2 16 MB · **L3 64 MB** |
| RAM | 31,1 GB |
| **GPU 0** | **AMD Radeon(TM) Graphics (iGPU)** — enumerat PRIMUL |
| GPU 1 | NVIDIA GeForce RTX 3060 · **12 GB dedicat** · driver 32.0.16.1656 · DirectX 12 (FL 12.2) |
| Alimentare | desktop, fără baterie — deci gărzile de Energy Saver nu se aplică aici |

Două lucruri care schimbă protocolul:

1. **iGPU-ul AMD e GPU 0.** Un fallback tăcut pe el explică singur diferențe de 3× și n-ar produce
   niciun mesaj de eroare. De asta condiția de invalidare nr. 2 (§7) cere `UNMASKED_RENDERER` să
   conțină „RTX 3060", iar viewerul îl afișează acum în HUD, ca să se vadă înainte de rulare.
2. **VRAM: 12 GB, nu 4.** `Win32_VideoController.AdapterRAM` raportează 4 GB — e un câmp pe 32 de
   biți care se învârte, nu o măsurătoare. Dacă pragul de VRAM din §8 s-ar fi calibrat pe cifra aia,
   ar fi fost de trei ori prea strict. **Al doilea instrument care minte în sesiunea asta.**

**Consecința care contează cel mai mult, și e neplăcută:** măsurătorile făcute pe mașina asta pot
produce **MOVE, GREY, SCOPE, FAIL-CANDIDAT sau NECONCLUDENT — niciodată STAY**. Greșește sistematic
în direcția care îmi convine, pe toate axele deodată: GPU de ~5,5× peste clasa țintă, CPU de ~2×,
și 64 MB de L3 plus 32 de thread-uri, adică o topologie în care meshingul mutat într-un worker **nu
atinge deloc** main thread-ul — pe 6 nuclee, atinge. Topologia nu e un factor de scalat; niciun R
n-o repară. Vezi §2 pentru aritmetică și §12 pentru ce costă să repar asta.

---

## 1. Ce se măsoară — și, mai important, ce NU

### Nu FPS

Gate-ul din PLAN §D1 e scris azi ca „traversezi 16 km la **60 FPS**". Ăsta nu e un criteriu de
măsurătoare, e un criteriu de **saturație**: `requestAnimationFrame` e aliniat la vsync, deci pe un
monitor de 60 Hz cel mai bun rezultat observabil e 16,67 ms, indiferent dacă am consumat 2 ms sau
16 din ele. Un „60 FPS" verde nu spune nimic despre cât buget mai am pentru tick, agenți și UI —
adică exact despre ce decide D1.

În plus, media FPS minte structural, fiindcă e o medie aritmetică peste o mărime inversă: nouă cadre
de 10 ms plus unul de 100 ms înseamnă **52,6 FPS reali**, dar **91 FPS** ca medie de FPS instantaneu.
Experiența e un stutter vizibil de 100 ms.

FPS apare în raport **o singură dată**, calculat ca `cadre / timp_total`, etichetat „orientativ".

### Nici `CPU_busy` măsurat în rAF

Tentația evidentă e să pun pragul pe „cât durează munca mea", măsurată cu `performance.now()` în
jurul lui `renderer.render()`. **E un prag care nu poate să pice.** În Chromium, submisia GL,
rasterul și compunerea rulează pe alt thread și în **procesul GPU**; callback-ul rAF vede doar
JavaScript-ul plus clientul de command buffer. Un cadru care costă 14 ms de CPU real poate raporta
4 ms de aici.

`CPU_busy` rămâne în raport, dar **exclusiv ca diagnostic**. Nu are prag.

### Metrica de gate: X_max — bugetul liber, măsurat prin bisecție

Adaug pe fiecare cadru o sarcină artificială calibrată de **X ms** de CPU (busy-loop care acumulează
într-o variabilă globală, altfel JIT-ul îl elimină) și caut binar cel mai mare X pentru care

> p99 al **intervalului de prezentare** (delta dintre argumentele `timestamp` ale rAF) ≤ 17,5 ms

**X_max e bugetul liber, în milisecunde.** De ce funcționează acolo unde `CPU_busy` eșuează: criteriul
e măsurat pe **prezentare**, nu pe munca mea, deci include tot ce se întâmplă în procesul GPU. Dacă
pun 5 ms în plus și cadrele încep să rateze vsync-ul, alea sunt 5 ms pe care nu-i aveam — indiferent
unde se consumau.

Merge cu vsync **pornit**, fără extensii, fără flaguri de deplafonare. `--disable-gpu-vsync` și
`--disable-frame-rate-limit` rămân doar verificare încrucișată: sunt raportate instabile, cu un cap
rezidual la 120 Hz, iar dacă pe scena nulă nu depășesc empiric rata monitorului, rezultatul lor se
ignoră.

**Parametri:** 6 iterații pe intervalul [0, 16] ms ⇒ rezoluție **0,25 ms**; 600 de cadre per
încercare; balastul **oprit** (balastul și bisecția măsoară același lucru de două ori).

### Costul cadrului, derivat

> **W_aici = 16,67 − X_max**

Ăsta e costul real al cadrului pe mașina asta, incluzând tot ce nu văd din rAF.

---

## 2. Aritmetica pragurilor

Bugetul nu e inventat azi. Vine din PLAN §2, unde e deja promis:

| | ms | sursă |
|---|---|---|
| Cadru la 60 Hz | 16,67 | — |
| Tick de simulare | 8,00 | PLAN, criteriu de acceptare P1+P2 |
| UI dens | 1,50 | D1b — **nemăsurat în orice motor** |
| **Rămâne pentru randare + teren** | **7,17** | scădere |

Tickul e la 20 Hz peste 60 Hz, deci costul lui cade pe **un cadru din trei** — iar p99-ul e dominat
de cadrele de tick. De asta pragul se aplică la p99, nu la mediană.

Cu marja de 1,5× pentru STAY: **randarea trebuie să încapă în 4,78 ms pe mașina ȚINTĂ.**

### Transferul pe mașina țintă

> **W_țintă = W_aici × R**, unde R depinde de axa care leagă

| | estimat | stare |
|---|---|---|
| R_cpu (single-thread, 7950X → clasă țintă) | ~2,0 | **NEMĂSURAT** |
| R_gpu (RTX 3060 → clasă țintă) | ~5,5 | **NEMĂSURAT** |

Ce cere STAY, tradus pe mașina asta:

| axa care leagă | W_aici admis | ⇒ X_max cerut |
|---|---|---|
| CPU-bound (R=2,0) | ≤ 2,39 ms | **≥ 14,28 ms** |
| GPU-bound (R=5,5) | ≤ 0,87 ms | **≥ 15,80 ms** |

**Și aici se vede de ce mașina asta nu poate semna STAY.** În cazul GPU-bound, bugetul admis
(0,87 ms) e de doar 3,5× rezoluția bisecției (0,25 ms) — adică sub pragul la care măsurătoarea mai
înseamnă ceva. Nu e o limitare a protocolului, e aritmetică: nu poți demonstra de pe o mașină de
5 ori mai rapidă că una de 5 ori mai lentă are loc.

### Întrebare deschisă, către owner: CARE e mașina țintă?

PLAN spune în două locuri lucruri diferite: criteriul de acceptare P1+P2 zice „≥60 FPS pe **laptopul
meu**", iar panoul de motor discută clase de hardware.

**Întrebat, 13.09.2026. Răspunsul owner-ului: amânat deliberat.** Deci protocolul rulează cu
presupunerea **clasa GTX 1050 Ti / Ryzen 5 3600** (mediana sondajului Steam), iar fiecare verdict
poartă, scris cu litere, *„prag bazat pe presupunere de hardware nevalidată"*.

Ce înseamnă asta operațional, ca să nu fie o surpriză la luna 3: **D1 nu se poate închide** până la
un răspuns. Verdictul maxim disponibil rămâne STAY-PROVIZORIU, iar decizia se poate lua oricând —
inclusiv după ce gate-ul a rulat, fiindcă datele brute se arhivează (§8) și pragul se recalculează
din ele fără re-rulare.

---

## 3. Fixtura — `src/harness/fixture-m10.ts`

Gate-ul se rulează pe ce va fi jocul la luna 10, nu pe ce e azi. Fortăreața din viewer promovează
**12 chunk-uri**; un gate rulat pe ea trece cu orice stivă și nu spune nimic.

Fixtura M10 e **structurală** (camere dreptunghiulare, coridoare drepte, ziduri pe grilă), nu
aleatoare. Săpătura aleatoare a mințit deja o dată în proiectul ăsta: arăta mesher-ul de 3× mai lent
decât e, fiindcă zgomotul e cel mai prost caz posibil pentru unirea lacomă și nu seamănă cu nimic din
ce construiește un jucător.

**Măsurat azi** (`node src/harness/bench-fixture.ts`, seed 20260913, colț la chunk 300/300):

| | |
|---|---|
| Camere | 676 |
| Săpături acceptate | 214.350 |
| Zidiri acceptate | 3.880 |
| **Chunk-uri promovate** | **225** (PLAN bugeta ~200) |
| Chunk-uri rezidente | 473 |
| Construcție | ~700 ms |
| Quaduri / triunghiuri | 86.071 / **172.142** |
| Meshing complet | **88 ms** · mediana din 10 · verificat mecanic de `tools/check-gate-numbers.mjs` |
| &nbsp;&nbsp;per chunk | **490 µs** · mediana din 10 · CV 16,4% ⚠ |
| Memorie voxeli (RLE) | 2,34 MB (față de 14,1 MB necomprimat) |

> **Re-etalonare, 14.09.2026, ÎNAINTE de orice rulare de gate.** Două lucruri s-au schimbat, niciunul
> în mesher, și amândouă se consemnează ca să nu poată trece drept optimizare:
>
> 1. **Lumea.** Precizia zgomotului a trecut de la Q10 la Q14, fiindcă rezoluția verticală era
>    plafonată la 17,6 cm și producea terase plate de 16 m. Cifrele erau 114.586 / 229.172 / 89,6 ms.
>    Cele două seturi descriu **două lumi diferite** și nu sunt comparabile între ele.
> 2. **Instrumentul.** Se raportează mediana a 10 rulări, cu CV și cu diferența minimă detectabilă,
>    nu o singură rulare. Măsurătoarea unică dădea 375 µs/chunk; mediana dă 409. **Rularea unică
>    raporta cazul cel mai bun** — vezi `src/harness/measure.ts` pentru cifrele de împrăștiere.
>
> Nu e o mutare de prag: niciun prag din §8 nu depinde de cifrele astea și niciun gate n-a rulat.
> Seria de măsurători începe de aici.
>
> **Consecință imediată, care a decis deja ceva:** benchmark-ul nu poate detecta o diferență sub
> ~80 µs/chunk. Cele patru propuneri de netezire a suprafeței pretindeau toate ~50 µs/chunk —
> adică **sub pragul propriului instrument**. Nu se poate alege între ele pe cost până când
> instrumentul nu devine mai fin sau efectul mai mare.
>
> **A treia schimbare, 14.09.2026 seara: fețele de la granița de chunk se taie acum.** Era limita
> cunoscută a mesher-ului, declarată în cod de la S6-8. Măsurat: **779.888** de fețe de graniță, din
> care **674.582 (86,5%)** ascunse de un vecin promovat. După unirea lacomă rămâne un câștig de
> **−5,3% quaduri** (90.932 → 86.071), exact și determinist. Costul, măsurat corect prin mediane în
> **procese separate** (398 → 409 µs/chunk, DMD 42 µs): **nedecis** — sub pragul de detecție.
> Rulările de gate se fac pe geometria cu tăiere, adică pe cea care chiar se randează.

**Validarea fixturii NU se face prin raportul de reducere al mesher-ului.** Criteriul ăla e
auto-referențial: selectează fixturi *ieftine de meshuit*, adică exact fixturile pe care un motor slab
le trece. Validarea e structurală și e în `tests/fixture.test.ts`: număr de camere, chunk-uri
promovate în banda 180–400, camerele chiar goale pe dinăuntru, reproductibilitate bit-cu-bit.

---

## 4. Balastul — obligatoriu, nu opțional

`tick()` din viewer conține azi **doar** `controls.update()` + `renderer.render()`. Zero simulare,
zero agenți, zero UI, zero umbre. Peste jumătate din cadrul final lipsește. Un verde obținut fără
balast măsoară jumătate din sistem și declară că restul încape.

| componentă | valoare | formă temporală |
|---|---|---|
| Proxy de tick | +8,0 ms CPU | **1 cadru din 3** (tickul e 20 Hz peste 60 Hz) |
| Proxy de UI | +1,5 ms CPU | fiecare cadru |
| Proxy de agenți și props | +800 draw calls | fiecare cadru |
| Presiune de heap | 300 MB ținuți | permanent |

Forma temporală contează: +8 ms întinse uniform au media corectă și **coada greșită**, adică
sub-reprezintă exact percentila pe care se dă verdictul.

Constantele astea și un hash al lor se tipăresc în fiecare raport. E singurul parametru al gate-ului
fără referent fizic, deci e cel mai ușor de micșorat tăcut după un eșec.

---

## 5. Scenariile

Camera merge pe **șine**, pe timp simulat cu pas fix de 1/60 s, cu oprire la **număr fix de cadre**:
300 de warmup aruncate + 3.600 utile. La durată fixă, o configurație lentă parcurge alt traseu și
compari două scene diferite. `renderer.compile(scene, camera)` în warmup, ca să nu prind un stall de
compilare la cadrul 900.

| | ce face | de ce |
|---|---|---|
| **S-FORTRESS** | orbită peste cele 225 de chunk-uri, slice comutat la cadrele 900/1800/2700 | 95% din timpul de joc |
| **S-DIG** | 20 de săpături/s timp de 60 s peste fixtura M10 | bucla de construcție |
| **S-TRAVERSE** | 40 m/s, `setFocus` la fiecare graniță de chunk, build/dispose cu buget de 2 chunk-uri/cadru | **criteriul scris în PLAN** |

**Toate trei sunt implementate** (`?scenario=fortress|dig|traverse`) și încarcă **fixtura M10**, nu
fortăreața de 12 chunk-uri a viewerului — verificat: 225 de chunk-uri promovate la pornire. Fără asta
gate-ul ar fi fost fals pozitiv prin construcție, indiferent ce stivă.

**S-TRAVERSE cerea cod care nu exista. Acum există** (commit `streaming`): coadă de build cu buget de
2 chunk-uri/cadru, evacuare de mesh pe rază de desen, traversare pe șine la 40 m/s cu ambele ceasuri
(`T`, `F`) și sens reversibil (`Shift+T`, adică S4b — întoarcerea). Măsurat la implementare:
`setFocus` costă **0,5–0,6 ms** per graniță de chunk, iar coada se golește în regim staționar.
Cifrele de gate se iau tot din protocolul de mai jos, nu din citirile astea de la tastatură.

S-TRAVERSE se rulează **de două ori, cu două ceasuri**: (a) pas fix pe timp simulat — pentru
comparații între rulări; (b) **timp real** la 40 m/s — ăsta e cel pe care se dă verdictul. Cu pas fix,
o configurație lentă primește mai mult timp de perete pe metru, deci un streamer asincron arată mai
bine decât va fi în joc.

**Slice-ul, declarat în scris înainte de rulare:** azi e implementat prin `renderer.clippingPlanes`,
adică discard în shader — **NU** re-mesh. PLAN prognozează ~87 ms pentru re-mesh pe 200 de chunk-uri;
măsurat azi, remesh-ul complet al fixturii e **88 ms**, adică 5 cadre pierdute la fiecare schimbare
de nivel. Sunt două jocuri diferite, cu 20× între ele. Dacă implementarea livrată se schimbă vreodată
în re-mesh, toate cifrele de gate se re-rulează.

Planul de clipping e **mereu activ**, și când slice-ul e oprit (împins la 1e6). Numărul de clipping
planes intră în cheia de program a shaderului, deci comutarea 0↔1 forțează o recompilare — un cadru
lung care arată exact ca un hiccup de streaming.

---

## 5b. Cine apasă pe buton — și de ce nu poate fi Claude

**Într-o fereastră ascunsă sau nefocalizată, `requestAnimationFrame` nu e apelat deloc.** Bucla nu
încetinește: se **oprește**. Verificat de trei ori în proiectul ăsta, ultima dată chiar în harness-ul
de măsurare: `document.hidden === true`, contor de cadre 0, iar HUD-ul arăta „p99 = 9.815 ms".

Deci rularea de gate e o acțiune de OM, într-o fereastră reală:

```
bench
uleaza-gate.cmd            # bisecția pentru X_max
bench
uleaza-gate.cmd fortress   # un scenariu anume
```

Scriptul construiește build-ul de producție, pornește serverul de preview, deschide Chrome pe un
profil curat cu flagurile din protocol, și la final pagina **descarcă singură** un `.json` cu
rezultatul și metadatele. Fișierul e singurul lucru care supraviețuiește momentului.

Sonda se **autodeclară invalidă** dacă ceva din §7 nu e în regulă — inclusiv „fereastra era ascunsă
la pornire", cazul pe care prima versiune a gărzii l-a ratat, fiindcă asculta doar `visibilitychange`
și nu verifica starea inițială. O gardă scrisă pe jumătate e mai rea decât niciuna: arată ca o gardă.

**Notă de implementare:** sonda stă în `viewer/probe.ts`, nu în `src/harness/frame-probe.ts` cum
spunea prima versiune a protocolului. Motivul e mecanic: are nevoie de DOM și de WebGL, iar
`tsconfig.json` (nucleul) nu are `lib: DOM` — exact regula care ține `src/` portabil. Statistica și
verdictul rămân în afara browserului (`src/harness/measure.ts`, `tools/gate-verdict.mjs`).

---

## 6. Dovada că instrumentul nu minte

**Se rulează ÎNAINTE de orice rulare de gate. Un harness care nu poate produce roșu n-are dreptul să
producă verde.**

| # | probă | criteriu |
|---|---|---|
| 1 | **Scena nulă** — rAF gol, fără randare, 1.800 de cadre | mediana delta rAF = **16,67 ± 0,3 ms**. Dacă iese 33,3, sunt deja throttled și nimic de după nu contează |
| 2 | **Cost cunoscut** — busy-loop calibrat la 8,0 ms, 600 de cadre | sonda raportează **8,0 ± 0,5 ms** |
| 3 | **Granularitatea ceasului** — 1.000 de `performance.now()` consecutive | cel mai mic delta nenul < 0,1 ms, altfel nu raportez nicio cifră sub 1 ms |

> **MĂSURAT, 14.09.2026: exact 0,100 ms.** Fără izolare cross-origin, ceasul e tocit ca apărare
> împotriva Spectre. Consecințe, scrise acum ca să nu fie descoperite în raport:
> - nicio cifră sub **1 ms** din raport nu e credibilă — inclusiv orice descompunere fină a cadrului;
> - balastul arde cu o eroare de ~7% la 1,5 ms și ~1% la 8 ms, deci forma temporală ține, dar
>   constanta de UI e la limită;
> - rezoluția bisecției (0,25 ms) e de doar 2,5× granularitatea — se compensează prin p99 peste
>   540 de eșantioane, dar **nu se raportează X_max cu două zecimale**.
| 4 | **Probă negativă A** — 5.000 de mesh-uri goale | TREBUIE să iasă roșu pe draw calls |
| 5 | **Probă negativă B** — `geometry.dispose()` dezactivat | contorul de geometrii TREBUIE să crească monoton |
| 6 | **Probă negativă C** — busy-loop de 120 ms la fiecare 5 s | TREBUIE raportat ca stall **și atribuit** prin `PerformanceObserver('long-animation-frame')` |

> **Stadiul probelor, 14.09.2026** — armate prin `?probe=drawcalls|leak|stall`, verificate pășind
> cadre din afara lui rAF (`__kinstead.stepFrame`):
>
> | probă | rezultat |
> |---|---|
> | A · draw calls | **CONFIRMATĂ** — 236 → **5.236** apeluri, geometrii +1 (partajată). Roșu pe axa corectă și numai pe ea. |
> | B · leak de geometrii | **CONFIRMATĂ** — după 400 de cadre de traversare: 227 → **337** geometrii, la **același** număr de mesh-uri (377). 110 orfane. |
> | C · stall de 120 ms | **NEVERIFICATĂ ÎNCĂ, și de ce contează** |
>
> Proba C nu se poate verifica prin pășire sincronă: mediul însuși produce cadre lungi. Măsurat, 30
> din 700 de cadre peste 100 ms, împrăștiate, **toate multipli exacți de 16,67 ms** (100 · 116,7 ·
> 133,3 · 150 · 167 · 183,5) — adică așteptări de vsync, fiindcă `render()` într-o buclă strânsă
> umple lanțul de buffere. Pășirea sincronă verifică **logica**, niciodată timpul. Proba C se
> confirmă la prima rulare reală, și până atunci §8 tratează instrumentul ca **incomplet**: un
> instrument ABSENT blochează STAY, fără să producă singur FAIL.
| 7 | **Calibrarea benzilor CPU/GPU** — quad fullscreen cu shader scump (fill pur) și 2.000 de mesh-uri goale (draw-call pur) | benzile din §7 se **citesc** de aici, nu se inventează |
| 8 | **Test A/A** — 5 rulări „A" și 5 „B", aceeași configurație, proces nou, ordine intercalată | verdictul programului TREBUIE să fie **„nedecis"**. Dacă declară o diferență, programul e rupt și se repară întâi |

Punctul 7 nu e cosmetic: benzile „sub 10% ⇒ CPU-bound, peste 40% ⇒ GPU-bound" pe care stă
diagnosticul sunt **inventate** până le calibrez pe scene de caracter cunoscut, iar pe ele stă
afirmația care legitimează sau respinge portarea.

---

## 7. Condiții de invalidare — automate, marchează FIȘIERUL, nu cadrul

1. Orice `visibilitychange`, sau `document.visibilityState !== 'visible'` la orice cadru.
   *(`requestAnimationFrame` pur și simplu nu mai e apelat când panoul e ascuns — deja plătit o dată
   în sesiunea asta: HUD-ul arăta „fps 0, p99 9008 ms".)*
2. `UNMASKED_RENDERER` nu conține **RTX 3060** — mașina are și un iGPU AMD, iar un fallback tăcut pe
   el sau pe SwiftShader explică singur diferențe de 3×.
3. `renderer.info.render.calls` diferit față de rularea de referință.
4. `GPU_DISJOINT` setat pe peste 1% din eșantioane.
5. `import.meta.hot` prezent — adică rulez pe dev server, nu pe build de producție.
6. DevTools deschis.
7. Panta heap-ului peste 1 MB/s după warmup — atunci p99-ul meu e p99 de GC, nu de randare.
8. Un flag din linia de comandă lipsă față de lista înghețată.
9. `git status --short` nu e gol la pornirea seriei.
10. Tag-ul de gate nu e pe HEAD.

**Rulările invalidate se LOGHEAZĂ, cu motivul.** Peste 20% invalidate într-o serie ⇒ mediul e
constatarea, seria se aruncă. Altfel, fiecare rulare aruncată devine o alegere.

### Reproductibilitate înainte de comparație

CV = stdev/mean pe p99, 5 rulări cu **proces nou** (nu reload — reload-ul păstrează JIT-ul și cache-ul
de shadere calde), **ordine intercalată** (niciodată AAAAA BBBBB, altfel deriva termică se aliniază cu
scenariul).

| CV(p99) | ce am voie |
|---|---|
| ≤ 5% | compar liber |
| 5–10% | compar doar diferențe peste **DMD = 2,8 × stdev**, scrisă explicit în raport |
| > 10% | **REFUZ DE MĂSURĂTOARE** — nu compar, nu pronunț verdict, repar mediul |

---

## 8. Regula de decizie

Se **execută** (`node tools/gate-verdict.mjs <fișiere>`), nu se citește de pe un grafic. Programul e
comis înainte de rulări și are fixturi negative pentru fiecare ieșire.

Ordinea de evaluare e obligatorie — prima care se aplică, câștigă.

### 1 · REFUZ DE MĂSURĂTOARE
Oricare din: o probă negativă din §6 nu iese roșie · scena nulă în afara 16,67 ± 0,3 · CV(p99) > 10% ·
peste 20% rulări invalidate · benzile CPU/GPU necalibrate · A/A declară o diferență.
**Nu se pronunță niciun verdict.** Nu e „aproape STAY", e „instrumentul e stricat", și aia devine
sarcina următoare.

### 2 · SCOPE — ambiția de geometrie, nu motorul
Sweep-ul de rezoluție arată **GPU-bound** după benzile calibrate (frametime scade proporțional cu
pixelii).
Același GPU, aceleași 172.142 de triunghiuri, aceleași shadere: **Unity nu-mi dă hardware nou.**
Remediile sunt LOD, instancing, reducere de fill, buget de draw calls — adică **PUNCT DE DECIZIE #1**
din plan, nu portarea. Portarea aici pierde 2–4 luni și păstrează problema.

### 3 · FAIL-CANDIDAT — nu MOVE
X_max < 9,5 ms pe orice scenariu, **sau** ≥3 cadre peste 100 ms, **și** sweep-ul arată CPU-bound.

Pragul 9,5 = 8,0 (tick) + 1,5 (UI). Dacă pe o mașină de 2–5× mai rapidă decât ținta nu încape nici
măcar bugetul deja promis, stiva e suspectă.

**FAIL-CANDIDAT nu e MOVE.** Deblochează exact trei probe, fiecare cu timebox și ore cronometrate:

| probă | ce | timebox |
|---|---|---|
| **Probe A** — podeaua stivei | geometria fixturii exportată ca blob binar, randată de ~200 de linii de three.js: zero cod Kinstead, zero sim, zero UI | 1 zi |
| **Probe B** — arbitrul | ACELAȘI blob în Unity 6.3, același traseu, aceeași mașină, același cod de măsurare | 3 zile |
| **Spike de portare** | rng + hash + noise + macro (~290 de linii) într-o bibliotecă .NET, 10.000 de vectori golden comparați pe conținut | 2 zile |

Fără Probe A, **niciun FAIL nu e atribuibil**: sunt expert TypeScript și novice Unity, iar „stiva nu
poate" și „implementarea mea e proastă" produc același număr și cer decizii opuse.

MOVE se semnează doar dacă: Probe A depășește bugetul **și** Probe B trece **și** lista înghețată de
optimizări (§10) a fost rulată și măsurată, item cu item.

Probe B nu poate fi făcut să ruleze în 3 zile ⇒ **asta în sine e o dată despre costul portării** și se
consemnează ca atare. Timebox-ul nu se prelungește.

### 4 · GREY — o singură fereastră
X_max în [9,5; pragul de STAY).

**O singură fereastră de 21 de zile calendaristice / maximum 60 de ore, neprelungibilă**, acordată
DOAR dacă suma economiilor prezise din lista înghețată (§10) acoperă golul cu marjă 1,5×, fiecare item
cu bază de dovadă măsurată. Reper propriu: ablația mesher-ului a dat **1,83×** (786 → 430 µs), deci un
gol care cere peste ~1,8× îmbunătățire totală **nu primește fereastră**.

La final se rulează protocolul **identic**, nu unul ajustat. Expiră ⇒ FAIL-CANDIDAT automat.
Dacă predicția sigilată (§9) a ratat intervalul, fereastra se **înjumătățește** la 10 zile: modelul
meu despre sistem tocmai s-a dovedit greșit.

### 5 · STAY-PROVIZORIU — ce poate produce mașina asta, în cel mai bun caz
X_max ≥ 14,28 ms pe TOATE trei scenariile, cu balast pornit, **și** zero cadre peste 100 ms, **și**
sub 0,3% cadre peste 33,3 ms, **și** al doilea S-FORTRESS (după traversare) în +10% față de primul.

Verdictul poartă obligatoriu eticheta *„prag bazat pe presupunere de hardware nevalidată"*.
Nu închide D1. Rămâne provizoriu până la una din:
- o rulare pe hardware de clasă țintă, **sau**
- R_cpu și R_gpu măsurate separat pe un benchmark comun, pe o mașină împrumutată.

### 6 · STAY
STAY-PROVIZORIU **plus** R măsurat sau hardware țintă, **plus** D1b (§12) măsurat în ambele stive.

**D1 nu se poate semna închis fără D1b.** PLAN declară ergonomia UI-ului dens ca fiind ~70% din UX și
criteriul rămas al lui D1. Un PASS de randare închide D1a, nu D1. Un gate care nu atinge criteriul
propriu nu închide decizia, oricât de verde ar fi randarea.

### Clauze care se aplică peste orice ieșire

- **Gate nerulat până la finalul S10 ⇒ ÎNGHEȚARE, nu amânare.** Se oprește tot codul cuplat de motor;
  continuă doar `src/sim/`, care e portabil prin definiție. Peste 6 săptămâni de îngheț, verdictul
  implicit e FAIL-CANDIDAT. *Bucla de închis: înghețarea nu costă nimic, fiindcă `src/sim/` e exact
  unde prefer să lucrez — deci ceasul trebuie să fie mecanic, un check în CI care pică după o dată.*
- **Un FAIL se semnează doar după reproducere a doua zi**, pe repornire curată, pe același tag, pe
  arbore curat. Un gate rulat o singură dată e o ceremonie.
- **Instrument ABSENT vs. instrument STRICAT.** Absent (fără GPU timer, fără PresentMon) **blochează
  STAY** — nu am voie să revendic o marjă pe care n-am măsurat-o — dar nu produce singur FAIL. Stricat
  (probe negative verzi, CV peste prag, atribuire care nu însumează ±20%) produce NECONCLUDENT în
  ambele direcții.
- **48 de ore** între măsurătoare și semnătură, în care nu ating subiectul.
- **STAY nu închide D1, îl transformă în traiectorie monitorizată**, cu praguri care se strâng pe
  măsură ce bugetul se umple: S15 (agenți reali + pathfinding) X_max ≥ 11 ms · S23 (construcție +
  stabilitate + camere) X_max ≥ 8 ms · din S41, bugetul intră în CI lângă `tick ≤ 8 ms`. Depășirea
  unui checkpoint redeschide D1 cu ACEEAȘI regulă, pe același harness.

---

## 9. Predicția sigilată

**Scrisă înainte de orice rulare de gate. Falsificabilă. Dacă ratează intervalul, fereastra GREY se
înjumătățește** (§8.4) — fiindcă un prag aplicat peste un model greșit e o monedă aruncată.

Baza: măsurători făcute azi în Node, pe fixtura M10 și pe teren proaspăt.

| măsurat azi, în Node | |
|---|---|
| `generateChunk` | 22 µs |
| `meshHeightfield` (chunk ne-promovat) | 209 µs |
| `meshChunk` (chunk de așezare) | 484 µs |
| `dig` în sim, fără mesh | 4,8 µs |
| `setFocus` o graniță de chunk | 0,62 ms · **23 de chunk-uri noi** |
| Chunk-uri rezidente la rază 11 | 377 |
| Fixtura completă, meshing | 88 ms |

**Prezic:**

1. **NU pică pe GPU.** 172.142 de triunghiuri, un singur material, ~225 de draw calls pentru partea
   de voxeli — sub orice prag al unui 3060 și, scalat, sub al unui 1050 Ti. Sweep-ul de rezoluție va
   arăta **CPU-bound**: la 25% din pixeli, frametime-ul scade cu **sub 15%**.
   *(Predicția a fost scrisă pe 229.172 de triunghiuri, în lumea dinainte de re-etalonare.
   Raționamentul nu se schimbă — cifra a scăzut, deci predicția devine mai ușor de îndeplinit,
   nu mai grea. Se consemnează, nu se rescrie în tăcere.)*
2. **S-TRAVERSE pică primul.** O graniță de chunk la 40 m/s = 1,25 treceri/s, fiecare aducând 23 de
   chunk-uri noi × (209 µs mesh + BufferGeometry + upload) ≈ **5–7 ms de lucru, în rafală**. Prezic
   **X_max între 6 și 10 ms** pe S-TRAVERSE cu ceas real, și **cel puțin un cadru peste 33 ms** la
   fiecare a doua trecere de graniță, dacă bugetul de 2 chunk-uri/cadru nu e respectat.
3. **S-FORTRESS trece confortabil:** X_max **între 12 și 15 ms**.
4. **S-DIG trece:** 20 de săpături/s × 484 µs = 9,2 ms/s ≈ 0,15 ms/cadru amortizat. X_max **între 11
   și 14 ms**. Riscul e rafala, nu media.
5. **Zero cadre peste 100 ms** pe toate trei scenariile.
6. **Verdictul cel mai probabil al zilei: GREY sau FAIL-CANDIDAT pe S-TRAVERSE**, cu cauza atribuită
   la streaming, nu la mesher. Și **atribuită unui cod pe care nu l-am scris încă** — ceea ce
   înseamnă că gate-ul, dacă pică, pică pe absența unui buget de streaming, nu pe limita stivei.

---

## 10. Lista înghețată de optimizări

**Scrisă acum. O listă scrisă după rezultat e raționalizare, nu apărare.** Fiecare item are economie
prezisă și bază de dovadă.

| # | ce | economie prezisă | bază de dovadă |
|---|---|---|---|
| b | `meshHeightfield` mutat în worker | −4,8 ms din rafală | costul e pur CPU, fără atingere de GL |
| c | Pool de typed arrays în construcția de geometrie | −20% din alocări | azi se alocă 3 array-uri noi per chunk |
| d | Poziții Int16 + indici Uint16 sub 65.536 de vertecși | −50% bandă de upload | mesher-ul emite deja Int16 |
| e | Un singur material partajat, verificat cu `renderer.info.programs.length === 1` | elimină recompilările | — |
| f | LOD de heightfield peste 200 m | −60% triunghiuri la traversare | 377 de chunk-uri rezidente, majoritatea departe |
| g | `BatchedMesh` cu `perObjectFrustumCulled=false`, `sortObjects=false` | 377 → ~4 draw calls | **ULTIMUL** — `setGeometryAt` aruncă hard când remesh-ul crește peste rezervare |

**Deja cheltuite, deci NU mai pot fi invocate ca apărare:**
- ablația mesher-ului: 786 → 430 µs (**1,83×**)
- remesh doar pe chunk-urile chiar murdare, în loc de 3×3 fix: **4,35 ms → 0,48 ms** pe săpătură
- **tăierea fețelor de la granița de chunk: −5,3% quaduri**, la un cost nedecis. Vine cu un invariant
  nou, care e adevăratul preț: o săpătură pe marginea unui chunk trebuie să re-meshuiască și vecinul,
  altfel rămâne o gaură prin care se vede fundalul
- **normalele de heightfield, calculate analitic** în loc de `computeVertexNormals()`: pe o grilă
  regulată panta se citește direct din diferențele de înălțime ale vecinilor. O trecere mai puțin
  peste geometrie, per chunk ne-promovat
- **indicii de heightfield, un singur buffer partajat**: topologia unei grile regulate nu depinde de
  conținut. **24 KB × 377 de chunk-uri rezidente = 8,8 MB** de indici identici, alocați și ținuți
  degeaba. Cifra e exactă, nu măsurată
- **bugetul de streaming pe cadru** (`BUILD_BUDGET_PER_FRAME`, coadă sortată după distanță) — era
  listat ca item (a) DISPONIBIL în tabelul de mai sus, deși fusese implementat. §8.4 acordă fereastra
  GREY tocmai dacă lista de sus acoperă golul, deci documentul putea cumpăra **o amânare nemeritată
  pe o economie deja cheltuită.** Nu o cifră învechită — un mecanism de auto-indulgență, exact ce
  protocolul fusese scris să prevină. Găsit de un panou care a citit documentul, nu de mine

> **Corecție de document, 14.09.2026, în commit separat, cum cere antetul.** Trei derapaje, toate
> găsite în aceeași zi: §3 spunea 105 ms și §5/§9 spuneau 84,5 ms pentru **aceeași** măsurătoare
> (diferență peste DMD); §3 spunea 2,64 MB unde măsurătoarea dă 2,34; și §10(a) de mai sus.
>
> Niciunul nu schimbă un prag, deci rezultatul nu devine EXPLORATOR. Dar frecvența lor spune ceva:
> un document care conține cifre se învechește exact ca un cache fără invalidare. De aceea
> `tools/check-gate-numbers.mjs` rulează acum în `npm run check` și în CI și **compară cifrele din
> §3 cu măsurătoarea**, verifică faptul că aceeași măsurătoare nu apare cu două valori, și refuză
> o optimizare listată ca disponibilă dacă e deja implementată.

---

## 11. Cele două comunicate, scrise dinainte

Amândouă scrise acum, ca să nu pot descoperi după rezultat că unul e mai greu de scris decât celălalt.

> **Dacă rămânem pe TypeScript.** Gate-ul a măsurat un buget liber de X ms pe toate trei scenariile,
> peste pragul de 14,28 ms cerut de aritmetica din §2. Stiva nu e argumentul limitator la luna 3.
> Rămânem, cu trei condiții: pragurile de la S15 și S23 intră în calendar acum; D1b rămâne deschis
> până la măsurătoare; iar verdictul e **provizoriu** până când există o cifră de pe hardware de
> clasă țintă. Nu înseamnă „am ales bine", înseamnă „n-am găsit motivul să schimb".

> **Dacă stiva a picat.** Gate-ul a măsurat un buget liber de X ms pe S-\<scenariu\>, sub pragul
> pre-înregistrat. Sweep-ul de rezoluție arată CPU-bound, Probe A confirmă că podeaua stivei e deja
> peste buget cu geometria goală, lista de optimizări din §10 a fost rulată item cu item, iar Probe B
> arată că Unity ține aceeași geometrie. Deblochez portarea. Costă 3–4 luni, nu 2 — cifra veche era o
> estimare a părții cu preferință, iar spike-ul cronometrat a înlocuit-o. `src/sim/` se portează prin
> construcție: e izolat mecanic de `tools/check-sim-discipline.mjs` de la commit-ul S1-2.

---

## 12. Ce rămâne nemăsurat — scris ca să nu poată fi uitat

| # | gaură | cost de închis |
|---|---|---|
| 1 | **Hardware de clasă țintă și rapoartele R.** Fără ele, orice STAY e o presupunere în direcția pe care o prefer | un 1050 Ti second-hand, ~200–300 EUR. **Cea mai ieftină măsurătoare din tot proiectul** |
| 2 | **D1b — panoul dens.** **JUMĂTATE ÎNCHIS, 14.09.2026.** Partea de TypeScript e construită (`viewer/panel-dens.ts`, `?d1b=1`): 40 de pioni × 25 de coloane + 300 de stocuri, 1.300 de celule live la 20 Hz. Măsurat: **0,336 ms medie, 1,70 ms maxim** — sub bugetul de 1,5 ms din §2. **Dar sunt două limite inferioare suprapuse:** (a) e DOM țintit, nu React — un panou React cu 1.000 de componente e alt număr; (b) cronometrul acoperă doar scrierea în DOM, iar recalcularea de stiluri, layout-ul și desenarea cad în afara ferestrei — aceeași clasă de eroare ca `CPU_busy` care nu vede procesul GPU. Costul întreg se vede doar în intervalul de prezentare al unei rulări reale, cu și fără `?d1b=1`. Unity rămâne complet nemăsurat | ablație în rularea reală + 1 zi Unity |
| 3 | **Electron nu e instalat.** Gate-ul măsoară Chrome curat; livrarea e Electron cu `in-process-gpu` (cerut de overlay-ul Steam), care schimbă calea de randare | gate D1-B separat, 4–5 zile. Dacă flagurile costă peste 5% din mediană, toate cifrele se re-măsoară |
| 4 | **Asimetria 10:2 e nemăsurată** și dă forma întregii reguli | spike-ul de portare de 2 zile |
| ~~5~~ | ~~**CI-ul n-a rulat niciodată**~~ — **ÎNCHIS 14.09.2026.** Remote: `AndreiBesliu/BaseBuilder`. Prima rulare a **picat în 21 de secunde**, pe cea mai simplă comandă din workflow (`node --test tests/` merge pe Node 26 local, nu și pe 24). Fișierul exista de la S1-2 și arăta a verificare. De acum commit-urile de protocol au o dată emisă de alt sistem — `GIT_COMMITTER_DATE` se falsifică într-o secundă, un timestamp de GitHub Actions nu | ✅ |
| 6 | **Atribuirea CPU/GPU poate rămâne grosieră.** `EXT_disjoint_timer_query_webgl2` e dezactivată implicit în Chrome (Spectre/rowhammer) și cere `--enable-webgl-developer-extensions` | dacă flagul nu prinde, rămâne sweep-ul de rezoluție: spune „CPU sau GPU", nu „câte ms fiecare" |
| 7 | **Nu există agenți randați și nici UI.** Balastul e un proxy onest, dar rămâne proxy | se închide singur, la S15 și S23 |

**Reparat azi, înainte de gate** (era în lista asta și nu mai e):
`standardScenario` emitea exclusiv `spawnAgent`, deci promova **zero** chunk-uri, deci hash-ul de
referință din CI acoperea **zero teren**. Dovedit prin mutație: `HEIGHT_SCALE_DM` mutat de la 1800 la
1900 — tot relieful lumii schimbat cu 5,5% — lăsa hash-ul neclintit la `5bc3ca4c`. Garda „hash diferit
⇒ rulare invalidă" nu s-ar fi putut declanșa niciodată.

---

## 13. Semnătura

La final, o singură întrebare, pusă de un om anume: **„ai făcut ce zice regula ta?"**

Omul e **Andrei** (owner). Dacă la momentul gate-ului răspunsul nu poate fi dat de un om, rolul se
înlocuiește mecanic: un check în CI care citește ieșirea lui `tools/gate-verdict.mjs` și refuză
build-ul cât timp verdictul semnat diferă de ieșirea programului.

**Ordinea de tăiere, decisă ACUM și nu în minutul 400**, dacă ziua se lungește:
S-TRAVERSE (cele ~60 de linii de streaming) → ablațiile de atribuire → sweep-ul la 50% (rămân 100% și
25%) → panoul de judecători cu framing inversat.

**Nu se taie niciodată, în nicio ordine:** balastul (§4), probele negative (§6), reproductibilitatea
(§7) și bisecția X_max (§1). Fără oricare dintre ele, ziua produce o ceremonie, nu o măsurătoare.
