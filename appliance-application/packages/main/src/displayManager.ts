import Display = Electron.Display;
import {screen} from 'electron';

export class DisplayManager {
  private displays: Display[];

  constructor() {
    this.displays = screen.getAllDisplays();
  }

  public getDisplays(): Display[] {
    return this.displays;
  }

  public getDisplay(identifier: string | number): Display | null {
    return this.displays.find(display => display.id === Number(identifier) || display.label === identifier) || null;
  }
}
