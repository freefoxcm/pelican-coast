import * as THREE from 'three';
import { clamp, lerp, seededRandom, smoothstep, TAU } from './utils.js';

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 2, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.08, 'rgba(255,250,232,.98)');
  g.addColorStop(0.18, 'rgba(255,228,176,.48)');
  g.addColorStop(0.38, 'rgba(255,194,126,.15)');
  g.addColorStop(0.7, 'rgba(255,164,104,.03)');
  g.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(128, 128, 48, 128, 128, 126);
  g.addColorStop(0, 'rgba(255,251,230,1)');
  g.addColorStop(0.5, 'rgba(255,235,185,1)');
  g.addColorStop(0.76, 'rgba(255,205,142,.72)');
  g.addColorStop(1, 'rgba(255,184,114,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeMoonTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const rand = seededRandom(611);
  const base = ctx.createRadialGradient(105, 98, 10, 128, 128, 112);
  base.addColorStop(0, 'rgba(255,252,238,1)');
  base.addColorStop(0.7, 'rgba(236,239,219,1)');
  base.addColorStop(0.88, 'rgba(206,216,205,.94)');
  base.addColorStop(1, 'rgba(175,191,190,0)');
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(128, 128, 112, 0, TAU);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-atop';
  for (let i = 0; i < 28; i++) {
    const x = 40 + rand() * 176;
    const y = 40 + rand() * 176;
    const r = 3 + rand() * 17;
    ctx.fillStyle = `rgba(142,159,155,${0.04 + rand() * 0.08})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 16; i++) {
    const x = 30 + rand() * 190;
    const y = 30 + rand() * 190;
    const r = 1 + rand() * 4;
    ctx.fillStyle = `rgba(255,255,245,${0.09 + rand() * 0.08})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCloudTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const rand = seededRandom(seed);
  ctx.clearRect(0, 0, 512, 256);
  ctx.save();
  ctx.filter = 'blur(17px)';
  ctx.globalCompositeOperation = 'lighter';
  // Overlapping puffs are deliberately generous: after the final blur they
  // should merge into one soft coastal cloud, not a row of bokeh dots.
  for (let i = 0; i < 24; i++) {
    const x = 95 + rand() * 320;
    const y = 125 + rand() * 50;
    const rx = 62 + rand() * 115;
    const ry = 24 + rand() * 40;
    ctx.fillStyle = `rgba(255,255,255,${0.035 + rand() * 0.035})`;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, (rand() - 0.5) * 0.1, 0, TAU);
    ctx.fill();
  }
  for (let i = 0; i < 13; i++) {
    const x = 145 + rand() * 230;
    const y = 80 + rand() * 55;
    const r = 24 + rand() * 52;
    ctx.fillStyle = `rgba(255,248,235,${0.025 + rand() * 0.045})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.5 + rand() * 0.25), 0, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // A soft underside, faintly cooler, adds volume.
  const lower = ctx.createLinearGradient(0, 120, 0, 210);
  lower.addColorStop(0, 'rgba(145,143,153,0)');
  lower.addColorStop(0.55, 'rgba(150,144,150,.035)');
  lower.addColorStop(1, 'rgba(150,144,150,0)');
  ctx.fillStyle = lower;
  ctx.fillRect(0, 100, 512, 130);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function starField(count, radius, seed) {
  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const palette = [
    new THREE.Color('#f9f1dc'),
    new THREE.Color('#dceaff'),
    new THREE.Color('#b7d4ff'),
    new THREE.Color('#ffe3bb'),
    new THREE.Color('#ffffff'),
  ];
  for (let i = 0; i < count; i++) {
    const u = rand();
    const v = rand() * 0.92 + 0.03;
    const theta = u * TAU;
    const y = Math.pow(v, 0.7);
    const r = Math.sqrt(1 - y * y);
    // Slight clustering makes constellations feel authored.
    const x = Math.cos(theta) * r * radius;
    const z = Math.sin(theta) * r * radius;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y * radius;
    positions[i * 3 + 2] = z;
    const color = palette[Math.floor(rand() * palette.length)];
    const shade = 0.5 + rand() * 0.5;
    colors[i * 3] = color.r * shade;
    colors[i * 3 + 1] = color.g * shade;
    colors[i * 3 + 2] = color.b * shade;
    const bright = rand();
    sizes[i] = bright > 0.982 ? 4.4 + rand() * 2.6 : bright > 0.82 ? 2.2 + rand() * 1.1 : 1.0 + rand() * 1.1;
    phases[i] = rand() * TAU;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geo;
}

function milkyWayField(count, radius, seed) {
  const rand = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  // Great-circle band, tilted across the eastern sky.
  const normal = new THREE.Vector3(0.42, 0.72, -0.55).normalize();
  const axisA = new THREE.Vector3(1, 0, 0).cross(normal).normalize();
  const axisB = new THREE.Vector3().crossVectors(normal, axisA).normalize();
  for (let i = 0; i < count; i++) {
    const angle = rand() * TAU;
    const spread = (rand() + rand() + rand() - 1.5) * 0.17;
    const dir = new THREE.Vector3()
      .addScaledVector(axisA, Math.cos(angle))
      .addScaledVector(axisB, Math.sin(angle))
      .addScaledVector(normal, spread)
      .normalize();
    if (dir.y < 0.04) {
      dir.y = Math.abs(dir.y) + 0.04;
      dir.normalize();
    }
    positions[i * 3] = dir.x * radius;
    positions[i * 3 + 1] = dir.y * radius;
    positions[i * 3 + 2] = dir.z * radius;
    const tint = rand();
    const c = new THREE.Color(tint > 0.65 ? '#adc1e8' : tint > 0.3 ? '#d8d3d2' : '#e9d4c0');
    const shade = 0.08 + rand() * 0.3;
    colors[i * 3] = c.r * shade;
    colors[i * 3 + 1] = c.g * shade;
    colors[i * 3 + 2] = c.b * shade;
    sizes[i] = 0.8 + rand() * 1.8;
    phases[i] = rand() * TAU;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geo;
}

const STAR_VERTEX = `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uOpacity;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aPhase;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    float twinkle = 0.72 + 0.28 * sin(uTime * (0.8 + aPhase * 0.06) + aPhase);
    vColor = aColor;
    float horizonFade = smoothstep(-0.02, 0.16, normalize(position).y);
    vAlpha = uOpacity * horizonFade * twinkle;
    gl_PointSize = aSize * uPixelRatio * (0.6 + twinkle * 0.55);
  }
`;

const STAR_FRAGMENT = `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = length(p);
    float core = smoothstep(0.5, 0.05, d);
    float sparkle = smoothstep(0.5, 0.12, abs(p.x) * 3.0 + abs(p.y) * 0.4) * 0.18;
    float alpha = (core * 0.82 + sparkle) * vAlpha;
    if (alpha < 0.008) discard;
    gl_FragColor = vec4(vColor, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const SKY_VERTEX = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const SKY_FRAGMENT = `
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uHorizon;
  uniform vec3 uLow;
  uniform vec3 uSunColor;
  uniform vec3 uMoonColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform float uSunGlow;
  uniform float uMoonGlow;
  uniform float uHaze;
  uniform float uTime;
  varying vec3 vDir;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec3 dir = normalize(vDir);
    float h = dir.y;
    float horizonMix = smoothstep(0.0, 0.38, h);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.34, h));
    col = mix(col, uTop, smoothstep(0.22, 0.96, h));
    float band = exp(-pow((h - 0.055) * 10.5, 2.0));
    col = mix(col, uHorizon, band * 0.34 * uHaze);
    if (h < 0.0) {
      col = mix(uHorizon, uLow, clamp(-h * 4.5, 0.0, 1.0));
    }

    vec3 sunDir = normalize(uSunDir);
    float sunDot = max(dot(dir, sunDir), 0.0);
    float sunHalo = pow(sunDot, 850.0) * 1.8 + pow(sunDot, 24.0) * 0.28 + pow(sunDot, 6.0) * 0.055;
    col += uSunColor * sunHalo * uSunGlow;

    vec2 dirAz = normalize(vec2(dir.x, dir.z) + vec2(0.0001));
    vec2 sunAz = normalize(vec2(sunDir.x, sunDir.z) + vec2(0.0001));
    float az = max(dot(dirAz, sunAz), 0.0);
    float sunsetBelt = pow(az, 5.0) * exp(-pow((h - 0.03) * 8.0, 2.0));
    col = mix(col, uSunColor * (0.55 + uSunGlow * 0.4), sunsetBelt * 0.42 * uSunGlow);

    vec3 moonDir = normalize(uMoonDir);
    float moonDot = max(dot(dir, moonDir), 0.0);
    float moonHalo = pow(moonDot, 900.0) * 1.25 + pow(moonDot, 32.0) * 0.08;
    col += uMoonColor * moonHalo * uMoonGlow;

    // A thin, living haze near the waterline.
    float hazeNoise = hash(floor(dir.xz * 80.0 + uTime * 0.005)) * 0.5;
    col += uHorizon * band * 0.025 * hazeNoise;
    col += (hash(dir.xy * 180.0) - 0.5) * 0.007;

    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class SkySystem {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.time = 0;
    this.starOpacity = 0;
    this.night = 0;
    this.shootingStarTimer = 9;
    this.shootingStarAge = 0;
    this.shootingStarActive = false;

    const skyGeo = new THREE.SphereGeometry(900, 40, 28);
    this.skyMaterial = new THREE.ShaderMaterial({
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new THREE.Color('#0c2338') },
        uMid: { value: new THREE.Color('#8b4c68') },
        uHorizon: { value: new THREE.Color('#ff8b66') },
        uLow: { value: new THREE.Color('#293340') },
        uSunColor: { value: new THREE.Color('#ffc286') },
        uMoonColor: { value: new THREE.Color('#dbe7ff') },
        uSunDir: { value: new THREE.Vector3(0.7, 0.15, -0.6) },
        uMoonDir: { value: new THREE.Vector3(0.4, 0.5, -0.6) },
        uSunGlow: { value: 1 },
        uMoonGlow: { value: 0 },
        uHaze: { value: 1 },
        uTime: { value: 0 },
      },
    });
    this.sky = new THREE.Mesh(skyGeo, this.skyMaterial);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);

    // Sun layers.
    this.sunGroup = new THREE.Group();
    this.sunGroup.renderOrder = 4;
    const sunTex = makeSunTexture();
    const sunDisc = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex,
      color: '#ffe1b0',
      transparent: true,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    }));
    sunDisc.scale.set(84, 84, 1);
    this.sunGroup.add(sunDisc);
    this.sunDisc = sunDisc;
    const glowTex = makeGlowTexture();
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      color: '#ffd097',
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
      depthTest: true,
      fog: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    }));
    sunGlow.scale.set(280, 280, 1);
    this.sunGroup.add(sunGlow);
    this.sunGlowSprite = sunGlow;
    scene.add(this.sunGroup);
    this.sunGroup.visible = false;

    // Moon disc + halo.
    this.moonGroup = new THREE.Group();
    this.moonGroup.renderOrder = 3;
    this.moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({
      map: makeMoonTexture(),
      color: '#edf2e5',
      transparent: true,
      depthWrite: false,
      fog: false,
      toneMapped: false,
    }));
    this.moonDisc.scale.set(46, 46, 1);
    this.moonGroup.add(this.moonDisc);
    this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex,
      color: '#bfd4ff',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      fog: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    }));
    this.moonHalo.scale.set(190, 190, 1);
    this.moonGroup.add(this.moonHalo);
    scene.add(this.moonGroup);
    this.moonGroup.visible = false;

    // Star fields.
    const starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uPixelRatio: { value: this.pixelRatio },
        uOpacity: { value: 0 },
      },
    });
    this.starMaterial = starMat;
    this.stars = new THREE.Points(starField(1800, 760, 91), starMat);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = 0;
    scene.add(this.stars);

    const galaxyMat = starMat.clone();
    galaxyMat.uniforms.uTime = { value: 0 };
    galaxyMat.uniforms.uPixelRatio = { value: this.pixelRatio };
    galaxyMat.uniforms.uOpacity = { value: 0 };
    this.galaxyMaterial = galaxyMat;
    this.galaxy = new THREE.Points(milkyWayField(1400, 770, 132), galaxyMat);
    this.galaxy.frustumCulled = false;
    this.galaxy.renderOrder = 0;
    scene.add(this.galaxy);

    this._buildClouds();
    this._buildShootingStar();
  }

  _buildClouds() {
    const texA = makeCloudTexture(24);
    const texB = makeCloudTexture(73);
    const texC = makeCloudTexture(192);
    this.cloudMaterials = [];
    this.clouds = [];
    const rand = seededRandom(120);
    for (let i = 0; i < 14; i++) {
      const tex = [texA, texB, texC][i % 3];
      const material = new THREE.SpriteMaterial({
        map: tex,
        color: '#f4b28d',
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
        depthTest: true,
        fog: false,
        toneMapped: false,
      });
      this.cloudMaterials.push(material);
      const sprite = new THREE.Sprite(material);
      const side = i < 9 ? 1 : -1;
      const x = side * (70 + rand() * 470) * (i < 9 ? 1 : 0.8);
      const y = 105 + rand() * 200;
      const z = -380 - rand() * 350;
      sprite.position.set(x, y, z);
      const width = 220 + rand() * 300;
      sprite.scale.set(width, width * (0.28 + rand() * 0.16), 1);
      sprite.material.opacity = 0.16 + rand() * 0.23;
      sprite.renderOrder = 2;
      this.scene.add(sprite);
      this.clouds.push({ sprite, baseX: x, baseOpacity: material.opacity, drift: rand() * TAU, speed: 0.2 + rand() * 0.5 });
    }
  }

  _buildShootingStar() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
    this.shootingMaterial = new THREE.LineBasicMaterial({
      color: '#e6efff',
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    this.shootingStar = new THREE.Line(geo, this.shootingMaterial);
    this.shootingStar.frustumCulled = false;
    this.shootingStar.visible = false;
    this.shootingStar.renderOrder = 8;
    this.scene.add(this.shootingStar);
    this.shootingStart = new THREE.Vector3();
    this.shootingDir = new THREE.Vector3();
  }

  setPixelRatio(pixelRatio) {
    this.pixelRatio = pixelRatio;
    this.starMaterial.uniforms.uPixelRatio.value = pixelRatio;
    this.galaxyMaterial.uniforms.uPixelRatio.value = pixelRatio;
  }

  update(dt, palette, time, quality = 2) {
    this.time = time;
    const sunElevation = palette.sunElev;
    const moonElevation = palette.moonElev;
    const sunDir = this._dirFromAngles(palette.sunAzimuth, sunElevation);
    const moonDir = this._dirFromAngles(palette.moonAzimuth, moonElevation);
    this.sunDirection = sunDir;
    this.moonDirection = moonDir;
    this.night = smoothstep(0.05, 0.85, palette.stars) * (1 - smoothstep(4, 28, sunElevation) * 0.4);

    const uniforms = this.skyMaterial.uniforms;
    uniforms.uTop.value.copy(palette.skyTop);
    uniforms.uMid.value.copy(palette.skyMid);
    uniforms.uHorizon.value.copy(palette.skyHorizon);
    uniforms.uLow.value.copy(palette.skyLow);
    uniforms.uSunColor.value.copy(palette.sun);
    uniforms.uMoonColor.value.copy(palette.moon);
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uMoonDir.value.copy(moonDir);
    uniforms.uSunGlow.value = palette.sunGlow;
    uniforms.uMoonGlow.value = palette.moonGlow;
    uniforms.uHaze.value = palette.haze;
    uniforms.uTime.value = time;

    // Celestial sprites.
    const sunVisible = sunElevation > -2.2;
    this.sunGroup.visible = sunVisible;
    if (sunVisible) {
      this.sunGroup.position.copy(sunDir).multiplyScalar(720);
      const fade = smoothstep(-2.2, 2.5, sunElevation) * (0.56 + palette.sunGlow * 0.64);
      this.sunDisc.material.opacity = clamp(fade, 0, 1);
      this.sunDisc.material.color.copy(palette.sun).lerp(new THREE.Color('#fff8e5'), 0.45);
      this.sunDisc.scale.setScalar(lerp(70, 108, smoothstep(6, -1, sunElevation)));
      this.sunGlowSprite.material.opacity = clamp(0.28 + palette.sunGlow * 0.4 * smoothstep(-2, 3, sunElevation), 0, 0.85);
      this.sunGlowSprite.material.color.copy(palette.sun);
      this.sunGlowSprite.scale.setScalar(lerp(260, 390, smoothstep(8, 0, sunElevation)));
    }

    const moonVisible = moonElevation > -2 && palette.moonGlow > 0.01;
    this.moonGroup.visible = moonVisible;
    if (moonVisible) {
      this.moonGroup.position.copy(moonDir).multiplyScalar(700);
      this.moonDisc.material.opacity = clamp(smoothstep(-2, 5, moonElevation) * (0.35 + palette.moonGlow * 0.8), 0, 1);
      this.moonHalo.material.opacity = clamp(palette.moonGlow * 0.42, 0, 0.8);
      this.moonHalo.scale.setScalar(lerp(160, 260, palette.moonGlow));
    }

    this.starOpacity = palette.stars;
    this.starMaterial.uniforms.uTime.value = time;
    this.starMaterial.uniforms.uOpacity.value = palette.stars;
    this.galaxyMaterial.uniforms.uTime.value = time;
    this.galaxyMaterial.uniforms.uOpacity.value = palette.stars * (quality >= 2 ? 1 : 0.55);
    this.stars.visible = palette.stars > 0.008;
    this.galaxy.visible = palette.stars > 0.025 && quality >= 1;

    // Clouds drift extremely slowly and take the colour of the hour.
    for (let i = 0; i < this.clouds.length; i++) {
      const cloud = this.clouds[i];
      const material = cloud.sprite.material;
      material.color.copy(palette.clouds);
      material.color.lerp(palette.sun, palette.stars * 0.02);
      const visibility = quality >= 2 || i < 8 ? 1 : 0.45;
      material.opacity = cloud.baseOpacity * (0.7 + palette.haze * 0.3) * visibility;
      cloud.sprite.position.x = cloud.baseX + Math.sin(time * 0.012 * cloud.speed + cloud.drift) * 12;
      cloud.sprite.visible = quality >= 1 || i < 6;
    }

    this._updateShootingStar(dt, palette, quality);
  }

  _dirFromAngles(azimuth, elevation) {
    const el = elevation / 180 * Math.PI;
    const az = azimuth;
    return new THREE.Vector3(
      Math.sin(az) * Math.cos(el),
      Math.sin(el),
      -Math.cos(az) * Math.cos(el)
    ).normalize();
  }

  _updateShootingStar(dt, palette, quality) {
    if (quality < 1) {
      this.shootingStar.visible = false;
      return;
    }
    if (!this.shootingStarActive) {
      this.shootingStarTimer -= dt;
      if (this.shootingStarTimer <= 0 && palette.stars > 0.45) {
        this.shootingStarActive = true;
        this.shootingStarAge = 0;
        this.shootingStar.visible = true;
        const angle = Math.random() * TAU;
        const height = 0.32 + Math.random() * 0.34;
        this.shootingStart.set(
          Math.cos(angle) * Math.cos(height) * 730,
          Math.sin(height) * 730,
          Math.sin(angle) * Math.cos(height) * 730
        );
        const travelAngle = angle + 0.5 + Math.random() * 0.35;
        this.shootingDir.set(Math.cos(travelAngle) * 0.55, -0.36 - Math.random() * 0.2, Math.sin(travelAngle) * 0.55).normalize();
      }
    } else {
      this.shootingStarAge += dt;
      const duration = 1.6;
      const p = clamp(this.shootingStarAge / duration, 0, 1);
      const head = this.shootingStart.clone().addScaledVector(this.shootingDir, p * 550);
      const trailLen = 160 * (0.3 + Math.sin(p * Math.PI) * 0.7);
      const attr = this.shootingStar.geometry.getAttribute('position');
      const points = 10;
      for (let i = 0; i < points; i++) {
        const t = i / (points - 1);
        const point = head.clone().addScaledVector(this.shootingDir, -trailLen * t);
        attr.setXYZ(i, point.x, point.y, point.z);
      }
      attr.needsUpdate = true;
      this.shootingStar.geometry.computeBoundingSphere();
      this.shootingMaterial.opacity = Math.sin(p * Math.PI) * 0.9;
      if (p >= 1) {
        this.shootingStarActive = false;
        this.shootingStar.visible = false;
        this.shootingStarTimer = 12 + Math.random() * 22;
      }
    }
  }
}
