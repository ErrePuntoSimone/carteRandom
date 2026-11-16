'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { server } = require('../server');

let base;
before(() => new Promise((r) => server.listen(0, () => { base = `127.0.0.1:${server.address().port}`; r(); })));
after(() => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }));

async function post(path, body) {
  const res = await fetch(`http://${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}
const list = async (game) => (await (await fetch(`http://${base}/api/${game}/rooms`)).json());

for (const game of ['carte', 'poker', 'briscola', 'arena', 'spintoni']) {
  test(`${game}: stanza pubblica visibile nell'elenco solo se l'host la rende pubblica`, async () => {
    const a = (await post(`/api/${game}/rooms`, { name: 'Anna', mode: 4 })).data;
    assert.ok(!(await list(game)).some((r) => r.code === a.code), 'privata di default');
    const b = (await post(`/api/${game}/rooms/${a.code}/join`, { name: 'Bruno' })).data;
    assert.strictEqual((await post(`/api/${game}/rooms/${a.code}/visibility`, { ...b, public: true })).status, 403, 'solo l\'host');
    assert.strictEqual((await post(`/api/${game}/rooms/${a.code}/visibility`, { ...a, public: true })).status, 200);
    const row = (await list(game)).find((r) => r.code === a.code);
    assert.ok(row, 'ora è nell\'elenco');
    assert.strictEqual(row.host, 'Anna');
    assert.strictEqual(row.players, 2);
    assert.strictEqual(row.token, undefined);
    assert.strictEqual((await post(`/api/${game}/rooms/${a.code}/visibility`, { ...a, public: false })).status, 200);
    assert.ok(!(await list(game)).some((r) => r.code === a.code), 'di nuovo privata');
  });
}

test('briscola: tavolo pieno non compare più nell\'elenco', async () => {
  const a = (await post('/api/briscola/rooms', { name: 'Anna', mode: 2 })).data;
  await post(`/api/briscola/rooms/${a.code}/visibility`, { ...a, public: true });
  const row = (await list('briscola')).find((r) => r.code === a.code);
  assert.strictEqual(row.max, 2);
  await post(`/api/briscola/rooms/${a.code}/join`, { name: 'Bruno' });
  assert.ok(!(await list('briscola')).some((r) => r.code === a.code));
});

test('spintoni: partita in corso non compare nell\'elenco', async () => {
  const a = (await post('/api/spintoni/rooms', { name: 'Anna' })).data;
  await post(`/api/spintoni/rooms/${a.code}/visibility`, { ...a, public: true });
  await post(`/api/spintoni/rooms/${a.code}/addBot`, a);
  assert.ok((await list('spintoni')).some((r) => r.code === a.code));
  assert.strictEqual((await post(`/api/spintoni/rooms/${a.code}/start`, a)).status, 200);
  assert.ok(!(await list('spintoni')).some((r) => r.code === a.code));
});
