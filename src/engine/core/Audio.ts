type SoundName =
  | 'click' | 'open' | 'close' | 'step' | 'break' | 'place' | 'jump' | 'land' | 'hurt'
  | 'hit' | 'pickup' | 'craft' | 'wave' | 'explode' | 'bow' | 'shot' | 'checkpoint' | 'win'
  | 'lose' | 'splash' | 'torch' | 'levelup' | 'quest' | 'error' | 'eat';

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private started = false;
  enabled = true;
  musicEnabled = true;
  volume = 1;
  private stepIndex = 0;
  private ambienceTimer = 12;
  private musicTimer = 4;
  private lastNight = false;
  private mood: 'menu' | 'day' | 'night' | 'horror' | 'arena' = 'menu';

  unlock() {
    if (!this.ctx) {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 24;
      comp.ratio.value = 8;
      comp.attack.value = 0.004;
      comp.release.value = 0.2;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.5 * this.volume : 0;
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.8;
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.24;
      this.sfxGain.connect(this.master);
      this.musicGain.connect(this.master);
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    this.started = true;
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(v ? 0.5 * this.volume : 0, this.ctx.currentTime, 0.05);
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(this.enabled ? 0.5 * this.volume : 0, this.ctx.currentTime, 0.05);
    }
  }

  setMusic(v: boolean) {
    this.musicEnabled = v;
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setTargetAtTime(v ? 0.24 : 0, this.ctx.currentTime, 0.2);
    }
  }

  setMood(mood: 'menu' | 'day' | 'night' | 'horror' | 'arena') {
    this.mood = mood;
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, delay = 0, endFreq?: number, target: 'sfx' | 'music' = 'sfx') {
    if (!this.ctx || !this.sfxGain || !this.musicGain || !this.started) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), t);
    if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + Math.min(0.02, dur * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(target === 'music' ? this.musicGain : this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  private noise(dur: number, filter: BiquadFilterType, freq: number, vol: number, delay = 0, q = 0.8, endFreq?: number) {
    if (!this.ctx || !this.sfxGain || !this.started) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const bq = this.ctx.createBiquadFilter();
    bq.type = filter;
    bq.frequency.setValueAtTime(freq, t);
    if (endFreq !== undefined) bq.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t + dur);
    bq.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bq);
    bq.connect(gain);
    gain.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  play(name: SoundName, variant = 0) {
    if (!this.enabled || !this.started) return;
    const v = 0.9 + ((variant % 5) * 0.035);
    switch (name) {
      case 'click':
        this.tone(520, 0.045, 'square', 0.055);
        this.tone(760, 0.03, 'triangle', 0.03, 0.012);
        break;
      case 'open':
        this.tone(330, 0.07, 'triangle', 0.07);
        this.tone(495, 0.09, 'triangle', 0.05, 0.05);
        break;
      case 'close':
        this.tone(440, 0.06, 'triangle', 0.05);
        this.tone(300, 0.09, 'triangle', 0.05, 0.04);
        break;
      case 'step':
        this.stepIndex++;
        this.noise(0.065, 'lowpass', 360 * v, 0.055, 0, 0.6, 200);
        this.tone(80 + (this.stepIndex % 2) * 20, 0.05, 'sine', 0.03);
        break;
      case 'break':
        this.noise(0.19, 'bandpass', 780 * v, 0.16, 0, 0.8, 200);
        this.tone(110, 0.14, 'triangle', 0.08, 0, 60);
        break;
      case 'place':
        this.tone(180, 0.055, 'square', 0.055, 0, 140);
        this.noise(0.04, 'lowpass', 900, 0.035);
        break;
      case 'jump':
        this.tone(230, 0.1, 'sine', 0.03, 0, 330);
        break;
      case 'land':
        this.noise(0.1, 'lowpass', 260, 0.1);
        this.tone(70, 0.1, 'sine', 0.06);
        break;
      case 'hurt':
        this.tone(300, 0.2, 'sawtooth', 0.1, 0, 90);
        this.noise(0.16, 'bandpass', 450, 0.08);
        break;
      case 'hit':
        this.noise(0.07, 'bandpass', 680, 0.12, 0, 1.4);
        this.tone(140, 0.07, 'square', 0.05, 0, 90);
        break;
      case 'pickup':
        this.tone(660, 0.07, 'sine', 0.05);
        this.tone(990, 0.11, 'sine', 0.045, 0.06);
        break;
      case 'craft':
        this.tone(440, 0.08, 'triangle', 0.05);
        this.tone(560, 0.08, 'triangle', 0.05, 0.07);
        this.tone(760, 0.14, 'triangle', 0.04, 0.14);
        break;
      case 'wave':
        this.tone(110, 0.9, 'sawtooth', 0.06);
        this.tone(165, 0.9, 'sawtooth', 0.04, 0.02);
        this.tone(220, 0.8, 'triangle', 0.03, 0.04);
        this.noise(0.7, 'lowpass', 300, 0.04);
        break;
      case 'explode':
        this.noise(0.9, 'lowpass', 1600, 0.28, 0, 0.5, 80);
        this.tone(55, 0.6, 'sine', 0.2, 0, 28);
        break;
      case 'bow':
        this.noise(0.12, 'highpass', 1400, 0.06, 0, 1, 500);
        this.tone(500, 0.1, 'triangle', 0.02, 0, 300);
        break;
      case 'shot':
        this.noise(0.08, 'highpass', 1800, 0.16, 0, 1, 700);
        this.noise(0.16, 'lowpass', 700, 0.08, 0.01, 0.4, 120);
        this.tone(120, 0.1, 'square', 0.09, 0, 50);
        break;
      case 'checkpoint':
        this.tone(523, 0.12, 'sine', 0.06);
        this.tone(659, 0.12, 'sine', 0.05, 0.1);
        this.tone(784, 0.25, 'sine', 0.06, 0.2);
        break;
      case 'win':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.07, i * 0.14));
        break;
      case 'lose':
        [392, 349, 294, 220].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.07, i * 0.17));
        break;
      case 'levelup':
        [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.3, 'square', 0.035, i * 0.08));
        break;
      case 'quest':
        this.tone(600, 0.1, 'triangle', 0.05);
        this.tone(800, 0.2, 'triangle', 0.05, 0.08);
        break;
      case 'splash':
        this.noise(0.3, 'lowpass', 900, 0.12, 0, 0.5, 300);
        break;
      case 'torch':
        this.noise(0.2, 'highpass', 900, 0.03, 0, 0.4);
        break;
      case 'error':
        this.tone(140, 0.16, 'square', 0.05, 0, 110);
        break;
      case 'eat':
        this.noise(0.08, 'bandpass', 500, 0.06);
        break;
    }
  }

  update(dt: number, opts: { night: boolean; horror?: boolean; paused?: boolean; underwater?: boolean }) {
    if (!this.started || !this.enabled || opts.paused) return;
    this.ambienceTimer -= dt;
    this.musicTimer -= dt;
    if (opts.night !== this.lastNight) this.lastNight = opts.night;

    if (this.ambienceTimer <= 0) {
      this.ambienceTimer = 9 + Math.random() * 16;
      if (opts.underwater) {
        this.noise(1.6, 'lowpass', 300, 0.02, 0, 0.4, 180);
      } else if (opts.horror) {
        this.tone(48 + Math.random() * 12, 3.2, 'sine', 0.025, 0, 36);
      } else if (!opts.night && Math.random() > 0.4) {
        // distant birds
        const base = 1400 + Math.random() * 900;
        this.tone(base, 0.07, 'sine', 0.016);
        this.tone(base * 1.12, 0.08, 'sine', 0.012, 0.08);
      } else if (opts.night) {
        this.tone(220 + Math.random() * 50, 0.5, 'sine', 0.012, 0, 180);
      }
    }

    if (this.musicTimer <= 0 && this.musicEnabled) {
      this.musicTimer = 14 + Math.random() * 18;
      const scales: Record<string, number[]> = {
        menu: [261.63, 329.63, 392, 523.25, 659.25],
        day: [261.63, 293.66, 329.63, 392, 440, 523.25],
        night: [220, 261.63, 293.66, 329.63, 392],
        horror: [110, 130.81, 164.81, 196],
        arena: [196, 233.08, 261.63, 311.13, 392],
      };
      const scale = scales[this.mood] ?? scales.day;
      const note = scale[Math.floor(Math.random() * scale.length)];
      this.tone(note, 4.5, 'sine', 0.018, 0, note * 0.999, 'music');
      this.tone(note * 1.5, 3.6, 'triangle', 0.009, 0.4, note * 1.5, 'music');
      if (this.mood !== 'horror') {
        this.tone(note * 2, 2.4, 'sine', 0.006, 1.1, note * 2, 'music');
      }
    }
  }
}
