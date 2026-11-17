import os
import sqlalchemy
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

def get_engine():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        database_url = "sqlite:///./sql_app.db"
    if database_url.startswith("postgres://"):
        database_url = database_url.replace("postgres://", "postgresql://", 1)
    return create_engine(database_url)

def run_migration():
    engine = get_engine()
    is_sqlite = "sqlite" in str(engine.url)
    print(f"Connecting to Database ({'SQLite' if is_sqlite else 'PostgreSQL'})...")
    
    with engine.connect() as conn:
        print("Checking schema...")
        
        # Table, Column, Postgres DDL, SQLite DDL
        columns_to_add = [
            ("users", "google_id", "TEXT", "TEXT"),
            ("users", "avatar_url", "TEXT", "TEXT"),
            ("users", "preferences", "TEXT", "TEXT"),
            ("users", "ai_allowed", "BOOLEAN DEFAULT FALSE", "BOOLEAN DEFAULT 0"),
            ("users", "ai_access_status", "TEXT DEFAULT 'none'", "TEXT DEFAULT 'none'"),
            ("users", "ai_quota_policy", "TEXT DEFAULT 'unlimited'", "TEXT DEFAULT 'unlimited'"),
            ("users", "ai_request_limit", "INTEGER DEFAULT 5", "INTEGER DEFAULT 5"),
            ("users", "ai_usage_count", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
            ("users", "last_ai_usage", "TIMESTAMP WITH TIME ZONE", "DATETIME"),

            ("subscriptions", "country", "TEXT DEFAULT 'US'", "TEXT DEFAULT 'US'"),
            ("subscriptions", "category", "TEXT DEFAULT 'OTT'", "TEXT DEFAULT 'OTT'"),

            ("watchlist_items", "total_seasons", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
            ("watchlist_items", "total_episodes", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
            ("watchlist_items", "current_season", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
            ("watchlist_items", "current_episode", "INTEGER DEFAULT 0", "INTEGER DEFAULT 0"),
            ("watchlist_items", "original_language", "TEXT", "TEXT"),
            ("watchlist_items", "notes", "TEXT", "TEXT"),
            ("watchlist_items", "is_followed", "BOOLEAN DEFAULT FALSE", "BOOLEAN DEFAULT 0"),
            ("watchlist_items", "next_air_date", "DATE", "DATE"),
            ("watchlist_items", "next_episode_season", "INTEGER", "INTEGER"),
            ("watchlist_items", "next_episode_number", "INTEGER", "INTEGER"),
            ("watchlist_items", "next_episode_name", "TEXT", "TEXT"),
            ("watchlist_items", "last_air_date", "DATE", "DATE"),
            ("watchlist_items", "last_episode_season", "INTEGER", "INTEGER"),
            ("watchlist_items", "last_episode_number", "INTEGER", "INTEGER"),
            ("watchlist_items", "last_episode_name", "TEXT", "TEXT"),
            ("watchlist_items", "last_episode_still", "TEXT", "TEXT"),
            ("watchlist_items", "air_status", "TEXT", "TEXT"),
            ("watchlist_items", "last_air_check", "TIMESTAMP WITH TIME ZONE", "DATETIME"),
        ]
        
        for table, col, pg_dtype, sqlite_dtype in columns_to_add:
            try:
                if not is_sqlite:
                    # PostgreSQL natively supports "ADD COLUMN IF NOT EXISTS"
                    sql = text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {pg_dtype};")
                    conn.execute(sql)
                    conn.commit()
                    print(f"   Verified/Added {col} to {table} (Postgres)")
                else:
                    # SQLite does not support IF NOT EXISTS on ADD COLUMN
                    sql = text(f"ALTER TABLE {table} ADD COLUMN {col} {sqlite_dtype};")
                    conn.execute(sql)
                    conn.commit()
                    print(f"   Added {col} to {table} (SQLite)")
            except Exception as e:
                conn.rollback()
                err_str = str(e).lower()
                if "already exists" in err_str or "duplicate column name" in err_str:
                    print(f"   Column {col} on {table} already exists (Skipping)")
                else:
                    print(f"   Error adding {col} to {table}: {e}")

        # Unique index for google_id
        try:
            index_sql = text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_id ON users (google_id);")
            conn.execute(index_sql)
            conn.commit()
            print("   Verified index ix_users_google_id")
        except Exception as e:
            conn.rollback()
            print(f"   Note on ix_users_google_id: {e}")

        print("Schema Migration Complete")

if __name__ == "__main__":
    try:
        run_migration()
        print("\nMigration Complete!")
    except Exception as e:
        print(f"\nMigration Failed: {e}")
