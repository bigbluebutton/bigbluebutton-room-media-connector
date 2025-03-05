import {app, BrowserWindow, ipcMain } from 'electron';
import {join, resolve} from 'node:path';
import { createBBBMeeting } from './BBBMeeting';
import {fileURLToPath} from 'url';
import path from 'path';
import {config, configPath, displayManager, hdiDevices} from './index';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Create the main window of the application, the PIN screen.
 */
async function createWindow() {
  // Get the display for the pin screen
  const pinDisplay = getPINScreen();

  // Create the BrowserWindow
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

  if(config.debug)
    browserWindow.webContents.openDevTools();

  // RPC from the UI to get the settings
  ipcMain.handle('getConfig', () => {
    return {path: configPath, config};
  });

  // Message from the UI that a verification is required
  // User can accept/decline the verification in the UI or by using HDI devices
  ipcMain.on('requireVerification', () => {
    // Notify all connected HDI devices that a verification is required
    hdiDevices.forEach(device => {
      device.requireVerification(
        () => {
          // Send the acceptVerification message to the UI
          browserWindow.webContents.send('acceptVerification');
        },
        () => {
          // Send the rejectVerification message to the UI
          browserWindow.webContents.send('rejectVerification');
        },
      );
    });
  });

  // Message from the UI to join the meeting
  ipcMain.on('joinMeeting', async (event, joinUrl: string, layoutIndex: number) => {
    console.log('joinMeeting', joinUrl);

    // Callback: Appliance has left the meeting or the meeting has ended
    const leftCallback = () => {
      console.log('Appliance has left the meeting');

      // Notify all connected HDI devices that the user has left the meeting
      hdiDevices.forEach(device => {
        device.disconnected();
      });

      // Notify the UI that the user has left the meeting
      browserWindow.webContents.send('leftMeeting');

      ipcMain.off('pluginDisconnected', pluginDisconnected);
    };

    // @TODO: Remove, old implementation where the plugin generated the join URLs
    //const bbbMeeting = await createBBBMeeting(joinURLs.control, joinURLs.screens, displayManager, leaveCallback);

    // Get selected layout
    const layout = config.room.layouts[layoutIndex];

    const bbbMeeting = await createBBBMeeting(joinUrl, displayManager, leftCallback);

    if (bbbMeeting === false) {
      console.log('failed to join');
      return;
    }

    // Callback: Plugin has disconnected
    const pluginDisconnected = async () => {
      console.log('plugin disconnected');
      /*
      await bbbMeeting.leave();
      hdiDevices.forEach(device => {
        device.disconnected();
      });
      ipcMain.off('pluginDisconnected', pluginDisconnected);
      */
    };

    // Open the screens with the BBB HTML5 Clients
    await bbbMeeting.openScreens(layout);

    const otherLayout = config.room.layouts[2];
    // wait 20 sec before opening the other layout
    setTimeout(async () => {
      await bbbMeeting.openScreens(otherLayout);
    }, 20*1000);

    console.log('joined');

    // Wait 5 sec before unmuting the audio
    setTimeout(() => {
        bbbMeeting.unmute();
        //bbbMeeting.getMediaDevices();
      }, 5000);

    ipcMain.on('pluginDisconnected', pluginDisconnected);

    // Callback: User requests to leave the meeting using a HDI device
    const leaveMeeting = async () => {
      // Leave the meeting
      await bbbMeeting.leave();

      // Notify all connected HDI devices that the user has left
      hdiDevices.forEach(device => {
        device.disconnected();
      });

      // Notify the UI that the user has left the meeting
      browserWindow.webContents.send('leftMeeting');

      ipcMain.off('pluginDisconnected', pluginDisconnected);
    };


    // Notify all connected HDI devices that the user has joined the meeting
    hdiDevices.forEach(device => {
      device.connected({
        leave: leaveMeeting,
        mute: () => {
          bbbMeeting.mute();
        },
        unmute: () => {
          bbbMeeting.unmute();
        },
      });
    });
  });

  // Message from UI to close the app
  ipcMain.on('close', async () => {
    app.quit();
  });

  // Message from UI to that the user has accepted the verification using the UI
  ipcMain.on('verificationAccepted', () => {
    hdiDevices.forEach(device => {
      device.verificationAccepted();
    });
  });

  // Message from UI to that the user has rejected the verification using the UI or the verification has timed out
  ipcMain.on('verificationRejected', () => {
    hdiDevices.forEach(device => {
      device.verificationRejected();
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
 * Get the display for the pin screen
 * try to get the preferred display of the config, if not found, fallback to the first display
 */
function getPINScreen() {
  // Get display for the pin screen
  const pinDisplayLabel = config.preferred_pin_screen;
  if(pinDisplayLabel === undefined) {
    console.error('Preferred pin screen is not set in the config file');
  }

  const preferredPinDisplay = displayManager.getDisplay(pinDisplayLabel);

  const pinDisplay = preferredPinDisplay || displayManager.getDisplays()[0];

  if(preferredPinDisplay === null) {
    console.error(`Preferred pin screen '${pinDisplayLabel}' not found. Falling back to the display '${pinDisplay.label}'`);
  }
  else {
    console.log(`Pin screen set to '${pinDisplayLabel}'`);
  }

  return pinDisplay;
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
