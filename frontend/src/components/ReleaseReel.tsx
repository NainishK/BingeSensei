'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import api from '@/lib/api';
import { ServiceIcon } from '@/components/ServiceIcon';
import styles from './ReleaseReel.module.css';
import { Zap, Play, X, Calendar, Check, ExternalLink, Sparkles, Tv } from 'lucide-react';

export interface ActivityDrop {
    item_id: number;
    tmdb_id: number;
    title: string;
    media_type: string;
    poster_path?: string;
    available_on?: string;
    is_on_active_subscription: boolean;
    drop_type: 'new_season' | 'new_episode' | 'upcoming' | 'resurrected';
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
        const days = drop.days_relative ?? 0;
        if (days === 0) return '🔥 Drops Today';
        if (days === -1) return 'Aired Yesterday';
        if (days < -1) return `${Math.abs(days)}d ago`;
        if (days === 1) return 'Tomorrow';
        return `In ${days} days`;
    };

    return (
        <>
            <div className={styles.container}>
                <div className={styles.headerRow}>
                    <div className={styles.titleArea}>
                        <div className={styles.radarBadge}>
                            <span className={styles.radarPulse}></span>
                            Release Radar
                        </div>
                        <h4 className={styles.title}>
                            {feed.reel_items.length} Fresh & Upcoming Drops
                        </h4>
                    </div>

                    <Link href="/dashboard/calendar" className={styles.calendarLink}>
                        <Calendar size={14} />
                        Calendar & Heatmap
                    </Link>
                </div>

                <div className={styles.reelScroll}>
                    {feed.reel_items.map((drop, idx) => (
                        <div
                            key={`${drop.item_id}-${drop.drop_type}-${idx}`}
                            className={styles.reelItem}
                            onClick={() => setSelectedDrop(drop)}
                        >
                            <div className={`${styles.avatarWrapper} ${getRingClass(drop.drop_type)}`}>
                                {drop.poster_path ? (
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
                                    className={`${styles.providerPill} ${drop.is_on_active_subscription ? styles.providerActive : ''}`}
                                    title={drop.is_on_active_subscription ? `Included in your active ${drop.available_on} plan` : `Available on ${drop.available_on}`}
                                >
                                    <ServiceIcon
                                        name={drop.available_on}
                                        style={{ width: 12, height: 12, borderRadius: 2.5, objectFit: 'cover', flexShrink: 0 }}
                                    />
                                    <span className={styles.providerNameText}>{drop.available_on}</span>
                                    {drop.is_on_active_subscription && (
                                        <Check size={9} strokeWidth={3} style={{ flexShrink: 0 }} />
                                    )}
                                </span>
                            )}
                        </div>
                    ))}
                </div>
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
                                Season {selectedDrop.season_number || 1}
                                {selectedDrop.episode_number ? ` · Episode ${selectedDrop.episode_number}` : ''}
                                {selectedDrop.episode_name ? `: "${selectedDrop.episode_name}"` : ''}
                            </div>

                            <div className={styles.modalMetaRow}>
                                {selectedDrop.available_on && (
                                    <span
                                        className={`${styles.modalServiceTag} ${
                                            selectedDrop.is_on_active_subscription ? styles.modalServiceActive : ''
                                        }`}
                                    >
                                        <ServiceIcon
                                            name={selectedDrop.available_on}
                                            style={{ width: 14, height: 14, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
                                        />
                                        {selectedDrop.is_on_active_subscription
                                            ? `Streaming on your ${selectedDrop.available_on}`
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
                                    Watch on {selectedDrop.available_on || 'Provider'}
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

