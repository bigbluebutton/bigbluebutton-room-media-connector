import * as path from 'path';
import sharp, {Sharp} from 'sharp';
import type {StreamDeck} from '@elgato-stream-deck/node';
import {fileURLToPath} from 'url';
import type {HID, HIDActions} from './HID';
import type {StreamDeckButtonControlDefinitionLcdFeedback} from '@elgato-stream-deck/core/dist/controlDefinition';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class StreamDeckHID implements HID {
  static BBB_BUTTON: StreamDeckButtonControlDefinitionLcdFeedback;
  static ACCEPT_BUTTON: StreamDeckButtonControlDefinitionLcdFeedback;
  static REJECT_BUTTON: StreamDeckButtonControlDefinitionLcdFeedback;
  static LEAVE_BUTTON: StreamDeckButtonControlDefinitionLcdFeedback;
  static MUTE_BUTTON: StreamDeckButtonControlDefinitionLcdFeedback;
  static UNMUTE_BUTTON: StreamDeckButtonControlDefinitionLcdFeedback;

  private streamDeck: StreamDeck;

  private BBB_IMG;
  private BBB_IMG_LG;
  private ACCEPT_IMG;
  private REJECT_IMG;
  private LEAVE_IMG;
  private MUTE_IMG;
  private UNMUTE_IMG;

  private hasVerificationPending = false;

  private acceptCallback: () => void;
  private rejectCallback: () => void;

  private leaveCallback: () => void;
  private muteCallback: () => void;
  private unmuteCallback: () => void;
  private isConnected: boolean;

  constructor(streamDeck: StreamDeck) {
    this.streamDeck = streamDeck;

    this.streamDeck.clearPanel();

    this.streamDeck.setBrightness(100);

    this.initIcons().then(() => {
      this.showBBBScreen();
    });

    this.streamDeck.on('up', button => {
      console.log('key %d up', button.index);

      if(this.hasVerificationPending){
        if (button.index === StreamDeckHID.ACCEPT_BUTTON.index) {
          this.acceptCallback();
        }

        if (button.index === StreamDeckHID.REJECT_BUTTON.index) {
          this.rejectCallback();
        }
      }

      if(this.isConnected){
        if (button.index === StreamDeckHID.MUTE_BUTTON.index) {
          this.muteCallback();
        }

        if (button.index === StreamDeckHID.UNMUTE_BUTTON.index) {
          this.unmuteCallback();
        }

        if (button.index === StreamDeckHID.LEAVE_BUTTON.index) {
          this.leaveCallback();
        }
      }

    });

    this.streamDeck.on('error', error => {
      console.error(error);
    });
  }

  async initIcons() {
    const controls = this.streamDeck.CONTROLS;
    let rows = 0;
    let columns = 0;

    controls.forEach(control => {
      if (control.type === 'button' && control.feedbackType == 'lcd') {
        rows = Math.max(rows, control.row);
        columns = Math.max(columns, control.column);
      }
    });

    controls.forEach(control => {
      if (control.type === 'button' && control.feedbackType == 'lcd') {
        if (control.row == 0 && control.column == 0) {
          StreamDeckHID.BBB_BUTTON = control;
        }
        if (control.row == rows && control.column == columns) {
          StreamDeckHID.LEAVE_BUTTON = control;
          StreamDeckHID.MUTE_BUTTON = control;
        }
        if (control.row == 1 && control.column == 0) {
          StreamDeckHID.ACCEPT_BUTTON = control;
          StreamDeckHID.UNMUTE_BUTTON = control;
        }
        if (control.row == 1 && control.column == 1) {
          StreamDeckHID.REJECT_BUTTON = control;
        }
      }
    });

    this.BBB_IMG = await this.getButtonImageBuffer(StreamDeckHID.BBB_BUTTON, 'bbb.png');
    this.ACCEPT_IMG = await this.getButtonImageBuffer(StreamDeckHID.ACCEPT_BUTTON, 'accept.png');
    this.REJECT_IMG = await this.getButtonImageBuffer(StreamDeckHID.REJECT_BUTTON, 'reject.png');
    this.LEAVE_IMG = await this.getButtonImageBuffer(StreamDeckHID.LEAVE_BUTTON, 'leave.png');
    this.MUTE_IMG = await this.getButtonImageBuffer(StreamDeckHID.MUTE_BUTTON, 'mute.png');
    this.UNMUTE_IMG = await this.getButtonImageBuffer(StreamDeckHID.UNMUTE_BUTTON, 'unmute.png');

    this.BBB_IMG_LG = await sharp(path.resolve(__dirname, '../assets/bbb.png'))
      .flatten()
      .resize(
        StreamDeckHID.BBB_BUTTON.pixelSize.width * (columns + 1),
        StreamDeckHID.BBB_BUTTON.pixelSize.height * (rows + 1),
        {
          fit: 'contain',
          background: {r: 0, g: 0, b: 0},
        },
      )
      .raw()
      .toBuffer();
  }

  async getButtonImageBuffer(button: StreamDeckButtonControlDefinitionLcdFeedback, image: string): Promise<Buffer> {
    return sharp(path.resolve(__dirname, '../assets/'+image))
      .flatten()
      .resize(button.pixelSize.width, button.pixelSize.height)
      .raw()
      .toBuffer();
  }

  requireVerification(accept: () => void, reject: () => void): void {
    this.hasVerificationPending = true;

    this.acceptCallback = accept;
    this.rejectCallback = reject;

    this.showVerificationButtons();
  }

  verificationAccepted(): void {
    this.hasVerificationPending = false;
    this.hideVerificationButtons();
  }

  verificationRejected(): void {
    this.hasVerificationPending = false;
    this.hideVerificationButtons();
  }

  showVerificationButtons(): void {
    this.streamDeck.clearPanel();

    this.streamDeck.fillKeyBuffer(StreamDeckHID.BBB_BUTTON.index, this.BBB_IMG);
    this.streamDeck.fillKeyBuffer(StreamDeckHID.ACCEPT_BUTTON.index, this.ACCEPT_IMG);
    this.streamDeck.fillKeyBuffer(StreamDeckHID.REJECT_BUTTON.index, this.REJECT_IMG);
  }

  showBBBScreen(): void {
    this.streamDeck.clearPanel();
    this.streamDeck.fillPanelBuffer(this.BBB_IMG_LG);
  }

  hideVerificationButtons(): void {
    this.streamDeck.clearKey(StreamDeckHID.ACCEPT_BUTTON.index);
    this.streamDeck.clearKey(StreamDeckHID.REJECT_BUTTON.index);
  }

  async close(): Promise<void> {
    this.streamDeck.removeAllListeners();
    await this.streamDeck.close();
  }

  connected(actions: HIDActions): void {
    this.streamDeck.clearPanel();

    this.streamDeck.fillKeyBuffer(StreamDeckHID.BBB_BUTTON.index, this.BBB_IMG);
    this.streamDeck.fillKeyBuffer(StreamDeckHID.MUTE_BUTTON.index, this.MUTE_IMG);
    this.streamDeck.fillKeyBuffer(StreamDeckHID.UNMUTE_BUTTON.index, this.UNMUTE_IMG);
    this.streamDeck.fillKeyBuffer(StreamDeckHID.LEAVE_BUTTON.index, this.LEAVE_IMG);

    this.isConnected = true;
    this.muteCallback = actions.mute;
    this.unmuteCallback = actions.unmute;
    this.leaveCallback = actions.leave;
  }

  disconnected(): void {
    this.isConnected = false;
    this.showBBBScreen();
  }
}
