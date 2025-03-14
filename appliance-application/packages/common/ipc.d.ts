type getSettings = () => Promise<{ config: Config; path: string }>;
type close = () => void;
type requireVerification = () => void;
type verificationAccepted = () => void;
type verificationRejected = () => void;
type joinMeeting = (url: string) => void;
type pluginDisconnected = () => void;
type handleLeftMeeting = (callback: () => void) => void;
type handleVerificationAccepted = (callback: () => void) => void;
type handleVerificationRejected = (callback: () => void) => void;

export interface ipcAPI {
  /**
   * Get the settings from the main process
   */
  getSettings: getSettings;

  /**
   * Close application
   */
  close: close;

  /**
   * Request verification response from the user using an HDI device
   */
  requireVerification: requireVerification;

  /**
   * Verification was accepted
   */
  verificationAccepted: verificationAccepted;

  /**
   * Verification was rejected
   */
  verificationRejected: verificationRejected;

  /**
   * Join Urls to join the meeting
   */
  joinMeeting: joinMeeting;

  /**
   * Plugin has disconnected
   */
  pluginDisconnected: pluginDisconnected;

  /**
   * Callback for when the user has left the meeting
   */
  handleLeftMeeting: handleLeftMeeting;

  /**
   * Callback for when the user has accepted the verification using an HDI device
   */
  handleVerificationAccepted: handleVerificationAccepted;

  /**
   * Callback for when the user has rejected the verification using an HDI device
   */
  handleVerificationRejected: handleVerificationRejected;
}
