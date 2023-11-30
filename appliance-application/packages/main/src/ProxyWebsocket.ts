import { WebSocket} from 'ws';

export class ProxyWebsocket extends WebSocket {
  constructor(url, protocols, options) {
    super(url, protocols, options);
    console.debug('ProxyWebsocket', url, protocols, options);

    this.on('open', () => {
      console.debug('ProxyWebsocket open');
    });

    this.on('message', (data) => {
      console.debug('ProxyWebsocket message', data.toString());
    });

    this.on('close', () => {
      console.debug('ProxyWebsocket close');
    });
  }

  send(data, options, cb) {
    console.log('ProxyWebsocket send', data, options, cb);
    super.send(data, options, cb);
  }
}
