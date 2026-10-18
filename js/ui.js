import * as THREE from 'three';
import { CAMERAS, RIDE } from './config.js';
import { formatNumber, formatTimeOfDay, isNight, phaseName, projectToScreen } from './utils.js';

const LANE_CENTERS = [16.666, 50, 83.333];
const CAMERA_ICONS = {
  chase: '<path d="M4 16c3-7 13-7 16 0M6 16h2M16 16h2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>',
  cinema: '<rect x="3" y="6" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 6v12M16 6v12M3 9h5M3 15h5M16 9h5M16 15h5" stroke="currentColor" stroke-width="1"/>',
  pov: '<path d="M2 12s4-5 10-5 10 5 10 5-4 5-10 5S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="12" cy="12" r="2.4" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  drone: '<path d="M12 4v16M4 12h16M7 7l10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="1.1"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.4"/>',
  side: '<path d="M3 17c4 0 4-5 9-5s5 5 9 5M3 7h18" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="12" cy="14" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/>',
};

export class UI {
  constructor({ audio, achievements, callbacks = {} }) {
    this.audio = audio;
    this.achievements = achievements;
    this.callbacks = callbacks;
    this.el = {
      loading: document.getElementById('loading'),
      loadingBar: document.getElementById('loading-bar'),
      loadingCopy: document.getElementById('loading-copy'),
      hud: document.getElementById('hud'),
      startScreen: document.getElementById('start-screen'),
      startBtn: document.getElementById('start-btn'),
      fishCount: document.getElementById('fish-count'),
      scoreCount: document.getElementById('score-count'),
      comboBadge: document.getElementById('combo-badge'),
      comboValue: document.getElementById('combo-value'),
      speedValue: document.getElementById('speed-value'),
      speedArc: document.getElementById('speed-arc'),
      cadenceValue: document.getElementById('cadence-value'),
      cadenceFill: document.getElementById('cadence-fill'),
      musicBpm: document.getElementById('music-bpm'),
      qualityLabel: document.getElementById('quality-label'),
      autoIndicator: document.getElementById('auto-indicator'),
      autoLabel: document.getElementById('auto-label'),
      phaseLabel: document.getElementById('phase-label'),
      clockLabel: document.getElementById('clock-label'),
      sunDot: document.getElementById('sun-path-dot'),
      achCount: document.getElementById('ach-count'),
      achModalCount: document.getElementById('ach-modal-count'),
      achProgressFill: document.getElementById('ach-progress-fill'),
      achievementGrid: document.getElementById('achievement-grid'),
      helpModal: document.getElementById('help-modal'),
      achievementsModal: document.getElementById('achievements-modal'),
      pauseScreen: document.getElementById('pause-screen'),
      toastStack: document.getElementById('toast-stack'),
      floatLayer: document.getElementById('float-layer'),
      screenFlash: document.getElementById('screen-flash'),
      radar: document.querySelector('.fish-radar'),
      radarStatus: document.getElementById('radar-status'),
      fishMarker: document.getElementById('fish-marker'),
      laneMarker: document.getElementById('lane-marker'),
      fishHint: document.getElementById('fish-hint'),
      fishDistance: document.getElementById('fish-distance'),
      cameraNum: document.getElementById('camera-num'),
      cameraName: document.getElementById('camera-name'),
      cameraDesc: document.getElementById('camera-desc'),
      hintBar: document.querySelector('.hint-bar'),
      soundBtn: document.querySelector('[data-action="sound"]'),
      quality: document.querySelector('.music-line'),
      pauseDistance: document.getElementById('pause-distance'),
      pauseFish: document.getElementById('pause-fish'),
      pauseScore: document.getElementById('pause-score'),
      startMeta: document.querySelector('.start-meta'),
    };
    this.openModalName = null;
    this.cache = new Map();
    this.lastToasts = [];
    this._started = false;
    this._hudHidden = false;
    this._projected = new THREE.Vector3();
    this._bind();
    this._renderAchievementSummary();
    this._updateSoundIcon();
    this._applyCamera(CAMERAS[0], 0, false);
  }

  _bind() {
    document.addEventListener('click', (event) => {
      const actionEl = event.target.closest('[data-action]');
      if (!actionEl) return;
      const action = actionEl.dataset.action;
      if (action === 'close-modal') {
        this.closeOverlay();
        return;
      }
      if (action === 'achievements') {
        this.openAchievements();
        return;
      }
      if (action === 'help') {
        this.openHelp();
        return;
      }
      if (action === 'camera') {
        this.callbacks.onCamera?.();
        return;
      }
      if (action === 'sound') {
        this.callbacks.onSound?.();
        return;
      }
      if (action === 'pause') {
        this.callbacks.onPause?.();
        return;
      }
      if (action === 'resume') {
        this.callbacks.onResume?.();
        return;
      }
      if (action === 'dismiss-hints') {
        this.el.hintBar?.classList.add('dismissed');
        return;
      }
      if (action === 'hud') {
        this.toggleHud();
      }
    });

    this.el.startBtn?.addEventListener('click', (event) => {
      event.stopPropagation();
      this.requestStart();
    });
    this.el.startScreen?.addEventListener('pointerdown', (event) => {
      if (event.target.closest('button')) return;
      this.requestStart();
    });

    for (const modal of [this.el.helpModal, this.el.achievementsModal]) {
      modal.addEventListener('pointerdown', (event) => {
        if (event.target === modal) this.closeOverlay();
      });
    }

    this.el.pauseScreen?.addEventListener('pointerdown', (event) => {
      if (event.target === this.el.pauseScreen) this.callbacks.onResume?.();
    });

    window.addEventListener('keydown', (event) => {
      if (!this._started && event.code === 'Enter') {
        event.preventDefault();
        this.requestStart();
      }
    });
  }

  requestStart() {
    if (this._started || this.openModalName) return;
    this._started = true;
    this.callbacks.onStart?.();
  }

  setLoading(progress, copy) {
    if (!this.el.loadingBar) return;
    this.el.loadingBar.style.width = `${Math.max(3, Math.min(100, progress * 100))}%`;
    if (copy && this.el.loadingCopy) this.el.loadingCopy.textContent = copy;
  }

  hideLoading(delay = 300) {
    this.setLoading(1);
    window.setTimeout(() => {
      this.el.loading?.classList.add('done');
      window.setTimeout(() => {
        if (this.el.loading) this.el.loading.style.display = 'none';
      }, 1000);
    }, delay);
  }

  begin() {
    this._started = true;
    this.el.startScreen?.classList.add('is-gone');
    window.setTimeout(() => {
      if (this.el.startScreen) this.el.startScreen.style.display = 'none';
    }, 760);
    this.el.hud?.classList.remove('is-intro');
    this.el.hud?.classList.add('is-playing');
    this._showHintBarSoon();
    this.setMutedState(this.audio.muted);
    this.updateAchievementCount();
  }

  _showHintBarSoon() {
    if (!this.el.hintBar) return;
    this.el.hintBar.classList.remove('dismissed');
    window.setTimeout(() => {
      if (!window.matchMedia('(pointer: coarse)').matches) {
        this.el.hintBar.classList.remove('dismissed');
        window.setTimeout(() => this.el.hintBar.classList.add('dismissed'), 12000);
      }
    }, 500);
  }

  updateHUD(data) {
    const {
      speedKmh, cadence, bpm, fish, score, combo, autopilot, laneIndex,
      phase, quality, fishInfo, started = true,
    } = data;

    this._setText(this.el.speedValue, String(Math.round(speedKmh)));
    const speedRatio = Math.min(1, speedKmh / (RIDE.maxSpeed * 3.6));
    if (this.el.speedArc) {
      this.el.speedArc.style.strokeDashoffset = String(352 * (1 - speedRatio));
      this.el.speedArc.style.stroke = speedRatio > 0.72 ? '#e98d70' : speedRatio > 0.32 ? '#f1c287' : '#9bc9c0';
    }
    this._setText(this.el.cadenceValue, `${Math.round(cadence)} RPM`);
    if (this.el.cadenceFill) this.el.cadenceFill.style.width = `${Math.min(100, cadence / 120 * 100)}%`;
    this._setText(this.el.musicBpm, `${Math.round(bpm)} BPM`);
    this._setText(this.el.qualityLabel, `画质 · ${quality}`);
    this._setText(this.el.fishCount, String(fish));
    this._setText(this.el.scoreCount, formatNumber(score));

    if (combo >= 2) {
      this.el.comboBadge?.classList.add('visible');
      this._setText(this.el.comboValue, `×${combo}`);
    } else {
      this.el.comboBadge?.classList.remove('visible');
    }

    if (this.el.autoIndicator) {
      this.el.autoIndicator.classList.toggle('manual', !autopilot);
      this._setText(this.el.autoLabel, autopilot ? '自动驾驶' : '手动驾驶');
    }

    const name = phaseName(phase);
    this._setText(this.el.phaseLabel, name);
    this._setText(this.el.clockLabel, formatTimeOfDay(phase));
    if (this.el.sunDot) {
      const x = 16 + 188 * phase;
      const y = 61 - Math.sin(Math.PI * clamp(phase, 0, 1)) * 47;
      this.el.sunDot.setAttribute('cx', x.toFixed(2));
      this.el.sunDot.setAttribute('cy', y.toFixed(2));
      this.el.sunDot.setAttribute('fill', isNight(phase) ? '#dfe8ff' : '#f6d5a0');
    }

    if (this.el.laneMarker) {
      this.el.laneMarker.style.left = `${LANE_CENTERS[laneIndex] || 50}%`;
    }

    if (fishInfo) {
      this.el.radar?.classList.add('alert');
      this.el.fishMarker?.classList.add('visible');
      this.el.fishMarker?.classList.toggle('moonfish', fishInfo.type?.id === 'moon');
      this.el.fishMarker?.classList.toggle('goldfish', fishInfo.type?.id === 'golden' || fishInfo.type?.id === 'big');
      if (this.el.fishMarker) {
        this.el.fishMarker.style.left = `${LANE_CENTERS[fishInfo.laneIndex]}%`;
        this.el.fishMarker.style.top = `${8 + (1 - fishInfo.progress) * 12}px`;
      }
      const laneText = ['左', '中', '右'][fishInfo.laneIndex];
      this._setText(this.el.radarStatus, fishInfo.progress > 0.8 ? '即将掠过' : '鱼讯抵达');
      this._setText(this.el.fishHint, `${fishInfo.type?.name || '鱼'} · 游向${laneText}侧`);
      const t = fishInfo.timeToCatch;
      this._setText(this.el.fishDistance, t > 0.1 ? `${t.toFixed(1)} s` : '此刻');
    } else {
      this.el.radar?.classList.remove('alert');
      this.el.fishMarker?.classList.remove('visible');
      this._setText(this.el.radarStatus, started ? '巡游中' : '等待启程');
      this._setText(this.el.fishHint, '保持节奏，海面还安静');
      this._setText(this.el.fishDistance, '');
    }

    this._setText(this.el.achCount, `${this.achievements.unlocked.size}/14`);
    this.updateAchievementCount();
  }

  _setText(node, value) {
    if (!node) return;
    if (this.cache.get(node) === value) return;
    this.cache.set(node, value);
    node.textContent = value;
  }

  setCamera(mode, index, announce = true) {
    this._applyCamera(mode, index, announce);
  }

  _applyCamera(mode, index, announce) {
    if (!mode) return;
    this._setText(this.el.cameraNum, String(index + 1).padStart(2, '0'));
    this._setText(this.el.cameraName, mode.name);
    this._setText(this.el.cameraDesc, mode.desc);
    document.body.classList.toggle('cinematic', mode.id === 'cinema' && this._started);
    document.body.classList.toggle('pov-mode', mode.id === 'pov' && this._started);
    if (announce && this._started) {
      this.showToast({
        title: mode.name,
        desc: mode.desc,
        type: 'camera',
        icon: CAMERA_ICONS[mode.id] || CAMERA_ICONS.chase,
        duration: 2400,
        compact: true,
      });
    }
  }

  pulseCatch() {
    this.el.fishCount?.classList.remove('pulse');
    void this.el.fishCount?.offsetWidth;
    this.el.fishCount?.classList.add('pulse');
    window.setTimeout(() => this.el.fishCount?.classList.remove('pulse'), 380);
  }

  flash(type = 'normal') {
    if (!this.el.screenFlash) return;
    this.el.screenFlash.classList.remove('flash', 'flash-gold');
    void this.el.screenFlash.offsetWidth;
    this.el.screenFlash.classList.add(type === 'gold' ? 'flash-gold' : 'flash');
  }

  floatAt(position, camera, mainText, subText) {
    if (!position || !camera || !this.el.floatLayer) return;
    this._projected.copy(position).project(camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = (this._projected.x * 0.5 + 0.5) * w;
    const y = (-this._projected.y * 0.5 + 0.5) * h;
    if (x < 0 || x > w || y < 0 || y > h) return;
    const el = document.createElement('div');
    el.className = 'float-score';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.innerHTML = `${mainText}${subText ? `<small>${subText}</small>` : ''}`;
    this.el.floatLayer.appendChild(el);
    window.setTimeout(() => el.remove(), 1200);
  }

  showToast({ title, desc = '', icon = '', type = 'info', duration = 3600, compact = false }) {
    if (!this._started) return;
    while (this.lastToasts.length >= 3) {
      const old = this.lastToasts.shift();
      old?.remove();
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}${compact ? ' compact' : ''}`;
    toast.innerHTML = `
      <div class="toast-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${icon || '<circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="1.3"/>'}</svg></div>
      <div class="toast-content"><div class="toast-title">${title}</div>${desc ? `<div class="toast-desc">${desc}</div>` : ''}</div>
    `;
    this.el.toastStack?.appendChild(toast);
    this.lastToasts.push(toast);
    window.setTimeout(() => {
      if (!toast.isConnected) return;
      toast.classList.add('leaving');
      window.setTimeout(() => {
        toast.remove();
        this.lastToasts = this.lastToasts.filter((item) => item !== toast);
      }, 460);
    }, duration);
  }

  announceAchievement(def) {
    this.updateAchievementCount();
    this.showToast({
      title: `成就点亮 · ${def.name}`,
      desc: def.desc,
      type: 'achievement',
      icon: def.icon,
      duration: 5200,
    });
    this.flash('gold');
    if (this.openModalName === 'achievements') this.renderAchievements();
  }

  updateAchievementCount() {
    const completion = this.achievements.getCompletion();
    this._setText(this.el.achCount, `${completion.unlocked}/${completion.total}`);
    this._setText(this.el.achModalCount, String(completion.unlocked));
    if (this.el.achProgressFill) this.el.achProgressFill.style.width = `${completion.unlocked / completion.total * 100}%`;
  }

  _renderAchievementSummary() {
    this.updateAchievementCount();
  }

  openAchievements() {
    this.renderAchievements();
    this.openOverlay('achievements');
  }

  openHelp() {
    this.openOverlay('help');
  }

  openOverlay(name) {
    if (this.openModalName === name) return;
    this._hideAllOverlays();
    this.openModalName = name;
    const modal = name === 'achievements' ? this.el.achievementsModal : this.el.helpModal;
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    this.el.hud?.classList.add('is-paused');
    this.callbacks.onOverlayState?.(true, name);
  }

  closeOverlay() {
    if (!this.openModalName) return;
    const name = this.openModalName;
    this._hideAllOverlays();
    this.openModalName = null;
    this.el.hud?.classList.remove('is-paused');
    this.callbacks.onOverlayState?.(false, name);
  }

  _hideAllOverlays() {
    for (const modal of [this.el.helpModal, this.el.achievementsModal, this.el.pauseScreen]) {
      modal?.classList.remove('open');
      modal?.setAttribute('aria-hidden', 'true');
    }
  }

  showPause(stats) {
    this._hideAllOverlays();
    this.openModalName = 'pause';
    this.el.pauseScreen?.classList.add('open');
    this.el.pauseScreen?.setAttribute('aria-hidden', 'false');
    this.el.hud?.classList.add('is-paused');
    this._setText(this.el.pauseDistance, `${formatNumber(stats.distance)} m`);
    this._setText(this.el.pauseFish, String(stats.fish));
    this._setText(this.el.pauseScore, formatNumber(stats.score));
  }

  hidePause() {
    if (this.openModalName !== 'pause') return;
    this.el.pauseScreen?.classList.remove('open');
    this.el.pauseScreen?.setAttribute('aria-hidden', 'true');
    this.openModalName = null;
    this.el.hud?.classList.remove('is-paused');
  }

  renderAchievements() {
    if (!this.el.achievementGrid) return;
    const cards = this.achievements.getCards();
    this.el.achievementGrid.innerHTML = cards.map((card) => {
      const numeric = card.target > 1;
      const progressText = card.unlocked ? '已点亮' : numeric ? `${Math.floor(card.progress)} / ${card.target}` : '未抵达';
      const bar = numeric ? `<div class="achievement-progress"><i style="width:${card.ratio * 100}%"></i></div>` : '';
      return `
        <article class="achievement ${card.unlocked ? 'unlocked' : ''}">
          <div class="achievement-badge"><svg viewBox="0 0 24 24" aria-hidden="true">${card.icon}</svg></div>
          <div class="achievement-body">
            <div class="achievement-name">${card.name}<em>${card.en}</em></div>
            <div class="achievement-desc">${card.desc}</div>
            ${bar}
          </div>
          <div class="achievement-status">${progressText}</div>
        </article>
      `;
    }).join('');
    this.updateAchievementCount();
  }

  setPausedVisual(paused) {
    this.el.hud?.classList.toggle('is-paused', paused);
  }

  setMutedState(muted) {
    this.el.soundBtn?.classList.toggle('is-muted', muted);
  }

  _updateSoundIcon() {
    this.setMutedState(this.audio.muted);
  }

  toggleHud() {
    this._hudHidden = !this._hudHidden;
    document.body.classList.toggle('hide-hud', this._hudHidden);
    if (!this._hudHidden) {
      this.showToast({
        title: '仪表盘已归位',
        desc: '按 F 可以再次收起界面，只看海。',
        type: 'info',
        duration: 2500,
      });
    }
  }

  setQualityLabel(text) {
    this._setText(this.el.qualityLabel, `画质 · ${text}`);
  }

  isOverlayOpen() {
    return this.openModalName !== null;
  }

  getOverlayName() {
    return this.openModalName;
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
