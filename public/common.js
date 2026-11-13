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
