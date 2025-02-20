import {BrowserWindow} from 'electron';
import {app, screen} from 'electron';
import Display = Electron.Display;
import type {ApolloClient, NormalizedCacheObject} from '@apollo/client/core';
import {gql} from '@apollo/client/core';
import {BBBGraphql} from '/@/bbb-graphql';
import {DisplayManager} from '/@/displayManager';

export class BBBMeeting {
  private screens;

  private displayManager: DisplayManager;
  private control: any;

  private windows: BrowserWindow[];
  private apolloClient: ApolloClient<NormalizedCacheObject>;
  private bbbGraphQl: BBBGraphql;

  constructor(control, screens, displayManager) {
    this.screens = screens;
    this.control = control;

    this.displayManager = displayManager;

    this.windows = [];
  }

  public async join(leftCallback) {
    this.openScreens();

    this.bbbGraphQl = new BBBGraphql(this.control);
    if (await this.bbbGraphQl.connect()) {
      console.log('connected to graphql');

      this.apolloClient = this.bbbGraphQl.getApolloClient();

      this.onUsersLeft(async () => {
        console.log('all users left');
        await this.leave();
        leftCallback();
      });

      return true;
    }

    return false;
  }

  private onUsersLeft(callback) {
    const USER_SESSIONS = gql`
      subscription {
        user_session(where: {connectionsAlive: {_gt: "0"}}) {
          connectionsAlive
          enforceLayout
          sessionName
          sessionToken
        }
      }
    `;

    this.apolloClient
      .subscribe({
        query: USER_SESSIONS,
      })
      .subscribe({
        next(data) {
          const userSessions = data.data.user_session;
          console.log('userSessions', JSON.stringify(userSessions));

          // Is the original user still in the meeting?
          // @ts-ignore
          const isOwnerPresent = userSessions.some(session => session.sessionName == null);

          if (!isOwnerPresent) {
            callback();
          }
        },
        error(err) {
          console.error('err', err);
        },
      });
  }

  private openScreens() {
    for (const [screen, url] of Object.entries(this.screens)) {
      const screenDisplay = this.displayManager.getDisplay(screen);

      if (screenDisplay == null) {
        console.log('screen ' + screen + ' not found');
        continue;
      }

      console.log('screenDisplay', screenDisplay);

      const partition = 'persist:windows-' + this.windows.length;

      const screenWindows = new BrowserWindow({
        show: true,
        width: screenDisplay.size.width,
        height: screenDisplay.size.height,
        x: screenDisplay.bounds.x,
        y: screenDisplay.bounds.y,
        fullscreen: true,
        webPreferences: {
          partition: partition,
          contextIsolation: true,
        },
      });

      this.windows.push(screenWindows);

      screenWindows.loadURL(url);
    }
  }

  private closeScreens() {
    this.windows.forEach(window => {
      window.close();
      window.destroy();
    });
  }

  public async leave() {
    this.closeScreens();
    await this.bbbGraphQl.leaveMeeting();
    await this.apolloClient.stop();
  }
}
