// Ultimatic UI controller. Owns screen switching, board rendering for both the
// grid games and Ultimate, the match scoreboard, and persistence via the
// preload `ultimatic` store bridge. All logic lives in games.js.
(function () {
  "use strict";

  const { MODES, createGame } = window.Games;
  const $ = (id) => document.getElementById(id);

  // ── persistent store: per-mode scores + player names ──────────────────────
  let store = { names: { A: "Player 1", B: "Player 2" }, scores: {} };
  async function loadStore() {
    try {
      const s = await window.ultimatic.getStore();
      if (s && typeof s === "object") {
        store.names = Object.assign(store.names, s.names || {});
        store.scores = s.scores || {};
        if (typeof s.sound === "boolean") store.sound = s.sound;
      }
    } catch {}
    if (store.sound === false) Sound.setEnabled(false);
  }
  function saveStore() {
    try {
      window.ultimatic.setStore(store);
    } catch {}
  }
  function scoreFor(modeId) {
    if (!store.scores[modeId]) store.scores[modeId] = { A: 0, B: 0, draw: 0 };
    return store.scores[modeId];
  }

  // ── current game state ────────────────────────────────────────────────────
  let mode = null;
  let game = null;
  let wildSym = "X"; // selected mark for wild / order-chaos modes
  let locked = false; // brief input lock during win animation

  // ── menu ──────────────────────────────────────────────────────────────────
  function buildMenu() {
    const grid = $("modeGrid");
    grid.innerHTML = "";
    for (const m of MODES) {
      const card = document.createElement("button");
      card.className = "modeCard" + (m.id === "ultimate" ? " feature" : "");
      card.innerHTML = `
        <div class="mcIcon">${m.icon}</div>
        <div class="mcBody">
          <div class="mcName">${m.name}</div>
          <div class="mcTag">${m.tag}</div>
          <div class="mcBlurb">${m.blurb}</div>
        </div>`;
      card.addEventListener("click", () => startMode(m));
      grid.appendChild(card);
    }
  }

  function showScreen(which) {
    $("menu").hidden = which !== "menu";
    $("game").hidden = which !== "game";
    $("menuBtn").hidden = which === "menu";
  }

  function startMode(m) {
    mode = m;
    game = createGame(m);
    wildSym = "X";
    $("modeTag").textContent = m.name;
    const wild = !!(m.wild || m.roles);
    $("wildPick").hidden = !wild;
    if (wild) setWildSym("X");
    // role labels for Order & Chaos
    $("pA").classList.toggle("role", !!m.roles);
    $("pB").classList.toggle("role", !!m.roles);
    refreshScores();
    refreshNames();
    showScreen("game");
    Sound.click();
    render();
  }

  // ── scoreboard ──────────────────────────────────────────────────────────
  function refreshScores() {
    const s = scoreFor(mode.id);
    $("scoreA").textContent = s.A;
    $("scoreB").textContent = s.B;
    $("scoreD").textContent = s.draw;
  }
  function refreshNames() {
    $("nameA").textContent = store.names.A || "Player 1";
    $("nameB").textContent = store.names.B || "Player 2";
  }
  function nameOf(p) {
    if (mode && mode.roles) return (p === "A" ? store.names.A : store.names.B) + (p === "A" ? " · Order" : " · Chaos");
    return p === "A" ? store.names.A : store.names.B;
  }

  // ── rendering ──────────────────────────────────────────────────────────────
  function render() {
    if (game.kind === "ultimate") renderUltimate();
    else renderGrid();
    renderTurn();
  }

  function renderTurn() {
    const t = $("turnText");
    if (game.over) {
      t.textContent = game.winner === "draw" ? "Draw" : `${nameOf(game.winner)} wins`;
      t.className = game.winner === "draw" ? "" : game.winner === "A" ? "tA" : "tB";
      return;
    }
    let label = `${nameOf(game.turn)}'s turn`;
    if (mode.misere) label += " — avoid three!";
    t.textContent = label;
    t.className = game.turn === "A" ? "tA" : "tB";
    // refresh wild picker color to current player
    $("wildPick").classList.toggle("forB", game.turn === "B");
  }

  // grid: Classic / Forget / Misère / Wild / Gomoku / Order & Chaos
  function renderGrid() {
    const b = $("board");
    b.className = "grid";
    b.classList.toggle("big", game.cols >= 10);
    if (b.dataset.mode !== mode.id) {
      // (re)build cells
      b.dataset.mode = mode.id;
      b.style.setProperty("--cols", game.cols);
      b.style.setProperty("--rows", game.rows);
      b.innerHTML = "";
      for (let i = 0; i < game.n; i++) {
        const cell = document.createElement("button");
        cell.className = "gcell";
        cell.dataset.i = i;
        cell.addEventListener("click", () => onGridClick(i));
        b.appendChild(cell);
      }
    }
    const fading = game.fadingIndex();
    const cells = b.children;
    for (let i = 0; i < game.n; i++) {
      const c = game.cells[i];
      const el = cells[i];
      el.className = "gcell";
      el.textContent = c ? (c.sym === "X" ? "✕" : "◯") : "";
      if (c) el.classList.add(c.sym === "X" ? "x" : "o", "filled");
      if (i === game.last) el.classList.add("last");
      if (i === fading) el.classList.add("fading");
      if (game.winLine && game.winLine.includes(i)) el.classList.add("wincell");
      el.disabled = game.over || !!c;
    }
  }

  function onGridClick(i) {
    if (locked || game.over) return;
    if (!game.legal(i)) {
      Sound.illegal();
      return;
    }
    const res = game.play(i, wildSym);
    if (!res) return;
    if (res.removed != null) Sound.fade();
    Sound.place(res.by);
    render();
    if (game.over) finishGame();
  }

  // ultimate: dim×dim grid of mini dim×dim boards (dim is 3, 4, or 5)
  function renderUltimate() {
    const b = $("board");
    const dim = game.dim;
    const nb = game.nb;
    b.className = "ultimate";
    if (b.dataset.mode !== mode.id || b.children.length !== nb) {
      b.dataset.mode = mode.id;
      b.dataset.dim = dim;
      b.style.gridTemplateColumns = `repeat(${dim}, 1fr)`;
      b.innerHTML = "";
      for (let m = 0; m < nb; m++) {
        const mb = document.createElement("div");
        mb.className = "mini";
        mb.dataset.m = m;
        mb.style.gridTemplateColumns = `repeat(${dim}, 1fr)`;
        for (let c = 0; c < nb; c++) {
          const cell = document.createElement("button");
          cell.className = "ucell";
          cell.dataset.m = m;
          cell.dataset.c = c;
          cell.addEventListener("click", () => onUltClick(m, c));
          mb.appendChild(cell);
        }
        const overlay = document.createElement("div");
        overlay.className = "miniOverlay";
        mb.appendChild(overlay);
        b.appendChild(mb);
      }
    }
    const fading = game.forget ? game.fadingSet() : null;
    for (let m = 0; m < nb; m++) {
      const mb = b.children[m];
      const won = game.miniWinner[m];
      const active = !game.over && (game.active == null ? !won : game.active === m);
      mb.classList.toggle("active", active);
      mb.classList.toggle("won", won === "X" || won === "O");
      mb.classList.toggle("wonX", won === "X");
      mb.classList.toggle("wonO", won === "O");
      mb.classList.toggle("drawn", won === "draw");
      mb.classList.toggle("metawin", !!(game.winLine && game.winLine.includes(m)));
      const overlay = mb.children[nb];
      overlay.textContent = won === "X" ? "✕" : won === "O" ? "◯" : won === "draw" ? "–" : "";
      for (let c = 0; c < nb; c++) {
        const v = game.mini[m][c];
        const el = mb.children[c];
        el.className = "ucell";
        el.textContent = v === "X" ? "✕" : v === "O" ? "◯" : "";
        if (v) el.classList.add(v === "X" ? "x" : "o");
        if (game.last && game.last[0] === m && game.last[1] === c) el.classList.add("last");
        if (won && game.miniLine[m] && game.miniLine[m].includes(c)) el.classList.add("wincell");
        if (fading && fading.has(m * nb + c)) el.classList.add("fading");
        el.disabled = !game.legal(m, c);
      }
    }
  }

  function onUltClick(m, c) {
    if (locked || game.over) return;
    if (!game.legal(m, c)) {
      Sound.illegal();
      return;
    }
    const before = game.miniWinner[m];
    const res = game.play(m, c);
    if (!res) return;
    if (res.removed != null) Sound.fade();
    Sound.place(res.by);
    if (!before && (game.miniWinner[m] === "X" || game.miniWinner[m] === "O")) Sound.boardWon();
    render();
    if (game.over) finishGame();
  }

  // ── end of round ────────────────────────────────────────────────────────
  function finishGame() {
    locked = true;
    const s = scoreFor(mode.id);
    if (game.winner === "draw") s.draw++;
    else s[game.winner]++;
    saveStore();
    refreshScores();
    setTimeout(() => {
      const bn = $("banner");
      const txt = game.winner === "draw" ? "It's a draw!" : `${nameOf(game.winner)} wins!`;
      $("bannerText").textContent = txt;
      $("bannerText").className = game.winner === "draw" ? "" : game.winner === "A" ? "tA" : "tB";
      bn.hidden = false;
      bn.classList.add("show");
      if (game.winner === "draw") Sound.draw();
      else {
        Sound.win();
        confetti(game.winner);
      }
      locked = false;
    }, 550);
  }

  function newRound() {
    if (!mode) return;
    game = createGame(mode);
    wildSym = "X";
    if (mode.wild || mode.roles) setWildSym("X");
    $("banner").hidden = true;
    $("banner").classList.remove("show");
    locked = false;
    $("board").dataset.mode = ""; // force rebuild (clears stale cells)
    render();
    Sound.click();
  }

  function undo() {
    if (locked || !game || !game.canUndo()) return;
    // a completed round was already scored — roll it back on undo
    if (game.over && game.winner) {
      const s = scoreFor(mode.id);
      if (game.winner === "draw") s.draw = Math.max(0, s.draw - 1);
      else s[game.winner] = Math.max(0, s[game.winner] - 1);
      saveStore();
      refreshScores();
    }
    game.undo();
    $("banner").hidden = true;
    $("banner").classList.remove("show");
    render();
    Sound.click();
  }

  // ── wild mark picker ──────────────────────────────────────────────────────
  function setWildSym(sym) {
    wildSym = sym;
    for (const btn of document.querySelectorAll(".pickBtn")) {
      btn.classList.toggle("active", btn.dataset.sym === sym);
    }
  }

  // ── confetti ────────────────────────────────────────────────────────────
  function confetti(winner) {
    const wrap = $("confetti");
    const colors = winner === "A"
      ? ["#60a5fa", "#93c5fd", "#3b82f6", "#bfdbfe"]
      : ["#f472b6", "#f9a8d4", "#ec4899", "#fbcfe8"];
    const N = 90;
    for (let i = 0; i < N; i++) {
      const p = document.createElement("i");
      const x = Math.random() * 100;
      const delay = Math.random() * 0.3;
      const dur = 1.6 + Math.random() * 1.4;
      const size = 6 + Math.random() * 8;
      p.style.cssText = `left:${x}vw;background:${colors[i % colors.length]};` +
        `width:${size}px;height:${size * 0.5}px;animation-delay:${delay}s;animation-duration:${dur}s;`;
      wrap.appendChild(p);
      setTimeout(() => p.remove(), (dur + delay) * 1000 + 100);
    }
  }

  // ── rules modal ───────────────────────────────────────────────────────────
  function showRules() {
    $("rulesTitle").textContent = mode.name;
    const ul = $("rulesList");
    ul.innerHTML = "";
    for (const r of mode.rules) {
      const li = document.createElement("li");
      li.textContent = r;
      ul.appendChild(li);
    }
    $("rulesModal").hidden = false;
  }

  // ── wiring ────────────────────────────────────────────────────────────────
  function wire() {
    $("menuBtn").addEventListener("click", () => {
      showScreen("menu");
      Sound.click();
    });
    $("undoBtn").addEventListener("click", undo);
    $("newBtn").addEventListener("click", newRound);
    $("againBtn").addEventListener("click", newRound);
    $("rulesBtn").addEventListener("click", showRules);
    $("rulesClose").addEventListener("click", () => ($("rulesModal").hidden = true));
    $("rulesModal").addEventListener("click", (e) => {
      if (e.target.id === "rulesModal") $("rulesModal").hidden = true;
    });
    $("resetBtn").addEventListener("click", () => {
      store.scores[mode.id] = { A: 0, B: 0, draw: 0 };
      saveStore();
      refreshScores();
      Sound.click();
    });

    for (const btn of document.querySelectorAll(".pickBtn")) {
      btn.addEventListener("click", () => {
        setWildSym(btn.dataset.sym);
        Sound.click();
      });
    }

    const soundBtn = $("soundBtn");
    function paintSound() {
      soundBtn.textContent = Sound.enabled() ? "🔊 Sound" : "🔇 Muted";
    }
    soundBtn.addEventListener("click", () => {
      Sound.setEnabled(!Sound.enabled());
      store.sound = Sound.enabled();
      saveStore();
      paintSound();
      if (Sound.enabled()) Sound.click();
    });
    paintSound();

    // editable names
    for (const [id, key] of [["nameA", "A"], ["nameB", "B"]]) {
      const el = $(id);
      el.addEventListener("blur", () => {
        const v = el.textContent.trim().slice(0, 18) || (key === "A" ? "Player 1" : "Player 2");
        el.textContent = v;
        store.names[key] = v;
        saveStore();
        renderTurn();
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          el.blur();
        }
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.target.isContentEditable) return;
      if (e.key === "Escape") {
        if (!$("rulesModal").hidden) $("rulesModal").hidden = true;
        else if (!$("game").hidden) showScreen("menu");
      } else if ($("game").hidden) {
        return;
      } else if (e.key === "u" || e.key === "U") undo();
      else if (e.key === "r" || e.key === "R") newRound();
      else if ((e.key === "x" || e.key === "X") && (mode.wild || mode.roles)) setWildSym("X");
      else if ((e.key === "o" || e.key === "O") && (mode.wild || mode.roles)) setWildSym("O");
    });
  }

  // ── boot ────────────────────────────────────────────────────────────────
  (async function boot() {
    await loadStore();
    buildMenu();
    wire();
    showScreen("menu");
  })();
})();
