import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(process.argv[2] || join(root, ".runtime", "backups", "acceptance-current"));
const manifestPath = join(source, "manifest.json");
if (!existsSync(manifestPath)) throw new Error("runtime_restore_manifest_missing");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const file of manifest.files ?? []) {
  const path = join(source, file.path);
  if (!existsSync(path) || statSync(path).size !== file.sizeBytes || sha256(path) !== file.sha256) {
    throw new Error(`runtime_restore_backup_integrity_failed:${file.path}`);
  }
}

const suffix = randomBytes(5).toString("hex");
const database = `support_restore_${suffix}`;
const bucket = `support-restore-${suffix}`;
const compose = ["compose", "-f", "docker-compose.yml"];
const postgresContainer = command("docker", [...compose, "ps", "-q", "postgres"]).trim();
const minioContainer = command("docker", [...compose, "ps", "-q", "minio"]).trim();
if (!postgresContainer || !minioContainer) throw new Error("runtime_restore_required_container_missing");
const dumpInContainer = `/tmp/${basename(source)}-${suffix}.dump`;
const network = command("docker", ["inspect", "-f", "{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}", minioContainer]).trim();

try {
  command("docker", ["cp", join(source, "postgres.dump"), `${postgresContainer}:${dumpInContainer}`]);
  command("docker", ["exec", postgresContainer, "createdb", "-U", "support", database]);
  command("docker", ["exec", postgresContainer, "pg_restore", "-U", "support", "-d", database, "--no-owner", "--no-privileges", dumpInContainer]);
  const migrations = Number(command("docker", ["exec", postgresContainer, "psql", "-U", "support", "-d", database, "-tAc", "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;"]).trim());
  if (!Number.isFinite(migrations) || migrations < 1) throw new Error("runtime_restore_database_smoke_failed");

  const minioObjects = Number(command("docker", [
    "run", "--rm", "--network", network, "-v", `${source.replace(/\\/g, "/")}:/backup:ro`, "--entrypoint", "/bin/sh",
    "minio/mc:RELEASE.2024-11-21T17-21-54Z", "-c",
    `mc alias set target http://minio:9000 minio minio-password >/dev/null && mc mb target/${bucket} >/dev/null && mc mirror /backup/minio target/${bucket} >/dev/null && mc ls --recursive --json target/${bucket} | wc -l`
  ]).trim());
  const expectedObjects = (manifest.files ?? []).filter((file) => String(file.path).startsWith("minio/")).length;
  if (minioObjects !== expectedObjects) throw new Error(`runtime_restore_minio_smoke_failed:${minioObjects}:${expectedObjects}`);
  process.stdout.write(`Runtime restore drill passed: database migrations=${migrations}, MinIO objects=${minioObjects}\n`);
} finally {
  try { command("docker", ["exec", postgresContainer, "dropdb", "-U", "support", "--if-exists", database]); } catch {}
  try { command("docker", ["exec", postgresContainer, "rm", "-f", dumpInContainer]); } catch {}
  try {
    command("docker", ["run", "--rm", "--network", network, "--entrypoint", "/bin/sh", "minio/mc:RELEASE.2024-11-21T17-21-54Z", "-c", `mc alias set target http://minio:9000 minio minio-password >/dev/null && mc rm --recursive --force target/${bucket} >/dev/null 2>&1 || true && mc rb --force target/${bucket} >/dev/null 2>&1 || true`]);
  } catch {}
}

function command(executable, args) {
  return execFileSync(executable, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
