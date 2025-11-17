# Deployment

## Local Deployment

### Frontend
- Run the React app locally with Vite.
```bash
cd frontend
cp .env.example .env                    # One-Time Setup
npm install                             # One-Time Setup
npm run dev
```

### Backend
- Start the FastAPI server with Uvicorn.
```bash
cd backend
cp .env.example .env                    # One-Time Setup
python3 -m venv .venv                   # One-Time Setup
source .venv/bin/activate
pip install -r bff/requirements.txt     # One-Time Setup
PYTHONPATH=.. uvicorn backend.bff.app:app --reload --port 8000
```

## Cloudflare Pages & EC2 Deployment

### Prerequisites
- Create an Amazon S3 bucket "repo-mentor".
- Create an IAM policy "RepoMentorS3Policy" granting s3:ListBucket, s3:GetObject, and s3:PutObject access to {BUCKET_NAME}/repos/*.
- Create an IAM role "RepoMentorRole" with RepoMentorS3Policy.
- Create an EC2 key pair "repo-mentor.pem"
- Create an EC2 security group "repo-mentor-sg" (Inbound rules: Custom TCP, 8000, Custom, 0.0.0.0/0).
- Create an EC2 instance "repo-mentor" (Amazon Linux 2023, 64bits x86, t3.small) with repo-mentor.pem and repo-mentor-sg.
- Attach RepoMentorRole to the EC2 instance.
- Amazon API Gateway HTTP API "repo-mentor" with routes integrated to the EC2 instance (CORS enabled).
- Deploy the frontend on Cloudflare Pages (repo-mentor.pages.dev) connected to the GitHub repo kaitozaw/repo_mentor.
- Add a Cloudflare Pages environment variable VITE_API_BASE_URL=https://{API_ID}.execute-api.{REGION}.amazonaws.com.

### Frontend (Cloudflare Pages)
- Push the changes to the main branch for GitHub repo kaitozaw/repo_mentor.
```bash
git add .
git commit -m "message"
git push origin main
```

### Backend (EC2)

#### Initial Deploy

##### 0. Connect to EC2
```bash
ssh -i ~/keys/repo-mentor.pem ec2-user@<EC2_PUBLIC_IP>
```

##### 1. Install base packages
```bash
sudo dnf -y update
sudo dnf -y install git python3 python3-pip
sudo dnf -y install python3.11
```

##### 2. Create runtime user (no sudo, no password login)
```bash
sudo adduser repo
sudo passwd -l repo
sudo mkdir -p /home/repo/.ssh
sudo chown -R repo:repo /home/repo/.ssh
sudo chmod 700 /home/repo/.ssh
```

##### 3. Setup app directory & venv
```bash
sudo -iu repo
mkdir -p ~/apps/repo_mentor_app
cd ~/apps/repo_mentor_app
python3.11 -m venv venv
~/apps/repo_mentor_app/venv/bin/pip install --upgrade pip
```

##### 4. Clone repository
```bash
cd ~/apps
git clone https://github.com/kaitozaw/repo_mentor.git
```

##### 5. Install dependencies into venv
```bash
cd ~/apps/repo_mentor
source ~/apps/repo_mentor_app/venv/bin/activate
cd backend
pip install --upgrade pip
pip install -r requirements.txt
deactivate
```

##### 6. Prepare .env
```bash
cd ~/apps/repo_mentor/backend
nano .env   # copy from local (make sure to set LOCAL_AWS=false)
```

##### 7. Setup systemd service
```bash
exit   # repo -> ec2-user
```
```bash
sudo tee /etc/systemd/system/repo-mentor-api.service >/dev/null <<'UNIT'
[Unit]
Description=Repo Mentor Backend API (FastAPI + Uvicorn)
After=network-online.target
Wants=network-online.target

[Service]
User=repo
Group=repo
WorkingDirectory=/home/repo/apps/repo_mentor/backend
EnvironmentFile=/home/repo/apps/repo_mentor/backend/.env
Environment=PYTHONUNBUFFERED=1
Environment=PYTHONPATH=..
ExecStart=/home/repo/apps/repo_mentor_app/venv/bin/uvicorn backend.api:app --host 0.0.0.0 --port 8000

Restart=on-failure
RestartSec=3
KillSignal=SIGINT
TimeoutStopSec=15

[Install]
WantedBy=multi-user.target
UNIT
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable repo-mentor-api
sudo systemctl start repo-mentor-api
sudo systemctl status repo-mentor-api --no-pager
sudo journalctl -u repo-mentor-api -f
```

#### Redeploy

##### 0. Connect to EC2
```bash
ssh -i ~/keys/repo-mentor.pem ec2-user@<EC2_PUBLIC_IP>
```

##### 1. Stop the running service
```bash
sudo systemctl stop repo-mentor-api
```

##### 2. Update the repository
```bash
sudo -iu repo
cd ~/apps/repo-mentor
git pull origin main
cd backend  # if new dependency is installed
source ~/apps/repo_mentor_app/venv/bin/activate
pip install -r requirements.txt
deactivate
```

##### 3. Restart the service
```bash
exit   # repo -> ec2-user
sudo systemctl start repo-mentor-api
```

##### 4. Check service status and logs
```bash
sudo systemctl status repo-mentor-api --no-pager
sudo journalctl -u repo-mentor-api -f
```