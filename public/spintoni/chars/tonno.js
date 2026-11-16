// Tonno: massiccio e potente. Speciale: "Carica del toro", corre in avanti a testa bassa e non si ferma se lo colpiscono.
(function (def) {
  if (typeof module !== 'undefined' && module.exports) module.exports = def;
  else (self.SpintoniCharDefs = self.SpintoniCharDefs || []).push(def);
})({
  id: 'tonno',
  name: 'Tonno',
  color: '#42a5f5',
  desc: 'Massiccio e potente: lentissimo e con salti bassi, ma quasi impossibile da buttare fuori e picchia durissimo.',
  stats: { speed: 390, jump: 980, weight: 1.45, power: 1.28 },
  moves: {
    special: {
      name: 'Carica del toro', desc: 'Corre in avanti a testa bassa: i colpi ricevuti fanno danno ma non lo fermano.',
      cooldown: 5, anim: 'heavy_side',
      startup: 0.25, active: 0.35, recovery: 0.35, dmg: 14, base: 560, growth: 12,
      boxes: { side: { x: 8, y: -82, w: 74, h: 78, ang: 35 } },
      motion: [{ from: 0.25, to: 0.6, vx: 700, edgeStop: true }],
      armor: { from: 0, to: 0.6 }, // corazza: si prende il danno ma niente lancio
    },
  },
});
