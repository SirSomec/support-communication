const localDatabaseHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1", "postgres"]);

function fail(message) {
  process.stderr.write(`Release database preflight failed: ${message}\n`);
  process.exit(1);
}

const rawDatabaseUrl = process.env.DATABASE_URL?.trim();
if (!rawDatabaseUrl) {
  fail("DATABASE_URL is required.");
}

let databaseUrl;
try {
  databaseUrl = new URL(rawDatabaseUrl);
} catch {
  fail("DATABASE_URL must be a valid PostgreSQL URL.");
}

if (!new Set(["postgres:", "postgresql:"]).has(databaseUrl.protocol)) {
  fail("DATABASE_URL must use the postgres or postgresql protocol.");
}

if (!databaseUrl.hostname) {
  fail("DATABASE_URL must include a database host.");
}

const databaseName = decodeURIComponent(databaseUrl.pathname.replace(/^\//, ""));
if (!databaseName) {
  fail("DATABASE_URL must include a database name.");
}

const isLocalDatabase = localDatabaseHosts.has(databaseUrl.hostname.toLowerCase());
const targetEnvironment = process.env.RELEASE_TARGET_ENVIRONMENT?.trim();

if (!isLocalDatabase) {
  if (process.env.RELEASE_ALLOW_REMOTE_DATABASE !== "true") {
    fail(
      `remote host ${databaseUrl.hostname} is blocked; set RELEASE_ALLOW_REMOTE_DATABASE=true and RELEASE_TARGET_ENVIRONMENT explicitly to proceed.`
    );
  }
  if (!targetEnvironment) {
    fail("RELEASE_TARGET_ENVIRONMENT is required when a remote database is explicitly allowed.");
  }
}

const port = databaseUrl.port || "5432";
const environmentLabel = targetEnvironment || "local";
process.stdout.write(
  `Release database preflight passed: environment=${environmentLabel} host=${databaseUrl.hostname} port=${port} database=${databaseName}.\n`
);
