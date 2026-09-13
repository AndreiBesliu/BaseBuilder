# ocupare-exclusiva — Ocuparea exclusivă a celulei într-un colony sim pe grilă multi-z: ce câștigi, ce plătești și cum rezolvi deadlock-ul

## Rezumat

Verificarea directă a surselor răstoarnă premisa implicită a brief-ului: niciunul dintre jocurile de referință nu are ocupare cu adevărat exclusivă. Dwarf Fortress permite explicit suprapunerea („dwarves can walk over each other... much slower"), iar wiki-ul oficial recomandă coridoare de minimum 2 tiles și interzicerea ușilor și scărilor singulare pe rutele aglomerate; RimWorld folosește Cost_PawnCollision = 175 (ridicat de la 100 în Alpha 17); Factorio a ELIMINAT coliziunea între biteri în FFF-316 tocmai pentru că grupurile se înfundau la contactul cu baza („mating dance"), păstrând doar o logică de separare vizuală. Jocurile care chiar au coliziune tare pe grilă — Age of Empires II și They Are Billions — plătesc cu 25 de ani de reclamații despre blocaje la porți și pile-up-uri, dar câștigă real valoare tactică (Titans blochează ziduri, turnurile astupă goluri de 1 tile). Pe partea de algoritm, WHCA* / tabelele de rezervare spațiu-timp sunt prea scumpe pentru bugetul cerut: Silver raportează, la fereastră W=16 și 100 de agenți, inițializare sub 100 ms și cost continuu de până la ~50 ms, adică exact un tick întreg la 20 Hz. Alternativa corectă e PIBT (priority inheritance with backtracking), care planifică un singur pas pe tick și atinge 0.021 s de timp de răspuns la 8000 de agenți — aproximativ 2.6 µs/agent/pas, deci circa 0.1 ms pentru 40 de pioni. Capcana care decide arhitectura e garanția lui PIBT, formulată verbatim pe condiția ca orice pereche de noduri adiacente să aparțină unui ciclu simplu (graf biconex): un colony sim e plin de fundături — dormitoare, galerii de mină, depozite — deci garanția cade și trebuie completată cu detectarea punctelor de articulație și un token pe ramura înfundată. Interacțiunea cu lumea modificabilă e a doua sursă majoră de bug-uri, dar nu e o problemă de coliziune: bug-ul din Going Medieval e auto-demolarea scării de la mijloc de către propriul settler (estimări comunitare ~80%, nu 100%, și ~5% înainte de reworkul de pathing), iar în ONI un path precalculat invalidat face dupii să oscileze pe scară până mor. În fine, valoarea tactică a coridorului de 1 tile nu vine din corpuri care blochează: în Dwarf Fortress vine din poduri mobile, capcane, plăci de presiune și fortificații, deci se poate obține integral fără exclusivitate.

## Brief

OCUPARE EXCLUSIVĂ — ce cumperi, ce plătești.

NIMENI din referințe nu o are cu adevărat. DF, wiki verbatim: „It is possible for entities such as dwarves to walk over each other... much slower"; sfat oficial: rute ≥2 tiles, „avoid single doors and single stairs". RimWorld: Cost_PawnCollision=175 (era 100 până în Alpha 17). Factorio a ELIMINAT coliziunea între biteri (FFF-316) din cauza „mating dance"-ului la contactul cu baza, păstrând doar separation logic vizuală. Cu coliziune reală: AoE2 (blocaje cronice la porți/monahi/siege pe gap de 2) și They Are Billions (pile-up-uri, dar Titans și turnurile de 1 tile blochează real).

ALGORITM: NU WHCA*. Silver: W=16, 100 agenți → init <100 ms, cost continuu până la ~50 ms = un tick întreg la 20 Hz. PIBT (Okumura, IJCAI-19 / AIJ-22) planifică UN singur pas: 8000 agenți → 0.021 s răspuns (~2.6 µs/agent/pas) → 40 agenți ≈ 0.1 ms. Rezolvă push (priority inheritance) și rotații (cicluri) fără tabel de rezervări persistent. CBS e optimal dar se măsoară cu timeout de 30 s — exclus.

CAPCANA CARE DECIDE ARHITECTURA: garanția PIBT e verbatim „all agents are guaranteed to reach their destination within a finite time when the environment is a graph such that all pairs of adjacent nodes belong to a simple cycle (e.g., biconnected)". Colony sim = fundături peste tot (dormitor, galerie, depozit) → garanția CADE. Necesar: puncte de articulație precalculate + token pe ramura înfundată. Fără asta, 40 de agenți spre o cameră 3x3 = blocaj permanent. Extensiile PIBT-TP / PIBT-TP-TA tratează exact „zonă biconexă + arbori atașați".

LUME MUTABILĂ: bug-ul Going Medieval NU e coliziune — settlerul își demolează singur scara de la mijloc și se zidește (surse: ~80%, NU 100%; ~5% înainte de reworkul de pathing). ONI: path precalculat invalidat → dupe oscilează pe scară până moare. Concluzie: rezervările trăiesc UN tick (PIBT le are gratis), iar o comandă de demolare nu poate viza celula-suport a propriului agent.

CHOKEPOINT: valoarea nu vine din corpuri. În DF vine din poduri mobile, capcane, plăci de presiune, fortificații. Tactică de coridor FĂRĂ exclusivitate e posibilă.

MULTI-Z: ONI rezolvă scara bidirecțională cu DOUĂ transporturi unidirecționale (stâlp jos +400%, scară sus).

## Constatari (22)

### Dwarf Fortress NU are ocupare exclusivă — creaturile se pot suprapune, dar cu penalizare mare de viteză

- **Detaliu:** Wiki-ul oficial, verbatim: „It is possible for entities such as dwarves to walk over each other when necessary. However, moving over occupied tiles in this manner is much slower, and dwarves will try to path so that they avoid it." Și: „If you have a long, 1-tile wide corridor which already has a dwarf moving through it, other dwarves ... will try to avoid colliding with that dwarf, by pathing elsewhere" — ceea ce poate produce „a very significant increase in pathfinding burden". Sfatul oficial de design: „it's best to make high-traffic routes at least 2 tiles wide, and avoid single doors and single stairs." Pagina de wiki NU conține cuvântul „crawl" și nu dă cifre de penalizare.
- **Sursa:** https://dwarffortresswiki.org/index.php/DF2014:Path (WebFetch direct, citat verbatim) · incredere: ridicat
- **Implicatie:** Modelul DF nu e „exclusiv" ci „exclusiv pentru modul rapid de mișcare": un singur agent merge normal pe celulă, restul degradează. E o a treia opțiune, ieftină, între RimWorld (suprapunere liberă) și exclusivitate tare — și e cea care păstrează senzația de aglomerare fără să genereze deadlock.

### Varianta „un singur dwarf merge pe picioare per celulă, restul se târăsc" e o afirmație de sursă secundară, nu de wiki-ul de pathfinding

- **Detaliu:** Rezultatele de căutare pe tema scărilor formulează: „Only one dwarf is allowed to walk on each tile at a time, so if too many dwarves are trying to squeeze through the same passage, all the extra ones must crawl instead of walking" și „dwarves that overlap have to literally crawl over/under each other". Pagina DF2014:Path, verificată direct, nu folosește termenul. Cele două formulări sunt compatibile, dar nu am confirmare primară pentru mecanica de crawl.
- **Sursa:** Rezumate de căutare peste dwarffortresswiki.org/index.php/DF2014:Stairs și discuții Steam; contrazis parțial (prin omisiune) de DF2014:Path verificat direct · incredere: scazut
- **Implicatie:** Dacă vrei să copiezi modelul „walk/crawl", tratează-l ca ipoteză de design proprie, nu ca pe o mecanică DF documentată. Merită prototipată separat.

### RimWorld: Cost_PawnCollision = 175, ridicat de la 100 în Alpha 17

- **Detaliu:** Constanta apare în Verse.AI/PathFinder.cs (versiune decompilată, repo RW-Decompile). Changelog-ul Alpha 17 consemnează creșterea de la 100 la 175. E un cost aditiv în A*, nu o interdicție: pionul preferă un ocol de ~175 unități de cost în loc să treacă peste un alt pion, dar trece dacă nu are alternativă.
- **Sursa:** https://github.com/josh-m/RW-Decompile/blob/master/Verse.AI/PathFinder.cs + pastebin cu changelog-ul Alpha 17 (surse neoficiale, decompilare) · incredere: mediu
- **Implicatie:** 175 e ordinul de mărime al unui ocol de ~17 celule pe teren normal. Dacă adopți costul soft în loc de exclusivitate, ăsta e punctul de plecare pentru calibrare — și e un număr pe care îl poți muta din JSON.

### Factorio a ELIMINAT deliberat coliziunea între unități (biteri) din cauza blocajelor, păstrând doar separarea vizuală

- **Detaliu:** FFF-316 („Non-colliding Biters", oct. 2019): când biterii se mișcau în grup mergea bine, dar la contactul cu baza fiecare pathfinda individual, „each biter would find a path, but then encounter another biter in the way, trying to move and turn around, only to find more biters blocking them, causing everything to get clogged up" — problema numită de dev „mating dance". Soluția: „simply not make biters collide with other biters", descrisă ca „a rather simple change in the engine". Au păstrat „existing 'separation' logic in the engine to keep biters from getting too close to each other, so they gained the benefit of no collisions without the problem of biters infinitely stacking". FFF-317, verificat direct, confirmă schimbarea în treacăt dar NU dă motivația și NU conține cifre de performanță.
- **Sursa:** https://www.factorio.com/blog/post/fff-316 (via rezumat de căutare) + https://factorio.com/blog/post/fff-317 (WebFetch direct) · incredere: ridicat
- **Implicatie:** Cel mai puternic contraargument la decizia owner-ului, venit de la un studio cu obsesie pentru performanță. Dar oferă și compromisul: separarea logică (coliziune) de cea vizuală. Poți avea agenți care NU se blochează logic, dar care se resping vizual, deci arată ca și cum s-ar înghesui.

### Age of Empires II are coliziune tare între unități și plătește cu blocaje cronice, nerezolvate în 25 de ani

- **Detaliu:** Reclamații recurente pe forumuri oficiale și AoEZone: unități care se blochează reciproc și nu se mai mișcă până la ordin manual, pile-up-uri de trade carts la porți, formularea comunității fiind că unitățile „would rather spend an eternity bumping into each other at a chokepoint than figuring out a convention for getting around each other" — cazuri citate: monahi la poartă, siege pe gap de 2 tiles. Un patch de Definitive Edition a fost raportat ca înrăutățind coliziunea („units getting stuck inside each other more frequently").
- **Sursa:** forums.ageofempires.com (thread-uri Report a Bug), aoezone.net, Steam Community AoE2 DE — consens de forum, nu declarație de developer · incredere: mediu
- **Implicatie:** Dovada că problema nu se rezolvă cu buget mare și 25 de ani. Dacă mergi pe exclusivitate, algoritmul de rezolvare a conflictelor trebuie să fie o decizie de arhitectură din săptămâna 1, nu un patch ulterior.

### They Are Billions: coliziunea tare pe grilă produce simultan frustrare de micro ȘI valoare tactică reală

- **Detaliu:** Comunitatea are thread-uri intitulate direct „Unit collision is bad" — unitățile se împing și se blochează la repoziționare, mai ales când scoți arcașii din linia întâi. În același timp: Titans au collision box mare și pot bloca o secțiune expusă de zid; turnurile sunt late de 1 tile și pot astupa goluri de 1 tile, cu unități înăuntru ca turn improvizat. Ghidurile de chokepoint spun însă că un chokepoint prea îngust e contraproductiv: „You can't get overlapping turrets in a 2-4 wide choke, or in the case of 1 wide chokes, any turrets at all."
- **Sursa:** steamcommunity.com/app/644930 — discuții „Unit collision is bad", „Choke point discussion", „What makes a good chokepoint?" · incredere: mediu
- **Implicatie:** Confirmă că exclusivitatea CUMPĂRĂ ceva tactic real. Dar nuanța contra-intuitivă contează: coridorul de 1 tile nu e optimul tactic, pentru că nu-ți lasă loc de apărare. Sistemul tău de fortificație trebuie proiectat pentru chokepoint-uri de 2-4 tiles, nu de 1.

### Valoarea tactică a chokepoint-ului în Dwarf Fortress vine din conținut (poduri, capcane, fortificații), NU din corpuri care blochează

- **Detaliu:** Un pod mobil ridicat funcționează ca zid și sigilează pasajul; podurile sunt construcții indestructibile. Tipare documentate: două poduri la capetele unui coridor pentru a zidi inamicul; poduri care se ridică față în față cu plăci de presiune care aruncă inamicul, cu podea deasupra ca să-l amețească; hol de 1 tile cu capcane și pod care forțează un singur traseu; coridor de înălțime 2 cu fortificații de unde trag arbaletrierii.
- **Sursa:** dwarffortresswiki.org/index.php/Defense_guide, DF2014:Bridge, pcgamer.com ghid de drawbridge · incredere: ridicat
- **Implicatie:** Poți livra 90% din fantezia de fortificație FĂRĂ ocupare exclusivă: ușă/poartă cu stare, pod mobil, capcană pe celulă, fortificație cu linie de vedere asimetrică. Asta permite tratarea exclusivității ca pe o decizie de senzație, nu ca pe o precondiție a design-ului tactic.

### WHCA* / tabelele de rezervare spațiu-timp sunt prea scumpe pentru un tick de 20 Hz ca mecanism PRINCIPAL

- **Detaliu:** Silver („Cooperative Pathfinding", AIIDE 2005) introduce CA*, HCA* și WHCA*. Numerele raportate: ferestre de 8, 16 și 32 au cost continuu similar, dar cost inițial crescător cu fereastra; la W=16, 100 de agenți se inițializează în sub 100 ms, cu un cost continuu maxim de circa 50 ms. Spațiul de stări per invocare de Space-Time A* e O(W · |V|).
- **Sursa:** ojs.aaai.org/index.php/AIIDE/article/view/18726 (Silver, Cooperative Pathfinding) via rezumate de căutare; cifrele repetate consistent în mai multe rezumate · incredere: mediu
- **Implicatie:** Un tick la 20 Hz are 50 ms în total. Costul continuu de ~50 ms la 100 de agenți înseamnă că doar pathfinding-ul ar consuma tot tickul. Scalat liniar la 40 de agenți ≈ 20 ms, adică 40% dintr-un tick — încă inacceptabil ca mecanism de bază. WHCA* rămâne util doar ca fallback rar, pe cerere, nu pe fiecare pas.

### PIBT (Priority Inheritance with Backtracking) e algoritmul potrivit: un singur pas pe tick, cost sub-milisecundă

- **Detaliu:** Okumura et al., IJCAI-19 și Artificial Intelligence 2022. Dă fiecărui agent o prioritate unică la fiecare tick; agenții cu prioritate mică pot MOȘTENI temporar prioritatea celor pe care îi blochează (rezolvă push-ul), iar backtracking-ul rezolvă blocajele rămase. Planifică recursiv o singură configurație următoare, greedy și miop. Cifre raportate: timp de răspuns 0.021 s pe un scenariu de depozit cu 8000 de agenți (≈2.6 µs/agent/pas); diferențele între strategii de tiebreak rămân sub 10 ms în absolut chiar și la mii de agenți; variante recente păstrează eficiența „sub-millisecond" a PIBT original.
- **Sursa:** ijcai.org/proceedings/2019/0076.pdf (metadate), sciencedirect.com/science/article/pii/S0004370222000923, github.com/Kei18/pibt2, arxiv.org/abs/2505.12623 (cifra 8000 agenți / 0.021 s) · incredere: mediu
- **Implicatie:** La 40 de agenți costul e ~0.1 ms pe tick, adică 0.2% dintr-un tick de 50 ms. Argumentul de performanță împotriva exclusivității DISPARE complet. Rămâne doar argumentul de corectitudine (fundăturile) și cel de UX.

### Garanția PIBT cade exact pe topologia unui colony sim: fundăturile

- **Detaliu:** Formularea verbatim de pe pagina proiectului: „all agents are guaranteed to reach their destination within a finite time when the environment is a graph such that all pairs of adjacent nodes belong to a simple cycle (e.g., biconnected)." Literatura ulterioară e explicită: „PIBT is only applicable to environments that are modeled as a bi-connected area, and if it contains dead-ends, such as tree-shaped paths, PIBT may cause deadlocks" și „these assumptions can be violated in dense warehouse layouts with single-agent-width aisles, dead-end workstations, or tree-like guidepaths." Extensii existente: PIBT with Temporary Priority (PIBT-TP) și varianta Temporary Avoidance (PIBT-TP-TA), care tratează „a biconnected main area with attached trees under additional restrictions".
- **Sursa:** https://kei18.github.io/pibt2/ (WebFetch direct, citat verbatim) + arxiv.org/abs/2205.12504 (PIBT-TP) · incredere: ridicat
- **Implicatie:** ASTA e constrângerea de arhitectură, nu performanța. Un dormitor, o galerie de mină, un depozit cu o singură ușă sunt toate frunze de arbore. Trebuie să calculezi punctele de articulație ale grafului de navigație și să pui un token de capacitate pe fiecare ramură înfundată. E o structură care oricum îți trebuie pentru graful de camere (temperatura + izolație) — deci costul marginal e mic.

### Push and Swap e INCOMPLET; Push and Rotate îl corectează, dar tratează doar doi agenți odată

- **Detaliu:** Push and Rotate (de Wilde, ter Mors, Witteveen, JAIR vol. 51) e complet pentru instanțe cu cel puțin două vârfuri libere, folosind operațiile push, swap și rotate; extinde Push and Swap (Luna & Bekris), „which was shown to be incomplete". Critica de calitate: „Push and Swap and Push and Rotate algorithms treat only two agents at a time which results in inferior solution quality". CGA-MAPF (IJCAI 2025) generalizează evacuând mai mulți agenți dintr-un coridor simultan.
- **Sursa:** ifaamas.org/Proceedings/aamas2013/docs/p87.pdf, jair.org/index.php/jair/article/view/10913, ijcai.org/proceedings/2025/0028.pdf · incredere: mediu
- **Implicatie:** Nu implementa „push and swap" naiv din memorie — versiunea intuitivă e demonstrat incompletă. Condiția „cel puțin două vârfuri libere" e violată exact în cazul tău cel mai prost: coridor plin de 1 tile. PIBT e alegerea mai bună pentru că nu cere completitudine globală, doar progres.

### TSWAP (schimbarea țintelor, nu a pozițiilor) rezolvă gratis o clasă mare de conflicte de colony sim

- **Detaliu:** Mecanism documentat: „A deadlock occurs when a loop sequence of agents is formed such that each agent's next vertex in their shortest path is currently occupied by the next agent in the sequence. If a deadlock is detected, the targets of the agents within the sequence are rotated." Se aplică la agenți neetichetați (unlabeled / anonymous).
- **Sursa:** arxiv.org/pdf/2408.14948 (Decentralized Unlabeled MAPF via Target and Priority Swapping) · incredere: mediu
- **Implicatie:** Într-un colony sim o mare parte din scopuri SUNT anonime: „mănâncă la orice masă liberă", „dormi în orice pat liber al tău", „cară în orice celulă liberă de stivă", „ia orice buștean din grămadă". Pentru aceste scopuri poți schimba ținta în loc să rezolvi coliziunea — cea mai ieftină soluție din tot raportul. Modelează scopurile ca mulțimi de celule acceptabile, nu ca o celulă unică, din prima zi.

### Coridoarele cu sens unic sunt o soluție documentată, iar ONI o livrează ca piesă de conținut („Duplicant Checkpoint")

- **Detaliu:** Literatura de navigație densă: „restrict any narrow passage to single direction traffic at any given time. An agent whose path traverses a passageway can reserve it for unidirectional travel on reaching a certain radius around the entry. Other agents can traverse the reserved corridor provided its traversal direction aligns with the reserved traversal direction." În ONI, Duplicant Checkpoint e o clădire de automatizare care „only control[s] movement in one direction", formează cozi (combinat cu plăci de greutate / senzori) și — citat de wiki — „Using Checkpoints prevents breaking pathfinding", spre deosebire de ușile pneumatice.
- **Sursa:** arxiv.org/pdf/2202.11334 (Voronoi/congestion replanning) + oxygennotincluded.wiki.gg/wiki/Duplicant_Checkpoint · incredere: mediu
- **Implicatie:** Două lucruri: (a) rezervarea de coridor e mecanismul tehnic corect pentru ramurile înguste; (b) îl poți expune și ca UNEALTĂ DE JUCĂTOR (marcaj de sens unic), transformând o constrângere de algoritm într-o decizie de layout — exact genul de adâncime pe care o vrea un base builder complex.

### Bug-ul „scara demolată sub agent" din Going Medieval nu e un bug de coliziune, iar reproductibilitatea nu e 100%

- **Detaliu:** Rapoartele Steam descriu altceva decât premisa brief-ului: settlerul coboară scara ca să o demoleze de jos și „deconstruct[s] the stairs and ramps in the middle of the object causing them to be trapped". Estimările comunitare se contrazic: un raport spune „closer to 80% certain that the settler will trap themselves", altul spune că înainte de reworkul de pathing „this wouldn't happen, or if it did it was extremely rare, like 5% of the time". Dezvoltatorii au confirmat indirect prin patch notes: AI-ul de construcție/demolare ar trebui să facă „situations where they trap themselves, getting stuck or making unreachable objects due to deconstruction orders, a rarer occurrence".
- **Sursa:** steamcommunity.com/app/1029780 (thread-uri Bugs/Issues despre deconstrucția scărilor) + patch notes Going Medieval · incredere: mediu
- **Implicatie:** Corectează premisa: problema e că AGENTUL MODIFICĂ GRAFUL PE CARE STĂ, nu că doi agenți se ceartă pe o celulă. Regula de arhitectură: o sarcină de demolare trebuie să rezerve și celula-suport a executantului, iar un agent nu poate începe o demolare care i-ar distruge propria rută de ieșire. Verifică asta cu un test headless dedicat, nu cu ochiul.

### Invalidarea unui path precalculat poate produce livelock LETAL, nu doar ineficiență

- **Detaliu:** În ONI, rapoartele descriu dupii care „get stuck in infinite loops, such as switching back and forth from ladders until they die", declanșat când „a precalculated path is broken during base rebuilding or rearrangement". Definiția formală din literatura MAPF: „An agent is in livelock if it is blocked on a finite set of paths. In this case the agent can locally move switching between those paths, but it will never reach its final node." Replanificarea selectivă (doar agenții afectați de obstacol) reduce runtime-ul de planificare cu aproximativ 35-79% față de replanificarea completă.
- **Sursa:** forums.kleientertainment.com + steamcommunity.com/app/457140 (rapoarte de bug ONI); arxiv.org/pdf/1101.2270 (definiția livelock); pubmed.ncbi.nlm.nih.gov/42451381 (replanificare selectivă) · incredere: mediu
- **Implicatie:** Argument decisiv pentru PIBT peste WHCA*: PIBT nu ține rezervări pe termen lung, deci nu are ce să invalideze. Ruta A* devine un simplu HINT advisory, nu un angajament. Ai nevoie de un detector de livelock (agent care n-a scăzut distanța-la-țintă în N tickuri → replanifică + jitter + log în sistemul de erori).

### Multi-z: ONI rezolvă conflictul de scară bidirecțională dând DOUĂ transporturi unidirecționale

- **Detaliu:** Stâlpul de pompieri (Fire Pole) coboară cu 400% din viteza unei scări pentru un dup cu Atletism 0, dar urcă cu 75% mai încet decât scara. Pathfinder-ul exploatează asta automat: „If both a ladder and fire pole are available to reach an area, a duplicant will prioritize using the pole to descend and prioritize the ladder to ascend." Viteza de coborâre pe stâlp nu e afectată de Atletism. În Dwarf Fortress, scările nu blochează mișcarea, dar ambuteiajele apar, iar soluția comunitară e scara 2x2 sau 3x3.
- **Sursa:** oxygennotincluded.wiki.gg/wiki/Fire_Pole + dwarffortresswiki.org/index.php/DF2014:Stairs · incredere: ridicat
- **Implicatie:** Soluția cea mai ieftină pentru „doi agenți pe aceeași scară în direcții opuse" nu e algoritmică, e de conținut: două piese de traversare verticală cu costuri asimetrice. Rezolvă problema prin A*, fără niciun cod de coliziune. Include perechea scară/tobogan (sau scară/frânghie) în lista de clădiri din prototip.

### CBS (Conflict-Based Search) e exclus pentru un tick de 20 Hz

- **Detaliu:** CBS e algoritmul de referință pentru MAPF OPTIMAL, pe două niveluri: alege un conflict și îl rezolvă prin constrângeri. Benchmark-urile îl măsoară așa: se pornește cu doi agenți și se adaugă câte unul până când instanța nu mai e rezolvabilă „in under 30 seconds", cu limită de timp de 30 de secunde per instanță. Studiile citate simulează 4, 6, 8 și 10 agenți.
- **Sursa:** sciencedirect.com/science/article/pii/S0004370214001386 (Sharon et al., CBS) + arxiv.org/html/2408.09028v1 · incredere: ridicat
- **Implicatie:** Când literatura îți măsoară scalabilitatea în „câți agenți înainte să depășească 30 s", nu e un algoritm de gameplay. Nu-l pune nici măcar ca fallback.

### „Autostrăzile" de trafic (highways / guidance graph) sunt versiunea modernă a designărilor de trafic din DF și dau +40% throughput

- **Detaliu:** DF are patru niveluri de trafic cu costuri exacte per tile pentru A*: high = 1, normal (implicit) = 2, low = 5, restricted = 25. Sfatul de optimizare: marchezi „freeways" între uși în camerele mari și marchezi zonele moarte ca low/restricted ca să nu le scaneze pathfinder-ul degeaba. În literatura de lifelong MAPF, tehnicile de optimizare a fluxului „reduce the sum-of-costs by 10-20% in one-shot MAPF and improve throughput in lifelong MAPF by up to 40%, all while maintaining the sub-millisecond computational efficiency of the original PIBT algorithm."
- **Sursa:** dwarffortresswiki.org/index.php/DF2014:Traffic + arxiv.org/pdf/2505.12623 și arxiv.org/pdf/2304.04217 (highways for lifelong MAPF) · incredere: mediu
- **Implicatie:** Costurile 1/2/5/25 sunt un punct de plecare calibrat de 20 de ani de joc — pune-le în JSON. Iar faptul că highway-urile se combină cu PIBT păstrându-i costul sub-milisecundă îți dă o pârghie de tuning ieftină și o unealtă de jucător aproape gratuită.

### RimWorld demonstrează că sistemul de regiuni/reachability e obligatoriu ÎNAINTE de orice A*

- **Detaliu:** Ludeon (blog oficial, 2013): problema clasică e că A* scanează toată harta când nu există drum. Soluția: index de regiuni, iar colonistul verifică întâi dacă indexul regiunii lui se potrivește cu al destinației. Cifre: pe o hartă 200×200 toate regiunile se regenerează în circa 5.5 ms; impactul în cel mai rău caz al pathfinding-ului propriu-zis e „in the tens of milliseconds". Un mod de caching a redus efortul pathfinder-ului de patru ori prin (de)înregistrarea pionilor doar la schimbarea regiunii.
- **Sursa:** https://ludeon.com/blog/2013/07/reachability-at-last/ (blog oficial Ludeon) · incredere: ridicat
- **Implicatie:** Harta ta e 256×256×12 = 786.432 celule, adică de ~20x mai mare decât 200×200 = 40.000. Regenerarea completă în stil RimWorld ar costa ~100 ms — de două ori un tick întreg. Regenerarea TREBUIE să fie incrementală, pe chunk-uri (ex. 16×16×1), cu buget fix de chunk-uri per tick. Ăsta e cel mai probabil blocaj de performanță al proiectului, NU coliziunea.

### Precedent de „ejectare" când un agent ajunge într-o stare imposibilă

- **Detaliu:** În Prison Architect, comunitatea raportează că motorul a fost schimbat astfel încât „entities now can free themselves whenever they got stuck in a wall" — o supapă deliberată împotriva blocării permanente. Nu am găsit o sursă primară care să confirme dacă Prison Architect are sau nu ocupare exclusivă.
- **Sursa:** forums.introversion.co.uk + steamcommunity.com/app/233450 (discuții de comunitate) · incredere: scazut
- **Implicatie:** Chiar și cu un algoritm corect, ai nevoie de o supapă de ultimă instanță: un agent blocat peste N tickuri e teleportat în cea mai apropiată celulă liberă accesibilă, cu un rând în jurnalul de erori. Fără supapă, o singură combinație neprevăzută îți omoară salvarea jucătorului.

### Songs of Syx sugerează coliziune SOFT (încetinire), nu exclusivitate, și scalează prin viteza pathfinder-ului

- **Detaliu:** Devlog-ul dezvoltatorului menționează un pathfinder nou de două ori mai rapid, testat pe o așezare de 28.000, cu creștere de x3 pe CPU de laptop și plan teoretic de x5-x6 prin threading. O notă de design: subiecții au fost împiedicați să folosească camerele interioare ca scurtături pentru că „it could look odd and lead to more collisions with others, slowing them down".
- **Sursa:** songsofsyx.itch.io/songs-of-syx/devlog + itch.io/devlog/1087635/collisions-and-pathfinding · incredere: scazut
- **Implicatie:** Formularea „more collisions ... slowing them down" e incompatibilă cu exclusivitatea tare (acolo coliziunea blochează, nu încetinește). Dacă vrei certitudine, ăsta e singurul devlog care merită citit integral înainte de a scrie documentul de arhitectură.

### Nu am putut confirma dacă duplicanții din ONI se ciocnesc între ei

- **Detaliu:** Două căutări țintite nu au produs nicio sursă primară sau de wiki care să afirme sau să nege coliziunea dupe-dupe. Wiki-ul confirmă doar geometria: un duplicant e înalt de două celule și lat de una, și „act[s] as a tile ABOVE them, but not on any of their inside tiles".
- **Sursa:** oxygennotincluded.wiki.gg/wiki/Movement_%26_Reach — absența informației, nu prezența ei · incredere: scazut
- **Implicatie:** Nu construi niciun argument pe ONI ca exemplu de ocupare exclusivă. Dacă e important pentru document, se verifică în 5 minute în joc, nu prin research.

## Implicatii de design

- SEPARĂ coliziunea LOGICĂ de cea VIZUALĂ, din prima zi. Factorio a eliminat coliziunea logică între biteri dar a păstrat logica de separare ca să nu se stivuiască infinit vizual. Nucleul tău de simulare poate ține exclusivitate strictă (o celulă = un agent) în timp ce randarea interpolează pozițiile — sau invers, dacă prototipul arată că exclusivitatea strictă e prea fragilă, poți relaxa DOAR nivelul logic fără să schimbe nimic vizual. Contractul dintre cele două straturi trebuie definit înainte de prima linie de cod.
- MODELEAZĂ SCOPURILE CA MULȚIMI DE CELULE, nu ca o celulă unică. „Mănâncă la orice masă liberă", „cară în orice celulă liberă de stivă", „ia orice buștean din grămadă" — pentru aceste scopuri conflictul se rezolvă prin schimbarea țintei (TSWAP), care e gratuită, nu prin coordonare de traiectorii, care e scumpă. Asta acoperă probabil 70% din traficul unui colony sim și trebuie să fie în structura de date a sarcinii, nu adăugată ulterior.
- REZERVĂ CELULA-DESTINAȚIE LA ATRIBUIREA SARCINII, nu la sosire. Capcana celor 40 de agenți care converg spre o cameră 3x3 nu e o problemă de pathfinding, e o problemă de alocare de sarcini: dacă sistemul de sarcini nu poate atribui aceeași celulă-destinație la doi agenți, 39 din cele 40 de conflicte nu se nasc niciodată. Rezervările de destinație sunt persistente (pe durata sarcinii); rezervările de traiectorie NU trebuie să existe deloc.
- CALCULEAZĂ PUNCTELE DE ARTICULAȚIE ale grafului de navigație și tratează ramurile înfundate ca resurse cu capacitate. Garanția PIBT e valabilă doar pe graf biconex; un colony sim e un nucleu biconex cu zeci de arbori atașați (dormitoare, galerii, depozite). Fiecare ramură înfundată primește un token de capacitate egală cu numărul de celule libere din ea, minus 1. Structura se suprapune peste graful de camere pe care oricum îl construiești pentru temperatură și izolație — deci refolosește aceeași descompunere.
- GRAFUL DE NAVIGAȚIE TREBUIE SĂ FIE INCREMENTAL, PE CHUNK-URI. RimWorld regenerează regiunile unei hărți 200×200 în 5.5 ms; harta ta are de ~20x mai multe celule (786.432), deci o regenerare completă ar depăși un tick de 50 ms. Chunk de 16×16×1, dirty flags, buget fix de chunk-uri procesate per tick, cu coadă de priorități. Ăsta e blocajul real de performanță al proiectului, nu coliziunea.
- RUTA A* E UN HINT, NU UN ANGAJAMENT. Stratul de rezolvare a coliziunilor (PIBT) trebuie să poată muta agentul pe ORICE vecin legal, preferând doar nodul următor de pe rută. Dacă agentul refuză să iasă de pe rută, reintroduci exact clasa de bug-uri din ONI (oscilație pe scară până la moarte) și AoE2 (unități care se lovesc la poartă la nesfârșit).
- PRIORITATEA TREBUIE SĂ FIE DINAMICĂ, altfel omori pioni. PIBT recalculează prioritatea în fiecare tick, crescând-o cu timpul scurs de la ultima atingere a țintei și resetând-o la sosire. Cu prioritate statică pe ID, același pion cedează mereu, nu ajunge niciodată la masă și moare de foame — un bug care apare abia după ore de joc și e imposibil de reprodus fără harness headless.
- O SARCINĂ DE DEMOLARE TREBUIE SĂ REZERVE CELULA-SUPORT A EXECUTANTULUI. Bug-ul din Going Medieval nu e de coliziune: settlerul își demolează singur scara de sub picioare. Regula: un agent nu poate începe o demolare care ar face propria poziție curentă inaccesibilă. E o verificare de conectivitate pe graf, ieftină dacă ai deja regiuni.
- PIESELE DE TRAVERSARE VERTICALĂ ASIMETRICE REZOLVĂ MULTI-Z FĂRĂ COD. ONI face stâlpul de coborâre de 4x mai rapid decât scara la coborâre și cu 25% mai lent la urcare; pathfinder-ul alege singur sens unic pe fiecare. Include perechea în lista de clădiri din prototip — e mai ieftin decât orice algoritm de arbitraj pe scară.
- EXPUNE DESIGNĂRILE DE TRAFIC CA UNEALTĂ DE JUCĂTOR, cu costurile DF (high=1, normal=2, low=5, restricted=25) în JSON. Sunt calibrate de 20 de ani de joc, dau jucătorului adâncime reală de layout și, în literatura de lifelong MAPF, „autostrăzile" cresc throughput-ul cu până la 40% păstrând costul sub-milisecundă al PIBT.
- ADAUGĂ MARCAJ DE SENS UNIC pe coridoare, ca piesă de conținut (poartă/checkpoint). E soluția tehnică documentată pentru pasajele înguste ȘI e livrată deja de ONI ca Duplicant Checkpoint, cu nota explicită de wiki că „prevents breaking pathfinding" spre deosebire de uși. Transformă o constrângere de algoritm într-o decizie interesantă de jucător.
- PROIECTEAZĂ FORTIFICAȚIA PENTRU CHOKEPOINT-URI DE 2-4 TILES, nu de 1. Ghidurile They Are Billions spun explicit că într-un choke de 1 tile nu încape nicio turelă, iar în 2-4 nu se pot suprapune. Coridorul de 1 tile e o fantezie de deadlock, nu de apărare — valoarea tactică vine din poartă, capcană, fortificație cu linie de vedere asimetrică și pod mobil, exact ca în Dwarf Fortress.

## Riscuri

- RISC #1 — Fundăturile anulează garanția algoritmului. PIBT garantează progresul doar pe graf biconex. Un colony sim generează fundături continuu, iar jucătorul le creează fără să știe (sapă o galerie, construiește un dormitor cu o ușă). Fără garda pe puncte de articulație, blocajele apar aleator, în saves de zeci de ore, imposibil de reprodus. Mitigare: token per ramură + test headless care generează layout-uri aleatoare cu fundături și verifică progresul tuturor agenților în N tickuri.
- RISC #2 — Nedeterminism strecurat prin ordinea de iterare. PIBT depinde de o ordine de prioritate; dacă ordinea vine dintr-un Map/Set cu ordine de inserție sau dintr-un tiebreak pe float, două rulări cu același seed divergează și harness-ul headless devine inutil exact când ai mai multă nevoie de el. Mitigare: cheie de sortare formată exclusiv din întregi (prioritate_scalată, agentId), sortare stabilă, ZERO float în comparație, plus un test care rulează 10.000 de tickuri de două ori și compară hash-ul stării.
- RISC #3 — Un agent imobilizat pe o celulă de articulație oprește jumătate de colonie. Cu ocupare exclusivă, un pion care doarme, mănâncă sau execută o animație blocantă într-o ușă e un zid. Mitigare: flag „deplasabil" pe fiecare stare de agent; stările indeplasabile nu au voie să înceapă pe o celulă de articulație (verificare la atribuirea sarcinii, nu la execuție).
- RISC #4 — Construirea unui zid peste un agent. Cu suprapunere permisă, agentul e împins afară. Cu exclusivitate, el e zidit înăuntru și nu poate fi împins nicăieri. Mitigare: o sarcină de construcție nu se poate finaliza cât timp celula e ocupată (precedentul ușilor din DF/ONI) + supapă de ejectare la cea mai apropiată celulă liberă după N tickuri, cu rând în jurnalul de erori.
- RISC #5 — Livelock letal prin invalidarea unei rute. Cazul documentat în ONI: dupii oscilează între scară și podea până mor de foame, după o rearanjare de bază care a rupt un path precalculat. Mitigare: detector de livelock (distanța euclidiană la țintă nu scade în N tickuri) + jitter determinist derivat din agentId și numărul tickului + escaladare la replanificare completă + log obligatoriu.
- RISC #6 — Costul REAL al proiectului nu e coliziunea, e reconstrucția grafului de navigație pe 786.432 de celule. Coliziunea costă ~0.1 ms/tick la 40 de agenți. Regenerarea de regiuni în stil RimWorld, scalată la harta ta, ar costa ~100 ms. Riscul e să investești săptămâni în algoritmul de coliziune și să te lovești de perete la conectivitate.
- RISC #7 — Exclusivitatea îți schimbă echilibrul de conținut fără să anunțe. Un coridor de 1 tile devine debit maxim 1 agent/tick, în ambele sensuri combinat. Cu 40 de pioni și o ușă de intrare, timpul de traversare a coloniei devine dominat de coadă, nu de distanță. Consecință: lanțurile de producție adânci se blochează pe logistică, nu pe resurse — un efect de balans care apare abia în vertical slice.
- RISC #8 — Contrazicerea surselor pe modelul DF. Wiki-ul de pathfinding spune „walk over each other... much slower" (suprapunere permisă). Pagina de scări și comunitatea spun „only one dwarf is allowed to walk on each tile" cu restul târându-se. Ambele pot fi adevărate simultan (exclusivitate pe modul de mișcare, nu pe ocupare), dar dacă documentul de arhitectură citează greșit DF ca precedent de exclusivitate, construiești pe o premisă falsă.
- RISC #9 — WHCA* ca fallback poate consuma tot tickul. Silver raportează cost continuu de până la ~50 ms la 100 de agenți cu W=16, adică un tick întreg la 20 Hz. Dacă îl folosești ca supapă și se declanșează simultan pentru mai mulți agenți, ai un spike care rupe cele 20 Hz. Mitigare: cel mult 1 invocare WHCA* per tick, în coadă, cu buget de noduri și abandon.
- RISC #10 — Suprafața de testare este imposibil de acoperit cu ochiul. Bug-urile din această categorie (starvation prin prioritate, blocaj în fundătură, livelock) apar după ore și se manifestă ca „un pion a murit de foame", nu ca un crash. Fără harness headless care rulează mii de tickuri cu layout-uri generate și aserțiuni pe progres, nu vei ști niciodată dacă sistemul funcționează.

## Recomandari

- ARHITECTURĂ ÎN 4 STRATURI, în ordinea asta: L0 = index de regiuni/componente conexe, incremental pe chunk-uri de 16×16×1, care răspunde în O(1) la „e accesibil?" înainte de orice A*. L1 = A* per agent pe graful STATIC, ignorând complet ceilalți agenți, cu un câmp de cost de congestie soft (designări de trafic 1/2/5/25). L2 = PIBT pe un singur pas, executat în fiecare tick — ăsta ȘI NUMAI ăsta e rezolvatorul de coliziuni. L3 = garda de fundătură: token de capacitate pe fiecare ramură dincolo de un punct de articulație.
- PSEUDOCOD — bucla de mișcare, executată o dată pe tick (20 Hz):

  // 1. prioritate dinamica, determinista
  for a in agents: a.prio = (tick - a.lastGoalTick)   // intreg, nu float
  order = agents.sortStable(by: (-prio, id))          // doar intregi

  occupiedNow  = map<cell, agentId>   // starea la inceputul tickului
  occupiedNext = map<cell, agentId>   // se umple pe masura ce decidem

  for a in order:
    if a.id not in decided: PIBT(a, parent=null)

  function PIBT(a, parent) -> bool:
    // candidatii: vecinii legali (6-conex vertical + 8-conex orizontal),
    // sortati dupa costul pana la tinta pe ruta L1, tiebreak determinist pe index de celula
    C = legalNeighbours(a.cell) + [a.cell]
    C = C.filter(c => c not in occupiedNext)          // fara conflict de varf
    C = C.filter(c => c != parent?.cell)              // interzice swap direct
    C = C.filter(c => branchTokenAllows(a, c))        // garda L3 pentru fundaturi
    C.sortStable(by: (routeCost(a, c), c.index))

    for c in C:
      occupiedNext[c] = a.id; decided.add(a.id)
      b = occupiedNow[c]                              // cine sta acolo ACUM
      if b == null or b.id in decided:
        return true                                   // celula libera sau deja plecat
      // priority inheritance: il impingem pe b
      if PIBT(b, parent=a): return true
      // backtracking
      occupiedNext.delete(c)
    occupiedNext[a.cell] = a.id; decided.add(a.id)
    return false                                      // a ramane pe loc
- BUGET CPU EXPLICIT (tick = 50 ms la 20 Hz, 40 de agenți, hartă 256×256×12): L2/PIBT ≤ 0.5 ms (extrapolare din 0.021 s la 8000 de agenți ≈ 2.6 µs/agent/pas → ~0.1 ms la 40, cu 5x marjă pentru vecinătatea multi-z). L1/A* de rută: maximum 4 cereri per tick, fiecare plafonată la 8.000 de noduri expandate cu abandon și reluare în tickul următor → ≤ 1.0 ms. L0/regiuni: maximum 2 chunk-uri regenerate per tick → ≤ 0.3 ms. TOTAL ≤ 2 ms, adică 4% dintr-un tick. Pune plafoanele ca numere în JSON și pune un contor în harness care eșuează testul dacă vreunul e depășit.
- REZERVĂ DESTINAȚIA, NU TRAIECTORIA. Zero rezervări spațiu-timp, zero tabele de rezervare multi-tick. Singura rezervare persistentă e celula-destinație a sarcinii, luată la atribuire. Asta elimină din start întreaga clasă de bug-uri „celula rezervată a devenit zid" — PIBT nu are ce să invalideze pentru că nu promite nimic dincolo de tickul curent.
- IMPLEMENTEAZĂ ÎNTÂI TSWAP PE SCOPURI ANONIME. Înainte de orice cod de coliziune: dacă scopul agentului e „orice celulă din mulțimea S" și celula lui curentă preferată e ocupată de un agent cu același tip de scop, schimbă țintele. E cea mai ieftină victorie din tot raportul și acoperă majoritatea traficului de colonie (mâncare, somn, cărat, depozitare).
- LISTA DE BUG-URI CLASICE DE PUS ÎN TESTE, de la început: (1) starvation prin prioritate statică — un agent cedează mereu și moare; (2) deadlock în fundătură — garanția PIBT nu se aplică pe arbori; (3) swap direct nedetectat — doi agenți schimbă celulele într-un pas, arată ca teleportare prin zid; (4) agent imobilizat pe punct de articulație blochează colonia; (5) zid construit peste agent, agent zidit; (6) demolare care distruge propria rută de ieșire (cazul Going Medieval); (7) oscilație/livelock după invalidarea rutei (cazul ONI, letal); (8) 40 de agenți cu aceeași celulă-destinație → 39 de eșecuri permanente; (9) nedeterminism din ordinea de iterare a unui hash map; (10) conflict de tranziție z — doi agenți care intră în aceeași celulă de scară de pe nivele diferite, dacă modelezi scara ca obiect care traversează z în loc de o celulă per nivel.
- MODELEAZĂ SCARA CA O CELULĂ PER NIVEL Z, nu ca un obiect care traversează nivele. Dacă fiecare nivel de scară e un vârf separat în graf, conflictul „doi agenți pe aceeași scară în direcții opuse" se rezolvă gratuit de PIBT ca orice alt conflict de vârf. Dacă modelezi scara ca un singur obiect multi-z, trebuie să inventezi un arbitraj de muchie cu capacitate 1 — cod în plus, pentru nimic.
- RECOMANDARE PE DECIZIA DE PRODUS: păstrează exclusivitatea, dar pune-o pe un flag din JSON, nu în arhitectură. Argumentul de performanță împotriva ei a dispărut (0.1 ms/tick). Argumentul de corectitudine e gestionabil cu garda de fundătură. Dar Factorio a renunțat la ea după ce a plătit costul, iar AoE2 o plătește de 25 de ani — deci vrei să poți relaxa regula la „N agenți per celulă, cu penalizare de viteză, N din JSON" fără să rescrii nimic. Cu N=1 ai exclusivitate; cu N=3 și penalizare ai modelul Dwarf Fortress; ambele rulează prin același PIBT.
- ÎNAINTE DE DOCUMENTUL DE ARHITECTURĂ, verifică două lucruri în 15 minute de joc, nu prin research: (a) dacă duplicanții din ONI se ciocnesc între ei — nu am putut confirma din nicio sursă; (b) dacă unitățile din Songs of Syx se blochează sau doar se încetinesc reciproc — devlog-ul sugerează încetinire, dar formularea e ambiguă. Ambele sunt precedente pe care vrei să le citezi corect.
- PROTOTIPUL DE SĂPTĂMÂNA 1 nu e jocul, e harness-ul: o hartă generată procedural cu un nucleu biconex și 20 de ramuri înfundate de lățime 1, 40 de agenți cu scopuri aleatorii reînnoite la sosire, rulată 100.000 de tickuri headless, cu aserțiuni: niciun agent nu stă fără progres mai mult de 200 de tickuri; bugetul de 2 ms nu e depășit; două rulări cu același seed dau același hash de stare. Dacă ăsta trece, ocuparea exclusivă e o decizie sigură. Dacă nu trece, ai aflat în săptămâna 1, nu în luna 6.

