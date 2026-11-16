'use strict';
(() => {
  const S = window.SpintoniShared;
  const D = window.SpintoniDraw;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignora */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignora */ } },
  };
  const KEY = (code) => 'spintoni:' + code;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHAR_IDS = Object.keys(S.CHARS);

  let session = null;
  let R = null;          // stato della sala (SSE)
  let es = null;
  let unloading = false;
  window.addEventListener('pagehide', () => { unloading = true; });
  window.addEventListener('pageshow', () => { unloading = false; });

  async function api(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Errore di rete');
    return data;
  }
  async function run(action, extra) {
    try { return await api(`/api/spintoni/rooms/${session.code}/${action}`, { playerId: session.playerId, token: session.token, ...extra }); }
    catch (err) { toast(err.message); return null; }
  }

  // ---------- navigazione ----------
  function codeFromUrl() {
    const m = location.pathname.match(/^\/spintoni\/r\/([A-Za-z0-9]{5})\/?$/);
    return m ? m[1].toUpperCase() : null;
  }
  function showHome(prefill, error) {
    closeStream();
    Game.stop();
    session = null; R = null;
    $('screen-lobby').hidden = true;
    $('screen-game').hidden = true;
    $('screen-home').hidden = false;
    if (prefill) $('input-code').value = prefill;
    $('invite').hidden = !prefill;
    $('home-main').hidden = !!prefill;
    if (prefill) $('invite-code').textContent = prefill;
    $('home-error').textContent = error || '';
    $('who-name').textContent = Player.getName();
    $('link-change').href = Player.loginUrl(true);
  }
  function enterRoom(s) {
    session = s;
    store.set(KEY(s.code), s);
    if (codeFromUrl() !== s.code) history.pushState(null, '', '/spintoni/r/' + s.code);
    $('screen-home').hidden = true;
    $('screen-lobby').hidden = false;
    $('room-code').textContent = s.code;
    openStream();
  }
  function goHome(msg) {
    if (session) store.del(KEY(session.code));
    history.pushState(null, '', '/spintoni/');
    showHome('', msg);
  }

  function openStream() {
    closeStream();
    const q = new URLSearchParams({ playerId: session.playerId, token: session.token });
    es = new EventSource(`/api/spintoni/rooms/${session.code}/events?${q}`);
    es.addEventListener('state', (e) => { $('conn-banner').hidden = true; render(JSON.parse(e.data)); });
    es.addEventListener('kicked', (e) => goHome(JSON.parse(e.data).reason));
    es.onerror = () => {
      if (unloading) return;
      $('conn-banner').hidden = false;
      if (es && es.readyState === EventSource.CLOSED) checkSession();
    };
  }
  function closeStream() { if (es) { es.close(); es = null; } }
  async function checkSession() {
    const s = session;
    if (!s) return;
    try {
      await api(`/api/spintoni/rooms/${s.code}/join`, s);
      if (session === s) setTimeout(() => session === s && openStream(), 1500);
    } catch (err) {
      if (session !== s) return;
      if (/non trovata|non riconosciuto|nome|piena|corso/i.test(err.message)) { closeStream(); goHome('L\'arena non esiste più.'); }
      else setTimeout(() => session === s && checkSession(), 3000);
    }
  }

  const isHost = () => R && R.hostId === R.you;
  function nameOf(id) {
    const m = R && R.members.find((x) => x.id === id);
    if (m) return m.name;
    const o = R && R.game.order && R.game.order.find((x) => x.id === id);
    if (o) return o.name;
    const b = R && R.game.bots.find((x) => x.id === id);
    return b ? b.name : '?';
  }

  // colore dei dettagli scelto da un lottatore (hex) o null per i colori originali
  function colorOf(id) {
    if (!R) return null;
    const g = R.game;
    if (g.colors && g.colors[id]) return S.colorHex(g.colors[id]);
    const b = g.bots.find((x) => x.id === id) || (g.order || []).find((x) => x.id === id);
    return b && b.color ? S.colorHex(b.color) : null;
  }

  function render(state) {
    R = state;
    const g = R.game;
    if (g.phase === 'playing') Game.start(g.matchNo);
    else {
      if (Game.running()) Game.stop();
      $('screen-game').hidden = true;
      $('screen-lobby').hidden = false;
    }
    renderLobby(g);
  }

  function statBars(def) {
    const max = (f) => Math.max(...CHAR_IDS.map((id) => f(S.CHARS[id])));
    const rows = [
      ['Velocità', def.speed / max((d) => d.speed)],
      ['Salto', def.jump / max((d) => d.jump)],
      ['Peso', def.weight / max((d) => d.weight)],
      ['Potenza', def.power / max((d) => d.power)],
    ];
    return rows.map(([l, v]) => `<div class="stat">${l}<span class="bar"><span style="width:${Math.round(v * 100)}%"></span></span></div>`).join('');
  }

  let charsBuilt = false;
  let portraitColor = undefined;
  function renderLobby(g) {
    const myColor = g.colors ? g.colors[R.you] || null : null;
    if (!$('colors').childElementCount) {
      $('colors').innerHTML = `<button type="button" class="sw orig" data-color="" role="radio" aria-label="Colori originali" title="Colori originali"></button>`
        + S.COLORS.map((c) => `<button type="button" class="sw" data-color="${c.id}" role="radio" style="--c:${c.hex}" aria-label="${esc(c.name)}" title="${esc(c.name)}"></button>`).join('');
    }
    for (const b of $('colors').querySelectorAll('[data-color]')) b.setAttribute('aria-checked', String((b.dataset.color || null) === myColor));
    if (!charsBuilt) {
      $('chars').innerHTML = CHAR_IDS.map((id) => {
        const d = S.CHARS[id];
        return `<button type="button" class="char" data-char="${id}" aria-pressed="false">
          <canvas data-portrait="${id}"></canvas><span class="cn">${esc(d.name)}</span>
          <span class="cd">${esc(d.desc)}</span><span class="stats">${statBars(d)}</span></button>`;
      }).join('');
      charsBuilt = true;
    }
    // i ritratti dei personaggi mostrano il colore che ho scelto
    if (portraitColor !== myColor) {
      portraitColor = myColor;
      for (const c of $('chars').querySelectorAll('[data-portrait]')) D.portrait(c, c.dataset.portrait, S.colorHex(myColor));
    }
    const mine = g.picks[R.you];
    for (const b of $('chars').querySelectorAll('[data-char]')) b.setAttribute('aria-pressed', String(b.dataset.char === mine));

    const list = [
      ...R.members.map((m) => ({ id: m.id, name: m.name, char: g.picks[m.id] || 'gilda', me: m.id === R.you, host: m.id === R.hostId })),
      ...g.bots.map((b) => ({ ...b, bot: true })),
    ];
    $('roster-count').textContent = `${list.length}/${g.max}`;
    $('roster').innerHTML = list.map((f) => `<li>
        <canvas data-mini="${f.char}" data-id="${esc(f.id)}"></canvas>
        <span class="nm">${esc(f.name)}${f.me ? ' <span class="muted small">(tu)</span>' : ''}${f.host ? ' 👑' : ''}</span>
        <span class="ch">${esc(S.CHARS[f.char].name)}</span>
        ${f.bot && isHost() ? `<button class="btn danger-text" data-rm-bot="${f.id}" aria-label="Togli ${esc(f.name)}">✕</button>` : ''}
      </li>`).join('');
    for (const c of $('roster').querySelectorAll('[data-mini]')) D.portrait(c, c.dataset.mini, colorOf(c.dataset.id));

    $('host-tools').hidden = !isHost();
    $('btn-add-bot').hidden = list.length >= g.max;
    if (document.activeElement !== $('sel-stocks')) $('sel-stocks').value = String(g.stocks);
    $('btn-start').hidden = !isHost();
    $('btn-start').disabled = list.length < 2;
    $('btn-start').textContent = g.results ? '▶ Rivincita' : '▶ Inizia lo scontro';
    $('start-hint').textContent = list.length < 2
      ? (isHost() ? 'Servono almeno 2 lottatori: invita qualcuno o aggiungi un bot.' : 'In attesa di altri lottatori…')
      : isHost() ? `${g.stocks} ${g.stocks === 1 ? 'vita' : 'vite'} a testa: vince l'ultimo che resta.` : 'Aspetta che l\'host avvii lo scontro.';

    $('results').hidden = !g.results;
    if (g.results) {
      const win = g.results[0];
      $('results-title').textContent = win.id === R.you ? '🏆 Hai vinto!' : `🏆 Vince ${win.name}`;
      $('results-list').innerHTML = g.results.map((r, i) => `<li class="${i === 0 ? 'first' : ''} ${r.id === R.you ? 'me' : ''}">
          <span class="pos">${i === 0 ? '👑' : i + 1}</span><canvas data-mini="${r.char}" data-id="${esc(r.id)}"></canvas>
          <span class="nm">${esc(r.name)}</span>
          <span class="st"><strong>${r.stocks}</strong> ${r.stocks === 1 ? 'vita' : 'vite'} · ${r.kos} KO · ${r.falls} cadute</span></li>`).join('');
      for (const c of $('results-list').querySelectorAll('[data-mini]')) D.portrait(c, c.dataset.mini, colorOf(c.dataset.id));
    }
  }

  $('chars').addEventListener('click', (e) => { const b = e.target.closest('[data-char]'); if (b) run('pick', { char: b.dataset.char }); });
  $('colors').addEventListener('click', (e) => {
    const b = e.target.closest('[data-color]');
    if (b) run('color', { color: b.dataset.color || null });
  });
  $('roster').addEventListener('click', (e) => { const b = e.target.closest('[data-rm-bot]'); if (b) run('removeBot', { botId: b.dataset.rmBot }); });
  $('btn-add-bot').addEventListener('click', () => run('addBot'));
  $('sel-stocks').addEventListener('change', (e) => run('stocks', { stocks: Number(e.target.value) }));
  $('btn-start').addEventListener('click', () => run('start'));

  // =====================================================================
  // PARTITA
  // =====================================================================
  const Game = (() => {
    const canvas = $('canvas');
    const ctx = canvas.getContext('2d');
    let scene = null;
    let ws = null, raf = 0, sendTimer = 0, matchNo = -1, active = false;
    let W = 0, H = 0, dpr = 1, scale = 1, offX = 0, offY = 0;

    let snaps = [], clockOffset = null, last = null;
    let seq = 0, pending = [], pred = null, prevPred = null, lastTickAt = 0, meAlive = false;
    const press = { j: false, l: false, h: false, d: false, dd: false };
    const keys = new Set();
    let stick = null;               // joystick sinistro
    let particles = [], rings = [], shake = 0, cardsKey = '';

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      // l'arena occupa lo schermo intero (con un margine per l'interfaccia in alto)
      scale = Math.min(W / S.STAGE.w, (H * 0.96) / S.STAGE.h);
      offX = (W - S.STAGE.w * scale) / 2;
      offY = H - S.STAGE.h * scale - (H - S.STAGE.h * scale) * 0.3;
    }

    function start(no) {
      if (active && no === matchNo) return;
      stop();
      matchNo = no;
      active = true;
      if (!scene) scene = D.makeScene();
      $('screen-lobby').hidden = true;
      $('screen-game').hidden = false;
      $('banner').hidden = true;
      snaps = []; last = null; clockOffset = null;
      seq = 0; pending = []; pred = null; prevPred = null; meAlive = false;
      particles = []; rings = []; shake = 0; cardsKey = '';
      resize();
      connect();
      sendTimer = setInterval(sendInput, S.TICK * 1000);
      raf = requestAnimationFrame(frame);
    }
    function stop() {
      active = false;
      if (ws) { ws.onclose = null; try { ws.close(); } catch { /* ignora */ } ws = null; }
      clearInterval(sendTimer);
      cancelAnimationFrame(raf);
      stick = null;
      for (const b of document.querySelectorAll('.pbtn.on')) b.classList.remove('on');
    }
    function connect() {
      const q = new URLSearchParams({ playerId: session.playerId, token: session.token });
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/spintoni/rooms/${session.code}/ws?${q}`);
      ws.onmessage = (e) => onMessage(JSON.parse(e.data));
      ws.onclose = () => { if (active) setTimeout(() => active && connect(), 1000); };
    }
    function onMessage(m) {
      if (m.t === 's') onSnapshot(m);
      else if (m.t === 'end') stop();
    }

    function onSnapshot(m) {
      const now = performance.now();
      const off = now - m.k * S.TICK * 1000;
      clockOffset = clockOffset === null ? off : Math.min(off, clockOffset + 2);
      const snap = { k: m.k, recv: now, f: new Map(m.f.map((f) => [f.id, f])), raw: m };
      snaps.push(snap);
      if (snaps.length > 40) snaps.shift();
      last = snap;

      // riconciliazione: stato del server + input non ancora confermati
      const me = snap.f.get(R.you);
      meAlive = !!(me && me.al);
      if (me && me.al && me.ph) {
        const base = JSON.parse(JSON.stringify(me.ph));
        pending = pending.filter((i) => i.s > m.ack);
        for (const i of pending) S.stepFighter(base, i.inp);
        if (!pred) { pred = base; prevPred = { ...base }; }
        else {
          const dx = base.x - pred.x, dy = base.y - pred.y;
          if (Math.hypot(dx, dy) > 180) prevPred = { ...base };
          else prevPred = { ...prevPred, x: prevPred.x + dx, y: prevPred.y + dy };
          pred = base;
        }
      } else { pred = null; pending = []; }
      for (const ev of m.ev) onEvent(ev);
      updateHud(m);
    }

    function onEvent(ev) {
      if (ev.t === 'hit') {
        const heavy = ev.ty === 'heavy';
        burst(ev.x, ev.y, heavy ? '#ffeb3b' : '#ffffff', heavy ? 18 : 9, heavy ? 520 : 320);
        rings.push({ x: ev.x, y: ev.y, born: performance.now(), r: heavy ? 70 : 40 });
        shake = Math.max(shake, Math.min(16, ev.kb / 90));
        if ((ev.id === R.you || ev.by === R.you) && navigator.vibrate) navigator.vibrate(heavy ? 35 : 15);
      } else if (ev.t === 'ko') {
        burst(ev.x, ev.y, '#ff5252', 40, 900);
        rings.push({ x: ev.x, y: ev.y, born: performance.now(), r: 260, ko: true });
        shake = 22;
        const b = $('banner');
        b.textContent = ev.id === R.you ? (ev.left > 0 ? 'Sei fuori!' : 'Eliminato!') : ev.by === R.you ? 'KO!' : `${nameOf(ev.id)} è fuori!`;
        b.hidden = false;
        b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
        clearTimeout(onEvent.t);
        onEvent.t = setTimeout(() => { b.hidden = true; }, 1300);
        if (navigator.vibrate && (ev.id === R.you || ev.by === R.you)) navigator.vibrate([60, 40, 90]);
      } else if (ev.t === 'spawn') {
        burst(ev.x, ev.y, '#81d4fa', 14, 300);
      }
    }
    function burst(x, y, color, n, speed) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.3 + Math.random() * 0.35, t: 0, color, size: 3 + Math.random() * 4 });
      }
      if (particles.length > 500) particles.splice(0, particles.length - 500);
    }

    function updateHud(m) {
      const left = Math.ceil(m.left);
      $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      const list = m.f.slice().sort((a, b) => a.sl - b.sl);
      const key = list.map((f) => `${f.id}:${f.dm}:${f.st}:${f.al}`).join('|');
      if (key === cardsKey) return;
      const rebuild = cardsKey.split('|').length !== list.length || !cardsKey;
      cardsKey = key;
      if (rebuild) {
        $('cards').innerHTML = list.map((f) => `<div class="fcard" data-f="${f.id}" style="--c:${D.SLOT_COLORS[f.sl % 4]}">
          <canvas data-mini="${f.c}" data-id="${esc(f.id)}"></canvas><div><div class="fn">${esc(f.id === R.you ? 'Tu' : nameOf(f.id))}</div>
          <div class="pc"></div><div class="lv"></div></div></div>`).join('');
        for (const c of $('cards').querySelectorAll('[data-mini]')) D.portrait(c, c.dataset.mini, colorOf(c.dataset.id));
      }
      for (const f of list) {
        const el = $('cards').querySelector(`[data-f="${CSS.escape(f.id)}"]`);
        if (!el) continue;
        el.classList.toggle('out', f.st <= 0);
        const pc = el.querySelector('.pc');
        pc.textContent = f.st > 0 ? `${f.dm}%` : 'fuori';
        pc.style.color = D.dmgColor(f.dm);
        el.querySelector('.lv').textContent = '❤'.repeat(Math.max(0, f.st));
      }
    }

    // ---------- input ----------
    function held() {
      let mx = 0, up = false, down = false;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      if (keys.has('w') || keys.has('arrowup')) up = true;
      if (keys.has('s') || keys.has('arrowdown')) down = true;
      if (stick) {
        const dx = stick.x - stick.ox, dy = stick.y - stick.oy;
        if (Math.abs(dx) > 10) mx = Math.max(-1, Math.min(1, dx / 50));
        if (dy < -28) up = true;
        if (dy > 28) down = true;
      }
      return { mx, up, down };
    }

    function sendInput() {
      if (!ws || ws.readyState !== 1) return;
      const h = held();
      // giù appena premuto: scende dalle piattaforme
      const inp = { mx: h.mx, up: h.up, down: h.down, j: press.j, l: press.l, h: press.h, d: press.d, dd: press.dd };
      press.j = press.l = press.h = press.d = press.dd = false;
      seq += 1;
      ws.send(JSON.stringify({ t: 'in', s: seq, mx: +inp.mx.toFixed(3), up: inp.up ? 1 : 0, dn: inp.down ? 1 : 0, j: inp.j ? 1 : 0, l: inp.l ? 1 : 0, h: inp.h ? 1 : 0, d: inp.d ? 1 : 0, dd: inp.dd ? 1 : 0 }));
      if (pred && meAlive) {
        pending.push({ s: seq, inp });
        prevPred = { ...pred };
        S.stepFighter(pred, inp);
      }
      lastTickAt = performance.now();
    }

    const GAME_KEYS = ['w', 'a', 's', 'd', 'j', 'k', 'l', 'z', 'x', 'c', ' ', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
    window.addEventListener('keydown', (e) => {
      if (!active) return;
      const k = e.key.toLowerCase();
      if (GAME_KEYS.includes(k)) e.preventDefault();
      if (!e.repeat) {
        if (k === ' ' || k === 'w' || k === 'arrowup') press.j = true;
        if (k === 's' || k === 'arrowdown') press.dd = true;
        if (k === 'j' || k === 'z') press.l = true;
        if (k === 'k' || k === 'x') press.h = true;
        if (k === 'l' || k === 'c' || k === 'shift') press.d = true;
      }
      keys.add(k);
    });
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => keys.clear());

    // joystick touch a sinistra, pulsanti a destra
    const game = $('screen-game');
    game.addEventListener('touchstart', (e) => {
      if (!active) return;
      if (e.target.closest && (e.target.closest('#btn-quit') || e.target.closest('.pbtn'))) return;
      for (const t of e.changedTouches) {
        if (t.clientX < W * 0.55 && !stick) stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY, down: false };
      }
      e.preventDefault();
    }, { passive: false });
    game.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (stick && stick.id === t.identifier) {
          stick.x = t.clientX; stick.y = t.clientY;
          const isDown = stick.y - stick.oy > 28;
          if (isDown && !stick.down) press.dd = true;
          stick.down = isDown;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const endTouch = (e) => { for (const t of e.changedTouches) if (stick && stick.id === t.identifier) stick = null; };
    game.addEventListener('touchend', endTouch);
    game.addEventListener('touchcancel', endTouch);
    for (const b of document.querySelectorAll('.pbtn')) {
      const on = (e) => { e.preventDefault(); e.stopPropagation(); press[b.dataset.act] = true; b.classList.add('on'); if (navigator.vibrate) navigator.vibrate(8); };
      const off = (e) => { e.preventDefault(); b.classList.remove('on'); };
      b.addEventListener('touchstart', on, { passive: false });
      b.addEventListener('touchend', off);
      b.addEventListener('touchcancel', off);
      b.addEventListener('mousedown', on);
      b.addEventListener('mouseup', off);
    }
    window.addEventListener('resize', () => { if (active) resize(); });

    // ---------- disegno ----------
    function displayedMe() {
      if (!pred) return null;
      const t = Math.max(0, Math.min(1, (performance.now() - lastTickAt) / (S.TICK * 1000)));
      return { ...pred, x: prevPred.x + (pred.x - prevPred.x) * t, y: prevPred.y + (pred.y - prevPred.y) * t };
    }

    // gli altri: interpolati tra due snapshot, ~2 passi nel passato
    function others() {
      if (!snaps.length) return [];
      const renderK = (performance.now() - clockOffset) / (S.TICK * 1000) - 2;
      let a = snaps[0], b = snaps[snaps.length - 1];
      for (let i = snaps.length - 1; i > 0; i--) {
        if (snaps[i - 1].k <= renderK) { a = snaps[i - 1]; b = snaps[i]; break; }
      }
      if (renderK >= b.k) a = b;
      const t = a === b ? 1 : Math.max(0, Math.min(1, (renderK - a.k) / (b.k - a.k)));
      const out = [];
      for (const f1 of b.f.values()) {
        const f0 = a.f.get(f1.id);
        // dopo un KO o un rientro non si interpola (salto di posizione)
        if (f0 && f0.al === f1.al && Math.hypot(f1.x - f0.x, f1.y - f0.y) < 300) out.push({ ...f1, x: f0.x + (f1.x - f0.x) * t, y: f0.y + (f1.y - f0.y) * t });
        else out.push(f1);
      }
      return out;
    }

    let lastFrame = 0;
    function frame(now) {
      if (!active) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
      lastFrame = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      D.sky(ctx, W, H);
      if (!last) {
        ctx.fillStyle = '#fff'; ctx.font = '600 16px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('Connessione all\'arena…', W / 2, H / 2);
        return;
      }
      shake *= Math.pow(0.02, dt);
      const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
      ctx.save();
      ctx.translate(offX + sx, offY + sy);
      ctx.scale(scale, scale);
      ctx.drawImage(scene.canvas, scene.ox, scene.oy);

      const list = others();
      const meNow = displayedMe();
      for (const f of list) {
        if (!f.al) continue;
        let st = f;
        if (f.id === R.you && meNow) st = { ...f, x: meNow.x, y: meNow.y, fc: meNow.face, g: meNow.g, vx: meNow.vx, vy: meNow.vy, a: meNow.att, hs: meNow.hs, dg: meNow.dg, inv: meNow.inv > 0 };
        // scia quando vola via
        if (st.hs > 0.1 && Math.hypot(st.vx, st.vy) > 700) {
          particles.push({ x: st.x, y: st.y - 44, vx: 0, vy: 0, life: 0.35, t: 0, color: 'rgba(255,255,255,.7)', size: 9 });
        }
        D.fighter(ctx, st.x, st.y, st, f.sl, now, { name: f.id === R.you ? 'Tu' : nameOf(f.id), color: colorOf(f.id) });
      }

      for (const r of rings) {
        const t = (now - r.born) / (r.ko ? 600 : 260);
        if (t > 1) continue;
        ctx.strokeStyle = r.ko ? `rgba(255, 82, 82, ${1 - t})` : `rgba(255, 255, 255, ${1 - t})`;
        ctx.lineWidth = (r.ko ? 18 : 6) * (1 - t) + 1;
        ctx.beginPath(); ctx.arc(r.x, r.y, r.r * (0.3 + t), 0, Math.PI * 2); ctx.stroke();
      }
      rings = rings.filter((r) => now - r.born < 600);
      for (const p of particles) {
        p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.88; p.vy *= 0.88;
        ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - p.t / p.life * 0.5), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      particles = particles.filter((p) => p.t < p.life);
      ctx.restore();

      // segnalini per chi è fuori dallo schermo
      for (const f of list) {
        if (!f.al) continue;
        const px = offX + f.x * scale, py = offY + (f.y - 44) * scale;
        if (px >= 0 && px <= W && py >= 0 && py <= H) continue;
        const cx = Math.max(22, Math.min(W - 22, px)), cy = Math.max(60, Math.min(H - 22, py));
        ctx.fillStyle = D.SLOT_COLORS[f.sl % 4]; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, 16, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const a = Math.atan2(py - cy, px - cx);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
        ctx.lineTo(cx + Math.cos(a + 0.5) * 16, cy + Math.sin(a + 0.5) * 16);
        ctx.lineTo(cx + Math.cos(a - 0.5) * 16, cy + Math.sin(a - 0.5) * 16);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#111'; ctx.font = '900 11px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(`${f.dm}%`, cx, cy);
        ctx.textBaseline = 'alphabetic';
      }

      // joystick
      if (stick) {
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(stick.ox, stick.oy, 50, 0, Math.PI * 2); ctx.stroke();
        const dx = stick.x - stick.ox, dy = stick.y - stick.oy, l = Math.hypot(dx, dy), k = Math.min(l, 50) / (l || 1);
        ctx.fillStyle = 'rgba(255,255,255,.55)';
        ctx.beginPath(); ctx.arc(stick.ox + dx * k, stick.oy + dy * k, 22, 0, Math.PI * 2); ctx.fill();
      }
    }

    return { start, stop, running: () => active };
  })();

  // ---------- home e pulsanti ----------
  $('btn-create').addEventListener('click', async () => {
    const name = Player.require();
    if (!name) return;
    try { enterRoom(await api('/api/spintoni/rooms', { name })); }
    catch (err) { $('home-error').textContent = err.message; }
  });
  $('form-join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('input-code').value.trim().toUpperCase();
    if (code.length !== 5) { $('home-error').textContent = 'Il codice è di 5 caratteri.'; return; }
    const name = Player.require();
    if (!name) return;
    try { enterRoom(await api(`/api/spintoni/rooms/${code}/join`, { name })); }
    catch (err) { $('home-error').textContent = err.message; }
  });
  $('btn-join-invite').addEventListener('click', () => {
    $('input-code').value = $('invite-code').textContent;
    $('form-join').requestSubmit();
  });
  $('btn-show-create').addEventListener('click', () => {
    $('invite').hidden = true;
    $('home-main').hidden = false;
    $('input-code').value = '';
    $('home-error').textContent = '';
    history.replaceState(null, '', '/spintoni/');
  });
  $('btn-share').addEventListener('click', async () => {
    const url = `${location.origin}/spintoni/r/${session.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Spintoni', text: `Vieni a fare a spintoni: ${session.code}`, url }); return; }
      catch (err) { if (err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copiato!'); }
    catch { prompt('Copia questo link:', url); }
  });
  function leave() {
    const s = session;
    closeStream();
    Game.stop();
    api(`/api/spintoni/rooms/${s.code}/leave`, { playerId: s.playerId, token: s.token }).catch(() => {});
    goHome();
  }
  $('btn-leave').addEventListener('click', () => { if (confirm('Uscire dall\'arena?')) leave(); });
  $('btn-quit').addEventListener('click', () => { if (confirm('Uscire dalla partita e dall\'arena?')) leave(); });

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 2400);
  }

  async function route() {
    const code = codeFromUrl();
    if (!code) { closeStream(); return showHome(); }
    if (session && session.code === code) return;
    const saved = store.get(KEY(code));
    if (saved) {
      try { return enterRoom(await api(`/api/spintoni/rooms/${code}/join`, saved)); }
      catch { store.del(KEY(code)); }
    }
    showHome(code);
  }
  window.addEventListener('popstate', route);

  if (!Player.require()) return;
  route();
})();
