import { DEFAULT_BOARD } from "./board";
import type { BoardConfig, DiceValue, GameState, Move, PieceId, PlayerId } from "./types";
import { applyBonus, applyMove, applyRoll } from "./rules";

function assertNever(x: never): never {
  throw new Error(`Unhandled action: ${String(x)}`);
}

export type GameAction =
  | { type: "ROLL"; dice: DiceValue }
  | { type: "SELECT_MOVE"; moveId: string }
  | { type: "APPLY_MOVE"; move: Move }
  | { type: "APPLY_BONUS"; pieceId: PieceId }
  | { type: "RESET"; state: GameState };

export function gameReducer(board: BoardConfig = DEFAULT_BOARD) {
  return (state: GameState, action: GameAction): GameState => {
    switch (action.type) {
      case "ROLL":
        return applyRoll(state, action.dice, board);
      case "SELECT_MOVE": {
        if (state.phase !== "SELECT") return state;
        const move = state.legalMoves.find((m) => m.id === action.moveId);
        if (!move) return state;
        return applyMove(state, move, board);
      }
      case "APPLY_MOVE":
        return applyMove(state, action.move, board);
      case "APPLY_BONUS":
        return applyBonus(state, action.pieceId, board);
      case "RESET":
        return action.state;
      default:
        return assertNever(action);
    }
  };
}

export function getMovablePieceIds(state: GameState, player: PlayerId): string[] {
  if (!state.dice) return [];
  const set = new Set<string>();
  for (const m of state.legalMoves) {
    if (m.player === player) set.add(m.pieceId);
  }
  return Array.from(set);
}
