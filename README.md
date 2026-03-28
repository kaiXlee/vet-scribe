# VetScribe AI

AI-powered veterinary consultation scribe for Taiwan vet clinics. Records consultations in Chinglish (Traditional Chinese + English), transcribes via OpenAI Whisper, and generates structured SOAP notes via Anthropic Claude.

---

## Project Structure

```
vet-scribe/
├── backend/       FastAPI backend (Python)
├── mobile/        React Native + Expo mobile app (TypeScript)
├── infra/         AWS CDK infrastructure (TypeScript)
└── docs/          Architecture docs, wireframes, user stories
```

---

## Local Development Setup

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | 3.11+ | [python.org](https://python.org) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org) |
| Docker | any | [docker.com](https://docker.com) |
| Expo Go | latest | App Store (iPhone) |

You will also need:
- An **OpenAI API key** (for Whisper transcription)
- An **Anthropic API key** (for Claude SOAP note generation)

---

### 1. Clone the repo

```bash
git clone <repo-url>
cd vet-scribe
```

---

### 2. Backend setup

#### 2a. Create your environment file

The `.env` file is **never committed** — it holds your secret API keys. Copy the example and fill in your real values:

```bash
cd backend
cp .env.example .env
```

Open `backend/.env` and replace the placeholder values:

```env
API_KEY=any-string-you-choose        # shared secret between backend and mobile
OPENAI_API_KEY=sk-...                # from platform.openai.com
ANTHROPIC_API_KEY=sk-ant-...         # from console.anthropic.com
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/vetscribe
S3_BUCKET_NAME=vetscribe-audio       # not used locally — S3 upload is skipped
AWS_REGION=us-west-2
```

> **Note:** `API_KEY` can be any string — it's the shared secret the mobile app uses to authenticate with the backend. Use something like `openssl rand -hex 32` to generate one.

#### 2b. Start PostgreSQL

```bash
docker run -d \
  --name vetscribe-postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=vetscribe \
  -p 5432:5432 \
  postgres:16
```

#### 2c. Create a Python virtual environment and install dependencies

```bash
python3 -m venv venv
venv/bin/pip install -r requirements.txt
```

#### 2d. Run database migrations

```bash
PYTHONPATH=. venv/bin/alembic upgrade head
```

#### 2e. Start the backend server

```bash
PYTHONPATH=. venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Verify it's running:

```bash
curl http://localhost:8000/health
# {"status":"ok"}
```

---

### 3. Mobile setup

#### 3a. Install dependencies

```bash
cd mobile
npm install
```

#### 3b. Create your environment file

```bash
cp .env.example .env.local
```

Open `mobile/.env.local` and set:

```env
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:8000
EXPO_PUBLIC_API_KEY=any-string-you-choose   # must match API_KEY in backend/.env
```

Find your local IP address:
- **Mac:** `ipconfig getifaddr en0`
- **Linux:** `ip route get 1 | awk '{print $7}'`

> Use your machine's LAN IP (e.g. `192.168.1.42`), not `localhost` — your iPhone needs to reach your machine over the network.

#### 3c. Start Expo

```bash
npx expo start
```

Scan the QR code with **Expo Go** on your iPhone. The app will open and connect to your local backend.

---

### 4. Test the full flow locally

1. Tap **REC** in the app to start a session
2. Speak a mock consultation — mix English and Mandarin if you want to test Chinglish handling
3. Tap **Stop** and confirm — the app will wait while the SOAP note is generated
4. The SOAP note view will open with S / O / A / P sections

> **S3 audio upload** is skipped locally (no AWS credentials required). The SOAP note is still generated and saved — only the audio file storage is skipped.

---

### 5. Test the API directly (optional)

You can test all REST endpoints with curl while the backend is running:

```bash
# Create a session
curl -s -X POST http://localhost:8000/sessions \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json"

# List sessions
curl -s http://localhost:8000/sessions \
  -H "X-API-Key: your-api-key"

# Retry SOAP generation for a session (using a saved transcript)
curl -s -X POST http://localhost:8000/sessions/<session-id>/retry-soap \
  -H "X-API-Key: your-api-key"
```

---

## Environment Files Reference

| File | Committed? | Purpose |
|------|------------|---------|
| `backend/.env.example` | Yes | Template — copy to `.env` and fill in values |
| `backend/.env` | **No** | Your real API keys and DB URL |
| `mobile/.env.example` | Yes | Template — copy to `.env.local` and fill in values |
| `mobile/.env.local` | **No** | Your local backend URL and API key |

Never commit `.env` or `.env.local`. They are in `.gitignore`.

---

## AWS Deployment

See [`infra/deploy.sh`](infra/deploy.sh) for the full deployment script.

### Prerequisites

- AWS CLI installed and configured (`aws configure`)
- Docker running
- CDK CLI: `npm install -g aws-cdk`

### One-command deploy

```bash
# Bootstrap CDK (one-time per AWS account/region)
cd infra
npm install
npx cdk bootstrap

# Deploy everything (VPC, RDS, S3, App Runner, ECR)
./deploy.sh
```

The script will:
1. Run `cdk deploy` to provision all AWS resources
2. Build and push the Docker image to ECR
3. Trigger a new App Runner deployment
4. Print the App Runner URL

### After first deploy — set your API keys

The API keys secret is created with placeholder values. Update it with your real keys:

```bash
aws secretsmanager put-secret-value \
  --secret-id vetscribe/api-keys \
  --secret-string '{
    "API_KEY": "your-secret-key",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }'
```

Then trigger a new App Runner deployment to pick up the new values:

```bash
aws apprunner start-deployment \
  --service-arn $(aws apprunner list-services \
    --query "ServiceSummaryList[?ServiceName=='vet-scribe-backend'].ServiceArn" \
    --output text)
```

### Run database migrations against production

RDS is in a private subnet — use the migration script with an EC2 bastion:

```bash
BASTION_INSTANCE_ID=i-0abc1234567890 ./migrate.sh
```

### Update the mobile app to point at production

Set the App Runner URL in `mobile/.env.local`:

```env
EXPO_PUBLIC_API_URL=https://your-service.us-west-2.awsapprunner.com
EXPO_PUBLIC_API_KEY=your-secret-key
```

### Switch to Tokyo for Taiwan production

```bash
AWS_REGION=ap-northeast-1 ./deploy.sh
```

### Tear down

```bash
cd infra
npx cdk destroy
```

> RDS will leave a final snapshot. S3 bucket is retained (not deleted) to preserve audio files.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile | React Native + Expo |
| Backend | Python FastAPI |
| Transcription | OpenAI Whisper (`whisper-1`) |
| SOAP generation | Anthropic Claude (`claude-sonnet-4-6`) |
| Database | PostgreSQL (local Docker / AWS RDS) |
| Audio storage | AWS S3 |
| Hosting | AWS App Runner |
| Infrastructure | AWS CDK (TypeScript) |
