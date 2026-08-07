import React from "react";
import { renderToString } from "react-dom/server";
import { PublicSiteApp } from "./public/PublicSiteApp.jsx";

export function render(pathname) {
  return renderToString(<PublicSiteApp pathname={pathname} />);
}
