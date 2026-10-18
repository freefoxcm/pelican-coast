import * as THREE from 'three';
import { clamp, seededRandom, TAU } from './utils.js';

const OCEAN_VERTEX = `
  uniform float uTime;
  uniform float uScroll;
  uniform float uQuality;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vShore;

  float waveHeight(vec2 p, float t, float detail) {
    float x = p.x;
    float z = p.y;
    float h = 0.0;
    h += sin(x * 0.092 + z * 0.061 + t * 0.74) * 0.58;
    h += sin(x * 0.184 - z * 0.129 + t * 1.08) * 0.24;
    h += sin(z * 0.253 + x * 0.056 + t * 0.66) * 0.29;
    h += sin(x * 0.412 + z * 0.287 - t * 1.62) * 0.095 * detail;
    h += sin(z * 0.663 - x * 0.311 + t * 1.88) * 0.042 * detail;
    float shore = smoothstep(20.0, 44.0, x);
    h *= 0.22 + 0.78 * shore;
    float breakers = sin(x * 0.62 - t * 1.45 + z * 0.083) * smoothstep(88.0, 25.0, x) * 0.16;
    return h + breakers;
  }

  void main() {
    vec3 p = position;
    vec2 wp = vec2(p.x, p.z - uScroll);
    float eps = 0.65;
    float h = waveHeight(wp, uTime, uQuality);
    float hx = waveHeight(wp + vec2(eps, 0.0), uTime, uQuality);
    float hz = waveHeight(wp + vec2(0.0, eps), uTime, uQuality);
    p.y += h;
    vec3 n = normalize(vec3(-(hx - h) / eps, 1.0, -(hz - h) / eps));

    vWorldPosition = p;
    vNormal = n;
    vCrest = smoothstep(0.12, 0.72, h);
    vShore = smoothstep(82.0, 23.0, p.x);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const OCEAN_FRAGMENT = `
  uniform float uTime;
  uniform float uScroll;
  uniform float uQuality;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uMoonColor;
  uniform vec3 uDeep;
  uniform vec3 uNear;
  uniform vec3 uFoamColor;
  uniform vec3 uFogColor;
  uniform vec3 uSunDir;
  uniform vec3 uMoonDir;
  uniform vec3 uCameraPos;
  uniform float uSunGlow;
  uniform float uMoonGlow;
  uniform float uStars;
  uniform float uFogDensity;
  varying vec3 vWorldPosition;
  varying vec3 vNormal;
  varying float vCrest;
  varying float vShore;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    vec3 V = normalize(uCameraPos - vWorldPosition);
    vec3 N = normalize(vNormal);

    // Small capillary ripples; detail scales with the quality setting.
    float t = uTime;
    vec2 rp = vec2(vWorldPosition.x, vWorldPosition.z - uScroll);
    float rippleA = sin(rp.x * 1.4 + rp.y * 0.9 + t * 2.2) + sin(rp.x * 0.8 - rp.y * 1.6 - t * 1.7);
    float rippleB = sin(rp.y * 1.8 + rp.x * 0.4 - t * 1.9) + sin(rp.x * 2.2 - rp.y * 0.3 + t * 2.6);
    N = normalize(N + vec3(rippleA * 0.019, 0.0, rippleB * 0.017) * uQuality);

    float shoreLine = 18.5 + sin((vWorldPosition.z - uScroll) * 0.075) * 1.7 + sin((vWorldPosition.z - uScroll) * 0.187 + 1.3) * 0.78;
    float shoreDistance = vWorldPosition.x - shoreLine;
    float shallow = smoothstep(150.0, 18.0, vWorldPosition.x);
    float nearFoamZone = smoothstep(18.0, 2.0, abs(shoreDistance));

    float fresnel = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.2);
    vec3 reflection = reflect(-V, N);
    vec3 skyReflection = mix(uHorizon, uTop, smoothstep(-0.03, 0.46, reflection.y));
    skyReflection += uSunColor * max(dot(reflection, normalize(uSunDir)), 0.0) * 0.10 * uSunGlow;

    vec3 base = mix(uDeep, uNear, clamp(shallow * 0.9, 0.0, 1.0));
    base = mix(base, uNear * 1.18 + vec3(0.012, 0.035, 0.03), pow(shallow, 3.2) * 0.4);
    base *= 0.88 + vCrest * 0.2;

    vec3 color = mix(base, skyReflection, fresnel * 0.66);

    vec3 Lsun = normalize(uSunDir);
    vec3 Lmoon = normalize(uMoonDir);
    vec3 Hsun = normalize(V + Lsun);
    vec3 Hmoon = normalize(V + Lmoon);
    float sunSpec = pow(max(dot(N, Hsun), 0.0), 460.0) * 2.7 + pow(max(dot(N, Hsun), 0.0), 64.0) * 0.20;
    float moonSpec = pow(max(dot(N, Hmoon), 0.0), 330.0) * 1.7 + pow(max(dot(N, Hmoon), 0.0), 32.0) * 0.13;
    float horizonFade = smoothstep(-0.02, 0.15, normalize(Lsun).y);
    color += uSunColor * sunSpec * uSunGlow * horizonFade;
    color += uMoonColor * moonSpec * uMoonGlow;

    // A broken, breathing edge of white water at the beach.
    float n1 = noise(rp * 2.3 + vec2(t * 0.18, t * 0.10));
    float n2 = noise(rp * 4.8 - vec2(t * 0.24, t * 0.06));
    float incoming = sin(rp.x * 0.55 + rp.y * 0.025 - t * 1.6 + n1 * 5.0) * 0.5 + 0.5;
    incoming = smoothstep(0.38, 0.98, incoming);
    float shoreFoam = nearFoamZone * (0.36 + n2 * 0.72 + incoming * 0.42);
    shoreFoam *= smoothstep(-1.5, 2.0, shoreDistance);
    float crestFoam = smoothstep(0.55, 0.95, vCrest + n1 * 0.18) * smoothstep(95.0, 24.0, vWorldPosition.x) * 0.52;
    float breakingBands = incoming * nearFoamZone * smoothstep(0.45, 0.9, n2) * 0.48;
    float foam = clamp(shoreFoam * 1.3 + crestFoam + breakingBands, 0.0, 1.0);
    vec3 foamCol = mix(uFoamColor, uSunColor * 0.72 + 0.22, uSunGlow * 0.12);
    foamCol = mix(foamCol, uMoonColor * 0.85, uStars * 0.18);
    color = mix(color, foamCol, smoothstep(0.03, 0.92, foam) * 0.82);

    // Moonlit glints in the crests.
    float glintHash = hash(floor(rp * 5.0) + vec2(floor(t * 3.0)));
    float glints = pow(glintHash, 20.0) * uStars * smoothstep(0.1, 0.5, vCrest) * 0.55;
    color += uMoonColor * glints;

    // Horizon fog keeps the sea connected to the sky.
    float dist = length(vWorldPosition - uCameraPos);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * dist * dist);
    color = mix(color, uFogColor, clamp(fog, 0.0, 1.0));

    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function makeFoamTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, 'rgba(255,255,255,.92)');
  g.addColorStop(0.28, 'rgba(255,255,255,.55)');
  g.addColorStop(0.7, 'rgba(255,255,255,.1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Ocean {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.time = 0;
    this.quality = 2;
    this.scroll = 0;

    const geo = new THREE.PlaneGeometry(920, 1040, 250, 200);
    geo.rotateX(-Math.PI / 2);
    geo.translate(472, 0.0, -235);
    this.geometry = geo;

    this.uniforms = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uQuality: { value: 1 },
      uTop: { value: new THREE.Color('#0b1d38') },
      uHorizon: { value: new THREE.Color('#ffc08a') },
      uSunColor: { value: new THREE.Color('#ffd2a0') },
      uMoonColor: { value: new THREE.Color('#dbe7ff') },
      uDeep: { value: new THREE.Color('#123c50') },
      uNear: { value: new THREE.Color('#2c737c') },
      uFoamColor: { value: new THREE.Color('#dff1e9') },
      uFogColor: { value: new THREE.Color('#c39786') },
      uFogDensity: { value: 0.0042 },
      uSunDir: { value: new THREE.Vector3(0.6, 0.15, -0.6) },
      uMoonDir: { value: new THREE.Vector3(0.4, 0.55, -0.5) },
      uCameraPos: { value: new THREE.Vector3() },
      uSunGlow: { value: 1 },
      uMoonGlow: { value: 0 },
      uStars: { value: 0 },
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERTEX,
      fragmentShader: OCEAN_FRAGMENT,
      uniforms: this.uniforms,
      fog: false,
    });
    this.material = material;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = false;
    this.mesh.renderOrder = -5;
    scene.add(this.mesh);

    this._buildShoreSpray();
  }

  _buildShoreSpray() {
    const count = 260;
    const rand = seededRandom(719);
    this.sprayCount = count;
    this.sprayData = [];
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const x = 16 + rand() * 13;
      const z = -260 + rand() * 400;
      const y = 0.2 + rand() * 2.2;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const shade = 0.55 + rand() * 0.45;
      colors[i * 3] = shade;
      colors[i * 3 + 1] = shade * 0.98;
      colors[i * 3 + 2] = shade * 0.9;
      this.sprayData.push({
        vx: (rand() - 0.5) * 0.7,
        vy: 0.4 + rand() * 1.4,
        vz: 0.6 + rand() * 1.8,
        phase: rand() * TAU,
        life: rand(),
        speed: 0.15 + rand() * 0.4,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.sprayGeometry = geo;
    const material = new THREE.PointsMaterial({
      map: makeFoamTexture(),
      size: 0.46,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
      color: '#dcefeb',
    });
    this.spray = new THREE.Points(geo, material);
    this.spray.frustumCulled = false;
    this.scene.add(this.spray);
  }

  update(dt, palette, time, scroll, camera) {
    this.time = time;
    this.scroll = scroll;
    this.uniforms.uTime.value = time;
    this.uniforms.uScroll.value = scroll;
    this.uniforms.uTop.value.copy(palette.skyTop);
    this.uniforms.uHorizon.value.copy(palette.skyHorizon);
    this.uniforms.uSunColor.value.copy(palette.sun);
    this.uniforms.uMoonColor.value.copy(palette.moon);
    this.uniforms.uDeep.value.copy(palette.waterDeep);
    this.uniforms.uNear.value.copy(palette.waterNear);
    this.uniforms.uFoamColor.value.copy(palette.skyHorizon).lerp(palette.moon, 0.44).lerp(new THREE.Color('#eaf6ef'), 0.48);
    this.uniforms.uFogColor.value.copy(palette.fog);
    this.uniforms.uFogDensity.value = palette.fogDensity;
    this.uniforms.uSunGlow.value = palette.sunGlow;
    this.uniforms.uMoonGlow.value = palette.moonGlow;
    this.uniforms.uStars.value = palette.stars;
    this.uniforms.uSunDir.value.copy(this.sunDirection || new THREE.Vector3(0.5, 0.2, -0.6).normalize());
    this.uniforms.uMoonDir.value.copy(this.moonDirection || new THREE.Vector3(0.4, 0.6, -0.4).normalize());
    this.uniforms.uCameraPos.value.copy(camera.position);

    const speed = this._lastSpeed || 0;
    const arr = this.sprayGeometry.getAttribute('position');
    const data = this.sprayData;
    const paletteFoam = 0.28 + palette.sunGlow * 0.18 + palette.moonGlow * 0.16;
    this.spray.material.color.copy(paletteFoam > 0.42 ? palette.sun : palette.moon).lerp(new THREE.Color('#dcefeb'), 0.62);
    this.spray.material.opacity = this.quality >= 1 ? paletteFoam : 0;
    for (let i = 0; i < this.sprayCount; i++) {
      const p = data[i];
      p.vx += Math.sin(time * 0.8 + p.phase) * 0.012;
      p.vy -= 0.83 * dt;
      p.vz += 0.01 * dt;
      let x = arr.getX(i) + p.vx * dt;
      let y = arr.getY(i) + p.vy * dt;
      let z = arr.getZ(i) + (p.vz + speed * 0.35) * dt;
      if (y < 0.1 || z > 130 || p.life > 1) {
        p.life = 0;
        x = 16 + Math.random() * 13;
        const shore = 18.5 + Math.sin((z - scroll) * 0.075) * 1.7;
        y = 0.15 + Math.random() * 0.5;
        z = -250 + Math.random() * 350;
        p.vx = (Math.random() - 0.5) * 0.65 - 0.1;
        p.vy = 0.6 + Math.random() * 1.9;
        p.vz = 0.3 + Math.random() * 1.1;
        x = shore + Math.random() * 4.5;
      }
      p.life += dt * p.speed;
      arr.setXYZ(i, x, y, z);
    }
    arr.needsUpdate = true;
    this._lastSpeed = speed;
  }

  setQuality(quality) {
    this.quality = quality;
    this.uniforms.uQuality.value = quality >= 2 ? 1.0 : quality >= 1 ? 0.65 : 0.22;
    this.spray.visible = quality >= 1;
    if (this.spray.material) this.spray.material.size = quality >= 2 ? 0.46 : 0.34;
  }

  setSpeed(speed) {
    this._lastSpeed = speed;
  }
}
