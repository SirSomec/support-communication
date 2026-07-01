import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { createEnvelope, type EnvelopeStatus } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId } from "@support-communication/observability";

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

@Catch(HttpException)
export class EnvelopeHttpExceptionFilter implements ExceptionFilter<HttpException> {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<HttpRequestLike>();
    const response = http.getResponse<HttpResponseLike>();
    const statusCode = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const errorMessage = getExceptionMessage(exceptionResponse, exception.message);

    response.status(statusCode).json(createEnvelope({
      service: "api-gateway",
      operation: "httpException",
      status: mapHttpStatus(statusCode),
      traceId: request.traceId ?? getCurrentTraceId() ?? createRequestTraceId("api-gateway", "httpException"),
      meta: {
        httpStatus: statusCode,
        method: request.method,
        path: request.originalUrl
      },
      data: {},
      error: {
        code: mapErrorCode(statusCode),
        message: errorMessage,
        details: typeof exceptionResponse === "object" ? exceptionResponse : undefined
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
