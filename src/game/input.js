export class Input {
  constructor(dom) {
    this.keys = new Set(); this.pressed = new Set(); this.mouse = { dx: 0, dy: 0, locked: false };
    this.dom = dom; this.derived = new Map(); this.skip = 0; this.lastUnlock = 0; this.lockFailed = false;
    this.canLock = () => true;
    // Touches : on enregistre le code physique ET la lettre réellement imprimée (AZERTY/QWERTY sans réglage).
    const press = (code) => { if (!this.keys.has(code)) this.pressed.add(code); this.keys.add(code); };
    addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      const list = [e.code];
      if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) list.push('Key' + e.key.toUpperCase());
      this.derived.set(e.code, list);
      if (this.capture) {
        e.preventDefault(); const f = this.capture; this.capture = null;
        f(list[list.length - 1]); return;
      }
      for (const c of list) press(c);
      if (e.key === 'F1' || e.key === '?') { e.preventDefault(); this.pressed.add('Help'); }
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => { for (const c of this.derived.get(e.code) || [e.code]) this.keys.delete(c); this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); });
    dom.addEventListener('click', () => { if (!this.mouse.locked && this.wantLock && this.canLock()) this.lock(); });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.mouse.locked;
      this.mouse.locked = document.pointerLockElement === dom;
      this.skip = 3; // ignore les premiers mouvements (sauts parasites à la capture)
      this.mouse.dx = 0; this.mouse.dy = 0;
      if (this.mouse.locked) this.lockFailed = false;
      else if (was) this.lastUnlock = performance.now();
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    // Souris : on ignore les sauts parasites ; sans capture on tourne en maintenant le clic droit (ou gauche si la capture échoue).
    addEventListener('mousemove', e => {
      if (!(e.buttons & 2)) this.keys.delete('Mouse2');
      if (!(e.buttons & 1)) this.keys.delete('Mouse0');
      const dragging = !this.mouse.locked && (this.keys.has('Mouse2') || (this.keys.has('Mouse0') && this.lockFailed && e.target === dom));
      if (!this.mouse.locked && !dragging) return;
      if (this.skip > 0) { this.skip--; return; }
      const dx = e.movementX || 0, dy = e.movementY || 0;
      if (Math.abs(dx) > 120 || Math.abs(dy) > 120) { this.spikes = (this.spikes || 0) + 1; return; }
      this.mouse.dx += dx; this.mouse.dy += dy;
    });
    this.wheel = 0;
    addEventListener('wheel', e => { if (e.target === this.dom || this.mouse.locked) { this.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 40 || 1); e.preventDefault?.(); } }, { passive: false });
    addEventListener('mousedown', e => { if (e.button === 0) this.pressed.add('Mouse0'); this.keys.add('Mouse' + e.button); });
    addEventListener('mouseup', e => this.keys.delete('Mouse' + e.button));
    this.wantLock = true;
  }
  get dragging() { return !this.mouse.locked && (this.keys.has('Mouse2') || this.keys.has('Mouse0')); }
  lock() {
    try {
      const r = this.dom.requestPointerLock?.({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { try { const r2 = this.dom.requestPointerLock?.(); if (r2 && r2.catch) r2.catch(() => { this.lockFailed = true; }); } catch { this.lockFailed = true; } });
    } catch { try { this.dom.requestPointerLock?.(); } catch { this.lockFailed = true; } }
  }
  setBindings(b) { this.bind = b; }
  a(name) { return (this.bind?.[name] || []).some(c => this.keys.has(c)); }
  ah(name) { return (this.bind?.[name] || []).some(c => this.pressed.has(c)); }
  consume(name) { for (const c of this.bind?.[name] || []) this.pressed.delete(c); }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.pressed.has(c); }
  endFrame() {
    this.wheel = 0; this.pressed.clear(); this.mouse.dx = 0; this.mouse.dy = 0; }
}
