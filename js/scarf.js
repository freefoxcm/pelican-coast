import * as THREE from 'three';
import { clamp, damp, lerp, makeValueNoise, seededRandom } from './utils.js';

function createScarfTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const rand = seededRandom(48);

  const grad = ctx.createLinearGradient(0, 0, 256, 512);
  grad.addColorStop(0, '#bb3039');
  grad.addColorStop(0.42, '#a92330');
  grad.addColorStop(0.8, '#941d2b');
  grad.addColorStop(1, '#b02d35');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 512);

  // Woven slub texture.
  for (let i = 0; i < 2600; i++) {
    const x = rand() * 256;
    const y = rand() * 512;
    const len = 3 + rand() * 18;
    ctx.strokeStyle = rand() > 0.55 ? `rgba(255,196,164,${0.025 + rand() * 0.055})` : `rgba(75,7,17,${0.04 + rand() * 0.06})`;
    ctx.lineWidth = rand() > 0.8 ? 1.3 : 0.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y + (rand() - 0.5) * 2);
    ctx.stroke();
  }

  // Fine shadow folds.
  for (let i = 0; i < 8; i++) {
    const x = (i / 8) * 256 + rand() * 12;
    const shade = ctx.createLinearGradient(x - 14, 0, x + 18, 0);
    shade.addColorStop(0, 'rgba(70,4,14,0)');
    shade.addColorStop(0.5, `rgba(70,4,14,${0.09 + rand() * 0.05})`);
    shade.addColorStop(1, 'rgba(70,4,14,0)');
    ctx.fillStyle = shade;
    ctx.fillRect(x - 16, 0, 38, 512);
  }

  // Cream band and stitch marks near the loose end.
  ctx.fillStyle = 'rgba(246,232,205,0.9)';
  ctx.fillRect(0, 40, 256, 10);
  ctx.fillRect(0, 56, 256, 2);
  ctx.fillStyle = 'rgba(246,232,205,0.72)';
  for (let i = 0; i < 11; i++) {
    ctx.fillRect(10 + i * 24, 452, 8, 3);
  }
  ctx.fillStyle = 'rgba(255,224,193,0.11)';
  ctx.fillRect(0, 0, 23, 512);
  ctx.fillStyle = 'rgba(58,0,9,0.11)';
  ctx.fillRect(233, 0, 23, 512);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  texture.needsUpdate = true;
  return texture;
}

class ScarfTail {
  constructor(material, config) {
    this.config = config;
    this.rows = config.rows;
    this.cols = config.cols;
    this.anchor = new THREE.Vector3().fromArray(config.anchor);
    this.width = config.width;
    this.length = config.length;
    this.phase = config.phase;
    this.pinned = new Uint8Array(this.rows * this.cols);
    this.points = [];
    this.prev = [];
    this.links = [];
    this.initial = [];
    this.tmp = new THREE.Vector3();
    this.normal = new THREE.Vector3();

    const spacing = this.length / (this.rows - 1);
    for (let i = 0; i < this.rows; i++) {
      const rowT = i / (this.rows - 1);
      const twist = Math.pow(rowT, 1.15) * 1.08;
      const taper = lerp(1, 0.7, rowT);
      for (let j = 0; j < this.cols; j++) {
        const u = j / (this.cols - 1);
        const across = (u - 0.5) * this.width * taper;
        const x = this.anchor.x + Math.cos(twist) * across + Math.sin(u * Math.PI) * 0.012;
        const y = this.anchor.y - i * spacing * 0.1 + Math.sin(twist) * across + Math.sin(u * Math.PI) * 0.012;
        const z = this.anchor.z + i * spacing * 0.99;
        this.points.push(new THREE.Vector3(x, y, z));
        this.prev.push(new THREE.Vector3(x, y, z));
        this.initial.push(new THREE.Vector3(x, y, z));
        if (i === 0) this.pinned[i * this.cols + j] = 1;
      }
    }

    // Structural, shear and bending constraints.
    const addLink = (a, b, stiffness) => {
      const pa = this.points[a];
      const pb = this.points[b];
      this.links.push({ a, b, rest: pa.distanceTo(pb), stiffness });
    };
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const idx = i * this.cols + j;
        if (j < this.cols - 1) addLink(idx, idx + 1, 1.0);
        if (i < this.rows - 1) addLink(idx, idx + this.cols, 0.92);
        if (i < this.rows - 1 && j < this.cols - 1) addLink(idx, idx + this.cols + 1, 0.46);
        if (i < this.rows - 1 && j > 0) addLink(idx, idx + this.cols - 1, 0.46);
        if (i < this.rows - 2) addLink(idx, idx + this.cols * 2, 0.17);
      }
    }

    this.geometry = new THREE.BufferGeometry();
    const vertexCount = this.rows * this.cols;
    const positions = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = [];
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        const idx = i * this.cols + j;
        const p = this.points[idx];
        positions[idx * 3] = p.x;
        positions[idx * 3 + 1] = p.y;
        positions[idx * 3 + 2] = p.z;
        uvs[idx * 2] = j / (this.cols - 1);
        uvs[idx * 2 + 1] = 1 - i / (this.rows - 1);
        if (i < this.rows - 1 && j < this.cols - 1) {
          const a = idx;
          const b = idx + this.cols;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    this.geometry.setIndex(indices);
    this.geometry.computeVertexNormals();
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.rotation.z = config.flip ? -0.015 : 0.015;

    // Little cream fringe threads at the free end.
    const fringeGeo = new THREE.BufferGeometry();
    fringeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.cols * 2 * 3), 3));
    this.fringe = new THREE.LineSegments(
      fringeGeo,
      new THREE.LineBasicMaterial({ color: 0xf1d7b7, transparent: true, opacity: 0.65 })
    );
    this.fringe.frustumCulled = false;
    this.mesh.add(this.fringe);
    this.fringe.position.set(0, 0, 0);
  }

  step(dt, context, iteration) {
    const { speed, time, turnVel, airborne, windBoost } = context;
    const points = this.points;
    const prev = this.prev;
    const total = points.length;
    const airFactor = airborne ? 1.5 : 1.0;
    const windZ = (7.2 + speed * 2.65 + windBoost * 3.6) * airFactor;
    const windY = (1.35 + speed * 0.2 + Math.sin(time * 3.3 + this.phase) * 0.7) * airFactor;
    const windX = Math.sin(time * 2.1 + this.phase * 2.6) * (0.9 + speed * 0.09) + Math.cos(time * 3.7 + this.anchor.y) * 0.35;
    const gravity = -10.4;
    const drag = speed * 0.35;

    for (let i = 0; i < total; i++) {
      if (this.pinned[i]) {
        const row = Math.floor(i / this.cols);
        const col = i % this.cols;
        const u = col / (this.cols - 1);
        const anchorSway = 0.012;
        const targetX = this.anchor.x + (u - 0.5) * this.width + Math.sin(time * 2.4 + this.phase) * anchorSway;
        const targetY = this.anchor.y + Math.sin(time * 2.9 + this.phase) * 0.008;
        const targetZ = this.anchor.z + Math.cos(time * 2.7 + this.phase) * 0.006;
        points[i].set(targetX, targetY, targetZ);
        prev[i].copy(points[i]);
        continue;
      }
      const p = points[i];
      const pv = prev[i];
      const vx = (p.x - pv.x) * 0.986;
      const vy = (p.y - pv.y) * 0.986;
      const vz = (p.z - pv.z) * 0.986;

      const rowFactor = Math.min(1, (i / this.cols) / (this.rows - 1) * 1.4);
      const flutter = Math.sin(time * 8.2 + i * 0.95 + this.phase) * (0.45 + speed * 0.17) * (0.35 + rowFactor);
      const lateral = Math.sin(time * 5.3 + i * 1.2 + this.phase * 1.9) * (0.25 + speed * 0.11);
      const ax = windX * (0.45 + rowFactor) + flutter + lateral - turnVel * (0.9 + rowFactor * 0.5);
      const ay = gravity + windY * (0.36 + rowFactor * 0.55) + Math.cos(time * 7.1 + i * 0.8) * 0.45 * rowFactor;
      const az = windZ * (0.35 + rowFactor * 0.72) - drag * rowFactor;
      const turb = windZ * 0.0024;

      pv.set(p.x, p.y, p.z);
      p.x += vx + ax * dt * dt;
      p.y += vy + ay * dt * dt;
      p.z += vz + az * dt * dt;

      // Keep the ribbon above the pelican's back. An ellipsoid is much
      // kinder to cloth than a pile of collision spheres.
      this._collideEllipsoid(p, 0, 2.02, 0.12, 0.48, 0.54, 0.46);
      this._collide(p, 0, 2.68, -0.32, 0.25);
      p.y = Math.max(p.y, 0.72);
      if (Math.abs(p.x) > 2.4) p.x = Math.sign(p.x) * 2.4;
    }

    // Position constraints — solving a few times makes the cloth read as fabric.
    const solveIters = iteration ? 3 : 4;
    for (let iter = 0; iter < solveIters; iter++) {
      for (const link of this.links) {
        const a = points[link.a];
        const b = points[link.b];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dz = b.z - a.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-5;
        const diff = (dist - link.rest) / dist * link.stiffness;
        const pinnedA = this.pinned[link.a];
        const pinnedB = this.pinned[link.b];
        if (pinnedA && pinnedB) continue;
        if (pinnedA) {
          b.x -= dx * diff;
          b.y -= dy * diff;
          b.z -= dz * diff;
        } else if (pinnedB) {
          a.x += dx * diff;
          a.y += dy * diff;
          a.z += dz * diff;
        } else {
          const half = diff * 0.5;
          a.x += dx * half;
          a.y += dy * half;
          a.z += dz * half;
          b.x -= dx * half;
          b.y -= dy * half;
          b.z -= dz * half;
        }
      }
    }
  }

  _collide(p, cx, cy, cz, radius) {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dz = p.z - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < radius * radius && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = (radius - d) / d;
      p.x += dx * push;
      p.y += dy * push;
      p.z += dz * push;
    }
  }

  _collideEllipsoid(p, cx, cy, cz, rx, ry, rz) {
    const nx = (p.x - cx) / rx;
    const ny = (p.y - cy) / ry;
    const nz = (p.z - cz) / rz;
    const d2 = nx * nx + ny * ny + nz * nz;
    if (d2 < 1 && d2 > 1e-8) {
      const d = Math.sqrt(d2);
      const push = (1 - d) / d;
      p.x += nx * rx * push;
      p.y += ny * ry * push;
      p.z += nz * rz * push;
    }
  }

  updateGeometry() {
    const attr = this.geometry.getAttribute('position');
    const arr = attr.array;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i];
      arr[i * 3] = p.x;
      arr[i * 3 + 1] = p.y;
      arr[i * 3 + 2] = p.z;
    }
    attr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();

    // Fringe extends from the final row along the last segment.
    const fattr = this.fringe.geometry.getAttribute('position');
    const farr = fattr.array;
    for (let j = 0; j < this.cols; j++) {
      const idxEnd = (this.rows - 1) * this.cols + j;
      const idxPrev = (this.rows - 2) * this.cols + j;
      const end = this.points[idxEnd];
      const prev = this.points[idxPrev];
      const dx = end.x - prev.x;
      const dy = end.y - prev.y;
      const dz = end.z - prev.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
      const flick = Math.sin(performance.now() * 0.012 + j * 2.2) * 0.012;
      farr[j * 6] = end.x;
      farr[j * 6 + 1] = end.y;
      farr[j * 6 + 2] = end.z;
      farr[j * 6 + 3] = end.x + dx / len * 0.095 + flick;
      farr[j * 6 + 4] = end.y + dy / len * 0.095 - 0.018;
      farr[j * 6 + 5] = end.z + dz / len * 0.095;
    }
    fattr.needsUpdate = true;
  }
}

export class ClothScarf {
  constructor(parent, renderer) {
    this.group = new THREE.Group();
    this.group.name = 'cloth-scarf';
    parent.add(this.group);
    this.renderer = renderer;
    this.accumulator = 0;
    this.elapsed = 0;
    this.turnVel = 0;
    this.speed = 0;
    this.airborne = false;
    this.windBoost = 0;

    const texture = createScarfTexture(renderer);
    const noiserand = seededRandom(72);
    this.material = new THREE.MeshPhysicalMaterial({
      map: texture,
      color: '#d23b43',
      roughness: 0.8,
      metalness: 0.0,
      sheen: 0.72,
      sheenColor: new THREE.Color('#ff9382'),
      sheenRoughness: 0.58,
      emissive: '#3b070c',
      emissiveIntensity: 0.28,
      side: THREE.DoubleSide,
    });
    this.material.shadowSide = THREE.DoubleSide;

    this.tails = [
      new ScarfTail(this.material, {
        anchor: [0.10, 2.60, -0.10],
        width: 0.34,
        length: 1.46,
        rows: 15,
        cols: 4,
        phase: 0.3,
        flip: false,
      }),
      new ScarfTail(this.material, {
        anchor: [-0.075, 2.55, -0.06],
        width: 0.25,
        length: 1.12,
        rows: 12,
        cols: 3,
        phase: 2.1,
        flip: true,
      }),
    ];
    for (const tail of this.tails) {
      this.group.add(tail.mesh);
    }
  }

  update(dt, context) {
    this.elapsed += dt;
    const targetSpeed = context.speed || 0;
    this.speed = damp(this.speed, targetSpeed, 3.2, dt);
    this.turnVel = damp(this.turnVel, context.turnVel || 0, 5.5, dt);
    this.airborne = context.airborne;
    this.windBoost = damp(this.windBoost, context.windBoost || 0, 5, dt);

    const fixed = 1 / 90;
    this.accumulator = Math.min(this.accumulator + dt, fixed * 8);
    let iteration = 0;
    while (this.accumulator >= fixed) {
      for (const tail of this.tails) {
        tail.step(fixed, {
          speed: this.speed,
          time: this.elapsed,
          turnVel: this.turnVel,
          airborne: this.airborne,
          windBoost: this.windBoost,
        }, iteration);
      }
      this.accumulator -= fixed;
      iteration++;
    }
    for (const tail of this.tails) tail.updateGeometry();
  }
}
