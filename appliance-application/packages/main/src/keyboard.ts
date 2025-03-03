import type {HID, HIDActions} from './HID';
import { globalShortcut } from 'electron';

export class KeyboardHID implements HID {

  private hasVerificationPending = false;

  private acceptCallback: () => void;
  private rejectCallback: () => void;

  private leaveCallback: () => void;
  private leaveCallback: () => void;
  private muteCallback: () => void;
  private unmuteCallback: () => void;
  private isConnected: boolean;

  constructor() {
    globalShortcut.register('CommandOrControl+Alt+M', () => {
      if (this.isConnected) {
        this.muteCallback();
      }
    });
    globalShortcut.register('CommandOrControl+Alt+U', () => {
      if (this.isConnected) {
        this.unmuteCallback();
      }
    });
    globalShortcut.register('CommandOrControl+Alt+L', () => {
      if (this.isConnected) {
        this.leaveCallback();
      }
    });

    globalShortcut.register('CommandOrControl+Alt+A', () => {
      if (this.hasVerificationPending) {
        this.acceptCallback();
      }
    });
    globalShortcut.register('CommandOrControl+Alt+R', () => {
      if (this.hasVerificationPending) {
        this.rejectCallback();
      }
    });

  }

  requireVerification(accept: () => void, reject: () => void): void {
    this.hasVerificationPending = true;

    this.acceptCallback = accept;
    this.rejectCallback = reject;
  }

  verificationAccepted(): void {
    this.hasVerificationPending = false;
  }

  verificationRejected(): void {
    this.hasVerificationPending = false;
  }

  async close(): Promise<void> {

  }

  connected(actions: HIDActions): void {

    this.isConnected = true;
    this.muteCallback = actions.mute;
    this.unmuteCallback = actions.unmute;
    this.leaveCallback = actions.leave;
  }

  disconnected(): void {
    this.isConnected = false;
  }
}
