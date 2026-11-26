'use client';

import { useEffect, useState, useRef } from 'react';
import api from '@/lib/api';
import styles from './recommendations.module.css';
import { Recommendation } from '@/lib/types';
import MediaCard, { MediaItem } from '@/components/MediaCard';
import { useRecommendations } from '@/context/RecommendationsContext';
import { Lightbulb, TrendingUp, Sparkles, RefreshCw, ChevronLeft, ChevronRight, ChevronDown, Tv, Globe, Layers, Flame, Star, Check, Plus, Info, Loader2 } from 'lucide-react';
import { ServiceIcon } from '@/components/ServiceIcon';
import AIInsightsModal from '@/components/AIInsightsModal';
import MediaDetailsModal from '@/components/MediaDetailsModal';
import InlineMediaSearch from '@/components/InlineMediaSearch';
import { STATUS_COLORS } from '@/lib/statusColors';

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

function SlidingFilterPills({
    value,
    onChange,
    options
}: {
    value: 'all' | 'subscriptions' | 'explore';
    onChange: (val: 'all' | 'subscriptions' | 'explore') => void;
    options: FilterOption[];
}) {
    const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const [pillStyle, setPillStyle] = useState<{ left: number; top: number; width: number; height: number; opacity: number }>({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        opacity: 0,
    });

    const countSignature = options.map((o) => `${o.value}:${o.count}`).join(',');

    useEffect(() => {
        const updateIndicator = () => {
            const activeBtn = btnRefs.current[value];
            if (activeBtn && activeBtn.offsetWidth > 0) {
                setPillStyle({
                    left: activeBtn.offsetLeft,
                    top: activeBtn.offsetTop,
                    width: activeBtn.offsetWidth,
                    height: activeBtn.offsetHeight,
                    opacity: 1,
                });
            }
        };

        const rafId = requestAnimationFrame(updateIndicator);
        window.addEventListener('resize', updateIndicator);
        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener('resize', updateIndicator);
        };
    }, [value, countSignature]);

    return (
        <div className={`${styles.filterPills} ${styles.filterPillsDesktop}`}>
            <span
                aria-hidden="true"
                className={styles.filterPillIndicator}
                style={{
                    transform: `translate3d(${pillStyle.left}px, ${pillStyle.top}px, 0)`,
                    width: pillStyle.width ? `${pillStyle.width}px` : undefined,
                    height: pillStyle.height ? `${pillStyle.height}px` : undefined,
                    opacity: pillStyle.opacity,
                }}
            />
            {options.map((opt) => {
                const isActive = opt.value === value;
                return (
                    <button
                        key={opt.value}
                        ref={(el) => { btnRefs.current[opt.value] = el; }}
                        type="button"
                        className={`${styles.filterPill} ${isActive ? styles.filterPillActive : ''}`}
                        onClick={() => onChange(opt.value)}
                    >
                        {opt.icon}
                        <span className={styles.pillLabel}>{opt.label}</span>
                        <span className={styles.pillCount}>{opt.count}</span>
                    </button>
                );
            })}
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
    const [refreshing, setRefreshing] = useState(false);
    const [showAIModal, setShowAIModal] = useState(false);
    const [heroIndex, setHeroIndex] = useState(0);
    const [isHeroHovered, setIsHeroHovered] = useState(false);
    const [heroAdding, setHeroAdding] = useState(false);
    const [heroStatusDropdownOpen, setHeroStatusDropdownOpen] = useState(false);
    const heroStatusRef = useRef<HTMLDivElement>(null);
    const [detailsModalItem, setDetailsModalItem] = useState<MediaItem | null>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (heroStatusRef.current && !heroStatusRef.current.contains(e.target as Node)) {
                setHeroStatusDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
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

    const [dragStartX, setDragStartX] = useState<number | null>(null);
    const [dragCurrentX, setDragCurrentX] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animatingTarget, setAnimatingTarget] = useState<'next' | 'prev' | 'reset' | null>(null);

    const handleNextSlide = () => {
        if (isAnimating || filteredTrendingRecs.length <= 1) return;
        setIsAnimating(true);
        setAnimatingTarget('next');
        setTimeout(() => {
            setHeroIndex((prev) => (prev + 1) % filteredTrendingRecs.length);
            setIsAnimating(false);
            setAnimatingTarget(null);
            setIsDragging(false);
            setDragStartX(null);
            setDragCurrentX(null);
        }, 320);
    };

    const handlePrevSlide = () => {
        if (isAnimating || filteredTrendingRecs.length <= 1) return;
        setIsAnimating(true);
        setAnimatingTarget('prev');
        setTimeout(() => {
            setHeroIndex((prev) => (prev - 1 + filteredTrendingRecs.length) % filteredTrendingRecs.length);
            setIsAnimating(false);
            setAnimatingTarget(null);
            setIsDragging(false);
            setDragStartX(null);
            setDragCurrentX(null);
        }, 320);
    };

    useEffect(() => {
        if (isHeroHovered || isDragging || isAnimating || filteredTrendingRecs.length <= 1) return;
        const interval = setInterval(() => {
            handleNextSlide();
        }, 6000);
        return () => clearInterval(interval);
    }, [isHeroHovered, isDragging, isAnimating, filteredTrendingRecs.length]);

    const handleHeroPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isAnimating) return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const target = e.target as HTMLElement;
        if (target && target.closest('button, input, a, select, [role="button"], [data-interactive="true"]')) {
            return;
        }
        if (e.pointerType === 'mouse') {
            e.preventDefault();
        }
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch {}
        setDragStartX(e.clientX);
        setDragCurrentX(e.clientX);
        setIsDragging(true);
    };

    const handleHeroPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging || dragStartX === null || isAnimating) return;
        setDragCurrentX(e.clientX);
    };

    const handleHeroPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}

        if (!isDragging || dragStartX === null || dragCurrentX === null || isAnimating) {
            setIsDragging(false);
            setDragStartX(null);
            setDragCurrentX(null);
            return;
        }

        const diff = dragCurrentX - dragStartX;
        const threshold = 70;
        setIsDragging(false);
        if (diff < -threshold && filteredTrendingRecs.length > 1) {
            handleNextSlide();
        } else if (diff > threshold && filteredTrendingRecs.length > 1) {
            handlePrevSlide();
        } else {
            setIsAnimating(true);
            setAnimatingTarget('reset');
            setTimeout(() => {
                setIsAnimating(false);
                setAnimatingTarget(null);
                setDragStartX(null);
                setDragCurrentX(null);
            }, 250);
        }
    };

    const handleHeroStatusSelect = async (rec: Recommendation, targetStatus: string, existingId?: number) => {
        if (heroAdding) return;
        setHeroAdding(true);
        try {
            if (existingId) {
                await api.put(`/watchlist/${existingId}/status?status=${targetStatus}`);
            } else {
                await api.post('/watchlist/', {
                    tmdb_id: rec.tmdb_id || 0,
                    title: rec.items[0],
                    media_type: rec.media_type || 'movie',
                    poster_path: rec.poster_path,
                    backdrop_path: rec.backdrop_path,
                    vote_average: rec.vote_average,
                    overview: rec.overview,
                    status: targetStatus,
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
        <div className={styles.pageWrapper}>
            <AIInsightsModal
                isOpen={showAIModal}
                onClose={() => setShowAIModal(false)}
                watchlist={watchlist}
                onWatchlistUpdate={fetchWatchlist}
            />

            {/* Cinematic Hero Showcase spanning edge-to-edge at the top of the screen */}
            {trendingRecs.length > 0 && (() => {
                const safeHeroIndex = filteredTrendingRecs.length > 0 ? heroIndex % filteredTrendingRecs.length : 0;
                const currentHero = filteredTrendingRecs[safeHeroIndex];
                const hasMultiple = filteredTrendingRecs.length > 1;

                const prevHeroIndex = hasMultiple
                    ? (safeHeroIndex - 1 + filteredTrendingRecs.length) % filteredTrendingRecs.length
                    : safeHeroIndex;
                const nextHeroIndex = hasMultiple
                    ? (safeHeroIndex + 1) % filteredTrendingRecs.length
                    : safeHeroIndex;

                const prevHeroRec = hasMultiple ? filteredTrendingRecs[prevHeroIndex] : null;
                const nextHeroRec = hasMultiple ? filteredTrendingRecs[nextHeroIndex] : null;

                const dragOffset = isDragging && dragStartX !== null && dragCurrentX !== null
                    ? dragCurrentX - dragStartX
                    : 0;

                let trackTransform = 'translateX(0px)';
                let trackTransition = 'none';

                if (isDragging && !isAnimating) {
                    trackTransform = `translateX(${dragOffset}px)`;
                    trackTransition = 'none';
                } else if (isAnimating) {
                    if (animatingTarget === 'next') {
                        trackTransform = 'translateX(-100%)';
                        trackTransition = 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1)';
                    } else if (animatingTarget === 'prev') {
                        trackTransform = 'translateX(100%)';
                        trackTransition = 'transform 0.32s cubic-bezier(0.25, 1, 0.5, 1)';
                    } else if (animatingTarget === 'reset') {
                        trackTransform = 'translateX(0px)';
                        trackTransition = 'transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)';
                    }
                }

                const renderHeroSlide = (
                    rec: Recommendation | null,
                    slideIdx: number,
                    isCurrent: boolean,
                    positionClass: string
                ) => {
                    if (!rec) return null;
                    const existingItem = watchlist.find(w => w.tmdb_id === rec.tmdb_id);
                    const year = rec.release_date ? rec.release_date.split('-')[0] : '';
                    const backdrop = rec.backdrop_path
                        ? `https://image.tmdb.org/t/p/w1280${rec.backdrop_path}`
                        : (rec.poster_path ? `https://image.tmdb.org/t/p/w1280${rec.poster_path}` : '');

                    return (
                        <div key={`${rec.tmdb_id || rec.items[0]}-${positionClass}`} className={`${styles.heroSlide} ${positionClass}`}>
                            <div className={styles.heroBackdropWrapper}>
                                {backdrop ? (
                                    <img
                                        src={backdrop}
                                        alt={rec.items[0] || 'Featured'}
                                        className={styles.heroBackdropImg}
                                        draggable={false}
                                        onDragStart={(e) => e.preventDefault()}
                                    />
                                ) : (
                                    <div className={styles.heroBackdropFallback} />
                                )}
                                <div className={styles.heroBackdropScrimLeft} />
                                <div className={styles.heroBackdropScrimBottom} />
                            </div>

                            <div
                                className={styles.heroContent}
                                style={{ pointerEvents: isCurrent ? 'auto' : 'none' }}
                            >
                                <div className={styles.heroBadgesRow}>
                                    <span className={styles.heroRankBadge}>
                                        <Flame size={13} className={styles.heroRankIcon} />
                                        #{slideIdx + 1} Trending
                                    </span>
                                    {rec.vote_average ? (
                                        <span className={styles.heroRatingBadge}>
                                            <Star size={13} fill="#fbbf24" stroke="none" />
                                            {rec.vote_average.toFixed(1)}
                                        </span>
                                    ) : null}
                                    <span className={styles.heroMetaBadge}>
                                        {rec.media_type === 'tv' ? 'TV Series' : 'Movie'}
                                        {year ? ` · ${year}` : ''}
                                    </span>
                                    {rec.service_name && (() => {
                                        const isPopular = rec.service_name.toLowerCase().includes('popular');
                                        return (
                                            <span className={styles.heroServiceBadge}>
                                                {isPopular ? (
                                                    <TrendingUp size={13} style={{ color: '#ec4899', flexShrink: 0 }} />
                                                ) : (
                                                    <ServiceIcon name={rec.service_name} style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }} />
                                                )}
                                                <span>{rec.service_name}</span>
                                            </span>
                                        );
                                    })()}
                                </div>

                                <h2 className={styles.heroTitle}>{rec.items[0]}</h2>

                                <p className={styles.heroOverview}>{rec.overview || 'Popular content trending across major streaming networks.'}</p>

                                <div className={styles.heroActionsRow}>
                                    <div className={styles.heroStatusDropdownContainer} ref={isCurrent ? heroStatusRef : undefined}>
                                        <button
                                            type="button"
                                            className={existingItem ? styles.heroBtnInWatchlist : styles.heroBtnPrimary}
                                            onClick={() => {
                                                if (isCurrent) setHeroStatusDropdownOpen(!heroStatusDropdownOpen);
                                            }}
                                            disabled={heroAdding}
                                        >
                                            {heroAdding && isCurrent ? (
                                                <Loader2 size={16} className={styles.spinIcon} />
                                            ) : existingItem ? (
                                                <>
                                                    <Check size={16} className={styles.heroBtnIcon} />
                                                    <span className={styles.heroBtnText}>{STATUS_COLORS[existingItem.status]?.label || 'In Watchlist'}</span>
                                                    <ChevronDown size={14} className={`${styles.heroBtnChevron} ${isCurrent && heroStatusDropdownOpen ? styles.rotateChevron : ''}`} />
                                                </>
                                            ) : (
                                                <>
                                                    <Plus size={16} className={styles.heroBtnIcon} />
                                                    <span className={styles.heroBtnText}>Add to Watchlist</span>
                                                    <ChevronDown size={14} className={`${styles.heroBtnChevron} ${isCurrent && heroStatusDropdownOpen ? styles.rotateChevron : ''}`} />
                                                </>
                                            )}
                                        </button>

                                        {isCurrent && heroStatusDropdownOpen && (
                                            <div className={styles.heroStatusMenu}>
                                                {Object.entries(STATUS_COLORS).map(([statusKey, config]) => {
                                                    const IconComponent = config.icon;
                                                    const isItemCurrent = existingItem?.status === statusKey;
                                                    return (
                                                        <button
                                                            key={statusKey}
                                                            type="button"
                                                            className={`${styles.heroStatusMenuItem} ${isItemCurrent ? styles.heroStatusMenuItemActive : ''}`}
                                                            onClick={async () => {
                                                                setHeroStatusDropdownOpen(false);
                                                                await handleHeroStatusSelect(rec, statusKey, existingItem?.id);
                                                            }}
                                                        >
                                                            <IconComponent size={15} style={{ color: config.color, flexShrink: 0 }} />
                                                            <span>{config.label}</span>
                                                            {isItemCurrent && <Check size={14} style={{ marginLeft: 'auto', color: '#10b981' }} />}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        className={styles.heroBtnSecondary}
                                        onClick={() => handleHeroMoreInfo(rec, existingItem)}
                                    >
                                        <Info size={16} />
                                        <span>More Info</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                };

                return (
                    <div
                        className={`${styles.heroShowcase} ${isDragging ? styles.heroShowcaseDragging : ''}`}
                        onMouseEnter={() => setIsHeroHovered(true)}
                        onMouseLeave={() => setIsHeroHovered(false)}
                        onPointerDown={handleHeroPointerDown}
                        onPointerMove={handleHeroPointerMove}
                        onPointerUp={handleHeroPointerUp}
                        onPointerCancel={handleHeroPointerUp}
                        onDragStart={(e) => e.preventDefault()}
                    >
                        {/* Continuous 3-Slide Track */}
                        <div
                            className={styles.heroSliderTrack}
                            style={{
                                transform: trackTransform,
                                transition: trackTransition
                            }}
                        >
                            {hasMultiple && prevHeroRec && renderHeroSlide(prevHeroRec, prevHeroIndex, false, styles.heroSlidePrev)}
                            {currentHero ? renderHeroSlide(currentHero, safeHeroIndex, true, styles.heroSlideCurr) : (
                                <div className={styles.emptyHeroState}>
                                    <p>No trending content available for this filter.</p>
                                </div>
                            )}
                            {hasMultiple && nextHeroRec && renderHeroSlide(nextHeroRec, nextHeroIndex, false, styles.heroSlideNext)}
                        </div>

                        {/* Top Bar inside Hero: Filter Pills on Left, Separated Search Control on Right */}
                        <div className={styles.heroTopBar} data-interactive="true">
                            <div className={styles.heroTopBarLeft}>
                                {/* Desktop Filter Pills */}
                                <SlidingFilterPills
                                    value={trendingTab}
                                    onChange={(val) => {
                                        setTrendingTab(val);
                                        setHeroIndex(0);
                                    }}
                                    options={[
                                        {
                                            value: 'all',
                                            label: 'All Trending',
                                            count: trendingRecs.length,
                                            icon: <span className={styles.iconRecsAll}><Layers size={13} /></span>
                                        },
                                        {
                                            value: 'subscriptions',
                                            label: 'On My Subscriptions',
                                            count: trendingSubCount,
                                            icon: <span className={styles.iconRecsSubs}><Tv size={13} /></span>
                                        },
                                        {
                                            value: 'explore',
                                            label: 'Worldwide & Explore',
                                            count: trendingExploreCount,
                                            icon: <span className={styles.iconRecsExplore}><Globe size={13} /></span>
                                        },
                                    ]}
                                />

                                {/* Mobile Filter Dropdown */}
                                <div className={styles.mobileFilterDropdownWrapper}>
                                    <CustomFilterDropdown
                                        value={trendingTab}
                                        onChange={(val) => {
                                            setTrendingTab(val);
                                            setHeroIndex(0);
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
                                </div>
                            </div>

                            <div className={styles.heroTopBarRight}>
                                {/* Separated Search Control */}
                                <InlineMediaSearch
                                    watchlist={watchlist.map((w) => ({
                                        dbId: w.id,
                                        tmdbId: w.tmdb_id,
                                        status: w.status,
                                        user_rating: w.user_rating,
                                        title: w.title,
                                        current_season: w.current_season,
                                        current_episode: w.current_episode,
                                        notes: w.notes,
                                    }))}
                                    onWatchlistUpdate={fetchWatchlist}
                                    variant="hero"
                                    triggerLabel="Search"
                                />
                            </div>
                        </div>

                        <div className={styles.heroControlsRow} data-interactive="true">
                            <div className={styles.heroIndicators}>
                                {filteredTrendingRecs.map((_, idx) => {
                                    const isActive = idx === safeHeroIndex;
                                    return (
                                        <button
                                            key={idx}
                                            type="button"
                                            aria-label={`Slide ${idx + 1}`}
                                            className={`${styles.heroDash} ${isActive ? styles.heroDashActive : ''}`}
                                            onClick={() => {
                                                if (!isAnimating) setHeroIndex(idx);
                                            }}
                                        >
                                            {isActive && (
                                                <span
                                                    key={`progress-${safeHeroIndex}`}
                                                    className={`${styles.heroDashProgressBar} ${isHeroHovered ? styles.heroDashPaused : ''}`}
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className={styles.heroArrows}>
                                <button
                                    type="button"
                                    aria-label="Previous slide"
                                    className={styles.heroArrowBtn}
                                    onClick={handlePrevSlide}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Next slide"
                                    className={styles.heroArrowBtn}
                                    onClick={handleNextSlide}
                                >
                                    <ChevronRight size={18} />
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Lower Content inside Container */}
            <div className={styles.container}>

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
                                    <SlidingFilterPills
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
        </div>
    );
}
