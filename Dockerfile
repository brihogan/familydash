FROM node:22-alpine AS client-builder
WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci
COPY client/ .
RUN npm run build

FROM node:22-alpine AS production
RUN apk add --no-cache python3 make g++ tzdata
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/ ./server/
COPY --from=client-builder /build/client/dist ./server/public
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
CMD ["node", "server/index.js"]
