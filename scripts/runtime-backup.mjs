import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = resolve(process.argv[2] || join(root, ".runtime", "backups", stamp));
mkdirSync(target, { recursive: true });

const compose = ["compose", "-f", "docker-compose.yml", "-f", "docker-compose.pilot.yml", "--profile", "prisma-postgres"];
const postgresDump = join(target, "postgres.dump");
await pipeCommand("docker", [...compose, "exec", "-T", "postgres", "pg_dump", "-U", "support", "-d", "support_communication", "--format=custom", "--no-owner", "--no-privileges"], postgresDump);

const minioContainer = command("docker", [...compose, "ps", "-q", "minio"]).trim();
if (!minioContainer) throw new Error("runtime_backup_minio_container_missing");
const network = command("docker", ["inspect", "-f", "{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}", minioContainer]).trim();
if (!network) throw new Error("runtime_backup_minio_network_missing");
mkdirSync(join(target, "minio"), { recursive: true });
command("docker", [
  "run", "--rm", "--network", network, "-v", `${target.replace(/\\/g, "/")}:/backup`, "--entrypoint", "/bin/sh",
  "minio/mc:RELEASE.2024-11-21T17-21-54Z", "-c",
  "mc alias set source http://minio:9000 minio minio-password >/dev/null && mc mirror --overwrite source/support-communication-local /backup/minio"
]);

const files = listFiles(target).filter((path) => basename(path) !== "manifest.json");
const manifest = {
  createdAt: new Date().toISOString(),
  database: "support_communication",
  files: files.map((path) => ({
    path: path.slice(target.length + 1).replace(/\\/g, "/"),
    sha256: sha256(path),
    sizeBytes: statSync(path).size
  })),
  minioBucket: "support-communication-local",
  version: 1
};
writeFileSync(join(target, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Runtime backup completed: ${target}\nFiles: ${manifest.files.length}\n`);

function command(executable, args) {
  return execFileSync(executable, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
}

function pipeCommand(executable, args, destination) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { cwd: root, stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
    const output = createWriteStream(destination);
    child.stdout.pipe(output);
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? output.end(resolvePromise) : reject(new Error(`runtime_backup_command_failed:${code}`)));
  });
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
