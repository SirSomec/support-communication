import { writeFileSync } from "node:fs";
import { join } from "node:path";

const contexts = [
  "billing",
  "operations",
  "platform",
  "routing",
  "reports",
  "automation",
  "quality",
  "integrations",
  "identity",
  "service-admin",
  "conversation"
];

for (const name of contexts) {
  const modulePath = name === "service-admin"
    ? "../../apps/api-gateway/src/service-admin/seed-catalog.js"
    : name === "reports"
      ? "../../apps/api-gateway/src/reports/seed-catalog.js"
      : name === "conversation"
        ? "../../apps/api-gateway/src/conversation/seed-catalog.js"
        : `../../apps/api-gateway/src/${name}/seed-catalog.js`;
  writeFileSync(
    join("backend/scripts/seeds", `${name}.seed.ts`),
    `export * from "${modulePath}";\n`
  );
}
