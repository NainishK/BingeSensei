'use client';

import React from 'react';

interface CountryFlagProps {
    code: string;
    size?: number;
    className?: string;
    style?: React.CSSProperties;
}

export default function CountryFlag({ code, size = 18, className = '', style = {} }: CountryFlagProps) {
    if (!code) return null;
    const countryCode = code.toLowerCase();
    const flagUrl = `https://flagcdn.com/w40/${countryCode}.png`;

    return (
        <img
            src={flagUrl}
            alt={code.toUpperCase()}
            width={size}
            height={Math.round(size * 0.75)}
            className={className}
            style={{
                display: 'inline-block',
                verticalAlign: 'middle',
                borderRadius: '3px',
                objectFit: 'cover',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
                ...style
            }}
            loading="lazy"
        />
    );
}
