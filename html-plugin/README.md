
# BigBlueButton Room Integration Plugin

## What is it?

This is a [BBB HTML plugin](https://github.com/bigbluebutton/bigbluebutton-html-plugin-sdk) where the user can enter the PIN displayed by the [room appliance application](../appliance-application/).
It then checks this PIN with the [pairing-server](../pairing-server/) and afterwards creates the join-URLs for the applicance application.
To finish the pairing it shows the pairing pin for user confirmation.

## Usage

This is a general instruction on how to use a plugin.
For a detailed configuration example of each use case,
have a look at the READMEs in the respective [samples](samples)-folders.

### Running the Plugin from Source

For development purposes you can run the plugin locally from source:

1. Start the development server:
    ```bash
    cd $HOME/src/bigbluebutton-html-plugin-sdk/samples/sample-action-button-dropdown-plugin
    npm install
    npm start
    ```

2. Configure it in the `settings.yml` of the BBB HTML5 Client:
    ```yaml
    public:
      plugins:
        - name: RoomMediaPlugin
          url: http://127.0.0.1:4701/static/RoomMediaPlugin.js
          settings:
            pairingWebsocketUrl: wss://your-bbb-server.org/hybrid/ws
    ```

_N.B.:_ Be aware that in this case the url is interpreted from the plugin in the browser,
so the localhost is actually your local development machine.

### Building the Plugin

To build the plugin for deployment follow these steps:

```bash
cd $HOME/html-plugin
npm install
npm run build-bundle
```

The above command will generate the `dist` folder, containing the bundled JavaScript file named `RoomMediaPlugin.js`.
This file can be hosted on any HTTPS server.

To use the plugin with BigBlueButton, add the plugin's URL to the `settings.yml` of the BBB HTML5 Client as shown below:

```yaml
public:
  plugins:
    - name: RoomMediaPlugin
      url: <<PLUGIN_URL>>
      settings:
        pairingWebsocketUrl: wss://your-pairing-server.org/hybrid/ws
```

#### Hosting the Plugin on a BBB Server

While the plugin can be hosted on any Server, it is also possible to host the bundled file directly on
a BigBlueButton server.
For that you copy the `dist/RoomMediaPlugin.js` to the folder `/var/www/bigbluebutton-default/assets/plugins`.
In this case, the `<<PLUGIN_URL>>` above will be `https://<your-host>/plugins/RoomMediaPlugin.js`.

### Installation as a .deb-Package

We build debian packages for the main branch and releases.

For releases you can download them from the assets on the releases page.
For commits and PRs on the main-branch you can download them as artifacts from the respective actions workflow.

You can then install the package on your BBB server using something like `dpkg -i bbb-room-connector-plugin_0.1.0_all.deb`
(verify the actual file name of the .deb-package).
The plugin is then automatically installed to `/var/www/bigbluebutton-default/assets/plugins` and is delivered by BBB.
You then only need to configure it according to the example above.
