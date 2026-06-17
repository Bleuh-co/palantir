# syntax=docker/dockerfile:1.6
# Image multi-étages pour Next.js standalone — déployable sur Cloud Run

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Les variables NEXT_PUBLIC_* doivent être disponibles au BUILD (inlined)
# Défauts = DEV, overridés par cloudbuild.yaml en PROD
ARG NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyCyGRvYpQPpr27fIJQ5-w8yeR-yzVDtdRY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=gandalf-dev-497413.firebaseapp.com
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID=gandalf-dev-497413
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=gandalf-dev-497413.firebasestorage.app
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=802272023583
ARG NEXT_PUBLIC_FIREBASE_APP_ID=1:802272023583:web:b75abb24714f154a28312a
ARG NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=chanv.com,bleuh.co,lafeuilleverte.ca,maisondherbes.com
ARG NEXT_PUBLIC_HUB_URL=https://chanv-apps-hub-dev-802272023583.northamerica-northeast1.run.app
ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY \
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
    NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID \
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET \
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID \
    NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID \
    NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS=$NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS \
    NEXT_PUBLIC_HUB_URL=$NEXT_PUBLIC_HUB_URL
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
ENV PORT=8080
EXPOSE 8080
ENV HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
