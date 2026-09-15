# Ce așteaptă la tine

Lucrurile pe care nu le pot verifica sau decide singur. Fiecare are **ce te uiți**, **cum arată
bine** și **de ce nu pot eu**. Se șterge un rând când primește răspuns.

Starea completă e în [DEVLOG.md](DEVLOG.md); ăsta e doar capătul de listă.

---

## 1. D20 — așezarea liberă a clădirilor: e varianta asta ce voiai?

**Ce te uiți.** Pornește viewerul (`Kinstead.cmd`), apasă **B**. Rotește cu `,` și `.`, schimbă forma
cu **N**, pornește și oprește ancorarea cu **M**.

- **conturul alb** e clădirea adevărată, ce s-ar desena în joc
- **verde** sunt celulele pe care le acoperă oricum
- **chihlimbar** sunt celulele blocate *în plus* — acolo nu poți păși deși pe ecran e loc. **Aia e
  taxa, și ea e întrebarea.**

**Cum arată bine.** Te uiți la o hală rotită la 30–45° și chihlimbarul ți se pare acceptabil. Dacă
da, D20 se închide așa cum e propusă și pot construi mai departe pe ea.

**De ce nu pot eu.** E o judecată vizuală, nu una măsurabilă. Cifrele le am — hală 12×7 m de
1,24–1,33× aria reală, colibă 4×3 m de 2×, zid subțire între 1,13 și 2,38 celule pe metru — dar
niciuna nu răspunde la „arată prost?".

**Ce NU e negociabil, și de ce.** Regula de acoperire rămâne „orice atingere", chiar dacă pare
grasă. Alternativa („celula intră dacă centrul ei e înăuntru") arată mult mai fidel și **curge**:
apasă **N** de două ori până la *zid 0,2 × 8 m*, rotește la 30°, și citește în HUD coloana
`CENTRU`. Scrie **1**. Un zid de opt metri care oprește pe cineva într-un singur loc. Arată ca un
zid, nu e un zid — și n-ai găsi cauza niciodată privind zidul.

**Dacă răspunsul e „nu, vreau coliziune cu adevărat off-grid":** atunci se redeschide **D19**, nu
D20 — adică decizia de arhitectură închisă unanim, pe care stau pathfinding-ul, camerele,
stabilitatea și slice view-ul. E o discuție mult mai mare și merită purtată explicit.

---

## 2. Gate-ul de motor (D1) — rularea

**Ce faci.** Dublu-clic pe `bench\ruleaza-gate.cmd`, argument `fortress d1b`. Fereastra **nu
minimizată**, ~60 de secunde. Scoate un `.json`.

**Cum arată bine.** Fișierul există și nu conține `INVALID`.

**De ce nu pot eu.** `requestAnimationFrame` nu rulează într-o fereastră ascunsă, iar sonda o
raportează corect ca `INVALID · pagina nu e vizibilă`. Măsurătoarea cere un ecran adevărat, vizibil.

---

## 3. Mașina-țintă (tot D1)

**Ce decizi.** Pe ce clasă de mașină trebuie să meargă jocul.

**De ce contează.** Mașina ta (7950X + RTX 3060) e de 2–5× peste clasa țintă plauzibilă. Din
[`bench/GATE.md`](bench/GATE.md): pe ea gate-ul **nu poate semna STAY**, doar STAY-PROVIZORIU.
**D1 nu se poate închide fără răspunsul ăsta** — e scris acolo, nu o inventez acum.

**De ce nu pot eu.** E o decizie de produs: pe cine vrei să ruleze jocul.

---

## 4. Spike-ul de aspect

**Ce te uiți.** `viewer/spike.html` — clădiri rotite liber, ziduri din pietre individuale, teren
neted, soare cu umbre moi. Tot procedural, zero fișiere de model.

**Cum arată bine.** Îți place direcția, sau îmi spui ce anume nu.

**De ce nu pot eu.** Era răspunsul la „nu-mi place că totul e construit din pătrate". Numai tu poți
spune dacă răspunde.

---

## 5. Petele de pe pantă — reparate, dar merită o privire

**Ce te uiți.** Panta de lângă fortăreață, în viewer.

**Cum arată bine.** Suprafețe continue, fără găuri prin care se vede fundalul.

**De ce îl las aici.** Era un defect real (fețe cu înfășurare inversată, eliminate de culling) și e
reparat, cu test. Dar ce se vede acum în locul găurilor sunt **contratreptele** terenului voxelizat
— adică exact aspectul „totul e din pătrate" de la punctul 4. Reparat nu înseamnă frumos.

---

## 6. Primii pioni care muncesc — se citește ce fac?

**Ce te uiți.** Viewerul, tasta **J**. Dă click pe teren de câteva ori (fiecare click = „săpați aici").
Pionii bej care merg spre o cerere devin albăstrui, cei care sapă devin verzi; o linie albă leagă
fiecare pion de locul lui de lucru. Cererile: chihlimbar = liberă, albastru = a luat-o cineva,
roșu = n-are niciun loc de unde s-o sapi (sapă o rampă), violet = are loc dar nu se ajunge,
portocaliu = un pion a renunțat la ea (un ostil în drum, drum prea scump) dar altul o poate lua.

**Cum arată bine.** Fără să citești nimic din ce am scris mai sus, îți dai seama cine ce face și de ce
o cerere nu e luată. Dacă trebuie să ghicești, spune-mi ce anume ai vrut să știi și n-ai găsit.

**De ce nu pot eu.** E lizibilitate, nu corectitudine: corectitudinea o acoperă 213 teste.
Research-ul spune că genul se câștigă în lizibilitatea a 200 de stări simultane; aici sunt primele.

---

## 7. Mormane și depozite — se vede unde se duce marfa?

**Ce te uiți.** Viewerul, tasta **J**. Dă click pe teren de câteva ori (cereri de săpat), apoi ține
**Z** apăsat și dă click de două ori, pe două colțuri ale unui dreptunghi de teren plat: ăla e
depozitul (pătrate verzi pe podea). Fiecare voxel săpat lasă un morman (un cub mic; cu cât e mai
înalt, cu atât e mai plin). Pionii arămii cară ceva; linia albă arată spre morman sau spre celula
de depozit. Pătratul devine mai luminos când se umple și albastru cât timp vine cineva spre el.
**X**+click pe depozit îl șterge (cine ducea ceva acolo lasă marfa la picioare).

**Cum arată bine.** Vezi mormanele apărând lângă săpături, pionii plecând cu ele spre depozit și
depozitul umplându-se dinspre partea apropiată de carieră. Un morman roșu = n-are unde (nu există
depozit sau e plin); violet = are unde, dar nu se ajunge. Dacă vezi un morman care stă roșu deși
depozitul are loc, sau un pion care ridică și lasă același morman la nesfârșit, aia e ce vreau să știu.

**De ce nu pot eu.** Corectitudinea o acoperă 246 de teste (marfa nu dispare, nimic nu se mută între
depozite egale, drumurile blocate nu produc bucle). Ce nu pot judeca e dacă se CITEȘTE — și dacă
ritmul (pionii merg de ~5 ori mai mult decât muncesc, măsurat) pare „joc" sau pare defect. De
răspunsul ăsta depinde dacă batching-ul (mai multe mormane pe drum) intră acum sau mai târziu.
