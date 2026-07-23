# Pull-and-run image for @costrinity/vigil-compliance-mcp.
#
# A stdio MCP server: a safety and compliance oversight layer for AI agents.
# On the first tool call with no credentials it self-provisions a restricted
# trial key against https://vigil.costrinity.xyz and prints a claim URL, so
# there is nothing to configure to try it. Zero runtime dependencies (Node
# built-ins + global fetch), built from source so it does not depend on npm.
#
#   docker build -t costrinity/vigil-compliance-mcp .
#   docker run --rm -i costrinity/vigil-compliance-mcp
#
# Optional env: VIGIL_EMAIL (own the trial account), or VIGIL_OWNER_ID +
# VIGIL_API_KEY to use an existing key; VIGIL_BASE_URL for self-hosted.

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install --no-save typescript@5 && npx tsc

FROM node:20-alpine
LABEL org.opencontainers.image.title="VIGIL Compliance MCP"
LABEL org.opencontainers.image.description="Safety and compliance oversight layer for AI agents: check risky actions before they run, get allow/deny/hold decisions, keep signed audit records."
LABEL org.opencontainers.image.source="https://github.com/COSTRINITY/vigil-compliance-mcp"
LABEL org.opencontainers.image.url="https://vigil.costrinity.xyz/why-vigil"
LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.vendor="COSTRINITY"
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY package.json ./
# stdio server: no port, reads JSON-RPC on stdin. Run with `-i`.
ENTRYPOINT ["node", "dist/index.js"]
