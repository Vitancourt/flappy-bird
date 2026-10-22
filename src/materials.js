import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Procedural PBR-ish materials: everything is drawn to canvases at start-up, so the game
// ships no image files. Canvas maps: colour, a combined "ORM" map (green = roughness,
// blue = metalness) and a bump map.

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
const rnd = (a, b) => a + Math.random() * (b - a);
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

function mix(c, to, t) {
  const col = new THREE.Color(c);
  return `#${col.lerp(new THREE.Color(to), t).getHexString()}`;
}

function speckle(g, w, h, count, maxSize, alpha, color = '0,0,0') {
  for (let i = 0; i < count; i++) {
    g.fillStyle = `rgba(${color},${Math.random() * alpha})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * maxSize, 1 + Math.random() * maxSize);
  }
}

function tex(c, { srgb = false, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// each use needs its own repeat, so clone (the clones share the canvas)
function withRepeat(base, rx, ry) {
  const t = base.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- facades
// One tile = 4 window bays wide (12 units) x 2 floors tall (6 units).
const TW = 512, TH = 256, BAY = 128;
const TILE_W = 12, TILE_H = 6;
let facadeShared;

function facadeBase() {
  if (facadeShared) return facadeShared;
  const orm = canvas(TW, TH), bump = canvas(TW, TH);
  const go = orm.getContext('2d'), gb = bump.getContext('2d');
  go.fillStyle = 'rgb(255,214,6)'; go.fillRect(0, 0, TW, TH); // wall: rough, not metal
  gb.fillStyle = 'rgb(170,170,170)'; gb.fillRect(0, 0, TW, TH);
  // the window layout is the same for every colour, so the shared maps are drawn once
  facadeShared = { orm, bump, ormTex: tex(orm), bumpTex: tex(bump), layout: [], colorTex: {} };
  const L = facadeShared.layout;
  for (let fy = 0; fy < 2; fy++) {
    for (let bx = 0; bx < 4; bx++) {
      const x = bx * BAY, y = fy * BAY;
      const win = { x: x + 22, y: y + 20, w: 84, h: 80 };
      const kind = Math.random();
      const bay = {
        ...win,
        bright: rnd(0.7, 1.1),
        curtain: kind < 0.18,
        blinds: kind >= 0.18 && kind < 0.32,
      };
      L.push(bay);
      // roughness/metalness: glass is smooth and metallic so it reflects the sky
      go.fillStyle = 'rgb(255,22,225)'; go.fillRect(win.x, win.y, win.w, win.h);
      go.fillStyle = 'rgb(255,150,40)'; go.fillRect(win.x - 5, win.y - 5, win.w + 10, 5);
      go.fillRect(win.x - 5, win.y + win.h, win.w + 10, 5);
      go.fillRect(win.x - 5, win.y, 5, win.h); go.fillRect(win.x + win.w, win.y, 5, win.h);
      go.fillRect(win.x + win.w / 2 - 2, win.y, 4, win.h);
      if (bay.curtain) { go.fillStyle = 'rgb(255,200,0)'; go.fillRect(win.x, win.y + win.h * 0.3, win.w, win.h * 0.7); }
      // bump: glass recessed, frame and sill proud
      gb.fillStyle = 'rgb(60,60,60)'; gb.fillRect(win.x, win.y, win.w, win.h);
      gb.fillStyle = 'rgb(150,150,150)'; gb.fillRect(win.x - 5, win.y - 5, win.w + 10, win.h + 10);
      gb.fillStyle = 'rgb(60,60,60)'; gb.fillRect(win.x, win.y, win.w, win.h);
      gb.fillStyle = 'rgb(130,130,130)'; gb.fillRect(win.x + win.w / 2 - 2, win.y, 4, win.h);
      gb.fillStyle = 'rgb(245,245,245)'; gb.fillRect(win.x - 9, win.y + win.h + 5, win.w + 18, 8);
      gb.fillStyle = 'rgb(120,120,120)'; gb.fillRect(win.x - 7, win.y - 12, win.w + 14, 7);
      // floor slab line
      gb.fillStyle = 'rgb(110,110,110)'; gb.fillRect(x, y + 118, BAY, 10);
    }
  }
  facadeShared.ormTex.needsUpdate = true;
  facadeShared.bumpTex.needsUpdate = true;
  return facadeShared;
}

function facadeColorTexture(color) {
  const sh = facadeBase();
  if (sh.colorTex[color]) return sh.colorTex[color];
  const c = canvas(TW, TH), g = c.getContext('2d');
  const wall = mix(color, 0xd8d4cc, 0.12); // a hint of concrete grey
  g.fillStyle = wall; g.fillRect(0, 0, TW, TH);
  speckle(g, TW, TH, 2500, 3, 0.07);
  speckle(g, TW, TH, 800, 2, 0.08, '255,255,255');
  // grime that streaks down from every floor slab
  for (let fy = 0; fy < 2; fy++) {
    const grad = g.createLinearGradient(0, fy * BAY + 60, 0, fy * BAY + 128);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.18)');
    g.fillStyle = grad; g.fillRect(0, fy * BAY + 60, TW, 68);
  }
  g.fillStyle = mix(color, 0x000000, 0.35); // slabs and piers
  for (let fy = 0; fy < 2; fy++) g.fillRect(0, fy * BAY + 118, TW, 4);
  for (let bx = 0; bx < 4; bx++) g.fillRect(bx * BAY, 0, 3, TH);

  for (const b of sh.layout) {
    g.fillStyle = mix(color, 0x000000, 0.55); // frame
    g.fillRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10);
    const grad = g.createLinearGradient(0, b.y, 0, b.y + b.h);
    const k = b.bright;
    grad.addColorStop(0, `rgb(${150 * k | 0},${195 * k | 0},${235 * k | 0})`);
    grad.addColorStop(0.55, `rgb(${70 * k | 0},${105 * k | 0},${150 * k | 0})`);
    grad.addColorStop(1, `rgb(${34 * k | 0},${52 * k | 0},${82 * k | 0})`);
    g.fillStyle = grad; g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = 'rgba(255,255,255,0.16)'; // reflection streak
    g.beginPath();
    g.moveTo(b.x + 8, b.y + b.h); g.lineTo(b.x + 34, b.y); g.lineTo(b.x + 52, b.y); g.lineTo(b.x + 26, b.y + b.h);
    g.fill();
    if (b.curtain) {
      g.fillStyle = 'rgba(238,226,196,0.92)'; g.fillRect(b.x, b.y + b.h * 0.3, b.w, b.h * 0.7);
      g.strokeStyle = 'rgba(160,140,100,0.5)'; g.lineWidth = 2;
      for (let i = 1; i < 7; i++) { g.beginPath(); g.moveTo(b.x + i * 12, b.y + b.h * 0.3); g.lineTo(b.x + i * 12, b.y + b.h); g.stroke(); }
    } else if (b.blinds) {
      g.strokeStyle = 'rgba(225,225,215,0.75)'; g.lineWidth = 2;
      for (let y = b.y + 4; y < b.y + b.h; y += 7) { g.beginPath(); g.moveTo(b.x, y); g.lineTo(b.x + b.w, y); g.stroke(); }
    }
    g.fillStyle = mix(color, 0x000000, 0.5); // mullion + transom
    g.fillRect(b.x + b.w / 2 - 2, b.y, 4, b.h);
    g.fillRect(b.x, b.y + b.h * 0.38, b.w, 3);
    g.fillStyle = mix(color, 0xffffff, 0.5); // sill
    g.fillRect(b.x - 9, b.y + b.h + 5, b.w + 18, 8);
    g.fillStyle = mix(color, 0x000000, 0.25); // lintel
    g.fillRect(b.x - 7, b.y - 12, b.w + 14, 7);
  }
  return (sh.colorTex[color] = tex(c, { srgb: true }));
}

const facadeCache = {};
// w, h: the face size in world units (decides how often the tile repeats)
export function facadeMaterial(color, w, h) {
  const rx = Math.max(1, Math.round(w / TILE_W));
  const ry = Math.max(0.5, Math.round((h / TILE_H) * 2) / 2);
  const key = `${color}|${rx}|${ry}`;
  if (facadeCache[key]) return facadeCache[key];
  const sh = facadeBase();
  const orm = withRepeat(sh.ormTex, rx, ry);
  return (facadeCache[key] = new THREE.MeshStandardMaterial({
    map: withRepeat(facadeColorTexture(color), rx, ry),
    roughnessMap: orm,
    metalnessMap: orm,
    roughness: 1,
    metalness: 1,
    bumpMap: withRepeat(sh.bumpTex, rx, ry),
    bumpScale: 2.5,
    envMapIntensity: 1.1,
  }));
}

// ---------------------------------------------------------------- ground
let asphaltBase, concreteBase, zebraTex, dashTex;
const groundCache = {};

function asphaltTexture() {
  if (asphaltBase) return asphaltBase;
  const c = canvas(256, 256), g = c.getContext('2d');
  const img = g.createImageData(256, 256);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 52 + Math.random() * 30;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v + 3; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  speckle(g, 256, 256, 900, 2, 0.35, '200,200,200');
  speckle(g, 256, 256, 40, 18, 0.12);
  g.strokeStyle = 'rgba(20,20,20,0.35)'; g.lineWidth = 1; // hairline cracks
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    let x = Math.random() * 256, y = Math.random() * 256;
    g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += rnd(-20, 20); y += rnd(-20, 20); g.lineTo(x, y); }
    g.stroke();
  }
  asphaltBase = { map: tex(c, { srgb: true }) };
  asphaltBase.bump = asphaltBase.map; // same canvas is a fine bump map
  return asphaltBase;
}

function concreteTexture() {
  if (concreteBase) return concreteBase;
  const c = canvas(128, 128), g = c.getContext('2d');
  const img = g.createImageData(128, 128);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 168 + Math.random() * 22;
    img.data[i] = v; img.data[i + 1] = v - 2; img.data[i + 2] = v - 6; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = 'rgba(70,70,70,0.55)'; // paving joints
  g.fillRect(0, 0, 128, 2); g.fillRect(0, 64, 128, 2); g.fillRect(0, 0, 2, 128); g.fillRect(64, 0, 2, 128);
  concreteBase = { map: tex(c, { srgb: true }) };
  return concreteBase;
}

// size: world units covered by one repeat of the texture
export function asphaltMaterial(width, depth, size = 16) {
  const key = `a${width}|${depth}`;
  if (groundCache[key]) return groundCache[key];
  const b = asphaltTexture();
  return (groundCache[key] = new THREE.MeshStandardMaterial({
    map: withRepeat(b.map, width / size, depth / size),
    bumpMap: withRepeat(b.bump, width / size, depth / size),
    bumpScale: 1.2,
    roughness: 0.92,
    metalness: 0,
  }));
}

export function concreteMaterial(width, depth, size = 4) {
  const key = `c${width}|${depth}`;
  if (groundCache[key]) return groundCache[key];
  const b = concreteTexture();
  return (groundCache[key] = new THREE.MeshStandardMaterial({
    map: withRepeat(b.map, width / size, depth / size),
    roughness: 0.88,
    metalness: 0,
  }));
}

export function markingMaterials() {
  if (zebraTex) return zebraTex;
  const d = canvas(64, 8), gd = d.getContext('2d');
  gd.fillStyle = '#e9e9e4'; gd.fillRect(0, 2, 32, 4);
  const z = canvas(64, 64), gz = z.getContext('2d');
  gz.fillStyle = '#ecece6';
  for (let i = 0; i < 6; i++) gz.fillRect(i * 11 + 2, 0, 6, 64);
  speckle(gz, 64, 64, 120, 3, 0.45);
  const dashT = tex(d, { srgb: true });
  const zebraT = tex(z, { srgb: true });
  zebraT.wrapS = zebraT.wrapT = THREE.ClampToEdgeWrapping;
  const common = { transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  zebraTex = {
    dash: new THREE.MeshStandardMaterial({ map: dashT, ...common }),
    zebra: new THREE.MeshStandardMaterial({ map: zebraT, ...common }),
    dashRepeat: dashT,
  };
  return zebraTex;
}

// ---------------------------------------------------------------- merged props
// Static clutter (trees, lamps, roof details, parked traffic) is merged into one mesh per
// chunk, coloured with vertex colours, so the city stays cheap to draw.
const base = {};
function geo(name, make) { return (base[name] ||= make()); }

export const propMaterial = () => (base.propMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
export const paintMaterial = () => (base.paintMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.55 }));
export const glassMaterial = () => (base.glassMat ||= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.06, metalness: 0.9 }));
export const roofMaterial = (color) => (base[`roof${color}`] ||= new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));

const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);

export class Batch {
  constructor() { this.parts = []; this.parent = new THREE.Matrix4(); }

  // everything added afterwards is placed relative to this transform
  at(x, y, z, ry = 0) {
    this.parent.compose(P.set(x, y, z), Q.setFromAxisAngle(Y, ry), S.set(1, 1, 1));
    return this;
  }

  _add(g, color, sx, sy, sz, x, y, z, ry = 0, rx = 0) {
    const q = new THREE.Quaternion().setFromAxisAngle(Y, ry).multiply(new THREE.Quaternion().setFromAxisAngle(X, rx));
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(sx, sy, sz));
    const geom = g.clone().applyMatrix4(M.copy(this.parent).multiply(m));
    const c = new THREE.Color(color);
    const n = geom.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geom.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(geom);
  }

  box(color, sx, sy, sz, x, y, z, ry = 0) { this._add(geo('box', () => new THREE.BoxGeometry(1, 1, 1)), color, sx, sy, sz, x, y, z, ry); }
  cyl(color, r, h, x, y, z, rx = 0) { this._add(geo('cyl', () => new THREE.CylinderGeometry(1, 1, 1, 8)), color, r, h, r, x, y, z, 0, rx); }
  sphere(color, rx, ry, rz, x, y, z) { this._add(geo('sph', () => new THREE.SphereGeometry(1, 8, 6)), color, rx, ry, rz, x, y, z); }
  pyramid(color, r, h, x, y, z, ry = 0) { this._add(geo('pyr', () => new THREE.ConeGeometry(1, 1, 4)), color, r, h, r, x, y, z, ry); }

  build() {
    if (!this.parts.length) return null;
    const merged = mergeGeometries(this.parts, false);
    for (const p of this.parts) p.dispose();
    this.parts = [];
    return merged;
  }
}

export { hex };
