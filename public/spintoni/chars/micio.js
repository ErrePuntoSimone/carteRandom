// Micio: gatto cavaliere. Speciale: "Affondo", scatta in avanti con la spada tesa e colpisce da lontano.
(function (def) {
  if (typeof module !== 'undefined' && module.exports) module.exports = def;
  else (self.SpintoniCharDefs = self.SpintoniCharDefs || []).push(def);
})({
  id: 'micio',
  name: 'Micio',
  color: '#d7b899',
  desc: 'Gatto cavaliere con spada e scudo: solido e preciso.',
  stats: { speed: 510, jump: 1040, weight: 1.12, power: 1.1 },
  // effetti visivi (solo grafica): fendenti d'argento, la speciale è un affondo con la spada
  fx: { color: '#e0f7fa', glow: '#80deea', shape: 'slash', special: 'thrust' },
  // speciali nascoste (tenendo premuto) e suprema; barre caricate soprattutto colpendo
  specials: {
    light: {
      name: "Fendente d'aria", desc: 'Una lama sottile e velocissima che attraversa tutti quelli che trova.', charge: 5,
      anim: 'light_side', startup: 0.12, active: 0.05, recovery: 0.22, dmg: 0, base: 0, growth: 0,
      projectile: { at: 0.12, speed: 1300, ang: 0, grav: 0, life: 0.7, box: { w: 70, h: 20 }, dmg: 5, base: 320, growth: 6, kbAng: 25, pierce: true, dx: 50, dy: -70 },
    },
    heavy: {
      name: 'Scudo boomerang', desc: 'Lancia lo scudo: torna indietro e colpisce anche al ritorno.', charge: 8,
      anim: 'heavy_side', startup: 0.22, active: 0.05, recovery: 0.35, dmg: 0, base: 0, growth: 0,
      projectile: { at: 0.22, speed: 800, ang: 0, grav: 0, life: 1.4, box: { w: 50, h: 50 }, dmg: 8, base: 420, growth: 9, kbAng: 40, returns: true, dx: 50, dy: -65 },
    },
    dodge: {
      name: 'Postura del cavaliere', desc: 'Per 5 secondi colpisce il 25% più forte.', charge: 6,
      anim: 'dodge', startup: 0.05, active: 0.05, recovery: 0.1, dmg: 0, base: 0, growth: 0,
      buff: { at: 0, dur: 5, power: 1.25 },
    },
    special: {
      name: 'Carica di cavalleria', desc: 'Un affondo lunghissimo con la corazza: i colpi non lo fermano.', charge: 7,
      anim: 'heavy_side', startup: 0.12, active: 0.3, recovery: 0.35, dmg: 13, base: 520, growth: 12,
      boxes: { side: { x: 20, y: -76, w: 120, h: 44, ang: 20 } },
      motion: [{ from: 0.1, to: 0.42, vx: 1400, edgeStop: true }],
      armor: { from: 0, to: 0.42 },
      keepOnLand: true, // atterrando continua lo scatto (e si ferma al bordo)
    },
    ultimate: {
      name: 'Mille fendenti', desc: 'Cinque lame a ventaglio che attraversano tutti, con la corazza addosso.',
      anim: 'heavy_side', startup: 0.3, active: 0.05, recovery: 0.4, dmg: 0, base: 0, growth: 0,
      armor: { from: 0, to: 0.75 },
      projectile: [-20, -10, 0, 10, 20].map((ang) => ({ at: 0.3, speed: 1300, ang, grav: 0, life: 0.8, box: { w: 70, h: 20 }, dmg: 8, base: 420, growth: 9, kbAng: 30, pierce: true, dx: 50, dy: -70 })),
    },
  },
  meter: { move: 0.4, hit: 0.6 },
  moves: {
    special: {
      name: 'Affondo', desc: 'Scatta in avanti con la spada tesa: colpisce da lontano e spinge quasi in orizzontale.',
      cooldown: 3, anim: 'heavy_side',
      startup: 0.12, active: 0.14, recovery: 0.3, dmg: 11, base: 480, growth: 11,
      boxes: { side: { x: 20, y: -72, w: 140, h: 40, ang: 18 } },
      motion: [{ from: 0.1, to: 0.26, vx: 1300, edgeStop: true }],
    },
  },
});
