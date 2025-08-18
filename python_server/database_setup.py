import sqlite3

# به فایل دیتابیس متصل می‌شویم (اگر وجود نداشته باشد، ایجاد می‌شود)
conn = sqlite3.connect('platform_data.db')
cursor = conn.cursor()

# --- جدول ۱: صندوق‌ها ---
cursor.execute('''
CREATE TABLE IF NOT EXISTS funds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    api_symbol TEXT NOT NULL
)
''')
print("Table 'funds' created successfully.")

# --- جدول ۲: پیکربندی‌ها (نسخه نهایی با تمام سلکتورها) ---
cursor.execute('''
CREATE TABLE IF NOT EXISTS configurations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fund_id INTEGER NOT NULL,
    
    -- Page URLs
    nav_page_url TEXT,
    expert_price_page_url TEXT,
    
    -- Selectors for NAV Page (وضعیت ارزش صندوق)
    date_selector TEXT,
    time_selector TEXT,
    nav_price_selector TEXT,
    total_units_selector TEXT,
    nav_search_button_selector TEXT,
    
    -- Selectors for Expert Price Page (قیمت کارشناسی)
    securities_list_selector TEXT,
    sellable_quantity_selector TEXT,
    expert_price_selector TEXT,
    increase_rows_selector TEXT,
    expert_search_button_selector TEXT,

    FOREIGN KEY (fund_id) REFERENCES funds (id)
)
''')
print("Table 'configurations' created successfully.")

# --- جدول ۳: گزارش‌ها ---
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
print("Table 'logs' created successfully.")

# تغییرات را ذخیره کرده و اتصال را می‌بندیم
conn.commit()
conn.close()

print("\n✅ Database 'platform_data.db' and its tables are ready.")