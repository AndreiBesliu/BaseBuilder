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
