import * as THREE from 'three';
import { clamp, seededRandom } from './utils.js';

function makeParticleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.26, 'rgba(255,255,255,.8)');
  g.addColorStop(0.58, 'rgba(255,255,255,.14)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeRingTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 80, 128, 128, 126);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.54, 'rgba(255,255,255,0)');
  g.addColorStop(0.68, 'rgba(255,255,255,.85)');
  g.addColorStop(0.78, 'rgba(255,255,255,.22)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const PARTICLE_VERTEX = `
  uniform float uScale;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(aSize * uScale / max(0.2, -mvPosition.z), 1.0, 42.0);
    vColor = aColor;
    vAlpha = aAlpha;
  }
`;

const PARTICLE_FRAGMENT = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float alpha = smoothstep(0.5, 0.04, d);
    float sparkle = smoothstep(0.5, 0.18, abs(p.x) * 2.8 + abs(p.y) * 0.55) * 0.18;
    alpha = min(1.0, alpha + sparkle);
    if (alpha * vAlpha < 0.003) discard;
    gl_FragColor = vec4(vColor, alpha * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

class ParticlePool {
  constructor(scene, count, blending) {
    this.count = count;
    this.cursor = 0;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(count), 1));
    geometry.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(count), 1));
    this.geometry = geometry;
    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
      uniforms: { uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending,
    });
    this.material.extensions = { derivatives: false };
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
    this.particles = Array.from({ length: count }, () => ({
      life: 0,
      maxLife: 1,
      vx: 0, vy: 0, vz: 0,
      size: 0.1,
      color: new THREE.Color('#ffffff'),
      gravity: 0,
      drag: 0.98,
      fade: 1,
    }));
    this.active = 0;
  }

  spawn({ x, y, z, vx = 0, vy = 0, vz = 0, size = 0.1, life = 1, color = '#ffffff', gravity = 0, drag = 0.98, fade = 1 }) {
    const idx = this.cursor;
    this.cursor = (this.cursor + 1) % this.count;
    const p = this.particles[idx];
    p.life = life;
    p.maxLife = life;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.size = size;
    p.color.set(color);
    p.gravity = gravity;
    p.drag = drag;
    p.fade = fade;
    const pos = this.geometry.getAttribute('position');
    pos.setXYZ(idx, x, y, z);
    const alpha = this.geometry.getAttribute('aAlpha');
    alpha.setX(idx, 1);
    const sizeAttr = this.geometry.getAttribute('aSize');
    sizeAttr.setX(idx, size);
    const colorAttr = this.geometry.getAttribute('aColor');
    colorAttr.setXYZ(idx, p.color.r, p.color.g, p.color.b);
    this.dirty = true;
  }

  update(dt, scale) {
    this.material.uniforms.uScale.value = scale;
    const pos = this.geometry.getAttribute('position');
    const alpha = this.geometry.getAttribute('aAlpha');
    const sizeAttr = this.geometry.getAttribute('aSize');
    const colorAttr = this.geometry.getAttribute('aColor');
    let any = false;
    for (let i = 0; i < this.count; i++) {
      const p = this.particles[i];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        alpha.setX(i, 0);
        any = true;
        continue;
      }
      const t = 1 - p.life / p.maxLife;
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.vz *= Math.pow(p.drag, dt * 60);
      const x = pos.getX(i) + p.vx * dt;
      const y = pos.getY(i) + p.vy * dt;
      const z = pos.getZ(i) + p.vz * dt;
      pos.setXYZ(i, x, y, z);
      alpha.setX(i, Math.pow(1 - t, p.fade));
      sizeAttr.setX(i, p.size * (1 + t * 0.6));
      colorAttr.setXYZ(i, p.color.r, p.color.g, p.color.b);
      any = true;
    }
    if (any) {
      pos.needsUpdate = true;
      alpha.needsUpdate = true;
      sizeAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
    }
  }
}

class RingPool {
  constructor(scene, count, texture) {
    this.scene = scene;
    this.items = [];
    for (let i = 0; i < count; i++) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color: '#ffe0a2',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      scene.add(sprite);
      this.items.push({ sprite, material, life: 0, maxLife: 1, startScale: 1, endScale: 3, baseOpacity: 0.8 });
    }
    this.cursor = 0;
  }

  spawn(position, color, startScale, endScale, life) {
    const item = this.items[this.cursor];
    this.cursor = (this.cursor + 1) % this.items.length;
    item.sprite.position.copy(position);
    item.material.color.set(color);
    item.material.opacity = 0.9;
    item.sprite.scale.setScalar(startScale);
    item.sprite.visible = true;
    item.life = life;
    item.maxLife = life;
    item.startScale = startScale;
    item.endScale = endScale;
    item.startOpacity = 0.9;
  }

  update(dt) {
    for (const item of this.items) {
      if (item.life <= 0) continue;
      item.life -= dt;
      if (item.life <= 0) {
        item.sprite.visible = false;
        continue;
      }
      const t = 1 - item.life / item.maxLife;
      const s = item.startScale + (item.endScale - item.startScale) * (1 - Math.pow(1 - t, 2));
      item.sprite.scale.setScalar(s);
      item.material.opacity = item.startOpacity * (1 - t);
    }
  }
}

export class Effects {
  constructor(scene, renderer, camera) {
    this.scene = scene;
    this.renderer = renderer;
    this.camera = camera;
    this.particleTexture = makeParticleTexture();
    this.ringTexture = makeRingTexture();
    this.sparkles = new ParticlePool(scene, 380, THREE.AdditiveBlending);
    this.dust = new ParticlePool(scene, 220, THREE.NormalBlending);
    this.rings = new RingPool(scene, 10, this.ringTexture);
    this.emitTimer = 0;
    this._scale = 600;
    this._rand = seededRandom(6110);
    this.updatePointScale();
  }

  updatePointScale() {
    const height = this.renderer.domElement.height || window.innerHeight;
    const fov = this.camera.fov * Math.PI / 180;
    this._scale = height / (2 * Math.max(0.1, Math.tan(fov * 0.5)));
  }

  catchBurst(position, color = '#ffe0a2', big = false) {
    const r = this._rand;
    const count = big ? 32 : 18;
    for (let i = 0; i < count; i++) {
      const a = r() * Math.PI * 2;
      const elev = (r() - 0.15) * Math.PI * 0.7;
      const speed = 0.6 + r() * (big ? 2.6 : 1.7);
      const c = color;
      this.sparkles.spawn({
        x: position.x + (r() - 0.5) * 0.3,
        y: position.y + (r() - 0.5) * 0.3,
        z: position.z + (r() - 0.5) * 0.3,
        vx: Math.cos(a) * Math.cos(elev) * speed,
        vy: Math.sin(elev) * speed + 0.7,
        vz: Math.sin(a) * Math.cos(elev) * speed,
        size: 0.035 + r() * (big ? 0.1 : 0.065),
        life: 0.45 + r() * 0.65,
        color: r() > 0.42 ? c : '#ffffff',
        gravity: -1.5,
        drag: 0.96,
        fade: 1.35,
      });
    }
    this.rings.spawn(position, color, 0.2, big ? 2.0 : 1.25, 0.42);
    if (big) {
      for (let i = 0; i < 10; i++) {
        this.sparkles.spawn({
          x: position.x,
          y: position.y,
          z: position.z,
          vx: (r() - 0.5) * 4,
          vy: 1.5 + r() * 1.6,
          vz: (r() - 0.5) * 4,
          size: 0.08 + r() * 0.1,
          life: 0.8 + r() * 0.4,
          color: '#e6c27d',
          gravity: -2.2,
          drag: 0.96,
          fade: 1.2,
        });
      }
    }
  }

  splash(position, color = '#d7f0e8') {
    const r = this._rand;
    for (let i = 0; i < 16; i++) {
      this.sparkles.spawn({
        x: position.x + (r() - 0.5) * 1.2,
        y: 0.25 + r() * 0.3,
        z: position.z + (r() - 0.5) * 1.2,
        vx: (r() - 0.5) * 1.1,
        vy: 0.6 + r() * 1.7,
        vz: (r() - 0.5) * 1.1,
        size: 0.06 + r() * 0.13,
        life: 0.5 + r() * 0.7,
        color,
        gravity: -2.4,
        drag: 0.98,
        fade: 1.2,
      });
    }
    this.rings.spawn(new THREE.Vector3(position.x, Math.max(0.2, position.y), position.z), '#d9f5ec', 0.25, 1.7, 0.55);
  }

  jumpDust(position, strength = 1) {
    const r = this._rand;
    for (let i = 0; i < 12 * strength; i++) {
      const a = r() * Math.PI * 2;
      this.dust.spawn({
        x: position.x + (r() - 0.5) * 0.7,
        y: position.y + 0.08,
        z: position.z + (r() - 0.5) * 0.7,
        vx: Math.cos(a) * (0.5 + r() * 1.4),
        vy: 0.2 + r() * 0.9,
        vz: Math.sin(a) * (0.5 + r() * 1.4),
        size: 0.16 + r() * 0.34,
        life: 0.55 + r() * 0.6,
        color: r() > 0.4 ? '#b9a98d' : '#e1d2b5',
        gravity: -1.6,
        drag: 0.94,
        fade: 1.1,
      });
    }
    this.rings.spawn(new THREE.Vector3(position.x, 4.05, position.z + 0.7), '#d5c3a1', 0.25, 1.6, 0.4);
  }

  landDust(position, strength = 1) {
    const r = this._rand;
    for (let i = 0; i < 15 * strength; i++) {
      const a = r() * Math.PI * 2;
      this.dust.spawn({
        x: position.x + (r() - 0.5) * 1.0,
        y: position.y + 0.06,
        z: position.z + (r() - 0.5) * 1.0,
        vx: Math.cos(a) * (0.8 + r() * 1.6),
        vy: 0.2 + r() * 0.7,
        vz: Math.sin(a) * (0.8 + r() * 1.6),
        size: 0.22 + r() * 0.4,
        life: 0.65 + r() * 0.65,
        color: r() > 0.5 ? '#c8b895' : '#ede0c9',
        gravity: -1.2,
        drag: 0.94,
        fade: 1.2,
      });
    }
    this.rings.spawn(new THREE.Vector3(position.x, position.y + 0.05, position.z + 0.7), '#d8c6a8', 0.32, 2.1, 0.5);
  }

  wheelSpray(position, speed) {
    const r = this._rand;
    const side = r() > 0.5 ? 1 : -1;
    this.dust.spawn({
      x: position.x + (r() - 0.5) * 0.3,
      y: position.y + 0.06 + r() * 0.14,
      z: position.z + 0.68 + r() * 0.2,
      vx: side * (0.08 + r() * 0.35) + (r() - 0.5) * 0.2,
      vy: 0.16 + r() * 0.3,
      vz: 2.0 + r() * 2.2,
      size: 0.035 + r() * 0.08,
      life: 0.22 + r() * 0.34,
      color: r() > 0.3 ? '#9f927e' : '#cbbda6',
      gravity: -1.8,
      drag: 0.93,
      fade: 0.9,
    });
  }

  celebrate(position) {
    const r = this._rand;
    for (let i = 0; i < 18; i++) {
      const a = r() * Math.PI * 2;
      const speed = 1.0 + r() * 2.4;
      this.sparkles.spawn({
        x: position.x + (r() - 0.5) * 0.8,
        y: position.y + 0.9 + r() * 0.5,
        z: position.z + (r() - 0.5) * 0.5,
        vx: Math.cos(a) * speed,
        vy: 0.8 + r() * 1.9,
        vz: Math.sin(a) * speed * 0.5,
        size: 0.035 + r() * 0.07,
        life: 0.6 + r() * 0.6,
        color: r() > 0.5 ? '#f7d093' : r() > 0.3 ? '#e98d70' : '#a9e6df',
        gravity: -2.4,
        drag: 0.97,
        fade: 1.35,
      });
    }
  }

  update(dt, state) {
    this.updatePointScale();
    this.sparkles.update(dt, this._scale);
    this.dust.update(dt, this._scale);
    this.rings.update(dt);

    if (state && state.speed > 3.2 && state.grounded && !state.paused) {
      this.emitTimer -= dt;
      if (this.emitTimer <= 0) {
        const interval = clamp(0.27 - state.speed * 0.008, 0.12, 0.27);
        this.emitTimer = interval;
        this.wheelSpray(state.wheelPosition, state.speed);
      }
    } else {
      this.emitTimer = 0;
    }
  }
}
