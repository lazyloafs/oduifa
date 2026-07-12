const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('opwele', {
  loadCorpus: () => ipcRenderer.invoke('corpus:load'),
  triangulateOpenAI: (payload) => ipcRenderer.invoke('ai:triangulate', payload),
  translateOpenAI: (payload) => ipcRenderer.invoke('ai:translate', payload),
});
