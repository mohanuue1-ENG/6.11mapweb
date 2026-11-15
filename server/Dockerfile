FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY migrations ./migrations
COPY scripts ./scripts

# Run as an unprivileged user.
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:${PORT:-4000}/api/v1/health || exit 1

# Migrate deliberately before starting new code: "npm run migrate" (see DEPLOY.md).
CMD ["node", "src/server.js"]
