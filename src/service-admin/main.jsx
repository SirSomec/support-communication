import React from "react";
import { createRoot } from "react-dom/client";
import { ServiceAdminApp } from "./ServiceAdminApp.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ServiceAdminApp />
  </React.StrictMode>
);
