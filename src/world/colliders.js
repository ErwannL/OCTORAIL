import * as THREE from 'three';
// Collisions simples (cercles et boîtes orientées) indexées par grille. Partagé par tout le monde.
//  - circle / box : obstacles solides. Un obstacle est ignoré par le joueur dont les pieds sont au-dessus de `top - 0.3`
//    (on peut sauter par-dessus les petits obstacles et marcher sur ce qui est bas).
//  - floorBox / floorCircle : surfaces praticables (quais, socles, estrades). Le joueur MONTE dessus si la marche
//    fait <= COLLIDERS.stepMax (0,95 m), sinon c'est un mur (voir Player.updateFoot).
//  - dynamic : fournisseurs de corps mobiles (trains), recalculés à chaque appel de resolve.
//  - Flag `cam` : la caméra (blocked(..., true)) ignore les colliders avec cam === false. Par défaut, tout
//    cercle de rayon < 1,5 m a cam:false (poteaux, cactus, arbres fins, lampadaires…) pour ne pas faire sauter la caméra.
const CELL = 16, MARGIN = 1.2; // marge : un collider déborde dans les cellules voisines pour que le joueur (r~0,4) ne le rate pas
class Colliders {
  constructor() { this.grid = new Map(); this.list = []; this.dynamic = []; this.stepMax = 0.95; this._dyn = []; }
  _ins(c, minX, minZ, maxX, maxZ) {
    minX -= MARGIN; minZ -= MARGIN; maxX += MARGIN; maxZ += MARGIN;
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++) for (let j = Math.floor(minZ / CELL); j <= Math.floor(maxZ / CELL); j++) {
      const k = i + ',' + j; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(c);
    }
    this.list.push(c);
  }
  circle(x, z, r, top = 99, bottom = -99, cam = r >= 1.5) { const c = { t: 0, x, z, r, top, bottom, cam }; this._ins(c, x - r, z - r, x + r, z + r); return c; }
  // boîte : centre, demi-tailles (hx le long de l'axe local X, hz le long de Z), angle (rotation.y)
  box(x, z, hx, hz, ang, top = 99, bottom = -99, cam = true) { const R = Math.hypot(hx, hz); const c = { t: 1, x, z, hx, hz, c: Math.cos(ang), s: Math.sin(ang), top, bottom, cam }; this._ins(c, x - R, z - R, x + R, z + R); return c; }
  // surfaces praticables (hauteur absolue `top`)
  floorBox(x, z, hx, hz, ang, top) { const c = this.box(x, z, hx, hz, ang, top, -99, false); c.fl = true; return c; }
  floorCircle(x, z, r, top) { const c = this.circle(x, z, r, top, -99, false); c.fl = true; return c; }
  // volumes « caméra seulement » (couronnes d'arbres, auvents, toits, feuillages) : invisibles pour le joueur,
  // la caméra les évite (elle ne se place jamais dedans). bottom/top = hauteurs ABSOLUES du volume.
  camCircle(x, z, r, bottom, top) { const c = this.circle(x, z, r, top, bottom, true); c.co = true; return c; }
  camBox(x, z, hx, hz, ang, bottom, top) { const c = this.box(x, z, hx, hz, ang, top, bottom, true); c.co = true; return c; }
  // Collision automatique d'un objet 3D : balaie ses sommets entre y0 et y1 au-dessus du sol (fn ground(x,z)), regroupe en cellules
  // et pose un petit cercle (cam:false) sur chaque colonne verticale solide (poteaux, tonneaux, bancs, rambardes…) pas déjà couverte.
  autoSolid(obj, ground, { y0 = 0.4, y1 = 2.2, cell = 0.5, minVerts = 5, minSpan = 0.7, max = 200 } = {}) {
    obj.updateMatrixWorld(true);
    const cells = new Map(), v = { x: 0, y: 0, z: 0 }, e = [];
    obj.traverse(o => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const pos = o.geometry.attributes.position, m = o.matrixWorld.elements;
      for (let i = 0; i < pos.count; i++) {
        const X = pos.getX(i), Y = pos.getY(i), Z = pos.getZ(i);
        v.x = m[0] * X + m[4] * Y + m[8] * Z + m[12]; v.y = m[1] * X + m[5] * Y + m[9] * Z + m[13]; v.z = m[2] * X + m[6] * Y + m[10] * Z + m[14];
        const h = v.y - Math.max(ground(v.x, v.z), this.floorAt(v.x, v.z)); if (h < y0 || h > y1) continue;
        const k = Math.floor(v.x / cell) + ',' + Math.floor(v.z / cell); let c = cells.get(k);
        if (!c) cells.set(k, c = { n: 0, lo: 9, hi: -9, x: 0, z: 0 });
        c.n++; c.x += v.x; c.z += v.z; if (h < c.lo) c.lo = h; if (h > c.hi) c.hi = h;
      }
    });
    let n = 0;
    for (const c of cells.values()) {
      if (c.n < minVerts || c.hi - c.lo < minSpan) continue;
      const x = c.x / c.n, z = c.z / c.n; let cov = false;
      for (const k of this.near(x, z)) if (!k.fl && !k.co && this._inside(k, x, z, 0.1)) { cov = true; break; }
      if (cov || n >= max) continue;
      this.circle(x, z, cell * 0.65, 99, -99, false); n++;
    }
    return n;
  }
  near(x, z) { return this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []; }
  _inside(c, x, z, m = 0) {
    if (c.t === 0) return Math.hypot(x - c.x, z - c.z) < c.r + m;
    const dx = x - c.x, dz = z - c.z; return Math.abs(dx * c.c - dz * c.s) < c.hx + m && Math.abs(dx * c.s + dz * c.c) < c.hz + m;
  }
  // hauteur de la surface praticable la plus haute en (x,z) (-Infinity s'il n'y en a pas)
  floorAt(x, z) { let h = -Infinity; for (const c of this.near(x, z)) if (c.fl && c.top > h && this._inside(c, x, z)) h = c.top; return h; }

  // corps mobiles (trains) : boîtes orientées recalculées à chaque appel
  _bodies() { const out = this._dyn; out.length = 0; for (const f of this.dynamic) f(out); return out; }

  _push(pos, c, r) {
    if (c.t === 0) {
      const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m) { if (d > 1e-4) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; } else pos.x = c.x + m; return true; }
    } else {
      // repère local de la boîte (rotation.y three : x' = x cos + z sin ; z' = -x sin + z cos)
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
      const px = c.hx + r - Math.abs(lx), pz = c.hz + r - Math.abs(lz);
      if (px > 0 && pz > 0) {
        let nx = lx, nz = lz;
        if (px < pz) nx = Math.sign(lx || 1) * (c.hx + r); else nz = Math.sign(lz || 1) * (c.hz + r);
        pos.x = c.x + nx * c.c + nz * c.s; pos.z = c.z - nx * c.s + nz * c.c; return true;
      }
    }
    return false;
  }

  // Repousse un cercle (rayon r) à la hauteur y hors des obstacles. Modifie pos. Renvoie true si encore enfoncé.
  resolve(pos, r = 0.4, y = pos.y) {
    const dyn = this._bodies(); let hit = false;
    for (let pass = 0; pass < 4; pass++) {
      hit = false;
      for (const c of this.near(pos.x, pos.z)) {
        if (c.fl || c.co || y > c.top - 0.3 || y + 1.7 < c.bottom) continue;
        if (this._push(pos, c, r)) hit = true;
      }
      for (const c of dyn) {
        if (y > c.top - 0.3 || Math.abs(pos.x - c.x) > c.R + r || Math.abs(pos.z - c.z) > c.R + r) continue;
        if (this._push(pos, c, r)) hit = true;
      }
      if (!hit) break;
    }
    return hit;
  }

  // Anti-blocage : si le joueur est resté coincé (poussées contradictoires), cherche le point libre le plus proche.
  unstick(pos, r = 0.42, y = pos.y) {
    const free = (x, z) => { const p = { x, z }; return !this.resolveProbe(p, r, y); };
    if (free(pos.x, pos.z)) return false;
    for (let rad = 0.6; rad <= 7; rad += 0.6) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, x = pos.x + Math.cos(a) * rad, z = pos.z + Math.sin(a) * rad;
      if (free(x, z)) { pos.x = x; pos.z = z; return true; }
    }
    return false;
  }
  // vrai si (p.x,p.z) chevauche encore un obstacle (sans le déplacer)
  resolveProbe(p, r, y) {
    for (const c of this.near(p.x, p.z)) { if (c.fl || c.co || y > c.top - 0.3 || y + 1.7 < c.bottom) continue; if (this._inside(c, p.x, p.z, r - 0.02)) return true; }
    for (const c of this._bodies()) { if (y > c.top - 0.3) continue; if (this._inside(c, p.x, p.z, r - 0.02)) return true; }
    return false;
  }

  // forCam : true pour la caméra (ignore les colliders cam:false et les trains)
  blocked(x, y, z, r = 0.25, forCam = false) {
    for (const c of this.near(x, z)) {
      if (c.fl || y > c.top || y < c.bottom) continue;
      if (c.co && !forCam) continue;
      if (forCam && c.cam === false) continue;
      if (this._inside(c, x, z, r)) return true;
    }
    return false;
  }
}
export const COLLIDERS = new Colliders();

// Corps de train (loco + wagons) -> boîtes dynamiques. `tr` = Train (tr.loco, tr.wagons[].mesh).
export function trainBodies(tr, out) {
  if (!tr || !tr.loco || !tr.loco.parent) return;
  const add = (m) => {
    const q = m.quaternion, fx = 2 * (q.x * q.z + q.w * q.y), fz = 1 - 2 * (q.x * q.x + q.y * q.y);
    const yaw = Math.atan2(fx, fz), L = (m.userData.length || 6) / 2 - 0.15, hx = 1.45;
    out.push({ m, t: 1, x: m.position.x, z: m.position.z, hx, hz: L, c: Math.cos(yaw), s: Math.sin(yaw), top: m.position.y + 1.25, bottom: -99, R: Math.hypot(hx, L) });
  };
  add(tr.loco); for (const w of tr.wagons) add(w.mesh);
}

// Carte des hauteurs réelle d'un véhicule (repère local), calculée une fois par rayons verticaux sur sa géométrie.
const _rc = new THREE.Raycaster(), _o = new THREE.Vector3(), _d = new THREE.Vector3(0, -1, 0);
const HCELL = 0.2;
function heightMap(m) {
  if (m.userData._hm) return m.userData._hm;
  m.updateMatrixWorld(true);
  const L = (m.userData.length || 6) / 2 + 0.6, W = 1.8, nx = Math.ceil(2 * W / HCELL) + 1, nz = Math.ceil(2 * L / HCELL) + 1;
  const h = new Float32Array(nx * nz), targets = [];
  m.traverse(o => { if ((o.isMesh || o.isSkinnedMesh) && o.visible && !o.userData.noCollide && !(o.material && o.material.transparent && o.material.opacity < 0.3)) targets.push(o); });
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    _o.set(-W + i * HCELL, 12, -L + j * HCELL); m.localToWorld(_o);
    _rc.set(_o, _d); _rc.far = 14;
    const hit = _rc.intersectObjects(targets, false)[0];
    h[i * nz + j] = hit ? Math.max(0, m.worldToLocal(hit.point.clone()).y) : 0;
  }
  return (m.userData._hm = { h, nx, nz, W, L });
}
// hauteur (locale, au-dessus de l'origine du véhicule) du point monde (x,z), en prenant le max dans un rayon r
export function vehicleTop(m, x, z, r = 0) {
  const H = heightMap(m), l = m.worldToLocal(new THREE.Vector3(x, m.position.y, z));
  const i0 = Math.floor((l.x - r + H.W) / HCELL), i1 = Math.ceil((l.x + r + H.W) / HCELL), j0 = Math.floor((l.z - r + H.L) / HCELL), j1 = Math.ceil((l.z + r + H.L) / HCELL);
  let top = -1;
  for (let i = Math.max(0, i0); i <= Math.min(H.nx - 1, i1); i++) for (let j = Math.max(0, j0); j <= Math.min(H.nz - 1, j1); j++) { const v = H.h[i * H.nz + j]; if (v > top) top = v; }
  return top > 0.05 ? top : null;
}
