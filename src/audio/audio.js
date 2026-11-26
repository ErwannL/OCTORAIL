// Moteur audio 100 % procédural (Web Audio) : SFX + musique générative par monde.
const SCALES = {
  hub:      { root: 50, scale: [0, 2, 4, 7, 9], bpm: 76 },   // ré pentatonique, chaleureux
  western:  { root: 45, scale: [0, 3, 5, 7, 10], bpm: 96 },  // la mineur penta : banjo/guitare
  gelure:   { root: 57, scale: [0, 2, 3, 7, 8], bpm: 64 },   // cristallin, mystérieux
  closed:   { root: 48, scale: [0, 1, 5, 7, 8], bpm: 60 },
};
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() { this.ready = false; this.zone = 'hub'; this.intensity = 0; this.step = 0; }

  init() {
    if (this.ready) return;
    const C = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = C.createGain(); this.master.gain.value = 0.8;
    const comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(C.destination);
    this.sfx = C.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.music = C.createGain(); this.music.gain.value = 0.42; this.music.connect(this.master);
    // réverb
    this.reverb = C.createConvolver(); this.reverb.buffer = this.impulse(2.8, 2.5);
    this.revSend = C.createGain(); this.revSend.gain.value = 0.35; this.revSend.connect(this.reverb).connect(this.master);
    this.noiseBuf = C.createBuffer(1, C.sampleRate * 2, C.sampleRate);
    const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // couches musicales par zone
    this.layers = {};
    for (const z of Object.keys(SCALES)) { const g = C.createGain(); g.gain.value = z === 'hub' ? 1 : 0; g.connect(this.music); g.connect(this.revSend); this.layers[z] = g; }
    this.drums = C.createGain(); this.drums.gain.value = 0; this.drums.connect(this.music);
    // vent / ambiance
    this.wind = this.noiseLoop(400, 0.0); this.melt = this.noiseLoop(3000, 0.0, 'highpass');
    this.nextTime = C.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
    this.ready = true;
  }

  impulse(sec, decay) {
    const C = this.ctx, L = C.sampleRate * sec, b = C.createBuffer(2, L, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, decay); }
    return b;
  }
  noiseLoop(freq, gain, type = 'lowpass') {
    const C = this.ctx, src = C.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.7;
    const g = C.createGain(); g.gain.value = gain; src.connect(f).connect(g).connect(this.sfx); src.start();
    return { g, f };
  }
  noiseBurst(t, dur, freq, q, vol, type = 'bandpass', dest = this.sfx) {
    const C = this.ctx, s = C.createBufferSource(); s.buffer = this.noiseBuf;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = C.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }
  tone(t, freq, dur, { type = 'sine', vol = 0.2, attack = 0.005, dest = this.sfx, detune = 0, glide = 0 } = {}) {
    const C = this.ctx, o = C.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + dur);
    const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------- SFX
  get now() { return this.ctx.currentTime; }
  chuff(vol = 0.5) { if (!this.ready) return; const t = this.now; this.noiseBurst(t, 0.22, 700 + Math.random() * 300, 0.8, vol); this.noiseBurst(t, 0.12, 2500, 1.5, vol * 0.3); }
  clack() { if (!this.ready) return; const t = this.now; this.tone(t, 180, 0.05, { type: 'square', vol: 0.05 }); this.tone(t + 0.09, 160, 0.05, { type: 'square', vol: 0.04 }); }
  whistle(dur = 1.2, pan = null, vol = 0.22) {
    if (!this.ready) return; const C = this.ctx, t = this.now;
    let dest = this.sfx;
    if (pan) { const p = C.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'exponential'; p.refDistance = 15; p.rolloffFactor = 1.2; p.positionX.value = pan.x; p.positionY.value = pan.y; p.positionZ.value = pan.z; p.connect(this.sfx); dest = p; }
    for (const [f, v] of [[523, 1], [659, 0.7], [784, 0.5]]) {
      const o = C.createOscillator(); o.frequency.value = f;
      const lfo = C.createOscillator(); lfo.frequency.value = 6; const lg = C.createGain(); lg.gain.value = 6; lfo.connect(lg).connect(o.frequency);
      const g = C.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol * v, t + 0.08); g.gain.setValueAtTime(vol * v, t + dur - 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest); g.connect(this.revSend);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
    }
    this.noiseBurst(t, dur, 1800, 2, vol * 0.4, 'bandpass', dest);
  }
  pickup() { if (!this.ready) return; const t = this.now; [0, 4, 7, 12].forEach((n, i) => this.tone(t + i * 0.06, mtof(72 + n), 0.25, { type: 'triangle', vol: 0.12, dest: this.sfx })); }
  coin() { if (!this.ready) return; const t = this.now; this.tone(t, 988, 0.08, { type: 'square', vol: 0.06 }); this.tone(t + 0.08, 1319, 0.3, { type: 'square', vol: 0.06 }); }
  shovel() { if (!this.ready) return; const t = this.now; this.noiseBurst(t, 0.18, 400, 0.6, 0.6, 'lowpass'); this.noiseBurst(t + 0.12, 0.3, 1200, 0.5, 0.25); this.tone(t + 0.12, 90, 0.3, { vol: 0.2 }); }
  clunk() { if (!this.ready) return; const t = this.now; this.tone(t, 120, 0.15, { type: 'square', vol: 0.12 }); this.noiseBurst(t, 0.1, 3000, 3, 0.3); }
  deny() { if (!this.ready) return; const t = this.now; this.tone(t, 220, 0.15, { type: 'sawtooth', vol: 0.07 }); this.tone(t + 0.12, 165, 0.25, { type: 'sawtooth', vol: 0.07 }); }
  ui() { if (!this.ready) return; this.tone(this.now, 880, 0.06, { type: 'triangle', vol: 0.08 }); }
  beeps(n = 6, base = 600) { if (!this.ready) return; const t = this.now; for (let i = 0; i < n; i++) this.tone(t + i * 0.09, base * (0.7 + Math.random() * 0.9), 0.07, { type: 'square', vol: 0.05 }); }
  crystal() { // la glace-mémoire « rejoue » un souvenir
    if (!this.ready) return; const t = this.now; const sc = SCALES.gelure;
    for (let i = 0; i < 7; i++) { const m = sc.root + 12 + sc.scale[Math.floor(Math.random() * 5)] + (i > 3 ? 12 : 0); this.tone(t + i * 0.16, mtof(m), 1.6, { vol: 0.07, dest: this.revSend }); this.tone(t + i * 0.16, mtof(m) * 2.01, 0.8, { vol: 0.03, dest: this.revSend }); }
  }
  fanfare() {
    if (!this.ready) return; const t = this.now;
    const seq = [[0, 0], [4, 0.18], [7, 0.36], [12, 0.54], [7, 0.9], [12, 1.08], [16, 1.26], [19, 1.6]];
    seq.forEach(([n, d]) => { this.tone(t + d, mtof(57 + n), 0.6, { type: 'sawtooth', vol: 0.06 }); this.tone(t + d, mtof(45 + n), 0.6, { type: 'triangle', vol: 0.08 }); });
    this.noiseBurst(t + 1.6, 1.5, 5000, 0.5, 0.15, 'highpass');
  }

  // ---------- Musique
  setZone(z) { if (!this.ready || z === this.zone) return; this.zone = z; const t = this.now;
    for (const [k, g] of Object.entries(this.layers)) g.gain.setTargetAtTime(k === z ? 1 : 0, t, 1.2); }
  setIntensity(v) { this.intensity = v; if (this.ready) this.drums.gain.setTargetAtTime(Math.min(1, v) * 0.9, this.now, 0.5); }
  setWind(v) { if (this.ready) this.wind.g.gain.setTargetAtTime(v * 0.25, this.now, 0.4); }
  setMelt(v) { if (this.ready) this.melt.g.gain.setTargetAtTime(v * 0.18, this.now, 0.1); }

  schedule() {
    const C = this.ctx;
    while (this.nextTime < C.currentTime + 0.25) {
      const z = this.zone, S = SCALES[z]; const spb = 60 / (S.bpm * (1 + this.intensity * 0.25)) / 2; // croches
      this.playStep(z, S, this.step, this.nextTime, spb);
      this.nextTime += spb; this.step++;
    }
  }

  playStep(z, S, k, t, spb) {
    const bar = Math.floor(k / 8) % 4, beat = k % 8;
    const chordRoots = { hub: [0, 3, 4, 2], western: [0, 3, 4, 0], gelure: [0, 4, 3, 1], closed: [0, 2, 0, 3] }[z];
    const deg = chordRoots[bar];
    const note = (d, oct = 0) => S.root + S.scale[((d % 5) + 5) % 5] + 12 * (oct + Math.floor(d / 5));
    const L = this.layers[z];
    // nappe à chaque mesure
    if (beat === 0) {
      for (const d of [deg, deg + 2, deg + 4]) {
        const f = mtof(note(d, 0));
        for (const dt of [-7, 7]) this.tone(t, f, spb * 8.5, { type: z === 'gelure' ? 'sine' : 'sawtooth', vol: z === 'gelure' ? 0.05 : 0.018, attack: 0.6, dest: L, detune: dt });
      }
      this.tone(t, mtof(note(deg, -1)), spb * 7, { type: 'triangle', vol: 0.12, attack: 0.02, dest: L });
    }
    // mélodie / arpège
    const rnd = Math.random();
    if (z === 'western') {
      // banjo : arpège galopant
      if (beat !== 3 && beat !== 7) this.tone(t, mtof(note(deg + [0, 2, 4, 2, 5, 4, 2, 0][beat], 1)), 0.18, { type: 'triangle', vol: 0.09, dest: L });
      if (beat === 0 || beat === 4) this.tone(t, mtof(note(deg, -1)), 0.25, { type: 'square', vol: 0.03, dest: L });
    } else if (z === 'gelure') {
      if (rnd < 0.35) this.tone(t, mtof(note(deg + Math.floor(Math.random() * 7), 2)), 1.8, { vol: 0.05, dest: L });
    } else if (z === 'hub') {
      if (beat % 2 === 0 && rnd < 0.6) this.tone(t, mtof(note(deg + [0, 2, 4, 1][beat / 2], 1)), 0.9, { type: 'triangle', vol: 0.06, dest: L });
    } else if (rnd < 0.2) this.tone(t, mtof(note(deg + Math.floor(Math.random() * 5), 1)), 1.2, { vol: 0.05, dest: L });
    // percussions liées à la vitesse du train (le train = instrument)
    if (this.intensity > 0.05) {
      if (beat % 4 === 0) { this.tone(t, 110, 0.18, { vol: 0.35, dest: this.drums, glide: 0.35 }); }
      if (beat % 2 === 1) this.noiseBurst(t, 0.05, 7000, 1, 0.12, 'highpass', this.drums);
      if (beat === 4 || beat === 6 && Math.random() < 0.3) this.noiseBurst(t, 0.12, 1800, 0.7, 0.18, 'bandpass', this.drums);
    }
  }
}
