'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import styles from './recommendations.module.css';
import { Recommendation } from '@/lib/types';
import MediaCard, { MediaItem } from '@/components/MediaCard';
import { useRecommendations } from '@/context/RecommendationsContext';
import { PlayCircle, Lightbulb, TrendingUp, Sparkles, RefreshCw, XCircle, AlertTriangle, ChevronLeft, ChevronRight, ChevronDown, Tv, Globe, Layers, Flame, Star, Check, Plus, Info, Loader2, Search, X, Clock, Film, Trash2 } from 'lucide-react';
import { ServiceIcon } from '@/components/ServiceIcon';
import AIInsightsModal from '@/components/AIInsightsModal';
import MediaDetailsModal from '@/components/MediaDetailsModal';
import { STATUS_COLORS } from '@/lib/statusColors';
import { formatCurrency } from '@/lib/currency';

import ConfirmationModal from '@/components/ConfirmationModal';
import { RecommendationsSkeleton } from '@/components/SkeletonLoader';
import StarRating from '@/components/StarRating';
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

    // Search Feature State
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchCategory, setSearchCategory] = useState<'all' | 'movie' | 'tv' | 'anime'>('all');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [searchStatusDropdownId, setSearchStatusDropdownId] = useState<number | null>(null);
    const [searchStatusDropdownCoords, setSearchStatusDropdownCoords] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
    const [searchActiveDropdownItem, setSearchActiveDropdownItem] = useState<any | null>(null);
    const [searchRatingModeId, setSearchRatingModeId] = useState<number | null>(null);
    const [searchPendingStatus, setSearchPendingStatus] = useState<string | null>(null);
    const [expandedResultId, setExpandedResultId] = useState<number | null>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchStatusDropdownRef = useRef<HTMLDivElement>(null);

    const closeSearchStatusDropdown = () => {
        setSearchStatusDropdownId(null);
        setSearchRatingModeId(null);
        setSearchPendingStatus(null);
        setSearchStatusDropdownCoords(null);
        setSearchActiveDropdownItem(null);
    };

    useEffect(() => {
        try {
            const saved = localStorage.getItem('recs_recent_searches');
            if (saved) {
                setRecentSearches(JSON.parse(saved));
            } else {
                setRecentSearches(['Mobland', 'The Lord of the Rings', 'Avengers']);
            }
        } catch {
            setRecentSearches(['Mobland', 'The Lord of the Rings', 'Avengers']);
        }
    }, []);

    const saveRecentSearch = (term: string) => {
        if (!term || !term.trim()) return;
        const clean = term.trim();
        setRecentSearches(prev => {
            const next = [clean, ...prev.filter(s => s.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
            try {
                localStorage.setItem('recs_recent_searches', JSON.stringify(next));
            } catch {}
            return next;
        });
    };

    const clearRecentSearches = () => {
        setRecentSearches([]);
        try {
            localStorage.removeItem('recs_recent_searches');
        } catch {}
    };

    const removeRecentSearch = (e: React.MouseEvent, term: string) => {
        e.stopPropagation();
        setRecentSearches(prev => {
            const next = prev.filter(s => s !== term);
            try {
                localStorage.setItem('recs_recent_searches', JSON.stringify(next));
            } catch {}
            return next;
        });
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            // Keep search open while MediaDetailsModal or ConfirmationModal is active
            if (detailsModalItem || itemToRemove) return;
            const target = e.target as HTMLElement;
            if (searchStatusDropdownRef.current && searchStatusDropdownRef.current.contains(target)) {
                return;
            }
            if (searchStatusDropdownRef.current && !searchStatusDropdownRef.current.contains(target) && !target.closest('[data-recs-search-status-btn="true"]')) {
                closeSearchStatusDropdown();
            }
            if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
                setIsSearchOpen(false);
                closeSearchStatusDropdown();
            }
        };
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (detailsModalItem) return;
                if (searchRatingModeId || searchStatusDropdownId) {
                    closeSearchStatusDropdown();
                    return;
                }
                setIsSearchOpen(false);
            }
        };
        if (isSearchOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('resize', closeSearchStatusDropdown);
            setTimeout(() => searchInputRef.current?.focus(), 50);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', closeSearchStatusDropdown);
        };
    }, [isSearchOpen, detailsModalItem, itemToRemove, searchStatusDropdownId, searchRatingModeId]);

    useEffect(() => {
        if (!searchQuery || searchQuery.trim().length < 2) {
            setSearchResults([]);
            setIsSearchLoading(false);
            return;
        }

        const timer = setTimeout(async () => {
            setIsSearchLoading(true);
            try {
                const res = await api.get(`/search?query=${encodeURIComponent(searchQuery.trim())}`);
                const list = res.data?.results || [];
                const mediaOnly = list.filter((item: any) => item.media_type === 'movie' || item.media_type === 'tv');
                setSearchResults(mediaOnly);
            } catch (err) {
                console.error('Search error in recommendations:', err);
                setSearchResults([]);
            } finally {
                setIsSearchLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const isAnimeItem = (item: any) => {
        const hasAnimGenre = item.genre_ids?.includes(16);
        const isJapanese = item.original_language === 'ja';
        return hasAnimGenre && (isJapanese || item.media_type === 'tv' || item.origin_country?.includes('JP'));
    };

    const displayedSearchResults = searchResults.filter(item => {
        if (searchCategory === 'all') return true;
        if (searchCategory === 'anime') return isAnimeItem(item);
        if (searchCategory === 'movie') return item.media_type === 'movie' && !isAnimeItem(item);
        if (searchCategory === 'tv') return item.media_type === 'tv' && !isAnimeItem(item);
        return true;
    });

    const handleSelectSearchResult = (item: any) => {
        saveRecentSearch(item.title || item.name || searchQuery);
        const existing = watchlist.find(w => w.tmdb_id === item.id);
        setDetailsModalItem({
            id: item.id,
            dbId: existing?.id,
            title: item.title || item.name || '',
            name: item.name,
            overview: item.overview || '',
            poster_path: item.poster_path || '',
            backdrop_path: item.backdrop_path,
            vote_average: item.vote_average,
            media_type: item.media_type || (item.first_air_date ? 'tv' : 'movie'),
            status: existing?.status,
            user_rating: existing?.user_rating,
            current_season: existing?.current_season,
            current_episode: existing?.current_episode,
            notes: existing?.notes,
        });
        // Search persists: do not close or reset search here
    };

    const handleSearchStatusSelect = async (item: any, targetStatus: string) => {
        const showRating = targetStatus === 'watched' || targetStatus === 'watching';
        const existing = watchlist.find(w => w.tmdb_id === item.id);
        try {
            if (existing) {
                await api.put(`/watchlist/${existing.id}/status?status=${targetStatus}`);
            } else {
                await api.post('/watchlist/', {
                    tmdb_id: item.id,
                    title: item.title || item.name || 'Unknown',
                    media_type: item.media_type || (item.first_air_date ? 'tv' : 'movie'),
                    poster_path: item.poster_path,
                    backdrop_path: item.backdrop_path,
                    vote_average: item.vote_average,
                    overview: item.overview,
                    status: targetStatus,
                    genre_ids: item.genre_ids,
                    original_language: item.original_language
                });
            }
            await fetchWatchlist();
            if (showRating) {
                setSearchRatingModeId(item.id);
                setSearchPendingStatus(targetStatus);
                setSearchStatusDropdownId(item.id);
                setSearchActiveDropdownItem(item);
            } else {
                closeSearchStatusDropdown();
            }
        } catch (err) {
            console.error('Failed to update status from search', err);
        }
    };

    const handleSearchRatingSelect = async (item: any, rating: number) => {
        try {
            const existing = watchlist.find(w => w.tmdb_id === item.id);
            if (existing) {
                await api.put(`/watchlist/${existing.id}/rating`, { rating });
                await fetchWatchlist();
            }
        } catch (err) {
            console.error('Failed to save rating from search', err);
        } finally {
            closeSearchStatusDropdown();
        }
    };

    const handleSearchSkipRating = () => {
        closeSearchStatusDropdown();
    };

    const handleSearchRemove = async (watchlistId: number) => {
        try {
            await api.delete(`/watchlist/${watchlistId}`);
            await fetchWatchlist();
            closeSearchStatusDropdown();
        } catch (err) {
            console.error('Failed to remove from watchlist', err);
        }
    };

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

    const [dragStartX, setDragStartX] = useState<number | null>(null);
    const [dragCurrentX, setDragCurrentX] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    useEffect(() => {
        if (isHeroHovered || isDragging || filteredTrendingRecs.length <= 1) return;
        const interval = setInterval(() => {
            setHeroIndex((prev) => (prev + 1) % filteredTrendingRecs.length);
        }, 6000);
        return () => clearInterval(interval);
    }, [isHeroHovered, isDragging, filteredTrendingRecs.length]);

    const handleHeroPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
        if (!isDragging || dragStartX === null) return;
        setDragCurrentX(e.clientX);
    };

    const handleHeroPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging || dragStartX === null || dragCurrentX === null) {
            setIsDragging(false);
            setDragStartX(null);
            setDragCurrentX(null);
            return;
        }
        const diff = dragCurrentX - dragStartX;
        const threshold = 35;
        if (diff < -threshold && filteredTrendingRecs.length > 1) {
            // Dragged left: go to next item
            setHeroIndex((prev) => (prev + 1) % filteredTrendingRecs.length);
        } else if (diff > threshold && filteredTrendingRecs.length > 1) {
            // Dragged right: go to prev item
            setHeroIndex((prev) => (prev - 1 + filteredTrendingRecs.length) % filteredTrendingRecs.length);
        }
        setIsDragging(false);
        setDragStartX(null);
        setDragCurrentX(null);
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {}
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
                const existingHeroItem = currentHero ? watchlist.find(w => w.tmdb_id === currentHero.tmdb_id) : undefined;
                const releaseYear = currentHero?.release_date ? currentHero.release_date.split('-')[0] : '';
                const heroBackdrop = currentHero?.backdrop_path
                    ? `https://image.tmdb.org/t/p/w1280${currentHero.backdrop_path}`
                    : (currentHero?.poster_path ? `https://image.tmdb.org/t/p/w1280${currentHero.poster_path}` : '');

                const dragOffset = isDragging && dragStartX !== null && dragCurrentX !== null
                    ? Math.max(-120, Math.min(120, dragCurrentX - dragStartX))
                    : 0;

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
                        <div
                            className={styles.heroBackdropWrapper}
                            style={{
                                transform: dragOffset ? `translateX(${dragOffset * 0.4}px)` : undefined,
                                transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
                            }}
                        >
                            {heroBackdrop ? (
                                <img
                                    src={heroBackdrop}
                                    alt={currentHero?.items[0] || 'Featured'}
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

                        {/* Top Bar inside Hero: Filter Pills on Left, Separated Search Control on Right */}
                        <div className={styles.heroTopBar} data-interactive="true">
                            <div className={styles.heroTopBarLeft}>
                                {/* Desktop Filter Pills */}
                                <div className={`${styles.filterPills} ${styles.filterPillsDesktop}`}>
                                    <button
                                        className={`${styles.filterPill} ${trendingTab === 'all' ? styles.filterPillActive : ''}`}
                                        onClick={() => { setTrendingTab('all'); setHeroIndex(0); }}
                                    >
                                        <span className={styles.iconRecsAll}><Layers size={13} /></span>
                                        <span className={styles.pillLabel}>All Trending</span>
                                        <span className={styles.pillCount}>{trendingRecs.length}</span>
                                    </button>
                                    <button
                                        className={`${styles.filterPill} ${trendingTab === 'subscriptions' ? styles.filterPillActive : ''}`}
                                        onClick={() => { setTrendingTab('subscriptions'); setHeroIndex(0); }}
                                    >
                                        <span className={styles.iconRecsSubs}><Tv size={13} /></span>
                                        <span className={styles.pillLabel}>On My Subscriptions</span>
                                        <span className={styles.pillCount}>{trendingSubCount}</span>
                                    </button>
                                    <button
                                        className={`${styles.filterPill} ${trendingTab === 'explore' ? styles.filterPillActive : ''}`}
                                        onClick={() => { setTrendingTab('explore'); setHeroIndex(0); }}
                                    >
                                        <span className={styles.iconRecsExplore}><Globe size={13} /></span>
                                        <span className={styles.pillLabel}>Worldwide & Explore</span>
                                        <span className={styles.pillCount}>{trendingExploreCount}</span>
                                    </button>
                                </div>

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
                                <div className={styles.heroSearchWrapper} ref={searchContainerRef}>
                                    {!isSearchOpen ? (
                                        <button
                                            type="button"
                                            className={styles.heroSearchTriggerBtn}
                                            onClick={() => setIsSearchOpen(true)}
                                            title="Search movies, shows, and anime"
                                            aria-label="Search movies, shows, and anime"
                                        >
                                            <Search size={15} />
                                            <span className={styles.heroSearchTriggerLabel}>Search</span>
                                        </button>
                                    ) : (
                                        <div className={styles.heroSearchActiveBox}>
                                            <div className={styles.heroSearchInputContainer}>
                                                <Search size={15} className={styles.heroSearchInputIcon} />
                                                <input
                                                    ref={searchInputRef}
                                                    type="text"
                                                    className={styles.heroSearchInput}
                                                    placeholder="Search movies, shows, and anime"
                                                    value={searchQuery}
                                                    onChange={(e) => setSearchQuery(e.target.value)}
                                                />
                                                {searchQuery && (
                                                    <button
                                                        type="button"
                                                        className={styles.heroSearchClearQueryBtn}
                                                        onClick={() => setSearchQuery('')}
                                                        title="Clear text"
                                                    >
                                                        <X size={13} />
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className={styles.heroSearchCloseBtn}
                                                    onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                                                    title="Close search"
                                                >
                                                    <X size={15} />
                                                </button>
                                            </div>

                                            {/* Dropdown panel matching reference design */}
                                            <div className={styles.heroSearchDropdownPanel}>
                                                {/* Category filter tabs with live counts */}
                                                <div className={styles.searchCategoryTabs}>
                                                    <button
                                                        type="button"
                                                        className={`${styles.searchCategoryTab} ${searchCategory === 'all' ? styles.searchCategoryTabActive : ''}`}
                                                        onClick={() => setSearchCategory('all')}
                                                    >
                                                        <span>All</span>
                                                        {searchResults.length > 0 && <span className={styles.searchCategoryCount}>{searchResults.length}</span>}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${styles.searchCategoryTab} ${searchCategory === 'movie' ? styles.searchCategoryTabActive : ''}`}
                                                        onClick={() => setSearchCategory('movie')}
                                                    >
                                                        <span>Movies</span>
                                                        {searchResults.length > 0 && (
                                                            <span className={styles.searchCategoryCount}>
                                                                {searchResults.filter(r => r.media_type === 'movie' && !isAnimeItem(r)).length}
                                                            </span>
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${styles.searchCategoryTab} ${searchCategory === 'tv' ? styles.searchCategoryTabActive : ''}`}
                                                        onClick={() => setSearchCategory('tv')}
                                                    >
                                                        <span>TV Shows</span>
                                                        {searchResults.length > 0 && (
                                                            <span className={styles.searchCategoryCount}>
                                                                {searchResults.filter(r => r.media_type === 'tv' && !isAnimeItem(r)).length}
                                                            </span>
                                                        )}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={`${styles.searchCategoryTab} ${searchCategory === 'anime' ? styles.searchCategoryTabActive : ''}`}
                                                        onClick={() => setSearchCategory('anime')}
                                                    >
                                                        <span>Anime</span>
                                                        {searchResults.length > 0 && (
                                                            <span className={styles.searchCategoryCount}>
                                                                {searchResults.filter(r => isAnimeItem(r)).length}
                                                            </span>
                                                        )}
                                                    </button>
                                                </div>

                                                {/* Dropdown content: Recent Searches vs Results */}
                                                {searchQuery.trim().length < 2 ? (
                                                    <div className={styles.recentSearchesSection}>
                                                        <div className={styles.recentSearchesHeader}>
                                                            <span>Recent searches</span>
                                                            {recentSearches.length > 0 && (
                                                                <button
                                                                    type="button"
                                                                    className={styles.clearRecentBtn}
                                                                    onClick={clearRecentSearches}
                                                                >
                                                                    Clear
                                                                </button>
                                                            )}
                                                        </div>
                                                        {recentSearches.length > 0 ? (
                                                            <div className={styles.recentSearchesList}>
                                                                {recentSearches.map((term, idx) => (
                                                                    <div
                                                                        key={idx}
                                                                        className={styles.recentSearchItem}
                                                                        onClick={() => {
                                                                            setSearchQuery(term);
                                                                            searchInputRef.current?.focus();
                                                                        }}
                                                                    >
                                                                        <div className={styles.recentSearchItemLeft}>
                                                                            <Clock size={13} className={styles.recentSearchClock} />
                                                                            <span>{term}</span>
                                                                        </div>
                                                                        <button
                                                                            type="button"
                                                                            className={styles.removeRecentItemBtn}
                                                                            onClick={(e) => removeRecentSearch(e, term)}
                                                                            title="Remove"
                                                                        >
                                                                            <X size={12} />
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <p className={styles.emptyRecentNotice}>No recent searches</p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className={styles.searchResultsSection}>
                                                        {isSearchLoading ? (
                                                            <div className={styles.searchLoadingState}>
                                                                <Loader2 size={16} className={styles.spinIcon} />
                                                                <span>Searching titles...</span>
                                                            </div>
                                                        ) : displayedSearchResults.length > 0 ? (
                                                            <div className={styles.searchResultsList} onScroll={closeSearchStatusDropdown}>
                                                                {displayedSearchResults.slice(0, 10).map((item: any, idx: number) => {
                                                                    const title = item.title || item.name || '';
                                                                    const releaseYear = (item.release_date || item.first_air_date || '').split('-')[0];
                                                                    const isAnim = isAnimeItem(item);
                                                                    const mediaLabel = isAnim ? 'Anime' : (item.media_type === 'movie' ? 'Movie' : 'TV Series');
                                                                    const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : '';
                                                                    const existing = watchlist.find(w => w.tmdb_id === item.id);
                                                                    const statusConfig = existing ? STATUS_COLORS[existing.status] : null;
                                                                    const isExpanded = expandedResultId === item.id;
                                                                    const isStatusOpen = searchStatusDropdownId === item.id;
                                                                    const isRatingMode = searchRatingModeId === item.id;
                                                                    const totalItems = Math.min(displayedSearchResults.length, 10);
                                                                    const isDropup = totalItems >= 3 && idx >= totalItems - 2;

                                                                    return (
                                                                        <div
                                                                            key={`${item.media_type}-${item.id}`}
                                                                            className={`${styles.searchResultCard} ${isStatusOpen ? styles.searchResultCardActive : ''}`}
                                                                        >
                                                                            <div
                                                                                className={styles.searchResultCardHeader}
                                                                                onClick={() => setExpandedResultId(isExpanded ? null : item.id)}
                                                                            >
                                                                                {posterUrl ? (
                                                                                    <img
                                                                                        src={posterUrl}
                                                                                        alt={title}
                                                                                        className={styles.searchResultPoster}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleSelectSearchResult(item);
                                                                                        }}
                                                                                        title="Click to view details"
                                                                                    />
                                                                                ) : (
                                                                                    <div
                                                                                        className={styles.searchResultPosterFallback}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleSelectSearchResult(item);
                                                                                        }}
                                                                                    >
                                                                                        {item.media_type === 'movie' ? <Film size={18} /> : <Tv size={18} />}
                                                                                    </div>
                                                                                )}

                                                                                <div className={styles.searchResultInfo}>
                                                                                    <span
                                                                                        className={styles.searchResultTitle}
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            handleSelectSearchResult(item);
                                                                                        }}
                                                                                        title="Click to view details"
                                                                                    >
                                                                                        {title}
                                                                                    </span>
                                                                                    <div className={styles.searchResultMeta}>
                                                                                        <span>{mediaLabel}</span>
                                                                                        <span>•</span>
                                                                                        <span>{releaseYear || 'N/A'}</span>
                                                                                        {item.vote_average && item.vote_average > 0 ? (
                                                                                            <span className={styles.searchResultRating}>
                                                                                                <Star size={12} fill="#fbbf24" stroke="none" />
                                                                                                {item.vote_average.toFixed(1)}
                                                                                            </span>
                                                                                        ) : null}
                                                                                    </div>
                                                                                </div>

                                                                                <div className={styles.searchResultActions} onClick={(e) => e.stopPropagation()}>
                                                                                    <div className={styles.searchItemStatusContainer}>
                                                                                        <button
                                                                                            type="button"
                                                                                            data-recs-search-status-btn="true"
                                                                                            className={existing ? styles.searchItemStatusBtnActive : styles.searchItemAddBtn}
                                                                                            onClick={(e) => {
                                                                                                e.stopPropagation();
                                                                                                if (isStatusOpen) {
                                                                                                    closeSearchStatusDropdown();
                                                                                                } else {
                                                                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                                                                    const spaceBelow = window.innerHeight - rect.bottom;
                                                                                                    const isDropup = spaceBelow < 250 && rect.top > 250;
                                                                                                    if (isDropup) {
                                                                                                        setSearchStatusDropdownCoords({
                                                                                                            bottom: window.innerHeight - rect.top + 4,
                                                                                                            right: window.innerWidth - rect.right,
                                                                                                        });
                                                                                                    } else {
                                                                                                        setSearchStatusDropdownCoords({
                                                                                                            top: rect.bottom + 4,
                                                                                                            right: window.innerWidth - rect.right,
                                                                                                        });
                                                                                                    }
                                                                                                    setSearchStatusDropdownId(item.id);
                                                                                                    setSearchActiveDropdownItem(item);
                                                                                                    setSearchRatingModeId(null);
                                                                                                    setSearchPendingStatus(null);
                                                                                                }
                                                                                            }}
                                                                                            style={existing && statusConfig ? { backgroundColor: `${statusConfig.color}22`, borderColor: statusConfig.color, color: statusConfig.color } : {}}
                                                                                        >
                                                                                            {existing && statusConfig ? (
                                                                                                <>
                                                                                                    <statusConfig.icon size={14} />
                                                                                                    <span>{statusConfig.label}</span>
                                                                                                    {existing.user_rating ? <span>• ★ {existing.user_rating}</span> : null}
                                                                                                </>
                                                                                            ) : (
                                                                                                <>
                                                                                                    <Plus size={14} />
                                                                                                    <span>Add</span>
                                                                                                </>
                                                                                            )}
                                                                                            <ChevronDown size={13} className={isStatusOpen ? styles.rotateChevron : ''} />
                                                                                        </button>
                                                                                    </div>

                                                                                    <button
                                                                                        type="button"
                                                                                        className={styles.searchItemDetailsIconBtn}
                                                                                        onClick={() => handleSelectSearchResult(item)}
                                                                                        title="View more details"
                                                                                        aria-label="View more details"
                                                                                    >
                                                                                        <Info size={16} />
                                                                                    </button>
                                                                                </div>
                                                                            </div>

                                                                            {isExpanded && (
                                                                                <div className={styles.searchResultExpandedDetails}>
                                                                                    <p className={styles.searchResultOverview}>
                                                                                        {item.overview || 'No synopsis available for this title.'}
                                                                                    </p>
                                                                                    <div className={styles.searchResultExpandedActions}>
                                                                                        <button
                                                                                            type="button"
                                                                                            className={styles.searchResultPopoutBtn}
                                                                                            onClick={() => handleSelectSearchResult(item)}
                                                                                        >
                                                                                            <Info size={14} />
                                                                                            <span>View More Details</span>
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        ) : (
                                                            <div className={styles.searchEmptyState}>
                                                                <span>No {searchCategory !== 'all' ? searchCategory : ''} titles found matching &ldquo;{searchQuery}&rdquo;</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {currentHero ? (

                                <div
                                    className={styles.heroContent}
                                    style={{
                                        transform: dragOffset ? `translateX(${dragOffset * 0.55}px)` : undefined,
                                        transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
                                    }}
                                >
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
                                        {currentHero.service_name && (() => {
                                            const isPopular = currentHero.service_name.toLowerCase().includes('popular');
                                            return (
                                                <span className={styles.heroServiceBadge}>
                                                    {isPopular ? (
                                                        <TrendingUp size={13} style={{ color: '#ec4899', flexShrink: 0 }} />
                                                    ) : (
                                                        <ServiceIcon name={currentHero.service_name} style={{ width: 14, height: 14, borderRadius: 3, flexShrink: 0 }} />
                                                    )}
                                                    <span>{currentHero.service_name}</span>
                                                </span>
                                            );
                                        })()}
                                    </div>

                                    <h2 className={styles.heroTitle}>{currentHero.items[0]}</h2>

                                    <p className={styles.heroOverview}>{currentHero.overview || 'Popular content trending across major streaming networks.'}</p>

                                    <div className={styles.heroActionsRow}>
                                        <div className={styles.heroStatusDropdownContainer} ref={heroStatusRef}>
                                            <button
                                                type="button"
                                                className={existingHeroItem ? styles.heroBtnInWatchlist : styles.heroBtnPrimary}
                                                onClick={() => setHeroStatusDropdownOpen(!heroStatusDropdownOpen)}
                                                disabled={heroAdding}
                                            >
                                                {heroAdding ? (
                                                    <Loader2 size={16} className={styles.spinIcon} />
                                                ) : existingHeroItem ? (
                                                    <>
                                                        <Check size={16} className={styles.heroBtnIcon} />
                                                        <span className={styles.heroBtnText}>{STATUS_COLORS[existingHeroItem.status]?.label || 'In Watchlist'}</span>
                                                        <ChevronDown size={14} className={`${styles.heroBtnChevron} ${heroStatusDropdownOpen ? styles.rotateChevron : ''}`} />
                                                    </>
                                                ) : (
                                                    <>
                                                        <Plus size={16} className={styles.heroBtnIcon} />
                                                        <span className={styles.heroBtnText}>Add to Watchlist</span>
                                                        <ChevronDown size={14} className={`${styles.heroBtnChevron} ${heroStatusDropdownOpen ? styles.rotateChevron : ''}`} />
                                                    </>
                                                )}
                                            </button>

                                            {heroStatusDropdownOpen && (
                                                <div className={styles.heroStatusMenu}>
                                                    {Object.entries(STATUS_COLORS).map(([statusKey, config]) => {
                                                        const IconComponent = config.icon;
                                                        const isCurrent = existingHeroItem?.status === statusKey;
                                                        return (
                                                            <button
                                                                key={statusKey}
                                                                type="button"
                                                                className={`${styles.heroStatusMenuItem} ${isCurrent ? styles.heroStatusMenuItemActive : ''}`}
                                                                onClick={async () => {
                                                                    setHeroStatusDropdownOpen(false);
                                                                    await handleHeroStatusSelect(currentHero, statusKey, existingHeroItem?.id);
                                                                }}
                                                            >
                                                                <IconComponent size={15} style={{ color: config.color, flexShrink: 0 }} />
                                                                <span>{config.label}</span>
                                                                {isCurrent && <Check size={14} style={{ marginLeft: 'auto', color: '#10b981' }} />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>

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
                        ) : (
                            <div className={styles.emptyHeroState}>
                                <p>No trending content available for this filter.</p>
                            </div>
                        )}

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
                                            onClick={() => setHeroIndex(idx)}
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
                );
            })()}

            {/* Lower Content inside Container */}
            <div className={styles.container}>

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

            {typeof document !== 'undefined' && searchStatusDropdownId !== null && searchStatusDropdownCoords && searchActiveDropdownItem && createPortal(
                <div
                    className={`${styles.searchItemStatusMenu} ${searchStatusDropdownCoords.bottom !== undefined ? styles.searchItemStatusMenuDropup : ''}`}
                    ref={searchStatusDropdownRef}
                    style={{
                        position: 'fixed',
                        top: searchStatusDropdownCoords.top !== undefined ? `${searchStatusDropdownCoords.top}px` : undefined,
                        bottom: searchStatusDropdownCoords.bottom !== undefined ? `${searchStatusDropdownCoords.bottom}px` : undefined,
                        right: `${searchStatusDropdownCoords.right}px`,
                        zIndex: 99999,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {searchRatingModeId === searchActiveDropdownItem.id ? (
                        <div className={styles.searchRatingContainer}>
                            <span className={styles.searchRatingLabel}>Rate this title</span>
                            <StarRating
                                rating={watchlist.find(w => w.tmdb_id === searchActiveDropdownItem.id)?.user_rating || 0}
                                onRatingChange={(r) => handleSearchRatingSelect(searchActiveDropdownItem, r)}
                                size={22}
                                maxStars={10}
                            />
                            <button
                                type="button"
                                className={styles.searchSkipRatingBtn}
                                onClick={handleSearchSkipRating}
                            >
                                Skip Rating
                            </button>
                        </div>
                    ) : (
                        <>
                            {Object.entries(STATUS_COLORS).map(([statusKey, config]) => {
                                const IconComponent = config.icon;
                                const existing = watchlist.find(w => w.tmdb_id === searchActiveDropdownItem.id);
                                const isCurrent = existing?.status === statusKey;
                                return (
                                    <button
                                        key={statusKey}
                                        type="button"
                                        className={`${styles.searchStatusMenuItem} ${isCurrent ? styles.searchStatusMenuItemActive : ''}`}
                                        onClick={() => handleSearchStatusSelect(searchActiveDropdownItem, statusKey)}
                                    >
                                        <IconComponent size={14} style={{ color: config.color, flexShrink: 0 }} />
                                        <span>{config.label}</span>
                                        {isCurrent && <Check size={13} style={{ marginLeft: 'auto', color: '#10b981' }} />}
                                    </button>
                                );
                            })}
                            {(() => {
                                const existing = watchlist.find(w => w.tmdb_id === searchActiveDropdownItem.id);
                                if (!existing) return null;
                                return (
                                    <>
                                        <div className={styles.searchStatusMenuDivider} />
                                        <button
                                            type="button"
                                            className={`${styles.searchStatusMenuItem} ${styles.searchStatusMenuItemDelete}`}
                                            onClick={() => handleSearchRemove(existing.id)}
                                        >
                                            <Trash2 size={14} />
                                            <span>Remove</span>
                                        </button>
                                    </>
                                );
                            })()}
                        </>
                    )}
                </div>,
                document.body
            )}
        </div>
        </div>
    );
}
