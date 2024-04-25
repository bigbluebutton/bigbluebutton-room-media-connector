# BigBlueButton Room Integration Pairing Server

## What is it?

This pairing brokers the connection between the [BBB HTML plugin](../html-plugin/) and the [appliance application](../appliance-application/)
to connect the device that is installed in a physical lecture room into the running BigBlueButton meeting.

## Running the Server from source

First, create a python virtual environment and install the dependencies with pip:

```bash
python3 -m venv env
. env/bin/activate
pip install -r requirements.txt
```

Then you can run the server for testing purposes using:

```bash
quart run
```


### Connecting to the other Components

The communication with the BBB server requires TLS.
So in order to get this to work with the HTML plugin and the appliance application you need to proxy
the pairing server with a webserver with a valid SSL certificate.

You can e.g. run the pairing server on an existing BigBlueButton server.
In this case you just add a file `/etc/bigbluebutton/nginx/hybrid.nginx` with the following contents on the BBB server:

```nginx
location /hybrid {
  proxy_pass http://127.0.0.1:5000/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "Upgrade";
}
```

## Running the Server in production

⚠ *Be aware that this project is currently a proof-of-concept that is not yet suited to run in a real production environment.*

You need only one room integration server per BigBlueButton cluster.
So this software does not need to run on a BigBlueButton Server but it is not forbidden to do so.

To run it in production, you can use any ASGI compatible application server such as hypercorn.

## Running tests

Install the test dependencies in a virtual environment:

```bash
python3 -m venv test-env
. test-env/bin/activate
pip install -r requirements-test.txt
```

Then you can execute the tests with:

```bash
python -m pytest
```
