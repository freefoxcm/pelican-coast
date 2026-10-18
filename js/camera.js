import * as THREE from 'three';
import { CAMERAS, ROAD } from './config.js';
import { clamp, damp, lerp, smoothstep } from './utils.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _m1 = new THREE.Matrix4();

function dampVec3(current, target, lambda, dt) {
  current.x = damp(current.x, target.x, lambda, dt);
  current.y = damp(current.y, target.y, lambda, dt);
  current.z = damp(current.z, target.z, lambda, dt);
  return current;
}

function makeBeakProp() {
  const group = new THREE.Group();
  const upperMat = new THREE.MeshStandardMaterial({
    color: '#e9a551',
    roughness: 0.4,
    metalness: 0.04,
    emissive: '#6d3316',
    emissiveIntensity: 0.32,
    side: THREE.DoubleSide,
  });
  const pouchMat = new THREE.MeshPhysicalMaterial({
    color: '#e38b4b',
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.25,
    emissive: '#5b2410',
    emissiveIntensity: 0.18,
    side: THREE.DoubleSide,
  });

  const upperGeo = new THREE.CylinderGeometry(0.11, 0.3, 1.05, 16, 1, false);
  upperGeo.rotateX(Math.PI / 2);
  const upper = new THREE.Mesh(upperGeo, upperMat);
  upper.scale.set(0.88, 0.26, 1);
  upper.position.set(0, -0.24, -0.73);
  group.add(upper);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.76), new THREE.MeshStandardMaterial({ color: '#c87837', roughness: 0.45 }));
  ridge.position.set(0, -0.163, -0.7);
  group.add(ridge);
  for (const side of [-1, 1]) {
    const nostril = new THREE.Mesh(
      new THREE.CircleGeometry(0.018, 9),
      new THREE.MeshBasicMaterial({ color: '#3b190d' })
    );
    nostril.rotation.x = -Math.PI / 2;
    nostril.position.set(side * 0.045, -0.164, -0.43);
    group.add(nostril);
  }
  const pouch = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10), pouchMat);
  pouch.scale.set(0.98, 0.35, 1.55);
  pouch.position.set(0, -0.34, -0.77);
  group.add(pouch);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: '#b75f2f', roughness: 0.5 }));
  tip.scale.set(1.2, 0.5, 1.5);
  tip.position.set(0, -0.27, -1.23);
  group.add(tip);
  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      child.frustumCulled = false;
    }
  });
  group.visible = false;
  return group;
}

export class CameraDirector {
  constructor(camera, rider, scene, options = {}) {
    this.camera = camera;
    this.rider = rider;
    this.scene = scene;
    this.modeIndex = 0;
    this.mode = CAMERAS[0];
    this.time = 0;
    this.modeTime = 0;
    this.initialized = false;
    this.shake = 0;
    this.cinematicCut = 0;
    this.shotIndex = -1;
    this.shotTime = 0;
    this.currentTarget = new THREE.Vector3();
    this.desiredPos = new THREE.Vector3();
    this.desiredTarget = new THREE.Vector3();
    this.smoothTarget = new THREE.Vector3();
    this.lastCameraPos = new THREE.Vector3();
    this.baseFov = camera.fov;
    this.aspect = camera.aspect;
    this.reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.onModeChange = options.onModeChange || null;
    this.povRig = makeBeakProp();
    camera.add(this.povRig);
    scene.add(camera);

    this.cinematicShots = [
      { name: 'front orbit', duration: 8.5 },
      { name: 'low side', duration: 6.8 },
      { name: 'sea crane', duration: 8.0 },
      { name: 'portrait', duration: 6.4 },
      { name: 'wide follow', duration: 9.0 },
    ];
    this.cinematicPose = {
      angle: 2.25,
      radius: 7.7,
      height: 3.2,
      targetHeight: 1.8,
      fov: 43,
    };
    this._setMode(0, true);
  }

  _setMode(index, silent = false) {
    this.modeIndex = (index + CAMERAS.length) % CAMERAS.length;
    this.mode = CAMERAS[this.modeIndex];
    this.modeTime = 0;
    this.initialized = false;
    this.shotIndex = -1;
    this.shotTime = 0;
    this.rider.setCameraMode(this.mode.id);
    this.povRig.visible = this.mode.id === 'pov';
    this.povRig.scale.setScalar(this.mode.id === 'pov' ? 0.8 : 1);
    this.camera.fov = this.mode.id === 'pov' ? 63 : 48;
    this.camera.near = 0.05;
    this.camera.updateProjectionMatrix();
    if (this.onModeChange && !silent) this.onModeChange(this.mode, this.modeIndex);
  }

  setMode(index) {
    if (index === this.modeIndex) return;
    this._setMode(index);
  }

  cycle() {
    this._setMode(this.modeIndex + 1);
    return this.mode;
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  updateIntro(dt, state) {
    this.time += dt;
    const riderPos = this.rider.root.position;
    const t = this.time;
    const jump = state.jumpY || 0;
    this.desiredPos.set(
      riderPos.x - 7.15 + Math.sin(t * 0.14) * 0.2,
      ROAD.y + 2.9 + Math.sin(t * 0.23) * 0.045,
      riderPos.z + 1.9 + Math.cos(t * 0.11) * 0.24
    );
    this.desiredTarget.set(
      riderPos.x - 1.62,
      ROAD.y + 2.08 + jump * 0.6,
      riderPos.z - 0.35
    );
    dampVec3(this.camera.position, this.desiredPos, this.initialized ? 1.25 : 100, dt);
    dampVec3(this.smoothTarget, this.desiredTarget, this.initialized ? 1.5 : 100, dt);
    this._lookAt(this.smoothTarget, dt, 1.5);
    this.camera.fov = damp(this.camera.fov, this._responsiveFov(38), 1.2, dt);
    this.povRig.visible = false;
    this.rider.setCameraMode('intro');
    this.initialized = true;
  }

  update(dt, state) {
    this.time += dt;
    this.modeTime += dt;
    this.shotTime += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.aspect = this.camera.aspect;
    const speed = state.speed || 0;
    const jumpY = state.jumpY || 0;
    const riderPos = this.rider.root.position;
    const cameraMode = this.mode.id;

    if (cameraMode === 'chase') this._updateChase(dt, speed, jumpY, riderPos, state);
    else if (cameraMode === 'cinema') this._updateCinema(dt, speed, jumpY, riderPos, state);
    else if (cameraMode === 'pov') this._updatePov(dt, state);
    else if (cameraMode === 'drone') this._updateDrone(dt, speed, jumpY, riderPos, state);
    else if (cameraMode === 'side') this._updateSide(dt, speed, jumpY, riderPos, state);

    this._applyShake(dt, speed, state);
  }

  _updateChase(dt, speed, jumpY, riderPos, state) {
    const speedNorm = clamp(speed / 13.6, 0, 1);
    const portrait = this.camera.aspect < 0.95;
    const laneOffset = portrait ? 0 : -1.55;
    const targetOffset = portrait ? 0 : 1.1;
    this.desiredPos.set(
      riderPos.x * (portrait ? 0.97 : 0.9) + laneOffset,
      ROAD.y + (portrait ? 4.35 : 4.15) + jumpY * 0.42 + Math.sin(this.time * 0.8) * 0.035,
      riderPos.z + (portrait ? 8.05 : 7.0) + speedNorm * 0.9
    );
    this.desiredTarget.set(
      riderPos.x * (portrait ? 0.97 : 0.85) + targetOffset,
      ROAD.y + (portrait ? 2.05 : 2.35) + jumpY * 0.72,
      riderPos.z - (portrait ? 2.2 : 1.7)
    );
    const lambda = this.initialized ? 3.6 : 100;
    dampVec3(this.camera.position, this.desiredPos, lambda, dt);
    dampVec3(this.smoothTarget, this.desiredTarget, this.initialized ? 4.3 : 100, dt);
    this._lookAt(this.smoothTarget, dt, 3.8);
    const fov = this._responsiveFov(portrait ? 44 : 45 + speedNorm * 7.5);
    this.camera.fov = damp(this.camera.fov, fov, 2.4, dt);
    this._applyRoll(state.laneVelocity * -0.002 + Math.sin(this.time * 0.7) * 0.0015);
    this.initialized = true;
  }

  _updateCinema(dt, speed, jumpY, riderPos, state) {
    const shotDuration = this.cinematicShots[Math.max(0, this.shotIndex)]?.duration || 8;
    if (this.shotIndex < 0 || this.shotTime > shotDuration) {
      this.shotIndex = (this.shotIndex + 1) % this.cinematicShots.length;
      this.shotTime = 0;
      this.cinematicCut = 1;
    } else {
      this.cinematicCut = Math.max(0, this.cinematicCut - dt * 2.8);
    }
    const justCut = this.cinematicCut > 0.92 || !this.initialized;
    const t = this.shotTime;
    const speedNorm = clamp(speed / 13.6, 0, 1);
    const baseY = ROAD.y;
    const q = this.shotIndex;
    if (q === 0) {
      // Front three-quarter orbit, the ocean turns into the backdrop.
      const angle = 2.15 + Math.sin(t * 0.17) * 0.2 + t * 0.018;
      this.desiredPos.set(
        riderPos.x + Math.sin(angle) * 7.9,
        baseY + 2.55 + Math.sin(t * 0.4) * 0.18,
        riderPos.z + Math.cos(angle) * 7.9
      );
      this.desiredTarget.set(riderPos.x, baseY + 2.1 + jumpY * 0.6, riderPos.z - 0.1);
      this._cinemaFov = 40;
    } else if (q === 1) {
      // Low tracking shot from the sea side.
      this.desiredPos.set(
        riderPos.x + 5.9 + Math.sin(t * 0.4) * 0.22,
        baseY + 1.65,
        riderPos.z + 1.7 - t * 0.05
      );
      this.desiredTarget.set(riderPos.x - 0.1, baseY + 2.05 + jumpY * 0.5, riderPos.z - 0.45);
      this._cinemaFov = 38;
    } else if (q === 2) {
      // A crane over the sea that reveals the ribbon of coast road.
      this.desiredPos.set(
        riderPos.x + 9.5 - t * 0.18,
        baseY + 6.1 + Math.sin(t * 0.24) * 0.8,
        riderPos.z + 9.2 + Math.sin(t * 0.15) * 1.2
      );
      this.desiredTarget.set(riderPos.x, baseY + 2.0, riderPos.z - 6.5);
      this._cinemaFov = 49;
    } else if (q === 3) {
      // Intimate front portrait: helmet, glasses, scarf, fish.
      this.desiredPos.set(
        riderPos.x - 1.6 + Math.sin(t * 0.2) * 0.35,
        baseY + 2.95 + Math.sin(t * 0.4) * 0.08,
        riderPos.z - 5.4 - Math.sin(t * 0.3) * 0.4
      );
      this.desiredTarget.set(riderPos.x + 0.05, baseY + 2.45 + jumpY * 0.5, riderPos.z - 0.3);
      this._cinemaFov = 37;
    } else {
      // Wide follow, showing the road and the weather ahead.
      this.desiredPos.set(
        riderPos.x + 2.0 + Math.sin(t * 0.16) * 0.5,
        baseY + 4.1,
        riderPos.z + 11.5 + speedNorm * 1.2
      );
      this.desiredTarget.set(riderPos.x * 0.7, baseY + 2.0, riderPos.z - 8.0);
      this._cinemaFov = 46;
    }
    if (justCut) {
      this.camera.position.copy(this.desiredPos);
      this.smoothTarget.copy(this.desiredTarget);
      this._lookAt(this.smoothTarget, 1, 100);
      this.camera.fov = this._responsiveFov(this._cinemaFov || 42);
      this.camera.updateProjectionMatrix();
    } else {
      dampVec3(this.camera.position, this.desiredPos, 2.6, dt);
      dampVec3(this.smoothTarget, this.desiredTarget, 2.8, dt);
      this._lookAt(this.smoothTarget, dt, 2.6);
      this.camera.fov = damp(this.camera.fov, this._responsiveFov(this._cinemaFov || 42), 1.8, dt);
    }
    this._applyRoll(Math.sin(t * 0.22 + q) * 0.004);
    this.initialized = true;

    // A gentle vignette-shake at the edit point, like a camera finding focus.
    if (this.cinematicCut > 0.9) {
      this.camera.position.x += Math.sin(this.time * 50) * 0.004 * this.cinematicCut;
      this.camera.position.y += Math.cos(this.time * 43) * 0.003 * this.cinematicCut;
    }
  }

  _updatePov(dt, state) {
    this.rider.getEyeWorldPosition(this.desiredPos);
    this.rider.getEyeWorldQuaternion(this.desiredQuat = this.desiredQuat || new THREE.Quaternion());
    const headBob = Math.sin((state.crankAngle || 0) * 2) * 0.007;
    this.desiredPos.y += headBob;
    this.camera.position.copy(this.desiredPos);
    // Blend orientation slightly so a glance at a fish feels organic.
    const targetQ = this.desiredQuat;
    if (!this._povSmoothQuat) this._povSmoothQuat = targetQ.clone();
    this._povSmoothQuat.slerp(targetQ, 1 - Math.exp(-dt * 12));
    this.camera.quaternion.copy(this._povSmoothQuat);
    // Look down the road and slightly towards the sea.
    this.camera.rotateX(-0.075);
    this.camera.rotateY(-0.02);
    this.camera.fov = damp(this.camera.fov, this._responsiveFov(63), 5, dt);
    this.povRig.position.set(0, -0.02 + Math.sin((state.crankAngle || 0) * 2) * 0.003, -0.16);
    this.initialized = true;
  }

  _updateDrone(dt, speed, jumpY, riderPos, state) {
    const angle = this.time * 0.045 + 0.7;
    this.desiredPos.set(
      riderPos.x + Math.sin(angle) * 8.5,
      ROAD.y + 10.5 + Math.sin(this.time * 0.22) * 0.4,
      riderPos.z + Math.cos(angle) * 7.2 + 3.0
    );
    this.desiredTarget.set(riderPos.x, ROAD.y + 1.7 + jumpY * 0.7, riderPos.z - 3.3);
    dampVec3(this.camera.position, this.desiredPos, this.initialized ? 1.6 : 100, dt);
    dampVec3(this.smoothTarget, this.desiredTarget, this.initialized ? 2.1 : 100, dt);
    this._lookAt(this.smoothTarget, dt, 2.2);
    this.camera.fov = damp(this.camera.fov, this._responsiveFov(47), 1.8, dt);
    this._applyRoll(Math.sin(this.time * 0.3) * 0.006);
    this.initialized = true;
  }

  _updateSide(dt, speed, jumpY, riderPos, state) {
    const speedNorm = clamp(speed / 13.6, 0, 1);
    this.desiredPos.set(
      riderPos.x - 7.1 + Math.sin(this.time * 0.7) * 0.12,
      ROAD.y + 2.55 + jumpY * 0.35,
      riderPos.z + 2.2 + speedNorm * 0.6
    );
    this.desiredTarget.set(riderPos.x + 0.1, ROAD.y + 1.95 + jumpY * 0.65, riderPos.z - 0.5);
    dampVec3(this.camera.position, this.desiredPos, this.initialized ? 3.2 : 100, dt);
    dampVec3(this.smoothTarget, this.desiredTarget, this.initialized ? 3.8 : 100, dt);
    this._lookAt(this.smoothTarget, dt, 3.2);
    this.camera.fov = damp(this.camera.fov, this._responsiveFov(41 + speedNorm * 2), 2, dt);
    this._applyRoll(Math.sin(this.time * 0.6) * 0.002);
    this.initialized = true;
  }

  _responsiveFov(base) {
    // Portrait screens need a little more vertical breathing room.
    const aspect = this.camera.aspect || 1;
    if (aspect < 1) return base + (1 - aspect) * 18;
    return base;
  }

  _lookAt(target, dt, lambda) {
    this.camera.up.set(0, 1, 0);
    _m1.lookAt(this.camera.position, target, this.camera.up);
    _q1.setFromRotationMatrix(_m1);
    if (!this._smoothQuat) this._smoothQuat = _q1.clone();
    this._smoothQuat.slerp(_q1, 1 - Math.exp(-lambda * dt));
    this.camera.quaternion.copy(this._smoothQuat);
  }

  _applyRoll(roll) {
    if (Math.abs(roll) < 1e-6) return;
    this.camera.rotateZ(roll);
  }

  _applyShake(dt, speed, state) {
    if (this.reduceMotion) this.shake *= 0.7;
    const speedNoise = clamp(speed / 13.6, 0, 1) * 0.0018;
    const s = this.shake * 0.012 + speedNoise;
    if (s > 0.00001) {
      this.camera.position.x += Math.sin(this.time * 58.3) * s;
      this.camera.position.y += Math.cos(this.time * 71.1) * s * 0.8;
      this.camera.rotateZ(Math.sin(this.time * 44.7) * s * 0.12);
    }
  }

  getMode() {
    return this.mode;
  }

  onResize() {
    this.aspect = this.camera.aspect;
  }
}
