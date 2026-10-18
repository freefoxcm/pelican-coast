import * as THREE from 'three';
import { CAMERAS, QUALITY, RIDE, ROAD } from './config.js';
import { clamp, damp, seededRandom, smoothstep, TAU } from './utils.js';
import { World } from './world.js';
import { PelicanRider } from './rider.js';
import { FishManager } from './fish.js';
import { Effects } from './effects.js';
import { CameraDirector } from './camera.js';
import { AudioEngine } from './audio.js';
import { Achievements } from './achievements.js';
import { UI } from './ui.js';
import { InputController } from './input.js';

const _v = new THREE.Vector3();

class Game {
  constructor() {
    this.canvas = document.getElementById('scene');
    this.params = new URLSearchParams(window.location.search);
    this.debugEnabled = this.params.get('debug') === '1';
    this.forcedQuality = this.params.get('quality');
    this.fixedQuality = this.params.get('fixed') === '1' || !!this.forcedQuality;
    this.started = false;
    this.starting = false;
    this.paused = false;
    this.pauseKind = null;
    this.intro = true;
    this.simTime = 0;
    this.lastFrame = performance.now();
    this.frameCount = 0;
    this.fpsSamples = [];
    this.fpsWindowTime = 0;
    this.fpsWindowFrames = 0;
    this.fps = 60;
    this.qualityIndex = 2;
    this.qualityCooldown = 0;
    this.lowSamples = 0;
    this.highSamples = 0;
    this._lastQualityLabel = '';
    this._lastPhase = 0;
    this._sunsetSeen = false;
    this._nightAnnounced = false;
    this._autoTakeoverAnnounced = false;
    this._hasManualDriven = false;
    this._suppressCameraAnnounce = false;
    this._visibilityPause = false;
    this._disposed = false;
    this._renderTime = 0;

    this.run = {
      speed: 0,
      distance: 0,
      laneIndex: 1,
      laneX: 0,
      laneVelocity: 0,
      jumpY: 0,
      vy: 0,
      grounded: true,
      jumpCooldown: 0,
      wheelieTimer: 0,
      wheelie: 0,
      cadence: 0,
      crankAngle: 0,
      fish: 0,
      score: 0,
      combo: 0,
      bestCombo: 0,
      lastCatchAt: -99,
      laneCooldown: 0,
      autoLaneTimer: 0,
      trailTimer: 0,
    };

    this.autopilot = true;
    this.lastManualTime = -999;
    this._rand = seededRandom(1207);
    this._clock = new THREE.Clock();
    this._onResize = this._onResize.bind(this);
    this._animate = this._animate.bind(this);
    this._onVisibilityChange = this._onVisibilityChange.bind(this);
    this.init();
  }

  init() {
    document.body.classList.add('js-ready');
    if (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1) {
      document.body.classList.add('touch-device');
    }
    if (this.debugEnabled) {
      this.debugEl = document.createElement('pre');
      this.debugEl.id = 'debug-overlay';
      this.debugEl.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:200;background:rgba(0,0,0,.6);color:#bdf5e8;padding:8px 10px;font:10px/1.45 Consolas,monospace;border-radius:5px;pointer-events:none;white-space:pre;';
      document.body.appendChild(this.debugEl);
    }

    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: true,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (err) {
      console.error(err);
      document.getElementById('webgl-error').hidden = false;
      document.getElementById('loading')?.classList.add('done');
      document.getElementById('start-screen')?.classList.add('is-gone');
      return;
    }
    this.renderer.setClearColor('#081a22', 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.info.autoReset = true;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.05, 2000);
    this.camera.position.set(0, 8, 10);
    this.camera.lookAt(0, 6, 0);

    this.audio = new AudioEngine();
    this.world = new World(this.scene, this.renderer, {
      initialPhase: this.params.has('phase') ? parseFloat(this.params.get('phase')) : 0.025,
    });
    this.world.setCamera(this.camera);

    this.rider = new PelicanRider(this.scene, this.renderer);
    this.fish = new FishManager(this.scene, this.rider, {
      onCatch: (data) => this._onFishCaught(data),
      onMiss: (data) => this._onFishMissed(data),
      onSpawn: (data) => this._onFishSpawned(data),
    });
    this.effects = new Effects(this.scene, this.renderer, this.camera);
    this.achievements = new Achievements({
      onUnlock: (def) => this._onAchievement(def),
      onProgress: () => {},
    });
    this.cameraDirector = new CameraDirector(this.camera, this.rider, this.scene, {
      onModeChange: (mode, index) => {
        this.ui?.setCamera(mode, index, this.started && !this._suppressCameraAnnounce);
        if (this.debugEnabled) this._updateDebug();
      },
    });

    this.ui = new UI({
      audio: this.audio,
      achievements: this.achievements,
      callbacks: {
        onStart: () => this.startExperience(),
        onCamera: () => this.cycleCamera(),
        onPause: () => this.togglePause(),
        onResume: () => this.resumeGame(),
        onSound: () => this.toggleMute(),
        onOverlayState: (open, name) => this._onOverlayState(open, name),
      },
    });

    this.input = new InputController({
      onDrive: (action) => this._onDrive(action),
      onCommand: (command) => this._onCommand(command),
      onAnyManualInput: () => this._markManual(),
    });
    this.input.setEnabled(false);

    this._setupQuality();
    this._bindGlobal();
    this._onResize();
    this._setupIntro();
    this._exposeDebug();
    this._loop = this._animate;
    this.renderer.setAnimationLoop(this._animate);
    this.ui.setLoading(0.9, '正在点亮海岸线…');
    window.setTimeout(() => this.ui.hideLoading(220), 420);
  }

  _setupQuality() {
    let index = 2;
    if (this.forcedQuality) {
      const found = QUALITY.findIndex((q) => q.id === this.forcedQuality || q.label === this.forcedQuality);
      if (found >= 0) index = found;
    } else if (window.innerWidth < 900 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent)) {
      index = 1;
    } else if ((navigator.hardwareConcurrency || 4) <= 4) {
      index = 1;
    }
    this._setQuality(index, { initial: true });
  }

  _setQuality(index, { initial = false } = {}) {
    index = clamp(Math.round(index), 0, QUALITY.length - 1);
    const preset = QUALITY[index];
    this.qualityIndex = index;
    this.renderer.shadowMap.enabled = preset.shadows;
    this.world.setQuality(index);
    this._applyPixelRatio();
    if (this.ui) this.ui.setQualityLabel(preset.label);
    if (this.debugEnabled) this._updateDebug();
    this._lastQualityLabel = preset.label;
  }

  _applyPixelRatio() {
    const preset = QUALITY[this.qualityIndex];
    const ratio = Math.min(window.devicePixelRatio || 1, preset.pixelRatio);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.world?.setPixelRatio?.(ratio);
  }

  _bindGlobal() {
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('orientationchange', () => window.setTimeout(this._onResize, 160), { passive: true });
    document.addEventListener('visibilitychange', this._onVisibilityChange);
    // Keep keyboard focus on the game rather than background buttons.
    window.addEventListener('keydown', (event) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
      }
    }, { passive: false });
  }

  _setupIntro() {
    // Attract mode: an editorial 3/4 side portrait with the title on the left.
    this.cameraDirector.setMode(0);
    this.cameraDirector.updateIntro(0.016, { jumpY: 0, crankAngle: 0, grounded: true });
    this.ui.setCamera(CAMERAS[0], 0, false);
    this._updateHUDState();
    this.ui.updateHUD(this._hudData());
    this.audio.setMuted(this.audio.muted);
    // Keep the autopilot eager, but let the camera see the bike accelerate.
    this.lastManualTime = -999;
    this.autopilot = true;
  }

  async startExperience() {
    if (this.started || this.starting) return;
    this.starting = true;
    try {
      await this.audio.start();
    } catch (err) {
      console.warn('Audio context failed to start:', err);
    }
    this._resetRun();
    this.started = true;
    this.intro = false;
    this.paused = false;
    this.pauseKind = null;
    this._suppressCameraAnnounce = true;
    this.cameraDirector.setMode(0);
    this._suppressCameraAnnounce = false;
    this.ui.begin();
    this.achievements.startRun();
    this.achievements.cameraUsed('chase');
    this.achievements.laneVisited(1);
    this.input.setEnabled(true);
    this.audio.setPaused(false);
    this.audio.playBell();
    this.ui.setMutedState(this.audio.muted);
    this._updateHUDState();
    this.ui.updateHUD(this._hudData());
    this.lastFrame = performance.now();
    this.starting = false;
  }

  _resetRun() {
    this.run.speed = 0;
    this.run.distance = 0;
    this.run.laneIndex = 1;
    this.run.laneX = 0;
    this.run.laneVelocity = 0;
    this.run.jumpY = 0;
    this.run.vy = 0;
    this.run.grounded = true;
    this.run.jumpCooldown = 0;
    this.run.wheelieTimer = 0;
    this.run.wheelie = 0;
    this.run.cadence = 0;
    this.run.crankAngle = 0;
    this.run.fish = 0;
    this.run.score = 0;
    this.run.combo = 0;
    this.run.bestCombo = 0;
    this.run.lastCatchAt = -99;
    this.run.laneCooldown = 0;
    this.run.autoLaneTimer = 0;
    this.fish.reset();
    this.rider.resetBasket();
    this.rider.root.position.set(0, ROAD.y, 0);
    this.autopilot = true;
    this.lastManualTime = -999;
    this._hasManualDriven = false;
    this._autoTakeoverAnnounced = false;
    this._sunsetSeen = false;
    this._nightAnnounced = false;
    this.distance = 0;
    this.world.distance = 0;
    this.world.setPhase(0.025);
    this._lastPhase = this.world.phase;
    this.ui?.setCamera(CAMERAS[0], 0, false);
    this.cameraDirector._setMode(0, true);
    this.ui?.el.hintBar?.classList.remove('dismissed');
    this.effects?.rings?.items?.forEach((ring) => {
      ring.life = 0;
      ring.sprite.visible = false;
    });
  }

  _onDrive(action) {
    if (!this.started || this.paused || this.ui?.isOverlayOpen()) return;
    this._markManual();
    this._hasManualDriven = true;
    if (action === 'left' || action === 'right') {
      this._changeLane(action === 'left' ? -1 : 1, false);
      return;
    }
    if (action === 'jump') {
      this._jump();
      return;
    }
    if (action === 'wing') {
      this._popWheelie();
    }
  }

  _markManual() {
    if (!this.started) return;
    this.lastManualTime = this.simTime;
    if (this.autopilot) {
      this.autopilot = false;
      this._autoTakeoverAnnounced = false;
    }
    this._hasManualDriven = true;
  }

  _changeLane(direction, automatic = false) {
    if (this.run.laneCooldown > 0) return;
    const next = clamp(this.run.laneIndex + direction, 0, 2);
    if (next === this.run.laneIndex) return;
    this.run.laneIndex = next;
    this.run.laneCooldown = automatic ? 0.38 : 0.26;
    this.run.speed = Math.max(0, this.run.speed - 0.08);
    if (this.started) {
      this.achievements.laneVisited(next);
      this.audio.playLane();
    }
    if (!automatic) this._markManual();
    if (this.debugEnabled) this._updateDebug();
  }

  _jump() {
    if (!this.run.grounded || this.run.jumpCooldown > 0) return;
    this.run.jumpCooldown = 0.18;
    this.run.vy = RIDE.jumpVelocity;
    this.run.jumpY = 0.001;
    this.run.grounded = false;
    this.run.wheelieTimer = 0;
    this.audio.playJump();
    this.cameraDirector.addShake(0.08);
    const wheelPos = _v.set(this.run.laneX, ROAD.y + 0.02, 0.55);
    this.effects.jumpDust(wheelPos, 1);
  }

  _popWheelie() {
    if (this.run.wheelieTimer > 0.25) return;
    this.run.wheelieTimer = 1.9;
    this.audio.playWheelie();
    this.cameraDirector.addShake(0.06);
    if (this.started) this.achievements.wheelieDone();
  }

  _autoSteer(dt) {
    this.run.autoLaneTimer -= dt;
    if (this.run.autoLaneTimer > 0 || this.run.laneCooldown > 0) return;
    const info = this.fish.getIncomingInfo();
    const desired = info ? info.laneIndex : 1;
    if (desired !== this.run.laneIndex) {
      const delta = Math.sign(desired - this.run.laneIndex);
      this._changeLane(delta, true);
      this.run.autoLaneTimer = 0.5 + this._rand() * 0.5;
    } else {
      this.run.autoLaneTimer = 0.7 + this._rand() * 0.7;
    }
  }

  _updateSpeed(dt, inputState) {
    const speed = this.run.speed;
    if (this.autopilot) {
      const info = this.fish.getIncomingInfo();
      const target = info ? RIDE.autopilotSpeed : RIDE.cruiseSpeed;
      if (speed < target) {
        this.run.speed += RIDE.accel * dt * (0.72 - speed / RIDE.maxSpeed * 0.16);
      } else if (speed > target + 0.35) {
        this.run.speed -= RIDE.brake * dt * 0.3;
      } else if (!info) {
        this.run.speed -= 0.08 * dt;
      }
    } else if (inputState.brake) {
      this.run.speed -= RIDE.brake * dt;
    } else if (inputState.accel) {
      const accelFalloff = 1 - clamp(speed / RIDE.maxSpeed, 0, 1) * 0.44;
      this.run.speed += RIDE.accel * dt * accelFalloff;
    } else {
      this.run.speed -= (0.6 + speed * 0.035) * dt;
    }
    this.run.speed = clamp(this.run.speed, 0, RIDE.maxSpeed);
    if (this.run.speed < 0.03) this.run.speed = 0;
  }

  _updateAutopilot(dt) {
    if (!this.started) {
      this.autopilot = true;
      return;
    }
    const manualHeld = this.input.accel || this.input.brake;
    if (manualHeld) {
      this.lastManualTime = this.simTime;
      if (this.autopilot) {
        this.autopilot = false;
        this._autoTakeoverAnnounced = false;
      }
    }
    if (this.autopilot) return;
    const idleTime = this.simTime - this.lastManualTime;
    if (idleTime >= RIDE.autopilotDelay) {
      this.autopilot = true;
      this.run.autoLaneTimer = 0.2;
      if (this._hasManualDriven && !this._autoTakeoverAnnounced) {
        this._autoTakeoverAnnounced = true;
        this.ui.showToast({
          title: '它接过了车把',
          desc: '自动驾驶已接管，正在寻找下一条跃出水面的鱼。',
          type: 'info',
          icon: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="m15 9-2 4-4 2 2-4 4-2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
          duration: 3000,
        });
      }
    }
  }

  _updateJump(dt) {
    this.run.jumpCooldown = Math.max(0, this.run.jumpCooldown - dt);
    if (!this.run.grounded) {
      this.run.vy -= RIDE.gravity * dt;
      this.run.jumpY += this.run.vy * dt;
      if (this.run.jumpY <= 0 && this.run.vy < 0) {
        const impact = clamp(-this.run.vy / 7, 0.4, 1.25);
        this.run.jumpY = 0;
        this.run.vy = 0;
        this.run.grounded = true;
        this.rider.triggerLand(impact);
        this.audio.playLand();
        this.cameraDirector.addShake(0.12 * impact);
        this.effects.landDust(_v.set(this.run.laneX, ROAD.y, 0.35), impact);
        this.ui.flash('normal');
      }
    }
    if (this.run.wheelieTimer > 0) {
      this.run.wheelieTimer = Math.max(0, this.run.wheelieTimer - dt);
    }
    const targetWheelie = this.run.wheelieTimer > 0 ? 1 : 0;
    this.run.wheelie = damp(this.run.wheelie, targetWheelie, targetWheelie ? 8 : 5.5, dt);
    if (this.run.wheelie < 0.004) this.run.wheelie = 0;
  }

  _tick(dt) {
    this.simTime += dt;
    const inputState = this.input.getState();
    this._updateAutopilot(dt);
    if (this.autopilot) this._autoSteer(dt);
    this._updateSpeed(dt, inputState);
    this.run.laneCooldown = Math.max(0, this.run.laneCooldown - dt);
    this._updateJump(dt);

    const targetX = ROAD.laneX[this.run.laneIndex];
    const previousX = this.run.laneX;
    const laneDamp = this.run.grounded ? RIDE.laneDamp + 1.5 : RIDE.laneDamp * 0.55;
    this.run.laneX = damp(this.run.laneX, targetX, laneDamp, dt);
    this.run.laneVelocity = dt > 0 ? (this.run.laneX - previousX) / dt : 0;

    const speed = this.run.speed;
    const cadenceTarget = speed > 0.1 ? 45 + clamp(speed / RIDE.maxSpeed, 0, 1) * 66 : 0;
    this.run.cadence = damp(this.run.cadence, cadenceTarget, speed < 0.12 ? 5.5 : 2.7, dt);
    this.run.crankAngle += (this.run.cadence / 60) * TAU * dt;
    const deltaDistance = speed * dt;
    this.run.distance += deltaDistance;
    this.distance = this.run.distance;

    if (this.started) {
      this.achievements.distanceRidden(deltaDistance);
      this.achievements.speedRecord(speed * 3.6);
      if (this.run.combo > 0 && this.simTime - this.run.lastCatchAt > 8.4) {
        this.run.combo = 0;
      }
    }

    const fishPhase = this.world.phase;
    const lookYaw = this.fish.getLookYaw(this.run.laneX);
    this.rider.update(dt, {
      speed,
      cadence: this.run.cadence,
      laneVelocity: this.run.laneVelocity,
      wheelie: this.run.wheelie,
      wingOut: clamp(this.run.wheelie + (this.run.grounded ? 0 : 0.1), 0, 1),
      airborne: !this.run.grounded,
      jumpY: this.run.jumpY,
      laneX: this.run.laneX,
      night: this.world.night,
      pedaling: speed > 0.15,
      lookYaw,
    });

    this.fish.update(dt, {
      phase: fishPhase,
      jumpY: this.run.jumpY,
      running: true,
      autopilot: this.autopilot,
    });

    if (this.started) {
      this.cameraDirector.update(dt, {
        speed,
        jumpY: this.run.jumpY,
        laneVelocity: this.run.laneVelocity,
        crankAngle: this.run.crankAngle,
        grounded: this.run.grounded,
      });
    } else {
      this.cameraDirector.updateIntro(dt, {
        speed,
        jumpY: this.run.jumpY,
        laneVelocity: this.run.laneVelocity,
        crankAngle: this.run.crankAngle,
        grounded: this.run.grounded,
      });
    }

    const wheelWorld = new THREE.Vector3(this.run.laneX, ROAD.y + this.run.jumpY + 0.03, 0.6);
    this.effects.update(dt, {
      speed,
      grounded: this.run.grounded,
      jumpY: this.run.jumpY,
      paused: false,
      wheelPosition: wheelWorld,
    });

    const previousPhase = this.world.phase;
    this.world.update(dt, {
      speed,
      distance: this.run.distance,
      camera: this.camera,
    });
    this._checkMilestones(previousPhase);
    this.world.phase = this.world.phase;

    this.audio.update({
      cadence: this.run.cadence,
      speed,
      phase: this.world.phase,
      paused: this.paused,
      visible: !document.hidden,
    });

    if (this.started) {
      this.achievements.update(dt);
      this.ui.updateHUD({
        speedKmh: speed * 3.6,
        cadence: this.run.cadence,
        bpm: this.audio.started ? this.audio.bpm : 0,
        fish: this.run.fish,
        score: this.run.score,
        combo: this.run.combo,
        autopilot: this.autopilot,
        laneIndex: this.run.laneIndex,
        phase: this.world.phase,
        quality: QUALITY[this.qualityIndex].label,
        fishInfo: this.fish.getIncomingInfo(),
        started: this.started,
      });
      this._lastPhase = this.world.phase;
    }
    this._updateFps(dt);
  }

  _checkMilestones(previousPhase) {
    if (!this.started) return;
    const phase = this.world.phase;
    if (!this._sunsetSeen && phase >= 0.085 && phase < 0.5) {
      this._sunsetSeen = true;
      this.achievements.sunsetSeen();
    }
    if (!this._nightAnnounced && (phase > 0.27 && phase < 0.82)) {
      this._nightAnnounced = true;
      this.world.environment.lighthouseGlow.material.opacity = 1;
      this.audio.playBell();
      this.ui.showToast({
        title: '星夜已至',
        desc: '月亮接管了海面。金鳍鱼、月相鱼都在更近的暗处游动。',
        type: 'info',
        icon: '<path d="M20 15a8 8 0 1 1-11-11 7 7 0 0 0 11 11Z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 19c2-2 5-2 7 0 2-2 5-2 7 0" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/>',
        duration: 4200,
      });
    }
  }

  _onFishCaught(data) {
    if (!this.started) return;
    const position = data.position;
    this.effects.catchBurst(position, data.type.glow || '#ffe0a2', data.type.points >= 5);
    this.cameraDirector.addShake(0.08 + Math.min(0.16, (this.run.combo || 0) * 0.015));
    const now = this.simTime;
    if (now - this.run.lastCatchAt <= 8.4 && this.run.lastCatchAt > -50) {
      this.run.combo += 1;
    } else {
      this.run.combo = 1;
    }
    this.run.lastCatchAt = now;
    this.run.bestCombo = Math.max(this.run.bestCombo, this.run.combo);
    this.run.fish += 1;
    const multiplier = Math.min(8, this.run.combo);
    const points = data.basePoints * multiplier;
    this.run.score += points;
    this.audio.playCatch(data.type.id, this.run.combo, points);
    this.ui.pulseCatch();
    this.ui.flash(data.type.points >= 5 ? 'gold' : 'normal');
    this.ui.floatAt(
      position,
      this.camera,
      `+${points}`,
      `${data.type.name}${this.run.combo > 1 ? `  ×${this.run.combo}` : ''}`
    );
    this.achievements.fishCaught({
      night: this.world.isNight(),
      autopilot: data.autopilot,
      airborne: data.airborne,
    });
    if (this.debugEnabled) this._updateDebug();
  }

  _onFishMissed(data) {
    if (!this.started) return;
    const hadCombo = this.run.combo >= 2;
    this.run.combo = 0;
    this.run.lastCatchAt = -99;
    this.audio.playMiss();
    if (hadCombo) {
      this.ui.showToast({
        title: '连击断了',
        desc: '鱼尾扫过车把，海风笑了一声。再对准一次车道。',
        type: 'info',
        icon: '<path d="M3 12c4-5 10-6 15-2 2-2 4-3 6-3l-1 5 1 5c-2 0-4-1-6-3-5 4-11 3-15-2Z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/><path d="m4 4 16 16" stroke="currentColor" stroke-width="1.1" opacity=".55"/>',
        duration: 2600,
      });
    }
  }

  _onFishSpawned(data) {
    if (this.effects) this.effects.splash(data.position, data.type.glow);
  }

  _onAchievement(def) {
    if (!this.started) return;
    this.audio.playAchievement();
    this.ui?.announceAchievement(def);
    if (this.effects) {
      const pos = new THREE.Vector3(this.run.laneX, ROAD.y + 1.9, 0);
      this.effects.celebrate(pos);
    }
    if (this.debugEnabled) this._updateDebug();
  }

  _onCommand(command) {
    if (command === 'camera') {
      this.cycleCamera();
    } else if (command === 'pause') {
      this.togglePause();
    } else if (command === 'help') {
      if (this.ui.isOverlayOpen()) this.ui.closeOverlay();
      else this.ui.openHelp();
    } else if (command === 'mute') {
      this.toggleMute();
    } else if (command === 'motion') {
      if (this.started) this.ui.toggleHud();
    }
  }

  cycleCamera() {
    const mode = this.cameraDirector.cycle();
    if (this.started) {
      this.audio.playClick();
      this.achievements.cameraUsed(mode.id, { night: this.world.isNight() });
    }
  }

  togglePause() {
    if (!this.started) return;
    if (this.ui.isOverlayOpen()) {
      if (this.ui.getOverlayName() === 'pause') this.resumeGame();
      else this.ui.closeOverlay();
      return;
    }
    if (this.paused) this.resumeGame();
    else this.pauseGame();
  }

  pauseGame() {
    if (!this.started || this.paused) return;
    this.paused = true;
    this.pauseKind = 'user';
    this.input.releaseAll();
    this.input.setEnabled(false);
    this.audio.setPaused(true);
    this.ui.showPause({
      distance: this.run.distance,
      fish: this.run.fish,
      score: this.run.score,
    });
  }

  resumeGame() {
    if (!this.started) return;
    this.ui.hidePause();
    this.ui._hideAllOverlays?.();
    this.ui.openModalName = null;
    this.paused = false;
    this.pauseKind = null;
    this.input.setEnabled(true);
    this.audio.setPaused(false);
    this.ui.el.hud?.classList.remove('is-paused');
    this.lastFrame = performance.now();
    this._lastPhase = this.world.phase;
  }

  _onOverlayState(open, name) {
    if (open) {
      if (!this.paused) {
        this.paused = true;
        this.pauseKind = 'overlay';
        this.input.releaseAll();
        this.input.setEnabled(false);
        this.audio.setPaused(true);
      } else {
        this.pauseKind = 'overlay';
      }
    } else {
      if (this.pauseKind === 'overlay' && this.paused) {
        this.paused = false;
        this.pauseKind = null;
        this.input.setEnabled(this.started);
        this.audio.setPaused(false);
        this.lastFrame = performance.now();
      }
    }
  }

  toggleMute() {
    const muted = this.audio.toggleMuted();
    this.ui.setMutedState(muted);
    if (this.started) {
      this.ui.showToast({
        title: muted ? '已静音' : '声音回来了',
        desc: muted ? '海还在，只是暂时听不见。' : '海浪、链条与配乐由浏览器实时合成。',
        type: 'info',
        icon: muted
          ? '<path d="M4 10v4h3l4 4V6L7 10H4Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="m16 10 4 4m0-4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>'
          : '<path d="M4 10v4h3l4 4V6L7 10H4Z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M15 9c1.3 1.7 1.3 4.3 0 6M17.7 6.5c2.7 3.1 2.7 7.9 0 11" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>',
        duration: 2200,
      });
    }
  }

  _onVisibilityChange() {
    if (document.hidden) {
      if (this.started && !this.paused) {
        this._visibilityPause = true;
        this.pauseGame();
      }
      this.audio.ctx?.suspend?.();
    } else {
      this.lastFrame = performance.now();
      if (!document.hidden && this.audio.started && !this.paused) this.audio.ctx?.resume?.();
    }
  }

  _updateFps(dt) {
    if (dt <= 0 || dt > 0.5) return;
    this._renderTime = this._renderTime * 0.92 + dt * 0.08;
    this.fpsWindowTime += dt;
    this.fpsWindowFrames++;
    if (this.fpsWindowTime >= 1.2) {
      const fps = this.fpsWindowFrames / this.fpsWindowTime;
      this.fps = this.fps * 0.55 + fps * 0.45;
      this.fpsWindowTime = 0;
      this.fpsWindowFrames = 0;
      if (this.fps < 47) {
        this.lowSamples++;
        this.highSamples = 0;
      } else if (this.fps > 57) {
        this.highSamples++;
        this.lowSamples = 0;
      } else {
        this.lowSamples = Math.max(0, this.lowSamples - 1);
        this.highSamples = 0;
      }
    }
    if (!this.fixedQuality && this.frameCount > 70) {
      this.qualityCooldown -= dt;
      if (this.qualityCooldown <= 0) {
        if (this.lowSamples >= 2 && this.qualityIndex > 0) {
          this._setQuality(this.qualityIndex - 1);
          this.qualityCooldown = 3.0;
          this.lowSamples = 0;
          this.highSamples = 0;
        } else if (this.highSamples >= 4 && this.qualityIndex < QUALITY.length - 1) {
          this._setQuality(this.qualityIndex + 1);
          this.qualityCooldown = 6.0;
          this.lowSamples = 0;
          this.highSamples = 0;
        }
      }
    }
    if (this.debugEnabled) {
      this._debugFpsTimer = (this._debugFpsTimer || 0) - dt;
      if (this._debugFpsTimer <= 0) {
        this._debugFpsTimer = 0.4;
        this._updateDebug();
      }
    }
  }

  _updateDebug() {
    if (!this.debugEl) return;
    const info = this.renderer.info.render;
    this.debugEl.textContent = [
      `FPS ${this.fps.toFixed(1)}  quality ${QUALITY[this.qualityIndex].id}${this.fixedQuality ? ' (fixed)' : ''}`,
      `camera ${this.cameraDirector?.getMode().id}  phase ${(this.world?.phase || 0).toFixed(3)}  night ${(this.world?.night || 0).toFixed(2)}`,
      `speed ${(this.run?.speed * 3.6 || 0).toFixed(1)} km/h  lane ${this.run?.laneIndex}  jump ${(this.run?.jumpY || 0).toFixed(2)}`,
      `fish ${this.run?.fish || 0}  score ${this.run?.score || 0}  combo ${this.run?.combo || 0}`,
      `calls ${info?.calls || 0}  triangles ${info?.triangles || 0}`,
      `audio ${this.audio ? JSON.stringify(this.audio.getDebugState()) : 'none'}`,
    ].join('\n');
  }

  _hudData() {
    return {
      speedKmh: this.run.speed * 3.6,
      cadence: this.run.cadence,
      bpm: this.audio.started ? this.audio.bpm : 0,
      fish: this.run.fish,
      score: this.run.score,
      combo: this.run.combo,
      autopilot: this.autopilot,
      laneIndex: this.run.laneIndex,
      phase: this.world.phase,
      quality: QUALITY[this.qualityIndex].label,
      fishInfo: this.fish.getIncomingInfo(),
      started: this.started,
    };
  }

  _updateHUDState() {
    if (!this.started) return;
    this.ui.updateHUD(this._hudData());
  }

  _animate() {
    if (this._disposed) return;
    const now = performance.now();
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (!Number.isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.05);
    this.frameCount++;

    if (!this.paused) {
      this._tick(dt);
    } else {
      if (this.started) {
        this.cameraDirector.update(dt, {
          speed: 0,
          jumpY: this.run.jumpY,
          laneVelocity: 0,
          crankAngle: this.run.crankAngle,
          grounded: this.run.grounded,
        });
      } else {
        this.cameraDirector.updateIntro(dt, {
          jumpY: this.run.jumpY,
          crankAngle: this.run.crankAngle,
          grounded: this.run.grounded,
        });
      }
      this.audio.update({
        cadence: 0,
        speed: 0,
        phase: this.world.phase,
        paused: true,
        visible: !document.hidden,
      });
      this._updateFps(dt);
    }

    this._render();
  }

  _render() {
    // Render directly. The previous post-processing chain looked glossy on
    // some GPUs, but produced partial black frames on others, so the coast is
    // deliberately rendered in a single, broadly compatible pass.
    this.renderer.render(this.scene, this.camera);
    if (this.debugEnabled && this.frameCount % 120 === 0) this._updateDebug();
  }

  _onResize() {
    if (!this.renderer) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
    this.cameraDirector?.onResize();
    this._applyPixelRatio();
    this.ui?.onResize?.();
    this.effects?.updatePointScale?.();
  }

  _exposeDebug() {
    const self = this;
    window.__PELICAN__ = {
      game: self,
      start: () => self.startExperience(),
      pause: () => self.pauseGame(),
      resume: () => self.resumeGame(),
      setPhase: (p) => {
        self.world.setPhase(p);
        self.ui?.updateHUD(self._hudData());
      },
      setCamera: (index) => {
        self.cameraDirector.setMode(index);
      },
      cycleCamera: () => self.cycleCamera(),
      setQuality: (index) => {
        self.fixedQuality = true;
        self._setQuality(index);
      },
      setSpeed: (speed, lane) => {
        self.run.speed = clamp(speed, 0, RIDE.maxSpeed);
        if (typeof lane === 'number') {
          self.run.laneIndex = clamp(Math.round(lane), 0, 2);
          self.run.laneX = ROAD.laneX[self.run.laneIndex];
        }
      },
      setLane: (lane) => {
        self.run.laneIndex = clamp(Math.round(lane), 0, 2);
      },
      fish: () => self.fish,
      state: () => ({
        started: self.started,
        paused: self.paused,
        quality: QUALITY[self.qualityIndex].id,
        camera: self.cameraDirector.getMode().id,
        phase: self.world.phase,
        night: self.world.night,
        speed: self.run.speed,
        distance: self.run.distance,
        fish: self.run.fish,
        score: self.run.score,
        combo: self.run.combo,
        lane: self.run.laneIndex,
        achievements: self.achievements.unlocked.size,
        audio: self.audio.getDebugState(),
      }),
      unlock: (id) => self.achievements._unlock(id),
      resetAchievements: () => {
        localStorage.removeItem('pelican-coast-save-v2');
        location.reload();
      },
    };
  }
}

const game = new Game();
