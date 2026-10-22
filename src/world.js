import * as THREE from 'three';
import { LANE_COUNT, LANE_WIDTH, ROAD_HALF, SPAWN_DISTANCE, DESPAWN_Z } from './config.js';
import {
  facadeMaterial, asphaltMaterial, concreteMaterial, markingMaterials, Batch, propMaterial,
} from './materials.js';

const SIDE_SPACING = 16;
const SIDE_COLORS = [0x7b8fd1, 0xd18fb3, 0x8fd1b8, 0xd1c08f, 0x9a8fd1, 0xd1998f];
const DASH_SPACING = 8;
const CURB = 0.16;

// The classic canyon: asphalt road, sidewalks, street trees and lamps, and a wall of towers
// on each side, all scrolling toward the bird. Lights, sky and fog live in Atmosphere.
export class World {
  // scene: kept for symmetry with the other modes. root: parent of the meshes, so a mode can hide them.
  constructor(scene, root = scene) {
    const shadowed = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), concreteMaterial(600, 600, 6));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.02, -200);
    root.add(shadowed(ground, false));
    this.surfaces = [[ground.material, 6]]; // [material, texture tile length]: their textures scroll with the world

    const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_HALF * 2, 600), asphaltMaterial(ROAD_HALF * 2, 600));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0, -200);
    root.add(shadowed(road, false));
    this.surfaces.push([road.material, 16]);

    // raised sidewalks along both edges
    for (const s of [-1, 1]) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(4, CURB, 600), concreteMaterial(4, 600));
      walk.position.set(s * (ROAD_HALF + 2), CURB / 2, -200);
      root.add(shadowed(walk, false));
      if (s === -1) this.surfaces.push([walk.material, 4]);
    }

    // lane dashes
    this.dashes = [];
    const dashGeo = new THREE.BoxGeometry(0.2, 0.03, 3);
    const dashMat = markingMaterials().dash.clone();
    dashMat.map = null;
    dashMat.color.set(0xf0f0ea);
    const count = Math.ceil((SPAWN_DISTANCE + 40) / DASH_SPACING);
    for (let l = 1; l < LANE_COUNT; l++) {
      const x = (l - LANE_COUNT / 2) * LANE_WIDTH;
      for (let i = 0; i < count; i++) {
        const d = new THREE.Mesh(dashGeo, dashMat);
        d.position.set(x, 0.03, DESPAWN_Z - i * DASH_SPACING);
        root.add(d);
        this.dashes.push(d);
      }
    }
    this.dashSpan = count * DASH_SPACING;

    // street trees and lamp posts: one merged strip, repeated down the road
    const strip = new Batch();
    for (const s of [-1, 1]) {
      const treeX = s * (ROAD_HALF + 2.5);
      strip.cyl(0x5a4330, 0.2, 2.4, treeX, CURB + 1.2, 4);
      strip.sphere(0x3f7a3a, 1.2, 1.4, 1.2, treeX, CURB + 3.4, 4);
      strip.sphere(0x55933f, 0.9, 1.0, 0.9, treeX + s * 0.25, CURB + 4.0, 4.4);
      const lampX = s * (ROAD_HALF + 0.9);
      strip.cyl(0x3a3d45, 0.09, 6.5, lampX, CURB + 3.25, -4);
      strip.box(0x3a3d45, 1.2, 0.08, 0.08, lampX - s * 0.6, CURB + 6.5, -4);
      strip.box(0xfff0c8, 0.5, 0.14, 0.3, lampX - s * 1.2, CURB + 6.45, -4);
    }
    const stripGeo = strip.build();
    this.props = [];
    const stripSpacing = 16;
    const stripCount = Math.ceil((SPAWN_DISTANCE + 60) / stripSpacing);
    for (let i = 0; i < stripCount; i++) {
      const m = shadowed(new THREE.Mesh(stripGeo, propMaterial()));
      m.position.z = DESPAWN_Z - i * stripSpacing;
      root.add(m);
      this.props.push(m);
    }
    this.propSpan = stripCount * stripSpacing;

    // side buildings
    this.side = [];
    const n = Math.ceil((SPAWN_DISTANCE + 60) / SIDE_SPACING);
    this.sideSpan = n * SIDE_SPACING;
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const w = 6 + Math.random() * 5;
        const h = 30 + Math.random() * 60;
        const d = SIDE_SPACING - 2;
        const color = SIDE_COLORS[Math.floor(Math.random() * SIDE_COLORS.length)];
        const b = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), facadeMaterial(color, w, h)));
        b.position.set(s * (ROAD_HALF + 4 + w / 2 + Math.random() * 1.5), h / 2, 20 - i * SIDE_SPACING);
        root.add(b);
        this.side.push(b);
      }
    }
  }

  update(dt, speed) {
    const dz = speed * dt;
    // the road surface must slide along with the markings, trees and buildings
    for (const [mat, tile] of this.surfaces) {
      for (const t of [mat.map, mat.bumpMap]) if (t) t.offset.y = (t.offset.y + dz / tile) % 1;
    }
    for (const d of this.dashes) {
      d.position.z += dz;
      if (d.position.z > DESPAWN_Z) d.position.z -= this.dashSpan;
    }
    for (const p of this.props) {
      p.position.z += dz;
      if (p.position.z > DESPAWN_Z + 16) p.position.z -= this.propSpan;
      p.visible = p.position.z < -3; // nothing beside or behind the bird, where trees would fill the screen
    }
    for (const b of this.side) {
      b.position.z += dz;
      if (b.position.z > 30) b.position.z -= this.sideSpan;
    }
  }
}
