export const TAU = Math.PI * 2;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, x) => {
  const t = invLerp(a, b, x);
  return t * t * (3 - 2 * t);
};
export const smootherstep = (a, b, x) => {
  const t = invLerp(a, b, x);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
export const easeInOutQuint = (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2);

/** Frame-rate independent exponential smoothing. */
export const damp = (current, target, lambda, dt) => lerp(current, target, 1 - Math.exp(-lambda * dt));

export const dampAngle = (current, target, lambda, dt) => {
  let delta = ((target - current + Math.PI) % TAU) - Math.PI;
  if (delta < -Math.PI) delta += TAU;
  return current + delta * (1 - Math.exp(-lambda * dt));
};

export const randomRange = (rand, a, b) => a + (b - a) * rand();
export const randomInt = (rand, a, b) => Math.floor(randomRange(rand, a, b + 1));
export const choose = (rand, list) => list[Math.floor(rand() * list.length)];

/** Mulberry32 — compact, deterministic, good enough for scenery. */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t) => t * t * (3 - 2 * t);

/** 2D value noise, deterministic with a seed. */
export function makeValueNoise(seed = 1) {
  const rand = seededRandom(seed);
  const perm = new Uint8Array(512);
  const vals = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    perm[i] = i;
    vals[i] = rand() * 2 - 1;
  }
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = perm[i];
    perm[i] = perm[j];
    perm[j] = t;
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = fade(xf);
    const v = fade(yf);
    const aa = vals[perm[(perm[xi & 255] + yi) & 255]];
    const ba = vals[perm[(perm[(xi + 1) & 255] + yi) & 255]];
    const ab = vals[perm[(perm[xi & 255] + yi + 1) & 255]];
    const bb = vals[perm[(perm[(xi + 1) & 255] + yi + 1) & 255]];
    return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
  };
}

export function fbm(noise, x, y, octaves = 4, lacunarity = 2.02, gain = 0.5) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y) * amp;
    norm += amp;
    amp *= gain;
    x *= lacunarity;
    y *= lacunarity;
  }
  return sum / norm;
}

export function formatNumber(n) {
  return Math.round(n).toLocaleString('en-US');
}

export function formatDistance(meters) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`;
  return `${Math.round(meters)} m`;
}

const CLOCK_KEYS = [
  [0.0, 18 * 60 + 36],
  [0.09, 19 * 60 + 10],
  [0.17, 19 * 60 + 50],
  [0.27, 21 * 60 + 30],
  [0.44, 24 * 60 + 30],
  [0.59, 27 * 60],
  [0.72, 28 * 60 + 50],
  [0.81, 29 * 60 + 50],
  [0.9, 31 * 60],
  [0.94, 40 * 60 + 40],
  [1.0, 42 * 60 + 36],
];

export function formatTimeOfDay(phase) {
  // The coast keeps a stylised clock: the night gets its full arc, while the
  // last minutes of daylight are compressed into the final sliver of a loop.
  const p = phaseInDay(phase);
  let i = 0;
  while (i < CLOCK_KEYS.length - 2 && p > CLOCK_KEYS[i + 1][0]) i++;
  const [t0, m0] = CLOCK_KEYS[i];
  const [t1, m1] = CLOCK_KEYS[i + 1];
  const f = clamp((p - t0) / Math.max(0.0001, t1 - t0), 0, 1);
  const totalMinutes = m0 + (m1 - m0) * f;
  const minutes = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = Math.floor(minutes / 60).toString().padStart(2, '0');
  const mm = Math.floor(minutes % 60).toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

export function phaseName(phase) {
  if (phase < 0.045) return '黄金时刻';
  if (phase < 0.115) return '日落';
  if (phase < 0.19) return '暮色';
  if (phase < 0.29) return '掌灯时分';
  if (phase < 0.68) return '星夜';
  if (phase < 0.79) return '月落';
  if (phase < 0.855) return '黎明';
  if (phase < 0.9) return '晨光';
  if (phase < 0.94) return '白昼';
  if (phase < 0.985) return '斜阳';
  return '黄昏';
}

export function phaseInDay(phase) {
  return ((phase % 1) + 1) % 1;
}

export function isNight(phase) {
  const p = phaseInDay(phase);
  return p > 0.21 && p < 0.8;
}

export function isDeepNight(phase) {
  const p = phaseInDay(phase);
  return p > 0.28 && p < 0.72;
}

export function isGolden(phase) {
  const p = phaseInDay(phase);
  return p < 0.16 || p > 0.86;
}

export function pickWeighted(rand, items, weightFn = (item) => item.weight ?? 1) {
  let total = 0;
  for (const item of items) total += Math.max(0, weightFn(item));
  if (total <= 0) return items[0];
  let n = rand() * total;
  for (const item of items) {
    n -= Math.max(0, weightFn(item));
    if (n <= 0) return item;
  }
  return items[items.length - 1];
}

export function projectToScreen(vec3, camera, width, height) {
  const v = vec3.clone().project(camera);
  return {
    x: (v.x * 0.5 + 0.5) * width,
    y: (-v.y * 0.5 + 0.5) * height,
    visible: v.z > -1 && v.z < 1,
  };
}

export function disposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        for (const key of Object.keys(material)) {
          const value = material[key];
          if (value && value.isTexture) value.dispose();
        }
        material.dispose();
      }
    }
  });
}

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
