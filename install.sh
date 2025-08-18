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
PROJECT_DIR="/opt/nav_assistant_project"
# Main installation function
install_nav_assistant() {
    # --- Step 1: Get user input ---
    print_info "--- Step 1: Gathering Initial Information ---"
    read -p "Please enter your domain name (e.g., navapi.yourdomain.com): " DOMAIN
    read -p "Please enter the full Git repository URL for the project: " GIT_REPO_URL
    read -p "Please enter a valid email for the SSL certificate: " EMAIL
    PROJECT_DIR="nav_assistant_project"
    SERVICE_USER="nav_assistant_user"
    
    # --- Step 2: Install system prerequisites ---
    print_info "\n--- Step 2: Installing System Prerequisites ---"
    apt-get update
    apt-get install -y git python3-pip python3-venv nginx certbot python3-certbot-nginx

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
    ./venv/bin/python database_setup.py
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
    # Remove existing link if it exists, then create a new one
    rm -f /etc/nginx/sites-enabled/$DOMAIN
    ln -s /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
    nginx -t
    certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m $EMAIL
    systemctl restart nginx

    # --- Step 6: Create the management script ---
    print_info "\n--- Step 6: Creating Management Menu ---"
    cat > /usr/local/bin/nav_manager <<EOF
#!/bin/bash
# Management script for the NAV Assistant service
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
    echo "6. Update Project from Git"
    echo "0. Exit"
    echo "================================="
}
while true; do
    show_menu
    read -p "Please select an option: " choice
    case $choice in
        1) systemctl status $SERVICE_NAME ;;
        2) journalctl -u $SERVICE_NAME -f ;;
        3) systemctl restart $SERVICE_NAME && echo "Service restarted." ;;
        4) systemctl stop $SERVICE_NAME && echo "Service stopped." ;;
        5) systemctl start $SERVICE_NAME && echo "Service started." ;;
        6) update_project ;;
        0) break ;;
        *) echo "Invalid option." ;;
    esac
    read -p "Press Enter to return to the menu..."
done
EOF
    chmod +x /usr/local/bin/nav_manager

    print_success "\n✅ Installation and configuration completed successfully!"
    print_success "The project is installed in /opt/$PROJECT_DIR"
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
        echo "Usage example: curl ... | sudo bash -s install"
        exit 1
        ;;
esac