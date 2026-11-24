'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import styles from './calendar.module.css';
import {
    Calendar as CalendarIcon,
    RotateCcw,
    List,
    Zap,
    Tv,
    Play,
    ExternalLink,
    Sparkles,
    ChevronDown,
    ChevronUp,
    Check,
    X,
    Clock,
    AlertCircle
} from 'lucide-react';
import { ActivityDrop } from '@/components/ReleaseReel';
import { ServiceIcon } from '@/components/ServiceIcon';
import { CalendarSkeleton } from '@/components/SkeletonLoader';

interface ValueScorecardItem {
    id: number;
    service_name: string;
    cost: number;
    currency: string;
    billing_cycle?: string;
    drop_count: number;
    value_label: string;
    suggested_action: string;
    subscription_status?: string;
    next_billing_date?: string;
    days_left?: number;
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

function formatLocalDate(d: Date): string {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export default function CalendarPage() {
    const [data, setData] = useState<CalendarResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'month' | 'agenda'>('month');
    const [followedOnly, setFollowedOnly] = useState(false);
    const [showScorecards, setShowScorecards] = useState(false);
    const [selectedDrop, setSelectedDrop] = useState<ActivityDrop | null>(null);
    const [selectedDay, setSelectedDay] = useState<{ dateStr: string; dateFormatted: string; drops: ActivityDrop[] } | null>(null);
    const [userCountry, setUserCountry] = useState<string>('');
    const [syncing, setSyncing] = useState(false);
    const [shouldScrollToToday, setShouldScrollToToday] = useState(false);

    // 4-Week Rolling Window centered on current week (Row 3 = This Week, containing Today)
    const today = new Date();
    const todayStr = formatLocalDate(today);
    const dayOfWeek = today.getDay(); // 0 = Sun
    const currentSunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOfWeek);
    const startSunday = new Date(currentSunday.getFullYear(), currentSunday.getMonth(), currentSunday.getDate() - 14);
    const endSaturday = new Date(startSunday.getFullYear(), startSunday.getMonth(), startSunday.getDate() + 27);

    const startStr = formatLocalDate(startSunday);
    const endStr = formatLocalDate(endSaturday);

    const startMonthName = startSunday.toLocaleString('default', { month: 'short' });
    const endMonthName = endSaturday.toLocaleString('default', { month: 'short' });
    const startYear = startSunday.getFullYear();
    const endYear = endSaturday.getFullYear();

    const rangeTitle = startYear === endYear
        ? (startSunday.getMonth() === endSaturday.getMonth()
            ? `${startMonthName} ${startSunday.getDate()} - ${endSaturday.getDate()}, ${startYear}`
            : `${startMonthName} ${startSunday.getDate()} - ${endMonthName} ${endSaturday.getDate()}, ${startYear}`)
        : `${startMonthName} ${startSunday.getDate()}, ${startYear} - ${endMonthName} ${endSaturday.getDate()}, ${endYear}`;

    const scrollToTodayElement = () => {
        let target = document.getElementById(viewMode === 'agenda' ? 'agenda-today' : 'calendar-today');

        // If in agenda view and today has no drops, locate the closest upcoming date
        if (!target && viewMode === 'agenda') {
            const blocks = document.querySelectorAll('[data-agenda-date]');
            for (let i = 0; i < blocks.length; i++) {
                const bDate = blocks[i].getAttribute('data-agenda-date');
                if (bDate && bDate >= todayStr) {
                    target = blocks[i] as HTMLElement;
                    break;
                }
            }
            if (!target && blocks.length > 0) {
                target = blocks[blocks.length - 1] as HTMLElement;
            }
        }

        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.classList.add(styles.pulseHighlight);
            setTimeout(() => {
                target?.classList.remove(styles.pulseHighlight);
            }, 1500);
        }
    };

    const fetchCalendar = async (countryOverride?: string) => {
        setFetchError(null);
        try {
            let activeCountry = countryOverride || userCountry;
            if (!activeCountry) {
                try {
                    const profileRes = await api.get('/users/me/');
                    activeCountry = profileRes.data.country || 'IN';
                    setUserCountry(activeCountry);
                } catch {
                    activeCountry = 'IN';
                }
            }
            const res = await api.get(`/watchlist/calendar?start=${startStr}&end=${endStr}&country=${activeCountry}`);
            setData(res.data);
            try {
                localStorage.setItem('binge_calendar_cache', JSON.stringify({
                    data: res.data,
                    range: `${startStr}_${endStr}`,
                    timestamp: Date.now()
                }));
            } catch {
                // Ignore storage errors
            }
        } catch (err) {
            console.error('Failed to fetch calendar:', err);
            setFetchError('Unable to load schedule. Please check your connection or retry.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // 1. Instant Cache Restoration (<50ms)
        try {
            const cached = localStorage.getItem('binge_calendar_cache');
            if (cached) {
                const parsed = JSON.parse(cached);
                if (parsed.data && parsed.range === `${startStr}_${endStr}`) {
                    setData(parsed.data);
                    setLoading(false);
                }
            }
        } catch {
            // Ignore cache errors
        }

        fetchCalendar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [startStr, endStr]);

    useEffect(() => {
        if (shouldScrollToToday && !loading && data) {
            const timer = setTimeout(() => {
                scrollToTodayElement();
                setShouldScrollToToday(false);
            }, 100);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, loading, shouldScrollToToday]);

    const handleToday = () => {
        scrollToTodayElement();
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

    // Filter events if followedOnly is active
    const filteredEvents = (data?.events || []).map((evt) => ({
        ...evt,
        drops: followedOnly ? evt.drops.filter((d) => d.is_followed) : evt.drops
    })).filter((evt) => evt.drops.length > 0);

    // Heatmap bar total calculation
    const totalDropsInMonth = Object.values(data?.service_distribution || {}).reduce((a, b) => a + b, 0);

    // ========================================================
    // Build Complete 28 Cell 4-Week Grid Matrix
    // ========================================================
    interface GridCellData {
        dayNum: number;
        dateStr: string;
        isCurrentMonth: boolean;
        isToday: boolean;
        drops: ActivityDrop[];
    }

    const gridCells: GridCellData[] = [];
    for (let i = 0; i < 28; i++) {
        const cellDate = new Date(startSunday.getFullYear(), startSunday.getMonth(), startSunday.getDate() + i);
        const dStr = formatLocalDate(cellDate);
        const dayDrops = (filteredEvents.find((e) => e.date === dStr)?.drops) || [];
        gridCells.push({
            dayNum: cellDate.getDate(),
            dateStr: dStr,
            isCurrentMonth: cellDate.getMonth() === today.getMonth(),
            isToday: dStr === todayStr,
            drops: dayDrops
        });
    }

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    if (loading && !data) {
        return <CalendarSkeleton />;
    }

    if (fetchError && !data) {
        return (
            <div className={styles.pageContainer}>
                <div className={styles.emptyCalendar}>
                    <CalendarIcon size={42} className={styles.emptyIcon} />
                    <h3>Unable to load release schedule</h3>
                    <p>{fetchError}</p>
                    <button className={styles.todayBtn} onClick={() => fetchCalendar()} style={{ marginTop: '1rem', padding: '8px 18px' }}>
                        Retry
                    </button>
                </div>
            </div>
        );
    }

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
                    {/* 4-Week Window Label & Jump to Today */}
                    <div className={styles.monthNav}>
                        <span className={styles.monthTitle}>{rangeTitle}</span>
                        <button className={styles.todayBtn} onClick={handleToday} title="Jump to today">
                            Today
                        </button>
                    </div>

                    {/* View Switcher: 4-Week Grid vs Agenda List */}
                    <div className={styles.viewToggle}>
                        <button
                            className={`${styles.toggleBtn} ${viewMode === 'month' ? styles.toggleBtnActive : ''}`}
                            onClick={() => setViewMode('month')}
                            title="4-Week Grid View"
                        >
                            <CalendarIcon size={14} /> 4-Week
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
                                ? `${totalDropsInMonth} drops scheduled across ${Object.keys(data?.service_distribution || {}).length} services in this 4-week schedule`
                                : `No drops scheduled on your tracked shows for this 4-week schedule`}
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
                                        <ServiceIcon
                                            name={service}
                                            style={{ width: 14, height: 14, borderRadius: 3, objectFit: 'cover' }}
                                        />
                                        <span>
                                            <strong>{service}</strong>: {count} {count === 1 ? 'drop' : 'drops'}
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className={styles.legendRightGroup}>
                                <div
                                    className={styles.legendActiveSubPill}
                                    title="Streaming on services with an active subscription"
                                >
                                    <span className={styles.legendActiveSubDot} />
                                    <span>Active Sub</span>
                                </div>
                                <div
                                    className={styles.legendDueSoonPill}
                                    title="Streaming on services renewing within 7 days"
                                >
                                    <span className={styles.legendDueSoonDot} />
                                    <span>Due Soon</span>
                                </div>
                                <div
                                    className={styles.legendExpiredPill}
                                    title="Streaming on services with an expired subscription"
                                >
                                    <span className={styles.legendExpiredDot} />
                                    <span>Expired Sub</span>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Collapsible Scorecard Drawer */}
                {showScorecards && data?.value_scorecard && (
                    <div className={styles.scorecardDrawer}>
                        {data.value_scorecard.map((item) => {
                            const isExpired = item.subscription_status === 'expired' || item.value_label.toLowerCase().includes('expired');
                            const isDueSoon = item.subscription_status === 'due_soon' || item.value_label.toLowerCase().includes('due soon');

                            const cardBorderClass = isExpired
                                ? styles.scorecardExpired
                                : isDueSoon
                                ? styles.scorecardDueSoon
                                : styles.scorecardActive;

                            const badgeClass = isExpired
                                ? styles.badgeExpired
                                : isDueSoon
                                ? styles.badgeDueSoon
                                : item.value_label === 'High Value'
                                ? styles.badgeHigh
                                : item.value_label === 'Moderate Value' || item.value_label === 'Binge Window'
                                ? styles.badgeModerate
                                : item.value_label === 'Low Value'
                                ? styles.badgeLow
                                : styles.badgeIdle;

                            const statusClass = isExpired
                                ? styles.statusExpired
                                : isDueSoon
                                ? styles.statusDueSoon
                                : styles.statusActive;

                            const statusText = isExpired
                                ? 'Expired'
                                : isDueSoon
                                ? (item.days_left !== undefined && item.days_left !== null
                                    ? (item.days_left === 0 ? 'Renews Today' : `Renews in ${item.days_left}d`)
                                    : 'Due Soon')
                                : 'Active';

                            const isYearly = item.billing_cycle?.toLowerCase() === 'yearly' || item.billing_cycle?.toLowerCase() === 'annual';

                            return (
                                <div key={`${item.id}-${item.service_name}`} className={`${styles.scorecard} ${cardBorderClass}`}>
                                    <div className={styles.scorecardTop}>
                                        <div className={styles.scorecardServiceGroup}>
                                            <ServiceIcon
                                                name={item.service_name}
                                                style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover', flexShrink: 0 }}
                                            />
                                            <span className={styles.scorecardService}>{item.service_name}</span>
                                        </div>
                                        <span className={styles.scorecardCost}>
                                            {item.cost.toFixed(2)} {item.currency}{isYearly ? '/yr' : '/mo'}
                                        </span>
                                    </div>
                                    <div className={styles.scorecardBadgesRow}>
                                        <span className={`${styles.scorecardStatusBadge} ${statusClass}`}>
                                            {statusText}
                                        </span>
                                        <span className={`${styles.scorecardBadge} ${badgeClass}`}>
                                            {item.drop_count} {item.drop_count === 1 ? 'drop' : 'drops'} · {item.value_label}
                                        </span>
                                    </div>
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
                                id={cell.isToday ? 'calendar-today' : undefined}
                                className={`
                                    ${styles.calendarDayCell}
                                    ${!cell.isCurrentMonth ? styles.calendarDayCellDimmed : ''}
                                    ${cell.isToday ? styles.calendarDayCellToday : ''}
                                `}
                            >
                                {/* Date Number Header */}
                                <div
                                    className={styles.cellDateHeader}
                                    onClick={() => {
                                        if (cell.drops.length > 0) {
                                            const dObj = new Date(cell.dateStr + 'T00:00:00');
                                            setSelectedDay({
                                                dateStr: cell.dateStr,
                                                dateFormatted: dObj.toLocaleDateString('default', {
                                                    weekday: 'long',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                }),
                                                drops: cell.drops
                                            });
                                        }
                                    }}
                                    style={{ cursor: cell.drops.length > 0 ? 'pointer' : 'default' }}
                                    title={cell.drops.length > 0 ? `Click to view all ${cell.drops.length} drops` : undefined}
                                >
                                    <span className={styles.cellDayNumber}>{cell.dayNum}</span>
                                    {cell.isToday && <span className={styles.todayPill}>Today</span>}
                                    {cell.drops.length > 0 && (
                                        <span className={styles.dropCountBadge}>
                                            {cell.drops.length} {cell.drops.length === 1 ? 'drop' : 'drops'}
                                        </span>
                                    )}
                                </div>

                                 {/* Episode Drop Cards Stack (Max 2 cards visible to keep grid perfectly balanced) */}
                                <div className={styles.cellDropsStack}>
                                    {cell.drops.slice(0, 2).map((drop, dropIdx) => {
                                        const cardStatusClass =
                                            drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status)
                                                ? styles.gridDropCardActiveSub
                                                : drop.subscription_status === 'due_soon'
                                                ? styles.gridDropCardDueSoon
                                                : drop.subscription_status === 'expired'
                                                ? styles.gridDropCardExpired
                                                : '';

                                        const providerClass =
                                            drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status)
                                                ? styles.cardProviderActive
                                                : drop.subscription_status === 'due_soon'
                                                ? styles.cardProviderDueSoon
                                                : drop.subscription_status === 'expired'
                                                ? styles.cardProviderExpired
                                                : styles.cardProviderNeutral;

                                        const providerTitle =
                                            drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status)
                                                ? `Included in your active ${drop.available_on} plan`
                                                : drop.subscription_status === 'due_soon'
                                                ? `Renews soon on ${drop.available_on}`
                                                : drop.subscription_status === 'expired'
                                                ? `Subscription expired on ${drop.available_on} - renew to stream`
                                                : `Available on ${drop.available_on}`;

                                        return (
                                            <div
                                                key={`${drop.item_id}-${drop.season_number}-${drop.episode_number}-${dropIdx}`}
                                                className={`
                                                    ${styles.gridDropCard}
                                                    ${cardStatusClass}
                                                `}
                                                onClick={() => setSelectedDrop(drop)}
                                                title={`${drop.title} · Season ${drop.season_number} Episode ${drop.episode_number || 1}${
                                                    drop.available_on ? ' on ' + drop.available_on : ''
                                                }${
                                                    drop.subscription_status === 'active'
                                                        ? ' (Active subscription)'
                                                        : drop.subscription_status === 'due_soon'
                                                        ? ' (Renewal due soon)'
                                                        : drop.subscription_status === 'expired'
                                                        ? ' (Subscription expired)'
                                                        : ''
                                                }`}
                                            >
                                                {drop.poster_path ? (
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w92${drop.poster_path}`}
                                                        alt={drop.title}
                                                        className={styles.cardMiniPoster}
                                                        loading="lazy"
                                                    />
                                                ) : (
                                                    <div className={styles.cardMiniPosterPlaceholder}>
                                                        <Tv size={13} color="#71717a" />
                                                    </div>
                                                )}
                                                <div className={styles.cardDetails}>
                                                    <span className={styles.cardShowTitle}>{drop.title}</span>
                                                    <span className={styles.cardEpTag}>
                                                        S{drop.season_number || 1}
                                                        {drop.episode_number ? ` · E${drop.episode_number}` : ''}
                                                    </span>
                                                    <div className={styles.cardProviderRow}>
                                                        {drop.available_on ? (
                                                            <span
                                                                className={providerClass}
                                                                title={providerTitle}
                                                            >
                                                                <ServiceIcon
                                                                    name={drop.available_on}
                                                                    style={{ width: 12, height: 12, borderRadius: 2.5, objectFit: 'cover', flexShrink: 0 }}
                                                                />
                                                                <span className={styles.providerName}>{drop.available_on}</span>
                                                                {(drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status)) && (
                                                                    <Check size={9} strokeWidth={3} />
                                                                )}
                                                                {drop.subscription_status === 'due_soon' && (
                                                                    <Clock size={9} strokeWidth={2.5} />
                                                                )}
                                                                {drop.subscription_status === 'expired' && (
                                                                    <AlertCircle size={9} strokeWidth={2.5} />
                                                                )}
                                                            </span>
                                                        ) : (
                                                            <span className={styles.cardNoProvider}>Airing TBA</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* +N More Drops Pill */}
                                    {cell.drops.length > 2 && (
                                        <button
                                            className={styles.moreDropsBtn}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                const dObj = new Date(cell.dateStr + 'T00:00:00');
                                                setSelectedDay({
                                                    dateStr: cell.dateStr,
                                                    dateFormatted: dObj.toLocaleDateString('default', {
                                                        weekday: 'long',
                                                        month: 'long',
                                                        day: 'numeric',
                                                        year: 'numeric'
                                                    }),
                                                    drops: cell.drops
                                                });
                                            }}
                                            title={`View all ${cell.drops.length} drops for ${cell.dateStr}`}
                                        >
                                            +{cell.drops.length - 2} more {cell.drops.length - 2 === 1 ? 'drop' : 'drops'}
                                        </button>
                                    )}
                                </div>

                                {/* Mobile Compact Drop Indicator (visible only on mobile via CSS) */}
                                {cell.drops.length > 0 && (
                                    <div
                                        className={styles.cellMobileIndicator}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            const dObj = new Date(cell.dateStr + 'T00:00:00');
                                            setSelectedDay({
                                                dateStr: cell.dateStr,
                                                dateFormatted: dObj.toLocaleDateString('default', {
                                                    weekday: 'long',
                                                    month: 'long',
                                                    day: 'numeric',
                                                    year: 'numeric'
                                                }),
                                                drops: cell.drops
                                            });
                                        }}
                                        title={`View all ${cell.drops.length} drops for ${cell.dateStr}`}
                                    >
                                        <div
                                            className={`
                                                ${styles.mobileDropsPill}
                                                ${cell.drops.some(d => d.subscription_status === 'active' || (d.is_on_active_subscription && !d.subscription_status)) ? styles.mobileDropsPillActive : ''}
                                                ${cell.drops.some(d => d.subscription_status === 'due_soon') ? styles.mobileDropsPillDueSoon : ''}
                                                ${cell.drops.some(d => d.subscription_status === 'expired') ? styles.mobileDropsPillExpired : ''}
                                            `}
                                        >
                                            <span className={styles.mobileDropsCount}>{cell.drops.length}</span>
                                            <div className={styles.mobileServiceIconsRow}>
                                                {Array.from(new Set(cell.drops.map(d => d.available_on).filter(Boolean))).slice(0, 3).map((svc, i) => (
                                                    <ServiceIcon
                                                        key={i}
                                                        name={svc as string}
                                                        style={{ width: 10, height: 10, borderRadius: 2, flexShrink: 0 }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
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
                                    id={isToday ? 'agenda-today' : `agenda-${evt.date}`}
                                    data-agenda-date={evt.date}
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
                                                    /* eslint-disable-next-line @next/next/no-img-element */
                                                    <img
                                                        src={`https://image.tmdb.org/t/p/w92${drop.poster_path}`}
                                                        alt={drop.title}
                                                        className={styles.agendaPoster}
                                                    />
                                                )}
                                                <div className={styles.cardDetails}>
                                                    <h5 className={styles.agendaShowTitle}>
                                                        {drop.title}
                                                    </h5>
                                                    <div className={styles.agendaEpInfo}>
                                                        Season {drop.season_number || 1} · Episode {drop.episode_number || 1}
                                                        {drop.episode_name ? `: "${drop.episode_name}"` : ''}
                                                    </div>
                                                    {drop.available_on && (
                                                        <div
                                                            style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: 5,
                                                                fontSize: '0.75rem',
                                                                fontWeight: 600,
                                                                color: drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status)
                                                                    ? '#10b981'
                                                                    : drop.subscription_status === 'due_soon'
                                                                    ? '#f59e0b'
                                                                    : drop.subscription_status === 'expired'
                                                                    ? '#f87171'
                                                                    : '#a1a1aa'
                                                            }}
                                                        >
                                                            <ServiceIcon
                                                                name={drop.available_on}
                                                                style={{ width: 13, height: 13, borderRadius: 2.5, objectFit: 'cover' }}
                                                            />
                                                            <span>{drop.available_on}</span>
                                                            {(drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status)) && (
                                                                <Check size={10} strokeWidth={3} />
                                                            )}
                                                            {drop.subscription_status === 'due_soon' && (
                                                                <Clock size={10} strokeWidth={2.5} />
                                                            )}
                                                            {drop.subscription_status === 'expired' && (
                                                                <AlertCircle size={10} strokeWidth={2.5} />
                                                            )}
                                                        </div>
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
                            <h3>No releases found for this 4-week schedule</h3>
                            <p>Follow more TV shows or check your watchlist filters.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Cinematic Quick Watch Drop Modal */}
            {selectedDrop && (
                <div
                    className={styles.cinematicModalOverlay}
                    onClick={() => setSelectedDrop(null)}
                >
                    <div
                        className={styles.cinematicModal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Circular Close Button */}
                        <button
                            className={styles.cinematicCloseBtn}
                            onClick={() => setSelectedDrop(null)}
                            title="Close"
                        >
                            <X size={16} />
                        </button>

                        {/* Banner Area with Episode Still or Poster */}
                        <div className={styles.cinematicBannerArea}>
                            {selectedDrop.episode_still || selectedDrop.poster_path ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={
                                        selectedDrop.episode_still
                                            ? `https://image.tmdb.org/t/p/w780${selectedDrop.episode_still}`
                                            : `https://image.tmdb.org/t/p/w780${selectedDrop.poster_path}`
                                    }
                                    alt={selectedDrop.title}
                                    className={styles.cinematicBannerImg}
                                />
                            ) : (
                                <div className={styles.cinematicBannerPlaceholder}>
                                    <Tv size={36} color="#71717a" />
                                </div>
                            )}
                            <div className={styles.cinematicBannerGradient} />
                        </div>

                        {/* Modal Body */}
                        <div className={styles.cinematicBody}>
                            <div className={styles.cinematicTagsRow}>
                                <span className={styles.cinematicBadge}>
                                    Season {selectedDrop.season_number || 1} · Episode {selectedDrop.episode_number || 1}
                                </span>
                                {selectedDrop.available_on && (
                                    <span
                                        className={`
                                            ${styles.cinematicBadge}
                                            ${selectedDrop.subscription_status === 'active' || (selectedDrop.is_on_active_subscription && !selectedDrop.subscription_status) ? styles.cinematicBadgeActiveSub : ''}
                                            ${selectedDrop.subscription_status === 'due_soon' ? styles.cinematicBadgeDueSoon : ''}
                                            ${selectedDrop.subscription_status === 'expired' ? styles.cinematicBadgeExpired : ''}
                                        `}
                                    >
                                        <ServiceIcon
                                            name={selectedDrop.available_on}
                                            style={{ width: 14, height: 14, borderRadius: 3, objectFit: 'cover' }}
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
                            </div>

                            <h3 className={styles.cinematicShowTitle}>{selectedDrop.title}</h3>
                            {selectedDrop.episode_name && (
                                <div className={styles.cinematicEpTitle}>
                                    &quot;{selectedDrop.episode_name}&quot;
                                </div>
                            )}

                            <div className={styles.cinematicMetaInfo}>
                                {selectedDrop.air_date && (
                                    <span className={styles.cinematicMetaItem}>
                                        <CalendarIcon size={13} />
                                        {selectedDrop.air_date}
                                        {selectedDrop.days_relative !== undefined && (
                                            <span style={{ color: selectedDrop.days_relative === 0 ? '#f59e0b' : '#a1a1aa' }}>
                                                ({selectedDrop.days_relative === 0
                                                    ? 'Today'
                                                    : selectedDrop.days_relative > 0
                                                    ? `In ${selectedDrop.days_relative}d`
                                                    : `${Math.abs(selectedDrop.days_relative)}d ago`})
                                            </span>
                                        )}
                                    </span>
                                )}
                            </div>

                            <div className={styles.cinematicActions}>
                                <a
                                    href={`https://www.google.com/search?q=${encodeURIComponent(
                                        `Watch ${selectedDrop.title} ${
                                            selectedDrop.available_on ? 'on ' + selectedDrop.available_on : ''
                                        }`
                                    )}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.cinematicWatchBtn}
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

            {/* Day Schedule Modal (shown when clicking +N more or day header) */}
            {selectedDay && (
                <div
                    className={styles.dayModalOverlay}
                    onClick={() => setSelectedDay(null)}
                >
                    <div
                        className={styles.dayModal}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.dayModalHeader}>
                            <div>
                                <h3 className={styles.dayModalTitle}>{selectedDay.dateFormatted}</h3>
                                <p className={styles.dayModalSubtitle}>
                                    {selectedDay.drops.length} {selectedDay.drops.length === 1 ? 'drop' : 'drops'} scheduled on this day
                                </p>
                            </div>
                            <button
                                className={styles.dayModalCloseBtn}
                                onClick={() => setSelectedDay(null)}
                                title="Close"
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className={styles.dayModalDropsList}>
                            {selectedDay.drops.map((drop, idx) => (
                                <div
                                    key={`${drop.item_id}-${drop.season_number}-${drop.episode_number}-${idx}`}
                                    className={`
                                        ${styles.dayModalCard}
                                        ${drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status) ? styles.dayModalCardActiveSub : ''}
                                        ${drop.subscription_status === 'due_soon' ? styles.dayModalCardDueSoon : ''}
                                        ${drop.subscription_status === 'expired' ? styles.dayModalCardExpired : ''}
                                    `}
                                >
                                    {drop.poster_path ? (
                                        /* eslint-disable-next-line @next/next/no-img-element */
                                        <img
                                            src={`https://image.tmdb.org/t/p/w92${drop.poster_path}`}
                                            alt={drop.title}
                                            className={styles.dayModalPoster}
                                        />
                                    ) : (
                                        <div className={styles.dayModalPosterPlaceholder}>
                                            <Tv size={20} color="#71717a" />
                                        </div>
                                    )}

                                    <div className={styles.dayModalDetails}>
                                        <h4 className={styles.dayModalShowTitle}>{drop.title}</h4>
                                        <div className={styles.dayModalEpInfo}>
                                            Season {drop.season_number || 1} · Episode {drop.episode_number || 1}
                                            {drop.episode_name ? `: "${drop.episode_name}"` : ''}
                                        </div>

                                        <div className={styles.dayModalBadgeRow}>
                                            {drop.available_on ? (
                                                <span
                                                    className={`
                                                        ${styles.dayModalSubPill}
                                                        ${drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status) ? styles.dayModalSubPillActive : ''}
                                                        ${drop.subscription_status === 'due_soon' ? styles.dayModalSubPillDueSoon : ''}
                                                        ${drop.subscription_status === 'expired' ? styles.dayModalSubPillExpired : ''}
                                                    `}
                                                >
                                                    <ServiceIcon
                                                        name={drop.available_on}
                                                        style={{ width: 14, height: 14, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }}
                                                    />
                                                    <span className={styles.dayModalSubName}>{drop.available_on}</span>
                                                    {(drop.subscription_status === 'active' || (drop.is_on_active_subscription && !drop.subscription_status)) && (
                                                        <span className={styles.dayModalActiveCheck} title="Active subscription">
                                                            <Check size={11} strokeWidth={3} />
                                                        </span>
                                                    )}
                                                    {drop.subscription_status === 'due_soon' && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', color: '#f59e0b', marginLeft: 1 }} title="Renews soon">
                                                            <Clock size={11} strokeWidth={2.5} />
                                                        </span>
                                                    )}
                                                    {drop.subscription_status === 'expired' && (
                                                        <span style={{ display: 'inline-flex', alignItems: 'center', color: '#f87171', marginLeft: 1 }} title="Subscription expired">
                                                            <AlertCircle size={11} strokeWidth={2.5} />
                                                        </span>
                                                    )}
                                                </span>
                                            ) : (
                                                <span className={styles.dayModalSubPill}>
                                                    Airing date confirmed
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <a
                                        href={`https://www.google.com/search?q=${encodeURIComponent(
                                            `Watch ${drop.title} ${
                                                drop.available_on ? 'on ' + drop.available_on : ''
                                            }`
                                        )}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className={styles.dayModalWatchBtn}
                                    >
                                        <ExternalLink size={13} />
                                        Watch
                                    </a>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
