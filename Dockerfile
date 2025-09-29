# Build stage
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for building)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:22-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

# Create logs directory
RUN mkdir -p logs

# Create custom user for running the application
RUN addgroup -g 1001 -S maingroup && \
    adduser -S main-user -u 1001 -G maingroup

# Change ownership of app directory to our user
RUN chown -R main-user:maingroup /app

# Run as non-root user for security
USER main-user

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]