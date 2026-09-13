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
