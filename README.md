# JobSwipe

Local-first MVP for job discovery and auto-apply.

## One-command stack

This repo now includes a Docker Compose stack for:

- the Next.js app
- `n8n`
- `ollama`
- the headless Stagehand runner

### Start everything

```bash
docker compose up --build -d
```

On the first run, wait for the Ollama model pull to finish:

```bash
docker compose logs -f ollama-init
```

When that exits successfully, the stack is ready.

Then run the smoke test:

```bash
npm run stack:smoke
```

### URLs

- App: `http://localhost:3001`
- n8n: `http://localhost:5679`
- Ollama: `http://localhost:11435`
- Stagehand runner health: `http://localhost:8788/health`

## n8n bootstrap

The Docker stack bootstraps `n8n` automatically:

- imports `n8n/job-apply-stagehand-orchestrator.workflow.json`
- publishes the workflow on startup

The workflow is wired for the Docker service names:

- app callback/context: `http://app:3000`
- Stagehand runner: `http://stagehand:8787/run`
- Ollama: `http://ollama:11434`

## Notes

- Default model: `qwen2.5:7b`
- The app uses SQLite in the `app_data` Docker volume
- `n8n` data is persisted in the `n8n_data` Docker volume
- Ollama models are persisted in the `ollama_data` Docker volume
- This stack is headless. It does not open a visible Chromium window.

## Optional env overrides

If you need external APIs later, create `.env` and override values there. Common ones:

```env
AUTOMATION_SHARED_SECRET=change-me
OLLAMA_MODEL=qwen2.5:7b
OPENAI_API_KEY=
ADZUNA_APP_ID=
ADZUNA_APP_KEY=
```

## Stop the stack

```bash
npm run stack:down
```

To also remove persisted data:

```bash
docker compose down -v
```
