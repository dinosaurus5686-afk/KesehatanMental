FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production MC_DATA_DIR=/data PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY public ./public
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/api/public/config >/dev/null || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
