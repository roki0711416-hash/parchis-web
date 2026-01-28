"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";

import {
  DEFAULT_BOARD,
  chooseBonusPieceForCPU,
  chooseMoveForCPU,
  createInitialState,
  gameReducer,
  type DiceValue,
  type PieceId,
  type PlayerId,
  type Position,
} from "@/lib/game";

type Mode = "solo" | "local2" | "local3" | "local4";

function parseMode(value: string | null): Mode {
  switch (value) {
    case "solo":
    case "local2":
    case "local3":
    case "local4":
      return value;
    default:
      return "solo";
  }
}

const playersConfigForMode = (mode: Mode) => {
  switch (mode) {
    case "solo":
      return {
        red: { type: "human" as const, active: true },
        blue: { type: "cpu" as const, active: true },
        yellow: { type: "cpu" as const, active: true },
        green: { type: "cpu" as const, active: true },
      };
    case "local2":
      return {
        red: { type: "human" as const, active: true },
        blue: { type: "human" as const, active: true },
        yellow: { type: "human" as const, active: false },
        green: { type: "human" as const, active: false },
      };
    case "local3":
      return {
        red: { type: "human" as const, active: true },
        blue: { type: "human" as const, active: true },
        yellow: { type: "human" as const, active: true },
        green: { type: "human" as const, active: false },
      };
    case "local4":
    default:
      return {
        red: { type: "human" as const, active: true },
        blue: { type: "human" as const, active: true },
        yellow: { type: "human" as const, active: true },
        green: { type: "human" as const, active: true },
      };
  }
};

function GameClient({ mode }: { mode: Mode }) {
  const [diceFace, setDiceFace] = useState<number>(1);
  const [lastDice, setLastDice] = useState<number | null>(null);

  type PendingRoll = {
    id: string;
    turn: PlayerId;
    value: number | null;
    status: "rolling" | "result";
  };
  const [pendingRoll, setPendingRoll] = useState<PendingRoll | null>(null);
  const pendingRollRef = useRef<PendingRoll | null>(null);
  useEffect(() => {
    pendingRollRef.current = pendingRoll;
  }, [pendingRoll]);

  const rollIntervalRef = useRef<number | null>(null);
  const rollTimeoutsRef = useRef<number[]>([]);

  // Phase 1 dice animation params (rotation + bounce with ease-out deceleration).
  // Keep this as a small param object so Phase 2/3 can extend without rewriting call sites.
  const [diceAnim, setDiceAnim] = useState<{ key: number; durMs: number; spinDeg: number; spin70Deg: number }>(() => ({
    key: 0,
    durMs: 900,
    spinDeg: 2160,
    spin70Deg: Math.round(2160 * 0.9),
  }));

  const [game, dispatch] = useReducer(gameReducer(DEFAULT_BOARD), mode, (m) =>
    createInitialState(DEFAULT_BOARD, playersConfigForMode(m))
  );

  const [isLandscape, setIsLandscape] = useState<boolean>(true);

  // Current turn is indicated by a board highlight (not by text).
  type TurnLane = PlayerId;
  const currentTurn: TurnLane = game.currentPlayer;

  const isCpuTurn = game.players[currentTurn]?.type === "cpu";
  const isInteractionLocked = pendingRoll != null || isCpuTurn;

  const isRolling = pendingRoll?.status === "rolling";

  const cpuTimeoutsRef = useRef<number[]>([]);
  const clearCpuTimers = () => {
    for (const t of cpuTimeoutsRef.current) window.clearTimeout(t);
    cpuTimeoutsRef.current = [];
  };

  const gameRef = useRef(game);
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const debugRoll = useCallback((...args: unknown[]) => {
    if (process.env.NODE_ENV !== "production") console.log(...args);
  }, []);

  const clearRollTimers = useCallback(() => {
    if (rollIntervalRef.current != null) {
      window.clearInterval(rollIntervalRef.current);
      rollIntervalRef.current = null;
    }
    for (const t of rollTimeoutsRef.current) window.clearTimeout(t);
    rollTimeoutsRef.current = [];
  }, []);

  const highlightPieceIds = useMemo(() => {
    if (game.bonusPending) return game.bonusPending.choices;
    if (game.phase !== "SELECT") return [] as PieceId[];
    const set = new Set<PieceId>();
    for (const m of game.legalMoves) set.add(m.pieceId);
    return Array.from(set);
  }, [game.bonusPending, game.phase, game.legalMoves]);

  const onPieceClick = (pieceId: PieceId) => {
    if (game.bonusPending) {
      if (pendingRoll != null) return;
      if (isCpuTurn) return;
      if (!game.bonusPending.choices.includes(pieceId)) return;
      dispatch({ type: "APPLY_BONUS", pieceId });
      return;
    }
    if (isInteractionLocked) return;
    if (game.phase !== "SELECT") return;
    const move = game.legalMoves.find((m) => m.pieceId === pieceId);
    if (!move) return;
    dispatch({ type: "SELECT_MOVE", moveId: move.id });
  };

  const rollDice = useCallback(() => {
    if (pendingRoll) return;
    if (game.bonusPending) return;
    if (isCpuTurn) return;
    if (game.phase !== "ROLL") return;

    clearRollTimers();
    setLastDice(null);

    const turnSnapshot = currentTurn;
    const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`) as string;
    debugRoll("roll:start", { id, turn: turnSnapshot, phase: game.phase });
    setPendingRoll({ id, turn: turnSnapshot, value: null, status: "rolling" });

    const durMs = 900;
    const turns = 5 + Math.floor(Math.random() * 3); // 5..7
    const spinDeg = turns * 360;
    const spin70Deg = Math.round(spinDeg * 0.9);
    setDiceAnim({ key: Date.now(), durMs, spinDeg, spin70Deg });

    rollIntervalRef.current = window.setInterval(() => {
      setDiceFace(Math.floor(Math.random() * 6) + 1);
    }, 80);

    // 1) After 900ms: fix the value and apply immediately (no delayed apply timeout).
    rollTimeoutsRef.current.push(
      window.setTimeout(() => {
        debugRoll("roll:result-timeout", { id, turn: turnSnapshot });

        if (rollIntervalRef.current != null) {
          window.clearInterval(rollIntervalRef.current);
          rollIntervalRef.current = null;
        }

        const final = Math.floor(Math.random() * 6) + 1;
        debugRoll("roll:result", { id, turn: turnSnapshot, value: final });
        setDiceFace(final);
        setLastDice(final);

        setPendingRoll((prev) => (prev && prev.id === id ? { ...prev, value: final, status: "result" } : prev));

        const latest = gameRef.current;
        if (latest.currentPlayer !== turnSnapshot) {
          debugRoll("roll:apply-cancel(turn-mismatch)", { id, turnAtRoll: turnSnapshot, currentPlayer: latest.currentPlayer });
          setPendingRoll(null);
          return;
        }

        debugRoll("roll:apply", { id, turn: turnSnapshot, value: final });
        dispatch({ type: "ROLL", dice: final as DiceValue });
      }, durMs)
    );

    // 2) 200ms after result: UI-only delay before clearing overlay.
    rollTimeoutsRef.current.push(
      window.setTimeout(() => {
        debugRoll("roll:clear-overlay", { id });
        setPendingRoll((prev) => (prev && prev.id === id ? null : prev));
      }, durMs + 200)
    );
  }, [pendingRoll, game.bonusPending, game.phase, clearRollTimers, currentTurn, debugRoll, dispatch, isCpuTurn]);

  useEffect(() => {
    return () => {
      // Prevent timer leaks when navigating away.
      if (rollIntervalRef.current != null) {
        window.clearInterval(rollIntervalRef.current);
        rollIntervalRef.current = null;
      }
      for (const t of rollTimeoutsRef.current) window.clearTimeout(t);
      rollTimeoutsRef.current = [];

      clearCpuTimers();
    };
  }, []);

  useEffect(() => {
    clearCpuTimers();

    if (!isCpuTurn) return;
    if (pendingRoll) return;

    // 1) Bonus selection (must be resolved before anything else)
    if (game.bonusPending) {
      cpuTimeoutsRef.current.push(
        window.setTimeout(() => {
          const id = chooseBonusPieceForCPU(gameRef.current, DEFAULT_BOARD);
          if (!id) return;
          dispatch({ type: "APPLY_BONUS", pieceId: id });
        }, 500)
      );
      return;
    }

    // 2) Roll when it's CPU's turn and we're waiting for a roll
    if (game.phase === "ROLL") {
      cpuTimeoutsRef.current.push(
        window.setTimeout(() => {
          // Use the existing dice animation path.
          // (Bypass the human lock inside rollDice.)
          if (pendingRollRef.current) return;
          const turnSnapshot = gameRef.current.currentPlayer;
          if (gameRef.current.players[turnSnapshot]?.type !== "cpu") return;

          clearRollTimers();
          setLastDice(null);

          const id = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`) as string;
          debugRoll("roll:start", { id, turn: turnSnapshot, phase: gameRef.current.phase });
          setPendingRoll({ id, turn: turnSnapshot, value: null, status: "rolling" });

          const durMs = 900;
          const turns = 5 + Math.floor(Math.random() * 3); // 5..7
          const spinDeg = turns * 360;
          const spin70Deg = Math.round(spinDeg * 0.9);
          setDiceAnim({ key: Date.now(), durMs, spinDeg, spin70Deg });

          rollIntervalRef.current = window.setInterval(() => {
            setDiceFace(Math.floor(Math.random() * 6) + 1);
          }, 80);

          rollTimeoutsRef.current.push(
            window.setTimeout(() => {
              debugRoll("roll:result-timeout", { id, turn: turnSnapshot });

              if (rollIntervalRef.current != null) {
                window.clearInterval(rollIntervalRef.current);
                rollIntervalRef.current = null;
              }

              const final = Math.floor(Math.random() * 6) + 1;
              debugRoll("roll:result", { id, turn: turnSnapshot, value: final });
              setDiceFace(final);
              setLastDice(final);
              setPendingRoll((prev) => (prev && prev.id === id ? { ...prev, value: final, status: "result" } : prev));

              const latest = gameRef.current;
              if (latest.currentPlayer !== turnSnapshot) {
                debugRoll("roll:apply-cancel(turn-mismatch)", { id, turnAtRoll: turnSnapshot, currentPlayer: latest.currentPlayer });
                setPendingRoll(null);
                return;
              }

              debugRoll("roll:apply", { id, turn: turnSnapshot, value: final });
              dispatch({ type: "ROLL", dice: final as DiceValue });
            }, durMs)
          );

          rollTimeoutsRef.current.push(
            window.setTimeout(() => {
              debugRoll("roll:clear-overlay", { id });
              setPendingRoll((prev) => (prev && prev.id === id ? null : prev));
            }, durMs + 200)
          );
        }, 550)
      );
      return;
    }

    // 3) Choose a move when multiple moves exist (SELECT)
    if (game.phase === "SELECT" && game.dice) {
      cpuTimeoutsRef.current.push(
        window.setTimeout(() => {
          const state = gameRef.current;
          if (state.phase !== "SELECT" || !state.dice) return;
          if (state.bonusPending) return;

          const chosen = chooseMoveForCPU(state, state.dice, DEFAULT_BOARD);
          if (!chosen) return;
          dispatch({ type: "SELECT_MOVE", moveId: chosen.id });
        }, 550)
      );
    }
  }, [isCpuTurn, pendingRoll, game.phase, game.dice, game.bonusPending, clearRollTimers, debugRoll]);

  useEffect(() => {
    const compute = () => {
      // Use both matchMedia and the numeric fallback for broader browser support.
      const byMedia = window.matchMedia?.("(orientation: landscape)")?.matches ?? false;
      const bySize = window.innerWidth > window.innerHeight;

      const landscape = byMedia || bySize;
      setIsLandscape(landscape);
    };

    compute();
    window.addEventListener("resize", compute);
    window.addEventListener("orientationchange", compute);
    return () => {
      window.removeEventListener("resize", compute);
      window.removeEventListener("orientationchange", compute);
    };
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden bg-neutral-50">
      {/* Top nav overlay (does not reduce board size) */}
      <div className="absolute top-0 left-0 right-0 z-10 px-3 py-2 flex items-center justify-between">
        <Link href="/" className="rounded-lg bg-white/80 backdrop-blur px-3 py-2 text-sm text-neutral-700 border border-neutral-200">
          戻る
        </Link>
        <div className="rounded-lg bg-white/80 backdrop-blur px-3 py-2 text-sm font-semibold text-neutral-900 border border-neutral-200">パルチス</div>
        <div className="w-[52px]" />
      </div>

      {/* Board: detached from layout and centered.
          - Landscape: contain as 100vmin square (never clipped).
          - Portrait: height-based square (aspect-square + h-[100dvh] + w-auto).
            Optional slight scale-up is allowed to emphasize the board. */}
      <div
        className={"absolute left-1/2 top-1/2 " + (isLandscape ? "w-[100vmin] h-[100vmin]" : "h-[100dvh] aspect-square w-auto")}
        style={{ transform: `translate(-50%, -50%) scale(${isLandscape ? 1 : 0.75})`, transformOrigin: "center" }}
      >
        <div className={"w-full h-full " + (isLandscape ? "" : "rotate-90")}>
          <svg
            viewBox="0 0 240 240"
            preserveAspectRatio="xMidYMid meet"
            className="block w-full h-full"
            role="img"
            aria-label="盤面"
          >
                  <defs>
                    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
                      <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#000" floodOpacity="0.16" />
                    </filter>
                    <style>{`
                      /* Phase 1: 2D rotation + bounce, ease-out deceleration. */
                      .diceRoll {
                        transform-box: fill-box;
                        transform-origin: center;
                        animation: diceRoll var(--dice-dur)ms cubic-bezier(0, 0, 0.58, 1) forwards;
                      }

                      @keyframes diceRoll {
                        0% {
                          transform: translateY(calc(var(--dice-bounce) * -1)) rotate(0deg) scale(0.9);
                        }
                        70% {
                          transform: translateY(calc(var(--dice-bounce) * 0.15)) rotate(var(--dice-spin-70)) scale(1.06);
                        }
                        100% {
                          transform: translateY(0px) rotate(var(--dice-spin-100)) scale(1);
                        }
                      }
                    `}</style>
                  </defs>

                {(() => {
                  return (
                    <>
                      {(() => {
                        type CellRole = "path" | "home" | "goalEntry";

                        const boardX = 0;
                        const boardY = 0;
                        const boardW = 240;
                        const boardH = 240;
                        const radius = 12;

                        const innerX = boardX;
                        const innerY = boardY;
                        const innerW = boardW;
                        const innerH = boardH;

                        // Grid is still 19x19 logically, but cells are rendered as horizontal rectangles.
                        const grid = 19;
                        const band = 3;
                        const bandStart = (grid - band) / 2;

                        const playPad = 2;
                        const playAreaX = innerX + playPad;
                        const playAreaY = innerY + playPad;
                        const playAreaW = innerW - playPad * 2;
                        const playAreaH = innerH - playPad * 2;

                        const rows = grid;
                        const cols = grid;
                        const cellAspect = 1.3; // cellW : cellH

                        const cellH = Math.min(playAreaH / rows, playAreaW / (cols * cellAspect));
                        const cellW = cellH * cellAspect;

                        const gridW = cellW * cols;
                        const gridH = cellH * rows;

                        const gridX = playAreaX + (playAreaW - gridW) / 2;
                        const gridY = playAreaY + (playAreaH - gridH) / 2;

                        const cx = gridX + gridW / 2;
                        const cy = gridY + gridH / 2;

                        const cellX = (c: number) => gridX + c * cellW;
                        const cellY = (r: number) => gridY + r * cellH;

                        const gridStroke = "#444444";
                        const stroke = 1.05;
                        const cellMin = Math.min(cellW, cellH);
                        const cellRadius = Math.min(1.2, cellMin * 0.25);

                        const centerX = cellX(bandStart);
                        const centerY = cellY(bandStart);
                        const centerW = cellW * band;
                        const centerH = cellH * band;

                        const cellRect = (c: number, r: number, fill: string, key: string) => (
                          <rect
                            key={key}
                            x={cellX(c)}
                            y={cellY(r)}
                            width={cellW}
                            height={cellH}
                            rx={cellRadius}
                            fill={fill}
                            stroke={gridStroke}
                            strokeWidth={stroke}
                          />
                        );

                        const isCenter = (c: number, r: number) =>
                          c >= bandStart && c < bandStart + band && r >= bandStart && r < bandStart + band;

                        const inVert = (c: number) => c >= bandStart && c < bandStart + band;
                        const inHoriz = (r: number) => r >= bandStart && r < bandStart + band;

                        const tiles: ReactNode[] = [];
                        const labels: ReactNode[] = [];
                        const safeIcons: ReactNode[] = [];

                        const movableSet = new Set<PieceId>(highlightPieceIds);

                        const isLane = (r: number, c: number) => inVert(c) || inHoriz(r);
                        const isOccupied = (r: number, c: number) => isLane(r, c) || isCenter(c, r);

                        const cellKey = (r: number, c: number) => `${r},${c}`;

                        // Build clockwise outer-boundary track[] from the occupied region (lane + center).
                        type Edge = { x1: number; y1: number; x2: number; y2: number };

                        const boundaryEdges: Edge[] = [];
                        for (let r = 0; r < grid; r += 1) {
                          for (let c = 0; c < grid; c += 1) {
                            if (!isOccupied(r, c)) continue;

                            // Top
                            if (r === 0 || !isOccupied(r - 1, c)) boundaryEdges.push({ x1: c, y1: r, x2: c + 1, y2: r });
                            // Right
                            if (c === grid - 1 || !isOccupied(r, c + 1)) boundaryEdges.push({ x1: c + 1, y1: r, x2: c + 1, y2: r + 1 });
                            // Bottom
                            if (r === grid - 1 || !isOccupied(r + 1, c)) boundaryEdges.push({ x1: c + 1, y1: r + 1, x2: c, y2: r + 1 });
                            // Left
                            if (c === 0 || !isOccupied(r, c - 1)) boundaryEdges.push({ x1: c, y1: r + 1, x2: c, y2: r });
                          }
                        }

                        const vKey = (x: number, y: number) => `${x},${y}`;
                        const edgeByStart = new Map<string, Edge>();
                        for (const e of boundaryEdges) {
                          const k = vKey(e.x1, e.y1);
                          // For a simple outer boundary, there should be exactly one outgoing edge per start vertex.
                          if (!edgeByStart.has(k)) edgeByStart.set(k, e);
                        }

                        let startEdge: Edge | undefined;
                        for (const e of boundaryEdges) {
                          if (!startEdge) {
                            startEdge = e;
                            continue;
                          }
                          if (e.y1 < startEdge.y1 || (e.y1 === startEdge.y1 && e.x1 < startEdge.x1)) startEdge = e;
                        }

                        const trackRaw: Array<{ r: number; c: number }> = [];
                        const edgeToInsideCell = (e: Edge): { r: number; c: number } => {
                          const dx = e.x2 - e.x1;
                          const dy = e.y2 - e.y1;
                          // Occupied region stays on the LEFT of the directed edge.
                          if (dx === 1 && dy === 0) return { r: e.y1, c: e.x1 }; // top edge, inside below
                          if (dx === 0 && dy === 1) return { r: e.y1, c: e.x1 - 1 }; // right edge, inside left
                          if (dx === -1 && dy === 0) return { r: e.y1 - 1, c: e.x2 }; // bottom edge, inside above
                          return { r: e.y2, c: e.x1 }; // left edge, inside right
                        };

                        if (startEdge) {
                          const startVertex = vKey(startEdge.x1, startEdge.y1);
                          let cur = startEdge;
                          // Safety bound: perimeter edges are limited.
                          for (let guard = 0; guard < boundaryEdges.length + 5; guard += 1) {
                            const inside = edgeToInsideCell(cur);
                            if (isLane(inside.r, inside.c)) {
                              const last = trackRaw[trackRaw.length - 1];
                              if (!last || last.r !== inside.r || last.c !== inside.c) trackRaw.push(inside);
                            }

                            const nextKey = vKey(cur.x2, cur.y2);
                            if (nextKey === startVertex) break;
                            const next = edgeByStart.get(nextKey);
                            if (!next) break;
                            cur = next;
                          }
                        }

                        // Ensure track is a unique cycle of cells (no duplicates in numbering order).
                        const track: Array<{ r: number; c: number }> = [];
                        {
                          const seen = new Set<string>();
                          for (const p of trackRaw) {
                            const k = cellKey(p.r, p.c);
                            if (seen.has(k)) continue;
                            seen.add(k);
                            track.push(p);
                          }
                        }

                        // Log track length for validation (dev only).
                        if (process.env.NODE_ENV !== "production") {
                          console.log("track.length", track.length);
                        }

                        const labelByCell = new Map<string, number>();
                        for (let i = 0; i < track.length; i += 1) {
                          labelByCell.set(cellKey(track[i].r, track[i].c), i + 1);
                        }

                        type Lane = "green" | "red" | "blue" | "yellow";

                        const laneOf = (r: number, c: number): Lane | undefined => {
                          // Lanes are the 4 arms of the cross (excluding the 3x3 center).
                          // - Top vertical arm: green
                          // - Right horizontal arm: red
                          // - Bottom vertical arm: blue
                          // - Left horizontal arm: yellow
                          if (inVert(c)) {
                            if (r < bandStart) return "green";
                            if (r >= bandStart + band) return "blue";
                            return undefined;
                          }

                          if (inHoriz(r)) {
                            if (c < bandStart) return "yellow";
                            if (c >= bandStart + band) return "red";
                            return undefined;
                          }

                          return undefined;
                        };

                        const cells: Array<{ r: number; c: number; role: CellRole; fill: string; label?: number; lane?: Lane }> = [];
                        for (let r = 0; r < grid; r += 1) {
                          for (let c = 0; c < grid; c += 1) {
                            if (!isLane(r, c)) continue;
                            if (isCenter(c, r)) continue;

                            const k = cellKey(r, c);
                            const label = labelByCell.get(k);

                            const lane = laneOf(r, c);

                            // A) Base: all lane tiles start white.
                            const fill = "#ffffff";
                            const role: CellRole = "path";

                            // B) Only track cells get label. C) Even labeled cells stay white.
                            cells.push({ r, c, role, fill, label, lane });
                          }
                        }

                        // Apply lane colors to label-less cells only (draw-time rule).
                        const greenColor = "#16a34a";
                        const redColor = "#dc2626";
                        const blueColor = "#2563eb";
                        const yellowColor = "#f59e0b";
                        const safeNumberSet = DEFAULT_BOARD.safeSquares;
                        const TRACK_LEN = DEFAULT_BOARD.trackLength;
                        const displayNoForTrackNumber = (trackNumber: number) => {
                          const trackIndex = trackNumber - 1;
                          return ((TRACK_LEN - trackIndex) % TRACK_LEN) + 1;
                        };

                        for (const cell of cells) {
                          if (cell.label == null) {
                            switch (cell.lane) {
                              case "green":
                                cell.fill = greenColor;
                                break;
                              case "red":
                                cell.fill = redColor;
                                break;
                              case "blue":
                                cell.fill = blueColor;
                                break;
                              case "yellow":
                                cell.fill = yellowColor;
                                break;
                              default:
                                // No lane classification => keep white.
                                break;
                            }
                          } else {
                            // Track squares: classic board uses light-gray backgrounds.
                            cell.fill = "#e5e7eb";
                          }
                        }

                        for (const cell of cells) {
                          tiles.push(cellRect(cell.c, cell.r, cell.fill, `t-${cell.c}-${cell.r}`));
                          if (cell.label == null) continue;

                          const x = cellX(cell.c) + cellW / 2;
                          const y = cellY(cell.r) + cellH / 2;

                          // Safe squares: white-circle icon.
                          if (safeNumberSet.has(cell.label)) {
                            safeIcons.push(
                              <circle
                                key={`safe-${cell.c}-${cell.r}`}
                                cx={x}
                                cy={y}
                                r={cellMin * 0.18}
                                fill="#ffffff"
                                stroke={gridStroke}
                                strokeWidth={Math.max(0.9, cellMin * 0.06)}
                                opacity={0.98}
                              />
                            );
                          }

                          // Keep numbering as a small corner hint (helps debugging), not as a dominant UI element.
                          const nx = cellX(cell.c) + cellW - cellMin * 0.12;
                          const ny = cellY(cell.r) + cellH - cellMin * 0.12;
                          labels.push(
                            <text
                              key={`num-${cell.c}-${cell.r}`}
                              x={nx}
                              y={ny}
                              textAnchor="end"
                              dominantBaseline="alphabetic"
                              fontSize={cellMin * 0.22}
                              fill="#111827"
                              opacity={0.65}
                            >
                              {displayNoForTrackNumber(cell.label)}
                            </text>
                          );
                        }

                        const clipId = "playClip";
                        const clipTL = "cornerTL";
                        const clipTR = "cornerTR";
                        const clipBL = "cornerBL";
                        const clipBR = "cornerBR";

                        const cornerR = Math.max(gridW, gridH) * 0.55;
                        const cornerOffset = cellMin * 0.35;
                        const circleTL = { x: gridX + cornerOffset, y: gridY + cornerOffset, fill: "#16a34a" };
                        const circleTR = { x: gridX + gridW - cornerOffset, y: gridY + cornerOffset, fill: "#dc2626" };
                        const circleBL = { x: gridX + cornerOffset, y: gridY + gridH - cornerOffset, fill: "#f59e0b" };
                        const circleBR = { x: gridX + gridW - cornerOffset, y: gridY + gridH - cornerOffset, fill: "#2563eb" };

                        const homeW = cellW * bandStart;
                        const homeH = cellH * bandStart;
                        const homeR = Math.max(4, cellMin * 0.7);
                        const homes = (
                          <g>
                            {/* green (top-left) */}
                            <rect x={cellX(0)} y={cellY(0)} width={homeW} height={homeH} rx={homeR} ry={homeR} fill="#16a34a" />
                            {/* red (top-right) */}
                            <rect x={cellX(bandStart + band)} y={cellY(0)} width={homeW} height={homeH} rx={homeR} ry={homeR} fill="#dc2626" />
                            {/* yellow (bottom-left) */}
                            <rect x={cellX(0)} y={cellY(bandStart + band)} width={homeW} height={homeH} rx={homeR} ry={homeR} fill="#f59e0b" />
                            {/* blue (bottom-right) */}
                            <rect
                              x={cellX(bandStart + band)}
                              y={cellY(bandStart + band)}
                              width={homeW}
                              height={homeH}
                              rx={homeR}
                              ry={homeR}
                              fill="#2563eb"
                            />
                          </g>
                        );

                        const laneFill = (lane: TurnLane) =>
                          lane === "green" ? "#16a34a" : lane === "red" ? "#dc2626" : lane === "blue" ? "#2563eb" : "#f59e0b";

                        const homeOrigin = (lane: TurnLane): { x: number; y: number } => {
                          if (lane === "green") return { x: cellX(0), y: cellY(0) };
                          if (lane === "red") return { x: cellX(bandStart + band), y: cellY(0) };
                          if (lane === "yellow") return { x: cellX(0), y: cellY(bandStart + band) };
                          return { x: cellX(bandStart + band), y: cellY(bandStart + band) };
                        };

                        const pieceRadius = Math.max(2, cellMin * 0.42);
                        const pieceRim = "#111827";
                        const pieceRimW = Math.max(1.2, cellMin * 0.11);
                        const pieceShadowId = "pieceShadow";

                        const posStackKey = (owner: TurnLane, pos: Position): string => {
                          if (pos.kind === "track") {
                            const ti = Number(pos.trackNumber ?? 1) - 1;
                            return `track:${ti}`;
                          }
                          if (pos.kind === "home") {
                            return `home:${owner}:${Number(pos.offset ?? 0)}`;
                          }
                          if (pos.kind === "goal") {
                            return `goal:${owner}`;
                          }
                          // Yard already has distinct slots; no stack offset needed.
                          return `yard:${owner}`;
                        };

                        const piecesByStack = new Map<string, PieceId[]>();
                        for (const p of Object.values(game.pieces)) {
                          const id = p.id as PieceId;
                          const owner = p.owner as TurnLane;
                          const key = p.pos.kind === "yard" ? `yard:${id}` : posStackKey(owner, p.pos);
                          const arr = piecesByStack.get(key) ?? [];
                          arr.push(id);
                          piecesByStack.set(key, arr);
                        }
                        for (const [, arr] of piecesByStack) {
                          arr.sort();
                        }

                        const stackMetaById = new Map<PieceId, { idx: number; count: number }>();
                        for (const [, arr] of piecesByStack) {
                          for (let i = 0; i < arr.length; i += 1) {
                            stackMetaById.set(arr[i], { idx: i, count: arr.length });
                          }
                        }

                        const stackOffset = (id: PieceId): { dx: number; dy: number } => {
                          const meta = stackMetaById.get(id);
                          if (!meta || meta.count <= 1) return { dx: 0, dy: 0 };
                          const step = cellMin * 0.16;
                          // Diagonal fan-out so overlapped pieces remain distinguishable.
                          const pattern: Array<{ dx: number; dy: number }> = [
                            { dx: -1, dy: -1 },
                            { dx: 1, dy: -1 },
                            { dx: -1, dy: 1 },
                            { dx: 1, dy: 1 },
                          ];
                          const p = pattern[meta.idx % pattern.length];
                          const layer = Math.floor(meta.idx / pattern.length) + 1;
                          return { dx: p.dx * step * layer, dy: p.dy * step * layer };
                        };

                        const pieceTokens = (
                          <g>
                            {Object.values(game.pieces)
                              .slice()
                              .sort((a, b) => {
                                // Draw stacked pieces in stable order; later items appear on top.
                                const ai = stackMetaById.get(a.id as PieceId)?.idx ?? 0;
                                const bi = stackMetaById.get(b.id as PieceId)?.idx ?? 0;
                                if (ai !== bi) return ai - bi;
                                return String(a.id).localeCompare(String(b.id));
                              })
                              .map((p) => {
                              const id = p.id as PieceId;
                              const owner = p.owner as TurnLane;

                              const n = Number(id.split("-")[1]);
                              const idx = Number.isFinite(n) ? Math.max(0, n - 1) : 0;
                              const gx = idx % 2;
                              const gy = Math.floor(idx / 2);

                              const isMovable = movableSet.has(id);
                              const fill = laneFill(owner);

                              const homeLength = DEFAULT_BOARD.homeLength;
                              const homeMidC = bandStart + 1;
                              const homeMidR = bandStart + 1;
                              const homeStepIndex = (offset: number) => Math.max(0, Math.min(homeLength - 1, (homeLength - 1) - offset));
                              const homeCell = (lane: TurnLane, offset: number): { r: number; c: number } => {
                                const i = homeStepIndex(offset);
                                if (lane === "green") return { r: (bandStart - 1) - i, c: homeMidC };
                                if (lane === "red") return { r: homeMidR, c: (bandStart + band) + i };
                                if (lane === "blue") return { r: (bandStart + band) + i, c: homeMidC };
                                return { r: homeMidR, c: (bandStart - 1) - i };
                              };

                              let px = cx;
                              let py = cy;

                              if (p.pos.kind === "yard") {
                                const origin = homeOrigin(owner);
                                const pad = Math.max(2, cellMin * 0.55);
                                const dx = (homeW - pad * 2) / 3;
                                const dy = (homeH - pad * 2) / 3;
                                px = origin.x + pad + dx * (1 + gx);
                                py = origin.y + pad + dy * (1 + gy);
                              } else if (p.pos.kind === "track") {
                                if (track.length > 0) {
                                  const ti = p.pos.trackNumber - 1;
                                  const cell = track[Math.max(0, Math.min(track.length - 1, ti))];
                                  px = cellX(cell.c) + cellW / 2;
                                  py = cellY(cell.r) + cellH / 2;
                                }
                              } else if (p.pos.kind === "home") {
                                const cell = homeCell(owner, p.pos.offset);
                                px = cellX(cell.c) + cellW / 2;
                                py = cellY(cell.r) + cellH / 2;
                              } else if (p.pos.kind === "goal") {
                                const s = cellMin * 0.22;
                                const ox = (gx === 0 ? -1 : 1) * s;
                                const oy = (gy === 0 ? -1 : 1) * s;
                                px = cx + ox;
                                py = cy + oy;
                              }

                              const off = stackOffset(id);
                              px += off.dx;
                              py += off.dy;

                              return (
                                <g key={id}>
                                  {isMovable ? (
                                    <circle cx={px} cy={py} r={pieceRadius + cellMin * 0.35} fill="none" stroke={laneFill(currentTurn)} strokeWidth={Math.max(2, cellMin * 0.18)} opacity={0.9}>
                                      <animate attributeName="opacity" values="0.2;0.95;0.2" dur="1.0s" repeatCount="indefinite" />
                                    </circle>
                                  ) : null}

                                  <g
                                    filter={`url(#${pieceShadowId})`}
                                    style={{ cursor: isMovable ? "pointer" : "default" }}
                                    onClick={isMovable ? () => onPieceClick(id) : undefined}
                                  >
                                    {/* rim */}
                                    <circle cx={px} cy={py} r={pieceRadius} fill={fill} stroke={pieceRim} strokeWidth={pieceRimW} />
                                    {/* inner body */}
                                    <circle cx={px} cy={py} r={pieceRadius * 0.72} fill={fill} opacity={0.92} />
                                    {/* highlight */}
                                    <circle cx={px - pieceRadius * 0.25} cy={py - pieceRadius * 0.25} r={pieceRadius * 0.22} fill="#ffffff" opacity={0.35} />
                                  </g>
                                </g>
                              );
                            })}
                          </g>
                        );

                        return (
                          <>
                            {/* plain background */}
                            <rect x={boardX} y={boardY} width={boardW} height={boardH} rx={radius} fill="#f8fafc" />

                            {/* play area */}
                            <defs>
                              <clipPath id={clipId}>
                                <rect x={gridX} y={gridY} width={gridW} height={gridH} rx={6} />
                              </clipPath>
                    <filter id="pieceShadow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="2.5" stdDeviation="1.6" floodColor="#000" floodOpacity="0.28" />
                    </filter>

                              {/* quadrant clips (avoid corner circle color bleeding) */}
                              <clipPath id={clipTL}>
                                <rect x={gridX} y={gridY} width={gridW / 2} height={gridH / 2} />
                              </clipPath>
                              <clipPath id={clipTR}>
                                <rect x={gridX + gridW / 2} y={gridY} width={gridW / 2} height={gridH / 2} />
                              </clipPath>
                              <clipPath id={clipBL}>
                                <rect x={gridX} y={gridY + gridH / 2} width={gridW / 2} height={gridH / 2} />
                              </clipPath>
                              <clipPath id={clipBR}>
                                <rect x={gridX + gridW / 2} y={gridY + gridH / 2} width={gridW / 2} height={gridH / 2} />
                              </clipPath>
                            </defs>

                            {/* Everything inside the board is clipped to the play area */}
                            <g clipPath={`url(#${clipId})`}>
                              {/* inner background */}
                              <rect x={gridX} y={gridY} width={gridW} height={gridH} rx={6} fill="#ffffff" />

                              {/* big corner circles (decor) */}
                              <g opacity={0.95}>
                                <g clipPath={`url(#${clipTL})`}>
                                  <circle cx={circleTL.x} cy={circleTL.y} r={cornerR} fill={circleTL.fill} />
                                </g>
                                <g clipPath={`url(#${clipTR})`}>
                                  <circle cx={circleTR.x} cy={circleTR.y} r={cornerR} fill={circleTR.fill} />
                                </g>
                                <g clipPath={`url(#${clipBL})`}>
                                  <circle cx={circleBL.x} cy={circleBL.y} r={cornerR} fill={circleBL.fill} />
                                </g>
                                <g clipPath={`url(#${clipBR})`}>
                                  <circle cx={circleBR.x} cy={circleBR.y} r={cornerR} fill={circleBR.fill} />
                                </g>
                              </g>

                              {/* homes */}
                              {homes}

                              {/* current turn highlight (board effect) */}
                              {(() => {
                                const strokeColor =
                                  currentTurn === "green"
                                    ? "#16a34a"
                                    : currentTurn === "red"
                                      ? "#dc2626"
                                      : currentTurn === "blue"
                                        ? "#2563eb"
                                        : "#f59e0b";

                                const padC = 0.4;
                                const x =
                                  currentTurn === "red" || currentTurn === "blue"
                                    ? cellX(bandStart + band) - cellW * padC
                                    : cellX(0) - cellW * padC;
                                const y =
                                  currentTurn === "yellow" || currentTurn === "blue"
                                    ? cellY(bandStart + band) - cellH * padC
                                    : cellY(0) - cellH * padC;
                                const w = homeW + cellW * padC * 2;
                                const h = homeH + cellH * padC * 2;

                                return (
                                  <rect
                                    x={x}
                                    y={y}
                                    width={w}
                                    height={h}
                                    rx={homeR + 4}
                                    ry={homeR + 4}
                                    fill="none"
                                    stroke={strokeColor}
                                    strokeWidth={Math.max(2, cellMin * 0.22)}
                                    opacity={0.9}
                                  >
                                    <animate attributeName="opacity" values="0.35;0.95;0.35" dur="1.2s" repeatCount="indefinite" />
                                  </rect>
                                );
                              })()}

                              {/* road backing */}
                              <rect
                                x={cellX(bandStart)}
                                y={gridY}
                                width={cellW * band}
                                height={gridH}
                                fill="#ffffff"
                                opacity={0.85}
                              />
                              <rect
                                x={gridX}
                                y={cellY(bandStart)}
                                width={gridW}
                                height={cellH * band}
                                fill="#ffffff"
                                opacity={0.85}
                              />

                              {/* road tiles */}
                              {tiles}

                              {/* safe markers */}
                              {safeIcons}

                              {/* center finish */}
                              <g filter="url(#softShadow)">
                                <polygon
                                  points={`${centerX},${centerY} ${centerX + centerW},${centerY} ${cx},${cy}`}
                                  fill="#16a34a"
                                  opacity={0.95}
                                />
                                <polygon
                                  points={`${centerX + centerW},${centerY} ${centerX + centerW},${centerY + centerH} ${cx},${cy}`}
                                  fill="#dc2626"
                                  opacity={0.95}
                                />
                                <polygon
                                  points={`${centerX},${centerY + centerH} ${centerX + centerW},${centerY + centerH} ${cx},${cy}`}
                                  fill="#2563eb"
                                  opacity={0.95}
                                />
                                <polygon
                                  points={`${centerX},${centerY} ${centerX},${centerY + centerH} ${cx},${cy}`}
                                  fill="#f59e0b"
                                  opacity={0.95}
                                />
                                <rect x={centerX} y={centerY} width={centerW} height={centerH} fill="none" stroke="#6b7280" strokeWidth={1} opacity={0.55} />
                              </g>

                              {/* numbers */}
                              {labels}

                              {/* pieces (render on top of tiles) */}
                              {pieceTokens}

                              {/* center dice overlay */}
                              {pendingRoll ? (
                                <g transform={`translate(${cx},${cy})`}>
                                  <g
                                    key={diceAnim.key}
                                    className={isRolling ? "diceRoll" : undefined}
                                    style={
                                      {
                                        // Use CSS variables so Phase 2/3 can extend styles without changing markup.
                                        "--dice-dur": `${diceAnim.durMs}`,
                                        "--dice-spin-70": `${diceAnim.spin70Deg}deg`,
                                        "--dice-spin-100": `${diceAnim.spinDeg}deg`,
                                        "--dice-bounce": `${Math.max(6, cellMin * 0.55)}px`,
                                      } as React.CSSProperties
                                    }
                                  >
                                    <rect
                                      x={-cellMin * 2.2}
                                      y={-cellMin * 2.2}
                                      width={cellMin * 4.4}
                                      height={cellMin * 4.4}
                                      rx={cellMin * 0.9}
                                      fill="#ffffff"
                                      stroke={laneFill(pendingRoll.turn)}
                                      strokeWidth={Math.max(2, cellMin * 0.22)}
                                      filter="url(#softShadow)"
                                      opacity={0.98}
                                    />
                                    <text
                                      x={0}
                                      y={0}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fontSize={cellMin * 1.9}
                                      fill={laneFill(pendingRoll.turn)}
                                      fontWeight={800}
                                    >
                                      {pendingRoll.status === "rolling" ? diceFace : (pendingRoll.value ?? diceFace)}
                                    </text>
                                  </g>
                                </g>
                              ) : null}
                            </g>

                            {/* play area border (not clipped) */}
                            <rect x={gridX} y={gridY} width={gridW} height={gridH} rx={6} fill="none" stroke="#cbd5e1" strokeWidth={1.2} />
                          </>
                        );
                      })()}
                    </>
                  );
                })()}
          </svg>
        </div>
      </div>

      {/* Dice controls overlay: use gutters in landscape, bottom in portrait. */}
      {isLandscape ? (
        <div className="absolute top-1/2 left-[calc(50%+50vmin+12px)] -translate-y-1/2 z-10">
          <div className="flex flex-col items-stretch gap-3 rounded-2xl border border-neutral-200 bg-white/85 backdrop-blur px-3 py-3">
            <div className="text-center text-sm text-neutral-900 font-semibold">
              {pendingRoll?.status === "rolling" ? diceFace : (pendingRoll?.value ?? game.dice ?? lastDice ?? "-")}
            </div>
            <button
              type="button"
              onClick={rollDice}
              disabled={!!pendingRoll || !!game.bonusPending || isCpuTurn || game.phase !== "ROLL"}
              className={
                "shrink-0 rounded-xl px-5 py-3 text-sm font-semibold text-white " +
                (pendingRoll || game.bonusPending || isCpuTurn ? "bg-neutral-400" : "bg-neutral-900 active:bg-neutral-800")
              }
            >
              サイコロを振る
            </button>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10">
          <div className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white/85 backdrop-blur px-3 py-2">
            <div className="min-w-6 text-center text-sm text-neutral-900 font-semibold">
              {pendingRoll?.status === "rolling" ? diceFace : (pendingRoll?.value ?? game.dice ?? lastDice ?? "-")}
            </div>
            <button
              type="button"
              onClick={rollDice}
              disabled={!!pendingRoll || !!game.bonusPending || isCpuTurn || game.phase !== "ROLL"}
              className={
                "shrink-0 rounded-xl px-5 py-3 text-sm font-semibold text-white " +
                (pendingRoll || game.bonusPending || isCpuTurn ? "bg-neutral-400" : "bg-neutral-900 active:bg-neutral-800")
              }
            >
              サイコロを振る
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default function GamePage() {
  return (
    <Suspense
      fallback={
        <main className="fixed inset-0 grid place-items-center bg-neutral-50 text-sm text-neutral-700">
          読み込み中…
        </main>
      }
    >
      <GamePageWithSearchParams />
    </Suspense>
  );
}

function GamePageWithSearchParams() {
  const searchParams = useSearchParams();
  const modeParam = searchParams.get("mode");
  const mode = useMemo<Mode>(() => parseMode(modeParam), [modeParam]);
  return <GameClient key={mode} mode={mode} />;
}
