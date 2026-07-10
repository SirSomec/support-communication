import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, basename, dirname } from "node:path";

const contexts = [
  ["backend/apps/api-gateway/src/billing/billing.fixtures.ts", "billing"],
  ["backend/apps/api-gateway/src/operations/operations.fixtures.ts", "operations"],
  ["backend/apps/api-gateway/src/platform/platform.fixtures.ts", "platform"],
  ["backend/apps/api-gateway/src/routing/routing.fixtures.ts", "routing"],
  ["backend/apps/api-gateway/src/reports/report.fixtures.ts", "reports"],
  ["backend/apps/api-gateway/src/automation/automation.fixtures.ts", "automation"],
  ["backend/apps/api-gateway/src/quality/quality.fixtures.ts", "quality"],
  ["backend/apps/api-gateway/src/integrations/integration.fixtures.ts", "integrations"],
  ["backend/apps/api-gateway/src/identity/identity.fixtures.ts", "identity"],
  ["backend/apps/api-gateway/src/service-admin/service-admin.fixtures.ts", "service-admin"]
];

mkdirSync("backend/scripts/seeds", { recursive: true });

for (const [fixturePath, name] of contexts) {
  const source = readFileSync(fixturePath, "utf8");
  const lines = source.split(/\r?\n/);
  const typeLines = [];
  const dataLines = [];
  let inInterface = false;
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("export interface") || trimmed.startsWith("export type")) {
      inInterface = true;
      braceDepth = 0;
    }

    if (inInterface) {
      typeLines.push(line);
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
      if (braceDepth <= 0 && trimmed.endsWith("}")) {
        inInterface = false;
        typeLines.push("");
      }
      continue;
    }

    if (trimmed.startsWith("export const")) {
      dataLines.push(line);
    } else if (dataLines.length > 0) {
      dataLines.push(line);
    }
  }

  const typesPath = fixturePath.replace(".fixtures.ts", ".types.ts");
  writeFileSync(typesPath, `${typeLines.join("\n").trim()}\n`);

  const moduleDir = dirname(fixturePath).replace(/^backend\/apps\/api-gateway\/src\//, "");
  const relTypes = `../../apps/api-gateway/src/${moduleDir}/${basename(typesPath)}`;
  const seedPath = join("backend/scripts/seeds", `${name}.seed.ts`);
  writeFileSync(seedPath, `${dataLines.join("\n").trim()}\n`);
  console.log(`split ${name} -> ${typesPath}, ${seedPath}`);
}
