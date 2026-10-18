import * as THREE from 'three';
import { DAY_KEYS, QUALITY, ROAD } from './config.js';
import { clamp, damp, isNight, phaseInDay, smoothstep } from './utils.js';
import { SkySystem } from './sky.js';
import { Ocean } from './ocean.js';
import { CoastEnvironment } from './environment.js';

const COLOR_FIELDS = [
  'skyTop', 'skyMid', 'skyHorizon', 'skyLow', 'sun', 'moon', 'fog', 'clouds',
  'waterDeep', 'waterNear', 'ambientSky', 'ambientGround', 'keyLight', 'fillLight',
];
const NUMBER_FIELDS = [
  'sunGlow', 'moonGlow', 'fogDensity', 'stars', 'keyIntensity', 'fillIntensity',
  'exposure', 'sunElev', 'sunAzimuth', 'moonElev', 'moonAzimuth', 'lamp', 'haze',
];

function directionFromAngles(azimuth, elevationDegrees) {
  const el = (elevationDegrees / 180) * Math.PI;
  return new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(el),
    Math.sin(el),
    -Math.cos(azimuth) * Math.cos(el)
  ).normalize();
}

export class World {
  constructor(scene, renderer, { initialPhase = 0.018 } = {}) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 0;
    this.phase = phaseInDay(initialPhase);
    this.distance = 0;
    this.speed = 0;
    this.quality = 2;
    this.cycleSeconds = 192;
    this.night = 0;
    this.dayProgress = { sunElevation: 0, moonElevation: 0 };

    this._preparePalette();
    this._setupAtmosphere();
    this.sky = new SkySystem(scene, renderer);
    this.ocean = new Ocean(scene, renderer);
    this.environment = new CoastEnvironment(scene, renderer);
    this.setQuality(2, true);
    this._updateAll(0, { speed: 0, distance: 0 });
  }

  _preparePalette() {
    this._keyColors = DAY_KEYS.map((key) => {
      const map = {};
      for (const field of COLOR_FIELDS) map[field] = new THREE.Color(key[field] || '#000000');
      return map;
    });
    this.palette = {};
    for (const field of COLOR_FIELDS) this.palette[field] = new THREE.Color();
    for (const field of NUMBER_FIELDS) this.palette[field] = 0;
    this.palette.sunDirection = new THREE.Vector3();
    this.palette.moonDirection = new THREE.Vector3();
    this._samplePalette();
  }

  _samplePalette() {
    const p = this.phase;
    let i = 0;
    while (i < DAY_KEYS.length - 2 && p > DAY_KEYS[i + 1].t) i++;
    const a = DAY_KEYS[i];
    const b = DAY_KEYS[i + 1] || DAY_KEYS[DAY_KEYS.length - 1];
    const t = clamp((p - a.t) / Math.max(0.0001, b.t - a.t), 0, 1);
    for (const field of COLOR_FIELDS) {
      this.palette[field].copy(this._keyColors[i][field]).lerp(this._keyColors[i + 1][field], t);
    }
    for (const field of NUMBER_FIELDS) {
      this.palette[field] = a[field] + (b[field] - a[field]) * t;
    }
    this.palette.sunDirection.copy(directionFromAngles(this.palette.sunAzimuth, this.palette.sunElev));
    this.palette.moonDirection.copy(directionFromAngles(this.palette.moonAzimuth, this.palette.moonElev));
    this.palette.night = smoothstep(0.14, 0.78, this.palette.stars);
    this.palette.starVeil = this.palette.stars;
  }

  _setupAtmosphere() {
    this.scene.fog = new THREE.FogExp2(this.palette.fog, this.palette.fogDensity);
    this.scene.background = null;

    this.hemi = new THREE.HemisphereLight(this.palette.ambientSky, this.palette.ambientGround, 0.75);
    this.hemi.position.set(0, 1, 0);
    this.scene.add(this.hemi);

    this.keyLight = new THREE.DirectionalLight(this.palette.keyLight, this.palette.keyIntensity);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.camera.left = -19;
    this.keyLight.shadow.camera.right = 19;
    this.keyLight.shadow.camera.top = 23;
    this.keyLight.shadow.camera.bottom = -11;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 110;
    this.keyLight.shadow.bias = -0.00035;
    this.keyLight.shadow.normalBias = 0.035;
    this.keyLight.shadow.radius = 2.2;
    this.keyLight.target.position.set(0, ROAD.y + 0.5, 0);
    this.scene.add(this.keyLight);
    this.scene.add(this.keyLight.target);

    this.fillLight = new THREE.DirectionalLight(this.palette.fillLight, this.palette.fillIntensity);
    this.fillLight.position.set(-36, 21, 28);
    this.fillLight.target.position.set(0, ROAD.y, 0);
    this.fillLight.castShadow = false;
    this.scene.add(this.fillLight);
    this.scene.add(this.fillLight.target);

    this.rimLight = new THREE.DirectionalLight(this.palette.sun, 0.45);
    this.rimLight.position.set(28, 9, -24);
    this.rimLight.target.position.set(0, ROAD.y + 2, 0);
    this.rimLight.castShadow = false;
    this.scene.add(this.rimLight);
    this.scene.add(this.rimLight.target);

    // A camera-side hero fill: the character should stay readable even when
    // the coast is almost a silhouette.
    this.heroLight = new THREE.DirectionalLight('#ffd7ae', 0.42);
    this.heroLight.position.set(0, 10, 12);
    this.heroLight.target.position.set(0, ROAD.y + 1.8, 0);
    this.heroLight.castShadow = false;
    this.scene.add(this.heroLight);
    this.scene.add(this.heroLight.target);

    // A tiny amount of ambient warmth is lifted by the ocean reflection.
    this.bounce = new THREE.AmbientLight(this.palette.ambientGround, 0.2);
    this.scene.add(this.bounce);
  }

  setQuality(index, force = false) {
    index = clamp(index, 0, 3);
    if (!force && index === this.quality) return;
    this.quality = index;
    const preset = QUALITY[index];
    this.renderer.shadowMap.enabled = preset.shadows;
    this.keyLight.castShadow = preset.shadows;
    if (preset.shadows) {
      const size = index >= 2 ? 2048 : 1024;
      if (this.keyLight.shadow.mapSize.x !== size) {
        if (this.keyLight.shadow.map) {
          this.keyLight.shadow.map.dispose();
          this.keyLight.shadow.map = null;
        }
        this.keyLight.shadow.mapSize.set(size, size);
      }
    }
    if (this.keyLight.shadow.map) {
      // Trigger a clean shadow texture rebuild on the next frame.
      this.keyLight.shadow.needsUpdate = true;
    }
    this.sky.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.ocean.setQuality(index);
    this.environment.setQuality(index);
    this.hemi.intensity = index >= 2 ? 0.8 : 0.7;
  }

  setPhase(value) {
    this.phase = phaseInDay(value);
    this._samplePalette();
    this._updateAll(0, { speed: this.speed, distance: this.distance });
  }

  update(dt, state = {}) {
    this.time += dt;
    this.phase = phaseInDay(this.phase + dt / this.cycleSeconds);
    this.distance = state.distance ?? this.distance;
    this.speed = state.speed ?? this.speed;
    this._samplePalette();
    this._updateAll(dt, state);
  }

  _updateAll(dt, state) {
    this._updateLighting();
    const time = this.time;

    this.sky.update(dt, this.palette, time, this.quality);
    this.ocean.sunDirection = this.palette.sunDirection;
    this.ocean.moonDirection = this.palette.moonDirection;
    this.ocean.setSpeed(this.speed);
    this.ocean.update(dt, this.palette, time, this.distance, state.camera || this._dummyCamera || this.skyCameraFallback());
    this.environment.update(dt, {
      speed: this.speed,
      distance: this.distance,
      palette: this.palette,
      time,
      quality: this.quality,
    });

    this.scene.fog.color.copy(this.palette.fog);
    this.scene.fog.density = this.palette.fogDensity;
    this.renderer.toneMappingExposure = this.palette.exposure;

    this.night = smoothstep(0.08, 0.62, this.palette.stars);
    this.dayProgress.sunElevation = this.palette.sunElev;
    this.dayProgress.moonElevation = this.palette.moonElev;
  }

  skyCameraFallback() {
    if (!this._fallbackCamera) this._fallbackCamera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
    return this._fallbackCamera;
  }

  _updateLighting() {
    const palette = this.palette;
    const useSun = palette.sunElev >= -1.5;
    const dir = useSun ? palette.sunDirection : palette.moonDirection;
    const lightDir = dir.clone();
    if (lightDir.y < 0.12) {
      // Long shadows are lovely; shadows cast from underwater are not.
      lightDir.y = 0.12;
      lightDir.normalize();
    }
    this.keyLight.position.copy(lightDir).multiplyScalar(52);
    this.keyLight.position.add(new THREE.Vector3(0, ROAD.y, 0));
    this.keyLight.color.copy(palette.keyLight);
    this.keyLight.intensity = palette.keyIntensity * (1 + this.night * 0.42);
    this.keyLight.target.position.set(0, ROAD.y + 0.5, 0);

    this.hemi.color.copy(palette.ambientSky);
    this.hemi.groundColor.copy(palette.ambientGround);
    this.hemi.intensity = 0.62 + palette.keyIntensity * 0.12 + this.night * 0.2;

    this.fillLight.color.copy(palette.fillLight);
    this.fillLight.intensity = palette.fillIntensity * 1.18;
    this.fillLight.position.set(-32, 18, 22);

    this.rimLight.color.copy(palette.sun).lerp(palette.moon, this.night);
    this.rimLight.intensity = useSun ? 0.74 : 0.42 + palette.moonGlow * 0.24;
    this.rimLight.position.copy(dir).multiplyScalar(-32);
    this.rimLight.position.y = 8;

    const camera = this._dummyCamera;
    if (camera) {
      this.heroLight.position.set(camera.position.x + 1.2, camera.position.y + 4.2, camera.position.z + 3.5);
    }
    this.heroLight.color.copy(palette.sun).lerp(palette.moon, this.night).lerp(new THREE.Color('#d6e4ff'), 0.18);
    this.heroLight.intensity = 0.4 + this.night * 0.62;
    this.heroLight.target.position.set(0, ROAD.y + 1.9, 0);

    this.bounce.color.copy(palette.ambientGround);
    this.bounce.intensity = 0.16 + palette.stars * 0.1;
  }

  getPhase() {
    return this.phase;
  }

  getNightFactor() {
    return this.night;
  }

  getPalette() {
    return this.palette;
  }

  isNight() {
    return isNight(this.phase);
  }

  setCamera(camera) {
    this._dummyCamera = camera;
  }

  setSpeedVisual(speed) {
    this.speed = speed;
    this.ocean.setSpeed(speed);
  }

  setPixelRatio(ratio) {
    this.sky.setPixelRatio(ratio);
  }
}
