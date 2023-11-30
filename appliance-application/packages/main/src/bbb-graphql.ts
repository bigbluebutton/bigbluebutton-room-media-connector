import type { NormalizedCacheObject} from '@apollo/client/core';
import {ApolloClient, InMemoryCache, gql} from '@apollo/client/core';
import axios from 'axios';
import { SubscriptionClient } from 'subscriptions-transport-ws';
import { WebSocketLink } from '@apollo/client/link/ws';
import { ProxyWebsocket } from './ProxyWebsocket';

global.WebSocket = ProxyWebsocket;


export class BBBGraphql{

  private joinUrl: string;
  private cookies: string[];
  private sessionToken: string;
  private host: string;
  private authToken: string;
  private apolloClient: ApolloClient<NormalizedCacheObject>;
  private userId: string | null;
  private subscriptionClient: SubscriptionClient;

  constructor(joinUrl: string) {
    this.joinUrl = joinUrl;
  }

  public async connect() {

    if(!await this.requestSessionToken()){
      console.log('requestSessionToken failed');
      return false;
    }

    if(!await this.enterMeeting()){
      console.log('enterMeeting failed');
      return false;
    }

    if(!await this.connectToGraphQL()){
      console.log('connectToGraphQL failed');
      return false;
    }

    return true;
  }

  private async requestSessionToken() {
    try {
      console.log('requestSessionToken', this.joinUrl);

      const joinUrl = new URL(this.joinUrl);

      this.userId = joinUrl.searchParams.get('userID');

      const response = await axios.get(this.joinUrl, { withCredentials: true, maxRedirects: 0, validateStatus: function (status) {
          return status == 200 || status == 302;
        } });
      if (response.status === 302) {

        const redirectUrl =  response.headers['location'];
        console.log('redirectUrl', redirectUrl);
        const url = new URL(redirectUrl);


        this.sessionToken = url.searchParams.get('sessionToken');
        this.host = url.host;
        this.cookies = response.headers['set-cookie'];

        return true;
      }
    }
    catch (e) {
      console.log(e);
    }

    return false;
  }

  private async enterMeeting() {

    try {
      const response = await axios.get(`https://${this.host}/bigbluebutton/api/enter?sessionToken=${this.sessionToken}`, { withCredentials: true , headers: { Cookie: this.cookies }});
      if (response.status === 200) {
        this.authToken = response.data.response.authToken;

        return true;
      }
    }
    catch (e) {
      console.log(e);
    }

    return false;
  }

  public async connectToGraphQL() {

    await this.initApolloClient();

    const JOIN_MUTATION = gql`
      mutation UserJoin($authToken: String!, $clientType: String!) {
        userJoin(
          authToken: $authToken,
          clientType: $clientType,
        )
      }
    `;

    // Execute the mutation
    const result = await this.apolloClient.mutate({
      mutation: JOIN_MUTATION,
      variables: {
        authToken: this.authToken,
        clientType: 'html5',
      },
    });

    if(!result.data.userJoin){
      console.log('userJoin failed');
      return false;
    }

    // wait for 500 ms-seconds
    await new Promise(resolve => setTimeout(resolve, 500));

    return true;
  }

  private async initApolloClient(debug: boolean = false) {

    const jSessionCookie = this.cookies.find((cookie) => {
      return cookie.startsWith('JSESSIONID');
    }).split(';')[0];

    let promiseResolve, promiseReject;

    const connectionReady = new Promise((resolve, reject) => {
      promiseResolve = resolve;
      promiseReject = reject;
    });

    this.subscriptionClient = new SubscriptionClient(`wss://${this.host}/v1/graphql`, {
      reconnect: true,
      timeout: 30000,
      connectionParams: {
        headers: {
          'X-Session-Token': this.sessionToken,
          Cookie: jSessionCookie,
        },
      },
      connectionCallback: (error, result) => {
        if (error) {
          promiseReject(error);
        } else {
          promiseResolve(result);
        }
      },
    }, ProxyWebsocket);

    if(debug){
      this.debugSubscription();
    }

    const link = new WebSocketLink(this.subscriptionClient);

    const apolloClient = new ApolloClient({link, cache: new InMemoryCache()});

    await connectionReady;

    this.apolloClient = apolloClient;
  }

  public getApolloClient(){
    return this.apolloClient;
  }

  public getUserId(){
    return this.userId;
  }

  private debugSubscription(){
    this.subscriptionClient.onConnecting(() => {
      console.log('client connecting');
    });

    this.subscriptionClient.onConnected(() => {
      console.log('client connected');
    });

    this.subscriptionClient.onReconnecting(() => {
      console.log('client reconnecting');
    });

    this.subscriptionClient.onReconnected(() => {
      console.log('client reconnected');
    });

    this.subscriptionClient.onDisconnected(() => {
      console.log('client disconnected');
    });

    this.subscriptionClient.onError((error) => {
      console.log('client error', error);
    });
  }

  public async leaveMeeting() {
    await this.apolloClient.clearStore();
    this.apolloClient.stop();
    this.subscriptionClient.close();
  }
}
