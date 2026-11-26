import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { EnvLighting, GradeShader, buildGrass, buildBirds, buildFlags, buildLamps } from './world/ambience.js';

import { BIOMES, ambianceAt, sectorIndex } from './world/biomes.js';
import { Network } from './world/network.js';
import { Terrain, rawHeight } from './world/terrain.js';
import { buildTracks, buildSignals } from './world/tracks.js';
import { buildSky } from './world/sky.js';
import { buildWestern, buildGelure } from './world/props.js';
import { buildHub } from './world/hub.js';
import { buildTrackside, buildWesternDecor, buildGelureDecor, buildClosedWorlds } from './world/decor.js';
import { Train, WAGON_TYPES } from './game/train.js';
import { Player, buildAvatar } from './game/player.js';
import { Input } from './game/input.js';
import { Particles, Weather } from './game/vfx.js';
import { buildSheriff, buildIceBlock, Nuggets, Crystals, buildFinds } from './game/entities.js';
import { SHOP, STAGES, loadState, saveState, clearState } from './game/state.js';
import { AudioEngine } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { Net } from './net/net.js';
import { loadSettings, saveSettings, ACTIONS, DEFAULT as DEFAULT_SET, keyLabel } from './game/settings.js';
import { Compass, PHENO_INFO } from './ui/compass.js';
import { COLLIDERS, trainBodies } from './world/colliders.js';
import { buildLife } from './world/life.js';
import { WorldCuller } from './world/cull.js';

const DEBUG = new URLSearchParams(location.search).has('debug');
const COLORS = ['#e0703a', '#3aa0e0', '#7ad05a', '#e05ab0', '#e0c03a', '#9a6ae0', '#3ad0c0', '#f0f0f0'];
const TRAIN_TINTS = ['#8b1e1e', '#1e4a8b', '#2a6b2a', '#7a1e6b', '#8b6b1e', '#4a2a7a', '#1e6b6b', '#5a5a5a'];

// ------------------------------------------------------------------ Rendu
const canvas = document.getElementById('c');
// Qualité graphique : auto (résolution dynamique selon les FPS), réglable au titre.
// bas : rendu direct sans post-traitement/ombres/env ; moyen/haut : composer + bloom basse résolution + ombres autour du joueur.
// range = multiplicateur de la distance d'affichage ; grass/weather = densités.
const QUALITY = {
  bas:   { pr: 0.6,  shadow: 0,    bloom: false, env: false, post: false, grass: 0.25, weather: 0.3, range: 0.7 },
  moyen: { pr: 0.85, shadow: 1024, bloom: true,  env: true,  post: true,  grass: 0.6,  weather: 0.6, range: 0.85 },
  haut:  { pr: 1.25, shadow: 2048, bloom: true,  env: true,  post: true,  grass: 1,    weather: 1,   range: 1 },
};
const SET = loadSettings();
let qName = SET.quality || 'auto';
const Q = QUALITY[qName === 'auto' ? 'moyen' : qName];
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
let pixelRatio = Math.min(devicePixelRatio, Q.pr);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = Q.shadow > 0 && SET.shadows; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2('#e8b98a', 0.002);
const camera = new THREE.PerspectiveCamera(SET.fov, innerWidth / innerHeight, 0.3, 1600);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth * 0.4, innerHeight * 0.4), 0.4, 0.45, 0.9);
bloom.enabled = Q.bloom && SET.bloom;
composer.addPass(bloom);
const grade = new ShaderPass(GradeShader); composer.addPass(grade);
composer.addPass(new OutputPass());
const envLight = new EnvLighting(renderer, scene);
const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(pixelRatio); renderer.setSize(innerWidth, innerHeight); composer.setPixelRatio(pixelRatio); composer.setSize(innerWidth, innerHeight); bloom.setSize(innerWidth * pixelRatio * 0.4, innerHeight * pixelRatio * 0.4); };
addEventListener('resize', resize);
// Mode Auto : mesure les FPS par fenêtres de ~0.6 s ; < 40 FPS => on dégrade vite (résolution, puis bloom, ombres, distance) ;
// > 58 FPS durablement => on remonte la résolution doucement. Pas de réactivation des effets (évite l'oscillation).
let perfAcc = 0, perfN = 0, perfWarm = 0, upStreak = 0;
function setShadows(on) {
  if (renderer.shadowMap.enabled === on) return;
  renderer.shadowMap.enabled = on; sun.castShadow = on; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
}
function adaptQuality(dt) {
  if (qName !== 'auto') return;
  perfWarm += dt; if (perfWarm < 2.5) return; // compilation des shaders au démarrage
  perfAcc += dt; perfN++;
  if (perfAcc < 0.6 && !(perfAcc > 0.35 && perfN < 6)) return;
  const fps = perfN / perfAcc; perfAcc = 0; perfN = 0;
  let pr = pixelRatio;
  if (fps < 40) {
    upStreak = 0;
    const big = fps < 28 ? 0.2 : 0.12;
    if (pr > 0.72) pr = Math.max(0.7, pr - big);
    else if (bloom.enabled) bloom.enabled = false;
    else if (renderer.shadowMap.enabled) setShadows(false);
    else if (pr > 0.5) pr = Math.max(0.5, pr - big);
    else if (culler.mul > 0.55) culler.mul -= 0.15;
  } else if (fps > 58 && ++upStreak >= 4) { upStreak = 0; pr = Math.min(Math.min(devicePixelRatio, 1.0), pr + 0.06); }
  if (Math.abs(pr - pixelRatio) > 0.01) { pixelRatio = pr; resize(); }
}

const hemi = new THREE.HemisphereLight('#bfd8ff', '#6b4a2a', Q.env ? 0.6 : 0.95); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff0d0', 2.6);
sun.castShadow = Q.shadow > 0; sun.shadow.mapSize.set(Q.shadow || 512, Q.shadow || 512);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
scene.add(sun, sun.target);
const WHITE = new THREE.Color('#ffffff');
const SUN_DIR = new THREE.Vector3(0.45, 0.75, 0.35).normalize();

// ------------------------------------------------------------------ Monde
const t0 = performance.now();
const net = new Network(7);
net.applyHeights(rawHeight);
const terrain = new Terrain(net);
terrain.build(scene);
buildTracks(scene, net);
const signals = buildSignals(scene, net, BIOMES);
const sky = buildSky(scene);

const interactables = [];
const interact = { add: o => interactables.push(o) };
const hub = buildHub(scene, interact);
const western = buildWestern(scene, terrain, net, interact);
const gelure = buildGelure(scene, terrain, net, interact);
buildClosedWorlds(scene, terrain, net);
buildTrackside(scene, net, terrain);
const westDecor = buildWesternDecor(scene, terrain, net);
const gelDecor = buildGelureDecor(scene, terrain, net);
buildGrass(scene, terrain, net, Q.grass);
const birds = buildBirds(scene, terrain);
const flags = buildFlags(scene);
buildLamps(scene);
const life = buildLife(scene, terrain, net);
const nuggets = new Nuggets(scene, terrain, net, 46);
const crystals = new Crystals(scene, terrain, net, 26);
const finds = buildFinds(scene, terrain, net);
// découpe spatiale des instances + masquage par distance (brouillard) ; voir world/cull.js
const culler = new WorldCuller(scene).chunk().register(); culler.mul = Q.range;
const envUpdate = (a, b, c) => { if (Q.env) envLight.update(a, b, c); };
console.log(`Monde généré en ${Math.round(performance.now() - t0)} ms`);

const smoke = new Particles(scene, 900, { gravity: 1.2, drag: 0.6, grow: 3 });
const sparks = new Particles(scene, 600, { additive: true, gravity: -14, drag: 0.4, grow: 0 });
const steam = new Particles(scene, 400, { gravity: 2, drag: 1.2, grow: 2.5 });
const weather = new Weather(scene); weather.setDensity(Q.weather);

// Shérif-7 dans son bloc de glace
const sheriff = buildSheriff();
const iceBlock = buildIceBlock();
const sheriffSpot = new THREE.Group(); sheriffSpot.position.copy(gelure.iceBlockPos); scene.add(sheriffSpot);
sheriffSpot.add(iceBlock);
scene.add(sheriff);

// ------------------------------------------------------------------ Systèmes
const audio = new AudioEngine();
const ui = new UI(audio);
const input = new Input(canvas);
input.setBindings(SET.keys);
audio.setVolumes(SET);
const compass = new Compass(document.getElementById('compass'));
let pheno = null; // phénomène météo/magnétique en cours
const netc = new Net();
let S = loadState();
if (DEBUG) S.credits = Math.max(S.credits, 2000);

let me = { name: 'Passager', color: COLORS[0], slot: 0 };
let player, train;
const remotes = new Map(); // id -> { avatar, train, state, name, color }
let started = false, cinematic = null, time = 0, lastSync = 0;
let meltProgress = 0, coldFaint = false, questGuard = false, phenoK = 0, lastFog = 1;

// ------------------------------------------------------------------ Écran titre
(function titleScreen() {
  const cbox = document.getElementById('colors');
  COLORS.forEach((c, i) => { const el = document.createElement('i'); el.style.background = c; if (i === 0) el.classList.add('on');
    el.onclick = () => { me.color = c; cbox.querySelectorAll('i').forEach(x => x.classList.remove('on')); el.classList.add('on'); audio.init(); audio.ui(); }; cbox.appendChild(el); });
  try { document.getElementById('name').value = localStorage.getItem('octorail-name') || ''; } catch {}
  const go = async (room) => {
    audio.init(); audio.ui();
    me.name = (document.getElementById('name').value.trim() || 'Passager').slice(0, 14);
    try { localStorage.setItem('octorail-name', me.name); } catch {}
    if (room) {
      ui.toast('Connexion au salon ' + room.toUpperCase() + '…');
      const w = await netc.connect(room, { name: me.name, color: me.color });
      if (w) {
        me.slot = w.slot; if (w.shared) S = { ...S, ...w.shared };
        for (const o of w.others) addRemote(o.id, o);
        ui.toast(`Salon <b>${w.room}</b> · ${w.others.length + 1} joueur(s)`);
      } else ui.toast('Serveur multijoueur introuvable — partie solo.');
    }
    start();
  };
  document.getElementById('play-solo').onclick = () => go(null);
  document.getElementById('play-mp').onclick = () => go(document.getElementById('room').value.trim() || 'OCTAVE');
  const qs = document.getElementById('quality'); qs.value = qName;
  qs.onchange = () => { SET.quality = qs.value; saveSettings(SET); location.reload(); };
  document.getElementById('reset').onclick = () => { clearState(); S = loadState(); ui.toast('Sauvegarde effacée'); };
  document.getElementById('end-continue').onclick = () => { ui.show('endcard', false); input.wantLock = true; };
})();

function start() {
  started = true;
  ui.show('title', false); ui.show('hud', true);
  player = new Player(scene, terrain, me.color);
  const startNode = me.slot % 2 ? 'H5' : 'H4';
  train = new Train(net, scene, { loco: S.owned.vapeur ? 'vapeur' : 'draisine', wagons: wagonList(), tint: TRAIN_TINTS[me.slot % 8], startNode });
  if (S.owned.vapeur) { train.coal = 20; train.water = 60; }
  if (S.owned.sac) player.bagMax = 8;
  if (S.sheriff === 'carried' && S.carrier !== (netc.id ?? 'me') && S.carrier !== 'me' && !remotes.has(S.carrier)) S.carrier = netc.id ?? 'me'; // porteur disparu (rechargement)
  // spawn à côté des capsules
  const pa = me.slot * Math.PI / 4 + Math.PI / 8; player.pos.set(Math.cos(pa) * 11, 0.3, -Math.sin(pa) * 11); camInit = false; // hors des capsules (anneau à 6,6 m), espace dégagé
  player.yaw = Math.PI / 2; // regarde vers l'Ouest (quai de la draisine)
  if (!S.introDone) intro(); else { ui.toast('Bon retour sur Halcyre.', true); ui.objective(STAGES[S.stage].text); }
  refreshFinds(); refreshResources(); placeSheriff();
  input.wantLock = true;
}

function wagonList() {
  const w = [];
  if (S.owned.vapeur) w.push('charbon');
  if (S.owned.vitrine) w.push('vitrine');
  if (S.owned.stockage) w.push('stockage');
  if (S.owned.dortoir) w.push('dortoir');
  return w;
}

// ------------------------------------------------------------------ Multijoueur
function addRemote(id, o) {
  if (remotes.has(id)) return;
  const slot = remotes.size + 1;
  const avatar = buildAvatar(o.color); scene.add(avatar);
  const tr = new Train(net, scene, { remote: true, tint: TRAIN_TINTS[(slot + me.slot) % 8], startNode: 'H4' });
  const tag = makeNameTag(o.name, o.color); avatar.add(tag);
  remotes.set(id, { avatar, train: tr, name: o.name, color: o.color, state: o.state });
  ui.toast(`<b style="color:${o.color}">${o.name}</b> a rejoint Halcyre`);
  updatePlayersList();
}
function makeNameTag(name, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const g = cv.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 8, 256, 48); g.fillStyle = color; g.font = 'bold 34px sans-serif'; g.textAlign = 'center'; g.fillText(name, 128, 44);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false })); s.scale.set(2.4, 0.6, 1); s.position.y = 2.6; return s;
}
function updatePlayersList() { ui.players([{ name: me.name, color: me.color }, ...[...remotes.values()].map(r => ({ name: r.name, color: r.color }))]); }
netc.on('join', m => addRemote(m.id, m));
netc.on('leave', m => { const r = remotes.get(m.id); if (!r) return; scene.remove(r.avatar); r.train.dispose(); remotes.delete(m.id); ui.toast(`${r.name} est parti`); updatePlayersList(); });
netc.on('state', m => { const r = remotes.get(m.id); if (r) r.state = m.s; });
netc.on('shared', m => {
  const prevStage = S.stage; const prevSheriff = S.sheriff;
  S = { ...S, ...m.shared };
  if (S.stage !== prevStage) ui.objective(STAGES[S.stage].text);
  refreshFinds(); refreshResources();
  if (S.sheriff !== prevSheriff) placeSheriff();
  if (S.sheriff === 'home' && prevSheriff !== 'home') deliveryCinematic();
  syncWagons();
});
netc.on('event', m => {
  const r = remotes.get(m.id); if (!r) return;
  if (m.e === 'whistle') audio.whistle(1.2, r.train.head, 0.3);
});
function pushShared() { saveState(S); netc.send({ t: 'shared', shared: S }); }

// ------------------------------------------------------------------ Progression
function setStage(id) {
  const i = STAGES.findIndex(s => s.id === id);
  if (i > S.stage) { S.stage = i; ui.objective(STAGES[i].text); audio.pickup(); pushShared(); }
}
function addCredits(n, why) { S.credits += n; ui.credits(S.credits, true); audio.coin(); if (why) ui.toast(`+${n} ◈ ${why}`); pushShared(); checkGold(); }
function checkGold() { if (S.stage === 1 && S.credits >= 120) setStage('buy'); }
function syncWagons() {
  if (!train) return;
  const want = wagonList();
  if (want.join() !== train.wagons.map(w => w.type).join()) train.setWagons(want);
  if (S.owned.vapeur && train.kind !== 'vapeur') { train.setLoco('vapeur'); train.coal = 10; train.water = 40; }
  if (S.owned.sac) player.bagMax = 8;
}
function refreshResources() {
  nuggets.list.forEach((n, i) => { if (S.nuggets.includes(i)) { n.alive = false; n.m.visible = false; } });
  crystals.list.forEach((c, i) => { if (S.crystals.includes(i)) { c.alive = false; c.m.visible = false; } });
}
function refreshFinds() {
  const slots = hub.machines.hall.userData.slots;
  finds.forEach((f, i) => {
    const taken = S.finds.includes(f.id);
    if (taken && !f.taken) {
      f.taken = true; f.beam.visible = false;
      const k = S.finds.indexOf(f.id);
      const wp = hub.machines.hall.localToWorld(slots[k].clone());
      f.g.position.copy(wp); f.g.scale.setScalar(1.2);
    }
  });
}

// ------------------------------------------------------------------ Shérif-7
function placeSheriff() {
  if (S.sheriff === 'ice') { sheriff.position.copy(gelure.iceBlockPos).add(new THREE.Vector3(0, 0.6, 0)); sheriff.rotation.set(0.25, 0.6, -0.35); iceBlock.visible = true; }
  else if (S.sheriff === 'free') { iceBlock.visible = false; sheriff.rotation.set(0, 0, 0); }
  else if (S.sheriff === 'home') { iceBlock.visible = false; sheriff.position.copy(western.pedestal); sheriff.rotation.set(0, 0, 0); }
}
function sheriffCarrierTrain() {
  if (S.sheriff !== 'carried') return null;
  if (S.carrier === (netc.id ?? 'me') || S.carrier === 'me') return train;
  return remotes.get(S.carrier)?.train || null;
}

// ------------------------------------------------------------------ Intro
function intro() {
  input.wantLock = false;
  cinematic = { kind: 'intro', t: 0 };
  ui.letterbox(true); ui.fade(true, true);
  setTimeout(() => ui.fade(false, true), 600);
  const OCT = { who: 'OCTAVE — IA du Moyeu', icon: '◈', color: '#ffb347', beep: 900 };
  setTimeout(() => ui.say([
    { ...OCT, text: 'Capsule 3… ouverture. Bonjour, passager. Température corporelle : acceptable. Mémoire : effacée. C\'est normal. Probablement.' },
    { ...OCT, text: 'Tu es sur HALCYRE. Ici, huit voies partent du Moyeu vers huit mondes. Le réseau s\'appelle L\'Octave.' },
    { ...OCT, text: 'Il y a eu… un Déraillement. Les huit robots-gardiens ont été projetés dans les mauvais mondes. Sans eux, tout s\'éteint.' },
    { ...OCT, text: 'Seules deux voies répondent encore : l\'OUEST — Poussière-sur-Rail — et le SUD-OUEST — Gelure.' },
    { ...OCT, text: 'Une draisine t\'attend au quai Ouest. Elle n\'a pas de moteur. Toi, si. Bonne chance, passager.' },
  ], () => {
    cinematic = null; ui.letterbox(false); S.introDone = true; S.stage = Math.max(S.stage, 1); ui.objective(STAGES[S.stage].text); pushShared(); input.wantLock = true;
    
  }), 1400);
}

// ------------------------------------------------------------------ Cinématique de livraison
function deliveryCinematic() {
  if (cinematic?.kind === 'deliver') return;
  input.wantLock = false; document.exitPointerLock?.();
  cinematic = { kind: 'deliver', t: 0, from: sheriff.position.clone() };
  ui.letterbox(true);
  audio.fanfare();
  setTimeout(() => {
    const SH = { who: 'SHÉRIF-7', icon: '🤠', color: '#ffcc33', beep: 500 };
    ui.say([
      { ...SH, text: 'Bzzt… POUSSIÈRE-SUR-RAIL. Mon piédestal. Mon chapeau. Mes cactus. Je suis… chez moi.' },
      { ...SH, text: 'Merci, passager. Les automates vont pouvoir rejouer du piano. À midi pile, comme avant.' },
      { ...SH, text: 'En revenant, un fragment de ma mémoire s\'est recollé. Écoute bien…' },
      { who: 'FRAGMENT DE MÉMOIRE 1/8', icon: '◇', color: '#8fe0ff', beep: 1400, text: '« Le Déraillement n\'était pas un accident. Quelqu\'un a tiré sur le levier central du Moyeu. Signé : C. »' },
      { ...SH, text: 'C… ? Il y avait huit gardiens. Je n\'en ai compté que sept dans mes souvenirs. Retrouve les autres, passager.' },
    ], () => {
      cinematic = null; ui.letterbox(false);
      document.getElementById('end-text').innerHTML = 'SHÉRIF-7 est rentré à Poussière-sur-Rail.<br>Il reste <b>7 gardiens</b> perdus dans les mauvais mondes : un robot volant pris dans le pelage du Colosse, un petit compacteur à moitié cassé sous les néons, un horloger coincé à l\'envers sous une île flottante…<br><br>Et un huitième gardien dont personne ne se souvient. Pour l\'instant.';
      ui.show('endcard', true);
    });
  }, 3800);
}

// ------------------------------------------------------------------ Comptoir
function openShop() {
  const list = document.getElementById('shop-list');
  list.innerHTML = '';
  // vente auto du sac
  if (player.bag.length) {
    const total = player.bag.reduce((a, b) => a + b.value, 0);
    const n = player.bag.length; player.bag = [];
    addCredits(total, `${n} objet(s) vendu(s)`);
  }
  if (train.storage?.length) { const t = train.storage.reduce((a, b) => a + b.value, 0); train.storage = []; addCredits(t, 'wagon-stockage vidé'); }
  for (const it of SHOP) {
    const owned = !!S.owned[it.id], locked = it.needs && !S.owned[it.needs];
    const row = document.createElement('div'); row.className = 'item' + (owned ? ' owned' : '');
    row.innerHTML = `<div class="ic">${it.icon}</div><div><b>${it.name}</b><small>${it.desc}</small></div>`;
    const b = document.createElement('button');
    b.textContent = owned ? 'Acquis' : locked ? 'Verrouillé' : `${it.price} ◈`;
    b.disabled = owned || locked;
    b.onclick = () => {
      if (S.credits < it.price) { audio.deny(); ui.toast('Pas assez de crédits'); return; }
      S.credits -= it.price; S.owned[it.id] = true; ui.credits(S.credits, true); audio.fanfare();
      ui.toast(`${it.icon} ${it.name} acquis !`, true);
      if (it.id === 'vapeur') { train.setLoco('vapeur'); train.coal = 8; train.water = 30; setStage('fuel'); }
      syncWagons();
      if (S.stage === STAGES.findIndex(s => s.id === 'gear') && S.owned.chalumeau && S.owned.vitrine) setStage('melt');
      pushShared(); openShop();
    };
    row.appendChild(b); list.appendChild(row);
  }
  ui.openPanel('shop');
}

// ------------------------------------------------------------------ Carte
function drawMap() {
  const cv = document.getElementById('map-cv'), g = cv.getContext('2d'), W = cv.width, sc = W / 2 / 1450;
  g.fillStyle = '#120d08'; g.fillRect(0, 0, W, W);
  const P = (x, z) => [W / 2 + x * sc, W / 2 + z * sc];
  BIOMES.forEach((b, i) => {
    const a0 = -(i * Math.PI / 4) - Math.PI / 8, a1 = a0 + Math.PI / 4;
    g.beginPath(); g.moveTo(W / 2, W / 2); g.arc(W / 2, W / 2, W / 2 - 10, a0, a1); g.closePath();
    g.fillStyle = b.skyBot + (b.open ? '40' : '18'); g.fill();
    const am = -(i * Math.PI / 4); g.fillStyle = b.open ? '#ffe3a8' : '#8a7a66'; g.font = 'bold 15px Chakra Petch'; g.textAlign = 'center';
    g.fillText(b.name + (b.open ? '' : ' 🔒'), W / 2 + Math.cos(am) * W * 0.4, W / 2 + Math.sin(am) * W * 0.4);
  });
  for (const e of net.edges) {
    g.beginPath(); e.pts.forEach((p, k) => { const [x, y] = P(p.x, p.z); k ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.strokeStyle = e.kind === 'link' ? '#ffb347' : e.kind === 'ring' ? '#d4a54a' : '#f6e9d0'; g.lineWidth = e.kind === 'link' ? 3 : 4; g.stroke();
  }
  const dot = (p, c, r = 7) => { const [x, y] = P(p.x, p.z); g.beginPath(); g.arc(x, y, r, 0, 7); g.fillStyle = c; g.fill(); g.strokeStyle = '#000'; g.lineWidth = 2; g.stroke(); };
  if (S.sheriff === 'ice') dot(gelure.iceBlockPos, '#8fe0ff', 6);
  dot(western.pedestal, '#ffcc33', 6);
  for (const r of remotes.values()) { if (r.train.head) dot(r.train.head, r.color, 6); dot(r.avatar.position, r.color, 4); }
  if (train.head) dot(train.head, '#fff', 7);
  dot(player.pos, me.color, 5);
}

// ------------------------------------------------------------------ Interactions
function nearestInteract() {
  let best = null, bd = Infinity;
  for (const o of interactables) { const d = o.pos.distanceTo(player.pos); if (d < o.r && d < bd) { bd = d; best = o; } }
  return best;
}
function trainNear(pos, R) { return train.head && train.head.distanceTo(pos) < R; }
const FUEL_R = 70; // le quai Ouest est à ~55 m de la Charbonnière : on peut servir le train depuis son point de départ
function locoCabWorld(tr) { return tr.loco.localToWorld(tr.loco.userData.cab.clone()); }

function handleFootInteract() {
  const it = nearestInteract();
  let label = it?.label || null;
  // monter dans son train
  const cab = locoCabWorld(train);
  const dCab = cab.distanceTo(player.pos);
  if (dCab < 5) label = '[E] Monter en cabine';
  // ramasser
  let pick = null;
  for (let i = 0; i < nuggets.list.length; i++) { const n = nuggets.list[i]; if (n.alive && n.m.position.distanceTo(player.pos) < 2.2) { pick = { kind: 'nugget', i }; break; } }
  if (!pick) for (let i = 0; i < finds.length; i++) { const f = finds[i]; if (!f.taken && f.g.position.distanceTo(player.pos) < 3) { pick = { kind: 'find', i }; break; } }
  let crystal = null;
  if (!pick) for (let i = 0; i < crystals.list.length; i++) { const c = crystals.list[i]; if (c.alive && c.m.position.distanceTo(player.pos) < 3.2) { crystal = i; break; } }
  if (pick?.kind === 'nugget') label = '[E] Attraper la pépite d\'Or-moteur';
  if (pick?.kind === 'find') label = `[E] Ramasser : ${finds[pick.i].name}`;
  if (crystal !== null) label = '[F] Miner la glace-mémoire';
  if (it?.id === 'iceblock' && S.sheriff === 'ice') label = (S.owned.chalumeau ? '[F] maintenir : faire fondre la glace' : 'Un robot figé… il faut un chalumeau');
  if (it?.id === 'coal' && S.owned.vapeur) label = trainNear(it.pos, FUEL_R) ? '[E] Charger 10 charbon dans le tender' : 'Gare ton train près du quai pour charger';
  if (it?.id === 'water' && S.owned.vapeur) label = trainNear(it.pos, FUEL_R) ? '[E] Remplir le réservoir d\'eau' : 'Gare ton train près du quai pour remplir';
  for (const r of remotes.values()) if (r.train.head && locoCabWorld(r.train).distanceTo(player.pos) < 5 && dCab >= 5) label = `[E] Monter dans le train de ${r.name}`;
  ui.prompt(label);

  if (input.ah('interact')) {
    if (dCab < 5) { player.mode = 'cab'; audio.clunk(); return; }
    for (const [id, r] of remotes) if (r.train.head && locoCabWorld(r.train).distanceTo(player.pos) < 5) { player.mode = 'ride'; player.rideId = id; audio.clunk(); return; }
    if (pick?.kind === 'nugget') return collectNugget(pick.i);
    if (pick?.kind === 'find') return collectFind(pick.i);
    if (it) return useInteract(it);
  }
  // miner / fondre (maintenu)
  const holdF = input.a('action');
  if (crystal !== null && holdF) mineCrystal(crystal);
  if (it?.id === 'iceblock' && S.sheriff === 'ice') {
    if (holdF && S.owned.chalumeau) {
      meltProgress = Math.min(1, meltProgress + fdt / 6);
      ui.progress(meltProgress, 'Fonte de la glace…'); audio.setMelt(1);
      const p = gelure.iceBlockPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, 1 + Math.random() * 4, (Math.random() - 0.5) * 3));
      steam.emit(p, new THREE.Vector3((Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5)), { life: 2, size: 2, color: '#ffffff', alpha: 0.5 });
      sparks.emit(player.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3().subVectors(gelure.iceBlockPos, player.pos).setY(1).normalize().multiplyScalar(14).add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3)), { life: 0.4, size: 0.5, color: Math.random() < 0.5 ? '#ff8a2a' : '#4ab0ff' });
      iceBlock.scale.setScalar(1 - meltProgress * 0.55);
      if (meltProgress >= 1) freeSheriff();
    } else { audio.setMelt(0); if (meltProgress > 0) ui.progress(null); }
  } else audio.setMelt(0);
}

let mineAcc = 0, fdt = 1 / 60; // fdt : durée de l'image courante (fonte/minage indépendants des FPS)
function mineCrystal(i) {
  const c = crystals.list[i];
  if (player.bag.length >= player.bagMax && !(S.owned.stockage && trainNear(player.pos, 30))) { if (time - (mineCrystal.warn || -9) > 2) { mineCrystal.warn = time; ui.toast('Sac plein ! Revends au Comptoir du Moyeu.'); audio.deny(); } return; }
  mineAcc += fdt; c.hp -= fdt / 1.5;
  c.m.scale.set(0.8 * (0.5 + c.hp / 2), 1.8 * (0.5 + c.hp / 2), 0.8 * (0.5 + c.hp / 2));
  if (Math.random() < 0.5) sparks.emit(c.m.position, new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 6, (Math.random() - 0.5) * 6), { life: 0.6, size: 0.4, color: '#8fe0ff' });
  ui.progress(1 - c.hp, 'Glace-mémoire…');
  if (c.hp <= 0) {
    c.alive = false; c.m.visible = false; S.crystals.push(i); ui.progress(null);
    audio.crystal();
    const MEM = ['…une petite fille riait dans un wagon…', '…« Prochain arrêt : partout. »…', '…le bruit d\'un levier qu\'on tire, très fort…', '…huit robots chantaient en canon…', '…quelqu\'un pleurait dans une capsule…', '…« C. ne doit pas savoir. »…'];
    S.memories++;
    ui.toast(`<span style="color:#8fe0ff">Souvenir gelé :</span> <i>${MEM[S.memories % MEM.length]}</i>`);
    stash({ icon: '💠', value: 30 });
  }
}
function stash(item) {
  if (S.owned.stockage && trainNear(player.pos, 30)) { (train.storage ||= []).push(item); ui.toast(`${item.icon} → wagon-stockage`); return; }
  if (player.bag.length >= player.bagMax) { ui.toast('Sac plein ! Revends au Comptoir.'); audio.deny(); return false; }
  player.bag.push(item); ui.bag(player.bag, player.bagMax); return true;
}
function collectNugget(i) {
  if (player.bag.length >= player.bagMax && !(S.owned.stockage && trainNear(player.pos, 30))) { ui.toast('Sac plein ! Revends au Comptoir du Moyeu.'); audio.deny(); return; }
  const n = nuggets.list[i]; n.alive = false; n.m.visible = false; S.nuggets.push(i);
  for (let k = 0; k < 20; k++) sparks.emit(n.m.position, new THREE.Vector3((Math.random() - 0.5) * 8, Math.random() * 8, (Math.random() - 0.5) * 8), { life: 0.7, size: 0.5, color: '#ffcc33' });
  audio.pickup(); stash({ icon: '🪙', value: 30 }); pushShared();
}
function collectFind(i) {
  const f = finds[i]; S.finds.push(f.id); audio.fanfare();
  ui.toast(`TROUVAILLE : ${f.name}`, true);
  ui.say([{ who: f.name, icon: '✦', color: f.color, text: f.lore }]);
  refreshFinds(); addCredits(50, 'trouvaille exposée au Hall');
}
function useInteract(it) {
  if (it.id === 'shop') return openShop();
  if (it.id === 'coal' && S.owned.vapeur && trainNear(it.pos, FUEL_R)) { train.coal = Math.min(train.maxCoal, train.coal + 10); audio.shovel(); ui.toast('+10 charbon'); checkFuel(); return; }
  if (it.id === 'water' && S.owned.vapeur && trainNear(it.pos, FUEL_R)) { train.water = train.maxWater; audio.setMelt(1); setTimeout(() => audio.setMelt(0), 900); ui.toast('Réservoir plein'); checkFuel(); return; }
  if (it.id === 'hall') { ui.say([{ who: 'Hall des trouvailles', icon: '🏛', text: `${S.finds.length} / 5 trouvailles exposées. Elles brillent sous un rayon de lumière dans les mondes.` }]); return; }
  if (it.id === 'iceblock' && S.sheriff === 'ice') {
    const lines = [{ who: 'Toi', icon: '👤', color: me.color, text: 'Un robot en laiton… figé en plein saut de monocycle. Son chapeau est encore en l\'air.' }];
    if (!(S.owned.chalumeau && S.owned.vitrine)) lines.push({ who: 'OCTAVE (radio)', icon: '◈', color: '#ffb347', beep: 900, text: 'C\'est SHÉRIF-7 ! Il te faut un chalumeau pour la glace et un wagon-vitrine pour le transporter. Le Comptoir du Moyeu a les deux.' });
    ui.say(lines, () => setStage(S.owned.chalumeau && S.owned.vitrine ? 'melt' : 'gear'));
  }
}
function checkFuel() { if (S.stage === STAGES.findIndex(s => s.id === 'fuel') && train.coal >= 10 && train.water >= 50) ui.toast('Plein fait ! Cap à l\'Ouest.'); }

function freeSheriff() {
  ui.progress(null); audio.setMelt(0);
  for (let k = 0; k < 80; k++) steam.emit(gelure.iceBlockPos.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3((Math.random() - 0.5) * 10, Math.random() * 8, (Math.random() - 0.5) * 10), { life: 2.5, size: 3, color: '#ffffff', alpha: 0.7 });
  S.sheriff = 'free'; placeSheriff(); audio.crystal();
  const SH = { who: 'SHÉRIF-7', icon: '🤠', color: '#ffcc33', beep: 500 };
  ui.say([
    { ...SH, text: 'BZZZT— …YEEE-HAW ? Où suis-je ? Pourquoi il fait si froid ? Où sont mes cactus ?!' },
    { ...SH, text: 'Je faisais ma ronde à midi pile… le Moyeu a clignoté… et PAF. Gelé en plein saut. La honte.' },
    { ...SH, text: 'Ramène-moi à Poussière-sur-Rail, partenaire. Je monte dans ta vitrine. Roule doucement, j\'ai le mal des rails.' },
  ], () => {
    if (S.owned.vitrine && trainNear(gelure.iceBlockPos, 45)) { S.sheriff = 'carried'; S.carrier = netc.id ?? 'me'; setStage('carry'); }
    else { ui.toast(S.owned.vitrine ? 'Amène ton train (avec la vitrine) près du Shérif : il montera tout seul.' : 'Il te faut le wagon-vitrine (Comptoir du Moyeu) pour emmener le Shérif.'); }
    pushShared();
  });
}

// ------------------------------------------------------------------ Objectif pour la boussole
function objectivePos() {
  const st = STAGES[S.stage]?.id;
  if (st === 'gold') return net.nodes.get('J4').p && { x: net.nodes.get('J4').p.x, z: net.nodes.get('J4').p.y };
  if (st === 'buy' || st === 'gear') return hub.machines.shop.position;
  if (st === 'fuel') return western.pedestal;
  if (st === 'find' || st === 'melt') return gelure.iceBlockPos;
  if (st === 'carry') return western.pedestal;
  return null;
}

// ------------------------------------------------------------------ Menu pause / réglages
const $ = id => document.getElementById(id);
function applySettings() {
  saveSettings(SET); audio.setVolumes(SET); input.setBindings(SET.keys); ui.setKeys(SET.keys);
  camera.fov = SET.fov; camera.updateProjectionMatrix();
  bloom.enabled = SET.bloom && (qName === 'auto' ? true : QUALITY[qName].bloom);
  const sh = SET.shadows && (qName === 'auto' || QUALITY[qName].shadow > 0);
  if (renderer.shadowMap.enabled !== sh) { renderer.shadowMap.enabled = sh; sun.castShadow = sh; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
}
function openPause() {
  ui.openPanel('pause'); input.wantLock = false;
  for (const k of ['master', 'music', 'sfx', 'ambience', 'fov', 'sens']) $('s-' + k).value = SET[k];
  for (const k of ['bloom', 'shadows', 'shake', 'compass', 'invertY', 'smooth']) $('s-' + k).checked = SET[k];
  $('s-quality').value = SET.quality; $('o-fov').textContent = SET.fov + '°'; $('o-sens').textContent = (+SET.sens).toFixed(2);
  renderKeys();
}
function renderKeys() {
  const box = $('keylist'); box.innerHTML = '';
  for (const [act, label] of ACTIONS) {
    const row = document.createElement('div'); row.className = 'keyrow'; row.innerHTML = `<span>${label}</span>`;
    [0, 1].forEach(slot => {
      const b = document.createElement('button'); b.textContent = keyLabel(SET.keys[act][slot]);
      b.onclick = () => { b.classList.add('wait'); b.textContent = 'Appuie…'; input.capture = code => { if (code !== 'Escape' || act === 'pause') { SET.keys[act] = [...SET.keys[act]]; SET.keys[act][slot] = code; } applySettings(); renderKeys(); }; };
      row.appendChild(b);
    });
    box.appendChild(row);
  }
}
function updateLockHint() {
  let t = '';
  if (!ui.panel && !ui.dialogOpen && !cinematic && input.wantLock && !input.mouse.locked && $('endcard').classList.contains('hidden')) {
    t = input.lockFailed ? 'Capture de la souris indisponible ici : maintiens le clic gauche ou droit et glisse pour tourner' : 'Clique pour capturer la souris · ou maintiens le clic droit pour tourner';
  }
  ui.lockHint(t);
}
input.canLock = () => !ui.panel && !cinematic && !ui.dialogOpen;
ui.setKeys(SET.keys);
(function wirePause() {
  document.querySelectorAll('#pause .tabs button').forEach(b => b.onclick = () => {
    document.querySelectorAll('#pause .tabs button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('#pause .tab').forEach(t => t.classList.toggle('hidden', t.dataset.tab !== b.dataset.tab)); audio.ui();
  });
  for (const k of ['master', 'music', 'sfx', 'ambience', 'fov', 'sens']) $('s-' + k).oninput = e => { SET[k] = +e.target.value; $('o-fov').textContent = SET.fov + '°'; $('o-sens').textContent = (+SET.sens).toFixed(2); applySettings(); if (k === 'sfx') audio.ui(); };
  for (const k of ['bloom', 'shadows', 'shake', 'compass', 'invertY', 'smooth']) $('s-' + k).onchange = e => { SET[k] = e.target.checked; applySettings(); };
  $('s-quality').onchange = e => { SET.quality = e.target.value; saveSettings(SET); ui.toast('Qualité appliquée au prochain lancement (page rechargée).'); setTimeout(() => location.reload(), 900); };
  $('keys-reset').onclick = () => { SET.keys = JSON.parse(JSON.stringify(DEFAULT_SET.keys)); applySettings(); renderKeys(); };
  $('resume').onclick = () => { ui.closePanels(); input.wantLock = true; input.lock(); };
  $('to-title').onclick = () => { saveState(S); location.reload(); };
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && started && !ui.panel && !ui.dialogOpen && !cinematic && input.wantLock && $('endcard').classList.contains('hidden')) openPause();
  });
})();

// ------------------------------------------------------------------ Boucle
const amb = { skyTop: new THREE.Color(), skyBot: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), fogD: 0 };
const clock = new THREE.Clock();
let chuffAcc = 0, lastSwitchEvt = 0, ambTimer = 0;
const camPos = new THREE.Vector3(30, 20, 30), camLook = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(); const dt = Math.min(0.25, raw); fdt = dt; time += dt; // temps réel même à bas FPS (sous-pas dans la physique)
  if (started) adaptQuality(Math.min(0.5, raw));
  if (!started) { titleCam(dt); render(); return; }

  // Échap : si le navigateur vient de libérer la souris (même appui), on ne referme pas le menu aussitôt
  if (input.ah('pause') && !(performance.now() - input.lastUnlock < 300 && ui.panel === 'pause')) { if (ui.panel) { ui.closePanels(); input.wantLock = true; } else if (!cinematic && !ui.dialogOpen) openPause(); }
  if (input.hit('Help')) ui.toggleHelp();
  updateLockHint();
  if (input.ah('map')) { if (ui.panel === 'map') ui.closePanels(); else { ui.openPanel('map'); drawMap(); } }
  if (ui.panel === 'map') drawMap();
  if (input.ah('interact') && ui.dialogOpen) { ui.advance(); input.consume('interact'); }
  if (input.hit('Mouse0') && ui.dialogOpen && !input.mouse.locked) ui.advance();
  const busy = ui.dialogOpen || ui.panel || cinematic;

  if (!busy) player.look(input, SET.sens, SET.invertY, SET.smooth);

  // --- train local
  let tin = { throttle: 0, brake: false, pump: false };
  if (player.mode === 'cab' && !busy) {
    if (input.a('forward')) tin.throttle = 1;
    if (input.a('back')) tin.throttle = -1;
    tin.brake = input.a('jump');
    if (train.kind === 'draisine') tin.pump = input.ah('action');
    else if (input.ah('action')) { const r = train.shovel(); if (r === true) { audio.shovel(); for (let k = 0; k < 10; k++) sparks.emit(locoCabWorld(train).add(new THREE.Vector3(0, 0.6, 0)), new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 4, (Math.random() - 0.5) * 3), { life: 0.5, size: 0.4, color: '#ff7a2a' }); } else if (r === 'empty') { audio.deny(); ui.toast('Tender vide ! Charbonnière du Moyeu.'); } }
    if (input.ah('left')) { train.pref = 1; audio.clunk(); }
    if (input.ah('right')) { train.pref = 0; audio.clunk(); }
    if (input.ah('whistle')) { audio.whistle(1.3); netc.send({ t: 'event', e: 'whistle' }); for (let k = 0; k < 25; k++) steam.emit(train.loco.localToWorld(new THREE.Vector3(0.5, 3.4, 1)), new THREE.Vector3(Math.random() * 2, 4 + Math.random() * 3, 0), { life: 1.2, size: 1.2, color: '#fff', alpha: 0.8 }); }
    if (input.ah('interact')) { player.mode = 'foot'; const side = train.loco.localToWorld(new THREE.Vector3(2.6, 0, train.loco.userData.cab.z)); player.pos.copy(side); player.pos.y = player.groundAt(side.x, side.z) + 0.5; audio.clunk(); input.consume('interact'); }
  }
  if (!(player.mode === 'cab') && Math.abs(train.speed) > 0.1) tin.brake = true; // frein automatique sans conducteur
  train.update(dt, tin);
  // service auto du convoyeur
  if (S.owned.convoyeur && train.head && train.head.length() < 90 && Math.abs(train.speed) < 1) { train.coal = Math.min(train.maxCoal, train.coal + dt * 4); train.water = Math.min(train.maxWater, train.water + dt * 10); }

  // événements du train
  for (const ev of train.events) { if (ev === 'switch') { audio.clunk(); if (time - lastSwitchEvt > 1) { lastSwitchEvt = time; } } if (ev === 'buffer') { audio.clunk(); ui.toast('Butoir !'); } }
  train.events.length = 0;
  // son & fumée de la loco
  const spd = Math.abs(train.speed);
  if (train.kind === 'vapeur') {
    chuffAcc += spd * dt;
    const chim = train.loco.localToWorld(train.loco.userData.chimney.clone());
    if (chuffAcc > 2.4) { chuffAcc = 0; if (spd > 0.3) audio.chuff(0.25 + Math.min(0.4, train.pressure / 200)); for (let k = 0; k < 5; k++) smoke.emit(chim, new THREE.Vector3((Math.random() - 0.5) * 1.5, 5 + Math.random() * 3, (Math.random() - 0.5) * 1.5), { life: 3.5, size: 2.2, color: '#5a5550', alpha: 0.7 }); }
    if (Math.random() < 0.15 + train.pressure / 300) smoke.emit(chim, new THREE.Vector3((Math.random() - 0.5), 3 + Math.random() * 2, (Math.random() - 0.5)), { life: 3, size: 1.4, color: '#8a8580', alpha: 0.45 });
    if (tin.brake && spd > 4) for (const w of train.loco.userData.wheels) if (Math.random() < 0.3) sparks.emit(w.getWorldPosition(new THREE.Vector3()), new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), { life: 0.4, size: 0.3, color: '#ffb347' });
  } else {
    chuffAcc += spd * dt; if (chuffAcc > 8) { chuffAcc = 0; audio.clack(); }
  }
  audio.setIntensity(player.mode !== 'foot' ? spd / 26 : 0);

  // --- joueur
  if (player.mode === 'foot') {
    if (!busy) {
      const moving = player.updateFoot(dt, input, [trainDeckCollider]);
      handleFootInteract();
      if (moving > 0.5 && sectorIndex(player.pos.x, player.pos.z) === 5 && Math.random() < 0.3) smoke.emit(player.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), new THREE.Vector3(0, 0.5, 0), { life: 0.8, size: 0.6, color: '#ffffff', alpha: 0.5 });
    } else ui.prompt(null);
  } else {
    ui.prompt(null);
    if (player.mode === 'cab') { const c = locoCabWorld(train); player.pos.copy(c); player.avatar.position.copy(c); player.avatar.rotation.y = train.loco.rotation.y; player.animate(0); }
    else if (player.mode === 'ride') {
      const r = remotes.get(player.rideId);
      if (!r) player.mode = 'foot';
      else { const c = r.train.loco.localToWorld(new THREE.Vector3(1.2, 1.45, r.train.loco.userData.cab.z)); player.pos.copy(c); player.avatar.position.copy(c); player.avatar.rotation.y = r.train.loco.rotation.y;
        if (input.ah('interact') && !busy) { player.mode = 'foot'; player.pos.x += 3; } }
    }
  }
  ui.train(train, player.mode === 'cab');

  // --- froid en Gelure
  const sec = sectorIndex(player.pos.x, player.pos.z), R = Math.hypot(player.pos.x, player.pos.z);
  const inGelure = sec === 5 && R > 140;
  const warmTrain = train.head && player.pos.distanceTo(train.head) < (S.owned.dortoir ? 16 : 9) && train.kind === 'vapeur' && train.pressure > 5;
  if (inGelure && player.mode === 'foot' && !warmTrain) player.temp = Math.max(0, player.temp - dt * (S.owned.doublure ? 1.2 : 3.6));
  else player.temp = Math.min(100, player.temp + dt * (warmTrain || player.mode !== 'foot' ? 25 : 8));
  ui.temp(player.temp, inGelure || player.temp < 100);
  if (player.temp <= 0 && !coldFaint) {
    coldFaint = true; ui.fade(true, true); ui.toast('Tu as gelé… OCTAVE te ramène près de ton train.', true);
    setTimeout(() => { const c = locoCabWorld(train); player.pos.set(c.x + 3, player.groundAt(c.x + 3, c.z) + 0.5, c.z); player.temp = 60; coldFaint = false; ui.fade(false, true); }, 1300);
  }

  // --- quêtes
  questTick();

  // --- entités
  nuggets.update(dt, time, player.pos); crystals.update(time);
  for (const f of finds) { if (!f.taken) { f.item.rotation.y += dt * 1.5; f.item.position.y = Math.sin(time * 2) * 0.2; } else f.item.rotation.y += dt * 0.5; }
  sheriffTick(dt);
  western.autos.forEach((a, i) => { a.rotation.z = Math.sin(time * 4 + i) * (S.sheriff === 'home' ? 0.12 : 0.03); a.position.y = S.sheriff === 'home' ? Math.abs(Math.sin(time * 6 + i)) * 0.3 : 0; });
  hub.nucleus.rotation.y += dt * 0.6; hub.nucleus.rotation.x += dt * 0.3;
  hub.core.userData.rings.forEach((r, i) => { r.rotation.x += dt * (0.4 + i * 0.3); r.rotation.y += dt * (0.25 - i * 0.1); });
  hub.machines.coal.userData.fly.rotation.x += dt * 2.5;
  westDecor.update(dt, time); gelDecor.update(dt, time); birds.update(dt, time); flags.update(time, camera.position); life.update(dt, time, player.pos); grade.uniforms.time.value = time % 10;
  hub.nucleus.scale.setScalar(1 + Math.sin(time * 2) * 0.08);
  signals.lamps.forEach(l => { const n = net.nodes.get(l.node); l.mat.emissive.set(train.nextNode() === l.node ? (train.pref ? '#ffb347' : '#40ff80') : '#40ff80'); });

  // --- distants
  for (const r of remotes.values()) {
    if (!r.state) continue;
    const s = r.state;
    r.train.applyRemote(s.tr); r.train.update(dt);
    r.avatar.visible = true;
    const target = new THREE.Vector3(s.p[0], s.p[1], s.p[2]);
    r.avatar.position.lerp(target, 0.3); r.avatar.rotation.y = s.ry;
    // panneau de vitesse pour l'effet Doppler (ton du sifflet suit la position)
    if (r.train.kind === 'vapeur' && Math.abs(r.train.speed) > 0.5 && Math.random() < Math.abs(r.train.speed) / 200) {
      const chim = r.train.loco.localToWorld(r.train.loco.userData.chimney.clone());
      smoke.emit(chim, new THREE.Vector3(0, 5, 0), { life: 3, size: 2, color: '#5a5550', alpha: 0.6 });
    }
  }
  if (netc.online && time - lastSync > 0.1) {
    lastSync = time;
    netc.send({ t: 'state', s: { p: [+player.pos.x.toFixed(2), +player.pos.y.toFixed(2), +player.pos.z.toFixed(2)], ry: +player.avatar.rotation.y.toFixed(2), m: player.mode, tr: train.serialize() } });
  }

  // --- ambiance
  const focus = player.mode === 'foot' ? player.pos : train.head;
  ambianceAt(focus.x, focus.z, amb);
  // boussole + phénomènes
  const friends = [...remotes.entries()].filter(([, r]) => r.state).map(([id, r]) => ({ id, name: r.name, color: r.color, pos: r.avatar.position }));
  compass.update(dt, { yaw: player.yaw, pos: focus, hubFactor: amb.hub, biome: amb.biome, friends, objective: objectivePos(), enabled: SET.compass && !cinematic }, (start, end) => {
    if (start) { pheno = start; ui.toast(PHENO_INFO[start].msg, false); if (start === 'magnetique' || start === 'aurore') audio.beeps(5, 200); }
    if (end) { pheno = null; ui.toast('La boussole se calme.'); }
  });
  const pf = pheno && PHENO_INFO[pheno];
  phenoK += ((pf ? 1 : 0) - phenoK) * Math.min(1, dt * 0.5);
  scene.fog.color.copy(amb.fog); scene.fog.density = amb.fogD * (1 + phenoK * ((pf?.fog || lastFog) - 1));
  if (pf?.fog) lastFog = pf.fog;
  sky.uniforms.top.value.copy(amb.skyTop); sky.uniforms.bot.value.copy(amb.skyBot); sky.uniforms.sunCol.value.copy(amb.sun); sky.uniforms.time.value = time;
  sun.color.copy(amb.sun); hemi.color.copy(amb.skyTop).lerp(WHITE, 0.5); hemi.groundColor.copy(amb.fog).multiplyScalar(0.6);
  sky.mesh.position.copy(camera.position);
  sun.position.copy(focus).addScaledVector(SUN_DIR, 200); sun.target.position.copy(focus);
  const bName = amb.hub > 0.5 ? 'Le Moyeu' : BIOMES[amb.biome].name;
  ui.world(bName, amb.hub > 0.5 ? '#ffd27a' : BIOMES[amb.biome].skyBot);
  ambTimer += dt;
  if (ambTimer > 0.5) { ambTimer = 0;
    { const B = amb.hub > 0.5 ? null : BIOMES[amb.biome].c; envUpdate(B ? B.skyTop : new THREE.Color('#1d2b4a'), B ? B.skyBot : new THREE.Color('#e9c79a'), B ? B.g0 : new THREE.Color('#8c7a63')); } audio.setZone(amb.hub > 0.5 ? 'hub' : amb.biome === 4 ? 'western' : amb.biome === 5 ? 'gelure' : 'closed'); }
  const wkind = amb.biome === 5 && amb.hub < 0.5 ? 'snow' : 'dust';
  weather.update(dt, camera.position, pf?.kind || wkind, amb.hub > 0.5 ? 0 : Math.max(phenoK * (pf?.weather || 0), wkind === 'snow' ? 0.9 : (amb.biome === 4 ? 0.35 : 0.1)) * (pf?.weather ? 2.2 : 1));
  audio.setWind(amb.hub > 0.5 ? 0.1 : wkind === 'snow' ? 0.8 : 0.4);

  smoke.update(dt); sparks.update(dt); steam.update(dt);
  updateCamera(dt);
  ui.credits(S.credits);
  updateRange();
  render();
  input.endFrame();
}

function trainDeckCollider(x, z) {
  // on peut monter sur les wagons
  for (const m of [train.loco, ...train.wagons.map(w => w.mesh)]) {
    const l = m.worldToLocal(new THREE.Vector3(x, m.position.y, z));
    if (Math.abs(l.x) < 1.3 && Math.abs(l.z) < (m.userData.length || 6) / 2) return m.position.y + 1.25;
  }
  return null;
}

function questTick() {
  const st = STAGES[S.stage]?.id;
  if (st === 'fuel' && !questGuard && train.head && train.head.distanceTo(western.pedestal) < 110) {
    questGuard = true;
    ui.say([
      { who: 'Cactus-automate pianiste', icon: '🌵', color: '#7ad05a', beep: 300, text: 'Plink… plonk… Étranger ! Le Shérif-7 a disparu depuis le Déraillement. Plus personne ne surveille midi pile.' },
      { who: 'Cactus-automate pianiste', icon: '🌵', color: '#7ad05a', beep: 300, text: 'Le dernier qui l\'a vu dit qu\'il a été aspiré vers le SUD-OUEST. Là où il fait si froid que même les vagues gèlent.' },
    ], () => { setStage('find'); questGuard = false; });
  }
  if (st === 'find' && !questGuard && player.pos.distanceTo(gelure.iceBlockPos) < 22 && !ui.dialogOpen) { questGuard = true; useInteract({ id: 'iceblock' }); setTimeout(() => questGuard = false, 3000); }
  if (st === 'gold' && S.credits >= 120) setStage('buy');
  if (st === 'buy' && S.owned.vapeur) setStage('fuel');
  if (st === 'gear' && S.owned.chalumeau && S.owned.vitrine) setStage('melt');
  if (S.sheriff === 'free' && S.owned.vitrine && trainNear(gelure.iceBlockPos, 45) && !ui.dialogOpen && player.pos.distanceTo(gelure.iceBlockPos) < 30) {
    S.sheriff = 'carried'; S.carrier = netc.id ?? 'me'; setStage('carry'); pushShared(); ui.toast('SHÉRIF-7 saute dans la vitrine !', true); audio.beeps(8, 500);
  }
  if (S.sheriff === 'carried') {
    const ct = sheriffCarrierTrain();
    if (ct === train && ct.head && ct.head.distanceTo(western.pedestal) < 75 && Math.abs(ct.speed) >= 6 && time - (questTick.slow || -99) > 8) { questTick.slow = time; ui.toast('Ralentis pour déposer SHÉRIF-7 au piédestal (moins de 6 m/s).'); }
    if (ct && ct.head && ct.head.distanceTo(western.pedestal) < 75 && Math.abs(ct.speed) < 6 && ct === train) {
      S.sheriff = 'home'; S.carrier = null; setStage('done'); pushShared(); deliveryCinematic();
    }
  }
}


function sheriffTick(dt) {
  const u = sheriff.userData;
  if (S.sheriff === 'ice') { u.eyeMat.emissiveIntensity = 0.2; return; }
  u.eyeMat.emissiveIntensity = 3;
  if (S.sheriff === 'free') {
    sheriff.position.copy(gelure.iceBlockPos); sheriff.position.y += Math.abs(Math.sin(time * 4)) * 0.4;
    sheriff.rotation.y = Math.atan2(player.pos.x - sheriff.position.x, player.pos.z - sheriff.position.z);
    u.arms.forEach((a, i) => a.rotation.x = Math.sin(time * 8 + i * 3) * 0.8);
  } else if (S.sheriff === 'carried') {
    const ct = sheriffCarrierTrain();
    const w = ct?.wagons.find(x => x.type === 'vitrine');
    if (w) { sheriff.position.copy(w.mesh.localToWorld(w.mesh.userData.slot.clone())); sheriff.rotation.y = w.mesh.rotation.y + Math.sin(time * 2) * 0.3; }
    u.wheel.rotation.x += dt * Math.abs(ct?.speed || 0);
  } else if (S.sheriff === 'home') {
    if (cinematic?.kind === 'deliver') {
      const c = cinematic; c.t += dt;
      const k = Math.min(1, c.t / 1.6);
      sheriff.position.lerpVectors(c.from, western.pedestal, k); sheriff.position.y += Math.sin(k * Math.PI) * 8;
      sheriff.rotation.y += dt * (k < 1 ? 12 : 3);
      u.hat[0].position.y = 3.12 + (k > 0.3 && k < 1 ? Math.sin((k - 0.3) / 0.7 * Math.PI) * 3 : 0); u.hat[0].rotation.y += dt * (k < 1 ? 15 : 0);
      if (k >= 1 && Math.random() < 0.5) {
        const p = western.pedestal.clone().add(new THREE.Vector3((Math.random() - 0.5) * 30, 15 + Math.random() * 15, (Math.random() - 0.5) * 30));
        const col = ['#ffcc33', '#ff5a4a', '#4ab0ff', '#7ad05a'][Math.floor(Math.random() * 4)];
        for (let n = 0; n < 30; n++) sparks.emit(p, new THREE.Vector3().randomDirection().multiplyScalar(10 + Math.random() * 6), { life: 1.4, size: 0.8, color: col });
        if (Math.random() < 0.2) audio.noiseBurst(audio.now, 0.4, 600, 0.5, 0.25, 'lowpass');
      }
    } else { sheriff.position.copy(western.pedestal); sheriff.position.y += Math.sin(time * 2) * 0.1; sheriff.rotation.y += dt * 0.4; }
    u.arms.forEach((a, i) => a.rotation.x = Math.sin(time * 5 + i * 3) * 0.6);
  }
}

let camInit = false; const _o2 = new THREE.Vector3();
let _camT = null; // cible de la caméra : un volume « caméra seulement » qui la contient (joueur sous un auvent) est ignoré
function camBlocked(x, y, z) {
  for (const c of COLLIDERS.near(x, z)) {
    if (c.cam === false || y > c.top || y < c.bottom) continue;
    if (c.co) { // couronne / auvent / toit : n'importe quelle taille, sauf si le joueur est dedans
      if (COLLIDERS._inside(c, x, z, 0.5) && !(_camT && _camT.y <= c.top && _camT.y >= c.bottom - 0.3 && COLLIDERS._inside(c, _camT.x, _camT.z, 0.3))) return true;
      continue;
    }
    if (c.t === 0) { if (c.r >= 1.6 && Math.hypot(x - c.x, z - c.z) < c.r + 0.3) return true; }
    else if (Math.max(c.hx, c.hz) >= 2) { const dx = x - c.x, dz = z - c.z, lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c; if (Math.abs(lx) < c.hx + 0.3 && Math.abs(lz) < c.hz + 0.3) return true; }
  }
  return false;
}
function updateCamera(dt) {
  let target, dist;
  if (cinematic?.kind === 'intro') {
    const t = Math.min(1, time / 9);
    camera.position.set(Math.cos(t * 1.2) * 8 * (1 + t * 2), 2 + t * 10, -Math.sin(t * 1.2) * 8 * (1 + t * 2));
    camera.lookAt(0, 3, 0); return;
  }
  if (cinematic?.kind === 'deliver') {
    const a = time * 0.25;
    camera.position.lerp(western.pedestal.clone().add(new THREE.Vector3(Math.cos(a) * 16, 7, Math.sin(a) * 16)), 0.05);
    camera.lookAt(western.pedestal.clone().add(new THREE.Vector3(0, 3, 0))); return;
  }
  if (player.mode === 'foot') { target = player.pos.clone().add(new THREE.Vector3(0, 1.7, 0)); dist = 6.5; }
  else { const tr = player.mode === 'cab' ? train : remotes.get(player.rideId)?.train || train; target = tr.loco.position.clone().add(new THREE.Vector3(0, 3, 0)); dist = 13 + Math.abs(tr.speed) * 0.25; }
  const off = new THREE.Vector3(Math.sin(player.yaw) * Math.cos(player.pitch), -Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch)).multiplyScalar(dist);
  const want = target.clone().add(off); _camT = target;
  // la caméra ne traverse que les petits objets : seuls les gros volumes (bâtiments, silo, murs) la repoussent.
  const NSTEP = 24;
  const freeOf = (o) => { for (let i = 1; i <= NSTEP; i++) { const t = i / NSTEP; if (camBlocked(target.x + o.x * t, target.y + o.y * t, target.z + o.z * t)) return Math.max(0, (i - 1.5) / NSTEP); } return 1; };
  const free = freeOf(off);
  if (free < 1) {
    const df = free * dist, MIN = 3.0;
    if (df >= MIN) want.copy(target).addScaledVector(off, free);
    else { // trop près : on monte (survol), sinon on contourne par le côté, jamais collé à la tête
      const hl = Math.hypot(off.x, off.z) || 1, dh = Math.max(0.4, df);
      const hh = Math.min(4.2, Math.sqrt(Math.max(0, MIN * MIN - dh * dh)) + 0.6);
      want.set(target.x + off.x / hl * dh, target.y + hh, target.z + off.z / hl * dh);
      if (camBlocked(want.x, want.y, want.z)) {
        let best = df, bo = null;
        for (const da of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9, 2.6, -2.6, 3.14]) {
          const ca = Math.cos(da), sa = Math.sin(da), o2 = _o2.set(off.x * ca - off.z * sa, off.y, off.x * sa + off.z * ca);
          const f2 = freeOf(o2) * dist; if (f2 > best + 0.3) { best = f2; bo = o2.clone(); if (f2 >= MIN) break; }
        }
        if (bo) want.copy(target).addScaledVector(bo, Math.min(1, best / dist)); else want.copy(target).addScaledVector(off, Math.max(free, 2.2 / dist));
      }
    }
  }
  const gh = terrain.heightAt(want.x, want.z) + 0.8; if (want.y < gh) want.y = gh;
  if (camPos.distanceTo(want) > 60 || !camInit) { camPos.copy(want); camLook.copy(target); camInit = true; } // téléportation / respawn / 1re image
  else {
    const closer = camPos.distanceTo(target) > want.distanceTo(target) + 0.05;
    camPos.lerp(want, 1 - Math.exp(-dt * (closer ? 16 : 2.5))); // rapprochement vif, éloignement lent (pas de pompage)
  }
  camLook.lerp(target, 1 - Math.exp(-dt * 18));
  camera.position.copy(camPos); camera.lookAt(camLook);
  // légère vibration en cabine à vitesse
  if (player.mode === 'cab' && SET.shake) { const sh = Math.min(0.08, Math.abs(train.speed) * 0.003); camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh; }
}

function titleCam(dt) {
  if (!envLight.key) envUpdate(new THREE.Color('#1d2b4a'), new THREE.Color('#e9c79a'), new THREE.Color('#8c7a63'));
  flags.update(time, camera.position); birds.update(dt, time);
  const a = time * 0.05;
  camera.position.set(Math.cos(a) * 150, 55, Math.sin(a) * 150);
  camera.lookAt(0, 5, 0);
  ambianceAt(0, 0, amb);
  sky.uniforms.top.value.copy(amb.skyTop); sky.uniforms.bot.value.copy(amb.skyBot); sky.uniforms.time.value = time;
  sky.mesh.position.copy(camera.position); scene.fog.color.copy(amb.fog); scene.fog.density = 0.0012;
  sun.position.set(200 * SUN_DIR.x, 200 * SUN_DIR.y, 200 * SUN_DIR.z); sun.target.position.set(0, 0, 0);
  hub.core.rotation.y += dt * 0.6;
  updateRange();
}

function render() {
  if (Q.post) composer.render(); else renderer.render(scene, camera);
}
// distance de visibilité (brouillard ~6 %) : règle camera.far et le masquage par distance
function updateRange() {
  const D = Math.min(1500, 1.7 / Math.max(0.0005, scene.fog.density));
  const far = Math.min(1600, Math.max(450, D * 1.3));
  if (Math.abs(far - camera.far) > far * 0.06) { camera.far = far; camera.updateProjectionMatrix(); }
  culler.update(camera.position, D);
}

// accès debug / tests automatisés
// collision à pied avec le flanc des trains (local + distants) ; on peut toujours monter dessus (saut) ou en cabine (E)
COLLIDERS.dynamic.push(out => { trainBodies(train, out); for (const r of remotes.values()) trainBodies(r.train, out); });
window.__oct = { interactables, hub, culler, composer, bloom, Q, COLLIDERS, remotes, compass, renderer, scene, smoke, sparks, steam, weather, camera, get S() { return S; }, get train() { return train; }, get player() { return player; }, net, terrain, setStage, freeSheriff, deliveryCinematic, nuggets, crystals, finds, gelure, western, openShop, audio, ui, input };
if (DEBUG) setTimeout(() => console.log('DEBUG prêt'), 0);
ui.objective(STAGES[0].text);
frame();
