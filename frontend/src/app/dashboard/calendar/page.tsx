'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import styles from './calendar.module.css';
import {
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    RotateCcw,
    Layers,
    ListFilter,
    Zap,
    Tv,
    Play,
    ExternalLink,
    Sparkles,
    Check
} from 'lucide-react';
import { ActivityDrop } from '@/components/ReleaseReel';

interface ValueScorecardItem {
    id: number;
    service_name: string;
    cost: number;
    currency: string;
    drop_count: number;
    value_label: string;
    suggested_action: string;
}

interface CalendarEvent {
    date: string; // YYYY-MM-DD
    drops: ActivityDrop[];
}

interface CalendarResponse {
    month: string;
    events: CalendarEvent[];
    service_distribution: Record<string, number>;
    value_scorecard: ValueScorecardItem[];
}

const SERVICE_COLORS: Record<string, string> = {
    'netflix': '#e50914',
    'apple tv+': '#e5e7eb',
    'apple': '#e5e7eb',
    'max': '#6366f1',
    'hbo': '#6366f1',
    'disney+': '#3b82f6',
    'hulu': '#10b981',
    'amazon prime': '#06b6d4',
    'prime video': '#06b6d4',
    'paramount+': '#2563eb',
    'peacock': '#f59e0b',
};

const getServiceColor = (name: string): string => {
    const lower = name.toLowerCase();
    for (const [key, color] of Object.entries(SERVICE_COLORS)) {
        if (lower.includes(key)) return color;
    }
    return '#a855f7'; // Default violet
};

export default function CalendarPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [data, setData] = useState<CalendarResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'runway' | 'grid'>('runway');
    const [preference, setPreference] = useState<'weekly' | 'binge'>('weekly');
    const [followedOnly, setFollowedOnly] = useState(false);
    const [selectedDrop, setSelectedDrop] = useState<ActivityDrop | null>(null);
    const [syncing, setSyncing] = useState(false);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;

    const fetchCalendar = async () => {
        setLoading(true);
        try {
            const res = await api.get(`/watchlist/calendar?month=${monthStr}`);
            setData(res.data);
        } catch (err) {
            console.error('Failed to fetch calendar:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCalendar();
    }, [monthStr]);

    const handlePrevMonth = () => {
        setCurrentDate(new Date(year, month - 2, 1));
    };

    const handleNextMonth = () => {
        setCurrentDate(new Date(year, month, 1));
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            await api.post('/watchlist/activity/sync');
            setTimeout(() => {
                fetchCalendar();
                setSyncing(false);
            }, 1500);
        } catch (e) {
            console.error('Sync failed', e);
            setSyncing(false);
        }
    };

    const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

    // Filter events if followedOnly is active
    const filteredEvents = (data?.events || []).map((evt) => ({
        ...evt,
        drops: followedOnly ? evt.drops.filter((d) => d.is_followed) : evt.drops
    })).filter((evt) => evt.drops.length > 0);

    // Heatmap bar total calculation
    const totalDropsInMonth = Object.values(data?.service_distribution || {}).reduce((a, b) => a + b, 0);

    const todayStr = new Date().toISOString().split('T')[0];

    // Build days matrix for Monthly Grid
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sun

    return (
        <div className={styles.pageContainer}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.titleArea}>
                    <h1>
                        <Zap className={styles.radarIcon} size={28} />
                        Release Calendar & Radar
                    </h1>
                    <p className={styles.subtitle}>
                        Plan upcoming drops, optimize your subscription timing, and avoid paying for idle services.
                    </p>
                </div>

                <div className={styles.headerControls}>
                    {/* Month Navigator */}
                    <div className={styles.monthNav}>
                        <button className={styles.monthBtn} onClick={handlePrevMonth} title="Previous Month">
                            <ChevronLeft size={18} />
                        </button>
                        <span className={styles.monthTitle}>{monthName}</span>
                        <button className={styles.monthBtn} onClick={handleNextMonth} title="Next Month">
                            <ChevronRight size={18} />
                        </button>
                    </div>

                    {/* View Switcher */}
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'runway' ? styles.toggleBtnActive : ''}`}
                            onClick={() => setViewMode('runway')}
                        >
                            <Layers size={14} /> Runway
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'grid' ? styles.toggleBtnActive : ''}`}
                            onClick={() => setViewMode('grid')}
                        >
                            <CalendarIcon size={14} /> Grid
                        </button>
                    </div>

                    {/* Followed Only Filter */}
                    <button
                        className={`${styles.toggleBtn} ${followedOnly ? styles.toggleBtnActive : ''}`}
                        onClick={() => setFollowedOnly(!followedOnly)}
                        style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '8px 12px' }}
                    >
                        <Zap size={13} fill={followedOnly ? '#f59e0b' : 'none'} color={followedOnly ? '#f59e0b' : 'currentColor'} />
                        {followedOnly ? 'Followed Only' : 'All Watchlist'}
                    </button>

                    {/* Sync Button */}
                    <button className={styles.syncBtn} onClick={handleSync} disabled={syncing}>
                        <RotateCcw size={14} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Syncing...' : 'Sync Radar'}
                    </button>
                </div>
            </div>

            {/* Subscription Heatmap Section */}
            <div className={styles.heatmapSection}>
                <div className={styles.heatmapHeader}>
                    <h3 className={styles.heatmapTitle}>
                        <Sparkles size={18} color="#f59e0b" />
                        Subscription Heatmap — {monthName}
                    </h3>

                    <div className={styles.prefToggle}>
                        <span>Viewing Strategy:</span>
                        <button
                            className={`${styles.prefPill} ${preference === 'weekly' ? styles.prefPillActive : ''}`}
                            onClick={() => setPreference('weekly')}
                        >
                            Weekly Releases
                        </button>
                        <button
                            className={`${styles.prefPill} ${preference === 'binge' ? styles.prefPillActive : ''}`}
                            onClick={() => setPreference('binge')}
                            title="Calculate based on Season Finale dates"
                        >
                            Binge Window
                        </button>
                    </div>
                </div>

                {/* Multi-colored Heatmap Bar */}
                {totalDropsInMonth > 0 ? (
                    <>
                        <div className={styles.heatmapBar}>
                            {Object.entries(data?.service_distribution || {}).map(([service, count]) => {
                                const pct = (count / totalDropsInMonth) * 100;
                                return (
                                    <div
                                        key={service}
                                        className={styles.heatmapSegment}
                                        style={{
                                            width: `${pct}%`,
                                            backgroundColor: getServiceColor(service)
                                        }}
                                        title={`${service}: ${count} drops (${Math.round(pct)}%)`}
                                    />
                                );
                            })}
                        </div>

                        {/* Legend */}
                        <div className={styles.heatmapLegend}>
                            {Object.entries(data?.service_distribution || {}).map(([service, count]) => (
                                <div key={service} className={styles.legendItem}>
                                    <span
                                        className={styles.legendDot}
                                        style={{ backgroundColor: getServiceColor(service) }}
                                    />
                                    <span>
                                        <strong>{service}</strong> ({count} {count === 1 ? 'drop' : 'drops'})
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                ) : (
                    <p style={{ fontSize: '0.85rem', color: '#a1a1aa', margin: '0 0 1rem' }}>
                        No drops scheduled on your tracked shows for this month.
                    </p>
                )}

                {/* Value Scorecard */}
                {data?.value_scorecard && data.value_scorecard.length > 0 && (
                    <div className={styles.scorecardGrid}>
                        {data.value_scorecard.map((item) => {
                            const badgeClass =
                                item.value_label === 'High Value'
                                    ? styles.badgeHigh
                                    : item.value_label === 'Moderate Value'
                                    ? styles.badgeModerate
                                    : item.value_label === 'Low Value'
                                    ? styles.badgeLow
                                    : styles.badgeIdle;

                            return (
                                <div key={`${item.id}-${item.service_name}`} className={styles.scorecard}>
                                    <div className={styles.scorecardTop}>
                                        <span className={styles.scorecardService}>{item.service_name}</span>
                                        <span className={styles.scorecardCost}>
                                            {item.cost.toFixed(2)} {item.currency}/mo
                                        </span>
                                    </div>
                                    <span className={`${styles.scorecardBadge} ${badgeClass}`}>
                                        {item.drop_count} drops · {item.value_label}
                                    </span>
                                    <div className={styles.scorecardAction}>{item.suggested_action}</div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Runway Timeline View */}
            {viewMode === 'runway' ? (
                <div className={styles.runwayContainer}>
                    {filteredEvents.length > 0 ? (
                        filteredEvents.map((evt) => {
                            const isToday = evt.date === todayStr;
                            const dateObj = new Date(evt.date + 'T00:00:00');
                            const dayName = dateObj.toLocaleDateString('default', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric'
                            });

                            return (
                                <div
                                    key={evt.date}
                                    className={`${styles.runwayDayBlock} ${isToday ? styles.runwayDayBlockToday : ''}`}
                                >
                                    <div className={styles.runwayDateHeader}>
                                        <span>{dayName}</span>
                                        {isToday && <span className={styles.todayTag}>Today</span>}
                                    </div>

                                    <div className={styles.runwayDropsGrid}>
                                        {evt.drops.map((drop, dropIdx) => (
                                            <div
                                                key={`${drop.item_id}-${drop.season_number}-${drop.episode_number}-${dropIdx}`}
                                                className={styles.runwayCard}
                                                onClick={() => setSelectedDrop(drop)}
                                            >
                                                {drop.poster_path && (
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w92${drop.poster_path}`}
                                                        alt={drop.title}
                                                        className={styles.runwayPoster}
                                                    />
                                                )}
                                                <div className={styles.runwayDetails}>
                                                    <h5 className={styles.runwayShowTitle} title={drop.title}>
                                                        {drop.title}
                                                    </h5>
                                                    <div className={styles.runwayEpMeta}>
                                                        Season {drop.season_number || 1}
                                                        {drop.episode_number ? ` · E${drop.episode_number}` : ''}
                                                    </div>
                                                    {drop.available_on && (
                                                        <span className={styles.runwayServiceBadge}>
                                                            <Tv size={12} />
                                                            {drop.available_on}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className={styles.emptyState}>
                            <CalendarIcon size={42} className={styles.emptyIcon} />
                            <h3>No releases found for {monthName}</h3>
                            <p>Follow more TV shows or check a different month.</p>
                        </div>
                    )}
                </div>
            ) : (
                /* Monthly Matrix Grid */
                <div className={styles.monthGrid}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                        <div key={d} className={styles.dayNameHeader}>
                            {d}
                        </div>
                    ))}

                    {/* Pre-padding empty days */}
                    {Array.from({ length: firstDayIndex }).map((_, i) => (
                        <div key={`empty-${i}`} className={styles.calendarCell} style={{ opacity: 0.3 }} />
                    ))}

                    {/* Day Cells */}
                    {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const cellDateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const isToday = cellDateStr === todayStr;
                        const dayDrops = (filteredEvents.find((e) => e.date === cellDateStr)?.drops) || [];

                        return (
                            <div
                                key={cellDateStr}
                                className={`${styles.calendarCell} ${isToday ? styles.calendarCellToday : ''}`}
                            >
                                <span className={`${styles.cellDayNum} ${isToday ? styles.cellDayNumToday : ''}`}>
                                    {dayNum}
                                </span>

                                {dayDrops.map((drop, dropIdx) => (
                                    <div
                                        key={`${drop.item_id}-${drop.season_number}-${drop.episode_number}-${dropIdx}`}
                                        className={`${styles.cellChip} ${drop.is_on_active_subscription ? styles.cellChipActiveSub : ''}`}
                                        onClick={() => setSelectedDrop(drop)}
                                        title={`${drop.title} (S${drop.season_number} E${drop.episode_number})`}
                                    >
                                        {drop.title} S{drop.season_number}
                                        {drop.episode_number ? `E${drop.episode_number}` : ''}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Quick Watch Drop Popover Modal */}
            {selectedDrop && (
                <div
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.75)',
                        backdropFilter: 'blur(8px)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 1000,
                        padding: '1rem'
                    }}
                    onClick={() => setSelectedDrop(null)}
                >
                    <div
                        style={{
                            background: 'rgba(24,24,27,0.96)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: '16px',
                            padding: '1.5rem',
                            maxWidth: '460px',
                            width: '100%',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.25rem', color: '#fff' }}>
                            {selectedDrop.title}
                        </h3>
                        <p style={{ margin: '0 0 1rem', color: '#a1a1aa', fontSize: '0.9rem' }}>
                            Season {selectedDrop.season_number} · Episode {selectedDrop.episode_number || 1}
                            {selectedDrop.episode_name ? ` ("${selectedDrop.episode_name}")` : ''}
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
                            {selectedDrop.available_on && (
                                <span
                                    style={{
                                        fontSize: '0.8rem',
                                        padding: '4px 8px',
                                        borderRadius: '6px',
                                        background: selectedDrop.is_on_active_subscription
                                            ? 'rgba(16, 185, 129, 0.15)'
                                            : 'rgba(255, 255, 255, 0.08)',
                                        color: selectedDrop.is_on_active_subscription ? '#34d399' : '#e4e4e7',
                                        border: '1px solid currentColor',
                                        fontWeight: 600
                                    }}
                                >
                                    {selectedDrop.is_on_active_subscription ? 'Streaming on your ' : 'Available on '}
                                    {selectedDrop.available_on}
                                </span>
                            )}
                            {selectedDrop.air_date && (
                                <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
                                    Airs: {selectedDrop.air_date}
                                </span>
                            )}
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <a
                                href={`https://www.google.com/search?q=${encodeURIComponent(
                                    `Watch ${selectedDrop.title} ${
                                        selectedDrop.available_on ? 'on ' + selectedDrop.available_on : ''
                                    }`
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    flex: 1,
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 6,
                                    background: '#2563eb',
                                    color: '#fff',
                                    padding: '10px',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    fontSize: '0.9rem',
                                    textDecoration: 'none'
                                }}
                            >
                                <Play size={14} fill="currentColor" /> Watch Now <ExternalLink size={12} />
                            </a>
                            <button
                                onClick={() => setSelectedDrop(null)}
                                style={{
                                    background: 'rgba(255,255,255,0.08)',
                                    color: '#fff',
                                    border: 'none',
                                    padding: '10px 16px',
                                    borderRadius: '8px',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
