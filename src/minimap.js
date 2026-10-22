import {
  PITCH, LOT, lotRect, TOWER_H, HOUSE_H,
} from './citygen.js';

const RANGE = 170; // world units from the map centre to its edge
const BIRD_ROW = 0.62; // bird sits below centre so more of the road ahead is visible
const COLORS = { house: '#d6e9a8', mid: '#9db3d6', tower: '#4f5b9a' };

// Heading-up mini-map of the streets around the bird: lot colour shows how tall it is
// (light = low house you can fly over, dark = tower), gold dots are bird food.
export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.t = 0;
  }

  _fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(this.canvas.clientWidth * dpr);
    if (!w) return false;
    if (this.canvas.width !== w) { this.canvas.width = w; this.canvas.height = w; }
    return true;
  }

  // things: { food: {x,z}|null, planes: [{x,z,axis,dir}] }
  draw(bird, things, dt = 0) {
    if (!this._fit()) return; // hidden
    this.t += dt;
    const g = this.g, W = this.canvas.width;
    const s = W / 2 / RANGE;
    const cx = W / 2, cy = W * BIRD_ROW;

    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath();
    g.roundRect(0, 0, W, W, W * 0.1);
    g.clip();
    g.fillStyle = '#2f3340';
    g.fillRect(0, 0, W, W);

    g.translate(cx, cy);
    g.rotate(bird.yaw);
    g.scale(s, s);
    g.translate(-bird.x, -bird.z);

    const reach = RANGE * 1.6;
    const bi0 = Math.floor((bird.x - reach) / PITCH), bi1 = Math.floor((bird.x + reach) / PITCH);
    const bj0 = Math.floor((bird.z - reach) / PITCH), bj1 = Math.floor((bird.z + reach) / PITCH);
    for (let bi = bi0; bi <= bi1; bi++) {
      for (let bj = bj0; bj <= bj1; bj++) {
        for (let k = 0; k < 4; k++) {
          const r = lotRect(bi, bj, k);
          g.fillStyle = r.h >= TOWER_H ? COLORS.tower : r.h > HOUSE_H ? COLORS.mid : COLORS.house;
          g.fillRect(r.minX, r.minZ, LOT, LOT);
        }
      }
    }
    // incoming planes: red arrows pointing the way they fly
    for (const p of things.planes) {
      g.save();
      g.translate(p.x, p.z);
      g.rotate(p.axis === 'x' ? (p.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (p.dir > 0 ? Math.PI : 0));
      const u = 7 / s;
      g.beginPath();
      g.moveTo(0, -u); g.lineTo(u * 0.7, u * 0.8); g.lineTo(0, u * 0.35); g.lineTo(-u * 0.7, u * 0.8);
      g.closePath();
      g.fillStyle = '#ff4a3d';
      g.fill();
      g.lineWidth = 1.2 / s;
      g.strokeStyle = '#fff';
      g.stroke();
      g.restore();
    }
    g.restore();

    // the single bird food, pinned to the edge of the map when it is off screen
    const f = things.food;
    if (f) {
      const dx = f.x - bird.x, dz = f.z - bird.z;
      const sin = Math.sin(bird.yaw), cos = Math.cos(bird.yaw);
      let px = cx + (dx * cos - dz * sin) * s;
      let py = cy + (dx * sin + dz * cos) * s;
      const m = W * 0.08;
      const off = px < m || px > W - m || py < m || py > W - m;
      px = Math.min(W - m, Math.max(m, px));
      py = Math.min(W - m, Math.max(m, py));
      const pulse = 1 + Math.sin(this.t * 6) * 0.2;
      g.beginPath();
      g.arc(px, py, W * 0.045 * pulse, 0, Math.PI * 2);
      g.fillStyle = off ? 'rgba(255, 210, 63, .55)' : '#ffd23f';
      g.fill();
      g.lineWidth = W * 0.015;
      g.strokeStyle = '#7a4b00';
      g.stroke();
    }

    // the bird: always pointing up
    g.save();
    g.translate(cx, cy);
    g.beginPath();
    g.moveTo(0, -W * 0.065);
    g.lineTo(W * 0.045, W * 0.045);
    g.lineTo(0, W * 0.02);
    g.lineTo(-W * 0.045, W * 0.045);
    g.closePath();
    g.fillStyle = '#fff';
    g.fill();
    g.lineWidth = W * 0.012;
    g.strokeStyle = '#e07b00';
    g.stroke();
    g.restore();
  }
}
