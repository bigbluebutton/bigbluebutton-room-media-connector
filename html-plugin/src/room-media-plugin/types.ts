interface RoomMediaPluginProps {
    pluginName: string,
    pluginUuid: string,
}

export { RoomMediaPluginProps };

type RoomConfig = {
    bbb_user_id: string;
    bbb_user_name: string;
};

export { RoomConfig };

interface PinComponentProps {
    performCompletion(value: string, index: number): void,
    hasError: boolean
}
export { PinComponentProps };


interface LoaderComponentProps {
    title: string
}
export { LoaderComponentProps };

interface ConfirmationComponentProps {
    title?: string,
    text: string,
    confirm(): void,
    cancel(): void
}
export { ConfirmationComponentProps };
