import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Plus, Check, ChevronDown, Trash2, Star, Film, Tv, Clock, Info, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import styles from './AddMediaModal.module.css';
import StarRating from './StarRating';
import { STATUS_COLORS } from '@/lib/statusColors';
import MediaDetailsModal from './MediaDetailsModal';
import ConfirmationModal from './ConfirmationModal';

interface AddMediaModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAddSuccess: () => void;
    existingIds: Set<number>;
}

interface SearchResult {
    id: number;
    title?: string;
    name?: string;
    media_type: 'movie' | 'tv';
    poster_path?: string;
    backdrop_path?: string;
    release_date?: string;
    first_air_date?: string;
    vote_average?: number;
    genre_ids?: number[];
    overview?: string;
    original_language?: string;
}

interface ExistingItemState {
    id: number; // DB ID
    status: string;
    user_rating: number | null;
}

interface DetailMediaItem {
    id: number;
    dbId?: number;
    title?: string;
    name?: string;
    poster_path?: string;
    backdrop_path?: string;
    overview?: string;
    vote_average?: number;
    media_type: string;
    status?: string;
    user_rating?: number;
}

export default function AddMediaModal({ isOpen, onClose, onAddSuccess }: AddMediaModalProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchFilter, setSearchFilter] = useState<'all' | 'movie' | 'tv' | 'anime'>('all');

    // TMDB ID to ExistingItemState
    const [existingMap, setExistingMap] = useState<Map<number, ExistingItemState>>(new Map());

    const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
    const [dropdownCoords, setDropdownCoords] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
    const [activeDropdownItem, setActiveDropdownItem] = useState<SearchResult | null>(null);
    const [ratingModeId, setRatingModeId] = useState<number | null>(null);
    const [pendingStatus, setPendingStatus] = useState<string | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [selectedDetailItem, setSelectedDetailItem] = useState<DetailMediaItem | null>(null);
    const [itemToDelete, setItemToDelete] = useState<{ id: number; title: string } | null>(null);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);

    const inputRef = useRef<HTMLInputElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const closeDropdown = () => {
        setOpenDropdownId(null);
        setRatingModeId(null);
        setPendingStatus(null);
        setDropdownCoords(null);
        setActiveDropdownItem(null);
    };

    useEffect(() => {
        if (isOpen) {
            fetchExistingContext();
            loadRecentSearches();
            setTimeout(() => inputRef.current?.focus(), 80);
        } else {
            setQuery('');
            setResults([]);
            closeDropdown();
            setExpandedId(null);
        }
    }, [isOpen]);

    const loadRecentSearches = () => {
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
    };

    const saveRecentSearch = (term: string) => {
        const clean = term.trim();
        if (!clean) return;
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

    const fetchExistingContext = async () => {
        try {
            const res = await api.get('/watchlist/?limit=1000');
            const map = new Map<number, ExistingItemState>();
            res.data.forEach((item: any) => {
                if (item.tmdb_id) {
                    map.set(item.tmdb_id, {
                        id: item.id,
                        status: item.status,
                        user_rating: item.user_rating
                    });
                }
            });
            setExistingMap(map);
        } catch (e) {
            console.error('Failed to fetch context', e);
        }
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (selectedDetailItem || itemToDelete) return;
            const target = event.target as HTMLElement;
            if (target && target.closest('[data-status-btn="true"]')) {
                return;
            }
            if (dropdownRef.current && !dropdownRef.current.contains(target as Node)) {
                closeDropdown();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('resize', closeDropdown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('resize', closeDropdown);
        };
    }, [selectedDetailItem, itemToDelete]);

    // Debounced search
    useEffect(() => {
        if (!query.trim() || query.trim().length < 2) {
            setResults([]);
            setLoading(false);
            return;
        }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const response = await api.get(`/search?query=${encodeURIComponent(query.trim())}`);
                const validResults = (response.data?.results || [])
                    .filter((item: SearchResult) => item.media_type === 'movie' || item.media_type === 'tv')
                    .slice(0, 10);
                setResults(validResults);
            } catch (err) {
                console.error('Search failed', err);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query]);

    const isAnimeItem = (item: any) => {
        const hasAnimGenre = item.genre_ids?.includes(16);
        const isJapanese = item.original_language === 'ja';
        return hasAnimGenre && (isJapanese || item.media_type === 'tv' || item.origin_country?.includes('JP'));
    };

    const displayedResults = results.filter(item => {
        if (searchFilter === 'all') return true;
        if (searchFilter === 'anime') return isAnimeItem(item);
        if (searchFilter === 'movie') return item.media_type === 'movie' && !isAnimeItem(item);
        if (searchFilter === 'tv') return item.media_type === 'tv' && !isAnimeItem(item);
        return true;
    });

    const handleSelectSearchResult = (item: SearchResult) => {
        saveRecentSearch(item.title || item.name || query);
        const existing = existingMap.get(item.id);
        setSelectedDetailItem({
            id: item.id,
            dbId: existing?.id,
            title: item.title || item.name || '',
            name: item.name,
            overview: item.overview || '',
            poster_path: item.poster_path || '',
            backdrop_path: item.backdrop_path,
            vote_average: item.vote_average,
            media_type: item.media_type,
            status: existing?.status,
            user_rating: existing?.user_rating ?? undefined
        });
    };

    const handleStatusSelect = async (item: SearchResult, status: string) => {
        const showRating = status === 'watched' || status === 'watching';
        await executeSave(item, status, null, !showRating);
        if (showRating) {
            setRatingModeId(item.id);
            setPendingStatus(status);
            setOpenDropdownId(item.id);
            setActiveDropdownItem(item);
        } else {
            closeDropdown();
        }
    };

    const handleRatingSelect = async (item: SearchResult, rating: number) => {
        await executeSave(item, pendingStatus || 'watched', rating, true);
    };

    const handleSkipRating = () => {
        closeDropdown();
    };

    const executeSave = async (item: SearchResult, status: string, rating: number | null, shouldClose: boolean = true) => {
        const existing = existingMap.get(item.id);
        try {
            if (existing) {
                await api.put(`/watchlist/${existing.id}/status?status=${status}`);
                if (rating !== null) {
                    await api.put(`/watchlist/${existing.id}/rating`, { rating });
                }
                setExistingMap(prev => new Map(prev).set(item.id, {
                    ...existing,
                    status: status,
                    user_rating: rating !== null ? rating : existing.user_rating
                }));
            } else {
                const res = await api.post('/watchlist/', {
                    tmdb_id: item.id,
                    title: item.title || item.name || 'Unknown',
                    media_type: item.media_type,
                    poster_path: item.poster_path,
                    backdrop_path: item.backdrop_path,
                    vote_average: item.vote_average,
                    overview: item.overview,
                    status: status,
                    genre_ids: item.genre_ids,
                    original_language: item.original_language,
                    user_rating: rating
                });
                setExistingMap(prev => new Map(prev).set(item.id, {
                    id: res.data.id,
                    status: status,
                    user_rating: rating
                }));
            }
            if (shouldClose) {
                closeDropdown();
            }
            saveRecentSearch(item.title || item.name || query);
            onAddSuccess();
        } catch (error) {
            console.error('Failed to save', error);
        }
    };

    const triggerDelete = (item: SearchResult) => {
        const existing = existingMap.get(item.id);
        if (!existing) return;
        setItemToDelete({
            id: existing.id,
            title: item.title || item.name || 'this title'
        });
        closeDropdown();
    };

    const executeDelete = async () => {
        if (!itemToDelete) return;
        try {
            await api.delete(`/watchlist/${itemToDelete.id}`);
            await fetchExistingContext();
            setItemToDelete(null);
            onAddSuccess();
        } catch (error) {
            console.error('Failed to delete', error);
        }
    };

    if (!isOpen) return null;

    return (
        <>
            <div className={styles.overlay} onClick={onClose}>
                <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.header}>
                        <h2 className={styles.title}>Add to Watchlist</h2>
                        <button className={styles.closeButton} onClick={onClose} aria-label="Close modal">
                            <X size={18} />
                        </button>
                    </div>

                    <div className={styles.searchSection}>
                        <div className={styles.inputWrapper}>
                            <Search className={styles.searchIcon} />
                            <input
                                ref={inputRef}
                                type="text"
                                className={styles.searchInput}
                                placeholder="Search movies, shows, and anime..."
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                            />
                            {query && (
                                <button
                                    type="button"
                                    className={styles.clearButton}
                                    onClick={() => {
                                        setQuery('');
                                        inputRef.current?.focus();
                                    }}
                                    title="Clear text"
                                >
                                    <X size={15} />
                                </button>
                            )}
                        </div>

                        {/* Category filter tabs with live counts */}
                        <div className={styles.searchCategoryTabs}>
                            <button
                                type="button"
                                className={`${styles.searchCategoryTab} ${searchFilter === 'all' ? styles.searchCategoryTabActive : ''}`}
                                onClick={() => setSearchFilter('all')}
                            >
                                <span>All</span>
                                {results.length > 0 && <span className={styles.searchCategoryCount}>{results.length}</span>}
                            </button>
                            <button
                                type="button"
                                className={`${styles.searchCategoryTab} ${searchFilter === 'movie' ? styles.searchCategoryTabActive : ''}`}
                                onClick={() => setSearchFilter('movie')}
                            >
                                <span>Movies</span>
                                {results.length > 0 && (
                                    <span className={styles.searchCategoryCount}>
                                        {results.filter(r => r.media_type === 'movie' && !isAnimeItem(r)).length}
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                className={`${styles.searchCategoryTab} ${searchFilter === 'tv' ? styles.searchCategoryTabActive : ''}`}
                                onClick={() => setSearchFilter('tv')}
                            >
                                <span>TV Shows</span>
                                {results.length > 0 && (
                                    <span className={styles.searchCategoryCount}>
                                        {results.filter(r => r.media_type === 'tv' && !isAnimeItem(r)).length}
                                    </span>
                                )}
                            </button>
                            <button
                                type="button"
                                className={`${styles.searchCategoryTab} ${searchFilter === 'anime' ? styles.searchCategoryTabActive : ''}`}
                                onClick={() => setSearchFilter('anime')}
                            >
                                <span>Anime</span>
                                {results.length > 0 && (
                                    <span className={styles.searchCategoryCount}>
                                        {results.filter(r => isAnimeItem(r)).length}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className={styles.resultsList} onScroll={closeDropdown}>
                        {/* Dropdown content: Recent Searches vs Results */}
                        {query.trim().length < 2 ? (
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
                                                    setQuery(term);
                                                    inputRef.current?.focus();
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
                        ) : loading ? (
                            <div className={styles.noResults}>Searching...</div>
                        ) : displayedResults.length > 0 ? (
                            displayedResults.map((item, idx) => {
                                const title = item.title || item.name || '';
                                const releaseYear = (item.release_date || item.first_air_date || '').split('-')[0];
                                const isAnim = isAnimeItem(item);
                                const mediaLabel = isAnim ? 'Anime' : (item.media_type === 'movie' ? 'Movie' : 'TV Series');
                                const posterUrl = item.poster_path ? `https://image.tmdb.org/t/p/w92${item.poster_path}` : '';
                                const existing = existingMap.get(item.id);
                                const statusConfig = existing ? STATUS_COLORS[existing.status] : null;
                                const isExpanded = expandedId === item.id;
                                const isStatusOpen = openDropdownId === item.id;
                                const isRatingMode = ratingModeId === item.id;
                                const totalItems = displayedResults.length;
                                const isDropup = totalItems >= 3 && idx >= totalItems - 2;

                                return (
                                    <div
                                        key={`${item.media_type}-${item.id}`}
                                        className={`${styles.searchResultCard} ${isStatusOpen ? styles.searchResultCardActive : ''}`}
                                    >
                                        <div
                                            className={styles.searchResultCardHeader}
                                            onClick={() => setExpandedId(isExpanded ? null : item.id)}
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
                                                        data-status-btn="true"
                                                        className={existing ? styles.searchItemStatusBtnActive : styles.searchItemAddBtn}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (openDropdownId === item.id) {
                                                                closeDropdown();
                                                            } else {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                const spaceBelow = window.innerHeight - rect.bottom;
                                                                const isDropup = spaceBelow < 250 && rect.top > 250;
                                                                if (isDropup) {
                                                                    setDropdownCoords({
                                                                        bottom: window.innerHeight - rect.top + 4,
                                                                        right: window.innerWidth - rect.right,
                                                                    });
                                                                } else {
                                                                    setDropdownCoords({
                                                                        top: rect.bottom + 4,
                                                                        right: window.innerWidth - rect.right,
                                                                    });
                                                                }
                                                                setOpenDropdownId(item.id);
                                                                setActiveDropdownItem(item);
                                                                setRatingModeId(null);
                                                                setPendingStatus(null);
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
                            })
                        ) : (
                            <div className={styles.noResults}>
                                No {searchFilter !== 'all' ? searchFilter : ''} titles found matching &ldquo;{query}&rdquo;
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {selectedDetailItem && (
                <MediaDetailsModal
                    visible={!!selectedDetailItem}
                    onClose={() => setSelectedDetailItem(null)}
                    mediaType={selectedDetailItem.media_type}
                    tmdbId={selectedDetailItem.id}
                    initialData={{
                        title: selectedDetailItem.title || selectedDetailItem.name || '',
                        poster_path: selectedDetailItem.poster_path,
                        overview: selectedDetailItem.overview || '',
                        vote_average: selectedDetailItem.vote_average
                    }}
                    dbId={selectedDetailItem.dbId}
                    userRating={selectedDetailItem.user_rating}
                    onRate={async (rating) => {
                        if (selectedDetailItem.dbId) {
                            try {
                                await api.put(`/watchlist/${selectedDetailItem.dbId}/rating`, { rating });
                                setExistingMap(prev => {
                                    const next = new Map(prev);
                                    const ex = next.get(selectedDetailItem.id);
                                    if (ex) next.set(selectedDetailItem.id, { ...ex, user_rating: rating });
                                    return next;
                                });
                                setSelectedDetailItem((prev: DetailMediaItem | null) => prev ? { ...prev, user_rating: rating } : null);
                                onAddSuccess();
                            } catch (e) {
                                console.error('Failed to rate item', e);
                            }
                        }
                    }}
                />
            )}

            {itemToDelete && (
                <ConfirmationModal
                    isOpen={!!itemToDelete}
                    onClose={() => setItemToDelete(null)}
                    title="Remove from Watchlist"
                    message={`Are you sure you want to remove "${itemToDelete.title}" from your watchlist?`}
                    confirmLabel="Remove"
                    isDangerous={true}
                    onConfirm={executeDelete}
                />
            )}

            {typeof document !== 'undefined' && openDropdownId !== null && dropdownCoords && activeDropdownItem && createPortal(
                <div
                    className={`${styles.searchItemStatusMenu} ${dropdownCoords.bottom !== undefined ? styles.searchItemStatusMenuDropup : ''}`}
                    ref={dropdownRef}
                    style={{
                        position: 'fixed',
                        top: dropdownCoords.top !== undefined ? `${dropdownCoords.top}px` : undefined,
                        bottom: dropdownCoords.bottom !== undefined ? `${dropdownCoords.bottom}px` : undefined,
                        right: `${dropdownCoords.right}px`,
                        zIndex: 99999,
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    {ratingModeId === activeDropdownItem.id ? (
                        <div className={styles.searchRatingContainer}>
                            <span className={styles.searchRatingLabel}>Rate this title</span>
                            <StarRating
                                rating={existingMap.get(activeDropdownItem.id)?.user_rating || 0}
                                onRatingChange={(r) => handleRatingSelect(activeDropdownItem, r)}
                                size={22}
                                maxStars={10}
                            />
                            <button
                                type="button"
                                className={styles.searchSkipRatingBtn}
                                onClick={handleSkipRating}
                            >
                                Skip Rating
                            </button>
                        </div>
                    ) : (
                        <>
                            {Object.entries(STATUS_COLORS).map(([statusKey, config]) => {
                                const IconComponent = config.icon;
                                const existing = existingMap.get(activeDropdownItem.id);
                                const isCurrent = existing?.status === statusKey;
                                return (
                                    <button
                                        key={statusKey}
                                        type="button"
                                        className={`${styles.searchStatusMenuItem} ${isCurrent ? styles.searchStatusMenuItemActive : ''}`}
                                        onClick={() => handleStatusSelect(activeDropdownItem, statusKey)}
                                    >
                                        <IconComponent size={14} style={{ color: config.color, flexShrink: 0 }} />
                                        <span>{config.label}</span>
                                        {isCurrent && <Check size={13} style={{ marginLeft: 'auto', color: '#10b981' }} />}
                                    </button>
                                );
                            })}
                            {existingMap.has(activeDropdownItem.id) && (
                                <>
                                    <div className={styles.searchStatusMenuDivider} />
                                    <button
                                        type="button"
                                        className={`${styles.searchStatusMenuItem} ${styles.searchStatusMenuItemDelete}`}
                                        onClick={() => triggerDelete(activeDropdownItem)}
                                    >
                                        <Trash2 size={14} />
                                        <span>Remove</span>
                                    </button>
                                </>
                            )}
                        </>
                    )}
                </div>,
                document.body
            )}
        </>
    );
}
