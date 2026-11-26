// Progression partagée (sauvegarde locale + synchro salon)
export const SHOP = [
  { id: 'vapeur', icon: '🚂', name: 'Locomotive à vapeur « Vieille-Bouilloire »', desc: '26 m/s. Il faut la nourrir : charbon + eau. Fini de pomper !', price: 120 },
  { id: 'chalumeau', icon: '🔥', name: 'Chalumeau des Bâtisseurs', desc: 'Fait fondre la glace. Maintenir [F].', price: 60, needs: 'vapeur' },
  { id: 'vitrine', icon: '🫙', name: 'Wagon-vitrine', desc: 'Transporte un robot-gardien en sécurité.', price: 80, needs: 'vapeur', wagon: true },
  { id: 'stockage', icon: '📦', name: 'Wagon-stockage', desc: 'Les ressources ramassées près du train vont dedans (+12 places).', price: 40, needs: 'vapeur', wagon: true },
  { id: 'doublure', icon: '🧥', name: 'Doublure isotherme', desc: 'Tenue : tu gèles 3× moins vite en Gelure.', price: 50 },
  { id: 'sac', icon: '🎒', name: 'Grand sac', desc: 'Sac : 4 → 8 emplacements.', price: 35 },
  { id: 'convoyeur', icon: '⚙️', name: 'Convoyeur automatique', desc: 'Le Moyeu remplit charbon + eau tout seul quand ton train est à quai.', price: 90, needs: 'vapeur' },
  { id: 'dortoir', icon: '🛏️', name: 'Wagon-dortoir', desc: 'Chauffé : tu te réchauffes à côté. Point de réapparition.', price: 60, needs: 'vapeur', wagon: true },
];

export const STAGES = [
  { id: 'wake', text: 'Écoute OCTAVE, l\'intelligence du Moyeu.' },
  { id: 'gold', text: 'Gagne <b>120 crédits</b> pour une vraie locomotive.<small>Prends la draisine au quai <b>Ouest</b>, attrape des pépites d\'<b>Or-moteur</b> (elles fuient !), revends-les au <b>Comptoir</b> du Moyeu.</small>' },
  { id: 'buy', text: 'Achète la <b>locomotive à vapeur</b> au Comptoir du Moyeu.' },
  { id: 'fuel', text: 'Fais le plein : <b>charbon</b> (Charbonnière) et <b>eau</b> (Château d\'eau), puis roule vers l\'Ouest jusqu\'à la ville de <b>Poussière-sur-Rail</b>.<small>En cabine : [F] pour pelleter, la pression fait avancer.</small>' },
  { id: 'find', text: 'Le Shérif-7 a disparu vers le froid. Trouve-le en <b>Gelure</b> (Sud-Ouest).<small>Aux aiguillages, [A]/[D] pour bifurquer. La voie traverse le tsunami gelé.</small>' },
  { id: 'gear', text: 'Il te faut un <b>chalumeau</b> et un <b>wagon-vitrine</b> (Comptoir du Moyeu), puis retourne au bloc de glace.' },
  { id: 'melt', text: 'Fais fondre la glace : maintiens <b>[F]</b> près du bloc. Gare ton train à côté.' },
  { id: 'carry', text: 'Ramène <b>SHÉRIF-7</b> chez lui : le piédestal de <b>Poussière-sur-Rail</b>, au bout de la voie Ouest.' },
  { id: 'done', text: '1 gardien sur 8 est rentré. Explore, collectionne les <b>trouvailles</b> et récolte la <b>glace-mémoire</b>.<small>Les 6 autres mondes se rallumeront dans les prochaines versions…</small>' },
];

const KEY = 'octorail-save-v1';
export function defaultState() {
  return { credits: 0, owned: {}, stage: 0, sheriff: 'ice', carrier: null, finds: [], nuggets: [], crystals: [], memories: 0, introDone: false };
}
export function loadState() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') return { ...defaultState(), ...s }; } catch {}
  return defaultState();
}
export function saveState(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }
export function clearState() { try { localStorage.removeItem(KEY); } catch {} }
