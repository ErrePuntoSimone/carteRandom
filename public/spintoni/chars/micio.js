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
