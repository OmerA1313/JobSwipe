FROM mcr.microsoft.com/playwright:v1.58.2-noble

WORKDIR /app

COPY package*.json ./
COPY tools/stagehand-runner/package*.json ./tools/stagehand-runner/

RUN npm ci --ignore-scripts && npm --prefix tools/stagehand-runner install

COPY . .

RUN npm run prisma:generate && npm run build

ENV NODE_ENV=production
ENV PORT=3000
