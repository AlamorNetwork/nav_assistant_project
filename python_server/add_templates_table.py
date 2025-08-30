#!/usr/bin/env python3
import os
import psycopg2

# Add missing templates table without resetting the database
DB_URL = os.getenv('DB_URL', "postgresql://postgres:NgkHDf7BA2PWt5eT@services.irn9.chabokan.net:17021/helen")

def add_templates_table():
    try:
        print("🔌 Connecting to database...")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        # Check if templates table exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'templates'
            );
        """)
        exists = cur.fetchone()[0]
        
        if exists:
            print("✅ Templates table already exists")
        else:
            print("📋 Creating templates table...")
            cur.execute("""
                CREATE TABLE templates (
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
            
            # Add some default templates
            print("📝 Adding default templates...")
            cur.execute("""
                INSERT INTO templates (name, tolerance, date_selector, time_selector, nav_price_selector, total_units_selector, nav_search_button_selector, securities_list_selector, sellable_quantity_selector, expert_price_selector, increase_rows_selector, expert_search_button_selector) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (name) DO NOTHING
            """, (
                'rayan',
                4.0,
                'td[contains(@class, "date")]',
                'td[contains(@class, "time")]', 
                'td[contains(@class, "nav")]',
                'td[contains(@class, "units")]',
                'input[value="جستجو"]',
                'tr td:first-child',
                'td:nth-child(3)',
                'td:nth-child(12)',
                'input[name="rows"]',
                'input[value="جستجو"]'
            ))
            
            conn.commit()
            print("✅ Templates table created successfully!")
            
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    add_templates_table()
