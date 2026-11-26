const $ = id => document.getElementById(id);

export class UI {
  constructor(audio) {
    this.audio = audio; this.dialogQueue = []; this.dialogOpen = false;
    $('dialog').addEventListener('click', () => this.advance());
    document.querySelectorAll('.panel .close').forEach(b => b.addEventListener('click', () => this.closePanels()));
  }
  show(id, on = true) { $(id).classList.toggle('hidden', !on); }
  set(id, html) { $(id).innerHTML = html; }

  credits(v, bump) { $('cr').textContent = Math.floor(v); if (bump) { const c = $('credits'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } }
  world(name, color) { const w = $('world-name'); if (w.dataset.n !== name) { w.dataset.n = name; w.textContent = name; w.style.color = color; } }
  objective(html) { const o = $('obj-text'); if (o.dataset.h !== html) { o.dataset.h = html; o.innerHTML = html; o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash'); } }
  prompt(text) { const p = $('prompt'); if (!text) { p.classList.add('hidden'); return; } p.classList.remove('hidden'); if (p.dataset.t !== text) { p.dataset.t = text; p.innerHTML = text.replace(/\[(\w+)\]/g, '<kbd>$1</kbd>'); } }
  toast(text, big = false) {
    const t = document.createElement('div'); t.className = 'toast' + (big ? ' big' : ''); t.innerHTML = text; $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
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
    $('sw').textContent = tr.pref === 0 ? 'TOUT DROIT' : 'BIFURCATION';
    $('sw').style.color = tr.pref === 0 ? 'var(--good)' : 'var(--warn)';
    $('next-node').textContent = ex.length > 1 ? `Aiguillage dans ${Math.round(tr.distToNode())} m` : (ex.length === 0 ? `Butoir dans ${Math.round(tr.distToNode())} m` : '');
    $('cab-keys').innerHTML = steam
      ? '<kbd>Z/W</kbd> régulateur + &nbsp;<kbd>S</kbd> − / marche arrière &nbsp;<kbd>Espace</kbd> frein<br><kbd>F</kbd> pelleter du charbon &nbsp;<kbd>H</kbd> sifflet &nbsp;<kbd>E</kbd> descendre'
      : '<kbd>Z/W</kbd> avant &nbsp;<kbd>S</kbd> arrière &nbsp;<kbd>F</kbd> POMPER (spam !) &nbsp;<kbd>Espace</kbd> frein<br><kbd>A/D</kbd> aiguillage &nbsp;<kbd>H</kbd> sifflet &nbsp;<kbd>E</kbd> descendre';
  }
  temp(v, visible) { this.show('temp', visible); $('b-temp').style.width = v + '%'; $('temp').classList.toggle('cold', v < 30); }
  bag(items, max) { $('bag').innerHTML = Array.from({ length: max }, (_, i) => `<div class="slot">${items[i] ? items[i].icon : ''}</div>`).join(''); }
  players(list) { $('players').innerHTML = list.map(p => `<span><i style="background:${p.color}"></i>${p.name}</span>`).join(''); }

  // Dialogues en bulles avec effet machine à écrire
  say(lines, onDone) { this.dialogQueue.push(...lines.map(l => ({ ...l }))); if (onDone) this.dialogQueue.push({ cb: onDone }); if (!this.dialogOpen) this.advance(); }
  advance() {
    if (this.typing) { this.typing = false; return; }
    const n = this.dialogQueue.shift();
    if (!n) { this.dialogOpen = false; this.show('dialog', false); return; }
    if (n.cb) { n.cb(); return this.advance(); }
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
