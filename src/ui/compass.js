// Boussole d'expédition. Fiable au Moyeu ; dans les mondes, des phénomènes la perturbent… parfois.
import { BIOMES } from '../world/biomes.js';

const CARD = [['E', 0], ['NE', 45], ['N', 90], ['NO', 135], ['O', 180], ['SO', 225], ['S', 270], ['SE', 315]];
// Phénomènes possibles par monde (index biome) : [type, poids]
const PHENOMENA = {
  4: [['tempete', 3], ['mirage', 2], ['magnetique', 1]],   // Western : tempête de sable, mirages
  5: [['blizzard', 3], ['aurore', 2], ['givre', 2]],       // Gelure : blizzard, aurore magnétique, givre sur le cadran
  0: [['magnetique', 2]], 1: [['parasite', 3]], 2: [['magnetique', 2], ['brume', 2]], 3: [['temporel', 3]], 6: [['brume', 2]], 7: [['brume', 3], ['magnetique', 1]],
};
export const PHENO_INFO = {
  tempete: { label: 'Tempête de sable', msg: 'Une tempête de sable se lève… la boussole disparaît dans la poussière.', fog: 2.6, weather: 1, kind: 'dust' },
  mirage: { label: 'Mirage', msg: 'La chaleur fait trembler l\'air. La boussole voit des choses qui n\'existent pas.' },
  magnetique: { label: 'Champ magnétique', msg: 'Champ magnétique ! L\'aiguille s\'affole.' },
  blizzard: { label: 'Blizzard', msg: 'Blizzard ! On n\'y voit plus rien, la boussole est couverte de neige.', fog: 3, weather: 1, kind: 'snow' },
  aurore: { label: 'Aurore magnétique', msg: 'Une aurore illumine le ciel… et retourne la boussole.' },
  givre: { label: 'Givre', msg: 'Le cadran gèle. L\'aiguille se fige.' },
  parasite: { label: 'Parasites', msg: 'Interférences néon.' }, brume: { label: 'Brume', msg: 'Brume épaisse.', fog: 2.2 }, temporel: { label: 'Faille temporelle', msg: 'La boussole indique où tu étais il y a 30 secondes.' },
};

export class Compass {
  constructor(el) {
    this.el = el; this.strip = el.querySelector('.cp-strip'); this.status = el.querySelector('.cp-status');
    this.items = new Map();
    for (const [l, a] of CARD) this.item('c' + l, `<b>${l}</b>`, 'card');
    BIOMES.forEach((b, i) => this.item('w' + i, `<span style="color:${b.skyBot}">${b.name}</span>`, 'world'));
    this.item('hub', '⌂ Moyeu', 'hub'); this.item('obj', '◆', 'obj');
    for (let t = 0; t < 360; t += 15) if (t % 45) this.item('t' + t, '|', 'tick');
    this.event = null; this.nextRoll = 25; this.spin = 0; this.frozenYaw = 0; this.hist = [];
  }
  item(id, html, cls) { const d = document.createElement('div'); d.className = 'cp-i ' + cls; d.innerHTML = html; this.strip.appendChild(d); this.items.set(id, d); return d; }

  // bearing en degrés, convention: 0 = Est, 90 = Nord (comme les biomes)
  static bearing(from, to) { let a = Math.atan2(-(to.z - from.z), to.x - from.x) * 180 / Math.PI; return (a + 360) % 360; }

  update(dt, { yaw, pos, hubFactor, biome, friends, objective, enabled }, onEvent) {
    this.el.classList.toggle('hidden', !enabled);
    // direction regardée → bearing
    // la caméra regarde vers (-sin yaw, -cos yaw) en (x, z)
    let view = (Math.atan2(Math.cos(yaw), -Math.sin(yaw)) * 180 / Math.PI + 360) % 360;
    // --- phénomènes aléatoires (jamais au Moyeu)
    const far = hubFactor < 0.2 && Math.hypot(pos.x, pos.z) > 220;
    if (this.event) { this.event.t -= dt; if (this.event.t <= 0 || !far) { onEvent?.(null, this.event.type); this.event = null; this.nextRoll = 30 + Math.random() * 40; } }
    else if (far) {
      this.nextRoll -= dt;
      if (this.nextRoll <= 0) {
        this.nextRoll = 25 + Math.random() * 35;
        const list = PHENOMENA[biome] || [];
        if (list.length && Math.random() < 0.4) {
          const tot = list.reduce((a, b) => a + b[1], 0); let r = Math.random() * tot; let type = list[0][0];
          for (const [t, w] of list) { if ((r -= w) <= 0) { type = t; break; } }
          this.event = { type, t: 18 + Math.random() * 25, dur: 0 };
          this.frozenYaw = view; this.fakeOff = Math.random() * 360;
          onEvent?.(type, null);
        }
      }
    }
    const ev = this.event?.type;
    if (ev) this.event.dur += dt;
    // historique pour le temporel
    this.hist.push({ view, pos: { x: pos.x, z: pos.z } }); if (this.hist.length > 1800) this.hist.shift();
    // --- perturbation de la lecture
    let shown = view, opacity = 1, jitter = 0, blur = 0, src = pos, mirage = false;
    if (ev === 'magnetique' || ev === 'aurore') { this.spin += dt * (ev === 'aurore' ? 40 : 160) * (0.5 + Math.sin(this.event.dur * 1.7)); shown = view + this.spin + (ev === 'aurore' ? 180 : 0); jitter = 6; }
    if (ev === 'givre') shown = this.frozenYaw;
    if (ev === 'tempete' || ev === 'blizzard') { opacity = Math.max(0.06, 0.5 - this.event.dur * 0.08); blur = 3; }
    if (ev === 'brume') { opacity = 0.25; blur = 2; }
    if (ev === 'parasite') { jitter = 25; opacity = 0.5 + Math.random() * 0.5; }
    if (ev === 'mirage') { mirage = true; jitter = 2; }
    if (ev === 'temporel' && this.hist.length > 10) { const h = this.hist[0]; shown = h.view; src = h.pos; }
    this.el.style.setProperty('--cp-op', opacity); this.el.style.setProperty('--cp-blur', blur + 'px');
    this.el.dataset.ev = ev || '';
    this.status.textContent = ev ? PHENO_INFO[ev].label : '';

    const W = this.strip.clientWidth || 520, SPAN = 200;
    const place = (id, bearing, extraJ = 0) => {
      const d = this.items.get(id); if (!d) return;
      let delta = ((bearing - shown + 540) % 360) - 180; delta = -delta; // droite = sens horaire
      delta += (Math.random() - 0.5) * (jitter + extraJ);
      const vis = Math.abs(delta) < SPAN / 2;
      d.style.display = vis ? '' : 'none';
      if (vis) { d.style.transform = `translateX(${(W / 2 + delta / SPAN * W).toFixed(1)}px) translateX(-50%)`; d.style.opacity = (1 - Math.abs(delta) / (SPAN / 2)) ** 0.5; }
    };
    for (const [l, a] of CARD) place('c' + l, a);
    for (let t = 0; t < 360; t += 15) if (t % 45) place('t' + t, t);
    BIOMES.forEach((b, i) => place('w' + i, i * 45 + (mirage ? (Math.sin(this.event.dur * 3 + i) * 40) : 0)));
    place('hub', Compass.bearing(src, { x: 0, z: 0 }) + (mirage ? 90 : 0));
    const dHub = Math.hypot(src.x, src.z); this.items.get('hub').innerHTML = `⌂ Moyeu <small>${dHub > 80 ? Math.round(dHub) + ' m' : ''}</small>`;
    if (objective) { this.items.get('obj').innerHTML = `◆ <small>${Math.round(Math.hypot(objective.x - src.x, objective.z - src.z))} m</small>`; place('obj', Compass.bearing(src, objective)); } else this.items.get('obj').style.display = 'none';
    // amis
    const seen = new Set();
    for (const f of friends) {
      const id = 'f' + f.id; seen.add(id);
      if (!this.items.has(id)) this.item(id, '', 'friend');
      const d = this.items.get(id); d.innerHTML = `<i style="background:${f.color}"></i><small>${f.name} · ${Math.round(Math.hypot(f.pos.x - src.x, f.pos.z - src.z))} m</small>`;
      place(id, Compass.bearing(src, f.pos) + (mirage ? (Math.random() - 0.5) * 120 : 0), ev === 'magnetique' ? 60 : 0);
    }
    for (const [id, d] of this.items) if (id[0] === 'f' && !seen.has(id)) { d.remove(); this.items.delete(id); }
  }
}
