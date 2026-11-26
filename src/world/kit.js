import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Matériaux partagés (moins de programmes GPU, moins de changements d'état)
const CACHE = new Map();
export function mat(color, o = {}) {
  const key = color + JSON.stringify(o);
  if (!CACHE.has(key)) CACHE.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0, ...o }));
  return CACHE.get(key);
}
export const MAT = {
  steel: () => mat('#2b2d31', { metalness: 0.75, roughness: 0.38 }),
  iron: () => mat('#1a1b1e', { metalness: 0.6, roughness: 0.5 }),
  brass: () => mat('#d2a24c', { metalness: 0.9, roughness: 0.28 }),
  copper: () => mat('#b8643a', { metalness: 0.85, roughness: 0.32 }),
  wood: () => mat('#7a4c2a', { roughness: 0.85 }),
  woodDark: () => mat('#4e2f19', { roughness: 0.9 }),
  red: () => mat('#9c1f1f', { roughness: 0.5 }),
  glass: () => mat('#1d2a33', { metalness: 0.2, roughness: 0.08, emissive: '#3b5566', emissiveIntensity: 0.25 }),
  coal: () => mat('#141414', { roughness: 1, flatShading: true }),
};
export function glow(color, i = 2) { return mat('#000000', { emissive: color, emissiveIntensity: i }); }

// Assemble des pièces puis fusionne par matériau => 1 draw call par matériau
export class Kit {
  constructor() { this.parts = new Map(); this.m = new THREE.Matrix4(); }
  add(geo, material, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    this.m.compose(new THREE.Vector3(...p), new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)), new THREE.Vector3(...s));
    g.applyMatrix4(this.m);
    if (!this.parts.has(material)) this.parts.set(material, []);
    this.parts.get(material).push(g);
    return this;
  }
  build({ shadow = true, receive = true } = {}) {
    const grp = new THREE.Group();
    for (const [material, geos] of this.parts) {
      const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
      mesh.castShadow = shadow && !material.transparent; mesh.receiveShadow = receive;
      grp.add(mesh);
    }
    return grp;
  }
  geometry() { // tout en une géométrie (pour InstancedMesh)
    const all = []; for (const g of this.parts.values()) all.push(...g); return mergeGeometries(all, false);
  }
}

export const G = {
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  rbox: (w, h, d, r = 0.08, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2.01, h / 2.01, d / 2.01)),
  cyl: (rt, rb, h, seg = 20, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open),
  sph: (r, ws = 16, hs = 12, ...a) => new THREE.SphereGeometry(r, ws, hs, ...a),
  tor: (r, t, rs = 8, ts = 24, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc),
  cap: (r, l, cs = 6, rs = 12) => new THREE.CapsuleGeometry(r, l, cs, rs),
  cone: (r, h, seg = 16) => new THREE.ConeGeometry(r, h, seg),
  lathe: (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg),
  tube: (pts, r, seg = 24, rs = 8) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p))), seg, r, rs, false),
};
