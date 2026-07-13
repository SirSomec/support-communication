const APP_DEEP_LINK_PATTERN = /^\/(auth|login|app|onboarding|landing)(\/|$)/;

function rewriteAppUrls(req) {
  const url = req.url ?? "";
  if (url.startsWith("/service-admin") && !url.includes(".")) {
    req.url = "/service-admin/index.html";
    return;
  }

  // Прямые URL основного приложения (например /auth/login) отдаём как index.html,
  // как это делает nginx в production (try_files ... /index.html).
  if (APP_DEEP_LINK_PATTERN.test(url) && !url.includes(".")) {
    req.url = "/index.html";
  }
}

export function serviceAdminSpaFallback() {
  return {
    name: "service-admin-spa-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewriteAppUrls(req);
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
