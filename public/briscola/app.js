'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignora */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignora */ } },
  };
  const KEY = (code) => 'briscola:' + code;
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SUIT_ICON = { denari: '🪙', coppe: '🏆', spade: '⚔️', bastoni: '🪵' };

  let session = null;
  let S = null;
  let es = null;
  let unloading = false;
  let selected = null;     // carta selezionata (si gioca toccandola di nuovo)
  let lastTurnKey = '';

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
    $('room-error').textContent = '';
    try { return await api(`/api/briscola/rooms/${session.code}/${action}`, { playerId: session.playerId, token: session.token, ...extra }); }
    catch (err) { toast(err.message); return null; }
  }

  // ---------- navigazione ----------
  function codeFromUrl() {
    const m = location.pathname.match(/^\/briscola\/r\/([A-Za-z0-9]{5})\/?$/);
    return m ? m[1].toUpperCase() : null;
  }
  function showHome(prefill, error) {
    closeStream();
    session = null; S = null;
    $('screen-room').hidden = true;
    $('screen-home').hidden = false;
    if (prefill) $('input-code').value = prefill;
    $('home-error').textContent = error || '';
    $('who-name').textContent = Player.getName();
    $('link-change').href = Player.loginUrl(true);
  }
  function enterRoom(s) {
    session = s;
    store.set(KEY(s.code), s);
    if (codeFromUrl() !== s.code) history.pushState(null, '', '/briscola/r/' + s.code);
    $('screen-home').hidden = true;
    $('screen-room').hidden = false;
    $('room-code').textContent = s.code;
    openStream();
  }
  function goHome(msg) {
    if (session) store.del(KEY(session.code));
    history.pushState(null, '', '/briscola/');
    showHome('', msg);
  }

  // ---------- tempo reale ----------
  function openStream() {
    closeStream();
    const q = new URLSearchParams({ playerId: session.playerId, token: session.token });
    es = new EventSource(`/api/briscola/rooms/${session.code}/events?${q}`);
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
      await api(`/api/briscola/rooms/${s.code}/join`, s);
      if (session === s) setTimeout(() => session === s && openStream(), 1500);
    } catch (err) {
      if (session !== s) return;
      if (/non trovata|non riconosciuto|nome|pieno/i.test(err.message)) { closeStream(); goHome('Il tavolo non esiste più.'); }
      else setTimeout(() => session === s && checkSession(), 3000);
    }
  }

  // ---------- carte ----------
  function cardHtml(c, extra = '', tag = 'div', attrs = '') {
    const trump = S && S.game.briscola && c.suit === S.game.briscola.suit ? ' is-trump' : '';
    const icon = SUIT_ICON[c.suit];
    return `<${tag} class="card ${c.suit}${trump} ${extra}" ${attrs} title="${esc(c.name)}" aria-label="${esc(c.name)}">
      <span class="cr">${esc(c.label)}<span class="s">${icon}</span></span>
      <span class="cc">${icon}</span>
      <span class="cn">${esc(c.name)}</span>
      <span class="cb">${esc(c.label)}<span class="s">${icon}</span></span>
    </${tag}>`;
  }

  // ---------- render ----------
  const isHost = () => S.hostId === S.you;

  function render(state) {
    S = state;
    const g = S.game;
    const playing = g.phase === 'playing' || g.phase === 'trick';
    $('room-mode').textContent = g.mode === 4 ? 'Briscola in 4 · tavolo' : 'Briscola in 2 · tavolo';
    renderScore(g);
    $('lobby').hidden = playing;
    $('board').hidden = !playing;
    $('hand-area').hidden = !playing;
    $('result').hidden = g.phase !== 'over' || !g.result;
    if (!playing) renderLobby(g);
    if (playing) { renderBoard(g); renderHand(g); }
    if (g.phase === 'over' && g.result) renderResult(g);
    $('log').innerHTML = g.log.slice().reverse().map((l) => `<li class="${l.text.startsWith('—') ? 'sep' : ''}">${esc(l.text)}</li>`).join('');
  }

  function renderScore(g) {
    const t = (i) => `<div class="team t${i}"><div class="tn"><span class="tdot t${i}"></span>${esc(g.teams[i] || (g.mode === 4 ? `Squadra ${i + 1}` : '…'))}</div><div class="tw">${g.wins[i]}</div></div>`;
    $('score').innerHTML = `${t(0)}<div class="vs">partite<br>vinte</div>${t(1)}`;
  }

  function renderLobby(g) {
    const n = g.players.length;
    $('lobby-count').textContent = `${n}/${g.mode}`;
    const row = (p, i) => p
      ? `<div class="lobby-row"><span class="tdot t${g.mode === 4 ? i % 2 : i}"></span><span class="nm">${esc(p.name)}${p.id === S.you ? ' <span class="muted small">(tu)</span>' : ''}${p.id === S.hostId ? ' 👑' : ''}</span></div>`
      : '<div class="lobby-row empty">In attesa di un giocatore…</div>';
    const slots = Array.from({ length: g.mode }, (_, i) => g.players[i] || null);
    if (g.mode === 4) {
      $('lobby-list').innerHTML = [0, 1].map((t) => `<div class="team-label"><span class="tdot t${t}"></span>Squadra ${t + 1}</div>
        ${[t, t + 2].map((i) => row(slots[i], i)).join('')}`).join('');
    } else {
      $('lobby-list').innerHTML = slots.map(row).join('');
    }

    // in 4 ci si sposta per scegliere il compagno
    const me = g.players.findIndex((p) => p.id === S.you);
    const canMove = g.mode === 4 && n >= 3 && me !== -1;
    $('lobby-move').hidden = !canMove;
    if (canMove) {
      const mate = g.players[(me + 2) % n];
      $('lobby-move').innerHTML = `<span>${n === 4 && mate ? `In coppia con <strong>${esc(mate.name)}</strong>` : 'Spostati per scegliere il compagno'}</span>
        <span class="btns"><button type="button" class="btn small" data-move="-1">Gioca prima</button>
        <button type="button" class="btn small" data-move="1">Gioca dopo</button></span>`;
    }

    $('host-controls').hidden = !isHost();
    for (const b of $('mode-seg').querySelectorAll('[data-mode]')) {
      const m = Number(b.dataset.mode);
      b.setAttribute('aria-pressed', String(g.mode === m));
      b.disabled = n > m;
    }
    const full = n === g.mode;
    $('btn-start').hidden = !isHost();
    $('btn-start').disabled = !full;
    $('btn-start').textContent = g.handNo ? 'Nuova partita' : 'Inizia la partita';
    $('lobby-hint').textContent = !full
      ? `Mancano ${g.mode - n} giocator${g.mode - n === 1 ? 'e' : 'i'}: invitali con il pulsante Invita.`
      : isHost() ? 'Ci siete tutti!' : 'Ci siete tutti: aspetta che l\'host inizi la partita.';
  }

  function relPos(g, i) {
    const n = g.players.length;
    const me = Math.max(0, g.me);
    const r = (i - me + n) % n;
    if (n === 2) return r === 0 ? 'bottom' : 'top';
    return ['bottom', 'left', 'top', 'right'][r];
  }

  function renderBoard(g) {
    for (const pos of ['top', 'left', 'right']) $('pos-' + pos).innerHTML = '';
    g.players.forEach((p, i) => {
      const pos = relPos(g, i);
      if (pos === 'bottom') return;
      const backs = Array.from({ length: p.cards }, () => '<span class="mini-back"></span>').join('');
      const mate = g.mode === 4 && p.team === g.players[g.me].team;
      $('pos-' + pos).innerHTML = `<span class="opp-name ${g.turn === p.id ? 'turn' : ''}"><span class="tdot t${p.team}"></span>${esc(p.name)}${mate ? ' 🤝' : ''}${p.dealer ? '<span class="dealer-chip" title="Mazziere">M</span>' : ''}</span>
        <span class="backs">${backs}</span>`;
    });

    // mazzo con la briscola scoperta sotto
    const deck = $('deck-area');
    deck.className = 'deck-area side';
    deck.innerHTML = g.deckCount > 0
      ? `<div class="deck-wrap">${cardHtml(g.briscola, 'briscola')}${g.deckCount > 1 ? '<span class="mini-back deck-back"></span>' : ''}
          <span class="deck-count">${g.deckCount > 1 ? g.deckCount : ''}</span></div><div class="deck-label">Briscola<br><strong>${esc(g.briscola.name)}</strong></div>`
      : `<div class="deck-label">Briscola: ${SUIT_ICON[g.briscola.suit]}<br>mazzo finito</div>`;

    // presa in corso
    $('trick').innerHTML = g.trick.map((t) => {
      const i = g.players.findIndex((p) => p.id === t.playerId);
      const win = g.phase === 'trick' && g.trickWinner === t.playerId ? 'win' : '';
      return cardHtml(t.card, `p-${relPos(g, i)} ${win}`);
    }).join('');

    const msg = $('turn-msg');
    const name = (id) => (g.players.find((p) => p.id === id) || {}).name || '?';
    msg.classList.toggle('me', g.turn === S.you);
    if (g.phase === 'trick') {
      const pts = g.trick.reduce((s, t) => s + t.card.points, 0);
      msg.textContent = `${g.trickWinner === S.you ? 'Prendi tu' : `Prende ${name(g.trickWinner)}`}${pts ? ` · ${pts} punti` : ''}`;
    } else {
      msg.textContent = g.turn === S.you ? 'Tocca a te' : `Tocca a ${name(g.turn)}`;
    }
  }

  function renderHand(g) {
    const myTurn = g.phase === 'playing' && g.turn === S.you;
    const turnKey = `${g.handNo}-${g.deckCount}-${g.trick.length}-${g.turn}`;
    if (myTurn && turnKey !== lastTurnKey && navigator.vibrate) navigator.vibrate(60);
    lastTurnKey = turnKey;
    if (!g.hand.some((c) => c.id === selected) || !myTurn) selected = null;

    const me = g.players[g.me];
    const mate = g.mode === 4 ? g.players[(g.me + 2) % 4] : null;
    $('me-line').innerHTML = `<span class="tdot t${me.team}"></span><strong>${esc(me.name)}</strong>${mate ? ` · in coppia con ${esc(mate.name)}` : ''}${me.dealer ? '<span class="dealer-chip" title="Mazziere">M</span>' : ''}`;

    const hand = $('hand');
    hand.className = `hand ${myTurn ? 'turn' : 'wait'}`;
    hand.innerHTML = g.hand.map((c) => cardHtml(c, c.id === selected ? 'sel' : '', 'button', `type="button" data-card="${c.id}" ${myTurn ? '' : 'disabled'}`)).join('');
    $('hand-hint').textContent = myTurn
      ? (selected ? 'Tocca di nuovo la carta per giocarla' : 'Scegli una carta da giocare')
      : g.phase === 'trick' ? '' : 'Aspetta il tuo turno';
  }

  function renderResult(g) {
    const r = g.result;
    $('result-title').textContent = r.winner === null ? 'Pareggio!' : `${g.mode === 4 ? 'Vincono' : 'Vince'} ${r.teams[r.winner]}!`;
    $('result-body').innerHTML = [0, 1].map((t) => `<div class="res-row ${r.winner === t ? 'win' : ''}">
      <div><div><span class="tdot t${t}"></span><strong>${esc(r.teams[t])}</strong></div><div class="sub">${r.cards[t]} carte prese</div></div>
      <div class="pts">${r.points[t]}</div></div>`).join('')
      + '<p class="muted small center">Per vincere servono più di 60 punti su 120.</p>';
  }

  // ---------- eventi ----------
  $('hand').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-card]');
    if (!b || b.disabled) return;
    const id = b.dataset.card;
    if (selected !== id) { selected = id; render(S); return; }
    selected = null;
    for (const x of $('hand').querySelectorAll('button')) x.disabled = true;
    await run('play', { cardId: id });
  });
  $('btn-start').addEventListener('click', () => run('start'));
  $('mode-seg').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]');
    if (b && !b.disabled) run('mode', { mode: Number(b.dataset.mode) });
  });
  $('lobby-move').addEventListener('click', (e) => {
    const b = e.target.closest('[data-move]');
    if (b) run('seat', { dir: Number(b.dataset.move) });
  });

  for (const b of document.querySelectorAll('[data-create]')) {
    b.addEventListener('click', async () => {
      const name = Player.require();
      if (!name) return;
      try { enterRoom(await api('/api/briscola/rooms', { name, mode: Number(b.dataset.create) })); }
      catch (err) { $('home-error').textContent = err.message; }
    });
  }
  $('form-join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('input-code').value.trim().toUpperCase();
    if (code.length !== 5) { $('home-error').textContent = 'Il codice è di 5 caratteri.'; return; }
    const name = Player.require();
    if (!name) return;
    try { enterRoom(await api(`/api/briscola/rooms/${code}/join`, { name })); }
    catch (err) { $('home-error').textContent = err.message; }
  });
  $('btn-share').addEventListener('click', async () => {
    const url = `${location.origin}/briscola/r/${session.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Briscola', text: `Vieni a giocare a briscola: tavolo ${session.code}`, url }); return; }
      catch (err) { if (err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copiato!'); }
    catch { prompt('Copia questo link:', url); }
  });
  $('btn-leave').addEventListener('click', () => {
    const playing = S && (S.game.phase === 'playing' || S.game.phase === 'trick');
    if (!confirm(playing ? 'Uscendo interrompi la partita per tutti. Uscire?' : 'Uscire dal tavolo?')) return;
    const s = session;
    closeStream();
    api(`/api/briscola/rooms/${s.code}/leave`, { playerId: s.playerId, token: s.token }).catch(() => {});
    goHome();
  });

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
      try { return enterRoom(await api(`/api/briscola/rooms/${code}/join`, saved)); }
      catch { store.del(KEY(code)); }
    }
    showHome(code);
  }
  window.addEventListener('popstate', route);

  if (!Player.require()) return;
  route();
})();
