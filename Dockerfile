FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS frontend-build

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

FROM nginx:1.27-alpine@sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10 AS frontend

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/dist /usr/share/nginx/html

EXPOSE 80

FROM nginxinc/nginx-unprivileged:1.27-alpine@sha256:65e3e85dbaed8ba248841d9d58a899b6197106c23cb0ff1a132b7bfe0547e4c0 AS frontend-production

COPY docker/nginx.static.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/dist /usr/share/nginx/html

EXPOSE 8080

FROM node:26-alpine@sha256:e88a35be04478413b7c71c455cd9865de9b9360e1f43456be5951032d7ac1a66 AS backend-build

WORKDIR /app/backend

COPY backend ./
RUN npm ci && npx tsc -b --force

FROM backend-build AS backend-migrations

ENV NODE_ENV=production

CMD ["node", "scripts/run-prisma.mjs", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]

FROM backend-build AS api-gateway

RUN npm prune --omit=dev \
  && mkdir -p /app/backend/.runtime \
  && chown node:node /app/backend/.runtime

ENV NODE_ENV=production
USER node
EXPOSE 4100

CMD ["node", "apps/api-gateway/dist/main.js"]
