import requests
from config import settings
import json
import re
import tmdb_client 
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




def generate_unified_insights(user_history: list, user_ratings: list, active_subs: list, preferences: dict, dropped_history: list = [], deal_breakers: list = [], ignored_titles: list = [], ignored_ids: set = set(), watchlist_ids: set = set(), country: str = "US", currency: str = "USD"):
    if not settings.GEMINI_API_KEY or settings.GEMINI_API_KEY == "YOUR_GEMINI_API_KEY_HERE":
        return None

    from datetime import datetime
    current_date = datetime.now().strftime("%B %Y")

    # Context
    history_text = "\n".join([f"- {h['title']} ({h['status']})" for h in user_history[-20:]])
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
        'IN': ["JioHotstar", "Zee5", "SonyLIV", "Amazon Prime Video", "Netflix", "Apple TV+"],
        'US': ["Hulu", "Max", "Paramount+", "Peacock", "Disney+", "Apple TV+", "Netflix"]
    }
    all_known_services = regional_services_map.get(country, regional_services_map['US'])
    not_on_subs = [svc for svc in all_known_services if svc.lower().replace(" ", "").replace("+", "") not in {n.lower().replace(" ", "").replace("+", "") for n in seen_sub_names}]
    not_subscribed_text = ", ".join(not_on_subs) if not_on_subs else "other streaming services"
    
    pref_text = json.dumps(preferences, indent=2)
    dropped_text = "\n".join([f"- {d['title']}" for d in dropped_history])
    deal_breakers_text = ", ".join(deal_breakers)
    ignored_text = ", ".join(ignored_titles)
    deal_breakers_text = ", ".join(deal_breakers)
    
    prompt = f"""
    Act as an elite streaming consultant and financial optimizer for a user in {country}.
    Current Date: {current_date} (Use this to filter out already released content when suggesting "Upcoming" items).
    User Currency: {currency}
    
    User Profile:
    - Active Subscriptions: {subs_text}
    - Watch History:
    {history_text}
    - Ratings:
    {ratings_text}
    - Preferences:
    - Preferences:
    {pref_text}
    - Dropped/Disliked Content:
    {dropped_text}
    - Explicit Deal Breakers (BANNED Topics/Genres): {deal_breakers_text}
    - Repetitive/Ignored Content (Avoid these, user has skipped them multiple times): {ignored_text}
    
    Task: Provide a 3-part comprehensive report in STRICT JSON format:
    1. "picks": 35 Hidden Gems/Matches. Priority to active subs. Diverse mix of genres. (We will filter best 6).
    2. "strategy": 1-3 Financial Actions (Cancel/Add). Pay close attention to whether the user has a monthly or yearly subscription for each service. If recommending cancellation of a yearly plan, refer to annual savings, not monthly. ALL monetary values must be in {currency}.
    3. "gaps": 25 specific titles they are MISSING OUT on. These MUST be from services the user does NOT subscribe to: {not_subscribed_text}. Do NOT suggest anything from: {subs_text}. The goal is to show compelling content that could justify subscribing to a new service. Diverse mix of genres. (We will filter best 3).
    
    IMPORTANT RULES:
    1. QUALITY STANDARDS: Only recommend high-quality, acclaimed, or popular mainstream movies and TV series (e.g. TMDB/IMDb rating >= 6.5). NEVER recommend obscure documentary shorts, DVD bonus featurettes, behind-the-scenes specials, unrated student films, or unreleased titles.
    2. Use CANONICAL TITLES only (e.g. "Rocket Boys", NOT "The Rocket Boys"; "Severance", NOT "Severance Season 2"; "The Bear", NOT "The Bear Season 1").
    3. Ratings mentioned in "reason" must be on a 10-star scale.
    4. REGIONAL CONTEXT (India): "JioCinema" and "Disney+ Hotstar" are merging into "JioHotstar". Treat them as a consolidated entity.
    5. NO DUPLICATES: Do NOT recommend any title that is already listed in "User's Watch History" (even if status is 'plan_to_watch'). The user wants NEW discoveries, not reminders.
    6. STRATEGY CONSISTENCY: Do not provide conflicting advice for the same service (e.g. do NOT suggest Cancelling AND Upgrading/Keeping the same service). Cancellation advice overrides optimization.
    7. FORMATTING: Output "reason" as a single clean paragraph. Do NOT include trailing numbers, bullet points, or list indexes inside the text fields.
    
    IMPORTANT ON NEGATIVE FILTERING:
    - Analyzie "Dropped/Disliked" content to understand specific dislikes (e.g. "Too slow", "Bad acting"). 
    - DO NOT ban entire genres just because of one dropped show (e.g. Dropping "Big Bang Theory" does NOT mean they hate all Sitcoms, unless "Sitcoms" is listed in "Deal Breakers").
    - ONLY strictly exclude content if it falls under "Explicit Deal Breakers".
    
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
        # Remove trailing single digits, zeros, or "0.0" on new lines or at end of strings
        # Case 1: Newline followed by digit(s)
        txt = re.sub(r'[\r\n]+\s*\d+(\.0)?\s*$', '', txt)
        # Case 2: Space followed by digit(s) at very end (e.g. "text 0")
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

    # Enrich Picks and Filter Bad Ones
    if "picks" in data:
        # Pass country temporarily so the map executor can pick it up
        for p in data["picks"]:
            p["_country"] = country

        # Enrich all picks in parallel to avoid sequential network delays
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=6) as executor:
            list(executor.map(_enrich_item, data["picks"]))

        valid_picks = []
        seen_ids = set()

        # Build set of cleaned active subscription names
        active_sub_names = [s['name'].lower().replace(" ", "").replace("+", "") for s in active_subs]

        for r in data["picks"]:
            # Check 1: Must have valid TMDB ID and Poster
            if not r.get("tmdb_id") or not r.get("poster_path"):
                continue

            # Check 2: Quality Gate - Must have a reasonable rating (at least 5.5, never 0.0)
            rating = r.get("vote_average", 0.0) or 0.0
            if rating < 5.5:
                logger.info(f"Skipping Pick {r.get('title')} - low/zero rating ({rating})")
                continue

            # Check 3: Must NOT be in Watchlist
            if r.get("tmdb_id") in watchlist_ids:
                logger.info(f"Skipping Pick: {r.get('title')} - in watchlist")
                continue

            # Check 4: Must not be ignored
            if str(r.get("tmdb_id")) in ignored_ids:
                logger.info(f"Skipping Pick: {r.get('title')} - ignored")
                continue

            # Check 5: No duplicate within picks
            if r.get("tmdb_id") in seen_ids:
                continue

            # Check 6: Streamability on user's active services
            # Curator picks are explicitly "Tap to Watch (On your services)"
            provs = r.get("providers", [])
            if provs and active_sub_names:
                matches_active_sub = any(
                    any(sub_clean in p.replace(" ", "").replace("+", "") or p.replace(" ", "").replace("+", "") in sub_clean for sub_clean in active_sub_names)
                    for p in provs
                )
                if not matches_active_sub:
                    logger.info(f"Skipping Pick {r.get('title')} - not on active subs ({provs})")
                    continue

            valid_picks.append(r)
            seen_ids.add(r.get("tmdb_id"))

        logger.info(f"Curator Picks: {len(valid_picks)} valid after filtering.")
        data["picks"] = valid_picks[:6]
            
    # Enrich Gaps and Filter Bad Ones
    if "gaps" in data:
        # Pass country temporarily so the map executor can pick it up
        for g in data["gaps"]:
            g["_country"] = country

        # Enrich all gaps in parallel
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
            list(executor.map(_enrich_item, data["gaps"]))

        valid_gaps = []
        seen_ids = set()

        for gap in data["gaps"]:
            tmdb_id = gap.get("tmdb_id")
            if not tmdb_id or not gap.get("poster_path"):
                continue

            # Quality Gate: Never accept 0.0 or low rating (< 5.5)
            rating = gap.get("vote_average", 0.0) or 0.0
            if rating < 5.5:
                logger.info(f"Skipping Gap {gap.get('title')} - low/zero rating ({rating})")
                continue

            if tmdb_id in watchlist_ids:
                logger.info(f"Skipping Gap: {gap.get('title')} - in watchlist")
                continue
            if str(tmdb_id) in ignored_ids:
                logger.info(f"Skipping Gap: {gap.get('title')} - ignored")
                continue
            if tmdb_id not in seen_ids:
                valid_gaps.append(gap)
                seen_ids.add(tmdb_id)

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

        # Fetch watch providers for region (flatrate, ads, free)
        try:
            providers_data = tmdb_client.get_watch_providers(item['media_type'], item['tmdb_id'], region=country)
            all_provs = providers_data.get('flatrate', []) + providers_data.get('ads', []) + providers_data.get('free', [])
            item['providers'] = list({p['provider_name'].lower().strip() for p in all_provs if p.get('provider_name')})
        except Exception as e:
            logger.warning(f"Failed to fetch watch providers for {item['title']}: {e}")
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
