'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { server } = require('../server');

let base;
before(() => new Promise((r) => server.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; r(); })));
after(() => new Promise((r) => server.close(r)));

async function get(path) {
  const res = await fetch(base + path, { redirect: 'manual' });
  return { status: res.status, type: res.headers.get('content-type'), location: res.headers.get('location'), text: await res.text() };
}

test('il menu elenca i minigiochi', async () => {
  const r = await get('/');
  assert.strictEqual(r.status, 200);
  assert.match(r.text, /href="\/carte\/"/);
  assert.match(r.text, /href="\/fiches\/"/);
  assert.match(r.text, /href="\/poker\/"/);
  assert.match(r.text, /href="\/briscola\/"/);
});

test('pagine dei minigiochi', async () => {
  for (const g of ['carte', 'fiches', 'poker', 'briscola']) {
    const r = await get(`/${g}/`);
    assert.strictEqual(r.status, 200, g);
    assert.match(r.type, /text\/html/);
    assert.strictEqual((await get(`/${g}/app.js`)).status, 200);
    assert.strictEqual((await get(`/${g}/style.css`)).status, 200);
  }
  assert.strictEqual((await get('/common.css')).status, 200);
  assert.strictEqual((await get('/common.js')).status, 200);
});

test('redirect alla cartella e link alle stanze', async () => {
  const r = await get('/carte');
  assert.strictEqual(r.status, 301);
  assert.strictEqual(r.location, '/carte/');
  const old = await get('/r/abcde');
  assert.strictEqual(old.status, 301);
  assert.strictEqual(old.location, '/carte/r/ABCDE');
  const room = await get('/carte/r/ABCDE');
  assert.strictEqual(room.status, 200);
  assert.match(room.text, /\/carte\/app\.js/);
});

test('percorsi non validi', async () => {
  assert.strictEqual((await get('/nonesiste/x')).status, 404);
  assert.strictEqual((await get('/api/nonesiste/x')).status, 404);
  assert.strictEqual((await get('/carte/manca.js')).status, 404);
  assert.notStrictEqual((await get('/..%2fserver.js')).status, 200);
});
