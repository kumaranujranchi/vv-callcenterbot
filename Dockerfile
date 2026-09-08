FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install --production

# Copy application files
COPY server.js ./
COPY config.json ./
COPY rag/ ./rag/
COPY knowledge/ ./knowledge/
COPY public/ ./public/

# Expose port
EXPOSE 3847

ENV PORT=3847
ENV NODE_ENV=production

CMD ["node", "server.js"]
