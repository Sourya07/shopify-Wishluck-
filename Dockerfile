# One image: Playwright/Chromium + backend API + built React dashboard.
FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
ENV NODE_ENV=production
COPY backend/package*.json backend/
RUN cd backend && npm ci --include=dev && npx playwright install chromium
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY . .
RUN cd frontend && npx vite build
EXPOSE 4000
WORKDIR /app/backend
CMD ["npx", "tsx", "src/index.ts"]
