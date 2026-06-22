# syntax=docker/dockerfile:1

# --- Build stage: compile the Vite/React app to static assets ---
FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install dependencies from the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Build the production bundle (tsc -b && vite build) into /app/dist.
COPY . .
RUN npm run build

# --- Runtime stage: serve the static build with nginx ---
FROM nginx:1.27-alpine

# Replace the default site with our SPA + API-proxy config.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
