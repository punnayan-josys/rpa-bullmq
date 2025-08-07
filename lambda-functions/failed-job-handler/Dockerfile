FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S handler -u 1001
RUN chown -R handler:nodejs /app
USER handler

# Start the service
CMD ["node", "index.js"] 