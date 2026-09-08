# ☁️ AWS EC2 Deployment Guide (500-Agent Central Server)

Yeh step-by-step guide aapke Call Center Copilot central server ko **Amazon Web Services (AWS)** par deploy karne ke liye hai.

---

## Step 1: AWS Console mein EC2 Instance Launch Karein

1. [AWS Console](https://console.aws.amazon.com/) mein login karein aur **EC2** service kholein.
2. **"Launch Instance"** button par click karein.
3. Configure settings:
   - **Name**: `CallCenter-Copilot-Server`
   - **OS (AMI)**: **Ubuntu 24.04 LTS** (Free tier eligible)
   - **Instance Type**: 
     - Shuruat ke liye: `t3.micro` (Free Tier) ya `t3.small` (2 GB RAM, ~$12/month).
     - 500 agents peak traffic ke liye: `t3.medium` (4 GB RAM, ~$24/month).
   - **Key pair (login)**: Naya key pair banayein (e.g. `callcenter-key.pem`) aur download karein.
4. **Network settings (Security Group)**:
   Inbound rules mein yeh 3 ports allow karein:
   - **SSH** (Port 22) - `Anywhere` ya `My IP`
   - **HTTP** (Port 80) - `Anywhere (0.0.0.0/0)`
   - **Custom TCP** (Port 3847) - `Anywhere (0.0.0.0/0)`
5. **Launch Instance** par click karein.

---

## Step 2: EC2 Server se Connect Karein

Terminal mein download kiye gaye key pair ke folder mein jayein:
```bash
chmod 400 callcenter-key.pem
ssh -i "callcenter-key.pem" ubuntu@<YOUR-EC2-PUBLIC-IP>
```

---

## Step 3: Project Files Upload Karein

Aapne Mac/PC se yeh project folder EC2 par copy karne ke liye:
```bash
scp -i "callcenter-key.pem" -r "/Users/anujkumarsingh/Downloads/Chatbot for Call Center" ubuntu@<YOUR-EC2-PUBLIC-IP>:~/callcenter
```

---

## Step 4: 1-Click Deployment Script Run Karein

EC2 server ke terminal mein:
```bash
cd ~/callcenter
chmod +x deploy_aws.sh
./deploy_aws.sh
```

Yeh script automatic:
- Node.js 20 LTS install karega
- PM2 (24x7 process manager) install karega
- Server ko start aur auto-restart on reboot enable karega
- Firewall configure karega

---

## Step 5: Test Karein

Aapka server live ho chuka hoga:
- **Master Admin Dashboard**: `http://<YOUR-EC2-PUBLIC-IP>:3847/admin`
- **Agent Endpoint**: `http://<YOUR-EC2-PUBLIC-IP>:3847/?mode=agent`

---

## Step 6: 500 Agents ke `.exe` me Central URL Set Karein

Aapke local project mein `client-config.json` ko update karein:
```json
{
  "serverUrl": "http://<YOUR-EC2-PUBLIC-IP>:3847/?mode=agent",
  "appName": "Call Center AI Copilot",
  "hotkey": "CommandOrControl+Shift+Space",
  "agentOnlyMode": true
}
```
Ab Windows par run karein:
```bash
npm run build:win
```
`dist/` folder mein banne wali `.exe` file ko 500 agents ke PC par distribute kar dein!
Sabhi 500 agents direct aapke AWS server se connect ho jayenge.
