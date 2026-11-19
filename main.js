// Potlatch Club desktop app: a safe window around your live Vercel site.
// Your data, logins and PINs stay on the server exactly as they are on the web.
const { app, BrowserWindow, Menu, shell, ipcMain, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const PLACEHOLDER = "";
let win = null;

const userFile = (n) => path.join(app.getPath("userData"), n);
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(userFile(f), "utf8")); } catch (e) { return d; } }
function writeJson(f, v) { try { fs.writeFileSync(userFile(f), JSON.stringify(v)); } catch (e) {} }

// ---- error log (userData/log.txt) ----
function logFile() { return userFile("log.txt"); }
function log(msg) {
  try {
    const f = logFile();
    try { if (fs.statSync(f).size > 500000) fs.writeFileSync(f, ""); } catch (e) {}
    fs.appendFileSync(f, new Date().toISOString() + "  " + msg + "\n");
  } catch (e) {}
}

function cleanUrl(u) {
  u = String(u || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { const x = new URL(u); if (x.protocol !== "https:" && x.hostname !== "localhost") return ""; return x.origin; } catch (e) { return ""; }
}
const getAppUrl = () => cleanUrl(process.env.POTLATCH_URL) || cleanUrl(readJson("config.json", {}).appUrl) || PLACEHOLDER;

function load() {
  const url = getAppUrl();
  if (!url) win.loadFile(path.join(__dirname, "setup.html"));
  else win.loadURL(url);
}

function toggleDevTools() {
  if (!win) return;
  if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
  else win.webContents.openDevTools({ mode: "detach" });
}

async function clearSiteDataAndReload() {
  try {
    await session.defaultSession.clearStorageData();
    await session.defaultSession.clearCache();
    log("Saved site data cleared by user");
  } catch (e) { log("clear data failed: " + e); }
  load();
}

function createWindow() {
  const b = readJson("window.json", { width: 1400, height: 900 });
  win = new BrowserWindow({
    width: b.width, height: b.height, minWidth: 900, minHeight: 600,
    title: "Potlatch Club", icon: path.join(__dirname, "build", "logo.png"),
    autoHideMenuBar: true, backgroundColor: "#faf5ee",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (b.max) win.maximize();
  win.on("close", () => { const bb = win.getNormalBounds(); writeJson("window.json", { width: bb.width, height: bb.height, max: win.isMaximized() }); });

  // links to other sites (WhatsApp, email, etc.) open in the normal browser, never inside the app
  const sameOrigin = (u) => { try { return new URL(u).origin === getAppUrl() || u.startsWith("file://"); } catch (e) { return false; } };
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!sameOrigin(url)) { e.preventDefault(); if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url); } });

  // no internet or the site is down: friendly page with a Retry button
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => {
    log("did-fail-load code=" + code + " " + desc + " url=" + url + " main=" + isMain);
    if (isMain && code !== -3) win.loadFile(path.join(__dirname, "offline.html"));
  });

  // ---- diagnostics: write page errors and crashes to log.txt ----
  win.webContents.on("console-message", (...args) => {
    let d = args[0];
    if (!(d && typeof d === "object" && d.message !== undefined)) d = { level: args[1], message: args[2], lineNumber: args[3], sourceId: args[4] };
    const lv = d.level;
    const isErr = lv === 3 || lv === "error";
    const isWarn = lv === 2 || lv === "warning";
    if (isErr || isWarn) log((isErr ? "PAGE ERROR: " : "PAGE WARNING: ") + d.message + "  (" + (d.sourceId || "") + ":" + (d.lineNumber || "") + ")");
  });
  win.webContents.on("render-process-gone", (e, details) => log("render-process-gone: " + JSON.stringify(details)));
  win.webContents.on("unresponsive", () => log("window became unresponsive"));
  win.webContents.on("preload-error", (e, p, err) => log("preload-error " + p + ": " + err));
  win.webContents.on("did-finish-load", () => log("did-finish-load " + win.webContents.getURL()));
  win.webContents.on("certificate-error", (e, url, err) => log("certificate-error " + err + " " + url));

  log("Starting. Electron " + process.versions.electron + ", Chrome " + process.versions.chrome + ", site " + (getAppUrl() || "(none)"));
  load();
}

// only your own site may use the camera (barcode scanning) and clipboard; everything else is refused
function lockPermissions() {
  const ok = new Set(["media", "clipboard-sanitized-write", "clipboard-read", "fullscreen", "notifications"]);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => { let o = ""; try { o = new URL(wc.getURL()).origin; } catch (e) {} cb(ok.has(perm) && o === getAppUrl()); });
}

ipcMain.handle("potlatch:save-url", (e, raw) => {
  const u = cleanUrl(raw);
  if (!u) return { ok: false, message: "Enter your website address, for example your-app.vercel.app" };
  writeJson("config.json", { appUrl: u });
  setTimeout(load, 100);
  return { ok: true };
});
ipcMain.handle("potlatch:retry", () => { load(); return true; });

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Potlatch", submenu: [
      { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => win && win.webContents.reload() },
      { label: "Change app address…", click: () => { if (win) win.loadFile(path.join(__dirname, "setup.html")); } },
      { type: "separator" },
      { label: "Developer tools", accelerator: "F12", click: toggleDevTools },
      { label: "Show log file", click: () => { log("(log opened)"); shell.showItemInFolder(logFile()); } },
      { label: "Clear saved site data and reload", click: clearSiteDataAndReload },
      { type: "separator" }, { role: "quit" } ] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] }
  ]));
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { lockPermissions(); buildMenu(); createWindow(); });
  app.on("window-all-closed", () => app.quit());
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
// Potlatch Club desktop app: a safe window around your live Vercel site.
// Your data, logins and PINs stay on the server exactly as they are on the web.
const { app, BrowserWindow, Menu, shell, ipcMain, session, dialog } = require("electron");
const path = require("path");
const fs = require("fs");

const PLACEHOLDER = "";
let win = null;

const userFile = (n) => path.join(app.getPath("userData"), n);
function readJson(f, d) { try { return JSON.parse(fs.readFileSync(userFile(f), "utf8")); } catch (e) { return d; } }
function writeJson(f, v) { try { fs.writeFileSync(userFile(f), JSON.stringify(v)); } catch (e) {} }

function cleanUrl(u) {
  u = String(u || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) u = "https://" + u;
  try { const x = new URL(u); if (x.protocol !== "https:" && x.hostname !== "localhost") return ""; return x.origin; } catch (e) { return ""; }
}
const getAppUrl = () => cleanUrl(process.env.POTLATCH_URL) || cleanUrl(readJson("config.json", {}).appUrl) || PLACEHOLDER;

function load() {
  const url = getAppUrl();
  if (!url) win.loadFile(path.join(__dirname, "setup.html"));
  else win.loadURL(url);
}

function createWindow() {
  const b = readJson("window.json", { width: 1400, height: 900 });
  win = new BrowserWindow({
    width: b.width, height: b.height, minWidth: 900, minHeight: 600,
    title: "Potlatch Club", icon: path.join(__dirname, "build", "logo.png"),
    autoHideMenuBar: true, backgroundColor: "#faf5ee",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  if (b.max) win.maximize();
  win.on("close", () => { const bb = win.getNormalBounds(); writeJson("window.json", { width: bb.width, height: bb.height, max: win.isMaximized() }); });

  // links to other sites (WhatsApp, email, etc.) open in the normal browser, never inside the app
  const sameOrigin = (u) => { try { return new URL(u).origin === getAppUrl() || u.startsWith("file://"); } catch (e) { return false; } };
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!sameOrigin(url)) { e.preventDefault(); if (/^(https?:|mailto:|tel:)/i.test(url)) shell.openExternal(url); } });

  // no internet or the site is down: friendly page with a Retry button
  win.webContents.on("did-fail-load", (e, code, desc, url, isMain) => { if (isMain && code !== -3) win.loadFile(path.join(__dirname, "offline.html")); });

  load();
}

// only your own site may use the camera (barcode scanning) and clipboard; everything else is refused
function lockPermissions() {
  const ok = new Set(["media", "clipboard-sanitized-write", "clipboard-read", "fullscreen", "notifications"]);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => { let o = ""; try { o = new URL(wc.getURL()).origin; } catch (e) {} cb(ok.has(perm) && o === getAppUrl()); });
}

ipcMain.handle("potlatch:save-url", (e, raw) => {
  const u = cleanUrl(raw);
  if (!u) return { ok: false, message: "Enter your website address, for example your-app.vercel.app" };
  writeJson("config.json", { appUrl: u });
  setTimeout(load, 100);
  return { ok: true };
});
ipcMain.handle("potlatch:retry", () => { load(); return true; });

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Potlatch", submenu: [
      { label: "Reload", accelerator: "CmdOrCtrl+R", click: () => win && win.webContents.reload() },
      { label: "Change app address…", click: () => { if (win) win.loadFile(path.join(__dirname, "setup.html")); } },
      { type: "separator" }, { role: "quit" } ] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] }
  ]));
}

if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { lockPermissions(); buildMenu(); createWindow(); });
  app.on("window-all-closed", () => app.quit());
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
}
