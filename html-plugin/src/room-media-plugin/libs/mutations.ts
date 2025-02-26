import { gql } from '@apollo/client/core';

export const USER_SET_MUTED = gql`
  mutation UserSetMuted($userId: String, $muted: Boolean!) {
    userSetMuted(
      userId: $userId,
      muted: $muted
    )
  }
`;

export const SET_MUTED = gql`
  mutation SetMuted($muted: Boolean!, $exceptPresenter: Boolean!) {
    meetingSetMuted(
      muted: $muted,
      exceptPresenter: $exceptPresenter,
    )
  }
`;

export default {
  USER_SET_MUTED,
  SET_MUTED
};
