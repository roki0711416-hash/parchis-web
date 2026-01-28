import type { BoardConfig, PlayerId } from "./types";

export const DEFAULT_TURN_ORDER = ["red", "blue", "yellow", "green"] as const;

// The current SVG board uses a 68-length track.
export const DEFAULT_TRACK_LENGTH = 68;

// Home stretch length is configurable; 7 is a common Parchs setting.
export const DEFAULT_HOME_LENGTH = 7;

export const DEFAULT_START_INDEX: Record<PlayerId, number> = {
  // Track label numbers (1-based) that match the UI numbering.
  red: 14,
  blue: 31,
  yellow: 48,
  green: 65,
};

export const DEFAULT_HOME_ENTRY_INDEX: Record<PlayerId, number> = {
  // One step before the start square enters home (in the fixed counter-clockwise direction).
  // I.e. the square that moves forward 1 step onto the start square.
  red: (DEFAULT_START_INDEX.red % DEFAULT_TRACK_LENGTH) + 1,
  blue: (DEFAULT_START_INDEX.blue % DEFAULT_TRACK_LENGTH) + 1,
  yellow: (DEFAULT_START_INDEX.yellow % DEFAULT_TRACK_LENGTH) + 1,
  green: (DEFAULT_START_INDEX.green % DEFAULT_TRACK_LENGTH) + 1,
};

// Safe squares are project-configurable. This default includes each player's start
// and the square 8 steps ahead of each start.
export const DEFAULT_SAFE_SQUARES = new Set<number>([
  2,
  7,
  14,
  19,
  24,
  31,
  36,
  41,
  48,
  53,
  58,
  65,
]);

export const DEFAULT_BOARD: BoardConfig = {
  trackLength: DEFAULT_TRACK_LENGTH,
  homeLength: DEFAULT_HOME_LENGTH,
  turnOrder: DEFAULT_TURN_ORDER,
  startIndex: DEFAULT_START_INDEX,
  homeEntryIndex: DEFAULT_HOME_ENTRY_INDEX,
  safeSquares: DEFAULT_SAFE_SQUARES,
};

export function nextPlayer(board: BoardConfig, current: PlayerId): PlayerId {
  const i = board.turnOrder.indexOf(current);
  if (i < 0) return board.turnOrder[0];
  return board.turnOrder[(i + 1) % board.turnOrder.length];
}

export function isSafeSquare(board: BoardConfig, trackNumber: number): boolean {
  return board.safeSquares.has(trackNumber);
}

export function numberToIndex(trackNumber: number): number {
  return trackNumber - 1;
}

export function indexToNumber(trackIndex: number): number {
  return trackIndex + 1;
}

export function mod(n: number, m: number): number {
  return ((n % m) + m) % m;
}
