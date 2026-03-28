# Testing VetScribe in GitHub Codespaces

Everything runs inside the codespace. Your phone connects via Codespaces port forwarding.

**What you need on your phone:** [Expo Go](https://expo.dev/go) (free, iOS or Android)

---

## Prerequisites — How to Make Codespace Ports Public

By default, forwarded ports require GitHub login to access, which breaks the mobile app. You need to make ports **public** so your phone can reach them freely.

**In the browser (github.dev or codespaces.github.com) or VS Code desktop:**
1. Look for the **Ports** tab in the **bottom panel**, next to the Terminal tab
2. If you don't see it: press `Ctrl+Shift+P` → type `Ports: Focus on Ports View` → Enter
3. **Right-click** the port row → **Port Visibility** → **Public**

You will need to do this for **two ports**:
- Port **8000** — the backend API
- Port **8081** — the Expo dev server

The forwarded URL (e.g. `https://xxxx-8000.app.github.dev`) is shown in the **Local Address** column — copy it when needed in the steps below.

---

## Step 1 — Start PostgreSQL

```bash
docker run -d \
  --name vetscribe-db \
  -e POSTGRES_DB=vetscribe \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:16
```

---

## Step 2 — Run DB Migrations

```bash
cd /workspaces/codespaces-blank/projects/vet-scribe/backend
source venv/bin/activate
alembic upgrade head
```

---

## Step 3 — Start the Backend

```bash
cd /workspaces/codespaces-blank/projects/vet-scribe/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Verify it works:**
```bash
curl http://localhost:8000/health
# expected: {"status":"ok"}
```

Then in Codespaces:
- Go to the **Ports** tab (bottom panel)
- Find port **8000** → right-click → **Port Visibility → Public**
- Copy the forwarded URL (looks like `https://xxxx-8000.app.github.dev`)

---

## Step 4 — Configure the Mobile App

Create `mobile/.env` with the backend URL from Step 3:

```env
EXPO_PUBLIC_API_URL=https://xxxx-8000.app.github.dev
EXPO_PUBLIC_API_KEY=change-me-to-a-secret-key
```

> `API_KEY` must match the `API_KEY` value in `backend/.env`

---

## Step 5 — Start Expo

Open a **second terminal** and run:

```bash
cd /workspaces/codespaces-blank/projects/vet-scribe/mobile
npx expo start --tunnel
```

Then in Codespaces:
- Go to the **Ports** tab
- Find port **8081** → right-click → **Port Visibility → Public**

A QR code will appear in the terminal. Scan it with:
- **iOS:** Camera app
- **Android:** Expo Go app

---

## Step 6 — Test the Full Flow

1. Tap **New Recording** in the app
2. Speak a mock vet consultation (mix English + Mandarin if you want)
3. Tap **Stop** — the app sends audio to Whisper for transcription, then Claude generates the SOAP note
4. The SOAP note appears with **S / O / A / P** sections

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `curl /health` fails | Check backend terminal for errors; make sure DB is running |
| Phone can't connect | Make sure ports 8000 and 8081 are set to **Public** in the Ports tab |
| SOAP note never appears | Check backend logs — Claude or Whisper API key may be wrong |
| WebSocket drops | Reconnect is automatic (3 attempts) — just wait a moment |
| `alembic upgrade head` fails | Make sure the Docker DB container is running first |
