#!/bin/bash
# Complete Fresh Installation of NAV Checker with Virtual Environment

set -e

echo "🚀 Starting fresh NAV Checker installation..."

PROJECT_DIR="/root/nav_assistant_project"
VENV_DIR="$PROJECT_DIR/venv"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Step 1: Clean up any existing processes
log_info "Step 1: Cleaning up existing processes..."

# Stop and disable any existing services
sudo systemctl stop nav-checker-api nav-checker-admin 2>/dev/null || true
sudo systemctl disable nav-checker-api nav-checker-admin 2>/dev/null || true

# Kill any processes on ports 8001, 8002
sudo fuser -k 8001/tcp 2>/dev/null || true
sudo fuser -k 8002/tcp 2>/dev/null || true

# Remove old service files
sudo rm -f /etc/systemd/system/nav-checker-*.service

log_success "Cleanup completed"

# Step 2: System packages
log_info "Step 2: Installing system packages..."

sudo apt update
sudo apt install -y python3 python3-venv python3-pip nginx certbot python3-certbot-nginx net-tools curl git htop

log_success "System packages installed"

# Step 3: Project setup
log_info "Step 3: Setting up project directory..."

cd $PROJECT_DIR

# Remove old venv if exists
if [ -d "$VENV_DIR" ]; then
    log_warning "Removing existing virtual environment..."
    rm -rf "$VENV_DIR"
fi

# Create new virtual environment
log_info "Creating new virtual environment..."
python3 -m venv "$VENV_DIR"

# Activate virtual environment
source "$VENV_DIR/bin/activate"

log_success "Virtual environment created and activated"

# Step 4: Install Python dependencies
log_info "Step 4: Installing Python dependencies..."

cd python_server
pip install --upgrade pip
pip install -r requirements.txt

log_success "Python dependencies installed"

# Step 5: Database setup
log_info "Step 5: Setting up database..."

python quick_setup.py

log_success "Database setup completed"

# Step 6: Create systemd service files with venv
log_info "Step 6: Creating systemd services..."

# API Service
sudo tee /etc/systemd/system/nav-checker-api.service > /dev/null <<EOF
[Unit]
Description=NAV Checker API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR/python_server
Environment=PATH=$VENV_DIR/bin:/usr/bin:/usr/local/bin
Environment=PYTHONPATH=$PROJECT_DIR/python_server
ExecStart=$VENV_DIR/bin/python -m uvicorn main:app --host 0.0.0.0 --port 8001
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Admin Service
sudo tee /etc/systemd/system/nav-checker-admin.service > /dev/null <<EOF
[Unit]
Description=NAV Checker Admin Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$PROJECT_DIR/python_server
Environment=PATH=$VENV_DIR/bin:/usr/bin:/usr/local/bin
Environment=PYTHONPATH=$PROJECT_DIR/python_server
ExecStart=$VENV_DIR/bin/python -m uvicorn admin_panel:app --host 0.0.0.0 --port 8002
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

log_success "Systemd services created"

# Step 7: Start services
log_info "Step 7: Starting services..."

sudo systemctl daemon-reload
sudo systemctl enable nav-checker-api nav-checker-admin
sudo systemctl start nav-checker-api nav-checker-admin

# Wait for services to start
sleep 5

log_success "Services started"

# Step 8: Configure Nginx
log_info "Step 8: Configuring Nginx..."

# Create nginx config
sudo tee /etc/nginx/sites-available/nav-checker > /dev/null <<EOF
# NAV Checker Nginx Configuration

# API Server
server {
    listen 80;
    server_name chabokan.irplatforme.ir;
    
    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        
        # CORS headers
        add_header Access-Control-Allow-Origin *;
        add_header Access-Control-Allow-Methods "GET, POST, OPTIONS";
        add_header Access-Control-Allow-Headers "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization";
    }
}

# Admin Panel
server {
    listen 80;
    server_name admin.chabokan.irplatforme.ir;
    
    location / {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Remove default site and enable our config
sudo rm -f /etc/nginx/sites-enabled/default
sudo ln -sf /etc/nginx/sites-available/nav-checker /etc/nginx/sites-enabled/

# Test and restart nginx
sudo nginx -t
sudo systemctl restart nginx

log_success "Nginx configured"

# Step 9: Setup SSL certificates
log_info "Step 9: Setting up SSL certificates..."

# SSL for API domain
log_info "Setting up SSL for chabokan.irplatforme.ir..."
sudo certbot --nginx -d chabokan.irplatforme.ir --non-interactive --agree-tos --email admin@chabokan.ir

# SSL for Admin domain
log_info "Setting up SSL for admin.chabokan.irplatforme.ir..."
sudo certbot --nginx -d admin.chabokan.irplatforme.ir --non-interactive --agree-tos --email admin@chabokan.ir

log_success "SSL certificates installed"

# Step 10: Final tests
log_info "Step 10: Running final tests..."

echo ""
log_info "=== Service Status ==="
sudo systemctl status nav-checker-api --no-pager -l
echo ""
sudo systemctl status nav-checker-admin --no-pager -l

echo ""
log_info "=== Port Status ==="
ss -tlnp | grep -E "(8001|8002)"

echo ""
log_info "=== API Tests ==="
curl -s http://localhost:8001/health && echo " ✅ API Health Check: OK" || echo " ❌ API Health Check: FAILED"
curl -s https://chabokan.irplatforme.ir/health && echo " ✅ API HTTPS: OK" || echo " ❌ API HTTPS: FAILED"

echo ""
log_info "=== Admin Tests ==="
curl -s -I http://localhost:8002/ | head -1 && echo " ✅ Admin Local: OK" || echo " ❌ Admin Local: FAILED"
curl -s -I https://admin.chabokan.irplatforme.ir/ | head -1 && echo " ✅ Admin HTTPS: OK" || echo " ❌ Admin HTTPS: FAILED"

echo ""
log_success "=== Installation Complete! ==="
echo ""
echo "🌐 Your NAV Checker is now available at:"
echo "   📊 API:         https://chabokan.irplatforme.ir"
echo "   🛠️  Admin Panel: https://admin.chabokan.irplatforme.ir"
echo ""
echo "🔑 Login credentials:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "📋 Useful commands:"
echo "   Activate venv:     source $VENV_DIR/bin/activate"
echo "   Check API logs:    sudo journalctl -u nav-checker-api -f"
echo "   Check Admin logs:  sudo journalctl -u nav-checker-admin -f"
echo "   Restart API:       sudo systemctl restart nav-checker-api"
echo "   Restart Admin:     sudo systemctl restart nav-checker-admin"
echo "   Check Nginx:       sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "🎉 Happy coding!"
