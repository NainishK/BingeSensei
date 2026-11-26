'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import MediaCard, { MediaItem } from '@/components/MediaCard';
import ConfirmationModal from '@/components/ConfirmationModal';
import InlineMediaSearch from '@/components/InlineMediaSearch';
import ImportExportModal from '@/components/ImportExportModal';
import { Plus, Search, Clapperboard, CalendarClock, CheckCircle, LayoutGrid, List, Layers, ArrowUp, ArrowDown, PauseCircle, XCircle, SlidersHorizontal, ChevronDown, ChevronUp, Download, Loader2 } from 'lucide-react';
import styles from './watchlist.module.css';
import { STATUS_COLORS, ALL_TAB_CONFIG } from '@/lib/statusColors';
import GenreFilter from './GenreFilter';
import CustomSelect from '@/components/CustomSelect';
import { WatchlistSkeleton } from '@/components/SkeletonLoader';
import ReleaseReel from '@/components/ReleaseReel';

export default function WatchlistPage() {
    const router = useRouter();
    const [items, setItems] = useState<MediaItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('all'); // Default to 'all'
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [isMobile, setIsMobile] = useState(false);

    // New Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'tv' | 'anime'>('all');
    const [providerFilter, setProviderFilter] = useState<string>('all'); // New Provider Filter
    const [selectedGenres, setSelectedGenres] = useState<number[]>([]); // New Genre State
    const [sortField, setSortField] = useState<'date_added' | 'rating' | 'title'>('date_added');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [showMobileFilters, setShowMobileFilters] = useState(false); // Mobile Filter Toggle
    const [showBackToTop, setShowBackToTop] = useState(false); // Scroll to top visibility
    const [isDropdownOpen, setIsDropdownOpen] = useState(false); // Mobile Custom Dropdown Toggle

    // Dynamic Island Sticky Status Bar State
    const [isIslandVisible, setIsIslandVisible] = useState(false);
    const [isIslandMinimized, setIsIslandMinimized] = useState(false);
    const [isIslandDropdownOpen, setIsIslandDropdownOpen] = useState(false);
    const [isIslandPulsing, setIsIslandPulsing] = useState(false);
    const [indicatorStyle, setIndicatorStyle] = useState<{ left: number; width: number; opacity: number }>({ left: 0, width: 0, opacity: 0 });
    const navBarRef = useRef<HTMLDivElement | null>(null);
    const islandRef = useRef<HTMLDivElement | null>(null);
    const tabButtonRefs = useRef<(HTMLButtonElement | null)[]>([]);

    // Infinite Scroll / Batch Rendering State (25 items = 5 full rows of 5 cards)
    const [visibleCount, setVisibleCount] = useState(25);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);

    // Reset visible count whenever active filters or search changes
    useEffect(() => {
        setVisibleCount(25);
    }, [activeTab, searchQuery, typeFilter, providerFilter, selectedGenres, sortField, sortOrder]);

    // Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    const [itemToRemove, setItemToRemove] = useState<MediaItem | null>(null);
    const [userServices, setUserServices] = useState<Set<string>>(new Set()); // Store active subscription names

    useEffect(() => {
        // 1. Instantly load cached watchlist if available (<50ms)
        try {
            const cached = localStorage.getItem('binge_watchlist_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.items) setItems(parsed.items);
                setLoading(false);
            }
        } catch (e) { /* ignore */ }

        fetchWatchlist();
        fetchSubscriptions();
    }, []);

    const [userCountry, setUserCountry] = useState<string>('US');
    const [regionalServices, setRegionalServices] = useState<string[]>([]);

    const fetchSubscriptions = async () => {
        try {
            const profileRes = await api.get('/users/me/');
            const country = profileRes.data.country || 'US';
            setUserCountry(country);

            const [subsRes, servicesRes] = await Promise.all([
                api.get('/subscriptions/', { params: { country } }),
                api.get(`/services/?country=${country}`)
            ]);

            const ottSubs = (subsRes.data || []).filter((sub: any) => !sub.category || sub.category === 'OTT');
            const serviceNames = new Set<string>(ottSubs.map((sub: any) => sub.service_name));
            setUserServices(serviceNames);

            const countryServices = (servicesRes.data || [])
                .filter((s: any) => !s.category || s.category === 'OTT')
                .map((s: any) => s.name);

            const allAvailableServices = Array.from(new Set([
                ...countryServices,
                ...ottSubs.map((sub: any) => sub.service_name)
            ])).sort();

            setRegionalServices(allAvailableServices as string[]);
        } catch (error) {
            console.error('Failed to fetch regional services', error);
        }
    };

    useEffect(() => {
        const checkMobile = () => {
            const mobile = window.innerWidth < 768;
            setIsMobile(mobile);

            // Only auto-switch if no user preference is saved
            const savedMode = localStorage.getItem('watchlist_view_mode');
            if (savedMode) {
                setViewMode(savedMode as 'grid' | 'list');
            } else {
                setViewMode(mobile ? 'list' : 'grid');
            }
        };

        checkMobile();
        checkMobile();
        window.addEventListener('resize', checkMobile);

        // Scroll Listener
        const handleScroll = () => {
            if (navBarRef.current) {
                const rect = navBarRef.current.getBoundingClientRect();
                setIsIslandVisible(rect.bottom < 15);
            } else {
                setIsIslandVisible(window.scrollY > 280);
            }

            if (window.scrollY > 300) {
                setShowBackToTop(true);
            } else {
                setShowBackToTop(false);
            }

            // Scroll trigger to load more items when within 600px of bottom
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 600) {
                setVisibleCount((prev) => prev + 25);
            }
        };
        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });

        return () => {
            window.removeEventListener('resize', checkMobile);
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    // Close dynamic island dropdown if island is hidden
    useEffect(() => {
        if (!isIslandVisible) {
            setIsIslandDropdownOpen(false);
        }
    }, [isIslandVisible]);

    // Close dynamic island dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (islandRef.current && !islandRef.current.contains(e.target as Node)) {
                setIsIslandDropdownOpen(false);
            }
        };
        if (isIslandDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isIslandDropdownOpen]);

    const handleViewChange = (mode: 'grid' | 'list') => {
        setViewMode(mode);
        localStorage.setItem('watchlist_view_mode', mode);
    };

    const fetchWatchlist = async (isBackground = false) => {
        try {
            if (!isBackground) setLoading(true);
            const response = await api.get('/watchlist/');
            // Transform DB items
            const transformed = response.data.map((item: any) => ({
                id: item.tmdb_id,
                dbId: item.id,
                title: item.title,
                name: item.title,
                media_type: item.media_type,
                poster_path: item.poster_path,
                vote_average: item.vote_average,
                overview: item.overview,
                user_rating: item.user_rating,
                status: item.status,
                // Parse Genre IDs (handles JSON string like "[16,35,18]" or comma-separated)
                genre_ids: (() => {
                    if (!item.genre_ids) return [];
                    if (Array.isArray(item.genre_ids)) return item.genre_ids;
                    if (typeof item.genre_ids === 'string') {
                        try {
                            const parsed = JSON.parse(item.genre_ids);
                            if (Array.isArray(parsed)) return parsed.map(Number);
                        } catch {
                            // fallback: remove brackets and split
                        }
                        return item.genre_ids
                            .replace(/[\[\]]/g, '')
                            .split(',')
                            .map((s: string) => Number(s.trim()))
                            .filter((n: number) => !isNaN(n));
                    }
                    return [];
                })(),
                added_at: item.added_at, // Pass creation date
                available_on: item.available_on, // Use DB value if present
                current_season: item.current_season,
                current_episode: item.current_episode,
                original_language: item.original_language,
                notes: item.notes,
                is_followed: Boolean(item.is_followed)
            }));

            setItems(transformed);
            if (!isBackground) setLoading(false); // Only toggle if we touched it

            // Save fresh snapshot to cache
            localStorage.setItem('binge_watchlist_cache', JSON.stringify({
                items: transformed,
                timestamp: Date.now()
            }));

            // Secondary fetch removed: relying on robust DB data from backfill
            // to avoid overwriting valid badges with incomplete availability checks.

        } catch (error) {
            console.error('Failed to fetch watchlist', error);
            setLoading(false);
        }
    };

    const confirmRemove = (item: MediaItem) => {
        setItemToRemove(item);
    };

    const handleRemove = async () => {
        if (!itemToRemove?.dbId) return;

        try {
            await api.delete(`/watchlist/${itemToRemove.dbId}`);
            setItems(prev => prev.filter(i => i.dbId !== itemToRemove.dbId));
            setItemToRemove(null);
        } catch (error) {
            console.error('Failed to delete item', error);
            alert("Failed to remove item");
        }
    };

    const handleStatusUpdate = (dbId: number, newStatus: string, newRating?: number) => {
        setItems(prev => prev.map(item => {
            if (item.dbId === dbId) {
                // If we are in a specific tab and move item out, it should disappear from view
                // filteredItems will handle this automatically
                return { ...item, status: newStatus, user_rating: newRating ?? item.user_rating };
            }
            return item;
        }));
    };

    const handleFollowUpdate = (dbId: number, isFollowed: boolean) => {
        setItems(prev => {
            const updated = prev.map(item =>
                item.dbId === dbId ? { ...item, is_followed: isFollowed } : item
            );
            try {
                localStorage.setItem('binge_watchlist_cache', JSON.stringify({
                    items: updated,
                    timestamp: Date.now()
                }));
            } catch (e) { /* ignore */ }
            return updated;
        });
    };

    const toggleSortOrder = () => {
        setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    };

    // Type Counts for Filter Dropdown (contextual to activeTab)
    const tabItems = activeTab === 'all' ? items : items.filter(i => i.status === activeTab);
    const typeCounts = {
        all: tabItems.length,
        movie: tabItems.filter(i => i.media_type === 'movie' && !(i.original_language === 'ja' && i.genre_ids?.includes(16))).length,
        tv: tabItems.filter(i => i.media_type === 'tv' && !(i.original_language === 'ja' && i.genre_ids?.includes(16))).length,
        anime: tabItems.filter(i => i.original_language === 'ja' && i.genre_ids?.includes(16)).length,
    };

    // Filter Logic
    const filteredItems = items.filter(item => {
        // 1. Status Tab (Always apply first)
        if (activeTab !== 'all' && item.status !== activeTab) return false;

        // 2. Type Filter (anime is mutually exclusive with movie/tv)
        const isAnime = item.original_language === 'ja' && item.genre_ids?.includes(16);
        if (typeFilter === 'anime') {
            if (!isAnime) return false;
        } else if (typeFilter === 'movie') {
            if (item.media_type !== 'movie' || isAnime) return false;
        } else if (typeFilter === 'tv') {
            if (item.media_type !== 'tv' || isAnime) return false;
        }

        // 3. Genre Filter (AND Logic)
        if (selectedGenres.length > 0) {
            if (!item.genre_ids || item.genre_ids.length === 0) return false; // No genres = exclude
            // Must have ALL selected genres
            const hasAll = selectedGenres.every(id => item.genre_ids!.includes(id));
            if (!hasAll) return false;
        }

        // 4. Provider Filter
        if (providerFilter !== 'all') {
            if (providerFilter === 'available') {
                if (!item.available_on) return false;
                if (userServices.size > 0) {
                    const cleanAvail = item.available_on.toLowerCase().replace(/\s*(plus|\+)\s*/g, '').trim();
                    const hasMatchingSub = Array.from(userServices).some(subName => {
                        const cleanSub = subName.toLowerCase().replace(/\s*(plus|\+)\s*/g, '').trim();
                        return cleanAvail.includes(cleanSub) || cleanSub.includes(cleanAvail);
                    });
                    if (!hasMatchingSub) return false;
                }
            } else if (providerFilter === 'unavailable') {
                if (item.available_on) {
                    if (userServices.size > 0) {
                        const cleanAvail = item.available_on.toLowerCase().replace(/\s*(plus|\+)\s*/g, '').trim();
                        const hasMatchingSub = Array.from(userServices).some(subName => {
                            const cleanSub = subName.toLowerCase().replace(/\s*(plus|\+)\s*/g, '').trim();
                            return cleanAvail.includes(cleanSub) || cleanSub.includes(cleanAvail);
                        });
                        if (hasMatchingSub) return false;
                    } else {
                        return false;
                    }
                }
            } else {
                if (!item.available_on) return false;
                const cleanItemProv = item.available_on.toLowerCase().replace(/\s*(plus|\+)\s*/g, '').trim();
                const cleanFilterProv = providerFilter.toLowerCase().replace(/\s*(plus|\+)\s*/g, '').trim();
                if (cleanItemProv !== cleanFilterProv && !cleanItemProv.includes(cleanFilterProv) && !cleanFilterProv.includes(cleanItemProv)) {
                    return false;
                }
            }
        }

        // 5. Search Query
        const trimmedQuery = searchQuery.trim().toLowerCase();
        if (trimmedQuery) {
            return (item.title || item.name || '').toLowerCase().includes(trimmedQuery);
        }

        return true;
    }).sort((a, b) => {
        let comparison = 0;

        switch (sortField) {
            case 'rating':
                comparison = (a.vote_average || 0) - (b.vote_average || 0);
                break;
            case 'title':
                comparison = (a.title || a.name || '').localeCompare(b.title || b.name || '');
                break;
            case 'date_added':
            default:
                // Assuming ID is proxy for date added (higher = newer)
                comparison = (a.dbId || 0) - (b.dbId || 0);
                break;
        }

        return sortOrder === 'asc' ? comparison : -comparison;
    });

    const displayedItems = filteredItems.slice(0, visibleCount);
    const hasMore = visibleCount < filteredItems.length;

    // IntersectionObserver to auto-load next batch when scrolling near bottom
    useEffect(() => {
        const target = loadMoreRef.current;
        if (!target || !hasMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount((prev) => Math.min(prev + 25, filteredItems.length));
                }
            },
            { rootMargin: '400px' }
        );

        observer.observe(target);
        return () => observer.disconnect();
    }, [hasMore, visibleCount, filteredItems.length]);

    const getTabCount = (status: string) => {
        // Basic counts (ignoring other filters for context)
        if (status === 'all') return items.length;
        return items.filter(i => i.status === status).length;
    };

    const tabs = [
        { id: 'all', label: 'All', icon: <Layers size={16} />, color: ALL_TAB_CONFIG.color },
        { id: 'watching', label: 'Watching', icon: <Clapperboard size={16} />, color: STATUS_COLORS.watching.color },
        { id: 'plan_to_watch', label: 'Plan to Watch', icon: <CalendarClock size={16} />, color: STATUS_COLORS.plan_to_watch.color },
        { id: 'watched', label: 'Watched', icon: <CheckCircle size={16} />, color: STATUS_COLORS.watched.color },
        { id: 'paused', label: 'Paused', icon: <PauseCircle size={16} />, color: STATUS_COLORS.paused.color },
        { id: 'dropped', label: 'Dropped', icon: <XCircle size={16} />, color: STATUS_COLORS.dropped.color }
    ];

    // Smooth status switch with Apple Dynamic Island squish and bloom
    const handleIslandTabSwitch = (newTabId: string) => {
        if (newTabId === activeTab) return;
        setIsIslandPulsing(true);
        setActiveTab(newTabId);
        setTimeout(() => {
            setIsIslandPulsing(false);
        }, 400);
    };

    // Track active tab button position to smoothly slide the liquid indicator pill
    useEffect(() => {
        const updateIndicator = () => {
            const activeIndex = tabs.findIndex(t => t.id === activeTab);
            const activeEl = tabButtonRefs.current[activeIndex];
            if (activeEl) {
                setIndicatorStyle({
                    left: activeEl.offsetLeft,
                    width: activeEl.offsetWidth,
                    opacity: 1
                });
            }
        };
        const id = requestAnimationFrame(updateIndicator);
        window.addEventListener('resize', updateIndicator);
        return () => {
            cancelAnimationFrame(id);
            window.removeEventListener('resize', updateIndicator);
        };
    }, [activeTab, isIslandVisible, isIslandMinimized]);

    if (loading) return <WatchlistSkeleton />;

    return (
        <div className={styles.container}>
            {/* Apple Dynamic Island Sticky Status Bar */}
            <div
                className={`${styles.dynamicIslandPortal} ${isIslandVisible ? styles.dynamicIslandPortalVisible : ''}`}
                ref={islandRef}
                aria-hidden={!isIslandVisible}
            >
                {(isMobile || isIslandMinimized) ? (
                    <div className={styles.dynamicIslandCompactWrapper}>
                        {(() => {
                            const activeTabConfig = tabs.find(t => t.id === activeTab);
                            const tabColor = activeTabConfig?.color || '#0070f3';
                            return (
                                <div
                                    className={`${styles.dynamicIslandCompact} ${isIslandPulsing ? styles.dynamicIslandPulsing : ''}`}
                                    style={isIslandPulsing ? {
                                        boxShadow: `0 18px 38px -8px rgba(0, 0, 0, 0.7), 0 0 24px 2px ${tabColor}45, inset 0 1px 0 rgba(255, 255, 255, 0.22)`
                                    } : undefined}
                                >
                                    <button
                                        type="button"
                                        className={styles.dynamicIslandCompactTrigger}
                                        onClick={() => setIsIslandDropdownOpen(!isIslandDropdownOpen)}
                                        aria-expanded={isIslandDropdownOpen}
                                        aria-label={`Current status filter: ${activeTabConfig?.label}. Click to switch.`}
                                    >
                                        <span
                                            className={styles.dynamicIslandStatusDot}
                                            style={{ backgroundColor: tabColor, boxShadow: `0 0 10px ${tabColor}` }}
                                        />
                                        <span className={styles.dynamicIslandTabIcon} style={{ color: tabColor }}>
                                            {activeTabConfig?.icon}
                                        </span>
                                        <span key={activeTab} className={styles.dynamicIslandCompactLabel}>
                                            {activeTabConfig?.label}
                                        </span>
                                        <span
                                            className={styles.dynamicIslandTabCount}
                                            style={{ backgroundColor: `${tabColor}20`, color: tabColor }}
                                        >
                                            {getTabCount(activeTab)}
                                        </span>
                                        <ChevronDown
                                            size={14}
                                            className={`${styles.dynamicIslandChevron} ${isIslandDropdownOpen ? styles.dynamicIslandChevronRotated : ''}`}
                                        />
                                    </button>

                                    <div className={styles.dynamicIslandDivider} />

                                    <button
                                        type="button"
                                        className={styles.dynamicIslandActionBtn}
                                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                                        title="Scroll to top"
                                        aria-label="Scroll to top"
                                    >
                                        <ArrowUp size={14} />
                                    </button>

                                    {!isMobile && (
                                        <button
                                            type="button"
                                            className={styles.dynamicIslandActionBtn}
                                            onClick={() => setIsIslandMinimized(false)}
                                            title="Expand status bar"
                                            aria-label="Expand status bar"
                                        >
                                            <ChevronDown size={14} />
                                        </button>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Dropdown Menu for Compact / Mobile Mode */}
                        {isIslandDropdownOpen && (
                            <div className={styles.dynamicIslandMenu}>
                                {tabs.map((tab) => {
                                    const isActive = activeTab === tab.id;
                                    const tabColor = tab.color || '#0070f3';
                                    return (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            className={`${styles.dynamicIslandMenuItem} ${isActive ? styles.dynamicIslandMenuItemActive : ''}`}
                                            onClick={() => {
                                                handleIslandTabSwitch(tab.id);
                                                setIsIslandDropdownOpen(false);
                                            }}
                                            style={isActive ? {
                                                backgroundColor: `${tabColor}18`,
                                                color: tabColor,
                                                borderColor: `${tabColor}35`
                                            } : undefined}
                                        >
                                            <span className={styles.dynamicIslandTabIcon} style={{ color: tabColor }}>
                                                {tab.icon}
                                            </span>
                                            <span className={styles.dynamicIslandMenuItemLabel}>
                                                {tab.label}
                                            </span>
                                            <span
                                                className={styles.dynamicIslandTabCount}
                                                style={isActive ? {
                                                    backgroundColor: `${tabColor}25`,
                                                    color: tabColor
                                                } : undefined}
                                            >
                                                {getTabCount(tab.id)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                ) : (() => {
                    const activeTabConfig = tabs.find(t => t.id === activeTab);
                    const activeColor = activeTabConfig?.color || '#0070f3';
                    return (
                            <div
                                className={`${styles.dynamicIslandFull} ${isIslandPulsing ? styles.dynamicIslandPulsing : ''}`}
                                style={isIslandPulsing ? {
                                    boxShadow: `0 20px 42px -8px rgba(0, 0, 0, 0.7), 0 0 32px 3px ${activeColor}45, inset 0 1px 0 rgba(255, 255, 255, 0.22)`
                                } : undefined}
                            >
                                <div className={styles.dynamicIslandTabs}>
                                    {/* Sliding Liquid Active Indicator Pill */}
                                    <div
                                        className={styles.dynamicIslandActiveIndicator}
                                        style={{
                                            left: `${indicatorStyle.left}px`,
                                            width: `${indicatorStyle.width}px`,
                                            opacity: indicatorStyle.opacity,
                                            backgroundColor: `${activeColor}1c`,
                                            borderColor: `${activeColor}40`,
                                            boxShadow: `0 2px 14px ${activeColor}33, inset 0 1px 0 rgba(255, 255, 255, 0.2)`
                                        }}
                                    />

                                    {tabs.map((tab, idx) => {
                                        const isActive = activeTab === tab.id;
                                        const tabColor = tab.color || '#0070f3';
                                        return (
                                            <button
                                                key={tab.id}
                                                ref={(el) => { tabButtonRefs.current[idx] = el; }}
                                                type="button"
                                                className={`${styles.dynamicIslandTab} ${isActive ? styles.dynamicIslandTabActive : ''}`}
                                                onClick={() => handleIslandTabSwitch(tab.id)}
                                                style={isActive ? { color: tabColor } : undefined}
                                            >
                                                <span
                                                    className={`${styles.dynamicIslandTabIcon} ${isActive ? styles.dynamicIslandTabIconActive : ''}`}
                                                    style={isActive || tabColor ? { color: tabColor } : undefined}
                                                >
                                                    {tab.icon}
                                                </span>
                                                <span className={styles.dynamicIslandTabLabel}>{tab.label}</span>
                                                <span
                                                    className={`${styles.dynamicIslandTabCount} ${isActive ? styles.dynamicIslandTabCountActive : ''}`}
                                                    style={isActive ? {
                                                        backgroundColor: `${tabColor}26`,
                                                        color: tabColor
                                                    } : undefined}
                                                >
                                                    {getTabCount(tab.id)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className={styles.dynamicIslandDivider} />

                                {/* Scroll to Top */}
                                <button
                                    type="button"
                                    className={styles.dynamicIslandActionBtn}
                                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                                    title="Scroll to top"
                                    aria-label="Scroll to top"
                                >
                                    <ArrowUp size={15} />
                                </button>

                                {/* Minimize to compact pill */}
                                <button
                                    type="button"
                                    className={styles.dynamicIslandActionBtn}
                                    onClick={() => setIsIslandMinimized(true)}
                                    title="Minimize status bar"
                                    aria-label="Minimize status bar"
                                >
                                    <ChevronUp size={15} />
                                </button>
                            </div>
                        );
                    })()}
            </div>

            <div className={styles.header}>
                <div>
                    <h1 className={styles.pageTitle}>My Watchlist</h1>
                    <p className={styles.subtitle}>Track what you're watching and discover new favorites.</p>
                </div>
                <div className={styles.headerActions}>
                    <InlineMediaSearch
                        watchlist={items.map((item) => ({
                            dbId: item.dbId || 0,
                            tmdbId: item.id,
                            status: item.status || '',
                            user_rating: item.user_rating,
                            title: item.title || item.name,
                            current_season: item.current_season,
                            current_episode: item.current_episode,
                            notes: item.notes,
                        }))}
                        onWatchlistUpdate={() => fetchWatchlist(true)}
                        variant="watchlist"
                        triggerLabel="Add New"
                        isOpen={isAddModalOpen}
                        onOpenChange={setIsAddModalOpen}
                    />
                </div>
            </div>

            {/* Release Radar Story Reel */}
            <ReleaseReel onWatchlistUpdated={fetchWatchlist} />

            {/* Navigation Tabs (Desktop) & Dropdown (Mobile) */}
            <div className={styles.navBar} ref={navBarRef}>
                {/* Mobile Custom Dropdown - REPLACES <select> */}
                {isMobile ? (
                    <div className={styles.customDropdownContainer}>
                        {(() => {
                            const activeTabConfig = tabs.find(t => t.id === activeTab);
                            const triggerColor = activeTabConfig?.color || undefined;
                            return (
                                <button
                                    className={`${styles.dropdownTrigger} ${isDropdownOpen ? styles.dropdownTriggerOpen : ''}`}
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    style={triggerColor ? { borderColor: triggerColor, color: triggerColor } : undefined}
                                >
                                    <span className={styles.triggerContent}>
                                        {activeTabConfig?.icon}
                                        {activeTabConfig?.label}
                                        <span className={styles.triggerCount}>({getTabCount(activeTab)})</span>
                                    </span>
                                    <ChevronDown size={18} className={styles.triggerChevron} />
                                </button>
                            );
                        })()}

                        {isDropdownOpen && (
                            <div className={styles.dropdownMenu}>
                                {tabs.map(tab => (
                                    <button
                                        key={tab.id}
                                        className={`${styles.dropdownItem} ${activeTab === tab.id ? styles.dropdownItemActive : ''}`}
                                        onClick={() => {
                                            setActiveTab(tab.id);
                                            setIsDropdownOpen(false);
                                        }}
                                        style={activeTab === tab.id && tab.color ? { backgroundColor: `${tab.color}15`, color: tab.color } : undefined}
                                    >
                                        <span className={styles.tabIcon} style={tab.color ? { color: tab.color } : undefined}>{tab.icon}</span>
                                        <span className={styles.itemLabel}>{tab.label}</span>
                                        <span className={styles.itemCount}>{getTabCount(tab.id)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    /* Desktop Tabs */
                    <div className={styles.tabs}>
                        {tabs.map(tab => {
                            const isActive = activeTab === tab.id;
                            const tabColor = tab.color || undefined;
                            return (
                                <button
                                    key={tab.id}
                                    className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
                                    onClick={() => setActiveTab(tab.id)}
                                    style={isActive && tabColor ? {
                                        color: tabColor,
                                        borderBottomColor: tabColor,
                                    } as React.CSSProperties : undefined}
                                >
                                    <span className={styles.tabIcon} style={tabColor ? { color: tabColor } : undefined}>{tab.icon}</span>
                                    {tab.label}
                                    <span
                                        className={styles.tabCount}
                                        style={isActive && tabColor ? {
                                            backgroundColor: `${tabColor}1a`,
                                            color: tabColor
                                        } : undefined}
                                    >
                                        {getTabCount(tab.id)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Command Center Toolbar */}
            <div className={styles.toolbar}>
                <div className={styles.searchContainer}>
                    <Search className={styles.searchIcon} size={18} />
                    <input
                        type="text"
                        placeholder="Search..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={styles.searchInput}
                    />
                </div>

                {isMobile && (
                    <button
                        className={`${styles.filterToggleBtn} ${showMobileFilters ? styles.filterToggleBtnActive : ''}`}
                        onClick={() => setShowMobileFilters(!showMobileFilters)}
                    >
                        <SlidersHorizontal size={18} />
                    </button>
                )}

                <div className={`${styles.controls} ${isMobile && !showMobileFilters ? styles.controlsHidden : (isMobile ? styles.controlsExpanded : '')}`}>
                    <CustomSelect
                        value={typeFilter}
                        options={[
                            { value: 'all', label: `All Types (${typeCounts.all})` },
                            { value: 'movie', label: `Movies (${typeCounts.movie})` },
                            { value: 'tv', label: `TV Shows (${typeCounts.tv})` },
                            { value: 'anime', label: `Anime (${typeCounts.anime})` }
                        ]}
                        onChange={(val) => setTypeFilter(val as any)}
                        className={styles.customSelectWrapper}
                    />

                    <CustomSelect
                        value={providerFilter}
                        options={[
                            { value: 'all', label: 'All Availability' },
                            { value: 'available', label: 'On My Services' },
                            { value: 'unavailable', label: 'Not on My Services' },
                            ...(regionalServices.length > 0
                                ? regionalServices
                                : Array.from(new Set(items.map(i => i.available_on).filter((p): p is string => Boolean(p))))
                            ).sort().map((p: string) => ({
                                value: p, label: p
                            }))
                        ]}
                        onChange={(val) => setProviderFilter(val as string)}
                        className={styles.customSelectWrapper}
                    />

                    <GenreFilter
                        selectedIds={selectedGenres}
                        onChange={setSelectedGenres}
                    />

                    <CustomSelect
                        value={sortField}
                        options={[
                            { value: 'date_added', label: 'Date Added' },
                            { value: 'rating', label: 'Rating' },
                            { value: 'title', label: 'Title' }
                        ]}
                        onChange={(val) => setSortField(val as any)}
                        className={styles.customSelectWrapper}
                    />
                    {/* Mobile: Group these two in a single row */}
                    {isMobile ? (
                        <div className={styles.mobileActionRow}>
                            <button
                                className={styles.sortDirectionBtn}
                                onClick={toggleSortOrder}
                                title={sortOrder === 'asc' ? "Ascending" : "Descending"}
                            >
                                {sortOrder === 'asc' ?
                                    <ArrowUp size={20} style={{ color: '#0070f3' }} /> :
                                    <ArrowDown size={20} style={{ color: '#0070f3' }} />
                                }
                            </button>

                            <div className={styles.viewToggle} style={{ flex: 1 }}>
                                <button
                                    className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.activeToggle : ''}`}
                                    onClick={() => handleViewChange('grid')}
                                    title="Grid View"
                                    style={{ flex: 1 }}
                                >
                                    <LayoutGrid size={20} />
                                </button>
                                <button
                                    className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.activeToggle : ''}`}
                                    onClick={() => handleViewChange('list')}
                                    title="List View"
                                    style={{ flex: 1 }}
                                >
                                    <List size={20} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* Desktop: Keep original separate layout */
                        <>
                            <button
                                className={styles.sortDirectionBtn}
                                onClick={toggleSortOrder}
                                title={sortOrder === 'asc' ? "Ascending" : "Descending"}
                            >
                                {sortOrder === 'asc' ?
                                    <ArrowUp size={18} style={{ color: '#0070f3' }} /> :
                                    <ArrowDown size={18} style={{ color: '#0070f3' }} />
                                }
                            </button>
                            <div className={styles.actionGroup}>
                                <div className={styles.viewToggle}>
                                    <button
                                        className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.activeToggle : ''}`}
                                        onClick={() => handleViewChange('grid')}
                                        title="Grid View"
                                    >
                                        <LayoutGrid size={18} />
                                    </button>
                                    <button
                                        className={`${styles.toggleBtn} ${viewMode === 'list' ? styles.activeToggle : ''}`}
                                        onClick={() => handleViewChange('list')}
                                        title="List View"
                                    >
                                        <List size={18} />
                                    </button>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {filteredItems.length > 0 ? (
                <>
                    <div key={activeTab} className={viewMode === 'grid' ? styles.watchlistGrid : styles.watchlistList}>
                        {displayedItems.map(item => (
                            <div key={item.dbId} style={{ display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0 }}>
                                <MediaCard
                                    item={item}
                                    existingStatus={item.status}
                                    showServiceBadge={
                                        item.available_on && userServices.has(item.available_on)
                                            ? item.available_on
                                            : undefined
                                    }
                                    layout={viewMode}
                                    onRemove={() => confirmRemove(item)}
                                    onStatusChange={(s, r) => handleStatusUpdate(item.dbId!, s, r)}
                                    onFollowChange={(val) => handleFollowUpdate(item.dbId!, val)}
                                />
                            </div>
                        ))}
                    </div>

                    {hasMore && (
                        <div
                            ref={loadMoreRef}
                            onClick={() => setVisibleCount((prev) => Math.min(prev + 50, filteredItems.length))}
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '2.5rem 1rem',
                                gap: '0.75rem',
                                textAlign: 'center',
                                cursor: 'pointer',
                            }}
                        >
                            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--accent-purple, #8b5cf6)' }} />
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #94a3b8)', fontWeight: 500 }}>
                                Showing {displayedItems.length} of {filteredItems.length} items
                            </span>
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setVisibleCount((prev) => Math.min(prev + 50, filteredItems.length));
                                    }}
                                    style={{
                                        padding: '0.45rem 1rem',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        borderRadius: '8px',
                                        background: 'rgba(139, 92, 246, 0.15)',
                                        border: '1px solid rgba(139, 92, 246, 0.3)',
                                        color: '#c084fc',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Load More (+50)
                                </button>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setVisibleCount(filteredItems.length);
                                    }}
                                    style={{
                                        padding: '0.45rem 1rem',
                                        fontSize: '0.8rem',
                                        fontWeight: 600,
                                        borderRadius: '8px',
                                        background: 'rgba(255, 255, 255, 0.05)',
                                        border: '1px solid rgba(255, 255, 255, 0.15)',
                                        color: '#94a3b8',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Show All ({filteredItems.length})
                                </button>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                (() => {
                    const getEmptyStateDetails = () => {
                        if (activeTab === 'watching') {
                            return {
                                icon: <Clapperboard size={32} />,
                                title: 'No shows in progress',
                                text: 'Start watching something from your plan to watch list!'
                            };
                        }
                        if (activeTab === 'plan_to_watch') {
                            return {
                                icon: <CalendarClock size={32} />,
                                title: 'Your plan to watch list is empty',
                                text: 'Find movies and TV shows to add to your list.'
                            };
                        }
                        if (activeTab === 'watched' || activeTab === 'completed') {
                            return {
                                icon: <CheckCircle size={32} />,
                                title: 'No completed shows yet',
                                text: 'Mark shows as watched when you finish them.'
                            };
                        }
                        if (activeTab === 'paused') {
                            return {
                                icon: <PauseCircle size={32} />,
                                title: 'No paused shows',
                                text: 'Shows you take a break from will appear here.'
                            };
                        }
                        if (activeTab === 'dropped') {
                            return {
                                icon: <XCircle size={32} />,
                                title: 'No dropped shows',
                                text: 'Shows you decide not to finish will appear here.'
                            };
                        }
                        return {
                            icon: <Layers size={32} />,
                            title: 'No items found',
                            text: searchQuery || selectedGenres.length > 0 ? 'Try adjusting your filters or search query.' : 'Your watchlist is empty. Add shows to get started!'
                        };
                    };

                    const emptyDetails = getEmptyStateDetails();
                    const isOverallEmpty = items.length === 0;

                    return (
                        <div className={styles.emptyState}>
                            <div className={styles.emptyIcon}>{emptyDetails.icon}</div>
                            <h3 className={styles.emptyTitle}>{emptyDetails.title}</h3>
                            <p className={styles.emptyText}>{emptyDetails.text}</p>
                            
                            <div className={styles.emptyActions}>
                                <button onClick={() => setIsAddModalOpen(true)} className={styles.emptyBtn}>
                                    <Search size={18} /> Browse Content
                                </button>
                                {isOverallEmpty && (
                                    <button onClick={() => setIsImportModalOpen(true)} className={styles.emptyImportBtn}>
                                        <Download size={18} /> Import Watchlist
                                    </button>
                                )}
                            </div>

                            {isOverallEmpty && (
                                <div className={styles.emptyImportTip}>
                                    💡 <strong>Migrating from another platform?</strong> Import your watchlist from <strong>IMDb</strong>, <strong>Letterboxd</strong>, <strong>MyAnimeList</strong>, or <strong>AniList</strong> in 1-click! (You can also access Import & Export anytime under Profile & Settings).
                                </div>
                            )}
                        </div>
                    );
                })()
            )}

            {/* Modals */}
            <ConfirmationModal
                isOpen={!!itemToRemove}
                onClose={() => setItemToRemove(null)}
                title={`Remove ${itemToRemove?.title || itemToRemove?.name}?`}
                message={
                    <span>
                        Are you sure you want to remove <strong>{itemToRemove?.title || itemToRemove?.name}</strong> from your watchlist? This action cannot be undone.
                    </span>
                }
                confirmLabel="Yes, Remove"
                onConfirm={handleRemove}
                onCancel={() => setItemToRemove(null)}
                isDangerous={true}
            />

            {/* Mobile FABs */}
            <div className={styles.fabContainer}>
                {showBackToTop && (
                    <button
                        className={`${styles.fabButton} ${styles.fabSecondary}`}
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    >
                        <ArrowUp size={20} />
                    </button>
                )}
                <button className={styles.fabButton} data-inline-search-fab="true" onClick={() => setIsAddModalOpen(true)}>
                    <Plus size={24} />
                </button>
            </div>

            <ImportExportModal
                isOpen={isImportModalOpen}
                onClose={() => setIsImportModalOpen(false)}
                onSuccess={fetchWatchlist}
            />
        </div>
    );
}
