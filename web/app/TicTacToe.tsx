"use client";

import { useState } from "react";

type Player = "X" | "O";
type Cell = Player | null;

const WINNING_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function getWinner(board: Cell[]): { player: Player; line: number[] } | null {
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { player: board[a] as Player, line };
    }
  }
  return null;
}

export default function TicTacToe() {
  const [board, setBoard] = useState<Cell[]>(Array(9).fill(null));
  const [xIsNext, setXIsNext] = useState(true);

  const winnerInfo = getWinner(board);
  const isDraw = !winnerInfo && board.every((cell) => cell !== null);
  const currentPlayer: Player = xIsNext ? "X" : "O";

  function handleCellClick(index: number) {
    if (board[index] || winnerInfo) return;
    const nextBoard = board.slice();
    nextBoard[index] = currentPlayer;
    setBoard(nextBoard);
    setXIsNext(!xIsNext);
  }

  function handleReset() {
    setBoard(Array(9).fill(null));
    setXIsNext(true);
  }

  let status: string;
  if (winnerInfo) {
    status = `${winnerInfo.player} wins!`;
  } else if (isDraw) {
    status = "It's a draw!";
  } else {
    status = `${currentPlayer}'s turn`;
  }

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-1 w-full max-w-3xl flex-col items-center justify-center gap-8 py-32 px-16">
        <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
          Tic Tac Toe
        </h1>

        <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
          {status}
        </p>

        <div className="grid grid-cols-3 gap-2">
          {board.map((cell, index) => {
            const isWinningCell = winnerInfo?.line.includes(index);
            return (
              <button
                key={index}
                onClick={() => handleCellClick(index)}
                disabled={!!cell || !!winnerInfo}
                className={`flex h-24 w-24 items-center justify-center rounded-lg border border-black/[.08] text-4xl font-bold transition-colors dark:border-white/[.145] ${
                  isWinningCell
                    ? "bg-zinc-200 dark:bg-zinc-800"
                    : "bg-white hover:bg-black/[.04] dark:bg-black dark:hover:bg-[#1a1a1a]"
                } ${cell === "X" ? "text-blue-600 dark:text-blue-400" : "text-rose-600 dark:text-rose-400"}`}
              >
                {cell}
              </button>
            );
          })}
        </div>

        <button
          onClick={handleReset}
          className="flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-base font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          New Game
        </button>
      </main>
    </div>
  );
}
