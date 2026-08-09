'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import api from '@/lib/api';
import styles from './recommendations.module.css';
import { Recommendation } from '@/lib/types';
import MediaCard, { MediaItem } from '@/components/MediaCard';
import { useRecommendations } from '@/context/RecommendationsContext';
import { PlayCircle, Lightbulb, TrendingUp, Sparkles, RefreshCw, XCircle, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, Tv, Globe, Layers } from 'lucide-react';
import { ServiceIcon } from '@/components/ServiceIcon';
import AIInsightsModal from '@/components/AIInsightsModal';
import { formatCurrency } from '@/lib/currency';

import ConfirmationModal from '@/components/ConfirmationModal';
import { RecommendationsSkeleton } from '@/components/SkeletonLoader';
interface FilterOption {
    value: 'all' | 'subscriptions' | 'explore';
    label: string;
    count: number;
    icon: React.ReactNode;
}

function CustomFilterDropdown({
    value,
    onChange,
    options
}: {
    value: 'all' | 'subscriptions' | 'explore';
    onChange: (val: 'all' | 'subscriptions' | 'explore') => void;
    options: FilterOption[];
}) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const activeOption = options.find(o => o.value === value) || options[0];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={styles.mobileFilterDropdown}>
            <div className={styles.customDropdownContainer} ref={dropdownRef}>
                <button
                    type="button"
                    className={styles.customDropdownTrigger}
                    onClick={() => setIsOpen(!isOpen)}
                >
                    <div className={styles.triggerContent}>
                        {activeOption.icon}
                        <span>{activeOption.label} ({activeOption.count})</span>
                    </div>
                    <ChevronDown size={16} className={`${styles.dropdownChevron} ${isOpen ? styles.chevronOpen : ''}`} />
                </button>

                {isOpen && (
                    <div className={styles.customDropdownMenu}>
                        {options.map((opt) => (
                            <div
                                key={opt.value}
                                className={`${styles.customDropdownItem} ${opt.value === value ? styles.selectedItem : ''}`}
                                onClick={() => {
                                    onChange(opt.value);
                                    setIsOpen(false);
                                }}
                            >
                                <div className={styles.itemLeft}>
                                    {opt.icon}
                                    <span>{opt.label}</span>
                                </div>
                                <span className={styles.itemCount}>({opt.count})</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function RecommendationsPage() {
    // ... existing hooks
    const {
        dashboardRecs,
        similarRecs,
        loadingDashboard,
        loadingSimilar,
        refreshRecommendations,
        fetchSimilarData: fetchSimilarRecs
    } = useRecommendations();

    const [watchlist, setWatchlist] = useState<Array<{ 
        id: number; tmdb_id: number; status: string; user_rating?: number; title?: string;
        current_season?: number; current_episode?: number; notes?: string;
    }>>([]);
    const [trendingVisible, setTrendingVisible] = useState(5);

    useEffect(() => {
        const handleResize = () => setTrendingVisible(window.innerWidth < 768 ? 4 : 5);
        handleResize(); // Set initial
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    const [refreshing, setRefreshing] = useState(false);
    const [showAIModal, setShowAIModal] = useState(false);
    const [trendingIndex, setTrendingIndex] = useState(0);
    const [userCountry, setUserCountry] = useState('US');
    const [userSubscriptions, setUserSubscriptions] = useState<string[]>([]);
    const [filterTab, setFilterTab] = useState<'all' | 'subscriptions' | 'explore'>('all');
    const [trendingTab, setTrendingTab] = useState<'all' | 'subscriptions' | 'explore'>('all');

    // Deletion State
    const [itemToRemove, setItemToRemove] = useState<{ id: number; title: string } | null>(null);

    useEffect(() => {
        fetchWatchlist();
        fetchUserProfile();
        fetchUserSubscriptions();
    }, []);

    const fetchUserSubscriptions = async () => {
        try {
            const response = await api.get('/subscriptions/');
            if (Array.isArray(response.data)) {
                const activeNames = response.data
                    .filter((s: any) => s.is_active)
                    .map((s: any) => s.service_name.toLowerCase().trim());
                setUserSubscriptions(activeNames);
            }
        } catch (error) {
            console.error('Failed to fetch user subscriptions for filter', error);
        }
    };

    const fetchUserProfile = async () => {
        try {
            const response = await api.get('/users/me/'); // Added trailing slash to match backend
            if (response.data && response.data.country) {
                setUserCountry(response.data.country);
            }
        } catch (error) {
            console.error('Failed to fetch user profile', error);
        }
    };

    const fetchWatchlist = async () => {
        try {
            const response = await api.get('/watchlist/');
            setWatchlist(response.data.map((item: any) => ({
                id: item.id,
                tmdb_id: item.tmdb_id,
                status: item.status,
                user_rating: item.user_rating,
                title: item.title,
                current_season: item.current_season,
                current_episode: item.current_episode,
                notes: item.notes
            })));
        } catch (error) {
            console.error('Failed to fetch watchlist', error);
        }
    };

    const confirmRemove = (id: number, title: string) => {
        setItemToRemove({ id, title });
    };

    const handleRemove = async () => {
        if (!itemToRemove) return;
        try {
            await api.delete(`/watchlist/${itemToRemove.id}`);
            await fetchWatchlist(); // Refresh local state
            setItemToRemove(null);
        } catch (error) {
            console.error("Failed to delete", error);
        }
    };

    // ... (rest of simple handlers)

    const handleNextTrending = () => {
        setTrendingIndex(prev =>
            prev + trendingVisible < trendingRecs.length ? prev + 1 : prev
        );
    };

    const handlePrevTrending = () => {
        setTrendingIndex(prev => prev > 0 ? prev - 1 : 0);
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            await refreshRecommendations(true);
        } catch (error) {
            console.error(error);
        } finally {
            setRefreshing(false);
        }
    };

    const handleQuickWatch = (itemName: string, serviceName: string) => {
        const query = `Watch ${itemName} on ${serviceName}`;
        window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
    };

    const trendingRecs = dashboardRecs.filter(r => r.type === 'trending' || r.type === 'global_trending');
    const cancelRecs = dashboardRecs.filter(r => r.type === 'cancel' && r.service_name !== 'YouTube Premium');

    const isTrendingOnSub = (rec: Recommendation) => {
        if (rec.type === 'trending') return true;
        if (rec.type === 'global_trending') return false;
        if (typeof rec.is_on_sub === 'boolean') return rec.is_on_sub;
        if (!rec.service_name) return false;
        const name = rec.service_name.toLowerCase().trim();
        if (name === 'popular streaming' || name.startsWith('available on')) return false;
        if (userSubscriptions.length > 0) {
            return userSubscriptions.some(sub => {
                const cleanSub = sub.replace(/\s*(plus|\+)\s*/g, '').toLowerCase().trim();
                const cleanRec = name.replace(/\s*(plus|\+)\s*/g, '').toLowerCase().trim();
                return cleanRec.includes(cleanSub) || cleanSub.includes(cleanRec);
            });
        }
        return true;
    };

    const trendingSubCount = trendingRecs.filter(isTrendingOnSub).length;
    const trendingExploreCount = trendingRecs.filter(r => !isTrendingOnSub(r)).length;

    const filteredTrendingRecs = trendingRecs.filter(rec => {
        const isOnSub = isTrendingOnSub(rec);
        if (trendingTab === 'subscriptions') return isOnSub;
        if (trendingTab === 'explore') return !isOnSub;
        return true;
    });

    if (loadingDashboard && dashboardRecs.length === 0) return <RecommendationsSkeleton />;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.pageTitle}>Smart Recommendations</h1>
            </div>

            <AIInsightsModal
                isOpen={showAIModal}
                onClose={() => setShowAIModal(false)}
                watchlist={watchlist}
                onWatchlistUpdate={fetchWatchlist}
            />

            {/* Trending Section - Carousel & Filter Pills */}
            {trendingRecs.length > 0 && (
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle} style={{ color: '#ec4899' }}>
                            <PlayCircle className={styles.sectionIcon} /> Trending Content
                        </h2>
                        {/* Carousel Controls */}
                        <div className={styles.carouselControls}>
                            <button
                                onClick={handlePrevTrending}
                                disabled={trendingIndex === 0}
                                className={styles.carouselBtn}
                            >
                                <ChevronLeft size={20} />
                            </button>
                            <button
                                onClick={handleNextTrending}
                                disabled={trendingIndex + trendingVisible >= filteredTrendingRecs.length}
                                className={styles.carouselBtn}
                            >
                                <ChevronRight size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Mobile Filter Dropdown */}
                    <CustomFilterDropdown
                        value={trendingTab}
                        onChange={(val) => {
                            setTrendingTab(val);
                            setTrendingIndex(0);
                        }}
                        options={[
                            { value: 'all', label: 'All Trending', count: trendingRecs.length, icon: <Layers size={14} /> },
                            { value: 'subscriptions', label: 'On My Subscriptions', count: trendingSubCount, icon: <Tv size={14} /> },
                            { value: 'explore', label: 'Worldwide & Explore', count: trendingExploreCount, icon: <Globe size={14} /> },
                        ]}
                    />

                    {/* Desktop Filter Pills */}
                    <div className={`${styles.filterPills} ${styles.filterPillsDesktop}`} style={{ marginBottom: '1.25rem' }}>
                        <button
                            className={`${styles.filterPill} ${trendingTab === 'all' ? styles.filterPillActive : ''}`}
                            onClick={() => { setTrendingTab('all'); setTrendingIndex(0); }}
                        >
                            <Layers size={14} /> All Trending ({trendingRecs.length})
                        </button>
                        <button
                            className={`${styles.filterPill} ${trendingTab === 'subscriptions' ? styles.filterPillActive : ''}`}
                            onClick={() => { setTrendingTab('subscriptions'); setTrendingIndex(0); }}
                        >
                            <Tv size={14} /> On My Subscriptions ({trendingSubCount})
                        </button>
                        <button
                            className={`${styles.filterPill} ${trendingTab === 'explore' ? styles.filterPillActive : ''}`}
                            onClick={() => { setTrendingTab('explore'); setTrendingIndex(0); }}
                        >
                            <Globe size={14} /> Worldwide & Explore ({trendingExploreCount})
                        </button>
                    </div>

                    <div key={trendingTab} className={styles.grid}>
                        {filteredTrendingRecs.slice(trendingIndex, trendingIndex + trendingVisible).map((rec, index) => {
                            const tmdbId = rec.tmdb_id || 0;
                            const existingItem = watchlist.find(w => w.tmdb_id === tmdbId || (w.tmdb_id === 0 && rec.items[0] === 'Title needed')); // Strict ID match preference

                            return (
                                <div key={`${trendingIndex}-${index}`} className={styles.recommendationItem}>
                                    <MediaCard
                                        item={{
                                            id: tmdbId,
                                            dbId: existingItem?.id,
                                            title: rec.items[0],
                                            overview: rec.overview || '',
                                            poster_path: rec.poster_path || '',
                                            vote_average: rec.vote_average || 0,
                                            media_type: rec.media_type || 'movie',
                                            user_rating: existingItem?.user_rating || 0,
                                            status: existingItem?.status,
                                            genre_ids: rec.genre_ids,
                                            original_language: rec.original_language,
                                            current_season: existingItem?.current_season,
                                            current_episode: existingItem?.current_episode,
                                            notes: existingItem?.notes
                                        }}
                                        showServiceBadge={rec.service_name}
                                        customBadgeColor="#db2777"
                                        existingStatus={existingItem?.status}
                                        onAddSuccess={fetchWatchlist}
                                        onStatusChange={() => fetchWatchlist()}
                                        onRemove={existingItem ? () => confirmRemove(existingItem.id, rec.items[0]) : undefined}
                                    />
                                </div>
                            )
                        })}
                    </div>
                </section>
            )}

            {/* Unused Subscriptions */}
            {cancelRecs.length > 0 && (
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h2 className={styles.sectionTitle} style={{ color: '#dc2626' }}>
                            <AlertTriangle className={styles.sectionIcon} /> Unused Subscriptions
                        </h2>
                    </div>
                    <div className={`${styles.grid} ${styles.unusedGrid}`}>
                        {cancelRecs.map((rec, index) => (
                            <div key={index} className={`${styles.recommendationItem} ${styles.unusedItem}`} style={{ cursor: 'default' }}>
                                <div className={styles.cardHeader}>
                                    <div className={styles.unusedServiceInfo}>
                                        <ServiceIcon
                                            name={rec.service_name}
                                            className={styles.serviceLogo}
                                            fallbackClassName={styles.serviceLogoFallback}
                                        />
                                        <span className={styles.serviceName}>{rec.service_name}</span>
                                    </div>


                                    <span className={`${styles.badge} ${styles.badgeRed}`}>
                                        Save {formatCurrency(rec.savings, userCountry)}
                                        <span style={{ fontSize: '0.8em', opacity: 0.9, fontWeight: 500 }}>
                                            {rec.billing_cycle?.toLowerCase() === 'yearly' ? '/yr' : '/mo'}
                                        </span>
                                    </span>
                                </div>
                                <p className={styles.cardReason} style={{ marginBottom: 0 }}>{rec.reason}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Unified AI Analyst Entry Point */}
            <section className={styles.section}>
                <div className={styles.aiBanner}>
                    <div className={styles.aiBannerContent}>
                        <div className={styles.aiLabel}>
                            <Sparkles size={18} className="text-yellow-300" style={{ color: '#fde047' }} />
                            <span className={styles.aiLabelText}>
                                Unified Intelligence
                            </span>
                        </div>
                        <h2 className={styles.aiBannerTitle}>
                            Optimize Your Subscriptions & Discover Gems
                        </h2>
                        <p className={styles.aiBannerDesc}>
                            Get financial strategy, customized picks, and check for missing content gaps.
                        </p>
                    </div>
                    <button
                        onClick={() => setShowAIModal(true)}
                        className={styles.aiLaunchBtn}
                    >
                        <Sparkles size={20} /> Launch AI Analyst
                    </button>
                </div>
            </section>

            {/* Similar Content Section */}
            <section className={styles.section} style={{ opacity: refreshing ? 0.6 : 1, transition: 'opacity 0.2s' }}>
                <div className={styles.sectionHeader}>
                    <h2 className={styles.sectionTitle} style={{ color: '#2563eb' }}>
                        <Lightbulb className={styles.sectionIcon} /> You Might Like
                    </h2>
                    <button
                        onClick={handleRefresh}
                        disabled={refreshing || loadingSimilar}
                        className={styles.refreshBtn}
                    >
                        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>

                {(() => {
                    const isRecOnSub = (rec: Recommendation) => {
                        if (typeof rec.is_on_sub === 'boolean') return rec.is_on_sub;
                        if (!rec.service_name) return false;
                        const name = rec.service_name.toLowerCase().trim();
                        if (name === 'popular streaming' || name.startsWith('available on')) return false;
                        if (userSubscriptions.length > 0) {
                            return userSubscriptions.some(sub => {
                                const cleanSub = sub.replace(/\s*(plus|\+)\s*/g, '').toLowerCase().trim();
                                const cleanRec = name.replace(/\s*(plus|\+)\s*/g, '').toLowerCase().trim();
                                return cleanRec.includes(cleanSub) || cleanSub.includes(cleanRec);
                            });
                        }
                        return true;
                    };

                    const subCount = similarRecs.filter(isRecOnSub).length;
                    const exploreCount = similarRecs.filter(r => !isRecOnSub(r)).length;

                    const filteredRecs = similarRecs.filter(rec => {
                        const isOnSub = isRecOnSub(rec);
                        if (filterTab === 'subscriptions') return isOnSub;
                        if (filterTab === 'explore') return !isOnSub;
                        return true;
                    }).slice(0, 24);

                    return (
                        <>
                            {similarRecs.length > 0 && (
                                <>
                                    {/* Mobile Filter Dropdown */}
                                    <CustomFilterDropdown
                                        value={filterTab}
                                        onChange={(val) => setFilterTab(val)}
                                        options={[
                                            { value: 'all', label: 'All Picks', count: similarRecs.length, icon: <Layers size={14} /> },
                                            { value: 'subscriptions', label: 'On My Subscriptions', count: subCount, icon: <Tv size={14} /> },
                                            { value: 'explore', label: 'Worldwide & Explore', count: exploreCount, icon: <Globe size={14} /> },
                                        ]}
                                    />

                                    {/* Desktop Filter Pills */}
                                    <div className={`${styles.filterPills} ${styles.filterPillsDesktop}`}>
                                        <button
                                            className={`${styles.filterPill} ${filterTab === 'all' ? styles.filterPillActive : ''}`}
                                            onClick={() => setFilterTab('all')}
                                        >
                                            <Layers size={14} /> All Picks ({similarRecs.length})
                                        </button>
                                        <button
                                            className={`${styles.filterPill} ${filterTab === 'subscriptions' ? styles.filterPillActive : ''}`}
                                            onClick={() => setFilterTab('subscriptions')}
                                        >
                                            <Tv size={14} /> On My Subscriptions ({subCount})
                                        </button>
                                        <button
                                            className={`${styles.filterPill} ${filterTab === 'explore' ? styles.filterPillActive : ''}`}
                                            onClick={() => setFilterTab('explore')}
                                        >
                                            <Globe size={14} /> Worldwide & Explore ({exploreCount})
                                        </button>
                                    </div>
                                </>
                            )}

                            {loadingSimilar && similarRecs.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <Sparkles size={48} style={{ opacity: 0.2 }} />
                                    <p>Finding personalized recommendations...</p>
                                </div>
                            ) : filteredRecs.length > 0 ? (
                                <div key={filterTab} className={styles.grid}>
                                    {filteredRecs.map((rec, index) => {
                            const item: MediaItem = {
                                id: rec.tmdb_id || 0,
                                title: rec.items[0],
                                media_type: rec.media_type || 'movie',
                                overview: rec.overview || '',
                                poster_path: rec.poster_path,
                                vote_average: rec.vote_average,
                                genre_ids: rec.genre_ids,
                                original_language: rec.original_language
                            };
                            const existingItem = watchlist.find(w => w.tmdb_id === item.id);

                            if (existingItem) {
                                item.dbId = existingItem.id;
                                item.user_rating = existingItem.user_rating;
                                item.status = existingItem.status;
                                item.current_season = existingItem.current_season;
                                item.current_episode = existingItem.current_episode;
                                item.notes = existingItem.notes;
                            }

                            return (
                                <div key={index} className={styles.recommendationItem}>
                                    <div className={styles.reasonHeader} title={rec.reason}>
                                        <div className={styles.reasonBadge}>
                                            <Lightbulb size={14} style={{ flexShrink: 0, marginTop: 2 }} />
                                            {rec.reason}
                                        </div>
                                    </div>
                                    <MediaCard
                                        item={item}
                                        existingStatus={existingItem?.status}
                                        onAddSuccess={fetchWatchlist}
                                        showServiceBadge={rec.service_name}
                                        onRemove={existingItem ? () => confirmRemove(existingItem.id, rec.items[0]) : undefined}
                                        onStatusChange={() => {
                                            fetchWatchlist();
                                            refreshRecommendations();
                                        }}
                                    />
                                </div>
                            );
                        })}
                                </div>
                            ) : (
                                <div className={styles.emptyState}>
                                    <Lightbulb size={48} style={{ opacity: 0.2 }} />
                                    <p>No recommendations found. Try adding more items to your watchlist!</p>
                                </div>
                            )}
                        </>
                    );
                })()}
            </section>

            <ConfirmationModal
                isOpen={!!itemToRemove}
                onClose={() => setItemToRemove(null)}
                // Use a default title if itemToRemove is somehow null during fade-out
                title={`Remove ${itemToRemove?.title || 'Item'}?`}
                message={`Are you sure you want to remove ${itemToRemove?.title || 'this item'} from your watchlist?`}
                confirmLabel="Remove"
                onConfirm={handleRemove}
                isDangerous={true}
            />
        </div>
    );
}
