# BigBlueButton Room Media Connector

This software system is used to connect media devices inside a room to a BigBlueButton meeting.
This allows to streamline the experience of online users by capturing the best media devices of the room (microphones, cameras).
It also improves the experience for the in-site audience, by displaying the most relevant content, given the available displays.

⚠ This project is a prototype to showcase the capabilities of BBB in a hybrid setting.
It obviously misses a lot of features and *will* break in any kind of production setting.

## Architecture

The system consists of three software components that need to be run and configured in order to work:

1. The [room appliance application](appliance-application) needs to be run on a device (like Intel NUC) that connects to the room's audiovisual input and output devices. It holds the room configuration, i.e. how the media devices should be used in BBB and displays a PIN number that is used to pair the room with a BBB meeting.
2. The [BBB HTML Plugin](html-plugin) is where you enter the PIN number displayed on the appliance to connect the running meeting to the room.
3. The [pairing server](pairing-server) brokers the connection between the appliance in the room and the BBB meeting.

Both the Plugin and the appliance application use the GraphQL interface of BBB 3 to communicate with BBB server.

![overview](https://github.com/bigbluebutton/bigbluebutton-room-media-connector/assets/4281791/577f1821-a246-4fbb-bdd8-49a888a8b053)
