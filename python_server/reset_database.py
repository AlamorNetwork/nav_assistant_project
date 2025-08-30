#!/usr/bin/env python3
import os
import psycopg2
from psycopg2.extras import RealDictCursor

# Database connection details
DB_URL = os.getenv('DB_URL', "postgresql://postgres:eOx5S0h4RFqejEGl@services.irn13.chabokan.net:50895/micheal")

def reset_database():
    try:
        print("Connecting to database...")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        print("Dropping public schema...")
        cur.execute("DROP SCHEMA public CASCADE")
        
        print("Creating new public schema...")
        cur.execute("CREATE SCHEMA public")
        
        print("Granting permissions...")
        cur.execute("GRANT ALL ON SCHEMA public TO postgres")
        cur.execute("GRANT ALL ON SCHEMA public TO public")
        
        conn.commit()
        cur.close()
        conn.close()
        
        print("✅ Database schema reset successfully!")
        
        # Now run the database setup
        print("Setting up new database schema...")
        os.system("python database_setup.py")
        
        print("✅ Database setup completed!")
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    reset_database()
