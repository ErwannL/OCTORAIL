import * as THREE from 'three';

// 8 mondes d'Halcyre. Index = direction (0 = Est, sens trigo, pas de 45°).
// Monde = angle i*PI/4 ; position (cos, -sin) en (x, z) : z négatif = Nord.
export const BIOMES = [
  { id: 'colosse',  name: 'Le Colosse',          dir: 'Est',       open: false,
    ground: ['#4f6b2c', '#8a7a3a'], skyTop: '#3d6b5a', skyBot: '#c9d98f', fog: '#a9b97a', fogD: 0.0022, sun: '#fff1c4',
    tagline: 'Les rails sont posés sur le dos d\'une créature qui marche.' },
  { id: 'neon',     name: 'Néon-Bas',            dir: 'Nord-Est',  open: false,
    ground: ['#16121f', '#2a1838'], skyTop: '#0a0614', skyBot: '#5b1a5e', fog: '#2b0f3a', fogD: 0.004, sun: '#ff4fd8',
    tagline: 'Les voies se réorganisent la nuit.' },
  { id: 'archipel', name: "L'Archipel Suspendu", dir: 'Nord',      open: false,
    ground: ['#7fb2d9', '#e6f2ff'], skyTop: '#3a8ee6', skyBot: '#dff1ff', fog: '#cfe6ff', fogD: 0.0018, sun: '#ffffff',
    tagline: 'Ici, le train roule parfois à l\'envers.' },
  { id: 'chrono',   name: 'Chronocline',         dir: 'Nord-Ouest',open: false,
    ground: ['#5a4a1c', '#b08d3a'], skyTop: '#3b2a10', skyBot: '#e8b75a', fog: '#c79a45', fogD: 0.0026, sun: '#ffd27a',
    tagline: 'Le temps avance, ralentit, rembobine.' },
  { id: 'western',  name: 'Poussière-sur-Rail',  dir: 'Ouest',     open: true,
    ground: ['#b5532c', '#e0a060'], skyTop: '#2e6fb3', skyBot: '#f3c48a', fog: '#e8b98a', fogD: 0.0016, sun: '#fff0d0',
    tagline: 'À midi pile, tout le monde se met en duel.' },
  { id: 'gelure',   name: 'Gelure',              dir: 'Sud-Ouest', open: true,
    ground: ['#cfe8f5', '#ffffff'], skyTop: '#5d8fb8', skyBot: '#e8f6ff', fog: '#dcefff', fogD: 0.0030, sun: '#e9f6ff',
    tagline: 'La voie traverse un tsunami gelé.' },
  { id: 'fonderie', name: 'Fonderie-Rêve',       dir: 'Sud',       open: false,
    ground: ['#a0461a', '#f0a040'], skyTop: '#6b2008', skyBot: '#ffb347', fog: '#ff9a4a', fogD: 0.0028, sun: '#ffcf8a',
    tagline: 'Le jour tout fond, la nuit tout se refige autrement.' },
  { id: 'entrailles', name: 'Les Entrailles',    dir: 'Sud-Est',   open: false,
    ground: ['#2b1c33', '#5a3a6b'], skyTop: '#1a0f22', skyBot: '#7a3fa0', fog: '#5b2d7a', fogD: 0.0045, sun: '#d08cff',
    tagline: 'L\'air est toxique. On passe dessous.' },
];

export const HUB_RADIUS = 70;
export const SECTOR = Math.PI / 4;

for (const b of BIOMES) {
  b.c = {
    g0: new THREE.Color(b.ground[0]), g1: new THREE.Color(b.ground[1]),
    skyTop: new THREE.Color(b.skyTop), skyBot: new THREE.Color(b.skyBot),
    fog: new THREE.Color(b.fog), sun: new THREE.Color(b.sun),
  };
}
const HUB_C = {
  skyTop: new THREE.Color('#1d2b4a'), skyBot: new THREE.Color('#e9c79a'),
  fog: new THREE.Color('#c9b08a'), sun: new THREE.Color('#ffe2b0'), fogD: 0.0018,
};

export function angleOf(x, z) { let a = Math.atan2(-z, x); if (a < 0) a += Math.PI * 2; return a; }
export function sectorIndex(x, z) { return Math.round(angleOf(x, z) / SECTOR) % 8; }

// Poids des biomes (mélange doux aux frontières) + poids du hub.
export function biomeWeights(x, z) {
  const a = angleOf(x, z) / SECTOR;
  const i0 = Math.floor(a) % 8, i1 = (i0 + 1) % 8;
  let t = a - Math.floor(a);
  t = Math.min(1, Math.max(0, (t - 0.35) / 0.3));
  t = t * t * (3 - 2 * t);
  const r = Math.hypot(x, z);
  const hub = 1 - Math.min(1, Math.max(0, (r - HUB_RADIUS) / 90));
  return { i0, i1, t, hub };
}

const tmp = new THREE.Color();
export function ambianceAt(x, z, out) {
  const { i0, i1, t, hub } = biomeWeights(x, z);
  const A = BIOMES[i0].c, B = BIOMES[i1].c;
  for (const k of ['skyTop', 'skyBot', 'fog', 'sun']) {
    out[k].copy(A[k]).lerp(B[k], t);
    out[k].lerp(HUB_C[k], hub * 0.85);
  }
  const fd = BIOMES[i0].fogD * (1 - t) + BIOMES[i1].fogD * t;
  out.fogD = fd * (1 - hub) + HUB_C.fogD * hub;
  out.biome = t < 0.5 ? i0 : i1;
  out.hub = hub;
  return out;
}

export function groundColor(x, z, n, out = tmp) {
  const { i0, i1, t, hub } = biomeWeights(x, z);
  const A = BIOMES[i0].c, B = BIOMES[i1].c;
  const k = n * 0.5 + 0.5;
  out.copy(A.g0).lerp(A.g1, k);
  const c2 = new THREE.Color().copy(B.g0).lerp(B.g1, k);
  out.lerp(c2, t);
  out.lerp(new THREE.Color('#8c7a63'), hub * 0.9);
  return out;
}
