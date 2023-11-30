
export default class BBBWebSocket {
  public url: string;
  public reconnect_interval_time: number;
  public ping_interval_time: number;

  private connection: WebSocket;

  private ping_interval: number;
  private new_pin_callback;
  private offer_callback;
  private connection_status_callback;

  constructor(url, reconnect_interval_time = 1000, ping_interval_time = 1000) {
    this.url = url;
    this.reconnect_interval_time = reconnect_interval_time;
    this.ping_interval_time = ping_interval_time;
  }

  connect(roomConfig) {
    try{
      this.connection = new WebSocket(this.url);
    } catch (error) {
      this.connection_status_callback(false);
      this.reconnect(roomConfig);
      return;
    }

    this.connection.addEventListener('open', () => {
      this.connection_status_callback(true);

      this.connection.send(JSON.stringify({config: roomConfig}));

      this.ping_interval = setInterval(() => {
        this.ping();
      }, this.ping_interval_time);

    });

    this.connection.addEventListener('close', () => {
      this.connection_status_callback(false);
      this.reconnect(roomConfig);
    });

    this.connection.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);

      if(data.action == 'new_pin'){
        this.new_pin_callback(data.pin.toString());
      }

      if(data.action == 'start'){
        this.offer_callback(data.urls, data.pairing_pin.toString());
      }
    });
  }

  reconnect(roomConfig, timeout: number|null = null) {
    const reconnect_timeout = timeout || this.reconnect_interval_time;
    setTimeout(() => {
      this.connect(roomConfig);
    }, reconnect_timeout);
  }

  ping() {
    this.connection.send(JSON.stringify({type: 'ping'}));
  }

  acceptOffer() {
    this.connection.send(JSON.stringify({type: 'offer_response', response: 'accept'}));
  }

  rejectOffer() {
    this.connection.send(JSON.stringify({type: 'offer_response', response: 'reject'}));
  }

  setConnectionStatusCallback(callback) {
    this.connection_status_callback = callback;
  }

  setNewPinCallback(callback) {
    this.new_pin_callback = callback;
  }

  setOfferCallback(callback) {
    this.offer_callback = callback;
  }
}
