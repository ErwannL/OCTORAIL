import * as THREE from 'three';
import { WORLD_LORE, HUB_LORE } from '../data/lore.js';
import { buildGuardian, buildGuardianPedestal } from '../world/guardians.js';

// L'OCTUOR : les 8 gardiens égarés (voir docs/LORE.md). SHÉRIF-7 (monde 4) garde sa quête historique dans main.js ;
// ce module gère les 7 autres + les rayons du Moyeu + le final.
// Cycle : 'lost' (coincé dans le mauvais monde) → [outil + maintenir F] → 'free' → [train avec le bon wagon à côté] →
//         'carried' (dans le wagon) → [train près de son piédestal, dans son monde] → 'home' (rayon rallumé).
const REQ = {
  0: { tools: ['grappin'], wagon: 'plateau', verb: 'Soulever les enseignes au grappin-aimant' },
  1: { tools: ['filet'], wagon: 'vitrine', verb: 'Lancer le filet' },
  2: { tools: ['foreuse', 'treuil'], wagon: 'vitrine', verb: 'Forer la boue et treuiller' },
  3: { tools: ['ancre'], wagon: 'vitrine', verb: 'Poser l\'ancre de gravité' },
  5: { tools: [], wagon: 'cryo', verb: 'Décoller GIVRE-5 de la cire' },
  6: { tools: [], wagon: 'vitrine', verb: 'Parler à CENDRE-0', needsAll: true },
  7: { tools: ['stabilisateur', 'secateur'], wagon: 'vitrine', verb: 'Stabiliser le temps et couper le lierre' },
};
const TOOL_NAMES = { grappin: 'grappin-aimant', filet: 'lance-filet', foreuse: 'foreuse à vapeur', treuil: 'treuil', ancre: 'ancre de gravité', stabilisateur: 'stabilisateur temporel', secateur: 'sécateur', plateau: 'wagon-plateau', vitrine: 'wagon-vitrine', cryo: 'cryo-wagon' };

export function createOctuor(ctx) {
  const { scene, terrain, net, BIOMES } = ctx;
  const G = {}; // index -> { robot, ped, spot, pedPos, prog }
  const v = new THREE.Vector3();

  // lieu de l'égarement : sur une voie du monde « stuckIn », loin du Moyeu, à 13 m de la voie, au sol
  function spotIn(world, salt) {
    const sec = (x, z) => ((Math.round(Math.atan2(-z, x) / (Math.PI / 4)) % 8) + 8) % 8;
    const edges = net.edges.filter(e => e.pts.length > 20 && (e.biome === world || sec(e.pts[e.pts.length >> 1].x, e.pts[e.pts.length >> 1].z) === world));
    edges.sort((a, b) => b.len - a.len);
    const e = edges[salt % Math.max(1, edges.length)] || edges[0]; if (!e) return null;
    let best = null;
    for (const [r0, r1] of [[520, 1000], [250, 1300], [120, 2000]]) { if (best) break;
    for (const ee of [e, ...edges]) { if (best) break;
    for (let k = 4; k < ee.pts.length - 4; k += 3) { const p = ee.pts[k], r = Math.hypot(p.x, p.z); if (r < r0 || r > r1) continue;
      const t = ee.tan[k], side = (salt % 2 ? 1 : -1);
      const x = p.x + t.z * 13 * side, z = p.z - t.x * 13 * side;
      const nn = net.nearest(x, z, 10); if (nn) continue; // jamais sur une autre voie
      best = new THREE.Vector3(x, terrain.heightAt(x, z), z); break; } } }
    return best;
  }
  // piédestal : dans le monde d'origine, près du terminus (ou du bout le plus lointain)
  function pedestalIn(world) {
    const T = net.nodes.get('T' + world);
    let end, prev;
    if (T) { const e = net.edges[T.edges[0]]; const atB = e.b === T.id; end = atB ? e.pts[e.pts.length - 1] : e.pts[0]; prev = atB ? e.pts[e.pts.length - 8] : e.pts[7]; }
    else { let far = null; for (const e of net.edges) if (e.biome === world) for (let k = 0; k < e.pts.length; k += 4) { const p = e.pts[k]; if (!far || Math.hypot(p.x, p.z) > Math.hypot(far.p.x, far.p.z)) far = { p, e, k }; }
      if (!far) return null; end = far.p; prev = far.e.pts[Math.max(0, far.k - 6)]; }
    const dx = end.x - prev.x, dz = end.z - prev.z, L = Math.hypot(dx, dz) || 1;
    for (const side of [1, -1]) for (const d of [12, 16, 20]) { const x = end.x - dx / L * 10 + (dz / L) * d * side, z = end.z - dz / L * 10 - (dx / L) * d * side; if (!net.nearest(x, z, 8)) return new THREE.Vector3(x, terrain.heightAt(x, z), z); }
    return new THREE.Vector3(end.x + dz / L * 14, terrain.heightAt(end.x + dz / L * 14, end.z - dx / L * 14), end.z - dx / L * 14);
  }

  // rayons du Moyeu : 8 colonnes de lumière au-dessus des quais, allumées quand le gardien du monde est rentré
  const rays = [];
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, c = new THREE.Color(BIOMES[i].sun).lerp(new THREE.Color(BIOMES[i].skyBot), 0.4);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.2, 260, 16, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(Math.cos(a) * 30, 130, -Math.sin(a) * 30); m.userData.noCollide = true; m.userData.noCull = true; m.frustumCulled = false; scene.add(m); rays.push({ m, lit: 0 });
  }

  for (const i of Object.keys(REQ).map(Number)) {
    const L = WORLD_LORE[i]?.guardian; if (!L) continue;
    const spot = spotIn(L.stuckIn, i), pedPos = pedestalIn(i); if (!spot || !pedPos) { console.warn('Octuor : pas de place pour', L.code); continue; }
    const robot = buildGuardian(i); robot.position.copy(spot); scene.add(robot);
    const ped = buildGuardianPedestal(i); ped.position.copy(pedPos); scene.add(ped);
    ped.rotation.y = Math.atan2(-pedPos.x, -pedPos.z);
    G[i] = { robot, ped, spot, pedPos, prog: 0, L, req: REQ[i] };
  }
  // CENDRE-0 se cache dans le poêle du saloon : on le pose au plus près de la ville de l'Ouest si elle existe
  if (G[6] && ctx.cendreSpot) { G[6].spot.copy(ctx.cendreSpot); G[6].robot.position.copy(ctx.cendreSpot); }

  const st = i => (ctx.S().guardians ??= {})[G[i].L.code] || 'lost';
  const setSt = (i, s) => { const S = ctx.S(); (S.guardians ??= {})[G[i].L.code] = s; ctx.push(); };
  const homeCount = () => Object.keys(G).filter(i => st(+i) === 'home').length + (ctx.sheriffHome() ? 1 : 0);

  function wagonOf(train, type) { return train?.wagons?.find(w => w.type === type); }
  function say(i, kind) { const L = G[i].L, arr = L.lines?.[kind] || []; ctx.ui.say(arr.slice(0, 3).map(t => ({ who: `${L.code} · ${L.name}`, icon: '🤖', color: '#9fe8ff', beep: 600 + i * 90, text: t }))); }

  let finaleDone = false;
  const api = {
    G, rays,
    // à pied : renvoie un libellé d'invite (ou null) ; gère F maintenu et E
    foot(player, holdF, pressE, dt) {
      const S = ctx.S();
      for (const k in G) { const i = +k, g = G[i], s = st(i);
        if (s !== 'lost' && s !== 'free') continue;
        const d = g.robot.position.distanceTo(player.pos); if (d > 6) continue;
        if (s === 'free') {
          const need = g.req.wagon, w = wagonOf(ctx.train(), need);
          if (w && ctx.train().head.distanceTo(g.robot.position) < 45) { if (pressE) { setSt(i, 'carried'); say(i, 'carried'); ctx.audio.clunk?.(); } return `[E] Charger ${g.L.code} dans le ${TOOL_NAMES[need]}`; }
          return `${g.L.code} est libre : amène ton train avec un ${TOOL_NAMES[need]} (Comptoir du Moyeu)`;
        }
        if (g.req.needsAll && homeCount() < 7) return `${g.L.code} refuse de sortir du poêle. « Pas avant que les sept autres soient rentrés… »`;
        const missing = g.req.tools.filter(t => !S.owned[t]);
        if (missing.length) { if (pressE) say(i, 'found'); return `[E] Parler à ${g.L.code} · il te faut : ${missing.map(t => TOOL_NAMES[t]).join(' + ')} (Comptoir du Moyeu)`; }
        if (holdF) { g.prog = Math.min(1, g.prog + dt / 4); ctx.ui.progress(g.prog, g.req.verb + '…');
          if (Math.random() < 0.7) ctx.sparks.emit(g.robot.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2)), new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 4, (Math.random() - 0.5) * 4), { life: 0.5, size: 0.4, color: '#ffd27a' });
          if (g.prog >= 1) { ctx.ui.progress(null); setSt(i, 'free'); say(i, 'found'); for (let q = 0; q < 40; q++) ctx.steam.emit(g.robot.position.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 5, (Math.random() - 0.5) * 5), { life: 1.6, size: 2, color: '#ffffff', alpha: 0.5 }); }
        } else if (g.prog > 0) { g.prog = Math.max(0, g.prog - dt * 0.3); ctx.ui.progress(null); }
        if (pressE) say(i, 'found');
        return `[F] maintenir : ${g.req.verb} · [E] parler`;
      }
      return null;
    },
    update(dt, time) {
      const tr = ctx.train();
      for (const k in G) { const i = +k, g = G[i], s = st(i);
        let state = s === 'lost' ? 'stuck' : s === 'free' ? 'idle' : s === 'carried' ? 'carried' : 'home';
        if (s === 'carried') {
          // à bord du wagon du porteur (le mien si j'en ai un, sinon reste sur place)
          const w = wagonOf(tr, g.req.wagon);
          if (w) { const a = w.mesh.userData.cargoAnchor; if (a) { a.getWorldPosition(v); g.robot.position.copy(v); g.robot.quaternion.copy(w.mesh.quaternion); } else { g.robot.position.copy(w.mesh.position).add(new THREE.Vector3(0, 1.4, 0)); g.robot.quaternion.copy(w.mesh.quaternion); }
            if (tr.head && tr.head.distanceTo(g.pedPos) < 70 && Math.abs(tr.speed) < 3) { setSt(i, 'home'); api.arrive(i); } }
        } else if (s === 'home') { g.robot.position.copy(g.pedPos); g.robot.position.y += g.ped.userData.top ?? 0.56; g.robot.quaternion.copy(g.ped.quaternion); }
        else if (s === 'free') { /* attend au bord de la voie */ }
        g.robot.userData.update?.(dt, time, state);
        g.ped.userData.setLit?.(s === 'home'); g.ped.userData.update?.(dt, time);
        const vis = g.robot.position.distanceTo(ctx.camPos()) < 900; g.robot.visible = vis;
      }
      for (let i = 0; i < 8; i++) { const lit = i === 4 ? ctx.sheriffHome() : G[i] && st(i) === 'home', r = rays[i];
        r.lit += ((lit ? 1 : 0) - r.lit) * Math.min(1, dt * 1.5); r.m.material.opacity = r.lit * (0.22 + 0.06 * Math.sin(time * 2 + i)); r.m.visible = r.lit > 0.01; }
      if (!finaleDone && homeCount() >= 8) { finaleDone = true; api.finale(); }
    },
    arrive(i) {
      const g = G[i], S = ctx.S(); S.credits = (S.credits | 0) + 150; ctx.push();
      say(i, 'home'); ctx.audio.fanfare?.();
      for (let q = 0; q < 80; q++) ctx.sparks.emit(g.pedPos.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3((Math.random() - 0.5) * 10, 4 + Math.random() * 10, (Math.random() - 0.5) * 10), { life: 1.2, size: 0.5, color: q % 2 ? '#ffe08a' : '#9fe8ff' });
      const n = homeCount(), codex = HUB_LORE.codex[Math.min(HUB_LORE.codex.length - 1, n)];
      setTimeout(() => ctx.ui.say([{ who: 'OCTAVE (radio)', icon: '◈', color: '#ffb347', beep: 900, text: `Rayon ${n}/8 rallumé au Moyeu. +150 crédits.` }, ...(codex ? [{ who: 'Fragment de mémoire', icon: '✦', color: '#e9c46a', text: codex }] : [])]), 2500);
    },
    finale() { ctx.ui.say(HUB_LORE.finale.map(t => ({ who: 'OCTAVE', icon: '◈', color: '#ffb347', beep: 900, text: t }))); for (const r of rays) r.m.scale.x = r.m.scale.z = 1.6; },
    status() { return Object.fromEntries(Object.keys(G).map(i => [G[i].L.code, st(+i)])); },
  };
  return api;
}
