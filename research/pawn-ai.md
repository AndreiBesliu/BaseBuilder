# pawn-ai — AI-ul pionilor intr-un colony sim: model de decizie, nevoi, dispozitie, personalitate, programe si debugabilitate

## Rezumat

Am verificat in surse primare (cod decompilat RimWorld, wiki-uri oficiale de joc, documentatie de modding, GDC/Game Developer, Wikipedia) cum functioneaza efectiv AI-ul pionilor in genul asta, si concluzia principala contrazice folclorul: RimWorld NU este utility AI. Este un think tree de noduri sortate dupa o prioritate numerica grosiera, iar nevoile intra in decizie printr-un prag binar, nu printr-o curba - JobGiver_GetFood returneaza literal 9.5f cand foamea scade sub prag si 0f altfel, in timp ce munca in orarul "Work" returneaza 9f. Diferenta dintre "mananca" si "munceste" e 0.5 dintr-un numar hardcodat, nu o competitie de utilitati. Going Medieval merge si mai simplu: nu are mental breaks in stil RimWorld, ci un singur numar "mood" cu efecte in trepte, iar la 0 settlerul pleaca definitiv din asezare; personalitatea e insa mult mai bogata numeric (perk-uri cu "Mood Target" si "Mood Change Speed" separate, cost de generare in puncte, conflicte explicite intre perk-uri). Utility AI real (IAUS) exista si e bine documentat - considerations inmultite, response curves, inertia weight ca histereza - dar are doua costuri reale: scorul multiplicativ se prabuseste spre 0 cand adaugi considerations, si nu poti explica decizia fara un log per-candidat. GOAP e cel mai prost potrivit aici: in F.E.A.R. cu ~70 de goals si ~120 de actiuni planurile erau de 1-2 actiuni, deci ai platit un planner A* ca sa obtii ce iti da o lista ordonata. Partea scumpa in CPU nu e alegerea deciziei, ci scanarea tintelor (GenClosest.ClosestThing_Global peste candidati) si pathfinding-ul - la Dwarf Fortress pathfinding-ul e recunoscut ca principalul consumator de FPS. Bugetul de tick al RimWorld arata solutia: 60 ticks/secunda, dar nevoile si gandurile se recalculeaza pe "rare tick" (250 ticks = 4.16s) si "long tick" (2000 ticks = 33.3s). Pentru un dev solo pe TypeScript, recomandarea pentru v1 este think tree cu prioritati numerice + un strat subtire de utility DOAR pentru alegerea tintei (care pat, ce mancare, ce recreere), cu un decision log per pion ca feature de produs, nu ca unealta de debug. Utility AI complet, GOAP, si relatiile sociale complexe se amana pentru v2.

## Constatări (25)

### RimWorld nu foloseste utility AI, ci un think tree de noduri cu prioritati numerice grosiere, iar nevoile intra ca prag binar

- **Detaliu:** In codul decompilat, JobGiver_Work.GetPriority() returneaza valori fixe in functie de orarul pionului: TimeAssignmentDefOf.Work = 9f, Anything = 5.5f, Sleep = 3f, Joy = 2f. JobGiver_GetFood.GetPriority() nu are curba deloc: daca food.CurLevelPercentage < pawn.RaceProps.FoodLevelPercentageWantEat returneaza 9.5f, altfel 0f. Deci mancatul bate munca printr-o diferenta hardcodata de 0.5, nu printr-o competitie de scoruri. Nodurile de flux sunt ThinkNode_Priority (in ordine), ThinkNode_PrioritySorter (sortat dupa prioritatea copiilor), ThinkNode_Random, ThinkNode_Subtree, ThinkNode_Tagger.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/JobGiver_Work.cs si https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/JobGiver_GetFood.cs si https://github.com/CBornholdt/RimWorld-AI-Tutorial/wiki/Part-1---Introduction · încredere: ridicat
- **Implicație:** Nu construi utility AI pentru stratul de decizie in v1. Implementeaza o lista de JobProvider-e care returneaza null sau {job, priority:number}, sortate descrescator. Rezerva scorurile continue pentru selectia tintei, nu pentru alegerea activitatii.

### RimWorld are DOUA arbori de decizie: unul 'constant' evaluat foarte des si stateless, si unul principal evaluat cand pionul are nevoie de job nou

- **Detaliu:** Constant ThinkTree se verifica la fiecare 30 de ticks (0.5s la viteza 1) si contine reactii autonome: fuga de explozii, reactie la ostilitate. Documentatia cere explicit ca logica din el sa fie 'easily interruptible, preferably stateless'. Pionii drafted sar peste arborele constant, deci isi pierd autonomia. Peste arbori se pot suprapune 'Duties' - un ThinkTree plus o celula focus - care dau comportamente organizate temporar (caravane, ritualuri) fara sa modifice arborele static.
- **Sursă:** https://github.com/CBornholdt/RimWorld-AI-Tutorial/wiki/Part-1---Introduction · încredere: ridicat
- **Implicație:** Separa arhitectural 'reflexe' (tick des, fara stare, pot intrerupe orice job) de 'decizie de job' (tick rar, poate fi scumpa). Pune un al treilea nivel de 'duty/override' pe care il poate seta jucatorul sau un eveniment, ca sa nu ai nevoie sa modifici arborele ca sa faci o asediere sau o sarbatoare.

### Executia jobului e separata de decizie: Job -> JobDriver -> Toils, adica un state machine liniar per job, nu un behavior tree

- **Detaliu:** Pawn_JobTracker decide ce Job sa ruleze pe baza unui ThinkResult (care contine si nodul care a cerut jobul). Jobul e doar un container de date; JobDriver-ul il descompune in obiecte Toil executate secvential. WorkGiver_Scanner e specializarea care cauta tinte variabile (recoltare, constructie), spre deosebire de giver-ele cu tinta fixa.
- **Sursă:** https://github.com/roxxploxx/RimWorldModGuide/wiki/SHORTTUTORIAL:-How-Pawns-Think si https://github.com/CBornholdt/RimWorld-AI-Tutorial/wiki/Part-1---Introduction · încredere: ridicat
- **Implicație:** Nu folosi behavior trees pentru executie. Un JobDriver = generator/coroutine cu o lista de Toils si conditii de esec explicite per toil e mai simplu de scris in TypeScript si mult mai usor de serializat in save. ThinkResult trebuie sa retina NODUL care a cerut jobul - asta e cheia pentru UI-ul de 'de ce'.

### Costul real de CPU nu e decizia, ci scanarea tintelor si pathfinding-ul

- **Detaliu:** JobGiver_Work scaneaza candidatii cu GenClosest.ClosestThing_Global() sau ClosestThing_Global_Reachable(), cu raze hardcodate de 99999f (global) si 9999f (local) si cu un parametru LocalRegionsToScanFirst care limiteaza cate regiuni se cauta inainte de a extinde global. Fiecare candidat trece prin PawnCanUseWorkGiver(), giver.ShouldSkip(), giver.MissingRequiredCapacity() si IsForbidden(). La Dwarf Fortress, wiki-ul de framerate spune ca reducerea zonei pe care o cauta pathfinder-ul e principala parghie de performanta, iar cavernele sunt 'cel mai rau infractor'.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/JobGiver_Work.cs si https://dwarffortresswiki.org/index.php/DF2014:Maximizing_framerate · încredere: ridicat
- **Implicație:** Bugeteaza CPU pe scanare, nu pe model de decizie. Obligatoriu de la inceput: index spatial pe tip de resursa/job, cautare pe regiuni (flood-fill de conectivitate cache-uit) inainte de cautare globala, si un cache de reachability invalidat doar la modificarea hartii. Altfel orice model de decizie va parea 'lent', desi lent e scanner-ul.

### Bugetul de tick al RimWorld separa explicit tick normal, rare tick si long tick - asta face decizia accesibila pe hardware modest

- **Detaliu:** 60 ticks pe secunda reala la viteza 1. Rare tick = 250 ticks = 4.16 secunde. Long tick = 2000 ticks = 33.33 secunde. O zi = 60.000 ticks = 16 min 40 s reale. Vitezele sunt x1, x3, x6 si x15 (x15 doar in dev mode). La x6, un rare tick cade la ~0.7 secunde reale.
- **Sursă:** https://rimworldwiki.com/wiki/Time · încredere: ridicat
- **Implicație:** Fixeaza de la inceput trei rate: (a) fiecare tick - miscare, reflexe, intreruperi; (b) la 250 ticks - degradarea nevoilor si re-evaluarea deciziei, cu stagger pe pawnId % 250 ca sa nu cada toti in acelasi frame; (c) la 2000 ticks - recalcul de mood/thoughts, frumusetea camerei, confort. Nu recalcula mood-ul in fiecare tick; e cea mai comuna greseala de performanta.

### Mood-ul in RimWorld e un sistem cu doua valori: bara si tinta, iar bara se misca lent spre tinta cu rate asimetrice

- **Detaliu:** Mood 0-100%. Mood Target se recalculeaza instant din suma tuturor thoughts. Bara se misca spre tinta cu maximum +12 pe ora in-game cand creste si -8 pe ora cand scade. Mood-ul de baza depinde de dificultate: Peaceful/Community builder 42, Adventure story 37, Strive to survive 32, Blood and dust 27, Losing is Fun 22. Cat timp pionul doarme sau e inconstient bara sta pe loc si riscul de mental break e suspendat.
- **Sursă:** https://rimworldwiki.com/wiki/Mood · încredere: ridicat
- **Implicație:** Copiaza mecanica tinta-vs-bara: e singurul motiv pentru care jucatorul poate REACTIONA. Daca mood-ul ar sari instant, jucatorul nu ar avea fereastra de interventie. Rata asimetrica (urca mai repede decat coboara: +12/-8) e o decizie de indulgenta - alege constient directia. Suspendarea riscului in somn e si un fix de CPU si un fix de fairness.

### Pragurile de mental break sunt derivate matematic dintr-un singur stat, nu configurate separat

- **Detaliu:** Mental Break Threshold de baza = 35%. Pragul major = 4/7 din cel minor (20%), pragul extrem = 1/7 din cel minor (5%). Pragul minor e plafonat intre 1% si 50% indiferent de trasaturi. Frecventa: sub pragul minor, un break minor la o medie de 10 zile; sub cel major, la 3 zile; sub cel extrem, la 0.7 zile. Dupa break, pionul primeste +30 'Catharsis' timp de 3 zile, care se poate stivui de pana la 5 ori cu efecte descrescatoare.
- **Sursă:** https://rimworldwiki.com/wiki/Mental_break si https://rimworldwiki.com/wiki/Mood · încredere: ridicat
- **Implicație:** Un singur stat (breakThreshold) + doua rapoarte fixe = un singur numar de balansat per trasatura, nu trei. Implementeaza breakurile ca mean-time-between (MTB) cu roll pe rare tick, nu ca declansare deterministica - deterministic inseamna ca jucatorul optimizeaza pragul si mecanica moare. Catharsis stivuibil cu randament descrescator e anti-spirala obligatorie.

### Mental breaks sunt un catalog de stari cu durate si ponderi explicite, nu un singur 'pionul innebuneste'

- **Detaliu:** Trei severitati, fiecare cu propriul pool. Exemple minore: Food binge (commonality 0.8, recovery min 25.000 / max 45.000 ticks), Sad wander (0.5), Hide in room (0.5, cere camera atribuita). Majore: Social drug binge (1.0), Daze (min 70.000 / max 90.000 ticks), Tantrum (0.333), Targeted tantrum (0.333). Extreme: Berserk, Fire starting spree, Murderous rage, Given up and leaving. Fiecare break are preconditii (Food binge cere >10 nutritie umana in stoc; Hide in room cere dormitor). Jucatorul poate intrerupe prin arestare, cu risc de berserk, si primeste -6 'Was imprisoned' timp de 12 zile.
- **Sursă:** https://rimworldwiki.com/wiki/Mental_break · încredere: ridicat
- **Implicație:** Modeleaza breakurile ca DATE: {severitate, commonality, minTicks, maxTicks, precondition(pawn, colony), mentalStateDriver}. Fiecare break trebuie sa aiba o contra-masura pentru jucator si un cost pentru contra-masura. Un break fara preconditie duce la absurditati (tantrum in camera goala).

### Going Medieval a ales explicit alt model de consecinte: nu breakuri catalogate, ci refuz de ordine si plecare definitiva la mood 0

- **Detaliu:** Wiki-ul oficial spune direct: mood scazut => settlerii se revolta si refuza sa urmeze ordinele; daca mood-ul ajunge la 0, settlerul PLEACA din asezare. Moodleturile au valori si durate explicite: foame -2 / -5 / -15 / -20 (Slightly Hungry / Hungry / Ravenous / Starving), somn -2 / -8 / -20, temperatura -2 / -4 / -8 pe fiecare directie, 'Slept Outside' -7 timp de 12 ore, 'Friend Died' -25 timp de 128 ore, 'Initial Optimism' +25 timp de 180 ore. Impresionabilitatea camerei e tabelata in 8 trepte: 'Slept in own quarters' merge de la +12 (Palatial) la -4 (Awful).
- **Sursă:** https://goingmedieval.fandom.com/wiki/Mood · încredere: ridicat
- **Implicație:** Ai doua modele de pedeapsa la alegere si SE EXCLUD ca ton: catalog de breakuri (RimWorld - haos comic, povesti) sau refuz + dezertare (Going Medieval - presiune economica). Alege unul pentru v1. Dezertarea e mult mai ieftina de implementat si mult mai brutala ca feedback. 'Initial Optimism +25 pe 180 de ore' e un tampon de onboarding deliberat - copiaza-l, altfel primele ore de joc sunt o spirala.

### Going Medieval trateaza personalitatea ca un sistem de puncte cu conflicte explicite, nu ca etichete libere

- **Detaliu:** Fiecare perk are un 'Creation Cost' pozitiv sau negativ (Benevolent +18, Ravishing +17, Erudite +16, Dullard -13, Ascetic -13, Moribund -10) si o lista de perk-uri cu care intra in conflict (Churl vs Congenial/Outgoing/Benevolent). Perk-urile modifica stats numite explicit: 'Mood Target' si 'Mood Change Speed' sunt DOUA stats separate (Churl: Mood Target -20%, Mood Change Speed +10%; Congenial: Mood Target +15%, Mood Change Speed -15%), la fel 'Sleep Recovery Speed' si 'Sleep Depletion Speed' (Early Bird: +45% / +25%; Night Owl: +25% / -15%).
- **Sursă:** https://goingmedieval.fandom.com/wiki/Settlers · încredere: ridicat
- **Implicație:** Expune ca stats modificabile exact perechile astea: mood target vs viteza de schimbare a mood-ului, si viteza de refacere vs viteza de consum pentru fiecare nevoie. Asa o trasatura devine un delta pe doua numere, nu cod special. Costul in puncte + conflictele iti dau gratis atat generarea de personaje echilibrate, cat si un editor de personaje pentru jucator.

### Pasiunea/preferinta de munca e cel mai eficient generator de atasament raportat la efortul de implementare

- **Detaliu:** RimWorld: fara pasiune = 35% multiplicator de XP; 'Interested' (o flacara) = 100% XP si +8 mood in timpul muncii respective; 'Burning' (doua flacari) = 150% XP si +14 mood. Exista si un soft cap de 4000 XP net pe zi pe skill, peste care castigul se inmulteste cu 20%. Going Medieval: preferintele merg de la 'resentful' 0.2x XP, 'unwilling' 0.5x, la 'eager' 2.5x si 'passionate' 4x, pe 14 skill-uri de la nivel 0 la 50 (350 XP pentru nivel 1, pana la 8000 XP pentru nivel 50).
- **Sursă:** https://rimworldwiki.com/wiki/Skills si https://goingmedieval.fandom.com/wiki/Settlers · încredere: ridicat
- **Implicație:** Implementeaza pasiunea inainte de relatii sociale. Doua numere per pereche (pion, skill) - multiplicator XP si bonus de mood - creeaza deja tensiune de alocare ('cel mai bun bucatar uraste sa gateasca'). Soft cap-ul pe XP zilnic previne grinding degenerat si e o linie de cod.

### Trasaturile trebuie sa fie putine per pion si mutual exclusive pe axe, altfel spatiul de balans explodeaza

- **Detaliu:** In RimWorld, cei mai multi oameni au 1-3 trasaturi plus eventual o trasatura de sexualitate; adultii nu pot castiga sau pierde trasaturi. Exista 'spectrum traits' - axe pe care doar o valoare poate exista simultan: Drug desire, Industriousness, Speed, Base mood, Nerves, Neurotic, Shooting accuracy, Beauty, Psychic sensitivity, Immunity. Copiii pot capata o trasatura noua la momentele de crestere (7, 10, 13 ani).
- **Sursă:** https://rimworldwiki.com/wiki/Traits · încredere: ridicat
- **Implicație:** Limiteaza la 2-3 trasaturi per pion si organizeaza-le pe axe exclusive. 'Axa' este si mecanism de balans (o singura valoare activa) si de generare (alegi un punct pe axa, nu o multime). Trasaturile imutabile la adulti sunt o decizie de design pro-atasament: pionul nu poate fi 'reparat', deci trebuie acceptat sau pierdut.

### Orarul zilnic e implementat ca praguri diferite pe nevoi, nu ca o interdictie de activitati

- **Detaliu:** In RimWorld, fiecare ora din 24 primeste o eticheta, iar eticheta schimba PRAGURILE: 'Anything' - munceste daca recreere >35%, mancare >30%, odihna >30%; 'Work' - munceste pana cand mancarea scade sub 30%, ignora complet somnul si recreerea; 'Recreation' - se recreeaza pana la 95%; 'Sleep' - doarme daca odihna <75%, se trezeste daca mancarea scade sub 12.5%. Daca odihna ajunge la 0, pionul adoarme pe loc indiferent de orar si se trezeste la 20%. Pionii TERMINA task-ul curent inainte sa reciteasca orarul. Daca nu trece niciun test, pionul devine 'Idle' si hoinareste in zone cu temperatura sigura.
- **Sursă:** https://rimworldwiki.com/wiki/Menus (sectiunea Schedule) · încredere: ridicat
- **Implicație:** Orarul ca set de praguri e mult mai ieftin decat orarul ca masina de stari si produce comportament mai bun (pionul nu abandoneaza un job la fix ora 18:00). Obligatoriu: o stare 'Idle' vizibila si un colaps fortat cand nevoia atinge 0, altfel jucatorul poate crea pioni care nu dorm niciodata. 'Termina task-ul curent' inseamna ca task-urile trebuie sa aiba durata marginita - altfel un job lung blocheaza reactia la orar.

### Prioritatile manuale de munca sunt sursa numarul unu de 'AI-ul decide prost' perceput de jucator, si e o consecinta matematica, nu un bug

- **Detaliu:** RimWorld: mod manual cu prioritati 1 (max) la 4 (min); la prioritate egala castiga coloana din stanga; si, critic, 'toata munca de o prioritate se face inainte de urmatoarea'. Wiki-ul da exemplul explicit: daca Hauling e pe 1, pionul va cara fiecare obiect, inclusiv cele de la jumatatea hartii, inaintea oricarui alt task - 'nu tin cont deloc de eficienta'. Oxygen Not Included are 5 niveluri de prioritate plus Disabled, cu sub-prioritati 1-9 pe cladire, si un toggle optional de 'Proximity' care schimba tie-break-ul pe distanta.
- **Sursă:** https://rimworldwiki.com/wiki/Work si https://oxygennotincluded.wiki.gg/wiki/Priority · încredere: ridicat
- **Implicație:** Prioritatea lexicografica pura produce comportament pe care jucatorul il citeste ca prostie. Solutia nu e sa strici ordinea, ci sa expui un tie-break configurabil (distanta / skill / urgenta) ca in ONI, si sa arati in UI ce tie-break a decis. Alternativ: ponderare prioritate x (1 - distanta normalizata) - dar atunci trebuie sa afisezi ambii termeni, altfel ai facut AI-ul mai destept si mai neexplicabil.

### Sapiens comprima controlul la maximum: pana la 5 roluri per sapien, si nevoi reduse la hrana, adapost si divertisment

- **Detaliu:** Wiki-ul jocului spune ca un individ dintr-un trib poate avea maximum cinci roluri atribuite, ca rolurile sunt abilitati care trebuie INVATATE, ca anumite categorii (gravide, copii, batrani) nu pot invata anumite roluri, si ca trasaturile cu care se naste un sapien influenteaza cat de repede invata. Nevoile listate sunt hrana, adapost si divertisment (ultimul doar in anumite cazuri), si determina productivitatea.
- **Sursă:** https://sapiens.fandom.com/wiki/Sapien si https://sapiens.fandom.com/wiki/Roles · încredere: mediu
- **Implicație:** Exista un cadran intreg al genului la capatul opus RimWorld: in loc de 20+ tipuri de munca x 4 prioritati per pion, ai maximum 5 roluri per pion, deci un plafon dur pe micromanagement. Daca tinta e 'open world + colonie mare', modelul cu plafon de roluri scaleaza mult mai bine ca UI si ca CPU. Alege inainte sa scrii decizia, pentru ca schimba complet ecranul de management.

### Dwarf Fortress leaga nevoile de performanta de munca, nu de breakdown - alt model de consecinta, mai putin punitiv

- **Detaliu:** Wiki-ul listeaza ~24-30 de nevoi (Socialize, Alcohol, Prayer, Occupation, Creativity, Excitement, Learning, Family, Craftsmanship, Martial Arts, Wandering, Abstract Thinking etc.). Nevoile se rezuma intr-un 'focus' procentual cu sapte trepte: Very Focused 140%+, Quite Focused 120-139%, Focused 101-119%, Untroubled 100%, Unfocused 81-99%, Distracted 61-80%, Badly Distracted <=60%. Efectul: un pitic foarte concentrat primeste pana la +50% skill efectiv, unul grav distras pana la -50%. Ce nevoi are un pitic depinde de trasaturile de personalitate, cu ponderi de 1, 2, 5 sau 10.
- **Sursă:** https://dwarffortresswiki.org/index.php/Need · încredere: ridicat
- **Implicație:** Nevoile derivate din personalitate (nu un set fix pentru toata lumea) sunt mai ieftin de facut decat pare: o nevoie = {id, greutate derivata din trasaturi, rata de decadere, ce o satisface}. Un pion fara greutate pe o nevoie nici nu o ticaie - castig direct de CPU. Efect +/-50% pe skill in loc de mental break e o alternativa mult mai putin frustranta si complet compatibila cu un joc de constructie.

### Utility AI real (IAUS) e bine definit, dar scorul multiplicativ si lipsa de explicabilitate sunt costuri masurabile

- **Detaliu:** IAUS: fiecare 'consideration' ia un singur input, il clampeaza intre Minimum si Maximum si il trece printr-o response curve. Scorurile tuturor considerations dintr-un behavior se INMULTESC, apoi se inmultesc cu 'Initial Weight'. 'Inertia Weight' nu e inertie fizica, ci un cooldown: comportamentul curent primeste un bonus care descreste in timp, ca sa nu oscileze. Contexts = tinta evaluata (self / friendly / neutral / hostile), evaluate combinatoric. Consecinta aritmetica directa a inmultirii: 6 considerations cu 0.9 fiecare dau 0.53; 10 dau 0.35 - adaugarea unei considerations scade TOATE scorurile acelui behavior.
- **Sursă:** https://github.com/ProjectBorealis/IAUS/wiki si https://en.wikipedia.org/wiki/Utility_system · încredere: ridicat
- **Implicație:** Daca folosesti utility, foloseste-l doar acolo unde ai un set FIX si mic de considerations (2-4) - tipic selectia tintei. Nu construi un utility global cu zeci de considerations per actiune: vei petrece mai mult timp renormalizand decat proiectand. Inertia weight / histereza e obligatorie oriunde folosesti scoruri continue, altfel pionii oscileaza intre doua actiuni cvasi-egale.

### GOAP e cel mai prost raport cost/beneficiu pentru genul asta - dovada vine chiar din jocul care l-a facut celebru

- **Detaliu:** F.E.A.R. avea ~70 de goals si ~120 de actiuni, dar planurile efective erau 'de obicei 1-2 actiuni lungime, cu doar cateva ajungand la 3 sau 4'. Castigul real nu a fost planificarea, ci reducerea masinii de stari de la 80+ stari (stil Half-Life) la trei: GoTo, Animate, UseSmartObject. Un cost ascuns documentat: sobolanii replanificau continuu chiar si departe de jucator, generand overhead constant.
- **Sursă:** https://www.gamedeveloper.com/design/building-the-ai-of-f-e-a-r-with-goal-oriented-action-planning · încredere: ridicat
- **Implicație:** Nu implementa GOAP in v1. Daca planurile tale sunt oricum de 1-2 pasi (ia unealta -> taie copac), o lista ordonata de JobProvider-e da acelasi rezultat cu 5% din efort si 100% explicabilitate. Ce merita IMPRUMUTAT din GOAP: reducerea executiei la un numar mic de primitive reutilizabile (GoTo / PlayAnimation / UseObject), ceea ce e exact modelul Toil.

### Behavior trees sunt potrivite pentru executie reactiva, nu pentru selectia dintre zeci de activitati concurente

- **Detaliu:** Semantica BT: radacina trimite 'ticks' cu o anumita frecventa; fiecare nod returneaza running, success sau failure; Selector ia primul copil care reuseste, Sequence cere ca toti sa reuseasca in ordine. Avantajele declarate sunt modularitatea, scalabilitatea, reutilizabilitatea si usurinta de vizualizare/testare/debug. Sistemele de utilitate cer mai putina autorare manuala decat BT, pentru ca prioritizarea 'se aranjeaza singura' din scoruri in loc sa fie scrisa explicit.
- **Sursă:** https://en.wikipedia.org/wiki/Behavior_tree_(artificial_intelligence,_robotics_and_control) si https://en.wikipedia.org/wiki/Utility_system · încredere: ridicat
- **Implicație:** Daca vrei BT, foloseste-l ca inlocuitor pentru JobDriver (executia unui job, cu esecuri si reintrari), NU ca selector global de activitati. Un Selector cu 30 de copii este exact acelasi lucru cu o lista ordonata de prioritati, doar mai greu de citit intr-un fisier de date.

### Jocul poate explica jucatorului DE CE un pion nu face ceva prin optiuni dezactivate cu motiv explicit - RimWorld are deja un dictionar intreg de motive

- **Detaliu:** In codul de generare a meniului contextual exista chei de traducere pentru motivele de refuz, printre care: NoPath, CannotGoNoPath, Incapable, CannotMissingHealthActivities, IsIncapableOfViolenceLower, CannotPrioritizeForbidden, CannotPrioritizeForbiddenOutsideAllowedArea, CannotPrioritizeCellForbidden, CannotPrioritizeWorkTypeDisabled, CannotPrioritizeNotAssignedToWorkType, CannotPrioritizeWorkGiverDisabled, TooHeavy, NoPrisonerBed, CannotGenericAlreadyAm.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/FloatMenuMakerMap.cs · încredere: ridicat
- **Implicație:** Fiecare predicat care poate respinge un job trebuie sa returneze un obiect {ok:false, reasonKey, params}, nu un boolean. Asta e o decizie de API pe care o iei O SINGURA DATA, la inceput; retrofitat pe 40 de predicate e zile de munca. Meniul contextual afiseaza optiunea gri cu motivul, in loc sa o ascunda - ascunderea optiunii e cel mai rau UI posibil, pentru ca jucatorul nu stie daca e bug sau regula.

### RimWorld isi expune deja rationamentul in dev mode, inclusiv pentru sisteme netransparente ca storyteller-ul

- **Detaliu:** Development mode contine: 'draw paths' (deseneaza unde paseaza fiecare pion/animal/inamic), 'Write Storyteller' care adauga in scrisoarea de raid TOATE datele de calcul al punctelor, 'considerations' si rezultatele, Tweak Values (valori ajustabile live legate de actiuni AI, gameplay, UI, performanta), un Inspector, si autopause la eroare. Setarile de view NU se salveaza intre sesiuni.
- **Sursă:** https://rimworldwiki.com/wiki/Development_mode · încredere: ridicat
- **Implicație:** Construieste de la inceput un 'decision log' per pion: ring buffer cu ultimele N decizii, fiecare cu lista de candidati, scorul/prioritatea fiecaruia si motivul respingerii pentru cei respinsi. Expune-l ca TAB in panoul pionului, nu ca unealta de dev - jucatorii de colony sim il vor folosi, si iti rezolva simultan suportul si debug-ul. Deseneaza calea pionului selectat by default, nu doar in dev mode.

### Nevoile sunt putine si ierarhizate, iar cele exotice sunt conditionate de trasaturi - nu toti pionii au toate nevoile

- **Detaliu:** RimWorld: nevoi universale Food si Rest; doar la oameni Recreation, Beauty, Comfort, Outdoors. Indoors apare si INLOCUIESTE Outdoors doar pentru pionii cu trasatura Undergrounder sau cu precept ideologic corespunzator. Chemical apare doar la trasaturile Chemical interest / Chemical fascination. Learning doar la copii, Play doar la bebelusi. Dependentele de droguri devin nevoi noi si dispar complet dupa dezintoxicare.
- **Sursă:** https://rimworldwiki.com/wiki/Needs · încredere: ridicat
- **Implicație:** Setul minim viabil pentru v1: hrana, odihna, recreere, confort, temperatura (ca stare, nu bara). Igiena si social se amana - sunt cele mai scumpe ca implicatii sistemice (instalatii, camere, interactiuni). Nevoile trebuie sa fie o lista dinamica per pion, nu campuri fixe pe struct: asa poti adauga nevoi din trasaturi/ideologie fara sa atingi bucla de tick.

### UI-ul de nevoi al RimWorld comunica viitorul, nu doar prezentul, si asta e mecanismul de avertizare timpurie

- **Detaliu:** Bara de mood/frumusete/confort are un triunghi alb care arata unde se va STABILIZA valoarea daca situatia nu se schimba; daca triunghiul e in interiorul barei, valoarea scade, daca e in afara, creste. Marcajele negre (hatch marks) de pe bare sunt pragurile la care apare un thought nou. Pe bara de mood, marcajele sunt exact pragurile de mental break minor/major/extrem. Barele de hrana, odihna si recreere NU au triunghi, pentru ca oricum scad spre zero. Alertele de tip 'colonistul e pe cale sa cedeze' apar in coltul dreapta sus.
- **Sursă:** https://rimworldwiki.com/wiki/Needs si https://rimworldwiki.com/wiki/User_interface · încredere: ridicat
- **Implicație:** Copiaza integral tiparul: valoare curenta + tinta proiectata + marcaje de prag pe ACEEASI bara. E cel mai ieftin sistem de avertizare posibil (zero logica noua, doar randare) si elimina nevoia de notificari agresive. Regula: daca o valoare are praguri, pragurile se deseneaza pe bara.

### Rezervarea tintelor este o cerinta arhitecturala, nu o optimizare - fara ea N pioni se duc la acelasi obiect

- **Detaliu:** Validarea candidatilor in JobGiver_Work include verificari de forbidden si de capacitate inainte de a accepta tinta, iar motivul de refuz 'reserved' apare explicit in dictionarul de motive al meniului contextual. In Oxygen Not Included, nevoile personale (baie, mancare, somn) ocolesc intotdeauna sistemul de prioritati, cu exceptia starii Red Alert care forteaza ignorarea nevoilor de baza.
- **Sursă:** https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/JobGiver_Work.cs si https://oxygennotincluded.wiki.gg/wiki/Priority · încredere: mediu
- **Implicație:** Implementeaza un ReservationManager global (target -> pawnId, cu eliberare la finalizarea/abandonarea jobului si la load) inainte de a scrie al doilea JobProvider. Adauga din start conceptul de 'override global' (alarma/urgenta) care suspenda prioritatile - se adauga usor acum, greu mai tarziu. Am marcat mediu pentru ca nu am citit clasa de rezervari in sine, doar consecintele ei.

### Costul de implementare al modelelor difera cu un ordin de marime pentru un dev solo

- **Detaliu:** Estimare proprie, calibrata pe structurile vazute in surse: (a) think tree cu prioritati numerice + JobProvidere - ~15-25 de fisiere mici, fiecare JobProvider 30-80 linii, debugabil prin citirea listei; (b) utility AI cu considerations si curbe - in plus fata de (a): editor de curbe, normalizare, histereza, si un sistem de logging per-candidat OBLIGATORIU, altfel nu poti balansa; (c) GOAP - in plus: modelarea starii lumii ca set de predicate, A* peste stari, si costuri per actiune care trebuie tinute consistente global; (d) behavior trees pentru selectie globala - efort mediu, dar arborele devine ilizibil peste ~30 de frunze.
- **Sursă:** memorie (estimare proprie), calibrata pe https://raw.githubusercontent.com/josh-m/RW-Decompile/master/RimWorld/JobGiver_Work.cs si https://github.com/ProjectBorealis/IAUS/wiki · încredere: scazut
- **Implicație:** Alege (a) pentru v1 si lasa portile deschise: interfata JobProvider sa returneze {job, priority} unde priority POATE fi calculat de o functie de utilitate mai tarziu. Migrarea de la prioritati constante la prioritati scorate e locala per provider, deci reversibila.

## Implicații de design

- Decizia se face pe trei rate de tick, nu pe una: reflexe la fiecare tick, alegere de job la ~250 ticks (cu stagger pe pawnId), recalcul de mood/thoughts la ~2000 ticks. Asta e diferenta dintre 20 si 200 de pioni.
- Modelul de decizie v1 = lista ordonata de JobProvidere cu prioritate numerica. Nevoile intra ca praguri care ridica prioritatea peste cea a muncii (ex: mancare 9.5 vs munca 9.0), nu ca scoruri continue care concureaza.
- Utility (scoruri continue) se foloseste DOAR la selectia tintei in interiorul unui job deja ales: care pat, ce mancare, ce activitate de recreere. Acolo ai 2-4 considerations, deci nu suferi de prabusirea multiplicativa.
- Fiecare predicat de respingere returneaza un motiv structurat {ok:false, reasonKey, params}, nu boolean. Asta e decizia de API cu cel mai mare efect pe termen lung asupra debugabilitatii.
- Panoul pionului primeste un tab 'Ratiune' cu ultimele N decizii: job ales, prioritate, candidati respinsi si motivul fiecaruia. E feature de produs, nu unealta de dev.
- Fiecare bara de nevoie deseneaza pragurile si, unde are sens, tinta proiectata. Jucatorul trebuie sa vada viitorul valorii, nu doar valoarea.
- Mood = doua valori (tinta instant, bara lenta) cu rate asimetrice de urcare si coborare, plus suspendare in somn. Fara asta, jucatorul nu are fereastra de reactie.
- Consecinta la mood scazut: alege UN model. Catalog de breakuri (RimWorld) sau refuz de ordine + dezertare la 0 (Going Medieval). Al doilea e semnificativ mai ieftin si mai lizibil.
- Personalitatea se exprima ca delte pe stats deja existente (mood target, viteza de schimbare a mood-ului, viteza de consum/refacere per nevoie, multiplicator XP per skill), nu ca ramuri de cod. Cu cost in puncte si conflicte explicite.
- Nevoile sunt o lista dinamica per pion, derivata din trasaturi, nu campuri fixe. Un pion care nu are o nevoie nu o ticaie deloc.
- Orarul zilnic se implementeaza ca set de praguri pe nevoi, per interval orar, nu ca masina de stari. Pionul termina jobul curent inainte sa reciteasca orarul, deci jobele trebuie sa aiba durata marginita.
- Rezervarea tintelor si un mecanism de 'alarma' care suspenda prioritatile se pun in arhitectura de la al doilea JobProvider, nu dupa.
- Costul dominant e scanarea tintelor si pathfinding-ul: index spatial pe tip de job, cautare pe regiuni inainte de cea globala, cache de reachability invalidat la modificarea hartii.
- Plafoneaza micromanagementul explicit: fie prioritati per tip de munca (RimWorld/ONI), fie un numar maxim de roluri per pion (Sapiens). Alegerea schimba tot ecranul de management, deci se face inainte de cod.

## Riscuri

- Prioritatea lexicografica pura produce comportament pe care jucatorul il citeste ca prostie (exemplul din wiki-ul RimWorld: Hauling pe prioritate 1 => pionul cara un obiect de la jumatatea hartii inaintea oricarui alt task, 'fara niciun respect pentru eficienta'). Semnal de alarma: jucatorii cer 'sa nu mai fie prosti' in loc sa ceara feature-uri noi.
- Scorul multiplicativ din utility AI se prabuseste cand adaugi considerations - 6 considerations la 0.9 dau 0.53, 10 dau 0.35. Semnal de alarma: adaugi o consideration nedureroasa si TOATE comportamentele acelei categorii dispar din selectie.
- Oscilatia intre doua actiuni cvasi-egale la scoruri continue. Fara histereza/inertia weight, pionul comuta de zeci de ori pe secunda si arata rupt. Semnal de alarma: animatii care se reseteaza, pioni care se intorc din drum.
- Recalcularea mood-ului/thoughts pe fiecare tick in loc de long tick. Semnal de alarma: profilul arata timp in agregarea de moodlets, iar FPS-ul scade liniar cu numarul de pioni chiar cand nimeni nu se misca.
- Predicate care returneaza boolean. Semnal de alarma: primul ticket de forum 'pionul meu nu vrea sa construiasca' pe care nu-l poti diagnostica fara sa pui breakpoint. Retrofitarea motivelor pe zeci de predicate e munca de zile.
- Mental breaks fara preconditii produc absurditati (tantrum intr-o camera goala, food binge fara mancare in stoc). Semnal de alarma: breakuri care se termina instant sau care nu au nicio consecinta vizibila.
- Spirala de mood: un break scade mood-ul celorlalti, care declanseaza alte breakuri. RimWorld o opreste cu +30 Catharsis pe 3 zile, stivuibil de max 5 ori cu randament descrescator. Semnal de alarma: o colonie sanatoasa colapseaza total in <2 zile de joc dupa un singur eveniment.
- Lipsa unei stari 'Idle' vizibile. Daca pionul nu gaseste nimic de facut si sta pur si simplu, jucatorul presupune bug. Semnal de alarma: 'pionii mei stau degeaba' fara ca jucatorul sa poata spune de ce.
- Nevoi prea multe prea devreme (Dwarf Fortress are ~24-30). Fiecare nevoie in plus inmulteste combinatiile de balans si adauga cost de tick. Semnal de alarma: petreci mai mult timp tunand rate de decadere decat construind continut.
- Trasaturi care nu sunt organizate pe axe exclusive: doua trasaturi care ating acelasi stat in directii opuse produc pioni nuli sau rupti. Semnal de alarma: generatorul de personaje scoate combinatii pe care trebuie sa le interzici manual, una cate una.
- Pathfinding-ul pe o harta open world fara limitare de zona - la Dwarf Fortress e recunoscut ca principalul consumator de FPS. Semnal de alarma: timpul de frame creste cand DESCHIZI zone noi, nu cand adaugi pioni.
- Ascunderea optiunilor imposibile din meniul contextual in loc sa le afisezi gri cu motiv. Jucatorul nu poate distinge regula de bug. Semnal de alarma: intrebari repetate despre lucruri care functioneaza conform designului.

## Întrebări deschise

- Cate entitati vii trebuie sa sustina jocul simultan la 60 FPS pe hardware modest? Raspunsul schimba totul: sub ~50 de pioni orice model merge; peste ~200 trebuie sa treci pe model tip Sapiens (roluri plafonate) sau pe simulare in loturi, si nu mai poti permite un decision log complet per pion.
- Harta e 3D voxel cu mai multe niveluri (ca Going Medieval) sau 2D pe grila? Pathfinding-ul multi-nivel cu scari si acoperisuri e cel mai mare risc tehnic nementionat in prompt si el dicteaza bugetul disponibil pentru AI-ul de decizie.
- Care e modelul de control ales: prioritati per tip de munca per pion (RimWorld/ONI, micromanagement mare) sau plafon de roluri per pion (Sapiens, control comprimat)? Nu am gasit o sursa care sa masoare care model retine mai bine jucatorii - trebuie decis din tonul jocului, nu din date.
- Se doreste ca pionii sa aiba relatii intre ei in v1? Am evitat subiectul pentru ca in RimWorld relatiile sunt cel mai mare generator de moodleturi (ex: 'Friend Died' -25 timp de 128 de ore in Going Medieval) si deci si cel mai mare risc de spirala; merita cercetat separat.
- Nu am putut confirma din sursa primara 'compensation factor'-ul din IAUS al lui Dave Mark (formula care corecteaza prabusirea multiplicativa) - manualele de pe gameai.com sunt incomplete public, iar prezentarea GDC 2013 e in spatele GDC Vault. Daca se merge vreodata pe utility, asta trebuie verificat inainte.
- Nu am gasit devlog-uri tehnice ale Foxy Voxel despre AI sau pathfinding (devlog-urile lor publice de pe itch.io se opresc in 2019 si acopera terenul si backstory-urile); tot ce am despre Going Medieval vine din date de joc extrase in wiki. Steam news e blocat pentru fetch - merita deschis manual daca se cauta detalii de implementare.
- Nu am putut extrage detalii despre arhitectura Lua interna a Sapiens (modulele de AI/ordine/planificare). Documentatia oficiala confirma ca peste jumatate din cod e Lua si poate fi supraincarcat, deci scripturile din GameResources sunt lizibile pe disc - o instalare a jocului ar da raspunsuri directe despre cum decide un sapien.
- Ce se intampla noaptea ca CONTINUT, nu ca mecanica? Am gasit mecanica (orar, praguri, colaps la 0 odihna), dar nu si un exemplu bun de joc din gen care sa faca noaptea interesanta in loc de o pauza de 8 ore accelerate - merita o cercetare dedicata.

## Recomandări

- V1: think tree cu prioritati numerice (model RimWorld), nu utility AI si categoric nu GOAP. Structura concreta: (1) arbore 'reflex' evaluat des, stateless, care poate intrerupe orice (foc, atac, prabusire de epuizare); (2) lista de JobProvidere, fiecare returneaza null sau {job, priority:number, reason}, sortata descrescator; (3) executie ca lista de Toils cu conditii de esec per toil. Justificare: dovezile din cod arata ca insusi RimWorld functioneaza asa (Work=9, Anything=5.5, Sleep=3, Joy=2; GetFood=9.5 binar), iar F.E.A.R. a demonstrat ca planurile reale sunt de 1-2 pasi, deci planificarea nu se plateste. Un dev solo pe TypeScript poate citi si depana o lista ordonata; nu poate depana un spatiu de scoruri fara sa construiasca mai intai uneltele.
- Scrie contractul de respingere INAINTE de primul JobProvider: type Refusal = {ok:false, reasonKey:string, params?:Record<string,unknown>}. Toate verificarile (reachability, rezervare, interdictie, capacitate, skill, zona permisa) il returneaza. Din el ies gratuit: meniul contextual cu optiuni gri motivate, tab-ul 'Ratiune' din panoul pionului, si logurile de suport.
- Implementeaza decision log per pion (ring buffer de ~20 de decizii) ca feature vizibil pentru jucator, nu ca dev tool. Fiecare intrare: timestamp, job ales, prioritate, si lista candidatilor respinsi cu reasonKey. Asta rezolva simultan cea mai mare frustrare a genului si 80% din propriul debug.
- Fixeaza bugetul de tick de la inceput: 60 ticks/s; nevoi si re-decizie la 250 ticks cu stagger pe pawnId; mood/thoughts/frumusete camera la 2000 ticks. Adauga un contor vizibil in dev overlay pentru 'decizii pe secunda' si 'candidati scanati pe decizie' - astea doua numere iti spun cand ai nevoie de optimizare, inainte sa scada FPS-ul.
- Set minim de nevoi pentru v1: hrana, odihna, recreere, confort, temperatura (ca stare/hediff, nu bara). Igiena, social si nevoile derivate din trasaturi se amana. Implementeaza-le ca lista dinamica per pion (id, greutate, rata de decadere, satisfactori), ca sa poti adauga nevoi din trasaturi fara sa atingi bucla de tick.
- Mood cu doua valori (tinta instant din suma moodleturilor, bara care urmareste tinta cu rate asimetrice), suspendat in somn. Praguri derivate dintr-un singur stat, ca in RimWorld (major = 4/7 din minor, extrem = 1/7 din minor), ca sa balansezi UN numar per trasatura. Deseneaza cele trei praguri pe bara.
- Pentru consecinta la mood scazut in v1 alege modelul Going Medieval: trepte de refuz (lucreaza mai incet -> refuza ordine specifice -> refuza orice -> pleaca la 0), plus 2-3 stari scurte de tip 'wander' si 'hide'. Catalogul complet de mental breaks (tantrum, berserk, incendiere, food binge, murderous rage) se amana pentru v2, cand ai deja preconditii si contra-masuri.
- Personalitate v1: 2-3 trasaturi per pion, organizate pe axe mutual exclusive, cu cost in puncte si conflicte declarate in date. Efectele se exprima OBLIGATORIU ca delte pe stats existente: moodTargetOffset, moodChangeSpeedMult, needDecayMult[need], needRestoreMult[need], xpMult[skill], workSpeedMult. Zero cod special per trasatura.
- Pasiunile inainte de relatii sociale. Doua numere per (pion, skill): multiplicator XP si bonus de mood in timpul muncii. Calibrare de pornire pe modelul RimWorld (fara pasiune 35% XP, pasiune 100% si +8 mood, pasiune arzatoare 150% si +14 mood) cu un soft cap zilnic de XP ca sa blochezi grindingul degenerat.
- Orarul ca praguri per interval orar, cu minimum trei etichete: Orice / Munca / Somn. Adauga colapsul fortat cand odihna ajunge la 0 si trezirea la ~20%, plus o stare Idle explicita cu iconita. Fara colaps fortat, jucatorii vor construi pioni care nu dorm niciodata.
- Construieste ReservationManager si un flag global de 'alarma' (suspenda prioritatile normale) inainte de al doilea JobProvider. Amandoua sunt de cateva ore acum si de saptamani mai tarziu.
- Pentru scanare: index spatial per tip de job + regiuni de conectivitate precalculate, cu cautare 'local regions first' si abia apoi globala, exact ca LocalRegionsToScanFirst din RimWorld. Cache de reachability invalidat doar la modificarea hartii. Bugeteaza asta ca prima optimizare, nu ca ultima.
- Tie-break configurabil de catre jucator (prioritate / distanta / skill), ca toggle-ul de Proximity din Oxygen Not Included, si AFISAT in decision log. Face AI-ul sa para mai destept fara sa-l faca mai opac.
- Amana explicit pentru v2: utility AI complet cu editor de curbe; GOAP; relatii sociale si opinii intre pioni; nevoi de igiena si social; catalogul complet de mental breaks; mostenirea trasaturilor la copii; AI de tribiuri/factiuni autonome. Fiecare dintre ele presupune ca ai deja decision log si motive structurate - construieste-le pe alea intai.

