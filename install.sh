#!/bin/bash

# ==============================================================================
# اسکریپت نصب و مدیریت هوشمند دستیار NAV (نسخه ۲)
# ==============================================================================

# تابع برای نمایش پیام‌های رنگی
print_success() { echo -e "\e[32m$1\e[0m"; }
print_info() { echo -e "\e[34m$1\e[0m"; }
print_error() { echo -e "\e[31m$1\e[0m"; }

# تابع اصلی برای انجام فرآیند نصب
install_nav_assistant() {
    # --- مرحله ۱: دریافت اطلاعات از کاربر ---
    print_info "--- مرحله ۱: دریافت اطلاعات اولیه ---"
    read -p "لطفاً نام دامنه خود را وارد کنید (مثال: navapi.alamornetwork.ir): " DOMAIN
    read -p "لطفاً آدرس کامل ریپازیتوری گیت پروژه را وارد کنید: " GIT_REPO_URL
    read -p "لطفاً یک ایمیل معتبر برای گواهی SSL وارد کنید: " EMAIL
    read -p "نام پوشه اصلی پروژه چه باشد؟ (پیش‌فرض: nav_assistant_project): " PROJECT_DIR
    PROJECT_DIR=${PROJECT_DIR:-nav_assistant_project}
    SERVICE_USER="nav_assistant_user"

    # --- مرحله ۲: نصب پیش‌نیازها ---
    print_info "\n--- مرحله ۲: نصب پیش‌نیازهای سیستمی ---"
    apt-get update
    apt-get install -y git python3-pip python3-venv nginx certbot python3-certbot-nginx

    # --- مرحله ۳: کلون کردن پروژه و راه‌اندازی برنامه پایتون ---
    print_info "\n--- مرحله ۳: راه‌اندازی برنامه پایتون ---"
    useradd -r -s /bin/false $SERVICE_USER || print_info "کاربر $SERVICE_USER از قبل وجود دارد."
    git clone "$GIT_REPO_URL" "/home/$SERVICE_USER/$PROJECT_DIR"
    cd "/home/$SERVICE_USER/$PROJECT_DIR/python_server/"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ./venv/bin/python database_setup.py
    chown -R $SERVICE_USER:$SERVICE_USER "/home/$SERVICE_USER/$PROJECT_DIR"
    deactivate

    # --- مرحله ۴: ساخت سرویس Systemd ---
    print_info "\n--- مرحله ۴: ساخت سرویس Systemd برای Uvicorn ---"
    UVICORN_PATH="/home/$SERVICE_USER/$PROJECT_DIR/python_server/venv/bin/uvicorn"
    WORKING_DIR="/home/$SERVICE_USER/$PROJECT_DIR/python_server/"
    
    cat > /etc/systemd/system/nav_assistant.service <<EOF
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

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable nav_assistant.service
    systemctl start nav_assistant.service

    # --- مرحله ۵: پیکربندی Nginx ---
    print_info "\n--- مرحله ۵: پیکربندی Nginx به عنوان Reverse Proxy ---"
    cat > /etc/nginx/sites-available/$DOMAIN <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    nginx -t

    # --- مرحله ۶: دریافت گواهی SSL ---
    print_info "\n--- مرحله ۶: دریافت گواهی SSL با Certbot ---"
    systemctl stop nginx
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL
    systemctl start nginx

    # --- مرحله ۷: ساخت اسکریپت مدیریتی ---
    print_info "\n--- مرحله ۷: ساخت منوی مدیریتی ---"
    cat > /usr/local/bin/nav_manager <<EOF
#!/bin/bash
SERVICE_NAME="nav_assistant.service"

show_menu() {
    echo "================================="
    echo "    منوی مدیریت دستیار NAV"
    echo "================================="
    echo "1. نمایش وضعیت سرویس (Status)"
    echo "2. نمایش لاگ‌های زنده (Logs)"
    echo "3. ری‌استارت سرویس (Restart)"
    echo "4. متوقف کردن سرویس (Stop)"
    echo "5. شروع سرویس (Start)"
    echo "0. خروج"
    echo "================================="
}

while true; do
    show_menu
    read -p "لطفاً یک گزینه را انتخاب کنید: " choice
    case \$choice in
        1) systemctl status \$SERVICE_NAME ;;
        2) journalctl -u \$SERVICE_NAME -f ;;
        3) systemctl restart \$SERVICE_NAME && echo "سرویس ری‌استارت شد." ;;
        4) systemctl stop \$SERVICE_NAME && echo "سرویس متوقف شد." ;;
        5) systemctl start \$SERVICE_NAME && echo "سرویس شروع شد." ;;
        0) break ;;
        *) echo "گزینه نامعتبر است." ;;
    esac
    read -p "برای بازگشت به منو، کلید Enter را بزنید..."
done
EOF
    chmod +x /usr/local/bin/nav_manager

    # --- پایان ---
    print_success "\n✅ نصب و پیکربندی با موفقیت به پایان رسید!"
    print_success "سرویس شما اکنون روی آدرس https://$DOMAIN در دسترس است."
    print_success "برای مدیریت سرویس، در هر زمان دستور 'sudo nav_manager' را در ترمینال وارد کنید."
}

# --- منطق اصلی اجرای اسکریپت ---
# این بخش بررسی می‌کند که آیا آرگومان ورودی 'install' است یا نه
case "$1" in
    install)
        # بررسی اجرای اسکریپت با دسترسی root
        if [[ $EUID -ne 0 ]]; then
           print_error "این دستور باید با دسترسی root یا sudo اجرا شود." 
           exit 1
        fi
        install_nav_assistant
        ;;
    *)
        echo "دستور نامعتبر است."
        echo "برای نصب، از دستور زیر استفاده کنید:"
        echo "sudo bash <(curl -Ls ...) install"
        exit 1
        ;;
esac