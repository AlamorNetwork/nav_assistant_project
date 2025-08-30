#!/bin/bash
# Complete deployment script for NAV Checker

set -e  # Exit on any error

echo "🚀 Starting NAV Checker deployment..."

# Update system
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
echo "📦 Installing required packages..."
sudo apt install python3 python3-pip python3-venv nginx certbot python3-certbot-nginx htop curl git -y

# Go to project directory
PROJECT_DIR="/root/nav_assistant_project"
cd $PROJECT_DIR

# Install Python dependencies
echo "🐍 Installing Python dependencies..."
cd python_server
pip3 install -r requirements.txt

# Setup database
echo "🗄️ Setting up database..."
python3 quick_setup.py

# Copy systemd service files
echo "⚙️ Setting up systemd services..."
sudo cp ../nav-checker-api.service /etc/systemd/system/
sudo cp ../nav-checker-admin.service /etc/systemd/system/

# Reload systemd and start services
sudo systemctl daemon-reload
sudo systemctl enable nav-checker-api
sudo systemctl enable nav-checker-admin
sudo systemctl start nav-checker-api
sudo systemctl start nav-checker-admin

# Configure Nginx
echo "🌐 Configuring Nginx..."
sudo cp ../nginx_config.conf /etc/nginx/sites-available/nav-checker

# Update nginx config with correct project path
sudo sed -i "s|/path/to/nav_checker|$PROJECT_DIR|g" /etc/nginx/sites-available/nav-checker

# Enable site
sudo ln -sf /etc/nginx/sites-available/nav-checker /etc/nginx/sites-enabled/
sudo nginx -t  # Test configuration
sudo systemctl restart nginx

# Setup SSL certificates
echo "🔒 Setting up SSL certificates..."
echo "Setting up SSL for chabokan.irplatforme.ir..."
sudo certbot --nginx -d chabokan.irplatforme.ir --non-interactive --agree-tos --email admin@chabokan.ir

echo "Setting up SSL for admin.chabokan.irplatforme.ir..."
sudo certbot --nginx -d admin.chabokan.irplatforme.ir --non-interactive --agree-tos --email admin@chabokan.ir

# Check service status
echo "📊 Checking service status..."
sudo systemctl status nav-checker-api --no-pager
sudo systemctl status nav-checker-admin --no-pager

# Show logs
echo "📝 Recent API logs:"
sudo journalctl -u nav-checker-api --no-pager -n 10

echo "📝 Recent Admin logs:"
sudo journalctl -u nav-checker-admin --no-pager -n 10

echo "✅ Deployment complete!"
echo ""
echo "🌐 Services available at:"
echo "   API:         https://chabokan.irplatforme.ir"
echo "   Admin Panel: https://admin.chabokan.irplatforme.ir"
echo ""
echo "🔑 Login credentials:"
echo "   Username: admin"
echo "   Password: admin123"
echo ""
echo "📊 Useful commands:"
echo "   Check API logs:    sudo journalctl -u nav-checker-api -f"
echo "   Check Admin logs:  sudo journalctl -u nav-checker-admin -f"
echo "   Restart API:       sudo systemctl restart nav-checker-api"
echo "   Restart Admin:     sudo systemctl restart nav-checker-admin"
echo "   Check Nginx:       sudo nginx -t && sudo systemctl reload nginx"
