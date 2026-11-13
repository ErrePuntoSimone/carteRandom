'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignora */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignora */ } },
  };
  const KEY = (code) => 'poker:' + code;
  const fmt = new Intl.NumberFormat('it-IT');
  const n = (x) => fmt.format(x || 0);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let session = null;     // { code, playerId, token }
  let S = null;           // ultimo stato ricevuto
  let es = null;
  let unloading = false;
  let managing = false;   // modalità "Gestisci" dell'host
  let actingFor = null;   // id del giocatore per cui l'host/dealer sta agendo
  let raiseOpen = false;
  let raiseKey = '';
  let lastTurnKey = '';
  const picks = {};       // vincitori selezionati per piatto: { 'mano-indice': Set }

  window.addEventListener('pagehide', () => { unloading = true; });
  window.addEventListener('pageshow', () => { unloading = false; });

  // ---------- API ----------
  async function api(path, body) {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Errore di rete');
    return data;
  }
  const roomApi = (action, extra) => api(`/api/poker/rooms/${session.code}/${action}`, { playerId: session.playerId, token: session.token, ...extra });
  async function run(action, extra) {
    $('room-error').textContent = '';
    try { return await roomApi(action, extra); }
    catch (err) { toast(err.message); $('room-error').textContent = err.message; return null; }
  }

  // ---------- navigazione ----------
  function codeFromUrl() {
    const m = location.pathname.match(/^\/poker\/r\/([A-Za-z0-9]{5})\/?$/);
    return m ? m[1].toUpperCase() : null;
  }
  function showHome(prefill, error) {
    closeStream();
    session = null; S = null;
    $('screen-room').hidden = true;
    $('screen-home').hidden = false;
    $('action-bar').hidden = true;
    $('wait-bar').hidden = true;
    if (prefill) $('input-code').value = prefill;
    $('home-error').textContent = error || '';
    $('who-name').textContent = Player.getName();
    $('link-change').href = Player.loginUrl(true);
  }
  function enterRoom(s) {
    session = s;
    store.set(KEY(s.code), s);
    if (codeFromUrl() !== s.code) history.pushState(null, '', '/poker/r/' + s.code);
    $('screen-home').hidden = true;
    $('screen-room').hidden = false;
    $('room-code').textContent = s.code;
    openStream();
  }
  function goHome(msg) {
    if (session) store.del(KEY(session.code));
    history.pushState(null, '', '/poker/');
    showHome('', msg);
  }

  // ---------- tempo reale ----------
  function openStream() {
    closeStream();
    const q = new URLSearchParams({ playerId: session.playerId, token: session.token });
    es = new EventSource(`/api/poker/rooms/${session.code}/events?${q}`);
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
      await api(`/api/poker/rooms/${s.code}/join`, s);
      if (session === s) setTimeout(() => session === s && openStream(), 1500);
    } catch (err) {
      if (session !== s) return;
      if (/non trovata|non riconosciuto|nome/i.test(err.message)) { closeStream(); goHome('Il tavolo non esiste più.'); }
      else setTimeout(() => session === s && checkSession(), 3000);
    }
  }

  // ---------- render ----------
  const nameOf = (id) => (S.table.seats.find((s) => s.id === id) || S.members.find((m) => m.id === id) || {}).name || '?';
  const isHost = () => S.hostId === S.you;
  const isManager = () => isHost() || S.table.dealerId === S.you;
  const inHand = () => S.table.phase === 'betting' || S.table.phase === 'showdown';

  function render(state) {
    S = state;
    const t = S.table;
    if (!inHand()) actingFor = null;
    if (!isHost() || inHand()) managing = false;
    renderStatus(t);
    renderSeats(t);
    renderShowdown(t);
    renderResult(t);
    renderManager(t);
    renderSettings(t);
    renderMe(t);
    renderLog(t);
    renderActions(t);
  }

  function renderStatus(t) {
    const h = t.hand;
    const box = $('status');
    box.classList.remove('deal');
    let street = 'In attesa', msg = '', pot = 0;
    $('status-blinds').textContent = `Bui ${n(t.settings.smallBlind)}/${n(t.settings.bigBlind)}`;
    if (t.phase === 'lobby') {
      const ready = t.seats.filter((s) => s.stack > 0 && !s.sittingOut).length;
      msg = ready < 2 ? 'Aspettate che entrino gli altri giocatori.' : 'Quando ci siete tutti, si inizia la prima mano.';
    } else if (h) {
      pot = h.pot;
      $('status-blinds').textContent = `Mano n. ${h.no} · bui ${n(h.sb)}/${n(h.bb)}`;
      const dealer = `<strong>${esc(nameOf(h.dealerId))}</strong>`;
      if (t.phase === 'betting') {
        street = h.streetName;
        const fresh = h.order.every((id) => !h.players[id].acted);
        const cards = { 1: 'il flop (3 carte)', 2: 'il turn', 3: 'il river' };
        if (h.street === 0 && fresh) { msg = `${dealer} distribuisce 2 carte a testa`; box.classList.add('deal'); }
        else if (h.street > 0 && fresh) { msg = `${dealer} gira ${cards[h.street]}`; box.classList.add('deal'); }
        else msg = h.lastAction ? esc(h.lastAction.text) : '';
        if (h.currentBet > 0) msg += `${msg ? ' · ' : ''}puntata da chiamare: <strong>${n(h.currentBet)}</strong>`;
      } else if (t.phase === 'showdown') {
        street = 'Showdown';
        msg = h.runout ? `${dealer} gira tutte le carte rimaste: mostrate le mani` : 'Mostrate le carte: chi ha vinto?';
        box.classList.add('deal');
      } else {
        street = 'Mano finita';
        pot = h.pots ? h.pots.reduce((s, p) => s + p.amount, 0) : h.pot;
        msg = 'Pronti per la prossima mano.';
      }
    }
    $('status-street').textContent = street;
    $('status-pot').textContent = n(pot);
    $('status-msg').innerHTML = msg;
  }

  function renderSeats(t) {
    const h = t.hand;
    const showHand = h && inHand();
    const dealerId = showHand ? h.dealerId : t.dealerId;
    $('seat-count').textContent = t.seats.length;
    $('btn-manage').hidden = !(isHost() && !inHand());
    $('btn-manage').textContent = managing ? 'Fatto' : 'Gestisci';
    const online = Object.fromEntries(S.members.map((m) => [m.id, m.online]));

    $('seats').innerHTML = t.seats.map((s, i) => {
      const hp = showHand ? h.players[s.id] : null;
      const badges = [];
      if (s.id === dealerId) badges.push('<span class="badge d" title="Dealer">D</span>');
      if (showHand && s.id === h.sbId) badges.push('<span class="badge sb" title="Piccolo buio">SB</span>');
      if (showHand && s.id === h.bbId) badges.push('<span class="badge bb" title="Grande buio">BB</span>');
      const status = [];
      if (hp && hp.folded) status.push('fold');
      if (hp && hp.allIn) status.push('<span class="badge allin">ALL-IN</span>');
      if (showHand && !hp) status.push('non in mano');
      if (s.sittingOut) status.push('salta le mani');
      if (s.leaving) status.push('sta uscendo');
      if (!s.stack && !(hp && hp.allIn)) status.push('senza fiches');
      if (!online[s.id]) status.push('offline');
      const cls = ['seat'];
      if (showHand && h.toAct === s.id) cls.push('turn');
      if (hp && hp.folded) cls.push('folded');
      if ((showHand && !hp) || (!showHand && (s.sittingOut || !s.stack))) cls.push('out');
      const bet = hp && hp.bet > 0 && t.phase === 'betting' ? `<span class="bet">${n(hp.bet)}</span>` : '';
      const tools = managing ? `
        <div class="manage-row">
          <button class="btn small" data-tool="up" ${i === 0 ? 'disabled' : ''} aria-label="Sposta su">↑</button>
          <button class="btn small" data-tool="down" ${i === t.seats.length - 1 ? 'disabled' : ''} aria-label="Sposta giù">↓</button>
          <button class="btn small" data-tool="dealer" title="Dealer dalla prossima mano">D</button>
          <input type="number" inputmode="numeric" min="0" value="${s.stack}" data-stack aria-label="Fiches di ${esc(s.name)}">
          <button class="btn small" data-tool="stack">Salva</button>
          <button class="btn small" data-tool="rebuy">+ ${n(t.settings.startingStack)}</button>
          <button class="btn small" data-tool="sitout">${s.sittingOut ? 'Rientra' : 'Salta'}</button>
          ${s.id !== S.you ? '<button class="btn small danger-text" data-tool="kick" aria-label="Rimuovi">✕</button>' : ''}
        </div>` : '';
      return `<li class="${cls.join(' ')}" data-id="${s.id}">
        <span class="dot ${online[s.id] ? 'on' : ''}"></span>
        <div class="info">
          <div class="name"><span class="nm">${esc(s.name)}${s.id === S.you ? ' <span class="muted small">(tu)</span>' : ''}${s.id === S.hostId ? ' <span title="Host">👑</span>' : ''}</span>${badges.join('')}</div>
          <div class="sub"><span class="stack">${n(s.stack)}</span>${status.map((x) => `<span>${x}</span>`).join('')}</div>
          ${tools}
        </div>
        ${bet}
      </li>`;
    }).join('');
  }

  function renderShowdown(t) {
    const h = t.hand;
    const show = t.phase === 'showdown' && h && h.pots;
    $('showdown').hidden = !show;
    if (!show) return;
    const can = isManager();
    $('pots').innerHTML = h.pots.map((pot, i) => {
      const key = `${h.no}-${i}`;
      const sel = picks[key] || (picks[key] = new Set());
      const title = h.pots.length === 1 ? 'Piatto' : i === 0 ? 'Piatto principale' : `Piatto laterale ${i}`;
      if (pot.winners) {
        return `<div class="pot-box done"><h3><span>${title}</span><span>${n(pot.amount)}</span></h3>
          <p class="muted small">Vinto da ${pot.winners.map((id) => `<strong>${esc(nameOf(id))}</strong> (${n(pot.payouts[id])})`).join(', ')}</p></div>`;
      }
      return `<div class="pot-box" data-pot="${i}"><h3><span>${title}</span><span>${n(pot.amount)}</span></h3>
        <p class="muted small">${can ? 'Tocca chi ha vinto (più di uno se è un pareggio):' : 'Contendono:'}</p>
        <div class="pick">${pot.eligible.map((id) => `<button type="button" data-pick="${id}" aria-pressed="${sel.has(id)}" ${can ? '' : 'disabled'}>${esc(nameOf(id))}</button>`).join('')}</div>
        ${can
          ? `<button class="btn primary block" data-award="${i}" ${sel.size ? '' : 'disabled'}>${sel.size > 1 ? `Dividi tra ${sel.size}` : 'Assegna il piatto'}</button>`
          : `<p class="muted small">L'host o il dealer assegnano il piatto.</p>`}
      </div>`;
    }).join('');
  }

  function renderResult(t) {
    const show = t.phase === 'over' && t.lastResult;
    $('result').hidden = !show;
    if (!show) return;
    $('result-list').innerHTML = t.lastResult.map((r) => `<li><span><strong>${esc(r.name)}</strong> vince ${n(r.amount)}</span>
      <span class="${r.net > 0 ? 'pos' : ''}">${r.net > 0 ? '+' : ''}${n(r.net)}</span></li>`).join('');
  }

  function renderManager(t) {
    const show = !inHand() && isManager();
    $('manager-panel').hidden = !show;
    if (!show) return;
    const ready = t.seats.filter((s) => s.stack > 0 && !s.sittingOut && !s.leaving);
    $('btn-start').textContent = t.handNo === 0 ? '▶ Inizia la partita' : '▶ Prossima mano';
    $('btn-start').disabled = ready.length < 2;
    $('start-hint').textContent = ready.length < 2
      ? 'Servono almeno 2 giocatori con fiches.'
      : `${ready.length} giocatori in mano · bui ${n(t.settings.smallBlind)}/${n(t.settings.bigBlind)}`;
  }

  function renderSettings(t) {
    $('settings').hidden = !isHost();
    if (!isHost()) return;
    const set = (id, v) => { if (document.activeElement !== $(id)) $(id).value = v; };
    set('set-stack', t.settings.startingStack);
    set('set-sb', t.settings.smallBlind);
    set('set-bb', t.settings.bigBlind);
  }

  function renderMe(t) {
    const me = t.seats.find((s) => s.id === S.you);
    $('me-panel').hidden = !me;
    if (!me) return;
    $('toggle-sitout').checked = !!me.sittingOut;
    $('btn-rebuy').hidden = !(me.stack === 0 && !inHand());
    $('btn-rebuy').textContent = `Ricarica ${n(t.settings.startingStack)} fiches`;
  }

  function renderLog(t) {
    $('log').innerHTML = t.log.slice().reverse()
      .map((l) => `<li class="${l.text.startsWith('—') ? 'sep' : ''}">${esc(l.text)}</li>`).join('');
  }

  // ---------- barra azioni ----------
  function renderActions(t) {
    const av = t.available;
    const h = t.hand;
    const bar = $('action-bar'), wait = $('wait-bar');
    if (!av || t.phase !== 'betting') {
      bar.hidden = true; wait.hidden = true; raiseOpen = false;
      return;
    }
    const actor = av.playerId;
    if (actingFor && actingFor !== actor) actingFor = null;
    const mine = actor === S.you || actingFor === actor;

    const turnKey = `${h.no}-${h.street}-${actor}-${h.currentBet}`;
    if (actor === S.you && turnKey !== lastTurnKey && navigator.vibrate) navigator.vibrate([80, 60, 80]);
    lastTurnKey = turnKey;

    if (!mine) {
      bar.hidden = true; wait.hidden = false;
      $('wait-text').innerHTML = `Tocca a <strong>${esc(nameOf(actor))}</strong>`;
      $('btn-act-for').hidden = !isManager();
      $('btn-act-for').textContent = `Agisci per ${nameOf(actor)}`;
      return;
    }
    wait.hidden = true; bar.hidden = false;
    if (raiseKey !== turnKey) { raiseOpen = false; raiseKey = turnKey; }

    const stack = t.seats.find((s) => s.id === actor).stack;
    $('action-who').innerHTML = actor === S.you
      ? `È il tuo turno · hai <strong>${n(stack)}</strong>`
      : `Stai agendo per <strong>${esc(nameOf(actor))}</strong> · ha ${n(stack)} <button class="linkish small" id="btn-stop-for" type="button">Annulla</button>`;

    $('btn-call').textContent = av.canCheck ? 'Check' : av.callIsAllIn ? `All-in ${n(av.toCall)}` : `Chiama ${n(av.toCall)}`;

    const raiseBtn = $('btn-raise');
    const onlyAllIn = av.canRaise && av.minTo >= av.maxTo;
    raiseBtn.hidden = !av.canRaise;
    $('raise-box').hidden = !(raiseOpen && av.canRaise && !onlyAllIn);
    $('btn-fold').hidden = false;
    $('btn-fold').style.visibility = '';

    if (onlyAllIn) {
      raiseBtn.textContent = `All-in ${n(av.maxTo)}`;
    } else if (!raiseOpen) {
      raiseBtn.textContent = av.isBet ? 'Punta…' : 'Rilancia…';
    } else {
      const range = $('raise-range'), input = $('raise-input');
      range.min = av.minTo; range.max = av.maxTo;
      input.min = av.minTo; input.max = av.maxTo;
      if (!input.value || Number(input.value) < av.minTo || Number(input.value) > av.maxTo) {
        input.value = av.minTo; range.value = av.minTo;
      }
      const potAfterCall = av.pot + av.toCall;
      const clamp = (x) => Math.max(av.minTo, Math.min(av.maxTo, Math.round(x)));
      const presets = [
        ['Min', av.minTo],
        ['½ piatto', clamp(h.currentBet + potAfterCall / 2)],
        ['Piatto', clamp(h.currentBet + potAfterCall)],
        ['All-in', av.maxTo],
      ];
      $('presets').innerHTML = presets.map(([l, v]) => `<button type="button" class="btn small" data-preset="${v}">${l}<br><strong>${n(v)}</strong></button>`).join('');
      updateRaiseLabel();
    }
  }

  function updateRaiseLabel() {
    const av = S.table.available;
    const v = Number($('raise-input').value);
    const allIn = v >= av.maxTo;
    $('btn-raise').textContent = allIn ? `All-in ${n(av.maxTo)}` : `${av.isBet ? 'Punta' : 'Rilancia a'} ${n(v)}`;
  }

  function actAs(type, amount) {
    const av = S.table.available;
    const extra = { type };
    if (amount !== undefined) extra.amount = amount;
    if (av.playerId !== S.you) extra.as = av.playerId;
    raiseOpen = false;
    $('raise-input').value = '';
    return run('act', extra);
  }

  $('btn-fold').addEventListener('click', () => {
    const av = S.table.available;
    if (av.canCheck && !confirm('Puoi fare check gratis. Vuoi davvero passare?')) return;
    actAs('fold');
  });
  $('btn-call').addEventListener('click', () => {
    const av = S.table.available;
    actAs(av.canCheck ? 'check' : 'call');
  });
  $('btn-raise').addEventListener('click', () => {
    const av = S.table.available;
    if (av.minTo >= av.maxTo) {
      if (confirm(`Vai all-in con ${n(av.maxTo)}?`)) actAs('allin');
      return;
    }
    if (!raiseOpen) { raiseOpen = true; render(S); return; }
    const v = Math.floor(Number($('raise-input').value));
    if (v >= av.maxTo) {
      if (confirm(`Vai all-in con ${n(av.maxTo)}?`)) actAs('allin');
      return;
    }
    actAs(av.isBet ? 'bet' : 'raise', v);
  });
  $('raise-range').addEventListener('input', (e) => { $('raise-input').value = e.target.value; updateRaiseLabel(); });
  $('raise-input').addEventListener('input', (e) => {
    $('raise-range').value = e.target.value;
    updateRaiseLabel();
  });
  $('presets').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (!b) return;
    $('raise-input').value = b.dataset.preset;
    $('raise-range').value = b.dataset.preset;
    updateRaiseLabel();
  });
  $('action-who').addEventListener('click', (e) => {
    if (e.target.id === 'btn-stop-for') { actingFor = null; render(S); }
  });
  $('btn-act-for').addEventListener('click', () => {
    actingFor = S.table.available && S.table.available.playerId;
    render(S);
  });

  // ---------- showdown ----------
  $('pots').addEventListener('click', (e) => {
    const box = e.target.closest('[data-pot]');
    if (!box) return;
    const i = Number(box.dataset.pot);
    const key = `${S.table.hand.no}-${i}`;
    const pick = e.target.closest('[data-pick]');
    if (pick) {
      const set = picks[key] || (picks[key] = new Set());
      const id = pick.dataset.pick;
      if (set.has(id)) set.delete(id); else set.add(id);
      return render(S);
    }
    if (e.target.closest('[data-award]')) {
      const winners = [...(picks[key] || [])];
      if (!winners.length) return;
      run('award', { pot: i, winners });
    }
  });

  // ---------- gestione tavolo ----------
  $('btn-start').addEventListener('click', () => run('start'));
  $('btn-manage').addEventListener('click', () => { managing = !managing; render(S); });
  $('seats').addEventListener('click', async (e) => {
    const tool = e.target.closest('[data-tool]');
    if (!tool) return;
    const li = tool.closest('[data-id]');
    const id = li.dataset.id;
    const name = nameOf(id);
    switch (tool.dataset.tool) {
      case 'up': return run('seat', { targetId: id, dir: -1 });
      case 'down': return run('seat', { targetId: id, dir: 1 });
      case 'dealer': return run('dealer', { targetId: id }).then((r) => r && toast(`${name} sarà il dealer della prossima mano`));
      case 'stack': return run('stack', { targetId: id, value: li.querySelector('[data-stack]').value }).then((r) => r && toast('Fiches aggiornate'));
      case 'rebuy': return run('rebuy', { targetId: id });
      case 'sitout': return run('sitout', { targetId: id, value: !S.table.seats.find((s) => s.id === id).sittingOut });
      case 'kick':
        if (confirm(`Rimuovere ${name} dal tavolo?`)) run('kick', { targetId: id });
        return;
      default:
    }
  });
  $('form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await run('settings', {
      startingStack: $('set-stack').value, smallBlind: $('set-sb').value, bigBlind: $('set-bb').value,
    });
    if (r) toast('Impostazioni salvate');
  });
  $('toggle-sitout').addEventListener('change', (e) => run('sitout', { value: e.target.checked }));
  $('btn-rebuy').addEventListener('click', () => run('rebuy'));

  // ---------- home ----------
  $('btn-create').addEventListener('click', async () => {
    const name = Player.require();
    if (!name) return;
    try { enterRoom(await api('/api/poker/rooms', { name })); }
    catch (err) { $('home-error').textContent = err.message; }
  });
  $('form-join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('input-code').value.trim().toUpperCase();
    if (code.length !== 5) { $('home-error').textContent = 'Il codice è di 5 caratteri.'; return; }
    const name = Player.require();
    if (!name) return;
    try { enterRoom(await api(`/api/poker/rooms/${code}/join`, { name })); }
    catch (err) { $('home-error').textContent = err.message; }
  });
  $('btn-share').addEventListener('click', async () => {
    const url = `${location.origin}/poker/r/${session.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Poker', text: `Siediti al tavolo ${session.code}`, url }); return; }
      catch (err) { if (err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copiato!'); }
    catch { prompt('Copia questo link:', url); }
  });
  $('btn-leave').addEventListener('click', () => {
    const msg = inHand() ? 'Sei in una mano: uscendo lasci le carte (fold). Uscire dal tavolo?' : 'Uscire dal tavolo?';
    if (!confirm(msg)) return;
    const s = session;
    closeStream();
    api(`/api/poker/rooms/${s.code}/leave`, { playerId: s.playerId, token: s.token }).catch(() => {});
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
      try { return enterRoom(await api(`/api/poker/rooms/${code}/join`, saved)); }
      catch { store.del(KEY(code)); }
    }
    showHome(code);
  }
  window.addEventListener('popstate', route);

  if (!Player.require()) return;
  route();
})();
