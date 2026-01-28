import { DEFAULT_BOARD, isSafeSquare, nextPlayer } from "./board";
import type { BoardConfig, DiceValue, GameState, Move, Piece, PieceId, PlayerId, Position } from "./types";
import { createInitialState } from "./state";

function makeBonusId(): string {
  return (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`) as string;
}

export function getLegalMoves(player: PlayerId, dice: DiceValue, state: GameState, board: BoardConfig = DEFAULT_BOARD): Move[] {
  if (state.winner) return [];
  if (state.bonusPending) return [];
  if (!state.players[player]?.active) return [];

  const moves: Move[] = [];

  const debugGreen = (...args: unknown[]) => {
    if (process.env.NODE_ENV !== "production" && player === "green") console.log("[legalMoves:green]", ...args);
  };
  if (process.env.NODE_ENV !== "production" && player === "green") {
    const pieces = Object.values(state.pieces)
      .filter((p) => p.owner === "green")
      .map((p) => ({ id: p.id, pos: p.pos }));
    debugGreen("start", { dice, phase: state.phase, currentPlayer: state.currentPlayer, pieces });
  }

  for (const piece of Object.values(state.pieces)) {
    if (piece.owner !== player) continue;

    const candidate = computeDestination(piece, dice, state, board);
    if (!candidate) continue;

    const { to, captures } = candidate;

    // Safe-zone hard block: if a safe square already has 2 pieces (any colors), landing is always illegal.
    // No capture/push/3rd landing can ever occur on safe squares.
    if (to.kind === "track" && isSafeSquare(board, to.trackNumber)) {
      const occ = piecesOnTrackNumber(state, to.trackNumber);
      if (occ.length >= 2) continue;
    }
    if (!isMoveLegal(piece, to, dice, state, board)) continue;

    moves.push({
      id: `${player}:${piece.id}:${dice}:${posKey(piece.pos)}->${posKey(to)}`,
      player,
      pieceId: piece.id,
      dice,
      from: piece.pos,
      to,
      captures,
      reachesGoal: to.kind === "goal",
    });
  }

  if (process.env.NODE_ENV !== "production" && player === "green") {
    debugGreen("result", {
      moveCount: moves.length,
      moves: moves.map((m) => ({ pieceId: m.pieceId, from: m.from, to: m.to, captures: m.captures })),
    });
  }

  return moves;
}

export function applyRoll(state: GameState, dice: DiceValue, board: BoardConfig = DEFAULT_BOARD): GameState {
  if (state.winner) return state;
  if (state.bonusPending) return state;
  if (state.phase !== "ROLL") return state;

  if (!state.players[state.currentPlayer]?.active) return advanceTurn(state, board);

  const player = state.currentPlayer;
  const legalMoves = getLegalMoves(player, dice, state, board);

  const withDice: GameState = {
    ...state,
    dice,
    legalMoves,
    phase: legalMoves.length === 1 ? "ROLL" : legalMoves.length === 0 ? "ROLL" : "SELECT",
  };

  // 6 が出たときは「出陣(yard→track)」が可能なら最優先で自動実行する。
  // UI をいじらず、ルール側で「振った直後」の分岐を保証する。
  if (dice === 6) {
    const spawnMove = legalMoves.find((m) => m.from.kind === "yard");
    if (spawnMove) {
      return applyMove(withDice, spawnMove, board);
    }
  }

  if (legalMoves.length === 0) {
    return advanceTurn(withDice, board);
  }

  if (legalMoves.length === 1) {
    return applyMove(withDice, legalMoves[0], board);
  }

  return withDice;
}

export function applyMove(state: GameState, move: Move, board: BoardConfig = DEFAULT_BOARD): GameState {
  if (state.winner) return state;
  if (state.bonusPending) return state;
  if (move.player !== state.currentPlayer) return state;
  if (!state.dice || move.dice !== state.dice) return state;

  const freshMoves = state.legalMoves.length ? state.legalMoves : getLegalMoves(move.player, move.dice, state, board);
  if (!freshMoves.some((m) => m.id === move.id)) return state;

  const piece = state.pieces[move.pieceId];
  if (!piece || piece.owner !== move.player) return state;

  const advanced = applyPieceToPosition(state, move.pieceId, move.to, board);
  const reachedGoalThisMove = move.to.kind === "goal";

  let after: GameState = {
    ...advanced.nextState,
    bonusPending: null,
    bonusQueue: [],
    phase: "ROLL",
    dice: null,
    legalMoves: [],
  };

  // Bonuses can chain; process one at a time.
  if (advanced.captures.length > 0) {
    after = grantAdvanceBonus(after, move.player, "capture", 20, board);
  }
  if (reachedGoalThisMove) {
    after = grantAdvanceBonus(after, move.player, "goal", 10, board, {
      exclude: new Set<PieceId>([move.pieceId]),
    });
  }

  const winner = computeWinner(after, move.player);
  if (winner) {
    return { ...after, winner };
  }

  const movedPiece = after.pieces[move.pieceId];
  const endedInGoal = movedPiece?.pos.kind === "goal";
  const didCapture = advanced.captures.length > 0;
  const extraTurn = move.dice === 6 || didCapture || endedInGoal;
  if (extraTurn) {
    return after;
  }

  return advanceTurn(after, board);
}

export function applyBonus(state: GameState, pieceId: PieceId, board: BoardConfig = DEFAULT_BOARD): GameState {
  if (state.winner) return state;
  const pending = state.bonusPending;
  if (!pending || pending.status !== "pending") return state;
  if (state.currentPlayer !== pending.by) return activateNextBonus({ ...state, bonusPending: null });
  if (!pending.choices.includes(pieceId)) return state;

  const cleared: GameState = { ...state, bonusPending: null, legalMoves: [], dice: null, phase: "ROLL" };
  const bonus = tryAdvance(cleared, pieceId, pending.steps, board);
  if (!bonus.ok) {
    return activateNextBonus(cleared);
  }

  let after: GameState = {
    ...bonus.nextState,
    phase: "ROLL",
    dice: null,
    legalMoves: [],
  };

  // Effects from the bonus move itself.
  if (bonus.captures.length > 0) {
    after = grantAdvanceBonus(after, pending.by, "capture", 20, board);
  }
  const endedInGoal = after.pieces[pieceId]?.pos.kind === "goal";
  if (endedInGoal) {
    after = grantAdvanceBonus(after, pending.by, "goal", 10, board, {
      exclude: new Set<PieceId>([pieceId]),
    });
  }

  const winner = computeWinner(after, pending.by);
  if (winner) return { ...after, winner, bonusPending: null, bonusQueue: [] };

  return activateNextBonus(after);
}


function enqueueBonus(state: GameState, bonus: NonNullable<GameState["bonusPending"]>): GameState {
  if (!state.bonusPending) return { ...state, bonusPending: bonus };
  return { ...state, bonusQueue: [...state.bonusQueue, bonus] };
}

function activateNextBonus(state: GameState): GameState {
  if (state.winner) return state;
  if (state.bonusPending) return state;
  if (state.bonusQueue.length === 0) return state;
  const [next, ...rest] = state.bonusQueue;
  return { ...state, bonusPending: next, bonusQueue: rest, phase: "ROLL", dice: null, legalMoves: [] };
}

function computeAdvanceBonusChoices(
  state: GameState,
  by: PlayerId,
  steps: number,
  board: BoardConfig,
  opts?: { exclude?: Set<PieceId> }
): PieceId[] {
  const choices: PieceId[] = [];
  for (const p of Object.values(state.pieces)) {
    if (p.owner !== by) continue;
    if (opts?.exclude?.has(p.id)) continue;
    if (p.pos.kind === "yard" || p.pos.kind === "goal") continue;

    const to = advancePositionSteps(by, p.pos, steps, state, board);
    if (!to) continue;
    if (!isMoveLegalSteps(p, to, steps, state, board)) continue;
    choices.push(p.id);
  }
  return choices;
}

function grantAdvanceBonus(
  state: GameState,
  by: PlayerId,
  type: "capture" | "goal",
  steps: number,
  board: BoardConfig,
  opts?: { exclude?: Set<PieceId> }
): GameState {
  const choices = computeAdvanceBonusChoices(state, by, steps, board, opts);
  if (choices.length === 0) return state;

  const bonus: NonNullable<GameState["bonusPending"]> = {
    id: makeBonusId(),
    by,
    type,
    steps,
    choices,
    status: "pending",
  };

  let next = enqueueBonus(state, bonus);

  // Preserve previous UX: if only one legal choice exists, auto-apply.
  if (choices.length === 1) {
    next = applyBonus(next, choices[0], board);
  }
  return next;
}

function applyPieceToPosition(
  state: GameState,
  moverId: PieceId,
  to: Position,
  board: BoardConfig
): { nextState: GameState; captures: PieceId[] } {
  const mover = state.pieces[moverId];
  if (!mover) return { nextState: state, captures: [] };

  // Compute captures from the latest state using arrival-order occupants.
  const captures = computeCaptures(mover.owner, to, state, board);

  const nextPieces: Record<PieceId, Piece> = { ...state.pieces };
  const nextTrackOccupants: Record<number, PieceId[]> = { ...state.trackOccupants };

  const removeFromTrack = (trackNumber: number, id: PieceId) => {
    const arr = nextTrackOccupants[trackNumber] ?? [];
    const idx = arr.indexOf(id);
    if (idx < 0) return;
    nextTrackOccupants[trackNumber] = [...arr.slice(0, idx), ...arr.slice(idx + 1)];
  };

  const kickFromTrackToYard = (trackNumber: number, id: PieceId) => {
    removeFromTrack(trackNumber, id);
    const captured = nextPieces[id];
    if (captured) nextPieces[id] = { ...captured, pos: { kind: "yard" } };
  };

  // 1) Remove mover from its source square occupants first.
  if (mover.pos.kind === "track") removeFromTrack(mover.pos.trackNumber, moverId);

  // 2) Kick oldest opponent (non-safe track squares only).
  if (to.kind === "track") {
    for (const capturedId of captures) kickFromTrackToYard(to.trackNumber, capturedId);
  } else {
    for (const capturedId of captures) {
      const captured = nextPieces[capturedId];
      if (!captured) continue;
      nextPieces[capturedId] = { ...captured, pos: { kind: "yard" } };
    }
  }

  // 3) Move the piece.
  nextPieces[moverId] = { ...mover, pos: to };

  // 4) Add mover to target occupants LAST (arrival order).
  if (to.kind === "track") {
    const arr = nextTrackOccupants[to.trackNumber] ?? [];
    nextTrackOccupants[to.trackNumber] = [...arr, moverId];
  }

  return {
    nextState: {
      ...state,
      pieces: nextPieces,
      trackOccupants: nextTrackOccupants,
    },
    captures,
  };
}

export function tryAdvance(
  state: GameState,
  pieceId: PieceId,
  steps: number,
  board: BoardConfig = DEFAULT_BOARD
): { ok: boolean; nextState: GameState; captures: PieceId[] } {
  if (state.winner) return { ok: false, nextState: state, captures: [] };
  if (!Number.isFinite(steps) || steps <= 0) return { ok: false, nextState: state, captures: [] };

  const piece = state.pieces[pieceId];
  if (!piece) return { ok: false, nextState: state, captures: [] };
  if (piece.owner !== state.currentPlayer) return { ok: false, nextState: state, captures: [] };
  if (piece.pos.kind === "yard" || piece.pos.kind === "goal") return { ok: false, nextState: state, captures: [] };

  const to = advancePositionSteps(piece.owner, piece.pos, steps, state, board);
  if (!to) return { ok: false, nextState: state, captures: [] };
  if (!isMoveLegalSteps(piece, to, steps, state, board)) return { ok: false, nextState: state, captures: [] };

  const advanced = applyPieceToPosition(state, pieceId, to, board);

  return {
    ok: true,
    nextState: {
      ...advanced.nextState,
      bonusPending: null,
      legalMoves: [],
      dice: null,
      phase: "ROLL",
    },
    captures: advanced.captures,
  };
}

export function advanceTurn(state: GameState, board: BoardConfig = DEFAULT_BOARD): GameState {
  if (state.winner) return state;

  const active = state.players;
  let next = nextPlayer(board, state.currentPlayer);
  for (let guard = 0; guard < board.turnOrder.length; guard += 1) {
    if (active[next]?.active) break;
    next = nextPlayer(board, next);
  }
  return {
    ...state,
    phase: "ROLL",
    currentPlayer: next,
    dice: null,
    legalMoves: [],
    turn: state.turn + 1,
  };
}

function computeWinner(state: GameState, player: PlayerId): PlayerId | null {
  const owned = Object.values(state.pieces).filter((p) => p.owner === player);
  if (owned.length !== 4) return null;
  return owned.every((p) => p.pos.kind === "goal") ? player : null;
}

function computeDestination(
  piece: Piece,
  dice: DiceValue,
  state: GameState,
  board: BoardConfig
): { to: Position; captures: PieceId[] } | null {
  if (piece.pos.kind === "goal") return null;

  // 出陣: 6のみ
  if (piece.pos.kind === "yard") {
    if (dice !== 6) return null;
    const to: Position = { kind: "track", trackNumber: board.startIndex[piece.owner] };
    const captures = computeCaptures(piece.owner, to, state, board);
    return { to, captures };
  }

  const to = advancePosition(piece.owner, piece.pos, dice, state, board);
  if (!to) return null;
  const captures = computeCaptures(piece.owner, to, state, board);
  return { to, captures };
}

function isMoveLegal(piece: Piece, to: Position, dice: DiceValue, state: GameState, board: BoardConfig): boolean {
  return isMoveLegalSteps(piece, to, dice, state, board);
}

function isMoveLegalSteps(piece: Piece, to: Position, steps: number, state: GameState, board: BoardConfig): boolean {
  if (piece.pos.kind === "goal") return false;

  // Exact-goal only
  if (piece.pos.kind === "home") {
    const remaining = board.homeLength - piece.pos.offset;
    if (steps > remaining) return false;
  }

  // For home squares, keep the usual block rule (2 pieces already there => can't land).
  // Track squares are handled below because we allow "kick oldest opponent" on full squares.
  if (to.kind === "home" && isBlockedAtDestination(to, state)) return false;

  // Also prevent making 3+ same-color stack.
  if (wouldExceedOwnStackLimit(piece.owner, to, state)) return false;

  // Path blocking: cannot pass through any block square.
  if (!pathIsClearSteps(piece.owner, piece.pos, steps, state, board)) return false;

  // Track landing rules (max 2 per square + kick oldest opponent on non-safe squares).
  if (to.kind === "track") {
    const safe = isSafeSquare(board, to.trackNumber);

    const occupants = piecesOnTrackNumber(state, to.trackNumber);

    // Safe squares: no kicking/captures. If already full, cannot land.
    if (safe) {
      return occupants.length < 2;
    }

    // Non-safe squares: if full, landing is only legal when at least one opponent is present
    // (we will kick the oldest opponent on landing, keeping max=2).
    if (occupants.length >= 2) {
      return occupants.some((p) => p.owner !== piece.owner);
    }

    return true;
  }

  // Home/goal squares only contain same color; block rules handled above.
  return true;
}

function computeCaptures(owner: PlayerId, to: Position, state: GameState, board: BoardConfig): PieceId[] {
  if (to.kind !== "track") return [];

  if (isSafeSquare(board, to.trackNumber)) return [];

  const occupants = piecesOnTrackNumber(state, to.trackNumber);
  if (occupants.length === 0) return [];

  // If there is any opponent here, kick exactly one.
  // When there are 2 pieces, this removes the oldest opponent (arrival order).
  for (const p of occupants) {
    if (p.owner !== owner) return [p.id];
  }

  return [];
}

function piecesOnTrackNumber(state: GameState, trackNumber: number): Piece[] {
  const ids = state.trackOccupants[trackNumber] ?? [];
  const res: Piece[] = [];
  for (const id of ids) {
    const p = state.pieces[id];
    if (p && p.pos.kind === "track" && p.pos.trackNumber === trackNumber) res.push(p);
  }
  return res;
}

function piecesOnHomeOffset(state: GameState, owner: PlayerId, offset: number): Piece[] {
  return Object.values(state.pieces).filter((p) => p.owner === owner && p.pos.kind === "home" && p.pos.offset === offset);
}

function isBlockedAtDestination(to: Position, state: GameState): boolean {
  if (to.kind === "track") {
    const occupants = piecesOnTrackNumber(state, to.trackNumber);
    if (occupants.length < 2) return false;
    const byOwner = new Map<PlayerId, number>();
    for (const p of occupants) byOwner.set(p.owner, (byOwner.get(p.owner) ?? 0) + 1);
    return Array.from(byOwner.values()).some((n) => n >= 2);
  }

  if (to.kind === "home") {
    const occupants = piecesOnHomeOffset(state, state.currentPlayer, to.offset);
    return occupants.length >= 2;
  }

  return false;
}

function wouldExceedOwnStackLimit(owner: PlayerId, to: Position, state: GameState): boolean {
  if (to.kind === "track") {
    const own = piecesOnTrackNumber(state, to.trackNumber).filter((p) => p.owner === owner);
    return own.length >= 2;
  }

  if (to.kind === "home") {
    const own = piecesOnHomeOffset(state, owner, to.offset);
    return own.length >= 2;
  }

  return false;
}

function pathIsClearSteps(owner: PlayerId, from: Position, steps: number, state: GameState, board: BoardConfig): boolean {
  if (from.kind === "yard" || from.kind === "goal") return true;

  const isOpponentTrackBlock = (trackNumber: number): boolean => {
    const occupants = piecesOnTrackNumber(state, trackNumber);
    if (occupants.length < 2) return false;
    const blockOwner = occupants[0].owner;
    // Track "block" is two pieces of the same color.
    if (!occupants.every((p) => p.owner === blockOwner)) return false;
    return blockOwner !== owner;
  };

  let cur: Position = from;
  for (let step = 1; step <= steps; step += 1) {
    const next = stepOnce(owner, cur, state, board);
    if (!next) return false;

    // Ignore the starting square itself; opponent blocks on intermediate squares stop movement.
    // (A player may always move a piece off their own block.)
    if (step < steps && next.kind === "track" && isOpponentTrackBlock(next.trackNumber)) return false;

    cur = next;
  }

  return true;
}

function advancePosition(
  owner: PlayerId,
  from: Position,
  dice: DiceValue,
  state: GameState,
  board: BoardConfig
): Position | null {
  return advancePositionSteps(owner, from, dice, state, board);
}

function advancePositionSteps(
  owner: PlayerId,
  from: Position,
  steps: number,
  state: GameState,
  board: BoardConfig
): Position | null {
  let cur: Position = from;
  for (let step = 0; step < steps; step += 1) {
    const next = stepOnce(owner, cur, state, board);
    if (!next) return null;
    cur = next;
  }

  // Exact goal only: if in home stretch and offset exceeded, reject.
  if (cur.kind === "home" && cur.offset > board.homeLength) return null;
  return cur;
}

function advanceTrackIndex(pos: number, steps: number, trackLen: number): number {
  // Counter-clockwise (fixed):
  // next = (pos - steps + TRACK_LEN) % TRACK_LEN
  const s = steps % trackLen;
  return (pos - s + trackLen) % trackLen;
}

function advanceTrackNumber(trackNumber: number, steps: number, board: BoardConfig): number {
  const pos = trackNumber - 1;
  const next = advanceTrackIndex(pos, steps, board.trackLength);
  return next + 1;
}

function stepOnce(owner: PlayerId, from: Position, state: GameState, board: BoardConfig): Position | null {
  if (from.kind === "yard" || from.kind === "goal") return null;

  if (from.kind === "home") {
    const nextOffset = from.offset + 1;
    if (nextOffset === board.homeLength) return { kind: "goal" };
    if (nextOffset > board.homeLength) return null;
    return { kind: "home", offset: nextOffset };
  }

  // Track movement with home-entry transition.
  const homeEntry = board.homeEntryIndex[owner];
  if (from.trackNumber === homeEntry) {
    return { kind: "home", offset: 0 };
  }

  // Track movement is counter-clockwise (decrement trackIndex with wrap).
  return { kind: "track", trackNumber: advanceTrackNumber(from.trackNumber, 1, board) };
}

function posKey(pos: Position): string {
  if (pos.kind === "yard") return "yard";
  if (pos.kind === "goal") return "goal";
  if (pos.kind === "track") return `t${pos.trackNumber}`;
  return `h${pos.offset}`;
}

/**
 * Quick, console.log based sanity checks.
 * Call manually from a dev-only entry point (UI is intentionally not touched).
 */
export function debugQuickChecks(board: BoardConfig = DEFAULT_BOARD): void {
  const log = (...args: unknown[]) => console.log("[game-debug]", ...args);

  const rebuildTrackOccupants = (state: GameState) => {
    const trackOccupants: Record<number, PieceId[]> = {} as Record<number, PieceId[]>;
    for (let n = 1; n <= board.trackLength; n += 1) trackOccupants[n] = [];
    for (const p of Object.values(state.pieces)) {
      if (p.pos.kind !== "track") continue;
      trackOccupants[p.pos.trackNumber].push(p.id);
    }
    state.trackOccupants = trackOccupants;
  };

  // 1) ダイス=6 のときに出陣候補が出る
  {
    const state = createInitialState(board);
    const moves = getLegalMoves("red", 6, state, board);
    log("spawn candidates (red, dice=6)", {
      moveCount: moves.length,
      pieceIds: moves.map((m) => m.pieceId),
      destinations: moves.map((m) => m.to),
    });
  }

  // 2) 捕獲できる状況で捕獲 Move が返る
  {
    const state = createInitialState(board);
    state.currentPlayer = "red";
    // Place one red piece on track, and one blue piece on a non-safe destination.
    state.pieces["red-1"].pos = { kind: "track", trackNumber: 7 };
    state.pieces["blue-1"].pos = { kind: "track", trackNumber: 10 }; // 10 is non-safe in DEFAULT_SAFE_SQUARES

    // Put other pieces away to avoid accidental interference.
    for (const id of Object.keys(state.pieces) as PieceId[]) {
      if (id === "red-1" || id === "blue-1") continue;
      state.pieces[id].pos = { kind: "yard" };
    }

    rebuildTrackOccupants(state);

    const moves = getLegalMoves("red", 3, state, board);
    const captureMoves = moves.filter((m) => m.captures.length > 0);
    log("capture candidates (red, dice=3)", {
      moveCount: moves.length,
      captureCount: captureMoves.length,
      captureMoves: captureMoves.map((m) => ({ pieceId: m.pieceId, from: m.from, to: m.to, captures: m.captures })),
    });
  }

  // 3) ゴールぴったりのみ有効になる
  {
    const state = createInitialState(board);
    state.currentPlayer = "red";

    // Put exactly one red piece in home stretch near goal.
    state.pieces["red-1"].pos = { kind: "home", offset: board.homeLength - 2 };
    for (const id of Object.keys(state.pieces) as PieceId[]) {
      if (id === "red-1") continue;
      state.pieces[id].pos = { kind: "goal" };
    }

    rebuildTrackOccupants(state);

    const okMoves = getLegalMoves("red", 2, state, board);
    const badMoves = getLegalMoves("red", 3, state, board);

    log("exact-goal-only (red-1 @ homeLength-2)", {
      dice2: { count: okMoves.length, to: okMoves.map((m) => m.to) },
      dice3: { count: badMoves.length, to: badMoves.map((m) => m.to) },
    });
  }

  // 4) 緑の開始位置から次マスが存在し、68→1 で wrap する
  {
    const state = createInitialState(board);
    state.currentPlayer = "green";

    const fromStart: Position = { kind: "track", trackNumber: board.startIndex.green };
    const nextFromStart = stepOnce("green", fromStart, state, board);

    const fromEnd: Position = { kind: "track", trackNumber: board.trackLength };
    const nextFromEnd = stepOnce("green", fromEnd, state, board);

    log("green-track-sanity", {
      start: fromStart,
      nextFromStart,
      end: fromEnd,
      nextFromEnd,
    });
  }
}
