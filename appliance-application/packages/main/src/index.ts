import {app} from 'electron';
import './security-restrictions';
import {restoreOrCreateWindow, hdiDevices} from '/@/mainWindow';
import {listStreamDecks, openStreamDeck} from '@elgato-stream-deck/node';
import {StreamDeckHID} from '/@/streamdeck';
import {autoUpdater} from 'electron-updater';

/**
 * Prevent electron from running multiple instances.
 */
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  app.quit();
  process.exit(0);
}
app.on('second-instance', restoreOrCreateWindow);

/**
 * Disable Hardware Acceleration to save more system resources.
 */
app.disableHardwareAcceleration();

app.on('window-all-closed', () => {
  app.quit();
});

let isQuitting = false;

app.on('before-quit', async (event: Event): Promise<void> => {
  if (!isQuitting) {
    event.preventDefault();
    isQuitting = true;

    const promises = hdiDevices.map(device => {
      return device.close();
    });

    await Promise.all(promises);

    app.quit();
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
  .then(restoreOrCreateWindow)
  .then(async () => {
    console.log('App is ready');

    try {
      const allStreamDeckDevices = await listStreamDecks();

      const streamDecks = allStreamDeckDevices.map(device => {
        return openStreamDeck(device.path, {resetToLogoOnClose: true});
      });

      (await Promise.all(streamDecks)).forEach(streamDeck => {
        console.debug('Stream Deck found: ' + streamDeck.PRODUCT_NAME);
        hdiDevices.push(new StreamDeckHID(streamDeck));
      });
    } catch (e) {
      console.error(e);
    }
  })
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
