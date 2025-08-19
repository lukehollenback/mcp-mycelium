FROM node:20-alpine

# Install Python for local embeddings
RUN apk add --no-cache python3 py3-pip

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Install Python dependencies for local embeddings
RUN pip install sentence-transformers torch numpy

# Copy source code
COPY dist/ ./dist/
COPY scripts/ ./scripts/

# Create directories for data
RUN mkdir -p /data/config /data/vaults

# Set up volumes
VOLUME ["/data/config", "/data/vaults"]

# Expose port for potential web interface
EXPOSE 3000

# Set entrypoint
ENTRYPOINT ["node", "dist/cli.js"]

# Default command
CMD ["--config", "/data/config", "/data/vaults"]

# Labels
LABEL org.opencontainers.image.title="MCP Mycelium"
LABEL org.opencontainers.image.description="Model Context Protocol server for markdown knowledge bases"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.source="https://github.com/lukehollenback/mcp-mycelium"