import { BrowserWindow} from 'electron';
import {app, screen} from 'electron';
import Display = Electron.Display;
import type {ApolloClient, NormalizedCacheObject} from '@apollo/client/core';
import { gql } from '@apollo/client/core';
import {BBBGraphql} from '/@/bbb-graphql';
import {DisplayManager} from "/@/displayManager";

export class BBBMeeting{

  private screens;

  private displayManager: DisplayManager;
  private control: any;

  private windows: BrowserWindow[];
  private apolloClient: ApolloClient<NormalizedCacheObject>;
  private user_id: any;
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
    if(await this.bbbGraphQl.connect()){
      console.log('connected to graphql');

      this.user_id = this.bbbGraphQl.getUserId();
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
    const USER_COUNT = gql`subscription($userId: String) {
      user_aggregate(where: {extId: {_nlike: $userId}}) {
        aggregate {
          count
        }
      }
    }`;

    this.apolloClient.subscribe({
      query: USER_COUNT,
      variables: {
        userId: this.user_id+'%',
      },
    })
      .subscribe({
        next(data) {
          const userCount = data.data.user_aggregate.aggregate.count;

          console.log('userCount', userCount);
          if(userCount == 0) {
            callback();
          }
        },
        error(err) { console.error('err', err); },
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

      //screenWindows.webContents.openDevTools();


    }
  }

  private closeScreens() {
    this.windows.forEach((window) => {
      window.close();
      window.destroy();
    });
  }

  public async leave(){
    this.closeScreens();
    await this.bbbGraphQl.leaveMeeting();
  }
}
