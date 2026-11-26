// Test caméra : marche aléatoire (vraie physique) + vraie fonction updateCamera à 30 i/s simulées.
// Mesure : caméra dans un solide / sous le terrain, sauts brusques de caméra, montée sur pentes > 45°.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 320, height: 200 } }); p.setDefaultTimeout(900000);
  const logs = []; p.on('pageerror', e => logs.push('PAGEERR ' + e.message));
  await p.goto('http://localhost:8787/?debug', { waitUntil: 'load', timeout: 180000 });
  await p.evaluate(() => { localStorage.setItem('octorail-save-v1', JSON.stringify({ introDone: true, stage: 4, owned: { vapeur: true }, credits: 500 })); localStorage.setItem('octorail-settings-v2', JSON.stringify({ quality: 'bas' })); });
  await p.reload({ waitUntil: 'load', timeout: 180000 });
  await p.evaluate(() => document.getElementById('play-solo').click());
  await p.waitForFunction(() => window.__oct && __oct.train, null, { timeout: 180000 });
  const res = await p.evaluate(() => {
    const o = __oct, P = o.player, cam = o.camera, T = o.THREE;
    const regions = [{ n: 'Moyeu', x: 12, z: 3 }, { n: 'Western pentes', x: -700, z: 60 }, { n: 'Western mesas', x: -1000, z: -90 }, { n: 'Ville', x: o.western.pedestal.x + 40, z: o.western.pedestal.z }, { n: 'Gelure', x: -620, z: 380 }];
    const out = [];
    for (const R of regions) {
      P.mode = 'foot'; P.pos.set(R.x, o.terrain.heightAt(R.x, R.z) + 0.3, R.z); P.vel.set(0, 0, 0);
      let inside = 0, under = 0, jumps = 0, maxJump = 0, steepClimb = 0, frames = 0, prevC = null, prevP = null, minArm = 99;
      for (let s = 0; s < 900; s++) {
        if (s % 40 === 0) P._ty = Math.random() * 6.28 - 3.14; P.yaw += Math.max(-0.08, Math.min(0.08, (P._ty || 0) - ((P.yaw + 3.14) % 6.28 - 3.14))); // souris : ~140°/s max
        P.pitch = -0.25 + Math.sin(s / 30) * 0.5;
        const run = s % 200 < 60;
        const before = P.pos.clone();
        P.updateFoot(1 / 30, { a: n => n === 'forward' || (n === 'run' && run), ah: () => false, mouse: { dx: 0, dy: 0 }, down: () => false }, []);
        o.updateCamera(1 / 30);
        const c = cam.position; frames++;
        if (o.VOX.solid(c.x, c.z, c.y - 0.08, c.y + 0.08, 0.08)) inside++;
        if (c.y < o.terrain.heightAt(c.x, c.z) + 0.2) under++;
        if (prevC) { const mv = c.distanceTo(prevC) - P.pos.distanceTo(prevP); if (mv > 1.2) { jumps++; maxJump = Math.max(maxJump, mv); } }
        // pente : montée de plus de 1,2 m sur 0,5 m horizontal en une image = escalade de falaise
        const dh = P.pos.y - before.y, dxz = Math.hypot(P.pos.x - before.x, P.pos.z - before.z);
        if (P.onGround && dh > 0.6 && dxz > 0.01 && dh / dxz > 1.5) steepClimb++;
        minArm = Math.min(minArm, c.distanceTo(P.pos.clone().add(new T.Vector3(0, 1.7, 0))));
        prevC = c.clone(); prevP = P.pos.clone();
        if (Math.hypot(P.pos.x - R.x, P.pos.z - R.z) > 60) { P.pos.set(R.x, o.terrain.heightAt(R.x, R.z) + 0.3, R.z); prevC = null; }
      }
      out.push(`${R.n}: images ${frames} | caméra dans un solide ${inside} | sous le terrain ${under} | sauts brusques ${jumps} (max ${maxJump.toFixed(2)} m) | escalades de falaise ${steepClimb} | bras min ${minArm.toFixed(2)} m`);
    }
    return out;
  });
  console.log(res.join('\n')); console.log(logs.join('\n'));
  await b.close();
})();
