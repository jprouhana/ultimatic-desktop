// Ultimatic desktop — Electron main process. Pure local app: the renderer
// runs the whole game (vanilla JS, no framework, no network). Main owns the
// window and a tiny JSON store for match scores + player names.
const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const path = require("path");
const fs = require("fs");

if (process.platform === "linux") {
  app.commandLine.appendSwitch("ozone-platform-hint", "auto");
  app.commandLine.appendSwitch("enable-features", "WaylandWindowDecorations");
}

function statePath() {
  return path.join(app.getPath("userData"), "window.json");
}
function storePath() {
  return path.join(app.getPath("userData"), "store.json");
}
function loadJSON(p, fallback) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return fallback;
  }
}
function saveJSON(p, data) {
  try {
    fs.writeFileSync(p, JSON.stringify(data), "utf8");
  } catch {}
}

let win = null;

function createWindow() {
  const b = loadJSON(statePath(), null);
  win = new BrowserWindow({
    width: (b && b.width) || 1180,
    height: (b && b.height) || 860,
    x: b && b.x,
    y: b && b.y,
    minWidth: 820,
    minHeight: 640,
    backgroundColor: "#0b0d14",
    title: "Ultimatic",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, "src", "index.html"));
  win.webContents.on("console-message", (_e, level, message, line, src) => {
    const tag = ["LOG", "WARN", "ERR"][level] || "LOG";
    console.log(`[renderer ${tag}] ${message}` + (level >= 2 ? ` (${src}:${line})` : ""));
  });
  win.on("close", () => saveJSON(statePath(), win.getBounds()));
  win.on("closed", () => (win = null));

  const tpl = [
    {
      label: "Ultimatic",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(tpl));
}

ipcMain.handle("store:get", () => loadJSON(storePath(), {}));
ipcMain.handle("store:set", (_e, data) => {
  saveJSON(storePath(), data || {});
  return true;
});

app.whenReady().then(createWindow);
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
