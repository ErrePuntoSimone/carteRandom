'use strict';
process.env.ARENA_DURATION = '2';
process.env.ARENA_COUNTDOWN = '0';
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

test('partita via WebSocket: snapshot, input e fine partita', async () => {
  const a = (await post('/api/arena/rooms', { name: 'Anna' })).data;
  const code = a.code;
  assert.strictEqual((await post(`/api/arena/rooms/${code}/start`, a)).status, 400, 'da soli non si parte');
  assert.strictEqual((await post(`/api/arena/rooms/${code}/pick`, { ...a, char: 'macigno' })).status, 200);
  assert.strictEqual((await post(`/api/arena/rooms/${code}/pick`, { ...a, char: 'nessuno' })).status, 400);
  assert.strictEqual((await post(`/api/arena/rooms/${code}/addBot`, a)).status, 200);
  // nomi dei bot tutti diversi; massimo 6 lottatori
  for (let i = 0; i < 4; i++) await post(`/api/arena/rooms/${code}/addBot`, a);
  assert.strictEqual((await post(`/api/arena/rooms/${code}/addBot`, a)).status, 400, 'arena piena');
  const names = await new Promise((resolve) => {
    const http = require('http');
    const req = http.get(`http://${base}/api/arena/rooms/${code}/events?playerId=${a.playerId}&token=${a.token}`, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        const m = buf.match(/event: state\ndata: (.*)\n\n/);
        if (m) { req.destroy(); resolve(JSON.parse(m[1]).game.bots.map((b) => b.name)); }
      });
    });
    req.on('error', () => {});
  });
  assert.strictEqual(new Set(names).size, 5);
  assert.strictEqual((await post(`/api/arena/rooms/${code}/start`, a)).status, 200);

  // token sbagliato: rifiutato
  const bad = new WebSocket(`ws://${base}/api/arena/rooms/${code}/ws?playerId=${a.playerId}&token=x`);
  await new Promise((r) => { bad.onerror = r; bad.onclose = r; });

  const ws = new WebSocket(`ws://${base}/api/arena/rooms/${code}/ws?playerId=${a.playerId}&token=${a.token}`);
  const snaps = [];
  let end = null;
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.t === 's') snaps.push(m);
    if (m.t === 'end') end = m;
  };
  await new Promise((r) => { ws.onopen = r; });
  let seq = 0;
  const sender = setInterval(() => ws.send(JSON.stringify({ t: 'in', s: ++seq, mx: 1, my: 0, ax: 0, ay: 0, f: 0, u: 0 })), 50);
  await new Promise((r) => { const iv = setInterval(() => { if (end) { clearInterval(iv); r(); } }, 50); });
  clearInterval(sender);
  ws.close();

  assert.ok(snaps.length > 20, `snapshot ricevuti: ${snaps.length}`);
  const me = (s) => s.p.find((p) => p.id === a.playerId);
  assert.strictEqual(me(snaps[0]).c, 'macigno');
  assert.ok(snaps[snaps.length - 1].ack > 10, 'il server conferma gli input');
  const moved = snaps.filter((s) => me(s)).map((s) => me(s).x);
  assert.ok(Math.max(...moved) - moved[0] > 50, 'il giocatore si è mosso');
  assert.strictEqual(end.results.length, 6);
  const res = await fetch(`http://${base}/healthz`);
  assert.strictEqual(res.status, 200);
});
