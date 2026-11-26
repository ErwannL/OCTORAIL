const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 320, height: 200 } }); p.setDefaultTimeout(600000);
  await p.goto('http://localhost:8787/?debug', { waitUntil: 'load', timeout: 180000 });
  await p.waitForFunction(() => window.__oct && __oct.VOX && __oct.VOX.H, null, { timeout: 300000 });
  console.log(JSON.stringify(await p.evaluate(() => { const o = __oct, T = o.THREE, out = [];
    const rc = new T.Raycaster(); const objs = []; o.scene.traverse(m => { if (m.isMesh && !m.userData.noCollide) objs.push(m); });
    for (const e of o.net.edges) for (let k = 0; k < e.pts.length; k += 2) { const q = e.pts[k]; if (!o.VOX.solid(q.x, q.z, q.y + 0.9, q.y + 4, 1.2)) continue;
      let h = null; for (const [ox, oz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.8, 0.8], [-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8]]) { rc.set(new T.Vector3(q.x + ox, q.y + 6, q.z + oz), new T.Vector3(0, -1, 0)); rc.far = 5.5; h = rc.intersectObjects(objs, false).find(x => x.point.y > q.y + 0.9); if (h) break; }
      let name = 'aucun mesh au centre'; if (h) { let top = h.object; while (top.parent && top.parent !== o.scene) top = top.parent; const bb = new T.Box3().setFromObject(top), sz = bb.getSize(new T.Vector3()); name = 'ctor=' + h.object.constructor.name + ' inst=' + h.object.isInstancedMesh + ' n=' + (h.object.count||'') + ' iid=' + h.instanceId + ' verts=' + h.object.geometry.attributes.position.count + ' vis=' + h.object.visible + ' isWave=' + (top === o.gelure.wave) + ' hitY=' + (h.point.y - q.y).toFixed(1) + ' mesh=' + h.object.type + ':' + (h.object.material.color ? h.object.material.color.getHexString() : '') + ' geoR=' + (h.object.geometry.boundingSphere ? h.object.geometry.boundingSphere.radius.toFixed(0) : (h.object.geometry.computeBoundingSphere(), h.object.geometry.boundingSphere.radius.toFixed(0))) + ' depth=' + (() => { let d = 0, r = h.object; while (r.parent && r.parent !== o.scene) { d++; r = r.parent; } return d; })() + ' TOP ' + top.type + ' size ' + sz.toArray().map(v => v.toFixed(0)).join('x') + ' idx ' + o.scene.children.indexOf(top) + ' ud ' + Object.keys(top.userData).join(','); } if (false) { let r = h.object; const path = []; while (r && r !== o.scene) { path.push((r.type) + (r.geometry ? ':' + r.geometry.type : '') + (r.material?.color ? '#' + r.material.color.getHexString() : '')); r = r.parent; } name = path.slice(0, 3).join(' < '); }
      out.push([Math.round(q.x), Math.round(q.z), Math.round(Math.hypot(q.x, q.z)), e.a + '-' + e.b, name]); }
    return out; }), null, 0));
  await b.close();
})();
