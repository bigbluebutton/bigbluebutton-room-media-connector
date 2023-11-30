import * as path from 'path';
import sharp from 'sharp';
import {StreamDeck} from '@elgato-stream-deck/node';
import { fileURLToPath } from 'url';
import {HID} from '/@/HID';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class StreamDeckHID implements HID {

  static readonly BBB_BUTTON: number = 0;
  static readonly ACCEPT_BUTTON: number = 1;
  static readonly  REJECT_BUTTON: number = 4;
  static readonly  LEAVE_BUTTON: number = 5;

  private streamDeck: StreamDeck;

  private BBB_IMG;
  private BBB_IMG_LG;
  private ACCEPT_IMG;
  private REJECT_IMG;
  private LEAVE_IMG;



  private hasOffer = false;

  private acceptCallback: () => void;
  private rejectCallback: () => void;

  private leaveCallback: () => void;
  private isConnected: boolean;


  constructor(streamDeck: StreamDeck) {
    this.streamDeck = streamDeck;

    this.streamDeck.clearPanel();

    this.initIcons().then(() => {
      this.showBBBScreen();
    });

    this.streamDeck.on('up', (keyIndex) => {
      console.log('key %d up', keyIndex);

      if (keyIndex === StreamDeckHID.ACCEPT_BUTTON && this.hasOffer) {
        this.hasOffer = false;
        this.hideOfferButtons();
        this.acceptCallback();
      }

      if (keyIndex === StreamDeckHID.REJECT_BUTTON && this.hasOffer) {
        this.hasOffer = false;
        this.hideOfferButtons();
        this.rejectCallback();
      }

      if (keyIndex === StreamDeckHID.LEAVE_BUTTON) {
        this.isConnected = true;
        this.leaveCallback();
      }
    });

    this.streamDeck.on('error', (error) => {
      console.error(error);
    });
  }

  async initIcons() {
    this.BBB_IMG = await sharp(path.resolve( __dirname,'../assets/bbb.png'))
      .flatten()
      .resize(this.streamDeck.ICON_SIZE, this.streamDeck.ICON_SIZE)
      .raw()
      .toBuffer();

    this.BBB_IMG_LG = await sharp(path.resolve( __dirname,'../assets/bbb.png'))
      .flatten()
      .resize(this.streamDeck.ICON_SIZE*this.streamDeck.KEY_COLUMNS, this.streamDeck.ICON_SIZE*this.streamDeck.KEY_ROWS, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0}
      })
      .raw()
      .toBuffer();

    this.ACCEPT_IMG = await sharp(path.resolve( __dirname,'../assets/accept.png'))
      .flatten()
      .resize(this.streamDeck.ICON_SIZE, this.streamDeck.ICON_SIZE)
      .raw()
      .toBuffer();

    this.REJECT_IMG = await sharp(path.resolve(__dirname,'../assets/reject.png'))
      .flatten()
      .resize(this.streamDeck.ICON_SIZE, this.streamDeck.ICON_SIZE)
      .raw()
      .toBuffer();

    this.LEAVE_IMG = await sharp(path.resolve( __dirname,'../assets/leave.png'))
      .flatten()
      .resize(this.streamDeck.ICON_SIZE, this.streamDeck.ICON_SIZE)
      .raw()
      .toBuffer();
  }

  newOffer(accept: () => void, reject: () => void): void {
    this.hasOffer = true;

    this.acceptCallback = accept;
    this.rejectCallback = reject;

    this.showOfferButtons();
  }

  acceptedOffer(): void {
    this.hasOffer = false;
    this.hideOfferButtons();
  }

  rejectedOffer(): void {
    this.hasOffer = false;
    this.hideOfferButtons();
  }

  showOfferButtons(): void {
    this.streamDeck.clearPanel();

    this.streamDeck.fillKeyBuffer(StreamDeckHID.BBB_BUTTON, this.BBB_IMG);
    this.streamDeck.fillKeyBuffer(StreamDeckHID.ACCEPT_BUTTON, this.ACCEPT_IMG);
    this.streamDeck.fillKeyBuffer(StreamDeckHID.REJECT_BUTTON, this.REJECT_IMG);
  }

  showBBBScreen(): void {
    this.streamDeck.clearPanel();
    this.streamDeck.fillPanelBuffer(this.BBB_IMG_LG);
  }

  hideOfferButtons(): void {
    this.streamDeck.clearKey(StreamDeckHID.ACCEPT_BUTTON);
    this.streamDeck.clearKey(StreamDeckHID.REJECT_BUTTON);
  }

  async close(): Promise<void> {
    await this.streamDeck.clearPanel();
    await this.streamDeck.removeAllListeners();
    await this.streamDeck.close();
  }

  connected(leave: () => void): void {
    this.streamDeck.clearPanel();

    this.streamDeck.fillKeyBuffer(StreamDeckHID.BBB_BUTTON, this.BBB_IMG);
    this.streamDeck.fillKeyBuffer(StreamDeckHID.LEAVE_BUTTON, this.LEAVE_IMG);

    this.isConnected = true;
    this.leaveCallback = leave;
  }

  disconnected(): void {
    this.isConnected = false;
    this.showBBBScreen();
  }

}
