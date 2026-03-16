# n8n Automation Orchestrator

This app can run application automation in two modes:

- `local`: existing Playwright worker polls the database
- `n8n`: backend dispatches queued runs to an n8n webhook and n8n reports status back

## Environment

Add these values to `.env` when using `n8n` mode:

```env
AUTOMATION_ORCHESTRATOR="n8n"
APP_BASE_URL="http://127.0.0.1:3000"
AUTOMATION_SHARED_SECRET="change-me"
N8N_AUTOMATION_WEBHOOK_URL="http://127.0.0.1:5678/webhook/job-apply-agent"
OLLAMA_BASE_URL="http://127.0.0.1:11434"
OLLAMA_MODEL="qwen2.5:7b"
```

`AUTOMATION_SHARED_SECRET` is required for n8n to fetch run context and post status updates.

## Backend Endpoints

### 1. n8n trigger

When the user clicks `Apply`, the backend queues a run and posts this payload to `N8N_AUTOMATION_WEBHOOK_URL`:

```json
{
  "reason": "initial queue",
  "app": {
    "baseUrl": "http://127.0.0.1:3000",
    "contextUrl": "http://127.0.0.1:3000/api/automation-runs/12/orchestrator",
    "callbackUrl": "http://127.0.0.1:3000/api/automation-runs/12/orchestrator",
    "authHeader": "x-automation-secret",
    "hasSharedSecret": true
  },
  "run": {
    "id": 12,
    "jobId": 17409,
    "siteType": "COMEET",
    "status": "QUEUED",
    "currentStep": "Queued for automation",
    "answers": {}
  },
  "job": {
    "id": 17409,
    "title": "Software Engineer (Platform)",
    "company": "nymhealth",
    "location": "Israel",
    "url": "https://www.comeet.com/jobs/...",
    "source": "hiremetech",
    "summary": "..."
  },
  "profile": {
    "fullName": "...",
    "email": "...",
    "phone": "..."
  }
}
```

### 2. Fetch full run context

n8n should fetch full run context before executing automation:

```bash
curl -H 'x-automation-secret: change-me' \
  http://127.0.0.1:3000/api/automation-runs/12/orchestrator
```

The response includes:

- run state
- job data
- full profile snapshot
- resume PDF as base64
- latest events

### 3. Post status updates back

n8n should report progress with:

```bash
curl -X POST \
  -H 'content-type: application/json' \
  -H 'x-automation-secret: change-me' \
  http://127.0.0.1:3000/api/automation-runs/12/orchestrator \
  -d '{
    "status": "RUNNING",
    "currentStep": "Opening application page",
    "message": "Started browser run"
  }'
```

Supported statuses:

- `RUNNING`
- `NEEDS_INPUT`
- `SUBMITTED`
- `FAILED`

Example blocker update:

```json
{
  "status": "NEEDS_INPUT",
  "currentStep": "Waiting for manual answer",
  "needsInput": true,
  "blockingQuestion": "What is your current location?",
  "inputField": "location",
  "message": "Comeet requires a location value",
  "level": "WARN"
}
```

Example success update:

```json
{
  "status": "SUBMITTED",
  "currentStep": "Application submitted",
  "message": "Application submitted successfully"
}
```

## Recommended n8n Workflow

Use n8n as the orchestrator, not as the source of truth.

1. `Webhook`
- receives backend dispatch payload

2. `HTTP Request`
- `GET {{$json.app.contextUrl}}`
- add header `x-automation-secret: {{$env.AUTOMATION_SHARED_SECRET}}`
- this returns resume base64 and latest answers

3. `HTTP Request`
- immediately post `RUNNING` back to `callbackUrl`

4. `Switch`
- route by `run.siteType`
- first implement:
  - `COMEET`
  - `LEVER`

5. Browser execution node or worker call
- preferred: call a dedicated browser worker service from n8n
- acceptable for local proof-of-concept: call a local script/service that uses Playwright

6. Optional `Ollama` branch
- use the local Ollama chat model only for:
  - classifying a validation error into a clean user-facing blocker
  - normalizing field labels
  - summarizing why a run failed
- do not let llama decide every click on the page

7. `HTTP Request`
- post final status back to the backend callback endpoint

## Ollama Usage Guidance

Good uses inside n8n:

- Convert noisy site errors into short blocker messages
- Map a field label like `City / Area of residence` to `location`
- Summarize form diagnostics for the user

Bad uses inside n8n:

- Running the whole browser session as an LLM agent first
- Letting llama submit unknown forms without deterministic checks

## First Local Setup

1. Start the app on `http://127.0.0.1:3000`
2. Set `AUTOMATION_ORCHESTRATOR="n8n"`
3. Restart the app
4. In n8n, create a `Webhook` node listening on `/webhook/job-apply`
5. Add one `HTTP Request` node to fetch run context
6. Add one `HTTP Request` node to post `RUNNING`
7. For now, end by posting either:
   - `FAILED` with a message
   - or `NEEDS_INPUT` with a blocker question

That gives you a working end-to-end orchestration loop before browser execution is added.
