export interface HID {
  requireVerification(accept: () => void, reject: () => void): void;

  verificationAccepted(): void;
  verificationRejected(): void;

  connected(leave: () => void): void;

  disconnected(): void;

  close(): Promise<void>;
}
