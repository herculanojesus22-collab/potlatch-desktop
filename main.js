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
