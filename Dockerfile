FROM node:22-alpine AS client-builder
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
# Apps subdomain origin baked into the client bundle so the KidWorkspace iframe
# loads kid apps from the isolated apps subdomain instead of the main domain.
# The ARG is referenced *inside* the RUN command so Docker invalidates this
# layer's cache when the value changes (otherwise Docker can't tell the build
# output depends on it and silently reuses the stale layer).
ARG VITE_APPS_ORIGIN
ENV VITE_APPS_ORIGIN=${VITE_APPS_ORIGIN}
RUN echo "Building client with VITE_APPS_ORIGIN=$VITE_APPS_ORIGIN" && npm run build

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
