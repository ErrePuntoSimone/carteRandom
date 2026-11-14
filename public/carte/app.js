'use strict';
(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
  };

  let session = null;   // { code, playerId, token }
  let state = null;     // stato ricevuto dal server
  let es = null;        // EventSource
  let lastRound = 0;
  let decks = [];
  let customTimer = null;
  let unloading = false;
  window.addEventListener('pagehide', () => { unloading = true; });
  window.addEventListener('pageshow', () => { unloading = false; });

  // ---------- API ----------
  async function api(path, body) {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Errore di rete');
    return data;
  }
  const authBody = (extra) => ({ playerId: session.playerId, token: session.token, ...extra });

  // ---------- Navigazione ----------
  function codeFromUrl() {
    const m = location.pathname.match(/^\/carte\/r\/([A-Za-z0-9]{5})\/?$/);
    return m ? m[1].toUpperCase() : null;
  }

  function showHome(prefillCode, error) {
    closeStream();
    session = null; state = null; lastRound = 0;
    $('screen-room').hidden = true;
    $('screen-home').hidden = false;
    if (prefillCode) $('input-code').value = prefillCode;
    // con un invito si mostra in grande "Entra"; creare un nuovo tavolo diventa l'alternativa
    $('invite').hidden = !prefillCode;
    $('home-main').hidden = !!prefillCode;
    if (prefillCode) $('invite-code').textContent = prefillCode;
    $('home-error').textContent = error || '';
    $('who-name').textContent = Player.getName();
    $('link-change').href = Player.loginUrl(true);
  }

  function enterRoom(s) {
    session = s;
    store.set('session:' + s.code, s);
    if (codeFromUrl() !== s.code) history.pushState(null, '', '/carte/r/' + s.code);
    $('screen-home').hidden = true;
    $('screen-room').hidden = false;
    $('room-code').textContent = s.code;
    $('my-card').className = 'playing-card empty';
    openStream();
  }

  // ---------- Stream in tempo reale ----------
  function openStream() {
    closeStream();
    const q = new URLSearchParams({ playerId: session.playerId, token: session.token });
    es = new EventSource(`/api/carte/rooms/${session.code}/events?${q}`);
    es.addEventListener('state', (e) => {
      $('conn-banner').hidden = true;
      render(JSON.parse(e.data));
    });
    es.addEventListener('kicked', (e) => {
      const { reason } = JSON.parse(e.data);
      const code = session.code;
      store.del('session:' + code);
      history.pushState(null, '', '/carte/');
      showHome('', reason);
    });
    es.onerror = () => {
      if (unloading) return;
      $('conn-banner').hidden = false;
      // il browser riprova da solo; se ha chiuso lo stream (risposta non valida)
      // verifichiamo se la stanza esiste ancora
      if (es && es.readyState === EventSource.CLOSED) checkSession();
    };
  }
  async function checkSession() {
    const s = session;
    if (!s) return;
    try {
      await api(`/api/carte/rooms/${s.code}/join`, s);
      if (session === s) setTimeout(() => session === s && openStream(), 1500);
    } catch (err) {
      if (session !== s) return;
      if (/non trovata|non riconosciuto|nome/i.test(err.message)) {
        closeStream();
        store.del('session:' + s.code);
        history.pushState(null, '', '/carte/');
        showHome('', 'La stanza non esiste più.');
      } else {
        setTimeout(() => session === s && checkSession(), 3000);
      }
    }
  }
  function closeStream() {
    if (es) { es.close(); es = null; }
  }

  // ---------- Render ----------
  function cardFaceHtml(card) {
    if (!card) return '';
    if (card.color === 'custom') {
      return `<div class="face custom"><span class="txt">${esc(card.label)}</span></div>`;
    }
    const big = card.suit === 'JOLLY' ? '🃏' : card.suit;
    const s = card.suit === 'JOLLY' ? '' : card.suit;
    return `<div class="face ${card.color}">
      <div class="corner tl"><span class="r">${esc(card.rank)}</span><span class="s">${s}</span></div>
      <div class="big">${big}</div>
      <div class="label">${esc(card.label)}</div>
      <div class="corner br"><span class="r">${esc(card.rank)}</span><span class="s">${s}</span></div>
    </div>`;
  }
  function miniLabel(card) {
    if (card.color === 'custom') return card.label;
    if (card.suit === 'JOLLY') return '🃏';
    return card.rank + card.suit;
  }
  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render(s) {
    state = s;
    const me = s.players.find((p) => p.id === s.you);
    const isHost = s.hostId === s.you;

    // carta personale
    const cardEl = $('my-card');
    if (me && me.card) {
      $('my-card-front').innerHTML = cardFaceHtml(me.card);
      cardEl.classList.remove('empty');
      if (s.round !== lastRound) {
        cardEl.classList.remove('flipped', 'deal-anim');
        void cardEl.offsetWidth; // riavvia l'animazione
        cardEl.classList.add('deal-anim');
        if (lastRound !== 0 && navigator.vibrate) navigator.vibrate(60);
      }
      if (s.revealed) cardEl.classList.add('flipped');
      $('card-hint').textContent = cardEl.classList.contains('flipped')
        ? 'Tocca la carta per nasconderla'
        : 'Tocca la carta per scoprirla';
      $('round-label').textContent = `Mano n. ${s.round}`;
    } else {
      cardEl.className = 'playing-card empty';
      $('my-card-front').innerHTML = '';
      $('card-hint').textContent = isHost
        ? 'Premi "Distribuisci le carte" quando ci sono tutti.'
        : 'In attesa che venga distribuita una carta…';
      $('round-label').textContent = '';
    }
    lastRound = s.round;

    // pannello host
    $('host-panel').hidden = !isHost;
    if (isHost) {
      const sel = $('select-deck');
      if (sel.options.length !== decks.length) {
        sel.innerHTML = decks.map((d) => `<option value="${d.id}">${esc(d.name)}</option>`).join('');
      }
      if (document.activeElement !== sel) sel.value = s.deckId;
      $('custom-wrap').hidden = s.deckId !== 'custom';
      const ta = $('custom-cards');
      if (document.activeElement !== ta && customTimer === null) ta.value = s.customCards.join('\n');
      updateCustomCount();
      $('toggle-reveal').checked = s.revealed;
      $('toggle-reveal').disabled = s.round === 0;
      $('btn-deal').textContent = s.round === 0 ? '🎲 Distribuisci le carte' : '🔄 Ridistribuisci';
    }

    // lista giocatori
    $('player-count').textContent = s.players.length;
    $('player-list').innerHTML = s.players.map((p) => {
      let mini = '';
      if (p.card) mini = `<span class="mini ${p.card.color}">${esc(miniLabel(p.card))}</span>`;
      else if (p.hasCard) mini = '<span class="mini hidden">?</span>';
      const tags = [
        p.id === s.hostId ? '<span class="tag">👑 host</span>' : '',
        p.id === s.you ? '<span class="tag">(tu)</span>' : '',
      ].join('');
      const kick = isHost && p.id !== s.you
        ? `<button class="btn danger-text" data-kick="${p.id}" title="Rimuovi" aria-label="Rimuovi ${esc(p.name)}">✕</button>` : '';
      return `<li><span class="dot ${p.online ? 'on' : ''}" title="${p.online ? 'Online' : 'Offline'}"></span>
        <span class="name">${esc(p.name)}${tags}</span>${mini}${kick}</li>`;
    }).join('');
  }

  function parseCustom() {
    return $('custom-cards').value.split('\n').map((l) => l.trim()).filter(Boolean);
  }
  function updateCustomCount() {
    if (!state) return;
    const n = parseCustom().length;
    const p = state.players.length;
    $('custom-count').textContent = `${n} carte · ${p} giocatori` + (n < p ? ' — servono altre carte' : '');
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- Eventi UI ----------
  function getName() {
    return Player.require();
  }

  $('btn-create').addEventListener('click', async () => {
    const name = getName();
    if (!name) return;
    try { enterRoom(await api('/api/carte/rooms', { name })); }
    catch (err) { $('home-error').textContent = err.message; }
  });

  $('form-join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = $('input-code').value.trim().toUpperCase();
    if (code.length !== 5) { $('home-error').textContent = 'Il codice è di 5 caratteri.'; return; }
    const name = getName();
    if (!name) return;
    try { enterRoom(await api(`/api/carte/rooms/${code}/join`, { name })); }
    catch (err) { $('home-error').textContent = err.message; }
  });

  $('my-card').addEventListener('click', () => {
    const el = $('my-card');
    if (el.classList.contains('empty')) return;
    if (state && state.revealed) return; // tutte scoperte
    el.classList.toggle('flipped');
    $('card-hint').textContent = el.classList.contains('flipped') ? 'Tocca la carta per nasconderla' : 'Tocca la carta per scoprirla';
  });
  $('my-card').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('my-card').click(); }
  });

  $('btn-deal').addEventListener('click', async () => {
    $('host-error').textContent = '';
    const btn = $('btn-deal');
    btn.disabled = true;
    try {
      if (state.deckId === 'custom') await flushCustom();
      await api(`/api/carte/rooms/${session.code}/deal`, authBody());
    } catch (err) { $('host-error').textContent = err.message; }
    finally { btn.disabled = false; }
  });

  $('select-deck').addEventListener('change', async (e) => {
    $('host-error').textContent = '';
    try { await api(`/api/carte/rooms/${session.code}/settings`, authBody({ deckId: e.target.value })); }
    catch (err) { $('host-error').textContent = err.message; }
  });

  async function flushCustom() {
    clearTimeout(customTimer);
    customTimer = null;
    await api(`/api/carte/rooms/${session.code}/settings`, authBody({ customCards: parseCustom() }));
  }
  $('custom-cards').addEventListener('input', () => {
    updateCustomCount();
    clearTimeout(customTimer);
    customTimer = setTimeout(() => flushCustom().catch((err) => { $('host-error').textContent = err.message; }), 600);
  });

  $('toggle-reveal').addEventListener('change', async (e) => {
    try { await api(`/api/carte/rooms/${session.code}/reveal`, authBody({ revealed: e.target.checked })); }
    catch (err) { $('host-error').textContent = err.message; }
  });

  $('player-list').addEventListener('click', async (e) => {
    const id = e.target.closest('[data-kick]')?.dataset.kick;
    if (!id) return;
    const p = state.players.find((x) => x.id === id);
    if (!confirm(`Rimuovere ${p ? p.name : 'questo giocatore'} dalla stanza?`)) return;
    try { await api(`/api/carte/rooms/${session.code}/kick`, authBody({ targetId: id })); }
    catch (err) { toast(err.message); }
  });

  $('btn-share').addEventListener('click', async () => {
    const url = `${location.origin}/carte/r/${session.code}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Carte Random', text: `Entra nella stanza ${session.code}`, url }); return; }
      catch (err) { if (err.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(url); toast('Link copiato!'); }
    catch { prompt('Copia questo link:', url); }
  });

  $('btn-leave').addEventListener('click', async () => {
    if (!confirm('Vuoi uscire dalla stanza?')) return;
    const s = session;
    closeStream();
    store.del('session:' + s.code);
    api(`/api/carte/rooms/${s.code}/leave`, { playerId: s.playerId, token: s.token }).catch(() => {});
    history.pushState(null, '', '/carte/');
    showHome();
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
    history.replaceState(null, '', '/carte/');
  });

  window.addEventListener('popstate', route);

  // ---------- Avvio ----------
  async function route() {
    const code = codeFromUrl();
    if (!code) { if (session) closeStream(); return showHome(); }
    if (session && session.code === code) return;
    const saved = store.get('session:' + code);
    if (saved) {
      try { return enterRoom(await api(`/api/carte/rooms/${code}/join`, saved)); }
      catch { store.del('session:' + code); }
    }
    showHome(code);
  }

  if (!Player.require()) return; // senza nome si passa dalla home
    fetch('/api/carte/decks').then((r) => r.json()).then((d) => { decks = d; if (state) render(state); }).catch(() => {});
  route();
})();
