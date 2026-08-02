var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import { createEnvelope } from "@support-communication/envelope";
import { createRequestTraceId, getCurrentTraceId, writeStructuredLog } from "@support-communication/observability";
import { redactSensitiveText } from "@support-communication/redaction";
let EnvelopeHttpExceptionFilter = class EnvelopeHttpExceptionFilter {
    catch(exception, host) {
        const http = host.switchToHttp();
        const request = http.getRequest();
        const response = http.getResponse();
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
};
EnvelopeHttpExceptionFilter = __decorate([
    Catch()
], EnvelopeHttpExceptionFilter);
export { EnvelopeHttpExceptionFilter };
function getExceptionMessage(response, fallback) {
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
function mapHttpStatus(statusCode) {
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
function mapErrorCode(statusCode) {
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
//# sourceMappingURL=http-exception.filter.js.map