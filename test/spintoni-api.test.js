'use strict';
process.env.SPINTONI_DURATION = '3';
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

test('scontro via WebSocket: stato completo per sé, input confermati, fine partita', async () => {
  const a = (await post('/api/spintoni/rooms', { name: 'Anna' })).data;
  const code = a.code;
  assert.strictEqual((await post(`/api/spintoni/rooms/${code}/start`, a)).status, 400, 'da soli non si parte');
  assert.strictEqual((await post(`/api/spintoni/rooms/${code}/pick`, { ...a, char: 'tonno' })).status, 200);
  assert.strictEqual((await post(`/api/spintoni/rooms/${code}/stocks`, { ...a, stocks: 9 })).status, 400);
  // colore dei dettagli: solo quelli della palette, null = originali
  assert.strictEqual((await post(`/api/spintoni/rooms/${code}/color`, { ...a, color: '#123456' })).status, 400);
  assert.strictEqual((await post(`/api/spintoni/rooms/${code}/color`, { ...a, color: 'verde' })).status, 200);
  assert.strictEqual((await post(`/api/spintoni/rooms/${code}/stocks`, { ...a, stocks: 2 })).status, 200);
  for (let i = 0; i < 3; i++) assert.strictEqual((await post(`/api/spintoni/rooms/${code}/addBot`, a)).status, 200);
  assert.strictEqual((await post(`/api/spintoni/rooms/${code}/addBot`, a)).status, 400, 'massimo 4');
  assert.strictEqual((await post(`/api/spintoni/rooms/${code}/start`, a)).status, 200);
  const late = await post(`/api/spintoni/rooms/${code}/join`, { name: 'Ritardo' });
  assert.strictEqual(late.status, 400);

  const ws = new WebSocket(`ws://${base}/api/spintoni/rooms/${code}/ws?playerId=${a.playerId}&token=${a.token}`);
  const snaps = [];
  let end = null;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 's') snaps.push(m);
    if (m.t === 'end') end = m;
  };
  await new Promise((r) => { ws.onopen = r; });
  let seq = 0;
  const sender = setInterval(() => {
    seq += 1;
    ws.send(JSON.stringify({ t: 'in', s: seq, mx: 1, up: 0, dn: 0, j: seq % 20 === 0 ? 1 : 0, l: seq % 7 === 0 ? 1 : 0, h: 0, d: 0, dd: 0 }));
  }, 33);
  await new Promise((r) => { const iv = setInterval(() => { if (end) { clearInterval(iv); r(); } }, 50); });
  clearInterval(sender);
  ws.close();

  assert.ok(snaps.length > 40, `snapshot: ${snaps.length}`);
  const me = (s) => s.f.find((f) => f.id === a.playerId);
  assert.ok(me(snaps[0]).ph, 'il proprio stato di fisica arriva completo');
  assert.ok(!snaps[0].f.some((f) => f.id !== a.playerId && f.ph), 'quello degli altri no');
  assert.strictEqual(me(snaps[0]).c, 'tonno');
  assert.strictEqual(me(snaps[0]).st, 2);
  assert.ok(snaps[snaps.length - 1].ack > 20);
  assert.strictEqual(end.results.length, 4);
  // i bot hanno un colore e l'ordine di gioco riporta i colori di tutti
  const state = await new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`http://${base}/api/spintoni/rooms/${code}/events?playerId=${a.playerId}&token=${a.token}`, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        const m = buf.match(/event: state\ndata: (.*)\n\n/);
        if (m) { req.destroy(); resolve(JSON.parse(m[1])); }
      });
    });
    req.on('error', () => {});
  });
  assert.strictEqual(state.game.colors[a.playerId], 'verde');
  assert.ok(state.game.bots.every((b) => typeof b.color === 'string'));
  assert.strictEqual(state.game.order.find((o) => o.id === a.playerId).color, 'verde');
});
