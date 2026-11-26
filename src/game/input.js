export class Input {
  constructor(dom) {
    this.keys = new Set(); this.pressed = new Set(); this.mouse = { dx: 0, dy: 0, locked: false };
    this.dom = dom;
    addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    dom.addEventListener('click', () => { if (!this.mouse.locked && this.wantLock) dom.requestPointerLock?.(); });
    document.addEventListener('pointerlockchange', () => { this.mouse.locked = document.pointerLockElement === dom; });
    addEventListener('mousemove', e => { if (this.mouse.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } });
    addEventListener('mousedown', e => { if (e.button === 0) this.pressed.add('Mouse0'); this.keys.add('Mouse' + e.button); });
    addEventListener('mouseup', e => this.keys.delete('Mouse' + e.button));
    this.wantLock = true;
  }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.pressed.has(c); }
  endFrame() { this.pressed.clear(); this.mouse.dx = 0; this.mouse.dy = 0; }
}
