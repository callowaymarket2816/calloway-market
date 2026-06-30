# Render created this service expecting a Dockerfile (it auto-detected
# "Docker" as the runtime rather than plain Node.js). Rather than recreate
# the whole service — which Render's own docs confirm is otherwise the
# only way to switch a service off Docker once created — this Dockerfile
# does exactly what our render.yaml / npm scripts already do, just
# expressed as a real Docker build.

FROM node:22-slim

WORKDIR /app

# Install dependencies first (better Docker layer caching: this layer is
# only rebuilt when package.json/package-lock.json actually change).
COPY package*.json ./
RUN npm install

# Copy the rest of the project and build the frontend (vite build outputs
# to public/, per vite.config.ts).
COPY . .
RUN npm run build

# Render expects the service to listen on the PORT env var it provides —
# server.ts already reads process.env.PORT correctly.
ENV NODE_ENV=production
EXPOSE 10000

CMD ["npm", "start"]
