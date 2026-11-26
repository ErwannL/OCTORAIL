// Réglages joueur (persistés localement)
export const ACTIONS = [
  ['forward', 'Avancer / régulateur +'], ['back', 'Reculer / régulateur −'], ['left', 'Gauche / aiguillage à gauche'], ['right', 'Droite / aiguillage à droite'],
  ['jump', 'Sauter / frein'], ['run', 'Courir'], ['interact', 'Interagir / monter-descendre'], ['action', 'Pomper · pelleter · miner · fondre'],
  ['whistle', 'Sifflet'], ['map', 'Plan du réseau'], ['view', 'Vue 1re / 3e personne'], ['hints', 'Afficher / masquer les touches'], ['pause', 'Menu'],
];
export const DEFAULT = {
  master: 0.8, music: 0.6, sfx: 0.9, ambience: 0.7,
  quality: 'auto', fov: 62, bloom: true, shadows: true, shake: true,
  sens: 0.6, smooth: true, hints: true, fp: false, invertY: false, compass: true,
  keys: { forward: ['KeyW', 'KeyZ'], back: ['KeyS'], left: ['KeyA', 'KeyQ'], right: ['KeyD'], jump: ['Space'], run: ['ShiftLeft'], interact: ['KeyE'], action: ['KeyF'], whistle: ['KeyH'], map: ['KeyM'], view: ['KeyV'], hints: ['KeyK'], pause: ['Escape', 'KeyP'] },
};
const KEY = 'octorail-settings-v2';
export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch {}
  try { const q = localStorage.getItem('octorail-quality'); if (q && !s.quality) s.quality = q; } catch {}
  return { ...DEFAULT, ...s, keys: { ...DEFAULT.keys, ...(s.keys || {}) } };
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); localStorage.setItem('octorail-quality', s.quality); } catch {} }
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return ({ Space: 'Espace', ShiftLeft: 'Maj', ShiftRight: 'Maj D', Escape: 'Échap', ControlLeft: 'Ctrl', Tab: 'Tab', Enter: 'Entrée', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Mouse0: 'Clic G', Mouse2: 'Clic D' })[code] || code;
}
// Touche(s) réellement assignée(s) à une action, pour l'affichage (HUD, prompts, aide)
export function actionLabel(keys, act, all = false) {
  const l = (keys?.[act] || []).filter(Boolean).map(keyLabel);
  return (all ? [...new Set(l)].join('/') : l[0]) || '—';
}
