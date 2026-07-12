import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const registerPath = "docs/product-completeness-register.md";
const productionUiRoots = ["src"];
const sourceExtensions = [".js", ".jsx", ".ts", ".tsx"];
const skipDirs = new Set(["build", "coverage", "dist", "node_modules"]);
const requiredRegisterColumns = ["Guard ID", "File path", "User-facing control", "Status", "Phase"];

const visibleStubMarkers = [
  {
    label: "awaits backend or API",
    pattern: /\u043e\u0436\u0438\u0434\u0430(?:\u0435\u0442|\u044e\u0442)(?:\s+[\p{L}-]+){0,3}?\s+(?:backend|api)/giu
  },
  {
    label: "will be available",
    pattern: /\u0431\u0443\u0434\u0435\u0442\s+\u0434\u043e\u0441\u0442\u0443\u043f/giu
  },
  {
    label: "does not have ready implementation",
    pattern: /\u043d\u0435\s+\u0438\u043c\u0435\u0435\u0442\s+\u0433\u043e\u0442\u043e\u0432/giu
  },
  {
    label: "not connected",
    pattern: /\u043d\u0435\s+\u043f\u043e\u0434\u043a\u043b\u044e\u0447/giu
  },
  {
    label: "read-only preview",
    pattern: /read-only\s+preview/giu
  },
  {
    label: "coming soon",
    pattern: /coming\s+soon/giu
  },
  {
    label: "not implemented",
    pattern: /not\s+implemented/giu
  }
];

function read(relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function walkFiles(dir, { extensions }) {
  const results = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!skipDirs.has(entry.name)) {
        results.push(...walkFiles(fullPath, { extensions }));
      }
      continue;
    }

    if (entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension))) {
      results.push(fullPath);
    }
  }

  return results;
}

function toProjectPath(absolutePath) {
  return relative(root, absolutePath).replaceAll("\\", "/");
}

function createGuardId({ marker, projectPath, sourceLine }) {
  const hash = createHash("sha1")
    .update(`${projectPath}\n${marker}\n${sourceLine.trim()}`)
    .digest("hex")
    .slice(0, 12);

  return `visible-stub:${hash}`;
}

function collectVisibleStubFindings() {
  const findings = [];
  const seen = new Set();

  for (const productionRoot of productionUiRoots) {
    const files = walkFiles(join(root, productionRoot), { extensions: sourceExtensions });

    for (const absolutePath of files) {
      const projectPath = toProjectPath(absolutePath);
      const source = read(projectPath);
      const lines = source.split(/\r?\n/);

      lines.forEach((line, index) => {
        for (const marker of visibleStubMarkers) {
          marker.pattern.lastIndex = 0;

          for (const match of line.matchAll(marker.pattern)) {
            const markerText = match[0];
            const finding = {
              guardId: createGuardId({ marker: markerText, projectPath, sourceLine: line }),
              line: index + 1,
              marker: markerText,
              projectPath,
              sourceLine: line.trim()
            };
            const key = `${finding.guardId}:${finding.line}:${finding.marker}`;

            if (!seen.has(key)) {
              seen.add(key);
              findings.push(finding);
            }
          }
        }
      });
    }
  }

  return findings.sort((left, right) =>
    left.projectPath.localeCompare(right.projectPath) || left.line - right.line || left.marker.localeCompare(right.marker)
  );
}

function parseMarkdownTable(markdown) {
  const rows = markdown
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("|"))
    .map((line) => line.trim().split("|").slice(1, -1).map((cell) => cell.trim()));

  const headerIndex = rows.findIndex((row) => requiredRegisterColumns.every((column) => row.includes(column)));

  if (headerIndex === -1) {
    return { columns: [], entries: [] };
  }

  const columns = rows[headerIndex];
  const entries = rows
    .slice(headerIndex + 1)
    .filter((row) => row.length === columns.length)
    .filter((row) => !row.every((cell) => /^:?-{3,}:?$/.test(cell)))
    .map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ""])));

  return { columns, entries };
}

function formatFinding(finding) {
  return [
    `${finding.guardId} ${finding.projectPath}:${finding.line}`,
    `  marker: ${finding.marker}`,
    `  source: ${finding.sourceLine}`
  ].join("\n");
}

describe("visible planned-stub guard", () => {
  it("classifies every visible planned-stub marker in the product completeness register", () => {
    const findings = collectVisibleStubFindings();

    assert.ok(
      existsSync(join(root, registerPath)),
      [
        `Missing ${registerPath}.`,
        "Classify these visible planned-stub findings before they can ship:",
        ...findings.map(formatFinding)
      ].join("\n")
    );

    const { columns, entries } = parseMarkdownTable(read(registerPath));
    const missingColumns = requiredRegisterColumns.filter((column) => !columns.includes(column));
    assert.deepEqual(
      missingColumns,
      [],
      `${registerPath} must contain a markdown table with columns: ${requiredRegisterColumns.join(", ")}`
    );

    const entriesByGuardId = new Map(entries.map((entry) => [entry["Guard ID"], entry]));
    const missingClassifications = [];
    const incompleteClassifications = [];

    for (const finding of findings) {
      const entry = entriesByGuardId.get(finding.guardId);

      if (!entry) {
        missingClassifications.push(formatFinding(finding));
        continue;
      }

      const missingFields = requiredRegisterColumns.filter((column) => !entry[column]);
      const registeredPath = entry["File path"].replaceAll("\\", "/");

      if (registeredPath !== finding.projectPath) {
        missingFields.push(`File path must be ${finding.projectPath}`);
      }

      if (missingFields.length) {
        incompleteClassifications.push(`${finding.guardId}: ${missingFields.join(", ")}`);
      }
    }

    assert.deepEqual(
      missingClassifications,
      [],
      `Visible planned-stub findings must be classified in ${registerPath}:\n${missingClassifications.join("\n")}`
    );
    assert.deepEqual(
      incompleteClassifications,
      [],
      `Visible planned-stub classifications must include file path, control, status, and phase:\n${incompleteClassifications.join("\n")}`
    );
  });
});
