'use client';

import { useState } from 'react';
import CountryFlag from '../CountryFlag';
import styles from './RegionPill.module.css';

interface RegionPillProps {
    region: string;
    onChange: (region: string) => void;
}

const SUPPORTED_REGIONS = [
    { code: 'US', name: 'United States' },
    { code: 'IN', name: 'India' },
    { code: 'GB', name: 'United Kingdom' },
    { code: 'CA', name: 'Canada' },
    { code: 'AU', name: 'Australia' },
    { code: 'DE', name: 'Germany' },
    { code: 'FR', name: 'France' },
    { code: 'ES', name: 'Spain' },
    { code: 'IT', name: 'Italy' },
    { code: 'NL', name: 'Netherlands' },
    { code: 'JP', name: 'Japan' },
    { code: 'SG', name: 'Singapore' },
    { code: 'PH', name: 'Philippines' },
    { code: 'NZ', name: 'New Zealand' },
    { code: 'BR', name: 'Brazil' },
    { code: 'MX', name: 'Mexico' },
];

export default function RegionPill({ region, onChange }: RegionPillProps) {
    const [open, setOpen] = useState(false);
    const current = SUPPORTED_REGIONS.find(r => r.code === region) || SUPPORTED_REGIONS[0];

    return (
        <div className={styles.wrapper}>
            <button
                className={styles.pill}
                onClick={() => setOpen(o => !o)}
                title="Change region"
            >
                <CountryFlag code={current.code} size={18} />
                <span className={styles.fullLabel}>{current.name}</span>
                <span className={styles.caret}>▾</span>
            </button>
            {open && (
                <div className={styles.dropdown}>
                    {SUPPORTED_REGIONS.map(r => (
                        <button
                            key={r.code}
                            className={`${styles.option} ${r.code === region ? styles.active : ''}`}
                            onClick={() => { onChange(r.code); setOpen(false); }}
                            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <CountryFlag code={r.code} size={18} />
                            <span>{r.name}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
