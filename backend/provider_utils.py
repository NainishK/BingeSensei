import re

# Comprehensive TMDB provider ID map (covers US, India, UK, EU, APAC variants)
PROVIDER_IDS_MAP = {
    "netflix": {"8", "1796"},
    "hulu": {"15"},
    "amazon prime video": {"9", "119", "10"},
    "prime video": {"9", "119", "10"},
    "amazon prime": {"9", "119", "10"},
    "disney plus": {"337"},
    "disney+": {"337"},
    "max": {"384", "312", "1899"},
    "hbo max": {"384", "312", "1899"},
    "peacock": {"386", "387"},
    "apple tv plus": {"350", "2"},
    "apple tv+": {"350", "2"},
    "apple tv": {"350", "2"},
    "paramount plus": {"83", "531", "2303"},
    "paramount+": {"83", "531", "2303"},
    "crunchyroll": {"283"},
    "hotstar": {"122"},
    "disney+ hotstar": {"122"},
    "disney plus hotstar": {"122"},
    "jiocinema": {"220"},
    "jiohotstar": {"122", "220", "2336"},
    "sonyliv": {"237"},
    "sony liv": {"237"},
    "zee5": {"232"},
    "mubi": {"11"},
    "lionsgate play": {"561", "2053", "2074"},
    "hoichoi": {"315"},
    "sun nxt": {"309"},
    "discovery+": {"510", "520", "1890"},
    "discovery plus": {"510", "520", "1890"},
    "viu": {"158"},
    "now": {"39"},
    "crave": {"230"},
    "stan": {"21"},
    "binge": {"385"},
}

# Telecom carrier bundles and prime/apple add-on micro-channels that are not standalone OTT suggestions
SECONDARY_PROVIDER_KEYS = {
    "vimoviesandtv",
    "airtelxstream",
    "airtelxstreamplay",
    "jiotv",
    "tataplay",
    "tataplaybinge",
    "moviesphere",
    "moviesphereplus",
    "animetimes",
    "animetimesamazonchannel",
    "fancode",
    "shemaroome",
    "erosnow",
}

STANDALONE_SERVICE_DEFAULTS = {
    "Lionsgate Play": {
        "domain": "lionsgateplay.com",
        "plans": {
            "IN": {"cost": 149.0, "currency": "INR", "billing_cycle": "monthly"},
        },
    },
    "MUBI": {
        "domain": "mubi.com",
        "plans": {
            "IN": {"cost": 499.0, "currency": "INR", "billing_cycle": "monthly"},
            "US": {"cost": 14.99, "currency": "USD", "billing_cycle": "monthly"},
        },
    },
    "Hoichoi": {
        "domain": "hoichoi.tv",
        "plans": {
            "IN": {"cost": 149.0, "currency": "INR", "billing_cycle": "monthly"},
        },
    },
    "Sun NXT": {
        "domain": "sunnxt.com",
        "plans": {
            "IN": {"cost": 99.0, "currency": "INR", "billing_cycle": "monthly"},
        },
    },
    "Discovery+": {
        "domain": "discoveryplus.in",
        "plans": {
            "IN": {"cost": 199.0, "currency": "INR", "billing_cycle": "yearly"},
        },
    },
    "Apple TV+": {
        "domain": "apple.com",
        "plans": {
            "IN": {"cost": 99.0, "currency": "INR", "billing_cycle": "monthly"},
            "US": {"cost": 9.99, "currency": "USD", "billing_cycle": "monthly"},
        },
    },
    "SonyLIV": {
        "domain": "sonyliv.com",
        "plans": {
            "IN": {"cost": 299.0, "currency": "INR", "billing_cycle": "monthly"},
        },
    },
}

# Canonical names for deduplicating TMDB provider tier/ad variants in UI & coverage suggestions
PROVIDER_CANONICAL_NAMES = {
    "netflix standard with ads": "Netflix",
    "netflix basic with ads": "Netflix",
    "amazon prime video": "Amazon Prime Video",
    "amazon prime video with ads": "Amazon Prime Video",
    "prime video": "Amazon Prime Video",
    "disney plus": "Disney+",
    "disney+ hotstar": "JioHotstar",
    "hotstar": "JioHotstar",
    "jiocinema": "JioHotstar",
    "jio cinema": "JioHotstar",
    "apple tv": "Apple TV+",
    "apple tv plus": "Apple TV+",
    "apple tv+": "Apple TV+",
    "apple tv amazon channel": "Apple TV+",
    "paramount plus": "Paramount+",
    "paramount+ with showtime": "Paramount+",
    "paramount plus apple tv channel": "Paramount+",
    "peacock premium": "Peacock",
    "peacock premium plus": "Peacock",
    "hbo max": "Max",
    "sony liv": "SonyLIV",
    "sonyliv": "SonyLIV",
    "lionsgate play": "Lionsgate Play",
    "lionsgate play amazon channel": "Lionsgate Play",
    "lionsgate play apple tv channel": "Lionsgate Play",
    "discovery+": "Discovery+",
    "discovery plus": "Discovery+",
    "discovery+ amazon channel": "Discovery+",
    "mubi amazon channel": "MUBI",
    "hoichoi amazon channel": "Hoichoi",
    "crunchyroll amazon channel": "Crunchyroll",
    "vi movies and tv": "Vi Movies & TV",
}

DEAL_BREAKER_GENRE_MAP = {
    "horror": {27},
    "anime": {16},
    "animation": {16},
    "kids": {10762, 10751},
    "family": {10751},
    "documentary": {99},
    "documentaries": {99},
    "reality": {10764},
    "reality tv": {10764},
    "romance": {10749},
    "romantic": {10749},
    "western": {37},
    "westerns": {37},
    "sci-fi": {878, 10765},
    "science fiction": {878, 10765},
    "fantasy": {14, 10765},
    "thriller": {53},
    "crime": {80},
    "war": {10752, 10768},
    "music": {10402},
    "musical": {10402},
    "soap": {10766},
    "talk show": {10767},
    "news": {10763},
    "action": {28, 10759},
    "comedy": {35},
    "drama": {18},
    "mystery": {9648},
}


def normalize_provider_key(name: str) -> str:
    if not name:
        return ""
    clean = name.lower().strip()
    clean = clean.replace("+", " plus ")
    clean = re.sub(r"\b(standard|basic|premium)\s+with\s+ads\b", "", clean)
    clean = re.sub(r"\bwith\s+ads\b", "", clean)
    clean = re.sub(r"\bamazon\s+channel\b", "", clean)
    clean = re.sub(r"\bapple\s+tv\s+channel\b", "", clean)
    clean = re.sub(r"[^a-z0-9]", "", clean)
    return clean


def canonicalize_provider_name(provider_name: str, country: str = "US") -> str:
    if not provider_name:
        return ""
    raw_lower = provider_name.strip().lower()
    if country != "IN" and raw_lower in {"disney plus", "disney+"}:
        return "Disney+"
    if country != "IN" and raw_lower in {"disney+ hotstar", "hotstar"}:
        return "Disney+ Hotstar"
    if raw_lower in PROVIDER_CANONICAL_NAMES:
        return PROVIDER_CANONICAL_NAMES[raw_lower]

    # Strip channel wrapper suffixes (e.g. "MUBI Apple TV Channel" -> "MUBI")
    stripped = re.sub(
        r"\s+(?:amazon|apple\s+tv|roku\s+premium)\s+channel$",
        "",
        raw_lower,
        flags=re.IGNORECASE,
    ).strip()
    if stripped in PROVIDER_CANONICAL_NAMES:
        return PROVIDER_CANONICAL_NAMES[stripped]
    if stripped != raw_lower and stripped in PROVIDER_IDS_MAP:
        return re.sub(
            r"\s+(?:amazon|apple\s+tv|roku\s+premium)\s+channel$",
            "",
            provider_name.strip(),
            flags=re.IGNORECASE,
        ).strip()
    return provider_name.strip()


def is_secondary_or_addon_provider(provider_name: str, country: str = "US") -> bool:
    """Return True for telecom bundles and Prime/Apple add-on micro-channels rather than standalone OTTs."""
    if not provider_name:
        return True
    raw_lower = provider_name.strip().lower()
    canon = canonicalize_provider_name(provider_name, country)
    canon_key = normalize_provider_key(canon)
    raw_key = normalize_provider_key(raw_lower)
    if canon_key in SECONDARY_PROVIDER_KEYS or raw_key in SECONDARY_PROVIDER_KEYS:
        return True
    # Any channel wrapper that still contains 'channel' after canonicalization (e.g. "Anime Times Amazon Channel")
    if re.search(r"\b(?:amazon|apple\s+tv|roku\s+premium)\s+channel\b", canon.lower()):
        return True
    return False


def filter_primary_providers(provider_names: list[str], country: str = "US") -> list[str]:
    """Canonicalize, deduplicate, and strip secondary bundle/add-on channel clutter from provider lists."""
    primaries: list[str] = []
    fallbacks: list[str] = []
    seen_primary: set[str] = set()
    seen_fallback: set[str] = set()

    for raw in provider_names or []:
        if not raw:
            continue
        canon = canonicalize_provider_name(raw, country)
        key = normalize_provider_key(canon)
        if not key:
            continue
        if is_secondary_or_addon_provider(raw, country):
            if key not in seen_fallback:
                seen_fallback.add(key)
                fallbacks.append(canon)
        else:
            if key not in seen_primary:
                seen_primary.add(key)
                primaries.append(canon)

    return primaries if primaries else fallbacks


def get_provider_ids_for_service(service_name: str) -> set[str]:
    if not service_name:
        return set()
    s_lower = service_name.lower().strip()
    if s_lower in PROVIDER_IDS_MAP:
        return set(PROVIDER_IDS_MAP[s_lower])
    norm = normalize_provider_key(service_name)
    for k, ids in PROVIDER_IDS_MAP.items():
        if normalize_provider_key(k) == norm:
            return set(ids)
    # Controlled alias fallbacks (whole words/tokens only)
    for k, ids in PROVIDER_IDS_MAP.items():
        k_norm = normalize_provider_key(k)
        if len(k_norm) >= 5 and (k_norm in norm or norm in k_norm):
            return set(ids)
    return set()


def match_provider_to_service(provider_id: str | int | None, provider_name: str, service_name: str) -> bool:
    """Safely check whether a TMDB provider corresponds to a user subscription service name."""
    if not service_name:
        return False
    p_id_str = str(provider_id) if provider_id is not None else ""
    sub_ids = get_provider_ids_for_service(service_name)
    if p_id_str and sub_ids and p_id_str in sub_ids:
        return True

    p_canon = normalize_provider_key(canonicalize_provider_name(provider_name))
    p_norm = normalize_provider_key(provider_name)
    s_canon = normalize_provider_key(canonicalize_provider_name(service_name))
    s_norm = normalize_provider_key(service_name)

    if not p_norm or not s_norm:
        return False
    if p_norm == s_norm or (p_canon and p_canon == s_canon):
        return True

    # Avoid tiny-token substring false positives (e.g. "max" matching "cinema")
    if len(s_norm) >= 5 and (s_norm in p_norm or p_norm in s_norm):
        return True
    if len(s_canon) >= 5 and (s_canon in p_canon or p_canon in s_canon):
        return True

    return False


def get_deal_breaker_genre_ids(deal_breakers: list[str] | None) -> set[int]:
    banned = set()
    if not deal_breakers:
        return banned
    for db_term in deal_breakers:
        clean = (db_term or "").lower().strip()
        if not clean:
            continue
        for key, gids in DEAL_BREAKER_GENRE_MAP.items():
            if key in clean or clean in key:
                banned.update(gids)
    return banned


def calculate_coverage_report(db, subs, watchlist, country: str, convert_to_usd_fn):
    """
    Compute accurate watchlist coverage, unused/active counts, orphaned items, and suggested services
    using real regional TMDB flatrate providers across ALL services (no single-provider truncation).
    Excludes dropped items from coverage utility, and excludes both dropped and finished watched items
    from unsubscribed service suggestions.
    """
    from collections import defaultdict
    from concurrent.futures import ThreadPoolExecutor
    from sqlalchemy import desc
    import models
    import tmdb_client

    active_watchlist = [w for w in watchlist if (w.status or "").lower() != "dropped"]
    total_watchlist = len(active_watchlist)

    def classify_item(item) -> str:
        genre_ids = str(item.genre_ids or "")
        is_animation = "16" in genre_ids
        is_japanese = item.original_language == "ja"
        if item.media_type == "movie":
            return "movie"
        if is_japanese and is_animation:
            return "anime"
        if item.media_type == "tv":
            return "tv"
        return "other"

    AVG_EPISODE_DURATION = {"movie": 120, "tv": 42, "anime": 22, "other": 42}
    DEFAULT_SERIES_EPISODES = {"tv": 40, "anime": 26, "other": 20}

    def estimate_hours(item, content_type: str) -> float:
        if content_type == "movie":
            return round(AVG_EPISODE_DURATION["movie"] / 60, 1)
        eps = item.total_episodes or 0
        seasons = item.total_seasons or 0
        if eps > 0:
            episode_count = eps
        elif seasons > 0:
            episode_count = seasons * 12
        else:
            episode_count = DEFAULT_SERIES_EPISODES.get(content_type, 20)
        return round((episode_count * AVG_EPISODE_DURATION[content_type]) / 60, 1)

    classified = {}
    for item in active_watchlist:
        ct = classify_item(item)
        classified[item.id] = {"type": ct, "hours": estimate_hours(item, ct)}

    # Fetch regional TMDB providers for active watchlist items in parallel (12h TTL cached)
    def fetch_item_providers(item):
        try:
            provs = tmdb_client.get_watch_providers(item.media_type, item.tmdb_id, region=country)
            return item.id, provs.get("flatrate", []) if provs else []
        except Exception:
            return item.id, []

    item_flatrate_map: dict[int, list[dict]] = {}
    if active_watchlist:
        with ThreadPoolExecutor(max_workers=8) as executor:
            for item_id, flatrate in executor.map(fetch_item_providers, active_watchlist):
                item_flatrate_map[item_id] = flatrate

    # Map each item to ALL matching user subscriptions & unsubscribed canonical providers
    item_matched_subs: dict[int, set[int]] = {}
    item_unsub_providers: dict[int, list[str]] = {}

    for item in active_watchlist:
        flatrate = item_flatrate_map.get(item.id, [])
        matched_sub_ids: set[int] = set()
        unsub_names: list[str] = []
        seen_unsub_keys: set[str] = set()

        if flatrate:
            for p in flatrate:
                p_name = p.get("provider_name", "")
                p_id = p.get("provider_id")
                matched_any = False
                for sub in subs:
                    if match_provider_to_service(p_id, p_name, sub.service_name):
                        matched_sub_ids.add(sub.id)
                        matched_any = True
                if not matched_any and p_name:
                    canon = canonicalize_provider_name(p_name, country)
                    c_key = normalize_provider_key(canon)
                    if c_key and c_key not in seen_unsub_keys:
                        seen_unsub_keys.add(c_key)
                        unsub_names.append(canon)
        elif item.available_on:
            # Offline fallback when TMDB has no cached flatrate info
            for raw in [s.strip() for s in item.available_on.split(",") if s.strip()]:
                matched_any = False
                for sub in subs:
                    if match_provider_to_service(None, raw, sub.service_name):
                        matched_sub_ids.add(sub.id)
                        matched_any = True
                if not matched_any:
                    canon = canonicalize_provider_name(raw, country)
                    c_key = normalize_provider_key(canon)
                    if c_key and c_key not in seen_unsub_keys:
                        seen_unsub_keys.add(c_key)
                        unsub_names.append(canon)

        item_matched_subs[item.id] = matched_sub_ids
        item_unsub_providers[item.id] = unsub_names

    def get_monthly_cost(sub) -> float:
        cost = sub.cost or 0.0
        if sub.billing_cycle and "year" in sub.billing_cycle.lower():
            return round(cost / 12, 2)
        return cost

    services_data = []
    active_queue_counts: dict[str, dict] = {}

    for sub in subs:
        monthly_cost = get_monthly_cost(sub)
        breakdown = {
            "movie":  {"count": 0, "est_hours": 0.0},
            "tv":     {"count": 0, "est_hours": 0.0},
            "anime":  {"count": 0, "est_hours": 0.0},
            "other":  {"count": 0, "est_hours": 0.0},
        }
        active_titles = []

        for item in active_watchlist:
            if sub.id in item_matched_subs.get(item.id, set()):
                ct = classified[item.id]["type"]
                hrs = classified[item.id]["hours"]
                breakdown[ct]["count"] += 1
                breakdown[ct]["est_hours"] = round(breakdown[ct]["est_hours"] + hrs, 1)
                if item.status in ("plan_to_watch", "watching", "paused"):
                    active_titles.append(item.title)

        total_covered = sum(v["count"] for v in breakdown.values())
        total_hours = round(sum(v["est_hours"] for v in breakdown.values()), 1)
        coverage_pct = round((total_covered / total_watchlist * 100) if total_watchlist > 0 else 0)
        type_count = sum(1 for v in breakdown.values() if v["count"] > 0)

        hour_score = min((total_hours / 300) * 55, 55)
        title_score = min(coverage_pct * 0.25, 25)
        variety_bonus = 20 if type_count >= 2 else 0
        raw_utility = hour_score + title_score + variety_bonus

        cost_usd = convert_to_usd_fn(monthly_cost, country)
        cost_penalty = min(cost_usd * 1.5, 20.0)
        value_score = round(max(10, raw_utility - cost_penalty)) if total_covered > 0 else 0

        cost_per_title = round(monthly_cost / total_covered, 2) if total_covered > 0 else None
        cost_per_hour = round(monthly_cost / total_hours, 2) if total_hours > 0 else None

        active_queue_counts[sub.service_name] = {
            "total_covered": total_covered,
            "active_unwatched_count": len(active_titles),
            "sample_titles": active_titles[:4],
            "monthly_cost": monthly_cost,
            "cost": sub.cost or 0.0,
            "billing_cycle": sub.billing_cycle or "monthly",
        }

        services_data.append({
            "name": sub.service_name,
            "cost": sub.cost or 0.0,
            "billing_cycle": sub.billing_cycle,
            "logo_url": getattr(sub, "logo_url", None),
            "coverage_pct": coverage_pct,
            "value_score": value_score,
            "type_count": type_count,
            "breakdown": breakdown,
            "total_covered": total_covered,
            "total_hours": total_hours,
            "cost_per_title": cost_per_title,
            "cost_per_hour": cost_per_hour,
        })

    services_data.sort(key=lambda s: (s["total_covered"] > 0, s["value_score"]), reverse=True)

    # Orphaned titles (uncovered by any active subscription)
    orphaned = []
    for item in active_watchlist:
        if not item_matched_subs.get(item.id):
            ct = classified[item.id]["type"]
            unsub = item_unsub_providers.get(item.id, [])
            orphaned.append({
                "tmdb_id": item.tmdb_id,
                "dbId": item.id,
                "title": item.title,
                "media_type": item.media_type,
                "poster_path": item.poster_path,
                "vote_average": item.vote_average,
                "overview": item.overview,
                "status": item.status,
                "est_hours": classified[item.id]["hours"],
                "content_type": ct,
                "suggested_service": unsub[0] if unsub else None,
                "original_language": item.original_language,
                "genre_ids": item.genre_ids,
            })

    # Suggested services ONLY from unwatched uncovered items (so users don't pay for things they already watched)
    unwatched_uncovered = [
        item for item in active_watchlist
        if not item_matched_subs.get(item.id) and item.status in ("plan_to_watch", "watching", "paused")
    ]
    unwatched_total = sum(1 for item in active_watchlist if item.status in ("plan_to_watch", "watching", "paused"))

    suggested_map = defaultdict(lambda: {
        "count": 0, "hours": 0.0, "titles": [], "types": set(),
        "breakdown": {
            "movie": {"count": 0, "est_hours": 0.0},
            "tv":    {"count": 0, "est_hours": 0.0},
            "anime": {"count": 0, "est_hours": 0.0},
            "other": {"count": 0, "est_hours": 0.0},
        }
    })

    for item in unwatched_uncovered:
        unsub = item_unsub_providers.get(item.id, [])
        ct = classified[item.id]["type"]
        hrs = classified[item.id]["hours"]
        for svc_name in unsub:
            if is_secondary_or_addon_provider(svc_name, country):
                continue
            suggested_map[svc_name]["count"] += 1
            suggested_map[svc_name]["hours"] = round(suggested_map[svc_name]["hours"] + hrs, 1)
            suggested_map[svc_name]["types"].add(ct)
            suggested_map[svc_name]["breakdown"][ct]["count"] += 1
            suggested_map[svc_name]["breakdown"][ct]["est_hours"] = round(
                suggested_map[svc_name]["breakdown"][ct]["est_hours"] + hrs, 1
            )
            if item.title not in suggested_map[svc_name]["titles"]:
                suggested_map[svc_name]["titles"].append(item.title)

    # Preload DB services once for fuzzy logo & plan matching
    all_db_services = db.query(models.Service).filter(models.Service.category == "OTT").all()

    suggested_services = []
    for svc_name, info in sorted(suggested_map.items(), key=lambda x: (-x[1]["count"], -x[1]["hours"])):
        if info["count"] < 1:
            continue
        logo_url = None
        cheapest_plan = None

        # Match DB Service record with alias support and country priority
        matched_records = [
            s for s in all_db_services
            if match_provider_to_service(None, svc_name, s.name)
        ]
        matched_records.sort(key=lambda s: (s.country == country, s.country == "US"), reverse=True)
        service_record = matched_records[0] if matched_records else None

        if service_record:
            logo_url = service_record.logo_url
            plans = db.query(models.Plan).filter(
                models.Plan.service_id == service_record.id,
                models.Plan.country == country,
            ).all()
            if not plans:
                plans = db.query(models.Plan).filter(
                    models.Plan.service_id == service_record.id,
                ).all()
            if plans:
                def monthly_equiv(p):
                    return p.cost / 12 if p.billing_cycle and "year" in p.billing_cycle.lower() else p.cost
                best = min(plans, key=monthly_equiv)
                cheapest_plan = {
                    "cost": best.cost,
                    "currency": best.currency,
                    "billing_cycle": best.billing_cycle,
                }

        meta_fallback = STANDALONE_SERVICE_DEFAULTS.get(svc_name)
        if meta_fallback:
            if not logo_url and meta_fallback.get("domain"):
                logo_url = f"https://www.google.com/s2/favicons?sz=128&domain={meta_fallback['domain']}"
            if not cheapest_plan and meta_fallback.get("plans", {}).get(country):
                cheapest_plan = dict(meta_fallback["plans"][country])

        denom = unwatched_total if unwatched_total > 0 else total_watchlist
        s_coverage_pct = round((info["count"] / denom * 100) if denom > 0 else 0)
        s_total_hours = info["hours"]
        s_type_count = len(info["types"])
        s_hour_score = min((s_total_hours / 300) * 55, 55)
        s_title_score = min(s_coverage_pct * 0.25, 25)
        s_variety_bonus = 20 if s_type_count >= 2 else 0
        s_raw_utility = s_hour_score + s_title_score + s_variety_bonus
        s_monthly_cost = 0.0
        if cheapest_plan:
            s_monthly_cost = (
                cheapest_plan["cost"] / 12
                if cheapest_plan["billing_cycle"] and "year" in cheapest_plan["billing_cycle"].lower()
                else cheapest_plan["cost"]
            )
        s_cost_usd = convert_to_usd_fn(s_monthly_cost, country)
        s_cost_penalty = min(s_cost_usd * 1.5, 20.0)
        s_value_score = round(max(10, s_raw_utility - s_cost_penalty))
        s_cost_per_title = round(s_monthly_cost / info["count"], 2) if info["count"] > 0 and s_monthly_cost > 0 else None
        s_cost_per_hour = round(s_monthly_cost / s_total_hours, 2) if s_total_hours > 0 and s_monthly_cost > 0 else None

        suggested_services.append({
            "name": svc_name,
            "logo_url": logo_url,
            "count": info["count"],
            "est_hours": info["hours"],
            "coverage_pct": s_coverage_pct,
            "breakdown": info["breakdown"],
            "titles": info["titles"][:5],
            "cheapest_plan": cheapest_plan,
            "value_score": s_value_score,
            "cost_per_title": s_cost_per_title,
            "cost_per_hour": s_cost_per_hour,
        })

    # Re-sort suggested services by count first, then value_score
    suggested_services.sort(key=lambda s: (s["count"], s["value_score"]), reverse=True)

    total_monthly_cost = round(sum(get_monthly_cost(s) for s in subs), 2)
    total_covered = sum(1 for item in active_watchlist if item_matched_subs.get(item.id))
    total_covered_hours = round(sum(
        classified[item.id]["hours"]
        for item in active_watchlist if item_matched_subs.get(item.id)
    ), 1)
    overall_pct = round((total_covered / total_watchlist * 100) if total_watchlist > 0 else 0)

    most_valuable = services_data[0]["name"] if services_data and services_data[0]["total_covered"] > 0 else None
    least_used = min(services_data, key=lambda s: (s["total_covered"], s["value_score"]))["name"] if services_data else None

    return {
        "services": services_data,
        "orphaned_items": orphaned,
        "suggested_services": suggested_services,
        "summary": {
            "total_monthly_cost": total_monthly_cost,
            "total_covered": total_covered,
            "total_watchlist": total_watchlist,
            "overall_coverage_pct": overall_pct,
            "total_covered_hours": total_covered_hours,
            "most_valuable_service": most_valuable,
            "least_used_service": least_used,
        },
        "_active_queue_counts": active_queue_counts,
    }

