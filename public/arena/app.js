'use strict';
(() => {
  const A = window.ArenaShared;
  const D = window.ArenaDraw;
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignora */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignora */ } },
  };
  const KEY = (code) => 'arena:' + code;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CHAR_IDS = Object.keys(A.CHARS);

  let session = null;
  let S = null;          // stato della sala (SSE)
  let es = null;
  let unloading = false;
  window.addEventListener('pagehide', () => { unloading = true; });
  window.addEventListener('pageshow', () => { unloading = false; });

  // ---------- API ----------
  async function api(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Errore di rete');
    return data;
  }
  async function run(action, extra) {
    try { return await api(`/api/arena/rooms/${session.code}/${action}`, { playerId: session.playerId, token: session.token, ...extra }); }
    catch (err) { toast(err.message); return null; }
  }

  // ---------- navigazione ----------
  function codeFromUrl() {
    const m = location.pathname.match(/^\/arena\/r\/([A-Za-z0-9]{5})\/?$/);
    return m ? m[1].toUpperCase() : null;
  }
  function showHome(prefill, error) {
    closeStream();
    Game.stop();
    session = null; S = null;
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
    if (codeFromUrl() !== s.code) history.pushState(null, '', '/arena/r/' + s.code);
    $('screen-home').hidden = true;
    $('screen-lobby').hidden = false;
    $('room-code').textContent = s.code;
    openStream();
  }
  function goHome(msg) {
    if (session) store.del(KEY(session.code));
    history.pushState(null, '', '/arena/');
    showHome('', msg);
  }

  // ---------- sala d'attesa (SSE) ----------
  function openStream() {
    closeStream();
    const q = new URLSearchParams({ playerId: session.playerId, token: session.token });
    es = new EventSource(`/api/arena/rooms/${session.code}/events?${q}`);
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
      await api(`/api/arena/rooms/${s.code}/join`, s);
      if (session === s) setTimeout(() => session === s && openStream(), 1500);
    } catch (err) {
      if (session !== s) return;
      if (/non trovata|non riconosciuto|nome|piena|corso/i.test(err.message)) { closeStream(); goHome('L\'arena non esiste più.'); }
      else setTimeout(() => session === s && checkSession(), 3000);
    }
  }

  const isHost = () => S && S.hostId === S.you;
  const nameOf = (id) => {
    const m = S && S.members.find((x) => x.id === id);
    if (m) return m.name;
    const b = S && S.game.bots.find((x) => x.id === id);
    return b ? b.name : '?';
  };

  function render(state) {
    if (session) PublicRoom.update('arena', state, session);
    S = state;
    const g = S.game;
    if (g.phase === 'playing') {
      Game.start(g.matchNo);
      Game.setCountdown(g.cd);
    } else {
      if (Game.running()) Game.stop();
      $('screen-game').hidden = true;
      $('screen-lobby').hidden = false;
    }
    renderLobby(g);
  }

  function statBars(def) {
    const max = (f) => Math.max(...CHAR_IDS.map((id) => f(A.CHARS[id])));
    const dps = (d) => d.attack.damage * d.attack.count;
    const rows = [
      ['Vita', def.hp / max((d) => d.hp)],
      ['Velocità', def.speed / max((d) => d.speed)],
      ['Gittata', def.attack.range / max((d) => d.attack.range)],
      ['Danno', dps(def) / max(dps)],
    ];
    return rows.map(([l, v]) => `<div class="stat">${l}<span class="bar"><span style="width:${Math.round(v * 100)}%"></span></span></div>`).join('');
  }

  let charsBuilt = false;
  function renderLobby(g) {
    if (!charsBuilt) {
      $('chars').innerHTML = CHAR_IDS.map((id) => {
        const d = A.CHARS[id];
        return `<button type="button" class="char" data-char="${id}" aria-pressed="false">
          <canvas data-portrait="${id}"></canvas><span class="cn">${esc(d.name)}</span>
          <span class="cd">${esc(d.desc)}</span><span class="stats">${statBars(d)}</span></button>`;
      }).join('');
      for (const c of $('chars').querySelectorAll('[data-portrait]')) D.portrait(c, c.dataset.portrait);
      charsBuilt = true;
    }
    const mine = g.picks[S.you];
    for (const b of $('chars').querySelectorAll('[data-char]')) b.setAttribute('aria-pressed', String(b.dataset.char === mine));

    const fighters = [
      ...S.members.map((m) => ({ id: m.id, name: m.name, char: g.picks[m.id] || 'folgore', me: m.id === S.you, host: m.id === S.hostId, online: m.online })),
      ...g.bots.map((b) => ({ ...b, bot: true })),
    ];
    $('roster-count').textContent = `${fighters.length}/${g.max}`;
    $('roster').innerHTML = fighters.map((f) => `<li>
        <canvas data-mini="${f.char}"></canvas>
        <span class="nm">${esc(f.name)}${f.me ? ' <span class="muted small">(tu)</span>' : ''}${f.host ? ' 👑' : ''}</span>
        <span class="ch">${esc(A.CHARS[f.char].name)}</span>
        ${f.bot && isHost() ? `<button class="btn danger-text" data-rm-bot="${f.id}" aria-label="Togli ${esc(f.name)}">✕</button>` : ''}
      </li>`).join('');
    for (const c of $('roster').querySelectorAll('[data-mini]')) D.portrait(c, c.dataset.mini);

    $('host-bots').hidden = !isHost() || fighters.length >= g.max;
    $('btn-start').hidden = !isHost();
    $('btn-start').disabled = fighters.length < 2;
    $('btn-start').textContent = g.results ? '▶ Rigioca' : '▶ Inizia la rissa';
    $('start-hint').textContent = fighters.length < 2
      ? (isHost() ? 'Servono almeno 2 lottatori: invita qualcuno o aggiungi un bot.' : 'In attesa di altri lottatori…')
      : isHost() ? 'Partita da 2 minuti, tutti contro tutti.' : 'Aspetta che l\'host avvii la partita.';

    // classifica dell'ultima partita
    $('results').hidden = !g.results;
    if (g.results) {
      const win = g.results[0];
      $('results-title').textContent = win.id === S.you ? '🏆 Hai vinto!' : `🏆 Vince ${win.name}`;
      $('results-list').innerHTML = g.results.map((r, i) => `<li class="${i === 0 ? 'first' : ''} ${r.id === S.you ? 'me' : ''}">
          <span class="pos">${i === 0 ? '👑' : i + 1}</span><canvas data-mini="${r.char}"></canvas>
          <span class="nm">${esc(r.name)}</span>
          <span class="st"><strong>${r.kills}</strong> KO · ${r.deaths} cadute · ${r.damage} danni</span></li>`).join('');
      for (const c of $('results-list').querySelectorAll('[data-mini]')) D.portrait(c, c.dataset.mini);
    }
  }

  $('chars').addEventListener('click', (e) => {
    const b = e.target.closest('[data-char]');
    if (b) run('pick', { char: b.dataset.char });
  });
  $('roster').addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm-bot]');
    if (b) run('removeBot', { botId: b.dataset.rmBot });
  });
  $('btn-add-bot').addEventListener('click', () => run('addBot'));
  $('btn-start').addEventListener('click', () => run('start'));

  // =====================================================================
  // PARTITA
  // =====================================================================
  const Game = (() => {
    const canvas = $('canvas');
    const ctx = canvas.getContext('2d');
    let ground = null, bushes = null;
    let ws = null, raf = 0, sendTimer = 0, matchNo = -1, active = false;
    let W = 0, H = 0, dpr = 1, scale = 1;

    // stato ricevuto
    let snaps = [];          // ultimi snapshot { k, recv, p: Map, b: Map }
    let clockOffset = null;  // ms: ora locale - tempo del server
    let last = null;         // ultimo snapshot
    let myChar = 'folgore';

    // previsione del mio movimento
    let seq = 0, pending = [], pred = null, prevPred = null, lastTickAt = 0;
    let fireCount = 0, superCount = 0, fireAim = null, superAim = null;
    let aimAngle = 0;

    // input
    const keys = new Set();
    let mouse = { x: 0, y: 0, active: false, down: false, nextAuto: 0 };
    const touches = { move: null, aim: null, sup: null };

    // effetti
    let particles = [], numbers = [], waves = [], feed = [];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      scale = Math.min(W, H) / 640;
      if (Math.max(W, H) / scale > 1500) scale = Math.max(W, H) / 1500;
    }

    function start(no) {
      if (active && no === matchNo) return;
      stop();
      matchNo = no;
      active = true;
      if (!ground) { ground = D.makeGround(); bushes = D.makeBushes(); }
      $('screen-lobby').hidden = true;
      $('screen-game').hidden = false;
      $('dead').hidden = true;
      $('feed').innerHTML = '';
      $('countdown').hidden = true; cdShown = false; cdEnd = 0;
      clearInterval(cdTimer); cdTimer = setInterval(cdTick, 100);
      snaps = []; last = null; clockOffset = null;
      seq = 0; pending = []; pred = null; prevPred = null;
      fireCount = 0; superCount = 0; fireAim = null; superAim = null;
      particles = []; numbers = []; waves = []; feed = [];
      myChar = (S && S.game.picks[S.you]) || 'folgore';
      resize();
      connect();
      sendTimer = setInterval(sendInput, A.TICK * 1000);
      raf = requestAnimationFrame(frame);
    }

    function stop() {
      active = false;
      if (ws) { ws.onclose = null; try { ws.close(); } catch { /* ignora */ } ws = null; }
      clearInterval(sendTimer); clearInterval(cdTimer);
      cancelAnimationFrame(raf);
      touches.move = touches.aim = touches.sup = null;
    }

    function connect() {
      const q = new URLSearchParams({ playerId: session.playerId, token: session.token });
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/api/arena/rooms/${session.code}/ws?${q}`);
      ws.onmessage = (e) => onMessage(JSON.parse(e.data));
      ws.onclose = () => { if (active) setTimeout(() => active && connect(), 1000); };
    }

    function onMessage(m) {
      if (m.t === 's') onSnapshot(m);
      else if (m.t === 'end') stop();
    }

    function onSnapshot(m) {
      const now = performance.now();
      const off = now - m.k * A.TICK * 1000;
      clockOffset = clockOffset === null ? off : Math.min(off, clockOffset + 2); // segue il ritardo minimo
      const snap = { k: m.k, recv: now, p: new Map(m.p.map((p) => [p.id, p])), b: new Map(m.b.map((b) => [b.id, b])), raw: m };
      snaps.push(snap);
      if (snaps.length > 40) snaps.shift();
      last = snap;

      // riconciliazione: posizione del server + input non ancora confermati
      const me = snap.p.get(S.you);
      if (me) {
        myChar = me.c;
        if (!me.al || me.d || !pred) {
          pending = [];
          pred = { x: me.x, y: me.y };
          prevPred = { ...pred };
        } else {
          pending = m.cd > 0 ? [] : pending.filter((i) => i.s > m.ack); // durante il conto alla rovescia il server ignora gli input
          const r = A.CHARS[me.c].radius, sp = A.CHARS[me.c].speed;
          const p = { x: me.x, y: me.y };
          for (const i of pending) A.stepMove(p, i.mx, i.my, sp, r);
          const dx = p.x - pred.x, dy = p.y - pred.y;
          if (Math.hypot(dx, dy) > 120) { pred = p; prevPred = { ...p }; }
          else { pred = p; prevPred = { x: prevPred.x + dx, y: prevPred.y + dy }; }
        }
      }
      for (const ev of m.ev) onEvent(ev);
      updateHud(m, me);
    }

    function onEvent(ev) {
      const now = performance.now();
      if (ev.t === 'hit') {
        numbers.push({ x: ev.x + (Math.random() - 0.5) * 20, y: ev.y - 30, text: String(ev.n), born: now, me: ev.id === S.you });
        burst(ev.x, ev.y, '#ffffff', 5);
      } else if (ev.t === 'pop') {
        burst(ev.x, ev.y, A.CHARS[ev.c] ? A.CHARS[ev.c].color : '#fff', 4);
      } else if (ev.t === 'wave') {
        waves.push({ x: ev.x, y: ev.y, r: ev.r, born: now });
      } else if (ev.t === 'ko') {
        burst(ev.x, ev.y, '#ff5252', 22);
        const killer = ev.by ? nameOf(ev.by) : null;
        const victim = nameOf(ev.id);
        const mine = ev.by === S.you || ev.id === S.you;
        addFeed(killer ? `💥 ${killer} ha eliminato ${victim}` : `💥 ${victim} è fuori`, mine);
        if (ev.by === S.you && navigator.vibrate) navigator.vibrate(40);
        if (ev.id === S.you && navigator.vibrate) navigator.vibrate([80, 40, 120]);
      } else if (ev.t === 'spawn') {
        burst(ev.x, ev.y, '#81d4fa', 12);
      }
    }

    function burst(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 220;
        particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35 + Math.random() * 0.3, t: 0, color, size: 2 + Math.random() * 3 });
      }
      if (particles.length > 400) particles.splice(0, particles.length - 400);
    }

    function addFeed(text, mine) {
      const el = document.createElement('div');
      el.textContent = text;
      if (mine) el.className = 'mine';
      $('feed').prepend(el);
      while ($('feed').children.length > 4) $('feed').lastChild.remove();
      setTimeout(() => el.remove(), 4500);
    }

    // conto alla rovescia: la fine arriva sia dallo stato della stanza (SSE) sia dagli snapshot, così si vede anche
    // se la connessione in tempo reale ci mette un po' ad aprirsi
    let cdShown = false, goTimer = null, cdEnd = 0, cdTimer = null;
    function setCountdown(sec) { cdEnd = performance.now() + (Number(sec) || 0) * 1000; }
    function cdTick() {
      const el = $('countdown');
      const left = (cdEnd - performance.now()) / 1000;
      if (left > 0) {
        const n = String(Math.ceil(left));
        if (el.textContent !== n || el.hidden) { el.textContent = n; el.hidden = false; el.classList.remove('go'); el.style.animation = 'none'; void el.offsetWidth; el.style.animation = ''; }
        cdShown = true;
      } else if (cdShown) {
        cdShown = false;
        el.textContent = 'VIA!'; el.hidden = false; el.classList.add('go');
        clearTimeout(goTimer);
        goTimer = setTimeout(() => { el.hidden = true; }, 800);
      }
    }

    function updateHud(m, me) {
      setCountdown(m.cd);
      const left = Math.ceil(m.left);
      $('timer').textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      $('timer').classList.toggle('low', left <= 15);
      const sc = m.sc.slice().sort((a, b) => b.k - a.k);
      const top = sc.slice(0, 3);
      if (!top.some((x) => x.id === S.you)) { const mine = sc.find((x) => x.id === S.you); if (mine) top.push(mine); }
      $('board').innerHTML = top.map((x) => `<div class="${x.id === S.you ? 'me' : ''}"><span class="dotc" style="background:${A.CHARS[x.c].color}"></span>${esc(x.n)} <b>${x.k}</b></div>`).join('');
      if (me) {
        $('dead').hidden = me.al;
        if (!me.al) $('dead-text').textContent = `Rientri tra ${Math.ceil(me.rs)}…`;
        const btn = $('btn-super');
        btn.style.setProperty('--charge', me.sp);
        btn.classList.toggle('ready', me.sp >= 1);
      }
    }

    // ---------- input ----------
    function moveVector() {
      let mx = 0, my = 0;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      if (keys.has('w') || keys.has('arrowup')) my -= 1;
      if (keys.has('s') || keys.has('arrowdown')) my += 1;
      if (touches.move) {
        const t = touches.move;
        const dx = t.x - t.ox, dy = t.y - t.oy, l = Math.hypot(dx, dy);
        if (l > 8) { const k = Math.min(1, l / 55) / l; mx = dx * k; my = dy * k; }
      }
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
      return { mx, my };
    }

    function myScreenPos() {
      const cam = camera();
      const p = displayedMe();
      return p ? { x: (p.x - cam.x) * scale + W / 2, y: (p.y - cam.y) * scale + H / 2 } : { x: W / 2, y: H / 2 };
    }

    function aimVector() {
      if (touches.aim) {
        const t = touches.aim, dx = t.x - t.ox, dy = t.y - t.oy, l = Math.hypot(dx, dy);
        return l > 14 ? { ax: dx / l, ay: dy / l } : { ax: 0, ay: 0 };
      }
      if (touches.sup) {
        const t = touches.sup, dx = t.x - t.ox, dy = t.y - t.oy, l = Math.hypot(dx, dy);
        return l > 14 ? { ax: dx / l, ay: dy / l } : { ax: 0, ay: 0 };
      }
      if (mouse.active) {
        const me = myScreenPos();
        const dx = mouse.x - me.x, dy = mouse.y - me.y, l = Math.hypot(dx, dy);
        return l > 4 ? { ax: dx / l, ay: dy / l } : { ax: 0, ay: 0 };
      }
      return { ax: 0, ay: 0 };
    }

    function sendInput() {
      if (!ws || ws.readyState !== 1) return;
      const now = performance.now();
      const { mx, my } = moveVector();
      let { ax, ay } = aimVector();
      // tenendo premuto il mouse si continua a sparare
      if (mouse.down && now >= mouse.nextAuto) { fireCount += 1; mouse.nextAuto = now + 360; }
      if (fireAim) { ({ ax, ay } = fireAim); fireAim = null; }
      if (superAim) { ({ ax, ay } = superAim); superAim = null; }
      if (Math.hypot(ax, ay) > 0.2) aimAngle = Math.atan2(ay, ax);
      else if (Math.hypot(mx, my) > 0.2) aimAngle = Math.atan2(my, mx);
      seq += 1;
      ws.send(JSON.stringify({ t: 'in', s: seq, mx: +mx.toFixed(3), my: +my.toFixed(3), ax: +ax.toFixed(3), ay: +ay.toFixed(3), f: fireCount, u: superCount }));
      // previsione immediata del mio movimento
      const me = last && last.p.get(S.you);
      if (pred && me && me.al && !me.d && !(last.raw.cd > 0)) {
        pending.push({ s: seq, mx, my });
        prevPred = { ...pred };
        A.stepMove(pred, mx, my, A.CHARS[myChar].speed, A.CHARS[myChar].radius);
      }
      lastTickAt = now;
    }

    const isGameKey = (k) => ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'e'].includes(k);
    window.addEventListener('keydown', (e) => {
      if (!active) return;
      const k = e.key.toLowerCase();
      if (isGameKey(k)) e.preventDefault();
      if ((k === ' ' || k === 'e') && !e.repeat) superCount += 1;
      keys.add(k);
    });
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });

    canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true; });
    canvas.addEventListener('mousedown', (e) => {
      mouse.x = e.clientX; mouse.y = e.clientY; mouse.active = true;
      if (e.button === 2) { superCount += 1; return; }
      if (e.button === 0) { mouse.down = true; fireCount += 1; mouse.nextAuto = performance.now() + 360; }
    });
    window.addEventListener('mouseup', () => { mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // doppio joystick sul telefono
    const game = $('screen-game');
    const superBtn = $('btn-super');
    game.addEventListener('touchstart', (e) => {
      if (!active || (e.target.closest && e.target.closest('#btn-quit'))) return;
      for (const t of e.changedTouches) {
        const onSuper = superBtn.contains(document.elementFromPoint(t.clientX, t.clientY));
        const info = { id: t.identifier, ox: t.clientX, oy: t.clientY, x: t.clientX, y: t.clientY };
        if (onSuper && !touches.sup) touches.sup = info;
        else if (t.clientX < W / 2 && !touches.move) touches.move = info;
        else if (t.clientX >= W / 2 && !touches.aim) touches.aim = info;
      }
      mouse.active = false;
      e.preventDefault();
    }, { passive: false });
    game.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        for (const k of ['move', 'aim', 'sup']) {
          if (touches[k] && touches[k].id === t.identifier) { touches[k].x = t.clientX; touches[k].y = t.clientY; }
        }
      }
      e.preventDefault();
    }, { passive: false });
    const endTouch = (e) => {
      for (const t of e.changedTouches) {
        if (touches.move && touches.move.id === t.identifier) touches.move = null;
        if (touches.aim && touches.aim.id === t.identifier) {
          const a = touches.aim, dx = a.x - a.ox, dy = a.y - a.oy, l = Math.hypot(dx, dy);
          fireAim = l > 18 ? { ax: dx / l, ay: dy / l } : { ax: 0, ay: 0 }; // tocco breve: mira automatica
          fireCount += 1;
          touches.aim = null;
        }
        if (touches.sup && touches.sup.id === t.identifier) {
          const a = touches.sup, dx = a.x - a.ox, dy = a.y - a.oy, l = Math.hypot(dx, dy);
          superAim = l > 18 ? { ax: dx / l, ay: dy / l } : { ax: 0, ay: 0 };
          superCount += 1;
          touches.sup = null;
        }
      }
    };
    game.addEventListener('touchend', endTouch);
    game.addEventListener('touchcancel', endTouch);
    superBtn.addEventListener('click', () => { if (mouse.active) superCount += 1; });
    window.addEventListener('resize', () => { if (active) resize(); });

    // ---------- disegno ----------
    function displayedMe() {
      if (!pred) return null;
      const t = Math.max(0, Math.min(1, (performance.now() - lastTickAt) / (A.TICK * 1000)));
      return { x: prevPred.x + (pred.x - prevPred.x) * t, y: prevPred.y + (pred.y - prevPred.y) * t };
    }

    function camera() {
      const me = displayedMe();
      const c = me || { x: A.MAP.w / 2, y: A.MAP.h / 2 };
      const vw = W / scale, vh = H / scale;
      const cx = vw >= A.MAP.w ? A.MAP.w / 2 : Math.max(vw / 2, Math.min(A.MAP.w - vw / 2, c.x));
      const cy = vh >= A.MAP.h ? A.MAP.h / 2 : Math.max(vh / 2, Math.min(A.MAP.h - vh / 2, c.y));
      return { x: cx, y: cy };
    }

    // interpola gli altri tra due snapshot, 100 ms nel passato
    function interpolated() {
      if (!snaps.length) return { players: [], bullets: [] };
      const renderK = (performance.now() - clockOffset) / (A.TICK * 1000) - 2;
      let a = snaps[0], b = snaps[snaps.length - 1];
      for (let i = snaps.length - 1; i > 0; i--) {
        if (snaps[i - 1].k <= renderK) { a = snaps[i - 1]; b = snaps[i]; break; }
      }
      if (renderK >= b.k) a = b;
      const t = a === b ? 1 : Math.max(0, Math.min(1, (renderK - a.k) / (b.k - a.k)));
      const lerp = (p0, p1) => (p0 ? { ...p1, x: p0.x + (p1.x - p0.x) * t, y: p0.y + (p1.y - p0.y) * t, a: lerpAngle(p0.a, p1.a, t) } : p1);
      const players = [];
      for (const p1 of b.p.values()) players.push(lerp(a.p.get(p1.id), p1));
      const bullets = [];
      for (const q1 of b.b.values()) bullets.push(lerp(a.b.get(q1.id), q1));
      return { players, bullets };
    }
    function lerpAngle(a0, a1, t) {
      if (a0 === undefined) return a1;
      let d = a1 - a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return a0 + d * t;
    }

    let lastFrame = 0;
    function frame(now) {
      if (!active) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
      lastFrame = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0b2e1e';
      ctx.fillRect(0, 0, W, H);
      if (!last) {
        ctx.fillStyle = '#fff'; ctx.font = '600 16px system-ui'; ctx.textAlign = 'center';
        ctx.fillText('Connessione all\'arena…', W / 2, H / 2);
        return;
      }
      const cam = camera();
      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.scale(scale, scale);
      ctx.translate(-cam.x, -cam.y);
      ctx.drawImage(ground, 0, 0);

      const { players, bullets } = interpolated();
      const meSrv = last.p.get(S.you);
      const meDisp = displayedMe();

      // mira: linea di tiro mentre si trascina
      const aiming = touches.aim || touches.sup || mouse.active;
      if (meSrv && meSrv.al && meDisp && aiming) {
        const v = aimVector();
        const def = A.CHARS[myChar];
        const isSup = !!touches.sup;
        if (Math.hypot(v.ax, v.ay) > 0.2) {
          const range = isSup ? (myChar === 'falco' ? 1250 : myChar === 'macigno' ? 250 : 330) : def.attack.range;
          ctx.save();
          ctx.globalAlpha = 0.35;
          ctx.fillStyle = isSup ? '#ffd54f' : '#ffffff';
          const ang = Math.atan2(v.ay, v.ax);
          if (isSup && myChar === 'macigno') {
            ctx.beginPath(); ctx.arc(meDisp.x, meDisp.y, range, 0, Math.PI * 2); ctx.fill();
          } else {
            const spread = Math.max(0.06, isSup ? 0.06 : def.attack.spread / 2 + 0.03);
            ctx.beginPath(); ctx.moveTo(meDisp.x, meDisp.y);
            ctx.arc(meDisp.x, meDisp.y, range, ang - spread, ang + spread); ctx.closePath(); ctx.fill();
          }
          ctx.restore();
        }
      }

      // colpi
      for (const q of bullets) D.bullet(ctx, q.x, q.y, q.c, q.s);

      // lottatori (prima quelli più in alto)
      const list = players.filter((p) => p.al).map((p) => (p.id === S.you && meDisp ? { ...p, x: meDisp.x, y: meDisp.y, a: aimAngle } : p));
      list.sort((p, q) => p.y - q.y);
      for (const p of list) {
        const def = A.CHARS[p.c];
        const me = p.id === S.you;
        const inBush = A.inBush(p.x, p.y);
        D.fighter(ctx, p.x, p.y, p.c, p.a, def.radius, {
          ring: me ? '#69f0ae' : '#ff5252', shield: p.sh, superReady: p.sp >= 1, alpha: inBush ? 0.6 : 1,
        });
      }

      // cespugli sopra i lottatori
      ctx.globalAlpha = 0.92;
      ctx.drawImage(bushes, 0, 0);
      ctx.globalAlpha = 1;

      // barre di vita, nomi e munizioni
      for (const p of list) {
        const def = A.CHARS[p.c];
        const me = p.id === S.you;
        D.bars(ctx, p.x, p.y, def.radius, p.hp, p.mh, me ? 'Tu' : nameOf(p.id), def.color, me);
        if (me && meSrv) D.ammo(ctx, p.x, p.y, def.radius, meSrv.am, 3);
      }

      // effetti
      for (const w of waves) {
        const t = (now - w.born) / 450;
        if (t > 1) continue;
        ctx.strokeStyle = `rgba(255, 213, 79, ${1 - t})`; ctx.lineWidth = 10 * (1 - t) + 2;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r * (0.3 + 0.7 * t), 0, Math.PI * 2); ctx.stroke();
      }
      waves = waves.filter((w) => now - w.born < 450);
      for (const p of particles) {
        p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9;
        ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      particles = particles.filter((p) => p.t < p.life);
      ctx.textAlign = 'center';
      for (const n of numbers) {
        const t = (now - n.born) / 800;
        if (t > 1) continue;
        ctx.globalAlpha = 1 - t;
        ctx.font = `900 ${n.me ? 20 : 18}px system-ui, sans-serif`;
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.8)';
        ctx.strokeText(n.text, n.x, n.y - t * 40);
        ctx.fillStyle = n.me ? '#ff5252' : '#fff';
        ctx.fillText(n.text, n.x, n.y - t * 40);
      }
      ctx.globalAlpha = 1;
      numbers = numbers.filter((n) => now - n.born < 800);
      ctx.restore();

      // joystick sullo schermo
      for (const k of ['move', 'aim']) {
        const t = touches[k];
        if (!t) continue;
        ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(t.ox, t.oy, 55, 0, Math.PI * 2); ctx.stroke();
        const dx = t.x - t.ox, dy = t.y - t.oy, l = Math.hypot(dx, dy), m = Math.min(l, 55) / (l || 1);
        ctx.fillStyle = k === 'move' ? 'rgba(255,255,255,.55)' : 'rgba(255, 213, 79, .7)';
        ctx.beginPath(); ctx.arc(t.ox + dx * m, t.oy + dy * m, 24, 0, Math.PI * 2); ctx.fill();
      }
    }

    return { start, stop, setCountdown, running: () => active };
  })();

  // ---------- home e pulsanti ----------
  $('btn-create').addEventListener('click', async () => {
    const name = Player.require();
    if (!name) return;
    try { enterRoom(await api('/api/arena/rooms', { name })); }
    catch (err) { $('home-error').textContent = err.message; }
  });
  $('form-join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('input-code').value.trim().toUpperCase();
    if (code.length !== 5) { $('home-error').textContent = 'Il codice è di 5 caratteri.'; return; }
    const name = Player.require();
    if (!name) return;
    try { enterRoom(await api(`/api/arena/rooms/${code}/join`, { name })); }
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
    history.replaceState(null, '', '/arena/');
  });
  $('btn-share').addEventListener('click', async () => {
    const url = `${location.origin}/arena/r/${session.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Rissa', text: `Entra nella mia arena: ${session.code}`, url }); return; }
      catch (err) { if (err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copiato!'); }
    catch { prompt('Copia questo link:', url); }
  });
  function leave() {
    const s = session;
    closeStream();
    Game.stop();
    api(`/api/arena/rooms/${s.code}/leave`, { playerId: s.playerId, token: s.token }).catch(() => {});
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
      try { return enterRoom(await api(`/api/arena/rooms/${code}/join`, saved)); }
      catch { store.del(KEY(code)); }
    }
    showHome(code);
  }
  window.addEventListener('popstate', route);

  if (!Player.require()) return;
  route();
})();
