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

    // Tapping the open screen also flaps on touch (and starts/restarts the game)
    document.getElementById('game').addEventListener('pointerdown', (e) => {
      if (this.touch) { e.preventDefault(); onFlap(); }
    });
    // desktop mouse click also flaps, for convenience
    document.getElementById('game').addEventListener('mousedown', () => {
      if (!this.touch) onFlap();
    });
  }
}
