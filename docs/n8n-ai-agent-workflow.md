# n8n AI Agent Workflow

Primary agent workflow:
- `n8n/job-apply-ai-agent.workflow.json`

Tool sub-workflows:
- `n8n/browserbase-apply-tool.workflow.json`

## What Was Fixed

The main workflow keeps the browser tools as `Call n8n Workflow Tool` nodes:
- `browserbase_apply`

The Browserbase sub-workflow now contains the real vendor node:
- `Browserbase Agent` in `Browserbase Apply Tool`

That means the remaining setup is credential binding, not replacing fake placeholder code paths.

## Import Order

1. Import `n8n/browserbase-apply-tool.workflow.json`
2. Import `n8n/job-apply-ai-agent.workflow.json`

## One Manual Step After Import

In the main workflow:
- open `browserbase_apply`
- select the imported `Browserbase Apply Tool` workflow
- open `browserbase_apply`
- select the imported `Browserbase Apply Tool` workflow

The JSON uses placeholder workflow IDs because those IDs only exist after import in your local n8n instance.

## Ollama Configuration

The main workflow now reads the Ollama model name from the environment:
- `OLLAMA_MODEL`

The Ollama base URL is still provided through the `Ollama Chat Model` credential, because that node stores its host configuration in the credential rather than in a normal workflow field.

So the practical setup is:
- define `OLLAMA_MODEL` in the n8n container environment
- create or update one `Ollama` credential in n8n with the correct base URL
- reuse that credential in the workflow

That means you should not need to re-enter the base URL each run. You only set the credential once.

## Current State Of The Tool Workflows

The Browserbase tool sub-workflow now uses the real installed Browserbase node, but it still requires its credential before it can run.

### Browserbase Apply Tool
Contains:
- `When Executed by Another Workflow`
- `Browserbase Agent`
- `Normalize Browserbase Result`

Expected input fields:
- `runId`
- `siteType`
- `jobUrl`
- `contextUrl`
- `callbackUrl`
- `automationSecret`
- `agentInstructions`

Expected output shape back to the agent:

```json
{
  "status": "success | needs_input | failed",
  "currentStep": "short plain-language step",
  "message": "short plain-language summary",
  "blockingQuestion": "optional",
  "inputField": "optional"
}
```

Required credential:
- `Browserbase API`

Important:
- Browserbase requires three credential values:
  - Browserbase API key
  - Browserbase project ID
  - a separate model-provider API key
- The Browserbase node does not use your local Ollama model for browser execution.

## Agent Policy

The agent prompt already enforces:
1. call `fetch_run_context` first
2. call `report_running`
3. use `browserbase_apply` first
4. use `skyvern_apply` only as fallback
5. finish with exactly one of:
   - `report_submitted`
   - `report_needs_input`
   - `report_failed`

## Why This Is Better

This fixes the actual architectural issue from the previous version:
- before: the tool sub-workflows only returned placeholder failures
- now: the tool sub-workflows wrap the actual Browserbase and Skyvern nodes

So the remaining work is vendor credentials and live testing, not more workflow scaffolding.
