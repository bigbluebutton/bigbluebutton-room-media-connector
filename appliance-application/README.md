
# BigBlueButton Room Appliance Application

## What is it?

This cross-platform application is used to connect media devices inside a room to a BigBlueButton meeting.

This allows to streamline the experience of online users
by capturing the best media devices of the room (microphones, cameras).

It also improves the experience for the in-site audience,
by displaying the most relevant content, given the available
displays.

## Running the application in development mode

1. Copy config file:

Place the settings config file `settings.json` in the following folder:

- `%APPDATA%/BBB-Room-Media-Connector` on Windows
- `$XDG_CONFIG_HOME/BBB-Room-Media-Connector` or `~/.config/BBB-Room-Media-Connector` on Linux
- `~/Library/Application Support/BBB-Room-Media-Connector` on macOS


2. Customize the config file:

- You have to adjust the `control_server.ws` setting to point to the location of the pairing server.
- Next `room.name` should be set to the name of the room that should be shown during the pairing process.
- Lastly you need to define the layouts, a few examples are provided in `room.layouts`.
The key of the layouts property `screen` is the name of the screen name provided by the operating system.

3. Start the application:

```bash
npm install
npm run watch
```
