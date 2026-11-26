const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 320, height: 180 } });
  p.on('pageerror', e => console.log('PAGEERR', e.message));
  await p.goto('http://localhost:8787/?debug', { timeout: 300000 });
  await p.evaluate(() => { localStorage.clear(); document.getElementById('play-solo').click(); });
  await p.waitForFunction(() => window.__oct && __oct.train && __oct.train.head, null, { timeout: 240000 });
  const r = await p.evaluate(() => {
    const o = __oct, T = o.THREE, wave = o.gelure.wave, rc = new T.Raycaster(), res = {};
    wave.updateMatrixWorld(true); const targets = []; wave.traverse(m => { if (m.isMesh && m.visible) targets.push(m); });
    const c = new T.Vector3(); new T.Box3().setFromObject(wave).getCenter(c);
    for (const e of o.net.edges) { for (let i = 0; i < e.pts.length; i++) { const pt = e.pts[i]; if (pt.distanceTo(c) > 450) continue; const t = e.tan[i], side = new T.Vector3(t.z, 0, -t.x).normalize();
      let h = null;
      for (const lat of [-1.5, 0, 1.5]) { const org = pt.clone().addScaledVector(side, lat); org.y += 0.3; rc.set(org, new T.Vector3(0, 1, 0)); rc.far = 5.5; h = rc.intersectObjects(targets, false)[0]; if (h) break; }
      if (!h && i < e.pts.length - 1) for (const lat of [-1.5, 0, 1.5]) for (const y of [0.8, 2.5, 4.5]) { if (h) break; const org = pt.clone().addScaledVector(side, lat); org.y += y; const nx = e.pts[i + 1].clone().addScaledVector(side, lat); nx.y += y; const d = nx.sub(org); rc.set(org, d.clone().normalize()); rc.far = d.length(); h = rc.intersectObjects(targets, false)[0]; }
      { if (h) { const k = e.a + '-' + e.b; (res[k] ||= []).push([i, +h.distance.toFixed(1), h.object.material.color?.getHexString(), Math.round(pt.x), Math.round(pt.z), h.object.geometry.attributes.position.count, h.object.material.type, h.object.material.transparent, wave.worldToLocal(h.point.clone()).toArray().map(v => Math.round(v)), h.face && h.face.normal.toArray().map(v => +v.toFixed(2))]); break; } } } }
    for (const k in res) res[k] = { n: res[k].length, first: res[k][0], last: res[k][res[k].length - 1], sample: res[k].filter((_, j) => j % 5 == 0).slice(0, 8) };
    return res; });
  console.log(JSON.stringify(r, null, 1));
  await b.close();
})();
