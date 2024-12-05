# BigBlueButton Room Integration Room Hub

## What is it?

This pairing brokers the connection between the [BBB HTML plugin](../html-plugin/) and the [appliance application](../appliance-application/)
to connect the device that is installed in a physical lecture room into the running BigBlueButton meeting.

## Running the Server from source

TODO

### Connecting to the other Components

The communication with the BBB server requires TLS.
So in order to get this to work with the HTML plugin and the appliance application you need to proxy
the pairing server with a webserver with a valid SSL certificate.

You can e.g. run the pairing server on an existing BigBlueButton server.
In this case you just add a file `/etc/bigbluebutton/nginx/hybrid.nginx` with the following contents on the BBB server:

```nginx
location /hybrid {
  proxy_pass http://127.0.0.1:8080/;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "Upgrade";
}
```

## Running the Server in production

TODO