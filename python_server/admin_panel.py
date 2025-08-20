from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
import sqlite3, hashlib, secrets, json, os, urllib.parse
import psycopg2, psycopg2.extras
from datetime import datetime

app = FastAPI(title="سبدگردان کاریزما - Admin Panel")

templates = Jinja2Templates(directory="templates")

# DB
DB_URL = os.getenv('DB_URL')

def get_db_connection():
    if not DB_URL:
        raise RuntimeError('DB_URL is not set')
    conn = psycopg2.connect(DB_URL)
    return conn

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def authenticate_admin(request: Request):
    token = request.cookies.get("admin_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT role FROM users WHERE token=%s", (token,))
            user = cur.fetchone()
            if not user or user['role'] != 'admin':
                raise HTTPException(status_code=403, detail="Not admin")
    finally:
        conn.close()

@app.get("/", response_class=HTMLResponse)
async def admin_login(request: Request):
    return templates.TemplateResponse("admin_login.html", {"request": request})

@app.post("/login")
async def admin_login_post(request: Request, username: str = Form(), password: str = Form()):
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id, username, password_hash, role FROM users WHERE username=%s", (username,))
            user = cur.fetchone()
            if not user or user['password_hash'] != hash_password(password) or user['role'] != 'admin':
                return templates.TemplateResponse("admin_login.html", {"request": request, "error": "Invalid credentials"})
            token = secrets.token_hex(16)
            cur.execute("UPDATE users SET token=%s WHERE id=%s", (token, user['id']))
            conn.commit()
    finally:
        conn.close()
    response = RedirectResponse(url="/admin", status_code=302)
    response.set_cookie(key="admin_token", value=token, httponly=True)
    return response

@app.get("/admin", response_class=HTMLResponse)
async def admin_dashboard(request: Request):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    # load data
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT username, role, created_at FROM users ORDER BY username")
            users = cur.fetchall()
            cur.execute("SELECT name, type, api_symbol FROM funds ORDER BY name")
            funds = cur.fetchall()
            cur.execute("SELECT name, tolerance FROM templates ORDER BY name")
            tmpls = cur.fetchall()
            # if edit_template query provided, load that template
            edit_name = request.query_params.get('edit_template')
            tpl = None
            if edit_name:
                cur.execute("SELECT * FROM templates WHERE name=%s", (edit_name,))
                tpl = cur.fetchone()
    finally:
        conn.close()
    # Prepare JSON text for textarea to avoid template-side JSON filter issues
    tpl_json = json.dumps(dict(tpl)) if tpl else ""
    message = request.query_params.get('message')
    return templates.TemplateResponse("admin_dashboard.html", {
        "request": request,
        "users": users,
        "funds": funds,
        "templates": tmpls,
        "tpl": tpl,
        "tpl_json": tpl_json,
        "message": message
    })

@app.post("/admin/create-user")
async def create_user(request: Request, username: str = Form(), password: str = Form(), role: str = Form()):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO users (username, password_hash, role, created_at) VALUES (%s, %s, %s, %s)", (username, hash_password(password), role, datetime.now()))
            conn.commit(); message = "User created successfully"
    except psycopg2.Error:
        message = "Username already exists"
    finally:
        conn.close()
    return RedirectResponse(url=f"/admin?message={message}", status_code=302)

@app.post("/admin/create-fund")
async def create_fund(request: Request, name: str = Form(), api_symbol: str = Form(), nav_page_url: str = Form(), expert_price_page_url: str = Form(), type: str = Form()):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("INSERT INTO funds (name, api_symbol, type, nav_page_url, expert_price_page_url) VALUES (%s, %s, %s, %s, %s)", (name, api_symbol, type, nav_page_url, expert_price_page_url))
            conn.commit(); message = "Fund created successfully"
    except psycopg2.Error as e:
        # Surface actual DB error to help diagnose schema mismatches (e.g., missing columns)
        err = getattr(e, 'pgerror', None) or str(e)
        message = f"DB error: {err[:160]}"
    finally:
        conn.close()
    return RedirectResponse(url=f"/admin?message={message}", status_code=302)

@app.post("/admin/update-template")
async def update_template(request: Request, template_name: str = Form(), template_data: str = Form()):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    # Parse JSON
    try:
        data = json.loads(template_data)
    except Exception as e:
        err = urllib.parse.quote(f"Invalid JSON: {str(e)[:120]}")
        return RedirectResponse(url=f"/admin?message={err}", status_code=302)
    fields = {
        'tolerance': data.get('tolerance', 4.0),
        'nav_page_url': data.get('nav_page_url'),
        'expert_price_page_url': data.get('expert_price_page_url'),
        'date_selector': data.get('date_selector'),
        'time_selector': data.get('time_selector'),
        'nav_price_selector': data.get('nav_price_selector'),
        'total_units_selector': data.get('total_units_selector'),
        'nav_search_button_selector': data.get('nav_search_button_selector'),
        'securities_list_selector': data.get('securities_list_selector'),
        'sellable_quantity_selector': data.get('sellable_quantity_selector'),
        'expert_price_selector': data.get('expert_price_selector'),
        'increase_rows_selector': data.get('increase_rows_selector'),
        'expert_search_button_selector': data.get('expert_search_button_selector'),
    }
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM templates WHERE name=%s", (template_name,))
            exists = cur.fetchone()
            if exists:
                cur.execute("UPDATE templates SET tolerance=%s, nav_page_url=%s, expert_price_page_url=%s, date_selector=%s, time_selector=%s, nav_price_selector=%s, total_units_selector=%s, nav_search_button_selector=%s, securities_list_selector=%s, sellable_quantity_selector=%s, expert_price_selector=%s, increase_rows_selector=%s, expert_search_button_selector=%s WHERE name=%s",
                            (fields['tolerance'], fields['nav_page_url'], fields['expert_price_page_url'], fields['date_selector'], fields['time_selector'], fields['nav_price_selector'], fields['total_units_selector'], fields['nav_search_button_selector'], fields['securities_list_selector'], fields['sellable_quantity_selector'], fields['expert_price_selector'], fields['increase_rows_selector'], fields['expert_search_button_selector'], template_name))
            else:
                cur.execute("INSERT INTO templates (name, tolerance, nav_page_url, expert_price_page_url, date_selector, time_selector, nav_price_selector, total_units_selector, nav_search_button_selector, securities_list_selector, sellable_quantity_selector, expert_price_selector, increase_rows_selector, expert_search_button_selector) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                            (template_name, fields['tolerance'], fields['nav_page_url'], fields['expert_price_page_url'], fields['date_selector'], fields['time_selector'], fields['nav_price_selector'], fields['total_units_selector'], fields['nav_search_button_selector'], fields['securities_list_selector'], fields['sellable_quantity_selector'], fields['expert_price_selector'], fields['increase_rows_selector'], fields['expert_search_button_selector']))
            conn.commit()
    finally:
        conn.close()
    return RedirectResponse(url="/admin?message=Template saved", status_code=302)

@app.post("/admin/upsert-template-fields")
async def upsert_template_fields(request: Request,
    name: str = Form(), tolerance: float = Form(4.0),
    nav_page_url: str = Form(None), expert_price_page_url: str = Form(None),
    date_selector: str = Form(None), time_selector: str = Form(None), nav_price_selector: str = Form(None), total_units_selector: str = Form(None), nav_search_button_selector: str = Form(None),
    securities_list_selector: str = Form(None), sellable_quantity_selector: str = Form(None), expert_price_selector: str = Form(None), increase_rows_selector: str = Form(None), expert_search_button_selector: str = Form(None)
):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT name FROM templates WHERE name=%s", (name,))
            exists = cur.fetchone()
            params = (tolerance, nav_page_url, expert_price_page_url, date_selector, time_selector, nav_price_selector, total_units_selector, nav_search_button_selector, securities_list_selector, sellable_quantity_selector, expert_price_selector, increase_rows_selector, expert_search_button_selector, name)
            if exists:
                cur.execute("UPDATE templates SET tolerance=%s, nav_page_url=%s, expert_price_page_url=%s, date_selector=%s, time_selector=%s, nav_price_selector=%s, total_units_selector=%s, nav_search_button_selector=%s, securities_list_selector=%s, sellable_quantity_selector=%s, expert_price_selector=%s, increase_rows_selector=%s, expert_search_button_selector=%s WHERE name=%s", params)
            else:
                cur.execute("INSERT INTO templates (tolerance, nav_page_url, expert_price_page_url, date_selector, time_selector, nav_price_selector, total_units_selector, nav_search_button_selector, securities_list_selector, sellable_quantity_selector, expert_price_selector, increase_rows_selector, expert_search_button_selector, name) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", params)
            conn.commit()
    finally:
        conn.close()
    return RedirectResponse(url=f"/admin?message=Template saved&edit_template={name}", status_code=302)

@app.post("/admin/apply-template")
async def apply_template(request: Request, fund_name: str = Form(), template_name: str = Form()):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    conn = get_db_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT id FROM funds WHERE name=%s", (fund_name,))
            fund = cur.fetchone()
            cur.execute("SELECT * FROM templates WHERE name=%s", (template_name,))
            tmpl = cur.fetchone()
            if not fund or not tmpl:
                return RedirectResponse(url="/admin?message=Fund or Template not found", status_code=302)
            cur.execute("SELECT id FROM configurations WHERE fund_id=%s", (fund['id'],))
            existing = cur.fetchone()
            params = (tmpl['tolerance'], tmpl['nav_page_url'], tmpl['expert_price_page_url'], tmpl['date_selector'], tmpl['time_selector'], tmpl['nav_price_selector'], tmpl['total_units_selector'], tmpl['nav_search_button_selector'], tmpl['securities_list_selector'], tmpl['sellable_quantity_selector'], tmpl['expert_price_selector'], tmpl['increase_rows_selector'], tmpl['expert_search_button_selector'], fund['id'])
            if existing:
                cur.execute("UPDATE configurations SET tolerance=%s, nav_page_url=%s, expert_price_page_url=%s, date_selector=%s, time_selector=%s, nav_price_selector=%s, total_units_selector=%s, nav_search_button_selector=%s, securities_list_selector=%s, sellable_quantity_selector=%s, expert_price_selector=%s, increase_rows_selector=%s, expert_search_button_selector=%s WHERE fund_id=%s", params)
            else:
                cur.execute("INSERT INTO configurations (tolerance, nav_page_url, expert_price_page_url, date_selector, time_selector, nav_price_selector, total_units_selector, nav_search_button_selector, securities_list_selector, sellable_quantity_selector, expert_price_selector, increase_rows_selector, expert_search_button_selector, fund_id) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)", params)
            conn.commit()
    finally:
        conn.close()
    return RedirectResponse(url="/admin?message=Template applied", status_code=302)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
