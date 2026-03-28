#!/usr/bin/env bash
# migrate.sh — run Alembic migrations against production RDS via SSM port-forward
#
# RDS is in a private subnet and is not publicly accessible. This script:
#   1. Starts an SSM port-forwarding session through a bastion EC2 instance
#   2. Overrides DATABASE_URL to point at localhost:15432 (the forwarded port)
#   3. Runs alembic upgrade head
#   4. Tears down the tunnel
#
# Prerequisites:
#   - AWS CLI + Session Manager plugin installed
#   - A bastion EC2 instance in the same VPC (Amazon Linux 2, SSM agent running)
#   - Python venv set up in backend/ (run: cd backend && python3 -m venv venv && pip install -r requirements.txt)
#
# Usage:
#   BASTION_INSTANCE_ID=i-0abc123 ./migrate.sh
#   BASTION_INSTANCE_ID=i-0abc123 AWS_REGION=ap-northeast-1 ./migrate.sh

set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
BASTION_INSTANCE_ID="${BASTION_INSTANCE_ID:-}"
LOCAL_PORT=15432
BACKEND_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"
INFRA_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "${BASTION_INSTANCE_ID}" ]; then
  echo "ERROR: Set BASTION_INSTANCE_ID to the EC2 instance ID of your bastion host."
  echo "  e.g. BASTION_INSTANCE_ID=i-0abc1234567890 ./migrate.sh"
  exit 1
fi

# ── Read RDS connection details from Secrets Manager ─────────────────────────
echo "==> Fetching DB credentials from Secrets Manager..."
DB_SECRET_ARN="$(aws cloudformation describe-stacks \
  --stack-name VetScribeStack \
  --region "${REGION}" \
  --query "Stacks[0].Outputs[?OutputKey=='DbSecretArn'].OutputValue" \
  --output text)"

DB_HOST="$(aws secretsmanager get-secret-value \
  --secret-id "${DB_SECRET_ARN}" \
  --region "${REGION}" \
  --query SecretString \
  --output text | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['host'])")"

DB_PORT="$(aws secretsmanager get-secret-value \
  --secret-id "${DB_SECRET_ARN}" \
  --region "${REGION}" \
  --query SecretString \
  --output text | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['port'])")"

DB_USER="$(aws secretsmanager get-secret-value \
  --secret-id "${DB_SECRET_ARN}" \
  --region "${REGION}" \
  --query SecretString \
  --output text | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['username'])")"

DB_PASSWORD="$(aws secretsmanager get-secret-value \
  --secret-id "${DB_SECRET_ARN}" \
  --region "${REGION}" \
  --query SecretString \
  --output text | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['password'])")"

DB_NAME="$(aws secretsmanager get-secret-value \
  --secret-id "${DB_SECRET_ARN}" \
  --region "${REGION}" \
  --query SecretString \
  --output text | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['dbname'])")"

echo "    DB host: ${DB_HOST}:${DB_PORT}"

# ── Start SSM port-forwarding tunnel ─────────────────────────────────────────
echo "==> Starting SSM tunnel ${BASTION_INSTANCE_ID} -> ${DB_HOST}:${DB_PORT} -> localhost:${LOCAL_PORT}..."

aws ssm start-session \
  --target "${BASTION_INSTANCE_ID}" \
  --region "${REGION}" \
  --document-name AWS-StartPortForwardingSessionToRemoteHost \
  --parameters "host=${DB_HOST},portNumber=${DB_PORT},localPortNumber=${LOCAL_PORT}" &

SSM_PID=$!
trap "kill ${SSM_PID} 2>/dev/null || true" EXIT

# Wait for tunnel to be ready
sleep 3
echo "    Tunnel up (PID: ${SSM_PID})"

# ── Run migrations via the tunnel ─────────────────────────────────────────────
echo "==> Running alembic upgrade head..."
TUNNEL_DATABASE_URL="postgresql+asyncpg://${DB_USER}:${DB_PASSWORD}@localhost:${LOCAL_PORT}/${DB_NAME}"

cd "${BACKEND_DIR}"
DATABASE_URL="${TUNNEL_DATABASE_URL}" PYTHONPATH=. venv/bin/alembic upgrade head

echo ""
echo "==> Migrations complete!"
