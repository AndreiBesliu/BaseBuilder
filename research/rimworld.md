# rimworld — RimWorld ca referință canonică pentru colony sim: grila de priorități, job system, nevoi/mood, sănătate pe părți de corp, AI Storyteller, regiuni/camere, modding și limite de performanță — tradus în decizii de producție pentru un dev solo

## Rezumat

RimWorld nu e „un joc bun din gen", e specificația implicită pe care jucătorii o aplică oricărui colony sim nou, inclusiv Going Medieval și Sapiens. Am confirmat din surse primare (cod decompilat Verse/RimWorld, Steam Workshop live, wiki, discuții de jucători) că ce pare „design" e de fapt inginerie: grila de priorități 1-4 e doar UI peste un JobGiver_Work care iterează workGivers sortați și se oprește devreme la schimbarea de tier; pionul re-evaluează după FIECARE job terminat, iar think tree-ul constant rulează la fiecare 30 de tick-uri. Coliziunea între pioni e rezolvată de un ReservationManager cu chei (claimant, job, target, layer, maxPawns, stackCount), nu de „inteligență" — e o tabelă de lock-uri, ieftină și obligatorie. Pathfinding-ul e făcut viabil de un sistem de regiuni 12×12 reconstruit incremental prin RegionDirtyer, cu reachability testată la nivel de regiune/cameră, nu de celulă — de aici și bug-ul clasic „pionul pleacă spre ceva ce nu poate atinge". Moodul nu e o sumă instantanee: există mood target (bază + toate thoughts) iar bara reală urcă cu ~+12/oră și coboară cu ~-8/oră, ceea ce îi dă jucătorului timp de reacție; break-urile se declanșează la ~35%/20%/5%, cu Major = 4/7 și Extreme = 1/7 din statul de prag. Modelul de sănătate e exceptional pentru că e compozițional, nu pentru că e complex: rănile stau pe părți de corp, capacitățile (Moving, Manipulation, Consciousness) se derivă din eficiența părților, iar o proteză scurtcircuitează calculul returnând direct partEfficiency — de aici ies poveștile fără scripting. Storyteller-ul convertește averea coloniei în threat points prin curbe explicite (plat sub 14.000 wealth, 2.400 puncte la 400.000) și adaugă adaptation factor, iar Randy multiplică fiecare eveniment cu 0.5-1.5. Ecosistemul de modding e masiv și măsurabil: 38.836 de mod-uri pe Steam Workshop, din care 31.891 marcate pentru 1.6 — consecința directă a faptului că aproape tot conținutul e Def-uri XML (33 de categorii de Def încă din versiunile vechi), nu cod. Pentru un dev solo asta înseamnă o ordine clară: rezervări + regiuni + job system întâi (sunt ieftine și fără ele nimic nu funcționează), sănătatea pe părți de corp și storyteller-ul după, iar relațiile sociale la urmă.

## Constatări (30)

### Grila de priorități 1-4 e o matrice work-type × pion, scanată pe niveluri și, în cadrul unui nivel, de la stânga la dreapta.

- **Detaliu:** Fiecare tip de muncă poate fi 1 (cel mai prioritar) până la 4, sau gol = nu execută deloc. Toată munca disponibilă de prioritate 1 se consumă înaintea celei de prioritate 2 etc. La prioritate egală decide POZIȚIA COLOANEI în tabel (stânga → dreapta), nu distanța sau urgența. Un jucător descrie cazul concret: cu Handle și Tailor ambele pe 2, handling-ul (mai la stânga) întrerupe constant croitoria.
- **Sursă:** https://rimworldwiki.com/wiki/Work + https://steamcommunity.com/app/294100/discussions/0/1744482417438350455/ · încredere: ridicat
- **Implicație:** Ordinea coloanelor E design, nu cosmetică: fixează un `naturalPriority` per work type și expune-l ca ordine implicită de coloane. NU lăsa jucătorul să rearanjeze coloanele în v1 — ar schimba semantica tie-break-ului fără să-și dea seama.

### Pionul re-evaluează întreaga grilă după FIECARE job terminat, nu pe un ciclu fix — de aici senzația de „comută aiurea”.

- **Detaliu:** Bucla reală e: execută task → caută task nou (scanare 1→4, stânga→dreapta) → execută. În plus, job-urile de crafting conțin ferestre interne de re-evaluare, deci un croitor poate pleca la mijlocul lucrării. Jucătorii compensează cu limite pe bill („stop at 20 meals”) și cu specializare, nu cu priorități.
- **Sursă:** https://steamcommunity.com/app/294100/discussions/0/1744482417438350455/ · încredere: ridicat
- **Implicație:** Implementează explicit un `jobEndCheckpoint` per job type: doar acolo pionul re-scanează. Dacă re-scanezi pe fiecare tick obții comutare haotică; dacă nu re-scanezi deloc, urgențele (foc, rănit) nu mai întrerup nimic. Alege: re-scanare la sfârșit de job + o listă scurtă de „emergency work” verificată mai des.

### Prioritatea de bază a muncii nu vine din grilă, ci din timetable-ul pionului — grila doar ordonează în interiorul acelui slot.

- **Detaliu:** În `JobGiver_Work` prioritățile numerice pe stare de timetable sunt: Work 9.0, Anything 5.5, Sleep 3.0, Joy 2.0. Există o listă separată de workGivers `emergency` care se încearcă prima când `emergency == true`, plus un `priorityWork` (prioritizarea manuală dată de jucător cu click dreapta).
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/JobGiver_Work.cs · încredere: ridicat
- **Implicație:** Ai nevoie de TREI straturi, nu de unul: (1) timetable/orar per pion, (2) grila 1-4, (3) override manual punctual. Dacă implementezi doar grila, jucătorul nu are cum să spună „acum dormi” sau „fă tu ăsta, acum”, și va cere ambele în primele 48h de playtest.

### Scanarea de muncă e optimizată prin early-break pe schimbare de tier și prin căutare locală pe regiuni, nu prin scanarea hărții.

- **Detaliu:** Bucla peste workGivers se oprește când întâlnește un workGiver de prioritate mai mică în condițiile în care deja s-a găsit o țintă validă. Căutarea folosește `ClosestThing_Global_Reachable` / `ClosestThing_Global`, filtrare prealabilă prin `PotentialWorkThingRequest`, flag-uri `scanThings`/`scanCells` pentru a sări căutări inutile, și `LocalRegionsToScanFirst` pentru localitate. Distanța maximă de căutare globală e literalul 99999f, iar tie-break-ul la prioritate egală e pe distanță pătratică orizontală.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/JobGiver_Work.cs · încredere: ridicat
- **Implicație:** Nu scrie „caut cel mai apropiat lucru” naiv. Prevede din start: un index spațial pe categorii de Thing (ListerThings echivalent), un predicat de pre-filtrare per workGiver, și căutare mai întâi în regiunile locale. Asta e diferența între 20 și 200 de pioni.

### Grila 1-4 NU ponderează distanța, iar asta e cea mai reclamată patologie a sistemului.

- **Detaliu:** Recomandarea universală a comunității e să NU pui Hauling pe 1, pentru că pionul va căra fiecare obiect, inclusiv unul de la capătul opus al hărții, înaintea oricărei alte munci: „nu au niciun respect pentru eficiență”. Corolar: munci infinite (curățenie, gătit) pot înfometa permanent prioritățile mai mici.
- **Sursă:** https://rimworldwiki.com/wiki/Work + https://steamcommunity.com/app/294100/discussions/0/1744482417438350455/ · încredere: ridicat
- **Implicație:** Adaugă de la început DOUĂ lucruri pe care RimWorld nu le are: (a) un cost de distanță opțional în selecția țintei la prioritate egală (ai deja distanța calculată), (b) un „soft cap” per work type (ex. „curăță maxim X minute apoi re-evaluează”). Sunt ieftine și rezolvă cea mai zgomotoasă plângere din gen.

### Bugetul de gândire al pionului e explicit ticăit: think tree constant la fiecare 30 de tick-uri, cu gardă anti-buclă la 10 job-uri/tick.

- **Detaliu:** `Pawn_JobTracker` folosește `pawn.IsHashIntervalTick(30)` pentru nodurile constante de think tree; `DamageCheckMinInterval = 180` tick-uri limitează re-evaluarea declanșată de daune; `RecentJobQueueMaxLength = 10`. Dacă un pion pornește peste 10 job-uri într-un singur tick, se apelează `JobUtility.TryStartErrorRecoverJob()` și se loghează „started 10 jobs in one tick” cu lista completă de job-uri și jobGiver-ul vinovat.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/Verse.AI/Pawn_JobTracker.cs · încredere: ridicat
- **Implicație:** Copiază garda, nu doar arhitectura. Un contor de job-uri pornite per tick + recovery job + log cu numele jobGiver-ului îți economisește zile de debugging pe bucle A→B→A. E ~20 de linii. Implementeaz-o ÎNAINTE de al doilea job type, nu după al douăzecilea.

### Separarea ThinkTree / JobGiver / Job / JobDriver / Toil e ce face job system-ul moddabil și depanabil.

- **Detaliu:** ThinkTree = ierarhie de `ThinkNode` definită în XML, care produce un `ThinkResult` (Job + nodul care l-a cerut). Job = doar date (JobDef + pawn + ținte). JobDriver, specificat prin `<driverClass>` în JobDef, descompune execuția într-o listă de Toils executate secvențial. Rezervarea se face din driver, cu `Toils_Reserve.Reserve()`.
- **Sursă:** https://github.com/roxxploxx/RimWorldModGuide/wiki/SHORTTUTORIAL:-How-Pawns-Think · încredere: ridicat
- **Implicație:** Adoptă exact separarea asta în TypeScript: `ThinkNode` ca date (JSON/def), `Job` ca POJO serializabil, `JobDriver` ca generator de toils. Faptul că Job e doar date îți dă gratis: save/load, replay, și un debugger „ce face pionul ăsta și cine i-a dat comanda”. Dacă bagi logica direct în pion, pierzi toate trei.

### Coliziunea între pioni se rezolvă cu o tabelă de rezervări, nu cu euristici.

- **Detaliu:** Un `Reservation` are: claimant (Pawn), job (Job), target (LocalTargetInfo), layer (ReservationLayerDef), maxPawns (int), stackCount (int, cu `public const int StackCount_All = -1`). `CanReserve` verifică: claimant valid și spawned pe harta corectă, țintă validă și nedistrusă, stackCount cerut ≤ stack real, absența rezervărilor conflictuale, și relația de facțiune a celorlalți rezervatori. Dacă mai mulți pioni rezervă aceeași țintă, valorile lor `maxPawns` trebuie să coincidă, iar suma stack-urilor rezervate nu poate depăși cantitatea.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/Verse.AI/ReservationManager.cs · încredere: ridicat
- **Implicație:** Implementează rezervările în SPRINTUL 1, nu ca fix ulterior. Cheia e (target, layer) → listă de rezervări. Layer-ele sunt cruciale: același pat poate fi rezervat simultan „pentru dormit” și „pentru operație”. Retrofitarea layer-elor peste un sistem fără ele e rescriere, nu refactor.

### Ciclul de viață al rezervărilor e legat rigid de ciclul job-ului; orice scăpare produce fie deadlock, fie muncă dublată.

- **Detaliu:** Eliberarea se face prin `Release()` (una anume), `ReleaseAllForTarget()` (când un Thing e distrus), `ReleaseClaimedBy()` (claimant+job) și `ReleaseAllClaimedBy()` (pion downed/mort/schimbă job). `ClearQueuedJobs()` golește coada ȘI eliberează rezervările. Eroarea vizibilă în joc — „Could not reserve Thing” — apare când doi pioni vor același target iar unul pierde cursa.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/Verse.AI/ReservationManager.cs + https://steamcommunity.com/app/294100/discussions/0/3140616601487964060/ · încredere: ridicat
- **Implicație:** Leagă eliberarea de un singur punct: `endJob()`. Plus un audit periodic (la fiecare N tick-uri) care caută rezervări orfane (claimant mort/despawned, target distrus) și le curăță cu un warning. Fără auditul ăsta, un save vechi devine progresiv paralizat și nu vei ști de ce.

### Harta e împărțită în regiuni de maxim 12×12 celule, care nu traversează niciodată grila inițială.

- **Detaliu:** La generarea hărții harta se împarte în chunk-uri de 12×12. O regiune trebuie să fie o zonă contiguă și se subdivide altfel, dar în nicio circumstanță nu se extinde peste chunk-ul de 12×12. Clădirile impasabile (naturale și artificiale) nu fac parte din nicio regiune și subdivid regiunile existente. Regiunile fuzionează când e posibil. Există debug option „Draw Regions”.
- **Sursă:** https://rimworldwiki.com/wiki/Rooms (via căutare; pagina blochează fetch direct) + https://github.com/josh-m/RW-Decompile/blob/master/Verse/RegionGrid.cs · încredere: mediu
- **Implicație:** Alege și tu o dimensiune fixă de chunk (12 sau 16) și impune invariantul „o regiune nu traversează un chunk”. Beneficiul real nu e pathfinding-ul, ci RECONSTRUCȚIA: când se ridică un zid, invalidezi 1-4 chunk-uri, nu harta. Și fă debug overlay-ul de regiuni în aceeași zi în care faci regiunile — altfel depanezi orb.

### Regiunile și camerele se reconstruiesc incremental prin dirty-tracking, nu la fiecare schimbare a hărții.

- **Detaliu:** `RegionAndRoomUpdater.TryRebuildDirtyRegionsAndRooms()` iese imediat dacă `!map.regionDirtyer.AnyDirty`. Pipeline-ul e: `RegenerateNewRegionsFromDirtyCells()` → `CombineNewRegionsIntoContiguousGroups()` → creare/reutilizare Room → `CombineNewAndReusedRoomsIntoContiguousGroups()` → creare/reutilizare RoomGroup. `RebuildAllRegionsAndRooms()` face `SetAllDirty()` și resetează cache-ul de temperatură. Există gardă `if (this.working || !this.Enabled)` contra reintrării.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/Verse/RegionAndRoomUpdater.cs · încredere: ridicat
- **Implicație:** Trei niveluri, nu unul: Region (pathing) → Room (închidere/temperatură/statistici) → RoomGroup (volume conectate prin uși). Camerele îți dau GRATIS: temperatură, „e închis?”, frumusețe, curățenie, rol de cameră (dormitor/sală de mese). Dacă le faci ca sisteme separate mai târziu, le faci de trei ori.

### Reachability se testează la nivel de regiune/cameră, nu de celulă — și asta produce un bug perceput ca „pion prost”.

- **Detaliu:** Jucătorii raportează că pionii pornesc spre job-uri pe care nu le pot atinge, pentru că decizia de reachability nu inspectează celule, ci camere. Problema de bază pe care sistemul o rezolvă: A* pur, când NU există drum, scanează pătrat după pătrat până acoperă toată harta — de aceea fiecare pătrat traversabil poartă un index de zonă.
- **Sursă:** https://ludeon.com/blog/2013/07/reachability-at-last/ (via căutare; ludeon.com blochează fetch direct) + https://steamcommunity.com/app/294100/discussions/0/359543951703193966/ · încredere: mediu
- **Implicație:** Ține DOUĂ structuri: regiuni (pentru cost) și un index de componentă conexă per (regiune, modul de traversare) pentru răspunsul binary „e accesibil?”. Testul de reachability trebuie să fie O(1) lookup, nu un A* eșuat. Și acceptă conștient falsurile pozitive la granularitate de regiune — sau plătește un test de celulă la ultimul pas.

### Nevoile sunt rezervoare cu rate explicite per oră de joc, nu variabile ad-hoc — și fiecare are un mecanism distinct de reumplere.

- **Detaliu:** Nevoile de bază: Food, Rest, Recreation (Joy), Comfort, Beauty, Indoors/Outdoors, plus Mood ca nevoie compusă. Comfort scade lent (~5%/oră) dar crește cu 3.6% la fiecare 150 tick-uri (2,5 s) = 60%/oră pe mobilier confortabil. Indoors scade cu −0.125% / 150 tick-uri = −2.08%/oră când pionul nu e sub munte și nivelul e ≥50%. Food/Rest/Recreation scad continuu spre zero „ca niște indicatoare de combustibil”, iar Beauty se poate satisface doar cât pionul e treaz.
- **Sursă:** https://rimworldwiki.com/wiki/Needs, /Comfort, /Indoors_(need), /Rest, /Recreation (via căutare) · încredere: mediu
- **Implicație:** Modelează nevoile ca `{ current, fallPerDay, riseRate, satisfiedBy }` într-un def, nu ca cod. Regula utilă extrasă: nevoile PASIVE (comfort, beauty, indoors) se satisfac din mediu, deci nu generează job-uri; nevoile ACTIVE (food, rest, joy) generează job-uri. Doar ultimele intră în ThinkTree. Amestecarea lor e cea mai frecventă greșeală de arhitectură.

### Moodul nu sare la valoarea calculată: există mood target și bara reală urcă/coboară cu rate ASIMETRICE.

- **Detaliu:** Mood target = mood de bază + toate thoughts pozitive − toate cele negative. Bara reală se apropie de target cu +12 pe oră de joc la urcare și −8 pe oră la coborâre. Moodul de bază variază cu dificultatea, aproximativ 27–42 (dificultăți mai mari = bază mai mică). Break-urile se declanșează pe bara reală, nu pe target.
- **Sursă:** https://eatcreatesleep.net/how-the-rimworld-mood-system-really-works-mood-vs-mood-target/ · încredere: mediu
- **Implicație:** Copiază lag-ul: e mecanica care transformă mood-ul dintr-un semaforizator binar într-un sistem cu TIMP DE REACȚIE pentru jucător. Fără el, un eveniment negativ = break instantaneu = jucătorul se simte pedepsit fără agenție. Coborârea mai lentă decât urcarea (−8 vs +12) e ce face salvarea posibilă. Sursa e terță, nu cod — verifică valorile exacte înainte să le hardcodezi.

### Pragurile de mental break sunt derivate matematic dintr-un singur stat, nu setate independent.

- **Detaliu:** Pentru un colonist normal: 35% risc minor, 20% risc major, 5% risc extrem. Pragul Major e ÎNTOTDEAUNA 4/7 din statul „Mental Break Threshold” al pionului, iar Extreme e ÎNTOTDEAUNA 1/7. Pragul minor e plafonat între 1% și 50%. Sub pragul major, break major cu timp mediu de 3 zile; sub pragul extrem (mood ~5%, „About to break”), break extrem cu timp mediu de 0.7 zile. Trăsături precum Steadfast / Nervous mută direct statul.
- **Sursă:** https://rimworldwiki.com/wiki/Mental_break + https://rimworldwiki.com/wiki/Mental_Break_Threshold (via căutare) · încredere: ridicat
- **Implicație:** Un singur stat per pion (`mentalBreakThreshold`), restul derivate cu rapoarte fixe. Trăsăturile modifică statul, nu pragurile. Asta face balansarea o singură cifră. Și folosește MTB (mean-time-between) pentru declanșare, nu „sub prag ⇒ break instant” — dă jucătorului fereastră de intervenție și evită sincronizarea break-urilor la toți pionii deodată.

### Sănătatea e compozițională: fiecare parte de corp are HP, iar daunele reduc eficiența PROPORȚIONAL, nu în trepte.

- **Detaliu:** Fiecare parte are o valoare de sănătate; la 0 partea e distrusă. Orice daună scade eficiența proporțional cu sănătatea rămasă — un braț la 15/30 HP funcționează cu 50% mai prost. Toate rănile cu excepția fracturilor, vânătăilor și arsurilor produce sângerare, indicată vizual printr-o picătură a cărei mărime dă severitatea.
- **Sursă:** https://rimworldwiki.com/wiki/Health + https://rimworldwiki.com/wiki/Injury (via căutare) · încredere: ridicat
- **Implicație:** Nu face „HP global al pionului”. Fă `bodyPart[] → hp` și derivă totul din el. Costul suplimentar față de un HP global e mic (un array + o funcție de agregare), iar câștigul narativ e disproporționat: „Mara a rămas fără mâna stângă” e o poveste, „Mara are 40 HP” nu e.

### Capacitățile (Moving, Manipulation, Consciousness, Sight...) se CALCULEAZĂ din părți, iar protezele scurtcircuitează calculul.

- **Detaliu:** `PawnCapacityUtility.CalculateTagEfficiency` însumează eficiențele părților cu un tag și face media, cu opțiune de ponderare a celei mai bune părți (`bestPartEfficiencySpecialWeight`), clamp la un maxim și transformare prin `FloatRange.LerpThroughRange()`. `CalculateLimbEfficiency` înmulțește ierarhic: parte core × segmente conectate × media degetelor ponderată cu `appendageWeight`. Dacă părintele unei părți lipsește, eficiența e 0. Eficiența de bază pornește de la 1, se înmulțește cu `partEfficiency` al părților adăugate, iar sănătatea o reduce prin `Mathf.InverseLerp(0.1f, 1f, partHealth/maxHealth)`. O proteză adăugată direct pe un strămoș returnează imediat `partEfficiency`, ocolind calculul natural.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/Verse/PawnCapacityUtility.cs · încredere: ridicat
- **Implicație:** Aici e tot jocul de body-modding, gratis: dacă proteza returnează `partEfficiency` direct, o proteză cu 1.25 face pionul MAI BUN decât natural. Asta e motorul întregii economii de bionică, fără nicio mecanică dedicată. Definește de la început contractul: `partEfficiency` e un multiplicator, nu un plafon.

### Durerea, sângerarea și părțile lipsă sunt derivate cache-uite din setul de hediff-uri, nu stări separate.

- **Detaliu:** `HediffSet.PainTotal` = suma `PainOffset` de la toate hediff-urile / `pawn.HealthScale`, apoi înmulțită cu `PainFactor` al fiecărui hediff, clamped [0,1]. `BleedRateTotal` = suma `BleedRate` / HealthScale, 0 pentru non-flesh sau mort. Ambele folosesc cache cu sentinel −1f. `GetPartHealth()` pornește de la maxHealth și scade severitatea fiecărui `Hediff_Injury`; returnează 0 dacă există `Hediff_MissingPart`. Când o parte ajunge la 0 HP, se creează automat un `Hediff_MissingPart`. `GetMissingPartsCommonAncestors()` face traversare breadth-first din partea core: dacă părintele lipsește, copiii lipsesc implicit, fără hediff propriu.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/Verse/HediffSet.cs · încredere: ridicat
- **Implicație:** UN singur tip de container (`Hediff`) cu câmpuri opționale (painOffset, bleedRate, severity, part) acoperă: răni, boli, infecții, dependențe, proteze, cicatrici, sarcină. Nu face sisteme separate pentru boală și rană. Și cache-uiește PainTotal/BleedRateTotal cu invalidare la adăugare/eliminare — altfel le recalculezi de zeci de ori pe tick.

### Infecția e un timer randomizat per rană, iar protezele sunt imune — ceea ce creează o decizie economică reală.

- **Detaliu:** După ce un pion primește răni, jocul pornește un timer aleator între 15.000 tick-uri (4,17 min reale) și 45.000 tick-uri (12,5 min reale) PER RANĂ, înainte de a verifica infecția. Șansa depinde de tipul de daună, care influențează și durerea și rata de sângerare. Părțile de corp înlocuite nu se pot infecta; rănile pe părți artificiale nu sângerează, nu lasă cicatrici și nu produc durere. Afecțiuni precum cataracta, spatele stricat sau atacul de cord sunt vindecate și prevenite instant de partea corespunzătoare.
- **Sursă:** https://rimworldwiki.com/wiki/Injury + https://rimworldwiki.com/wiki/Artificial_body_parts (via căutare) · încredere: ridicat
- **Implicație:** Infecția ca „cursă între severitate și imunitate” e ce transformă medicina din buton în decizie. Costă puțin: două curbe care cresc în timp și o comparație. Implementeaz-o ÎNAINTE de chirurgie complexă — e 80% din tensiunea narativă la 20% din efort.

### Storyteller-ul convertește averea coloniei în threat points prin curbe explicite, cu plafoane dure.

- **Detaliu:** Constante: `GlobalPointsMin = 35f`, `GlobalPointsMax = 20000f`, `BuildingWealthFactor = 0.5f`. `PointsPerWealthCurve`: (0,0) → (14.000, 0) → (400.000, 2.400) → (700.000, 3.600) → (1.000.000, 4.200). `PointsPerColonistByWealthCurve`: (0,15) → (10.000,15) → (400.000,140) → (1.000.000,200). Animalele de luptă: 0.08 × combatPower, ×0.7 în caravană. Pionii în cryptosleep: ×0.3. Factor de sănătate: `Lerp(n, n×healthPercent, 0.65)`. Rezultatul se înmulțește cu random factor, adaptation factor (`Lerp(1, totalThreatPointsFactor, adaptationEffectFactor)`), `difficulty.threatScale` și `pointsFactorFromDaysPassed`, apoi `Mathf.Clamp(x, 35f, 20000f)`.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/StorytellerUtility.cs · încredere: ridicat
- **Implicație:** Forma curbei e lecția, nu cifrele: PLAT până la un prag (14k) ca începutul să fie sigur, apoi liniar, apoi saturat la capăt ca late-game-ul să nu explodeze. Copiază forma, recalibrează cifrele pentru economia ta. Și `BuildingWealthFactor = 0.5` e admiterea că altfel jucătorii nu mai construiesc nimic frumos.

### CONTRADICȚIE DE SURSE pe plafonul de threat points: wiki spune 10.000, codul decompilat spune 20.000.

- **Detaliu:** Wiki-ul RimWorld afirmă că valoarea minimă de Raid Points e 35 și maximul 10.000, și că wealth-ul maxim luat în calcul e 1.000.000. Codul decompilat din `StorytellerUtility` (versiune mai veche, repo josh-m/RW-Decompile) arată `GlobalPointsMax = 20000f` și `Mathf.Clamp(num4, 35f, 20000f)`. Minimul 35 coincide în ambele. Cel mai probabil plafonul a fost schimbat între versiuni, dar NU am confirmat asta dintr-un changelog.
- **Sursă:** https://rimworldwiki.com/wiki/Raid_points (via căutare) vs https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/StorytellerUtility.cs · încredere: scazut
- **Implicație:** Nu importa cifre din decompilări vechi ca și cum ar fi actuale. Pentru planul de producție contează doar că EXISTĂ un clamp dur sus și jos; alege-ți propriile valori. Marchează în doc că orice număr luat din RW-Decompile e „ordin de mărime”, nu „valoare curentă”.

### Diferența dintre storytellers e ritmul (on/off cycles), nu formula de scalare.

- **Detaliu:** Cassandra Classic: „on-days” 4,6 zile (poate trimite 1-2 raiduri), „off-days” 6 zile fără raiduri, cooldown 1,9 zile între incidente, primul raid în ziua 5, ~8,5 raiduri/an. Phoebe Chillax: 8 zile off / 8 zile on, maxim 1 raid pe ciclu, eveniment aleator la ~4,8 zile. Randy Random: un eveniment (raid sau altceva) la ~1,35 zile, raid garantat în maxim 13 zile, și multiplică punctele fiecărui eveniment aleator cu 0,5–1,5. Cassandra și Phoebe NU modifică suplimentar calculul de bază al punctelor.
- **Sursă:** https://en.number13.de/rimworld-storyteller/ + https://rimworldwiki.com/wiki/AI_Storytellers (via căutare) · încredere: mediu
- **Implicație:** Un singur calculator de dificultate + un `PacerDef` cu 4-5 câmpuri (onDays, offDays, minDaysBetweenBig, cooldown, randomFactorRange) îți dă toate „personalitățile”. Nu scrie trei storytellers; scrie unul parametrizat și trei fișiere de config. E cel mai bun raport replayability/efort din tot genul.

### Scalarea pe avere e o buclă de feedback negativ care modelează comportamentul jucătorului în moduri neintenționate.

- **Detaliu:** Sub ~14.000 wealth impactul e practic nul; peste 400.000 impactul e redus prin saturarea curbei. Fiecare colonist „complet” valorează 15 puncte până la 10.000 wealth și până la 140 la 400.000 — deci și OAMENII scalează amenințarea, nu doar obiectele. Comunitatea are un termen consacrat pentru contra-joc: „wealth management”.
- **Sursă:** https://rimworldwiki.com/wiki/Wealth_management + https://rimworldwiki.com/wiki/Raid_points (via căutare) · încredere: ridicat
- **Implicație:** Dacă scalezi pe avere, jucătorii optimi vor juca SĂRAC și urât — exact opusul unui base-builder. Contramăsuri concrete de luat în v1: pondere redusă pentru decor/mobilier (ca `BuildingWealthFactor = 0.5`), un al doilea driver de dificultate independent de avere (zile trecute, tehnologie cercetată, teritoriu controlat), și fereastra plată la început.

### Relațiile sociale se construiesc pe o singură axă numerică — opinion — pe care o mișcă trăsăturile și evenimentele.

- **Detaliu:** Opiniile sunt afectate de frumusețea pionului, trăsături, interacțiuni sociale aleatorii și acțiuni ale jucătorului; fiecare punct de beauty valorează +20 opinion din partea celorlalți. Trăsăturile Abrasive și Kind sunt la capete opuse: Abrasive generează mai multe interacțiuni negative. O abilitate Social mare AMPLIFICĂ impactul interacțiunilor, deci un „jerk” cu Social mare produce mai multe bătăi sociale. Există praguri: un minim de opinion pentru romantism, moodlet permanent pentru iubiți, despărțiri la opinion scăzut, cereri în căsătorie la opinion mare.
- **Sursă:** https://rimworldwiki.com/wiki/Social + https://rimworldwiki.com/wiki/Traits (via căutare) · încredere: mediu
- **Implicație:** O matrice N×N de opinion (cu N ≤ 30 e trivial) + un set de interacțiuni cu delta + praguri pentru schimbări de STARE (prieten/rival/iubit/soț). Nu ai nevoie de nimic mai sofisticat pentru poveste emergentă. Cheia e ca abilitatea Social să fie MULTIPLICATOR, nu doar sursă: asta face ca un pion cu Social mare și trăsătură proastă să fie o bombă cu ceas — narativ, nu mecanic.

### Ecosistemul de modding e măsurabil imens și e consecința directă a arhitecturii data-driven.

- **Detaliu:** Pe Steam Workshop la data verificării: 38.836 Mod, 13.388 Translation, 7.644 Scenario. Pe versiuni: 1.6 → 31.891, 1.5 → 23.975, 1.4 → 21.159, 1.3 → 16.131, 1.2 → 11.256, 1.1 → 8.775, 1.0 → 7.814, 0.18 → 1.560. Creșterea e continuă pe fiecare versiune majoră.
- **Sursă:** https://steamcommunity.com/app/294100/workshop/ (verificat live) · încredere: ridicat
- **Implicație:** 31.891 de mod-uri actualizate pentru versiunea curentă înseamnă că ecosistemul MIGREAZĂ, nu doar acumulează — semn că API-ul e stabil între versiuni. Dacă vrei modding, contractul de compatibilitate între versiuni e mai important decât bogăția API-ului.

### Aproape tot conținutul RimWorld e definit ca Def-uri XML, nu ca cod — asta e decizia arhitecturală care a produs ecosistemul.

- **Detaliu:** Chiar și în versiuni vechi existau cel puțin 33 de categorii de Def: BiomeDefs, DesignationCategoryDefs, DesignationDefs, DifficultyDefs, HairDefs, HediffDefs, JobDefs, JoyGiverDefs, JoyKindDefs, KeyBindingDefs, LifeStageDefs, MainTabDefs, MapConditionDefs, NeedDefs, PawnCapacityDefs, RecipeDefs, ResearchProjectDefs, RoofDefs, RoomRoleDefs, RoomStatDefs, SkillDefs, SongDefs, StuffCategoryDefs, TerrainDefs, ThingCategoryDefs, ThoughtDefs, TimeAssignmentDefs, TrainableDefs, TraitDefs, WeatherDefs, WorkGiverDefs, WorkTypeDefs ș.a. Def-urile sunt „rețete, NU felul de mâncare”: ThingDef → Thing, ResearchProjectDef → ResearchProject. Modificarea fără cod se face prin XML patching; schimbările de comportament necesită Harmony.
- **Sursă:** https://github.com/RimWorldMod/RimworldModdingFiles/tree/master/Defs + https://rimworldmodding.wiki.gg/wiki/Basic_Concepts · încredere: ridicat
- **Implicație:** Observă că `KeyBindingDefs`, `MainTabDefs` și `DifficultyDefs` sunt Def-uri: chiar și UI-ul și dificultatea sunt date. Pentru tine, în TypeScript, asta e MAI ieftin decât în C#: JSON/Zod + un registry cu rezolvare de defName. Regula de producție: dacă un număr apare în cod, e un bug de arhitectură. Aplic-o de la primul commit — conversia ulterioară e o rescriere.

### Harmony rezolvă problema pe care XML-ul n-o poate: modificarea comportamentului fără atingerea sursei — cu costul „assembly hell”.

- **Detaliu:** Harmony permite injectarea de cod în diferite puncte ale codului jocului sau sărirea completă a unor mecanici, înlocuind injecția directă de C# și reducând conflictele între mod-uri. Problema apărută: autorii includeau DLL-ul Harmony în propriul folder de mod, ceea ce ducea la „assembly hell” cu versiuni conflictuale la runtime; soluția a fost un mod separat care instalează Harmony pentru toate celelalte.
- **Sursă:** https://github.com/pardeike/HarmonyRimWorld + https://deepwiki.com/pardeike/HarmonyRimWorld · încredere: ridicat
- **Implicație:** În TypeScript/JS ai echivalentul gratuit și mai sigur: un event bus cu hook-uri numite + un registry de „behavior overrides” per def. Definește PUNCTELE DE EXTENSIE explicit (onJobSelected, onDamageApplied, onIncidentChosen, onNeedTick) în loc să lași mod-urile să monkey-patch-uiască. Și livrează dependențele comune ca o singură bibliotecă versionată — lecția „assembly hell” se traduce direct.

### Performanța e limita reală a genului, iar bottleneck-urile sunt exact sistemele discutate mai sus.

- **Detaliu:** Mod-ul RimThreaded, care paralelizează jocul, raportează în changelog un caz de salvări cu 700+ pioni care au trecut de la 1-2 TPS la 20-40 TPS. Sistemele pe care le patch-uiește sunt enumerate explicit: pathfinding și rezervări, hediff/health tracking, thoughts și memorii, hauling și prioritizare de job-uri, calcule de regiuni și acoperișuri, atlas de texturi pentru pioni. Mod-urile de performanță notează că patch-urile „devin mai impactante pe măsură ce jocul avansează în late-game”.
- **Sursă:** https://raw.githubusercontent.com/cseelhoff/RimThreaded/master/README.md + https://raw.githubusercontent.com/bbradson/Performance-Fish/main/README.md · încredere: mediu
- **Implicație:** Lista de bottleneck-uri e identică cu lista sistemelor pe care trebuie să le construiești. Consecință directă: instrumentează de la început (timp per sistem per tick, afișat în debug overlay) și stabilește un buget de tick explicit. Ex: la 50 de pioni, 16,6 ms/tick împărțit ca 30% job selection, 25% pathing, 20% needs/health, 25% render. Fără buget măsurat, „optimizez mai târziu” înseamnă rescriere.

### Poziția de piață: RimWorld e la 97% pozitiv din 119.310 recenzii; Going Medieval a ieșit din Early Access, Sapiens pare stagnant.

- **Detaliu:** RimWorld (Ludeon Studios, 17 oct 2018): 97% pozitiv din 119.310 recenzii, 96% recent din 1.469. Going Medieval: Early Access din 1 iunie 2021, lansare completă 17 martie 2026, 88% pozitiv din 8.668 recenzii, dar doar 78% în ultimele 30 de zile (119 recenzii). Sapiens (Majic Jungle): Early Access din 26 iulie 2022, 79% din 1.385 recenzii, dar 25% pozitiv recent din 28 de recenzii, cu ultimul update de dezvoltator de peste 12 luni.
- **Sursă:** https://store.steampowered.com/app/294100/RimWorld/ + https://store.steampowered.com/app/1029780/Going_Medieval/ + https://store.steampowered.com/app/1060230/Sapiens/ · încredere: ridicat
- **Implicație:** Semnalul Sapiens (25% pozitiv recent, update-uri oprite) e avertismentul pentru un dev solo: un colony sim ambițios la scară planetară, cu multiplayer și modding Lua promise, a rămas fără combustibil. Redu scope-ul geografic drastic — hartă locală, nu planetă — și livrează bucla completă înainte de orice sistem „mare”.

### Going Medieval își construiește diferențierea pe verticalitate 3D, ceea ce multiplică costul fiecărui sistem spațial pe care l-am descris.

- **Detaliu:** Descrierea de magazin insistă pe „3D terrain tools” pentru forturi cu mai multe etaje și peșteri subterane, hărți generate procedural pe mai multe niveluri, plus posibilitatea de a construi în sus sau de a săpa în jos. Colonistul e descris prin trăsături, abilități, personalitate și nevoi concrete („îi plac hainele frumoase, religia îi e importantă, și e flămând”).
- **Sursă:** https://store.steampowered.com/app/1029780/Going_Medieval/ · încredere: ridicat
- **Implicație:** Verticalitatea nu e „încă un feature”: regiunile devin 3D (chunk-uri 12×12×1 cu legături verticale), reachability trebuie să modeleze scări/rampe, temperatura și acoperișul devin per-nivel, iar UI-ul are nevoie de navigare între etaje. Decizie: dacă alegi verticalitatea, ea trebuie să fie în fundație din ziua 1 — sau nu o alegi deloc. Nu e retrofitabilă peste un sistem de regiuni 2D.

## Implicații de design

- CELE 5 SISTEME FĂRĂ DE CARE UN COLONY SIM E PERCEPUT CA „INCOMPLET” (în ordinea în care jucătorii le observă lipsa): 1) Grila de priorități de muncă cu control fin per pion; 2) Nevoi + mood + mental breaks cu praguri vizibile; 3) Sănătate pe părți de corp cu răni localizate și consecințe permanente; 4) Un pacer de evenimente cu personalități (storyteller) și scalare de dificultate; 5) Relații sociale cu opinie și povești emergente.
- COST RELATIV AL CELOR 5, pentru un dev solo (estimarea mea, nu sursă): Grila de priorități = IEFTIN dacă job system-ul e corect de la început (UI-ul e o tabelă; scump e JobGiver-ul de dedesubt, ~3-4 săptămâni cu rezervări și indexare spațială). Nevoi + mood = IEFTIN (~1-2 săptămâni): sunt rezervoare cu rate și o sumă cu lag; e cel mai bun raport valoare/efort din listă. Sănătate pe părți de corp = MEDIU (~2-3 săptămâni) pentru model (părți, hediff-uri, capacități derivate), dar SCUMP la conținut (fiecare parte, proteză, boală e un def + text + UI) și la UI-ul de Health tab. Storyteller = IEFTIN ca motor (~1 săptămână: curbă de puncte + pacer parametrizat), SCUMP ca CONȚINUT — valoarea lui e proporțională cu numărul de incidente distincte, iar fiecare incident e gameplay nou. Relații sociale = MEDIU ca mecanică (matrice de opinie + interacțiuni), dar SCUMP ca text și prezentare; e singurul din cele 5 care poate fi amânat fără ca jocul să pară rupt.
- CONCLUZIA DE PRIORITIZARE: cel mai scump lucru din listă nu e niciunul dintre cele 5 — e FUNDAȚIA comună (regiuni, reachability, rezervări, indexare spațială, ticking bugetat). Toate cele 5 stau pe ea. Construiește fundația întâi, apoi 2 (nevoi/mood), apoi 1 (grila), apoi 4 (storyteller), apoi 3 (sănătate), apoi 5 (social).
- ARHITECTURĂ: adoptă separarea ThinkTree (date) / JobGiver (nod) / Job (POJO serializabil) / JobDriver (generator de toils). Job ca date pură îți dă gratis save/load, replay determinist și un debugger „cine i-a dat comanda asta pionului”. În TypeScript e mai ieftin decât în C#.
- REZERVĂRI: tabelă (target, layer) → Reservation[] cu câmpurile claimant, job, target, layer, maxPawns, stackCount, plus StackCount_All = -1. Layer-ele sunt obligatorii din v1 — retrofitarea lor e rescriere. Eliberarea se face într-un singur punct (endJob) + un audit periodic de rezervări orfane.
- REGIUNI: chunk-uri fixe (12 sau 16), invariantul „o regiune nu traversează un chunk”, dirty-tracking pe celule, pipeline Region → Room → RoomGroup. Camerele îți dau gratis temperatura, închiderea, frumusețea, curățenia și rolul de cameră — nu le construi ca sisteme separate.
- REACHABILITY: index de componentă conexă per (regiune, mod de traversare) cu lookup O(1), separat de calculul de cost. Un A* care eșuează e cel mai scump lucru din joc. Acceptă conștient falsurile pozitive la granularitate de regiune și documentează-le ca decizie.
- MOOD: mood target (bază + thoughts) separat de bara reală, cu rate asimetrice de apropiere (ex. +12/-8 pe oră de joc). Lag-ul e mecanica, nu un artefact — el dă jucătorului agenție între „veste proastă” și „break”.
- MENTAL BREAK: un singur stat per pion, pragurile Major și Extreme derivate cu rapoarte fixe (4/7 și 1/7), declanșare pe mean-time-between, nu pe „sub prag ⇒ break instant”. Trăsăturile mută statul, nu pragurile.
- SĂNĂTATE: un singur container `Hediff` cu câmpuri opționale (severity, painOffset, bleedRate, part, partEfficiency) acoperă răni, boli, infecții, proteze și cicatrici. Capacitățile se derivă din eficiența părților; proteza scurtcircuitează calculul returnând partEfficiency — de aici iese toată economia de bionică fără mecanică dedicată.
- INFECȚIE: cursa severitate vs imunitate, cu timer randomizat la apariție. E 80% din tensiunea medicală la 20% din efortul unui sistem de chirurgie complet. Implementeaz-o înaintea chirurgiei.
- STORYTELLER: UN calculator de dificultate + un PacerDef parametrizat (onDays, offDays, minDaysBetweenBig, cooldown, randomFactorRange). Trei „personalități” = trei fișiere de config, nu trei sisteme. Cel mai bun raport replayability/efort din tot genul.
- SCALARE DE DIFICULTATE: copiază FORMA curbei (plată până la un prag, liniară, saturată sus), nu cifrele. Adaugă un al doilea driver independent de avere (zile trecute / tehnologie / teritoriu), altfel jucătorii optimi vor juca sărac și urât — exact opusul unui base-builder.
- DATA-DRIVEN: dacă un număr de gameplay apare în cod, e bug de arhitectură. Def-uri în JSON validate cu Zod, registry cu rezolvare de defName, patch-uri declarative. Include în Def-uri și lucrurile neevidente: dificultăți, taburi de UI, keybinding-uri — RimWorld le are pe toate ca date.
- EXTENSIBILITATE: definește explicit punctele de extensie (onJobSelected, onDamageApplied, onIncidentChosen, onNeedTick, onOpinionChanged) în loc să lași mod-urile să monkey-patch-uiască. Livrează dependențele comune ca o bibliotecă versionată — lecția „assembly hell” din Harmony se traduce direct în JS.
- VERTICALITATE (dacă imiți Going Medieval): e decizie de fundație, nu feature. Regiunile devin 3D, reachability trebuie să modeleze scări, temperatura și acoperișul devin per-nivel, UI-ul are nevoie de navigare între etaje. Din ziua 1 sau deloc.
- ÎMBUNĂTĂȚIRI PESTE RIMWORLD care sunt ieftine și rezolvă plângeri reale: ponderare pe distanță la tie-break de prioritate egală (ai deja distanța calculată), soft-cap de timp per work type pentru muncile infinite (curățenie, hauling), și un log vizibil „de ce face pionul asta” cu numele jobGiver-ului.

## Riscuri

- Retrofitarea rezervărilor. Dacă pornești fără ReservationManager, doi pioni vor lucra pe același obiect și vei „repara” cu flag-uri ad-hoc pe entități. Semnalul de alarmă: prima dată când adaugi un câmp `isBeingWorkedOn: boolean` pe un obiect. Oprește-te acolo și construiește tabela de rezervări cu layer-e.
- Retrofitarea layer-elor de rezervare. Chiar dacă faci rezervări de la început, fără `layer` vei descoperi că același pat nu poate fi simultan rezervat pentru dormit și pentru operație. Semnalul: primul caz în care trebuie să „excepționezi” o rezervare. Costul retrofitării e o rescriere a tuturor JobDriver-elor.
- Pathfinding fără regiuni. Un A* pur pe o hartă cu 200×200 celule și 30 de pioni pare rapid în prototip și moare când jucătorul închide o ușă și 15 pioni caută simultan un drum inexistent. Semnalul de alarmă: FPS-ul scade brusc când construiești un zid, nu când adaugi pioni.
- Buclele de job A→B→A. Fără garda „N job-uri într-un tick” + recovery job + log cu numele jobGiver-ului, vei pierde zile pe un pion care vibrează între două acțiuni. Semnalul: un pion care nu se mișcă dar nici nu e idle.
- Explozia de conținut a storyteller-ului. Motorul e ieftin, dar valoarea lui e proporțională cu numărul de incidente distincte. Semnalul de alarmă: după 3 ore de playtest, testerii pot enumera toate evenimentele. Bugetează conținutul de incidente ca linie separată în plan, nu ca „mai adaug eu”.
- Wealth scaling care descurajează construirea. Dacă mobilierul frumos crește amenințarea proporțional, jucătorii optimi vor juca în cutii de piatră. Semnalul: guide-urile comunității încep să recomande „nu construi X”. Contramăsură preventivă: pondere redusă pentru decor + un driver de dificultate independent de avere.
- Pierderea de cifre din decompilări vechi. Repo-ul RW-Decompile e dintr-o versiune veche (max threat points 20.000 acolo vs 10.000 pe wiki). Semnalul: orice cifră care „sună prea precisă” copiată direct. Tratează toate valorile din decompilare ca ordin de mărime.
- Scope-ul de tip Sapiens. Sapiens a promis planetă procedurală, multiplayer, VR, modding Lua, progresie până în medieval — și are 25% recenzii pozitive recent, cu ultimul update de peste un an. Semnalul de alarmă pentru tine: orice feature care are nevoie de altă infrastructură ca să funcționeze (multiplayer, hartă planetară). Livrează bucla locală completă întâi.
- Verticalitatea adăugată târziu. Dacă hotărăști la jumătatea proiectului că vrei etaje, rescrii regiunile, reachability-ul, temperatura, acoperișurile și UI-ul. Semnalul: primul playtester care întreabă „pot să sap în jos?” — răspunde-ți la întrebarea asta ÎNAINTE de primul commit pe sistemul de regiuni.
- Adminul vizual al simulării ca punct orb. Sistemele astea (regiuni, rezervări, job selection) sunt invizibile: typecheck verde, teste verzi, joc rupt. Semnalul: nu ai un debug overlay pentru regiuni/rezervări/job curent. Construiește overlay-urile în aceeași zi cu sistemele, nu după.
- Bugetul de tick nemăsurat. „Optimizez mai târziu” în colony sim înseamnă rescriere, pentru că bottleneck-urile sunt structurale (indexare spațială, cache-uri de derivate), nu micro. Semnalul: nu poți spune acum câte ms consumă job selection la 30 de pioni.
- Arta ca blocant pentru un dev solo fără echipă de artă. Genul e tolerant la grafică simplă (RimWorld e 2D top-down cu pioni desenați minimal), dar NU e tolerant la UI prost — tabelele de priorități, Health tab, lista de nevoi sunt dense informațional. Semnalul: petreci mai mult timp pe sprite-uri decât pe tabele. Inversează raportul.

## Întrebări deschise

- Care e plafonul actual de threat points în RimWorld — 10.000 (wiki) sau 20.000 (cod decompilat vechi)? Nu am confirmat dintr-un changelog. Contează doar ca lecție de metodă: nu importa cifre din decompilări ca fiind curente.
- Cifrele exacte de drift al moodului (+12/-8 pe oră de joc) și moodul de bază pe dificultate (27-42) vin dintr-o singură sursă terță, nu din cod. De verificat în cod sau prin măsurare în joc înainte de a le folosi ca punct de plecare pentru calibrare.
- Nu am putut măsura limita de pioni în RimWorld VANILLA (fără mod-uri). Singura cifră găsită e din changelog-ul RimThreaded: 700+ pioni de la 1-2 TPS la 20-40 TPS cu paralelizare. Nu știu la ce număr de pioni vanilla scade sub 60 TPS pe hardware modern.
- Ritmurile de storyteller (Cassandra 4,6 on / 6 off, Phoebe 8/8, Randy la 1,35 zile) vin dintr-o sursă terță de analiză, nu din StorytellerDef. Formele sunt clar corecte; valorile ar trebui confirmate din Def-urile curente.
- Nu am verificat cum funcționează exact `adaptationEffectFactor` și `totalThreatPointsFactor` (mecanica de „adaptare” după pierderi). E sistemul care face storyteller-ul să ierte după un dezastru, și merită o cercetare separată — e exact mecanica anti-frustrare care lipsește din majoritatea clonelor.
- Nu am cercetat cum tratează Going Medieval regiunile și reachability-ul pe mai multe niveluri. Dacă alegi verticalitatea, ăsta e următorul subiect de research și e blocant pentru arhitectura fundației.
- Nu am date despre CE anume reclamă concret jucătorii la Going Medieval (78% pozitiv recent vs 88% overall) — ar fi cea mai utilă sursă despre unde un colony sim modern dezamăgește față de standardul RimWorld.
- Bugetul de căutare web al sesiunii s-a epuizat (200/200) înainte de a acoperi: numărul exact de trăsături și skill-uri din RimWorld, lista completă de nevoi cu fallPerDay, și plângerile de performanță de pe subreddit. Toate trei sunt utile pentru calibrare și merită o sesiune separată de research.

## Recomandări

- 1. Construiește fundația spațială înaintea oricărui gameplay: chunk-uri fixe → regiuni → camere → grupuri de camere, cu dirty-tracking și debug overlay. Toate cele 5 sisteme „obligatorii” stau pe ea, iar retrofitarea ei costă mai mult decât toate la un loc.
- 2. În același sprint cu primul job type, livrează ReservationManager complet (claimant, job, target, layer, maxPawns, stackCount) plus garda anti-buclă „N job-uri într-un tick” cu log care numește jobGiver-ul. Sunt puține linii și te scutesc de clasa de bug-uri cel mai greu de diagnosticat.
- 3. Implementează separarea ThinkTree / JobGiver / Job / JobDriver / Toil ca structură de cod, cu Job = POJO serializabil. Câștigi save/load și replay determinist gratis, și ai un „de ce face asta?” inspectabil din prima zi.
- 4. Livrează nevoi + mood + mental breaks înaintea grilei de priorități. Sunt cel mai ieftin sistem din listă și sunt ce transformă un simulator de construcție într-un colony sim. Copiază mood target cu rate asimetrice și pragurile derivate dintr-un singur stat.
- 5. Fă grila 1-4 cu două îmbunătățiri peste RimWorld de la început: tie-break ponderat pe distanță și soft-cap de timp pentru muncile infinite. Sunt cele două plângeri cronice ale genului și te costă o zi fiecare dacă le faci acum.
- 6. Scrie UN storyteller parametrizat + trei PacerDef-uri, nu trei storytellers. Curba de dificultate: plată până la un prag, liniară la mijloc, saturată sus, cu clamp dur pe ambele capete. Adaugă un al doilea driver independent de avere.
- 7. Modelează sănătatea ca părți de corp + un singur tip de Hediff + capacități derivate, cu proteze care scurtcircuitează calculul returnând partEfficiency. Livrează infecția (cursă severitate vs imunitate) înaintea chirurgiei complexe.
- 8. Ține TOT ce e gameplay în Def-uri JSON validate cu Zod, inclusiv dificultăți, taburi de UI și keybinding-uri. Regula: un număr de gameplay în cod = bug de arhitectură. E mai ieftin în TypeScript decât în C# și e singurul mod în care un dev solo poate produce conținut la viteza cerută de gen.
- 9. Definește explicit punctele de extensie pentru mod-uri (onJobSelected, onDamageApplied, onIncidentChosen, onNeedTick, onOpinionChanged) și un contract de compatibilitate între versiuni. Semnalul că merită: 31.891 din cele 38.836 de mod-uri RimWorld sunt actualizate pentru versiunea curentă — ecosistemul migrează pentru că API-ul e stabil.
- 10. Decide verticalitatea ÎNAINTE de primul commit pe regiuni. Dacă da, regiunile sunt 3D din ziua 1. Dacă nu, scrie decizia în doc și nu o redeschide — e diferențiatorul lui Going Medieval și nu e retrofitabil.
- 11. Stabilește un buget de tick explicit (ex. la 50 de pioni: 16,6 ms împărțit între job selection, pathing, needs/health, render) și afișează-l într-un overlay de debug. Bottleneck-urile confirmate în mod-urile de performanță sunt exact sistemele tale: pathfinding, rezervări, hediff-uri, thoughts, hauling, regiuni.
- 12. Amână relațiile sociale la ultima poziție dintre cele 5. E singurul sistem a cărui lipsă nu face jocul să pară rupt, iar costul lui real e în text și prezentare, nu în mecanică.
- 13. Limitează scope-ul geografic la o hartă locală. Semnalul de alarmă e Sapiens: planetă procedurală + multiplayer + VR promise, 25% recenzii pozitive recent, update-uri oprite de peste un an. Livrează bucla locală completă înainte de orice sistem la scară mare.

