'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Sidebar from '@/components/Sidebar';
import styles from './layout.module.css';
import { RecommendationsProvider } from '@/context/RecommendationsContext';
import { Menu } from 'lucide-react';
import ScrollToTop from '@/components/ScrollToTop';
import { useTheme } from '@/context/ThemeContext';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [country, setCountry] = useState<string | null>(null);

    const { theme } = useTheme();
    const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>('dark');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        setActiveTheme(theme === 'light' ? 'light' : 'dark');
    }, [theme]);

    useEffect(() => {
        const getDefaultDesktopCollapsed = () => {
            try {
                const saved = localStorage.getItem('bingesensei_default_sidebar_collapsed');
                return saved === null ? true : saved === 'true';
            } catch {
                return true;
            }
        };

        const fetchCountryAndSidebarPref = async () => {
            try {
                const api = (await import('@/lib/api')).default;
                const response = await api.get('/users/me/');
                setCountry(response.data.country || 'US');

                let defaultCollapsed = true;
                if (response.data?.preferences) {
                    try {
                        const parsed = JSON.parse(response.data.preferences);
                        if (typeof parsed.default_sidebar_collapsed === 'boolean') {
                            defaultCollapsed = parsed.default_sidebar_collapsed;
                        }
                    } catch {}
                }
                try {
                    localStorage.setItem('bingesensei_default_sidebar_collapsed', String(defaultCollapsed));
                } catch {}

                if (window.innerWidth >= 768) {
                    setIsCollapsed(defaultCollapsed);
                }
            } catch (error) {
                console.error('Failed to fetch user profile', error);
            }
        };
        fetchCountryAndSidebarPref();

        // Clean up legacy per-toggle key so saved default governs fresh loads
        try {
            localStorage.removeItem('sidebar_collapsed');
        } catch {}

        // Auto-collapse on mobile; apply saved default on desktop
        const handleResize = () => {
            if (window.innerWidth < 768) {
                setIsCollapsed(true);
            } else {
                setIsCollapsed(getDefaultDesktopCollapsed());
            }
        };

        // Initial check
        handleResize();

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleToggleSidebar = () => {
        setIsCollapsed((prev) => !prev);
    };

    const getFlag = (code: string) => {
        const flags: Record<string, string> = {
            'US': '🇺🇸', 'IN': '🇮🇳', 'GB': '🇬🇧', 'CA': '🇨🇦', 'AU': '🇦🇺'
        };
        return flags[code] || '🌍';
    };

    return (
        <div className={styles.container}>
            {/* Mobile Header */}
            <header className={styles.mobileHeader}>
                <div className={styles.mobileLeft}>
                    <button
                        className={styles.mobileMenuBtn}
                        onClick={handleToggleSidebar}
                    >
                        <Menu size={24} />
                    </button>
                    <Link href="/dashboard" className={styles.mobileLogoContainer}>
                        <Image
                            src={(!mounted || activeTheme === 'dark') ? '/logo-dark-theme-final-v3.png' : '/logo-light-theme-final-v3.png'}
                            alt="BingeSensei Logo"
                            width={104}
                            height={28}
                            style={{ objectFit: 'contain' }}
                            priority
                        />
                    </Link>
                </div>

            </header>

            <Sidebar
                isCollapsed={isCollapsed}
                toggle={handleToggleSidebar}
                className={isCollapsed ? styles.sidebarCollapsed : styles.sidebarExpanded}
                countryCode={country}
            />

            <main
                className={`${styles.main} ${isCollapsed ? styles.mainCollapsed : styles.mainExpanded}`}
            >
                {/* Desktop Region Badge - Now in Sidebar */}
                {/* Hidden here, maintained in Mobile Header for mobile view */}

                <RecommendationsProvider>
                    {children}
                    <ScrollToTop />
                </RecommendationsProvider>
            </main>
        </div>
    );
}
