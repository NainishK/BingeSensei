import React, { useState, useEffect, useRef } from 'react';
import styles from './AIInsightsModal.module.css';
import { Sparkles, X, TrendingUp, DollarSign, Check, XCircle, Film, RefreshCw, AlertTriangle, ExternalLink } from 'lucide-react';
import api from '../lib/api';
import Link from 'next/link';
import { AIUnifiedResponse, UserPreferences, AIRecommendation } from '../lib/types';
import MediaCard from './MediaCard';
import ConfirmationModal from './ConfirmationModal';
import { COUNTRY_CURRENCY_MAP, COUNTRY_SYMBOL_MAP } from '../lib/currency';

interface AIInsightsModalProps {
    isOpen: boolean;
    onClose: () => void;
    watchlist?: Array<{ id: number; tmdb_id: number; status: string; user_rating?: number }>;
    onWatchlistUpdate?: () => void;
}

const AIInsightsModal: React.FC<AIInsightsModalProps> = ({ isOpen, onClose, watchlist = [], onWatchlistUpdate }) => {
    const [activeTab, setActiveTab] = useState<'picks' | 'strategy'>('picks');
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState<AIUnifiedResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showSaveConfirm, setShowSaveConfirm] = useState(false);

    // Preferences Form State
    const [preferences, setPreferences] = useState<UserPreferences>({
        target_budget: undefined,
        watch_time_weekly: undefined,
        household_size: 'Solo',
        devices: [],
        deal_breakers: []
    });
    const [savingPref, setSavingPref] = useState(false);

    // Access Control State
    const [aiAllowed, setAiAllowed] = useState(false);
    const [accessStatus, setAccessStatus] = useState<string>('none');
    const [requestingAccess, setRequestingAccess] = useState(false);

    // Deletion State
    const [itemToDelete, setItemToDelete] = useState<{ id: number; title: string } | null>(null);

    // Usage & Identity State for Client Caching
    const [lastAiUsage, setLastAiUsage] = useState<string | null>(null);
    const [hasData, setHasData] = useState(false);
    const [userId, setUserId] = useState<number | null>(null);
    const [prefsLoaded, setPrefsLoaded] = useState(false);

    const autoLoadRef = useRef(false);
    const userIdRef = useRef<number | null>(null);
    const requestSeqRef = useRef(0);
    const dataRef = useRef<AIUnifiedResponse | null>(null);

    const commitData = (next: AIUnifiedResponse | null) => {
        dataRef.current = next;
        setData(next);
    };

    const [userCountry, setUserCountry] = useState<string>('US'); // Default US

    const getCacheKey = (uid: number | null, country: string) =>
        uid ? `binge_ai_cache_${uid}_${country}` : `binge_ai_cache_${country}`;

    const readLocalInsights = (uid: number | null, country: string): AIUnifiedResponse | null => {
        try {
            const raw = localStorage.getItem(getCacheKey(uid, country));
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed?.data) return null;
            // Respect 7-day client TTL matching backend cache
            if (parsed.cachedAt && Date.now() - parsed.cachedAt > 7 * 24 * 60 * 60 * 1000) {
                return null;
            }
            const d: AIUnifiedResponse = parsed.data;
            if ((d.picks && d.picks.length >= 4) || (d.strategy && d.strategy.length > 0 && d.picks && d.picks.length > 0)) {
                return d;
            }
        } catch { /* ignore */ }
        return null;
    };

    const writeLocalInsights = (uid: number | null, country: string, payload: AIUnifiedResponse) => {
        try {
            localStorage.setItem(
                getCacheKey(uid, country),
                JSON.stringify({ data: payload, cachedAt: Date.now() })
            );
            const existing: string[] = JSON.parse(localStorage.getItem('binge_ai_regions') || '[]');
            if (!existing.includes(country)) {
                localStorage.setItem('binge_ai_regions', JSON.stringify([...existing, country]));
            }
            localStorage.setItem('last_ai_region', country);
        } catch { /* ignore */ }
    };

    const fetchPreferences = async () => {
        try {
            const res = await api.get('/users/me/');
            const resolvedUid: number | null = res.data.id ?? null;
            const resolvedCountry: string = res.data.country || 'US';

            userIdRef.current = resolvedUid;
            setUserId(resolvedUid);
            setUserCountry(resolvedCountry);

            // Preserve matching in-memory data; clear only if country actually changed from existing loaded data
            const currentData = dataRef.current;
            if (currentData && currentData.country && currentData.country !== resolvedCountry) {
                commitData(null);
            } else if (!currentData) {
                const localCached = readLocalInsights(resolvedUid, resolvedCountry);
                if (localCached) {
                    commitData(localCached);
                }
            }

            if (res.data.preferences) {
                const prefs = JSON.parse(res.data.preferences);
                if (!prefs.target_currency && res.data.country) {
                    prefs.target_currency = COUNTRY_CURRENCY_MAP[res.data.country] || 'USD';
                }
                setPreferences(prefs);
            }
            setAiAllowed(!!res.data.ai_allowed);
            setAccessStatus(res.data.ai_access_status || 'none');
            setLastAiUsage(res.data.last_ai_usage);

            const subCount = res.data.subscriptions ? res.data.subscriptions.length : 0;
            const watchCount = watchlist.length;
            setHasData(subCount > 0 || watchCount > 0);

            if (res.data.preferences) {
                setPreferences(prev => ({
                    ...prev,
                    target_currency: COUNTRY_CURRENCY_MAP[res.data.country] || 'USD'
                }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setPrefsLoaded(true);
        }
    };

    const handleGenerate = async (force = false, silent = false) => {
        const reqId = ++requestSeqRef.current;
        const hasExistingData = !!dataRef.current;
        if (!silent) {
            if (force && hasExistingData) {
                setRefreshing(true);
            } else {
                setLoading(true);
                if (hasExistingData) setRefreshing(true);
            }
        }
        setError(null);

        try {
            const url = force ? '/recommendations/insights?force_refresh=true' : '/recommendations/insights';
            const res = await api.post(url);
            if (reqId !== requestSeqRef.current) return;
            const payload: AIUnifiedResponse | undefined = res.data;

            if (payload && payload.warning === 'AI_QUOTA_EXCEEDED' && hasExistingData) {
                setError("AI is experiencing high demand right now. Showing your previous results.");
                return;
            }

            if (payload && (payload.picks || payload.strategy)) {
                commitData(payload);
                setLastAiUsage(new Date().toISOString());
                const countrySaved = payload.country || userCountry;
                if (payload.warning !== 'AI_QUOTA_EXCEEDED') {
                    writeLocalInsights(userIdRef.current, countrySaved, payload);
                }
            } else if (!hasExistingData) {
                setError("AI returned incomplete data. Please try again.");
            } else if (!silent) {
                setError("Could not update insights right now. Showing your previous results.");
            }
        } catch (e: any) {
            if (reqId !== requestSeqRef.current) return;
            console.error(e);
            if (silent && hasExistingData) {
                return;
            }
            let msg = "Failed to generate insights. AI might be busy.";

            if (e.response && e.response.data && e.response.data.detail) {
                msg = e.response.data.detail;
            } else if (e.message === "Network Error") {
                msg = "Network Error: Please check if the backend is running.";
            } else if (e.message && e.message.includes("timeout")) {
                msg = "AI Timeout: The engine is taking too long. Showing previous results if available.";
            }

            setError(msg);
        } finally {
            if (!silent && reqId === requestSeqRef.current) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    };

    // Initial Load & Auto-Generate Logic
    useEffect(() => {
        if (isOpen) {
            setPrefsLoaded(false);
            autoLoadRef.current = false;
            fetchPreferences();
        }
    }, [isOpen]);

    // Lock background page scroll when modal is open
    useEffect(() => {
        if (isOpen) {
            const originalOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            return () => {
                document.body.style.overflow = originalOverflow;
            };
        }
    }, [isOpen]);

    // Auto-Load once preferences confirm the exact region:
    // - If we already hydrated local/state cache for this region, sync quietly in background without spinner
    // - Otherwise load from backend cache/AI if previously generated for this region
    useEffect(() => {
        if (isOpen && prefsLoaded && aiAllowed && hasData && !autoLoadRef.current) {
            let generatedRegions: string[] = [];
            try {
                generatedRegions = JSON.parse(localStorage.getItem('binge_ai_regions') || '[]');
            } catch { /* ignore */ }
            const lastRegion = localStorage.getItem('last_ai_region');
            const alreadyLoadedForRegion = !!dataRef.current && (!dataRef.current.country || dataRef.current.country === userCountry);

            if (alreadyLoadedForRegion) {
                autoLoadRef.current = true;
                handleGenerate(false, true);
            } else if (generatedRegions.includes(userCountry) || lastRegion === userCountry) {
                autoLoadRef.current = true;
                handleGenerate(false, false);
            }
        }
    }, [isOpen, prefsLoaded, aiAllowed, hasData, userId, userCountry]);

    // ... imports at top should include getCurrencySymbol from currency.ts but let's just map locally for speed or import properly?
    // Let's assume we can add the import.



    // Derived Currency Info
    const activeCountry = data?.country || userCountry;
    const currencySymbol = COUNTRY_SYMBOL_MAP[activeCountry] || '$';
    const currencyCode = COUNTRY_CURRENCY_MAP[activeCountry] || 'USD';




    // ... imports at top should include getCurrencySymbol from currency.ts but let's just map locally for speed or import properly?
    // Let's assume we can add the import.



    const handleSavePreferences = async () => {
        setSavingPref(true);
        try {
            // Clean up empty strings/arrays if needed
            const toSend = { ...preferences };
            await api.put('/users/me/preferences', toSend);
            // Show success modal
            setShowSaveConfirm(true);
        } catch (e) {
            console.error(e);
            alert("Failed to save preferences.");
        } finally {
            setSavingPref(false);
        }
    };

    const confirmDelete = (id: number, title: string) => {
        setItemToDelete({ id, title });
    };

    const handleDelete = async () => {
        if (!itemToDelete) return;
        try {
            await api.delete(`/watchlist/${itemToDelete.id}`);
            if (onWatchlistUpdate) onWatchlistUpdate();
            setItemToDelete(null);
        } catch (e) {
            console.error("Failed to delete", e);
            alert("Failed to remove item");
        }
    };


    // Returns the most relevant provider name from TMDB regional data (same source as "Where to Watch" in card)
    const getProviderBadge = (providers?: string[]): string | undefined => {
        if (!providers || providers.length === 0) return undefined;
        return providers[0]
            .split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
    };

    const LANG_OPTIONS = ["English", "Spanish", "French", "German", "Japanese", "Korean", "Hindi", "Mandarin", "Italian"];
    const DEVICE_OPTIONS = ["Mobile/Tablet", "Laptop", "TV (1080p)", "4K Home Theater"];
    const STYLE_OPTIONS = ["Casual", "Binge Watcher", "Weekly Releases", "Cinematic Focus"];

    const handleTogglePill = (field: keyof UserPreferences, value: string) => {
        const current = preferences[field] as string[] || [];
        const newArray = current.includes(value)
            ? current.filter(i => i !== value)
            : [...current, value];
        setPreferences({ ...preferences, [field]: newArray });
    };

    const handleRequestAccess = async () => {
        setRequestingAccess(true);
        try {
            const res = await api.post('/users/me/access/ai');
            if (res.data.status === 'requested') {
                setAccessStatus('requested');
            } else if (res.data.status === 'approved') {
                setAiAllowed(true);
            }
        } catch (e) {
            console.error(e);
            alert("Failed to request access.");
        } finally {
            setRequestingAccess(false);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className={styles.overlay} onClick={onClose}>
                <div className={styles.modal} onClick={e => e.stopPropagation()}>
                    {/* Header */}
                    <div className={styles.header}>
                        <div className={styles.titleWrapper}>
                            <Sparkles size={24} color="#7c3aed" />
                            <h2 className={styles.title}>AI Intelligence Center</h2>
                            <span className={styles.betaBadge}>BETA</span>
                        </div>
                        <button className={styles.closeButton} onClick={onClose}>
                            <X size={20} />
                        </button>
                    </div>

                    {/* Tabs */}
                    {aiAllowed && (
                        <div className={styles.tabsContainer}>
                            <button
                                className={`${styles.tabBtn} ${activeTab === 'picks' ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab('picks')}
                            >
                                <Film size={18} /> Curator Picks
                            </button>
                            <button
                                className={`${styles.tabBtn} ${activeTab === 'strategy' ? styles.activeTab : ''}`}
                                onClick={() => setActiveTab('strategy')}
                            >
                                <TrendingUp size={18} /> Smart Strategy
                            </button>
                            <button
                                className={`${styles.tabBtn} ${styles.refreshTab}`}
                                onClick={() => handleGenerate(true)}
                                disabled={!hasData || loading || refreshing}
                                title={loading || refreshing ? 'Refreshing Intelligence...' : 'Refresh Intelligence'}
                                style={{ opacity: loading || refreshing ? 0.7 : 1, cursor: loading || refreshing ? 'not-allowed' : 'pointer' }}
                            >
                                <RefreshCw size={18} className={loading || refreshing ? styles.spin : ''} />
                                {(loading || refreshing) && <span style={{ marginLeft: '6px', fontSize: '0.9rem' }}>Refreshing...</span>}
                            </button>
                            <Link
                                href="/profile"
                                className={`${styles.tabBtn} ${styles.profileTab}`}
                                style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', fontSize: '0.82rem', opacity: 0.75 }}
                                onClick={onClose}
                                title="Edit viewing preferences"
                            >
                                <ExternalLink size={14} /> Preferences
                            </Link>
                        </div>
                    )}

                    {/* Content */}
                    <div className={styles.content}>
                        {/* QUOTA EXCEEDED ERROR SCREEN */}
                        {data && data.warning === 'AI_QUOTA_EXCEEDED' ? (
                            <div className={styles.stateContainer}>
                                <div className={styles.stateIconWrapper}>
                                    <AlertTriangle size={48} color="#dc2626" />
                                </div>
                                <h2 className={styles.stateTitle}>
                                    AI Service Temporarily Unavailable
                                </h2>
                                <p className={styles.stateDescription}>
                                    Our AI engine is currently experiencing high demand. Please try again later or check back tomorrow for fresh insights.
                                </p>
                                <button
                                    className={styles.saveBtn}
                                    onClick={onClose}
                                    style={{ background: '#e5e7eb', color: '#374151', width: 'auto', padding: '0.75rem 1.5rem' }}
                                >
                                    Close
                                </button>
                            </div>
                        ) : (
                            <>
                                {error && (
                                    <div className={styles.errorState}>
                                        <AlertTriangle size={20} />
                                        <span>{error}</span>
                                    </div>
                                )}

                                {data && data.warning && (
                                    <div className={styles.warningState}>
                                        <AlertTriangle size={20} />
                                        <span>{data.warning}</span>
                                    </div>
                                )}

                                {refreshing && data && (
                                    <div className={styles.refreshingBanner}>
                                        <RefreshCw size={15} className={styles.spin} />
                                        <span>Refreshing insights... keeping your current results until ready.</span>
                                    </div>
                                )}

                                {!aiAllowed ? (
                                    <div className={styles.stateContainer}>
                                        <div className={styles.stateIconWrapper}>
                                            <Sparkles size={48} color="#7c3aed" />
                                        </div>
                                        <h2 className={styles.stateTitle}>
                                            {accessStatus === 'requested' ? 'Access Requested' : 'Private Beta Access'}
                                        </h2>
                                        <p className={styles.stateDescription}>
                                            {accessStatus === 'requested'
                                                ? "You've been added to the waitlist. We'll notify you when your profile is ready for analysis."
                                                : "The AI Intelligence Center is currently in private beta. Request access to unlock personalized recommendations and spending strategy."}
                                        </p>

                                        {accessStatus === 'requested' ? (
                                            <button disabled className={styles.saveBtn} style={{ background: '#e5e7eb', color: '#6b7280', cursor: 'default' }}>
                                                <Check size={18} style={{ marginRight: '8px' }} /> Request Pending
                                            </button>
                                        ) : (
                                            <button
                                                className={styles.saveBtn}
                                                onClick={handleRequestAccess}
                                                disabled={requestingAccess}
                                                style={{ background: '#7c3aed', border: 'none', color: 'white' }}
                                            >
                                                {requestingAccess ? 'Processing...' : 'Request Access'}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <>

                                        {/* Shared Pre-Generation State for Picks & Strategy */}
                                        {(activeTab === 'picks' || activeTab === 'strategy') && !data && !loading && (
                                            <div className={styles.loadingWrapper}>
                                                <Sparkles size={48} color={hasData ? "#ddd" : "#e5e7eb"} />

                                                {!hasData ? (
                                                    // Empty State
                                                    <>
                                                        <h3 className={styles.stateTitle} style={{ fontSize: '1.25rem', marginTop: '1rem' }}>Build Your Profile</h3>
                                                        <p className={styles.loadingWrapper} style={{ maxWidth: 300 }}>
                                                            The AI needs data to work with. Please add active subscriptions or add movies/shows to your watchlist first.
                                                        </p>

                                                    </>
                                                ) : (
                                                    // Ready State
                                                    <>
                                                        <p>Ready to analyze your library. Click below to start.</p>
                                                        <button className={styles.saveBtn} style={{ maxWidth: 200 }} onClick={() => handleGenerate(false)}>
                                                            Generate Insights
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {activeTab === 'picks' && loading && !data && (
                                            <div className={styles.loadingWrapper} style={{ gridColumn: '1 / -1', minHeight: '300px' }}>
                                                <RefreshCw className={styles.spin} size={48} color="#7c3aed" />
                                                <p>Analyzing 28,000+ titles and your watchlist...</p>
                                            </div>
                                        )}

                                        {activeTab === 'picks' && data && (
                                            <div className={`${styles.strategyWrapper} ${refreshing ? styles.strategyDimmed : ''}`}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', alignItems: 'center' }}>
                                                    <h3 className={styles.sectionTitle}>Tap to Watch (On your services)</h3>
                                                </div>

                                                {data.picks.length === 0 ? (
                                                    <div className={styles.stateContainer} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '3rem' }}>
                                                        <Film size={48} className={styles.helperText} style={{ marginBottom: '1rem' }} />
                                                        <h4 className={styles.stateTitle} style={{ fontSize: '1.1rem' }}>No perfect matches found</h4>
                                                        <p className={styles.stateDescription} style={{ marginBottom: '0' }}>
                                                            Your preferences might be too strict. Try adding more languages or services to your profile.
                                                        </p>
                                                        <Link
                                                            href="/profile"
                                                            className={styles.saveBtn}
                                                            style={{ marginTop: '1.5rem', width: 'auto', textDecoration: 'none', display: 'inline-flex', justifyContent: 'center', alignItems: 'center' }}
                                                            onClick={onClose}
                                                        >
                                                            Adjust Profile
                                                        </Link>
                                                    </div>
                                                ) : (
                                                    <div className={styles.grid}>
                                                        {data.picks.map((rec, idx) => {
                                                            const tmdbId = rec.tmdb_id || 0;
                                                            const existingItem = watchlist.find(w => w.tmdb_id === tmdbId || (w.tmdb_id === 0 && rec.title === 'Title needed'));

                                                            return (
                                                                <div key={`${tmdbId || rec.title}-${idx}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                                                    <MediaCard
                                                                        item={{
                                                                            id: tmdbId,
                                                                            dbId: existingItem?.id,
                                                                            title: rec.title,
                                                                            overview: rec.overview || '',
                                                                            poster_path: rec.poster_path || '',
                                                                            vote_average: rec.vote_average || 0,
                                                                            media_type: rec.media_type || 'movie',
                                                                            status: existingItem?.status,
                                                                            user_rating: existingItem?.user_rating || 0
                                                                        }}
                                                                        showServiceBadge={rec.service || getProviderBadge(rec.providers)}
                                                                        customBadgeColor="#7c3aed"
                                                                        aiReason={rec.reason}
                                                                        existingStatus={existingItem?.status}
                                                                        onAddSuccess={onWatchlistUpdate}
                                                                        onStatusChange={() => onWatchlistUpdate?.()}
                                                                        onRemove={existingItem ? () => confirmDelete(existingItem.id, rec.title) : undefined}
                                                                    />
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        )}


                                        {activeTab === 'strategy' && (
                                            <>
                                                {loading && !data && (
                                                    <div className={styles.loadingWrapper} style={{ minHeight: '300px' }}>
                                                        <RefreshCw className={styles.spin} size={48} color="#7c3aed" />
                                                        <p>Analyzing financial strategy &amp; finding gaps...</p>
                                                    </div>
                                                )}
                                                {data && (
                                                    <div className={`${styles.strategyWrapper} ${(loading || refreshing) ? styles.strategyDimmed : ''}`}>
                                                        <div className={styles.strategyList}>
                                                            {data.strategy.map((item, idx) => (
                                                                <div key={idx} className={styles.strategyCard}>
                                                                    <div className={`${styles.strategyIcon} ${item.action === 'Add' ? styles.iconAdd : styles.iconCancel}`}>
                                                                        {item.action === 'Add' ? <Check size={24} /> : <XCircle size={24} />}
                                                                    </div>
                                                                    <div className={styles.strategyContent}>
                                                                        <h4 className={styles.strategyTitle}>{item.action} {item.service}</h4>
                                                                        <p className={styles.strategyReason}>{item.reason}</p>
                                                                        {item.savings && item.action === 'Cancel' && (
                                                                            <span className={styles.savingsTag} style={{ color: '#166534', background: '#dcfce7', borderColor: '#86efac' }}>
                                                                                Save {currencySymbol}{item.savings}{item.billing_cycle === 'yearly' ? '/yr' : '/mo'}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            {data.strategy.length === 0 && (
                                                                <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                                                                    <Check size={48} style={{ display: 'block', margin: '0 auto 1rem auto', color: '#10b981' }} />
                                                                    <p>Your subscription portfolio looks optimized! No changes recommended.</p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {data.gaps.length > 0 && (
                                                            <div className={styles.gapsSection}>
                                                                <h3 className={styles.sectionTitle}>
                                                                    <AlertTriangle size={20} color="#f59e0b" />
                                                                    Missing Out Checklist
                                                                </h3>
                                                                <div className={styles.grid}>
                                                                    {data.gaps.map((gap, idx) => {
                                                                        const tmdbId = gap.tmdb_id || 0;
                                                                        const existingItem = watchlist.find(w => w.tmdb_id === tmdbId);

                                                                        return (
                                                                            <div key={`${tmdbId || gap.title}-${idx}`} style={{ position: 'relative', display: 'flex', flexDirection: 'column', height: '100%' }}>
                                                                                <MediaCard
                                                                                    item={{
                                                                                        id: tmdbId,
                                                                                        dbId: existingItem?.id,
                                                                                        title: gap.title,
                                                                                        overview: gap.overview || '',
                                                                                        poster_path: gap.poster_path || '',
                                                                                        vote_average: gap.vote_average || 0,
                                                                                        media_type: gap.media_type || 'movie',
                                                                                        status: existingItem?.status,
                                                                                        user_rating: existingItem?.user_rating || 0
                                                                                    }}
                                                                                    aiReason={gap.reason}
                                                                                    showServiceBadge={getProviderBadge(gap.providers) || gap.service}
                                                                                    customBadgeColor="#f59e0b"
                                                                                    existingStatus={existingItem?.status}
                                                                                    onAddSuccess={onWatchlistUpdate}
                                                                                    onStatusChange={() => onWatchlistUpdate?.()}
                                                                                    onRemove={existingItem ? () => confirmDelete(existingItem.id, gap.title) : undefined}
                                                                                />
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </>
                                )}

                            </>
                        )}
                    </div>
                </div>
            </div>

            <ConfirmationModal
                isOpen={showSaveConfirm}
                onClose={() => setShowSaveConfirm(false)}
                onConfirm={() => {
                    setShowSaveConfirm(false);
                    setActiveTab('picks');
                }}
                title="Preferences Saved"
                message="Your AI profile has been updated. The analyst will now use these settings to generate more accurate recommendations."
                confirmLabel="Awesome"
                isDangerous={false}
            />

            <ConfirmationModal
                isOpen={!!itemToDelete}
                onClose={() => setItemToDelete(null)}
                onConfirm={handleDelete}
                title={`Remove ${itemToDelete?.title || 'Item'}?`}
                message={`Are you sure you want to remove ${itemToDelete?.title || 'this item'} from your watchlist?`}
                confirmLabel="Remove"
                isDangerous={true}
            />
        </>
    );
};

export default AIInsightsModal;
