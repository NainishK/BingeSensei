import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import models
import tmdb_client
import random
import time

# Estimated costs for common services (since TMDB doesn't provide this)
PROVIDER_COSTS = {
    "Netflix": 15.49,
    "Hulu": 7.99,
    "Amazon Prime Video": 14.99,
    "Disney Plus": 7.99,
    "Max": 15.99,
    "Peacock": 4.99,
    "Apple TV Plus": 6.99,
    "Paramount Plus": 5.99
}

def get_cached_data(db: Session, user_id: int, category: str, ttl_hours: int = 48):
    """Retrieve cached data if it exists. Returns immediately for instant page loads."""
    cache_entry = db.query(models.RecommendationCache).filter(
        models.RecommendationCache.user_id == user_id,
        models.RecommendationCache.category == category
    ).first()

    if cache_entry and cache_entry.data:
        try:
            data = json.loads(cache_entry.data)
            if data and isinstance(data, list) and len(data) > 0:
                return data
        except Exception:
            return None
    return None

def set_cached_data(db: Session, user_id: int, category: str, data: list):
    """Save data to cache."""
    json_data = json.dumps(data)
    cache_entry = db.query(models.RecommendationCache).filter(
        models.RecommendationCache.user_id == user_id,
        models.RecommendationCache.category == category
    ).first()
    
    if cache_entry:
        cache_entry.data = json_data
    else:
        cache_entry = models.RecommendationCache(
            user_id=user_id,
            category=category,
            data=json_data
        )
        db.add(cache_entry)
        
    cache_entry.updated_at = datetime.utcnow() # Ensure timestamp update
    db.commit()

def clear_user_cache(db: Session, user_id: int):
    """Invalidate all recommendation cache for a user."""
    db.query(models.RecommendationCache).filter(
        models.RecommendationCache.user_id == user_id
    ).delete()
    db.commit()

def refresh_recommendations(db: Session, user_id: int, force: bool = False, category: str = None):
    """
    Background task to re-calculate and cache all recommendations.
    If force is False, only refreshes if cache is missing or older than 24 hours.
    category: 'dashboard' or 'similar' (None = both)
    """
    # [FIX] Need user country to generate correct cache keys and content
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        print(f"[REFRESH] User {user_id} not found. Skipping.")
        return

    country = user.country or "US"
    print(f"--- [REFRESH] Checking recommendations for user {user_id} ({country}) (force={force}, cat={category}) ---")
    
    try:
        # 1. Refresh Dashboard (Trending/Watch Now)
        if category in [None, "dashboard"]:
            cache_key = f"dashboard_{country}"
            should_refresh = force
            if not force:
                cache_entry = db.query(models.RecommendationCache).filter(
                    models.RecommendationCache.user_id == user_id,
                    models.RecommendationCache.category == cache_key
                ).first()
                if cache_entry and cache_entry.updated_at:
                    updated_at = cache_entry.updated_at.replace(tzinfo=None) if cache_entry.updated_at.tzinfo else cache_entry.updated_at
                    if datetime.utcnow() - updated_at > timedelta(hours=24):
                        should_refresh = True
                else:
                    should_refresh = True
            
            if should_refresh:
                print(f"[REFRESH] Recalculating Dashboard ({country}) for user {user_id}...")
                dashboard_recs = calculate_dashboard_recommendations(db, user_id, country)
                set_cached_data(db, user_id, cache_key, dashboard_recs)

        # 2. Refresh Similar Content
        if category in [None, "similar"]:
            cache_key = f"similar_{country}"
            should_refresh = force
            if not force:
                cache_entry = db.query(models.RecommendationCache).filter(
                    models.RecommendationCache.user_id == user_id,
                    models.RecommendationCache.category == cache_key
                ).first()
                if cache_entry and cache_entry.updated_at:
                    updated_at = cache_entry.updated_at.replace(tzinfo=None) if cache_entry.updated_at.tzinfo else cache_entry.updated_at
                    if datetime.utcnow() - updated_at > timedelta(hours=24):
                        should_refresh = True
                else:
                    should_refresh = True
            
            if should_refresh:
                print(f"[REFRESH] Recalculating Similar Content ({country}) for user {user_id}...")
                similar_recs = calculate_similar_content(db, user_id, country)
                set_cached_data(db, user_id, cache_key, similar_recs)
        
        print(f"--- [REFRESH] Completed for user {user_id} ---")
    except Exception as e:
        print(f"[REFRESH] FATAL ERROR: {e}")
        import traceback
        traceback.print_exc()

def get_dashboard_recommendations(db: Session, user_id: int):
    """
    Fast recommendations: Watch Now (on your subs) and Cancel (unused subs).
    Tries cache first, then calculates if missing.
    """
    # Context (fetch here to key cache)
    user = db.query(models.User).filter(models.User.id == user_id).first()
    country = user.country if user and user.country else "US"
    
    cached = get_cached_data(db, user_id, f"dashboard_{country}")
    if cached:
        # Self-healing: if cached items contain legacy string formats, invalidate and recalculate!
        has_legacy_format = False
        for rec in cached:
            if rec.get("type") == "watch_now":
                for item in rec.get("items", []):
                    if isinstance(item, str):
                        has_legacy_format = True
                        break
            if has_legacy_format:
                break
        
        if not has_legacy_format:
            return cached
        else:
            print(f"[CACHE] Detected legacy string-formatted items in production cache for user {user_id}. Self-healing...")
            clear_user_cache(db, user_id)

    recs = calculate_dashboard_recommendations(db, user_id, country)
    
    if recs:
        set_cached_data(db, user_id, f"dashboard_{country}", recs)
        
    return recs

def calculate_dashboard_recommendations(db: Session, user_id: int, country: str):
    # 0. Get User Context (country is now passed in)

    # 1. Get User's Watchlist
    watchlist_query = db.query(models.WatchlistItem).filter(models.WatchlistItem.user_id == user_id).all()
    exclude_ids = {item.tmdb_id for item in watchlist_query}
    
    # TV metadata auto-repair for legacy entries (to enable progress bars and accurate math)
    for item in watchlist_query:
        if item.media_type == "tv" and (not item.total_episodes or item.total_episodes == 0):
            try:
                details = tmdb_client.get_details("tv", item.tmdb_id)
                if details:
                    item.total_seasons = details.get("number_of_seasons", 0)
                    item.total_episodes = details.get("number_of_episodes", 0)
                    db.commit()
            except Exception as e:
                print(f"[REPAIR] Failed to enrich TV details for {item.title}: {e}")

    # Filter watchlist for active content (plan_to_watch, watching, paused, and in-progress watched)
    raw_watchlist = []
    for item in watchlist_query:
        if item.status in ['plan_to_watch', 'watching', 'paused']:
            raw_watchlist.append(item)
        elif item.status == 'watched':
            # Include completed status ONLY if they have active progress they haven't finished (e.g. rewatching or partial progress)
            is_finished = (item.total_episodes and item.total_episodes > 0 and 
                           item.current_episode and item.current_episode >= item.total_episodes)
            if not is_finished:
                raw_watchlist.append(item)
                
    # Upgraded Dynamic Priority Scoring: Put active progress first, and closest to finish at the absolute top!
    def get_watchlist_priority_score(item):
        score = 0
        
        # A. Started Content Primary Boost (+100,000): Any started show goes above unstarted ones
        if item.current_episode and item.current_episode > 0:
            score += 100000
            
            # Completion gravity: bubble items nearing completion (+10,000 maximum boost)
            if item.total_episodes and item.total_episodes > 0:
                progress_ratio = item.current_episode / item.total_episodes
                score += progress_ratio * 10000
            else:
                # Baseline for unknown total episodes
                score += 2000
                
        # B. Status Secondary Boost: tie-breaker favoring watching over paused over plan_to_watch
        if item.status == "watching":
            score += 5000
        elif item.status == "paused":
            score += 2000
        elif item.status == "plan_to_watch":
            score += 1000
            
        # C. Quality Ratings: personal user ratings or TMDB scores (+1,000 maximum boost)
        if item.user_rating:
            score += item.user_rating * 100 # e.g. User rating 10 = +1000 pts
        elif item.vote_average:
            score += item.vote_average * 20 # e.g. TMDB community 8.5 = +170 pts
            
        # D. Freshness tie-breaker: favor most recently added database entries (+10 maximum)
        if item.id:
            score += item.id * 0.01
            
        return score
        
    watchlist = sorted(raw_watchlist, key=get_watchlist_priority_score, reverse=True)
    
    # 2. Get User's Active OTT Subscriptions
    subscriptions = db.query(models.Subscription).filter(
        models.Subscription.user_id == user_id,
        models.Subscription.is_active == True,
        models.Subscription.category == 'OTT',
        models.Subscription.country == country
    ).all()
    
    # Allow proceeding even without explicit subscriptions to show "Global Trending"
    if not watchlist and not subscriptions:
        pass

    # Helper to get logo
    def get_service_logo(name, user_country):
        service = db.query(models.Service).filter(
            models.Service.name == name,
            ((models.Service.country == user_country) | (models.Service.country == "US"))
        ).order_by(models.Service.country == user_country).first()
        return service.logo_url if service else None
    
    recommendations = []

    # A. "Watch Now" (Requires Subscriptions + Watchlist)
    service_watch_list = {}
    useful_subscriptions = set()
    seen_items = set() 
    for sub in subscriptions:
        service_watch_list[sub.service_name] = []

    # Map for Provider IDs
    PROVIDER_IDS_MAP = {
        "netflix": "8",
        "hulu": "15", 
        "amazon prime video": "9",
        "disney plus": "337",
        "max": "384|312",
        "peacock": "386",
        "apple tv plus": "350",
        "apple tv+": "350", # Exact match
        "paramount plus": "83|531",
        "crunchyroll": "283",
        "hotstar": "122",
        "disney+ hotstar": "122",
        "jiocinema": "220",
        "jiohotstar": "122|220"
    }

    # Process Watchlist for "Watch Now" across all active items
    from concurrent.futures import ThreadPoolExecutor

    def fetch_watchlist_item_providers(item):
        try:
            provs = tmdb_client.get_watch_providers(item.media_type, item.tmdb_id, region=country)
            return item, provs
        except Exception:
            return item, {}

    watchlist_candidates = raw_watchlist
    with ThreadPoolExecutor(max_workers=16) as executor:
        watchlist_provider_pairs = list(executor.map(fetch_watchlist_item_providers, watchlist_candidates))

    for item, providers in watchlist_provider_pairs:
        if item.title in seen_items: continue
        
        if "flatrate" in providers:
            potential_services = []
            for provider in providers["flatrate"]:
                p_name = provider["provider_name"]
                p_id = str(provider["provider_id"])
                
                for sub in subscriptions:
                    is_match = False
                    s_name_key = sub.service_name.lower()
                    mapped_ids = []
                    
                    if s_name_key in PROVIDER_IDS_MAP:
                        mapped_ids = PROVIDER_IDS_MAP[s_name_key].split("|")
                    else:
                        for k, v in PROVIDER_IDS_MAP.items():
                             if k in s_name_key or s_name_key in k:
                                 mapped_ids = v.split("|")
                                 break
                    
                    if p_id in mapped_ids: is_match = True
                    elif sub.service_name.lower() in p_name.lower() or p_name.lower() in sub.service_name.lower(): is_match = True
                        
                    if is_match: potential_services.append(sub)
            
            if potential_services:
                target_sub = min(potential_services, key=lambda s: len(service_watch_list[s.service_name]))
                useful_subscriptions.add(target_sub.id)
                
                # Precise TV season-specific progress & absolute counts calculations
                current_season_episodes = 0
                absolute_progress = 0
                progress_pct = 0
                if item.media_type == "tv":
                    try:
                        details = tmdb_client.get_details("tv", item.tmdb_id)
                        if details and "seasons" in details:
                            curr_s_num = item.current_season or 1
                            for s in details["seasons"]:
                                s_num = s.get("season_number")
                                ep_count = s.get("episode_count") or 0
                                
                                # Skip specials/Season 0 from regular progress counts
                                if s_num == 0:
                                    continue
                                    
                                if s_num < curr_s_num:
                                    absolute_progress += ep_count
                                elif s_num == curr_s_num:
                                    current_season_episodes = ep_count
                                    absolute_progress += item.current_episode or 0
                            
                            total_eps = item.total_episodes or 0
                            if total_eps > 0:
                                progress_pct = min(100, round((absolute_progress / total_eps) * 100))
                            elif current_season_episodes > 0:
                                progress_pct = min(100, round((item.current_episode / current_season_episodes) * 100))
                    except Exception as e:
                        print(f"[RECS_PROGRESS] TV metrics failed for {item.title}: {e}")

                # Local seasons cache extraction
                seasons_info = []
                if item.media_type == "tv" and details and "seasons" in details:
                    seasons_info = [
                        {"season_number": s.get("season_number"), "episode_count": s.get("episode_count") or 0}
                        for s in details.get("seasons", [])
                        if s.get("season_number", 0) > 0 # Exclude specials
                    ]

                service_watch_list[target_sub.service_name].append({
                    "id": item.tmdb_id, # Frontend MediaItem expects id to be TMDB ID
                    "dbId": item.id,     # Database ID for actions
                    "title": item.title,
                    "media_type": item.media_type,
                    "poster_path": item.poster_path,
                    "vote_average": item.vote_average,
                    "status": item.status,
                    "user_rating": item.user_rating,
                    "current_season": item.current_season,
                    "current_episode": item.current_episode,
                    "total_seasons": item.total_seasons,
                    "total_episodes": item.total_episodes,
                    "notes": item.notes,
                    # Precise TV fields
                    "current_season_episodes": current_season_episodes,
                    "absolute_episode_progress": absolute_progress,
                    "progress_pct": progress_pct,
                    "seasons": seasons_info
                })
                seen_items.add(item.title)

    for service_name, items in service_watch_list.items():
        if items:
            recommendations.append({
                "type": "watch_now",
                "service_name": service_name,
                "logo_url": get_service_logo(service_name, country),
                "items": items[:5],
                "reason": f"Included in your {service_name} subscription",
                "cost": 0, "savings": 0, "score": 100 + len(items)
            })

    # B. "Cancel Unused Subscriptions Alert" (Only subscriptions with 0 active watchlist items)
    for sub in subscriptions:
        if sub.id not in useful_subscriptions:
            recommendations.append({
                "type": "cancel",
                "service_name": sub.service_name,
                "logo_url": get_service_logo(sub.service_name, country),
                "items": [],
                "reason": "No active watchlist items found on this service",
                "cost": 0, "savings": sub.cost, "score": 50 + sub.cost,
                "billing_cycle": sub.billing_cycle
            })

    # C. "Trending" (Provider Specific OR Global)
    valid_provider_ids = set()
    for sub in subscriptions:
        key = sub.service_name.lower()
        if key in PROVIDER_IDS_MAP: valid_provider_ids.add(PROVIDER_IDS_MAP[key])
        else:
            for k, v in PROVIDER_IDS_MAP.items():
                if k in key or key in k: valid_provider_ids.add(v)
    
    provider_string = "|".join(valid_provider_ids) if valid_provider_ids else None
    
    with open("debug_recs.log", "a") as f:
        f.write(f"Provider String: {provider_string}\n")

    try:
        # Layer 1: This week's actual trending content (TMDB /trending/week)
        data_movies = tmdb_client.get_trending("movie", "week")
        data_tv = tmdb_client.get_trending("tv", "week")
        trending_movies = [{**x, "media_type": "movie"} for x in data_movies.get("results", [])[:20]]
        trending_tv    = [{**x, "media_type": "tv"}    for x in data_tv.get("results",    [])[:20]]

        # Interleave movies and TV for variety
        combined_candidates = []
        for i in range(max(len(trending_movies), len(trending_tv))):
            if i < len(trending_movies): combined_candidates.append(trending_movies[i])
            if i < len(trending_tv):    combined_candidates.append(trending_tv[i])

        with open("debug_recs.log", "a") as f:
            f.write(f"Trending week candidates: {len(combined_candidates)}\n")

        def _match_and_append(candidates, seen_titles, count):
            """Try to match each candidate against user subscriptions in parallel."""
            if not candidates or count >= 15:
                return count

            from concurrent.futures import ThreadPoolExecutor

            def fetch_candidate_provider(item):
                tmdb_id = item.get("id")
                m_type = item.get("media_type")
                provs = tmdb_client.get_watch_providers(m_type, tmdb_id, region=country)
                return item, provs

            with ThreadPoolExecutor(max_workers=8) as executor:
                candidate_pairs = list(executor.map(fetch_candidate_provider, candidates[:30]))

            for item, providers in candidate_pairs:
                if count >= 15: break
                tmdb_id = item.get("id")
                title = item.get("title") or item.get("name")
                if tmdb_id in exclude_ids: continue
                if title in seen_titles: continue

                matched_sub = None
                shuffled_subs = list(subscriptions)
                random.shuffle(shuffled_subs)

                if "flatrate" in providers:
                    flatrate_ids = [str(p["provider_id"]) for p in providers["flatrate"]]
                    for sub in shuffled_subs:
                        s_name = sub.service_name.lower().replace(" ", "")
                        matched_ids_list = []
                        for k, v in PROVIDER_IDS_MAP.items():
                            if k.replace(" ", "") in s_name:
                                matched_ids_list = v.split("|")
                                break
                        if any(pid in flatrate_ids for pid in matched_ids_list):
                            matched_sub = sub.service_name
                            break

                if not matched_sub:
                    matched_sub = "Popular Streaming"
                    if "flatrate" in providers and len(providers["flatrate"]) > 0:
                        matched_sub = f"Available on {providers['flatrate'][0]['provider_name']}"

                is_global = ("Available" in matched_sub or "Popular" in matched_sub)
                recommendations.append({
                    "type": "global_trending" if is_global else "trending",
                    "service_name": matched_sub,
                    "logo_url": get_service_logo(matched_sub.replace("Available on ", "") if "Available on " in matched_sub else matched_sub, country),
                    "items": [title],
                    "reason": "Trending This Week" if not is_global else "Trending Worldwide",
                    "cost": 0, "savings": 0,
                    "score": 95 + (item.get("popularity", 0) / 100),
                    "tmdb_id": tmdb_id,
                    "media_type": item.get("media_type"),
                    "poster_path": item.get("poster_path"),
                    "vote_average": item.get("vote_average"),
                    "overview": item.get("overview"),
                    "original_language": item.get("original_language"),
                    "genre_ids": item.get("genre_ids", [])
                })
                seen_titles.add(title)
                count += 1
            return count

        count = 0
        seen_trending_titles = set()
        print(f"[TRENDING] Pass 1: matching from /trending/week pool ({len(combined_candidates)} candidates)")
        count = _match_and_append(combined_candidates, seen_trending_titles, count)
        print(f"[TRENDING] Pass 1 result: {count} items matched from trending/week")

        # Layer 2: Fallback — if trending/week didn't yield enough for the user's region,
        # supplement with provider-filtered discover (popular content on their services)
        if count < 8 and provider_string:
            print(f"[TRENDING] Pass 2: only {count} from trending/week — supplementing with provider-filtered discover")
            fallback_movies = tmdb_client.discover_media(
                "movie", sort_by="popularity.desc", min_vote_count=300,
                with_watch_providers=provider_string, watch_region=country
            )
            fallback_tv = tmdb_client.discover_media(
                "tv", sort_by="popularity.desc", min_vote_count=300,
                with_watch_providers=provider_string, watch_region=country
            )
            fb_movies = [{**x, "media_type": "movie"} for x in fallback_movies.get("results", [])[:15]]
            fb_tv     = [{**x, "media_type": "tv"}    for x in fallback_tv.get("results",    [])[:15]]
            fallback_combined = []
            for i in range(max(len(fb_movies), len(fb_tv))):
                if i < len(fb_movies): fallback_combined.append(fb_movies[i])
                if i < len(fb_tv):    fallback_combined.append(fb_tv[i])
            count = _match_and_append(fallback_combined, seen_trending_titles, count)
            print(f"[TRENDING] Pass 2 result: {count} total items after fallback")

    except Exception as e:
        print(f"Error fetching trending: {e}")
        import traceback
        traceback.print_exc()
            
    recommendations.sort(key=lambda x: x["score"], reverse=True)
    return recommendations

def get_similar_content(db: Session, user_id: int, force_refresh: bool = False):
    """
    Recommendations: Similar content based on watched history and discovery.
    Tries cache first, then calculates if missing.
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    country = user.country if user and user.country else "US"
    
    if force_refresh:
        print(f"[RECS] Force refresh requested for user {user_id}. Invalidating cache...")
        clear_user_cache(db, user_id)
    else:
        cached = get_cached_data(db, user_id, f"similar_{country}")
        if cached is not None and len(cached) >= 4:
            return cached

    # Calculate fresh recommendations
    recs = calculate_similar_content(db, user_id, country)
    
    if recs:
        set_cached_data(db, user_id, f"similar_{country}", recs)
        
    return recs

def calculate_similar_content(db: Session, user_id: int, country: str):
    def get_service_logo(name, user_country):
        if not name: return None
        service = db.query(models.Service).filter(
            models.Service.name == name,
            ((models.Service.country == user_country) | (models.Service.country == "US"))
        ).order_by(models.Service.country == user_country).first()
        if service and service.logo_url:
            return service.logo_url
        clean_name = name.replace("Available on ", "").strip()
        slug = clean_name.lower().replace(" ", "").replace("+", "plus")
        return f"https://www.google.com/s2/favicons?sz=128&domain={slug}.com"

    watchlist = db.query(models.WatchlistItem).filter(models.WatchlistItem.user_id == user_id).all()
    subscriptions = db.query(models.Subscription).filter(
        models.Subscription.user_id == user_id,
        models.Subscription.is_active == True,
        models.Subscription.category == 'OTT',
        models.Subscription.country == country
    ).all()

    watchlist_tmdb_ids = {w.tmdb_id for w in watchlist}
    recommended_ids = set()
    recommendations = []

    # Map subscription IDs
    PROVIDER_IDS_MAP = {
        "netflix": "8",
        "hulu": "15", 
        "amazon prime video": "9",
        "amazon prime": "9",
        "prime video": "9",
        "disney plus": "337",
        "disney+": "337",
        "max": "384|312",
        "hbo max": "384|312",
        "peacock": "386",
        "apple tv plus": "350|2",
        "apple tv+": "350|2",
        "apple tv": "350|2",
        "paramount plus": "83|531",
        "paramount+": "83|531",
        "crunchyroll": "283",
        "hotstar": "122",
        "disney+ hotstar": "122",
        "jiocinema": "220",
        "jiohotstar": "122|220",
        "mubi": "11"
    }

    # Helper to resolve provider info for candidate
    def resolve_provider_info(tmdb_id: int, m_type: str):
        providers = tmdb_client.get_watch_providers(m_type, tmdb_id, region=country)
        flatrate = providers.get("flatrate", [])
        
        # 1. Try to match active user subscription
        for p in flatrate:
            p_name = p.get("provider_name", "")
            p_id = str(p.get("provider_id", ""))
            
            for sub in subscriptions:
                s_name_key = sub.service_name.lower().strip()
                mapped_ids = PROVIDER_IDS_MAP.get(s_name_key, "").split("|") if s_name_key in PROVIDER_IDS_MAP else []
                if not mapped_ids:
                    for k, v in PROVIDER_IDS_MAP.items():
                        if k in s_name_key or s_name_key in k:
                            mapped_ids = v.split("|")
                            break
                
                if p_id in mapped_ids or s_name_key in p_name.lower() or p_name.lower() in s_name_key:
                    return sub.service_name, True
                    
        # 2. Return general provider name
        if flatrate and len(flatrate) > 0:
            return flatrate[0].get("provider_name"), False
            
        return "Popular Streaming", False

    from concurrent.futures import ThreadPoolExecutor

    # --- Strategy 0: Guaranteed Active Subscriptions Pass ---
    # Guarantees high-quality recommendations for services the user actually pays for (e.g. Apple TV+, Netflix, Hotstar)
    if subscriptions:
        for sub in subscriptions:
            s_name_key = sub.service_name.lower().strip()
            p_ids = PROVIDER_IDS_MAP.get(s_name_key, "")
            if not p_ids:
                for k, v in PROVIDER_IDS_MAP.items():
                    if k in s_name_key or s_name_key in k:
                        p_ids = v
                        break
            
            if p_ids:
                for m_type in ["tv", "movie"]:
                    if len(recommendations) >= 12: break
                    try:
                        disc = tmdb_client.discover_media(
                            m_type,
                            with_watch_providers=p_ids,
                            watch_region=country,
                            sort_by="popularity.desc",
                            min_vote_count=50
                        )
                        results = disc.get("results", [])
                        random.shuffle(results)
                        for item in results[:5]:
                            t_id = item.get("id")
                            if t_id in recommended_ids or t_id in watchlist_tmdb_ids: continue
                            
                            recommendations.append({
                                "type": "discovery",
                                "service_name": sub.service_name,
                                "is_on_sub": True,
                                "logo_url": get_service_logo(sub.service_name, country),
                                "items": [item.get("title") or item.get("name")],
                                "reason": f"Top Pick on {sub.service_name}",
                                "score": 95 + item.get("vote_average", 0),
                                "tmdb_id": t_id,
                                "media_type": m_type,
                                "poster_path": item.get("poster_path"),
                                "vote_average": item.get("vote_average"),
                                "overview": item.get("overview"),
                                "original_language": item.get("original_language"),
                                "genre_ids": item.get("genre_ids", [])
                            })
                            recommended_ids.add(t_id)
                    except Exception as e:
                        print(f"[RECS] Error discovering active sub content for {sub.service_name}: {e}")

    # --- Strategy A: Similar Content to Watchlist ---
    seeds = []
    for w in watchlist:
        weight = (w.user_rating * 2) if w.user_rating else (5 if w.status == "watched" else 3)
        seeds.append((w, weight))
    seeds.sort(key=lambda x: x[1], reverse=True)
    top_seeds = [s[0] for s in seeds[:10]]
    random.shuffle(top_seeds)

    def fetch_similar_for_seed(seed):
        try:
            sim_data = tmdb_client.get_similar(seed.media_type, seed.tmdb_id)
            candidates = [c for c in sim_data.get("results", []) if c.get("vote_average", 0) >= 5.5]
            return seed, candidates
        except Exception as e:
            print(f"[RECS] Error fetching similar for seed {seed.title}: {e}")
            return seed, []

    with ThreadPoolExecutor(max_workers=8) as executor:
        sim_futures = [executor.submit(fetch_similar_for_seed, seed) for seed in top_seeds]
        seed_results = [f.result() for f in sim_futures]

    for seed, candidates in seed_results:
        if len(recommendations) >= 18: break
        random.shuffle(candidates)
        for sim in candidates:
            sim_id = sim.get("id")
            if sim_id in recommended_ids or sim_id in watchlist_tmdb_ids: continue
            
            prov_name, is_on_sub = resolve_provider_info(sim_id, seed.media_type)
            recommendations.append({
                "type": "similar",
                "service_name": prov_name,
                "is_on_sub": is_on_sub,
                "logo_url": get_service_logo(prov_name, country),
                "items": [sim.get("title") or sim.get("name")],
                "reason": f"Because you liked {seed.title}" if seed.user_rating else f"Similar to {seed.title}",
                "score": (90 if is_on_sub else 75) + sim.get("vote_average", 0),
                "tmdb_id": sim_id,
                "media_type": seed.media_type,
                "poster_path": sim.get("poster_path"),
                "vote_average": sim.get("vote_average"),
                "overview": sim.get("overview"),
                "original_language": sim.get("original_language"),
                "genre_ids": sim.get("genre_ids", [])
            })
            recommended_ids.add(sim_id)
            break

    # --- Strategy B: Interest / Genre Discovery ---
    if len(recommendations) < 20:
        from collections import Counter
        genre_counter = Counter()
        for w in watchlist:
            if w.genre_ids:
                try:
                    g_ids = json.loads(w.genre_ids) if isinstance(w.genre_ids, str) else w.genre_ids
                    if isinstance(g_ids, list):
                        genre_counter.update(g_ids)
                except: pass
        
        top_genres = [g[0] for g in genre_counter.most_common(3)] or [28, 35, 18, 16]
        
        for g_id in top_genres:
            if len(recommendations) >= 20: break
            for m_type in ["movie", "tv"]:
                if len(recommendations) >= 20: break
                try:
                    disc = tmdb_client.discover_media(m_type, with_genres=str(g_id), sort_by="popularity.desc", min_vote_count=150, watch_region=country)
                    results = disc.get("results", [])
                    random.shuffle(results)
                    for item in results[:10]:
                        t_id = item.get("id")
                        if t_id in recommended_ids or t_id in watchlist_tmdb_ids: continue
                        
                        prov_name, is_on_sub = resolve_provider_info(t_id, m_type)
                        recommendations.append({
                            "type": "discovery",
                            "service_name": prov_name,
                            "is_on_sub": is_on_sub,
                            "logo_url": get_service_logo(prov_name, country),
                            "items": [item.get("title") or item.get("name")],
                            "reason": "Recommended for your taste",
                            "score": (85 if is_on_sub else 70) + item.get("vote_average", 0),
                            "tmdb_id": t_id,
                            "media_type": m_type,
                            "poster_path": item.get("poster_path"),
                            "vote_average": item.get("vote_average"),
                            "overview": item.get("overview"),
                            "original_language": item.get("original_language"),
                            "genre_ids": item.get("genre_ids", [])
                        })
                        recommended_ids.add(t_id)
                        if len(recommendations) >= 20: break
                except Exception as e:
                    print(f"[RECS] Error discovering genre {g_id}: {e}")

    # --- Strategy C: Trending Fallback (Guarantees 20+ items) ---
    if len(recommendations) < 20:
        for m_type in ["movie", "tv"]:
            if len(recommendations) >= 24: break
            try:
                trend = tmdb_client.discover_media(m_type, sort_by="popularity.desc", min_vote_count=200, watch_region=country)
                results = trend.get("results", [])
                random.shuffle(results)
                for item in results[:15]:
                    t_id = item.get("id")
                    if t_id in recommended_ids or t_id in watchlist_tmdb_ids: continue
                    
                    prov_name, is_on_sub = resolve_provider_info(t_id, m_type)
                    recommendations.append({
                        "type": "trending",
                        "service_name": prov_name,
                        "is_on_sub": is_on_sub,
                        "logo_url": get_service_logo(prov_name, country),
                        "items": [item.get("title") or item.get("name")],
                        "reason": "Top Trending in your region",
                        "score": 60 + item.get("vote_average", 0),
                        "tmdb_id": t_id,
                        "media_type": m_type,
                        "poster_path": item.get("poster_path"),
                        "vote_average": item.get("vote_average"),
                        "overview": item.get("overview"),
                        "original_language": item.get("original_language"),
                        "genre_ids": item.get("genre_ids", [])
                    })
                    recommended_ids.add(t_id)
                    if len(recommendations) >= 24: break
            except Exception as e:
                print(f"[RECS] Error fetching trending {m_type}: {e}")

    random.shuffle(recommendations)
    return recommendations[:24]
