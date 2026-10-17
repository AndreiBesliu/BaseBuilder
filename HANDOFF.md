# Predare — starea la 17.10.2026 (actualizată după harta și designul v1 ale t.4)

Scris la închiderea sesiunii care a livrat S24-27 t.2b și t.3; actualizat de sesiunea care a pornit t.4. **Faptele stabile sunt în
CLAUDE.md, starea în DEVLOG / PLAN / OWNER_VERIFY**; aici e doar puntea spre sesiunea următoare. Când t.4 trece de panou, sesiunea care
o duce mai departe actualizează sau șterge fișierul ăsta — o predare veche citită ca instrucțiune trimite la muncă deja făcută.

## Unde suntem

- `main` = commit-ul „Confort (S24-27 t.4): harta și designul v1" peste `6611cc2` (doar documente și scripturi de măsurare, niciun cod
  de joc). Nicio ramură în afară de `main`, niciun worktree, nicio clonă. `.claude/worktrees/` e în `.gitignore`.
- S24-27 livrate: t.1 încăperile și ușa (28.09), t.2a regimul permanent (08.10), t.2b temperatura ca stare (10.10),
  **t.3 hrana sub 5 °C (11.10, `1b6f0b3`)** — alterarea, cămara, prognoza. Rezumatul t.3: rândul S24-27 din PLAN.md;
  detaliile, abaterile și registrul: `research/hrana-t3.md` §13; intrarea „Task Completed — 11.10.2026" din DEVLOG.
- Hash-urile literale (neschimbate de pasul ăsta): `c4a6c1dc` standard (ci.yml + `tools/check-hash.mjs`), `84be6e5e` acces-joc,
  `f83bc5fb` migrare, `82d32e8f` S+, `9b8cdbd4` schema 8 cu hrană, `505346b7` „S+ hrană".

## Ce așteaptă la owner (nu blochează t.4)

OWNER_VERIFY **§18** (hrana): 10 pași pe ecran și 25 de decizii cu implicitul în față, încheiate cu «ok la toate».
Singura decizie nouă care schimbă jocul vizibil e **19 (JOC-3)**: groapa de moloz e „haldă" și trage și pământul
din depozitul general. Plus o linie nouă în §17, decizia 6. Fără răspuns la 17.10.

## Felia în lucru: t.4 — confortul −8..34 °C

**Făcute (17.10):** harta pe HEAD — `research/confort-t4-harta.md` (H1–H7, măsurătorile M1–M4; scripturile în
`research/masuratori-t4/`, `node <script>` din dosarul lui), inline; **panoul adversarial** pe designul v1 (4 lentile + 9 verificatori,
13 agenți, 3,65 M, 74 min, cu acordul owner-ului; 51 de constatări, 2 CRITIC cu aceeași rădăcină); **designul v2** —
`research/confort-t4.md` (v1 e în `933cc96`): nevoia FRIG cu toleranța pe om, jobul INCALZIRE, `adapostPentru` (o singură intrare, o
singură răcire) peste `cautaAdapostPur` (V3: pe felii, în ordinea distanței, două treceri 96 / 384), regula benzii condiționată de
existența unui loc în bandă, „Înghețat" −270 cu podeaua păzită, schema 10, 11 decizii, tabelul constatărilor la §13. DEVLOG: „Task
Started — 17.10.2026" și „Pauză — 17.10.2026".

**Ce trebuie știut înainte de cod:** jocul nou implicit nu ajunge la val (decizia 8 la owner); fixtura casă + pivniță din
`tests/fixturi-pivnita.ts` nu se poate intra pe jos (după ușă urmează rampa) — acceptanțele cer o fixtură nouă; `Componenta.bucati` NU e
o ordine canonică (sloturi LIFO) — orice parcurgere cu plafon peste încăperi merge pe felii, în ordinea `idx.chei`; cifrele măsurate pe
prototip (munca, timpii) sunt în §5 din v2; prototipurile panoului (diff-uri) au stat în scratchpad-ul sesiunii din 17.10.

**Urmează, DOAR cu acordul owner-ului și cu costul spus înainte:** codul în trei commit-uri (A formatul, B efectul, C ecranul — §11
din v2, cu listele locurilor atinse), apoi recenzia codului, documentația (OWNER_VERIFY §19 cu pașii rulați pe codul real). Lecțiile de
aplicat: acceptanțele pe drumul NATURAL (oamenii își caută singuri adăpostul), nu cu jobul pornit de mână; porțile în PERECHE (lumea
fără adăpost și aceeași lume cu adăpost), ca un filtru mort să nu treacă; abaterile declarate de agenți se verifică pe cod.

Registrul S24-27 rămas după t.4: T pe bucată, modelul pasului pe deltă, vatra, ușa la trecere, gheața (cu producția de hrană), „mănâncă
întâi ce se strică", a doua plasă a gropii. Apoi S28-31: lanțurile de producție.

## Cum se lucrează acum (regulile owner-ului, în vigoare la 17.10)

- **Pași mari**: o felie întreagă (sau o fază mare a ei) pe pas, cu commit + push + CI + raport în română, apoi STOP
  și se așteaptă „continua".
- **Agenții (Workflow / Agent) DOAR cu acordul owner-ului, cu costul spus înainte.** Citește întâi consumul cu
  `get_usage` (ccd_session_mgmt; fereastra de 5 ore și săptămânalul). La 17.10: săptămânal 8%, 5 ore 34%; după harta
  și designul t.4: săptămânal 12%; după panou și v2: săptămânal 24% (panoul singur 3,65 M).
- Restul nu se mai întreabă: se face și se raportează (excepții: secrete, conturi, plăți, verificări vizuale).
- Costul măsurat al unei felii cu metoda completă (t.3): harta 2,2 M, panoul adversarial pe design 4,9 M, valul de
  simulare 2,0 M, valul de ecran 1,45 M, recenzia + remedierea + porțile ~1,5 M, documentația 1,1 M — **~13 M**.
  Panoul pe design a meritat de fiecare dată (a schimbat substratul sau regulile înainte de cod); recenzia codului a
  găsit de fiecare dată cel puțin o constatare MARE. O variantă mai ieftină de propus: harta și designul inline
  (fără agenți), apoi panoul și recenzia cu agenți, cu acordul.
- OWNER_VERIFY: verificările pe ecran separat de decizii; decizia cu varianta aleasă ÎN FAȚĂ, în cuvintele jucătorului;
  pașii owner-ului se rulează pe codul real înainte să fie scriși (t.3: „~2,9" era doar în prima secundă, apoi „~2,8").

## Porțile și comenzile

- `npm run check` (~2,5 min): disciplina, typecheck sim + viewer, 1.178 de teste, `mutatii:check` (1.334 de probe),
  gate, hash = ci.yml. `npm test` singur NU face typecheck.
- Mutațiile complete (~35 min) **DOAR într-o clonă în afara Drive-ului**:
  `git clone -q --no-hardlinks <repo> <dosar>`, joncțiune `node_modules` (`cmd /c mklink /J`), `npm run mutatii`,
  `git status` gol la final, apoi `cmd /c rmdir` pe joncțiune și clona ștearsă. `npm run mutatii -- --izolare`: 765, ~14 min.
- Scenariul de referință: `node src/harness/cli.ts --seed 12345 --ticks 100000 --agents 40` → `c4a6c1dc`.
- ui-fum (Electron, mouse și taste reale; nu intră în check): Vite pornit din arbore pe un port liber, apoi
  `node_modules/electron/dist/electron.exe bench/ui-fum.mjs http://localhost:<port>/` — 92 de bife;
  `--proba-negativa=<nume>` pentru fiecare din cele 27 din `TINTE_NEGATIVE` (~165 s fiecare; iese verde doar dacă
  EXACT bifa ei e roșie). Vite și Electron se opresc la final; nimic (`vite.pid`) lăsat în repo.
- CI: ~5 min check, ~22 min mutațiile.

## Capcane măsurate în sesiunile t.2b / t.3

- Un worktree în scratchpad are INDEXUL în `.git`-ul din Drive: mutațiile acolo pot eșua la restaurare → clonă.
  `git worktree remove` dă „Permission denied" pe `.git/worktrees/<nume>` (Drive): joncțiunea `node_modules` se scoate
  ÎNTÂI cu `cmd /c rmdir`, apoi resturile cu `Remove-Item`.
- Fișierele de lucru sunt CRLF: niciodată `sed -i` (rescrie totul în LF, chiar fără înlocuire); editări cu Python
  `newline=''` sau Edit; verificare pe octeți.
- Un heredoc necitat EXECUTĂ backtick-urile din text; unul citat colapsează `\\` — scripturile se scriu cu Write.
- Un workflow oprit la închiderea sesiunii se reia cu scriptul INLINE + `resumeFromRunId` (scriptPath-ul din altă
  sesiune e refuzat); agenții terminați vin din cache. Agenții opriți la limită lasă Vite/Electron/clone pornite →
  inventar și curățenie înainte de relansare.
- O abatere declarată de un agent, cu motiv, se verifică pe cod: în t.3, premisa falsă „citirea regiunilor scrie" a
  scos proba de acces și a dat singura constatare MARE (groapa pusă pe acoperiș); acceptanța trecea fiindcă punea
  groapa de mână — acceptanța trece pe calea butonului.
- Acumulatorul de alterare e pe morman: fărâmițarea pierde MAI MULT (750 × 1 u → 100 u valoare în 5 zile la 15 °C);
  unitățile vizibile nu sunt valoarea, iar prognoza lucrează pe valoare.
