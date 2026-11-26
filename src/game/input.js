export class Input {
  constructor(dom) {
    this.keys = new Set(); this.pressed = new Set(); this.mouse = { dx: 0, dy: 0, locked: false };
    this.dom = dom;
    addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (this.capture) { e.preventDefault(); const f = this.capture; this.capture = null; f(e.code); return; }
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('click', () => { if (!this.mouse.locked && this.wantLock) this.lock(); });
    dom.addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.mouse.locked = document.pointerLockElement === dom; });
    // Souris : on ignore les « sauts » parasites (bug connu de certains navigateurs en pointer-lock),
    // et sans capture possible on tourne la caméra en maintenant le clic droit (ou gauche).
    addEventListener('mousemove', e => {
      const dragging = !this.mouse.locked && (this.keys.has('Mouse2') || (this.keys.has('Mouse0') && this.lockFailed));
      if (!this.mouse.locked && !dragging) return;
      let dx = e.movementX || 0, dy = e.movementY || 0;
      if (Math.abs(dx) > 120 || Math.abs(dy) > 120) { this.spikes = (this.spikes || 0) + 1; return; }
      this.mouse.dx += dx; this.mouse.dy += dy;
    });
    addEventListener('mousedown', e => { if (e.button === 0) this.pressed.add('Mouse0'); this.keys.add('Mouse' + e.button); });
    addEventListener('mouseup', e => this.keys.delete('Mouse' + e.button));
    this.wantLock = true;
  }
  lock() {
    try {
      const r = this.dom.requestPointerLock?.({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => { const r2 = this.dom.requestPointerLock?.(); if (r2 && r2.catch) r2.catch(() => { this.lockFailed = true; }); });
    } catch { this.lockFailed = true; }
  }
  setBindings(b) { this.bind = b; }
  a(name) { return (this.bind?.[name] || []).some(c => this.keys.has(c)); }
  ah(name) { return (this.bind?.[name] || []).some(c => this.pressed.has(c)); }
  consume(name) { for (const c of this.bind?.[name] || []) this.pressed.delete(c); }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.pressed.has(c); }
  endFrame() { this.pressed.clear(); this.mouse.dx = 0; this.mouse.dy = 0; }
}
