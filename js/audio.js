import { clamp, damp, isNight } from './utils.js';

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Everything you hear is generated in the browser: ocean and wind noise,
 * mechanical ticks, and a small generative band whose tempo is pinned to
 * the pelican's pedal cadence.
 */
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.muted = localStorage.getItem('pc-muted') === '1';
    this.masterVolume = 0.84;
    this.bpm = 84;
    this.targetBpm = 84;
    this.step = 0;
    this.nextNoteTime = 0;
    this._timer = null;
    this._speed = 0;
    this._cadence = 0;
    this._night = 0;
    this._paused = false;
    this._mood = 0;
    this._waveTimer = 5;
    this._nextWave = 0;
    this._schedulerRunning = false;
    this._noiseBuffer = null;
    this._lastUpdate = 0;
    this._recentCatchPitch = 0;
    this._listeners = new Set();
  }

  async start() {
    if (this.started) {
      if (this.ctx?.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
      this.ctx = new AudioContext({ latencyHint: 'interactive' });
      this._buildGraph();
      await this.ctx.resume();
      this.started = true;
      this._startAmbience();
      this._nextWave = 2.5;
      this._schedulerRunning = true;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this._timer = window.setInterval(() => this._schedule(), 38);
      this._setMasterGain(this.muted ? 0 : this.masterVolume, 0.7);
      this._emit('started');
    } catch (err) {
      console.warn('Audio could not start:', err);
    }
  }

  _emit(type) {
    for (const fn of this._listeners) fn(type);
  }

  onEvent(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _buildGraph() {
    const ctx = this.ctx;
    this.compressor = ctx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 22;
    this.compressor.ratio.value = 3.2;
    this.compressor.attack.value = 0.004;
    this.compressor.release.value = 0.28;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.compressor.connect(this.master);
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.42;
    this.musicBus.connect(this.compressor);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.82;
    this.sfxBus.connect(this.compressor);

    this.ambienceBus = ctx.createGain();
    this.ambienceBus.gain.value = 0.38;
    this.ambienceBus.connect(this.compressor);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(2.6, 2.7);
    this.reverbReturn = ctx.createGain();
    this.reverbReturn.gain.value = 0.24;
    this.reverb.connect(this.reverbReturn);
    this.reverbReturn.connect(this.compressor);

    this.delay = ctx.createDelay(1.2);
    this.delay.delayTime.value = 0.33;
    this.delayFilter = ctx.createBiquadFilter();
    this.delayFilter.type = 'lowpass';
    this.delayFilter.frequency.value = 2600;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.23;
    this.delay.connect(this.delayFilter);
    this.delayFilter.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delayReturn = ctx.createGain();
    this.delayReturn.gain.value = 0.14;
    this.delayFilter.connect(this.delayReturn);
    this.delayReturn.connect(this.compressor);

    this._noiseBuffer = this._makeNoise(4.0);
  }

  _makeImpulse(seconds, decay) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const length = Math.floor(seconds * rate);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const white = Math.random() * 2 - 1;
        last = last * 0.68 + white * 0.32;
        data[i] = last * Math.pow(1 - t, decay) * (1 - t * 0.22);
      }
    }
    return impulse;
  }

  _makeNoise(seconds) {
    const ctx = this.ctx;
    const rate = ctx.sampleRate;
    const length = Math.floor(seconds * rate);
    const buffer = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      let brown = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        brown = brown * 0.985 + white * 0.015;
        data[i] = Math.max(-1, Math.min(1, white * 0.62 + brown * 2.5));
      }
    }
    return buffer;
  }

  _setMasterGain(value, timeConstant = 0.08) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(value, now, timeConstant);
  }

  setMuted(muted) {
    this.muted = muted;
    localStorage.setItem('pc-muted', muted ? '1' : '0');
    if (this.started) this._setMasterGain(muted ? 0 : this.masterVolume, 0.15);
    this._emit('muted');
  }

  toggleMuted() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  _startAmbience() {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    source.loop = true;

    const oceanPan = ctx.createStereoPanner();
    oceanPan.pan.value = 0.36;

    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 420;
    low.Q.value = 0.4;
    this.oceanLowGain = ctx.createGain();
    this.oceanLowGain.gain.value = 0.21;

    const wash = ctx.createBiquadFilter();
    wash.type = 'bandpass';
    wash.frequency.value = 950;
    wash.Q.value = 0.55;
    this.oceanWashGain = ctx.createGain();
    this.oceanWashGain.gain.value = 0.10;

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.085;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.055;
    lfo.connect(lfoGain);
    lfoGain.connect(this.oceanWashGain.gain);
    lfo.start();

    const lfo2 = ctx.createOscillator();
    lfo2.type = 'sine';
    lfo2.frequency.value = 0.037;
    const lfoGain2 = ctx.createGain();
    lfoGain2.gain.value = 0.06;
    lfo2.connect(lfoGain2);
    lfoGain2.connect(this.oceanLowGain.gain);
    lfo2.start();

    source.connect(low);
    low.connect(this.oceanLowGain);
    this.oceanLowGain.connect(oceanPan);
    source.connect(wash);
    wash.connect(this.oceanWashGain);
    this.oceanWashGain.connect(oceanPan);
    oceanPan.connect(this.ambienceBus);
    source.start();

    // Wind picks up with speed.
    const windSource = ctx.createBufferSource();
    windSource.buffer = this._noiseBuffer;
    windSource.loop = true;
    const windHigh = ctx.createBiquadFilter();
    windHigh.type = 'highpass';
    windHigh.frequency.value = 280;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 1000;
    windFilter.Q.value = 0.32;
    this.windFilter = windFilter;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    windSource.connect(windHigh);
    windHigh.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.ambienceBus);
    windSource.start();

    // A very quiet stereo "air" layer keeps the night from feeling dead.
    const airSource = ctx.createBufferSource();
    airSource.buffer = this._noiseBuffer;
    airSource.loop = true;
    const air = ctx.createBiquadFilter();
    air.type = 'bandpass';
    air.frequency.value = 3200;
    air.Q.value = 0.8;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0.01;
    airSource.connect(air);
    air.connect(this.airGain);
    this.airGain.connect(this.ambienceBus);
    airSource.start();
  }

  setPaused(paused) {
    this._paused = paused;
    if (!this.started) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(paused ? 0.10 : 0.42, now, 0.25);
    this.ambienceBus.gain.setTargetAtTime(paused ? 0.115 : 0.38, now, 0.3);
    if (!paused && this.ctx.state === 'suspended') this.ctx.resume();
  }

  update({ cadence = 0, speed = 0, phase = 0, paused = false, visible = true } = {}) {
    if (!this.started) return;
    const now = performance.now();
    const dt = this._lastUpdate ? clamp((now - this._lastUpdate) / 1000, 0, 0.2) : 0.016;
    this._lastUpdate = now;

    this._cadence = cadence;
    this._speed = speed;
    this._paused = paused;
    this._night = damp(this._night, isNight(phase) ? 1 : 0, 1.6, dt);

    const cadenceTarget = clamp(cadence * 1.06, 66, 124);
    this.targetBpm = cadenceTarget;
    this.bpm = damp(this.bpm, this.targetBpm, 1.5, dt);

    if (!paused) {
      this.windGain.gain.setTargetAtTime(clamp(speed / 14, 0, 1) * 0.12, this.ctx.currentTime, 0.3);
      this.windFilter.frequency.setTargetAtTime(650 + speed * 95, this.ctx.currentTime, 0.4);
      if (this.ctx.state === 'suspended' && visible) this.ctx.resume();
    } else {
      this.windGain.gain.setTargetAtTime(0.025, this.ctx.currentTime, 0.4);
    }
    this.airGain.gain.setTargetAtTime(0.005 + this._night * 0.012, this.ctx.currentTime, 1.2);

    // Occasional breaking-wave stereo swells while riding.
    this._waveTimer -= dt;
    if (this._waveTimer <= 0 && !paused) {
      this._waveTimer = 5.5 + Math.random() * 6.5;
      this._playWaveSwell();
    }
  }

  _schedule() {
    if (!this.ctx || !this._schedulerRunning) return;
    if (this._paused) {
      this.nextNoteTime = Math.max(this.nextNoteTime, this.ctx.currentTime + 0.05);
      return;
    }
    const lookAhead = 0.16;
    while (this.nextNoteTime < this.ctx.currentTime + lookAhead) {
      this._scheduleStep(this.step, this.nextNoteTime);
      const stepDuration = 60 / Math.max(40, this.bpm) / 4;
      this.nextNoteTime += stepDuration;
      this.step++;
    }
  }

  _scheduleStep(step, time) {
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const speedNorm = clamp(this._speed / 13.6, 0, 1);
    const night = this._night;
    const chords = [
      [50, 57, 64, 66, 73],
      [47, 54, 62, 64, 69],
      [43, 50, 58, 59, 66],
      [45, 52, 59, 62, 64],
    ];
    const chord = chords[bar];
    const root = chord[0];

    if (s === 0) {
      this._pad(chord, time, 16, 0.055 + night * 0.008);
      this._bass(root - 12, time, 0.13, 8);
      if (speedNorm > 0.22) this._kick(time, 0.10 + speedNorm * 0.02);
    }

    if (s === 4 || s === 12) {
      if (speedNorm > 0.4) this._snare(time, 0.032 + night * 0.008);
      if (speedNorm > 0.1) this._kick(time + 0.003, 0.04);
    }

    if (s === 8) {
      if (speedNorm > 0.32) this._kick(time, 0.075);
      this._bass(root - 12 + (bar === 1 ? 7 : 5), time + 0.02, 0.07, 4);
    }

    if (s === 6 || s === 14) {
      this._hat(time, 0.018 + night * 0.008, s === 14);
    }
    if (s % 2 === 1 && speedNorm > 0.35) {
      this._hat(time, 0.008 + night * 0.005, false);
    }

    // Arpeggios: sparse and warm near dusk, glassy in the night.
    if (speedNorm > 0.18) {
      const arpPattern = [0, 2, 4, 1, 3, 2, 4, 1, 2, 0, 3, 4, 1, 3, 2, 4];
      if (s % 2 === 0) {
        const note = chord[arpPattern[s]] + 12 + (night > 0.5 && s === 8 ? 12 : 0);
        this._pluck(note, time + 0.01, 0.018 + night * 0.005, 0.20);
      }
      if (night > 0.4 && (s === 3 || s === 11)) {
        this._glass(chord[2] + 24, time, 0.012);
      }
    }

    // Keep a soft mechanical pedal tick in the same tempo as the music.
    if (this._speed > 1.2 && (s === 0 || s === 6 || s === 8 || s === 14)) {
      this._tick(time, 0.012 + speedNorm * 0.008);
    }
    if (this._speed > 9 && s === 2) {
      this._chainTick(time, 0.006);
    }

    if (night > 0.65 && s === 15 && bar === 3 && Math.random() < 0.35) {
      this._whaleTone(time, root + 12, 0.012);
    }
  }

  _connectVoice(node, { destination = this.musicBus, pan = 0, reverb = 0.2, delay = 0 } = {}) {
    const ctx = this.ctx;
    let last = node;
    if (pan !== 0 && ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      last.connect(panner);
      last = panner;
    }
    last.connect(destination);
    if (reverb > 0) {
      const send = ctx.createGain();
      send.gain.value = reverb;
      last.connect(send);
      send.connect(this.reverb);
    }
    if (delay > 0) {
      const send = ctx.createGain();
      send.gain.value = delay;
      last.connect(send);
      send.connect(this.delay);
    }
    return last;
  }

  _osc(type, freq, time, stopTime, gainValue, destinationOptions = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), time);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainValue), time + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, stopTime);
    osc.connect(gain);
    this._connectVoice(gain, destinationOptions);
    osc.start(time);
    osc.stop(stopTime + 0.04);
    return { osc, gain };
  }

  _pad(notes, time, durationSteps, gainValue) {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(620 + this._night * 420, time);
    filter.frequency.linearRampToValueAtTime(1250 + this._night * 750, time + 1.2);
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    const total = Math.max(0.6, durationSteps * (60 / this.bpm / 4));
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(gainValue, time + 1.0);
    gain.gain.setValueAtTime(gainValue * 0.9, time + total * 0.75);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + total + 0.2);
    for (const note of notes) {
      for (let detune = -0.08; detune <= 0.08; detune += 0.08) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToFreq(note);
        osc.detune.value = detune * 100;
        osc.connect(filter);
        osc.start(time);
        osc.stop(time + total + 0.25);
      }
    }
    filter.connect(gain);
    this._connectVoice(gain, { reverb: 0.5, delay: 0.05 });
  }

  _bass(note, time, gainValue, durationSteps) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const total = Math.max(0.2, durationSteps * (60 / this.bpm / 4));
    osc.type = 'triangle';
    osc.frequency.value = midiToFreq(note);
    filter.type = 'lowpass';
    filter.frequency.value = 260;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(gainValue, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + total);
    osc.connect(filter);
    filter.connect(gain);
    this._connectVoice(gain, { reverb: 0.04, delay: 0 });
    osc.start(time);
    osc.stop(time + total + 0.03);
  }

  _pluck(note, time, gainValue, decay) {
    const ctx = this.ctx;
    const freq = midiToFreq(note);
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = 'triangle';
    osc2.type = 'sine';
    osc.frequency.value = freq;
    osc2.frequency.value = freq * 2.002;
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3400, time);
    filter.frequency.exponentialRampToValueAtTime(950, time + decay);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    this._connectVoice(gain, { pan: -0.18, reverb: 0.26, delay: 0.22 });
    osc.start(time);
    osc2.start(time);
    osc.stop(time + decay + 0.03);
    osc2.stop(time + decay + 0.03);
  }

  _glass(note, time, gainValue) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = midiToFreq(note);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 2.8);
    osc.connect(gain);
    this._connectVoice(gain, { pan: 0.45, reverb: 0.7, delay: 0.1 });
    osc.start(time);
    osc.stop(time + 3.0);
  }

  _kick(time, gainValue) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.13);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(gainValue, time + 0.009);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
    osc.connect(gain);
    this._connectVoice(gain, { reverb: 0.02 });
    osc.start(time);
    osc.stop(time + 0.3);
  }

  _snare(time, gainValue) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1900;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.17);
    source.connect(filter);
    filter.connect(gain);
    this._connectVoice(gain, { pan: 0.12, reverb: 0.12 });
    source.start(time, Math.random() * 2, 0.2);
  }

  _hat(time, gainValue, open = false) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = open ? 6800 : 8400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + (open ? 0.23 : 0.045));
    source.connect(filter);
    filter.connect(gain);
    this._connectVoice(gain, { pan: -0.24, reverb: 0.08 });
    source.start(time, Math.random() * 2, open ? 0.3 : 0.08);
  }

  _tick(time, gainValue) {
    const ctx = this.ctx;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 2300;
    filter.Q.value = 4;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.026);
    source.connect(filter);
    filter.connect(gain);
    this._connectVoice(gain, { reverb: 0.02 });
    source.start(time, Math.random(), 0.04);
  }

  _chainTick(time, gainValue) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 5800 + Math.random() * 800;
    gain.gain.setValueAtTime(gainValue, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.018);
    osc.connect(gain);
    this._connectVoice(gain, { pan: 0.1, reverb: 0.01 });
    osc.start(time);
    osc.stop(time + 0.03);
  }

  _whaleTone(time, note, gainValue) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(midiToFreq(note), time);
    osc.frequency.linearRampToValueAtTime(midiToFreq(note - 5), time + 2.4);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(gainValue, time + 0.8);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 3.4);
    osc.connect(gain);
    this._connectVoice(gain, { pan: 0.6, reverb: 0.6, delay: 0.2 });
    osc.start(time);
    osc.stop(time + 3.5);
  }

  _playWaveSwell() {
    if (!this.started) return;
    const ctx = this.ctx;
    const time = ctx.currentTime + Math.random() * 0.2;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(520, time);
    filter.frequency.linearRampToValueAtTime(1300, time + 1.2);
    filter.frequency.linearRampToValueAtTime(480, time + 2.8);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(0.055 * (0.6 + Math.random() * 0.4), time + 0.9);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 3.1);
    source.connect(filter);
    filter.connect(gain);
    this._connectVoice(gain, { destination: this.ambienceBus, pan: 0.55, reverb: 0.2 });
    source.start(time, Math.random() * 3, 3.2);
  }

  _sfxTone(freq, duration, { type = 'sine', gain = 0.08, glide = null, attack = 0.008, pan = 0, reverb = 0.12, delay = 0 } = {}) {
    if (!this.started) return;
    const ctx = this.ctx;
    const time = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), time);
    if (glide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glide), time + duration);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(gain, time + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(amp);
    this._connectVoice(amp, { destination: this.sfxBus, pan, reverb, delay });
    osc.start(time);
    osc.stop(time + duration + 0.04);
  }

  _sfxNoise(duration, { frequency = 900, q = 0.8, gain = 0.05, type = 'bandpass', attack = 0.005, pan = 0.25, reverb = 0.1 } = {}) {
    if (!this.started) return;
    const ctx = this.ctx;
    const time = ctx.currentTime + 0.01;
    const source = ctx.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, time);
    filter.Q.value = q;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.linearRampToValueAtTime(gain, time + attack);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    source.connect(filter);
    filter.connect(amp);
    this._connectVoice(amp, { destination: this.sfxBus, pan, reverb });
    source.start(time, Math.random() * 2, duration + 0.05);
  }

  playCatch(type = 'silver', combo = 0, points = 1) {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.01;
    const base = type === 'moon' ? 72 : type === 'golden' ? 76 : type === 'big' ? 68 : 74;
    const shift = Math.min(7, Math.round(combo / 2));
    const notes = type === 'big'
      ? [base - 12, base - 5, base, base + 7]
      : [base, base + 4, base + 7 + (shift % 3)];
    notes.forEach((midi, i) => {
      const t = now + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i === 0 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(midiToFreq(midi), t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.085 - i * 0.014, t + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      osc.connect(gain);
      this._connectVoice(gain, { destination: this.sfxBus, pan: 0.1, reverb: 0.38, delay: 0.12 });
      osc.start(t);
      osc.stop(t + 0.5);
    });
    // A tiny shimmer that reads as scales catching light.
    this._sfxNoise(0.28, { frequency: 4800, q: 0.5, gain: 0.018, type: 'highpass', pan: 0.2, reverb: 0.5 });
    if (type === 'big' || type === 'golden') {
      this._sfxTone(1200, 0.4, { type: 'sine', gain: 0.03, glide: 1800, pan: 0.3, reverb: 0.45 });
    }
  }

  playMiss() {
    this._sfxTone(220, 0.18, { type: 'triangle', gain: 0.04, glide: 150, pan: 0.2, reverb: 0.1 });
  }

  playJump() {
    this._sfxNoise(0.4, { frequency: 1600, q: 0.7, gain: 0.055, type: 'bandpass', pan: 0.1, reverb: 0.15 });
    this._sfxTone(320, 0.28, { type: 'sine', gain: 0.025, glide: 560, pan: 0.05, reverb: 0.1 });
  }

  playLand() {
    this._sfxTone(85, 0.22, { type: 'sine', gain: 0.11, glide: 42, pan: 0, reverb: 0.08 });
    this._sfxNoise(0.2, { frequency: 500, q: 0.55, gain: 0.035, type: 'lowpass', pan: 0.1, reverb: 0.06 });
  }

  playWheelie() {
    this._sfxNoise(0.48, { frequency: 900, q: 0.55, gain: 0.03, type: 'bandpass', pan: 0.35, reverb: 0.14 });
    this._sfxTone(440, 0.5, { type: 'triangle', gain: 0.022, glide: 880, pan: 0.1, reverb: 0.24 });
  }

  playLane() {
    this._sfxNoise(0.22, { frequency: 1300, q: 0.6, gain: 0.018, type: 'bandpass', pan: 0.22, reverb: 0.08 });
  }

  playAchievement() {
    if (!this.started) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.01;
    const notes = [74, 78, 81, 85];
    notes.forEach((n, i) => {
      const t = now + i * 0.095;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = midiToFreq(n);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.065, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
      osc.connect(gain);
      this._connectVoice(gain, { destination: this.sfxBus, pan: -0.06, reverb: 0.6, delay: 0.2 });
      osc.start(t);
      osc.stop(t + 1.8);
    });
    this._sfxNoise(0.8, { frequency: 6200, q: 0.4, gain: 0.012, type: 'highpass', reverb: 0.65 });
  }

  playClick() {
    this._sfxTone(760, 0.055, { type: 'sine', gain: 0.025, pan: 0, reverb: 0.04 });
  }

  playSplash() {
    this._sfxNoise(0.32, { frequency: 700, q: 0.7, gain: 0.04, type: 'bandpass', pan: 0.5, reverb: 0.2 });
    this._sfxNoise(0.16, { frequency: 2400, q: 0.5, gain: 0.02, type: 'highpass', pan: 0.55, reverb: 0.2 });
  }

  playBell() {
    if (!this.started) return;
    const now = this.ctx.currentTime + 0.01;
    [1568, 2093, 2637].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.032 / (i + 1), now + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      osc.connect(gain);
      this._connectVoice(gain, { destination: this.sfxBus, reverb: 0.55, delay: 0.2 });
      osc.start(now);
      osc.stop(now + 1.0);
    });
  }

  getDebugState() {
    return {
      started: this.started,
      state: this.ctx?.state ?? 'none',
      bpm: Math.round(this.bpm),
      muted: this.muted,
      step: this.step,
    };
  }
}
