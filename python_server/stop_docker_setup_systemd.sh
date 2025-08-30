#!/bin/bash
# Stop Docker and setup NAV Checker with SystemD

set -e

echo "🛑 Stopping Docker containers..."

# Stop all running containers
if [ "$(docker ps -q)" ]; then
    echo "Stopping running containers..."
    docker stop $(docker ps -q)
fi

# Remove containers (optional - keeps data safe)
if [ "$(docker ps -aq)" ]; then
    echo "Removing containers..."
    docker rm $(docker ps -aq)
fi

# Optionally stop Docker service
read -p "Do you want to stop Docker service completely? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    sudo systemctl stop docker
    sudo systemctl disable docker
    echo "Docker service stopped and disabled"
fi

echo "🐍 Installing Python dependencies..."
pip3 install -r requirements.txt

echo "🗄️ Setting up database..."
python3 quick_setup.py

echo "⚙️ Setting up SystemD services..."

# Create API service file
sudo tee /etc/systemd/system/nav-checker-api.service > /dev/null <<EOF
[Unit]
Description=NAV Checker API Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/nav_assistant_project/python_server
Environment=PATH=/usr/bin:/usr/local/bin
Environment=PYTHONPATH=/root/nav_assistant_project/python_server
ExecStart=/usr/bin/python3 -m uvicorn main:app --host 0.0.0.0 --port 8001 --reload
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Create Admin service file
sudo tee /etc/systemd/system/nav-checker-admin.service > /dev/null <<EOF
[Unit]
Description=NAV Checker Admin Panel
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/nav_assistant_project/python_server
Environment=PATH=/usr/bin:/usr/local/bin
Environment=PYTHONPATH=/root/nav_assistant_project/python_server
ExecStart=/usr/bin/python3 -m uvicorn admin_panel:app --host 0.0.0.0 --port 8002 --reload
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and start services
sudo systemctl daemon-reload
sudo systemctl enable nav-checker-api
sudo systemctl enable nav-checker-admin
sudo systemctl start nav-checker-api
sudo systemctl start nav-checker-admin

# Wait a moment for services to start
sleep 3

echo "📊 Checking service status..."
sudo systemctl status nav-checker-api --no-pager -l
echo ""
sudo systemctl status nav-checker-admin --no-pager -l

echo ""
echo "📝 Recent logs:"
echo "=== API Logs ==="
sudo journalctl -u nav-checker-api --no-pager -n 5

echo ""
echo "=== Admin Logs ==="
sudo journalctl -u nav-checker-admin --no-pager -n 5

echo ""
echo "🌐 Testing endpoints..."
echo "Testing API (port 8001):"
curl -s http://localhost:8001/health || echo "API not responding"

echo ""
echo "Testing Admin (port 8002):"
curl -s -I http://localhost:8002/ || echo "Admin not responding"

echo ""
echo "📊 Current port usage:"
ss -tlnp | grep -E "(8001|8002)"

echo ""
echo "✅ Setup complete!"
echo "🌐 Services should be available at:"
echo "   API:   http://localhost:8001"
echo "   Admin: http://localhost:8002"
echo ""
echo "📋 Useful commands:"
echo "   Check API logs:    sudo journalctl -u nav-checker-api -f"
echo "   Check Admin logs:  sudo journalctl -u nav-checker-admin -f"
echo "   Restart API:       sudo systemctl restart nav-checker-api"
echo "   Restart Admin:     sudo systemctl restart nav-checker-admin"
