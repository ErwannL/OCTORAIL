const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 480, height: 270 } }); p.setDefaultTimeout(900000);
  const logs = []; p.on('console', m => logs.push(m.text())); p.on('pageerror', e => logs.push('PAGEERR ' + e.message));
  await p.goto('http://localhost:8787/?debug', { waitUntil: 'load', timeout: 180000 });
  await p.waitForTimeout(1500);
  await p.evaluate(() => { localStorage.setItem('octorail-save-v1', JSON.stringify({ introDone: true, stage: 4, owned: { vapeur: true }, credits: 500 })); localStorage.setItem('octorail-settings-v2', JSON.stringify({ quality: 'bas' })); });
  await p.reload({ waitUntil: 'load', timeout: 180000 });
  await p.evaluate(() => document.getElementById('play-solo').click());
  await p.waitForFunction(() => window.__oct && __oct.train, null, { timeout: 180000 });
  console.log(logs.filter(l => /Collision|PAGEERR/.test(l)).join('\n'));
  const REG = await p.evaluate(() => { const o = __oct; const c = o.hub.machines.coal.position, pd = o.western.pedestal, ib = o.gelure.iceBlockPos;
    return [
      { name: 'Moyeu centre', x: 12, z: 0, rad: 50, steps: 1600 },
      { name: 'Moyeu Charbonnière', x: c.x * 0.85, z: c.z * 0.85, rad: 12, steps: 900 },
      { name: 'Moyeu quai Ouest', x: -55, z: 6, rad: 14, steps: 900 },
      { name: 'Moyeu quai Nord', x: 6, z: -55, rad: 14, steps: 700 },
      { name: 'Moyeu Hall', x: -27, z: 12, rad: 12, steps: 700 },
      { name: 'Moyeu Comptoir', x: 9, z: -27, rad: 10, steps: 700 },
      { name: 'Moyeu bord/rambarde', x: 0, z: 44, rad: 10, steps: 700 },
      { name: 'Ville western', x: pd.x + (0 - pd.x) * 0.03, z: pd.z + (0 - pd.z) * 0.03, rad: 45, steps: 1600 },
      { name: 'Gelure bloc', x: ib.x + 6, z: ib.z + 6, rad: 35, steps: 800 },

    ]; });
  const res = await p.evaluate((regions) => {
    const o = __oct, T = o.THREE, P = o.player;
    o.player.mode = 'foot';
    // géométrie statique de référence (même exclusion des objets mobiles), en double face pour détecter l'intérieur
    const statics = [];
    o.scene.updateMatrixWorld(true);
    o.scene.traverse(m => {
      if (!m.isMesh || m.isPoints) return;
      for (let q = m; q; q = q.parent) if (o.collExclude.has(q) || q.userData.noCollide || q.onBeforeRender.toString().length > 20) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.every(mt => (mt.transparent && mt.opacity < 0.35) || mt.blending === T.AdditiveBlending || mt.wireframe)) return;
      if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
      if (m.geometry.boundingSphere.radius > 1500) return;
      mats.forEach(mt => mt.side = T.DoubleSide);
      statics.push(m);
    });
    const rc = new T.Raycaster(); rc.firstHitOnly = false;
    const dir = new T.Vector3(), org = new T.Vector3(), sph = new T.Sphere();
    const near = (x, z) => statics.filter(m => { if (m.isInstancedMesh) return true; sph.copy(m.geometry.boundingSphere).applyMatrix4(m.matrixWorld); return Math.hypot(sph.center.x - x, sph.center.z - z) < sph.radius + 3; });
    const out = [];
    for (const R of regions) {
      let inp = { k: 'forward', a(n) { return n === this.k; }, ah() { return false; }, mouse: { dx: 0, dy: 0 }, down() { return false; } };
      P.pos.set(R.x, o.terrain.heightAt(R.x, R.z) + 0.5, R.z); P.vel.set(0, 0, 0);
      let pens = [], pen = 0, samples = 0, stuck = 0, last = P.pos.clone(), list = near(P.pos.x, P.pos.z), listAt = P.pos.clone(), worst = null;
      // instanced : ne garder que celles proches (sinon trop lent) -> on filtre par instance dans le test via distance de la boîte
      for (let s = 0; s < R.steps; s++) {
        if (s % 35 === 0) P.yaw = Math.random() * Math.PI * 2;
        inp.k = Math.random() < 0.15 ? 'run' : 'forward';
        const fake = { a: n => n === 'forward' || (n === 'run' && inp.k === 'run'), ah: n => n === 'jump' && Math.random() < 0.02, mouse: { dx: 0, dy: 0 }, down: () => false };
        P.updateFoot(0.05, fake, []);
        if (Math.hypot(P.pos.x - R.x, P.pos.z - R.z) > R.rad) { P.pos.x = R.x + (P.pos.x - R.x) * 0.5; P.pos.z = R.z + (P.pos.z - R.z) * 0.5; P.pos.y = o.terrain.heightAt(P.pos.x, P.pos.z) + 0.2; P.updateFoot(0.016, { a: () => false, ah: () => false, mouse: { dx: 0, dy: 0 }, down: () => false }, []); continue; }
        if (P.pos.distanceTo(listAt) > 6) { list = near(P.pos.x, P.pos.z); listAt.copy(P.pos); }
        if (s % 2) continue;
        samples++;
        for (const h of [0.75, 1.15, 1.6]) for (let d = 0; d < 12; d++) {
          const a = d / 12 * Math.PI * 2; dir.set(Math.sin(a), 0, Math.cos(a)); org.set(P.pos.x, P.pos.y + h, P.pos.z);
          rc.set(org, dir); rc.far = 0.24;
          const hit = rc.intersectObjects(list, false);
          if (hit.length) { pen++; { const ob = hit[0].object; const mt = Array.isArray(ob.material) ? ob.material[0] : ob.material; pens.push([+P.pos.x.toFixed(1), +P.pos.y.toFixed(2), +P.pos.z.toFixed(1), h, hit[0].distance.toFixed(2), ob.isInstancedMesh ? 'INST' + ob.count + ' id' + hit[0].instanceId : 'MESH', mt.color && mt.color.getHexString(), ob.geometry.boundingBox ? ob.geometry.boundingBox.max.y.toFixed(1) : '', +o.VOX.solid(P.pos.x, P.pos.z, P.pos.y + 0.62, P.pos.y + 1.75, 0.34)]); } if (!worst) worst = { at: [+P.pos.x.toFixed(2), +P.pos.y.toFixed(2), +P.pos.z.toFixed(2)], h, obj: (hit[0].object.name || hit[0].object.type) + ' r=' + hit[0].object.geometry.boundingSphere.radius.toFixed(1) + ' parent=' + (hit[0].object.parent?.type) }; break; }
        }
        if (P.pos.distanceTo(last) < 0.01) stuck++; last.copy(P.pos);
      }
      out.push({ region: R.name, samples, penetrations: pen, stuckFrames: stuck, firstPen: worst, allPen: pens.slice(0,6) });
    }
    return out;
  }, REG);
  console.log(JSON.stringify(res, null, 1));
  await b.close();
})();
