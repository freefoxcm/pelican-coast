import * as THREE from 'three';
import { clamp, damp, lerp, seededRandom, smoothstep, TAU } from './utils.js';
import { ROAD } from './config.js';

const CHUNK_LENGTH = 320;
const CHUNK_COUNT = 5;
const CHUNK_WRAP = CHUNK_LENGTH * CHUNK_COUNT;
const CHUNK_START = -((CHUNK_COUNT - 1) / 2) * CHUNK_LENGTH;
const PROP_RANGE = 960;
const PROP_HALF = PROP_RANGE / 2;

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

function makeCanvasTexture(w, h, draw, colorSpace = THREE.SRGBColorSpace) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = colorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function makeAsphaltTexture() {
  const rand = seededRandom(431);
  const tex = makeCanvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#414a4b';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const shade = 33 + Math.floor(rand() * 48);
      ctx.fillStyle = `rgba(${shade},${shade + 3},${shade + 3},${0.08 + rand() * 0.12})`;
      const size = rand() > 0.95 ? 2 : 1;
      ctx.fillRect(rand() * w, rand() * h, size, size);
    }
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = `rgba(13,19,20,${0.12 + rand() * 0.15})`;
      ctx.lineWidth = 0.7 + rand();
      ctx.beginPath();
      let x = rand() * w;
      let y = rand() * h;
      ctx.moveTo(x, y);
      for (let j = 0; j < 6; j++) {
        x += (rand() - 0.5) * 46;
        y += 12 + rand() * 26;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Subtle tyre-polished bands.
    for (const x of [92, 256, 420]) {
      const grad = ctx.createLinearGradient(x - 70, 0, x + 70, 0);
      grad.addColorStop(0, 'rgba(160,158,145,0)');
      grad.addColorStop(0.5, 'rgba(160,158,145,.045)');
      grad.addColorStop(1, 'rgba(160,158,145,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
    const sandWash = ctx.createLinearGradient(0, 0, w, 0);
    sandWash.addColorStop(0, 'rgba(175,150,112,.08)');
    sandWash.addColorStop(0.05, 'rgba(175,150,112,0)');
    sandWash.addColorStop(0.95, 'rgba(175,150,112,0)');
    sandWash.addColorStop(1, 'rgba(175,150,112,.08)');
    ctx.fillStyle = sandWash;
    ctx.fillRect(0, 0, w, h);
  });
  tex.repeat.set(2, 156);
  return tex;
}

function makeDashTexture() {
  const tex = makeCanvasTexture(64, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, 'rgba(244,235,214,0)');
    grad.addColorStop(0.25, 'rgba(244,235,214,.92)');
    grad.addColorStop(0.75, 'rgba(244,235,214,.92)');
    grad.addColorStop(1, 'rgba(244,235,214,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(19, 58, 26, 106);
    ctx.fillStyle = 'rgba(255,255,255,.25)';
    ctx.fillRect(23, 71, 5, 78);
  });
  tex.repeat.set(1, 200);
  return tex;
}

function makeSandTexture() {
  const rand = seededRandom(882);
  const tex = makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#c9c1b1';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 4500; i++) {
      const v = 145 + Math.floor(rand() * 78);
      ctx.fillStyle = `rgba(${v},${v - 4},${v - 13},${0.12 + rand() * 0.2})`;
      const r = rand() > 0.96 ? 2 : 1;
      ctx.fillRect(rand() * w, rand() * h, r, r);
    }
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = `rgba(98,90,77,${0.05 + rand() * 0.06})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (let x = 0; x < w; x += 5) {
        const y = 30 + i * 12 + Math.sin(x * 0.06 + i) * 4 + rand() * 2;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
  return tex;
}

function makeGroundDetailTexture() {
  const rand = seededRandom(109);
  return makeCanvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#b4ac9c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const v = 94 + Math.floor(rand() * 105);
      ctx.fillStyle = `rgba(${v},${v - 2},${v - 10},${0.08 + rand() * 0.15})`;
      ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 1 + rand() * 2);
    }
  });
}

function makeSignTexture(kind = 0) {
  return makeCanvasTexture(1024, 512, (ctx, w, h) => {
    if (kind === 0) {
      ctx.fillStyle = '#183d3d';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#e7d4b5';
      ctx.lineWidth = 14;
      ctx.strokeRect(24, 24, w - 48, h - 48);
      ctx.strokeStyle = 'rgba(231,212,181,.45)';
      ctx.lineWidth = 3;
      ctx.strokeRect(44, 44, w - 88, h - 88);
      ctx.fillStyle = '#f1e3ca';
      ctx.font = '500 96px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('海岸公路', 95, 182);
      ctx.font = '600 34px Consolas, monospace';
      ctx.fillStyle = '#9ec2ba';
      ctx.letterSpacing = '7px';
      ctx.fillText('COASTAL ROUTE 07', 100, 244);
      ctx.strokeStyle = '#e0ba7c';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(100, 292);
      ctx.lineTo(760, 292);
      ctx.stroke();
      ctx.font = '400 30px Georgia, serif';
      ctx.fillStyle = 'rgba(231,212,181,.7)';
      ctx.fillText('DUSK · SALT · ONE MORE FISH', 100, 348);
      // Fish glyph.
      ctx.save();
      ctx.translate(805, 180);
      ctx.strokeStyle = '#d77b5d';
      ctx.fillStyle = 'rgba(215,123,93,.15)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-100, 0);
      ctx.quadraticCurveTo(-20, -74, 78, 0);
      ctx.quadraticCurveTo(-20, 74, -100, 0);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(70, 0);
      ctx.lineTo(146, -60);
      ctx.lineTo(128, 0);
      ctx.lineTo(146, 60);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-56, -11, 8, 0, TAU);
      ctx.fillStyle = '#183d3d';
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = '#e6c477';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#1b3738';
      ctx.lineWidth = 20;
      ctx.strokeRect(22, 22, w - 44, h - 44);
      ctx.fillStyle = '#183435';
      ctx.textAlign = 'center';
      ctx.font = '600 118px "Microsoft YaHei", "PingFang SC", sans-serif';
      ctx.fillText('小心飞鱼', w / 2, 205);
      ctx.font = '700 44px Consolas, monospace';
      ctx.fillText('FISH CROSSING', w / 2, 279);
      ctx.strokeStyle = '#193536';
      ctx.lineWidth = 13;
      ctx.beginPath();
      ctx.moveTo(240, 384);
      ctx.quadraticCurveTo(430, 316, 650, 370);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(660, 362);
      ctx.lineTo(742, 338);
      ctx.lineTo(694, 408);
      ctx.closePath();
      ctx.fillStyle = '#193536';
      ctx.fill();
      ctx.font = '400 27px Georgia, serif';
      ctx.fillStyle = 'rgba(24,52,53,.75)';
      ctx.fillText('慢一点，鱼会自己跳上来', w / 2, 448);
    }
  });
}

function makeFoamPointTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,.95)');
  g.addColorStop(0.32, 'rgba(236,250,244,.52)');
  g.addColorStop(1, 'rgba(236,250,244,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeLightPoolTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 3, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,213,146,.8)');
  g.addColorStop(0.35, 'rgba(255,187,105,.28)');
  g.addColorStop(1, 'rgba(255,169,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeFireflyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,252,220,1)');
  g.addColorStop(0.25, 'rgba(255,227,144,.9)');
  g.addColorStop(0.7, 'rgba(255,190,95,.16)');
  g.addColorStop(1, 'rgba(255,175,70,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The coast's repeating surface is periodic in z, so props can ride it forever. */
export function beachHeight(x, z) {
  const slope = smoothstep(8.4, 19, x);
  let y = ROAD.y + 0.02 - 4.36 * slope;
  const wobble = Math.sin(z * TAU / 160 + 0.4) * 0.19 + Math.sin(z * TAU / 80 + 1.7) * 0.065;
  const envelope = Math.sin(Math.PI * clamp((x - 8) / 14, 0, 1));
  y += wobble * envelope * 0.9;
  y += Math.sin(x * 0.54 + z * TAU / 320) * 0.032;
  y -= smoothstep(19, 72, x) * (1.4 + Math.sin(z * TAU / 160 + 1.2) * 0.25);
  y -= smoothstep(42, 110, x) * 1.0;
  return y;
}

export function cliffHeight(x, z) {
  const d = Math.max(0, -x - 6);
  const bank = Math.pow(smoothstep(6, 48, d), 1.12) * 8.8;
  const ridge = smoothstep(38, 170, d) * 24;
  let y = ROAD.y + 0.02 + bank + ridge;
  y += Math.sin(x * 0.075 + z * TAU / 320 + 0.2) * 2.25 * smoothstep(10, 70, d);
  y += Math.sin(x * 0.031 - z * TAU / 160 + 1.6) * 1.45 * smoothstep(22, 110, d);
  y += Math.sin(z * TAU / 320 + 2.1) * 0.62 * smoothstep(4, 44, d);
  y += Math.sin(x * 0.33 + z * TAU / 80 + 0.7) * 0.24 * smoothstep(4, 30, d);
  return y;
}

function localZForStart(z) {
  const wrapped = z % CHUNK_LENGTH;
  return wrapped < -CHUNK_LENGTH / 2 ? wrapped + CHUNK_LENGTH : wrapped >= CHUNK_LENGTH / 2 ? wrapped - CHUNK_LENGTH : wrapped;
}

function buildTerrainGeometry(xStart, xEnd, xSegments, heightFn, colorFn) {
  const zSegments = 72;
  const positions = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  for (let iz = 0; iz <= zSegments; iz++) {
    const z = -CHUNK_LENGTH / 2 + (iz / zSegments) * CHUNK_LENGTH;
    for (let ix = 0; ix <= xSegments; ix++) {
      const x = lerp(xStart, xEnd, ix / xSegments);
      const y = heightFn(x, z);
      positions.push(x, y, z);
      uvs.push(x / 7.5, z / 7.5);
      const c = colorFn(x, y, z);
      colors.push(c.r, c.g, c.b);
    }
  }
  for (let iz = 0; iz < zSegments; iz++) {
    for (let ix = 0; ix < xSegments; ix++) {
      const a = iz * (xSegments + 1) + ix;
      const b = a + 1;
      const c = a + xSegments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function makeBladeGeometry() {
  const positions = [];
  const colors = [];
  for (let b = 0; b < 5; b++) {
    const angle = (b / 5) * TAU + 0.4;
    const dx = Math.cos(angle) * 0.32;
    const dz = Math.sin(angle) * 0.32;
    const h = 0.55 + (b % 3) * 0.2;
    const width = 0.055;
    positions.push(-dz * width, 0, dx * width);
    positions.push(dz * width, 0, -dx * width);
    positions.push(dx * 0.35, h, dz * 0.35);
    const bottom = 0.34 + (b % 2) * 0.08;
    colors.push(bottom * 0.65, bottom, bottom * 0.45, bottom * 0.65, bottom, bottom * 0.45, 0.75, 0.78, 0.45);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geo;
}

function makeRockGeometry() {
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const positions = geo.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    positions.setXYZ(
      i,
      positions.getX(i) * (0.75 + ((i * 17) % 9) * 0.028),
      positions.getY(i) * (0.56 + ((i * 13) % 7) * 0.025),
      positions.getZ(i) * (0.82 + ((i * 11) % 5) * 0.035)
    );
  }
  geo.computeVertexNormals();
  return geo;
}

function makeSignBoard(scene, texture, z, kind) {
  const group = new THREE.Group();
  const boardMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
  const board = new THREE.Mesh(new THREE.BoxGeometry(2.65, 1.32, 0.08), boardMat);
  board.position.set(0, 2.45, 0);
  board.castShadow = false;
  group.add(board);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.78, 1.45, 0.055), new THREE.MeshStandardMaterial({ color: '#2a4845', roughness: 0.5, metalness: 0.5 }));
  trim.position.set(0, 2.45, -0.025);
  group.add(trim);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 2.25, 7), new THREE.MeshStandardMaterial({ color: '#4c5c55', roughness: 0.5, metalness: 0.65 }));
    post.position.set(side * 0.95, 1.13, 0.05);
    group.add(post);
  }
  group.position.set(9.1, 3.72, z);
  group.rotation.y = kind === 0 ? -0.04 : 0.03;
  scene.add(group);
  return group;
}

function makeBird() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.06, 0.22, 3, 6),
    new THREE.MeshStandardMaterial({ color: '#e9ddc7', roughness: 0.8 })
  );
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const wingMat = new THREE.MeshStandardMaterial({ color: '#d8ccb6', roughness: 0.75, side: THREE.DoubleSide });
  for (const side of [-1, 1]) {
    const wingGroup = new THREE.Group();
    wingGroup.position.x = side * 0.04;
    const shape = new THREE.BufferGeometry();
    shape.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, -0.03,
      side * 0.55, 0.07, 0.05,
      side * 0.08, 0, 0.19,
    ], 3));
    shape.computeVertexNormals();
    const wing = new THREE.Mesh(shape, wingMat);
    wingGroup.add(wing);
    group.add(wingGroup);
    group.userData[side > 0 ? 'rightWing' : 'leftWing'] = wingGroup;
  }
  return group;
}

export class CoastEnvironment {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 0;
    this.distance = 0;
    this.speed = 0;
    this.quality = 2;
    this.night = 0;
    this.fireflyTime = 0;
    this._lastSpeed = 0;

    this.asphaltTex = makeAsphaltTexture();
    this.dashTex = makeDashTexture();
    this.sandTex = makeSandTexture();
    this.groundTex = makeGroundDetailTexture();
    this.fireflyTex = makeFireflyTexture();
    this.lightPoolTex = makeLightPoolTexture();

    this._buildRoad();
    this._buildBeach();
    this._buildCliffs();
    this._buildGuardRail();
    this._buildLamps();
    this._buildSigns();
    this._buildRocks();
    this._buildGrass();
    this._buildTrees();
    this._buildLighthouse();
    this._buildBoats();
    this._buildBirds();
    this._buildFireflies();
  }

  _buildRoad() {
    const roadLength = 1600;
    const roadCenterZ = -380;
    const asphaltMaterial = new THREE.MeshStandardMaterial({
      map: this.asphaltTex,
      color: '#d2d9d4',
      roughness: 0.78,
      metalness: 0.03,
    });
    this.asphaltMaterial = asphaltMaterial;
    const roadGeo = new THREE.PlaneGeometry(12, roadLength, 1, 1);
    roadGeo.rotateX(-Math.PI / 2);
    const road = new THREE.Mesh(roadGeo, asphaltMaterial);
    road.position.set(0, ROAD.y, roadCenterZ);
    road.receiveShadow = true;
    this.scene.add(road);
    this.road = road;

    const bed = new THREE.Mesh(
      new THREE.BoxGeometry(12.7, 0.38, roadLength),
      new THREE.MeshStandardMaterial({ color: '#4c504b', roughness: 0.84 })
    );
    bed.position.set(0, ROAD.y - 0.24, roadCenterZ);
    bed.receiveShadow = true;
    this.scene.add(bed);

    for (const side of [-1, 1]) {
      const curb = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.22, roadLength),
        new THREE.MeshStandardMaterial({ color: '#a89c86', roughness: 0.86 })
      );
      curb.position.set(side * 6.15, ROAD.y + 0.04, roadCenterZ);
      curb.receiveShadow = true;
      this.scene.add(curb);
      const edge = new THREE.Mesh(
        new THREE.PlaneGeometry(0.13, roadLength),
        new THREE.MeshStandardMaterial({ color: '#e9dcc4', roughness: 0.56, emissive: '#5c4a31', emissiveIntensity: 0.07 })
      );
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(side * 5.42, ROAD.y + 0.012, roadCenterZ);
      this.scene.add(edge);
    }

    const dashMat = new THREE.MeshStandardMaterial({
      map: this.dashTex,
      transparent: true,
      alphaTest: 0.18,
      color: '#f0e4cd',
      roughness: 0.5,
      emissive: '#44331f',
      emissiveIntensity: 0.1,
      side: THREE.DoubleSide,
    });
    this.dashMat = dashMat;
    for (const laneX of [-2, 2]) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.13, roadLength), dashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(laneX, ROAD.y + 0.014, roadCenterZ);
      this.scene.add(dash);
    }

    // A gentle tar seam near each shoulder.
    for (const x of [-5.0, 5.0]) {
      const seam = new THREE.Mesh(new THREE.PlaneGeometry(0.035, roadLength), new THREE.MeshStandardMaterial({ color: '#1f2828', roughness: 0.94 }));
      seam.rotation.x = -Math.PI / 2;
      seam.position.set(x, ROAD.y + 0.009, roadCenterZ);
      this.scene.add(seam);
    }

    // A faint sheen strip where the sky catches the asphalt at dusk.
    this.roadSheen = new THREE.Mesh(
      new THREE.PlaneGeometry(10.5, roadLength),
      new THREE.MeshBasicMaterial({ color: '#9eb7b1', transparent: true, opacity: 0.018, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    this.roadSheen.rotation.x = -Math.PI / 2;
    this.roadSheen.position.set(0, ROAD.y + 0.018, roadCenterZ);
    this.scene.add(this.roadSheen);

    this.roadCenterZ = roadCenterZ;
    this.roadLength = roadLength;
  }

  _buildBeach() {
    this.beachChunks = [];
    const dry = new THREE.Color('#d5bd94');
    const wet = new THREE.Color('#8d8c77');
    const under = new THREE.Color('#56706b');
    const sand = new THREE.Color('#c5b28f');
    const colorFn = (x, y, z) => {
      const slope = smoothstep(8, 32, x);
      const noise = Math.sin(x * 0.52 + z * 0.31) * 0.07 + Math.sin(z * 0.17 - x * 0.11) * 0.04;
      if (y > 1.1) return dry.clone().lerp(sand, slope * 0.4 + noise);
      if (y > 0.15) return wet.clone().lerp(dry, smoothstep(0.15, 1.1, y) * 0.62 + noise);
      return under.clone().lerp(wet, smoothstep(-1.5, 0.15, y) * 0.7 + noise);
    };
    const geo = buildTerrainGeometry(5.9, 98, 32, beachHeight, colorFn);
    const mat = new THREE.MeshStandardMaterial({
      map: this.sandTex,
      vertexColors: true,
      roughness: 0.93,
      metalness: 0.01,
    });
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = CHUNK_START + i * CHUNK_LENGTH;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.beachChunks.push(mesh);
    }
    this.beachGeo = geo;
    this.beachMaterial = mat;
  }

  _buildCliffs() {
    this.cliffChunks = [];
    const moss = new THREE.Color('#556849');
    const olive = new THREE.Color('#75805a');
    const rock = new THREE.Color('#898777');
    const high = new THREE.Color('#999575');
    const colorFn = (x, y, z) => {
      const h = smoothstep(4.2, 28, y);
      const n = Math.sin(x * 0.19 + z * 0.083) * 0.5 + 0.5;
      const c = moss.clone().lerp(olive, n * 0.55 + h * 0.22);
      c.lerp(rock, smoothstep(10, 23, y) * 0.25 * (1 - n * 0.3));
      c.lerp(high, smoothstep(20, 34, y) * 0.35);
      return c;
    };
    const geo = buildTerrainGeometry(-188, -5.9, 42, cliffHeight, colorFn);
    const mat = new THREE.MeshStandardMaterial({
      map: this.groundTex,
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.01,
      flatShading: true,
    });
    for (let i = 0; i < CHUNK_COUNT; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.z = CHUNK_START + i * CHUNK_LENGTH;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.cliffChunks.push(mesh);
    }
    this.cliffGeo = geo;
    this.cliffMaterial = mat;
  }

  _buildGuardRail() {
    const postGeo = new THREE.BoxGeometry(0.12, 1.14, 0.14);
    const postMat = new THREE.MeshStandardMaterial({ color: '#5f4a38', roughness: 0.82 });
    const postCount = 190;
    const posts = new THREE.InstancedMesh(postGeo, postMat, postCount);
    posts.frustumCulled = false;
    this.railPostsData = [];
    for (let i = 0; i < postCount; i++) {
      const z = -470 + i * 5;
      this.railPostsData.push({ x: 6.7, z, y: ROAD.y + 0.57, rot: 0 });
    }
    this.railPosts = posts;
    this.scene.add(posts);

    const reflectorMat = new THREE.MeshStandardMaterial({ color: '#563820', emissive: '#ffbe71', emissiveIntensity: 0.35, roughness: 0.4 });
    this.reflectorMat = reflectorMat;
    const reflectors = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.08, 0.055), reflectorMat, postCount);
    reflectors.frustumCulled = false;
    this.reflectors = reflectors;
    this.scene.add(reflectors);

    const railMat = new THREE.MeshStandardMaterial({ color: '#6b7167', roughness: 0.4, metalness: 0.6 });
    for (const [y, h] of [[ROAD.y + 1.16, 0.075], [ROAD.y + 0.76, 0.035]]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.07, h, 1100), railMat);
      rail.position.set(6.7, y, -300);
      rail.receiveShadow = true;
      this.scene.add(rail);
    }

    // Low stone edging on the cliff side.
    const stoneMat = new THREE.MeshStandardMaterial({ color: '#7d7b6c', roughness: 0.92 });
    const edge = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.32, 1100), stoneMat);
    edge.position.set(-6.15, ROAD.y + 0.09, -300);
    this.scene.add(edge);

    // White distance markers on the cliff side.
    const markers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.1, 0.58, 0.1),
      new THREE.MeshStandardMaterial({ color: '#ded4bd', roughness: 0.8 }),
      130
    );
    markers.frustumCulled = false;
    this.distanceMarkers = markers;
    this.markerData = [];
    for (let i = 0; i < 130; i++) {
      const z = -460 + i * 8.5;
      this.markerData.push({ x: -6.42, z, y: ROAD.y + 0.38 });
    }
    this.scene.add(markers);
  }

  _buildLamps() {
    this.lamps = [];
    this.lampZPositions = [-380, -330, -280, -230, -180, -130, -80, -30, 20, 70, 120, 170, 220, 270];
    this.lampCount = this.lampZPositions.length;
    this.lampGlowMaterial = new THREE.SpriteMaterial({
      map: makeFireflyTexture(),
      color: '#ffd7a0',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.lampBulbMaterial = new THREE.MeshStandardMaterial({ color: '#5b4b35', emissive: '#ffd19b', emissiveIntensity: 0.15, roughness: 0.35 });
    this.lampPoolMaterial = new THREE.MeshBasicMaterial({
      map: this.lightPoolTex,
      color: '#ffd29b',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const poleMat = new THREE.MeshStandardMaterial({ color: '#354b4b', roughness: 0.43, metalness: 0.7 });
    const poleGeo = new THREE.CylinderGeometry(0.065, 0.095, 4.6, 8);
    const poleGeoArm = new THREE.CylinderGeometry(0.05, 0.055, 2.25, 7);
    const hoodGeo = new THREE.ConeGeometry(0.3, 0.28, 10, 1, true);
    const bulbGeo = new THREE.SphereGeometry(0.11, 10, 7);
    const glowTex = this.fireflyTex;
    for (let i = 0; i < this.lampCount; i++) {
      const group = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(0, 2.3, 0);
      group.add(pole);
      const arm = new THREE.Mesh(poleGeoArm, poleMat);
      arm.rotation.z = Math.PI * 0.42;
      arm.position.set(-0.97, 4.6, 0);
      group.add(arm);
      const hood = new THREE.Mesh(hoodGeo, poleMat);
      hood.position.set(-1.95, 4.82, 0);
      hood.rotation.z = Math.PI;
      group.add(hood);
      const bulb = new THREE.Mesh(bulbGeo, this.lampBulbMaterial);
      bulb.position.set(-1.95, 4.75, 0);
      group.add(bulb);
      const glow = new THREE.Sprite(this.lampGlowMaterial);
      glow.scale.set(1.15, 1.15, 1);
      glow.position.set(-1.95, 4.74, 0);
      group.add(glow);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 7.4), this.lampPoolMaterial);
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(-2.0, 0.025, 0);
      group.add(pool);
      group.position.set(8.2, ROAD.y, this.lampZPositions[i]);
      this.scene.add(group);
      this.lamps.push({ group, bulb, glow, pool, z: this.lampZPositions[i] });
    }
    this.lampPointLight = new THREE.PointLight('#ffc98d', 0, 32, 1.7);
    this.lampPointLight.position.set(6.2, ROAD.y + 4.5, 0);
    this.scene.add(this.lampPointLight);
    this.nearestLamp = 0;
    this.lampLightZ = -20;
  }

  _buildSigns() {
    this.signGroups = [];
    this.signZ = [-88, -340];
    const texA = makeSignTexture(0);
    const texB = makeSignTexture(1);
    const signs = [
      { tex: texA, kind: 0 },
      { tex: texB, kind: 1 },
    ];
    for (let i = 0; i < this.signZ.length; i++) {
      const group = makeSignBoard(this.scene, signs[i].tex, this.signZ[i], signs[i].kind);
      this.signGroups.push({ group, z: this.signZ[i] });
    }
  }

  _buildRocks() {
    const rand = seededRandom(329);
    const count = 190;
    const geo = makeRockGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.94, metalness: 0.02, flatShading: true });
    const rocks = new THREE.InstancedMesh(geo, mat, count);
    rocks.frustumCulled = false;
    this.rocks = rocks;
    this.rockData = [];
    const tints = ['#6c6c5f', '#777365', '#5b6159', '#7b7565', '#555d54'];
    for (let i = 0; i < count; i++) {
      let x;
      let y;
      let z = -PROP_HALF + rand() * PROP_RANGE;
      if (i < 118) {
        x = 9.2 + rand() * 11.5;
        const local = localZForStart(z);
        y = beachHeight(x, local);
        if (y < -0.45) {
          x = 9.5 + rand() * 7;
          y = beachHeight(x, local);
        }
      } else {
        x = -10 - rand() * 55;
        const local = localZForStart(z);
        y = cliffHeight(x, local);
      }
      const s = 0.25 + Math.pow(rand(), 2.2) * 2.25;
      const data = {
        x,
        z,
        y: y - 0.04,
        sx: s * (0.7 + rand() * 0.7),
        sy: s * (0.45 + rand() * 0.55),
        sz: s * (0.75 + rand() * 0.55),
        rx: rand() * TAU,
        ry: rand() * TAU,
        rz: rand() * TAU,
      };
      this.rockData.push(data);
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(data.rx, data.ry, data.rz);
      _dummy.scale.set(data.sx, data.sy, data.sz);
      _dummy.updateMatrix();
      rocks.setMatrixAt(i, _dummy.matrix);
      _color.set(tints[Math.floor(rand() * tints.length)]);
      rocks.setColorAt(i, _color);
    }
    rocks.instanceMatrix.needsUpdate = true;
    if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
    this.scene.add(rocks);
  }

  _buildGrass() {
    const rand = seededRandom(273);
    const count = 560;
    const geo = makeBladeGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, side: THREE.DoubleSide, vertexColors: false });
    const grass = new THREE.InstancedMesh(geo, mat, count);
    grass.frustumCulled = false;
    grass.castShadow = false;
    this.grass = grass;
    this.grassData = [];
    for (let i = 0; i < count; i++) {
      let x;
      let y;
      const z = -PROP_HALF + rand() * PROP_RANGE;
      const local = localZForStart(z);
      if (i < 370) {
        x = -8 - rand() * 38;
        y = cliffHeight(x, local);
      } else {
        x = 9 + rand() * 8.6;
        y = beachHeight(x, local);
      }
      const s = 0.4 + rand() * 1.7;
      const data = { x, z, y: y + 0.03, s, rot: rand() * TAU };
      this.grassData.push(data);
      _dummy.position.set(x, y, z);
      _dummy.rotation.set(0, data.rot, 0);
      _dummy.scale.set(s * 0.8, s, s * 0.8);
      _dummy.updateMatrix();
      grass.setMatrixAt(i, _dummy.matrix);
      _color.set(rand() > 0.6 ? '#a7ac6e' : rand() > 0.3 ? '#879867' : '#bab47c');
      grass.setColorAt(i, _color);
    }
    grass.instanceMatrix.needsUpdate = true;
    if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
    this.scene.add(grass);

    // Chamomile-like coastal shrubs. Their silhouettes make the cliff carvable.
    const shrubCount = 150;
    const shrubGeo = new THREE.IcosahedronGeometry(0.5, 1);
    const shrubMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.96, flatShading: true });
    const shrubs = new THREE.InstancedMesh(shrubGeo, shrubMat, shrubCount);
    shrubs.frustumCulled = false;
    this.shrubs = shrubs;
    this.shrubData = [];
    for (let i = 0; i < shrubCount; i++) {
      const x = -7.6 - rand() * 24;
      const z = -PROP_HALF + rand() * PROP_RANGE;
      const local = localZForStart(z);
      const y = cliffHeight(x, local);
      const s = 0.45 + rand() * 1.15;
      this.shrubData.push({ x, z, y, s, rot: rand() * TAU, sy: 0.45 + rand() * 0.35 });
      _dummy.position.set(x, y + s * 0.25, z);
      _dummy.rotation.set(0, rand() * TAU, 0);
      _dummy.scale.set(s * 1.2, s * (0.45 + rand() * 0.35), s);
      _dummy.updateMatrix();
      shrubs.setMatrixAt(i, _dummy.matrix);
      _color.set(rand() > 0.55 ? '#7e8d59' : rand() > 0.35 ? '#677a50' : '#9b9a69');
      shrubs.setColorAt(i, _color);
    }
    shrubs.instanceMatrix.needsUpdate = true;
    if (shrubs.instanceColor) shrubs.instanceColor.needsUpdate = true;
    this.scene.add(shrubs);

    // Tiny coastal flowers scattered through the grass.
    const flowerCount = 120;
    const flowers = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.055, 0),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
      flowerCount
    );
    flowers.frustumCulled = false;
    this.flowers = flowers;
    this.flowerData = [];
    for (let i = 0; i < flowerCount; i++) {
      const x = i % 3 === 0 ? 9.5 + rand() * 7.5 : -9 - rand() * 30;
      const z = -PROP_HALF + rand() * PROP_RANGE;
      const local = localZForStart(z);
      const y = x > 0 ? beachHeight(x, local) : cliffHeight(x, local);
      this.flowerData.push({ x, z, y: y + 0.3 + rand() * 0.35, s: 0.8 + rand() * 0.9 });
      _dummy.position.set(x, y + 0.3, z);
      _dummy.scale.setScalar(0.8 + rand() * 0.9);
      _dummy.updateMatrix();
      flowers.setMatrixAt(i, _dummy.matrix);
      _color.set(rand() > 0.5 ? '#f5d19a' : rand() > 0.3 ? '#f3e7d1' : '#d46358');
      flowers.setColorAt(i, _color);
    }
    flowers.instanceMatrix.needsUpdate = true;
    if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
    this.scene.add(flowers);
  }

  _buildTrees() {
    const rand = seededRandom(750);
    const treeCount = 22;
    const trunkGeo = new THREE.CylinderGeometry(0.12, 0.22, 1, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#4a4032', roughness: 0.94 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    trunks.frustumCulled = false;
    const foliageGeo = new THREE.ConeGeometry(1, 1, 7);
    const foliageMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.92, flatShading: true });
    const foliage = new THREE.InstancedMesh(foliageGeo, foliageMat, treeCount * 3);
    foliage.frustumCulled = false;
    this.trees = trunks;
    this.treeCanopies = foliage;
    this.treeData = [];
    this.canopyData = [];
    for (let i = 0; i < treeCount; i++) {
      const x = -16 - rand() * 54;
      const z = -PROP_HALF + rand() * PROP_RANGE;
      const local = localZForStart(z);
      const y = cliffHeight(x, local);
      const height = 2.8 + rand() * 4.8;
      const radius = height * (0.18 + rand() * 0.06);
      const lean = (rand() - 0.5) * 0.12;
      this.treeData.push({ x, z, y, height, radius, lean });
      _dummy.position.set(x, y + height * 0.38, z);
      _dummy.rotation.set(0, rand() * TAU, lean);
      _dummy.scale.set(1, height * 0.76, 1);
      _dummy.updateMatrix();
      trunks.setMatrixAt(i, _dummy.matrix);
      for (let l = 0; l < 3; l++) {
        const t = l / 2;
        const cy = y + height * (0.55 + t * 0.22);
        const cr = radius * (1 - t * 0.55);
        const ch = height * (0.34 - t * 0.06);
        const idx = i * 3 + l;
        _dummy.position.set(x + lean * height * 0.35 * (0.4 + t), cy, z);
        _dummy.rotation.set(0, rand() * TAU, lean);
        _dummy.scale.set(cr, ch, cr);
        _dummy.updateMatrix();
        foliage.setMatrixAt(idx, _dummy.matrix);
        _color.set(rand() > 0.55 ? '#3e4e3d' : '#4f5d43');
        foliage.setColorAt(idx, _color);
      }
    }
    trunks.instanceMatrix.needsUpdate = true;
    foliage.instanceMatrix.needsUpdate = true;
    if (foliage.instanceColor) foliage.instanceColor.needsUpdate = true;
    this.scene.add(trunks);
    this.scene.add(foliage);
  }

  _buildLighthouse() {
    const group = new THREE.Group();
    const islandMat = new THREE.MeshStandardMaterial({ color: '#4a4b40', roughness: 0.98, flatShading: true });
    const island = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), islandMat);
    island.scale.set(31, 16, 25);
    island.position.y = 2;
    group.add(island);
    const rock2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), islandMat);
    rock2.scale.set(11, 9, 13);
    rock2.position.set(-20, 2, 8);
    group.add(rock2);
    const towerMat = new THREE.MeshStandardMaterial({ color: '#e7ddca', roughness: 0.7 });
    const redMat = new THREE.MeshStandardMaterial({ color: '#c65e4d', roughness: 0.65 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 3.3, 21, 14), towerMat);
    tower.position.y = 23;
    group.add(tower);
    for (const y of [16, 26]) {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(3.26 - (y - 16) * 0.06, 3.4 - (y - 16) * 0.06, 2.8, 14), redMat);
      band.position.y = y;
      group.add(band);
    }
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.35, 14), new THREE.MeshStandardMaterial({ color: '#3f4441', roughness: 0.45, metalness: 0.6 }));
    gallery.position.y = 33.9;
    group.add(gallery);
    const lanternGlass = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 2.8, 10), new THREE.MeshStandardMaterial({ color: '#373f3b', roughness: 0.2, metalness: 0.55, emissive: '#ffc981', emissiveIntensity: 0.2 }));
    lanternGlass.position.y = 35.4;
    group.add(lanternGlass);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(2.7, 3.0, 12), new THREE.MeshStandardMaterial({ color: '#40504c', roughness: 0.55, metalness: 0.4 }));
    cap.position.y = 38.0;
    group.add(cap);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), new THREE.MeshStandardMaterial({ color: '#ffe4b1', emissive: '#ffc472', emissiveIntensity: 3 }));
    lantern.position.y = 35.4;
    group.add(lantern);
    this.lighthouseLantern = lantern.material;
    this.lighthouseGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeFireflyTexture(), color: '#ffd18b', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.lighthouseGlow.scale.set(9, 9, 1);
    this.lighthouseGlow.position.y = 35.4;
    group.add(this.lighthouseGlow);
    const beamMat = new THREE.MeshBasicMaterial({ color: '#ffe7bb', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beamGeo = new THREE.ConeGeometry(7, 90, 16, 1, true);
    beamGeo.translate(0, -45, 0);
    beamGeo.rotateZ(Math.PI / 2);
    this.lighthouseBeam = new THREE.Mesh(beamGeo, beamMat);
    this.lighthouseBeam.position.y = 35.4;
    this.lighthouseBeam.rotation.y = 0.2;
    group.add(this.lighthouseBeam);
    group.position.set(100, 0, -260);
    this.scene.add(group);
    this.lighthouse = group;
    this.lighthouseBaseZ = -260;
  }

  _buildBoats() {
    this.boats = [];
    const rand = seededRandom(807);
    for (let i = 0; i < 2; i++) {
      const group = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.65, 3.2, 4, 8), new THREE.MeshStandardMaterial({ color: '#4c4a43', roughness: 0.55, metalness: 0.15 }));
      hull.rotation.z = Math.PI / 2;
      hull.scale.set(0.45, 0.5, 0.35);
      group.add(hull);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 6.8, 6), new THREE.MeshStandardMaterial({ color: '#77604a', roughness: 0.7 }));
      mast.position.y = 3.35;
      group.add(mast);
      const sailShape = new THREE.BufferGeometry();
      sailShape.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0,
        0, 6.2, 0,
        2.65, 0.2, 0,
      ], 3));
      sailShape.computeVertexNormals();
      const sail = new THREE.Mesh(sailShape, new THREE.MeshStandardMaterial({ color: '#e4d6bd', roughness: 0.8, side: THREE.DoubleSide }));
      sail.position.set(0.45, 2.0, 0);
      group.add(sail);
      const warmGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeFireflyTexture(), color: '#ffd49f', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      warmGlow.scale.set(1.3, 1.3, 1);
      warmGlow.position.y = 4.0;
      group.add(warmGlow);
      group.position.set(78 + i * 118, 0.32, -155 - i * 150);
      group.rotation.y = i === 0 ? 0.6 : -0.4;
      group.scale.setScalar(i === 0 ? 1 : 0.8);
      group.userData.baseZ = group.position.z;
      group.userData.baseX = group.position.x;
      group.userData.glow = warmGlow.material;
      group.userData.phase = rand() * TAU;
      this.scene.add(group);
      this.boats.push(group);
    }
  }

  _buildBirds() {
    this.birds = [];
    const rand = seededRandom(199);
    for (let i = 0; i < 6; i++) {
      const bird = makeBird();
      const center = new THREE.Vector3(34 + rand() * 65, 11 + rand() * 14, -60 - rand() * 90);
      bird.position.copy(center);
      bird.scale.setScalar(0.8 + rand() * 0.7);
      bird.userData.center = center;
      bird.userData.radius = 20 + rand() * 32;
      bird.userData.phase = rand() * TAU;
      bird.userData.speed = 0.04 + rand() * 0.05;
      bird.userData.flap = rand() * TAU;
      this.scene.add(bird);
      this.birds.push(bird);
    }
  }

  _buildFireflies() {
    const rand = seededRandom(920);
    const count = 95;
    const positions = new Float32Array(count * 3);
    this.fireflyData = [];
    for (let i = 0; i < count; i++) {
      const x = -10 - rand() * 32;
      const z = -160 + rand() * 300;
      const y = cliffHeight(x, localZForStart(z)) + 0.5 + rand() * 3.2;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      this.fireflyData.push({ x, y, z, phase: rand() * TAU, speed: 0.4 + rand() * 0.8, baseY: y });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.fireflyGeo = geo;
    const mat = new THREE.PointsMaterial({
      map: this.fireflyTex,
      color: '#ffda97',
      size: 0.25,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.fireflies = new THREE.Points(geo, mat);
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);
    this.fireflyMat = mat;
  }

  _updateInstanced(mesh, dataList, apply) {
    let changed = false;
    for (let i = 0; i < dataList.length; i++) {
      const data = dataList[i];
      data.z += this.speed * 0.016;
      if (data.z > PROP_HALF) data.z -= PROP_RANGE;
      apply(data, i);
      changed = true;
    }
    if (changed) mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, { speed, distance, palette, time, quality }) {
    this.time = time;
    this.speed = speed;
    this.distance = distance;
    this.quality = quality;
    this.night = smoothstep(0.03, 0.62, palette.stars);

    this.asphaltTex.offset.y = distance / 10.25;
    this.dashTex.offset.y = -distance / 8;
    this.roadSheen.material.opacity = 0.015 + palette.stars * 0.024;
    this.dashMat.emissiveIntensity = 0.05 + palette.lamp * 0.25;
    if (this.reflectorMat) this.reflectorMat.emissiveIntensity = 0.12 + palette.lamp * 1.25;

    const move = speed * dt;
    for (const chunk of this.beachChunks) {
      chunk.position.z += move;
      if (chunk.position.z > 800) chunk.position.z -= CHUNK_WRAP;
    }
    for (const chunk of this.cliffChunks) {
      chunk.position.z += move;
      if (chunk.position.z > 800) chunk.position.z -= CHUNK_WRAP;
    }
    for (const sign of this.signGroups) {
      sign.group.position.z += move;
      if (sign.group.position.z > 260) sign.group.position.z -= 520;
    }

    // Guardrail posts and markers share the scroll.
    for (let i = 0; i < this.railPostsData.length; i++) {
      const data = this.railPostsData[i];
      data.z += move;
      if (data.z > 300) data.z -= 780;
      _dummy.position.set(data.x, data.y, data.z);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(1, 1, 1);
      _dummy.updateMatrix();
      this.railPosts.setMatrixAt(i, _dummy.matrix);
      _dummy.position.set(6.7, ROAD.y + 1.06, data.z);
      _dummy.updateMatrix();
      this.reflectors.setMatrixAt(i, _dummy.matrix);
    }
    this.railPosts.instanceMatrix.needsUpdate = true;
    this.reflectors.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < this.markerData.length; i++) {
      const data = this.markerData[i];
      data.z += move;
      if (data.z > 300) data.z -= 820;
      _dummy.position.set(data.x, data.y, data.z);
      _dummy.updateMatrix();
      this.distanceMarkers.setMatrixAt(i, _dummy.matrix);
    }
    this.distanceMarkers.instanceMatrix.needsUpdate = true;

    // Street lamps.
    let nearest = Infinity;
    let nearestIndex = 0;
    for (let i = 0; i < this.lamps.length; i++) {
      const lamp = this.lamps[i];
      lamp.group.position.z += move;
      if (lamp.group.position.z > 300) lamp.group.position.z -= 700;
      const d = Math.abs(lamp.group.position.z);
      if (d < nearest) {
        nearest = d;
        nearestIndex = i;
      }
    }
    this.nearestLamp = nearestIndex;
    const nearestLamp = this.lamps[nearestIndex];
    if (nearestLamp) {
      this.lampPointLight.position.set(nearestLamp.group.position.x - 2.0, ROAD.y + 4.4, nearestLamp.group.position.z);
      this.lampPointLight.intensity = palette.lamp * 34;
    }
    const lampOn = palette.lamp;
    this.lampBulbMaterial.emissiveIntensity = 0.12 + lampOn * 4.4;
    this.lampGlowMaterial.opacity = lampOn * 0.78;
    this.lampPoolMaterial.opacity = lampOn * 0.44;
    this.lampPointLight.color.set(palette.keyLight).lerp(new THREE.Color('#ffbd76'), 0.65);

    // Rocks, grass, flowers.
    for (let i = 0; i < this.rockData.length; i++) {
      const data = this.rockData[i];
      data.z += move;
      if (data.z > PROP_HALF) data.z -= PROP_RANGE;
      _dummy.position.set(data.x, data.y, data.z);
      _dummy.rotation.set(data.rx, data.ry, data.rz);
      _dummy.scale.set(data.sx, data.sy, data.sz);
      _dummy.updateMatrix();
      this.rocks.setMatrixAt(i, _dummy.matrix);
    }
    this.rocks.instanceMatrix.needsUpdate = true;
    this.rocks.count = this.quality >= 2 ? this.rockData.length : this.quality >= 1 ? 150 : 90;

    for (let i = 0; i < this.grassData.length; i++) {
      const data = this.grassData[i];
      data.z += move;
      if (data.z > PROP_HALF) data.z -= PROP_RANGE;
      _dummy.position.set(data.x, data.y, data.z);
      _dummy.rotation.set(0, data.rot, Math.sin(time * 1.2 + data.x * 0.3) * 0.04);
      _dummy.scale.set(data.s * 0.8, data.s, data.s * 0.8);
      _dummy.updateMatrix();
      this.grass.setMatrixAt(i, _dummy.matrix);
    }
    this.grass.instanceMatrix.needsUpdate = true;
    this.grass.count = this.quality >= 2 ? this.grassData.length : this.quality >= 1 ? 380 : 180;

    for (let i = 0; i < this.shrubData.length; i++) {
      const data = this.shrubData[i];
      data.z += move;
      if (data.z > PROP_HALF) data.z -= PROP_RANGE;
      _dummy.position.set(data.x, data.y + data.s * 0.25, data.z);
      _dummy.rotation.set(0, data.rot, 0);
      _dummy.scale.set(data.s * 1.2, data.s * data.sy, data.s);
      _dummy.updateMatrix();
      this.shrubs.setMatrixAt(i, _dummy.matrix);
    }
    this.shrubs.instanceMatrix.needsUpdate = true;
    this.shrubs.count = this.quality >= 2 ? this.shrubData.length : this.quality >= 1 ? 95 : 45;

    for (let i = 0; i < this.flowerData.length; i++) {
      const data = this.flowerData[i];
      data.z += move;
      if (data.z > PROP_HALF) data.z -= PROP_RANGE;
      _dummy.position.set(data.x, data.y, data.z);
      _dummy.rotation.set(0, time * 0.08 + data.x, 0);
      _dummy.scale.setScalar(data.s);
      _dummy.updateMatrix();
      this.flowers.setMatrixAt(i, _dummy.matrix);
    }
    this.flowers.instanceMatrix.needsUpdate = true;
    this.flowers.visible = this.quality >= 1;

    // Trees.
    for (let i = 0; i < this.treeData.length; i++) {
      const data = this.treeData[i];
      data.z += move;
      if (data.z > PROP_HALF) data.z -= PROP_RANGE;
      _dummy.position.set(data.x, data.y + data.height * 0.38, data.z);
      _dummy.rotation.set(0, 0, data.lean);
      _dummy.scale.set(1, data.height * 0.76, 1);
      _dummy.updateMatrix();
      this.trees.setMatrixAt(i, _dummy.matrix);
      for (let l = 0; l < 3; l++) {
        const t = l / 2;
        const idx = i * 3 + l;
        _dummy.position.set(data.x + data.lean * data.height * 0.35 * (0.4 + t), data.y + data.height * (0.55 + t * 0.22), data.z);
        _dummy.rotation.set(0, 0, data.lean);
        _dummy.scale.set(data.radius * (1 - t * 0.55), data.height * (0.34 - t * 0.06), data.radius * (1 - t * 0.55));
        _dummy.updateMatrix();
        this.treeCanopies.setMatrixAt(idx, _dummy.matrix);
      }
    }
    this.trees.instanceMatrix.needsUpdate = true;
    this.treeCanopies.instanceMatrix.needsUpdate = true;
    this.trees.visible = this.quality >= 1;
    this.treeCanopies.visible = this.quality >= 1;

    // Lighthouse island drifts with the world, slower because it is far away.
    this.lighthouse.position.z += move * 0.72;
    if (this.lighthouse.position.z > 160) this.lighthouse.position.z -= 900;
    this.lighthouse.position.x = 100 + Math.sin(time * 0.025) * 1.2;
    this.lighthouseBeam.rotation.y = time * 0.34;
    const lighthouseOn = smoothstep(0.15, 0.7, palette.stars);
    this.lighthouseLantern.emissiveIntensity = 0.4 + lighthouseOn * 5.5;
    this.lighthouseGlow.material.opacity = lighthouseOn * 0.8;
    this.lighthouseBeam.material.opacity = lighthouseOn * 0.08;

    for (const boat of this.boats) {
      boat.position.z += move * 0.55;
      if (boat.position.z > 120) boat.position.z -= 440;
      boat.position.y = 0.32 + Math.sin(time * 0.8 + boat.userData.phase) * 0.08;
      boat.rotation.z = Math.sin(time * 0.65 + boat.userData.phase) * 0.035;
      boat.userData.glow.opacity = lighthouseOn * 0.7;
      // The far boat also drifts sideways with the swell.
      boat.position.x = boat.userData.baseX + Math.sin(time * 0.04 + boat.userData.phase) * 5;
    }

    for (const bird of this.birds) {
      const data = bird.userData;
      const angle = time * data.speed + data.phase;
      bird.position.x = data.center.x + Math.cos(angle) * data.radius;
      bird.position.z = data.center.z + Math.sin(angle) * data.radius * 0.65;
      bird.position.y = data.center.y + Math.sin(time * 0.9 + data.phase) * 2.2;
      bird.rotation.y = -angle + Math.PI * 0.5;
      bird.rotation.z = Math.sin(time * 0.7 + data.phase) * 0.12;
      const flap = Math.sin(time * 5.2 + data.flap) * 0.4;
      if (bird.userData.leftWing) bird.userData.leftWing.rotation.z = 0.14 + flap;
      if (bird.userData.rightWing) bird.userData.rightWing.rotation.z = -0.14 - flap;
    }

    // Fireflies wake only after dusk.
    const fireflyArr = this.fireflyGeo.getAttribute('position');
    for (let i = 0; i < this.fireflyData.length; i++) {
      const data = this.fireflyData[i];
      data.z += move * 0.4;
      if (data.z > 150) data.z -= 360;
      fireflyArr.setXYZ(
        i,
        data.x + Math.sin(time * data.speed + data.phase) * 0.8,
        data.baseY + Math.sin(time * data.speed * 1.7 + data.phase) * 0.55,
        data.z
      );
    }
    fireflyArr.needsUpdate = true;
    this.fireflyMat.opacity = smoothstep(0.25, 0.85, palette.stars) * 0.78;
    this.fireflies.visible = palette.stars > 0.12;

    this._lastSpeed = speed;
  }

  setQuality(quality) {
    this.quality = quality;
    this.grass.count = quality >= 2 ? this.grassData.length : quality >= 1 ? 380 : 180;
    this.rocks.count = quality >= 2 ? this.rockData.length : quality >= 1 ? 150 : 90;
    this.flowers.visible = quality >= 1;
    this.shrubs.visible = true;
    this.shrubs.count = quality >= 2 ? this.shrubData.length : quality >= 1 ? 95 : 45;
    this.trees.visible = quality >= 1;
    this.treeCanopies.visible = quality >= 1;
    this.fireflies.visible = quality >= 1;
    this.lighthouse.visible = quality >= 1;
    this.boats.forEach((b) => (b.visible = quality >= 1));
    this.lampPointLight.visible = quality >= 1;
  }
}
