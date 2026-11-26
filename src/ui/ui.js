import { actionLabel, keyLabel } from '../game/settings.js';
const $ = id => document.getElementById(id);

export class UI {
  constructor(audio) {
    this.audio = audio; this.dialogQueue = []; this.dialogOpen = false;
    $('dialog').addEventListener('click', () => this.advance());
    this.keys = null; this.pAt = 0;
    document.querySelectorAll('.panel .close').forEach(b => b.addEventListener('click', () => this.closePanels()));
  }
  show(id, on = true) { $(id).classList.toggle('hidden', !on); }
  set(id, html) { $(id).innerHTML = html; }

  credits(v, bump) { $('cr').textContent = Math.floor(v); if (bump) { const c = $('credits'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } }
  world(name, color) { const w = $('world-name'); if (w.dataset.n !== name) { w.dataset.n = name; w.textContent = name; w.style.color = color; } }
  objective(html) { html = this.kt(html); const o = $('obj-text'); if (o.dataset.h !== html) { o.dataset.h = html; o.innerHTML = html; o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash'); } }
  // Remplace les jetons [E] [F] [H] [M] [Échap] par la touche réellement assignée
  kt(text) {
    if (!this.keys || !text) return text;
    const map = { A: 'left', D: 'right', E: 'interact', F: 'action', H: 'whistle', M: 'map', 'Échap': 'pause' };
    return text.replace(/\[(A|D|E|F|H|M|Échap)\]/g, (m, t) => '[' + actionLabel(this.keys, map[t]) + ']');
  }
  // Appelé quand les touches changent : réécrit les libellés statiques
  setKeys(keys) {
    this.keys = keys; const L = a => actionLabel(keys, a);
    const mvk = i => ['forward', 'left', 'back', 'right'].map(a => keyLabel((keys[a] || [])[i] || (keys[a] || [])[0])).join('');
    const mv = [...new Set([mvk(0), mvk(1)])].join(' / ');
    $('d-next').textContent = `▼ [${L('interact')}] / clic`;
    for (const b of document.querySelectorAll('#shop .close')) b.textContent = `Fermer [${L('pause')}]`;
    for (const b of document.querySelectorAll('#map .close')) b.textContent = `Fermer [${L('map')}]`;
    $('title-hint').innerHTML = `Souris : regarder (clic pour capturer, ou maintenir clic droit) · ${mv} : bouger · ${L('interact')} : interagir · ${L('map')} : carte · ${L('whistle')} : sifflet · ${L('pause')} : pause · F1 : aide`;
    $('help-body').innerHTML = [
      ['Regarder', 'Souris · flèches · clic droit'],
      ['Se déplacer', mv],
      ['Sauter / frein', L('jump')], ['Courir', L('run')], ['Interagir · monter/descendre', L('interact')],
      ['Pomper · pelleter · miner · fondre', L('action')], ['Sifflet', L('whistle')], ['Plan du réseau', L('map')], ['Pause / réglages', actionLabel(keys, 'pause', true)],
      ['En cabine', `${L('forward')}/${L('back')} régulateur · ${L('left')}/${L('right')} aiguillage`], ['Aide', 'F1 ou ?'],
    ].map(([a, b]) => `<div><span>${a}</span><kbd>${b}</kbd></div>`).join('');
    this.cabSteam = null; $('objective').querySelector('#obj-text').dataset.h = '';
    this.lastPrompt = null;
  }
  // Prompt d'interaction : stable (anti-clignotement : on garde le texte 300 ms après sa disparition)
  prompt(text) {
    const p = $('prompt'), now = performance.now();
    if (text) { this.pAt = now; this.pText = text; }
    else if (this.pText && now - this.pAt < 300) text = this.pText;
    else this.pText = null;
    if (!text) { if (!p.classList.contains('hidden')) p.classList.add('hidden'); return; }
    p.classList.remove('hidden');
    if (p.dataset.t !== text) { p.dataset.t = text; p.innerHTML = this.kt(text).replace(/\[([^\]]+)\]/g, '<kbd>$1</kbd>'); }
  }
  toast(text, big = false) {
    const now = performance.now(); this._recent ||= new Map();
    if (now - (this._recent.get(text) || 0) < 4000) return; this._recent.set(text, now);
    const box = document.getElementById('toasts'); while (box.children.length >= 4) box.firstChild.remove();
    const t = document.createElement('div'); t.className = 'toast' + (big ? ' big' : ''); t.innerHTML = this.kt(text); $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
  // Bandeau d'aide à la souris (capture / glisser)
  lockHint(text) { const h = $('lockhint'); if (h.dataset.t !== (text || '')) { h.dataset.t = text || ''; h.textContent = text || ''; h.classList.toggle('hidden', !text); } }
  toggleHelp() { $('help').classList.toggle('hidden'); }
  progress(v, label) { if (v === null) { $('progress').classList.add('hidden'); return; } $('progress').classList.remove('hidden'); $('b-prog').style.width = (v * 100) + '%'; $('prog-label').textContent = label; }

  train(tr, cab) {
    this.show('train-panel', !!cab);
    if (!cab) return;
    $('loco-name').textContent = tr.def.name + (tr.wagons.length ? ` + ${tr.wagons.length} wagon${tr.wagons.length > 1 ? 's' : ''}` : '');
    const kmh = Math.abs(tr.speed) * 3.6;
    $('speed').textContent = Math.round(kmh) + (tr.speed < -0.1 ? ' ◂' : '');
    $('speed-arc').style.strokeDashoffset = 126 - 126 * Math.min(1, Math.abs(tr.speed) / tr.def.maxSpeed);
    const steam = tr.kind === 'vapeur';
    for (const id of ['b-press', 'b-coal', 'b-water']) $(id).parentElement.parentElement.style.display = steam ? '' : 'none';
    $('pump-row').style.display = steam ? 'none' : '';
    $('b-press').style.width = tr.pressure + '%'; $('b-coal').style.width = (tr.coal / tr.maxCoal * 100) + '%'; $('b-water').style.width = (tr.water / tr.maxWater * 100) + '%';
    $('b-pump').style.width = ((tr.pumpPower || 0) * 100) + '%';
    const ex = tr.upcomingExits();
    $('switch').style.opacity = ex.length > 1 ? 1 : 0.45;
    const swT = tr.switchText ? tr.switchText() : (tr.pref === 0 ? 'TOUT DROIT' : 'BIFURCATION');
    $('sw').textContent = swT;
    $('sw').style.color = swT === 'TOUT DROIT' ? 'var(--good)' : 'var(--warn)';
    $('next-node').textContent = ex.length > 1 ? `Aiguillage dans ${Math.round(tr.distToNode())} m` : (ex.length === 0 ? `Butoir dans ${Math.round(tr.distToNode())} m` : '');
    const k = this.keys, L = (a, all) => actionLabel(k, a, all), K = t => `<kbd>${t}</kbd>`;
    const ck = steam
      ? `${K(L('forward', true))} régulateur + &nbsp;${K(L('back'))} − / marche arrière &nbsp;${K(L('jump'))} frein<br>${K(L('action'))} pelleter du charbon &nbsp;${K(L('whistle'))} sifflet &nbsp;${K(L('interact'))} descendre`
      : `${K(L('forward', true))} avant &nbsp;${K(L('back'))} arrière &nbsp;${K(L('action'))} POMPER (spam !) &nbsp;${K(L('jump'))} frein<br>${K(L('left'))}/${K(L('right'))} aiguillage &nbsp;${K(L('whistle'))} sifflet &nbsp;${K(L('interact'))} descendre`;
    if ($('cab-keys').dataset.h !== ck) { $('cab-keys').dataset.h = ck; $('cab-keys').innerHTML = ck; }
    $('sw-keys').textContent = `(${L('left')} / ${L('right')})`;
  }
  temp(v, visible) { this.show('temp', visible); $('b-temp').style.width = v + '%'; $('temp').classList.toggle('cold', v < 30); }
  bag(items, max) { $('bag').innerHTML = Array.from({ length: max }, (_, i) => `<div class="slot">${items[i] ? items[i].icon : ''}</div>`).join(''); }
  players(list) { $('players').innerHTML = list.map(p => `<span><i style="background:${p.color}"></i>${p.name}</span>`).join(''); }

  // Dialogues en bulles avec effet machine à écrire
  say(lines, onDone) { this.dialogQueue.push(...lines.map(l => ({ ...l }))); if (onDone) this.dialogQueue.push({ cb: onDone }); if (!this.dialogOpen) this.advance(true); }
  advance(force) {
    const now = performance.now(); if (!force && now - (this._lastAdv || 0) < 220) return; this._lastAdv = now;
    if (this.typing) { this.typing = false; return; }
    const n = this.dialogQueue.shift();
    if (!n) { this.dialogOpen = false; this.show('dialog', false); return; }
    if (n.cb) { n.cb(); return this.advance(true); }
    this.dialogOpen = true; this.show('dialog', true);
    $('d-who').textContent = n.who; $('d-who').style.color = n.color || 'var(--brass)';
    $('d-portrait').textContent = n.icon || '◈'; $('d-portrait').style.borderColor = n.color || 'var(--brass)';
    const el = $('d-text'); el.textContent = ''; let i = 0; this.typing = true;
    if (n.beep) this.audio.beeps(Math.min(10, n.text.length / 8), n.beep);
    const tick = () => { if (!this.typing) { el.textContent = n.text; return; } el.textContent = n.text.slice(0, ++i); if (i < n.text.length) setTimeout(tick, 18); else this.typing = false; };
    tick();
  }

  openPanel(id) { this.closePanels(); this.show(id, true); this.panel = id; document.exitPointerLock?.(); }
  closePanels() { for (const id of ['shop', 'map', 'pause']) this.show(id, false); this.panel = null; }

  letterbox(on) { $('letterbox').classList.toggle('on', on); }
  fade(on, white = false) { const f = $('fade'); f.classList.toggle('white', white); f.style.opacity = on ? 1 : 0; }
}
