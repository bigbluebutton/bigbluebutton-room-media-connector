
# BigBlueButton Room Appliance Application

## What is it?

This cross-platform application is used to connect media devices inside a room to a BigBlueButton meeting.

This allows to streamline the experience of online users
by capturing the best media devices of the room (microphones, cameras).

It also improves the experience for the in-site audience,
by displaying the most relevant content, given the available
displays.

## Prerequisites

This application needs to be run on a device (e.g. Intel NUC) inside the meeting room that
itself can be connected to the room's audiovisual input and output devices.

Currently as additional hardware an Elgato Streamdeck is required as input device if you
want to control the meeting from the appliance.

## Running the application in development mode

1. Copy config file:

Place the settings config file `settings.json` in the following folder:

- `%APPDATA%/BBB-Room-Media-Connector` on Windows
- `$XDG_CONFIG_HOME/BBB-Room-Media-Connector` or `~/.config/BBB-Room-Media-Connector` on Linux
- `~/Library/Application Support/BBB-Room-Media-Connector` on macOS


2. Customize the config file:

- You have to adjust the `control_server.ws` setting to point to the `/ws_room` route of the pairing server (e.g. `https://your-bbb-server.org/hybrid/ws_room` if you follow the [instructions](../pairing-server/) and install the pairing server on a bbb host).
- Next `room.name` should be set to the name of the room that should be shown during the pairing process.
- You can also set `preferred_pin_screen` to the name of the screen that should be used to display the pairing pin. If the screen it not found, it uses the first screen it finds.
- Lastly you need to define the layouts, a few examples are provided in `room.layouts`.
The key of the layouts property `screen` is the name of the screen name provided by the operating system.

3. Start the application:

```bash
npm install
npm run watch
```
