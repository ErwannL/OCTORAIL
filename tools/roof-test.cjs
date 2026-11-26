const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 320, height: 200 } }); p.setDefaultTimeout(600000);
  const errs = []; p.on('pageerror', e => errs.push('PAGEERR ' + e.message));
  await p.goto('http://localhost:8787/?debug', { waitUntil: 'load', timeout: 180000 });
  await p.evaluate(() => { localStorage.setItem('octorail-save-v1', JSON.stringify({ introDone: true, stage: 4, owned: { vapeur: true }, credits: 500 })); localStorage.setItem('octorail-settings-v2', JSON.stringify({ quality: 'bas' })); });
  await p.reload({ waitUntil: 'load', timeout: 180000 });
  await p.evaluate(() => document.getElementById('play-solo').click());
  await p.waitForFunction(() => window.__oct && __oct.train, null, { timeout: 180000 });
  const r = await p.evaluate(() => {
    const o = __oct, P = o.player, V = o.VOX, out = [];
    // trouver des points sous un toit d'auvent, sur un quai (sol à ~0,9, toit au-dessus)
    const spots = [];
    for (let q = 0; q < 8 && spots.length < 12; q++) { const a = q * Math.PI / 4, dx = Math.cos(a), dz = -Math.sin(a), nx = -dz, nz = dx;
      for (const side of [-1, 1]) for (const rr of [62, 72, 82]) { const d = 4.3 * side, x = dx * rr + nx * d, z = dz * rr + nz * d; const f = V.floor(x, z, 0.4, 0.62); if (f > 0.8 && f < 1.0 && V.solid(x, z, f + 2.3, f + 8, 0.2)) spots.push([x, z, f]); } }
    const inp = j => ({ a: n => n === 'jump' && j, ah: () => false, mouse: { dx: 0, dy: 0 }, down: () => false });
    let through = 0;
    for (const [x, z, f] of spots) {
      P.mode = 'foot'; P.pos.set(x, f, z); P.vel.set(0, 0, 0); P.rules = {}; P.onGround = true;
      for (let i = 0; i < 40; i++) P.updateFoot(1 / 30, inp(true), []); // charge max
      let maxY = 0; for (let i = 0; i < 120; i++) { P.updateFoot(1 / 30, inp(false), []); maxY = Math.max(maxY, P.pos.y); }
      const onRoof = P.pos.y > f + 2; if (onRoof) through++;
      out.push(`quai (${x.toFixed(0)},${z.toFixed(0)}) sol ${f.toFixed(2)} : hauteur max des pieds ${maxY.toFixed(2)} | fin ${P.pos.y.toFixed(2)}${onRoof ? '  ← SUR LE TOIT' : ''}`);
    }
    return { points: spots.length, traverse: through, details: out };
  });
  console.log('points sous auvent testés :', r.points, '| traversées du toit :', r.traverse); console.log(r.details.slice(0, 6).join('\n'));
  console.log(errs.join('\n') || 'aucune erreur');
  await b.close();
})();
