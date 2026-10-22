import { describe, it, expect } from 'vitest';
import {
  hash, lotRect, lotInfo, lotAt, pickFoodSpot, segmentBalloons, nearBalloon, blockIndex, PITCH, STREET_HALF, BLOCK_SIZE, HOUSE_H, TOWER_H,
  segmentVehicles, VEHICLE_TYPES, 
} from '../src/citygen.js';

describe('citygen', () => {
  it('hash is deterministic and in [0,1)', () => {
    expect(hash(3, -7, 2)).toBe(hash(3, -7, 2));
    for (let i = -50; i < 50; i++) {
      const v = hash(i, i * 3, 5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('keeps lots inside their block, leaving the streets open', () => {
    for (let bi = -4; bi < 4; bi++) for (let bj = -4; bj < 4; bj++) for (let k = 0; k < 4; k++) {
      const r = lotRect(bi, bj, k);
      expect(r.minX).toBeGreaterThanOrEqual(bi * PITCH + STREET_HALF);
      expect(r.maxX).toBeLessThanOrEqual(bi * PITCH + STREET_HALF + BLOCK_SIZE);
      expect(r.minZ).toBeGreaterThanOrEqual(bj * PITCH + STREET_HALF);
      expect(r.maxZ).toBeLessThanOrEqual(bj * PITCH + STREET_HALF + BLOCK_SIZE);
    }
  });

  it('uses only house and tower heights from the agreed set', () => {
    const heights = new Set();
    for (let i = 0; i < 400; i++) heights.add(lotInfo(i, -i, i % 4).h);
    expect(heights.has(HOUSE_H)).toBe(true);
    expect(heights.has(TOWER_H)).toBe(true);
  });

  it('blockIndex matches lot placement', () => {
    expect(blockIndex(10)).toBe(0);
    expect(blockIndex(PITCH + 9)).toBe(1);
    expect(blockIndex(-1)).toBe(-1); // inside the street west of block 0
  });

  it('traffic stays on its street segment and always leaves a lane free in each row', () => {
    let total = 0;
    const maxH = Math.max(...Object.values(VEHICLE_TYPES).map((t) => t.h));
    for (let bi = -6; bi < 6; bi++) for (let bj = -6; bj < 6; bj++) for (const kind of ['h', 'v']) {
      const vs = segmentVehicles(kind, bi, bj);
      const rows = new Map();
      for (const v of vs) {
        total++;
        rows.set(v.row, (rows.get(v.row) || 0) + 1);
        const [a0, a1] = kind === 'h'
          ? [v.x - v.sx / 2, v.x + v.sx / 2] : [v.z - v.sz / 2, v.z + v.sz / 2];
        const start = (kind === 'h' ? bi : bj) * PITCH + STREET_HALF;
        expect(a0).toBeGreaterThanOrEqual(start); // not inside the intersection before it
        expect(a1).toBeLessThanOrEqual(start + BLOCK_SIZE); // nor the one after it
        const lateral = kind === 'h' ? Math.abs(v.z - bj * PITCH) + v.sz / 2 : Math.abs(v.x - bi * PITCH) + v.sx / 2;
        expect(lateral).toBeLessThanOrEqual(STREET_HALF);
      }
      for (const n of rows.values()) expect(n).toBeLessThan(3);
    }
    expect(total).toBeGreaterThan(200);
  });

  it('lotAt finds lots, and nothing in streets or alleys', () => {
    expect(lotAt(0, 0)).toBeNull(); // intersection
    expect(lotAt(20, -4)).toBeNull(); // on the street
    const r = lotAt(9, 9);
    expect(r).toMatchObject({ bi: 0, bj: 0, k: 0 });
    expect(lotAt(32, 9)).toBeNull(); // alley between lots
    expect(lotAt(9 + 26, 9 + 26).k).toBe(3);
  });

  it('picks a bird-food spot on a street, in range, above traffic', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let i = 0; i < 300; i++) {
      const bx = (rng() - 0.5) * 2000, bz = (rng() - 0.5) * 2000;
      const f = pickFoodSpot(bx, bz, rng);
      if (!f) continue;
      const d = Math.hypot(f.x - bx, f.z - bz);
      expect(d).toBeGreaterThanOrEqual(80);
      expect(d).toBeLessThanOrEqual(150);
      expect(f.y).toBeGreaterThan(5);
      expect(lotAt(f.x, f.z)).toBeNull(); // never inside a building
      expect(nearBalloon(f.x, f.y, f.z)).toBe(false);
    }
  });

  it('balloons float in the street airspace', () => {
    let n = 0;
    for (let bi = -5; bi < 5; bi++) for (let bj = -5; bj < 5; bj++) for (const kind of ['h', 'v']) {
      for (const b of segmentBalloons(kind, bi, bj)) {
        n++;
        expect(b.y).toBeGreaterThan(6);
        expect(lotAt(b.x, b.z)).toBeNull();
      }
    }
    expect(n).toBeGreaterThan(50);
  });

  it('traffic drives toward the town centre', () => {
    for (const [bi, bj] of [[3, 2], [-4, 1]]) {
      const v = segmentVehicles('h', bi, bj)[0] ?? segmentVehicles('h', bi, bj + 1)[0];
      if (!v) continue;
      expect(v.dir).toBe(bi > 0 ? -1 : 1);
      expect(v.speed).toBeGreaterThan(0);
    }
  });
});
