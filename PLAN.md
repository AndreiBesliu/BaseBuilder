# KINSTEAD — planul de producție

Însoțește [DESIGN.md](DESIGN.md). Documentul ăsta răspunde la: *în ce ordine se construiește,
la ce mă opresc și decid, și ce anume trebuie să fie adevărat ca să merg mai departe.*

Orizontul stabilit de owner: **întâi prototip, decidem după.** Fazele 0-2 sunt partea angajată.
Fazele 3-5 sunt schițate ca să știu spre ce merg, dar **nu sunt angajate** — se deschid doar dacă
trece Punctul de decizie #3.

---

## 0. Registrul de decizii

Fiecare are stare, motiv, consecință și condiția care ar răsturna-o.

| # | Decizie | Stare | Motivul scurt | Ce ar răsturna-o |
|---|---|---|---|---|
| **D1** | **Motorul: DESCHIS prin decizie, redus la două — Unity 6.3 LTS + C# vs. TS/three.js/Electron. Gate măsurat la finalul S8 (luna 3).** Ales de owner, sesiunea 2 | **deschisă deliberat, cu gate măsurat** | Panoul de motor a scos **pluginurile de teren din decizie**: toți cei trei avocați au ajuns independent la „scrie mesher-ul singur" (godot_voxel e ostil la C#, Voxel Plugin 2 se auto-declară buggy, Voxelica e sculpting smooth, Ultimate Terrains e abandonat). Ce rămâne ca criteriu: **ergonomia UI-ului dens** (~70% din UX-ul unui colony sim, și singura axă pe care expertiza React/TS se transferă direct), rampa de limbaj, testabilitatea headless și livrarea pe Steam. Judecătorul de motor zice Unity, condiționat de arhitectura de grilă cubică — care e exact D19. Arhitectura câștigătoare își propune însă TS/Electron și **își declară singură slăbiciunea**: zero precedent livrat în gen, iar Vampire Survivors (Phaser+Electron) a migrat pe Unity la 1.6 pentru performanță. **Nucleul e portabil în ambele cazuri** (vezi D2), deci schimbarea costă doar stratul de randare. | gate-ul de la finalul S8: dacă nu traversezi 16 km la 60 FPS cu terenul promovat randat, motorul se schimbă ATUNCI — costă 2 luni, nu 10 |
| **D1b** | **Nimeni n-a măsurat costul UI-ului dens, în niciun motor** | de măsurat în săptămâna 0 | Cea mai decisivă afirmație de UI din tot panoul e **nemăsurată în toate cele trei motoare**: avocatul Unity a dat o anecdotă de forum, cel Unreal și cel Godot au spus onest „n-am găsit o cifră publicată". Concluzia corectă nu e un verdict, e un benchmark: un panou cu 40 de rânduri live, actualizat la fiecare tick, cronometrat în ms. | — |
| **D2** | Nucleul de simulare = **assembly C# pur, zero referințe UnityEngine** | închisă | Testabil headless în CI din ziua 1 ȘI portabil spre Godot(C#) în săptămâni dacă licențierea Unity se schimbă. Singura asigurare reală contra riscului de motor terț. | — |
| **D3** | Teren = grilă cubică de 1 m — **confirmată, dar RESCRISĂ de D19**: nu o hartă fixă 256×256×12, ci trei straturi (macro / heightfield streamed / voxeli promovați) | închisă | Motivul rămâne cel de la început — grila deblochează simultan camere (flood fill), stabilitate (decrement), pathfinding pe tile și slice view. Ce se schimbă e că **stiva verticală nu mai e universală**, ci rară. | — |
| ~~**D4**~~ | ~~Două hărți: graf de regiuni + grilă finită~~ | **ÎNLOCUITĂ de D18/D19** | Modelul cu două hărți era o concesie făcută ca să eviți streamingul. Panoul arată că streamingul de chunkuri de 32 m e o problemă rezolvată (400 de chunkuri rezidente = 1,7 MB), nu una de cercetare — deci concesia nu se mai justifică. | — |
| **D5** | **UN singur sistem fizic continuu: graful de camere** (temperatură + izolație + prag de conservare 5 °C) | închisă | Cel mai bun raport efect/cost din tot genul. Al doilea sistem dublează costul (DF), al treilea cere DLL nativ (ONI). | — |
| **D6** | **Pânză freatică statică**, zero simulare de fluide | închisă | Apa atinge stabilitate + temperatură + agricultură + pathfinding + randare deodată. Primesc decizia interesantă (sapi adânc → frig + instabilitate) fără costul. | — |
| **D7** | **Ocuparea celulei e o funcție de OSTILITATE, nu o regulă globală.** Agenții ne-ostili unul altuia trec unul pe lângă altul, cu penalizare de viteză. O pereche **ostilă** se blochează reciproc. | **ÎNCHISĂ** (owner, sesiunea 2, după ce panoul a răsturnat premisa exclusivității stricte) | Panoul a arătat că **niciun joc de referință n-are exclusivitate strictă** (DF permite suprapunere cu penalizare mare și recomandă rute ≥2 tile; RimWorld folosește cost 175; Factorio a *eliminat* coliziunea între unități din cauza înfundării), și că **exclusivitatea nu cumpără tactica de coridor** — în DF valoarea punctului de strangulare vine din poduri mobile, capcane, plăci de presiune și fortificații. Regula pe ostilitate separă corect cele două probleme: **deadlock-ul era în economie** (40 de cărăuși în fundături) și dispare prin construcție; **valoarea coridorului era în luptă** și se păstrează integral, fiindcă un apărător într-o ușă de 1 tile chiar e un zid. | dacă la testul din S15 o pereche ostilă produce blocaje *nedorite* în afara luptei |
| **D7b** | **Ce se economisește concret din D7** | consecință | Cele opt straturi proiectate pentru exclusivitate strictă se reduc la ~două: **(1)** penalizare de cost pentru pășitul peste un ne-ostil (RimWorld: 175, calibrabil din JSON); **(2)** agenții ostili ca **obstacole dinamice** în fereastra locală de A* + re-validarea leneșă a următoarelor ~20 de noduri. **Cad:** tokenul pe ramura înfundată (PIBT-TP), analiza de puncte de articulație prin Tarjan ca mecanism anti-deadlock, semafoarele pe uși, scările ca două benzi unidirecționale. **PIBT rămâne opțional** — util pentru mulțimea din luptă, nu obligatoriu pentru economie. | — |
| **D7c** | **Riscul nou pe care îl creează D7** | de testat, nu de presupus | Un agent ostil care stă într-un coridor **blochează economia**: cărăușii tăi nu mai au drum și colonia îngheață cât timp raiderul stă acolo. Comportamentul corect nu e deadlock, ci: celulele ostile sunt impasabile → re-path → dacă nu există drum, job-ul raportează **INACCESIBIL** prin sistemul de cauze, vizibil în UI. Caz de test explicit la S15. Notă de onestitate: **modelul pe ostilitate n-a fost verificat în sesiunea asta față de un joc livrat din gen** — are precedent în RTS-uri (coliziune pe echipe), dar nu într-un colony sim pe grilă cu fundături. E o decizie de design proprie, nu una copiată. | — |
| **D8** | **Combat doar defensiv**, pe aceeași buclă de sarcini | închisă | Sistem de combat separat = cel mai prost raport valoare/efort din gen. Going Medieval a intrat în EA cu combat „plat" și a vândut oricum; inversul nu e documentat nicăieri. | — |
| **D9** | **Tot conținutul în JSON** validat, cu hot reload. Zero numere de gameplay în cod | închisă | Un număr de gameplay în cod = bug de arhitectură. Servește întâi iterația mea de balans, apoi modding-ul. | — |
| **D10** | **Determinism logic + harness headless** din săptămâna 1 | închisă | Plătește în trei locuri: teste în CI, reproducerea bug-urilor din save-urile jucătorilor, migrări verificate. E singurul avantaj netransferabil pe care îl am față de un dev de jocuri obișnuit. | — |
| **D11** | **Fără fixed-point / determinism cross-platform** | închisă | Nu e necesar fără multiplayer sau replay. Economisesc luni. | dacă apare vreodată co-op în plan — atunci se decide ÎNAINTE, nu după |
| **D12** | **Job system pe UN singur fir**, fără excepții | închisă | Defectul RimThreaded: cu mai multe fire, `CanReserve`+`Reserve` nu mai sunt atomice → lanț circular de așteptare. Paralelizez doar faze read-only. | — |
| **D13** | **Save local, zero backend** | închisă | Songs of Syx, Going Medieval, Sapiens, Manor Lords — toate offline. Orice dependență de backend = cost recurent pe un joc cu plată unică. | — |
| **D14** | **Numele: KINSTEAD** | închisă (owner, sesiunea 1) | *Kin* + *stead* = locul neamului; neamul pleacă, locul rămâne. Verificat: **liber pe Steam**. Două lucruri de știut, niciunul blocant — (a) marcă înregistrată KINSTEAD de Kinstead, Inc. (NY, serial 99429638) și Kinstead Health, dar în altă clasă decât jocurile video; `kinstead.com` e probabil luat, deci domeniul va fi `kinsteadgame.com` sau similar; (b) vecinătate fonetică cu **Kinstrife** (RPG medieval, editat de Hooded Horse — chiar editorul lui Manor Lords și Against the Storm) și cu **Kynseed**. Riscul e de descoperire, nu legal. | verificarea de clase de marcă înainte de lansarea comercială, dacă se ajunge acolo |
| **D15** | **Vatra nu există pentru proiectul ăsta** | închisă (owner, sesiunea 1) | Nu e bază, nu e referință, nu se portează nimic din ea. Proiect nou, de la zero. | — |
| **D16** | **Realism: treapta b+ — low-poly stilizat cu iluminare și atmosferă puternică. NU realist.** | închisă (panou, unanim) | Refuzat cu dovezi, nu din lene: (a) teren săpabil la runtime **interzice** lightmaps coapte și e greșit pentru Nanite — exact pe astea două stă realismul UE5; (b) slice view + interioare se bat cu Lumen pe transparență (Manor Lords, Ostriv și Foundation n-au interioare deloc — evită problema, n-o rezolvă); (c) bugetul Lumen (4 ms@60fps la 1080p) nu încape lângă tick. Și: **ce cumperi cu realism e o echipă, nu un stil** — Ostriv solo din 2014 dar echipă din 2018; Foundation 18-20 de oameni; Manor Lords se autodescrie pe Steam ca „grown into a full team", cu departament de mocap. | — |
| **D17** | **Grilă strictă de 1 m pentru LOGICĂ, organic exclusiv la PREZENTARE** | închisă (panou, 3 din 4 arhitecți au convers independent) | Panoul a căutat și **nu a găsit niciun joc livrat** cu interioare simulate multi-etaj ȘI plasare organică fără grilă. Grila **E** topologia spațială gratuită: enclosure, suport, vecinătate, rezervare. Fără ea plătești trei sisteme incrementale grele (arrangement planar, navmesh incremental, graf de suport) ca să câștigi un unghi. Costul măsurat al organicului: Ostriv = **556 de piese modelate și ~5 luni pentru O clădire**; Foundation, după 7 ani, încă n-a rezolvat alinierea pieselor de monument pe teren înclinat. **D3 confirmată, nu răsturnată.** | — |
| **D18** | **Open world = continuitate + persistență + libertate de mișcare. NU planetă.** Lume plată continuă 16 × 16 km (268 km²), zero loading screens | închisă (panou) | Cele trei propoziții pe care le spun efectiv jucătorii lui Sapiens — „move as far away as you like", „send sapiens over long distances and establish camps", „you can explore everything you can see" — sunt satisfăcute toate de o lume plată. **Niciuna nu menționează sfericitatea.** Sfera costă trei sisteme de coordonate plătite etern (pathfinding, UI, unelte). **D4 înlocuită:** nu graf de regiuni + hartă finită, ci lume continuă cu streaming. | — |
| **D19** | **Arhitectura: GRILĂ PROMOVATĂ** (vezi §0.5) | închisă (panou, unanim pe toate 3 lentile) | Grila de 1 m e universală ca sistem de coordonate și de coliziune, dar **stiva verticală de voxeli există numai unde jucătorul a săpat sau a construit**. Restul lumii e heightfield streamed. „Open world" se plătește în heightfield (ieftin), „adâncimea Going Medieval" în voxeli RLE (scump, dar rar), „organicul" exclusiv în prezentare. | seam-ul heightfield↔voxel — vezi K16 |

---

## 0.5. Arhitectura: GRILĂ PROMOVATĂ

Câștigătoarea unanimă a panoului (4 arhitecți independenți, 3 judecători pe lentile distincte).
Teza, într-o propoziție: **grila de 1 m e universală, stiva verticală e rară.**

### Trei straturi de teren

| | Ce e | Cost |
|---|---|---|
| **L0 — macro** | Lume plată 16,384 × 16,384 km, un sample la 16 m ⇒ 1024². Per sample 8 B (înălțime int16 în dm, biom, sol, umiditate, temperatură de bază, flags). Generat din seed, se salvează doar delta. E și ecranul de hartă, și substratul pentru expediții. | **8,4 MB rezidenți permanent** |
| **L1 — chunk de teren** | 32 × 32 m footprint. Heightfield la 1 m (33×33 int16) + material + vegetație. 262.144 de chunkuri în lume, **400 rezidente** (disc de ~360 m în jurul camerei). | ~4,3 KB/chunk ⇒ **1,7 MB** |
| **L2 — promovare la voxeli** | Când jucătorul sapă, umple sau construiește, chunk-ul e **promovat ireversibil** la coloane de voxeli: 32×32 coloane × **64 niveluri de 1 m** (−24 sub bază, +40 deasupra). Stocare RLE pe coloană, 2 B/run. | fortăreață intens săpată ≈ 16 KB/chunk ⇒ **200 chunkuri = 3,2 MB pentru TOATĂ așezarea, subteran inclusiv** |

De ce 32 m lățime: ca o coloană să încapă într-un `Uint32Array` de 32 de biți — binary greedy meshing e **bitwise pe coloane**, iar JavaScript n-are typed array pe 64 de biți. A fost singura propunere din patru care a observat asta.

### Măsurat, nu estimat *(S3-5 livrat, `node src/harness/bench-terrain.ts`)*

| | Măsurat | Ce spunea planul |
|---|---|---|
| Chunk-uri rezidente la rază 11 | **377**, încărcate la rece în **9,8 ms** | ~400 |
| Mutarea focusului cu un chunk | **0,8 ms** | — |
| Promovare + apron (9 chunk-uri) | **5,5 ms** | — |
| O săpătură | **7,0 µs** | — |
| Chunk proaspăt promovat | **12,0 KB** | ~4 KB ❌ |
| Chunk de fortăreață intens săpat | **13,4 KB** | ~16 KB ✓ |
| 200 de chunk-uri de fortăreață | **2,62 MB** | ~3,2 MB ✓ |
| Compresie RLE | **4,8×** față de nedecomprimat | — |

**Corecția onestă:** estimarea de 4 KB pentru un chunk proaspăt promovat era greșită de trei ori,
pentru că ignora indexul de coloane — 1.025 de intrări × 4 B = 4,1 KB, singur cât tot bugetul estimat.
Bugetul TOTAL ține însă, fiindcă planul supraestima în cealaltă direcție chunk-ul intens săpat.
Nu optimizez acum: 2,62 MB e sub ținta de 3,2 MB și n-am un motiv măsurat.

### Meshing *(prima jumătate din S6-8, `node src/harness/bench-mesh.ts`)*

| | Măsurat |
|---|---|
| Chunk proaspăt promovat | **430 µs** · 5.338 fețe → **119 quaduri** (reducere **44,9×**) |
| Chunk de fortăreață — camere și coridoare | **435 µs** · 6.348 fețe → 326 quaduri (**19,5×**) |
| Chunk săpat **aleator** (cel mai prost caz) | 1.222 µs · 19.078 fețe → 11.220 quaduri (1,7×) |
| Față de reperul C++ din panou (74 µs / 64³) | **23× mai lent** per voxel |
| La 25% din bugetul de cadru | **9 chunk-uri proaspete pe cadru**, 200 de chunkuri promovate ≈ 87 ms într-un worker |

**Cazul aleator nu e cazul real.** Prima măsurătoare arăta 1,7× reducere și părea alarmantă — până
am construit un chunk cu **camere și coridoare** în loc de zgomot: 19,5× reducere, la același timp ca
un chunk neatins. Săpătura aleatoare e cel mai prost caz posibil pentru unirea lacomă și nu seamănă
cu nimic din ce construiește un jucător. *Măsurătoarea greșită era fixtura, nu codul.*

**Verdictul de buget:** un dig murdărește un chunk ⇒ 435 µs de re-mesh, adică 2,6% dintr-un cadru.
Încărcarea inițială a unei fortărețe de 200 de chunkuri ⇒ ~87 ms într-un worker, întinsă pe câteva
cadre. **Încape.** Diferența de 23× față de C++ e reală, dar nu e cea care decide gate-ul — bugetul e.

Comparația de scară: Going Medieval e 250×250×16 = 1e6 voxeli, hartă **fixă**. Aici, fortăreața de 3,2 MB stă într-o lume de 268 km², iar a doua fortăreață e la 3 km și **rămâne acolo când pleci**.

### Ce rezolvă, câmp cu câmp

- **Open world:** lume continuă, **zero loading screens vreodată**, camera zboară până la orizont. Un singur sit rulează simularea la 20 Hz; celelalte sunt date pe disc + un „site record" (proprietar, stocuri, ostilitate, tickul la care a fost părăsit). Expedițiile se rezolvă pe L0 ca **o călătorie cronometrată**, nu cu pathfinding per tick.
- **Teza de produs devine aproape gratuită:** părăsești situl ⇒ chunkurile rămân pe disc; te întorci ⇒ încarci + aplici o **funcție deterministă de decădere** pe numărul de ticks scurse. Fără simulare în absență. *(Cerere de piață documentată: modul „Persistent RimWorlds" există exact pentru „explore fallen colonies where pirates may lurk" — ruinele din RimWorld nu pot fi recolonizate.)*
- **Camere:** graful NU se construiește din celule brute, ci din **regiuni** (16×16 per z-slice, max 256 de celule). Un edit murdărește un z-slice ⇒ flood fill pe 256 de celule + BFS pe **zeci de noduri de regiune**, nu pe mii de celule. Temperatura = un scalar per cameră, integrat Euler la **1 Hz**, nu 20. ~200 de camere × 4-6 vecini ⇒ **sub 0,5 ms** pe tickul în care rulează.
- **Organicul, la preț de prezentare:** pereți **parametrici** (un material = un generator, nu 556 de piese), variante de mesh din hash de coordonate, piese la 45° ca excepție, props off-grid **în interiorul** celulei, teren netezit cu marching-squares peste trepte care rămân în date, **poteci din contoare de trafic** (Ostriv a făcut sistemul în câteva zile — cel mai bun raport valoare/efort din tot research-ul), zone pictate raster.
- **Atelierul e un ROL de cameră, nu o clădire nouă.** O cameră închisă cu un cuptor și o masă de lucru **devine** brutărie. Model furat de la extensiile burgage plot din Manor Lords. Asta cumpără lanțuri de producție de 3 niveluri **fără niciun asset nou** — exact ce-i trebuie unui om fără artist.

### Regula care ține totul

Grila de celule e **derivată** peste tot (celula walkable a unei coloane ne-promovate = vârful heightfield-ului, una singură pe (x,z)). Promovarea e chunk-granulară, permanentă, și include o **apron de 1 chunk** în jurul oricărei atingeri — ca seam-ul să fie un **inel testabil**, nu o suprafață. Construcția e interzisă la sub 1 m de un chunk ne-promovat, iar o cameră nu are voie să flood-fill-uiască în spațiu ne-promovat.

### Ordinea de implementare, pe săptămâni

46 de săptămâni la ~25 h/săptămână ⇒ **10-12 luni până la vertical slice.** Cartografiat peste fazele din §2.

| Săpt. | Ce | Fază |
|---|---|---|
| **S1-2** | **Harness înainte de joc.** Buclă de tick determinist, zero dependențe de motor; aritmetică pe întregi; PRNG cu seed (xoshiro128**); runner headless; golden replay (același seed + același log ⇒ același hash după 100k ticks); CI; loader JSON cu schemă. *Dacă asta nu există în S2, proiectul e deja pierdut.* | 0 |
| **S3-5** | **Teren.** Macro 1024²@16 m; streamer de chunkuri cu 400 rezidente; heightfield 1 m; **promovarea** la coloane RLE cu apron; dig/fill; save/load. Fuzz: 10k operații promovare→săpare→salvare→încărcare, hash stabil. | 0 |
| **S6-8** | **Coloana vertebrală de randare.** Mesher în worker, binary greedy pe măști `Uint32` per coloană; suprafață netezită cu marching-squares; slice view cu fade de acoperiș; cameră. | 0 |
| | 🚦 **GATE DE MOTOR (D1).** Traversezi 16 km la 60 FPS cu terenul promovat randat? Dacă nu — motorul se schimbă **acum**, costă 2 luni. | |
| **S9-11** | **Regiuni + reachability.** Partiție 16×16 per z-slice, reconstrucție incrementală, graf de regiuni, reachability prin union-find, overlay de debug. Test: 10.000 de edituri aleatorii, invarianții rezistă. | 1 |
| **S12-15** | **Agenți și coliziune.** A* pe graf de regiuni + A* local; **regula de ostilitate (D7)**; plafon de re-planificări per tick. Acceptanță: 40 de agenți, 200 de goal-uri, 100k ticks, zero blocaje permanente, plus cazul D7c — un ostil în coridor NU îngheață colonia, ci produce INACCESIBIL vizibil. | 1 |
| **S16-19** | **Joburi și nevoi.** Priorități pe tipuri de muncă, job giver cu buckets spațiale, hauling, zone pictate, foame/odihnă/dispoziție. *Prima dată când devine joc.* | 1 |
| **S20-23** | **Construcție și stabilitate.** Blueprints, materiale, multi-etaj, scări, acoperișuri; propagare de suport (4 / −1 / max 3 nesusținute / grinzi 10). Test literal: **pivnița 7×7 se prăbușește, 5×5 nu.** | 2 |
| **S24-27** | **Camere, temperatură, hrană.** Camere din regiuni; uși etanșe; temperatură per cameră la 1 Hz cu U-value distinct pe perete/podea/acoperiș; prag 5 °C; confort −8..34 °C. *Acum adâncimea Going Medieval e livrată.* | 2 |
| **S28-31** | **Lanțuri de producție.** Atelierul ca rol de cameră; trei lanțuri de câte 3 trepte; totul în JSON. | 2 |
| **S32-35** | **Pasă de artă și UX.** Pereți parametrici, variante din hash, poteci din uzură, paletă + iluminare; UI complet. *Prima dată când arată a joc — deliberat la luna 8, nu la luna 2.* | 2 |
| **S36-40** | **Stratul de lume.** Expediții pe macro; al doilea sit; abandonare + decădere deterministă; întoarcerea la ruină; jefuitori cuibăriți. *Aici se livrează teza de produs.* | 2 |
| **S41-46** | **Întărirea slice-ului.** Bugete de performanță impuse în CI pe un save de benchmark (tick ≤ 8 ms), versionare de save, 3 ore de conținut, 20 de testeri externi. | 2 |

---

## 1. Ordinea sistemelor — și de ce exact asta

Motivul pentru care pathfinding-ul și job system-ul vin **înaintea conținutului**: fiecare clădire e
simultan o țintă de path și un producător de job. Dacă semantica jobului se schimbă, TOT conținutul
se re-autorizează.

Motivul pentru care **balansul vine ultimul**: cascada descrisă de Klei — reduci metalul, forțezi mai
mult săpat, ceea ce cere mai mult oxigen, ceea ce elimină radiatoarele naturale de căldură. Numerele
nu se pot fixa cât timp sistemele încă se mișcă.

### Fundația (nu se poate retrofita — asta e tot ce înseamnă „nu moare la felia 5")

| | Modul | Ce e |
|---|---|---|
| **M0** | Nucleul determinist | ~300 de linii. Tip `Pos` propriu, RNG cu stream-uri numite derivate din seed (`rng("worldgen")`, `rng("combat")`, `rng("events")`), contorul de tick ca singură sursă de timp, `hashState()`. **Regulă în CLAUDE.md: în `sim/` sunt interzise `DateTime.Now`, RNG global, `async` și iterarea peste dicționare fără sortare.** Un test caută tiparele astea. |
| **M1** | Harness headless | Aplicație de consolă: pornește o lume din seed, rulează N tick-uri. Patru teste: determinism same-seed la 10.000 de tick-uri (compară hash), invarianți la fiecare 100, roundtrip save/load (`1000 + load + 1000 == 2000`), fuzzing de comenzi cu raportarea seed-ului la prima violare. **Toată suita sub 30 s.** |
| **M2** | Stocarea lumii | SoA + chunk-uri. Array-uri paralele de primitive (`byte[]` teren, `short[]` temperatură, `ushort[]` idRegiune), indexate `x + y*w + z*w*h`. **Niciun obiect per celulă.** Chunk-uri 16³ cu `dirty` per chunk ȘI per sistem. Rezerv de la început câmpuri pentru: tip, stare, idCameră, stabilitate, lumină. |
| **M3** | Scheduler de tick | Accumulator cu pas fix 50 ms (20 Hz), `maxTicksPerFrame = 8` ca plafon anti-spirală. Viteze = 1/2/3 tick-uri pe cadru. Bucket-uri în ring buffer (`tick % interval`), nu modulo pe hash. **Fiecare sistem înregistrat are nume și e cronometrat; overlay de debug cu ms/sistem/tick din prima zi.** |
| **M4** | Servicii spațiale, în ordinea asta strictă | **(a)** componente conexe / reachability cu union-find, **per profil de mobilitate** (mergător / cățărător) → `canReach()` în O(1); **(b)** graf de regiuni (16×16) + camere derivate; **(c)** A* ierarhic, scris **reluabil** (`step(nBudget)`) din prima; **(d)** index spațial cu rază maximă OBLIGATORIE ca parametru. Toate sunt DERIVED — se reconstruiesc la load, nu se salvează. |
| **M5** | Save/load versionat | Envelope `{saveVersion, schema, gameVersion, timestamp, data}`. Fiecare câmp etichetat PERSISTED / DERIVED / TRANSIENT. Migrări în lanț idempotente cu fixture-uri golden în repo. Scriere atomică temp → fsync → rename, cu `.bak`. **La load: anulează toate job-urile și toate rezervările**, lasă pionii să replanifice. |
| **M6** | Pipeline de conținut | JSON cu `id`, `extends`, `abstract`, validare de schemă cu erori clare, **hot reload la salvarea fișierului**, set mic de operații de patch. |
| **M7** | Agenți și job-uri | Pionii = obiecte normale cu **compoziție**, NU ECS (regretul explicit al lui Tarn Adams e polimorfismul prin ierarhii). Selector rulat rar (re-scan decalat pe `id % 30`) + JobDriver ca mașină de stare ieftină. **ReservationManager separat cu invariant testat.** |
| **M8** | Prezentare | Ultimul, și subțire. Citește starea read-only. Interpolare `alpha = accumulator / dt`. **Regula de verificare: dacă șterg tot folderul de prezentare, harness-ul headless trebuie să compileze și să treacă testele.** |
| **M9** | Adormirea sistematică | Continuu, de la M3. Orice entitate care își poate prezice următoarele N tick-uri nu se tickuiește. Ținta Factorio: 20 de tick-uri pentru entități în mișcare, 60 pentru staționare. **Asta, nu vectorizarea, e ce mă duce de la 15 la 40 de pioni.** |

### Gameplay (după fundație)
inventar/stocare → **simularea-coloană (camerele)** → nevoi și stări → UI + stratul de lizibilitate →
conținut (clădiri, rețete) → amenințări/evenimente → automatizare → **balans**

---

## 2. Fazele — angajate

### FAZA 0 — Prototipuri aruncabile · **6-10 săptămâni, timeboxed dur**

Trei prototipuri separate, maximum 2-3 săptămâni fiecare, scrise cu intenția de a **refolosi
tehnologia și de a arunca jocul**. (Tiparul RimWorld: 4 prototipuri abandonate în 18 luni.)

- **P1** — grilă + reachability + pathfinding + 20 de agenți care găsesc și execută job-uri
- **P2** — graful de camere pe grila voxel, la tick fix, decuplat de framerate
- **P3** — cameră, slice view, selecție, plasare de construcție pe mai multe etaje

**P1 și P3 se scriu în AMBELE motoare candidate**, cu timpul cronometrat. Asta e cum se ia D1:
ca măsurătoare, nu ca preferință. Ce măsor: ore până la primul agent care se mișcă, ore până la un
panou cu 40 de rânduri live, ms de CPU pentru acel panou.

**Criteriu de acceptare:** P1 și P2 rulează ÎMPREUNĂ — 30 de agenți pe 200×200×8, ≥60 FPS pe laptopul
meu, tick de sim ≤ 8 ms, **zero alocări de heap în bucla fierbinte**, de la pornire la prima comandă
sub 10 secunde.

> **PUNCT DE DECIZIE #1.** Dacă la 10 săptămâni nu am P1+P2 împreună la pragul ăsta: nu continui pe
> direcția aleasă. Ori schimb motorul, ori cobor ambiția (2.5D în loc de voxel 3D), ori opresc.
> **Nu trec mai departe cu „optimizăm mai târziu"** — Going Medieval avea probleme la 10+ coloniști
> chiar și cu multithreading.

### FAZA 1 — Bucla de bază · **3-4 luni**

Livrez: job system cu priorități și rezervări fără deadlock · pathfinding ierarhic cu invalidare pe
regiuni · inventar/stocare · **trei lanțuri de producție complete** de la materie primă la consum ·
5 nevoi · **o singură amenințare ciclică (iarna)** · panoul „De ce nu?" · save/load versionat.

Conținut: **12-18 clădiri, 10-14 resurse, 15-20 rețete, 6-8 job-uri.**
(Oxygen Not Included are 362 de clădiri — dar după nouă ani și cu echipă de studio.)

**Criteriu de acceptare:** un om din afară, fără tutorial, supraviețuiește prima iarnă cu 5 pioni în
45-90 de minute și îmi pune **sub 4 întrebări**.

> **PUNCT DE DECIZIE #2.** Dacă trei oameni la rând nu reușesc, problema NU e conținutul — e
> lizibilitatea sau bucla. Nu adaug nimic până nu trece.

### FAZA 2 — Vertical slice · **3-4 luni**

**Definiție operațională:** o singură hartă, un singur scenariu de start, 3-5 ore de joc, în care
TOATE sistemele care definesc jocul funcționează împreună la calitate aproape finală — inclusiv UI,
feedback, jurnal de evenimente, salvare și un obiectiv de fază declarat. **Nu e „fiecare sistem la
10%".** E sfârșitul preproducției.

Aici intră și **migrația** — mecanica-semnătură. Un capitol complet: întemeiere → creștere →
valea obosește → tribul se desparte → așezarea rămâne pe harta lumii.

**Criterii de acceptare, măsurabile:**

| | Criteriu |
|---|---|
| a | **Două organizări economice viabile pe aceeași hartă** — de ex. fermieri-comercianți vs. mineri-meșteșugari — ambele ating obiectivul, cu profiluri de consum **măsurabil diferite** |
| b | **5 din 8 playtesteri externi** joacă ≥90 de minute în prima sesiune fără să li se ceară, și **3 din 8 revin din proprie inițiativă în 7 zile** |
| c | Fiecare playtester poate povesti o **întâmplare SPECIFICĂ** din colonia lui la 24 de ore după sesiune |
| d | 60 FPS cu 25 de pioni |
| e | **Determinism la reîncărcare**: 100 de tick-uri după load, hash identic cu rularea continuă |
| f | Migrația se citește ca **un capitol care se închide**, nu ca o pedeapsă (întrebare directă la playtest) |

> **PUNCT DE DECIZIE #3 — ĂSTA E CEL PE CARE L-AI CERUT.**
> Dacă (b) sau (c) pică, nu adaug sisteme: mă întorc în Faza 1 și refac bucla. Dacă pică a doua oară,
> opresc proiectul. **Aici se decide dacă am un joc sau o simulare** — și tot aici decizi tu dacă
> proiectul merge spre comercial sau rămâne ce e.

---

## 3. Fazele — schițate, NEangajate

Se deschid doar după Punctul de decizie #3. Le scriu ca să știu spre ce merg, nu ca promisiune.

- **FAZA 3 — adâncime + prezență publică (4-6 luni).** Al doilea pilon, automatizarea completă,
  onboarding fără tutorial explicit. În paralel: pagina Steam live, devlog la 2-3 săptămâni, demo
  public cu ≥6 luni înainte de EA. *Criteriu: ≥5.000 de wishlist-uri înainte de Next Fest.*
- **FAZA 4 — Early Access (18-36 luni).** Rampa dovedită: alpha închisă 10-20 → closed beta 100-300 →
  demo public → EA, cu 6-8 luni între etape. Cadență **rară și mare**: 2-3 update-uri pe an, fiecare
  un sistem complet numit după el. **Aici înghețez contractul de serializare, nu mai devreme** —
  până atunci save-urile sunt sacrificabile și spun asta public.
- **FAZA 5 — 1.0.** Endgame cu 2-3 condiții de victorie distincte, **fiecare deschizând un sistem de
  simulare, nu afișând un ecran**. Definiția de TERMINAT scrisă din Faza 0 ca listă închisă.

**Realitatea comercială, ca să nu fie surpriză mai târziu:** Going Medieval a stat 4 ani și 9 luni în
EA cu o echipă de ~10 oameni; Timberborn 4,5 ani; Songs of Syx e încă în EA la 6 ani. Din 225 de
jocuri ieșite din EA în 2025, **doar 20% au mers mai bine la 1.0** — mediana veniturilor la 1.0 a fost
~40% din cea de la EA. Riscul #1 nu e tehnic, e **să nu poți susține cadența 3-6 ani**: Sapiens a
trecut de la 79% la „Mostly Negative" după ce update-urile s-au oprit. În genul ăsta, tăcerea e
echivalentă cu anunțul că jocul e mort.

---

## 4. Registrul de riscuri

Fiecare are **semnalul de alarmă** — ce anume trebuie să observ ca să știu că s-a întâmplat.

| # | Risc | Semnalul de alarmă |
|---|---|---|
| K01 | Pathfinding 3D multi-agent + ordonarea job-urilor — groapa fără fund a genului. Un studio de 10 oameni l-a rescris de 4 ori în 5 ani și după 1.0 îl declară în continuare problema #1 | prima dată când scriu cod care caută o poziție de lucru liberă în jurul unei ținte |
| K02 | Retrofitarea rezervărilor sau a layer-elor | primul câmp `isBeingWorkedOn: bool` pe o entitate; primul caz în care trebuie să „excepționez" o rezervare |
| K03 | Colapsul de performanță la un număr dureros de mic de agenți | FPS-ul depinde de numărul de agenți în MIȘCARE, nu de ce e pe ecran → bugetul e în AI și nu se repară prin optimizare de randare |
| K04 | Navigarea prin verticalitate anulează valoarea verticalității | la testare mă prind că evit să construiesc pe mai multe niveluri pentru că e enervant de privit |
| K05 | Itemele de pe jos — bomba cu întârziere | TPS-ul scade cu VECHIMEA coloniei, nu cu populația |
| K06 | Datoria de micromanagement se acumulează invizibil | al doilea sistem în care jucătorul dă același ordin de mai multe ori la rând; >3 comenzi manuale/minut la ora 5 de joc |
| K07 | Simulare adâncă pe care jucătorul n-o poate citi | playtesterii spun „nu știu ce s-a întâmplat"; sunt singurul care înțelege de ce a murit colonia |
| K08 | Amestecarea stării de simulare cu obiectele de motor | primul `transform.position` ca sursă de adevăr. Test: pot rula 1.000 de tick-uri fără editor? |
| K09 | Spirala morții a ceasului | la un raid mare FPS-ul nu scade gradual, ci se prăbușește și nu-și mai revine după |
| K10 | Înghețarea prematură a modelului de date | am migrări de save înainte să existe playtesteri externi |
| K11 | Înghețarea prea târzie | am jucători publici și încă n-am versionare + migrări testate (capcana prinsă deja în Warlord: un tab vechi hidrata, arunca tăcut câmpuri și scria trunchiat) |
| K12 | Burnout pe orizont multianual | mi-e greu să deschid editorul; ore multe fără progres vizibil; nu mai public devlog |
| K13 | Adminul vizual ca punct orb — sistemele astea sunt INVIZIBILE: typecheck verde, teste verzi, joc rupt | n-am overlay de debug pentru regiuni / rezervări / job curent |
| K14 | Asset flip perceput | primele comentarii pe trailer menționează numele pachetului în loc de mecanică |
| K15 | Comparația cu Timberborn | orice review intern de tip „nu arată ca Timberborn" e o comparație cu un buget de 13× mai mare și se respinge explicit |
| **K16** | **Seam-ul heightfield↔voxel** — riscul #1 al arhitecturii, declarat de propria ei autoare. Granița de promovare trebuie să fie corectă simultan în **șase subsisteme** (randare, pathfinding, regiuni, camere, stabilitate, save/load), fiecare cu altă noțiune despre ce e o celulă la graniță. **Nimeni n-a livrat combinația asta.** Bug-urile sunt geometrice și emergente, nu logice — exact clasa pe care un harness headless o prinde TÂRZIU | un agent pe o celulă ne-promovată lângă o coloană promovată la înălțime derivată diferit; o cameră care primește temperatură nedeterministă; un mesh netezit care nu coincide cu celula de coliziune (eroarea lui Ostriv: navmesh desincronizat de vizual, oamenii taie colțuri). **Dacă arhitectura cade, aici cade — 3 luni** |
| **K17** | **Citate fabricate care se propagă prin brief** — verificat, s-a întâmplat deja în panoul ăsta | judecătorul tehnic a căutat cifra „8.000 de agenți în 0,021 s ⇒ 2,6 µs/agent/pas" în paper, pe pagina proiectului și în repo: **nu există nicăieri**, dar apare IDENTIC în toate patru propunerile, pentru că a venit din brief-ul lentilei de referință. La fel, citatul „PIBT may cause deadlocks on dead-ends" e atribuit ca verbatim de trei propuneri și **nu e pe pagina fetch-uită**. Semnal: mai mulți agenți repetă aceeași cifră cu aceeași precizie. Antidot: orice număr care ajunge într-o decizie se re-verifică la sursă sau se măsoară |
| **K18** | **Bugetul de WebSearch se poate epuiza în mijlocul unui panou** (200/200, s-a întâmplat) — judecătorii au rămas fără verificare | doi din patru judecători au declarat explicit că n-au putut re-verifica nimic. Unul a compensat **măsurând singur** operațiile în Node, ceea ce a produs cele mai valoroase date din tot panoul. Antidot: pune măsurarea în sarcină de la început, nu ca plan B |

---

## 5. Prima sesiune de lucru — concret

1. **D16, D17 și D18 se închid** pe baza panoului de arhitectură. Până atunci nu se scrie cod de teren:
   reprezentarea terenului e decizia care nu se mai poate schimba, și de ea atârnă camerele,
   stabilitatea, pathfinding-ul și slice view-ul.
2. `git init` în proiectul nou. CLAUDE.md cu regulile stabile: disciplina `sim/` (fără timp real,
   fără RNG global, fără iterare nedeterministă), sync workflow, DEVLOG, un număr de gameplay în cod
   = bug de arhitectură.
3. M0 + M1: nucleul determinist și harness-ul headless. **Înainte de orice gameplay.** Sunt singurele
   două module care se pot scrie în siguranță înainte ca D17 să fie închisă — nu depind de teren.
4. Faza 0 / P1 în ambele motoare, cu cronometru pornit. Aici se închide D1.
5. Coliziunea între agenți (consecința lui D7) se proiectează **odată cu** pathfinding-ul, nu după.

**Ce NU fac în prima sesiune:** nu aleg asset-uri, nu desenez UI, nu scriu conținut, nu scriu cod de
teren înainte de D17 și nu deschid subiectul numelui comercial.
