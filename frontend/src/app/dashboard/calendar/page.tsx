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
    List,
    Zap,
    Tv,
    Play,
    ExternalLink,
    Sparkles,
    ChevronDown,
    ChevronUp
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
    'crunchyroll': '#f97316'
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
    const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');
    const [followedOnly, setFollowedOnly] = useState(false);
    const [showScorecards, setShowScorecards] = useState(false);
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

    const handleToday = () => {
        setCurrentDate(new Date());
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
    const todayStr = new Date().toISOString().split('T')[0];

    // Filter events if followedOnly is active
    const filteredEvents = (data?.events || []).map((evt) => ({
        ...evt,
        drops: followedOnly ? evt.drops.filter((d) => d.is_followed) : evt.drops
    })).filter((evt) => evt.drops.length > 0);

    // Heatmap bar total calculation
    const totalDropsInMonth = Object.values(data?.service_distribution || {}).reduce((a, b) => a + b, 0);

    // ========================================================
    // Build Complete 35 or 42 Cell Month Matrix
    // ========================================================
    const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0 = Sun
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

    interface GridCellData {
        dayNum: number;
        dateStr: string;
        isCurrentMonth: boolean;
        isToday: boolean;
        drops: ActivityDrop[];
    }

    const gridCells: GridCellData[] = [];

    // 1. Previous month trailing days
    for (let i = firstDayIndex - 1; i >= 0; i--) {
        const d = daysInPrevMonth - i;
        const prevMonthNum = month === 1 ? 12 : month - 1;
        const prevYear = month === 1 ? year - 1 : year;
        const dStr = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        gridCells.push({
            dayNum: d,
            dateStr: dStr,
            isCurrentMonth: false,
            isToday: dStr === todayStr,
            drops: []
        });
    }

    // 2. Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const dStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const dayDrops = (filteredEvents.find((e) => e.date === dStr)?.drops) || [];
        gridCells.push({
            dayNum: d,
            dateStr: dStr,
            isCurrentMonth: true,
            isToday: dStr === todayStr,
            drops: dayDrops
        });
    }

    // 3. Next month leading days to complete full 35 or 42 grid
    const totalCells = gridCells.length > 35 ? 42 : 35;
    const remainingCells = totalCells - gridCells.length;
    for (let d = 1; d <= remainingCells; d++) {
        const nextMonthNum = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const dStr = `${nextYear}-${String(nextMonthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        gridCells.push({
            dayNum: d,
            dateStr: dStr,
            isCurrentMonth: false,
            isToday: dStr === todayStr,
            drops: []
        });
    }

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    return (
        <div className={styles.pageContainer}>
            {/* Header */}
            <div className={styles.header}>
                <div className={styles.titleArea}>
                    <h1>
                        <CalendarIcon className={styles.radarIcon} size={28} />
                        Release Calendar
                    </h1>
                    <p className={styles.subtitle}>
                        Track TV season drops, episode air dates, and streaming subscription availability.
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
                        <button className={styles.todayBtn} onClick={handleToday} title="Go to current month">
                            Today
                        </button>
                    </div>

                    {/* View Switcher: Month Grid vs Agenda List */}
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'month' ? styles.toggleBtnActive : ''}`}
                            onClick={() => setViewMode('month')}
                            title="Month Calendar Grid"
                        >
                            <CalendarIcon size={14} /> Month
                        </button>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'agenda' ? styles.toggleBtnActive : ''}`}
                            onClick={() => setViewMode('agenda')}
                            title="Compact Agenda Timeline"
                        >
                            <List size={14} /> Agenda
                        </button>
                    </div>

                    {/* Followed Only Toggle Filter */}
                    <button
                        className={`${styles.toggleBtn} ${followedOnly ? styles.toggleBtnActive : ''}`}
                        onClick={() => setFollowedOnly(!followedOnly)}
                        style={{ border: '1px solid var(--border)', borderRadius: '12px', padding: '7px 12px' }}
                    >
                        <Zap size={13} fill={followedOnly ? '#f59e0b' : 'none'} color={followedOnly ? '#f59e0b' : 'currentColor'} />
                        {followedOnly ? 'Followed Only' : 'All Watchlist'}
                    </button>

                    {/* Sync Button */}
                    <button className={styles.syncBtn} onClick={handleSync} disabled={syncing} title="Refresh Release Data from TMDB">
                        <RotateCcw size={14} className={syncing ? 'animate-spin' : ''} />
                        {syncing ? 'Syncing...' : 'Sync Radar'}
                    </button>
                </div>
            </div>

            {/* Compact Subscription Heatmap Strip */}
            <div className={styles.heatmapStrip}>
                <div className={styles.heatmapTopRow}>
                    <div className={styles.heatmapSummary}>
                        <Sparkles size={16} color="#f59e0b" />
                        <span>
                            {totalDropsInMonth > 0
                                ? `${totalDropsInMonth} drops scheduled across ${Object.keys(data?.service_distribution || {}).length} services in ${monthName}`
                                : `No drops scheduled on your tracked shows for ${monthName}`}
                        </span>
                    </div>

                    {data?.value_scorecard && data.value_scorecard.length > 0 && (
                        <button
                            className={styles.insightsToggleBtn}
                            onClick={() => setShowScorecards(!showScorecards)}
                        >
                            {showScorecards ? (
                                <>Hide Spending Insights <ChevronUp size={14} /></>
                            ) : (
                                <>Spending & Value Insights ({data.value_scorecard.length}) <ChevronDown size={14} /></>
                            )}
                        </button>
                    )}
                </div>

                {/* Heatmap Bar */}
                {totalDropsInMonth > 0 && (
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
                        <div className={styles.heatmapLegendRow}>
                            <div className={styles.heatmapLegend}>
                                {Object.entries(data?.service_distribution || {}).map(([service, count]) => (
                                    <div key={service} className={styles.legendItem}>
                                        <span
                                            className={styles.legendDot}
                                            style={{ backgroundColor: getServiceColor(service) }}
                                        />
                                        <span>
                                            <strong>{service}</strong>: {count} {count === 1 ? 'drop' : 'drops'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* Collapsible Scorecard Drawer */}
                {showScorecards && data?.value_scorecard && (
                    <div className={styles.scorecardDrawer}>
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

            {/* ======================================================== */}
            {/* VIEW MODE: AUTHENTIC MONTHLY CALENDAR GRID (DEFAULT)     */}
            {/* ======================================================== */}
            {viewMode === 'month' ? (
                <div className={styles.calendarContainer}>
                    {/* Weekday Labels (Sun, Mon, Tue...) */}
                    <div className={styles.weekHeaderRow}>
                        {weekDays.map((day, idx) => (
                            <div
                                key={day}
                                className={`${styles.weekHeaderCell} ${idx === 0 || idx === 6 ? styles.weekHeaderCellWeekend : ''}`}
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    {/* The 7-Column Day Matrix */}
                    <div className={styles.calendarMonthGrid}>
                        {gridCells.map((cell, idx) => (
                            <div
                                key={`${cell.dateStr}-${idx}`}
                                className={`
                                    ${styles.calendarDayCell}
                                    ${!cell.isCurrentMonth ? styles.calendarDayCellDimmed : ''}
                                    ${cell.isToday ? styles.calendarDayCellToday : ''}
                                `}
                            >
                                {/* Date Number Header */}
                                <div className={styles.cellDateHeader}>
                                    <span className={styles.cellDayNumber}>{cell.dayNum}</span>
                                    {cell.isToday && <span className={styles.todayPill}>Today</span>}
                                    {cell.drops.length > 0 && (
                                        <span className={styles.dropCountBadge}>
                                            {cell.drops.length} {cell.drops.length === 1 ? 'drop' : 'drops'}
                                        </span>
                                    )}
                                </div>

                                {/* Episode Drop Cards Stack */}
                                <div className={styles.cellDropsStack}>
                                    {cell.drops.map((drop, dropIdx) => (
                                        <div
                                            key={`${drop.item_id}-${drop.season_number}-${drop.episode_number}-${dropIdx}`}
                                            className={`
                                                ${styles.gridDropCard}
                                                ${drop.is_on_active_subscription ? styles.gridDropCardActiveSub : ''}
                                            `}
                                            onClick={() => setSelectedDrop(drop)}
                                            title={`${drop.title} — Season ${drop.season_number} Episode ${drop.episode_number || 1}${
                                                drop.available_on ? ' on ' + drop.available_on : ''
                                            }`}
                                        >
                                            {drop.poster_path && (
                                                <img
                                                    src={`https://image.tmdb.org/t/p/w92${drop.poster_path}`}
                                                    alt={drop.title}
                                                    className={styles.cardMiniPoster}
                                                    loading="lazy"
                                                />
                                            )}
                                            <div className={styles.cardDetails}>
                                                <span className={styles.cardShowTitle}>{drop.title}</span>
                                                <span className={styles.cardEpTag}>
                                                    S{drop.season_number || 1}
                                                    {drop.episode_number ? ` · E${drop.episode_number}` : ''}
                                                </span>
                                                {drop.available_on && (
                                                    <span className={styles.cardProviderDot}>
                                                        ● {drop.available_on}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                /* ======================================================== */
                /* VIEW MODE: COMPACT AGENDA LIST                           */
                /* ======================================================== */
                <div className={styles.agendaContainer}>
                    {filteredEvents.length > 0 ? (
                        filteredEvents.map((evt) => {
                            const isToday = evt.date === todayStr;
                            const dateObj = new Date(evt.date + 'T00:00:00');
                            const dayFormatted = dateObj.toLocaleDateString('default', {
                                weekday: 'long',
                                month: 'short',
                                day: 'numeric'
                            });

                            return (
                                <div
                                    key={evt.date}
                                    className={`${styles.agendaDateBlock} ${isToday ? styles.agendaDateBlockToday : ''}`}
                                >
                                    <div className={styles.agendaDateHeader}>
                                        <span>{dayFormatted}</span>
                                        {isToday && <span className={styles.todayPill}>Today</span>}
                                    </div>

                                    <div className={styles.agendaCardsRow}>
                                        {evt.drops.map((drop, dropIdx) => (
                                            <div
                                                key={`${drop.item_id}-${drop.season_number}-${drop.episode_number}-${dropIdx}`}
                                                className={styles.agendaCard}
                                                onClick={() => setSelectedDrop(drop)}
                                            >
                                                {drop.poster_path && (
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w92${drop.poster_path}`}
                                                        alt={drop.title}
                                                        className={styles.agendaPoster}
                                                    />
                                                )}
                                                <div className={styles.cardDetails}>
                                                    <h5 style={{ margin: '0 0 2px', fontSize: '0.9rem', color: '#fff' }}>
                                                        {drop.title}
                                                    </h5>
                                                    <div style={{ fontSize: '0.8rem', color: '#a1a1aa', marginBottom: 4 }}>
                                                        Season {drop.season_number || 1} · Episode {drop.episode_number || 1}
                                                        {drop.episode_name ? `: "${drop.episode_name}"` : ''}
                                                    </div>
                                                    {drop.available_on && (
                                                        <span style={{ fontSize: '0.75rem', color: '#34d399', fontWeight: 600 }}>
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
                        <div className={styles.emptyCalendar}>
                            <CalendarIcon size={42} className={styles.emptyIcon} />
                            <h3>No releases found for {monthName}</h3>
                            <p>Follow more TV shows or check a different month.</p>
                        </div>
                    )}
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
