import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, type ArgumentsHost } from "@nestjs/common";

import { EnvelopeHttpExceptionFilter } from "../apps/api-gateway/src/http-exception.filter.ts";

describe("HTTP exception envelope contracts", () => {
  it("converts an unknown exception to a safe 500 envelope with a trace id", () => {
    const result = createFilterHarness("/api/v1/realtime/events/stream?accessToken=operator-secret-token");
    const output: string[] = [];
    const originalWrite = process.stdout.write;
    process.stdout.write = ((chunk: string | Uint8Array) => {
      output.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;

    try {
      new EnvelopeHttpExceptionFilter().catch(
        new Error("database failed for accessToken=operator-secret-token"),
        result.host
      );
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.equal(result.statusCode, 500);
    assert.equal(result.body.status, "error");
    assert.equal(result.body.error.code, "internal_error");
    assert.equal(result.body.error.message, "Internal server error.");
    assert.match(String(result.body.traceId), /^trc_api_gateway_httpException_/);
    assert.doesNotMatch(JSON.stringify(result.body), /operator-secret-token/);
    assert.doesNotMatch(output.join(""), /operator-secret-token/);
    assert.match(output.join(""), /\[REDACTED:provider_token\]/);
  });

  it("preserves the existing 4xx envelope mapping for HttpException", () => {
    const result = createFilterHarness("/api/v1/example");

    new EnvelopeHttpExceptionFilter().catch(new BadRequestException("invalid payload"), result.host);

    assert.equal(result.statusCode, 400);
    assert.equal(result.body.status, "invalid");
    assert.equal(result.body.error.code, "http_exception");
    assert.equal(result.body.error.message, "invalid payload");
  });
});

function createFilterHarness(path: string): {
  body: Record<string, any>;
  host: ArgumentsHost;
  statusCode: number;
} {
  const result: {
    body: Record<string, any>;
    host: ArgumentsHost;
    statusCode: number;
  } = {
    body: {},
    host: {} as ArgumentsHost,
    statusCode: 0
  };

  const response = {
    status(statusCode: number) {
      result.statusCode = statusCode;
      return {
        json(body: Record<string, any>) {
          result.body = body;
        }
      };
    }
  };

  result.host = {
    switchToHttp() {
      return {
        getNext: () => undefined,
        getRequest: () => ({ method: "GET", originalUrl: path }),
        getResponse: () => response
      };
    }
  } as unknown as ArgumentsHost;

  return result;
}
