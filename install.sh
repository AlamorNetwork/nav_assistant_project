#!/bin/bash

# ==============================================================================
# NAV Assistant Installation Script (Standard Version)
# This script should be run from the root of the cloned project directory.
# ==============================================================================

# Function for colored output
print_success() { echo -e "\e[32m$1\e[0m"; }
print_info() { echo -e "\e[34m$1\e[0m"; }
print_error() { echo -e "\e[31m$1\e[0m"; }

# Main installation function
install_nav_assistant() {
    # --- Step 1: Get environment information ---
    print_info "--- Step 1: Getting Server Information ---"
    read -p "Please enter your domain name (e.g., navapi.yourdomain.com): " DOMAIN
    read -p "Please enter a valid email for the SSL certificate: " EMAIL
    SERVICE_USER="nav_assistant_user"
    
    # Get the project path from the current working directory
    PROJECT_DIR=$(pwd)

    # --- Step 2: Install system prerequisites ---
    print_info "\n--- Step 2: Installing System Prerequisites ---"
    apt-get update
    apt-get install -y python3-pip python3-venv nginx certbot python3-certbot-nginx

    # --- Step 3: Set up the Python application ---
    print_info "\n--- Step 3: Setting up the Python Application ---"
    useradd -r -s /bin/false $SERVICE_USER || print_info "User $SERVICE_USER already exists."
    
    cd "${PROJECT_DIR}/python_server/"
    python3 -m venv venv
    source venv/bin/activate
    pip install -r requirements.txt
    ./venv/bin/python database_setup.py
    deactivate
    
    # Change ownership of the entire project directory to the service user
    chown -R $SERVICE_USER:$SERVICE_USER "${PROJECT_DIR}"

    # --- Step 4: Create the Systemd service ---
    print_info "\n--- Step 4: Creating Systemd Service for Uvicorn ---"
    UVICORN_PATH="${PROJECT_DIR}/python_server/venv/bin/uvicorn"
    WORKING_DIR="${PROJECT_DIR}/python_server/"
    
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

    # --- Step 5: Configure Nginx and get SSL certificate ---
    print_info "\n--- Step 5: Configuring Nginx and getting SSL Certificate ---"
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
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL
    systemctl restart nginx

    # --- Step 6: Create the management script ---
    print_info "\n--- Step 6: Creating Management Menu ---"
    cat > /usr/local/bin/nav_manager <<EOF
#!/bin/bash
SERVICE_NAME="nav_assistant.service"

show_menu() {
    echo "================================="
    echo "    NAV Assistant Management Menu"
    echo "================================="
    echo "1. Check Service Status"
    echo "2. View Live Logs"
    echo "3. Restart Service"
    echo "4. Stop Service"
    echo "5. Start Service"
    echo "0. Exit"
    echo "================================="
}

while true; do
    show_menu
    read -p "Please select an option: " choice
    case \$choice in
        1) systemctl status \$SERVICE_NAME ;;
        2) journalctl -u \$SERVICE_NAME -f ;;
        3) systemctl restart \$SERVICE_NAME && echo "Service restarted." ;;
        4) systemctl stop \$SERVICE_NAME && echo "Service stopped." ;;
        5) systemctl start \$SERVICE_NAME && echo "Service started." ;;
        0) break ;;
        *) echo "Invalid option." ;;
    esac
    read -p "Press Enter to return to the menu..."
done
EOF
    chmod +x /usr/local/bin/nav_manager

    print_success "\n✅ Installation and configuration completed successfully!"
    print_success "Your service is now available at https://$DOMAIN"
    print_success "To manage the service, run 'sudo nav_manager' at any time."
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
        echo "Usage: ./install.sh install"
        exit 1
        ;;
esac






