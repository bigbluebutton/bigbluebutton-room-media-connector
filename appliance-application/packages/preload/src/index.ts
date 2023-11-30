import {contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('getConfig'),
  acceptOffer: (offer) => ipcRenderer.send('acceptOffer', offer),
  rejectOffer: () => ipcRenderer.send('rejectOffer'),
  newOffer: () => ipcRenderer.send('newOffer'),
  handleAcceptOffer: (callback) => ipcRenderer.on('acceptOffer', callback),
  handleRejectOffer: (callback) => ipcRenderer.on('rejectOffer', callback),
  handleTriggerNewPin: (callback) => ipcRenderer.on('triggerNewPin', callback),
});
