import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
import models
import tmdb_client
import provider_utils
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
            if data:
                if isinstance(data, list) and len(data) > 0:
                    return data
                elif isinstance(data, dict) and bool(data):
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

def get_cached_data_with_ttl(db: Session, user_id: int, category: str, ttl_hours: int = 24):
    """Retrieve cached data if it exists and is not older than ttl_hours."""
    cache_entry = db.query(models.RecommendationCache).filter(
        models.RecommendationCache.user_id == user_id,
        models.RecommendationCache.category == category
    ).first()

    if cache_entry and cache_entry.data and cache_entry.updated_at:
        updated_at = cache_entry.updated_at.replace(tzinfo=None) if cache_entry.updated_at.tzinfo else cache_entry.updated_at
        if datetime.utcnow() - updated_at <= timedelta(hours=ttl_hours):
            try:
                data = json.loads(cache_entry.data)
                if data:
                    if isinstance(data, list) and len(data) > 0:
                        return data
                    elif isinstance(data, dict) and bool(data):
                        return data
            except Exception:
                return None
    return None

def clear_user_cache(db: Session, user_id: int, include_trending: bool = False):
    """Invalidate recommendation cache for a user. Preserves 24-hour trending cache by default."""
    query = db.query(models.RecommendationCache).filter(
        models.RecommendationCache.user_id == user_id
    )
    if not include_trending:
        query = query.filter(models.RecommendationCache.category.notlike("trending_%"))
    query.delete(synchronize_session=False)
    db.commit()

def refresh_recommendations(db: Session, user_id: int, force: bool = False, force_trending: bool = False, category: str = None):
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
    print(f"--- [REFRESH] Checking recommendations for user {user_id} ({country}) (force={force}, force_trending={force_trending}, cat={category}) ---")
    
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
                dashboard_recs = calculate_dashboard_recommendations(db, user_id, country, force_trending=force_trending)
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

def calculate_dashboard_recommendations(db: Session, user_id: int, country: str, force_trending: bool = False):
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
        if not name or name.lower() == "popular streaming":
            return None
        clean_name = name.replace("Available on ", "").strip()
        canon_name = provider_utils.canonicalize_provider_name(clean_name, user_country)
        service = db.query(models.Service).filter(
            (models.Service.name == clean_name) | (models.Service.name == canon_name),
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
            seen_sub_ids = set()
            for provider in providers["flatrate"]:
                p_name = provider.get("provider_name", "")
                p_id = provider.get("provider_id")
                
                for sub in subscriptions:
                    if sub.id in seen_sub_ids:
                        continue
                    if provider_utils.match_provider_to_service(p_id, p_name, sub.service_name):
                        potential_services.append(sub)
                        seen_sub_ids.add(sub.id)
            
            if potential_services:
                # Mark EVERY subscription covering this active item as useful so shared titles don't cause false Unused alerts
                for sub in potential_services:
                    useful_subscriptions.add(sub.id)
                target_sub = min(potential_services, key=lambda s: len(service_watch_list[s.service_name]))
                
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
        valid_provider_ids.update(provider_utils.get_provider_ids_for_service(sub.service_name))
    
    provider_string = "|".join(sorted(valid_provider_ids)) if valid_provider_ids else None
    
    with open("debug_recs.log", "a") as f:
        f.write(f"Provider String: {provider_string}\n")

    # 3. Trending Content (24-hour Daily TTL Cache)
    trending_cache_key = f"trending_{country}"
    cached_trending = None if force_trending else get_cached_data_with_ttl(db, user_id, trending_cache_key, ttl_hours=24)

    if cached_trending:
        print(f"[TRENDING] Re-using 24h cached Trending content for user {user_id} ({country})")
        recommendations.extend(cached_trending)
    else:
        print(f"[TRENDING] Cache expired or forced — fetching fresh Trending content from TMDB for user {user_id} ({country})...")
        trending_list = []
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
                        for p in providers["flatrate"]:
                            p_name = p.get("provider_name", "")
                            p_id = p.get("provider_id")
                            for sub in shuffled_subs:
                                if provider_utils.match_provider_to_service(p_id, p_name, sub.service_name):
                                    matched_sub = sub.service_name
                                    break
                            if matched_sub:
                                break

                    if not matched_sub:
                        matched_sub = "Popular Streaming"
                        if "flatrate" in providers and len(providers["flatrate"]) > 0:
                            canon = provider_utils.canonicalize_provider_name(providers['flatrate'][0]['provider_name'], country)
                            matched_sub = f"Available on {canon or providers['flatrate'][0]['provider_name']}"

                    is_global = ("Available" in matched_sub or "Popular" in matched_sub)
                    trending_list.append({
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
                        "backdrop_path": item.get("backdrop_path"),
                        "release_date": item.get("release_date") or item.get("first_air_date"),
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

            # Layer 2: Fallback
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

            if trending_list:
                set_cached_data(db, user_id, trending_cache_key, trending_list)
                recommendations.extend(trending_list)

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
        if not name or name.lower() == "popular streaming":
            return None
        clean_name = name.replace("Available on ", "").strip()
        canon_name = provider_utils.canonicalize_provider_name(clean_name, user_country)
        service = db.query(models.Service).filter(
            (models.Service.name == clean_name) | (models.Service.name == canon_name),
            ((models.Service.country == user_country) | (models.Service.country == "US"))
        ).order_by(models.Service.country == user_country).first()
        if service and service.logo_url:
            return service.logo_url
        return None

    user = db.query(models.User).filter(models.User.id == user_id).first()
    preferences = {}
    if user and user.preferences:
        try:
            preferences = json.loads(user.preferences)
        except Exception:
            preferences = {}

    deal_breakers = preferences.get("deal_breakers", [])
    banned_genre_ids = provider_utils.get_deal_breaker_genre_ids(deal_breakers)
    preferred_languages = {lang.lower().strip() for lang in (preferences.get("languages") or []) if lang}

    LANG_CODE_MAP = {
        "english": "en", "hindi": "hi", "japanese": "ja", "korean": "ko",
        "spanish": "es", "french": "fr", "german": "de", "mandarin": "zh", "italian": "it",
    }
    preferred_lang_codes = {LANG_CODE_MAP[l] for l in preferred_languages if l in LANG_CODE_MAP}

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

    def _passes_filters(item_dict) -> bool:
        t_id = item_dict.get("id")
        if not t_id or t_id in recommended_ids or t_id in watchlist_tmdb_ids:
            return False
        if not item_dict.get("poster_path"):
            return False
        vote_avg = float(item_dict.get("vote_average", 0) or 0)
        vote_cnt = int(item_dict.get("vote_count", 0) or 0)
        if vote_avg < 6.0 or vote_cnt < 40:
            return False
        g_ids = set(item_dict.get("genre_ids") or [])
        if banned_genre_ids and g_ids.intersection(banned_genre_ids):
            return False
        return True

    def _quality_score(item_dict, base: float) -> float:
        vote_avg = float(item_dict.get("vote_average", 0) or 0)
        vote_cnt = int(item_dict.get("vote_count", 0) or 0)
        vote_bonus = min(vote_cnt / 400.0, 2.5)
        lang_bonus = 2.0 if item_dict.get("original_language") in preferred_lang_codes else 0.0
        return base + vote_avg + vote_bonus + lang_bonus + random.uniform(0, 1.5)

    def resolve_provider_info(tmdb_id: int, m_type: str):
        providers = tmdb_client.get_watch_providers(m_type, tmdb_id, region=country)
        flatrate = providers.get("flatrate", []) if providers else []

        for p in flatrate:
            p_name = p.get("provider_name", "")
            p_id = p.get("provider_id")
            for sub in subscriptions:
                if provider_utils.match_provider_to_service(p_id, p_name, sub.service_name):
                    return sub.service_name, True

        if flatrate:
            canon = provider_utils.canonicalize_provider_name(flatrate[0].get("provider_name", ""), country)
            return canon or flatrate[0].get("provider_name"), False

        return "Popular Streaming", False

    from concurrent.futures import ThreadPoolExecutor

    # Compute user's favorite genres cleanly (exclude dropped & low-rated items)
    from collections import Counter
    genre_counter = Counter()
    positive_watchlist = [
        w for w in watchlist
        if w.status != "dropped" and (w.user_rating is None or w.user_rating >= 6)
    ]
    for w in positive_watchlist:
        if w.genre_ids:
            try:
                g_ids = json.loads(w.genre_ids) if isinstance(w.genre_ids, str) else w.genre_ids
                if isinstance(g_ids, list):
                    weight = 3 if (w.user_rating and w.user_rating >= 8) else 1
                    for g in g_ids:
                        if g not in banned_genre_ids:
                            genre_counter[g] += weight
            except Exception:
                pass
    top_genres = [g[0] for g in genre_counter.most_common(4)] or [28, 35, 18, 16]
    top_genres_query = "|".join(str(g) for g in top_genres[:3])

    # --- Strategy A (Primary): Collaborative & Similar Matches to Loved Titles ---
    # Exclude dropped and poorly rated items so we NEVER say "Because you liked [dropped show]"
    seeds = []
    for w in positive_watchlist:
        if w.user_rating:
            weight = w.user_rating * 3
        elif w.status == "watched":
            weight = 14
        elif w.status == "watching":
            weight = 12
        else:
            weight = 8
        if w.vote_average:
            weight += w.vote_average * 0.5
        seeds.append((w, weight))
    seeds.sort(key=lambda x: x[1], reverse=True)
    top_seeds = [s[0] for s in seeds[:8]]

    def fetch_seed_matches(seed):
        candidates = []
        seen_cids = set()
        try:
            # Prefer TMDB /recommendations (co-watch collaborative matches)
            rec_data = tmdb_client.get_recommendations(seed.media_type, seed.tmdb_id)
            for c in rec_data.get("results", []):
                cid = c.get("id")
                if cid and cid not in seen_cids:
                    candidates.append(c)
                    seen_cids.add(cid)
            # Supplement with /similar if fewer than 6 quality candidates
            if len(candidates) < 6:
                sim_data = tmdb_client.get_similar(seed.media_type, seed.tmdb_id)
                for c in sim_data.get("results", []):
                    cid = c.get("id")
                    if cid and cid not in seen_cids:
                        candidates.append(c)
                        seen_cids.add(cid)
        except Exception as e:
            print(f"[RECS] Error fetching matches for seed {seed.title}: {e}")
        return seed, candidates

    if top_seeds:
        with ThreadPoolExecutor(max_workers=8) as executor:
            seed_results = list(executor.map(fetch_seed_matches, top_seeds))

        for seed, candidates in seed_results:
            valid = [c for c in candidates if _passes_filters(c)]
            valid.sort(key=lambda c: _quality_score(c, 0), reverse=True)
            taken = 0
            for sim in valid:
                sim_id = sim.get("id")
                if sim_id in recommended_ids:
                    continue
                prov_name, is_on_sub = resolve_provider_info(sim_id, seed.media_type)
                is_high_rated = bool(seed.user_rating and seed.user_rating >= 7)
                reason_text = f"Because you rated {seed.title} highly" if is_high_rated else f"Because you watched {seed.title}" if seed.status == "watched" else f"Similar to {seed.title}"
                recommendations.append({
                    "type": "similar",
                    "service_name": prov_name,
                    "is_on_sub": is_on_sub,
                    "logo_url": get_service_logo(prov_name, country),
                    "items": [sim.get("title") or sim.get("name")],
                    "reason": reason_text,
                    "score": _quality_score(sim, 92 if is_on_sub else 78),
                    "tmdb_id": sim_id,
                    "media_type": seed.media_type,
                    "poster_path": sim.get("poster_path"),
                    "vote_average": sim.get("vote_average"),
                    "overview": sim.get("overview"),
                    "original_language": sim.get("original_language"),
                    "genre_ids": sim.get("genre_ids", [])
                })
                recommended_ids.add(sim_id)
                taken += 1
                if taken >= 2 or len(recommendations) >= 14:
                    break
            if len(recommendations) >= 14:
                break

    # --- Strategy B: Personalized Top Picks on Active Subscriptions ---
    if subscriptions:
        sub_pick_cap = 0
        for sub in subscriptions:
            if sub_pick_cap >= 8 or len(recommendations) >= 20:
                break
            p_ids_set = provider_utils.get_provider_ids_for_service(sub.service_name)
            if not p_ids_set:
                continue
            p_ids = "|".join(sorted(p_ids_set))
            per_sub_count = 0
            for m_type in ["tv", "movie"]:
                if per_sub_count >= 3 or sub_pick_cap >= 8:
                    break
                try:
                    disc = tmdb_client.discover_media(
                        m_type,
                        with_genres=top_genres_query if positive_watchlist else None,
                        with_watch_providers=p_ids,
                        watch_region=country,
                        sort_by="vote_average.desc",
                        min_vote_count=150,
                        min_vote_average=6.8
                    )
                    results = [r for r in disc.get("results", []) if _passes_filters(r)]
                    results.sort(key=lambda r: _quality_score(r, 0), reverse=True)
                    for item in results[:2]:
                        t_id = item.get("id")
                        if t_id in recommended_ids:
                            continue
                        recommendations.append({
                            "type": "discovery",
                            "service_name": sub.service_name,
                            "is_on_sub": True,
                            "logo_url": get_service_logo(sub.service_name, country),
                            "items": [item.get("title") or item.get("name")],
                            "reason": f"Top Rated Match on {sub.service_name}",
                            "score": _quality_score(item, 86),
                            "tmdb_id": t_id,
                            "media_type": m_type,
                            "poster_path": item.get("poster_path"),
                            "vote_average": item.get("vote_average"),
                            "overview": item.get("overview"),
                            "original_language": item.get("original_language"),
                            "genre_ids": item.get("genre_ids", [])
                        })
                        recommended_ids.add(t_id)
                        per_sub_count += 1
                        sub_pick_cap += 1
                except Exception as e:
                    print(f"[RECS] Error discovering active sub content for {sub.service_name}: {e}")

    # --- Strategy C: Genre Exploration (Worldwide & Explore) ---
    if len(recommendations) < 22:
        for g_id in top_genres:
            if len(recommendations) >= 22:
                break
            for m_type in ["movie", "tv"]:
                if len(recommendations) >= 22:
                    break
                try:
                    disc = tmdb_client.discover_media(
                        m_type,
                        with_genres=str(g_id),
                        sort_by="popularity.desc",
                        min_vote_count=200,
                        min_vote_average=6.6,
                        watch_region=country
                    )
                    results = [r for r in disc.get("results", []) if _passes_filters(r)]
                    for item in results[:4]:
                        t_id = item.get("id")
                        if t_id in recommended_ids:
                            continue
                        prov_name, is_on_sub = resolve_provider_info(t_id, m_type)
                        recommendations.append({
                            "type": "discovery",
                            "service_name": prov_name,
                            "is_on_sub": is_on_sub,
                            "logo_url": get_service_logo(prov_name, country),
                            "items": [item.get("title") or item.get("name")],
                            "reason": "Recommended for your taste",
                            "score": _quality_score(item, 80 if is_on_sub else 68),
                            "tmdb_id": t_id,
                            "media_type": m_type,
                            "poster_path": item.get("poster_path"),
                            "vote_average": item.get("vote_average"),
                            "overview": item.get("overview"),
                            "original_language": item.get("original_language"),
                            "genre_ids": item.get("genre_ids", [])
                        })
                        recommended_ids.add(t_id)
                        if len(recommendations) >= 22:
                            break
                except Exception as e:
                    print(f"[RECS] Error discovering genre {g_id}: {e}")

    # --- Strategy D: Acclaimed Trending Fallback (Guarantees 24 quality picks for brand new users) ---
    if len(recommendations) < 24:
        for m_type in ["movie", "tv"]:
            if len(recommendations) >= 24:
                break
            try:
                trend = tmdb_client.discover_media(
                    m_type,
                    sort_by="popularity.desc",
                    min_vote_count=300,
                    min_vote_average=6.8,
                    watch_region=country
                )
                results = [r for r in trend.get("results", []) if _passes_filters(r)]
                for item in results[:10]:
                    t_id = item.get("id")
                    if t_id in recommended_ids:
                        continue
                    prov_name, is_on_sub = resolve_provider_info(t_id, m_type)
                    recommendations.append({
                        "type": "trending",
                        "service_name": prov_name,
                        "is_on_sub": is_on_sub,
                        "logo_url": get_service_logo(prov_name, country),
                        "items": [item.get("title") or item.get("name")],
                        "reason": "Acclaimed & Popular",
                        "score": _quality_score(item, 65 if is_on_sub else 55),
                        "tmdb_id": t_id,
                        "media_type": m_type,
                        "poster_path": item.get("poster_path"),
                        "vote_average": item.get("vote_average"),
                        "overview": item.get("overview"),
                        "original_language": item.get("original_language"),
                        "genre_ids": item.get("genre_ids", [])
                    })
                    recommended_ids.add(t_id)
                    if len(recommendations) >= 24:
                        break
            except Exception as e:
                print(f"[RECS] Error fetching trending fallback {m_type}: {e}")

    # Rank strictly by relevance + quality score instead of blindly shuffling everything
    recommendations.sort(key=lambda x: x["score"], reverse=True)
    return recommendations[:24]
