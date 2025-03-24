import * as path from 'path';
import sharp from 'sharp';
import type {StreamDeck} from '@elgato-stream-deck/node';
import {fileURLToPath} from 'url';
import type { HIDActions} from './HID';
import BaseStreamDeckHID from '/@/BaseStreamDeckHID';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class StreamDeckHID extends BaseStreamDeckHID {
  static SCREEN_PIXEL_WIDTH = 240;
  static SCREEN_PIXEL_HEIGHT = 160;
  static BUTTON_PIXEL_WIDTH = 80;
  static BUTTON_PIXEL_HEIGHT = 80;

  static BUTTONS = {
    accept: { index: 0, width: StreamDeckHID.BUTTON_PIXEL_WIDTH, height: StreamDeckHID.BUTTON_PIXEL_HEIGHT },
    reject: { index: 1, width: StreamDeckHID.BUTTON_PIXEL_WIDTH, height: StreamDeckHID.BUTTON_PIXEL_HEIGHT },
    mute: { index: 0, width: StreamDeckHID.BUTTON_PIXEL_WIDTH, height: StreamDeckHID.BUTTON_PIXEL_HEIGHT },
    unmute: { index: 1, width: StreamDeckHID.BUTTON_PIXEL_WIDTH, height: StreamDeckHID.BUTTON_PIXEL_HEIGHT },

    layout_0: {index: 5, width: StreamDeckHID.BUTTON_PIXEL_WIDTH, height: StreamDeckHID.BUTTON_PIXEL_HEIGHT },
    layout_1: { index: 6, width: StreamDeckHID.BUTTON_PIXEL_WIDTH, height: StreamDeckHID.BUTTON_PIXEL_HEIGHT },
    layout_2: { index: 7, width: StreamDeckHID.BUTTON_PIXEL_WIDTH, height: StreamDeckHID.BUTTON_PIXEL_HEIGHT },
    layout_3: { index: 8, width: StreamDeckHID.BUTTON_PIXEL_WIDTH, height: StreamDeckHID.BUTTON_PIXEL_HEIGHT },
    layout_4: { index: 9, width: StreamDeckHID.BUTTON_PIXEL_WIDTH, height: StreamDeckHID.BUTTON_PIXEL_HEIGHT },

    leave: { index: 14, width: StreamDeckHID.BUTTON_PIXEL_WIDTH, height: StreamDeckHID.BUTTON_PIXEL_HEIGHT },

  };


  constructor(streamDeck: StreamDeck, layouts: number) {
    super(streamDeck, layouts);

    if(layouts > 5){
      console.warn('Not enough buttons for more than 5 layouts');
    }

    this.showBBBScreen();


    this.streamDeck.on('up', button => {
      console.log('key %d up', button.index);

      if (this.hasVerificationPending) {
        switch (button.index) {
          case StreamDeckHID.BUTTONS.accept.index:
            this.acceptCallback();
            break;
          case StreamDeckHID.BUTTONS.reject.index:
            this.rejectCallback();
            break;
        }
      }

      if (this.isConnected) {
        switch (button.index) {
          case StreamDeckHID.BUTTONS.mute.index:
            this.actions.mute();
            break;
          case StreamDeckHID.BUTTONS.unmute.index:
            this.actions.unmute();
            break;
          case StreamDeckHID.BUTTONS.leave.index:
            this.actions.leave();
            break;
          case StreamDeckHID.BUTTONS.layout_0.index:
            this.changeLayout(0);
            break;
          case StreamDeckHID.BUTTONS.layout_1.index:
            this.changeLayout(1);
            break;
          case StreamDeckHID.BUTTONS.layout_2.index:
            this.changeLayout(2);
            break;
          case StreamDeckHID.BUTTONS.layout_3.index:
            this.changeLayout(3);
            break;
          case StreamDeckHID.BUTTONS.layout_4.index:
            this.changeLayout(4);
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

    this.setButtonImage(StreamDeckHID.BUTTONS.accept, 'accept.png');
    this.setButtonImage(StreamDeckHID.BUTTONS.reject, 'reject.png');
  }

  async showBBBScreen(): void {
    super.showBBBScreen();

    this.streamDeck.fillPanelBuffer(await sharp(path.resolve(__dirname, '../assets/bbb.png'))
      .flatten()
      .resize(
        StreamDeckHID.SCREEN_PIXEL_WIDTH,
        StreamDeckHID.SCREEN_PIXEL_HEIGHT,
        {
          fit: 'contain',
          background: {r: 0, g: 0, b: 0},
        },
      )
      .raw()
      .toBuffer());
  }

  hideVerificationButtons(): void {
    this.streamDeck.clearKey(StreamDeckHID.BUTTONS.accept.index);
    this.streamDeck.clearKey(StreamDeckHID.BUTTONS.reject.index);
  }

  async showLayoutButtons(): void {

    // Get list of all buttons starting with "layout_"
    const layoutButtons = Object.keys(StreamDeckHID.BUTTONS).filter(key => key.startsWith('layout_'));

    // Loop through all layout buttons and set the image for the selected layout to black and white and the others to white and black
    for (const key of layoutButtons) {
      const button = StreamDeckHID.BUTTONS[key];

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

    this.setButtonImage(StreamDeckHID.BUTTONS.mute, 'mute.png');
    this.setButtonImage(StreamDeckHID.BUTTONS.unmute, 'unmute.png');
    this.setButtonImage(StreamDeckHID.BUTTONS.leave, 'leave.png');

    this.showLayoutButtons(0);

    this.isConnected = true;
    this.actions = actions;
  }
}
