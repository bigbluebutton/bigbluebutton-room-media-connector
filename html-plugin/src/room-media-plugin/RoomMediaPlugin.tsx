import * as React from 'react';
import {useState, useEffect} from 'react';
import * as ReactModal from 'react-modal';
import {pluginApolloClient} from './libs/apolloClient'
import './style.css';

import {
    BbbPluginSdk,
    PluginApi,
    ActionButtonDropdownSeparator,
    ActionButtonDropdownOption
} from 'bigbluebutton-html-plugin-sdk';
import {RoomConfig, Layout, ResponseData, RoomMediaPluginProps} from './types';

import PinComponent from './Shared/PinComponent';
import LoaderComponent from './Shared/LoaderComponent';
import LayoutComponent from './Shared/LayoutComponent';
import ConfirmationComponent from './Shared/ConfirmationComponent';

import { USER_SET_MUTED, SET_MUTED } from './libs/mutations';


export function RoomMediaPlugin({pluginUuid: uuid}: RoomMediaPluginProps) {
    BbbPluginSdk.initialize(uuid);
    const [showModal, setShowModal] = useState<boolean>(false);
    const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(uuid);
    const {data: currentUser} = pluginApi.useCurrentUser();
    //const {data: pluginSettings} = pluginApi.usePluginSettings();

    const pluginSettings = {
        //pairingWebsocketUrl: "wss://bbb-dev-bigbluebutton-openstack.uni-osnabrueck.de/hybrid/ws",
        pairingWebsocketUrl: "wss://plugins-bigbluebutton-openstack.uni-osnabrueck.de/room-hub/ws_plugin",
    };

    const [webSocket, setWebSocket] = useState<WebSocket | null>(null);
    const [filteredLayout, setFilteredLayout] = useState<Layout | null>(null);
    const [tempFilteredLayout, setTempFilteredLayout] = useState<Layout | null>(null);
    const [filteredLayouts, setFilteredLayouts] = useState<Layout[] | null>(null);
    const [roomConfig, setRoomConfig] = useState<RoomConfig | null>(null);
    const [isCodeVerified, setIsCodeVerified] = useState<boolean | null>(false);
    const [verificationCode, setVerificationCode] = useState<string | null>(null);
    
    const [roomJoinUrls, setRoomJoinUrls] = useState(null);
    const [pinValue, setPinValue] = useState<string | null>(null);
    const [pinError, setPinError] = useState<boolean>(false);
    const [isPairing, setIsPairing] = useState<boolean>(false);
    const [status, setStatus] = useState<string | null>(null);
    const [confirmationTitle, setConfirmationTitle] = useState<string | null>(null);
    const [apolloClient, setApolloCleint] = useState<any>(null);
    const {data: talkingIndicator} = pluginApi.useTalkingIndicator();
    const [isUserMuted, setIsUserMuted] = useState<boolean>(true);

    const extractFilterLayouts = (jsonData: ResponseData, index: number) => {
        const layoutsArray = Object.values(jsonData.roomConfig.layouts);
        setFilteredLayouts(layoutsArray);
        const filteredLayout = layoutsArray.find((layout) => layout.index === index);
        setFilteredLayout(filteredLayout);
    }

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
                    console.debug('Hybrid-Plugin --- Data was sent via WebSocket:', JSON.stringify(data));
                } catch (error) {
                    console.error('Hybrid-Plugin --- Error sending data via WebSocket:', error);
                }
            }
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.debug('Hybrid-Plugin --- websocket onmessage: ', data);

            if (data.type === 'PairingPINFound') {
                console.debug('Hybrid-Plugin --- Setting verficitation code:', data.verification_code);
                setIsCodeVerified(false);
                setVerificationCode(data.verification_code);
            }

            if (data.type === 'VerificationCodeAccepted') {
                setIsPairing(false);
                setIsCodeVerified(true);
                setStatus('layoutSelection');
                setRoomConfig(data.roomConfig);
                extractFilterLayouts(data, 0);
                resetPinValues();
            }

        };

        ws.onclose = (e) => {
            console.info('Hybrid-Plugin --- Room Integration Plugin: WebSocket connection closed', e);
            setPinError(true);
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

    const prepareLayoutSelection = async (index: number): Promise<void>  => {
        const filteredLayout = filteredLayouts.find((layout) => layout.index === index);
        setTempFilteredLayout(filteredLayout);
        setConfirmationTitle(filteredLayout.label);
        setStatus('applyingLayout');
        await muteCurrentUser();
        setFilteredLayout(tempFilteredLayout);
        setStatus('layoutSelected');
        resetPinValues();
        setShowModal(false);
    }

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
                "redirect": "true",
                "fullName": roomConfig.bbb_user_name,
                "userID": roomConfig.bbb_user_id
            };
            const controlJoinUrl: string = await pluginApi.getJoinUrl(
                {
                    ...baseJoinParameters,
                    userID: baseJoinParameters.userID,
                    role: "MODERATOR"
                }
            );

            const screenJoinUrls: { [key: string]: string } = {};

            try {
                await Promise.all(
                    Object.entries(filteredLayout.screens).map(async ([key, value]) => {
                        const joinParametersMap = {
                            ...baseJoinParameters,
                            ...value['bbb-join-parameters'],
                            userID: baseJoinParameters.userID + "-" + key,
                            role: 'MODERATOR'
                        };
                        console.log(joinParametersMap);
                        screenJoinUrls[key] = await pluginApi.getJoinUrl(joinParametersMap);
                    })
                );
                const roomJoinUrls = {
                    "type": "JoinURLs", "urls": {"control": controlJoinUrl, "screens": screenJoinUrls}
                };
                setRoomJoinUrls(roomJoinUrls);
                console.info("Hybrid-Plugin --- Room Join URLs: ", roomJoinUrls)
            } catch (error) {
                console.error("Hybrid-Plugin --- Room Integration Plugin: Error fetching join URLs:", error);
            }
        };

        fetchJoinUrls();
    }, [filteredLayout]);

    useEffect(() => {
        try {
            if (roomJoinUrls) {
                webSocket.send(JSON.stringify(roomJoinUrls));
            }
        } catch (error) {
            console.error('Hybrid-Plugin --- Room Integration Plugin: Error sending urls via WebSocket:', error);
        }
    }, [webSocket, roomJoinUrls]);

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
                    </>
                        :
                        <>
                            {status ?
                                <>
                                    {status == "accepted" &&
                                        <>
                                            <LoaderComponent title="Accepted, loading layouts..." />
                                        </>
                                    }

                                    {status == "layoutSelection" &&
                                        <>
                                            <LayoutComponent
                                                layouts={filteredLayouts}
                                                prepareSelection={prepareLayoutSelection}
                                            />
                                        </>
                                    }

                                    {status == "applyingLayout" &&
                                        <>
                                            <LoaderComponent title="Applying layout..." />
                                        </>
                                    }

                                    {status == "layoutSelected" &&
                                        <>
                                            <h2>Room already connected!</h2>
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
