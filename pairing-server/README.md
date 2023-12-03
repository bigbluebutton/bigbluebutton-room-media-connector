# BigBlueButton Room Integration Pairing Server

## What is it?

This pairing server helps the [BigBlueButton Room Integration Plugin](https://github.com/bigbluebutton/bigbluebutton-room-media-connector) to connect the device that is installed in a physical lecture room into the BigBlueButton meeting.

The device in the physical lecture room runs an electron app that is able to connect to BigBlueButton.

## Running the Server from source

1. Install python3 venv

```bash
apt-get install python3-venv
```

2. Create a python3 virtual environment:

```bash
python3 -m venv env
```

3. Activate the virtual environment and install dependencies

```bash
. env/bin/activate
pip install -r requirements.txt
```

4. run the server
```bash
quart run
```

If you want to use it with the plugin, you need to proxy this from a webserver with a valid SSL certificate as both the browser as well as the electron app won't connect.

```nginx
location /hybrid {
  proxy_pass http://127.0.0.1:5000/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "Upgrade";
}
```

## Running the Server in production

You need only one room integration server per BigBlueButton cluster. So this software does not need to run on a BigBlueButton Server but it is not forbidden to do so.

To run it in production, you can use any ASGI compatible application server such as hypercorn.