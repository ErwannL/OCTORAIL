// Collisions simples (cercles et boîtes orientées) indexées par grille. Partagé par tout le monde.
const CELL = 16;
class Colliders {
  constructor() { this.grid = new Map(); this.list = []; }
  _ins(c, minX, minZ, maxX, maxZ) {
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++) for (let j = Math.floor(minZ / CELL); j <= Math.floor(maxZ / CELL); j++) {
      const k = i + ',' + j; if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(c);
    }
    this.list.push(c);
  }
  circle(x, z, r, top = 99, bottom = -99) { const c = { t: 0, x, z, r, top, bottom }; this._ins(c, x - r, z - r, x + r, z + r); return c; }
  // boîte : centre, demi-tailles (hx le long de l'axe local X, hz le long de Z), angle (rotation.y)
  box(x, z, hx, hz, ang, top = 99, bottom = -99) { const R = Math.hypot(hx, hz); const c = { t: 1, x, z, hx, hz, c: Math.cos(ang), s: Math.sin(ang), top, bottom }; this._ins(c, x - R, z - R, x + R, z + R); return c; }
  near(x, z) { return this.grid.get(Math.floor(x / CELL) + ',' + Math.floor(z / CELL)) || []; }

  // Repousse un cercle (rayon r) à la hauteur y hors des obstacles. Modifie pos.
  resolve(pos, r = 0.4, y = pos.y) {
    for (let pass = 0; pass < 2; pass++) for (const c of this.near(pos.x, pos.z)) {
      if (y > c.top - 0.3 || y + 1.7 < c.bottom) continue;
      if (c.t === 0) {
        const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
        if (d < m && d > 1e-4) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; }
      } else {
        // repère local de la boîte (rotation.y three : x' = x cos + z sin ; z' = -x sin + z cos)
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
        const px = c.hx + r - Math.abs(lx), pz = c.hz + r - Math.abs(lz);
        if (px > 0 && pz > 0) {
          let nx = lx, nz = lz;
          if (px < pz) nx = Math.sign(lx || 1) * (c.hx + r); else nz = Math.sign(lz || 1) * (c.hz + r);
          pos.x = c.x + nx * c.c + nz * c.s; pos.z = c.z - nx * c.s + nz * c.c;
        }
      }
    }
    return pos;
  }
  blocked(x, y, z, r = 0.25) {
    for (const c of this.near(x, z)) {
      if (y > c.top || y < c.bottom) continue;
      if (c.t === 0) { if (Math.hypot(x - c.x, z - c.z) < c.r + r) return true; }
      else { const dx = x - c.x, dz = z - c.z; const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c; if (Math.abs(lx) < c.hx + r && Math.abs(lz) < c.hz + r) return true; }
    }
    return false;
  }
}
export const COLLIDERS = new Colliders();
