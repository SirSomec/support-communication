export function parseServiceAdminPath(pathname = "") {
  const normalized = String(pathname).replace(/\/+$/, "") || "/";
  if (normalized === "/service-admin/login") {
    return { view: "login" };
  }
  if (normalized === "/service-admin") {
    return { view: "dashboard" };
  }
  return null;
}

export function serviceAdminPathForView(view) {
  return view === "login" ? "/service-admin/login" : "/service-admin";
}

export function legacyServiceAdminHashToPath(hash = "") {
  if (hash === "#/service-admin/login") {
    return "/service-admin/login";
  }
  if (hash === "#/service-admin") {
    return "/service-admin";
  }
  return null;
}
