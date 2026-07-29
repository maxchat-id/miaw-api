# Build stage
FROM node:20.18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY miaw-core/package*.json ./miaw-core/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20.18-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
COPY miaw-core/package*.json ./miaw-core/
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/miaw-core/dist ./miaw-core/dist

# Create sessions directory
RUN mkdir -p /app/sessions

# Set environment
ENV NODE_ENV=production

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["node", "dist/server.js"]
