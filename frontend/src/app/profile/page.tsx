'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import Link from 'next/link';
import styles from './profile.module.css';
import {
    ArrowLeft, CheckCircle, AlertCircle, Save, Download,
    User, Settings, Users, Clock, Globe, Monitor, Ban, Radio, Bell, Wallet, Compass
} from 'lucide-react';
import ConfirmationModal from '@/components/ConfirmationModal';
import ImportExportModal from '@/components/ImportExportModal';
import CustomSelect from '@/components/CustomSelect';
import { useRecommendations } from '@/context/RecommendationsContext';
import { COUNTRY_CURRENCY_MAP, COUNTRY_OPTIONS, getCurrencySymbol } from '@/lib/currency';

interface UserData {
    id: number;
    email: string;
    country: string;
    google_id?: string | null;
    preferences?: string | null;
}

interface UserPreferences {
    target_budget?: number;
    target_currency?: string;
    watch_time_weekly?: number;
    household_size?: string;
    languages?: string[];
    viewing_style?: string;
    devices?: string[];
    deal_breakers?: string[];
    enable_email_renewals?: boolean;
    notify_season_drops_only?: boolean;
    notify_watched_resurrect?: boolean;
    notify_movie_streaming?: boolean;
    auto_follow_watching?: boolean;
    viewing_preference?: 'weekly' | 'binge';
    default_landing_page?: 'auto' | 'explore' | 'watchlist' | 'overview' | 'subscriptions' | 'calendar';
    default_sidebar_collapsed?: boolean;
    [key: string]: unknown;
}

const LANG_OPTIONS   = ['English', 'Spanish', 'French', 'German', 'Japanese', 'Korean', 'Hindi', 'Mandarin', 'Italian'];
const DEVICE_OPTIONS = ['Mobile/Tablet', 'Laptop', 'TV (1080p)', '4K Home Theater'];
const STYLE_OPTIONS  = ['Casual', 'Binge Watcher', 'Weekly Releases', 'Cinematic Focus'];

type Tab = 'account' | 'preferences';

export default function Profile() {
    const [activeTab, setActiveTab] = useState<Tab>('account');
    const [user, setUser] = useState<UserData | null>(null);
    const [country, setCountry] = useState('IN');
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [saving, setSaving] = useState(false);
    const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);

    const [preferences, setPreferences] = useState<UserPreferences>({
        household_size: 'Solo',
        devices: [],
        deal_breakers: [],
        languages: [],
        notify_season_drops_only: false,
        notify_watched_resurrect: true,
        notify_movie_streaming: true,
        auto_follow_watching: true,
        viewing_preference: 'weekly',
        default_landing_page: 'auto',
        default_sidebar_collapsed: true,
    });
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [prefsMessage, setPrefsMessage] = useState('');

    let refreshRecommendations: ((force?: boolean) => Promise<void>) | undefined;
    try {
        const ctx = useRecommendations();
        refreshRecommendations = ctx.refreshRecommendations;
    } catch {
        // Context might not be available
    }

    useEffect(() => { fetchProfile(); }, []);

    const fetchProfile = async () => {
        try {
            const res = await api.get('/users/me/');
            setUser(res.data);
            setCountry(res.data.country || 'IN');
            if (res.data.preferences) {
                try {
                    const parsed = JSON.parse(res.data.preferences);
                    if (!parsed.target_currency && res.data.country) {
                        parsed.target_currency = COUNTRY_CURRENCY_MAP[res.data.country] || 'USD';
                    }
                    if (parsed.notify_season_drops_only === undefined) parsed.notify_season_drops_only = false;
                    if (parsed.notify_watched_resurrect === undefined) parsed.notify_watched_resurrect = true;
                    if (parsed.notify_movie_streaming === undefined) parsed.notify_movie_streaming = true;
                    if (parsed.auto_follow_watching === undefined) parsed.auto_follow_watching = true;
                    if (parsed.default_sidebar_collapsed === undefined) parsed.default_sidebar_collapsed = true;
                    localStorage.setItem('bingesensei_default_sidebar_collapsed', String(parsed.default_sidebar_collapsed));
                    if (parsed.viewing_style === 'Binge Watcher') {
                        parsed.viewing_preference = 'binge';
                    } else if (!parsed.viewing_preference) {
                        parsed.viewing_preference = 'weekly';
                    }
                    setPreferences(prev => ({ ...prev, ...parsed }));
                } catch {
                    // Ignore JSON parse errors
                }
            }
        } catch (err) {
            console.error('Failed to fetch profile', err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMessage('');
        try {
            await api.put('/users/profile', { country });
            // Clear regional caches so UI renders fresh country data
            localStorage.removeItem('binge_subs_cache');
            localStorage.removeItem('binge_dash_cache');
            localStorage.removeItem('binge_watchlist_cache');
            localStorage.removeItem('last_ai_region');
            setPreferences(prev => ({ ...prev, target_currency: COUNTRY_CURRENCY_MAP[country] || 'USD' }));
            setMessage('Settings saved!');
            setTimeout(() => setMessage(''), 3000);
            if (user) setUser({ ...user, country });
            refreshRecommendations?.(true).catch(() => {});
        } catch {
            setMessage('Failed to save settings.');
        } finally {
            setSaving(false);
        }
    };

    const handleSavePreferences = async () => {
        setSavingPrefs(true);
        setPrefsMessage('');
        try {
            await api.put('/users/me/preferences', preferences);
            // Invalidate activity drops and watchlist cache so changes reflect immediately
            localStorage.removeItem('binge_watchlist_cache');
            localStorage.setItem('bingesensei_default_sidebar_collapsed', String(preferences.default_sidebar_collapsed ?? true));
            setPrefsMessage('Preferences saved!');
            setTimeout(() => setPrefsMessage(''), 3000);
        } catch {
            setPrefsMessage('Failed to save preferences.');
        } finally {
            setSavingPrefs(false);
        }
    };

    const handleTogglePill = (field: keyof UserPreferences, value: string) => {
        const current = (preferences[field] as string[]) || [];
        setPreferences({
            ...preferences,
            [field]: current.includes(value) ? current.filter(i => i !== value) : [...current, value]
        });
    };

    const handleDisconnectClick = () => setIsDisconnectModalOpen(true);
    const confirmDisconnect = async () => {
        setIsDisconnectModalOpen(false);
        try {
            await api.post('/auth/disconnect/google');
            setMessage('Google account disconnected.');
            if (user) setUser({ ...user, google_id: null });
        } catch (err: unknown) {
            const errorDetail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setMessage('Failed: ' + (errorDetail || 'Could not disconnect.'));
        }
    };

    const currencySymbol = getCurrencySymbol(country);

    if (loading) return (
        <div className={styles.container}>
            <div className={styles.glassCard} style={{ padding: '3rem', textAlign: 'center', color: 'var(--muted-foreground)' }}>
                Loading profile...
            </div>
        </div>
    );

    return (
        <div className={styles.container}>
            <div className={styles.glassCard}>

                {/* ── Header ── */}
                <header className={styles.header}>
                    <h1 className={styles.title}>Profile</h1>
                    <Link href="/dashboard" className={styles.backLink}>
                        <ArrowLeft size={15} /> Dashboard
                    </Link>
                </header>

                {/* ── Tab Nav ── */}
                <div className={styles.tabNav}>
                    <button
                        className={`${styles.tabBtn} ${activeTab === 'account' ? styles.tabBtnActive : ''}`}
                        onClick={() => setActiveTab('account')}
                    >
                        <User size={15} /> Account
                    </button>
                    <button
                        className={`${styles.tabBtn} ${activeTab === 'preferences' ? styles.tabBtnActive : ''}`}
                        onClick={() => setActiveTab('preferences')}
                    >
                        <Settings size={15} /> Preferences
                    </button>
                </div>

                {/* ── Tab Body ── */}
                <div className={styles.tabBody}>

                    {/* ════ ACCOUNT TAB ════ */}
                    {activeTab === 'account' && (
                        <form onSubmit={handleSave}>
                            {/* Account Info */}
                            <div className={styles.section}>
                                <div className={styles.sectionTitle}>Account</div>

                                <div className={styles.infoRow}>
                                    <span className={styles.infoLabel}>Email</span>
                                    <span className={styles.infoValue}>{user?.email}</span>
                                </div>

                                <div className={styles.infoRow}>
                                    <span className={styles.infoLabel}>Google Account</span>
                                    {user?.google_id ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                            <span className={styles.googleConnected}>
                                                <CheckCircle size={13} strokeWidth={3} /> Connected
                                            </span>
                                            <button type="button" onClick={handleDisconnectClick} className={styles.disconnectBtn}>
                                                Disconnect
                                            </button>
                                        </div>
                                    ) : (
                                        <a href={`${api.defaults.baseURL}/auth/login/google`} className={styles.googleBtn}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                            </svg>
                                            Connect Google
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Region */}
                            <div className={styles.section}>
                                <div className={styles.sectionTitle}>Region</div>
                                <div className={styles.inputGroup}>
                                    <label htmlFor="country" className={styles.label}>Country / Region</label>
                                    <CustomSelect
                                        value={country}
                                        options={COUNTRY_OPTIONS}
                                        onChange={(val) => setCountry(val as string)}
                                        className={styles.select}
                                    />
                                    <p className={styles.helperText}>Affects subscription costs and content availability.</p>
                                </div>
                            </div>

                            {/* Watchlist Data & Backups */}
                            <div className={styles.section}>
                                <div className={styles.sectionTitle}>Watchlist Data & Backups</div>
                                <div className={styles.infoRow} style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                                    <div>
                                        <div style={{ fontWeight: 600, color: 'var(--foreground)' }}>Import & Export Watchlist</div>
                                        <p className={styles.helperText} style={{ margin: '0.2rem 0 0 0' }}>
                                            Sync watchlists from IMDb, Letterboxd, MyAnimeList, or AniList, or download backups (.csv / .json).
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsImportModalOpen(true)}
                                        className={styles.importBtn}
                                    >
                                        <Download size={15} /> Import / Export
                                    </button>
                                </div>
                            </div>

                            <button type="submit" className={styles.saveButton} disabled={saving}>
                                <Save size={16} /> {saving ? 'Saving...' : 'Save Changes'}
                            </button>

                            {message && (
                                <div className={`${styles.message} ${message.includes('Failed') ? styles.messageError : styles.messageSuccess}`}>
                                    {message.includes('Failed') ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
                                    {message}
                                </div>
                            )}
                        </form>
                    )}

                    {/* ════ PREFERENCES TAB ════ */}
                    {activeTab === 'preferences' && (
                        <div>
                            <div className={styles.section}>
                                <div className={styles.sectionTitle}>These improve AI recommendations and are used across the app</div>

                                {/* Household + Style */}
                                <div className={styles.twoCol}>
                                    <div className={styles.inputGroup} style={{ marginBottom: 0 }}>
                                        <label className={styles.label}>
                                            <span className={styles.iconHousehold}><Users size={14} /></span>
                                            Household
                                        </label>
                                        <CustomSelect
                                            value={preferences.household_size || 'Solo'}
                                            options={[
                                                { value: 'Solo', label: 'Just Me' },
                                                { value: 'Couple', label: 'Couple' },
                                                { value: 'Family', label: 'Family / Shared' }
                                            ]}
                                            onChange={(val) => setPreferences({ ...preferences, household_size: val as string })}
                                            className={styles.select}
                                        />
                                    </div>
                                    <div className={styles.inputGroup} style={{ marginBottom: 0 }}>
                                        <label className={styles.label}>
                                            <span className={styles.iconStyle}><Clock size={14} /></span>
                                            Viewing Style
                                        </label>
                                        <CustomSelect
                                            value={preferences.viewing_style || 'Casual'}
                                            options={STYLE_OPTIONS.map(opt => ({ value: opt, label: opt }))}
                                            onChange={(val) => {
                                                const styleVal = val as string;
                                                setPreferences({
                                                    ...preferences,
                                                    viewing_style: styleVal,
                                                    viewing_preference: styleVal === 'Binge Watcher' ? 'binge' : 'weekly'
                                                });
                                            }}
                                            className={styles.select}
                                        />
                                    </div>
                                </div>

                                {/* Budget */}
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>
                                        <span className={styles.iconBudget}><Wallet size={14} /></span>
                                        Monthly Budget ({currencySymbol})
                                    </label>
                                    <input
                                        type="number"
                                        className={styles.select}
                                        placeholder={country === 'JP' ? 'e.g. 5000' : country === 'IN' ? 'e.g. 2000' : country === 'PH' ? 'e.g. 1000' : 'e.g. 50'}
                                        value={preferences.target_budget || ''}
                                        onChange={e => setPreferences({ ...preferences, target_budget: parseInt(e.target.value) || undefined })}
                                    />
                                    <p className={styles.helperText}>Used to flag when your total spend exceeds your target.</p>
                                </div>

                                {/* Languages */}
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>
                                        <span className={styles.iconLanguages}><Globe size={14} /></span>
                                        Preferred Languages
                                    </label>
                                    <div className={styles.pillRow}>
                                        {LANG_OPTIONS.map(lang => (
                                            <button
                                                key={lang}
                                                type="button"
                                                className={`${styles.pill} ${preferences.languages?.includes(lang) ? styles.pillActive : ''}`}
                                                onClick={() => handleTogglePill('languages', lang)}
                                            >{lang}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Devices */}
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>
                                        <span className={styles.iconDevices}><Monitor size={14} /></span>
                                        Primary Devices
                                    </label>
                                    <div className={styles.pillRow}>
                                        {DEVICE_OPTIONS.map(dev => (
                                            <button
                                                key={dev}
                                                type="button"
                                                className={`${styles.pill} ${preferences.devices?.includes(dev) ? styles.pillActive : ''}`}
                                                onClick={() => handleTogglePill('devices', dev)}
                                            >{dev}</button>
                                        ))}
                                    </div>
                                </div>

                                {/* Deal Breakers */}
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>
                                        <span className={styles.iconDealBreakers}><Ban size={14} /></span>
                                        Deal Breakers
                                    </label>
                                    <input
                                        type="text"
                                        className={styles.select}
                                        placeholder="e.g. Horror, Reality TV, Anime"
                                        value={preferences.deal_breakers?.join(', ') || ''}
                                        onChange={e => setPreferences({ ...preferences, deal_breakers: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                                    />
                                    <p className={styles.helperText}>Genres or content types you never want recommended.</p>
                                </div>

                                {/* Release Radar & Drop Preferences */}
                                <div className={styles.settingsSection}>
                                    <div className={styles.settingsSectionHeader}>
                                        <h3 className={styles.settingsSectionTitle}>
                                            <span className={styles.radarIconAccent}><Radio size={16} /></span>
                                            Release Radar & Content Drops
                                        </h3>
                                        <p className={styles.settingsSectionDesc}>
                                            Customize what drops appear on your Release Radar and Calendar schedule.
                                        </p>
                                    </div>

                                    {/* Switch Toggles */}
                                    <div className={styles.switchGroup}>
                                        <label className={styles.switchRow}>
                                            <div className={styles.switchTextWrapper}>
                                                <span className={styles.switchTitle}>Season Premieres Only</span>
                                                <span className={styles.switchDescription}>
                                                    Only alert on full season drops, skipping weekly episode notifications.
                                                </span>
                                            </div>
                                            <div className={`${styles.switchTrack} ${preferences.notify_season_drops_only ? styles.switchTrackActive : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={preferences.notify_season_drops_only || false}
                                                    onChange={e => setPreferences({ ...preferences, notify_season_drops_only: e.target.checked })}
                                                    className={styles.hiddenCheckbox}
                                                />
                                                <span className={styles.switchThumb} />
                                            </div>
                                        </label>

                                        <label className={styles.switchRow}>
                                            <div className={styles.switchTextWrapper}>
                                                <span className={styles.switchTitle}>Watched Show Resurrections</span>
                                                <span className={styles.switchDescription}>
                                                    Alert when a show marked as Watched premieres a new season.
                                                </span>
                                            </div>
                                            <div className={`${styles.switchTrack} ${(preferences.notify_watched_resurrect ?? true) ? styles.switchTrackActive : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={preferences.notify_watched_resurrect ?? true}
                                                    onChange={e => setPreferences({ ...preferences, notify_watched_resurrect: e.target.checked })}
                                                    className={styles.hiddenCheckbox}
                                                />
                                                <span className={styles.switchThumb} />
                                            </div>
                                        </label>

                                        <label className={styles.switchRow}>
                                            <div className={styles.switchTextWrapper}>
                                                <span className={styles.switchTitle}>Movie Streaming Availability</span>
                                                <span className={styles.switchDescription}>
                                                    Alert when a movie in Plan to Watch becomes available on your active subscriptions.
                                                </span>
                                            </div>
                                            <div className={`${styles.switchTrack} ${(preferences.notify_movie_streaming ?? true) ? styles.switchTrackActive : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={preferences.notify_movie_streaming ?? true}
                                                    onChange={e => setPreferences({ ...preferences, notify_movie_streaming: e.target.checked })}
                                                    className={styles.hiddenCheckbox}
                                                />
                                                <span className={styles.switchThumb} />
                                            </div>
                                        </label>

                                        <label className={styles.switchRow}>
                                            <div className={styles.switchTextWrapper}>
                                                <span className={styles.switchTitle}>Auto-Track Watching Shows</span>
                                                <span className={styles.switchDescription}>
                                                    Automatically turn Radar ON when a show is moved to Watching.
                                                </span>
                                            </div>
                                            <div className={`${styles.switchTrack} ${(preferences.auto_follow_watching ?? true) ? styles.switchTrackActive : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={preferences.auto_follow_watching ?? true}
                                                    onChange={e => setPreferences({ ...preferences, auto_follow_watching: e.target.checked })}
                                                    className={styles.hiddenCheckbox}
                                                />
                                                <span className={styles.switchThumb} />
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {/* Startup Page Setting */}
                                <div className={styles.settingsSection}>
                                    <div className={styles.settingsSectionHeader}>
                                        <h3 className={styles.settingsSectionTitle}>
                                            <span className={styles.radarIconAccent}><Compass size={16} /></span>
                                            Default Startup Page
                                        </h3>
                                        <p className={styles.settingsSectionDesc}>
                                            Choose which page opens automatically when you log in.
                                        </p>
                                    </div>
                                    <div className={styles.inputGroup}>
                                        <CustomSelect
                                            value={preferences.default_landing_page || 'auto'}
                                            options={[
                                                { value: 'auto', label: 'Smart Default (Explore when Watchlist is empty, else Watchlist)' },
                                                { value: 'explore', label: 'Explore' },
                                                { value: 'watchlist', label: 'Watchlist' },
                                                { value: 'overview', label: 'Overview' },
                                                { value: 'subscriptions', label: 'Subscriptions' },
                                                { value: 'calendar', label: 'Calendar' }
                                            ]}
                                            onChange={(val) => setPreferences({
                                                ...preferences,
                                                default_landing_page: val as UserPreferences['default_landing_page']
                                            })}
                                            className={styles.select}
                                        />
                                    </div>
                                    <div className={styles.switchGroup}>
                                        <label className={styles.switchRow}>
                                            <div className={styles.switchTextWrapper}>
                                                <span className={styles.switchTitle}>Keep Sidebar Collapsed by Default</span>
                                                <span className={styles.switchDescription}>
                                                    Start desktop views with the compact icon sidebar (you can still expand or collapse it anytime).
                                                </span>
                                            </div>
                                            <div className={`${styles.switchTrack} ${(preferences.default_sidebar_collapsed ?? true) ? styles.switchTrackActive : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={preferences.default_sidebar_collapsed ?? true}
                                                    onChange={e => setPreferences({ ...preferences, default_sidebar_collapsed: e.target.checked })}
                                                    className={styles.hiddenCheckbox}
                                                />
                                                <span className={styles.switchThumb} />
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {/* Notification Settings */}
                                <div className={styles.settingsSection}>
                                    <div className={styles.settingsSectionHeader}>
                                        <h3 className={styles.settingsSectionTitle}>
                                            <span className={styles.notificationIconAccent}><Bell size={16} /></span>
                                            Notification Settings
                                        </h3>
                                        <p className={styles.settingsSectionDesc}>
                                            Toggle how and when you want to receive alerts about your subscriptions.
                                        </p>
                                    </div>
                                    <div className={styles.switchGroup}>
                                        <label className={styles.switchRow}>
                                            <div className={styles.switchTextWrapper}>
                                                <span className={styles.switchTitle}>Email: Renewal Reminders</span>
                                                <span className={styles.switchDescription}>Receive consolidated emails 7 days and 1 day before your subscriptions renew.</span>
                                            </div>
                                            <div className={`${styles.switchTrack} ${preferences.enable_email_renewals ? styles.switchTrackActive : ''}`}>
                                                <input
                                                    type="checkbox"
                                                    checked={preferences.enable_email_renewals || false}
                                                    onChange={e => setPreferences({ ...preferences, enable_email_renewals: e.target.checked })}
                                                    className={styles.hiddenCheckbox}
                                                />
                                                <span className={styles.switchThumb} />
                                            </div>
                                        </label>

                                        {/* Coming Soon notification options preserved in code but hidden from UI per user request */}
                                        <div style={{ display: 'none' }} aria-hidden="true">
                                            <label className={`${styles.switchRow} ${styles.switchRowDisabled}`}>
                                                <div className={styles.switchTextWrapper}>
                                                    <span className={styles.switchTitle}>
                                                        Email: AI Strategy & Insights <span className={styles.comingSoonBadge}>Coming Soon</span>
                                                    </span>
                                                    <span className={styles.switchDescription}>Receive monthly email reports with smart budget strategies and recommendations.</span>
                                                </div>
                                                <div className={styles.switchTrack}>
                                                    <span className={styles.switchThumb} />
                                                </div>
                                            </label>

                                            <label className={`${styles.switchRow} ${styles.switchRowDisabled}`}>
                                                <div className={styles.switchTextWrapper}>
                                                    <span className={styles.switchTitle}>
                                                        Push: Renewal Reminders <span className={styles.comingSoonBadge}>Coming Soon</span>
                                                    </span>
                                                    <span className={styles.switchDescription}>Receive browser/mobile push notifications when a service is renewing soon.</span>
                                                </div>
                                                <div className={styles.switchTrack}>
                                                    <span className={styles.switchThumb} />
                                                </div>
                                            </label>

                                            <label className={`${styles.switchRow} ${styles.switchRowDisabled}`}>
                                                <div className={styles.switchTextWrapper}>
                                                    <span className={styles.switchTitle}>
                                                        Push: AI Recommendations <span className={styles.comingSoonBadge}>Coming Soon</span>
                                                    </span>
                                                    <span className={styles.switchDescription}>Get notified immediately when new curator picks or deals are found for your library.</span>
                                                </div>
                                                <div className={styles.switchTrack}>
                                                    <span className={styles.switchThumb} />
                                                </div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <button
                                type="button"
                                className={styles.saveButton}
                                onClick={handleSavePreferences}
                                disabled={savingPrefs}
                            >
                                <Save size={16} /> {savingPrefs ? 'Saving...' : 'Save Preferences'}
                            </button>

                            {prefsMessage && (
                                <div className={`${styles.message} ${prefsMessage.includes('Failed') ? styles.messageError : styles.messageSuccess}`}>
                                    {prefsMessage.includes('Failed') ? <AlertCircle size={16} /> : <CheckCircle size={16} />}
                                    {prefsMessage}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <ConfirmationModal
                isOpen={isDisconnectModalOpen}
                onClose={() => setIsDisconnectModalOpen(false)}
                onConfirm={confirmDisconnect}
                title="Disconnect Google Account"
                message="Are you sure you want to disconnect your Google account? You'll need your password to log in next time."
                confirmLabel="Disconnect"
                isDangerous={true}
            />

            <ImportExportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={() => {
                    fetchProfile();
                }}
            />
        </div>
    );
}
