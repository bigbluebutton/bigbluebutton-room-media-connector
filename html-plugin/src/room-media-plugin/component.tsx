import * as React from 'react';
import {useState, useEffect} from 'react';
import * as ReactModal from 'react-modal';
import './style.css';

import {
    BbbPluginSdk,
    PluginApi,
    ActionButtonDropdownSeparator,
    ActionButtonDropdownOption
} from 'bigbluebutton-html-plugin-sdk';
import {Config, Layout, ResponseData, RoomMediaPluginProps} from './types';

export function RoomMediaPlugin({pluginUuid: uuid}: RoomMediaPluginProps) {
    BbbPluginSdk.initialize(uuid);
    const [showModal, setShowModal] = useState<boolean>(false);
    const pluginApi: PluginApi = BbbPluginSdk.getPluginApi(uuid);
    const {data: currentUser} = pluginApi.useCurrentUser();
    const {data: pluginSettings} = pluginApi.usePluginSettings();
    const [inputValue, setInputValue] = useState('');
    const [webSocket, setWebSocket] = useState<WebSocket | null>(null);
    const [filteredLayout, setFilteredLayouts] = useState<Layout | null>(null);
    const [roomConfig, setRoomConfig] = useState<Config | null>(null);
    const [offerResponse, setOfferResponse] = useState<string | null>(null);
    const [pairingPin, setPairingPin] = useState<string | null>(null);
    const [roomJoinUrls, setRoomJoinUrls] = useState(null);

    const filterLayouts = (jsonData: ResponseData, index: number) => {
        const layoutsArray = Object.values(jsonData.config.layouts);
        const filteredLayout = layoutsArray.find((layout) => layout.index === index);
        setFilteredLayouts(filteredLayout);
    }

    console.log('Plugin settings:', pluginSettings);

    const createWebSocket = () => {

        if (!pluginSettings || typeof pluginSettings.pairingWebsocketUrl !== 'string') {
            console.error('Plugin settings or pairingWebsocketUrl URL not yet available');
            return;
        }

        const ws = new WebSocket(pluginSettings.pairingWebsocketUrl);
        ws.onopen = () => {
            // Send user input to WebSocket
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    const data = {
                        pin: inputValue,
                    };
                    ws.send(JSON.stringify(data));
                } catch (error) {
                    console.error('Room Integration Plugin: Error sending data via WebSocket:', error);
                }
            }
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log(data);
            if (data.status === 200 && data.msg === 'ok') {
                setRoomConfig(data.config);
                filterLayouts(data, 0);
            }

            if (data.status === 200 && data.msg === 'pairing') {
                setPairingPin(data.pairing_pin);
            }

            if (data.type == 'offer_response') {
                setOfferResponse(data.response);
            }
        };

        ws.onclose = (e) => {
            console.log('Room Integration Plugin: WebSocket connection closed', e);
        };

        setWebSocket(ws);

        return ws;
    };

    const handleConfirm = () => {
        createWebSocket();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Ensure that the input only contains numbers and has a maximum length of 6
        const value = e.target.value.replace(/\D/g, '').slice(0, 6);
        setInputValue(value);
    };

    useEffect(() => {
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
                        screenJoinUrls[key] = await pluginApi.getJoinUrl(joinParametersMap);
                    })
                );
                const roomJoinUrls = {
                    "urls": {"control": controlJoinUrl, "screens": screenJoinUrls}
                };
                setRoomJoinUrls(roomJoinUrls);
                console.log("Room Join URLs: ", roomJoinUrls)
            } catch (error) {
                console.error("Room Integration Plugin: Error fetching join URLs:", error);
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
            console.error('Room Integration Plugin: Error sending urls via WebSocket:', error);
        }
    }, [webSocket, roomJoinUrls]);

    const handleKeyPress = (e: any) => {
        if (e.key === 'Enter') {
            handleConfirm();
        }
    };

    return (
        <ReactModal
            className="plugin-modal"
            overlayClassName="modal-overlay"
            isOpen={showModal}
            onRequestClose={() => setShowModal(false)}
        >
            <div
                style={{
                    width: '100%', height: '100%', alignItems: 'center', display: 'flex', flexDirection: 'column',
                }}
            >
                {!pairingPin ?
                    <>
                        <h3>Please input the PIN number</h3>

                        <div>
                            {/* Input field for 6 digits */}
                            <input
                                type="text"
                                value={inputValue}
                                onChange={handleInputChange}
                                maxLength={6}
                                placeholder="Enter 6 digits"
                                style={{marginBottom: '10px', padding: '8px', marginRight: '10px'}}
                                onKeyPress={handleKeyPress}
                            />

                            {/* Confirm button */}
                            <button
                                className="button-style"
                                type="button"
                                onClick={handleConfirm}
                            >
                                Confirm
                            </button>
                        </div>
                    </>
                    :

                    !offerResponse ? <>
                            <h3>Pairing with '{roomConfig.name}'</h3>
                            <h4>Please verify the pairing PIN and confirm on the appliance</h4>
                            <h2>{pairingPin}</h2>

                        </>

                        :
                        <>

                            {offerResponse == "accept" ? <>
                                <h3>Accepted</h3>
                            </> : <>
                                <h3>Connection declined</h3>
                            </>}

                            <button
                                className="button-style"
                                type="button"
                                onClick={() => setShowModal(false)}

                            >
                                Close
                            </button>
                        </>
                }

            </div>
        </ReactModal>
    );
}
