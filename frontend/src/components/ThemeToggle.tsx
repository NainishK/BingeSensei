"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import React, { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

interface ThemeToggleProps {
    isCollapsed?: boolean;
    className?: string;
    compact?: boolean;
}

export function ThemeToggle({ isCollapsed = false, className = '', compact = false }: ThemeToggleProps) {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const isDark = mounted ? theme === "dark" : true;
    const nextTheme = isDark ? "light" : "dark";
    const label = isDark ? "Dark Mode" : "Light Mode";
    const title = isDark ? "Switch to Light Mode" : "Switch to Dark Mode";

    if (!mounted) {
        return (
            <div className={`${styles.toggleBtn} ${isCollapsed ? styles.toggleBtnCollapsed : ''} ${className}`} style={{ opacity: 0.5 }}>
                {!isCollapsed && (
                    <span className={`${styles.leftGroup} ${!compact ? styles.leftGroupDefault : ''}`}>
                        <span className={`${styles.iconBox} ${!compact ? styles.iconBoxDefault : ''}`}>
                            <Moon size={compact ? 17 : 20} />
                        </span>
                        <span className={compact ? styles.labelCompact : styles.labelDefault}>Dark Mode</span>
                    </span>
                )}
                <span className={`${styles.switchTrack} ${styles.switchTrackDark}`} aria-hidden="true">
                    <span className={styles.switchThumb}>
                        <Moon size={9} strokeWidth={2.5} />
                    </span>
                </span>
            </div>
        );
    }

    return (
        <button
            type="button"
            role="switch"
            aria-checked={isDark}
            onClick={() => setTheme(nextTheme)}
            className={`${styles.toggleBtn} ${isCollapsed ? styles.toggleBtnCollapsed : ''} ${className}`}
            aria-label={title}
        >
            {!isCollapsed && (
                <span className={`${styles.leftGroup} ${!compact ? styles.leftGroupDefault : ''}`}>
                    <span className={`${styles.iconBox} ${!compact ? styles.iconBoxDefault : ''}`}>
                        {isDark ? (
                            <Moon size={compact ? 17 : 20} style={{ color: '#818cf8' }} />
                        ) : (
                            <Sun size={compact ? 17 : 20} style={{ color: '#f59e0b' }} />
                        )}
                    </span>
                    <span className={compact ? styles.labelCompact : styles.labelDefault}>
                        {label}
                    </span>
                </span>
            )}

            <span
                aria-hidden="true"
                className={`${styles.switchTrack} ${isDark ? styles.switchTrackDark : styles.switchTrackLight}`}
            >
                <span className={styles.switchThumb}>
                    {isDark ? <Moon size={9} strokeWidth={2.5} /> : <Sun size={9} strokeWidth={2.5} />}
                </span>
            </span>

            {isCollapsed && <span className={styles.collapsedTooltip}>{title}</span>}
        </button>
    );
}
