'use client';

import { useState, useEffect, useRef } from 'react';
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
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    const current = SUPPORTED_REGIONS.find(r => r.code === region) || SUPPORTED_REGIONS[0];

    useEffect(() => {
        if (!open) return;
        const onDocDown = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDocDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onDocDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return (
        <div className={styles.wrapper} ref={wrapperRef}>
            <button
                type="button"
                className={styles.pill}
                onClick={() => setOpen(o => !o)}
                title="Change region"
                aria-expanded={open}
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
                            type="button"
                            className={`${styles.option} ${r.code === region ? styles.active : ''}`}
                            onClick={() => { onChange(r.code); setOpen(false); }}
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
