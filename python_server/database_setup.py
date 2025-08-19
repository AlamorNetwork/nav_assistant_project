import sqlite3

# This script creates the final database structure.
# Run this once after deleting the old .db file to apply changes.

conn = sqlite3.connect('platform_data.db')
cursor = conn.cursor()

# --- Table 1: funds ---
cursor.execute('''
CREATE TABLE IF NOT EXISTS funds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    api_symbol TEXT NOT NULL,
    type TEXT DEFAULT 'rayan'
)
''')

# --- Table 2: configurations (UPDATED with 'tolerance' column) ---
cursor.execute('''
CREATE TABLE IF NOT EXISTS configurations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_id INTEGER NOT NULL,
    
    -- Main settings
    tolerance REAL DEFAULT 4.0,

    -- Page URLs
    nav_page_url TEXT,
    expert_price_page_url TEXT,
    
    -- Selectors for NAV Page
    date_selector TEXT,
    time_selector TEXT,
    nav_price_selector TEXT,
    total_units_selector TEXT,
    nav_search_button_selector TEXT,
    
    -- Selectors for Expert Price Page
    securities_list_selector TEXT,
    sellable_quantity_selector TEXT,
    expert_price_selector TEXT,
    increase_rows_selector TEXT,
    expert_search_button_selector TEXT,

    FOREIGN KEY (fund_id) REFERENCES funds (id)
)
''')

# --- Table 3: logs ---
cursor.execute('''
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_id INTEGER NOT NULL,
    timestamp TEXT NOT NULL,
    nav_on_page REAL,
    total_units REAL,
    sellable_quantity REAL,
    expert_price REAL,
    board_price REAL,
    suggested_price REAL,
    status TEXT,
    FOREIGN KEY (fund_id) REFERENCES funds (id)
)
''')

# --- Table 0: users ---
cursor.execute('''
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user',
    token TEXT,
    created_at TEXT
)
''')

# Add owner_user_id to funds if not exists (best-effort)
try:
    cursor.execute('ALTER TABLE funds ADD COLUMN owner_user_id INTEGER')
except Exception:
    pass

conn.commit()
conn.close()
print("\n✅ Database 'platform_data.db' and its tables are ready.")