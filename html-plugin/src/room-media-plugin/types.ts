interface RoomMediaPluginProps {
    pluginName: string,
    pluginUuid: string,
}

export { RoomMediaPluginProps };

type LayoutScreen = {
    "bbb-join-parameters": {
        [key: string]: string;
    };
};

type Layout = {
    index: number;
    label: string;
    screens: {
        left: LayoutScreen;
        right: LayoutScreen;
    };
};

type Layouts = {
    [key: string]: Layout;
};

type Config = {
    name: string;
    bbb_user_id: string;
    bbb_user_name: string;
    layouts: Layouts;
};

type ResponseData = {
    status: number;
    msg: string;
    config: Config;
};

export { LayoutScreen, Layout, Config, ResponseData };

interface PinComponentProps {
    performCompletion(value: string, index: number): void,
    hasError: boolean
}
export { PinComponentProps };


interface LoaderComponentProps {
    title: string
}
export { LoaderComponentProps };


interface LayoutComponentProps {
    layouts: Layout[],
    prepareSelection(index: number): void,
}
export { LayoutComponentProps };

interface ConfirmationComponentProps {
    title?: string,
    text: string,
    confirm(): void,
    cancel(): void
}
export { ConfirmationComponentProps };
