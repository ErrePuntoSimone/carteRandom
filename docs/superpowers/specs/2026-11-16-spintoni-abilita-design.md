# Spintoni: abilità con speciali nascoste e suprema

Data: 2026-11-16 · Stato: approvato dall'utente

## Perché

Il roster di Spintoni crescerà, un personaggio alla volta (anche i disegni). Ogni personaggio deve avere un
carattere riconoscibile anche nel modo in cui combatte: da lontano, da vicino o misto. Serve un sistema di
abilità che dia profondità senza aggiungere pulsanti al telefono e che permetta di creare personaggi nuovi
soprattutto descrivendoli a dati.

## Come si gioca (deciso con l'utente)

- **Pulsanti invariati**: Salta, **Basico**, **Potenziato**, Schiva, Speciale (oggi "Pugno" e "Forte").
  Basico e Potenziato cambiano da personaggio a personaggio: possono essere colpi da vicino, a distanza o misti.
- Basico, Potenziato, Schiva e Speciale sono le **4 abilità**. **Tocco** = abilità base. **Tenuto premuto** =
  la **speciale** di quell'abilità, diversa per ogni personaggio.
- Ogni speciale ha una **barra** che si carica combattendo. **Più la speciale è forte, più si carica lentamente.**
  Il ritmo dipende dal **carattere del personaggio** (quanto pesa muoversi e quanto pesa colpire).
- Con **tutte e 4 le barre piene** compare un **pulsante nuovo** per la **suprema**. Usarla **svuota tutte e 4
  le barre**, perché è potentissima.
- Tipi di speciale previsti nel tempo: **a distanza**, **potenziamenti (buff)**, **alleati evocati**,
  **indebolimenti (debuff) degli avversari**, mosse legate alla storia del personaggio.
- Costruzione **mista**: il motore conosce dei "mattoni" generici che i personaggi compongono a dati nel proprio
  file; un gancio di codice (`hooks`, già predisposto e mai usato) solo per le abilità davvero uniche.

## Obiettivi

1. Barre di carica per abilità, con ritmo per personaggio, calcolate dal server e previste dal telefono.
2. Tocco/tenuto su Basico, Potenziato, Schiva, Speciale; pulsante e tasto della suprema.
3. Mattoni nuovi nel motore: **proiettile**, **buff**, **debuff**. (Gli esistenti restano: scatto `motion`,
   `armor`, `counter`, `lunge`, `chargeable`.)
4. Rinomina Pugno/Forte in Basico/Potenziato ovunque si vedano (pulsanti, aiuti, README); Basico e Potenziato
   possono a loro volta usare il mattone proiettile (personaggi a distanza).
5. **Un personaggio completo** come primo assaggio: **Pepe**, con 4 speciali e la suprema. Gli altri 3 si fanno
   dopo, uno alla volta, con questo stesso schema.
6. I bot usano speciali e suprema quando le barre sono piene.
7. Effetti visivi delle cose nuove (proiettili, aura dei buff/debuff, barre), nello stile `fx` già esistente.

## Non obiettivi (per ora)

- Mattone **alleati evocati** (serve un'IA propria per l'alleato): viene dopo, con il primo personaggio che lo usa.
- Speciali e suprema di Gilda, Micio, Tonno (passi successivi, uno alla volta).
- Musica e suoni (progetto a parte, da discutere: tema per personaggio coerente con la storia o su richiesta).
- Personaggi nuovi e nuovi disegni/animazioni.
- Combo a catena.

## Anti-obiettivi (sarebbe un fallimento anche se "funziona")

- Il tocco diventa lento o impreciso: chi non usa le speciali deve sentire il gioco reattivo come oggi.
- Telefono e server non d'accordo (il proprio lottatore che "scatta" indietro).
- La banda torna a crescere sensibilmente (vincolo del piano gratuito di Render).
- Speciali scatenate per sbaglio.

## Vincoli

- Tutto ciò che decide il gioco sta in `public/spintoni/shared.js` e nei file `chars/`, perché gira uguale sul
  server (autorità, `games/spintoni/sim.js`) e sul telefono (previsione).
- Banda: snapshot a 15/s, ~850 byte. Le barre vanno solo al proprio telefono (dentro `ph`); proiettili e
  stati (buff/debuff) a tutti, compatti.
- Telefono: niente pulsanti in più oltre a quello della suprema, che compare solo quando è disponibile.
- Nessuna dipendenza esterna (regola del progetto).

## Approcci considerati

1. **Tutto a dati**: mattoni generici nel motore, i personaggi li compongono. Coerente e sincronizzato, ma ogni
   abilità unica richiede prima un mattone nuovo.
2. **Codice libero per personaggio**: massima libertà, più rischio di disaccordi server/telefono e più lavoro.
3. **Misto (scelto dall'utente)**: approccio 1 per quasi tutto, gancio `hooks` per le rare abilità uniche.

## Design

### Dati del personaggio (`chars/<id>.js`)

```js
moves: {
  light: {...},    // Basico (parte da MOVES.light, sovrascrivibile; può avere `projectile`)
  heavy: {...},    // Potenziato
  special: {...},  // speciale base del pulsante Speciale (le attuali Turbine, Contrattacco, Affondo, Carica)
},
// speciali nascoste: una per abilità, più la suprema
specials: {
  light:   { name, desc, charge: 6,  ...mossa },  // charge = "punti" per riempire la barra: più forte, più alto
  heavy:   { name, desc, charge: 10, ...mossa },
  dodge:   { name, desc, charge: 8,  ...mossa },
  special: { name, desc, charge: 12, ...mossa },
  ultimate:{ name, desc, ...mossa },              // nessuna barra propria: richiede le 4 piene
},
meter: { move: 0.7, hit: 0.3 },  // carattere: quanto pesa muoversi e quanto colpire (somma 1)
```

Una speciale è una mossa come le altre (`startup`, `active`, `recovery`, `boxes`, `motion`, `armor`...) più i
mattoni nuovi qui sotto. La speciale base del pulsante Speciale (tocco) tiene il suo `cooldown` attuale
(scelta di Claude: altrimenti si potrebbe ripetere all'infinito).

### Barre (motore)

- Per ogni lottatore `meter = { light, heavy, dodge, special }`, ognuna da 0 a `charge` della relativa speciale.
- Ogni passo: punti movimento = distanza percorsa / 400 × `meter.move`; punti colpo = danno inflitto / 10 ×
  `meter.hit`, ricevuto a metà (chi le prende si ricarica un po': evita che chi perde resti a secco).
  I punti si aggiungono **uguali a tutte e 4 le barre**: la differenza di velocità la fa `charge`.
- Una barra piena resta piena finché non si usa la speciale. Rientro dopo un KO: le barre restano.
- Le costanti 400 e 10 sono da tarare giocando (in `PHYS`).

### Tocco e tenuto (deciso con l'utente)

- Il telefono manda, oltre a "appena premuto", lo stato **tenuto** dei 4 pulsanti (un campo bitmask nell'input).
- **Il tocco parte sempre subito**, come oggi, con la barra piena o no: nessun ritardo.
- Se la barra di quell'abilità è piena e il pulsante resta premuto oltre `PHYS.holdSpecial` (**0,35 s**, costante
  da ritoccare giocando), la speciale **interrompe** la mossa base e parte al suo posto; la barra si svuota.
- **Potenziato**: tenuto da solo resta il pugno caricato di oggi (fino a 2 s). La sua speciale parte con
  **Potenziato tenuto + giù** (barra piena, oltre 0,35 s). Quindi con la barra piena il Potenziato verso il basso
  caricato non si fa: tenendo giù parte la speciale.
- L'idea "tocco + su" è scartata: su con Basico/Potenziato è già il colpo verso l'alto.
- La **suprema**: pulsante proprio (telefono: compare sopra gli altri, pulsato; computer: tasto **I**),
  attivo solo con 4 barre piene. Un tocco basta. Svuota tutte e 4 le barre.

### Mattoni nuovi

- **Proiettile** (`projectile: { at, speed, ang, grav, life, box, dmg, base, growth, kbAng, returns, pierce }`):
  nasce al tempo `at` della mossa davanti al lottatore, vola, colpisce il primo avversario (o tutti con
  `pierce`), sparisce a fine `life` o fuori arena; `returns` lo fa tornare indietro (scudo di Micio, dopo).
  Simulato dal server, inviato a tutti nello snapshot (`p: [[id, tipo, x, y], ...]`), disegnato dal telefono
  interpolando. Il telefono non prevede i proiettili (si vedono con il ritardo dei nemici: accettabile).
- **Buff** (`buff: { at, dur, speed, power, weight, jump }`): moltiplicatori temporanei sulle statistiche di
  chi usa la mossa. Previsto anche dal telefono (sta in `ph`).
- **Debuff** (`debuff: { dur, speed, power, weight, jump }` dentro una mossa o un proiettile): applicato a chi
  viene colpito. Esempi: rallentato, indebolito.
- Buff e debuff attivi di ogni lottatore vanno a tutti nello snapshot come sigla corta per gli effetti visivi.

### Scelte di Claude dopo la revisione (da controllare)

- **Proiettili e difese:** la parata (`counter`) distrugge il proiettile senza rispondere a distanza; la corazza
  (`armor`) prende il danno ma non il lancio, come per i colpi; schivata e protezione dopo il rientro (`inv`) lo
  lasciano passare; i proiettili non si scontrano tra loro; si fermano contro l'isola, non contro le piattaforme
  sospese; se chi li ha lanciati va KO restano in volo.
- **Debuff senza lancio:** una mossa o un proiettile con `noLaunch` applica danno e debuff ma non lancia né
  interrompe (stesso percorso della corazza). Serve al Polverone.
- **Polverone** è la zona di colpo della mossa (grande, attorno a Pepe), non una nube che resta nell'arena: niente
  mattone "zona" per ora.
- **Personaggi senza `specials`** (Gilda, Micio, Tonno finché non tocca a loro): niente barre, anelli né suprema;
  i loro pulsanti funzionano come oggi.
- La **suprema** può contenere più proiettili (`projectile` può essere un elenco) e un buff insieme.
- Mentre si viene lanciati non si accumulano punti movimento (altrimenti chi le prende si ricarica volando).

### Pepe (primo personaggio completo, kit approvato dall'utente)

Leggerissimo e velocissimo, scintille arancio. Ritmo barre: `meter: { move: 0.7, hit: 0.3 }` (si carica
correndo e saltando).

| Abilità | Tocco | Tenuto (speciale) | Tipo |
|---|---|---|---|
| Basico | pugno veloce | **Pugno di vento**: piccolo proiettile veloce, poco danno | distanza |
| Potenziato | pugno forte caricabile | **Palla di fuoco**: proiettile lento e grande, spinge forte | distanza |
| Schiva | schivata | **Turbo**: +40% velocità e salto per 4 s | buff |
| Speciale | Turbine | **Polverone**: nube attorno che rallenta chi tocca per 3 s | debuff |
| Suprema | — | **Tempesta di fuoco**: 5 palle di fuoco a ventaglio + Turbo | distanza + buff |

### Interfaccia

- Sul telefono: anello di carica attorno a ognuno dei 4 pulsanti; pulsante della suprema che compare.
- Sul computer: 4 piccole barre e la suprema nell'indicatore in basso (dove oggi c'è "⚡ Speciale pronta").
- Nella scelta del lottatore: elenco delle 4 speciali e della suprema con nome e descrizione.

### Bot

- Usano una speciale a caso tra quelle con barra piena quando sono vicini (o a distanza media, per i proiettili),
  la suprema appena disponibile con qualcuno a tiro.

### Test

- Simulazione: barre che si caricano con il ritmo del personaggio; tocco vs tenuto con barra piena e non;
  suprema che compare solo a 4 barre piene e le svuota; proiettile che colpisce e scade; buff e debuff che
  cambiano velocità e lancio e finiscono; previsione del telefono uguale al server per buff e barre.
- API: lo snapshot contiene barre (solo per sé), proiettili e stati.

## Lasciato al costruttore

- Taratura numerica (punti di carica, danni, durate), da rifinire giocando.
- Formato esatto di input e snapshot, purché compatto.
- Disegno grafico di proiettili, aure e anelli (nello stile `fx`).
- Se il pulsante Speciale tenga il `cooldown` della speciale base: proposta di tenerlo.

## Seguito: kit di Gilda, Micio e Tonno (approvati dall'utente)

Stesso schema di Pepe, con un carattere diverso per ognuno: Gilda mista (`meter` 0,5/0,5), Micio da vicino e media
distanza (0,4/0,6), Tonno da vicino (0,25/0,75). Nomi e mosse come nel README ("Kit di Gilda/Micio/Tonno").
Mattone nuovo: `returns` sul proiettile (Scudo boomerang): a metà vita inverte la direzione e può colpire di nuovo
(implica `pierce`). Un proiettile lancia verso dove vola, così l'onda all'indietro del Maremoto spinge all'indietro.
Numeri da tarare giocando.
