# DEVLOG — Kinstead

Append-only. Intrările noi se adaugă la final.

---

## 2026-09-13 — Sesiunea 1: research, design, plan, și S1-2

**Model:** Claude Opus 5
**Prompt de start:** „vreau sa cream un joc de tip base building, open world, colony sim, strategy.
Inspiratia mea este Going Medieval si Sapiens. Vreau sa faci research pentru ce implica jocul si sa
creezi un plan si o descriere."

### Task Started — research de gen

Două tranșe de research multi-agent, 29 de agenți în total, ~3,9 M tokeni.

- **Tranșa 1** (17 agenți, 2,19 M): Going Medieval, Sapiens, RimWorld, o măturare peste 12 jocuri din
  gen, arhitectură, job system, pathfinding, AI de pioni, teren, performanță, motor, UX, artă, piață,
  producție, conținut. 437 de constatări cu surse.
- **Tranșa 2** (17 agenți, din care 5 recuperați dintr-o rulare căzută): Ostriv, Foundation,
  Manor Lords, axa de realism, grilă vs. organic, ocupare exclusivă → 4 arhitecți independenți +
  3 avocați de motor → 3 judecători pe lentile distincte + 1 judecător de motor.

**Incident:** un agent s-a blocat 7 ore într-un `WebFetch` care nu s-a mai întors, iar faza fiind o
barieră, a blocat tot workflow-ul. `parallel()` transformă o excepție în `null`, dar un apel care nu
se rezolvă niciodată nu e o excepție, iar API-ul de script n-are timeout. Recuperat prin extragerea
celor 5 rapoarte terminate din `journal.jsonl` și o rulare nouă care a pornit de la lentila căzută,
cu disciplină de instrumente adăugată în prompt (max 3 `WebFetch`, niciodată pe PDF, unul pe rând).

### Task Completed — decizii luate

Registrul complet e în PLAN.md §0. Cele care contează:

- **D19 — arhitectura „Grilă Promovată"**, câștigătoare unanimă pe toate trei lentilele de judecată.
  Grila de 1 m e universală; stiva verticală de voxeli există doar unde ai săpat.
- **D17 — grilă pentru logică, organic doar la prezentare.** Panoul a căutat și n-a găsit niciun joc
  livrat cu interioare multi-etaj ȘI plasare organică fără grilă.
- **D18 — lume plată continuă 16×16 km**, nu planetă. Cele trei propoziții pe care le spun efectiv
  jucătorii lui Sapiens nu menționează sfericitatea.
- **D16 — low-poly stilizat**, refuzat realismul cu argumente de constrângere, nu de gust.
- **D7 — ocuparea celulei e funcție de ostilitate** (decizie de owner, după ce panoul a răsturnat
  premisa exclusivității stricte). Reduce mașinăria anti-deadlock de la ~8 straturi la ~2.
- **D14 — numele: Kinstead.** Verificat liber pe Steam.
- **D1 — motorul rămâne deliberat deschis** până la un gate măsurat la finalul S8.

**Două lucruri de metodă, consemnate ca riscuri (K17, K18):** o cifră inventată despre performanța
PIBT s-a propagat identic în toate cele patru propuneri, pentru că a venit din brief-ul comun și
nimeni n-a deschis sursa — prinsă doar fiindcă un judecător a măsurat singur. Și bugetul de
WebSearch al sesiunii s-a epuizat în mijlocul panoului, lăsând doi judecători fără verificare.

### Task Started — S1-2, harness înainte de joc

### Task Completed

Livrat, cu verificare:

| | |
|---|---|
| `src/sim/rng.ts` | xoshiro128** cu fluxuri **numite** derivate din seed; `nextInt` fără bias de modulo |
| `src/sim/result.ts` | contractul de refuz — nicio verificare nu întoarce `boolean` |
| `src/sim/state.ts` | starea lumii în SoA, fiecare câmp etichetat PERSISTED/DERIVED/TRANSIENT |
| `src/sim/commands.ts` | stratul de comenzi; nimic nu scrie în `World` din afară |
| `src/sim/world.ts` | bucla de tick (simulare-substitut deliberată, se înlocuiește la S3-5) |
| `src/sim/save.ts` | envelope versionat, lanț de migrări, refuz al build-urilor mai noi |
| `src/sim/content.ts` | reguli din JSON, cu refuz explicit pentru câmpuri necunoscute |
| `src/sim/hash.ts` | hash-ul stării, cu ordine de parcurgere fixă |
| `src/harness/` | runner headless + CLI |
| `tools/check-sim-discipline.mjs` | scaner de determinism, cu portiță justificată |
| `.github/workflows/ci.yml` | disciplină → typecheck → teste → hash de referință |

**Verificat, nu presupus:**
- 48/48 teste trec (`node --test`), typecheck curat (`tsc --noEmit`, exit 0).
- 100.000 de tickuri cu 40 de agenți: **138 ms, 1,38 µs/tick**, hash `f23d080c`, identic la reluare.
- Roundtrip de save dovedit ca no-op observabil: `1000 + salvare + încărcare + 1000 == 2000`.
- Scanerul de disciplină are **patru probe negative** — teste care demonstrează că *pică* atunci când
  trebuie. Prima lui versiune raporta propria documentație ca încălcare: docblocul care enumeră
  tiparele interzise conține chiar tiparele interzise. Instrumentul era stricat, nu codul.

**Ce NU e livrat și nu se pretinde:** nu există teren, nu există agenți adevărați, nu există joburi,
nu există gameplay. Plimbarea aleatoare din `world.ts` e un substitut al cărui singur rol e să
exercite mecanismele care nu se pot retrofita.

**Următorul pas:** S3-5, terenul — harta macro, streamer-ul de chunkuri, promovarea la voxeli RLE.
Gate-ul de motor e la finalul S8.

---

## 2026-09-13 — Sesiunea 1 (continuare): S3-5, terenul

**Model:** Claude Opus 5 · **Prompt:** „continua"

### Task Started — S3-5

Prima felie care depinde de arhitectura. D17 fiind închisă (grilă pentru logică), drumul era liber.

### Task Completed

Cele trei straturi din arhitectura Grilă Promovată, plus editarea și persistența:

| | |
|---|---|
| `terrain/noise.ts` | zgomot valoric + fBm, **în aritmetică întreagă**. Nu float: `Math` nu e garantat bit-identic între motoare, iar lumea trebuie să fie aceeași funcție oriunde — altfel un save mutat pe alt calculator se aplică peste alt teren. |
| `terrain/macro.ts` | L0, funcție pură de (seed, poziție). 1024² eșantioane la 16 m = 268 km². Nu se materializează și nu se salvează. |
| `terrain/chunk.ts` | L1 heightfield + L2 voxeli RLE. Promovare, `setVoxel`, codare/decodare. |
| `terrain/terrain.ts` | streamer pe disc, promovare cu apron, `dig`/`fill` cu refuzuri tipizate. |

**Verificat:** 77/77 teste (29 noi), typecheck curat, disciplină curată.

**Măsurat** (`node src/harness/bench-terrain.ts`): 377 de chunkuri rezidente încărcate la rece în
9,8 ms · mutarea focusului cu un chunk 0,8 ms · promovare + apron 5,5 ms · o săpătură 7,0 µs ·
2,62 MB pentru 200 de chunkuri de fortăreață, sub ținta de 3,2 MB.

**Corecție la plan:** estimarea de „4 KB pentru un chunk proaspăt promovat" era greșită de trei ori —
ignora indexul de coloane (1.025 × 4 B = 4,1 KB, singur cât tot bugetul estimat). Măsurat: 12,0 KB.
Bugetul total ține totuși, fiindcă planul supraestima în cealaltă direcție chunkul intens săpat.
Nu optimizez: n-am un motiv măsurat.

### Două decizii luate în timpul implementării, ambele cu număr în spate

1. **`setVoxel` lucrează pe COLOANĂ, nu pe chunk.** Prima versiune desfăcea și reconstruia tot chunkul
   la fiecare editare: 130.000 de operații pe săpătură, adică 1,3 miliarde pentru fuzz-ul de 10.000 de
   operații cerut de plan. Nu e optimizare prematură — e un număr calculat *înainte* de a scrie testul.
   Rezultat: fuzz-ul rulează în **104 ms**.
2. **Petec macro precalculat.** Fiecare vârf ar fi cerut patru evaluări de fBm, adică 4.356 pe chunk.
   Un petec de 4×4 eșantioane acoperă tot chunkul: **16 evaluări, de 272 de ori mai puțin** — și e și
   implementarea corectă, fiindcă vârfurile vecine împart același eșantion macro.

### Invariantul de seam, testat în miniatură

K16 (granița heightfield↔voxel) e riscul declarat numărul unu al arhitecturii. Testul
`chunk-urile vecine sunt CONTINUE pe muchia comuna` verifică toate cele 33 de vârfuri de pe fiecare
muchie comună. Trece prin construcție: interpolarea la granița chunkului cade exact pe un eșantion
macro, cu pondere zero. Nu închide K16 — seam-ul rămâne de verificat în randare, pathfinding, camere
și stabilitate — dar închide primul dintre cele șase subsisteme.

### Ce s-a schimbat și nu e un bug

Hash-ul de referință din CI a trecut de la `f23d080c` la `5bc3ca4c`, fiindcă terenul intră acum în
starea hash-uită (focus + chunkurile promovate). Intenționat, actualizat în workflow.

### Ce NU e livrat

Râurile (planul le cere generate ÎNAINTEA reliefului — nu sunt în lista S3-5). Nicio randare.
Niciun mesher. Agenții rămân substitutul de la S1-2, cu marginile lor separate de coordonatele
terenului; se contopesc la S12-15.

**Următorul pas:** S6-8 — coloana vertebrală de randare, la finalul căreia stă **gate-ul de motor**.

---

## 2026-09-13 — Sesiunea 1 (continuare): S6-8, prima jumătate — mesher-ul

**Model:** Claude Opus 5 · **Prompt:** „continua"

### Task Started

Din S6-8 am atacat întâi partea care **poate să pice gate-ul și se poate măsura fără GPU**:
binary greedy meshing. Reperul citat în panou era 74 µs pe un chunk de 64³ în C++, față de 2,04 ms
pentru face-cull naiv în JS — o prăpastie de 27× pe care doar arhitectura câștigătoare a proiectat-o.

### Task Completed

`src/render/mesher.ts` + 10 teste. **87/87 teste, typecheck curat, disciplină curată.**

**Invariantul central, testat:** aria totală a quadurilor unite trebuie să fie *exact* egală cu
numărul de fețe vizibile numărate naiv. Dacă unirea pierde fețe, apar găuri în geometrie; dacă
inventează, apar suprapuneri. E singurul test care dovedește că unirea e corectă, și se ține și după
400 de săpături aleatoare.

### Trei lucruri măsurate, toate contrazicând o presupunere

1. **Prima versiune: 786 µs/chunk — per voxel mai lentă decât face-cull-ul naiv în JS.** Semnal roșu.
2. **Ablația a contrazis ipoteza mea.** Credeam că e în `expand` (decodare + array dens). Măsurat:
   `expand` = 24%, umplerea grilelor = 15%, iar **61% era în unire și emitere**. Cauza structurală:
   parcurgeam fiecare celulă din toate cele 128 de felii, inclusiv cele complet goale. Cu ieșire
   devreme pe felie și pe rând: **786 → 430 µs**, de 1,83×.
3. **Cazul „săpat intens" era o fixtură greșită, nu un rezultat.** Arăta 1,7× reducere și 1222 µs,
   ceea ce părea alarmant. Am construit un chunk cu **camere și coridoare** în loc de zgomot:
   **19,5× reducere, 435 µs** — practic la fel ca un chunk neatins. Săpătura aleatoare e cel mai
   prost caz posibil pentru unirea lacomă și nu seamănă cu nimic construit de un jucător.

### Un bug pe care l-am introdus chiar eu, prins de invariant

Optimizarea „sari peste rândurile goale" a lăsat grila **negolită** pe acele rânduri, iar extinderea
pe verticală din unire citește rândurile de dedesubt *fără* să verifice steagul de rând folosit —
deci ar fi unit date rămase de la felia anterioară ca și cum ar fi fost fețe reale. Prins imediat de
testul de arie. Reparat cu golire explicită.

### Verdictul de buget

23× mai lent decât C++ per voxel, și asta rămâne adevărat. Dar cifra care decide nu e raportul, e
bugetul: un dig murdărește un chunk ⇒ **435 µs = 2,6% dintr-un cadru**; o fortăreață de 200 de
chunkuri ⇒ **~87 ms într-un worker**, întinsă pe câteva cadre. Încape.

### Ce NU e livrat din S6-8

Randarea propriu-zisă: three.js, netezirea suprafeței cu marching-squares, slice view cu fade de
acoperiș, camera. **Gate-ul de motor nu se poate rula încă** — el cere o măsurătoare de FPS pe GPU,
nu una de CPU. Plus limita cunoscută a mesher-ului: fețele de la marginea chunkului sunt emise mereu,
pentru că nu se consultă vecinul.

---

## 2026-09-13 — Sesiunea 1 (continuare): viewerul. Prima dată când se vede ceva

**Model:** Claude Opus 5 · **Prompt:** „continua" + întrebarea „când pot vedea sau testa ceva"

### Task Started

Întrebarea owner-ului a schimbat prioritatea: tot ce exista era headless. Am construit viewerul —
nu ca să fie joc, ci ca să existe ce privi și cu ce măsura gate-ul.

### Task Completed

`viewer/` (three.js + vite) + `src/render/heightfield.ts`. Peisajul e plan de triunghiuri ieftine;
acolo unde s-a săpat apare geometrie de voxeli. **87/87 teste, typecheck curat pe ambele configurații.**

Măsurat, cu panoul vizibil: **60 FPS** (16,7 ms median), **124 draw calls**, **240.590 de triunghiuri**,
377 de chunk-uri, build inițial 136 ms.

### Patru lucruri găsite privind, nu citind cod

1. **`requestAnimationFrame` nu rulează când panoul e ascuns.** HUD-ul arăta „fps 0, p99 9008 ms".
   Instrumentul, nu codul. Consecință pentru gate: **măsurătoarea de framerate cere o fereastră
   vizibilă** — intră în protocol.
2. **Nivelul apei era prost calibrat.** Era la −6 m, cu relief măsurat între −142 m și +148 m: 40% din
   lume ieșea apă. Am rulat distribuția (`tools/height-distribution.mjs`) și am mutat pragul la −30 m
   ⇒ 76% uscat. Numărul vine dintr-o măsurătoare, nu din intuiție.
3. **Viewerul ateriza orb** într-un bazin la −80 m, adică sub apă. Acum caută determinist un loc
   locuibil — teren peste apă, sol bun, relief moderat.
4. **Winding greșit pe jumătate din fețe.** Mesher-ul emite aceeași ordine de colțuri pentru ambele
   direcții ale unei axe, iar trecerea în spațiul lui three schimbă Y cu Z, ceea ce oglindește spațiul.
   Rezultat: jumătate din fețe erau back-facing, eliminate de culling, și se vedea fundalul prin
   geometrie. **Prima încercare de reparare a inversat exact pe dos** — am rezolvat-o analitic
   (produsul vectorial pentru fața de sus dă −Y, dar trebuie +Y), nu prin încercări.

### Ce se vede și e corect să se vadă

Terasarea în trepte de 1 m pe suprafața promovată. **Nu e un bug — e pasul neimplementat din plan:**
S6-8 cere netezirea suprafeței cu marching-squares, „ca zona săpată să nu citească Minecraft; treptele
de 1 m rămân în DATE, nu în pixeli". Acum se vede exact de ce planul cere asta.

La fel, seam-ul heightfield↔voxel (K16) e vizibil la granița zonei promovate. Prima dovadă vizuală a
riscului numărul unu al arhitecturii.

### Cum se rulează

```
npm --prefix games/kinstead run viewer      # http://localhost:5175
```
Drag rotește, rotița face zoom, Q/E mișcă nivelul de slice, click stânga sapă, Shift+click construiește.

**Ce NU e:** nu e joc. Nu există pioni, joburi, nevoi, timp. E o unealtă de inspecție și de măsurare.

---

## Protocolul gate-ului de motor, scris înainte de măsurătoare

**Prompt:** „continua" (după panoul de pre-înregistrare a gate-ului, 8 agenți, 1,11 M tokeni)
**Model:** Opus 5

Panoul a produs șase protocoale și două verdicte de judecător. Ce am făcut cu ele nu e să le
adopt — le-am verificat în cod, am tăiat ce nu încape, și am reparat trei lucruri pe care le-au
găsit și care erau defecte reale, nu observații.

### Oracolul de determinism era ORB pe teren — dovedit prin mutație

`hashWorld` include, prin decizie documentată, **numai chunk-urile promovate**: restul terenului e
DERIVED și se regenerează identic din seed. Corect pentru simulare. Fatal ca poartă, fiindcă
`standardScenario` emitea **exclusiv** `spawnAgent` — deci zero chunk-uri promovate, deci hash-ul de
referință din CI acoperea **zero teren**.

Nu am dedus-o, am dovedit-o prin mutație:

| mutație | hash înainte | hash după |
|---|---|---|
| `HEIGHT_SCALE_DM` 1800 → 1900 (tot relieful lumii, +5,5%) | `5bc3ca4c` | `5bc3ca4c` ❌ |

Tot relieful lumii se putea schimba fără ca poarta să clipească. **O poartă care nu poate să pice nu
e o poartă.**

Scenariul standard promovează acum 108 chunk-uri, cu situri alese pe seed, jumătate sub cota zero și
jumătate peste — semnul contează, fiindcă înălțimea se calculează cu `Math.floor(cm / 100)`, iar pe
negative `Math.floor` nu e trunchiere. Aceleași mutații, acum:

| mutație | hash |
|---|---|
| bază | `3876f59a` |
| relief +5,5% | `161a75d9` ✓ |
| `Math.floor` → `Math.trunc` pe cote | `67cb4b5d` ✓ |
| `LEVELS_BELOW` 24 → 25 | `290d35a8` ✓ |

Hash-ul de referință din CI e acum `3876f59a`. Plus trei teste care păzesc poarta însăși: că
scenariul chiar promovează, că sapă în ambele semne, și că hash-ul vede un singur voxel schimbat.

### Viewerul plătea de 9× pentru o săpătură

Remesh-uia fix 3×3 chunk-uri la fiecare săpătură, deși apron-ul se promovează **o singură dată** —
la a doua săpătură în același chunk, vecinii sunt deja promovați și mesh-ul lor e neschimbat.
**4,14 ms → 0,46 ms.** Exact genul de defect care ar fi intrat în gate ca „limita stivei" și ar fi
cumpărat două luni de portare inutilă.

La fel, `applySlice()` comuta `renderer.clippingPlanes` între `[]` și `[plane]`. Numărul de clipping
planes intră în cheia de program a shaderului ⇒ recompilare ⇒ un cadru lung care arată **exact** ca
un hiccup de streaming. Planul e acum mereu activ, împins la 1e6 când slice-ul e oprit.

### Fixtura M10: gate-ul se rulează pe ce va fi jocul, nu pe ce e azi

Fortăreața din viewer promovează **12 chunk-uri**. Un gate rulat pe ea trece cu orice stivă.
`src/harness/fixture-m10.ts` construiește determinist o așezare de dimensiunea bugetului din plan:

| | măsurat (`node src/harness/bench-fixture.ts`) |
|---|---|
| Camere · săpături · zidiri | 676 · 214.350 · 3.880 |
| **Chunk-uri promovate** | **225** (PLAN bugeta ~200) |
| Quaduri / triunghiuri | 114.586 / 229.172 |
| Meshing complet | 89,6 ms (398 µs/chunk) |
| `dig` în sim, fără mesh | 2,9 µs |
| Memorie RLE | 2,64 MB (față de 14,1 MB) |

Validarea fixturii e **structurală**, nu prin raportul de reducere al mesher-ului: criteriul ăla e
auto-referențial, selectează fixturi ieftine de meshuit, adică exact fixturile pe care un motor slab
le trece.

**Și aici am greșit o măsurătoare, din nou pe instrument.** Prima variantă raporta „2,73 ms per
săpătură" — bucla apela `meshChunk` de 200 de ori, dar împărțea la săpăturile **acceptate**, 144 din
200 (restul loveau aer deja săpat). Factorul de 1,4× venea din numărător. Separate corect: `dig` =
2,9 µs, remesh = 460 µs.

### Ce spune protocolul, pe scurt

`bench/GATE.md` e comis **înainte de prima cifră**, cu predicție sigilată, listă înghețată de
optimizări și ambele comunicate scrise dinainte. Trei schimbări față de cum era scris gate-ul în plan:

1. **„60 FPS" nu e o măsurătoare, e o saturație.** Sub vsync, cel mai bun rezultat observabil e
   16,67 ms și nu afli dacă ai consumat 2 ms sau 16. Metrica e **X_max** — bugetul liber, găsit prin
   bisecție pe o sarcină artificială, cu criteriul p99(interval de prezentare) ≤ 17,5 ms.
2. **`CPU_busy` măsurat în rAF nu poate să pice.** În Chromium, submisia GL, rasterul și compunerea
   rulează în procesul GPU; rAF vede doar JS-ul. Rămâne diagnostic, fără prag. X_max scapă de
   problemă fiindcă e măsurat pe **prezentare**.
3. **Mașina asta nu poate semna STAY.** 7950X + RTX 3060 e de ~2× pe CPU și ~5,5× pe GPU peste clasa
   țintă. Aritmetica: randarea trebuie să încapă în 4,78 ms pe țintă, deci în 2,39 ms aici
   (CPU-bound) sau 0,87 ms (GPU-bound) — al doilea e sub pragul la care bisecția mai înseamnă ceva.
   Cel mai bun verdict disponibil e **STAY-PROVIZORIU**, iar ce-l ridică la STAY costă ~200–300 EUR.

`tools/gate-verdict.mjs` e programul care dă verdictul, cu zece fixturi sintetice — câte una pentru
fiecare ieșire, inclusiv trei care TREBUIE să producă REFUZ. Rulează în `npm run check` și în CI.
Un program de verdict care nu poate produce roșu n-are dreptul să producă verde.

### Ce rămâne deschis, scris ca să nu poată fi uitat

- **Care e mașina țintă?** PLAN spune în două locuri lucruri diferite („laptopul meu" vs. clase de
  hardware). Până la răspuns, protocolul presupune clasa GTX 1050 Ti / Ryzen 5 3600 și fiecare
  verdict poartă eticheta „prag bazat pe presupunere de hardware nevalidată".
- **D1b — panoul dens** rămâne nemăsurat în ambele stive. E criteriul pe care D1 și-l declară singur.
- **Electron nu e instalat.** Gate-ul măsoară Chrome curat; livrarea e Electron cu `in-process-gpu`.
- **CI-ul n-a rulat niciodată** — `git remote -v` e gol. Pre-înregistrarea prin commit-uri locale
  n-are nicio dată emisă de alt sistem.

### Trei defecte găsite privind viewerul, nu citind codul

Am pornit viewerul ca să verific schimbările de randare. N-am verificat schimbările — am găsit trei
lucruri care nu funcționaseră niciodată.

1. **Săpatul nu funcționa deloc.** Punctul de impact al raycast-ului stă EXACT pe suprafață, deci nu
   aparține niciunei celule. `Math.round(p.y)` nimerea sistematic celula de deasupra solului: teren
   la −4,37 m ⇒ sol solid de la −5 în jos, dar ținta calculată era −4, adică aer. Fiecare click se
   termina în `LIPSA_MATERIAL`. Acum se intră o jumătate de celulă pe direcția normalei feței —
   înăuntru pentru săpat, în afară pentru zidit — ceea ce merge identic pe heightfield (cotă
   fracționară) și pe o față de voxel (cotă întreagă, punct fix pe graniță).
2. **Refuzurile erau înghițite.** `if (!out.ok) return` — contractul de `Outcome` poartă motivul, și
   era aruncat exact la capătul lanțului. Un buton care „nu face nimic" e cel mai scump fel de bug.
   Fără `console.warn`-ul adăugat aici, defectul de mai sus rămânea invizibil: **el a spus care e
   problema, în prima încercare.**
3. **Un click cu un pixel de tremur nu făcea nimic.** `pointermove` seta un flag `dragged`, deci orice
   mișcare între apăsare și eliberare anula clickul. Acum e o distanță (4 px), nu un flag.

Și o măsurătoare pe care era să o citesc greșit: după un click, „draw calls" și „triunghiuri" scăzuseră.
Nu de la click — de la redimensionarea ferestrei între cele două citiri. Cele două câmpuri vin din
`renderer.info`, adică din **frustum culling**, nu din starea lumii. Câmpurile care spun ceva despre
lume sunt „din care voxel" și „quaduri voxel".

Verificat live: săpat ⇒ quaduri 5.607 → 5.615; Shift+click pe teren nepromovat ⇒ chunk-uri voxel
12 → 15, quaduri → 6.603, zero refuzuri în consolă. HUD-ul arată acum GPU-ul REAL
(`ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 …, D3D11)`) — e condiția de invalidare nr. 2 din
`bench/GATE.md`, iar mașina asta are și un iGPU AMD lângă 3060.

---

## Streaming în viewer — piesa fără de care gate-ul nu se poate rula

**Prompt:** „continua"
**Model:** Opus 5

Viewerul construia o dată discul de 377 de chunk-uri și nu mai streama niciodată. Adică **S-TRAVERSE
— exact scenariul scris în PLAN.md ca gate de motor — nu se putea rula deloc.** E prima piesă,
fiindcă nu depinde de decizia despre netezire (care rulează în panou acum).

### Rezidență ≠ vizibilitate

Distincția asta e ușor de ratat și ar fi produs un bug tăcut:

| | ce e | regula |
|---|---|---|
| **Rezidență** (date) | `setFocus` în sim: ce chunk-uri există în memorie | nu aruncă **niciodată** un chunk promovat — acolo e munca jucătorului |
| **Vizibilitate** (mesh) | ce are geometrie pe GPU | se evacuează pe `VIEW_RADIUS`, indiferent de promovare |

O fortăreață de acum trei văi rămâne în date, dar nu merită un draw call. Verificat live: după
traversare, „din care voxel" rămâne **12** iar „quaduri voxel" cade la **0** — apoi, la întoarcere,
revine la **5.607**, exact valoarea inițială.

### Ce s-a adăugat

- coadă de build cu **buget de 2 chunk-uri/cadru**, sortată după distanță (`pop()` ia cel mai apropiat)
- evacuare de mesh-uri la trecerea de graniță, pe rază de desen
- **traversare pe șine, 40 m/s** (`T`), cu **două ceasuri** (`F`): timp real — pe ăsta se dă verdictul;
  pas fix 1/60 s — pentru comparabilitate între rulări. Cu pas fix, o configurație lentă primește mai
  mult timp de perete pe metru, deci streamerul asincron arată mai bine decât va fi în joc.
- **sens reversibil** (`Shift+T`) — nu e un moft: e S4b din protocol, a doua trecere peste același
  teren detectează acumularea (leak, fragmentare, cache invalidat) pe care media o ascunde.
- HUD: adâncimea cozii + costul lui `setFocus` (măsurat: **0,5–0,6 ms** per graniță)

### Și o măsurătoare pe care era să o iau drept constatare

Pe drumul de întoarcere HUD-ul arăta **30 fps, p99 33,5 ms** — arăta exact ca semnalul S4b pe care
tocmai îl construisem ca să-l caut. Apoi am oprit traversarea: scena a rămas cu **37 de draw calls și
77.000 de triunghiuri** — și tot 30 fps.

O scenă aproape goală la 30 fps nu e o afirmație despre cost. E **vsync-ul căzut la jumătate de rată**
și rămas acolo. Adică fix teza din `bench/GATE.md` §1, observată live pe propriul cod: sub vsync,
framerate-ul nu măsoară cât ai consumat. Dacă protocolul nu era deja scris, aș fi raportat 30 fps ca
pe o constatare despre streaming.

Al treilea instrument care minte în două sesiuni, după `AdapterRAM` = 4 GB și „2,73 ms per săpătură".

---

## Două defecte care se anulau reciproc

**Prompt:** „continua" (după panoul de netezire a suprafeței, 7 agenți, 1,41 M tokeni)
**Model:** Opus 5

Panoul a fost întrebat cum se netezește suprafața. Cei trei judecători au dat trei clasamente
**diferite** — dar au convers pe altceva decât întrebarea: *nu porni cu niciuna dintre cele patru
propuneri; repară întâi fundația pe care toate patru au găsit-o stricată.* Am verificat fiecare
afirmație în cod înainte să o cred.

### Lanțul, în ordinea în care s-a desfăcut

**1. `heightfield.ts` punea cota CELULEI în COLȚUL rețelei.** Cotele reale ale colțurilor erau deja
în `chunk.vertexCm`; codul folosea în loc media celor patru vecini, adică toată suprafața deplasată
cu o jumătate de celulă. Măsurat pe 123.057 de vârfuri: eroare medie 0,119 m, maximă 0,370 m.

**2. Reparat, terenul a ieșit în benzi de contur — mai urât decât înainte.** Aici era tentația să dau
înapoi. În loc de asta am izolat cauza prin eliminare, nu prin ipoteze: culoare complet plată →
benzile rămân; teren fără lumină deloc → benzile rămân. Deci nici culoare, nici iluminare.

**3. Am citit bufferul real din pagină.** Primele 17 vârfuri din fiecare rând erau **identice**:
`111.6 111.6 111.6 …`. Terase perfect plate de 16 m.

**4. Cauza era în zgomot, cu două niveluri mai jos.** `fbm` întorcea virgulă fixă Q10, deci
amplitudinea de 1800 dm se împărțea în 1024 de trepte: **rezoluția verticală a lumii era 17,6 cm**.
Cu eșantioane macro din 16 în 16 m, două vecine cădeau des pe aceeași treaptă — de aici terasele.
Q10 → Q14 face treapta **1,1 cm**, de 16 ori mai fină. Marginile de overflow verificate pe rând
(`smooth`: 2,7e8; `lerp`: 5,4e8; `fbm`: 5,4e8 — toate sub 2³¹). Aritmetica rămâne întreagă.

**Și aici e partea care merită reținută:** defectul (1) ascundea defectul (4). Media pe celulă era un
blur 2×2 care netezea exact terasele. **Două bug-uri care se anulau reciproc**, deci niciunul nu se
vedea. Reparat unul singur, ar fi arătat ca o regresie — și exact așa a arătat, timp de trei
măsurători.

### K16 a căpătat în sfârșit o cifră

Riscul numărul unu al arhitecturii era descris, nu măsurat. Acum e măsurat
(`node tools/seam-distribution.mjs`):

| convenția cotei | medie | \|medie\| | interval |
|---|---|---|---|
| veche: `floor(h)` | **+0,508 m** | 0,508 m | [0,01 · 1,00] |
| acum: `round(h) − 1` | **+0,005 m** | 0,249 m | [−0,49 · 0,50] |

Fața de sus a voxelului stătea cu **o jumătate de metru deasupra** suprafeței de heightfield, mereu
în același sens. Nepotrivirea pe celulă nu dispare — se înjumătățește — dar **își pierde semnul**: o
treaptă constantă se citește ca zid, un zgomot simetric se citește ca teren. Convenția trăia în patru
locuri, scrisă de fiecare dată ca `Math.floor(cm / 100)`, inclusiv într-un test care astfel verifica
doar că două copii ale aceleiași formule sunt de acord. Acum e o funcție, `groundLevelFromCm`.

### O paletă, o lege de lumină

Măsurat pe fixtură înainte de a schimba ceva (`node tools/mesh-composition.mjs`): **56,3% din
quaduri sunt pereți de treaptă de exact 1 m**, iar peretele avea aceeași culoare ca platoul de
deasupra, sub un `MeshBasicMaterial` care **nu primea deloc lumină**. La cusătura K16 săreau trei
lucruri unde e nevoie de unul: culoarea, modelul de iluminare și geometria.

Acum: o singură paletă în `src/render/palette.ts` pentru teren și voxeli; lateral, un bloc de iarbă
arată a pământ (iarba e un strat subțire deasupra); voxelii primesc aceeași lumină ca terenul, cu
normale axiale derivate din `faces` — gratis, fără `computeVertexNormals`, care pe cuburi ar media
colțurile și ar rotunji exact ce nu trebuie.

### Ce NU am făcut, și de ce

**N-am ales încă o metodă de netezire geometrică.** Judecătorul de cost a găsit că măsurătorile de
performanță ale propunerilor nu se susțin pe mașina asta: aceeași bucată de cod a dat **+46, −153 și
+28 µs/chunk** la trei rulări. Asta e sub pragul meu de reproductibilitate din `bench/GATE.md` §7
(CV > 10% ⇒ nu ai voie să compari). Deci întâi fundația și pasa de culoare, apoi o privire — și abia
după aia decizia despre geometrie, dacă mai e nevoie de ea.

### Re-etalonare, consemnată

Lumea s-a schimbat, deci cifrele fixturii nu mai sunt comparabile cu cele de ieri: 114.586 → 90.932
de quaduri **nu** înseamnă o optimizare, înseamnă altă lume. `bench/GATE.md` §3 poartă nota, cu data
și motivul. Nu e mutare de prag — niciun prag din §8 nu depinde de ele și niciun gate n-a rulat.

Hash de referință: `3876f59a` → `c3641ad5`. Oracolul reparat alaltăieri a prins schimbarea imediat;
acum trei zile n-ar fi clipit.

---

## Instrumentul de măsurare, și trei lucruri pe care le-a spus despre el însuși

**Prompt:** „Continua"
**Model:** Opus 5

Protocolul cere, înainte de orice cifră de gate, ca instrumentul să-și demonstreze că poate produce
roșu. Construindu-l, a produs roșu de trei ori — despre sine.

### 1. Benchmark-urile proiectului nu puteau detecta ce li se cerea

Judecătorul de cost al panoului de netezire a susținut că aceeași bucată de cod dă „+46, −153 și
+28 µs/chunk" pe mașina asta. Am verificat:

```
10 rulări, același cod, același proces:
444 389 414 493 434 430 366 416 395 405 µs/chunk   ⇒ CV 8,3%
```

Avea dreptate. Dar diagnosticul complet e altul: **mediana a 10 rulări, comparată între procese
separate**, dă 419,4 · 419,6 · 420,4 · 429,5 · 441,0 · 412,1 ⇒ **CV 2,5%**. Nu măsurătoarea era
imposibilă, ci protocolul de raportare era greșit.

`src/harness/measure.ts` raportează acum mediana, CV-ul și **diferența minimă detectabilă**, cu cinci
probe negative care verifică tocmai că poate spune „nedecis". Consecința imediată, pe care o scriu
pentru că a decis ceva: benchmark-ul **nu poate detecta sub 79 µs/chunk**, iar toate cele patru
propuneri de netezire pretindeau ~50 µs. Nu se putea alege între ele pe cost — nu din lipsă de date,
ci pentru că instrumentul nu ajungea acolo.

Și un detaliu care spune ce fel de greșeală e asta: măsurătoarea unică de ieri dădea 375 µs/chunk,
mediana dă 409. **Rularea unică raporta cazul cel mai bun.**

### 2. Ceasul browserului e tocit la exact 0,1 ms

Măsurat, nu presupus: cel mai mic delta nenul între două `performance.now()` consecutive e
`0,09999996 ms`. Fără izolare cross-origin, ceasul e tocit ca apărare împotriva Spectre. Deci nicio
cifră sub 1 ms din raport nu e credibilă, iar rezoluția bisecției (0,25 ms) e de doar 2,5× ceasul.
Scris în `bench/GATE.md` §6 ca limită declarată, nu descoperită la interpretare.

### 3. Garda mea cea mai importantă era scrisă pe jumătate

Am scris `checkGuards()` — și nu am chemat-o niciodată. Ascultam doar `visibilitychange`, ceea ce
ratează exact cazul care contează: fereastra **ascunsă de la început**, când nu se emite niciun
eveniment. Rularea părea că merge; contorul de cadre era zero, iar HUD-ul afișa „p99 = 9.815 ms".

**O gardă scrisă pe jumătate e mai rea decât niciuna, fiindcă arată ca o gardă.**

### Cine apasă pe buton

Consecința operațională, și nu e una plăcută: **nu pot executa eu măsurătoarea.** Într-un panou
ascuns sau nefocalizat `requestAnimationFrame` nu e apelat deloc — bucla nu încetinește, se oprește
— iar panoul de preview pornește ascuns și rulează în reluare lentă. Verificat: `document.hidden`
era `true` chiar în momentul în care credeam că măsor.

Deci rularea e o acțiune de om, de o comandă:

```
bench
uleaza-gate.cmd
```

Build de producție, server de preview, Chrome pe profil curat cu flagurile din protocol, iar la final
pagina **descarcă singură** un `.json` cu rezultatul și metadatele — inclusiv verdictul de validitate.
Fișierul e singurul lucru care supraviețuiește momentului.

### Ce e construit acum

`viewer/probe.ts`: două ceasuri distincte (interval de prezentare vs. muncă proprie, primul gatează,
al doilea e diagnostic), buffer prealocat fără alocări în bucla fierbinte, balast cu forma temporală
corectă (8 ms pe **un cadru din trei**, nu întins uniform), bisecția care dă X_max, gărzile de
invalidare și amprenta constantelor tipărită în raport ca să nu poată fi micșorate tăcut.

Sonda stă lângă viewer, nu în `src/harness/`, fiindcă are nevoie de DOM — iar `tsconfig.json` al
nucleului nu are `lib: DOM`, exact regula care ține `src/` portabil. Statistica și verdictul rămân în
afara browserului.

---

## Scenariile de gate, și probele care trebuie să iasă roșii

**Prompt:** „continua"
**Model:** Opus 5

### Gate-ul ar fi rulat pe fixtura greșită

Viewerul construia fortăreața de **12 chunk-uri**. Protocolul cere fixtura M10, de **225**. Un gate
rulat pe cea mică trece cu orice stivă — fals pozitiv prin construcție, exact ce semnalase un
judecător. Acum `?scenario=...` încarcă M10; verificat în pagină: 225 de chunk-uri promovate.

### Cele trei scenarii, pe șine

`?scenario=fortress|dig|traverse`. Camera merge pe traseu fix, cu oprire la număr fix de cadre — la
durată fixă, o configurație lentă parcurge alt traseu și compari două scene diferite. Excepția e
traversarea, care rulează pe **timp real**: cu pas fix, o configurație lentă primește mai mult timp
de perete pe metru, deci streamerul asincron arată mai bine decât va fi în joc.

### Probele negative

| probă | rezultat |
|---|---|
| A · draw calls | **CONFIRMATĂ** — 236 → **5.236**, geometrii +1. Roșu pe axa corectă și numai pe ea. |
| B · leak de geometrii | **CONFIRMATĂ** — 400 de cadre de traversare: 227 → **337** geometrii, la același număr de mesh-uri. 110 orfane. |
| C · stall de 120 ms | **neverificată** |

### De ce proba C n-a trecut, și ce am învățat din asta

Ca să verific probele fără `requestAnimationFrame` — care nu e apelat într-o fereastră ascunsă — am
extras `stepFrame()` și am pășit 700 de cadre sincron. Referința, **fără nicio probă**, a produs 30
de cadre peste 100 ms.

Înainte să dau vina pe cod, m-am uitat la valori: 100 · 116,7 · 133,3 · 150 · 167 · 183,5 ms.
**Toate multipli exacți de 16,67.** Sunt așteptări de vsync: `render()` într-o buclă strânsă umple
lanțul de buffere și browserul blochează până la următorul vsync.

Deci pășirea sincronă verifică **logica** — număr de draw calls, geometrii scurse, stare — și
**niciodată timpul**. Scris în cod, lângă funcție, ca să nu fie folosită greșit peste trei luni.

Consecință pentru protocol: instrumentul e **incomplet** până la prima rulare reală, iar §8 tratează
un instrument absent ca blocant pentru STAY, fără să producă singur FAIL.

### Ce rămâne de apăsat

```
bench
uleaza-gate.cmd fortress
```

Fereastră reală, nemimimizată. Fișierul `.json` se descarcă singur și spune, în el, dacă rularea a
fost validă.

---

## Limita mesher-ului, închisă — și CI-ul care n-a rulat niciodată

**Prompt:** „continua" · „am creat un repo pentru proiect"
**Model:** Opus 5

### Fețele de la granița de chunk

Erau declarate în cod ca limită cunoscută de la S6-8. Măsurat pe fixtura M10:
**779.888** de fețe de graniță, din care **674.582 (86,5%)** ascunse de un vecin promovat.

**Prima măsurătoare a fost greșită și o scriu ca să nu se repete.** Numărasem pe *quaduri* și ieșea
0,2% — un quad unit lacom e „complet ascuns" doar dacă **toate** celulele din spate sunt solide,
măsură mult prea optimistă. Consultarea vecinului taie fețele **înainte** de unire, deci unitatea
corectă e fața de celulă.

| | |
|---|---|
| câștig | **−5,3% quaduri** (90.932 → 86.071), exact și determinist |
| cost | 398 → 409 µs/chunk, DMD 42 µs ⇒ **nedecis** |

Costul a ieșit „nedecis" pentru că l-am măsurat cum trebuie: mediane în **procese separate**. În
același proces ieșea CV 12,4% și instrumentul a refuzat comparația — exact pentru asta fusese scris
ieri.

### Testul era vid, și am aflat prin mutație

Prima variantă a testului „nu șterge fețe care chiar se văd" avea un `if` care îl oprea înainte de
`assert`. **Tăierea necondiționată — adică găuri peste tot — trecea prin el.**

Rescris ca invariant complet pe tot planul de graniță, în ambele sensuri: vecin solid ⇒ fața **nu are
voie** desenată; vecin aer ⇒ fața **trebuie** desenată. Acum pică la toate trei mutațiile:
taie-mereu, nu-tăia, ignoră-decalajul-de-`zBase`. Plus un test pe **toată** fixtura — 225 de
chunk-uri, peste 50.000 de celule de graniță. O gaură într-un singur chunk din 225 arată pe ecran
exact ca bug-ul de winding din sesiunea 2, și s-ar găsi greu privind.

Prețul real nu e în cod, e în **invalidare**: o săpătură pe marginea unui chunk trebuie să
re-meshuiască și vecinul.

### CI-ul a rulat prima dată, și a picat în 21 de secunde

Andrei a creat repo-ul. `.github/workflows/ci.yml` exista de la commit-ul S1-2 și **nu rulase
niciodată**, fiindcă nu exista remote. Primul push l-a pornit și a căzut pe cea mai simplă comandă
din el: `node --test tests/` merge pe Node 26 (local) și încearcă să rezolve `tests` ca **modul** pe
Node 24 (CI).

Nu defectul contează, ci ce dovedește: **era un fișier care arăta a verificare.** Exact tiparul pe
care îl combate tot protocolul de gate, găsit în propria infrastructură.

Golul nr. 5 din `bench/GATE.md` §12 e închis: commit-urile de pre-înregistrare au acum o dată emisă
de alt sistem. `GIT_COMMITTER_DATE` se falsifică într-o secundă; un timestamp de GitHub Actions nu.

---

## S9-11: regiuni și reachability — și un defect de arhitectură scos la iveală de ele

**Prompt:** „la grafica vom tot lucra, continua cu ce mai poti"
**Model:** Opus 5

Gate-ul e blocat pe o rulare pe care n-o pot face eu, iar grafica rămâne un workstream în curs. Ce e
complet neblocat **și** imun la decizia de motor e `src/sim/` — exact codul pe care protocolul îl
numește ca fiind sigur de scris cât timp D1 e deschis.

### De ce regiunile înaintea agenților

Research-ul pe Going Medieval e neechivoc: pathfinding-ul 3D multi-agent a fost rescris de patru ori
în cinci ani într-un studio de zece oameni și e declarat și azi, după 1.0, problema numărul unu.
Semnalul de alarmă citat: **FPS-ul scade când construiești un zid, nu când adaugi pioni** — adică 15
pioni caută simultan un drum inexistent. Un A* care *eșuează* e cel mai scump lucru din joc.

Trei invarianți, toți din research, toți verificați:

1. **O regiune nu traversează un bloc de 16×16.** Granița e cunoscută dinainte, deci recalcularea e
   locală.
2. **O regiune e plată** — stă pe un singur nivel z. Legăturile verticale sunt muchii în graf, nu
   celule în regiune; altfel un pas de scară ar fuziona două etaje și reachability-ul ar minți în sus.
3. **Reachability e separat de cost.** Răspunde „există vreun drum?" în O(1), nu „care e cel mai
   scurt". Falsul pozitiv e acceptat deliberat și scris în antetul modulului: *nu* e definitiv, *da*
   înseamnă „poate", iar A*-ul rămâne autoritatea.

### Ce au scos la iveală: promovarea SCHIMBA lumea

Testul de zid a picat pentru că nu găsea nicio celulă pe care să se stea. Urmărind de ce, am ajuns la
ceva care n-avea legătură cu regiunile:

```
materialAt înainte de promovare:  PAMANT
materialAt după promovare:        APA
```

**25% din celulele de suprafață își schimbau materialul în clipa promovării.** Calea derivată nu avea
ramura `z === groundM`, deci nu știa de apă; cea promovată o avea. Adică „ne-promovat = cache" era
fals — cache-ul răspundea altceva decât datele.

Nicio suită de teste nu l-ar fi prins: **hash-ul acoperă numai chunk-urile promovate**, deci nu poate
compara cele două căi prin construcție. A ieșit la iveală doar pentru că sistemul de regiuni a
întrebat „se poate sta aici?" înainte și după promovare și a primit două răspunsuri. Exact tiparul din
research: *sistemele astea sunt invizibile — typecheck verde, teste verzi, joc rupt.*

Reparat la sursă: materialul de suprafață se calculează **o dată**, la generare, în `chunk.surfaceMat`,
și îl folosesc amândouă căile. Verificat pe 32.768 de celule în patru biomuri: **zero diferențe**.
Invariantul e acum un test.

Consecințe în lanț, toate corecte: nu se mai poate săpa în apă, deci scenariul standard își alege
siturile pe uscat, iar testul de save sapă un nivel sub suprafață. Hash de referință:
`c3641ad5` → `69cb5da3`.

Și o urmă ștearsă: `promote(seed, chunk)` nu mai are nevoie de seed — materialul vine din chunk.
Un parametru mort lăsat „pentru compatibilitate" e o urmă care derutează peste trei luni.

### Costul, măsurat, nu presupus

Suita de teste a sărit de la 3 la **54 de secunde** în clipa în care regiunile au început să întrebe
des: fiecare interogare de suprafață costa un `sampleMacro`, adică trei apeluri de fBm. Cu patch-ul
cache-uit pe chunk: **22 s**, din care 22,6 s e fuzz-ul singur.

Iar fuzz-ul spune ceva ce nu voiam să aud (`node tools/bench-regions.mjs`):

| blocuri rezidente | o reconstrucție |
|---|---|
| 44 | ~25 ms |
| 94 | ~30 ms |
| 171 | ~34 ms |

Bugetul unei săpături e sub 1 ms. **Reconstrucția completă e cu peste 30× peste** și n-are ce căuta
sincron în cadrul în care jucătorul a dat click. Merge acum fiindcă nu există încă agenți care să
întrebe — și e scris în cod, cu cifra, tocmai ca să nu treacă drept „destul de rapid" la S12-15.
Pragul la care devine obligatorie etichetarea incrementală: **primul agent care cere un drum.**

