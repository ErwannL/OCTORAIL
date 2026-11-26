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
    this.amb = C.createGain(); this.amb.gain.value = 0.7; this.amb.connect(this.master);
    this.wind = this.noiseLoop(400, 0.0, 'lowpass', this.amb); this.melt = this.noiseLoop(3000, 0.0, 'highpass', this.amb);
    if (this.pendingVol) this.setVolumes(this.pendingVol);
    this.nextTime = C.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 50);
    this.ready = true;
  }

  impulse(sec, decay) {
    const C = this.ctx, L = C.sampleRate * sec, b = C.createBuffer(2, L, C.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < L; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / L, decay); }
    return b;
  }
  setVolumes(v) {
    if (!this.ready) { this.pendingVol = v; return; }
    const t = this.now; this.master.gain.setTargetAtTime(v.master, t, 0.05); this.music.gain.setTargetAtTime(0.42 * v.music * 1.6, t, 0.05); this.sfx.gain.setTargetAtTime(0.9 * v.sfx, t, 0.05); this.amb.gain.setTargetAtTime(v.ambience, t, 0.05);
  }
  noiseLoop(freq, gain, type = 'lowpass', dest = null) {
    const C = this.ctx, src = C.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = C.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.7;
    const g = C.createGain(); g.gain.value = gain; src.connect(f).connect(g).connect(dest || this.sfx); src.start();
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

  // Structure en sections qui tournent (comme une vraie bande-son) : thème, variation, pont, respiration, silence.
  // Chaque section dure 8 mesures ; progressions, motifs, registres et instruments changent ; de vrais silences reviennent.
  section(k) {
    const s = Math.floor(k / 64);
    if (s !== this._sec) {
      this._sec = s;
      const r = Math.random();
      this.sec = s % 9 === 8 || (s > 3 && r < 0.18) ? 'silence' : ['theme', 'variation', 'pont', 'respiration', 'variation', 'theme', 'pont', 'respiration'][s % 8];
      this.prog = Math.floor(Math.random() * 4); this.motif = Math.floor(Math.random() * 4); this.oct = Math.random() < 0.3 ? 1 : 0;
    }
    return this.sec;
  }
  playStep(z, S, k, t, spb) {
    const sec = this.section(k);
    if (sec === 'silence') return; // vraie pause : on n'entend plus que l'ambiance et le train
    const bar = Math.floor(k / 8) % 4, beat = k % 8;
    const PROGS = {
      hub: [[0, 3, 4, 2], [0, 2, 3, 4], [2, 3, 0, 4], [0, 4, 2, 3]],
      western: [[0, 3, 4, 0], [0, 0, 3, 4], [3, 4, 0, 2], [0, 2, 3, 4]],
      gelure: [[0, 4, 3, 1], [0, 1, 0, 3], [3, 1, 4, 0], [0, 3, 1, 4]],
      closed: [[0, 2, 0, 3], [0, 3, 2, 0], [2, 0, 3, 0], [0, 0, 2, 3]],
    };
    const deg = PROGS[z][this.prog || 0][bar] + (sec === 'pont' ? 2 : 0);
    const note = (d, oct = 0) => S.root + S.scale[((d % 5) + 5) % 5] + 12 * (oct + Math.floor(d / 5));
    const L = this.layers[z];
    const light = sec === 'respiration'; // section aérée : nappe seule, quelques notes
    // nappe (une mesure sur deux pendant la respiration)
    if (beat === 0 && (!light || bar % 2 === 0)) {
      for (const d of [deg, deg + 2, deg + 4]) {
        const f = mtof(note(d, 0));
        for (const dt of [-7, 7]) this.tone(t, f, spb * 8.5, { type: z === 'gelure' || light ? 'sine' : 'sawtooth', vol: z === 'gelure' ? 0.045 : (light ? 0.03 : 0.016), attack: 0.8, dest: L, detune: dt });
      }
      if (!light) this.tone(t, mtof(note(deg, -1)), spb * 7, { type: 'triangle', vol: 0.11, attack: 0.02, dest: L });
    }
    // mélodie / arpège : motif choisi par section, densité variable
    const rnd = Math.random(), M = [[0, 2, 4, 2, 5, 4, 2, 0], [0, 4, 2, 4, 0, 5, 4, 2], [4, 2, 0, 2, 4, 5, 7, 5], [0, 1, 2, 4, 2, 1, 0, -1]][this.motif || 0];
    const dens = light ? 0.15 : sec === 'variation' ? 0.75 : sec === 'pont' ? 0.5 : 0.9, o = this.oct || 0;
    if (z === 'western') {
      if (beat !== 3 && beat !== 7 && rnd < dens) this.tone(t, mtof(note(deg + M[beat], 1 + o)), 0.18, { type: 'triangle', vol: 0.08, dest: L });
      if ((beat === 0 || beat === 4) && !light) this.tone(t, mtof(note(deg, -1)), 0.25, { type: 'square', vol: 0.025, dest: L });
    } else if (z === 'gelure') {
      if (rnd < 0.35 * dens) this.tone(t, mtof(note(deg + Math.floor(Math.random() * 7), 2 + o)), 1.8, { vol: 0.045, dest: L });
    } else if (z === 'hub') {
      if (beat % 2 === 0 && rnd < 0.65 * dens) this.tone(t, mtof(note(deg + M[beat], 1 + o)), 0.9, { type: 'triangle', vol: 0.055, dest: L });
    } else if (rnd < 0.2 * dens) this.tone(t, mtof(note(deg + Math.floor(Math.random() * 5), 1)), 1.2, { vol: 0.045, dest: L });
    if (light) return;
    // percussions liées à la vitesse du train (le train = instrument)
    if (this.intensity > 0.05) {
      if (beat % 4 === 0) { this.tone(t, 110, 0.18, { vol: 0.35, dest: this.drums, glide: 0.35 }); }
      if (beat % 2 === 1) this.noiseBurst(t, 0.05, 7000, 1, 0.12, 'highpass', this.drums);
      if (beat === 4 || beat === 6 && Math.random() < 0.3) this.noiseBurst(t, 0.12, 1800, 0.7, 0.18, 'bandpass', this.drums);
    }
  }
}
