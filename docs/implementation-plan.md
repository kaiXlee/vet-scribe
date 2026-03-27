# VetScribe AI — Implementation Plan

---

## Phase 0 — Prompt Engineering

Goal: Validate that Claude can generate accurate SOAP notes from Chinglish transcripts before writing any backend code.

### Tasks

**P0-1: Write synthetic Chinglish transcripts**
- Write 3-5 mock consultation transcripts in the style of a Taiwan vet clinic
- Each transcript should mix Traditional Chinese and English medical terms
- Cover different case types: routine checkup, emergency, chronic illness
- Example format:
  ```
  Vet: 今天帶來的主要問題是什麼?
  Owner: 牠 vomiting 了三天，也不太 eating。
  Vet: 好，我們先做個 physical exam。Heart rate 偏高，我覺得可能是 gastroenteritis，
       先 run 一個 CBC 跟 chemistry panel，再看看結果。
  ```

**P0-2: Draft Claude system prompt**
- Role definition: Taiwan veterinary clinical scribe
- Input context: Chinglish transcripts, Traditional Chinese + English
- Medical translation layer: map phonetic → correct abbreviations
  - "see bee see" → CBC
  - "ex-ray" / "x ray" → X-Ray
  - "cat scan" → CT
  - "ultra sound" → Ultrasound
  - "eye vee" → IV
- Output format: strict JSON
  ```json
  {
    "subjective": "...",
    "objective": "...",
    "assessment": "...",
    "plan": "..."
  }
  ```
- Few-shot examples: include 2 transcript → SOAP pairs in the prompt

**P0-3: Test prompt in Claude Playground**
- Paste each synthetic transcript into Claude with the system prompt
- Validate JSON output is well-formed
- Check that medical terms are correctly mapped
- Check that Mandarin context is correctly interpreted into English SOAP sections
- Iterate on prompt until output quality is acceptable

**P0-4: Save final prompt**
- Save the final system prompt to `backend/app/services/soap_generator_prompt.txt`
- This will be loaded by `soap_generator.py` in Phase 1

---

## Phase 1 — Backend Core

Goal: A working FastAPI backend that accepts audio, transcribes it with Whisper, and generates a SOAP note with Claude. Testable via Postman or curl before any mobile app exists.

### Prerequisites
- Python 3.11+ installed
- OpenAI API key
- Anthropic API key
- PostgreSQL running locally (via Docker)

### Tasks

**P1-1: Project setup**
- Create `backend/` directory
- Set up Python virtual environment
- Create `requirements.txt`:
  ```
  fastapi
  uvicorn
  websockets
  sqlalchemy
  asyncpg
  alembic
  openai
  anthropic
  boto3
  python-dotenv
  ```
- Create `.env` file:
  ```
  API_KEY=your-secret-key
  OPENAI_API_KEY=...
  ANTHROPIC_API_KEY=...
  DATABASE_URL=postgresql+asyncpg://...
  S3_BUCKET_NAME=...
  AWS_REGION=us-west-2
  ```
- Create `Dockerfile`

**P1-2: Database setup**
- Run PostgreSQL locally via Docker:
  ```bash
  docker run -e POSTGRES_PASSWORD=password -p 5432:5432 postgres
  ```
- Create `backend/app/db/database.py` — async SQLAlchemy engine + session factory
- Create `backend/app/models/session.py` — SQLAlchemy models for `sessions` and `soap_notes`
- Set up Alembic for migrations
- Run initial migration to create tables

**P1-3: Auth middleware**
- Create `backend/app/middleware/auth.py`
- Validate `X-API-Key` header on every request
- Return `401` if missing or invalid
- Apply to all REST routes and WebSocket connections

**P1-4: Whisper integration**
- Create `backend/app/services/transcription.py`
- Function: `transcribe_chunk(audio_bytes: bytes) -> str`
- Sends PCM audio chunk to OpenAI Whisper API (`whisper-1` model)
- Returns transcript text
- Handle overlap deduplication — strip first 1-2 seconds of returned text if it duplicates previous chunk end

**P1-5: Claude integration**
- Create `backend/app/services/soap_generator.py`
- Load system prompt from `soap_generator_prompt.txt`
- Function: `generate_soap(transcript: str) -> dict`
- Sends transcript to Claude API
- Parses and validates JSON response
- Returns dict with keys: `subjective`, `objective`, `assessment`, `plan`
- Raises exception on malformed JSON (triggers error state)

**P1-6: REST API endpoints**
- Create `backend/app/routers/sessions.py`
- Implement all 6 endpoints:
  - `POST /sessions`
  - `GET /sessions`
  - `GET /sessions/{id}`
  - `PATCH /sessions/{id}`
  - `DELETE /sessions/{id}`
  - `POST /sessions/{id}/retry-soap`
- Test each endpoint with Postman

**P1-7: WebSocket endpoint + audio pipeline**
- Create `backend/app/routers/websocket.py`
- Handle binary audio chunks → buffer → send to Whisper every 10s
- Handle control messages: `stop`, `pause`, `resume`, `ping`
- Send `transcript`, `soap`, `pong`, `error` messages back to client
- On `stop`: send accumulated transcript to Claude, save SOAP to DB, upload audio to S3 async
- Handle disconnect gracefully — save current transcript to DB

**P1-8: Integration test**
- Use Postman or a test script to:
  1. `POST /sessions` → get session_id
  2. Open WebSocket, send a pre-recorded PCM audio file in 10s chunks
  3. Verify live transcript messages come back
  4. Send `stop` message
  5. Verify SOAP note JSON is returned
  6. `GET /sessions/{id}` to verify data persisted in DB

---

## Phase 2 — Mobile App

Goal: A working Expo mobile app on iOS that connects to the Phase 1 backend and covers all wireframed screens.

### Prerequisites
- Node.js 18+ installed
- Expo CLI installed (`npm install -g expo-cli`)
- Expo Go app on your iPhone
- Phase 1 backend running locally

### Tasks

**P2-1: Expo project setup**
- Create `mobile/` directory
- Initialize Expo project with TypeScript template
- Install dependencies:
  ```
  expo-av           # audio recording
  expo-router       # file-based navigation
  react-native-reanimated  # pulsing animation
  react-native-gesture-handler  # long press
  axios             # REST API calls
  ```
- Configure `app.json` (app name, bundle ID)
- Verify app runs on device via Expo Go

**P2-2: API + WebSocket services**
- Create `mobile/services/api.ts`
  - Base URL + `X-API-Key` header on all requests
  - Functions: `createSession`, `getSessions`, `getSession`, `renameSession`, `deleteSession`, `retrySoap`
- Create `mobile/services/websocket.ts`
  - Connect/disconnect
  - Send binary audio chunks
  - Send control messages (stop, pause, resume)
  - Heartbeat ping every 5s
  - Auto-reconnect on disconnect with same `session_id`
  - Callbacks: `onTranscript`, `onSoap`, `onError`, `onPong`

**P2-3: Audio recording service**
- Create `mobile/services/audio.ts`
- Use `expo-av` to record in PCM/WAV format
- Buffer audio and emit 10s chunks with 1-2s overlap
- Expose: `startRecording`, `pauseRecording`, `resumeRecording`, `stopRecording`

**P2-4: Home screen**
- File: `mobile/app/index.tsx`
- Large centered Record button
- Tapping Record: calls `POST /sessions`, opens WebSocket, starts audio recording
- Hamburger `☰` button opens drawer

**P2-5: PulsingIndicator component**
- File: `mobile/components/PulsingIndicator.tsx`
- Red pulsing dot using `react-native-reanimated`
- Shown during recording, hidden when paused or stopped

**P2-6: Recording screen**
- Update `mobile/app/index.tsx` to show recording state
- Live transcript text area (append as `onTranscript` fires)
- Session timer (elapsed time)
- Pause / Stop buttons
- Stop triggers confirmation dialog before ending session

**P2-7: SOAP note + transcript view**
- File: `mobile/app/session/[id].tsx`
- Fetch session + SOAP note via `GET /sessions/{id}`
- Two tabs: SOAP Note / Transcript
- SOAP Note tab: render S / O / A / P sections
- Transcript tab: render raw transcript text
- Hamburger `☰` opens drawer

**P2-8: Generating SOAP loading screen**
- Shown after Stop confirmed, while waiting for SOAP note from WebSocket
- Loading spinner + "Generating SOAP note..." text
- On `onSoap` callback: navigate to session view
- On `onError` callback: show error screen with Retry + View Transcript options

**P2-9: Drawer component**
- File: `mobile/components/Drawer.tsx`
- Slide in from left on `☰` tap
- "+ New Session" at top → navigates to Home
- Session history list: name + date, sorted most recent first
- Long press on session → context menu (Rename / Delete)
- Rename → input dialog → `PATCH /sessions/{id}`
- Delete → `DELETE /sessions/{id}`
- Empty state: "No sessions yet. Tap the mic to start your first recording."
- Settings at bottom (placeholder for now)
- Tap outside drawer to close

**P2-10: End-to-end test on device**
- Run backend locally
- Open app on iPhone via Expo Go
- Record a 1-2 minute mock consultation (speak English or Chinglish)
- Verify live transcript appears
- Stop recording, verify SOAP note is generated
- Check session appears in drawer history
- Test rename and delete via long press
- Test retry flow by temporarily breaking the Claude API key

---

## Phase 3 — Infrastructure (AWS CDK)

Goal: Provision all AWS resources via code so the entire stack can be deployed and torn down with a single command.

### Prerequisites
- AWS CLI installed and configured (`aws configure`)
- Node.js 18+ (for CDK)
- AWS CDK CLI installed (`npm install -g aws-cdk`)
- Docker installed (for building App Runner image)

### Tasks

**P3-1: CDK project setup**
- Create `infra/` directory
- Initialize CDK project: `cdk init app --language typescript`
- Install CDK libraries:
  ```
  @aws-cdk/aws-rds
  @aws-cdk/aws-s3
  @aws-cdk/aws-apprunner
  @aws-cdk/aws-ec2
  @aws-cdk/aws-secretsmanager
  ```

**P3-2: VPC + networking**
- Define VPC with public and private subnets
- RDS goes in private subnet (not publicly accessible)
- App Runner connects to RDS via VPC connector

**P3-3: RDS PostgreSQL**
- Define `postgres` RDS instance (t3.micro for MVP)
- Store DB credentials in AWS Secrets Manager
- Run Alembic migrations after deploy

**P3-4: S3 bucket**
- Define S3 bucket for audio storage
- Block all public access
- Enable server-side encryption

**P3-5: App Runner**
- Build and push FastAPI Docker image to ECR
- Define App Runner service pointing to ECR image
- Inject environment variables from Secrets Manager:
  - `API_KEY`
  - `OPENAI_API_KEY`
  - `ANTHROPIC_API_KEY`
  - `DATABASE_URL`
  - `S3_BUCKET_NAME`
- Attach VPC connector to reach RDS in private subnet

**P3-6: Deploy to us-west-2**
- `cdk bootstrap`
- `cdk deploy`
- Verify App Runner URL is reachable
- Run Alembic migrations against production RDS
- Update mobile app `.env` with production backend URL
- Run end-to-end test against live AWS stack

**P3-7: Tear down (when needed)**
- `cdk destroy` removes all provisioned resources
- Avoids ongoing AWS charges when not in use

---

## Summary

| Phase | Goal | Key Output |
|-------|------|-----------|
| Phase 0 | Validate AI output quality | Tested Claude system prompt |
| Phase 1 | Working backend | FastAPI server testable via Postman |
| Phase 2 | Working mobile app | Full end-to-end flow on iPhone |
| Phase 3 | Cloud infrastructure | One-command AWS deploy via CDK |
