'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { server } = require('../server');

let base;
before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => new Promise((r) => server.close(r)));

async function post(path, body) {
  const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}

// legge il primo evento "state" dallo stream SSE di un giocatore
function nextState(code, p, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ playerId: p.playerId, token: p.token });
    const req = http.get(`${base}/api/carte/rooms/${code}/events?${q}`, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const m = chunk.match(/^event: state\ndata: (.*)$/m);
          if (m) {
            const s = JSON.parse(m[1]);
            if (predicate(s)) { req.destroy(); resolve(s); }
          }
        }
      });
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
  });
}

test('flusso completo: crea, entra, distribuisci, rivela', async () => {
  const host = (await post('/api/carte/rooms', { name: 'Anna' })).data;
  assert.match(host.code, /^[A-Z0-9]{5}$/);

  const p2 = (await post(`/api/carte/rooms/${host.code}/join`, { name: 'Bruno' })).data;
  const p3 = (await post(`/api/carte/rooms/${host.code}/join`, { name: 'Carla' })).data;

  const dup = await post(`/api/carte/rooms/${host.code}/join`, { name: 'bruno' });
  assert.strictEqual(dup.status, 409);

  const notHost = await post(`/api/carte/rooms/${host.code}/deal`, p2);
  assert.strictEqual(notHost.status, 403);

  assert.strictEqual((await post(`/api/carte/rooms/${host.code}/deal`, host)).status, 200);

  const s2 = await nextState(host.code, p2, (s) => s.round === 1);
  const mine = s2.players.find((p) => p.id === p2.playerId);
  assert.ok(mine.card && mine.card.label, 'il giocatore vede la propria carta');
  const others = s2.players.filter((p) => p.id !== p2.playerId);
  assert.ok(others.every((p) => p.card === null && p.hasCard), 'le carte altrui sono nascoste');

  await post(`/api/carte/rooms/${host.code}/reveal`, { ...host, revealed: true });
  const s3 = await nextState(host.code, p3, (s) => s.revealed);
  const labels = s3.players.map((p) => p.card.label);
  assert.strictEqual(new Set(labels).size, 3, 'carte tutte diverse');
});

test('mazzo personalizzato e mazzo troppo piccolo', async () => {
  const host = (await post('/api/carte/rooms', { name: 'Host' })).data;
  await post(`/api/carte/rooms/${host.code}/join`, { name: 'Due' });
  await post(`/api/carte/rooms/${host.code}/settings`, { ...host, deckId: 'custom', customCards: ['Lupo'] });
  const r = await post(`/api/carte/rooms/${host.code}/deal`, host);
  assert.strictEqual(r.status, 400);

  await post(`/api/carte/rooms/${host.code}/settings`, { ...host, customCards: ['Lupo', 'Contadino'] });
  assert.strictEqual((await post(`/api/carte/rooms/${host.code}/deal`, host)).status, 200);
  const s = await nextState(host.code, host, (s) => s.round === 1);
  assert.ok(['Lupo', 'Contadino'].includes(s.players[0].card.label));
});

test('stanza inesistente', async () => {
  const r = await post('/api/carte/rooms/ZZZZZ/join', { name: 'X' });
  assert.strictEqual(r.status, 404);
});

test('healthcheck', async () => {
  const res = await fetch(base + '/healthz');
  assert.strictEqual(res.status, 200);
  assert.strictEqual((await res.json()).ok, true);
});
