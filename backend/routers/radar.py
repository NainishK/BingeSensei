from fastapi import APIRouter, Depends, HTTPException, status, Query, BackgroundTasks, Request
from sqlalchemy.orm import Session
from datetime import date, datetime, timedelta
import calendar
import json
import logging

import models
import schemas
import tmdb_client
from database import get_db
from dependencies import get_current_user
from limiter import limiter

logger = logging.getLogger("radar_router")

router = APIRouter(
    prefix="/watchlist",
    tags=["Release Radar & Calendar"]
)

def is_provider_in_subs(available_on: str | None, active_services: set[str]) -> bool:
    if not available_on or not active_services:
        return False
    avail_lower = available_on.lower()
    for s in active_services:
        if s in avail_lower or avail_lower in s:
            return True
    return False

def get_sub_status(sub: models.Subscription, today: date) -> tuple[str, int | None]:
    """Calculate subscription status: 'active', 'due_soon', or 'expired'."""
    if not sub.is_active:
        diff_days = (sub.next_billing_date - today).days if sub.next_billing_date else None
        return "expired", diff_days
    if not sub.next_billing_date:
        return "active", None
    diff_days = (sub.next_billing_date - today).days
    if diff_days < 0:
        return "expired", diff_days
    elif diff_days <= 7:
        return "due_soon", diff_days
    else:
        return "active", diff_days

def get_provider_sub_status(
    available_on: str | None,
    service_status_map: dict[str, tuple[str, int | None, models.Subscription]]
) -> tuple[str, int | None, models.Subscription | None]:
    """
    Returns (status, days_left, subscription) where status is 'active', 'due_soon', 'expired', or 'none'.
    """
    if not available_on or not service_status_map:
        return "none", None, None
    avail_lower = available_on.lower().strip()
    for s_name, (st, days, sub_obj) in service_status_map.items():
        if s_name in avail_lower or avail_lower in s_name:
            return st, days, sub_obj
    return "none", None, None

def sync_show_release_info(db: Session, item: models.WatchlistItem):
    """Sync single TV show's release metadata from TMDB."""
    if item.media_type != "tv":
        return
    try:
        data = tmdb_client.get_tv_release_data(item.tmdb_id)
        if not data:
            return
        
        item.air_status = data.get("status")
        if data.get("total_seasons"):
            item.total_seasons = data["total_seasons"]
        if data.get("total_episodes"):
            item.total_episodes = data["total_episodes"]
        if data.get("poster_path") and not item.poster_path:
            item.poster_path = data["poster_path"]

        # Parse last air date
        last_air_str = data.get("last_air_date")
        if last_air_str:
            try:
                item.last_air_date = datetime.strptime(last_air_str, "%Y-%m-%d").date()
            except Exception:
                pass
        item.last_episode_season = data.get("last_episode_season")
        item.last_episode_number = data.get("last_episode_number")
        item.last_episode_name = data.get("last_episode_name")
        item.last_episode_still = data.get("last_episode_still")

        # Parse next air date
        next_air_str = data.get("next_air_date")
        if next_air_str:
            try:
                item.next_air_date = datetime.strptime(next_air_str, "%Y-%m-%d").date()
            except Exception:
                item.next_air_date = None
        else:
            item.next_air_date = None
            
        item.next_episode_season = data.get("next_episode_season")
        item.next_episode_number = data.get("next_episode_number")
        item.next_episode_name = data.get("next_episode_name")

        item.last_air_check = datetime.utcnow()
        db.commit()
    except Exception as e:
        logger.error(f"Error syncing release info for tmdb_id {item.tmdb_id}: {e}")

def sync_user_radar(db: Session, user_id: int, force: bool = False):
    """Syncs release info for followed and active TV shows."""
    cutoff = datetime.utcnow() - timedelta(hours=18)
    query = db.query(models.WatchlistItem).filter(
        models.WatchlistItem.user_id == user_id,
        models.WatchlistItem.media_type == "tv"
    )
    shows = query.all()
    for show in shows:
        should_sync = show.is_followed or show.status in ["watching", "watched", "plan_to_watch", "paused"]
        if not should_sync:
            continue
        if force or not show.last_air_check or show.last_air_check < cutoff:
            sync_show_release_info(db, show)

def bg_sync_user_radar(user_id: int, force: bool = False):
    """Dedicated background task worker with isolated DB session."""
    from database import SessionLocal
    bg_db = SessionLocal()
    try:
        sync_user_radar(bg_db, user_id, force)
    except Exception as e:
        logger.error(f"Error in bg_sync_user_radar for user {user_id}: {e}")
    finally:
        bg_db.close()

def get_user_radar_settings(user: models.User) -> schemas.UserRadarSettings:
    prefs = {}
    if user.preferences:
        try:
            prefs = json.loads(user.preferences)
        except Exception:
            prefs = {}

    viewing_pref = "weekly"
    if prefs.get("viewing_style") == "Binge Watcher" or prefs.get("viewing_preference") == "binge":
        viewing_pref = "binge"

    return schemas.UserRadarSettings(
        notify_season_drops_only=prefs.get("notify_season_drops_only", False),
        notify_watched_resurrect=prefs.get("notify_watched_resurrect", True),
        notify_movie_streaming=prefs.get("notify_movie_streaming", True),
        auto_follow_watching=prefs.get("auto_follow_watching", True),
        viewing_preference=viewing_pref
    )

# --- ENDPOINTS ---

@router.get("/activity/drops", response_model=schemas.ActivityFeedResponse)
def get_activity_drops(
    background_tasks: BackgroundTasks,
    country: str = Query(None, description="Country filter"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get fresh drops, upcoming drops, reel highlights, and resurrected shows.
    """
    # Trigger background sync if shows are stale
    background_tasks.add_task(bg_sync_user_radar, current_user.id, False)

    today = date.today()
    target_country = (country or current_user.country or "US").upper().strip()

    user_subs = db.query(models.Subscription).filter(
        models.Subscription.user_id == current_user.id,
        models.Subscription.country == target_country,
        (models.Subscription.category == None) | (models.Subscription.category == "OTT")
    ).all()

    status_priority = {"active": 3, "due_soon": 2, "expired": 1}
    service_status_map: dict[str, tuple[str, int | None, models.Subscription]] = {}
    for s in user_subs:
        st, days = get_sub_status(s, today)
        s_norm = s.service_name.lower().strip()
        if s_norm not in service_status_map:
            service_status_map[s_norm] = (st, days, s)
        else:
            prev_st, _, _ = service_status_map[s_norm]
            if status_priority.get(st, 0) > status_priority.get(prev_st, 0):
                service_status_map[s_norm] = (st, days, s)

    active_services = {s_name for s_name, (st, _, _) in service_status_map.items() if st in ("active", "due_soon")}

    watchlist_items = db.query(models.WatchlistItem).filter(
        models.WatchlistItem.user_id == current_user.id
    ).all()

    radar_settings = get_user_radar_settings(current_user)

    fresh_drops: list[schemas.ActivityDrop] = []
    imminent_drops: list[schemas.ActivityDrop] = []
    resurrected_shows: list[schemas.ActivityDrop] = []
    reel_items: list[schemas.ActivityDrop] = []

    seen_reel_ids = set()

    for item in watchlist_items:
        sub_status, sub_days, _ = get_provider_sub_status(item.available_on, service_status_map)
        is_sub_match = (sub_status in ("active", "due_soon"))

        # 1. Resurrected Shows: Marked 'watched', but a brand-new season has since premiered!
        if radar_settings.notify_watched_resurrect and item.media_type == "tv" and item.status == "watched":
            # Never resurrect shows that have permanently ended or been canceled
            if item.air_status in ["Ended", "Canceled"]:
                continue

            has_new_season = False
            # Check if a recent season aired within the last 90 days, or after the user added the show
            if item.last_air_date:
                days_since_air = (today - item.last_air_date).days
                is_recent = 0 <= days_since_air <= 90
                is_after_added = bool(item.added_at and item.last_air_date > item.added_at.date() and days_since_air >= 0)

                if is_recent or is_after_added:
                    tracked_season = item.current_season or item.total_seasons or 0
                    if item.last_episode_season and item.last_episode_season > tracked_season:
                        has_new_season = True
                    elif is_after_added and item.last_episode_number == 1:
                        has_new_season = True

            # Also check if an upcoming new season is announced
            if not has_new_season and item.next_air_date and item.next_air_date >= today:
                tracked_season = item.current_season or item.total_seasons or 0
                if item.next_episode_season and item.next_episode_season > tracked_season:
                    has_new_season = True

            if has_new_season:
                drop = schemas.ActivityDrop(
                    item_id=item.id,
                    tmdb_id=item.tmdb_id,
                    title=item.title,
                    media_type=item.media_type,
                    poster_path=item.poster_path,
                    available_on=item.available_on,
                    is_on_active_subscription=is_sub_match,
                    subscription_status=sub_status,
                    drop_type="resurrected",
                    season_number=item.last_episode_season or item.next_episode_season,
                    episode_number=item.last_episode_number or item.next_episode_number,
                    episode_name=item.last_episode_name or item.next_episode_name,
                    episode_still=item.last_episode_still,
                    air_date=item.last_air_date or item.next_air_date,
                    days_relative=(item.last_air_date - today).days if item.last_air_date else (
                        (item.next_air_date - today).days if item.next_air_date else None
                    ),
                    status=item.status,
                    current_season=item.current_season,
                    current_episode=item.current_episode,
                    is_followed=bool(item.is_followed)
                )
                resurrected_shows.append(drop)
                if item.id not in seen_reel_ids:
                    reel_items.append(drop)
                    seen_reel_ids.add(item.id)

        # 2. Fresh & Imminent drops (for followed or watching items)
        is_tracked = bool(item.is_followed) or (radar_settings.auto_follow_watching and item.status == "watching")
        if item.media_type == "tv" and is_tracked:
            # Fresh drops: last air date in past 14 days
            if item.last_air_date:
                diff_days = (item.last_air_date - today).days
                if -14 <= diff_days <= 0:
                    is_season_premiere = (item.last_episode_number == 1)
                    if not radar_settings.notify_season_drops_only or is_season_premiere:
                        drop_type = "new_season" if is_season_premiere else "new_episode"
                        drop = schemas.ActivityDrop(
                            item_id=item.id,
                            tmdb_id=item.tmdb_id,
                            title=item.title,
                            media_type=item.media_type,
                            poster_path=item.poster_path,
                            available_on=item.available_on,
                            is_on_active_subscription=is_sub_match,
                            subscription_status=sub_status,
                            drop_type=drop_type,
                            season_number=item.last_episode_season,
                            episode_number=item.last_episode_number,
                            episode_name=item.last_episode_name,
                            episode_still=item.last_episode_still,
                            air_date=item.last_air_date,
                            days_relative=diff_days,
                            status=item.status,
                            current_season=item.current_season,
                            current_episode=item.current_episode,
                            is_followed=bool(item.is_followed)
                        )
                        fresh_drops.append(drop)
                        if -7 <= diff_days <= 0 and item.id not in seen_reel_ids:
                            reel_items.append(drop)
                            seen_reel_ids.add(item.id)

            # Imminent drops: next air date in next 14 days
            if item.next_air_date:
                diff_days = (item.next_air_date - today).days
                if 0 <= diff_days <= 14:
                    is_season_premiere = (item.next_episode_number == 1)
                    if not radar_settings.notify_season_drops_only or is_season_premiere:
                        drop_type = "new_season" if is_season_premiere else "upcoming"
                        drop = schemas.ActivityDrop(
                            item_id=item.id,
                            tmdb_id=item.tmdb_id,
                            title=item.title,
                            media_type=item.media_type,
                            poster_path=item.poster_path,
                            available_on=item.available_on,
                            is_on_active_subscription=is_sub_match,
                            subscription_status=sub_status,
                            drop_type=drop_type,
                            season_number=item.next_episode_season,
                            episode_number=item.next_episode_number,
                            episode_name=item.next_episode_name,
                            air_date=item.next_air_date,
                            days_relative=diff_days,
                            status=item.status,
                            current_season=item.current_season,
                            current_episode=item.current_episode,
                            is_followed=bool(item.is_followed)
                        )
                        imminent_drops.append(drop)
                        if 0 <= diff_days <= 2 and item.id not in seen_reel_ids:
                            reel_items.append(drop)
                            seen_reel_ids.add(item.id)

        # 3. Movie Streaming Drop (Plan to Watch movie available on active subscription)
        if radar_settings.notify_movie_streaming and item.media_type == "movie" and item.status == "plan_to_watch" and is_sub_match:
            added_days = (today - item.added_at.date()).days if item.added_at else 0
            if 0 <= added_days <= 14:
                drop = schemas.ActivityDrop(
                    item_id=item.id,
                    tmdb_id=item.tmdb_id,
                    title=item.title,
                    media_type="movie",
                    poster_path=item.poster_path,
                    available_on=item.available_on,
                    is_on_active_subscription=True,
                    subscription_status=sub_status,
                    drop_type="new_season",
                    season_number=1,
                    episode_name=f"Streaming on {item.available_on}",
                    air_date=item.added_at.date() if item.added_at else today,
                    days_relative=-added_days,
                    status=item.status,
                    is_followed=bool(item.is_followed)
                )
                fresh_drops.append(drop)
                if added_days <= 7 and item.id not in seen_reel_ids:
                    reel_items.append(drop)
                    seen_reel_ids.add(item.id)

    # Sort reel items by urgency: 0 (today) first, then upcoming, then recent past
    # Binge watchers have full season premiere / resurrected drops prioritized first
    def reel_sort_key(d: schemas.ActivityDrop):
        rel = d.days_relative if d.days_relative is not None else 999
        is_season_priority = 0 if (radar_settings.viewing_preference == "binge" and d.drop_type in ["new_season", "resurrected"]) else 1
        if rel == 0:
            return (is_season_priority, 0, 0) # Today!
        if rel > 0:
            return (is_season_priority, 1, rel) # Upcoming in 1-2 days
        return (is_season_priority, 2, abs(rel)) # Past days

    reel_items.sort(key=reel_sort_key)
    fresh_drops.sort(key=lambda d: d.days_relative if d.days_relative is not None else -999, reverse=True)
    imminent_drops.sort(key=lambda d: d.days_relative if d.days_relative is not None else 999)

    return schemas.ActivityFeedResponse(
        reel_items=reel_items,
        fresh_drops=fresh_drops,
        imminent_drops=imminent_drops,
        resurrected_shows=resurrected_shows
    )

@router.get("/calendar", response_model=schemas.CalendarResponse)
def get_calendar(
    background_tasks: BackgroundTasks,
    start: str = Query(None, description="Start date in YYYY-MM-DD format"),
    end: str = Query(None, description="End date in YYYY-MM-DD format"),
    month: str = Query(None, description="Month in YYYY-MM format"),
    country: str = Query(None, description="Country filter"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get 4-week radar or requested date-range schedule and Subscription Heatmap.
    """
    background_tasks.add_task(bg_sync_user_radar, current_user.id, False)
    radar_settings = get_user_radar_settings(current_user)
    today = date.today()
    target_country = (country or current_user.country or "US").upper().strip()

    start_date = None
    end_date = None

    if start and end:
        try:
            start_date = datetime.strptime(start, "%Y-%m-%d").date()
            end_date = datetime.strptime(end, "%Y-%m-%d").date()
        except Exception:
            start_date = None
            end_date = None

    if not start_date or not end_date:
        if month:
            try:
                parts = month.split("-")
                target_year = int(parts[0])
                target_month = int(parts[1])
                _, num_days = calendar.monthrange(target_year, target_month)
                start_date = date(target_year, target_month, 1)
                end_date = date(target_year, target_month, num_days)
            except Exception:
                start_date = None
                end_date = None

    # Default to 4-week window centered on current week (Row 3 = current week: 2 past weeks, 1 future week)
    if not start_date or not end_date:
        days_since_sunday = (today.weekday() + 1) % 7
        current_sunday = today - timedelta(days=days_since_sunday)
        start_date = current_sunday - timedelta(days=14)
        end_date = start_date + timedelta(days=27)

    month_str = month or f"{start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}"

    user_subs = db.query(models.Subscription).filter(
        models.Subscription.user_id == current_user.id,
        models.Subscription.country == target_country,
        (models.Subscription.category == None) | (models.Subscription.category == "OTT")
    ).all()

    status_priority = {"active": 3, "due_soon": 2, "expired": 1}
    service_status_map: dict[str, tuple[str, int | None, models.Subscription]] = {}
    for s in user_subs:
        st, days = get_sub_status(s, today)
        s_norm = s.service_name.lower().strip()
        if s_norm not in service_status_map:
            service_status_map[s_norm] = (st, days, s)
        else:
            prev_st, _, _ = service_status_map[s_norm]
            if status_priority.get(st, 0) > status_priority.get(prev_st, 0):
                service_status_map[s_norm] = (st, days, s)

    active_subs = [s for s in user_subs if s.is_active]
    items = db.query(models.WatchlistItem).filter(
        models.WatchlistItem.user_id == current_user.id,
        models.WatchlistItem.media_type == "tv"
    ).all()

    # Pre-filter candidate shows and fetch season episodes concurrently
    candidate_items = []
    for item in items:
        if item.status == "dropped" and not item.is_followed:
            continue
        if item.air_status in ["Ended", "Canceled"] and item.last_air_date and item.last_air_date < date(today.year - 1, 1, 1):
            continue
        has_recent = (
            (item.last_air_date and item.last_air_date >= start_date - timedelta(days=60)) or
            (item.next_air_date and item.next_air_date >= start_date - timedelta(days=14)) or
            item.is_followed or
            (item.status == "watching" and (not item.last_air_date or item.last_air_date >= date(today.year - 1, 1, 1))) or
            not item.last_air_check
        )
        if has_recent and item.tmdb_id:
            season_num = item.next_episode_season or item.last_episode_season or item.current_season or 1
            candidate_items.append((item, season_num))

    episodes_by_item_id: dict[int, list[dict]] = {}
    if candidate_items:
        from concurrent.futures import ThreadPoolExecutor
        def fetch_show_eps(pair):
            it, s_num = pair
            try:
                return it.id, tmdb_client.get_season_episodes(it.tmdb_id, s_num)
            except Exception:
                return it.id, []

        with ThreadPoolExecutor(max_workers=8) as executor:
            for item_id, eps in executor.map(fetch_show_eps, candidate_items):
                episodes_by_item_id[item_id] = eps

    events_by_date: dict[str, list[schemas.ActivityDrop]] = {}
    service_distribution: dict[str, int] = {}
    service_drops_count: dict[str, int] = {s.service_name: 0 for s in user_subs}
    service_upcoming_drops_count: dict[str, int] = {s.service_name: 0 for s in user_subs}
    seen_episodes: set[tuple[int, int, int]] = set()

    for item in items:
        # Include any TV show with releases in this window (exclude dropped unless explicitly followed)
        if item.status == "dropped" and not item.is_followed:
            continue

        sub_status, sub_days, sub_obj = get_provider_sub_status(item.available_on, service_status_map)
        is_sub_match = (sub_status in ("active", "due_soon"))

        # 1. Fetch detailed season episodes for active/recent shows
        found_season_drops = False
        season_num = item.next_episode_season or item.last_episode_season or item.current_season or 1
        episodes = episodes_by_item_id.get(item.id)
        if episodes:
                for ep in episodes:
                    air_str = ep.get("air_date")
                    if not air_str:
                        continue
                    try:
                        ep_air_date = datetime.strptime(air_str, "%Y-%m-%d").date()
                    except Exception:
                        continue

                    if start_date <= ep_air_date <= end_date:
                        ep_num = ep.get("episode_number") or 1
                        ep_s_num = ep.get("season_number") or season_num
                        ep_key = (item.id, ep_s_num, ep_num)
                        if ep_key in seen_episodes:
                            continue
                        seen_episodes.add(ep_key)
                        found_season_drops = True

                        diff = (ep_air_date - today).days
                        is_season_premiere = (ep_num == 1)
                        if diff < 0:
                            drop_type = "new_season" if is_season_premiere else "new_episode"
                        elif diff == 0:
                            drop_type = "new_season" if is_season_premiere else "new_episode"
                        else:
                            drop_type = "new_season" if is_season_premiere else "upcoming"

                        drop = schemas.ActivityDrop(
                            item_id=item.id,
                            tmdb_id=item.tmdb_id,
                            title=item.title,
                            media_type=item.media_type,
                            poster_path=item.poster_path,
                            available_on=item.available_on,
                            is_on_active_subscription=is_sub_match,
                            subscription_status=sub_status,
                            drop_type=drop_type,
                            season_number=ep_s_num,
                            episode_number=ep_num,
                            episode_name=ep.get("name"),
                            episode_still=ep.get("still_path"),
                            air_date=ep_air_date,
                            days_relative=diff,
                            status=item.status,
                            current_season=item.current_season,
                            current_episode=item.current_episode,
                            is_followed=bool(item.is_followed)
                        )
                        events_by_date.setdefault(air_str, []).append(drop)

                        if item.available_on:
                            service_distribution[item.available_on] = service_distribution.get(item.available_on, 0) + 1
                            for s_name in service_drops_count:
                                if s_name.lower() in item.available_on.lower() or item.available_on.lower() in s_name.lower():
                                    service_drops_count[s_name] += 1
                                    if diff >= 0:
                                        service_upcoming_drops_count[s_name] += 1

        # 2. Fallback to single last_air_date / next_air_date if season episodes returned no hits
        if not found_season_drops:
            if item.last_air_date and start_date <= item.last_air_date <= end_date:
                ep_s = item.last_episode_season or 1
                ep_n = item.last_episode_number or 1
                ep_key = (item.id, ep_s, ep_n)
                if ep_key not in seen_episodes:
                    seen_episodes.add(ep_key)
                    d_str = item.last_air_date.strftime("%Y-%m-%d")
                    diff = (item.last_air_date - today).days
                    drop = schemas.ActivityDrop(
                        item_id=item.id,
                        tmdb_id=item.tmdb_id,
                        title=item.title,
                        media_type=item.media_type,
                        poster_path=item.poster_path,
                        available_on=item.available_on,
                        is_on_active_subscription=is_sub_match,
                        subscription_status=sub_status,
                        drop_type="new_season" if item.last_episode_number == 1 else "new_episode",
                        season_number=item.last_episode_season,
                        episode_number=item.last_episode_number,
                        episode_name=item.last_episode_name,
                        episode_still=item.last_episode_still,
                        air_date=item.last_air_date,
                        days_relative=diff,
                        status=item.status,
                        current_season=item.current_season,
                        current_episode=item.current_episode,
                        is_followed=bool(item.is_followed)
                    )
                    events_by_date.setdefault(d_str, []).append(drop)
                    if item.available_on:
                        service_distribution[item.available_on] = service_distribution.get(item.available_on, 0) + 1
                        for s_name in service_drops_count:
                            if s_name.lower() in item.available_on.lower() or item.available_on.lower() in s_name.lower():
                                service_drops_count[s_name] += 1
                                if diff >= 0:
                                    service_upcoming_drops_count[s_name] += 1

            if item.next_air_date and start_date <= item.next_air_date <= end_date:
                ep_s = item.next_episode_season or 1
                ep_n = item.next_episode_number or 1
                ep_key = (item.id, ep_s, ep_n)
                if ep_key not in seen_episodes:
                    seen_episodes.add(ep_key)
                    d_str = item.next_air_date.strftime("%Y-%m-%d")
                    diff = (item.next_air_date - today).days
                    drop = schemas.ActivityDrop(
                        item_id=item.id,
                        tmdb_id=item.tmdb_id,
                        title=item.title,
                        media_type=item.media_type,
                        poster_path=item.poster_path,
                        available_on=item.available_on,
                        is_on_active_subscription=is_sub_match,
                        subscription_status=sub_status,
                        drop_type="new_season" if item.next_episode_number == 1 else "upcoming",
                        season_number=item.next_episode_season,
                        episode_number=item.next_episode_number,
                        episode_name=item.next_episode_name,
                        air_date=item.next_air_date,
                        days_relative=diff,
                        status=item.status,
                        current_season=item.current_season,
                        current_episode=item.current_episode,
                        is_followed=bool(item.is_followed)
                    )
                    events_by_date.setdefault(d_str, []).append(drop)
                    if item.available_on:
                        service_distribution[item.available_on] = service_distribution.get(item.available_on, 0) + 1
                        for s_name in service_drops_count:
                            if s_name.lower() in item.available_on.lower() or item.available_on.lower() in s_name.lower():
                                service_drops_count[s_name] += 1
                                if diff >= 0:
                                    service_upcoming_drops_count[s_name] += 1

    events = [
        schemas.CalendarEvent(date=d, drops=drops)
        for d, drops in sorted(events_by_date.items())
    ]

    # Calculate Value Scorecard for subscriptions
    value_scorecard: list[schemas.ValueScorecardItem] = []
    seen_services = set()
    for sub in user_subs:
        s_norm = sub.service_name.lower().strip()
        if s_norm in seen_services:
            continue
        seen_services.add(s_norm)
        drops_cnt = service_drops_count.get(sub.service_name, 0)
        upcoming_cnt = service_upcoming_drops_count.get(sub.service_name, 0)
        cycle = (sub.billing_cycle or "monthly").lower().strip()
        is_yearly = cycle in ("yearly", "annual")
        monthly_equiv = sub.cost / 12.0 if is_yearly else sub.cost
        sub_status, days_left = get_sub_status(sub, today)

        if sub_status == "expired":
            if drops_cnt >= 6:
                label = "High Value"
                action = f"Subscription expired: {drops_cnt} drops airing on {sub.service_name}. Renew to watch."
            elif drops_cnt >= 4:
                label = "Moderate Value"
                action = f"Subscription expired: {drops_cnt} drops airing on {sub.service_name}. Renew to watch."
            elif drops_cnt >= 2:
                label = "Low Value"
                action = f"Subscription expired: Only {drops_cnt} drops this month. Safe to keep paused until more episodes accumulate."
            elif drops_cnt == 1:
                label = "Low Value"
                action = f"Subscription expired: Only 1 drop this month. Safe to keep paused."
            else:
                label = "Idle / Keep Paused"
                action = "Subscription expired: 0 drops scheduled. Safe to keep paused."
        elif sub_status == "due_soon":
            days_str = f"in {days_left}d" if days_left is not None and days_left > 0 else ("today" if days_left == 0 else "")
            if upcoming_cnt >= 6:
                label = "High Value"
                action = f"Renews {days_str}: {upcoming_cnt} upcoming drops scheduled. Keep active to stream without interruption."
            elif upcoming_cnt >= 4:
                label = "Moderate Value"
                action = f"Renews {days_str}: {upcoming_cnt} upcoming drops scheduled. Keep active for upcoming episodes."
            elif upcoming_cnt >= 2:
                label = "Low Value"
                if is_yearly:
                    action = f"Annual plan renews {days_str}: Light schedule ({upcoming_cnt} upcoming drops)."
                else:
                    action = f"Renews {days_str}: Only {upcoming_cnt} upcoming drops. Consider pausing before renewal."
            elif upcoming_cnt == 1:
                label = "Low Value"
                if is_yearly:
                    action = f"Annual plan renews {days_str}: Only 1 upcoming drop scheduled."
                else:
                    action = f"Renews {days_str}: Only 1 upcoming drop scheduled. Pause before renewal to save {sub.cost:.2f} {sub.currency}."
            else:
                label = "Idle / Safe to Pause"
                if is_yearly:
                    action = f"Annual plan renews {days_str}: 0 upcoming drops scheduled."
                else:
                    action = f"Renews {days_str}: 0 upcoming drops scheduled. Pause before renewal to save {sub.cost:.2f} {sub.currency}."
        else: # active
            if drops_cnt >= 6:
                label = "High Value"
                action = "Keep Active: Great content drop volume this month."
            elif drops_cnt >= 4:
                if radar_settings.viewing_preference == "binge" and not is_yearly:
                    label = "Binge Window"
                    action = f"Binge Strategy: {drops_cnt} weekly drops airing. Safe to pause and binge when complete."
                else:
                    label = "Moderate Value"
                    action = f"Keep Active: Steady weekly releases ({drops_cnt} drops scheduled)."
            elif drops_cnt >= 2:
                label = "Low Value"
                if is_yearly:
                    action = f"Annual plan active: Light drop schedule this month ({drops_cnt} drops, ~{monthly_equiv:.0f} {sub.currency}/mo equiv)."
                elif radar_settings.viewing_preference == "binge":
                    label = "Binge Window"
                    action = f"Binge Candidate: Only {drops_cnt} drops in 4 weeks. Safe to pause and binge later."
                else:
                    action = f"Low Value: Only {drops_cnt} drops in 4 weeks. Consider pausing to save {sub.cost:.2f} {sub.currency}/mo."
            elif drops_cnt == 1:
                label = "Low Value"
                if is_yearly:
                    action = f"Annual plan active: Light drop schedule this month (~{monthly_equiv:.0f} {sub.currency}/mo equiv)."
                else:
                    action = f"Minimal Value: Only 1 drop in 4 weeks. Consider pausing to save {sub.cost:.2f} {sub.currency}/mo."
            else:
                label = "Idle / Safe to Pause"
                if is_yearly:
                    action = f"Annual plan active: 0 drops scheduled this month (~{monthly_equiv:.0f} {sub.currency}/mo equiv)."
                else:
                    action = f"Safe to pause and save {sub.cost:.2f} {sub.currency}/mo."

        value_scorecard.append(schemas.ValueScorecardItem(
            id=sub.id,
            service_name=sub.service_name,
            cost=sub.cost,
            currency=sub.currency,
            billing_cycle=cycle,
            drop_count=drops_cnt,
            value_label=label,
            suggested_action=action,
            subscription_status=sub_status,
            next_billing_date=sub.next_billing_date,
            days_left=days_left
        ))

    return schemas.CalendarResponse(
        month=month_str,
        events=events,
        service_distribution=service_distribution,
        value_scorecard=value_scorecard
    )

@router.patch("/{item_id}/follow", response_model=schemas.WatchlistItem)
def toggle_follow(
    item_id: int,
    background_tasks: BackgroundTasks,
    payload: schemas.WatchlistFollowUpdate = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Toggle or set the 'Follow / Radar' status of a watchlist item.
    """
    item = db.query(models.WatchlistItem).filter(
        models.WatchlistItem.id == item_id,
        models.WatchlistItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    if payload is not None:
        item.is_followed = payload.is_followed
    else:
        item.is_followed = not item.is_followed

    db.commit()
    db.refresh(item)

    if item.is_followed and item.media_type == "tv":
        background_tasks.add_task(sync_show_release_info, db, item)

    return item

@router.post("/{item_id}/resurrect", response_model=schemas.WatchlistItem)
def resurrect_show(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    1-Click action: Move a previously 'watched' show back into 'watching'
    when a new season has released.
    """
    item = db.query(models.WatchlistItem).filter(
        models.WatchlistItem.id == item_id,
        models.WatchlistItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Watchlist item not found")

    item.status = "watching"
    item.is_followed = True
    if item.last_episode_season and item.last_episode_season > (item.current_season or 1):
        item.current_season = item.last_episode_season
        item.current_episode = 0

    db.commit()
    db.refresh(item)
    return item

@router.post("/activity/sync")
def force_sync_releases(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Force sync release data for all followed and watching TV shows.
    """
    background_tasks.add_task(bg_sync_user_radar, current_user.id, True)
    return {"status": "success", "message": "Release sync scheduled in background."}

@router.get("/user/radar-settings", response_model=schemas.UserRadarSettings)
def get_radar_settings(
    current_user: models.User = Depends(get_current_user)
):
    return get_user_radar_settings(current_user)

@router.put("/user/radar-settings", response_model=schemas.UserRadarSettings)
def update_radar_settings(
    settings_in: schemas.UserRadarSettings,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    prefs = {}
    if current_user.preferences:
        try:
            prefs = json.loads(current_user.preferences)
        except Exception:
            prefs = {}

    prefs.update(settings_in.dict())
    current_user.preferences = json.dumps(prefs)
    db.commit()
    db.refresh(current_user)
    return get_user_radar_settings(current_user)

