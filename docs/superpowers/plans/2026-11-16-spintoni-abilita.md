# Spintoni: sistema abilità — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Barre di carica per abilità, speciali nascoste a pressione prolungata, suprema, mattoni proiettile/buff/debuff e Pepe con il kit completo.

**Architecture:** Le regole che il telefono prevede (barre da movimento, tocco/tenuto, buff, partenza delle speciali) stanno in `public/spintoni/shared.js` dentro `stepFighter`. Quello che solo il server decide (punti barra dai colpi, proiettili, debuff, KO) sta in `games/spintoni/sim.js`. I personaggi dichiarano `specials` e `meter` nel loro file `chars/<id>.js`.

**Tech Stack:** Node ≥18 senza dipendenze, `node --test`, canvas 2D nel browser.

**Spec:** `docs/superpowers/specs/2026-11-16-spintoni-abilita-design.md`

## Global Constraints

- Nessuna dipendenza esterna.
- Codice e commenti in italiano, nello stile dei file esistenti; ogni commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tutto ciò che decide il gioco ed è previsto dal telefono sta in `shared.js` o in `chars/`; il telefono non prevede proiettili né debuff.
- Banda: barre solo nello stato `ph` del proprio lottatore; proiettili e stati a tutti, compatti. Snapshot a 15/s (`S.SEND_EVERY`).
- `PHYS.holdSpecial = 0.35` s, `PHYS.meterDist = 400` unità per punto, `PHYS.meterDmg = 10` % per punto (ricevuto vale metà).
- Il tocco non viene mai ritardato: la mossa base parte alla pressione come oggi.
- Potenziato: tenuto = pugno caricato; speciale solo con **Potenziato tenuto + giù**.
- Personaggi senza `specials`: nessuna barra, nessun anello, nessuna suprema; comportamento identico a oggi.
- Testi visibili: "Basico" al posto di "Pugno", "Potenziato" al posto di "Forte".
- Tutti i test esistenti continuano a passare (`npm test`).

## Review Focus

1. Barra che si riempie **mentre** il pulsante è già tenuto oltre 0,35 s: la speciale non deve partire da sola (serve una pressione nuova). Test in Task 2.
2. Potenziato tenuto senza giù con barra piena: deve restare il pugno caricato, nessuna speciale. Test in Task 2.
3. Rientro dopo un KO: le barre restano (oggi `respawn()` rifà il lottatore da zero). Test in Task 3.
4. Proiettile in volo quando chi l'ha lanciato va KO o esce dalla partita: resta in volo e un KO che provoca vale per lui. Test in Task 4.
5. Suprema premuta senza 4 barre piene, o mentre si è in volo dopo un colpo (`hs > 0`): non succede nulla e le barre non cambiano. Test in Task 2.

---

### Task 1: Personaggi con `specials` e `meter`, barre da movimento

**Files:**
- Modify: `public/spintoni/shared.js` (`registerChar`, `PHYS`, `newFighter`, `FIELDS`/`physState`, `stepFighter`, `moveOf`, export)
- Test: `test/spintoni-abilita.test.js` (nuovo)

**Interfaces:**
- Produces:
  - `CHARS[id].specials` → `{ light, heavy, dodge, special, ultimate }` (ognuna una mossa completa: base `MOVES.light` + campi propri, come `registerChar` fa per le mosse) oppure `null` se il personaggio non le dichiara.
  - `CHARS[id].meter` → `{ move, hit }` (predefinito `{ move: 0.5, hit: 0.5 }`).
  - `S.SLOTS = ['light', 'heavy', 'dodge', 'special']`.
  - `moveOf(char, ty)`: per `ty` che inizia con `'sp:'` restituisce `CHARS[char].specials[ty.slice(3)]`.
  - Lottatore: `f.mt` = `{ light: 0, heavy: 0, dodge: 0, special: 0 }` se il personaggio ha `specials`, altrimenti `null`; incluso in `physState`.
  - `S.addMeter(f, points)`: aggiunge `points` a ogni barra, ognuna limitata al `charge` della sua speciale; nessun effetto se `f.mt` è `null`.
  - `S.meterFull(f, slot)` → `boolean`.

- [ ] **Step 1: Scrivi i test in `test/spintoni-abilita.test.js`**, registrando con `S.registerChar` un personaggio finto `test_ab` con `specials` (`charge` light 2, heavy 4, dodge 3, special 5, `ultimate` presente) e `meter: { move: 1, hit: 0 }`:
  - `abilità: moveOf risolve le speciali` → `S.moveOf('test_ab', 'sp:heavy')` è la mossa dichiarata (stesso `name`).
  - `abilità: personaggi senza specials non hanno barre` → `S.newFighter(0,0,'gilda').mt === null`.
  - `abilità: correre carica le barre in base al carattere` → lottatore `test_ab` a terra sull'isola, 60 passi con `mx: 1`: `f.mt.light > 0`, e `f.mt.light === f.mt.heavy` finché nessuna è piena; con `meter: { move: 0, hit: 1 }` (secondo personaggio finto) le barre restano 0.
  - `abilità: le barre non superano charge` → `S.addMeter(f, 100)` porta `f.mt` a `{ light: 2, heavy: 4, dodge: 3, special: 5 }` e `S.meterFull(f, 'dodge') === true`.
  - `abilità: in volo dopo un colpo non si carica` → `f.hs = 0.5`, `f.vx = 900`, 5 passi: barre invariate.
- [ ] **Step 2: Esegui** `node --test test/spintoni-abilita.test.js` → FAIL (`moveOf` non risolve `sp:`, `mt` indefinito).
- [ ] **Step 3: Implementa** in `shared.js`: `registerChar` costruisce `specials` (unendo ogni voce a `MOVES.light` come le altre mosse, `boxes` comprese) e `meter`; `PHYS.holdSpecial = 0.35`, `PHYS.meterDist = 400`, `PHYS.meterDmg = 10`; in `stepFighter` (solo con `hs <= 0`) `addMeter(f, distanza percorsa nel passo / PHYS.meterDist * meter.move)` calcolando la distanza da `x,y` prima e dopo `integrate`; `'mt'` in `FIELDS` (copiato come oggetto nuovo in `physState`).
- [ ] **Step 4: Esegui** `npm test` → tutto PASS.
- [ ] **Step 5: Commit** `Spintoni: barre delle abilità caricate dal movimento`.

### Task 2: Tocco e tenuto, speciali e suprema in `stepFighter`

**Files:**
- Modify: `public/spintoni/shared.js` (`newFighter`, `FIELDS`, `stepFighter`)
- Modify: `games/spintoni/sim.js` (`pushInput`)
- Test: `test/spintoni-abilita.test.js`

**Interfaces:**
- Consumes: `moveOf`, `f.mt`, `S.meterFull`, `S.SLOTS` (Task 1).
- Produces:
  - Input: `inp.hb` bitmask dei pulsanti tenuti (1 Basico, 2 Potenziato, 4 Schiva, 8 Speciale) e `inp.ul` (suprema appena premuta). Sul filo: campi `hb` (intero 0..15) e `ul` (0/1); `pushInput` li valida (`hb` intero tra 0 e 15, altrimenti 0).
  - Lottatore: `f.ht` = `{ light, heavy, dodge, special }` secondi di pressione continua (azzerati al rilascio), in `physState`; `f.spArm` = `{ light, heavy, dodge, special }` booleano "questa pressione può ancora far partire la speciale", in `physState`.
  - Speciale partita: `f.att = { ty: 'sp:<slot>', dir: 'side', t: 0, air: !f.g, id, c: 0, rel: true }`, `f.mt[slot] = 0`, `f.dg = 0`.
  - Suprema partita: `f.att.ty = 'sp:ultimate'`, tutte le barre a 0.

- [ ] **Step 1: Scrivi i test** (personaggio `test_ab` del Task 1, barre riempite con `S.addMeter(f, 100)` dove serve; passi da `S.TICK`):
  - `tenuto: il tocco parte subito anche con la barra piena` → pressione `l: true, hb: 1` al primo passo: `f.att.ty === 'light'` subito.
  - `tenuto: oltre holdSpecial parte la speciale e svuota la barra` → `hb: 1` tenuto per 12 passi (0,4 s): `f.att.ty === 'sp:light'`, `f.mt.light === 0`, altre barre invariate.
  - `tenuto: con la barra non piena resta la mossa base` → stesso input senza riempire: nessun `sp:`.
  - `tenuto: barra che si riempie a pressione già lunga non fa partire nulla` → tieni `hb: 1` per 15 passi con barra vuota, poi `S.addMeter(f, 100)` e altri 5 passi tenuti: nessun `sp:light`; rilascia (`hb: 0`) e ripremi per 12 passi: parte.
  - `tenuto: Potenziato senza giù resta il pugno caricato` → `h: true` poi `hb: 2, hd: true` per 20 passi con barra piena: `f.att.ty === 'heavy'` e `f.att.c > 0`.
  - `tenuto: Potenziato + giù fa la speciale` → stesso con `down: true`: `f.att.ty === 'sp:heavy'`.
  - `tenuto: Schiva tenuta interrompe la schivata` → `d: true, hb: 4` per 12 passi con barra piena: `f.att.ty === 'sp:dodge'` e `f.dg === 0`.
  - `suprema: serve avere 4 barre piene e le svuota tutte` → `ul: true` con 3 barre piene: niente; con 4: `f.att.ty === 'sp:ultimate'` e tutte le barre a 0.
  - `suprema: ignorata in volo dopo un colpo` → 4 barre piene, `f.hs = 0.3`, `ul: true`: niente e barre invariate.
  - `tenuto: personaggi senza specials ignorano hb e ul` → Gilda con `hb: 15, ul: true` per 15 passi si comporta come senza (nessun `sp:`).
- [ ] **Step 2: Esegui** `node --test test/spintoni-abilita.test.js` → FAIL.
- [ ] **Step 3: Implementa** in `stepFighter`, prima della gestione del buffer degli attacchi e solo con `f.mt` e `hs <= 0`: per ogni slot aggiorna `f.ht[slot]` (premuto in `inp.hb` → `+= dt`, altrimenti `0` e `spArm[slot] = true`); quando `ht` supera `PHYS.holdSpecial` in questo passo, se `spArm[slot]` e `meterFull` (per `heavy` anche `inp.down`) parte la speciale, altrimenti `spArm[slot] = false`. `inp.ul` con tutte le barre piene fa partire la suprema. Le speciali non usano il buffer (`f.buf = null`).
- [ ] **Step 4: Esegui** `npm test` → PASS.
- [ ] **Step 5: Commit** `Spintoni: speciali a pressione prolungata e suprema`.

### Task 3: Buff, debuff, colpi senza lancio, barre dai colpi

**Files:**
- Modify: `public/spintoni/shared.js` (`statOf`, `stepFighter`, `physState`)
- Modify: `games/spintoni/sim.js` (`launch`, `applyHit`, `respawn`, `snapshot`)
- Test: `test/spintoni-abilita.test.js`

**Interfaces:**
- Consumes: Task 1–2.
- Produces:
  - Mossa: `buff: { at, dur, speed, power, weight, jump }` (moltiplicatori, mancanti = 1) applicato a chi la usa quando `att.t` supera `at`; `debuff: {...stessi campi}` applicato a chi viene colpito; `noLaunch: true` = danno e debuff senza lancio né interruzione.
  - Lottatore: `f.sts` = elenco `{ k: 'b'|'d', t, speed, power, weight, jump }`, scalato in `stepFighter`, rimosso a `t <= 0`; in `physState`.
  - `S.statOf(f, key)` → `CHARS[f.char][key]` moltiplicato per tutti gli stati attivi; `stepFighter` usa `statOf` per `speed` e `jump`, `sim.launch` per `power` (attaccante) e `weight` (colpito).
  - Snapshot a tutti: `bf` = `'b'`, `'d'` o `'bd'` se ci sono stati attivi (omesso altrimenti).
  - Server: nei colpi `addMeter(attaccante, danno / PHYS.meterDmg * meter.hit)` e `addMeter(colpito, danno / PHYS.meterDmg * meter.hit / 2)`.

- [ ] **Step 1: Scrivi i test:**
  - `buff: aumenta la velocità per dur secondi poi finisce` → mossa finta con `buff: { at: 0, dur: 1, speed: 1.4 }`: dopo l'uso `S.statOf(f,'speed') ≈ CHARS.test_ab.speed * 1.4`; dopo 1,1 s torna normale.
  - `debuff: chi viene colpito rallenta` → due lottatori in `Sim`, colpo con `debuff: { dur: 3, speed: 0.6 }`: `statOf(v,'speed') ≈ 0.6 ×` base; snapshot `bf === 'd'` per `v`.
  - `noLaunch: danno senza lancio` → `v.dmg > 0`, `v.hs === 0`, `v.vx === 0`.
  - `barre: colpire carica chi colpisce, ricevere carica a metà` → con `meter: { move: 0, hit: 1 }`: punti attaccante = 2 × punti colpito.
  - `rientro: le barre restano dopo un KO` → barre piene, `sim.ko(f)`, passi fino al rientro: `f.mt` invariato e `f.sts` vuoto.
- [ ] **Step 2: Esegui** → FAIL.
- [ ] **Step 3: Implementa** come da Interfaces; `respawn` conserva `mt` (non `sts`); `noLaunch` riusa il ramo `armor` di `launch`.
- [ ] **Step 4: Esegui** `npm test` → PASS.
- [ ] **Step 5: Commit** `Spintoni: buff, debuff e colpi senza lancio`.

### Task 4: Proiettili

**Files:**
- Modify: `games/spintoni/sim.js` (`Sim`: `shots`, `spawnShots`, `stepShots`, `resolveHits`, `snapshot`)
- Test: `test/spintoni-abilita.test.js`

**Interfaces:**
- Consumes: `moveOf`, `launch`, debuff/noLaunch (Task 3).
- Produces:
  - Mossa: `projectile` = oggetto o elenco di `{ at, speed, ang, grav, life, box: { w, h }, dmg, base, growth, kbAng, pierce, debuff, noLaunch, dx, dy }` (`ang` gradi rispetto all'avanti, negativo = in alto; `dx, dy` punto di partenza rispetto ai piedi, `dx` in avanti).
  - `sim.shots`: `{ id, owner, kind: '<char>:<slot>', x, y, vx, vy, grav, life, w, h, face, hit: Set, ... }`; nasce quando l'attacco di chi lo lancia supera `at` (una volta per attacco: marca su `f.att`).
  - Collisioni: avversari vivi diversi dal proprietario; `inv > 0` lo lascia passare; finestra `counter` lo distrugge (evento `counter`, nessuna risposta); `armor` prende il danno senza lancio; senza `pierce` sparisce al primo colpo; sparisce a `life <= 0`, fuori dai bordi di esplosione o dentro il rettangolo dell'isola (`STAGE.main`), non contro le piattaforme sospese.
  - Il colpo usa `launch(owner, v, { ..., face: shot.face })` anche se il proprietario è KO o uscito.
  - Snapshot a tutti: `p: [[id, kind, x, y, face], ...]` (x, y a 1 decimale), omesso se vuoto. Evento `shot` alla nascita: `{ t: 'shot', id: owner, kind, x, y }`.

- [ ] **Step 1: Scrivi i test:**
  - `proiettile: nasce a 'at', vola e colpisce` → mossa finta con `projectile: { at: 0.1, speed: 900, ang: 0, grav: 0, life: 1.5, box: { w: 30, h: 30 }, dmg: 6, base: 300, growth: 6, kbAng: 30, dy: -50 }`, avversario a 400 unità davanti: `sim.shots.length === 1` dopo `at`, poi l'avversario ha `dmg > 0` e il proiettile non c'è più.
  - `proiettile: scade dopo life` → nessun bersaglio: dopo `life` + 0,1 s `sim.shots.length === 0`.
  - `proiettile: la schivata lo fa passare` → avversario con `inv = 1`: `dmg === 0` e proiettile ancora in volo dopo averlo superato.
  - `proiettile: la parata lo distrugge senza risposta` → avversario in finestra `counter`: proiettile sparito, nessun danno a nessuno, evento `counter`.
  - `proiettile: elenco di proiettili` → mossa con 5 proiettili: 5 in `sim.shots`.
  - `proiettile: resta in volo se chi l'ha lanciato va KO e il KO vale per lui` → dopo il lancio `sim.ko(owner)`; il proiettile butta fuori l'avversario: `owner.kos === 1`.
  - `proiettile: nello snapshot` → `snap.p[0]` ha 5 elementi e `kind` `'test_ab:light'`.
- [ ] **Step 2: Esegui** → FAIL.
- [ ] **Step 3: Implementa** `spawnShots()` dopo il passo dei lottatori, `stepShots(dt)` prima di `resolveHits`, i colpi dei proiettili applicati insieme a quelli corpo a corpo (stessa regola "tutti insieme").
- [ ] **Step 4: Esegui** `npm test` → PASS.
- [ ] **Step 5: Commit** `Spintoni: proiettili`.

### Task 5: Kit di Pepe

**Files:**
- Modify: `public/spintoni/chars/pepe.js`
- Test: `test/spintoni-abilita.test.js`

**Interfaces:**
- Consumes: Task 1–4.
- Produces: `CHARS.pepe.specials` con i nomi esatti dello spec e `meter: { move: 0.7, hit: 0.3 }`.

| slot | name | contenuto | charge |
|---|---|---|---|
| light | Pugno di vento | proiettile piccolo e veloce, poco danno (es. speed 1100, dmg 4) | 4 |
| heavy | Palla di fuoco | proiettile lento e grande, spinge forte (es. speed 520, box 60×60, dmg 12, base 520) | 8 |
| dodge | Turbo | `buff { dur: 4, speed: 1.4, jump: 1.4 }`, mossa brevissima | 6 |
| special | Polverone | zona grande attorno (`boxes.side` ~ 200×160 centrata), `noLaunch`, `debuff { dur: 3, speed: 0.6, jump: 0.75 }` | 7 |
| ultimate | Tempesta di fuoco | 5 palle di fuoco a ventaglio (ang -30..30) + `buff` Turbo | — |

Ogni voce ha `desc` in italiano, `anim` tra quelle esistenti (`light_side`, `heavy_side`, `dodge`, `heavy_up`) e `fx` coerenti (le particelle esistenti di Pepe). Numeri da ritoccare giocando.

- [ ] **Step 1: Scrivi il test** `pepe: kit completo` → `Object.keys(CHARS.pepe.specials)` = i 5 slot, ogni `name` come in tabella, `charge` di `heavy` > `light` (più forte = più lenta), in `Sim` ogni speciale usata con la barra piena produce: light/heavy un proiettile, dodge uno stato `'b'`, special su un avversario vicino uno stato `'d'` senza lancio, ultimate 5 proiettili e uno stato `'b'`.
- [ ] **Step 2: Esegui** → FAIL. **Step 3: Implementa** i dati. **Step 4:** `npm test` → PASS (aggiorna `test/spintoni-chars.test.js` solo se controlla campi che cambiano).
- [ ] **Step 5: Commit** `Spintoni: Pepe con 4 speciali e la suprema`.

### Task 6: Comandi e interfaccia sul telefono e sul computer

**Files:**
- Modify: `public/spintoni/index.html`, `public/spintoni/style.css`, `public/spintoni/app.js`, `public/spintoni/draw.js`
- Test: `test/static.test.js` (testi), prova nel browser

**Interfaces:**
- Consumes: input `hb`/`ul` (Task 2), snapshot `ph.mt`, `p`, `bf`, evento `shot` (Task 3–4).
- Produces: `D.projectile(ctx, kind, x, y, face, now)` e `D.statusAura(ctx, x, y, bf, now)` in `draw.js`.

- [ ] **Step 1: Test statico** `spintoni: i pulsanti si chiamano Basico e Potenziato` → `/spintoni/` contiene `BASICO`, `POTENZIATO` e un pulsante `data-act="ul"` nascosto; non contiene `PUGNO` né `FORTE`.
- [ ] **Step 2: Esegui** → FAIL.
- [ ] **Step 3: Implementa:**
  - testi Pugno/Forte → Basico/Potenziato in pulsanti, aiuti e `desk-help` (tasto **I** = suprema);
  - `sendInput` manda `hb` dai tasti tenuti (J/Z, K/X, L/C/Maiusc, U/V) e dai pulsanti tenuti, `ul` da I o dal pulsante della suprema;
  - anello di carica su ogni pulsante (`--m` 0..1 da `pred.mt / charge`) e pulsante suprema visibile solo con 4 barre piene;
  - sul computer l'indicatore in basso mostra le 4 barre e la suprema;
  - proiettili interpolati tra snapshot come gli avversari, disegnati con `D.projectile` (colori `fx` del personaggio, `kind` → personaggio);
  - aura `b` (alone del colore del personaggio) e `d` (nuvola grigia) con `D.statusAura`;
  - scheda del lottatore in sala d'attesa: elenco speciali (nome, pulsante, descrizione) e suprema.
- [ ] **Step 4: Esegui** `npm test` → PASS; avvia il server (`.claude/launch.json`, nome `minigiochi`), partita con Pepe contro 1 bot: prova ogni speciale e la suprema da tastiera, controlla la console senza errori.
- [ ] **Step 5: Commit** `Spintoni: comandi Basico/Potenziato, barre sui pulsanti, proiettili e aure`.

### Task 7: Bot e documentazione

**Files:**
- Modify: `games/spintoni/sim.js` (`think`), `README.md` (sezione Spintoni)
- Test: `test/spintoni-abilita.test.js`

**Interfaces:**
- Consumes: tutto quanto sopra.

- [ ] **Step 1: Test** `bot: usa la suprema e le speciali quando sono pronte` → bot Pepe con 4 barre piene e un avversario a 300 unità: entro 3 s di simulazione (rng fissa) parte `sp:ultimate`; con una sola barra piena e un avversario vicino entro 5 s parte quella speciale.
- [ ] **Step 2: Esegui** → FAIL.
- [ ] **Step 3: Implementa** in `think`: suprema appena disponibile con un avversario entro 600 unità; altrimenti, con probabilità come le speciali di oggi, una speciale a barra piena (proiettili a distanza media 150–600, le altre da vicino), simulando la pressione tenuta (`hb` per `PHYS.holdSpecial` + un passo; per `heavy` anche `down`).
- [ ] **Step 4: Aggiorna il README**: Basico/Potenziato, tocco e tenuto, barre e carattere, suprema, tabella dei campi nuovi (`specials`, `meter`, `projectile`, `buff`, `debuff`, `noLaunch`), kit di Pepe. `npm test` → PASS.
- [ ] **Step 5: Commit** `Spintoni: i bot usano speciali e suprema; README aggiornato`.
