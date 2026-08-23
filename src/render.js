import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { FLOWER_KINDS } from './world.js?v=1';
import { HILLS } from './hill.js?v=1';
import { windAt } from './wind.js?v=1';
import { createGrass } from './grass.js?v=9';
import { EYE_HEIGHT } from './walk.js?v=2';

export const SKY_TOP = 0x529ef0;
export const SKY_BOTTOM = 0xc8e6ff;

// --- Botanical Shading for Flowers, Stems, and Petals (Matching Grass SSS + Sun + Sky + Fog) ---
const FLOWER_VERTEX_SHADER = `
  precision highp float;

  attribute vec3 color;
  attribute float aCenter;
  attribute float aThick;
  attribute float aAo;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vCenter;
  varying vec3 vInstanceColor;
  varying float vThick;
  varying float vAo;

  void main() {
    vColor = color;
    vCenter = aCenter;
    vThick = aThick;
    vAo = aAo;
    vInstanceColor = instanceColor;

    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;

    mat3 normalMat = mat3(modelMatrix * instanceMatrix);
    vNormal = normalize(normalMat * normal);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const FLOWER_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec3 uSunDir;
  uniform vec3 uCameraPos;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vCenter;
  varying vec3 vInstanceColor;
  varying float vThick;
  varying float vAo;

  void main() {
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    vec3 sunDir = normalize(uSunDir);

    // Warm golden-amber pollen stamen center; petals take vibrant instance
    // color with an organic per-petal gradient.
    vec3 pollenColor = vec3(1.15, 0.88, 0.28);
    vec3 baseColor = mix(vInstanceColor * vColor, pollenColor * vColor, vCenter);
    baseColor *= vAo; // ambient occlusion at the petal base / centre

    // Organic botanical lighting (harmonious with grass):
    // Wrapped diffuse keeps shaded sides airy so pastels never go muddy.
    float nDotL = max(0.0, dot(vNormal, sunDir) * 0.5 + 0.5);

    // Translucent Subsurface Scattering — strongest on thin petal tips/edges.
    float translucency = 0.45 + (1.0 - vThick) * 1.35;
    float sss = pow(max(0.0, dot(-vNormal, sunDir)), 2.0) * (0.55 * (1.0 - vCenter * 0.45)) * translucency;

    // Hemispheric sky fill (bright floor = happy pastel read)
    vec3 skyLight = vec3(0.78, 0.90, 1.0) * (0.58 + 0.28 * max(0.0, vNormal.y));

    // Sun light with warm golden tone
    vec3 sunLight = vec3(1.0, 0.94, 0.78) * (nDotL * 0.48 + sss);

    // Soft specular sheen on the waxy petal surface
    vec3 halfV = normalize(sunDir + viewDir);
    float spec = pow(max(0.0, dot(vNormal, halfV)), 28.0) * (0.10 + (1.0 - vThick) * 0.12);
    vec3 specular = vec3(1.0, 0.97, 0.90) * spec;

    // Soft velvety rim sheen (Fresnel)
    float fresnel = pow(1.0 - max(0.0, dot(vNormal, viewDir)), 2.8) * 0.32;

    vec3 finalColor = baseColor * (skyLight + sunLight) + specular + vec3(1.0, 0.96, 0.88) * fresnel;

    // Atmospheric distance fog
    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float fogFactor = clamp((depth - fogNear) / (fogFar - fogNear), 0.0, 1.0);
    fogFactor = pow(fogFactor, 1.2);
    finalColor = mix(finalColor, fogColor, fogFactor);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

const STEM_VERTEX_SHADER = `
  precision highp float;

  attribute vec3 color;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vY;
  varying vec3 vTint;

  void main() {
    vColor = color;
    vY = position.y; // 0 at the root, 1 at the crown (geometry pre-translated)
    vTint = vec3(0.0);
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor; // the bud's own flower colour, set per instance
    #endif

    vec4 worldPos = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;

    mat3 normalMat = mat3(modelMatrix * instanceMatrix);
    vNormal = normalize(normalMat * normal);

    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

const STEM_FRAGMENT_SHADER = `
  precision highp float;

  uniform vec3 uSunDir;
  uniform vec3 uCameraPos;
  uniform vec3 fogColor;
  uniform float fogNear;
  uniform float fogFar;

  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying vec3 vColor;
  varying float vY;
  varying vec3 vTint;

  void main() {
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    vec3 sunDir = normalize(uSunDir);

    // Blend a whisper of the flower's own colour into the top third of the
    // stem — each stem quietly belongs to its bloom.
    float crownMix = smoothstep(0.55, 1.0, vY) * 0.35;
    vec3 baseColor = mix(vColor, vTint, crownMix);

    // Wrapped diffuse + bright sky floor: airy green, never black.
    float nDotL = max(0.0, dot(vNormal, sunDir) * 0.5 + 0.5);
    float sss = pow(max(0.0, dot(-vNormal, sunDir)), 2.0) * 0.38;

    vec3 skyLight = vec3(0.78, 0.90, 1.0) * (0.58 + 0.28 * max(0.0, vNormal.y));
    vec3 sunLight = vec3(1.0, 0.94, 0.78) * (nDotL * 0.5 + sss);

    vec3 finalColor = baseColor * (skyLight + sunLight);

    float depth = gl_FragCoord.z / gl_FragCoord.w;
    float fogFactor = clamp((depth - fogNear) / (fogFar - fogNear), 0.0, 1.0);
    fogFactor = pow(fogFactor, 1.2);
    finalColor = mix(finalColor, fogColor, fogFactor);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Deterministic -1..1 pseudo-random from an integer seed (stable per petal).
function petalTint(seed) {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

// A petal as a curved, cupped surface: a rounded teardrop outline warped into
// a shallow spoon (tip and edges arch toward +z) so blooms read as organic
// petals. Attributes: color (brightness + per-petal tint), aCenter=0,
// aThick (thin translucent tip/edges, thick base), aAo (ambient occlusion at
// the base where the petal meets the centre).
function curvedPetal(len, wide, tint = 0) {
  const wSeg = 7;
  const lSeg = 9;
  const g = new THREE.PlaneGeometry(len, wide, wSeg, lSeg);
  // PlaneGeometry lies in XY: x = length (base -len/2 .. tip +len/2), y = width.
  const pos = g.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const centers = new Float32Array(pos.count);
  const thick = new Float32Array(pos.count);
  const ao = new Float32Array(pos.count);
  const halfLen = len * 0.5;
  const halfWide = wide * 0.5;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = THREE.MathUtils.clamp((x + halfLen) / len, 0, 1); // 0 base .. 1 tip
    const u = THREE.MathUtils.clamp(y / halfWide, -1, 1);       // -1..1 across width

    // Rounded teardrop outline: narrow root, widest ~2/5 up, pinched tip.
    const raw = Math.sin(Math.PI * THREE.MathUtils.clamp(t * 1.2 - 0.02, 0, 1));
    const outline = Math.pow(raw, 0.75);
    const widthScale = 0.16 + 0.84 * outline;
    pos.setX(i, x);
    pos.setY(i, y * widthScale);

    // Shallow spoon curl: tip arches toward +z, edges lift a touch (concave).
    const cup = 0.28 * len;
    pos.setZ(i, cup * Math.pow(t, 1.4) + cup * 0.35 * u * u * t);

    // Brightness gradient (brighter toward the tip) plus a subtle warm/cool
    // per-petal tint so petals within one bloom differ like a real flower.
    const bright = 0.70 + t * 0.38;
    colors[i * 3] = bright * (1.0 + tint * 0.09);
    colors[i * 3 + 1] = bright * 0.98 * (1.0 - tint * 0.05);
    colors[i * 3 + 2] = bright * 0.94 * (1.0 - tint * 0.12);
    centers[i] = 0.0;
    // Thin translucent edges and tip, thicker base and centre vein.
    thick[i] = 0.18 + 0.82 * (1.0 - t) * (1.0 - u * u * 0.6);
    // Ambient occlusion: darker where the petal meets the centre.
    ao[i] = 0.55 + 0.45 * Math.min(1, t * 1.3);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 1));
  g.setAttribute('aThick', new THREE.Float32BufferAttribute(thick, 1));
  g.setAttribute('aAo', new THREE.Float32BufferAttribute(ao, 1));
  g.computeVertexNormals(); // smooth normals across the shared grid vertices
  return g.toNonIndexed();  // non-indexed so mergeGeometries accepts it
}

// Fuzzy flower centre: a flattened pollen dome ringed by small floret buds.
function buildFlowerCenter(centerRadius) {
  const parts = [];
  const dome = new THREE.SphereGeometry(centerRadius, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.55);
  dome.scale(1, 1, 0.72);
  parts.push(dome.toNonIndexed());
  const floretR = centerRadius * 0.5;
  const floretSize = centerRadius * 0.3;
  const florets = 8;
  for (let i = 0; i < florets; i++) {
    const a = (i / florets) * Math.PI * 2 + (i % 2) * 0.4;
    const fl = new THREE.SphereGeometry(floretSize, 8, 6);
    fl.translate(Math.cos(a) * floretR, Math.sin(a) * floretR, centerRadius * 0.42);
    parts.push(fl.toNonIndexed());
  }
  const merged = mergeGeometries(parts);
  const count = merged.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const centers = new Float32Array(count);
  const thick = new Float32Array(count);
  const ao = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = 1.0;
    colors[i * 3 + 1] = 0.82;
    colors[i * 3 + 2] = 0.32;
    centers[i] = 1.0;
    thick[i] = 1.0; // centre is opaque, not translucent
    ao[i] = 1.0;
  }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 1));
  merged.setAttribute('aThick', new THREE.Float32BufferAttribute(thick, 1));
  merged.setAttribute('aAo', new THREE.Float32BufferAttribute(ao, 1));
  return merged;
}

function buildFlowerGeometry({ petalRadius = 0.5, centerRadius = 0.26, petals = 5, spread = 1.0 } = {}) {
  const parts = [];
  // Two overlapping petal layers, each offset by half a petal. The inner
  // layer cups more upright, the outer opens flatter, and every petal is
  // tinted slightly differently so the bloom reads organic, not cloned.
  for (let layer = 0; layer < 2; layer++) {
    const tilt = layer === 0 ? 0.65 : 1.05; // steeper cup so blooms read dimensional
    for (let i = 0; i < petals; i++) {
      const a = ((i + layer * 0.5) / petals) * Math.PI * 2;
      const g = curvedPetal(petalRadius * 0.9, petalRadius * 0.55, petalTint(i * 2 + layer));
      g.rotateY(-tilt); // lift the tip toward the viewer
      g.rotateZ(a);     // fan around the crown
      g.translate(
        Math.cos(a) * petalRadius * 1.05 * spread,
        Math.sin(a) * petalRadius * 1.05 * spread,
        (layer === 0 ? 0 : -0.24) // back layer further behind to prevent z-fighting at close range
      );
      parts.push(g);
    }
  }
  parts.push(buildFlowerCenter(centerRadius));
  return mergeGeometries(parts);
}

const KIND_GEOMETRIES = FLOWER_KINDS.map((k) =>
  buildFlowerGeometry({ petalRadius: 0.5, centerRadius: k.bigCenter, petals: k.petals, spread: k.spread })
);
// A small lanceolate leaf blade (pointed at both ends), drooping slightly.
function buildLeaf() {
  const g = new THREE.PlaneGeometry(0.16, 0.05, 1, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i); // -0.08 .. 0.08
    const t = THREE.MathUtils.clamp((x + 0.08) / 0.16, 0, 1);
    const w = Math.sin(Math.PI * t);
    pos.setY(i, pos.getY(i) * w);
    pos.setZ(i, -0.04 * t);   // gentle droop toward the ground
    pos.setX(i, x + 0.06);    // base tucks into the stem, tip points outward
  }
  g.computeVertexNormals();
  return g.toNonIndexed();
}

// A slender stem for the collectible flowers: tapered green cylinder with
// three alternating leaves, rising from the ground (y=0..1, scaled to world
// length at placement).
function buildStemGeometry() {
  const cyl = new THREE.CylinderGeometry(0.03, 0.05, 1, 6);
  cyl.translate(0, 0.5, 0);
  const parts = [cyl.toNonIndexed()]; // CylinderGeometry is indexed; leaves aren't
  const leafHeights = [0.34, 0.58, 0.82];
  for (let i = 0; i < leafHeights.length; i++) {
    const leaf = buildLeaf();
    leaf.rotateY(i * 2.1 + 0.4);
    leaf.translate(0, leafHeights[i], 0);
    parts.push(leaf);
  }
  const merged = mergeGeometries(parts);
  const pos = merged.attributes.position;
  const col = new Float32Array(pos.count * 3);
  // Fresh yellow-green: darker at the grass shadow, brightening to the crown.
  const root = new THREE.Color(0x4a722f);
  const top = new THREE.Color(0xa9cf6d);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const c = root.clone().lerp(top, THREE.MathUtils.clamp(y, 0, 1));
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return merged;
}
const STEM_GEO = buildStemGeometry();
const STEM_LEN = 3.2;
const CROWN_LIFT = STEM_LEN + 0.35; // crown height above the terrain (stands above grass)

const KIND_SCALE = [1.0, 1.05, 0.92, 1.1];

// A low-poly mountain range on the horizon — the Canadian Rockies seen from
// the Alberta plains. Built as layered ridgelines, not cones: each ridge is a
// chain of crest points whose height comes from massif noise (broad peaks
// plus mid and fine jitter), so the range reads as believable massifs with
// saddles and valleys rather than a row of spikes. Front layers are split
// into separate chains whose gaps are valleys opening onto the ranges
// behind. Facets are flat-shaded so the sun and rim light shape the rock.
function buildMountainRange() {
  const pos = [];
  const col = [];
  const clamp = THREE.MathUtils.clamp;
  const HAZE = [0.78, 0.90, 1.0];
  const push = (x, y, z, r, g, b) => { pos.push(x, y, z); col.push(r, g, b); };

  // 1D value noise (hash lattice + smoothstep) — the base for ridged noise.
  function vnoise(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const u = f * f * (3 - 2 * f);
    const a = hashOf(i, seed);
    const b = hashOf(i + 1, seed);
    return a + (b - a) * u; // 0..1
  }
  function hashOf(n, seed) {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  // Ridged multifractal (1D): folds noise into sharp V-shaped ridges and
  // weights each octave by how prominent the previous ridges were, so the
  // biggest massifs carry the most detail — the classic mountain-range
  // generator (Acerola / Josh's Channel / The Mountains of Madness). This
  // gives jagged skylines; plain additive noise only makes smooth bumps.
  function ridged(a, seed) {
    let amp = 0.5, freq = 1, sum = 0, norm = 0, prev = 1;
    for (let o = 0; o < 5; o++) {
      let n = 1 - Math.abs(vnoise(a * freq + seed * 13.7, seed + o * 101) * 2 - 1);
      n *= n;
      const w = Math.pow(Math.max(0, Math.min(1, prev * 1.5)), 0.8);
      sum += n * amp * w;
      norm += amp * w;
      prev = n;
      amp *= 0.5;
      freq *= 2.1;
    }
    return sum / norm; // 0..1
  }

  // Massif envelope (where big peaks cluster) modulated by ridged detail, so
  // crests are sharp and jagged while the valleys between massifs stay low.
  function profile(a, peaks, seed) {
    let env = 0;
    for (const p of peaks) env = Math.max(env, p.h * Math.exp(-((a - p.a) ** 2) / (2 * p.w * p.w)));
    const r = ridged(a * 1.8 + seed, seed);
    return Math.max(4, env * (0.30 + 1.30 * Math.pow(r, 1.25)));
  }

  const hazed = (c, k) => [
    c[0] + (HAZE[0] - c[0]) * k,
    c[1] + (HAZE[1] - c[1]) * k,
    c[2] + (HAZE[2] - c[2]) * k,
  ];

  // One ridgeline: front and back faces fan from the crest down to the plain.
  function ridgeChain(o) {
    const n = o.n;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const taper = Math.pow(0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1)), 0.7);
      const a = o.a0 + (o.a1 - o.a0) * t;
      const r = o.r0 + (o.r1 - o.r0) * t + (Math.random() - 0.5) * 3;
      const h = profile(a, o.peaks, o.seed) * taper;
      pts.push({ a, r, h });
    }
    // Per-point colours: crest (rock -> snow), front base (rock), back base (shade).
    const crestC = (h) => {
      if (o.green) {
        const t = clamp(h / o.maxH, 0, 1);
        return [(0.34 + 0.20 * t) * o.tint, (0.40 + 0.20 * t) * o.tint, (0.26 + 0.14 * t) * o.tint];
      }
      const sn = clamp((h - o.snowLine) / o.snowBand, 0, 1);
      return [
        (o.rock[0] + (o.snow[0] - o.rock[0]) * sn) * o.tint,
        (o.rock[1] + (o.snow[1] - o.rock[1]) * sn) * o.tint,
        (o.rock[2] + (o.snow[2] - o.rock[2]) * sn) * o.tint,
      ];
    };
    const F = [], C = [], B = [];
    const cF = [], cC = [], cB = [];
    for (const p of pts) {
      const sa = Math.sin(p.a), ca = Math.cos(p.a);
      C.push([p.r * sa, p.h, -p.r * ca]);
      F.push([(p.r - o.front) * sa, o.baseY, -(p.r - o.front) * ca]);
      B.push([(p.r + o.back) * sa, o.baseY - 1, -(p.r + o.back) * ca]);
      cC.push(hazed(crestC(p.h), 0.10 * (1 - clamp(p.h / 120, 0, 1))));
      const rock = o.green ? [0.30, 0.36, 0.24] : [o.rock[0] * 0.86, o.rock[1] * 0.86, o.rock[2] * 0.86];
      const dark = o.green ? [0.21, 0.26, 0.16] : [o.rockDark[0], o.rockDark[1], o.rockDark[2]];
      cF.push(hazed(rock, 0.5));
      cB.push(hazed(dark, 0.55));
    }
    for (let i = 0; i < n - 1; i++) {
      const j = i + 1;
      const tri = (v1, c1, v2, c2, v3, c3) => {
        push(v1[0], v1[1], v1[2], c1[0], c1[1], c1[2]);
        push(v2[0], v2[1], v2[2], c2[0], c2[1], c2[2]);
        push(v3[0], v3[1], v3[2], c3[0], c3[1], c3[2]);
      };
      // front face (camera side)
      tri(F[i], cF[i], C[i], cC[i], F[j], cF[j]);
      tri(C[i], cC[i], C[j], cC[j], F[j], cF[j]);
      // back face (shadow side)
      tri(C[i], cC[i], B[i], cB[i], C[j], cC[j]);
      tri(B[i], cB[i], B[j], cB[j], C[j], cC[j]);
    }
  }

  // --- Back range: three separated snowy massif groups. Gaps between the
  // groups are valleys that drop all the way to the plain, so the range
  // reads as massifs, not a continuous wall.
  ridgeChain({
    n: 30, a0: -1.2, a1: -0.55, r0: 330, r1: 352, front: 5, back: 12, baseY: -2,
    peaks: [{ a: -1.05, h: 86, w: 0.22 }, { a: -0.75, h: 68, w: 0.18 }],
    seed: 1.7, snowLine: 66, snowBand: 16,
    rock: [0.54, 0.58, 0.66], rockDark: [0.28, 0.31, 0.38], snow: [0.94, 0.97, 1.0],
    tint: 0.99, green: false,
  });
  ridgeChain({
    n: 34, a0: -0.3, a1: 0.3, r0: 318, r1: 344, front: 5, back: 12, baseY: -2,
    peaks: [{ a: -0.1, h: 92, w: 0.20 }, { a: 0.15, h: 78, w: 0.18 }],
    seed: 2.9, snowLine: 66, snowBand: 16,
    rock: [0.55, 0.59, 0.67], rockDark: [0.29, 0.32, 0.39], snow: [0.94, 0.97, 1.0],
    tint: 1.02, green: false,
  });
  ridgeChain({
    n: 30, a0: 0.55, a1: 1.2, r0: 332, r1: 356, front: 5, back: 12, baseY: -2,
    peaks: [{ a: 0.82, h: 88, w: 0.22 }, { a: 1.12, h: 64, w: 0.18 }],
    seed: 4.1, snowLine: 66, snowBand: 16,
    rock: [0.53, 0.57, 0.65], rockDark: [0.27, 0.30, 0.37], snow: [0.94, 0.97, 1.0],
    tint: 0.98, green: false,
  });

  // --- Distant continuations: the range recedes into the plain instead of
  // stopping. Low, hazy ridges fade out toward ±2.9 rad (≈166°) so the edge
  // is beyond any drag-look angle — no hard cliff from any view.
  ridgeChain({
    n: 26, a0: -2.9, a1: -1.22, r0: 350, r1: 372, front: 4, back: 10, baseY: -2,
    peaks: [{ a: -2.2, h: 30, w: 0.5 }, { a: -1.7, h: 26, w: 0.3 }],
    seed: 11.2, snowLine: 999, snowBand: 1,
    rock: [0.55, 0.59, 0.67], rockDark: [0.29, 0.32, 0.39], snow: [0.94, 0.97, 1.0],
    tint: 0.96, green: false,
  });
  ridgeChain({
    n: 26, a0: 1.22, a1: 2.9, r0: 354, r1: 374, front: 4, back: 10, baseY: -2,
    peaks: [{ a: 1.7, h: 26, w: 0.3 }, { a: 2.2, h: 30, w: 0.5 }],
    seed: 12.4, snowLine: 999, snowBand: 1,
    rock: [0.55, 0.59, 0.67], rockDark: [0.29, 0.32, 0.39], snow: [0.94, 0.97, 1.0],
    tint: 0.96, green: false,
  });

  // --- Mid ridges: sit in front of the valley mouths, lower than the back
  // massifs, so the valleys read as depth-layered passes onto the range.
  ridgeChain({
    n: 22, a0: -0.55, a1: -0.2, r0: 272, r1: 290, front: 4, back: 10, baseY: -2,
    peaks: [{ a: -0.4, h: 48, w: 0.20 }, { a: -0.28, h: 40, w: 0.16 }],
    seed: 5.3, snowLine: 999, snowBand: 1,
    rock: [0.52, 0.56, 0.63], rockDark: [0.27, 0.30, 0.36], snow: [0.94, 0.97, 1.0],
    tint: 1.03, green: false,
  });
  ridgeChain({
    n: 22, a0: 0.2, a1: 0.55, r0: 268, r1: 288, front: 4, back: 10, baseY: -2,
    peaks: [{ a: 0.35, h: 50, w: 0.20 }, { a: 0.48, h: 40, w: 0.16 }],
    seed: 6.6, snowLine: 999, snowBand: 1,
    rock: [0.52, 0.56, 0.63], rockDark: [0.27, 0.30, 0.36], snow: [0.94, 0.97, 1.0],
    tint: 0.97, green: false,
  });

  // --- Pine foothills: the nearest broken chain of forested ridges.
  const foot = (o) => ridgeChain({ front: 3, back: 8, baseY: -2, green: true, maxH: 30,
    snowLine: 999, snowBand: 1, tint: 1.0, ...o });
  foot({ n: 16, a0: -1.1, a1: -0.75, r0: 230, r1: 244,
    peaks: [{ a: -0.95, h: 24, w: 0.20 }], seed: 7.2 });
  foot({ n: 16, a0: -0.4, a1: -0.05, r0: 226, r1: 240,
    peaks: [{ a: -0.25, h: 20, w: 0.18 }], seed: 8.4 });
  foot({ n: 16, a0: 0.25, a1: 0.6, r0: 228, r1: 242,
    peaks: [{ a: 0.42, h: 22, w: 0.20 }], seed: 9.6 });
  foot({ n: 16, a0: 0.95, a1: 1.3, r0: 230, r1: 246,
    peaks: [{ a: 1.15, h: 26, w: 0.22 }], seed: 10.8 });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    vertexColors: true, flatShading: true, side: THREE.DoubleSide, fog: false,
  }));
  mesh.frustumCulled = false;
  return mesh;
}

export function initRender(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
  renderer.setSize(window.innerWidth, window.innerHeight);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY_BOTTOM, 75, 380);
  const camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 10, 40);

  // Sky dome.
  const skyGeo = new THREE.SphereGeometry(500, 24, 12);
  const skyPos = skyGeo.attributes.position;
  const skyColors = [];
  const top = new THREE.Color(SKY_TOP);
  const bottom = new THREE.Color(SKY_BOTTOM);
  for (let i = 0; i < skyPos.count; i++) {
    const t = THREE.MathUtils.clamp(skyPos.getY(i) / 500, 0, 1);
    skyColors.push(top.r * t + bottom.r * (1 - t), top.g * t + bottom.g * (1 - t), top.b * t + bottom.b * (1 - t));
  }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyColors, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true }));
  scene.add(sky);

  // --- Infinite Dynamic GPU Terrain: A continuous rolling landscape generated
  // dynamically on the GPU. Centered on the camera and snapped to the grid so
  // it extends infinitely in all directions with zero seams or disappearing edges.
  const hp = HILLS.params;
  const terrainGeo = new THREE.PlaneGeometry(900, 900, 160, 160);
  terrainGeo.rotateX(-Math.PI / 2);

  const terrainMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCameraPos: { value: new THREE.Vector3() },
      uSunDir: { value: new THREE.Vector3(40, 70, 25).normalize() },
      uHillsParams1: { value: new THREE.Vector4(hp.a1, hp.f1x, hp.p1x, hp.f1z) },
      uHillsParams2: { value: new THREE.Vector4(hp.p1z, hp.b1, hp.f2x, hp.p2x) },
      uHillsParams3: { value: new THREE.Vector4(hp.f2z, hp.p2z, hp.offset, 0) },
      fogColor: { value: new THREE.Color(SKY_BOTTOM) },
      fogNear: { value: 75 },
      fogFar: { value: 380 },
    },
    vertexShader: `
      precision highp float;

      uniform vec3 uCameraPos;
      uniform vec4 uHillsParams1;
      uniform vec4 uHillsParams2;
      uniform vec4 uHillsParams3;

      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElevation;

      float getHillHeight(float x, float z) {
        float a1 = uHillsParams1.x;
        float f1x = uHillsParams1.y;
        float p1x = uHillsParams1.z;
        float f1z = uHillsParams1.w;
        
        float p1z = uHillsParams2.x;
        float b1 = uHillsParams2.y;
        float f2x = uHillsParams2.z;
        float p2x = uHillsParams2.w;
        
        float f2z = uHillsParams3.x;
        float p2z = uHillsParams3.y;
        float hillOffset = uHillsParams3.z;
        
        return hillOffset + 
          a1 * sin(x * f1x + p1x) * sin(z * f1z + p1z) + 
          b1 * sin(x * f2x + p2x) * sin(z * f2z + p2z);
      }

      void main() {
        // Snap to grid spacing so vertex coordinates don't swim during flight
        float snap = 5.0;
        float snapX = floor(uCameraPos.x / snap) * snap;
        float snapZ = floor(uCameraPos.z / snap) * snap;

        float wx = position.x + snapX;
        float wz = position.z + snapZ;
        float wy = getHillHeight(wx, wz);

        vWorldPos = vec3(wx, wy, wz);
        vElevation = wy;

        // Analytical normals for perfectly smooth hill shading
        float dhdx = 
          uHillsParams1.x * uHillsParams1.y * cos(wx * uHillsParams1.y + uHillsParams1.z) * sin(wz * uHillsParams1.w + uHillsParams2.x) +
          uHillsParams2.y * uHillsParams2.z * cos(wx * uHillsParams2.z + uHillsParams2.w) * sin(wz * uHillsParams3.x + uHillsParams3.y);
        
        float dhdz = 
          uHillsParams1.x * uHillsParams1.w * sin(wx * uHillsParams1.y + uHillsParams1.z) * cos(wz * uHillsParams1.w + uHillsParams2.x) +
          uHillsParams2.y * uHillsParams3.x * sin(wx * uHillsParams2.z + uHillsParams2.w) * cos(wz * uHillsParams3.x + uHillsParams3.y);

        vNormal = normalize(vec3(-dhdx, 1.0, -dhdz));

        gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPos, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;

      uniform float uTime;
      uniform vec3 uCameraPos;
      uniform vec3 uSunDir;
      uniform vec3 fogColor;
      uniform float fogNear;
      uniform float fogFar;

      varying vec3 vWorldPos;
      varying vec3 vNormal;
      varying float vElevation;

      // Organic triangular-axis wave interference (zero checkerboard artifacts)
      float triWave(vec2 p, float freq) {
        vec2 q = p * freq;
        float w1 = sin(q.x);
        float w2 = sin(-0.5 * q.x + 0.866 * q.y);
        float w3 = sin(-0.5 * q.x - 0.866 * q.y);
        return (w1 + w2 + w3) * 0.3333;
      }

      void main() {
        vec2 pos = vWorldPos.xz;
        float distFromCam = length(pos - uCameraPos.xz);

        // Elevation & Slope parameters:
        float elevNorm = clamp((vElevation + 6.0) / 12.0, 0.0, 1.0);

        // Non-linear domain warping to create organic meadow contours
        vec2 warp = vec2(
          sin(pos.x * 0.032 + pos.y * 0.024),
          cos(pos.x * 0.024 - pos.y * 0.038)
        );
        vec2 warpedPos = pos + warp * 16.0;

        // --- Near Turf Shading (Base under 3D grass bouquet)
        vec3 cSoil = vec3(0.18, 0.30, 0.12);
        vec3 cLush = vec3(0.28, 0.46, 0.16);
        vec3 nearBase = mix(cSoil, cLush, elevNorm);

        // Smooth non-checkerboard near organic variations
        float nearVariation = (sin(pos.x * 0.3 + sin(pos.y * 0.4)) + cos(pos.y * 0.3 + sin(pos.x * 0.35))) * 0.025;
        nearBase += vec3(nearVariation, nearVariation * 1.3, nearVariation * 0.4);

        // --- Distant Procedural Meadow Landscape (blends in smoothly from 45m to 105m)
        float farBlend = smoothstep(45.0, 105.0, distFromCam);

        // 1. Organic botanical patches (large rolling meadow zones)
        float macroPattern = triWave(warpedPos, 0.045);
        float midPattern   = triWave(warpedPos + vec2(17.3, 41.8), 0.11);
        float meadowNoise  = macroPattern * 0.65 + midPattern * 0.35;

        // 2. Botanical color palette
        vec3 colMeadow = vec3(0.30, 0.52, 0.18); // Classic prairie sage-olive
        vec3 colWheat  = vec3(0.56, 0.64, 0.24); // Golden rye on sunlit hilltops
        vec3 colClover = vec3(0.16, 0.34, 0.10); // Deep velvety clover in valley hollows

        // Blend colors based on organic terrain topology (elevation + organic noise)
        float ridgeFactor = smoothstep(0.35, 0.85, elevNorm + meadowNoise * 0.35);
        float valleyFactor = smoothstep(0.45, 0.15, elevNorm - meadowNoise * 0.30);

        vec3 farMeadow = mix(colMeadow, colWheat, ridgeFactor);
        farMeadow = mix(farMeadow, colClover, valleyFactor);

        // 3. Fine grass tufts & stippling (rotated non-grid coordinates, distance-attenuated)
        mat2 rot45 = mat2(0.707, -0.707, 0.707, 0.707);
        vec2 rotPos = rot45 * pos;
        float tuftA = sin(rotPos.x * 1.8 + sin(rotPos.y * 1.5)) * 0.5 + 0.5;
        float tuftB = sin(pos.x * 3.4 - pos.y * 2.6) * 0.5 + 0.5;
        
        float microAtten = 1.0 - smoothstep(90.0, 240.0, distFromCam);
        float grassStipple = (tuftA * 0.6 + tuftB * 0.4 - 0.5) * microAtten * 0.14;
        farMeadow += vec3(grassStipple * 1.1, grassStipple * 1.4, grassStipple * 0.5);

        // 4. Harmonious rolling wind wave swells across distant hills
        float distAlongWind = -vWorldPos.z;
        float distCrossWind = vWorldPos.x;
        float wavePhase = distAlongWind * 0.24 - uTime * 1.25 + sin(distCrossWind * 0.035) * 0.45;
        float gustWave = sin(wavePhase) * 0.5 + 0.5;
        float gustSheen = gustWave * gustWave * (0.07 + 0.06 * elevNorm);
        farMeadow += vec3(0.10, 0.13, 0.03) * gustSheen;

        // Seamless transition from near turf to far meadow
        vec3 baseColor = mix(nearBase, farMeadow, farBlend);

        vec3 sunDir = normalize(uSunDir);
        float nDotL = max(0.0, dot(vNormal, sunDir));
        vec3 sunLight = vec3(1.0, 0.94, 0.78) * (nDotL * 0.68 + 0.22);
        vec3 skyLight = vec3(0.75, 0.88, 1.0) * 0.48;

        vec3 finalColor = baseColor * (skyLight + sunLight);

        float depth = gl_FragCoord.z / gl_FragCoord.w;
        float fogFactor = clamp((depth - fogNear) / (fogFar - fogNear), 0.0, 1.0);
        fogFactor = pow(fogFactor, 1.2);
        finalColor = mix(finalColor, fogColor, fogFactor);

        gl_FragColor = vec4(finalColor, 1.0);
      }
    `,
  });

  const ground = new THREE.Mesh(terrainGeo, terrainMat);
  ground.receiveShadow = true;
  ground.frustumCulled = false;
  scene.add(ground);

  // --- Grass: A lush, billowy meadow across 3 botanical varieties
  // (Prairie Meadow, Tall Golden Rye, and Broad Clover) with Euler Elastica curves.
  const grass = createGrass({
    scene,
    hillsParams: hp,
    skyBottom: SKY_BOTTOM,
  });  // --- Flower, Stem & Mother Materials (Unified with Grass SSS & Lighting) ---
  const flowerCrownMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(40, 70, 25).normalize() },
      uCameraPos: { value: new THREE.Vector3() },
      fogColor: { value: new THREE.Color(SKY_BOTTOM) },
      fogNear: { value: 75 },
      fogFar: { value: 380 },
    },
    vertexShader: FLOWER_VERTEX_SHADER,
    fragmentShader: FLOWER_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
  });

  const stemMat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: new THREE.Vector3(40, 70, 25).normalize() },
      uCameraPos: { value: new THREE.Vector3() },
      fogColor: { value: new THREE.Color(SKY_BOTTOM) },
      fogNear: { value: 75 },
      fogFar: { value: 380 },
    },
    vertexShader: STEM_VERTEX_SHADER,
    fragmentShader: STEM_FRAGMENT_SHADER,
    side: THREE.DoubleSide,
  });

  // Global shading: warm key sun from one side, cold sky fill above, and a
  // soft rim light from the opposite side so every surface — hills, flowers
  // and especially the tumbling petals — reads with form and a lit rim.
  const ambient = new THREE.HemisphereLight(0xcfe8ff, 0x7a9e4a, 0.95);
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
  sun.position.set(40, 70, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 220;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  const rim = new THREE.DirectionalLight(0xbfe4ff, 0.55);
  rim.position.set(-45, 20, -30);
  scene.add(ambient, sun, rim);
  ground.receiveShadow = true; // hills catch shade from flowers/petals
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // --- Buds (one InstancedMesh per kind, child of world) ---
  let budMeshes = [];
  let stemMeshes = [];
  let budData = [];
  let budLocal = [];
  // Clouds: fluffy cumulus built from vertex-shaded puffs. Colors are baked
  // into the geometry (white tops, soft blue-grey bellies) with an unlit
  // material, so scene lights can never tint them green or pink. They sit
  // high and AHEAD of the flight path — you see part of a cloud, naturally.
  const clouds = [];
  const puffGeo = new THREE.SphereGeometry(1, 14, 11);
  {
    const pos = puffGeo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const top = new THREE.Color(0xffffff);
    const bottom = new THREE.Color(0xd7deeb);
    for (let i = 0; i < pos.count; i++) {
      const t = THREE.MathUtils.clamp((pos.getY(i) + 1) / 2, 0, 1);
      const c = bottom.clone().lerp(top, Math.pow(t, 0.8));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    puffGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }
  const puffMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 });
  function makeCumulus() {
    const g = new THREE.Group();
    const n = 7 + Math.floor(Math.random() * 4);
    let x = 0;
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const r = 4.4 + Math.random() * 2.6 - Math.abs(t - 0.5) * 3.4; // tallest mid-cloud
      const puff = new THREE.Mesh(puffGeo, puffMat);
      puff.position.set(x, r * 0.24 + Math.random() * r * 0.42, (Math.random() - 0.5) * r * 0.9);
      puff.scale.set(r, r * (0.6 + Math.random() * 0.18), r * 0.85);
      g.add(puff);
      x += r * 0.82;
    }
    const box = new THREE.Box3().setFromObject(g);
    const cx = (box.min.x + box.max.x) / 2;
    for (const p of g.children) p.position.x -= cx;
    return g;
  }
  for (let i = 0; i < 9; i++) {
    const c = makeCumulus();
    c.scale.setScalar(1.8 + Math.random() * 1.8);
    c.userData.speed = 0.35 + Math.random() * 0.65;
    // Fixed slots in a band ahead: mostly above and in front of the POV.
    c.userData.zo = -40 - Math.random() * 220;
    c.position.set((Math.random() - 0.5) * 340, 46 + Math.random() * 40, c.userData.zo);
    scene.add(c);
    clouds.push(c);
  }

  // Distant Rockies on the horizon, tracked with the camera below.
  const mountains = buildMountainRange();
  scene.add(mountains);

  // Drifting pollen / seed motes: a soft haze of tiny specks floating on the
  // wind inside a box that follows the camera.
  const MOTES = 220;
  const moteGeo = new THREE.BufferGeometry();
  const motePos = new Float32Array(MOTES * 3);
  const motePh = [];
  for (let i = 0; i < MOTES; i++) {
    motePh.push({ ph: Math.random() * Math.PI * 2, sp: 0.4 + Math.random() * 0.8 });
    motePos[i * 3] = (Math.random() - 0.5) * 46;
    motePos[i * 3 + 1] = 3.5 + Math.random() * 7.5; // above the grass tops
    motePos[i * 3 + 2] = Math.random() * 46 - 40;   // mostly ahead of the view
  }
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xfff3d6, size: 0.15, transparent: true, opacity: 0.5,
    depthWrite: false, sizeAttenuation: true,
  });
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false;
  scene.add(motes);

  // Butterflies: a few papery wings fluttering around the flowers.
  const butterflies = [];
  function makeWingGeo(side) {
    const g = new THREE.PlaneGeometry(0.17, 0.11, 1, 1);
    g.rotateX(-Math.PI / 2); // horizontal, normal +y
    g.translate(side * 0.085, 0, 0); // pivot on the body axis
    return g;
  }
  const BUTTERFLY_COLORS = [0xffd9e8, 0xfff2b0, 0xdcc8ff, 0xb3e1ff, 0xffc9a8];
  for (let i = 0; i < 5; i++) {
    const b = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.02, 0.11, 5),
      new THREE.MeshBasicMaterial({ color: 0x3a2a1a })
    );
    body.rotation.x = Math.PI / 2; // lie along z (flight direction)
    b.add(body);
    const wMat = new THREE.MeshBasicMaterial({
      color: BUTTERFLY_COLORS[i % BUTTERFLY_COLORS.length],
      side: THREE.DoubleSide, transparent: true, opacity: 0.85,
    });
    b.add(new THREE.Mesh(makeWingGeo(-1), wMat)); // left wing
    b.add(new THREE.Mesh(makeWingGeo(1), wMat));  // right wing
    b.scale.setScalar(1.1 + Math.random() * 0.6);
    b.userData = {
      wl: b.children[1], wr: b.children[2],
      t: Math.random() * 100,
      speed: 0.55 + Math.random() * 0.7,
      radius: 1.6 + Math.random() * 2.2,
      anchor: null,
      anchorT: 0,
    };
    scene.add(b);
    butterflies.push(b);
  }

  // Pick a flower near the walker so butterflies stay in view — anchoring to
  // random flowers anywhere in the band made them invisible most of the time.
  function pickButterflyAnchor(playerPos) {
    const near = [];
    for (let i = 0; i < budData.length; i++) {
      const f = budData[i];
      if (!f) continue;
      // Prefer flowers ahead of the walker so they stay in view as you advance.
      if (f.z < playerPos.z + 2 && Math.hypot(f.x - playerPos.x, f.z - playerPos.z) < 26) near.push(f);
    }
    if (!near.length) {
      for (let i = 0; i < budData.length; i++) {
        const f = budData[i];
        if (f && Math.hypot(f.x - playerPos.x, f.z - playerPos.z) < 26) near.push(f);
      }
    }
    if (near.length) {
      const f = near[Math.floor(Math.random() * near.length)];
      return { x: f.x, y: HILLS.height(f.x, f.z) + CROWN_LIFT, z: f.z };
    }
    return { x: playerPos.x + (Math.random() - 0.5) * 8, y: playerPos.y + 1, z: playerPos.z - 8 };
  }

  // Birds: a tiny flock of V silhouettes that occasionally crosses the sky.
  const BIRD_N = 5;
  const birdMat = new THREE.MeshBasicMaterial({
    color: 0x3a3a46, side: THREE.DoubleSide, transparent: true, opacity: 0.85,
  });
  const flock = new THREE.Group();
  for (let i = 0; i < BIRD_N; i++) {
    const bird = new THREE.Group();
    const v1 = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.14), birdMat);
    v1.rotation.z = 0.5;
    v1.position.set(-0.27, 0, 0);
    const v2 = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.14), birdMat);
    v2.rotation.z = -0.5;
    v2.position.set(0.27, 0, 0);
    bird.add(v1, v2);
    bird.position.x = i * 3.4;
    bird.userData = { v1, v2, ph: Math.random() * Math.PI * 2 };
    flock.add(bird);
  }
  flock.visible = false;
  flock.userData.t = 10 + Math.random() * 15; // countdown to the first pass
  scene.add(flock);

  let lastHeading = 0; // for the lean-into-turns roll

  const api = {
    scene,
    camera,
    renderer,
    setFlowers(flowers) {
      scaleBuds(flowers);
    },
    frame(dt, playerPos, heading, jogLevel, timeSec, lookYaw = 0, lookPitch = 0) {
      // First-person: the camera IS the player. playerPos.y already includes
      // the eye height + head-bob from main.js; the foot position for the
      // grass wake sits at ground level.
      camera.position.set(playerPos.x, playerPos.y, playerPos.z);
      camera.rotation.order = 'YXZ';
      // Lean subtly into turns and breathe the FOV out a touch when jogging.
      const dHeading = heading - lastHeading;
      lastHeading = heading;
      const lean = Math.max(-0.12, Math.min(0.12, dHeading * 2.6));
      camera.rotation.set(-0.06 + lookPitch, heading + lookYaw, -lean);
      const targetFov = 72 + jogLevel * 4;
      if (Math.abs(camera.fov - targetFov) > 0.05) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
        camera.updateProjectionMatrix();
      }

      const footPos = { x: playerPos.x, y: playerPos.y - EYE_HEIGHT, z: playerPos.z };
      grass.update(timeSec, footPos, 0, windAt(timeSec, 11), camera.position, null);

      // Terrain & grass shader uniforms.
      terrainMat.uniforms.uCameraPos.value.copy(camera.position);
      terrainMat.uniforms.uTime.value = timeSec;
      flowerCrownMat.uniforms.uCameraPos.value.copy(camera.position);
      stemMat.uniforms.uCameraPos.value.copy(camera.position);

      // Sun and shadow follow the walker.
      sun.position.set(playerPos.x + 40, 70, playerPos.z + 25);
      sun.target.position.set(playerPos.x, playerPos.y, playerPos.z);

      // Flowers sway gently on their stems.
      if (budMeshes.length) {
        const dummy = new THREE.Object3D();
        for (let i = 0; i < budData.length; i++) {
          const b = budData[i];
          if (!b) continue;
          const kind = (b.kind ?? 0) % KIND_GEOMETRIES.length;
          const mesh = budMeshes[kind];
          if (!mesh) continue;
          const local = budLocal[i];
          const ground = HILLS.height(b.x, b.z);
          const crownY = ground + CROWN_LIFT;
          const sc = 1 + Math.sin(timeSec * 2.5 + i) * 0.06;
          dummy.position.set(b.x, crownY, b.z);
          dummy.scale.setScalar(sc * KIND_SCALE[kind]);
          // Billboard: always face the camera horizontally so petals never
          // collapse into edge-on lines as the walker passes by.
          dummy.rotation.y = Math.atan2(camera.position.x - b.x, camera.position.z - b.z);
          dummy.updateMatrix();
          mesh.setMatrixAt(local, dummy.matrix);
          const stemMesh = stemMeshes[kind];
          if (stemMesh) {
            const sd = new THREE.Object3D();
            sd.position.set(b.x, ground, b.z);
            sd.rotation.z = Math.sin(timeSec * 1.6 + i) * 0.04; // gentle sway
            sd.scale.set(1, STEM_LEN, 1);
            sd.updateMatrix();
            stemMesh.setMatrixAt(local, sd.matrix);
          }
        }
        for (const m of budMeshes) m.instanceMatrix.needsUpdate = true;
        for (const m of stemMeshes) m.instanceMatrix.needsUpdate = true;
      }

      // Sky + clouds track the camera.
      sky.position.copy(camera.position);
      for (const c of clouds) {
        c.position.x += c.userData.speed * dt;
        if (c.position.x > 190) c.position.x = -190;
        c.position.z = camera.position.z + c.userData.zo;
      }

      // Mountains sit on the horizon — follow the walker so the range stays
      // put in the distance while the plains scroll by.
      mountains.position.set(camera.position.x, 0, camera.position.z);

      // Pollen motes drift on the wind inside a box that follows the camera.
      motes.position.copy(camera.position);
      {
        const mpos = moteGeo.attributes.position.array;
        const windX = windAt(timeSec, 11).swayVx * 0.4 + 0.25;
        for (let i = 0; i < MOTES; i++) {
          const ph = motePh[i];
          const o = i * 3;
          mpos[o] += windX * dt + Math.sin(timeSec * ph.sp + ph.ph) * 0.05 * dt;
          mpos[o + 1] += Math.sin(timeSec * ph.sp * 1.3 + ph.ph) * 0.06 * dt;
          mpos[o + 2] += 0.3 * dt;
          if (mpos[o] > 23) mpos[o] = -23;
          else if (mpos[o] < -23) mpos[o] = 23;
          if (mpos[o + 1] > 11) mpos[o + 1] = 3.5;
          else if (mpos[o + 1] < 3.5) mpos[o + 1] = 11;
          if (mpos[o + 2] > 6) mpos[o + 2] = -40;
          else if (mpos[o + 2] < -40) mpos[o + 2] = 6;
        }
        moteGeo.attributes.position.needsUpdate = true;
      }

      // Butterflies flutter around a nearby flower, re-anchoring now and then.
      for (let i = 0; i < butterflies.length; i++) {
        const b = butterflies[i];
        const u = b.userData;
        u.t += dt * u.speed;
        u.anchorT -= dt;
        if (!u.anchor || u.anchorT <= 0) {
          u.anchor = pickButterflyAnchor(playerPos);
          u.anchorT = 5 + Math.random() * 8;
        }
        const a = u.t * 1.2;
        b.position.set(
          u.anchor.x + Math.sin(a) * u.radius,
          u.anchor.y + 1.2 + Math.sin(u.t * 1.7) * 0.9,
          u.anchor.z + Math.cos(a * 0.93) * u.radius
        );
        b.rotation.y = Math.sin(u.t * 0.9) * 0.7;
        const flap = Math.sin(u.t * 14) * 0.75 * (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(u.t * 2.1)));
        u.wl.rotation.z = flap;
        u.wr.rotation.z = -flap;
      }

      // Birds: an occasional flock crosses the sky, then disappears.
      {
        const f = flock.userData;
        f.t -= dt;
        if (f.t <= 0) {
          if (!flock.visible) {
            flock.visible = true;
            flock.position.set(camera.position.x + 120, 72 + Math.random() * 18, camera.position.z - 60);
            f.dir = Math.random() < 0.5 ? 1 : -1;
            f.speed = 6 + Math.random() * 4;
          }
          flock.position.x += f.dir * f.speed * dt;
          flock.position.z += 1.2 * dt;
          for (const bird of flock.children) {
            bird.userData.ph += dt * 9;
            const flap = Math.sin(bird.userData.ph) * 0.45;
            bird.userData.v1.rotation.y = flap;
            bird.userData.v2.rotation.y = -flap;
          }
          if (Math.abs(flock.position.x - camera.position.x) > 220) {
            flock.visible = false;
            f.t = 18 + Math.random() * 30;
          }
        }
      }

      // Draw the frame. (The original main.js issued renderer.render itself;
      // here frame() owns the full update-then-draw cycle.)
      renderer.render(scene, camera);
    },
  };

  function scaleBuds(buds) {
    budData = buds;
    budLocal = buds.map(() => 0);
    const perKind = KIND_GEOMETRIES.map(() => []);
    buds.forEach((b, i) => {
      const k = (b.kind ?? 0) % perKind.length;
      perKind[k].push(i);
    });
    for (const m of budMeshes) {
      scene.remove(m);
      m.geometry.dispose();
    }
    budMeshes = [];
    for (const m of stemMeshes) {
      scene.remove(m);
      m.geometry.dispose();
    }
    stemMeshes = [];
    perKind.forEach((indices, k) => {
      if (!indices.length) return;
      const mesh = new THREE.InstancedMesh(
        KIND_GEOMETRIES[k],
        flowerCrownMat,
        indices.length
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      indices.forEach((idx, local) => {
        budLocal[idx] = local;
        mesh.setColorAt(local, new THREE.Color(buds[idx].colorHex));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      scene.add(mesh);
      budMeshes[k] = mesh;

      // A stem beneath each crown of this kind.
      const stems = new THREE.InstancedMesh(STEM_GEO, stemMat, indices.length);
      stems.frustumCulled = false;
      const sd = new THREE.Object3D();
      indices.forEach((idx, local) => {
        const b = buds[idx];
        sd.position.set(b.x, HILLS.height(b.x, b.z), b.z);
        sd.scale.set(1, STEM_LEN, 1);
        sd.updateMatrix();
        stems.setMatrixAt(local, sd.matrix);
        // Per-instance flower colour: the shader tints the stem's top with
        // its own bloom so stem and crown read as one plant.
        stems.setColorAt(local, new THREE.Color(buds[idx].colorHex));
      });
      if (stems.instanceColor) stems.instanceColor.needsUpdate = true;
      scene.add(stems);
      stemMeshes[k] = stems;
    });
  }

  return api;
}

export function resize(api) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  api.renderer.setSize(w, h);
  api.camera.aspect = w / h;
  api.camera.updateProjectionMatrix();
}