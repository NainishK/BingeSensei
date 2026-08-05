"""
Import/Export utility functions for Watchlists.
Supports importing from IMDb CSV, Letterboxd CSV, MyAnimeList XML, AniList JSON, and BingeSensei JSON/CSV.
"""

import csv
import json
import io
import re
import time
import xml.etree.ElementTree as ET
from typing import List, Dict, Any, Tuple
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

import tmdb_client

# Persistent HTTP Session with Connection Pooling & Retries
http_session = requests.Session()
retries = Retry(total=3, backoff_factor=0.3, status_forcelist=[429, 500, 502, 503, 504])
adapter = HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20)
http_session.mount("https://", adapter)
http_session.mount("http://", adapter)

def clean_anime_title(title: str) -> str:
    """
    Cleans up season suffixes and subtitles for better TMDB matching.
    e.g. 'Re:ZERO -Starting Life in Another World- Season 2' -> 'Re:ZERO -Starting Life in Another World-'
    e.g. 'HAIKYU!! 2nd Season' -> 'HAIKYU!!'
    """
    cleaned = re.sub(
        r'\s*(?:Season\s*\d+|[\d]+(?:st|nd|rd|th)\s*Season|Part\s*\d+|The\s*Final\s*Season|Cour\s*\d+)',
        '', title, flags=re.IGNORECASE
    )
    if ":" in cleaned and len(cleaned.split(":")[0].strip()) >= 3:
        # Check if base title before colon matches better
        cleaned = cleaned.split(":")[0].strip()
    return cleaned.strip()


def parse_imdb_csv(contents_str: str) -> List[Dict[str, Any]]:
    """
    Parses IMDb WATCHLIST.csv or ratings.csv file.
    IMDb CSV headers: Const, Created, Modified, Title, URL, Title Type, IMDb Rating, Runtime (mins), Year, Genres, Num Votes, Release Date, Directors, Your Rating, Date Added
    """
    results = []
    f = io.StringIO(contents_str)
    reader = csv.DictReader(f)
    
    for row in reader:
        imdb_id = row.get("Const") or row.get("const")
        title = row.get("Title") or row.get("title")
        title_type = (row.get("Title Type") or row.get("title_type") or "").lower()
        your_rating_str = row.get("Your Rating") or row.get("your_rating")
        
        if not imdb_id or not title:
            continue
            
        media_type = "tv" if "tv" in title_type or "series" in title_type or "miniseries" in title_type else "movie"
        
        user_rating = None
        if your_rating_str and your_rating_str.isdigit():
            user_rating = int(your_rating_str)
            
        status = "watched" if user_rating else "plan_to_watch"
        
        results.append({
            "imdb_id": imdb_id,
            "title": title,
            "media_type": media_type,
            "user_rating": user_rating,
            "status": status,
            "source": "imdb"
        })
        
    return results


def parse_letterboxd_csv(contents_str: str) -> List[Dict[str, Any]]:
    """
    Parses Letterboxd watchlist.csv or ratings.csv or watched.csv file.
    Headers: Date, Name, Year, Letterboxd URI, Rating
    """
    results = []
    f = io.StringIO(contents_str)
    reader = csv.DictReader(f)
    
    for row in reader:
        title = row.get("Name") or row.get("name") or row.get("Title")
        year = row.get("Year") or row.get("year")
        rating_str = row.get("Rating") or row.get("rating")
        
        if not title:
            continue
            
        user_rating = None
        if rating_str:
            try:
                val = float(rating_str)
                user_rating = int(round(val * 2))
            except ValueError:
                pass
                
        status = "watched" if user_rating else "plan_to_watch"
        
        results.append({
            "title": title,
            "year": year,
            "media_type": "movie",
            "user_rating": user_rating,
            "status": status,
            "source": "letterboxd"
        })
        
    return results


def parse_mal_xml(contents_str: str) -> List[Dict[str, Any]]:
    """
    Parses MyAnimeList animelist.xml export file.
    """
    results = []
    try:
        root = ET.fromstring(contents_str)
        for anime in root.findall("anime"):
            title = anime.findtext("series_title")
            mal_id = anime.findtext("series_animedb_id")
            my_status = anime.findtext("my_status")
            my_score = anime.findtext("my_score")
            my_watched_episodes = anime.findtext("my_watched_episodes")
            series_episodes = anime.findtext("series_episodes")
            
            if not title:
                continue
                
            status_map = {
                "Watching": "watching",
                "1": "watching",
                "Completed": "watched",
                "2": "watched",
                "On-Hold": "plan_to_watch",
                "3": "plan_to_watch",
                "Plan to Watch": "plan_to_watch",
                "6": "plan_to_watch",
            }
            status = status_map.get(my_status, "plan_to_watch")
            
            user_rating = None
            if my_score and my_score.isdigit() and int(my_score) > 0:
                user_rating = int(my_score)
                
            current_ep = int(my_watched_episodes) if my_watched_episodes and my_watched_episodes.isdigit() else 0
            total_ep = int(series_episodes) if series_episodes and series_episodes.isdigit() else 0
            
            results.append({
                "title": title,
                "mal_id": mal_id,
                "media_type": "tv",
                "user_rating": user_rating,
                "status": status,
                "current_episode": current_ep,
                "total_episodes": total_ep,
                "source": "myanimelist"
            })
    except Exception as e:
        print(f"[parse_mal_xml] Error parsing XML: {e}")
        
    return results


def fetch_anilist_user_list(username: str) -> List[Dict[str, Any]]:
    """
    Fetches anime list for a given public AniList username via AniList GraphQL API.
    """
    query = """
    query ($username: String) {
      MediaListCollection(userName: $username, type: ANIME) {
        lists {
          name
          status
          entries {
            media {
              id
              title {
                romaji
                english
              }
              episodes
              format
            }
            status
            score(format: POINT_10)
            progress
          }
        }
      }
    }
    """
    url = "https://graphql.anilist.co"
    try:
        response = http_session.post(url, json={"query": query, "variables": {"username": username}}, timeout=10)
        if response.status_code != 200:
            return []
            
        data = response.json()
        collection = data.get("data", {}).get("MediaListCollection", {})
        lists = collection.get("lists", [])
        
        results = []
        for l in lists:
            for entry in l.get("entries", []):
                media = entry.get("media", {})
                title = media.get("title", {}).get("english") or media.get("title", {}).get("romaji")
                if not title:
                    continue
                    
                anilist_status = (entry.get("status") or "").upper()
                status_map = {
                    "CURRENT": "watching",
                    "COMPLETED": "watched",
                    "PLANNING": "plan_to_watch",
                    "PAUSED": "plan_to_watch",
                    "DROPPED": "plan_to_watch"
                }
                status = status_map.get(anilist_status, "plan_to_watch")
                
                score = entry.get("score")
                user_rating = int(score) if score and score > 0 else None
                progress = entry.get("progress") or 0
                episodes = media.get("episodes") or 0
                
                format_str = (media.get("format") or "").upper()
                media_type = "movie" if format_str in ["MOVIE", "ONA"] and episodes == 1 else "tv"
                
                results.append({
                    "title": title,
                    "media_type": media_type,
                    "user_rating": user_rating,
                    "status": status,
                    "current_episode": progress,
                    "total_episodes": episodes,
                    "source": "anilist"
                })
        return results
    except Exception as e:
        print(f"[fetch_anilist_user_list] Error fetching AniList data: {e}")
        return []


def resolve_item_to_tmdb(item: Dict[str, Any]) -> Dict[str, Any] | None:
    """
    Resolves an imported item to TMDB metadata using IMDb ID or Title Search (with fallback clean title search).
    """
    imdb_id = item.get("imdb_id")
    title = item.get("title")
    media_type = item.get("media_type", "movie")
    year = item.get("year")
    
    # Method 1: Exact lookup via IMDb ID
    if imdb_id:
        try:
            data = tmdb_client.find_by_external_id(imdb_id, external_source="imdb_id")
            results = data.get("movie_results", []) if media_type == "movie" else data.get("tv_results", [])
            if not results:
                results = data.get("movie_results", []) + data.get("tv_results", [])
            if results:
                match = results[0]
                found_media_type = "movie" if "title" in match else "tv"
                return {
                    "tmdb_id": match["id"],
                    "title": match.get("title") or match.get("name"),
                    "media_type": found_media_type,
                    "poster_path": match.get("poster_path"),
                    "vote_average": match.get("vote_average", 0.0),
                    "overview": match.get("overview"),
                    "genre_ids": match.get("genre_ids", []),
                    "original_language": match.get("original_language"),
                    "user_rating": item.get("user_rating"),
                    "status": item.get("status", "plan_to_watch"),
                    "current_episode": item.get("current_episode", 0),
                    "total_episodes": item.get("total_episodes", 0),
                }
        except Exception as e:
            print(f"[resolve_item_to_tmdb] IMDb lookup failed for {imdb_id}: {e}")

    # Method 2: Search by Title (and clean title fallback)
    if title:
        titles_to_try = [title]
        cleaned = clean_anime_title(title)
        if cleaned and cleaned.lower() != title.lower():
            titles_to_try.append(cleaned)
            
        for query_title in titles_to_try:
            try:
                data = tmdb_client.search_multi(query_title)
                results = [r for r in data.get("results", []) if r.get("media_type") in ["movie", "tv"]]
                if results:
                    best_match = results[0]
                    for r in results:
                        r_type = r.get("media_type")
                        r_year = (r.get("release_date") or r.get("first_air_date") or "")[:4]
                        if r_type == media_type and (not year or r_year == str(year)):
                            best_match = r
                            break
                            
                    found_media_type = best_match.get("media_type", media_type)
                    return {
                        "tmdb_id": best_match["id"],
                        "title": best_match.get("title") or best_match.get("name"),
                        "media_type": found_media_type,
                        "poster_path": best_match.get("poster_path"),
                        "vote_average": best_match.get("vote_average", 0.0),
                        "overview": best_match.get("overview"),
                        "genre_ids": best_match.get("genre_ids", []),
                        "original_language": best_match.get("original_language"),
                        "user_rating": item.get("user_rating"),
                        "status": item.get("status", "plan_to_watch"),
                        "current_episode": item.get("current_episode", 0),
                        "total_episodes": item.get("total_episodes", 0),
                    }
            except Exception as e:
                print(f"[resolve_item_to_tmdb] Title lookup failed for '{query_title}': {e}")
            
    return None


def deduplicate_resolved_items(resolved_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Deduplicates resolved items by tmdb_id.
    Merges status (prefer watching > watched > plan_to_watch), episode counts, and ratings.
    """
    seen_tmdb_ids = {}
    status_priority = {"watching": 3, "watched": 2, "plan_to_watch": 1}
    
    for item in resolved_items:
        tmdb_id = item.get("tmdb_id")
        if not tmdb_id:
            continue
            
        if tmdb_id not in seen_tmdb_ids:
            seen_tmdb_ids[tmdb_id] = item
        else:
            existing = seen_tmdb_ids[tmdb_id]
            if status_priority.get(item.get("status"), 0) > status_priority.get(existing.get("status"), 0):
                existing["status"] = item["status"]
            existing["current_episode"] = max(existing.get("current_episode", 0), item.get("current_episode", 0))
            existing["total_episodes"] = max(existing.get("total_episodes", 0), item.get("total_episodes", 0))
            if item.get("user_rating") and not existing.get("user_rating"):
                existing["user_rating"] = item["user_rating"]
                
    return list(seen_tmdb_ids.values())
