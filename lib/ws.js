'use strict';
// WebSocket minimo (RFC 6455) senza dipendenze: solo messaggi di testo,
// quanto basta per i giochi in tempo reale.
const crypto = require('crypto');
const { EventEmitter } = require('events');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const MAX_MESSAGE = 64 * 1024;

function frame(opcode, payload) {
  const len = payload.length;
  let header;
  if (len < 126) header = Buffer.from([0x80 | opcode, len]);
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([header, payload]);
}

/** Completa l'handshake e restituisce un oggetto con send/close ed eventi message/close. */
function acceptWebSocket(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  if (!key || String(req.headers.upgrade || '').toLowerCase() !== 'websocket') {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
    return null;
  }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
    + `Sec-WebSocket-Accept: ${accept}\r\n\r\n`);
  socket.setNoDelay(true);
  socket.setTimeout(0);

  const ws = new EventEmitter();
  let buf = head && head.length ? Buffer.from(head) : Buffer.alloc(0);
  let open = true;
  let parts = [];

  const finish = () => {
    if (!open) return;
    open = false;
    clearInterval(ping);
    ws.emit('close');
  };
  ws.isOpen = () => open;
  ws.send = (text) => {
    if (!open || socket.destroyed) return;
    socket.write(frame(0x1, Buffer.from(text, 'utf8')));
  };
  ws.close = (code = 1000) => {
    if (!open) return;
    const b = Buffer.alloc(2);
    b.writeUInt16BE(code);
    try { socket.write(frame(0x8, b)); } catch { /* ignora */ }
    socket.end();
    finish();
  };

  function parse() {
    while (buf.length >= 2) {
      const fin = (buf[0] & 0x80) !== 0;
      const op = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let len = buf[1] & 0x7f;
      let off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (buf.length < 10) return;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_MESSAGE)) return ws.close(1009);
        len = Number(big); off = 10;
      }
      if (len > MAX_MESSAGE) return ws.close(1009);
      const maskAt = off;
      if (masked) off += 4;
      if (buf.length < off + len) return;
      let payload = Buffer.from(buf.subarray(off, off + len));
      if (masked) for (let i = 0; i < payload.length; i++) payload[i] ^= buf[maskAt + (i & 3)];
      buf = buf.subarray(off + len);

      if (op === 0x8) return ws.close();
      if (op === 0x9) { socket.write(frame(0xA, payload)); continue; }
      if (op === 0xA) continue;
      if (op === 0x1 || op === 0x0) {
        parts.push(payload);
        if (parts.reduce((s, p) => s + p.length, 0) > MAX_MESSAGE) return ws.close(1009);
        if (fin) {
          const text = Buffer.concat(parts).toString('utf8');
          parts = [];
          ws.emit('message', text);
        }
      }
    }
  }

  socket.on('data', (chunk) => { buf = Buffer.concat([buf, chunk]); parse(); });
  socket.on('close', finish);
  socket.on('end', finish);
  socket.on('error', finish);
  // tiene viva la connessione dietro i proxy
  const ping = setInterval(() => { if (open && !socket.destroyed) socket.write(frame(0x9, Buffer.alloc(0))); }, 25000);
  ping.unref();
  if (buf.length) setImmediate(parse);
  return ws;
}

module.exports = { acceptWebSocket };
