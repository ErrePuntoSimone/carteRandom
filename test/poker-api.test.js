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
function nextState(code, p, predicate = () => true) {
  return new Promise((resolve, reject) => {
    const q = new URLSearchParams({ playerId: p.playerId, token: p.token });
    const req = http.get(`${base}/api/poker/rooms/${code}/events?${q}`, (res) => {
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

test('partita via API: avvio, azioni, permessi e showdown', async () => {
  const a = (await post('/api/poker/rooms', { name: 'Anna' })).data;
  const code = a.code;
  const b = (await post(`/api/poker/rooms/${code}/join`, { name: 'Bruno' })).data;
  const c = (await post(`/api/poker/rooms/${code}/join`, { name: 'Carla' })).data;
  const act = (p, type, extra) => post(`/api/poker/rooms/${code}/act`, { ...p, type, ...extra });

  assert.strictEqual((await post(`/api/poker/rooms/${code}/start`, b)).status, 403, 'solo host o dealer');
  assert.strictEqual((await post(`/api/poker/rooms/${code}/settings`, { ...a, smallBlind: 25, bigBlind: 50 })).status, 200);
  assert.strictEqual((await post(`/api/poker/rooms/${code}/start`, a)).status, 200);

  let s = await nextState(code, b, (x) => x.table.phase === 'betting');
  assert.strictEqual(s.table.hand.bb, 50);
  assert.strictEqual(s.table.hand.toAct, a.playerId, 'con 3 giocatori parla per primo il dealer');

  const wrong = await act(b, 'call');
  assert.strictEqual(wrong.status, 400);
  assert.match(wrong.data.error, /Non è il tuo turno/);

  assert.strictEqual((await act(a, 'raise', { amount: 150 })).status, 200);
  assert.strictEqual((await act(b, 'fold')).status, 200);
  // l'host agisce per Carla
  assert.strictEqual((await act(a, 'call', { as: c.playerId })).status, 200);
  for (let i = 0; i < 3; i++) {
    assert.strictEqual((await act(c, 'check')).status, 200);
    assert.strictEqual((await act(a, 'check')).status, 200);
  }
  s = await nextState(code, c, (x) => x.table.phase === 'showdown');
  assert.strictEqual(s.table.hand.pots[0].amount, 325);
  assert.strictEqual((await post(`/api/poker/rooms/${code}/award`, { ...b, pot: 0, winners: [c.playerId] })).status, 403);
  assert.strictEqual((await post(`/api/poker/rooms/${code}/award`, { ...a, pot: 0, winners: [c.playerId] })).status, 200);
  s = await nextState(code, a, (x) => x.table.phase === 'over');
  const stacks = Object.fromEntries(s.table.seats.map((x) => [x.name, x.stack]));
  assert.deepStrictEqual(stacks, { Anna: 850, Bruno: 975, Carla: 1175 });
  assert.strictEqual(s.table.lastResult[0].name, 'Carla');
});

test('chi esce durante la mano lascia le carte', async () => {
  const a = (await post('/api/poker/rooms', { name: 'A' })).data;
  const b = (await post(`/api/poker/rooms/${a.code}/join`, { name: 'B' })).data;
  await post(`/api/poker/rooms/${a.code}/start`, a);
  await post(`/api/poker/rooms/${a.code}/leave`, b);
  const s = await nextState(a.code, a, (x) => x.table.phase === 'over');
  assert.strictEqual(s.table.lastResult[0].name, 'A');
  assert.strictEqual(s.members.length, 1);
});
