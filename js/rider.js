import * as THREE from 'three';
import { ROAD } from './config.js';
import { clamp, damp, lerp, seededRandom, smoothstep, TAU } from './utils.js';
import { ClothScarf } from './scarf.js';

const UP = new THREE.Vector3(0, 1, 0);
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _color = new THREE.Color();
const _mat = new THREE.Matrix4();

function makeCanvasTexture(w, h, draw, colorSpace = THREE.SRGBColorSpace) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = colorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeFeatherTexture(renderer) {
  const rand = seededRandom(173);
  const tex = makeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#f1e5d3';
    ctx.fillRect(0, 0, w, h);
    for (let layer = 0; layer < 4; layer++) {
      for (let row = -1; row < 12; row++) {
        for (let col = -1; col < 10; col++) {
          const x = col * 58 + layer * 13 + row % 2 * 26 + rand() * 10;
          const y = row * 47 + layer * 8 + rand() * 7;
          const rx = 22 + rand() * 9;
          const ry = 33 + rand() * 7;
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate((rand() - 0.5) * 0.5 + layer * 0.1);
          const grad = ctx.createRadialGradient(-rx * 0.3, -ry * 0.35, 2, 0, 0, ry);
          grad.addColorStop(0, 'rgba(255,250,241,.17)');
          grad.addColorStop(0.7, 'rgba(210,198,180,.06)');
          grad.addColorStop(1, 'rgba(123,111,98,.11)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(142,128,112,.13)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.arc(0, 0, ry * 0.72, -0.15, Math.PI + 0.45);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    const warm = ctx.createLinearGradient(0, 0, 0, h);
    warm.addColorStop(0, 'rgba(255,244,224,.15)');
    warm.addColorStop(0.52, 'rgba(255,246,231,.0)');
    warm.addColorStop(1, 'rgba(146,127,113,.12)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,252,246,.08)' : 'rgba(116,102,92,.05)';
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.2, 1.7);
  tex.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  return tex;
}

function makeArmFeatherTexture(renderer) {
  const rand = seededRandom(91);
  const tex = makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#f3e8d5';
    ctx.fillRect(0, 0, w, h);
    const cols = 7;
    const rows = 6;
    for (let row = -1; row <= rows; row++) {
      for (let col = -1; col <= cols; col++) {
        const cx = (col + (row % 2) * 0.5) * (w / cols);
        const cy = row * (h / rows) + h / (rows * 2) + rand() * 5;
        const rx = w / cols * (0.43 + rand() * 0.05);
        const ry = h / rows * (0.62 + rand() * 0.05);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate((rand() - 0.5) * 0.16);
        const grad = ctx.createLinearGradient(0, -ry, 0, ry);
        grad.addColorStop(0, 'rgba(255,250,238,.52)');
        grad.addColorStop(0.58, 'rgba(232,219,197,.2)');
        grad.addColorStop(0.92, 'rgba(158,139,115,.14)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(146,128,105,.17)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(0, 1, ry * 0.68, 0.18, Math.PI - 0.18);
        ctx.stroke();
        ctx.restore();
      }
    }
    for (let i = 0; i < 500; i++) {
      ctx.fillStyle = rand() > 0.5 ? 'rgba(255,252,244,.1)' : 'rgba(114,96,78,.045)';
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 2, 1);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.15, 1);
  tex.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4);
  return tex;
}

function makeBasketTexture() {
  const tex = makeCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#a9804f';
    ctx.fillRect(0, 0, w, h);
    for (let x = -w; x < w * 2; x += 14) {
      ctx.strokeStyle = 'rgba(60,35,17,.32)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 44, h);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(247,212,159,.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + 5, 0);
      ctx.lineTo(x + 49, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 10) {
      ctx.fillStyle = y % 20 === 0 ? 'rgba(64,39,22,.2)' : 'rgba(255,222,169,.15)';
      ctx.fillRect(0, y, w, 2);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2.5, 1);
  return tex;
}

function makeGlowTexture() {
  return makeCanvasTexture(128, 128, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, 'rgba(255,248,220,1)');
    gradient.addColorStop(0.18, 'rgba(255,223,164,.9)');
    gradient.addColorStop(0.45, 'rgba(255,189,116,.28)');
    gradient.addColorStop(1, 'rgba(255,180,100,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
}

function makeShadowTexture() {
  return makeCanvasTexture(256, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(0,0,0,.6)');
    g.addColorStop(0.35, 'rgba(0,0,0,.36)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.save();
    ctx.scale(1, 0.52);
    ctx.beginPath();
    ctx.arc(w / 2, h, w / 2 * 0.72, 0, TAU);
    ctx.fill();
    ctx.restore();
    const g2 = ctx.createRadialGradient(w / 2, h * 0.64, 1, w / 2, h * 0.64, w / 3);
    g2.addColorStop(0, 'rgba(0,0,0,.5)');
    g2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.64, w * 0.35, h * 0.22, 0, 0, TAU);
    ctx.fill();
  });
}

function makeLicenseTexture() {
  return makeCanvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ead9c0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#aa4f3d';
    ctx.lineWidth = 8;
    ctx.strokeRect(7, 7, w - 14, h - 14);
    ctx.fillStyle = '#173238';
    ctx.font = '600 44px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('海岸 07', w / 2, 66);
    ctx.font = '18px Consolas, monospace';
    ctx.fillStyle = '#9c6646';
    ctx.letterSpacing = '2px';
    ctx.fillText('PELICAN COAST', w / 2, 94);
  });
}

function cylinderBetween(start, end, radius, material, radialSegments = 7, endRadius = radius) {
  const dir = _v1.subVectors(end, start);
  const length = dir.length();
  if (length < 1e-5) return new THREE.Mesh(new THREE.BufferGeometry(), material);
  const geo = new THREE.CylinderGeometry(endRadius, radius, length, radialSegments, 1, false);
  geo.translate(0, length / 2, 0);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(start);
  mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
  return mesh;
}

function tubeFromCurve(points, radius, material, tubularSegments = 28, radialSegments = 6) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  return new THREE.Mesh(geo, material);
}

function addTube(group, points, radius, material, segments = 20, radial = 6) {
  const mesh = tubeFromCurve(points, radius, material, segments, radial);
  group.add(mesh);
  return mesh;
}

function makeFeatherGeometry(tipColor = '#10161b', tipStart = 0.58) {
  const segments = 7;
  const positions = [];
  const colors = [];
  const indices = [];
  const base = new THREE.Color('#f7efdf');
  const tip = new THREE.Color(tipColor);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const width = Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.15 * (1 - t * 0.32) + 0.014;
    const x = t * 1.0;
    const y = Math.sin(t * Math.PI) * 0.04 - t * t * 0.012;
    positions.push(x, y, -width * 0.52, x, y + 0.005, width * 0.5);
    const c = base.clone().lerp(tip, smoothstep(tipStart, Math.min(0.99, tipStart + 0.28), t));
    colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeWingMembraneGeometry() {
  const positions = [
    0.02, 0.015, -0.015,
    0.28, 0.035, 0.01,
    0.57, 0.03, 0.075,
    0.79, 0.0, 0.31,
    0.61, -0.01, 0.40,
    0.39, -0.025, 0.33,
    0.18, -0.015, 0.20,
    0.08, 0.0, 0.08,
  ];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex([
    0, 1, 7,
    1, 6, 7,
    1, 2, 6,
    2, 5, 6,
    2, 3, 5,
    3, 4, 5,
  ]);
  geo.computeVertexNormals();
  return geo;
}

function makeWebbedFoot(material) {
  const group = new THREE.Group();
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 6), material);
  pad.scale.set(1.2, 0.28, 1.3);
  group.add(pad);
  for (let i = -1; i <= 1; i++) {
    const toe = new THREE.Mesh(new THREE.CapsuleGeometry(0.021, 0.13, 3, 6), material);
    toe.rotation.x = Math.PI / 2;
    toe.rotation.y = i * 0.28;
    toe.position.set(i * 0.055, 0.005, -0.11);
    group.add(toe);
  }
  const webGeo = new THREE.BufferGeometry();
  webGeo.setAttribute('position', new THREE.Float32BufferAttribute([
    0, 0.005, -0.03,
    -0.1, 0.005, -0.19,
    0, 0.012, -0.24,
    0.1, 0.005, -0.19,
  ], 3));
  webGeo.setIndex([0, 1, 2, 0, 2, 3]);
  webGeo.computeVertexNormals();
  const web = new THREE.Mesh(webGeo, material);
  group.add(web);
  return group;
}

function setLimb(mesh, from, to) {
  const dir = _v2.subVectors(to, from);
  const len = dir.length();
  if (len < 1e-5) return;
  mesh.position.copy(from);
  mesh.quaternion.setFromUnitVectors(UP, _v1.copy(dir).multiplyScalar(1 / len));
  mesh.scale.set(1, len, 1);
}

function solveIK(hip, foot, upper, lower, bendHint, outKnee) {
  const delta = _v3.subVectors(foot, hip);
  let dist = delta.length();
  dist = clamp(dist, Math.abs(upper - lower) + 0.03, upper + lower - 0.005);
  const dir = delta.normalize();
  const along = (upper * upper - lower * lower + dist * dist) / (2 * dist);
  const heightSq = Math.max(0, upper * upper - along * along);
  const bend = _v1.copy(bendHint).sub(_v2.copy(dir).multiplyScalar(bendHint.dot(dir)));
  if (bend.lengthSq() < 1e-5) bend.set(0, 0, -1);
  bend.normalize();
  outKnee.copy(hip).addScaledVector(dir, along).addScaledVector(bend, Math.sqrt(heightSq));
  return outKnee;
}

function beakProfile(t) {
  t = clamp(t, 0, 1);
  const tip = smoothstep(0.8, 1, t);
  const w = (0.155 + Math.sin(t * Math.PI) * 0.03 - 0.11 * t * t) * (1 - tip * 0.2);
  const h = (0.038 + Math.sin(t * Math.PI) * 0.006 - 0.014 * t) * (1 - tip * 0.42);
  const cy = 0.078 - 0.05 * t - 0.015 * t * t - tip * 0.085;
  const z = -0.26 - 0.96 * t - tip * 0.035;
  return { w, h, cy, z, mouthY: cy - h + 0.004 };
}

function pouchProfile(t) {
  const p = beakProfile(t);
  const tipTuck = smoothstep(0.78, 0.94, t);
  const halfWidth = p.w * 0.98 * (1 - tipTuck);
  const sag = (0.1 + 0.16 * Math.sin(Math.PI * Math.pow(t, 0.9)) * (1 - 0.25 * t)) * (1 - tipTuck);
  return { p, tipTuck, halfWidth, sag };
}

function buildUpperBeakGeometry() {
  const segments = 22;
  const ring = 10;
  const positions = [];
  const colors = [];
  const indices = [];
  const baseColor = new THREE.Color('#d96a24');
  const midColor = new THREE.Color('#ef9330');
  const tipColor = new THREE.Color('#ffc95f');
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = beakProfile(t);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * TAU;
      const top = Math.max(0, Math.sin(a));
      positions.push(
        Math.cos(a) * p.w,
        p.cy + Math.sin(a) * p.h + top * 0.005 * (1 - t * 0.5),
        p.z
      );
      const c = baseColor.clone()
        .lerp(midColor, smoothstep(0, 0.45, t))
        .lerp(tipColor, smoothstep(0.55, 0.98, t));
      c.offsetHSL(0, -0.01, top * 0.035);
      if (Math.sin(a) < -0.55) {
        c.lerp(new THREE.Color('#b45b27'), (-Math.sin(a) - 0.55) * 0.18);
      }
      colors.push(c.r, c.g, c.b);
    }
    if (i < segments) {
      for (let j = 0; j < ring; j++) {
        const a = i * ring + j;
        const b = (i + 1) * ring + j;
        const c = i * ring + ((j + 1) % ring);
        const d = (i + 1) * ring + ((j + 1) % ring);
        indices.push(a, b, c, c, b, d);
      }
    }
  }
  const last = segments * ring;
  const pTip = beakProfile(1);
  const tipIndex = positions.length / 3;
  positions.push(0, pTip.cy - pTip.h * 0.4, pTip.z - 0.018);
  colors.push(tipColor.r, tipColor.g, tipColor.b);
  for (let j = 0; j < ring; j++) {
    indices.push(last + j, tipIndex, last + ((j + 1) % ring));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildBeakPouchGeometry() {
  const segments = 22;
  const ring = 12;
  const positions = [];
  const colors = [];
  const indices = [];
  const baseColor = new THREE.Color('#de782e');
  const midColor = new THREE.Color('#f09a42');
  const tipColor = new THREE.Color('#ffc873');
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 0.94;
    const { p, halfWidth, sag } = pouchProfile(t);
    for (let j = 0; j <= ring; j++) {
      const phi = (j / ring) * Math.PI;
      const x = Math.cos(phi) * halfWidth;
      const y = p.mouthY + 0.006 - Math.sin(phi) * sag;
      const z = p.z + 0.26;
      positions.push(x, y, z);
      const c = baseColor.clone()
        .lerp(midColor, smoothstep(0.04, 0.48, t))
        .lerp(tipColor, smoothstep(0.56, 0.94, t));
      c.offsetHSL(0, 0.025, Math.sin(phi) * 0.02 - (1 - Math.sin(phi)) * 0.025);
      colors.push(c.r, c.g, c.b);
    }
    if (i < segments) {
      for (let j = 0; j < ring; j++) {
        const a = i * (ring + 1) + j;
        const b = (i + 1) * (ring + 1) + j;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  // Close the top of the sac. Without this roof the camera can see straight
  // into the pouch from the front, which reads as a permanent open mouth.
  const topStart = positions.length / 3;
  const topSegments = 4;
  const roofColor = new THREE.Color('#e88d3d');
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 0.94;
    const { p, halfWidth } = pouchProfile(t);
    const topY = p.mouthY + 0.006;
    const z = p.z + 0.26;
    for (let k = 0; k <= topSegments; k++) {
      const f = k / topSegments;
      const x = halfWidth * (1 - f * 2);
      const y = topY + Math.sin(Math.PI * f) * 0.012;
      positions.push(x, y, z);
      const c = roofColor.clone().lerp(tipColor, smoothstep(0.5, 0.94, t) * 0.5);
      colors.push(c.r, c.g, c.b);
    }
    if (i < segments) {
      for (let k = 0; k < topSegments; k++) {
        const a = topStart + i * (topSegments + 1) + k;
        const b = topStart + (i + 1) * (topSegments + 1) + k;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function unifiedBeakProfile(t) {
  const tip = smoothstep(0.82, 1, t);
  const w = (0.155 + Math.sin(t * Math.PI) * 0.03 - 0.11 * t * t) * (1 - tip * 0.93);
  const h = (0.04 + Math.sin(t * Math.PI) * 0.006 - 0.016 * t) * (1 - tip * 0.85);
  const d = (0.09 + 0.21 * Math.sin(Math.PI * Math.pow(t, 0.85)) * (1 - 0.15 * t)) * (1 - tip * 0.95);
  const mouthY = 0.045 - 0.05 * t - 0.02 * t * t - tip * 0.06;
  const z = -0.96 * t - tip * 0.03;
  return { w, h, d, mouthY, z, tip };
}

function buildUnifiedBeakGeometry() {
  const segments = 26;
  const ring = 18;
  const positions = [];
  const colors = [];
  const indices = [];
  const upperBase = new THREE.Color('#d5601d');
  const upperTip = new THREE.Color('#ffc65b');
  const pouchBase = new THREE.Color('#dd7a2f');
  const pouchTip = new THREE.Color('#ffbe66');
  const seamColor = new THREE.Color('#93421d');
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 0.96;
    const p = unifiedBeakProfile(t);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * TAU;
      const s = Math.sin(a);
      const c = Math.cos(a);
      const x = c * p.w;
      let y = p.mouthY + (s >= 0 ? p.h * s : p.d * s);
      if (s > 0) y += s * s * 0.004;
      positions.push(x, y, p.z);
      let color;
      if (s >= 0) {
        color = upperBase.clone().lerp(upperTip, smoothstep(0.08, 1, t));
        color.offsetHSL(0, 0.01, s * 0.028);
      } else {
        color = pouchBase.clone().lerp(pouchTip, smoothstep(0.05, 0.96, t));
        color.offsetHSL(0, 0.025, -s * 0.012);
      }
      const seam = 1 - smoothstep(0, 0.1, Math.abs(s));
      color.lerp(seamColor, seam * 0.55);
      colors.push(color.r, color.g, color.b);
    }
    if (i < segments) {
      for (let j = 0; j < ring; j++) {
        const a = i * ring + j;
        const b = (i + 1) * ring + j;
        const c = i * ring + ((j + 1) % ring);
        const d = (i + 1) * ring + ((j + 1) % ring);
        indices.push(a, b, c, c, b, d);
      }
    }
  }
  const tipP = unifiedBeakProfile(0.985);
  const tipIndex = positions.length / 3;
  positions.push(0, tipP.mouthY, tipP.z);
  colors.push(upperTip.r, upperTip.g, upperTip.b);
  const last = segments * ring;
  for (let j = 0; j < ring; j++) {
    indices.push(last + j, tipIndex, last + ((j + 1) % ring));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeWingArmGeometry() {
  const segments = 20;
  const radial = 10;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * 0.985;
    const arch = Math.sin(Math.PI * t);
    const x = -0.075 + t * 1.267;
    const cy = arch * 0.008;
    const cz = arch * 0.034;
    const ry = 0.045 * (1 - t * 0.55) + 0.008;
    const rz = 0.098 * (1 - t * 0.58) + 0.014;
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * TAU;
      positions.push(x, cy + Math.cos(a) * ry, cz + Math.sin(a) * rz);
      uvs.push(t * 1.6, j / radial);
    }
    if (i < segments) {
      for (let j = 0; j < radial; j++) {
        const a = i * radial + j;
        const b = (i + 1) * radial + j;
        const c = i * radial + ((j + 1) % radial);
        const d = (i + 1) * radial + ((j + 1) % radial);
        indices.push(a, b, c, c, b, d);
      }
    }
  }
  const tipIndex = positions.length / 3;
  positions.push(1.19, 0, 0);
  uvs.push(1, 0.5);
  const last = segments * radial;
  for (let j = 0; j < radial; j++) {
    indices.push(last + j, tipIndex, last + ((j + 1) % radial));
  }
  const baseIndex = positions.length / 3;
  positions.push(-0.08, 0, 0);
  uvs.push(0, 0.5);
  for (let j = 0; j < radial; j++) {
    indices.push(baseIndex, j, (j + 1) % radial);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export class PelicanRider {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.root = new THREE.Group();
    this.root.name = 'pelican-rider';
    this.root.position.set(0, ROAD.y, 0);
    scene.add(this.root);

    this.leanGroup = new THREE.Group();
    this.root.add(this.leanGroup);
    this.pitchGroup = new THREE.Group();
    this.pitchGroup.position.set(0, 0, 0.73);
    this.leanGroup.add(this.pitchGroup);
    this.model = new THREE.Group();
    this.model.position.set(0, 0, -0.73);
    this.pitchGroup.add(this.model);

    this.time = 0;
    this.wheelSpin = 0;
    this.crankAngle = Math.PI * 0.2;
    this.legs = [];
    this.wings = [];
    this.wingHands = [];
    this.pedalPositions = [new THREE.Vector3(), new THREE.Vector3()];
    this.pelvisPositions = [new THREE.Vector3(), new THREE.Vector3()];
    this.catchTimer = 0;
    this.catchPulse = 0;
    this.landPulse = 0;
    this.pouchBulge = 0;
    this.lastJumpY = 0;
    this.headLookYaw = 0;
    this.headLookPitch = 0;
    this.basketFish = [];
    this.pedalMeshes = [];
    this.frameMaterial = new THREE.MeshStandardMaterial({ color: '#568f8a', roughness: 0.3, metalness: 0.5 });
    this.frameDark = new THREE.MeshStandardMaterial({ color: '#2d4c4d', roughness: 0.45, metalness: 0.35 });
    this.creamMaterial = new THREE.MeshStandardMaterial({ color: '#e9dcc4', roughness: 0.52, metalness: 0.08 });
    this.tireMaterial = new THREE.MeshStandardMaterial({ color: '#202728', roughness: 0.94, metalness: 0.0 });
    this.rimMaterial = new THREE.MeshStandardMaterial({ color: '#b5ae9d', roughness: 0.3, metalness: 0.82 });
    this.chromeMaterial = new THREE.MeshStandardMaterial({ color: '#c9c1ae', roughness: 0.22, metalness: 0.92 });
    this.leatherMaterial = new THREE.MeshStandardMaterial({ color: '#6a4430', roughness: 0.67, metalness: 0.02 });
    this.coralMaterial = new THREE.MeshStandardMaterial({ color: '#d5604d', roughness: 0.38, metalness: 0.1 });
    this.darkRubber = new THREE.MeshStandardMaterial({ color: '#202b2c', roughness: 0.85 });
    this.wickerMaterial = new THREE.MeshStandardMaterial({ map: makeBasketTexture(), color: '#c79a62', roughness: 0.84, side: THREE.DoubleSide });
    this.strawMaterial = new THREE.MeshStandardMaterial({ color: '#b98c57', roughness: 0.9 });

    const featherMap = makeFeatherTexture(renderer);
    this.featherMaterial = new THREE.MeshPhysicalMaterial({
      color: '#fbf3e5',
      map: featherMap,
      roughness: 0.88,
      metalness: 0,
      sheen: 0.5,
      sheenColor: new THREE.Color('#e6ded1'),
      sheenRoughness: 0.8,
      side: THREE.DoubleSide,
    });
    this.featherDarkMaterial = new THREE.MeshStandardMaterial({ color: '#2c3439', roughness: 0.9 });
    this.headFeatherMaterial = this.featherMaterial.clone();
    this.headFeatherMaterial.color.set('#fffdf8');
    this.headFeatherMaterial.roughness = 0.82;
    this.featherVertexMaterial = this.featherMaterial.clone();
    this.featherVertexMaterial.vertexColors = true;
    this.featherVertexMaterial.color.set('#ffffff');
    this.armFeatherMaterial = this.headFeatherMaterial.clone();
    this.armFeatherMaterial.map = makeArmFeatherTexture(renderer);
    this.armFeatherMaterial.color.set('#f6ecd9');
    this.armFeatherMaterial.roughness = 0.86;
    this.orangeMaterial = new THREE.MeshPhysicalMaterial({
      color: '#e9a04d',
      roughness: 0.38,
      metalness: 0.0,
      clearcoat: 0.34,
      clearcoatRoughness: 0.36,
      side: THREE.DoubleSide,
    });
    this.orangeDarkMaterial = new THREE.MeshPhysicalMaterial({
      color: '#b96532',
      roughness: 0.5,
      clearcoat: 0.16,
      clearcoatRoughness: 0.55,
    });
    this.beakSurfaceMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      color: '#ffffff',
      roughness: 0.33,
      metalness: 0.0,
      clearcoat: 0.4,
      clearcoatRoughness: 0.32,
      emissive: new THREE.Color('#3b1404'),
      emissiveIntensity: 0.1,
      side: THREE.DoubleSide,
    });
    this.pouchSurfaceMaterial = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      color: '#ffffff',
      roughness: 0.48,
      metalness: 0.0,
      clearcoat: 0.28,
      clearcoatRoughness: 0.45,
      sheen: 0.35,
      sheenColor: new THREE.Color('#ffc98e'),
      sheenRoughness: 0.8,
      emissive: new THREE.Color('#4a1b07'),
      emissiveIntensity: 0.14,
      side: THREE.DoubleSide,
    });
    this.pouchMaterial = new THREE.MeshPhysicalMaterial({ color: '#e99151', roughness: 0.38, metalness: 0.0, clearcoat: 0.22, clearcoatRoughness: 0.55, side: THREE.DoubleSide });
    this.helmetMaterial = new THREE.MeshPhysicalMaterial({ color: '#f1e0c1', roughness: 0.34, metalness: 0.04, clearcoat: 0.72, clearcoatRoughness: 0.22 });
    this.helmetAccent = new THREE.MeshStandardMaterial({ color: '#3c7c7a', roughness: 0.3, metalness: 0.35 });
    this.lensMaterial = new THREE.MeshPhysicalMaterial({ color: '#07141a', roughness: 0.07, metalness: 0.65, clearcoat: 1.0, clearcoatRoughness: 0.05 });
    this.goldMaterial = new THREE.MeshStandardMaterial({ color: '#d9b271', roughness: 0.23, metalness: 0.9 });
    this.legMaterial = new THREE.MeshStandardMaterial({ color: '#e89b45', roughness: 0.62 });

    // A soft warm bounce below the face lifts the gular pouch and the
    // underside of the bill out of pure silhouette.
    this.characterFill = new THREE.PointLight('#ffd7ae', 0.2, 1.55, 2);
    this.characterFill.position.set(0, 2.3, -0.72);
    this.model.add(this.characterFill);

    this.bikeRoot = new THREE.Group();
    this.model.add(this.bikeRoot);
    this._buildBike();
    this._buildPelican();
    this._buildBasketFish();
    this._buildHeadlight();
    this._buildContactShadow();

    this.wheels = [this.frontWheelHolder, this.rearWheelHolder];
    this._setCameraMode('chase');
  }

  _buildBike() {
    const g = this.bikeRoot;
    const rear = new THREE.Vector3(0, 0.58, 0.73);
    const front = new THREE.Vector3(0, 0.58, -0.77);
    const crank = new THREE.Vector3(0, 0.65, -0.03);
    const seat = new THREE.Vector3(0, 1.5, 0.32);
    const headTop = new THREE.Vector3(0, 1.42, -0.53);
    const headLow = new THREE.Vector3(0, 0.98, -0.62);

    // Wheels and their yaw holders.
    this.frontWheelHolder = new THREE.Group();
    this.frontWheelHolder.position.copy(front);
    g.add(this.frontWheelHolder);
    this.frontWheel = this._makeWheel();
    this.frontWheelHolder.add(this.frontWheel);

    this.rearWheelHolder = new THREE.Group();
    this.rearWheelHolder.position.copy(rear);
    g.add(this.rearWheelHolder);
    this.rearWheel = this._makeWheel();
    this.rearWheelHolder.add(this.rearWheel);

    // Main triangle — slightly oversized vintage cruiser proportions.
    const tubes = [
      [rear, seat, 0.036],
      [rear, crank, 0.032],
      [crank, seat, 0.037],
      [seat, headTop, 0.036],
      [crank, headTop, 0.041],
      [headTop, headLow, 0.043],
      [headLow, front, 0.027],
      [headLow, new THREE.Vector3(-0.07, 0.64, -0.7), 0.021],
      [headLow, new THREE.Vector3(0.07, 0.64, -0.7), 0.021],
    ];
    for (const [a, b, r] of tubes) {
      const mesh = cylinderBetween(a, b, r, this.frameMaterial, 8);
      mesh.castShadow = true;
      g.add(mesh);
    }

    // Twin rear stays for a hand-built frame feel.
    for (const side of [-1, 1]) {
      g.add(cylinderBetween(new THREE.Vector3(side * 0.075, 0.58, 0.72), new THREE.Vector3(side * 0.04, 1.45, 0.32), 0.017, this.frameMaterial, 6));
      g.add(cylinderBetween(new THREE.Vector3(side * 0.075, 0.58, 0.72), new THREE.Vector3(side * 0.055, 0.66, 0.0), 0.016, this.frameMaterial, 6));
    }

    // Seat post, saddle, rivets.
    g.add(cylinderBetween(new THREE.Vector3(0, 1.42, 0.32), new THREE.Vector3(0, 1.55, 0.26), 0.022, this.chromeMaterial, 8));
    const saddle = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 8), this.leatherMaterial);
    saddle.scale.set(1.05, 0.24, 1.85);
    saddle.position.set(0, 1.58, 0.26);
    saddle.rotation.x = -0.06;
    saddle.castShadow = true;
    g.add(saddle);
    const saddleNose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 7), this.leatherMaterial);
    saddleNose.scale.set(0.85, 0.45, 1.5);
    saddleNose.position.set(0, 1.585, 0.08);
    g.add(saddleNose);
    for (const side of [-1, 1]) {
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), this.goldMaterial);
      rivet.position.set(side * 0.13, 1.62, 0.45);
      g.add(rivet);
    }

    // Fenders.
    const fenderPath = (wheelZ) => {
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const a = lerp(-0.2, Math.PI + 0.32, i / 16);
        pts.push(new THREE.Vector3(0, 0.58 + Math.sin(a) * 0.66, wheelZ + Math.cos(a) * 0.66));
      }
      return pts;
    };
    g.add(tubeFromCurve(fenderPath(0.73), 0.035, this.creamMaterial, 22, 4));
    g.add(tubeFromCurve(fenderPath(-0.77), 0.035, this.creamMaterial, 22, 4));

    // Chainring, chain, crank.
    this.crankGroup = new THREE.Group();
    this.crankGroup.position.copy(crank);
    g.add(this.crankGroup);
    const chainring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.013, 5, 30), this.chromeMaterial);
    chainring.rotation.y = Math.PI / 2;
    chainring.position.x = 0.13;
    chainring.castShadow = true;
    this.crankGroup.add(chainring);
    const chainringInner = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.008, 4, 20), this.frameDark);
    chainringInner.rotation.y = Math.PI / 2;
    chainringInner.position.x = 0.13;
    this.crankGroup.add(chainringInner);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.19, 0.034), this.chromeMaterial);
      arm.position.set(side * 0.125, side * 0.095, 0);
      arm.castShadow = true;
      this.crankGroup.add(arm);
      const pedalAxis = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), this.chromeMaterial);
      pedalAxis.rotation.z = Math.PI / 2;
      pedalAxis.position.set(side * 0.24, side * 0.19, 0);
      this.crankGroup.add(pedalAxis);
      const pedal = new THREE.Group();
      pedal.position.set(side * 0.26, side * 0.19, 0);
      const pedalBlock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.1), this.darkRubber);
      pedalBlock.castShadow = true;
      pedal.add(pedalBlock);
      const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.008, 0.02), this.coralMaterial);
      reflector.position.set(0, 0.016, 0.035);
      pedal.add(reflector);
      pedal.userData.axis = side;
      this.crankGroup.add(pedal);
      this.pedalMeshes.push(pedal);
    }

    const chainGeo = new THREE.BufferGeometry();
    const chainPoints = [
      0.13, 0.65 + 0.19, -0.03,
      0.075, 0.58, 0.73,
      0.075, 0.58, 0.73,
      0.13, 0.65 - 0.19, -0.03,
    ];
    chainGeo.setAttribute('position', new THREE.Float32BufferAttribute(chainPoints, 3));
    const chain = new THREE.LineSegments(chainGeo, new THREE.LineBasicMaterial({ color: '#777264' }));
    g.add(chain);

    // Chain guard, a lovely little detail.
    const guard = new THREE.Mesh(new THREE.TorusGeometry(0.275, 0.017, 4, 24, Math.PI * 1.1), this.creamMaterial);
    guard.rotation.y = Math.PI / 2;
    guard.rotation.z = 0.5;
    guard.position.set(-0.12, 0.68, 0.02);
    g.add(guard);

    // Handlebar and stem.
    this.handlebarGroup = new THREE.Group();
    this.handlebarGroup.position.set(0, 1.48, -0.55);
    g.add(this.handlebarGroup);
    const stem = cylinderBetween(new THREE.Vector3(0, 1.4, -0.56), new THREE.Vector3(0, 1.53, -0.59), 0.03, this.chromeMaterial, 7);
    g.add(stem);
    // Local coordinates are relative to the steering pivot at (0, 1.48, -0.55).
    const barPoints = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14;
      const x = lerp(-0.37, 0.37, t);
      const y = 0.07 + Math.cos(t * Math.PI * 2) * 0.02 - Math.sin(t * Math.PI) * 0.015;
      const z = -0.08 + Math.sin(t * Math.PI) * 0.11;
      barPoints.push(new THREE.Vector3(x, y, z));
    }
    const bar = tubeFromCurve(barPoints, 0.022, this.chromeMaterial, 28, 7);
    bar.castShadow = true;
    this.handlebarGroup.add(bar);
    for (const side of [-1, 1]) {
      const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.038, 0.14, 4, 8), this.leatherMaterial);
      grip.rotation.z = Math.PI / 2;
      grip.rotation.y = side * 0.18;
      grip.position.set(side * 0.34, 0.068, -0.065);
      this.handlebarGroup.add(grip);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 10), this.coralMaterial);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(side * 0.415, 0.068, -0.065);
      this.handlebarGroup.add(cap);
    }
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 8, 0, TAU, 0, Math.PI / 2), this.goldMaterial);
    bell.position.set(0.2, 0.1, -0.065);
    this.handlebarGroup.add(bell);
    const bellBase = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.02, 8), this.chromeMaterial);
    bellBase.position.set(0.2, 0.08, -0.065);
    this.handlebarGroup.add(bellBase);

    // Front basket.
    this.basketGroup = new THREE.Group();
    this.basketGroup.position.set(0, 1.08, -0.94);
    g.add(this.basketGroup);
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.19, 0.27, 12, 1, true), this.wickerMaterial);
    basket.castShadow = true;
    this.basketGroup.add(basket);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.19, 12), this.strawMaterial);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = -0.13;
    this.basketGroup.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.018, 5, 24), this.strawMaterial);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.135;
    this.basketGroup.add(rim);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 4, 16, Math.PI), this.strawMaterial);
    handle.position.set(0, 0.13, 0);
    handle.rotation.y = Math.PI / 2;
    this.basketGroup.add(handle);

    // Rear number plate, visible from the chase camera.
    const plateTexture = makeLicenseTexture();
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.135), new THREE.MeshStandardMaterial({ map: plateTexture, roughness: 0.7, side: THREE.DoubleSide }));
    plate.position.set(0, 1.05, 0.86);
    g.add(plate);
    for (const side of [-1, 1]) {
      g.add(cylinderBetween(new THREE.Vector3(side * 0.12, 1.13, 0.84), new THREE.Vector3(side * 0.12, 0.96, 0.84), 0.006, this.chromeMaterial, 4));
    }

    // Tail reflector.
    const tailLamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshStandardMaterial({ color: '#5d1f1b', emissive: '#ff4a30', emissiveIntensity: 0.7, roughness: 0.4 }));
    tailLamp.position.set(0, 1.18, 0.9);
    g.add(tailLamp);
    this.tailLamp = tailLamp;

    // Little brass pump along the down tube.
    const pump = cylinderBetween(new THREE.Vector3(0.22, 0.75, -0.18), new THREE.Vector3(0.25, 1.25, -0.36), 0.018, this.goldMaterial, 6);
    g.add(pump);

    // Pelican's saddle-side feet.
    this._buildLegs();
  }

  _makeWheel() {
    const group = new THREE.Group();
    const R = 0.58;
    const tire = new THREE.Mesh(new THREE.TorusGeometry(R, 0.052, 7, 40), this.tireMaterial);
    tire.rotation.y = Math.PI / 2;
    tire.castShadow = true;
    group.add(tire);
    const sidewall = new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.015, 4, 36), this.creamMaterial);
    sidewall.rotation.y = Math.PI / 2;
    group.add(sidewall);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R - 0.075, 0.014, 5, 32), this.rimMaterial);
    rim.rotation.y = Math.PI / 2;
    group.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.15, 10), this.chromeMaterial);
    hub.rotation.z = Math.PI / 2;
    group.add(hub);
    const hubCap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), this.goldMaterial);
    hubCap.position.x = 0.08;
    group.add(hubCap);
    const spokePositions = [];
    const spokes = 24;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU;
      const side = i % 2 === 0 ? 0.045 : -0.045;
      spokePositions.push(side, 0, 0, 0, Math.cos(a) * (R - 0.08), Math.sin(a) * (R - 0.08));
    }
    const spokeGeo = new THREE.BufferGeometry();
    spokeGeo.setAttribute('position', new THREE.Float32BufferAttribute(spokePositions, 3));
    const spokeLines = new THREE.LineSegments(spokeGeo, new THREE.LineBasicMaterial({ color: '#d0c8b7', transparent: true, opacity: 0.7 }));
    group.add(spokeLines);
    const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.075, 0.035), this.coralMaterial);
    reflector.position.set(0.044, 0, R - 0.16);
    group.add(reflector);
    return group;
  }

  _buildLegs() {
    for (const side of [-1, 1]) {
      const hip = new THREE.Vector3(side * 0.16, 1.79, 0.22);
      this.pelvisPositions[(side + 1) / 2].copy(hip);
      const thighGeo = new THREE.CylinderGeometry(0.047, 0.038, 1, 8, 1, false);
      thighGeo.translate(0, 0.5, 0);
      const thigh = new THREE.Mesh(thighGeo, this.legMaterial);
      thigh.castShadow = true;
      this.model.add(thigh);
      const shinGeo = new THREE.CylinderGeometry(0.033, 0.026, 1, 7, 1, false);
      shinGeo.translate(0, 0.5, 0);
      const shin = new THREE.Mesh(shinGeo, this.legMaterial);
      shin.castShadow = true;
      this.model.add(shin);
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.043, 8, 6), this.legMaterial);
      knee.castShadow = true;
      this.model.add(knee);
      const cuff = new THREE.Mesh(new THREE.SphereGeometry(0.105, 10, 7), this.featherMaterial);
      cuff.scale.set(0.8, 0.55, 0.7);
      cuff.position.copy(hip);
      cuff.position.y += 0.04;
      cuff.castShadow = true;
      this.model.add(cuff);
      const foot = makeWebbedFoot(this.legMaterial);
      foot.castShadow = true;
      foot.scale.setScalar(0.92);
      this.model.add(foot);
      this.legs.push({ side, hip, thigh, shin, knee, foot });
    }
  }

  _buildPelican() {
    const g = new THREE.Group();
    g.name = 'pelican-body';
    this.model.add(g);
    this.bodyGroup = g;

    // One continuous body with soft vertex-coloured plumage. The old separate
    // chest shell left a hard seam across the flank, which is gone now.
    const bodyGeo = new THREE.SphereGeometry(0.5, 32, 22);
    const bodyPositions = bodyGeo.attributes.position;
    const bodyColors = new Float32Array(bodyPositions.count * 3);
    const warmPlumage = new THREE.Color('#e8d8c4');
    const litPlumage = new THREE.Color('#fffdf7');
    for (let i = 0; i < bodyPositions.count; i++) {
      const nx = bodyPositions.getX(i) / 0.5;
      const ny = bodyPositions.getY(i) / 0.5;
      const nz = bodyPositions.getZ(i) / 0.5;
      const frontLight = smoothstep(0.1, 0.92, -nz * 0.82 + 0.22 - ny * 0.12);
      _color.copy(warmPlumage).lerp(litPlumage, frontLight);
      bodyColors[i * 3] = _color.r;
      bodyColors[i * 3 + 1] = _color.g;
      bodyColors[i * 3 + 2] = _color.b;
    }
    bodyGeo.setAttribute('color', new THREE.BufferAttribute(bodyColors, 3));
    const bodyMat = this.featherMaterial.clone();
    bodyMat.vertexColors = true;
    bodyMat.color.set('#fffdf8');
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.scale.set(0.9, 1.06, 0.86);
    body.position.set(0, 2.02, 0.12);
    body.rotation.x = -0.22;
    body.castShadow = true;
    body.receiveShadow = true;
    g.add(body);
    this.bodyMesh = body;

    // Three broad tail feathers, kept tucked so they read as one clean fan.
    const tailGeo = makeFeatherGeometry('#17373b', 0.55);
    for (let i = -1; i <= 1; i++) {
      const feather = new THREE.Mesh(tailGeo, this.featherVertexMaterial);
      const outer = Math.abs(i);
      feather.scale.set(0.52 + (1 - outer) * 0.04, 0.9, 1.4);
      feather.position.set(i * 0.1, 1.96 + outer * 0.02, 0.54);
      feather.rotation.set(-0.16 + outer * 0.03, Math.PI + i * 0.22, i * 0.14);
      feather.castShadow = true;
      g.add(feather);
    }

    // Neck path and head pivot.
    const neckPoints = [
      new THREE.Vector3(0, 2.26, -0.08),
      new THREE.Vector3(0, 2.4, -0.22),
      new THREE.Vector3(0, 2.59, -0.34),
      new THREE.Vector3(0, 2.77, -0.42),
    ];
    const neck = tubeFromCurve(neckPoints, 0.148, this.headFeatherMaterial, 18, 10);
    neck.castShadow = true;
    g.add(neck);
    const neckBase = new THREE.Mesh(new THREE.SphereGeometry(0.19, 14, 10), this.headFeatherMaterial);
    neckBase.scale.set(1.1, 0.65, 0.9);
    neckBase.position.set(0, 2.25, -0.08);
    neckBase.castShadow = true;
    g.add(neckBase);

    // A soft two-layer collar around the neck base, short enough not to turn
    // into a spiky breastplate.
    const ruffGeo = makeFeatherGeometry('#d3c3ad', 0.8);
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU + 0.18;
      const feather = new THREE.Mesh(ruffGeo, this.featherVertexMaterial);
      feather.scale.set(0.16 + Math.cos(a * 2) * 0.012, 0.5, 0.82);
      feather.position.set(Math.cos(a) * 0.15, 2.3 + Math.cos(a * 2) * 0.01, -0.08 + Math.sin(a) * 0.145);
      feather.rotation.set(0, -a, -0.34);
      feather.castShadow = true;
      g.add(feather);
    }
    const ruffUpperGeo = makeFeatherGeometry('#ded0bb', 0.82);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.1;
      const feather = new THREE.Mesh(ruffUpperGeo, this.featherVertexMaterial);
      feather.scale.set(0.115, 0.34, 0.68);
      feather.position.set(Math.cos(a) * 0.12, 2.37, -0.07 + Math.sin(a) * 0.115);
      feather.rotation.set(0, -a, -0.2);
      feather.castShadow = true;
      g.add(feather);
    }

    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 2.8, -0.46);
    g.add(this.headGroup);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.265, 24, 18), this.headFeatherMaterial);
    head.scale.set(1.0, 1.05, 1.14);
    head.position.set(0, 0.08, -0.1);
    head.castShadow = true;
    this.headGroup.add(head);
    this.headMesh = head;
    // Layered crest feathers at the nape, tucked below the helmet.
    const crestGeo = makeFeatherGeometry('#e2d3bc', 0.82);
    const crestSpecs = [
      [0.055, 0.18, 0.12, 0.17, 0.55, 0.42, 0.75, 2.65, 0.2],
      [-0.045, 0.16, 0.13, 0.14, 0.44, 0.34, 0.78, 2.35, 0.16],
      [0.135, 0.14, 0.1, 0.12, 0.38, 0.3, 0.82, 2.9, 0.22],
    ];
    for (const [x, y, z, sx, sy, sz, rx, ry, rz] of crestSpecs) {
      const crest = new THREE.Mesh(crestGeo, this.featherVertexMaterial);
      crest.scale.set(sx, sy, sz);
      crest.position.set(x, y, z);
      crest.rotation.set(rx, ry, rz);
      crest.castShadow = true;
      this.headGroup.add(crest);
    }
    const coralCrestGeo = makeFeatherGeometry('#bc5347', 0.64);
    for (let i = 0; i < 2; i++) {
      const plume = new THREE.Mesh(coralCrestGeo, this.featherVertexMaterial);
      plume.scale.set(0.13 + i * 0.03, 0.5, 0.32);
      plume.position.set(0.035 - i * 0.055, 0.18 + i * 0.02, 0.17 + i * 0.018);
      plume.rotation.set(0.72, 2.58 + i * 0.3, 0.18 - i * 0.1);
      plume.castShadow = true;
      this.headGroup.add(plume);
    }

    // Feathered brows above the sunglasses make the face read at a distance.
    for (const side of [-1, 1]) {
      const brow = new THREE.Mesh(makeFeatherGeometry('#e7d8c1', 0.84), this.featherVertexMaterial);
      brow.scale.set(0.075, 0.22, 0.1);
      brow.position.set(side * 0.14, 0.25, -0.415);
      brow.rotation.set(0.35, side * 0.55, side * 0.8);
      this.headGroup.add(brow);
    }

    // Cheeks and a small feathered ear tuft on each side.
    const cheekTuftGeo = makeFeatherGeometry('#e3d4bf', 0.84);
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 7), new THREE.MeshStandardMaterial({ color: '#eab49d', roughness: 0.8 }));
      cheek.scale.set(0.7, 0.38, 0.55);
      cheek.position.set(side * 0.2, 0.015, -0.26);
      this.headGroup.add(cheek);
      const tuft = new THREE.Mesh(cheekTuftGeo, this.featherVertexMaterial);
      tuft.scale.set(side * 0.1, 0.24, 0.16);
      tuft.position.set(side * 0.225, 0.025, -0.2);
      tuft.rotation.set(0.1, -0.95, -0.08);
      tuft.castShadow = true;
      this.headGroup.add(tuft);
    }

    // One closed, asymmetric bill volume: flat upper mandible and sagging
    // pouch share a real surface, so there is no open cavity to read as a
    // permanent "shocked mouth" from low camera angles.
    const billGroup = new THREE.Group();
    billGroup.position.set(0, 0, -0.26);
    const bill = new THREE.Mesh(buildUnifiedBeakGeometry(), this.beakSurfaceMaterial);
    bill.castShadow = true;
    billGroup.add(bill);
    this.headGroup.add(billGroup);
    this.pouch = billGroup;

    // A soft throat sac under the bill root, so the closed bill still has the
    // characteristic heavy pelican jawline.
    const throat = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), this.pouchMaterial);
    throat.scale.set(0.86, 0.78, 1.24);
    throat.position.set(0, -0.085, -0.52);
    throat.castShadow = true;
    this.headGroup.add(throat);

    const cere = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 10), this.orangeMaterial);
    cere.scale.set(1.0, 0.58, 0.78);
    cere.position.set(0, 0.018, -0.286);
    cere.castShadow = true;
    this.headGroup.add(cere);

    const nostrilProfile = unifiedBeakProfile(0.2);
    const nostrilX = 0.055;
    const nostrilY = nostrilProfile.mouthY
      + nostrilProfile.h * Math.sqrt(Math.max(0, 1 - Math.pow(nostrilX / nostrilProfile.w, 2)))
      + 0.003;
    for (const side of [-1, 1]) {
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(0.014, 7, 5), this.orangeDarkMaterial);
      nostril.scale.set(1.5, 0.3, 0.65);
      nostril.position.set(side * nostrilX, nostrilY, nostrilProfile.z - 0.26);
      this.headGroup.add(nostril);
    }

    // Sunglasses — black teardrops with a thin gold rim.
    for (const side of [-1, 1]) {
      const lensGroup = new THREE.Group();
      lensGroup.position.set(side * 0.145, 0.13, -0.432);
      lensGroup.rotation.y = side * 0.58;
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.108, 24), this.lensMaterial);
      lens.scale.set(1.34, 0.86, 1);
      lens.rotation.y = Math.PI;
      lensGroup.add(lens);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.108, 0.011, 4, 24), this.goldMaterial);
      rim.scale.set(1.34, 0.86, 1);
      rim.rotation.y = Math.PI;
      lensGroup.add(rim);
      const glint = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.025), new THREE.MeshBasicMaterial({ color: '#b5e0dd', transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
      glint.position.set(0.014, 0.036, 0.004);
      glint.rotation.z = -0.55;
      glint.rotation.y = Math.PI;
      lensGroup.add(glint);
      this.headGroup.add(lensGroup);
      // Wraparound side shield so the sunglasses read from the profile too.
      const sideLens = new THREE.Mesh(new THREE.CircleGeometry(0.082, 18), this.lensMaterial);
      sideLens.scale.set(1.0, 0.78, 1);
      sideLens.position.set(side * 0.235, 0.125, -0.315);
      sideLens.rotation.y = side * Math.PI * 0.5;
      this.headGroup.add(sideLens);
      const sideRim = new THREE.Mesh(new THREE.TorusGeometry(0.082, 0.007, 4, 18), this.goldMaterial);
      sideRim.scale.set(1.0, 0.78, 1);
      sideRim.position.copy(sideLens.position);
      sideRim.rotation.y = side * Math.PI * 0.5;
      this.headGroup.add(sideRim);
      const temple = cylinderBetween(
        new THREE.Vector3(side * 0.235, 0.16, -0.35),
        new THREE.Vector3(side * 0.285, 0.23, -0.01),
        0.011,
        this.darkRubber,
        5
      );
      this.headGroup.add(temple);
      const templeGold = cylinderBetween(
        new THREE.Vector3(side * 0.255, 0.17, -0.18),
        new THREE.Vector3(side * 0.283, 0.215, -0.01),
        0.005,
        this.goldMaterial,
        4
      );
      this.headGroup.add(templeGold);
    }
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6), this.goldMaterial);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.15, -0.462);
    this.headGroup.add(bridge);

    // Helmet: cream shell, sea-glass stripe, small vents, strap and brim.
    const helmetGeo = new THREE.SphereGeometry(0.325, 26, 16, 0, TAU, 0, Math.PI * 0.52);
    const helmet = new THREE.Mesh(helmetGeo, this.helmetMaterial);
    helmet.scale.set(1.04, 0.92, 1.15);
    helmet.position.set(0, 0.16, -0.11);
    helmet.castShadow = true;
    this.headGroup.add(helmet);
    this.helmet = helmet;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.326, 0.022, 5, 30), this.helmetAccent);
    rim.rotation.x = Math.PI / 2;
    rim.scale.set(1.04, 1.15, 1);
    rim.position.set(0, 0.163, -0.11);
    this.headGroup.add(rim);
    const stripePoints = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const z = lerp(-0.39, 0.21, t);
      const y = 0.163 + Math.sqrt(Math.max(0, 1 - Math.pow((z + 0.11) / 0.37, 2))) * 0.292;
      stripePoints.push(new THREE.Vector3(0, y + 0.006, z));
    }
    this.headGroup.add(tubeFromCurve(stripePoints, 0.014, this.helmetAccent, 20, 5));
    for (const offset of [-0.034, 0.034]) {
      const pinstripePoints = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const z = lerp(-0.39, 0.21, t);
        const rx = 0.325 * 1.04;
        const ry = 0.325 * 0.92;
        const rz = 0.325 * 1.15;
        const y = 0.16 + Math.sqrt(Math.max(0, 1 - (offset * offset) / (rx * rx) - Math.pow((z + 0.11) / rz, 2))) * ry + 0.004;
        pinstripePoints.push(new THREE.Vector3(offset, y, z));
      }
      this.headGroup.add(tubeFromCurve(pinstripePoints, 0.0045, this.goldMaterial, 20, 4));
    }
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.026, 0.15), this.helmetAccent);
    brim.rotation.x = -0.2;
    brim.position.set(0, 0.235, -0.355);
    brim.castShadow = true;
    this.headGroup.add(brim);
    for (const side of [-1, 1]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.14), this.darkRubber);
      vent.position.set(side * 0.12, 0.43, -0.02);
      vent.rotation.z = side * 0.2;
      this.headGroup.add(vent);
    }
    this.headGroup.add(tubeFromCurve([
      new THREE.Vector3(-0.245, 0.17, -0.14),
      new THREE.Vector3(-0.22, 0.035, -0.18),
      new THREE.Vector3(-0.14, -0.11, -0.2),
      new THREE.Vector3(0, -0.175, -0.2),
      new THREE.Vector3(0.14, -0.11, -0.2),
      new THREE.Vector3(0.22, 0.035, -0.18),
      new THREE.Vector3(0.245, 0.17, -0.14),
    ], 0.008, this.helmetAccent, 30, 4));
    const chinBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.016), this.goldMaterial);
    chinBuckle.position.set(0, -0.177, -0.205);
    this.headGroup.add(chinBuckle);
    const helmetBadge = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16), this.goldMaterial);
    helmetBadge.position.set(0, 0.34, -0.39);
    helmetBadge.rotation.x = -0.35;
    this.headGroup.add(helmetBadge);

    // A jaunty coral-tipped plume tucked into the back of the helmet.
    const helmetPlumeGeo = makeFeatherGeometry('#c2594a', 0.56);
    const helmetPlume = new THREE.Mesh(helmetPlumeGeo, this.featherVertexMaterial);
    helmetPlume.scale.set(0.11, 0.42, 0.23);
    helmetPlume.position.set(0.075, 0.28, 0.2);
    helmetPlume.rotation.set(0.72, 2.55, 0.2);
    helmetPlume.castShadow = true;
    this.headGroup.add(helmetPlume);
    const plumeBead = new THREE.Mesh(new THREE.SphereGeometry(0.016, 7, 5), this.goldMaterial);
    plumeBead.position.set(0.075, 0.265, 0.19);
    this.headGroup.add(plumeBead);

    // A small coral flower tucked into the left side of the helmet.
    const flower = new THREE.Group();
    flower.position.set(-0.302, 0.282, -0.16);
    flower.rotation.set(0.12, -Math.PI / 2, 0.22);
    const petalGeo = new THREE.SphereGeometry(0.034, 7, 5);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      const petal = new THREE.Mesh(petalGeo, this.coralMaterial);
      petal.scale.set(0.72, 1.2, 0.28);
      petal.position.set(Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0.002);
      petal.rotation.z = a - Math.PI / 2;
      flower.add(petal);
    }
    const flowerCenter = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), this.goldMaterial);
    flowerCenter.position.z = 0.012;
    flower.add(flowerCenter);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.035, 7, 5), this.helmetAccent);
      leaf.scale.set(0.9, 0.25, 0.16);
      leaf.position.set(side * 0.025, -0.055, -0.002);
      leaf.rotation.z = side * 0.8;
      flower.add(leaf);
    }
    this.headGroup.add(flower);
    // Helmet rear flasher.
    const flasher = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshStandardMaterial({ color: '#4f120e', emissive: '#ff3f2a', emissiveIntensity: 1.1 }));
    flasher.position.set(0, 0.22, 0.235);
    this.headGroup.add(flasher);
    this.helmetFlasher = flasher;

    // Eye pivot for the pelican POV camera.
    this.eyePivot = new THREE.Object3D();
    this.eyePivot.position.set(0, 0.17, -0.27);
    this.eyePivot.rotation.x = -0.06;
    this.headGroup.add(this.eyePivot);

    // Neck scarf ring + knot.
    this.scarfBandMaterial = new THREE.MeshPhysicalMaterial({ color: '#b72732', roughness: 0.88, sheen: 0.5, sheenColor: new THREE.Color('#ff8e7b'), sheenRoughness: 0.65 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.212, 0.056, 8, 28), this.scarfBandMaterial);
    band.rotation.x = Math.PI / 2;
    band.rotation.z = 0.06;
    band.scale.set(1.12, 1.0, 0.92);
    band.position.set(0, 2.53, -0.29);
    band.castShadow = true;
    g.add(band);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 9), this.scarfBandMaterial);
    knot.scale.set(0.86, 0.8, 0.72);
    knot.position.set(0.03, 2.51, -0.08);
    knot.castShadow = true;
    g.add(knot);
    const pin = new THREE.Mesh(new THREE.CircleGeometry(0.034, 12), this.goldMaterial);
    pin.position.set(0.055, 2.535, 0.005);
    pin.rotation.y = 0.3;
    g.add(pin);

    this.scarf = new ClothScarf(g, this.renderer);

    // Wings, built mirrored. A broad membrane gives the wing a silhouette
    // from the side; individual primaries add the black-tipped feather fan.
    const membraneGeo = makeWingMembraneGeometry();
    const featherGeo = makeFeatherGeometry('#17373b', 0.55);
    const featherMats = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.DoubleSide,
      color: '#ffffff',
    });
    const membraneMat = new THREE.MeshPhysicalMaterial({
      color: '#f7eedf',
      roughness: 0.86,
      metalness: 0,
      sheen: 0.45,
      sheenColor: new THREE.Color('#e5ddd1'),
      sheenRoughness: 0.8,
      side: THREE.DoubleSide,
    });
    const WING_REST = { x: 0.661, z: 1.54, rootX: -0.23, scale: 0.8, visualX: -0.9 };
    this._wingRest = WING_REST;
    for (const side of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(side * 0.31, 2.3, -0.03);
      wing.scale.x = side;
      wing.rotation.set(WING_REST.x, 0, -side * WING_REST.z);
      g.add(wing);
      const wingRoot = new THREE.Group();
      wingRoot.rotation.x = WING_REST.rootX;
      wingRoot.scale.setScalar(WING_REST.scale);
      wing.add(wingRoot);
      const wingVisual = new THREE.Group();
      wingVisual.rotation.x = WING_REST.visualX;
      wingRoot.add(wingVisual);

      // One continuous, gently tapered feathered arm instead of three
      // sausage-like capsules with visible elbow balls.
      const wingArm = new THREE.Mesh(makeWingArmGeometry(), this.armFeatherMaterial);
      wingArm.castShadow = true;
      wingVisual.add(wingArm);
      const shoulderGeo = makeFeatherGeometry('#e0cfb9', 0.82);
      const shoulderSpecs = [
        [0.045, 0.045, 0.015, -0.42, 0.12],
        [0.05, -0.025, 0.02, -0.12, -0.04],
        [0.055, 0.01, 0.07, -0.78, 0.06],
      ];
      for (const [x, y, z, ry, rz] of shoulderSpecs) {
        const feather = new THREE.Mesh(shoulderGeo, this.featherVertexMaterial);
        feather.scale.set(0.31, 0.95, 0.95);
        feather.position.set(x, y, z);
        feather.rotation.set(0.03, ry, rz);
        feather.castShadow = true;
        wingVisual.add(feather);
      }
      const outerCovertGeo = makeFeatherGeometry('#e4d3bd', 0.82);
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const feather = new THREE.Mesh(outerCovertGeo, this.featherVertexMaterial);
        feather.scale.set(0.24 + Math.sin(t * Math.PI) * 0.045, 0.8, 0.76);
        feather.position.set(0.1 + t * 0.68, -(0.088 - t * 0.043), 0.015 + t * 0.012);
        feather.rotation.set(0.08, -0.18 - t * 0.12, -0.08 + t * 0.16);
        feather.castShadow = true;
        wingVisual.add(feather);
      }
      const topCovertGeo = makeFeatherGeometry('#e7d7c1', 0.84);
      for (let i = 0; i < 4; i++) {

        const t = i / 3;
        const feather = new THREE.Mesh(topCovertGeo, this.featherVertexMaterial);
        feather.scale.set(0.21 + t * 0.025, 0.72, 0.66);
        feather.position.set(0.18 + t * 0.5, 0.045 - t * 0.02, -0.005 + t * 0.02);
        feather.rotation.set(0.02, -0.22 - t * 0.2, 0.08 + t * 0.12);
        feather.castShadow = true;
        wingVisual.add(feather);
      }

      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const feather = new THREE.Mesh(featherGeo, featherMats);
        const length = 0.58 + 0.34 * Math.sin(t * Math.PI);
        feather.scale.set(length, 0.9, 1.05 - t * 0.16);
        feather.position.set(0.53 + t * 0.12, -0.075 - t * 0.03, 0.06 + t * 0.035);
        feather.rotation.y = -0.3 - t * 1.02;
        feather.rotation.z = -0.1 - t * 0.12;
        feather.rotation.x = (t - 0.5) * 0.08;
        feather.castShadow = true;
        wingVisual.add(feather);
      }
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const feather = new THREE.Mesh(featherGeo, featherMats);
        feather.scale.set(0.33 + t * 0.12, 0.62, 0.8);
        feather.position.set(0.29 + t * 0.075, -0.1, 0.11 + t * 0.02);
        feather.rotation.y = -0.78 - t * 0.34;
        feather.rotation.z = -0.2 + t * 0.08;
        feather.castShadow = true;
        wingVisual.add(feather);
      }
      const covertGeo = makeFeatherGeometry('#ccbca6', 0.8);
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const feather = new THREE.Mesh(covertGeo, this.featherVertexMaterial);
        feather.scale.set(0.24 + t * 0.13, 0.72, 0.66);
        feather.position.set(0.33 + t * 0.11, -0.035, 0.105 + t * 0.03);
        feather.rotation.set(0.06, -0.62 - t * 0.28, -0.24 - t * 0.05);
        feather.castShadow = true;
        wingVisual.add(feather);
      }
      this.wings.push({ side, group: wing, root: wingRoot, visual: wingVisual, flapPhase: side > 0 ? 0 : 1.7 });
    }

    this._buildWingHands();

    this.bodyGroup = g;
    this.scarf.anchorObject = this.bodyGroup;
  }

  _buildWingHands() {
    const handMat = this.featherMaterial.clone();
    handMat.color.set('#fff8e9');
    handMat.side = THREE.DoubleSide;
    handMat.roughness = 0.9;
    const nailMat = new THREE.MeshStandardMaterial({
      color: '#1a2228',
      roughness: 0.44,
      metalness: 0.08,
      side: THREE.DoubleSide,
    });
    const fingerCurves = [
      [
        [0, 0.064, 0.02], [0, 0.075, -0.02], [0, 0.05, -0.062],
        [0, 0.005, -0.078], [0, -0.034, -0.05],
      ],
      [
        [0, 0.07, 0.035], [0, 0.083, -0.005], [0, 0.06, -0.052],
        [0, 0.012, -0.072], [0, -0.025, -0.06],
      ],
      [
        [0, 0.058, 0.045], [0, 0.07, 0.005], [0, 0.052, -0.035],
        [0, 0.008, -0.056], [0, -0.02, -0.048],
      ],
      [
        [0, 0.042, 0.05], [0, 0.055, 0.06], [0, 0.015, 0.077],
        [0, -0.022, 0.055],
      ],
    ];
    for (const wing of this.wings) {
      const side = wing.side;
      const hand = new THREE.Group();
      hand.name = side > 0 ? 'right-wing-hand' : 'left-wing-hand';
      hand.position.set(side * 0.34, 1.548, -0.615);

      const palm = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 9), handMat);
      palm.scale.set(1.1, 0.64, 0.86);
      palm.position.set(0, 0.04, 0.012);
      palm.castShadow = true;
      hand.add(palm);

      // Four feathered fingers curl around the leather grip.
      fingerCurves.forEach((points, index) => {
        const offset = (index - 1.5) * 0.031;
        const curve = new THREE.CatmullRomCurve3(
          points.map(([x, y, z]) => new THREE.Vector3(x + offset, y, z))
        );
        const finger = new THREE.Mesh(
          new THREE.TubeGeometry(curve, 8, index === 3 ? 0.0125 : 0.0145, 5, false),
          handMat
        );
        finger.castShadow = true;
        hand.add(finger);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(index === 3 ? 0.014 : 0.016, 6, 5), nailMat);
        const last = points[points.length - 1];
        tip.position.set(last[0] + offset, last[1], last[2]);
        hand.add(tip);
      });

      // Two small wrist feathers bridge the wing tip and the bars.
      const wristTuftGeo = makeFeatherGeometry('#ddcdb8', 0.82);
      for (let i = 0; i < 2; i++) {
        const wristFeather = new THREE.Mesh(wristTuftGeo, this.featherVertexMaterial);
        wristFeather.scale.set(0.2 + i * 0.025, 0.34, 0.3);
        wristFeather.position.set(side * (0.035 + i * 0.025), 0.07 - i * 0.008, 0.035 + i * 0.018);
        wristFeather.rotation.set(0.45 + i * 0.12, Math.PI + side * (0.55 + i * 0.18), -0.22 * side);
        wristFeather.castShadow = true;
        hand.add(wristFeather);
      }

      this.model.add(hand);
      this.root.updateMatrixWorld(true);
      wing.root.attach(hand);
      wing.hand = hand;
      hand.userData.baseScale = hand.scale.clone();
      hand.userData.restRootScale = this._wingRest.scale;
      this.wingHands.push(hand);
    }
  }

  _buildBasketFish() {
    this.basketFishGroup = new THREE.Group();
    this.basketFishGroup.position.set(0, 0.01, 0);
    this.basketGroup.add(this.basketFishGroup);
  }

  _buildHeadlight() {
    const headlight = new THREE.Group();
    headlight.position.set(0, 1.37, -0.985);
    this.model.add(headlight);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.12, 12), this.chromeMaterial);
    housing.rotation.x = Math.PI / 2;
    headlight.add(housing);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.07, 16), new THREE.MeshStandardMaterial({ color: '#ffe7b0', emissive: '#ffbe73', emissiveIntensity: 0.15, roughness: 0.25 }));
    lens.position.z = -0.065;
    lens.rotation.y = Math.PI;
    headlight.add(lens);
    this.headlightLens = lens;
    const glowTex = makeGlowTexture();
    this.headlightGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffd69b', transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.headlightGlow.scale.set(1.1, 1.1, 1);
    this.headlightGlow.position.z = -0.1;
    headlight.add(this.headlightGlow);
    this.headlightGroup = headlight;

    this.headlight = new THREE.SpotLight('#ffc27f', 0, 28, Math.PI * 0.17, 0.68, 1.2);
    this.headlight.position.set(0, 1.37, -0.95);
    this.headlight.castShadow = false;
    this.headlightTarget = new THREE.Object3D();
    this.headlightTarget.position.set(0, 0.05, -13);
    this.model.add(this.headlightTarget);
    this.headlight.target = this.headlightTarget;
    this.model.add(this.headlight);

    // Tiny rear reflector glow (not a light, just an emissive sprite).
    this.tailGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff6040', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.tailGlow.scale.set(0.35, 0.35, 1);
    this.tailGlow.position.set(0, 1.18, 0.92);
    this.model.add(this.tailGlow);
  }

  _buildContactShadow() {
    const tex = makeShadowTexture();
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.4, depthWrite: false, color: '#000000', side: THREE.DoubleSide });
    this.contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 3.5), mat);
    this.contactShadow.rotation.x = -Math.PI / 2;
    this.contactShadow.position.set(0, ROAD.y + 0.018, 0);
    this.contactShadow.renderOrder = 2;
    this.scene.add(this.contactShadow);
  }

  _setCameraMode(mode) {
    this.cameraMode = mode;
    this.headGroup.visible = mode !== 'pov';
    // When the head is hidden for the pelican POV, the neck and scarf still
    // ground the camera in a body; the camera's own beak prop fills the frame.
    this.bikeRoot.visible = true;
  }

  setCameraMode(mode) {
    this._setCameraMode(mode);
  }

  triggerCatch(type) {
    this.catchTimer = 0.64;
    this.catchPulse = 1;
    this.pouchBulge = 1;
    this.basketFishCount = (this.basketFishCount || 0) + 1;
    this.addBasketFish(type);
    if (this.audioHook) this.audioHook(type);
  }

  triggerLand(strength = 1) {
    this.landPulse = clamp(strength, 0, 1.4);
  }

  resetBasket() {
    if (!this.basketFishGroup) return;
    for (const fish of this.basketFish) {
      this.basketFishGroup.remove(fish);
      fish.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    }
    this.basketFish.length = 0;
    this.basketFishCount = 0;
    this.pouchBulge = 0;
    this.catchTimer = 0;
  }

  addBasketFish(type = { id: 'silver' }) {
    if (!this.basketFishGroup) return;
    const colors = {
      silver: '#c5d6d8',
      golden: '#d4ad5d',
      moon: '#8fd5dd',
      big: '#9dafae',
    };
    const color = colors[type.id] || colors.silver;
    const fish = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 }));
    body.scale.set(1.65, 0.9, 0.68);
    fish.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.11, 3), new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.18, side: THREE.DoubleSide }));
    tail.rotation.x = Math.PI / 2;
    tail.rotation.z = Math.PI;
    tail.position.z = 0.16;
    fish.add(tail);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.009, 5, 4), this.darkRubber);
    eye.position.set(-0.07, 0.025, -0.045);
    fish.add(eye);
    const rand = seededRandom(Math.floor(Math.random() * 1000) + this.basketFishCount * 33);
    fish.position.set((rand() - 0.5) * 0.23, 0.07 + Math.min(0.13, this.basketFishCount * 0.018) + rand() * 0.03, (rand() - 0.5) * 0.15);
    fish.rotation.set(rand() * 0.8, rand() * TAU, rand() * 0.5 - 0.25);
    fish.scale.setScalar(0.8 + rand() * 0.25);
    this.basketFishGroup.add(fish);
    this.basketFish.push(fish);
    if (this.basketFish.length > 7) {
      const old = this.basketFish.shift();
      this.basketFishGroup.remove(old);
      old.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      });
    }
  }

  _updateLegs() {
    const crankY = 0.65;
    const crankZ = -0.03;
    const r = 0.19;
    for (const leg of this.legs) {
      const index = (leg.side + 1) / 2;
      const phase = this.crankAngle + (leg.side > 0 ? 0 : Math.PI);
      const foot = new THREE.Vector3(
        leg.side * 0.26,
        crankY + Math.cos(phase) * r + 0.06,
        crankZ - Math.sin(phase) * r - 0.025
      );
      this.pedalPositions[index].copy(foot);
      const knee = new THREE.Vector3();
      solveIK(leg.hip, foot, 0.7, 0.66, _v1.set(leg.side * 0.22, -0.12, -1), knee);
      setLimb(leg.thigh, leg.hip, knee);
      setLimb(leg.shin, knee, foot);
      leg.knee.position.copy(knee);
      leg.foot.position.copy(foot).addScaledVector(UP, 0.025);
      leg.foot.rotation.x = 0.04;
      leg.foot.rotation.y = leg.side * -0.08;
    }
    for (const pedal of this.pedalMeshes) {
      pedal.rotation.x = this.crankAngle;
    }
  }

  update(dt, state) {
    this.time += dt;
    const {
      speed = 0,
      cadence = 0,
      laneVelocity = 0,
      wheelie = 0,
      wingOut = 0,
      airborne = false,
      jumpY = 0,
      night = 0,
      pedaling = true,
      lookYaw = 0,
    } = state;

    // Position is owned by the game loop; the visual rig follows the ground.
    this.root.position.y = ROAD.y + jumpY;
    this.root.position.x = state.laneX ?? this.root.position.x;

    this.contactShadow.position.x = this.root.position.x;
    this.contactShadow.position.y = ROAD.y + 0.018;
    this.contactShadow.material.opacity = clamp(0.46 - jumpY * 0.15, 0.12, 0.46);
    this.contactShadow.scale.setScalar(1 + jumpY * 0.12);

    // Lean and wheelie transform.
    const lateralLean = clamp(-laneVelocity * 0.028, -0.18, 0.18);
    const idleSway = Math.sin(this.time * 0.9) * 0.008;
    this.leanGroup.rotation.z = damp(this.leanGroup.rotation.z, lateralLean + idleSway, 6, dt);
    this.leanGroup.rotation.y = damp(this.leanGroup.rotation.y, -laneVelocity * 0.008, 5, dt);
    const pitchTarget = wheelie * 0.27 + (airborne ? -0.04 : 0);
    this.pitchGroup.rotation.x = damp(this.pitchGroup.rotation.x, pitchTarget, 7.5, dt);

    this.wheelSpin -= speed / 0.58 * dt;
    this.frontWheel.rotation.x = this.wheelSpin;
    this.rearWheel.rotation.x = this.wheelSpin;
    if (pedaling && speed > 0.1) {
      this.crankAngle += cadence / 60 * TAU * dt;
    }
    this.crankGroup.rotation.x = -this.crankAngle;
    this._updateLegs();

    // Body bounce, breathing, catch recoil.
    if (this.landPulse > 0) this.landPulse = Math.max(0, this.landPulse - dt * 4.2);
    if (this.catchTimer > 0) this.catchTimer = Math.max(0, this.catchTimer - dt);
    const bob = Math.sin(this.crankAngle * 2) * 0.012 * clamp(speed / 7, 0, 1);
    const breath = Math.sin(this.time * 1.8) * 0.006;
    const landSquash = -this.landPulse * 0.035;
    this.bodyGroup.position.y = bob + breath + landSquash;
    this.bodyGroup.rotation.z = damp(this.bodyGroup.rotation.z, -laneVelocity * 0.018 + Math.sin(this.crankAngle) * 0.01, 5, dt);
    this.bodyGroup.rotation.x = damp(this.bodyGroup.rotation.x, -wheelie * 0.04 + (airborne ? 0.04 : 0), 4, dt);

    // Head gesture: gaze ahead, look at a fish when one is close, stay lively.
    const lookTargetYaw = clamp(lookYaw, -0.55, 0.55) + Math.sin(this.time * 0.7) * 0.025;
    const lookTargetPitch = -0.06 + clamp(speed / 60, 0, 0.06) + (wheelie > 0.3 ? 0.06 : 0) - (airborne ? 0.02 : 0);
    this.headLookYaw = damp(this.headLookYaw, lookTargetYaw, 4.5, dt);
    this.headLookPitch = damp(this.headLookPitch, lookTargetPitch + Math.sin(this.time * 1.1) * 0.01, 4, dt);
    this.headGroup.rotation.y = this.headLookYaw;
    this.headGroup.rotation.x = this.headLookPitch;
    this.headGroup.rotation.z = Math.sin(this.time * 1.3) * 0.014 - laneVelocity * 0.012;

    // In normal riding both wingtips hold the bars. For T the arms open from
    // the shoulders and the flight feathers fan wide; the hands shrink into
    // the wingtips so the gesture reads as a real release.
    const catchFlap = this.catchTimer > 0 ? Math.sin((1 - this.catchTimer / 0.64) * Math.PI) * 0.22 : 0;
    const WING_REST = this._wingRest;
    const idleFlutter = Math.sin(this.time * 3.1) * 0.008;
    for (const wing of this.wings) {
      const side = wing.side;
      const spreadTarget = clamp(wingOut + catchFlap, 0, 1);
      const restZ = -side * WING_REST.z;
      const targetZ = lerp(restZ, side * 0.14, spreadTarget);
      const targetX = lerp(WING_REST.x, -0.06, spreadTarget);
      const targetY = lerp(0, -side * 0.08, spreadTarget);
      const flap = Math.sin(this.time * (7.5 + speed * 0.2) + wing.flapPhase) * (spreadTarget * 0.14 + wheelie * 0.1);
      wing.group.rotation.z = damp(wing.group.rotation.z, targetZ + side * flap, 6, dt);
      wing.group.rotation.y = damp(wing.group.rotation.y, targetY, 5, dt);
      wing.group.rotation.x = damp(wing.group.rotation.x, targetX, 4, dt);
      wing.root.rotation.x = damp(wing.root.rotation.x, lerp(WING_REST.rootX, -0.045, spreadTarget), 5, dt);
      wing.visual.rotation.x = damp(
        wing.visual.rotation.x,
        lerp(WING_REST.visualX, -0.02, spreadTarget) + idleFlutter * (1 - spreadTarget),
        6,
        dt
      );
      const scale = lerp(WING_REST.scale, 1.0, spreadTarget);
      wing.root.scale.setScalar(scale);
      if (wing.hand) {
        wing.hand.scale.copy(wing.hand.userData.baseScale).multiplyScalar(
          (WING_REST.scale / scale) * (1 - spreadTarget * 0.58)
        );
      }
    }

    // Catch animation: a small head dip and pouch swell.
    this.catchPulse = Math.max(0, this.catchPulse - dt * 2.4);
    this.pouchBulge = damp(this.pouchBulge, 0, 1.4, dt);
    const catchSquash = this.catchTimer > 0 ? Math.sin((1 - this.catchTimer / 0.64) * Math.PI) : 0;
    this.pouch.scale.set(
      1 + this.pouchBulge * 0.12,
      1 + this.pouchBulge * 0.18 - catchSquash * 0.03,
      1
    );
    this.headGroup.position.y = 2.8 + Math.sin(this.crankAngle * 2 + 0.5) * 0.009 - catchSquash * 0.035;

    // Pouch and head shake when a fish is caught.
    this.pouch.rotation.z = Math.sin(this.time * 20) * 0.02 * this.catchPulse;

    // Scarf: speed, lateral acceleration and a little lift.
    this.scarf.update(dt, {
      speed,
      turnVel: laneVelocity,
      airborne,
      windBoost: wingOut * 0.4 + this.catchPulse * 0.2,
    });

    // Handlebar counter-steer and front wheel yaw.
    const steer = clamp(laneVelocity * 0.05, -0.2, 0.2);
    this.handlebarGroup.rotation.y = damp(this.handlebarGroup.rotation.y, steer * 0.75, 6, dt);
    this.frontWheelHolder.rotation.y = damp(this.frontWheelHolder.rotation.y, steer, 6, dt);

    // Night hardware.
    const lampIntensity = smoothstep(0.12, 0.5, night);
    this.headlight.intensity = lampIntensity * 8.5;
    this.headlightLens.material.emissiveIntensity = 0.2 + lampIntensity * 3.5;
    this.headlightGlow.material.opacity = lampIntensity * 0.75 * (0.9 + Math.sin(this.time * 5.3) * 0.06);
    this.tailGlow.material.opacity = lampIntensity * 0.55;
    this.tailLamp.material.emissiveIntensity = 0.7 + lampIntensity * 2.6;
    this.helmetFlasher.material.emissiveIntensity = (0.6 + lampIntensity * 3.3) * (0.5 + 0.5 * Math.sign(Math.sin(this.time * 3.7)));

    // Let reflected light from the bike climb with the scene when night falls.
    this.root.updateMatrixWorld(true);
  }

  getCameraAnchor(out, cameraMode = 'chase') {
    if (cameraMode === 'pov') this.eyePivot.getWorldPosition(out);
    else {
      out.copy(this.root.position);
      out.y += 1.82 + (this.pitchGroup.rotation.x * 0.75);
      out.z += 0.02;
    }
    return out;
  }

  getEyeWorldPosition(out) {
    this.eyePivot.getWorldPosition(out);
    return out;
  }

  getEyeWorldQuaternion(out) {
    this.eyePivot.getWorldQuaternion(out);
    return out;
  }

  getHeadWorldPosition(out) {
    this.headGroup.getWorldPosition(out);
    return out;
  }

  isHeadHidden() {
    return !this.headGroup.visible;
  }
}
