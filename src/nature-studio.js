import * as THREE from 'three';
import * as F from './world/flora.js';
const q = new URLSearchParams(location.search), set = q.get('set') || 'hub';
const r = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true }); r.shadowMap.enabled = true;
const s = new THREE.Scene(); s.background = new THREE.Color(set === 'gel' ? '#9ab0c8' : set === 'hub' ? '#8fb8e0' : '#e8c89a');
s.add(new THREE.HemisphereLight('#fff4e0', '#806040', 1.3)); const d = new THREE.DirectionalLight('#fff0d0', 2.2); d.position.set(10, 20, 8); d.castShadow = true; d.shadow.camera.left = -25; d.shadow.camera.right = 25; d.shadow.camera.top = 25; d.shadow.camera.bottom = -25; d.shadow.mapSize.set(2048, 2048); d.shadow.camera.far = 80; s.add(d);
const gr = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: set === 'gel' ? '#e8f0f8' : set === 'hub' ? '#8a9a70' : '#c8a070' })); gr.rotation.x = -Math.PI / 2; gr.receiveShadow = true; s.add(gr);
const lists = {
  hub: () => [0, 1, 2].map(v => F.potTreeGeometry(v)),
  dead: () => [0, 1, 2].map(v => F.deadTreeGeometry(v)).concat([0, 1, 2].map(v => F.joshuaGeometry(v))),
  cactus: () => [0, 1, 2].map(v => F.saguaroGeometry(v)).concat([0, 1, 2].map(v => F.pricklyPearGeometry(v)), [0, 1, 2].map(v => F.barrelCactusGeometry(v)), [0, 1, 2].map(v => F.sageGeometry(v))),
  rock: () => [1, 2, 3].map(v => F.rockShapeGeometry(v, 'strata')).concat([F.mesaGeometry(1), F.mesaGeometry(2)]),
  gel: () => [0, 1, 2].map(v => F.pineGeometry(v)).concat([0, 1, 2].map(v => F.birchGeometry(v)), [1, 2].map(v => F.rockShapeGeometry(v, 'snow')), [0, 1].map(v => F.snowShrubGeometry(v))),
  fauna: () => [F.hareGeometry(0), F.hareGeometry(1), F.hayBaleGeometry(0, 1), F.hayBaleGeometry(1, 2), F.frozenBirdGeometry('#e8eef4', 0.3, 1.3), F.birdParts({ plume: '#2a2420', head: '#c96a5a', belly: '#3a302a', tip: '#6a5a4a', span: 3.4, size: 1.1 }).body, F.grassTuftGeometry('#7a6228', '#d8bc6a', 1.0, 10, 1, true)],
};
const geos = lists[set](); const n = geos.length, cols = Math.min(n, 6);
let tri = 0;
geos.forEach((g, i) => { const m = new THREE.Mesh(g, F.FLORA_MAT_DS); m.castShadow = true; m.receiveShadow = true; const sp = set === 'fauna' ? 3.5 : 9; m.position.set((i % cols - (cols - 1) / 2) * sp, 0, (Math.floor(i / cols)) * -sp * 1.2); if (set === 'fauna') m.scale.setScalar(i < 2 ? 4 : i < 4 ? 2 : 2.5); if (set === 'rock') m.scale.setScalar(i < 3 ? 3 : 1.0), m.position.y = i < 3 ? 2.1 : 5; s.add(m); tri += g.index ? g.index.count / 3 : g.attributes.position.count / 3; });
const cam = new THREE.PerspectiveCamera(40, 1400 / 800, 0.1, 400);
const rows = Math.ceil(n / cols), dist = +q.get('cz') || (set === 'fauna' ? 14 : 30 + cols * 4);
cam.position.set(+q.get('cx') || 0, +q.get('cy') || (set === 'hub' ? 8 : 9), dist); cam.lookAt(0, +q.get('ty') || 3, -(rows - 1) * 5);
r.render(s, cam); window.__done = tri;
