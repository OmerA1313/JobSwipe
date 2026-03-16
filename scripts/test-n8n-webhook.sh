#!/usr/bin/env bash
set -euo pipefail

RUN_ID="${1:-13}"
JOB_ID="${2:-19749}"
JOB_TITLE="${3:-iOS/Mac Software Engineer}"
COMPANY="${4:-Riverside.fm}"
LOCATION="${5:-Israel}"
SOURCE="${6:-hiremetech}"
JOB_URL="${7:-https://www.comeet.com/jobs/riverside-fm/66.009/iosmac-software-engineer/C2.B51}"
WEBHOOK_URL="${N8N_TEST_WEBHOOK_URL:-http://127.0.0.1:5678/webhook-test/job-apply-agent}"
APP_BASE_URL="${APP_BASE_URL:-http://host.docker.internal:3000}"

cat <<EOF | curl -sS -X POST "$WEBHOOK_URL" \
  -H 'Content-Type: application/json' \
  --data-binary @-
{
  "reason": "manual test",
  "app": {
    "baseUrl": "${APP_BASE_URL}",
    "contextUrl": "${APP_BASE_URL}/api/automation-runs/${RUN_ID}/orchestrator",
    "callbackUrl": "${APP_BASE_URL}/api/automation-runs/${RUN_ID}/orchestrator"
  },
  "run": {
    "id": ${RUN_ID},
    "jobId": ${JOB_ID},
    "siteType": "COMEET",
    "status": "QUEUED",
    "answers": {}
  },
  "job": {
    "id": ${JOB_ID},
    "title": "${JOB_TITLE}",
    "company": "${COMPANY}",
    "location": "${LOCATION}",
    "source": "${SOURCE}",
    "url": "${JOB_URL}"
  },
  "profile": {
    "fullName": "omer atar",
    "email": "oatar717@gmail.com",
    "phone": "+972500000000",
    "preferredLocations": "Israel",
    "remotePreference": "hybrid"
  }
}
EOF

