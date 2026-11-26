import requests
from config import settings
import json
import re
import tmdb_client
import provider_utils
import logging

# Configure logging
logger = logging.getLogger(__name__)

def _is_provider_match(user_subs, provider_names):
    # Normalize common service names
    def normalize(name):
        name = name.lower()
        replacements = {
            "amazon prime video": "prime video",
            "prime video amazon channel": "prime video",
            "disney+ hotstar": "hotstar",
            "disney plus hotstar": "hotstar",
            "jio cinema": "jiocinema",
            "hbo max": "max",
            "apple tv plus": "apple tv",
            "apple tv+": "apple tv"
        }
        for k, v in replacements.items():
            name = name.replace(k, v)
        return name.replace(" ", "").replace("+", "").replace("-", "")

    normalized_subs = {normalize(s) for s in user_subs}
    for p in provider_names:
        norm_p = normalize(p)
        if any(norm_p in s or s in norm_p for s in normalized_subs):
            return True
    return False

# Direct REST implementation to bypass SDK versioning issues and support fallback
def _call_gemini_rest(prompt: str, model_name: str = "gemini-1.5-flash"):
    if not settings.GEMINI_API_KEY:
        return None
        
    # Fallback Chain: Use validated models from user's environment
    candidates = [
        "gemini-3.1-flash-lite",  # Primary: Extremely fast 3.1 lite model, robust quota
        "gemini-2.5-flash-lite",  # Secondary: Stable 2.5 lite model, robust quota
        "gemini-2.5-flash",       # Tertiary: Standard flash model
        "gemini-3.5-flash",       # Backup: Ultra-fast 3.5 flash
        "gemini-2.0-flash",       # Fallback
        "gemini-2.0-flash-lite",  # Fallback
        "gemini-pro-latest"       # Last Resort
    ]
    
    # Remove duplicates while preserving order
    seen = set()
    unique_candidates = []
    for m in candidates:
        if m not in seen:
            unique_candidates.append(m)
            seen.add(m)
            
    last_error = None
    
    for model in unique_candidates:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={settings.GEMINI_API_KEY}"
        headers = {'Content-Type': 'application/json'}
        data = {
            "contents": [{"parts": [{"text": prompt}]}]
        }
        
        try:
            logger.info(f"Attempting AI Generation with model: {model}...")
            # Set timeout to 45s to allow sufficient time for large JSON payload generation
            response = requests.post(url, headers=headers, json=data, timeout=45)
            
            if response.status_code == 200:
                logger.info(f"Success with model: {model}")
                return response.json()
            elif response.status_code == 429:
                logger.warning(f"Quota Exceeded (429) on {model}. Trying next...")
                last_error = f"429 Quota Exceeded on {model}"
            elif response.status_code == 404:
                logger.warning(f"Model Not Found (404): {model}. Trying next...")
                last_error = f"404 Not Found: {model}"
            else:
                logger.error(f"Error {response.status_code} on {model}: {response.text}")
                last_error = f"Error {response.status_code}: {response.text}"
                
        except requests.exceptions.Timeout:
            logger.warning(f"Timeout (45s) on {model}. Trying next...")
            last_error = f"Timeout on {model}"
            
        except Exception as e:
            logger.error(f"Request Failed on {model}: {e}")
            last_error = str(e)
            
    # If all fail, raise exception to trigger frontend error handling
    if last_error:
        # If it was a quota issue effectively (all models exhausted)
        if "429" in str(last_error) or "Quota" in str(last_error):
             raise Exception("Gemini 429: Resource Exhausted (All Models)")
        raise Exception(f"AI Generation Failed (All Models used). Last Error: {last_error}")
        
    return None




_GENRE_NAME_MAP = {
    18: "Drama",
    35: "Comedy",
    80: "Crime",
    9648: "Mystery",
    53: "Thriller",
    28: "Action",
    10759: "Action & Adventure",
    878: "Sci-Fi",
    10765: "Sci-Fi & Fantasy",
    16: "Anime/Animation",
    14: "Fantasy",
    27: "Horror",
    10749: "Romance",
    99: "Documentary",
    10768: "War & Politics",
    36: "History",
    12: "Adventure",
    10751: "Family",
}

_LANGUAGE_ISO_MAP = {
    "english": "en",
    "hindi": "hi",
    "japanese": "ja",
    "korean": "ko",
    "spanish": "es",
    "french": "fr",
    "german": "de",
    "tamil": "ta",
    "telugu": "te",
    "malayalam": "ml",
    "kannada": "kn",
    "marathi": "mr",
    "bengali": "bn",
    "punjabi": "pa",
}


def _norm_title_key(title: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (title or "").lower())


def _parse_genre_ids(raw) -> list[int]:
    if not raw:
        return []
    if isinstance(raw, list):
        return [int(g) for g in raw if str(g).isdigit()]
    try:
        parsed = json.loads(str(raw))
        if isinstance(parsed, list):
            return [int(g) for g in parsed if str(g).isdigit()]
    except Exception:
        pass
    return [int(p.strip()) for p in str(raw).split(",") if p.strip().isdigit()]


def _extract_taste_profile(watchlist_seeds: list[dict] | None, preferences: dict, banned_genre_ids: set[int]):
    """Derive favorite genre weights, preferred language codes, and top watchlist seeds."""
    fav_genres: dict[int, float] = {}
    inferred_langs: dict[str, float] = {}
    ranked_seeds: list[tuple[float, dict]] = []

    for w in watchlist_seeds or []:
        rating = w.get("rating") or 0
        vote_avg = float(w.get("vote_average") or 0.0)
        status = (w.get("status") or "").lower()
        weight = 1.0
        if rating >= 8:
            weight = 3.5
        elif rating >= 6:
            weight = 2.0
        elif status == "watched":
            weight = 1.8
        elif status == "watching":
            weight = 1.5

        for gid in _parse_genre_ids(w.get("genre_ids")):
            if gid not in banned_genre_ids:
                fav_genres[gid] = fav_genres.get(gid, 0.0) + weight

        lang = (w.get("original_language") or "").lower().strip()
        if lang:
            inferred_langs[lang] = inferred_langs.get(lang, 0.0) + weight

        if w.get("tmdb_id") and w.get("media_type"):
            seed_score = (rating * 10 if rating else vote_avg * 4) + (4.0 if status in ("watched", "watching") else 0.0)
            ranked_seeds.append((seed_score, w))

    ranked_seeds.sort(key=lambda x: x[0], reverse=True)
    top_seeds = [x[1] for x in ranked_seeds[:5]]

    pref_langs: set[str] = set()
    for l_raw in preferences.get("languages") or []:
        clean = str(l_raw).lower().strip()
        iso = _LANGUAGE_ISO_MAP.get(clean, clean[:2] if len(clean) >= 2 else "")
        if iso:
            pref_langs.add(iso)
    explicit_lang_pref = bool(pref_langs)
    if not pref_langs:
        sorted_langs = sorted(inferred_langs.items(), key=lambda x: x[1], reverse=True)
        pref_langs = {lang for lang, _ in sorted_langs[:3]}

    sorted_genres = sorted(fav_genres.items(), key=lambda x: x[1], reverse=True)
    top_genre_ids = [gid for gid, _ in sorted_genres[:4]]

    return {
        "fav_genres": fav_genres,
        "top_genre_ids": top_genre_ids,
        "pref_langs": pref_langs,
        "explicit_lang_pref": explicit_lang_pref,
        "top_seeds": top_seeds,
    }


def _match_flatrate_to_active_subs(flatrate_objs: list[dict], active_sub_objs: list[dict], preferred_service: str | None = None) -> str | None:
    if preferred_service:
        for sub in active_sub_objs:
            if provider_utils.match_provider_to_service(None, preferred_service, sub.get("name", "")):
                sub_name = sub.get("name", "")
                if any(provider_utils.match_provider_to_service(p.get("provider_id"), p.get("provider_name", ""), sub_name) for p in (flatrate_objs or [])):
                    return sub_name
    for p in flatrate_objs or []:
        for sub in active_sub_objs:
            if provider_utils.match_provider_to_service(p.get("provider_id"), p.get("provider_name", ""), sub.get("name", "")):
                return sub.get("name")
    return None


def _build_regional_candidate_pools(
    active_sub_objs: list[dict],
    watchlist_seeds: list[dict] | None,
    watchlist_ids: set,
    ignored_ids: set,
    banned_genre_ids: set[int],
    preferences: dict,
    not_on_subs: list[str],
    country: str,
    coverage_summary: dict | None,
):
    """
    Build regionally verified TMDB candidate pools for `country`:
      - `on_sub_pool`: verified flatrate titles on user's active OTT subscriptions in `country`
      - `gap_pool`: verified high-rated titles on standalone unsubscribed services in `country`
    """
    import concurrent.futures
    import math

    taste = _extract_taste_profile(watchlist_seeds, preferences, banned_genre_ids)
    fav_genres = taste["fav_genres"]
    top_genre_ids = taste["top_genre_ids"]
    pref_langs = taste["pref_langs"]
    top_seeds = taste["top_seeds"]

    raw_candidates: dict[tuple[str, int], dict] = {}
    gap_candidates: dict[tuple[str, int], dict] = {}

    def _is_eligible(item_dict: dict, min_rating: float = 6.6, min_votes: int = 50) -> bool:
        tid = item_dict.get("id")
        if not tid or not item_dict.get("poster_path"):
            return False
        if tid in watchlist_ids or str(tid) in ignored_ids:
            return False
        rating = float(item_dict.get("vote_average") or 0.0)
        votes = int(item_dict.get("vote_count") or 0)
        if rating < min_rating or votes < min_votes:
            return False
        g_ids = set(item_dict.get("genre_ids") or [])
        if banned_genre_ids and g_ids.intersection(banned_genre_ids):
            return False
        return True

    def _make_candidate(item: dict, m_type: str, **extra) -> dict:
        base = {
            "tmdb_id": int(item["id"]),
            "media_type": m_type,
            "title": (item.get("title") or item.get("name") or "").strip(),
            "poster_path": item.get("poster_path"),
            "overview": item.get("overview") or "",
            "vote_average": float(item.get("vote_average") or 0.0),
            "vote_count": int(item.get("vote_count") or 0),
            "popularity": float(item.get("popularity") or 0.0),
            "genre_ids": list(item.get("genre_ids") or []),
            "original_language": (item.get("original_language") or "").lower(),
        }
        base.update(extra)
        return base

    def _bayesian_quality(cand: dict) -> float:
        r = cand["vote_average"]
        v = cand["vote_count"]
        pop = cand["popularity"]
        bayes = ((r * v) + (7.0 * 150.0)) / (v + 150.0)
        return (bayes * 10.0) + min(math.log1p(pop) * 3.5, 14.0)

    def _discover_for_service(sub_name: str, m_type: str, sort_by: str, genres_pipe: str | None = None, min_rating: float = 6.8):
        p_ids_set = provider_utils.get_provider_ids_for_service(sub_name)
        if not p_ids_set:
            return []
        min_vc = 150 if sort_by == "vote_average.desc" else 60
        try:
            res = tmdb_client.discover_media(
                m_type,
                with_genres=genres_pipe,
                sort_by=sort_by,
                min_vote_count=min_vc,
                min_vote_average=min_rating,
                with_watch_providers="|".join(sorted(p_ids_set)),
                watch_region=country,
                extra_params={"with_watch_monetization_types": "flatrate"},
            )
            return [(sub_name, m_type, r) for r in (res.get("results") or [])[:10]]
        except Exception:
            return []

    def _fetch_seed_recs(seed: dict):
        try:
            mt = seed.get("media_type")
            tid = seed.get("tmdb_id")
            if not mt or not tid:
                return []
            res = tmdb_client.get_recommendations(mt, tid).get("results") or []
            return [(seed.get("title"), mt, r) for r in res[:10] if _is_eligible(r, min_rating=6.7, min_votes=40)]
        except Exception:
            return []

    # Build unsubscribed target list (coverage gaps first, then regional standalone services)
    unsub_targets: list[str] = []
    if coverage_summary:
        for g in coverage_summary.get("top_unsubscribed_services") or []:
            nm = g.get("name")
            if nm and nm not in unsub_targets and not provider_utils.is_secondary_or_addon_provider(nm, country):
                unsub_targets.append(nm)
    for nm in not_on_subs:
        if nm not in unsub_targets and not provider_utils.is_secondary_or_addon_provider(nm, country):
            unsub_targets.append(nm)

    sub_names = [s.get("name", "") for s in active_sub_objs if s.get("name")][:6]
    genre_filter = "|".join(str(g) for g in top_genre_ids[:3]) if top_genre_ids else None

    seed_recs_raw = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        sub_futures = []
        for sn in sub_names:
            sub_futures.append(executor.submit(_discover_for_service, sn, "tv", "popularity.desc"))
            sub_futures.append(executor.submit(_discover_for_service, sn, "movie", "popularity.desc"))
            if genre_filter:
                sub_futures.append(executor.submit(_discover_for_service, sn, "tv", "vote_average.desc", genre_filter, 7.2))

        gap_futures = []
        for g_svc in unsub_targets[:4]:
            gap_futures.append(executor.submit(_discover_for_service, g_svc, "tv", "popularity.desc", None, 7.3))
            gap_futures.append(executor.submit(_discover_for_service, g_svc, "movie", "vote_average.desc", None, 7.4))

        seed_futures = [executor.submit(_fetch_seed_recs, sd) for sd in top_seeds[:4]]

        for fut in sub_futures:
            for sub_name, m_type, item in fut.result():
                if not _is_eligible(item, min_votes=60):
                    continue
                key = (m_type, int(item["id"]))
                existing = raw_candidates.get(key)
                if existing:
                    if sub_name not in existing["matched_subs"]:
                        existing["matched_subs"].append(sub_name)
                else:
                    raw_candidates[key] = _make_candidate(item, m_type, matched_subs=[sub_name], seed_title=None)

        for fut in gap_futures:
            for svc_name, m_type, item in fut.result():
                if not _is_eligible(item, min_rating=7.2, min_votes=100):
                    continue
                key = (m_type, int(item["id"]))
                if key in raw_candidates:
                    continue
                if key not in gap_candidates:
                    gap_candidates[key] = _make_candidate(item, m_type, service=svc_name, providers=[svc_name])

        for fut in seed_futures:
            seed_recs_raw.extend(fut.result())

    # Check regional watch providers in parallel for collaborative seed recommendations
    seed_to_check = []
    seen_seed_check = set()
    for seed_title, m_type, item in seed_recs_raw:
        key = (m_type, int(item["id"]))
        if key in raw_candidates:
            if not raw_candidates[key].get("seed_title"):
                raw_candidates[key]["seed_title"] = seed_title
            continue
        if key not in seen_seed_check:
            seen_seed_check.add(key)
            seed_to_check.append((seed_title, m_type, item))

    def _resolve_seed_prov(entry):
        seed_title, m_type, item = entry
        try:
            provs = tmdb_client.get_watch_providers(m_type, int(item["id"]), region=country)
            flatrate = provs.get("flatrate", []) if provs else []
            return seed_title, m_type, item, flatrate
        except Exception:
            return seed_title, m_type, item, []

    if seed_to_check:
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
            for seed_title, m_type, item, flatrate in executor.map(_resolve_seed_prov, seed_to_check[:20]):
                if not flatrate:
                    continue
                key = (m_type, int(item["id"]))
                matched_active = _match_flatrate_to_active_subs(flatrate, active_sub_objs)
                if matched_active:
                    raw_candidates[key] = _make_candidate(
                        item, m_type, matched_subs=[matched_active], seed_title=seed_title, _flatrate_objs=flatrate
                    )
                else:
                    clean_provs = provider_utils.filter_primary_providers(
                        [p.get("provider_name", "") for p in flatrate], country
                    )
                    primary_only = [p for p in clean_provs if not provider_utils.is_secondary_or_addon_provider(p, country)]
                    if primary_only and key not in gap_candidates:
                        gap_candidates[key] = _make_candidate(
                            item, m_type, service=primary_only[0], providers=primary_only, _flatrate_objs=flatrate
                        )

    # Score and diversify on_sub candidates across subscriptions
    local_in_langs = {"hi", "ta", "te", "ml", "kn", "mr", "bn"}
    for cand in raw_candidates.values():
        genre_bonus = sum(fav_genres.get(g, 0.0) for g in cand["genre_ids"])
        lang_bonus = 8.0 if cand["original_language"] in pref_langs else 0.0
        region_bonus = 5.0 if (country == "IN" and cand["original_language"] in local_in_langs and not taste["explicit_lang_pref"]) else 0.0
        seed_bonus = 20.0 if cand.get("seed_title") else 0.0
        cand["_score"] = _bayesian_quality(cand) + seed_bonus + min(genre_bonus * 2.5, 25.0) + lang_bonus + region_bonus
        cand["genre_labels"] = ", ".join(_GENRE_NAME_MAP[g] for g in cand["genre_ids"][:3] if g in _GENRE_NAME_MAP) or "Acclaimed"
        cand["service"] = cand["matched_subs"][0]

    # Round-robin pick across active subscriptions so every active sub appears in top pool
    buckets: dict[str, list[dict]] = {s: [] for s in sub_names}
    for cand in sorted(raw_candidates.values(), key=lambda c: c["_score"], reverse=True):
        placed = False
        for s in cand["matched_subs"]:
            if s in buckets:
                buckets[s].append(cand)
                placed = True
                break
        if not placed and buckets:
            first_key = next(iter(buckets))
            buckets[first_key].append(cand)

    on_sub_pool: list[dict] = []
    seen_pool_keys: set[tuple[str, int]] = set()
    round_idx = 0
    while len(on_sub_pool) < 32:
        progressed = False
        for s in sub_names:
            bucket = buckets.get(s, [])
            while bucket and (bucket[0]["media_type"], bucket[0]["tmdb_id"]) in seen_pool_keys:
                bucket.pop(0)
            if bucket:
                picked = bucket.pop(0)
                picked = dict(picked)
                picked["service"] = s
                on_sub_pool.append(picked)
                seen_pool_keys.add((picked["media_type"], picked["tmdb_id"]))
                progressed = True
                if len(on_sub_pool) >= 32:
                    break
        if not progressed:
            break
        round_idx += 1

    # Fallback score remaining candidates if buckets were sparse
    if len(on_sub_pool) < 32:
        for cand in sorted(raw_candidates.values(), key=lambda c: c["_score"], reverse=True):
            k = (cand["media_type"], cand["tmdb_id"])
            if k not in seen_pool_keys:
                on_sub_pool.append(cand)
                seen_pool_keys.add(k)
                if len(on_sub_pool) >= 32:
                    break

    for gc in gap_candidates.values():
        genre_bonus = sum(fav_genres.get(g, 0.0) for g in gc["genre_ids"])
        gc["_score"] = _bayesian_quality(gc) + min(genre_bonus * 2.5, 25.0)
        gc["genre_labels"] = ", ".join(_GENRE_NAME_MAP[g] for g in gc["genre_ids"][:3] if g in _GENRE_NAME_MAP) or "Acclaimed"

    gap_pool = sorted(gap_candidates.values(), key=lambda c: c["_score"], reverse=True)[:12]
    return on_sub_pool, gap_pool, taste


def _build_backfill_reason(cand: dict, matched_sub: str, country: str, fav_genres: dict[int, float]) -> str:
    seed_title = cand.get("seed_title")
    vote_avg = cand.get("vote_average") or 0.0
    matched_genres = [_GENRE_NAME_MAP[g] for g in (cand.get("_genre_ids") or cand.get("genre_ids") or []) if g in _GENRE_NAME_MAP and fav_genres.get(g, 0) > 0]
    if seed_title:
        return f"Recommended for fans of {seed_title} ({vote_avg:.1f}/10 TMDB) - streaming in {country} on {matched_sub}."
    if matched_genres:
        g_str = " & ".join(matched_genres[:2])
        return f"Top-rated {g_str} match ({vote_avg:.1f}/10 TMDB) streaming in {country} on {matched_sub} based on your watchlist."
    return f"Critically acclaimed pick ({vote_avg:.1f}/10 TMDB) available in {country} on your {matched_sub} subscription."


def generate_unified_insights(user_history: list, user_ratings: list, active_subs: list, preferences: dict, dropped_history: list = [], deal_breakers: list = [], ignored_titles: list = [], ignored_ids: set = set(), watchlist_ids: set = set(), country: str = "US", currency: str = "USD", coverage_summary: dict | None = None, watchlist_seeds: list[dict] | None = None):
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
        return None

    from datetime import datetime
    current_date = datetime.now().strftime("%B %Y")

    # Context
    history_text = "\n".join([f"- {h['title']} ({h['status']})" for h in user_history[-25:]])
    ratings_text = "\n".join([f"- {r['title']}: {r['rating']}/10" for r in user_ratings])
    # Parse active_subs (Handle both string list and rich object list) - deduplicate by name
    seen_sub_names = set()
    deduped_subs = []
    if active_subs and isinstance(active_subs[0], dict):
        for s in active_subs:
            if s['name'] not in seen_sub_names:
                seen_sub_names.add(s['name'])
                deduped_subs.append(s)
        subs_text = ", ".join([
            f"{s['name']} ({currency} {s.get('cost', '')}/{s.get('billing', 'monthly')})" if s.get('cost') else s['name']
            for s in deduped_subs
        ])
    else:
        for s in active_subs:
            if s not in seen_sub_names:
                seen_sub_names.add(s)
                deduped_subs.append(s)
        subs_text = ", ".join(deduped_subs)
    
    # Build regional list of well-known streaming services the user does NOT have
    regional_services_map = {
        'GB': ["NOW (Sky)", "BBC iPlayer", "ITVX Premium", "Disney+", "Apple TV+", "Paramount+", "Netflix"],
        'DE': ["WOW (Sky Deutschland)", "RTL+", "Joyn PLUS+", "Disney+", "Apple TV+", "Netflix"],
        'CA': ["Crave", "Sportsnet+", "TSN+", "Disney+", "Apple TV+", "Netflix"],
        'AU': ["BINGE", "Stan", "Kayo Sports", "Disney+", "Apple TV+", "Netflix"],
        'JP': ["U-NEXT", "Hulu Japan", "Abema Premium", "Disney+", "Apple TV+", "Netflix"],
        'PH': ["HBO GO Asia", "Viu Philippines", "iWantTFC", "Disney+", "Apple TV+", "Netflix"],
        'SG': ["mewatch", "Viu SG", "Disney+", "Apple TV+", "Netflix"],
        'NZ': ["Neon", "TVNZ+", "Disney+", "Apple TV+", "Netflix"],
        'BR': ["Globoplay", "Max", "Disney+", "Apple TV+", "Netflix"],
        'MX': ["ViX Premium", "Max", "Disney+", "Apple TV+", "Netflix"],
        'IN': ["JioHotstar", "Apple TV+", "SonyLIV", "Lionsgate Play", "Zee5", "MUBI", "Amazon Prime Video", "Netflix", "Crunchyroll"],
        'US': ["Hulu", "Max", "Paramount+", "Peacock", "Disney+", "Apple TV+", "Netflix"]
    }
    all_known_services = regional_services_map.get(country, regional_services_map['US'])
    not_on_subs = [
        svc for svc in all_known_services
        if not any(provider_utils.match_provider_to_service(None, svc, active) for active in seen_sub_names)
    ]
    not_subscribed_text = ", ".join(not_on_subs) if not_on_subs else "other standalone streaming services"
    
    pref_text = json.dumps(preferences, indent=2)
    dropped_text = "\n".join([f"- {d['title']}" for d in dropped_history])
    deal_breakers_text = ", ".join(deal_breakers)
    ignored_text = ", ".join(ignored_titles)

    coverage_context_lines = []
    if coverage_summary:
        total_spend = coverage_summary.get("total_monthly_cost", 0)
        target_budget = preferences.get("target_budget")
        coverage_context_lines.append(f"- Verified Total Monthly OTT Spend: {currency} {total_spend}/mo" + (f" (Target Budget: {currency} {target_budget}/mo)" if target_budget else ""))
        active_cov = coverage_summary.get("active_sub_coverage") or {}
        if active_cov:
            cov_parts = [
                f"{svc}: {info['active_unwatched_count']} unwatched ({info['total_covered']} total covered), cost {currency} {info['cost']}/{info['billing_cycle']}"
                for svc, info in active_cov.items()
            ]
            coverage_context_lines.append("- Verified Active Subscription Watchlist Usage:\n  " + "\n  ".join(cov_parts))
        top_gaps = coverage_summary.get("top_unsubscribed_services") or []
        if top_gaps:
            gap_parts = [
                f"{g['name']}: covers {g['count']} unwatched watchlist titles ({', '.join(g.get('titles', [])[:3])})"
                for g in top_gaps[:4]
            ]
            coverage_context_lines.append("- Verified Unsubscribed Services Covering Watchlist Gaps:\n  " + "\n  ".join(gap_parts))
    coverage_text = "\n".join(coverage_context_lines) if coverage_context_lines else "Not available"

    banned_genre_ids = provider_utils.get_deal_breaker_genre_ids(deal_breakers)
    active_sub_objs = [s for s in active_subs if isinstance(s, dict)]

    # Build verified regional TMDB candidate pools for country
    on_sub_pool, gap_pool, taste_profile = _build_regional_candidate_pools(
        active_sub_objs=active_sub_objs,
        watchlist_seeds=watchlist_seeds,
        watchlist_ids=watchlist_ids,
        ignored_ids=ignored_ids,
        banned_genre_ids=banned_genre_ids,
        preferences=preferences,
        not_on_subs=not_on_subs,
        country=country,
        coverage_summary=coverage_summary,
    )
    on_sub_by_norm = {}
    for cand in on_sub_pool:
        on_sub_by_norm.setdefault(_norm_title_key(cand["title"]), cand)
    gap_by_norm = {}
    for cand in gap_pool:
        gap_by_norm.setdefault(_norm_title_key(cand["title"]), cand)

    verified_on_sub_text = "\n".join([
        f"- {c['title']} ({c['media_type']}, lang:{c['original_language']}, TMDB {c['vote_average']:.1f}, {c['genre_labels']}) -> {c['service']}"
        + (f" [Similar to {c['seed_title']}]" if c.get("seed_title") else "")
        for c in on_sub_pool
    ]) or "None available"

    verified_gap_text = "\n".join([
        f"- {c['title']} ({c['media_type']}, TMDB {c['vote_average']:.1f}, {c['genre_labels']}) -> {c['service']}"
        for c in gap_pool
    ]) or "None available"

    region_rule = (
        f'REGIONAL CONTEXT ({country}): All availability MUST be strictly accurate for region "{country}". '
        + (
            '"JioCinema" and "Disney+ Hotstar" merged into "JioHotstar". Include strong Indian & international hits available on India OTT platforms, and NEVER suggest Amazon Prime Video / Apple TV+ add-on micro-channels or telecom bundles.'
            if country == "IN"
            else f'Prioritize mainstream standalone OTT availability in "{country}" and NEVER suggest third-party add-on channels or telecom bundles.'
        )
    )

    prompt = f"""
    Act as an elite streaming consultant and financial optimizer for a user in {country}.
    Current Date: {current_date} (Use this to filter out already released content when suggesting "Upcoming" items).
    User Currency: {currency}
    
    User Profile:
    - Region: {country}
    - Active Subscriptions: {subs_text}
    - Verified Watchlist Coverage & Spend Metrics:
    {coverage_text}
    - Watch History (DO NOT recommend these):
    {history_text}
    - Ratings:
    {ratings_text}
    - Preferences:
    {pref_text}
    - Dropped/Disliked Content:
    {dropped_text}
    - Explicit Deal Breakers (BANNED Topics/Genres): {deal_breakers_text}
    - Repetitive/Ignored Content (Avoid these, user has skipped them multiple times): {ignored_text}

    Verified {country} Streaming Catalog on User's Active Subscriptions (Guaranteed available right now in {country}):
    {verified_on_sub_text}

    Verified {country} Acclaimed Catalog on Unsubscribed Standalone Services:
    {verified_gap_text}
    
    Task: Provide a 3-part comprehensive report in STRICT JSON format:
    1. "picks": Return 10 to 12 diverse, personalized Curator Picks currently streaming in {country} on: {subs_text}. Choose primarily the strongest taste matches from the "Verified {country} Streaming Catalog on User's Active Subscriptions" list above (across MULTIPLE active services for variety), and optionally add 2-3 hidden gems you are certain stream in {country} on those subscriptions.
    2. "strategy": 1-3 Financial Actions (Cancel/Add) grounded directly in the Verified Watchlist Coverage & Spend Metrics above. Recommend Cancelling services with 0 (or minimal) unwatched watchlist titles or if spend exceeds budget; recommend Adding a standalone unsubscribed service only if it covers multiple unwatched watchlist gaps or must-watch gaps. Pay close attention to whether each subscription is monthly or yearly when mentioning savings vs total monthly spend. ALL monetary values must be in {currency}.
    3. "gaps": Return 5 acclaimed titles currently streaming in {country} ONLY on standalone services the user does NOT subscribe to ({not_subscribed_text}), drawing from the verified unsubscribed list above or high-confidence {country} exclusives. Do NOT suggest anything already streaming on {subs_text} or on add-on channels/carrier bundles.
    
    IMPORTANT RULES:
    1. QUALITY STANDARDS: Only recommend high-quality, acclaimed, or popular mainstream movies and TV series (TMDB >= 6.5). NEVER recommend obscure shorts, bonus featurettes, or unreleased titles.
    2. Use CANONICAL TITLES matching the catalog list when selected from it (e.g. "Rocket Boys", NOT "The Rocket Boys"; "Severance", NOT "Severance Season 2").
    3. Ratings mentioned in "reason" must be on a 10-star scale.
    4. {region_rule}
    5. NO DUPLICATES: Do NOT recommend any title listed in Watch History (even 'plan_to_watch').
    6. STRATEGY CONSISTENCY: Do not provide conflicting advice for the same service.
    7. FORMATTING: Output "reason" as a single clean paragraph referencing why it matches the user's ratings/tastes. Do NOT include trailing numbers, bullet points, or list indexes inside text fields.
    
    IMPORTANT ON NEGATIVE FILTERING:
    - Analyze "Dropped/Disliked" content to understand specific dislikes (e.g. "Too slow", "Bad acting").
    - DO NOT ban entire genres just because of one dropped show unless listed in "Explicit Deal Breakers".
    - Strictly exclude any content matching "Explicit Deal Breakers".
    
    Output JSON Structure:
    {{
        "picks": [ {{ "title": "...", "reason": "...", "service": "..." }} ],
        "strategy": [ {{ "action": "Cancel" or "Add", "service": "...", "reason": "...", "savings": 10.0, "billing_cycle": "monthly" or "yearly" }} ],
        "gaps": [ {{ "title": "...", "service": "...", "reason": "..." }} ]
    }}
    """
    
    response_data = _call_gemini_rest(prompt)
    if not response_data: return None
    
    data = {}
    try:
        raw_text = response_data['candidates'][0]['content']['parts'][0]['text']

        logger.info(f"AI Response Raw: {raw_text}")
        
        try:
            data = json.loads(raw_text)
        except:
            cleaned = raw_text.replace('```json', '').replace('```', '')
            data = json.loads(cleaned)
            
    except Exception as e:
        logger.error(f"Unified Parsing Failed: {e}")
        return None
        
    def _clean_text(txt):
        if not txt: return ""
        txt = re.sub(r'[\r\n]+\s*\d+(\.0)?\s*$', '', txt)
        txt = re.sub(r'\s+\d+(\.0)?\s*$', '', txt)
        return txt.strip()

    if "strategy" in data:
        for s in data["strategy"]:
            s["reason"] = _clean_text(s.get("reason", ""))
            
    if "picks" in data:
        for p in data["picks"]:
            p["reason"] = _clean_text(p.get("reason", ""))

    if "gaps" in data:
        for g in data["gaps"]:
            g["reason"] = _clean_text(g.get("reason", ""))

    def _hydrate_from_pool(item: dict, pool_cand: dict):
        item["tmdb_id"] = pool_cand["tmdb_id"]
        item["media_type"] = pool_cand["media_type"]
        item["title"] = pool_cand["title"]
        item["poster_path"] = pool_cand["poster_path"]
        item["vote_average"] = pool_cand["vote_average"]
        item["overview"] = pool_cand.get("overview") or ""
        item["_genre_ids"] = list(pool_cand.get("genre_ids") or [])
        item["_pool_service"] = pool_cand.get("service")
        if "_flatrate_objs" in pool_cand:
            item["_flatrate_objs"] = list(pool_cand["_flatrate_objs"])
        else:
            try:
                provs = tmdb_client.get_watch_providers(item["media_type"], item["tmdb_id"], region=country)
                item["_flatrate_objs"] = provs.get("flatrate", []) if provs else []
            except Exception:
                item["_flatrate_objs"] = []
        item["providers"] = provider_utils.filter_primary_providers(
            [p.get("provider_name", "") for p in item["_flatrate_objs"]] or ([pool_cand.get("service")] if pool_cand.get("service") else []),
            country,
        )

    def _enrich_or_hydrate(item: dict, pool_map: dict):
        matched_cand = pool_map.get(_norm_title_key(item.get("title", "")))
        if matched_cand:
            _hydrate_from_pool(item, matched_cand)
            return
        item["_country"] = country
        _enrich_item(item)

    # Enrich Picks and Filter Bad Ones + Backfill up to 6 diverse verified regional picks
    import concurrent.futures
    picks_input = data.get("picks") or []
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
        list(executor.map(lambda p: _enrich_or_hydrate(p, on_sub_by_norm), picks_input))

    valid_picks = []
    seen_ids = set()

    for r in picks_input:
        tid = r.get("tmdb_id")
        if not tid or not r.get("poster_path"):
            continue
        rating = r.get("vote_average", 0.0) or 0.0
        if rating < 6.0:
            logger.info(f"Skipping Pick {r.get('title')} - low/zero rating ({rating})")
            continue
        g_ids = set(r.pop("_genre_ids", []) or [])
        if banned_genre_ids and g_ids.intersection(banned_genre_ids):
            logger.info(f"Skipping Pick {r.get('title')} - matches deal breaker genres")
            continue
        if tid in watchlist_ids or str(tid) in ignored_ids or tid in seen_ids:
            continue

        flatrate_objs = r.pop("_flatrate_objs", [])
        pool_service = r.pop("_pool_service", None)
        matched_sub_name = None
        if active_sub_objs:
            matched_sub_name = _match_flatrate_to_active_subs(
                flatrate_objs,
                active_sub_objs,
                preferred_service=r.get("service") or pool_service,
            )
            # Trust regional Discover result when providers endpoint returned empty briefly
            if not matched_sub_name and pool_service and not flatrate_objs:
                for sub in active_sub_objs:
                    if provider_utils.match_provider_to_service(None, pool_service, sub.get("name", "")):
                        matched_sub_name = sub.get("name")
                        break
            if not matched_sub_name:
                logger.info(f"Skipping Pick {r.get('title')} - not streaming on active subs in {country} ({r.get('providers')})")
                continue
            r["service"] = matched_sub_name

        valid_picks.append(r)
        seen_ids.add(tid)

    # Select up to 6 picks prioritizing service variety across active subscriptions
    selected_picks: list[dict] = []
    service_counts: dict[str, int] = {}
    selected_ids: set[int] = set()

    for r in valid_picks:
        svc = r.get("service") or ""
        if service_counts.get(svc, 0) < 2:
            selected_picks.append(r)
            selected_ids.add(r["tmdb_id"])
            service_counts[svc] = service_counts.get(svc, 0) + 1
            if len(selected_picks) >= 6:
                break

    if len(selected_picks) < 6:
        for r in valid_picks:
            if r["tmdb_id"] not in selected_ids:
                svc = r.get("service") or ""
                selected_picks.append(r)
                selected_ids.add(r["tmdb_id"])
                service_counts[svc] = service_counts.get(svc, 0) + 1
                if len(selected_picks) >= 6:
                    break

    # Guarantee up to 6 verified regional picks via taste-matched backfill if Gemini yielded < 6
    if len(selected_picks) < 6 and on_sub_pool:
        unused_pool = [c for c in on_sub_pool if c["tmdb_id"] not in seen_ids and c["tmdb_id"] not in watchlist_ids and str(c["tmdb_id"]) not in ignored_ids]
        # Prefer underrepresented active subscriptions first
        unused_pool.sort(key=lambda c: (service_counts.get(c.get("service", ""), 0) >= 2, -c.get("_score", 0.0)))

        def _verify_backfill_cand(c):
            if "_flatrate_objs" in c:
                return c, c["_flatrate_objs"]
            try:
                provs = tmdb_client.get_watch_providers(c["media_type"], c["tmdb_id"], region=country)
                return c, provs.get("flatrate", []) if provs else []
            except Exception:
                return c, []

        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            for cand, flatrate in executor.map(_verify_backfill_cand, unused_pool[:12]):
                if len(selected_picks) >= 6:
                    break
                matched_sub_name = _match_flatrate_to_active_subs(
                    flatrate,
                    active_sub_objs,
                    preferred_service=cand.get("service"),
                ) if active_sub_objs else cand.get("service")
                if not matched_sub_name and not flatrate:
                    for sub in active_sub_objs:
                        if provider_utils.match_provider_to_service(None, cand.get("service", ""), sub.get("name", "")):
                            matched_sub_name = sub.get("name")
                            break
                if active_sub_objs and not matched_sub_name:
                    continue
                svc_label = matched_sub_name or cand.get("service") or "Your Subscription"
                reason = _build_backfill_reason(cand, svc_label, country, taste_profile["fav_genres"])
                pick_item = {
                    "tmdb_id": cand["tmdb_id"],
                    "media_type": cand["media_type"],
                    "title": cand["title"],
                    "poster_path": cand["poster_path"],
                    "vote_average": cand["vote_average"],
                    "overview": cand.get("overview") or "",
                    "service": svc_label,
                    "reason": reason,
                    "providers": provider_utils.filter_primary_providers(
                        [p.get("provider_name", "") for p in flatrate] or [svc_label], country
                    ),
                }
                selected_picks.append(pick_item)
                seen_ids.add(cand["tmdb_id"])
                service_counts[svc_label] = service_counts.get(svc_label, 0) + 1

    logger.info(f"Curator Picks: {len(selected_picks)} final ({len(valid_picks)} from AI, backfilled={max(0, len(selected_picks) - len(valid_picks))}).")
    data["picks"] = selected_picks[:6]
            
    # Enrich Gaps and Filter Bad Ones
    gaps_input = data.get("gaps") or []
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(lambda g: _enrich_or_hydrate(g, gap_by_norm), gaps_input))

    valid_gaps = []
    seen_gap_ids = set()

    for gap in gaps_input:
        tmdb_id = gap.get("tmdb_id")
        if not tmdb_id or not gap.get("poster_path"):
            continue
        rating = gap.get("vote_average", 0.0) or 0.0
        if rating < 6.0:
            logger.info(f"Skipping Gap {gap.get('title')} - low/zero rating ({rating})")
            continue
        g_ids = set(gap.pop("_genre_ids", []) or [])
        if banned_genre_ids and g_ids.intersection(banned_genre_ids):
            logger.info(f"Skipping Gap {gap.get('title')} - matches deal breaker genres")
            continue
        if tmdb_id in watchlist_ids or str(tmdb_id) in ignored_ids or tmdb_id in seen_gap_ids or tmdb_id in seen_ids:
            continue

        flatrate_objs = gap.pop("_flatrate_objs", [])
        gap.pop("_pool_service", None)
        if flatrate_objs:
            if _match_flatrate_to_active_subs(flatrate_objs, active_sub_objs):
                logger.info(f"Skipping Gap {gap.get('title')} - already available on user's active subscription")
                continue
            cleaned = provider_utils.filter_primary_providers(
                [p.get("provider_name", "") for p in flatrate_objs], country
            )
            primaries = [p for p in cleaned if not provider_utils.is_secondary_or_addon_provider(p, country)]
            if not primaries:
                logger.info(f"Skipping Gap {gap.get('title')} - only on secondary bundle/add-on ({cleaned})")
                continue
            gap["providers"] = primaries
            gap["service"] = primaries[0]
        elif not gap.get("providers"):
            logger.info(f"Skipping Gap {gap.get('title')} - no verified stream providers in {country}")
            continue
        else:
            cleaned = provider_utils.filter_primary_providers(gap.get("providers", []), country)
            primaries = [p for p in cleaned if not provider_utils.is_secondary_or_addon_provider(p, country)]
            if not primaries:
                continue
            gap["providers"] = primaries
            gap["service"] = primaries[0]

        valid_gaps.append(gap)
        seen_gap_ids.add(tmdb_id)

    # Backfill Gaps up to 3 from regional gap pool if fewer than 3 survived
    if len(valid_gaps) < 3 and gap_pool:
        for cand in gap_pool:
            if len(valid_gaps) >= 3:
                break
            cid = cand["tmdb_id"]
            if cid in seen_gap_ids or cid in seen_ids or cid in watchlist_ids or str(cid) in ignored_ids:
                continue
            svc = cand.get("service") or ""
            if provider_utils.is_secondary_or_addon_provider(svc, country):
                continue
            valid_gaps.append({
                "tmdb_id": cid,
                "media_type": cand["media_type"],
                "title": cand["title"],
                "poster_path": cand["poster_path"],
                "vote_average": cand["vote_average"],
                "overview": cand.get("overview") or "",
                "service": svc,
                "providers": cand.get("providers") or [svc],
                "reason": _build_backfill_reason(cand, svc, country, taste_profile["fav_genres"]),
            })
            seen_gap_ids.add(cid)

    logger.info(f"Missing Out: {len(valid_gaps)} valid gaps after filtering.")
    data["gaps"] = valid_gaps[:3]

    return data

def find_best_tmdb_candidate(title: str, hint_type: str = None, country: str = "US"):
    """
    Robustly resolves a title against TMDB by querying multiple variations,
    penalizing obscure 0-vote / 0-rating DVD extras, and rewarding popular, highly-rated titles.
    """
    if not title:
        return None

    queries = []
    # 1. Cleaned title (remove Season suffix)
    c1 = re.sub(r':\s*Season\s+\d+|\s+Season\s+\d+', '', title, flags=re.IGNORECASE).strip()
    queries.append(c1)

    # 2. Strip leading articles (The / A / An)
    c2 = re.sub(r'^(the|a|an)\s+', '', c1, flags=re.IGNORECASE).strip()
    if c2 and c2.lower() != c1.lower():
        queries.append(c2)

    # 3. Strip subtitle after colon or dash
    if ':' in c1:
        c3 = c1.split(':')[0].strip()
        if c3 and c3 not in queries:
            queries.append(c3)
    if ' - ' in c1:
        c4 = c1.split(' - ')[0].strip()
        if c4 and c4 not in queries:
            queries.append(c4)

    all_results = []
    seen = set()
    for q in queries:
        try:
            res = tmdb_client.search_multi(q).get('results', [])
            for r in res:
                rid = (r.get('media_type'), r.get('id'))
                if rid not in seen:
                    seen.add(rid)
                    all_results.append((q, r))
        except Exception as e:
            logger.warning(f"Error searching TMDB for '{q}': {e}")

    if not all_results:
        return None

    scored = []
    for q, r in all_results:
        t = (r.get('title') or r.get('name') or '').strip()
        if not t:
            continue
        pop = float(r.get('popularity', 0.0) or 0.0)
        votes = int(r.get('vote_count', 0) or 0)
        rating = float(r.get('vote_average', 0.0) or 0.0)
        has_poster = bool(r.get('poster_path'))
        m_type = r.get('media_type')

        score = 0.0
        t_lower = t.lower()
        title_lower = title.lower()
        c1_lower = c1.lower()
        c2_lower = c2.lower()

        if t_lower == title_lower or t_lower == c1_lower:
            score += 60.0
        elif t_lower == c2_lower:
            score += 50.0
        elif title_lower in t_lower or t_lower in title_lower:
            score += 25.0
        elif c2_lower in t_lower or t_lower in c2_lower:
            score += 20.0

        if hint_type and m_type == hint_type:
            score += 15.0

        if has_poster:
            score += 15.0
        else:
            score -= 20.0

        if votes >= 100:
            score += 25.0
        elif votes >= 20:
            score += 15.0
        elif votes > 0:
            score += 5.0
        else:
            score -= 40.0  # Massive penalty for 0 votes!

        if rating >= 7.0:
            score += 15.0
        elif rating >= 5.0:
            score += 5.0
        elif rating == 0.0:
            score -= 30.0  # Massive penalty for 0.0 rating!

        score += min(pop, 25.0)
        scored.append((score, r))

    scored.sort(key=lambda x: x[0], reverse=True)
    best_candidate = scored[0][1] if scored else None
    return best_candidate

def _enrich_item(item):
    """Helper to add TMDB data to an item dict with strict quality gating"""
    try:
        country = item.pop("_country", "US")
        raw_title = item.get('title', '')
        reason = item.get('reason', '').lower()

        # Infer hint type from reason text
        hint_type = None
        if any(w in reason for w in ['series', 'show', 'season', 'miniseries', 'episodes']):
            hint_type = 'tv'
        elif any(w in reason for w in ['movie', 'film', 'cinema']):
            hint_type = 'movie'

        best = find_best_tmdb_candidate(raw_title, hint_type=hint_type, country=country)

        if not best:
            return

        # Quality check: Reject if no poster or 0 votes with 0 rating
        vote_count = best.get('vote_count', 0) or 0
        vote_avg = float(best.get('vote_average', 0.0) or 0.0)
        poster = best.get('poster_path')

        if not poster or (vote_count == 0 and vote_avg == 0.0):
            logger.info(f"Rejecting low-quality TMDB match for {raw_title}: poster={bool(poster)}, votes={vote_count}")
            return

        item['tmdb_id'] = best.get('id')
        item['media_type'] = best.get('media_type', 'movie')
        item['title'] = best.get('title') or best.get('name') or raw_title
        item['poster_path'] = poster
        item['vote_average'] = vote_avg
        item['overview'] = best.get('overview')
        item['_genre_ids'] = best.get('genre_ids') or []

        # Fetch watch providers for region (flatrate, ads, free)
        try:
            providers_data = tmdb_client.get_watch_providers(item['media_type'], item['tmdb_id'], region=country)
            flatrate_list = providers_data.get('flatrate', []) if providers_data else []
            item['_flatrate_objs'] = flatrate_list
            all_provs = flatrate_list + (providers_data.get('ads', []) if providers_data else []) + (providers_data.get('free', []) if providers_data else [])
            item['providers'] = list({p['provider_name'].lower().strip() for p in all_provs if p.get('provider_name')})
        except Exception as e:
            logger.warning(f"Failed to fetch watch providers for {item['title']}: {e}")
            item['_flatrate_objs'] = []
            item['providers'] = []

        # If rating or overview is missing, try full details
        if not item['vote_average'] or not item['overview']:
            try:
                full_details = tmdb_client.get_details(item['media_type'], item['tmdb_id'])
                if full_details:
                    if full_details.get('vote_average'):
                        item['vote_average'] = full_details.get('vote_average')
                    if full_details.get('overview'):
                        item['overview'] = full_details.get('overview')
            except Exception as e:
                logger.warning(f"Failed to fetch full details: {e}")

    except Exception as e:
        logger.error(f"Enrichment Failed for {item.get('title')}: {e}")
