import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { normalizeDeepLinkPath } from "./app/useWorkspaceRoute.js";
import { legacyServiceAdminHashToPath } from "./service-admin/serviceAdminPath.js";
import "./styles.css";

const legacyAdminPath = legacyServiceAdminHashToPath(window.location.hash);
if (legacyAdminPath) {
  window.location.replace(legacyAdminPath);
} else {
  normalizeDeepLinkPath();
  createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
