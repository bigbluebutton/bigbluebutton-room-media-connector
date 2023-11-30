
# BigBlueButton Room Integration Plugin

## What is it?

This plugin communicates with the pairing server sending the user provided pin and receives the room layout config provided by the appliance application.
It then creates the required join urls and passes it to the appliance application.
To finish the pairing it shows the pairing pin for user confirmation.

## Running the Plugin from Source

1. Start the development server:

```bash
npm install
npm start
```

2. Add reference to it on BigBlueButton's `settings.yml`:

```yaml
  plugins:
    - name: SampleActionButtonDropdownPlugin
      url: http://127.0.0.1:4701/static/RoomMediaPlugin.js
```

## Building the Plugin

To build the plugin for production use, follow these steps:

```bash
npm install
npm run build-bundle
```

The above command will generate the `dist` folder, containing the bundled JavaScript file named `RoomMediaPlugin.js`. This file can be hosted on any HTTPS server.

To use the plugin with BigBlueButton, add the plugin's URL to `settings.yml` as shown below:

```yaml
public:
  app:
    ... // All app configurations
  plugins:
    - name: RoomMediaPlugin
      url: <<PLUGIN_URL>>
  ... // All other configurations
```

Alternatively, you can host the bundled file on the BigBlueButton server by copying `dist/RoomMediaPlugin.js` to the folder `/var/www/bigbluebutton-default/assets/plugins`. In this case, the `<<PLUGIN_URL>>` will be `https://<your-host>/plugins/RoomMediaPlugin.js`.
