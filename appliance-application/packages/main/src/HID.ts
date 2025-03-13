export interface HID {
  requireVerification(accept: () => void, reject: () => void): void;

  verificationAccepted(): void;
  verificationRejected(): void;

  connected(actions: HIDActions): void;

  disconnected(): void;

  close(): Promise<void>;
}

export interface HIDActions {
  leave: () => void;
  mute: () => void;
  unmute: () => void;
  layout1: () => void;
  layout2: () => void;
  layout3: () => void;
}
