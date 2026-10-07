FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force
COPY src ./src
RUN mkdir -p /app/uploads && chown -R node:node /app/uploads
ENV UPLOAD_DIR=/app/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD wget -qO- http://localhost:4000/api/health || exit 1
CMD ["node", "src/server.js"]
