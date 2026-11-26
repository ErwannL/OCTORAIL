import * as THREE from 'three';

// Optimisation du monde statique : découpe les InstancedMesh géants en chunks spatiaux
// (frustum culling efficace, ombres limitées au voisinage) et masque par distance
// tout ce que le brouillard cache déjà. Le masquage passe par les calques (layers) pour ne pas
// interférer avec les `visible` gérés par le jeu.
const SHOW = 1, HIDE = 2;
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();

// distance max d'affichage selon la taille de l'objet (m) : les petits objets disparaissent plus tôt
export function rangeFor(r, D) {
  const cap = r < 1.2 ? 120 : r < 2.5 ? 240 : r < 5 ? 420 : r < 12 ? 700 : 1e9;
  return Math.min(D, cap);
}

export class WorldCuller {
  constructor(scene) { this.scene = scene; this.items = []; this.tick = 0; this.mul = 1; }

  // 1) découpe les InstancedMesh volumineux
  chunk(minCount = 24) {
    const list = [];
    this.scene.traverse(o => { if (o.isInstancedMesh && o.count >= minCount && !o.userData.noChunk) list.push(o); });
    for (const im of list) {
      const geo = im.geometry; geo.computeBoundingSphere();
      const gr = geo.boundingSphere.radius;
      // taille typique (échelle max)
      let smax = 0; const n = im.count;
      for (let i = 0; i < n; i++) { im.getMatrixAt(i, _m); _m.decompose(_p, _q, _s); smax = Math.max(smax, _s.x, _s.y, _s.z); }
      const objR = gr * Math.min(smax, 3.5);
      const cell = objR < 1.5 ? 90 : objR < 6 ? 180 : 260;
      const buckets = new Map();
      for (let i = 0; i < n; i++) {
        im.getMatrixAt(i, _m); _p.setFromMatrixPosition(_m);
        const k = Math.floor(_p.x / cell) + ',' + Math.floor(_p.z / cell);
        let b = buckets.get(k); if (!b) buckets.set(k, b = []); b.push(i);
      }
      const parent = im.parent;
      for (const idx of buckets.values()) {
        const c = new THREE.InstancedMesh(geo, im.material, idx.length);
        idx.forEach((src, j) => { im.getMatrixAt(src, _m); c.setMatrixAt(j, _m); });
        c.castShadow = im.castShadow; c.receiveShadow = im.receiveShadow; c.renderOrder = im.renderOrder;
        c.instanceMatrix.needsUpdate = true; c.computeBoundingSphere();
        c.userData.noChunk = true;
        parent.add(c);
      }
      parent.remove(im); im.dispose?.();
    }
    return this;
  }

  // 2) enregistre les objets statiques pour le masquage par distance
  register() {
    this.scene.updateMatrixWorld(true);
    this.items.length = 0;
    this.scene.traverse(o => {
      if ((!o.isMesh && !o.isLine) || o.userData.noCull) return;
      const g = o.geometry; if (!g) return;
      if (!g.boundingSphere) g.computeBoundingSphere();
      const bs = o.isInstancedMesh ? (o.boundingSphere || (o.computeBoundingSphere(), o.boundingSphere)) : g.boundingSphere;
      if (!bs || !isFinite(bs.radius)) return;
      let r, unitR = bs.radius;
      if (o.isInstancedMesh) { // taille d'une instance
        unitR = g.boundingSphere.radius; o.getMatrixAt(0, _m); _m.decompose(_p, _q, _s); unitR *= Math.max(_s.x, _s.y, _s.z);
        r = bs.radius;
      } else { o.matrixWorld.decompose(_p, _q, _s); r = bs.radius * Math.max(_s.x, _s.y, _s.z); unitR = r; }
      if (r > 450) return; // trop grand pour être masqué (voies fusionnées, ciel…)
      this.items.push({ o, c: bs.center.clone(), r, unitR, inst: o.isInstancedMesh, matIsId: false });
    });
    return this;
  }

  // D : distance de visibilité (brouillard) ; appelé chaque frame, travaille 1 frame sur 2
  update(cam, D, force = false) {
    if (!force && (this.tick++ & 1)) return;
    const cx = cam.x, cy = cam.y, cz = cam.z, mul = this.mul;
    for (const it of this.items) {
      const o = it.o, e = o.matrixWorld.elements;
      _p.copy(it.c).applyMatrix4(o.matrixWorld);
      const dx = _p.x - cx, dy = _p.y - cy, dz = _p.z - cz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const range = rangeFor(it.unitR, D) * mul;
      const m = d - it.r > range ? HIDE : SHOW;
      if (o.layers.mask !== m) o.layers.mask = m;
      void e;
    }
  }
}
