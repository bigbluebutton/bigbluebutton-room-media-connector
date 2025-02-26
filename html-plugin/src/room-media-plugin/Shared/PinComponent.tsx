import * as React from 'react';
import {useState, useEffect, useRef} from 'react';
import PinInput from 'react-pin-input';

import {PinComponentProps} from '../types';

export default function PinComponent(props: PinComponentProps) {

    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    const pinRef = useRef(null);

    useEffect(() => {
        setErrorMessage(
            props.hasError ?
            "The previous PIN you entered was not correct" :
            null
        );
        if (pinRef?.current) {
            pinRef.current.focus();

            if (props.hasError) {
                pinRef.current.clear();
            }
        }
    }, [props.hasError, pinRef]);

    const mainContainerStyles = {
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'center',
    };
    const containerStyles = {
        padding: '10px',
        marginBottom: '1rem',
        textAlign: 'center' as const
    };
    const inputStyles = {
        width: '3rem',
        height: '3rem',
        fontSize: '1.5rem',
        border: '2px solid',
        borderColor: '#ccc',
        borderRadius: '0.5rem',
        margin: '0.5rem'
    };
    const inputFocusStyles = {
        borderColor: '#4A90E2',
        outline: 'none'
    };
    const headerStyles = {
        marginBottom: '1rem',
        fontSize: '1.25rem',
        lineHeight: '1.75rem',
        textAlign: 'center' as const
    };
    const errorStyles = {
        height: '25px',
        width: '100%',
        color: 'red',
        textAlign: 'center' as const
    };
    return (
        <div style={mainContainerStyles}>
            <h2 style={headerStyles}>
                Please enter the Pin number displayed in the room
            </h2>
            <PinInput
                length={6}
                ref={(n) => pinRef.current = n}
                focus
                type="numeric"
                inputMode="number"
                onComplete={props.performCompletion}
                autoSelect={false}
                regexCriteria={/^[ A-Za-z0-9_@./#&+-]*$/}
                style={containerStyles}
                inputStyle={inputStyles}
                inputFocusStyle={inputFocusStyles}
            />
            <span style={errorStyles}>
                {errorMessage}
            </span>
        </div>
    )
}
