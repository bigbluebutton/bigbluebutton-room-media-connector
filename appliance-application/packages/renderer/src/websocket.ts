import type {RoomConfig} from '../../common/config';

export default class BBBWebSocket {
  public wsURL: string;
  public reconnect_interval_time: number;
  public ping_interval_time: number;
  public roomConfig;

  private connection: WebSocket | null = null;

  private ping_interval: NodeJS.Timeout;
  private pairing_pin_callback: (PIN: string) => void;
  private verification_callback: (VerificationCode: string) => void;
  private connection_status_callback: (status: boolean) => void;
  private plugin_disconnected_callback: () => void;
  private join_url_callback: (URL: string) => void;

  constructor(roomConfig: RoomConfig, wsURL: string, reconnect_interval_time: number = 1000, ping_interval_time: number = 1000) {
    this.roomConfig = roomConfig;
    this.wsURL = wsURL;
    this.reconnect_interval_time = reconnect_interval_time;
    this.ping_interval_time = ping_interval_time;

    window.addEventListener('unload', () => {
      if (this.connection?.readyState == WebSocket.OPEN) {
        console.log('closing connection');
        this.disconnect();
      }
    });
  }

  connect() {
    try {
      this.connection = new WebSocket(this.wsURL);

      this.connection.onopen = () => {
        this.connection_status_callback(true);

        this.connection?.send(
          JSON.stringify({
            type: 'RegisterRoom',
            roomConfig: {
              bbb_user_name: this.roomConfig.bbb_user_name,
            },
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

        if (data.type == 'JoinURL') {
          this.join_url_callback(data.joinUrl);
        }

        /*
        @TODO: Remove, old implementation where the plugin generated the join URLs
        if (data.type == 'JoinURLs') {
          this.join_urls_callback(data.urls);
        }
        */

        if (data.type == 'PluginDisconnected') {
          this.plugin_disconnected_callback();
        }
      };

    } catch (error) {
      console.error('Error connecting to WebSocket', error);
      this.connection_status_callback(false);
      this.reconnect();
      return;
    }
  }

  disconnect() {
    clearInterval(this.ping_interval);
    this.connection?.close();
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
    this.connection?.send(JSON.stringify({type: 'Ping'}));
  }

  disconnectFromPlugin() {
    this.connection?.send(JSON.stringify({type: 'Disconnect'}));
  }

  acceptVerification() {
    this.connection?.send(JSON.stringify({type: 'VerificationCodeResponse', status: true}));
  }

  rejectVerification() {
    this.connection?.send(JSON.stringify({type: 'VerificationCodeResponse', status: false}));
  }

  setConnectionStatusCallback(callback: (status: boolean) => void) {
    this.connection_status_callback = callback;
  }

  setPairingPinCallback(callback: (PIN: string) => void) {
    this.pairing_pin_callback = callback;
  }

  setVerificationCallback(callback: (VerificationCode: string) => void) {
    this.verification_callback = callback;
  }

  setJoinUrlCallback(callback: (url: string) => void) {
    this.join_url_callback = callback;
  }

  setPluginDisconnectedCallback(callback: () => void) {
    this.plugin_disconnected_callback = callback;
  }
}
