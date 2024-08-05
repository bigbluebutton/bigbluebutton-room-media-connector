import {app, BrowserWindow, ipcMain, screen, session} from 'electron';
import {join, resolve} from 'node:path';
import fs from 'fs';
import {HID} from '/@/HID';
import {BBBMeeting} from '/@/bbb-meeting';
import {fileURLToPath} from "url";
import path from "path";
import {DisplayManager} from "/@/displayManager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const hdiDevices:HID[] = [];

async function createWindow() {

  // Loading config file
  const appUserDataPath = app.getPath('userData');
  const path = appUserDataPath + '/settings.json';
  let config = null;
  try {
    config = JSON.parse(fs.readFileSync( path, 'utf8'));
  } catch (e) {
    console.log('No config found');
  }

  // Get all connected screens
  const displayManager = new DisplayManager();

  // Get display for the pin screen
  const pinDisplayLabel = config ? config['preferred_pin_screen'] : '';
  const pinDisplay = displayManager.getDisplay(pinDisplayLabel) || displayManager.getDisplays()[0];

  const browserWindow = new BrowserWindow({
    show: false, // Use the 'ready-to-show' event to show the instantiated BrowserWindow.
    width: pinDisplay.size.width,
    height: pinDisplay.size.height,
    x: pinDisplay.bounds.x,
    y: pinDisplay.bounds.y,
    fullscreen: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Sandbox disabled because the demo of preload script depend on the Node.js api
      webviewTag: false, // The webview tag is not recommended. Consider alternatives like an iframe or Electron's BrowserView. @see https://www.electronjs.org/docs/latest/api/webview-tag#warning
      preload: join(app.getAppPath(), 'packages/preload/dist/index.cjs'),
    },
  });

  ipcMain.handle('getConfig', () => {
    return {path, config}
  });

  ipcMain.on('newOffer', () => {
    hdiDevices.forEach((device) => {
      device.newOffer(() => {
        browserWindow.webContents.send('acceptOffer');
      }, () => {
        browserWindow.webContents.send('rejectOffer');
      });
    });
  });

  ipcMain.on('acceptOffer', async (event, offer) => {
    console.log('acceptOffer', offer);

    hdiDevices.forEach((device) => {
      device.acceptedOffer();
    });

    const bbbMeeting = new BBBMeeting(offer.urls.control, offer.urls.screens, displayManager);

    const leaveCallback = () => {
      console.log("should leave software");

      hdiDevices.forEach((device) => {
        device.disconnected();
      });

      browserWindow.webContents.send('triggerNewPin');
    };

    if(!await bbbMeeting.join(leaveCallback)) {
      console.log("failed to join");
    }

    console.log('joined');
    hdiDevices.forEach((device) => {
      device.connected(async () => {
        console.log("should leave hardware");
        await bbbMeeting.leave();

        hdiDevices.forEach((device) => {
          device.disconnected();
        });

        browserWindow.webContents.send('triggerNewPin');

      });
    });

  });

  ipcMain.on('rejectOffer', () => {
    console.log('rejectOffer');

    hdiDevices.forEach((device) => {
      device.rejectedOffer();
    });
  });

  /**
   * If the 'show' property of the BrowserWindow's constructor is omitted from the initialization options,
   * it then defaults to 'true'. This can cause flickering as the window loads the html content,
   * and it also has show problematic behaviour with the closing of the window.
   * Use `show: false` and listen to the  `ready-to-show` event to show the window.
   *
   * @see https://github.com/electron/electron/issues/25012 for the afford mentioned issue.
   */
  browserWindow.on('ready-to-show', () => {
    browserWindow?.show();

    if (import.meta.env.DEV) {
      browserWindow?.webContents.openDevTools();
    }
  });

  /**
   * Load the main page of the main window.
   */
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_SERVER_URL !== undefined) {
    /**
     * Load from the Vite dev server for development.
     */
    await browserWindow.loadURL(import.meta.env.VITE_DEV_SERVER_URL);
  } else {
    /**
     * Load from the local file system for production and test.
     *
     * Use BrowserWindow.loadFile() instead of BrowserWindow.loadURL() for WhatWG URL API limitations
     * when path contains special characters like `#`.
     * Let electron handle the path quirks.
     * @see https://github.com/nodejs/node/issues/12682
     * @see https://github.com/electron/electron/issues/6869
     */
    await browserWindow.loadFile(resolve(__dirname, '../../renderer/dist/index.html'));
  }

  return browserWindow;
}

/**
 * Restore an existing BrowserWindow or Create a new BrowserWindow.
 */
export async function restoreOrCreateWindow() {

  let window = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());

  if (window === undefined) {
    window = await createWindow();
  }

  if (window.isMinimized()) {
    window.restore();
  }

  window.focus();
}
