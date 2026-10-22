// Keyboard on desktop; on-screen buttons on touch devices.
export function isTouchDevice() {
  return (
    window.matchMedia?.('(pointer: coarse)').matches ||
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
}

export class Input {
  constructor({ onFlap, onLeft, onRight, onPause }) {
    this.touch = false;

    const enableTouch = () => {
      if (this.touch) return;
      this.touch = true;
      document.body.classList.add('touch');
    };
    if (isTouchDevice()) enableTouch();
    // a hybrid device may only reveal touch on first touch
    window.addEventListener('touchstart', enableTouch, { once: true, passive: true });

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      switch (e.code) {
        case 'Space': case 'ArrowUp': case 'KeyW': case 'Enter':
          e.preventDefault(); onFlap(); break;
        case 'Escape': case 'KeyP': e.preventDefault(); onPause(); break;
        case 'ArrowLeft': case 'KeyA': e.preventDefault(); onLeft(); break;
        case 'ArrowRight': case 'KeyD': e.preventDefault(); onRight(); break;
      }
    });

    const bind = (id, fn) => {
      const el = document.getElementById(id);
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.classList.add('down');
        fn();
      });
      const up = () => el.classList.remove('down');
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    };
    bind('btn-left', onLeft);
    bind('btn-right', onRight);
    bind('btn-flap', onFlap);

    // On touch, a tap on the open screen flaps and a horizontal swipe moves (one lane / turn per swipe).
    const SWIPE = 36; // px of sideways travel that counts as a swipe
    const canvas = document.getElementById('game');
    let drag = null;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.touch) return;
      e.preventDefault();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, swiped: false };
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id || drag.swiped) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) >= SWIPE && Math.abs(dx) > Math.abs(dy)) {
        drag.swiped = true; // acts as soon as the finger has travelled far enough
        (dx < 0 ? onLeft : onRight)();
      }
    });
    canvas.addEventListener('pointerup', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const wasSwipe = drag.swiped;
      drag = null;
      e.preventDefault();
      if (!wasSwipe) onFlap();
    });
    canvas.addEventListener('pointercancel', () => { drag = null; });
    // desktop mouse click also flaps, for convenience
    document.getElementById('game').addEventListener('mousedown', () => {
      if (!this.touch) onFlap();
    });
  }
}
