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

def get_user_radar_settings(user: models.User) -> schemas.UserRadarSettings:
    prefs = {}
    if user.preferences:
        try:
            prefs = json.loads(user.preferences)
        except Exception:
            prefs = {}
    return schemas.UserRadarSettings(
        notify_season_drops_only=prefs.get("notify_season_drops_only", True),
        notify_watched_resurrect=prefs.get("notify_watched_resurrect", True),
        notify_movie_streaming=prefs.get("notify_movie_streaming", True),
        viewing_preference=prefs.get("viewing_preference", "weekly")
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
    background_tasks.add_task(sync_user_radar, db, current_user.id, False)

    today = date.today()
    target_country = (country or current_user.country or "US").upper().strip()

    active_subs = db.query(models.Subscription).filter(
        models.Subscription.user_id == current_user.id,
        models.Subscription.is_active == True,
        models.Subscription.country == target_country,
        (models.Subscription.category == None) | (models.Subscription.category == "OTT")
    ).all()
    active_services = {s.service_name.lower().strip() for s in active_subs}

    watchlist_items = db.query(models.WatchlistItem).filter(
        models.WatchlistItem.user_id == current_user.id
    ).all()

    fresh_drops: list[schemas.ActivityDrop] = []
    imminent_drops: list[schemas.ActivityDrop] = []
    resurrected_shows: list[schemas.ActivityDrop] = []
    reel_items: list[schemas.ActivityDrop] = []

    seen_reel_ids = set()

    for item in watchlist_items:
        is_sub_match = is_provider_in_subs(item.available_on, active_services)

        # 1. Resurrected Shows: Marked 'watched', but a brand-new season has since premiered!
        if item.media_type == "tv" and item.status == "watched":
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
        if item.media_type == "tv" and (item.is_followed or item.status == "watching"):
            # Fresh drops: last air date in past 14 days
            if item.last_air_date:
                diff_days = (item.last_air_date - today).days
                if -14 <= diff_days <= 0:
                    is_season_premiere = (item.last_episode_number == 1)
                    drop_type = "new_season" if is_season_premiere else "new_episode"
                    drop = schemas.ActivityDrop(
                        item_id=item.id,
                        tmdb_id=item.tmdb_id,
                        title=item.title,
                        media_type=item.media_type,
                        poster_path=item.poster_path,
                        available_on=item.available_on,
                        is_on_active_subscription=is_sub_match,
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
                    drop_type = "new_season" if is_season_premiere else "upcoming"
                    drop = schemas.ActivityDrop(
                        item_id=item.id,
                        tmdb_id=item.tmdb_id,
                        title=item.title,
                        media_type=item.media_type,
                        poster_path=item.poster_path,
                        available_on=item.available_on,
                        is_on_active_subscription=is_sub_match,
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

    # Sort reel items by urgency: 0 (today) first, then upcoming, then recent past
    def reel_sort_key(d: schemas.ActivityDrop):
        rel = d.days_relative if d.days_relative is not None else 999
        if rel == 0:
            return (0, 0) # Today!
        if rel > 0:
            return (1, rel) # Upcoming in 1-2 days
        return (2, abs(rel)) # Past days

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
    month: str = Query(None, description="Month in YYYY-MM format"),
    country: str = Query(None, description="Country filter"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Get full calendar schedule and Subscription Heatmap for the requested month.
    """
    background_tasks.add_task(sync_user_radar, db, current_user.id, False)
    today = date.today()
    target_country = (country or current_user.country or "US").upper().strip()
    if not month:
        target_year = today.year
        target_month = today.month
        month_str = today.strftime("%Y-%m")
    else:
        try:
            parts = month.split("-")
            target_year = int(parts[0])
            target_month = int(parts[1])
            month_str = f"{target_year:04d}-{target_month:02d}"
        except Exception:
            target_year = today.year
            target_month = today.month
            month_str = today.strftime("%Y-%m")

    # Calculate month bounds
    _, num_days = calendar.monthrange(target_year, target_month)
    start_date = date(target_year, target_month, 1)
    end_date = date(target_year, target_month, num_days)

    active_subs = db.query(models.Subscription).filter(
        models.Subscription.user_id == current_user.id,
        models.Subscription.is_active == True,
        models.Subscription.country == target_country,
        (models.Subscription.category == None) | (models.Subscription.category == "OTT")
    ).all()
    active_services = {s.service_name.lower().strip(): s for s in active_subs}

    items = db.query(models.WatchlistItem).filter(
        models.WatchlistItem.user_id == current_user.id,
        models.WatchlistItem.media_type == "tv"
    ).all()

    events_by_date: dict[str, list[schemas.ActivityDrop]] = {}
    service_distribution: dict[str, int] = {}
    service_drops_count: dict[str, int] = {s.service_name: 0 for s in active_subs}

    for item in items:
        # Include any TV show with releases in this month (exclude dropped unless explicitly followed)
        if item.status == "dropped" and not item.is_followed:
            continue

        is_sub_match = is_provider_in_subs(item.available_on, set(active_services.keys()))

        # Check last_air_date in range
        if item.last_air_date and start_date <= item.last_air_date <= end_date:
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
            
            # Service count
            if item.available_on:
                service_distribution[item.available_on] = service_distribution.get(item.available_on, 0) + 1
                for s_name in service_drops_count:
                    if s_name.lower() in item.available_on.lower() or item.available_on.lower() in s_name.lower():
                        service_drops_count[s_name] += 1

        # Check next_air_date in range
        if item.next_air_date and start_date <= item.next_air_date <= end_date:
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

    events = [
        schemas.CalendarEvent(date=d, drops=drops)
        for d, drops in sorted(events_by_date.items())
    ]

    # Calculate Value Scorecard for active subscriptions
    value_scorecard: list[schemas.ValueScorecardItem] = []
    seen_services = set()
    for sub in active_subs:
        s_norm = sub.service_name.lower().strip()
        if s_norm in seen_services:
            continue
        seen_services.add(s_norm)
        drops_cnt = service_drops_count.get(sub.service_name, 0)
        cycle = (sub.billing_cycle or "monthly").lower().strip()
        is_yearly = cycle in ("yearly", "annual")
        monthly_equiv = sub.cost / 12.0 if is_yearly else sub.cost

        if drops_cnt >= 5:
            label = "High Value"
            action = "Keep Active: Great content drop volume this month."
        elif drops_cnt >= 2:
            label = "Moderate Value"
            action = "Keep Active: Steady weekly releases."
        elif drops_cnt == 1:
            label = "Low Value"
            if is_yearly:
                action = f"Annual plan active: Light drop schedule this month (~{monthly_equiv:.0f} {sub.currency}/mo equiv)."
            else:
                action = "Consider Binge Window: pause now & binge when season concludes."
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
            suggested_action=action
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
    background_tasks.add_task(sync_user_radar, db, current_user.id, True)
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

