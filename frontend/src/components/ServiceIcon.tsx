'use client';

import React, { useState } from 'react';

const SERVICE_DOMAINS: Record<string, string> = {
    'netflix': 'netflix.com',
    'amazon prime video': 'primevideo.com',
    'prime video': 'primevideo.com',
    'amazon prime': 'primevideo.com',
    'disney plus': 'disneyplus.com',
    'disney+': 'disneyplus.com',
    'disney+ hotstar': 'hotstar.com',
    'jiohotstar': 'hotstar.com',
    'hotstar': 'hotstar.com',
    'spotify': 'spotify.com',
    'hulu': 'hulu.com',
    'hulu japan': 'hulu.jp',
    'max': 'max.com',
    'hbo': 'max.com',
    'apple tv+': 'apple.com',
    'apple tv': 'apple.com',
    'apple': 'apple.com',
    'youtube premium': 'youtube.com',
    'youtube': 'youtube.com',
    'peacock': 'peacocktv.com',
    'paramount+': 'paramountplus.com',
    'paramount': 'paramountplus.com',
    'crunchyroll': 'crunchyroll.com',
    'zee5': 'zee5.com',
    'sonyliv': 'sonyliv.com',
    'abema': 'abema.tv',
    'abema premium': 'abema.tv',
    'fancode': 'fancode.com'
};

const getServiceLogo = (name: string) => {
    if (!name) return '';
    const lower = name.toLowerCase().trim();
    for (const [key, domain] of Object.entries(SERVICE_DOMAINS)) {
        if (lower.includes(key) || key.includes(lower)) {
            return `https://www.google.com/s2/favicons?sz=128&domain=${domain}`;
        }
    }

    // Fallback search for unknown services
    const slug = lower.replace(/[^a-z0-9]/g, '');
    return `https://www.google.com/s2/favicons?sz=128&domain=${slug}.com`;
};

// Auto-generate consistent pastel color for fallback
const stringToColor = (str: string) => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
};

interface ServiceIconProps {
    name: string;
    logoUrl?: string;
    className?: string;
    style?: React.CSSProperties;
    fallbackClassName?: string;
}

export const ServiceIcon: React.FC<ServiceIconProps> = ({ name, logoUrl: propLogoUrl, className, style, fallbackClassName }) => {
    const [error, setError] = useState(false);
    const logoUrl = propLogoUrl || getServiceLogo(name);

    if (error || !logoUrl) {
        return (
            <div
                className={fallbackClassName}
                style={{
                    backgroundColor: stringToColor(name),
                    display: 'inline-block',
                    flexShrink: 0,
                    ...style
                }}
            >
                {name.charAt(0).toUpperCase()}
            </div>
        );
    }

    return (
        <img
            src={logoUrl}
            alt={`${name} logo`}
            className={className}
            style={{
                display: 'inline-block',
                flexShrink: 0,
                ...style
            }}
            onError={() => setError(true)}
        />
    );
};

export default ServiceIcon;

