import * as THREE from 'three';
import { FISH_TYPES, ROAD } from './config.js';
import { clamp, easeOutCubic, isNight, lerp, seededRandom, smoothstep, TAU } from './utils.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 1, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,248,220,.8)');
  g.addColorStop(0.38, 'rgba(255,210,140,.2)');
  g.addColorStop(1, 'rgba(255,190,110,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFishMaterials(type) {
  const body = new THREE.MeshPhysicalMaterial({
    color: type.body,
    roughness: 0.22,
    metalness: 0.62,
    clearcoat: 0.72,
    clearcoatRoughness: 0.18,
    iridescence: type.id === 'moon' ? 0.85 : 0.35,
    iridescenceIOR: 1.31,
    iridescenceThicknessRange: [120, 380],
    emissive: type.id === 'moon' ? '#317a8d' : '#061014',
    emissiveIntensity: type.id === 'moon' ? 0.75 : 0.1,
    flatShading: false,
  });
  const belly = new THREE.MeshStandardMaterial({
    color: type.belly,
    roughness: 0.3,
    metalness: 0.22,
    emissive: type.id === 'moon' ? '#1b4c57' : '#03080c',
    emissiveIntensity: type.id === 'moon' ? 0.35 : 0.04,
  });
  const fin = new THREE.MeshStandardMaterial({
    color: type.fin,
    roughness: 0.45,
    metalness: 0.2,
    transparent: true,
    opacity: 0.88,
    side: THREE.DoubleSide,
    emissive: type.id === 'moon' ? '#286d7b' : '#000000',
    emissiveIntensity: type.id === 'moon' ? 0.4 : 0,
  });
  const tailFin = fin.clone();
  tailFin.opacity = 0.8;
  const eye = new THREE.MeshBasicMaterial({ color: '#0b1215' });
  const eyeGlint = new THREE.MeshBasicMaterial({ color: '#f7f2df' });
  return { body, belly, fin, tailFin, eye, eyeGlint };
}

function makeTailGeometry() {
  const positions = [
    0, 0, 0,
    0, 0.28, 0.42,
    0, 0, 0.27,
    0, 0, 0,
    0, 0, 0.27,
    0, -0.28, 0.42,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 2, 3, 4, 5]);
  geo.computeVertexNormals();
  return geo;
}

function makeFinGeometry(kind = 'dorsal') {
  if (kind === 'dorsal') {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, -0.2,
      0, 0.26, 0.15,
      0, 0, 0.2,
    ], 3));
    geo.computeVertexNormals();
    return geo;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0, 0,
    0.24, -0.03, 0.14,
    0.04, 0, 0.25,
  ], 3));
  geo.computeVertexNormals();
  return geo;
}

function makeRingGeometry() {
  return new THREE.RingGeometry(0.74, 1.0, 40, 1);
}

export class FishManager {
  constructor(scene, rider, callbacks = {}) {
    this.scene = scene;
    this.rider = rider;
    this.onCatch = callbacks.onCatch || (() => {});
    this.onMiss = callbacks.onMiss || (() => {});
    this.onSpawn = callbacks.onSpawn || (() => {});
    this.clock = 0;
    this.spawnTimer = 1.8;
    this.pool = [];
    this.active = [];
    this.catchCount = 0;
    this.totalSpawned = 0;
    this.glowTexture = makeGlowTexture();
    this.materials = {};
    for (const [id, type] of Object.entries(FISH_TYPES)) this.materials[id] = makeFishMaterials(type);
    this.tailGeo = makeTailGeometry();
    this.dorsalGeo = makeFinGeometry('dorsal');
    this.pectoralGeo = makeFinGeometry('pectoral');
    this.bodyGeo = new THREE.SphereGeometry(0.34, 20, 14);
    this.eyeGeo = new THREE.SphereGeometry(0.032, 7, 5);
    this.ringGeo = makeRingGeometry();
    this._createPool(7);
  }

  _createPool(count) {
    for (let i = 0; i < count; i++) {
      const group = new THREE.Group();
      group.visible = false;
      const body = new THREE.Mesh(this.bodyGeo, this.materials.silver.body);
      body.scale.set(0.5, 0.74, 1.45);
      body.castShadow = true;
      group.add(body);
      const belly = new THREE.Mesh(this.bodyGeo, this.materials.silver.belly);
      belly.scale.set(0.38, 0.48, 1.28);
      belly.position.set(0, -0.13, -0.02);
      group.add(belly);
      const tailGroup = new THREE.Group();
      tailGroup.position.z = 0.46;
      const tailTop = new THREE.Mesh(this.tailGeo, this.materials.silver.tailFin);
      const tailBottom = tailTop.clone();
      tailBottom.rotation.x = Math.PI;
      tailGroup.add(tailTop);
      tailGroup.add(tailBottom);
      group.add(tailGroup);
      const dorsal = new THREE.Mesh(this.dorsalGeo, this.materials.silver.fin);
      dorsal.position.set(0, 0.15, -0.03);
      group.add(dorsal);
      const pectoralL = new THREE.Mesh(this.pectoralGeo, this.materials.silver.fin);
      pectoralL.position.set(-0.16, -0.02, -0.08);
      pectoralL.rotation.z = -Math.PI / 2;
      group.add(pectoralL);
      const pectoralR = new THREE.Mesh(this.pectoralGeo, this.materials.silver.fin);
      pectoralR.position.set(0.16, -0.02, -0.08);
      pectoralR.scale.x = -1;
      pectoralR.rotation.z = -Math.PI / 2;
      group.add(pectoralR);
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(this.eyeGeo, this.materials.silver.eye);
        eye.position.set(side * 0.15, 0.09, -0.32);
        group.add(eye);
        const glint = new THREE.Mesh(new THREE.SphereGeometry(0.01, 5, 4), this.materials.silver.eyeGlint);
        glint.position.set(side * 0.17, 0.12, -0.35);
        group.add(glint);
      }
      const glowMat = new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: '#b9f6ea',
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Sprite(glowMat);
      glow.scale.set(1.8, 1.8, 1);
      group.add(glow);
      this.scene.add(group);

      const ringMat = new THREE.MeshBasicMaterial({
        color: '#f4cf8c',
        transparent: true,
        opacity: 0.0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(this.ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = ROAD.y + 0.03;
      this.scene.add(ring);

      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
      const trailMat = new THREE.LineBasicMaterial({
        color: '#b9f6ea',
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      });
      const trail = new THREE.Line(trailGeo, trailMat);
      trail.frustumCulled = false;
      trail.visible = false;
      this.scene.add(trail);

      this.pool.push({
        group,
        body,
        belly,
        tailGroup,
        dorsal,
        pectoralL,
        pectoralR,
        glow,
        glowMat,
        ring,
        ringMat,
        trail,
        trailGeo,
        trailMat,
        trailHistory: Array.from({ length: 12 }, () => new THREE.Vector3()),
        active: false,
        type: FISH_TYPES.silver,
        laneIndex: 1,
        targetX: 0,
        p: 0,
        duration: 3,
        startX: 34,
        phase: 0,
        resolved: false,
        caught: false,
        escaped: false,
        catchT: 0,
        catchStart: new THREE.Vector3(),
        catchTarget: new THREE.Vector3(),
        splashTimer: 0,
      });
    }
  }

  _assignType(fish, typeId) {
    const type = FISH_TYPES[typeId];
    const mats = this.materials[typeId];
    fish.type = type;
    fish.body.material = mats.body;
    fish.belly.material = mats.belly;
    fish.tailGroup.children[0].material = mats.tailFin;
    fish.tailGroup.children[1].material = mats.tailFin;
    fish.dorsal.material = mats.fin;
    fish.pectoralL.material = mats.fin;
    fish.pectoralR.material = mats.fin;
    for (const child of fish.group.children) {
      if (child.material === this.materials.silver.eye || child.material === this.materials.silver.eyeGlint) {
        // The eye meshes are found by geometry below; they share the silver
        // materials by design, and their look is fine for every fish.
      }
    }
    fish.glowMat.color.set(type.glow);
    fish.glowMat.opacity = type.id === 'moon' ? 0.9 : 0.62;
    fish.ringMat.color.set(type.glow);
    fish.trailMat.color.set(type.glow);
    fish.trailMat.opacity = type.id === 'moon' ? 0.9 : 0.65;
    fish.group.scale.setScalar(type.scale);
  }

  _chooseType(phase) {
    const night = isNight(phase);
    const rand = Math.random();
    if (this.totalSpawned > 0 && this.totalSpawned % 17 === 0) return FISH_TYPES.big;
    if (night && rand < 0.23) return FISH_TYPES.moon;
    if (rand < 0.19) return FISH_TYPES.golden;
    if (rand < 0.24) return FISH_TYPES.big;
    return FISH_TYPES.silver;
  }

  _spawn(incomingType = null) {
    const free = this.pool.find((fish) => !fish.active);
    if (!free) return;
    const phase = this.phase || 0;
    const type = incomingType || this._chooseType(phase);
    this._assignType(free, type.id);
    free.active = true;
    free.group.visible = true;
    free.group.scale.setScalar(type.scale);
    free.resolved = false;
    free.caught = false;
    free.escaped = false;
    free.catchT = 0;
    free.p = 0;
    free.phase = Math.random() * TAU;
    free.laneIndex = this._chooseLane();
    free.targetX = ROAD.laneX[free.laneIndex];
    free.startX = 34 + Math.random() * 24;
    free.duration = (3.15 + Math.random() * 0.4) / type.speed;
    // Start on a point of the arc so the first frame is already above the sea.
    free.p = 0.015;
    free.ring.visible = true;
    free.ring.position.x = free.targetX;
    free.ring.position.z = -6.8;
    free.ringMat.opacity = 0;
    free.tailGroup.rotation.y = 0;
    this._setFishPosition(free, free.p);
    for (const p of free.trailHistory) p.copy(free.group.position);
    free.trail.visible = true;
    free.trailMat.opacity = type.id === 'moon' ? 0.9 : 0.65;
    this.active.push(free);
    this.totalSpawned++;
    this.spawnTimer = 2.65 + Math.random() * 1.75;
    this.onSpawn({
      type,
      laneIndex: free.laneIndex,
      position: free.group.position.clone(),
      startX: free.startX,
    });
  }

  _chooseLane() {
    const lanes = [0, 1, 2];
    const recent = this.active.filter((fish) => !fish.resolved).map((fish) => fish.laneIndex);
    let options = lanes.filter((lane) => !recent.includes(lane));
    if (options.length === 0) options = lanes;
    // Weight the centre lane slightly less, so the road feels used.
    const rand = Math.random();
    if (options.includes(1) && options.length > 1 && rand < 0.3) options = options.filter((lane) => lane !== 1);
    return options[Math.floor(Math.random() * options.length)];
  }

  _trajectory(fish, p, out) {
    const laneProgress = clamp(p / 0.73, 0, 1);
    const xEase = easeOutCubic(laneProgress);
    const overshoot = Math.max(0, p - 0.73) * -5.4;
    const x = lerp(fish.startX, fish.targetX, xEase) + overshoot;
    const arcP = clamp(p / 0.96, 0, 1);
    const y = 0.16 + Math.sin(arcP * Math.PI) * (12.7 + fish.type.scale * 0.7);
    const z = -42 + 56 * Math.pow(clamp(p, 0, 1.08), 2.2);
    out.set(x, y, z);
    return out;
  }

  _setFishPosition(fish, p) {
    this._trajectory(fish, p, fish.group.position);
    this._trajectory(fish, Math.min(p + 0.008, 1.08), _v1);
    fish.group.lookAt(_v1);
    fish.group.rotation.z += Math.sin(this.clock * 7 + fish.phase) * 0.16;
    fish.tailGroup.rotation.y = Math.sin(this.clock * 16 + fish.phase) * 0.55;
    fish.pectoralL.rotation.x = Math.sin(this.clock * 12 + fish.phase) * 0.25;
    fish.pectoralR.rotation.x = Math.sin(this.clock * 12 + fish.phase + 1.3) * 0.25;
    fish.glow.scale.setScalar(1.7 + Math.sin(this.clock * 5 + fish.phase) * 0.28);
  }

  _updateTrail(fish) {
    if (!fish.trail.visible) return;
    const history = fish.trailHistory;
    for (let i = history.length - 1; i > 0; i--) history[i].copy(history[i - 1]);
    history[0].copy(fish.group.position);
    const attr = fish.trailGeo.getAttribute('position');
    for (let i = 0; i < history.length; i++) {
      attr.setXYZ(i, history[i].x, history[i].y + 0.03, history[i].z);
    }
    attr.needsUpdate = true;
    fish.trailGeo.computeBoundingSphere();
  }

  update(dt, state = {}) {
    this.clock += dt;
    this.phase = state.phase || this.phase || 0;
    this.spawnTimer -= dt;
    if (state.running !== false && this.spawnTimer <= 0 && this.active.filter((fish) => !fish.resolved).length < 3) {
      this._spawn();
    }

    const riderX = this.rider.root.position.x;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const fish = this.active[i];
      if (!fish.active) {
        this.active.splice(i, 1);
        continue;
      }

      if (fish.caught) {
        fish.catchT += dt;
        const t = clamp(fish.catchT / 0.36, 0, 1);
        const e = easeOutCubic(t);
        fish.catchStart.lerp(fish.catchTarget, dt * 8);
        fish.group.position.lerpVectors(fish.catchStart, fish.catchTarget, e);
        fish.group.position.y += Math.sin(t * Math.PI) * 1.4;
        fish.group.scale.multiplyScalar(0.95);
        fish.tailGroup.rotation.y = Math.sin(t * 30) * 0.8;
        fish.glowMat.opacity = (1 - t) * 0.9;
        if (t >= 1) {
          fish.active = false;
          fish.group.visible = false;
          fish.ring.visible = false;
          fish.trail.visible = false;
          fish.glowMat.opacity = 0;
          this.active.splice(i, 1);
        }
        continue;
      }

      fish.p += dt / fish.duration;
      this._setFishPosition(fish, fish.p);
      this._updateTrail(fish);

      if (fish.ring.visible) {
        const pulse = 0.75 + Math.sin(this.clock * 4.8 + fish.phase) * 0.18;
        fish.ringMat.opacity = smoothstep(0.02, 0.16, fish.p) * (1 - smoothstep(0.76, 0.85, fish.p)) * 0.58 * pulse;
        fish.ring.scale.setScalar(1.0 + Math.sin(this.clock * 3.2 + fish.phase) * 0.12);
      }

      if (!fish.resolved && fish.p >= 0.805) {
        fish.resolved = true;
        fish.ring.visible = false;
        const laneDist = Math.abs(riderX - fish.targetX);
        if (laneDist <= 2.25) {
          fish.caught = true;
          fish.catchT = 0;
          fish.catchStart.copy(fish.group.position);
          this.rider.getHeadWorldPosition(fish.catchTarget);
          fish.catchTarget.y += 0.12;
          fish.catchTarget.z -= 0.45;
          fish.ringMat.opacity = 0;
          fish.trail.visible = false;
          this.catchCount++;
          this.onCatch({
            type: fish.type,
            basePoints: fish.type.points,
            laneIndex: fish.laneIndex,
            position: fish.group.position.clone(),
            airborne: (state.jumpY || 0) > 0.35,
            autopilot: !!state.autopilot,
            laneDistance: laneDist,
            catchTime: this.clock,
          });
          this.rider.triggerCatch(fish.type);
          continue;
        } else {
          fish.escaped = true;
          fish.ringMat.opacity = 0;
          fish.trail.visible = false;
          this.onMiss({
            type: fish.type,
            laneIndex: fish.laneIndex,
            position: fish.group.position.clone(),
            laneDistance: laneDist,
            laneDelta: fish.targetX - riderX,
          });
        }
      }

      if (fish.escaped) {
        fish.group.scale.multiplyScalar(0.996);
        fish.glowMat.opacity = Math.max(0, fish.glowMat.opacity - dt * 0.7);
        if (fish.p > 1.03) {
          fish.active = false;
          fish.group.visible = false;
          fish.ring.visible = false;
          fish.trail.visible = false;
          fish.ringMat.opacity = 0;
          this.active.splice(i, 1);
        }
      } else if (fish.p > 1.12) {
        fish.active = false;
        fish.group.visible = false;
        fish.ring.visible = false;
        fish.trail.visible = false;
        this.active.splice(i, 1);
      }
    }
  }

  getIncomingInfo() {
    let best = null;
    let bestP = -Infinity;
    for (const fish of this.active) {
      if (!fish.active || fish.resolved || fish.caught || fish.escaped) continue;
      if (fish.p > bestP) {
        bestP = fish.p;
        best = fish;
      }
    }
    if (!best) return null;
    return {
      laneIndex: best.laneIndex,
      targetX: best.targetX,
      progress: clamp(best.p / 0.805, 0, 1),
      type: best.type,
      timeToCatch: Math.max(0, (0.805 - best.p) * best.duration),
      position: best.group.position,
    };
  }

  getAutopilotLane() {
    const info = this.getIncomingInfo();
    if (!info) return 1;
    return info.laneIndex;
  }

  getLookYaw(riderX) {
    const info = this.getIncomingInfo();
    if (!info) return 0;
    const dx = info.targetX - riderX;
    return clamp(-dx * 0.06, -0.33, 0.33);
  }

  reset() {
    for (const fish of this.active) {
      fish.active = false;
      fish.group.visible = false;
      fish.ring.visible = false;
      fish.trail.visible = false;
      fish.ringMat.opacity = 0;
    }
    this.active.length = 0;
    this.spawnTimer = 1.5;
  }
}
