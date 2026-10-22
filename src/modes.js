// Game modes shown on the main menu. A mode needs an entry here plus a class in src/modes/
// that main.js constructs (see ClassicMode for the interface).
export const MODES = [
  { id: 'classic', name: 'Classic Flappy', description: 'Fly between the towers. Flap, switch lanes, dodge.' },
  { id: 'city', name: 'City Flight', description: 'Traffic, balloons, planes and turns through the city. Grab the bird food for +10.' },
];
