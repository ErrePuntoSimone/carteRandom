// Pepe: leggerissimo e velocissimo. Speciale: "Turbine", sale ruotando e colpisce tutto intorno (ottimo per rientrare).
(function (def) {
  if (typeof module !== 'undefined' && module.exports) module.exports = def;
  else (self.SpintoniCharDefs = self.SpintoniCharDefs || []).push(def);
})({
  id: 'pepe',
  name: 'Pepe',
  color: '#ff7043',
  desc: 'Leggerissimo e scattante: corre e salta più di tutti, ma vola via al primo colpo forte e picchia piano.',
  stats: { speed: 720, jump: 1200, weight: 0.75, power: 0.88 },
  // effetti visivi (solo grafica): scintille arancio, la speciale è un vortice
  fx: { color: '#ff7043', glow: '#ffd54f', shape: 'spark', special: 'vortex' },
  moves: {
    special: {
      name: 'Turbine', desc: 'Sale ruotando e colpisce chi gli sta intorno: perfetto per rientrare dal vuoto.',
      cooldown: 3.5, anim: 'heavy_up',
      startup: 0.06, active: 0.3, recovery: 0.25, dmg: 9, base: 430, growth: 9,
      boxes: { side: { x: -60, y: -120, w: 120, h: 120, ang: 70 } },
      motion: [{ from: 0.04, to: 0.34, vx: 220, vy: -950 }],
      keepOnLand: true, recover: true, // i bot lo usano per rientrare
    },
  },
});
