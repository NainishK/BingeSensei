'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

const PAGE_ROUTE_MAP: Record<string, string> = {
    explore: '/dashboard/recommendations',
    watchlist: '/dashboard/watchlist',
    overview: '/dashboard/overview',
    subscriptions: '/dashboard/subscriptions',
    calendar: '/dashboard/calendar',
};

export default function DashboardRootPage() {
    const router = useRouter();

    useEffect(() => {
        let active = true;

        const resolveLandingRoute = async () => {
            try {
                const res = await api.get('/users/me/');
                if (!active) return;

                let pref = 'auto';
                if (res.data?.preferences) {
                    try {
                        const parsed = JSON.parse(res.data.preferences);
                        if (typeof parsed.default_landing_page === 'string') {
                            pref = parsed.default_landing_page;
                        }
                    } catch {
                        // Ignore malformed JSON
                    }
                }

                if (pref !== 'auto' && PAGE_ROUTE_MAP[pref]) {
                    router.replace(PAGE_ROUTE_MAP[pref]);
                    return;
                }

                // Smart default: show Explore if watchlist is empty, otherwise Watchlist
                const hasWatchlistItems = Array.isArray(res.data?.watchlist) && res.data.watchlist.length > 0;
                router.replace(hasWatchlistItems ? '/dashboard/watchlist' : '/dashboard/recommendations');
            } catch {
                if (active) {
                    router.replace('/dashboard/recommendations');
                }
            }
        };

        resolveLandingRoute();
        return () => {
            active = false;
        };
    }, [router]);

    return null;
}
