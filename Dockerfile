# Stage 1: Build the frontend
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_KIOSK_VENUE_ID=venue_01
ENV VITE_KIOSK_VENUE_ID=$VITE_KIOSK_VENUE_ID
RUN npm run build:frontend

# Stage 2: Production environment
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/backend ./backend
EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production
CMD ["npm", "start"]
