'use client';

import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import api from '@/lib/api';
import { Search, X, Clock, Loader2, Film, Tv, Star, Plus, ChevronDown, Info, Check, Trash2 } from 'lucide-react';
import { STATUS_COLORS } from '@/lib/statusColors';
import StarRating from './StarRating';
import MediaDetailsModal from './MediaDetailsModal';
import styles from './InlineMediaSearch.module.css';

export interface WatchlistLookupItem {
    dbId: number;
    tmdbId: number;
    status: string;
    user_rating?: number;
    title?: string;
    current_season?: number;
    current_episode?: number;
    notes?: string;
}

interface InlineMediaSearchProps {
    watchlist: WatchlistLookupItem[];
    onWatchlistUpdate: () => Promise<void> | void;
    variant?: 'hero' | 'watchlist';
    triggerLabel?: string;
    isOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export default function InlineMediaSearch({
    watchlist,
    onWatchlistUpdate,
    variant = 'hero',
    triggerLabel,
    isOpen: controlledOpen,
    onOpenChange,
}: InlineMediaSearchProps) {
    const [internalOpen, setInternalOpen] = useState(false);
    const isSearchOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;

    const setSearchOpen = (next: boolean) => {
        if (controlledOpen === undefined) {
            setInternalOpen(next);
        }
        onOpenChange?.(next);
    };

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [searchCategory, setSearchCategory] = useState<'all' | 'movie' | 'tv' | 'anime'>('all');
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [expandedResultId, setExpandedResultId] = useState<number | null>(null);
    const [searchStatusDropdownId, setSearchStatusDropdownId] = useState<number | null>(null);
    const [searchRatingModeId, setSearchRatingModeId] = useState<number | null>(null);
    const [searchPendingStatus, setSearchPendingStatus] = useState<string | null>(null);
    const [searchStatusDropdownCoords, setSearchStatusDropdownCoords] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
    const [searchActiveDropdownItem, setSearchActiveDropdownItem] = useState<any>(null);
    const [detailsModalItem, setDetailsModalItem] = useState<any>(null);

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
            if (detailsModalItem) return;
            const target = e.target as HTMLElement;
            if (searchStatusDropdownRef.current && searchStatusDropdownRef.current.contains(target)) {
                return;
            }
            if (searchStatusDropdownRef.current && !searchStatusDropdownRef.current.contains(target) && !target.closest('[data-recs-search-status-btn="true"]')) {
                closeSearchStatusDropdown();
            }
            if (target.closest('[data-inline-search-fab="true"]')) {
                return;
            }
            if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
                setSearchOpen(false);
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
                setSearchOpen(false);
            }
        };

        if (isSearchOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            window.addEventListener('keydown', handleKeyDown);
            window.addEventListener('resize', closeSearchStatusDropdown);
            setTimeout(() => searchInputRef.current?.focus(), 60);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', closeSearchStatusDropdown);
        };
    }, [isSearchOpen, detailsModalItem, searchStatusDropdownId, searchRatingModeId]);

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
                console.error('Search error:', err);
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
        const existing = watchlist.find(w => w.tmdbId === item.id);
        setDetailsModalItem({
            id: item.id,
            dbId: existing?.dbId,
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
    };

    const handleSearchStatusSelect = async (item: any, targetStatus: string) => {
        const showRating = targetStatus === 'watched' || targetStatus === 'watching';
        const existing = watchlist.find(w => w.tmdbId === item.id);
        try {
            if (existing) {
                await api.put(`/watchlist/${existing.dbId}/status?status=${targetStatus}`);
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
            saveRecentSearch(item.title || item.name || searchQuery);
            await onWatchlistUpdate();
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
            const existing = watchlist.find(w => w.tmdbId === item.id);
            if (existing) {
                await api.put(`/watchlist/${existing.dbId}/rating`, { rating });
                await onWatchlistUpdate();
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
            await onWatchlistUpdate();
            closeSearchStatusDropdown();
        } catch (err) {
            console.error('Failed to remove from watchlist', err);
        }
    };

    const defaultLabel = variant === 'watchlist' ? 'Add New' : 'Search';
    const labelText = triggerLabel || defaultLabel;

    return (
        <>
            <div className={styles.searchWrapper} ref={searchContainerRef}>
                {!isSearchOpen ? (
                    <button
                        type="button"
                        className={variant === 'watchlist' ? styles.watchlistTriggerBtn : styles.heroTriggerBtn}
                        onClick={() => setSearchOpen(true)}
                        title="Search movies, shows, and anime"
                        aria-label="Search movies, shows, and anime"
                    >
                        {variant === 'watchlist' ? <Plus size={18} /> : <Search size={15} />}
                        <span className={`${styles.triggerLabel} ${variant === 'hero' ? styles.heroTriggerLabel : ''}`}>
                            {labelText}
                        </span>
                    </button>
                ) : (
                    <div className={styles.searchActiveBox}>
                        <div className={styles.searchInputContainer}>
                            <Search size={15} className={styles.searchInputIcon} />
                            <input
                                ref={searchInputRef}
                                type="text"
                                className={styles.searchInput}
                                placeholder="Search movies, shows, and anime"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    className={styles.searchClearQueryBtn}
                                    onClick={() => setSearchQuery('')}
                                    title="Clear text"
                                >
                                    <X size={13} />
                                </button>
                            )}
                            <button
                                type="button"
                                className={styles.searchCloseBtn}
                                onClick={() => {
                                    setSearchOpen(false);
                                    setSearchQuery('');
                                }}
                                title="Close search"
                            >
                                <X size={15} />
                            </button>
                        </div>

                        <div className={styles.searchDropdownPanel}>
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

                            {searchQuery.trim().length < 2 ? (
                                <div>
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
                                <div>
                                    {isSearchLoading ? (
                                        <div className={styles.searchLoadingState}>
                                            <Loader2 size={16} className={styles.spinIcon} />
                                            <span>Searching titles...</span>
                                        </div>
                                    ) : displayedSearchResults.length > 0 ? (
                                        <div className={styles.searchResultsList} onScroll={closeSearchStatusDropdown}>
                                            {displayedSearchResults.slice(0, 10).map((item: any) => {
                                                const title = item.title || item.name || '';
                                                const releaseYear = (item.release_date || item.first_air_date || '').split('-')[0];
                                                const isAnim = isAnimeItem(item);
                                                const mediaLabel = isAnim ? 'Anime' : (item.media_type === 'movie' ? 'Movie' : 'TV Series');
                                                const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : '';
                                                const existing = watchlist.find(w => w.tmdbId === item.id);
                                                const statusConfig = existing ? STATUS_COLORS[existing.status] : null;
                                                const isExpanded = expandedResultId === item.id;
                                                const isStatusOpen = searchStatusDropdownId === item.id;

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
                                rating={watchlist.find(w => w.tmdbId === searchActiveDropdownItem.id)?.user_rating || 0}
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
                                const existing = watchlist.find(w => w.tmdbId === searchActiveDropdownItem.id);
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
                                const existing = watchlist.find(w => w.tmdbId === searchActiveDropdownItem.id);
                                if (!existing) return null;
                                return (
                                    <>
                                        <div className={styles.searchStatusMenuDivider} />
                                        <button
                                            type="button"
                                            className={`${styles.searchStatusMenuItem} ${styles.searchStatusMenuItemDelete}`}
                                            onClick={() => handleSearchRemove(existing.dbId)}
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
        </>
    );
}
