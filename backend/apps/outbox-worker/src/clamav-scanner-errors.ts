export interface ClamAvScannerHttpError {
  code: string;
  status: number;
}

const PERMANENT_SCANNER_ERRORS: Record<string, number> = {
  file_id_required: 400,
  file_too_large: 413,
  request_too_large: 413,
  signed_file_expired: 410,
  signed_file_origin_denied: 403,
  signed_file_required: 400,
  signed_file_url_invalid: 400
};

export function classifyClamAvScannerError(error: unknown): ClamAvScannerHttpError {
  if (error instanceof SyntaxError) {
    return { code: "request_json_invalid", status: 400 };
  }

  const code = error instanceof Error ? error.message : "scan_failed";
  return {
    code,
    status: PERMANENT_SCANNER_ERRORS[code] ?? 503
  };
}
