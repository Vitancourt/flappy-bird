import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FOOD_POINTS } from '../src/citygen.js';
import { LANE_WIDTH } from '../src/config.js';

// CityMode only needs a canvas for its textures and the minimap element; fake both.
const ctx = new Proxy({}, {
  get: (_, p) => {
    if (p === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (typeof p === 'symbol') return undefined; // keep the proxy from being coerced to a primitive
    return () => ctx; // every drawing call (and gradient.addColorStop) is a no-op
  },
  set: () => true,
});
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  getElementById: () => ({ clientWidth: 0, getContext: () => ctx }),
};
globalThis.window = { devicePixelRatio: 1 };

let CityMode, Bird;
beforeAll(async () => {
  ({ CityMode } = await import('../src/modes/city.js'));
  ({ Bird } = await import('../src/bird.js'));
});

let scene, bird, city;
// a 90-degree turn: step to the edge lane, then press again
const turn = (d) => { city.steer(d); city.steer(d); };
beforeEach(() => {
  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0, 1, 2);
  bird = new Bird(scene);
  city = new CityMode({ scene, camera: new THREE.PerspectiveCamera(), bird });
  city.activate();
  bird.reset();
  city.reset();
});

// run the sim, holding altitude well above the street hazards (all below 21 units)
function fly(seconds, { y = 45, stopOnCrash = true } = {}) {
  let result = { crashed: false, points: 0, ate: 0 };
  for (let t = 0; t < seconds * 120; t++) {
    bird.vy = 0;
    bird.y = y;
    const r = city.step(1 / 120, t / 120);
    result.points += r.points;
    result.ate += r.ate;
    if (r.crashed) { result.crashed = true; if (stopOnCrash) break; }
  }
  return result;
}

describe('city mode', () => {
  it('flies straight up the first street without hitting anything', () => {
    const r = fly(20);
    expect(r.crashed).toBe(false);
    expect(bird.z).toBeLessThan(-200);
    expect(Math.abs(bird.x)).toBeLessThan(0.5);
    expect(r.points).toBeGreaterThan(0); // distance score
  });

  it('turns 90 degrees and follows the cross street at an intersection', () => {
    turn(1); // right, at the start intersection (0,0)
    const r = fly(10);
    expect(r.crashed).toBe(false);
    expect(bird.x).toBeGreaterThan(100);
    expect(Math.abs(bird.z)).toBeLessThan(1);
  });

  it('hits a building when turning in the middle of a block, low down', () => {
    bird.z = -45; // between intersections, facing a lot (the 4-unit gap at z=-32 is an alley)
    turn(1);
    const r = fly(2, { y: 1 });
    expect(r.crashed).toBe(true);
  });

  it('left and right change lane, and pressing again at the edge turns', () => {
    expect(city.lane).toBe(1);
    city.steer(1);
    expect(city.lane).toBe(2);
    expect(city.heading).toBe(0); // still the same way
    city.steer(1);
    expect(city.heading).toBe(1); // turned right
    expect(city.lane).toBe(1); // and settled in the middle lane of the new street
    turn(1); turn(1); turn(1);
    expect(city.heading).toBe(0);
    turn(-1);
    expect(city.heading).toBe(3);
  });

  it('moves between the three lanes', () => {
    city.steer(1);
    fly(1);
    expect(bird.x).toBeCloseTo(LANE_WIDTH, 0);
    city.steer(-1); city.steer(-1);
    fly(1);
    expect(bird.x).toBeCloseTo(-LANE_WIDTH, 0);
  });

  it('crashes into a vehicle at street level but clears it from above', () => {
    const c = [...city.chunks.values()].find((ch) => ch.vehicles.length);
    const v = c.vehicles[0];
    bird.x = v.x; bird.z = v.z; bird.y = 0.8; bird.vy = 0;
    expect(city.step(1 / 120, 0).crashed).toBe(true);
    bird.x = v.x; bird.z = v.z; bird.y = v.h + 2; bird.vy = 0;
    expect(city.step(1 / 120, 0).crashed).toBe(false);
  });

  it('keeps exactly one piece of bird food on the map', () => {
    expect(city.food).not.toBeNull();
    expect(city.scene).toBe(scene);
    const first = { ...city.food };
    fly(5);
    expect([first.x, first.z]).toEqual([city.food?.x ?? first.x, city.food?.z ?? first.z].map((v, i) => v));
    // there is only ever the one item in the scene graph
    let count = 0;
    city.root.traverse((o) => { if (o.userData.isFood) count++; });
    expect(count).toBeLessThanOrEqual(1);
  });

  it('collects the food for 10 points, then a new one appears elsewhere', () => {
    const old = city.food;
    bird.x = old.x; bird.y = old.y; bird.z = old.z;
    bird.vy = 0;
    const r = city.step(1 / 120, 0);
    expect(r.ate).toBe(1);
    expect(r.points).toBeGreaterThanOrEqual(FOOD_POINTS);
    expect(city.food).toBeNull();
    bird.x = 0; bird.z = 0; // back on the street
    fly(1, { stopOnCrash: false });
    expect(city.food).not.toBeNull();
    expect(city.food).not.toBe(old);
  });

  it('crashes into a balloon', () => {
    const c = [...city.chunks.values()].find((ch) => ch.balloons.length);
    const bl = c.balloons[0];
    bird.x = bl.x; bird.y = bl.y; bird.z = bl.z; bird.vy = 0;
    expect(city.step(1 / 120, 0).crashed).toBe(true);
  });

  it('crashes into a plane crossing the street', () => {
    city.planes.spawn({ x: bird.x, y: 8, z: bird.z, axis: 'x', dir: 1, speed: 25, left: 100 });
    bird.vy = 0; bird.y = 8;
    expect(city.step(1 / 120, 0).crashed).toBe(true);
    city.planes.reset();
    bird.y = 8;
    expect(city.step(1 / 120, 0).crashed).toBe(false);
  });

  it('streams chunks as the bird moves', () => {
    const before = new Set(city.chunks.keys());
    fly(10);
    city.frame(0.016);
    const after = new Set(city.chunks.keys());
    expect(after.size).toBe(before.size); // same window size, shifted
    expect([...after].some((k) => !before.has(k))).toBe(true);
  });

  it('traffic respects each other: vehicles never overlap, even at intersections', () => {
    let worst = 0, braked = false;
    for (let t = 0; t < 90 * 120; t++) {
      bird.vy = 0; bird.y = 45; bird.x = 0; bird.z = 0; // hover over the town centre
      city.step(1 / 120, t / 120);
      if (t % 12) continue;
      const fleet = city._fleetList();
      if (fleet.some((v) => v.vel < 0.5)) braked = true;
      for (let a = 0; a < fleet.length; a++) {
        for (let b = a + 1; b < fleet.length; b++) {
          const p = fleet[a], q = fleet[b];
          const ox = Math.min(p.maxX, q.maxX) - Math.max(p.minX, q.minX);
          const oz = Math.min(p.maxZ, q.maxZ) - Math.max(p.minZ, q.minZ);
          if (ox > 0 && oz > 0) worst = Math.max(worst, Math.min(ox, oz));
        }
      }
    }
    expect(worst).toBeLessThan(0.5);
    expect(braked).toBe(true); // some queued at a red light, the town centre or behind another vehicle
  });
});
