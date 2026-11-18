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
  // effetti visivi (solo grafica): spruzzi d'acqua, la speciale è una carica a testa bassa
  fx: { color: '#4fc3f7', glow: '#e1f5fe', shape: 'drop', special: 'charge' },
  // speciali nascoste (tenendo premuto) e suprema; barre caricate quasi solo colpendo
  specials: {
    light: {
      name: "Sputo d'acqua", desc: 'Un getto corto che rallenta per 3 secondi chi colpisce.', charge: 4,
      anim: 'light_side', startup: 0.1, active: 0.05, recovery: 0.25, dmg: 0, base: 0, growth: 0,
      projectile: { at: 0.1, speed: 900, ang: 0, grav: 0, life: 0.45, box: { w: 50, h: 30 }, dmg: 3, base: 200, growth: 3, kbAng: 20, debuff: { dur: 3, speed: 0.65 }, dx: 50, dy: -70 },
    },
    heavy: {
      name: 'Tuffo bomba', desc: 'Salta in alto e ricade schiacciando tutti quelli intorno.', charge: 8,
      anim: 'heavy_up', startup: 0.5, active: 0.18, recovery: 0.35, dmg: 16, base: 600, growth: 13,
      boxes: { side: { x: -120, y: -90, w: 240, h: 90, ang: 70 } },
      motion: [{ from: 0.02, to: 0.25, vy: -1000 }, { from: 0.3, to: 0.5, vy: 1700 }],
      keepOnLand: true, groundOnly: true, noDrift: true, // solo da terra, su e giù nello stesso punto
    },
    dodge: {
      name: 'Furia', desc: 'Per 4 secondi è più veloce e picchia più forte.', charge: 6,
      anim: 'dodge', startup: 0.05, active: 0.05, recovery: 0.1, dmg: 0, base: 0, growth: 0,
      buff: { at: 0, dur: 4, speed: 1.25, power: 1.2 },
    },
    special: {
      name: 'Onda', desc: "Un'onda bassa che scorre sul terreno e spinge via tutti.", charge: 7,
      anim: 'heavy_side', startup: 0.25, active: 0.05, recovery: 0.35, dmg: 0, base: 0, growth: 0,
      projectile: { at: 0.25, speed: 650, ang: 0, grav: 0, life: 1.3, box: { w: 70, h: 60 }, dmg: 8, base: 480, growth: 10, kbAng: 40, pierce: true, dx: 60, dy: -30 },
    },
    ultimate: {
      name: 'Maremoto', desc: 'Due onde enormi, una per lato, mentre la corazza lo tiene fermo come uno scoglio.',
      anim: 'heavy_up', startup: 0.35, active: 0.05, recovery: 0.45, dmg: 0, base: 0, growth: 0,
      armor: { from: 0, to: 0.85 },
      projectile: [0, 180].map((ang) => ({ at: 0.35, speed: 650, ang, grav: 0, life: 1.6, box: { w: 110, h: 110 }, dmg: 12, base: 560, growth: 11, kbAng: 45, pierce: true, dx: 0, dy: -55 })),
    },
  },
  meter: { move: 0.25, hit: 0.75 },
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
