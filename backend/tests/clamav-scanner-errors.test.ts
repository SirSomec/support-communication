import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyClamAvScannerError } from "../apps/outbox-worker/src/clamav-scanner-errors.ts";

describe("ClamAV scanner HTTP error classification", () => {
  it("returns permanent client statuses for invalid scan requests", () => {
    assert.deepEqual(classifyClamAvScannerError(new SyntaxError("bad json")), {
      code: "request_json_invalid",
      status: 400
    });
    assert.deepEqual(classifyClamAvScannerError(new Error("signed_file_required")), {
      code: "signed_file_required",
      status: 400
    });
    assert.deepEqual(classifyClamAvScannerError(new Error("signed_file_origin_denied")), {
      code: "signed_file_origin_denied",
      status: 403
    });
    assert.deepEqual(classifyClamAvScannerError(new Error("signed_file_expired")), {
      code: "signed_file_expired",
      status: 410
    });
    assert.deepEqual(classifyClamAvScannerError(new Error("file_too_large")), {
      code: "file_too_large",
      status: 413
    });
  });

  it("keeps scanner and download failures retryable", () => {
    assert.deepEqual(classifyClamAvScannerError(new Error("clamav_timeout")), {
      code: "clamav_timeout",
      status: 503
    });
  });
});
