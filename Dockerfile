FROM node:22-alpine AS client-builder
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

FROM node:22-alpine AS production
RUN apk add --no-cache python3 make g++ tzdata su-exec
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY --from=client-builder /build/client/dist ./server/public
RUN mkdir -p /data && chown node:node /data
EXPOSE 3001
# Start as root to fix Docker socket permissions, then drop to node user
CMD ["sh", "-c", "if [ -S /var/run/docker.sock ]; then chmod 666 /var/run/docker.sock; fi && exec su-exec node node server/index.js"]
