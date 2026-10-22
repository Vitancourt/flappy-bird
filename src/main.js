import './style.css';
import * as THREE from 'three';
import { BIRD_HALF } from './config.js';
import { Bird } from './bird.js';
import { Input, isTouchDevice } from './input.js';
import { UI } from './ui.js';
import { MODES } from './modes.js';
import { Cat } from './cat.js';
import { Person } from './grabbers.js';
import { ClassicMode } from './modes/classic.js';
import { CityMode } from './modes/city.js';
import { FOOD_POINTS } from './citygen.js';
import { quality, initQuality, lowerQuality } from './quality.js';
import { Atmosphere } from './atmosphere.js';

const canvas = document.getElementById('game');
initQuality(isTouchDevice());
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(quality.pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 650);
const atmosphere = new Atmosphere(scene, renderer);
const bird = new Bird(scene);
const cat = new Cat(scene);

// each mode builds its own world; only the active one is visible
const modes = {
  classic: new ClassicMode({ scene, camera, bird }),
  city: new CityMode({ scene, camera, bird }),
};
let mode = modes.classic;
modes.city.deactivate();
mode.activate();

let modeId = 'classic';
function setMode(id) {
  modeId = id;
  if (modes[id] === mode) return;
  mode.deactivate();
  mode = modes[id];
  mode.activate();
}

let baseFov = 65;
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  baseFov = camera.aspect < 1 ? 85 : 65; // wider view in portrait so everything fits
  camera.fov = baseFov;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);
quality.listeners.push(resize);
resize();

// --- tutorial: practise each command with the bird hovering over the live scene ---
const STEPS = {
  flap: { key: 'flap', title: 'Flap your wings', desktop: 'Press Space, \u2191 or W (or click)', touch: 'Tap the FLAP button (or anywhere)' },
  left: { key: 'left', title: 'Move left', desktop: 'Press \u2190 or A to switch to the left lane', touch: 'Tap \u25c0 to switch to the left lane' },
  right: { key: 'right', title: 'Move right', desktop: 'Press \u2192 or D to switch to the right lane', touch: 'Tap \u25b6 to switch to the right lane' },
  turn: { key: 'turn', title: 'Turn at a street', desktop: 'Press \u2190 (or \u2192) twice in a row: pressing again in the outer lane turns you 90\u00b0 over a street', touch: 'Tap \u25c0 (or \u25b6) twice in a row: pressing again in the outer lane turns you 90\u00b0 over a street' },
  pause: { key: 'pause', title: 'Pause any time', desktop: 'Press Esc or P', touch: 'Tap the pause button at the top right' },
};
const FINISH = {
  classic: 'Fly between the towers and hop over houses. The street is deadly (a cat waits!) and people at the windows have nets.',
  city: 'Dodge traffic, balloons and planes; stop for nothing but watch the windows for nets. Grab the gold bird food for +10.',
};
const tut = { steps: [], i: 0, at: 0, last: null };

function tutorialShow() {
  ui.setTutorial(tut.steps[tut.i], tut.i, tut.steps.length);
  tut.at = time;
  tut.last = null;
}

function startTutorial() {
  resetRun();
  state = 'tutorial';
  const done = { key: 'done', title: "You're ready!", desktop: `${FINISH[modeId]} Flap to start.`, touch: `${FINISH[modeId]} Tap FLAP to start.` };
  tut.steps = [STEPS.flap, STEPS.left, STEPS.right, ...(modeId === 'city' ? [STEPS.turn] : []), STEPS.pause, done];
  tut.i = 0;
  ui.show('tutorial');
  tutorialShow();
}

function tutorialInput(kind) {
  const step = tut.steps[tut.i];
  if (kind === 'flap') bird.flap();
  if (kind === 'left' || kind === 'right') {
    const d = kind === 'left' ? -1 : 1;
    bird.roll = d * 0.5;
    if (bird.laneMode) bird.moveLane(d);
  }
  if (step.key === 'done') {
    if (kind === 'flap' && time - tut.at > 0.4) { ready(); begin(); }
    return;
  }
  let ok = kind === step.key;
  if (step.key === 'turn' && (kind === 'left' || kind === 'right')) {
    ok = !!tut.last && tut.last.kind === kind && time - tut.last.t < 1.5;
    tut.last = { kind, t: time };
  }
  if (!ok) return;
  tut.i++;
  tutorialShow();
}

// --- state ---
// menu | offer | skipask | tutorial | ready | playing | paused | resuming | caught (cat animation) | gameover
let state = 'menu';
let score = 0;
let time = 0;
let deadAt = 0;
let shake = 0;
let resumeLeft = 0;
let catcher = cat; // who has the bird while in the 'caught' state: the cat or a person with a net
const RESUME_SECONDS = 1.8;

function resetRun() {
  cat.reset();
  scene.add(bird.mesh); // take the bird back from the cat's mouth or a net
  bird.mesh.scale.setScalar(1);
  bird.reset();
  mode.reset();
  score = 0;
  ui.setScore(0);
}

// Opens a run on the "get ready" screen; the first flap starts it.
function ready() {
  resetRun();
  state = 'ready';
  ui.show('ready');
}

function begin() {
  state = 'playing';
  ui.show('none');
  bird.flap();
}

function toMenu() {
  resetRun();
  state = 'menu';
  ui.show('menu');
}

function gameOver(reason) {
  state = 'gameover';
  deadAt = time;
  shake = reason ? 0 : 0.6;
  ui.showGameOver(score, ui.finish(score), reason);
}

// Hitting the street is fatal: a cat runs in and carries the bird away.
function caught() {
  state = 'caught';
  shake = 0.3;
  catcher = cat;
  cat.start(bird, mode.catPlace());
  ui.show('caught');
}

// A person leaning out of a window has netted the bird.
function netted(person) {
  state = 'caught';
  shake = 0.3;
  catcher = person;
  person.grab(bird);
  ui.show('caught');
}

function pause() {
  if (state === 'tutorial') { tutorialInput('pause'); return; }
  if (state !== 'playing') return;
  state = 'paused';
  ui.show('pause');
}

function resume() {
  if (state !== 'paused') return;
  state = 'resuming';
  resumeLeft = RESUME_SECONDS;
  ui.show('countdown');
}

function onFlap() {
  if (state === 'tutorial') { tutorialInput('flap'); return; }
  if (state === 'playing') bird.flap();
  else if (state === 'ready') begin();
  else if (state === 'menu') ready(); // Space/Enter plays the mode shown behind the menu
  else if (state === 'gameover' && time - deadAt > 0.5) { ready(); begin(); }
}
const onTurn = (d) => () => {
  if (state === 'playing') mode.steer(d);
  else if (state === 'tutorial') tutorialInput(d < 0 ? 'left' : 'right');
};
const onPause = () => {
  if (state === 'playing' || state === 'tutorial') pause();
  else if (state === 'paused') resume();
};

new Input({ onFlap, onLeft: onTurn(-1), onRight: onTurn(1), onPause });
const ui = new UI(MODES, {
  play: (id) => {
    setMode(id); ui.setMode(id);
    if (ui.tutorialHidden(id)) { ready(); return; }
    resetRun();
    ui.setTutorialMode(MODES.find((m) => m.id === id).name);
    state = 'offer'; // ask whether to learn this game's controls first
    ui.show('offer');
  },
  tutorial: startTutorial,
  howto: (id) => { setMode(id); ui.setMode(id); startTutorial(); },
  skipTutorial: () => { state = 'skipask'; ui.show('skipask'); },
  skipNever: () => { ui.setTutorialHidden(modeId, true); ready(); },
  skipOnce: ready,
  tutorialSkip: ready,
  pause,
  resume,
  restart: () => { ready(); begin(); },
  menu: toMenu,
});
ui.setMode('classic');
ui.show('menu');

document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'playing') pause(); });

// --- fixed-timestep simulation ---
const STEP = 1 / 120;
function step(dt) {
  time += dt;
  if (state === 'playing') {
    const r = mode.step(dt, time);
    if (r.points) { score += r.points; ui.setScore(score); }
    if (r.ate) ui.popup(`+${r.ate * FOOD_POINTS}`);
    if (r.crashed) gameOver();
    else if (r.grabbed) netted(r.grabbed);
    else if (bird.y <= BIRD_HALF + 1e-3) caught();
  } else if (state === 'caught') {
    catcher.update(dt);
    if (catcher.done) gameOver(catcher === cat ? 'cat' : 'person');
  } else if (state === 'tutorial') {
    mode.idle(dt, true);
    bird.roll *= Math.exp(-6 * dt);
    bird.update(dt, time);
    bird.y = 6 + Math.sin(time * 3) * 0.4; bird.vy = 0;
    bird.syncMesh();
  } else if (state === 'paused') {
    // frozen
  } else if (state === 'resuming') {
    resumeLeft -= dt;
    ui.setCountdown(Math.max(1, Math.ceil(resumeLeft / (RESUME_SECONDS / 3))));
    if (resumeLeft <= 0) { state = 'playing'; ui.show('none'); }
  } else {
    // menu / ready / gameover: the scene idles, the bird hovers (or falls after a crash)
    mode.idle(dt, state !== 'gameover');
    if (state !== 'gameover') { bird.y = 6 + Math.sin(time * 3) * 0.4; bird.vy = 0; }
    bird.update(state === 'gameover' ? dt : 0.0001, time);
  }
}

// --- frame rate counter (top right) and automatic quality step-down ---
const fpsEl = document.getElementById('fps');
let fpsFrames = 0, fpsTime = 0, lowFor = 0, cooldown = 0;
function trackFps(dt) {
  fpsFrames++;
  fpsTime += dt;
  cooldown = Math.max(0, cooldown - dt);
  if (fpsTime < 0.5) return;
  const fps = Math.round(fpsFrames / fpsTime);
  fpsFrames = 0; fpsTime = 0;
  fpsEl.textContent = `${fps} FPS \u00b7 ${quality.name}`;
  fpsEl.dataset.level = fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'bad';
  // a few seconds of low frame rate while playing: drop to the next quality tier
  if (state === 'playing' && fps < 38 && !cooldown) lowFor += 0.5; else lowFor = 0;
  if (lowFor >= 3 && lowerQuality()) { lowFor = 0; cooldown = 5; }
}

let last = performance.now();
let acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= STEP) { step(STEP); acc -= STEP; }
  mode.frame(dt);
  mode.updateCamera(camera, dt, shake);
  shake = Math.max(0, shake - dt * 2);
  // a touch more field of view as the bird speeds up
  camera.fov += (baseFov + 9 * mode.speedRatio() - camera.fov) * Math.min(1, 3 * dt);
  camera.updateProjectionMatrix();
  atmosphere.update(camera, bird, dt);
  renderer.render(scene, camera);
  trackFps(dt);
}
requestAnimationFrame(frame);

// ?debug exposes the internals to the console / test scripts
if (new URLSearchParams(window.location.search).has('debug')) {
  window.__game = { renderer, scene, camera, bird, atmosphere, quality, Person, get mode() { return mode; } };
}
