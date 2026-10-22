import { describe, it, expect } from 'vitest';
import { birdBox, overlaps } from '../src/collision.js';
import { cellBox, CELL, laneX } from '../src/obstacles.js';
import { BIRD_HALF, HOUSE_HEIGHT } from '../src/config.js';

describe('collision', () => {
  it('hits a house when low in the same lane', () => {
    expect(overlaps(birdBox(laneX(0), 1), cellBox(CELL.HOUSE, 0, 0))).toBe(true);
  });

  it('clears a house when flying above it', () => {
    expect(overlaps(birdBox(laneX(0), HOUSE_HEIGHT + BIRD_HALF + 0.1), cellBox(CELL.HOUSE, 0, 0))).toBe(false);
  });

  it('cannot fly over a tower', () => {
    expect(overlaps(birdBox(laneX(0), 40), cellBox(CELL.TOWER, 0, 0))).toBe(true);
  });

  it('does not hit anything in a neighbouring lane', () => {
    expect(overlaps(birdBox(laneX(1), 1), cellBox(CELL.TOWER, 0, 0))).toBe(false);
  });

  it('skimming the street (y = bird half) is safe in an open lane', () => {
    expect(overlaps(birdBox(laneX(1), BIRD_HALF), cellBox(CELL.TOWER, 0, 0))).toBe(false);
  });
});
