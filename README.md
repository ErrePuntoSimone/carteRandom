# Carte Random 🃏

Webapp multiplayer che dà **una carta a caso a ogni giocatore**.

1. Una persona crea una stanza e riceve un codice di 5 caratteri (o un link da condividere).
2. Gli amici entrano dal proprio telefono con il codice o il link.
3. Chi ha creato la stanza (host) sceglie il mazzo e preme **Distribuisci**:
   ogni giocatore riceve una carta diversa, visibile solo a lui (tocca la carta per scoprirla).
4. L'host può **ridistribuire** quante volte vuole e **mostrare tutte le carte** a tutti.

## Mazzi disponibili

- Carte francesi (52)
- Carte francesi + Jolly (54)
- Carte napoletane (40)
- **Mazzo personalizzato**: una carta per riga, anche ripetute (es. ruoli per Lupus in Tabula)

Le carte vengono sempre estratte senza ripetizioni dal mazzo, quindi servono almeno tante carte quanti giocatori.

## Avvio

Richiede Node.js 18 o superiore, nessuna dipendenza da installare.

```bash
npm start          # http://localhost:3000  (porta configurabile con PORT=8080)
npm test
```

Per giocare con altri sulla stessa rete Wi‑Fi, aprite `http://<IP-del-computer>:3000`.

## Come funziona

- `server.js` — server HTTP in Node puro: API JSON per stanze e azioni, aggiornamenti in tempo reale via Server‑Sent Events. Ogni giocatore riceve uno stato personalizzato, quindi le carte degli altri non arrivano mai al suo browser finché l'host non le rivela.
- `decks.js` — definizione dei mazzi.
- `public/` — interfaccia (HTML/CSS/JS senza framework), ottimizzata per smartphone. Ricaricando la pagina si rientra automaticamente nella stanza.

Le stanze sono in memoria: si perdono al riavvio del server e vengono eliminate dopo 6 ore di inattività.
