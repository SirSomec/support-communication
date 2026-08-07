import React from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import {
  isPrivateWorkspaceHash,
  normalizeLegacyPublicHash,
  resolvePublicRoute,
  syncPublicDocumentHead
} from "./public/routing.js";
import "./styles.css";

const legacyAdminPathByHash = Object.freeze({
  "#/service-admin": "/service-admin",
  "#/service-admin/login": "/service-admin/login"
});

async function bootstrap() {
  const legacyAdminPath = legacyAdminPathByHash[window.location.hash];
  if (legacyAdminPath) {
    window.location.replace(legacyAdminPath);
    return;
  }

  const normalizedLegacyPublicPath = normalizeLegacyPublicHash(window.location, window.history);

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element #root is missing");
  }

  if (isPrivateWorkspaceHash(window.location.hash)) {
    rootElement.replaceChildren();
    const { default: App } = await import("./App.jsx");
    createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    return;
  }

  const route = resolvePublicRoute(window.location.pathname);
  if (!route) return;
  syncPublicDocumentHead(route, document);

  const { PublicSiteApp } = await import("./public/PublicSiteApp.jsx");
  const publicApp = (
    <React.StrictMode>
      <PublicSiteApp pathname={route.pathname} />
    </React.StrictMode>
  );

  if (normalizedLegacyPublicPath && normalizedLegacyPublicPath !== "/") {
    rootElement.replaceChildren();
  }

  if (rootElement.hasChildNodes()) {
    hydrateRoot(rootElement, publicApp);
  } else {
    createRoot(rootElement).render(publicApp);
  }
}

void bootstrap();
