import {
    ApolloClient, InMemoryCache, ApolloLink,
} from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';

interface Response {
    response: {
        returncode: string;
        version: string;
        apiVersion: string;
        bbbVersion: string;
        graphqlWebsocketUrl: string;
    }
}

export const pluginApolloClient = async (joinUrl: string, sessionToken: string): Promise<any> => {
    let graphqlWebsocketUrl: string = '';
    let wsLink;
    let graphqlClient: any;
    const pathSplit = joinUrl.split('/join?');
    if (pathSplit?.length == 0) {
        throw new Error('Hybrid-Plugin --- Failed to match BBB join URI');
    }
    const hostUrl = pathSplit[0];

    const response = await fetch(hostUrl, {
        headers: {
            'Content-Type': 'application/json',
        },
    });
    if (response.ok) {
        const responseJson: Response = await response.json();
        graphqlWebsocketUrl = responseJson?.response?.graphqlWebsocketUrl ?? '';
    }

    if (graphqlWebsocketUrl === '') {
        throw new Error('Hybrid-Plugin --- Failed to fetch graphql websocket url');
    }

    const clientSessionUUID = sessionStorage.getItem('clientSessionUUID');

    if (!clientSessionUUID) {
        throw new Error('Hybrid-Plugin --- Failed to get client session uuid');
    }

    try {
        const subscription = createClient({
            url: graphqlWebsocketUrl,
            retryAttempts: 3,
            keepAlive: 99999999999,
            connectionParams: {
                headers: {
                    'X-Session-Token': sessionToken,
                    'X-ClientSessionUUID': clientSessionUUID,
                    'X-ClientType': 'HTML5',
                    'X-ClientIsMobile': 'false'
                }
            },
            on: {
                error: error => {
                    console.error(`Hybrid-Plugin --- Error: on subscription to server: ${error}`);
                },
                closed: () => {
                    console.info('Hybrid-Plugin --- Connection closed')
                },
                connected: socket => {
                    console.info('Hybrid-Plugin --- Connected to server')
                },
                connecting: () => {
                    console.info('Hybrid-Plugin --- Connecting to server')
                },
                message: message => {
                    console.info('Hybrid-Plugin --- Received message:', message)
                },
            }
        });

        const graphqlWsLink = new GraphQLWsLink(subscription);

        wsLink = ApolloLink.from([graphqlWsLink]);

        wsLink.setOnError(error => {
            throw new Error('Hybrid-Plugin --- Error: on apollo connection'.concat(JSON.stringify(error) || ''));
        });
    } catch (error) {
        throw new Error('Hybrid-Plugin --- Failed to build apollo client:' + error);
    }

    try {
        graphqlClient = new ApolloClient({
            link: wsLink,
            cache: new InMemoryCache(),
            connectToDevTools: true,
        });

        return graphqlClient;
    } catch (error) {
        console.error('Hybrid-Plugin --- Error creating Apollo Client: ', error);
    }

    throw new Error('Hybrid-Plugin --- Unable to create Apollo Client!');
}

export default { pluginApolloClient };
