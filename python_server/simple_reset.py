import os
import sys

# Add the current directory to Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

try:
    import psycopg2
    print("✅ psycopg2 found")
except ImportError:
    print("❌ psycopg2 not found. Installing...")
    os.system("python -m pip install psycopg2-binary")
    import psycopg2

# Database connection details  
DB_URL = os.getenv('DB_URL', "postgresql://postgres:eOx5S0h4RFqejEGl@services.irn13.chabokan.net:50895/micheal")

def reset_database():
    try:
        print("🔌 Connecting to database...")
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        print("🗑️ Dropping public schema...")
        cur.execute("DROP SCHEMA public CASCADE")
        
        print("🆕 Creating new public schema...")
        cur.execute("CREATE SCHEMA public")
        
        print("🔐 Granting permissions...")
        cur.execute("GRANT ALL ON SCHEMA public TO postgres")
        cur.execute("GRANT ALL ON SCHEMA public TO public")
        
        conn.commit()
        cur.close()
        conn.close()
        
        print("✅ Database schema reset successfully!")
        
        # Now run the database setup
        print("🔧 Setting up new database schema...")
        os.system("python database_setup.py")
        
        print("✅ Database setup completed!")
        
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    reset_database()
