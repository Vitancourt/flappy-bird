import { LANE_COUNT, LANE_WIDTH } from './config.js';

// Deterministic, endless city. Streets run along multiples of PITCH on both axes;
// each block between four streets holds 2x2 lots. Everything is derived from a hash
// of integer coordinates, so any part of the city can be rebuilt on demand.
export const PITCH = 64; // distance between street centre lines
export const STREET_HALF = 8; // half street width
export const LOT = 22; // lot footprint (square)
export const LOT_STEP = 26; // lot spacing inside a block
export const BLOCK_SIZE = 2 * LOT + (LOT_STEP - LOT); // 48
export const HOUSE_H = 3; // 1 floor
export const MID_H = 12; // 4 floors
export const TOWER_H = 60; // 20 floors
export const PALETTE_SIZE = 6;
export const FOOD_POINTS = 10;

export function hash(a, b, c = 0) {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Block index along one axis for a world coordinate (the block that starts at i*PITCH+STREET_HALF).
export function blockIndex(v) {
  return Math.floor((v - STREET_HALF) / PITCH);
}

export function lotInfo(bi, bj, k) {
  const r = hash(bi, bj, k + 1);
  const type = r < 0.4 ? 'house' : r < 0.65 ? 'mid' : 'tower';
  return {
    type,
    h: type === 'house' ? HOUSE_H : type === 'mid' ? MID_H : TOWER_H,
    color: Math.floor(hash(bi, bj, k + 11) * PALETTE_SIZE),
  };
}

export function lotRect(bi, bj, k) {
  const minX = bi * PITCH + STREET_HALF + (k % 2) * LOT_STEP;
  const minZ = bj * PITCH + STREET_HALF + (k >> 1) * LOT_STEP;
  return { minX, maxX: minX + LOT, minZ, maxZ: minZ + LOT, h: lotInfo(bi, bj, k).h };
}

// The lot (and its details) covering a world point, or null for streets and alleys.
export function lotAt(x, z) {
  const bi = blockIndex(x), bj = blockIndex(z);
  const ox = x - (bi * PITCH + STREET_HALF), oz = z - (bj * PITCH + STREET_HALF);
  if (ox < 0 || ox >= BLOCK_SIZE || oz < 0 || oz >= BLOCK_SIZE) return null;
  const kx = ox < LOT ? 0 : ox >= LOT_STEP ? 1 : -1;
  const kz = oz < LOT ? 0 : oz >= LOT_STEP ? 1 : -1;
  if (kx < 0 || kz < 0) return null; // the 4-unit alley between lots
  const k = kz * 2 + kx;
  return { bi, bj, k, ...lotRect(bi, bj, k) };
}

// Traffic standing in the street lanes. All of it can be flown over (taller lorries need a
// few flaps); each row of traffic leaves one lane empty so there is always a way round.
export const VEHICLE_TYPES = {
  car: { h: 1.6, len: 4.2, w: 2.0 },
  van: { h: 2.6, len: 5.5, w: 2.2 },
  bus: { h: 3.4, len: 10, w: 2.7 },
  lorry: { h: 5, len: 8, w: 2.7 },
};
export const VEHICLE_COLORS = 6;
export const VEHICLE_CHANCE = 0.55; // per lane per row (the free lane aside)

// Vehicles of one street segment (a segment is the stretch of street between two intersections): two rows of traffic.
export function segmentVehicles(kind, bi, bj) {
  const salt = kind === 'h' ? 300 : 400;
  const out = [];
  for (let row = 0; row < 2; row++) {
    const base = salt + row * 20;
    const along = 12 + row * 24 + (hash(bi, bj, base) - 0.5) * 6; // keeps buses clear of intersections
    const free = Math.floor(hash(bi, bj, base + 1) * LANE_COUNT);
    for (let lane = 0; lane < LANE_COUNT; lane++) {
      if (lane === free || hash(bi, bj, base + 2 + lane) > VEHICLE_CHANCE) continue;
      const r = hash(bi, bj, base + 8 + lane);
      const type = r < 0.5 ? 'car' : r < 0.75 ? 'van' : r < 0.9 ? 'bus' : 'lorry';
      const t = VEHICLE_TYPES[type];
      const off = (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
      const east = kind === 'h'; // east-west street: vehicles are long along x
      const centre = (east ? bi : bj) * PITCH + PITCH / 2;
      out.push({
        type,
        color: Math.floor(hash(bi, bj, base + 12 + lane) * VEHICLE_COLORS),
        h: t.h,
        along,
        street: east ? bj : bi, // row/column of the street it drives along
        dir: centre > 0 ? -1 : 1, // everyone drives toward the town centre at the origin
        speed: 5 + hash(bi, bj, base + 16 + lane) * 5, // cruising speed
        s0: (east ? bi : bj) * PITCH + STREET_HALF,
        lateral: east ? bj * PITCH + off : bi * PITCH + off,
        x: east ? bi * PITCH + STREET_HALF + along : bi * PITCH + off,
        z: east ? bj * PITCH + off : bj * PITCH + STREET_HALF + along,
        sx: east ? t.len : t.w,
        sz: east ? t.w : t.len,
        east,
        row,
        lane,
      });
    }
  }
  return out;
}

// Length of a street segment; traffic drives along it and starts over once out of sight.
export const SEGMENT_LEN = PITCH - 2 * STREET_HALF;

// Traffic lights: some intersections (i, j) have a signal that cycles with a random phase.
// axis 'h' is traffic moving along x, 'v' along z. Returns 'green' | 'yellow' | 'red', or null if unsignalled.
export const SIGNAL_CHANCE = 0.6;
export const SIGNAL_CYCLE = 22; // h green 0-7, yellow to 9, all red to 11, v green 11-18, yellow to 20, all red
export function signalState(i, j, axis, t) {
  if (hash(i, j, 77) >= SIGNAL_CHANCE) return null;
  const ph = (t + hash(i, j, 78) * SIGNAL_CYCLE) % SIGNAL_CYCLE;
  const [g, y] = axis === 'h' ? [0, 7] : [11, 18];
  if (ph >= g && ph < y) return 'green';
  if (ph >= y && ph < y + 2) return 'yellow';
  return 'red';
}

// Party balloons floating in the street airspace (not flyable through; steer or climb over).
export const BALLOON_R = 1.7;
export const BALLOON_COLORS = 6;
export const BALLOON_CHANCE = 0.45; // per slot, two slots per street segment

export function segmentBalloons(kind, bi, bj) {
  const salt = kind === 'h' ? 500 : 600;
  const out = [];
  for (let i = 0; i < 2; i++) {
    const base = salt + i * 10;
    if (hash(bi, bj, base) > BALLOON_CHANCE) continue;
    const along = 6 + hash(bi, bj, base + 1) * (BLOCK_SIZE - 12);
    const lane = Math.floor(hash(bi, bj, base + 2) * LANE_COUNT);
    const off = (lane - (LANE_COUNT - 1) / 2) * LANE_WIDTH;
    const east = kind === 'h';
    out.push({
      x: east ? bi * PITCH + STREET_HALF + along : bi * PITCH + off,
      z: east ? bj * PITCH + off : bj * PITCH + STREET_HALF + along,
      y: 7 + hash(bi, bj, base + 3) * 13,
      color: Math.floor(hash(bi, bj, base + 4) * BALLOON_COLORS),
      r: BALLOON_R,
    });
  }
  return out;
}

// True if a point is within `margin` of a balloon of the street segment it lies in.
export function nearBalloon(x, y, z, margin = 3.5) {
  const east = Math.abs(z / PITCH - Math.round(z / PITCH)) * PITCH <= STREET_HALF; // on an east-west street
  const candidates = [];
  if (east) candidates.push(...segmentBalloons('h', Math.floor((x - STREET_HALF) / PITCH), Math.round(z / PITCH)));
  if (Math.abs(x / PITCH - Math.round(x / PITCH)) * PITCH <= STREET_HALF) {
    candidates.push(...segmentBalloons('v', Math.round(x / PITCH), Math.floor((z - STREET_HALF) / PITCH)));
  }
  return candidates.some((b) => Math.hypot(b.x - x, b.y - y, b.z - z) < b.r + margin);
}

// A spot for the single bird-food item: on a street, at flying height, between minD and maxD
// from (bx, bz). Returns null if no spot was found this time (try again next frame).
export function pickFoodSpot(bx, bz, rng = Math.random, minD = 80, maxD = 150) {
  for (let i = 0; i < 40; i++) {
    const east = rng() < 0.5; // along an east-west street, or a north-south one
    const line = Math.round(((east ? bz : bx) + (rng() - 0.5) * 2 * maxD) / PITCH) * PITCH;
    const along = (east ? bx : bz) + (rng() - 0.5) * 2 * maxD;
    const lateral = (rng() - 0.5) * 6;
    const x = east ? along : line + lateral;
    const z = east ? line + lateral : along;
    const d = Math.hypot(x - bx, z - bz);
    if (d < minD || d > maxD) continue;
    const y = 6.5 + rng() * 8; // above every vehicle
    if (nearBalloon(x, y, z)) continue;
    return { x, y, z };
  }
  return null;
}
