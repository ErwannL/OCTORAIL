import * as THREE from 'three';

const GAUGE = 0.75;

function ribbon(pts, offset, width, height, yOff) {
  // Rail : section rectangulaire extrudée le long de pts
  const pos = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0), t = new THREE.Vector3(), n = new THREE.Vector3();
  for (let k = 0; k < pts.length; k++) {
    const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
    t.copy(b).sub(a).normalize(); n.crossVectors(up, t).normalize();
    const c = pts[k].clone().addScaledVector(n, offset); c.y += yOff;
    const l = c.clone().addScaledVector(n, -width / 2), r = c.clone().addScaledVector(n, width / 2);
    pos.push(l.x, l.y, l.z, r.x, r.y, r.z, l.x, l.y + height, l.z, r.x, r.y + height, r.z);
    if (k > 0) {
      const o = (k - 1) * 4, p = k * 4;
      // dessus
      idx.push(o + 2, p + 2, o + 3, o + 3, p + 2, p + 3);
      // côtés
      idx.push(o, p, o + 2, o + 2, p, p + 2);
      idx.push(o + 1, o + 3, p + 1, o + 3, p + 3, p + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function buildTracks(scene, net) {
  const group = new THREE.Group();
  const railMat = new THREE.MeshStandardMaterial({ color: '#b9b2a8', metalness: 0.9, roughness: 0.3 });
  const ballastMat = new THREE.MeshStandardMaterial({ color: '#4a4038', roughness: 1 });
  const sleeperMat = new THREE.MeshStandardMaterial({ color: '#5b3b24', roughness: 0.9 });
  const geos = [], ball = [];
  let sleeperCount = 0;
  for (const e of net.edges) {
    geos.push(ribbon(e.pts, -GAUGE, 0.12, 0.16, 0.12));
    geos.push(ribbon(e.pts, GAUGE, 0.12, 0.16, 0.12));
    ball.push(ribbon(e.pts, 0, 3.6, 0.2, -0.25));
    sleeperCount += e.pts.length;
  }
  const merge = (arr) => {
    // fusion simple de géométries indexées
    let total = 0, ti = 0; arr.forEach(g => { total += g.attributes.position.count; ti += g.index.count; });
    const P = new Float32Array(total * 3), I = new Uint32Array(ti); let po = 0, io = 0;
    for (const g of arr) { P.set(g.attributes.position.array, po * 3); const gi = g.index.array; for (let i = 0; i < gi.length; i++) I[io + i] = gi[i] + po; po += g.attributes.position.count; io += gi.length; }
    const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setIndex(new THREE.BufferAttribute(I, 1)); m.computeVertexNormals(); return m;
  };
  const rails = new THREE.Mesh(merge(geos), railMat); rails.castShadow = true; group.add(rails);
  const bal = new THREE.Mesh(merge(ball), ballastMat); bal.receiveShadow = true; group.add(bal);

  const sg = new THREE.BoxGeometry(2.3, 0.14, 0.32);
  const sleepers = new THREE.InstancedMesh(sg, sleeperMat, sleeperCount);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  let i = 0;
  for (const e of net.edges) for (let k = 0; k < e.pts.length; k++) {
    const a = e.pts[Math.max(0, k - 1)], b = e.pts[Math.min(e.pts.length - 1, k + 1)];
    const ang = Math.atan2(b.x - a.x, b.z - a.z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang);
    const p = e.pts[k].clone(); p.y += 0.05;
    m.compose(p, q, sc); sleepers.setMatrixAt(i++, m);
  }
  sleepers.receiveShadow = true;
  group.add(sleepers);
  scene.add(group);
  return group;
}

// Panneau texte (canvas) réutilisable
export function textSprite(lines, { w = 512, h = 256, bg = '#2b1d12', fg = '#f6e3c0', border = '#c9a25a', font = 'bold 44px Georgia' } = {}) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = border; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const L = Array.isArray(lines) ? lines : [lines];
  L.forEach((l, k) => {
    g.font = k === 0 ? font : font.replace(/\d+px/, m => Math.round(parseInt(m) * 0.6) + 'px');
    g.fillText(l, w / 2, h / 2 + (k - (L.length - 1) / 2) * (h / (L.length + 1)));
  });
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
}

export function buildSignals(scene, net, BIOMES) {
  const g = new THREE.Group();
  const post = new THREE.CylinderGeometry(0.12, 0.15, 4, 8);
  const pmat = new THREE.MeshStandardMaterial({ color: '#333', metalness: 0.7, roughness: 0.4 });
  const lamps = [];
  for (const n of net.nodes.values()) {
    const p = new THREE.Vector3(n.p.x, n.y, n.p.y);
    if (n.kind === 'junction' || (n.kind === 'hub' && n.edges.length > 2)) {
      const e = net.edges[n.edges[0]];
      const s = new THREE.Mesh(post, pmat); s.position.set(p.x + 3.5, p.y + 2, p.z + 3.5); s.castShadow = true; g.add(s);
      const lm = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#40ff80', emissiveIntensity: 3 });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), lm); lamp.position.set(p.x + 3.5, p.y + 4.2, p.z + 3.5); g.add(lamp);
      lamps.push({ node: n.id, mat: lm });
    }
    if (n.kind === 'barrier') {
      const b = BIOMES[n.world];
      const e = net.edges[n.edges[0]];
      const end = e.pts[e.pts.length - 1], prev = e.pts[e.pts.length - 6];
      const ang = Math.atan2(end.x - prev.x, end.z - prev.z);
      const stop = new THREE.Group();
      const beam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 0.6), new THREE.MeshStandardMaterial({ color: '#c0392b', roughness: 0.6 }));
      beam.position.y = 0.9; stop.add(beam);
      for (const sx of [-1.2, 1.2]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), pmat); l.position.set(sx, 0.5, 0); stop.add(l); }
      const tex = textSprite([b.name.toUpperCase(), 'VOIE FERMÉE', 'Monde non rallumé'], { bg: '#1a1a22', fg: b.skyBot, border: b.skyTop });
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
      sign.position.set(0, 4.2, 0.4); stop.add(sign);
      const glow = new THREE.PointLight(b.skyBot, 30, 25); glow.position.set(0, 4, 2); stop.add(glow);
      stop.position.copy(end); stop.rotation.y = ang; g.add(stop);
      // brume colorée du monde fermé au-delà
      const fogWall = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), new THREE.MeshBasicMaterial({ color: b.fog, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
      fogWall.position.copy(end).add(new THREE.Vector3(Math.sin(ang) * 30, 22, Math.cos(ang) * 30)); fogWall.rotation.y = ang; g.add(fogWall);
    }
  }
  scene.add(g);
  return { group: g, lamps };
}
