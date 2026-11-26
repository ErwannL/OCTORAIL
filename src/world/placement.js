import { COLLIDERS } from './colliders.js';

// Aides de placement du décor : refuser les pentes (objet à moitié enterré / en porte-à-faux) et les chevauchements
// avec les gros volumes déjà posés (rochers, buttes, arbres : tous enregistrent un COLLIDERS.circle).
// Écart de hauteur (max - min) du terrain sous l'emprise : centre + 4 points sur le cercle de rayon r.
export function heightSpread(terrain, x, z, r) {
  let lo = Infinity, hi = -Infinity;
  const f = (px, pz) => { const h = terrain.heightAt(px, pz); if (h < lo) lo = h; if (h > hi) hi = h; };
  f(x, z); f(x + r, z); f(x - r, z); f(x, z + r); f(x, z - r);
  return hi - lo;
}
// vrai si le terrain est assez plat sous une emprise de rayon r (tolérance : maxDiff, ~0,8 m pour un petit objet)
export function flatEnough(terrain, x, z, r, maxDiff = 0.8) { return heightSpread(terrain, x, z, Math.max(0.4, r)) <= maxDiff; }
// vrai si l'emprise (rayon r) chevauche un collider existant (hors surfaces praticables)
export function overlapsSolid(terrain, x, z, r) { return COLLIDERS.blocked(x, terrain.heightAt(x, z) + 0.3, z, r); }
// test complet : plat + libre
export function goodSpot(terrain, x, z, r, maxDiff = 0.8) { return flatEnough(terrain, x, z, r, maxDiff) && !overlapsSolid(terrain, x, z, r); }
