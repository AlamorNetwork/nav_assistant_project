from fastapi import FastAPI, Request, Form, HTTPException
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, RedirectResponse
import sqlite3, hashlib, secrets, json
from datetime import datetime

app = FastAPI(title="سبدگردان کاریزما - Admin Panel")

templates = Jinja2Templates(directory="templates")

def get_db_connection():
    conn = sqlite3.connect('platform_data.db')
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def authenticate_admin(request: Request):
    token = request.cookies.get("admin_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    conn = get_db_connection()
    user = conn.execute("SELECT role FROM users WHERE token = ?", (token,)).fetchone()
    conn.close()
    if not user or user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Not admin")

@app.get("/", response_class=HTMLResponse)
async def admin_login(request: Request):
    return templates.TemplateResponse("admin_login.html", {"request": request})

@app.post("/login")
async def admin_login_post(request: Request, username: str = Form(), password: str = Form()):
    conn = get_db_connection()
    user = conn.execute("SELECT id, username, password_hash, role FROM users WHERE username = ?", (username,)).fetchone()
    if not user or user['password_hash'] != hash_password(password) or user['role'] != 'admin':
        conn.close()
        return templates.TemplateResponse("admin_login.html", {"request": request, "error": "Invalid credentials"})
    token = secrets.token_hex(16)
    conn.execute("UPDATE users SET token = ? WHERE id = ?", (token, user['id']))
    conn.commit(); conn.close()
    response = RedirectResponse(url="/admin", status_code=302)
    response.set_cookie(key="admin_token", value=token, httponly=True)
    return response

@app.get("/admin", response_class=HTMLResponse)
async def admin_dashboard(request: Request):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    conn = get_db_connection()
    users = conn.execute("SELECT username, role, created_at FROM users").fetchall()
    funds = conn.execute("SELECT name, type, api_symbol FROM funds").fetchall()
    tmpls = conn.execute("SELECT name, tolerance FROM templates").fetchall()
    conn.close()
    return templates.TemplateResponse("admin_dashboard.html", {"request": request, "users": users, "funds": funds, "templates": tmpls})

@app.post("/admin/create-user")
async def create_user(request: Request, username: str = Form(), password: str = Form(), role: str = Form()):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)", (username, hash_password(password), role, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
        conn.commit(); message = "User created successfully"
    except sqlite3.IntegrityError:
        message = "Username already exists"
    conn.close()
    return RedirectResponse(url=f"/admin?message={message}", status_code=302)

@app.post("/admin/create-fund")
async def create_fund(request: Request, name: str = Form(), api_symbol: str = Form(), type: str = Form()):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO funds (name, api_symbol, type) VALUES (?, ?, ?)", (name, api_symbol, type))
        conn.commit(); message = "Fund created successfully"
    except sqlite3.IntegrityError:
        message = "Fund name already exists"
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
    except Exception:
        return RedirectResponse(url="/admin?message=Invalid JSON", status_code=302)
    # Upsert into templates table
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
    exists = conn.execute("SELECT name FROM templates WHERE name=?", (template_name,)).fetchone()
    if exists:
        conn.execute("UPDATE templates SET tolerance=?, nav_page_url=?, expert_price_page_url=?, date_selector=?, time_selector=?, nav_price_selector=?, total_units_selector=?, nav_search_button_selector=?, securities_list_selector=?, sellable_quantity_selector=?, expert_price_selector=?, increase_rows_selector=?, expert_search_button_selector=? WHERE name=?",
                     (fields['tolerance'], fields['nav_page_url'], fields['expert_price_page_url'], fields['date_selector'], fields['time_selector'], fields['nav_price_selector'], fields['total_units_selector'], fields['nav_search_button_selector'], fields['securities_list_selector'], fields['sellable_quantity_selector'], fields['expert_price_selector'], fields['increase_rows_selector'], fields['expert_search_button_selector'], template_name))
    else:
        conn.execute("INSERT INTO templates (name, tolerance, nav_page_url, expert_price_page_url, date_selector, time_selector, nav_price_selector, total_units_selector, nav_search_button_selector, securities_list_selector, sellable_quantity_selector, expert_price_selector, increase_rows_selector, expert_search_button_selector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (template_name, fields['tolerance'], fields['nav_page_url'], fields['expert_price_page_url'], fields['date_selector'], fields['time_selector'], fields['nav_price_selector'], fields['total_units_selector'], fields['nav_search_button_selector'], fields['securities_list_selector'], fields['sellable_quantity_selector'], fields['expert_price_selector'], fields['increase_rows_selector'], fields['expert_search_button_selector']))
    conn.commit(); conn.close()
    return RedirectResponse(url="/admin?message=Template saved", status_code=302)

@app.post("/admin/apply-template")
async def apply_template(request: Request, fund_name: str = Form(), template_name: str = Form()):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    conn = get_db_connection()
    fund = conn.execute("SELECT id FROM funds WHERE name=?", (fund_name,)).fetchone()
    tmpl = conn.execute("SELECT * FROM templates WHERE name=?", (template_name,)).fetchone()
    if not fund or not tmpl:
        conn.close();
        return RedirectResponse(url="/admin?message=Fund or Template not found", status_code=302)
    existing = conn.execute("SELECT id FROM configurations WHERE fund_id=?", (fund['id'],)).fetchone()
    if existing:
        conn.execute("UPDATE configurations SET tolerance=?, nav_page_url=?, expert_price_page_url=?, date_selector=?, time_selector=?, nav_price_selector=?, total_units_selector=?, nav_search_button_selector=?, securities_list_selector=?, sellable_quantity_selector=?, expert_price_selector=?, increase_rows_selector=?, expert_search_button_selector=? WHERE fund_id=?",
                     (tmpl['tolerance'], tmpl['nav_page_url'], tmpl['expert_price_page_url'], tmpl['date_selector'], tmpl['time_selector'], tmpl['nav_price_selector'], tmpl['total_units_selector'], tmpl['nav_search_button_selector'], tmpl['securities_list_selector'], tmpl['sellable_quantity_selector'], tmpl['expert_price_selector'], tmpl['increase_rows_selector'], tmpl['expert_search_button_selector'], fund['id']))
    else:
        conn.execute("INSERT INTO configurations (fund_id, tolerance, nav_page_url, expert_price_page_url, date_selector, time_selector, nav_price_selector, total_units_selector, nav_search_button_selector, securities_list_selector, sellable_quantity_selector, expert_price_selector, increase_rows_selector, expert_search_button_selector) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                     (fund['id'], tmpl['tolerance'], tmpl['nav_page_url'], tmpl['expert_price_page_url'], tmpl['date_selector'], tmpl['time_selector'], tmpl['nav_price_selector'], tmpl['total_units_selector'], tmpl['nav_search_button_selector'], tmpl['securities_list_selector'], tmpl['sellable_quantity_selector'], tmpl['expert_price_selector'], tmpl['increase_rows_selector'], tmpl['expert_search_button_selector']))
    conn.commit(); conn.close()
    return RedirectResponse(url="/admin?message=Template applied", status_code=302)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
