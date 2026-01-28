export type PlayerId = "red" | "blue" | "yellow" | "green";

export type PlayerType = "human" | "cpu";

export type Phase = "ROLL" | "SELECT";

export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6;

export type PieceId = `${PlayerId}-${1 | 2 | 3 | 4}`;

export type Position =
  | { kind: "yard" }
  // Track squares are represented by board labels (1..trackLength).
  | { kind: "track"; trackNumber: number }
  | { kind: "home"; offset: number }
  | { kind: "goal" };

export type Piece = {
  id: PieceId;
  owner: PlayerId;
  pos: Position;
};

export type Player = {
  id: PlayerId;
  type: PlayerType;
  active: boolean;
};

export type Move = {
  id: string;
  player: PlayerId;
  pieceId: PieceId;
  dice: DiceValue;
  from: Position;
  to: Position;
  captures: PieceId[];
  reachesGoal: boolean;
};

export type GameState = {
  phase: Phase;
  currentPlayer: PlayerId;
  dice: DiceValue | null;

  // Player configuration for the current match.
  // Inactive players are skipped in turn order and should not have pieces spawned.
  players: Record<PlayerId, Player>;
  pieces: Record<PieceId, Piece>;

  // Track occupancy in arrival order (oldest -> newest). Index is trackNumber (1..trackLength).
  // This is used to enforce the "max 2 per square" rule and to pick the oldest opponent to kick.
  trackOccupants: Record<number, PieceId[]>;

  bonusPending: null | {
    id: string;
    by: PlayerId;
    type: "capture" | "goal";
    steps: number;
    choices: PieceId[];
    status: "pending" | "done";
  };

  // When multiple bonuses trigger from a single action (e.g. capture + goal),
  // they are processed one at a time.
  bonusQueue: Array<NonNullable<GameState["bonusPending"]>>;

  legalMoves: Move[];

  turn: number;
  winner: PlayerId | null;
};

export type BoardConfig = {
  trackLength: number;
  homeLength: number; // number of steps from entry to goal (exclusive). Goal is offset === homeLength.
  turnOrder: readonly PlayerId[];
  // Start square as a track label number (1..trackLength).
  startIndex: Record<PlayerId, number>;
  // Home entry square as a track label number (1..trackLength). Stepping from this square enters home.
  homeEntryIndex: Record<PlayerId, number>;
  // Safe squares as track label numbers (1..trackLength).
  safeSquares: ReadonlySet<number>;
};
