#!/bin/bash
# -------------------------------------------------------------
# AWS EC2 Setup Script for Call Center Copilot (500 Agents Server)
# Run this script on your AWS Ubuntu EC2 Instance
# -------------------------------------------------------------

echo "🚀 Starting AWS EC2 Setup for Call Center Copilot..."

# 1. Update system packages
sudo apt update -y && sudo apt upgrade -y

# 2. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git

# 3. Install PM2 (24x7 Process Manager)
sudo npm install -g pm2

# 4. Install dependencies
npm install --production

# 5. Start Server with PM2 (Auto-restart on crash or reboot)
pm2 stop callcenter-copilot 2>/dev/null || true
pm2 start server.js --name "callcenter-copilot"

# 6. Enable PM2 Startup on Server Reboot
pm2 save
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u $USER --hp $HOME

# 7. Configure Firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3847/tcp
sudo ufw --force enable

echo "--------------------------------------------------------"
echo "✅ Server successfully deployed and running 24x7 on AWS!"
echo "Public IP URL: http://$(curl -s ifconfig.me):3847"
echo "Admin Dashboard: http://$(curl -s ifconfig.me):3847/admin"
echo "--------------------------------------------------------"
