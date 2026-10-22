import * as THREE from 'three';
import { BIRD_HALF } from './config.js';

// A person who opens a window and swings a butterfly net across the street as the bird
// flies past. Used by both modes. The window faces local +z (the street); the owner
// places the group on a wall and rotates it so +z points across the street.

export const NET_RADIUS = 1.3;
const PEEK_LEAD = 1.8; // seconds before the bird arrives that the window lights up
const SWING_LEAD = 0.65; // the swing starts this long before arrival...
const SWING_DONE = 0.25; // ...and the net is fully out this long before arrival
const HOLD_AFTER = 0.3; // net stays out this long after the bird has passed
const RETRACT_TIME = 0.35;
const UP = -Math.PI / 2 * 0.95; // pole angle when held up, waving
const SHOULDER = new THREE.Vector3(0.4, -0.1, 0.5);

const SKIN = [0xf1c9a5, 0xd9a273, 0x8d5a3b, 0xf6d7be];
const SHIRT = [0xd9423a, 0x2f6fd6, 0x2f9e6a, 0xf2c230, 0x7a4fd1];

let shared;
function res() {
  if (shared) return shared;
  const lam = (c) => new THREE.MeshStandardMaterial({ color: c });
  shared = {
    unit: new THREE.BoxGeometry(1, 1, 1),
    head: new THREE.SphereGeometry(0.36, 10, 8),
    hoop: new THREE.TorusGeometry(NET_RADIUS, 0.08, 6, 20),
    netDisc: new THREE.CircleGeometry(NET_RADIUS, 20),
    frame: lam(0x5a3b2a),
    glow: new THREE.MeshBasicMaterial({ color: 0xffe9a0 }),
    hair: lam(0x2b2118),
    pole: lam(0xb98a4e),
    hoopMat: lam(0xe8e8e8),
    netMat: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    skin: SKIN.map(lam),
    shirt: SHIRT.map(lam),
  };
  return shared;
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const W = new THREE.Vector3(), N = new THREE.Vector3(), R = new THREE.Vector3();
const TIP = new THREE.Vector3(), SH = new THREE.Vector3();

function segmentDistance(p, a, b) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const len2 = abx * abx + aby * aby + abz * abz || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2));
  return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t), p.z - (a.z + abz * t));
}

export class Person {
  // reach: distance from the wall to the centre of the net when fully out
  constructor(reach) {
    const sh = res();
    this.reach = Math.max(2.5, reach);
    this.state = 'idle'; // idle | peek | swing | retract | grabbed | done
    this.t = 0;
    this.angle = UP;
    this.bird = null;
    this.done = false;

    this.group = new THREE.Group();
    const part = (geo, mat, sx, sy, sz, x, y, z, parent = this.group) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    // the window itself (stays once the person has gone, as an empty lit window)
    this.window = new THREE.Group();
    part(sh.unit, sh.frame, 2.8, 3.0, 0.12, 0, 0, 0.02, this.window);
    part(sh.unit, sh.glow, 2.3, 2.5, 0.12, 0, 0, 0.07, this.window);
    this.window.scale.set(1.35, 1.35, 1); // bigger lit window, easier to spot from a distance
    this.window.visible = false;
    this.group.add(this.window);

    // the person, who slides up into the window
    this.body = new THREE.Group();
    part(sh.unit, pick(sh.shirt), 0.9, 1.0, 0.5, 0, -0.6, 0.4, this.body);
    part(sh.head, pick(sh.skin), 1, 1, 1, 0, 0.25, 0.45, this.body);
    part(sh.unit, sh.hair, 0.62, 0.2, 0.62, 0, 0.55, 0.45, this.body);
    this.pivot = new THREE.Group();
    this.pivot.position.copy(SHOULDER);
    part(sh.unit, sh.pole, 0.1, 0.1, this.reach, 0, 0, this.reach / 2, this.pivot);
    this.netEnd = new THREE.Group();
    this.netEnd.position.z = this.reach;
    this.netEnd.add(new THREE.Mesh(sh.hoop, sh.hoopMat), new THREE.Mesh(sh.netDisc, sh.netMat));
    this.pivot.add(this.netEnd);
    this.body.add(this.pivot);
    this.body.visible = false;
    this.group.add(this.body);
    this.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this._pose(UP, 0);
  }

  _pose(angle, popped) {
    this.angle = angle;
    this.pivot.rotation.x = angle;
    this.body.position.y = -1.4 * (1 - popped);
  }

  // world position of the net's centre
  _tip(out) {
    out.set(SHOULDER.x, SHOULDER.y - this.reach * Math.sin(this.angle), SHOULDER.z + this.reach * Math.cos(this.angle));
    return this.group.localToWorld(out);
  }

  // ctx: { pos: {x,y,z} bird, forward: unit Vector3 of its flight, speed }
  // Returns true on the step it catches the bird.
  think(dt, ctx) {
    if (this.state === 'done' || this.state === 'grabbed') return false;
    this.group.getWorldPosition(W);
    this.group.getWorldDirection(N); // across the street, toward it
    R.subVectors(W, ctx.pos);
    const ahead = R.dot(ctx.forward);
    const tt = ahead / Math.max(ctx.speed, 1); // seconds until the bird is level with the window
    this.t += dt;

    if (this.state === 'idle') {
      // wall must run along the bird's path; if the bird went another way, forget it
      if (Math.abs(N.dot(ctx.forward)) > 0.3 || ahead < -8) return this._finish();
      if (tt < PEEK_LEAD) { this.state = 'peek'; this.t = 0; this.window.visible = true; this.body.visible = true; }
    }
    if (this.state === 'peek') {
      const popped = Math.min(1, this.t / 0.35);
      this._pose(UP + Math.sin(this.t * 9) * 0.12, popped * popped * (3 - 2 * popped));
      if (tt < SWING_LEAD) this.state = 'swing';
    }
    if (this.state === 'swing') {
      const p = Math.min(1, Math.max(0, (SWING_LEAD - tt) / (SWING_LEAD - SWING_DONE)));
      this._pose(UP * (1 - p * p * (3 - 2 * p)), 1);
      if (tt < -HOLD_AFTER) { this.state = 'retract'; this.t = 0; }
      if (p > 0.15 && this._hits(ctx.pos)) return true;
    } else if (this.state === 'retract') {
      const p = Math.min(1, this.t / RETRACT_TIME);
      this._pose(UP * p, 1 - p * 0.6);
      if (p >= 1) this._finish(true);
    }
    return false;
  }

  _hits(pos) {
    this._tip(TIP);
    SH.copy(SHOULDER);
    this.group.localToWorld(SH);
    const reach = NET_RADIUS + BIRD_HALF * 0.7;
    return Math.hypot(pos.x - TIP.x, pos.y - TIP.y, pos.z - TIP.z) < reach ||
      segmentDistance(pos, SH, TIP) < 0.5 + BIRD_HALF * 0.7; // the pole counts too
  }

  _finish(keepWindow = false) {
    this.state = 'done';
    this.done = true;
    this.body.visible = false;
    this.window.visible = keepWindow;
    return false;
  }

  // The net has caught the bird: it rides the net while the person hauls it inside.
  grab(bird) {
    this.state = 'grabbed';
    this.t = 0;
    this.done = false;
    this.bird = bird;
    this.netEnd.add(bird.mesh);
    bird.mesh.position.set(0, 0, 0);
    bird.mesh.rotation.set(0, 0, 0);
    bird.mesh.scale.setScalar(0.6);
    this.from = this.angle;
  }

  // animation after a catch (driven by main.js like the cat's)
  update(dt) {
    if (this.state !== 'grabbed') return;
    this.t += dt;
    const p = Math.min(1, this.t / 0.9);
    this._pose(this.from + (UP - this.from) * p * p * (3 - 2 * p), 1);
    this.bird.mesh.rotation.z = Math.sin(this.t * 18) * 0.5 * (1 - p);
    if (this.t > 1.3) this.done = true;
  }
}

// Owns the people currently on walls.
export class Grabbers {
  constructor() { this.persons = []; }

  get count() { return this.persons.length; }

  add(person, parent) {
    parent.add(person.group);
    this.persons.push(person);
  }

  // returns the person who caught the bird this step, if any
  think(dt, ctx) {
    let hit = null;
    for (const p of this.persons) if (p.think(dt, ctx) && !hit) hit = p;
    for (let i = this.persons.length - 1; i >= 0; i--) {
      const p = this.persons[i];
      if (p.state === 'done' && p !== hit) {
        p.group.parent?.remove(p.group);
        this.persons.splice(i, 1);
      }
    }
    return hit;
  }

  reset() {
    for (const p of this.persons) p.group.parent?.remove(p.group);
    this.persons = [];
  }
}
