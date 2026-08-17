# Build the Timetable Agent TypeScript service.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Production runtime (no devDependencies).
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
ENV CHAT_AGENT_PORT=3001
ENV TIMEFOLD_BASE_URL=http://school-timetabling:8080
EXPOSE 3001
CMD ["node", "dist/server.js"]
