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
- Create an IAM policy "RepoMentorS3Policy" granting s3:ListBucket, s3:GetObject, and s3:PutObject access to {S3_BUCKET_NAME}/repos/*.
- Create an IAM role "RepoMentorRole" with RepoMentorS3Policy.
- Create an EC2 instance with key pair and security group, 
- Attach RepoMentorEC2Role to the EC2 instance.
- Amazon API Gateway HTTP API "repo-mentor" with POST /repos route integrated to the EC2 instance (CORS enabled, stage: prod).
- Deploy the frontend on Cloudflare Pages (dev-agents.pages.dev) connected to the GitHub repo kaitozaw/dev_agents.
- Add a Cloudflare Pages environment variable VITE_API_BASE_URL=https://{API_ID}.execute-api.{REGION}.amazonaws.com/{STAGE}.

### Frontend (Cloudflare Pages)
- Push the changes to the main branch for GitHub repo kaitozaw/dev_agents.
```bash
git add .
git commit -m "message"
git push origin main
```

### Backend (EC2)

#### Initial Deploy

##### Initial Deploy


#### Redeploy
