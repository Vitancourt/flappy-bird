import * as THREE from 'three';
import { BIRD_HALF, LANE_COUNT, LANE_WIDTH, LANE_SWITCH_SPEED } from '../config.js';
import { birdBox } from '../collision.js';
import { quality } from '../quality.js';
import {
  facadeMaterial, asphaltMaterial, concreteMaterial, markingMaterials, roofMaterial,
  Batch, propMaterial, paintMaterial, glassMaterial,
} from '../materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Minimap } from '../minimap.js';
import { Grabbers, Person } from '../grabbers.js';
import { Planes } from '../planes.js';
import {
  PITCH, STREET_HALF, LOT, BLOCK_SIZE, FOOD_POINTS, TOWER_H,
  lotInfo, lotRect, lotAt, blockIndex, segmentVehicles, SEGMENT_LEN, segmentBalloons, signalState, pickFoodSpot, hash, VEHICLE_TYPES,
} from '../citygen.js';

// headings: 0 north (-z), 1 east (+x), 2 south (+z), 3 west (-x)
const DIRS = [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }];
const PAD_H = 0.16; // height of the sidewalk slab the buildings stand on
const PAD_SIZE = BLOCK_SIZE + 4; // slab covers the block plus a 2-unit sidewalk on every side
const TASKS_PER_FRAME = 2; // chunk decoration is built a little at a time
const NEAR_VIEW = 2; // chunks around the bird that get vehicle/balloon meshes (collision covers the rest)
const START_SPEED = 14;
const MAX_SPEED = 30;
const SPEED_RAMP = 0.25;
const TURN_RATE = 14; // how quickly the bird visually swings to a new heading
const PICKUP_RADIUS = 1.9;
const DIST_PER_POINT = 40; // flying distance that earns +1
const FOOD_LOST_DISTANCE = 260; // food this far behind is replaced
const LANE_EDGE = ((LANE_COUNT - 1) / 2) * LANE_WIDTH; // centre of the outer lane
const PALETTE = [0x7b8fd1, 0xd18fb3, 0x8fd1b8, 0xd1c08f, 0x9a8fd1, 0xd1998f];
const VEHICLE_COLORS = [0xd9423a, 0x2f6fd6, 0xf2f2f2, 0xf2c230, 0x2f9e6a, 0x7a4fd1];
const BALLOON_PALETTE = [0xe0566b, 0xf2c230, 0x2f9e6a, 0x2f6fd6, 0x7a4fd1, 0xff8a1a];

// Shared geometry/materials, created on first use (they need a DOM canvas for windows).
const cache = {};
function shared() {
  if (cache.ready) return cache;
  cache.lotGeo = {};
  cache.lotMat = {};
  cache.roof = new THREE.MeshLambertMaterial({ color: 0x555a66 });
  cache.padGeo = new THREE.BoxGeometry(PAD_SIZE, PAD_H, PAD_SIZE);
  cache.padMat = concreteMaterial(PAD_SIZE, PAD_SIZE, 4);
  cache.slab = new THREE.MeshStandardMaterial({ color: 0x6a6e78, roughness: 0.9 });

  // centre-line dashes and crosswalks, in chunk-local coordinates (origin = the chunk's
  // north-west intersection). The same geometry is shared by every chunk.
  const mk = markingMaterials();
  mk.dashRepeat.repeat.set(BLOCK_SIZE / 6, 1);
  const dashE = new THREE.PlaneGeometry(BLOCK_SIZE, 0.5).rotateX(-Math.PI / 2).translate(STREET_HALF + BLOCK_SIZE / 2, 0.03, 0);
  const dashS = new THREE.PlaneGeometry(BLOCK_SIZE, 0.5).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(0, 0.03, STREET_HALF + BLOCK_SIZE / 2);
  cache.dashGeo = mergeGeometries([dashE, dashS]);
  cache.dashMat = mk.dash;
  const zebra = [];
  for (const sgn of [-1, 1]) {
    zebra.push(new THREE.PlaneGeometry(12, 3).rotateX(-Math.PI / 2).translate(0, 0.035, sgn * 7.5)); // across the north-south street
    zebra.push(new THREE.PlaneGeometry(12, 3).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(sgn * 7.5, 0.035, 0));
  }
  cache.zebraGeo = mergeGeometries(zebra);
  cache.zebraMat = mk.zebra;

  cache.foodGrain = new THREE.IcosahedronGeometry(0.55, 0);
  cache.foodGrainMat = new THREE.MeshLambertMaterial({ color: 0xffc933, emissive: 0x8a5a00, flatShading: true });
  cache.foodSeed = new THREE.SphereGeometry(0.2, 6, 4);
  cache.foodSeedMat = new THREE.MeshLambertMaterial({ color: 0xff8a1a, emissive: 0x6a2c00 });
  cache.foodGlow = new THREE.SphereGeometry(1.5, 12, 8);
  cache.foodGlowMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.25, depthWrite: false });
  // light beam so the single food item can be spotted from far away (ignores fog)
  cache.beamGeo = new THREE.CylinderGeometry(0.1, 0.1, 60, 6, 1, true).translate(0, 30, 0);
  cache.beamMat = new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.4, fog: false, depthWrite: false });

  cache.balloonGeo = new THREE.SphereGeometry(1, 12, 10);
  cache.balloonKnot = new THREE.ConeGeometry(0.22, 0.4, 5);
  cache.balloonString = new THREE.BoxGeometry(0.05, 2.6, 0.05);
  cache.balloonMat = BALLOON_PALETTE.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.22, metalness: 0.05 }));
  cache.stringMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.8 });
  cache.ready = true;
  return cache;
}

function lotMesh(bi, bj, k) {
  const sh = shared();
  const { type, h, color } = lotInfo(bi, bj, k);
  const geo = (sh.lotGeo[type] ||= new THREE.BoxGeometry(LOT, h, LOT));
  // one material for the whole box = one draw call; roof slabs/props hide the textured top
  const mats = facadeMaterial(PALETTE[color], LOT, h);
  const r = lotRect(bi, bj, k);
  const mesh = new THREE.Mesh(geo, mats);
  mesh.position.set(r.minX + LOT / 2, PAD_H + h / 2, r.minZ + LOT / 2);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// Roof details, street trees and lamp posts for one block, merged into a single mesh.
function chunkProps(bi, bj) {
  const b = new Batch();
  const ox = bi * PITCH, oz = bj * PITCH;
  const ROOFS = [0xa5503a, 0x5b6068, 0x7a5238];
  for (let k = 0; k < 4; k++) {
    const { type, h } = lotInfo(bi, bj, k);
    const r = lotRect(bi, bj, k);
    const cx = (r.minX + r.maxX) / 2, cz = (r.minZ + r.maxZ) / 2, top = PAD_H + h;
    const rr = (i) => hash(bi, bj, 40 + k * 7 + i);
    if (type === 'house') {
      b.pyramid(ROOFS[Math.floor(rr(0) * 3)], (LOT + 1.6) / Math.SQRT2, 4.6, cx, top + 2.3, cz, Math.PI / 4);
      b.box(0x6b5546, 1.2, 2.6, 1.2, cx + (rr(1) - 0.5) * 8, top + 3, cz + (rr(2) - 0.5) * 8);
    } else {
      b.box(0x555a66, LOT + 0.4, 0.5, LOT + 0.4, cx, top + 0.25, cz); // parapet slab
      const units = 2 + Math.floor(rr(3) * 3);
      for (let i = 0; i < units; i++) {
        b.box(0x9aa0a8, 2.2, 1.3, 2.2, cx + (rr(4 + i) - 0.5) * 14, top + 1.15, cz + (rr(9 + i) - 0.5) * 14);
      }
      if (type === 'mid') b.cyl(0x8a6a4a, 1.6, 2.6, cx + (rr(14) - 0.5) * 10, top + 1.8, cz + (rr(15) - 0.5) * 10);
      else {
        b.cyl(0x9aa0a8, 0.16, 14, cx, top + 7, cz);
        b.sphere(0xff3b2f, 0.35, 0.35, 0.35, cx, top + 14.2, cz);
      }
    }
  }
  // trees and lamps along the four sidewalks of this block's slab
  for (const t of [14, 26, 38, 50]) {
    const tree = t === 14 || t === 38;
    for (const [x, z, ax, az] of [
      [ox + 7, oz + t, -1, 0], [ox + 57, oz + t, 1, 0], [ox + t, oz + 7, 0, -1], [ox + t, oz + 57, 0, 1],
    ]) {
      if (tree) {
        if (hash(bi, bj, Math.floor(x * 3 + z * 7)) < 0.15) continue; // gaps in the row
        const g = [0x3f7a3a, 0x4f8f3f, 0x2f6a35][Math.floor(hash(bi + 3, bj, Math.floor(x + z)) * 3)];
        b.cyl(0x5a4330, 0.2, 2.4, x, PAD_H + 1.2, z);
        b.sphere(g, 1.5, 1.7, 1.5, x, PAD_H + 3.6, z);
        b.sphere(g, 1.1, 1.2, 1.1, x + 0.4, PAD_H + 4.3, z + 0.3);
      } else {
        b.cyl(0x3a3d45, 0.09, 6.5, x, PAD_H + 3.25, z);
        b.box(0x3a3d45, ax ? 1.2 : 0.08, 0.08, az ? 1.2 : 0.08, x + ax * 0.6, PAD_H + 6.5, z + az * 0.6);
        b.box(0xfff0c8, ax ? 0.5 : 0.3, 0.14, az ? 0.5 : 0.3, x + ax * 1.2, PAD_H + 6.45, z + az * 1.2);
      }
    }
  }
  return b.build();
}

// One vehicle as a single vertex-coloured mesh (long along +x, front at +x), cached per type and paint.
const vehicleGeos = new Map();
function vehicleGeometry(v) {
  const key = `${v.type}${v.color}`;
  if (vehicleGeos.has(key)) return vehicleGeos.get(key);
  const paint = new Batch(), glass = paint, detail = paint;
  {
    const t = VEHICLE_TYPES[v.type];
    const clear = 0.35;
    const color = VEHICLE_COLORS[v.color];
    if (v.type === 'lorry') {
      const cargoH = t.h - clear;
      paint.box(0xe8e6df, t.len * 0.68, cargoH, t.w, -t.len * 0.16, clear + cargoH / 2, 0);
      paint.box(color, t.len * 0.3, cargoH * 0.68, t.w * 0.96, t.len * 0.36, clear + cargoH * 0.34, 0);
      glass.box(0x1f2a38, t.len * 0.12, cargoH * 0.3, t.w * 0.9, t.len * 0.46, clear + cargoH * 0.68 - 0.05, 0);
    } else {
      const bodyH = (t.h - clear) * 0.58, capH = t.h - clear - bodyH;
      paint.box(color, t.len, bodyH, t.w, 0, clear + bodyH / 2, 0);
      if (v.type === 'bus') glass.box(0x1f2a38, t.len * 0.94, capH, t.w * 0.96, 0, clear + bodyH + capH / 2, 0);
      else glass.box(0x1f2a38, t.len * 0.5, capH, t.w * 0.9, -t.len * 0.08, clear + bodyH + capH / 2, 0);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) detail.cyl(0x141414, 0.36, 0.28, sx * t.len * 0.31, 0.36, sz * (t.w / 2 - 0.1), Math.PI / 2);
    }
    for (const sz of [-1, 1]) {
      detail.box(0xfff4d0, 0.1, 0.18, 0.42, t.len / 2, clear + 0.3, sz * t.w * 0.3);
      detail.box(0xc8201a, 0.1, 0.18, 0.42, -t.len / 2, clear + 0.3, sz * t.w * 0.3);
    }
    detail.box(0x1c1c1c, 0.12, 0.2, t.w * 0.96, t.len / 2, clear + 0.05, 0);
    detail.box(0x1c1c1c, 0.12, 0.2, t.w * 0.96, -t.len / 2, clear + 0.05, 0);
  }
  const geo = paint.build();
  vehicleGeos.set(key, geo);
  return geo;
}

let lensGeoCache, lensMatCache;
const lensGeo = () => (lensGeoCache ||= new THREE.SphereGeometry(0.62, 12, 8));
const lensMats = () => (lensMatCache ||= {
  red: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
  yellow: new THREE.MeshBasicMaterial({ color: 0xffc21a }),
  green: new THREE.MeshBasicMaterial({ color: 0x2aff6a }),
});

function balloonMesh(b) {
  const sh = shared();
  const g = new THREE.Group();
  const body = new THREE.Mesh(sh.balloonGeo, sh.balloonMat[b.color]);
  body.scale.set(b.r, b.r * 1.2, b.r);
  const knot = new THREE.Mesh(sh.balloonKnot, sh.balloonMat[b.color]);
  knot.rotation.x = Math.PI;
  knot.position.y = -b.r * 1.2 - 0.15;
  const string = new THREE.Mesh(sh.balloonString, sh.stringMat);
  string.position.y = -b.r * 1.2 - 1.6;
  g.add(body, knot, string);
  body.castShadow = true;
  g.position.set(b.x, b.y, b.z);
  g.userData.baseY = b.y;
  g.userData.phase = (b.x * 0.37 + b.z * 0.21) % 6.28;
  return g;
}

function foodMesh() {
  const sh = shared();
  const g = new THREE.Group();
  g.add(new THREE.Mesh(sh.foodGrain, sh.foodGrainMat));
  for (let i = 0; i < 4; i++) {
    const seed = new THREE.Mesh(sh.foodSeed, sh.foodSeedMat);
    const a = (i / 4) * Math.PI * 2;
    seed.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95);
    g.add(seed);
  }
  g.add(new THREE.Mesh(sh.foodGlow, sh.foodGlowMat));
  g.add(new THREE.Mesh(sh.beamGeo, sh.beamMat));
  g.scale.setScalar(1.2);
  g.userData.isFood = true;
  return g;
}

// City mode: an endless grid of streets, three lanes per street. Left/Right change lane;
// pressing again in the outer lane turns 90 degrees (turn over a street or you fly into a
// building). Traffic and balloons fill the streets, planes cross at the intersections and
// people lean out of windows with nets. One piece of bird food exists at a time.
export class CityMode {
  constructor({ scene, camera, bird }) {
    this.id = 'city';
    this.scene = scene;
    this.camera = camera;
    this.bird = bird;
    this.root = new THREE.Group();
    this.root.visible = false;
    scene.add(this.root);

    this.asphalt = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), asphaltMaterial(1600, 1600));
    this.asphalt.rotation.x = -Math.PI / 2;
    this.asphalt.receiveShadow = true;
    this.root.add(this.asphalt);
    this.queue = []; // chunk decoration still to be built
    quality.listeners.push(() => { if (this.root.visible) this._applyQuality(); });

    this.chunks = new Map(); // "bi,bj" -> { group, vehicles, balloons, nearGroup, props, geoms, bi, bj }
    this.fleet = null; // every vehicle of every loaded chunk
    this.vehicleGroup = new THREE.Group();
    this.root.add(this.vehicleGroup);
    this.planes = new Planes(this.root);
    this.grabbers = new Grabbers();
    this.food = null; // { x, y, z, mesh, phase }
    this.map = new Minimap(document.getElementById('minimap'));
    this.forward = new THREE.Vector3(0, 0, -1);
    this.heading = 0;
    this.lane = Math.floor(LANE_COUNT / 2);
    this.speed = START_SPEED;
    this.dist = 0;
    this.nextAward = DIST_PER_POINT;
    this.planeTimer = 0;
    this.grabTimer = 0;
    this.foodTimer = 0;
    this.cbi = this.cbj = null;
    this.snap = true;
    this.t = 0;
    this.sim = 0;
  }

  activate() {
    this.root.visible = true;
    this.bird.laneMode = false;
    this._applyQuality();
    this.snap = true;
  }

  // the view distance follows the quality tier: fog hides the edge of the loaded city
  _applyQuality() {
    this.scene.fog.near = 40;
    this.scene.fog.far = quality.viewRadius * PITCH * 0.82;
    if (this.cbi !== null) this._ensureChunks(true);
  }

  deactivate() { this.root.visible = false; }

  reset() {
    const b = this.bird;
    b.x = 0; b.z = 0; b.y = 8; b.yaw = 0; b.roll = 0;
    b.syncMesh();
    this.heading = 0;
    this.lane = Math.floor(LANE_COUNT / 2);
    this.speed = START_SPEED;
    this.dist = 0;
    this.sim = 0;
    this.nextAward = DIST_PER_POINT;
    this.planeTimer = 6;
    this.grabTimer = 5;
    this.foodTimer = 0;
    this.planes.reset();
    this.grabbers.reset();
    this._removeFood();
    this._clearChunks();
    this._ensureChunks(true);
    this._flush();
    this._spawnFood();
    this.snap = true;
  }

  idle() {}

  // 0..1 how fast we are going between the start and top speed
  speedRatio() { return (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED); }

  // Left/Right change lane; pressing again while already in the outer lane turns 90 degrees.
  steer(dir) {
    const next = this.lane + dir;
    if (next >= 0 && next < LANE_COUNT) {
      this.lane = next;
    } else {
      this.heading = (this.heading + (dir > 0 ? 1 : 3)) % 4;
      this.lane = Math.floor(LANE_COUNT / 2); // settle in the middle of the new street
    }
  }

  step(dt, time) {
    const b = this.bird;
    this.sim += dt;
    this._driveTraffic(dt);
    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_RAMP * dt);
    b.update(dt, time);

    const d = DIRS[this.heading];
    this.forward.set(d.x, 0, d.z);
    b.x += d.x * this.speed * dt;
    b.z += d.z * this.speed * dt;
    // ease sideways into the chosen lane of the street we are in (only inside its width)
    const right = DIRS[(this.heading + 1) % 4];
    const laneOff = (this.lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
    let lean = 0;
    if (d.x === 0) {
      const c = Math.round(b.x / PITCH) * PITCH;
      if (Math.abs(b.x - c) < STREET_HALF - 0.5) {
        const target = c + laneOff * right.x;
        lean = (b.x - target) * right.x;
        b.x += (target - b.x) * Math.min(1, LANE_SWITCH_SPEED * dt);
      }
    } else {
      const c = Math.round(b.z / PITCH) * PITCH;
      if (Math.abs(b.z - c) < STREET_HALF - 0.5) {
        const target = c + laneOff * right.z;
        lean = (b.z - target) * right.z;
        b.z += (target - b.z) * Math.min(1, LANE_SWITCH_SPEED * dt);
      }
    }

    // swing toward the new heading by the shortest way round, banking into the turn
    const diff = Math.atan2(
      Math.sin(-this.heading * Math.PI / 2 - b.yaw),
      Math.cos(-this.heading * Math.PI / 2 - b.yaw),
    );
    b.yaw += diff * Math.min(1, TURN_RATE * dt);
    b.roll = THREE.MathUtils.clamp(diff * 0.5 + lean * 0.15, -0.8, 0.8);
    b.syncMesh();

    let points = 0;
    this.dist += this.speed * dt;
    while (this.dist >= this.nextAward) { points++; this.nextAward += DIST_PER_POINT; }

    // flying hazards
    this.planes.update(dt);
    this.planeTimer -= dt;
    if (this.planeTimer <= 0) {
      this.planeTimer = this._spawnPlane() ? 4 + Math.random() * 4 : 0.5;
    }
    this.grabTimer -= dt;
    if (this.grabTimer <= 0) {
      this.grabTimer = this._spawnGrabber() ? 4 + Math.random() * 3 : 0.4;
    }
    const grabbed = this.grabbers.think(dt, { pos: b, forward: this.forward, speed: this.speed });

    // the single piece of bird food
    let ate = 0;
    const f = this.food;
    if (f) {
      const dx = f.x - b.x, dy = f.y - b.y, dz = f.z - b.z;
      if (dx * dx + dy * dy + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
        this._removeFood();
        this.foodTimer = 0.4;
        ate = 1;
      } else if (Math.hypot(dx, dz) > FOOD_LOST_DISTANCE) {
        this._removeFood(); // left it far behind: a new one appears closer
      }
    } else {
      this.foodTimer -= dt;
      if (this.foodTimer <= 0) this._spawnFood();
    }

    return {
      points: points + ate * FOOD_POINTS,
      ate,
      crashed: this._hitsSomething(b),
      grabbed,
    };
  }

  _hitsSomething(b) {
    for (const box of this.planes.boxes()) {
      const bb = birdBox(b.x, b.y, b.z);
      if (
        bb.minX < box.maxX && bb.maxX > box.minX && bb.minY < box.maxY && bb.maxY > box.minY &&
        bb.minZ < box.maxZ && bb.maxZ > box.minZ
      ) return true;
    }
    const box = birdBox(b.x, b.y, b.z);
    const ci = blockIndex(b.x), cj = blockIndex(b.z);
    if (b.y - BIRD_HALF <= TOWER_H) {
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          for (let k = 0; k < 4; k++) {
            const r = lotRect(ci + di, cj + dj, k);
            if (
              box.minX < r.maxX && box.maxX > r.minX &&
              box.minZ < r.maxZ && box.maxZ > r.minZ &&
              box.minY < r.h
            ) return true;
          }
        }
      }
    }
    for (const v of this._fleetList()) {
      if (
        box.minX < v.maxX && box.maxX > v.minX &&
        box.minZ < v.maxZ && box.maxZ > v.minZ &&
        box.minY < v.h
      ) return true;
    }
    // balloons of the chunks around us
    const qi = Math.floor(b.x / PITCH), qj = Math.floor(b.z / PITCH);
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const chunk = this.chunks.get(`${qi + di},${qj + dj}`);
        if (!chunk) continue;
        for (const bl of chunk.balloons) {
          const r = bl.r + BIRD_HALF * 0.8;
          if ((b.x - bl.x) ** 2 + (b.y - bl.y) ** 2 + (b.z - bl.z) ** 2 < r * r) return true;
        }
      }
    }
    return false;
  }

  _fleetList() {
    if (!this.fleet) {
      this.fleet = [];
      const lines = new Map();
      for (const c of this.chunks.values()) {
        for (const v of c.vehicles) {
          this.fleet.push(v);
          const key = `${v.east ? 'h' : 'v'}|${v.street}|${v.lane}`;
          if (!lines.has(key)) lines.set(key, []);
          lines.get(key).push(v);
        }
      }
      this.lines = [...lines.values()];
    }
    return this.fleet;
  }

  // Traffic drives toward the town centre, where it queues. Each vehicle brakes for the one in front,
  // for red lights and for cross traffic at intersections without a light.
  _driveTraffic(dt) {
    this._fleetList();
    const busy = new Set(); // "i,j" intersections that east-west traffic is in or about to enter
    for (const v of this.fleet) {
      v.p = v.s0 + v.s;
      if (!v.east) continue;
      const k = Math.round(v.p / PITCH);
      if (Math.abs(v.p - k * PITCH) < STREET_HALF + v.sx / 2 + (v.vel > 1 ? v.vel * 1.5 : 0)) busy.add(`${k},${v.street}`);
    }
    for (const line of this.lines) {
      line.sort((a, c) => a.p - c.p);
      for (let n = 0; n < line.length; n++) {
        const v = line[n], dir = v.dir;
        const len = v.east ? v.sx : v.sz;
        let room = Infinity;
        const lead = line[n + dir];
        if (lead) room = dir * (lead.p - v.p) - (len + (lead.east ? lead.sx : lead.sz)) / 2 - 1.5;
        const front = v.p + dir * len / 2;
        const k = dir > 0 ? Math.ceil((front - 0.3 + STREET_HALF) / PITCH) : Math.floor((front + 0.3 - STREET_HALF) / PITCH);
        const lineGap = dir * (k * PITCH - dir * STREET_HALF - front);
        const i = v.east ? k : v.street, j = v.east ? v.street : k;
        let stop = k === 0; // the town centre: traffic ends here
        if (!stop) {
          const st = signalState(i, j, v.east ? 'h' : 'v', this.sim);
          if (st === null) stop = !v.east && busy.has(`${i},${j}`);
          else stop = st === 'red' || (st === 'yellow' && lineGap > v.vel * v.vel / 12);
        }
        if (stop) room = Math.min(room, lineGap - 0.3);
        const safe = Math.sqrt(2 * 9 * Math.max(0, room));
        v.vel = Math.min(v.speed, v.vel + 4 * dt, safe);
      }
    }
    for (const v of this.fleet) {
      v.s += v.dir * v.vel * dt;
      this._placeVehicle(v);
    }
  }

  _placeVehicle(v) {
    const pos = v.s0 + v.s;
    if (v.east) { v.x = pos; v.z = v.lateral; } else { v.x = v.lateral; v.z = pos; }
    v.minX = v.x - v.sx / 2; v.maxX = v.x + v.sx / 2;
    v.minZ = v.z - v.sz / 2; v.maxZ = v.z + v.sz / 2;
  }

  // --- planes crossing at the next intersection ahead ---
  _spawnPlane() {
    if (this.planes.list.length >= 2) return false;
    const b = this.bird, d = DIRS[this.heading];
    const zAxis = d.x === 0; // the bird flies along z
    const sgn = zAxis ? d.z : d.x;
    const pf = zAxis ? b.z : b.x;
    const lat = zAxis ? b.x : b.z;
    const latC = Math.round(lat / PITCH) * PITCH;
    if (Math.abs(lat - latC) > STREET_HALF) return false; // not over a street
    const base = Math.round((pf + sgn * 105) / PITCH) * PITCH;
    let a0 = null, D = 0;
    for (const cand of [base, base + sgn * PITCH, base - sgn * PITCH]) {
      const dd = sgn * (cand - pf);
      if (dd >= 75 && dd <= 150) { a0 = cand; D = dd; break; }
    }
    if (a0 === null) return false;
    // arrive at our street within about a second of the bird, so it is a real threat
    const vp = 24 + Math.random() * 8;
    const dirP = Math.random() < 0.5 ? 1 : -1;
    const S = vp * Math.max(2, D / this.speed + (Math.random() - 0.5) * 2);
    const offB = (Math.floor(Math.random() * LANE_COUNT) - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
    this.planes.spawn({
      x: zAxis ? latC - dirP * S : a0 + offB,
      z: zAxis ? a0 + offB : latC - dirP * S,
      y: 7 + Math.random() * 13,
      axis: zAxis ? 'x' : 'z',
      dir: dirP,
      speed: vp,
      left: S + 120,
    });
    return true;
  }

  // --- a person in a window ahead, reaching into the outer lane on their side ---
  _spawnGrabber() {
    if (this.grabbers.count >= 2) return false;
    const b = this.bird, d = DIRS[this.heading];
    const zAxis = d.x === 0;
    const lat = zAxis ? b.x : b.z;
    const latC = Math.round(lat / PITCH) * PITCH;
    if (Math.abs(lat - latC) > STREET_HALF) return false;
    const side = Math.random() < 0.5 ? -1 : 1;
    const ahead = (zAxis ? b.z : b.x) + (zAxis ? d.z : d.x) * (90 + Math.random() * 40);
    const faceLat = latC + side * STREET_HALF;
    const probe = faceLat + side; // one unit inside the building
    const lot = zAxis ? lotAt(probe, ahead) : lotAt(ahead, probe);
    if (!lot || lot.h < 9) return false;
    const y = 3 + Math.random() * Math.min(11, lot.h - 6);
    const person = new Person(STREET_HALF - LANE_EDGE);
    person.group.position.set(zAxis ? faceLat : ahead, y, zAxis ? ahead : faceLat);
    // local +z must point across the street, away from the wall
    person.group.rotation.y = Math.atan2(zAxis ? -side : 0, zAxis ? 0 : -side);
    this.grabbers.add(person, this.root);
    return true;
  }

  // --- the single bird-food item ---
  _spawnFood() {
    const spot = pickFoodSpot(this.bird.x, this.bird.z);
    if (!spot) return; // try again next frame
    const mesh = foodMesh();
    mesh.position.set(spot.x, spot.y, spot.z);
    this.root.add(mesh);
    this.food = { ...spot, mesh, phase: Math.random() * 6 };
  }

  _removeFood() {
    if (!this.food) return;
    this.root.remove(this.food.mesh);
    this.food = null;
  }

  // --- streaming the city around the bird ---
  _ensureChunks(force) {
    const b = this.bird;
    const ci = Math.floor(b.x / PITCH), cj = Math.floor(b.z / PITCH);
    if (!force && ci === this.cbi && cj === this.cbj) return;
    this.cbi = ci; this.cbj = cj;
    const R = quality.viewRadius;
    const keep = new Set();
    for (let di = -R; di <= R; di++) {
      for (let dj = -R; dj <= R; dj++) {
        const bi = ci + di, bj = cj + dj, key = `${bi},${bj}`;
        keep.add(key);
        if (!this.chunks.has(key)) this._buildChunk(bi, bj, key);
      }
    }
    for (const key of [...this.chunks.keys()]) if (!keep.has(key)) this._dropChunk(key);

    // only nearby chunks get (and keep) traffic and balloon meshes
    for (const c of this.chunks.values()) {
      const near = Math.max(Math.abs(c.bi - ci), Math.abs(c.bj - cj)) <= NEAR_VIEW;
      if (near && !c.nearGroup) {
        c.nearGroup = new THREE.Group(); // filled by the queue; collision does not need the meshes
        c.group.add(c.nearGroup);
        this.queue.push(() => this._fillNear(c));
      } else if (!near && c.nearGroup) {
        this._emptyNear(c);
        c.group.remove(c.nearGroup);
        c.nearGroup = null;
      }
    }
  }

  _fillNear(c) {
    if (!c.nearGroup || c.nearFilled) return;
    c.nearFilled = true;
    this._buildSignals(c);
    for (const bl of c.balloons) c.nearGroup.add(balloonMesh(bl));
  }

  // Traffic light poles at the corners of a signalled intersection, one per flow of traffic.
  _buildSignals(c) {
    if (signalState(c.bi, c.bj, 'h', 0) === null) return;
    const ox = c.bi * PITCH, oz = c.bj * PITCH, o = STREET_HALF + 1;
    const poles = new Batch();
    c.lenses = [];
    for (const [axis, sx, sz] of [['h', -1, 1], ['h', 1, -1], ['v', -1, -1], ['v', 1, 1]]) {
      const x = ox + sx * o, z = oz + sz * o;
      poles.box(0x2a2d31, 0.35, 6, 0.35, x, PAD_H + 3, z);
      poles.box(0x15171a, 1.1, 1.1, 1.1, x, PAD_H + 6.2, z);
      const lens = new THREE.Mesh(lensGeo(), lensMats().red);
      lens.position.set(x, PAD_H + 6.2, z);
      c.nearGroup.add(lens);
      c.lenses.push({ mesh: lens, axis });
    }
    const geo = poles.build();
    const m = new THREE.Mesh(geo, propMaterial());
    m.castShadow = true;
    c.nearGroup.add(m);
    c.geoms.push(geo);
  }

  _emptyNear(c) {
    c.lenses = null;
    for (const m of [...c.nearGroup.children]) {
      if (m.geometry && c.geoms.includes(m.geometry)) { m.geometry.dispose(); c.geoms.splice(c.geoms.indexOf(m.geometry), 1); }
    }
    c.nearFilled = false;
  }

  _buildChunk(bi, bj, key) {
    const sh = shared();
    const ox = bi * PITCH, oz = bj * PITCH;
    const g = new THREE.Group();
    const pad = new THREE.Mesh(sh.padGeo, sh.padMat);
    pad.position.set(ox + STREET_HALF + BLOCK_SIZE / 2, PAD_H / 2, oz + STREET_HALF + BLOCK_SIZE / 2);
    pad.receiveShadow = true;
    g.add(pad);
    for (let k = 0; k < 4; k++) g.add(lotMesh(bi, bj, k));

    const marks = new THREE.Mesh(sh.dashGeo, sh.dashMat);
    const zebra = new THREE.Mesh(sh.zebraGeo, sh.zebraMat);
    marks.position.set(ox, 0, oz);
    zebra.position.set(ox, 0, oz);
    marks.receiveShadow = zebra.receiveShadow = true;
    g.add(marks, zebra);

    const vehicles = [...segmentVehicles('h', bi, bj), ...segmentVehicles('v', bi, bj)].map((veh) => ({
      ...veh,
      s: veh.along,
      vel: veh.speed,
      minX: veh.x - veh.sx / 2, maxX: veh.x + veh.sx / 2,
      minZ: veh.z - veh.sz / 2, maxZ: veh.z + veh.sz / 2,
    }));
    const balloons = [...segmentBalloons('h', bi, bj), ...segmentBalloons('v', bi, bj)];
    this.root.add(g);
    const chunk = { group: g, vehicles, balloons, nearGroup: null, nearFilled: false, geoms: [], bi, bj };
    this.chunks.set(key, chunk);
    this.fleet = null;
    // trees, lamps and roof details: merged, so built in the background a couple per frame
    this.queue.push(() => {
      if (this.chunks.get(key) !== chunk) return;
      const geo = chunkProps(bi, bj);
      if (!geo) return;
      const m = new THREE.Mesh(geo, propMaterial());
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      chunk.geoms.push(geo);
    });
  }

  _dropChunk(key) {
    const c = this.chunks.get(key);
    this.root.remove(c.group);
    for (const v of c.vehicles) if (v.mesh) { this.vehicleGroup.remove(v.mesh); v.mesh = null; }
    for (const g of c.geoms) g.dispose();
    this.chunks.delete(key);
    this.fleet = null;
  }

  _clearChunks() {
    for (const key of [...this.chunks.keys()]) this._dropChunk(key);
    this.queue = [];
    this.cbi = this.cbj = null;
    this.fleet = null;
    for (const m of [...this.vehicleGroup.children]) this.vehicleGroup.remove(m);
  }

  _flush() {
    while (this.queue.length) this.queue.shift()();
  }

  // once per rendered frame
  frame(dt) {
    this.t += dt;
    const b = this.bird;
    this._ensureChunks(false);
    for (let i = 0; i < TASKS_PER_FRAME && this.queue.length; i++) this.queue.shift()();
    this.asphalt.position.set(Math.round(b.x / 16) * 16, 0, Math.round(b.z / 16) * 16); // whole texture tiles, so it never swims
    if (this.food) {
      this.food.mesh.rotation.y += dt * 2.2;
      this.food.mesh.position.y = this.food.y + Math.sin(this.t * 3 + this.food.phase) * 0.35;
    }
    // vehicles get a mesh while inside the view distance, wherever they have driven to
    const far2 = (this.scene.fog.far * 1.1) ** 2;
    for (const v of this._fleetList()) {
      const seen = (v.x - b.x) ** 2 + (v.z - b.z) ** 2 < far2;
      if (seen && !v.mesh) {
        v.mesh = new THREE.Mesh(vehicleGeometry(v), paintMaterial());
        v.mesh.castShadow = v.mesh.receiveShadow = true;
        v.mesh.rotation.y = v.east ? (v.dir > 0 ? 0 : Math.PI) : (v.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        this.vehicleGroup.add(v.mesh);
      } else if (!seen && v.mesh) {
        this.vehicleGroup.remove(v.mesh);
        v.mesh = null;
      }
      if (v.mesh) v.mesh.position.set(v.x, 0, v.z);
    }
    for (const c of this.chunks.values()) {
      if (!c.nearGroup) continue;
      if (c.lenses) for (const l of c.lenses) l.mesh.material = lensMats()[signalState(c.bi, c.bj, l.axis, this.sim)];
      for (const m of c.nearGroup.children) {
        if (m.userData.baseY === undefined) continue; // only balloons bob
        m.position.y = m.userData.baseY + Math.sin(this.t * 1.6 + m.userData.phase) * 0.4;
      }
    }
    this.map.draw(b, { food: this.food, planes: this.planes.list }, dt);
  }

  updateCamera(camera, dt, shake) {
    const b = this.bird;
    const s = Math.sin(b.yaw), c = Math.cos(b.yaw);
    const back = camera.aspect < 1 ? 12 : 9;
    const kxz = this.snap ? 1 : Math.min(1, 10 * dt);
    const ky = this.snap ? 1 : Math.min(1, 6 * dt);
    this.snap = false;
    camera.position.x += (b.x + s * back - camera.position.x) * kxz;
    camera.position.z += (b.z + c * back - camera.position.z) * kxz;
    camera.position.y += (4 + b.y * 0.7 - camera.position.y) * ky;
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }
    camera.lookAt(b.x - s * 14, b.y * 0.8 + 1, b.z - c * 14);
  }

  catPlace() {
    const b = this.bird;
    return { x: b.x, z: b.z, yaw: -this.heading * Math.PI / 2, localX: 0, dir: Math.random() < 0.5 ? 1 : -1 };
  }
}
