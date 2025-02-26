import {BrowserWindow} from 'electron';
import type {ApolloClient, NormalizedCacheObject} from '@apollo/client/core';
import {gql} from '@apollo/client/core';
import {BBBGraphQl} from './BBBGraphQl';
import type {DisplayManager} from './displayManager';
import type {Layout} from '../../common/config';
/*
export async function createBBBMeeting(control: string, screens: Array<string>, displayManager: DisplayManager, leftCallback: () => void) {

  const bbbGraphQl = new BBBGraphql(control);
  const connected = await bbbGraphQl.connect();
  if(!connected)
    return false;

  console.log('connected to graphql');

  const joinUrl1 = await bbbGraphQl.getJoinURL({
    'sessionName': 'left',
    'enforceLayout': 'CAMERAS_ONLY',
    'userdata-bbb_hide_actions_bar': false,
    'userdata-bbb_display_notifications': false,
    'userdata-bbb_auto_share_webcam': true,
    'userdata-bbb_listen_only_mode': false,
    'userdata-bbb_skip_check_audio': true,
    'userdata-bbb_skip_video_preview': true,
    'userdata-bbb_preferred_camera_profile': 'high',
    'userdata-bbb_hide_nav_bar': true,
    'userdata-bbb_auto_join_audio': true,
    'userdata-bbb_show_session_details_on_join': false,
  });

  console.log('joinUrl1', joinUrl1.status);
  console.log('joinUrl1', joinUrl1.statusText);
  console.log('joinUrl1', JSON.stringify(joinUrl1.data));
  console.log('joinUrl1', JSON.stringify(joinUrl1.headers));
  console.log('joinUrl1', JSON.stringify(joinUrl1.config));

  const joinUrl2 = await bbbGraphQl.getJoinURL({
    'sessionName': 'right',
    'enforceLayout': 'PRESENTATION_ONLY',
    'userdata-bbb_hide_actions_bar': false,
    'userdata-bbb_display_notifications': false,
    'userdata-bbb_auto_share_webcam': true,
    'userdata-bbb_listen_only_mode': false,
    'userdata-bbb_skip_check_audio': true,
    'userdata-bbb_skip_video_preview': true,
    'userdata-bbb_preferred_camera_profile': 'high',
    'userdata-bbb_hide_nav_bar': true,
    'userdata-bbb_auto_join_audio': true,
    'userdata-bbb_show_session_details_on_join': false,
  });

  console.log('joinUrl2', joinUrl2.status);
  console.log('joinUrl2', joinUrl2.statusText);
  console.log('joinUrl2', JSON.stringify(joinUrl2.data));
  console.log('joinUrl2', JSON.stringify(joinUrl2.headers));
  console.log('joinUrl2', JSON.stringify(joinUrl2.config));

  return new BBBMeeting(screens, displayManager, leftCallback, bbbGraphQl);
}
*/
export async function createBBBMeeting(control: string, layout: Layout, displayManager: DisplayManager, leftCallback: () => void) {

  const bbbGraphQl = new BBBGraphQl(control);
  const connected = await bbbGraphQl.connect(leftCallback);
  if(!connected)
    return false;

  console.log('connected to graphql');

  console.log('layout', layout.label);

  const screens: {[key: string]: string} = {};
  for (const [key, value] of Object.entries(layout.screens)) {
    console.log(key, value);

    const joinUrl = await bbbGraphQl.getJoinURL({
      sessionName: key,
      duplicateSession: false,
      ...value.bbb_join_parameters,
    });

    console.log('status', joinUrl.status);
    console.log('statusText', joinUrl.statusText);
    console.log('data', JSON.stringify(joinUrl.data));
    console.log('headers', JSON.stringify(joinUrl.headers));
    console.log('config', JSON.stringify(joinUrl.config));

    screens[key] = joinUrl.data.response.url;
  }

  return new BBBMeeting(screens, displayManager, leftCallback, bbbGraphQl);
}


class BBBMeeting {
  private readonly screens: {[key: string]: string};
  private displayManager: DisplayManager;

  private windows: BrowserWindow[];
  private apolloClient: ApolloClient<NormalizedCacheObject>;
  private bbbGraphQl: BBBGraphQl;
  private mediaScreen: {url: string, window: BrowserWindow};

  constructor(screens: {[key: string]: string}, displayManager: DisplayManager, leftCallback: () => void, bbbGraphQl: BBBGraphQl) {
    this.screens = screens;
    this.displayManager = displayManager;
    this.windows = [];
    this.bbbGraphQl = bbbGraphQl;

    this.apolloClient = this.bbbGraphQl.getApolloClient();

    this.onUsersLeft(async () => {
      console.log('all users left');
      await this.leave();
      leftCallback();
    });
  }

  private onUsersLeft(callback: () => void) {

    const getMeetingEndData = gql`
      subscription getUserCurrent {
        user_current {
          isModerator
          logoutUrl
          meeting {
            ended
            endedAt
            endedBy
            endedByUserName
            endedReasonCode
          }
        }
      }
     `;

    this.apolloClient
      .subscribe({
        query: getMeetingEndData,
      })
      .subscribe({
        next(data) {
          console.log('getMeetingEndData', JSON.stringify(data));
          if(data.data.user_current[0].meeting.ended === true){
            console.log('Meeting ended');
            callback();
          }
        },
        error(err) {
          console.error('err meeting ended', err);
        },
      });


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
            //callback();
          }
        },
        error(err) {
          console.error('err', err);
        },
      });
  }

  public openScreens() {
    for (const [screen, url] of Object.entries(this.screens)) {
      const screenDisplay = this.displayManager.getDisplay(screen);

      if (screenDisplay == null) {
        console.log('screen ' + screen + ' not found');
        continue;
      }

      console.log('screenDisplay', screenDisplay);

      const partition = 'persist:windows-' + this.windows.length;

      const screenWindow = new BrowserWindow({
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
      //screenWindow.webContents.openDevTools();

      this.windows.push(screenWindow);

      screenWindow.loadURL(url);

      if(url.includes('userdata-bbb_auto_join_audio=true')) {
        this.mediaScreen = {url: url, window: screenWindow};
      }
    }
  }

  public mute() {
    this.executeJavaScriptInMediaScreen('document.querySelectorAll(\'button[data-test="muteMicButton"]\')[0].click()').then(r => console.log(r));
  }

  public unmute() {
    this.executeJavaScriptInMediaScreen('document.querySelectorAll(\'button[data-test="unmuteMicButton"]\')[0].click()').then(r => console.log(r));
  }

  public async getMediaDevices() {
    const command = `
      new Promise((resolve) => {
        navigator.mediaDevices.enumerateDevices().then((devices) => {
          const videoDevices = devices
            .filter(device => device.kind == 'videoinput')
            .map(device => {
              return {
                label: device.label,
                deviceId: device.deviceId,
              };
            });
          resolve(videoDevices)
        });
      });
    `;

    return await this.executeJavaScriptInMediaScreen(command);
  }

  private async executeJavaScriptInMediaScreen(command: string) {
    if(this.mediaScreen.window) {
      return await this.mediaScreen.window.webContents.executeJavaScript(command);
    }
  }

  private closeScreens() {
    this.windows.forEach(window => {
      window.close();
      window.destroy();
    });
  }

  public async leave() {
    console.log('leaving meeting');
    this.closeScreens();
    console.log('leaving bbbGraphQl');
    await this.bbbGraphQl.leaveMeeting();
  }
}
