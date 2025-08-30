#!/usr/bin/env python3
"""
NAV Checker Complete Setup Script
Creates database, tables, and initial data from scratch
"""
import os
import psycopg2
from psycopg2 import sql
import hashlib
import secrets
from config import print_config

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def setup_nav_checker():
    """Complete setup for NAV Checker project"""
    
    print("🚀 Setting up NAV Checker...")
    print_config()
    
    # Get database configuration from user
    print("\n📋 Database Setup")
    print("Please provide your database details:")
    
    db_host = input("Database Host (e.g., localhost): ").strip() or "localhost"
    db_port = input("Database Port (default: 5432): ").strip() or "5432"
    db_user = input("Database Username: ").strip()
    db_password = input("Database Password: ").strip()
    db_name = input("Database Name (default: nav_checker): ").strip() or "nav_checker"
    
    # Construct database URLs
    admin_db_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/postgres"
    target_db_url = f"postgresql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    try:
        # Connect to admin database to create target database
        print(f"\n🔌 Connecting to PostgreSQL...")
        admin_conn = psycopg2.connect(admin_db_url)
        admin_conn.autocommit = True
        admin_cur = admin_conn.cursor()
        
        # Check if database exists
        admin_cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (db_name,))
        
        if admin_cur.fetchone():
            print(f"✅ Database '{db_name}' already exists")
        else:
            print(f"📊 Creating database '{db_name}'...")
            admin_cur.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(db_name)))
            print(f"✅ Database '{db_name}' created!")
        
        admin_cur.close()
        admin_conn.close()
        
        # Connect to target database
        print(f"🔌 Connecting to '{db_name}' database...")
        conn = psycopg2.connect(target_db_url)
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
        
        # Create users
        print("\n👤 Creating users...")
        
        # Admin user
        admin_username = input("Admin username (default: admin): ").strip() or "admin"
        admin_password = input("Admin password (default: admin123): ").strip() or "admin123"
        admin_hash = hash_password(admin_password)
        admin_token = secrets.token_hex(32)
        
        cur.execute("""
            INSERT INTO users (username, password_hash, role, token, created_at) 
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                token = EXCLUDED.token,
                role = EXCLUDED.role
        """, (admin_username, admin_hash, 'admin', admin_token))
        
        # Test user  
        cur.execute("""
            INSERT INTO users (username, password_hash, role, token, created_at) 
            VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            ON CONFLICT (username) DO UPDATE SET
                password_hash = EXCLUDED.password_hash,
                token = EXCLUDED.token
        """, ('test', hash_password('test123'), 'user', secrets.token_hex(32)))
        
        # Add default template
        print("📝 Adding default template...")
        cur.execute("""
            INSERT INTO templates (name, tolerance) VALUES (%s, %s)
            ON CONFLICT (name) DO NOTHING
        """, ('rayan', 4.0))
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Create .env file
        print("\n📝 Creating .env file...")
        env_content = f"""# NAV Checker Environment Configuration

# Database Configuration
NAV_DB_URL={target_db_url}

# Telegram Configuration (optional)
NAV_BOT_TOKEN=
NAV_ADMIN_CHAT_ID=

# API Configuration
NAV_API_HOST=0.0.0.0
NAV_API_PORT=8001
NAV_DEBUG=false

# Security
NAV_SECRET_KEY={secrets.token_hex(32)}

# Logging
LOG_LEVEL=INFO
"""
        
        with open('.env', 'w', encoding='utf-8') as f:
            f.write(env_content)
        
        print("✅ .env file created!")
        
        # Summary
        print(f"\n🎉 Setup Complete!")
        print(f"📊 Database: {db_name}")
        print(f"🔗 URL: {target_db_url}")
        print(f"👤 Admin User: {admin_username}")
        print(f"🔑 Admin Password: {admin_password}")
        print(f"📝 Configuration: .env file created")
        
        print(f"\n🚀 To start the server:")
        print(f"   cd python_server")
        print(f"   pip install -r requirements.txt")
        print(f"   python main.py")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    setup_nav_checker()
