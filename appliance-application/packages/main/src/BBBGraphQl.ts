import axios from 'axios';
import type {Client} from 'graphql-ws';
import { createClient} from 'graphql-ws';
import WebSocket from 'ws';
import type {
  NormalizedCacheObject} from '@apollo/client/core';
import {
  ApolloClient,
  InMemoryCache,
  ApolloLink,
  gql,
} from '@apollo/client/core';
import {GraphQLWsLink} from '@apollo/client/link/subscriptions';

export class BBBGraphQl {
  private joinUrl: string;
  private cookies: string[] | undefined = undefined;
  private sessionToken: string | null = null;
  private host: string = '';
  private authToken: string = '';
  private apolloClient: ApolloClient<NormalizedCacheObject> | undefined;
  private graphQlClient: Client;

  constructor(joinUrl: string) {
    this.joinUrl = joinUrl;
  }

  public async connect(closeCallback: () => void) {
    if (!(await this.requestSessionToken())) {
      console.error('Failed to request session token.');
      return false;
    }

    if (!(await this.initApolloClient())) {
      console.error('Failed to initialize Apollo Client.');
      return false;
    }

    if (!(await this.getAuthToken())) {
      console.error('Failed to retrieve the authToken.');
      return false;
    }

    if (!(await this.connectToGraphQL())) {
      console.error('Failed to connect to GraphQL.');
      return false;
    }

    return true;
  }

  private async requestSessionToken(): Promise<boolean> {
    try {
      console.debug('Join link used:', this.joinUrl);

      const response = await axios.get(this.joinUrl, {
        withCredentials: true,
        maxRedirects: 0,
        validateStatus: function (status) {
          return status == 200 || status == 302;
        },
      });
      if (response.status === 302) {
        const redirectUrl = response.headers['location'];
        console.debug('redirectUrl', redirectUrl);
        const url = new URL(redirectUrl);

        this.sessionToken = url.searchParams.get('sessionToken');
        this.host = url.host;
        this.cookies = response.headers['set-cookie'];
        console.debug('cookies', this.cookies);

        return true;
      }
    } catch (error) {
      console.error(error);
    }

    return false;
  }

  private async getAuthToken(): Promise<boolean> {
    if (!this?.apolloClient) {
      return false;
    }
    const USER_CURRENT_QUERY = gql`
      query getUserCurrent {
        user_current {
          authToken
        }
      }
    `;

    const {data} = await this.apolloClient.query({
      query: USER_CURRENT_QUERY,
      fetchPolicy: 'network-only',
    });

    if (data && data?.user_current?.[0]?.authToken) {
      console.log('IN getAuthToken: ', data);
      this.authToken = data.user_current[0].authToken;
      return true;
    }

    return false;
  }

  public async connectToGraphQL() {

    console.debug('--- Connecting to GraphQL... ---');


    const JOIN_MUTATION = gql`
      mutation UserJoin($authToken: String!, $clientType: String!, $clientIsMobile: Boolean!) {
        userJoinMeeting(
          authToken: $authToken
          clientType: $clientType
          clientIsMobile: $clientIsMobile
        )
      }
    `;

    if (!this.authToken) {
      console.error('authToken is not set.');
      return false;
    }

    if (!this?.apolloClient) {
      console.error('apolloClient is not set.');
      return false;
    }

    // Execute the mutation
    const result = await this.apolloClient.mutate({
      mutation: JOIN_MUTATION,
      variables: {
        authToken: this.authToken,
        clientType: 'html5',
        clientIsMobile: false,
      },
    });

    // Check the result
    console.debug('userJoin result:', result);

    if (!result.data.userJoinMeeting) {
      console.log('userJoinMeeting failed');
      return false;
    }

    // wait for 500 ms-seconds
    await new Promise(resolve => setTimeout(resolve, 500));

    return true;
  }

  public async getJoinURL(params: object) {

    return await axios.get(`https://${this.host}/bigbluebutton/api/getJoinUrl`, {
      withCredentials: true,
      headers: {
        Cookie: this.cookies,
      },
      params: {
        sessionToken: this.sessionToken,
        ...params,
      },
    });

  }

  private async initApolloClient(): Promise<boolean> {
    let wsLink;
    try {
      // Check if cookies are not null before attempting to find a cookie
      if (!this.cookies) {
        console.error('Cookies are not set.');
        return false;
      }

      const jSessionCookie = this.cookies
        ?.find(cookie => cookie.startsWith('JSESSIONID'))
        ?.split(';')[0];
      console.debug('jSessionCookie', jSessionCookie);

      // You need to override the WebSocket class to add the cookie
      class WebSocketWithCookie extends WebSocket {
        constructor(address: string, protocols?: string | string[]) {
          super(address, protocols, {
            headers: {
              Cookie: jSessionCookie,
            },
          });
        }
      }

      this.graphQlClient = createClient({
        url: `wss://${this.host}/graphql`,
        keepAlive: 10000,
        webSocketImpl: WebSocketWithCookie, // Pass the custom WebSocket class
        connectionParams: {
          headers: {
            'X-Session-Token': this.sessionToken,
            'X-ClientSessionUUID': '1234',
            'X-ClientType': 'HTML5',
            'X-ClientIsMobile': 'false',
          },
        },
        shouldRetry: (error: any) => {
          if (error.code === 4403) {
            console.error('GraphQL-Client: Session token is invalid');
            return false;
          }
          return true;
        },
        on: {
          error: error => {
            console.error('GraphQL-Client: Error: on subscription to server:', error);
          },
          closed: () => {
            console.info('GraphQL-Client: Connection closed');
          },
          connected: socket => {
            console.info('GraphQL-Client: Connected to server');
          },
          connecting: () => {
            console.info('GraphQL-Client: Connecting to server');
          },
        },
      });

      console.debug('graphQlClient: ', this.graphQlClient);
      const graphqlWsLink = new GraphQLWsLink(this.graphQlClient);
      wsLink = ApolloLink.from([graphqlWsLink]);
      wsLink.setOnError(error => {
        throw new Error('Error: on apollo connection'.concat(JSON.stringify(error) || ''));
      });
    } catch (error) {
      console.error('Error creating WebSocketLink: ', error);
      return false;
    }
    try {
      this.apolloClient = new ApolloClient({
        link: wsLink,
        cache: new InMemoryCache(),
      });

    } catch (error) {
      console.error('Error creating Apollo Client: ', error);
      return false;
    }
    return true;
  }

  public getApolloClient() {
    return this.apolloClient;
  }

  public async leaveMeeting() {
    if (this.apolloClient) {
      await this.apolloClient.clearStore();
      this.apolloClient.stop();
      this.graphQlClient.dispose();
    }
  }
}
