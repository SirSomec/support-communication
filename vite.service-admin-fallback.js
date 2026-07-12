export function serviceAdminSpaFallback() {
  return {
    name: "service-admin-spa-fallback",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "";
        if (url.startsWith("/service-admin") && !url.includes(".")) {
          req.url = "/service-admin/index.html";
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "";
        if (url.startsWith("/service-admin") && !url.includes(".")) {
          req.url = "/service-admin/index.html";
        }
        next();
      });
    }
  };
}
