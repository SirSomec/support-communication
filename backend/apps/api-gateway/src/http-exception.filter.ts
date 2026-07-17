import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { createEnvelope, type EnvelopeStatus } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId, writeStructuredLog } from "@support-communication/observability";
import { redactSensitiveText } from "@support-communication/redaction";

interface HttpRequestLike {
  method?: string;
  originalUrl?: string;
  traceId?: string;
}

interface HttpResponseLike {
  status(statusCode: number): {
    json(body: unknown): void;
  };
}

@Catch()
export class EnvelopeHttpExceptionFilter implements ExceptionFilter<unknown> {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequestLike>();
    const response = http.getResponse<HttpResponseLike>();
    const httpException = exception instanceof HttpException ? exception : null;
    const statusCode = httpException?.getStatus() ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = httpException?.getResponse();
    const traceId = request.traceId ?? getCurrentTraceId() ?? createRequestTraceId("api-gateway", "httpException");
    const errorMessage = httpException
      ? getExceptionMessage(exceptionResponse ?? httpException.message, httpException.message)
      : "Internal server error.";

    if (!httpException) {
      writeStructuredLog("error", "Unhandled HTTP exception", {
        error: redactSensitiveText(exception instanceof Error ? exception.message : String(exception)),
        method: request.method,
        operation: "httpException",
        path: redactSensitiveText(String(request.originalUrl ?? "")),
        service: "api-gateway",
        traceId
      });
    }

    response.status(statusCode).json(createEnvelope({
      service: "api-gateway",
      operation: "httpException",
      status: mapHttpStatus(statusCode),
      traceId,
      meta: {
        httpStatus: statusCode,
        method: request.method,
        path: request.originalUrl
      },
      data: {},
      error: {
        code: httpException ? mapErrorCode(statusCode) : "internal_error",
        message: errorMessage,
        details: httpException && typeof exceptionResponse === "object" ? exceptionResponse : undefined
      }
    }));
  }
}

function getExceptionMessage(response: string | object, fallback: string): string {
  if (typeof response === "string") {
    return response;
  }

  if ("message" in response) {
    const message = response.message;

    if (Array.isArray(message)) {
      return message.join("; ");
    }

    if (typeof message === "string") {
      return message;
    }
  }

  return fallback;
}

function mapHttpStatus(statusCode: number): EnvelopeStatus {
  if (statusCode === HttpStatus.UNAUTHORIZED || statusCode === HttpStatus.FORBIDDEN) {
    return "denied";
  }

  if (statusCode === HttpStatus.NOT_FOUND) {
    return "not_found";
  }

  if (statusCode === HttpStatus.CONFLICT) {
    return "conflict";
  }

  if (statusCode === HttpStatus.TOO_MANY_REQUESTS) {
    return "rate_limited";
  }

  if (statusCode >= 400 && statusCode < 500) {
    return "invalid";
  }

  return "error";
}

function mapErrorCode(statusCode: number): string {
  if (statusCode === HttpStatus.UNAUTHORIZED) {
    return "unauthorized";
  }

  if (statusCode === HttpStatus.FORBIDDEN) {
    return "forbidden";
  }

  if (statusCode === HttpStatus.NOT_FOUND) {
    return "not_found";
  }

  if (statusCode === HttpStatus.TOO_MANY_REQUESTS) {
    return "rate_limited";
  }

  return "http_exception";
}
