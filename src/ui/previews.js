// Petites démos animées du Comptoir du Moyeu : UN SEUL WebGLRenderer partagé, rendu dans un canvas hors-DOM
// puis copié (drawImage) dans un <canvas> 2D par article. Rendu uniquement tant que la boutique est ouverte.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildSteamLoco, buildWagonModel } from '../world/vehicles.js';
import { buildAvatarModel, buildSheriffModel } from '../world/characters.js';

const W = 300, H = 200, T = 3.6, FPS = 24;
const PI = Math.PI;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
const seg = (x, a, b) => clamp((x - a) / (b - a));

let renderer = null, envTex = null;
const built = new Map();          // id -> { scene, cam, update(tn,t), draw?(ctx,tn,t), ready }
const targets = new Set();        // { id, cv, ctx }
let running = false, lastTick = 0, isOpen = () => false, rafId = 0, frames = 0;

// ------------------------------------------------------------------ outils de scène
function getRenderer() {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  const pm = new THREE.PMREMGenerator(renderer);
  envTex = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  return renderer;
}
function mkScene(bg = '#241a12', { sun = 2.4, warm = 0 } = {}) {
  const s = new THREE.Scene(); s.background = new THREE.Color(bg); s.environment = envTex; s.environmentIntensity = 0.55;
  s.add(new THREE.HemisphereLight('#ffe8c8', '#2a1c10', 0.8));
  const d = new THREE.DirectionalLight('#fff0d8', sun); d.position.set(-6, 9, 7); s.add(d);
  if (warm) { const p = new THREE.PointLight('#ff9a3a', warm, 14, 1.6); p.position.set(0, 2.5, 0); s.add(p); s.userData.warm = p; }
  return s;
}
const mcache = new Map();
function basic(color, o = {}) { const k = color + JSON.stringify(o); if (!mcache.has(k)) mcache.set(k, new THREE.MeshBasicMaterial({ color, ...o })); return mcache.get(k); }
function std(color, o = {}) { return new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...o }); }
function ground(scene, color = '#2c2118', r = 30) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), std(color, { roughness: 1 })); m.rotation.x = -PI / 2; scene.add(m); return m;
}
// voie : deux rails + traverses qui défilent selon z
function track(scene, len = 30) {
  const g = new THREE.Group(), sl = [], sp = 1.4, n = Math.ceil(len / sp);
  for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, len), std('#4a4d55', { metalness: 0.8, roughness: 0.4 })); r.position.set(s * 0.95, 0.09, 0); g.add(r); }
  const tm = std('#4e2f19', { roughness: 0.9 });
  for (let i = 0; i < n; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.12, 0.3), tm); t.position.y = 0.04; g.add(t); sl.push(t); }
  g.userData.scroll = (off) => { for (let i = 0; i < n; i++) sl[i].position.z = ((i * sp + off) % (n * sp)) - len / 2; };
  g.userData.scroll(0); scene.add(g); return g;
}
function fitHeight(obj, h) {
  const b = new THREE.Box3().setFromObject(obj), sz = b.getSize(new THREE.Vector3());
  const k = h / (sz.y || 1); obj.scale.setScalar(k); obj.position.y -= b.min.y * k; return k;
}
// bouffées (fumée / vapeur) : sphères translucides recyclées
function puffs(scene, n, color = '#9a9aa2') {
  const geo = new THREE.SphereGeometry(1, 8, 6), arr = [];
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false })); m.visible = false; scene.add(m); arr.push(m); }
  return arr;
}
function snow(scene, n = 90, box = [10, 7, 8], dir = [-0.9, -1.6]) {
  const pos = new Float32Array(n * 3), seeds = [];
  for (let i = 0; i < n; i++) seeds.push([Math.random(), Math.random(), Math.random()]);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.16, transparent: true, opacity: 0.9, depthWrite: false })); pts.frustumCulled = false;
  scene.add(pts);
  pts.userData.update = (t) => {
    for (let i = 0; i < n; i++) {
      const [a, b, c] = seeds[i], k = (t / T * (0.6 + c * 0.5) + b) % 1;     // boucle exacte sur T pour un raccord invisible
      pos[i * 3] = (a - 0.5) * box[0] + dir[0] * (k - 0.5) * 3 + Math.sin(t * 2 + i) * 0.1;
      pos[i * 3 + 1] = (1 - k) * box[1];
      pos[i * 3 + 2] = (c - 0.5) * box[2] + dir[1] * 0 ;
    }
    geo.attributes.position.needsUpdate = true;
  };
  return pts;
}
function look(cam, p, l) { cam.position.set(...p); cam.lookAt(...l); }
function cam3(fov = 32) { return new THREE.PerspectiveCamera(fov, W / H, 0.1, 200); }

// ------------------------------------------------------------------ overlays 2D
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function gauge(ctx, x, y, w, h, v, color, label) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,6,3,.72)'; roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = color; roundRect(ctx, x + 2, y + 2, Math.max(h - 4, (w - 4) * clamp(v)), h - 4, (h - 4) / 2); ctx.fill();
  ctx.strokeStyle = '#d2a24c'; ctx.lineWidth = 1.5; roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
  if (label) { ctx.fillStyle = '#fff3d6'; ctx.font = 'bold 12px "Chakra Petch", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(label, x + 8, y + h / 2 + 1); }
  ctx.restore();
}
function label(ctx, txt, x, y, { size = 14, color = '#ffe3a8', align = 'center' } = {}) {
  ctx.save(); ctx.font = `bold ${size}px "Chakra Petch", sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,6,3,.85)'; ctx.strokeText(txt, x, y); ctx.fillStyle = color; ctx.fillText(txt, x, y); ctx.restore();
}
function emoji(ctx, e, x, y, size = 24, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.font = `${size}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(e, x, y); ctx.restore();
}

// ------------------------------------------------------------------ démos
const DEMOS = {};

// 1. Locomotive à vapeur : roule, fumée, bielles, pelletée de charbon
DEMOS.vapeur = {
  cap: 'Elle roule à 26 m/s… tant que tu la nourris.',
  build() {
    const scene = mkScene('#2a1f15'), cam = cam3(30); ground(scene, '#34261a'); const tr = track(scene, 40);
    const loco = buildSteamLoco(); scene.add(loco); look(cam, [-24, 5.5, 0.5], [0, 2.2, 0.4]);
    const pf = puffs(scene, 9, '#b8b8c0'), lumps = [], lm = new THREE.MeshStandardMaterial({ color: '#111', roughness: 1, flatShading: true });
    for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28), lm); scene.add(m); lumps.push(m); }
    const ud = loco.userData, rodsBase = ud.rods.map(r => r.position.clone());
    return {
      scene, cam,
      update(tn, t) {
        const spin = t * 6.5;
        tr.userData.scroll(-t * 9 % 1e3 + 1000);
        ud.wheels.forEach((w, i) => { w.rotation.x = -spin * (i < 2 ? 1.6 : 1); });
        ud.rods.forEach((r, i) => { const ph = -spin + (i < 2 ? 0 : PI / 2) + (i >= 2 ? PI / 2 : 0); const b = rodsBase[i]; r.position.y = b.y + Math.sin(ph) * 0.28; r.position.z = b.z + Math.cos(ph) * 0.28 * (i % 2 ? 0.5 : 1); });
        loco.position.y = Math.sin(t * 30) * 0.015;
        pf.forEach((m, i) => { const k = (t / T * 2 + i / pf.length) % 1; m.visible = true; m.position.set(0, 4.9 + k * 4.2, 3.6 - k * 7); m.scale.setScalar(0.35 + k * 1.1); m.material.opacity = 0.75 * (1 - k) * Math.min(1, k * 8); });
        // pelletée : lancer de charbon vers le foyer (2e moitié)
        lumps.forEach((m, i) => { const k = seg(tn, 0.45 + i * 0.1, 0.62 + i * 0.1); m.visible = k > 0 && k < 1; m.position.set(0, lerp(5.2, 3.2, k) + Math.sin(k * PI) * 1.8, lerp(-9, -3.6, k)); m.rotation.x = k * 6; });
      },
      draw(ctx, tn) {
        const p = 0.25 + 0.7 * sm(seg(tn, 0.5, 0.95)) ;
        gauge(ctx, 8, H - 26, 120, 18, p, p > 0.7 ? '#ffb347' : '#d2a24c', 'PRESSION');
        emoji(ctx, '🪨', W - 24, 24, 22, tn > 0.45 && tn < 0.85 ? 1 : 0.25); emoji(ctx, '💧', W - 52, 24, 20, 0.85);
      },
    };
  },
};

// 2. Chalumeau : la glace fond, vapeur, libère une pépite
DEMOS.chalumeau = {
  cap: 'Maintiens [F] : la glace fond, ce qu\'elle cache est libéré.',
  build() {
    const scene = mkScene('#1b1e26', { sun: 1.6 }), cam = cam3(34); ground(scene, '#2a2622'); look(cam, [0.8, 2.4, 6.2], [-0.2, 0.9, 0]);
    const ice = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), new THREE.MeshPhysicalMaterial({ color: '#9fe6ff', transparent: true, opacity: 0.62, roughness: 0.08, metalness: 0, emissive: '#2a7aa0', emissiveIntensity: 0.35 })); scene.add(ice);
    const nug = new THREE.Mesh(new THREE.IcosahedronGeometry(0.36, 0), std('#f2c85a', { metalness: 0.9, roughness: 0.25, emissive: '#7a5200', emissiveIntensity: 0.7 })); scene.add(nug);
    const pud = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshStandardMaterial({ color: '#7fd4f5', transparent: true, opacity: 0.6, roughness: 0.05, metalness: 0.2 })); pud.rotation.x = -PI / 2; pud.position.y = 0.02; scene.add(pud);
    // chalumeau
    const torch = new THREE.Group(); scene.add(torch);
    const brass = std('#d2a24c', { metalness: 0.9, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.5, 12), brass); body.rotation.z = PI / 2; body.position.set(-4.2, 1.0, 0); torch.add(body);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12), std('#9c1f1f')); tank.position.set(-4.6, 0.6, 0); torch.add(tank);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 0.5, 10), brass); nozzle.rotation.z = -PI / 2; nozzle.position.set(-3.3, 1.0, 0); torch.add(nozzle);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.9, 12), basic('#ff8a1a', { transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); fl.rotation.z = -PI / 2; scene.add(fl);
    const fl2 = new THREE.Mesh(new THREE.ConeGeometry(0.1, 1.2, 10), basic('#9fe3ff', { transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); fl2.rotation.z = -PI / 2; scene.add(fl2);
    const lite = new THREE.PointLight('#ff9a3a', 6, 7, 1.5); scene.add(lite);
    const pf = puffs(scene, 10, '#e8f6ff');
    return {
      scene, cam,
      update(tn, t) {
        const p = sm(seg(tn, 0.05, 0.82)), sy = lerp(1, 0.12, p), sx = lerp(1, 0.55, p);
        ice.scale.set(sx, sy, sx); ice.position.set(0, 0.9 * sy, 0); ice.visible = tn < 0.97;
        ice.material.opacity = 0.62 * (tn < 0.9 ? 1 : 1 - seg(tn, 0.9, 0.97));
        pud.scale.setScalar(0.2 + p * 1.8); pud.visible = p > 0.01;
        const rel = sm(seg(tn, 0.55, 0.9));
        nug.position.set(0, lerp(0.9, 1.5 * 0.9, rel) + Math.sin(rel * PI) * 0.4, 0); nug.rotation.y = t * 3; nug.scale.setScalar(lerp(0.7, 1.4, rel));
        const on = tn < 0.85, fk = 0.9 + Math.sin(t * 40) * 0.1 + Math.sin(t * 23) * 0.06;
        fl.visible = fl2.visible = on; fl.position.set(-2.3, 1.0, 0); fl.scale.set(fk, 1, fk); fl2.position.set(-2.7, 1.0, 0); fl2.scale.set(1, fk, 1); lite.visible = on; lite.position.set(-1.8, 1.2, 0.6); lite.intensity = 5 + Math.sin(t * 37) * 1.5;
        pf.forEach((m, i) => { const k = (t / T * 3 + i / pf.length) % 1; m.visible = p > 0.02 && p < 0.97; m.position.set(Math.sin(i * 2.4) * 0.5 * sx, 1.0 * sy + k * 2.4, Math.cos(i * 1.7) * 0.4); m.scale.setScalar(0.18 + k * 0.5); m.material.opacity = 0.7 * (1 - k); });
      },
      draw(ctx, tn) {
        label(ctx, 'F', 22, 26, { size: 15 }); ctx.save(); ctx.strokeStyle = '#ffe3a8'; ctx.lineWidth = 2; roundRect(ctx, 10, 12, 24, 24, 6); ctx.stroke(); ctx.restore();
        gauge(ctx, 44, 16, 90, 14, sm(seg(tn, 0.05, 0.82)), '#ff8a1a', 'FONTE');
        if (tn > 0.62 && tn < 0.97) label(ctx, '+ libéré !', W / 2 + 40, 30, { size: 14, color: '#ffd65a' });
      },
    };
  },
};

// 3. Wagon-vitrine : le robot saute dedans
DEMOS.vitrine = {
  cap: 'Le robot-gardien voyage en sécurité, sous verre.',
  build() {
    const scene = mkScene('#2a1f17'), cam = cam3(32); ground(scene, '#34261a'); track(scene, 30);
    const wag = buildWagonModel('vitrine'); scene.add(wag); look(cam, [-17, 6, -1.5], [0, 2.5, -2.4]);
    const sh = buildSheriffModel(); const holder = new THREE.Group(); holder.add(sh); scene.add(holder); fitHeight(sh, 1.9); sh.rotation.y = PI / 2 * 0;
    const st = new THREE.PointLight('#ffe3a8', 4, 8, 1.6); st.position.set(-1, 4, 0); scene.add(st);
    return {
      scene, cam,
      update(tn, t) {
        const k = seg(tn, 0.12, 0.62), inside = tn >= 0.62;
        const x = lerp(-3.0, -0.05, sm(k)), z = lerp(-8.5, 0, k);
        const y = inside ? 1.68 : Math.sin(k * PI) * 3.4;
        holder.position.set(inside ? 0 : x, y, inside ? 0 : z);
        holder.rotation.y = inside ? (tn - 0.62) * 8 * (1 - seg(tn, 0.62, 0.8)) : lerp(0.9, 0.3, k);
        holder.rotation.z = inside ? 0 : -Math.sin(k * PI) * 0.15;
        sh.rotation.x = 0;
        holder.visible = tn > 0.05; holder.scale.setScalar(inside ? 1 + 0.18 * Math.sin(clamp((tn - 0.62) / 0.14) * PI) : 1);
        st.intensity = inside ? 4 + 4 * Math.sin(clamp((tn - 0.62) / 0.3) * PI) : 4;
      },
      draw(ctx, tn) {
        if (tn > 0.66 && tn < 0.98) { label(ctx, '✔ en sécurité', W / 2, 24, { size: 14, color: '#a9f0a0' }); }
      },
    };
  },
};

// 4. Wagon-stockage : les pépites volent dedans
DEMOS.stockage = {
  cap: 'Tout ce que tu ramasses près du train y est rangé.',
  build() {
    const scene = mkScene('#2a1f17'), cam = cam3(32); ground(scene, '#34261a'); track(scene, 30);
    const wag = buildWagonModel('stockage'); scene.add(wag); look(cam, [-17, 6, -1.5], [0, 2.5, -1.5]);
    const gems = [], N = 9;
    const mats = [std('#ffcf4a', { metalness: 0.9, roughness: 0.25, emissive: '#7a5200', emissiveIntensity: 0.6 }), std('#6fe0ff', { metalness: 0.2, roughness: 0.15, emissive: '#1b7fa8', emissiveIntensity: 0.9 }), std('#b6ff6a', { roughness: 0.2, emissive: '#3d8a1a', emissiveIntensity: 0.8 })];
    for (let i = 0; i < N; i++) { const m = new THREE.Mesh(i % 3 === 1 ? new THREE.OctahedronGeometry(0.34) : new THREE.IcosahedronGeometry(0.3, 0), mats[i % 3]); scene.add(m); gems.push(m); }
    const src = gems.map((_, i) => [-7 - (i % 3) * 1.2, 0.5 + (i % 2) * 0.3, -4.5 + i * 1.1]);
    return {
      scene, cam,
      update(tn, t) {
        gems.forEach((m, i) => {
          const k = ((tn * 1.0 - i * 0.075) % 1 + 1) % 1, f = seg(k, 0.0, 0.5), s = src[i];
          m.visible = f > 0 && f < 1;
          m.position.set(lerp(s[0], -1.3, f), lerp(s[1], 2.6, f) + Math.sin(f * PI) * 3.0, lerp(s[2], 0.2 - (i % 3) * 0.5, f));
          m.rotation.set(t * 3 + i, t * 2, 0); m.scale.setScalar(1 - 0.4 * f * f);
        });
      },
      draw(ctx, tn) {
        const n = Math.min(12, Math.floor(tn * 2 * 9 * 1.0 / 1.0 * 0.62 + 1)); const c = Math.round(clamp(tn * 1.55) * 12);
        gauge(ctx, 8, H - 26, 130, 18, c / 12, '#6fe0ff', `STOCK ${c}/12`);
      },
    };
  },
};

// 5. Doublure isotherme : blizzard, comparaison de la jauge de froid
DEMOS.doublure = {
  cap: 'Tu gèles 3× moins vite : la jauge descend lentement.',
  build() {
    const scene = mkScene('#1a2430', { sun: 1.7 }), cam = cam3(34); ground(scene, '#c9dbe6', 20); look(cam, [0, 2.6, 8.5], [0, 1.1, 0]);
    const a = buildAvatarModel('#7a96b0'), b = buildAvatarModel('#e0703a'); a.position.x = -1.6; b.position.x = 1.6; scene.add(a, b);
    const sn = snow(scene, 130, [12, 8, 7]);
    // doublure : halo bleu discret autour du passager équipé
    const aura = new THREE.Mesh(new THREE.SphereGeometry(1.15, 16, 12), basic('#8fe0ff', { transparent: true, opacity: 0.12, depthWrite: false })); aura.position.set(1.6, 1.1, 0); scene.add(aura);
    return {
      scene, cam,
      update(tn, t) {
        sn.userData.update(t);
        const shv = 0.02 + tn * 0.05;
        a.position.set(-1.6 + Math.sin(t * 38) * shv, Math.abs(Math.sin(t * 19)) * 0.02, 0); a.rotation.z = Math.sin(t * 31) * 0.03 * (0.5 + tn);
        b.position.set(1.6 + Math.sin(t * 38) * 0.005, 0, 0);
        aura.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
      },
      draw(ctx, tn) {
        const fa = 1 - 0.92 * tn, fb = 1 - 0.3 * tn;
        const c = (v) => v > 0.55 ? '#8fe0ff' : v > 0.28 ? '#5aa8e8' : '#4a60d8';
        gauge(ctx, 14, H - 26, 120, 16, fa, c(fa)); gauge(ctx, W - 134, H - 26, 120, 16, fb, c(fb));
        label(ctx, 'SANS', 74, H - 38, { size: 12 }); label(ctx, 'AVEC ×3', W - 74, H - 38, { size: 12, color: '#a9f0ff' });
        emoji(ctx, '🥶', 20, 24, 22, 0.9); emoji(ctx, '🧥', W - 22, 24, 22, 0.95);
      },
    };
  },
};

// 6. Grand sac : 4 -> 8 emplacements (démo 2D)
DEMOS.sac = {
  cap: 'Plus de place : 4 emplacements deviennent 8.',
  build() {
    const items = ['💎', '🔩', '🪙', '🪨', '🔮', '⚙️', '🪙', '💎'];
    return {
      scene: null,
      draw(ctx, tn) {
        const grow = sm(seg(tn, 0.38, 0.52));
        const sx = 118, sy = 48, cw = 40, gap = 6;
        emoji(ctx, '🎒', 52, 84, 52 + 8 * Math.sin(grow * PI), 1);
        for (let i = 0; i < 8; i++) {
          const col = i % 4, row = Math.floor(i / 4);
          const x = sx + col * (cw + gap) - 10, y = sy + row * (cw + gap) - 8;
          const extra = i >= 4, a = extra ? grow : 1;
          if (a <= 0) continue;
          ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = 'rgba(10,6,3,.7)'; roundRect(ctx, x, y, cw, cw, 8); ctx.fill();
          const pulse = extra && tn > 0.4 && tn < 0.62 ? 1 + 0.8 * Math.sin(tn * 40) : 1;
          ctx.strokeStyle = extra ? '#ffe3a8' : '#d2a24c'; ctx.lineWidth = extra ? 2 : 1.5; roundRect(ctx, x, y, cw, cw, 8); ctx.stroke(); ctx.restore();
          const fill = i < 4 ? seg(tn, i * 0.07, i * 0.07 + 0.08) : seg(tn, 0.55 + (i - 4) * 0.07, 0.63 + (i - 4) * 0.07);
          if (fill > 0) emoji(ctx, items[i], x + cw / 2, y + cw / 2 + 1 - (1 - fill) * 10, 22 * (0.6 + 0.4 * fill), fill * a);
        }
        label(ctx, tn < 0.45 ? '4' : '8', 42, 24, { size: 22, color: tn < 0.45 ? '#ffe3a8' : '#a9f0a0' });
        if (tn > 0.45) label(ctx, '4 → 8', 52, H - 24, { size: 18, color: '#a9f0a0' });
      },
    };
  },
};

// 7. Convoyeur automatique : la loco à quai se remplit toute seule
DEMOS.convoyeur = {
  cap: 'À quai, le Moyeu remplit charbon et eau sans toi.',
  build() {
    const scene = mkScene('#2a1f15'), cam = cam3(30); ground(scene, '#34261a'); track(scene, 30);
    const loco = buildSteamLoco(); scene.add(loco); look(cam, [-24, 6, 0.4], [0, 3.0, 0.2]);
    // quai + trémie du Moyeu (derrière la loco)
    const brass = std('#d2a24c', { metalness: 0.9, roughness: 0.3 }), dk = std('#3a3028', { roughness: 0.8 });
    const plat = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 16), dk); plat.position.set(3.6, 0.25, 0); scene.add(plat);
    const hop = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.9, 2.4, 10), dk); hop.position.set(4.6, 7.0, -3.2); scene.add(hop);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), dk); for (const dz of [-1, 1]) { const l = leg.clone(); l.position.set(4.6, 3.3, -3.2 + dz * 0.9); scene.add(l); }
    const pipe = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, 0.35), brass); pipe.position.set(2.1, 6.1, -3.2); scene.add(pipe);
    const pipe2 = new THREE.Mesh(new THREE.BoxGeometry(5, 0.3, 0.3), std('#3a7ab8', { metalness: 0.7, roughness: 0.3 })); pipe2.position.set(2.1, 6.1, 1.4); scene.add(pipe2);
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 2, 12), std('#3a7ab8', { metalness: 0.5, roughness: 0.4 })); tank.position.set(4.8, 7.2, 1.6); scene.add(tank);
    const lm = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 1, flatShading: true }), dm = basic('#7fd4f5', { transparent: true, opacity: 0.85 });
    const lumps = [], drops = [];
    for (let i = 0; i < 7; i++) { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26), lm); scene.add(m); lumps.push(m); }
    for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), dm); scene.add(m); drops.push(m); }
    const pf = puffs(scene, 5, '#b8b8c0');
    return {
      scene, cam,
      update(tn, t) {
        const on = tn > 0.08 && tn < 0.9;
        lumps.forEach((m, i) => { const k = ((t / T * 3.2 - i / lumps.length) % 1 + 1) % 1; m.visible = on; m.position.set(0.1 + Math.sin(i) * 0.35, lerp(5.9, 3.5, k * k), -3.2); m.rotation.x = k * 5 + i; });
        drops.forEach((m, i) => { const k = ((t / T * 3.6 - i / drops.length) % 1 + 1) % 1; m.visible = on; m.position.set(0.1 + Math.sin(i * 2) * 0.25, lerp(5.9, 3.6, k * k), 1.4); m.scale.set(1, 1.4, 1); });
        pf.forEach((m, i) => { const k = (t / T * 1.3 + i / pf.length) % 1; m.visible = true; m.position.set(0, 4.9 + k * 3.2, 3.6 - k * 3); m.scale.setScalar(0.3 + k * 0.9); m.material.opacity = 0.5 * (1 - k) * Math.min(1, k * 8); });
      },
      draw(ctx, tn) {
        const f = sm(seg(tn, 0.08, 0.88));
        gauge(ctx, 8, H - 46, 118, 16, f, '#6a6a72', `CHARBON`);
        gauge(ctx, 8, H - 26, 118, 16, f, '#3a8ad8', `EAU`);
        if (tn > 0.9) label(ctx, '✔ plein', W - 50, H - 28, { size: 15, color: '#a9f0a0' });
      },
    };
  },
};

// 8. Wagon-dortoir : chauffé, le passager se réchauffe
DEMOS.dortoir = {
  cap: 'Chauffé : tu te réchauffes, et tu réapparais ici.',
  build() {
    const scene = mkScene('#18222e', { sun: 1.3, warm: 14 }), cam = cam3(32); ground(scene, '#c9dbe6', 24); track(scene, 30);
    const wag = buildWagonModel('dortoir'); scene.add(wag); look(cam, [-17, 6, -0.5], [-0.5, 2.3, -0.8]);
    const av = buildAvatarModel('#e0703a'); av.position.set(-3.6, 0, -1.8); av.rotation.y = 0.5; scene.add(av);
    const sn = snow(scene, 130, [22, 9, 14], [-1, 0]);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), basic('#ffb347', { transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })); halo.rotation.x = -PI / 2; halo.position.set(-3.6, 0.05, -1.8); scene.add(halo);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 6, 16, 1, true), basic('#ffd890', { transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); beam.position.set(-3.6, 3, -1.8); scene.add(beam);
    return {
      scene, cam,
      update(tn, t) {
        sn.userData.update(t); scene.userData.warm.position.set(-1.8, 2.6, 0); scene.userData.warm.intensity = 14 + Math.sin(t * 9) * 2.5;
        const k = 1 - sm(seg(tn, 0.05, 0.8));
        av.position.x = -3.6 + Math.sin(t * 40) * 0.035 * k; av.rotation.z = Math.sin(t * 33) * 0.04 * k;
        const r = 1 + ((t / T * 2.2) % 1) * 3.4; halo.scale.setScalar(r); halo.material.opacity = 0.55 * (1 - (r - 1) / 3.4) * (0.4 + 0.6 * sm(seg(tn, 0, 0.3)));
        beam.material.opacity = 0.35 * Math.sin(clamp(seg(tn, 0.82, 1)) * PI);
      },
      draw(ctx, tn) {
        const f = sm(seg(tn, 0.05, 0.8)), col = f > 0.7 ? '#ff9a3a' : f > 0.35 ? '#d8c85a' : '#5aa8e8';
        gauge(ctx, 8, H - 26, 130, 18, 0.12 + 0.88 * f, col, f > 0.5 ? 'CHAUD' : 'FROID');
        if (tn > 0.84) label(ctx, '✦ réapparition', W - 66, 26, { size: 13, color: '#ffd890' });
        else emoji(ctx, f > 0.5 ? '😌' : '🥶', W - 22, 24, 22, 0.95);
      },
    };
  },
};

// ------------------------------------------------------------------ boucle
function ensure(id) {
  let d = built.get(id);
  if (d) return d;
  const def = DEMOS[id]; if (!def) return null;
  getRenderer();
  try { d = def.build(); } catch (e) { console.warn('[previews]', id, e); d = { scene: null, failed: true }; }
  built.set(id, d); return d;
}
function visible(cv) {
  const r = cv.getBoundingClientRect(); if (!r.width) return false;
  const p = cv.closest('.panel')?.getBoundingClientRect(); if (!p) return true;
  return r.bottom > p.top && r.top < p.bottom;
}
function tick(now) {
  rafId = 0;
  if (!isOpen() || !targets.size) { running = false; return; }   // boutique fermée : on s'arrête (aucun rendu)
  rafId = requestAnimationFrame(tick);
  if (now - lastTick < 1000 / FPS) return;
  lastTick = now;
  const t = (now / 1000) % T, tn = t / T;
  let built1 = false;
  for (const tg of targets) {
    if (!tg.cv.isConnected) { targets.delete(tg); continue; }
    if (!visible(tg.cv)) continue;
    let d = built.get(tg.id);
    if (!d) { if (built1) continue; d = ensure(tg.id); built1 = true; if (!d) continue; }   // une construction de modèle par image
    const ctx = tg.ctx;
    if (d.scene) {
      d.update(tn, t);
      renderer.render(d.scene, d.cam);
      ctx.drawImage(renderer.domElement, 0, 0, W, H);
    } else { ctx.fillStyle = '#241a12'; ctx.fillRect(0, 0, W, H); const g = ctx.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7); g.addColorStop(0, '#4a3520'); g.addColorStop(1, '#1b130c'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
    d.draw?.(ctx, tn, t);
    // vignette cuivrée
    const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(20,10,0,.45)'); ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    frames++;
  }
}
function start() { if (!running) { running = true; lastTick = 0; rafId = requestAnimationFrame(tick); } }

// Appelé par openShop() : remplit chaque `.demo[data-demo]` de la liste d'un <canvas> animé.
export function attachPreviews(root, open) {
  isOpen = open;
  targets.clear();
  root.querySelectorAll('.demo[data-demo]').forEach(box => {
    const id = box.dataset.demo; if (!DEMOS[id]) return;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.className = 'demo-cv';
    box.prepend(cv);
    const cap = box.querySelector('.demo-cap'); if (cap) cap.textContent = DEMOS[id].cap;
    targets.add({ id, cv, ctx: cv.getContext('2d') });
  });
  start();
}
export function stopPreviews() { targets.clear(); isOpen = () => false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; running = false; }
export function previewStats() { return { frames, running, targets: targets.size, built: [...built.keys()] }; }
if (typeof window !== 'undefined') window.__octPreviews = previewStats;
