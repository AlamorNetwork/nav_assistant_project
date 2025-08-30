#!/usr/bin/env python3
"""
Quick Setup for NAV Checker with Micheal Database
"""
import os
import psycopg2
import hashlib
import secrets

# Database configuration for Micheal
DB_URL = "postgresql://postgres:eOx5S0h4RFqejEGl@services.irn13.chabokan.net:50895/micheal"

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def quick_setup():
    try:
        print("🚀 Setting up NAV Checker on Micheal database...")
        print("📊 Database: micheal")
        print("🔗 Server: services.irn13.chabokan.net:50895")
        
        # Connect to database
        print("\n🔌 Connecting to database...")
        conn = psycopg2.connect(DB_URL)
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
        print("\n👤 Creating admin user...")
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
            INSERT INTO templates (name, tolerance) VALUES (%s, %s)
            ON CONFLICT (name) DO NOTHING
        """, ('rayan', 4.0))
        
        conn.commit()
        
        # Show summary
        cur.execute("SELECT username, role FROM users ORDER BY username")
        users = cur.fetchall()
        
        print(f"\n✅ Setup Complete!")
        print(f"📊 Database: micheal")
        print(f"🌐 Server: services.irn13.chabokan.net:50895")
        print(f"\n👥 Users:")
        for user in users:
            print(f"   - {user[0]} ({user[1]})")
        
        print(f"\n🔑 Login credentials:")
        print(f"   Username: admin")
        print(f"   Password: admin123")
        
        print(f"\n🚀 To start the server:")
        print(f"   cd python_server")
        print(f"   python3 main.py")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    quick_setup()
