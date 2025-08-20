from fastapi import FastAPI, Request, Form, HTTPException, Depends
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, RedirectResponse
import sqlite3
import hashlib
import secrets
from datetime import datetime
from typing import Optional

app = FastAPI(title="NAV Assistant Admin Panel")

# Templates
templates = Jinja2Templates(directory="templates")

def get_db_connection():
    conn = sqlite3.connect('platform_data.db')
    conn.row_factory = sqlite3.Row
    return conn

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def authenticate_admin(request: Request):
    # Simple session check - in production use proper sessions
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
    conn.commit()
    conn.close()
    
    response = RedirectResponse(url="/admin", status_code=302)
    response.set_cookie(key="admin_token", value=token)
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
    conn.close()
    
    return templates.TemplateResponse("admin_dashboard.html", {
        "request": request, 
        "users": users, 
        "funds": funds
    })

@app.post("/admin/create-user")
async def create_user(request: Request, username: str = Form(), password: str = Form(), role: str = Form()):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    
    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)", 
                    (username, hash_password(password), role, datetime.now().strftime('%Y-%m-%d %H:%M:%S')))
        conn.commit()
        message = "User created successfully"
    except sqlite3.IntegrityError:
        message = "Username already exists"
    conn.close()
    
    return RedirectResponse(url="/admin?message=" + message, status_code=302)

@app.post("/admin/create-fund")
async def create_fund(request: Request, name: str = Form(), api_symbol: str = Form(), type: str = Form()):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    
    conn = get_db_connection()
    try:
        conn.execute("INSERT INTO funds (name, api_symbol, type) VALUES (?, ?, ?)", (name, api_symbol, type))
        conn.commit()
        message = "Fund created successfully"
    except sqlite3.IntegrityError:
        message = "Fund name already exists"
    conn.close()
    
    return RedirectResponse(url="/admin?message=" + message, status_code=302)

@app.post("/admin/update-template")
async def update_template(request: Request, template_name: str = Form(), template_data: str = Form()):
    try:
        authenticate_admin(request)
    except HTTPException:
        return RedirectResponse(url="/", status_code=302)
    
    # Here you would update the template in the database or config file
    # For now, just return success
    return RedirectResponse(url="/admin?message=Template updated", status_code=302)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
