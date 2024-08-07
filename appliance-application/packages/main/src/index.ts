import {app} from 'electron';
import './security-restrictions';
import {restoreOrCreateWindow, hdiDevices } from '/@/mainWindow';
import {listStreamDecks, openStreamDeck} from '@elgato-stream-deck/node';
import {StreamDeckHID} from '/@/streamdeck';


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

/**
 * Shout down background process if all windows was closed
 */
app.on('window-all-closed', async () => {


  app.quit();
});

app.on('before-quit', async function () {
  console.log("closing");
  for (const device of hdiDevices) {
    await device.close();
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
      const allStreamDecks = await listStreamDecks();
      console.debug('All Streamdecks found: ', allStreamDecks);
      const myStreamDeck = await openStreamDeck(allStreamDecks[0].path);
      console.debug('Streamdeck found: ', myStreamDeck);
      hdiDevices.push(new StreamDeckHID(myStreamDeck));
    } catch (e) {
      console.error(e);
      console.log('No Streamdeck found');
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
if (import.meta.env.PROD) {
  app
    .whenReady()
    .then(() =>
      /**
       * Here we forced to use `require` since electron doesn't fully support dynamic import in asar archives
       * @see https://github.com/electron/electron/issues/38829
       * Potentially it may be fixed by this https://github.com/electron/electron/pull/37535
       */
      require('electron-updater').autoUpdater.checkForUpdatesAndNotify(),
    )
    .catch(e => console.error('Failed check and install updates:', e));
}

