import * as THREE from 'three';
const q = new URLSearchParams(location.search);
const ver = q.get('v') || 'new';
const M = ver === 'old' ? await import('./old_models.js') : await import('../src/world/models.js');
const F = ver === 'old' ? null : await import('../src/game/finds.js');
const E = ver === "old" ? null : await import("../src/game/entities.js");
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(900, 650); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fb7c9'); scene.fog = new THREE.Fog('#9fb7c9', 40, 120);
scene.add(new THREE.HemisphereLight('#dfeaff', '#6b5a48', 1.1));
const sun = new THREE.DirectionalLight('#fff0d8', 2.6); sun.position.set(8, 14, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 60 }); scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#8a7a5c', roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const cam = new THREE.PerspectiveCamera(40, 900 / 650, 0.1, 300);
let cur = null;
function tris(o) { let t = 0; o.traverse(m => { if (m.isMesh) { const g = m.geometry; t += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return t; }
window.show = (what, arg) => {
  if (cur) scene.remove(cur);
  let o;
  if (what === 'loco') o = M.buildSteamLoco(); else if (what === 'draisine') o = M.buildDraisine(); else if (what === 'wagon') o = M.buildWagonModel(arg);
  else if (what === 'avatar') o = M.buildAvatarModel(arg || '#e0703a'); else if (what === 'sheriff') o = M.buildSheriffModel();
  else if (what === 'iceblock') o = E.buildIceBlock();
  else if (what === 'find') { o = F.buildFindModel(arg); }
  else if (what === 'nugget' || what === 'crystal') { const fake = { edges: [{ biome: 4, pts: [{ x: 0, z: 0 }] }], nearest: () => null }; void fake; o = E.__test(what); }
  cur = o; scene.add(o); o.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return tris(o);
};
window.cam = (px, py, pz, tx, ty, tz, fov) => { cam.fov = fov || 40; cam.updateProjectionMatrix(); cam.position.set(px, py, pz); cam.lookAt(tx, ty, tz); r.render(scene, cam); };
window.ready = true;
