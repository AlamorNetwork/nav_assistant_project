import os
import psycopg2
import psycopg2.extras
import httpx
import telegram
import subprocess
from fastapi import FastAPI, HTTPException, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import hashlib, secrets
from config import get_db_url, get_telegram_config

# --- App Setup ---
app = FastAPI(title="NAV Assistant API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- Telegram Configuration ---
# Use configuration module for better management
telegram_config = get_telegram_config()
BOT_TOKEN = telegram_config['bot_token']
ADMIN_CHAT_ID = telegram_config['admin_chat_id']

async def send_telegram_alert(message: str):
    if not BOT_TOKEN or not ADMIN_CHAT_ID:
        print("[telegram] Credentials missing. Skipping alert.")
        return
    try:
        bot = telegram.Bot(token=BOT_TOKEN)
        await bot.send_message(chat_id=ADMIN_CHAT_ID, text=message, parse_mode='Markdown')
        print("[telegram] Alert sent successfully.")
    except Exception as e:
        print(f"[telegram] Failed to send alert: {e}")

# --- TSETMC Price Fetching Logic ---
async def get_board_price(fund_name: str) -> float:
    headers = {'User-Agent': 'Mozilla/5.0'}
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            search_url = f"http://old.tsetmc.com/tsev2/data/search.aspx?skey={fund_name}"
            search_response = await client.get(search_url, headers=headers)
            search_response.raise_for_status()
            skey = search_response.text.split(";")[0].split(",")[2]
            price_url = f'https://cdn.tsetmc.com/api/ClosingPrice/GetClosingPriceInfo/{skey}'
            price_response = await client.get(price_url, headers=headers)
            price_response.raise_for_status()
            price_value = float(price_response.json()['closingPriceInfo']['pDrCotVal'])
            print(f"[price] fund={fund_name} board_price={price_value}")
            return price_value
        except Exception as e:
            print(f"[price] Error fetching board price for {fund_name}: {e}")
            return 0.0

# --- DB (PostgreSQL) Connection & helpers ---
# Use configuration module for database connection
def get_db_connection():
    db_url = get_db_url()
    if not db_url:
        raise RuntimeError("Database URL is not configured")
    return psycopg2.connect(db_url)

def fetchone(sql: str, params: tuple = ()):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            return row
    finally:
        conn.close()

def fetchall(sql: str, params: tuple = ()):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall()
            return rows
    finally:
        conn.close()

def execute(sql: str, params: tuple = ()):
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            conn.commit()
    finally:
        conn.close()

# --- Pydantic Models ---
class Fund(BaseModel):
    name: str
    api_symbol: str
    type: Optional[str] = 'rayan'
    nav_page_url: Optional[str] = None
    expert_price_page_url: Optional[str] = None
class Configuration(BaseModel):
    fund_name: str; tolerance: Optional[float] = 4.0; nav_page_url: Optional[str] = None; expert_price_page_url: Optional[str] = None
    date_selector: Optional[str] = None; time_selector: Optional[str] = None; nav_price_selector: Optional[str] = None
    total_units_selector: Optional[str] = None; nav_search_button_selector: Optional[str] = None
    securities_list_selector: Optional[str] = None; sellable_quantity_selector: Optional[str] = None
    expert_price_selector: Optional[str] = None; increase_rows_selector: Optional[str] = None
    expert_search_button_selector: Optional[str] = None
class CheckData(BaseModel):
    fund_name: str; nav_on_page: float; total_units: float
    sellable_quantity: Optional[float] = None; expert_price: Optional[float] = None
class StaleAlert(BaseModel):
    fund_name: str
    last_nav_time: str
    age_seconds: float
class UserCredentials(BaseModel):
    username: str
    password: str
class User(BaseModel):
    username: str
    role: str = 'user'
    token: Optional[str] = None
class TemplatePayload(BaseModel):
    name: str
    tolerance: Optional[float] = 4.0
    date_selector: Optional[str] = None
    time_selector: Optional[str] = None
    nav_price_selector: Optional[str] = None
    total_units_selector: Optional[str] = None
    nav_search_button_selector: Optional[str] = None
    securities_list_selector: Optional[str] = None
    sellable_quantity_selector: Optional[str] = None
    expert_price_selector: Optional[str] = None
    increase_rows_selector: Optional[str] = None
    expert_search_button_selector: Optional[str] = None

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def authenticate(token: Optional[str] = Header(None)):
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, username, role FROM users WHERE token = %s", (token,))
            user = cur.fetchone()
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return {"id": user['id'], "username": user['username'], "role": user['role']}
    finally:
        conn.close()

def try_authenticate(token: Optional[str]):
    if not token:
        return None
    try:
        user = authenticate(token)  # will raise if invalid
        return user
    except Exception:
        return None

# --- API Endpoints ---
@app.get("/")
def read_root(): return {"status": "ok", "message": "NAV Assistant API is running"}

@app.post("/funds")
def add_fund(fund: Fund, user=Depends(authenticate)):
    try:
        execute("INSERT INTO funds (name, api_symbol, type, owner_user_id, nav_page_url, expert_price_page_url) VALUES (%s, %s, %s, %s, %s, %s)", (fund.name, fund.api_symbol, fund.type or 'rayan', user['id'], fund.nav_page_url, fund.expert_price_page_url))
    except Exception as e:
        if 'duplicate key' in str(e).lower():
            raise HTTPException(status_code=400, detail=f"Fund '{fund.name}' already exists.")
        raise
    return {"status": "success", "message": f"Fund '{fund.name}' added successfully."}

@app.get("/funds")
def get_funds(token: Optional[str] = Header(None)):
    user = try_authenticate(token)
    if user and user.get('role') != 'admin':
        # Return only funds assigned to this user
        rows = fetchall(
            """
            SELECT f.* FROM user_funds uf
            JOIN funds f ON uf.fund_id = f.id
            WHERE uf.user_id = %s
            ORDER BY f.name
            """,
            (user['id'],),
        )
        return rows
    # Public or admin: return all funds
    return fetchall("SELECT * FROM funds ORDER BY name")

@app.post("/configurations")
def save_configuration(config: Configuration, user=Depends(authenticate)):
    fund = fetchone("SELECT id, owner_user_id FROM funds WHERE name = %s", (config.fund_name,))
    if not fund: raise HTTPException(status_code=404, detail=f"Fund '{config.fund_name}' not found.")
    if fund['owner_user_id'] and fund['owner_user_id'] != user['id'] and user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Not allowed to modify this fund")
    fund_id = fund['id']
    existing_config = fetchone("SELECT id FROM configurations WHERE fund_id = %s", (fund_id,))
    if existing_config:
        execute("""UPDATE configurations SET tolerance=%s, nav_page_url=%s, expert_price_page_url=%s, date_selector=%s, time_selector=%s, nav_price_selector=%s, total_units_selector=%s, nav_search_button_selector=%s, securities_list_selector=%s, sellable_quantity_selector=%s, expert_price_selector=%s, increase_rows_selector=%s, expert_search_button_selector=%s WHERE fund_id = %s""",
                     (config.tolerance, config.nav_page_url, config.expert_price_page_url, config.date_selector, config.time_selector, config.nav_price_selector, config.total_units_selector, config.nav_search_button_selector, config.securities_list_selector, config.sellable_quantity_selector, config.expert_price_selector, config.increase_rows_selector, config.expert_search_button_selector, fund_id))
    else:
        execute("""INSERT INTO configurations (fund_id, tolerance, nav_page_url, expert_price_page_url, date_selector, time_selector, nav_price_selector, total_units_selector, nav_search_button_selector, securities_list_selector, sellable_quantity_selector, expert_price_selector, increase_rows_selector, expert_search_button_selector) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                     (fund_id, config.tolerance, config.nav_page_url, config.expert_price_page_url, config.date_selector, config.time_selector, config.nav_price_selector, config.total_units_selector, config.nav_search_button_selector, config.securities_list_selector, config.sellable_quantity_selector, config.expert_price_selector, config.increase_rows_selector, config.expert_search_button_selector))
    return {"status": "success", "message": f"Configuration for '{config.fund_name}' saved."}

@app.get("/configurations/{fund_name}")
def get_configuration(fund_name: str):
    config = fetchone("SELECT c.*, f.api_symbol, f.type as fund_type, f.nav_page_url as fund_nav_page_url, f.expert_price_page_url as fund_expert_page_url FROM configurations c JOIN funds f ON c.fund_id = f.id WHERE f.name = %s", (fund_name,))
    if not config: raise HTTPException(status_code=404, detail=f"Configuration for '{fund_name}' not found.")
    
    # Use fund URLs if configuration URLs are not set
    if not config.get('nav_page_url') and config.get('fund_nav_page_url'):
        config['nav_page_url'] = config['fund_nav_page_url']
    if not config.get('expert_price_page_url') and config.get('fund_expert_page_url'):
        config['expert_price_page_url'] = config['fund_expert_page_url']
    
    return config

@app.post("/check-nav")
async def check_nav_logic(data: CheckData):
    config = get_configuration(data.fund_name)
    
    fund_id = config['fund_id']

    board_price = await get_board_price(config['api_symbol'])
    if board_price == 0.0:
        raise HTTPException(status_code=503, detail="Could not fetch board price.")

    diff = abs(data.nav_on_page - board_price)
    tolerance = config['tolerance'] if 'tolerance' in config.keys() else 4.0

    print(
        f"[check-nav] fund={data.fund_name} nav_on_page={data.nav_on_page} total_units={data.total_units} "
        f"sellable_quantity={data.sellable_quantity} expert_price={data.expert_price} board_price={board_price} "
        f"diff={diff} tolerance={tolerance}"
    )

    if diff < tolerance:
        return {
            "status": "ok",
            "message": "Difference is within tolerance.",
            "diff": round(diff, 2),
            "tolerance": tolerance,
            "board_price": board_price,
        }

    status_message = "Adjustment Needed"
    
    if data.sellable_quantity is None or data.expert_price is None or data.sellable_quantity == 0:
        return {
            "status": "adjustment_needed_more_data_required",
            "message": "Difference is high, but data for calculation is missing.",
            "diff": round(diff, 2),
            "tolerance": tolerance,
            "board_price": board_price,
        }

    is_positive_adjustment = data.nav_on_page > board_price
    numerator = data.total_units * diff
    denominator = data.sellable_quantity
    fraction_result = numerator / denominator
    suggested_price = (data.expert_price + fraction_result) if is_positive_adjustment else (data.expert_price - fraction_result)

    alert_message = (f"⚠️ *نیاز به تعدیل NAV برای صندوق {data.fund_name}!*\n\n"
                     f"قیمت پیشنهادی جدید: **`{suggested_price:.2f}`**")
    await send_telegram_alert(alert_message)

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    execute("""INSERT INTO logs (fund_id, timestamp, nav_on_page, total_units, sellable_quantity, expert_price, board_price, suggested_price, status) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
                 (fund_id, timestamp, data.nav_on_page, data.total_units, data.sellable_quantity, data.expert_price, board_price, suggested_price, status_message))
    
    print(f"[check-nav] suggested_nav={suggested_price:.2f} status={status_message}")
    return {
        "status": "adjustment_needed",
        "suggested_nav": round(suggested_price, 2),
        "diff": round(diff, 2),
        "tolerance": tolerance,
        "board_price": board_price,
    }

@app.post("/alerts/stale")
async def alert_stale_nav(alert: StaleAlert):
    message = (
        f"🚨 *NAV لحظه‌ای بروزرسانی نشده*") + \
        (f"\nصندوق: {alert.fund_name}" if alert.fund_name else "") + \
        (f"\nآخرین زمان روی صفحه: {alert.last_nav_time}" if alert.last_nav_time else "") + \
        (f"\nسن تاخیر (ثانیه): {int(alert.age_seconds)}" if alert.age_seconds is not None else "")
    await send_telegram_alert(message)
    return {"status": "ok"}

@app.post("/auth/login")
def login(creds: UserCredentials):
    row = fetchone("SELECT id, username, password_hash, role FROM users WHERE username = %s", (creds.username,))
    if not row or row['password_hash'] != hash_password(creds.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = secrets.token_hex(16)
    execute("UPDATE users SET token = %s WHERE id = %s", (token, row['id']))
    return {"token": token, "username": row['username'], "role": row['role']}

@app.post("/auth/create-user")
def create_user(creds: UserCredentials, user=Depends(authenticate)):
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can create users")
    try:
        execute("INSERT INTO users (username, password_hash, role, created_at) VALUES (%s, %s, %s, %s)", (creds.username, hash_password(creds.password), 'user', datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
    except Exception as e:
        if 'duplicate key' in str(e).lower():
            raise HTTPException(status_code=400, detail="Username already exists")
        raise
    return {"status": "success"}

# --- Templates CRUD ---
@app.get("/templates")
def get_templates():
    rows = fetchall("SELECT * FROM templates")
    return {"templates": [dict(r) for r in rows]}

@app.post("/templates")
def upsert_template(tmpl: TemplatePayload, user=Depends(authenticate)):
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can manage templates")
    existing = fetchone("SELECT name FROM templates WHERE name=%s", (tmpl.name,))
    fields = (tmpl.tolerance, tmpl.nav_page_url, tmpl.expert_price_page_url, tmpl.date_selector, tmpl.time_selector, tmpl.nav_price_selector, tmpl.total_units_selector, tmpl.nav_search_button_selector, tmpl.securities_list_selector, tmpl.sellable_quantity_selector, tmpl.expert_price_selector, tmpl.increase_rows_selector, tmpl.expert_search_button_selector, tmpl.name)
    if existing:
        execute("UPDATE templates SET tolerance=%s, nav_page_url=%s, expert_price_page_url=%s, date_selector=%s, time_selector=%s, nav_price_selector=%s, total_units_selector=%s, nav_search_button_selector=%s, securities_list_selector=%s, sellable_quantity_selector=%s, expert_price_selector=%s, increase_rows_selector=%s, expert_search_button_selector=%s WHERE name=%s", fields)
    else:
        execute("INSERT INTO templates (tolerance, nav_page_url, expert_price_page_url, date_selector, time_selector, nav_price_selector, total_units_selector, nav_search_button_selector, securities_list_selector, sellable_quantity_selector, expert_price_selector, increase_rows_selector, expert_search_button_selector, name) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", fields)
    return {"status": "success"}

@app.post("/funds/apply-template")
def apply_template_to_fund(fund_name: str, template_name: str, user=Depends(authenticate)):
    fund = fetchone("SELECT id FROM funds WHERE name=%s", (fund_name,))
    if not fund: 
        raise HTTPException(status_code=404, detail="Fund not found")
    tmpl = fetchone("SELECT * FROM templates WHERE name=%s", (template_name,))
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    existing_config = fetchone("SELECT id FROM configurations WHERE fund_id=%s", (fund['id'],))
    if existing_config:
        execute("UPDATE configurations SET tolerance=%s, nav_page_url=%s, expert_price_page_url=%s, date_selector=%s, time_selector=%s, nav_price_selector=%s, total_units_selector=%s, nav_search_button_selector=%s, securities_list_selector=%s, sellable_quantity_selector=%s, expert_price_selector=%s, increase_rows_selector=%s, expert_search_button_selector=%s WHERE fund_id=%s",
                (tmpl['tolerance'], tmpl['nav_page_url'], tmpl['expert_price_page_url'], tmpl['date_selector'], tmpl['time_selector'], tmpl['nav_price_selector'], tmpl['total_units_selector'], tmpl['nav_search_button_selector'], tmpl['securities_list_selector'], tmpl['sellable_quantity_selector'], tmpl['expert_price_selector'], tmpl['increase_rows_selector'], tmpl['expert_search_button_selector'], fund['id']))
    else:
        execute("INSERT INTO configurations (fund_id, tolerance, nav_page_url, expert_price_page_url, date_selector, time_selector, nav_price_selector, total_units_selector, nav_search_button_selector, securities_list_selector, sellable_quantity_selector, expert_price_selector, increase_rows_selector, expert_search_button_selector) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                (fund['id'], tmpl['tolerance'], tmpl['nav_page_url'], tmpl['expert_price_page_url'], tmpl['date_selector'], tmpl['time_selector'], tmpl['nav_price_selector'], tmpl['total_units_selector'], tmpl['nav_search_button_selector'], tmpl['securities_list_selector'], tmpl['sellable_quantity_selector'], tmpl['expert_price_selector'], tmpl['increase_rows_selector'], tmpl['expert_search_button_selector']))
    return {"status": "success"}

@app.post("/admin/reset-database")
def reset_database(user=Depends(authenticate)):
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Only admin can reset database")
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Drop and recreate public schema
        cur.execute("DROP SCHEMA public CASCADE")
        cur.execute("CREATE SCHEMA public")
        cur.execute("GRANT ALL ON SCHEMA public TO postgres")
        cur.execute("GRANT ALL ON SCHEMA public TO public")
        
        conn.commit()
        cur.close()
        conn.close()
        
        # Recreate tables
        subprocess.run(["python", "database_setup.py"], check=True)
        
        return {"status": "success", "message": "Database reset successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database reset failed: {str(e)}")