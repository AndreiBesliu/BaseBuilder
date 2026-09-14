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

