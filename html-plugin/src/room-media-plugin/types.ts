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
