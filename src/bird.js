import * as THREE from 'three';
import {
  LANE_COUNT, GRAVITY, FLAP_VELOCITY, MAX_FALL_SPEED, BIRD_HALF, MAX_Y, LANE_SWITCH_SPEED,
} from './config.js';
import { laneX } from './obstacles.js';

const GROUND_Y = BIRD_HALF; // street is safe: the bird rests/skims on it

export class Bird {
  constructor(scene) {
    this.mesh = new THREE.Group();
    this.mesh.rotation.order = 'YXZ'; // heading first, then pitch/roll in the bird's own frame
    this.laneMode = true; // classic: x eases toward the chosen lane. City mode moves x/z itself.
    const mat = (c, roughness = 0.62) => new THREE.MeshStandardMaterial({ color: c, roughness, metalness: 0 });
    const feather = mat(0xffcf3a), belly = mat(0xfff0b0), orange = mat(0xff8a1a, 0.5), dark = mat(0x201a14, 0.3);
    const wingMat = mat(0xffb000), white = mat(0xffffff, 0.2);
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const part = (geo, material, sx, sy, sz, x, y, z, parent = this.mesh) => {
      const m = new THREE.Mesh(geo, material);
      m.scale.set(sx, sy, sz);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    part(sphere, feather, 0.48, 0.42, 0.62, 0, 0, 0.05); // body
    part(sphere, belly, 0.36, 0.28, 0.46, 0, -0.12, -0.02); // belly
    part(sphere, feather, 0.31, 0.3, 0.31, 0, 0.36, -0.55); // head
    const cone = new THREE.ConeGeometry(1, 1, 12);
    const upper = part(cone, orange, 0.12, 0.34, 0.1, 0, 0.32, -0.93); // beak
    upper.rotation.x = -Math.PI / 2;
    const lower = part(cone, orange, 0.09, 0.22, 0.07, 0, 0.25, -0.86);
    lower.rotation.x = -Math.PI / 2;
    for (const sx of [-1, 1]) {
      part(sphere, white, 0.085, 0.085, 0.085, sx * 0.17, 0.43, -0.76); // eyes
      part(sphere, dark, 0.045, 0.045, 0.045, sx * 0.185, 0.43, -0.82);
    }
    for (let i = -1; i <= 1; i++) { // little crest
      const c = part(cone, orange, 0.05, 0.22, 0.05, i * 0.07, 0.66, -0.52);
      c.rotation.z = -i * 0.35;
    }
    for (let i = -1; i <= 1; i++) { // tail fan
      const t = part(new THREE.BoxGeometry(1, 0.05, 1), i ? wingMat : feather, 0.16, 1, 0.52, i * 0.12, 0.08, 0.86);
      t.rotation.y = i * 0.32;
    }
    // wings pivot at the shoulder; rotation.z flaps them
    const makeWing = (s) => {
      const w = new THREE.Group();
      w.position.set(s * 0.4, 0.1, 0.05);
      part(sphere, wingMat, 0.56, 0.07, 0.36, s * 0.55, 0, 0, w);
      for (let i = 0; i < 3; i++) part(new THREE.BoxGeometry(1, 0.03, 1), feather, 0.22, 1, 0.14, s * (1.05 + i * 0.09), 0, -0.18 + i * 0.18, w);
      this.mesh.add(w);
      return w;
    };
    this.wingL = makeWing(-1);
    this.wingR = makeWing(1);
    scene.add(this.mesh);
    this.reset();
  }

  reset() {
    this.lane = Math.floor(LANE_COUNT / 2);
    this.x = laneX(this.lane);
    this.y = 6;
    this.z = 0;
    this.yaw = 0;
    this.roll = 0;
    this.vy = 0;
    this.flapT = 0;
    this.alive = true;
    this.syncMesh();
  }

  flap() {
    this.vy = FLAP_VELOCITY;
    this.flapT = 0.25;
  }

  moveLane(dir) {
    this.lane = Math.min(LANE_COUNT - 1, Math.max(0, this.lane + dir));
  }

  update(dt, time) {
    this.vy = Math.max(-MAX_FALL_SPEED, this.vy - GRAVITY * dt);
    this.y += this.vy * dt;
    if (this.y < GROUND_Y) { this.y = GROUND_Y; this.vy = Math.max(0, this.vy); }
    if (this.y > MAX_Y) { this.y = MAX_Y; this.vy = Math.min(0, this.vy); }
    if (this.laneMode) this.x += (laneX(this.lane) - this.x) * Math.min(1, LANE_SWITCH_SPEED * dt);
    this.flapT = Math.max(0, this.flapT - dt);
    const flapAmt = this.flapT > 0 ? Math.sin((1 - this.flapT / 0.25) * Math.PI) : 0;
    const idle = Math.sin(time * 14) * 0.15;
    const ang = flapAmt * 0.9 + idle;
    this.wingL.rotation.z = ang;
    this.wingR.rotation.z = -ang;
    this.syncMesh();
  }

  // Copies the simulation state onto the mesh (call again after moving x/z by hand).
  syncMesh() {
    const lean = this.laneMode ? (this.x - laneX(this.lane)) * 0.15 : 0;
    this.mesh.position.set(this.x, this.y, this.z);
    this.mesh.rotation.set(
      THREE.MathUtils.clamp(this.vy * 0.03, -0.5, 0.4),
      this.yaw,
      THREE.MathUtils.clamp(lean + this.roll, -0.8, 0.8),
    );
  }
}
