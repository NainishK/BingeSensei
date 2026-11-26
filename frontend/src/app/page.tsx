'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Search, Wallet, Sparkles, ChevronRight, BookmarkCheck, Calendar } from 'lucide-react';
import FeatureCarousel from '@/components/FeatureCarousel';
import AppShowcaseStack from '@/components/landing/AppShowcaseStack';
import AuthRedirect from '@/components/AuthRedirect';
import RegionPill from '@/components/landing/RegionPill';
import LandingTrendingShowcase from '@/components/landing/LandingTrendingShowcase';
import { PublicMediaItem } from '@/lib/publicTypes';
import styles from './page.module.css';

const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');

const SUPPORTED_COUNTRIES = ['US', 'IN', 'GB', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'JP', 'SG', 'PH', 'NZ', 'BR', 'MX'];

const GENRES = [
    { label: 'All', value: '' },
    { label: 'Action', value: 'action' },
    { label: 'Drama', value: 'drama' },
    { label: 'Anime', value: 'anime' },
    { label: 'Sci-Fi', value: 'scifi' },
    { label: 'Comedy', value: 'comedy' },
    { label: 'Thriller', value: 'thriller' },
];

const HERO_ROTATING_WORDS = [
    'subscriptions.',
    'watchlist.',
    'discoveries.',
    'calendar.',
    'progress.',
];

export default function Home() {
    const [region, setRegion] = useState('US');
    const [regionReady, setRegionReady] = useState(false);
    const [genre, setGenre] = useState('');
    const [trendingItems, setTrendingItems] = useState<PublicMediaItem[]>([]);
    const [trendingLoading, setTrendingLoading] = useState(true);
    const [wordState, setWordState] = useState<{ index: number; prev: number | null }>({
        index: 0,
        prev: null,
    });
    const [wordWidth, setWordWidth] = useState<number | undefined>(undefined);
    const activeWordRef = useRef<HTMLSpanElement | null>(null);

    // Cycle rotating hero focus word cleanly every 2.6s
    useEffect(() => {
        const timer = setInterval(() => {
            setWordState((s) => ({
                index: (s.index + 1) % HERO_ROTATING_WORDS.length,
                prev: s.index,
            }));
        }, 2600);
        return () => clearInterval(timer);
    }, []);

    // Keep rotating word container width smoothly matched to active word
    useEffect(() => {
        const updateWidth = () => {
            if (activeWordRef.current) {
                setWordWidth(activeWordRef.current.offsetWidth);
            }
        };
        const rafId = requestAnimationFrame(updateWidth);
        window.addEventListener('resize', updateWidth);
        return () => {
            cancelAnimationFrame(rafId);
            window.removeEventListener('resize', updateWidth);
        };
    }, [wordState.index]);

    // Feature carousel images (unchanged from current landing)
    const discoveryImages = [
        { src: '/screenshots/search.png', alt: 'Smart Search UI' },
        { src: '/screenshots/watchlist.png', alt: 'Unified Watchlist' },
        { src: '/screenshots/watchlist_item_details1.png', alt: 'Watchlist Details' },
        { src: '/screenshots/watchlist_item_details2.png', alt: 'Watchlist Details' },
        { src: '/screenshots/recommendations1.png', alt: 'Top Recommendations' },
        { src: '/screenshots/recommendations2.png', alt: 'More Recommendations' },
    ];
    const aiImages = [
        { src: '/screenshots/AI_center_profile.png', alt: 'AI Profile' },
        { src: '/screenshots/AI_center_curator_picks.png', alt: 'Curator Picks' },
        { src: '/screenshots/AI_center_smart_strategy.png', alt: 'Smart Strategy' },
    ];

    // Auto-detect region on mount
    useEffect(() => {
        const stored = localStorage.getItem('guest_region');
        if (stored) {
            setRegion(stored);
            setRegionReady(true);
            return;
        }
        fetch('https://ipinfo.io/json')
            .then(r => r.json())
            .then(data => {
                const country = (data.country || 'US').toUpperCase();
                const supported = SUPPORTED_COUNTRIES.includes(country) ? country : 'US';
                setRegion(supported);
                localStorage.setItem('guest_region', supported);
            })
            .catch(() => setRegion('US'))
            .finally(() => setRegionReady(true));
    }, []);

    // Fetch trending when region or genre changes (keep existing slides visible while fetching next category)
    useEffect(() => {
        if (!regionReady) return;
        setTrendingLoading(true);
        const params = new URLSearchParams({ region });
        if (genre) params.set('genre', genre);
        fetch(`${API_BASE}/public/trending?${params}`)
            .then(r => {
                if (!r.ok) {
                    throw new Error(`HTTP error! status: ${r.status}`);
                }
                return r.json();
            })
            .then(data => setTrendingItems(Array.isArray(data) ? data : []))
            .catch(err => {
                console.error("Home error fetching trending items from:", `${API_BASE}/public/trending`, err);
                setTrendingItems([]);
            })
            .finally(() => setTrendingLoading(false));
    }, [region, genre, regionReady]);

    const handleRegionChange = (newRegion: string) => {
        setRegion(newRegion);
        localStorage.setItem('guest_region', newRegion);
    };

    return (
        <main className={styles.main}>
            <AuthRedirect />

            {/* ── Navigation ── */}
            <nav className={styles.nav}>
                <div className={styles.brandContainer}>
                    <Image
                        src="/logo-dark-theme-final-v3.png"
                        alt="BingeSensei Logo"
                        width={160}
                        height={43}
                        className={styles.brandLogo}
                        style={{ objectFit: 'contain' }}
                        priority
                    />
                </div>
                <div className={styles.navLinks}>
                    <RegionPill region={region} onChange={handleRegionChange} />
                    <Link href="/login" className={styles.navLink}>Log In</Link>
                    <Link href="/signup" className={styles.loginBtn}>Get Started</Link>
                </div>
            </nav>

            {/* ── Full-Bleed Explore Trending Hero Spotlight (Top of Landing, no login needed) ── */}
            <LandingTrendingShowcase
                items={trendingItems}
                loading={trendingLoading}
                region={region}
                genre={genre}
                genres={GENRES}
                onGenreChange={setGenre}
            />

            {/* ── Value Proposition Hero ── */}
            <section className={styles.hero}>
                <div className={styles.heroContent}>
                    <h1 className={styles.title}>
                        <span className={styles.titleLine}>
                            <span className={styles.titleStatic}>Your&nbsp;</span>
                            <span
                                className={styles.titleRotateSlot}
                                style={{ width: wordWidth ? `${wordWidth}px` : undefined }}
                            >
                                {wordState.prev !== null && (
                                    <span
                                        key={`out-${wordState.prev}-${wordState.index}`}
                                        aria-hidden="true"
                                        className={`${styles.titleRotateWord} ${styles.titleRotateWordOut}`}
                                    >
                                        {HERO_ROTATING_WORDS[wordState.prev]}
                                    </span>
                                )}
                                <span
                                    key={`in-${wordState.index}`}
                                    ref={activeWordRef}
                                    className={`${styles.titleRotateWord} ${
                                        wordState.prev !== null ? styles.titleRotateWordIn : ''
                                    }`}
                                >
                                    {HERO_ROTATING_WORDS[wordState.index]}
                                </span>
                            </span>
                        </span>
                        <span className={styles.titleHighlight}>One unified dashboard.</span>
                    </h1>
                    <p className={styles.subtitle}>
                        Track your watchlist across every streaming service, explore what&apos;s trending
                        in your region, follow upcoming release dates, and cut forgotten subscriptions
                        before they renew.
                    </p>
                    {/* Feature highlights */}
                    <div className={styles.featurePills}>
                        <span className={styles.featurePill}><BookmarkCheck size={14} /> Unified Watchlist</span>
                        <span className={styles.featurePill}><Search size={14} /> Explore &amp; Search</span>
                        <span className={styles.featurePill}><Calendar size={14} /> Release Calendar</span>
                        <span className={styles.featurePill}><Sparkles size={14} /> Smart Picks</span>
                        <span className={styles.featurePill}><Wallet size={14} /> Kill Waste</span>
                    </div>
                    <div className={styles.ctaGroup}>
                        <Link href="/signup" className={styles.primaryBtn}>
                            Get Started Free →
                        </Link>
                        <a href="#features" className={styles.secondaryBtn}>
                            See How It Works ↓
                        </a>
                    </div>
                </div>
            </section>

            {/* ── Visual Dashboard Preview ── */}
            <section className={styles.visualSection}>
                <div className={styles.dashboardPreview}>
                    <div className={styles.browserWindow}>
                        <div className={styles.windowInner}>
                            <div className={styles.windowHeader}>
                                <div className={`${styles.windowDot} ${styles.red}`} />
                                <div className={`${styles.windowDot} ${styles.yellow}`} />
                                <div className={`${styles.windowDot} ${styles.green}`} />
                                <div className={styles.addressBar}>bingesensei.app/dashboard</div>
                            </div>
                            <div className={styles.windowContent}>
                                <Image
                                    src="/screenshots/overview.png"
                                    alt="BingeSensei Dashboard Overview"
                                    width={1200}
                                    height={800}
                                    className={styles.heroImage}
                                    priority
                                />
                            </div>
                        </div>
                        <div className={styles.floatingBadge}>
                            🚫 Stop paying for what you don't watch
                        </div>
                    </div>
                </div>
            </section>

            {/* ── Join CTA Banner ── */}
            <section className={styles.joinBanner}>
                <div className={styles.joinInner}>
                    <div className={styles.joinText}>
                        <h2 className={styles.joinTitle}>Your entire streaming life, organized.</h2>
                        <p className={styles.joinSubtitle}>
                            Build one watchlist, follow episode &amp; movie drops on your calendar, discover what to watch next, and cut what you don&apos;t watch.
                        </p>
                    </div>
                    <Link href="/signup" className={styles.joinBtn}>
                        Start for Free <ChevronRight size={18} />
                    </Link>
                </div>
            </section>

            {/* ── Feature Highlights ── */}
            <section id="features" className={styles.features}>
                <div className={styles.featureRow}>
                    <div className={styles.featureContent}>
                        <div className={styles.featureIcon}><Search size={32} color="#60a5fa" /></div>
                        <h3 className={styles.featureTitle}>Search, Track &amp; Explore.</h3>
                        <p className={styles.featureDesc}>
                            Search any show, movie, or anime across your region, save everything into
                            one watchlist, log episode progress and ratings, and explore trending hits
                            available on services you already own.
                        </p>
                    </div>
                    <div className={styles.featureVisual}>
                        <FeatureCarousel items={discoveryImages} />
                    </div>
                </div>

                <div className={`${styles.featureRow} ${styles.reversed}`}>
                    <div className={styles.featureContent}>
                        <div className={styles.featureIcon}><Sparkles size={32} color="#c084fc" /></div>
                        <h3 className={styles.featureTitle}>Curated For Your Taste.</h3>
                        <p className={styles.featureDesc}>
                            Discover what to watch next based on the titles you&apos;ve loved and services
                            you already pay for, plus clear insights into which subscriptions actually
                            deliver value each month.
                        </p>
                    </div>
                    <div className={styles.featureVisual}>
                        <FeatureCarousel items={aiImages} reverse />
                    </div>
                </div>

                <div className={styles.featureRow}>
                    <div className={styles.featureContent}>
                        <div className={styles.featureIcon}><Wallet size={32} color="#34d399" /></div>
                        <h3 className={styles.featureTitle}>Zero Waste. Never Miss a Drop.</h3>
                        <p className={styles.featureDesc}>
                            Monitor monthly spend, renewal alerts, and service utilization at a glance,
                            while tracking upcoming theatrical and streaming drops on your personal release calendar.
                        </p>
                    </div>
                    <div className={styles.featureVisual}>
                        <AppShowcaseStack />
                    </div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className={styles.footer}>
                <div className={styles.footerContainer}>
                    <div>
                        <div className={styles.footerBrand}>Binge<span>Sensei</span></div>
                        <p className={styles.footerCopyright}>
                            © {new Date().getFullYear()} BingeSensei. All rights reserved.
                        </p>
                    </div>
                    <div className={styles.footerLinks}>
                        <Link href="/privacy" className={styles.footerLink}>Privacy Policy</Link>
                        <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
                    </div>
                </div>
            </footer>
        </main>
    );
}
