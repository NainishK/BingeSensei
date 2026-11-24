'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { ServiceIcon } from '@/components/ServiceIcon';
import styles from './ReleaseReel.module.css';
import { Play, X, Calendar, Check, ExternalLink, Sparkles, Tv, ChevronDown, ChevronUp, Clock, AlertCircle } from 'lucide-react';

export interface ActivityDrop {
    item_id: number;
    tmdb_id: number;
    title: string;
    media_type: string;
    poster_path?: string;
    available_on?: string;
    is_on_active_subscription: boolean;
    subscription_status?: 'active' | 'due_soon' | 'expired' | 'none';
    drop_type: 'new_season' | 'new_episode' | 'upcoming' | 'resurrected' | 'movie_streaming';
    season_number?: number;
    episode_number?: number;
    episode_name?: string;
    episode_still?: string;
    air_date?: string;
    days_relative?: number;
    status: string;
    current_season?: number;
    current_episode?: number;
    is_followed: boolean;
}

interface ActivityFeedResponse {
    reel_items: ActivityDrop[];
    fresh_drops: ActivityDrop[];
    imminent_drops: ActivityDrop[];
    resurrected_shows: ActivityDrop[];
}

interface ReleaseReelProps {
    onWatchlistUpdated?: () => void;
}

export default function ReleaseReel({ onWatchlistUpdated }: ReleaseReelProps) {
    const [feed, setFeed] = useState<ActivityFeedResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedDrop, setSelectedDrop] = useState<ActivityDrop | null>(null);
    const [resurrecting, setResurrecting] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(true);

    useEffect(() => {
        const saved = localStorage.getItem('release_radar_collapsed');
        if (saved !== null) {
            setIsCollapsed(saved === 'true');
        }
    }, []);

    const toggleCollapse = () => {
        setIsCollapsed(prev => {
            const next = !prev;
            try {
                localStorage.setItem('release_radar_collapsed', String(next));
            } catch {
                // Ignore storage errors
            }
            return next;
        });
    };

    const fetchDrops = async () => {
        try {
            const res = await api.get('/watchlist/activity/drops');
            setFeed(res.data);
        } catch (err) {
            console.error('Failed to fetch activity drops:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDrops();
    }, []);

    if (loading || !feed || !feed.reel_items || feed.reel_items.length === 0) {
        return null;
    }

    const handleResurrect = async (drop: ActivityDrop) => {
        setResurrecting(true);
        try {
            await api.post(`/watchlist/${drop.item_id}/resurrect`);
            await fetchDrops();
            onWatchlistUpdated?.();
            setSelectedDrop(null);
        } catch (e) {
            console.error('Resurrect failed', e);
        } finally {
            setResurrecting(false);
        }
    };

    const getRingClass = (type: string) => {
        switch (type) {
            case 'new_season':
                return styles.ringSeason;
            case 'new_episode':
                return styles.ringEpisode;
            case 'resurrected':
                return styles.ringResurrected;
            case 'upcoming':
            default:
                return styles.ringUpcoming;
        }
    };

    const getTagClass = (type: string) => {
        switch (type) {
            case 'new_season':
                return styles.tagSeason;
            case 'new_episode':
                return styles.tagEpisode;
            case 'resurrected':
                return styles.tagResurrected;
            case 'upcoming':
            default:
                return styles.tagUpcoming;
        }
    };

    const formatRelativeText = (drop: ActivityDrop) => {
        if (drop.drop_type === 'resurrected') {
            return `Season ${drop.season_number || 2} Dropped`;
        }
        if (drop.drop_type === 'movie_streaming') {
            return 'Now Streaming';
        }
        const days = drop.days_relative ?? 0;
        if (days === 0) return '🔥 Drops Today';
        if (days === -1) return 'Aired Yesterday';
        if (days < -1) return `${Math.abs(days)}d ago`;
        if (days === 1) return 'Tomorrow';
        return `In ${days} days`;
    };

    return (
        <>
            <div className={`${styles.container} ${isCollapsed ? styles.containerCollapsed : ''}`}>
                <div className={styles.headerRow}>
                    <div
                        className={styles.titleArea}
                        onClick={toggleCollapse}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                toggleCollapse();
                            }
                        }}
                    >
                        <div className={styles.radarBadge}>
                            <span className={styles.radarPulse}></span>
                            <span className={styles.radarBadgeTextDesktop}>Release Radar</span>
                            <span className={styles.radarBadgeTextMobile}>Radar</span>
                        </div>
                        <h4 className={styles.title}>
                            <span className={styles.desktopTitleText}>
                                {feed.reel_items.length} Fresh & Upcoming Drops
                            </span>
                            <span className={styles.mobileTitleText}>
                                {feed.reel_items.length} Drops
                            </span>
                        </h4>

                        {isCollapsed && (
                            <div className={styles.collapsedPreviewAvatars} title="Click to view drops">
                                {feed.reel_items.slice(0, 4).map((item, idx) => (
                                    <div key={idx} className={styles.miniPreviewAvatar}>
                                        {item.poster_path ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img
                                                src={`https://image.tmdb.org/t/p/w92${item.poster_path}`}
                                                alt={item.title}
                                            />
                                        ) : (
                                            <Tv size={10} color="#71717a" />
                                        )}
                                    </div>
                                ))}
                                {feed.reel_items.length > 4 && (
                                    <span className={styles.miniMoreCount}>+{feed.reel_items.length - 4}</span>
                                )}
                            </div>
                        )}
                    </div>

                    <div className={styles.headerActions}>
                        <Link href="/dashboard/calendar" className={styles.calendarLink}>
                            <Calendar size={13} />
                            <span className={styles.calendarLinkText}>Calendar</span>
                        </Link>

                        <button
                            type="button"
                            onClick={toggleCollapse}
                            className={styles.toggleCollapseBtn}
                            aria-expanded={!isCollapsed}
                            title={isCollapsed ? 'Show drops' : 'Hide drops'}
                        >
                            <span>{isCollapsed ? 'Show' : 'Hide'}</span>
                            {isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                        </button>
                    </div>
                </div>

                {!isCollapsed && (
                    <div className={styles.reelScroll}>
                        {feed.reel_items.map((drop, idx) => (
                            <div
                                key={`${drop.item_id}-${drop.drop_type}-${idx}`}
                                className={styles.reelItem}
                                onClick={() => setSelectedDrop(drop)}
                            >
                                <div className={`${styles.avatarWrapper} ${getRingClass(drop.drop_type)}`}>
                                    {drop.poster_path ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                            src={`https://image.tmdb.org/t/p/w185${drop.poster_path}`}
                                            alt={drop.title}
                                            className={styles.avatarImg}
                                            loading="lazy"
                                        />
                                    ) : (
                                        <div className={styles.avatarFallback}>
                                            <Tv size={24} />
                                        </div>
                                    )}
                                </div>

                                <div className={styles.itemTitle} title={drop.title}>
                                    {drop.title}
                                </div>

                                <span className={`${styles.dropTag} ${getTagClass(drop.drop_type)}`}>
                                    {formatRelativeText(drop)}
                                </span>

                                {drop.available_on && (
                                    <span
                                        className={`
                                            ${styles.providerPill}
                                            ${drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status) ? styles.providerActive : ''}
                                            ${drop.subscription_status === 'due_soon' ? styles.providerDueSoon : ''}
                                            ${drop.subscription_status === 'expired' ? styles.providerExpired : ''}
                                        `}
                                        title={
                                            drop.subscription_status === 'active'
                                                ? `Included in your active ${drop.available_on} plan`
                                                : drop.subscription_status === 'due_soon'
                                                ? `Renews soon on ${drop.available_on}`
                                                : drop.subscription_status === 'expired'
                                                ? `Subscription expired on ${drop.available_on}`
                                                : `Available on ${drop.available_on}`
                                        }
                                    >
                                        <ServiceIcon
                                            name={drop.available_on}
                                            style={{ width: 12, height: 12, borderRadius: 2.5, objectFit: 'cover', flexShrink: 0 }}
                                        />
                                        <span className={styles.providerNameText}>{drop.available_on}</span>
                                        {(drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status)) && (
                                            <Check size={9} strokeWidth={3} style={{ flexShrink: 0 }} />
                                        )}
                                        {drop.subscription_status === 'due_soon' && (
                                            <Clock size={9} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                        )}
                                        {drop.subscription_status === 'expired' && (
                                            <AlertCircle size={9} strokeWidth={2.5} style={{ flexShrink: 0 }} />
                                        )}
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Drop Details Modal */}
            {selectedDrop && (
                <div className={styles.modalOverlay} onClick={() => setSelectedDrop(null)}>
                    <div className={styles.dropModal} onClick={(e) => e.stopPropagation()}>
                        <button
                            className={styles.modalCloseBtn}
                            onClick={() => setSelectedDrop(null)}
                            title="Close"
                        >
                            <X size={16} />
                        </button>

                        <div className={styles.modalImageArea}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={
                                    selectedDrop.episode_still
                                        ? `https://image.tmdb.org/t/p/w780${selectedDrop.episode_still}`
                                        : selectedDrop.poster_path
                                        ? `https://image.tmdb.org/t/p/w780${selectedDrop.poster_path}`
                                        : ''
                                }
                                alt={selectedDrop.title}
                                className={styles.modalStillImg}
                            />
                            <div className={styles.modalImageGradient} />
                        </div>

                        <div className={styles.modalContent}>
                            {selectedDrop.drop_type === 'resurrected' && (
                                <div className={styles.resurrectBanner}>
                                    <div>
                                        <strong>Returning Series!</strong> Season {selectedDrop.season_number} is now available.
                                    </div>
                                    <button
                                        className={styles.resurrectBtn}
                                        onClick={() => handleResurrect(selectedDrop)}
                                        disabled={resurrecting}
                                    >
                                        <Sparkles size={13} />
                                        {resurrecting ? 'Moving...' : 'Start Watching'}
                                    </button>
                                </div>
                            )}

                            <h3 className={styles.modalShowTitle}>{selectedDrop.title}</h3>
                            <div className={styles.modalEpTitle}>
                                {selectedDrop.media_type === 'movie' ? (
                                    'Feature Film · Now Available to Stream'
                                ) : (
                                    <>
                                        Season {selectedDrop.season_number || 1}
                                        {selectedDrop.episode_number ? ` · Episode ${selectedDrop.episode_number}` : ''}
                                        {selectedDrop.episode_name ? `: "${selectedDrop.episode_name}"` : ''}
                                    </>
                                )}
                            </div>

                            <div className={styles.modalMetaRow}>
                                {selectedDrop.available_on && (
                                    <span
                                        className={`
                                            ${styles.modalServiceTag}
                                            ${selectedDrop.subscription_status === 'active' || (selectedDrop.is_on_active_subscription && !selectedDrop.subscription_status) ? styles.modalServiceActive : ''}
                                            ${selectedDrop.subscription_status === 'due_soon' ? styles.modalServiceDueSoon : ''}
                                            ${selectedDrop.subscription_status === 'expired' ? styles.modalServiceExpired : ''}
                                        `}
                                    >
                                        <ServiceIcon
                                            name={selectedDrop.available_on}
                                            style={{ width: 14, height: 14, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
                                        />
                                        {selectedDrop.subscription_status === 'active' || (selectedDrop.is_on_active_subscription && !selectedDrop.subscription_status)
                                            ? `Streaming on your active ${selectedDrop.available_on}`
                                            : selectedDrop.subscription_status === 'due_soon'
                                            ? `Due soon on ${selectedDrop.available_on}`
                                            : selectedDrop.subscription_status === 'expired'
                                            ? `Subscription expired on ${selectedDrop.available_on}`
                                            : `Available on ${selectedDrop.available_on}`}
                                    </span>
                                )}

                                {selectedDrop.air_date && (
                                    <span className={styles.modalDateTag}>
                                        <Calendar size={13} />
                                        {selectedDrop.air_date} ({formatRelativeText(selectedDrop)})
                                    </span>
                                )}
                            </div>

                            <div className={styles.modalActions}>
                                <a
                                    href={`https://www.google.com/search?q=${encodeURIComponent(
                                        `Watch ${selectedDrop.title} ${
                                            selectedDrop.available_on ? 'on ' + selectedDrop.available_on : ''
                                        }`
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.watchBtn}
                                >
                                    <Play size={15} fill="currentColor" />
                                    Watch Now
                                    <ExternalLink size={13} />
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

