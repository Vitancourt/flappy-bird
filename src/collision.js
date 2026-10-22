import { BIRD_HALF } from './config.js';

export function birdBox(x, y, z = 0) {
  return {
    minX: x - BIRD_HALF, maxX: x + BIRD_HALF,
    minY: y - BIRD_HALF, maxY: y + BIRD_HALF,
    minZ: z - BIRD_HALF, maxZ: z + BIRD_HALF,
  };
}

export function overlaps(a, b) {
  return (
    a.minX < b.maxX && a.maxX > b.minX &&
    a.minY < b.maxY && a.maxY > b.minY &&
    a.minZ < b.maxZ && a.maxZ > b.minZ
  );
}
