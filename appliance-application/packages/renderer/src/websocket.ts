export default class BBBWebSocket {
  public url: string;
  public reconnect_interval_time: number;
  public ping_interval_time: number;
  public roomConfig;

  private connection: WebSocket | null;

  private ping_interval: number;
  private pairing_pin_callback;
  private verification_callback;
  private connection_status_callback;
  private plugin_disconnected_callback;
  private join_urls_callback;

  constructor(roomConfig, url, reconnect_interval_time = 1000, ping_interval_time = 1000) {
    this.roomConfig = roomConfig;
    this.url = url;
    this.reconnect_interval_time = reconnect_interval_time;
    this.ping_interval_time = ping_interval_time;

    window.addEventListener('unload', () => {
      if (this.connection.readyState == WebSocket.OPEN) {
        console.log('closing connection');
        this.disconnect();
      }
    });
  }

  connect() {
    try {
      this.connection = new WebSocket(this.url);
    } catch (error) {
      this.connection_status_callback(false);
      this.reconnect();
      return;
    }

    this.connection.onopen = () => {
      this.connection_status_callback(true);

      this.connection.send(
        JSON.stringify({
          type: 'RegisterRoom',
          roomConfig: this.roomConfig,
        }),
      );

      this.ping_interval = setInterval(() => {
        this.ping();
      }, this.ping_interval_time);
    };

    this.connection.onclose = () => {
      clearInterval(this.ping_interval);
      this.reconnect(0);
    };

    this.connection.onmessage = event => {
      const data = JSON.parse(event.data);

      if (data.type == 'PairingPIN') {
        this.pairing_pin_callback(data.PIN);
      }

      if (data.type == 'VerificationCode') {
        this.verification_callback(data.verification_code);
      }

      if (data.type == 'JoinURLs') {
        this.join_urls_callback(data.urls);
      }

      if (data.type == 'PluginDisconnected') {
        this.plugin_disconnected_callback();
      }
    };
  }

  disconnect() {
    clearInterval(this.ping_interval);
    this.connection.close();
    this.connection = null;
  }

  reconnect(timeout: number | null = null) {
    if (timeout == null) {
      timeout = this.reconnect_interval_time;
    }
    setTimeout(() => {
      this.connect();
    }, timeout);
  }

  ping() {
    this.connection.send(JSON.stringify({type: 'Ping'}));
  }

  disconnectFromPlugin() {
    this.connection.send(JSON.stringify({type: 'Disconnect'}));
  }

  acceptVerification() {
    this.connection.send(JSON.stringify({type: 'VerificationCodeResponse', status: true}));
  }

  rejectVerification() {
    this.connection.send(JSON.stringify({type: 'VerificationCodeResponse', status: false}));
  }

  setConnectionStatusCallback(callback) {
    this.connection_status_callback = callback;
  }

  setPairingPinCallback(callback) {
    this.pairing_pin_callback = callback;
  }

  setVerificationCallback(callback) {
    this.verification_callback = callback;
  }

  setJoinUrlCallback(callback) {
    this.join_urls_callback = callback;
  }

  setPluginDisconnectedCallback(callback) {
    this.plugin_disconnected_callback = callback;
  }
}
