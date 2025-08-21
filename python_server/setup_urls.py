#!/usr/bin/env python3
import os
import psycopg2
import psycopg2.extras

# Database connection
DB_URL = os.getenv('DB_URL')
if not DB_URL:
    raise SystemExit("DB_URL is not set")

conn = psycopg2.connect(DB_URL)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

try:
    # Get the fund ID for کارا
    cur.execute("SELECT id FROM funds WHERE name = %s", ('کارا',))
    fund = cur.fetchone()
    
    if not fund:
        print("❌ Fund 'کارا' not found in database")
        exit(1)
    
    fund_id = fund['id']
    print(f"✅ Found fund 'کارا' with ID: {fund_id}")
    
    # Check if configuration exists
    cur.execute("SELECT id FROM configurations WHERE fund_id = %s", (fund_id,))
    config = cur.fetchone()
    
    # URLs for کارا fund
    nav_url = "https://krzetf5.irbroker.com/fund.do?method=navList&new_search=true"
    expert_url = "https://krzetf5.irbroker.com/adjustedIp.do?new_search=true"
    
    if config:
        # Update existing configuration
        cur.execute("""
            UPDATE configurations 
            SET nav_page_url = %s, expert_price_page_url = %s
            WHERE fund_id = %s
        """, (nav_url, expert_url, fund_id))
        print("✅ Updated existing configuration for کارا")
    else:
        # Create new configuration
        cur.execute("""
            INSERT INTO configurations (
                fund_id, nav_page_url, expert_price_page_url, tolerance
            ) VALUES (%s, %s, %s, %s)
        """, (fund_id, nav_url, expert_url, 4.0))
        print("✅ Created new configuration for کارا")
    
    conn.commit()
    print(f"✅ URLs set for کارا:")
    print(f"   NAV URL: {nav_url}")
    print(f"   Expert URL: {expert_url}")
    
except Exception as e:
    print(f"❌ Error: {e}")
    conn.rollback()
finally:
    cur.close()
    conn.close()
