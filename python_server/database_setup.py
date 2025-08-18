# database_setup.py
import sqlite3

conn = sqlite3.connect('platform_data.db')
cursor = conn.cursor()

cursor.execute('''
CREATE TABLE IF NOT EXISTS funds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    api_symbol TEXT NOT NULL
)
''')

cursor.execute('''
CREATE TABLE IF NOT EXISTS configurations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_id INTEGER NOT NULL,
    nav_page_url TEXT,
    expert_price_page_url TEXT,
    nav_selector TEXT,
    total_units_selector TEXT,
    sellable_quantity_selector TEXT,
    expert_price_selector TEXT,
    FOREIGN KEY (fund_id) REFERENCES funds (id)
)
''')

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

conn.commit()
conn.close()

print("✅ Database and tables created successfully.")