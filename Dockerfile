# Use official lightweight Node.js image
FROM node:18-slim AS build

# Set working directory
WORKDIR /app

# Install Python 3 (for node-gyp and native modules)
RUN apt-get update && apt-get install -y python3 make g++ && ln -sf python3 /usr/bin/python && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Disable postinstall script to prevent build errors during Docker build
RUN npm pkg set scripts.postinstall="true"
RUN npm ci

# Copy the rest of the project files
COPY . .
# Ensure index.ts is present for TypeScript build
COPY index.ts ./

# Build the TypeScript code
RUN npm run build

# --- Production image ---
FROM node:18-slim AS prod
WORKDIR /app

# Copy only the necessary files from build stage
COPY --from=build /app/package.json ./
COPY --from=build /app/package-lock.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

# Set binary path for CLI
ENV PATH="/app/dist:$PATH"

# Set entrypoint to the CLI tool
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--help"]
