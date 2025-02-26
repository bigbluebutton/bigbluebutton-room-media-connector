import type { ipcAPI } from '../../common/ipc';


declare global {
  interface Window {
    electronAPI: ipcAPI;
  }
}
