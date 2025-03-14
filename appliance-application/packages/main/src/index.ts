import {app} from 'electron';
import './security-restrictions';
import {restoreOrCreateWindow} from './mainWindow';
import {listStreamDecks, openStreamDeck, DeviceModelId} from '@elgato-stream-deck/node';
import {autoUpdater} from 'electron-updater';
import fs from 'fs';
import {DisplayManager} from './displayManager';
import type {HID} from './HID';
import type {Config} from '../../common/config.ts';
import {KeyboardHID} from '/@/keyboard';
import StreamDeckMiniHID from '/@/StreamDeckMiniHID';
import StreamDeckHID from '/@/StreamDeckHID';

export let displayManager: DisplayManager;
export const hdiDevices: HID[] = [];
export let config: Config;
export let configPath: string;

/**
 * Prevent electron from running multiple instances.
 */
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', restoreOrCreateWindow);

app.on('window-all-closed', () => {
  app.quit();
});

let isQuitting = false;


app.on('before-quit', (event: Electron.Event): void => {
  if (!isQuitting) {
    event.preventDefault();
    isQuitting = true;

    const promises = hdiDevices.map(device => {
      return device.close();
    });

    Promise.all(promises).then(() => {
      app.quit();
    });
  }
});

/**
 * @see https://www.electronjs.org/docs/latest/api/app#event-activate-macos Event: 'activate'.
 */
//app.on('activate', restoreOrCreateWindow);

/**
 * Create the application window when the background process is ready.
 */
app
  .whenReady()
  .then(loadConfig)
  .then(loadDisplays)
  .then(loadHDIDevices)
  .then(restoreOrCreateWindow)
  .catch(e => console.error('Failed create window:', e));

/**
 * Check for app updates, install it in background and notify user that new version was installed.
 * No reason run this in non-production build.
 * @see https://www.electron.build/auto-update.html#quick-setup-guide
 *
 * Note: It may throw "ENOENT: no such file app-update.yml"
 * if you compile production app without publishing it to distribution server.
 * Like `npm run compile` does. It's ok 😅
 */
/**
 * Check for new version of the application - production mode only.
if (import.meta.env.PROD) {
  app.
  whenReady()
    .then(autoUpdater.checkForUpdatesAndNotify())
    .catch((e) => console.error('Failed check updates:', e));
}
*/

function loadConfig() {
  // Loading config file
  const appUserDataPath = app.getPath('userData');
  configPath = appUserDataPath + '/settings.json';
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    console.log('Config loaded from ' + configPath);
  } catch (error) {
    console.log('Error reading config from ' + configPath, error);
  }
}

function loadDisplays() {
  displayManager = new DisplayManager();

  const allDisplays = displayManager.getDisplays();
  allDisplays.forEach(display => {
    console.log('Found display with display attributes:', {
      id: display.id,
      label: display.label,
      size: display.size
    });
  });
}

async function loadHDIDevices() {
  try {
    const allStreamDeckDevices = await listStreamDecks();

    const streamDecks = allStreamDeckDevices.map(device => {
      return openStreamDeck(device.path, {resetToLogoOnClose: true});
    });

    (await Promise.all(streamDecks)).forEach(streamDeck => {
      console.log('Stream Deck found: ' + streamDeck.PRODUCT_NAME);
      switch (streamDeck.MODEL) {
        case DeviceModelId.MINI:
          hdiDevices.push(new StreamDeckMiniHID(streamDeck, config.room.layouts.length));
          break;
        case DeviceModelId.ORIGINAL:
        case DeviceModelId.ORIGINALV2:
        case DeviceModelId.ORIGINALMK2:
          hdiDevices.push(new StreamDeckHID(streamDeck, config.room.layouts.length));
          break;
        default:
          console.log('Unknown Stream Deck type: ' + streamDeck.PRODUCT_NAME);
          break;
      }
    });
  } catch (e) {
    console.error(e);
  }

  if(config.keyboard_hid) {
    hdiDevices.push(new KeyboardHID());
    console.log('Keyboard HID registered');
  }
}
