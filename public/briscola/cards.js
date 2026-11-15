'use strict';
// Carte napoletane disegnate in SVG: simboli illustrati (denari, coppe, spade, bastoni),
// simboli disposti come sul mazzo vero e figure per Fante, Cavallo e Re.
// Le carte vengono create una volta sola come <symbol>; l'interfaccia le richiama con <use>.
window.CardArt = (() => {
  const PAL = {
    denari: { c: '#b8860b', d: '#6b4a00', bg: '#fff3d2', tone: '#e9c66a' },
    coppe: { c: '#b3261e', d: '#6e120d', bg: '#fdebe8', tone: '#e8928b' },
    spade: { c: '#2a5ba8', d: '#12305f', bg: '#e8f0fc', tone: '#8fb3ea' },
    bastoni: { c: '#2f7a30', d: '#174a18', bg: '#e9f6e4', tone: '#8fd081' },
  };
  const SUITS = Object.keys(PAL);
  const GOLD = 'url(#ca-gold)';
  const GOLD_LINE = '#5e4100';
  const SKIN = '#f2caa3';

  const DEFS = `
    <linearGradient id="ca-gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ffeaa3"/><stop offset=".5" stop-color="#e2aa32"/><stop offset="1" stop-color="#97670a"/></linearGradient>
    <linearGradient id="ca-cup" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#8e1a14"/><stop offset=".45" stop-color="#d9433a"/><stop offset="1" stop-color="#7d1510"/></linearGradient>
    <linearGradient id="ca-steel" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#7c8794"/><stop offset=".45" stop-color="#eef2f6"/><stop offset="1" stop-color="#8b96a3"/></linearGradient>
    <linearGradient id="ca-wood" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#5a3a1a"/><stop offset=".45" stop-color="#b07a3e"/><stop offset="1" stop-color="#4d3015"/></linearGradient>
    <linearGradient id="ca-paper" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fffdf5"/><stop offset="1" stop-color="#f4ecd3"/></linearGradient>
    <radialGradient id="ca-back" cx=".5" cy=".5" r=".7">
      <stop offset="0" stop-color="#d33a30"/><stop offset="1" stop-color="#7d1510"/></radialGradient>`;

  // ---------- simboli (centrati in 0,0, circa 60x70) ----------
  const SYM = {
    denari() {
      let petals = '';
      for (let i = 0; i < 8; i++) {
        petals += `<ellipse cx="0" cy="-13" rx="4.6" ry="8.5" transform="rotate(${i * 45})" fill="#f6d06a" stroke="#7a5600" stroke-width=".9"/>`;
      }
      return `<circle r="29" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="2"/>
        <circle r="26.4" fill="none" stroke="#fff1b8" stroke-width="1" stroke-dasharray="1.6 2.6"/>
        <circle r="23.5" fill="none" stroke="#7a5600" stroke-width="1.3"/>
        ${petals}
        <circle r="6.5" fill="#fff0b0" stroke="#7a5600" stroke-width="1"/><circle r="2.6" fill="#b8860b"/>`;
    },
    coppe() {
      return `<path d="M-22,-27 C-22,3 -10,9 -4,11 L4,11 C10,9 22,3 22,-27 Z" fill="url(#ca-cup)" stroke="#4a0c08" stroke-width="2" stroke-linejoin="round"/>
        <path d="M-22,-19 C-33,-20 -32,-2 -17,-2" fill="none" stroke="#4a0c08" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M22,-19 C33,-20 32,-2 17,-2" fill="none" stroke="#4a0c08" stroke-width="3.2" stroke-linecap="round"/>
        <ellipse cy="-27" rx="22" ry="5.5" fill="#df5b52" stroke="#4a0c08" stroke-width="2"/>
        <ellipse cy="-27" rx="17" ry="3.2" fill="#5b0f0a"/>
        <path d="M-12,-17 C-12,-8 -7,0 -1,3" fill="none" stroke="#ffd0cb" stroke-width="2.2" opacity=".6" stroke-linecap="round"/>
        <path d="M-22,-8 L22,-8" stroke="${GOLD}" stroke-width="3" opacity=".9"/>
        <ellipse cy="13.5" rx="9" ry="4" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1.5"/>
        <path d="M-4,16 L-3,26 L3,26 L4,16 Z" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1.5"/>
        <path d="M-17,34 C-13,26 13,26 17,34 Z" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1.5" stroke-linejoin="round"/>`;
    },
    spade() {
      return `<path d="M0,-37 C10,-25 11,-4 5,13 L-4,13 C-3,-3 -6,-22 0,-37 Z" fill="url(#ca-steel)" stroke="#2b3340" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M0,-31 C3.5,-18 3.5,-2 1.5,11" fill="none" stroke="#fff" stroke-width="1.1" opacity=".75"/>
        <path d="M-17,14 Q0,7 17,14 L15.5,19.5 Q0,14 -15.5,19.5 Z" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1.4" stroke-linejoin="round"/>
        <rect x="-3.2" y="19" width="6.4" height="14" rx="2.2" fill="#7a4a24" stroke="#2f1a09" stroke-width="1.2"/>
        <path d="M-3.2,23 h6.4 M-3.2,27 h6.4" stroke="#2f1a09" stroke-width="1" opacity=".6"/>
        <circle cy="36.2" r="4.3" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1.2"/>`;
    },
    bastoni() {
      return `<path d="M-9,-31 C-9,-40 9,-40 9,-31 C11,-23 8,-14 10,-6 C11,2 8,10 8.5,18 C9,26 9.5,30 8.5,34 L-8.5,34 C-9.5,30 -9,26 -8.5,18 C-8,10 -11,2 -10,-6 C-8,-14 -11,-23 -9,-31 Z" fill="url(#ca-wood)" stroke="#2c1a08" stroke-width="1.9" stroke-linejoin="round"/>
        <ellipse cy="34" rx="8.6" ry="3" fill="#d9ad6c" stroke="#2c1a08" stroke-width="1.5"/>
        <ellipse cy="34" rx="4.6" ry="1.5" fill="none" stroke="#8a5a2b" stroke-width=".9"/>
        <path d="M-6,-33 C-7,-20 -6,-4 -4,12 C-3,20 -4,26 -4,31" fill="none" stroke="#ecd0a0" stroke-width="1.6" opacity=".6" stroke-linecap="round"/>
        <path d="M3,-34 C5,-20 3,-4 4,10 M-1,-30 C0,-14 -1,0 0,14" fill="none" stroke="#4a2e12" stroke-width="1" opacity=".5" stroke-linecap="round"/>
        <path d="M-10,-16 C-17,-17 -19,-12 -16,-9 C-13,-10 -11,-12 -10,-13 Z" fill="#7a4a24" stroke="#2c1a08" stroke-width="1.2"/>
        <path d="M10,-2 C17,-3 19,2 16,5 C13,4 11,2 10,1 Z" fill="#7a4a24" stroke="#2c1a08" stroke-width="1.2"/>
        <ellipse cx="2" cy="6" rx="3" ry="2.4" fill="#3a2410" stroke="#2c1a08" stroke-width=".8"/>
        <ellipse cx="-2" cy="22" rx="2.6" ry="2" fill="#3a2410" stroke="#2c1a08" stroke-width=".8"/>
        <path d="M-15,-14 C-24,-22 -20,-30 -13,-26 C-14,-21 -14,-18 -15,-14 Z" fill="#52b046" stroke="#14451a" stroke-width="1.1"/>
        <path d="M16,-1 C26,-8 24,-18 17,-14 C17,-9 17,-5 16,-1 Z" fill="#52b046" stroke="#14451a" stroke-width="1.1"/>
        <path d="M-2,-37 C-9,-45 -3,-52 4,-47 C3,-43 1,-40 -2,-37 Z" fill="#62c157" stroke="#14451a" stroke-width="1.1"/>`;
    },
  };
  const place = (suit, x, y, s = 1, rot = 0) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">${SYM[suit]()}</g>`;

  // ---------- disposizione dei simboli (carte da 1 a 7) ----------
  const LAYOUT = {
    1: [[100, 150, 2.15]],
    2: [[100, 92, 1.25], [100, 208, 1.25]],
    3: [[100, 70, 1.05], [100, 150, 1.05], [100, 230, 1.05]],
    4: [[64, 94, 1.12], [136, 94, 1.12], [64, 206, 1.12], [136, 206, 1.12]],
    5: [[64, 84, 1.0], [136, 84, 1.0], [100, 150, 1.0], [64, 216, 1.0], [136, 216, 1.0]],
    6: [[64, 72, .95], [136, 72, .95], [64, 150, .95], [136, 150, .95], [64, 228, .95], [136, 228, .95]],
    7: [[62, 72, .9], [138, 72, .9], [62, 150, .9], [138, 150, .9], [62, 228, .9], [138, 228, .9], [100, 111, .9]],
  };
  // spade e bastoni sono inclinati in modo alternato, come sulle carte vere
  function pips(suit, rank) {
    const tilt = suit === 'spade' || suit === 'bastoni';
    return LAYOUT[rank].map(([x, y, s], i) => {
      let rot = 0;
      if (tilt) rot = rank === 1 ? (suit === 'spade' ? 0 : 0) : (i % 2 ? 24 : -24);
      return place(suit, x, y, s, rot);
    }).join('');
  }

  // ---------- figure ----------
  const panel = (p) => `<rect x="24" y="48" width="152" height="204" rx="10" fill="${p.bg}" stroke="${p.c}" stroke-width="2"/>
    <rect x="31" y="55" width="138" height="190" rx="6" fill="none" stroke="${p.tone}" stroke-width="1" stroke-dasharray="3 3"/>`;
  const eyes = (cx, cy) => `<circle cx="${cx - 5.5}" cy="${cy}" r="1.7" fill="#2a1a0c"/><circle cx="${cx + 5.5}" cy="${cy}" r="1.7" fill="#2a1a0c"/>`;

  function fante(suit) {
    const p = PAL[suit];
    return `${panel(p)}
      <rect x="83" y="186" width="14" height="48" rx="4" fill="${p.d}"/><rect x="103" y="186" width="14" height="48" rx="4" fill="${p.c}"/>
      <path d="M78,234 h22 v11 h-27 z M100,234 h22 l5,11 h-27 z" fill="#3b2a1a"/>
      <path d="M72,198 L80,120 Q100,108 120,120 L128,198 Q100,208 72,198 Z" fill="${p.c}" stroke="${p.d}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M92,116 L100,132 L108,116" fill="#fff" stroke="${p.d}" stroke-width="1.2"/>
      <path d="M75,168 L125,168" stroke="${GOLD_LINE}" stroke-width="7"/><path d="M75,168 L125,168" stroke="${GOLD}" stroke-width="5"/>
      <rect x="94" y="162" width="12" height="12" rx="2" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1.2"/>
      <path d="M80,124 L56,168 L66,176 L90,140 Z" fill="${p.c}" stroke="${p.d}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M120,124 L146,154 L138,162 L112,140 Z" fill="${p.c}" stroke="${p.d}" stroke-width="1.8" stroke-linejoin="round"/>
      <circle cx="60" cy="176" r="6" fill="${SKIN}" stroke="#6b4a2a" stroke-width="1.2"/>
      <circle cx="144" cy="160" r="6" fill="${SKIN}" stroke="#6b4a2a" stroke-width="1.2"/>
      ${place(suit, 152, 122, .62, 14)}
      <circle cx="100" cy="98" r="16" fill="${SKIN}" stroke="#6b4a2a" stroke-width="1.5"/>
      ${eyes(100, 97)}<path d="M94,106 Q100,111 106,106" fill="none" stroke="#7a3b22" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M82,94 Q100,62 120,94 Q100,86 82,94 Z" fill="${p.d}" stroke="#000" stroke-width=".6"/>
      <ellipse cx="100" cy="92" rx="25" ry="6" fill="${p.d}"/>
      <path d="M112,74 C134,56 146,68 130,86" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M112,74 C134,56 146,68 130,86" fill="none" stroke="${p.tone}" stroke-width="2" stroke-linecap="round"/>`;
  }

  function cavallo(suit) {
    const p = PAL[suit];
    const horse = '#8d5a2b', horseD = '#5a3416';
    return `${panel(p)}
      <g transform="translate(4 14) scale(.9)">
        <path d="M54,176 C30,186 32,224 44,242 C48,226 52,208 60,196 Z" fill="#3a220e" stroke="#1c0f05" stroke-width="1.5"/>
        <rect x="64" y="196" width="10" height="46" rx="4" fill="${horseD}"/><rect x="80" y="196" width="10" height="46" rx="4" fill="${horse}"/>
        <rect x="116" y="196" width="10" height="46" rx="4" fill="${horse}"/><rect x="132" y="196" width="10" height="46" rx="4" fill="${horseD}"/>
        <path d="M62,242 h14 v8 h-17 z M78,242 h14 v8 h-17 z M114,242 h14 v8 h-17 z M130,242 h14 v8 h-17 z" fill="#222"/>
        <ellipse cx="98" cy="186" rx="48" ry="26" fill="${horse}" stroke="${horseD}" stroke-width="2"/>
        <path d="M120,170 C132,148 136,132 142,118 L162,126 C156,148 154,172 142,198 Z" fill="${horse}" stroke="${horseD}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M142,118 C148,102 164,98 178,106 L180,122 C170,130 162,134 158,130 Z" fill="${horse}" stroke="${horseD}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M142,118 C132,112 130,128 126,150 C124,164 120,170 120,170 C128,150 136,136 146,126 Z" fill="#3a220e"/>
        <circle cx="164" cy="112" r="2.4" fill="#111"/><path d="M178,108 l2,12" stroke="#111" stroke-width="1.4"/>
        <path d="M150,124 L172,112" stroke="${p.d}" stroke-width="3"/>
        <path d="M70,184 C82,170 116,170 128,184 C116,198 82,198 70,184 Z" fill="${p.c}" stroke="${GOLD_LINE}" stroke-width="2"/>
        <path d="M84,164 L92,114 Q104,106 114,114 L116,164 Q100,172 84,164 Z" fill="${p.c}" stroke="${p.d}" stroke-width="2" stroke-linejoin="round"/>
        <path d="M86,148 L114,148" stroke="${GOLD}" stroke-width="5"/>
        <path d="M92,116 L68,92 L62,100 L88,130 Z" fill="${p.c}" stroke="${p.d}" stroke-width="1.8" stroke-linejoin="round"/>
        ${place(suit, 56, 66, .62, -12)}
        <path d="M116,120 L134,150" stroke="${p.d}" stroke-width="7" stroke-linecap="round"/>
        <circle cx="102" cy="96" r="14" fill="${SKIN}" stroke="#6b4a2a" stroke-width="1.5"/>
        ${eyes(102, 95)}<path d="M96,103 Q102,108 108,103" fill="none" stroke="#7a3b22" stroke-width="1.5" stroke-linecap="round"/>
        <path d="M84,92 Q102,66 120,92 Q102,86 84,92 Z" fill="${p.d}"/><ellipse cx="102" cy="91" rx="23" ry="5.5" fill="${p.d}"/>
        <path d="M114,74 C134,60 144,72 130,86" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
        <path d="M114,74 C134,60 144,72 130,86" fill="none" stroke="${p.tone}" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M80,200 L92,224 L86,230 L74,206 Z" fill="${p.d}" opacity=".9"/>
      </g>`;
  }

  function re(suit) {
    const p = PAL[suit];
    let ermine = '';
    for (let i = 0; i < 6; i++) ermine += `<path d="M${78 + i * 9},${138 + Math.abs(2.5 - i) * 2.4} l1.6,5 l-3.2,0 z" fill="#222"/>`;
    return `${panel(p)}
      <path d="M58,246 L68,142 Q100,124 132,142 L142,246 Z" fill="${p.c}" stroke="${p.d}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M58,246 L142,246 L141,236 L59,236 Z" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1.2"/>
      <path d="M100,150 L100,236" stroke="${p.d}" stroke-width="1.5" opacity=".6"/>
      <path d="M68,142 L52,190 L64,198 L86,160 Z" fill="${p.c}" stroke="${p.d}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M132,142 L150,176 L140,186 L114,160 Z" fill="${p.c}" stroke="${p.d}" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="58" cy="198" r="6.5" fill="${SKIN}" stroke="#6b4a2a" stroke-width="1.2"/>
      <path d="M72,142 Q100,164 128,142 L126,126 Q100,140 74,126 Z" fill="#fff" stroke="#999" stroke-width="1.2"/>${ermine}
      <path d="M92,150 L108,150 L104,160 L96,160 Z" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1"/>
      ${place(suit, 150, 130, .8, 12)}
      <circle cx="100" cy="102" r="18" fill="${SKIN}" stroke="#6b4a2a" stroke-width="1.5"/>
      ${eyes(100, 98)}
      <path d="M92,104 Q100,102 108,104" fill="none" stroke="#6b6b6b" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M83,106 Q84,138 100,142 Q116,138 117,106 Q108,118 100,116 Q92,118 83,106 Z" fill="#e6e6e6" stroke="#8c8c8c" stroke-width="1.2" stroke-linejoin="round"/>
      <path d="M96,112 Q100,115 104,112" fill="none" stroke="#a9564b" stroke-width="1.5" stroke-linecap="round"/>
      <path d="M79,88 L83,60 L93,75 L100,54 L107,75 L117,60 L121,88 Z" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1.6" stroke-linejoin="round"/>
      <rect x="79" y="84" width="42" height="7" rx="2" fill="${GOLD}" stroke="${GOLD_LINE}" stroke-width="1.4"/>
      <circle cx="100" cy="87.5" r="2.6" fill="${p.c}"/><circle cx="88" cy="87.5" r="1.8" fill="#fff"/><circle cx="112" cy="87.5" r="1.8" fill="#fff"/>
      <circle cx="83" cy="60" r="2.4" fill="${p.c}"/><circle cx="100" cy="54" r="2.8" fill="${p.c}"/><circle cx="117" cy="60" r="2.4" fill="${p.c}"/>`;
  }

  // ---------- carta completa ----------
  function cardBody(suit, rank) {
    const p = PAL[suit];
    const art = rank <= 7 ? pips(suit, rank) : rank === 8 ? fante(suit) : rank === 9 ? cavallo(suit) : re(suit);
    const idx = `font-family="Georgia, 'Times New Roman', serif" font-weight="700" fill="${p.d}"`;
    return `<rect x="3" y="3" width="194" height="294" rx="14" fill="url(#ca-paper)" stroke="#cbbd96" stroke-width="2"/>
      <rect x="13" y="13" width="174" height="274" rx="8" fill="none" stroke="${p.c}" stroke-opacity=".4" stroke-width="1.5"/>
      ${art}
      ${corner(suit, rank, idx)}
      <g transform="rotate(180 100 150)">${corner(suit, rank, idx)}</g>`;
  }

  function corner(suit, rank, idx) {
    return `<text x="26" y="38" font-size="${rank === 10 ? 19 : 22}" text-anchor="middle" ${idx}>${rank}</text>
      <g transform="translate(26 54) scale(.3)">${SYM[suit]()}</g>`;
  }

  function install() {
    if (document.getElementById('card-art-sprite')) return;
    let symbols = '';
    for (const suit of SUITS) {
      for (let r = 1; r <= 10; r++) symbols += `<symbol id="ca-${suit}-${r}" viewBox="0 0 200 300">${cardBody(suit, r)}</symbol>`;
    }
    const wrap = document.createElement('div');
    wrap.innerHTML = `<svg id="card-art-sprite" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true" focusable="false"><defs>${DEFS}</defs>${symbols}</svg>`;
    document.body.appendChild(wrap.firstChild);
  }
  install();

  const html = (suit, rank) => `<svg class="art" viewBox="0 0 200 300" aria-hidden="true" focusable="false"><use href="#ca-${suit}-${rank}"/></svg>`;
  return { html, PAL, SUITS };
})();
