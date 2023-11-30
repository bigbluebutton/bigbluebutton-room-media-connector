export interface HID {

  newOffer(accept: () => void, reject: () => void): void;

  acceptedOffer(): void;
  rejectedOffer(): void;

  connected(leave: () => void): void;

  disconnected(): void;

  close(): Promise<void>;
}
