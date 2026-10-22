const SCREENS = ['menu', 'offer', 'skipask', 'tutorial', 'ready', 'countdown', 'pause', 'gameover', 'caught'];

// best score is kept per mode
function loadBest(mode) {
  try { return Number(localStorage.getItem(`flappy-canyon-best-${mode}`)) || 0; } catch { return 0; }
}
function saveBest(mode, v) {
  try { localStorage.setItem(`flappy-canyon-best-${mode}`, String(v)); } catch { /* storage unavailable */ }
}

const TUTORIAL_KEY = 'flappy-canyon-skip-tutorial';

export class UI {
  // handlers: { play(modeId), pause(), resume(), restart(), menu() }
  constructor(modes, handlers) {
    this.scoreEl = document.getElementById('score');
    this.bestEl = document.getElementById('best');
    this.modes = modes;
    this.bests = Object.fromEntries(modes.map((m) => [m.id, loadBest(m.id)]));
    this.mode = modes[0].id;
    this.best = this.bests[this.mode];
    this.setScore(0);

    const list = document.getElementById('mode-list');
    for (const m of modes) {
      const b = document.createElement('button');
      b.className = 'menu-btn primary';
      b.dataset.action = 'play';
      b.dataset.mode = m.id;
      b.innerHTML = `${m.name}<small>${m.description}</small>`;
      const how = document.createElement('button');
      how.className = 'menu-btn link-btn';
      how.dataset.action = 'howto';
      how.dataset.mode = m.id;
      how.textContent = `How to play ${m.name}`;
      list.append(b, how);
    }

    document.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      el.blur(); // keep Space/Enter from re-triggering the button
      const a = el.dataset.action;
      handlers[a]?.(el.dataset.mode);
    });
  }

  // each game type has its own tutorial, so hiding one leaves the others
  tutorialHidden(mode) {
    try { return localStorage.getItem(`${TUTORIAL_KEY}-${mode}`) === '1'; } catch { return false; }
  }

  setTutorialHidden(mode, v) {
    try { localStorage.setItem(`${TUTORIAL_KEY}-${mode}`, v ? '1' : '0'); } catch { /* storage unavailable */ }
  }

  // the offer / skip screens name the game type
  setTutorialMode(name) {
    document.getElementById('offer-title').textContent = `New to ${name}?`;
    document.getElementById('skip-title').textContent = `Skip the ${name} tutorial?`;
  }

  setTutorial(step, i, n) {
    document.getElementById('tut-count').textContent = `Tutorial ${i + 1} / ${n}`;
    const title = document.getElementById('tut-title');
    title.textContent = step.title;
    title.style.animation = 'none'; void title.offsetWidth; title.style.animation = ''; // replay the pop-in
    document.getElementById('tut-desktop').textContent = step.desktop;
    document.getElementById('tut-touch').textContent = step.touch;
  }

  setScore(s) {
    this.scoreEl.textContent = s;
    this.bestEl.textContent = `Best ${this.best}`;
  }

  // returns true if it's a new best
  finish(score) {
    const isBest = score > this.best;
    if (isBest) { this.best = score; this.bests[this.mode] = score; saveBest(this.mode, score); }
    this.setScore(score);
    return isBest;
  }

  // name: one of SCREENS, or 'none' while playing
  show(name) {
    document.body.dataset.screen = name;
    for (const s of SCREENS) {
      document.getElementById(`screen-${s}`).classList.toggle('show', s === name);
    }
    if (name === 'menu') {
      document.getElementById('menu-best').textContent = this.modes
        .filter((m) => this.bests[m.id])
        .map((m) => `${m.name}: ${this.bests[m.id]}`)
        .join('  ·  ');
    }
  }

  // reason: 'cat', 'person' or nothing for a plain crash
  showGameOver(score, isBest, reason) {
    const titles = { cat: 'The cat got it!', person: 'Snatched from a window!' };
    document.getElementById('go-title').textContent = isBest ? 'New best!' : titles[reason] || 'Crashed';
    document.getElementById('go-score').textContent = `Score ${score}`;
    this.show('gameover');
  }

  // the mode being played: picks which best score and which hints are shown
  setMode(id) {
    this.mode = id;
    this.best = this.bests[id];
    document.body.dataset.mode = id;
    this.setScore(0);
  }

  // floating "+10" text near the score
  popup(text) {
    const el = document.createElement('div');
    el.className = 'popup';
    el.textContent = text;
    el.addEventListener('animationend', () => el.remove());
    document.body.appendChild(el);
  }

  setCountdown(n) {
    document.getElementById('countdown-num').textContent = n;
  }
}
