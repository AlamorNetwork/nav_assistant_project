#!/usr/bin/env python3
import os
import psycopg2
from psycopg2 import sql
import hashlib
import secrets

# Create separate database for NAV Checker
ADMIN_DB_URL = "postgresql://postgres:eOx5S0h4RFqejEGl@services.irn13.chabokan.net:50895/postgres"
NEW_DB_NAME = "micheal"
NEW_DB_URL = f"postgresql://postgres:eOx5S0h4RFqejEGl@services.irn13.chabokan.net:50895/{NEW_DB_NAME}"

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def create_database_and_setup():
    try:
        print("🔌 Connecting to PostgreSQL admin database...")
        
        # Connect to postgres admin database to create new database
        admin_conn = psycopg2.connect(ADMIN_DB_URL)
        admin_conn.autocommit = True
        admin_cur = admin_conn.cursor()
        
        # Check if database exists
        admin_cur.execute("""
            SELECT 1 FROM pg_database WHERE datname = %s
        """, (NEW_DB_NAME,))
        
        if admin_cur.fetchone():
            print(f"✅ Database '{NEW_DB_NAME}' already exists")
        else:
            print(f"📊 Creating database '{NEW_DB_NAME}'...")
            admin_cur.execute(sql.SQL("CREATE DATABASE {}").format(
                sql.Identifier(NEW_DB_NAME)
            ))
            print(f"✅ Database '{NEW_DB_NAME}' created!")
        
        admin_cur.close()
        admin_conn.close()
        
        # Now connect to the new database and create tables
        print(f"🔌 Connecting to new database '{NEW_DB_NAME}'...")
        conn = psycopg2.connect(NEW_DB_URL)
        cur = conn.cursor()
        
        print("📋 Creating tables...")
        
        # Users table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username VARCHAR(255) UNIQUE NOT NULL,
                password_hash VARCHAR(128) NOT NULL,
                role VARCHAR(32) DEFAULT 'user',
                token VARCHAR(128),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Funds table
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
        
        # Configurations table
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
        
        # Templates table
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
        
        # User-funds mapping table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_funds (
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                fund_id INTEGER REFERENCES funds(id) ON DELETE CASCADE,
                PRIMARY KEY (user_id, fund_id)
            );
        """)
        
        # Logs table
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
        
        print("✅ All tables created!")
        
        # Create admin user
        print("👤 Creating admin user...")
        username = "admin"
        password = "admin123"
        password_hash = hash_password(password)
        token = secrets.token_hex(32)
        
        cur.execute("""
            INSERT INTO users (username, password_hash, role, token, created_at) 
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                token = EXCLUDED.token,
                role = EXCLUDED.role
        """, (username, password_hash, 'admin', token))
        
        # Create test user
        print("👤 Creating test user...")
        test_password = "test123"
        test_hash = hash_password(test_password)
        test_token = secrets.token_hex(32)
        
        cur.execute("""
            INSERT INTO users (username, password_hash, role, token, created_at) 
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                token = EXCLUDED.token
        """, ('test', test_hash, 'user', test_token))
        
        # Add default template
        print("📝 Adding default template...")
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
        
        # Show summary
        cur.execute("SELECT username, role FROM users ORDER BY username")
        users = cur.fetchall()
        
        print(f"\n✅ NAV Checker database setup complete!")
        print(f"📊 Database: {NEW_DB_NAME}")
        print(f"🔗 URL: {NEW_DB_URL}")
        print(f"\n👥 Users created:")
        for user in users:
            print(f"   - {user[0]} ({user[1]})")
        
        print(f"\n🔑 Login credentials:")
        print(f"   Admin: admin / admin123")
        print(f"   Test:  test / test123")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    create_database_and_setup()
