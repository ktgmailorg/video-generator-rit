// Bridge for the setup window only. Deliberately narrow: the renderer can
// save, verify, and forget credentials, but there is no channel that returns
// a stored key back to any page.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studioSetup", {
  getState: () => ipcRenderer.invoke("setup:state"),
  verifyKey: (id, key) => ipcRenderer.invoke("setup:verify", { id, key }),
  saveKey: (id, key, model) =>
    ipcRenderer.invoke("setup:save", { id, key, model }),
  forgetKey: (id) => ipcRenderer.invoke("setup:forget", { id }),
  useFreeMode: () => ipcRenderer.invoke("setup:free-mode"),
  finish: () => ipcRenderer.invoke("setup:finish"),
  openExternal: (url) => ipcRenderer.invoke("setup:open-external", { url }),
});
