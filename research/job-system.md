# job-system — Sistemul de job-uri și de asignare a muncii în colony sims (RimWorld, Dwarf Fortress, Oxygen Not Included, Going Medieval, Sapiens) — generare de muncă, rezervări, priorități, blocaje, hauling, deadlock, anti-micromanagement

## Rezumat

Toate cele patru jocuri de referință folosesc același schelet: munca NU e împinsă către pioni, ci e "trasă" de pion — un scanner per categorie de muncă enumerează ținte potențiale și returnează primul/ cel mai bun job valid. Diferența reală dintre ele e ce se întâmplă la egalitate: RimWorld și ONI sortează strict lexicografic (categorie → sub-prioritate → distanță), iar distanța ajunge ultimul criteriu, de unde comportamentul clasic "pionul traversează harta pentru o bucată de lemn"; ONI a fost nevoit să adauge un toggle "Enable Proximity", iar în RimWorld problema e rezolvată doar prin moduri (SpatialPriorities inserează un al treilea nivel, prioritatea zonei). Rezervările sunt inima corectitudinii: în RimWorld o rezervare e un tuplu (claimant, job, target, layer, maxPawns, stackCount), se eliberează pe perechea (pion, job), nu pe pion, iar `stackCount = -1` înseamnă "tot stack-ul". Dovada că rezervările sunt punctul de eșec e raportul RimThreaded #789: cu mai multe fire, verificarea `CanReserve` și `Reserve` nu mai sunt atomice, apar mesajele "reservation is no longer valid after CanReserve was called" și "Reservation manager failed to clean up properly", iar patru pioni au ajuns într-un lanț de așteptare circular care nu se mai deblochează. Hauling-ul e universal recunoscut ca gâtul de sticlă, dar NU am găsit nicio măsurătoare publicată de tip "60-80%"; ce am confirmat e că DFHack autolabor alocă implicit 33% din forța de muncă la hauling și că wiki-ul DF recomandă explicit haulieri dedicați ca skilled workers să nu piardă timp cărând. Generarea muncii din construcții e o lecție directă: RimWorld nu creează "un job de construit", ci un job de livrare care strânge stack-uri într-o rază de 5 tile-uri (`MultiPickupRadius = 5f`) și le distribuie la mai multe blueprint-uri dintr-o rază de 8 tile-uri (`NearbyConstructScanRadius = 8f`), iar când nu găsește material atașează un motiv de eșec traductibil (`MissingMaterials`). Diagnosticul blocajelor e zona cea mai slab rezolvată în toate jocurile: comunitatea Going Medieval a fost nevoită să scrie o pagină de wiki numită "Why Can't - Checklist", ceea ce e semnalul clar că jocul nu explică singur de ce un settler stă. Anti-micromanagementul are soluții măsurate și copiabile: histerezisul din bill-urile RimWorld (`targetCount = 10`, `unpauseWhenYouHave = 5`), condițiile comparative din Manager-ul DF (>=, <, <=, >, ==, !=) și auto-asignarea proporțională din autolabor (maeștrii unei meserii sunt depriorizați pentru altele). Pentru un dev solo, concluzia operațională e că poți sări peste multe lucruri, dar nu peste trei: rezervări atomice cu eliberare garantată, un cache de reachability bazat pe regiuni (nu A* în bucla de scan) și un câmp "motiv de eșec" propagat din scanner în UI.

## Constatări (29)

### Munca se TRAGE de către pion, nu se împinge către el: fiecare categorie de muncă are un scanner care enumerează ținte, iar pionul execută primul job valid returnat.

- **Detaliu:** În RimWorld logica stă în ThinkTree: pionul parcurge noduri (ThinkNode_JobGiver / WorkGiver) și execută primul job valid. `JobGiver_Work` iterează peste `pawn.workSettings.WorkGiversInOrderNormal` (sau `...Emergency`) și, pentru fiecare workgiver, scanează ținte. Interfața `WorkGiver_Scanner` are exact forma: `PotentialWorkThingsGlobal`, `PotentialWorkCellsGlobal`, `HasJobOnThing`, `JobOnThing`, `Prioritized`, `GetPriority`, `LocalRegionsToScanFirst` (default -1), `MaxPathDanger`, `PathEndMode.Touch`.
- **Sursă:** https://github.com/josh-m/RW-Decompile/blob/master/RimWorld/JobGiver_Work.cs ; https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/WorkGiver_Scanner.cs ; https://github.com/roxxploxx/RimWorldModGuide/wiki/SHORTTUTORIAL:-How-Pawns-Think · încredere: ridicat
- **Implicație:** Nu construi o coadă globală de job-uri cu push. Construiește un registru de JobSource-uri (câte unul per verb: Build, Deliver, Haul, Mine, Craft...) cu două metode: `shouldSkip(pawn)` O(1) și `candidates(pawn)` care returnează ținte deja filtrate spațial. Coada globală te obligă să invalidezi job-uri la fiecare schimbare de lume; pull-ul nu.

### Filtrul pe pion e în două trepte: o poartă ieftină per-workgiver, apoi scanarea scumpă per-țintă.

- **Detaliu:** `PawnCanUseWorkGiver` verifică, în ordine: `(giver.def.nonColonistsCanDo || pawn.IsColonist) && (pawn.story == null || !pawn.story.WorkTagIsDisabled(giver.def.workTags)) && !giver.ShouldSkip(pawn, false) && giver.MissingRequiredCapacity(pawn) == null`. Abia dacă trece toate astea începe scanarea țintelor.
- **Sursă:** https://github.com/josh-m/RW-Decompile/blob/master/RimWorld/JobGiver_Work.cs · încredere: ridicat
- **Implicație:** Implementează `shouldSkip` ca prima linie de apărare: dacă nu există niciun blueprint pe hartă, scannerul de construcție nu trebuie să atingă nicio celulă. Asta e diferența între 60 FPS și 12 FPS la 40 de pioni.

### Există DOUĂ moduri de selecție a țintei, nu unul: „cel mai apropiat” și „cel mai bine prioritizat, apoi cel mai apropiat”.

- **Detaliu:** Pentru scannere cu `Prioritized == false` se folosește `GenClosest.ClosestThingReachable` (distanța e singurul criteriu). Pentru `Prioritized == true` se folosește `GenClosest.ClosestThing_Global_Reachable` cu comparația explicită `if (num5 > num3 || (num5 == num3 && num4 < num2))` — adică prioritate mai mare câștigă, iar la egalitate distanța mai mică.
- **Sursă:** https://github.com/josh-m/RW-Decompile/blob/master/RimWorld/JobGiver_Work.cs · încredere: ridicat
- **Implicație:** Alege modul per JobSource, nu global. Hauling-ul general = „cel mai apropiat” (altfel scanezi toată harta). Construcția și recoltatul = „prioritizat”. Dacă faci totul prioritizat, plătești un scan global la fiecare re-evaluare.

### O rezervare în RimWorld nu e un boolean: e un tuplu cu layer, maxPawns și stackCount.

- **Detaliu:** Semnătura: `public bool CanReserve(Pawn claimant, LocalTargetInfo target, int maxPawns = 1, int stackCount = -1, ReservationLayerDef layer = null, bool ignoreOtherReservations = false)`. Constanta `public const int StackCount_All = -1;`. `maxPawns` limitează câți pioni distincți pot rezerva simultan aceeași țintă; `stackCount` limitează cantitatea din stack. `ReservationLayerDef` permite scheme independente de rezervare pe ACELAȘI obiect (ex.: un pat rezervat „pentru dormit” vs. „pentru reparat”).
- **Sursă:** https://github.com/Chillu1/RimWorldDecompiledWeb/blob/master/Verse.AI/ReservationManager.cs · încredere: ridicat
- **Implicație:** Copiază cele trei dimensiuni de la început. `maxPawns > 1` e singurul mod curat de a lăsa 3 constructori pe același zid; `stackCount` e singurul mod de a lăsa doi haulieri să ia din același morman de 200 de pietre; `layer` e singurul mod de a evita ca „rezerv patul ca să dorm” să blocheze „rezerv patul ca să-l repar”.

### Rezervările se eliberează pe perechea (pion, job), nu pe pion — iar asta e o decizie de arhitectură, nu un detaliu.

- **Detaliu:** API-ul are patru metode distincte: `Release(target, claimant, job)`, `ReleaseAllForTarget(Thing t)`, `ReleaseClaimedBy(Pawn claimant, Job job)`, `ReleaseAllClaimedBy(Pawn claimant)`. În `Pawn_JobTracker.CleanupCurrentJob` se apelează `pawn.ClearReservationsForJob(job)` cu `releaseReservations: true`, și de asemenea la scoaterea unui job din coadă.
- **Sursă:** https://github.com/Chillu1/RimWorldDecompiledWeb/blob/master/Verse.AI/ReservationManager.cs ; https://github.com/Chillu1/RimWorldDecompiledWeb/blob/master/Verse.AI/Pawn_JobTracker.cs · încredere: ridicat
- **Implicație:** Dacă ai coadă de job-uri per pion (și vei avea, pentru „fă X apoi Y”), eliberarea pe pion îți fură claim-urile job-ului din coadă. Indexează rezervările pe (pawnId, jobId) din prima zi — refactorizarea ulterioară e dureroasă.

### Race-ul între verificare și rezervare produce deadlock real, cu lanț circular de pioni — e documentat, nu teoretic.

- **Detaliu:** Raport RimThreaded #789: „ReservationManager.Reserve cannot reserve. This is likely because reservation is no longer valid after CanReserve was called due to time delay with multiple threads” și „Reservation manager failed to clean up properly; Megascarab36982 still reserving Thing_VFE_TableStonecutterElectric482069”. Lanțul observat: Grant nu poate topi (rezervat de Alice) → Alice nu topește (rezervat de Hugh) → Hugh nu poate (rezervat de Todd) → Todd nu poate (rezervat de Lifter 1, care nu știe să topească). Zero muncă, deși toți sunt capabili.
- **Sursă:** https://github.com/cseelhoff/RimThreaded/issues/789 · încredere: ridicat
- **Implicație:** DOUĂ decizii: (1) `canClaim` + `claim` trebuie să fie o singură tranzacție atomică la START-ul job-ului, chiar dacă ai făcut deja verificarea în scan — re-verifică și dă rollback; (2) rulează job system-ul pe un singur fir. Paralelizează pathfinding-ul și simularea fluidelor, niciodată rezervările.

### Trebuie o gardă anti-buclă explicită: RimWorld oprește pionul la 10 job-uri într-un singur tick.

- **Detaliu:** `Pawn_JobTracker` ține `jobsGivenThisTick`; la pragul 10 loghează `"started 10 jobs in one tick. newJob="` + job + jobGiver și apelează `TryStartErrorRecoverJob`. Arborele constant de gândire e re-evaluat la `pawn.IsHashIntervalTick(30)` — adică o dată la 30 de tick-uri, decalat pe hash-ul pionului.
- **Sursă:** https://github.com/Chillu1/RimWorldDecompiledWeb/blob/master/Verse.AI/Pawn_JobTracker.cs · încredere: mediu
- **Implicație:** Implementează ambele: contor de job-uri/tick cu prag (10 e o valoare testată) care forțează idle 60 de tick-uri și loghează job-ul vinovat; și re-scanare decalată pe `entityId % 30`, ca să nu scaneze toți pionii în același frame. Garda e cel mai bun detector de bug pe care îl vei avea — fără ea, bucla A-cere-B-invalidează-A îți mănâncă frame-ul tăcut.

### Condițiile de terminare a unui job trebuie enumerate explicit; RimWorld are 9.

- **Detaliu:** `JobCondition`: `None`, `Succeeded`, `InterruptForced`, `InterruptOptional`, `Errored`, `ErroredPather`, `Ongoing`, `QueuedNoLongerValid`, `Incompletable`. `EndCurrentJob(condition)` decide dacă pornește imediat alt job pe baza condiției.
- **Sursă:** https://github.com/Chillu1/RimWorldDecompiledWeb/blob/master/Verse.AI/Pawn_JobTracker.cs · încredere: ridicat
- **Implicație:** Distinge de la început `InterruptForced` (jucătorul a dat ordin / atac — eliberezi tot și nu reintri) de `Incompletable` (materialul a dispărut — eliberezi tot ȘI marchezi ținta ca nefezabilă pentru câteva secunde, ca să nu re-scanezi la infinit). Un singur `endJob(bool success)` te va costa exact bug-ul de re-scan infinit.

### Regula care oprește ping-pong-ul de hauling e „destinație STRICT mai bună”, nu „destinație validă”.

- **Detaliu:** În `StoreUtility.TryFindBestBetterStoreCellFor`, iterarea peste `map.haulDestinationManager.AllGroupsListInPriorityOrder` se oprește cu `if (priority < storagePriority || priority <= currentPriority) { break; }` — destinația trebuie să aibă prioritate strict mai mare decât locul curent al obiectului. `IsGoodStoreCell` verifică forbidden, rezervări, foc static și `carrier.Map.reachability.CanReach`; `NoStorageBlockersIn` verifică stack-uibilitatea și limita de stack.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/StoreUtility.cs · încredere: ridicat
- **Implicație:** Depozitele TREBUIE să aibă prioritate numerică, iar mutarea trebuie condiționată de „strict mai bun”. Fără asta, două depozite care acceptă același lucru produc un ciclu infinit de cărat care arde 100% din munca coloniei. Este bug-ul nr. 1 pe care îl vei scrie dacă improvizezi.

### Căutarea destinației de depozitare e deliberat APROXIMATIVĂ, cu eșantionare aleatoare.

- **Detaliu:** În worker se pornește de la `float num = 2.14748365E+09f` (max dist²) și se compară `float num2 = (float)(a - intVec).LengthHorizontalSquared`; pentru controlul costului, numărul de celule verificate e `num = Mathf.FloorToInt((float)count * Rand.Range(0.005f, 0.018f))` — adică 0,5%–1,8% din celule, cu ieșire timpurie.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/StoreUtility.cs · încredere: mediu
- **Implicație:** Nu urmări optimul. Alege „suficient de bun” cu ieșire timpurie după N regiuni sau după un prag de scor. Un joc de gen nu e penalizat pentru că pionul a ales al doilea cel mai bun raft — e penalizat pentru micro-freeze-uri.

### Un job de construcție generează un job de TRANSPORT, iar transportul e batch-uit pe două raze diferite.

- **Detaliu:** `WorkGiver_ConstructDeliverResources`: `private const float MultiPickupRadius = 5f;` (strânge stack-uri suplimentare din raza de 5 în jurul primei resurse găsite, via `GenRadial.RadialDistinctThingsAround`) și `private const float NearbyConstructScanRadius = 8f;` (`FindNearbyNeeders` găsește alte blueprint-uri care cer același material în raza de 8). Job-ul rezultat e `HaulToContainer` cu `targetA` = prima resursă, `targetQueueA` = resurse suplimentare, `targetB` = prima destinație, `targetQueueB` = destinații suplimentare. Rezervarea se face cu `pawn.CanReserve(th, 1, -1, null, false)`.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/WorkGiver_ConstructDeliverResources.cs · încredere: ridicat
- **Implicație:** Modelează job-ul ca „listă de ridicări + listă de livrări”, nu ca „o ridicare + o livrare”. Cele două raze (5 pentru ridicare, 8 pentru livrare) sunt numere gata calibrate pe o grilă de ~1 m/tile — pornește de la ele. Fără batching, pionul face un drum pentru fiecare bucată de lemn și jucătorul percepe jocul ca „prost”.

### Motivul de eșec se atașează la SCANARE, cu text traductibil — nu se deduce ulterior în UI.

- **Detaliu:** Când nu găsește material, scannerul apelează `JobFailReason.Is(string.Format("{0}: {1}", WorkGiver_ConstructDeliverResources.MissingMaterialsTranslated, thingDefCountClass.thingDef.label), null)`, unde cheia e `"MissingMaterials".Translate()`.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/WorkGiver_ConstructDeliverResources.cs · încredere: ridicat
- **Implicație:** Scannerul tău NU trebuie să returneze `null`. Trebuie să returneze `Fail(reason, detail)`. Motivul se calculează gratuit acolo unde ai deja contextul; recalculat mai târziu în UI te costă un al doilea scan complet. Asta e singura cale ieftină către „de ce nu se construiește asta”.

### Reachability se rezolvă cu regiuni și cache, nu cu pathfinding — și asta e condiția ca scanarea să fie fezabilă.

- **Detaliu:** `Reachability` face BFS pe graful de regiuni (`RegionLink`), nu pe celule: `private bool CheckRegionBasedReachability(TraverseParms)`. Cache-ul `ReachabilityCache` reține rezultate între perechi de camere ca `BoolUnknown` (True/False/Unknown), iar `GetCachedResult(TraverseParms)` întoarce instant. Scurtcircuite: `ReachabilityImmediate.CanReachImmediate()` pentru adiacență și verificarea „aceeași cameră”. Fallback pe `map.floodFiller.FloodFill()` doar pentru moduri speciale (obstacole distructibile, evitare apă).
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/Verse/Reachability.cs · încredere: ridicat
- **Implicație:** Sistemul de regiuni/camere e o PRECONDIȚIE a job system-ului, nu o optimizare ulterioară. Planifică-l în aceeași felie de lucru. Regulă dură: în bucla de scan ai voie să apelezi doar `canReach` (cache pe camere) și `distanceSquared`; A* se apelează o singură dată, la startul job-ului.

### ONI sortează job-urile STRICT lexicografic pe 7 niveluri, iar distanța e ultimul — de aceea duplicanții traversează harta.

- **Detaliu:** Ordinea reală (extrasă din sursa modului Rational Priority): (1) clasa master: `idle < basic < high < personal needs < top priority < compulsion`; (2) prioritatea personală 0 (disabled) – 5 (very high); (3) valoarea master de prioritate 1–9; (4) prioritatea per tip de task 0–9999; (5) `PriorityMod` (legat de task-urile de fetch); (6) prioritatea consumatorului (preferințe de relaxare); (7) costul de navigație = „10 * the travel distance to the job”.
- **Sursă:** https://raw.githubusercontent.com/yobbobandana/oni_mods/master/rational_priority/RationalPriority.cs · încredere: mediu
- **Implicație:** NU copia sortarea lexicografică. Pe hărți mari e defectul structural al genului: un task cu prioritate +1 la celălalt capăt al hărții bate un task la 2 tile-uri. Folosește un scor continuu (vezi constatarea următoare).

### Există o formulă concretă, publicată, pentru a schimba prioritatea pe distanță: prioritățile exponențiale, distanța liniară.

- **Detaliu:** Rational Priority stabilește echivalențele: „personal priority 1 and task priority 1”, „personal priority 3 and task priority 5”, „personal priority 5 and task priority 9”, și „a priority 5 task 15m away and a priority 6 task 30m away”. Regula rezultată: „An increase of one task priority level is equivalent to halving distance. An increase of one personal priority level is equivalent to quartering distance.” Constante: prioritatea = `1 << (priority_value - 1)`, preferința personală = `1 << ((personalPriority - 1) * 2)`; praguri de cost 136 și 65536; se aruncă ultimii 3 biți ai costului pentru sub-tile; distanță maximă utilă 6553,6 tile-uri, minimă 12,8 tile-uri.
- **Sursă:** https://raw.githubusercontent.com/yobbobandana/oni_mods/master/rational_priority/RationalPriority.cs · încredere: mediu
- **Implicație:** Adoptă direct: `score = 2^(prioritateTask) * 4^(prioritatePersonală) / (1 + costDrum)`. Regula „+1 prioritate = jumătate din distanță” e intuitivă pentru jucător și ușor de explicat în tooltip. E cea mai mare îmbunătățire raport-cost/beneficiu din tot documentul.

### ONI a fost nevoit să adauge un toggle „Enable Proximity” — semn că nici Klei n-a rezolvat problema distanței în design-ul de bază.

- **Detaliu:** Wiki-ul confirmă: „With Enable Proximity on a Duplicant will always select the closest tasks among multiple tasks with the same priority and sub-priority.” Prioritatea implicită a clădirilor e 5; sub-prioritatea 1–9 departajează în interiorul aceluiași nivel (9 primul, 1 ultimul). Alertele: Yellow Alert suprascrie programul (mai puțin somnul), Red Alert face duplicanții să-și ignore nevoile de bază.
- **Sursă:** https://oxygennotincluded.wiki.gg/wiki/Priority · încredere: ridicat
- **Implicație:** Livrează „proximity mode” ca setare per-colonie de la lansare (e o schimbare de o linie în comparator) și un „Red Alert” care ridică temporar o categorie peste nevoi. Ambele sunt supape pentru jucătorul frustrat, la cost aproape zero.

### ONI nu întrerupe un job în curs pentru unul mai prioritar; nevoile personale sunt singura excepție.

- **Detaliu:** „A busy Duplicant will continue to work on their current errand until it's complete, even if a higher priority errand becomes available.” Nevoile personale (baie, mâncare, somn) se execută întotdeauna, singura suprascriere fiind Red Alert. Tipurile de errand sunt 15: Combat, Build, Care, Cook, Decorate, Dig, Farm, Life Support, Operate, Ranching, Research, Storage, Supply, Tidy, Toggle.
- **Sursă:** https://oxygennotincluded.wiki.gg/wiki/Errand ; https://oxygennotincluded.wiki.gg/wiki/Priority · încredere: ridicat
- **Implicație:** Politică de preempțiune explicită, scrisă în GDD: preempțiunea are voie DOAR pentru (a) nevoi critice, (b) pericol, (c) ordin direct al jucătorului. Orice altceva → pionul termină. Fără regula asta, pionii comută la infinit și nu termină nimic (job thrashing), iar rezervările se scurg la fiecare comutare.

### Going Medieval: 16 job-uri, 5 niveluri de prioritate, departajare stânga→dreapta, iar Haul e ultima coloană.

- **Detaliu:** Job-uri: Tend, Convalesce, Hunt, Construction, Grow, Harvest, Mine, Cut Plants, Cooking, Craft, Smithing, Carpentry, Tailoring, Research, Steward, Haul. Prioritățile sunt 1 (cea mai mare) – 5 (cea mai mică), iar celula goală = niciodată. „Settlers will always do the highest priority job that they can find — if a specific job is not on anyone's priority list, that job will never get done.” Fără skill: Convalesce, Craft, Steward, Haul (chenar gri). Nivelul de skill e indicat de culoarea chenarului (auriu = maxim, maro închis = minim).
- **Sursă:** https://eip.gg/going-medieval/guides/jobs/ ; https://steamcommunity.com/app/1029780/discussions/0/5296777170366451679/ · încredere: ridicat
- **Implicație:** Grila 16×5 e un buget de UI realist pentru un dev solo. DAR: capcana „dacă nimeni nu are job-ul bifat, nu se face niciodată” trebuie prinsă de joc, nu de jucător — afișează un avertisment permanent „Nimeni nu are activat: Haul”. Și pune Haul-ul implicit activat la toți, la prioritate mijlocie.

### Comunitatea Going Medieval a fost nevoită să scrie o pagină de wiki numită „Why Can't - Checklist” — dovada că jocul nu explică blocajele.

- **Detaliu:** Pe firele de discuție Steam, jucătorii raportează settleri care stau lângă mâncare fiind flămânzi sau în dormitor cu debuff de oboseală; răspunsurile comunității atribuie totul configurării (prioritate greșită, program de lucru, job dezactivat din cauza skill-ului 0), nu unui bug. Nicio cauză de tip accesibilitate/material/acoperiș nu e menționată de joc; ea e dedusă de jucători.
- **Sursă:** https://goingmedieval.fandom.com/wiki/Why_Can%27t_-_Checklist (pagina există, conținutul n-a putut fi descărcat — HTTP 402) ; https://steamcommunity.com/app/1029780/discussions/0/5296777170366451679/ · încredere: mediu
- **Implicație:** Feature diferențiator, ieftin: panoul „De ce nu?” pe orice blueprint/rețetă/obiect, alimentat de `Fail(reason)` din scanner. Nu cere sisteme noi — cere doar ca scannerul să nu arunce informația pe care o are deja. Este cel mai bun raport valoare/efort din tot raportul.

### Dwarf Fortress folosește un model complet diferit de RimWorld: porți de labor (on/off), nu priorități numerice, iar job-ul se dă celui mai priceput.

- **Detaliu:** Un pitic „will completely refuse to do unassigned labors”; job-urile apar din designations, zone, taskuri de atelier și manager work orders; „Job selection now prioritizes more highly-skilled dwarves. If you have a skilled dwarf available for a labor, they will be the one to get that job every single time.” Work details au cod de culoare: verde = face detaliul și e deschis și la ce „everyone does”; roșu = blocat exclusiv pe acel detaliu. Mining/woodcutting/hunting cer unelte (târnăcop, topor, arbaletă) și sunt reciproc exclusive.
- **Sursă:** https://dwarffortresswiki.org/index.php/DF2014:Labor ; https://steamcommunity.com/app/975370/discussions/0/3716062978749047381/ · încredere: ridicat
- **Implicație:** Decizie de arhitectură: grilă de priorități (RimWorld/Going Medieval) SAU roluri on/off cu tie-break pe skill (DF/Sapiens). Hibridul recomandat: roluri on/off + 3 niveluri (normal / preferat / exclusiv), care e mai ușor de explicat decât 5 niveluri × 16 coloane și ține „specialistul blocat” (roșu DF) ca opțiune.

### DFHack autolabor arată cum arată o auto-asignare bună — și dă numere gata calibrate, inclusiv „33% haulieri”.

- **Detaliu:** „frequently checks how many jobs of each type are available and sets labors proportionally”. Euristici: ordine de preferință pe skill excluzând incapabilii; „dwarves who are masters of a skill are deprioritized for other skills”; peste minim, un pitic primește laborul dacă e idle și niciun idle nu-l are, dacă are skill non-zero, sau dacă are deja unealta. Implicit: între 1 și 200 de pitici per labor (2–200 pentru minerit); „33% of the workforce become haulers” (hauling, curățenie, manete); nobilii cu sarcini diplomatice și medicul-șef primesc mai puține laboruri. Avertisment: algoritmii „have not been updated for version 50 of Dwarf Fortress”.
- **Sursă:** https://docs.dfhack.org/en/50.13-r3/docs/tools/autolabor.html · încredere: ridicat
- **Implicație:** Livrează un mod „Auto” pentru asignare, cu exact aceste reguli: min/max per meserie, deprioritizarea maeștrilor pentru meserii secundare, și ~1/3 din populație pe transport. Jucătorul care nu vrea grila primește ceva funcțional; jucătorul care vrea control trece pe Manual. Cifra 33% e cel mai bun punct de start pe care l-am găsit pentru raportul haulieri/producători.

### Ordinele de producție cu țintă de stoc trebuie să aibă HISTEREZIS, altfel producția oscilează.

- **Detaliu:** RimWorld `Bill_Production`: `repeatMode ∈ {RepeatForever, RepeatCount, TargetCount}`, `public int targetCount = 10;`, `public bool pauseWhenSatisfied;`, `public int unpauseWhenYouHave = 5;`. Logica: `if (pauseWhenSatisfied && num >= targetCount) paused = true; if (num <= unpauseWhenYouHave || !pauseWhenSatisfied) paused = false; return !paused && num < targetCount;`. Deci se oprește la 10 și repornește abia la 5 — bandă moartă de 50%.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/Bill_Production.cs · încredere: ridicat
- **Implicație:** Implementează „Produ până ai N, reia când scazi sub M” cu M ≈ N/2 ca implicit. Fără banda moartă, un pion pornește rețeta la fiecare consum de 1 unitate → job spam, rezervări scurte, atelier blocat. Numerele 10/5 sunt gata testate.

### Ordinele repetitive cu condiții au un mod de eșec cunoscut și urât în DF: condițiile se verifică o singură dată.

- **Detaliu:** Manager-ul DF acceptă condiții cu `>=`, `<`, `<=`, `>`, `==`, `!=` (ex.: fă paturi doar dacă ai ≥10 bușteni, oprește-te la 10 paturi). Ordinele repetitive repornesc la finalizare (verificare zilnică/lunară/sezonieră/anuală) și „a repeating work order will not abort mid-batch due to job cancellation or failed conditions”. Bug de design documentat: „perpetual (quantity 0) orders only check their conditions the first time they become true” și „will never stop, regardless of failed conditions”. Peste 20 de pitici, managerul trebuie să meargă fizic în birou să valideze fiecare ordin.
- **Sursă:** https://dwarffortresswiki.org/index.php/DF2014:Manager · încredere: ridicat
- **Implicație:** Reevaluează condițiile la FIECARE ciclu de producție, nu doar la creare, și afișează în UI starea condiției („blocat: ai 4 bușteni, ai nevoie de 10”). Validarea manuală a lui DF e anti-feature — nu o copia.

### Depozitele cu legături explicite („take from” / „give to”) sunt un footgun care produce blocaje complet tăcute.

- **Detaliu:** În DF, legăturile sunt direcționale și pot forma bucle. Avertisment explicit din wiki: un atelier legat primește materiale „only” de la stockpile-urile asignate — un topitor fără legătură la un stockpile de combustibil nu funcționează, deși are minereu. Alte numere: stockpile maxim 31×31 = 961 tile-uri; max bins/barrels configurabil (0 = fără containere); roabele limitează job-urile simultane de cărat piatră (implicit 0 = nelimitat). Haulierii pun obiectul în cel mai apropiat loc liber „not counting any obstructions” și preferă obiectul „cel mai nou”, care poate să nu fie cel mai apropiat.
- **Sursă:** https://dwarffortresswiki.org/index.php/DF2014:Stockpile · încredere: ridicat
- **Implicație:** Dacă implementezi legături depozit↔atelier, ESTE OBLIGATORIU un avertisment „acest atelier nu are nicio sursă pentru <material>”. Altfel ai construit o mașină de blocaje invizibile. Alternativa mai sigură pentru v1: doar filtre + priorități pe depozite, fără legături direcționale.

### Hauling-ul e recunoscut universal ca gât de sticlă, dar NU am găsit nicio măsurătoare publicată de tip „60-80% din muncă”.

- **Detaliu:** Ce e confirmat: wiki-ul DF avertizează că laborurile de hauling pot domina productivitatea și recomandă haulieri dedicați ca muncitorii calificați să nu care; DFHack autolabor pune implicit 33% din forța de muncă pe hauling; pe Steam, „the bottleneck in expanding your colony is almost always hauling”. Ce NU e confirmat: orice procent exact din timpul total de muncă. Cifra 60–80% din brief nu apare în nicio sursă primară găsită.
- **Sursă:** https://dwarffortresswiki.org/index.php/DF2014:Labor ; https://docs.dfhack.org/en/50.13-r3/docs/tools/autolabor.html ; https://steamcommunity.com/app/294100/discussions/0/1752358461524636931/ · încredere: scazut
- **Implicație:** Nu construi design pe o cifră nedovedită. Instrumentează-ți PROPRIUL joc: un contor per pion de ticks-pe-drum vs. ticks-de-lucru-efectiv, expus într-un panou debug. Dacă drumul depășește ~40%, ai o problemă de layout sau de batching, și abia atunci acționezi.

### Capacitatea de transport e o pârghie de design a layout-ului bazei, nu un detaliu de realism.

- **Detaliu:** În RimWorld pionul cară un stack complet pe drum (orez = 75), iar obiectele nestivuibile (arme, armuri) unul câte unul — de aici percepția „face un drum pentru fiecare obiect”. Încărcarea caravanelor ocolește intenționat regula: „Caravan loading skirts the rules, because otherwise caravans would take days to load. It's purely a balance thing.” Modul Pick Up And Haul introduce capacitate pe greutate/volum și, conform discuției, „potentially trivializing base layout strategy”.
- **Sursă:** https://steamcommunity.com/app/294100/discussions/0/6682809959402553804/ ; https://steamcommunity.com/app/294100/discussions/0/1752358461524636931/ · încredere: mediu
- **Implicație:** Alege conștient: capacitate mică = layout-ul contează și jucătorul optimizează; capacitate mare (inventar pe greutate) = confort, dar dispare o buclă întreagă de gameplay. Recomandarea mea: capacitate pe greutate DAR mică, plus unelte care o cresc (coș, roabă, animal de povară) — astfel transformi problema într-un arbore de progres, nu într-o frustrare.

### Sapiens folosește un model de ROLURI peste skill-uri, cu cost unic de învățare la prima execuție.

- **Detaliu:** 31 de skill-uri (General Labor, Basic Building, Fire Lighting, Mining, Digging, Tree Felling, Planting, Basic/Spear Hunting, Tool Assembly, Pottery, Ceramics, Bone Carving, Wood Working, Thatch/Mud Brick/Wood Building, Tiling, Basic Cooking, Baking, Butchery, Grain Grinding, Threshing, Diplomacy, Music, Medicine, Investigation ș.a.). „A role is the assignment of one of any of the skills to a particular Sapien for them to work on open jobs that require this skill.” Un sapien poate avea ~4–5 roluri (wiki-ul oficial indică 5; alte surse spun 6 — surse contradictorii). La prima execuție a unui task nou apare o întârziere de învățare cu inel de progres, apoi o panglică cu stea albastră = măiestrie fără întârzieri ulterioare. Rolurile noi se deblochează prin Investigations.
- **Sursă:** https://wiki.playsapiens.com/index.php/Skills ; https://techraptor.net/gaming/guides/sapiens-roles-guide ; https://steamcommunity.com/app/1060230/discussions/0/3318610798935168905/ · încredere: mediu
- **Implicație:** Plafonul de roluri (4–6) e un mecanism excelent de anti-micromanagement ȘI de gameplay: te obligă să specializezi și face populația o resursă. Costul unic de învățare e o pârghie ieftină care descurajează re-asignarea haotică. Copiază ambele. Atenție: firul Steam „Tedious role assigning” arată că asignarea rol-cu-rol la populație mare devine obositoare — ai nevoie de asignare în masă pe grup.

### Prioritatea spațială (pe zone) e un al treilea nivel dovedit, care se inserează curat în ordinea existentă.

- **Detaliu:** Modul SpatialPriorities descrie ordinea vanilla ca: (1) prioritatea tipului de muncă, (2) ordinea stânga-dreapta a tipurilor, (3) prioritatea naturală a task-ului (`priorityInType`), (4) distanța. Modul inserează „prioritatea zonei țintă” (nivele 1–5, desenate cu unealta de arhitect) pe poziția 3, suprascriind complet `JobGiver_Work` și evaluând „all workgivers in the same worktype, with the same priority, at the same time”. Problema declarată: un colonist traversează harta să recolteze fân, ignorând medicamentele de lângă el.
- **Sursă:** https://github.com/fluffy-mods/SpatialPriorities · încredere: mediu
- **Implicație:** Dacă implementezi scor continuu (constatarea cu formula exponențială), zona devine doar un multiplicator: `score *= zoneWeight`. Unealta „pictează o zonă prioritară” e ieftin de implementat și e răspunsul direct la cea mai frecventă frustrare din gen: „de ce s-au dus toți acolo?”.

### Un job trebuie să-și poată declara invaliditatea în timpul execuției, nu doar la start.

- **Detaliu:** Wiki-ul DF listează explicit ca probleme cunoscute: anulări de job, obiecte pierdute sau distruse la mijlocul task-ului și obiecte revendicate/rezervate de alți pitici. În RimWorld, `ExposeData()` din ReservationManager face curățenie post-load și loghează eroare pentru `if (reservation.Claimant != null && reservation.Claimant.Destroyed)`, eliminând rezervările cu claimant sau țintă distruse.
- **Sursă:** https://dwarffortresswiki.org/index.php/DF2014:Labor ; https://github.com/Chillu1/RimWorldDecompiledWeb/blob/master/Verse.AI/ReservationManager.cs · încredere: ridicat
- **Implicație:** Trei hook-uri obligatorii: `onEntityDestroyed` → eliberează toate rezervările ca claimant ȘI ca țintă; `onThingDestroyed` → invalidează job-urile care o țintesc; validare la save/load care curăță rezervările orfane și LOGHEAZĂ (o rezervare orfană tăcută = deadlock permanent într-un save vechi).

## Implicații de design

- Arhitectura de bază: PULL, nu PUSH. Registru de JobSource-uri (un scanner per verb), pionul cere job când e liber. Nicio coadă globală de job-uri — costul invalidării la fiecare schimbare de lume o face imposibil de întreținut de un singur om.
- Rezervarea e un tuplu (claimant, jobId, targetId, layer, count, maxClaimants), niciodată un boolean. Cele trei dimensiuni (layer, maxClaimants, count) trebuie să existe din prima versiune; adăugate ulterior cer rescrierea fiecărui JobDriver.
- Check-and-claim atomic la START-ul job-ului, cu rollback. Re-verifică chiar dacă ai verificat la scan — între scan și start lumea s-a schimbat. Este singura garanție împotriva lanțurilor de deadlock de tip RimThreaded #789.
- Job system-ul rulează pe UN singur fir. Paralelizezi pathfinding, LOD, simularea de fluide/temperatură — niciodată rezervările.
- Scor continuu în locul sortării lexicografice: score = 2^prioritateTask × 4^prioritatePersonală / (1 + costDrum). Regula pentru jucător: „+1 nivel de prioritate = merită jumătate din drum”. Asta elimină din start defectul structural al ONI și RimWorld.
- Reachability pe regiuni/camere cu cache tri-stare (True/False/Unknown) este o PRECONDIȚIE, nu o optimizare. În bucla de scan: doar canReach + distanceSquared. A* o singură dată, la start.
- Scannerul returnează Fail(cauză, detaliu), nu null. Cauza se calculează unde ai deja contextul. Din asta iese gratuit panoul „De ce nu?” — feature-ul care te diferențiază de Going Medieval.
- Job-ul de construcție = job de livrare + job de lucru, cu batching pe două raze: strânge stack-uri din ~5 tile-uri, livrează la toate șantierele din ~8 tile-uri. Fără batching, jocul pare rupt.
- Politica de preempțiune scrisă explicit: doar nevoi critice, pericol și ordin direct al jucătorului întrerup un job. Tot restul → pionul termină. Fără asta apare job thrashing și scurgeri de rezervări la fiecare comutare.
- Depozitele au prioritate numerică, iar mutarea se face doar către destinație STRICT mai bună. Fără regula asta ai ciclu infinit de cărat care arde 100% din muncă.
- Model de asignare recomandat: hibrid roluri + 3 niveluri (normal / preferat / exclusiv) în loc de grilă 16×5. Plafon de 4–6 roluri per pion (ca Sapiens) ca mecanism simultan de anti-micromanagement și de gameplay.
- Ordinele de producție cu țintă de stoc au histerezis obligatoriu: oprește la N, repornește la ~N/2. Condițiile se re-evaluează la fiecare ciclu, nu o singură dată (bug-ul documentat al Manager-ului DF).
- Mod „Auto” de asignare a muncii, cu regulile din DFHack autolabor: min/max per meserie, maeștrii depriorizați pentru meserii secundare, ~33% din populație pe transport. Jucătorul care nu vrea grila primește ceva funcțional.
- Capacitatea de transport e o pârghie de design: mică = layout-ul contează; mare = dispare o buclă de gameplay. Recomandat: capacitate pe greutate, mică, extinsă prin unelte (coș → roabă → animal) — transformă frustrarea într-un arbore de progres.
- Gardă anti-buclă obligatorie: contor de job-uri per tick cu prag 10, forțează idle și loghează job-ul vinovat. E cel mai bun detector de bug pe care îl vei avea și costă 5 linii.
- Re-scanarea se decalează pe hash-ul entității (ex. la fiecare 30 de tick-uri, entityId % 30), nu toți pionii în același frame.

## Riscuri

- Sortare lexicografică a priorităților → toți pionii traversează harta. Motiv: distanța ajunge ultimul criteriu de departajare. Semnal de alarmă: contorul „ticks pe drum / ticks de lucru” depășește 40%; sau jucătorii cer „proximity mode” pe forum (exact ce a pățit ONI).
- Race între canClaim și claim → lanț circular de rezervări și zero muncă, cu pioni care par vii. Motiv: verificarea la scan nu mai e validă la start. Semnal: în log apar „cannot reserve” în rafale; în joc, N pioni idle cu N job-uri disponibile.
- Rezervare eliberată pe pion în loc de perechea (pion, job) → job-ul din coadă își pierde claim-ul și eșuează la execuție. Semnal: job-uri care încep și se anulează imediat, doar când pionul are coadă.
- Rezervări orfane după moarte/distrugere/save-load → obiectul rămâne „ocupat” pe veci, deadlock tăcut care NU se auto-repară. Semnal: un obiect pe care niciun pion nu vrea să-l atingă, fără mesaj de eroare. Antidot: validare la load care loghează, plus un buton debug „eliberează toate rezervările”.
- Ping-pong de hauling între două depozite care acceptă același lucru → 100% din munca coloniei consumată de cărat. Motiv: lipsa regulii „strict mai bun”. Semnal: obiecte care oscilează între două zone la infinit.
- Job thrashing: pionul comută la fiecare re-evaluare pe un job marginal mai bun și nu termină nimic. Motiv: lipsa politicii de preempțiune + re-scanare prea deasă. Semnal: bare de progres care se resetează, „workLeft” care nu scade niciodată.
- Bucla A-cere-B-invalidează-A → mii de job-uri pe secundă, frame-uri pierdute fără crash. Motiv: două scannere care se contrazic (ex.: haul-ul mută un material pe care construcția tocmai l-a rezervat). Semnal: exact ce prinde garda de 10 job-uri/tick; fără gardă, doar profiler-ul îți spune.
- Cost de scan O(pioni × surse × ținte) → freeze la scalare. Motiv: A* sau scan global în bucla de selecție. Semnal: FPS cade liniar cu numărul de blueprint-uri, nu cu numărul de pioni.
- „Job-ul nu e bifat la nimeni, deci nu se face niciodată” (defectul Going Medieval) → jucătorul nou crede că jocul e stricat. Semnal: firele de forum „my settlers do nothing”. Antidot: avertisment permanent per categorie neacoperită, plus Haul activat implicit la toți.
- Legături direcționale depozit↔atelier fără avertisment → atelier oprit deși materialul există (bug-ul topitorului fără combustibil din DF). Semnal: un atelier cu 0 progres și niciun mesaj. Antidot: nu livra legăturile în v1, sau livrează-le cu validare obligatorie.
- Ordin de producție perpetuu care nu-și mai verifică condițiile (bug-ul documentat al Manager-ului DF) → depozitul se umple la infinit. Semnal: un singur material care crește necontrolat.
- Micromanagement inacceptabil: grilă 16 job-uri × 5 niveluri × N pioni = 80 de celule per colonist. Motiv: copierea oarbă a UI-ului RimWorld/Going Medieval. Semnal: playtesterii nu ating niciodată grila, sau o ating o dată și renunță. Antidot: modul Auto trebuie să fie IMPLICIT, nu opțional.
- Paralelizarea job system-ului „ca să meargă mai repede” → exact defectul RimThreaded. Risc mare pentru un dev solo cu experiență C++/Unreal, unde tentația de a folosi un task graph e mare. Regula dură: job system-ul e single-thread, fără excepții.
- Măsurătoarea „hauling = 60-80% din muncă” nu e confirmată de nicio sursă primară. Riscul e să calibrezi economia pe o cifră inventată. Antidot: instrumentează-ți propriul joc înainte să iei decizii de balans.

## Întrebări deschise

- Ce scală țintim — 10-20 de pioni (RimWorld/Going Medieval) sau 100+ (Songs of Syx)? Sub ~30 de pioni, rezervarea per-obiect e fezabilă; peste, majoritatea jocurilor trec la un model de „sloturi de angajare” abstract. Nu am putut confirma modelul Songs of Syx (wiki inaccesibil) — merită o pasă separată dacă țintim populații mari.
- Grila de priorități (RimWorld/Going Medieval) vs. roluri on/off (DF/Sapiens) vs. hibridul propus — decizia trebuie luată ÎNAINTE de UI, pentru că schimbă și modelul de date al pionului.
- Harta e 3D pe niveluri (Going Medieval) sau 2D pe grilă? Regiunile și reachability-ul se complică semnificativ pe verticală (scări, rampe, tavane) și asta schimbă costul priorității 1.
- Preempțiunea: doar urgențe (modelul ONI) sau și priorități superioare? Modelul ONI e mai simplu și mai puțin buggy, dar jucătorii îl percep ca „pionii mei ignoră ordinele”.
- Unitatea de transport: stack complet (RimWorld) sau capacitate pe greutate/volum? Decizia afectează direct dacă layout-ul bazei rămâne o buclă de gameplay.
- Câte roluri/meserii per pion? Sapiens indică 4–6, dar sursele se contradic (wiki-ul oficial spune 5, ghidul TechRaptor sugerează 6). De verificat în joc înainte de a copia cifra.
- Care e procentul real de timp petrecut pe drum în prototipul nostru? Cifra „hauling 60-80%” din brief NU e confirmată de nicio sursă primară — trebuie măsurată, nu presupusă.
- Unreal 5.7 sau stack propriu? Job system-ul de mai sus e agnostic, dar sistemul de regiuni/reachability nu se mapează bine pe NavMesh-ul Unreal — pe grilă vrei regiuni proprii, nu recast. De decis devreme.
- Conținutul exact al paginii „Why Can't - Checklist” de pe wiki-ul Going Medieval (blocat cu HTTP 402) — merită recuperat, e practic lista de cerințe gata scrisă pentru panoul de diagnostic.
- Cum arată sistemul de mesaje pentru jucător când un job devine imposibil: notificare activă (ca anunțurile de anulare din DF, care devin spam) sau pasivă (iconiță pe obiect + panoul „De ce nu?”)? Recomand pasiv, dar e o decizie de UX care trebuie testată.

## Recomandări

- PRIORITATE 1 — Construiește sistemul de regiuni și cache-ul de reachability ÎNAINTE de job system. Fără el, orice scanner e O(hartă) și vei rescrie tot. Copiază forma din Verse/Reachability.cs: BFS pe graful de regiuni, cache tri-stare (True/False/Unknown) pe perechi de camere, scurtcircuit pentru „aceeași cameră” și pentru adiacență.
- PRIORITATE 2 — Implementează ReservationManager-ul complet din prima zi, cu layer/maxClaimants/count și cu tranzacție atomică la start. Adaugă imediat cele trei hook-uri: onPawnDestroyed, onThingDestroyed, onLoad-validate. Scrie și un asert de integritate care rulează o dată pe secundă în build-ul de debug (vezi pseudocodul de mai jos).
- PRIORITATE 3 — Scor continuu în locul sortării lexicografice, cu formula Rational Priority: score = 2^(prioritateTask) * 4^(prioritatePersonală) / (1 + costDrum), adică „+1 nivel de prioritate = merită jumătate din distanță”. Adaugă un multiplicator de zonă (unealta „pictează zonă prioritară”, 1–5) ca al treilea factor. Asta rezolvă preventiv cea mai mare frustrare a genului.
- PRIORITATE 4 — Panoul „De ce nu?”. Fă scannerul să returneze Fail(cauză, detaliu) în loc de null, agregă cauzele per țintă și afișează cea mai avansată în tooltip. Cinci cauze acoperă practic tot: LIPSĂ MATERIAL, INACCESIBIL, NICIUN MUNCITOR CALIFICAT/ACTIVAT, PRIORITATE PREA JOASĂ, REZERVAT DE ALTCINEVA. Este feature-ul cu cel mai bun raport valoare/efort din tot raportul și te diferențiază direct de Going Medieval.
- PRIORITATE 5 — Modul Auto de asignare a muncii ca IMPLICIT, cu regulile autolabor: min/max per meserie, maeștrii depriorizați pentru meserii secundare, ~33% din populație pe transport, idle-ul primește laborul dacă niciun idle nu-l are. Grila manuală rămâne pentru jucătorul avansat.
- Batching de transport, cu constantele RimWorld ca punct de start: strânge stack-uri suplimentare într-o rază de ~5 tile-uri în jurul primei resurse, livrează la toate șantierele care cer același material într-o rază de ~8 tile-uri. Job-ul devine „coadă de ridicări + coadă de livrări”.
- Depozite cu prioritate numerică și regula STRICT mai bună la mutare. Renunță în v1 la legăturile direcționale depozit↔atelier (footgun-ul DF); dacă le adaugi vreodată, validarea „acest atelier nu are nicio sursă pentru X” e obligatorie în aceeași felie.
- Ordine de producție cu histerezis (oprește la N, repornește la N/2 — implicite 10/5 ca RimWorld) și condiții comparative re-evaluate la FIECARE ciclu, cu starea condiției afișată în UI („blocat: ai 4 din 10 bușteni”).
- Instrumentare proprie înainte de orice balans: contor per pion de ticks-pe-drum vs. ticks-de-lucru, plus un heatmap de trafic. Nu prelua cifra „hauling = 60-80%” din nicio sursă — nu e confirmată. Măsoar-o tu și decide pe baza ei.
- Model de asignare hibrid: roluri on/off + 3 niveluri (normal / preferat / exclusiv), cu plafon de 4–6 roluri per pion și cost unic de învățare la prima execuție (ca Sapiens). Mai ușor de explicat decât 16×5 și de două ori mai ieftin de construit în UI.
- SPECIFICAȚIE — JOB SYSTEM MINIM DAR CORECT (pseudocod)

// ===== DATE =====
Claim       = { targetId, layer, count }        // count = -1 -> tot stack-ul
Reservation = { claimantId, jobId, targetId, layer, count, maxClaimants }
Job = {
  id, kind, category,
  claims: Claim[],        // TOT ce trebuie rezervat, calculat INAINTE de start
  steps: Step[],          // toils: goto / pickup / carry / work / drop
  workLeft: float,
  failReason?: FailReason  // setat de scanner cand refuza
}
interface JobSource {                            // echivalentul WorkGiver
  category: Category
  priorityInCategory: int
  prioritized: bool                              // true -> scor global, false -> cel mai apropiat
  shouldSkip(pawn): bool                         // early-out O(1)
  candidates(pawn): Iterable<Target>             // in ordinea regiunilor, nu a hartii
  claimsFor(target): Claim[]
  jobFor(pawn, target): Job | Fail(reason)
}

// ===== BUCLA PER PION =====
function tickPawn(pawn):
  if pawn.job != null:
     if !stillValid(pawn.job): return endJob(pawn, Incompletable)
     return advance(pawn.job)
  if (tick + pawn.id) % 30 != 0: return          // re-scan decalat pe hash
  r = findJob(pawn)
  if r.ok: startJob(pawn, r.job) else pawn.idleReason = r.reason

// ===== SELECTIE =====
function findJob(pawn):
  for need in pawn.criticalNeeds():              // foame/somn/sange: ocolesc grila
     if j = need.job(pawn): return Ok(j)
  lastReason = NONE
  for cat in pawn.categoriesByPriority():        // stabil; tie-break stanga->dreapta
    best = null; bestScore = -INF; regions = 0
    for src in sourcesOf(cat).sortedBy(priorityInCategory):
       if !pawn.enabled(cat) or src.shouldSkip(pawn): continue
       for t in src.candidates(pawn):
          if !canReachCached(pawn, t): { lastReason = INACCESIBIL; continue }
          if !canClaimAll(pawn, src.claimsFor(t)): { lastReason = REZERVAT; continue }
          s = score(pawn, src, t)
          if s > bestScore: { best = (src,t); bestScore = s }
          if ++regions > MAX_REGIONS_TO_SCAN: break   // ieftin > optim
    if best: return best.src.jobFor(pawn, best.t)     // poate returna tot Fail(...)
  return Fail(lastReason)

function score(pawn, src, t):
  // prioritati EXPONENTIALE, distanta LINIARA (regula Rational Priority)
  // +1 nivel de prioritate == merita jumatate din distanta
  return pow(2, src.priorityInCategory)
       * pow(4, pawn.personalPriority(src.category))
       * zoneWeight(t)
       / (1 + pathCostApprox(pawn, t))

// ===== START: CHECK+CLAIM ATOMIC =====
function startJob(pawn, job):
  txn = beginClaims()
  for c in job.claims:
     if !txn.tryClaim(pawn, job, c):              // altcineva a luat-o intre scan si start
        txn.rollback(); return false
  txn.commit()
  pawn.job = job
  if ++pawn.jobsThisTick > 10:                    // gardă anti-buclă
     forceIdle(pawn, 60); logError("job loop", job.kind, job.claims)
  return true

// ===== SFARSIT =====
function endJob(pawn, condition):
  releaseClaims(byPawn = pawn.id, byJob = pawn.job.id)   // perechea, NU doar pionul
  if pawn.carrying != null: dropCarriedAtFeet(pawn)      // altfel marfa dispare
  if condition == Incompletable: markTargetInfeasible(pawn.job.target, 600 ticks)
  pawn.job = null

// ===== HOOK-URI OBLIGATORII =====
onEntityDestroyed(e): releaseAllClaims(byPawn = e.id); releaseAllForTarget(e.id)
onThingDestroyed(t):  releaseAllForTarget(t.id); invalidateJobsTargeting(t.id)
onCellBlocked(c):     invalidateReachabilityCache(regionOf(c))
onLoad():             for r in reservations:
                        if !alive(r.claimantId) or !exists(r.targetId): { drop(r); logWarn(r) }

// ===== INVARIANTI (build de debug, 1x/secunda) =====
assert forall r: alive(r.claimantId) and pawn(r.claimantId).job?.id == r.jobId
assert forall r: exists(r.targetId)
assert forall (target, layer): sum(count) <= capacity(target, layer)
assert forall (target, layer): distinctClaimants <= maxClaimants

// ===== HAULING: destinatie STRICT mai buna =====
function bestStoreFor(thing, from):
  cur = priorityOf(storeAt(thing.position))
  for group in storesByPriorityDesc():
     if group.priority <= cur: break             // <-- linia care opreste ping-pong-ul
     if c = closestFreeCell(group, from, thing): return c
  return null

// ===== DIAGNOSTIC: cauza se propaga din scanner =====
enum FailReason {
  LIPSA_MATERIAL,   // "Lipsa: 12 x lemn (0 pe harta)"
  INACCESIBIL,      // "20 x lemn exista, dar nu exista drum pana la ele"
  FARA_MUNCITOR,    // "Nimeni nu are Constructie activata (sau skill < 3)"
  PRIORITATE_JOASA, // "3 pioni pot, dar au Recolta la prioritate 1"
  REZERVAT          // "Rezervat de Ana (job #4711)"
}
- BUG-URI CLASICE CARE APAR DACĂ SARI PESTE REZERVĂRI (lista de verificat la fiecare regresie)
1. Doi haulieri pornesc după același stack: al doilea ajunge la o casetă goală, job failed, re-scan, iar pleacă — spam infinit de job-uri fără progres vizibil.
2. Doi constructori pe același blueprint: progres dublu (zidul apare instant) SAU dublu consum de material, în funcție de ordinea de aplicare.
3. Două job-uri de livrare pe același frame pentru același șantier: se consumă 2× materialele, stocul poate deveni negativ.
4. Pionul moare/e capturat cărând: rezervarea rămâne, obiectul devine „ocupat” pentru totdeauna, niciun mesaj — deadlock tăcut care supraviețuiește în save.
5. Obiectul e distrus în timpul drumului: job cu target null → fie crash la dereferențiere, fie un job care nu se termină niciodată.
6. Rezervarea eliberată pe pion, nu pe (pion, job): job-ul următor din coadă își pierde claim-ul și eșuează exact la execuție, nu la planificare — imposibil de reprodus fără coadă.
7. Lanț circular de rezervări între N pioni (cazul documentat Grant→Alice→Hugh→Todd→Lifter1): toți așteaptă, niciunul nu lucrează, toți par „ocupați”.
8. Verificare la scan dar rezervare la start, fără re-verificare: race garantat de îndată ce ai >1 fir SAU o coadă de job-uri; ești sigur că apare, doar nu știi când.
9. Rezervări nesalvate sau desincronizate la save/load: după încărcare ai claimant distrus și obiecte blocate permanent; fără validare la load nu afli niciodată.
10. Întrerupere (jucătorul dă ordin, pionul e atacat, e recrutat) fără cleanup: claim rămas + obiect rămas în mâini = duplicare sau dispariție de resurse.
11. Ping-pong de depozit fără regula „strict mai bun”: A→B→A la infinit, toată munca coloniei arsă pe cărat.
12. Bucla „10 job-uri într-un tick”: job A rezervă ceva ce invalidează condiția lui A; fără gardă, îți mănâncă frame-ul fără niciun mesaj de eroare.
13. maxClaimants ignorat: 8 pioni se înghesuie pe aceeași celulă de lucru, se blochează reciproc la pathfinding și niciunul nu ajunge.
14. stackCount ignorat: doi pioni rezervă „tot mormanul” de 200 de pietre, al doilea ajunge la 0 și eșuează, deși erau destule pentru amândoi.

