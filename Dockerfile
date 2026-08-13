FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS widget-build

WORKDIR /app/packages/web-widget

COPY packages/web-widget/package.json packages/web-widget/package-lock.json ./
RUN npm ci

COPY packages/web-widget ./
RUN npm run build

FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS frontend-build

WORKDIR /app

ARG VITE_ENABLE_SERVICE_ADMIN=false
ENV VITE_ENABLE_SERVICE_ADMIN=$VITE_ENABLE_SERVICE_ADMIN

ARG PUBLIC_SITE_ORIGIN=https://supportcom.ru
ARG PUBLIC_SITE_INDEXABLE=true
ARG PUBLIC_SITE_GOOGLE_VERIFICATION=""
ARG PUBLIC_SITE_YANDEX_VERIFICATION=""
ARG PUBLIC_SITE_METRIKA_ID=111392819
ARG PUBLIC_SITE_GA4_MEASUREMENT_ID=""
ENV PUBLIC_SITE_ORIGIN=$PUBLIC_SITE_ORIGIN \
  PUBLIC_SITE_INDEXABLE=$PUBLIC_SITE_INDEXABLE \
  PUBLIC_SITE_GOOGLE_VERIFICATION=$PUBLIC_SITE_GOOGLE_VERIFICATION \
  PUBLIC_SITE_YANDEX_VERIFICATION=$PUBLIC_SITE_YANDEX_VERIFICATION \
  PUBLIC_SITE_METRIKA_ID=$PUBLIC_SITE_METRIKA_ID \
  PUBLIC_SITE_GA4_MEASUREMENT_ID=$PUBLIC_SITE_GA4_MEASUREMENT_ID

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html vite.config.js vite.service-admin-fallback.js ./
COPY service-admin ./service-admin
COPY public ./public
COPY scripts ./scripts
COPY src ./src
COPY --from=widget-build /app/packages/web-widget/dist/widget.js ./public/widget.js
RUN npm run build

FROM nginx:stable-alpine@sha256:97d490c12ba55b4946b01546d1c3ed324e8d41ab1c9fcb2a616aa470620e5b46 AS frontend

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/dist /usr/share/nginx/html

EXPOSE 80

FROM nginxinc/nginx-unprivileged:stable-alpine@sha256:44e36330f74d4f3a1d4e222acca9e23b401fb87811a7597024502bb759c4dd49 AS frontend-production

USER root
COPY docker/nginx.static.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /app/dist /usr/share/nginx/html
RUN chmod -R a+rX /usr/share/nginx/html
USER 101

EXPOSE 8080

FROM node:26-alpine@sha256:aadf416b2cdce311a8811ba3f0608a61b77dbf997500e2eafe781b51f6a0b019 AS backend-build

WORKDIR /app/backend

COPY backend ./
RUN npm ci \
  && npm run prisma:generate \
  && npx tsc -b --force

FROM backend-build AS backend-migrations

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production

CMD ["node", "scripts/run-prisma.mjs", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]

FROM backend-build AS api-gateway

RUN apk add --no-cache poppler-utils \
  && npm prune --omit=dev \
  && mkdir -p /app/backend/.runtime \
  && chown node:node /app/backend/.runtime

RUN rm -rf /usr/local/lib/node_modules/npm \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx

ENV NODE_ENV=production
USER node
EXPOSE 4100

CMD ["node", "apps/api-gateway/dist/main.js"]
