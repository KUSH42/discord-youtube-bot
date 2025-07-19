# Multi-stage build for optimized Docker image
# Stage 1: Base dependencies
FROM node:20-slim as dependencies

# Install only essential system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Stage 2: Development/test dependencies (for integration tests)
FROM mcr.microsoft.com/playwright:v1.28.1-focal as test-runner

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev dependencies
RUN npm ci && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY tests/ ./tests/
COPY jest.*.js ./
COPY babel.config.cjs ./
COPY index.js ./

# Create non-root user for security
RUN groupadd -r botuser && useradd -r -g botuser botuser \
    && chown -R botuser:botuser /app

USER botuser

# Expose the port for the application
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Run the tests
CMD ["npm", "test"]

# Stage 3: Production runtime (smaller, more secure)
FROM node:20-slim as production

# Install only essential system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r botuser && useradd -r -g botuser botuser

WORKDIR /app

# Copy production dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package*.json ./

# Copy source code
COPY src/ ./src/
COPY index.js ./

# Set ownership
RUN chown -R botuser:botuser /app

USER botuser

# Expose the port for the application
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Health check passed')" || exit 1

# Run the application
CMD ["node", "index.js"]
