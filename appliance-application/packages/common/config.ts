export type Config = {
  control_server: {
    ws: string;
    reconnect_interval: number;
    ping_interval: number;
  };
  auto_reject_time: number;
  preferred_pin_screen: string;
  hide_close_button: boolean;
  debug: boolean;
  room: RoomConfig;
};
export type RoomConfig = {
  bbb_user_name: string;
  layouts: Layout[]
};

export type Layout = {
  label: string;
  screens: {
    [key: string]: {
      bbb_join_parameters: {
        [key: string]: string | boolean | number | undefined;
      };
    };
  };
};
