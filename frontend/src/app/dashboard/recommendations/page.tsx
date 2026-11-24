'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import api from '@/lib/api';
import styles from './recommendations.module.css';
import { Recommendation } from '@/lib/types';
import MediaCard, { MediaItem } from '@/components/MediaCard';
import { useRecommendations } from '@/context/RecommendationsContext';
import { PlayCircle, Lightbulb, TrendingUp, Sparkles, RefreshCw, XCircle, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, Tv, Globe, Layers, Flame, Star, Check, Plus, Info, Loader2 } from 'lucide-react';
import { ServiceIcon } from '@/components/ServiceIcon';
import AIInsightsModal from '@/components/AIInsightsModal';
import MediaDetailsModal from '@/components/MediaDetailsModal';
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
                        <span>{activeOption.label}</span>
                        <span className={styles.pillCount}>{activeOption.count}</span>
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
                                <span className={styles.pillCount}>{opt.count}</span>
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
    const [heroIndex, setHeroIndex] = useState(0);
    const [isHeroHovered, setIsHeroHovered] = useState(false);
    const [heroAdding, setHeroAdding] = useState(false);
    const [detailsModalItem, setDetailsModalItem] = useState<MediaItem | null>(null);
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

    useEffect(() => {
        if (isHeroHovered || filteredTrendingRecs.length <= 1) return;
        const interval = setInterval(() => {
            setHeroIndex((prev) => (prev + 1) % filteredTrendingRecs.length);
        }, 6000);
        return () => clearInterval(interval);
    }, [isHeroHovered, filteredTrendingRecs.length]);

    const handleHeroWatchlistClick = async (rec: Recommendation, existingId?: number, existingStatus?: string) => {
        if (heroAdding) return;
        setHeroAdding(true);
        try {
            if (existingId) {
                const nextStatus = existingStatus === 'plan_to_watch' ? 'watching' : 'plan_to_watch';
                await api.put(`/watchlist/${existingId}`, { status: nextStatus });
            } else {
                await api.post('/watchlist/', {
                    tmdb_id: rec.tmdb_id || 0,
                    title: rec.items[0],
                    media_type: rec.media_type || 'movie',
                    poster_path: rec.poster_path,
                    backdrop_path: rec.backdrop_path,
                    vote_average: rec.vote_average,
                    overview: rec.overview,
                    status: 'plan_to_watch',
                    genre_ids: rec.genre_ids,
                    original_language: rec.original_language
                });
            }
            await fetchWatchlist();
        } catch (e) {
            console.error('Failed to update watchlist from hero', e);
        } finally {
            setHeroAdding(false);
        }
    };

    const handleHeroMoreInfo = (rec: Recommendation, existingItem?: { id: number; status: string; user_rating?: number; current_season?: number; current_episode?: number; notes?: string }) => {
        setDetailsModalItem({
            id: rec.tmdb_id || 0,
            dbId: existingItem?.id,
            title: rec.items[0],
            overview: rec.overview || '',
            poster_path: rec.poster_path || '',
            backdrop_path: rec.backdrop_path,
            vote_average: rec.vote_average || 0,
            media_type: (rec.media_type as 'movie' | 'tv') || 'movie',
            user_rating: existingItem?.user_rating || 0,
            status: existingItem?.status,
            genre_ids: rec.genre_ids,
            original_language: rec.original_language,
            current_season: existingItem?.current_season,
            current_episode: existingItem?.current_episode,
            notes: existingItem?.notes
        });
    };

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

            {/* Trending Section - Cinematic Hero Showcase & Filter Pills */}
            {trendingRecs.length > 0 && (() => {
                const safeHeroIndex = filteredTrendingRecs.length > 0 ? heroIndex % filteredTrendingRecs.length : 0;
                const currentHero = filteredTrendingRecs[safeHeroIndex];
                const existingHeroItem = currentHero ? watchlist.find(w => w.tmdb_id === currentHero.tmdb_id) : undefined;
                const releaseYear = currentHero?.release_date ? currentHero.release_date.split('-')[0] : '';
                const heroBackdrop = currentHero?.backdrop_path
                    ? `https://image.tmdb.org/t/p/w1280${currentHero.backdrop_path}`
                    : (currentHero?.poster_path ? `https://image.tmdb.org/t/p/w1280${currentHero.poster_path}` : '');

                return (
                    <section className={styles.section}>
                        <div className={styles.sectionHeader}>
                            <h2 className={styles.sectionTitle} style={{ color: '#ec4899' }}>
                                <PlayCircle className={styles.sectionIcon} /> Trending Content
                            </h2>
                        </div>

                        {/* Mobile Filter Dropdown */}
                        <CustomFilterDropdown
                            value={trendingTab}
                            onChange={(val) => {
                                setTrendingTab(val);
                                setHeroIndex(0);
                                setTrendingIndex(0);
                            }}
                            options={[
                                { 
                                    value: 'all', 
                                    label: 'All Trending', 
                                    count: trendingRecs.length, 
                                    icon: <span className={styles.iconRecsAll}><Layers size={14} /></span> 
                                },
                                { 
                                    value: 'subscriptions', 
                                    label: 'On My Subscriptions', 
                                    count: trendingSubCount, 
                                    icon: <span className={styles.iconRecsSubs}><Tv size={14} /></span> 
                                },
                                { 
                                    value: 'explore', 
                                    label: 'Worldwide & Explore', 
                                    count: trendingExploreCount, 
                                    icon: <span className={styles.iconRecsExplore}><Globe size={14} /></span> 
                                },
                            ]}
                        />

                        {/* Desktop Filter Pills */}
                        <div className={`${styles.filterPills} ${styles.filterPillsDesktop}`} style={{ marginBottom: '1.25rem' }}>
                            <button
                                className={`${styles.filterPill} ${trendingTab === 'all' ? styles.filterPillActive : ''}`}
                                onClick={() => { setTrendingTab('all'); setHeroIndex(0); setTrendingIndex(0); }}
                            >
                                <span className={styles.iconRecsAll}><Layers size={14} /></span>
                                <span className={styles.pillLabel}>All Trending</span>
                                <span className={styles.pillCount}>{trendingRecs.length}</span>
                            </button>
                            <button
                                className={`${styles.filterPill} ${trendingTab === 'subscriptions' ? styles.filterPillActive : ''}`}
                                onClick={() => { setTrendingTab('subscriptions'); setHeroIndex(0); setTrendingIndex(0); }}
                            >
                                <span className={styles.iconRecsSubs}><Tv size={14} /></span>
                                <span className={styles.pillLabel}>On My Subscriptions</span>
                                <span className={styles.pillCount}>{trendingSubCount}</span>
                            </button>
                            <button
                                className={`${styles.filterPill} ${trendingTab === 'explore' ? styles.filterPillActive : ''}`}
                                onClick={() => { setTrendingTab('explore'); setHeroIndex(0); setTrendingIndex(0); }}
                            >
                                <span className={styles.iconRecsExplore}><Globe size={14} /></span>
                                <span className={styles.pillLabel}>Worldwide & Explore</span>
                                <span className={styles.pillCount}>{trendingExploreCount}</span>
                            </button>
                        </div>

                        {/* Cinematic Hero Showcase */}
                        {currentHero && (
                            <div
                                className={styles.heroShowcase}
                                onMouseEnter={() => setIsHeroHovered(true)}
                                onMouseLeave={() => setIsHeroHovered(false)}
                            >
                                <div className={styles.heroBackdropWrapper}>
                                    {heroBackdrop ? (
                                        <img
                                            src={heroBackdrop}
                                            alt={currentHero.items[0]}
                                            className={styles.heroBackdropImg}
                                        />
                                    ) : (
                                        <div className={styles.heroBackdropFallback} />
                                    )}
                                    <div className={styles.heroBackdropScrimLeft} />
                                    <div className={styles.heroBackdropScrimBottom} />
                                </div>

                                <div className={styles.heroContent}>
                                    <div className={styles.heroBadgesRow}>
                                        <span className={styles.heroRankBadge}>
                                            <Flame size={13} className={styles.heroRankIcon} />
                                            #{safeHeroIndex + 1} Trending
                                        </span>
                                        {currentHero.vote_average ? (
                                            <span className={styles.heroRatingBadge}>
                                                <Star size={13} fill="#fbbf24" stroke="none" />
                                                {currentHero.vote_average.toFixed(1)}
                                            </span>
                                        ) : null}
                                        <span className={styles.heroMetaBadge}>
                                            {currentHero.media_type === 'tv' ? 'TV Series' : 'Movie'}
                                            {releaseYear ? ` · ${releaseYear}` : ''}
                                        </span>
                                        {currentHero.service_name && (
                                            <span className={styles.heroServiceBadge}>
                                                <ServiceIcon name={currentHero.service_name} style={{ width: 14, height: 14, borderRadius: 3 }} />
                                                {currentHero.service_name}
                                            </span>
                                        )}
                                    </div>

                                    <h2 className={styles.heroTitle}>{currentHero.items[0]}</h2>

                                    <p className={styles.heroOverview}>{currentHero.overview || 'Popular content trending across major streaming networks.'}</p>

                                    <div className={styles.heroActionsRow}>
                                        <button
                                            type="button"
                                            className={existingHeroItem ? styles.heroBtnInWatchlist : styles.heroBtnPrimary}
                                            onClick={() => handleHeroWatchlistClick(currentHero, existingHeroItem?.id, existingHeroItem?.status)}
                                            disabled={heroAdding}
                                        >
                                            {heroAdding ? (
                                                <Loader2 size={16} className={styles.spinIcon} />
                                            ) : existingHeroItem ? (
                                                <>
                                                    <Check size={16} />
                                                    <span>In Watchlist ({existingHeroItem.status === 'watching' ? 'Watching' : 'Plan to Watch'})</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Plus size={16} />
                                                    <span>Add to Watchlist</span>
                                                </>
                                            )}
                                        </button>

                                        <button
                                            type="button"
                                            className={styles.heroBtnSecondary}
                                            onClick={() => handleHeroMoreInfo(currentHero, existingHeroItem)}
                                        >
                                            <Info size={16} />
                                            <span>More Info</span>
                                        </button>
                                    </div>
                                </div>

                                <div className={styles.heroControlsRow}>
                                    <div className={styles.heroIndicators}>
                                        {filteredTrendingRecs.map((_, idx) => (
                                            <button
                                                key={idx}
                                                type="button"
                                                aria-label={`Slide ${idx + 1}`}
                                                className={`${styles.heroDash} ${idx === safeHeroIndex ? styles.heroDashActive : ''}`}
                                                onClick={() => setHeroIndex(idx)}
                                            />
                                        ))}
                                    </div>

                                    <div className={styles.heroArrows}>
                                        <button
                                            type="button"
                                            aria-label="Previous slide"
                                            className={styles.heroArrowBtn}
                                            onClick={() => setHeroIndex((safeHeroIndex - 1 + filteredTrendingRecs.length) % filteredTrendingRecs.length)}
                                        >
                                            <ChevronLeft size={18} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Next slide"
                                            className={styles.heroArrowBtn}
                                            onClick={() => setHeroIndex((safeHeroIndex + 1) % filteredTrendingRecs.length)}
                                        >
                                            <ChevronRight size={18} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Remaining Trending Cards Rail */}
                        <div className={styles.trendingRailHeader}>
                            <h3 className={styles.trendingRailTitle}>Explore All Trending ({filteredTrendingRecs.length})</h3>
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
                                                backdrop_path: rec.backdrop_path,
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
                                );
                            })}
                        </div>
                    </section>
                );
            })()}

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
                                            { 
                                                value: 'all', 
                                                label: 'All Picks', 
                                                count: similarRecs.length, 
                                                icon: <span className={styles.iconRecsAll}><Layers size={14} /></span> 
                                            },
                                            { 
                                                value: 'subscriptions', 
                                                label: 'On My Subscriptions', 
                                                count: subCount, 
                                                icon: <span className={styles.iconRecsSubs}><Tv size={14} /></span> 
                                            },
                                            { 
                                                value: 'explore', 
                                                label: 'Worldwide & Explore', 
                                                count: exploreCount, 
                                                icon: <span className={styles.iconRecsExplore}><Globe size={14} /></span> 
                                            },
                                        ]}
                                    />

                                    {/* Desktop Filter Pills */}
                                    <div className={`${styles.filterPills} ${styles.filterPillsDesktop}`}>
                                        <button
                                            className={`${styles.filterPill} ${filterTab === 'all' ? styles.filterPillActive : ''}`}
                                            onClick={() => setFilterTab('all')}
                                        >
                                            <span className={styles.iconRecsAll}><Layers size={14} /></span>
                                            <span className={styles.pillLabel}>All Picks</span>
                                            <span className={styles.pillCount}>{similarRecs.length}</span>
                                        </button>
                                        <button
                                            className={`${styles.filterPill} ${filterTab === 'subscriptions' ? styles.filterPillActive : ''}`}
                                            onClick={() => setFilterTab('subscriptions')}
                                        >
                                            <span className={styles.iconRecsSubs}><Tv size={14} /></span>
                                            <span className={styles.pillLabel}>On My Subscriptions</span>
                                            <span className={styles.pillCount}>{subCount}</span>
                                        </button>
                                        <button
                                            className={`${styles.filterPill} ${filterTab === 'explore' ? styles.filterPillActive : ''}`}
                                            onClick={() => setFilterTab('explore')}
                                        >
                                            <span className={styles.iconRecsExplore}><Globe size={14} /></span>
                                            <span className={styles.pillLabel}>Worldwide & Explore</span>
                                            <span className={styles.pillCount}>{exploreCount}</span>
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

            {detailsModalItem && (
                <MediaDetailsModal
                    visible={!!detailsModalItem}
                    onClose={() => setDetailsModalItem(null)}
                    mediaType={detailsModalItem.media_type}
                    tmdbId={detailsModalItem.id}
                    initialData={{
                        title: detailsModalItem.title || detailsModalItem.name || '',
                        poster_path: detailsModalItem.poster_path,
                        overview: detailsModalItem.overview || '',
                        vote_average: detailsModalItem.vote_average
                    }}
                    dbId={detailsModalItem.dbId}
                    userRating={detailsModalItem.user_rating}
                    currentSeason={detailsModalItem.current_season}
                    currentEpisode={detailsModalItem.current_episode}
                    notes={detailsModalItem.notes}
                />
            )}

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
