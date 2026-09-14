# Kinstead

> *Kin* (neamul) + *stead* (locul, gospodăria) — **locul neamului.**
> Când tribul pleacă mai departe, neamul rămâne neam; locul rămâne doar loc.

Colony sim / base builder. Construiești o fortăreață pe niveluri într-o vale. Generațiile trec,
iernile se lungesc, filonul se termină. Când valea nu te mai ține, o parte din trib pleacă cu ce
**știe** — nu cu ce a zidit. Așezarea rămâne pe hartă: ruină, avanpost, sau locul în care te
întorci peste trei generații.

**Stare: preproducție.** Nucleul de simulare și terenul există; jocul nu.

Terenul e real și se poate săpa: o lume plată continuă de 16 × 16 km ca heightfield ieftin, din care
un chunk de 32 m devine voxeli pe 64 de niveluri **doar când sapi sau construiești în el**. Agenții,
în schimb, sunt încă un substitut deliberat — fac o plimbare aleatoare mărginită. Rolul lor e să
exercite mecanismele care nu se pot retrofita (fluxuri de RNG, ordine fixă de iterare, aritmetică
întreagă, hash de stare), ca dovada de determinism să existe **înainte** de a exista joburi, nevoi
sau luptă. Se înlocuiesc la S12-15.

- [DESIGN.md](DESIGN.md) — ce e jocul
- [PLAN.md](PLAN.md) — registrul de decizii, arhitectura, fazele, riscurile
- [CLAUDE.md](CLAUDE.md) — regulile dure ale nucleului
- [research/](research/) — 23 de lentile de research, 549 de constatări cu surse

## Cum îl pornești

Dublu-click pe **`Kinstead.cmd`**. Instalează dependențele la prima pornire, pornește serverul și
deschide browserul. Închizi fereastra neagră ca să oprești.

Dublu-click pe **`Verifica.cmd`** rulează poarta proiectului — aceleași verificări ca CI-ul.

Dublu-click pe **`benchuleaza-gate.cmd`** rulează măsurătoarea gate-ului de motor. Durează un
minut, nu minimiza fereastra, și descarcă singur un `.json` cu rezultatul.

Din linia de comandă, echivalentele sunt `npm run viewer`, `npm run check` și protocolul din
[`bench/GATE.md`](bench/GATE.md).

## Rulează

Nu are nevoie de nimic instalat în afară de Node 23+ — nucleul are **zero dependențe de runtime**,
iar Node rulează `.ts` direct prin strip de tipuri.

```bash
npm install          # doar typescript si @types/node, ca devDependencies
npm run check        # disciplina + typecheck + 77 de teste
node src/harness/cli.ts --seed 12345 --ticks 100000 --agents 40
```

Ultima comandă rulează 100.000 de tickuri fără ecran și fără motor, și scoate hash-ul stării.
Pe mașina de dezvoltare: **138 ms, adică 1,38 µs/tick**, cu hash identic la fiecare rulare.

## Structura

```
src/sim/        nucleul determinist — fara nicio dependenta de motor
  terrain/      cele trei straturi: macro pur, heightfield streamed, voxeli RLE
  rng.ts        xoshiro128** cu fluxuri NUMITE
  result.ts     contractul de refuz: nicio verificare nu intoarce boolean
  state.ts      starea lumii, SoA, fiecare camp etichetat PERSISTED/DERIVED
  commands.ts   stratul de comenzi — nimic nu scrie in World din afara
  world.ts      bucla de tick
  save.ts       save versionat, cu migrari si refuz al build-urilor mai noi
  content.ts    incarcare de reguli din JSON, cu validare
  hash.ts       hash-ul starii — singura dovada mecanica de determinism
src/harness/    runner headless. Aici e voie cu ceasul; in sim/ nu.
tools/          scanerul de disciplina
content/        regulile de joc, ca date
tests/          77 de teste, inclusiv probe negative pentru instrumente
```

## De ce nucleul e TypeScript

Motorul e **deliberat nedecis** până la un gate măsurat de la finalul săptămânii 8: traversezi
16 km la 60 FPS cu terenul promovat randat? Nucleul e TS pur, fără dependențe de motor, exact ca
decizia să rămână reversibilă — portabil în C# în săptămâni, nu în luni.
