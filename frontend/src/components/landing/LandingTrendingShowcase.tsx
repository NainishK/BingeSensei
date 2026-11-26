'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
    Flame,
    Star,
    Plus,
    Info,
    ChevronLeft,
    ChevronRight,
    Search,
    X,
    Loader2,
    Film,
    Tv,
} from 'lucide-react';
import { PublicMediaItem } from '@/lib/publicTypes';
import PublicMediaModal from './PublicMediaModal';
import styles from './LandingTrendingShowcase.module.css';

interface GenreOption {
    label: string;
    value: string;
}

interface Props {
    items: PublicMediaItem[];
    loading: boolean;
    region: string;
    genre: string;
    genres: GenreOption[];
    onGenreChange: (val: string) => void;
}

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';
const TMDB_POSTER_SMALL = 'https://image.tmdb.org/t/p/w92';
const TMDB_LOGO_BASE = 'https://image.tmdb.org/t/p/w45';

export default function LandingTrendingShowcase({
    items,
    loading,
    region,
    genre,
    genres,
    onGenreChange,
}: Props) {
    const [heroIndex, setHeroIndex] = useState(0);
    const [isHeroHovered, setIsHeroHovered] = useState(false);
    const [selectedModalItem, setSelectedModalItem] = useState<PublicMediaItem | null>(null);

    // Animated Search State inside Hero Top Bar
    const [isSearchOpen, setIsSearchOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PublicMediaItem[]>([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const searchBoxRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    // Drag/swipe state for continuous 3-slide track
    const [dragStartX, setDragStartX] = useState<number | null>(null);
    const [dragCurrentX, setDragCurrentX] = useState<number | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isAnimating, setIsAnimating] = useState(false);
    const [animatingTarget, setAnimatingTarget] = useState<'next' | 'prev' | 'reset' | null>(null);

    // Sliding pill refs for genre tabs
    const genreBarRef = useRef<HTMLDivElement | null>(null);
    const pillRefs = useRef<Record<string, HTMLButtonElement | null>>({});
    const [indicatorStyle, setIndicatorStyle] = useState({
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        opacity: 0,
    });

    // Reset slide index when the loaded items list updates
    useEffect(() => {
        setHeroIndex(0);
        setIsAnimating(false);
        setAnimatingTarget(null);
    }, [items]);

    // Keep sliding genre pill indicator synced cleanly inside persistent topBar
    useEffect(() => {
        const updateIndicator = () => {
            const el = pillRefs.current[genre];
            if (el && el.offsetWidth > 0) {
                setIndicatorStyle({
                    left: el.offsetLeft,
                    top: el.offsetTop,
                    width: el.offsetWidth,
                    height: el.offsetHeight,
                    opacity: 1,
                });

                const container = genreBarRef.current;
                if (container && container.scrollWidth > container.clientWidth) {
                    const elLeft = el.offsetLeft;
                    const elRight = elLeft + el.offsetWidth;
                    const viewLeft = container.scrollLeft;
                    const viewRight = viewLeft + container.clientWidth;
                    if (elLeft < viewLeft + 12 || elRight > viewRight - 12) {
                        const targetLeft = Math.max(0, elLeft - (container.clientWidth - el.offsetWidth) / 2);
                        container.scrollTo({ left: targetLeft, behavior: 'smooth' });
                    }
                }
            }
        };
        const rafId = requestAnimationFrame(updateIndicator);
        window.addEventListener('resize', updateIndicator);
        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener('resize', updateIndicator);
        };
    }, [genre, genres.length]);

    // Close hero search on outside click or Escape
    useEffect(() => {
        if (!isSearchOpen) return;
        const onDocDown = (e: MouseEvent) => {
            if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
                setIsSearchOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsSearchOpen(false);
        };
        document.addEventListener('mousedown', onDocDown);
        window.addEventListener('keydown', onKeyDown);
        const focusTimer = setTimeout(() => searchInputRef.current?.focus(), 60);
        return () => {
            document.removeEventListener('mousedown', onDocDown);
            window.removeEventListener('keydown', onKeyDown);
            clearTimeout(focusTimer);
        };
    }, [isSearchOpen]);

    // Live public search debounced
    useEffect(() => {
        const trimmed = searchQuery.trim();
        if (trimmed.length < 2) {
            setSearchResults([]);
            setSearchLoading(false);
            return;
        }
        const timer = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const res = await fetch(`${API_BASE}/public/search?q=${encodeURIComponent(trimmed)}&region=${region}`);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                setSearchResults(Array.isArray(data) ? data : []);
            } catch {
                setSearchResults([]);
            } finally {
                setSearchLoading(false);
            }
        }, 350);
        return () => clearTimeout(timer);
    }, [searchQuery, region]);

    const featuredItems = items.slice(0, 12);
    const hasMultiple = featuredItems.length > 1;
    const safeHeroIndex = featuredItems.length > 0 ? heroIndex % featuredItems.length : 0;

    const handleNextSlide = () => {
        if (isAnimating || !hasMultiple) return;
        setIsAnimating(true);
        setAnimatingTarget('next');
        setTimeout(() => {
            setHeroIndex((prev) => (prev + 1) % featuredItems.length);
            setIsAnimating(false);
            setAnimatingTarget(null);
            setIsDragging(false);
            setDragStartX(null);
            setDragCurrentX(null);
        }, 320);
    };

    const handlePrevSlide = () => {
        if (isAnimating || !hasMultiple) return;
        setIsAnimating(true);
        setAnimatingTarget('prev');
        setTimeout(() => {
            setHeroIndex((prev) => (prev - 1 + featuredItems.length) % featuredItems.length);
            setIsAnimating(false);
            setAnimatingTarget(null);
            setIsDragging(false);
            setDragStartX(null);
            setDragCurrentX(null);
        }, 320);
    };

    useEffect(() => {
        if (isHeroHovered || isDragging || isAnimating || !hasMultiple || selectedModalItem || isSearchOpen) return;
        const interval = setInterval(() => {
            handleNextSlide();
        }, 6000);
        return () => clearInterval(interval);
    });

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (isAnimating || !hasMultiple) return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        const target = e.target as HTMLElement;
        if (target && target.closest('button, input, a, select, [role="button"], [data-interactive="true"]')) {
            return;
        }
        if (e.pointerType === 'mouse') e.preventDefault();
        try {
            e.currentTarget.setPointerCapture(e.pointerId);
        } catch { /* ignore */ }
        setDragStartX(e.clientX);
        setDragCurrentX(e.clientX);
        setIsDragging(true);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDragging || dragStartX === null || isAnimating) return;
        setDragCurrentX(e.clientX);
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        try {
            e.currentTarget.releasePointerCapture(e.pointerId);
        } catch { /* ignore */ }

        if (!isDragging || dragStartX === null || dragCurrentX === null || isAnimating) {
            setIsDragging(false);
            setDragStartX(null);
            setDragCurrentX(null);
            return;
        }

        const diff = dragCurrentX - dragStartX;
        const threshold = 70;
        setIsDragging(false);
        if (diff < -threshold) {
            handleNextSlide();
        } else if (diff > threshold) {
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

    const currentHero = featuredItems[safeHeroIndex] || null;
    const prevIndex = hasMultiple ? (safeHeroIndex - 1 + featuredItems.length) % featuredItems.length : safeHeroIndex;
    const nextIndex = hasMultiple ? (safeHeroIndex + 1) % featuredItems.length : safeHeroIndex;
    const prevHero = hasMultiple ? featuredItems[prevIndex] : null;
    const nextHero = hasMultiple ? featuredItems[nextIndex] : null;

    const dragOffset = isDragging && dragStartX !== null && dragCurrentX !== null ? dragCurrentX - dragStartX : 0;

    let trackTransform = 'translateX(0px)';
    let trackTransition = 'none';
    if (isDragging && !isAnimating) {
        trackTransform = `translateX(${dragOffset}px)`;
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

    const renderSlide = (
        item: PublicMediaItem | null,
        slideIdx: number,
        isCurrent: boolean,
        posClass: string
    ) => {
        if (!item) return null;
        const backdrop = item.backdrop_path
            ? `${TMDB_BACKDROP_BASE}${item.backdrop_path}`
            : item.poster_path
            ? `${TMDB_BACKDROP_BASE}${item.poster_path}`
            : '';
        const year = item.release_date ? item.release_date.slice(0, 4) : '';
        const primaryProv = item.providers?.[0];
        const extraProvCount = item.providers && item.providers.length > 1 ? item.providers.length - 1 : 0;

        return (
            <div key={`${item.media_type}-${item.id}-${posClass}`} className={`${styles.heroSlide} ${posClass}`}>
                <div className={styles.heroBackdropWrapper}>
                    {backdrop ? (
                        <img
                            src={backdrop}
                            alt={item.title}
                            className={styles.heroBackdropImg}
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                        />
                    ) : (
                        <div className={styles.heroBackdropFallback} />
                    )}
                    <div className={styles.heroBackdropScrimTop} />
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
                        {item.vote_average ? (
                            <span className={styles.heroRatingBadge}>
                                <Star size={13} fill="#fbbf24" stroke="none" />
                                {Number(item.vote_average).toFixed(1)}
                            </span>
                        ) : null}
                        <span className={styles.heroMetaBadge}>
                            {item.media_type === 'tv' ? 'TV Series' : 'Movie'}
                            {year ? ` · ${year}` : ''}
                        </span>
                        <span className={styles.heroServiceBadge}>
                            {primaryProv ? (
                                <>
                                    {primaryProv.logo && (
                                        <img
                                            src={`${TMDB_LOGO_BASE}${primaryProv.logo}`}
                                            alt={primaryProv.name}
                                            className={styles.heroProviderLogo}
                                        />
                                    )}
                                    <span>Available on {primaryProv.name}</span>
                                    {extraProvCount > 0 && (
                                        <span className={styles.heroExtraProviders}>+{extraProvCount}</span>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Tv size={13} style={{ color: '#94a3b8', flexShrink: 0 }} />
                                    <span>Not streaming in {region}</span>
                                </>
                            )}
                        </span>
                    </div>

                    <h2 className={styles.heroTitle}>{item.title}</h2>

                    <p className={styles.heroOverview}>
                        {item.overview || 'Trending this week across top streaming platforms.'}
                    </p>

                    <div className={styles.heroActionsRow}>
                        <Link href="/login" className={styles.heroBtnPrimary}>
                            <Plus size={16} />
                            <span>Sign in to Track</span>
                            <ChevronRight size={15} className={styles.heroBtnArrow} />
                        </Link>
                        <button
                            type="button"
                            className={styles.heroBtnSecondary}
                            onClick={() => isCurrent && setSelectedModalItem(item)}
                        >
                            <Info size={16} />
                            <span>More Info</span>
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const genreBar = (
        <div ref={genreBarRef} className={styles.genreBar} data-interactive="true">
            <span
                aria-hidden="true"
                className={styles.genreIndicator}
                style={{
                    transform: `translate3d(${indicatorStyle.left}px, ${indicatorStyle.top}px, 0)`,
                    width: indicatorStyle.width ? `${indicatorStyle.width}px` : undefined,
                    height: indicatorStyle.height ? `${indicatorStyle.height}px` : undefined,
                    opacity: indicatorStyle.opacity,
                }}
            />
            {genres.map((g) => {
                const isActive = genre === g.value;
                return (
                    <button
                        key={g.value}
                        ref={(el) => { pillRefs.current[g.value] = el; }}
                        type="button"
                        className={`${styles.genrePill} ${isActive ? styles.genrePillActive : ''}`}
                        onClick={() => onGenreChange(g.value)}
                    >
                        {g.label}
                    </button>
                );
            })}
        </div>
    );

    const searchControl = (
        <div className={styles.heroSearchWrapper} ref={searchBoxRef} data-interactive="true">
            {!isSearchOpen ? (
                <button
                    type="button"
                    className={styles.heroSearchTriggerBtn}
                    onClick={() => setIsSearchOpen(true)}
                    aria-label="Search movies or TV shows"
                >
                    <Search size={16} />
                    <span className={styles.heroSearchLabel}>Search</span>
                </button>
            ) : (
                <div className={styles.heroSearchActiveBox}>
                    <div className={styles.heroSearchInputContainer}>
                        <Search size={16} className={styles.heroSearchInputIcon} />
                        <input
                            ref={searchInputRef}
                            type="text"
                            className={styles.heroSearchInput}
                            placeholder={`Search shows or movies in ${region}...`}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoComplete="off"
                        />
                        {searchLoading && <Loader2 size={15} className={styles.spin} style={{ color: '#94a3b8' }} />}
                        {searchQuery && (
                            <button
                                type="button"
                                className={styles.heroSearchIconBtn}
                                onClick={() => setSearchQuery('')}
                                aria-label="Clear search"
                            >
                                <X size={14} />
                            </button>
                        )}
                        <button
                            type="button"
                            className={styles.heroSearchIconBtn}
                            onClick={() => setIsSearchOpen(false)}
                            aria-label="Close search"
                        >
                            <ChevronLeft size={16} />
                        </button>
                    </div>

                    {searchQuery.trim().length >= 2 && (
                        <div className={styles.heroSearchDropdownPanel}>
                            {searchLoading && searchResults.length === 0 ? (
                                <div className={styles.searchStateRow}>Searching {region} catalog...</div>
                            ) : searchResults.length === 0 ? (
                                <div className={styles.searchStateRow}>No results found for "{searchQuery}".</div>
                            ) : (
                                searchResults.map((resItem) => (
                                    <button
                                        key={`${resItem.media_type}-${resItem.id}`}
                                        type="button"
                                        className={styles.searchResultRow}
                                        onClick={() => {
                                            setSelectedModalItem(resItem);
                                            setIsSearchOpen(false);
                                        }}
                                    >
                                        {resItem.poster_path ? (
                                            <img
                                                src={`${TMDB_POSTER_SMALL}${resItem.poster_path}`}
                                                alt={resItem.title}
                                                className={styles.searchThumb}
                                            />
                                        ) : (
                                            <div className={styles.searchThumbFallback}>
                                                {resItem.media_type === 'tv' ? <Tv size={16} /> : <Film size={16} />}
                                            </div>
                                        )}
                                        <div className={styles.searchResultInfo}>
                                            <span className={styles.searchResultTitle}>{resItem.title}</span>
                                            <div className={styles.searchResultMeta}>
                                                <span>{resItem.media_type === 'tv' ? 'TV Series' : 'Movie'}</span>
                                                {resItem.release_date && <span>{resItem.release_date.slice(0, 4)}</span>}
                                                {resItem.vote_average ? (
                                                    <span className={styles.searchResultRating}>
                                                        <Star size={10} fill="currentColor" />
                                                        {Number(resItem.vote_average).toFixed(1)}
                                                    </span>
                                                ) : null}
                                            </div>
                                        </div>
                                        {resItem.providers && resItem.providers.length > 0 && (
                                            <div className={styles.searchResultProviders}>
                                                {resItem.providers.slice(0, 3).map((p, idx) =>
                                                    p.logo ? (
                                                        <img
                                                            key={idx}
                                                            src={`${TMDB_LOGO_BASE}${p.logo}`}
                                                            alt={p.name}
                                                            title={p.name}
                                                            className={styles.searchResultProvLogo}
                                                        />
                                                    ) : null
                                                )}
                                            </div>
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    const topBar = (
        <div className={styles.heroTopBar} data-interactive="true">
            <div className={styles.heroTopBarLeft}>
                {genreBar}
                {loading && featuredItems.length > 0 && (
                    <span className={styles.genreLoadingBadge} aria-label="Loading genre">
                        <Loader2 size={14} className={styles.spin} />
                    </span>
                )}
            </div>
            <div className={styles.heroTopBarRight}>{searchControl}</div>
        </div>
    );

    return (
        <section className={styles.showcaseWrapper} aria-label="Trending Showcase">
            <div
                className={`${styles.heroShowcase} ${isDragging ? styles.heroShowcaseDragging : ''}`}
                onMouseEnter={() => setIsHeroHovered(true)}
                onMouseLeave={() => setIsHeroHovered(false)}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDragStart={(e) => e.preventDefault()}
            >
                {topBar}

                {featuredItems.length === 0 ? (
                    loading ? (
                        <div className={styles.heroInitialLoading}>
                            <div className={styles.skeletonLines}>
                                <div className={styles.skeletonBarLg} />
                                <div className={styles.skeletonBarSm} />
                                <div className={styles.skeletonBarSm} style={{ width: '70%' }} />
                            </div>
                        </div>
                    ) : (
                        <div className={styles.emptyHero}>
                            <p>No trending titles found for this category right now. Try switching genre or region.</p>
                        </div>
                    )
                ) : (
                    <>
                        <div
                            className={`${styles.heroSliderTrack} ${loading ? styles.heroSliderTrackLoading : ''}`}
                            style={{
                                transform: trackTransform,
                                transition: trackTransition,
                            }}
                        >
                            {hasMultiple && renderSlide(prevHero, prevIndex, false, styles.heroSlidePrev)}
                            {renderSlide(currentHero, safeHeroIndex, true, styles.heroSlideCurr)}
                            {hasMultiple && renderSlide(nextHero, nextIndex, false, styles.heroSlideNext)}
                        </div>

                        <div className={styles.heroControlsRow} data-interactive="true">
                            <div className={styles.heroIndicators}>
                                {featuredItems.map((_, idx) => {
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
                                                    key={`progress-${safeHeroIndex}-${genre}-${region}`}
                                                    className={`${styles.heroDashProgressBar} ${isHeroHovered ? styles.heroDashPaused : ''}`}
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>

                            {hasMultiple && (
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
                            )}
                        </div>
                    </>
                )}
            </div>

            {selectedModalItem && (
                <PublicMediaModal item={selectedModalItem} onClose={() => setSelectedModalItem(null)} />
            )}
        </section>
    );
}
