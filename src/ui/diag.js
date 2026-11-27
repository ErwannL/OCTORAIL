// Panneau de diagnostic (F3) : d'où vient le lag ? PC (GPU/CPU), navigateur (accélération matérielle), ou le jeu.
// Tout reste dans le navigateur : rien n'est envoyé nulle part. Bouton « Copier le rapport » pour le partager.
export function gpuInfo(renderer) {
  const gl = renderer.getContext(); let vendor = '?', gpu = '?';
  try { const ext = gl.getExtension('WEBGL_debug_renderer_info'); if (ext) { vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL); gpu = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL); } else { vendor = gl.getParameter(gl.VENDOR); gpu = gl.getParameter(gl.RENDERER); } } catch {}
  const software = /swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software/i.test(gpu);
  const integrated = /intel|uhd|iris|hd graphics|vega \d+ graphics|radeon\(tm\) graphics|mali|adreno|apple m/i.test(gpu) && !software;
  return { vendor, gpu, software, integrated, webgl2: renderer.capabilities.isWebGL2, maxTex: renderer.capabilities.maxTextureSize };
}

export function createDiag(renderer, extra) {
  const el = document.createElement('div'); el.id = 'diag'; el.className = 'hidden';
  el.style.cssText = 'position:fixed;left:8px;top:64px;z-index:50;background:rgba(10,10,12,.82);color:#e8f0e0;font:12px/1.45 ui-monospace,Consolas,monospace;padding:10px 12px;border-radius:8px;border:1px solid #c8a25a;max-width:min(520px,94vw);pointer-events:auto;white-space:pre-wrap';
  document.body.appendChild(el);
  const G = gpuInfo(renderer);
  const frames = [], renders = []; let last = performance.now(), longTasks = 0, hidden = 0;
  try { new PerformanceObserver(l => { longTasks += l.getEntries().length; }).observe({ type: 'longtask', buffered: false }); } catch {}
  document.addEventListener('visibilitychange', () => { if (document.hidden) hidden++; });
  const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
  const api = {
    gpu: G,
    frame() { const now = performance.now(); frames.push(now - last); last = now; if (frames.length > 240) frames.shift(); },
    renderTime(ms) { renders.push(ms); if (renders.length > 240) renders.shift(); },
    stats() {
      const avg = frames.reduce((a, b) => a + b, 0) / (frames.length || 1), r = renders.reduce((a, b) => a + b, 0) / (renders.length || 1), info = renderer.info;
      return { fps: 1000 / avg, avg, p95: pct(frames, 0.95), worst: Math.max(0, ...frames), render: r, calls: info.render.calls, tris: info.render.triangles, geos: info.memory.geometries, texs: info.memory.textures, longTasks };
    },
    // verdict lisible : qu'est-ce qui limite ?
    verdict(s, x) {
      const v = [];
      if (G.software && /basic render/i.test(G.gpu)) v.push('⛔ Windows n\'a PAS de vrai pilote graphique (« Microsoft Basic Render Driver ») : tout est dessiné par le processeur. Ce n\'est ni le jeu ni le navigateur. Vérifie Gestionnaire de périphériques > Cartes graphiques et installe le pilote Intel/AMD/NVIDIA (sur un PC de travail : demande à l\'informatique). En bureau à distance ou machine virtuelle, il n\'y a pas de carte graphique du tout.');
      else if (G.software) v.push('⛔ Le navigateur dessine SANS carte graphique (rendu logiciel « ' + G.gpu + ' »). Active « Utiliser l\'accélération matérielle » (chrome://settings/system ou edge://settings/system), puis redémarre le navigateur ; si ça ne change rien, c\'est le pilote graphique.');
      else if (G.integrated) v.push('ℹ️ Carte graphique intégrée (' + G.gpu + ') : prévois Basse/Auto et une fenêtre plus petite.');
      if (s.fps < 30 && s.render > s.avg * 0.6) v.push('🎮 Le temps passe dans le RENDU (GPU) : baisse la qualité, réduis la fenêtre, coupe ombres/bloom.');
      else if (s.fps < 30) v.push('🧠 Le temps passe dans les CALCULS (processeur/JavaScript) plutôt que dans le dessin : ferme les autres onglets/applis.');
      if (s.worst > 200) v.push('⚠️ Grosses saccades ponctuelles (' + s.worst.toFixed(0) + ' ms) : antivirus, mémoire pleine ou onglet en arrière-plan.');
      if (x.pr * x.w * x.h > 3.5e6 && s.fps < 45) v.push('🖥️ Résolution de rendu élevée (' + Math.round(x.w * x.pr) + '×' + Math.round(x.h * x.pr) + ') : la qualité Auto la baisse d\'elle-même.');
      if (!v.length) v.push('✅ Rien d\'anormal détecté.');
      return v;
    },
    report() {
      const s = api.stats(), x = extra();
      const ua = navigator.userAgent, br = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '?';
      const lines = [
        `OCTORAIL — diagnostic (${new Date().toLocaleString()})`,
        `FPS ${s.fps.toFixed(0)}  ·  image moy ${s.avg.toFixed(1)} ms  ·  p95 ${s.p95.toFixed(1)} ms  ·  pire ${s.worst.toFixed(0)} ms`,
        `Rendu (envoi GPU) ${s.render.toFixed(1)} ms/image  ·  ${s.calls} appels de dessin  ·  ${(s.tris / 1e6).toFixed(2)} M triangles`,
        `Mémoire GPU : ${s.geos} géométries, ${s.texs} textures  ·  tâches longues JS : ${s.longTasks}`,
        `Qualité : ${x.quality}  ·  rendu ${Math.round(x.w * x.pr)}×${Math.round(x.h * x.pr)} (échelle ${x.pr.toFixed(2)})  ·  fenêtre ${x.w}×${x.h} (écran x${devicePixelRatio})`,
        `Ombres ${x.shadows ? 'oui' : 'non'}  ·  bloom ${x.bloom ? 'oui' : 'non'}  ·  post ${x.post ? 'oui' : 'non'}`,
        `GPU : ${G.gpu}  (${G.vendor})  ·  WebGL2 ${G.webgl2 ? 'oui' : 'non'}`,
        `Navigateur : ${br}  ·  ${navigator.platform || ''}  ·  ${navigator.hardwareConcurrency || '?'} cœurs  ·  ${navigator.deviceMemory ? navigator.deviceMemory + ' Go RAM' : 'RAM ?'}`,
        `Joueurs ${x.players}  ·  position ${x.pos}`,
        '', ...api.verdict(s, x),
      ];
      return lines.join('\n');
    },
    toggle(on = el.classList.contains('hidden')) { el.classList.toggle('hidden', !on); if (on) api.refresh(); },
    get open() { return !el.classList.contains('hidden'); },
    refresh() {
      if (!api.open) return;
      el.innerHTML = ''; const pre = document.createElement('div'); pre.textContent = api.report(); el.appendChild(pre);
      const b = document.createElement('button'); b.textContent = '📋 Copier le rapport'; b.style.cssText = 'margin-top:8px;cursor:pointer';
      b.onclick = () => { navigator.clipboard?.writeText(api.report()).then(() => { b.textContent = '✔ Copié — colle-le à Claude'; }, () => { b.textContent = 'Copie impossible : sélectionne le texte'; }); };
      el.appendChild(b);
      const h = document.createElement('div'); h.style.opacity = '.6'; h.textContent = 'F3 pour fermer · rien n\'est envoyé sur Internet'; el.appendChild(h);
    },
  };
  return api;
}
