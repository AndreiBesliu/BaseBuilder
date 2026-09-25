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
- ~~**CI-ul n-a rulat niciodată**~~ **ÎNCHIS (reconciliat 25.09):** remote-ul e `AndreiBesliu/BaseBuilder`, CI rulează la fiecare push, verde pe ambele joburi, cu hash-ul de referință reprodus pe runner. *Era:* `git remote -v` e gol. Pre-înregistrarea prin commit-uri locale
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

---

## Overlay-ul de regiuni, și ce a găsit în prima privire

**Prompt:** „ok continua"
**Model:** Opus 5

Research-ul e explicit: *„sistemele astea — regiuni, rezervări, job selection — sunt INVIZIBILE:
typecheck verde, teste verzi, joc rupt. Semnalul: nu ai un debug overlay. Construiește overlay-urile
în aceeași zi cu sistemele, nu după."* Tocmai demonstrasem prima jumătate — regiunile au găsit un
defect de arhitectură pe care nicio suită nu-l putea prinde. Asta e a doua jumătate.

**G** desenează fiecare celulă pe care se poate sta, colorată după componenta ei conexă. Aceeași
culoare = se poate ajunge dintr-una în alta. Culori diferite = nu există drum. Un zid care închide o
cameră se vede instantaneu, fără să ai încredere în nimic.

### Prima privire a arătat o bandă subțire de contur

Nu o suprafață. Și nu era un defect de desen: `ensureArea` acoperea `z ± maxStepM`, adică **trei
niveluri fixe**. Pe o coastă, asta prinde doar celulele al căror sol nimerește exact acele niveluri —
un contur.

Consecința reală e mult mai mare decât overlay-ul: **un agent care urcă un deal traversează multe
niveluri.** Cu modelul vechi, reachability-ul ar fi răspuns „nu există drum" pe orice pantă, iar
cauza s-ar fi căutat în pathfinding, unde nu era.

Corectat: regiunile **urmează suprafața**. Pentru fiecare bloc se citește intervalul lui de cote din
relief și se acoperă de acolo, plus o adâncime pentru camerele săpate. După corecție: **17.404 celule
· 10 componente · 73 ms**, o culoare dominantă pe toată suprafața traversabilă și o componentă
separată dincolo de apă — adică exact ce trebuie să arate.

Niciun test nu l-ar fi prins, fiindcă toate testele mele interogau puncte pe care le alesesem eu, pe
teren pe care îl alesesem eu. Overlay-ul nu alege.

---

## D1b: criteriul pe care D1 și-l declară singur, măsurat pe jumătate

**Prompt:** „continua"
**Model:** Opus 5

Cât rulează panoul despre mesher-în-worker, am atacat golul nr. 2 din `bench/GATE.md` §12 — și e
golul care contează cel mai mult, fiindcă **D1 nu se poate închide fără el**: PLAN.md declară
ergonomia UI-ului dens drept ~70% din UX-ul genului și criteriul rămas al deciziei de motor. Era
nemăsurat în *toate* cele trei motoare — avocatul Unity a dat o anecdotă de forum, ceilalți doi au
spus onest „n-am găsit o cifră publicată".

`viewer/panel-dens.ts`, pornit cu `?d1b=1`: 40 de pioni × 25 de coloane + 300 de stocuri = **1.300 de
celule live la 20 Hz**, în același cadru cu randarea.

**Măsurat: 0,336 ms medie, 1,70 ms maxim**, față de bugetul de 1,5 ms din §2.

### Și de ce nu scriu asta ca victorie

Sunt **două limite inferioare suprapuse**, și amândouă trebuie spuse înainte de cifră, nu după:

1. **E DOM țintit, nu React.** Am scris ce ar scrie cineva care vrea să treacă: structură fixă, zero
   noduri create sau distruse, scriere doar unde s-a schimbat ceva. Un panou React cu 1.000 de
   componente la 20 Hz e alt număr, aproape sigur mai mare. Asta măsoară **podeaua** stivei de UI din
   browser — dacă podeaua nu încape, niciun framework n-o repară, toate construiesc peste ea.
2. **Cronometrul acoperă doar scrierea în DOM.** Recalcularea de stiluri, layout-ul și desenarea se
   întâmplă mai târziu, în faza de randare a browserului, în afara ferestrei măsurate. **E exact
   aceeași clasă de eroare ca `CPU_busy` măsurat în rAF, care nu vede procesul GPU** — greșeala pe
   care protocolul o interzice explicit la §1, făcută de mine două zile mai târziu în alt loc.

Costul întreg se vede o singură dată: în intervalul de **prezentare** al unei rulări reale, cu și
fără `?d1b=1`. De aceea `bench
uleaza-gate.cmd` primește acum un al doilea argument, `d1b`, care
pornește ablația. Unity rămâne complet nemăsurat și blochează mai departe închiderea lui D1 — asta nu
se schimbă fiindcă am măsurat jumătate din partea mea.

---

## Panoul despre worker a răspuns „nu construi workerul" — și a găsit trei lucruri în fișierele mele

**Prompt:** „continua"
**Model:** Opus 5

Am întrebat *cum* se mută mesher-ul într-un worker. Ambii judecători au răspuns **nu acum**, cu
argumente pe care le-am verificat unul câte unul. Dar valoarea panoului n-a fost răspunsul la
întrebare — a fost ce a găsit citind.

### Protocolul meu derapase, exact în felul împotriva căruia fusese scris

| ce | ce spunea | ce e |
|---|---|---|
| §3 vs. §5/§9, meshing complet | **105 ms** și **84,5 ms** pentru aceeași măsurătoare | diferență de 20,5 ms, **peste DMD** |
| §3, memorie RLE | 2,64 MB | 2,34 MB |
| §10(a), bugetul de streaming | listat ca **optimizare disponibilă** | **implementat de mine acum două zile** |

Primele două sunt cifre învechite. **A treia e altceva.** §8.4 acordă fereastra GREY tocmai dacă
lista de optimizări necheltuite acoperă golul — deci documentul putea cumpăra **o amânare nemeritată
pe o economie deja cheltuită.** Nu o scăpare de întreținere: un mecanism de auto-indulgență, în
documentul scris anume ca să prevină auto-indulgența.

N-am găsit-o eu. A găsit-o un panou căruia i-am dat documentul să-l citească.

Corectat în commit separat, cum cere antetul. Și, fiindcă frecvența spune mai mult decât fiecare
derapaj în parte — **un document care conține cifre se învechește exact ca un cache fără
invalidare** — verificarea e acum mecanică: `tools/check-gate-numbers.mjs` rulează fixtura, compară
cifrele din §3 cu măsurătoarea, refuză ca aceeași măsurătoare să apară cu două valori, și refuză o
optimizare listată ca disponibilă dacă e implementată. În `npm run check` și în CI.

### Două bug-uri de cod, tot din citit

1. **S-DIG măsura mai puțină muncă decât face jocul.** `promotedBefore` se calcula *după*
   `applyCommand`, deci conținea și chunk-urile tocmai promovate — apron-ul nou nu-și primea
   niciodată primul mesh. Un scenariu de **gate** care măsoară altceva decât crede.
2. **Un click costa peste 150 ms.** Commit-ul de overlay chema `rebuildDirty` pe fiecare editare, iar
   ăla reconstruiește toate blocurile rezidente — cu overlay-ul pornit, ~735. Zece cadre pierdute la
   fiecare săpătură, introduse de mine cu două ore înainte.

### Și verdictul despre worker

Nu se construiește acum. Motivul, pe scurt: câștigul lui e pe streaming, unde e **sub rezoluția de
0,25 ms a propriei bisecții**, iar riscul lui e pe editare, unde soluția corectă e să nu intre deloc.
Judecătorii au numit și cifra care ar schimba decizia, și e măsurabilă **azi, în browser**, nu pe
hardware inexistent: p99 al costului de teren pe cadrele care *construiesc*, în S-TRAVERSE la
întoarcere. Dacă depășește ~1,5 ms — peste 20% din bugetul de 7,17 ms — workerul devine itemul care
închide golul.

Până atunci există lucruri mai ieftine și mai sigure: `computeVertexNormals` costă **115,9 µs pe
chunk** și se poate elimina fără worker, iar indicii de heightfield sunt identici între chunk-uri și
pot fi o constantă. Amândouă intră în lista de optimizări necheltuite din §10, ca **itemi noi** — nu
ca reciclare a unuia deja cheltuit.

---

## Două optimizări fără worker, și o măsurătoare pe care n-o pot revendica

**Prompt:** „Continua"
**Model:** Opus 5

Panelul spusese: până la worker există lucruri mai ieftine și fără concurență. Le-am făcut pe
amândouă, în `src/render/heightfield.ts`.

**Normalele, analitic.** Pe o grilă regulată, `computeVertexNormals()` face muncă inutilă: parcurge
toate triunghiurile, calculează produsul vectorial, adună în vârfuri, normalizează. Panta se citește
direct din diferențele de înălțime ale vecinilor — și iese și mai netedă. La margine se folosește
diferența unilaterală, fiindcă vârful de dincolo aparține chunk-ului vecin.

Riscul era o **cusătură de lumină** la granițe, care ar fi arătat exact ca bug-ul de winding din
sesiunea 2. M-am uitat: nu există. Dacă apare vreodată, leacul e un inel de apron în `vertexCm`, nu
o întoarcere la `computeVertexNormals` — scris lângă cod, ca să nu se redescopere.

**Indicii, un singur buffer.** Topologia unei grile regulate nu depinde de conținut, deci toate
chunk-urile produceau exact aceiași indici. Verificat, nu presupus: **24 KB × 377 de chunk-uri
rezidente = 8,8 MB** de indici identici, alocați și ținuți degeaba. Cifra asta e exactă.

### Ce nu pot revendica

Am încercat să măsor câștigul de timp per chunk și **instrumentul a refuzat**: CV între 47% și 56%,
adică „NU COMPARA". Zgomotul depășește efectul. Așa că nu scriu o cifră per chunk.

Ce pot spune, și e altceva: **construcția inițială a celor 377 de chunk-uri** a dat 82, 97, 110 și
82 ms, față de 127, 130, 139, 150, 157, 176, 180 și 185 ms în toate citirile anterioare din sesiune.
Intervalele **nu se suprapun**. Nu e un A/B controlat — s-a schimbat și alt cod între timp, inclusiv
lumea — dar e consistent cu eliminarea unei treceri per chunk și a 8,8 MB de alocări.

Amândouă intră în §10 ca itemi **deja cheltuiți**, nu ca economii disponibile. Și, ca să nu se
întâmple iar ce s-a întâmplat cu bugetul de streaming, `tools/check-gate-numbers.mjs` le cunoaște
acum pe nume: dacă vreuna reapare vreodată în lista de optimizări disponibile, CI-ul pică.

---

## Regiuni incrementale — pragul pe care mi-l scrisesem singur

**Prompt:** „continua"
**Model:** Opus 5

Scrisesem în cod, cu cifră: *„pragul la care etichetarea incrementală devine obligatorie: primul
agent care cere un drum."* Agenții sunt următoarea felie. Deci acum, nu după.

### De ce costa 30 ms

`rebuildDirty` arunca **toate** celulele rezidente și le recalcula. Nu din neglijență — din
constrângere: **un union-find nu poate desface o unire**, deci după o săpătură care rupe o legătură,
singurul rezultat corect era reconstrucția totală.

Înlocuit cu un **graf de adiacență explicit** plus re-etichetare prin parcurgere. Partea scumpă sunt
celulele (`isWalkable` peste 256 de celule × niveluri); partea ieftină e eticheta de componentă, care
e o plimbare peste întregi. Deci celulele rămân pe loc și se re-etichetează tot.

Două detalii care nu erau evidente:

- **Id-urile de regiune devin monotone, nu se reciclează niciodată.** Cu reciclare, un bloc
  nemodificat ar putea arăta spre un id care între timp înseamnă altceva — și asta ar arăta ca un bug
  de reachability, nu ca unul de contabilitate.
- **Se ating și vecinii blocurilor murdare.** O muchie există doar între blocuri orizontal vecine,
  deci orice regiune cu o muchie către un bloc murdar trăiește într-un vecin al lui. Fără asta rămân
  cioturi către id-uri dispărute, iar `areConnected` ar răspunde „da" pe o legătură care nu mai
  există — exact falsul pozitiv pe care antetul modulului îl declară inacceptabil în direcția aia.

### Rezultatul, și de ce forma contează mai mult decât cifra

| blocuri rezidente | înainte | acum |
|---|---|---|
| 85 | — | **3,3 ms** |
| 264 | — | **2,9 ms** |
| 600 | — | **2,8 ms** |

Vechea implementare creștea cu rezidența: 25 → 30 → 34 ms la 44 → 94 → 171 de blocuri. Asta nu mai
crește deloc. **Aia e definiția lui „incremental"** — costă cât s-a schimbat, nu cât există. Fuzz-ul
de 10.000 de editări a scăzut de la 22,6 s la 2,57 s.

Nu e „gata", și scriu asta lângă rezultat: 2,8 ms e tot peste bugetul de sub 1 ms al unei săpături.
Și mai e o limită pe care o las scrisă ca să nu fie descoperită la luna 12: `relabel` parcurge toate
celulele rezidente ca să afle ce regiuni trăiesc, deci **partea aia încă scalează cu rezidența**. La
600 de blocuri nu se vede; la discul complet ar fi milioane de celule. Leacul, când va fi nevoie, e
un index de regiuni vii întreținut la scriere, nu o parcurgere la citire.

### Și un test care încetase să însemne ceva

Fuzz-ul verifica `find(find(x)) === x` — semantica de union-find. După schimbarea de model, `find`
întoarce o etichetă de componentă, iar aserțiunea aia nu mai însemna nimic. **Un test care nu mai
înseamnă nimic trece exact la fel de bine ca unul care înseamnă.**

Rescris ca **oracol independent**: se reface partiția cu un flood propriu peste graful de adiacență
și se compară cu etichetarea. Nu o adaptare a vechii aserțiuni la noul model — o verificare care nu
folosește codul testat.

---

## S12-15: pathfinding în două straturi, și un refuz de 0,5 µs

**Prompt:** „fa altceva singur"
**Model:** Opus 5

Am reluat raționamentul de la capăt, nu din concluzii parțiale: stare curată, CI verde, agenții încă
plimbarea aleatoare. Deci următoarea felie din plan e S12-15 — și e exact ce fundația de regiuni a
fost construită ca să suporte.

### Ordinea operațiilor *este* algoritmul

Research-ul e neechivoc și a costat pe alții cinci ani: *graf de regiuni peste A\* local, de la
primul commit.* Going Medieval l-a rescris de patru ori și îl declară și azi, după 1.0, problema
numărul unu.

Deci: **întâi se întreabă graful** — o citire de etichetă de componentă, O(1). Dacă zice nu, nu se
pornește niciun A\*. Abia apoi A\* peste regiuni dă un *coridor*, iar A\*-ul pe celule caută doar
înăuntrul lui.

| | cost măsurat |
|---|---|
| drum lung, 109 celule | ~380 µs · 109 noduri explorate |
| **refuz** | **~0,5 µs** |

**De ~700× mai ieftin.** Asta e toată justificarea stratului de regiuni, și e exact semnalul de
alarmă din research: *„FPS-ul scade când construiești un zid, nu când adaugi pioni"* — adică 15 pioni
căutând simultan un drum inexistent.

Un detaliu care m-a bucurat: pe teren deschis, A\*-ul explorează **exact** atâtea noduri câte are
drumul. Cu cost uniform, euristica Manhattan e exactă, deci căutarea nu rătăcește deloc.

### Motivele unui refuz sunt informație de joc

- `INACCESIBIL` — nu există drum. Un zid, o prăpastie.
- `OCUPAT_DE_OSTIL` — drumul **există**, dar e blocat. Ăsta e D7c: un raider în coridor nu îngheață
  colonia, produce un mesaj pe care jucătorul îl poate rezolva.
- `BUGET_DEPASIT` — prea scump **acum**, nu imposibil. Confuzia dintre astea două e exact felul în
  care un pion se blochează pe viață.

### Două teste care nu dovedeau ce credeam

Le-am prins supunând codul la mutații, cum am făcut și cu oracolul de determinism:

1. **„același drum de două ori" trecea și cu departajarea din coadă SCOASĂ.** Într-un singur proces,
   un heap e determinist oricum — ordinea din tablou e ea însăși deterministă. Testul nu dovedea
   nimic despre ce credeam că dovedește. Înlocuit cu unul care inserează aceleași elemente în **două
   ordini diferite** și cere aceeași ieșire.
2. **„agenții proprii scumpesc drumul" asertase `cost >= cost`** — adevărat trivial când penalizarea
   lipsește. Acum cere ca penalizarea să *schimbe* ceva: ori drumul ocolește, ori costă strict mai
   mult.

Toate patru mutațiile pică acum. Și o fixtură care era greșită: zidul din testul D7c avea 32 de
celule într-o zonă calculată de 64, deci drumul îl ocolea pe la capete — **testul pica pe fixtură, nu
pe cod.** Acum testul dovedește întâi că poarta e singurul drum, și abia apoi pune ostilul în ea.

### Și o datorie plătită

`relabel` parcurgea toate celulele rezidente doar ca să afle ce regiuni trăiesc — limita pe care o
scrisesem eu în cod ca viitoare prăpastie. Pathfinding-ul avea oricum nevoie de maparea regiune→bloc,
iar cheile ei *sunt* indexul de regiuni vii. Reconstrucția costă acum 2,9 ms la 85, 264 **și** 600 de
blocuri — perfect plat.


---

## Task Started — S12-15: agenții merg pe drumuri reale

**Prompt:** „continua" (sesiune de continuare autonomă a planului)
**Model:** Claude Opus 5

Substitutul care se plimba aleator iese. Agenții își aleg o țintă, cer un drum prin sistemul
de două straturi și îl parcurg. Ce a ieșit la iveală făcând asta e mai interesant decât felia.

### Trei defecte, toate ascunse unul sub altul

**1. Lumea avea două mărimi.** `rules.worldWidthCells = 256` pentru agenți, 16384 de celule pentru
teren. Nimic nu le compara, așa că au divergat tăcut din S3. S-a văzut abia când agenții au început
să se nască pe sol: siturile de săpat sunt împrăștiate pe toți cei 16 km, iar `spawnAgent` le refuza
pe toate cu `IN_AFARA_LUMII`. Mărimea lumii nu e un număr de gameplay — o determină harta macro —
deci a ieșit din `content/rules.json` și a devenit DERIVED.

**2. Agenții se năşteau la z = 0, cu solul la −70 m.** Pluteau în aer, nu ajungeau în nicio regiune,
deci fiecare cerea o reconstrucție completă de regiuni la **fiecare tick, pe veci**. 200 de tickuri
nu se terminau în două minute. Regula pe care o încalcă: *un agent care nu poate face nimic nu are
voie să coste nimic.*

**3. Poziția avea două reprezentări care se schimbau la momente diferite.** `x`/`y` alunecau continuu
în milimetri, `z` se aplica discret, la sosire. Pe teren plat mergea. Pe o pantă, `cellOf(x)` trecea
granița cu un tick înaintea lui `z`, și în tickul ăla tripletul agentului arăta **celula nouă la cota
veche** — o celulă plină cu piatră, deci fără regiune. Poarta de la începutul lui `stepAgents` îl
oprea, și fiindcă era oprit nu mai ajungea niciodată să se alinieze. **Blocat pe viață, la șapte
celule de unde pornise.** Nu era un defect de pathfinding: drumul era corect.

Simularea mișcă acum din centru în centru, atomic, cu un `progresMm` persistat. Interpolarea netedă
rămâne treaba randării — ceea ce e și politica („fără float în starea de simulare"), nu o comoditate.

### Măsurătoarea: 12989 → 32 µs/tick

Prima cifră onestă, după ce agenții au ajuns pe sol, a fost **12989 µs/tick**. Cei 1306 µs/tick de
dinainte măsurau agenți care nu făceau nimic.

| pas | µs/tick (1000 t) | ce era |
|---|---|---|
| agenți pe sol, prima măsurătoare | 12989 | — |
| `voxelAt` merge pe runs | 6741 | aloca un `Uint8Array` de 64 și desfăcea toată coloana pentru **un octet** |
| legarea blocurilor, memoizată | 311 | `ensureArea` re-deriva fiecare muchie la fiecare cerere |

Pe 100.000 de tickuri, scenariul standard costă acum **32,4 µs/tick** (3236 ms). Hash-ul de referință
din CI: `69cb5da3` → `555d90da`.

**Cum s-a găsit.** Pe timp *propriu*, profilul arăta o mulțime de interogări de teren fără niciun
vinovat: `decodeColumn` 20,5%, `locate` 11,6%, `ensureChunk` 10,9%. Pe timp *inclusiv*, răspunsul era
o singură linie: `ensureArea` 88,5%, din care `linkBlock` 80,2% — în timp ce `computeBlock` era la
3,1%. **Nu se calcula nimic nou; se relega același lucru la nesfârșit.** Cele două unelte sunt acum
în `tools/prof-propriu.mjs` și `tools/prof-inclusiv.mjs`.

Și o ipoteză a mea, greșită: crezusem că acoperirea de regiuni crește la nesfârșit, fiindcă 400 de
tickuri costau 3562 ms și 1000 costau 12989 — de 2,5× tickurile, de 3,65× timpul. Măsurat direct,
acoperirea se stabilizează la 5282 de blocuri după tickul 200 și costul e **plat**. Comparația era
confundată de construcția inițială.

### Mutațiile, din nou

Cele trei teste de memoizare au trecut toate verzi cu `ensureBlock` **scos** din bucla de vecini a
lui `linkBlock` — adică exact mecanismul prin care memoizarea putea pierde o muchie. Motivul: comparau
două magazine construite în ordini diferite, deci o mutație care le strică pe amândouă la fel le e
invizibilă. **Un test care compară codul cu el însuși nu e un oracol.** Adăugate două care nu depind
de o a doua rulare a aceluiași cod: unul cere ca orice pereche de celule între care `canStep` spune
că se poate păși să fie în aceeași componentă, celălalt verifică marginea acoperirii. Al doilea prinde
mutația.

Testul de acceptanță (40 de agenți, 100k tickuri) pică la 11 ținte atinse din 200 dacă reintroduc
defectul cu `z`.

### Contracte schimbate

`fiecare agent viu consumă exact o tragere pe tick` era adevărat despre plimbarea aleatoare. Agenții
care merg pe drumuri trag numai când își **aleg** o țintă. Rescris în două invarianți care
supraviețuiesc substitutului: un agent care nu poate face nimic consumă zero, iar consumul e mărginit
de reguli, nu de teren. Fereastra primei versiuni era de 30 de tickuri — mai scurtă decât un drum —
deci măsura zero pentru ambele lumi și ar fi trecut verde fără să compare nimic. Garda „fixtura e
vidă" a prins-o.

Reparat în trecere: `spawnAgent` nu reseta ținta la reutilizarea unui slot, deci un agent nou se
năștea cu ținta mortului.

## Task Completed

133 de teste verzi, `npm run check` curat. Rămâne: randarea agenților (viewerul nu-i desenează încă),
și interpolarea lor între centre, care are tot ce-i trebuie în `progresMm` + drum.

---

## Task Started — agenții, pe ecran

**Prompt:** „continua" (aceeași sesiune)
**Model:** Claude Opus 5

Viewerul avea o lume, dar nu i-a dat niciodată `tick`: importa `createWorld` și atât. Săpăturile și
zidirile se vedeau fiindcă sunt comenzi, nu simulare. **Oamenii nu s-au mișcat niciodată pe ecran.**

Acum: 24 de agenți lângă fortăreață, pas fix de 20 Hz, capsule instanțiate, colorate pe facțiune.
Randarea interpolează între centre din `progresMm` + drum + fracțiunea de tick scursă — simularea
rămâne discretă, fiindcă are motiv să fie.

Agenții rulează **numai la privit liber**, niciodată în scenariile de gate: un tick de simulare în
bucla măsurată ar schimba tăcut ce măsoară protocolul pre-înregistrat.

Două lucruri prinse uitându-mă:
- Capsulele ieșeau negre. `vertexColors: true` pune materialul să caute un atribut de culoare pe
  **geometrie**; în three 0.186 culoarea per-instanță vine din `instanceColor` și e de ajuns singură.
- Argumentasem că `voxelAt` rescris pe runs e echivalent cu `decodeColumn`. Argumentul era corect,
  dar `voxelAt` e folosit **și de mesher** — o greșeală acolo nu s-ar fi văzut ca un număr greșit, ci
  ca teren greșit. Acum e dovedit pe 100.000+ de comparații, inclusiv sub și peste intervalul
  acoperit; mutația `<` → `<=` îl pică.

**Rămas deschis, vizual:** pete întunecate plate, la pasul grilei macro, pe pantă. Verificat și
exclus: nu sunt găuri (fundalul nu trece prin ele), nu sunt normale întoarse (toate 377 de chunk-uri
au normala în sus), nu sunt culori de vârf închise (luminanța medie e între 0,26 și 0,39 la toate),
nu sunt mesh-uri străine (377 de chunk-uri + un singur InstancedMesh). Și nu vin de la felia asta.

## Task Completed

134 de teste verzi.

---

## Task Started — petele întunecate: erau găuri

**Prompt:** „continua" (aceeași sesiune)
**Model:** Claude Opus 5

Lăsasem deschis: pete întunecate plate pe pantă, cu trei explicații verificate și excluse. **Una dintre
excluderi era greșită, și exact aia conta.**

Scrisesem „nu sunt găuri (fundalul nu trece prin ele)". Testul meu pusese `scene.background` pe un
obiect gol în loc de `null` — deci nu schimbase culoarea de ștergere deloc, ci doar stricase randarea.
Refăcut corect: **petele devin magenta.** Erau găuri.

De acolo, prin eliminare: ascunzând cele 12 mesh-uri de voxeli, tot solul vizibil devine magenta —
deci toată zona e promovată și găurile sunt în mesh-ul de voxeli. Cu `side = DoubleSide` dispar. Deci
înfășurare inversată: fețe dorsale, eliminate de culling.

**Cauza.** Regula de înfășurare din viewer era o constantă — „direcțiile pozitive se inversează, cele
negative rămân" — dedusă analitic pentru fața de SUS și aplicată tuturor șase. Pentru majoritatea
quadurilor era corectă. Pentru fețele de pe axa Y, nu. Alea sunt contratreptele terenului voxelizat pe
pantă, ceea ce explică și tiparul: pete regulate, numai pe coastă.

Acum înfășurarea se **calculează** din geometrie (`src/render/winding.ts`): produsul vectorial al
primului triunghi, comparat cu normala axială, care se știe exact din direcția feței. Costă două
scăderi și un produs vectorial per quad, o dată la construirea geometriei, și e corectă prin
construcție oricât s-ar schimba mesher-ul.

Testul nou verifică **fiecare** quad al unui chunk cu cameră săpată și zid construit, și cere explicit
ca toate cele șase direcții să apară în fixtură. Cu regula veche pusă la loc, pică pe quadul 70, fața
`Y_POS`, cu dot −1,000 — exact invers.

**Lecția, a doua oară în aceeași sesiune:** trei explicații plauzibile excluse nu valorează nimic dacă
una dintre excluderi se sprijină pe un instrument stricat. Verdele minte, roșul minte, și „am verificat
că nu e asta" minte la fel de ușor.

## Task Completed

135 de teste verzi.

---

## Task Started — așezarea liberă a clădirilor: partea care se poate dovedi

**Prompt:** „continua" (aceeași sesiune)
**Model:** Claude Opus 5

A doua jumătate din ce ai cerut lângă spike. M-am uitat întâi în PLAN.md, și bine am făcut:
**D19 e închisă și unanimă pe toate trei lentilele**, iar textul ei spune exact „grila de 1 m e
universală ca sistem de coordonate **și de coliziune**… «organicul» exclusiv în prezentare".

Așezarea liberă în *simulare* ar răsturna-o tăcut. Așa că n-am mutat coliziunea. Am mutat **poza**:
o clădire primește centru în milimetri și orientare liberă; ce se desenează e dreptunghiul rotit
adevărat, ce se simulează sunt celulele pe care le acoperă. Asta e D20, scrisă în PLAN.md ca
**deschisă** — nu e decizia mea de luat.

### Orientarea nu e un unghi

E un vector unitate Q14. `Math.cos` nu e garantat bit-exact între motoare JS, deci un unghi ar
însemna că aceeași lume dă amprente diferite pe mașini diferite. Cine cheamă îl calculează din
unghiul mouse-ului cu ce vrea; până ajunge în simulare sunt doi întregi, iar simularea nu atinge
niciodată trigonometrie. Un vector nenormalizat primește **refuz cu motiv**, nu un boolean.

### Riscul nu e estetic. E că zidul curge.

Un zid rotit poate arăta continuu pe ecran și să aibă goluri în grilă — agenți care trec prin
pereți, dintr-o cauză pe care n-ai găsi-o niciodată privind zidul. Deci regula de acoperire nu e o
preferință, e decizia care ține tot:

| regulă | ce face | rezultat |
|---|---|---|
| **ORICE atingere** | celula intră dacă e atinsă cât de puțin | **etanș la toate unghiurile 0–180°** |
| **centrul celulei** | celula intră dacă centrul ei e înăuntru | **curge** |

Al doilea are și un caz catastrofal: un zid de 0,2 m așezat exact pe o graniță de celulă blochează
**zero** celule. Arată ca un zid, nu oprește pe nimeni, și nimic nu se plânge.

Testul de etanșeitate are proba negativă lipită de el: dacă `CENTRU` n-ar curge niciodată, „etanș"
n-ar dovedi nimic — ar putea fi adevărat din întâmplare, pentru orice regulă.

### Cât costă etanșeitatea

| formă | 0° | 15° | 30° | 45° |
|---|---|---|---|---|
| hală 12 × 7 m | 1,33× | 1,29× | 1,33× | 1,24× |
| colibă 4 × 3 m | 2,00× | 1,83× | 2,00× | 2,00× |
| zid 0,2 × 8 m | 1,13 cel./m | 1,63 | 1,88 | 2,38 |

Costul scade cu mărimea: pentru o clădire adevărată e neglijabil, pentru un zid subțire e scara
inerentă oricărei grile. Și o consecință care iese direct din cifre: **axa subțire a unui zid se
ancorează pe centrul celulei** — 20 de celule devin 10, la aceeași lungime — chiar dacă poziția pe
lungime și unghiul rămân libere.

## Task Completed

142 de teste verzi. Ce am livrat e traducerea poză↔grilă, dovedită; ce urmează — modelul de date al
clădirilor, camerele, stabilitatea — așteaptă D20.

---

## Task Started — D20 se poate vedea, nu doar citi

**Prompt:** „continua" (aceeași sesiune)
**Model:** Claude Opus 5

Ridicasem o decizie **vizuală** și ți-o predasem ca tabel de cifre. „Hala blochează de 1,24–1,33×
aria ei reală" e adevărat și inutil pentru cine trebuie să răspundă la *asta voiai?*. Diferența
dintre conturul desenat și celulele blocate se vede sau nu se vede.

Tasta **B** în viewer. `,` / `.` rotesc din 5 în 5 grade, **N** schimbă forma, **M** pornește și
oprește ancorarea pe centru de celulă.

- **conturul alb** — dreptunghiul rotit adevărat, ce s-ar desena în joc
- **verde** — celule pe care clădirea le acoperă oricum
- **chihlimbar** — celule blocate în plus. **Taxa.** Acolo nu poți păși, deși pe ecran e loc
- **roșu** — marginile pe care regula CENTRU le lasă deschise, adică pe unde ar curge

HUD-ul scrie forma, unghiul, numărul de celule, grăsimea și — coloana care contează —
**câte celule ar bloca regula CENTRU**.

Cazul care închide discuția, vizibil dintr-o privire: **zid 0,2 × 8 m la 30° → 15 celule cu ORICE,
1 celulă cu CENTRU.** Un zid întreg de opt metri ar opri pe cineva într-un singur loc. Arată ca un
zid. Nu e un zid.

Trigonometria stă în overlay, niciodată în simulare: unghiul devine un vector Q14 înainte să treacă
granița spre `sim/` — exact ce va face și interfața de construcție a jocului.

Și o notă de instrument: o eroare `writeQuadIndices is not defined` din consolă m-a trimis să
verific, dar era o intrare **veche** — URL-ul modulului purta marca de timp HMR de dinainte de
repornirea serverului. Dovada funcțională e că cele 12 mesh-uri de voxeli există cu 5637 de quaduri
și zero găuri; dacă importul ar fi lipsit, `buildVoxelGeometry` ar fi aruncat și n-ar fi existat
niciunul.

## Task Completed

142 de teste verzi. D20 se poate acum judeca uitându-te la ea.

---

## Task Started — recenzie adversarială peste tot ce am scris azi

**Prompt:** „continua"
**Model:** Claude Opus 5 · workflow cu 20 de agenți (6 dimensiuni + verificare pe două lentile)

2361 de linii adăugate într-o sesiune, mare parte în `src/sim/`, de către cineva care deja greșise de
trei ori în aceeași sesiune. Înainte să construiesc joburile peste ele, le-am dat pe mâna unor ochi
independenți: **23 de constatări, 7 verificate adversarial, zero respinse.**

### Un singur defect, văzut din cinci unghiuri

**`markDirty` nu era chemat NICIODATĂ pe `w.regions`.** Funcția exista, era bine scrisă, avea un
comentariu bun despre de ce supra-murdărește deliberat — și singurul ei apel din tot proiectul era în
viewer, pe un **al doilea** store de regiuni, folosit doar de overlay, și doar când overlay-ul era
vizibil.

Consecințele, toate permanente și toate tăcute:

| ce făcea jucătorul | ce se întâmpla |
|---|---|
| săpa o cameră | rămânea `NO_REGION` pe veci; niciun agent nu o ținea drept țintă și nu intra în ea |
| zidea un perete | celula rămânea marcată ca regiune validă; `findPath` pornea A*-uri pe promisiuni false |
| zidea în fața unui pion | pionul mergea mai departe pe drumul vechi, **prin piatră** |
| zidea peste un pion | pionul rămânea îngropat pe viață, raportând `INACCESIBIL` — un motiv care minte |
| deschidea overlay-ul de regiuni | vedea **verde exact acolo unde simularea era ruptă** |

Ultima e cea mai urâtă: adminul vizual care trebuia să prindă exact genul ăsta de defect se uita la
alt obiect decât sistemul. K13 din registrul de riscuri spune „n-am overlay de debug pentru regiuni"
ca semnal de pericol; aveam unul, și arăta altceva.

**Reparat:** `dig`/`fill` murdăresc graful; `rebuildDirty` se cheamă necondiționat (varianta cu
`if (ceva)` era cod mort — condiția devenea adevărată doar când un agent era în afara unei regiuni,
ceea ce în regim stabil nu se întâmplă); `avanseaza` re-validează terenul la fiecare pas; `fill`
**refuză** peste un om, cu `CELULA_OCUPATA` și id-ul lui; viewerul folosește **un singur** store.

### Invariantul central era rupt, și garda lui era oarbă

„1000 de tickuri + save + load + 1000 == 2000" — testul central al lui M5 — trecea. Fixtura lui
năștea agenții la `z = 0`, în aer. Măsurat pe ea: după 2000 de tickuri, **0 din 12 agenți se
mutaseră, 0 trageri de RNG, 0 drumuri.** Poarta compara două lumi în care nu se întâmpla nimic.
Aceeași clasă de defect pe care o reparasem azi în `standardScenario` — și n-am verificat cealaltă
fixtură.

Cu fixtura reparată, invariantul pică. Trei cauze, fiecare reală:

1. **Drumul era clasificat greșit.** Antetul lui `agents.ts` scria, cu argument: *„se recalculează
   din (poziție, țintă, teren), deci e TRANSIENT"*. Propoziția e **falsă** — un A* nu are răspuns
   unic. Un agent care își reface drumul din poziția lui curentă alege, legitim, altă rută la fel de
   scurtă decât sufixul celei vechi. Drumul e **PERSISTED**.
2. **Coridorul departaja pe id-ul de regiune**, iar id-urile vin dintr-un contor global — adică din
   ordinea istorică a calculului. Acum departajează pe o **ancoră geometrică** (`bloc × 256 + prima
   celulă a componentei), care nu depinde de ordine. La fel și etichetele de componentă din `relabel`.
3. **Extinderea acoperirii nu se salva.** *Care* blocuri sunt calculate e istorie; *conținutul* lor e
   funcție pură de teren. Extinderea e PERSISTED, conținutul DERIVED.

Rezultat: invariantul ține pe scenariul standard, pe toate configurațiile încercate.

### Și încă o greșeală a mea, din aceeași familie

Am „dovedit" la un moment dat, pe 144 de combinații, că extinderea acoperirii **nu** e necesară — și
am scos-o. Testul a picat imediat cu 5 divergențe. Mutația cu care măsurasem golea `blocuri: []` dar
lăsa `legate` salvată, iar `restoreRegions` reconstruia acoperirea din **ea**. Verificasem că
*fișierul* s-a schimbat, nu că *mecanismul* s-a oprit.

Exact capcana pe care mi-o notasem în memorie acum câteva ore. A doua oară în aceeași zi.

### Ce s-a măsurat

- acoperirea se stabilizează la **4730 de blocuri**, cost plat
- tickul: **63 µs** la 40 de agenți pe 100.000 de tickuri (era 32; diferența e re-validarea terenului
  la fiecare pas și reconstrucția necondiționată)
- hash de referință: `555d90da` → `58fdcb51`
- **148 de teste**, de la 142

O încercare intermediară, abandonată: asigurarea acoperirii pentru *fiecare* agent la *fiecare* tick,
ca să devină funcție de poziții. Măsurat: acoperirea crește nemărginit — 124.000 de blocuri la 20.000
de tickuri, cu costul dublându-se la fiecare 10.000 — iar testul de acceptanță a trecut de la 7
secunde la peste 578. Acumularea e **necesară** ca să fie ieftin; ea trebuia făcută reproductibilă,
nu eliminată.

### Mutațiile

Fiecare fix are acum o gardă, și fiecare gardă a fost probată prin mutație: `dig` fără `markDirty`,
`fill` fără refuz, `avanseaza` fără re-validare, drumurile nesalvate, extinderea nereconstruită,
ancora înlocuită cu id-ul, etichetele date iar pe id. **Toate șapte pică testul care le apără.**

## Task Completed

148 de teste verzi. Rămân 16 constatări neverificate din recenzie, majoritatea despre teste care nu
testează — următoarea bucată.

---

## Task Started — testele care nu testau

**Prompt:** „continua"
**Model:** Claude Opus 5

Restul recenziei: 16 constatări neverificate, majoritatea despre gărzi care nu pot deveni roșii.
Nu erau presupuneri — fiecare venea cu o mutație care trecea verde.

### Un agent inert se strecoară tăcut într-o fixtură

`spawnAgent` valida doar cutia lumii. Nu verifica dacă se poate **sta** acolo. Un agent așezat în
piatră sau în aer nu ajunge niciodată într-o regiune, deci e oprit pe viață de poarta din
`stepAgents` — inert, și tăcut.

Costul real nu e agentul pierdut, ci că **fixturile se umplu cu el fără să se vadă**: în testul meu
D7c, **15 din 40** de agenți cădeau pe celule necalcabile și stăteau nemișcați toate cele 20.000 de
tickuri. Testul trecea.

Acum `spawnAgent` refuză, cu `LOC_NECALCABIL`. Adăugarea a picat imediat **șase** teste — toate
sprijinindu-se, fără să știe, pe agenți care nu făceau nimic. Inclusiv unul al meu, scris azi:
`standardScenario` împrăștia agenții pe un pătrat de 5×5 în jurul sitului dar le dădea tuturor cota
**sitului**. Pe teren înclinat vecinii au alt sol — deci scenariul pe care stau testele de
determinism și hash-ul de referință din CI era pe jumătate populat cu agenți inerți. Reparat azi
dimineață pe jumătate, fără să observ.

### Șapte gărzi rescrise, fiecare cu mutația care o probează

| ce susținea garda | ce măsura de fapt |
|---|---|
| „D7c: agentul abandonează ținta și așteaptă" | trei contoare agregate; despre agent, nimic |
| „memoizarea nu mai face nicio muncă" | **mărimea** structurilor — neschimbată și cu memoizarea scoasă |
| „consumul de RNG e mărginit de reguli" | un prag de 3600 pe o valoare măsurată de 28 |
| „plafonul de re-planificări" | nimic: pe 100.000 de tickuri se fac 0,48 pe tick, față de un plafon de 4 |
| „amprenta e corectă" | doar margini **inferioare** — o axă SAT putea dispărea, verde |
| „răcirea din pasul 1" | trageri de RNG, zero și cu răcire, și fără |
| `assert.equal(refuzuri, ostili)` | adevărat trivial — contorul putea număra orice refuz |

Pentru memoizare a fost nevoie de instrumentare: `statistici.blocuriLegate`. „Memoizarea a încetat să
scurtcircuiteze" e o regresie de 21× care **nu schimbă niciun rezultat** — nu se poate prinde decât
măsurând munca.

### Și un test al meu care tot nu prindea, de două ori

Am scris garda pentru plafonul de încercări de țintă, am mutat plafonul ×3, și testul a trecut. Am
lărgit fereastra de la 50 la 200 de tickuri, plafonul chiar a fost atins, și testul **tot** a trecut.

Motivul: agentul care ajunge la a șasea încercare o și **reușește**. Plafonul nu e niciodată
constrângerea, deci poate fi ridicat fără ca ceva să se schimbe. „Plafonul e atins" nu înseamnă
„plafonul oprește ceva".

Fixtura corectă e una în care fiecare încercare eșuează **prin construcție**: rază de căutare de 4000
de celule, deci candidații cad mereu în afara acoperirii. Abia atunci bucla merge până la plafon de
fiecare dată, și plafonul e singurul lucru care o oprește. Mutația pică.

### Reparat în cod, nu doar în teste

- `spawnAgent` refuză pozițiile necalcabile
- `standardScenario` citește cota **per celulă**
- `amprenta` refuză dimensiuni negative — o jumătate-dimensiune negativă producea o amprentă **goală**,
  iar clădirea se desena identic: un zid care arată perfect și nu oprește pe nimeni. Un UI de
  construcție produce asta din primul drag făcut de la dreapta spre stânga
- toleranța de orientare: de la ±64 la ±1. Axele proprii nu se normalizează, deci banda de toleranță
  devine eroare de geometrie proporțională cu mărimea clădirii — la 200 m, aproape o celulă întreagă

## Task Completed

**154 de teste.** Nouă mutații probate, toate prinse. Hash de referință: `58fdcb51` → `9552870a`.

---

## Task Started — S16-19, tăietura 1: desemnări → joburi → săpat

**Prompt:** „continua"
**Model:** Claude Fable 5.1 · un panou de design cu 5 agenți (1,36 M tokeni — estimasem 550 k; fiecare
lentilă a citit tot nucleul, deci ~270 k pe agent, nu ~110 k. Cifra de buget pe agent pentru recenzii
care citesc codul e 250–300 k, nu 110 k)

Prima dată când jocul are **muncă**. Jucătorul desemnează celule de săpat; pionii liberi **cer** un
job (pull), aleg după scor, **rezervă** ținta ca tuplu, merg la un loc de lucru, sapă, eliberează.
Fiecare „nu" din scanner poartă cauza, și cauzele ajung în overlay-ul din viewer (K13) în aceeași zi.

### Designul, dat pe mâna unui panou înainte de cod

Am scris designul concret (model de date, scanner, driver, comenzi, content, teste) și l-am dat la
cinci lentile independente cu ordinul să-l **respingă**: determinism, cost, rezervări, lizibilitate,
completitudine. Cinci lentile au convers pe aceleași trei defecte — toate reale, toate în cazul de
utilizare cel mai comun, o **zonă pictată**:

| ce scria designul | ce s-ar fi întâmplat |
|---|---|
| plafonul de evaluări scumpe se aplică **în ordinea slotului** | o cameră de 16×16 desemnată înaintea rampei ei nu se sapă **niciodată**: cele 256 de celule fără loc de lucru consumă plafonul la fiecare scanare, rampa din sloturile de după nu e evaluată de nimeni |
| celula de lucru se alege **o singură dată**, iar un refuz de drum pune răcire de 600 de tickuri **pe țintă** | într-o zonă pictată, locul de lucru al lui A e capacul voxelului lui B; B îl sapă, A cade, abandonează cu `INACCESIBIL` — un motiv care minte — și ținta stă 30 s deși are alte trei locuri de lucru. K01, întocmai |
| `BUGET_DEPASIT` → „jobul rămâne" | plafonul de noduri e o constantă pe aceleași intrări: „prea scump acum" e „prea scump mereu". Pionul parcat pe viață cu ținta rezervată, repetând cea mai scumpă căutare din joc la fiecare 40 de tickuri |

Plus două pe care nu le-aș fi văzut singur: **`regions.dirty` devine nevid la save** pentru prima
dată (jobul sapă *în* tick, după reconstrucția de la începutul lui; lumea continuă ar fi legat la
tickul următor vecini pe care cea încărcată nu i-ar fi legat niciodată), și **golul de acoperire** e
permanent, nu tranzitoriu (hoinăreala nu iese niciodată din ce e calculat).

### Ce s-a construit, după corecții

- **Rezervarea e tuplul** `(claimant, jobId, targetId, layer, count, maxClaimants)`, cu toate trei
  dimensiunile din prima zi. Tranzacție „verifică tot, apoi scrie tot" — pe un fir (D12) aia E
  atomicitatea. Eliberare pe **pereche**, nu pe claimant. Invariant verificabil (`verificaRezervari`).
- **Rezervările sunt DERIVED din joburi; joburile sunt PERSISTED.** Asta rafinează M5, care spunea
  „la load: anulează toate joburile". Scrisă înainte de ieri: un pion cu jobul anulat la load ar
  relua progresul de la zero, altă poziție, alt hash. Intenția lui M5 se păstrează prin
  `reconstruiesteRezervari`: ce nu se poate re-rezerva se anulează **cu raport**.
- **Scanarea în două treceri**: porți ieftine peste tot (răciri, distanță, rezervare), apoi
  candidații sortați după o **margine superioară** a scorului, evaluările scumpe pe primii K, cu
  **oprire timpurie** când cel mai bun scor real bate marginea următorului. Refuzul „fără loc de
  lucru" e o proprietate a țintei și se memorează pe ea, cu răcire scurtă — așa plafonul se cheltuie
  pe candidați noi. Măsurat pe scenariul standard: evaluări scumpe 109 → 49.
- **Scorul în întregi**: `2^prio × 4^personal / (1 + drum)` prin înmulțire încrucișată, fără float.
  „+1 nivel = jumătate din drum", cu pragul de egalitate testat exact.
- **Răcirea urmează scopul predicatului**: „fără loc de lucru" → pe țintă; „drumul MEU e blocat de un
  ostil / peste buget" → pe perechea (pion, țintă). Un jefuitor în coridor nu mai blochează munca
  celor de dincolo de el — D7c prin sistemul de cauze.
- **Celula de lucru se reface** când se pierde (progresul rămâne) și **nu stă niciodată pe voxelul
  desemnat al altuia** — o citire în index. Testul cu două desemnări vecine și doi pioni: zero
  abandonuri, zero tickuri de lucru pe o desemnare vie.
- **`jobMaxIncercari`**: după trei refuzuri de drum jobul se încheie, ținta rămâne liberă, pionul
  nu rămâne parcat.
- **`rebuildDirty` și la sfârșit de tick**: invariantul „la sfârșitul oricărui tick, `dirty` e gol",
  testat pe un save făcut exact în tickul unei săpături de pion.
- **Invariant de content validat**: discul de acoperire al pionului și al desemnării trebuie să se
  atingă pe toată raza de scanare. Aritmetica s-a măsurat pe graf, nu s-a presupus: un disc de rază
  r leagă până la r și își scrie muchiile până la r+1, deci `a + j + 2 ≥ ⌈rază/16⌉`. Panoul spusese
  `+1` — cu un bloc prea strict, și testul l-a corectat.
- **Schema 2**, cu migrare 1→2 probată pe o **fixtură golden** capturată înainte de schimbare:
  save-ul vechi se încarcă fără joburi și dă exact hash-ul lumii pe care codul nou ar fi construit-o.
- **Overlay K13** (`J`): chihlimbar liberă · albastru rezervată · roșu fără loc de lucru (sapă o
  rampă) · violet nu se ajunge (leagă zonele) · linie de la pion la locul lui de lucru. Trei culori
  pe pioni: idle / merge / sapă. Rând în HUD, cu avertismentul „NIMENI NU SAPĂ". Click = desemnează,
  Ctrl+click = retrage, Alt+click = sapă pe loc.

### Ce s-a decis să NU existe, și de ce

- **Garda „10 joburi într-un tick"** din research: aici un agent pornește cel mult un job per tick de
  scanare, deci plafonul n-ar lega niciodată — „plafon atins nu înseamnă plafon care leagă". Ce
  apără efectiv: răcirea pe țintă, răcirea pe pereche, `jobMaxIncercari`, zăvorul `joburiFaraProgres`.
- **Muncă dincolo de `jobScanRadiusCells`** (96 m): `PREA_DEPARTE`, onest și acționabil, nu un
  `INACCESIBIL` fals produs de un gol de acoperire. Se rescrie când există „baza" ca noțiune.

### Măsurat

- **192 de teste**, de la 154. Toate cele 14 bug-uri clasice de rezervări din research au fie un test
  care le-ar prinde, fie o notă că nu se aplică încă.
- scenariul standard: 48 de desemnări, **47 săpate, 0 anulate** până la tickul ~3000; pe 100k tickuri
  **80 µs/tick** — regim idle, cifra de dinainte de joburi (panoul a spus-o: măsurătoarea aia e vidă
  pentru scan)
- **cariera**: 12 pioni, 900 de celule, 6000 de tickuri, **900 săpate, 0 anulate, 0 locuri refăcute**,
  **~220–280 µs/tick** cu o săpătură la câteva tickuri și `rebuildDirty` la fiecare. Ăsta e costul real
  al muncii continue; plafonul de evaluări **nu** se atinge acolo (ieșirea timpurie găsește marginea
  carierei din primele evaluări) — că leagă o dovedește fixtura de înfometare
- hash de referință: `9552870a` → `42e4501a`

### K01 s-a declanșat

PLAN spune: „prima dată când scriu cod care caută o poziție de lucru liberă în jurul unei ținte".
E `celulaDeLucru`: 4 vecini orizontali, `z ± maxStepM`, ordine fixă, niciodată voxelul propriu,
niciodată capacul unei desemnări vii. 30 de linii, iar panoul a găsit în ele exact cascada pe care
K01 o anunță. Se rămâne cu ochii pe ea.

## Task Completed

192 de teste verzi, CI verde. Următoarea tăietură: **iteme, cărat, depozite** — `Strat.CARAT` e
deja rezervat, `count`/`maxCount` din tuplu așteaptă mormanele.

### Mutațiile

Șaisprezece, fiecare cu testul care o prinde: `killAgent` fără eliberare · locul de lucru pe o
desemnare · refuzul „fără loc" nememorat · plafonul de încercări scos · răcirea pe țintă în loc de
pereche · fără `rebuildDirty` la sfârșit de tick · reconstruirea care nu sare peste morți · scanare la
fiecare tick · tranzacția care scrie înainte să verifice · scorul inversat · locul de lucru nerefăcut ·
spawn fără reset de prioritate · jobul nesalvat · progresul nehashuit · duplicate la load · invariantul
de acoperire scos. **Toate prinse**, cu arborele restaurat prin git și verificat cu `git diff --quiet`.

Prima rulare a scriptului a dat „7 controale invalide" — nu fiindcă gărzile lipseau, ci fiindcă primul
`git checkout` al unui fișier îl rescrie cu CRLF, iar tiparele mele aveau LF. Capcana din memorie,
încă o dată; scriptul își adaptează acum tiparele la terminatorul fișierului.

---

## Task Started — recenzia codului de la tăietura 1, și ce a schimbat

**Prompt:** „continua"
**Model:** Claude Fable 5.1 · workflow cu 6 lentile de căutare + verificare pe două lentile a
primelor 7 constatări (20 de agenți). **Doar cele 6 lentile de căutare au terminat: 4,0 M tokeni**,
~650 k fiecare — au scris și rulat scripturi de reproducere. Cei 14 verificatori au căzut la limita
de sesiune. Am verificat constatările eu, pe cod, în loc să relansez.

Nota de buget, a doua într-o zi: estimasem ~270 k pe agent după panoul de design; un agent care
**reproduce** (scrie fixturi, rulează `node --test`) costă ~650 k. Scris în memorie.

### 40 de constatări, 6 lentile — și ce era real

Toate cele reale au venit cu script de reproducere. Le iau în ordinea gravității:

| ce scrisesem | ce se întâmpla, măsurat | ce e acum |
|---|---|---|
| „`dirty` e gol la orice save" | fals: un save luat **între o comandă de teren și tickul următor** (exact ce face viewerul: click, apoi tick în cadrul următor) pierde blocurile murdare; lumea încărcată nu mai reconstruiește ce reconstruiește cea continuă. Hash EGAL la save, diferit la +2 tickuri. 40 din 143 de cazuri cu graf diferit | `dirty` e PERSISTED (`regiuni.murdare`) și intră în hash. Test: `dig` prin comandă, `encode` fără tick, 300 de tickuri în ambele lumi, hash egal la fiecare |
| răcirea pe pereche „ține minte ținta refuzată" | ținea minte UNA: a doua țintă refuzată o ștergea pe prima, iar pionul le alterna pe viață — 59 de A\*-uri eșuate în 1200 de tickuri, zero muncă, chiar cu o a treia țintă fezabilă la 6 celule. Plafonul de încercări **mutase** defectul „pion parcat", nu-l închisese | o **mulțime mărginită** de perechi per pion (`jobAvoidSlots`, 4), PERSISTED, cu evicție a celei mai vechi. Test: două ținte peste buget + una fezabilă ⇒ ≤ 12 refuzuri de drum în 1200 de tickuri și cea fezabilă săpată |
| „discul pionului și al desemnării se ating" | premisa era că pionul stă în CENTRUL discului lui. Nu stă: hoinărea în inelul calculat-dar-nelegat (unde nici job, nici drum), sau se năștea în discul altuia. De acolo, desemnări la ≤ 96 de celule cădeau într-un gol necalculat — `COMPONENTE_DIFERITE` pe veci, cu drum real de 105 celule | hoinăreala nu iese din blocuri **legate**; blocul unui pion e legat de la naștere; iar la un refuz de componentă scannerul întinde **o dată un coridor** de blocuri spre țintă (memoizat prin acoperirea persistată) înainte să spună „leagă zonele". Acoperirea crește cu munca, nu cu plimbarea |
| `celulaDeLucru` — „prima celulă câștigă" | oarbă la componentă: primul vecin în ordinea fixă putea fi fundul unei gropi izolate, iar treapta legată de suprafață, următoarea în ordine, nu era privită niciodată. Ținta respinsă cu „leagă zonele" pentru zone legate | primește componenta pionului; două întrebări: „are vreun loc?" (răcire pe țintă) și „are unul pentru mine?" |
| — | **jefuitorii săpau pentru jucător**: scannerul nu se uita la facțiune. În scenariul standard 10 din 47 de desemnări erau săpate de dușman; hash-ul de referință cocea munca lui | doar `ASEZARE` cere de lucru |
| „celula de lucru se reface când se pierde" | doar la `INACCESIBIL`; un ostil care STA pe prima celulă de lucru bloca ținta deși avea alte trei | și la `OCUPAT_DE_OSTIL`: altă celulă, sărind peste cea curentă, în limita plafonului de încercări |
| — | după fiecare voxel săpat pionul hoinărea aleator până la următorul `(tick + id) % 30`: **21,6 %** din timpul unei cariere | `scanLaTick`: cere de lucru la tickul de după orice job. Măsurat acum: 3,7 % |
| — | regiuni stale în același tick: vecinul sapă podeaua de sub un pion care lucrează, iar refacerea locului nu vede gaura proaspătă (până la `rebuildDirty` de la sfârșit) și anulează cu un motiv fals | refacerea locului se **amână** cât graful are blocuri murdare |
| — | `COMPONENTE_DIFERITE` nu se memora: 964 de pereți de șanț într-o altă componentă consumau plafonul la fiecare scanare — aceeași înfometare pe care panoul de design o închisese pentru „fără loc de lucru", reintrată prin a doua cauză | se memorează pe țintă, cu răcire scurtă, după ce coridorul a probat că golul e real |
| răcirea de 100 de tickuri | cu 1700 de desemnări fără loc și 256 evaluate per scanare, exact 1024 primeau vreodată un motiv — primele expirau și reintrau în față | răcirea se derivă din câte desemnări vii sunt: cel puțin cât să acopere toate |
| — | `desemneaza` accepta o țintă sub baza de voxeli a chunkului (pe nepromovat `materialAt` spunea ROCĂ, pe promovat AER): 750 de blocuri goale persistate pentru o țintă imposibilă | refuz `IN_AFARA_LUMII` cu intervalul; `materialAt` derivat spune AER sub bază, ca `voxelAt`. **Capcană prinsă imediat**: prima versiune recalcula baza la fiecare `materialAt` (1024 de celule) — un `isWalkable` a devenit de ~1000× mai scump, 179 ms/tick la 4 agenți. Se calculează o dată, la generare |
| viewer | **Shift+click zidea invizibil** (ieșirea timpurie pentru „nimic de remesh-uit" prindea și zidirea); overlay-ul G nu se reîmprospăta după săpăturile pionilor; remesh-ul rata un pion care sosea și săpa în același cadru | reparate; remesh-ul compară desemnările vii înainte/după pas |

Și **12 gărzi care nu legau**, din lentila de teste: 22 din 33 de mutații treceau 193/193. Cele
mai grave: aserția răcirii pe pereche era în fază cu ciclul job → 3 refuzuri (verde și cu scannerul
ignorând răcirea); sortarea pe margine n-avea niciun test (fără ea, 23 din 76 de layout-uri alegeau
sub optim); cinci câmpuri PERSISTED erau mereu zero în fixturile de roundtrip (șase mutații în
`save.ts` treceau verde); ramura „refă locul de lucru cu progresul păstrat" nu era parcursă de
nimic. Toate au acum testul lor: pe raport (nu pe stare la un moment), cu perechea „leagă / expiră".

### Ce n-am schimbat, și de ce

- **Coridorul e o limită scrisă**: are 3 blocuri lățime; un drum real care ocolește mai larg tot dă
  `COMPONENTE_DIFERITE` — onest, memorat scurt, și cu hoinăreala ținută în blocuri legate acoperirea
  nu mai poate crește cu plimbarea.
- Sortarea completă a candidaților (~1 ms la 4096 în rază, măsurat de recenzie) rămâne; se înlocuiește
  cu selecție parțială când o cifră din joc o cere.
- Invariantul de acoperire `a + j + 2` mai are un caz la 1 din 229 pe pantă (blocul de cusătură fără
  muchii verticale interne); coridorul îl acoperă în practică. Rămâne notat.

### Măsurat

- **193 → 213 teste** (39 în felia de joburi). Schema 3, cu fixtură golden de schema 2 (3 pioni cu
  joburi în curs, 6 KB) și migrarea 2→3 probată pe ea.
- cariera: 900 săpate, 0 anulate, **3,7 % hoinăreală** (era 21,6 %), ~205 µs/tick.
- scenariul standard: 68 µs/tick; hash `42e4501a` → `e87ed5e2` (jefuitorii nu mai sapă; hoinăreala
  în blocuri legate; scanarea de după job).
- fixtura de schema 1: testul „aceeași lume ca replica" a ținut o zi — hoinăreala s-a schimbat, deci
  aceleași 300 de tickuri dau altă lume. Exact de aia fixtura e golden, nu regenerată; testul verifică
  acum câmp cu câmp, nu prin replică.

## Task Completed

213 teste verzi, CI verde. Următoarea tăietură rămâne **iteme, cărat, depozite** (design în
scratchpad, de trecut prin panou).

### Mutațiile, a doua rundă

Douăzeci, pe gărzile adăugate după recenzie — blocurile murdare nesalvate, răcirea pe pereche
redevenită scalar, coridorul scos, locul de lucru orb la componentă, poarta de facțiune scoasă,
scanarea de după job scoasă, `COMPONENTE_DIFERITE` nememorat, fereastra de răcire fixă, ostilul pe
celula de lucru fără alternativă, `materialAt` sub bază, refacerea locului în LUCREAZA scoasă,
sortarea pe margine înlocuită cu ordinea id-ului, prioritatea 0 ignorată, `PREA_DEPARTE` scos,
rangul cauzelor inversat, `jobIncercari` nesalvat, decalajul scos, clauza `maxClaimants` din
`verifica` scoasă, „același claimant ocupă loc nou", duplicatele de id la load. **Toate prinse.**

Două au trecut la prima rulare și au cerut fixturi mai bune: `jobIncercari` nesalvat (câmpul e nenul
cât jobul TRĂIEȘTE, iar fixtura salva după ce murise — acum roundtrip-ul se face în trei momente,
fiecare cu câmpurile lui nenule) și „același claimant" (cazul din store, nu din tranzacție, n-avea
aserție).

---

## Task Started — S16-19, tăietura 2: iteme, cărat, depozite pictate

**Prompt:** „continua" (reluat după limita de sesiune: „I hit my usage limit while you were working,
but it has reset now. Please continue from where you left off.")
**Model:** Claude Fable 5.1 · panoul de design cu 5 lentile (1,53 M tokeni, 56 de constatări), apoi
implementarea, testele și mutațiile de mine.

### Ce a spus panoul despre designul v1, și ce am schimbat înainte de cod

Toate cele cinci lentile au dat același verdict — designul NU stătea — și aceeași rădăcină:
**cantitatea și locul mărfii erau tratate ca proprietăți ale itemului sau ale celulei, nu ca stare a
jobului/pionului, și lipsea o singură funcție de depunere cu căutare în ordine fixă.** Cele 56 de
constatări se contopesc în opt schimbări, toate făcute în v2 înainte de prima linie de cod:

| v1 spunea | ce ar fi ieșit (măsurat de panou pe cod) | v2 |
|---|---|---|
| `cereriPentru(w, kind, jobTarget, jobDest)`, `count = min(cantitate, …)`, „pură în stare" | NU e pură: mormanul crește prin contopire între rezervare și save, sursa moare la ridicare, `elibereaza` pe pereche scoate și destinația. Un save luat între RIDICA și LASA se încarcă cu jobul anulat și 20 de piatră în mână fără job → dispar la următorul RIDICA; `1000 + save + load + 1000 ≠ 2000` | `jobCantitate` PERSISTED (înghețat la start), `cereriPentru` citește doar tuplul persistat și pasul (sursa doar până la RIDICA), `elibereazaUna` în rezervari.ts, `verificaRezervari` cu clauza „ținta există". M5 probat în cei patru pași |
| „se lasă la picioare" | nedefinit pe o celulă cu morman de alt fel sau plin (cazul comun: pionul traversează depozitul); trei implementări posibile, toate greșite — două mormane pe o celulă (save-ul nu se mai încarcă), marfă dispărută, sau căutare fără plafon | **o singură rutină `asazaItem`** pentru TOATE depunerile (yield, la picioare, LASA, `lasaItem`, căderea la editarea terenului): ordine fixă, două treceri (întâi celulele fără podea desemnată), contopire, restul pe următoarea celulă, pierderea NUMĂRATĂ în `ratiune.itemePierdute` (zăvor per lume, asertat 0) |
| „un item zace MEREU pe o celulă calcabilă" | afirmat, neîntreținut: al doilea strat al carierei lasă tot primul strat în aer; un tunel de 2 m pierde jumătate din yield în orice ordine; `fill` îngroapă mormane | cârlig în `sapaVoxel` (mormanul de deasupra CADE prin `asazaItem`, cu id-ul păstrat), `fill` refuză peste morman și peste celula căreia i-ar lua headroom-ul; invariantul asertat la fiecare 100 de tickuri în acceptanță |
| trecerea ieftină O(iteme vii); margine „prio maximă cu celule libere", un număr | K05 în forma pură: 3.000 de stive depozitate = 4.000 de vizite/tick pentru zero muncă; un depozit bun plin de PĂMÂNT trimitea toată PIATRA din depozitul slab la evaluări scumpe, pe viață | index DERIVED sub steag murdar (zone.ts): `libere` per zonă, `acceptante[zonă][fel]`, `maxPrioLibera[fel]`, lista `deMutat`; trecerea ieftină iterează DOAR `deMutat` — colonia cu totul depozitat costă 0 vizite (test pe contor) |
| căutarea destinației „în ordinea (prio, distanță), plafonată la 512 celule" | ori sortare O(Z log Z) per candidat, ori plafon pe sloturi care dă FARA_DEPOZIT fals cu 388 de celule libere în fundul depozitului | doar `libere` per zonă, plafon pe celule LIBERE examinate, cea mai apropiată din prima zonă strict mai bună; test: primele celule pline, plafon 4 ⇒ tot găsește |
| validare la pictare doar `isWalkable` | depozit pictat în altă direcție decât cariera = INACCESIBIL pe veci, cu drum real (exact defectul închis pentru desemnări cu o zi înainte) | `picteazaZona` cheamă `ensureArea` (memoizat), coridor item→celulă în trecerea scumpă; test cu depozit la 5 blocuri în direcția opusă |
| răcirea pe pereche „cu id-ul itemului" | id-ul moare la ridicare; mormanul lăsat jos e item nou → ridică/lasă la nesfârșit, 3 A\*-uri eșuate pe ciclu | răcirea se scrie pe ce EXISTĂ după refuz: zona (id de entitate — celulele de zonă au id tocmai ca să încapă în Int32) și mormanul rezultat; test: ≤ `jobMaxIncercari` refuzuri per fereastră de `jobRetryTicks`, `nextId` stabil |
| `picteazaZona {wx, wy, z}` celulă cu celulă; `CATEGORII 1→2` „are deja dimensiunea"; schema 3 „nouă" | 900 de comenzi și 900 de zone de o celulă; TOATE save-urile de azi refuzate pe lungimea lui `prioPersonala`; schema 3 exista deja cu alt sens | dreptunghi = o comandă, o zonă; schema **4**, `MIGRATIONS[3]` cu `agents.categorii` (pasul vechi) lărgit la citire; fixtura golden de schema 3 capturată la `7be843c` ÎNAINTE de orice schimbare |

Plus: `digYield` ca **tabel** în content (chei = toate materialele solide, IARBA inclusiv — altfel
prima săpătură a jucătorului producea un item de 0 bucăți cărat la nesfârșit), validat la
`parseRules` (primul câmp imbricat din content; loader-ul a primit un caz, nu un sistem);
`itemMaxClaimants` scos (nu lega niciodată) și înlocuit cu `haulCarryMax < itemStackMax`, care leagă
(test: 75 → 50 + 25); `jobEfect` separat de `jobProgres` (zăvorul „fără progres" nu se trage fals
pe un INCOMPLET după ridicare); exclusivitatea (3) ca proprietate a mulțimii; o singură listă de
candidați din ambele categorii, sortată pe margine (nu „întâi săpatul") — cu testul care arată că
altfel cariera de 900 ținea depozitul gol; `tickuriPeDrum`/`tickuriDeLucru` ca zăvoare, pentru
pragul de batching; SAPA/CARA alternează mers/oprire cu aceeași paritate a pasului.

### Ce a ieșit

- **213 → 246 de teste** (11 iteme, 17 cărat, +2 rezervări, +4 migrare). Fiecare gardă nouă are
  mutația ei (rundă în curs, mai jos).
- **Cariera + depozit** (12 pioni, 900 de celule, depozit de 144): 405 joburi în 6.000 de tickuri,
  188 depuneri, `itemePierdute = 0`, toate itemele pe celule calcabile la fiecare 100 de tickuri,
  `verificaRezervari` cu existență verde, ~100 µs/tick. **Raportul drum/lucru: 4,7** — pionii merg
  de aproape cinci ori mai mult decât muncesc. Ăsta e semnalul pentru batching (pragul din design
  era 40%); nu se face acum, dar acum se măsoară.
- Cariera fără depozit rămâne la 900 săpate / 0 anulate; mormanele de pe jos fără zonă costă 0
  vizite per scanare (nu sunt în `deMutat`).
- Scenariul standard: 68 → ~150 µs/tick (pionii cară acum spre depozitele de la fiecare sit; de
  profilat). Hash `e87ed5e2` → `431d0b5b`.
- Overlay J: cuburi mici pentru mormane (înălțimea = cât e de plin, culoarea = cauza), pătrate verzi
  pentru celulele de depozit (mai luminoase când sunt pline, albastre când vine cineva), linie spre
  ținta oricărui pas de mers, pion arămiu = cară ceva; **Z+click** de două ori = depozit, **X+click** =
  șterge; HUD: mormane, depozit, „NIMENI NU CARĂ".

### Capcane prinse pe drum

- `DEFAULT_RULES.digYield` e tabloul deja parsat, iar `parseRules({...DEFAULT_RULES})` e un test
  existent: loader-ul acceptă ambele forme și le validează cu aceleași reguli.
- Fixtura M5 „în patru pași" pe o singură cronologie rata pașii de după primul roundtrip (care
  consumă 200 de tickuri): fiecare moment pe o pereche PROASPĂTĂ de lumi.
- Un `node -e` cu șabloane cu backtick într-un șir bash cu ghilimele duble a lăsat o linie goală în
  `viewer/main.ts` (bash a executat `${...}` ca substituție de comandă). A opta formă a capcanei de
  escaping; scris în memorie.
- Harness-ul de mutații restaurează prin `git checkout`: cu arborele necomis, ar fi șters
  implementarea. Deci: commit ÎNTÂI, mutații după.

### K05 s-a declanșat, și era vina mea de acum două commit-uri

Profilul scenariului standard a arătat `relabel` la **39,7% din tick**. `relabel` e O(regiuni +
muchii), deci procentul ăla înseamnă „graful crește". Măsurat, pe același scenariu, același seed:

| | acoperire la t=5000 | la t=30000 | coridoare | µs/tick |
|---|---|---|---|---|
| tăietura 1 (`7be843c`) | 4972 blocuri | **4972 (+0)** | 0 | 63–73 |
| tăietura 2, prima formă | 10944 | **24350, +1824 și în creștere** | 898 | 200–330 |
| după reparație | 5347 | 6286 (+194 la ultimele 5000) | 0 | 74–83 |

A doua măsurătoare a spus *ce* crește: **coloanele** de blocuri (1138 → 2225), nu feliile de z (plate
la 10,9). Deci frontiera de acoperire se împingea pe hartă. A treia, cu contoare pe fiecare apel:
coridorul de la SAPA se declanșează de **0 ori** (ca în tăietura 1), acoperirea pionilor de **36** de
ori în 20.000 de tickuri, iar coridorul **pion → marfă de ~360 de ori la fiecare 4.000 de tickuri, la
nesfârșit**.

**Mecanismul.** Coridorul e ancorat de poziția PIONULUI, care se mișcă. Un morman în fundul unei
gropi de două niveluri e inaccesibil permanent (`maxStepM = 1`), deci scannerul îl reevaluează la
fiecare expirare a răcirii, din altă poziție, trasează altă linie Bresenham și adaugă un inel nou.
În tăietura 1 codul exista deja, dar nu se declanșa niciodată — defectul era latent, iar a doua țintă
l-a trezit. E exact clasa pe care recenzia tăieturii 1 o închisese („acoperirea crește cu munca, nu
cu plimbarea"), reintrată prin iteme.

**Și ce am stricat singur.** Mutația „fără disc de acoperire la pictare" trecuse verde, iar eu am
scos discul. Greșit: erau două mecanisme pentru aceeași garanție, iar eu l-am scos pe cel
**mărginit** (un disc per celulă pictată, memoizat) și l-am păstrat pe cel **nemărginit** (un coridor
per evaluare). Verde nu înseamnă redundant — înseamnă că celălalt mecanism îl acoperea.

**Reparația**, în trei bucăți:
1. Discul se întoarce la `picteazaZona`.
2. Ambele coridoare spre marfă dispar. Un morman apare NUMAI unde a săpat sau a umblat cineva, deci
   pe teren deja acoperit; ce rămâne în altă componentă e o groapă din care nu se iese, și ăsta e un
   refuz onest, memorat pe item. Coridorul rămâne doar pentru desemnări, unde jucătorul chiar poate
   cere muncă în teren neatins.
3. Un invariant nou în `parseRules`: discul locului mărfii (cel mic dintre al pionului și al
   desemnării) plus discul depozitului plus 2 trebuie să acopere `haulDestRadiusCells`. Cu
   implicitele: 2 + 2 + 2 = 6 blocuri = 96 de celule, exact raza. Garanția stă în content, nu într-o
   cârpeală la rulare.

**Garda care lipsea** (`tests/carat.test.ts`, „K05: un morman pe veci inaccesibil..."): o groapă de
două niveluri, mormanul din ea, 2000 de tickuri de așezare, apoi **zero blocuri noi în următoarele
2000** și zero coridoare — cu aserția că reevaluările chiar au loc, altfel testul n-ar exercita nimic.
Mutația care o probează e chiar starea de dinainte: coridorul pion → marfă repus.

**Măsurat după:** scenariul standard 149 → **86 µs/tick** (tăietura 1: 68); carieră+depozit 138
µs/tick; 249 de teste verzi. Hash de referință `24e9cb17` → `4e0d2322`.

### Recenzia codului tăieturii 2: 23 de constatări, 3 lentile

Panoul de cod (determinism, marfă, K05) a rulat pe `a2a3396`. Verdictele: lanțul mărfii ține (n-au
găsit nicio cale prin care o unitate să dispară sau să se dubleze), dar mașina de stare a cărat-ului
avea o **poartă lipsă** și K05 mai avea două uși deschise.

**Bucla infinită, găsită de două lentile independent (2 CRITIC).** `findPath` întoarce INACCESIBIL și
când componenta e corectă: A\*-ul pe celule e mărginit la banda de regiuni, iar un ocol care iese din
bandă golește coada fără ostil (`path.ts`, „graful promitea un drum, celulele nu l-au confirmat").
Ramura INACCESIBIL din `drumRefuzat` **nu incrementa `jobIncercari`** și chema `refaLoculDeLucru`
fără `evita` — iar `celulaDeLucru` întoarce prima celulă în ordine FIXĂ, adică exact cea de dinainte.
Jobul nu se mai încheia niciodată: desemnarea rămânea rezervată pentru toată colonia, pionul parcat pe
viață, și niciun zăvor nu se trăgea, fiindcă toate se trag la SFÂRȘITUL unui job. La cărat, aceeași
gaură producea ping-pong între două celule de depozit (se eliberează A, se rezervă B; la refuzul
următor A redevine cea mai apropiată), cu marfa blocată în mână. Verificat în cod înainte de reparație.

Acum: **orice** refuz de drum numără o încercare; re-alegerea țintei sare peste cea curentă (deci
„refăcut" înseamnă „alta"); la plafon jobul se încheie cu răcire pe PERECHE. Re-alegerea rămâne
rezervată cauzelor în care ținta curentă e problema — „prea scump ACUM" nu se repară mutându-te o
celulă mai încolo, și testul existent de BUGET_DEPASIT a prins imediat prima versiune care o făcea.

**Celelalte reparate în tranșa asta:**

| ce | de ce conta |
|---|---|
| `reconstruiesteRezervari` în DOUĂ treceri | marfa se lăsa la picioare înainte ca rezervările sloturilor următoare să existe, deci putea umple exact celula pe care altcineva o ținea rezervată. Divergență continuu/încărcat, dependentă de ordinea sloturilor |
| `fill` verifică tot headroom-ul pentru PIONI | garda pentru mormane parcurgea corect `agentHeadroomM`, cea pentru oameni doar cota picioarelor — un zid la înălțimea capului îngropa pionul, exact ce comentariul de deasupra declara închis |
| pion îngropat își încheie jobul | nu mai ajunge nici la muncă, nici la drum, deci niciun plafon nu-l atinge: ținta rămânea rezervată pentru toată colonia și marfa în mână pe veci — vizibilă în sumă, deci nici măcar numărată ca pierdută |
| marfa unui slot MORT se numără la încărcare | ramura vie o trecea prin `asazaItem`, cea moartă o punea pe 0 în tăcere |
| răcirea unei cauze de PERECHE nu mai ajunge pe ITEM | dacă MĂCAR o zonă a fost sărită fiindcă pionul ăsta o evită, refuzul e al perechii; prima versiune cerea ca TOATE să fie evitate, deci cu două depozite scria pe marfă o răcire PERSISTED care o ascundea de toată colonia |
| detaliul de pe desemnare se derivă din motiv | era hardcodat pe FARA_LOC_DE_LUCRU: panoul „De ce nu?" spunea „sapă o rampă" și când cauza era „nu mai încape niciun morman" (acționabil: cărați marfa) |
| acceptanța probează CONSERVAREA, în unități | linia care trebuia s-o facă era moartă (`void sapate`, apoi doar „totalul e nenul"). `itemeProduse` numără MORMANE și nu se poate aduna; acum există `unitatiProduse`, și aserția e `în lume + pierdut === produs`. Mutația pe care recenzia a dat-o ca trecând verde („−1 la fiecare depunere") o face roșie |

Șase gărzi noi, fiecare cu mutația ei. 249 → 255 de teste.

### Tranșa de cost: ce a rămas din K05 după recenzie

Lentila de K05 a dat cinci constatări de cost. Le-am luat pe măsurătoare, nu pe descriere.

**Poarta ieftină întreba „e vreun loc?", nu „încape CÂT car?".** Un depozit cu toate celulele la
74/75 e „nepline", deci trecea poarta: fiecare morman de pe jos intra în `deMutat`, era sortat,
evaluat scump, iar `cautaDestinatie` parcurgea toată lista lui de celule libere — la fiecare scanare
a fiecărui pion, cu zero marfă mutată. Indexul ține acum și `maxLocLiber[zonă][fel]` (cel mai mare loc
liber de pe o celulă), iar poarta compară cu cât s-ar căra. Testul: depozit 4×4 la 74/75 ⇒ zero
vizite, zero evaluări scumpe, zero celule parcurse.

**Plafonul `haulDestMaxCells` nu lega niciodată.** Se incrementa DUPĂ filtrele de rază și de loc,
deci bucla mergea până la capătul listei, iar `evaluariDestinatie` raporta ~0 exact în cazul care
costa cel mai mult — instrumentul mințea. Acum numără INTRARI parcurse. Cifra din acceptanță a urcat
de la 146.675 la 159.871 pentru aceeași muncă: diferența e ce nu se vedea înainte.

**Reconstrucția indexului e Θ(celule + iteme), și asta rămâne.** Măsurat direct pe mecanism, la
scara care contează:

| mormane vii | µs / reconstrucție |
|---|---|
| 0 | 20,9 |
| 500 | 29,6 |
| 1500 | 94,9 |
| 3000 | 135,4 |

Adică ~57 ns/celulă și ~38 ns/morman. La ținta din DESIGN §10 (3000 de stive, 4096 de celule) o
reconstrucție ar fi ~380 µs, iar cu ~1,3 reconstrucții pe tick, ~0,5 ms/tick — 6% din bugetul intern
de 8 ms, și crește cu vechimea. **Nu am făcut indexul incremental.** Motivul e chiar constatarea
panoului de design care a produs forma actuală: „un DERIVED care poate rămâne stale nu e DERIVED" —
întreținerea incrementală cere cârlige în toate locurile care schimbă ocuparea unei celule, adică
exact lista pe care o uiți. Ce am făcut în schimb: garda din acceptanță nu mai numără RECONSTRUCȚII
(un număr care nu spune nimic despre cost), ci **pași** — celule și sloturi atinse. Azi: 12 pași/tick,
prag 200. Când cifra din joc o va cere, refacerea incrementală are acum și măsurătoarea, și pragul
care o declanșează.

**Și două găuri de corectitudine din aceeași lentilă:**

- O celulă de depozit căreia i se sapă podeaua (sau peste care se zidește) rămânea vie pentru
  totdeauna: indexul o număra „liberă", ținea `maxPrioLibera` sus, deci fiecare morman de pe jos
  rămânea candidat pe veci, iar cauza afișată mințea („leagă zonele") pentru un depozit pe care
  jucătorul tocmai și-l săpase. Acum se retrage, prin același cârlig ca mormanele.
- Răcirea pe marfă se deriva din `iteme.vii` — populație care include tot ce stă liniștit în depozit.
  Justificarea ferestrei („să acopere toate țintele înainte să expire primele") e corectă la
  desemnări, unde fiecare desemnare vie e candidat; la iteme nu. Cu 3000 de mormane depozitate și
  unul de cărat, fereastra ieșea 390 de tickuri în loc de 100. Acum se derivă din câți candidați sunt.
  Și o comandă de zonă șterge răcirile: premisa oricărui „n-are unde" tocmai s-a schimbat, iar fără
  asta marfa stătea pe loc sute de tickuri după ce jucătorul picta depozitul de lângă ea.

**Măsurat după toată tranșa:** scenariul standard **74 µs/tick** (tăietura 1: 68), carieră+depozit 89
µs/tick, 261 de teste.

## Task Completed

Tăietura 2 din S16-19 e livrată și trecută prin panou de design, mutații, recenzie de cod și încă o
rundă de mutații. **261 de teste**, CI verde, scenariul standard **74 µs/tick** (tăietura 1: 68, cu
cărat pe deasupra).

Ce a produs fiecare pas, pe scurt:

| pas | ce a schimbat |
|---|---|
| panou de design (5 lentile, 56 de constatări) | opt lucruri, ÎNAINTE de cod: `jobCantitate` înghețat în job, o singură `asazaItem`, index DERIVED sub steag murdar, dreptunghi la pictare, schema 4, `haulCarryMax` în loc de `itemMaxClaimants`, `jobEfect`, o singură listă de candidați |
| mutații, runda 1 (32) | 29 prinse; cele trei ratate au scos două mecanisme redundante și au adăugat o gardă pe vizitele trecerii ieftine |
| **K05, măsurat** | acoperirea de regiuni creștea nemărginit; coridoarele spre marfă scoase, discul la pictare întors, invariant nou în `parseRules`, gardă „zero blocuri noi în 2000 de tickuri" |
| recenzie de cod (3 lentile, 23 de constatări) | o buclă infinită (INACCESIBIL fără contor de încercări) și șapte găuri mai mici; șase gărzi noi |
| **K05, a doua oară** | poarta ieftină întreabă „încape cât car?", plafonul de destinație leagă, celulele de depozit se retrag când își pierd podeaua, răcirea se derivă din candidați; gardă pe PAȘI, nu pe reconstrucții |
| mutații, runda 2 (37) | toate prinse |

**Ce rămâne deschis, cu cifra lui:**

- reconstrucția indexului de zone e Θ(celule + iteme): 20,9 µs la 0 mormane, 135,4 µs la 3000. La
  ținta din DESIGN §10 ar fi ~0,5 ms/tick. Devine incrementală când cifra din joc o cere; garda de
  acceptanță o măsoară (12 pași/tick azi, prag 30).
- raportul drum/lucru e **4,7** — pionii merg de aproape cinci ori mai mult decât muncesc. Ăsta e
  pragul pentru batching (mai multe mormane pe un drum), și e o judecată de joc, nu una de cod:
  întrebarea e la Andrei, în OWNER_VERIFY punctul 7.
- sortarea completă a candidaților (~1 ms la 4096) rămâne, ca la tăietura 1.

Următoarea tăietură: **foame / odihnă / dispoziție**.

## Task Started — S16-19, tăietura 3: foame, odihnă, dispoziție

**Prompt:** „continua cu S16-19"
**Model:** Claude Opus 5 · panoul de design cu 5 lentile (1,16 M tokeni, 60 de constatări), apoi
implementarea, testele și mutațiile de mine.

### Ce a spus panoul despre designul v1

Toate cinci lentilele: designul NU stă. 60 de constatări, 20 critice, și patru lentile independente
au ajuns la **aceeași rădăcină** — dispecerizarea pe felul jobului era binară.

Cinci locuri ramificau pe `=== FelJob.CARA` cu `else` = SAPA: `cereriPentru`,
`reconstruiesteRezervari`, `lucreaza`, `terminaJob` și `drumRefuzat`. Cu două feluri, un `else` e o
alternativă; cu patru, e o presupunere. Ce presupunea greșit:

- la încărcare, `reconstruiesteRezervari` ar fi cerut o **desemnare** pentru un id de **item**, ar fi
  primit −1 și ar fi anulat jobul: `1000 + save + load + 1000 ≠ 2000` pentru fiecare pion care
  mănâncă sau doarme în momentul salvării — adică aproape mereu. Exact invarianta pe care stă tot
  determinismul;
- în execuție, orice fel ≠ CARA intra în `lucreazaSapa`, care nu găsea desemnarea și întrerupea
  jobul; pionul relua — buclă de două tickuri, fiecare arzând un `nextId`, care e PERSISTED și intră
  în hash;
- la un refuz de drum, răcirea se scria pe `slotItem(...)` = −1, adică **nicăieri**, deci reluarea
  era imediată și infinită.

Și făcea falsă promisiunea „o nevoie nouă e un rând de tabel": recrearea ar fi cerut nouă schimbări.

Celelalte trei rădăcini critice, toate reparate pe hârtie în v2 înainte de prima linie de cod:

| v1 spunea | ce ar fi ieșit | v2 |
|---|---|---|
| `makeAgentStore` alocă `nevoi`/`dispozitie` ca zerouri | o lume **nouă** pornește cu toți pionii sub pragul critic și cu dispoziția sub pragul de plecare; un slot reutilizat moștenește dispoziția mortului | umplere explicită în store, în `spawnAgent` și în migrare, cu **defazare deterministă pe id** — altfel toată colonia trece pragul în aceeași fereastră și valul nu se sparge niciodată |
| valorile gândurilor copiate din research (bară 0..100) într-o bară 0..1000 | ținta nu poate coborî sub 440, deci „refuză munca" (250) și „pleacă" (60) sunt **cod mort din ziua în care se scriu**; iar acceptanța care ar fi trebuit să prindă asta putea mișca bara cu 24 din 1000 | o singură scară, aritmetica scrisă lângă fiecare număr, și un invariant în `parseRules`: catalogul de gânduri **trebuie** să poată atinge pragul cel mai de jos |
| pragurile se verifică la ticul de nevoie | momentul „fără job ȘI pe tic de nevoie" e o coincidență de ~1 la 250, deci pragul de preferință nu s-ar declanșa practic niciodată și tot jocul s-ar muta pe calea cu întreruperi | două ceasuri: scurgerea rară, **verificarea în fiecare tick** (două citiri de tablou, poartă O(1)) |

Restul: nevoia nerezolvabilă primește răcire per (pion, nevoie) și cade înapoi pe muncă; nu se
întrerupe jobul care rezolvă chiar nevoia declanșatoare, nici un cărat cu marfa în mână; podeaua
multiplicatorului de muncă se pune pe **rezultat**, nu pe factor; mâncatul stă pe un **strat propriu**
de rezervare; indexul de zone citește în sfârșit **felul zonei**; și scenariul standard primește
mâncare, altfel toate măsurătorile de referință ar deveni măsurători ale unei colonii care moare de
foame.

Designul v2 e în `scratchpad/design-s16-t3.md`. Livrarea e în trei commit-uri: structura (tabel de
drivere, fel de zonă, strat de mâncat), nevoile, dispoziția.

## Task Completed

**Tăietura 3 din S16-19 e livrată:** foame, odihnă, dispoziție. **315 teste**, **89 din 89 de
mutații prinse** pe trei suite, zero controale invalide. Schema 5 și 6, hash de referință nou
(`e6585927`), scenariul standard **79–81 µs/tick** — HEAD-ul de dinaintea tăieturii dădea 85–92 pe
aceeași mașină, deci nevoile și dispoziția nu costă nimic măsurabil.

Trei commit-uri, în ordinea asta, și ordinea a fost jumătate din livrare:

| commit | ce a schimbat |
|---|---|
| **structura** | tabel de drivere pe felul jobului (cinci `else` care presupuneau SAPA), `Strat.MANCAT`, felul zonei citit în sfârșit de index, `iaDinItem` murdărește condiționat |
| **nevoile** | tabel indexat, două ceasuri, defazare pe id, MANANCA + DOARME, schema 5 + migrare, mâncare în scenariul standard |
| **dispoziția** | gânduri de stare vs. de eveniment, țintă DERIVED + bară PERSISTED, cele trei trepte, schema 6 + migrare, HUD și overlay |

### Ce a prins panoul de design, și ce a prins măsurătoarea

Panoul a găsit **rădăcina**: dispecerizarea binară. Patru lentile independente au ajuns la același
loc, iar consecința era invarianta pe care stă tot determinismul — `1000 + save + load + 1000 ≠ 2000`
pentru fiecare pion care mănâncă sau doarme când se salvează, adică aproape mereu. Tabelul de drivere
a fost scris ca **refactorizare fără comportament nou**, cu hash-ul neschimbat ca dovadă.

Dar trei lucruri nu le-a prins nimeni pe hârtie, și au ieșit din sonde:

1. **`resetJobReport` enumera câmpurile unul câte unul.** Lista a supraviețuit trei tăieturi și a
   căzut la a patra: trei contoare noi nu erau în ea, deci se adunau la infinit. Sonda a raportat
   **44 de milioane de unități mâncate într-o lume care conținea 900** — un număr imposibil, pe care
   nicio aserțiune nu-l urmărea. Un contor de tick care nu se resetează nu dă erori, dă cifre. Ambele
   resetări sunt acum STRUCTURALE, deci clasa e închisă, nu instanța.
2. **Treapta a treia era inaccesibilă ÎN JOC**, deși invariantul aritmetic trecea. Cu INFOMETAT la
   −200, o așezare fără pic de mâncare se stabiliza la o dispoziție de 230 și nu pleca nimeni
   niciodată: catalogul atingea pragul doar adunând și EPUIZAT, iar somnul pe jos reușește mereu, deci
   EPUIZAT nu apare practic. Exact forma pe care panoul o găsise, reîntoarsă pe altă ușă — invariantul
   verifică ce POATE aduna catalogul, nu ce se întâmplă. Reparat la −450, măsurat: fără mâncare pleacă
   toți în ~40.000 de tickuri, cu ~1.500 între „refuză munca" și plecare.
3. **`refuzaMunca` exista în DOUĂ rapoarte** și se incrementa doar în al doilea, deci sonda citea
   mereu zero.

### O reparație aruncată

Pionii care pleacă dintr-o așezare **bine aprovizionată** sunt la 3.000–6.000 de celule de cea mai
apropiată hrană, deși fiecare sit are mâncare: au ajuns acolo **hoinărind**. Am încercat să opresc
hoinăreala cât timp o nevoie e nerezolvată. Au plecat **12 în loc de 8**: se îndepărtează *înainte* să
flămânzească, iar oprirea pe loc îi lasă acolo. Am scos-o. Cauza e hoinăreala-substitut din S12-15, și
reparația ei ține de înlocuirea substitutului — OWNER_VERIFY punctul 8.

### Trei gărzi care nu legau

Suita de mutații le-a găsit, și fiecare a fost o descoperire, nu o scuză:

- fixtura porții de nevoi avea un ciclu de 10 tickuri, deci mutația „verifică doar la ticul de
  nevoie" tot încăpea în fereastră. Acum ciclul e lung, fereastra strânsă, iar fixtura **verifică
  întâi că mutația chiar ar rata-o**;
- clauza „deja o rezolv pe asta" e apărată de rezervarea proprie a pionului: fără ea, tot ajunge la
  mâncare. Ce diferă e că își scrie o răcire pe nevoia pe care tocmai o rezolvă — și asta se
  asertează acum;
- mutația mea pe podeaua de muncă scotea doar jumătatea de jos a multiplicatorului, deci „mai fericit
  face mai mult" rămânea adevărat.

### Ce rămâne deschis, cu cifra lui

- **raportul drum/lucru a urcat de la 4,7 la 7,7.** Nevoile adaugă drum. Întrebarea despre batching
  (OWNER_VERIFY 7) devine mai apăsată, nu mai puțin.
- **hoinăreala-substitut costă acum oameni**: 8 din 32 pleacă în 100.000 de tickuri dintr-o colonie
  aprovizionată, fiindcă ies din raza aprovizionării. OWNER_VERIFY 8.
- căutările de nevoie costă **0,11 pași/tick**, indexul de zone **2,19** (garda leagă la 30). Ieftine.
- producția de hrană nu există: mâncarea din scenariul standard se pune cu comanda.

---

## Task Started — un executabil pentru Windows, și mutațiile mutate în repo

**Prompt:** „care era executabilul?", apoi „poti sa creezi un fisier .bat sau ceva care sa ruleze
comenzile?", apoi „comite-le si muta si mutatiile in tools/"
**Model:** Claude Opus 5

Proiectul avea deja `Kinstead.cmd` (viewerul) și `Verifica.cmd` (poarta), dar nimic care să adune
toate comenzile într-un loc. `kinstead.bat` face amândouă: dublu-click deschide un meniu, iar cu un
argument (`kinstead.bat check`) rulează o singură comandă și **întoarce codul ei de ieșire**, ca să
poată fi legat într-un lanț. Comenzi: `check`, `test`, `typecheck`, `ref`, `scurt`, `viewer`,
`mutatii`, `ajutor`.

Un detaliu care nu e cosmetic: hash-ul așteptat la `ref` se **citește din**
`.github/workflows/ci.yml`, nu se scrie în `.bat`. Două locuri cu același număr diverg, și cel care
divergea ar fi fost tocmai ăsta — cel pe care îl rulez eu ca să verific, nu cel pe care îl rulează CI.

Și mutațiile au intrat în repo, în `tools/mutatii/`, cu `npm run mutatii`. Stăteau în scratchpad, cu
rădăcina repo-ului scrisă **absolut**: o cale de pe mașina mea, într-un repo public, e o garanție că
nu merge la nimeni altcineva. Acum se deduce din locul fișierului (`import.meta.url`, două niveluri
în sus).

### Trei lucruri care s-au stricat

1. **Terminatoarele LF au rupt `cmd.exe`.** „Cannot find the batch label" — `goto` nu găsește o
   etichetă dacă fișierul n-are CRLF. Convertit, și `.gitattributes` cu `*.bat text eol=crlf`, ca să
   nu se întâmple iar la următorul clon. A șaptea oară când CRLF mușcă în proiectul ăsta.
2. **Meniul intra în buclă infinită** când stdin e la EOF (adică atunci când îl rulez eu, nu un om):
   `set /p` nu blochează, întoarce gol, și se reia. Plafonat la 3 citiri goale.
3. **Backtick-urile dintr-un `git commit -m "…"` au fost executate de bash.** Trei identificatori au
   dispărut din mesaj și s-a creat un fișier numit `jos`. Reparat cu `--amend -F <fișier>`. E a
   **noua** formă a aceleiași capcane de escaping; de aici încolo, mesajele de commit trec prin
   fișier, fără excepție.

Verificarea de arbore curat a suitei ignoră acum liniile `??`: `git checkout -- <fișier>` nu atinge
niciodată un fișier neurmărit, deci refuzul pe el bloca rularea pentru o ciornă lăsată alături, fără
să apere nimic.

## Task Completed

Livrat: `kinstead.bat`, `.gitattributes`, `tools/mutatii/` (harnașament + 3 suite, 89 de probe) și
`npm run mutatii`. Poarta verde, mutațiile 89/89 din locul nou.

---

## Task Started — S20-23, tăietura 1: stabilitatea

**Prompt:** „continua cu urmatoarea taietura"
**Model:** Claude Opus 5 · panou de design cu 5 lentile (46 de constatări, 17 critice), apoi
implementarea, testele și mutațiile de mine.

PLAN §0.5 dă testul literal — **pivnița 7×7 se prăbușește, 5×5 nu** — și DESIGN §5.2 dă regula
într-o propoziție: *4 la sprijin, −1 pe pas, 0 = imposibil*. Părea o tăietură de o zi. Panoul a găsit
17 probleme critice în ea, aproape toate **măsurate**, nu argumentate.

### Ce a schimbat panoul, înainte de orice linie de cod

**Regula era scrisă ca recurență.** „Suportul unui voxel = maximul vecinilor, minus 1." Panoul a
implementat-o și a rulat-o în **trei ordini de parcurgere** pe același teren: trei hărți diferite,
niciuna corectă — 10 din 25 de celule greșite, și **1 voxel prăbușit în loc de 9**. O recurență peste
un graf cu cicluri nu are punct fix unic, iar ordinea de parcurgere e exact lucrul pe care nu-l putem
lăsa să decidă. Rescrisă ca **definiție** peste mulțimea surselor — `suport(c) = max(0, suportMax −
d(c))`, cu `d` distanța minimă laterală prin solid până la un voxel *așezat* — are punct fix unic și
se implementează ca BFS mărginit. **Nicio funcție de acolo nu citește suportul altui voxel.**

**Constanta nu era fixată de testele din plan.** Perechea (5, 7) e singura care o determină, dar
testele scrise pentru ea erau tot 5 și 7 — adică exact cele două care **nu disting** între praguri
vecine. Panoul a măsurat tabelul întreg: 3, 4, 5, **6** țin; 7 dă 1 voxel, 8 dă 4, 9 dă 9. Deci
propoziția pentru jucător din v1 — „camere mai late de 5 nu stau singure" — e **falsă**. Cine sapă o
sală de 6×6, nu pățește nimic, și de atunci nu mai crede regula. Propoziția corectă e „cel mult 3
celule de orice sprijin", iar testul e acum tabelul de la 3 la 9.

**Ancora era citită prin `materialAt`, care minte cu două fețe.** `materialAt` întoarce AER pentru
orice cotă sub fereastra de voxeli a coloanei, și o face **deliberat** — calea nepromovată trebuie să
răspundă ce ar răspunde una promovată. Pentru stabilitate, răspunsul ăla e catastrofal:

- **talpa.** Pe un chunk **neatins**, 841 din 1024 de voxeli de pe nivelul de bază ies cu suport 0.
  Prima săpătură promovează 9 chunkuri, deci ~7.500 de voxeli ar cădea fără ca jucătorul să fi săpat
  acolo;
- **cusătura.** `zBaseM` e per chunk și diferă pe **86,8%** dintre perechile de chunkuri vecine
  (medie 3,67 m, maxim 18 m). Un vecin lateral aflat sub baza chunkului **lui** ar răspunde AER, deci
  aceeași cameră de 7×7 pierde 1 voxel în interiorul unui chunk și 4 dacă marginea ei atinge o
  graniță invizibilă de 32 m. Asta **e** K16, apărut de unde nu-l aștepta nimeni.

Stabilitatea citește acum fereastra **coloanei**, printr-un `bazaVoxeli` nou, și tratează ce e sub ea
ca ancoră absolută. Jumătatea de sus a lui K16 rămâne deschisă și e la OWNER_VERIFY 10 — e o judecată
vizuală la înălțime, plus o decizie de arhitectură.

**Harta de suport ar fi fost K05 din nou.** Varianta „hartă DERIVED sub steag murdar" părea evidentă,
fiindcă e tiparul regiunilor și al indexului de zone. Măsurată: reconstrucția în bloc dă **237.408
intrări / 144,6 ms** pentru cele 9 chunkuri pe care le promovează **o singură** săpătură, și
**1.332.035 / 1297 ms** la 49 — iar numărul de chunkuri promovate **nu scade niciodată**, deci e un
cost care crește cu vechimea coloniei. Interogarea pură costă **0,058 µs** pe un voxel așezat (o
citire) și **4,345 µs** pe unul atârnat (BFS mărginit), iar atârnați sunt **12 în tot scenariul
standard**. Nu există hartă.

**Invalidarea era de două ori mai mică decât trebuie.** v1 avea „discul de la z, plus un voxel
deasupra". Panoul a măsurat pe scenariul stâlpului scos: **13 celule se schimbă la z+1 și nouă ajung
la suport 0**; mulțimea din v1 prinde **una**. Restul ar fi rămas în picioare în lumea continuă și ar
fi căzut în cea încărcată — **M5 roșu**, dintr-o cauză pe care niciun test de unitate n-o vede.
Corect: două discuri Manhattan de rază 3, la z **și** z+1 — 50 de celule, nu 25.

**Și legea prăbușirii a fost măsurată, nu presupusă:** **(W−6k)² voxeli la z+k**, total ≈ W³/18. Adică
o pivniță de 7×7 pierde **un** voxel, nu tavanul; pentru o pâlnie care ajunge la suprafață e nevoie de
**145×145**. Bun de știut înainte să scrii un sistem de „prăbușiri spectaculoase" care nu se întâmplă.

### Ce s-a livrat

Patru commit-uri, în ordinea asta:

| commit | ce a schimbat |
|---|---|
| **regula** | `src/sim/stabilitate.ts` — `solLa` / `esteAsezat` / `suportLa` / `celuleAtinse` / `cadeDaca` / `cotaDeAsezare`; `Material.MOLOZ`; prăbușirea în `sapaVoxel` |
| **vederea** | `suportDacaSap`, `stareSapat`, `prabusireaPrevizualizata`, `viewer/overlay-stabilitate.ts` (tasta `S`), linia de HUD |
| **mutațiile** | 21 de probe în `tools/mutatii/stabilitate.mjs`, plus starea care nu era asertată |
| **reparațiile** | cele patru mutații ratate, fiecare un gol real |

Voxelul căzut devine AER și lasă **`MOLOZ`** pe prima celulă cu ceva solid dedesubt. Molozul e solid:
blochează drumul, trebuie săpat, și **e el însuși sprijin** — deci cascada se oprește prin masă, nu
doar prin geometrie. Varianta „devine aer și cade marfă" făcea prăbușirea o **recompensă**: primeai
camera, o lucarnă și piatra pe deasupra.

Căderea **nu** are plafon de pas. `maxStepM` e cât poate urca sau coborî un pion **mergând**; refolosit
ca plafon de cădere, cârligul de podea al mormanelor pierde 100% din marfă la 2+ niveluri, iar
`dezgroapa` lasă pionul în aer pe veci — și `îngropați`, asertat 0 în acceptanță, nu mai ajunge
niciodată la zero.

Desemnarea de pe un voxel care cade se **anulează**, nu se șterge: ștearsă, rezervarea rămâne pe un id
mort, `verificaRezervari` refuză, iar un save luat în fereastra aia anulează jobul la încărcare în timp
ce lumea continuă îl mai ține 25 de tickuri — două hash-uri, `9389ec95` și `622bf8ff`.

### Ce vede jucătorul, și de ce nu e cifra pe care o desena designul

Două lucruri măsurate au schimbat vizualizatorul după ce era deja proiectat.

**Previzualizarea nu se poate face pe o comandă.** `desemnează` e per celulă, deci o pivniță de 7×7 e
**49 de comenzi**, fiecare evaluată pe lumea neatinsă — în care nicio celulă săpată singură nu doboară
nimic. **Zero din 49** ar fi arătat vreun avertisment, iar tavanul ar fi crăpat la săpătura **46 din
49**, a unui pion pe care jucătorul nu-l urmărea. K07 în formă pură. `prabusireaPrevizualizata` rulează
peste **mulțimea** desemnărilor vii, deodată.

**Cifra nu e a celulei active.** Designul desena suportul voxelului de pe nivelul activ. Măsurat pe o
bază realistă: **0%** dintre ei au altă cifră decât 4 — în roca netulburată fiecare are solid dedesubt.
Vizualizatorul s-ar fi livrat arătând **nimic**. Ce contează e **tavanul**, adică nivelul pe care slice
view-ul îl taie: se desenează `suportDacaSap`, ce ar avea tavanul **dacă** sapi celula.

Iar culoarea poartă **acțiunea**, nu măsura: trei stări cu verb în ele — *sigur*, *ultima celulă* (lasă
rocă aici sau pune stâlp), *cade*. O măsură fără verb („1", portocaliu) nu spune nici cât mai poți săpa,
nici unde să lași rocă, iar DESIGN §9 regula 9 interzice oricum gradientul roșu→verde ca singur canal.
*Sigur* rămâne deliberat **nedesenat**: în rocă netulburată ar acoperi ecranul uniform și ar îngropa
exact cele câteva celule care contează — aceeași greșeală ca desenarea cifrei pe nivelul activ, cu altă
față.

### Ce au găsit mutațiile: 17 din 21 la prima rulare

Niciun tipar nu era prost scris. Toate patru arătau **teste care nu exercitau garanția pe care
pretindeau că o apără**, și trei dintre ele aveau aceeași formă: *repetarea ascunde geometria greșită*.

1. **Pionul cădea „și așa".** Aserțiunea venea după 60 de tickuri, iar `dezgroapa` îl coboară oricum,
   câte un metru pe tick. Mutată înainte de orice tick — dar tot verde, fiindcă fixtura săpa camera de
   jos pe **două** niveluri, deci tavanul cădea în două evenimente separate, câte un metru fiecare.
   Căderea de doi metri ieșea din două căderi de un metru. Fixtura refăcută: un gol de trei niveluri
   săpat la lățime **sigură** (5), apoi doar nivelul lui de sus lărgit la 7 — cade exact un voxel,
   podeaua pionului, iar pionul parcurge **trei metri deodată**, numărat o singură dată.
2. **Desemnările nu erau verificate deloc.** Testul se sprijinea pe `verificaRezervari` într-o lume
   **fără colonişti** — deci fără nicio rezervare de invalidat. Trecea la fel de verde dacă desemnările
   rămâneau agățate de voxeli dispăruți. Acum numără desemnările vii.
3. **Cascada n-avea fixtură.** `celuleAtinse` acoperă z și z+1, deci un voxel de la **z+2** nu ajunge
   niciodată în mulțimea inițială: singurul drum până la el e re-verificarea vecinătății după ce cade
   ceva de la z+1. Măsurat: 9×9 dă 9 voxeli pe **un** nivel; 13×13 dă 49 la z+1 și **1 la z+2**; 15×15
   dă 81 și 9. Testul nou folosește 13 — cea mai ieftină lățime care chiar cere cascada.
4. **Plafonul din BFS n-avea umbră în comportament.** Scos, nu se schimbă niciun bit — fiindcă ține
   răspunsul pozitiv, adică exact ce ar trebui să facă `max(0, …)` din definiție. Numai că `max(0, …)`
   **nu era scris**, deși documentația funcției îl dă ca definiție. Acum sunt amândouă, se acoperă unul
   pe altul, și se probează **perechea**, prin `e2`. Garanția nu e cosmetică: fără niciuna, un tavan la
   5 pași dă **−1**, care nu e nici 0 nici 1 — deci `stareSapat` ar răspunde *sigur* exact acolo unde e
   cel mai periculos.

Plus una găsită **scriind** probele: starea *ultima celulă* nu era asertată nicăieri. Testul verifica
doar capetele. Cazul care o leagă s-a **căutat**, nu s-a ghicit: măsurat, nicio cavitate
dreptunghiulară nu produce vreodată starea asta, fiindcă tavanul de lângă un perete rămas e mereu la un
pas de sprijin. E nevoie de un **stâlp izolat**, la exact 3 pași de perete — centrul unei pivnițe de
5×5.

### Alte patru lucruri care s-au stricat pe drum

- **Helperul de test minţea.** Prima versiune a lui `sapaCavitate` scana un bloc deasupra cavității și
  număra aerul — la o săpătură aproape de suprafață, blocul include **cerul**, deci raporta 100 de
  „prăbușiri" pentru o cameră de 3×3 care nu pierde nimic. Un helper de test care minte e mai rău decât
  niciun test. Citește acum din raportul de tick.
- **`itemePierdute === 0` era aserțiunea greșită.** Măsurat: o săpătură de **1×1** subterană pierde
  toate cele 20 de unități, fiindcă o pungă de un nivel n-are gabarit și `asazaItem` n-are unde să pună
  randamentul. E o proprietate **veche** a săpatului subteran, nu ceva ce aduce tăietura asta. Garda care
  chiar leagă e pierderea **per voxel săpat**, aceeași cu și fără prăbușire.
- **Pivnița din scenariul standard nu se prăbușea niciodată.** Folosea cota solului **sitului**, nu a
  celulelor ei, deci cavitatea se termina la un metru sub suprafață. Am încercat un helper de teren
  plat; tot 8 prăbușiri în loc de cifra așteptată. Am **anulat complet** schimbarea: o pivniță pe
  jumătate funcțională în scenariul standard arată ca acoperire fără să fie.
- **Testul de acoperire a lui `digYield` a picat** fiindcă MOLOZ e un material solid nou. Nu era o
  regresie — era invariantul existent funcționând exact cum trebuie: un câmp nou invalidează un
  catalog vechi.

## Task Completed

**Tăietura 1 din S20-23 e livrată:** stabilitatea, prăbușirea, previzualizarea. **333 de teste**,
**110 din 110 de mutații** pe patru suite, zero controale invalide, zero tipare lipsă. Hash de
referință `2d43a7df`, neschimbat față de prima jumătate a tăieturii.

Costul: **89–94 µs/tick** pe scenariul standard. Cifra **nu** se compară cu cele 79–81 µs din
tăietura 3, și motivul contează mai mult decât numărul: HEAD-ul de **dinaintea** stabilității,
măsurat azi spate-în-spate pe aceeași mașină, dă **93–98 µs/tick**. Adică mașina merge mai încet, nu
codul. Scrisă alături de 79–81, cifra de 89 ar fi raportat o regresie de 10% care nu există.
Măsurată corect, **stabilitatea nu costă nimic**: interogarea e pură și mărginită, iar scenariul
standard n-are cavități destul de late cât să doboare ceva.

Ce rămâne din S20-23: blueprints, materiale, multi-etaj, scări, acoperișuri, grinzi (`suportRazaGrinda`
e deja în `rules.json`, neîntrebuințat). Și două lucruri la tine, în OWNER_VERIFY: dacă regula se
**citește** de pe ecran (punctul 9) și dacă tavanul ferestrei de voxeli se vede ca o linie invizibilă
într-un perete înalt (punctul 10).

---

## Task Started — recenzia adversarială a tăieturii de stabilitate

**Prompt:** „continua"
**Model:** Claude Opus 5 · recenzie cu 6 lentile + verificatori adversariali (59 de agenți, 7,2 M
tokeni), apoi reparațiile, testele și mutațiile de mine.

### Cum s-a putut rula în paralel cu mutațiile

Suita de mutații rula în repo și **rescrie fișiere sursă**, restaurându-le prin `git checkout`. Un
recenzor care citește din arborele viu ar fi citit, din când în când, o versiune stricată intenționat
— și ar fi raportat defecte fantomă. Mai devreme în sesiune ciocnirea a și avut loc: comenzile mele
de `git` peste `git checkout`-ul harnașamentului au dat `.git/index.lock: File exists`, rularea a
murit după ~15 probe, și a lăsat o mutație **aplicată** în `src/sim/zone.ts`.

Soluția a fost un **instantaneu**: `git archive HEAD | tar -x` într-un director separat. `git
archive` citește obiecte, nu indexul, deci nu se ciocnește; iar recenzorii au primit o copie fidelă
a lui HEAD, cu teste care rulează, și interdicție explicită să atingă repo-ul.

### Ce a găsit: 21 de constatări confirmate de doi verificatori independenți

Fiecare constatare a trecut prin doi verificatori adversariali cu unghiuri diferite — unul care
trebuia s-o **reproducă**, unul care trebuia s-o **respingă citind până la capăt** — și a fost
păstrată doar dacă amândoi au spus „reală". Două au căzut. Am reprodus eu însumi fiecare constatare
critică înainte să schimb o linie.

**1. O săpătură la marginea de vest prăbușea un voxel la marginea de EST, la 16 km.**
`cellKey(wx, wy, z) = ((z + 512) * 16384 + wy) * 16384 + wx` nu are gardă de interval, deci
`cellKey(-1, 624, 25)` e bit cu bit `cellKey(16383, 623, 25)`. `celuleAtinse` construia cheile
pentru tot discul fără să verifice limitele: **18 din 50** decodau în celule reale de la capătul
opus, iar `cadeDaca` le evalua și le prăbușea. Măsurat: rocă ștearsă la 16 km, hash mutat
(`48d4c8fa` → `3dae6bd4`).

Ce doare aici: **garda exista și era corectă.** `solLa` verifică limitele și răspunde ANCORĂ, iar
testul „marginea lumii e PERETE" o proba. Numai că nimeni n-o întreba pe drumul ăsta — cheia se
construia înainte, și după `cellKey` informația „era în afara lumii" nu mai există în ea. De-aia
garda se pune înainte de `cellKey`, și nicăieri mai jos.

**2. `stareSapat` răspundea la altă întrebare decât cea a jucătorului.** Se uita la suportul UNUI
voxel — cel direct deasupra celulei. Dar ce cade când sapi nu e, în general, voxelul de deasupra:
săpatul rupe și conectivitatea **laterală**. Voxelul de deasupra e prin construcție la un pas de un
vecin așezat imediat ce sapi la marginea unei camere, deci primea suport 3 și răspunsul ieșea SIGUR.
Reprodus, pe camere **dreptunghiulare**:

| cameră | SIGUR | ULTIMA | CADE | spun SIGUR și chiar prăbușesc |
|---|---|---|---|---|
| 6×7 | 168 | 0 | 0 | **2** |
| 6×9 | 184 | 0 | 0 | **6** |
| 6×13 | 216 | 0 | 0 | **14** |

Zero pătrate desenate într-o cameră care se prăbușește — exact eșecul pentru care overlay-ul există.
Acum întreabă ce trebuie („ce se întâmplă dacă sap AICI"), prin aceeași propagare pe care o folosește
prăbușirea reală: `cadeDaca` și `stareSapat` împart un singur nucleu, `propaga`. După reparație:
0 minciuni și 0 alarme false în toate trei, și apare în sfârșit ULTIMA CELULĂ (8 în fiecare).

**3. Overlay-ul nu desena nimic, din încă două motive independente.** Pătratele se desenau la
`zActiv + 1.02`, iar planul de tăiere păstrează `y <= sliceLevel` — erau tăiate din shader. Și
nivelul judecat era greșit cu unu: voxelul de la nivelul L ocupă `y ∈ [L, L+1]`, deci nivelul
`sliceLevel` e integral peste plan. Iar cu slice-ul **oprit** — starea implicită — nivelul se lua din
`camera.position.y`, adică altitudinea camerei, zeci de metri deasupra terenului. Trei cauze
independente, fiecare suficientă singură.

**4. Prăbușirea curăța doar VÂRFUL coloanei.** Molozul aterizează la `cotaDeAsezare`, care la o
cădere de mai multe niveluri e cu totul altă celulă — iar acolo nu ajungea niciun cârlig. Un pion de
pe cota de aterizare rămânea **zidit în moloz**, necalcabil, și `pioniCazuti` **nu creștea**; un
morman rămânea înregistrat într-o celulă devenită solidă (marfă nici pe jos, nici numărată pierdută);
o celulă de zonă rămânea vie pe teren necalcabil.

Asta a **mutat hash-ul de referință**: `2d43a7df` → `95dafb4f`. Măsurat cu același instrument pe
ambele commit-uri: aceleași 8 prăbușiri, **zero** pioni căzuți — și totuși **34 de coloniști vii în
loc de 30**. Deci nu pionii au mutat-o, ci mormanele și zonele: marfa care rămânea blocată ajunge
acum unde se poate lua. **Opt voxeli prăbușiți la 100.000 de tickuri costau 10% din colonie.**

**5. Ordinea (z crescător) a mulțimii care cade n-avea niciun test** — comparatorul inversat lăsa
toate cele 333 de teste verzi. Și lipsea dintr-un motiv pe care nu-l vedeam: toate fixturile săpau
**progresiv**, deci fiecare eveniment era de un nivel, și ordinea nu putea să conteze.

**6. Gradientul era aproximat, nu asertat** („între 0 și 4 exclusiv" acceptă 1, 2 sau 3), și
`progresMm` nu se reseta la cădere — singura repoziționare din nucleu care n-o făcea.

### Lecția, și e una nouă

Suita de mutații dăduse **21 din 21**. Toate probele erau valide și toate prindeau. Și codul era
greșit în cazul general.

Motivul: **o mutație probează că testele leagă codul pe care îl ating fixturile — nu poate inventa un
caz pe care fixturile nu-l ating niciodată.** Toate fixturile mele erau **pătrate** (7×7, 9×9, stâlp
în centru), iar într-o cameră pătrată ce cade chiar *e* voxelul de deasupra centrului. Versiunea
greșită nimerea răspunsul din întâmplare, deci nicio mutație n-avea cum s-o dea în vileag. La fel
cu ordinea: fixturi progresive ⇒ evenimente de un nivel ⇒ ordinea nu putea conta. Și la fel cu
marginea lumii: niciun test nu sapă vreodată la `wx = 0`.

Deci mutațiile și recenzia nu sunt redundante — răspund la întrebări diferite. Mutația întreabă „mai
apără ceva testul ăsta?"; recenzia întreabă „ce n-ai construit niciodată?".

### Ce NU am reparat, și cu ce cifră

- **`fill` nu trece prin stabilitate.** Se poate zidi un bloc în aer, cu suport 0, care nu cade
  niciodată — deci `suport(c) > 0` e un invariant fals pe starea salvată. DESIGN §5.2 cere explicit
  „verificare O(1) la plasare", dar asta e **construcția**, adică restul lui S20-23. Îl las cu
  măsurătoarea, nu îl strecor aici.
- **Previzualizarea nu se memorează.** Măsurat: 2,9 ms la 49 de desemnări, 16,7 ms la 196, 32 ms la
  400, și 600–700 ms la 4096. Overlay-ul o recalculează identic la fiecare reconstrucție. Peste ~200
  de desemnări vii, un cadru se pierde.
- **Costul real e în stratul de teren.** `stareSapat` costă ~19 µs/celulă, și nu din cauza regulii:
  `locate` alocă un obiect și cheamă `ensureChunk` la fiecare acces, iar `solLa` o face de două ori.
  Overlay-ul plătește asta doar lângă goluri (prefiltru cu transformată de distanță), dar reparația
  adevărată e în cel mai fierbinte strat al proiectului și nu intră într-o tăietură de stabilitate.
- **Cârligul de retragere a zonelor tot n-are test.** Mormanul și pionul au primit unul; zona nu.

## Task Completed

**Șase commit-uri de reparații.** 337 de teste, 28 de probe de mutație pe stabilitate (117 în total),
hash de referință **nou**: `95dafb4f`, cu motivul scris în commit și aici. `.github/workflows/ci.yml`
actualizat.

OWNER_VERIFY punctul 9 rămâne — și e acum o întrebare mai onestă. Prima dată îți ceream să te uiți la
un overlay pe care nu-l văzusem niciodată pe ecran, și care, măsurat, nu desena nimic. Acum desenează
ce trebuie, dar tot nu l-am văzut: dacă e **lizibil** rămâne singura întrebare pe care nu pot s-o
închid din cod.

---

## Task Started — S20-23, tăietura 2: construcția

**Prompt:** „continua"
**Model:** Claude Opus 5 · panou de design cu 5 lentile care **măsoară** (44 de agenți, 5,8 M tokeni),
pe un instantaneu al lui HEAD; apoi implementarea, testele și mutațiile de mine.

Am scris întâi un design v1 — verificare la plasare (ca să închid golul lui `fill` găsit de recenzia
tăieturii 1), `Desemnare.CONSTRUIESTE` printr-un driver nou, materiale din `rules.json`, și grinda cu
rază 10 din DESIGN §5.2 — și l-am dat panoului să-l demonteze. **Nu stă în forma scrisă.** Nouă
constatări critice confirmate de câte doi verificatori independenți, zece respinse la verificare,
treizeci și două important/minor.

### Cele trei lucruri care schimbă structura

**1. Grinda iese din tăietură.** DESIGN §5.2 cere „grinda reintroduce un punct de sprijin cu rază
10". Panoul a implementat-o în patru variante și le-a măsurat pe toate:

- *grinda e sursă necondiționat* — ordine-independentă, dar își e propria sursă la d=0, deci suport
  10 oriunde. Măsurat: **un lanț de 31 de grinzi plutind în cer**, suport minim 10, niciuna nu cade;
  o podea de 31 de celule zidită peste el are suport 4. O grindă aruncată în aer poartă o fortăreață;
- *grinda trebuie să fie ea însăși așezată* — un no-op: `suportRazaGrinda` rămâne conținut mort;
- *grinda e sursă dacă e susținută* — **pierde punctul fix unic**, adică exact defectul de la care a
  pornit tăietura 1;
- *surse STRATIFICATE* (nivel 0 = celule așezate, rază 4; nivel 1 = grinzi cu suport > 0 calculat
  DOAR din nivelul 0, rază 10) — corectă, punct fix unic, verificată pe 8 ordini.

Deci forma corectă există. O amân oricum, pentru un motiv de cost care nu ține de ea: **raza maximă e
o constantă GLOBALĂ a rezolvatorului.** În clipa în care există o grindă pe hartă, fiecare interogare
plătește discul de rază 10 — și proba e o grindă **fictivă la 400 de celule** de săpătură, care face o
previzualizare 9×9 să coste **404,8 ms în loc de 9,4**, fără să schimbe niciun răspuns. Discul de
invalidare urcă de la **50 la 362 de celule** (×7,24), iar cel mai rău caz măsurat — o singură editare
lângă o cavitate 21×21 — trece de la 13,3 ms la **173,3 ms**, adică 3,5 tickuri pentru o lovitură de
târnăcop. E K05 din nou, în altă haină.

Kitul scade de la patru piese la **trei**: PERETE, PODEA, SCARĂ. `suportRazaGrinda: 10` rămâne în
`rules.json`, dar primește acum un invariant încrucișat `>= suportMax` — azi `RULES_SPEC` le validează
independent, deci constanta putea fi pusă SUB plafon fără ca nimic să se înroșească.

**2. Validatorul unic e o greșeală, și e exact K07 în oglindă.** Designul propunea un singur
`poateSustine` per celulă. Măsurat: pe o casă de 9×9 cu trei etaje și podea — 177 de celule — el ar
refuza **145 din 177 (82%)** la desenare, fiindcă piesele care încă nu există nu se sprijină reciproc.
Cu adevărat imposibilă e **una**.

Și răspunsul corect nu se poate da nici dintr-o singură trecere peste planul terminat: pe 200 de
planuri aleatoare, „suport > 0 dacă umplu tot" a promis 85,8 celule din 112 în medie, dar incremental
se puteau construi 64,5 — **supra-promisiune în 200 din 200 de cazuri**. Răspunsul e un **punct fix**,
exact ca prăbușirea. Deci `constructiaPosibila` e fratele lui `cadeDaca`, iar verificarea se sparge în
trei contracte: la desenare doar proprietăți independente de ordine (niciodată sprijinul), peste
mulțime la mouse-up, și `poateSustine` ca poartă finală la ZIDEȘTE.

Riscul pe care îl scrisesem eu — „aceeași clădire se ridică sau nu, după noroc, fiindcă ordinea e
emergentă" — e **fals**, și se șterge. Regula e monotonă: a adăuga un voxel poate doar să scadă
distanțele, deci mulțimea construibilă e o închidere. 85.835 de perechi verificate, 0 încălcări; 300
de planuri × 4 ordini, 0 diferențe. Se înlocuiește cu un **test de proprietate**: monotonia e o
garanție, nu un accident.

**3. Felul desemnării nu e citit de nimeni.** `cautaJob` parcurge `desemnari` fără să se uite vreodată
la `d.kind[s]`; singurul loc din tot `src/` care îl compară cu `Desemnare.SAPA` e
`prabusireaPrevizualizata`. Reprodus în lumea scenariului standard: o desemnare cu alt fel e luată ca
job de SĂPAT, `jobKind = SAPA`, iar la tickul 3047 **desemnarea e ștearsă și celula e goală**.
Jucătorul cere un perete, primește o groapă — zero refuzuri, zero cauze, niciun test înroșit.

Nu e o regresie: cu un singur fel, `else` era corect. E aceeași familie cu tabelul de drivere din
S16-19 — o presupunere care devine falsă la al doilea membru.

### Ce a mai ieșit, și n-aș fi găsit singur

- **Zidire + săpare = duplicator de piatră.** `piese.cantitate` și `digYield` sunt două tabele care nu
  se privesc. Măsurat: marfă 0 → `fill PIATRA_CONSTRUITA` → `dig` → **marfă 20**. Cu cifra din propriul
  meu exemplu (`cantitate: 10`) e un ciclu de tipărit piatră, 2× pe ciclu, fără limită. Reparația e un
  invariant încrucișat în `parseRules` — tiparul există deja acolo — plus un al treilea termen,
  `unitatiZidite`, ca invariantul de conservare să rămână verificabil în loc să fie slăbit.
- **`anuleazaDesemnare` filtrează pe `jobTarget`**, iar șantierul ar sta în `jobDest`. Măsurat: după
  anulare, jobul rămâne viu spre un id mort, cu o rezervare orfană; `reconstruiesteRezervari` îl aruncă
  la încărcare în timp ce lumea continuă îl ține — **M5 roșu din prima zidire**.
- **§5 din designul meu („multi-etaj nu adaugă nimic") e fals.** Măsurat cu închiderea: o podea peste o
  cameră 9×9 lasă **1 celulă imposibilă** în centru, 15×15 lasă **49**, iar 21×21 pe trei etaje lasă
  **507 din 2043**. Cu `suportMax = 4`, camera acoperită se plafonează la 9 lat, și un gol în perete la
  6 celule. Astea nu sunt bug-uri, sunt **regulile jocului** — dar trebuie scrise și arătate prin
  previzualizare, nu descoperite după ce jucătorul a desenat.
- **„Verificare O(1) la plasare" din DESIGN §5.2 e falsă și azi**, nu doar cu raza 10: 0,137 µs pe sol
  (o citire), dar **5,767 µs** pe un refuz în centrul unei podele 9×9, fiindcă e un BFS mărginit. Se
  schimbă propoziția din DESIGN, nu regula.

### Două cifre pe care sinteza le-a respins, deși veneau de la propriile lentile

Merită scrise, fiindcă arată că verificarea a funcționat în ambele sensuri:

1. „0,249 µs → 35,118 µs pe un voxel AȘEZAT" e adevărată doar dacă renunți la scurtătura
   `așezat → suportMax`. Cu ea păstrată — ce se va face — calea comună nu se mișcă: **0,153 → 0,172 µs**.
2. „O grindă scumpește tot jocul de 10×" e prea tare: costul urmărește **cât atârnă**, nu raza. Pe o
   cavitate 9×9 costul chiar **scade** (1,248 → 0,462 ms), fiindcă la rază 10 nu mai cade nimic.
   Concluzia rămâne, dar motivul scris e cel corect: cel mai rău caz sparge bugetul unui tick.

### Ordinea de implementare, cu ce se poate rula la fiecare pas

| # | pasul | se poate rula |
|---|---|---|
| 1 | **poarta pe fel** — două bucle în trecerea ieftină, `viiSapa`/`viiConstruieste`, a treia categorie, cele trei citiri de `laCelula` | o desemnare cu alt fel stă 1000 de tickuri neatinsă; **mutația care scoate garda** |
| 2 | **schema 7** — `desemnari.piesa` singurul câmp nou, `Piesa.NICIUNA = 0`, migrare 6→7 cu fixtură golden, re-ancorarea hash-ului **o dată** | cele 4 fixturi golden încarcă; M5 verde cu 0 blueprinturi |
| 3 | **conținutul** — trei piese, invariantul `cantitate === digYield`, `unitatiZidite`, `suportRazaGrinda >= suportMax` | fiecare invariant cu proba lui negativă |
| 4 | **stabilitatea la zidire** — `FARA_SPRIJIN`, `CELULA_PLINA`, `suportDacaZidesc`, `fill` trece prin ea | **golul principal se închide**: nu se mai poate zidi la 5 m în aer |
| 5 | **închiderea + previzualizarea** — `constructiaPosibila`, hartă TRANSIENT cu steag murdar, refuz la desenare | casa 9×9: **176 din 177 construibile, 1 refuzată** |
| 6 | **driverul** — `FelJob.CONSTRUIESTE`, pionul stă LÂNGĂ nu PE, `jobTarget \|\| jobDest`, scanerul citește harta | casa se ridică; M5 cu o zidire în curs |

Pașii 1–3 sunt reparații pe cod existent și rulează **înainte** să existe o singură piesă zidită.

## Task Completed — cinci pași din șase

**Livrat:** pașii 1–5 din ordinea scrisă de panou. **365 de teste**, **27 de probe de mutație pe
construcție**, **142 din 142 prinse** pe cinci suite, hash de referință `605e9178`.

Rămâne pasul 6, driverul: `FelJob.CONSTRUIESTE` în tabelul de drivere, pionul care cară materialul
la șantier și zidește. Casa se poate desena și se poate verifica; încă nu se ridică singură.

### Ce s-a livrat, pas cu pas

| pas | ce | cifra care îl închide |
|---|---|---|
| 1 | poarta pe felul desemnării | o desemnare de alt fel stă 1000 de tickuri neatinsă; fără ea, ștearsă la tickul 3047 |
| 2 | schema 7 (`desemnari.piesa`, a treia categorie) | hash `0ffe0a4e`, mutat **o singură dată**, din două cauze |
| 3 | kitul de trei piese + invarianții | zidire + săpare producea 20 de unități din nimic |
| 4 | stabilitatea la zidire | hash `605e9178`; scenariul standard zidea el însuși un bloc plutitor |
| 5 | închiderea + desenarea + previzualizarea | casa de 177 de piese: 177 desenate, 176 construibile, 1 imposibilă |

### Trei lucruri pe care le-am aflat greșind, și au schimbat codul

**1. Am fost la un pas să simplific închiderea într-o singură trecere.** Demonstrasem în cap că e
echivalentă cu „ce suport ar avea fiecare piesă dacă toate ar exista", și pe o **casă** chiar este —
măsurat, 344 și 344, fiindcă o casă e stratificată și fiecare piesă își are sprijinul sub ea. Pe
planuri neregulate nu: naivul promite mai mult în **200 din 200** de cazuri, 231,4 celule față de
168,9, cu un exces maxim de 138. Demonstrația trata drumul lateral și uita că așezarea vine de
**dedesubt** — o piesă planificată sub alta poate fi ea însăși imposibilă.

**2. `suportDacaZidesc` întreba ipoteza dacă celula e deja solidă, apoi arunca ipoteza** — deci
răspundea 0 pentru ceva ce tocmai i se spusese că există. Închiderea nu vede cazul (celula testată
nu e încă în mulțime), dar primul apelant din afară l-a văzut imediat.

**3. Scurtcircuitul „celula e deja plină" era în măsurătoare, nu în poartă.** Pe un bloc plutitor,
măsurătoarea răspunde corect 0, iar poarta îl citea și refuza cu `FARA_SPRIJIN` când informația utilă
e că celula e plină. O măsurătoare care minte ca să fie comodă nu mai e o măsurătoare.

### Poarta de plasare a prins ceva ce era în cod de la început

`fill` nu trecea **deloc** prin regula de stabilitate, deci `suport(c) > 0` era un invariant fals pe
starea salvată. Prima dată când poarta a rulat, a refuzat **scenariul standard**: el sapă trei voxeli
în jos și punea zidul deasupra gropii. Comentariul spunea „garantat gol" — adevărat, și irelevant:
era gol și *dedesubt*. Hash-ul de referință din CI acoperea, de la început, un bloc care încalcă
regula de stabilitate a propriului joc.

Și patru fixturi de test zideau în aer, toate corecte până atunci. Două asertau „deasupra
headroom-ului se poate"; testează acum ce voiau de fapt — că garda de *ocupare* nu se mai aplică.
Iar fixturile noi aveau nevoie de teren plat **și uscat**: prima variantă a nimerit un sit la −47 m,
unde celula de la cota solului e apă, deci nu susține nimic.

### Instrumentul care mințea

De două ori suita de mutații a raportat `restaurat: da` pe toate probele și a lăsat totuși o mutație
**aplicată** în arbore. Prima am găsit-o abia după două zile, când un test fără legătură a picat.

Mecanismul, găsit la a treia reproducere: `git commit` pornește `git gc --auto` în fundal;
`git checkout -- <fișier>` copiază din **INDEX**, nu din HEAD; un `git status` concurent
reîmprospătează cache-ul de stat al indexului, iar dacă prinde fișierul *mutat*, git crede că
arborele îl oglindește deja și **sare peste copiere**. Apoi aceeași minciună răspunde și la
verificare. Ambele jumătăți se sprijineau pe aceeași stare coruptă.

Reparat: `git checkout HEAD --`, verificare pe **conținut** (se cere tiparul înapoi în fișier, nu se
întreabă git — el e partea care poate minți), trei încercări, și eșecul se strigă cu numele
fișierelor. Rulat de patru ori consecutiv imediat după commit — condiția care îl reproducea —
arbore curat de fiecare dată.

Am contribuit și eu la întârziere: într-o rulare filtrasem ieșirea cu un grep care arunca exact linia
`restaurat:`. Un instrument care spune adevărul, citit printr-un filtru care îl ascunde.

### Cinci probe ratate, cinci goluri de fixtură

Niciuna n-a fost un tipar prost scris. Cea mai instructivă e ultima: filtrul pe fel din
previzualizarea de construcție nu putea fi probat, fiindcă o desemnare de **săpat** stă mereu pe o
celulă solidă, iar închiderea scoate celulele solide din mulțime — deci inclusă din greșeală, n-ar fi
schimbat niciun număr. Cazul care îl leagă e o desemnare de săpat rămasă pe **aer**, produsă prin
editare directă de teren. Aceeași lecție ca la recenzia tăieturii 1: **o mutație probează ce ating
fixturile.**

Și șapte tipare s-au învechit pentru că s-a mutat codul de sub ele — de fiecare dată prinse ca
`TIPAR LIPSA`, adică raportate ca eșec, nu înghițite. **Trei dintre ele au ieșit abia la rularea
tuturor suitelor**, în cele vechi: garda de ocupare a ieșit din `fill` în `celulaLibera`, iar BFS-ul
lateral a primit canalul ipotetic. Exact motivul pentru care regula spune să rulezi TOATE suitele după
fiecare tranșă, nu doar pe cele noi — tocmai cele vechi putrezesc. Reancorate, probele acoperă acum
și `desemnează`, nu doar `fill`: aceeași funcție apară ambele comenzi.

### Ce rămâne, cu cifra lui

- ~~**pasul 6, driverul.**~~ **ÎNCHIS (reconciliat 25.09):** `anuleazaDesemnare` filtrează acum pe `jobTarget` **sau** `jobDest`, cu un comentariu care numește exact cazul constructorului. *Constatarea de atunci:* `anuleazaDesemnare` filtrează pe `jobTarget`, iar șantierul ar sta în
  `jobDest` — măsurat de panou: job orfan, rezervare pe id mort, M5 roșu din prima zidire. Se repară
  în același pas cu primul job de construcție, nu după.
- ~~**`rang(FARA_SPRIJIN)`**~~ **NU SE FACE (reconciliat 25.09):** scanerul din 6c sare șantierele nesprijinite FĂRĂ cauză — o poziție în coadă, nu un refuz — deci condiția nu se împlinește pe designul ăsta; vezi „nelegabil în v2 prin construcție", mai jos. *Era:* se adaugă când un scaner chiar îl emite. O cauză pe care nimeni n-o
  produce nu poate fi legată de nimic.
- **grinda** (`suportRazaGrinda: 10`), amânată cu cifra ei: o singură editare lângă o cavitate de
  21×21 trece de la 13,3 la 173,3 ms, iar discul de invalidare de la 50 la 362 de celule.
- ~~**overlay-ul de construcție** — previzualizarea există în nucleu; desenarea ei pe ecran nu.~~ **LIVRAT (reconciliat 25.09):** `viewer/overlay-stabilitate.ts` desenează piesele IMPOSIBILE din `constructiaPrevizualizata`, proiectate pe nivelul activ.

---

## Tăietura 2, pasul 6b — driverul de construit, și un instrument care mințea

**Prompt:** `continua`
**Model:** Claude Opus 5

Un pion cară materialul și ridică peretele, cap-coadă. `DRIVER_CONSTRUIESTE` intră în tabel cu
cele cinci metode de contract, deci felul nou nu mai are niciun `else` care să-l presupună altceva.

### Unde „reutilizează mașinăria de CARA" NU se aplică

La carat, destinația e o celulă de ZONĂ și pionul trebuie să fie **pe** ea. La construit,
destinația **devine solidă**. Luată literal, mașinăria l-ar fi trimis exact pe celula pe care
urmează s-o zidească, iar `celulaLibera` l-ar fi refuzat — pionul și-ar fi blocat singur șantierul.
Deci locul de lucru e un vecin calcabil, ales ca la săpat.

Corolarul, verificat de panoul de design: poziția de lucru iese **gratis** din regula de
stabilitate. O celulă cu suport > 0 are ori solid dedesubt, ori un vecin lateral solid la aceeași
cotă. Nu e nevoie de o regulă separată de accesibilitate.

Zidirea trece acum printr-o **singură** funcție, `zidesteVoxel`: celulă liberă, sprijin, teren.
Comanda `fill` și jobul o cheamă pe aceeași — scrise de două ori, un pion ar fi putut face ce
jucătorului i se refuză.

Două gărzi la PORNIRE, și amândouă există pentru că `ridica` ia `min(cerut, găsit)`: un morman de
alt fel sau prea mic nu produce niciun refuz, produce un pion care merge, ridică ce e, muncește 400
de tickuri și abia atunci descoperă că n-are din ce zidi.

Măsurat pe fixtură: **76 de tickuri** cap-coadă — 5 mers la morman, 10 ridicat, 21 mers la șantier,
40 zidit. Pionul termină la 16112, adică **lângă** șantierul de la 16111, nu pe el.

### Instrumentul edita altundeva decât credea

Prima rulare de mutații: 35 din 39, patru RATATE. Una dintre ele — „șantierul rămâne după ce piesa
e pusă" — mi-a atras atenția, fiindcă testul pentru ea **exista** și verifica exact asta. Aplicată
cu mâna, mutația era prinsă imediat.

`aplica` folosea `String.replace` cu tipar-șir, care înlocuiește **prima** apariție. Tiparul meu,
`terminaJob(…TERMINAT)` + `stergeDesemnare(d, ds)`, apărea identic la 1473–1474 (în `sapa`) și la
1541–1542 (în `zideste`). Harnașamentul scotea ștergerea desemnării din **săpat**, apoi rula
testele de construcție — care nu sapă. Ieșea RATATA.

**Asta e mai rău decât o ratare oarecare: te trimite să scrii un test pentru o gardă care era deja
probată.**

Un audit peste toate cele 158 de probe a găsit trei tipare ambigue — **toate trei născute în
aceeași zi**, de pasul 6b, care dublase trei forme de cod în `joburi.ts`. Două dintre ele erau
probe de **carat**, verzi de la tăietura 2, care de azi mutau codul de construit și rămâneau verzi
fiindcă nimeni nu le mai măsura ținta. Plus trei tipare învechite de mutarea codului în
`celulaLibera`/`zidesteVoxel`.

`aplica` întoarce acum motivul, nu un boolean: `lipsa`, `ambiguu:N`, `nula` (o editare care nu
schimbă nimic e tot un control invalid) sau `ok`. Ambiguitatea **nu** se rezolvă alegând a doua
apariție: care dintre ele e cea gândită e o întrebare la care doar autorul probei poate răspunde.

Una dintre cele trei duplicări nu trebuia să existe: `DRIVER_SAPA.refaTinta` și
`DRIVER_CONSTRUIESTE.refaTinta` erau octet cu octet identice. O funcție, un adevăr.

### Celelalte două RATATE erau goluri adevărate

**Conservarea.** Acceptanța verifica `caraCantitate === 0` — care arată la fel și când materialul
se consumă, și când nu se consumă deloc: `terminaJob` lasă orice mână plină jos, deci cele 20 de
unități aterizau lângă perete și contorul din mână era tot zero. Materia se tipărea în tăcere.
Un proxy în locul invariantului, exact tiparul de la „un câmp nou invalidează un invariant vechi".
Acum se verifică `marfaTotala + unitatiZidite`, și că nu rămân mormane pe jos.

**Paza de poziție.** Pasul ZIDEȘTE e un pas de **oprire**, deci pionul ajunge acolo prin mașinăria
de mers și e pe poziție din prima — fixtura nu-l scotea niciodată de acolo, deci `if (false)` nu
schimba nimic. Verificarea apără altceva: clipa în care pionul **nu mai e** unde era, fiindcă i s-a
săpat podeaua de sub picioare sau l-a mutat o prăbușire. Testul nou îl mută, exact cum face lumea.

A patra RATATĂ nu era nici gaură, nici defect de instrument: declarasem testul greșit. `tinteVii` e
consultat **doar** la reconstrucția rezervărilor, adică la încărcare — deci testul care o probează
e M5, nu acceptanța. M5 chiar se înroșise; eu mă uitam în altă parte.

### Cifre

- **374 de teste**, 27 în `tests/constructie.test.ts`.
- **159 de probe** de mutație, 0 tipare lipsă, 0 ambigue, 0 controale invalide.
- **Toate** cele cinci suite: construcție 41/41, carat 46/46, drivere 12/12, nevoi 31/31,
  stabilitate 29/29. Nu doar cele noi — tocmai cele vechi putrezesc, și azi s-a văzut de ce.

### Ce rămâne

- **pasul 6c, scanerul.** Alegerea automată a blueprinturilor, citind închiderea, ca să nu propună
  niciodată o piesă nezidibilă — panoul D4 a măsurat 1,2 drumuri irosite pe piesă altfel.
- ~~**`rang(FARA_SPRIJIN)`** — se adaugă când scanerul chiar îl emite.~~ **NU SE FACE (reconciliat 25.09):** scanerul sare șantierele nesprijinite fără cauză, deliberat.
- **grinda** (`suportRazaGrinda: 10`), amânată cu cifra ei.
- ~~**overlay-ul de construcție** — previzualizarea există în nucleu; desenarea ei pe ecran nu.~~ **LIVRAT (reconciliat 25.09):** `viewer/overlay-stabilitate.ts` desenează piesele IMPOSIBILE din `constructiaPrevizualizata`, proiectate pe nivelul activ.

---

## Tăietura 2, pasul 6c — panoul de design, și un blocant în pasul 6b

**Prompt:** `continua`
**Model:** Claude Opus 5

Panou adversarial înainte de orice cod: 5 lentile independente pe designul naiv v1, o sinteză, doi
adversari pe rezultatul ei. 8 agenți, 1,59M tokeni, 58 de constatări (12 blocante), din care 45
susținute de o măsurătoare. Arborele a rămas neatins — HEAD identic și suma tuturor surselor bit cu
bit aceeași înainte și după.

### Închiderea iese complet din scaner

Decizia cea mai importantă, și stă pe două măsurători care se completează:

1. **Închiderea supra-promite masiv față de „acum".** Între **71,6% și 84,4%** dintre celulele pe
   care `constructiaPosibila` le declară construibile au suport **0** în clipa măsurării — deci
   `zidesteVoxel` le-ar refuza cu `FARA_SPRIJIN` *după* ce pionul a cărat materialul. Măsurat pe 5
   planuri (casa 9×9×3: 176 construibile / 32 zidibile acum; neregulat 21×21×8: 529 / 150). În sens
   invers, **zero** celule zidibile-acum s-au găsit printre `imposibile`: închiderea le conține
   mereu. O incluziune nu e o egalitate, și s-a verificat în ambele direcții.

2. **„Zidește tot ce se poate ACUM, repetă" converge EXACT la închidere.** 5 planuri din 5,
   `puse === construibile` și `rămase === imposibile`, octet cu octet. Casa 9×9×3: 176/1 în 7
   valuri. Neregulat 21×21×8: 529/702 în 16 valuri. Nu e noroc — bucla de punct fix din
   `constructiaPosibila` **este** lacomul-acum peste o mulțime ipotetică.

Deci închiderea nu cumpără scanerului nicio celulă pe care poarta pe terenul real să n-o dea oricum.
Singurul ei aport unic e mulțimea `imposibile`, iar aia e o întrebare de **overlay**, nu de tick, și
are deja răspuns în afara buclei: `constructiaPrevizualizata`, chemată la desenare.

Consecința e mai mare decât o optimizare: dispare cache-ul, dispare canalul de invalidare, și cu ele
dispare **prin construcție** o clasă de defecte pe care două lentile au măsurat-o independent —
cache pe steag murdar care uită zidirea/săparea dă **M5 roșu** (`973687db` vs `45ad0b74`), iar memo
la nivel de modul cheiat pe `w.tick` dă divergență între lumi întrețesute pe care **M5 rămâne verde**
și n-o poate prinde. Argumentul de siguranță pentru un cache nu e „e DERIVED deci nu intră în hash" —
`d.reincercaLaTick` **este** hașuit, deci o decizie luată pe un cache învechit se imprimă în stare.

### Poarta e conjuncția, nu `poateSustine` singur

Pe o celulă umplută cu MOLOZ, `poateSustine` răspunde `ok` (are scurtcircuitul
`if (solLa(...) === SOLID) return accept()`), iar `zidesteVoxel` refuză cu `CELULA_PLINA`. Cazul nu
e teoretic: prăbușirea depune MOLOZ, iar molozul poate ateriza peste un blueprint desenat. Deci
poarta e `solLa !== SOLID && poateSustine`. În trecerea **ieftină**, fiindcă 72–84% dintre candidați
o pică, iar în cea scumpă ar consuma din `jobScanMaxCandidates` fără să seteze `best` — dezactivând
și ieșirea devreme. Măsurat: plafonul a legat în 4 din 111 scanări, tăind **1541** de candidați de
SĂPAT contra **1** de construit.

### O cifră pe care am purtat-o greșit

Am dat panoului „~32 ms la 400 de desemnări" ca și cum ar fi costul lui `constructiaPosibila`. Nu e:
cifra din DEVLOG (tăietura 1) e a previzualizării de **săpat**, bazată pe `stareSapat` la ~19
µs/celulă. Închiderea de construcție are cifra ei în propriul docstring — 0,22 ms la 177 — iar
panoul a reprodus-o la 0,189. Sinteza a recomandat să scot cifra din DEVLOG; recomandarea e greșită,
moștenită din atribuirea mea. DEVLOG-ul rămâne cum e.

### Blocantul: `refaLoculDeLucru` presupunea SAPA, în două feluri

Găsit de adversar în codul pasului 6b, comis azi, verde la 374 de teste și 41 de probe. Detaliile
sunt în mesajul commit-ului; ce merită reținut aici sunt cele două lecții.

**Testul meu pentru exact acest caz trecea în gol.** Asertiunea de distanță era sub un
`if (peretele s-a ridicat)`; peretele nu se ridica, deci ramura nu rula. Mutația legată de el ieșea
**PRINSĂ** — fiindcă mutația probează ce ating fixturile, iar fixtura nu ajungea acolo. O asertiune
sub un `if` e o asertiune care poate să nu se întâmple.

**Două implementări identice pot fi identice fiindcă una e greșită.** Ieri am unit două `refaTinta`
octet cu octet identice, citând „o funcție, un adevăr", și am luat identitatea drept dovadă de acord.
Era dovadă de **copiere**: copia cărase cu ea presupunerea locului de unde venise. Deduplicarea a
înrăutățit-o — cod duplicat invită întrebarea „diferă?", cod unificat o închide.

### Planul 6c, corectat

Ambii adversari au respins planul de pași al sintezei (`sustine=false`, 6 blocante). Miezul
designului ține; **ordinea nu**. Ce trebuie refăcut înainte de implementare:

- **`pornesteConstruieste` n-are parametru pentru celula de lucru** — l-am scos la 6b ca nefolosit,
  iar acum scanerul ar alege o celulă pe care funcția o aruncă și o recalculează în `ridica`, fără
  componentă. Se pune la loc, cu motivul scris.
- **Trecerea scumpă e scrisă pe DOUĂ feluri**, nu pe N (`fel === CAND_SAPA ? persS : persC`). Pasul
  care adaugă bucla ieftină nu se poate livra singur; generalizarea vine întâi.
- **`rang(FARA_SPRIJIN)` e nelegabil în v2 prin construcție** — designul scoate din scaner singurul
  mecanism care l-ar emite. Nu se adaugă o gardă pe care nicio fixtură n-o poate atinge.
- **`racireDesemnare` folosește un contor `vii` unic peste feluri**: 4096 de șantiere fac ca un refuz
  de SĂPAT să răcească 540 de tickuri în loc de 100. Reparația are nevoie de fixtura ei — cea
  propusă e verde și pe codul nereparat.
- **Plafonul piciorului doi**: fixtura propusă pune mormanul „la 90 de celule", iar
  `haulDestRadiusCells = 96`. Plafonul n-ar lega — plafon atins nu înseamnă plafon care leagă.
- **Scenariul standard nu poate proba nimic din 6c**: `desemnari.vii = 0` după 20.000 de tickuri, și
  cu v1 montat integral **374 din 374** rămân verzi. Fixtura cu toate trei categoriile e pasul unu,
  și are nevoie de propriile asertiuni de fixtură vie.

Amânate cu motivul lor: cache-ul „zidibile acum" (pragul măsurat: ~4096 de desemnări în rază),
mormanul ales per-șantier, ridicarea lui `maxClaimants` (azi un morman de 75 hrănește UN constructor
deși ține trei pereți), consolidarea fragmentelor (după o prăbușire, 300 de unități în 30 de mormane
de câte 10 nu ridică niciun perete), și gaura de conținut **SCARA/LEMN** — blocaj circular permanent,
fiindcă worldgen scrie doar APA, IARBA, PAMANT și ROCA.

### Cifre

- **375 de teste**, 28 în `tests/constructie.test.ts`.
- **162 de probe** de mutație; cele trei noi verificate una câte una că leagă, fiecare prinsă de
  exact testul declarat.

---

## Tăietura 2, pasul 6c — scanerul alege singur șantiere

**Prompt:** `continua`
**Model:** Claude Opus 5

Un pion liber care vede un blueprint zidibil și un morman potrivit pornește singur un job de
construit. Cu asta construcția e un sistem întreg: desenezi, și se ridică. Măsurat pe un șir de 5
pereți cu 3 pioni: primul job la **tickul 18**, toți cinci ridicați la **324**, conservare exactă
(`marfaTotala + unitatiZidite = 100`), zero rezervări rămase.

### Închiderea nu intră în buclă

Poarta de selecție e terenul **real** — `solLa !== SOLID && poateSustine` — nu apartenența la
`constructiaPosibila`. Argumentul e în intrarea panoului de mai sus; ce s-a livrat aici e
consecința: fără cache, fără canal de invalidare, fără steag murdar. O clasă întreagă de defecte
dispare prin construcție, inclusiv una pe care M5 rămâne verde și n-o poate prinde.

Conjuncția, nu `poateSustine` singur: pe o celulă deja solidă el răspunde `ok` prin scurtcircuit,
iar `zidesteVoxel` refuză cu `CELULA_PLINA`. Cazul e real — prăbușirea depune moloz peste
blueprinturi desenate.

Un șantier nezidibil **acum** nu primește nici răcire, nici cauză: e o poziție în coadă, nu un
refuz. `racireDesemnare` dă 100–510 tickuri, un job durează 76 — construcția ar avansa la viteza
răcirii, nu a muncii. Și `reincercaLaTick` e hașuit, deci un parcaj greșit e stare divergentă.

### Materialul: un rezumat, o baleiere pe scanare

`rezumatMaterial` produce per piesă `{ exista, dMin, slot }` dintr-o singură trecere peste
`w.iteme`. Varianta per-șantier e `O(candidați × iteme)` fără plafon — ~1,3 ms pe scanare la plafon,
~2,8 ms/tick la 64 de pioni. Predicatul e **identic** cu cel din `pornesteConstruieste`, altfel
„verificat la scan, refuzat la start" nu mai e adevărat. Departajarea la distanță egală e explicit
pe `it.id`, nu pe ordinea sloturilor — aia e o proprietate a formatului de save, nu o regulă.

Distanța de scor e **primul picior** (pion → morman), ca la săpat și la cărat. Distanța până la
șantier ar fi o margine validă pe drumul total, dar sub altă metrică — și atunci construcția ar
raporta sistematic distanțe mai mari pentru aceeași cantitate de mers, adică o schimbare de
comportament pentru SAPA și CARA strecurată printr-o categorie nouă.

`rang(LIPSA_MATERIAL) = 2` se adaugă **acum**, fiindcă de acum scanerul chiar o emite.
`FARA_SPRIJIN` **nu** primește rang: designul ăsta nu-l emite din scaner, și o gardă pe care nicio
fixtură n-o poate atinge nu se adaugă.

### Alegerea nu mai e scrisă pe două feluri

Trecerea scumpă avea trei `fel === CAND_SAPA ? … : …` — adevărate exact cât timp există două
feluri. Al treilea ar fi căzut tăcut pe ramura căratului: cu prioritatea altcuiva la tăierea
devreme, și pornind un job de **cărat** cu slotul unei **desemnări**.

Cele două mărimi se știu deja în trecerea ieftină, deci se scriu acolo (`candPers`, `candPrio`).
Dispecerizarea devine `pornesteCandidatul`, exhaustivă pe un tip-**uniune**, nu pe `number` — cu
`fel: number` un `as never` compilează mereu și nu apără nimic. Verificarea a și tras în producție:
la adăugarea lui `CAND_CONSTRUIESTE` typecheck-ul a picat cu
`Type '2' is not assignable to type 'never'` înainte să existe ramura.

Hash-ul scenariului standard a rămas **neschimbat** peste tot arcul (seed 12345 ×5000 ×40 =
`4941e350`, seed 777 ×3000 ×20 = `e2e5a39b`): nimic din astea nu perturbă lumile fără șantiere.

### Ce au mai arătat mutațiile

Suita a ieșit întâi **49/51**, și ambele RATATE erau fixturi moarte, nu cod greșit:

- **Șantierul „în aer" era prea sus.** La g+5 `celulaDeLucru` nu găsește niciun vecin calcabil,
  deci accesibilitatea refuză prima și poarta de sprijin nu apucă să conteze. Măsurat: la g+1
  suport 4; la **g+2** suport 0 **și** loc de lucru la g+1; de la g+3 în sus, loc de lucru null.
  Singura cotă la care poarta chiar decide e g+2. Fixtura are acum două asertiuni de viață.
- **Poarta de material nu schimbă rezultatul, doar costul.** Fără scurtcircuit, șantierele fără
  piatră intră în tablou dar trecerea scumpă le refuză oricum. Observabilul corect e
  `candidatiExaminati` — care e chiar rostul porții.

Și avertismentul panoului s-a adeverit literal: cu scanerul montat integral, toate cele **376 de
teste de dinainte au rămas verzi**. Scenariul standard n-are nicio desemnare de construit. Fiecare
test nou are propria asertiune de fixtură vie, și una chiar a prins o fixtură moartă — observam
`caraCantitate > 0` între tickuri, care e mereu 0, fiindcă ridicarea și încheierea se întâmplă în
același tick.

### Cifre

- **381 de teste**, 34 în `tests/constructie.test.ts`.
- **169 de probe**; construcție **51/51**.
- 6 joburi distincte pentru 5 pereți — unul s-a pierdut într-o cursă între pioni. De privit dacă se
  repetă la scară, nu e un defect cunoscut.

### Ce rămâne

- ~~**Prioritățile personale asimetrice sunt netestate.**~~ **ÎNCHIS 19.09:** test cu specializare totală, oglindă și control uniform; mecanismul s-a dovedit a fi exclusivitatea, nu ponderarea. *Era:* `spawnAgent` scrie
  `personalPriorityDefault` în toate categoriile, deci în orice fixtură `persS === persC === persB`
  și tăierea devreme nu e probată pe cazul în care ele diferă. Era așa și înainte de 6c.
- **Plafonul piciorului doi** (morman → șantier) nu există: un pion poate lua un morman la 90 de
  celule într-o direcție pentru un șantier la 90 în cealaltă. `haulDestRadiusCells = 96`, deci
  fixtura evidentă nu ar lega — are nevoie de una construită pe cifra ei.
- ~~**`racireDesemnare` numără `vii` peste toate felurile**~~ **ÎNCHIS 19.09, fără schimbare de cod:** abaterea e conservatoare (fereastră de 330 de tickuri în loc de 100, debit neschimbat), iar justificarea a devenit proprietate probată. *Era:* 4096 de șantiere fac ca un refuz de
  săpat să răcească 540 de tickuri în loc de 100.
- **Un morman hrănește un singur constructor** (`maxClaimants: 1` pe `Strat.CARAT`), deși unul de
  75 ține trei pereți.
- **Fragmentarea**: după o prăbușire, 300 de unități în 30 de mormane de câte 10 nu ridică niciun
  perete. Răspunsul de azi e „le consolidează căratul", deci o colonie cu CARA pe 0 se blochează.
- **Gaura de conținut SCARA/LEMN** — blocaj circular permanent; costul de a-l suferi e zero,
  reparația e o decizie de conținut.
- ~~**Overlay-ul de construcție** — previzualizarea există în nucleu; desenarea ei pe ecran nu.~~ **LIVRAT (reconciliat 25.09):** desenat în `viewer/overlay-stabilitate.ts`.

---

## Grafică — ocluzie ambientală, și o reparație pe care măsurătoarea a respins-o

**Prompt:** `se poate sa imbunatatim putin grafica inca de acum` · `da, mergi pe varianta completa`
**Model:** Claude Opus 5

Prima atingere de grafică de la meshing încoace. Linia care a decis ce se face: `src/render/` e
calcul pur și **supraviețuiește deciziei de motor**; `viewer/` nu. Deci tot ce s-a livrat stă în
`src/render/`.

### Ce nu s-a făcut, și de ce

Planul aprobat avea două trepte: întâi reglajul de lumină, apoi AO. **Prima treaptă a fost
respinsă de propria ei măsurătoare.**

Aritmetica mea prezicea că fețele de sus ale ierbii taie în canalul verde — pentru `0x5c7040` sub
`hemi 1,5 × cer + soare 1,4 × 0,88` ies (0,84 / **1,05** / 0,59) — și că de acolo vine platitudinea.
Am eșantionat pixelii randați în loc să mă uit cu ochiul, fiindcă între cadre se mutase camera:

| | medie luminanță | abatere std | pixeli tăiați |
|---|---|---|---|
| actual | 137,7 | **11,9** | **0** |
| „reparat" (ambient 1,0 · soare 1,25) | 125,7 | 10,9 | 0 |

**Zero pixeli tăiați.** Predicția era greșită — cel mai probabil fiindcă culorile per vârf trec
prin conversie sRGB→liniar, deci albedoul real e sub ce socotisem. Iar „reparația" scade abaterea
standard, adică face imaginea măsurabil mai plată. Nu s-a scris în cod.

Pe drum au ieșit și două lucruri contraintuitive: un soare mai **jos** înrăutățește, fiindcă
fețele orizontale sunt majoritatea suprafeței vizibile; iar scăzând lumina emisferică scena vira
spre kaki, fiindcă ea făcea umplerea **rece** — nu era clipping.

### AO: prețul, măsurat înainte de a scrie codul

Pe fixtura M10, cu tiparul de AO în cheia de unire: **90.932 → 200.216 de dreptunghiuri, +120%**.
Codul livrat dă 199.840 — diferența e tăierea fețelor de graniță, pe care bancul de estimare n-o
făcea. **Predicția s-a potrivit pe 14 quaduri din 200.000.**

Două variante mai ieftine, măsurate și respinse: AO cuantizat la două niveluri dă +107% (deci
**cuantizarea aproape nu ajută** — ce rupe unirea e *orice* variație, nu numărul de niveluri), iar
AO doar pe fețele orizontale dă +69% dar lasă neocluzate exact colțurile perete/podea.

Și cifra care a permis decizia: **0,5 ms median de submit CPU pe cadru** la 373.540 de triunghiuri
(p95 1 ms, 188 draw calls). Cei „7 fps / 14633 ms" din HUD erau pagina suspendată — `rAF` nu
rulează când panoul e ascuns.

### Designul: AO în cheia de unire

AO intră în `grid` ca `material | (tipar << 8)`, deci `greedy` a rămas **neatins** și unește doar
celule cu același material și același tipar. Regula iese și corectă, nu doar comodă: o dungă lungă
cu ocluzie uniformă *trebuie* să fie un singur quad, iar una în care ocluzia variază de-a lungul ei
are tipare diferite și nu se unește oricum.

**Apronul nu e o rafinare, e o condiție.** Măsurat: fără vecini, **51,2%** dintre vârfurile de la
graniță (55.124 din 107.736) își schimbă AO — o cusătură de iluminare pe toată granița, clasa K16.
`ChunkNeighbours` primește și cele patru **diagonale**, fiindcă colțul (−1,−1) nu vine de la niciun
vecin de latură; corect calculate, se unesc chiar mai bine (199.840 cu, 200.230 fără). De-aia le
primește și `check-gate-numbers` — altfel poarta înregistra o configurație pe care n-o randează
nimeni.

### Ce au arătat mutațiile

AO a venit cu cinci teste și **zero probe**. Suita nouă `render` — prima din afara lui `src/sim/` —
a ieșit întâi **7/8**, și RATATA avea dreptate: cubul din fixtură stă la nivelul 5, deci ramura de
margine a ferestrei de voxeli nu e atinsă niciodată. Afirmația pe care o scrisesem în comentariul
lui `occAt` era **netestată**.

Tot mutațiile au arătat că două teste numărau în loc să verifice: „două vârfuri din patru sunt
ocluzate" e adevărat și dacă **ordinea vârfurilor e rotită**, adică exact defectul care pune umbra
pe muchia greșită. Acum verifică tiparul întreg, socotit pe hârtie: `[3, 2, 2, 3]` la treaptă,
`[3, 2, 0, 2]` la colț.

### Cifre

| | înainte | acum |
|---|---|---|
| quaduri | 86.071 | **199.840** (+132%) |
| triunghiuri | 172.142 | 399.680 |
| meshing complet | 99 ms | **192 ms** (+94%) |

Meshingul e mediana a trei rulări în procese separate (192,5 / 192,1 / 195,6). Prima măsurătoare
dăduse 227,8 ms — aveam serverul de dev pornit în paralel. Cifra poluată n-a intrat în document.

Distribuția ocluziei: 11,2% dintre vârfuri la nivelul 0, 27,1% la 1, 13,6% la 2, 48,1% neocluzate.
Peste jumătate primesc ocluzie.

**388 de teste**, **177 de probe** (8 în suita `render`), 0 tipare lipsă, 0 ambigue.

### Ce rămâne

- **Scara `AO_FACTOR = [0.52, 0.70, 0.86, 1.0]` e o judecată vizuală neverificată de owner.** E
  singurul număr din tot arcul care n-a ieșit dintr-o măsurătoare.
- ~~**Variația de culoare per poziție**~~ **LIVRAT (reconciliat 25.09):** `variatiaLocului` în `src/render/palette.ts`, aceeași funcție pe voxeli și pe heightfield. *Nota de atunci:* tot în `src/render/`, tot portabilă, **zero cost în
  quaduri** fiindcă se calculează din poziția vârfului, deci e continuă peste quaduri și peste
  granițe de chunk.
- **Terenul ne-promovat nu primește AO**, și asta e o discontinuitate pe care am introdus-o eu.
  Măsurat: pe fețele de sus — singurele pe care heightfield-ul le arată — factorul mediu ponderat
  pe arie e **0,957**, deci partea promovată e cu **4,3%** mai închisă. Pentru context, variația
  naturală a luminanței pe teren e ~8,7% (abatere standard 11,9 pe o medie de 137,7), deci saltul
  e sub jumătate din zgomotul existent — dar granița e o **linie dreaptă**, iar aia se vede altfel
  decât un gradient. Într-un cadru privit la granița de est a zonei promovate nu s-a văzut. Se
  consemnează cu cifra, nu se repară cu o înmulțire ghicită: a întuneca heightfield-ul cu 0,957 ca
  să se potrivească media ar fi o potrivire pe corpus, nu o ocluzie. Reparația adevărată e AO
  derivat din diferențele de înălțime, și e alt arc.
- **Predicția „NU pică pe GPU" din GATE.md e acum mai GREA**, nu mai ușoară: 172.142 → 399.680 de
  triunghiuri. Singurul indiciu e timpul de *submit*, nu de completare — nu înlocuiește sweep-ul.

---

## Grafică — liniile drepte, și de unde veneau de fapt

**Prompt:** `vreau sa facem ceva cu liniile astea drepte, vreau o grafica mai buna de atat` ·
`da, mergi pe varianta completa`
**Model:** Claude Opus 5

Terenul arăta ca un câmp arat: terase paralele perfect drepte, de 1 m, până la orizont. Iar AO,
livrat cu o zi înainte, le făcea **mai** citibile, nu mai puțin.

### Diagnosticul a fost greșit de două ori înainte să fie corect

Prima ipoteză — „terasele sunt identice între ele, deci se citesc ca tipar" — a produs
`variatiaLocului`, o variație de culoare legată de poziția în lume. E o îmbunătățire reală și a
rămas, dar **nu rezolvă liniile** și nu pretinde asta.

A doua ipoteză — „e generarea lumii" — a fost respinsă de măsurătoare: cotele heightfield-ului au
**558 de valori distincte cu pas de 18 cm**, doar 1% multipli de metru. Terenul ne-promovat e neted.

Răspunsul l-a dat o probă simplă: **cu cele 12 chunk-uri de voxeli ascunse, toate terasele dispar.**
Liniile apar la **promovare** — suprafața netedă se rotunjește la metru întreg (abatere măsurată
**0,25 m medie, 0,5 m maximă**, pură rotunjire) și o pantă lină devine scară. Pe TOT chunk-ul, nu
doar unde s-a săpat, plus apronul: o singură groapă preface nouă chunk-uri în scară.

### Reparația

Fața de sus a unui voxel de suprafață **neatinsă** se așază la cotele reale din `vertexCm`, iar
peretele de treaptă dintre două coloane neatinse se suprimă — cele două fețe înclinate se întâlnesc
pe muchia comună, având literalmente aceleași vârfuri. Treptele rămân doar unde s-a săpat.

„Coloana a fost atinsă de jucător" se citește din diferența dintre ce e și ce ar fi fost: solid
exact la nivelul pe care generatorul l-ar produce, și aer deasupra. **Niciun câmp nou de stare.**

Netezirea e **opțională**, și nu din prudență: fără ea, mesher-ul rămâne o enumerare fidelă a
fețelor voxelilor și invariantul central se poate proba. Cu ea, devine o redare — șterge pereți care
există în date. Ambele întrebări merită răspuns. Toate cele 24 de teste de mesher trec neschimbate
în modul fidel, adică `netezire=false` chiar e un no-op.

`positions` a trecut din metri în **centimetri**; alternativa — un al doilea tablou doar pentru
cotele netezite — ar fi însemnat două surse de adevăr pentru aceeași poziție.

### Cifre

| | înainte | după AO | după netezire |
|---|---|---|---|
| quaduri | 86.071 | 199.840 | **347.229** |
| triunghiuri | 172.142 | 399.680 | 694.458 |
| meshing | 99 ms | 192 ms | **219 ms** |

Raportul merită reținut: **+74% quaduri costă doar +14% timp**, fiindcă partea scumpă a mesher-ului
e calculul de AO per celulă, nu numărul de dreptunghiuri unite.

Estimarea de dinainte de cod spunea +64% și era greșită: presupunea că toți pereții de 1 m dispar,
când de fapt dispar doar cei dintre două coloane neatinse.

### Ce a găsit suita de mutații

Suita `render` a ieșit **8/9 cu două controale invalide**, și toate trei erau reale: un `TIPAR
AMBIGUU` (despachetarea AO ajunsese scrisă de două ori — a treia oară în aceeași zi când
instrumentul prinde o duplicare făcută de mine), un `TIPAR LIPSA`, și o `RATATA`.

### O gardă rămâne FĂRĂ probă, și se scrie aici

Condiția care cere ca **amândouă** coloanele să fie neatinse înainte de a suprima peretele dintre
ele e corectă și necesară — **măsurat direct**: pe 36 de gropi săpate pe pantă, condiția strânsă
emite 1459 de quaduri, cea slabă 1450. **Nouă fețe în minus, zero în plus**; alea sunt găuri prin
care se vede fundalul.

Dar n-am reușit să-i scriu un test care să lege, în patru încercări: asertiune pe arie (prea slabă —
o față lipsă din 16 tot arată a creștere), verificare per perete oprită la nivelul coloanei săpate
(nu atinge cazul, fanta e deasupra ei), urcată la nivelul vecinului (pică pe cod corect), și
invariantul general „se șterg doar fețe de deasupra suprafeței desenate" (189 de false pozitive —
între două coloane neatinse suprafețele se ating pe muchie și peretele e legitim șters deși e sub
cota muchiei). A cincea formulare ar fi trebuit să reconstruiască în test exact regula din cod, iar
un test care repetă implementarea nu probează implementarea.

Proba s-a **scos** din suită. O probă RATATĂ permanentă e un orb care raportează, iar una falsă e
mai rău.

### Cifre finale

**391 de teste** · **179 de probe** (10 în `render`), 0 tipare lipsă, 0 ambigue · `npm run check`
verde · `GATE.md` re-etalonat de două ori, fiecare într-un commit separat.

### Ce rămâne

- ~~**Garda de mai sus, fără probă.** Dacă cineva găsește formularea, e cea mai valoroasă adăugare.~~ **ÎNCHIS (reconciliat 25.09):** formularea s-a găsit — testul „INVELISUL NETEZIT e ETANS" din `tests/mesher.test.ts` leagă garda, iar proba ei din `render.mjs` iese PRINSĂ.
- **Scara `AO_FACTOR`** — singurul număr din tot arcul care n-a ieșit dintr-o măsurătoare.
- **Predicția „NU pică pe GPU"** e acum la 694.458 de triunghiuri, de patru ori cifra pe care a fost
  scrisă. Sweep-ul de rezoluție se rulează pe geometria asta.
- **Terenul ne-promovat nu primește AO** — 4,3% diferență, măsurată, sub variația naturală.

---

## Recenzia adversarială — cinci reparații, și trei instrumente care minteau

**Prompt:** `continua` (×3) · **Model:** Opus 5

Recenzia adversarială a codului scris azi a confirmat 15 proprietăți (conservarea, determinismul
inclusiv pe lumi întrețesute, izolarea bufferelor de modul, toate cele 61 de probe declarate care
leagă) și a scos 7 defecte reale. Două s-au reparat în aceeași trecere; aici sunt celelalte cinci,
plus o gardă nouă pentru două feluri de eșec tăcut întâlnite pe drum.

### 3+4 · Geometria netezită se verifica pe un proxy

Testul de cote număra doar câte cote NU sunt multipli de 100. Orice permutare a colțurilor, orice
inversare de axe și chiar scăderea uitată a bazei stivei rămân sub-metrice, deci treceau — recenzia
a măsurat **patru stricăciuni distincte, toate 391/391 verzi**, și nici `gate:numbers` nu le vedea,
fiindcă `quadCount` nu se schimbă la niciuna.

Acum se verifică cotele exacte în ordinea emiterii, continuitatea a două fețe vecine (independentă
de generator — prinde inversarea axelor, pe care prima n-o vede, fiindcă geometria rămâne coerentă
cu ea însăși, doar răsucită), și ocluzia pe calea netezită. Ultima lipsea cu totul: toate cele opt
teste de AO chemau `meshChunk` **fără** al treilea argument, deci calea prin care ies 768 din 1000
de quaduri n-avea nicio acoperire.

### 5 · Șantierul se alegea după ordinea desenării

`candDist` la construcție e distanța până la MORMAN, iar rezumatul ține un singur morman per piesă —
deci e același număr pentru toate șantierele piesei. Cu priorități egale scorul iese identic pe toată
categoria, `maiBun` nu e strict, și câștigă primul examinat: ordinea sortării, adică `candId`. Pionul
mergea la șantierul desenat primul, nu la cel de lângă el. **+72% tickuri** în cazul patologic.

Departajarea e al doilea picior — morman → șantier — și se compară DOAR în interiorul categoriei.
Pentru SAPA zeroul e adevărat; pentru CARA înseamnă „nu se știe ieftin", fiindcă destinația se alege
abia în trecerea scumpă. Comparat peste categorii, zeroul ăla ar fi înclinat sistematic balanța
împotriva construcției — exact ce argumenta comentariul de lângă `candDist`.

### 6 · Șantierul fără material nu spunea nimic

Poarta de material ieșea din buclă cu `continue` înaintea oricărei scrieri pe desemnare. Cauza ajungea
pe PION, deci panoul picta șantierul chihlimbar — sănătos, își așteaptă rândul — iar HUD-ul îl număra
liber. Un blocaj permanent (SCARA cere LEMN într-o lume fără lemn) arăta identic cu unul de o secundă.

Cauza NU putea veni din `m.exista`: rezumatul e al pionului care întreabă, și e fals și când singurul
morman e rezervat de altcineva. Cu el drept sursă, panoul ar fi pictat portocaliu exact șantierele în
plină construcție. `ultimulMotiv` are contract scris — „proprietate a desemnării înseși, niciodată a
unui anume pion" — deci întrebarea se pune separat: `matOriunde`, înaintea oricărei porți per-pion.

### 7 · S-DIG măsura 0,24% din așezare, o treime din săpături, și niciodată cazul scump

Recenzia a raportat că scenariul de gate nu promovează niciun chunk. Reprodus headless — corect, și
verificarea a scos **două** defecte, al doilea mai mare.

`SPAN_CHUNKS` era scris `13`, adică exact `SETTLEMENT_CHUNKS`, cu același colț. Cum promovarea vine
cu apron de 1, dreptunghiul promovat e `-1..13`, deci pătratul stătea strict înăuntru: **0 promovări
din 1200**, iar ramura scumpă din `remeshAfterEdit` (chunk nou + apron = 9 remeshate) nu s-a executat
NICIODATĂ într-o rulare de gate.

Și pozițiile nu erau împrăștiate, erau o linie: `wx` și `wy` se calculau amândouă din ACELAȘI contor,
reduse modulo ACELAȘI span, deci perechea e o funcție de `c mod span`. **416 coloane distincte dintr-o
așezare de 416×416**, re-săpate de aproape trei ori — de acolo veneau și 415 refuzuri din 1200. Poarta
scria 20 de săpături/s în propriul tabel și făcea 13,1.

Codul a ieșit din `viewer/main.ts` în `src/harness/sdig.ts`, fiindcă exact asta ținea defectul în
viață: două linii într-un modul de browser nu pot fi rulate de `npm test`, iar singurul lor consumator
raporta cadre, nu acoperire. Configurația livrată: **1200/1200 săpături efectuate, 52 de promovări,
1,24 remesh-uri/săpătură, cel mai scump cadru 9**.

### Garda nouă: suitele de mutații se verifică în `npm run check`

Două feluri de stricăciune se vedeau doar după ~50 de minute, și amândouă s-au întâmplat azi: o suită
care nu parsează (ghilimele românești închise într-un șir cu ghilimele drepte — `check` rămâne verde,
el nu încarcă fișierele de mutații), și un `e` învechit, care raportează RATATĂ pe cod corect și te
trimite să scrii un test pentru o gardă deja probată. Plus `TIPAR LIPSĂ` și `TIPAR AMBIGUU`, pe care
harnașamentul le raporta corect, dar tot după o rulare întreagă. Toate patru se pot afla din citire.

### Trei instrumente care minteau — ale mele

Tiparul zilei n-a fost codul, ci verificarea lui:

1. **Testul de cote** lua *prima* față de sus a unei celule; o coloană poate avea mai multe. Pica pe
   cod corect. A doua formulare clasifica fețele netezite după cotă și prindea coloanele de APĂ
   (material nesolid ⇒ corect nu se netezesc). Pica tot pe cod corect. Clasificarea se face pe DATELE
   coloanei.
2. **Testul de evitare** folosea fixtura pionului sigilat, care chiar *produce* evitare — dar mormanul
   e ridicat de pionul liber înainte ca sigilatul să rescaneze. Starea pe care testul o descria nu mai
   exista când o verifica: mutația trecea neprinsă. Acum evitarea se **impune**.
3. **O asertiune vidă**, prinsă de propria probă: „nicio poziție nu cade pe teren nestreamuit". Proba
   ei — un pătrat de 23 de chunk-uri, mult peste cercul de rază 11 — n-a înroșit nimic. `groundLevelM`
   nu eșuează: chunk-urile se creează la cerere. Contorul `faraSol` ieșise 0 în TOATE măsurătorile, și
   eu citisem asta ca „pătratul e în siguranță" în loc de „instrumentul nu poate ieși nenul".

Și una de raportare, nu de cod: o rulare de fundal a murit în prima secundă cu `SyntaxError`, dar am
filtrat ieșirea prin `grep`, care a întors 0. Am citit „exit 0" acolo unde scria „n-a pornit".

Verificatorul de mutații a picat și el prima lui probă: a raportat 18 probe ca având câmpul `b` lipsă,
când `b: ""` e mutația care ȘTERGE linia. De-aia testul lui începe cu controlul POZITIV — fără el, cele
șapte asertiuni negative ar fi fost satisfăcute și de un verificator care iese roșu la orice.

### Cifre finale

**408 teste** · **197 de probe**, 0 tipare lipsă, 0 ambigue, 0 controale invalide · `npm run check`
verde · GATE.md re-etalonat o dată (§5, scenariul — primele șase erau schimbări de fixtură), în commit
separat, cu motivul scris.

### Ce rămâne

- **`AO_FACTOR`** — tot singurul număr din arcul de grafică ieșit dintr-o judecată vizuală, nu dintr-o
  măsurătoare.
- ~~**Cei 205 ms din GATE.md**~~ **ÎNCHIS 25.09, a doua oară — prima închidere, de dimineață, era greșită:** scrisesem „cifra nu mai există" citind verdele local al lui `check-gate-numbers`, nu fișierul. Cifra exista, iar CI-ul a picat pe ea două ore mai târziu (runner-ul: 139,9 ms, −47%). Re-etalonată la **174 ms** (mediana a 5 măsurători liniștite), în commit separat, cum cere protocolul. *Era:* s-au luat dimineața, cu serverul de dev pe mașină; `check-gate-numbers`
  măsoară azi 179,9 (±22,2). Poarta trece, deci cifra e în toleranța ei — dar e o cifră de mașină
  zgomotoasă. A o re-etalona de două ori într-o zi ar fi mai rău decât a o nota.
- ~~**Bucla de reîncercare din S-DIG**~~ **ÎNCHIS 19.09** — `remeshAfterEdit` a ieșit în `chunkuriDeRefacut`, headless, cu teste. *Era:* e probată prin `sapaturaUrmatoare`, dar ce face viewerul CU
  rezultatul ei (`remeshAfterEdit`) rămâne cod de browser fără test.
- ~~**Prioritățile personale asimetrice**~~ (ÎNCHIS 19.09), **plafonul pe al doilea picior** (DESCHIS — vezi registrul reconciliat) și ~~`racireDesemnare`~~ (ÎNCHIS 19.09) care
  numără `vii` peste toate felurile — netestate, de la recenzia dinainte.
- **Deadlock-ul de conținut SCARA/LEMN** — acum măcar se vede în panou, portocaliu.

---

## A doua recenzie adversarială — două blocante, o regresie a mea, și un instrument de recenzie stricat

**Prompt:** `continua` (×5) · **Model:** Opus 5

Recenzie a celor cinci reparații livrate mai devreme în aceeași zi: 50 de agenți, 7,67M tokeni,
60 de minute. **20 de constatări confirmate și 5 goluri.** Zece commit-uri de atunci.

### Recenzia și-a găsit propriul instrument stricat — și avea dreptate

**26 din 37 de worktree-uri au fost provizionate pe `d3bd38a`**, un commit de acum 64 de commit-uri,
din care lipsește tot ce trebuia recenzat. Un cititor care nu verifică `HEAD` găsește totul verde —
`npm run check` trece și acolo — și raportează „nimic de semnalat" despre o zi de muncă pe care
n-a citit-o. Unul dintre verificatori a prins-o singur (`grep candDist2` → 0 potriviri, fișierul
cu 2499 de linii în loc de 3335) și și-a făcut `checkout --detach` înainte să măsoare.

De aceea **fiecare constatare a fost reprodusă de mine pe HEAD-ul real înainte să ating codul.**
Una singură n-a rezistat: „cele trei cifre de meshing nu pot fi toate adevărate, media maximă
posibilă e 877 µs". Pe starea mașinii mele maximul per chunk era 1492 µs. Era corectă pe mașina lor.

### Cele două blocante

**`jobConsumat` se hashuia și se citea, dar `encode` nu-l scria niciodată.** `decode(encode(w))`
dădea alt hash înainte de orice tick, ori de câte ori un pion era la masă. A supraviețuit fiindcă
fixtura pe care stă M5 nu mănâncă: în 2000 de tickuri singurul job e DOARME, zero desemnări, zero
iteme, zero zone. Adică **orice** câmp PERSISTED al tăieturilor 2 și 3 putea lipsi din `encode`.

Reparația a dezvelit un al doilea strat, pe care l-am lăsat CONSEMNAT, nu ascuns: la granița de
salvare un pion poate avea job pe un morman tocmai terminat; lumea continuă îl încheie la tickul
următor, cea încărcată îl anulează pe loc. O defazare de un tick. Invariantul per-tick e mai tare
decât ce pretinde proiectul, deci am livrat enunțul real („N + save + load + N == 2N") pe o lume
bogată, cu contoare de viață separate.

**Fereastra de încălzire a gate-ului înghițea exact evenimentul pe care S-DIG fusese reparat să-l
măsoare.** Cele 4 valuri de 9 remesh-uri cad la săpăturile 0–3; încălzirea e de 100 de săpături.
Cauza nu e fereastra, e fizica scenariului: un val de 9 cere un chunk cu toți cei 8 vecini
nepromovați, și asta există doar cât timp banda de frontieră e neatinsă. Încălzirea sapă acum în
pătratul de dinainte de reparație — cel probat că nu promovează nimic.

> O fereastră de încălzire nu e neutră. Ea consumă starea lumii, iar dacă evenimentul rar al
> scenariului se naște din starea INIȚIALĂ, încălzirea e exact lucrul care îl face invizibil.

### Regresia mea: comparatorul nu era o ordine totală

Departajarea pe al doilea picior, livrată dimineața, stătea în `ordine.sort` cu garda
`candFel[i] === candFel[j]`. Arăta ca exprimă intenția — „doar în interiorul categoriei" — dar o
departajare CONDIȚIONATĂ nu e tranzitivă: cu trei candidați legați pe scor, iese X < S (după id),
S < Y (după id) și Y < X (după al doilea picior). `Array.prototype.sort` pe un comparator
inconsecvent dă un rezultat definit de implementare — și alegea exact șantierul DEPĂRTAT de morman,
adică regresia pe care departajarea fusese scrisă s-o închidă. **12 poziții de săpătură din 166.**

Reparația nu e o gardă mai tare: o condiție în comparator nu poate fi tranzitivă, oricât ai
întări-o. Departajarea a ieșit din comparator și a intrat la locul deciziei. Iar comparatorul a
ieșit din închiderea inline într-o funcție pură exportată, a cărei semnătură **nu primește `fel`** —
deci forma greșită nu se mai poate nici scrie. Proprietatea se verifică exhaustiv pe 60 de
candidați: antisimetrie pe toate cele 3600 de perechi, tranzitivitate pe toate lanțurile.

### Fustele netezirii erau quaduri „papion"

Când cele două cote ale muchiei cad de o parte și de alta a cotei plate, quadul se
auto-intersectează: cele două triunghiuri ies cu înfășurări opuse, iar culling-ul îl șterge pe cel
dorsal. **15 triunghiuri dorsale, 0,680 m²** — găuri, în geometria pusă acolo anume ca să închidă
găuri. Trei încercări până la zero: prima a presupus greșit că partea de deasupra n-are nevoie de
fustă (testul de etanșeitate s-a înroșit); a doua a pus vârfurile suprapuse pe pozițiile greșite,
iar `quadFlipped` citește doar PRIMUL triunghi ca să afle înfășurarea; a treia a uitat capătul care
cade exact pe cotă.

Oracolul de înfășurare exista din S6-8, dar verifica doar primul triunghi al fiecărui quad — la un
papion ăla e cel corect — și rula doar pe meshul fidel.

### Poarta pe care o construisem avea propriile ei găuri

`check-mutatii.mjs` ignora complet editările suplimentare `e2`: șase tipare din suitele reale erau
invizibile pentru poarta scrisă anume ca să prindă tipare învechite. Iar cele șapte probe negative
ale ei asertau doar codul de ieșire — pe care îl dă și o excepție neprinsă, deci nu deosebeau
„garda a vorbit" de „verificatorul a crăpat". Fiecare caz își cere acum mesajul.

Și `check-gate-numbers` avea aceeași formă: eticheta „verificat mecanic" stătea lângă o cifră de
timp pe care nimeni n-o compara cu nimic măsurat — doar cele două apariții între ele. 999 ms în
ambele locuri trecea.

### Două cifre măsurate care schimbă argumente

**Mutațiile durează 5 min 31 s, nu „~50 de minute".** Cifra veche n-a fost măsurată niciodată; era
o impresie dintr-o rulare în timpul căreia se lucra altceva, și era singurul argument pentru care
poarta negativă reală stă în afara CI-ului.

**Mașina variază cu 27% între cinci mediane consecutive** (195–258 ms; mai devreme în aceeași zi,
166–190). De-aia banda noii verificări de timp e 40% și nu mai strânsă: o bandă strânsă ar înroși
poarta după cât de ocupată e mașina, nu după ce s-a schimbat în cod. GATE.md spune acum explicit
că `205 ms` și `911 µs` sunt cifre de o singură măsurătoare, nu constante ale codului.

### Șase instrumente ale mele, toate prinse

Tiparul zilei, a doua oară: nu codul, ci verificarea lui.

1. Scanul „ce câmp e hashuit dar nesalvat" a raportat și `agents.jobKind` — stare imposibilă, pe
   care `reconstruiesteRezervari` o anulează deliberat. Iar listele lui „nehashuite" arătau iteme,
   desemnări și zone doar fiindcă fixtura lui n-avea niciunul: aceeași deadness, în propriul
   instrument.
2. Testul de ordine totală a picat pe un candidat comparat cu el însuși: sub `assert/strict`
   egalitatea e `Object.is`, iar `Object.is(0, -0)` e FALS.
3. Invariantul de continuitate a ocluziei a picat pe cod corect: AO se calculează la nivelul FEȚEI,
   deci două fețe vecine pe niveluri diferite au voie să difere în același colț (x,y).
4. Un script de editare cu perechea scrisă ca două elemente separate — ar fi scris „undefined" în
   `ruleaza.mjs` dacă n-ar fi aruncat înainte de `writeFileSync`.
5. Un heredoc a colapsat `\\n` în linie nouă reală, exact capcana scrisă în memorie.
6. Prima versiune a verificatorului de suite a raportat 18 probe ca având câmpul `b` lipsă — `b: ""`
   e mutația care ȘTERGE linia.

### Cifre finale

**418 teste** · **212 probe**, 212/212 prinse, 0 controale invalide, 0 tipare lipsă sau ambigue ·
`npm run check` verde · GATE.md re-etalonat o dată (a șaptea), în commit separat.

### Plasa de siguranță a CI-ului avea două găuri, găsite măsurând de ce hash-ul NU s-a mișcat

După o zi întreagă de reparații în bucla de construcție, hash-ul de referință din CI a rămas
`605e9178`. Măsurat de ce: **`standardScenario` nu conține nicio desemnare de construit.** Sapă,
cară, mănâncă, doarme, pictează zone — dar zero șantiere. Deci poarta de determinism era oarbă
exact la subsistemul cel mai nou și cel mai atins, și `candDist2`, `matOriunde` și cauza „lipsă
material" puteau fi schimbate toate trei fără să clipească.

Aceeași deadness ca la fixtura pe care stătea M5, în aceeași zi — și aceeași lecție ca la testul
care păzește promovarea terenului, scris chiar deasupra în același fișier, cu motivul lui.

Scenariul primește două șantiere de PERETE și piatră pentru ele, per sit: **480 de unități zidite**
până la tickul 2000, zero refuzuri, hash reproductibil pe două rulări. `EXPECTED` devine
`6ff16b2a`, exact cum cere workflow-ul însuși. Testul nou verifică două lucruri diferite: ce
DECLARĂ scenariul (comenzile lui) și ce ATINGE (rularea).

A doua gaură: **CI rulează pașii individual, nu `npm run check`** — deci verificatorul de suite
adăugat în aceeași zi nu rula acolo deloc. Iar poarta negativă reală n-a rulat niciodată în CI,
fiindcă CLAUDE.md scria „~50 de minute". Acum rulează, într-un job separat, în paralel cu `check`.

### Ce rămâne

- ~~**Defazarea de un tick la granița de salvare.**~~ **ÎNCHISĂ 22.09**, decizia owner-ului: *se
  reconciliază la moartea țintei*. Reparat, dar întâi măsurat — și nu era o defazare de un tick.
  **285 de granițe divergente din 40.000**, episoade de până la **127 de tickuri**, iar lumile
  **nu reconvergeau**. Vezi intrarea de mai jos.
- ~~**Nimic nu e împins.**~~ **ÎNCHIS 21.09:** împinse 83 de commit-uri, CI verde pe amândouă
  joburile, iar hash-ul de referință s-a reprodus pe runner — adică exact ce nu se verificase.
- **`AO_FACTOR`** — tot singurul număr al arcului de grafică ieșit dintr-o judecată vizuală.
- ~~**`remeshAfterEdit`** rămâne cod de browser fără test.~~ **ÎNCHIS 19.09:** a ieșit în
  `src/render/remesh.ts` ca `chunkuriDeRefacut`, cu `exista`/`eraPromovat` ca funcții, deci
  probabil headless — 7 teste, 4 probe. A ieșit la iveală și o asimetrie: cusătura nu verifica
  existența vecinului, deci mulțimea putea conține chei fantomă, iar mulțimea aia e cea NUMĂRATĂ
  când se scriu „remesh-uri pe săpătură" în GATE.md. Măsurat înainte de a o numi bug: **zero chei
  fantomă** pe rularea de S-DIG, deci cifrele rămân și garda e defensivă, nu o reparație.
- ~~**Prioritățile personale asimetrice** și `racireDesemnare`.~~ **ÎNCHISE 19.09**, amândouă
  măsurate înainte de a fi atinse:
  - **`racireDesemnare`** chiar cuplează felurile — cu 60 de săpături și 2400 de șantiere,
    fereastra iese **330 în loc de 100**. Dar debitul nu se schimbă: răcirea atinge doar țintele
    refuzate SCUMP. Abaterea e conservatoare, nu greșită, deci **nu s-a schimbat** — s-a scris
    justificarea ca proprietate probată (fereastra e STRICT peste o baleiere completă; nu scade
    când apar ținte noi) și s-a consemnat că formula e strâmbă în ambele direcții: plafonul e
    împărțit și cu itemele, care nu intră deloc în `vii`.
  - **Prioritățile asimetrice** au căpătat test — dar prima variantă nu lega, iar de acolo a ieșit
    ceva mai interesant decât testul: mutațiile pe SCOR nu schimbă nimic. Specializarea vine din
    **exclusivitate** (`categoriiActive`), nu din ponderare. Iar poarta de SĂPAT scoasă singură tot
    nu înroșește nimic, fiindcă ponderarea ține cărăușul la cărat — **cele două mecanisme se
    suprapun**, și abia amândouă scoase se vede specializarea pierdută. Proba aia folosește `e2`.

---

## Reconcilierea la moartea țintei — și un defect de zece ori mai mare decât eticheta lui

**Model:** Claude Opus 5
**Prompt de start:** „se reconciliază la moartea țintei"

Decizia owner-ului pe singurul punct de design rămas deschis din a doua recenzie. Regula: când o
țintă moare, joburile care arată spre ea se încheie în ACELAȘI tick, nu la următorul.

### Eticheta minimaliza defectul

Punctul era scris în DEVLOG ca „defazare de un tick" — deci ceva cosmetic, o singură graniță de
salvare care se aliniază un tick mai târziu. Înainte să ating codul, l-am măsurat. Nu era asta:

- **285 de granițe divergente din 40.000** încercate;
- episoade lungi de până la **127 de tickuri** — deci nu o defazare, ci o bifurcare;
- lumile **nu reconvergeau**: odată despărțite, rămâneau despărțite;
- iar un invariant care exista DEJA în cod, `verificaRezervari`, era roșu pe **266** dintre ele.

Ultimul punct e cel care doare. Invariantul era acolo, scris, corect — dar nimeni nu-l rula per
tick. Rula o dată, la capătul unui scenariu. Un oracol care se uită o singură dată la sfârșit
raportează starea de la sfârșit, nu ce s-a întâmplat pe drum.

### Cauza: un contract scris în comentariu, respectat de unul din trei

`stergeItem` are în antet, negru pe alb: *„rezervările de pe un morman mort sunt treaba
apelantului"*. Are trei apelanți. Doar `mutaItem` își făcea treaba.

- `ridica` chema `elibereazaTinta` și **arunca lista returnată** — deci rezervările plecau, dar
  joburile rămâneau vii, arătând spre un id care nu mai există.
- `mananca` nu chema nimic.

Reparația e o funcție, `reconciliazaTintaMoarta`, chemată din toți trei. Filtrul ei e pe
**rezervare**, nu pe câmpurile jobului: pretendenții vin sortați din `elibereazaTinta`, iar după
RIDICA `jobTarget` e învechit prin design — jobul e valid, doar câmpul e vechi. Un filtru pe câmp
ar fi sărit exact peste cine trebuia încheiat.

La `mananca`, apelul stă la **capătul** funcției, după ce nutriția a fost creditată; `idMorman` se
capturează înainte de `iaDinItem`, fiindcă după el mormanul poate să nu mai existe.

Rezultatul măsurat: cele două oracole per tick trec de la **74 și 63 de granițe roșii la 0 și 0**.

### O centură care nu se poate aprinde nu e o centură

Prima variantă avea un parametru `exceptSlot`, care sărea peste pionul ce tocmai golise mormanul
prin munca lui. Proba de mutație pentru el a ieșit **RATATĂ**: scoaterea centurii nu înroșea nimic.

Motivul e că la `ridica` pionul își eliberează propria rezervare cu trei linii mai sus, deci nu
apare niciodată în lista de pretendenți. Centura apăra o stare inaccesibilă.

S-a scos — dar nu din estetică, și nu fără plasă. O centură fără probă e un raportor orb: dacă
cineva mută vreodată eliberarea DUPĂ reconciliere, pionul chiar ajunge în propria listă, primește
`terminaJob` la mijlocul lui `ridica`, iar funcția continuă să-i scrie pașii peste un job mort.
Centura ar fi ascuns fix asta.

### A treia plasă, fiindcă primele două sunt oarbe pe axa asta

Am încercat să scriu proba pentru reordonarea de mai sus și **nu lega** — nici pe oracolul de hash,
nici pe cel de rezervări. Motivul nu e că plasele sunt slabe, ci că sunt pe axa greșită: amândouă
compară lumea continuă cu cea încărcată, iar un job zombi apare **identic în amândouă**. Hash-urile
se potrivesc. Nu e o regresie de determinism, e una de joc.

Deci o a treia plasă, care se uită la o SINGURĂ lume: *un slot viu cu `jobKind === 0` are
`jobTarget`, `jobDest`, `jobStep` și `jobProgres` pe zero.* Altfel spus, `terminaJob` trebuie să fie
ultimul care scrie.

Măsurat pe 6 semințe × 600 de tickuri: **0 rupte din 14.542** de sloturi-tick fără job pe codul
corect, **1811 din 2643** cu reordonarea. Prinde exact clasa la care celelalte două sunt oarbe.
`lumeBogata` s-a mutat în `tests/fixturi.ts` ca export, fiind acum a doua suită care o folosește.

### Bilanț

**432 de teste**, **225 de probe de mutație**, toate prinse. Trei commit-uri: reparația cu cele două
plase per tick și 4 probe; scoaterea centurii; a treia plasă cu proba ei retintită.

---

## Registrul de restanțe, reconciliat pe cod

**Model:** Claude Opus 5.5
**Prompt de start:** „continua"

### De ce

Fiecare intrare din DEVLOG își are lista ei „Ce rămâne". Ultima dintre ele — cea pe care o citește o
sesiune nouă, fiindcă citește coada — mai avea un singur punct deschis, `AO_FACTOR`. Dar între liste
**căzuseră pe drum, fără să fie închise, douăzeci și unu de puncte**. Cine citea coada credea că proiectul
n-are nimic deschis; cine citea o listă veche era trimis să facă lucruri deja făcute.

Fiecare punct s-a verificat **pe cod**, pe un instantaneu `git archive HEAD` (suita de mutații rula
în paralel și rescria fișiere sursă), nu pe text. Punctele închise sunt tăiate pe loc în listele lor,
cu verdictul lângă; aici e starea întreagă, într-un singur loc.

### Închise, fără să scrie nicăieri — șase (și una închisă greșit, corectată mai jos)

| punct | cum s-a închis |
|---|---|
| overlay-ul de construcție (trei liste) | desenat: `viewer/overlay-stabilitate.ts` arată piesele imposibile |
| variația de culoare per poziție | `variatiaLocului`, aceeași funcție pe voxeli și pe heightfield |
| garda peretelui „fără probă" | o leagă testul de etanșeitate; proba iese PRINSĂ |
| pasul 6, driverul | `anuleazaDesemnare` filtrează pe `jobTarget` sau `jobDest` |
| CI-ul n-a rulat niciodată | rulează la fiecare push, verde |
| ~~cei 205 ms din GATE.md~~ | **închis greșit aici** — cifra era în fișier; CI-ul a picat pe ea. Vezi corecția de la sfârșitul zilei |
| `rang(FARA_SPRIJIN)` (două liste) | **nu se face**: scanerul sare deliberat șantierele nesprijinite fără cauză |

### Deschise, de joc — fiecare re-verificat pe cod azi

- **Plafonul piciorului doi.** `candDist2` (morman → șantier) intră doar în departajare, nu într-un
  plafon. Cazul din lista originală — morman la 90 de celule într-o parte, șantier la 90 în cealaltă —
  rămâne posibil prin construcție.
- **Un morman hrănește un singur constructor.** `maxClaimants: 1` pe `Strat.CARAT` în cererile
  jobului de construit, deși un morman de 75 ține trei pereți.
- **Fragmentarea.** Zero cod de consolidare în `src/sim/`. După o prăbușire, 30 de mormane de câte 10
  nu ridică niciun perete; singurul leac e căratul, deci o colonie cu CARA pe 0 se blochează.
- **Gaura de conținut SCARA/LEMN.** LEMN vine numai din săparea lui `LEMN_CONSTRUIT`, care vine numai
  din SCARA, care cere LEMN (`content/rules.json`). Circular și permanent. E o decizie de conținut.
- **Producția de hrană** nu există: HRANA n-are niciun producător, se pune în lume cu comanda.
- **Grinda.** `suportRazaGrinda: 10` e validat în `content.ts` (inclusiv invariantul față de
  `suportMax`), dar `stabilitate.ts` nu-l citește. Piesa nu există.
- **6 joburi pentru 5 pereți** — o cursă între pioni, văzută o dată. Singurul punct de aici
  nere-verificat azi: cere o măsurătoare la scară, nu o căutare în cod.

### Deschise, ale mele, blocate

- **Electron nu e instalat.** Gate-ul măsoară Chrome curat; livrarea e Electron cu `in-process-gpu`.
  Cere descărcarea pachetului, adică permisiunea lui Andrei.
- **Predicția „NU pică pe GPU"** — 694.458 de triunghiuri. O rezolvă doar rularea gate-ului.
- **Terenul nepromovat fără ocluzie** — 4,3% mai deschis, sub variația naturală de ~8,7%. Reparația
  adevărată e ocluzia derivată din înălțimi, adică un arc.

### La owner — în OWNER_VERIFY, unde le e locul

Gate-ul cu D1b (2), mașina-țintă (3), batching-ul (7), plecările (8) — erau deja acolo. **`AO_FACTOR`
nu era**: în patru intrări la rând îl scriam în DEVLOG „așteaptă owner-ul", iar DEVLOG-ul se citește ca
istorie, nu ca listă de bifat. A intrat ca punctul 11, cu ce se privește și cum arată bine.

### O durată re-cronometrată, și o afirmație din `ci.yml` pe care n-o măsurase nimeni

CLAUDE.md scria „212 probe, 5 min 31 s" ca fapt curent. Suita are acum 225, re-cronometrată la
**331–476 s** (capătul de sus cu altă muncă pe mașină — de-aia bandă, nu punct).

Iar `ci.yml` spunea că pe un runner de GitHub jobul durează „de câteva ori mai mult". Nimeni nu
măsurase, deși jobul rulase deja: **351 s cap-coadă pentru 221 de probe**, cu tot cu checkout și
`npm ci`, cât pe mașina locală. `check` a durat 78 s. Corectate în commit separat, cu motivul.

---

## Electron pentru gate — și două găuri în gardă pe care le-a găsit fumul

**Model:** Claude Fable 5.1
**Prompt de start:** „da la ambele" (push + instalarea lui Electron)

### Ce era

Golul nr. 3 din `bench/GATE.md` §12: gate-ul măsura Chrome curat, dar livrarea e Electron cu
`--in-process-gpu` (cerut de overlay-ul Steam), care schimbă calea de randare. Costul flagului era
nemăsurat, cu un criteriu pre-înregistrat — peste 5% din mediană, toate cifrele se re-măsoară — și
fără nimic care să-l poată măsura.

### Ce s-a făcut

- **Electron 44.4.5**, devDependency pinuită exact. `npm install` a ieșit 0 dar n-a descărcat
  binarul: postinstall-ul lui Electron nu rulase (`node_modules/electron/dist/` lipsea, `path.txt`
  lipsea). Rulat manual `node install.js` — 246 MB. Deci „npm a zis 0" nu era „Electron e instalat".
- **`bench/gate-electron.mjs`**: deschide *aceeași* pagină de gate cu *aceiași* parametri, sub
  Electron, cu flagurile de livrare, pe profil nou; prinde descărcarea din pagină (`will-download`)
  și o salvează fără să suprascrie. `--curat` scoate `--in-process-gpu`: trei rulări (Chrome,
  Electron-curat, Electron-livrare) separă costul gazdei de costul flagului, iar pragul de 5% e pe
  flag.
- **`ruleaza-gate.cmd`** primește jetoanele `electron` / `electron-curat` (și `d1b` ca jeton, nu ca
  poziție). Ambele gazde deschid fereastra la **1600×900** — constrângere nouă, nepre-înregistrată,
  scrisă aici: fără ea, `canvasPx` ar diferi între gazde și comparația ar fi pe pixeli. Fișierul e
  acum CRLF: `cmd.exe` pierde etichete de `goto` în fișiere cu LF.
- JSON-ul poartă `userAgent` (al browserului, nedeclarabil din URL) și `hostFlags` (ce SPUNE
  lansatorul); numele fișierului începe cu gazda, derivată din UA.
- **Proba de fum** (`--fum`): fereastră ascunsă, deci rulare invalidă prin protocol, dar tot lanțul
  verificat fără om — flaguri pe linia de comandă, pagina fără erori, `EXT_disjoint_timer_query_webgl2`
  disponibilă, GPU-ul raportat e 3060-ul (nu iGPU-ul AMD, nu SwiftShader), descărcarea ajunge pe
  disc. Rulată prin serverul de preview pe build-ul de producție, ca rularea adevărată.

### Ce a găsit fumul, la prima rulare

Două verificări roșii, niciuna despre lansator — amândouă despre **gardă**.

**1. Garda de vizibilitate e oarbă sub Electron, pe un caz.** Măsurat: o fereastră creată cu
`show: false` și niciodată arătată raportează în pagină `visibilityState = 'visible'`, iar rAF-ul nu
se oprește — se târăște la **~2,5 Hz** (5 cadre în 2 s; 4 la a doua măsurătoare). Deci o rulare
într-o fereastră pe care n-o vede nimeni ar dura 24 de minute și ar ieși **VALIDĂ**, cu intervale de
400 ms. Exact clasa pe care §5b o numește cea mai importantă. `win.hide()` și `win.minimize()` dau
`hidden` corect, deci acolo garda paginii ține.

Reparația e **a doua gardă, în procesul care chiar știe**: `win.isVisible()` / `win.isMinimized()`
la pornire, plus evenimentele `hide` și `minimize`, toate invalidând prin aceeași `probe.invalidate`
din pagină. Nu s-a atins `backgroundThrottling` și nu s-a forțat rAF-ul: ar fi făcut rularea „să
meargă" singură, adică ar fi măsurat altceva decât ce vede jucătorul. Proba negativă a gardei e chiar
fumul: fereastră nearătată ⇒ pagina spune „vizibil", procesul principal spune „nu", fișierul iese
INVALID cu motivul din procesul principal.

**2. Pragul de granularitate a ceasului decidea prin rotunjire flotantă.** `checkGuards` compara
`g > 0.1`; tocirea Spectre din Chromium e exact 100 µs, iar diferența a două `performance.now()`
iese, după cum cad octeții, **0,0999999** sau **0,1000000**. Pe aceeași mașină: 0,100 la fum (roșu),
0,0999999 la măsurătoarea următoare (verde). Chrome trecuse din noroc. Acum se compară în
microsecunde rotunjite — mai grosier decât tocirea implicită, adică > 100 µs. La a doua rulare a
fumului motivul de invalidare a fost cel din procesul principal, nu granularitatea: reparația ține.

**Ce nu are probă de mutație, spus cinstit:** `viewer/probe.ts` nu e în nicio suită de mutații —
are nevoie de DOM. Pragul nou e exercitat doar de fum, sub Electron. E un gol cunoscut al suitei,
nu unul nou.

### Și o corupție în GATE.md

`bench\ruleaza-gate.cmd` apărea în §5b ca „bench" + linie nouă + „uleaza-gate.cmd": un heredoc de
altădată a colapsat `\r`. Scriptul de editare de azi a picat întâi din același motiv — `\r` într-un
șir Python — și a reparat corupția cu șiruri brute. A patra oară în memoriile de shell aceeași capcană.

### Ce rămâne

- **Măsurătoarea**, care e a unui om: trei rulări cu fereastra vizibilă. E în OWNER_VERIFY 2.
- **Granularitatea rămâne 100 µs** și sub Electron. Izolarea cross-origin (COOP/COEP) ar da 5 µs;
  `vite preview` nu trimite anteturile. Rezoluția bisecției e 0,25 ms, deci deocamdată nu leagă.

### Corecție la reconcilierea de dimineață: cei 205 ms erau acolo

Push-ul de la 06:08 a picat pe `check-gate-numbers`: runner-ul de GitHub a măsurat meshing-ul
fixturii M10 la **139,9 ms**, GATE.md spunea **205 ms** — abatere 47%, peste banda de 40%. Local,
aceeași verificare ieșea verde (175 ms, la 15% de 205), și pe verdele ăla am declarat de dimineață
punctul „cei 205 ms" ÎNCHIS, cu propoziția „cifra nu mai există". Cifra era în cinci locuri.

Eroarea are un nume în memoriile de lucru: un semnal verde nu e o măsurătoare. Verificarea compară
cifra cu **mașina pe care rulează**; o cifră luată într-o dimineață zgomotoasă poate sta în bandă pe
mașina de referință și în afara ei pe runner. Am citit verdele, nu fișierul.

Re-măsurat, liniștit, de cinci ori: 174,1 · 181,8 · 184,0 · 174,4 · 161,5 ms → **mediana 174 ms**.
Runner-ul e la −20% de ea; 205 era la +18%. Re-etalonarea s-a făcut în commit separat, cu motivul,
cum cere antetul protocolului; celelalte apariții ale lui 205 din GATE.md s-au aliniat (12 cadre
pierdute la remesh devin 10), în afară de cea istorică din perechea „219 → 205", care e o
măsurătoare de atunci, nu o afirmație despre azi.

### Hash-ul de referință: 6ff16b2a → 79035d35, mutat de reconciliere — și pasul care l-a mascat

După re-etalonarea GATE.md, `check` a picat din nou, pe pasul **următor**: hash-ul de referință.
Runner-ul scoate `79035d35`, CI aștepta `6ff16b2a`. Local, același `79035d35` — deci nu e o
problemă de determinism între mașini, e o schimbare de comportament neconsemnată.

Atribuită pe instantanee `git archive`, nu prin deducție:

| commit | `reconciliazaTintaMoarta` în cod | hash | coloniști vii |
|---|---|---|---|
| `184502b` (dinainte) | 0 apariții | `6ff16b2a` | 32 |
| `336dc8e` (reconcilierea) | 4 | `79035d35` | **33** |

Reconcilierea la moartea țintei a mutat hash-ul — firesc, joburile se încheie cu un tick mai
devreme — și **un colonist în plus supraviețuiește** în scenariul standard. E un efect de joc
vizibil, nu doar un bit de hash, și trebuia scris în intrarea reconcilierii. Nu a fost, fiindcă
nimeni n-a rulat scenariul: `npm run check` nu avea pasul de hash, iar în CI pasul a fost **mascat**
trei commit-uri la rând — în aceeași rulare picase întâi `check-gate-numbers`, iar pasul de hash nu
mai rula deloc. Un roșu care se oprește la primul pas nu spune tot ce știe.

Trei reparații, în același commit fiindcă sunt aceeași lecție:
- `EXPECTED=79035d35` în `ci.yml`, cu motivul aici, cum cere regula de la S1-2;
- pasul de hash primește `if: ${{ !cancelled() }}`, ca să raporteze și când a picat un pas dinaintea lui;
- `tools/check-hash.mjs` intră în `npm run check` (~9 s): citește `EXPECTED` **din `ci.yml`**, nu
  dintr-o copie, rulează scenariul standard și compară. Ce rulează poarta din CI trebuie să ruleze
  și poarta locală — altfel se livrează orb pe felia aia.

---

## S20-23, tăietura 3 — logistica construcției: măsurători, design v2, panou, design v3

**Model:** Claude Fable 5.1 · panoul de design cu 5 lentile (1,20 M tokeni, 62 de constatări)
**Prompt de start:** cele două numere din panoul de usage (51% din fereastra de 5 ore, resetare în 1 h 57)

### Bugetul, și tranșa

Felia întreagă (~6–8 M) nu încăpea în ce rămăsese fără riscul auditului din 04.09. Tranșa 1 = măsurători
+ design + panou (~1,35 M estimat, **1,20 M** cheltuit); codul îl scriu eu; recenzia de cod cu reproducere
(~4 M) după resetare.

### Ce s-a măsurat ÎNAINTE de design (`scratchpad/masoara-logistica.mjs`, 3–7 semințe)

| punct din registru | măsurat | verdict |
|---|---|---|
| plafonul piciorului doi | scenariu natural: mers real = mers optim, **0 exces**; scenariu construit să doară (mormane la 8 celule într-o direcție, șantiere la 40 în cea opusă): toate joburile iau din mormanele „greșite", exces **8–22 celule/job**, +12–23% | **nu se construiește**: pierderea e mărginită de 2·dMin; un plafon ar refuza șantiere ca să economisească atât |
| un morman per constructor | 1 morman de 75, 3 pereți, 3 constructori: **220/420/241** tickuri; 3 mormane de 25: **112/112/120** | real, 2–3,5×; mecanismul e lacătul exclusiv + `jobRescanTicks: 30` |
| fragmentarea | 30×10: fără depozit **0 pereți în 20.000**; cu depozit 3 pereți la 193, dar 21 de mormane rămân; fără cărăuși 0 | real, structural |

Deci felia are două defecte, nu trei.

### Designul v2, și ce i-a făcut panoul

v2 propunea D-B (rezervări cu cantitate, `maxCount` = Q vie în tuplu) și D-C (ridicare în mai multe
rânduri, câmp nou `jobSursaCant`, schema 8). Cinci lentile independente — determinism, rezervări, joc,
performanță, probe — au lovit **aceeași rădăcină**, fiecare cu dovadă proprie:

- **`maxCount = Q vie` e greșit**, și invariantul pe care se sprijinea („Σcount CARAT ≤ Q") e **deja fals
  azi**: 6 din 3600 de tickuri pe `lumeBogata` (HRANA mâncată pe stratul MANCAT sub un cărăuș) și 8/8
  scene cu `mutaItem`, care păstrează id-ul pe un FRAGMENT mai mic (`asazaItem` cu id contopește întâi
  și abia restul primește id-ul vechi). Reconstrucția la încărcare ar fi anulat joburi vii; oracolul propus
  s-ar fi născut roșu. Reparația: `maxCount` constant, Q vie doar la cererea nouă ca `liber = Q − Σcount`.
- **Schema 8 e inutilă**: `jobCantitate` = count pe sursa curentă (precedent `refaDestinatia`), totalul e
  în content, pe care `zideste` îl citește deja.
- **„`ridica` cu sursa moartă → `refaSursa`" e cod mort** (moartea trece prin `reconciliazaTintaMoarta`
  în același tick); **„eșecul consolidează" e un no-op** (pionul lasă marfa pe celula sursei golite).
- **Argumentul 2·dMin cade** dacă a doua sursă se alege după celula curentă (19% din 3000 de câmpuri
  peste, până la 12·dMin) și **revine complet** ordonată pe `d(curent, M) + d(M, șantier)` (0/3000).
- **`constructPickupMinUnits: 10` era respins de propriul validator** (SCARA cere 5) — pragul e per piesă.

Și trei defecte care există **azi**, găsite de panou:

- **Munca falsă** (măsurat): `refaTinta` la MERGE_SURSA trimite constructorul la șantier cu mâna goală;
  cu un ostil pe morman, **73 din 74 de joburi** într-o buclă de 3000 de tickuri, 2586 de tickuri de
  „zidire" din nimic, `nextId` +74, zăvor mut. Se repară în felie (garda pe pas + zăvor `zidiriCuManaGoala`).
- **`poateFiIntrerupt` nu apără mâna plină a constructorului**: foamea critică aruncă 20 de unități la
  390/400 de progres.
- **`mutaItem` cu contopire parțială** lasă un id viu cu Q mai mic sub rezervări, fără reconciliere.

Designul v3 (`scratchpad/design-s20-logistica-v3.md`) e ce se construiește: tabelul „v2 spunea / v3 face"
are 12 rânduri; 18 teste cu contor de viață și mutația fiecăruia; pasul 0 e captura fixturii golden de
schema 7 la HEAD, înainte de orice cod.

### Ce rămâne deschis, cu cifra

- reconstrucția indexului per ridicare: ~180 µs la 3000 de mormane; sortarea candidaților: ~590 µs la
  n = 3000 — ambele pre-existente, se scriu, nu se repară aici;
- D-D (trezirea la eliberare) după, pe o fixtură de 3000, cu `jobRescanTicks` fix;
- praful sub prag: D-C creează clienții căratului de consolidare — reintră în registru;
- 2·dMin e în Manhattan, costul e drumul: de măsurat pe sit neplat.
