import * as THREE from 'three';
import {
  START_SPEED, MAX_SPEED, SPEED_RAMP, BIRD_HALF, LANE_COUNT, LANE_WIDTH,
} from '../config.js';
import { World } from '../world.js';
import { Obstacles } from '../obstacles.js';
import { birdBox, overlaps } from '../collision.js';
import { Grabbers, Person } from '../grabbers.js';

const FORWARD = new THREE.Vector3(0, 0, -1);
const LANE_EDGE = ((LANE_COUNT - 1) / 2) * LANE_WIDTH; // centre of the outer lane

// Classic mode: a straight canyon with three lanes; the world scrolls toward the bird.
// Every mode exposes the same small interface that main.js drives.
export class ClassicMode {
  constructor({ scene, camera, bird }) {
    this.id = 'classic';
    this.scene = scene;
    this.camera = camera;
    this.bird = bird;
    this.root = new THREE.Group();
    scene.add(this.root);
    this.world = new World(scene, this.root);
    this.obstacles = new Obstacles(this.root);
    this.speed = START_SPEED;
    this.grabbers = new Grabbers();
    this.grabTimer = 0;
  }

  activate() {
    this.root.visible = true;
    this.bird.laneMode = true;
    this.scene.fog.near = 50;
    this.scene.fog.far = 210;
    this.camera.position.set(0, 6, 9);
  }

  deactivate() { this.root.visible = false; }

  // main.js resets the bird first; this resets everything mode-specific
  reset() {
    this.obstacles.reset();
    this.speed = START_SPEED;
    this.grabbers.reset();
    this.grabTimer = 4;
  }

  // menu / ready / game over: the street drifts slowly (or stands still)
  idle(dt, drifting) { this.world.update(dt, drifting ? 6 : 0); }

  // one fixed simulation step while playing
  step(dt, time) {
    const bird = this.bird;
    this.speed = Math.min(MAX_SPEED, this.speed + SPEED_RAMP * dt);
    bird.update(dt, time);
    this.world.update(dt, this.speed);
    const points = this.obstacles.update(dt, this.speed);

    const box = birdBox(bird.x, bird.y);
    let crashed = false;
    for (const solid of this.obstacles.solidBoxes(-BIRD_HALF * 2, BIRD_HALF * 2)) {
      if (overlaps(box, solid)) { crashed = true; break; }
    }

    // people in the windows of the buildings beside the street
    this.grabTimer -= dt;
    if (this.grabTimer <= 0) this.grabTimer = this._spawnGrabber() ? 3.5 + Math.random() * 3 : 0.4;
    const grabbed = this.grabbers.think(dt, { pos: bird, forward: FORWARD, speed: this.speed });
    return { points, ate: 0, crashed, grabbed };
  }

  // Puts a person in a window of a side building that is still far ahead. They are children
  // of the building, so they scroll with it. The net reaches the centre of the outer lane.
  _spawnGrabber() {
    if (this.grabbers.count >= 2) return false;
    const cands = this.world.side.filter(
      (b) => b.position.z < -90 && b.position.z > -140 && b.children.length === 0,
    );
    if (!cands.length) return false;
    const b = cands[Math.floor(Math.random() * cands.length)];
    const s = Math.sign(b.position.x);
    const { width, height, depth } = b.geometry.parameters;
    const reach = Math.abs(b.position.x - s * width / 2) - LANE_EDGE;
    const person = new Person(reach);
    person.group.position.set(-s * width / 2, 3 + Math.random() * 13 - height / 2, (Math.random() - 0.5) * (depth - 4));
    person.group.rotation.y = -s * Math.PI / 2; // local +z points across the street
    this.grabbers.add(person, b);
    return true;
  }

  steer(dir) { this.bird.moveLane(dir); }

  // 0..1 how fast we are going between the start and top speed
  speedRatio() { return (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED); }

  frame() {}

  updateCamera(camera, dt, shake) {
    const bird = this.bird;
    camera.position.x += (bird.x * 0.6 - camera.position.x) * Math.min(1, 6 * dt);
    camera.position.y += (4 + bird.y * 0.7 - camera.position.y) * Math.min(1, 6 * dt);
    camera.position.z = camera.aspect < 1 ? 11 : 9;
    if (shake > 0) {
      camera.position.x += (Math.random() - 0.5) * shake;
      camera.position.y += (Math.random() - 0.5) * shake;
    }
    camera.lookAt(bird.x * 0.6, bird.y * 0.8 + 1, -14);
  }

  // where the cat catches the bird (see Cat.start)
  catPlace() {
    const x = this.bird.x;
    return { x: 0, z: 0, yaw: 0, localX: x, dir: x >= 0 ? 1 : -1 };
  }
}
