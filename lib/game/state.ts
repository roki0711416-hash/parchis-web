import { DEFAULT_BOARD } from "./board";
import type { BoardConfig, GameState, Piece, PieceId, Player, PlayerId, PlayerType } from "./types";

export function createInitialPieces(): Record<PieceId, Piece> {
  const pieces: Record<PieceId, Piece> = {} as Record<PieceId, Piece>;
  const players: PlayerId[] = ["red", "blue", "yellow", "green"];
  for (const p of players) {
    for (const n of [1, 2, 3, 4] as const) {
      const id = `${p}-${n}` as const;
      pieces[id] = { id, owner: p, pos: { kind: "yard" } };
    }
  }
  return pieces;
}

export type PlayersConfig = Partial<Record<PlayerId, { type: PlayerType; active: boolean }>>;

export function createPlayersConfig(config?: PlayersConfig): Record<PlayerId, Player> {
  const ids: PlayerId[] = ["red", "blue", "yellow", "green"];
  const players: Record<PlayerId, Player> = {} as Record<PlayerId, Player>;
  for (const id of ids) {
    const entry = config?.[id];
    players[id] = {
      id,
      type: entry?.type ?? "human",
      active: entry?.active ?? true,
    };
  }
  return players;
}

export function createInitialState(board: BoardConfig = DEFAULT_BOARD, config?: PlayersConfig): GameState {
  const players = createPlayersConfig(config);
  const pieces = createInitialPieces();

  const trackOccupants: Record<number, PieceId[]> = {} as Record<number, PieceId[]>;
  for (let n = 1; n <= board.trackLength; n += 1) trackOccupants[n] = [];

  // Each ACTIVE player starts with 1 piece already spawned on their start square.
  // Inactive players keep all pieces in the yard.
  for (const p of board.turnOrder) {
    if (!players[p].active) continue;
    const firstId = `${p}-1` as PieceId;
    trackOccupants[board.startIndex[p]].push(firstId);
    pieces[firstId] = {
      ...pieces[firstId],
      pos: { kind: "track", trackNumber: board.startIndex[p] },
    };
  }

  const firstActive = board.turnOrder.find((p) => players[p].active) ?? board.turnOrder[0];

  return {
    phase: "ROLL",
    currentPlayer: firstActive,
    dice: null,
    players,
    pieces,
    trackOccupants,
    bonusPending: null,
    bonusQueue: [],
    legalMoves: [],
    turn: 1,
    winner: null,
  };
}
