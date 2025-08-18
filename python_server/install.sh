#!/bin/bash

# ==============================================================================
# اسکریپت نصب و راه‌اندازی سرویس بک‌اند دستیار NAV
# این اسکریپت برنامه پایتون را به عنوان یک سرویس systemd راه‌اندازی می‌کند
# که پشت وب‌سرور Nginx اجرا خواهد شد.
# ==============================================================================

# --- متغیرهای قابل تنظیم ---
# آدرس کامل ریپازیتوری گیت پروژه شما
GIT_REPO_URL="https://github.com/your-username/nav_assistant_project.git"

# نام پوشه اصلی پروژه که ساخته خواهد شد
PROJECT_DIR="nav_assistant_project"

# نام کاربری که سرویس با آن اجرا خواهد شد (برای امنیت بهتر)
# می‌توانید این کاربر را از قبل با دستور useradd بسازید
SERVICE_USER="nav_assistant_user"

# --- شروع نصب ---

echo ">>> شروع فرآیند نصب سرویس بک‌اند دستیار NAV..."

# 1. به‌روزرسانی سیستم و نصب پیش‌نیازهای اصلی
echo ">>> 1/5: به‌روزرسانی پکیج‌ها و نصب Python, Pip, Venv, Git..."
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv git

# 2. دریافت پروژه از گیت
echo ">>> 2/5: دریافت پروژه از ریپازیتوری گیت..."
if [ -d "$PROJECT_DIR" ]; then
    echo "پوشه پروژه از قبل وجود دارد. به‌روزرسانی با git pull..."
    cd "$PROJECT_DIR"
    git pull
    cd "python_server/"
else
    git clone "$GIT_REPO_URL"
    cd "$PROJECT_DIR/python_server/"
fi

# 3. ساخت محیط مجازی پایتون و نصب کتابخانه‌ها
echo ">>> 3/5: ساخت محیط مجازی و نصب کتابخانه‌های پایتون از requirements.txt..."
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
deactivate

# 4. راه‌اندازی اولیه دیتابیس
echo ">>> 4/5: اجرای اسکریپت ساخت دیتابیس..."
# اجرای اسکریپت با استفاده از پایتونِ محیط مجازی
./venv/bin/python database_setup.py

# 5. ساخت سرویس Systemd برای اجرای دائمی برنامه
echo ">>> 5/5: ساخت و فعال‌سازی سرویس systemd..."

# مسیر کامل به فایل اجرایی uvicorn در محیط مجازی
UVICORN_PATH=$(pwd)/venv/bin/uvicorn
# مسیر کامل به پوشه کاری
WORKING_DIR=$(pwd)

# ایجاد فایل سرویس
# این سرویس روی localhost:8000 اجرا می‌شود تا Nginx به آن متصل شود.
sudo bash -c "cat > /etc/systemd/system/nav_assistant.service <<EOF
[Unit]
Description=NAV Assistant Backend Uvicorn Service
After=network.target

[Service]
User=$SERVICE_USER
Group=www-data
WorkingDirectory=$WORKING_DIR
ExecStart=$UVICORN_PATH main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF"

# فعال‌سازی و اجرای سرویس
echo "فعال‌سازی و اجرای سرویس برنامه..."
sudo systemctl daemon-reload
sudo systemctl enable nav_assistant.service
sudo systemctl start nav_assistant.service

echo "=============================================================================="
echo "✅ نصب سرویس بک‌اند با موفقیت به پایان رسید!"
echo "سرویس nav_assistant هم اکنون روی http://127.0.0.1:8000 در حال اجراست."
echo "برای بررسی وضعیت، از دستور 'sudo systemctl status nav_assistant.service' استفاده کنید."
echo "مرحله بعدی، نصب و پیکربندی Nginx است."
echo "=============================================================================="