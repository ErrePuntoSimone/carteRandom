# Minigiochi 🎲

Raccolta di minigiochi da usare con gli amici, pensata per lo smartphone.
La pagina iniziale chiede il tuo nome (una volta sola, resta salvato sul dispositivo) e poi mostra il menu da cui si sceglie il gioco.
Il nome si cambia dalla home o dal link "Cambia nome" dentro ai giochi.

| Gioco | Percorso | Descrizione |
|---|---|---|
| 🃏 **Carte Random** | `/carte/` | Multiplayer: crea una stanza e dai una carta a caso a ogni giocatore |
| ♠️ **Poker** | `/poker/` | Multiplayer: gestisce una partita intera con le carte vere (turni, dealer, bui, puntate, fiches) |
| 🏆 **Briscola** | `/briscola/` | Multiplayer: briscola con il mazzo napoletano, in 2 o in 4 a coppie |
| 🪙 **Conta fiches** | `/fiches/` | Conta le fiches di ogni giocatore a poker e calcola chi paga chi |

## Carte Random

Se apri il link di una stanza senza aver inserito il nome, passi prima dalla home e poi torni alla stanza.

1. Una persona crea una stanza e riceve un codice di 5 caratteri (o un link da condividere).
2. Gli amici entrano dal proprio telefono con il codice o il link.
3. Chi ha creato la stanza (host) sceglie il mazzo e preme **Distribuisci**:
   ogni giocatore riceve una carta diversa, visibile solo a lui (tocca la carta per scoprirla).
4. L'host può **ridistribuire** quante volte vuole e **mostrare tutte le carte** a tutti.

Mazzi: carte francesi (52), francesi + Jolly (54), napoletane (40) e **mazzo personalizzato**
(una carta per riga, anche ripetute, es. ruoli per Lupus in Tabula).
Le carte vengono estratte senza ripetizioni, quindi servono almeno tante carte quanti giocatori.

## Poker

Texas Hold'em no-limit con le carte vere: l'app fa da "banco" e tiene i conti.
Ognuno si siede al tavolo dal proprio telefono con il codice o il link.
I giocatori sono disegnati intorno a un tavolo da poker (tu sei sempre in basso, gli altri in ordine di gioco),
con il piatto, le carte comuni da girare, le puntate davanti a ognuno e il bottone del dealer.

- **Ordine al tavolo:** prima della partita e tra una mano e l'altra ognuno può spostarsi
  "prima" o "dopo" nel giro (si scambia con il vicino), così l'ordine corrisponde a come siete seduti.
- **Dealer e bui:** il bottone gira da solo a ogni mano, i bui vengono messi in automatico
  (in due giocatori il dealer mette il piccolo buio, come da regolamento).
- **Turni:** l'app dice a chi tocca e cosa fare con le carte ("gira il flop", "gira il turn"…).
- **Azioni:** fold, check, chiama, punta/rilancia (con scorciatoie min, ½ piatto, piatto, all-in).
  Rispetta il rilancio minimo e gli all-in che non riaprono le puntate.
- **Piatti laterali:** calcolati da soli quando qualcuno è all-in; le puntate non chiamate tornano indietro.
- **Showdown:** l'host o il dealer toccano chi ha vinto ogni piatto (anche più di uno per dividerlo).
- **Gestione (host):** fiches iniziali e bui, ordine dei posti, scelta del dealer, correzione degli stack,
  ricariche, giocatori che saltano le mani, rimozione. L'host o il dealer possono agire per chi ha il telefono scarico.
- **Uscite:** chi esce durante una mano lascia le carte (fold) e viene tolto a fine mano.

## Briscola

Il classico con il mazzo napoletano da 40 carte. Il numero di giocatori è fisso:
chi crea il tavolo sceglie **2 giocatori** oppure **4 a coppie** (i compagni sono uno di fronte all'altro),
e il tavolo non accetta altre persone.

- Tre carte a testa; la carta dopo la distribuzione è la **briscola**, scoperta in fondo al mazzo.
- Si gioca una carta a testa: prende la briscola più alta o, se non ce ne sono, la carta più alta del seme di uscita
  (Asso, Tre, Re, Cavallo, Fante, 7, 6, 5, 4, 2). Chi prende pesca per primo e gioca per primo.
- Le carte sono disegnate in SVG come quelle napoletane vere: monete, coppe, spade e bastoni nodosi, con i simboli
  disposti come sul mazzo e le figure di Fante, Cavallo e Re (`public/briscola/cards.js`). Una stella segna le briscole.
- Per giocare una carta la si tocca due volte (la prima la seleziona), così si evitano errori.
- Ognuno vede solo le proprie carte; la presa resta sul tavolo un attimo prima di essere raccolta.
- A fine partita si contano i punti (Asso 11, Tre 10, Re 4, Cavallo 3, Fante 2): vince chi supera 60 su 120.
  Il mazziere ruota a ogni partita e si tiene il conto delle partite vinte.
- In 4, prima di iniziare, con "Gioca prima/dopo" si scelgono le coppie. Chi esce interrompe la partita.

## Conta fiches

Funziona su un solo dispositivo, senza server: i dati restano salvati nel browser.

- **Impostazioni:** fiches con nome, colore e valore (5 · 10 · 25 · 100 · 500 di default) e cambio del buy-in
  (es. 10 € = 1000 punti).
- **Giocatori:** per ognuno si inseriscono le fiches per colore con i pulsanti − / + o scrivendo il numero,
  e quanti buy-in ha fatto (per i rebuy).
- **Riepilogo:** punti sul tavolo, punti attesi e controllo che i conti tornino.
- **Chi paga chi:** i pagamenti per andare in pari, con il minor numero di passaggi.

## Avvio

Richiede Node.js 18 o superiore, nessuna dipendenza da installare.

```bash
npm start          # http://localhost:3000  (porta configurabile con PORT=8080)
npm test
```

Per giocare con altri sulla stessa rete Wi‑Fi, aprite `http://<IP-del-computer>:3000`.

## Struttura

```
server.js              server principale: menu, file statici, smista /api/<gioco>/...
lib/http.js            utility HTTP condivise
lib/rooms.js           stanze multiplayer riutilizzabili (codici, giocatori, tempo reale)
games/carte/           logica lato server di Carte Random (stanze, mazzi)
games/poker/engine.js  regole del poker (puro, testato a parte)
games/poker/server.js  API del poker sopra lib/rooms.js
games/briscola/        regole (engine.js) e API (server.js) della Briscola
public/index.html      menu dei minigiochi
public/common.css      stile condiviso
public/common.js       nome del giocatore ("login") condiviso tra i giochi
public/carte/          interfaccia di Carte Random
public/poker/          interfaccia del Poker
public/briscola/       interfaccia della Briscola
public/fiches/         Conta fiches (solo lato browser)
test/                  test automatici
```

Chi apre un link d'invito (`/<gioco>/r/CODICE`) vede subito un grande pulsante "Entra" con il codice della stanza,
mentre creare una nuova stanza resta un'alternativa discreta: così non si crea una stanza per sbaglio.

Per aggiungere un minigioco: crea `public/<nome>/index.html`, aggiungi la voce al menu in
`public/index.html` e, se serve un server, crea `games/<nome>/server.js` e registralo in `API` dentro `server.js`.
Per un gioco multiplayer conviene usare `lib/rooms.js` (vedi `games/poker/server.js`).

In Carte Random ogni giocatore riceve uno stato personalizzato, quindi le carte degli altri non arrivano mai al suo browser
finché l'host non le rivela. Le stanze sono in memoria: si perdono al riavvio del server e vengono eliminate dopo 6 ore di inattività.

## Pubblicazione su Render

Il repository contiene `render.yaml`: su render.com scegli **New → Blueprint**, seleziona il repository e conferma.
In alternativa, **New → Web Service** con *Start Command* `npm start` e *Health Check Path* `/healthz`.
Il piano gratuito mette l'app in pausa dopo un po' di inattività (il primo caricamento è lento) e le stanze in memoria si perdono al riavvio.
