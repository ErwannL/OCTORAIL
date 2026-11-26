// Règles locales des capacités : certains endroits empêchent sprint / saut, avec une raison qui a du sens dans le monde.
// Pensé pour s'étendre aux mondes suivants (Archipel : gravité faible, Entrailles : air toxique…).
import { sectorIndex } from '../world/biomes.js';

export function zoneRules({ x, z, temp, inTunnel, nearTown, inHub }) {
  const r = {};
  if (inHub) return r;
  const sec = sectorIndex(x, z), R = Math.hypot(x, z);
  if (inTunnel) r.jump = 'Le plafond de glace est trop bas : impossible de sauter dans le tunnel.';
  if (sec === 5 && R > 140) r.sprint = 'Le froid te coupe le souffle : impossible de sprinter en Gelure.';
  if (temp < 35) r.sprint = 'Tu grelottes trop pour sprinter. Réchauffe-toi près de la locomotive.';
  if (nearTown) r.spring = 'Arrêté du Shérif n°7 : les sauts à ressort sont interdits en ville.';
  // mondes à venir
  if (sec === 2 && R > 230) { r.jumpMul = 1.8; r.label = 'Gravité faible'; }
  if (sec === 7 && R > 230) r.sprint = 'L\'air toxique te brûle les poumons : pas de sprint ici.';
  if (sec === 3 && R > 230) r.spring = 'Le temps ralentit tes ressorts : ils refusent de se détendre.';
  return r;
}
