import * as React from 'react';

import {PulseLoader} from "react-spinners";

import {LoaderComponentProps} from '../types';

export default function LoaderComponent(props: LoaderComponentProps) {

    const containerStyles = {
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1rem 0',
        width: '75%',
        textAlign: 'center' as const
    };
    const titleStyles = {
        fontSize: '1.25rem',
        lineHeight: '1.75rem',
        fontWeight: 'bold',
        color: '#333',
        marginBottom: '1rem'
    }
    return (
        <div style={containerStyles}>
            <span style={titleStyles}>{props.title}</span>
            <PulseLoader
                color="#9f9f9f"
                loading
                margin={3}
                size={16}
                speedMultiplier={1}
            />
        </div>
    )
}
