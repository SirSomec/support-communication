const APP_DEEP_LINK_PATTERN = /^\/(auth|login|app|onboarding|landing)(\/|$)/;
const PUBLIC_DEV_PATH_PATTERN = /^\/(pricing|docs)\/?(?:\?|$)/;

function rewriteAppUrls(req, { includePublicDevPaths = false } = {}) {
  const url = req.url ?? "";
  if (url.startsWith("/service-admin") && !url.includes(".")) {
    req.url = "/service-admin/index.html";
    return;
  }

  // Прямые URL основного приложения (например /auth/login) отдаём как index.html,
  // как это делает nginx в production (try_files ... /index.html).
  if (APP_DEEP_LINK_PATTERN.test(url) && !url.includes(".")) {
    req.url = "/index.html";
    return;
  }

  // During development these pages do not exist as physical HTML files yet;
  // production/preview use the prerendered dist/<route>/index.html documents.
  if (includePublicDevPaths && PUBLIC_DEV_PATH_PATTERN.test(url) && !url.includes(".")) {
    req.url = "/index.html";
  }
}

export function serviceAdminSpaFallback() {
  return {
    name: "service-admin-spa-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteAppUrls(req, { includePublicDevPaths: true });
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteAppUrls(req);
        next();
      });
    }
  };
}
