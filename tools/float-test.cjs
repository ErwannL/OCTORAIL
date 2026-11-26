// Test « rien ne flotte » : pour chaque objet posé au sol (instances + meshes statiques des mondes ouverts),
// on compare le bas de l'objet à la hauteur du sol AFFICHÉ (raycast vertical sur le maillage du terrain).
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 320, height: 200 } }); p.setDefaultTimeout(900000);
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('http://localhost:8787/?debug', { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction(() => window.__oct && __oct.VOX && __oct.VOX.H, null, { timeout: 300000 });
  const r = await p.evaluate(() => {
    const o = __oct, T = o.THREE, rc = new T.Raycaster(), down = new T.Vector3(0, -1, 0);
    const tiles = []; o.terrain.mesh.traverse(m => m.isMesh && tiles.push(m));
    const ground = (x, z) => { rc.set(new T.Vector3(x, 2000, z), down); rc.far = 4000; const h = rc.intersectObjects(tiles, false)[0]; return h ? h.point.y : null; };
    // 1) la fonction de hauteur suit-elle le maillage affiché ?
    let maxErr = 0; for (let i = 0; i < 400; i++) { const x = (Math.random() - 0.5) * 2600, z = (Math.random() - 0.5) * 2600; const g = ground(x, z); if (g !== null) maxErr = Math.max(maxErr, Math.abs(g - o.terrain.heightAt(x, z))); }
    // 2) objets instanciés : base de chaque instance vs sol affiché (mondes ouverts seulement)
    const m4 = new T.Matrix4(), v = new T.Vector3(); let n = 0, floating = 0, worst = 0, ex = [], groups = {};
    o.scene.traverse(m => {
      if (!m.isInstancedMesh) return;
      for (let i = 0; i < m.count; i += Math.max(1, Math.floor(m.count / 120))) {
        m.getMatrixAt(i, m4); m4.premultiply(m.matrixWorld); v.setFromMatrixPosition(m4);
        const R = Math.hypot(v.x, v.z); if (R < 90 || R > 1400) continue;
        const sec = Math.round(((Math.atan2(-v.z, v.x) + 6.2832) % 6.2832) / 0.7854) % 8; if (sec !== 4 && sec !== 5) continue;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const g = ground(v.x, v.z); if (g === null) continue;
        const sy = new T.Vector3().setFromMatrixScale(m4).y, base = v.y + m.geometry.boundingBox.min.y * sy;
        if (o.net.nearest(v.x, v.z, 4)) continue; // sur le ballast de la voie : normal
        n++; const gap = base - g;
        if (gap > 0.25) { floating++; const key = (m.material.color ? m.material.color.getHexString() : '?') + ' n' + m.count + ' h' + (m.geometry.boundingBox.max.y - m.geometry.boundingBox.min.y).toFixed(1); const e = groups[key] ||= { c: 0, max: 0, ex: null }; e.c++; e.max = Math.max(e.max, gap); e.ex ||= [Math.round(v.x), Math.round(v.y), Math.round(v.z)]; }
      }
    });
    return { ecartHauteurMax: maxErr.toFixed(3), objetsTestes: n, flottants: floating, groupes: Object.entries(groups).sort((a, b) => b[1].c - a[1].c).slice(0, 15).map(([k, e]) => k + ' : ' + e.c + ' (max ' + e.max.toFixed(1) + ' m) ex ' + e.ex) };
  });
  console.log(JSON.stringify(r)); console.log(errs.join('\n'));
  await b.close();
})();
