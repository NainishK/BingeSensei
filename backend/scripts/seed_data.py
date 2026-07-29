import sys
import os

current_dir = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.dirname(current_dir)
sys.path.append(backend_dir)

from sqlalchemy.orm import Session
from database import SessionLocal, engine
import models

def seed_data():
    db = SessionLocal()
    try:
        models.Base.metadata.create_all(bind=engine)

        # Clear existing services/plans to re-seed clean accurate regional data for ALL 16 countries
        db.query(models.Plan).delete()
        db.query(models.Service).delete()
        
        services_data = [
            # ====================================================
            # 🇺🇸 UNITED STATES (US)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "US", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standard with ads", "cost": 6.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 15.49, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 22.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "US", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Prime Video Membership", "cost": 8.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "Amazon Prime (Full)", "cost": 14.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "US", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Basic (with ads)", "cost": 7.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "Premium (no ads)", "cost": 13.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "Apple TV+", "country": "US", "domain": "apple.com", "category": "OTT", "plans": [{"name": "Monthly Plan", "cost": 9.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "US", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 7.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 11.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "Hulu", "country": "US", "domain": "hulu.com", "category": "OTT", "plans": [{"name": "Ad-supported", "cost": 7.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "No Ads", "cost": 17.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "Max", "country": "US", "domain": "max.com", "category": "OTT", "plans": [{"name": "With Ads", "cost": 9.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "Ad-Free", "cost": 16.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "US", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 13.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "Family", "cost": 22.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "US", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 11.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "Family", "cost": 19.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "Apple Music", "country": "US", "domain": "music.apple.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 10.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "Family", "cost": 16.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "ChatGPT Plus", "country": "US", "domain": "openai.com", "category": "OTHER", "plans": [{"name": "Plus", "cost": 20.00, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "Xbox Game Pass", "country": "US", "domain": "xbox.com", "category": "OTHER", "plans": [{"name": "PC", "cost": 11.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}, {"name": "Ultimate", "cost": 19.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},
            {"name": "Dropbox", "country": "US", "domain": "dropbox.com", "category": "OTHER", "plans": [{"name": "Plus", "cost": 9.99, "currency": "USD", "country": "US", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇦🇺 AUSTRALIA (AU)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "AU", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standard with ads", "cost": 7.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 18.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 25.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "AU", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Prime Membership", "cost": 9.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "AU", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Standard", "cost": 13.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 17.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}]},
            {"name": "Apple TV+", "country": "AU", "domain": "apple.com", "category": "OTT", "plans": [{"name": "Monthly", "cost": 12.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "AU", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 10.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 13.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}]},
            {"name": "BINGE", "country": "AU", "domain": "binge.com.au", "category": "OTT", "plans": [{"name": "Basic", "cost": 10.00, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 19.00, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}]},
            {"name": "Stan", "country": "AU", "domain": "stan.com.au", "category": "OTT", "plans": [{"name": "Basic", "cost": 12.00, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 16.00, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}]},
            {"name": "Kayo Sports", "country": "AU", "domain": "kayosports.com.au", "category": "OTT", "plans": [{"name": "One", "cost": 25.00, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}, {"name": "Basic", "cost": 35.00, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "AU", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 16.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}, {"name": "Family", "cost": 32.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "AU", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 13.99, "currency": "AUD", "country": "AU", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇮🇳 INDIA (IN)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "IN", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Mobile", "cost": 149, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Basic", "cost": 199, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 499, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 649, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},
            {"name": "JioHotstar", "country": "IN", "domain": "jiohotstar.com", "category": "OTT", "plans": [{"name": "Monthly Base (with ads)", "cost": 149, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Premium Monthly", "cost": 299, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Premium Annual", "cost": 1499, "currency": "INR", "country": "IN", "billing_cycle": "yearly"}]},
            {"name": "Amazon Prime Video", "country": "IN", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Monthly", "cost": 299, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Annual", "cost": 1499, "currency": "INR", "country": "IN", "billing_cycle": "yearly"}]},
            {"name": "Apple TV+", "country": "IN", "domain": "apple.com", "category": "OTT", "plans": [{"name": "Monthly", "cost": 99, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "IN", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 79, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 99, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},
            {"name": "Zee5", "country": "IN", "domain": "zee5.com", "category": "OTT", "plans": [{"name": "Premium HD (Annual)", "cost": 899, "currency": "INR", "country": "IN", "billing_cycle": "yearly"}, {"name": "Premium Monthly", "cost": 199, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},
            {"name": "SonyLIV", "country": "IN", "domain": "sonyliv.com", "category": "OTT", "plans": [{"name": "LIV Premium Monthly", "cost": 299, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "LIV Premium Yearly", "cost": 999, "currency": "INR", "country": "IN", "billing_cycle": "yearly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "IN", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual Monthly", "cost": 149, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Family Monthly", "cost": 299, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Student Monthly", "cost": 79, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "IN", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 119, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Duo", "cost": 149, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Family", "cost": 179, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},
            {"name": "Apple Music", "country": "IN", "domain": "music.apple.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 99, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Voice", "cost": 49, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Family", "cost": 149, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},
            {"name": "ChatGPT Plus", "country": "IN", "domain": "openai.com", "category": "OTHER", "plans": [{"name": "Plus", "cost": 1999, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},
            {"name": "Xbox Game Pass", "country": "IN", "domain": "xbox.com", "category": "OTHER", "plans": [{"name": "PC", "cost": 349, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}, {"name": "Ultimate", "cost": 549, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},
            {"name": "Dropbox", "country": "IN", "domain": "dropbox.com", "category": "OTHER", "plans": [{"name": "Plus", "cost": 999, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},
            {"name": "FanCode", "country": "IN", "domain": "fancode.com", "category": "OTHER", "plans": [{"name": "Livestream Pass", "cost": 999, "currency": "INR", "country": "IN", "billing_cycle": "yearly"}, {"name": "Monthly Pass", "cost": 199, "currency": "INR", "country": "IN", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇬🇧 UNITED KINGDOM (GB)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "GB", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standard with ads", "cost": 4.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 10.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 17.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "GB", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Prime Video", "cost": 5.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Full Amazon Prime", "cost": 8.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "GB", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Standard with Ads", "cost": 4.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 7.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 10.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},
            {"name": "Apple TV+", "country": "GB", "domain": "apple.com", "category": "OTT", "plans": [{"name": "Monthly", "cost": 8.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "GB", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 4.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 6.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},
            {"name": "NOW (Sky)", "country": "GB", "domain": "nowtv.com", "category": "OTT", "plans": [{"name": "Entertainment Membership", "cost": 9.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Cinema Membership", "cost": 9.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Sports Membership", "cost": 34.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},
            {"name": "ITVX Premium", "country": "GB", "domain": "itv.com", "category": "OTT", "plans": [{"name": "Monthly", "cost": 5.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "GB", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 12.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Family", "cost": 19.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "GB", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 11.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Family", "cost": 19.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},
            {"name": "Apple Music", "country": "GB", "domain": "music.apple.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 10.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},
            {"name": "Xbox Game Pass", "country": "GB", "domain": "xbox.com", "category": "OTHER", "plans": [{"name": "PC", "cost": 9.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}, {"name": "Ultimate", "cost": 14.99, "currency": "GBP", "country": "GB", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇩🇪 GERMANY (DE)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "DE", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standard mit Werbung", "cost": 4.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 13.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 19.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "DE", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Prime Membership", "cost": 8.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "DE", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Standard mit Werbung", "cost": 5.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 8.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 11.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}]},
            {"name": "Apple TV+", "country": "DE", "domain": "apple.com", "category": "OTT", "plans": [{"name": "Monatlich", "cost": 9.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "DE", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 6.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 8.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}]},
            {"name": "WOW (Sky Deutschland)", "country": "DE", "domain": "wowtv.de", "category": "OTT", "plans": [{"name": "Filme & Serien", "cost": 9.98, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}, {"name": "Live-Sport", "cost": 29.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}]},
            {"name": "RTL+", "country": "DE", "domain": "rtl.de", "category": "OTT", "plans": [{"name": "Basic", "cost": 5.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}, {"name": "Max", "cost": 12.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "DE", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Einzelperson", "cost": 12.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}, {"name": "Familie", "cost": 17.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "DE", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 10.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}, {"name": "Family", "cost": 17.99, "currency": "EUR", "country": "DE", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇯🇵 JAPAN (JP)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "JP", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standard with ads", "cost": 790, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 1490, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 1980, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "JP", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Monthly Plan", "cost": 600, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "JP", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Standard", "cost": 990, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 1320, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}]},
            {"name": "Apple TV+", "country": "JP", "domain": "apple.com", "category": "OTT", "plans": [{"name": "Monthly", "cost": 900, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "JP", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 790, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 1100, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}]},
            {"name": "U-NEXT", "country": "JP", "domain": "unext.jp", "category": "OTT", "plans": [{"name": "Monthly Plan", "cost": 2189, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}]},
            {"name": "Hulu Japan", "country": "JP", "domain": "hulu.jp", "category": "OTT", "plans": [{"name": "Monthly Plan", "cost": 1026, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}]},
            {"name": "Abema Premium", "country": "JP", "domain": "abema.tv", "category": "OTT", "plans": [{"name": "Monthly Plan", "cost": 960, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "JP", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 1280, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}, {"name": "Family", "cost": 2280, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "JP", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Standard", "cost": 980, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}, {"name": "Family", "cost": 1580, "currency": "JPY", "country": "JP", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇨🇦 CANADA (CA)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "CA", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standard with ads", "cost": 5.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 16.49, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 20.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "CA", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Prime Membership", "cost": 9.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "CA", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Standard with Ads", "cost": 7.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 11.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}]},
            {"name": "Apple TV+", "country": "CA", "domain": "apple.com", "category": "OTT", "plans": [{"name": "Monthly", "cost": 12.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "CA", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 9.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 12.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}]},
            {"name": "Crave", "country": "CA", "domain": "crave.ca", "category": "OTT", "plans": [{"name": "Basic with Ads", "cost": 9.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}, {"name": "Standard (No Ads)", "cost": 22.00, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}]},
            {"name": "Sportsnet+", "country": "CA", "domain": "sportsnet.ca", "category": "OTT", "plans": [{"name": "Standard", "cost": 19.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "CA", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 12.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}, {"name": "Family", "cost": 22.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "CA", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 10.99, "currency": "CAD", "country": "CA", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇵🇭 PHILIPPINES (PH)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "PH", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Mobile", "cost": 149, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}, {"name": "Basic", "cost": 249, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 399, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "PH", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Monthly", "cost": 149, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "PH", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Basic", "cost": 249, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}, {"name": "Premium", "cost": 519, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "PH", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 79, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 99, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}]},
            {"name": "HBO GO Asia", "country": "PH", "domain": "hbogoasia.ph", "category": "OTT", "plans": [{"name": "Monthly", "cost": 199, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}]},
            {"name": "Viu Philippines", "country": "PH", "domain": "viu.com", "category": "OTT", "plans": [{"name": "Premium Monthly", "cost": 99, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "PH", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 159, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}, {"name": "Family", "cost": 239, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "PH", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 149, "currency": "PHP", "country": "PH", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇸🇬 SINGAPORE (SG)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "SG", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standard with ads", "cost": 6.98, "currency": "SGD", "country": "SG", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 17.48, "currency": "SGD", "country": "SG", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "SG", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Monthly", "cost": 4.99, "currency": "SGD", "country": "SG", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "SG", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Standard", "cost": 12.98, "currency": "SGD", "country": "SG", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "SG", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 4.98, "currency": "SGD", "country": "SG", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 6.98, "currency": "SGD", "country": "SG", "billing_cycle": "monthly"}]},
            {"name": "mewatch", "country": "SG", "domain": "mewatch.sg", "category": "OTT", "plans": [{"name": "Prime", "cost": 9.90, "currency": "SGD", "country": "SG", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "SG", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 11.98, "currency": "SGD", "country": "SG", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "SG", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 10.98, "currency": "SGD", "country": "SG", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇳🇿 NEW ZEALAND (NZ)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "NZ", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standard with ads", "cost": 7.99, "currency": "NZD", "country": "NZ", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "NZ", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Monthly", "cost": 10.99, "currency": "NZD", "country": "NZ", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "NZ", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Standard", "cost": 14.99, "currency": "NZD", "country": "NZ", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "NZ", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 11.99, "currency": "NZD", "country": "NZ", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 14.99, "currency": "NZD", "country": "NZ", "billing_cycle": "monthly"}]},
            {"name": "Neon", "country": "NZ", "domain": "neontv.co.nz", "category": "OTT", "plans": [{"name": "Basic", "cost": 12.99, "currency": "NZD", "country": "NZ", "billing_cycle": "monthly"}, {"name": "Standard", "cost": 19.99, "currency": "NZD", "country": "NZ", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "NZ", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 15.99, "currency": "NZD", "country": "NZ", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "NZ", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 16.99, "currency": "NZD", "country": "NZ", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇧🇷 BRAZIL (BR)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "BR", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Padrão com anúncios", "cost": 18.90, "currency": "BRL", "country": "BR", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "BR", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Mensal", "cost": 19.90, "currency": "BRL", "country": "BR", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "BR", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Padrão", "cost": 43.90, "currency": "BRL", "country": "BR", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "BR", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 14.90, "currency": "BRL", "country": "BR", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 19.90, "currency": "BRL", "country": "BR", "billing_cycle": "monthly"}]},
            {"name": "Globoplay", "country": "BR", "domain": "globoplay.globo.com", "category": "OTT", "plans": [{"name": "Padrão", "cost": 27.90, "currency": "BRL", "country": "BR", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "BR", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 24.90, "currency": "BRL", "country": "BR", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "BR", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 21.90, "currency": "BRL", "country": "BR", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇲🇽 MEXICO (MX)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "MX", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Estándar con anuncios", "cost": 99, "currency": "MXN", "country": "MX", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "MX", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Mensual", "cost": 99, "currency": "MXN", "country": "MX", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "MX", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Estándar con anuncios", "cost": 129, "currency": "MXN", "country": "MX", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "MX", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 119, "currency": "MXN", "country": "MX", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 149, "currency": "MXN", "country": "MX", "billing_cycle": "monthly"}]},
            {"name": "ViX Premium", "country": "MX", "domain": "vix.com", "category": "OTT", "plans": [{"name": "Mensual", "cost": 119, "currency": "MXN", "country": "MX", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "MX", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 139, "currency": "MXN", "country": "MX", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "MX", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 129, "currency": "MXN", "country": "MX", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇪🇸 SPAIN (ES)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "ES", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Estándar con anuncios", "cost": 5.49, "currency": "EUR", "country": "ES", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "ES", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Suscripción Mensual", "cost": 4.99, "currency": "EUR", "country": "ES", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "ES", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Estándar con anuncios", "cost": 5.99, "currency": "EUR", "country": "ES", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "ES", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 4.99, "currency": "EUR", "country": "ES", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 6.49, "currency": "EUR", "country": "ES", "billing_cycle": "monthly"}]},
            {"name": "Movistar Plus+", "country": "ES", "domain": "movistar.es", "category": "OTT", "plans": [{"name": "Suscripción Mensual", "cost": 9.99, "currency": "EUR", "country": "ES", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "ES", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 11.99, "currency": "EUR", "country": "ES", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "ES", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 10.99, "currency": "EUR", "country": "ES", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇮🇹 ITALY (IT)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "IT", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standard con pubblicità", "cost": 5.49, "currency": "EUR", "country": "IT", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "IT", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Abbonamento Mensile", "cost": 4.99, "currency": "EUR", "country": "IT", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "IT", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Standard con pubblicità", "cost": 5.99, "currency": "EUR", "country": "IT", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "IT", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 4.99, "currency": "EUR", "country": "IT", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 6.49, "currency": "EUR", "country": "IT", "billing_cycle": "monthly"}]},
            {"name": "NOW Italy", "country": "IT", "domain": "nowtv.it", "category": "OTT", "plans": [{"name": "Pass Cinema e Serie TV", "cost": 9.99, "currency": "EUR", "country": "IT", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "IT", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 11.99, "currency": "EUR", "country": "IT", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "IT", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 10.99, "currency": "EUR", "country": "IT", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇳🇱 NETHERLANDS (NL)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "NL", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standaard met reclame", "cost": 5.99, "currency": "EUR", "country": "NL", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "NL", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Maandelijks", "cost": 4.99, "currency": "EUR", "country": "NL", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "NL", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Standaard", "cost": 9.99, "currency": "EUR", "country": "NL", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "NL", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 4.99, "currency": "EUR", "country": "NL", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 6.49, "currency": "EUR", "country": "NL", "billing_cycle": "monthly"}]},
            {"name": "Videoland", "country": "NL", "domain": "videoland.com", "category": "OTT", "plans": [{"name": "Basis", "cost": 4.99, "currency": "EUR", "country": "NL", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "NL", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 11.99, "currency": "EUR", "country": "NL", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "NL", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 10.99, "currency": "EUR", "country": "NL", "billing_cycle": "monthly"}]},

            # ====================================================
            # 🇫🇷 FRANCE (FR)
            # ====================================================
            # OTT
            {"name": "Netflix", "country": "FR", "domain": "netflix.com", "category": "OTT", "plans": [{"name": "Standard avec pub", "cost": 5.99, "currency": "EUR", "country": "FR", "billing_cycle": "monthly"}]},
            {"name": "Amazon Prime Video", "country": "FR", "domain": "primevideo.com", "category": "OTT", "plans": [{"name": "Abonnement Mensuel", "cost": 6.99, "currency": "EUR", "country": "FR", "billing_cycle": "monthly"}]},
            {"name": "Disney+", "country": "FR", "domain": "disneyplus.com", "category": "OTT", "plans": [{"name": "Standard avec pub", "cost": 5.99, "currency": "EUR", "country": "FR", "billing_cycle": "monthly"}]},
            {"name": "Crunchyroll", "country": "FR", "domain": "crunchyroll.com", "category": "OTT", "plans": [{"name": "Fan", "cost": 4.99, "currency": "EUR", "country": "FR", "billing_cycle": "monthly"}, {"name": "Mega Fan", "cost": 6.49, "currency": "EUR", "country": "FR", "billing_cycle": "monthly"}]},
            {"name": "Canal+", "country": "FR", "domain": "canalplus.com", "category": "OTT", "plans": [{"name": "Offre de base", "cost": 22.99, "currency": "EUR", "country": "FR", "billing_cycle": "monthly"}]},
            # OTHER
            {"name": "YouTube Premium", "country": "FR", "domain": "youtube.com", "category": "OTHER", "plans": [{"name": "Individuel", "cost": 12.99, "currency": "EUR", "country": "FR", "billing_cycle": "monthly"}]},
            {"name": "Spotify", "country": "FR", "domain": "spotify.com", "category": "OTHER", "plans": [{"name": "Individual", "cost": 10.99, "currency": "EUR", "country": "FR", "billing_cycle": "monthly"}]}
        ]

        for svc in services_data:
            domain = svc.get("domain", "")
            logo_url = f"https://www.google.com/s2/favicons?sz=128&domain={domain}" if domain else None
            
            service = models.Service(
                name=svc["name"],
                country=svc.get("country", "US"),
                logo_url=logo_url,
                category=svc.get("category", "OTT")
            )
            db.add(service)
            db.commit()
            db.refresh(service)
            
            for plan in svc["plans"]:
                db_plan = models.Plan(
                    service_id=service.id,
                    name=plan["name"],
                    cost=plan["cost"],
                    currency=plan.get("currency", "USD"),
                    billing_cycle=plan.get("billing_cycle", "monthly"),
                    country=plan.get("country", "US")
                )
                db.add(db_plan)
            
        db.commit()
        print("Seed data inserted successfully for ALL 16 supported countries with Global Giants (including Crunchyroll) + Regional Favorites!")

    except Exception as e:
        print(f"Error seeding data: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
