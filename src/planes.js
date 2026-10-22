import * as THREE from 'three';

// Small propeller planes that cross the bird's path along the side streets.
const SPAN = 9, BODY = 6;

let shared;
function res() {
  if (shared) return shared;
  const lam = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.4, metalness: 0.45 });
  shared = {
    unit: new THREE.BoxGeometry(1, 1, 1),
    white: lam(0xf4f4f4),
    red: lam(0xd9423a),
    glass: lam(0x2a3140),
    dark: lam(0x222222),
  };
  return shared;
}

function planeMesh() {
  const sh = res();
  const g = new THREE.Group(); // nose points to local +x
  const part = (mat, sx, sy, sz, x, y, z) => {
    const m = new THREE.Mesh(sh.unit, mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  part(sh.white, BODY, 1.1, 1.1, 0, 0, 0);
  part(sh.glass, 1.4, 0.5, 0.9, 0.9, 0.7, 0);
  part(sh.red, 1.6, 0.2, SPAN, 0.3, 0.1, 0);
  part(sh.red, 1.0, 0.15, 3, -2.6, 0.1, 0);
  part(sh.red, 1.0, 1.4, 0.15, -2.6, 0.9, 0);
  const prop = part(sh.dark, 0.1, 2.4, 0.25, BODY / 2 + 0.1, 0, 0);
  g.userData.prop = prop;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Planes {
  constructor(root) {
    this.root = root;
    this.list = [];
  }

  // axis: 'x' or 'z' is the travel axis, dir +1/-1 the way along it, left: distance to fly before vanishing
  spawn({ x, y, z, axis, dir, speed, left }) {
    const mesh = planeMesh();
    // nose is local +x; yaw it to the travel direction
    mesh.rotation.y = axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? -Math.PI / 2 : Math.PI / 2);
    mesh.position.set(x, y, z);
    this.root.add(mesh);
    this.list.push({ mesh, x, y, z, axis, dir, speed, left });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      const d = p.speed * dt;
      if (p.axis === 'x') p.x += p.dir * d; else p.z += p.dir * d;
      p.left -= d;
      p.mesh.position.set(p.x, p.y, p.z);
      p.mesh.userData.prop.rotation.x += dt * 60;
      if (p.left <= 0) { this.root.remove(p.mesh); this.list.splice(i, 1); }
    }
  }

  // two boxes per plane: the fuselage and the wings
  *boxes() {
    for (const p of this.list) {
      const along = p.axis === 'x';
      const [bx, bz] = along ? [BODY / 2, 0.55] : [0.55, BODY / 2];
      const [wx, wz] = along ? [0.8, SPAN / 2] : [SPAN / 2, 0.8];
      yield { minX: p.x - bx, maxX: p.x + bx, minY: p.y - 0.55, maxY: p.y + 0.55, minZ: p.z - bz, maxZ: p.z + bz };
      yield { minX: p.x - wx, maxX: p.x + wx, minY: p.y - 0.1, maxY: p.y + 0.3, minZ: p.z - wz, maxZ: p.z + wz };
    }
  }

  reset() {
    for (const p of this.list) this.root.remove(p.mesh);
    this.list = [];
  }
}
