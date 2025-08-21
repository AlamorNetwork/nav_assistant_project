#!/bin/bash

# ==============================================================================
# NAV Assistant - Final Installation Script
# This one-liner script interactively sets up the entire application stack,
# cloning the project into the standard /opt directory.
# ==============================================================================

# Function for colored output
print_success() { echo -e "\e[32m$1\e[0m"; }
print_info() { echo -e "\e[34m$1\e[0m"; }
print_error() { echo -e "\e[31m$1\e[0m"; }
update_project() {
    echo "Updating project from Git repository..."
    cd "$PROJECT_DIR"
    
    # Pull the latest changes from Git
    git pull origin main
    if [ $? -ne 0 ]; then
        echo "Error: 'git pull' failed. Please check for conflicts or connection issues."
        return 1
    fi

    echo "Updating Python dependencies..."
    # Install/update Python packages
    "$PROJECT_DIR/python_server/venv/bin/pip" install -r "$PROJECT_DIR/python_server/requirements.txt"

    echo "Restarting the service to apply changes..."
    # Restart the service
    systemctl restart $SERVICE_NAME
    
    echo "Update complete. Checking status..."
    sleep 2 # Give the service a moment to start
    systemctl status $SERVICE_NAME
}
SERVICE_NAME="nav_assistant.service"
ADMIN_SERVICE_NAME="nav_admin.service"
PROJECT_DIR="/opt/nav_assistant_project"
# Main installation function
install_nav_assistant() {
    # --- Step 1: Get user input ---
    print_info "--- Step 1: Gathering Initial Information ---"
    read -p "Please enter your API domain (e.g., api.example.com): " DOMAIN
    read -p "(Optional) Enter your Admin panel domain (leave empty to skip): " ADMIN_DOMAIN
    read -p "Please enter the full Git repository URL for the project: " GIT_REPO_URL
    read -p "Please enter a valid email for the SSL certificate: " EMAIL
    PROJECT_DIR="nav_assistant_project"
    SERVICE_USER="nav_assistant_user"
    read -p "Use local PostgreSQL on this server? [y/N]: " USE_LOCAL_PG
    if [[ -z "$USE_LOCAL_PG" ]]; then USE_LOCAL_PG="N"; fi
    if [[ "$USE_LOCAL_PG" =~ ^[Yy]$ ]]; then
        read -p "Postgres DB name [nav_assistant]: " PG_DB
        read -p "Postgres DB user [nav_user]: " PG_USER
        read -s -p "Postgres DB password: " PG_PASS; echo
        PG_DB=${PG_DB:-nav_assistant}
        PG_USER=${PG_USER:-nav_user}
    else
        read -p "Enter external DB_URL (e.g. postgresql://user:pass@host:5432/dbname): " EXTERNAL_DB_URL
    fi
    read -p "Enter Telegram BOT_TOKEN (or leave empty to skip alerts): " BOT_TOKEN
    read -p "Enter Telegram ADMIN_CHAT_ID (or leave empty to skip alerts): " ADMIN_CHAT_ID
    
    # --- Step 2: Install system prerequisites ---
    print_info "\n--- Step 2: Installing System Prerequisites ---"
    apt-get update
    apt-get install -y git python3-pip python3-venv nginx certbot python3-certbot-nginx
    if [[ "$USE_LOCAL_PG" =~ ^[Yy]$ ]]; then
        print_info "Installing PostgreSQL..."
        apt-get install -y postgresql postgresql-contrib
        systemctl enable postgresql && systemctl start postgresql
        sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname = '$PG_USER'" | grep -q 1 || sudo -u postgres psql -c "CREATE USER $PG_USER WITH PASSWORD '$PG_PASS';"
        sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = '$PG_DB'" | grep -q 1 || sudo -u postgres psql -c "CREATE DATABASE $PG_DB OWNER $PG_USER;"
        sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $PG_DB TO $PG_USER;"
        DB_URL="postgresql://$PG_USER:$PG_PASS@127.0.0.1:5432/$PG_DB"
    else
        DB_URL="$EXTERNAL_DB_URL"
    fi

    # --- Step 3: Set up the Python application in /opt ---
    print_info "\n--- Step 3: Setting up the Python Application in /opt ---"
    useradd -r -s /bin/false $SERVICE_USER || print_info "User $SERVICE_USER already exists."
    
    print_info "Cloning the repository into /opt/$PROJECT_DIR..."
    git clone "$GIT_REPO_URL" "/opt/$PROJECT_DIR"
    cd "/opt/$PROJECT_DIR/python_server/"
    
    print_info "Setting up Python virtual environment and dependencies..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    # Create env file for systemd
    print_info "Writing environment file to /etc/nav_assistant.env"
    cat > /etc/nav_assistant.env <<ENVEOF
DB_URL=$DB_URL
BOT_TOKEN=$BOT_TOKEN
ADMIN_CHAT_ID=$ADMIN_CHAT_ID
ENVEOF
    chmod 640 /etc/nav_assistant.env
    chown root:www-data /etc/nav_assistant.env

    # Initialize database schema
    DB_URL="$DB_URL" ./venv/bin/python database_setup.py
    deactivate
    
    # Change ownership of the entire project directory to the service user
    chown -R $SERVICE_USER:$SERVICE_USER "/opt/$PROJECT_DIR"

    # --- Step 4: Create the Systemd service ---
    print_info "\n--- Step 4: Creating Systemd Service for Uvicorn ---"
    # Update paths to point to /opt
    UVICORN_PATH="/opt/$PROJECT_DIR/python_server/venv/bin/uvicorn"
    WORKING_DIR="/opt/$PROJECT_DIR/python_server/"
    
    cat > /etc/systemd/system/nav_assistant.service <<EOF
[Unit]
Description=NAV Assistant Backend Uvicorn Service
After=network.target

[Service]
User=$SERVICE_USER
Group=www-data
WorkingDirectory=$WORKING_DIR
EnvironmentFile=/etc/nav_assistant.env
ExecStart=$UVICORN_PATH main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

    # Admin panel service (optional)
    if [[ -n "$ADMIN_DOMAIN" ]]; then
        cat > /etc/systemd/system/nav_admin.service <<EOF
[Unit]
Description=NAV Assistant Admin Panel Uvicorn Service
After=network.target

[Service]
User=$SERVICE_USER
Group=www-data
WorkingDirectory=$WORKING_DIR
EnvironmentFile=/etc/nav_assistant.env
ExecStart=$UVICORN_PATH admin_panel:app --host 127.0.0.1 --port 8001
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
    fi

    systemctl daemon-reload
    systemctl enable nav_assistant.service
    systemctl start nav_assistant.service
    if [[ -n "$ADMIN_DOMAIN" ]]; then
        systemctl enable nav_admin.service
        systemctl start nav_admin.service
    fi

    # --- Step 5: Configure Nginx and get SSL certificate ---
    print_info "\n--- Step 5: Configuring Nginx and getting SSL Certificate ---"
    # API server block
    cat > /etc/nginx/sites-available/$DOMAIN <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
    # Remove existing link if it exists, then create a new one
    rm -f /etc/nginx/sites-enabled/$DOMAIN
    ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/

    # Admin server block (optional)
    if [[ -n "$ADMIN_DOMAIN" ]]; then
        cat > /etc/nginx/sites-available/$ADMIN_DOMAIN <<EOF
server {
    listen 80;
    server_name $ADMIN_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
        rm -f /etc/nginx/sites-enabled/$ADMIN_DOMAIN
        ln -s /etc/nginx/sites-available/$ADMIN_DOMAIN /etc/nginx/sites-enabled/
    fi

    nginx -t
    systemctl reload nginx || systemctl restart nginx

    # SSL for API
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect || true
    # SSL for Admin (optional)
    if [[ -n "$ADMIN_DOMAIN" ]]; then
        certbot --nginx -d $ADMIN_DOMAIN --non-interactive --agree-tos -m $EMAIL --redirect || true
    fi

    # --- Step 6: Create the management script ---
    print_info "\n--- Step 6: Creating Management Menu ---"
    cat > /usr/local/bin/nav_manager <<'EOF'
#!/bin/bash
# Management script for the NAV Assistant services
SERVICE_NAME="nav_assistant.service"
ADMIN_SERVICE_NAME="nav_admin.service"
PROJECT_DIR_PATH="/opt/nav_assistant_project"
PY_VENV="$PROJECT_DIR_PATH/python_server/venv"

show_menu() {
    echo "================================="
    echo "    NAV Assistant Management Menu"
    echo "================================="
    echo "1. Check Backend Status"
    echo "2. View Backend Logs (follow)"
    echo "3. Restart Backend"
    echo "4. Stop Backend"
    echo "5. Start Backend"
    echo "6. Update Project from Git"
    echo "7. Reset Stack (restart backend + reload nginx)"
    echo "8. View Nginx Access Log (follow)"
    echo "9. View Nginx Error Log (follow)"
    echo "10. Certbot Renew (dry-run)"
    echo "11. Certbot Renew (force now)"
    echo "12. Show Environment (/etc/nav_assistant.env)"
    echo "13. Edit Environment (nano)"
    echo "14. Check Admin Status"
    echo "15. View Admin Logs (follow)"
    echo "16. Restart Admin"
    echo "17. Stop Admin"
    echo "18. Start Admin"
    echo "0. Exit"
    echo "================================="
}
while true; do
    show_menu
    read -p "Please select an option: " choice
    case $choice in
        1) systemctl status $SERVICE_NAME ;;
        2) journalctl -u $SERVICE_NAME -f ;;
        3) systemctl restart $SERVICE_NAME && echo "Backend restarted." ;;
        4) systemctl stop $SERVICE_NAME && echo "Backend stopped." ;;
        5) systemctl start $SERVICE_NAME && echo "Backend started." ;;
        6)
            echo "Updating project..."
            if [[ -d "$PROJECT_DIR_PATH/.git" ]]; then
                cd "$PROJECT_DIR_PATH" || { echo "Project not found."; continue; }
                git pull --rebase || { echo "git pull failed"; continue; }
                "$PY_VENV/bin/pip" install -r "$PROJECT_DIR_PATH/python_server/requirements.txt" || echo "pip install failed"
                systemctl restart $SERVICE_NAME && echo "Backend restarted."
                if systemctl list-unit-files | grep -q "$ADMIN_SERVICE_NAME"; then
                    systemctl restart $ADMIN_SERVICE_NAME && echo "Admin restarted."
                fi
            else
                echo "Git repository not found at $PROJECT_DIR_PATH"
            fi
            ;;
        7)
            systemctl restart $SERVICE_NAME && echo "Backend restarted."
            systemctl reload nginx && echo "Nginx reloaded."
            ;;
        8)
            tail -n 200 -f /var/log/nginx/access.log ;;
        9)
            tail -n 200 -f /var/log/nginx/error.log ;;
        10)
            certbot renew --dry-run ;;
        11)
            certbot renew --force-renewal ;;
        12)
            echo "---- /etc/nav_assistant.env ----"
            cat /etc/nav_assistant.env || echo "Env file not found." ;;
        13)
            nano /etc/nav_assistant.env ;;
        14)
            systemctl status $ADMIN_SERVICE_NAME || echo "Admin service not installed." ;;
        15)
            journalctl -u $ADMIN_SERVICE_NAME -f || echo "Admin service not installed." ;;
        16)
            systemctl restart $ADMIN_SERVICE_NAME && echo "Admin restarted." || echo "Admin service not installed." ;;
        17)
            systemctl stop $ADMIN_SERVICE_NAME && echo "Admin stopped." || echo "Admin service not installed." ;;
        18)
            systemctl start $ADMIN_SERVICE_NAME && echo "Admin started." || echo "Admin service not installed." ;;
        0) break ;;
        *) echo "Invalid option." ;;
    esac
    read -p "Press Enter to return to the menu..."
done
EOF
    chmod +x /usr/local/bin/nav_manager

    print_success "\n✅ Installation and configuration completed successfully!"
    print_success "The project is installed in /opt/$PROJECT_DIR"
    print_success "Your API is now available at https://$DOMAIN"
    if [[ -n "$ADMIN_DOMAIN" ]]; then
        print_success "Your Admin panel is now available at https://$ADMIN_DOMAIN"
    fi
    print_success "To manage the services, run 'sudo nav_manager' at any time."
}

# --- Main script logic ---
case "$1" in
    install)
        if [[ $EUID -ne 0 ]]; then
           print_error "This script must be run as root or with sudo." 
           exit 1
        fi
        install_nav_assistant
        ;;
    *)
        echo "Invalid command."
        echo "Usage example: curl ... | sudo bash -s install"
        exit 1
        ;;
esac