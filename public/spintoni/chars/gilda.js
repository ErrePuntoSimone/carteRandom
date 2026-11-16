// Gilda: equilibrata. Speciale: "Contrattacco", para il prossimo colpo e risponde subito con un pugno potente.
(function (def) {
  if (typeof module !== 'undefined' && module.exports) module.exports = def;
  else (self.SpintoniCharDefs = self.SpintoniCharDefs || []).push(def);
})({
  id: 'gilda',
  name: 'Gilda',
  color: '#ab47bc',
  desc: 'Equilibrata: né troppo pesante né troppo leggera.',
  stats: { speed: 560, jump: 1070, weight: 1.0, power: 1.0 },
  // effetti visivi (solo grafica): stelline viola, la speciale è la guardia (scudo)
  fx: { color: '#ce93d8', glow: '#fff59d', shape: 'star', special: 'guard' },
  moves: {
    special: {
      name: 'Contrattacco', desc: 'Si mette in guardia: se la colpiscono in quel momento para e risponde con un pugno fortissimo.',
      cooldown: 4, anim: 'dodge',
      startup: 0.02, active: 0, recovery: 0.45, dmg: 0, base: 0, growth: 0, boxes: {},
      // finestra di parata (secondi dall'inizio della mossa) e colpo di risposta
      counter: { from: 0.02, to: 0.4, dmg: 12, base: 560, growth: 12, ang: 42 },
    },
  },
});
