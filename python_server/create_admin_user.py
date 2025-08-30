#!/usr/bin/env python3
import os
import psycopg2
import hashlib
import secrets

# Create admin user without resetting database
DB_URL = os.getenv('DB_URL', "postgresql://postgres:eOx5S0h4RFqejEGl@services.irn13.chabokan.net:50895/micheal")

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def create_admin_user():
    try:
        print("🔌 Connecting to database...")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        # Check if users table exists
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = 'users'
            );
        """)
        exists = cur.fetchone()[0]
        
        if not exists:
            print("📋 Creating users table...")
            cur.execute("""
                CREATE TABLE users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(128) NOT NULL,
                    role VARCHAR(32) DEFAULT 'user',
                    token VARCHAR(128),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            """)
            print("✅ Users table created!")
        else:
            print("✅ Users table already exists")
        
        # Check if admin user exists
        cur.execute("SELECT COUNT(*) FROM users WHERE username = %s", ('admin',))
        admin_exists = cur.fetchone()[0] > 0
        
        if admin_exists:
            print("👤 Admin user already exists")
            # Update password for existing admin
            new_password = "admin123"
            password_hash = hash_password(new_password)
            token = secrets.token_hex(32)
            
            cur.execute("""
                UPDATE users 
                SET password_hash = %s, token = %s, role = 'admin'
                WHERE username = %s
            """, (password_hash, token, 'admin'))
            
            print(f"🔄 Admin password updated to: {new_password}")
        else:
            # Create new admin user
            username = "admin"
            password = "admin123"
            password_hash = hash_password(password)
            token = secrets.token_hex(32)
            
            cur.execute("""
                INSERT INTO users (username, password_hash, role, token, created_at) 
                VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            """, (username, password_hash, 'admin', token))
            
            print(f"👤 Admin user created!")
            print(f"   Username: {username}")
            print(f"   Password: {password}")
        
        # Create a regular test user too
        cur.execute("SELECT COUNT(*) FROM users WHERE username = %s", ('test',))
        test_exists = cur.fetchone()[0] > 0
        
        if not test_exists:
            test_password = "test123"
            test_hash = hash_password(test_password)
            test_token = secrets.token_hex(32)
            
            cur.execute("""
                INSERT INTO users (username, password_hash, role, token, created_at) 
                VALUES (%s, %s, %s, %s, CURRENT_TIMESTAMP)
            """, ('test', test_hash, 'user', test_token))
            
            print(f"👤 Test user created!")
            print(f"   Username: test")
            print(f"   Password: {test_password}")
        
        conn.commit()
        
        # Show all users
        cur.execute("SELECT username, role, created_at FROM users ORDER BY username")
        users = cur.fetchall()
        
        print("\n📋 Current users in database:")
        for user in users:
            print(f"   - {user[0]} ({user[1]}) - created: {user[2]}")
        
        cur.close()
        conn.close()
        
        print("\n✅ Done! You can now login with:")
        print("   Username: admin")
        print("   Password: admin123")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    create_admin_user()
