# KINSTEAD — reguli de proiect

Faptele stabile și regulile permanente. Se încarcă la fiecare sesiune.
Planul și designul sunt în [PLAN.md](PLAN.md) și [DESIGN.md](DESIGN.md); DEVLOG-ul e append-only.

---

## Ce e jocul

Colony sim / base builder. **Un popor care sapă adânc și ale cărui așezări îi supraviețuiesc.**
Construiești o fortăreață pe niveluri; generațiile trec, valea obosește, tribul migrează —
iar așezarea rămâne pe hartă ca ruină, avanpost sau cuib de jefuitori.

Inspirații: Sapiens (lume), Going Medieval (adâncimea construcției), Ostriv și Foundation
(organic, dar doar ca prezentare).

## Arhitectura, într-o propoziție

**Grila de 1 m e universală, stiva verticală e rară.** Lumea e un heightfield continuu de 16×16 km
streamed în chunkuri de 32 m; un chunk devine voxeli doar când sapi sau construiești în el.
Detaliile în PLAN.md §0.5.

---

## Reguli dure în `src/sim/`

Impuse mecanic de `tools/check-sim-discipline.mjs`, care rulează în `npm run check` și în CI.

| Interzis | De ce |
|---|---|
| `Date.now()`, `new Date()`, `performance.now()` | `w.tick` e **singura** sursă de timp. Ceasul mașinii face simularea dependentă de viteza hardware-ului. |
| `Math.random()` | Aleatorul vine din fluxuri **numite** (`rng.ts`). Un RNG global face ca o tragere în plus într-un sistem să miște secvența altui sistem, iar replay-urile vechi nu se mai reproduc. |
| `async` / `await` / `Promise` / timere | Simularea e sincronă și pas cu pas. |
| `process.env`, `process.argv` | Nucleul nu citește mediul. |
| Iterare peste `Object.keys/values/entries` fără `.sort()` | Nedeterminism tăcut, care se reproduce „o dată din cinci" și dispare când adaugi un log. |

**Portița:** `determinism-ok: <motiv>` pe linia de cod sau în blocul de comentariu care o precede.
Acoperă doar iterarea nesortată, **niciodată** interdicțiile dure. Te obligă să scrii *de ce*.

### Alte reguli de nucleu

- **Fără float în starea de simulare.** Pozițiile sunt întregi, în milimetri (`MM_PER_CELL = 1000`).
- **SoA, nu AoS.** Agenții stau în array-uri paralele de primitive, nu ca obiecte per agent.
- **Nicio verificare nu returnează `boolean`.** Totul trece prin `Outcome<T>` din `result.ts`:
  un „nu" poartă cu el `reason` și `params`. Din contractul ăsta iese panoul „De ce nu?",
  care e cel mai bun raport valoare/efort din tot research-ul. Retrofitarea lui = rescrierea
  fiecărei verificări din joc.
- **Nimic nu scrie în `World` din afară.** Orice schimbare intră prin `applyCommand`.
  De aici vin gratuit replay-ul, undo-ul și un eventual drum spre co-op.
- **Un număr de gameplay în cod e un bug de arhitectură.** Totul în `content/*.json`, validat
  la încărcare, cu refuz explicit pentru câmpuri necunoscute.
- **Fiecare câmp de stare e PERSISTED, DERIVED sau TRANSIENT.** Ce e DERIVED nu se salvează,
  se reconstruiește la încărcare.

## Comenzi

```bash
npm run check        # disciplină + typecheck + teste. Asta e poarta.
npm run discipline   # doar scanerul de determinism
npm run typecheck    # tsc --noEmit
npm test             # node --test
node src/harness/cli.ts --seed 12345 --ticks 100000 --agents 40
```

**`npm test` NU face typecheck.** Testele pot fi verzi cu tipurile roșii. Poarta e `npm run check`.

Pe Windows, `kinstead.bat` le adună pe toate: dublu-click deschide un meniu, iar cu un argument
(`kinstead.bat check`) rulează o singură comandă și întoarce codul ei de ieșire.

### Mutațiile

```bash
npm run mutatii -- --lista      # ce suite există
npm run mutatii                 # toate cele 159, ~50 de minute
npm run mutatii -- nevoi        # o singură suită
npm run mutatii -- nevoi podeaua  # doar mutațiile al căror nume conține „podeaua"
```

Strică pe rând câte o garanție din cod și verifică dacă se înroșește **exact** testul scris pentru
ea. Asta e proba negativă a suitei; fără ea, un test care nu mai exercită nimic arată la fel cu unul
care apără ceva. **Cere arborele curat** — restaurarea se face prin `git checkout --`, deci ordinea e
commit → mutații → reparații → commit. Un `TIPAR LIPSA` e eșec, nu „prinsă": tiparele se învechesc
când codul de sub ele se mută, deci se rulează **toate** suitele după fiecare tranșă, nu doar cele
noi. La fel un `TIPAR AMBIGUU`: `String.replace` ia PRIMA apariție, deci un tipar care se
potrivește în două locuri editează altul decât cel gândit, rulează testele celui gândit și iese
„RATATĂ" — adică te trimite să scrii un test pentru o gardă deja probată. Nu intră în
`npm run check` și nici în CI: modifică fișiere sursă.

## Metodă

- **Un semnal verde nu e o măsurătoare.** Fiecare instrument de verificare are o **probă negativă**:
  un test care demonstrează că instrumentul chiar pică atunci când trebuie. Scanerul de disciplină
  are patru. *(Prima lui versiune raporta propria documentație ca încălcare — instrumentul era
  stricat, nu codul.)*
- **Orice număr care ajunge într-o decizie se re-verifică la sursă sau se măsoară.** În panoul de
  arhitectură, o cifră inventată despre performanța PIBT s-a propagat identic în toate cele patru
  propuneri, pentru că nimeni n-a deschis sursa. Vezi K17 în PLAN.md.
- **Nimic din `sim/` nu are voie să depindă de motor.** Nucleul e polița de asigurare care face
  decizia de motor reversibilă — inclusiv terenul și mesher-ul, care sunt calcul pur.
  *(Regula de aici spunea inițial „nu se scrie cod de teren înainte de gate-ul de la S8". Era
  greșită: condiția reală era închiderea lui D17, care s-a întâmplat în panoul de arhitectură.)*
- **Măsoară înainte să optimizezi, și verifică fixtura înainte să crezi măsurătoarea.** Ambele au
  prins ceva real în sesiunea 1: ablația mesher-ului a arătat că 61% din timp era exact unde nu
  credeam, iar un rezultat alarmant s-a dovedit a fi o fixtură nereprezentativă (săpătură aleatoare
  în loc de camere).
- DEVLOG.md primește o intrare Task Started / Task Completed per sesiune, cu promptul și modelul.
- Zero dependențe de runtime în `src/`. Doar `typescript` și `@types/node` ca devDependencies.

## Stare

- **S1-2 livrat:** nucleu determinist, harness headless, save versionat, loader de conținut,
  scaner de disciplină, CI.
- **S3-5 livrat:** harta macro (funcție pură de seed), streamer de chunkuri, promovarea la voxeli RLE
  cu apron, dig/fill, save doar al chunkurilor promovate. **77 de teste**, inclusiv fuzz-ul de 10.000
  de operații cerut de plan. Numerele măsurate sunt în PLAN.md §0.5.
- **S6-8, prima jumătate livrată:** binary greedy meshing, măsurat. Rămâne randarea propriu-zisă
  (three.js, slice view, cameră) și abia atunci se poate rula **gate-ul de motor (D1)**.
- **Motorul e deliberat nedecis.** Nucleul e TypeScript pur, fără dependențe de motor, tocmai ca
  decizia să rămână reversibilă — portabil în C# în săptămâni.

### Invarianți de teren, de nu încălcat

- **Ne-promovat = cache (DERIVED). Promovat = date (PERSISTED).** Un chunk ne-promovat se poate arunca
  oricând; unul promovat conține munca jucătorului și nu se aruncă niciodată, nici la streaming.
- **Save-ul conține DOAR chunkurile promovate.** Cele 268 km² se regenerează din seed.
- **Hash-ul nu conține chunkuri ne-promovate.** Altfel două lumi identice ca *conținut* ar arăta
  diferit doar pentru că una a încărcat mai mult teren.
- **Promovarea e ireversibilă și vine cu apron de 1 chunk.** O graniță care se mișcă în ambele sensuri
  ar trebui să fie corectă în ambele sensuri în șase subsisteme. Cu apron, seam-ul e un inel testabil.
- **`terrain.keys` e MEREU sortat.** E singura sursă de ordine la iterarea peste teren.
- Generarea e o **funcție pură de (poziție, seed)**, în aritmetică întreagă — nu consumă din fluxurile
  de RNG, deci două chunkuri generate în orice ordine dau același rezultat.
