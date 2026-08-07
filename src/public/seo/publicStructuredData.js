function breadcrumbList(route, routes) {
  const home = routes.find((item) => item.pathname === "/");
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: home?.breadcrumbLabel ?? "Главная",
        item: home?.canonical
      },
      {
        "@type": "ListItem",
        position: 2,
        name: route.breadcrumbLabel,
        item: route.canonical
      }
    ]
  };
}

export function createPublicStructuredData(route, routes) {
  const graph = route.jsonLdTypes.map((type) => {
    if (type === "Organization") {
      return {
        "@type": "Organization",
        "@id": `${route.canonical}#organization`,
        name: "Support Communication",
        url: route.canonical,
        logo: route.brandLogo
      };
    }
    if (type === "WebSite") {
      return {
        "@type": "WebSite",
        "@id": `${route.canonical}#website`,
        name: "Support Communication",
        url: route.canonical,
        inLanguage: "ru-RU"
      };
    }
    if (type === "SoftwareApplication") {
      return {
        "@type": "SoftwareApplication",
        name: "Support Communication",
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        url: route.canonical,
        description: route.description
      };
    }
    if (type === "BreadcrumbList") return breadcrumbList(route, routes);
    throw new Error(`Unsupported JSON-LD type: ${type}`);
  });

  return {
    "@context": "https://schema.org",
    "@graph": graph
  };
}
