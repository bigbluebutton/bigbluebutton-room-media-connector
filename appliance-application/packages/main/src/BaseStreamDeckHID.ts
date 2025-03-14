import * as path from 'path';
import * as fs from 'node:fs';
import sharp from 'sharp';
import type {StreamDeck} from '@elgato-stream-deck/node';
import {fileURLToPath} from 'url';
import type {HID, HIDActions} from './HID';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default abstract class BaseStreamDeckHID implements HID {
  protected streamDeck: StreamDeck;
  protected layouts: number = 0;
  protected activeLayout: number = 0;

  protected hasVerificationPending = false;

  protected acceptCallback!: () => void;
  protected rejectCallback!: () => void;

  protected actions: HIDActions;

  protected isConnected!: boolean;

  constructor(streamDeck: StreamDeck, layouts: number) {
    this.streamDeck = streamDeck;
    this.layouts = layouts;

    this.streamDeck.clearPanel();
    this.streamDeck.setBrightness(100);

    this.streamDeck.on('error', error => {
      console.error(error);
    });
  }

  async getButtonImageBuffer(width, height, image: string): Promise<Buffer> {
    return sharp(path.resolve(__dirname, '../assets/' + image))
      .flatten()
      .resize(width, height)
      .raw()
      .toBuffer();
  }

  async getLayoutButtonImageBuffer(width, height, label: string, backgroundColor: string, textColor: string): Promise<Buffer> {
    // load svg file as string
    let svg = fs.readFileSync(path.resolve(__dirname, '../assets/Layout.svg'), 'utf8');
    // replace "L1" with label
    svg = svg.replace('L1', label);
    // replace style="fill: #FFF" with background color
    svg = svg.replace('style="fill: #FFF"', 'style="fill: ' + backgroundColor + '"');
    // replace fill="#000" with text color
    svg = svg.replace('fill="#000"', 'fill="' + textColor + '"');

    return sharp(Buffer.from(svg))
      .flatten()
      .resize(width, height)
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
  }

  showBBBScreen(): void {
    this.streamDeck.clearPanel();
  }

  hideVerificationButtons(): void {
  }


  async close(): Promise<void> {
    this.streamDeck.removeAllListeners();
    await this.streamDeck.close();
  }

  connected(actions: HIDActions): void {
    this.isConnected = true;
    this.muteCallback = actions.mute;
    this.unmuteCallback = actions.unmute;
    this.leaveCallback = actions.leave;

    this.layout1Callback = actions.layout1;
    this.layout2Callback = actions.layout2;
    this.layout3Callback = actions.layout3;
  }

  disconnected(): void {
    this.isConnected = false;
    this.showBBBScreen();
  }
}
