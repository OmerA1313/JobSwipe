#!/usr/bin/env sh
set -eu

MODEL="${OLLAMA_MODEL:-qwen2.5:7b}"

until ollama list >/dev/null 2>&1; do
  sleep 2
done

ollama pull "$MODEL"
