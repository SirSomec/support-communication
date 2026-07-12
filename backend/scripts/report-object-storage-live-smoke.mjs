import { createHash } from "node:crypto";
import { createSharedReportObjectStorage } from "../apps/api-gateway/dist/reports/report-object-storage.js";

const mode = process.argv.includes("--read") ? "read" : process.argv.includes("--write") ? "write" : "roundtrip";
const tenantId = process.env.REPORT_OBJECT_STORAGE_SMOKE_TENANT_ID?.trim() || "pilot-client";
const jobId = process.env.REPORT_OBJECT_STORAGE_SMOKE_JOB_ID?.trim() || "minio-live-smoke";
const objectKey = `reports/${tenantId}/${jobId}/${jobId}.csv`;
const body = Buffer.from("name,value\r\nminio,works\r\n", "utf8");
const checksum = `sha256:${createHash("sha256").update(body).digest("hex")}`;
const storage = createSharedReportObjectStorage(process.env);

if (mode !== "read") {
  const written = await storage.putObject({
    body,
    contentType: "text/csv; charset=utf-8",
    metadata: { format: "csv", jobId, metricDefinitionVersion: "smoke-v1" },
    objectKey
  });
  if (written.checksum !== checksum || written.sizeBytes !== body.length) {
    throw new Error("report_object_storage_write_mismatch");
  }
}

if (mode !== "write") {
  const stored = await storage.getObject({ objectKey });
  if (!stored || !Buffer.from(stored.body).equals(body)) {
    throw new Error("report_object_storage_read_mismatch");
  }
}

console.log(JSON.stringify({ checksum, mode, objectKey, sizeBytes: body.length }));
