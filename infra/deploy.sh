#!/usr/bin/env bash
# deploy.sh — build backend image, push to ECR, redeploy App Runner
#
# Usage:
#   ./deploy.sh                    # deploy to us-west-2 (default)
#   AWS_REGION=ap-northeast-1 ./deploy.sh   # deploy to Tokyo
#
# Prerequisites:
#   - AWS CLI configured (aws configure)
#   - Docker running
#   - cdk bootstrap already run for this account/region

set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
ECR_REPO="vet-scribe-backend"
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO}"
BACKEND_DIR="$(cd "$(dirname "$0")/../backend" && pwd)"
INFRA_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVICE_NAME="vet-scribe-backend"

echo "==> Region:  ${REGION}"
echo "==> Account: ${ACCOUNT_ID}"
echo "==> ECR:     ${ECR_URI}"
echo ""

# ── Step 1: CDK deploy (provisions/updates all AWS resources) ─────────────────
echo "==> [1/4] Running cdk deploy..."
cd "${INFRA_DIR}"
npm install --silent
npx cdk deploy VetScribeStack \
  --region "${REGION}" \
  --require-approval never \
  --outputs-file cdk-outputs.json
echo "    CDK deploy complete."

# ── Step 2: Authenticate Docker to ECR ───────────────────────────────────────
echo "==> [2/4] Logging in to ECR..."
aws ecr get-login-password --region "${REGION}" \
  | docker login --username AWS --password-stdin "${ECR_URI}"

# ── Step 3: Build and push the backend Docker image ──────────────────────────
echo "==> [3/4] Building and pushing Docker image..."
cd "${BACKEND_DIR}"
docker build --platform linux/amd64 -t "${ECR_URI}:latest" .
docker push "${ECR_URI}:latest"
echo "    Image pushed: ${ECR_URI}:latest"

# ── Step 4: Trigger new App Runner deployment ─────────────────────────────────
echo "==> [4/4] Triggering App Runner deployment..."
SERVICE_ARN="$(aws apprunner list-services \
  --region "${REGION}" \
  --query "ServiceSummaryList[?ServiceName=='${SERVICE_NAME}'].ServiceArn" \
  --output text)"

if [ -z "${SERVICE_ARN}" ]; then
  echo "    WARN: App Runner service '${SERVICE_NAME}' not found — skipping redeploy trigger."
  echo "    This is expected on the first deploy; App Runner will start automatically."
else
  aws apprunner start-deployment \
    --region "${REGION}" \
    --service-arn "${SERVICE_ARN}"
  echo "    Deployment triggered for ${SERVICE_NAME}."
fi

# ── Print App Runner URL from CDK outputs ────────────────────────────────────
if [ -f "${INFRA_DIR}/cdk-outputs.json" ]; then
  APP_URL="$(python3 -c "
import json, sys
with open('${INFRA_DIR}/cdk-outputs.json') as f:
    data = json.load(f)
for stack in data.values():
    if 'AppRunnerServiceUrl' in stack:
        print(stack['AppRunnerServiceUrl'])
        sys.exit(0)
print('(URL not yet available)')
")"
  echo ""
  echo "================================================"
  echo "  Backend URL: ${APP_URL}"
  echo "  Set EXPO_PUBLIC_API_URL=${APP_URL} in mobile/.env.local"
  echo "================================================"
fi

echo ""
echo "==> Deploy complete!"
echo ""
echo "Next steps:"
echo "  1. Update API keys secret (if not already done):"
echo "       aws secretsmanager put-secret-value \\"
echo "         --secret-id vetscribe/api-keys \\"
echo "         --secret-string '{\"API_KEY\":\"...\",\"OPENAI_API_KEY\":\"sk-...\",\"ANTHROPIC_API_KEY\":\"sk-ant-...\"}'"
echo ""
echo "  2. Run Alembic migrations against production DB:"
echo "       See infra/README.md for instructions using an EC2 bastion or port-forwarding."
echo ""
echo "  3. Switch to Tokyo region for Taiwan production:"
echo "       AWS_REGION=ap-northeast-1 ./deploy.sh"
