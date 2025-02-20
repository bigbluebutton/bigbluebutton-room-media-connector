import {contextBridge, ipcRenderer} from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.invoke('getConfig'),

  requireVerification: () => ipcRenderer.send('requireVerification'),
  verificationAccepted: () => ipcRenderer.send('verificationAccepted'),
  verificationRejected: () => ipcRenderer.send('verificationRejected'),
  joinURLs: urls => ipcRenderer.send('joinURLs', urls),
  pluginDisconnected: () => ipcRenderer.send('pluginDisconnected'),

  handleLeftMeeting: callback => ipcRenderer.on('leftMeeting', callback),
  handleVerificationAccepted: callback => ipcRenderer.on('acceptVerification', callback),
  handleVerificationRejected: callback => ipcRenderer.on('rejectVerification', callback),

  close: () => ipcRenderer.send('close'),
});
