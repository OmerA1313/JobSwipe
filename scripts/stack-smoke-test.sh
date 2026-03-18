#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://127.0.0.1:3001}"
N8N_URL="${N8N_URL:-http://127.0.0.1:5679}"
OLLAMA_URL="${OLLAMA_URL:-http://127.0.0.1:11435}"
MAILPIT_URL="${MAILPIT_URL:-http://127.0.0.1:8026}"
WORKFLOW_ID="${N8N_WORKFLOW_ID:-jobApplyStagehand01}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"

echo "Checking Docker stack endpoints..."
curl -fsS -I "$APP_URL" >/dev/null
curl -fsS -I "$N8N_URL" >/dev/null
curl -fsS "$OLLAMA_URL/api/tags" >/dev/null
curl -fsS "$MAILPIT_URL/api/v1/messages" >/dev/null

echo "Checking container state..."
docker compose ps

echo "Checking Stagehand container health..."
docker exec job-swipe-stagehand-1 /bin/sh -lc "wget -qO- http://127.0.0.1:8787/health >/dev/null || curl -fsS http://127.0.0.1:8787/health >/dev/null"

echo "Checking imported n8n workflow..."
docker exec job-swipe-n8n-1 /bin/sh -lc "n8n export:workflow --id='$WORKFLOW_ID' --output=/tmp/wf.json >/dev/null 2>&1 && node -e \"const fs=require('fs'); const data=JSON.parse(fs.readFileSync('/tmp/wf.json','utf8')); process.exit(data[0] && data[0].active === true ? 0 : 1);\""

echo "Checking Ollama model..."
docker exec job-swipe-ollama-1 /bin/sh -lc "ollama list | grep -F '$OLLAMA_MODEL'"

echo "Docker stack smoke test passed."
