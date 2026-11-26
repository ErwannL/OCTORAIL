// Réglages joueur (persistés localement)
export const ACTIONS = [
  ['forward', 'Avancer / régulateur +'], ['back', 'Reculer / régulateur −'], ['left', 'Gauche / aiguillage bifurcation'], ['right', 'Droite / aiguillage tout droit'],
  ['jump', 'Sauter / frein'], ['run', 'Courir'], ['interact', 'Interagir / monter-descendre'], ['action', 'Pomper · pelleter · miner · fondre'],
  ['whistle', 'Sifflet'], ['map', 'Plan du réseau'], ['pause', 'Menu'],
];
export const DEFAULT = {
  master: 0.8, music: 0.6, sfx: 0.9, ambience: 0.7,
  quality: 'auto', fov: 62, bloom: true, shadows: true, shake: true,
  sens: 0.6, invertY: false, compass: true,
  keys: { forward: ['KeyW', 'KeyZ'], back: ['KeyS'], left: ['KeyA', 'KeyQ'], right: ['KeyD'], jump: ['Space'], run: ['ShiftLeft'], interact: ['KeyE'], action: ['KeyF'], whistle: ['KeyH'], map: ['KeyM'], pause: ['Escape', 'KeyP'] },
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
