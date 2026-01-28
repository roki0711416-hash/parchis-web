import { DEFAULT_BOARD, isSafeSquare } from "./board";
import { getLegalMoves, tryAdvance } from "./rules";
import type { BoardConfig, DiceValue, GameState, Move, PieceId, PlayerId, Position } from "./types";

function posSafetyScore(pos: Position, board: BoardConfig): number {
  if (pos.kind !== "track") return 0;
  return isSafeSquare(board, pos.trackNumber) ? 1 : 0;
}

function posProgressScore(pos: Position, board: BoardConfig): number {
  if (pos.kind === "goal") return 10_000;
  if (pos.kind === "home") return 5_000 + pos.offset;
  if (pos.kind === "track") return 100 + (pos.trackNumber % board.trackLength);
  return 0;
}

function scoreMove(move: Move, board: BoardConfig): number {
  let score = 0;

  if (move.captures.length > 0) score += 1_000_000;
  if (move.reachesGoal) score += 500_000;

  score += posSafetyScore(move.to, board) * 10_000;
  score += posProgressScore(move.to, board);

  // Small preference: moving out from yard is good early.
  if (move.from.kind === "yard") score += 250;

  return score;
}

export function chooseMoveForCPU(
  state: GameState,
  die: DiceValue,
  board: BoardConfig = DEFAULT_BOARD
): Move | null {
  const player: PlayerId = state.currentPlayer;
  const moves = state.legalMoves.length ? state.legalMoves : getLegalMoves(player, die, state, board);
  if (moves.length === 0) return null;

  // Prefer by a simple heuristic; random tie-break.
  let bestScore = -Infinity;
  let best: Move[] = [];
  for (const m of moves) {
    const s = scoreMove(m, board);
    if (s > bestScore) {
      bestScore = s;
      best = [m];
    } else if (s === bestScore) {
      best.push(m);
    }
  }

  return best[Math.floor(Math.random() * best.length)];
}

export function chooseBonusPieceForCPU(state: GameState, board: BoardConfig = DEFAULT_BOARD): PieceId | null {
  const pending = state.bonusPending;
  if (!pending || pending.status !== "pending") return null;
  if (pending.choices.length === 0) return null;

  // Prefer: capture > reach goal > safe > progress. Random tie-break.
  let bestScore = -Infinity;
  let best: PieceId[] = [];

  for (const id of pending.choices) {
    const sim = tryAdvance({ ...state, bonusPending: null }, id, pending.steps, board);
    if (!sim.ok) continue;

    const pos = sim.nextState.pieces[id]?.pos;
    if (!pos) continue;

    let score = 0;
    if (sim.captures.length > 0) score += 1_000_000;
    score += posSafetyScore(pos, board) * 10_000;
    score += posProgressScore(pos, board);

    if (score > bestScore) {
      bestScore = score;
      best = [id];
    } else if (score === bestScore) {
      best.push(id);
    }
  }

  if (best.length === 0) {
    // Always pick something if possible.
    return pending.choices[0] ?? null;
  }

  return best[Math.floor(Math.random() * best.length)];
}
