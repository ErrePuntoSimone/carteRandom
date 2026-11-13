'use strict';
// Conta fiches: funziona tutto nel browser, i dati restano salvati sul dispositivo.
(() => {
  const $ = (id) => document.getElementById(id);
  const KEY = 'fiches:v1';
  const uid = () => Math.random().toString(36).slice(2, 10);

  const DEFAULT_CHIPS = [
    { name: 'Bianca', color: '#f5f5f5', value: 5 },
    { name: 'Rossa', color: '#d32f2f', value: 10 },
    { name: 'Verde', color: '#2e7d32', value: 25 },
    { name: 'Nera', color: '#212121', value: 100 },
    { name: 'Blu', color: '#1565c0', value: 500 },
  ];
  const NEW_CHIP_COLORS = ['#7b1fa2', '#f9a825', '#ef6c00', '#00838f', '#c2185b', '#5d4037'];

  function defaults() {
    return {
      chips: DEFAULT_CHIPS.map((c) => ({ id: uid(), ...c })),
      buyinMoney: 10,
      buyinChips: 1000,
      players: [],
    };
  }

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && Array.isArray(s.chips) && Array.isArray(s.players)) return s;
    } catch { /* ignora */ }
    return defaults();
  }
  let state = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignora */ }
  }

  // ---------- calcoli ----------
  const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0);
  const rate = () => (num(state.buyinChips) ? num(state.buyinMoney) / num(state.buyinChips) : 0); // € per punto
  const chipsOf = (p) => state.chips.reduce((t, c) => t + num(p.counts[c.id]) * num(c.value), 0);
  const paidOf = (p) => num(p.buyins) * num(state.buyinMoney);
  const moneyOf = (p) => chipsOf(p) * rate();
  const netOf = (p) => moneyOf(p) - paidOf(p);
  const cents = (x) => Math.round(x * 100);

  const fmtN = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 });
  const fmtE = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const eur = (x) => fmtE.format(x);
  const signed = (x) => (cents(x) > 0 ? '+' : '') + eur(x);
  const cls = (x) => (cents(x) > 0 ? 'pos' : cents(x) < 0 ? 'neg' : '');

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Pareggia i conti col minimo di passaggi: chi è in perdita paga chi è in vincita.
  function settle(players) {
    const debt = players.map((p) => ({ name: p.name, v: cents(netOf(p)) }));
    const losers = debt.filter((d) => d.v < 0).map((d) => ({ ...d, v: -d.v })).sort((a, b) => b.v - a.v);
    const winners = debt.filter((d) => d.v > 0).sort((a, b) => b.v - a.v);
    const out = [];
    let i = 0, j = 0;
    while (i < losers.length && j < winners.length) {
      const amt = Math.min(losers[i].v, winners[j].v);
      if (amt > 0) out.push({ from: losers[i].name, to: winners[j].name, amt: amt / 100 });
      losers[i].v -= amt; winners[j].v -= amt;
      if (losers[i].v === 0) i++;
      if (winners[j].v === 0) j++;
    }
    return out;
  }

  // ---------- render ----------
  function renderSettings() {
    $('chip-list').innerHTML = state.chips.map((c) => `
      <li data-chip="${c.id}">
        <span class="color-wrap"><span class="chip" style="--c:${esc(c.color)}"></span>
          <input type="color" value="${esc(c.color)}" data-field="color" aria-label="Colore"></span>
        <input class="name" value="${esc(c.name)}" maxlength="16" data-field="name" aria-label="Nome fiche">
        <input class="value" type="number" inputmode="decimal" min="0" step="any" value="${esc(c.value)}" data-field="value" aria-label="Valore">
        <button class="btn danger-text" data-remove-chip="${c.id}" aria-label="Rimuovi fiche ${esc(c.name)}">✕</button>
      </li>`).join('');
    $('buyin-money').value = state.buyinMoney;
    $('buyin-chips').value = state.buyinChips;
    renderRate();
  }

  function renderRate() {
    const r = rate();
    $('rate-label').textContent = r
      ? `1 punto = ${eur(r)} · 100 punti = ${eur(r * 100)}`
      : 'Imposta buy-in e fiches per calcolare i soldi.';
    const lowest = state.chips.length ? Math.min(...state.chips.map((c) => num(c.value) || Infinity)) : 0;
    $('stack-label').textContent = Number.isFinite(lowest) && lowest && num(state.buyinChips) % lowest
      ? `Attenzione: ${fmtN.format(state.buyinChips)} non si può comporre con fiche da ${fmtN.format(lowest)}.`
      : '';
  }

  function renderPlayers() {
    $('player-count').textContent = state.players.length;
    if (!state.players.length) {
      $('players').innerHTML = '<p class="muted center">Aggiungi i giocatori per iniziare a contare.</p>';
      renderSummary();
      return;
    }
    $('players').innerHTML = state.players.map((p) => `
      <article class="player" data-player="${p.id}">
        <div class="player-head">
          <span class="pname">${esc(p.name)}</span>
          <span class="total" data-out="total"></span>
          <button class="btn danger-text" data-remove-player="${p.id}" aria-label="Rimuovi ${esc(p.name)}">✕</button>
        </div>
        <div class="counts">
          ${state.chips.map((c) => `
            <div class="count-row">
              <span class="chip" style="--c:${esc(c.color)}"></span>
              <span class="cname"><span class="n">${esc(c.name)}</span>
                <span class="sub" data-out="sub" data-chip="${c.id}" data-value="${num(c.value)}"></span></span>
              <div class="stepper">
                <button type="button" data-step="-1" data-chip="${c.id}" aria-label="Meno ${esc(c.name)}">−</button>
                <input type="number" inputmode="numeric" min="0" step="1" data-count="${c.id}"
                  value="${num(p.counts[c.id]) || ''}" placeholder="0" aria-label="Fiches ${esc(c.name)} di ${esc(p.name)}">
                <button type="button" data-step="1" data-chip="${c.id}" aria-label="Più ${esc(c.name)}">+</button>
              </div>
            </div>`).join('')}
        </div>
        <div class="player-foot">
          <label>Buy-in <input class="buyins" type="number" inputmode="numeric" min="0" step="1" data-buyins value="${num(p.buyins)}"></label>
          <span class="money" data-out="money"></span>
        </div>
      </article>`).join('');
    updateTotals();
  }

  function updateTotals() {
    for (const el of $('players').querySelectorAll('[data-player]')) {
      const p = state.players.find((x) => x.id === el.dataset.player);
      if (!p) continue;
      el.querySelector('[data-out=total]').textContent = fmtN.format(chipsOf(p));
      for (const s of el.querySelectorAll('[data-out=sub]')) {
        const c = state.chips.find((x) => x.id === s.dataset.chip);
        const n = num(p.counts[c.id]);
        s.textContent = n ? `${fmtN.format(n)} × ${fmtN.format(num(c.value))} = ${fmtN.format(n * num(c.value))}` : `da ${fmtN.format(num(c.value))}`;
      }
      const net = netOf(p);
      el.querySelector('[data-out=money]').innerHTML = rate()
        ? `${eur(moneyOf(p))} · <span class="${cls(net)}">${signed(net)}</span>`
        : '';
    }
    renderSummary();
  }

  function renderSummary() {
    const ps = state.players;
    if (!ps.length) {
      $('summary-body').innerHTML = '<p class="muted">Nessun giocatore.</p>';
      $('settle-body').innerHTML = '<p class="muted">Nessun giocatore.</p>';
      return;
    }
    const onTable = ps.reduce((t, p) => t + chipsOf(p), 0);
    const expected = ps.reduce((t, p) => t + num(p.buyins) * num(state.buyinChips), 0);
    const paid = ps.reduce((t, p) => t + paidOf(p), 0);
    const diff = onTable - expected;
    const counted = ps.some((p) => chipsOf(p) > 0);

    let check = '';
    if (counted && expected) {
      check = diff === 0
        ? '<p class="check ok">✓ I conti tornano: le fiches contate corrispondono ai buy-in.</p>'
        : `<p class="check warn">⚠ ${diff > 0 ? 'Ci sono' : 'Mancano'} ${fmtN.format(Math.abs(diff))} punti rispetto ai buy-in
           (${eur(Math.abs(diff) * rate())}). Ricontrolla le fiches.</p>`;
    }
    $('summary-body').innerHTML = `
      <div class="stats">
        <div class="stat"><div class="k">Punti sul tavolo</div><div class="v">${fmtN.format(onTable)}</div></div>
        <div class="stat"><div class="k">Punti attesi</div><div class="v">${fmtN.format(expected)}</div></div>
        <div class="stat"><div class="k">Soldi versati</div><div class="v">${eur(paid)}</div></div>
        <div class="stat"><div class="k">Valore fiches</div><div class="v">${eur(onTable * rate())}</div></div>
      </div>${check}`;

    if (!counted || !rate()) {
      $('settle-body').innerHTML = '<p class="muted">Conta le fiches per vedere i pagamenti.</p>';
      return;
    }
    const tx = settle(ps);
    $('settle-body').innerHTML = (tx.length
      ? `<ul class="settle">${tx.map((t) => `<li><span><strong>${esc(t.from)}</strong> → <strong>${esc(t.to)}</strong></span><span class="amt">${eur(t.amt)}</span></li>`).join('')}</ul>`
      : '<p class="muted">Nessuno deve niente a nessuno.</p>')
      + (counted && diff !== 0 ? '<p class="muted small">I pagamenti non sono in pari finché i conti non tornano.</p>' : '');
  }

  function renderAll() { renderSettings(); renderPlayers(); }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------- eventi: impostazioni ----------
  $('chip-list').addEventListener('input', (e) => {
    const li = e.target.closest('[data-chip]');
    const field = e.target.dataset.field;
    if (!li || !field) return;
    const c = state.chips.find((x) => x.id === li.dataset.chip);
    c[field] = e.target.value;
    if (field === 'color') li.querySelector('.chip').style.setProperty('--c', e.target.value);
    save(); renderRate(); renderPlayers();
  });
  $('chip-list').addEventListener('click', (e) => {
    const id = e.target.closest('[data-remove-chip]')?.dataset.removeChip;
    if (!id) return;
    if (state.chips.length <= 1) return toast('Serve almeno una fiche.');
    state.chips = state.chips.filter((c) => c.id !== id);
    state.players.forEach((p) => { delete p.counts[id]; });
    save(); renderAll();
  });
  $('btn-add-chip').addEventListener('click', () => {
    const used = new Set(state.chips.map((c) => c.color));
    const color = NEW_CHIP_COLORS.find((c) => !used.has(c)) || '#9e9e9e';
    const max = Math.max(0, ...state.chips.map((c) => num(c.value)));
    state.chips.push({ id: uid(), name: 'Nuova', color, value: max ? max * 2 : 1 });
    save(); renderAll();
    $('chip-list').lastElementChild.querySelector('.name').select();
  });
  $('buyin-money').addEventListener('input', (e) => { state.buyinMoney = e.target.value; save(); renderRate(); updateTotals(); });
  $('buyin-chips').addEventListener('input', (e) => { state.buyinChips = e.target.value; save(); renderRate(); updateTotals(); });

  // ---------- eventi: giocatori ----------
  $('form-player').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('input-player').value.replace(/\s+/g, ' ').trim();
    if (!name) return;
    if (state.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) return toast('Questo nome c\'è già.');
    state.players.push({ id: uid(), name, counts: {}, buyins: 1 });
    $('input-player').value = '';
    save(); renderPlayers();
  });

  const playerOf = (el) => state.players.find((p) => p.id === el.closest('[data-player]')?.dataset.player);

  $('players').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove-player]');
    if (rm) {
      const p = playerOf(rm);
      if (p && confirm(`Rimuovere ${p.name}?`)) {
        state.players = state.players.filter((x) => x !== p);
        save(); renderPlayers();
      }
      return;
    }
    const step = e.target.closest('[data-step]');
    if (step) {
      const p = playerOf(step);
      const id = step.dataset.chip;
      p.counts[id] = Math.max(0, num(p.counts[id]) + Number(step.dataset.step));
      step.parentElement.querySelector('input').value = p.counts[id] || '';
      save(); updateTotals();
    }
  });

  $('players').addEventListener('input', (e) => {
    const p = playerOf(e.target);
    if (!p) return;
    if (e.target.dataset.count) p.counts[e.target.dataset.count] = Math.floor(num(e.target.value));
    else if ('buyins' in e.target.dataset) p.buyins = Math.floor(num(e.target.value));
    else return;
    save(); updateTotals();
  });

  // ---------- reset ----------
  $('btn-reset-counts').addEventListener('click', () => {
    if (!confirm('Azzerare le fiches contate di tutti i giocatori?')) return;
    state.players.forEach((p) => { p.counts = {}; p.buyins = 1; });
    save(); renderPlayers();
  });
  $('btn-reset-all').addEventListener('click', () => {
    if (!confirm('Cancellare giocatori e impostazioni?')) return;
    state = defaults();
    save(); renderAll();
  });

  // apre le impostazioni al primo utilizzo
  if (!state.players.length) $('settings').open = true;
  renderAll();
})();
