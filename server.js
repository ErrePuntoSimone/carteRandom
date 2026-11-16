'use strict';
// Server principale: serve il menu e i file dei minigiochi e smista le API.
// Nessuna dipendenza esterna.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { sendJson } = require('./lib/http');
const carte = require('./games/carte/server');
const poker = require('./games/poker/server');
const briscola = require('./games/briscola/server');
const arena = require('./games/arena/server');
const spintoni = require('./games/spintoni/server');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Minigiochi con API lato server: /api/<nome>/...
const API = {
  carte: carte.handleApi,
  poker: poker.handleApi,
  briscola: briscola.handleApi,
  arena: arena.handleApi,
  spintoni: spintoni.handleApi,
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function sendFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: 'Non trovato' });
    const headers = { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' };
    // immagini: cache breve; il resto va sempre riscaricato (niente versioni vecchie sul telefono dopo un aggiornamento)
    headers['Cache-Control'] = path.extname(file) === '.png' ? 'public, max-age=300' : 'no-cache';
    res.writeHead(200, headers);
    res.end(data);
  });
}

function serveStatic(res, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return sendJson(res, 400, { error: 'Percorso non valido' }); }
  const file = path.normalize(path.join(PUBLIC_DIR, decoded));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return sendJson(res, 403, { error: 'Vietato' });
  fs.stat(file, (err, st) => {
    if (!err && st.isDirectory()) {
      // /carte -> /carte/ (così i percorsi relativi funzionano)
      if (!pathname.endsWith('/')) {
        res.writeHead(301, { Location: pathname + '/' });
        return res.end();
      }
      return sendFile(res, path.join(file, 'index.html'));
    }
    if (!err) return sendFile(res, file);
    // Percorsi "virtuali" senza estensione (es. /carte/r/ABCDE):
    // si serve l'index.html del minigioco corrispondente.
    const game = pathname.split('/').filter(Boolean)[0];
    if (!path.extname(pathname) && game && fs.existsSync(path.join(PUBLIC_DIR, game, 'index.html'))) {
      return sendFile(res, path.join(PUBLIC_DIR, game, 'index.html'));
    }
    sendJson(res, 404, { error: 'Non trovato' });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true, rooms: carte.rooms.size + poker.rooms.size + briscola.rooms.size + arena.rooms.size + spintoni.rooms.size });
    if (url.pathname.startsWith('/api/')) {
      const [, game, ...parts] = url.pathname.split('/').filter(Boolean);
      const handler = API[game];
      if (!handler) return sendJson(res, 404, { error: 'Non trovato' });
      return await handler(req, res, url, parts);
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Metodo non consentito.' });
    // vecchi link alle stanze (prima del menu): /r/ABCDE -> /carte/r/ABCDE
    const legacy = url.pathname.match(/^\/r\/([A-Za-z0-9]{5})\/?$/);
    if (legacy) {
      res.writeHead(301, { Location: `/carte/r/${legacy[1].toUpperCase()}` });
      return res.end();
    }
    serveStatic(res, url.pathname);
  } catch (err) {
    const status = err.status || 500;
    if (status === 500) console.error(err);
    if (!res.headersSent) sendJson(res, status, { error: status === 500 ? 'Errore interno.' : err.message });
  }
});

// WebSocket per i giochi in tempo reale: /api/<gioco>/...
const UPGRADE = {
  arena: arena.handleUpgrade,
  spintoni: spintoni.handleUpgrade,
};
server.on('upgrade', (req, socket, head) => {
  socket.on('error', () => {});
  const url = new URL(req.url, 'http://localhost');
  const [api, game, ...parts] = url.pathname.split('/').filter(Boolean);
  const handler = api === 'api' && UPGRADE[game];
  if (!handler) { socket.destroy(); return; }
  try { handler(req, socket, head, url, parts); } catch (err) { console.error(err); socket.destroy(); }
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`Minigiochi in ascolto su http://localhost:${PORT}`));
}

module.exports = { server };
