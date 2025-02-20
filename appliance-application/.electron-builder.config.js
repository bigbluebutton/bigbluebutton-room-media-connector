/**
 * TODO: Rewrite this config to ESM
 * But currently electron-builder doesn't support ESM configs
 * @see https://github.com/develar/read-config-file/issues/10
 */

/**
 * @type {() => import('electron-builder').Configuration}
 * @see https://www.electron.build/configuration/configuration
 */
module.exports = async function () {
  const {getVersion} = await import('./version/getVersion.mjs');

  return {
    directories: {
      output: 'dist',
      buildResources: 'buildResources',
    },
    files: ['packages/**/dist/**', 'packages/**/assets/**'],
    extraMetadata: {
      version: getVersion(),
    },

    npmRebuild: false,

    appId: 'org.bigbluebutton.room-media.appliance',

    // Specify linux target just for disabling snap compilation
    linux: {
      target: ['deb', 'rpm'],
    },
    win: {
      target: ['portable'],
    },
    mac: {
      target: 'dmg',
    },
    deb: {
      afterInstall: 'installer/linux/after-install.tpl',
    },
    rpm: {
      afterInstall: 'installer/linux/after-install.tpl',
    },

    publish: [
      {
        provider: 'github',
      },
    ],
  };
};
