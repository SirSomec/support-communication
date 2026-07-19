import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { pipeline } from "node:stream/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = resolve(process.argv[2] || process.env.PRODUCTION_BACKUP_ROOT || join(root, ".runtime", "production-backups"));
const target = join(backupRoot, stamp);
const databaseUrl = required("DATABASE_URL");
const sourceEndpoint = required("S3_ENDPOINT");
const sourceBucket = required("S3_BUCKET");
const sourceAccessKey = required("S3_ACCESS_KEY");
const sourceSecretKey = required("S3_SECRET_KEY");

assertExecutable("pg_dump");
assertExecutable("mc");
mkdirSync(target, { recursive: true });

const database = new URL(databaseUrl);
await pipeCommand("pg_dump", [
  "--host", database.hostname,
  "--port", database.port || "5432",
  "--username", decodeURIComponent(database.username),
  "--dbname", database.pathname.replace(/^\//, ""),
  "--format=custom",
  "--no-owner",
  "--no-privileges"
], join(target, "postgres.dump"), {
  ...process.env,
  PGPASSWORD: decodeURIComponent(database.password)
});

const objectsPath = join(target, "objects");
mkdirSync(objectsPath, { recursive: true });
run("mc", ["mirror", "--overwrite", `source/${sourceBucket}`, objectsPath], {
  ...process.env,
  MC_HOST_source: mcHost(sourceEndpoint, sourceAccessKey, sourceSecretKey)
});

const files = listFiles(target).filter((path) => basename(path) !== "manifest.json");
const manifest = {
  createdAt: new Date().toISOString(),
  database: database.pathname.replace(/^\//, ""),
  files: files.map((path) => ({
    path: path.slice(target.length + 1).replace(/\\/g, "/"),
    sha256: sha256(path),
    sizeBytes: statSync(path).size
  })),
  objectBucket: sourceBucket,
  version: 1
};
writeFileSync(join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

if (process.env.BACKUP_OFFSITE_ENDPOINT && process.env.BACKUP_OFFSITE_BUCKET) {
  const offsiteEndpoint = required("BACKUP_OFFSITE_ENDPOINT");
  const offsiteBucket = required("BACKUP_OFFSITE_BUCKET");
  if (new URL(offsiteEndpoint).origin === new URL(sourceEndpoint).origin && offsiteBucket === sourceBucket) {
    throw new Error("backup_offsite_destination_must_differ_from_source");
  }
  run("mc", ["mirror", "--overwrite", target, `offsite/${offsiteBucket}/${stamp}`], {
    ...process.env,
    MC_HOST_offsite: mcHost(offsiteEndpoint, required("BACKUP_OFFSITE_ACCESS_KEY"), required("BACKUP_OFFSITE_SECRET_KEY"))
  });
}

process.stdout.write(`${JSON.stringify({
  event: "production.backup.completed",
  files: manifest.files.length,
  offsite: Boolean(process.env.BACKUP_OFFSITE_ENDPOINT),
  target
})}\n`);

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name.toLowerCase()}_required`);
  return value;
}

function assertExecutable(executable) {
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(`${executable}_required`);
}

function run(executable, args, env) {
  const result = spawnSync(executable, args, { cwd: root, encoding: "utf8", env, stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  if (result.status !== 0) throw new Error(`${executable}_failed:${result.status}`);
  return result.stdout;
}

async function pipeCommand(executable, args, destination, env) {
  const child = spawn(executable, args, { cwd: root, env, stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  const output = createWriteStream(destination, { mode: 0o600 });
  const commandCompleted = new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolvePromise() : reject(new Error(`${executable}_failed:${code}`)));
  });
  await Promise.all([pipeline(child.stdout, output), commandCompleted]);
}

function mcHost(endpoint, accessKey, secretKey) {
  const url = new URL(endpoint);
  url.username = accessKey;
  url.password = secretKey;
  return url.toString();
}

function listFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? listFiles(child) : [child];
  });
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
