import * as THREE from 'three';
import { Kit, G, mat, MAT, glow } from '../world/kit.js';

const PI = Math.PI, H = PI / 2;
const adder = (k) => (geo, m, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1]) => k.add(geo, m, { p, r, s });

function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }

// Fer à cheval à ressort : fer d'acier poli avec trous de clous, et ressort en laiton qui dépasse au talon
function horseshoe() {
  const k = new Kit(), add = adder(k), steel = mat('#c4c9d0', { metalness: 0.9, roughness: 0.25, emissive: '#3a4048', emissiveIntensity: 0.3 }), brass = MAT.brass(), dark = mat('#2a2d33', { metalness: 0.6, roughness: 0.5 });
  add(G.tor(0.34, 0.08, 8, 28, PI * 1.5), steel, [0, 0, 0], [0, 0, -PI / 4], [1, 1, 0.8]);
  for (let i = 0; i < 7; i++) { const a = -PI / 4 + 0.18 + i / 6 * (PI * 1.5 - 0.36); add(G.cyl(0.022, 0.022, 0.18, 6), dark, [Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0.0], [H, 0, 0]); }
  for (const s of [-1, 1]) add(G.box(0.1, 0.07, 0.16), steel, [s * 0.24, -0.27, 0]);                      // crampons
  // ressort hélicoïdal au sommet
  const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * PI * 2 * 4; pts.push([Math.cos(a) * 0.09, 0.42 + t * 0.34, Math.sin(a) * 0.09]); }
  add(G.tube(pts, 0.018, 90, 5), brass);
  add(G.cyl(0.11, 0.11, 0.03, 12), brass, [0, 0.41, 0]); add(G.cyl(0.11, 0.11, 0.03, 12), brass, [0, 0.77, 0]); add(G.sph(0.05, 8, 6), brass, [0, 0.82, 0]);
  const grp = k.build(); grp.scale.setScalar(1.2); grp.position.y = -0.15; return grp;
}

// Harmonica des Bâtisseurs : peigne noir, plaques de laiton gravées, trous alignés, notes qui flottent
function harmonica() {
  const k = new Kit(), add = adder(k), brass = MAT.brass(), gold = mat('#f0c860', { metalness: 0.9, roughness: 0.25, emissive: '#5a3a00', emissiveIntensity: 0.3 }), dark = mat('#1d1a18', { roughness: 0.6 });
  add(G.rbox(1.0, 0.16, 0.22, 0.03), dark);
  add(G.rbox(1.04, 0.05, 0.26, 0.02), gold, [0, 0.105, 0]); add(G.rbox(1.04, 0.05, 0.26, 0.02), gold, [0, -0.105, 0]);
  for (let i = 0; i < 10; i++) add(G.box(0.05, 0.1, 0.02), dark, [-0.4 + i * 0.089, 0, 0.115]);
  for (let i = 0; i < 10; i++) { add(G.sph(0.012, 4, 3), brass, [-0.4 + i * 0.089, 0.105, 0.125]); }
  for (const s of [-1, 1]) { add(G.cyl(0.095, 0.095, 0.27, 12), brass, [s * 0.52, 0, 0], [H, 0, 0]); add(G.sph(0.03, 6, 5), gold, [s * 0.52, 0, 0.14]); }
  add(G.box(0.5, 0.01, 0.01), dark, [0, 0.135, 0.0]);
  // gravure : motif de roues dentées
  add(G.tor(0.05, 0.012, 4, 8), brass, [-0.15, 0.135, 0.0], [H, 0, 0]); add(G.tor(0.035, 0.012, 4, 8), brass, [0.0, 0.135, 0.0], [H, 0, 0]);
  const grp = k.build();
  const noteMat = glow('#ffe08a', 2.5);
  for (let i = 0; i < 3; i++) { const n = new Kit(), nadd = adder(n); nadd(G.sph(0.045, 6, 5), noteMat, [0, 0, 0], [0, 0, 0], [1.2, 0.8, 1]); nadd(G.box(0.012, 0.16, 0.012), noteMat, [0.05, 0.08, 0]); nadd(G.box(0.07, 0.025, 0.012), noteMat, [0.08, 0.16, 0], [0, 0, -0.5]); const nm = n.build(); nm.position.set(-0.3 + i * 0.3, 0.3 + (i % 2) * 0.08, 0.1); nm.userData.note = i; grp.add(nm); }
  grp.rotation.set(0.3, 0, 0.1); grp.scale.setScalar(1.15); const o = new THREE.Group(); o.add(grp); o.userData.harm = true; return o;
}

// Billet n°0000001 : carton ancien, perforations, tampon, texte lisible des deux côtés
function ticket() {
  const t = tex(512, 256, (x, w, h) => {
    x.fillStyle = '#f0dfb8'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e4cf9c'; for (let i = 0; i < 60; i++) x.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    x.strokeStyle = '#8b1e1e'; x.lineWidth = 6; x.strokeRect(10, 10, w - 20, h - 20); x.lineWidth = 2; x.strokeRect(22, 22, w - 44, h - 44);
    x.fillStyle = '#6b1414'; x.textAlign = 'center'; x.font = 'bold 40px Georgia, serif'; x.fillText('OCTORAIL', w / 2, 66);
    x.font = 'bold 54px Georgia, serif'; x.fillText('Billet N° 0000001', w / 2, 128);
    x.fillStyle = '#3a2a1c'; x.font = 'italic 26px Georgia, serif'; x.fillText('Passager : [effacé]', w / 2, 170); x.fillText('Destination : TOUTES', w / 2, 204);
    x.save(); x.translate(400, 100); x.rotate(-0.3); x.strokeStyle = 'rgba(30,70,140,.75)'; x.lineWidth = 4; x.beginPath(); x.arc(0, 0, 36, 0, PI * 2); x.stroke(); x.font = 'bold 18px Georgia'; x.fillStyle = 'rgba(30,70,140,.75)'; x.fillText('ÉTERNEL', 0, 6); x.restore();
    x.fillStyle = '#9a7a4a'; for (let i = 0; i < 12; i++) { x.beginPath(); x.arc(24 + i * 42, 6, 5, 0, PI * 2); x.fill(); }
  });
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, emissive: '#6a5a3a', emissiveMap: t, emissiveIntensity: 0.25 });
  const geo = new THREE.PlaneGeometry(1.0, 0.5, 8, 1); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 4) * 0.03);
  geo.computeVertexNormals();
  const o = new THREE.Group(); const a = new THREE.Mesh(geo, m); const b = new THREE.Mesh(geo, m); b.rotation.y = PI; b.position.z = -0.012; a.position.z = 0.006; o.add(a, b);
  o.scale.setScalar(1.05); return o;
}

// Flocon éternel : cristal à six branches ramifiées, givre luminescent, noyau qui pulse
function snowflake() {
  const k = new Kit(), add = adder(k), ice = mat('#e8f8ff', { roughness: 0.15, metalness: 0.2, emissive: '#7fd4ff', emissiveIntensity: 0.9, flatShading: true });
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * PI * 2, c = Math.cos(a), s = Math.sin(a);
    add(G.box(0.62, 0.07, 0.05), ice, [c * 0.31, s * 0.31, 0], [0, 0, a]);
    for (const [d, l] of [[0.22, 0.26], [0.42, 0.18]]) for (const sg of [-1, 1]) add(G.box(l, 0.05, 0.04), ice, [c * d + Math.cos(a + sg * 0.9) * l * 0.5, s * d + Math.sin(a + sg * 0.9) * l * 0.5, 0], [0, 0, a + sg * 0.9]);
    add(G.cone(0.06, 0.16, 4), ice, [c * 0.69, s * 0.69, 0], [0, 0, a - H]);
  }
  add(G.cyl(0.14, 0.14, 0.09, 6), ice, [0, 0, 0], [H, 0, 0]);
  const grp = k.build();
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), glow('#ffffff', 3)); grp.add(core);
  grp.scale.setScalar(1.05); const o = new THREE.Group(); o.add(grp); grp.position.y = 0.1; return o;
}

// Boussole du retour : boîtier de laiton, couvercle ouvert, rose des vents, aiguille qui pointe vers le Moyeu
function compass() {
  const k = new Kit(), add = adder(k), brass = MAT.brass(), gold = mat('#e8c060', { metalness: 0.9, roughness: 0.25, emissive: '#4a3000', emissiveIntensity: 0.3 });
  const face = mat('#f6ecd2', { roughness: 0.5 }), dark = mat('#1b2a3a', { roughness: 0.5 }), red = mat('#b3262b', { roughness: 0.5, emissive: '#600', emissiveIntensity: 0.4 });
  add(G.cyl(0.4, 0.42, 0.14, 28), brass, [0, 0, 0], [H, 0, 0]);
  add(G.tor(0.4, 0.04, 6, 28), gold, [0, 0, 0.075]);
  add(G.cyl(0.35, 0.35, 0.02, 28), face, [0, 0, 0.07], [H, 0, 0]);
  add(G.cyl(0.35, 0.35, 0.02, 28), dark, [0, 0, 0.06], [H, 0, 0]);
  add(G.tor(0.3, 0.012, 4, 28), dark, [0, 0, 0.085]);
  for (let i = 0; i < 16; i++) { const a = i / 16 * PI * 2; add(G.box(i % 4 ? 0.012 : 0.02, i % 4 ? 0.05 : 0.09, 0.012), dark, [Math.sin(a) * 0.27, Math.cos(a) * 0.27, 0.088], [0, 0, -a]); }
  for (let i = 0; i < 4; i++) add(G.cone(0.05, 0.22, 4), dark, [Math.sin(i * H) * 0.15, Math.cos(i * H) * 0.15, 0.09], [H, 0, -i * H + 0], [1, 1, 0.3]);
  // anneau + chaîne
  add(G.tor(0.08, 0.025, 6, 14), brass, [0, 0.5, 0], [0, 0, 0]); add(G.cyl(0.05, 0.05, 0.1, 8), brass, [0, 0.42, 0]);
  for (let i = 0; i < 5; i++) add(G.tor(0.035, 0.01, 4, 8), brass, [Math.sin(i * 1.2) * 0.05 + 0.15 + i * 0.07, 0.6 + Math.sin(i) * 0.04, 0], [0, i % 2 ? H : 0, 0]);
  add(G.cyl(0.03, 0.03, 0.1, 8), brass, [0.0, 0.0, 0.1], [H, 0, 0]);
  const grp = k.build();
  const needle = new THREE.Group(); const nk = new Kit(), nadd = adder(nk);
  nadd(G.cone(0.045, 0.3, 4), red, [0, 0.15, 0], [0, 0, 0], [1, 1, 0.3]); nadd(G.cone(0.045, 0.28, 4), mat('#eee', { roughness: 0.4 }), [0, -0.14, 0], [0, 0, PI], [1, 1, 0.3]);
  needle.add(nk.build()); needle.position.z = 0.1; needle.rotation.z = 0.6; needle.userData.needle = true; grp.add(needle);
  const o = new THREE.Group(); grp.rotation.x = -0.4; o.add(grp); o.userData.needle = needle; o.scale.setScalar(1.2); o.position.y = 0.05; return o;
}

const BUILD = { fer: horseshoe, harmonica, billet: ticket, flocon: snowflake, boussole: compass };
export function buildFindModel(id) {
  const o = (BUILD[id] || horseshoe)();
  o.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return o;
}
