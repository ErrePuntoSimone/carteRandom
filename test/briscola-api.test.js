'use strict';
process.env.BRISCOLA_TRICK_MS = '30';
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
function nextState(code, p, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ playerId: p.playerId, token: p.token });
    const req = http.get(`${base}/api/briscola/rooms/${code}/events?${q}`, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const m = chunk.match(/^event: state\ndata: (.*)$/m);
          if (m) { const s = JSON.parse(m[1]); if (predicate(s)) { req.destroy(); resolve(s); } }
        }
      });
    });
    req.on('error', (e) => { if (e.code !== 'ECONNRESET') reject(e); });
  });
}

test('partita completa in 2 via API, con carte nascoste', async () => {
  const a = (await post('/api/briscola/rooms', { name: 'Anna', mode: 2 })).data;
  const code = a.code;
  assert.strictEqual((await post(`/api/briscola/rooms/${code}/start`, a)).status, 400, 'servono 2 giocatori');
  const b = (await post(`/api/briscola/rooms/${code}/join`, { name: 'Bruno' })).data;
  const full = await post(`/api/briscola/rooms/${code}/join`, { name: 'Carla' });
  assert.strictEqual(full.status, 400);
  assert.match(full.data.error, /pieno/);
  assert.strictEqual((await post(`/api/briscola/rooms/${code}/start`, b)).status, 403, 'solo l\'host');
  assert.strictEqual((await post(`/api/briscola/rooms/${code}/start`, a)).status, 200);

  const players = { [a.playerId]: a, [b.playerId]: b };
  let tricks = 0;
  for (;;) {
    const s = await nextState(code, a, (x) => x.game.phase === 'playing' || x.game.phase === 'over');
    if (s.game.phase === 'over') {
      assert.strictEqual(s.game.result.points[0] + s.game.result.points[1], 120);
      assert.strictEqual(tricks, 20);
      break;
    }
    const turn = players[s.game.turn];
    const mine = await nextState(code, turn, (x) => x.game.turn === turn.playerId);
    assert.ok(mine.game.hand.length > 0);
    const other = Object.values(players).find((p) => p !== turn);
    const theirs = await nextState(code, other);
    assert.strictEqual(theirs.game.hand.some((c) => c.id === mine.game.hand[0].id), false, 'le carte degli altri non si vedono');
    const r = await post(`/api/briscola/rooms/${code}/play`, { ...turn, cardId: mine.game.hand[0].id });
    assert.strictEqual(r.status, 200, r.data.error);
    if (mine.game.trick.length === 1) tricks++;
  }
});

test('tavolo da 4: pieno al quarto giocatore', async () => {
  const a = (await post('/api/briscola/rooms', { name: 'A', mode: 4 })).data;
  for (const n of ['B', 'C', 'D']) assert.strictEqual((await post(`/api/briscola/rooms/${a.code}/join`, { name: n })).status, 201);
  assert.strictEqual((await post(`/api/briscola/rooms/${a.code}/join`, { name: 'E' })).status, 400);
  assert.strictEqual((await post(`/api/briscola/rooms/${a.code}/start`, a)).status, 200);
  const s = await nextState(a.code, a, (x) => x.game.phase === 'playing');
  assert.strictEqual(s.game.hand.length, 3);
  assert.strictEqual(s.game.deckCount, 28);
  assert.deepStrictEqual(s.game.players.map((p) => p.team), [0, 1, 0, 1]);
});
