import sqlite3
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# --- App Setup ---
app = FastAPI(title="NAV Assistant API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DB Connection ---
def get_db_connection():
    conn = sqlite3.connect('platform_data.db')
    conn.row_factory = sqlite3.Row
    return conn

# --- Pydantic Models ---
class Fund(BaseModel):
    name: str
    api_symbol: str

class Configuration(BaseModel):
    fund_name: str
    nav_page_url: Optional[str] = None
    expert_price_page_url: Optional[str] = None
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

class CheckData(BaseModel):
    fund_name: str
    nav_on_page: float
    total_units: float
    sellable_quantity: Optional[float] = None
    expert_price: Optional[float] = None

# --- API Endpoints ---
@app.get("/")
def read_root():
    return {"status": "ok", "message": "NAV Assistant API is running"}

@app.post("/funds")
def add_fund(fund: Fund):
    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO funds (name, api_symbol) VALUES (?, ?)", (fund.name, fund.api_symbol))
        conn.commit()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail=f"Fund '{fund.name}' already exists.")
    finally:
        conn.close()
    return {"status": "success", "message": f"Fund '{fund.name}' added successfully."}

@app.get("/funds")
def get_funds():
    conn = get_db_connection()
    funds = conn.execute("SELECT * FROM funds ORDER BY name").fetchall()
    conn.close()
    return funds

@app.post("/configurations")
def save_configuration(config: Configuration):
    conn = get_db_connection()
    fund = conn.execute("SELECT id FROM funds WHERE name = ?", (config.fund_name,)).fetchone()
    if not fund:
        raise HTTPException(status_code=404, detail=f"Fund '{config.fund_name}' not found.")
    fund_id = fund['id']

    existing_config = conn.execute("SELECT id FROM configurations WHERE fund_id = ?", (fund_id,)).fetchone()
    
    if existing_config:
        conn.execute("""
            UPDATE configurations SET 
            nav_page_url=?, expert_price_page_url=?, date_selector=?, time_selector=?, 
            nav_price_selector=?, total_units_selector=?, nav_search_button_selector=?,
            securities_list_selector=?, sellable_quantity_selector=?, expert_price_selector=?,
            increase_rows_selector=?, expert_search_button_selector=?
            WHERE fund_id = ?
        """, (config.nav_page_url, config.expert_price_page_url, config.date_selector, config.time_selector,
              config.nav_price_selector, config.total_units_selector, config.nav_search_button_selector,
              config.securities_list_selector, config.sellable_quantity_selector, config.expert_price_selector,
              config.increase_rows_selector, config.expert_search_button_selector, fund_id))
    else:
        conn.execute("""
            INSERT INTO configurations 
            (fund_id, nav_page_url, expert_price_page_url, date_selector, time_selector, 
             nav_price_selector, total_units_selector, nav_search_button_selector,
             securities_list_selector, sellable_quantity_selector, expert_price_selector,
             increase_rows_selector, expert_search_button_selector) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (fund_id, config.nav_page_url, config.expert_price_page_url, config.date_selector, config.time_selector,
              config.nav_price_selector, config.total_units_selector, config.nav_search_button_selector,
              config.securities_list_selector, config.sellable_quantity_selector, config.expert_price_selector,
              config.increase_rows_selector, config.expert_search_button_selector))
    conn.commit()
    conn.close()
    return {"status": "success", "message": f"Configuration for '{config.fund_name}' saved."}

@app.get("/configurations/{fund_name}")
def get_configuration(fund_name: str):
    conn = get_db_connection()
    config = conn.execute("""
        SELECT c.* FROM configurations c JOIN funds f ON c.fund_id = f.id WHERE f.name = ?
    """, (fund_name,)).fetchone()
    conn.close()
    if not config:
        raise HTTPException(status_code=404, detail=f"Configuration for '{fund_name}' not found.")
    return config

@app.post("/check-nav")
async def check_nav_logic(data: CheckData):
    conn = get_db_connection()
    fund = conn.execute("SELECT * FROM funds WHERE name = ?", (data.fund_name,)).fetchone()
    if not fund:
        raise HTTPException(status_code=404, detail="Fund not found")

    # --- TODO: Replace this with your actual API call to get the market price ---
    # Using a placeholder for now
    board_price = data.nav_on_page + 3.0
    # --------------------------------------------------------------------------

    threshold = 2.0
    diff = abs(data.nav_on_page - board_price)

    if diff <= threshold:
        conn.close()
        return {"status": "ok", "message": "Difference is within threshold."}

    status_message = "Adjustment Needed"
    
    if data.sellable_quantity is None or data.expert_price is None or data.sellable_quantity == 0:
        conn.close()
        return {
            "status": "adjustment_needed_more_data_required",
            "message": "Difference is high, but data for calculation is missing."
        }

    # --- Final Formula Implementation ---
    is_positive_adjustment = data.nav_on_page > board_price
    numerator = data.total_units * diff
    denominator = data.sellable_quantity
    fraction_result = numerator / denominator

    if is_positive_adjustment:
        suggested_price = data.expert_price + fraction_result
    else:
        suggested_price = data.expert_price - fraction_result

    # --- Final Actions ---
    # TODO: Call your Telegram alert function here
    # await send_telegram_alert(...)

    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    conn.execute("""
        INSERT INTO logs (fund_id, timestamp, nav_on_page, total_units, sellable_quantity, expert_price, board_price, suggested_price, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (fund['id'], timestamp, data.nav_on_page, data.total_units, data.sellable_quantity, data.expert_price, board_price, suggested_price, status_message))
    conn.commit()
    conn.close()
    
    return {
        "status": "adjustment_needed",
        "suggested_nav": round(suggested_price, 2)
    }