import * as THREE from 'three';

const RUN = 0.9; // seconds running in
const LUNGE = 0.3; // seconds pouncing on the bird
const CARRY = 1.2; // seconds running off with it
const OFFSCREEN = 18; // how far to the side the cat starts

const mat = (c) => new THREE.MeshStandardMaterial({ color: c });
const box = (w, h, d, c) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));

// A low-poly cat that runs in from the side, grabs the bird and carries it off.
// Local frame: the cat faces +x; mesh.rotation.y flips it to face the other way.
export class Cat {
  constructor(scene) {
    this.scene = scene;
    this.mesh = new THREE.Group();
    const fur = 0xf29a3d, dark = 0xc8742a, cream = 0xfff1d6;

    const body = box(1.7, 0.8, 0.8, fur);
    body.position.y = 0.95;
    this.head = new THREE.Group();
    this.head.position.set(1.0, 1.25, 0);
    const skull = box(0.8, 0.7, 0.8, fur);
    const snout = box(0.35, 0.28, 0.5, cream);
    snout.position.set(0.5, -0.12, 0);
    const nose = box(0.1, 0.1, 0.14, 0xff7a8a);
    nose.position.set(0.7, -0.02, 0);
    for (const z of [-0.2, 0.2]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.35, 4), mat(dark));
      ear.position.set(0.0, 0.5, z * 1.5);
      const eye = box(0.08, 0.14, 0.12, 0x222222);
      eye.position.set(0.41, 0.12, z);
      this.head.add(ear, eye);
    }
    this.head.add(skull, snout, nose);
    // where the bird hangs while being carried
    this.mouth = new THREE.Group();
    this.mouth.position.set(0.75, -0.2, 0);
    this.head.add(this.mouth);

    this.tail = box(1.2, 0.18, 0.18, dark);
    this.tail.geometry.translate(-0.6, 0, 0);
    this.tail.position.set(-0.85, 1.15, 0);

    this.legs = [];
    for (const [x, z] of [[0.65, 0.3], [0.65, -0.3], [-0.65, 0.3], [-0.65, -0.3]]) {
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.6, z);
      const leg = box(0.22, 0.6, 0.22, dark);
      leg.position.y = -0.3;
      pivot.add(leg);
      this.legs.push(pivot);
      this.mesh.add(pivot);
    }
    this.mesh.add(body, this.head, this.tail);
    this.mesh.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.mesh.scale.setScalar(1.5);
    this.mesh.visible = false;
    // root places the whole scene of the catch: its local x axis is the cat's running line
    this.root = new THREE.Group();
    this.root.add(this.mesh);
    scene.add(this.root);
    this.bird = null;
    this.reset();
  }

  reset() {
    if (this.bird) {
      this.scene.add(this.bird.mesh); // give the bird back to the world
      this.bird = null;
    }
    this.mesh.visible = false;
    this.phase = 'idle';
    this.done = false;
  }

  // Start the catch for a bird that has just hit the street.
  // place: { x, z, yaw, localX, dir } - where the catch happens, which way the cat's
  // running line points, the bird's position along it, and the side the cat comes from.
  start(bird, place = { x: 0, z: 0, yaw: 0, localX: bird.x, dir: bird.x >= 0 ? 1 : -1 }) {
    this.reset();
    this.bird = bird;
    this.dir = place.dir;
    this.startX = place.localX - this.dir * OFFSCREEN;
    this.grabX = place.localX - this.dir * 1.3;
    this.t = 0;
    this.phase = 'run';
    this.root.position.set(place.x, 0, place.z);
    this.root.rotation.y = place.yaw;
    this.mesh.visible = true;
    this.mesh.rotation.y = this.dir > 0 ? 0 : Math.PI;
    this.mesh.position.set(this.startX, 0, 0);
  }

  update(dt) {
    if (this.phase === 'idle') return;
    this.t += dt;
    const e = (x) => x * x * (3 - 2 * x); // smoothstep

    if (this.phase === 'run') {
      const k = Math.min(1, this.t / RUN);
      this.mesh.position.x = this.startX + (this.grabX - this.startX) * k;
      this._gallop(this.t, 1);
      if (k >= 1) { this.phase = 'lunge'; this.t = 0; }
    } else if (this.phase === 'lunge') {
      const k = Math.min(1, this.t / LUNGE);
      this.mesh.position.x = this.grabX + this.dir * 0.8 * e(k);
      this.head.rotation.z = -0.7 * Math.sin(k * Math.PI); // head dips to snap
      this._gallop(this.t, 0.4);
      if (k >= 1) { this._grab(); this.phase = 'carry'; this.t = 0; }
    } else if (this.phase === 'carry') {
      const k = Math.min(1, this.t / CARRY);
      this.mesh.position.x += this.dir * (7 + 12 * k) * dt;
      this.mesh.position.y = Math.abs(Math.sin(this.t * 16)) * 0.25; // bounding off
      this._gallop(this.t, 1.3);
      // bird dangles and sways in the mouth
      this.bird.mesh.rotation.z = Math.sin(this.t * 14) * 0.4;
      if (this.t >= CARRY) { this.phase = 'idle'; this.done = true; }
    }
  }

  _grab() {
    const m = this.bird.mesh;
    this.mouth.add(m); // reparent: bird now rides the cat's mouth
    m.position.set(0, 0, 0);
    m.rotation.set(0, -Math.PI / 2, 0); // bird's nose (-z) points along the cat's +x
    m.scale.setScalar(0.7);
    this.head.rotation.z = 0.15;
  }

  _gallop(t, amp) {
    const s = Math.sin(t * 22) * 0.9 * amp;
    this.legs[0].rotation.z = s;
    this.legs[1].rotation.z = -s;
    this.legs[2].rotation.z = -s;
    this.legs[3].rotation.z = s;
    this.tail.rotation.z = 0.4 + Math.sin(t * 9) * 0.25;
  }
}
