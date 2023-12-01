import {app} from 'electron';
import {URL} from 'node:url';

/**
 * A list of permissions that are allowed for all origins.
 */
const ALLOWED_PERMISSIONS = ['media'];


app.on('web-contents-created', (_, contents) => {
  /**
   * Block navigation to origins not on the allowlist.
   *
   * Navigation exploits are quite common. If an attacker can convince the app to navigate away from its current page,
   * they can possibly force the app to open arbitrary web resources/websites on the web.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#13-disable-or-limit-navigation
   */
  contents.on('will-navigate', (event) => {

    // Prevent navigation
    event.preventDefault();

    if (import.meta.env.DEV) {
      console.warn(`Blocked navigating to disallowed origin: ${origin}`);
    }
  });

  /**
   * Block requests for disallowed permissions.
   * By default, Electron will automatically approve all permission requests.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#5-handle-session-permission-requests-from-remote-content
   */
  contents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const {origin} = new URL(webContents.getURL());

    const permissionGranted = ALLOWED_PERMISSIONS.includes(permission);
    callback(permissionGranted);

    if (!permissionGranted && import.meta.env.DEV) {
      console.warn(`${origin} requested permission for '${permission}', but was rejected.`);
    }
  });

  /**
   * Hyperlinks leading to allowed sites are opened in the default browser.
   *
   * The creation of new `webContents` is a common attack vector. Attackers attempt to convince the app to create new windows,
   * frames, or other renderer processes with more privileges than they had before; or with pages opened that they couldn't open before.
   * You should deny any unexpected window creation.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#14-disable-or-limit-creation-of-new-windows
   * @see https://www.electronjs.org/docs/latest/tutorial/security#15-do-not-use-openexternal-with-untrusted-content
   */
  contents.setWindowOpenHandler(() => {
    // Prevent creating a new window.
    return {action: 'deny'};
  });

  /**
   * Verify webview options before creation.
   *
   * Strip away preload scripts, disable Node.js integration, and ensure origins are on the allowlist.
   *
   * @see https://www.electronjs.org/docs/latest/tutorial/security#12-verify-webview-options-before-creation
   */
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    const {origin} = new URL(params.src);
    if (!ALLOWED_ORIGINS_AND_PERMISSIONS.has(origin)) {
      if (import.meta.env.DEV) {
        console.warn(`A webview tried to attach ${params.src}, but was blocked.`);
      }

      event.preventDefault();
      return;
    }

    // Strip away preload scripts if unused or verify their location is legitimate.
    delete webPreferences.preload;
    // @ts-expect-error `preloadURL` exists. - @see https://www.electronjs.org/docs/latest/api/web-contents#event-will-attach-webview
    delete webPreferences.preloadURL;

    // Disable Node.js integration
    webPreferences.nodeIntegration = false;

    // Enable contextIsolation
    webPreferences.contextIsolation = true;
  });
});
