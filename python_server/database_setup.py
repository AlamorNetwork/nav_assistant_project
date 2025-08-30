import os
import psycopg2

# This script initializes PostgreSQL schema using DB_URL env
# Use separate database for NAV Checker
DB_URL = os.getenv('DB_URL', "postgresql://postgres:eOx5S0h4RFqejEGl@services.irn13.chabokan.net:50895/micheal")
if not DB_URL:
    raise SystemExit("DB_URL is not set. Example: postgresql://user:pass@host:5432/dbname")

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# --- Drop and recreate schema ---
print("🗑️ Dropping existing schema...")
cur.execute("DROP SCHEMA public CASCADE")
cur.execute("CREATE SCHEMA public")
cur.execute("GRANT ALL ON SCHEMA public TO postgres")
cur.execute("GRANT ALL ON SCHEMA public TO public")
conn.commit()
print("✅ Schema reset completed")

# --- Tables ---
cur.execute("""
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    role VARCHAR(32) DEFAULT 'user',
    token VARCHAR(128),
    created_at TIMESTAMP
);
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS funds (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    api_symbol VARCHAR(255) NOT NULL,
    type VARCHAR(64) DEFAULT 'rayan',
    nav_page_url TEXT,
    expert_price_page_url TEXT,
    owner_user_id INTEGER REFERENCES users(id)
);
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS configurations (
    id SERIAL PRIMARY KEY,
    fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
    tolerance DOUBLE PRECISION DEFAULT 4.0,
    nav_page_url TEXT,
    expert_price_page_url TEXT,
    date_selector TEXT,
    time_selector TEXT,
    nav_price_selector TEXT,
    total_units_selector TEXT,
    nav_search_button_selector TEXT,
    securities_list_selector TEXT,
    sellable_quantity_selector TEXT,
    expert_price_selector TEXT,
    increase_rows_selector TEXT,
    expert_search_button_selector TEXT
);
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS logs (
    id SERIAL PRIMARY KEY,
    fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
    timestamp TIMESTAMP NOT NULL,
    nav_on_page DOUBLE PRECISION,
    total_units DOUBLE PRECISION,
    sellable_quantity DOUBLE PRECISION,
    expert_price DOUBLE PRECISION,
    board_price DOUBLE PRECISION,
    suggested_price DOUBLE PRECISION,
    status VARCHAR(255)
);
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS templates (
    name VARCHAR(255) PRIMARY KEY,
    tolerance DOUBLE PRECISION DEFAULT 4.0,
    nav_page_url TEXT,
    expert_price_page_url TEXT,
    date_selector TEXT,
    time_selector TEXT,
    nav_price_selector TEXT,
    total_units_selector TEXT,
    nav_search_button_selector TEXT,
    securities_list_selector TEXT,
    sellable_quantity_selector TEXT,
    expert_price_selector TEXT,
    increase_rows_selector TEXT,
    expert_search_button_selector TEXT
);
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS templates (
    name VARCHAR(255) PRIMARY KEY,
    tolerance DOUBLE PRECISION DEFAULT 4.0,
    nav_page_url TEXT,
    expert_price_page_url TEXT,
    date_selector TEXT,
    time_selector TEXT,
    nav_price_selector TEXT,
    total_units_selector TEXT,
    nav_search_button_selector TEXT,
    securities_list_selector TEXT,
    sellable_quantity_selector TEXT,
    expert_price_selector TEXT,
    increase_rows_selector TEXT,
    expert_search_button_selector TEXT
);
""")

cur.execute("""
CREATE TABLE IF NOT EXISTS user_funds (
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    fund_id INTEGER REFERENCES funds(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, fund_id)
);
""")

conn.commit()
cur.close(); conn.close()
print("\n✅ PostgreSQL schema is ready.")


