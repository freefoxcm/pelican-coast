import { ACHIEVEMENTS } from './config.js';

const SAVE_KEY = 'pelican-coast-save-v2';

function defaultSave() {
  return {
    unlocked: [],
    stats: {
      started: false,
      fish: 0,
      nightFish: 0,
      autoFish: 0,
      distance: 0,
      maxSpeed: 0,
      lanes: [],
      cameras: [],
      sunset: false,
      wheelie: false,
      airFish: false,
    },
  };
}

export class Achievements {
  constructor({ onUnlock, onProgress } = {}) {
    this.onUnlock = onUnlock || (() => {});
    this.onProgress = onProgress || (() => {});
    this.defs = ACHIEVEMENTS;
    this.byId = new Map(this.defs.map((def) => [def.id, def]));
    this.save = this._load();
    this.unlocked = new Set(this.save.unlocked);
    this.stats = Object.assign(defaultSave().stats, this.save.stats || {});
    this.stats.lanes = Array.isArray(this.stats.lanes) ? this.stats.lanes : [];
    this.stats.cameras = Array.isArray(this.stats.cameras) ? this.stats.cameras : [];
    this._dirty = false;
    this._saveTimer = 0;
    this._recent = new Set();
  }

  _load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return defaultSave();
      return {
        unlocked: Array.isArray(parsed.unlocked) ? parsed.unlocked : [],
        stats: parsed.stats && typeof parsed.stats === 'object' ? parsed.stats : defaultSave().stats,
      };
    } catch {
      return defaultSave();
    }
  }

  _persist(immediate = false) {
    this.save.unlocked = [...this.unlocked];
    this.save.stats = this.stats;
    this._dirty = true;
    if (immediate) this.flush();
  }

  flush() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
      this._dirty = false;
    } catch {
      // Storage may be unavailable in private windows; the ride can continue.
    }
  }

  update(dt) {
    if (this._dirty) {
      this._saveTimer += dt;
      if (this._saveTimer > 2.4) {
        this._saveTimer = 0;
        this.flush();
      }
    }
  }

  progressFor(id) {
    const s = this.stats;
    switch (id) {
      case 'first_ride': return { current: this.unlocked.has(id) ? 1 : 0, target: 1 };
      case 'first_fish': return { current: Math.min(1, s.fish), target: 1 };
      case 'fish_10': return { current: Math.min(10, s.fish), target: 10 };
      case 'fish_30': return { current: Math.min(30, s.fish), target: 30 };
      case 'three_lanes': return { current: Math.min(3, s.lanes.length), target: 3 };
      case 'speed_36': return { current: Math.min(36, s.maxSpeed), target: 36 };
      case 'air_fish': return { current: s.airFish ? 1 : 0, target: 1 };
      case 'wheelie': return { current: s.wheelie ? 1 : 0, target: 1 };
      case 'sunset': return { current: s.sunset ? 1 : 0, target: 1 };
      case 'night_fish': return { current: Math.min(5, s.nightFish), target: 5 };
      case 'pelican_pov': return { current: this.unlocked.has(id) ? 1 : 0, target: 1 };
      case 'all_cameras': return { current: Math.min(5, s.cameras.length), target: 5 };
      case 'distance_2000': return { current: Math.min(2000, Math.round(s.distance)), target: 2000 };
      case 'autopilot': return { current: Math.min(3, s.autoFish), target: 3 };
      default: return { current: 0, target: 1 };
    }
  }

  _unlock(id, animate = true) {
    if (this.unlocked.has(id)) return false;
    const def = this.byId.get(id);
    if (!def) return false;
    this.unlocked.add(id);
    this._persist(true);
    this._recent.add(id);
    if (animate) this.onUnlock(def, this.unlocked.size);
    this.onProgress(this.getCompletion());
    return true;
  }

  _checkAll(context = {}) {
    const s = this.stats;
    this._unlock('first_ride');
    if (s.fish >= 1) this._unlock('first_fish');
    if (s.fish >= 10) this._unlock('fish_10');
    if (s.fish >= 30) this._unlock('fish_30');
    if (s.lanes.length >= 3) this._unlock('three_lanes');
    if (s.maxSpeed >= 36) this._unlock('speed_36');
    if (s.airFish) this._unlock('air_fish');
    if (s.wheelie) this._unlock('wheelie');
    if (s.sunset) this._unlock('sunset');
    if (s.nightFish >= 5) this._unlock('night_fish');
    if (s.cameras.length >= 5) this._unlock('all_cameras');
    if (s.distance >= 2000) this._unlock('distance_2000');
    if (s.autoFish >= 3) this._unlock('autopilot');
    if (context.povAtNight) this._unlock('pelican_pov');
    this.onProgress(this.getCompletion());
  }

  startRun() {
    this.stats.started = true;
    this._persist();
    this._unlock('first_ride');
    this._checkAll();
  }

  fishCaught({ night = false, autopilot = false, airborne = false } = {}) {
    this.stats.fish += 1;
    if (night) this.stats.nightFish += 1;
    if (autopilot) this.stats.autoFish += 1;
    if (airborne) this.stats.airFish = true;
    this._persist();
    this._checkAll();
  }

  distanceRidden(amount) {
    if (amount <= 0) return;
    this.stats.distance += amount;
    if (this.stats.distance >= 2000) this._unlock('distance_2000');
    this._dirty = true;
  }

  speedRecord(kmh) {
    if (kmh > this.stats.maxSpeed + 0.2) {
      this.stats.maxSpeed = kmh;
      this._dirty = true;
      if (kmh >= 36) this._unlock('speed_36');
    }
  }

  laneVisited(index) {
    if (!this.stats.lanes.includes(index)) {
      this.stats.lanes.push(index);
      this._persist();
      this._checkAll();
    }
  }

  cameraUsed(id, { night = false } = {}) {
    if (!this.stats.cameras.includes(id)) {
      this.stats.cameras.push(id);
      this._persist();
    }
    if (id === 'pov' && night) this._unlock('pelican_pov');
    this._checkAll({ povAtNight: id === 'pov' && night });
  }

  wheelieDone() {
    if (!this.stats.wheelie) {
      this.stats.wheelie = true;
      this._persist();
      this._unlock('wheelie');
      this._checkAll();
    }
  }

  sunsetSeen() {
    if (!this.stats.sunset) {
      this.stats.sunset = true;
      this._persist();
      this._checkAll();
    }
  }

  getCompletion() {
    return { unlocked: this.unlocked.size, total: this.defs.length };
  }

  getCards() {
    return this.defs.map((def) => {
      const progress = this.progressFor(def.id);
      return {
        ...def,
        unlocked: this.unlocked.has(def.id),
        progress: progress.current,
        target: progress.target,
        ratio: Math.min(1, progress.current / progress.target),
      };
    });
  }
}
