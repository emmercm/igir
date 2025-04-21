# Use official lightweight Node.js image
FROM node:18-slim AS build

# Set working directory
WORKDIR /app

# Install Python 3 (for node-gyp and native modules)
RUN apt-get update && apt-get install -y python3 make g++ && ln -sf python3 /usr/bin/python && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# # Install dependencies (including devDependencies for build), but ignore lifecycle scripts to avoid postinstall error
RUN npm ci --ignore-scripts

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

# Install only production dependencies, but ignore lifecycle scripts to avoid husky/prepare errors
RUN npm ci --omit=dev --ignore-scripts

# Set binary path for CLI
ENV PATH="/app/dist:$PATH"

# Set entrypoint to the CLI tool
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--help"]
