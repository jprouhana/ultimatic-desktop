# Ultimatic

A local, two-player tic-tac-toe arcade for the desktop. Hot-seat only — no AI,
no network, no accounts. Just you and a friend on one screen.

Built with Electron and vanilla JS (no framework, no build step for the
renderer).

## Modes

| Mode | Board | The twist |
|------|-------|-----------|
| **Ultimate** | 9 × mini 3×3 | Where you move sends your opponent to the matching board. Win three boards in a row. |
| **Ultimate 4×4** | 16 × mini 4×4 | Ultimate scaled up — four in a row to win a board, four boards in a row to win the game. |
| **Ultimate 5×5** | 25 × mini 5×5 | The colossal one — five in a row to win a board, five boards in a row to win it all. |
| **Forget Ultimate** | 9 × mini 3×3 | Ultimate, but every small board *forgets* — keep only three marks each; your oldest fades away. Boards never draw. |
| **Classic** | 3×3 | The original. |
| **Misère** | 3×3 | Reverse rules: make three in a row and you *lose*. |
| **Wild** | 3×3 | Place either X or O on your turn. Any three-in-a-row wins. |
| **Gomoku** | 15×15 | Five in a row. |
| **Order & Chaos** | 6×6 | Order wants a five-line; Chaos wants to stop it. Asymmetric duel. |

## Features

- Match scoreboard per mode, persisted between sessions
- Editable player names
- Undo, new round, per-mode rules popover
- Synthesized sound effects (no audio files) — toggleable
- Win animations + confetti
- Keyboard: `Esc` menu · `U` undo · `R` new round · `X`/`O` pick mark in wild modes

## Develop

```sh
npm install
npm start
```

## Build

```sh
npm run dist:linux   # AppImage
npm run dist:win     # NSIS installer + portable
npm run dist:mac     # dmg + zip
```

## License

MIT © John Rouhana
