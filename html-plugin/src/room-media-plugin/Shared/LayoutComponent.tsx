import * as React from 'react';

import {LayoutComponentProps} from '../types';

export default function LayoutComponent(props: LayoutComponentProps) {
    const containerStyles = {
        display: 'flex',
        flexDirection: 'column' as const,
        justifyContent: 'center',
        alignItems: 'center',
        padding: '1rem 0',
        width: '100%',
        textAlign: 'center' as const
    };
    const titleStyles = {
        marginTop: '0'
    };
    const listStyles = {
        listStyleType: 'none',
        margin: '0',
        padding: '0',
    };
    const listItemStyles = {
        width: '100%',
        margin: '1rem 0'
    };
    const buttonStyles = {
        width: '100%',
        lineHeight: '1.5rem',
        padding: '0.75rem 1rem',
    };
    return (
        <div style={containerStyles}>
            <h3 style={titleStyles}>Room Layouts</h3>
            <ul style={listStyles}>
                {props.layouts.map(function (layout, i) {
                    return (
                        <li style={listItemStyles} key={i}>
                            <button
                                className="button-style"
                                style={buttonStyles}
                                type="button" onClick={() => props.prepareSelection(layout.index)}
                            >
                                {layout.label}
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    )
}
