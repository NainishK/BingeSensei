from pydantic import BaseModel
from typing import List, Optional, Union, Dict, Any
from datetime import date, datetime

class SubscriptionBase(BaseModel):
    service_name: str
    cost: float
    currency: str = "USD"
    billing_cycle: str
    start_date: date
    next_billing_date: date
    is_active: bool = True
    category: str = "OTT"
    country: str = "US"

class SubscriptionCreate(SubscriptionBase):
    pass

class SubscriptionUpdate(BaseModel):
    service_name: Optional[str] = None
    cost: Optional[float] = None
    currency: Optional[str] = None
    billing_cycle: Optional[str] = None
    start_date: Optional[date] = None
    next_billing_date: Optional[date] = None
    is_active: Optional[bool] = None
    category: Optional[str] = None
    country: Optional[str] = None

class Subscription(SubscriptionBase):
    id: int
    user_id: int
    logo_url: Optional[str] = None

    class Config:
        from_attributes = True

class WatchlistItemBase(BaseModel):
    tmdb_id: int
    title: str
    media_type: str
    poster_path: Optional[str] = None
    vote_average: Optional[float] = None
    overview: Optional[str] = None
    status: str = "plan_to_watch"
    user_rating: Optional[int] = None # 1-10
    available_on: Optional[str] = None # Enriched field for UI badges
    original_language: Optional[str] = None # e.g. "ja" for anime detection
    notes: Optional[str] = None
    is_followed: Optional[bool] = False

class WatchlistNoteUpdate(BaseModel):
    notes: Optional[str] = None

class WatchlistRatingUpdate(BaseModel):
    rating: int

class WatchlistProgressUpdate(BaseModel):
    current_season: int
    current_episode: int

class WatchlistFollowUpdate(BaseModel):
    is_followed: bool

class WatchlistItemCreate(WatchlistItemBase):
    genre_ids: Optional[Union[List[int], str]] = None
    total_seasons: Optional[int] = 0
    total_episodes: Optional[int] = 0

class WatchlistItem(WatchlistItemBase):
    id: int
    user_id: int
    status: str
    added_at: datetime
    genre_ids: Optional[str] = None # Stored as string
    original_language: Optional[str] = None
    
    current_season: Optional[int] = 0
    current_episode: Optional[int] = 0
    total_seasons: Optional[int] = 0
    total_episodes: Optional[int] = 0

    # Radar fields
    is_followed: Optional[bool] = False
    next_air_date: Optional[date] = None
    next_episode_season: Optional[int] = None
    next_episode_number: Optional[int] = None
    next_episode_name: Optional[str] = None
    last_air_date: Optional[date] = None
    last_episode_season: Optional[int] = None
    last_episode_number: Optional[int] = None
    last_episode_name: Optional[str] = None
    last_episode_still: Optional[str] = None
    air_status: Optional[str] = None
    last_air_check: Optional[datetime] = None

    class Config:
        from_attributes = True

# --- RADAR & CALENDAR SCHEMAS ---

class UserRadarSettings(BaseModel):
    notify_season_drops_only: bool = False
    notify_watched_resurrect: bool = True
    notify_movie_streaming: bool = True
    auto_follow_watching: bool = True
    viewing_preference: str = "weekly" # "weekly" or "binge"

class ActivityDrop(BaseModel):
    item_id: int
    tmdb_id: int
    title: str
    media_type: str
    poster_path: Optional[str] = None
    backdrop_path: Optional[str] = None
    available_on: Optional[str] = None
    is_on_active_subscription: bool = False
    subscription_status: str = "none" # "active", "due_soon", "expired", "none"
    drop_type: str # "new_season", "new_episode", "upcoming", "resurrected"
    season_number: Optional[int] = None
    episode_number: Optional[int] = None
    episode_name: Optional[str] = None
    episode_still: Optional[str] = None
    air_date: Optional[date] = None
    days_relative: Optional[int] = None # negative = past days, 0 = today, positive = future days
    status: str
    current_season: Optional[int] = 0
    current_episode: Optional[int] = 0
    is_followed: bool = False

class ActivityFeedResponse(BaseModel):
    reel_items: List[ActivityDrop]
    fresh_drops: List[ActivityDrop]
    imminent_drops: List[ActivityDrop]
    resurrected_shows: List[ActivityDrop]

class CalendarEvent(BaseModel):
    date: str # YYYY-MM-DD
    drops: List[ActivityDrop]

class ValueScorecardItem(BaseModel):
    id: int
    service_name: str
    cost: float
    currency: str
    billing_cycle: str = "monthly"
    drop_count: int
    value_label: str # "High Value", "Moderate Value", "Low Value", "Idle / Safe to Pause", "Expired · Drops Airing", etc.
    suggested_action: str
    subscription_status: str = "active" # "active", "due_soon", "expired"
    next_billing_date: Optional[date] = None
    days_left: Optional[int] = None

class CalendarResponse(BaseModel):
    month: str # YYYY-MM
    events: List[CalendarEvent]
    service_distribution: Dict[str, int]
    value_scorecard: List[ValueScorecardItem]

class PlanBase(BaseModel):
    name: str
    cost: float
    currency: str
    billing_cycle: str = "monthly"
    country: str = "US"

class Plan(PlanBase):
    id: int
    service_id: int

    class Config:
        from_attributes = True

class ServiceBase(BaseModel):
    name: str
    logo_url: Optional[str] = None
    country: str = "US"
    category: str = "OTT"

class Service(ServiceBase):
    id: int
    plans: List[Plan] = []

    class Config:
        from_attributes = True

class UserBase(BaseModel):
    email: str
    country: str = "IN"
    avatar_url: Optional[str] = None

class UserCreate(UserBase):
    password: str


class UserPreferences(BaseModel):
    target_budget: Optional[int] = None
    target_currency: Optional[str] = "USD" # New: Store currency context
    watch_time_weekly: Optional[int] = None
    household_size: Optional[str] = None # Solo, Couple, Family
    languages: Optional[List[str]] = None # New: English, Hindi, etc.
    viewing_style: Optional[str] = None # New: Binge, Weekly, Casual
    devices: Optional[List[str]] = None
    deal_breakers: Optional[List[str]] = None
    
    # Notification Settings (default to False as per user request)
    enable_email_renewals: Optional[bool] = False
    enable_email_insights: Optional[bool] = False
    enable_push_renewals: Optional[bool] = False
    enable_push_insights: Optional[bool] = False

    # Release Radar & Drop Preferences
    notify_season_drops_only: Optional[bool] = False
    notify_watched_resurrect: Optional[bool] = True
    notify_movie_streaming: Optional[bool] = True
    auto_follow_watching: Optional[bool] = True
    viewing_preference: Optional[str] = "weekly"
    default_landing_page: Optional[str] = "auto"
    default_sidebar_collapsed: Optional[bool] = True

    class Config:
        extra = "allow"

class UserProfileUpdate(BaseModel):
    country: Optional[str] = None
    preferences: Optional[UserPreferences] = None

class User(UserBase):
    id: int
    google_id: Optional[str] = None
    is_active: bool
    preferences: Optional[str] = None # JSON string
    ai_allowed: bool
    ai_access_status: Optional[str] = "none"
    last_ai_usage: Optional[datetime] = None
    subscriptions: List[Subscription] = []
    watchlist: List[WatchlistItem] = []

    class Config:
        from_attributes = True

class AIRecommendation(BaseModel):
    title: str
    reason: str
    service: str
    tmdb_id: Optional[int] = None
    media_type: Optional[str] = "movie"
    poster_path: Optional[str] = None
    vote_average: Optional[float] = None
    overview: Optional[str] = None
    logo_url: Optional[str] = None
    providers: Optional[List[str]] = None  # TMDB regional provider names

class AIStrategyItem(BaseModel):
    action: str # "Cancel", "Add", "Keep"
    service: str
    reason: str
    savings: Optional[float] = None
    billing_cycle: Optional[str] = "monthly"

class AIGapItem(BaseModel):
    title: str
    service: str
    reason: str
    tmdb_id: Optional[int] = None
    media_type: Optional[str] = "movie"
    poster_path: Optional[str] = None
    vote_average: Optional[float] = None
    overview: Optional[str] = None
    providers: Optional[List[str]] = None  # TMDB regional provider names

class AIUnifiedResponse(BaseModel):
    picks: List[AIRecommendation]
    strategy: List[AIStrategyItem]
    gaps: List[AIGapItem]
    warning: Optional[str] = None # To convey limits or stale data info
    country: Optional[str] = None
    currency: Optional[str] = None

class TopService(BaseModel):
    name: str
    cost: float
    currency: str = "USD"

class UserStats(BaseModel):
    total_cost: float
    active_subs: int
    yearly_projection: float
    top_service: Optional[TopService] = None

class SpendingCategory(BaseModel):
    name: str
    cost: float
    color: str

