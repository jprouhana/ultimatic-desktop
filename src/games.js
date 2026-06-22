// Game rules for every Ultimatic mode. No DOM here — pure state machines the
// UI drives. Two players: A (mark X) and B (mark O). Each game exposes a small
// uniform surface (over / winner / turn / winLine / play / undo) so app.js can
// render any mode the same way.
(function () {
  "use strict";

  // All winning lines (rows, columns, both main diagonals) for a dim×dim grid
  // indexed row-major 0..dim*dim-1. dim=3 → the 8 classic tic-tac-toe lines.
  function buildLines(dim) {
    const lines = [];
    for (let r = 0; r < dim; r++) {
      const row = [], col = [];
      for (let k = 0; k < dim; k++) {
        row.push(r * dim + k);
        col.push(k * dim + r);
      }
      lines.push(row, col);
    }
    const d1 = [], d2 = [];
    for (let k = 0; k < dim; k++) {
      d1.push(k * dim + k);
      d2.push(k * dim + (dim - 1 - k));
    }
    lines.push(d1, d2);
    return lines;
  }

  // First completed line of `sym` in a flat dim×dim array, given its lines.
  function lineIn(a, sym, lines) {
    for (const L of lines) {
      if (L.every((i) => a[i] === sym)) return L;
    }
    return null;
  }

  const other = (p) => (p === "A" ? "B" : "A");
  const symOf = (p) => (p === "A" ? "X" : "O");

  // ── Generic grid game ────────────────────────────────────────────────────
  // Powers Classic, Forget, Misère, Wild, Gomoku, Order & Chaos via cfg flags:
  //   rows, cols, k         board size + win length
  //   wild                  mover chooses which mark to place
  //   misere                completing a line LOSES
  //   pieceLimit            keep only N marks per player (oldest fades away)
  //   roles                 A = Order (wants a line), B = Chaos (wants none)
  class GridGame {
    constructor(cfg) {
      this.kind = "grid";
      this.cfg = cfg;
      this.rows = cfg.rows;
      this.cols = cfg.cols;
      this.k = cfg.k;
      this.n = cfg.rows * cfg.cols;
      this.wild = !!cfg.wild;
      this.misere = !!cfg.misere;
      this.pieceLimit = cfg.pieceLimit || null;
      this.roles = !!cfg.roles;
      this.reset();
    }

    reset() {
      // each cell: null | { sym:'X'|'O', owner:'A'|'B', order:int }
      this.cells = new Array(this.n).fill(null);
      this.turn = "A";
      this.over = false;
      this.winner = null; // 'A' | 'B' | 'draw' | null
      this.winLine = null;
      this.last = null;
      this.seq = 0;
      this.history = [];
    }

    legal(i) {
      return !this.over && i >= 0 && i < this.n && !this.cells[i];
    }

    cellsOf(player) {
      const out = [];
      for (let i = 0; i < this.n; i++) if (this.cells[i] && this.cells[i].owner === player) out.push(i);
      return out;
    }

    // For Forget: the mark that will vanish on the current player's next move.
    fadingIndex() {
      if (!this.pieceLimit || this.over) return -1;
      const mine = this.cellsOf(this.turn);
      if (mine.length < this.pieceLimit) return -1;
      mine.sort((a, b) => this.cells[a].order - this.cells[b].order);
      return mine[0];
    }

    full() {
      for (let i = 0; i < this.n; i++) if (!this.cells[i]) return false;
      return true;
    }

    lineThrough(i, sym) {
      const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
      const r0 = Math.floor(i / this.cols);
      const c0 = i % this.cols;
      for (const [dr, dc] of dirs) {
        const run = [i];
        for (const s of [1, -1]) {
          let r = r0 + dr * s, c = c0 + dc * s;
          while (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
            const j = r * this.cols + c;
            if (this.cells[j] && this.cells[j].sym === sym) {
              run.push(j);
              r += dr * s;
              c += dc * s;
            } else break;
          }
        }
        if (run.length >= this.k) return run.sort((a, b) => a - b);
      }
      return null;
    }

    snapshot() {
      return {
        cells: this.cells.map((c) => (c ? { ...c } : null)),
        turn: this.turn,
        over: this.over,
        winner: this.winner,
        winLine: this.winLine ? this.winLine.slice() : null,
        last: this.last,
        seq: this.seq,
      };
    }

    canUndo() {
      return this.history.length > 0;
    }

    undo() {
      if (!this.history.length) return false;
      const s = this.history.pop();
      Object.assign(this, s);
      return true;
    }

    // sym is required only in wild modes; ignored otherwise.
    play(i, sym) {
      if (!this.legal(i)) return null;
      const player = this.turn;
      if (!this.wild) sym = symOf(player);
      this.history.push(this.snapshot());

      this.cells[i] = { sym, owner: player, order: this.seq++ };
      this.last = i;

      let removed = null;
      if (this.pieceLimit) {
        const mine = this.cellsOf(player);
        if (mine.length > this.pieceLimit) {
          mine.sort((a, b) => this.cells[a].order - this.cells[b].order);
          removed = mine[0];
          this.cells[removed] = null;
        }
      }

      const line = this.lineThrough(i, sym);
      if (this.roles) {
        if (line) {
          this.over = true;
          this.winner = "A"; // Order
          this.winLine = line;
        } else if (this.full()) {
          this.over = true;
          this.winner = "B"; // Chaos survives
        }
      } else if (line) {
        this.over = true;
        this.winLine = line;
        this.winner = this.misere ? other(player) : player;
      } else if (this.full() && !this.pieceLimit) {
        this.over = true;
        this.winner = "draw";
      }

      if (!this.over) this.turn = other(player);
      return { i, sym, removed, line, by: player };
    }
  }

  // ── Ultimate (meta) tic-tac-toe ───────────────────────────────────────────
  class UltimateGame {
    constructor(opts) {
      this.kind = "ultimate";
      this.dim = (opts && opts.dim) || 3; // meta + small boards are dim×dim
      this.nb = this.dim * this.dim;      // board count == cells per board
      this.lines = buildLines(this.dim);  // win lines for a dim×dim grid
      this.forget = !!(opts && opts.forget); // per-board memory of N marks each
      this.limit = (opts && opts.limit) || 3;
      this.reset();
    }

    reset() {
      this.mini = Array.from({ length: this.nb }, () => new Array(this.nb).fill(null)); // 'X'|'O'|null
      // placement sequence per cell (for Forget: the oldest of a player fades)
      this.order = Array.from({ length: this.nb }, () => new Array(this.nb).fill(0));
      this.seq = 0;
      this.miniWinner = new Array(this.nb).fill(null); // 'X'|'O'|'draw'|null
      this.miniLine = new Array(this.nb).fill(null);
      this.active = null; // null = play any open board
      this.turn = "A";
      this.over = false;
      this.winner = null;
      this.winLine = null; // meta line of board indices
      this.last = null; // [mini, cell]
      this.history = [];
    }

    // For Forget Ultimate: cells that will vanish on the current player's next
    // move, keyed as m*nb+c. Computed for every board they could legally enter.
    fadingSet() {
      const out = new Set();
      if (!this.forget || this.over) return out;
      const s = symOf(this.turn);
      for (let m = 0; m < this.nb; m++) {
        if (this.boardDone(m)) continue;
        if (this.active != null && this.active !== m) continue;
        const mine = [];
        for (let c = 0; c < this.nb; c++) if (this.mini[m][c] === s) mine.push(c);
        if (mine.length >= this.limit) {
          mine.sort((a, b) => this.order[m][a] - this.order[m][b]);
          out.add(m * this.nb + mine[0]);
        }
      }
      return out;
    }

    boardDone(m) {
      return this.miniWinner[m] != null;
    }

    legal(m, c) {
      if (this.over) return false;
      if (this.boardDone(m)) return false;
      if (this.mini[m][c]) return false;
      if (this.active != null && this.active !== m) return false;
      return true;
    }

    snapshot() {
      return {
        mini: this.mini.map((b) => b.slice()),
        order: this.order.map((b) => b.slice()),
        seq: this.seq,
        miniWinner: this.miniWinner.slice(),
        miniLine: this.miniLine.map((l) => (l ? l.slice() : null)),
        active: this.active,
        turn: this.turn,
        over: this.over,
        winner: this.winner,
        winLine: this.winLine ? this.winLine.slice() : null,
        last: this.last ? this.last.slice() : null,
      };
    }

    canUndo() {
      return this.history.length > 0;
    }

    undo() {
      if (!this.history.length) return false;
      Object.assign(this, this.history.pop());
      return true;
    }

    metaResult() {
      // No meta line: decide by number of boards won (tiebreak), else draw.
      let x = 0, o = 0;
      for (const w of this.miniWinner) {
        if (w === "X") x++;
        else if (w === "O") o++;
      }
      return x > o ? "A" : o > x ? "B" : "draw";
    }

    play(m, c) {
      if (!this.legal(m, c)) return null;
      this.history.push(this.snapshot());
      const mover = this.turn;
      const s = symOf(this.turn);
      this.mini[m][c] = s;
      this.order[m][c] = ++this.seq;
      this.last = [m, c];

      // Forget: keep only `limit` of this player's marks in this board; the
      // oldest fades before we test for a line (a win can't use a faded mark).
      let removed = null;
      if (this.forget) {
        const mine = [];
        for (let i = 0; i < this.nb; i++) if (this.mini[m][i] === s) mine.push(i);
        if (mine.length > this.limit) {
          mine.sort((a, b) => this.order[m][a] - this.order[m][b]);
          removed = mine[0];
          this.mini[m][removed] = null;
          this.order[m][removed] = 0;
        }
      }

      const ln = lineIn(this.mini[m], s, this.lines);
      if (ln) {
        this.miniWinner[m] = s;
        this.miniLine[m] = ln;
      } else if (this.mini[m].every((x) => x)) {
        this.miniWinner[m] = "draw";
      }

      const metaSyms = this.miniWinner.map((w) => (w === "X" || w === "O" ? w : null));
      const metaLine = lineIn(metaSyms, s, this.lines);
      if (metaLine) {
        this.over = true;
        this.winner = this.turn;
        this.winLine = metaLine;
      } else if (this.miniWinner.every((w) => w)) {
        this.over = true;
        this.winner = this.metaResult();
      }

      this.active = this.boardDone(c) ? null : c;
      if (!this.over) this.turn = other(this.turn);
      return { m, c, s, by: mover, removed };
    }
  }

  // ── Mode registry ──────────────────────────────────────────────────────────
  const MODES = [
    {
      id: "ultimate",
      name: "Ultimate",
      kind: "ultimate",
      icon: "▦",
      tag: "the big one",
      blurb: "Nine boards in one. Where you move sends your opponent.",
      rules: [
        "The board is a 3×3 grid of nine small tic-tac-toe boards.",
        "Win a small board to claim its square on the big board.",
        "Win three small boards in a row to win the game.",
        "Your move decides which board your opponent must play next: the cell you pick maps to that board.",
        "If you're sent to a board that's already finished, you may play in any open board.",
        "Drawn small boards count for nobody; if every board fills, the most boards won wins.",
      ],
    },
    {
      id: "ultimate4",
      name: "Ultimate 4×4",
      kind: "ultimate",
      dim: 4,
      icon: "▥",
      tag: "sixteen boards",
      blurb: "Ultimate scaled up: a 4×4 grid of 4×4 boards. Win a board with four in a row, the game with four boards in a row.",
      rules: [
        "A 4×4 grid of sixteen small 4×4 boards.",
        "Win a small board by getting four in a row inside it.",
        "Win the game by claiming four small boards in a row on the big grid.",
        "Your move's cell still decides which board your opponent must play next.",
        "Sent to a finished board? Play in any open board.",
      ],
    },
    {
      id: "ultimate5",
      name: "Ultimate 5×5",
      kind: "ultimate",
      dim: 5,
      icon: "▦",
      tag: "twenty-five boards",
      blurb: "The colossal one: a 5×5 grid of 5×5 boards. Five in a row to win a board, five boards in a row to win it all.",
      rules: [
        "A 5×5 grid of twenty-five small 5×5 boards.",
        "Win a small board by getting five in a row inside it.",
        "Win the game by claiming five small boards in a row on the big grid.",
        "Your move's cell decides which board your opponent must play next.",
        "Sent to a finished board? Play in any open board.",
      ],
    },
    {
      id: "classic",
      name: "Classic",
      kind: "grid",
      icon: "✕",
      tag: "the original",
      blurb: "Plain old 3×3. Three in a row wins.",
      rows: 3, cols: 3, k: 3,
      rules: ["Take turns placing your mark.", "First to three in a row — across, down, or diagonal — wins.", "Fill the board with no line and it's a draw."],
    },
    {
      id: "forget",
      name: "Forget Ultimate",
      kind: "ultimate",
      forget: true,
      pieceLimit: 3,
      icon: "⟳",
      tag: "ultimate, but fading",
      blurb: "Ultimate tic-tac-toe where every small board forgets: keep only three marks each, and your oldest fades away.",
      rules: [
        "All the normal Ultimate rules apply — win three small boards in a row.",
        "But inside each small board you may keep only three of your marks.",
        "Place a fourth mark in a board and your oldest there vanishes (it glows faintly first).",
        "Small boards can never draw, so the fight for each one never truly settles.",
        "Once a board is won it freezes — its marks stop fading.",
      ],
    },
    {
      id: "misere",
      name: "Misère",
      kind: "grid",
      icon: "⊘",
      tag: "avoid the line",
      blurb: "Reverse rules: make three in a row and you LOSE.",
      rows: 3, cols: 3, k: 3, misere: true,
      rules: ["Take turns placing your mark.", "Making three in a row LOSES the game.", "Force your opponent into completing a line."],
    },
    {
      id: "wild",
      name: "Wild",
      kind: "grid",
      icon: "✶",
      tag: "any mark, any time",
      blurb: "On your turn, place an X or an O. Complete any three in a row to win.",
      rows: 3, cols: 3, k: 3, wild: true,
      rules: [
        "On your turn you may place EITHER an X or an O.",
        "Whoever completes any three-in-a-row — of either mark — wins.",
        "Watch out: you can hand the win to your opponent.",
      ],
    },
    {
      id: "gomoku",
      name: "Gomoku",
      kind: "grid",
      icon: "⬡",
      tag: "five in a row",
      blurb: "A big 15×15 board. First to line up five wins.",
      rows: 15, cols: 15, k: 5,
      rules: ["Take turns placing your stone on the 15×15 grid.", "First to get five in a row — any direction — wins.", "Lots of room, lots of traps."],
    },
    {
      id: "chaos",
      name: "Order & Chaos",
      kind: "grid",
      icon: "◳",
      tag: "asymmetric duel",
      blurb: "Both place X or O. Order wants a five-line; Chaos wants to stop it.",
      rows: 6, cols: 6, k: 5, wild: true, roles: true,
      rules: [
        "Played on a 6×6 board; both players may place either mark.",
        "Player 1 is ORDER and wins by making five in a row (of one mark).",
        "Player 2 is CHAOS and wins if the board fills with no five-in-a-row.",
        "A five-line of either mark counts for Order — even one Chaos builds by accident.",
      ],
    },
  ];

  function createGame(mode) {
    if (mode.kind === "ultimate") return new UltimateGame({ forget: mode.forget, limit: mode.pieceLimit, dim: mode.dim });
    return new GridGame(mode);
  }

  window.Games = { MODES, createGame, symOf, other };
})();
