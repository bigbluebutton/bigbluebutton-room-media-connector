import * as React from 'react';

import {ConfirmationComponentProps} from '../types';

export default function ConfirmationComponent(props: ConfirmationComponentProps) {
  return (
    <div className="room-media-plugin-confirmation">
      <header className="rmpc-header">
        {props.title &&
          <h2 className="rmpc-title">
            {props.title}
          </h2>
        }
        <button aria-label="Close Confirmation" aria-disabled="false" className="rmpc-close-btn" color="default" data-test="closeModal" aria-describedby="modalDismissDescription" aria-expanded="false" onClick={props.cancel}>
          <span color="default" className="rmpc-close-btn-span">
            <i className="rmpc-close-icon icon-bbb-close"></i>
          </span>
          <span className="sr-only">Close</span>
        </button>
        <div id="modalDismissDescription" hidden>Disregards changes and closes the modal</div>
      </header>
      <div className='rmpc-contents'>
        <div className='rmpc-contents-wrapper'>
          <div className='rmpc-text'>
            <span>
              {props.text}
            </span>
          </div>
          <div className='rmpc-buttons'>
            <button type="button" className="cancel"
              onClick={props.cancel}
            >
                Cancel
            </button>
            <button type="button" className="confirm"
              onClick={props.confirm}
            >
                Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
