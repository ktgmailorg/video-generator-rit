// Bridge for the setup window only. Deliberately narrow: the renderer can
// save, verify, and forget providers, but there is no channel that returns a
// stored API key back to any page.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("studioSetup", {
  getState: () => ipcRenderer.invoke("setup:state"),
  discoverLocal: () => ipcRenderer.invoke("setup:discover-local"),
  verifyProvider: (input) => ipcRenderer.invoke("setup:verify", input),
  saveProvider: (input) => ipcRenderer.invoke("setup:save", input),
  forgetProvider: (id) => ipcRenderer.invoke("setup:forget", { id }),
  finish: () => ipcRenderer.invoke("setup:finish"),
  openExternal: (url) => ipcRenderer.invoke("setup:open-external", { url }),
});
