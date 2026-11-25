FROM docker.io/oven/bun:alpine
WORKDIR /app
COPY mailer/package.json ./
RUN bun install --omit dev
COPY mailer/server.ts ./
USER bun
EXPOSE 8080
CMD ["bun", "server.ts"]
