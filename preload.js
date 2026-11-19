const { contextBridge, ipcRenderer } = require("electron");
// only the two setup/offline pages use these; the live site gets nothing extra
contextBridge.exposeInMainWorld("potlatchDesktop", {
  saveUrl: (u) => ipcRenderer.invoke("potlatch:save-url", u),
  retry: () => ipcRenderer.invoke("potlatch:retry")
});
