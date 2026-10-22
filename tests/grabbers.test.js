import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { Person, Grabbers } from '../src/grabbers.js';

// A person at x=8 whose window faces -x; its net reaches x=4 (the outer lane on that side).
function setup() {
  const root = new THREE.Group();
  const grabbers = new Grabbers();
  const person = new Person(4);
  person.group.position.set(8, 8, -30);
  person.group.rotation.y = -Math.PI / 2; // local +z -> world -x
  grabbers.add(person, root);
  return { grabbers, person };
}

// bird flies north (-z) at 14 units/s along x = laneX, at height y; returns true if netted
function flyPast(laneX, y) {
  const { grabbers, person } = setup();
  const bird = { x: laneX, y, z: 0 };
  const forward = new THREE.Vector3(0, 0, -1);
  let caught = false;
  for (let i = 0; i < 120 * 5 && !caught; i++) {
    bird.z -= 14 / 120;
    caught = grabbers.think(1 / 120, { pos: bird, forward, speed: 14 }) === person;
  }
  return { caught, person };
}

describe('window grabber', () => {
  it('nets a bird flying past in the lane next to the window', () => {
    expect(flyPast(4, 8).caught).toBe(true);
  });

  it('misses a bird in the middle lane, the far lane, or well above the window', () => {
    expect(flyPast(0, 8).caught).toBe(false);
    expect(flyPast(-4, 8).caught).toBe(false);
    expect(flyPast(4, 16).caught).toBe(false);
  });

  it('shows the window and person only when the bird is about to arrive', () => {
    const { grabbers, person } = setup();
    const forward = new THREE.Vector3(0, 0, -1);
    grabbers.think(1 / 120, { pos: { x: 4, y: 8, z: 100 }, forward, speed: 14 });
    expect(person.window.visible).toBe(false);
    grabbers.think(1 / 120, { pos: { x: 4, y: 8, z: -10 }, forward, speed: 14 });
    expect(person.window.visible).toBe(true);
    expect(person.body.visible).toBe(true);
  });

  it('hauls a netted bird in and finishes, handing the bird mesh to the net', () => {
    const { person } = flyPast(4, 8);
    const mesh = new THREE.Group();
    person.grab({ mesh });
    expect(mesh.parent).toBe(person.netEnd);
    for (let i = 0; i < 200 && !person.done; i++) person.update(1 / 60);
    expect(person.done).toBe(true);
  });

  it('forgets a bird that went a different way', () => {
    const { grabbers, person } = setup();
    // bird flying east, perpendicular to the wall's usual approach: the wall is parallel to its path
    grabbers.think(1 / 120, { pos: { x: 0, y: 8, z: -30 }, forward: new THREE.Vector3(1, 0, 0), speed: 14 });
    expect(person.state).toBe('done');
    expect(person.window.visible).toBe(false);
  });
});
