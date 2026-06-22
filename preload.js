// Bridge a tiny, safe API to the renderer: the JSON store for scores + names.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ultimatic", {
  platform: process.platform,
  getStore: () => ipcRenderer.invoke("store:get"),
  setStore: (data) => ipcRenderer.invoke("store:set", data),
});
