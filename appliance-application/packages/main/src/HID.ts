export interface HID {
  requireVerification(accept: () => void, reject: () => void): void;

  verificationAccepted(): void;
  verificationRejected(): void;

  selectedLayout(index: number): void;

  connected(actions: HIDActions): void;

  disconnected(): void;

  close(): Promise<void>;
}

export interface HIDActions {
  leave: () => void;
  mute: () => void;
  unmute: () => void;
  changeLayout: (index: number) => void;
}
