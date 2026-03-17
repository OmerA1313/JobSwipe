#!/usr/bin/env bash
set -euo pipefail

cd /app

npm run prisma:push
exec node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000
