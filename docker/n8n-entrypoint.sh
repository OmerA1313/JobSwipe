#!/usr/bin/env sh
set -eu

WORKFLOW_FILE="${N8N_BOOTSTRAP_WORKFLOW_FILE:-/workflows/job-apply-stagehand-orchestrator.workflow.json}"
WORKFLOW_ID="${N8N_BOOTSTRAP_WORKFLOW_ID:-jobApplyStagehand01}"
BOOTSTRAP_LOG="${N8N_BOOTSTRAP_LOG:-/tmp/n8n-bootstrap.log}"

start_n8n_bg() {
  n8n start >"$BOOTSTRAP_LOG" 2>&1 &
  N8N_PID=$!
}

stop_n8n_bg() {
  if [ -n "${N8N_PID:-}" ] && kill -0 "$N8N_PID" 2>/dev/null; then
    kill "$N8N_PID" 2>/dev/null || true
    wait "$N8N_PID" 2>/dev/null || true
  fi
}

wait_for_n8n() {
  ATTEMPTS=0
  until node -e "fetch('http://127.0.0.1:5678').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"; do
    ATTEMPTS=$((ATTEMPTS + 1))
    if [ "$ATTEMPTS" -ge 90 ]; then
      echo "n8n bootstrap timed out waiting for HTTP readiness" >&2
      [ -f "$BOOTSTRAP_LOG" ] && tail -n 80 "$BOOTSTRAP_LOG" >&2 || true
      exit 1
    fi
    sleep 2
  done
}

workflow_exists() {
  n8n list:workflow --onlyId | grep -qx "$WORKFLOW_ID"
}

workflow_is_active() {
  n8n list:workflow --active=true --onlyId | grep -qx "$WORKFLOW_ID"
}

bootstrap_workflow() {
  if [ ! -f "$WORKFLOW_FILE" ]; then
    echo "Workflow file not found: $WORKFLOW_FILE" >&2
    exit 1
  fi

  if ! workflow_exists; then
    echo "Importing bootstrap workflow: $WORKFLOW_ID"
    n8n import:workflow --input="$WORKFLOW_FILE"
  fi

  if ! workflow_is_active; then
    echo "Publishing bootstrap workflow: $WORKFLOW_ID"
    n8n publish:workflow --id="$WORKFLOW_ID"
  fi
}

start_n8n_bg
wait_for_n8n
bootstrap_workflow
stop_n8n_bg

exec n8n start
