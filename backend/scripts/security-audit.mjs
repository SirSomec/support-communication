import { spawnSync } from "node:child_process";

const result = spawnSync("npm", ["audit", "--json", "--audit-level=moderate"], {
  encoding: "utf8",
  shell: true
});

if (result.error) {
  throw result.error;
}

const report = parseAuditReport(result.stdout);
const counts = report?.metadata?.vulnerabilities ?? {};
const total = Number(counts.total ?? 0);
const moderate = Number(counts.moderate ?? 0);
const high = Number(counts.high ?? 0);
const critical = Number(counts.critical ?? 0);

if (result.status !== 0 || total > 0) {
  const vulnerablePackages = report?.vulnerabilities
    ? Object.keys(report.vulnerabilities).sort()
    : [];
  process.stderr.write([
    `Dependency security audit failed: ${total} vulnerabilities (${moderate} moderate, ${high} high, ${critical} critical).`,
    vulnerablePackages.length ? `Packages: ${vulnerablePackages.join(", ")}` : "",
    result.stderr.trim()
  ].filter(Boolean).join("\n"));
  process.stderr.write("\n");
  process.exit(result.status && result.status !== 0 ? result.status : 1);
}

process.stdout.write("Dependency security audit passed: 0 moderate/high/critical vulnerabilities.\n");

function parseAuditReport(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return undefined;
  }

  return JSON.parse(trimmed);
}
