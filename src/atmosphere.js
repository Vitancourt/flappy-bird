import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { quality } from './quality.js';

// Sun, sky, sky-lit reflections, clouds and fog, shared by both modes.
// The sun sits behind and to the west of the bird's starting direction, so the faces you look
// at are lit and the buildings throw long shadows down the street ahead.
const SUN_ELEVATION = 58; // degrees above the horizon
const SUN_AZIMUTH = -25;
const FOG_COLOR = 0xb9d0e6;

export class Atmosphere {
  constructor(scene, renderer) {
    this.scene = scene;
    const phi = THREE.MathUtils.degToRad(90 - SUN_ELEVATION);
    const theta = THREE.MathUtils.degToRad(SUN_AZIMUTH);
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);

    this.sky = new Sky();
    this.sky.scale.setScalar(450);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 3.2;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(this.sunDir);

    // light the PBR materials from the sky itself, so glass reflects it
    const envScene = new THREE.Scene();
    envScene.add(this.sky);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene).texture;
    scene.environmentIntensity = 0.38;
    pmrem.dispose();
    scene.add(this.sky);

    scene.fog = new THREE.Fog(FOG_COLOR, 40, 160);

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6a6f55, 0.25);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 4.0);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -80;
    cam.right = cam.top = 80;
    cam.near = 1;
    cam.far = 420;
    this.sun.shadow.bias = -0.0003;
    this.sun.shadow.normalBias = 0.06;
    scene.add(this.sun, this.sun.target);

    this._clouds();
    this.applyQuality();
    quality.listeners.push(() => this.applyQuality());
  }

  _clouds() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    this.clouds = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const m = new THREE.SpriteMaterial({ map, fog: false, transparent: true, depthWrite: false, opacity: 0.5 + Math.random() * 0.35 });
      const s = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2;
      const r = 260 + Math.random() * 90;
      s.position.set(Math.cos(a) * r, 70 + Math.random() * 110, Math.sin(a) * r);
      const w = 90 + Math.random() * 120;
      s.scale.set(w, w * 0.38, 1);
      this.clouds.add(s);
    }
    this.scene.add(this.clouds);
  }

  applyQuality() {
    const on = quality.shadowSize > 0;
    this.sun.castShadow = on;
    if (on && this.sun.shadow.mapSize.x !== quality.shadowSize) {
      this.sun.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  // keep sky/clouds around the camera and the shadow window around the action
  update(camera, focus, dt) {
    this.sky.position.copy(camera.position);
    this.clouds.position.copy(camera.position);
    this.clouds.rotation.y += dt * 0.004;
    // snap the shadow window to whole texels so shadows do not shimmer while flying
    const texel = 160 / Math.max(1, quality.shadowSize || 1024);
    const sx = Math.round(focus.x / texel) * texel;
    const sy = Math.round(focus.y / texel) * texel;
    const sz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(sx, sy, sz);
    this.sun.position.set(sx + this.sunDir.x * 170, sy + this.sunDir.y * 170, sz + this.sunDir.z * 170);
  }
}
