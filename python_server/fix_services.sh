#!/bin/bash
# Fix NAV Checker services

echo "🔍 Finding what's using ports 8001 and 8002..."
sudo netstat -tlnp | grep -E "(8001|8002)"

echo ""
echo "🛑 Stopping current services..."
sudo systemctl stop nav-checker-api
sudo systemctl stop nav-checker-admin

echo ""
echo "🔫 Killing any processes on ports 8001 and 8002..."
sudo fuser -k 8001/tcp 2>/dev/null || echo "Port 8001 was free"
sudo fuser -k 8002/tcp 2>/dev/null || echo "Port 8002 was free"

echo ""
echo "📦 Installing missing dependencies..."
pip3 install python-multipart

echo ""
echo "⏳ Waiting 5 seconds for ports to be fully released..."
sleep 5

echo ""
echo "🚀 Starting services again..."
sudo systemctl start nav-checker-api
sudo systemctl start nav-checker-admin

echo ""
echo "⏳ Waiting 3 seconds for services to start..."
sleep 3

echo ""
echo "📊 Checking service status..."
sudo systemctl status nav-checker-api --no-pager -l
echo ""
sudo systemctl status nav-checker-admin --no-pager -l

echo ""
echo "🌐 Testing endpoints..."
curl -s http://localhost:8001/health && echo " - API Health OK" || echo " - API Health FAILED"
curl -s -I http://localhost:8002/ | head -1 && echo " - Admin Panel OK" || echo " - Admin Panel FAILED"

echo ""
echo "📊 Current port usage:"
sudo netstat -tlnp | grep -E "(8001|8002)"
