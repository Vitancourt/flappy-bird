import * as THREE from 'three';
import {
  LANE_COUNT, LANE_WIDTH, HOUSE_HEIGHT, TOWER_HEIGHT, CELL_WIDTH, ROW_DEPTH,
  ROW_SPACING, SPAWN_DISTANCE, DESPAWN_Z, FIRST_ROW_Z,
  TOWER_CHANCE, HOUSE_CHANCE, SAFE_HOUSE_CHANCE,
} from './config.js';
import { facadeMaterial, roofMaterial } from './materials.js';

export const CELL = { OPEN: 0, HOUSE: 1, TOWER: 2 };

export function laneX(i, n = LANE_COUNT) {
  return (i - (n - 1) / 2) * LANE_WIDTH;
}

// Row generator. Keeps a "safe lane" that is never a tower and moves at most one
// lane per row, so a passable path always exists and is reachable.
export function createRowGenerator(rng = Math.random, laneCount = LANE_COUNT) {
  let safe = Math.floor(laneCount / 2);
  return function nextRow() {
    safe = Math.min(laneCount - 1, Math.max(0, safe + Math.floor(rng() * 3) - 1));
    const cells = [];
    for (let i = 0; i < laneCount; i++) {
      if (i === safe) {
        cells.push(rng() < SAFE_HOUSE_CHANCE ? CELL.HOUSE : CELL.OPEN);
      } else {
        const r = rng();
        cells.push(r < TOWER_CHANCE ? CELL.TOWER : r < TOWER_CHANCE + HOUSE_CHANCE ? CELL.HOUSE : CELL.OPEN);
      }
    }
    return cells;
  };
}

export function cellBox(type, lane, z, laneCount = LANE_COUNT) {
  const x = laneX(lane, laneCount);
  const h = type === CELL.TOWER ? TOWER_HEIGHT : HOUSE_HEIGHT;
  return {
    minX: x - CELL_WIDTH / 2, maxX: x + CELL_WIDTH / 2,
    minY: 0, maxY: h,
    minZ: z - ROW_DEPTH / 2, maxZ: z + ROW_DEPTH / 2,
  };
}

const TOWER_COLORS = [0xe0566b, 0x6c63e0, 0x2fb5a8, 0xf08a3c];
const HOUSE_COLORS = [0xf2d16b, 0xf4a6c0, 0x8fd16b, 0xf6f0e0];
const ROOF_COLORS = [0xa5503a, 0x5b6068, 0x7a5238];

export class Obstacles {
  constructor(scene, rng = Math.random) {
    this.scene = scene;
    this.rng = rng;
    this.rows = [];
    this.pool = { [CELL.HOUSE]: [], [CELL.TOWER]: [] };
    this.reset();
  }

  reset() {
    for (const row of this.rows) this._releaseRow(row);
    this.rows = [];
    this.nextRow = createRowGenerator(this.rng);
    this._spawn(FIRST_ROW_Z);
    this._topUp();
  }

  _makeMesh(type) {
    const rng = this.rng;
    const g = new THREE.Group();
    const part = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      return m;
    };
    if (type === CELL.TOWER) {
      const color = TOWER_COLORS[Math.floor(rng() * TOWER_COLORS.length)];
      part(new THREE.BoxGeometry(CELL_WIDTH, TOWER_HEIGHT, ROW_DEPTH), facadeMaterial(color, CELL_WIDTH, TOWER_HEIGHT), 0, TOWER_HEIGHT / 2, 0);
      part(new THREE.BoxGeometry(CELL_WIDTH + 0.3, 0.6, ROW_DEPTH + 0.3), roofMaterial(0x4a4f5c), 0, TOWER_HEIGHT + 0.3, 0);
      part(new THREE.CylinderGeometry(0.08, 0.14, 7, 6), roofMaterial(0x9aa0a8), 0, TOWER_HEIGHT + 4, 0);
    } else {
      const color = HOUSE_COLORS[Math.floor(rng() * HOUSE_COLORS.length)];
      part(new THREE.BoxGeometry(CELL_WIDTH, HOUSE_HEIGHT, ROW_DEPTH), facadeMaterial(color, CELL_WIDTH, HOUSE_HEIGHT), 0, HOUSE_HEIGHT / 2, 0);
      // gable roof: a triangular prism running along the street
      const shape = new THREE.Shape();
      shape.moveTo(-CELL_WIDTH / 2 - 0.2, 0);
      shape.lineTo(CELL_WIDTH / 2 + 0.2, 0);
      shape.lineTo(0, 1.6);
      const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: ROW_DEPTH + 0.4, bevelEnabled: false });
      roofGeo.translate(0, 0, -(ROW_DEPTH + 0.4) / 2);
      part(roofGeo, roofMaterial(ROOF_COLORS[Math.floor(rng() * ROOF_COLORS.length)]), 0, HOUSE_HEIGHT, 0);
    }
    return g;
  }

  _acquire(type) {
    const mesh = this.pool[type].pop() || this._makeMesh(type);
    mesh.visible = true;
    if (!mesh.parent) this.scene.add(mesh);
    return mesh;
  }

  _releaseRow(row) {
    for (const c of row.cells) {
      if (c.mesh) {
        c.mesh.visible = false;
        this.pool[c.type].push(c.mesh);
        c.mesh = null;
      }
    }
  }

  _spawn(z) {
    const cells = this.nextRow().map((type, lane) => {
      let mesh = null;
      if (type !== CELL.OPEN) {
        mesh = this._acquire(type);
        mesh.position.set(laneX(lane), 0, z);
      }
      return { type, lane, mesh };
    });
    this.rows.push({ z, cells, passed: false });
  }

  // Moves everything toward the player; returns how many rows were newly passed.
  update(dt, speed, birdZ = 0) {
    const dz = speed * dt;
    let passed = 0;
    for (const row of this.rows) {
      row.z += dz;
      for (const c of row.cells) if (c.mesh) c.mesh.position.z = row.z;
      if (!row.passed && row.z - ROW_DEPTH / 2 > birdZ + 0.5) {
        row.passed = true;
        passed++;
      }
    }
    while (this.rows.length && this.rows[0].z > DESPAWN_Z) {
      this._releaseRow(this.rows.shift());
    }
    this._topUp();
    return passed;
  }

  _topUp() {
    let farthest = Math.min(...this.rows.map((r) => r.z));
    while (farthest - ROW_SPACING >= -SPAWN_DISTANCE - ROW_SPACING) {
      farthest -= ROW_SPACING;
      this._spawn(farthest);
    }
  }

  // Boxes of solid cells near the bird, for collision.
  *solidBoxes(zMin, zMax) {
    for (const row of this.rows) {
      if (row.z + ROW_DEPTH / 2 < zMin || row.z - ROW_DEPTH / 2 > zMax) continue;
      for (const c of row.cells) {
        if (c.type !== CELL.OPEN) yield cellBox(c.type, c.lane, row.z);
      }
    }
  }
}
