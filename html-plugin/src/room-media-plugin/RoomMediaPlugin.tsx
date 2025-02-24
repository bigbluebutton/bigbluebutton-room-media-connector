import * as React from 'react';
import { useState, useEffect } from 'react';
import * as ReactModal from 'react-modal';
import { pluginApolloClient } from './libs/apolloClient'
import './style.css';

import {
    BbbPluginSdk,
    PluginApi,
    ActionButtonDropdownSeparator,
    ActionButtonDropdownOption
} from 'bigbluebutton-html-plugin-sdk';
import { RoomConfig, Layout, RoomMediaPluginProps } from './types';

import PinComponent from './Shared/PinComponent';
import LoaderComponent from './Shared/LoaderComponent';
import LayoutComponent from './Shared/LayoutComponent';

import { USER_SET_MUTED } from './libs/mutations';


export function RoomMediaPlugin({ pluginUuid: uuid }: RoomMediaPluginProps) {
    BbbPluginSdk.initialize(uuid);
    const [showModal, setShowModal] = useState<boolean>(false);
    const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(uuid);
    // @ts-ignore
    window.roomMediaPlugin = { pluginApi };  // Expose pluginApi for appliance application
    const { data: currentUser } = pluginApi.useCurrentUser();

    const pluginSettings = {
        pairingWebsocketUrl: "wss://plugins-bigbluebutton-openstack.uni-osnabrueck.de/room-hub/ws_plugin",
    };

    const [webSocket, setWebSocket] = useState<WebSocket | null>(null);
    const [filteredLayout, setFilteredLayout] = useState<Layout | null>(null);
    const [availableLayouts, setAvailableLayouts] = useState<Layout[] | null>(null);
    const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null);
    const [isCodeVerified, setIsCodeVerified] = useState<boolean | null>(false);
    const [verificationCode, setVerificationCode] = useState<string | null>(null);

    const [roomJoinUrls, setRoomJoinUrls] = useState(null);
    const [pinValue, setPinValue] = useState<string | null>(null);
    const [pinError, setPinError] = useState<boolean>(false);
    const [isPairing, setIsPairing] = useState<boolean>(false);
    const [status, setStatus] = useState<string | null>(null);
    const [apolloClient, setApolloCleint] = useState<any>(null);
    const { data: talkingIndicator } = pluginApi.useTalkingIndicator();
    const [isUserMuted, setIsUserMuted] = useState<boolean>(true);

    const createWebSocket = () => {

        if (!pluginSettings || typeof pluginSettings.pairingWebsocketUrl !== 'string') {
            console.error('Hybrid-Plugin --- Plugin settings or pairingWebsocketUrl URL not yet available');
            return;
        }

        const ws = new WebSocket(pluginSettings.pairingWebsocketUrl);
        ws.onopen = () => {
            console.debug('Hybrid-Plugin --- WebSocket connection opened to:', pluginSettings.pairingWebsocketUrl);
            // Send user input to WebSocket
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    const data = {
                        type: 'PairingPINUserInput',
                        PIN: pinValue,
                    };
                    console.debug('Hybrid-Plugin --- Sending data via WebSocket:', JSON.stringify(data));
                    ws.send(JSON.stringify(data));
                } catch (error) {
                    console.error('Hybrid-Plugin --- Error sending data via WebSocket:', error);
                }
            }
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.debug('Hybrid-Plugin --- websocket onmessage: ', data);

            if (data.type === 'PairingPINFound') {
                setIsCodeVerified(false);
                setVerificationCode(data.verification_code);
            }

            if (data.type === 'VerificationCodeAccepted') {
                setIsPairing(false);
                setIsCodeVerified(true);
                setStatus('layoutSelection');
                setRoomConfig(data.roomConfig);
                setAvailableLayouts(Object.values(data.roomConfig.layouts));
                resetPinValues();
            }

            if (data.type === 'RoomDisconnected') {
                disconnect();
            }

        };

        ws.onclose = (e) => {
            console.info('Hybrid-Plugin --- Room Integration Plugin: Closing WebSocket Connection', e);
            setPinError(false);
            resetPinValues();
            setVerificationCode(null);
            setIsPairing(false);
        };

        setWebSocket(ws);

        return ws;
    };

    const handlePinCompletion = (value: string, index: number): void => {
        if (index === 5) { // Make sure it happens at the end of the pin (6th)
            setPinValue(value);
        }
    };

    const resetPinValues = () => {
        setPinError(false);
        setPinValue(null);
    }

    useEffect(() => {
        if (pinValue) {
            setIsPairing(true);
            setPinError(false);
            createWebSocket();
        }
    }, [pinValue]);

    useEffect(() => {
        // Since it is a real time value, we set it once!
        if (talkingIndicator && talkingIndicator.length > 0) {
            const userTalkingIndicator = talkingIndicator.find((ti) => ti.userId === currentUser?.userId);
            if (userTalkingIndicator) {
                setIsUserMuted(userTalkingIndicator.muted);
            }
        }
    }, [talkingIndicator]);

    const muteCurrentUser = async () => {
        if (apolloClient && !isUserMuted) {
            const result = await apolloClient.mutate({
                mutation: USER_SET_MUTED,
                variables: {
                    userId: currentUser.userId,
                    muted: true,
                },
            });
        }
    }

    const layoutSelection = async (index: number): Promise<void> => {
        const filteredLayout = availableLayouts.find((layout) => layout.index === index);
        setStatus('applyingLayout');
        await muteCurrentUser();
        pluginApi.uiCommands.conference.setSpeakerLevel({ level: 0 });
        setFilteredLayout(filteredLayout);
        setStatus('layoutSelected');
        resetPinValues();
        setShowModal(false);
    }

    const disconnect = async (): Promise<void> => {
        pluginApi.uiCommands.conference.setSpeakerLevel({ level: 1 });
        setShowModal(false);
        try {
            console.debug('Hybrid-Plugin --- Sending disconnect message');
            webSocket.send(JSON.stringify({ type: 'Disconnect' }));
            webSocket.close();
            setWebSocket(null);
        } catch (error) {
            console.error('Hybrid-Plugin --- Room Integration Plugin: Error disconnecting web socket:', error);
        }
    };

    useEffect(() => {
        const prepareApolloClient = async () => {
            const joinUrl = await pluginApi.getJoinUrl({
                "redirect": "true",
                "fullName": currentUser.name,
                "userID": currentUser.userId
            });
            const apolloClient = await pluginApolloClient(joinUrl, pluginApi.getSessionToken());
            setApolloCleint(apolloClient);
        }

        if (currentUser?.role == "MODERATOR") {
            pluginApi.setActionButtonDropdownItems([
                new ActionButtonDropdownSeparator(),
                new ActionButtonDropdownOption({
                    label: 'Room media connection',
                    icon: 'more',
                    tooltip: 'Control the room media connection',
                    allowed: true,
                    onClick: () => {
                        setShowModal(true);
                    },
                }),
            ]);
            prepareApolloClient();
        }
    }, [currentUser]);

    useEffect(() => {
        const fetchJoinUrls = async () => {
            if (!filteredLayout) return;

            const baseJoinParameters = {
                "fullName": roomConfig.bbb_user_name,
                "duplicateSession": "false"
            };
            const controlJoinUrl: string = await pluginApi.getJoinUrl(
                {
                    ...baseJoinParameters
                }
            );

            const screenJoinUrls: { [key: string]: string } = {};

            try {
                await Promise.all(
                    Object.entries(filteredLayout.screens).map(async ([key, value]) => {
                        const joinParametersMap = {
                            ...baseJoinParameters,
                            ...value['bbb-join-parameters']
                        };
                        screenJoinUrls[key] = await pluginApi.getJoinUrl(joinParametersMap);
                    })
                );
                const roomJoinUrls = {
                    "type": "JoinURLs", "urls": { "control": controlJoinUrl, "screens": screenJoinUrls }
                };
                setRoomJoinUrls(roomJoinUrls);
            } catch (error) {
                console.error("Hybrid-Plugin --- Room Integration Plugin: Error fetching join URLs:", error);
            }
        };

        fetchJoinUrls();
    }, [filteredLayout]);

    useEffect(() => {
        try {
            if (roomJoinUrls) {
                console.debug('Hybrid-Plugin --- Sending join urls via WebSocket:', JSON.stringify(roomJoinUrls));
                webSocket.send(JSON.stringify(roomJoinUrls));
            }
        } catch (error) {
            console.error('Hybrid-Plugin --- Room Integration Plugin: Error sending urls via WebSocket:', error);
        }
    }, [webSocket, roomJoinUrls]);

    // Add a useEffect to send a ping message every 30 seconds
    useEffect(() => {
        if (webSocket) {
            const interval = setInterval(() => {
                if (webSocket.readyState === WebSocket.OPEN) {
                    webSocket.send(JSON.stringify({ type: 'Ping' }));
                    console.debug('Hybrid-Plugin --- Sending ping message via WebSocket');
                }
            }, 20000); // 20 seconds

            return () => clearInterval(interval);
        }
    }, [webSocket]);

    return (
        <ReactModal
            className="plugin-modal"
            overlayClassName="modal-overlay"
            isOpen={showModal}
            onRequestClose={() => setShowModal(false)}
            ariaHideApp={false}
        >
            <div
                style={{
                    width: '100%', height: '100%', alignItems: 'center', display: 'flex', flexDirection: 'column',
                }}
            >

                {!verificationCode ?
                    <>
                        {isPairing ?
                            <>
                                <LoaderComponent title="Pairing..." />
                            </>
                            :
                            <>
                                <PinComponent
                                    performCompletion={handlePinCompletion}
                                    hasError={pinError}
                                />
                            </>
                        }
                    </>
                    :
                    !isCodeVerified ?
                        <>
                            <h4>Please verify the pairing code and confirm on the appliance</h4>
                            <h2>{verificationCode}</h2>
                            <button
                                className="button-style"
                                type="button"
                                onClick={disconnect}
                            >
                                Cancel Pairing
                            </button>
                        </>
                        :
                        <>
                            {status ?
                                <>
                                    {status == "accepted" &&
                                        <>
                                            <LoaderComponent title="Accepted, loading layouts..." />
                                            <button
                                                className="button-style"
                                                type="button"
                                                onClick={disconnect}
                                            >
                                                Cancel Pairing
                                            </button>
                                        </>
                                    }

                                    {status == "layoutSelection" &&
                                        <>
                                            <LayoutComponent
                                                layouts={availableLayouts}
                                                prepareSelection={layoutSelection}
                                            />
                                            <button
                                                className="button-style"
                                                type="button"
                                                onClick={disconnect}
                                            >
                                                Cancel Pairing
                                            </button>
                                        </>
                                    }

                                    {status == "applyingLayout" &&
                                        <>
                                            <LoaderComponent title="Applying layout..." />
                                            <button
                                                className="button-style"
                                                type="button"
                                                onClick={disconnect}
                                            >
                                                Cancel Pairing
                                            </button>
                                        </>
                                    }

                                    {status == "layoutSelected" &&
                                        <>
                                            <h3>Room already connected!</h3>
                                            <button
                                                className="button-style"
                                                type="button"
                                                onClick={disconnect}
                                            >
                                                Disconnect
                                            </button>
                                        </>
                                    }
                                </>
                                :
                                <>
                                    <h3>Connection declined</h3>
                                    <button
                                        className="button-style"
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                    >
                                        Close
                                    </button>
                                </>
                            }
                        </>
                }
            </div>
        </ReactModal>
    );
}
