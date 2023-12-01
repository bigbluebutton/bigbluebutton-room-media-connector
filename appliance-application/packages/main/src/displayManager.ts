import Display = Electron.Display;
import { screen } from 'electron';

export class DisplayManager{

  private displays: Display[];

  constructor() {
    this.displays = screen.getAllDisplays();
  }

  public getDisplays(): Display[] {
    return this.displays;
  }

  public getDisplay(label: string): Display | null{
    return this.displays.find(display => display.label === label) || null;
  }



}
