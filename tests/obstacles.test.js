import { describe, it, expect } from 'vitest';
import { createRowGenerator, CELL, laneX, cellBox } from '../src/obstacles.js';
import { LANE_WIDTH } from '../src/config.js';

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('row generator', () => {
  for (const n of [3, 5, 9]) {
    it(`always leaves a non-tower lane reachable from the previous row (${n} lanes)`, () => {
      const next = createRowGenerator(seeded(42), n);
      let prev = null;
      for (let i = 0; i < 2000; i++) {
        const row = next();
        expect(row).toHaveLength(n);
        const passable = row.map((c, l) => (c !== CELL.TOWER ? l : -1)).filter((l) => l >= 0);
        expect(passable.length).toBeGreaterThan(0);
        if (prev) {
          const reachable = passable.some((l) => prev.some((p) => Math.abs(p - l) <= 1));
          expect(reachable).toBe(true);
        }
        prev = passable;
      }
    });
  }
});

describe('lanes', () => {
  it('centres lanes around x=0 and scales with lane count', () => {
    expect(laneX(1, 3)).toBe(0);
    expect(laneX(0, 3)).toBe(-LANE_WIDTH);
    expect(laneX(4, 5)).toBe(2 * LANE_WIDTH);
  });

  it('towers are much taller than houses', () => {
    expect(cellBox(CELL.TOWER, 0, 0).maxY).toBeGreaterThan(cellBox(CELL.HOUSE, 0, 0).maxY * 10);
  });
});
