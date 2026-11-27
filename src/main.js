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
import { buildTracks, buildSignals, buildTrestles } from './world/tracks.js';
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
import { createAirField } from './world/airfield.js';
import { createDiag } from './ui/diag.js';
import { createOctuor } from './game/octuor.js';
import { buildWorld as W_colosse } from './world/worlds/colosse.js';
import { buildWorld as W_neon } from './world/worlds/neon.js';
import { buildWorld as W_archipel } from './world/worlds/archipel.js';
import { buildWorld as W_chrono } from './world/worlds/chrono.js';
import { buildWorld as W_fonderie } from './world/worlds/fonderie.js';
import { buildWorld as W_entrailles } from './world/worlds/entrailles.js';

import { WORLD_LORE, HUB_LORE, LOADING_TIPS } from './data/lore.js';
import { COLLIDERS, trainBodies, vehicleTop } from './world/colliders.js';
import { buildLife } from './world/life.js';
import { buildDormant } from './world/dormant.js';
import { Footprints } from './game/footprints.js';
import { buildDragons } from './world/dragons.js';
import { VOX } from './world/voxcol.js';
import { TSUNAMI_ZONE } from './world/tsunami.js';
import { zoneRules } from './game/zones.js';
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
  bas:   { pr: 0.6,  shadow: 0,    bloom: false, env: false, post: false, grass: 0.25, weather: 0.3, range: 0.55 },
  moyen: { pr: 0.85, shadow: 1024, bloom: true,  env: true,  post: true,  grass: 0.6,  weather: 0.6, range: 0.85 },
  haut:  { pr: 1.25, shadow: 2048, bloom: true,  env: true,  post: true,  grass: 1,    weather: 1,   range: 1 },
  // Ultra « 4K » : rendu interne jusqu'à 2x (sur-échantillonnage, ~4K sur un écran 1080p), ombres 4096, distance +30 %
  ultra: { pr: 2.0,  shadow: 4096, bloom: true,  env: true,  post: true,  grass: 1,    weather: 1,   range: 1.3, ss: true },
};
const SET = loadSettings();
let qName = SET.quality || 'auto';
const Q = QUALITY[qName === 'auto' ? 'moyen' : qName];
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
let pixelRatio = Q.ss ? Q.pr : Math.min(devicePixelRatio, Q.pr);
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
{ // la ville est posée à plat : on aplanit tout le terrain sous la ville (de l'arche au piédestal)
  const e = net.edges.find(x => x.b === 'T4') || net.edges.find(x => x.a === 'T4'), pts = e.pts, atB = e.b === 'T4';
  const end = atB ? pts[pts.length - 1] : pts[0], prev = atB ? pts[pts.length - 26] : pts[25];
  const dx = prev.x - end.x, dz = prev.z - end.z, L = Math.hypot(dx, dz) || 1;
  terrain.flatten({ x: end.x + dx / L * 45, z: end.z + dz / L * 45, r: 85, fall: 50, y: rawHeight(end.x, end.z) * 0 + end.y - 0.75 });
}
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
buildTrackside(scene, net, terrain); buildTrestles(scene, net, terrain);
// les six mondes rallumés (un module par monde, voir src/world/worlds/)
const worldMods = [];
for (const [n, f] of Object.entries({ colosse: W_colosse, neon: W_neon, archipel: W_archipel, chrono: W_chrono, fonderie: W_fonderie, entrailles: W_entrailles })) { const before = new Set(scene.children); try { worldMods.push(f(scene, terrain, net, { BIOMES, get sparks() { return sparks; }, get smoke() { return smoke; }, get steam() { return steam; }, get audio() { return audio; }, get ui() { return ui; }, get player() { return player; }, get train() { return train; }, get input() { return input; }, get S() { return S; } } /* getters : à lire dans update() seulement */)); } catch (e) { console.error('Monde', n, e); }
  // instances animées des mondes : jamais découpées/masquées par le culler (sinon elles disparaissent en bougeant)
  for (const c of scene.children) if (!before.has(c)) c.traverse(o => { o.userData.world = n; if (o.isInstancedMesh) { o.userData.noCull = true; o.userData.noChunk = true; if (!o.boundingSphere) o.computeBoundingSphere(); if (o.boundingSphere) o.boundingSphere.radius += 30; } }); }
// l'Octuor : 7 gardiens égarés (+ SHÉRIF-7 géré par la quête historique)
let octuor = null;
setTimeout(() => { try { octuor = createOctuor({ scene, terrain, net, BIOMES, ui, audio, sparks, steam, S: () => S, push: () => pushShared(), train: () => train, sheriffHome: () => S.sheriff === 'home', camPos: () => camera.position }); window.__octuor = octuor; } catch (e) { console.error('Octuor', e); } }, 0);
const westDecor = buildWesternDecor(scene, terrain, net);
const gelDecor = buildGelureDecor(scene, terrain, net);
buildGrass(scene, terrain, net, Q.grass);
const birds = buildBirds(scene, terrain);
const flags = buildFlags(scene);
buildLamps(scene);
const life = buildLife(scene, terrain, net);
buildDormant(scene, interact);
const footprints = new Footprints(scene, terrain);
const nuggets = new Nuggets(scene, terrain, net, 46);
const crystals = new Crystals(scene, terrain, net, 26);
const finds = buildFinds(scene, terrain, net);
// découpe spatiale des instances + masquage par distance (brouillard) ; voir world/cull.js
const culler = new WorldCuller(scene).chunk().register(); culler.mul = Q.range;
const envUpdate = (a, b, c) => { if (Q.env) envLight.update(a, b, c); };
console.log(`Monde généré en ${Math.round(performance.now() - t0)} ms`);

const smoke = new Particles(scene, 900, { gravity: 1.2, drag: 0.6, grow: 3 });
const sparks = new Particles(scene, 600, { additive: true, gravity: -14, drag: 0.4, grow: 0 });
const dragons = buildDragons(scene, terrain, { sparks, smoke });
const steam = new Particles(scene, 400, { gravity: 2, drag: 1.2, grow: 2.5 });
const weather = new Weather(scene); weather.setDensity(Q.weather);

// Shérif-7 dans son bloc de glace
const sheriff = buildSheriff();
const iceBlock = buildIceBlock();
const sheriffSpot = new THREE.Group(); sheriffSpot.position.copy(gelure.iceBlockPos); scene.add(sheriffSpot);
sheriffSpot.add(iceBlock);
// le bloc de glace est solide tant qu'il est visible (Shérif non libéré)
COLLIDERS.dynamic.push(out => { if (iceBlock.visible && iceBlock.parent) { const q = gelure.iceBlockPos; out.push({ t: 0, x: q.x, z: q.z, r: 2.4, R: 2.4, top: q.y + 7, bottom: -99 }); } });
scene.add(sheriff);

const collExclude = new Set();
// ------------------------------------------------------------------ Voies dégagées : rien ne doit être posé sur les rails
{
  scene.updateMatrixWorld(true);
  const keep = new Set([terrain.mesh, sky.mesh, signals.group, hub.group, western.town].filter(Boolean));
  const box = new THREE.Box3(), size = new THREE.Vector3(), cen = new THREE.Vector3(), m4 = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  let moved = 0, hidden = 0;
  const trackHits = (b, margin) => { // un point de voie dans l'emprise (xz) de la boîte, sous son sommet ?
    const c = b.getCenter(cen), r = Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z) / 2 + margin;
    const n = net.nearest(c.x, c.z, r); if (!n) return null;
    for (const e of net.edges) { if (Math.abs(e.pts[0].x - c.x) > 3000) continue; }
    const e = net.edges[n.edge]; for (let k = Math.max(0, n.k - 40); k < Math.min(e.pts.length, n.k + 40); k++) { const t = e.pts[k];
      if (t.x > b.min.x - margin && t.x < b.max.x + margin && t.z > b.min.z - margin && t.z < b.max.z + margin && b.max.y > t.y + 0.4 && b.min.y < t.y + 4) return t; }
    return null;
  };
  // 1) toutes les instances, où qu'elles soient : celles posées sur une voie sont retirées
  const inKeep = (o) => { for (let r = o; r; r = r.parent) if (keep.has(r)) return true; return false; };
  scene.traverse(o => {
    if (!o.isInstancedMesh || o.userData.noCollide || inKeep(o)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const gb = o.geometry.boundingBox; let ch = false;
    for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m4.premultiply(o.matrixWorld); m4.decompose(p, q, sc); const R = Math.max(gb.max.x - gb.min.x, gb.max.z - gb.min.z) * Math.max(sc.x, sc.z) / 2;
      const n = net.nearest(p.x, p.z, Math.min(34, R + 2.6)); if (n && p.y + gb.max.y * sc.y > n.y + 0.4 && p.y + gb.min.y * sc.y < n.y + 6) { o.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); ch = true; hidden++; } }
    if (ch) o.instanceMatrix.needsUpdate = true;
  });
  const queue = [...scene.children];
  while (queue.length) { const o = queue.shift();
    if (keep.has(o) || o.isLight || o.isPoints || o.userData.noCollide || o.userData.trackPart) continue; // trackPart : heurtoirs (posés sur la voie par construction)
    if (o.isInstancedMesh) continue;
    if (false) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const gb = o.geometry.boundingBox; let ch = false;
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); m4.decompose(p, q, sc); const R = Math.max(gb.max.x - gb.min.x, gb.max.z - gb.min.z) * Math.max(sc.x, sc.z) / 2;
        const n = net.nearest(p.x, p.z, R + 2.6); if (n && p.y + gb.max.y * sc.y > n.y + 0.4) { sc.set(0, 0, 0); m4.compose(p, q, sc); o.setMatrixAt(i, m4); ch = true; hidden++; } }
      if (ch) o.instanceMatrix.needsUpdate = true; continue;
    }
    box.setFromObject(o); if (box.isEmpty()) continue; box.getSize(size); if (Math.max(size.x, size.z) > 40) { if (o.children.length) queue.push(...o.children); continue; } // gros groupe : on regarde ses éléments un par un
    const c0 = box.getCenter(new THREE.Vector3()), g0 = terrain.heightAt(c0.x, c0.z);
    for (let it = 0; it < 30; it++) {
      const t = trackHits(box, 2.6); if (!t) { if (it > 0) { const c1 = box.getCenter(cen); o.position.y += terrain.heightAt(c1.x, c1.z) - g0; } break; }
      const c = box.getCenter(cen); let dx = c.x - t.x, dz = c.z - t.z; if (Math.hypot(dx, dz) < 0.05) { const n = net.nearest(t.x, t.z, 3), E = net.edges[n.edge], a = E.pts[Math.max(0, n.k - 1)], b2 = E.pts[Math.min(E.pts.length - 1, n.k + 1)]; dx = -(b2.z - a.z); dz = b2.x - a.x; } const L = Math.hypot(dx, dz) || 1; dx = dx / L * 1.5; dz = dz / L * 1.5;
      o.position.x += dx; o.position.z += dz; box.translate(new THREE.Vector3(dx, 0, dz)); if (it === 0) moved++; o.updateMatrixWorld(true);
      if (it === 29) { o.visible = false; }
    }
    if (o.position.y !== undefined && moved) { /* reposé sur le sol après déplacement */ }
  }
  console.log(`Voies dégagées : ${moved} objets écartés, ${hidden} instances retirées`);
}
// ------------------------------------------------------------------ Collision sur la géométrie réelle
// On repère tout ce qui bouge (animaux, foin volant, rotors…) en avançant les animations et en comparant
// les matrices ; tout le reste (le décor statique visible) devient solide.
{
  terrain.mesh.userData.noCollide = true;
  scene.updateMatrixWorld(true);
  const snap = new Map();
  const isnap = new Map();
  scene.traverse(o => { if (o.isMesh) snap.set(o, o.matrixWorld.clone()); if (o.isInstancedMesh) isnap.set(o, o.instanceMatrix.array.slice()); });
  const far = new THREE.Vector3(1e5, 0, 1e5);
  for (const tt of [37, 81]) { westDecor.update(0.7, tt); gelDecor.update(0.7, tt); birds.update(0.7, tt); flags.update(tt, far); life.update(0.7, tt, far); }
  // mondes rallumés + dragons : on les anime aussi (caméra posée au centre de chaque monde pour lever leurs limites de distance)
  { const WI = [0, 1, 2, 3, 6, 7];
    for (const tt of [11, 37, 81]) worldMods.forEach((w, k) => { const a = WI[k] * Math.PI / 4, c = new THREE.Vector3(Math.cos(a) * 700, 30, -Math.sin(a) * 700); try { w.update?.(0.7, tt, c); } catch {} try { w.update?.(0.7, tt, new THREE.Vector3(0, 30, 0)); } catch {} });
    try { for (const tt of [11, 37]) dragons.update(0.7, tt, new THREE.Vector3(0, 30, 0)); } catch {} }
  scene.updateMatrixWorld(true);
  const exclude = collExclude;
  for (const x of [sheriff, iceBlock, ...nuggets.list.map(n => n.m), ...crystals.list.map(c => c.m), ...finds.map(f => f.g)]) exclude.add(x);
  scene.traverse(o => { if (o.isMesh && snap.has(o) && !snap.get(o).equals(o.matrixWorld)) exclude.add(o);
    if (o.isInstancedMesh && isnap.has(o)) { const a = isnap.get(o), b = o.instanceMatrix.array; for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) { exclude.add(o); break; } }
    if (o.isSkinnedMesh) exclude.add(o); });
  VOX.build(scene, exclude);
  console.log(`Collision géométrique : ${VOX.meshes} modèles, ${VOX.count} colonnes, ${VOX.points} points, ${VOX.ms} ms`);
}

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
const STATIONS = [4, 5, 3, 6, 2, 7, 1, 0]; // une gare par joueur (par place)
const stats = { dist: 0, t0: performance.now(), bumps: 0 }; let bumpCd = 0;
let camZoom = 6.5, hintT = 0, oxyWarned = false;
const OXY_R = 40; // bulle d'oxygène autour du train
// Bulles visibles autour du train : chaleur (orange, intérieure) dans oxygène (bleue, extérieure)
function shieldMat(c1, c2, hx, hy, k = 1) {
  return new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, k: { value: k } },
    vertexShader: `varying vec3 vN; varying vec3 vW; varying vec3 vP; void main(){ vP = position; vec4 w = modelMatrix * vec4(position,1.); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `uniform float time; uniform float k; varying vec3 vN; varying vec3 vW; varying vec3 vP;
      void main(){ vec3 V = normalize(cameraPosition - vW); float f = pow(1. - abs(dot(V, vN)), 2.6);
        vec2 h = vec2(atan(vP.z, vP.x) * ${hx.toFixed(2)}, vP.y * ${hy.toFixed(2)}); vec2 g = abs(fract(h + vec2(0., fract(floor(h.x) * .5))) - .5);
        float hex = smoothstep(.46, .5, max(g.x, g.y)); float band = smoothstep(.9, 1., sin(vP.y / length(vP) * 12. - time * 1.4) * .5 + .5);
        float a = f * .55 + hex * (.05 + f * .25) + band * .08; a *= smoothstep(-.3, .1, vP.y / length(vP));
        gl_FragColor = vec4(mix(${c1}, ${c2}, band), a * k); }` });
}
const bubbles = (() => {
  const mk = (mat) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat); m.userData.noCollide = true; m.userData.noCull = true; m.frustumCulled = false; m.renderOrder = 3; scene.add(m); return m; };
  const heat = mk(shieldMat('vec3(1.,.45,.15)', 'vec3(1.,.8,.4)', 24., 6., .8));
  // l'air (Moyeu + train) = une seule bulle de savon fusionnée (voir world/airfield.js)
  const air = createAirField(scene, { bas: 20, moyen: 36, haut: 56, ultra: 90 }[qName === 'auto' ? 'moyen' : qName] || 36), c = new THREE.Vector3();
  return { air, update(tr, pl, hr, or, t) {
    c.set(0, 0, 0); let n = 0; for (const m of [tr.loco, ...tr.wagons.map(w => w.mesh)]) { c.add(m.position); n++; } c.divideScalar(n);
    const half = tr.totalLength / 2, R = or + half * 0.3;
    air.update(camera, t, c, R, !!tr.head);
    const show = pl.mode === 'foot' && pl.pos.distanceTo(c) < or + 60;
    heat.visible = show; if (!show) return;
    heat.position.copy(tr.loco.position); heat.scale.set(hr, hr * 0.55, hr);
    heat.material.uniforms.time.value = t % 1000;
  } };
})();
function renderHints() {
  const el = document.getElementById('keyhints'); if (!el) return;
  el.classList.toggle('hidden', !SET.hints || !started || !!cinematic);
  if (!SET.hints) return;
  const K = a => `<kbd>${keyLabel(SET.keys[a]?.[0])}</kbd>`, R = player.rules || {};
  const row = (k, label, blocked) => `<div class="kh${blocked ? ' off' : ''}" title="${blocked || ''}">${k}<span>${label}${blocked ? `<small>${blocked}</small>` : ''}</span></div>`;
  let h = '';
  if (player.mode === 'cab') {
    const steam = train.kind === 'vapeur';
    h += row(K('forward') + K('back'), 'Régulateur / marche arrière') + row(K('jump'), 'Frein') + row(K('action'), steam ? 'Pelleter du charbon' : 'Pomper (spam)') + row(K('left') + K('right'), 'Aiguillage') + row(K('turn'), 'Demi-tour (à l\'arrêt)') + row(K('whistle'), 'Sifflet') + row(K('interact'), 'Descendre');
  } else {
    h += row(K('forward') + K('left') + K('back') + K('right'), 'Se déplacer') + row(K('run'), player.sprinting ? 'Sprint ⚡' : 'Sprint (élixir ou clé à molette)', R.sprint) + row(K('jump'), 'Sauter') + row('maintenir ' + K('jump'), 'Jambes-ressorts : saut chargé', R.spring || R.jump) + row(K('interact'), 'Interagir') + row(K('action'), 'Action (miner, fondre…)');
  }
  h += row(K('view') + ' / molette', SET.fp ? '3e personne' : '1re personne / zoom') + row(K('map'), 'Carte') + row(K('hints'), 'Masquer ce panneau');
  if (R.label) h = `<div class="kh-zone">${R.label}</div>` + h;
  if (el.dataset.h !== h) { el.dataset.h = h; el.innerHTML = h; }
}
let meltProgress = 0, coldFaint = false, questGuard = false, phenoK = 0, lastFog = 1;

// ------------------------------------------------------------------ Écran titre
const BUILD = 'v39';
(function titleScreen() {
  { const v = document.createElement('div'); v.textContent = 'OCTORAIL ' + BUILD; v.style.cssText = 'position:fixed;right:10px;bottom:8px;font:12px Chakra Petch,sans-serif;color:#c8a25a;opacity:.75;z-index:99;pointer-events:none'; document.body.appendChild(v); }
  { const cr = document.querySelector('#title .credits'); let i = Math.floor(Math.random() * LOADING_TIPS.length); const tick = () => { if (cr && !started) { cr.textContent = '« ' + LOADING_TIPS[i++ % LOADING_TIPS.length] + ' »'; setTimeout(tick, 6000); } }; tick(); }
  const cbox = document.getElementById('colors');
  COLORS.forEach((c, i) => { const el = document.createElement('i'); el.style.background = c; if (i === 0) el.classList.add('on');
    el.onclick = () => { me.color = c; cbox.querySelectorAll('i').forEach(x => x.classList.remove('on')); el.classList.add('on'); audio.init(); audio.ui(); }; cbox.appendChild(el); });
  try { document.getElementById('name').value = localStorage.getItem('octorail-name') || ''; } catch {}
  let going = false;
  const go = async (room, host = null) => {
    if (going || started) return; going = true; // un seul départ, même si on spamme les boutons
    for (const id of ['play-solo', 'play-mp', 'play-join']) { const b = document.getElementById(id); if (b) { b.disabled = true; b.style.opacity = 0.55; } }
    audio.init(); audio.ui();
    me.name = (document.getElementById('name').value.trim() || 'Passager').slice(0, 14);
    try { localStorage.setItem('octorail-name', me.name); } catch {}
    if (room) {
      ui.toast('Connexion au salon ' + room.toUpperCase() + '…');
      const w = await netc.connect(room, { name: me.name, color: me.color }, host);
      if (w) {
        me.slot = w.slot; if (w.shared) S = { ...S, ...w.shared };
        for (const o of w.others) addRemote(o.id, o);
        ui.toast(`Salon <b>${w.room}</b> · ${w.others.length + 1} joueur(s)`);
      } else ui.toast(host ? `Impossible de joindre ${host} — vérifie l'adresse, Hamachi et que l'hôte a bien lancé son salon. Partie solo.` : 'Serveur multijoueur introuvable (lance OCTORAIL.exe pour héberger) — partie solo.');
    }
    start();
  };
  document.getElementById('play-solo').onclick = () => go(null);
  document.getElementById('play-mp').onclick = () => go(document.getElementById('room').value.trim() || 'OCTAVE');
  // rejoindre un ami par son adresse (Hamachi, réseau local…)
  { const hip = document.getElementById('host-ip'); try { hip.value = localStorage.getItem('octorail-host') || ''; } catch {}
    document.getElementById('play-join').onclick = async () => { let h = hip.value.trim().split(/[\s·,;]+/)[0]; if (!h) { hip.focus(); ui.toast('Entre l\'adresse de l\'hôte (ex : 25.12.34.56)'); return; }
      try { localStorage.setItem('octorail-host', h); } catch {}
      // test de joignabilité avant de lancer : message clair si bloqué
      document.getElementById('join-msg').textContent = 'Recherche de l\'hôte…';
      const base = 'http://' + (h.includes(':') ? h : h + ':8787'); const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 5000);
      const ok = await fetch(base + '/ping', { signal: ctl.signal, mode: 'no-cors' }).then(() => true).catch(() => false); // réponse quelconque = joignable clearTimeout(tm);
      const jm = document.getElementById('join-msg');
      if (!ok) { jm.innerHTML = (`❌ ${h} ne répond pas. Vérifie : 1) l'hôte a OCTORAIL ouvert, 2) vous êtes sur le même réseau Hamachi (ping ${h.split(':')[0]}), 3) l'hôte a cliqué « Autoriser mes amis (pare-feu) ».`).replace(/, (\d\))/g, '<br>$1'); audio.deny?.(); return; }
      jm.textContent = '✔ Hôte trouvé, connexion…';
      go(document.getElementById('room-join').value.trim() || 'OCTAVE', h); };
    const tabs = [['mp-tab-host', 'mp-host'], ['mp-tab-join', 'mp-join']];
    for (const [t, pnl] of tabs) document.getElementById(t).onclick = () => { for (const [t2, p2] of tabs) { document.getElementById(t2).classList.toggle('on', t2 === t); document.getElementById(p2).classList.toggle('hidden', p2 !== pnl); } audio.init(); audio.ui(); };
    // adresses de ce PC (servies par OCTORAIL.exe) : Hamachi (25.x) en premier
    fetch('/info').then(r => r.json()).then(i => { const ips = i.ips || [], ham = ips.find(a => a.startsWith('25.'));
        document.getElementById('my-ips').textContent = ham || (ips.find(a => a.startsWith('192.168.')) || ips[0] || 'aucune (pas de réseau ?)');
        document.getElementById('my-ips').title = 'Autres adresses de ce PC : ' + ips.join(', ');
        if (!ham) document.getElementById('my-ips').insertAdjacentHTML('afterend', '<small style="display:block;opacity:.7">(Hamachi non détecté : adresse du réseau local)</small>');
        if (i.desktop) { const fw = document.createElement('button'); fw.className = 'small'; fw.textContent = '🛡️ Autoriser mes amis (pare-feu Windows)'; fw.onclick = () => { fw.textContent = 'Confirme la demande de Windows…'; fetch('/firewall').then(r => r.json()).then(o => { fw.textContent = o.ok ? '✔ Pare-feu ouvert pour OCTORAIL' : '✖ Refusé — relance et accepte la demande'; }); }; document.getElementById('play-mp').before(fw); } })
      .catch(() => { document.getElementById('my-ips').textContent = 'lance OCTORAIL.exe pour héberger'; document.getElementById('play-mp').disabled = true; }); }
  const qs = document.getElementById('quality'); qs.value = qName;
  qs.onchange = () => { SET.quality = qs.value; saveSettings(SET); location.reload(); };
  document.getElementById('reset').onclick = () => { clearState(); S = loadState(); ui.toast('Sauvegarde effacée'); };
  document.getElementById('end-continue').onclick = () => { ui.show('endcard', false); input.wantLock = true; };
})();

function start() {
  if (started) return;
  started = true;
  ui.show('title', false); ui.show('hud', true);
  player = new Player(scene, terrain, me.color);
  const startNode = 'H' + STATIONS[me.slot % 8];
  train = new Train(net, scene, { loco: S.owned.vapeur ? 'vapeur' : 'draisine', wagons: wagonList(), tint: TRAIN_TINTS[me.slot % 8], startNode });
  if (S.owned.vapeur) { train.coal = 20; train.water = 60; }
  if (S.owned.sac) player.bagMax = 8;
  if (S.sheriff === 'carried' && S.carrier !== (netc.id ?? 'me') && S.carrier !== 'me' && !remotes.has(S.carrier)) S.carrier = netc.id ?? 'me'; // porteur disparu (rechargement)
  // spawn à côté des capsules
  // chaque passager a SA capsule cryo (une par joueur) : il y apparaît puis en est expulsé
  const pa = (me.slot % 8) * Math.PI / 4 + Math.PI / 8; player.pos.set(Math.cos(pa) * 6.6, 0.85, -Math.sin(pa) * 6.6); camInit = false;
  player.eject = { t: 0, a: pa }; setTimeout(() => { for (const m of [train.loco, ...train.wagons.map(w => w.mesh)]) vehicleTop(m, m.position.x, m.position.z); }, 300); player.yaw = Math.atan2(-Math.cos(pa), Math.sin(pa)) + Math.PI; // dos à la capsule
  player.yaw = Math.PI / 2; // regarde vers l'Ouest (quai de la draisine)
  if (!S.introDone) intro(); else { ui.toast('Bon retour sur Halcyre.', true); ui.objective(STAGES[S.stage].text); }
  refreshFinds(); refreshResources(); placeSheriff();
  input.wantLock = true;
  const lastMsg = {};
  player.onBlocked = (what, msg) => { const now = performance.now(); if (now - (lastMsg[what] || 0) > 2500) { lastMsg[what] = now; ui.toast('⛔ ' + msg); audio.deny(); } };
  player.onSprint = () => { audio.clunk(); };
  player.onSpringJump = (c) => { audio.tone(audio.now, 180, 0.35, { type: 'sine', vol: 0.25, glide: 3 + c * 3 }); };
}

function wagonList() {
  const w = [];
  if (S.owned.vapeur) w.push('charbon');
  if (S.owned.vitrine) w.push('vitrine');
  if (S.owned.stockage) w.push('stockage');
  if (S.owned.dortoir) w.push('dortoir');
  if (S.owned.plateau) w.push('plateau');
  if (S.owned.cryo) w.push('cryo');
  return w;
}



// ------------------------------------------------------------------ Connexion / déconnexion : faisceau de cryo-transfert
const beams = [];
const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true); beamGeo.translate(0, 0.5, 0);
function beamFx(pos, color, dir = 1, dur = 1.6) {
  const m = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  m.position.copy(pos); m.userData.noCollide = true; m.userData.noCull = true; m.frustumCulled = false; scene.add(m);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 6, 32), m.material.clone()); ring.rotation.x = Math.PI / 2; ring.position.copy(pos); ring.userData.noCollide = true; scene.add(ring);
  audio.noiseBurst(audio.now, dur * 0.8, dir > 0 ? 2400 : 900, 0.35, 0.4, 'bandpass');
  const b = { m, ring, t: 0, dur, dir, pos: pos.clone() }; beams.push(b); return b;
}
function updateBeams(dt) {
  for (let i = beams.length - 1; i >= 0; i--) { const b = beams[i]; b.t += dt; const k = b.t / b.dur, env = Math.sin(Math.min(1, k) * Math.PI);
    b.m.scale.set(0.9 + env * 0.5, 40 * (b.dir > 0 ? Math.min(1, k * 3) : 1), 0.9 + env * 0.5); b.m.material.opacity = env * 0.55;
    b.ring.position.y = b.pos.y + (b.dir > 0 ? k : 1 - k) * 3.2; b.ring.scale.setScalar(1 + env * 0.6); b.ring.material.opacity = env;
    if (Math.random() < 0.6) sparks.emit(b.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 3, (Math.random() - 0.5) * 2)), new THREE.Vector3(0, b.dir * (3 + Math.random() * 5), 0), { life: 0.8, size: 0.3, color: '#bdf3ff' });
    if (k >= 1) { scene.remove(b.m); scene.remove(b.ring); b.m.material.dispose(); b.ring.material.dispose(); b.ring.geometry.dispose(); beams.splice(i, 1); b.done?.(); } }
  // départs : l'avatar s'étire et monte dans le faisceau, le train s'évapore en vapeur
  for (let i = departures.length - 1; i >= 0; i--) { const d = departures[i]; d.t += dt; const k = Math.min(1, d.t / 1.5);
    d.avatar.scale.set(1 - k * 0.85, 1 + k * 2.5, 1 - k * 0.85); d.avatar.position.y = d.y0 + k * k * 6;
    if (d.train.head && Math.random() < 0.8) for (const mm of [d.train.loco, ...d.train.wagons.map(w => w.mesh)]) steam.emit(mm.position.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3((Math.random() - 0.5) * 3, 3 + Math.random() * 3, (Math.random() - 0.5) * 3), { life: 1.4, size: 2.4, color: '#e8fbff', alpha: 0.5 });
    if (k >= 1) { scene.remove(d.avatar); d.train.dispose(); departures.splice(i, 1); } }
}
const departures = [];
const podPos = slot => { const a = (slot % 8) * Math.PI / 4 + Math.PI / 8; return new THREE.Vector3(Math.cos(a) * 6.6, 0.3, -Math.sin(a) * 6.6); };

// ------------------------------------------------------------------ Multijoueur
function addRemote(id, o) {
  if (remotes.has(id)) return;
  const slot = remotes.size + 1;
  const avatar = buildAvatar(o.color); avatar.visible = false; scene.add(avatar);
  const ps = o.slot ?? slot; const tr = new Train(net, scene, { remote: true, tint: TRAIN_TINTS[ps % 8], startNode: 'H' + STATIONS[ps % 8] });
  const tag = makeNameTag(o.name, o.color); avatar.add(tag);
  remotes.set(id, { avatar, train: tr, name: o.name, color: o.color, state: o.state, slot: ps, fresh: !o.state });
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
netc.on('close', () => { if (started && netc.id) ui.toast('⚠️ Connexion au salon perdue : tu continues en solo.'); });
// TAB : tableau des passagers (stats en direct)
const tabEl = document.createElement('div'); tabEl.id = 'tabboard'; tabEl.className = 'panel hidden'; document.getElementById('hud').appendChild(tabEl);
function renderTab() {
  const modeTxt = m => m === 'cab' ? '🚂 conduit' : m === 'ride' ? '🪑 passager' : '🚶 à pied';
  const row = (name, color, slot, st, m, ping) => `<tr><td><i style="background:${color}"></i>${name}</td><td>${(slot ?? 0) + 1}</td><td>${st?.h ? 'Le Moyeu' : (st?.w || '—')}</td><td>${modeTxt(m)}</td><td>${st?.o2 ?? '—'}%</td><td>${st?.tp ?? '—'}%</td><td>${((st?.d || 0) / 1000).toFixed(2)} km</td><td>${st?.b ?? 0}</td><td>${ping}</td></tr>`;
  const mine = { o2: Math.round(player.oxy ?? 100), tp: Math.round(player.temp), d: stats.dist, b: stats.bumps, w: BIOMES[sectorIndex(player.pos.x, player.pos.z)]?.name, h: Math.hypot(player.pos.x, player.pos.z) < 95 };
  const mins = Math.floor((performance.now() - stats.t0) / 60000);
  tabEl.innerHTML = `<h3>PASSAGERS DE L'OCTAVE <small>${1 + remotes.size}/8 · session ${mins} min · ${S.credits | 0} crédits</small></h3><table><tr><th>Nom</th><th>Gare</th><th>Monde</th><th>État</th><th>O₂</th><th>Chaleur</th><th>Distance</th><th>Tampons</th><th></th></tr>`
    + row(me.name + ' (toi)', me.color, me.slot, mine, player.mode, '')
    + [...remotes.values()].map(r => row(r.name, r.color, r.slot, r.state?.st, r.state?.m, r.state ? '' : '⏳')).join('') + '</table><button class="close">Fermer [Tab / Échap]</button>';
}
// TAB ouvre/ferme une vraie fenêtre (comme le menu Échap) ; Échap ou TAB la referme
function tabOpen(on) {
  tabEl.classList.toggle('hidden', !on); clearInterval(tabEl._iv);
  if (on) { renderTab(); tabEl._iv = setInterval(renderTab, 300); if (document.pointerLockElement) document.exitPointerLock(); audio.ui?.(); }
}
addEventListener('keydown', e => {
  if (!started) return;
  if (e.code === 'Tab') { e.preventDefault(); e.stopImmediatePropagation(); tabOpen(tabEl.classList.contains('hidden')); }
  else if (e.code === 'Escape' && !tabEl.classList.contains('hidden')) { e.preventDefault(); e.stopImmediatePropagation(); tabOpen(false); }
}, true);
tabEl.addEventListener('click', e => { if (e.target.classList.contains('close')) tabOpen(false); });
netc.on('leave', m => { const r = remotes.get(m.id); if (!r) return; remotes.delete(m.id);
  beamFx(r.avatar.position.clone().setY(r.avatar.position.y - 0.2), r.color, 1); departures.push({ avatar: r.avatar, train: r.train, t: 0, y0: r.avatar.position.y });
  ui.toast(`<b style="color:${r.color}">${r.name}</b> retourne en sommeil cryogénique`); updatePlayersList(); });
netc.on('state', m => { const r = remotes.get(m.id); if (!r) return; if (!r.state && r.fresh) { r.fresh = false; beamFx(podPos(r.slot), r.color, -1, 1.4); } r.state = m.s; r.newState = true; });
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
// les gisements se reconstituent : toutes les 90 s, un tiers des pépites et cristaux ramassés réapparaît
setInterval(() => { if (!started) return; let n = 0;
  for (const [arr, list] of [[S.nuggets, nuggets.list], [S.crystals, crystals.list]]) { const k = Math.ceil(arr.length / 3); for (const i of arr.splice(0, k)) { const o = list[i]; if (!o) continue; o.alive = true; o.m.visible = true; if (o.hp !== undefined) { o.hp = 1; o.m.scale.set(0.8, 1.8, 0.8); } n++; } }
  if (n) { pushShared(); if (Math.random() < 0.5) ui.toast('✨ De l\'Or-moteur et de la glace-mémoire ont réapparu dans les mondes.'); } }, 90000);
// fragments de lore lus dans les mondes : +20 crédits chacun (une fois)
setInterval(() => { if (!started || !S.fragments) return; const paid = S.fragPaid | 0; if (S.fragments.length > paid) { const d = S.fragments.length - paid; S.fragPaid = S.fragments.length; addCredits(20 * d, `fragment${d > 1 ? 's' : ''} de lore archivé${d > 1 ? 's' : ''} par OCTAVE`); } }, 2000);
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
  const toSell = player.bag.filter(b => !b.fuel);
  if (toSell.length) {
    const total = toSell.reduce((a, b) => a + b.value, 0);
    const n = toSell.length; player.bag = player.bag.filter(b => b.fuel); ui.bag(player.bag, player.bagMax);
    addCredits(total, `${n} objet(s) vendu(s)`);
  }
  if (train.storage?.length) { const t = train.storage.reduce((a, b) => a + b.value, 0); train.storage = []; addCredits(t, 'wagon-stockage vidé'); }
  { const how = document.createElement('div'); how.className = 'shop-how';
    how.innerHTML = '<b>Gagner des crédits :</b> 🪙 pépites d\'<b>Or-moteur</b> (elles fuient, attrape-les avec E) · 💠 <b>glace-mémoire</b> en Gelure ([F] maintenu) · ✦ <b>trouvailles</b> (+50) · 📜 <b>fragments</b> de lore dans chaque monde (E, +20) · 🤖 <b>gardiens</b> ramenés chez eux (+150). Le sac se revend tout seul en ouvrant le Comptoir. Pépites et glace repoussent toutes les 90 s.';
    list.appendChild(how); }
  // onglets (sous-menus) : jamais de longue liste à faire défiler
  const CATS = [['trains', '🚂 Trains', it => it.id === 'vapeur' || it.id === 'convoyeur'], ['wagons', '🚃 Wagons', it => it.wagon], ['outils', '🛠️ Outils', it => !it.wagon && !['vapeur', 'convoyeur', 'doublure', 'sac'].includes(it.id)], ['tenue', '🎒 Tenue', it => ['doublure', 'sac'].includes(it.id)]];
  openShop.tab ??= 'trains';
  const tabs = document.createElement('nav'); tabs.className = 'tabs shop-tabs';
  for (const [id, label, f] of CATS) { const n = SHOP.filter(f).filter(it => !S.owned[it.id]).length; const b = document.createElement('button'); b.innerHTML = label + (n ? ` <small>${n}</small>` : ''); if (id === openShop.tab) b.className = 'on'; b.onclick = () => { openShop.tab = id; openShop.page = 0; audio.ui?.(); openShop(); }; tabs.appendChild(b); }
  list.appendChild(tabs);
  const catF = CATS.find(c => c[0] === openShop.tab)[2], items = SHOP.filter(catF), PER = openShop.per ?? 4, pages = Math.ceil(items.length / PER);
  openShop.page = Math.min(openShop.page || 0, pages - 1);
  if (pages > 1) { const pg = document.createElement('div'); pg.className = 'shop-pages';
    const mk = (t, d) => { const b = document.createElement('button'); b.textContent = t; b.disabled = (openShop.page + d < 0 || openShop.page + d >= pages); b.onclick = () => { openShop.page += d; audio.ui?.(); openShop(); }; return b; };
    pg.append(mk('◀', -1), Object.assign(document.createElement('span'), { textContent: `Page ${openShop.page + 1} / ${pages}` }), mk('▶', 1)); list.appendChild(pg); }
  const KNOWN_DEMO = ['vapeur', 'chalumeau', 'vitrine', 'stockage', 'doublure', 'sac', 'convoyeur', 'dortoir'];
  for (const it of items.slice(openShop.page * PER, openShop.page * PER + PER)) {
    const owned = !!S.owned[it.id], locked = it.needs && !S.owned[it.needs];
    const row = document.createElement('div'); row.className = 'item' + (owned ? ' owned' : '');
    row.innerHTML = (KNOWN_DEMO.includes(it.id) ? `<div class="demo" data-demo="${it.id}"><small class="demo-cap"></small></div>` : `<div class="demo icon-demo"><span>${it.icon}</span></div>`) + `<div><b>${it.icon} ${it.name}</b><small>${it.desc}</small></div>`;
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
  // ajustement automatique : moins d'objets par page tant que ça dépasse (jamais de scroll)
  clearInterval(openShop.fit); let tries = 0;
  openShop.fit = setInterval(() => { const e = document.getElementById('shop'); if (!e || e.classList.contains('hidden') || ++tries > 12) { clearInterval(openShop.fit); return; }
    if (e.scrollHeight > e.clientHeight + 2 && PER > 1) { clearInterval(openShop.fit); openShop.per = PER - 1; openShop(); } }, 300);
  import('./ui/previews.js').then(m => m.attachPreviews(list, () => ui.panel === 'shop'));   // démos animées (rendu seulement boutique ouverte)
}

// ------------------------------------------------------------------ Carte
// --- brouillard de carte : seules les zones déjà visitées sont dévoilées (cases de 40 m, sauvegardées)
const EXPL_C = 40; let explored = null;
function exploreTick() { explored ??= new Set(S.explored || []); let add = false;
  const mark = (p, R) => { if (!p) return; const c0x = Math.floor((p.x - R) / EXPL_C), c1x = Math.floor((p.x + R) / EXPL_C), c0z = Math.floor((p.z - R) / EXPL_C), c1z = Math.floor((p.z + R) / EXPL_C);
    for (let i = c0x; i <= c1x; i++) for (let j = c0z; j <= c1z; j++) { if (Math.hypot((i + 0.5) * EXPL_C - p.x, (j + 0.5) * EXPL_C - p.z) > R) continue; const k = i + ',' + j; if (!explored.has(k)) { explored.add(k); add = true; } } };
  mark({ x: 0, z: 0 }, 130); mark(player.pos, 110); if (player.mode !== 'foot' && train.head) mark(train.head, 140);
  if (add) { S.explored = [...explored]; } }
setInterval(() => { if (started && player) exploreTick(); }, 500);
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
  // brouillard par-dessus le décor de carte, puis seulement ma position (les inconnus restent cachés)
  { exploreTick(); const f = drawMap.fog ??= document.createElement('canvas'); f.width = f.height = W; const fg = f.getContext('2d');
    fg.globalCompositeOperation = 'source-over'; fg.fillStyle = '#0d0906'; fg.fillRect(0, 0, W, W);
    for (let i = 0; i < 260; i++) { fg.fillStyle = `rgba(${40 + (i * 37) % 30},${30 + (i * 13) % 20},20,0.08)`; const x = (i * 9301 + 49297) % W, y = (i * 49297 + 9301) % W; fg.beginPath(); fg.arc(x, y, 30 + (i * 7) % 50, 0, 7); fg.fill(); }
    fg.globalCompositeOperation = 'destination-out'; const rr = EXPL_C * sc * 0.95;
    for (const k of explored) { const [i, j] = k.split(',').map(Number); const [x, y] = P((i + 0.5) * EXPL_C, (j + 0.5) * EXPL_C); const gr = fg.createRadialGradient(x, y, rr * 0.4, x, y, rr * 1.4); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); fg.fillStyle = gr; fg.fillRect(x - rr * 1.5, y - rr * 1.5, rr * 3, rr * 3); }
    g.drawImage(f, 0, 0); g.fillStyle = '#c8a25a'; g.font = '13px Chakra Petch'; g.textAlign = 'left'; g.fillText(`Exploré : ${Math.round(explored.size / 4200 * 100)} %`, 12, W - 12); }
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

const _lw = new THREE.Vector3();
const FUEL_SACK = { coal: { icon: '⚫', name: 'le sac de charbon', amount: 8 }, water: { icon: '💧', name: 'le seau d\'eau', amount: 25 } };
function fuelSackIdx() { return player.bag.findIndex(b => b.fuel); }
function bagFuelName() { const b = player.bag.find(x => x.fuel); return b ? FUEL_SACK[b.fuel].name : ''; }
// Verse tous les sacs/seaux du sac dans le wagon à charbon ; renvoie true si quelque chose a été versé
function pourFuelSacks() {
  if (!S.owned.vapeur) return false;
  let did = false;
  for (let i = player.bag.length - 1; i >= 0; i--) {
    const b = player.bag[i]; if (!b.fuel) continue;
    const full = b.fuel === 'coal' ? train.coal >= train.maxCoal : train.water >= train.maxWater;
    if (full) { ui.toast(b.fuel === 'coal' ? 'Le wagon à charbon est déjà plein.' : 'Le réservoir est déjà plein.'); audio.deny(); continue; }
    if (b.fuel === 'coal') train.coal = Math.min(train.maxCoal, train.coal + b.amount); else train.water = Math.min(train.maxWater, train.water + b.amount);
    player.bag.splice(i, 1); did = true;
    if (b.fuel === 'coal') audio.shovel(); else { audio.setMelt(1); setTimeout(() => audio.setMelt(0), 700); }
    ui.toast(b.fuel === 'coal' ? `+${b.amount} charbon dans le wagon à charbon` : `+${b.amount} eau dans le réservoir`);
  }
  if (did) { ui.bag(player.bag, player.bagMax); checkFuel(); }
  return did;
}
function interactLabel(it, cur) {
  const far = !trainNear(it.pos, FUEL_R);
  if (it.id === 'coal') {
    if (!S.owned.vapeur) return 'Charbonnière — pas de loco à vapeur (Comptoir) : [E] pour en savoir plus';
    return far ? '[E] Prendre un sac de charbon (le train est loin) — à verser dans le wagon à charbon' : '[E] Charger 10 charbon dans le wagon à charbon';
  }
  if (it.id === 'water') {
    if (!S.owned.vapeur) return 'Château d\'eau — pas de loco à vapeur (Comptoir) : [E] pour en savoir plus';
    return far ? '[E] Remplir un seau d\'eau (le train est loin) — à verser dans le réservoir' : '[E] Remplir le réservoir d\'eau';
  }
  if (it.id === 'shop') return '[E] Ouvrir le Comptoir (vend ton sac, améliorations)';
  if (it.id === 'hall') return '[E] Lire : Hall des trouvailles';
  return cur;
}
function takeFuelSack(kind) {
  if (player.bag.length >= player.bagMax) { ui.toast('Sac plein ! Revends au Comptoir ou verse ton sac dans le wagon à charbon.'); audio.deny(); return; }
  const f = FUEL_SACK[kind];
  player.bag.push({ icon: f.icon, value: 0, fuel: kind, amount: f.amount }); ui.bag(player.bag, player.bagMax);
  if (kind === 'coal') audio.shovel(); else { audio.setMelt(1); setTimeout(() => audio.setMelt(0), 700); }
  ui.toast(`${f.icon} Tu prends ${f.name} (${kind === 'coal' ? '+8 charbon' : '+25 eau'}). Approche-toi de ta loco et appuie sur E pour le verser.`);
}

function handleFootInteract() {
  { const oc = octuor?.foot(player, input.a('action'), input.ah('interact'), fdt); if (oc) { ui.prompt(oc); return; } }
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
  if (it) label = interactLabel(it, label);
  const sackNear = fuelSackIdx() >= 0 && S.owned.vapeur && train.head && train.loco.getWorldPosition(_lw).distanceTo(player.pos) < 9;
  if (sackNear && dCab >= 5 && (!it || it.id === 'coal' || it.id === 'water')) label = `[E] Verser ${bagFuelName()} ${player.bag.find(x => x.fuel)?.fuel === 'water' ? 'dans le réservoir' : 'dans le wagon à charbon'}`;
  else if (sackNear && dCab < 5) label = '[E] Monter en cabine (verse le sac dans le wagon à charbon)';
  for (const r of remotes.values()) if (r.train.head && locoCabWorld(r.train).distanceTo(player.pos) < 5 && dCab >= 5) label = `[E] Monter dans le train de ${r.name}`;
  ui.prompt(label);

  if (input.ah('interact')) {
    if (dCab < 5) { pourFuelSacks(); player.mode = 'cab'; audio.clunk(); return; }
    if (sackNear && (!it || it.id === 'coal' || it.id === 'water') && pourFuelSacks()) return;
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
  if (it.id === 'dormant') { ui.say([{ who: 'OCTAVE', icon: '◈', color: '#ffb347', beep: 900, text: `${it.label.split(' — ')[0]} : ${it.info}. Ce bâtiment dort depuis le Déraillement. Il se réveillera quand un gardien rentrera chez lui.` }]); return; }
  if (it.id === 'shop') return openShop();
  if (it.id === 'coal') {
    if (!S.owned.vapeur) { ui.toast('La Charbonnière alimente les locomotives à vapeur. Achète-en une au Comptoir du Moyeu.'); audio.deny(); return; }
    if (trainNear(it.pos, FUEL_R)) { if (train.coal >= train.maxCoal) { ui.toast('Le wagon à charbon est plein.'); audio.deny(); return; } train.coal = Math.min(train.maxCoal, train.coal + 10); audio.shovel(); ui.toast('+10 charbon'); checkFuel(); return; }
    return takeFuelSack('coal');
  }
  if (it.id === 'water') {
    if (!S.owned.vapeur) { ui.toast('Le Château d\'eau remplit les locomotives à vapeur. Achète-en une au Comptoir du Moyeu.'); audio.deny(); return; }
    if (trainNear(it.pos, FUEL_R)) { if (train.water >= train.maxWater) { ui.toast('Réservoir déjà plein.'); audio.deny(); return; } train.water = train.maxWater; audio.setMelt(1); setTimeout(() => audio.setMelt(0), 900); ui.toast('Réservoir plein'); checkFuel(); return; }
    return takeFuelSack('water');
  }
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
  for (const k of ['bloom', 'shadows', 'shake', 'compass', 'invertY', 'smooth', 'hints', 'fp']) $('s-' + k).checked = SET[k];
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
  for (const k of ['bloom', 'shadows', 'shake', 'compass', 'invertY', 'smooth', 'hints', 'fp']) $('s-' + k).onchange = e => { SET[k] = e.target.checked; applySettings(); };
  $('s-quality').onchange = e => { SET.quality = e.target.value; saveSettings(SET); ui.toast('Qualité appliquée au prochain lancement (page rechargée).'); setTimeout(() => location.reload(), 900); };
  $('keys-reset').onclick = () => { SET.keys = JSON.parse(JSON.stringify(DEFAULT_SET.keys)); applySettings(); renderKeys(); };
  $('resume').onclick = () => { ui.closePanels(); input.wantLock = true; input.lock(); };
  $('to-title').onclick = () => { saveState(S); ui.hidePanels?.(); document.getElementById('pause')?.classList.add('hidden');
    if (player.mode !== 'foot' || !started) { location.reload(); return; }
    player.eject = null; beamFx(player.pos.clone(), me.color, 1); departures.push({ avatar: player.avatar, train: { head: null, dispose() {}, loco: null, wagons: [] }, t: 0, y0: player.pos.y });
    player.leaving = true; setTimeout(() => ui.fade(true, true), 700); setTimeout(() => location.reload(), 1900); };
  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && started && !ui.panel && !ui.dialogOpen && !cinematic && input.wantLock && $('endcard').classList.contains('hidden')) openPause();
  });
})();

// ------------------------------------------------------------------ Boucle
const amb = { skyTop: new THREE.Color(), skyBot: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), fogD: 0 };
const clock = new THREE.Clock();
let chuffAcc = 0, lastSwitchEvt = 0, ambTimer = 0, cabFace = 0, cabTurn = 0; // cabFace : 0 = conducteur face à l'avant, 1 = face à l'arrière (marche arrière)
const camPos = new THREE.Vector3(30, 20, 30), camLook = new THREE.Vector3();

function frame() {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(); const dt = Math.min(0.25, raw); fdt = dt; time += dt; // temps réel même à bas FPS (sous-pas dans la physique)
  if (started) adaptQuality(Math.min(0.5, raw));
  if (!started) { titleCam(dt); render(); return; }

  // Échap : si le navigateur vient de libérer la souris (même appui), on ne referme pas le menu aussitôt
  if (input.ah('pause') && !(performance.now() - input.lastUnlock < 300 && ui.panel === 'pause')) { if (ui.panel) { ui.closePanels(); input.wantLock = true; } else if (!cinematic && !ui.dialogOpen) openPause(); }
  if (input.hit('Help') || input.ah('help')) ui.toggleHelp();
  updateLockHint();
  if (input.ah('map')) { if (ui.panel === 'map') ui.closePanels(); else if (compass.event) { ui.toast('🧭 La boussole est perturbée : impossible de lire la carte pour l\'instant.'); audio.deny(); } else { ui.openPanel('map'); drawMap(); } }
  if (ui.panel === 'map' && compass.event) { ui.closePanels(); ui.toast('🧭 La carte se brouille avec la boussole…'); }
  if (ui.panel === 'map') drawMap();
  if (input.ah('interact') && ui.dialogOpen) { ui.advance(); input.consume('interact'); }
  if (input.hit('Mouse0') && ui.dialogOpen && input.mouse.locked) ui.advance();
  const busy = ui.dialogOpen || ui.panel || cinematic || !tabEl.classList.contains('hidden');

  // molette : zoom ; tout près -> 1re personne ; V : bascule
  if (!busy && input.wheel) {
    if (SET.fp) { if (input.wheel > 0) { SET.fp = false; camZoom = 2.6; } }
    else { camZoom = Math.max(2.2, Math.min(22, camZoom * (1 + input.wheel * 0.12))); if (input.wheel < 0 && camZoom <= 2.2) SET.fp = true; }
    saveSettings(SET);
  }
  if (!busy && input.ah('view')) { SET.fp = !SET.fp; saveSettings(SET); ui.toast(SET.fp ? 'Vue à la 1re personne' : 'Vue à la 3e personne'); }
  if (input.ah('hints')) { SET.hints = !SET.hints; saveSettings(SET); }
  player.fp = SET.fp;
  if (!busy) player.look(input, SET.sens, SET.invertY, SET.smooth);

  // --- train local
  let tin = { throttle: 0, brake: false, pump: false };
  if (player.mode === 'cab' && !busy) {
    if (input.a('forward')) tin.throttle = 1;
    if (input.a('back')) tin.throttle = -1;
    tin.brake = input.a('jump');
    if (train.kind === 'draisine') tin.pump = input.ah('action');
    else if (input.ah('action')) { const r = train.shovel(); if (r === true) { audio.shovel(); for (let k = 0; k < 10; k++) sparks.emit(locoCabWorld(train).add(new THREE.Vector3(0, 0.6, 0)), new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 4, (Math.random() - 0.5) * 3), { life: 0.5, size: 0.4, color: '#ff7a2a' }); } else if (r === 'empty') { audio.deny(); ui.toast('Wagon à charbon vide ! Recharge à la Charbonnière du Moyeu.'); } }
    if (input.ah('left')) { train.nudgePref(-1); audio.clunk(); }   // aiguillage : A = à gauche (par rapport au sens de marche), D = à droite, la touche opposée revient tout droit
    if (input.ah('right')) { train.nudgePref(1); audio.clunk(); }
    if (input.ah('turn')) {
      if (train.turnAround()) { audio.whistle(0.5); audio.noiseBurst(audio.now, 1.2, 900, 0.6, 0.5, 'lowpass'); for (let k = 0; k < 40; k++) steam.emit(train.loco.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0.5, (Math.random() - 0.5) * 6)), new THREE.Vector3((Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3), { life: 1.6, size: 2.2, color: '#ffffff', alpha: 0.7 }); ui.toast('Vérin de retournement : demi-tour !'); }
      else { audio.deny(); ui.toast(Math.abs(train.speed) >= 0.6 ? 'Arrête le train pour faire demi-tour.' : 'Pas ici : tout le train doit être sur les rails (éloigne-toi du butoir).'); }
    }
    if (input.ah('whistle')) { audio.whistle(1.3); netc.send({ t: 'event', e: 'whistle' }); for (let k = 0; k < 25; k++) steam.emit((train.loco.userData.whistle ? train.loco.userData.whistle.getWorldPosition(new THREE.Vector3()) : train.loco.localToWorld(new THREE.Vector3(0.5, 3.4, 1))), new THREE.Vector3(Math.random() * 2, 4 + Math.random() * 3, 0), { life: 1.2, size: 1.2, color: '#fff', alpha: 0.8 }); }
    if (input.ah('interact')) { player.mode = 'foot'; cabFace = 0; cabTurn = 0; const side = train.loco.localToWorld(new THREE.Vector3(2.6, 0, train.loco.userData.cab.z)); player.pos.copy(side); player.pos.y = player.groundAt(side.x, side.z) + 0.5; audio.clunk(); input.consume('interact'); }
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
      if (player.leaving) { /* départ : animé par updateBeams */ } else if (player.eject) {
        const E = player.eject; E.t += dt; const k = Math.min(1, E.t / 1.6), r = 6.6 + k * 4.2;
        player.pos.set(Math.cos(E.a) * r, 0.85 + Math.sin(k * Math.PI) * 1.4 - k * 0.6, -Math.sin(E.a) * r); player.avatar.position.copy(player.pos); player.avatar.rotation.y = E.a + Math.PI / 2;
        if (E.t < 0.05) { audio.noiseBurst(audio.now, 1.2, 1200, 0.5, 0.5, 'highpass'); for (let q = 0; q < 40; q++) steam.emit(new THREE.Vector3(Math.cos(E.a) * 6.6, 1.5, -Math.sin(E.a) * 6.6), new THREE.Vector3(Math.cos(E.a) * (2 + Math.random() * 4), Math.random() * 3, -Math.sin(E.a) * (2 + Math.random() * 4)), { life: 1.8, size: 1.6, color: '#dff6ff', alpha: 0.7 }); }
        if (k >= 1) { player.eject = null; player.pos.y = player.groundAt(player.pos.x, player.pos.z); }
      } else {
      player.rules = zoneRules({ x: player.pos.x, z: player.pos.z, temp: player.temp, inHub: Math.hypot(player.pos.x, player.pos.z) < 75,
        inTunnel: TSUNAMI_ZONE.set && TSUNAMI_ZONE.test(player.pos.x, player.pos.z), nearTown: player.pos.distanceTo(western.pedestal) < 130 });
      player.others = [...remotes.values()].filter(r => r.state && r.state.m === 'foot').map(r => r.avatar.position);
      const moving = player.updateFoot(dt, input, [trainDeckCollider]);
      handleFootInteract();
      if (moving > 0.5 && sectorIndex(player.pos.x, player.pos.z) === 5 && Math.random() < 0.3) smoke.emit(player.pos.clone().add(new THREE.Vector3(0, 0.1, 0)), new THREE.Vector3(0, 0.5, 0), { life: 0.8, size: 0.6, color: '#ffffff', alpha: 0.5 });
      }
    } else ui.prompt(null);
  } else {
    ui.prompt(null);
    if (player.mode === 'cab') {
      // le conducteur se tourne vers l'arrière en marche arrière (rotation douce), puis revient face à l'avant
      if (train.speed < -0.3) cabFace = 1; else if (train.speed > 0.3) cabFace = 0;
      cabTurn += (cabFace - cabTurn) * Math.min(1, dt * 5);
      const c = train.loco.localToWorld(train.cabLocal(cabTurn));
      player.pos.copy(c); player.avatar.position.copy(c); player.avatar.rotation.y = train.loco.rotation.y + Math.PI * cabTurn; player.animate(0);
      if (train.kind === 'draisine') { const lv = train.loco.userData.lever.rotation.x, arms = player.avatar.userData.arms, a = -1.25 - (1 - 2 * cabTurn) * lv * 0.9; arms[0].rotation.x = a; arms[1].rotation.x = a; arms[0].rotation.z = 0.05; arms[1].rotation.z = -0.05; } // mains sur la poignée du balancier
    }
    else if (player.mode === 'ride') {
      const r = remotes.get(player.rideId);
      if (!r) player.mode = 'foot';
      else { const c = r.train.loco.localToWorld(new THREE.Vector3(1.2, 1.45, r.train.loco.userData.cab.z)); player.pos.copy(c); player.avatar.position.copy(c); player.avatar.rotation.y = r.train.loco.rotation.y;
        ui.prompt(`🪑 Tu es <b>passager</b> du train de <b style="color:${r.color}">${r.name}</b> — c'est lui qui conduit · [E] descendre`);
        if (input.ah('interact') && !busy) { player.mode = 'foot'; player.pos.x += 3; } }
    }
  }
  ui.train(train, player.mode === 'cab');

  // --- froid en Gelure
  const sec = sectorIndex(player.pos.x, player.pos.z), R = Math.hypot(player.pos.x, player.pos.z);
  const inGelure = sec === 5 && R > 140;
  if (R > 180 && started && !cinematic && !ui.dialogOpen) { S.seen ??= []; if (!S.seen.includes(sec)) { S.seen.push(sec); saveState(S); const L = WORLD_LORE[sec];
    if (L) { ui.toast(`<b>${BIOMES[sec].name}</b> — ${BIOMES[sec].tagline}`); ui.say([{ who: 'OCTAVE (radio)', icon: '◈', color: '#ffb347', beep: 900, text: L.intro }]); } } }
  const dVeh = (() => { let d = 1e9; for (const m of [train.loco, ...train.wagons.map(w => w.mesh)]) d = Math.min(d, player.pos.distanceTo(m.position)); return d; })();
  const heatR = train.kind === 'vapeur' ? (S.owned.dortoir ? 22 : 15) : 8; // bulle de chaleur : chaudière (et dortoir)
  const warmTrain = dVeh < heatR;
  bubbles.update(train, player, heatR, OXY_R, time);
  if (inGelure && player.mode === 'foot' && !warmTrain) player.temp = Math.max(0, player.temp - dt * (S.owned.doublure ? 1.2 : 3.6));
  else player.temp = Math.min(100, player.temp + dt * (warmTrain || player.mode !== 'foot' ? 25 : 8));
  ui.temp(player.temp, player.temp < 99.5 || (inGelure && player.mode === 'foot' && !warmTrain)); // à bord ou dans la chaleur du train et réchauffé : pas de barre de froid
  // --- oxygène : l'air d'Halcyre hors du réseau est trop pauvre ; la combinaison se recharge auprès du train (réservoir d'air) ou au Moyeu
  { const R0 = Math.hypot(player.pos.x, player.pos.z), dTrain = train.head ? player.pos.distanceTo(train.head) : 1e9;
    const safe = player.mode !== 'foot' || bubbles.air.fieldAt(player.pos) < 0 || dVeh < OXY_R * 0.6; // ce qu'on voit = ce qui protège
    player.oxy ??= 100;
    if (!safe) player.oxy = Math.max(0, player.oxy - dt * (100 / 75)); // ~75 s d'autonomie loin du train
    else player.oxy = Math.min(100, player.oxy + dt * 30);
    const msg = safe ? (player.oxy < 100 ? 'Recharge d\'air…' : '') : (player.oxy < 30 ? 'Air presque épuisé : retourne à ton train !' : 'Loin du train : la combinaison consomme sa réserve d\'air');
    ui.oxy(player.oxy, player.oxy < 100 || !safe, msg);
    if (!safe && player.oxy < 30 && !oxyWarned) { oxyWarned = true; ui.toast('OCTAVE : ta réserve d\'air baisse. L\'air d\'Halcyre est irrespirable loin des voies, reste près de ton train.'); audio.beeps(4, 900); }
    if (safe) oxyWarned = false;
    if (player.oxy <= 0 && !coldFaint) {
      coldFaint = true; ui.fade(true, true); ui.toast('À bout d\'air… OCTAVE te ramène à ton train.', true);
      setTimeout(() => { const c = locoCabWorld(train); player.pos.set(c.x + 3, player.groundAt(c.x + 3, c.z) + 0.5, c.z); player.oxy = 60; coldFaint = false; ui.fade(false, true); }, 1300);
    }
  }
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
  updateBeams(dt); octuor?.update(dt, time); for (const w of worldMods) w.update?.(dt, time, camera.position); westDecor.update(dt, time); gelDecor.update(dt, time); birds.update(dt, time); flags.update(time, camera.position); life.update(dt, time, player.pos); footprints.update(dt, player); dragons.update(dt, time, camera.position); grade.uniforms.time.value = time % 10;
  hub.nucleus.scale.setScalar(1 + Math.sin(time * 2) * 0.08);
  signals.update(player.mode === 'cab' ? train : null, time); // rubans de guidage d'aiguillage + lampes de signal

  // --- distants
  for (const [id, r] of remotes) {
    if (!r.state) continue;
    const s = r.state;
    // train distant : on applique l'état reçu (10/s), et entre deux messages on le fait avancer à sa vitesse (pas d'à-coups)
    if (r.newState) { r.train.applyRemote(s.tr); r.newState = false; } else if (r.train.head && Math.abs(r.train.speed) > 0.01) r.train.advance(r.train.speed * dt);
    r.train.update(dt);
    r.avatar.visible = true;
    // avatar distant : suivi lissé + vraie animation de marche (jambes/bras) d'après sa vitesse réelle
    const target = new THREE.Vector3(s.p[0], s.p[1], s.p[2]), prev = r.avatar.position.clone();
    r.avatar.position.lerp(target, 1 - Math.exp(-dt * 12));
    const sp = prev.distanceTo(r.avatar.position) / Math.max(dt, 1e-3);
    r.anim ??= { avatar: r.avatar, walkPhase: 0, springOut: 0, charge: 0, onGround: true, prep: 0, smooth: 0 };
    r.anim.smooth += (sp - r.anim.smooth) * Math.min(1, dt * 8); r.anim.walkPhase += r.anim.smooth * dt * 1.6;
    try { Player.prototype.animate.call(r.anim, r.anim.smooth > 0.3 ? r.anim.smooth : 0, dt); } catch {}
    let dy = s.ry - r.avatar.rotation.y; dy = (dy + Math.PI * 3) % (Math.PI * 2) - Math.PI; r.avatar.rotation.y += dy * Math.min(1, dt * 12);
    // je suis passager de ce train : recalé APRÈS sa mise à jour (plus de retard derrière le train)
    if (player.mode === 'ride' && player.rideId === id) { const c = r.train.loco.localToWorld(new THREE.Vector3(1.2, 1.45, r.train.loco.userData.cab.z)); player.pos.copy(c); player.avatar.position.copy(c); player.avatar.rotation.y = r.train.loco.rotation.y; }
    // panneau de vitesse pour l'effet Doppler (ton du sifflet suit la position)
    if (r.train.kind === 'vapeur' && Math.abs(r.train.speed) > 0.5 && Math.random() < Math.abs(r.train.speed) / 200) {
      const chim = r.train.loco.localToWorld(r.train.loco.userData.chimney.clone());
      smoke.emit(chim, new THREE.Vector3(0, 5, 0), { life: 3, size: 2, color: '#5a5550', alpha: 0.6 });
    }
  }
  stats.dist += Math.abs(train.speed) * dt * (player.mode === 'cab' ? 1 : 0) + (player.mode === 'foot' && !player.eject ? Math.min(12, player.vel ? Math.hypot(player.vel.x, player.vel.z) : 0) * dt : 0);
  // --- collisions train contre train : un bon coup de tampon, pas un blocage
  bumpCd -= dt;
  if (bumpCd <= 0 && train.head) for (const r of remotes.values()) {
    if (!r.state || !r.train.head) continue;
    const pts = [train.head, train.loco.position], rp = [r.train.head, r.train.loco.position];
    let hit = null; for (const a of pts) for (const b of rp) if (a.distanceTo(b) < 7) hit = a.clone().lerp(b, 0.5);
    if (!hit) continue;
    bumpCd = 1.5; stats.bumps++;
    const v = train.speed; train.speed = -Math.sign(v || 1) * Math.max(4, Math.abs(v) * 0.6);
    audio.noiseBurst(audio.now, 0.5, 400, 0.9, 0.35, 'lowpass'); audio.clack();
    for (let q = 0; q < 60; q++) sparks.emit(hit.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3((Math.random() - 0.5) * 12, Math.random() * 8, (Math.random() - 0.5) * 12), { life: 0.7, size: 0.35, color: q % 2 ? '#ffd27a' : '#ff8a3a' });
    for (let q = 0; q < 12; q++) steam.emit(hit.clone().add(new THREE.Vector3(0, 2, 0)), new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4), { life: 1.5, size: 2, color: '#ffffff', alpha: 0.5 });
    stats.kick = 0.6;
    ui.toast(`💥 BONK ! Tamponné par <b style="color:${r.color}">${r.name}</b>`);
  }
  if (netc.online && time - lastSync > 0.1) {
    lastSync = time;
    netc.send({ t: 'state', s: { p: [+player.pos.x.toFixed(2), +player.pos.y.toFixed(2), +player.pos.z.toFixed(2)], ry: +player.avatar.rotation.y.toFixed(2), m: player.mode, tr: train.serialize(), st: { o2: Math.round(player.oxy ?? 100), tp: Math.round(player.temp), d: Math.round(stats.dist), b: stats.bumps, w: BIOMES[sectorIndex(player.pos.x, player.pos.z)]?.name, h: Math.hypot(player.pos.x, player.pos.z) < 95, cr: S.credits | 0 } } });
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
  updateCamera(dt); if (window.__camOv) { camera.position.copy(window.__camOv.p); camera.lookAt(window.__camOv.t); camera.updateMatrixWorld(); } // vue de debug (captures)
  ui.credits(S.credits);
  updateRange();
  render();
  input.endFrame();
}

function trainDeckCollider(x, z) {
  // on peut monter sur les wagons
  for (const m of [train.loco, ...train.wagons.map(w => w.mesh)]) {
    if (Math.hypot(x - m.position.x, z - m.position.z) > (m.userData.length || 6)) continue;
    const top = vehicleTop(m, x, z, 0); if (top !== null) return m.position.y + top; // vraie surface (plancher, toit, chaudière)
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
let _camT = null, armLen = NaN; // cible de la caméra : un volume « caméra seulement » qui la contient (joueur sous un auvent) est ignoré
function camBlocked(x, y, z) {
  if (VOX.solid(x, z, y - 0.35, y + 0.35, 0.3)) return true; // vraie géométrie
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
  player.avatar.visible = !SET.fp;
  if (SET.fp) { // 1re personne : la caméra est dans le casque
    const head = player.mode === 'foot' ? player.pos.clone().add(new THREE.Vector3(0, 1.72, 0)) : player.avatar.position.clone().add(new THREE.Vector3(0, 1.75, 0));
    const look = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
    camera.position.copy(head).addScaledVector(look, 0.12); camPos.copy(camera.position); camera.lookAt(head.clone().add(look)); camLook.copy(head);
    if (player.mode === 'cab' && SET.shake) { const sh = Math.min(0.03, Math.abs(train.speed) * 0.0012); camera.position.x += (Math.random() - 0.5) * sh; camera.position.y += (Math.random() - 0.5) * sh; }
    return;
  }
  if (player.mode === 'foot') { target = player.pos.clone().add(new THREE.Vector3(0, 1.7, 0)); dist = camZoom; }
  else { const tr = player.mode === 'cab' ? train : remotes.get(player.rideId)?.train || train; target = tr.loco.position.clone().add(new THREE.Vector3(0, 3, 0)); dist = (13 + Math.abs(tr.speed) * 0.25) * camZoom / 6.5; }
  // Bras de caméra classique : direction = souris, longueur = distance libre la plus courte (géométrie réelle + terrain).
  // Jamais de déplacement latéral ni de saut : le bras se raccourcit instantanément devant un obstacle, se rallonge en douceur.
  const dir = _o2.set(Math.sin(player.yaw) * Math.cos(player.pitch), -Math.sin(player.pitch), Math.cos(player.yaw) * Math.cos(player.pitch));
  _camT = target;
  const blockedAt = (d) => { const x = target.x + dir.x * d, y = target.y + dir.y * d, z = target.z + dir.z * d; return y < terrain.heightAt(x, z) + 0.45 || camBlocked(x, y, z); };
  let free = dist;
  for (let d = 0.35; d <= dist; d += 0.25) if (blockedAt(d)) { free = Math.max(0.35, d - 0.35); break; }
  if (!Number.isFinite(armLen) || !camInit) armLen = free;
  if (free < armLen) armLen = free; // raccourcit instantanément : jamais dans un objet
  else armLen += (free - armLen) * (1 - Math.exp(-dt * 7));
  camPos.copy(target).addScaledVector(dir, armLen);
  if (!Number.isFinite(camPos.x + camPos.y + camPos.z)) camPos.copy(target).add(_o2.set(0, 3, 6));
  camInit = true;
  camLook.copy(target);
  // trop près (mur juste derrière) : on masque le personnage plutôt que de remplir l'écran avec son casque
  if (player.mode === 'foot') player.avatar.visible = armLen > 1.3;
  camera.position.copy(camPos); camera.lookAt(camLook);
  // légère vibration en cabine à vitesse
  if (stats.kick > 0) { stats.kick -= 0.016; camera.position.x += (Math.random() - 0.5) * stats.kick; camera.position.y += (Math.random() - 0.5) * stats.kick; }
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
  const t0 = performance.now(); renderer.info.autoReset = false; renderer.info.reset();
  if (Q.post) composer.render(); else renderer.render(scene, camera);
  diag.renderTime(performance.now() - t0); diag.frame();
}
// --- diagnostic F3 (FPS, GPU, navigateur, verdict) — rien n'est envoyé
const diag = createDiag(renderer, () => ({ quality: qName + (qName === 'auto' ? ' → ' + pixelRatio.toFixed(2) : ''), pr: pixelRatio, w: innerWidth, h: innerHeight, shadows: renderer.shadowMap.enabled, bloom: !!SET.bloom, post: !!Q.post, players: 1 + remotes.size, pos: player.pos.toArray().map(v => v.toFixed(0)).join(',') }));
addEventListener('resize', () => { openShop.per = undefined; });
addEventListener('keydown', e => { if (e.code === 'F3') { e.preventDefault(); diag.toggle(); } });
setInterval(() => diag.refresh(), 500);
window.__diag = diag;
// mode secours : pas de vraie carte graphique (pilote Windows de base, VM, bureau à distance) -> on allège fortement
if (diag.gpu.software) { pixelRatio = Math.min(pixelRatio, 0.42); resize(); }
setTimeout(() => { if (!diag.gpu.software) return;
  if (bubbles.air) bubbles.air.mesh.material.uniforms.steps.value = 10;
  ui.toast('⛔ Pas de vraie carte graphique détectée (' + (/basic render/i.test(diag.gpu.gpu) ? 'pilote Windows de base : installe le pilote graphique' : 'rendu logiciel') + '). Mode secours activé. F3 pour le détail.'); }, 4000);
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
window.__oct = { footprints, terrainRef: terrain, VOX, THREE, collExclude, updateCamera, camBlocked, interactables, hub, culler, composer, bloom, Q, COLLIDERS, remotes, compass, renderer, scene, smoke, sparks, steam, weather, camera, get S() { return S; }, get train() { return train; }, get player() { return player; }, net, terrain, setStage, freeSheriff, deliveryCinematic, nuggets, crystals, finds, gelure, western, openShop, audio, ui, input };
if (DEBUG) setTimeout(() => console.log('DEBUG prêt'), 0);
ui.objective(STAGES[0].text);
frame();
