// Everything tunable lives here.
export const LANE_COUNT = 3; // change this single number to widen the street
export const LANE_WIDTH = 4;
export const LANE_SWITCH_SPEED = 14; // lerp rate toward target lane

export const GRAVITY = 26;
export const FLAP_VELOCITY = 11;
export const MAX_FALL_SPEED = 30;
export const BIRD_HALF = 0.45; // half extent of the bird's collision box
export const MAX_Y = 40;

export const START_SPEED = 14;
export const MAX_SPEED = 38;
export const SPEED_RAMP = 0.3; // units/s gained per second

export const FLOOR_HEIGHT = 3;
export const HOUSE_HEIGHT = FLOOR_HEIGHT; // 1 floor
export const TOWER_HEIGHT = FLOOR_HEIGHT * 20; // 20 floors
export const CELL_WIDTH = LANE_WIDTH - 0.6;
export const ROW_DEPTH = 6;
export const ROW_SPACING = 30;
export const SPAWN_DISTANCE = 190;
export const DESPAWN_Z = 14;
export const FIRST_ROW_Z = -70; // grace distance before the first row

export const TOWER_CHANCE = 0.55;
export const HOUSE_CHANCE = 0.2;
export const SAFE_HOUSE_CHANCE = 0.3; // chance the guaranteed-passable lane is a house

export const ROAD_HALF = (LANE_COUNT * LANE_WIDTH) / 2 + 0.5;
