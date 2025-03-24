import * as path from 'path';
import sharp from 'sharp';
import type {StreamDeck} from '@elgato-stream-deck/node';
import {fileURLToPath} from 'url';
import type { HIDActions} from './HID';
import BaseStreamDeckHID from '/@/BaseStreamDeckHID';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class StreamDeckMiniHID extends BaseStreamDeckHID {
  static SCREEN_PIXEL_WIDTH = 240;
  static SCREEN_PIXEL_HEIGHT = 160;
  static BUTTON_PIXEL_WIDTH = 80;
  static BUTTON_PIXEL_HEIGHT = 80;

  static BUTTONS = {
    accept: { index: 0, width: StreamDeckMiniHID.BUTTON_PIXEL_WIDTH, height: StreamDeckMiniHID.BUTTON_PIXEL_HEIGHT },
    reject: { index: 1, width: StreamDeckMiniHID.BUTTON_PIXEL_WIDTH, height: StreamDeckMiniHID.BUTTON_PIXEL_HEIGHT },
    mute: { index: 0, width: StreamDeckMiniHID.BUTTON_PIXEL_WIDTH, height: StreamDeckMiniHID.BUTTON_PIXEL_HEIGHT },
    unmute: { index: 1, width: StreamDeckMiniHID.BUTTON_PIXEL_WIDTH, height: StreamDeckMiniHID.BUTTON_PIXEL_HEIGHT },
    leave: { index: 2, width: StreamDeckMiniHID.BUTTON_PIXEL_WIDTH, height: StreamDeckMiniHID.BUTTON_PIXEL_HEIGHT },
    layout_0: {index: 3, width: StreamDeckMiniHID.BUTTON_PIXEL_WIDTH, height: StreamDeckMiniHID.BUTTON_PIXEL_HEIGHT },
    layout_1: { index: 4, width: StreamDeckMiniHID.BUTTON_PIXEL_WIDTH, height: StreamDeckMiniHID.BUTTON_PIXEL_HEIGHT },
    layout_2: { index: 5, width: StreamDeckMiniHID.BUTTON_PIXEL_WIDTH, height: StreamDeckMiniHID.BUTTON_PIXEL_HEIGHT },
  };


  constructor(streamDeck: StreamDeck, layouts: number) {
    super(streamDeck, layouts);

    if(layouts > 3){
      console.warn('Not enough buttons for more than 3 layouts');
    }

    this.showBBBScreen();


    this.streamDeck.on('up', button => {
      console.log('key %d up', button.index);

      if (this.hasVerificationPending) {
        switch (button.index) {
          case StreamDeckMiniHID.BUTTONS.accept.index:
            this.acceptCallback();
            break;
          case StreamDeckMiniHID.BUTTONS.reject.index:
            this.rejectCallback();
            break;
        }
      }

      if (this.isConnected) {
        switch (button.index) {
          case StreamDeckMiniHID.BUTTONS.mute.index:
            this.actions.mute();
            break;
          case StreamDeckMiniHID.BUTTONS.unmute.index:
            this.actions.unmute();
            break;
          case StreamDeckMiniHID.BUTTONS.leave.index:
            this.actions.leave();
            break;
          case StreamDeckMiniHID.BUTTONS.layout_0.index:
            this.changeLayout(0);
            break;
          case StreamDeckMiniHID.BUTTONS.layout_1.index:
            this.changeLayout(1);
            break;
          case StreamDeckMiniHID.BUTTONS.layout_2.index:
            this.changeLayout(2);
            break;
        }
      }
    });

    this.streamDeck.on('error', error => {
      console.error(error);
    });
  }

  async setButtonImage(button, image){
    this.streamDeck.fillKeyBuffer(button.index, await this.getButtonImageBuffer(button.width, button.height, image));
  }

  changeLayout(index: number): void {
    // Check if the selected layout is the same as the current layout
    if (index === this.activeLayout) {
      return;
    }

    // Check if the selected layout is valid
    if(index >= this.layouts) {
      return;
    }

    this.actions.changeLayout(index);
  }

  showVerificationButtons(): void {
    super.showVerificationButtons();

    this.setButtonImage(StreamDeckMiniHID.BUTTONS.accept, 'accept.png');
    this.setButtonImage(StreamDeckMiniHID.BUTTONS.reject, 'reject.png');
  }

  async showBBBScreen(): void {
    super.showBBBScreen();

    this.streamDeck.fillPanelBuffer(await sharp(path.resolve(__dirname, '../assets/bbb.png'))
      .flatten()
      .resize(
        StreamDeckMiniHID.SCREEN_PIXEL_WIDTH,
        StreamDeckMiniHID.SCREEN_PIXEL_HEIGHT,
        {
          fit: 'contain',
          background: {r: 0, g: 0, b: 0},
        },
      )
      .raw()
      .toBuffer());
  }

  hideVerificationButtons(): void {
    this.streamDeck.clearKey(StreamDeckMiniHID.BUTTONS.accept.index);
    this.streamDeck.clearKey(StreamDeckMiniHID.BUTTONS.reject.index);
  }

  async showLayoutButtons(): void {

    // Get list of all buttons starting with "layout_"
    const layoutButtons = Object.keys(StreamDeckMiniHID.BUTTONS).filter(key => key.startsWith('layout_'));

    // Loop through all layout buttons and set the image for the selected layout to black and white and the others to white and black
    for (const key of layoutButtons) {
      const button = StreamDeckMiniHID.BUTTONS[key];

      const layoutIndex = parseInt(key.split('_')[1]);

      if(layoutIndex >= this.layouts)
        continue;

      if(layoutIndex == this.activeLayout){
        this.streamDeck.fillKeyBuffer(button.index, await this.getLayoutButtonImageBuffer(button.width, button.height, 'L'+(layoutIndex+1), "#0D70D7", "#FFF"));
      } else {
        this.streamDeck.fillKeyBuffer(button.index, await this.getLayoutButtonImageBuffer(button.width, button.height, 'L'+(layoutIndex+1), "#000", "#FFF"));
      }
    }
  }

  selectedLayout(layout: number): void {
    if (layout < 0 || layout > 2) {
      throw new Error('Invalid layout index');
    }

    this.activeLayout = layout;

    this.showLayoutButtons();
  }

  connected(actions: HIDActions): void {
    this.streamDeck.clearPanel();

    this.setButtonImage(StreamDeckMiniHID.BUTTONS.mute, 'mute.png');
    this.setButtonImage(StreamDeckMiniHID.BUTTONS.unmute, 'unmute.png');
    this.setButtonImage(StreamDeckMiniHID.BUTTONS.leave, 'leave.png');

    this.showLayoutButtons(0);

    this.isConnected = true;
    this.actions = actions;
  }
}
