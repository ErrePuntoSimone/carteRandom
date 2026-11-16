'use strict';
// "Login" condiviso tra i minigiochi: il nome del giocatore, salvato nel browser.
window.Player = (() => {
  const KEY = 'name';
  const clean = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 24);

  function getName() {
    try { return clean(JSON.parse(localStorage.getItem(KEY))); } catch { return ''; }
  }
  function setName(name) {
    try { localStorage.setItem(KEY, JSON.stringify(clean(name))); } catch { /* ignora */ }
  }
  function logout() {
    try { localStorage.removeItem(KEY); } catch { /* ignora */ }
  }
  // Link alla home per fare login, che poi riporta alla pagina attuale.
  function loginUrl(change) {
    const next = location.pathname + location.search;
    return `/?${change ? 'cambia=1&' : ''}next=${encodeURIComponent(next)}`;
  }
  // Se non c'è un nome, manda alla home per inserirlo e restituisce null.
  function require() {
    const name = getName();
    if (!name) { location.replace(loginUrl(false)); return null; }
    return name;
  }
  return { getName, setName, logout, loginUrl, require, clean };
})();

// Stanza pubblica: interruttore per chi ha creato la stanza (la rende visibile nel menu).
window.PublicRoom = (() => {
  let row = null, input = null, text = null, busy = false;
  function build(game, getSession) {
    const head = document.querySelector('.room-head:not([hidden])') || document.querySelector('.room-head');
    if (!head) return false;
    row = document.createElement('label');
    row.className = 'toggle public-row';
    row.innerHTML = '<input type="checkbox"><span></span>';
    input = row.querySelector('input');
    text = row.querySelector('span');
    head.insertAdjacentElement('afterend', row);
    input.addEventListener('change', async () => {
      const s = getSession();
      if (!s || busy) return;
      busy = true;
      try {
        const res = await fetch(`/api/${game}/rooms/${s.code}/visibility`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: s.playerId, token: s.token, public: input.checked }),
        });
        if (!res.ok) input.checked = !input.checked;
      } catch { input.checked = !input.checked; }
      busy = false;
    });
    return true;
  }
  // da chiamare a ogni aggiornamento dello stato della stanza
  function update(game, state, session) {
    if (!row && !build(game, () => session)) return;
    const host = state.hostId === state.you;
    row.hidden = !host && !state.public;
    input.hidden = !host;
    input.disabled = !host;
    input.checked = !!state.public;
    text.textContent = host
      ? '🌐 Stanza pubblica: visibile nel menu a tutti'
      : '🌐 Stanza pubblica';
  }
  return { update };
})();
