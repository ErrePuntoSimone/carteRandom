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
  // speciali nascoste (tenendo premuto) e suprema; barre caricate metà muovendosi e metà colpendo
  specials: {
    light: {
      name: 'Stella cadente', desc: 'Lancia una stella ad arco che ricade addosso a chi sta davanti.', charge: 5,
      anim: 'light_side', startup: 0.12, active: 0.05, recovery: 0.22, dmg: 0, base: 0, growth: 0,
      projectile: { at: 0.12, speed: 900, ang: -35, grav: 1800, life: 1.6, box: { w: 40, h: 40 }, dmg: 6, base: 360, growth: 7, kbAng: 45, dx: 40, dy: -80 },
    },
    heavy: {
      name: 'Pugno stellare', desc: 'Scatta in avanti con la corazza e tira un pugno che lancia lontano.', charge: 8,
      anim: 'heavy_side', startup: 0.2, active: 0.15, recovery: 0.35, dmg: 15, base: 560, growth: 13,
      boxes: { side: { x: 20, y: -80, w: 100, h: 56, ang: 38 } },
      motion: [{ from: 0.15, to: 0.35, vx: 900, edgeStop: true }],
      armor: { from: 0, to: 0.35 },
    },
    dodge: {
      name: 'Scudo di stelle', desc: 'Per 5 secondi pesa di più: buttarla fuori è molto più difficile.', charge: 6,
      anim: 'dodge', startup: 0.05, active: 0.05, recovery: 0.1, dmg: 0, base: 0, growth: 0,
      buff: { at: 0, dur: 5, weight: 1.3 },
    },
    special: {
      name: 'Incantesimo', desc: 'Chi le sta vicino resta stregato: per 4 secondi picchia il 30% più piano.', charge: 7,
      anim: 'heavy_up', startup: 0.15, active: 0.15, recovery: 0.25, dmg: 3, base: 0, growth: 0,
      boxes: { side: { x: -110, y: -170, w: 220, h: 170, ang: 0 } }, noLaunch: true,
      debuff: { dur: 4, power: 0.7 },
    },
    ultimate: {
      name: 'Pioggia di stelle', desc: 'Cinque stelle ad arco che cadono a distanze diverse e, intanto, picchia più forte per 5 secondi.',
      anim: 'heavy_up', startup: 0.3, active: 0.05, recovery: 0.4, dmg: 0, base: 0, growth: 0,
      buff: { at: 0, dur: 5, power: 1.25 },
      projectile: [-60, -48, -36, -24, -12].map((ang) => ({ at: 0.3, speed: 900, ang, grav: 1800, life: 1.8, box: { w: 44, h: 44 }, dmg: 7, base: 400, growth: 8, kbAng: 50, dx: 40, dy: -80 })),
    },
  },
  meter: { move: 0.5, hit: 0.5 },
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
