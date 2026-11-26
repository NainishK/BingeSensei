import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import {
    LayoutDashboard,
    CreditCard,
    TvMinimalPlay,
    Calendar,
    Compass,
    Settings,
    LogOut,
    ChevronLeft,
    ChevronRight,
    MessageSquarePlus
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { useTheme } from '@/context/ThemeContext';
import ConfirmationModal from './ConfirmationModal';
import ReportIssueModal from './ReportIssueModal';
import CountryFlag from './CountryFlag';
import styles from './Sidebar.module.css';

interface SidebarProps {
    isCollapsed: boolean;
    toggle: () => void;
    className?: string;
    countryCode?: string | null;
}

export default function Sidebar({ isCollapsed, toggle, className = '', countryCode }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [logoutModalOpen, setLogoutModalOpen] = useState(false);
    const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
    
    const { theme } = useTheme();
    const [activeTheme, setActiveTheme] = useState<'light' | 'dark'>('dark');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        setActiveTheme(theme === 'light' ? 'light' : 'dark');
    }, [theme]);

    const getCountryName = (code: string) => {
        const names: Record<string, string> = {
            'US': 'United States',
            'IN': 'India',
            'GB': 'United Kingdom',
            'CA': 'Canada',
            'AU': 'Australia',
            'DE': 'Germany',
            'FR': 'France',
            'ES': 'Spain',
            'IT': 'Italy',
            'NL': 'Netherlands',
            'JP': 'Japan',
            'SG': 'Singapore',
            'PH': 'Philippines',
            'NZ': 'New Zealand',
            'BR': 'Brazil',
            'MX': 'Mexico',
        };
        return names[code] || code;
    };

    const navItems = [
        { name: 'Overview', icon: LayoutDashboard, path: '/dashboard/overview' },
        { name: 'Subscriptions', icon: CreditCard, path: '/dashboard/subscriptions' },
        { name: 'Watchlist', icon: TvMinimalPlay, path: '/dashboard/watchlist' },
        { name: 'Calendar', icon: Calendar, path: '/dashboard/calendar' },
        { name: 'Explore', icon: Compass, path: '/dashboard/recommendations' },
    ];

    const handleLogoutClick = () => {
        setLogoutModalOpen(true);
    };

    const confirmLogout = () => {
        localStorage.removeItem('token');
        router.push('/login');
        setLogoutModalOpen(false);
    };

    return (
        <>
            {/* Mobile Overlay - Only visible on mobile when sidebar is open (not collapsed) */}
            {!isCollapsed && (
                <div className={styles.mobileOverlay} onClick={toggle} aria-hidden="true" />
            )}

            <aside className={`${styles.sidebar} ${isCollapsed ? styles.collapsed : ''} ${className}`}>
                <div className={styles.header}>
                    <Link href="/dashboard" className={styles.logoContainer}>
                        {isCollapsed ? (
                            <Image
                                src="/logo-icon-final-v3.png"
                                alt="BingeSensei Icon"
                                width={42}
                                height={42}
                                className={styles.logoIcon}
                                style={{ objectFit: 'contain' }}
                            />
                        ) : (
                            <Image
                                src={(!mounted || activeTheme === 'dark') ? '/logo-dark-theme-final-v3.png' : '/logo-light-theme-final-v3.png'}
                                alt="BingeSensei Logo"
                                width={134}
                                height={36}
                                className={styles.logoFull}
                                style={{ objectFit: 'contain' }}
                            />
                        )}
                    </Link>
                    <button onClick={toggle} className={styles.toggleBtn} title={isCollapsed ? "Expand" : "Collapse"}>
                        {isCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                    </button>
                </div>

                <nav className={styles.nav}>
                    {navItems.map((item) => {
                        const isActive = pathname === item.path;
                        const Icon = item.icon;
                        return (
                            <Link
                                key={item.path}
                                href={item.path}
                                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                                title={isCollapsed ? item.name : ''}
                                onClick={() => {
                                    if (window.innerWidth < 768) {
                                        toggle();
                                    }
                                }}
                            >
                                <span className={styles.icon}>
                                    <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                                </span>
                                {!isCollapsed && <span className={styles.label}>{item.name}</span>}
                            </Link>
                        );
                    })}

                </nav>

                <div className={styles.footer}>
                    <div className={styles.utilityGroup}>
                        <Link
                            href="/profile"
                            className={`${styles.utilityItem} ${pathname === '/profile' ? styles.utilityItemActive : ''}`}
                            title={isCollapsed ? (countryCode ? `Profile (${getCountryName(countryCode)})` : 'Profile') : ''}
                            onClick={() => {
                                if (window.innerWidth < 768) {
                                    toggle();
                                }
                            }}
                        >
                            <span className={`${styles.utilityIcon} ${styles.settingsIcon}`}>
                                <Settings size={17} strokeWidth={pathname === '/profile' ? 2.2 : 1.9} />
                            </span>
                            {!isCollapsed && (
                                <>
                                    <span>Profile</span>
                                    {countryCode && (
                                        <span className={styles.profileRegionPill} title={`Region: ${getCountryName(countryCode)}`}>
                                            <CountryFlag code={countryCode} size={13} />
                                            <span>{countryCode}</span>
                                        </span>
                                    )}
                                </>
                            )}
                        </Link>

                        {isCollapsed && countryCode && (
                            <Link
                                href="/profile"
                                className={styles.collapsedRegionChip}
                                title={`Region: ${getCountryName(countryCode)} (Change in Profile)`}
                                onClick={() => {
                                    if (window.innerWidth < 768) {
                                        toggle();
                                    }
                                }}
                            >
                                <CountryFlag code={countryCode} size={14} />
                            </Link>
                        )}

                        <button
                            type="button"
                            className={styles.utilityItem}
                            title={isCollapsed ? "Give Feedback & Report Issues" : ""}
                            onClick={() => {
                                setFeedbackModalOpen(true);
                                if (window.innerWidth < 768) {
                                    toggle();
                                }
                            }}
                        >
                            <span className={`${styles.utilityIcon} ${styles.feedbackIcon}`}>
                                <MessageSquarePlus size={17} strokeWidth={1.9} />
                            </span>
                            {!isCollapsed && <span>Feedback</span>}
                        </button>
                    </div>

                    <div className={styles.themeToggleContainer}>
                        <ThemeToggle isCollapsed={isCollapsed} className={styles.themeToggle} compact />
                    </div>

                    <button onClick={handleLogoutClick} className={styles.logoutBtn} title={isCollapsed ? "Logout" : ""}>
                        <span className={styles.logoutIcon}><LogOut size={17} strokeWidth={2} /></span>
                        {!isCollapsed && <span>Logout</span>}
                    </button>
                </div>
            </aside>

            <ReportIssueModal
                visible={feedbackModalOpen}
                onClose={() => setFeedbackModalOpen(false)}
                defaultCategory="feature"
            />

            <ConfirmationModal
                isOpen={logoutModalOpen}
                onClose={() => setLogoutModalOpen(false)}
                onConfirm={confirmLogout}
                title="Confirm Logout"
                message="Are you sure you want to log out?"
                confirmLabel="Logout"
                isDangerous={false}
            />
        </>
    );
}
