import * as React from 'react';
import { useState, useEffect, useRef } from 'react';
import * as ReactModal from 'react-modal';
import { pluginApolloClient } from './libs/apolloClient';
import './style.css';

import {
    BbbPluginSdk,
    PluginApi,
    ActionButtonDropdownSeparator,
    ActionButtonDropdownOption
} from 'bigbluebutton-html-plugin-sdk';
import { RoomConfig, RoomMediaPluginProps } from './types';

import PinComponent from './Shared/PinComponent';
import LoaderComponent from './Shared/LoaderComponent';

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

    const webSocketRef = useRef<WebSocket | null>(null);
    const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null);
    const [isCodeVerified, setIsCodeVerified] = useState<boolean>(false);
    const [verificationCode, setVerificationCode] = useState<string | null>(null);
    const [verificationCodeRejected, setVerificationCodeRejected] = useState<boolean>(false);
    const [roomJoinUrls, setRoomJoinUrls] = useState(null);
    const [pinValue, setPinValue] = useState<string | null>(null);
    const [pinError, setPinError] = useState<boolean>(false);
    const [isPairing, setIsPairing] = useState<boolean>(false);
    const [apolloClient, setApolloClient] = useState<any>(null);
    const { data: talkingIndicator } = pluginApi.useTalkingIndicator();
    const [isUserMuted, setIsUserMuted] = useState<boolean>(true);
    const [isRoomDisconnected, setIsRoomDisconnected] = useState<boolean>(false);

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
                console.debug('Hybrid-Plugin --- Pairing Pin found!');
                setIsCodeVerified(false);
                setPinError(false);
                setVerificationCode(data.verification_code);
            }

            if (data.type === 'PairingPINFailed') {
                console.debug('Hybrid-Plugin --- Pairing Pin *not* found!');
                setPinError(true);
                setIsPairing(false);
                setPinValue(null);
            }

            if (data.type === 'VerificationCodeAccepted') {
                console.debug('Hybrid-Plugin --- Verification Code accepted.');
                setRoomConfig(data.roomConfig);
                finalizePairing();
            }

            if (data.type === 'VerificationCodeRejected') {
                console.debug('Hybrid-Plugin --- verification Code rejected!');
                setIsCodeVerified(true);
                setVerificationCodeRejected(true);
            }

            if (data.type === 'RoomDisconnected') {
                console.debug('Hybrid-Plugin --- Room disconnected!');
                setIsRoomDisconnected(true);
            }

        };

        ws.onclose = (e) => {
            console.info('Hybrid-Plugin --- Room Integration Plugin: Closing WebSocket Connection', e);
            resetPlugin();
            setShowModal(false);
        };

        webSocketRef.current = ws;
    };

    const resetPlugin = () => {
        setPinValue(null);
        setVerificationCode(null);
        setVerificationCodeRejected(false);
        setIsCodeVerified(false);
        setIsPairing(false);
        setIsRoomDisconnected(false);
    };

    const handlePinCompletion = (value: string, index: number): void => {
        if (index === 5) { // Make sure it happens at the end of the pin (6th)
            setPinValue(value);
        }
    };

    useEffect(() => {
        if (pinValue) {
            setIsPairing(true);
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
        console.debug('Hybrid-Plugin --- Muting current user');
        if (apolloClient && !isUserMuted) {
            const result = await apolloClient.mutate({
                mutation: USER_SET_MUTED,
                variables: {
                    userId: currentUser.userId,
                    muted: true,
                },
            });
        }
    };

    useEffect(() => {
        const fetchJoinUrls = async () => {
            if (roomConfig) {
                console.debug('Hybrid-Plugin --- Fetching join urls');
                const joinUrl: string = await pluginApi.getJoinUrl({
                    "fullName": roomConfig.bbb_user_name,
                    "duplicateSession": "false"
                });

                setRoomJoinUrls({
                    "type": "JoinURL", "joinUrl": joinUrl
                });
                console.debug('Hybrid-Plugin --- Got Join URL:', joinUrl);
            }
        };

        fetchJoinUrls();
    }, [roomConfig]);

    const finalizePairing = async () => {
        pluginApi.uiCommands.conference.setSpeakerLevel({ level: 0 });
        setPinError(false);
        setPinValue(null);
        setShowModal(false);
        setIsPairing(false);
        setIsCodeVerified(true);
        setPinValue(null);
    };

    const disconnect = async (): Promise<void> => {
        pluginApi.uiCommands.conference.setSpeakerLevel({ level: 1 });
        if (webSocketRef.current) {
            console.debug('Hybrid-Plugin --- Sending disconnect message');
            webSocketRef.current.send(JSON.stringify({ type: 'Disconnect' }));
            webSocketRef.current.close();
            webSocketRef.current = null;
        } else {
            console.error('Hybrid-Plugin --- Room Integration Plugin: Websocket not available for disconnect');
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
            setApolloClient(apolloClient);
        };

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
        try {
            if (roomJoinUrls && webSocketRef.current?.readyState === WebSocket.OPEN) {
                console.debug('Hybrid-Plugin --- Sending join urls via WebSocket:', JSON.stringify(roomJoinUrls));
                webSocketRef.current.send(JSON.stringify(roomJoinUrls));
                muteCurrentUser();
            }
        } catch (error) {
            console.error('Hybrid-Plugin --- Room Integration Plugin: Error sending urls via WebSocket:', error);
        }
    }, [roomJoinUrls]);

    useEffect(() => {
        if (webSocketRef.current) {
            const interval = setInterval(() => {
                if (webSocketRef.current?.readyState === WebSocket.OPEN) {
                    webSocketRef.current.send(JSON.stringify({ type: 'Ping' }));
                    console.debug('Hybrid-Plugin --- Sending ping message via WebSocket');
                }
            }, 20000); // 20 seconds

            return () => clearInterval(interval);
        }
    }, [webSocketRef.current]);

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
                {verificationCodeRejected ? (
                    <>
                        <h4>Verification Code Rejected by Room</h4>
                        <button
                            className="button-style"
                            type="button"
                            onClick={() => {
                                resetPlugin();
                                setShowModal(false);
                            }}
                        >
                            Ok
                        </button>
                    </>
                ) : isRoomDisconnected ? (
                    <>
                        <h4>Room Disconnected</h4>
                        <button
                            className="button-style"
                            type="button"
                            onClick={resetPlugin}
                        >
                            Ok
                        </button>
                    </>
                ) : !verificationCode ? (
                    <>
                        {isPairing ? (
                            <>
                                <LoaderComponent title="Pairing..." />
                                <button
                                    className="button-style"
                                    type="button"
                                    onClick={disconnect}
                                >
                                    Cancel Pairing
                                </button>
                            </>
                        ) : (
                            <>
                                <PinComponent
                                    performCompletion={handlePinCompletion}
                                    hasError={pinError}
                                />
                            </>
                        )}
                    </>
                ) : !isCodeVerified ? (
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
                ) : (
                    <>
                        <h3>Room "{roomConfig?.bbb_user_name}" is connected!</h3>
                        <button
                            className="button-style"
                            type="button"
                            onClick={disconnect}
                        >
                            Disconnect
                        </button>
                    </>
                )}
            </div>
        </ReactModal>
    );
}
