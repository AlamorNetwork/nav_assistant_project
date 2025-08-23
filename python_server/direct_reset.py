#!/usr/bin/env python3
import subprocess
import sys
import os

def reset_database():
    try:
        print("🗑️ Resetting database...")
        
        # Run database_setup.py which will recreate the schema
        result = subprocess.run([sys.executable, "database_setup.py"], 
                              capture_output=True, text=True, cwd=os.path.dirname(__file__))
        
        if result.returncode == 0:
            print("✅ Database reset successfully!")
            print("Output:", result.stdout)
        else:
            print("❌ Database reset failed!")
            print("Error:", result.stderr)
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    reset_database()
