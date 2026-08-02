import { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
export declare class EnvelopeHttpExceptionFilter implements ExceptionFilter<unknown> {
    catch(exception: unknown, host: ArgumentsHost): void;
}
