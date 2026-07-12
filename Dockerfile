FROM node:22-alpine AS frontend-build

WORKDIR /app

ARG VITE_ENABLE_SERVICE_ADMIN=false
ENV VITE_ENABLE_SERVICE_ADMIN=$VITE_ENABLE_SERVICE_ADMIN

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js vite.service-admin-fallback.js ./
COPY service-admin ./service-admin
COPY public ./public
COPY src ./src
RUN npm run build

FROM nginx:1.27-alpine AS frontend

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/dist /usr/share/nginx/html

EXPOSE 80

FROM node:22-alpine AS api-gateway

WORKDIR /app/backend

COPY backend ./
RUN npm ci \
  && npx tsc -b --force \
  && npm prune --omit=dev

ENV NODE_ENV=development
EXPOSE 4100

CMD ["node", "apps/api-gateway/dist/main.js"]
