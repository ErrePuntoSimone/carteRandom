// Pepe: leggerissimo e velocissimo. Speciale: "Turbine", sale ruotando e colpisce tutto intorno (ottimo per rientrare).
const PEPE_SENZA_COLPI = { side: { x: 0, y: 0, w: 0, h: 0, ang: 0 }, up: { x: 0, y: 0, w: 0, h: 0, ang: 0 }, down: { x: 0, y: 0, w: 0, h: 0, ang: 0 } }; // nessun colpo in mischia
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
  // barre delle speciali: Pepe le riempie soprattutto correndo
  meter: { move: 0.7, hit: 0.3 },
  specials: {
    light: {
      name: 'Pugno di vento', desc: 'Lancia una folata piccola e rapidissima: poco danno, ma parte subito.', charge: 4,
      anim: 'light_side', startup: 0.1, active: 0.05, recovery: 0.2, dmg: 4, base: 300, growth: 5,
      boxes: PEPE_SENZA_COLPI, lunge: { speed: 0, time: 0 },
      projectile: { at: 0.1, speed: 1100, ang: 0, grav: 0, life: 1.2, box: { w: 36, h: 24 }, dmg: 4, base: 300, growth: 5, kbAng: 30, dx: 50, dy: -60 },
    },
    heavy: {
      name: 'Palla di fuoco', desc: 'Una grossa palla di fuoco lenta che spinge forte chi colpisce.', charge: 8,
      anim: 'heavy_side', startup: 0.25, active: 0.05, recovery: 0.35, dmg: 12, base: 520, growth: 10,
      boxes: PEPE_SENZA_COLPI, lunge: { speed: 0, time: 0 },
      projectile: { at: 0.25, speed: 520, ang: 0, grav: 0, life: 2, box: { w: 60, h: 60 }, dmg: 12, base: 520, growth: 10, kbAng: 35, dx: 60, dy: -70 },
    },
    dodge: {
      name: 'Turbo', desc: 'Per 4 secondi corre molto più veloce e salta più in alto.', charge: 6,
      anim: 'dodge', startup: 0.05, active: 0.05, recovery: 0.1, dmg: 0, base: 0, growth: 0,
      boxes: PEPE_SENZA_COLPI, lunge: { speed: 0, time: 0 },
      buff: { at: 0, dur: 4, speed: 1.4, jump: 1.18 },
    },
    special: {
      name: 'Polverone', desc: 'Alza una nuvola di polvere intorno a sé: chi ci finisce dentro rallenta e salta meno.', charge: 7,
      anim: 'heavy_up', startup: 0.12, active: 0.15, recovery: 0.25, dmg: 0, base: 0, growth: 0,
      boxes: { side: { x: -100, y: -160, w: 200, h: 160, ang: 0 }, up: PEPE_SENZA_COLPI.up, down: PEPE_SENZA_COLPI.down },
      lunge: { speed: 0, time: 0 }, noLaunch: true,
      debuff: { dur: 3, speed: 0.6, jump: 0.75 },
    },
    ultimate: {
      name: 'Tempesta di fuoco', desc: 'Cinque palle di fuoco a ventaglio e, intanto, il Turbo.',
      anim: 'heavy_up', startup: 0.3, active: 0.05, recovery: 0.4, dmg: 0, base: 0, growth: 0,
      boxes: PEPE_SENZA_COLPI, lunge: { speed: 0, time: 0 },
      buff: { at: 0, dur: 4, speed: 1.4, jump: 1.18 },
      projectile: [-30, -15, 0, 15, 30].map((ang) => ({ at: 0.3, speed: 520, ang, grav: 0, life: 2, box: { w: 60, h: 60 }, dmg: 12, base: 520, growth: 10, kbAng: 35, dx: 60, dy: -70 })),
    },
  },
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
